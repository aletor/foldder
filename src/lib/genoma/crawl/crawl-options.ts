export type GenomaCrawlOptions = {
  userEmail?: string;
  /** Si false, solo extracción determinista (sin Gemini). */
  llmEnabled?: boolean;
  /** Motivo mostrado en UI cuando la IA se omite. */
  llmSkipReason?: string;
  onLlmCostUsd?: (costUsd: number) => void;
};
