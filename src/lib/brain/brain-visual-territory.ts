import type { BrainVisualTerritory, BrainVisualTerritoryInput } from "@/lib/brain/brain-visual-territory-types";
import {
  extractVisualSemanticSignals,
  officeWorkspaceJustified,
  type VisualSemanticSignals,
} from "@/lib/brain/brain-visual-semantic-signals";
import type { BrainVisualCore } from "@/lib/brain/brain-visual-variety";
import type { BrainVariationChoice, BrainVisualVariationAxes, VisualFamilyId } from "@/lib/brain/brain-visual-variety";

export type { BrainVisualTerritory, BrainVisualTerritoryInput } from "@/lib/brain/brain-visual-territory-types";
export { extractVisualSemanticSignals, summarizeVisualSignalDiagnostics } from "@/lib/brain/brain-visual-semantic-signals";
export type { VisualSemanticSignals, VisualSignalDiagnostics } from "@/lib/brain/brain-visual-semantic-signals";

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const CORPORATE_ENV = new Set([
  "home_office",
  "workspace",
  "editorial_table",
]);
const CORPORATE_ACTIVITY = new Set(["meeting", "presenting", "collaboration", "planning"]);
const CORPORATE_PROPS = new Set(["laptop", "notebook", "typography"]);

const AXIS_POOL_LABEL: Record<BrainVisualTerritory, string> = {
  sport_performance: "SPORT_PERFORMANCE_AXES",
  fashion_editorial: "FASHION_EDITORIAL_AXES",
  creative_workspace: "CREATIVE_WORKSPACE_AXES",
  culture_lifestyle: "CULTURE_LIFESTYLE_AXES",
  domestic_editorial: "DOMESTIC_EDITORIAL_AXES",
  tech_saas: "TECH_SAAS_AXES",
  luxury_product: "LUXURY_PRODUCT_AXES",
  music_culture: "MUSIC_CULTURE_AXES",
  outdoor_lifestyle: "OUTDOOR_LIFESTYLE_AXES",
  food_hospitality: "FOOD_HOSPITALITY_AXES",
  architecture_interiors: "ARCHITECTURE_INTERIORS_AXES",
  retail_product: "RETAIL_PRODUCT_AXES",
  craft_materials: "CRAFT_MATERIALS_AXES",
  generic_visual: "DEFAULT_AXES_GENERIC",
};

export function territoryAxisPoolId(t: BrainVisualTerritory): string {
  return AXIS_POOL_LABEL[t] ?? "DEFAULT_AXES_GENERIC";
}

/** Ejes genéricos cuando no hay territorio claro — evita reunión/oficina por defecto. */
export const DEFAULT_AXES_GENERIC: BrainVisualVariationAxes = {
  subjectMode: ["individual", "duo", "object", "empty_space", "team"],
  framing: ["detail", "medium", "wide", "top_down", "side"],
  environment: [
    "lived_in_interior",
    "creative_table",
    "material_surface",
    "architectural_interior",
    "personal_studio",
  ],
  activity: ["observing", "thinking", "creating", "quiet_work", "documentary_portrait", "editing"],
  propCluster: ["books", "camera", "materials", "papers_moodboard", "vinyl_records", "art_objects"],
  moodShift: ["calm", "focused", "inspiring", "refined", "experimental"],
};

const SPORT_PERFORMANCE_AXES: BrainVisualVariationAxes = {
  subjectMode: ["solo_athlete", "duo_athletes", "object", "hero_product", "empty_space"],
  framing: ["dynamic_action", "low_angle", "close_detail", "hero_product", "wide_action", "cropped_body_detail"],
  environment: [
    "track",
    "gym",
    "court",
    "field",
    "locker_room",
    "stadium_tunnel",
    "urban_sport_location",
    "studio_sport",
    "outdoor_training",
    "architectural_interior",
  ],
  activity: [
    "training",
    "running",
    "sprinting",
    "jumping",
    "stretching",
    "warmup",
    "recovery",
    "focus",
    "competition",
    "product_hero",
    "thinking",
  ],
  propCluster: [
    "sneakers",
    "sportswear",
    "ball",
    "towel",
    "bottle",
    "training_equipment",
    "jersey",
    "sport_bag",
    "stopwatch",
    "chalk",
    "court_lines",
    "track_lines",
    "camera",
    "materials",
  ],
  moodShift: ["focused", "intense", "calm", "inspiring", "raw", "experimental"],
};

