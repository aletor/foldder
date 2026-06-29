/**
 * Lightroom node — datos del nodo (referencia local + DevelopSettings serializable).
 *
 * El RAW nunca se sube; solo persistimos metadatos de la referencia local y el objeto
 * de ajustes. Tras recargar la página hay que re-vincular el archivo (relink).
 */

export type {
  CurvePoint,
  DevelopSettings,
  HslColorChannel,
  HslChannelAdjust,
  LightroomSlider,
} from "./lightroom-develop-settings";

export {
  developDocumentFromNode,
  isDevelopDocumentDefault,
  normalizeDevelopDocument,
} from "./lightroom-mask-types";

export type {
  LightroomDevelopDocument,
  MaskAdjustmentLayer,
  MaskCombineOp,
  MaskPrimitive,
  MaskTool,
} from "./lightroom-mask-types";

export {
  EMPTY_DEVELOP_SETTINGS,
  HSL_COLOR_CHANNELS,
  isDevelopSettingsDefault,
  normalizeDevelopSettings,
  patchDevelopSettings,
} from "./lightroom-develop-settings";

export type LightroomDecodeStatus =
  | "idle"
  | "decoding"
  | "ready"
  | "error"
  | "needs_relink";

/** Referencia persistida al archivo local (sin bytes del RAW). */
export type LightroomLocalSource = {
  fileName: string;
  fileSize: number;
  lastModified: number;
  mimeType?: string;
  /** Extensión normalizada (.cr3, .dng, …) */
  extension: string;
  /** true si el handle sigue vivo en esta sesión del navegador */
  linked: boolean;
};

export type LightroomNodeData = {
  label?: string;
  developSettings?: import("./lightroom-develop-settings").DevelopSettings;
  /** Capas de ajuste enmascarado (Fase 3). */
  maskLayers?: import("./lightroom-mask-types").MaskAdjustmentLayer[];
  source?: LightroomLocalSource;
  /** Decodificación base LibRaw/nativa (sin ajustes WebGL). */
  decodedDataUrl?: string;
  /** Miniatura revelada para la tarjeta del nodo (preview WebGL, sesión). */
  previewDataUrl?: string;
  decodeStatus?: LightroomDecodeStatus;
  decodeError?: string;
  cameraMake?: string;
  cameraModel?: string;
  iso?: number;
  width?: number;
  height?: number;
  /** Salida cocida para el grafo (data URL en Fase 1–2; upload en export explícito futuro). */
  value?: string;
  type?: "image";
  /** true cuando developSettings difiere del default */
  edited?: boolean;
  /** Recorte aplicado en exportación (normalizado 0…1). */
  cropSettings?: import("./lightroom-crop-types").LightroomCropSettings;
};

export type {
  CropAspectRatio,
  LightroomCropSettings,
} from "./lightroom-crop-types";

export { EMPTY_CROP_SETTINGS, normalizeCropSettings, applyCropToDataUrl } from "./lightroom-crop-types";

export type DecodedRawPreview = {
  dataUrl: string;
  width: number;
  height: number;
  cameraMake: string;
  cameraModel: string;
  iso: number;
  bits: number;
  /** true si se usó decodificador nativo (JPEG/PNG) en lugar de LibRaw */
  nativeDecode: boolean;
};
