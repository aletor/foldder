/**
 * Bbox de logo desde visión — expansión, convenciones y validación de contenido.
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { BrandKitVisionLogoHint, BrandKitVisionNormalizedBbox } from "./pdf-vision-types";
import type { PixelBBox } from "@/lib/brain/pdf-page-render";
import { clampPixelBBox } from "@/lib/brain/pdf-page-render";

/** @deprecated Usar constantes top/bottom/side; se mantiene para tests legacy. */
export const VISION_LOGO_BBOX_EXPAND_RATIO = 0.3;
/** Expansión asimétrica: la visión suele colocar el bbox demasiado alto — margen extra abajo. */
export const VISION_LOGO_BBOX_EXPAND_TOP = 0.35;
export const VISION_LOGO_BBOX_EXPAND_BOTTOM = 1.0;
export const VISION_LOGO_BBOX_EXPAND_SIDE = 0.35;
export const VISION_LOGO_PAGE_BBOX_PADDING_PX = 8;
export const VISION_LOGO_MIN_PIXELS_KEPT_PCT = 2;

export function expandNormalizedBbox(
  bbox: BrandKitVisionNormalizedBbox,
  margins?: { top?: number; bottom?: number; side?: number },
): BrandKitVisionNormalizedBbox {
  const top = margins?.top ?? VISION_LOGO_BBOX_EXPAND_TOP;
  const bottom = margins?.bottom ?? VISION_LOGO_BBOX_EXPAND_BOTTOM;
  const side = margins?.side ?? VISION_LOGO_BBOX_EXPAND_SIDE;
  const padW = bbox.width * side;
  const padTop = bbox.height * top;
  const padBottom = bbox.height * bottom;
  const x = Math.max(0, bbox.x - padW);
  const y = Math.max(0, bbox.y - padTop);
  const right = Math.min(1, bbox.x + bbox.width + padW);
  const bottomEdge = Math.min(1, bbox.y + bbox.height + padBottom);
  return {
    x,
    y,
    width: Math.max(0.01, right - x),
    height: Math.max(0.01, bottomEdge - y),
  };
}

/** Si width/height parecen x1/y1 (esquina inferior derecha), convierte a x,y,w,h. */
export function bboxIfCornerFormat(bbox: BrandKitVisionNormalizedBbox): BrandKitVisionNormalizedBbox | null {
  const x0 = bbox.x;
  const y0 = bbox.y;
  const x1 = bbox.width;
  const y1 = bbox.height;
  if (x1 <= x0 || y1 <= y0 || x1 > 1.001 || y1 > 1.001) return null;
  const cornerW = x1 - x0;
  const cornerH = y1 - y0;
  if (cornerW < 0.008 || cornerH < 0.008) return null;
  // xywh válido: width/height son tamaño y caben en la página
  if (
    bbox.x + bbox.width <= 1.001 &&
    bbox.y + bbox.height <= 1.001 &&
    cornerH < bbox.height * 0.55
  ) {
    return null;
  }
  return { x: x0, y: y0, width: cornerW, height: cornerH };
}

