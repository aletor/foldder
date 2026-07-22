/** Sesión Image Creation abierta desde Designer (sin cable en el grafo). */

export type DesignerImageStudioTargetKind = "image" | "imageFrame";

export type DesignerImageStudioSession = {
  designerNodeId: string;
  nanoNodeId: string;
  pageId: string;
  imageObjectId: string;
  targetKind: DesignerImageStudioTargetKind;
  /** URL / data URL de partida (capa, contenido del marco, o seed negra). */
  sourceImageUrl: string;
  /** True si la fuente es placeholder negra (marco vacío). */
  seedIsPlaceholder?: boolean;
  mode: "edit";
};

export type DesignerImageStudioResult = {
  /** Nueva URL (o data URL) generada; si falta, no se toca la capa/marco. */
  imageUrl?: string;
  s3Key?: string;
};
