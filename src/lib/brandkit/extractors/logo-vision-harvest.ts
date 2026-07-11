/**
 * Cosecha de logo guiada por visión — bbox + polaridad del pase unificado.
 */

import sharp from "sharp";
import {
  classifyRegionPolarity,
  computeLogoPHash,
  isolateLogoWithKeying,
  LOGO_HIGH_RES_DPI,
  synthesizeLogoPolarityVariant,
} from "@/lib/brain/pdf-logo-pipeline";
import {
  clampPixelBBox,
  PDF_PAGE_RENDER_DEFAULT_DPI,
  renderPdfPageCrop,
  type PixelBBox,
  type RenderedPdfPage,
} from "@/lib/brain/pdf-page-render";
import type { BrandBehaviorScore } from "./brand-behavior";
import { measureLogoNess, visualTiebreakScore } from "./logo-ness";
import { splitRasterLogoByComponents } from "./logo-component-split";
import type { ScoredBrandKitLogoHarvest } from "./logo-harvest-types";
import type { BrandKitVisionLogoHint } from "../ingest/pdf-vision-types";
import { logLogoBboxRejected, logLogoIsolationPath } from "../ingest/brand-kit-vision-debug";
import {
  buildVisionLogoBboxAttempts,
  mapCropOpaqueBoundsToPageBBox,
  measureOpaquePixelBounds,
  measureOpaquePixelPct,
  trimRgbaToOpaqueBounds,
  VISION_LOGO_MIN_PIXELS_KEPT_PCT,
  writeVisionLogoDebugCrop,
  writeVisionLogoDebugIsolated,
} from "../ingest/vision-logo-bbox";

function visionBrandBehavior(): BrandBehaviorScore {
  return {
    total: 0.93,
    invariance: 0.88,
    structuralPosition: 0.96,
    interDocument: 0.72,
    scaleSubordination: 0.82,
  };
}

function scalePixelBBox(bbox: PixelBBox, scale: number): PixelBBox {
  return {
    x: Math.round(bbox.x * scale),
    y: Math.round(bbox.y * scale),
    width: Math.round(bbox.width * scale),
    height: Math.round(bbox.height * scale),
  };
}

async function refineLogoCropFromIsolation(
  pdfBuffer: Buffer,
  page: RenderedPdfPage,
  pagePixelBBox: PixelBBox,
  hiResCrop: Buffer,
  polarity: BrandKitVisionLogoHint["polarity"],
): Promise<{ rgba: Buffer; pagePixelBBox: PixelBBox; refinedHiResCrop: Buffer } | null> {
  const scale = LOGO_HIGH_RES_DPI / PDF_PAGE_RENDER_DEFAULT_DPI;
  const probe = await isolateLogoWithKeying(hiResCrop, polarity);
  const probeMeta = await sharp(probe).metadata();
  const cropW = probeMeta.width ?? 1;
  const cropH = probeMeta.height ?? 1;
  const { data } = await sharp(probe).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bounds = measureOpaquePixelBounds(data, cropW, cropH);
  if (!bounds) return null;

  const refinedPageBBox = mapCropOpaqueBoundsToPageBBox(
    page.width,
    page.height,
    pagePixelBBox,
    cropW,
    cropH,
    bounds,
  );
  const refinedHiResCrop = await renderPdfPageCrop(
    pdfBuffer,
    page.pageNumber,
    scalePixelBBox(refinedPageBBox, scale),
    LOGO_HIGH_RES_DPI,
  );

  let rgba = await isolateLogoWithKeying(refinedHiResCrop, polarity);
  rgba = await trimRgbaToOpaqueBounds(rgba);
  return { rgba, pagePixelBBox: refinedPageBBox, refinedHiResCrop };
}

