"use client";

import { jsPDF } from "jspdf";
import { INDESIGN_PAD } from "./page-formats";
import { syncIndesignPageBackground } from "./indesign-page-background";

/**
 * Opciones jsPDF en px alineadas al pliego: orientación según ancho/alto para que el PDF no deforme el aspect ratio.
 * (Sin esto, páginas apaisadas a veces quedan con caja de página incorrecta.)
 */
export function jspdfOptionsForPagePx(width: number, height: number) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const landscape = w >= h;
  return {
    unit: "px" as const,
    format: [w, h] as [number, number],
    orientation: landscape ? ("l" as const) : ("p" as const),
    compress: true,
    hotfixes: ["px_scaling"],
  };
}

type PageExport = {
  width: number;
  height: number;
  fabricJSON: Record<string, unknown> | null;
};

/**
 * Exporta todas las páginas a un PDF raster (JPEG rápido o PNG calidad x2).
 */
export async function exportIndesignPagesPdf(
  pages: PageExport[],
  mode: "fast" | "quality",
  fileName = "layout-export.pdf",
): Promise<void> {
  if (pages.length === 0) return;
  const fabric = await import("fabric");

  const first = pages[0];
  const doc = new jsPDF(jspdfOptionsForPagePx(first.width, first.height));

  for (let i = 0; i < pages.length; i++) {
    const { width: pw, height: ph, fabricJSON } = pages[i];
    const cw = pw + INDESIGN_PAD * 2;
    const ch = ph + INDESIGN_PAD * 2;

    const el = document.createElement("canvas");
    const { Canvas, Rect } = fabric;
    const canvas = new Canvas(el, {
      width: cw,
      height: ch,
      backgroundColor: "#2a2a32",
    });

    const json =
      fabricJSON && Object.keys(fabricJSON).length > 0
        ? fabricJSON
        : { objects: [], background: "#2a2a32" };
    await canvas.loadFromJSON(json);
    syncIndesignPageBackground(canvas, Rect, pw, ph);
    canvas.requestRenderAll();

    const mult = mode === "quality" ? 2 : 1;
    const dataUrl = canvas.toDataURL({
      format: mode === "fast" ? "jpeg" : "png",
      quality: mode === "fast" ? 0.82 : 1,
      multiplier: mult,
      left: INDESIGN_PAD,
      top: INDESIGN_PAD,
      width: pw,
      height: ph,
    });

    const fmt = mode === "fast" ? "JPEG" : "PNG";
    if (i > 0) doc.addPage([pw, ph], pw >= ph ? "l" : "p");
    doc.addImage(dataUrl, fmt, 0, 0, pw, ph, undefined, mode === "fast" ? "FAST" : "NONE");

    canvas.dispose();
  }

  doc.save(fileName);
}
