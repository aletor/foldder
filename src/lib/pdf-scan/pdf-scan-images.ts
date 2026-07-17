import crypto from "crypto";
import { extractEmbeddedRasterImagesFromPdf, type PdfEmbeddedRasterImage } from "@/lib/brain/pdf-visual-extract";
import { PDF_SCAN_MAX_IMAGES, PDF_SCAN_MAX_PAGES } from "./pdf-scan-types";

export async function extractPdfScanEmbeddedImages(
  buffer: Buffer,
  options?: { maxPages?: number; maxImages?: number },
): Promise<PdfEmbeddedRasterImage[]> {
  return extractEmbeddedRasterImagesFromPdf(buffer, {
    maxPages: options?.maxPages ?? PDF_SCAN_MAX_PAGES,
    maxScans: 200,
    mode: "all",
    maxImages: options?.maxImages ?? PDF_SCAN_MAX_IMAGES,
  });
}

export function sha256Hex(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
