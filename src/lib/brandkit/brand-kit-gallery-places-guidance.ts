import type { BrandKitDocument, EssenceValue, VisualWorldValue } from "./brand-kit-types";
import { slotValue } from "./brand-kit-gallery-tone-utils";

/** Reglas de composición para entornos: el lugar manda; ocupación por defecto vacía o ligera. */
export const PLACES_LOCATION_FIRST_CORE = [
  "Location-first establishing shot: the place and spatial atmosphere are the subject.",
  "Default to uninhabited or lightly occupied spaces — architecture, landscape, interior volume, light, and materials.",
  "Include people only if the scene brief explicitly describes a populated venue; keep them distant, soft, and non-focal.",
  "Include ambient objects, signage, or graffiti only when native to the briefed location.",
  "Do not make the brand main product, packaging, or a single portrait the focal subject.",
  "No isolated product still life, no hero SKU, no UI mockups.",
].join(" ");

export const PLACES_LOCATION_FIRST_FINISH =
  "Prefer uninhabited or sparsely occupied locations unless the scene brief explicitly calls for a crowded venue.";

export const PLACES_BRIEF_LLM_RULE =
  "Entornos: 4 localizaciones distintas donde EL LUGAR es el sujeto. Mayoría sin personas (arquitectura, paisaje, interior, taller con objetos). " +
  "Como mucho 1 variante con multitud de fondo solo si el ADN o las imágenes lo indican (eventos, ocio, calle comercial). " +
  "Objetos, señales o graffiti solo si pertenecen al lugar del brief. Prohibido producto principal, packaging o retrato como foco.";

export const PLACES_BRIEF_PROMPT_HINT_RULE =
  "places.variant.promptHint: location-first establishing shot faithful to imageMedium; the place is the subject. " +
  "Default empty or sparse occupancy. People only when the variant explicitly describes a populated venue (distant, non-focal). " +
  "Never hero product, packaging, or portrait focal subject.";

const POPULATED_VENUE_CUE =
  /concierto|festival|evento|multitud|crowd|fiesta|arena|estadio|venue|nightlife|packed|audience|concert|stadium|fair|feria/i;

export function placesAdnSuggestsPopulatedVenue(input: {
  moodTags?: string[];
  visualTraits?: string[];
  purpose?: string;
}): boolean {
  const corpus = [
    ...(input.moodTags ?? []),
    ...(input.visualTraits ?? []),
    input.purpose ?? "",
  ].join(" ");
  return POPULATED_VENUE_CUE.test(corpus);
}

/** Coherencia de marca para entornos: mundo y atmósfera, no catálogo ni producto protagonista. */
export function brandPlacesWorldHint(doc?: BrandKitDocument): string {
  if (!doc) return "";
  const essence = slotValue<EssenceValue>(doc, "essence");
  const visual = slotValue<VisualWorldValue>(doc, "visualWorld");
  const parts: string[] = [];
  if (essence?.purpose?.trim()) parts.push(`Brand world: ${essence.purpose.trim()}.`);
  if (visual?.summary?.trim()) parts.push(`Visual territory: ${visual.summary.trim()}.`);
  if (visual?.moodTags?.length) parts.push(`Mood: ${visual.moodTags.slice(0, 3).join(", ")}.`);
  if (visual?.limits?.length) parts.push(`Avoid: ${visual.limits.slice(0, 3).join("; ")}.`);
  if (!parts.length) return "";
  return `Reflect the brand through place and atmosphere only. ${parts.join(" ")} Do not depict the main product or packaging as focal subject.`;
}
