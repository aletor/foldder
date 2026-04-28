/**
 * Razones canónicas de frescura Brain (`brainMeta.staleReasons`).
 * Usar siempre estos literales para poder filtrar por categoría.
 */
export const BRAIN_STALE_REASON = {
  NEW_DOCUMENT_UPLOADED: "new_document_uploaded",
  NEW_IMAGE_UPLOADED: "new_image_uploaded",
  URL_ADDED: "url_added",
  BRAND_VOICE_CHANGED: "brand_voice_changed",
  BRAND_PALETTE_CHANGED: "brand_palette_changed",
  LOGO_CHANGED: "logo_changed",
  VISUAL_REFERENCE_CHANGED: "visual_reference_changed",
  REMOTE_ANALYSIS_FAILED_FALLBACK_USED: "remote_analysis_failed_fallback_used",
  STRATEGY_MANUALLY_CHANGED: "strategy_manually_changed",
  BRAIN_RESET: "brain_reset",
  CONTENT_DNA_LAYER_CHANGED: "content_dna_layer_changed",
  SAFE_RULES_LAYER_CHANGED: "safe_rules_layer_changed",
} as const;

export type BrainStaleReasonId = (typeof BRAIN_STALE_REASON)[keyof typeof BRAIN_STALE_REASON];

/** Stale que invalidan o avisan sobre conocimiento / estrategia textual. */
export const KNOWLEDGE_STALE_REASONS: ReadonlySet<string> = new Set([
  BRAIN_STALE_REASON.NEW_DOCUMENT_UPLOADED,
  BRAIN_STALE_REASON.NEW_IMAGE_UPLOADED,
  BRAIN_STALE_REASON.URL_ADDED,
  BRAIN_STALE_REASON.BRAND_VOICE_CHANGED,
  BRAIN_STALE_REASON.STRATEGY_MANUALLY_CHANGED,
  BRAIN_STALE_REASON.REMOTE_ANALYSIS_FAILED_FALLBACK_USED,
  BRAIN_STALE_REASON.BRAIN_RESET,
  BRAIN_STALE_REASON.CONTENT_DNA_LAYER_CHANGED,
  BRAIN_STALE_REASON.SAFE_RULES_LAYER_CHANGED,
]);

/** Stale ligadas a marca visual y referencias. */
export const VISUAL_STALE_REASONS: ReadonlySet<string> = new Set([
  BRAIN_STALE_REASON.LOGO_CHANGED,
  BRAIN_STALE_REASON.BRAND_PALETTE_CHANGED,
  BRAIN_STALE_REASON.VISUAL_REFERENCE_CHANGED,
  BRAIN_STALE_REASON.NEW_IMAGE_UPLOADED,
  BRAIN_STALE_REASON.BRAIN_RESET,
]);

export function filterOutStaleReasons(reasons: string[], remove: (r: string) => boolean): string[] {
  return reasons.filter((r) => !remove(r));
}
