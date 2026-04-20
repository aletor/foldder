"use client";

import React from "react";
import { FreehandStudioCanvas, type FreehandStudioProps } from "../../FreehandStudio";

/**
 * Studio PhotoRoom: única entrada de lienzo para este nodo.
 * El motor compartido es `FreehandStudioCanvas` (mismo archivo que el default export de Designer).
 *
 * Convención: nuevas herramientas, overlays raster y reglas solo PhotoRoom se añaden aquí o en
 * módulos bajo `photo-room/`, evitando tocar `DesignerStudio` y minimizando cambios en el
 * bundle “Designer” (import default desde `FreehandStudio`).
 */
export default function PhotoRoomFreehandStudio(props: FreehandStudioProps) {
  return <FreehandStudioCanvas {...props} />;
}
