import sharp from "sharp";
import type {
  PdfDocumentClipObject,
  PdfDocumentGroupObject,
  PdfDocumentImageObject,
  PdfDocumentObject,
  PdfDocumentPathObject,
} from "./pdf-scan-types";
import { stripInvalidXmlChars } from "./pdf-scan-sanitize";

/** Tile size (px) for regional error scan. */
export const PDF_FIDELITY_TILE = 48;
/** Mean absolute RGB error (0–255) above which a tile is a hotspot. */
export const PDF_FIDELITY_TILE_MAE = 28;
/** Page SSIM below this → page fails QA (still may get regional fallbacks). */
export const PDF_FIDELITY_SSIM_PASS = 0.85;
/** Cap fallbacks per page to avoid exploding object count. */
export const PDF_FIDELITY_MAX_FALLBACKS = 8;
/** Downsample edge for global SSIM (speed). */
export const PDF_FIDELITY_SSIM_EDGE = 96;
/** Evita SVG gigantes (paths densos + data URLs) que tumbaron sharp/libvips. */
export const PDF_FIDELITY_MAX_SVG_CHARS = 750_000;
/** Máx. paths en el rebuild SVG de QA (el resto se cubre con fallbacks regionales). */
export const PDF_FIDELITY_MAX_SVG_PATHS = 180;

export { stripInvalidXmlChars } from "./pdf-scan-sanitize";

export type FidelityBox = { x: number; y: number; w: number; h: number; mae: number; reason: string };

export type PageFidelityReport = {
  pageNumber: number;
  width: number;
  height: number;
  mae: number;
  ssim: number;
  passed: boolean;
  regions: FidelityBox[];
  skippedReason?: string;
};

export type ApplyFidelityFallbacksResult = {
  objects: PdfDocumentObject[];
  report: PageFidelityReport;
  fallbackCrops: Array<{ box: FidelityBox; png: Buffer }>;
};

