import sharp from "sharp";
import type { QualityScore } from "@/lib/genoma/logo-intake/types";

const LAPLACIAN = [0, 1, 0, 1, -4, 1, 0, 1, 0];

export async function scoreLogoQuality(input: {
  cropPng: Buffer;
  widthPx: number;
  heightPx: number;
  isComplete: boolean;
  cutEdges: boolean;
  confidence: number;
}): Promise<QualityScore> {
  const minSide = Math.min(input.widthPx, input.heightPx);
  const resolutionPts = Math.min(30, (Math.min(minSide, 220) / 220) * 30);

  const sharpnessPts = await laplacianVarianceScore(input.cropPng);
  const completePts = input.isComplete ? 20 : 0;
  const noCutPts = !input.cutEdges ? 15 : 0;
  const confidencePts = Math.min(10, Math.max(0, input.confidence * 10));

  const total = resolutionPts + sharpnessPts + completePts + noCutPts + confidencePts;
  return {
    total: Math.round(total * 10) / 10,
    resolutionPts: Math.round(resolutionPts * 10) / 10,
    sharpnessPts: Math.round(sharpnessPts * 10) / 10,
    completePts,
    noCutPts,
    confidencePts: Math.round(confidencePts * 10) / 10,
  };
}

async function laplacianVarianceScore(cropPng: Buffer): Promise<number> {
  const { data, info } = await sharp(cropPng)
    .greyscale()
    .resize(128, 128, { fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width ?? 0;
  const h = info.height ?? 0;
  if (!w || !h) return 0;

  const vals: number[] = [];
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      let sum = 0;
      let ki = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          sum += (data[(y + ky) * w + (x + kx)] ?? 0) * (LAPLACIAN[ki] ?? 0);
          ki += 1;
        }
      }
      vals.push(Math.abs(sum));
    }
  }
  if (!vals.length) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  // Normalizado empírico: var>800 ≈ nítido, var<50 ≈ borroso
  const normalized = Math.min(1, Math.max(0, (variance - 20) / 780));
  return normalized * 25;
}
