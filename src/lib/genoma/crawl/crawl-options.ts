export type GenomaCrawlOptions = {
  userEmail?: string;
  /** Si false, solo extracción determinista (sin Gemini). */
  llmEnabled?: boolean;
  /** Visión de logo en decks PDF — independiente del wallet de síntesis de texto. */
  pdfLogoVisionEnabled?: boolean;
  /** Motivo mostrado en UI cuando la IA se omite. */
  llmSkipReason?: string;
  pdfLogoVisionSkipReason?: string;
  onLlmCostUsd?: (costUsd: number) => void;
};
