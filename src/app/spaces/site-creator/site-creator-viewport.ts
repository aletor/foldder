/**
 * Fase 6A — ancho de vista web vs zoom de edición.
 * No persiste reglas responsive; solo estado temporal del Studio.
 */

export const SITE_CREATOR_TABLET_WIDTH = 768;
export const SITE_CREATOR_MOBILE_WIDTH = 390;
export const SITE_CREATOR_MIN_VIEWPORT_WIDTH = 280;
export const SITE_CREATOR_MIN_DEVICE_HEIGHT = 320;
export const SITE_CREATOR_MAX_DEVICE_HEIGHT = 2400;

export type SiteCreatorViewportBand = "original" | "tablet" | "mobile";
export type SiteCreatorDeviceSizeId = "compact" | "standard" | "large" | "custom";
export type SiteCreatorDeviceOrientation = "portrait" | "landscape";

export type SiteCreatorDevicePreset = {
  id: Exclude<SiteCreatorDeviceSizeId, "custom">;
  label: string;
  width: number;
  height: number;
};

export type SiteCreatorDeviceConfig = {
  sizeId: SiteCreatorDeviceSizeId;
  orientation: SiteCreatorDeviceOrientation;
  customWidth: number;
  customHeight: number;
};

export const SITE_CREATOR_MOBILE_DEVICE_PRESETS: SiteCreatorDevicePreset[] = [
  { id: "compact", label: "Compacto", width: 360, height: 800 },
  { id: "standard", label: "Estándar", width: 390, height: 844 },
  { id: "large", label: "Grande", width: 412, height: 915 },
];

export const SITE_CREATOR_TABLET_DEVICE_PRESETS: SiteCreatorDevicePreset[] = [
  { id: "compact", label: "Compacta", width: 768, height: 1024 },
  { id: "standard", label: "Estándar", width: 820, height: 1180 },
  { id: "large", label: "Grande", width: 1024, height: 1366 },
];

export function devicePresetsForBand(band: "tablet" | "mobile"): SiteCreatorDevicePreset[] {
  return band === "tablet" ? SITE_CREATOR_TABLET_DEVICE_PRESETS : SITE_CREATOR_MOBILE_DEVICE_PRESETS;
}

export function defaultDeviceConfig(band: "tablet" | "mobile"): SiteCreatorDeviceConfig {
  const preset = devicePresetsForBand(band).find((p) => p.id === "standard")!;
  return {
    sizeId: "standard",
    orientation: "portrait",
    customWidth: preset.width,
    customHeight: preset.height,
  };
}

export function clampDeviceHeight(height: number): number {
  const n = Number.isFinite(height) ? height : SITE_CREATOR_MIN_DEVICE_HEIGHT;
  return Math.round(Math.min(SITE_CREATOR_MAX_DEVICE_HEIGHT, Math.max(SITE_CREATOR_MIN_DEVICE_HEIGHT, n)));
}

export function resolveDeviceDimensions(args: {
  band: "tablet" | "mobile";
  config: SiteCreatorDeviceConfig;
  referenceWidth: number;
}): { width: number; height: number; sizeLabel: string } {
  const presets = devicePresetsForBand(args.band);
  let baseW: number;
  let baseH: number;
  let sizeLabel: string;
  if (args.config.sizeId === "custom") {
    baseW = clampViewportWidth(args.config.customWidth, args.referenceWidth);
    baseH = clampDeviceHeight(args.config.customHeight);
    sizeLabel = "Personalizado";
  } else {
    const preset = presets.find((p) => p.id === args.config.sizeId) ?? presets[1]!;
    baseW = preset.width;
    baseH = preset.height;
    sizeLabel = preset.label;
  }
  const width =
    args.config.orientation === "landscape"
      ? clampViewportWidth(baseH, args.referenceWidth)
      : clampViewportWidth(baseW, args.referenceWidth);
  const height =
    args.config.orientation === "landscape" ? clampDeviceHeight(baseW) : clampDeviceHeight(baseH);
  return { width, height, sizeLabel };
}
export const SITE_CREATOR_FIT_ZOOM_MAX = 2;
export const SITE_CREATOR_PREVIEW_ZOOM_MIN = 0.05;
export const SITE_CREATOR_PREVIEW_ZOOM_MAX = 4;
export const SITE_CREATOR_PREVIEW_ZOOM_WHEEL_FACTOR = 1.08;

export function clampPreviewZoom(zoom: number): number {
  const n = Number.isFinite(zoom) ? zoom : 1;
  return Math.min(SITE_CREATOR_PREVIEW_ZOOM_MAX, Math.max(SITE_CREATOR_PREVIEW_ZOOM_MIN, n));
}

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

/** Zoom para encajar el layout en el área visible del preview. */
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

/** Clic en el padding oscuro del preview (fuera del stage / página). */
export function isSiteCreatorPreviewChromeBackgroundTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("[data-site-creator-floating-ui]")) return false;
  if (target.closest(".site-creator-viewport-resize")) return false;
  if (target.closest(".site-creator-preview-stage")) return false;
  return Boolean(target.closest(".site-creator-preview-scroll"));
}
