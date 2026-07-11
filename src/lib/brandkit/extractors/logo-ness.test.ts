import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  measureLogoNess,
  visualTiebreakScore,
  LOGONESS_MAX_DISTINCT_COLORS,
  LOGONESS_MAX_TONAL_ENTROPY,
} from "./logo-ness";

async function flatLogoPng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 240,
      height: 60,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: { width: 48, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
        })
          .png()
          .toBuffer(),
        left: 96,
        top: 22,
      },
    ])
    .png()
    .toBuffer();
}

async function photoLikePng(): Promise<Buffer> {
  const width = 160;
  const height = 160;
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i += 3) {
    raw[i] = Math.floor(Math.random() * 256);
    raw[i + 1] = Math.floor(Math.random() * 256);
    raw[i + 2] = Math.floor(Math.random() * 256);
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

describe("visual tiebreak (T-desempate métricas)", () => {
  it("gráfico plano puntúa más alto que foto para desempate", async () => {
    const logo = await flatLogoPng();
    const photo = await photoLikePng();

    const logoMetrics = await measureLogoNess(logo);
    const photoMetrics = await measureLogoNess(photo);

    expect(logoMetrics.distinctColors).toBeLessThan(LOGONESS_MAX_DISTINCT_COLORS);
    expect(logoMetrics.tonalEntropy).toBeLessThan(LOGONESS_MAX_TONAL_ENTROPY);
    expect(visualTiebreakScore(logoMetrics)).toBeGreaterThan(visualTiebreakScore(photoMetrics));
  });
});
