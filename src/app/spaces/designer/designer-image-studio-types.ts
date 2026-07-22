/** Sesión Image Creation abierta desde Designer (sin cable en el grafo). */

export type DesignerImageStudioSession = {
  designerNodeId: string;
  nanoNodeId: string;
  pageId: string;
  imageObjectId: string;
  /** URL / data URL de la capa al abrir el Studio. */
  sourceImageUrl: string;
  mode: "edit";
};

export type DesignerImageStudioResult = {
  /** Nueva URL (o data URL) generada; si falta, no se toca la capa. */
  imageUrl?: string;
  s3Key?: string;
};
