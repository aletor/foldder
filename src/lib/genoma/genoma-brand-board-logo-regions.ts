import sharp from "sharp";
import type { BBoxPage } from "./logo-intake/bbox";

/** Regiones típicas de logo en planchetas 3×3 (y-down, 0–1). */
const BRAND_BOARD_LOGO_REGIONS: { bbox: BBoxPage; label: string; weight: number }[] = [
  { bbox: [0.5, 0.02, 0.98, 0.42], label: "top_right_hero", weight: 1 },
  { bbox: [0.02, 0.02, 0.5, 0.42], label: "top_left_hero", weight: 0.92 },
  { bbox: [0.28, 0.3, 0.72, 0.72], label: "center_grid", weight: 0.78 },
  { bbox: [0.02, 0.48, 0.45, 0.98], label: "bottom_left_mockup", weight: 0.62 },
];

export type BrandBoardLogoRegionScore = {
  bbox: BBoxPage;
  label: string;
  score: number;
};

export function bboxPageToPixel(bbox: BBoxPage, width: number, height: number) {
  return {
    left: Math.max(0, Math.round(bbox[0] * width)),
    top: Math.max(0, Math.round(bbox[1] * height)),
    width: Math.max(1, Math.round((bbox[2] - bbox[0]) * width)),
    height: Math.max(1, Math.round((bbox[3] - bbox[1]) * height)),
  };
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Puntúa si la región parece un panel oscuro con logo/wordmark (alto contraste local). */
export async function scoreBrandBoardLogoRegion(
  pngBuffer: Buffer,
  bbox: BBoxPage,
  width: number,
  height: number,
  regionWeight = 1,
): Promise<number> {
  const pixel = bboxPageToPixel(bbox, width, height);
  if (pixel.width < 24 || pixel.height < 16) return 0;

  const { data, info } = await sharp(pngBuffer)
    .extract(pixel)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels || 3;
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  let brightPixels = 0;

  for (let i = 0; i < data.length; i += channels) {
    const lum = luminance(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
    sum += lum;
    sumSq += lum * lum;
    count += 1;
    if (lum > 165) brightPixels += 1;
  }

  if (!count) return 0;

  const mean = sum / count;
  const variance = Math.max(0, sumSq / count - mean * mean);
  const std = Math.sqrt(variance);
  const brightRatio = brightPixels / count;
  const aspect = pixel.width / pixel.height;

  let score = 0;
  if (mean < 130) score += 0.32;
  if (mean > 35) score += 0.12;
  if (std > 22 && std < 115) score += 0.28;
  if (brightRatio > 0.015 && brightRatio < 0.42) score += 0.18;
  if (aspect > 0.65 && aspect < 5) score += 0.1;

  return Math.min(0.98, score * regionWeight);
}

export async function rankBrandBoardLogoRegions(
  pngBuffer: Buffer,
  width: number,
  height: number,
): Promise<BrandBoardLogoRegionScore[]> {
  const scored: BrandBoardLogoRegionScore[] = [];
  for (const region of BRAND_BOARD_LOGO_REGIONS) {
    const score = await scoreBrandBoardLogoRegion(pngBuffer, region.bbox, width, height, region.weight);
    if (score >= 0.45) {
      scored.push({ bbox: region.bbox, label: region.label, score });
    }
  }
  return scored.sort((a, b) => b.score - a.score);
}
