export const PDF_SCAN_DEFAULT_DPI = 150;
export const PDF_SCAN_MAX_PAGES = 30;
export const PDF_SCAN_MAX_IMAGES = 80;
export const PDF_SCAN_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const PDF_SCAN_MAX_TEXT_SPANS = 800;
export const PDF_SCAN_MAX_DOCUMENT_PATHS = 800;
/** Máximo de páginas OCR por operación (1 llamada de pago / página). */
export const PDF_SCAN_OCR_MAX_PAGES = 10;

export type PdfScanStatus = "empty" | "staged" | "scanning" | "ready" | "error";
export type PdfScanMode = "texts" | "document";

export type PdfScanSourceMeta = {
  s3Key: string;
  contentSha256: string;
  fileName: string;
  byteSize: number;
  url?: string;
};

export type PdfScanTextSpan = {
  id: string;
  page: number;
  /** Top-left in page pixel space at scan DPI */
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fontSize: number;
  fontName?: string;
  fontFamily?: string;
  fontWeight?: number;
  italic?: boolean;
  /** Color de relleno del texto (#rrggbb). */
  color?: string;
};

export type PdfScanImageAsset = {
  id: string;
  page: number;
  width: number;
  height: number;
  thumbUrl: string;
  url: string;
  s3Key: string;
  contentHash: string;
  /** Placement in page px when known (document mode). */
  x?: number;
  y?: number;
};

export type PdfScanPageLayout = {
  pageNumber: number;
  widthPx: number;
  heightPx: number;
  widthPt: number;
  heightPt: number;
  backgroundUrl: string;
  backgroundS3Key: string;
  textSpans: PdfScanTextSpan[];
};

/** Objetos serializables para modo Documento editable → Freehand. */
export type PdfDocumentPathObject = {
  type: "path";
  id: string;
  d: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity?: number;
  blendMode?: string;
  softMask?: boolean;
};

export type PdfDocumentImageObject = {
  type: "image";
  id: string;
  src: string;
  s3Key?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  opacity?: number;
  blendMode?: string;
  softMask?: boolean;
  /** Recorte del raster PDF (F5 QA) cuando el rebuild editable falla la región. */
  fallback?: boolean;
};

export type PdfDocumentTextObject = {
  type: "text";
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  fontName?: string;
  fontFamily?: string;
  fontWeight?: number;
  italic?: boolean;
  opacity?: number;
  color?: string;
};

export type PdfDocumentClipObject = {
  type: "clip";
  id: string;
  maskD: string;
  maskX: number;
  maskY: number;
  maskW: number;
  maskH: number;
  content: Array<PdfDocumentPathObject | PdfDocumentImageObject | PdfDocumentTextObject>;
};

export type PdfDocumentLayerMask = {
  src: string;
  s3Key?: string;
  pixelW: number;
  pixelH: number;
  inverted?: boolean;
  subtype?: "Alpha" | "Luminosity";
};

export type PdfDocumentGroupObject = {
  type: "group";
  id: string;
  kind: "transparency" | "form" | "softmask";
  opacity?: number;
  blendMode?: string;
  softMask?: boolean;
  softMaskSubtype?: "Alpha" | "Luminosity";
  /** Máscara de luminancia (Freehand layerMask) aproximada desde raster PDF. */
  layerMask?: PdfDocumentLayerMask;
  children: Array<PdfDocumentPathObject | PdfDocumentClipObject | PdfDocumentImageObject>;
};

export type PdfDocumentObject =
  | PdfDocumentPathObject
  | PdfDocumentImageObject
  | PdfDocumentTextObject
  | PdfDocumentClipObject
  | PdfDocumentGroupObject;

export type PdfDocumentPageLayout = {
  pageNumber: number;
  widthPx: number;
  heightPx: number;
  widthPt: number;
  heightPt: number;
  /** Preview opcional (no se usa como fondo bloqueante si hay objects). */
  previewUrl?: string;
  objects: PdfDocumentObject[];
};

export type PdfScanPageQa = {
  page: number;
  ssim: number;
  mae: number;
  passed: boolean;
  fallbacks: number;
};

export type PdfScanFidelity = {
  mode: PdfScanMode;
  textFieldCount: number;
  pathCount: number;
  imageLayerCount: number;
  groupCount?: number;
  softMaskHits?: number;
  /** Media SSIM páginas (0–1). Presente en modo document tras F5 QA. */
  qaScore?: number;
  fallbackRegionCount?: number;
  pageQa?: PdfScanPageQa[];
  fontsMissing: string[];
  notes: string[];
};

export type PdfScanLayoutOutput = {
  kind: "pdf_scan_layout";
  jobId: string;
  mode: "texts";
  dpi: number;
  pageCount: number;
  pages: PdfScanPageLayout[];
  fidelity?: PdfScanFidelity;
};

export type PdfDocumentLayoutOutput = {
  kind: "pdf_document_layout";
  jobId: string;
  mode: "document";
  dpi: number;
  pageCount: number;
  pages: PdfDocumentPageLayout[];
  fidelity: PdfScanFidelity;
};

export type PdfScanAnyLayoutOutput = PdfScanLayoutOutput | PdfDocumentLayoutOutput;

export type PdfScanOcrMeta = {
  applied: boolean;
  provider: "gemini-vision";
  pagesDone: number[];
  blockCount: number;
  stoppedEarly?: boolean;
};

export type PdfScanSummary = {
  pageCount: number;
  dpi: number;
  widthPx: number;
  heightPx: number;
  widthPt: number;
  heightPt: number;
  textSpanCount: number;
  imageCount: number;
  pathCount?: number;
  scannedAt: string;
  mode?: PdfScanMode;
  ocr?: PdfScanOcrMeta;
};

/** Node data — mediaListOutput tipado en el cliente con MediaListOutput. */
export type PdfScanNodeData = {
  label?: string;
  status: PdfScanStatus;
  mode?: PdfScanMode;
  error?: string;
  jobId?: string;
  source?: PdfScanSourceMeta;
  scan?: PdfScanSummary;
  images?: PdfScanImageAsset[];
  textPreview?: Array<{ id: string; page: number; text: string }>;
  fidelity?: PdfScanFidelity;
  ocr?: PdfScanOcrMeta;
  output?: PdfScanAnyLayoutOutput;
  value?: PdfScanAnyLayoutOutput;
  type?: "image_layout";
  mediaListOutput?: unknown;
};

export function isPdfScanLayoutOutput(raw: unknown): raw is PdfScanLayoutOutput {
  return Boolean(
    raw &&
      typeof raw === "object" &&
      (raw as { kind?: unknown }).kind === "pdf_scan_layout" &&
      typeof (raw as { jobId?: unknown }).jobId === "string" &&
      Array.isArray((raw as { pages?: unknown }).pages),
  );
}

export function isPdfDocumentLayoutOutput(raw: unknown): raw is PdfDocumentLayoutOutput {
  return Boolean(
    raw &&
      typeof raw === "object" &&
      (raw as { kind?: unknown }).kind === "pdf_document_layout" &&
      typeof (raw as { jobId?: unknown }).jobId === "string" &&
      Array.isArray((raw as { pages?: unknown }).pages),
  );
}

export function isPdfScanAnyLayoutOutput(raw: unknown): raw is PdfScanAnyLayoutOutput {
  return isPdfScanLayoutOutput(raw) || isPdfDocumentLayoutOutput(raw);
}
