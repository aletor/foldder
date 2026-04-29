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
const SVG_NS = "http://www.w3.org/2000/svg";

function hasTransparencyInImageData(data: ImageData): boolean {
  const d = data.data;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i]! < 255) return true;
  }
  return false;
}

function parseMarkerUrlRef(v: string | null): string | null {
  if (!v) return null;
  const m = v.trim().match(/^url\((['"]?)#([^'")]+)\1\)$/i);
  return m?.[2] ?? null;
}

function asNum(v: string | null | undefined, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parsePointsAttr(raw: string | null): Array<{ x: number; y: number }> {
  if (!raw) return [];
  const nums = raw
    .trim()
    .replace(/,/g, " ")
    .split(/\s+/)
    .map((t) => Number(t))
    .filter((n) => Number.isFinite(n));
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i]!, y: nums[i + 1]! });
  return out;
}

function endpointAndAngleForGeometry(
  el: Element,
  atStart: boolean,
): { x: number; y: number; angleDeg: number } | null {
  const tag = el.tagName.toLowerCase();
  if (tag === "line") {
    const x1 = asNum(el.getAttribute("x1"));
    const y1 = asNum(el.getAttribute("y1"));
    const x2 = asNum(el.getAttribute("x2"));
    const y2 = asNum(el.getAttribute("y2"));
    const angleDeg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    return atStart ? { x: x1, y: y1, angleDeg } : { x: x2, y: y2, angleDeg };
  }
  if (tag === "polyline" || tag === "polygon") {
    const pts = parsePointsAttr(el.getAttribute("points"));
    if (pts.length < 2) return null;
    if (atStart) {
      const p0 = pts[0]!;
      const p1 = pts[1]!;
      return { x: p0.x, y: p0.y, angleDeg: (Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI };
    }
    const pn = pts[pts.length - 1]!;
    const pp = pts[pts.length - 2]!;
    return { x: pn.x, y: pn.y, angleDeg: (Math.atan2(pn.y - pp.y, pn.x - pp.x) * 180) / Math.PI };
  }
  try {
    const geom = el as SVGGeometryElement;
    const total = geom.getTotalLength();
    if (!(total > 0)) return null;
    const eps = Math.max(0.01, Math.min(0.5, total / 200));
    if (atStart) {
      const p0 = geom.getPointAtLength(0);
      const p1 = geom.getPointAtLength(Math.min(total, eps));
      return { x: p0.x, y: p0.y, angleDeg: (Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI };
    }
    const pn = geom.getPointAtLength(total);
    const pp = geom.getPointAtLength(Math.max(0, total - eps));
    return { x: pn.x, y: pn.y, angleDeg: (Math.atan2(pn.y - pp.y, pn.x - pp.x) * 180) / Math.PI };
  } catch {
    return null;
  }
}

function patchContextPaintAttrs(root: Element, stroke: string | null, fill: string | null) {
  const all = [root, ...Array.from(root.querySelectorAll("*"))];
  for (const n of all) {
    const s = n.getAttribute("stroke");
    if (s === "context-stroke" && stroke) n.setAttribute("stroke", stroke);
    const f = n.getAttribute("fill");
    if (f === "context-fill" && fill) n.setAttribute("fill", fill);
  }
}

/**
 * svg2pdf tiene discrepancias con `marker-start/end` (orientación/escala en algunos trazos).
 * Para PDF convertimos marcadores en geometría explícita en extremos de path/line/polyline/polygon.
 */
function expandSvgMarkersToPathsForPdf(svgMarkup: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgMarkup, "image/svg+xml");
  if (doc.querySelector("parsererror")) return svgMarkup;

  const candidates = doc.querySelectorAll("path, line, polyline, polygon");
  for (const el of candidates) {
    const markerStartId = parseMarkerUrlRef(el.getAttribute("marker-start"));
    const markerEndId = parseMarkerUrlRef(el.getAttribute("marker-end"));
    if (!markerStartId && !markerEndId) continue;
    const parent = el.parentNode;
    if (!parent) continue;
    const sourceTransform = el.getAttribute("transform") ?? "";
    const sourceStroke = el.getAttribute("stroke");
    const sourceFill = el.getAttribute("fill");
    const strokeWidth = Math.max(0, asNum(el.getAttribute("stroke-width"), 1));

    const addMarker = (markerId: string, atStart: boolean) => {
      const mk = doc.getElementById(markerId);
      if (!mk || mk.tagName.toLowerCase() !== "marker") return;
      const pos = endpointAndAngleForGeometry(el, atStart);
      if (!pos) return;
      const refX = asNum(mk.getAttribute("refX"));
      const refY = asNum(mk.getAttribute("refY"));
      const orient = (mk.getAttribute("orient") ?? "auto").trim().toLowerCase();
      let angle = pos.angleDeg;
      if (orient === "auto-start-reverse" && atStart) angle += 180;
      const markerUnits = (mk.getAttribute("markerUnits") ?? "strokeWidth").trim();
      const unitScale = markerUnits === "userSpaceOnUse" ? 1 : Math.max(0.0001, strokeWidth);

      const g = doc.createElementNS(SVG_NS, "g");
      const tParts = [];
      if (sourceTransform) tParts.push(sourceTransform);
      tParts.push(`translate(${pos.x} ${pos.y}) rotate(${angle})`);
      if (Math.abs(unitScale - 1) > 1e-9) tParts.push(`scale(${unitScale})`);
      tParts.push(`translate(${-refX} ${-refY})`);
      g.setAttribute("transform", tParts.join(" "));

      for (const child of Array.from(mk.children)) {
        g.appendChild(child.cloneNode(true));
      }
      patchContextPaintAttrs(g, sourceStroke, sourceFill);
      parent.insertBefore(g, el.nextSibling);
    };

    if (markerStartId) addMarker(markerStartId, true);
    if (markerEndId) addMarker(markerEndId, false);
    el.removeAttribute("marker-start");
    el.removeAttribute("marker-end");
    el.removeAttribute("marker-mid");
  }

  return new XMLSerializer().serializeToString(doc.documentElement);
}

/** Muestreo rápido de alpha (misma idea que en designer-image-pipeline). */
async function imageBitmapLikelyHasAlpha(bmp: ImageBitmap, mimeHint: string): Promise<boolean> {
  const mimeLower = (mimeHint || "").toLowerCase();
  if (mimeLower.includes("jpeg") || mimeLower.includes("jpg")) return false;
  if (mimeLower.includes("png") || mimeLower.includes("webp") || mimeLower.includes("gif")) {
    const w = Math.min(64, bmp.width);
    const h = Math.min(64, bmp.height);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return true;
    ctx.drawImage(bmp, 0, 0, w, h);
    try {
      const id = ctx.getImageData(0, 0, w, h);
      return hasTransparencyInImageData(id);
    } catch {
      return true;
    }
  }
  const w = Math.min(64, bmp.width);
  const h = Math.min(64, bmp.height);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return true;
  ctx.drawImage(bmp, 0, 0, w, h);
  try {
    const id = ctx.getImageData(0, 0, w, h);
    return hasTransparencyInImageData(id);
  } catch {
    return true;
  }
}

export type VectorPdfPipelineOptions = {
  /**
   * Reduce peso del PDF: JPEG (~calidad 0.72) para mapas opacos; PNG sin fondo blanco si hay transparencia
   * (evita “cuadro blanco” al convertir PNG con alpha). No toca `image/svg+xml`.
   */
  optimizeImages?: boolean;
};

/**
 * Recomprime rasters para el PDF: JPEG con fondo blanco solo si no hay canal alpha; si hay alpha, PNG sobre canvas transparente.
 */
async function rasterBlobToOptimizedPdfDataUrl(blob: Blob, quality: number): Promise<string | null> {
  if (blob.type === "image/svg+xml") return null;
  try {
    const bmp = await createImageBitmap(blob);
    try {
      const w = bmp.width;
      const h = bmp.height;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { alpha: true });
      if (!ctx) return null;

      const hasAlpha = await imageBitmapLikelyHasAlpha(bmp, blob.type);

      if (hasAlpha) {
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(bmp, 0, 0);
        const out = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((b) => resolve(b), "image/png");
        });
        if (!out) return null;
        const buf = await out.arrayBuffer();
        return `data:image/png;base64,${arrayBufferToBase64(buf)}`;
      }

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
 * Recomprime cada `<image>` raster para el PDF (JPEG opacos, PNG si hay transparencia).
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
      const dataUrl = await rasterBlobToOptimizedPdfDataUrl(blob, quality);
      if (!dataUrl) continue;
      img.setAttribute("href", dataUrl);
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
  m = expandSvgMarkersToPathsForPdf(m);
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
