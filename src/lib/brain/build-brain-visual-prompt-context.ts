import type { BrainRuntimeContext } from "@/lib/brain/brain-creative-memory-types";
import { buildBrainRuntimeContext } from "@/lib/brain/brain-runtime-context";
import { buildSafeCreativeRulesPromptAppendix } from "@/lib/brain/brain-safe-creative-rules";
import type {
  AggregatedVisualPatterns,
  BrainVisualImageAnalysis,
  BrainVisualStyleSlotKey,
  ProjectAssetsMetadata,
} from "@/app/spaces/project-assets-metadata";
import { defaultBrainVisualStyle } from "@/app/spaces/project-assets-metadata";
import {
  aggregateVisualPatterns,
  getEffectiveClassification,
  isExcludedFromVisualDna,
} from "@/lib/brain/brain-visual-analysis";
import {
  buildSpanishTrustedVisualNarrative,
  filterLegacyLanguageTraits,
  isTrustedRemoteVisionAnalysis,
} from "@/lib/brain/brain-brand-summary";
import type { BrainSourceTier } from "@/lib/brain/brain-field-provenance";
import type {
  BrainDesignerVarietyInput,
  BrainVariationChoice,
  BrainVarietyMode,
  BrainVarietyPickResult,
  BrainVisualCore,
  BrainVisualVariationAxes,
  CoreLockId,
  VisualFamilyId,
} from "@/lib/brain/brain-visual-variety";
import type { BrainVisualTerritory, BrainVisualTerritoryInput } from "@/lib/brain/brain-visual-territory-types";
import type { VisualSemanticSignals, VisualSignalDiagnostics } from "@/lib/brain/brain-visual-semantic-signals";
import { officeWorkspaceJustified } from "@/lib/brain/brain-visual-semantic-signals";
import {
  buildDirectedArtVisualPromptDraft,
  buildVariationFocusLine,
  finalizeVisualPromptForModel,
  getVisualAvoidSliceUsed,
  type PromptCoreSlice,
  twoSentencesMax,
} from "@/lib/brain/brain-final-visual-prompt";
import {
  detectBrainVisualTerritory,
  extractVisualSemanticSignals,
  filterAxesForTerritory,
  getTerritoryVisualAvoidExtras,
  getVariationAxesForTerritory,
  joinBlob,
  resolveFamilyIdFromTerritory,
  summarizeVisualSignalDiagnostics,
  territoryAxisPoolId,
  territoryExcludedAxesSummary,
  territoryNeedsVariationValidation,
  truncateCorporateForTerritoryVisual,
  userExplicitlyRequestsOfficeMeeting,
  validateVariationAgainstVisualCore,
} from "@/lib/brain/brain-visual-territory";
import { enrichVisualVariationAxesFromDna, pickBrainVariationBundle } from "@/lib/brain/brain-visual-variety";
import { buildBrandVisualDnaPromptSnippet } from "@/lib/brain/brand-visual-dna/build-brand-visual-dna-prompt-snippet";

/** Fuentes que realmente alimentaron el contexto visual (prioridad conceptual). */
export type BrainVisualPromptSourcesUsed = {
  confirmedUserVisualDna: boolean;
  coreVisualReferenceAnalysis: boolean;
  projectVisualReferenceAnalysis: boolean;
  aggregatedPatternsTrusted: boolean;
  visionDerivedVisualStyleSlots: boolean;
  /** Copy de estrategia / voz: solo como capa secundaria cuando hay señal visual fuerte, o como refuerzo débil. */
  secondaryBrandStrategyText: boolean;
};

export type BrainVisualPromptSourceQuality = "high" | "medium" | "low" | "text_only";

export type BrainVisualPromptContextResult = {
  visualDirection: string;
  /** Invariantes de marca (tono, estilo, paleta, luz, sensación, evitar). */
  visualCore: BrainVisualCore;
  /** Ejes rotables permitidos para esta marca (catálogo; no es el plan de una imagen concreta). */
  visualVariationAxes: BrainVisualVariationAxes;
  visualStyleTags: string[];
  mood: string[];
  subjects: string[];
  environments: string[];
  composition: string[];
  lighting: string[];
  colorPalette: string[];
  peopleAndWardrobe: string[];
  objectsAndProps: string[];
  textures: string[];
  visualMessage: string[];
  doUse: string[];
  doAvoid: string[];
  visualAvoid: string[];
  sourceQuality: BrainVisualPromptSourceQuality;
  sources: BrainVisualPromptSourcesUsed;
  textOnlyGeneration: boolean;
  /** Señal visual débil (sin confirmados ni análisis remotos ni slots fuertes). */
  visualContextWeak: boolean;
  /** Tier dominante usado para la columna vertebral del prompt. */
  sourceTier: BrainSourceTier | "mixed";
  /** Advertencias de trazabilidad (p. ej. topic legacy, corporate relegado). */
  warnings: string[];
  /** Texto corporativo recortado solo como contexto de mensaje (nunca sustituye ADN confirmado en A). */
  brandMessageContext?: string;
  /** Análisis con visión remota fiable (Gemini/OpenAI, sin fallback). */
  visualReferenceAnalysisRealCount: number;
  patternSummaryUsed: boolean;
  /** Se usó texto de slots por defecto o agregados sin referencias remotas como columna vertebral. */
  fallbackDefaultUsed: boolean;
  /** Territorio visual dominante para acotar ejes A2 (variedad sin contradecir ADN). */
  visualTerritory: BrainVisualTerritory;
  /** Identificador del pool de ejes usado (p. ej. SPORT_PERFORMANCE_AXES). */
  axisPoolId: string;
  /** Si se acortó corporate/doc por deporte u otro límite de generación de imagen. */
  corporateContextTruncatedForVisual: boolean;
  /** Señales semánticas derivadas del análisis visual (territorio + ejes). */
  visualSemanticSignals: VisualSemanticSignals;
  visualSignalDiagnostics: VisualSignalDiagnostics;
  /** Texto fusionado usado en detección de territorio (trazabilidad). */
  territoryJoinBlob: string;
  /** Tokens de eje filtrados por anti-corporativo según territorio. */
  dangerousWordsRemovedFromAxes: string[];
};

export type BrainImageSuggestionDiagnostics = {
  finalPromptUsed: string;
  visualSourcesUsed: BrainVisualPromptSourcesUsed;
  visualReferenceAnalysisRealCount: number;
  confirmedVisualDnaUsed: boolean;
  patternSummaryUsed: boolean;
  fallbackDefaultUsed: boolean;
  textOnlyGeneration: boolean;
  /** Capa de copy de producto/capacidades añadida al prompt (siempre después del bloque visual). */
  secondaryBrandProductCopy?: boolean;
  /** Diagnósticos del sistema de variedad (dos capas). */
  familyUsed?: VisualFamilyId;
  varietyMode?: BrainVarietyMode;
  repeatedElementsAvoided?: boolean;
  chosenVariationAxes?: BrainVariationChoice;
  coreLockedFields?: CoreLockId[];
  visualTerritory?: BrainVisualTerritory;
  axisPoolUsed?: string;
  excludedAxesNote?: string;
  incompatibleAxesWarnings?: string[];
  corporateContextTruncatedForVisual?: boolean;
  variationValidationAttempts?: number;
  dominantPeopleSignals?: string;
  dominantSpaceSignals?: string;
  dominantClothingSignals?: string;
  dominantObjectSignals?: string;
  dominantTextureSignals?: string;
  dominantLightingSignals?: string;
  dominantCompositionSignals?: string;
  dominantCulturalSignals?: string;
  dominantActivitySignals?: string;
  dangerousWordsRemoved?: string[];
  promptLength?: number;
  dangerousWordsRemovedInPrompt?: string[];
  corporateContextUsed?: boolean;
  corporateContextLength?: number;
  numberOfRequiredObjects?: number;
  variationFocus?: string;
  contaminationWarnings?: string[];
  finalPromptWasRewritten?: boolean;
  /** Borrador A–F previo a sanitize (trazabilidad dev). */
  promptBeforeSanitize?: string;
  /** Lista exacta de strings de evitar inyectados en el bloque E. */
  visualAvoidUsed?: string[];
};

