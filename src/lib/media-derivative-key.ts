import { clampCanvasThumbMaxSide } from "@/lib/canvas-media-thumbnail";

const DERIVATIVE_MARKER = "__foldder_";

/** Clave hermana del original. El control de acceso sigue haciéndose sobre la clave fuente. */
export function mediaDerivativeObjectKey(sourceKey: string, maxSide: number): string {
  const side = clampCanvasThumbMaxSide(maxSide);
  return `${sourceKey}${DERIVATIVE_MARKER}${side}.webp`;
}

export function isMediaDerivativeObjectKey(key: string): boolean {
  return key.includes(`${DERIVATIVE_MARKER}`) && key.endsWith(".webp");
}
