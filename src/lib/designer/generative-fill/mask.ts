import sharp from "sharp";
import type { GenerativeFillRect } from "./types";

/** Sharp exige enteros en extract/resize; normaliza x/y/w/h a píxeles enteros. */
export function snapRectToPixels(
  rect: GenerativeFillRect,
  canvasWidth?: number,
  canvasHeight?: number,
): GenerativeFillRect {
  const x = Math.max(0, Math.round(rect.x));
  const y = Math.max(0, Math.round(rect.y));
  let w = Math.max(1, Math.round(rect.w));
  let h = Math.max(1, Math.round(rect.h));
  if (canvasWidth != null) w = Math.max(1, Math.min(w, canvasWidth - x));
  if (canvasHeight != null) h = Math.max(1, Math.min(h, canvasHeight - y));
  return { x, y, w, h };
}

export function clampRectToCanvas(
  rect: GenerativeFillRect,
  width: number,
  height: number,
): GenerativeFillRect | null {
  const x = Math.max(0, Math.min(width - 1, Math.round(rect.x)));
  const y = Math.max(0, Math.min(height - 1, Math.round(rect.y)));
  const w = Math.max(1, Math.min(width - x, Math.round(rect.w)));
  const h = Math.max(1, Math.min(height - y, Math.round(rect.h)));
  if (w < 1 || h < 1) return null;
  return { x, y, w, h };
}

export function unionSelectionBounds(
  selections: GenerativeFillRect[],
): GenerativeFillRect | null {
  if (selections.length === 0) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const r of selections) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.w);
    y2 = Math.max(y2, r.y + r.h);
  }
  if (!Number.isFinite(x1)) return null;
  return snapRectToPixels({ x: x1, y: y1, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1) });
}

export function expandRect(
  rect: GenerativeFillRect,
  padding: number,
  width: number,
  height: number,
): GenerativeFillRect {
  const pad = Math.max(0, Math.round(padding));
  const x = Math.max(0, Math.floor(rect.x - pad));
  const y = Math.max(0, Math.floor(rect.y - pad));
  const x2 = Math.min(width, Math.ceil(rect.x + rect.w + pad));
  const y2 = Math.min(height, Math.ceil(rect.y + rect.h + pad));
  return snapRectToPixels({ x, y, w: Math.max(1, x2 - x), h: Math.max(1, y2 - y) }, width, height);
}

/** Máscara grayscale: negro = conservar, blanco = rellenar. */
export async function buildMultiRectMask(
  width: number,
  height: number,
  selections: GenerativeFillRect[],
): Promise<Buffer> {
  const overlays = selections
    .map((r) => clampRectToCanvas(r, width, height))
    .filter((r): r is GenerativeFillRect => r != null)
    .map((r) => ({
      input: {
        create: {
          width: r.w,
          height: r.h,
          channels: 3 as const,
          background: { r: 255, g: 255, b: 255 },
        },
      },
      left: r.x,
      top: r.y,
    }));

  return sharp({
    create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite(overlays)
    .grayscale()
    .png()
    .toBuffer();
}

export async function featherMask(
  mask: Buffer,
  width: number,
  height: number,
  featherPx: number,
): Promise<Buffer> {
  const px = Math.max(0, Math.round(featherPx));
  if (px <= 0) {
    return sharp(mask).resize(width, height, { fit: "fill" }).grayscale().png().toBuffer();
  }
  const gray = await sharp(mask).resize(width, height, { fit: "fill" }).grayscale().toBuffer();
  return sharp(gray)
    .blur(Math.max(0.5, px * 0.45))
    .linear(1.08, -8)
    .png()
    .toBuffer();
}

export async function cropBufferToRect(
  buf: Buffer,
  rect: GenerativeFillRect,
): Promise<Buffer> {
  const { x, y, w, h } = snapRectToPixels(rect);
  return sharp(buf).extract({ left: x, top: y, width: w, height: h }).png().toBuffer();
}

export function scaleSelectionsToCanvas(
  selections: GenerativeFillRect[],
  fromWidth: number,
  fromHeight: number,
  toWidth: number,
  toHeight: number,
): GenerativeFillRect[] {
  if (fromWidth === toWidth && fromHeight === toHeight) return selections;
  if (fromWidth < 1 || fromHeight < 1) return selections;
  const sx = toWidth / fromWidth;
  const sy = toHeight / fromHeight;
  return selections.map((s) =>
    snapRectToPixels({
      x: s.x * sx,
      y: s.y * sy,
      w: s.w * sx,
      h: s.h * sy,
    }),
  );
}

export function selectionAreaRatio(selections: GenerativeFillRect[], width: number, height: number): number {
  const canvasArea = Math.max(1, width * height);
  let sum = 0;
  for (const r of selections) {
    const c = clampRectToCanvas(r, width, height);
    if (c) sum += c.w * c.h;
  }
  return sum / canvasArea;
}
