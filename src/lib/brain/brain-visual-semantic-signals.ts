import type { BrainVisualTerritoryInput } from "@/lib/brain/brain-visual-territory-types";

export type PeopleSemanticSignals = {
  present: boolean;
  countHint: "none" | "one" | "few" | "group" | "unknown";
  attitude: string[];
  pose: string[];
  energy: string[];
  relationToCamera: string[];
  roleHints: string[];
};

export type SpaceSemanticSignals = {
  interiorExterior: "interior" | "exterior" | "mixed" | "unknown";
  environmentTypes: string[];
  domestic: boolean;
  studio: boolean;
  office: boolean;
  cultural: boolean;
  retail: boolean;
  sport: boolean;
  outdoor: boolean;
  architectural: boolean;
  industrial: boolean;
  natural: boolean;
};

export type ClothingSemanticSignals = {
  formality: string[];
  wardrobeStyle: string[];
  materials: string[];
  colors: string[];
  uniforms: boolean;
  sportswear: boolean;
  workwear: boolean;
  luxury: boolean;
  casualPremium: boolean;
};

export type ObjectSemanticSignals = {
  dominantProps: string[];
  culturalObjects: boolean;
  techObjects: boolean;
  creativeTools: boolean;
  sportObjects: boolean;
  productObjects: boolean;
  furnitureObjects: boolean;
};

export type TextureSemanticSignals = {
  wood: boolean;
  concrete: boolean;
  metal: boolean;
  paper: boolean;
  fabric: boolean;
  leather: boolean;
  glass: boolean;
  plastic: boolean;
  naturalMaterials: boolean;
  matte: boolean;
  glossy: boolean;
};

export type LightingSemanticSignals = {
  natural: boolean;
  studio: boolean;
  flash: boolean;
  window: boolean;
  dramatic: boolean;
  soft: boolean;
  hard: boolean;
  warm: boolean;
  cool: boolean;
};

export type CompositionSemanticSignals = {
  closeUp: boolean;
  wide: boolean;
  medium: boolean;
  topDown: boolean;
  lowAngle: boolean;
  centered: boolean;
  documentary: boolean;
  editorial: boolean;
  productHero: boolean;
  action: boolean;
};

export type CulturalSemanticSignals = {
  books: boolean;
  vinyls: boolean;
  artObjects: boolean;
  designObjects: boolean;
  music: boolean;
  fashion: boolean;
  archive: boolean;
  gallery: boolean;
  craft: boolean;
};

export type ActivitySemanticSignals = {
  working: boolean;
  moving: boolean;
  resting: boolean;
  performing: boolean;
  collaborating: boolean;
  observing: boolean;
  presenting: boolean;
  making: boolean;
  editing: boolean;
  training: boolean;
  cooking: boolean;
  shopping: boolean;
};

export type VisualSemanticSignals = {
  peopleSignals: PeopleSemanticSignals;
  spaceSignals: SpaceSemanticSignals;
  clothingSignals: ClothingSemanticSignals;
  objectSignals: ObjectSemanticSignals;
  textureSignals: TextureSemanticSignals;
  lightingSignals: LightingSemanticSignals;
  compositionSignals: CompositionSemanticSignals;
  culturalSignals: CulturalSemanticSignals;
  activitySignals: ActivitySemanticSignals;
};

const STOP = new Set([
  "the",
  "and",
  "with",
  "from",
  "para",
  "una",
  "con",
  "sin",
  "por",
  "los",
  "las",
]);

function tokenize(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const s = String(line || "").toLowerCase();
    for (const w of s.split(/[^a-záéíóúñ0-9]+/gi)) {
      const t = w.trim();
      if (t.length < 2 || STOP.has(t)) continue;
      out.push(t);
    }
  }
  return out;
}

