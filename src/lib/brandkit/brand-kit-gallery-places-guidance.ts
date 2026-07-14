import type { BrandKitDocument, VisualWorldValue } from "./brand-kit-types";
import { slotValue } from "./brand-kit-gallery-tone-utils";

/** Sin títulos, copy ni tipografía superpuesta — solo fotografía/ilustración de lugar. */
export const PLACES_NO_TEXT_OVERLAY_RULE = [
  "Pure environmental image only — no titles, headlines, captions, subtitles, or marketing copy overlaid on the image.",
  "No poster layout, no banner text, no lower-thirds, no typography bands, no decorative text blocks, no UI chrome.",
  "No readable paragraphs, slogans, or brand manifesto text rendered in-frame.",
  "Small physical signage in the environment only if the brief explicitly names it; never add headline-style overlays.",
].join(" ");

/** Reglas de composición para entornos: el lugar manda; ocupación por defecto vacía o ligera. */
export const PLACES_LOCATION_FIRST_CORE = [
  "Location-first establishing shot: the place and spatial atmosphere are the subject.",
  "Default to uninhabited or lightly occupied spaces — architecture, landscape, interior volume, light, and materials.",
  "Include people only if the scene brief explicitly describes a populated venue; keep them distant, soft, and non-focal.",
  "Include ambient objects or graffiti only when native to the briefed location — not marketing graphics.",
  "Do not make the brand main product, packaging, or a single portrait the focal subject.",
  "No isolated product still life, no hero SKU, no UI mockups.",
  PLACES_NO_TEXT_OVERLAY_RULE,
].join(" ");

export const PLACES_LOCATION_FIRST_FINISH =
  "Prefer uninhabited or sparsely occupied locations unless the scene brief explicitly calls for a crowded venue. Frame must be free of overlaid titles or typography.";

export const PLACES_BRIEF_LLM_RULE =
  "Entornos: 4 localizaciones distintas donde EL LUGAR es el sujeto. Mayoría sin personas (arquitectura, paisaje, interior, taller con objetos). " +
  "Como mucho 1 variante con multitud de fondo solo si el ADN o las imágenes lo indican (eventos, ocio, calle comercial). " +
  "Objetos o graffiti solo si pertenecen al lugar del brief. Prohibido producto principal, packaging o retrato como foco. " +
  "Prohibido títulos, titulares, copy de marketing o tipografía superpuesta en la imagen.";

export const PLACES_BRIEF_PROMPT_HINT_RULE =
  "places.variant.promptHint: location-first establishing shot faithful to imageMedium; the place is the subject. " +
  "Default empty or sparse occupancy. People only when the variant explicitly describes a populated venue (distant, non-focal). " +
  "Never hero product, packaging, or portrait focal subject. Never titles, headlines, captions, or overlaid marketing text.";

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

/** Coherencia de marca para entornos: atmósfera y territorio visual — sin copy que Gemini renderice como titular. */
export function brandPlacesWorldHint(doc?: BrandKitDocument): string {
  if (!doc) return "";
  const visual = slotValue<VisualWorldValue>(doc, "visualWorld");
  const parts: string[] = [];
  if (visual?.summary?.trim()) parts.push(`Visual territory: ${visual.summary.trim()}.`);
  if (visual?.moodTags?.length) parts.push(`Mood: ${visual.moodTags.slice(0, 3).join(", ")}.`);
  if (visual?.limits?.length) parts.push(`Avoid: ${visual.limits.slice(0, 3).join("; ")}.`);
  if (!parts.length) return "";
  return `Reflect the brand through place, light, and atmosphere only — never as overlaid titles or marketing text. ${parts.join(" ")} Do not depict the main product or packaging as focal subject.`;
}