/** Metadatos para «Ver por qué» en Image Generator (Nano Banana) cuando hay Brain conectado. */
export type BrainImageGeneratorPromptDiagnostics = {
  /** Opcional: contexto runtime Brain (Nano Banana / futuros nodos). */
  brainConnected?: boolean;
  brainVersion?: number;
  brainRuntimeContextSlices?: string[];
  brainRuntimeWarnings?: string[];
  fallbackUsed?: boolean;
  ignoredMockSources?: boolean;
  safeCreativeRulesApplied?: boolean;
  safeCreativeAppendixLength?: number;
  visualSourcesUsedSummary?: string;
  finalPromptUsed: string;
  confirmedVisualPatternsUsed: boolean;
  trustedVisualAnalysisCount: number;
  textOnlyGeneration: boolean;
  visualAvoid: string[];
  familyUsed?: VisualFamilyId;
  varietyMode?: BrainVarietyMode;
  repeatedElementsAvoided?: boolean;
  chosenVariationAxes?: BrainVariationChoice;
  coreLockedFields?: CoreLockId[];
  visualTerritory?: BrainVisualTerritory;
  axisPoolUsed?: string;
  excludedAxesNote?: string;
  incompatibleAxesWarnings?: string[];
  corporateContextTruncatedForVisual?: boolean;
  variationValidationAttempts?: number;
  dominantPeopleSignals?: string;
  dominantSpaceSignals?: string;
  dominantClothingSignals?: string;
  dominantObjectSignals?: string;
  dominantTextureSignals?: string;
  dominantLightingSignals?: string;
  dominantCompositionSignals?: string;
  dominantCulturalSignals?: string;
  dominantActivitySignals?: string;
  dangerousWordsRemoved?: string[];
  promptLength?: number;
  dangerousWordsRemovedInPrompt?: string[];
  corporateContextUsed?: boolean;
  corporateContextLength?: number;
  numberOfRequiredObjects?: number;
  variationFocus?: string;
  contaminationWarnings?: string[];
  finalPromptWasRewritten?: boolean;
  promptBeforeSanitize?: string;
  visualAvoidUsed?: string[];
};

