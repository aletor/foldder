/**
 * Refinado post-bbox (logo-lab) para ingest PDF — sin coste API adicional.
 */

import type { PageVisionLogoInstance } from "./page-vision-pass-schema";
import type { BBoxXYXY } from "./page-vision-pass-bbox";
import { resolveAuditBbox } from "./page-vision-pass-bbox";
import { renderVisionBatchFramePng } from "@/lib/genoma/logo-lab/render-page";
import { refineLogoLabBbox } from "@/lib/genoma/logo-lab/refine-bbox";

export type PdfLogoRefineCrop = {
  png: Buffer;
  refinedBbox: BBoxXYXY;
  method: "pdf_object" | "contrast" | "seed_only";
};

/** Refina bbox Gemini/PDF y devuelve crop PNG a resolución de frame de visión. */
export async function refineAndCropPdfLogoInstance(input: {
  pdfBuffer: Buffer;
  pageNumber: number;
  instance: PageVisionLogoInstance;
}): Promise<PdfLogoRefineCrop | null> {
  try {
    const frame = await renderVisionBatchFramePng(input.pdfBuffer, input.pageNumber);
    const seedBbox = resolveAuditBbox(input.instance.bbox);
    const refined = await refineLogoLabBbox({
      pdfBuffer: input.pdfBuffer,
      pageNumber: input.pageNumber,
      seedBbox,
      framePng: frame.pngBuffer,
      frameWidth: frame.width,
      frameHeight: frame.height,
    });
    if (!refined.logoCropPng.length) return null;
    return {
      png: refined.logoCropPng,
      refinedBbox: resolveAuditBbox(refined.refinedBbox),
      method: refined.method,
    };
  } catch {
    return null;
  }
}