function mergeBlob(input: BrainVisualTerritoryInput): string {
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

function has(blob: string, rx: RegExp): boolean {
  rx.lastIndex = 0;
  return rx.test(blob);
}

function uniqPush(arr: string[], v: string, max = 12) {
  const t = v.trim().toLowerCase();
  if (!t || arr.includes(t) || arr.length >= max) return;
  arr.push(t);
}

export function extractVisualSemanticSignals(input: BrainVisualTerritoryInput): VisualSemanticSignals {
  const blob = mergeBlob(input);

  const peoplePresent =
    /\b(person|people|gente|hombre|mujer|modelo|retrato|portrait|subject|figure|couple|duo|team|grupo)\b/i.test(
      blob,
    ) ||
    input.peopleDetailLines?.some((l) => l.trim().length > 2) ||
    input.peopleAndWardrobe.some((s) => s.trim().length > 3);

  let countHint: PeopleSemanticSignals["countHint"] = "unknown";
  if (/\b(no people|sin personas|empty|nadie|vac[ií]o)\b/i.test(blob)) countHint = "none";
  else if (/\b(solo|single|one person|individual|única)\b/i.test(blob)) countHint = "one";
  else if (/\b(group|grupo|team|equipo|crowd|multitud)\b/i.test(blob)) countHint = "group";
  else if (/\b(duo|pareja|two|dos)\b/i.test(blob)) countHint = "few";

  const attitude: string[] = [];
  if (has(blob, /\b(relaxed|relajad|calm|tranquil|intimate|íntim)\b/)) uniqPush(attitude, "relaxed");
  if (has(blob, /\b(confident|segur|bold|strong)\b/)) uniqPush(attitude, "confident");
  if (has(blob, /\b(serious|serio|focused|concentr)\b/)) uniqPush(attitude, "focused");

  const pose: string[] = [];
  if (has(blob, /\b(standing|de pie|seated|sentad|lying|recostad)\b/)) uniqPush(pose, "body_pose_noted");
  if (has(blob, /\b(candid|natural|unposed)\b/)) uniqPush(pose, "candid");

  const energy: string[] = [];
  if (has(blob, /\b(dynamic|dinámic|energ|intense|intenso|action)\b/)) uniqPush(energy, "high");
  if (has(blob, /\b(quiet|calm|soft|suave|still)\b/)) uniqPush(energy, "low");

  const relationToCamera: string[] = [];
  if (has(blob, /\b(eye contact|mirando cámara|direct gaze)\b/i)) uniqPush(relationToCamera, "direct");
  if (has(blob, /\b(profile|perfil|from behind|espaldas)\b/i)) uniqPush(relationToCamera, "indirect");

  const roleHints: string[] = [];
  if (has(blob, /\b(reader|lectura|artist|diseñador|designer|chef|athlete|model)\b/i)) uniqPush(roleHints, "creative_or_cultural");

  const space: SpaceSemanticSignals = {
    interiorExterior: "unknown",
    environmentTypes: [],
    domestic: has(blob, /\b(home|casa|living|sofa|sofá|domestic|doméstic|bedroom|kitchen|cocina|dining)\b/i),
    studio: has(blob, /\b(studio|estudio|set photo|cyclorama|fondo infinito)\b/i),
    office: has(blob, /\b(office|oficina|desk job|open plan|open-plan|boardroom|corporate workspace)\b/i),
    cultural: has(blob, /\b(library|biblioteca|gallery|galería|museum|vinyl|vinilo|bookshelf|estantería|art wall)\b/i),
    retail: has(blob, /\b(shop|tienda|retail|storefront|boutique|shelf display)\b/i),
    sport: has(blob, /\b(gym|gimnasio|court|pista|field|track|stadium|deport|sport)\b/i),
    outdoor: has(blob, /\b(outdoor|exterior|aire libre|naturaleza|landscape|paisaje|street exterior)\b/i),
    architectural: has(blob, /\b(architecture|arquitectura|facade|volumen|interior design|loft|hall)\b/i),
    industrial: has(blob, /\b(industrial|warehouse|fábrica|concrete hall|brutalist)\b/i),
    natural: has(blob, /\b(forest|bosque|beach|playa|mountain|montaña|lake|lago)\b/i),
  };
  if (space.domestic) uniqPush(space.environmentTypes, "domestic");
  if (space.studio) uniqPush(space.environmentTypes, "studio");
  if (space.office) uniqPush(space.environmentTypes, "office");
  if (space.cultural) uniqPush(space.environmentTypes, "cultural");
  if (space.retail) uniqPush(space.environmentTypes, "retail");
  if (space.sport) uniqPush(space.environmentTypes, "sport");
  if (space.outdoor) uniqPush(space.environmentTypes, "outdoor");
  if (space.architectural) uniqPush(space.environmentTypes, "architectural");
  if (space.industrial) uniqPush(space.environmentTypes, "industrial");
  if (space.natural) uniqPush(space.environmentTypes, "natural");
  if (has(blob, /\b(interior|indoors|inside)\b/i)) space.interiorExterior = "interior";
  else if (has(blob, /\b(exterior|outdoor|outside|open sky)\b/i)) space.interiorExterior = "exterior";
  else if (space.domestic || space.studio || space.office || space.cultural) space.interiorExterior = "interior";
  else if (space.outdoor || space.natural) space.interiorExterior = "exterior";

  const clothing: ClothingSemanticSignals = {
    formality: [],
    wardrobeStyle: [],
    materials: [],
    colors: [],
    uniforms: has(blob, /\b(uniform|jersey|kit team)\b/i),
    sportswear: has(blob, /\b(sportswear|athleisure|leggings|running shorts|training top)\b/i),
    workwear: has(blob, /\b(workwear|denim jacket work|utility)\b/i),
    luxury: has(blob, /\b(couture|luxury garment|high fashion)\b/i),
    casualPremium: has(blob, /\b(casual premium|quiet luxury|contemporary casual)\b/i),
  };
  for (const line of input.clothingDetailLines ?? []) {
    const bits = line.split(/[,;]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    for (const b of bits.slice(0, 6)) {
      if (/casual|formal|premium|sport|technical/.test(b)) uniqPush(clothing.formality, b);
      else uniqPush(clothing.wardrobeStyle, b);
    }
  }

  const objectSignals: ObjectSemanticSignals = {
    dominantProps: tokenize([...input.objectsAndProps, ...input.subjects]).slice(0, 14),
    culturalObjects: has(blob, /\b(book|libro|vinyl|vinilo|record player|tocadiscos|paint brush|easel|canvas lienzo)\b/i),
    techObjects: has(blob, /\b(laptop|macbook|monitor|screen|tablet|smartphone|gadget)\b/i),
    creativeTools: has(blob, /\b(camera|cámara|lens|lente|moodboard|sketch|boceto|palette|pincel|wacom|tablet draw)\b/i),
    sportObjects: has(blob, /\b(ball|pelota|dumbbell|racket|raqueta|sneaker|bottle sport)\b/i),
    productObjects: has(blob, /\b(product hero|packshot|still life product|cosmetic jar|bottle product)\b/i),
    furnitureObjects: has(blob, /\b(chair|silla|table|mesa|sofa|sofá|shelf|estantería|lamp)\b/i),
  };

  const textureSignals: TextureSemanticSignals = {
    wood: has(blob, /\b(wood|madera|oak|roble|walnut|nogal)\b/i),
    concrete: has(blob, /\b(concrete|hormigón|cemento)\b/i),
    metal: has(blob, /\b(metal|steel|acero|brass|latón|chrome|cromo)\b/i),
    paper: has(blob, /\b(paper|papel|print|prints|magazine spread)\b/i),
    fabric: has(blob, /\b(fabric|textile|linen|lino|cotton|algodón|wool|lana)\b/i),
    leather: has(blob, /\b(leather|cuero)\b/i),
    glass: has(blob, /\b(glass|vidrio|crystal)\b/i),
    plastic: has(blob, /\b(plastic|plástico|acrylic)\b/i),
    naturalMaterials: has(blob, /\b(stone|piedra|marble|mármol|clay|ceramic)\b/i),
    matte: has(blob, /\b(matte|mate)\b/i),
    glossy: has(blob, /\b(glossy|brillo|specular|highlights fuertes)\b/i),
  };

  const lightingSignals: LightingSemanticSignals = {
    natural: has(blob, /\b(natural light|luz natural|daylight)\b/i),
    studio: has(blob, /\b(studio light|softbox|three-point|iluminación estudio)\b/i),
    flash: has(blob, /\b(flash|strobe)\b/i),
    window: has(blob, /\b(window light|luz ventana|ventanal)\b/i),
    dramatic: has(blob, /\b(dramatic light|chiaroscuro|hard shadow)\b/i),
    soft: has(blob, /\b(soft light|difus|gentle light)\b/i),
    hard: has(blob, /\b(hard light|contraste duro)\b/i),
    warm: has(blob, /\b(warm light|golden|ámbar|cálid)\b/i),
    cool: has(blob, /\b(cool light|frí|blue hour)\b/i),
  };

  const compositionSignals: CompositionSemanticSignals = {
    closeUp: has(blob, /\b(close[-\s]?up|primer plano|macro detail)\b/i),
    wide: has(blob, /\b(wide shot|plano general|establishing)\b/i),
    medium: has(blob, /\b(medium shot|plano medio)\b/i),
    topDown: has(blob, /\b(top[-\s]?down|flatlay|plano cenital|bird's eye)\b/i),
    lowAngle: has(blob, /\b(low angle|contrapicado|worm's eye)\b/i),
    centered: has(blob, /\b(symmetr|centrad|centered composition)\b/i),
    documentary: has(blob, /\b(documentary|documental|reportage|photojournal)\b/i),
    editorial: has(blob, /\b(editorial|magazine layout|fashion spread)\b/i),
    productHero: has(blob, /\b(product hero|hero shot|packshot)\b/i),
    action: has(blob, /\b(action shot|movimiento|motion blur)\b/i),
  };

  const culturalSignals: CulturalSemanticSignals = {
    books: has(blob, /\b(book|books|libro|libros|bookshelf|estantería|reading nook)\b/i),
    vinyls: has(blob, /\b(vinyl|vinyls|vinilo|vinilos|record collection|discos de vinilo)\b/i),
    artObjects: has(blob, /\b(painting|cuadro|sculpture|escultura|gallery wall)\b/i),
    designObjects: has(blob, /\b(design chair|iconic furniture|eames|design object)\b/i),
    music: has(blob, /\b(instrument|guitar|piano|studio music|dj booth)\b/i),
    fashion: has(blob, /\b(fashion|moda|styling|lookbook)\b/i),
    archive: has(blob, /\b(archive|archivo|filing|collection curated)\b/i),
    gallery: has(blob, /\b(gallery white cube|exhibition)\b/i),
    craft: has(blob, /\b(craft|artesan|handmade|workshop craft)\b/i),
  };

  const activitySignals: ActivitySemanticSignals = {
    working: has(blob, /\b(working|trabajando|at desk|en el escritorio)\b/i),
    moving: has(blob, /\b(running|walking|camin|cycling|dancing)\b/i),
    resting: has(blob, /\b(resting|descans|lounging)\b/i),
    performing: has(blob, /\b(performing|on stage|concierto)\b/i),
    collaborating: has(blob, /\b(collaborat|co-creation|juntos creando)\b/i),
    observing: has(blob, /\b(observing|mirando|contempl|looking at art)\b/i),
    presenting: has(blob, /\b(presenting|presentación slides|pitch deck visual)\b/i),
    making: has(blob, /\b(making|creating|crafting|fabricando)\b/i),
    editing: has(blob, /\b(editing|post-produc|retouch)\b/i),
    training: has(blob, /\b(training|entren|workout|gym session)\b/i),
    cooking: has(blob, /\b(cooking|cocin|chef prep)\b/i),
    shopping: has(blob, /\b(shopping|compras|boutique visit)\b/i),
  };

  return {
    peopleSignals: {
      present: peoplePresent,
      countHint,
      attitude,
      pose,
      energy,
      relationToCamera,
      roleHints,
    },
    spaceSignals: space,
    clothingSignals: clothing,
    objectSignals,
    textureSignals,
    lightingSignals,
    compositionSignals,
    culturalSignals,
    activitySignals,
  };
}

export function officeWorkspaceJustified(signals: VisualSemanticSignals, blob: string): boolean {
  if (signals.spaceSignals.office) return true;
  if (signals.activitySignals.presenting && /\b(slides|deck|dashboard)\b/i.test(blob)) return true;
  if (/\b(boardroom|conference room|open office|startup office|team meeting)\b/i.test(blob)) return true;
  if (signals.objectSignals.techObjects && signals.activitySignals.working && /\b(desk|escritorio)\b/i.test(blob))
    return true;
  return false;
}

export type VisualSignalDiagnostics = {
  dominantPeopleSignals: string;
  dominantSpaceSignals: string;
  dominantClothingSignals: string;
  dominantObjectSignals: string;
  dominantTextureSignals: string;
  dominantLightingSignals: string;
  dominantCompositionSignals: string;
  dominantCulturalSignals: string;
  dominantActivitySignals: string;
};

function onFlags<T extends Record<string, boolean>>(obj: T, keys: (keyof T)[]): string[] {
  return keys.filter((k) => obj[k]).map(String);
}

export function summarizeVisualSignalDiagnostics(signals: VisualSemanticSignals): VisualSignalDiagnostics {
  const p = signals.peopleSignals;
  const dominantPeopleSignals = [
    p.present ? "people_present" : "no_clear_people",
    `count:${p.countHint}`,
    ...p.attitude.slice(0, 2),
    ...p.energy.slice(0, 1),
  ].join(" · ");

  const s = signals.spaceSignals;
  const dominantSpaceSignals = [
    `in_out:${s.interiorExterior}`,
    ...s.environmentTypes.slice(0, 5),
  ].join(" · ");

  const c = signals.clothingSignals;
  const dominantClothingSignals = [
    ...c.formality.slice(0, 2),
    ...c.wardrobeStyle.slice(0, 2),
    c.sportswear ? "sportswear" : "",
    c.luxury ? "luxury" : "",
    c.casualPremium ? "casual_premium" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const dominantObjectSignals = [
    ...signals.objectSignals.dominantProps.slice(0, 6),
    onFlags(
      {
        cultural: signals.objectSignals.culturalObjects,
        tech: signals.objectSignals.techObjects,
        creative: signals.objectSignals.creativeTools,
        sport: signals.objectSignals.sportObjects,
        product: signals.objectSignals.productObjects,
        furniture: signals.objectSignals.furnitureObjects,
      },
      ["cultural", "tech", "creative", "sport", "product", "furniture"],
    ).join(" "),
  ]
    .filter(Boolean)
    .join(" · ");

  const dominantTextureSignals = onFlags(signals.textureSignals, [
    "wood",
    "concrete",
    "metal",
    "paper",
    "fabric",
    "leather",
    "glass",
    "naturalMaterials",
    "matte",
    "glossy",
  ]).join(" · ");

  const dominantLightingSignals = onFlags(signals.lightingSignals, [
    "natural",
    "studio",
    "flash",
    "window",
    "dramatic",
    "soft",
    "hard",
    "warm",
    "cool",
  ]).join(" · ");

  const dominantCompositionSignals = onFlags(signals.compositionSignals, [
    "closeUp",
    "wide",
    "medium",
    "topDown",
    "lowAngle",
    "documentary",
    "editorial",
    "productHero",
    "action",
  ]).join(" · ");

  const dominantCulturalSignals = onFlags(signals.culturalSignals, [
    "books",
    "vinyls",
    "artObjects",
    "designObjects",
    "music",
    "fashion",
    "archive",
    "gallery",
    "craft",
  ]).join(" · ");

  const dominantActivitySignals = onFlags(signals.activitySignals, [
    "working",
    "moving",
    "resting",
    "performing",
    "collaborating",
    "observing",
    "presenting",
    "making",
    "editing",
    "training",
    "cooking",
    "shopping",
  ]).join(" · ");

  return {
    dominantPeopleSignals,
    dominantSpaceSignals,
    dominantClothingSignals,
    dominantObjectSignals,
    dominantTextureSignals,
    dominantLightingSignals,
    dominantCompositionSignals,
    dominantCulturalSignals,
    dominantActivitySignals,
  };
}
