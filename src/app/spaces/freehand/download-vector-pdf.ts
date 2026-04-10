"use client";

import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";

/**
 * Genera un PDF vectorial a partir del markup SVG ya preparado para export
 * (mismo string que se usa para descargar .svg).
 */
export async function downloadSvgAsVectorPdf(svgMarkup: string, filename: string): Promise<void> {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(svgMarkup, "image/svg+xml");
  if (parsed.querySelector("parsererror")) {
    throw new Error("SVG inválido para export PDF");
  }
  const svgRoot = parsed.documentElement;
  const w = Math.max(1, parseFloat(svgRoot.getAttribute("width") || "1"));
  const h = Math.max(1, parseFloat(svgRoot.getAttribute("height") || "1"));
  const wPt = (w * 72) / 96;
  const hPt = (h * 72) / 96;

  const pdf = new jsPDF({
    unit: "pt",
    format: [wPt, hPt],
    orientation: wPt >= hPt ? "landscape" : "portrait",
    compress: true,
  });

  await svg2pdf(svgRoot, pdf, { x: 0, y: 0, width: wPt, height: hPt });
  pdf.save(filename);
}