async function tryHarvestFromBbox(
  pages: RenderedPdfPage[],
  pdfBuffer: Buffer,
  hint: BrandKitVisionLogoHint,
  pixelBBox: PixelBBox,
  attemptIndex: number,
  options?: { paletteDarkHex?: string },
): Promise<ScoredBrandKitLogoHarvest[] | null> {
  const page = pages.find((p) => p.pageNumber === hint.page) ?? pages[0];
  if (!page) return null;

  const bbox = clampPixelBBox(page.width, page.height, pixelBBox);
  console.info(
    `[logo] bbox pixels: page=${page.pageNumber} x=${bbox.x},y=${bbox.y},w=${bbox.width},h=${bbox.height} norm=${hint.bbox.x.toFixed(3)},${hint.bbox.y.toFixed(3)},${hint.bbox.width.toFixed(3)},${hint.bbox.height.toFixed(3)}`,
  );

  const scale = LOGO_HIGH_RES_DPI / PDF_PAGE_RENDER_DEFAULT_DPI;
  const scaledBbox: PixelBBox = {
    x: Math.round(bbox.x * scale),
    y: Math.round(bbox.y * scale),
    width: Math.round(bbox.width * scale),
    height: Math.round(bbox.height * scale),
  };

  const hiResCrop = await renderPdfPageCrop(pdfBuffer, page.pageNumber, scaledBbox, LOGO_HIGH_RES_DPI);
  writeVisionLogoDebugCrop(page.pageNumber, attemptIndex, hiResCrop, bbox, "probe");

  const polarity = hint.polarity;
  const refined = await refineLogoCropFromIsolation(pdfBuffer, page, bbox, hiResCrop, polarity);
  if (!refined) {
    logLogoBboxRejected({ reason: "empty_crop", pixelsKeptPct: 0, pixelBBox: bbox, polarity });
    return null;
  }

  writeVisionLogoDebugCrop(
    page.pageNumber,
    attemptIndex,
    refined.refinedHiResCrop,
    refined.pagePixelBBox,
    "refined",
  );
  let rgba = refined.rgba;
  writeVisionLogoDebugIsolated(page.pageNumber, attemptIndex, rgba, "isolated");

  const { data, info } = await sharp(rgba).raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const pixelsKeptPct = measureOpaquePixelPct(data, width, height);

  if (pixelsKeptPct < VISION_LOGO_MIN_PIXELS_KEPT_PCT) {
    logLogoBboxRejected({
      reason: "empty_crop",
      pixelsKeptPct,
      pixelBBox: bbox,
      polarity,
    });
    return null;
  }

  logLogoIsolationPath("vision-bbox", { polarity, pixelsKeptPct });

  if (width < 12 || height < 8) {
    logLogoBboxRejected({ reason: "too_small", pixelsKeptPct, pixelBBox: bbox, polarity });
    return null;
  }

  const variant: "positive" | "negative" = polarity === "dark_mark" ? "positive" : "negative";
  const split = await splitRasterLogoByComponents(rgba);
  const out: ScoredBrandKitLogoHarvest[] = [];

  for (const partBuffer of split.buffers) {
    const logoPHash = await computeLogoPHash(partBuffer);
    const brandBehavior = visionBrandBehavior();
    const logoNess = await measureLogoNess(partBuffer);
    const visualTiebreak = visualTiebreakScore(logoNess);
    const detail = split.split
      ? "localizado por visión · componente atómico"
      : "localizado por visión sobre render";

    const base: ScoredBrandKitLogoHarvest = {
      buffer: partBuffer,
      variant,
      confidence: 0.9,
      pageNumber: page.pageNumber,
      sourceBbox: refined.pagePixelBBox,
      evidenceDetail: detail,
      brandBehavior,
      visualTiebreak,
      logoNess,
      logoPHash,
      isolationMethod: "keying",
    };

    const opposite = variant === "positive" ? "negative" : "positive";
    let synthesized = await synthesizeLogoPolarityVariant(partBuffer, opposite, options?.paletteDarkHex);
    synthesized = await trimRgbaToOpaqueBounds(synthesized);

    out.push(
      base,
      {
        ...base,
        variant: opposite,
        buffer: synthesized,
        confidence: base.confidence * 0.88,
        evidenceDetail: `${base.evidenceDetail} · sintetizado`,
        logoPHash: await computeLogoPHash(synthesized),
        logoNess: await measureLogoNess(synthesized),
        visualTiebreak: visualTiebreakScore(await measureLogoNess(synthesized)),
      },
    );
  }

  return out;
}

export async function harvestLogoFromVisionHint(
  pages: RenderedPdfPage[],
  pdfBuffer: Buffer,
  hint: BrandKitVisionLogoHint,
  options?: { paletteDarkHex?: string },
): Promise<ScoredBrandKitLogoHarvest[]> {
  if (!hint.isEmitterLogo) return [];

  const page = pages.find((p) => p.pageNumber === hint.page) ?? pages[0];
  if (!page) return [];

  await classifyRegionPolarity(page.pngBuffer, page.width, page.height, {
    x: Math.round(hint.bbox.x * page.width),
    y: Math.round(hint.bbox.y * page.height),
    width: Math.max(1, Math.round(hint.bbox.width * page.width)),
    height: Math.max(1, Math.round(hint.bbox.height * page.height)),
  });

  const attempts = buildVisionLogoBboxAttempts(hint, page.width, page.height);
  for (let i = 0; i < attempts.length; i += 1) {
    const attempt = attempts[i]!;
    const harvested = await tryHarvestFromBbox(
      pages,
      pdfBuffer,
      attempt.hint,
      attempt.pixelBBox,
      i + 1,
      options,
    );
    if (harvested?.length) return harvested;
  }

  console.info("[logo] vision-bbox rejected: no valid crop after expanded attempts");
  return [];
}
