export type GenomaDocumentProbeLogo = {
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

export type GenomaDocumentProbeColor = {
  hex: string;
  label: string | null;
};

/** Misma imagen JPEG enviada al LLM (coords normalizados respecto a esta vista). */
export type GenomaDocumentProbePagePreview = {
  pageNumber: number | null;
  jpegBase64: string;
};

export type GenomaDocumentProbeResult = {
  documentType: string;
  fileName: string;
  logos: GenomaDocumentProbeLogo[];
  /** Logo principal elegido para el recuadro de vista previa. */
  primaryLogo: GenomaDocumentProbeLogo | null;
  primaryColors: GenomaDocumentProbeColor[];
  textSummary: [string, string, string];
  pagePreviews: GenomaDocumentProbePagePreview[];
  latencyMs: number;
  model: string;
};