const FASHION_EDITORIAL_AXES: BrainVisualVariationAxes = {
  subjectMode: ["individual", "duo", "object", "empty_space"],
  framing: ["detail", "medium", "wide", "side", "top_down", "low_angle"],
  environment: ["studio", "architectural_interior", "urban_location", "editorial_table", "lived_in_interior"],
  activity: ["posing", "walking", "observing", "thinking", "documentary_portrait", "editing"],
  propCluster: ["textile_texture", "camera", "materials", "typography", "art_objects", "books"],
  moodShift: ["refined", "experimental", "calm", "inspiring", "focused"],
};

const CREATIVE_WORKSPACE_AXES: BrainVisualVariationAxes = {
  subjectMode: ["individual", "duo", "object", "empty_space"],
  framing: ["detail", "medium", "wide", "top_down", "side"],
  environment: [
    "personal_studio",
    "creative_table",
    "material_surface",
    "architectural_interior",
    "lived_in_interior",
  ],
  activity: ["making", "editing", "observing", "thinking", "quiet_work", "material_process"],
  propCluster: ["papers_moodboard", "camera", "materials", "laptop", "notebook", "typography"],
  moodShift: ["calm", "focused", "inspiring", "refined", "experimental"],
};

const CULTURE_LIFESTYLE_AXES: BrainVisualVariationAxes = {
  subjectMode: ["individual", "duo", "object", "empty_space"],
  framing: ["medium", "detail", "wide", "side", "documentary_framing"],
  environment: [
    "lived_in_interior",
    "cultural_corner",
    "natural_light_room",
    "editorial_domestic",
    "architectural_interior",
  ],
  activity: ["reading", "observing", "creating", "documentary_portrait", "quiet_moment", "listening"],
  propCluster: ["books", "vinyl_records", "art_objects", "camera", "materials", "typography"],
  moodShift: ["calm", "inspiring", "focused", "refined", "experimental"],
};

const DOMESTIC_EDITORIAL_AXES: BrainVisualVariationAxes = {
  subjectMode: ["individual", "duo", "object", "empty_space"],
  framing: ["medium", "detail", "wide", "top_down", "side"],
  environment: [
    "lived_in_interior",
    "editorial_domestic",
    "natural_light_room",
    "material_surface",
    "architectural_interior",
  ],
  activity: ["quiet_moment", "observing", "reading", "documentary_portrait", "thinking", "creating"],
  propCluster: ["textiles_home", "wood_surfaces", "books", "ceramic_objects", "materials", "camera"],
  moodShift: ["calm", "refined", "inspiring", "focused", "experimental"],
};

const TECH_SAAS_AXES: BrainVisualVariationAxes = {
  subjectMode: ["individual", "duo", "team", "object", "empty_space"],
  framing: ["detail", "medium", "wide", "top_down", "side"],
  environment: ["workspace", "home_office", "studio", "architectural_interior"],
  activity: ["meeting", "presenting", "thinking", "editing", "writing", "observing"],
  propCluster: ["laptop", "notebook", "typography", "books", "camera", "materials"],
  moodShift: ["focused", "calm", "inspiring", "refined", "experimental"],
};

const LUXURY_PRODUCT_AXES: BrainVisualVariationAxes = {
  subjectMode: ["object", "individual", "empty_space"],
  framing: ["detail", "close_detail", "medium", "wide", "top_down"],
  environment: ["studio", "architectural_interior", "material_surface", "editorial_table"],
  activity: ["product_hero", "observing", "thinking", "material_process"],
  propCluster: ["materials", "typography", "reflection_surfaces", "camera", "papers_moodboard"],
  moodShift: ["refined", "calm", "inspiring", "focused", "experimental"],
};

const MUSIC_CULTURE_AXES: BrainVisualVariationAxes = {
  subjectMode: ["individual", "duo", "team", "object", "empty_space"],
  framing: ["wide", "medium", "detail", "low_angle", "side"],
  environment: ["studio", "urban_location", "architectural_interior", "stage", "cultural_corner"],
  activity: ["performing", "thinking", "observing", "editing", "listening", "creating"],
  propCluster: ["vinyl_records", "instruments", "camera", "materials", "books", "typography"],
  moodShift: ["experimental", "inspiring", "raw", "focused", "calm"],
};