export function visionBboxCandidates(raw: BrandKitVisionNormalizedBbox): BrandKitVisionNormalizedBbox[] {
  const seen = new Set<string>();
  const out: BrandKitVisionNormalizedBbox[] = [];
  const push = (b: BrandKitVisionNormalizedBbox) => {
    const key = `${b.x.toFixed(4)}:${b.y.toFixed(4)}:${b.width.toFixed(4)}:${b.height.toFixed(4)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(b);
  };
  push(expandNormalizedBbox(raw));
  const corner = bboxIfCornerFormat(raw);
  if (corner) push(expandNormalizedBbox(corner));
  return out;
}

export function normalizedBboxToPixel(
  bbox: BrandKitVisionNormalizedBbox,
  pageWidth: number,
  pageHeight: number,
): PixelBBox {
  return {
    x: Math.round(bbox.x * pageWidth),
    y: Math.round(bbox.y * pageHeight),
    width: Math.max(1, Math.round(bbox.width * pageWidth)),
    height: Math.max(1, Math.round(bbox.height * pageHeight)),
  };
}

export function writeVisionLogoDebugCrop(
  pageNumber: number,
  attempt: number,
  pngBuffer: Buffer,
  pixelBBox: PixelBBox,
  label = "crop",
): string | undefined {
  if (process.env.BRAND_KIT_VISION_LOGO_DEBUG !== "1") return undefined;
  const dir = process.env.BRAND_KIT_VISION_LOGO_DEBUG_DIR?.trim() || "/tmp";
  fs.mkdirSync(dir, { recursive: true });
  const stable = path.join(dir, `brandKit-logo-${label}-p${pageNumber}-a${attempt}.png`);
  const stamped = path.join(dir, `brand-kit-logo-${label}-p${pageNumber}-a${attempt}-${Date.now()}.png`);
  fs.writeFileSync(stable, pngBuffer);
  fs.writeFileSync(stamped, pngBuffer);
  console.info(
    `[logo] debug ${label}: ${stable} pixels=x=${pixelBBox.x},y=${pixelBBox.y},w=${pixelBBox.width},h=${pixelBBox.height}`,
  );
  return stable;
}

export function measureOpaquePixelPct(rgba: Buffer, width: number, height: number): number {
  const channels = 4;
  let opaque = 0;
  const total = width * height;
  if (total === 0) return 0;
  for (let i = 3; i < rgba.length; i += channels) {
    if (rgba[i]! > 16) opaque += 1;
  }
  return (opaque / total) * 100;
}

const ALPHA_TRIM_THRESHOLD = 16;
export const LOGO_ALPHA_TRIM_PADDING_PX = 6;

export type OpaquePixelBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export function measureOpaquePixelBounds(
  rgba: Buffer,
  width: number,
  height: number,
  alphaThreshold = ALPHA_TRIM_THRESHOLD,
): OpaquePixelBounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = rgba[(y * width + x) * 4 + 3] ?? 0;
      if (alpha > alphaThreshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { minX, minY, maxX, maxY };
}

/** Mapea bbox opaco dentro de un crop hi-res al bbox de página (DPI render). */
export function mapCropOpaqueBoundsToPageBBox(
  pageWidth: number,
  pageHeight: number,
  pagePixelBBox: PixelBBox,
  cropWidth: number,
  cropHeight: number,
  bounds: OpaquePixelBounds,
  paddingPagePx = VISION_LOGO_PAGE_BBOX_PADDING_PX,
): PixelBBox {
  const relLeft = bounds.minX / cropWidth;
  const relTop = bounds.minY / cropHeight;
  const relRight = (bounds.maxX + 1) / cropWidth;
  const relBottom = (bounds.maxY + 1) / cropHeight;
  return clampPixelBBox(pageWidth, pageHeight, {
    x: Math.round(pagePixelBBox.x + relLeft * pagePixelBBox.width) - paddingPagePx,
    y: Math.round(pagePixelBBox.y + relTop * pagePixelBBox.height) - paddingPagePx,
    width: Math.round((relRight - relLeft) * pagePixelBBox.width) + paddingPagePx * 2,
    height: Math.round((relBottom - relTop) * pagePixelBBox.height) + paddingPagePx * 2,
  });
}

/** Recorta al bbox real de píxeles opacos (alpha) + padding. */
export async function trimRgbaToOpaqueBounds(
  rgba: Buffer,
  paddingPx = LOGO_ALPHA_TRIM_PADDING_PX,
): Promise<Buffer> {
  const { data, info } = await sharp(rgba).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const bounds = measureOpaquePixelBounds(data, width, height);
  if (!bounds) return rgba;

  const left = Math.max(0, bounds.minX - paddingPx);
  const top = Math.max(0, bounds.minY - paddingPx);
  const right = Math.min(width - 1, bounds.maxX + paddingPx);
  const bottom = Math.min(height - 1, bounds.maxY + paddingPx);

  return sharp(rgba)
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .png()
    .toBuffer();
}

export function writeVisionLogoDebugIsolated(
  pageNumber: number,
  attempt: number,
  rgba: Buffer,
  label: string,
): string | undefined {
  if (process.env.BRAND_KIT_VISION_LOGO_DEBUG !== "1") return undefined;
  const dir = process.env.BRAND_KIT_VISION_LOGO_DEBUG_DIR?.trim() || "/tmp";
  fs.mkdirSync(dir, { recursive: true });
  const stable = path.join(dir, `brandKit-logo-${label}-p${pageNumber}-a${attempt}.png`);
  const stamped = path.join(dir, `brandKit-logo-${label}-p${pageNumber}-a${attempt}-${Date.now()}.png`);
  fs.writeFileSync(stable, rgba);
  fs.writeFileSync(stamped, rgba);
  console.info(`[logo] debug isolated: ${stable}`);
  return stable;
}

export type VisionLogoBboxAttempt = {
  hint: BrandKitVisionLogoHint;
  normalized: BrandKitVisionNormalizedBbox;
  pixelBBox: PixelBBox;
};

export function buildVisionLogoBboxAttempts(
  hint: BrandKitVisionLogoHint,
  pageWidth: number,
  pageHeight: number,
): VisionLogoBboxAttempt[] {
  return visionBboxCandidates(hint.bbox).map((normalized) => ({
    hint: { ...hint, bbox: normalized },
    normalized,
    pixelBBox: normalizedBboxToPixel(normalized, pageWidth, pageHeight),
  }));
}
