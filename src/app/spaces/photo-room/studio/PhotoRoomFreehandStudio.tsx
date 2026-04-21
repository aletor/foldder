"use client";

import React from "react";
import { FreehandStudioCanvas, type FreehandStudioProps } from "../../FreehandStudio";

/**
 * Studio PhotoRoom: única entrada de lienzo para este nodo.
 * El motor compartido es `FreehandStudioCanvas` (mismo archivo que el default export de Designer).
 *
 * Capacidades del lienzo: por defecto `FreehandStudio` infiere PhotoRoom vs Designer
 * (`studioPhotoRoomCanvasPanel`, `designerMode`) y aplica allowlists en
 * `freehand/studio-capabilities.ts` (p. ej. `toolPhotoMarquee`, `photoRoomGraphActions`, `combineRasterLayers`).
 * Para casos raros, el padre puede pasar `studioCapabilities`.
 */
export default function PhotoRoomFreehandStudio(props: FreehandStudioProps) {
  return <FreehandStudioCanvas {...props} />;
}
