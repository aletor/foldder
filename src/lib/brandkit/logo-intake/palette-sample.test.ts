import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  deltaE76,
  estimatePaperColor,
  sampleRegionColors,
  buildSemanticPalette,
} from "@/lib/brandkit/logo-intake/palette-sample";
import { applySemanticPaletteToGenome } from "@/lib/brandkit/logo-intake/genome-bridge";
import { emptyGenome, getTrait, crownedCandidates } from "@/lib/brandkit/model/trait";

describe("palette-sample", () => {
  it("sampleRegionColors extrae hex dominante en swatch", async () => {
    const page = await sharp({
      create: {
        width: 400,
        height: 400,
        channels: 3,
        background: { r: 245, g: 245, b: 245 },
      },
    })
      .png()
      .toBuffer();

    const swatch = await sharp({
      create: {
        width: 80,
        height: 80,
        channels: 3,
        background: { r: 0, g: 152, b: 216 },
      },
    })
      .png()
      .toBuffer();

    const composed = await sharp(page)
      .composite([{ input: swatch, left: 160, top: 160 }])
      .png()
      .toBuffer();

    const paper = await estimatePaperColor(composed);
    const colors = await sampleRegionColors(composed, [0.35, 0.35, 0.55, 0.55], {
      paperHex: paper,
      kind: "palette_swatch",
    });

    expect(colors.length).toBeGreaterThan(0);
    expect(deltaE76(colors[0]!.hex, "#0098d8")).toBeLessThan(12);
  });

  it("buildSemanticPalette asigna primary y secondary cromáticos", async () => {
    const page = await sharp({
      create: { width: 500, height: 500, channels: 3, background: { r: 250, g: 250, b: 250 } },
    })
      .png()
      .toBuffer();

    const blue = await sharp({
      create: { width: 60, height: 60, channels: 3, background: { r: 0, g: 152, b: 216 } },
    })
      .png()
      .toBuffer();
    const gold = await sharp({
      create: { width: 60, height: 60, channels: 3, background: { r: 190, g: 160, b: 100 } },
    })
      .png()
      .toBuffer();

    const composed = await sharp(page)
      .composite([
        { input: blue, left: 80, top: 80 },
        { input: gold, left: 200, top: 80 },
      ])
      .png()
      .toBuffer();

    const palette = await buildSemanticPalette({
      docs: [],
      regions: [
        {
          pagePng: composed,
          pageWidth: 500,
          pageHeight: 500,
          bboxPage: [0.14, 0.14, 0.26, 0.26],
          kind: "palette_swatch",
          prominence: 3,
          pageNumber: 1,
          labelText: "BLEU OM",
        },
        {
          pagePng: composed,
          pageWidth: 500,
          pageHeight: 500,
          bboxPage: [0.38, 0.14, 0.5, 0.26],
          kind: "palette_swatch",
          prominence: 3,
          pageNumber: 1,
          labelText: "OR OM",
        },
      ],
      logoCropPng: null,
    });

    const primary = palette.entries.find((e) => e.role === "primary");
    const secondary = palette.entries.find((e) => e.role === "secondary");
    expect(primary).toBeTruthy();
    expect(secondary).toBeTruthy();
    expect(deltaE76(primary!.hex, "#0098d8")).toBeLessThan(15);
    expect(deltaE76(secondary!.hex, "#bea064")).toBeLessThan(15);
    expect(primary?.name).toBe("BLEU OM");
    expect(secondary?.name).toBe("OR OM");
  });

  it("downsample no altera hex en swatch plano", async () => {
    const large = await sharp({
      create: { width: 3000, height: 1687, channels: 3, background: { r: 0, g: 152, b: 216 } },
    })
      .png()
      .toBuffer();
    const small = await sharp({
      create: { width: 400, height: 400, channels: 3, background: { r: 0, g: 152, b: 216 } },
    })
      .png()
      .toBuffer();

    const paper = "#ffffff";
    const largeColors = await sampleRegionColors(large, [0, 0, 1, 1], {
      paperHex: paper,
      kind: "palette_swatch",
    });
    const smallColors = await sampleRegionColors(small, [0, 0, 1, 1], {
      paperHex: paper,
      kind: "palette_swatch",
    });

    expect(largeColors[0]?.hex).toBe(smallColors[0]?.hex);
    expect(deltaE76(largeColors[0]!.hex, "#0098d8")).toBeLessThan(8);
  });

  it("logo crop aporta paleta cuando brand_block débil bloquea", async () => {
    const logoCrop = await sharp({
      create: { width: 120, height: 80, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 80, height: 50, channels: 3, background: { r: 20, g: 40, b: 180 } },
          })
            .png()
            .toBuffer(),
          left: 20,
          top: 15,
        },
        {
          input: await sharp({
            create: { width: 40, height: 30, channels: 3, background: { r: 220, g: 60, b: 90 } },
          })
            .png()
            .toBuffer(),
          left: 60,
          top: 20,
        },
      ])
      .png()
      .toBuffer();

    const page = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 214, g: 212, b: 229 } },
    })
      .png()
      .toBuffer();

    const palette = await buildSemanticPalette({
      docs: [],
      regions: [
        {
          pagePng: page,
          pageWidth: 400,
          pageHeight: 300,
          bboxPage: [0.1, 0.1, 0.9, 0.9],
          kind: "brand_block",
          prominence: 3,
          pageNumber: 3,
        },
      ],
      logoCropPng: logoCrop,
    });

    const primary = palette.entries.find((e) => e.role === "primary");
    expect(primary?.regionKind).toBe("logo");
    expect(palette.semanticChromaticCount).toBeGreaterThan(0);
    expect(palette.entries.length).toBeGreaterThan(1);
  });
});

describe("applySemanticPaletteToGenome", () => {
  it("corona colores semánticos y demote cuantizados", () => {
    const genome = applySemanticPaletteToGenome(emptyGenome(), {
      entries: [
        {
          hex: "#0098d8",
          role: "primary",
          name: "BLEU OM",
          regionKind: "palette_swatch",
          prominence: 3,
          recurrence: 2,
          share: 0.9,
          pages: [1, 2],
          score: 5,
        },
        {
          hex: "#bea064",
          role: "secondary",
          name: "OR OM",
          regionKind: "palette_swatch",
          prominence: 3,
          recurrence: 2,
          share: 0.8,
          pages: [1, 2],
          score: 4,
        },
      ],
      samplingMs: 10,
      semanticChromaticCount: 2,
    });

    const primary = getTrait(genome, "color.primary");
    const secondary = getTrait(genome, "color.secondary");
    expect(crownedCandidates(primary!)[0]?.value.hex).toBe("#0098d8");
    expect(crownedCandidates(secondary!)[0]?.value.hex).toBe("#bea064");
    expect(crownedCandidates(primary!)[0]?.signals.some((s) => s.kind === "visual-brand")).toBe(true);
  });
});
