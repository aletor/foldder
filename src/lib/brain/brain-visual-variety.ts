import type { BrainVisualTerritory } from "@/lib/brain/brain-visual-territory-types";
import type { VisualSemanticSignals } from "@/lib/brain/brain-visual-semantic-signals";
import { DEFAULT_AXES_GENERIC } from "@/lib/brain/brain-visual-territory";

/** Núcleo de marca: invariantes que no deben interpretarse como lista cerrada de objetos por imagen. */
export type BrainVisualCore = {
  generalTone: string;
  styleSummary: string;
  paletteAndMaterials: string;
  lightingCharacter: string;
  brandFeeling: string;
  confirmedPatternsBrief?: string;
  visualAvoid: string[];
};

export type DnaAxesHintSource = {
  subjects: string[];
  mood: string[];
  composition: string[];
  visualStyleTags: string[];
  environments: string[];
};

export type BrainVisualFamilyHintSource = {
  visualStyleTags: string[];
  mood: string[];
  visualMessage: string[];
  visualCore?: Pick<BrainVisualCore, "brandFeeling">;
};

/** Modo de exploración sin romper la marca. */
export type BrainVarietyMode = "conservative" | "balanced" | "exploratory";

export type VisualFamilyId =
  | "editorial_humana"
  | "workspace_sofisticado"
  | "objetos_y_materia"
  | "colaboracion_creativa"
  | "sport_performance_hero"
  | "sport_product_focus";

export type CoreLockId = "palette" | "light" | "tone" | "realism";

export type VariationAxisId = "subjects" | "framing" | "scene" | "activity" | "props";

export type BrainDesignerVarietyInput = {
  varietyMode?: BrainVarietyMode;
  /** Si true, ese aspecto queda fijado al núcleo (no rota en esta imagen). */
  lockCore?: Partial<Record<CoreLockId, boolean>>;
  /** Si false, el eje no se elige libremente (se usa un valor neutro). Por defecto todos true. */
  varyAxes?: Partial<Record<VariationAxisId, boolean>>;
  /** Últimas combinaciones ya usadas (repetition guard). */
  historyFingerprints?: VariationFingerprint[];
  /** Familia visual; `auto` infiere desde el contexto. */
  familyId?: VisualFamilyId | "auto";
};

export type VariationFingerprint = {
  subjectMode: string;
  environment: string;
  framing: string;
  propCluster: string;
};

export type BrainVariationChoice = {
  subjectMode: string;
  framing: string;
  environment: string;
  activity: string;
  propCluster: string;
  moodShift: string;
};

export type BrainVisualVariationAxes = {
  subjectMode: readonly string[];
  framing: readonly string[];
  environment: readonly string[];
  activity: readonly string[];
  propCluster: readonly string[];
  moodShift: readonly string[];
};

const FAMILY_LABELS: Record<VisualFamilyId, string> = {
  editorial_humana: "Editorial humana (luz natural, intimidad, narrativa fotográfica)",
  workspace_sofisticado: "Workspace sofisticado (dirección de arte limpia, sin stock genérico)",
  objetos_y_materia: "Objetos y materia (bodegón, texturas, detalle táctil)",
  colaboracion_creativa: "Colaboración creativa (personas en flujo real, no posado corporativo)",
  sport_performance_hero:
    "Rendimiento deportivo (héroe o atleta en acción, movimiento, energía; sin oficina ni reunión)",
  sport_product_focus:
    "Producto deportivo en foco (calzado, textil, equipo; hero limpio sin mesa de reunión)",
};

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fingerprintFromChoice(c: BrainVariationChoice): VariationFingerprint {
  return {
    subjectMode: c.subjectMode,
    environment: c.environment,
    framing: c.framing,
    propCluster: c.propCluster,
  };
}

export function fingerprintKey(f: VariationFingerprint): string {
  return `${f.subjectMode}|${f.environment}|${f.framing}|${f.propCluster}`;
}

export function buildDefaultVisualVariationAxes(): BrainVisualVariationAxes {
  const g = DEFAULT_AXES_GENERIC;
  return {
    subjectMode: [...g.subjectMode],
    framing: [...g.framing],
    environment: [...g.environment],
    activity: [...g.activity],
    propCluster: [...g.propCluster],
    moodShift: [...g.moodShift],
  };
}

export type EnrichVisualVariationAxesOptions = {
  strictSportPool?: boolean;
  territory?: BrainVisualTerritory;
  signals?: VisualSemanticSignals;
  /** True si el texto del usuario o las señales justifican oficina/reunión explícita. */
  officeExplicitlyJustified?: boolean;
};