const OUTDOOR_LIFESTYLE_AXES: BrainVisualVariationAxes = {
  subjectMode: ["individual", "duo", "object", "empty_space"],
  framing: ["wide", "medium", "detail", "wide_action", "side"],
  environment: ["field", "urban_location", "architectural_interior", "studio", "outdoor_training"],
  activity: ["walking", "thinking", "observing", "running", "recovery", "focus"],
  propCluster: ["camera", "materials", "bottle", "towel", "notebook"],
  moodShift: ["calm", "inspiring", "focused", "refined", "experimental"],
};

const FOOD_HOSPITALITY_AXES: BrainVisualVariationAxes = {
  subjectMode: ["object", "individual", "empty_space"],
  framing: ["detail", "top_down", "close_detail", "medium", "wide"],
  environment: ["studio", "kitchen", "table_scene", "architectural_interior", "material_surface"],
  activity: ["observing", "thinking", "preparing", "serving", "quiet_work"],
  propCluster: ["materials", "camera", "typography", "ceramic_objects", "textiles_home"],
  moodShift: ["calm", "refined", "inspiring", "focused", "experimental"],
};

const ARCHITECTURE_AXES: BrainVisualVariationAxes = {
  subjectMode: ["empty_space", "object", "individual"],
  framing: ["wide", "medium", "detail", "side", "top_down"],
  environment: ["architectural_interior", "urban_location", "studio_minimal", "natural_exterior"],
  activity: ["observing", "thinking", "walking", "quiet_moment"],
  propCluster: ["materials", "camera", "reflection_surfaces", "typography"],
  moodShift: ["calm", "refined", "inspiring", "focused", "experimental"],
};

const RETAIL_PRODUCT_AXES: BrainVisualVariationAxes = {
  subjectMode: ["object", "individual", "empty_space"],
  framing: ["detail", "medium", "wide", "top_down", "side"],
  environment: ["studio", "retail_floor", "material_surface", "architectural_interior"],
  activity: ["observing", "product_hero", "thinking", "material_process"],
  propCluster: ["materials", "typography", "camera", "papers_moodboard"],
  moodShift: ["refined", "calm", "focused", "inspiring", "experimental"],
};

const CRAFT_MATERIALS_AXES: BrainVisualVariationAxes = {
  subjectMode: ["individual", "object", "empty_space", "duo"],
  framing: ["detail", "close_detail", "medium", "top_down", "side"],
  environment: ["personal_studio", "material_surface", "lived_in_interior", "architectural_interior"],
  activity: ["making", "material_process", "observing", "thinking", "quiet_work"],
  propCluster: ["materials", "papers_moodboard", "ceramic_objects", "textile_texture", "camera"],
  moodShift: ["calm", "focused", "inspiring", "raw", "experimental"],
};

export function getVariationAxesForTerritory(territory: BrainVisualTerritory): BrainVisualVariationAxes {
  const copy = (a: BrainVisualVariationAxes): BrainVisualVariationAxes => ({
    subjectMode: [...a.subjectMode],
    framing: [...a.framing],
    environment: [...a.environment],
    activity: [...a.activity],
    propCluster: [...a.propCluster],
    moodShift: [...a.moodShift],
  });
  switch (territory) {
    case "sport_performance":
      return copy(SPORT_PERFORMANCE_AXES);
    case "fashion_editorial":
      return copy(FASHION_EDITORIAL_AXES);
    case "creative_workspace":
      return copy(CREATIVE_WORKSPACE_AXES);
    case "culture_lifestyle":
      return copy(CULTURE_LIFESTYLE_AXES);
    case "domestic_editorial":
      return copy(DOMESTIC_EDITORIAL_AXES);
    case "tech_saas":
      return copy(TECH_SAAS_AXES);
    case "luxury_product":
      return copy(LUXURY_PRODUCT_AXES);
    case "music_culture":
      return copy(MUSIC_CULTURE_AXES);
    case "outdoor_lifestyle":
      return copy(OUTDOOR_LIFESTYLE_AXES);
    case "food_hospitality":
      return copy(FOOD_HOSPITALITY_AXES);
    case "architecture_interiors":
      return copy(ARCHITECTURE_AXES);
    case "retail_product":
      return copy(RETAIL_PRODUCT_AXES);
    case "craft_materials":
      return copy(CRAFT_MATERIALS_AXES);
    default:
      return copy(DEFAULT_AXES_GENERIC);
  }
}

