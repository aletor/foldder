/** Tamaño inicial de nodos media: ancho en ratio 16:9 respecto al alto (preview del lienzo). */
export const NANO_BANANA_DEFAULT_H = 480;
export const NANO_BANANA_DEFAULT_W = Math.round((NANO_BANANA_DEFAULT_H * 16) / 9);
export const GEMINI_VIDEO_DEFAULT_H = 540;
export const GEMINI_VIDEO_DEFAULT_W = Math.round((GEMINI_VIDEO_DEFAULT_H * 16) / 9);

export const FINAL_NODE_ID = "final_output_permanent";

/** Zoom intro 2s + typewriter cabecera (retraso 1s); se limpia al cabo para no persistir en guardados. */
export const FOLDDER_CANVAS_INTRO_CLEAR_MS = 3600;

/**
 * Por defecto XY Flow usa `noPanClassName="nopan"`: si el wheel va a un descendiente de `.nopan`,
 * el filtro rechaza el evento y no hay pan con trackpad. Varios nodos llevan `nopan` en zonas amplias.
 * Usamos una clase que no existe en el DOM: el pan con dos dedos llega al lienzo; `nowheel` en inputs no cambia.
 */
export const XYFLOW_NO_PAN_WHEEL_GUARD_CLASS = "foldder-xyflow-nopan-guard-disabled";

/**
 * Margen relativo para `fitView` (@xyflow: default 0.1). Valores altos añaden mucho aire y el grafo se ve pequeño;
 * 1.2 era demasiado agresivo.
 */
export const FIT_VIEW_PADDING = 0.14;

/**
 * Solo al arrastrar un tipo desde el sidebar (con parpadeo de compatibles): `FIT_VIEW_PADDING` × 5
 * para ver mucho más lienzo vacío al colocar. No afecta al resto de “ajustar a ventana”.
 */
export const FIT_VIEW_PADDING_LIBRARY_DRAG = FIT_VIEW_PADDING * 5;

/** Con ≤4 nodos en lienzo: el doble de aire al arrastrar desde la librería (primeros nodos no llenan pantalla). */
export const FIT_VIEW_PADDING_LIBRARY_DRAG_SPARSE = FIT_VIEW_PADDING_LIBRARY_DRAG * 2;

export const LIBRARY_DRAG_SPARSE_CANVAS_NODE_THRESHOLD = 4;

export function libraryDragFitViewPadding(placedNodeCount: number): number {
  return placedNodeCount > LIBRARY_DRAG_SPARSE_CANVAS_NODE_THRESHOLD
    ? FIT_VIEW_PADDING_LIBRARY_DRAG
    : FIT_VIEW_PADDING_LIBRARY_DRAG_SPARSE;
}

/** Al encuadrar uno o pocos nodos (doble clic, nodo nuevo, etc.): un poco más de margen que el fit a todo el grafo */
export const FIT_VIEW_PADDING_NODE_FOCUS = 0.8;

/** Modo cartas: margen al encuadrar el nodo activo. */
export const FIT_VIEW_PADDING_CARDS = 0.35;

/** Duración efectiva de encuadres `fitView` / `fitViewToNodeIds` (nominal ÷ 2; antes ÷ 4, demasiado rápido). Mín. 40 ms. */
export function fitAnim(ms: number): number {
  return Math.max(40, Math.round(ms / 2));
}
