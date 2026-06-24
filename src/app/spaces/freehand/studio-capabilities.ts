/**
 * Capacidades explícitas del lienzo (`FreehandStudioCanvas`) por contexto (Designer, etc.).
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
  /** Degradado lineal raster (arrastre en lienzo; capa o máscara). */
  toolPhotoGradient: boolean;
  /**
   * Panel grafo: «Modificar imagen con IA», «Rasterizar imagen» (entrada conectada).
   * Solo aplica si el host pasa los callbacks.
   */
  photoRoomGraphActions: boolean;
  /** Panel Propiedades: «Combinar capas» (rasterizar selección / visibles / todo). */
  combineRasterLayers: boolean;
  /** Layer Styles (color / gradient overlay no destructivos). */
  layerStyles: boolean;
  /** Máscara de capa (bitmap en escala de grises) por capa raster. */
  layerMask: boolean;
};

const CAPS_DESIGNER: FreehandStudioCapabilities = {
  toolBrush: true,
  toolCloneStamp: true,
  toolPhotoGradient: true,
  photoRoomGraphActions: false,
  combineRasterLayers: true,
  layerStyles: true,
  layerMask: true,
};

/** Entorno sin Designer: mismo perfil conservador. */
const CAPS_GENERIC: FreehandStudioCapabilities = { ...CAPS_DESIGNER };

export function inferDefaultStudioCapabilities(opts: {
  designerMode: boolean;
}): FreehandStudioCapabilities {
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
  override?: Partial<FreehandStudioCapabilities>;
}): FreehandStudioCapabilities {
  const base = inferDefaultStudioCapabilities(opts);
  return mergeStudioCapabilities(base, opts.override);
}
