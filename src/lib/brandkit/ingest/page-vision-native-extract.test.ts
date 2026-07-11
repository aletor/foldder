import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractNativeLogoInBbox, nativeAssetAllowsVectorize } from "./page-vision-native-extract";
import { buildLogoCandidatesFromPageVision } from "./page-vision-pass-apply";
import type { PageVisionPassRunAudit } from "./page-vision-pass-runner";

const CATALOGO_PDF = path.join(process.cwd(), "fixtures/brandkit/catalogo26.pdf");
const OARO_PDF = path.join(process.cwd(), "fixtures/brandkit/sample-brand-deck.pdf");
const OARO_AUDIT = path.join(
  process.cwd(),
  "fixtures/page-vision-pass/runs/1afbf7f6630a-2026-07-07T06-51-28-568Z.audit.json",
);

describe.skipIf(!fs.existsSync(CATALOGO_PDF))("page-vision-native-extract — catalogo26 p2", () => {
  it("extrae vector_native SVG en bbox del logo (pág. 2)", async () => {
    const buffer = fs.readFileSync(CATALOGO_PDF);
    const asset = await extractNativeLogoInBbox({
      buffer,
      pageNumber: 2,
      bbox: [0.308, 0.46, 0.69, 0.54],
    });
    expect(asset).not.toBeNull();
    expect(asset!.origin).toBe("vector_native");
    expect(asset!.svg).toContain("<svg");
    expect(nativeAssetAllowsVectorize(asset!.origin)).toBe(false);
  });
});

describe.skipIf(!fs.existsSync(OARO_PDF) || !fs.existsSync(OARO_AUDIT))(
  "page-vision-native-extract — OARO deck (xobject_native)",
  () => {
    it("extrae xobject_native cuando pdfjs resuelve XObjects por callback", async () => {
      const buffer = fs.readFileSync(OARO_PDF);
      const audit = JSON.parse(fs.readFileSync(OARO_AUDIT, "utf8")) as PageVisionPassRunAudit;
      const entries = await buildLogoCandidatesFromPageVision(audit, buffer, "src_oaro");
      expect(entries.length).toBeGreaterThan(0);
      const primary = entries.find((e) => e.slot === "primary");
      expect(primary?.candidate.value.assetOrigin).toBe("xobject_native");
      expect(primary?.wordmarkIntegrityOk).toBe(false);
    });
  },
);
