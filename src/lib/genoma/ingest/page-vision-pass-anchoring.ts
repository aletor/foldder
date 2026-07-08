/**
 * Literales del prompt que no deben aparecer en salidas reales (anti-anclaje few-shot).
 */

export const PAGE_VISION_PROMPT_PLACEHOLDER_LITERALS = [
  "MARCA-EJEMPLO",
  "dominio-ejemplo.invalid",
  "TITULAR DE MUESTRA",
  "#000001",
  "#000002",
  "#000003",
  "texto de muestra para estilo tipográfico",
  "descripción de sujeto de muestra",
  "prenda de muestra",
  "entorno de muestra",
  "ánimo de muestra",
  "estilo artístico de muestra",
  "encuadre de muestra",
  "luz de muestra",
  "textura de muestra",
  "voz visual de muestra",
] as const;

/** Salida mínima del modelo para página sintética vacía (sin version/page). */
export const SYNTHETIC_EMPTY_PAGE_VISION_MODEL_OUTPUT = {
  logoInstances: [],
  brandNameEvidence: [],
  typographyRoles: [],
  brandSurfaces: [],
  images: [],
  pageKind: "unknown",
} as const;

export function collectPromptAnchoringViolations(outputText: string): string[] {
  const haystack = outputText.toLowerCase();
  return PAGE_VISION_PROMPT_PLACEHOLDER_LITERALS.filter((literal) =>
    haystack.includes(literal.toLowerCase()),
  );
}

export function assertNoPromptAnchoringInOutput(outputText: string): void {
  const hits = collectPromptAnchoringViolations(outputText);
  if (hits.length) {
    throw new Error(`prompt_anchoring_detected:${hits.join(",")}`);
  }
}
