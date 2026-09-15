import { cardHasZonePaint, type StudioCard, type StudioGlobal } from "./studio-types";

export type StudioGenerateSlotKind = "base" | "zoneMap" | "referenceGrid" | "schema";

export type StudioGenerateSlotsInput = {
  baseImage: string | null;
  referenceGridImage: string | null;
  schemaImage: string | null;
  zoneMapImage: string | null;
};

const ZONE_ARTIFACT_BLOCK =
  "\n\n[SALIDA — obligatorio] Los colores, trazos y formas dibujadas en la imagen de referencia de zonas (mapa / REF de zonas) son solo guías de posición. La imagen generada NO debe mostrar esas líneas, círculos de contorno, marcas de anotación ni superposición de la guía. Integra los cambios en la escena de forma natural y fotorrealista, sin artefactos de dibujo de referencia.";

const SCHEMA_ARTIFACT_BLOCK =
  "\n\n[ESQUEMA — obligatorio] Si hay una imagen de esquema de líneas, es SOLO una guía de colocación, pose y tamaño. NO reproduzcas las líneas, palos ni el dibujo esquemático en la fotografía final.";

export function shouldBuildZoneMap(cards: StudioCard[]): boolean {
  return cards.some(cardHasZonePaint);
}

export function shouldRunAnalyzeAreas(cards: StudioCard[]): boolean {
  return cards.some((card) => cardHasZonePaint(card) && cardIsDescribed(card));
}

export function cardIsDescribed(card: StudioCard): boolean {
  return Boolean(card.description.trim()) || card.references.length > 0;
}

export function canStudioGenerate(cards: StudioCard[], global: StudioGlobal): boolean {
  return cards.some(cardIsDescribed) || Boolean(global.text.trim() || global.schemaData);
}

/**
 * Cuándo mostrar / permitir Generate en Studio.
 * - Con ediciones (cards / caption / esquema): siempre.
 * - Sin ediciones: el prompt de escena basta **antes** de la primera imagen del nodo
 *   (aunque coincida con el prompt conectado). Tras tener output, hace falta cambiar
 *   el prompt o añadir una edición — si no, el botón desaparece y parece que "no hace nada".
 */
export function canStudioPrimaryGenerate(
  cards: StudioCard[],
  global: Pick<StudioGlobal, "text" | "schemaData" | "promptDraft">,
  options: { nodePrompt: string; hasGeneratedOutput: boolean },
): boolean {
  if (canStudioGenerate(cards, global)) return true;
  const scene = global.promptDraft.trim();
  if (!scene) return false;
  if (!options.hasGeneratedOutput) return true;
  return scene !== options.nodePrompt.trim();
}

/**
 * Fixed slot order. Nulls are omitted; remaining items keep relative order.
 * Zone map is never the schema; schema is never mixed into the color map.
 */
export function buildStudioGenerateImageSlots(input: StudioGenerateSlotsInput): string[] {
  const images: string[] = [];
  if (input.baseImage) images.push(input.baseImage);
  if (input.zoneMapImage) images.push(input.zoneMapImage);
  if (input.referenceGridImage) images.push(input.referenceGridImage);
  if (input.schemaImage) images.push(input.schemaImage);
  return images;
}

export function describeStudioGenerateImageOrder(input: StudioGenerateSlotsInput): {
  kinds: StudioGenerateSlotKind[];
  promptBlock: string;
} {
  const kinds: StudioGenerateSlotKind[] = [];
  const lines = ["REFERENCE IMAGE ORDER:"];
  let n = 1;
  if (input.baseImage) {
    kinds.push("base");
    lines.push(`IMAGE ${n++}: BASE — original scene. Keep everything not asked to change.`);
  }
  if (input.zoneMapImage) {
    kinds.push("zoneMap");
    lines.push(
      `IMAGE ${n++}: ZONE MAP — colored marks show the exact area to edit. Do not copy the marks into the output.`,
    );
  }
  if (input.referenceGridImage) {
    kinds.push("referenceGrid");
    lines.push(
      `IMAGE ${n++}: REFERENCE GRID — labeled cells (#1A, #1B, …). Photos that share a card number belong to the same instruction.`,
    );
  }
  if (input.schemaImage) {
    kinds.push("schema");
    lines.push(
      `IMAGE ${n++}: COMPOSITION SCHEMA — line drawing for placement, pose and scale only. Do not render the lines.`,
    );
  }
  return { kinds, promptBlock: lines.join("\n") };
}

export function appendStudioOutputGuards(prompt: string, input: StudioGenerateSlotsInput): string {
  let next = prompt.trim();
  if (input.zoneMapImage) next += ZONE_ARTIFACT_BLOCK;
  if (input.schemaImage) next += SCHEMA_ARTIFACT_BLOCK;
  return next;
}
