/**
 * Puente document-probe → artefactos de runBrandKitIngest (slots).
 */

import sharp from "sharp";
import { parseBrainDocument } from "@/lib/brain-parser-utils";
import { renderPdfPagesAt } from "@/lib/brain/pdf-page-render";
import type { BBoxPage } from "@/lib/brandkit/logo-intake/bbox";
import type { Candidate, GalleryValue, LogoValue, Provenance } from "../brand-kit-types";
import type { BrandKitDocumentProbeContext } from "../llm/brand-kit-llm-synthesis";
import { extractTypographyFromPdf } from "../extractors/typography";
import { bufferContentSha256 } from "../ingest/paid-operations-server";
import { buildIngestLogoCandidateFromBBox } from "../ingest/ingest-logo-crop";
import { persistBrandKitSourcePdf, persistBrandKitSourceRaster } from "../ingest/brand-kit-source-pdf-store";
import { uploadBrandKitIngestFile } from "../ingest/upload-brand-kit-file";
import { estimateGeminiUsd } from "@/lib/pricing-config";
import { runBrandKitDocumentProbe } from "./document-probe";
import type {
  BrandKitDocumentProbeLogo,
  BrandKitDocumentProbeOtherImage,
  BrandKitDocumentProbeResult,
  BrandKitDocumentProbeTypography,
} from "./document-probe-types";

export function buildDocumentProbeContext(probe: BrandKitDocumentProbeResult): BrandKitDocumentProbeContext {
  return {
    textSummary: probe.textSummary.filter((line) => line.trim()),
    primaryColors: probe.primaryColors.map((color) => ({
      hex: color.hex,
      label: color.label,
    })),
    typography: probe.typography.map((row) => ({
      family: row.family,
      role: row.role,
    })),
    imageInventory: probe.otherImages.slice(0, PROBE_GALLERY_TOP_N).map((image) => ({
      description: image.description,
      page: image.page,
    })),
  };
}

export type DocumentProbeIngestArtifacts = {
  probe: BrandKitDocumentProbeResult;
  probeContext: BrandKitDocumentProbeContext;
  logoCandidates: Candidate<LogoValue>[];
  paletteSignals: Array<{ hex: string; provenance: Provenance; weight?: number }>;
  typographyFamilies: string[];
  galleryItems: GalleryValue["harvested"];
  corpusParts: string[];
  sourceMeta?: {
    contentSha256: string;
    pdfStorageKey: string;
    pageCount: number;
  };
  brandNameHint?: string;
};

export const PROBE_GALLERY_TOP_N = 10;
const LOGO_RENDER_DPI = 144;
const GALLERY_CROP_MAX_EDGE = 480;

function fileProvenance(fileId: string, detail: string): Provenance {
  return { type: "file_upload", detail, fileId };
}

function logoProvenance(fileName: string, pageNumber: number | null, contentSha256: string): Provenance {
  return {
    type: "pdf_xobject",
    detail: pageNumber ? `document probe · pág. ${pageNumber}` : "document probe · imagen",
    fileId: contentSha256,
    sourceUrl: fileName,
  };
}

function normLogoToBBoxPage(logo: Pick<BrandKitDocumentProbeLogo, "x" | "y" | "width" | "height">): BBoxPage {
  return [logo.x, logo.y, logo.x + logo.width, logo.y + logo.height];
}

function mergeTypographyFamilies(
  probeTypography: BrandKitDocumentProbeTypography[],
  pdfFamilies: string[],
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const row of probeTypography) {
    if (typeof row.family !== "string") continue;
    const key = row.family.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(row.family.trim());
  }
  for (const family of pdfFamilies) {
    if (typeof family !== "string") continue;
    const key = family.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(family.trim());
  }
  return merged;
}

type PageRaster = { png: Buffer; width: number; height: number };

async function loadPageRaster(input: {
  buffer: Buffer;
  pageNumber: number | null;
  isPdf: boolean;
  cache: Map<string, PageRaster>;
  fileBuffer: Buffer;
}): Promise<PageRaster | null> {
  const cacheKey = input.pageNumber == null ? "image" : `page-${input.pageNumber}`;
  const cached = input.cache.get(cacheKey);
  if (cached) return cached;

  if (input.isPdf && input.pageNumber != null) {
    const rendered = await renderPdfPagesAt(input.fileBuffer, [input.pageNumber], { dpi: LOGO_RENDER_DPI });
    const page = rendered[0];
    if (!page) return null;
    const raster: PageRaster = {
      png: page.pngBuffer,
      width: page.width,
      height: page.height,
    };
    input.cache.set(cacheKey, raster);
    return raster;
  }

  try {
    const png = await sharp(input.fileBuffer).png().toBuffer();
    const meta = await sharp(png).metadata();
    const raster: PageRaster = {
      png,
      width: meta.width ?? 1,
      height: meta.height ?? 1,
    };
    input.cache.set(cacheKey, raster);
    return raster;
  } catch {
    return null;
  }
}

