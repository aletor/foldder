/**
 * Cover geométrico para fondos responsive (6B.1).
 * Puro y testeable; no escribe Blueprint/Designer.
 */
import type { PageRect } from "./site-creator-coordinate-space";
import { clampNumber } from "./site-creator-responsive-math";

export type NormalizedFocalPoint = { x: number; y: number };

export type BackgroundCoverTransform = {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  focalPoint: NormalizedFocalPoint;
};

const DEFAULT_FOCAL: NormalizedFocalPoint = { x: 0.5, y: 0.5 };

/**
 * Cover: escala para cubrir `targetRect` y traslada según focal normalizado.
 * Clamp impide zonas vacías dentro del target.
 */
export function resolveBackgroundCoverTransform(args: {
  sourceRect: PageRect;
  targetRect: PageRect;
  focalPoint?: NormalizedFocalPoint | null;
}): BackgroundCoverTransform {
  const srcW = Math.max(1, args.sourceRect.width);
  const srcH = Math.max(1, args.sourceRect.height);
  const tw = Math.max(1, args.targetRect.width);
  const th = Math.max(1, args.targetRect.height);
  const focal = normalizeFocal(args.focalPoint);

  const scale = Math.max(tw / srcW, th / srcH);
  const scaledWidth = srcW * scale;
  const scaledHeight = srcH * scale;

  const targetCenterX = args.targetRect.x + tw / 2;
  const targetCenterY = args.targetRect.y + th / 2;

  let tx = targetCenterX - focal.x * scaledWidth;
  let ty = targetCenterY - focal.y * scaledHeight;

  const targetLeft = args.targetRect.x;
  const targetTop = args.targetRect.y;
  const targetRight = args.targetRect.x + tw;
  const targetBottom = args.targetRect.y + th;

  // clamp(min, val, max) estilo CSS: no dejar huecos
  tx = clampNumber(targetRight - scaledWidth, tx, targetLeft);
  ty = clampNumber(targetBottom - scaledHeight, ty, targetTop);

  return {
    x: tx,
    y: ty,
    width: scaledWidth,
    height: scaledHeight,
    scale,
    focalPoint: focal,
  };
}

function normalizeFocal(focal?: NormalizedFocalPoint | null): NormalizedFocalPoint {
  if (!focal) return { ...DEFAULT_FOCAL };
  return {
    x: clampNumber(0, Number.isFinite(focal.x) ? focal.x : 0.5, 1),
    y: clampNumber(0, Number.isFinite(focal.y) ? focal.y : 0.5, 1),
  };
}

/**
 * Deriva un focal normalizado desde la geometría de la imagen respecto a su región fuente.
 * Si no hay señal útil (cobertura casi completa centrada), usa 0.5/0.5.
 * No usa left/top como focal implícito.
 */
export function deriveImageFocalFromSourceGeometry(args: {
  imageRect: PageRect;
  regionRect: PageRect;
}): NormalizedFocalPoint {
  const { imageRect, regionRect } = args;
  const rw = Math.max(1, regionRect.width);
  const rh = Math.max(1, regionRect.height);

  // Centro de la región en coords de la imagen (normalizado 0..1 respecto al bitmap/frame fuente).
  const regionCx = regionRect.x + rw / 2;
  const regionCy = regionRect.y + rh / 2;
  const relX = (regionCx - imageRect.x) / Math.max(1, imageRect.width);
  const relY = (regionCy - imageRect.y) / Math.max(1, imageRect.height);

  // Si la imagen es casi el marco de la región, el focal “contenido” es el centro.
  const coverX = imageRect.width / rw;
  const coverY = imageRect.height / rh;
  if (coverX >= 0.95 && coverY >= 0.95) {
    // Solo usar el offset si la imagen está claramente desplazada respecto al centro de región
    const imgCx = imageRect.x + imageRect.width / 2;
    const imgCy = imageRect.y + imageRect.height / 2;
    const dx = (imgCx - regionCx) / rw;
    const dy = (imgCy - regionCy) / rh;
    if (Math.abs(dx) < 0.08 && Math.abs(dy) < 0.08) {
      return { ...DEFAULT_FOCAL };
    }
    // Imagen más grande que la región: el centro de la región dentro de la imagen es el focal
    return normalizeFocal({ x: relX, y: relY });
  }

  // Imagen parcial: focal = punto de la imagen alineado al centro de región
  return normalizeFocal({ x: relX, y: relY });
}
