import { easeCircleOut, easeExpOut } from 'd3-ease';

/**
 * Easing para transiciones de viewport (`fitView`, `setViewport` con duration):
 * ease-out circular + ease-out exponencial (promedio), vía d3-ease.
 */
export function foldderFitViewEase(t: number): number {
  return (easeCircleOut(t) + easeExpOut(t)) / 2;
}

/** Spread en opciones de `fitView` / `setViewport` con `duration`. */
export const FOLDDER_FIT_VIEW_EASE = { ease: foldderFitViewEase };