/** Bloque de texto para copiar en depuración (soporte / “Ver por qué” dev). */
export function buildBrainImagePromptDevTrace(d: BrainImageSuggestionDiagnostics): string {
  const axis = d.chosenVariationAxes;
  const axisLine = axis
    ? `Ejes crudos: subjectMode=${axis.subjectMode} · framing=${axis.framing} · environment=${axis.environment} · activity=${axis.activity} · propCluster=${axis.propCluster} · moodShift=${axis.moodShift}`
    : "(sin ejes en diagnóstico)";
  const sanitizations = [...(d.dangerousWordsRemoved ?? []), ...(d.dangerousWordsRemovedInPrompt ?? [])].filter(
    Boolean,
  );
  const warn = [...(d.contaminationWarnings ?? []), ...(d.incompatibleAxesWarnings ?? [])].filter(Boolean);

  return [
    "=== 1. PROMPT FINAL ENVIADO ===",
    d.finalPromptUsed ?? "",
    "",
    "=== 2. PROMPT ANTES DE SANITIZE ===",
    d.promptBeforeSanitize ?? "(no disponible en esta sugerencia; vuelve a generar con la versión actual de Brain)",
    "",
    "=== 3. DIFERENCIAS / PIPELINE ===",
    "Sustituciones y filtros (ejes + sanitización del prompt):",
    sanitizations.length ? sanitizations.join(", ") : "(ninguna registrada)",
    "",
    "Warnings (validación + reintentos de ejes):",
    warn.length ? warn.join("\n") : "(ninguno)",
    "",
    "Corporate / contexto:",
    [
      typeof d.corporateContextUsed === "boolean" ? `Bloque F (marca) con texto corporate: ${d.corporateContextUsed ? "sí" : "no"}` : "",
      typeof d.corporateContextLength === "number"
        ? `Longitud corporate en metadata de proyecto: ${d.corporateContextLength} caracteres`
        : "",
      d.corporateContextTruncatedForVisual ? "Corporate recortado al construir contexto visual: sí" : "Corporate recortado al construir contexto visual: no",
    ]
      .filter(Boolean)
      .join("\n") || "(sin datos)",
    "",
    typeof d.finalPromptWasRewritten === "boolean"
      ? `Pipeline reescribió o truncó el prompt: ${d.finalPromptWasRewritten ? "sí" : "no"}`
      : "",
    typeof d.promptLength === "number" ? `Longitud prompt final: ${d.promptLength} caracteres` : "",
    "",
    "=== 4. TERRITORIO VISUAL ===",
    d.visualTerritory ?? "—",
    d.axisPoolUsed ? `Pool de ejes: ${d.axisPoolUsed}` : "",
    "",
    "=== 5. VARIACIÓN ELEGIDA ===",
    d.variationFocus ?? "(ver línea de ejes crudos arriba)",
    axisLine,
    "",
    "=== 6. visualAvoid USADO (bloque E) ===",
    d.visualAvoidUsed?.length
      ? d.visualAvoidUsed.map((x) => ` - ${x}`).join("\n")
      : "(no listado; genera de nuevo las sugerencias)",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

const DEFAULT_VISUAL_AVOID: readonly string[] = [
  "stock corporate photography",
  "futuristic SaaS dashboard as hero",
  "generic glass office",
  "team smiling at tablet or screen",
  "over-polished startup stock photo",
  "blue tech gel lighting as main mood",
  "sterile empty workspace",
  "unrealistic glossy AI render",
  "screens and UI chrome as the main subject",
  "empty minimalism without cultural or tactile objects",
];

/**
 * Elige familia + ejes de variedad; reintenta si A2 contradice el territorio visual (deporte, cultura, producto, etc.)
 * salvo petición explícita de reunión/oficina en el texto del usuario.
 */
export function pickVarietyBundleForCompose(
  ctx: BrainVisualPromptContextResult,
  variety: BrainDesignerVarietyInput | undefined,
  planSeed: string,
  userTextForExplicitCheck: string,
): {
  pick: BrainVarietyPickResult;
  incompatibleAxesWarnings: string[];
  variationValidationAttempts: number;
} {
  const territory = ctx.visualTerritory;
  const explicit = userExplicitlyRequestsOfficeMeeting(userTextForExplicitCheck);
  const resolvedFamily = resolveFamilyIdFromTerritory(territory, variety?.familyId, planSeed);

  const dnaCtx = {
    subjects: ctx.subjects,
    mood: ctx.mood,
    composition: ctx.composition,
    visualStyleTags: ctx.visualStyleTags,
    environments: ctx.environments,
  };

  let axes = ctx.visualVariationAxes;
  if (explicit) {
    const base = getVariationAxesForTerritory(territory);
    const enriched = enrichVisualVariationAxesFromDna(base, dnaCtx, {
      strictSportPool: territory === "sport_performance",
      territory,
      signals: ctx.visualSemanticSignals,
      officeExplicitlyJustified: true,
    });
    axes = filterAxesForTerritory(enriched, territory, { explicitOffice: true }).axes;
  }

  let attempts = 0;
  const warnings: string[] = [];
  let seed = planSeed;
  let pick = pickBrainVariationBundle(axes, ctx, variety, seed, {
    resolvedFamilyUsed: resolvedFamily,
  });

  let v = validateVariationAgainstVisualCore(ctx.visualCore, pick.chosenVariationAxes, territory, {
    explicitWorkspaceMeetingRequest: explicit,
  });

  while (!v.ok && attempts < 12 && territoryNeedsVariationValidation(territory) && !explicit) {
    warnings.push(`incompatible_variation_axes:${v.reasons.join(";")}`);
    attempts++;
    seed = `${planSeed}|v${attempts}`;
    pick = pickBrainVariationBundle(axes, ctx, variety, seed, {
      resolvedFamilyUsed: resolvedFamily,
    });
    v = validateVariationAgainstVisualCore(ctx.visualCore, pick.chosenVariationAxes, territory, {
      explicitWorkspaceMeetingRequest: explicit,
    });
  }

  return { pick, incompatibleAxesWarnings: warnings, variationValidationAttempts: attempts };
}

function promptCoreSliceFromContext(ctx: BrainVisualPromptContextResult): PromptCoreSlice {
  const c = ctx.visualCore;
  return {
    generalTone: c.generalTone,
    styleSummary: c.styleSummary,
    paletteAndMaterials: c.paletteAndMaterials,
    lightingCharacter: c.lightingCharacter,
    brandFeeling: c.brandFeeling,
    confirmedPatternsBrief: c.confirmedPatternsBrief,
    mood: ctx.mood,
    visualStyleTags: ctx.visualStyleTags,
    colorPalette: ctx.colorPalette,
    textures: ctx.textures,
    lighting: ctx.lighting,
  };
}

function analysisQualityOk(a: BrainVisualImageAnalysis): boolean {
  const q = a.analysisQuality;
  if (!q || q === "specific" || q === "acceptable") return true;
  return false;
}

function slotIsVisionDerived(
  key: BrainVisualStyleSlotKey,
  slot: ProjectAssetsMetadata["strategy"]["visualStyle"][BrainVisualStyleSlotKey] | undefined,
): boolean {
  if (!slot?.description?.trim()) return false;
  if (slot.source === "manual") return true;
  const def = defaultBrainVisualStyle()[key];
  return slot.description.trim() !== def.description.trim();
}

/** Slot confirmado manualmente o derivado de visión real (no plantilla default). */
function slotIsUserOrVisionReal(
  key: BrainVisualStyleSlotKey,
  slot: ProjectAssetsMetadata["strategy"]["visualStyle"][BrainVisualStyleSlotKey] | undefined,
): boolean {
  if (!slot?.description?.trim()) return false;
  if (slot.source === "manual") return true;
  return slotIsVisionDerived(key, slot);
}

function uniqStrings(items: readonly string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const t = (raw || "").trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function collectLightingHints(analyses: BrainVisualImageAnalysis[]): string[] {
  const hints: string[] = [];
  for (const a of analyses) {
    const g = (a.graphicStyle || "").toLowerCase();
    const comp = (a.composition || []).join(" ").toLowerCase();
    const tags = (a.subjectTags ?? []).join(" ").toLowerCase();
    const moods = (a.mood ?? []).join(" ").toLowerCase();
    const blob = `${g} ${comp} ${tags} ${moods}`;
    if (blob.includes("natural light") || blob.includes("luz natural")) hints.push("luz natural");
    if (blob.includes("window light") || blob.includes("ventana")) hints.push("luz de ventana");
    if (blob.includes("flash") || blob.includes("editorial flash")) hints.push("flash editorial suave");
    if (blob.includes("golden hour") || blob.includes("hora dorada")) hints.push("luz cálida de interior");
  }
  return uniqStrings(hints, 6);
}

function collectEnvironmentHints(analyses: BrainVisualImageAnalysis[], agg: AggregatedVisualPatterns): string[] {
  const fromComp = agg.compositionNotes.filter((x) => /interior|espacio|mesa|estudio|habitación|sala|oficina casera/i.test(x));
  const fromSubjects = analyses.flatMap((a) => a.subjectTags ?? []).filter((x) =>
    /interior|mesa|estudio|habitación|sala|living|home office|loft/i.test(x),
  );
  return uniqStrings([...fromComp, ...fromSubjects], 12);
}

function collectTextureHints(analyses: BrainVisualImageAnalysis[], agg: AggregatedVisualPatterns): string[] {
  const graphic = analyses.flatMap((a) =>
    String(a.graphicStyle || "")
      .split(/[,;·]/g)
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return uniqStrings([...agg.graphicStyleNotes, ...graphic], 14);
}

function collectPeopleDetailLines(analyses: BrainVisualImageAnalysis[]): string[] {
  const out: string[] = [];
  for (const a of analyses) {
    const d = a.peopleDetail;
    if (!d || (d.present === false && !d.description?.trim())) continue;
    const bits = [
      d.description,
      ...(d.attitude ?? []),
      ...(d.pose ?? []),
      ...(d.energy ?? []),
      d.relationToCamera,
    ]
      .map((s) => String(s || "").trim())
      .filter(Boolean);
    if (bits.length) out.push(bits.join(", "));
  }
  return out.slice(0, 10);
}

function collectClothingDetailLines(analyses: BrainVisualImageAnalysis[]): string[] {
  const out: string[] = [];
  for (const a of analyses) {
    const d = a.clothingDetail;
    if (!d?.present) continue;
    const bits = [...(d.style ?? []), ...(d.colors ?? []), ...(d.textures ?? []), d.formality ? String(d.formality) : ""]
      .map((s) => String(s).trim())
      .filter(Boolean);
    if (bits.length) out.push(bits.join(", "));
  }
  return out.slice(0, 10);
}

function collectGraphicDetailLines(analyses: BrainVisualImageAnalysis[]): string[] {
  const out: string[] = [];
  for (const a of analyses) {
    const d = a.graphicDetail;
    if (!d?.present) continue;
    const bits = [
      ...(d.typography ?? []),
      ...(d.shapes ?? []),
      ...(d.iconography ?? []),
      ...(d.layout ?? []),
      ...(d.texture ?? []),
    ]
      .map((s) => String(s).trim())
      .filter(Boolean);
    if (bits.length) out.push(bits.join(", "));
  }
  return out.slice(0, 10);
}

/**
 * Contexto visual unificado para prompts de imagen (Brain Studio, Designer, Image Generator, etc.).
 * Prioriza ADN confirmado y análisis remotos fiables; el copy de marca queda secundario.
 */
export function buildBrainVisualPromptContext(
  assets: ProjectAssetsMetadata,
  options?: { slotKey?: BrainVisualStyleSlotKey },
): BrainVisualPromptContextResult {
  const strategy = assets.strategy;
  const layer = strategy.visualReferenceAnalysis;
  const rawAnalyses = layer?.analyses ?? [];
  const analyses = rawAnalyses.filter((a) => !isExcludedFromVisualDna(a));
  const trusted = analyses.filter(isTrustedRemoteVisionAnalysis).filter(analysisQualityOk);
  const confirmed = (layer?.confirmedVisualPatterns ?? []).map((s) => s.trim()).filter(Boolean);

  const coreTrusted = trusted.filter((a) => getEffectiveClassification(a) === "CORE_VISUAL_DNA");
  const projectTrusted = trusted.filter((a) => getEffectiveClassification(a) === "PROJECT_VISUAL_REFERENCE");
  const contextualTrusted = trusted.filter((a) => getEffectiveClassification(a) === "CONTEXTUAL_VISUAL_MEMORY");

  const primaryPool =
    coreTrusted.length || projectTrusted.length
      ? [...coreTrusted, ...projectTrusted]
      : contextualTrusted.length
        ? contextualTrusted
        : [];

  const aggTrusted = aggregateVisualPatterns(primaryPool.length ? primaryPool : trusted);
  const patternSummaryUsed = Boolean(
    (aggTrusted.patternSummary && aggTrusted.patternSummary.trim().length > 10) ||
      aggTrusted.narrativeSummary.trim().length > 12,
  );

  const vs = strategy.visualStyle;
  const slotKeys: BrainVisualStyleSlotKey[] = ["protagonist", "environment", "textures", "people"];
  const visionSlotsUsed = slotKeys.some((k) => slotIsUserOrVisionReal(k, vs[k]));
  /** Sin ADN confirmado, análisis remoto ni slots reales: el modelo tiende a «reunión en mesa»; lo tratamos en visualAvoid y en el compositor. */
  const visualContextWeak =
    confirmed.length === 0 && trusted.length === 0 && !visionSlotsUsed;
  const activeSlotKey = options?.slotKey;
  const slotExtra =
    activeSlotKey && slotIsUserOrVisionReal(activeSlotKey, vs[activeSlotKey])
      ? (vs[activeSlotKey]?.description || "").trim()
      : "";

  const sources: BrainVisualPromptSourcesUsed = {
    confirmedUserVisualDna: confirmed.length > 0,
    coreVisualReferenceAnalysis: coreTrusted.length > 0,
    projectVisualReferenceAnalysis: projectTrusted.length > 0,
    aggregatedPatternsTrusted:
      patternSummaryUsed && (primaryPool.length > 0 || trusted.length > 0),
    visionDerivedVisualStyleSlots: visionSlotsUsed,
    secondaryBrandStrategyText: false,
  };

  const subjects = uniqStrings(
    [
      ...confirmed,
      ...primaryPool.flatMap((a) => (a.subjectTags?.length ? a.subjectTags : [a.subject]).filter(Boolean)),
      ...(!primaryPool.length && trusted.length ? trusted.flatMap((a) => a.subjectTags ?? []) : []),
    ],
    40,
  );

  const mood = uniqStrings(
    [...primaryPool.flatMap((a) => a.mood), ...(!primaryPool.length ? trusted.flatMap((a) => a.mood) : [])],
    14,
  );

  const visualStyleTags = uniqStrings(
    [
      ...primaryPool.flatMap((a) => a.visualStyle),
      ...(!primaryPool.length ? trusted.flatMap((a) => a.visualStyle) : []),
      ...aggTrusted.recurringStyles,
    ],
    22,
  );

  const composition = uniqStrings(
    [
      ...primaryPool.flatMap((a) => a.composition),
      ...(!primaryPool.length ? trusted.flatMap((a) => a.composition) : []),
      ...aggTrusted.compositionNotes,
    ],
    18,
  );

  const colorPalette = uniqStrings(
    [
      ...primaryPool.flatMap((a) => a.colorPalette.dominant),
      ...(!primaryPool.length ? trusted.flatMap((a) => a.colorPalette.dominant) : []),
      ...aggTrusted.dominantPalette,
    ],
    16,
  );

  const clothingBits = (d: BrainVisualImageAnalysis["clothingDetail"]): string => {
    if (!d?.present) return "";
    const parts = [
      ...(d.style ?? []),
      ...(d.colors ?? []),
      ...(d.textures ?? []),
      d.formality ? String(d.formality) : "",
    ]
      .map((s) => String(s).trim())
      .filter(Boolean);
    return parts.join(", ");
  };

  const peopleAndWardrobe = uniqStrings(
    [
      ...primaryPool.map((a) => (a.peopleDetail?.description || a.people || "").trim()).filter(Boolean),
      ...primaryPool.map((a) => clothingBits(a.clothingDetail) || (a.clothingStyle || "").trim()).filter(Boolean),
      ...aggTrusted.peopleClothingNotes,
    ],
    12,
  );

  const analysisPool = primaryPool.length ? primaryPool : trusted;
  const objectsAndProps = uniqStrings(
    [
      ...analysisPool.flatMap((a) => a.brandSignals ?? []),
      ...analysisPool.flatMap((a) => a.possibleUse ?? []),
      ...analysisPool.flatMap((a) => a.subjectTags ?? []),
    ],
    32,
  );

  const environments = collectEnvironmentHints(analysisPool, aggTrusted);
  const lighting = collectLightingHints(analysisPool);
  const textures = collectTextureHints(analysisPool, aggTrusted);

  const visualMessage = uniqStrings(
    [
      ...primaryPool.flatMap((a) => a.visualMessage ?? []),
      ...(!primaryPool.length ? trusted.flatMap((a) => a.visualMessage ?? []) : []),
      ...aggTrusted.implicitBrandMessages,
    ],
    10,
  );

  const corporateRaw = (assets.knowledge.corporateContext || "").trim();
  const territoryInput: BrainVisualTerritoryInput = {
    subjects,
    mood,
    composition,
    visualStyleTags,
    visualMessage,
    peopleAndWardrobe,
    textures,
    objectsAndProps,
    confirmedPatterns: confirmed,
    patternSummary: aggTrusted.patternSummary ?? "",
    corporateBlob: corporateRaw,
    brandSignals: uniqStrings(analysisPool.flatMap((a) => a.brandSignals ?? []), 14),
    possibleUse: uniqStrings(analysisPool.flatMap((a) => a.possibleUse ?? []), 14),
    lightingHints: lighting,
    colorPaletteDominant: colorPalette,
    graphicStyleNotes: aggTrusted.graphicStyleNotes,
    compositionNotes: aggTrusted.compositionNotes,
    peopleClothingAggregateNotes: aggTrusted.peopleClothingNotes,
    narrativeSummary: aggTrusted.narrativeSummary,
    frequentSubjects: aggTrusted.frequentSubjects,
    recurringStyles: aggTrusted.recurringStyles,
    dominantMoodsAgg: aggTrusted.dominantMoods,
    peopleDetailLines: collectPeopleDetailLines(analysisPool),
    clothingDetailLines: collectClothingDetailLines(analysisPool),
    graphicDetailLines: collectGraphicDetailLines(analysisPool),
  };

  const visualSemanticSignals = extractVisualSemanticSignals(territoryInput);
  const visualTerritory = detectBrainVisualTerritory(territoryInput, visualSemanticSignals);
  const territoryJoinBlob = joinBlob(territoryInput);
  const visualSignalDiagnostics = summarizeVisualSignalDiagnostics(visualSemanticSignals);

  const taboo = [...(strategy.tabooPhrases ?? []), ...(strategy.forbiddenTerms ?? [])]
    .map((s) => s.trim())
    .filter(Boolean);

  const brandDnaAvoid = (
    strategy.visualReferenceAnalysis?.brandVisualDnaBundle?.brand_visual_dna.global_visual_rules.avoid ?? []
  )
    .map((s) => String(s).trim())
    .filter(Boolean);

  const doAvoid = uniqStrings([...taboo], 16);
  const doUse = uniqStrings(
    [
      ...(strategy.preferredTerms ?? []).slice(0, 8),
      ...filterLegacyLanguageTraits(strategy.languageTraits ?? []).slice(0, 4),
    ],
    12,
  );

  const visualAvoid = uniqStrings(
    [
      ...DEFAULT_VISUAL_AVOID,
      ...doAvoid,
      ...brandDnaAvoid.slice(0, 24),
      ...(visualContextWeak
        ? [
            "tres personas alrededor de una mesa de madera con papeles y ventana de fondo salvo que las referencias analizadas del proyecto lo muestren explícitamente",
            "reunión creativa de stock sobre mesa de madera con documentos esparcidos",
          ]
        : []),
      ...getTerritoryVisualAvoidExtras(visualTerritory),
    ],
    48,
  );

  const narrativeBlock =
    primaryPool.length || trusted.length
      ? buildSpanishTrustedVisualNarrative(primaryPool.length ? primaryPool : trusted, aggTrusted).text
      : "";

  const warnings: string[] = [];
  let brandMessageContext: string | undefined;
  let corporateContextTruncatedForVisual = false;
  if (corporateRaw.length > 60) {
    let bm = corporateRaw.slice(0, 480);
    const maxCorp =
      visualTerritory === "sport_performance" || visualTerritory === "luxury_product" ? 280 : 320;
    const tr = truncateCorporateForTerritoryVisual(bm, visualTerritory, maxCorp);
    bm = tr.text;
    if (tr.truncated) {
      corporateContextTruncatedForVisual = true;
      warnings.push("corporate_context_truncated_for_visual_generation");
    }
    brandMessageContext = bm;
    if (confirmed.length) {
      warnings.push(
        "Hay texto corporativo largo: no forma parte del bloque A; solo puede apoyar el mensaje (B) sin redefinir la estética porque existe ADN visual confirmado.",
      );
    } else if (!trusted.length) {
      warnings.push(
        "Sin ADN confirmado ni análisis visuales remotos: el contexto corporativo pesa más; conviene subir y reanalizar referencias.",
      );
    }
  }

  const directionParts: string[] = [];
  if (confirmed.length) {
    directionParts.push(
      `PRIORIDAD 1 — Patrones visuales confirmados por el usuario (imperativos sobre corporateContext y claims genéricos): ${confirmed.slice(0, 20).join(", ")}.`,
    );
  }
  if (narrativeBlock.trim()) directionParts.push(narrativeBlock.trim());
  if (aggTrusted.patternSummary?.trim() && !directionParts.some((p) => p.includes(aggTrusted.patternSummary!.trim()))) {
    directionParts.push(`Síntesis de patrones: ${aggTrusted.patternSummary.trim()}`);
  }
  if (slotExtra) {
    directionParts.push(`Bloque de dirección (${activeSlotKey}): ${slotExtra}`);
  }
  if (visionSlotsUsed && !slotExtra) {
    const slotBits = slotKeys
      .map((k) => (slotIsUserOrVisionReal(k, vs[k]) ? `${k}: ${(vs[k]?.description || "").trim()}` : ""))
      .filter(Boolean);
    if (slotBits.length) {
      directionParts.push(`Slots de dirección visual (manual o derivados de visión real): ${slotBits.join(" · ")}`);
    }
  }

  const brandVisualDnaSnippet = buildBrandVisualDnaPromptSnippet(strategy.visualReferenceAnalysis?.brandVisualDnaBundle);
  if (brandVisualDnaSnippet.trim()) {
    directionParts.push(brandVisualDnaSnippet.trim());
  }

  let visualDirection = directionParts.join("\n").trim();

  const hasStrongVisual =
    confirmed.length > 0 ||
    coreTrusted.length + projectTrusted.length > 0 ||
    trusted.length >= 2 ||
    (trusted.length === 1 && patternSummaryUsed);

  const textOnlyGeneration = !hasStrongVisual;

  let sourceTier: BrainSourceTier | "mixed" = "unknown";
  if (confirmed.length) sourceTier = "confirmed";
  else if (coreTrusted.length || projectTrusted.length) sourceTier = "visual_real";
  else if (trusted.length > 0 && patternSummaryUsed) sourceTier = "visual_real";
  else if (visionSlotsUsed) sourceTier = "heuristic";
  else if (trusted.length > 0) sourceTier = "mixed";
  else sourceTier = "default";

  let fallbackDefaultUsed = false;
  if (!visualDirection) {
    fallbackDefaultUsed = true;
    const fallbackBits = slotKeys
      .map((k) => `${(vs[k]?.description || defaultBrainVisualStyle()[k].description).trim()}`)
      .filter(Boolean);
    visualDirection = `No hay análisis visual remoto fiable todavía. Usa solo como guía débil (no sustituye referencias reales): ${fallbackBits.slice(0, 2).join(" · ")}`;
  }

  let sourceQuality: BrainVisualPromptSourceQuality = "text_only";
  if (confirmed.length && (coreTrusted.length || projectTrusted.length)) sourceQuality = "high";
  else if (confirmed.length || coreTrusted.length || projectTrusted.length) sourceQuality = "high";
  else if (primaryPool.length || trusted.length >= 2) sourceQuality = "medium";
  else if (trusted.length === 1 || visionSlotsUsed) sourceQuality = "low";

  if (textOnlyGeneration) sourceQuality = "text_only";

  const generalTone = mood.slice(0, 6).join(", ") || "contemporáneo, claro y honesto";
  const styleSummary = visualStyleTags.slice(0, 10).join(", ") || "coherente con referencias de marca";
  const paletteAndMaterials =
    uniqStrings([...colorPalette.slice(0, 10), ...textures.slice(0, 8)], 20).join(", ") ||
    "derivada de referencias analizadas";
  const lightingCharacter = lighting.join(", ") || "suave y creíble; evitar gel azul tech como protagonista";
  const vm = visualMessage.slice(0, 5).join(" · ").trim();
  const subjGlyph = subjects.slice(0, 10).join(", ");
  const brandFeeling =
    vm ||
    (subjGlyph
      ? `Matices de referencia (contexto de marca, no catálogo obligatorio de objetos): ${subjGlyph}`
      : "") ||
    (aggTrusted.patternSummary?.trim()?.slice(0, 220) ??
      "autenticidad frente a estética stock genérica");
  const confirmedPatternsBrief = confirmed.length ? confirmed.slice(0, 14).join(", ") : undefined;

  const visualCore: BrainVisualCore = {
    generalTone,
    styleSummary,
    paletteAndMaterials,
    lightingCharacter,
    brandFeeling,
    ...(confirmedPatternsBrief ? { confirmedPatternsBrief } : {}),
    visualAvoid: [...visualAvoid],
  };

  const axisPoolId = territoryAxisPoolId(visualTerritory);
  const baseVariationAxes = getVariationAxesForTerritory(visualTerritory);
  const officeVisualJustified = officeWorkspaceJustified(visualSemanticSignals, territoryJoinBlob);
  const enrichedAxes = enrichVisualVariationAxesFromDna(
    baseVariationAxes,
    {
      subjects,
      mood,
      composition,
      visualStyleTags,
      environments,
    },
    {
      strictSportPool: visualTerritory === "sport_performance",
      territory: visualTerritory,
      signals: visualSemanticSignals,
      officeExplicitlyJustified: officeVisualJustified,
    },
  );
  const filteredAxes = filterAxesForTerritory(enrichedAxes, visualTerritory, {
    explicitOffice: false,
  });
  const visualVariationAxes = filteredAxes.axes;
  const dangerousWordsRemovedFromAxes = filteredAxes.dangerousWordsRemoved;

  return {
    visualDirection,
    visualCore,
    visualVariationAxes,
    visualStyleTags,
    mood,
    subjects,
    environments,
    composition,
    lighting,
    colorPalette,
    peopleAndWardrobe,
    objectsAndProps,
    textures,
    visualMessage,
    doUse,
    doAvoid,
    visualAvoid,
    sourceQuality,
    sources,
    textOnlyGeneration,
    visualContextWeak,
    sourceTier,
    warnings,
    ...(brandMessageContext ? { brandMessageContext } : {}),
    visualReferenceAnalysisRealCount: trusted.length,
    patternSummaryUsed,
    fallbackDefaultUsed,
    visualTerritory,
    axisPoolId,
    corporateContextTruncatedForVisual,
    visualSemanticSignals,
    visualSignalDiagnostics,
    territoryJoinBlob,
    dangerousWordsRemovedFromAxes,
  };
}

/** Ensambla el prompt de slot Brain Studio: jerarquía directiva A–F (sin volcar todo el ADN). */
export function composeBrainVisualStyleSlotPrompt(params: {
  context: BrainVisualPromptContextResult;
  slotKey: BrainVisualStyleSlotKey;
  slotDescription: string;
  colorPrimary: string | null;
  colorSecondary: string | null;
  colorAccent: string | null;
  voiceHints?: string;
  termsHints?: string;
  msgHints?: string;
  variety?: BrainDesignerVarietyInput;
  varietyPlanSeed?: string;
}): string {
  const slotLabel =
    params.slotKey === "protagonist"
      ? "Protagonista"
      : params.slotKey === "environment"
        ? "Entorno"
        : params.slotKey === "textures"
          ? "Texturas"
          : "Personas";

  const voice = params.voiceHints?.trim() || "claro, honesto, contemporáneo";
  const terms = params.termsHints?.trim() || "coherencia con referencias y marca";
  const msgs = params.msgHints?.trim() || "mensaje propio de la marca";

  const definedColors = [params.colorPrimary, params.colorSecondary, params.colorAccent].filter(
    (c): c is string => typeof c === "string" && /^#[0-9A-Fa-f]{6}$/i.test(c.trim()),
  );
  const paletteLine =
    definedColors.length > 0
      ? `Paleta de marca (hex): primaria ${definedColors[0]}, secundaria ${definedColors[1] ?? "sin definir"}, acento ${definedColors[2] ?? "sin definir"}.`
      : "Paleta de marca: aún no hay colores definidos en Brain; elige tonos coherentes con las referencias subidas o neutros editoriales.";

  const ctx = params.context;
  const planSeed = params.varietyPlanSeed ?? `brain-slot|${params.slotKey}`;
  const { pick } = pickVarietyBundleForCompose(ctx, params.variety, planSeed, params.slotDescription || "");
  const intention = `${slotLabel}: ${params.slotDescription || "Mantener coherencia con el ADN anterior."}`;
  const brandContext = [paletteLine, `Tono de voz: ${voice}.`, `Términos: ${terms}.`, `Frases: ${msgs}.`]
    .join(" ")
    .slice(0, 420);

  const draft = buildDirectedArtVisualPromptDraft({
    intention,
    territory: ctx.visualTerritory,
    core: promptCoreSliceFromContext(ctx),
    variation: pick.chosenVariationAxes,
    territoryAvoidPlusGlobal: ctx.visualAvoid,
    brandContext,
  });
  const finalized = finalizeVisualPromptForModel(draft, ctx.visualTerritory, pick.chosenVariationAxes, {
    visualAvoid: ctx.visualAvoid,
    corporateSnippet: brandContext,
    userExplicitCorporateLanguage: userExplicitlyRequestsOfficeMeeting(params.slotDescription || ""),
  });
  return [
    finalized.prompt,
    "",
    "Notas técnicas: sin texto largo en la imagen ni marcas de agua. Si hay referencias adjuntas, úsalas como guía de materiales y luz; no copies composiciones que contradigan el bloque A–E.",
  ].join("\n");
}

export function composeBrainDesignerImagePrompt(params: {
  context: BrainVisualPromptContextResult;
  pieceMessage: string;
  pageContext: string;
  brandColorLine: string;
  logoBlock: string;
  featureLine?: string;
  differentiatorsLine?: string;
  metricsLine?: string;
  variety?: BrainDesignerVarietyInput;
  /** Semilla por plan/sugerencia para que cada imagen rote combinación. */
  varietyPlanSeed?: string;
  /** Si true, permite un prompt más largo (sigue sin volcar todo el ADN). */
  advancedLongPrompt?: boolean;
}): { prompt: string; diagnostics: BrainImageSuggestionDiagnostics } {
  const ctx = params.context;
  const warnTextOnly = ctx.textOnlyGeneration
    ? "AVISO: generación principalmente desde texto de marca; no hay ADN visual analizado fiable suficiente."
    : "";

  let secondaryCopy =
    !ctx.textOnlyGeneration && (params.featureLine || params.differentiatorsLine)
      ? [
          "Contexto de producto (no UI stock si contradice el territorio):",
          params.featureLine ? `Capacidades: ${params.featureLine}.` : "",
          params.differentiatorsLine ? `Diferenciales: ${params.differentiatorsLine}.` : "",
          params.metricsLine ? `Señales de mercado: ${params.metricsLine}.` : "",
        ]
          .filter(Boolean)
          .join(" ")
      : "";

  let productContextClamped = false;
  if (secondaryCopy.length > 260) {
    secondaryCopy = `${secondaryCopy.slice(0, 260).trimEnd()}…`;
    productContextClamped = true;
  }

  const userBlob = `${params.pieceMessage} ${params.pageContext}`;
  const explicitCorp = userExplicitlyRequestsOfficeMeeting(userBlob);

  const planSeed =
    params.varietyPlanSeed ?? `designer|${params.pieceMessage.slice(0, 48)}|${params.pageContext.slice(0, 32)}`;
  const varietyPick = pickVarietyBundleForCompose(ctx, params.variety, planSeed, userBlob);
  const pick = varietyPick.pick;

  const intention = [
    params.pieceMessage.trim(),
    params.pageContext.trim() ? `Página / layout: ${params.pageContext.trim().slice(0, 360)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const brandContext = twoSentencesMax(
    [ctx.brandMessageContext?.trim(), params.brandColorLine, params.logoBlock].filter(Boolean).join(" · "),
    360,
  );

  const visualAvoidUsed = getVisualAvoidSliceUsed(ctx.visualTerritory, ctx.visualAvoid);
  const draft = buildDirectedArtVisualPromptDraft({
    intention,
    territory: ctx.visualTerritory,
    core: promptCoreSliceFromContext(ctx),
    variation: pick.chosenVariationAxes,
    territoryAvoidPlusGlobal: ctx.visualAvoid,
    brandContext,
    productSecondaryOneLine: secondaryCopy || undefined,
    textOnlyWarning: warnTextOnly || undefined,
  });

  const finalized = finalizeVisualPromptForModel(draft, ctx.visualTerritory, pick.chosenVariationAxes, {
    visualAvoid: ctx.visualAvoid,
    corporateSnippet: ctx.brandMessageContext,
    userExplicitCorporateLanguage: explicitCorp,
    advancedLongPrompt: params.advancedLongPrompt,
  });

  const prompt = `${finalized.prompt}\n\nNota: si hay logo de referencia en la petición, usar solo ese logotipo; sin texto largo en la imagen.`;

  const corp = (ctx.brandMessageContext ?? "").trim();

  const diagnostics: BrainImageSuggestionDiagnostics = {
    finalPromptUsed: prompt,
    visualSourcesUsed: {
      ...ctx.sources,
      secondaryBrandStrategyText: secondaryCopy.length > 0,
    },
    visualReferenceAnalysisRealCount: ctx.visualReferenceAnalysisRealCount,
    confirmedVisualDnaUsed: ctx.sources.confirmedUserVisualDna,
    patternSummaryUsed: ctx.patternSummaryUsed,
    fallbackDefaultUsed: ctx.fallbackDefaultUsed,
    textOnlyGeneration: ctx.textOnlyGeneration,
    secondaryBrandProductCopy: secondaryCopy.length > 0,
    familyUsed: pick.familyUsed,
    varietyMode: pick.varietyMode,
    repeatedElementsAvoided: pick.repeatedElementsAvoided,
    chosenVariationAxes: pick.chosenVariationAxes,
    coreLockedFields: pick.coreLockedFields,
    visualTerritory: ctx.visualTerritory,
    axisPoolUsed: ctx.axisPoolId,
    excludedAxesNote: territoryExcludedAxesSummary(ctx.visualTerritory),
    incompatibleAxesWarnings:
      varietyPick.incompatibleAxesWarnings.length > 0 ? varietyPick.incompatibleAxesWarnings : undefined,
    corporateContextTruncatedForVisual:
      ctx.corporateContextTruncatedForVisual || productContextClamped || undefined,
    variationValidationAttempts:
      varietyPick.variationValidationAttempts > 0 ? varietyPick.variationValidationAttempts : undefined,
    dominantPeopleSignals: ctx.visualSignalDiagnostics.dominantPeopleSignals,
    dominantSpaceSignals: ctx.visualSignalDiagnostics.dominantSpaceSignals,
    dominantClothingSignals: ctx.visualSignalDiagnostics.dominantClothingSignals,
    dominantObjectSignals: ctx.visualSignalDiagnostics.dominantObjectSignals,
    dominantTextureSignals: ctx.visualSignalDiagnostics.dominantTextureSignals,
    dominantLightingSignals: ctx.visualSignalDiagnostics.dominantLightingSignals,
    dominantCompositionSignals: ctx.visualSignalDiagnostics.dominantCompositionSignals,
    dominantCulturalSignals: ctx.visualSignalDiagnostics.dominantCulturalSignals,
    dominantActivitySignals: ctx.visualSignalDiagnostics.dominantActivitySignals,
    dangerousWordsRemoved: [...ctx.dangerousWordsRemovedFromAxes, ...finalized.dangerousWordsRemovedInPrompt],
    promptLength: prompt.length,
    dangerousWordsRemovedInPrompt: finalized.dangerousWordsRemovedInPrompt,
    corporateContextUsed: corp.length > 0,
    corporateContextLength: corp.length,
    numberOfRequiredObjects: 1,
    variationFocus: buildVariationFocusLine(pick.chosenVariationAxes),
    contaminationWarnings:
      finalized.contaminationWarnings.length > 0 ? finalized.contaminationWarnings : undefined,
    finalPromptWasRewritten: finalized.finalPromptWasRewritten || undefined,
    promptBeforeSanitize: finalized.promptBeforeSanitize,
    visualAvoidUsed,
  };

  return { prompt, diagnostics };
}

/**
 * Prompt de imagen alineado con Brain: jerarquía A–F (intención usuario + territorio + núcleo compacto + variación única).
 */
export function composeBrainImageGeneratorPrompt(params: {
  assets: ProjectAssetsMetadata;
  userThemePrompt: string;
  variety?: BrainDesignerVarietyInput;
  varietyPlanSeed?: string;
  advancedLongPrompt?: boolean;
}): { prompt: string; diagnostics: BrainImageGeneratorPromptDiagnostics } {
  const ctx = buildBrainVisualPromptContext(params.assets);
  const theme = (params.userThemePrompt || "").trim();
  const warnTextOnly = ctx.textOnlyGeneration
    ? "AVISO: poca señal visual analizada en el proyecto; la estética dependerá más del texto. Conviene subir y reanalizar referencias en Brain."
    : "";

  const planSeed = params.varietyPlanSeed ?? `nano-banana|${theme.slice(0, 80)}`;
  const varietyPick = pickVarietyBundleForCompose(ctx, params.variety, planSeed, theme);
  const pick = varietyPick.pick;

  const intention =
    theme ||
    "(sin instrucción explícita de tema: mantén coherencia con el territorio visual y referencias del nodo.)";
  const explicitCorp = userExplicitlyRequestsOfficeMeeting(theme);

  const visualAvoidUsed = getVisualAvoidSliceUsed(ctx.visualTerritory, ctx.visualAvoid);
  const draft = buildDirectedArtVisualPromptDraft({
    intention,
    territory: ctx.visualTerritory,
    core: promptCoreSliceFromContext(ctx),
    variation: pick.chosenVariationAxes,
    territoryAvoidPlusGlobal: ctx.visualAvoid,
    brandContext: ctx.brandMessageContext?.trim() || "",
    textOnlyWarning: warnTextOnly || undefined,
  });

  const finalized = finalizeVisualPromptForModel(draft, ctx.visualTerritory, pick.chosenVariationAxes, {
    visualAvoid: ctx.visualAvoid,
    corporateSnippet: ctx.brandMessageContext,
    userExplicitCorporateLanguage: explicitCorp,
    advancedLongPrompt: params.advancedLongPrompt,
  });

  const prompt = `${finalized.prompt}\n\nReferencia: si hay imágenes conectadas al nodo, úsalas como guía de composición y luz coherente con A–E.`;

  const corp = (ctx.brandMessageContext ?? "").trim();

  const diagnostics: BrainImageGeneratorPromptDiagnostics = {
    finalPromptUsed: prompt,
    confirmedVisualPatternsUsed: ctx.sources.confirmedUserVisualDna,
    trustedVisualAnalysisCount: ctx.visualReferenceAnalysisRealCount,
    textOnlyGeneration: ctx.textOnlyGeneration,
    visualAvoid: [...ctx.visualAvoid],
    familyUsed: pick.familyUsed,
    varietyMode: pick.varietyMode,
    repeatedElementsAvoided: pick.repeatedElementsAvoided,
    chosenVariationAxes: pick.chosenVariationAxes,
    coreLockedFields: pick.coreLockedFields,
    visualTerritory: ctx.visualTerritory,
    axisPoolUsed: ctx.axisPoolId,
    excludedAxesNote: territoryExcludedAxesSummary(ctx.visualTerritory),
    incompatibleAxesWarnings:
      varietyPick.incompatibleAxesWarnings.length > 0 ? varietyPick.incompatibleAxesWarnings : undefined,
    corporateContextTruncatedForVisual: ctx.corporateContextTruncatedForVisual || undefined,
    variationValidationAttempts:
      varietyPick.variationValidationAttempts > 0 ? varietyPick.variationValidationAttempts : undefined,
    dominantPeopleSignals: ctx.visualSignalDiagnostics.dominantPeopleSignals,
    dominantSpaceSignals: ctx.visualSignalDiagnostics.dominantSpaceSignals,
    dominantClothingSignals: ctx.visualSignalDiagnostics.dominantClothingSignals,
    dominantObjectSignals: ctx.visualSignalDiagnostics.dominantObjectSignals,
    dominantTextureSignals: ctx.visualSignalDiagnostics.dominantTextureSignals,
    dominantLightingSignals: ctx.visualSignalDiagnostics.dominantLightingSignals,
    dominantCompositionSignals: ctx.visualSignalDiagnostics.dominantCompositionSignals,
    dominantCulturalSignals: ctx.visualSignalDiagnostics.dominantCulturalSignals,
    dominantActivitySignals: ctx.visualSignalDiagnostics.dominantActivitySignals,
    dangerousWordsRemoved: [...ctx.dangerousWordsRemovedFromAxes, ...finalized.dangerousWordsRemovedInPrompt],
    promptLength: prompt.length,
    dangerousWordsRemovedInPrompt: finalized.dangerousWordsRemovedInPrompt,
    corporateContextUsed: corp.length > 0,
    corporateContextLength: corp.length,
    numberOfRequiredObjects: 1,
    variationFocus: buildVariationFocusLine(pick.chosenVariationAxes),
    contaminationWarnings:
      finalized.contaminationWarnings.length > 0 ? finalized.contaminationWarnings : undefined,
    finalPromptWasRewritten: finalized.finalPromptWasRewritten || undefined,
    promptBeforeSanitize: finalized.promptBeforeSanitize,
    visualAvoidUsed,
  };

  return { prompt, diagnostics };
}

/**
 * Misma salida que `composeBrainImageGeneratorPrompt`, con diagnóstico enriquecido desde Brain Runtime Context.
 * El prompt sigue basándose en `buildBrainVisualPromptContext(assets)` (prioridad visión remota ya aplicada allí).
 */
export function composeBrainImageGeneratorPromptFromRuntimeContext(params: {
  assets: ProjectAssetsMetadata;
  brainRuntimeContext: BrainRuntimeContext;
  userThemePrompt: string;
  variety?: BrainDesignerVarietyInput;
  varietyPlanSeed?: string;
  advancedLongPrompt?: boolean;
}): { prompt: string; diagnostics: BrainImageGeneratorPromptDiagnostics } {
  const base = composeBrainImageGeneratorPrompt({
    assets: params.assets,
    userThemePrompt: params.userThemePrompt,
    variety: params.variety,
    varietyPlanSeed: params.varietyPlanSeed,
    advancedLongPrompt: params.advancedLongPrompt,
  });
  const analyses = params.assets.strategy.visualReferenceAnalysis?.analyses ?? [];
  const mockish = analyses.some((a) => a.visionProviderId === "mock" || a.analysisQuality === "mock");
  const ignoredMockSources = mockish && base.diagnostics.trustedVisualAnalysisCount > 0;
  const safeRules = params.assets.strategy.safeCreativeRules ?? params.brainRuntimeContext.safeCreativeRules;
  const safeAppendix = buildSafeCreativeRulesPromptAppendix(safeRules);
  const prompt = safeAppendix.length ? `${base.prompt}\n\n${safeAppendix}` : base.prompt;
  const trusted = analyses.filter(isTrustedRemoteVisionAnalysis).length;
  const visualSourcesUsedSummary = `trusted_remote=${trusted}; total_rows=${analyses.length}; mockish=${mockish ? "yes" : "no"}`;
  return {
    prompt,
    diagnostics: {
      ...base.diagnostics,
      finalPromptUsed: prompt,
      brainConnected: true,
      brainVersion: params.brainRuntimeContext.brainVersion,
      brainRuntimeContextSlices: params.brainRuntimeContext.contextSlices,
      brainRuntimeWarnings:
        params.brainRuntimeContext.warnings.length > 0 ? params.brainRuntimeContext.warnings : undefined,
      fallbackUsed: mockish || undefined,
      ignoredMockSources: ignoredMockSources || undefined,
      safeCreativeRulesApplied: Boolean(safeAppendix.length),
      safeCreativeAppendixLength: safeAppendix.length || undefined,
      visualSourcesUsedSummary,
    },
  };
}

export function composeBrainImageGeneratorPromptWithRuntime(params: {
  assets: ProjectAssetsMetadata;
  userThemePrompt: string;
  targetNodeId?: string;
  variety?: BrainDesignerVarietyInput;
  varietyPlanSeed?: string;
  advancedLongPrompt?: boolean;
}): { prompt: string; diagnostics: BrainImageGeneratorPromptDiagnostics } {
  const brainRuntimeContext = buildBrainRuntimeContext({
    assets: params.assets,
    targetNodeType: "imageGenerator",
    targetNodeId: params.targetNodeId,
    useCase: "image_generation",
  });
  return composeBrainImageGeneratorPromptFromRuntimeContext({
    assets: params.assets,
    brainRuntimeContext,
    userThemePrompt: params.userThemePrompt,
    variety: params.variety,
    varietyPlanSeed: params.varietyPlanSeed,
    advancedLongPrompt: params.advancedLongPrompt,
  });
}

export function buildVisualImageDiagnosticsFromContext(
  ctx: BrainVisualPromptContextResult,
  finalPromptUsed: string,
): BrainImageSuggestionDiagnostics {
  return {
    finalPromptUsed,
    visualSourcesUsed: ctx.sources,
    visualReferenceAnalysisRealCount: ctx.visualReferenceAnalysisRealCount,
    confirmedVisualDnaUsed: ctx.sources.confirmedUserVisualDna,
    patternSummaryUsed: ctx.patternSummaryUsed,
    fallbackDefaultUsed: ctx.fallbackDefaultUsed,
    textOnlyGeneration: ctx.textOnlyGeneration,
  };
}
