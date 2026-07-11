/**
 * Identidad de los rasgos del brandKit. Namespaced, estable y serializable.
 *
 * Un `TraitId` NO lleva estado: solo nombra el rasgo. El estado (candidatos +
 * corona) vive en `Trait` (ver `./trait`). La cardinalidad decide la semántica
 * de coronación: `single` = una corona que archiva el resto; `multi` = colección
 * donde cada tarjeta se confirma por separado.
 */

export const COLOR_ROLES = ["primary", "secondary", "accent", "background", "text"] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];

export const IMAGE_CATEGORIES = [
  "people",
  "objects",
  "textures",
  "environments",
  "protagonists",
  "general",
] as const;
export type ImageCategory = (typeof IMAGE_CATEGORIES)[number];

export type TraitId =
  | "typography.primary"
  | "typography.secondary"
  | "logo.primary"
  | "logo.secondary"
  | `color.${ColorRole}`
  | `image.${ImageCategory}`
  | "message.tagline"
  | "message.tone"
  | `message.audience.${string}`
  | "claim.absolute"
  | "claim.forbidden";

export type TraitCardinality = "single" | "multi";

/**
 * Cardinalidad por rasgo.
 * - `single`: logo principal, tipografías, cada rol de color, tagline → 0..1 corona.
 * - `multi`: logos secundarios, imágenes por categoría, chips de tono, audiencias,
 *   claims (absolutos y prohibidos) → 0..N coronas, cada tarjeta independiente.
 */
export function traitCardinality(id: TraitId): TraitCardinality {
  if (id === "logo.secondary") return "multi";
  if (id === "message.tone") return "multi";
  if (id.startsWith("image.")) return "multi";
  if (id.startsWith("claim.")) return "multi";
  if (id.startsWith("message.audience.")) return "multi";
  return "single";
}

export function colorTraitId(role: ColorRole): TraitId {
  return `color.${role}`;
}

export function imageTraitId(category: ImageCategory): TraitId {
  return `image.${category}`;
}

export function messageAudienceTraitId(audience: string): TraitId {
  return `message.audience.${audience}`;
}

/** Rasgos de corona única con presencia garantizada en la cara (orden del libro §5). */
export const SINGLE_CORE_TRAIT_IDS: readonly TraitId[] = [
  "logo.primary",
  "color.primary",
  "color.secondary",
  "color.accent",
  "color.background",
  "color.text",
  "typography.primary",
  "typography.secondary",
  "message.tagline",
] as const;
