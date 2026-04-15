"use client";

import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";

/** svg2pdf usa XHR sobre href remotos; S3 prefirmado suele fallar por CORS y rechaza con ProgressEvent. */
function normalizeSvg2PdfReason(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  if (reason != null && typeof reason === "object" && "type" in reason) {
    const t = (reason as { type?: string }).type;
    if (t === "error" || t === "abort" || t === "progress") {
      return new Error(
        "No se pudo cargar una imagen embebida en el SVG (CORS o red). Las imágenes remotas se incrustan vía proxy antes de generar el PDF.",
      );
    }
  }
  return new Error(String(reason));
}

async function runSvg2pdf(
  svgRoot: Element,
  pdf: InstanceType<typeof jsPDF>,
  opts: { x: number; y: number; width: number; height: number },
): Promise<void> {
  try {
    await svg2pdf(svgRoot, pdf, opts);
  } catch (e) {
    throw normalizeSvg2PdfReason(e);
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.byteLength; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Sustituye `<image href="https://...">` por data URLs usando el proxy del servidor,
 * para que svg2pdf no use XHR directo contra S3 (CORS).
 */
export async function inlineRemoteSvgImagesForPdf(svgMarkup: string): Promise<string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgMarkup, "image/svg+xml");
  if (doc.querySelector("parsererror")) return svgMarkup;

  const images = doc.querySelectorAll("image");
  const tasks: Promise<void>[] = [];

  for (const img of images) {
    const href = img.getAttribute("href") || img.getAttribute("xlink:href");
    if (!href || href.startsWith("data:") || href.startsWith("#")) continue;
    if (!href.startsWith("http://") && !href.startsWith("https://")) continue;

    tasks.push(
      (async () => {
        try {
          const proxy = `/api/spaces/proxy?url=${encodeURIComponent(href)}`;
          const res = await fetch(proxy);
          if (!res.ok) return;
          const blob = await res.blob();
          const buf = await blob.arrayBuffer();
          const mime = blob.type && blob.type !== "application/octet-stream" ? blob.type : guessMimeFromUrl(href);
          const dataUrl = `data:${mime};base64,${arrayBufferToBase64(buf)}`;
          img.setAttribute("href", dataUrl);
          img.removeAttribute("xlink:href");
        } catch {
          /* dejar href; svg2pdf puede fallar — error unificado arriba */
        }
      })(),
    );
  }

  await Promise.all(tasks);
  return new XMLSerializer().serializeToString(doc.documentElement);
}

function guessMimeFromUrl(url: string): string {
  const lower = url.split("?")[0]?.toLowerCase() ?? "";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/png";
}

/**
 * Genera un PDF vectorial a partir del markup SVG ya preparado para export
 * (mismo string que se usa para descargar .svg).
 */
export async function downloadSvgAsVectorPdf(svgMarkup: string, filename: string): Promise<void> {
  const inlined = await inlineRemoteSvgImagesForPdf(svgMarkup);
  const parser = new DOMParser();
  const parsed = parser.parseFromString(inlined, "image/svg+xml");
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

  await runSvg2pdf(svgRoot, pdf, { x: 0, y: 0, width: wPt, height: hPt });
  pdf.save(filename);
}

/** Misma pipeline que `downloadSvgAsVectorPdf` pero devuelve el PDF como Blob (ZIP / lote). */
export async function svgMarkupToPdfBlob(svgMarkup: string): Promise<Blob> {
  const inlined = await inlineRemoteSvgImagesForPdf(svgMarkup);
  const parser = new DOMParser();
  const parsed = parser.parseFromString(inlined, "image/svg+xml");
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

  await runSvg2pdf(svgRoot, pdf, { x: 0, y: 0, width: wPt, height: hPt });
  return pdf.output("blob") as Blob;
}

/**
 * Une varias páginas SVG (ya preparadas para PDF, p. ej. con texto como trazos) en un solo PDF vectorial.
 */
export async function downloadMultiPageVectorPdf(
  svgMarkups: string[],
  filename: string,
): Promise<void> {
  if (svgMarkups.length === 0) return;
  let pdf: InstanceType<typeof jsPDF> | null = null;
  for (let i = 0; i < svgMarkups.length; i++) {
    const svgMarkup = svgMarkups[i]!;
    const inlined = await inlineRemoteSvgImagesForPdf(svgMarkup);
    const parser = new DOMParser();
    const parsed = parser.parseFromString(inlined, "image/svg+xml");
    if (parsed.querySelector("parsererror")) continue;
    const svgRoot = parsed.documentElement;
    const w = Math.max(1, parseFloat(svgRoot.getAttribute("width") || "1"));
    const h = Math.max(1, parseFloat(svgRoot.getAttribute("height") || "1"));
    const wPt = (w * 72) / 96;
    const hPt = (h * 72) / 96;
    const orientation = wPt >= hPt ? "landscape" : "portrait";
    // Primera página *válida* crea el doc; si las anteriores fallaron el parse, i>0 pero pdf sigue null.
    if (pdf === null) {
      pdf = new jsPDF({
        unit: "pt",
        format: [wPt, hPt],
        orientation,
        compress: true,
      });
    } else {
      pdf.addPage([wPt, hPt], orientation);
    }
    await runSvg2pdf(svgRoot, pdf, { x: 0, y: 0, width: wPt, height: hPt });
  }
  if (pdf) pdf.save(filename);
}
