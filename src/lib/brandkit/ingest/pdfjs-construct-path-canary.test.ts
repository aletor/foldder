import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { configurePdfJsForNodeServer, pdfJsGetDocumentInit } from "@/lib/brain/pdfjs-server";
import {
  assertConstructPathArgsFormat,
  PDFJS_CONSTRUCT_PATH_CANARY,
  readConstructPathMinMax,
} from "./page-vision-pdf-vector-walk";

const PDF = path.join(process.cwd(), "fixtures/brandkit/catalogo26.pdf");

describe.skipIf(!fs.existsSync(PDF))("pdfjs constructPath canary — catalogo26 p2", () => {
  it("falla con mensaje claro si pdf.js cambia el formato de constructPath args", async () => {
    const buffer = fs.readFileSync(PDF);
    const pdfjs = await configurePdfJsForNodeServer();
    const ops = pdfjs.OPS;
    const pdf = await pdfjs
      .getDocument(pdfJsGetDocumentInit(buffer) as Parameters<typeof pdfjs.getDocument>[0])
      .promise;
    try {
      const page = await pdf.getPage(2);
      const ol = await page.getOperatorList();
      const hit = ol.fnArray.findIndex((fn) => fn === ops.constructPath);
      expect(hit).toBeGreaterThanOrEqual(0);
      const args = ol.argsArray[hit] ?? [];
      expect(() => assertConstructPathArgsFormat(args)).not.toThrow();
      expect(args[0]).toBe(PDFJS_CONSTRUCT_PATH_CANARY.opCount);
      const minMax = readConstructPathMinMax(args);
      expect(minMax).not.toBeNull();
      expect(minMax!.x1).toBeCloseTo(PDFJS_CONSTRUCT_PATH_CANARY.minMax[0], 2);
      expect(minMax!.y1).toBeCloseTo(PDFJS_CONSTRUCT_PATH_CANARY.minMax[1], 2);
      expect(minMax!.x2).toBeCloseTo(PDFJS_CONSTRUCT_PATH_CANARY.minMax[2], 2);
      expect(minMax!.y2).toBeCloseTo(PDFJS_CONSTRUCT_PATH_CANARY.minMax[3], 2);
    } finally {
      await pdf.destroy();
    }
  });
});
