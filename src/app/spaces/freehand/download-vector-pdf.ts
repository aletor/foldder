"use client";

import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";
import { sanitizeSvgNamedEntitiesForXml } from "./freehand-export";
import { fetchBlobViaSpacesProxy } from "@/lib/spaces-proxy-fetch";

/** 1×1 transparente: último recurso si no podemos incrustar una imagen remota (evita que svg2pdf falle por XHR/CORS). */
const STUB_IMAGE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

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
  const bytes = new Uint8Array(buffer);
  const parts: string[] = [];
  const step = 8192;
  /** Sin `fromCharCode(...subarray)`: miles de argumentos al spread agotan la pila (p. ej. fotos grandes en el PDF). */
  for (let i = 0; i < bytes.byteLength; i += step) {
    const end = Math.min(i + step, bytes.byteLength);
    let block = "";
    for (let j = i; j < end; j++) block += String.fromCharCode(bytes[j]!);
    parts.push(block);
  }
  return btoa(parts.join(""));
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
    let href = img.getAttribute("href") || img.getAttribute("xlink:href");
    if (!href || href.startsWith("data:") || href.startsWith("#")) continue;
    if (href.startsWith("//")) href = `https:${href}`;
    if (!href.startsWith("http://") && !href.startsWith("https://")) continue;

    const target = href;
    tasks.push(
      (async () => {
        const dataUrl = await fetchRemoteImageAsDataUrl(target);
        if (!dataUrl) return;
        img.setAttribute("href", dataUrl);
        img.removeAttribute("xlink:href");
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

/** Carga una URL absoluta http(s) o // vía proxy y devuelve data URL, o null. */
async function fetchRemoteImageAsDataUrl(href: string): Promise<string | null> {
  let url = href.trim();
  if (url.startsWith("//")) url = `https:${url}`;
  if (!url.startsWith("http://") && !url.startsWith("https://")) return null;
  try {
    const blob = await fetchBlobViaSpacesProxy(url);
    const buf = await blob.arrayBuffer();
    const mime = blob.type && blob.type !== "application/octet-stream" ? blob.type : guessMimeFromUrl(url);
    return `data:${mime};base64,${arrayBufferToBase64(buf)}`;
  } catch {
    return null;
  }
}

/**
 * svg2pdf.js aplica un `RegExp` al data URL completo (grupo con cuantificador sobre el payload). En imágenes grandes
 * eso puede provocar RangeError (pila) en el motor. Sustituir por `blob:` cortos hace que la librería
 * cargue vía XHR y evita ese `String.match` sobre megabytes.
 */
const LARGE_DATA_URL_FOR_SVG2PDF = 32 * 1024;

/** Calidad JPEG al optimizar (0–1). ~0.72 suele dar buen equilibrio peso/calidad en documentos. */
const PDF_OPTIMIZE_JPEG_QUALITY = 0.72;

export type VectorPdfPipelineOptions = {
  /** Convierte PNG/WebP/GIF/JPEG raster a JPEG con `PDF_OPTIMIZE_JPEG_QUALITY`; no toca `image/svg+xml`. */
  optimizeImages?: boolean;
};

async function rasterBlobToJpegDataUrl(blob: Blob, quality: number): Promise<string | null> {
  if (blob.type === "image/svg+xml") return null;
  try {
    const bmp = await createImageBitmap(blob);
    try {
      const w = bmp.width;
      const h = bmp.height;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bmp, 0, 0);
      const out = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
      });
      if (!out) return null;
      const buf = await out.arrayBuffer();
      return `data:image/jpeg;base64,${arrayBufferToBase64(buf)}`;
    } finally {
      bmp.close();
    }
  } catch {
    return null;
  }
}

/**
 * Recomprime cada `<image>` raster como JPEG para reducir tamaño en el PDF.
 * Procesa en serie para limitar picos de memoria.
 */
async function recompressRasterImagesForPdf(svgMarkup: string, quality: number): Promise<string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgMarkup, "image/svg+xml");
  if (doc.querySelector("parsererror")) return svgMarkup;

  const images = doc.querySelectorAll("image");
  for (const img of images) {
    let href = img.getAttribute("href") || img.getAttribute("xlink:href");
    if (!href || href.startsWith("#")) continue;
    if (href.startsWith("//")) href = `https:${href}`;
    try {
      let fetchHref = href;
      if (href.startsWith("http://") || href.startsWith("https://")) {
        const proxied = await fetchRemoteImageAsDataUrl(href);
        if (!proxied) continue;
        fetchHref = proxied;
      }
      const res = await fetch(fetchHref);
      if (!res.ok) continue;
      const blob = await res.blob();
      const jpegDataUrl = await rasterBlobToJpegDataUrl(blob, quality);
      if (!jpegDataUrl) continue;
      img.setAttribute("href", jpegDataUrl);
      img.removeAttribute("xlink:href");
    } catch {
      /* mantener href original */
    }
  }
  return new XMLSerializer().serializeToString(doc.documentElement);
}

