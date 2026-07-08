import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  assertPdfJsWasmRuntime,
  configurePdfJsForNodeServer,
  loadPdfJsDocumentFromBuffer,
  PDFJS_OPENJPEG_WASM_PATH,
  PDFJS_WASM_URL,
} from "./pdfjs-server";
import {
  ESADE_PITCH_PDF,
  LEAN_FINANCE_PITCH_PDF,
  hasEsadePitchPdf,
  hasLeanFinancePitchPdf,
} from "@/lib/genoma/fixtures/brandkit-paths";
import { extractEmbeddedRasterImagesFromPdf } from "./pdf-visual-extract";

const FIXTURE = path.join(process.cwd(), "docs/FOLDDER-guia-nodos-usuario.pdf");

describe("pdfjs-server", () => {
  it("resuelve wasm OpenJPEG en runtime (no solo cwd)", () => {
    const check = assertPdfJsWasmRuntime();
    expect(check.ok).toBe(true);
    expect(fs.existsSync(PDFJS_OPENJPEG_WASM_PATH)).toBe(true);
    expect(PDFJS_WASM_URL).toContain(`${path.sep}wasm${path.sep}`);
  });

  it.skipIf(!fs.existsSync(FIXTURE))("carga PDF en Node sin worker roto", async () => {
    const buffer = fs.readFileSync(FIXTURE);
    const { pdf } = await loadPdfJsDocumentFromBuffer(buffer);
    expect(pdf.numPages).toBeGreaterThan(0);
    await pdf.destroy();
  });

  it.skipIf(!hasLeanFinancePitchPdf())(
    "decodifica operator list en pitch Lean Finance (JPEG2000)",
    async () => {
      const buffer = fs.readFileSync(LEAN_FINANCE_PITCH_PDF);
      await configurePdfJsForNodeServer();
      const { pdf } = await loadPdfJsDocumentFromBuffer(buffer);
      try {
        const page = await pdf.getPage(1);
        const ops = await page.getOperatorList();
        expect(ops.fnArray.length).toBeGreaterThan(0);
      } finally {
        await pdf.destroy();
      }
    },
    30_000,
  );

  it.skipIf(!hasLeanFinancePitchPdf())(
    "embedded raster scan no lanza aunque alguna imagen falle",
    async () => {
      const buffer = fs.readFileSync(LEAN_FINANCE_PITCH_PDF);
      const images = await extractEmbeddedRasterImagesFromPdf(buffer, { maxPages: 3 });
      expect(Array.isArray(images)).toBe(true);
    },
    30_000,
  );
});

describe.skipIf(!hasEsadePitchPdf())("pdfjs-server — ESADE pitch", () => {
  it("prepass raster scan completa sin throw", async () => {
    const buffer = fs.readFileSync(ESADE_PITCH_PDF);
    const images = await extractEmbeddedRasterImagesFromPdf(buffer, { maxPages: 5 });
    expect(Array.isArray(images)).toBe(true);
  }, 30_000);
});
