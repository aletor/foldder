export type InspirationFacet = "similar" | "textures" | "colors" | "style" | "people" | "backgrounds";
export type InspirationInputKind = "prompt" | "image";
export type InspirationProvider = "pexels" | "unsplash" | "arena";
export type InspirationResultSource = "Pexels" | "Unsplash" | "Are.na";

export type InspirationResult = {
  id: string;
  source: InspirationResultSource;
  imageUrl: string;
  thumbUrl: string;
  title?: string;
  author?: string;
  sourceUrl?: string;
  width?: number;
  height?: number;
  color?: string;
};

export const INSPIRATION_FACET_QUERY_SUFFIX: Record<InspirationFacet, string> = {
  similar: "visual reference, similar mood, clear composition",
  textures: "textures, materials, surfaces, pattern details, fabric, stone, wood, metal, paper grain",
  colors: "color palette, tones, clean palette, visual color mood",
  style: "visual style, art direction, editorial moodboard, aesthetic, look and feel",
  people: "people, portrait, human figures, characters, lifestyle",
  backgrounds: "backgrounds, environments, interiors, locations, empty spaces, scenery",
};

export function normalizeInspirationFacet(value: unknown): InspirationFacet {
  return typeof value === "string" && value in INSPIRATION_FACET_QUERY_SUFFIX
    ? (value as InspirationFacet)
    : "similar";
}

export function normalizeInspirationInputKind(value: unknown): InspirationInputKind {
  return value === "image" ? "image" : "prompt";
}

export function normalizeInspirationProvider(value: unknown): InspirationProvider {
  if (value === "unsplash") return "unsplash";
  if (value === "arena") return "arena";
  return "pexels";
}

export function inspirationProviderServiceId(provider: InspirationProvider): "pexels-search" | "unsplash-search" | "arena-search" {
  if (provider === "unsplash") return "unsplash-search";
  if (provider === "arena") return "arena-search";
  return "pexels-search";
}
