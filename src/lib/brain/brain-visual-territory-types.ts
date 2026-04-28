/** Tipos compartidos (evita import circular entre territorio y extractor de señales). */

export type BrainVisualTerritory =
  | "sport_performance"
  | "fashion_editorial"
  | "creative_workspace"
  | "culture_lifestyle"
  | "domestic_editorial"
  | "architecture_interiors"
  | "luxury_product"
  | "tech_saas"
  | "music_culture"
  | "outdoor_lifestyle"
  | "food_hospitality"
  | "retail_product"
  | "craft_materials"
  | "generic_visual";

export type BrainVisualTerritoryInput = {
  subjects: readonly string[];
  mood: readonly string[];
  composition: readonly string[];
  visualStyleTags: readonly string[];
  visualMessage: readonly string[];
  peopleAndWardrobe: readonly string[];
  textures: readonly string[];
  objectsAndProps: readonly string[];
  confirmedPatterns: readonly string[];
  patternSummary?: string;
  userPromptHint?: string;
  corporateBlob?: string;
  brandSignals?: readonly string[];
  possibleUse?: readonly string[];
  lightingHints?: readonly string[];
  colorPaletteDominant?: readonly string[];
  graphicStyleNotes?: readonly string[];
  compositionNotes?: readonly string[];
  peopleClothingAggregateNotes?: readonly string[];
  narrativeSummary?: string;
  frequentSubjects?: readonly string[];
  recurringStyles?: readonly string[];
  dominantMoodsAgg?: readonly string[];
  peopleDetailLines?: readonly string[];
  clothingDetailLines?: readonly string[];
  graphicDetailLines?: readonly string[];
};
