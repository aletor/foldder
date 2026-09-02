/**
 * Fase 6A — ancho de vista web vs zoom de edición.
 * No persiste reglas responsive; solo estado temporal del Studio.
 */

export const SITE_CREATOR_TABLET_WIDTH = 768;
/** Inclusive: tablet CSS applies up to this width. Desktop starts at 1025. */
export const SITE_CREATOR_TABLET_MAX_WIDTH = 1024;
export const SITE_CREATOR_MOBILE_WIDTH = 390;

/** Media query max-width for tablet. Never swallows typical desktop widths. */
export function siteCreatorTabletMediaMaxWidth(referenceWidth: number): number {
  return Math.min(
    SITE_CREATOR_TABLET_MAX_WIDTH,
    Math.max(SITE_CREATOR_TABLET_WIDTH, Math.round(referenceWidth) - 1),
  );
}
export const SITE_CREATOR_MIN_VIEWPORT_WIDTH = 280;
/** Ancho máximo inicial de la vista Ordenador. */
export const SITE_CREATOR_DEFAULT_MONITOR_MAX_WIDTH = 1500;
export const SITE_CREATOR_MIN_DEVICE_HEIGHT = 320;
export const SITE_CREATOR_MAX_DEVICE_HEIGHT = 2880;

export type SiteCreatorViewportBand = "original" | "monitor" | "tablet" | "mobile";
export type SiteCreatorDeviceBand = Exclude<SiteCreatorViewportBand, "original">;
export type SiteCreatorDeviceChromeKind = SiteCreatorDeviceBand;

/** Banda de layout responsive desde la banda de viewport del Studio. */
export function fitLayoutBandFromViewport(
  band: SiteCreatorViewportBand,
): "wide" | "monitor" | "tablet" | "mobile" {
  if (band === "monitor") return "monitor";
  if (band === "tablet") return "tablet";
  if (band === "mobile") return "mobile";
  return "wide";
}

export type SiteCreatorDeviceFrame = {
  width: number;
  height: number;
  kind?: SiteCreatorDeviceChromeKind;
};

export type SiteCreatorDeviceChrome = {
  kind: SiteCreatorDeviceChromeKind;
  bezelPx: number;
  radiusPx: number;
  innerRadiusPx: number;
  color: string;
  rim: string;
};

/** Bisel mínimo alrededor de la página. No escala con el zoom. */
export const SITE_CREATOR_DEVICE_CHROME: Record<
  SiteCreatorDeviceChromeKind,
  Omit<SiteCreatorDeviceChrome, "kind">
> = {
  mobile: {
    bezelPx: 10,
    radiusPx: 22,
    innerRadiusPx: 12,
    color: "#3a414c",
    rim: "0 0 0 1px rgba(255,255,255,0.22)",
  },
  tablet: {
    bezelPx: 8,
    radiusPx: 14,
    innerRadiusPx: 6,
    color: "#3a414c",
    rim: "0 0 0 1px rgba(255,255,255,0.22)",
  },
  monitor: {
    bezelPx: 12,
    radiusPx: 8,
    innerRadiusPx: 2,
    color: "#3a414c",
    rim: "0 0 0 1px rgba(255,255,255,0.22)",
  },
};

export function resolveSiteCreatorDeviceChromeKind(
  frame: SiteCreatorDeviceFrame,
): SiteCreatorDeviceChromeKind {
  if (frame.kind === "monitor" || frame.kind === "tablet" || frame.kind === "mobile") {
    return frame.kind;
  }
  return Math.min(frame.width, frame.height) <= 500 ? "mobile" : "tablet";
}

export function siteCreatorDeviceChrome(
  kind: SiteCreatorDeviceChromeKind,
): SiteCreatorDeviceChrome {
  return { kind, ...SITE_CREATOR_DEVICE_CHROME[kind] };
}

const VIEWPORT_BANDS: SiteCreatorViewportBand[] = ["original", "monitor", "tablet", "mobile"];

/** Tab: original → monitor → tablet → móvil. Mayús + Tab al revés. */
export function cycleViewportBand(
  band: SiteCreatorViewportBand,
  direction: 1 | -1,
): SiteCreatorViewportBand {
  const index = VIEWPORT_BANDS.indexOf(band);
  const from = index >= 0 ? index : 0;
  const next = (from + direction + VIEWPORT_BANDS.length) % VIEWPORT_BANDS.length;
  return VIEWPORT_BANDS[next]!;
}
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

/** Base apaisada 16:9. El retrato intercambia ancho y alto. */
export const SITE_CREATOR_MONITOR_DEVICE_PRESETS: SiteCreatorDevicePreset[] = [
  { id: "compact", label: "Compacto", width: 1280, height: 720 },
  { id: "standard", label: "Estándar", width: 1920, height: 1080 },
  { id: "large", label: "Grande", width: 2560, height: 1440 },
];