export function joinBlob(input: BrainVisualTerritoryInput): string {
  const parts = [
    ...input.subjects,
    ...input.mood,
    ...input.composition,
    ...input.visualStyleTags,
    ...input.visualMessage,
    ...input.peopleAndWardrobe,
    ...input.textures,
    ...input.objectsAndProps,
    ...input.confirmedPatterns,
    ...(input.brandSignals ?? []),
    ...(input.possibleUse ?? []),
    ...(input.lightingHints ?? []),
    ...(input.colorPaletteDominant ?? []),
    ...(input.graphicStyleNotes ?? []),
    ...(input.compositionNotes ?? []),
    ...(input.peopleClothingAggregateNotes ?? []),
    ...(input.peopleDetailLines ?? []),
    ...(input.clothingDetailLines ?? []),
    ...(input.graphicDetailLines ?? []),
    ...(input.recurringStyles ?? []),
    ...(input.dominantMoodsAgg ?? []),
    ...(input.frequentSubjects ?? []),
    input.patternSummary ?? "",
    input.narrativeSummary ?? "",
    input.userPromptHint ?? "",
    input.corporateBlob ?? "",
  ];
  return parts.join(" ").toLowerCase();
}

function countMatches(blob: string, rx: RegExp): number {
  return [...blob.matchAll(rx)].length;
}

function scoreSport(blob: string, signals: VisualSemanticSignals): number {
  const rx =
    /\b(athlete|atleta|sport|deporte|running|training|entren|football|fútbol|soccer|basket|baloncesto|tennis|golf|performance|rendimiento|movement|movimiento|gym|gimnasio|court|cancha|pista|track|sneakers|zapatillas|calzado|jersey|camiseta|nike|adidas|swoosh|marathon|sprint|warm|stretch|fitness|workout|olympic|nba|fifa|sportswear|equipo deportivo|ropa deportiva|dynamic|dinámic|action shot|hero product|product hero)\b/gi;
  let m = countMatches(blob, rx) * 2;
  if (/\bjust do it\b/i.test(blob)) m += 3;
  if (signals.spaceSignals.sport) m += 5;
  if (signals.objectSignals.sportObjects) m += 4;
  if (signals.activitySignals.training) m += 3;
  if (signals.clothingSignals.sportswear) m += 3;
  return m;
}

function scoreFashion(blob: string, signals: VisualSemanticSignals): number {
  const rx =
    /\b(fashion|moda|runway|pasarela|couture|editorial moda|lookbook|textil premium|garment|vestuario|styling)\b/gi;
  let m = countMatches(blob, rx) * 2;
  if (signals.culturalSignals.fashion) m += 3;
  if (signals.compositionSignals.editorial) m += 2;
  if (signals.clothingSignals.luxury) m += 2;
  return m;
}

function scoreTech(blob: string): number {
  const rx =
    /\b(saas|software|api|dashboard|cloud|plataforma|app|startup tech|developer|code|datos|analytics|ux ui)\b/gi;
  const m = countMatches(blob, rx) * 2;
  return m;
}

function scoreLuxury(blob: string, signals: VisualSemanticSignals): number {
  const rx = /\b(luxury|lujo|premium|jewelry|reloj|perfume|cosmética alta|skincare premium)\b/gi;
  let m = countMatches(blob, rx) * 2;
  if (signals.compositionSignals.productHero) m += 4;
  if (signals.objectSignals.productObjects) m += 3;
  if (signals.textureSignals.glossy || signals.textureSignals.glass) m += 1;
  return m;
}

function scoreMusic(blob: string, signals: VisualSemanticSignals): number {
  const rx = /\b(music|música|concert|concierto|dj|band|artista|álbum|audio|instrument)\b/gi;
  let m = countMatches(blob, rx) * 2;
  if (signals.culturalSignals.music) m += 4;
  return m;
}

