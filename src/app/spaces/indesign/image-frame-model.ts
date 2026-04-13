/**
 * Modelo marco vs contenido para cajas de imagen (estilo InDesign).
 * `ImageFrameRecord.id` coincide con `indesignUid` del Rect marco en Fabric.
 */

export type ContentAlignment =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type ImageFittingMode =
  | "fit-proportional"
  | "fill-proportional"
  | "fit-stretch"
  | "fill-stretch"
  | "frame-to-content"
  | "center-content";

export type FrameImageContent = {
  id: string;
  src: string;
  originalWidth: number;
  originalHeight: number;
  scaleX: number;
  scaleY: number;
  /** Origen imagen respecto al vértice superior izquierdo del marco (coords locales). */
  offsetX: number;
  offsetY: number;
  fittingMode: ImageFittingMode;
};

export type ImageFrameRecord = {
  id: string;
  autoFit: boolean;
  contentAlignment: ContentAlignment;
  imageContent: FrameImageContent | null;
};

export const DEFAULT_CONTENT_ALIGNMENT: ContentAlignment = "center";

export const DEFAULT_FITTING: ImageFittingMode = "fill-proportional";

export function uidImageContent(): string {
  return `imgc_${Math.random().toString(36).slice(2, 12)}`;
}

export function emptyImageFrameRecord(id: string): ImageFrameRecord {
  return {
    id,
    autoFit: true,
    contentAlignment: DEFAULT_CONTENT_ALIGNMENT,
    imageContent: null,
  };
}

export function upsertImageFrameRecord(
  list: ImageFrameRecord[],
  record: ImageFrameRecord,
): ImageFrameRecord[] {
  const i = list.findIndex((r) => r.id === record.id);
  if (i < 0) return [...list, record];
  const next = [...list];
  next[i] = record;
  return next;
}

export function patchImageFrameRecord(
  list: ImageFrameRecord[],
  id: string,
  patch: Partial<Omit<ImageFrameRecord, "id">>,
): ImageFrameRecord[] {
  const i = list.findIndex((r) => r.id === id);
  if (i < 0) {
    return upsertImageFrameRecord(list, { ...emptyImageFrameRecord(id), ...patch, id });
  }
  const next = [...list];
  next[i] = { ...next[i]!, ...patch };
  return next;
}

export function getImageFrameRecord(
  list: ImageFrameRecord[] | undefined,
  id: string,
): ImageFrameRecord | undefined {
  return list?.find((r) => r.id === id);
}

/** Compat: `imageFit` en marcos antiguos ("fill" | "fit"). */
export function legacyFabricImageFitToMode(fit: unknown): ImageFittingMode {
  if (fit === "fit") return "fit-proportional";
  return "fill-proportional";
}
