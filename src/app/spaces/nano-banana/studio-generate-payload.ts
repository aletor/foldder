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

/**
 * Integración óptica de ediciones locales. Sin esto el modelo rellena la zona con su render
 * "por defecto" (nítido, luz genérica) y el resultado parece una pegatina sobre la foto.
 */
export const OPTICAL_INTEGRATION_BLOCK =
  "\n\n[INTEGRACIÓN ÓPTICA — obligatorio] Cada zona editada debe verse como si la hubiera captado la MISMA cámara, con el MISMO objetivo, la misma distancia focal, la misma apertura y en el mismo instante que la BASE. En concreto:" +
  "\n- Profundidad de campo: observa en la BASE si el área que rodea la zona está nítida o fuera de foco. Si está desenfocada, el contenido nuevo debe tener EXACTAMENTE el mismo grado de desenfoque y el mismo bokeh (bordes suaves, detalles fundidos, sin texturas finas legibles). Nunca devuelvas un elemento nítido dentro de un plano desenfocado ni al revés." +
  "\n- Iluminación: misma dirección de la luz principal, misma temperatura de color, misma dureza de las sombras, mismos reflejos y brillos especulares que los objetos vecinos de la BASE. Las sombras que el nuevo elemento proyecte o reciba deben coincidir con las de su entorno inmediato." +
  "\n- Textura fotográfica: mismo grano, mismo nivel de ruido, mismo contraste, mismo balance de blancos y misma nitidez de píxel que la BASE en esa región; prohibido el acabado limpio 'de catálogo' o de render 3D." +
  "\n- Perspectiva y escala: mismo punto de vista y proporciones coherentes con los objetos contiguos." +
  "\nSolo si una instrucción pide explícitamente cambiar la luz o el enfoque de esa zona, prevalece la instrucción; en cualquier otro caso, iguala la óptica de la BASE.";

export const CONTEXT_CROP_BLOCK =
  "\n\n[RECORTE DE CONTEXTO — obligatorio] La BASE es un recorte ampliado de una fotografía mayor. Devuelve EXACTAMENTE el mismo encuadre del recorte, sin reencuadrar, ampliar, desplazar ni añadir bordes: la salida se pegará de vuelta sobre la fotografía completa píxel a píxel. Mantén intacto todo lo que no se pide cambiar, incluido el desenfoque y la luz del recorte.";

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

export function appendStudioOutputGuards(
  prompt: string,
  input: StudioGenerateSlotsInput,
  options?: { contextCrop?: boolean },
): string {
  let next = prompt.trim();
  if (input.zoneMapImage) next += ZONE_ARTIFACT_BLOCK;
  if (input.baseImage && input.zoneMapImage) next += OPTICAL_INTEGRATION_BLOCK;
  if (input.baseImage && options?.contextCrop) next += CONTEXT_CROP_BLOCK;
  if (input.schemaImage) next += SCHEMA_ARTIFACT_BLOCK;
  return next;
}