function escapeXml(s: string): string {
  return stripInvalidXmlChars(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pathSvg(p: {
  d: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity?: number;
  blendMode?: string;
}): string {
  const fill = p.fill && p.fill !== "none" ? escapeXml(p.fill) : "none";
  const stroke = p.stroke && p.stroke !== "none" ? escapeXml(p.stroke) : "none";
  const op = p.opacity != null && p.opacity < 1 ? ` opacity="${p.opacity}"` : "";
  const blend =
    p.blendMode && p.blendMode !== "normal"
      ? ` style="mix-blend-mode:${escapeXml(p.blendMode)}"`
      : "";
  return `<path d="${escapeXml(p.d)}" fill="${fill}" stroke="${stroke}" stroke-width="${p.strokeWidth}"${op}${blend}/>`;
}

/**
 * Serializa objetos documento a SVG para rasterizar y comparar vs PDFium.
 * Por defecto omite imágenes data-URL (SVG enorme) y limita nº de paths.
 */
export function documentObjectsToSvg(args: {
  width: number;
  height: number;
  objects: PdfDocumentObject[];
  imageDataUrls: Record<string, string>;
  /** Incluir <image href=data:...> — off por defecto en QA. */
  includeImages?: boolean;
  maxPaths?: number;
}): string {
  const parts: string[] = [];
  let pathCount = 0;
  const maxPaths = args.maxPaths ?? PDF_FIDELITY_MAX_SVG_PATHS;
  const includeImages = args.includeImages === true;

  const walk = (objs: PdfDocumentObject[]) => {
    for (const obj of objs) {
      if (obj.type === "path") {
        if (pathCount >= maxPaths) continue;
        pathCount += 1;
        parts.push(pathSvg(obj));
      } else if (obj.type === "text") {
        const weight = obj.fontWeight ?? 400;
        const style = obj.italic ? "italic" : "normal";
        const family = escapeXml(obj.fontFamily || "Helvetica, Arial, sans-serif");
        const fill = escapeXml(obj.color && /^#/i.test(obj.color) ? obj.color : "#111827");
        const op = obj.opacity != null && obj.opacity < 1 ? ` opacity="${obj.opacity}"` : "";
        parts.push(
          `<text x="${obj.x}" y="${obj.y + obj.fontSize * 0.85}" font-size="${obj.fontSize}" font-family="${family}" font-weight="${weight}" font-style="${style}" fill="${fill}"${op}>${escapeXml(obj.text)}</text>`,
        );
      } else if (obj.type === "image") {
        if (!includeImages) continue;
        const href = args.imageDataUrls[obj.id] || obj.src;
        if (!href || href.startsWith("http")) continue;
        const op = obj.opacity != null && obj.opacity < 1 ? ` opacity="${obj.opacity}"` : "";
        const blend =
          obj.blendMode && obj.blendMode !== "normal"
            ? ` style="mix-blend-mode:${escapeXml(obj.blendMode)}"`
            : "";
        parts.push(
          `<image href="${escapeXml(href)}" x="${obj.x}" y="${obj.y}" width="${obj.w}" height="${obj.h}" preserveAspectRatio="none"${op}${blend}/>`,
        );
      } else if (obj.type === "clip") {
        const clipId = `c_${escapeXml(obj.id)}`;
        parts.push(`<defs><clipPath id="${clipId}"><path d="${escapeXml(obj.maskD)}"/></clipPath></defs>`);
        parts.push(`<g clip-path="url(#${clipId})">`);
        walk(obj.content);
        parts.push(`</g>`);
      } else if (obj.type === "group") {
        const op = obj.opacity != null && obj.opacity < 1 ? ` opacity="${obj.opacity}"` : "";
        const blend =
          obj.blendMode && obj.blendMode !== "normal"
            ? ` style="mix-blend-mode:${escapeXml(obj.blendMode)}"`
            : "";
        parts.push(`<g${op}${blend}>`);
        walk(obj.children);
        parts.push(`</g>`);
      }
    }
  };

  walk(args.objects);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${args.width}" height="${args.height}" viewBox="0 0 ${args.width} ${args.height}"><rect width="100%" height="100%" fill="#ffffff"/>${parts.join("")}</svg>`;
}

export async function rasterizeSvgToRaw(
  svg: string,
  width: number,
  height: number,
): Promise<{ rgba: Buffer; width: number; height: number }> {
  const clean = stripInvalidXmlChars(svg);
  const png = await sharp(Buffer.from(clean, "utf8"))
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { rgba: png.data as Buffer, width: png.info.width, height: png.info.height };
}

export async function pngToRawRgba(png: Buffer): Promise<{ rgba: Buffer; width: number; height: number }> {
  const out = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { rgba: out.data as Buffer, width: out.info.width, height: out.info.height };
}

/** Mean absolute error on RGB channels (ignore alpha). */
export function meanAbsErrorRgb(a: Buffer, b: Buffer): number {
  const n = Math.min(a.length, b.length);
  if (n < 4) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i += 4) {
    sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    sum += Math.abs((a[i + 1] ?? 0) - (b[i + 1] ?? 0));
    sum += Math.abs((a[i + 2] ?? 0) - (b[i + 2] ?? 0));
    count += 3;
  }
  return count ? sum / count : 0;
}

function lumaAt(buf: Buffer, i: number): number {
  return 0.299 * (buf[i] ?? 0) + 0.587 * (buf[i + 1] ?? 0) + 0.114 * (buf[i + 2] ?? 0);
}

/**
 * SSIM aproximado global sobre luminancia downsampled (rápido, determinista).
 * Rango ~0–1 (1 = idéntico).
 */
export function approxSsimLuma(a: Buffer, b: Buffer, width: number, height: number, edge = PDF_FIDELITY_SSIM_EDGE): number {
  const tw = Math.max(8, Math.min(edge, width));
  const th = Math.max(8, Math.min(edge, height));
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;

  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;
  let n = 0;

  for (let ty = 0; ty < th; ty += 1) {
    const sy = Math.min(height - 1, Math.floor((ty / th) * height));
    for (let tx = 0; tx < tw; tx += 1) {
      const sx = Math.min(width - 1, Math.floor((tx / tw) * width));
      const i = (sy * width + sx) * 4;
      const x = lumaAt(a, i);
      const y = lumaAt(b, i);
      sumX += x;
      sumY += y;
      sumXX += x * x;
      sumYY += y * y;
      sumXY += x * y;
      n += 1;
    }
  }
  if (!n) return 1;
  const muX = sumX / n;
  const muY = sumY / n;
  const sigX = sumXX / n - muX * muX;
  const sigY = sumYY / n - muY * muY;
  const sigXY = sumXY / n - muX * muY;
  const num = (2 * muX * muY + C1) * (2 * sigXY + C2);
  const den = (muX * muX + muY * muY + C1) * (sigX + sigY + C2);
  if (den <= 0) return 1;
  return Math.max(0, Math.min(1, num / den));
}

export function findHighErrorTiles(args: {
  a: Buffer;
  b: Buffer;
  width: number;
  height: number;
  tile?: number;
  maeThreshold?: number;
}): FidelityBox[] {
  const tile = args.tile ?? PDF_FIDELITY_TILE;
  const thr = args.maeThreshold ?? PDF_FIDELITY_TILE_MAE;
  const regions: FidelityBox[] = [];
  for (let y = 0; y < args.height; y += tile) {
    for (let x = 0; x < args.width; x += tile) {
      const tw = Math.min(tile, args.width - x);
      const th = Math.min(tile, args.height - y);
      let sum = 0;
      let count = 0;
      for (let py = 0; py < th; py += 1) {
        for (let px = 0; px < tw; px += 1) {
          const i = ((y + py) * args.width + (x + px)) * 4;
          sum += Math.abs((args.a[i] ?? 0) - (args.b[i] ?? 0));
          sum += Math.abs((args.a[i + 1] ?? 0) - (args.b[i + 1] ?? 0));
          sum += Math.abs((args.a[i + 2] ?? 0) - (args.b[i + 2] ?? 0));
          count += 3;
        }
      }
      const mae = count ? sum / count : 0;
      if (mae >= thr) {
        regions.push({ x, y, w: tw, h: th, mae, reason: "tile_mae" });
      }
    }
  }
  return mergeFidelityBoxes(regions);
}

/** Une cajas que se tocan/solapan (greedy). */
export function mergeFidelityBoxes(boxes: FidelityBox[], gap = 4): FidelityBox[] {
  if (!boxes.length) return [];
  const sorted = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: FidelityBox[] = [];
  for (const box of sorted) {
    let merged = false;
    for (let i = 0; i < out.length; i += 1) {
      const o = out[i]!;
      const ox2 = o.x + o.w;
      const oy2 = o.y + o.h;
      const bx2 = box.x + box.w;
      const by2 = box.y + box.h;
      const touches =
        box.x <= ox2 + gap &&
        bx2 >= o.x - gap &&
        box.y <= oy2 + gap &&
        by2 >= o.y - gap;
      if (touches) {
        const nx = Math.min(o.x, box.x);
        const ny = Math.min(o.y, box.y);
        const nx2 = Math.max(ox2, bx2);
        const ny2 = Math.max(oy2, by2);
        out[i] = {
          x: nx,
          y: ny,
          w: nx2 - nx,
          h: ny2 - ny,
          mae: Math.max(o.mae, box.mae),
          reason: o.reason === box.reason ? o.reason : `${o.reason}+${box.reason}`,
        };
        merged = true;
        break;
      }
    }
    if (!merged) out.push({ ...box });
  }
  return out;
}

function childBox(
  c: PdfDocumentPathObject | PdfDocumentClipObject | PdfDocumentImageObject,
): { x: number; y: number; w: number; h: number } {
  if (c.type === "clip") {
    return { x: c.maskX, y: c.maskY, w: c.maskW, h: c.maskH };
  }
  return { x: c.x, y: c.y, w: c.w, h: c.h };
}

export function softMaskGroupBoxes(objects: PdfDocumentObject[]): FidelityBox[] {
  const boxes: FidelityBox[] = [];
  for (const obj of objects) {
    if (obj.type !== "group") continue;
    if (obj.kind !== "softmask" && !obj.softMask) continue;
    const kids = obj.children.map(childBox);
    if (!kids.length) continue;
    const xs = kids.map((c) => c.x);
    const ys = kids.map((c) => c.y);
    const x2 = kids.map((c) => c.x + c.w);
    const y2 = kids.map((c) => c.y + c.h);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    boxes.push({
      x,
      y,
      w: Math.max(1, Math.max(...x2) - x),
      h: Math.max(1, Math.max(...y2) - y),
      mae: 255,
      reason: "softmask",
    });
  }
  return boxes;
}

function boxArea(b: { w: number; h: number }): number {
  return Math.max(0, b.w) * Math.max(0, b.h);
}

function overlapRatio(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const area = boxArea(a);
  return area > 0 ? inter / area : 0;
}

function groupApproxBox(g: PdfDocumentGroupObject): { x: number; y: number; w: number; h: number } | null {
  if (!g.children.length) return null;
  const kids = g.children.map(childBox);
  const xs = kids.map((c) => c.x);
  const ys = kids.map((c) => c.y);
  const x2 = kids.map((c) => c.x + c.w);
  const y2 = kids.map((c) => c.y + c.h);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(1, Math.max(...x2) - x), h: Math.max(1, Math.max(...y2) - y) };
}

/**
 * Compara raster PDF (referencia) vs rebuild SVG de objetos editables.
 * Devuelve score + regiones candidatas a FallbackRaster.
 * Si el SVG no es rasterizable (p. ej. chars XML inválidos residuales), degrada sin lanzar.
 */
export async function comparePageFidelity(args: {
  pageNumber: number;
  referencePng: Buffer;
  objects: PdfDocumentObject[];
  imageDataUrls: Record<string, string>;
  width: number;
  height: number;
}): Promise<PageFidelityReport> {
  try {
    const ref = await pngToRawRgba(
      await sharp(args.referencePng).resize(args.width, args.height, { fit: "fill" }).png().toBuffer(),
    );
    const svg = documentObjectsToSvg({
      width: args.width,
      height: args.height,
      objects: args.objects,
      imageDataUrls: args.imageDataUrls,
      includeImages: false,
      maxPaths: PDF_FIDELITY_MAX_SVG_PATHS,
    });
    if (svg.length > PDF_FIDELITY_MAX_SVG_CHARS) {
      return {
        pageNumber: args.pageNumber,
        width: args.width,
        height: args.height,
        mae: 255,
        ssim: 0,
        passed: false,
        skippedReason: "svg_too_large",
        regions: softMaskGroupBoxes(
          args.objects.filter(
            (o) => o.type === "group" && (o.kind === "softmask" || o.softMask) && !o.layerMask?.src,
          ),
        ),
      };
    }
    const rebuild = await rasterizeSvgToRaw(svg, args.width, args.height);
    const mae = meanAbsErrorRgb(ref.rgba, rebuild.rgba);
    const ssim = approxSsimLuma(ref.rgba, rebuild.rgba, args.width, args.height);
    const tileRegions = findHighErrorTiles({
      a: ref.rgba,
      b: rebuild.rgba,
      width: args.width,
      height: args.height,
    });
    const softNeedingFallback = softMaskGroupBoxes(
      args.objects.filter(
        (o) => o.type === "group" && (o.kind === "softmask" || o.softMask) && !o.layerMask?.src,
      ),
    );
    const regions = mergeFidelityBoxes([...tileRegions, ...softNeedingFallback])
      .sort((a, b) => b.mae - a.mae)
      .slice(0, PDF_FIDELITY_MAX_FALLBACKS);

    return {
      pageNumber: args.pageNumber,
      width: args.width,
      height: args.height,
      mae,
      ssim,
      passed: ssim >= PDF_FIDELITY_SSIM_PASS && softNeedingFallback.length === 0,
      regions,
    };
  } catch (error) {
    console.warn(
      "[pdf-document-fidelity] comparePageFidelity skipped:",
      error instanceof Error ? error.message : error,
    );
    return {
      pageNumber: args.pageNumber,
      width: args.width,
      height: args.height,
      mae: 255,
      ssim: 0,
      passed: false,
      regions: softMaskGroupBoxes(
        args.objects.filter((o) => o.type === "group" && (o.kind === "softmask" || o.softMask) && !o.layerMask?.src),
      ),
    };
  }
}

/**
 * Recorta regiones del raster de referencia y prepara fallbacks.
 * Elimina grupos softmask cubiertos por un fallback (&gt;50% overlap).
 */
export async function buildFidelityFallbackCrops(args: {
  referencePng: Buffer;
  report: PageFidelityReport;
  pad?: number;
}): Promise<Array<{ box: FidelityBox; png: Buffer }>> {
  const pad = args.pad ?? 4;
  const meta = await sharp(args.referencePng).metadata();
  const pw = meta.width ?? args.report.width;
  const ph = meta.height ?? args.report.height;
  const crops: Array<{ box: FidelityBox; png: Buffer }> = [];
  for (const region of args.report.regions) {
    const x = Math.max(0, Math.floor(region.x - pad));
    const y = Math.max(0, Math.floor(region.y - pad));
    const w = Math.min(pw - x, Math.ceil(region.w + pad * 2));
    const h = Math.min(ph - y, Math.ceil(region.h + pad * 2));
    if (w < 2 || h < 2) continue;
    const png = await sharp(args.referencePng).extract({ left: x, top: y, width: w, height: h }).png().toBuffer();
    crops.push({ box: { ...region, x, y, w, h }, png });
  }
  return crops;
}

export function applyFallbackObjects(args: {
  objects: PdfDocumentObject[];
  fallbacks: Array<{ id: string; src: string; s3Key?: string; box: FidelityBox }>;
}): PdfDocumentObject[] {
  let next = [...args.objects];
  for (const fb of args.fallbacks) {
    next = next.filter((obj) => {
      if (obj.type !== "group") return true;
      if (obj.kind !== "softmask" && !obj.softMask) return true;
      // Conservar softmask si ya tiene máscara de luminancia editable.
      if (obj.layerMask?.src) return true;
      const box = groupApproxBox(obj);
      if (!box) return true;
      return overlapRatio(box, fb.box) < 0.5;
    });
    next.push({
      type: "image",
      id: fb.id,
      src: fb.src,
      s3Key: fb.s3Key,
      x: fb.box.x,
      y: fb.box.y,
      w: fb.box.w,
      h: fb.box.h,
      opacity: 1,
      blendMode: "normal",
      softMask: false,
      fallback: true,
    });
  }
  return next;
}