async function prepareSvgMarkupForVectorPdf(
  svgMarkup: string,
  opts?: VectorPdfPipelineOptions,
): Promise<{ markup: string; cleanup: () => void }> {
  let m = sanitizeSvgNamedEntitiesForXml(svgMarkup);
  m = await inlineRemoteSvgImagesForPdf(m);
  if (opts?.optimizeImages) {
    m = await recompressRasterImagesForPdf(m, PDF_OPTIMIZE_JPEG_QUALITY);
  }
  const withBlobs = await rewriteLargeDataUrlImagesForSvg2pdf(m);
  return finalizeRemoteImagesForSvg2pdf(withBlobs.markup, withBlobs.cleanup);
}

/**
 * Cualquier `http(s)` residual haría que svg2pdf use XHR y falle por CORS.
 * Reintenta el proxy por imagen (p. ej. tras reescritura a blob); si sigue fallando, píxel transparente.
 */
async function finalizeRemoteImagesForSvg2pdf(
  svgMarkup: string,
  prevCleanup: () => void,
): Promise<{ markup: string; cleanup: () => void }> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgMarkup, "image/svg+xml");
  if (doc.querySelector("parsererror")) {
    return { markup: svgMarkup, cleanup: prevCleanup };
  }
  let stubbed = false;
  for (const img of doc.querySelectorAll("image")) {
    let href = img.getAttribute("href") || img.getAttribute("xlink:href") || "";
    if (!href || href.startsWith("data:") || href.startsWith("blob:") || href.startsWith("#")) continue;
    if (href.startsWith("//")) href = `https:${href}`;
    if (!href.startsWith("http://") && !href.startsWith("https://")) continue;
    const dataUrl = await fetchRemoteImageAsDataUrl(href);
    if (dataUrl) {
      img.setAttribute("href", dataUrl);
      img.removeAttribute("xlink:href");
    } else {
      img.setAttribute("href", STUB_IMAGE_DATA_URL);
      img.removeAttribute("xlink:href");
      stubbed = true;
    }
  }
  if (stubbed) {
    console.warn(
      "[PDF] Una o más imágenes remotas no se pudieron incrustar; se sustituyeron por un píxel transparente para completar el PDF.",
    );
  }
  return {
    markup: new XMLSerializer().serializeToString(doc.documentElement),
    cleanup: prevCleanup,
  };
}

async function rewriteLargeDataUrlImagesForSvg2pdf(svgMarkup: string): Promise<{
  markup: string;
  cleanup: () => void;
}> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgMarkup, "image/svg+xml");
  if (doc.querySelector("parsererror")) {
    return { markup: svgMarkup, cleanup: () => {} };
  }

  const blobUrls: string[] = [];
  const images = doc.querySelectorAll("image");

  for (const img of images) {
    const href = img.getAttribute("href") || img.getAttribute("xlink:href") || "";
    if (!href.startsWith("data:") || href.length <= LARGE_DATA_URL_FOR_SVG2PDF) continue;

    try {
      const res = await fetch(href);
      if (!res.ok) continue;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      blobUrls.push(url);
      img.setAttribute("href", url);
      img.removeAttribute("xlink:href");
    } catch {
      /* mantener data: — puede seguir fallando en svg2pdf */
    }
  }

  return {
    markup: new XMLSerializer().serializeToString(doc.documentElement),
    cleanup: () => {
      for (const u of blobUrls) URL.revokeObjectURL(u);
    },
  };
}

/**
 * Genera un PDF vectorial a partir del markup SVG ya preparado para export
 * (mismo string que se usa para descargar .svg).
 */
export async function downloadSvgAsVectorPdf(
  svgMarkup: string,
  filename: string,
  opts?: VectorPdfPipelineOptions,
): Promise<void> {
  const { markup, cleanup } = await prepareSvgMarkupForVectorPdf(svgMarkup, opts);
  try {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(markup, "image/svg+xml");
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
  } finally {
    cleanup();
  }
}

/** Misma pipeline que `downloadSvgAsVectorPdf` pero devuelve el PDF como Blob (ZIP / lote). */
export async function svgMarkupToPdfBlob(svgMarkup: string, opts?: VectorPdfPipelineOptions): Promise<Blob> {
  const { markup, cleanup } = await prepareSvgMarkupForVectorPdf(svgMarkup, opts);
  try {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(markup, "image/svg+xml");
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
  } finally {
    cleanup();
  }
}

/**
 * Une varias páginas SVG (ya preparadas para PDF, p. ej. con texto como trazos) en un solo PDF vectorial.
 */
export async function downloadMultiPageVectorPdf(
  svgMarkups: string[],
  filename: string,
  opts?: VectorPdfPipelineOptions,
): Promise<void> {
  if (svgMarkups.length === 0) return;
  let pdf: InstanceType<typeof jsPDF> | null = null;
  for (let i = 0; i < svgMarkups.length; i++) {
    const svgMarkup = svgMarkups[i]!;
    const { markup, cleanup } = await prepareSvgMarkupForVectorPdf(svgMarkup, opts);
    try {
      const parser = new DOMParser();
      const parsed = parser.parseFromString(markup, "image/svg+xml");
      const pe = parsed.querySelector("parsererror");
      if (pe) {
        console.warn("[PDF multipágina] SVG con error de parseo, página omitida:", pe.textContent?.trim()?.slice(0, 200));
        continue;
      }
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
    } finally {
      cleanup();
    }
  }
  if (pdf) pdf.save(filename);
}
