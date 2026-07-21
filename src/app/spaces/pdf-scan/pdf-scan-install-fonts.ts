"use client";

import {
  mergeAndInstallDesignerCustomFonts,
  type DesignerCustomFontStyle,
} from "@/app/spaces/freehand/designer-custom-fonts";
import type { PdfScanFontAsset } from "@/lib/pdf-scan/pdf-scan-types";

export function pdfScanFontsToDesignerCustom(fonts: PdfScanFontAsset[]): DesignerCustomFontStyle[] {
  return fonts
    .filter((f) => f.family?.trim() && f.url)
    .map((f) => ({
      family: f.family.trim(),
      style: f.style?.trim() || "Regular",
      weight: f.weight || 400,
      url: f.url,
    }));
}

/** Instala tipografías PDFScan en el almacén Designer (FontFace + localStorage + evento). */
export async function installPdfScanFontsIntoDesigner(
  fonts: PdfScanFontAsset[] | undefined | null,
): Promise<number> {
  if (!fonts?.length) return 0;
  const mapped = pdfScanFontsToDesignerCustom(fonts);
  if (!mapped.length) return 0;
  await mergeAndInstallDesignerCustomFonts(mapped);
  return mapped.length;
}
