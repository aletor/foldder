import type { BrandKitDocument, EssenceValue, VisualWorldValue } from "./brand-kit-types";
import { slotValue } from "./brand-kit-gallery-tone-utils";

/** Reglas de composición para entornos: el lugar manda; multitudes, objetos y textos ambientales son válidos. */
export const PLACES_LOCATION_FIRST_CORE = [
  "Location-first establishing shot: the place and spatial atmosphere are the subject.",
  "Crowds, ambient objects, signage, graffiti, and environmental clutter are welcome when they belong to the location.",
  "Do not make the brand main product, packaging, or a single portrait the focal subject.",
  "No isolated product still life, no hero SKU, no UI mockups.",
].join(" ");

export const PLACES_BRIEF_LLM_RULE =
  "Entornos: 4 localizaciones distintas donde EL LUGAR es el sujeto (concierto con multitud de fondo, garaje con herramientas, calle con graffiti, interior arquitectónico…). " +
  "Permiten personas, objetos y textos que pertenezcan al entorno. Prohibido producto principal de la marca, packaging o retrato como foco — eso va en objects o people_mood.";

export const PLACES_BRIEF_PROMPT_HINT_RULE =
  "places.variant.promptHint: location-first establishing shot faithful to imageMedium; the place is the subject. " +
  "Crowds, ambient objects, signage, and graffiti allowed. Never hero product, packaging, or portrait focal subject.";

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
