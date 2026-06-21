import type { CompositionTransform } from "./video-editor-composition-types";

export function normXToPx(x: number, compWidth: number): number {
  return Math.round(x * compWidth);
}

export function normYToPx(y: number, compHeight: number): number {
  return Math.round(y * compHeight);
}

export function normWidthToPx(w: number, compWidth: number): number {
  return Math.round(w * compWidth);
}

export function normHeightToPx(h: number, compHeight: number): number {
  return Math.round(h * compHeight);
}

export function pxXToNorm(px: number, compWidth: number): number {
  if (compWidth <= 0) return 0;
  return px / compWidth;
}

export function pxYToNorm(px: number, compHeight: number): number {
  if (compHeight <= 0) return 0;
  return px / compHeight;
}

export function pxWidthToNorm(px: number, compWidth: number): number {
  if (compWidth <= 0) return 0;
  return px / compWidth;
}

export function pxHeightToNorm(px: number, compHeight: number): number {
  if (compHeight <= 0) return 0;
  return px / compHeight;
}

export function transformToPx(
  transform: CompositionTransform,
  compWidth: number,
  compHeight: number,
): { x: number; y: number; width: number; height: number } {
  return {
    x: normXToPx(transform.x, compWidth),
    y: normYToPx(transform.y, compHeight),
    width: normWidthToPx(transform.width, compWidth),
    height: normHeightToPx(transform.height, compHeight),
  };
}

export function patchTransformFromPx(
  transform: CompositionTransform,
  compWidth: number,
  compHeight: number,
  patch: { x?: number; y?: number; width?: number; height?: number },
  aspectLock?: boolean,
  aspectRatio?: number,
): CompositionTransform {
  const next = { ...transform };
  if (patch.x !== undefined) next.x = pxXToNorm(patch.x, compWidth);
  if (patch.y !== undefined) next.y = pxYToNorm(patch.y, compHeight);
  if (patch.width !== undefined) {
    next.width = pxWidthToNorm(patch.width, compWidth);
    if (aspectLock && aspectRatio && aspectRatio > 0) {
      next.height = next.width / aspectRatio * (compWidth / compHeight);
    }
  }
  if (patch.height !== undefined) {
    next.height = pxHeightToNorm(patch.height, compHeight);
    if (aspectLock && aspectRatio && aspectRatio > 0) {
      next.width = next.height * aspectRatio * (compHeight / compWidth);
    }
  }
  return next;
}

export function clampNorm01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function clampTransform(t: CompositionTransform): CompositionTransform {
  return {
    ...t,
    x: clampNorm01(t.x),
    y: clampNorm01(t.y),
    width: Math.max(0.01, Math.min(1, t.width)),
    height: Math.max(0.01, Math.min(1, t.height)),
    opacity: Math.max(0, Math.min(1, t.opacity)),
    rotation: Number.isFinite(t.rotation) ? t.rotation : 0,
    anchorX: clampNorm01(t.anchorX),
    anchorY: clampNorm01(t.anchorY),
    flipX: Boolean(t.flipX),
    flipY: Boolean(t.flipY),
    crop: {
      x: clampNorm01(t.crop.x),
      y: clampNorm01(t.crop.y),
      width: Math.max(0.01, Math.min(1, t.crop.width)),
      height: Math.max(0.01, Math.min(1, t.crop.height)),
    },
  };
}