/** Prioriza opciones alineadas con palabras del ADN (sin volverlas obligatorias en el prompt). */
export function enrichVisualVariationAxesFromDna(
  axes: BrainVisualVariationAxes,
  ctx: DnaAxesHintSource,
  options?: EnrichVisualVariationAxesOptions,
): BrainVisualVariationAxes {
  const blob = [
    ...ctx.subjects,
    ...ctx.mood,
    ...ctx.composition,
    ...ctx.visualStyleTags,
    ...ctx.environments,
  ]
    .join(" ")
    .toLowerCase();

  const bump = <T extends string>(arr: readonly T[], preferred: T[]): T[] => {
    const set = new Set(arr);
    const front = preferred.filter((x) => set.has(x));
    const rest = arr.filter((x) => !front.includes(x as T));
    return [...front, ...rest] as T[];
  };

  const territory = options?.territory;
  const signals = options?.signals;
  const officeOk = options?.officeExplicitlyJustified ?? false;
  const blockCorporateBumps =
    !officeOk &&
    (territory === "culture_lifestyle" ||
      territory === "domestic_editorial" ||
      territory === "fashion_editorial" ||
      territory === "luxury_product" ||
      territory === "architecture_interiors" ||
      territory === "creative_workspace" ||
      territory === "generic_visual");

  let subjectMode = [...axes.subjectMode];
  const allowTeamFromBlob =
    !blockCorporateBumps && /equipo|team|grupo|colabor|juntos/i.test(blob) && !/(libro|vinilo|lectura|sofá)/i.test(blob);
  if (allowTeamFromBlob && /reuni|meet|lluvia|workshop/i.test(blob)) {
    subjectMode = bump(subjectMode, ["team", "duo"]);
  } else if (!blockCorporateBumps && /equipo|team|grupo|colabor|juntos/i.test(blob)) {
    subjectMode = bump(subjectMode, ["team", "duo"]);
  }
  if (/objeto|bodeg|producto|material|textura/i.test(blob)) {
    subjectMode = bump(subjectMode, ["object"]);
  }
  if (/solo|one|individual|persona única/i.test(blob)) {
    subjectMode = bump(subjectMode, ["individual"]);
  }

  let environment = [...axes.environment];
  if (!options?.strictSportPool) {
    if (!blockCorporateBumps && /casa|home|living|sofá|doméstic/i.test(blob)) {
      environment = bump(environment, ["home_office", "lived_in_interior", "editorial_domestic"]);
    }
    if (blockCorporateBumps && /casa|home|living|sofá|doméstic|interior vivido/i.test(blob)) {
      environment = bump(environment, ["lived_in_interior", "editorial_domestic", "natural_light_room"]);
    }
    if (
      /\bmesa\b|\bmesa de\b|\beditorial table\b|\bstill[-\s]?life\b|\bbodeg[oó]?n\b|\bbodeg\b/i.test(blob) &&
      !blockCorporateBumps
    ) {
      environment = bump(environment, ["editorial_table"]);
    }
    if (/\bmesa\b|\bcreative table\b|moodboard|material surface/i.test(blob) && blockCorporateBumps) {
      environment = bump(environment, ["creative_table", "material_surface", "editorial_domestic"]);
    }
  }
  if (/arquitect|loft|espacio amplio|hall/i.test(blob)) {
    environment = bump(environment, ["architectural_interior"]);
  }
  if (signals?.culturalSignals.books || signals?.culturalSignals.vinyls) {
    environment = bump(environment, ["cultural_corner", "lived_in_interior"]);
    if (signals.culturalSignals.artObjects) environment = bump(environment, ["cultural_corner"]);
  }

  let activity = [...axes.activity];
  if (!options?.strictSportPool) {
    if (!blockCorporateBumps && /reuni|meet|lluvia|workshop/i.test(blob)) activity = bump(activity, ["meeting"]);
    if (/escrib|writing|nota/i.test(blob)) activity = bump(activity, ["writing", "quiet_work"]);
    if (/edit|post|retoc/i.test(blob)) activity = bump(activity, ["editing"]);
    if (blockCorporateBumps && /leer|reading|lectura/i.test(blob)) activity = bump(activity, ["reading", "observing"]);
    if (blockCorporateBumps && signals?.activitySignals.making) activity = bump(activity, ["creating", "making"]);
    if (blockCorporateBumps && /retrato|portrait|candid/i.test(blob))
      activity = bump(activity, ["documentary_portrait", "observing"]);
  }

  let propCluster = [...axes.propCluster];
  if (!options?.strictSportPool) {
    if (/libro|lectura|estanter|vinilo|vinyl/i.test(blob)) propCluster = bump(propCluster, ["books", "vinyl_records"]);
    if (!blockCorporateBumps && /laptop|macbook|portátil/i.test(blob)) propCluster = bump(propCluster, ["laptop"]);
    if (blockCorporateBumps && /laptop|macbook|portátil/i.test(blob) && /moodboard|diseño|creative|editing/i.test(blob))
      propCluster = bump(propCluster, ["laptop", "papers_moodboard"]);
  }
  if (/cámara|foto|lente/i.test(blob)) propCluster = bump(propCluster, ["camera"]);

  return {
    ...axes,
    subjectMode,
    environment,
    activity,
    propCluster,
  };
}