async function buildLogoCandidatesFromProbe(input: {
  probe: BrandKitDocumentProbeResult;
  buffer: Buffer;
  fileName: string;
  userEmail: string;
  contentSha256: string;
  isPdf: boolean;
  totalPages: number;
}): Promise<Candidate<LogoValue>[]> {
  const logos = input.probe.logos.length
    ? input.probe.logos
    : input.probe.primaryLogo
      ? [input.probe.primaryLogo]
      : [];
  if (!logos.length) return [];

  const cache = new Map<string, PageRaster>();
  const candidates: Candidate<LogoValue>[] = [];

  for (let index = 0; index < logos.length; index += 1) {
    const logo = logos[index]!;
    const pageNumber = logo.page;
    const raster = await loadPageRaster({
      buffer: input.buffer,
      fileBuffer: input.buffer,
      pageNumber,
      isPdf: input.isPdf,
      cache,
    });
    if (!raster) continue;

    const baseScore = logo.isPrimary
      ? Math.max(0.84, logo.legibility)
      : Math.max(0.62, logo.legibility - 0.08 - index * 0.03);

    const candidate = await buildIngestLogoCandidateFromBBox({
      pagePng: raster.png,
      pageWidth: raster.width,
      pageHeight: raster.height,
      bboxPage: normLogoToBBoxPage(logo),
      userEmail: input.userEmail,
      filenameStem: `${input.fileName.replace(/\.[^.]+$/, "").slice(0, 36)}-probe-logo-p${pageNumber ?? 1}`,
      provenance: logoProvenance(input.fileName, pageNumber, input.contentSha256),
      fileName: input.fileName,
      contentSha256: input.contentSha256,
      sourcePageNumber: pageNumber ?? 1,
      totalDocPages: input.totalPages,
      baseScore,
      index,
      detectionMethod: "vision_bbox",
      qualityMeta: {
        isComplete: logo.legibility >= 0.55,
        confidence: logo.legibility,
      },
    });
    if (candidate) candidates.push(candidate);
  }

  return candidates.sort((a, b) => b.score - a.score);
}

async function uploadGalleryCrop(input: {
  jpegBase64: string;
  bbox: Pick<BrandKitDocumentProbeOtherImage, "x" | "y" | "width" | "height">;
  userEmail: string;
  fileName: string;
  description: string;
  page: number | null;
  index: number;
}): Promise<GalleryValue["harvested"][number] | null> {
  const pageBuffer = Buffer.from(input.jpegBase64, "base64");
  const meta = await sharp(pageBuffer).metadata();
  const iw = meta.width ?? 1;
  const ih = meta.height ?? 1;
  const left = Math.max(0, Math.floor(input.bbox.x * iw));
  const top = Math.max(0, Math.floor(input.bbox.y * ih));
  const width = Math.max(1, Math.min(iw - left, Math.ceil(input.bbox.width * iw)));
  const height = Math.max(1, Math.min(ih - top, Math.ceil(input.bbox.height * ih)));

  const png = await sharp(pageBuffer)
    .extract({ left, top, width, height })
    .resize({
      width: GALLERY_CROP_MAX_EDGE,
      height: GALLERY_CROP_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();

  const uploaded = await uploadBrandKitIngestFile({
    userEmail: input.userEmail,
    filename: `${input.fileName.replace(/\.[^.]+$/, "").slice(0, 28)}-probe-img-${input.index + 1}.png`,
    mime: "image/png",
    buffer: png,
  });

  return {
    assetId: uploaded.url,
    previewUrl: uploaded.url,
    included: true,
    provenance: fileProvenance(uploaded.fileId, input.description.slice(0, 120)),
    rankScore: 0.9 - input.index * 0.04,
    rankSignals: [
      input.page ? `pág. ${input.page}` : "imagen",
      "document probe",
      input.description.slice(0, 80),
    ],
  };
}

async function resolveProbePageJpeg(input: {
  probe: BrandKitDocumentProbeResult;
  buffer: Buffer;
  page: number | null;
  isPdf: boolean;
  cache: Map<string, string>;
}): Promise<string | null> {
  const cacheKey = input.page == null ? "image" : `page-${input.page}`;
  const cached = input.cache.get(cacheKey);
  if (cached) return cached;

  const fromPreview = input.probe.pagePreviews.find((row) => row.pageNumber === input.page)?.jpegBase64;
  if (fromPreview) {
    input.cache.set(cacheKey, fromPreview);
    return fromPreview;
  }

  if (input.isPdf && input.page != null) {
    const rendered = await renderPdfPagesAt(input.buffer, [input.page], { dpi: 96 });
    const page = rendered[0];
    if (!page) return null;
    const jpeg = await sharp(page.pngBuffer)
      .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 65 })
      .toBuffer();
    const base64 = jpeg.toString("base64");
    input.cache.set(cacheKey, base64);
    return base64;
  }

  const single = input.probe.pagePreviews.find((row) => row.pageNumber === null)?.jpegBase64 ?? null;
  if (single) input.cache.set(cacheKey, single);
  return single;
}