function scoreOutdoor(blob: string): number {
  const rx =
    /\b(outdoor|aire libre|hiking|trekking|camping|montaña|trail|naturaleza|paisaje|surf|climb|escalada)\b/gi;
  const m = countMatches(blob, rx) * 2;
  return m;
}

function scoreFood(blob: string): number {
  const rx = /\b(food|comida|culinary|chef|restaurant|plato|bebida gastronom|packaging food|hospitality)\b/gi;
  const m = countMatches(blob, rx) * 2;
  return m;
}

function scoreArchitecture(blob: string, signals: VisualSemanticSignals): number {
  const rx = /\b(architecture|arquitectura|interior design|render arquitect|facade|edificio|espacio arquitect)\b/gi;
  let m = countMatches(blob, rx) * 2;
  if (signals.spaceSignals.architectural) m += 5;
  if (!signals.peopleSignals.present) m += 3;
  if (signals.compositionSignals.wide) m += 2;
  return m;
}

function scoreCreativeWorkspace(blob: string, signals: VisualSemanticSignals): number {
  const rx =
    /\b(creative studio|diseño gráfico|agencia creativa|workshop creativo|lluvia de ideas|moodboard|mood board)\b/gi;
  let m = countMatches(blob, rx) * 2;
  if (/\b(design agency|estudio creativo)\b/i.test(blob)) m += 2;
  if (signals.objectSignals.creativeTools) m += 6;
  if (signals.objectSignals.techObjects && (signals.activitySignals.making || signals.activitySignals.editing))
    m += 4;
  if (signals.textureSignals.paper) m += 2;
  return m;
}

function scoreCultureLifestyle(blob: string, signals: VisualSemanticSignals, office: boolean): number {
  let m = 0;
  if (signals.culturalSignals.books) m += 4;
  if (signals.culturalSignals.vinyls) m += 4;
  if (signals.culturalSignals.artObjects) m += 3;
  if (signals.spaceSignals.cultural) m += 3;
  if (signals.spaceSignals.domestic) m += 2;
  if (signals.culturalSignals.archive || signals.culturalSignals.gallery) m += 2;
  if (signals.lightingSignals.natural || signals.lightingSignals.window) m += 1;
  if (signals.compositionSignals.documentary) m += 2;
  if (office) m -= 12;
  if (signals.objectSignals.creativeTools && signals.objectSignals.techObjects && !signals.culturalSignals.books)
    m -= 4;
  if (/\b(editorial lifestyle|cultural corner|vinyl|bookshelf)\b/i.test(blob)) m += 3;
  return m;
}

function scoreDomesticEditorial(signals: VisualSemanticSignals, office: boolean): number {
  let m = 0;
  if (signals.spaceSignals.domestic) m += 4;
  if (signals.textureSignals.wood || signals.textureSignals.fabric) m += 3;
  if (signals.objectSignals.furnitureObjects) m += 2;
  if (signals.lightingSignals.window || signals.lightingSignals.natural) m += 2;
  if (signals.activitySignals.resting || /\bcalm|íntim|intimate\b/i.test(signals.peopleSignals.energy.join(" ")))
    m += 1;
  if (office) m -= 10;
  if (signals.spaceSignals.sport) m -= 6;
  return m;
}

function scoreRetailProduct(blob: string, signals: VisualSemanticSignals): number {
  let m = 0;
  if (signals.spaceSignals.retail) m += 8;
  if (/\b(display shelf|packaging retail|shop floor)\b/i.test(blob)) m += 4;
  if (signals.objectSignals.productObjects) m += 3;
  return m;
}

function scoreCraftMaterials(blob: string, signals: VisualSemanticSignals): number {
  let m = 0;
  if (signals.culturalSignals.craft) m += 5;
  if (signals.activitySignals.making) m += 3;
  if (signals.textureSignals.paper || signals.textureSignals.wood || signals.textureSignals.fabric) m += 2;
  if (/\b(workshop|taller artesan|atelier)\b/i.test(blob)) m += 4;
  return m;
}

