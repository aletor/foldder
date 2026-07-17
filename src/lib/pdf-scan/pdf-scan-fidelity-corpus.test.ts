import { describe, expect, it } from "vitest";
import {
  PDF_SCAN_CORPUS_THRESHOLDS,
  runPdfScanCorpusAll,
  runPdfScanCorpusCase,
} from "./pdf-scan-fidelity-corpus";
import { getPdfScanCorpusFixture, PDF_SCAN_CORPUS_FIXTURE_IDS } from "./pdf-scan-corpus-fixtures";
import {
  approxSsimLuma,
  documentObjectsToSvg,
  meanAbsErrorRgb,
  rasterizeSvgToRaw,
} from "./pdf-document-fidelity";

describe("pdf-scan corpus fixtures", () => {
  it("builds valid non-empty PDF buffers", () => {
    for (const id of PDF_SCAN_CORPUS_FIXTURE_IDS) {
      const buf = getPdfScanCorpusFixture(id);
      expect(buf.byteLength).toBeGreaterThan(80);
      expect(buf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    }
  });
});

describe("pdf-scan fidelity corpus", () => {
  it("self-compare of SVG rebuild is near-perfect (sanity)", async () => {
    const objects = [
      {
        type: "path" as const,
        id: "p1",
        d: "M 10 10 L 90 10 L 90 70 L 10 70 Z",
        x: 10,
        y: 10,
        w: 80,
        h: 60,
        fill: "#1a4dcc",
        stroke: "none",
        strokeWidth: 0,
      },
    ];
    const svg = documentObjectsToSvg({ width: 120, height: 100, objects, imageDataUrls: {} });
    const rebuild = await rasterizeSvgToRaw(svg, 120, 100);
    expect(meanAbsErrorRgb(rebuild.rgba, rebuild.rgba)).toBe(0);
    expect(approxSsimLuma(rebuild.rgba, rebuild.rgba, 120, 100)).toBeGreaterThan(0.99);
  });

  it("solid-rect meets corpus thresholds", async () => {
    const result = await runPdfScanCorpusCase("solid-rect");
    expect(result.pathCount).toBeGreaterThan(0);
    expect(result.report.ssim).toBeGreaterThanOrEqual(PDF_SCAN_CORPUS_THRESHOLDS["solid-rect"].minSsim);
    expect(result.report.mae).toBeLessThanOrEqual(PDF_SCAN_CORPUS_THRESHOLDS["solid-rect"].maxMae);
    expect(result.passed).toBe(true);
  }, 30_000);

  it("runs full synthetic corpus", async () => {
    const results = await runPdfScanCorpusAll();
    expect(results).toHaveLength(PDF_SCAN_CORPUS_FIXTURE_IDS.length);
    const failed = results.filter((r) => !r.passed);
    if (failed.length) {
      const detail = failed
        .map(
          (r) =>
            `${r.id}: ssim=${r.report.ssim.toFixed(3)} (min ${r.threshold.minSsim}) mae=${r.report.mae.toFixed(1)} (max ${r.threshold.maxMae}) paths=${r.pathCount} text=${r.textCount}`,
        )
        .join("\n");
      expect.fail(`Corpus fidelity failed:\n${detail}`);
    }
  }, 60_000);
});
