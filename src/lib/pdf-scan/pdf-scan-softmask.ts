import sharp from "sharp";
import type { PdfDocumentGroupObject, PdfDocumentLayerMask, PdfDocumentObject } from "./pdf-scan-types";

export type SoftMaskSubtype = "Alpha" | "Luminosity";

/**
 * Aproxima una máscara de luminancia Freehand (blanco = visible) a partir de un
 * crop opaco del raster PDF (fondo típico blanco).
 *
 * Heurística: visibilidad ∝ distancia al blanco + croma.
 * Suficiente para soft-edges sobre papel; no sustituye SMask PDF bit-perfect.
 */
export async function luminanceMaskPngFromPageCrop(png: Buffer): Promise<{
  png: Buffer;
  width: number;
  height: number;
}> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const gray = Buffer.alloc(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const a = data[i + 3]!;
    const maxc = Math.max(r, g, b);
    const minc = Math.min(r, g, b);
    const fromWhite = (255 - maxc) / 255;
    const chroma = (maxc - minc) / 255;
    const alphaVis = a / 255;
    const visibility = Math.min(1, Math.max(fromWhite, chroma) * alphaVis);
    gray[p] = Math.round(visibility * 255);
  }
  const pngOut = await sharp(gray, { raw: { width, height, channels: 1 } }).png().toBuffer();
  return { png: pngOut, width, height };
}

function groupBBox(g: PdfDocumentGroupObject): { x: number; y: number; w: number; h: number } | null {
  if (!g.children.length) return null;
  const boxes = g.children.map((c) => {
    if (c.type === "clip") return { x: c.maskX, y: c.maskY, w: c.maskW, h: c.maskH };
    return { x: c.x, y: c.y, w: c.w, h: c.h };
  });
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.w));
  const y2 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: Math.max(1, x2 - x), h: Math.max(1, y2 - y) };
}

export type SoftMaskAttachResult = {
  objects: PdfDocumentObject[];
  attached: number;
  masks: Array<{
    groupId: string;
    png: Buffer;
    box: { x: number; y: number; w: number; h: number };
    pixelW: number;
    pixelH: number;
  }>;
};

/**
 * Para cada grupo softmask: genera máscara de luminancia desde el crop del raster PDF
 * (sin LLM). La máscara se adjunta después de subir (caller rellena src/s3Key).
 */
export async function prepareSoftMaskLuminanceMasks(args: {
  referencePng: Buffer;
  objects: PdfDocumentObject[];
  pageWidth: number;
  pageHeight: number;
  pad?: number;
}): Promise<SoftMaskAttachResult> {
  const pad = args.pad ?? 2;
  const masks: SoftMaskAttachResult["masks"] = [];
  const meta = await sharp(args.referencePng).metadata();
  const pw = meta.width ?? args.pageWidth;
  const ph = meta.height ?? args.pageHeight;

  for (const obj of args.objects) {
    if (obj.type !== "group") continue;
    if (obj.kind !== "softmask" && !obj.softMask) continue;
    if (obj.layerMask?.src) continue;
    const box = groupBBox(obj);
    if (!box) continue;
    const x = Math.max(0, Math.floor(box.x - pad));
    const y = Math.max(0, Math.floor(box.y - pad));
    const w = Math.min(pw - x, Math.ceil(box.w + pad * 2));
    const h = Math.min(ph - y, Math.ceil(box.h + pad * 2));
    if (w < 2 || h < 2) continue;
    try {
      const crop = await sharp(args.referencePng).extract({ left: x, top: y, width: w, height: h }).png().toBuffer();
      const mask = await luminanceMaskPngFromPageCrop(crop);
      masks.push({
        groupId: obj.id,
        png: mask.png,
        box: { x, y, w, h },
        pixelW: mask.width,
        pixelH: mask.height,
      });
    } catch {
      // skip broken crop
    }
  }

  return { objects: args.objects, attached: masks.length, masks };
}

export function attachSoftMaskUrls(
  objects: PdfDocumentObject[],
  uploads: Array<{ groupId: string; mask: PdfDocumentLayerMask }>,
): PdfDocumentObject[] {
  const byId = new Map(uploads.map((u) => [u.groupId, u.mask]));
  return objects.map((obj) => {
    if (obj.type !== "group") return obj;
    const mask = byId.get(obj.id);
    if (!mask) return obj;
    return { ...obj, layerMask: mask };
  });
}