export function detectBrainVisualTerritory(
  input: BrainVisualTerritoryInput,
  precomputedSignals?: VisualSemanticSignals,
): BrainVisualTerritory {
  const signals = precomputedSignals ?? extractVisualSemanticSignals(input);
  const blob = joinBlob(input);
  const office = officeWorkspaceJustified(signals, blob);

  const scores: Array<{ t: BrainVisualTerritory; s: number }> = [
    { t: "sport_performance", s: scoreSport(blob, signals) },
    { t: "fashion_editorial", s: scoreFashion(blob, signals) },
    { t: "tech_saas", s: scoreTech(blob) },
    { t: "luxury_product", s: scoreLuxury(blob, signals) },
    { t: "music_culture", s: scoreMusic(blob, signals) },
    { t: "outdoor_lifestyle", s: scoreOutdoor(blob) },
    { t: "food_hospitality", s: scoreFood(blob) },
    { t: "architecture_interiors", s: scoreArchitecture(blob, signals) },
    { t: "creative_workspace", s: scoreCreativeWorkspace(blob, signals) },
    { t: "culture_lifestyle", s: scoreCultureLifestyle(blob, signals, office) },
    { t: "domestic_editorial", s: scoreDomesticEditorial(signals, office) },
    { t: "retail_product", s: scoreRetailProduct(blob, signals) },
    { t: "craft_materials", s: scoreCraftMaterials(blob, signals) },
  ];

  scores.sort((a, b) => b.s - a.s);
  const top = scores[0]!;
  const second = scores[1] ?? { t: "generic_visual" as const, s: 0 };

  if (top.s < 3) return "generic_visual";
  if (top.s >= 12) return top.t;
  if (top.s - second.s < 1.5) return "generic_visual";
  return top.t;
}

export function userExplicitlyRequestsOfficeMeeting(text: string): boolean {
  const t = text.toLowerCase();
  if (/\bmeeting\b.*\b(athlete|sport|deport)/i.test(text)) return true;
  if (/\b(reuni[oó]n|reunion)\b.*\b(deport|atlet)/i.test(text)) return true;
  if (/\boffice\b.*\b(team|equipo)\b/i.test(t) && /\b(sport|deport|athlete)\b/i.test(t)) return true;
  if (/\b(workshop|taller)\s+(corporativ|empres)/i.test(text)) return true;
  if (/\b(boardroom|sala de juntas|oficina)\b/i.test(t) && /\b(reuni[oó]n|meeting|presentaci)/i.test(t))
    return true;
  if (/\b(pitch|deck)\b/i.test(t) && /\b(equipo|team|oficina|office)\b/i.test(t)) return true;
  return false;
}

const SPORT_INCOMPATIBLE_ACTIVITY = new Set([
  "meeting",
  "presenting",
  "editing",
  "writing",
  "collaboration",
  "planning",
]);
const SPORT_INCOMPATIBLE_ENV = new Set(["home_office", "workspace", "editorial_table"]);
const SPORT_INCOMPATIBLE_PROPS = new Set(["books", "laptop", "notebook", "typography"]);

export function validateVariationAgainstVisualCore(
  _visualCore: BrainVisualCore,
  choice: BrainVariationChoice,
  territory: BrainVisualTerritory,
  opts?: { explicitWorkspaceMeetingRequest?: boolean },
): { ok: boolean; reasons: string[] } {
  if (opts?.explicitWorkspaceMeetingRequest) return { ok: true, reasons: [] };

  const reasons: string[] = [];

  if (territory === "sport_performance") {
    if (SPORT_INCOMPATIBLE_ENV.has(choice.environment)) reasons.push(`environment:${choice.environment}`);
    if (SPORT_INCOMPATIBLE_ACTIVITY.has(choice.activity)) reasons.push(`activity:${choice.activity}`);
    if (SPORT_INCOMPATIBLE_PROPS.has(choice.propCluster)) reasons.push(`propCluster:${choice.propCluster}`);
    if (choice.subjectMode === "team" && choice.activity !== "competition")
      reasons.push("subjectMode:team_sin_competición");
    return { ok: reasons.length === 0, reasons };
  }

  const blocksCorporate =
    territory === "culture_lifestyle" ||
    territory === "domestic_editorial" ||
    territory === "fashion_editorial" ||
    territory === "luxury_product" ||
    territory === "architecture_interiors";

  if (blocksCorporate) {
    if (CORPORATE_ACTIVITY.has(choice.activity)) reasons.push(`activity:${choice.activity}`);
    if (CORPORATE_ENV.has(choice.environment)) reasons.push(`environment:${choice.environment}`);
  }

  if (territory === "luxury_product") {
    if (choice.subjectMode === "team") reasons.push("subjectMode:team_en_producto_hero");
    if (choice.activity === "meeting" || choice.activity === "presenting")
      reasons.push(`activity:${choice.activity}`);
  }

  if (territory === "architecture_interiors") {
    if (choice.subjectMode === "team") reasons.push("subjectMode:team_en_espacio_arquitectónico");
    if (CORPORATE_ACTIVITY.has(choice.activity)) reasons.push(`activity:${choice.activity}`);
  }

  if (territory === "creative_workspace") {
    if (choice.activity === "meeting" || choice.activity === "presenting")
      reasons.push(`activity:${choice.activity}`);
  }

  return { ok: reasons.length === 0, reasons };
}

