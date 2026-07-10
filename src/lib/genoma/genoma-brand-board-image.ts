import sharp from "sharp";
import { extractTechnicalImageFeatures } from "@/lib/brain/brand-visual-dna/technical-features";
import type { Candidate, LogoValue, Provenance } from "./genoma-types";
import { bufferContentSha256 } from "./ingest/paid-operations-server";
import { persistGenomaSourceRaster } from "./ingest/genoma-source-pdf-store";
import { box2dToBBoxPage } from "./logo-intake/bbox";
import { invokeBrandBoardVision, invokeBrandBoardLogoFocusVision } from "./genoma-brand-board-vision";
import type { BrandBoardVisionResult } from "./genoma-brand-board-vision-schema";
import { uploadGenomaIngestFile } from "./ingest/upload-genoma-file";
import { buildBrandBoardLogoFallbackCandidates } from "./genoma-brand-board-logo-fallback";
import { buildIngestLogoCandidateFromBBox } from "./ingest/ingest-logo-crop";
import { ensureHeuristicLogoCandidates } from "./ingest/ingest-logo-heuristic";
import type { BrandBoardImageSignals } from "./genoma-brand-board-image-detect";

export { isBrandBoardFilename, isLikelyBrandBoardImage } from "./genoma-brand-board-image-detect";

const VISION_MAX_LONG_EDGE = 2048;

const PALETTE_ROLE_WEIGHT: Record<string, number> = {
  primary: 0.94,
  secondary: 0.88,
  accent: 0.84,
  background: 0.78,
  text: 0.72,
  neutral: 0.68,
  unknown: 0.76,
};

function fileProvenance(fileId: string, detail: string): Provenance {
  return { type: "file_upload", detail, fileId };
}

async function prepareVisionPng(buffer: Buffer): Promise<{ png: Buffer; width: number; height: number }> {
  const image = sharp(buffer, { failOn: "none" }).rotate();
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const longEdge = Math.max(width, height);
  const resized =
    longEdge > VISION_MAX_LONG_EDGE
      ? image.resize({
          width: width >= height ? VISION_MAX_LONG_EDGE : undefined,
          height: height > width ? VISION_MAX_LONG_EDGE : undefined,
          fit: "inside",
          withoutEnlargement: true,
        })
      : image;
  const png = await resized.png().toBuffer();
  const outMeta = await sharp(png).metadata();
  return {
    png,
    width: outMeta.width ?? width,
    height: outMeta.height ?? height,
  };
}

function paletteSignalsFromBrandBoardVision(
  vision: BrandBoardVisionResult,
  fileName: string,
  contentSha256: string,
): BrandBoardVisualExtractResult["paletteSignals"] {
  const seen = new Set<string>();
  const out: BrandBoardVisualExtractResult["paletteSignals"] = [];
  for (const swatch of vision.palette) {
    const hex = swatch.hex.toLowerCase();
    if (seen.has(hex)) continue;
    seen.add(hex);
    const label = swatch.name ? `${swatch.name} · ${swatch.role}` : swatch.role;
    out.push({
      hex,
      provenance: fileProvenance(contentSha256, `visión brand board · ${label} · ${fileName}`),
      weight: PALETTE_ROLE_WEIGHT[swatch.role] ?? 0.8,
    });
  }
  return out;
}

function typographyFamiliesFromBrandBoardVision(vision: BrandBoardVisionResult): string[] {
  const families: string[] = [];
  const seen = new Set<string>();
  for (const entry of vision.typography) {
    const family = entry.family.trim();
    const key = family.toLowerCase();
    if (!family || seen.has(key)) continue;
    seen.add(key);
    families.push(family);
  }
  return families;
}

function logoScore(logo: BrandBoardVisionResult["logos"][number], index: number): number {
  let score = logo.confidence;
  if (logo.is_primary) score += 0.1;
  if (logo.is_complete) score += 0.06;
  if (logo.variant === "full") score += 0.03;
  return Math.min(0.96, Math.max(0.55, score - index * 0.03));
}

