import type { AggregatedVisualPatterns } from "@/app/spaces/project-assets-metadata";
import type { SafeCreativeRules } from "@/lib/brain/brain-creative-memory-types";
import { buildNanoBananaBrainVisualDnaCollagePayload } from "@/lib/brain/brain-visual-dna-collage-nano";
import type { BrainVisualCollageInventoryRow } from "@/lib/brain/brain-visual-dna-collage";

export const VISUAL_DNA_SLOT_MOSAIC_MODE = "visual_dna_slot" as const;

/**
 * Texto de reglas seguras y abstracción para inyectar en el prompt del tablero por slot.
 */
export function buildSafeCreativeRulesDigestForMosaic(rules?: SafeCreativeRules | null): string[] {
  if (!rules) return [];
  const lines = [
    ...rules.visualAbstractionRules,
    ...rules.imageGenerationAvoid,
    ...rules.doNotGenerate,
    ...rules.shouldAvoid,
  ]
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(lines)).slice(0, 24);
}

function excerptContext(corporateContext: string, max = 1800): string {
  const t = corporateContext.trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Construye prompt + imágenes para el mismo pipeline Nano Banana / Gemini que el tablero global,
 * pero anclado a UNA fila de inventario (imagen fuente) y enriquecido con contexto Brain + reglas seguras.
 */
export function buildVisualDnaSlotMosaicPayload(params: {
  slotId: string;
  sourceDocumentId?: string;
  row: BrainVisualCollageInventoryRow;
  /** Agregado global opcional (refuerza paleta/mood sin mezclar otros slots). */
  aggregated: AggregatedVisualPatterns | null;
  safeCreativeRules?: SafeCreativeRules | null;
  corporateContext?: string;
}): { prompt: string; images: string[]; safeRulesDigest: string[]; brainContextSnippet: string } {
  const safeRulesDigest = buildSafeCreativeRulesDigestForMosaic(params.safeCreativeRules ?? undefined);
  const brainSnippet = excerptContext(params.corporateContext ?? "");

  const base = buildNanoBananaBrainVisualDnaCollagePayload({
    rows: [params.row],
    aggregated: params.aggregated,
  });

  const directRef = params.row.ref.imageUrlForVision?.trim();
  let images = [...base.images];
  if (directRef && !images.includes(directRef)) {
    images = [directRef, ...images].filter(Boolean).slice(0, 4);
  }
  if (!images.length && directRef) {
    images = [directRef];
  }

  const safetyBlock = [
    "REGLAS OBLIGATORIAS (ADN visual por imagen — modo slot):",
    "- Genera un tablero ADN visual abstracto y reutilizable; no copies la imagen original ni la reproduzcas píxel a píxel.",
    "- No reproduzcas logos, slogans, campañas publicitarias concretas ni personas reconocibles.",
    "- No uses nombres de marcas externas como estilo; extrae solo abstracciones visuales (luz, color, atmósfera, composición, textura).",
    "- Crea variaciones visuales coherentes entre celdas: paleta, héroe/conclusión, personas, objetos, entornos y texturas.",
    safeRulesDigest.length ? `Reglas seguras del proyecto:\n- ${safeRulesDigest.join("\n- ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const metaBlock = [
    `meta: slotId=${params.slotId}`,
    params.sourceDocumentId ? `meta: sourceDocumentId=${params.sourceDocumentId}` : "",
    `meta: mode=${VISUAL_DNA_SLOT_MOSAIC_MODE}`,
  ]
    .filter(Boolean)
    .join("\n");

  const contextBlock =
    brainSnippet.length > 0
      ? [
          "CONTEXTO TEXTUAL DEL BRAIN (mezcla coherente; no transcribas texto literal en la imagen):",
          brainSnippet,
        ].join("\n")
      : "";

  const prompt = [
    metaBlock,
    "",
    safetyBlock,
    "",
    contextBlock,
    contextBlock ? "" : null,
    "TAREA (recordatorio):",
    "A partir de la imagen fuente (referencias adjuntas) y del contexto del Brain, genera un tablero ADN visual de marca.",
    "El tablero debe contener paleta, héroe/conclusión general, personas/interacción, entornos, texturas y objetos.",
    "",
    base.prompt,
  ]
    .filter((x) => x !== null && x !== "")
    .join("\n");

  return {
    prompt,
    images,
    safeRulesDigest,
    brainContextSnippet: brainSnippet,
  };
}

/**
 * Cuerpo JSON para la API de generación (misma forma que el tablero global Brain).
 */
export function buildVisualDnaSlotGeminiRequestBody(payload: {
  prompt: string;
  images: string[];
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: payload.prompt,
    aspect_ratio: "1:1",
    resolution: "1k",
    model: "flash31",
    thinking: false,
    geminiClientContext: "brain_visual_dna_collage",
  };
  if (payload.images.length) body.images = payload.images;
  return body;
}
