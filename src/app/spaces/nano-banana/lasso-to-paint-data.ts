import { isValidClosedLasso } from "@/lib/advanced-image/canvas-coordinate";
import type { StudioPoint } from "./studio-types";

export { isValidClosedLasso };

export function closeLassoPoints(points: StudioPoint[]): StudioPoint[] {
  if (points.length < 2) return points;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (first.x === last.x && first.y === last.y) return points;
  return [...points, { x: first.x, y: first.y }];
}

/** Ray-cast; used by tests and as a fallback if Canvas 2D is unavailable. */
export function pointInPolygon(x: number, y: number, points: StudioPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const pi = points[i]!;
    const pj = points[j]!;
    const intersect =
      pi.y > y !== pj.y > y && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y + Number.EPSILON) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function fillLassoAlphaMask(
  width: number,
  height: number,
  points: StudioPoint[],
): Uint8Array {
  const closed = closeLassoPoints(points);
  const mask = new Uint8Array(width * height);
  if (closed.length < 3 || width < 1 || height < 1) return mask;
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
        mask[y * width + x] = 255;
      }
    }
  }
  return mask;
}

/**
 * Full-frame PNG, opaque white inside the lasso, transparent outside.
 * Same size as the source image so the existing color-map / marked-base loops stay 1:1.
 */
export function rasterizeLassoToPaintData(
  points: StudioPoint[],
  width: number,
  height: number,
): string | null {
  if (!isValidClosedLasso(points) || width < 1 || height < 1) return null;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, width, height);
  const closed = closeLassoPoints(points);
  ctx.beginPath();
  ctx.moveTo(closed[0]!.x, closed[0]!.y);
  for (let i = 1; i < closed.length; i++) {
    ctx.lineTo(closed[i]!.x, closed[i]!.y);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,1)";
  ctx.fill();
  return canvas.toDataURL("image/png");
}
