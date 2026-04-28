import type { AggregatedVisualPatterns, BrainVisualReferenceLayer } from "@/app/spaces/project-assets-metadata";
import { isTrustedRemoteVisionAnalysis } from "@/lib/brain/brain-brand-summary";
import type { BrainAnalysisOrigin, BrainBrandVisualDna, BrandVisualStyleCluster } from "./brain-creative-memory-types";
import { randomUUID } from "crypto";

const BRAND_VISUAL_DNA_SCHEMA = "1.0.0";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function normalizeBrandVisualDna(raw: unknown): BrainBrandVisualDna | undefined {
  if (!isRecord(raw)) return undefined;
  const schemaVersion = typeof raw.schemaVersion === "string" ? raw.schemaVersion : BRAND_VISUAL_DNA_SCHEMA;
  const coreStyle = typeof raw.coreStyle === "string" ? raw.coreStyle.trim() : undefined;
  const secondaryStyles = Array.isArray(raw.secondaryStyles)
    ? raw.secondaryStyles
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((s) => s.trim())
    : [];
  const clustersRaw = Array.isArray(raw.styleClusters) ? raw.styleClusters : [];
  const styleClusters: BrandVisualStyleCluster[] = clustersRaw
    .filter(isRecord)
    .map((c) => ({
      id: typeof c.id === "string" ? c.id : randomUUID(),
      label: typeof c.label === "string" ? c.label : "cluster",
      weightHint: typeof c.weightHint === "number" ? c.weightHint : undefined,
      keywords: Array.isArray(c.keywords) ? c.keywords.filter((x): x is string => typeof x === "string") : [],
    }))
    .filter((c) => c.label.trim().length > 0);
  const g = raw.globalVisualRules && isRecord(raw.globalVisualRules) ? raw.globalVisualRules : {};
  const globalVisualRules = {
    dominantColors: Array.isArray(g.dominantColors) ? g.dominantColors.filter((x): x is string => typeof x === "string") : [],
    dominantMood: Array.isArray(g.dominantMood) ? g.dominantMood.filter((x): x is string => typeof x === "string") : [],
    dominantLighting: Array.isArray(g.dominantLighting) ? g.dominantLighting.filter((x): x is string => typeof x === "string") : [],
    dominantComposition: Array.isArray(g.dominantComposition)
      ? g.dominantComposition.filter((x): x is string => typeof x === "string")
      : [],
    dominantPeopleStrategy: typeof g.dominantPeopleStrategy === "string" ? g.dominantPeopleStrategy : undefined,
    dominantProductStrategy: typeof g.dominantProductStrategy === "string" ? g.dominantProductStrategy : undefined,
    brandFeeling: Array.isArray(g.brandFeeling) ? g.brandFeeling.filter((x): x is string => typeof x === "string") : [],
    safeGenerationRules: Array.isArray(g.safeGenerationRules)
      ? g.safeGenerationRules.filter((x): x is string => typeof x === "string")
      : [],
    avoid: Array.isArray(g.avoid) ? g.avoid.filter((x): x is string => typeof x === "string") : [],
  };
  const evidence = Array.isArray(raw.evidence) ? raw.evidence : [];
  const confidence = typeof raw.confidence === "number" && Number.isFinite(raw.confidence) ? raw.confidence : 0.5;
  const out: BrainBrandVisualDna = {
    schemaVersion,
    coreStyle,
    secondaryStyles,
    styleClusters,
    globalVisualRules,
    peopleLanguage: raw.peopleLanguage,
    productLanguage: raw.productLanguage,
    evidence: evidence.filter(isRecord).map((e) => ({
      id: typeof e.id === "string" ? e.id : randomUUID(),
      sourceType:
        e.sourceType === "document" ||
        e.sourceType === "image" ||
        e.sourceType === "url" ||
        e.sourceType === "manual" ||
        e.sourceType === "analysis" ||
        e.sourceType === "fallback" ||
        e.sourceType === "mock"
          ? e.sourceType
          : "analysis",
      sourceId: typeof e.sourceId === "string" ? e.sourceId : undefined,
      field: typeof e.field === "string" ? e.field : undefined,
      reason: typeof e.reason === "string" ? e.reason : "evidence",
      confidence: typeof e.confidence === "number" ? e.confidence : undefined,
      createdAt: typeof e.createdAt === "string" ? e.createdAt : undefined,
      brainVersion: typeof e.brainVersion === "number" ? e.brainVersion : undefined,
    })),
    confidence,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    provider: typeof raw.provider === "string" ? raw.provider : undefined,
    analysisOrigin: raw.analysisOrigin as BrainAnalysisOrigin | undefined,
  };
  if (!out.coreStyle && !out.secondaryStyles.length && !out.styleClusters.length && !out.globalVisualRules.dominantColors.length) {
    return undefined;
  }
  return out;
}