function selectBrandBoardLogosForCrop(vision: BrandBoardVisionResult): BrandBoardVisionResult["logos"] {
  const logos = [...vision.logos];
  const primary = logos.find((logo) => logo.is_primary && logo.is_complete);
  if (primary) {
    return [
      primary,
      ...logos.filter(
        (logo) =>
          logo !== primary &&
          logo.is_complete &&
          logo.confidence >= 0.62 &&
          !/wireframe|construc|grid|blueprint/i.test(logo.context ?? ""),
      ),
    ].slice(0, 4);
  }

  return logos
    .filter((logo) => logo.is_complete || logo.confidence >= 0.72)
    .slice(0, 4);
}

async function finalizeBrandBoardLogoCandidates(
  candidates: Candidate<LogoValue>[],
  prepared: { png: Buffer; width: number; height: number },
  meta: { fileName: string; contentSha256: string; userEmail: string },
): Promise<Candidate<LogoValue>[]> {
  return ensureHeuristicLogoCandidates(candidates, {
    pagePng: prepared.png,
    pageWidth: prepared.width,
    pageHeight: prepared.height,
    fileName: meta.fileName,
    contentSha256: meta.contentSha256,
    userEmail: meta.userEmail,
    sourcePageNumber: 1,
    totalDocPages: 1,
    limit: 2,
  });
}

async function buildLogoCandidatesFromBrandBoardVision(input: {
  vision: BrandBoardVisionResult;
  pngBuffer: Buffer;
  width: number;
  height: number;
  fileName: string;
  contentSha256: string;
  userEmail: string;
}): Promise<Candidate<LogoValue>[]> {
  const out: Candidate<LogoValue>[] = [];
  const logos = selectBrandBoardLogosForCrop(input.vision);
  const stem = input.fileName.replace(/\.[^.]+$/, "").slice(0, 28);

  for (let index = 0; index < logos.length; index += 1) {
    const logo = logos[index]!;
    const bboxPageRaw = box2dToBBoxPage(logo.box_2d);
    if (!bboxPageRaw) continue;

    const qualityMeta = {
      isComplete: logo.is_complete,
      cutEdges: !logo.is_complete,
      confidence: logo.confidence,
    };

    const candidate =
      (await buildIngestLogoCandidateFromBBox({
        pagePng: input.pngBuffer,
        pageWidth: input.width,
        pageHeight: input.height,
        bboxPage: bboxPageRaw,
        padding: logo.is_primary ? 0.05 : 0.03,
        trim: true,
        userEmail: input.userEmail,
        filenameStem: `${stem}-logo-${index + 1}`,
        provenance: fileProvenance(
          input.contentSha256,
          `visión brand board · ${logo.is_primary ? "logo principal" : "variante"}${logo.context ? ` · ${logo.context}` : ""}`,
        ),
        fileName: input.fileName,
        contentSha256: input.contentSha256,
        sourcePageNumber: 1,
        totalDocPages: 1,
        baseScore: logoScore(logo, index),
        index,
        background: "transparent",
        qualityMeta,
      })) ??
      (await buildIngestLogoCandidateFromBBox({
        pagePng: input.pngBuffer,
        pageWidth: input.width,
        pageHeight: input.height,
        bboxPage: bboxPageRaw,
        padding: 0,
        trim: true,
        userEmail: input.userEmail,
        filenameStem: `${stem}-logo-${index + 1}`,
        provenance: fileProvenance(
          input.contentSha256,
          `visión brand board · ${logo.is_primary ? "logo principal" : "variante"}`,
        ),
        fileName: input.fileName,
        contentSha256: input.contentSha256,
        sourcePageNumber: 1,
        totalDocPages: 1,
        baseScore: logoScore(logo, index) - 0.04,
        index,
        background: "transparent",
        qualityMeta,
      }));

    if (candidate) out.push(candidate);
  }

  return out;
}

