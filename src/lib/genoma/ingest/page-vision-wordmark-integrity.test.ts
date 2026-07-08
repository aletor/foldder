import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractNativeLogoInBbox } from "./page-vision-native-extract";
import { verifyWordmarkIntegrity } from "./page-vision-wordmark-integrity";

const PDF = path.join(process.cwd(), "fixtures/brandkit/catalogo26.pdf");

describe.skipIf(!fs.existsSync(PDF))("page-vision-wordmark-integrity — catalogo26", () => {
  it("wordmark integrity ✓ con glifo I presente en SVG nativo p2", async () => {
    const buffer = fs.readFileSync(PDF);
    const asset = await extractNativeLogoInBbox({
      buffer,
      pageNumber: 2,
      bbox: [0.308, 0.46, 0.69, 0.54],
      textInLogo: "ATRESMEDIA SALES",
    });
    expect(asset?.svg).toContain("<svg");
    const integrity = await verifyWordmarkIntegrity(asset!.svg!, "ATRESMEDIA SALES");
    expect(integrity.ok).toBe(true);
    expect(integrity.detail).toContain("wordmark integrity ✓");
  });

  it("emite audit con orphan_glyph_emitted para la I", async () => {
    const buffer = fs.readFileSync(PDF);
    const asset = await extractNativeLogoInBbox({
      buffer,
      pageNumber: 2,
      bbox: [0.308, 0.46, 0.69, 0.54],
      textInLogo: "ATRESMEDIA SALES",
      collectPathAudit: true,
    });
    expect(asset?.pathAudit?.beforeCount).toBeGreaterThanOrEqual(17);
    expect(asset?.pathAudit?.afterCount).toBeGreaterThanOrEqual(17);
    expect(asset?.pathAudit?.entries.some((e) => e.rule === "orphan_glyph_emitted")).toBe(true);
  });
});
