export type BrandKitDocumentProbeLogo = {
  page: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string | null;
  /** El modelo marca el logo principal de marca (solo uno). */
  isPrimary: boolean;
  /** 0–1 — legibilidad / claridad del wordmark. */
  legibility: number;
  /** 0–1 — luminancia del fondo alrededor del bbox (medido en servidor). */
  backgroundLightness: number;
};

export type BrandKitDocumentProbeColor = {
  hex: string;
  label: string | null;
};

export type BrandKitDocumentProbeTypographyRole = "display" | "heading" | "body";

export type BrandKitDocumentProbeTypography = {
  family: string;
  role: BrandKitDocumentProbeTypographyRole;
  evidence: string | null;
};

/** Fotografías, ilustraciones o gráficos que no son logos ni iconos de marca. */
export type BrandKitDocumentProbeOtherImage = {
  page: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  description: string;
  /** Recorte JPEG generado en servidor a partir del bbox. */
  thumbnailBase64: string | null;
};

/** Misma imagen JPEG enviada al LLM (coords normalizados respecto a esta vista). */
export type BrandKitDocumentProbePagePreview = {
  pageNumber: number | null;
  jpegBase64: string;
};

export type BrandKitDocumentProbeResult = {
  documentType: string;
  fileName: string;
  logos: BrandKitDocumentProbeLogo[];
  /** Logo principal elegido para el recuadro de vista previa. */
  primaryLogo: BrandKitDocumentProbeLogo | null;
  primaryColors: BrandKitDocumentProbeColor[];
  typography: BrandKitDocumentProbeTypography[];
  otherImages: BrandKitDocumentProbeOtherImage[];
  textSummary: [string, string, string];
  pagePreviews: BrandKitDocumentProbePagePreview[];
  latencyMs: number;
  model: string;
  /** Llamadas al modelo en esta ejecución (1 corto, 2 si PDF largo + barrido). */
  llmCallCount: number;
  /** Total de páginas del PDF cuando aplica. */
  pdfTotalPages: number | null;
};
