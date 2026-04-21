/**
 * Capacidades explícitas del lienzo (`FreehandStudioCanvas`) por contexto (Designer vs PhotoRoom, etc.).
 * Evita que herramientas de un producto aparezcan en otro por olvidar un `if` suelto.
 *
 * Valores por defecto: `inferDefaultStudioCapabilities` + `resolveStudioCapabilities`.
 * El host puede pasar `studioCapabilities?: Partial<...>` para forzar o ampliar casos puntuales.
 */

export type FreehandStudioCapabilities = {
  /** Pincel raster (toolbar + tecla B). */
  toolBrush: boolean;
  /** Tampón de clon (toolbar + tecla S). */
  toolCloneStamp: boolean;
  /** Degradado lineal raster (arrastre en lienzo; capa o máscara). Solo PhotoRoom por defecto. */
  toolPhotoGradient: boolean;
  /** Marcos lazo / rect / elipse / poligonal tipo PhotoRoom (toolbar + M/L/O…). */
  toolPhotoMarquee: boolean;
  /** Panel «Convertir en selección» desde forma vectorial → marco PhotoRoom. */
  photoMarqueeFromVector: boolean;
  /**
   * Panel grafo PhotoRoom: «Modificar imagen con IA», «Rasterizar imagen» (entrada conectada).
   * Solo aplica si el host pasa los callbacks; en Designer sigue desactivado por defecto.
   */
  photoRoomGraphActions: boolean;
  /** Panel Propiedades: «Combinar capas» (rasterizar selección / visibles / todo). Solo PhotoRoom por defecto. */
  combineRasterLayers: boolean;
  /** Layer Styles (color / gradient overlay no destructivos). Solo PhotoRoom por defecto. */
  layerStyles: boolean;
  /** Máscara de capa (bitmap en escala de grises) por capa raster. Solo PhotoRoom por defecto. */
  layerMask: boolean;
};

const CAPS_DESIGNER: FreehandStudioCapabilities = {
  toolBrush: false,
  toolCloneStamp: false,
  toolPhotoGradient: false,
  toolPhotoMarquee: false,
  photoMarqueeFromVector: false,
  photoRoomGraphActions: false,
  combineRasterLayers: false,
  layerStyles: false,
  layerMask: false,
};

const CAPS_PHOTOROOM: FreehandStudioCapabilities = {
  toolBrush: true,
  toolCloneStamp: true,
  toolPhotoGradient: true,
  toolPhotoMarquee: true,
  photoMarqueeFromVector: true,
  photoRoomGraphActions: true,
  combineRasterLayers: true,
  layerStyles: true,
  layerMask: true,
};

/** Entorno sin Designer ni panel PhotoRoom: mismo perfil conservador que Designer. */
const CAPS_GENERIC: FreehandStudioCapabilities = { ...CAPS_DESIGNER };

export function inferDefaultStudioCapabilities(opts: {
  designerMode: boolean;
  /** `studioPhotoRoomCanvasPanel != null` en el host. */
  isPhotoRoomEmbed: boolean;
}): FreehandStudioCapabilities {
  if (opts.isPhotoRoomEmbed) return { ...CAPS_PHOTOROOM };
  if (opts.designerMode) return { ...CAPS_DESIGNER };
  return { ...CAPS_GENERIC };
}

export function mergeStudioCapabilities(
  base: FreehandStudioCapabilities,
  partial?: Partial<FreehandStudioCapabilities>,
): FreehandStudioCapabilities {
  if (!partial) return base;
  return { ...base, ...partial };
}

export function resolveStudioCapabilities(opts: {
  designerMode: boolean;
  isPhotoRoomEmbed: boolean;
  override?: Partial<FreehandStudioCapabilities>;
}): FreehandStudioCapabilities {
  const base = inferDefaultStudioCapabilities(opts);
  return mergeStudioCapabilities(base, opts.override);
}
