import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  isHorizontalLogoLockup,
  shouldSplitLogoComponents,
  splitRasterLogoByComponents,
  type ComponentBounds,
} from "./logo-component-split";
import { isSimpleSolidLogoShape, measureLogoNess } from "./logo-ness";
import { detectAmbiguousLogoPrimaries, finalizeLogoHarvestRanking } from "./logo-ranking";
import type { ScoredGenomaLogoHarvest } from "./logo-harvest-types";

async function compositeIconAndBarPng(): Promise<Buffer> {
  const width = 200;
  const height = 160;
  return sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: await sharp({
          create: { width: 80, height: 24, channels: 4, background: { r: 120, g: 60, b: 200, alpha: 255 } },
        })
          .png()
          .toBuffer(),
        left: 60,
        top: 20,
      },
      {
        input: await sharp({
          create: { width: 160, height: 18, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } },
        })
          .png()
          .toBuffer(),
        left: 20,
        top: 110,
      },
    ])
    .png()
    .toBuffer();
}

async function horizontalLockupPng(): Promise<Buffer> {
  return sharp({
    create: { width: 220, height: 48, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: await sharp({
          create: { width: 36, height: 36, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } },
        })
          .png()
          .toBuffer(),
        left: 8,
        top: 6,
      },
      {
        input: await sharp({
          create: { width: 120, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } },
        })
          .png()
          .toBuffer(),
        left: 52,
        top: 14,
      },
    ])
    .png()
    .toBuffer();
}

describe("logo-component-split", () => {
  it("separa icono y barra distantes en candidatos atómicos", async () => {
    const composite = await compositeIconAndBarPng();
    const split = await splitRasterLogoByComponents(composite);
    expect(split.split).toBe(true);
    expect(split.buffers.length).toBeGreaterThanOrEqual(2);
  });

  it("conserva lockup horizontal isotipo + wordmark", async () => {
    const lockup = await horizontalLockupPng();
    const split = await splitRasterLogoByComponents(lockup);
    expect(split.split).toBe(false);
    expect(split.buffers).toHaveLength(1);
  });

  it("detecta lockup horizontal entre componentes", () => {
    const icon: ComponentBounds = { minX: 0, minY: 10, maxX: 40, maxY: 50, pixelCount: 400 };
    const word: ComponentBounds = { minX: 50, minY: 12, maxX: 180, maxY: 42, pixelCount: 600 };
    expect(isHorizontalLogoLockup(icon, word, 220)).toBe(true);
  });

  it("marca separación vertical como split", () => {
    const top: ComponentBounds = { minX: 40, minY: 10, maxX: 120, maxY: 40, pixelCount: 500 };
    const bottom: ComponentBounds = { minX: 20, minY: 100, maxX: 180, maxY: 130, pixelCount: 800 };
    expect(shouldSplitLogoComponents([top, bottom], 200, 160)).toBe(true);
  });
});

describe("simple solid logo shape", () => {
  it("degrada barras sólidas como no-logo", async () => {
    const bar = await sharp({
      create: { width: 180, height: 24, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } },
    })
      .png()
      .toBuffer();
    const metrics = await measureLogoNess(bar);
    expect(isSimpleSolidLogoShape(metrics)).toBe(true);
    expect(metrics.simpleSolidShape).toBe(true);
  });
});

describe("logo-ranking ambiguity", () => {
  const behavior = {
    total: 0.72,
    invariance: 0.6,
    structuralPosition: 0.7,
    interDocument: 0.5,
    scaleSubordination: 0.6,
  };

  function mockEntry(overrides: Partial<ScoredGenomaLogoHarvest>): ScoredGenomaLogoHarvest {
    return {
      buffer: Buffer.from("x"),
      variant: "positive",
      confidence: 0.8,
      pageNumber: 1,
      evidenceDetail: "test",
      brandBehavior: behavior,
      visualTiebreak: 0.7,
      logoNess: {
        distinctColors: 4,
        tonalEntropy: 2,
        inkDensity: 0.2,
        containsFace: false,
        geometricEdges: true,
        width: 80,
        height: 40,
        dominantFillShare: 0.5,
      },
      logoPHash: "a",
      ...overrides,
    };
  }

  it("detecta empate entre candidatos plausibles", () => {
    const entries = [
      mockEntry({ logoPHash: "a", visualTiebreak: 0.72 }),
      mockEntry({ logoPHash: "b", visualTiebreak: 0.71 }),
    ];
    expect(detectAmbiguousLogoPrimaries(entries)).toBe(true);
  });

  it("no auto-asigna corona pero deja un primary propuesto cuando hay ambigüedad", () => {
    const entries = [
      mockEntry({ logoPHash: "a", visualTiebreak: 0.72 }),
      mockEntry({ logoPHash: "b", visualTiebreak: 0.71 }),
    ];
    const { logos, ambiguousPrimary } = finalizeLogoHarvestRanking(entries);
    expect(ambiguousPrimary).toBe(true);
    expect(logos.filter((l) => l.slot === "primary")).toHaveLength(1);
    expect(logos.filter((l) => l.slot === "secondary").length).toBeGreaterThanOrEqual(1);
  });
});