async function buildGalleryItemsFromProbe(input: {
  probe: BrandKitDocumentProbeResult;
  buffer: Buffer;
  isPdf: boolean;
  userEmail: string;
  fileName: string;
}): Promise<GalleryValue["harvested"]> {
  const jpegCache = new Map<string, string>();
  const topImages = input.probe.otherImages.slice(0, PROBE_GALLERY_TOP_N);
  const items: GalleryValue["harvested"] = [];

  for (let index = 0; index < topImages.length; index += 1) {
    const image = topImages[index]!;
    const jpeg = await resolveProbePageJpeg({
      probe: input.probe,
      buffer: input.buffer,
      page: image.page,
      isPdf: input.isPdf,
      cache: jpegCache,
    });
    if (!jpeg) continue;
    const item = await uploadGalleryCrop({
      jpegBase64: jpeg,
      bbox: image,
      userEmail: input.userEmail,
      fileName: input.fileName,
      description: image.description,
      page: image.page,
      index,
    });
    if (item) items.push(item);
  }

  return items;
}

function reportProbeLlmCost(
  probe: BrandKitDocumentProbeResult,
  onLlmCostUsd?: (cost: number) => void,
): void {
  if (!onLlmCostUsd) return;
  const perCall = estimateGeminiUsd(probe.model, 4200, 900);
  onLlmCostUsd(perCall * probe.llmCallCount);
}

export async function extractBrandMaterialViaDocumentProbe(input: {
  buffer: Buffer;
  fileName: string;
  mime: string;
  userEmail: string;
  route: string;
  onLlmCostUsd?: (cost: number) => void;
}): Promise<DocumentProbeIngestArtifacts> {
  const probe = await runBrandKitDocumentProbe({
    buffer: input.buffer,
    fileName: input.fileName,
    mime: input.mime,
  });
  reportProbeLlmCost(probe, input.onLlmCostUsd);

  const contentSha256 = bufferContentSha256(input.buffer);
  const isPdf = input.mime === "application/pdf" || input.fileName.toLowerCase().endsWith(".pdf");
  const totalPages = probe.pdfTotalPages ?? 1;

  let sourceMeta: DocumentProbeIngestArtifacts["sourceMeta"];
  if (isPdf && input.userEmail) {
    const pdfStorageKey = await persistBrandKitSourcePdf(input.userEmail, contentSha256, input.buffer);
    sourceMeta = { contentSha256, pdfStorageKey, pageCount: totalPages };
  } else if (input.userEmail) {
    await persistBrandKitSourceRaster(input.userEmail, contentSha256, input.buffer).catch(() => undefined);
  }

  const logoCandidates = await buildLogoCandidatesFromProbe({
    probe,
    buffer: input.buffer,
    fileName: input.fileName,
    userEmail: input.userEmail,
    contentSha256,
    isPdf,
    totalPages,
  });

  const provenance = fileProvenance(contentSha256, "document probe");
  const paletteSignals = probe.primaryColors.map((color) => ({
    hex: color.hex,
    provenance,
    weight: 0.92,
    varName: color.label ?? undefined,
  }));

  let pdfFontFamilies: string[] = [];
  if (isPdf) {
    const typography = await extractTypographyFromPdf(input.buffer, {
      maxPages: Math.min(30, totalPages),
    }).catch(() => null);
    if (typography) {
      pdfFontFamilies = [
        ...typography.primary.map((row) => row.value.family),
        ...typography.secondary.map((row) => row.value.family),
      ].filter((family): family is string => typeof family === "string" && family.trim().length > 0);
    }
  }

  const typographyFamilies = mergeTypographyFamilies(probe.typography, pdfFontFamilies);

  const galleryItems = await buildGalleryItemsFromProbe({
    probe,
    buffer: input.buffer,
    isPdf,
    userEmail: input.userEmail,
    fileName: input.fileName,
  });

  let corpusParts: string[] = [];
  try {
    const text = await parseBrainDocument(input.buffer, input.fileName, input.mime || "application/octet-stream");
    const trimmed = text.trim();
    if (trimmed.length >= 40) corpusParts.push(trimmed.slice(0, 12_000));
    if (probe.textSummary.some((line) => line.trim())) {
      corpusParts.push(probe.textSummary.filter(Boolean).join("\n"));
    }
  } catch {
    if (probe.textSummary.some((line) => line.trim())) {
      corpusParts.push(probe.textSummary.filter(Boolean).join("\n"));
    }
  }

  const brandNameHint =
    probe.logos.find((logo) => logo.isPrimary)?.label ??
    probe.logos[0]?.label ??
    undefined;

  return {
    probe,
    probeContext: buildDocumentProbeContext(probe),
    logoCandidates,
    paletteSignals,
    typographyFamilies,
    galleryItems,
    corpusParts,
    sourceMeta,
    brandNameHint,
  };
}
