import { closeLassoPoints, isValidClosedLasso } from "./lasso-to-paint-data";
import { cardIsDescribed } from "./studio-generate-payload";
import type { StudioCard, StudioPoint } from "./studio-types";

/**
 * Máscara OpenAI images.edit: alfa 0 = editar, alfa 255 = conservar.
 * Une lazos / paintData de las cards descritas.
 */
export function openAiEditMaskAlpha(
  width: number,
  height: number,
  cards: StudioCard[],
): Uint8Array | null {
  const w = Math.max(0, Math.round(width));
  const h = Math.max(0, Math.round(height));
  if (w < 8 || h < 8) return null;
  const described = cards.filter(
    (card) => cardIsDescribed(card) && (card.paintData || isValidClosedLasso(card.lassoPoints)),
  );
  if (described.length === 0) return null;
  const alpha = new Uint8Array(w * h);
  alpha.fill(255);
  let punched = false;
  for (const card of described) {
    if (isValidClosedLasso(card.lassoPoints)) {
      punchLasso(alpha, w, h, card.lassoPoints);
      punched = true;
    }
  }
  return punched ? alpha : null;
}

function punchLasso(alpha: Uint8Array, width: number, height: number, points: StudioPoint[]): void {
  const closed = closeLassoPoints(points);
  if (closed.length < 3) return;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (const point of closed) {
    minX = Math.min(minX, Math.floor(point.x));
    minY = Math.min(minY, Math.floor(point.y));
    maxX = Math.max(maxX, Math.ceil(point.x));
    maxY = Math.max(maxY, Math.ceil(point.y));
  }
  minX = Math.max(0, minX);
  minY = Math.max(0, minY);
  maxX = Math.min(width - 1, maxX);
  maxY = Math.min(height - 1, maxY);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (pointInPolygon(x + 0.5, y + 0.5, closed)) {
        alpha[y * width + x] = 0;
      }
    }
  }
}

function pointInPolygon(x: number, y: number, points: StudioPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const pi = points[i]!;
    const pj = points[j]!;
    const intersect =
      pi.y > y !== pj.y > y && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y + Number.EPSILON) + pj.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function encodeRgbaMaskPngDataUrl(width: number, height: number, alpha: Uint8Array): string | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(width, height);
  for (let i = 0; i < alpha.length; i++) {
    const o = i * 4;
    img.data[o] = 255;
    img.data[o + 1] = 255;
    img.data[o + 2] = 255;
    img.data[o + 3] = alpha[i]!;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

export async function buildOpenAiEditMaskDataUrl(
  cards: StudioCard[],
  frame: { width: number; height: number },
): Promise<string | null> {
  const w = Math.max(1, Math.round(frame.width));
  const h = Math.max(1, Math.round(frame.height));
  const described = cards.filter(cardIsDescribed);
  if (described.length === 0) return null;
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "rgba(255,255,255,1)";
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "destination-out";

  let punched = false;
  for (const card of described) {
    if (card.paintData) {
      try {
        const img = await loadImage(card.paintData);
        ctx.drawImage(img, 0, 0, w, h);
        punched = true;
        continue;
      } catch {
        /* lazo */
      }
    }
    if (isValidClosedLasso(card.lassoPoints)) {
      const closed = closeLassoPoints(card.lassoPoints);
      ctx.beginPath();
      ctx.moveTo(closed[0]!.x, closed[0]!.y);
      for (let i = 1; i < closed.length; i++) ctx.lineTo(closed[i]!.x, closed[i]!.y);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,255,255,1)";
      ctx.fill();
      punched = true;
    }
  }

  if (!punched) return null;
  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("mask"));
    img.src = src;
  });
}