export function territoryNeedsVariationValidation(territory: BrainVisualTerritory): boolean {
  return (
    territory === "sport_performance" ||
    territory === "culture_lifestyle" ||
    territory === "domestic_editorial" ||
    territory === "fashion_editorial" ||
    territory === "luxury_product" ||
    territory === "architecture_interiors" ||
    territory === "creative_workspace"
  );
}

export function getTerritoryVisualAvoidExtras(territory: BrainVisualTerritory): readonly string[] {
  switch (territory) {
    case "sport_performance":
      return [
        "people sitting around a table in an office",
        "wooden meeting table with papers",
        "business presentation scene",
        "corporate workshop with laptops",
        "conference room team meeting",
        "home office desk with books",
        "startup team around table pointing at tablet",
        "generic SaaS glass office",
        "bookshelf corporate portrait",
      ];
    case "culture_lifestyle":
    case "domestic_editorial":
      return [
        "corporate office meeting",
        "people around boardroom table",
        "generic startup team",
        "glass office",
        "SaaS dashboard as hero",
        "business presentation",
        "over-polished stock photo",
        "laptop team smiling at screen",
        "documents spread for meeting",
      ];
    case "fashion_editorial":
      return [
        "corporate meeting",
        "office stock photo",
        "awkward stiff posing",
        "generic business attire unless brief requests it",
        "team around conference table",
      ];
    case "luxury_product":
      return [
        "cluttered office",
        "random people around table",
        "cheap plastic look",
        "generic ecommerce white background unless requested",
        "corporate workshop",
      ];
    case "architecture_interiors":
      return [
        "crowded office meeting",
        "generic stock people filling frame",
        "random props unrelated to architecture",
        "team brainstorming with laptops",
      ];
    case "creative_workspace":
      return [
        "corporate boardroom",
        "fake brainstorming stock photo",
        "people smiling at laptop",
        "generic meeting table",
        "glass startup office cliché",
      ];
    default:
      return [];
  }
}

/** @deprecated Usar getTerritoryVisualAvoidExtras("sport_performance"). */
export function getSportPerformanceVisualAvoidExtras(): readonly string[] {
  return getTerritoryVisualAvoidExtras("sport_performance");
}

export function truncateCorporateForTerritoryVisual(
  text: string,
  territory: BrainVisualTerritory,
  maxChars: number,
): { text: string; truncated: boolean } {
  const trimTerritory =
    territory === "sport_performance" ||
    territory === "culture_lifestyle" ||
    territory === "domestic_editorial" ||
    territory === "fashion_editorial" ||
    territory === "luxury_product" ||
    territory === "architecture_interiors" ||
    territory === "creative_workspace";
  if (!trimTerritory) return { text, truncated: false };
  const t = text.trim();
  if (t.length <= maxChars) return { text: t, truncated: false };
  const slice = t.slice(0, maxChars);
  const cut = slice.lastIndexOf(". ");
  const safe = cut > 80 ? slice.slice(0, cut + 1) : `${slice}…`;
  const hint =
    territory === "sport_performance"
      ? "innovación, rendimiento, cultura deportiva, producto icónico — recortado para no sesgar hacia oficina o reunión."
      : "coherencia con referencias visuales analizadas — recortado para no imponer escena corporativa o reunión.";
  return {
    text: `${safe}\n\n(Resumen de marca para imagen: ${hint})`,
    truncated: true,
  };
}

