import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";

/** Shell fullscreen del studio (grafo debajo). */
export const STUDIO_SHELL_Z = 100090;

/** Popovers del toolbar: por encima del shell, por debajo de modales de capa. */
export const STUDIO_TOOLBAR_POPOVER_Z = 100150;

/** z-index por encima del shell del studio y del sidebar del grafo. */
export const STUDIO_LAYER_MODAL_Z = 100200;

/**
 * Modales/popovers portaled a `document.body` desde el studio (propiedades, biblioteca Foldder, color…).
 * Debe ser > {@link STUDIO_SHELL_Z} (100090) o quedan ocultos detrás del lienzo fullscreen.
 */
export const STUDIO_BODY_PORTAL_Z = STUDIO_LAYER_MODAL_Z;

export function stopStudioModalPointerPropagation(e: ReactPointerEvent | ReactMouseEvent) {
  e.stopPropagation();
}

export const FOLDDER_EFFECT_LAYER_PANEL_SELECTOR = "[data-foldder-effect-layer-panel]";

export function isInsideFoldderEffectLayerPanel(el: EventTarget | null): boolean {
  return !!(el as HTMLElement | null)?.closest?.(FOLDDER_EFFECT_LAYER_PANEL_SELECTOR);
}

/** Evita que sliders/controles del modal disparen pan/move del lienzo debajo. */
export const studioOverlayPointerGuards = {
  onMouseDown: stopStudioModalPointerPropagation,
  onMouseMove: stopStudioModalPointerPropagation,
  onMouseUp: stopStudioModalPointerPropagation,
  onPointerDown: stopStudioModalPointerPropagation,
  onPointerMove: stopStudioModalPointerPropagation,
  onPointerUp: stopStudioModalPointerPropagation,
  onClick: stopStudioModalPointerPropagation,
} as const;

/** Atributos compartidos del backdrop de modales dentro de un studio fullscreen. */
export function studioModalBackdropHandlers(onDismiss?: () => void) {
  return {
    "data-foldder-studio-panel": true,
    onPointerDown: stopStudioModalPointerPropagation,
    onPointerMove: stopStudioModalPointerPropagation,
    onPointerUp: stopStudioModalPointerPropagation,
    onClick: onDismiss,
  } as const;
}
