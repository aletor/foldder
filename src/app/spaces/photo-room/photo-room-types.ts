import type { FreehandObject, LayoutGuide } from "../FreehandStudio";

export type PhotoRoomArtboardState = {
  id: string;
  width: number;
  height: number;
  background?: string;
};

/** Metadatos del documento creado por el asistente (resolución / modo de color no editables en UI). */
export type PhotoRoomDocumentMeta = {
  name: string;
  resolution: 72;
  colorMode: "RGB";
};

/** Datos de studio persistidos en `node.data` del nodo `photoRoom`. */
export type PhotoRoomNodeStudioData = {
  studioObjects?: FreehandObject[];
  studioLayoutGuides?: LayoutGuide[];
  studioArtboard?: PhotoRoomArtboardState;
  /** Tras el primer “Crear” o “Cancelar” del asistente de nuevo documento, no se vuelve a mostrar. */
  photoRoomDocSetupDone?: boolean;
  photoRoomDocMeta?: PhotoRoomDocumentMeta;
};