export function devicePresetsForBand(band: SiteCreatorDeviceBand): SiteCreatorDevicePreset[] {
  if (band === "monitor") return SITE_CREATOR_MONITOR_DEVICE_PRESETS;
  if (band === "tablet") return SITE_CREATOR_TABLET_DEVICE_PRESETS;
  return SITE_CREATOR_MOBILE_DEVICE_PRESETS;
}

export function defaultDeviceConfig(band: SiteCreatorDeviceBand): SiteCreatorDeviceConfig {
  const preset = devicePresetsForBand(band).find((p) => p.id === "standard")!;
  return {
    sizeId: "standard",
    orientation: band === "monitor" ? "landscape" : "portrait",
    customWidth: preset.width,
    customHeight: preset.height,
  };
}

export function clampDeviceHeight(height: number): number {
  const n = Number.isFinite(height) ? height : SITE_CREATOR_MIN_DEVICE_HEIGHT;
  return Math.round(Math.min(SITE_CREATOR_MAX_DEVICE_HEIGHT, Math.max(SITE_CREATOR_MIN_DEVICE_HEIGHT, n)));
}

export function resolveDeviceDimensions(args: {
  band: SiteCreatorDeviceBand;
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
  /** Monitor guarda 16:9 apaisado; tablet/móvil guardan retrato. */
  const swap = args.band === "monitor"
    ? args.config.orientation === "portrait"
    : args.config.orientation === "landscape";
  const width = swap
    ? clampViewportWidth(baseH, args.referenceWidth)
    : clampViewportWidth(baseW, args.referenceWidth);
  const height = swap ? clampDeviceHeight(baseW) : clampDeviceHeight(baseH);
  return { width, height, sizeLabel };
}
export const SITE_CREATOR_FIT_ZOOM_MAX = 2;
export const SITE_CREATOR_PREVIEW_ZOOM_MIN = 0.05;
export const SITE_CREATOR_PREVIEW_ZOOM_MAX = 4;
export const SITE_CREATOR_PREVIEW_ZOOM_WHEEL_FACTOR = 1.08;
/** Ventana de doble clic nativo: no exige un gesto ultrarrápido ni dos clics separados. */
export const SITE_CREATOR_DOUBLE_CLICK_MS = 500;
/** Padding alrededor del objeto al hacer zoom de enfoque. */
export const SITE_CREATOR_OBJECT_FOCUS_PADDING_PX = 56;
export const SITE_CREATOR_OBJECT_FOCUS_SCALE_MAX = 8;
/** Rueda mínima (px) para salir del zoom de enfoque. */
export const SITE_CREATOR_FOCUS_ZOOM_WHEEL_PX = 2;

export function isRapidSecondClick(
  previousAtMs: number | null | undefined,
  nextAtMs: number,
  windowMs = SITE_CREATOR_DOUBLE_CLICK_MS,
): boolean {
  if (previousAtMs == null) return false;
  const dt = nextAtMs - previousAtMs;
  return dt >= 0 && dt <= windowMs;
}

export function computeCanvasFocusCamera(args: {
  pageRect: { x: number; y: number; width: number; height: number };
  pageWidth: number;
  pageHeight: number;
  contentDisplayWidth: number;
  contentDisplayHeight: number;
  contentOffsetX: number;
  contentOffsetY: number;
  wrapperWidth: number;
  wrapperHeight: number;
  availableWidth: number;
  availableHeight: number;
  scrollTop?: number;
  paddingPx?: number;
  maxScale?: number;
}): { scale: number; transform: string } {
  const pageW = Math.max(1, args.pageWidth);
  const pageH = Math.max(1, args.pageHeight);
  const objW = Math.max(1, (args.pageRect.width / pageW) * args.contentDisplayWidth);
  const objH = Math.max(1, (args.pageRect.height / pageH) * args.contentDisplayHeight);
  const objCx =
    args.contentOffsetX +
    ((args.pageRect.x + args.pageRect.width / 2) / pageW) * args.contentDisplayWidth;
  const objCy =
    args.contentOffsetY +
    ((args.pageRect.y + args.pageRect.height / 2) / pageH) * args.contentDisplayHeight -
    Math.max(0, args.scrollTop ?? 0);
  const pad = args.paddingPx ?? SITE_CREATOR_OBJECT_FOCUS_PADDING_PX;
  const maxScale = args.maxScale ?? SITE_CREATOR_OBJECT_FOCUS_SCALE_MAX;
  const fitW = Math.max(1, args.availableWidth - pad * 2);
  const fitH = Math.max(1, args.availableHeight - pad * 2);
  const scale = Math.min(maxScale, Math.max(1, Math.min(fitW / objW, fitH / objH)));
  const transform = `translate(${args.wrapperWidth / 2}px, ${args.wrapperHeight / 2}px) scale(${scale}) translate(${-objCx}px, ${-objCy}px)`;
  return { scale, transform };
}

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
/**
 * Espacio extra (bisel + rail de márgenes) que el zoom de dispositivo
 * debe reservar para que el marco quepa entero.
 */
export function reserveDeviceFrameFitSize(args: {
  availableWidth: number;
  availableHeight: number;
  bezelPx: number;
  railGutterPx: number;
}): { width: number; height: number } {
  const bezel = Math.max(0, args.bezelPx) * 2;
  /** py-8 es 64px; measureSiteCreatorPreviewAvailableSize ya resta 48. */
  const padCorrection = 16;
  return {
    width: Math.max(1, args.availableWidth - bezel),
    height: Math.max(
      1,
      args.availableHeight - Math.max(0, args.railGutterPx) - bezel - padCorrection,
    ),
  };
}

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
 * Zoom para llenar el ancho del área (Preview de página).
 * No encaja también en alto: la página reflowea al ancho real y puede hacer scroll vertical.
 */
export function computeFillWidthPreviewZoom(args: {
  layoutWidth: number;
  availableWidth: number;
  /** En Ordenador, no estirar la página por encima de este ancho CSS. */
  maxCssWidth?: number;
}): number {
  const lw = Math.max(1, args.layoutWidth);
  const aw = Math.max(1, args.availableWidth);
  const displayed =
    args.maxCssWidth != null ? Math.min(aw, Math.max(1, args.maxCssWidth)) : aw;
  return Math.max(0.05, displayed / lw);
}

/** Área útil del preview: en edición resta el padding del lienzo; en Preview de página usa el ancho real. */
export function measureSiteCreatorPreviewAvailableSize(args: {
  clientWidth: number;
  clientHeight: number;
  fillViewport: boolean;
}): { width: number; height: number } {
  const pad = args.fillViewport ? 0 : 48;
  return {
    width: Math.max(240, args.clientWidth - pad),
    height: Math.max(180, args.clientHeight - pad),
  };
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
  if (target.closest(".site-creator-device-chrome")) return false;
  return Boolean(target.closest(".site-creator-preview-scroll"));
}

/** Rueda en el lienzo: si hay scroller interior, reenviar ahí. No cambia el recuadro. */
export function shouldRedirectCanvasWheelToWorkArea(args: {
  readOnly: boolean;
  ctrlOrMeta: boolean;
  innerScroller: EventTarget | null;
  eventTarget: EventTarget | null;
}): boolean {
  if (args.readOnly || args.ctrlOrMeta) return false;
  if (!(args.innerScroller instanceof Element)) return false;
  if (args.eventTarget instanceof Node && args.innerScroller.contains(args.eventTarget)) return false;
  return true;
}

export function applyWorkAreaWheelDelta(
  scroller: HTMLElement,
  delta: { deltaX: number; deltaY: number },
): void {
  scroller.scrollTop += delta.deltaY;
  scroller.scrollLeft += delta.deltaX;
}

/** Reenvía la rueda al scroller interior para que Suave/Fijo puedan interceptarla. */
export function forwardWorkAreaWheelToScroller(
  scroller: HTMLElement,
  delta: { deltaX: number; deltaY: number; ctrlKey?: boolean; metaKey?: boolean },
): void {
  const forwarded = new WheelEvent("wheel", {
    deltaX: delta.deltaX,
    deltaY: delta.deltaY,
    ctrlKey: Boolean(delta.ctrlKey),
    metaKey: Boolean(delta.metaKey),
    cancelable: true,
    bubbles: true,
  });
  scroller.dispatchEvent(forwarded);
  if (!forwarded.defaultPrevented) {
    applyWorkAreaWheelDelta(scroller, { deltaX: delta.deltaX, deltaY: delta.deltaY });
  }
}

/** Lleva un rectángulo en unidades de página al área visible del scroller de trabajo. */
export function scrollWorkAreaToPageRect(args: {
  scroller: HTMLElement;
  stage: HTMLElement;
  pageRect: { y: number; height: number };
  pageHeight: number;
  paddingPx?: number;
}): void {
  const { scroller, stage, pageRect } = args;
  if (scroller.scrollHeight <= scroller.clientHeight + 1) return;
  const pageH = Math.max(1, args.pageHeight);
  const pad = args.paddingPx ?? 24;
  const stageBox = stage.getBoundingClientRect();
  const scrollerBox = scroller.getBoundingClientRect();
  const topOnStage = (pageRect.y / pageH) * stageBox.height;
  const bottomOnStage = ((pageRect.y + Math.max(0, pageRect.height)) / pageH) * stageBox.height;
  const topInScroller = scroller.scrollTop + (stageBox.top + topOnStage - scrollerBox.top);
  const bottomInScroller =
    scroller.scrollTop + (stageBox.top + bottomOnStage - scrollerBox.top);
  const viewTop = scroller.scrollTop;
  const viewBottom = viewTop + scroller.clientHeight;
  if (topInScroller >= viewTop + pad && bottomInScroller <= viewBottom - pad) return;
  if (topInScroller < viewTop + pad) {
    scroller.scrollTop = Math.max(0, topInScroller - pad);
    return;
  }
  if (bottomInScroller > viewBottom - pad) {
    scroller.scrollTop = Math.max(0, bottomInScroller - scroller.clientHeight + pad);
  }
}
