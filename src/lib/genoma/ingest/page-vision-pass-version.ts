/** Versión del job de pase de visión por página — comparar regresiones entre corridas. */
export const GENOMA_PAGE_VISION_PASS_VERSION = "2026-07-07-page-structured-5";

/** Contrato batch Nivel 1 (slim) — bump al cambiar schema/prompt de ingesta. */
export const GENOMA_PAGE_VISION_NIVEL1_VERSION = "2026-07-07-nivel1-slim-7";

/** Títulos obra/producto en índice — strings planos, sin bbox. */
export const PAGE_VISION_NIVEL1_CONTENT_TITLES_MAX = 20;

/** brandNameEvidence slim: solo emisor (dominio/wordmark/título de marca). */
export const PAGE_VISION_NIVEL1_EMITTER_BNE_MAX = 5;

/** Guardarraíl duro de salida batch — truncación visible en finishReason. */
export const PAGE_VISION_NIVEL1_MAX_OUTPUT_TOKENS = 8192;

/** DPI fijo — parte de la clave de caché junto a version y contentSha256. */
export const PAGE_VISION_PASS_DPI = 144;

/** Render previo al batch Nivel 1 — basta para triaje tras resize JPEG. */
export const PAGE_VISION_NIVEL1_RENDER_DPI = 96;

/** Lado largo máximo enviado al batch Nivel 1 (triaje, no extracción fina). */
export const PAGE_VISION_NIVEL1_MAX_LONG_EDGE = 640;

/** Calidad JPEG batch — triaje logo/identidad, no lectura de cuerpo. */
export const PAGE_VISION_NIVEL1_JPEG_QUALITY = 65;

/** Modelo por defecto Nivel 1 — localización/clasificación, no pase profundo. */
export const PAGE_VISION_NIVEL1_GEMINI_MODEL = "gemini-2.5-flash-lite";

/** Fallback si flash-lite no devuelve tool call (p. ej. catálogos densos). */
export const PAGE_VISION_NIVEL1_GEMINI_FALLBACK_MODEL = "gemini-2.5-flash";

export function pageVisionNivel1GeminiModel(): string {
  return (
    process.env.GENOMA_NIVEL1_GEMINI_MODEL?.trim() ||
    process.env.BRAIN_VISION_GEMINI_MODEL?.trim() ||
    PAGE_VISION_NIVEL1_GEMINI_MODEL
  );
}

export function pageVisionNivel1CacheKey(contentSha256: string, pageNumber: number): string {
  const sha = contentSha256.trim().slice(0, 64);
  return `genoma:nivel1:${GENOMA_PAGE_VISION_NIVEL1_VERSION}:edge${PAGE_VISION_NIVEL1_MAX_LONG_EDGE}:${sha}:p${pageNumber}`;
}

/** Temperatura fija para determinismo en la Fase A (config del servidor, no del prompt). */
export const PAGE_VISION_PASS_TEMPERATURE = 0;

/**
 * Cableado Gemini (requisito, no opcional):
 * - function calling forzado: toolConfig.mode = ANY con única tool `report_page_vision_analysis`
 *   (alternativa equivalente: responseMimeType application/json + responseSchema del tool).
 * - NO confiar solo en system instruction "devuelve JSON".
 * - seed fijo distinto de 0 — algunas APIs tratan seed=0 como unset.
 */
export const PAGE_VISION_PASS_GEMINI_FORCED_TOOL_MODE = "ANY" as const;
export const PAGE_VISION_PASS_GEMINI_SEED = 42;

export function pageVisionPassCacheKey(contentSha256: string, pageNumber: number): string {
  const sha = contentSha256.trim().slice(0, 64);
  return `genoma:page-vision:${GENOMA_PAGE_VISION_PASS_VERSION}:dpi${PAGE_VISION_PASS_DPI}:${sha}:p${pageNumber}`;
}