export type BrandBoardVisualExtractResult = {
  logoCandidates: Candidate<LogoValue>[];
  paletteSignals: { hex: string; provenance: Provenance; weight?: number }[];
  typographyFamilies: string[];
  brandName?: string;
  contentSha256: string;
  visionDetail?: string;
  uploadedUrl: string;
  uploadedFileId: string;
  /** Segunda visión Gemini (refuerzo logo), solo si allowLogoFocusVision y quedó reservada en wallet. */
  logoFocusVisionUsed?: boolean;
};

export async function measureBrandBoardSignals(buffer: Buffer): Promise<BrandBoardImageSignals> {
  const meta = await sharp(buffer, { failOn: "none" }).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const features = await extractTechnicalImageFeatures(bufferContentSha256(buffer), buffer);
  return {
    width,
    height,
    area: width * height,
    textPresenceScore: features.text_presence_score_0_1,
    visualDensityScore: features.visual_density_0_1,
  };
}

export function paletteSignalsFromImageQuantize(
  colors: string[],
  fileName: string,
  contentSha256: string,
  existingHex = new Set<string>(),
): BrandBoardVisualExtractResult["paletteSignals"] {
  return colors
    .filter((hex) => /^#[0-9a-fA-F]{6}$/.test(hex))
    .map((hex) => hex.toLowerCase())
    .filter((hex) => !existingHex.has(hex))
    .slice(0, 8)
    .map((hex, index) => ({
      hex,
      provenance: fileProvenance(contentSha256, `cuantización · ${fileName}`),
      weight: Math.max(0.45, 0.72 - index * 0.06),
    }));
}

export async function extractBrandBoardVisualsFromImage(input: {
  buffer: Buffer;
  fileName: string;
  mime: string;
  userEmail: string;
  route?: string;
  visionEnabled?: boolean;
  /** Requiere preflight/wallet con línea brand_board_logo_focus. Sin esto no hay segunda llamada de pago. */
  allowLogoFocusVision?: boolean;
}): Promise<BrandBoardVisualExtractResult> {
  const contentSha256 = bufferContentSha256(input.buffer);
  if (input.userEmail) {
    await persistGenomaSourceRaster(input.userEmail, contentSha256, input.buffer).catch(() => undefined);
  }
  const uploaded = await uploadGenomaIngestFile({
    userEmail: input.userEmail,
    filename: input.fileName,
    mime: input.mime || "image/png",
    buffer: input.buffer,
  });

  const features = await extractTechnicalImageFeatures(contentSha256, input.buffer);
  const paletteSignals: BrandBoardVisualExtractResult["paletteSignals"] = paletteSignalsFromImageQuantize(
    features.dominant_colors,
    input.fileName,
    contentSha256,
  );
  const typographyFamilies: string[] = [];
  const logoCandidates: Candidate<LogoValue>[] = [];
  let logoFocusVisionUsed = false;

  if (!input.visionEnabled) {
    const prepared = await prepareVisionPng(input.buffer);
    const fallback = await buildBrandBoardLogoFallbackCandidates({
      pngBuffer: prepared.png,
      width: prepared.width,
      height: prepared.height,
      fileName: input.fileName,
      contentSha256,
      userEmail: input.userEmail,
      limit: 1,
    });
    logoCandidates.push(...fallback);

    const finalized = await finalizeBrandBoardLogoCandidates(logoCandidates, prepared, {
      fileName: input.fileName,
      contentSha256,
      userEmail: input.userEmail,
    });

    return {
      logoCandidates: finalized,
      paletteSignals,
      typographyFamilies,
      contentSha256,
      visionDetail:
        finalized.length > 0
          ? `${finalized.length} logo (heurística) · ${paletteSignals.length} colores (sin IA)`
          : `${paletteSignals.length} colores (sin IA)`,
      uploadedUrl: uploaded.url,
      uploadedFileId: uploaded.fileId,
      logoFocusVisionUsed: false,
    };
  }

  const prepared = await prepareVisionPng(input.buffer);

  // Primera llamada Gemini (línea brand_board del preflight).
  const visionCall = await invokeBrandBoardVision({
    pngBase64: prepared.png.toString("base64"),
    fileName: input.fileName,
    contentSha256,
    userEmail: input.userEmail,
    route: input.route,
  });

  if (visionCall.result) {
    const visionPalette = paletteSignalsFromBrandBoardVision(visionCall.result, input.fileName, contentSha256);
    const visionHex = new Set(visionPalette.map((entry) => entry.hex));
    paletteSignals.length = 0;
    paletteSignals.push(...visionPalette);
    paletteSignals.push(
      ...paletteSignalsFromImageQuantize(features.dominant_colors, input.fileName, contentSha256, visionHex),
    );

    typographyFamilies.push(...typographyFamiliesFromBrandBoardVision(visionCall.result));

    logoCandidates.push(
      ...(await buildLogoCandidatesFromBrandBoardVision({
        vision: visionCall.result,
        pngBuffer: prepared.png,
        width: prepared.width,
        height: prepared.height,
        fileName: input.fileName,
        contentSha256,
        userEmail: input.userEmail,
      })),
    );

    if (!logoCandidates.length && input.allowLogoFocusVision) {
      const focusCall = await invokeBrandBoardLogoFocusVision({
        pngBase64: prepared.png.toString("base64"),
        fileName: input.fileName,
        contentSha256,
        userEmail: input.userEmail,
        route: input.route,
      });
      if (focusCall.result) {
        logoFocusVisionUsed = true;
        logoCandidates.push(
          ...(await buildLogoCandidatesFromBrandBoardVision({
            vision: focusCall.result,
            pngBuffer: prepared.png,
            width: prepared.width,
            height: prepared.height,
            fileName: input.fileName,
            contentSha256,
            userEmail: input.userEmail,
          })),
        );
      }
    }

    if (!logoCandidates.length) {
      logoCandidates.push(
        ...(await buildBrandBoardLogoFallbackCandidates({
          pngBuffer: prepared.png,
          width: prepared.width,
          height: prepared.height,
          fileName: input.fileName,
          contentSha256,
          userEmail: input.userEmail,
          limit: 2,
        })),
      );
    }

    const brandName = visionCall.result.brandName;
    const finalized = await finalizeBrandBoardLogoCandidates(logoCandidates, prepared, {
      fileName: input.fileName,
      contentSha256,
      userEmail: input.userEmail,
    });
    const fallbackNote = finalized.some((c) => c.provenance.detail.includes("heurística"))
      ? " · fallback heurístico"
      : "";
    const focusNote = logoFocusVisionUsed ? " · refuerzo logo IA" : "";
    const detail = visionCall.error
      ? `IA parcial · ${finalized.length} logos · ${paletteSignals.length} colores · ${typographyFamilies.length} fuentes${fallbackNote}${focusNote}`
      : `${finalized.length} logos · ${paletteSignals.length} colores · ${typographyFamilies.length} fuentes · IA brand board${fallbackNote}${focusNote}`;

    return {
      logoCandidates: finalized,
      paletteSignals,
      typographyFamilies,
      brandName,
      contentSha256,
      visionDetail: detail,
      uploadedUrl: uploaded.url,
      uploadedFileId: uploaded.fileId,
      logoFocusVisionUsed,
    };
  }

  logoCandidates.push(
    ...(await buildBrandBoardLogoFallbackCandidates({
      pngBuffer: prepared.png,
      width: prepared.width,
      height: prepared.height,
      fileName: input.fileName,
      contentSha256,
      userEmail: input.userEmail,
      limit: 2,
    })),
  );

  const finalized = await finalizeBrandBoardLogoCandidates(logoCandidates, prepared, {
    fileName: input.fileName,
    contentSha256,
    userEmail: input.userEmail,
  });

  return {
    logoCandidates: finalized,
    paletteSignals,
    typographyFamilies,
    contentSha256,
    visionDetail: visionCall.error
      ? `Visión IA falló (${visionCall.error}) · ${finalized.length} logos · ${paletteSignals.length} colores`
      : `${finalized.length} logos · ${paletteSignals.length} colores (visión sin resultado)`,
    uploadedUrl: uploaded.url,
    uploadedFileId: uploaded.fileId,
    logoFocusVisionUsed: false,
  };
}
