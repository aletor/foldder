import type { GenerativeFillRect } from "@/lib/designer/generative-fill/types";

export type Rect = GenerativeFillRect;

export function normalizeDragRect(
  origin: { x: number; y: number },
  current: { x: number; y: number },
): GenerativeFillRect {
  const mx = Math.min(origin.x, current.x);
  const my = Math.min(origin.y, current.y);
  const mw = Math.abs(current.x - origin.x);
  const mh = Math.abs(current.y - origin.y);
  return { x: mx, y: my, w: mw, h: mh };
}

export function clampRectToBounds(
  rect: GenerativeFillRect,
  bounds: GenerativeFillRect,
): GenerativeFillRect | null {
  const x = Math.max(bounds.x, Math.min(bounds.x + bounds.w - 1, rect.x));
  const y = Math.max(bounds.y, Math.min(bounds.y + bounds.h - 1, rect.y));
  const x2 = Math.min(bounds.x + bounds.w, rect.x + rect.w);
  const y2 = Math.min(bounds.y + bounds.h, rect.y + rect.h);
  const w = x2 - x;
  const h = y2 - y;
  if (w < 2 || h < 2) return null;
  return { x, y, w, h };
}

export function commitGenerativeFillRect(
  prev: GenerativeFillRect[],
  newRect: GenerativeFillRect,
  additive: boolean,
): GenerativeFillRect[] {
  if (additive && prev.length > 0) return [...prev, newRect];
  return [newRect];
}

export function pointInsideAnyRect(
  p: { x: number; y: number },
  rects: GenerativeFillRect[],
): boolean {
  return rects.some(
    (r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h,
  );
}
