/**
 * Núcleo de recorte de logo para ingest (sin upload — testeable sin Next).
 */

import sharp from "sharp";
import type { BBoxPage } from "@/lib/genoma/logo-intake/bbox";
import { expandBBoxPage } from "@/lib/genoma/logo-intake/bbox";
import { trimBBoxPageFromPage } from "@/lib/genoma/logo-intake/crop";
import { scoreLogoQuality } from "@/lib/genoma/logo-intake/quality";
import type { QualityScore } from "@/lib/genoma/logo-intake/types";
import { bboxPageToPixel } from "@/lib/genoma/genoma-brand-board-logo-regions";

export type IngestLogoCropInput = {
  pagePng: Buffer;
  pageWidth: number;
  pageHeight: number;
  bboxPage: BBoxPage;
  padding?: number;
  trim?: boolean;
  qualityMeta?: {
    isComplete?: boolean;
    cutEdges?: boolean;
    confidence?: number;
  };
};

export type IngestLogoCropResult = {
  png: Buffer;
  width: number;
  height: number;
  bboxPage: BBoxPage;
  trimmed: boolean;
  quality: QualityScore;
};

const MIN_CROP_WIDTH = 16;
const MIN_CROP_HEIGHT = 10;

/** Recorta, recorta al tinta (trim) y puntúa calidad — devuelve null si el crop es inválido. */
export async function cropAndScoreIngestLogo(input: IngestLogoCropInput): Promise<IngestLogoCropResult | null> {
  const pad = input.padding ?? 0;
  let bboxPage = pad > 0 ? expandBBoxPage(input.bboxPage, pad) : input.bboxPage;
  let trimmed = false;

  if (input.trim !== false) {
    const trimResult = await trimBBoxPageFromPage({
      pagePng: input.pagePng,
      pageWidth: input.pageWidth,
      pageHeight: input.pageHeight,
      bboxPage,
    });
    bboxPage = trimResult.bboxPage;
    trimmed = trimResult.trimmed;
  }

  const pixel = bboxPageToPixel(bboxPage, input.pageWidth, input.pageHeight);
  if (pixel.width < MIN_CROP_WIDTH || pixel.height < MIN_CROP_HEIGHT) return null;

  let png: Buffer;
  try {
    png = await sharp(input.pagePng).extract(pixel).png().toBuffer();
  } catch {
    return null;
  }

  const meta = await sharp(png).metadata();
  const width = meta.width ?? pixel.width;
  const height = meta.height ?? pixel.height;
  if (width < MIN_CROP_WIDTH || height < MIN_CROP_HEIGHT) return null;

  const quality = await scoreLogoQuality({
    cropPng: png,
    widthPx: width,
    heightPx: height,
    isComplete: input.qualityMeta?.isComplete ?? true,
    cutEdges: input.qualityMeta?.cutEdges ?? false,
    confidence: input.qualityMeta?.confidence ?? 0.72,
  });

  return { png, width, height, bboxPage, trimmed, quality };
}

export function ingestLogoScoreFromQuality(quality: QualityScore, baseScore: number, index = 0): number {
  const qualityBoost = Math.min(0.12, (quality.total / 100) * 0.12);
  return Math.min(0.96, Math.max(0.52, baseScore + qualityBoost - index * 0.03));
}

export function bboxPageToSourceBbox(bbox: BBoxPage) {
  return {
    x: bbox[0],
    y: bbox[1],
    width: bbox[2] - bbox[0],
    height: bbox[3] - bbox[1],
  };
}