/** @deprecated Usar truncateCorporateForTerritoryVisual. */
export function truncateCorporateForSportVisual(
  text: string,
  territory: BrainVisualTerritory,
  maxChars: number,
): { text: string; truncated: boolean } {
  if (territory !== "sport_performance") return { text, truncated: false };
  return truncateCorporateForTerritoryVisual(text, "sport_performance", maxChars);
}

export function resolveFamilyIdFromTerritory(
  territory: BrainVisualTerritory,
  familyId: VisualFamilyId | "auto" | undefined,
  planSeed: string,
): VisualFamilyId {
  if (familyId && familyId !== "auto") return familyId;
  switch (territory) {
    case "sport_performance":
      return (hashString(planSeed) & 1) === 0 ? "sport_performance_hero" : "sport_product_focus";
    case "fashion_editorial":
    case "culture_lifestyle":
    case "domestic_editorial":
      return "editorial_humana";
    case "tech_saas":
      return "workspace_sofisticado";
    case "creative_workspace":
    case "music_culture":
    case "outdoor_lifestyle":
      return "colaboracion_creativa";
    case "luxury_product":
    case "food_hospitality":
    case "architecture_interiors":
    case "retail_product":
    case "craft_materials":
      return "objetos_y_materia";
    default:
      return "editorial_humana";
  }
}

export function sportTerritoryExcludedAxesSummary(): string {
  return "home_office, workspace, editorial_table, meeting, presenting, books, laptop, notebook (pool deportivo)";
}

export function territoryExcludedAxesSummary(territory: BrainVisualTerritory): string | undefined {
  switch (territory) {
    case "sport_performance":
      return sportTerritoryExcludedAxesSummary();
    case "culture_lifestyle":
    case "domestic_editorial":
      return "Sin meeting / workspace / home_office corporativos en pool; prioriza interior vivido y cultura.";
    case "creative_workspace":
      return "Sin meeting ni boardroom; prioriza estudio, mesa creativa y proceso.";
    default:
      return undefined;
  }
}

/** Filtra tokens corporativos de pools ya enriquecidos cuando el territorio no los soporta. */
export function filterAxesForTerritory(
  axes: BrainVisualVariationAxes,
  territory: BrainVisualTerritory,
  opts: { explicitOffice: boolean },
): { axes: BrainVisualVariationAxes; dangerousWordsRemoved: string[] } {
  if (opts.explicitOffice || territory === "tech_saas") {
    return { axes: { ...axes, subjectMode: [...axes.subjectMode], framing: [...axes.framing], environment: [...axes.environment], activity: [...axes.activity], propCluster: [...axes.propCluster], moodShift: [...axes.moodShift] }, dangerousWordsRemoved: [] };
  }
  const removed: string[] = [];
  const strip = (arr: readonly string[], forbidden: Set<string>, label: string) => {
    const out = arr.filter((x) => {
      if (forbidden.has(x)) {
        removed.push(`${label}:${x}`);
        return false;
      }
      return true;
    });
    return out.length ? out : [...arr];
  };

  if (
    territory === "culture_lifestyle" ||
    territory === "domestic_editorial" ||
    territory === "fashion_editorial" ||
    territory === "luxury_product" ||
    territory === "architecture_interiors" ||
    territory === "creative_workspace" ||
    territory === "generic_visual"
  ) {
    const env = strip(axes.environment, CORPORATE_ENV, "environment");
    const act = strip(axes.activity, CORPORATE_ACTIVITY, "activity");
    const props = strip(axes.propCluster, CORPORATE_PROPS, "propCluster");
    return {
      axes: {
        ...axes,
        environment: env,
        activity: act,
        propCluster: props,
        subjectMode: [...axes.subjectMode],
        framing: [...axes.framing],
        moodShift: [...axes.moodShift],
      },
      dangerousWordsRemoved: removed,
    };
  }

  return {
    axes: {
      ...axes,
      subjectMode: [...axes.subjectMode],
      framing: [...axes.framing],
      environment: [...axes.environment],
      activity: [...axes.activity],
      propCluster: [...axes.propCluster],
      moodShift: [...axes.moodShift],
    },
    dangerousWordsRemoved: [],
  };
}