export function inferVisualFamilyFromContext(ctx: BrainVisualFamilyHintSource): VisualFamilyId {
  const b = [
    ...ctx.visualStyleTags,
    ...ctx.mood,
    ...ctx.visualMessage,
    ctx.visualCore?.brandFeeling ?? "",
  ]
    .join(" ")
    .toLowerCase();
  if (/colabor|equipo|junto|pair|dúo|duo|taller grupal/i.test(b)) return "colaboracion_creativa";
  if (/objeto|material|textura|bodeg|still|táctil/i.test(b)) return "objetos_y_materia";
  if (
    /\bdocumental\b|\brevista\b|\breportaje\b|\bíntim/i.test(b) ||
    /\beditorial[\s,]+(foto|fotograf)/i.test(b)
  ) {
    return "editorial_humana";
  }
  return "workspace_sofisticado";
}

export function defaultBrainDesignerVarietyInput(): BrainDesignerVarietyInput {
  return {
    varietyMode: "balanced",
    lockCore: {},
    varyAxes: {
      subjects: true,
      framing: true,
      scene: true,
      activity: true,
      props: true,
    },
    historyFingerprints: [],
    familyId: "auto",
  };
}

function axisPoolForMode(mode: BrainVarietyMode, full: readonly string[]): string[] {
  if (mode === "conservative") return full.slice(0, Math.max(2, Math.ceil(full.length * 0.45)));
  if (mode === "exploratory") return [...full];
  return full.slice(0, Math.max(3, Math.ceil(full.length * 0.72)));
}

function buildChoiceOnce(
  axes: BrainVisualVariationAxes,
  input: BrainDesignerVarietyInput,
  planSeed: string,
  attempt: number,
): BrainVariationChoice {
  const mode = input.varietyMode ?? "balanced";
  const vary = { ...defaultBrainDesignerVarietyInput().varyAxes, ...input.varyAxes };
  const rng = mulberry32(hashString(`${planSeed}|${mode}|${attempt}|${input.historyFingerprints?.length ?? 0}`));

  const pick = <T extends string>(pool: readonly T[], fallback: T): T => {
    if (!pool.length) return fallback;
    return pool[Math.floor(rng() * pool.length)]!;
  };

  const sm = vary.subjects !== false ? pick(axisPoolForMode(mode, axes.subjectMode), "individual") : "object";
  const fr = vary.framing !== false ? pick(axisPoolForMode(mode, axes.framing), "medium") : "medium";
  const envDefault = axes.environment[0] ?? "lived_in_interior";
  const env = vary.scene !== false ? pick(axisPoolForMode(mode, axes.environment), envDefault) : envDefault;
  const actDefault = axes.activity[0] ?? "thinking";
  const act = vary.activity !== false ? pick(axisPoolForMode(mode, axes.activity), actDefault) : actDefault;
  const props = vary.props !== false ? pick(axisPoolForMode(mode, axes.propCluster), "materials") : "materials";
  const mood = pick(axisPoolForMode(mode, axes.moodShift), "refined");

  return {
    subjectMode: sm,
    framing: fr,
    environment: env,
    activity: act,
    propCluster: props,
    moodShift: mood,
  };
}

export type BrainVarietyPickResult = {
  choice: BrainVariationChoice;
  familyUsed: VisualFamilyId;
  varietyMode: BrainVarietyMode;
  repeatedElementsAvoided: boolean;
  chosenVariationAxes: BrainVariationChoice;
  coreLockedFields: CoreLockId[];
};