/**
 * Construye la síntesis oficial priorizando `visualReferenceAnalysis` (visión remota de confianza)
 * y usando agregados; el bundle técnico `brandVisualDnaBundle` refuerza reglas globales si existen.
 */
export function buildBrandVisualDnaFromVisualReferenceAnalysis(
  layer: BrainVisualReferenceLayer | undefined,
  opts?: { brainVersion?: number },
): BrainBrandVisualDna | null {
  if (!layer) return null;
  const analyses = layer.analyses ?? [];
  const trusted = analyses.filter(isTrustedRemoteVisionAnalysis);
  const agg: AggregatedVisualPatterns | undefined = layer.aggregated;
  const bundleRules = layer.brandVisualDnaBundle?.brand_visual_dna?.global_visual_rules;
  const bundleAvoid = bundleRules?.avoid?.map((x) => String(x).trim()).filter(Boolean) ?? [];
  const bundleSafe = bundleRules?.safe_generation_rules?.map((x) => String(x).trim()).filter(Boolean) ?? [];

  const dominantColors = [
    ...(agg?.dominantPalette ?? []),
    ...(agg?.dominantSecondaryPalette ?? []).slice(0, 4),
  ].slice(0, 14);
  const dominantMood = (agg?.dominantMoods ?? []).slice(0, 10);
  const dominantLighting = trusted.flatMap((a) => a.mood ?? []).slice(0, 8);
  const dominantComposition = [...(agg?.compositionNotes ?? []), ...trusted.flatMap((a) => a.composition ?? [])].slice(
    0,
    12,
  );
  const brandFeeling = (agg?.implicitBrandMessages ?? []).slice(0, 10);
  const secondaryStyles = (agg?.recurringStyles ?? []).slice(0, 12);
  const coreStyle = agg?.patternSummary?.trim() || agg?.narrativeSummary?.trim().slice(0, 280) || undefined;

  const styleClusters: BrandVisualStyleCluster[] = [];
  let idx = 0;
  for (const style of secondaryStyles.slice(0, 5)) {
    styleClusters.push({
      id: `cluster-${idx++}`,
      label: style,
      keywords: dominantMood.slice(0, 4),
    });
  }

  const remoteReal = trusted.length > 0;
  const mockish = analyses.some((a) => a.visionProviderId === "mock" || a.analysisQuality === "mock");
  const analysisOrigin: BrainAnalysisOrigin = remoteReal ? "remote_ai" : mockish ? "mock" : "local_heuristic";
  const provider = layer.lastVisionProviderId === "gemini-vision"
    ? "gemini"
    : layer.lastVisionProviderId === "openai-vision"
      ? "openai"
      : "internal";

  const evidence = trusted.slice(0, 8).map((a) => ({
    id: randomUUID(),
    sourceType: "image" as const,
    sourceId: a.sourceAssetId,
    field: "visual_reference_analysis",
    reason: `Fila de referencia visual analizada (${a.visionProviderId ?? "unknown"}).`,
    confidence: typeof a.coherenceScore === "number" ? a.coherenceScore : 0.55,
    brainVersion: opts?.brainVersion,
  }));

  const confidence = remoteReal ? Math.min(0.92, 0.45 + trusted.length * 0.04) : mockish ? 0.22 : 0.48;

  const dna: BrainBrandVisualDna = {
    schemaVersion: BRAND_VISUAL_DNA_SCHEMA,
    coreStyle,
    secondaryStyles,
    styleClusters,
    globalVisualRules: {
      dominantColors,
      dominantMood,
      dominantLighting,
      dominantComposition,
      brandFeeling,
      safeGenerationRules: [
        ...bundleSafe,
        "Abstrae patrones visuales reutilizables; no copies piezas ni campañas concretas.",
        "No uses nombres de marcas externas como estilo ni clones de fotógrafos o IPs.",
      ].slice(0, 24),
      avoid: [
        ...bundleAvoid,
        "clonar composiciones literales de referencias",
        "recrear prompts que identifiquen piezas concretas de terceros",
      ].slice(0, 28),
    },
    evidence,
    confidence,
    updatedAt: layer.lastAnalyzedAt ?? new Date().toISOString(),
    provider,
    analysisOrigin,
  };

  if (!coreStyle && !secondaryStyles.length && !dominantColors.length) {
    return null;
  }
  return dna;
}
