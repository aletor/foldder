/**
 * Fase 6A — ancho de vista web vs zoom de edición.
 * No persiste reglas responsive; solo estado temporal del Studio.
 */

export const SITE_CREATOR_TABLET_WIDTH = 768;
export const SITE_CREATOR_MOBILE_WIDTH = 390;
export const SITE_CREATOR_MIN_VIEWPORT_WIDTH = 280;
export const SITE_CREATOR_FIT_ZOOM_MAX = 2;

export type SiteCreatorViewportPreset = "original" | "tablet" | "mobile" | "custom";

export type SiteCreatorViewportState = {
  preset: SiteCreatorViewportPreset;
  width: number;
  previewZoom: number;
};

export type SiteCreatorResolvedLayout = {
  referenceWidth: number;
  referenceHeight: number;
  viewportWidth: number;
  layoutWidth: number;
  layoutHeight: number;
  /** Escala provisional de composición: viewportWidth / referenceWidth. No es zoom. */
  layoutScale: number;
};

export function clampViewportWidth(width: number, referenceWidth: number): number {
  const max = Math.max(3840, Math.round(referenceWidth));
  const n = Number.isFinite(width) ? width : referenceWidth;
  return Math.round(Math.min(max, Math.max(SITE_CREATOR_MIN_VIEWPORT_WIDTH, n)));
}

export function detectViewportPreset(
  width: number,
  referenceWidth: number,
): SiteCreatorViewportPreset {
  const w = Math.round(width);
  if (w === Math.round(referenceWidth)) return "original";
  if (w === SITE_CREATOR_TABLET_WIDTH) return "tablet";
  if (w === SITE_CREATOR_MOBILE_WIDTH) return "mobile";
  return "custom";
}

/**
 * Estrategia provisional 6A: conservar composición escalando todo el diseño.
 * No escribe Blueprint ni Designer.
 */
export function resolveSiteCreatorLayout(args: {
  referenceWidth: number;
  referenceHeight: number;
  viewportWidth: number;
}): SiteCreatorResolvedLayout {
  const referenceWidth = Math.max(1, args.referenceWidth);
  const referenceHeight = Math.max(1, args.referenceHeight);
  const viewportWidth = clampViewportWidth(args.viewportWidth, referenceWidth);
  const layoutScale = viewportWidth / referenceWidth;
  return {
    referenceWidth,
    referenceHeight,
    viewportWidth,
    layoutWidth: viewportWidth,
    layoutHeight: referenceHeight * layoutScale,
    layoutScale,
  };
}

/** Ajustar = cálculo puntual; no es un modo reactivo. */
export function computeFitPreviewZoom(args: {
  layoutWidth: number;
  layoutHeight: number;
  availableWidth: number;
  availableHeight: number;
  maxZoom?: number;
}): number {
  const maxZoom = args.maxZoom ?? SITE_CREATOR_FIT_ZOOM_MAX;
  const lw = Math.max(1, args.layoutWidth);
  const lh = Math.max(1, args.layoutHeight);
  const sx = Math.max(1, args.availableWidth) / lw;
  const sy = Math.max(1, args.availableHeight) / lh;
  const z = Math.min(maxZoom, sx, sy);
  return Math.max(0.05, z);
}

/**
 * Resize centrado: el lateral sigue al puntero.
 * deltaClientAlongOutward > 0 = alejar el borde del centro (ensanchar).
 */
export function viewportWidthDeltaFromCenteredEdgeDrag(args: {
  deltaClientAlongOutward: number;
  previewZoom: number;
}): number {
  const z = args.previewZoom > 0 ? args.previewZoom : 1;
  return (2 * args.deltaClientAlongOutward) / z;
}

/** Escala total página → pantalla (layoutScale × previewZoom). */
export function pageToScreenScale(layoutScale: number, previewZoom: number): number {
  return Math.max(0.0001, layoutScale * (previewZoom > 0 ? previewZoom : 1));
}

export function buildViewportState(args: {
  width: number;
  referenceWidth: number;
  previewZoom: number;
}): SiteCreatorViewportState {
  const width = clampViewportWidth(args.width, args.referenceWidth);
  return {
    width,
    preset: detectViewportPreset(width, args.referenceWidth),
    previewZoom: args.previewZoom > 0 ? args.previewZoom : 1,
  };
}