export type PickBrainVarietyOptions = {
  /** Si viene del territorio deportivo u otro, fija familia sin inferir workspace genérico. */
  resolvedFamilyUsed?: VisualFamilyId;
};

export function pickBrainVariationBundle(
  axes: BrainVisualVariationAxes,
  ctx: BrainVisualFamilyHintSource,
  input: BrainDesignerVarietyInput | undefined,
  planSeed: string,
  options?: PickBrainVarietyOptions,
): BrainVarietyPickResult {
  const merged: BrainDesignerVarietyInput = {
    ...defaultBrainDesignerVarietyInput(),
    ...input,
    lockCore: { ...defaultBrainDesignerVarietyInput().lockCore, ...input?.lockCore },
    varyAxes: { ...defaultBrainDesignerVarietyInput().varyAxes, ...input?.varyAxes },
    historyFingerprints: input?.historyFingerprints ?? [],
  };

  const varietyMode = merged.varietyMode ?? "balanced";
  const familyUsed =
    options?.resolvedFamilyUsed ??
    (merged.familyId && merged.familyId !== "auto" ? merged.familyId : inferVisualFamilyFromContext(ctx));

  const coreLockedFields: CoreLockId[] = [];
  if (merged.lockCore?.palette) coreLockedFields.push("palette");
  if (merged.lockCore?.light) coreLockedFields.push("light");
  if (merged.lockCore?.tone) coreLockedFields.push("tone");
  if (merged.lockCore?.realism) coreLockedFields.push("realism");

  const hist = merged.historyFingerprints ?? [];
  let repeatedElementsAvoided = false;
  let choice = buildChoiceOnce(axes, merged, planSeed, 0);

  for (let attempt = 1; attempt < 10; attempt++) {
    const k = fingerprintKey(fingerprintFromChoice(choice));
    const hit = hist.some((h) => fingerprintKey(h) === k);
    if (!hit) break;
    repeatedElementsAvoided = true;
    choice = buildChoiceOnce(axes, merged, planSeed, attempt);
  }

  return {
    choice,
    familyUsed,
    varietyMode,
    repeatedElementsAvoided,
    chosenVariationAxes: { ...choice },
    coreLockedFields,
  };
}

export function formatVisualCoreBlock(core: BrainVisualCore): string {
  const lines: string[] = [
    `Tono visual general: ${core.generalTone}.`,
    `Estilo: ${core.styleSummary}.`,
    `Paleta y materiales (guía, no lista cerrada de objetos): ${core.paletteAndMaterials}.`,
    `Luz: ${core.lightingCharacter}.`,
    `Sensación de marca: ${core.brandFeeling}.`,
  ];
  if (core.confirmedPatternsBrief?.trim()) {
    lines.push(`Patrones confirmados (invariantes, breves): ${core.confirmedPatternsBrief}.`);
  }
  lines.push(`EVITAR siempre: ${core.visualAvoid.join("; ")}.`);
  lines.push(
    "No conviertas el núcleo en un inventario obligatorio de objetos concretos por imagen; respétalo como guardarraíles de marca.",
  );
  return lines.join("\n");
}

export function formatVariationPlanBlock(
  family: VisualFamilyId,
  pick: BrainVarietyPickResult,
  coreLockedFields: CoreLockId[],
): string {
  const fam = FAMILY_LABELS[family];
  const locks =
    coreLockedFields.length > 0
      ? `Aspectos de núcleo bloqueados en esta generación (no variar): ${coreLockedFields.join(", ")}.`
      : "Sin bloqueos extra de núcleo (solo los invariantes del bloque A1).";

  const axes = pick.chosenVariationAxes;
  return [
    `Familia visual: ${fam}.`,
    `Modo de variedad: ${pick.varietyMode}.`,
    locks,
    "Plan de variación SOLO para esta imagen (una combinación; no apliques todos los ejes posibles a la vez):",
    `- subjectMode: ${axes.subjectMode}`,
    `- framing: ${axes.framing}`,
    `- environment: ${axes.environment}`,
    `- activity: ${axes.activity}`,
    `- propCluster: ${axes.propCluster} (como acento, no como catálogo exhaustivo)`,
    `- moodShift: ${axes.moodShift}`,
    pick.repeatedElementsAvoided
      ? "Se evitó repetir la misma combinación reciente de sujeto + entorno + encuadre + props."
      : "",
    "Varía respecto a otras piezas de la misma marca: encuadre, escena o actividad; mantén coherencia cromática y de luz salvo bloqueos indicados.",
  ]
    .filter(Boolean)
    .join("\n");
}
