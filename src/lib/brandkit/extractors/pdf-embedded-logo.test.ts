import { describe, expect, it } from "vitest";
import { isLogoSizedEmbeddedImage } from "@/lib/brain/pdf-visual-extract";
import { synthesizeLogoPolarityVariant } from "@/lib/brain/pdf-logo-pipeline";
import sharp from "sharp";

describe("pdf-embedded-logo helpers", () => {
  it("filtra tamaño de asset embebido tipo logo", () => {
    expect(isLogoSizedEmbeddedImage(120, 40)).toBe(true);
    expect(isLogoSizedEmbeddedImage(800, 600)).toBe(false);
    expect(isLogoSizedEmbeddedImage(12, 12)).toBe(false);
  });

  it("sintetiza variante de polaridad opuesta", async () => {
    const source = await sharp({
      create: { width: 40, height: 20, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } },
    })
      .composite([
        {
          input: {
            create: { width: 30, height: 12, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
          },
          left: 4,
          top: 4,
        },
      ])
      .png()
      .toBuffer();

    const negative = await synthesizeLogoPolarityVariant(source, "negative");
    const positive = await synthesizeLogoPolarityVariant(source, "positive", "#112233");
    expect(negative.byteLength).toBeGreaterThan(100);
    expect(positive.byteLength).toBeGreaterThan(100);
    expect(negative.equals(positive)).toBe(false);
  });
});
