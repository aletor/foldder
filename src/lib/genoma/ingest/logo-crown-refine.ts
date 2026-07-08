/**
 * Refinado de logo raster tras coronación — BiRefNet solo aquí (invariante de pago).
 */

import sharp from "sharp";
import { isolateLogoCropForCrownedMark } from "@/lib/brain/pdf-logo-pipeline";

function luminance255(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export async function estimateLogoCropContext(
  buffer: Buffer,
): Promise<{ bgVariance: number; polarity: "light_mark" | "dark_mark" }> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const samples: number[] = [];
  const fgSamples: number[] = [];
  const edge = Math.max(2, Math.min(8, Math.floor(Math.min(info.width, info.height) * 0.08)));

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const i = (y * info.width + x) * 4;
      const a = data[i + 3] ?? 0;
      if (a < 32) continue;
      const lum = luminance255(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
      const onBorder =
        x < edge || y < edge || x >= info.width - edge || y >= info.height - edge;
      if (onBorder) samples.push(lum);
      else if (a > 200) fgSamples.push(lum);
    }
  }

  if (samples.length === 0) samples.push(240);
  if (fgSamples.length === 0) fgSamples.push(40);

  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance = samples.reduce((acc, v) => acc + (v - mean) ** 2, 0) / samples.length;
  const bgLum = mean;
  const fgLum = fgSamples.reduce((a, b) => a + b, 0) / fgSamples.length;
  const polarity: "light_mark" | "dark_mark" = fgLum + 12 < bgLum ? "dark_mark" : "light_mark";

  return { bgVariance: variance * variance, polarity };
}

export async function refineCrownedRasterLogo(
  buffer: Buffer,
): Promise<{ buffer: Buffer; method: "keying" | "birefnet" }> {
  const context = await estimateLogoCropContext(buffer);
  return isolateLogoCropForCrownedMark(buffer, context.bgVariance, context.polarity);
}
