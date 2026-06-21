import type { ContentAlignment, ImageFittingMode } from "../indesign/image-frame-model";

/** Evento global: `page.tsx` crea Prompt + URL Image + Video Generator (prompt + first frame) y abre Studio. */
export const FOLDDER_OPEN_GEMINI_VIDEO_WITH_IMAGE_EVENT = "foldder-open-gemini-video-with-image";

export type FoldderOpenGeminiVideoDetail = {
  imageUrl: string;
  /** Prompt listo para el nodo (mejorado vía /api/openai/enhance). */
  videoPrompt: string;
};

/**
 * Videos superpuestos a imágenes en el Presenter (persistidos en el nodo Presenter, no en Designer).
 */
export type PresenterImageVideoRel = {
  /** 0–1 respecto al marco de la imagen */
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PresenterImageVideoPlacement = {
  id: string;
  pageId: string;
  /** Objeto Freehand ancla: imagen, marco, boolean raster, rectángulo, elipse o path cerrado */
  imageObjectId: string;
  videoUrl: string;
  s3Key?: string;
  /** Área del video dentro del rectángulo de la imagen (por defecto todo el marco) */
  rel: PresenterImageVideoRel;
  /** Reproducción automática al cargar (por defecto true). */
  autoplay?: boolean;
  loop?: boolean;
  mute?: boolean;
  /** Segundo del vídeo usado como fotograma en pausa (sin autoplay) antes de pulsar play. */
  posterTimeSec?: number;
  /** Misma semántica que el marco de imagen del Designer (`fill-proportional` = cubrir). */
  videoFittingMode?: ImageFittingMode;
  /** Recorte / punto focal con `object-position` (vídeo rellenando el rect de encuadre). */
  videoContentAlignment?: ContentAlignment;
};

export const DEFAULT_PRESENTER_VIDEO_REL: PresenterImageVideoRel = {
  x: 0,
  y: 0,
  w: 1,
  h: 1,
};

/** Props para `DesignerPageCanvasView` / `PresenterSlideStage` (vídeo en lienzo). */
export type PresenterImageVideoCanvasBinding = {
  pageId: string;
  placements: PresenterImageVideoPlacement[];
  uiMode: "edit" | "playback";
  uploadingKey: string | null;
  onUploadBusy: (key: string | null) => void;
  onUpsert: (p: PresenterImageVideoPlacement) => void;
  onPatch: (
    id: string,
    patch: Partial<
      Pick<
        PresenterImageVideoPlacement,
        | "rel"
        | "autoplay"
        | "loop"
        | "mute"
        | "posterTimeSec"
        | "videoFittingMode"
        | "videoContentAlignment"
      >
    >,
  ) => void;
  onRemove: (id: string) => void;
  /**
   * Modo edición: solo este `imageObjectId` muestra handles / arrastre de encuadre.
   * `null` = ninguno (p. ej. otro objeto seleccionado). Omitir = compat: todos los destinos editables.
   */
  videoTransformHandlesObjectId?: string | null;
  /** Claves de selección del lienzo (`revealTargetKey`); controlan la barra de acciones de vídeo. */
  highlightPickKeys?: string[];
};
