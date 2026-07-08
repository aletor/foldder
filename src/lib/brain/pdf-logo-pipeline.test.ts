import fs from "fs";
import path from "path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { renderPdfPages } from "@/lib/brain/pdf-page-render";
import {
  clusterRegionSamples,
  collectRegionSamples,
  detectLogosFromPdfBuffer,
  isolateLogoWithKeying,
  jaccardSimilarity,
} from "@/lib/brain/pdf-logo-pipeline";
import { extractBrandKitFromPdfBuffer } from "@/lib/brain/pdf-brand-extract";

const FIXTURE_PATH = path.join(
  process.cwd(),
  "fixtures/brandkit/sample-brand-deck.pdf",
);
const hasFixture = fs.existsSync(FIXTURE_PATH);

describe.skipIf(!hasFixture)("T-L — pipeline logo sobre renders (deck multipágina)", () => {
  const buffer = fs.readFileSync(FIXTURE_PATH);

  it("T-L1 — clustering detecta logo en ≥10/17 páginas", async () => {
    const pages = await renderPdfPages(buffer);
    const samples = await collectRegionSamples(pages);
    const cluster = clusterRegionSamples(samples, pages.length);
    const pagesHit = new Set(cluster.map((c) => c.pageNumber)).size;
    expect(pagesHit).toBeGreaterThanOrEqual(10);
  });

  it("T-L2 — polaridades y bbox en instancias elegidas", async () => {
    const { logos } = await detectLogosFromPdfBuffer(buffer);
    expect(logos.length).toBeGreaterThanOrEqual(1);
    const positive = logos.find((l) => l.variant === "positive");
    const negative = logos.find((l) => l.variant === "negative");
    expect(positive?.bbox.width).toBeGreaterThan(20);
    expect(positive?.evidenceDetail).toMatch(/cosechado|sintetizado/);
    if (negative) {
      expect(negative.evidenceDetail).toMatch(/keying|birefnet/);
    }
  });

  it("T-L3 — keying produce RGBA con alpha", async () => {
    const { logos } = await detectLogosFromPdfBuffer(buffer);
    expect(logos.length).toBeGreaterThan(0);
    for (const logo of logos) {
      const stats = await sharp(logo.buffer).stats();
      expect(stats.channels[3]?.max).toBe(255);
    }
    const transparent = await Promise.all(
      logos.map(async (logo) => {
        const stats = await sharp(logo.buffer).stats();
        return (stats.channels[3]?.min ?? 255) < 128;
      }),
    );
    expect(transparent.some(Boolean)).toBe(true);
  });

  it("T-L4 — positivo y negativo cosechados cuando existen ambas polaridades", async () => {
    const { logos } = await detectLogosFromPdfBuffer(buffer);
    const variants = new Set(logos.map((l) => l.variant));
    if (variants.size >= 2) {
      for (const logo of logos) {
        expect(logo.evidenceDetail).toContain("cosechado");
      }
    }
  });

  it("T-L5 — pHash estable entre instancias del cluster", async () => {
    const pages = await renderPdfPages(buffer);
    const samples = await collectRegionSamples(pages);
    const cluster = clusterRegionSamples(samples, pages.length);
    expect(cluster.length).toBeGreaterThan(2);
    const sigs = cluster.slice(0, 4).map((s) => s.signature);
    for (let i = 1; i < sigs.length; i += 1) {
      expect(jaccardSimilarity(sigs[0]!, sigs[i]!)).toBeGreaterThanOrEqual(0.32);
    }
  });

  it("T-fonts — tipografía Fractul", async () => {
    const extracted = await extractBrandKitFromPdfBuffer(buffer, "sample-brand-deck.pdf");
    expect(extracted.typography.primary?.family.toLowerCase()).toContain("fractul");
    expect(extracted.typography.primary?.weights.length).toBeGreaterThan(0);
  });

  it("renderPdfPages — pageRenderCount > 0 en extract", async () => {
    const extracted = await extractBrandKitFromPdfBuffer(buffer, "sample-brand-deck.pdf");
    expect(extracted.pageRenderCount).toBeGreaterThanOrEqual(17);
    expect(extracted.diagnostics.logoCandidates).toBeGreaterThan(0);
  });
});

describe("jaccardSimilarity", () => {
  it("identidad = 1", () => {
    const a = new Uint8Array([1, 0, 1, 1]);
    expect(jaccardSimilarity(a, a)).toBe(1);
  });
});

describe("isolateLogoWithKeying", () => {
  it("devuelve PNG", async () => {
    const input = await sharp({
      create: { width: 40, height: 20, channels: 3, background: { r: 20, g: 30, b: 80 } },
    })
      .png()
      .toBuffer();
    const out = await isolateLogoWithKeying(input);
    expect(out.byteLength).toBeGreaterThan(50);
  });
});
