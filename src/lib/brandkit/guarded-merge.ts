import type {
  BrainVisualStyle,
  BrainVisualStyleSlotKey,
  ProjectAssetsMetadata,
  ProjectBrandKit,
} from "@/app/spaces/project-assets-metadata";
import { canWriteBrainScope } from "@/lib/brain/brain-scope-policy";
import type { ElementKey, EvidenceKind, BrandKitBoardMeta } from "./types";
import type { BrandPipelineMergeFieldLog, BrandPipelineMergeFieldOutcome } from "./brand-pipeline-diagnostics";
import { BRANDKIT_REF_CATEGORIES } from "./types";
import { referenceRuleElementKey } from "./element-registry";
import {
  applySynthesisToSidecar,
  getMeta,
  normalizeBrandKitBoardMeta,
  patchMeta,
  recountReview,
} from "./interpretation";
import { bootstrapSidecarFromAssets } from "./board-projection";

export type GuardedMergeOptions = {
  sourceId: string;
  evidenceKind: EvidenceKind;
  extractedAt?: string;
  /** Si false, no escribe raw en campos de marca (solo sidecar). */
  allowBrandWrites?: boolean;
};

export type GuardedMergeResult = {
  assets: ProjectAssetsMetadata;
  boardMeta: BrandKitBoardMeta;
  conflictsRaised: ElementKey[];
  blockedKeys: ElementKey[];
  mergeFieldLogs: BrandPipelineMergeFieldLog[];
  allowBrandWrites: boolean;
};

type FieldBinding = {
  key: ElementKey;
  scope: "brand" | "project";
  read: (assets: ProjectAssetsMetadata) => unknown;
  write: (assets: ProjectAssetsMetadata, value: unknown) => ProjectAssetsMetadata;
};

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

function cloneTraits(traits: string[]): string[] {
  return traits.map((t) => t.trim()).filter(Boolean);
}

type TypographyBindingSlot = "primary" | "secondary";

function readTypographyBinding(assets: ProjectAssetsMetadata, slot: TypographyBindingSlot): unknown {
  const strategy = assets.strategy as Record<string, unknown>;
  const typography = strategy.typography;
  if (!typography || typeof typography !== "object") return null;
  return (typography as Record<string, unknown>)[slot] ?? null;
}

function writeTypographyBinding(
  assets: ProjectAssetsMetadata,
  slot: TypographyBindingSlot,
  value: unknown,
): ProjectAssetsMetadata {
  const strategy = assets.strategy as Record<string, unknown>;
  const prevTypography =
    strategy.typography && typeof strategy.typography === "object"
      ? (strategy.typography as Record<string, unknown>)
      : {};
  return {
    ...assets,
    strategy: {
      ...assets.strategy,
      typography: {
        ...prevTypography,
        [slot]: value,
      },
    } as ProjectAssetsMetadata["strategy"],
  };
}

function buildFieldBindings(): FieldBinding[] {
  const bindings: FieldBinding[] = [
    {
      key: "messages.tagline",
      scope: "brand",
      read: (a) => a.knowledge.corporateContext?.trim() ?? "",
      write: (a, value) => ({
        ...a,
        knowledge: { ...a.knowledge, corporateContext: typeof value === "string" ? value : String(value ?? "") },
      }),
    },
    {
      key: "tone",
      scope: "brand",
      read: (a) => cloneTraits(a.strategy.languageTraits),
      write: (a, value) => ({
        ...a,
        strategy: {
          ...a.strategy,
          languageTraits: Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : a.strategy.languageTraits,
        },
      }),
    },
    {
      key: "logo.primary",
      scope: "brand",
      read: (a) => a.brand.logoPositive,
      write: (a, value) => ({
        ...a,
        brand: { ...a.brand, logoPositive: typeof value === "string" ? value : null },
      }),
    },
    {
      key: "logo.alt",
      scope: "brand",
      read: (a) => a.brand.logoNegative,
      write: (a, value) => ({
        ...a,
        brand: { ...a.brand, logoNegative: typeof value === "string" ? value : null },
      }),
    },
    {
      key: "palette.colorPrimary",
      scope: "brand",
      read: (a) => a.brand.colorPrimary,
      write: (a, value) => ({
        ...a,
        brand: { ...a.brand, colorPrimary: typeof value === "string" ? value : null },
      }),
    },
    {
      key: "palette.colorSecondary",
      scope: "brand",
      read: (a) => a.brand.colorSecondary,
      write: (a, value) => ({
        ...a,
        brand: { ...a.brand, colorSecondary: typeof value === "string" ? value : null },
      }),
    },
    {
      key: "palette.colorAccent",
      scope: "brand",
      read: (a) => a.brand.colorAccent,
      write: (a, value) => ({
        ...a,
        brand: { ...a.brand, colorAccent: typeof value === "string" ? value : null },
      }),
    },
    {
      key: "typography.primary",
      scope: "brand",
      read: (a) => readTypographyBinding(a, "primary"),
      write: (a, value) => writeTypographyBinding(a, "primary", value),
    },
    {
      key: "typography.secondary",
      scope: "brand",
      read: (a) => readTypographyBinding(a, "secondary"),
      write: (a, value) => writeTypographyBinding(a, "secondary", value),
    },
    {
      key: "voice.examples",
      scope: "brand",
      read: (a) => a.strategy.voiceExamples,
      write: (a, value) => ({
        ...a,
        strategy: {
          ...a.strategy,
          voiceExamples: Array.isArray(value)
            ? value.filter((item): item is ProjectAssetsMetadata["strategy"]["voiceExamples"][number] =>
                Boolean(item && typeof item === "object" && typeof (item as { text?: unknown }).text === "string"),
              )
            : a.strategy.voiceExamples,
        },
      }),
    },
  ];

  for (const category of BRANDKIT_REF_CATEGORIES) {
    bindings.push({
      key: referenceRuleElementKey(category),
      scope: "brand",
      read: (a) => a.strategy.visualStyle[category]?.description?.trim() ?? "",
      write: (a, value) => {
        const text = typeof value === "string" ? value : String(value ?? "");
        return {
          ...a,
          strategy: {
            ...a.strategy,
            visualStyle: {
              ...a.strategy.visualStyle,
              [category]: {
                ...a.strategy.visualStyle[category],
                description: text,
              },
            },
          },
        };
      },
    });
  }

  return bindings;
}

const FIELD_BINDINGS = buildFieldBindings();

function resolveBoardMeta(previous: ProjectAssetsMetadata): BrandKitBoardMeta {
  const persisted = previous.brainMeta?.boardMeta;
  if (persisted && Object.keys(persisted.interpretation ?? {}).length > 0) {
    return normalizeBrandKitBoardMeta(persisted);
  }
  return bootstrapSidecarFromAssets(previous);
}

function mergeEvidence(options: GuardedMergeOptions) {
  return [
    {
      sourceId: options.sourceId,
      kind: options.evidenceKind,
      confidence: 0.75,
      extractedAt: options.extractedAt ?? new Date().toISOString(),
    },
  ];
}

/**
 * Fusiona assets candidatos respetando sidecar validated → conflict (raw intacto).
 */
export function applyGuardedAssetMerge(
  previous: ProjectAssetsMetadata,
  candidate: ProjectAssetsMetadata,
  options: GuardedMergeOptions,
): GuardedMergeResult {
  let boardMeta = resolveBoardMeta(previous);
  let assets = previous;
  const conflictsRaised: ElementKey[] = [];
  const blockedKeys: ElementKey[] = [];
  const mergeFieldLogs: BrandPipelineMergeFieldLog[] = [];
  const allowBrandWrites = options.allowBrandWrites ?? canWriteBrainScope("brand", previous);

  for (const binding of FIELD_BINDINGS) {
    const candVal = binding.read(candidate);

    if (binding.scope === "brand" && !allowBrandWrites) {
      const prevVal = binding.read(previous);
      if (valuesEqual(prevVal, candVal)) {
        mergeFieldLogs.push({ key: binding.key, outcome: "descartado_igual" });
        continue;
      }
      boardMeta = applySynthesisToSidecar(boardMeta, prevVal, {
        key: binding.key,
        nextValue: candVal,
        evidence: mergeEvidence(options),
      });
      const status = getMeta(boardMeta, binding.key).status;
      if (status === "conflict") conflictsRaised.push(binding.key);
      blockedKeys.push(binding.key);
      mergeFieldLogs.push({
        key: binding.key,
        outcome: status === "conflict" ? "conflicto" : "solo_sidecar_brand_lock",
      });
      continue;
    }

    const prevVal = binding.read(assets);
    if (valuesEqual(prevVal, candVal)) {
      mergeFieldLogs.push({ key: binding.key, outcome: "descartado_igual" });
      continue;
    }

    const meta = getMeta(boardMeta, binding.key);
    if (meta.status === "validated") {
      boardMeta = applySynthesisToSidecar(boardMeta, prevVal, {
        key: binding.key,
        nextValue: candVal,
        evidence: mergeEvidence(options),
      });
      const nextStatus = getMeta(boardMeta, binding.key).status;
      if (nextStatus === "conflict") {
        conflictsRaised.push(binding.key);
        blockedKeys.push(binding.key);
      }
      mergeFieldLogs.push({
        key: binding.key,
        outcome: nextStatus === "conflict" ? "conflicto" : "validado_bloqueado",
      });
      continue;
    }

    assets = binding.write(assets, candVal);
    boardMeta = applySynthesisToSidecar(boardMeta, prevVal, {
      key: binding.key,
      nextValue: candVal,
      evidence: mergeEvidence(options),
    });
    mergeFieldLogs.push({ key: binding.key, outcome: "escrito_raw" });
  }

  return {
    assets: {
      ...assets,
      brainMeta: {
        ...assets.brainMeta,
        boardMeta,
      },
    },
    boardMeta,
    conflictsRaised,
    blockedKeys,
    mergeFieldLogs,
    allowBrandWrites,
  };
}

/** Reanalyze / visión: solo descripciones de visualStyle. */
export function applyGuardedVisualStyleMerge(
  previous: ProjectAssetsMetadata,
  candidateVisualStyle: BrainVisualStyle,
  options: GuardedMergeOptions,
): { visualStyle: BrainVisualStyle; boardMeta: BrandKitBoardMeta; conflictsRaised: ElementKey[] } {
  const candidate: ProjectAssetsMetadata = {
    ...previous,
    strategy: { ...previous.strategy, visualStyle: candidateVisualStyle },
  };
  const result = applyGuardedAssetMerge(previous, candidate, {
    ...options,
    evidenceKind: options.evidenceKind ?? "image-analysis",
  });
  return {
    visualStyle: result.assets.strategy.visualStyle,
    boardMeta: result.boardMeta,
    conflictsRaised: result.conflictsRaised.filter((k) => k.startsWith("references.")),
  };
}

export type AnalyzeMergeInput = {
  previous: ProjectAssetsMetadata;
  candidateStrategy: ProjectAssetsMetadata["strategy"];
  candidateCorporateContext: string;
  candidateBrand?: Partial<ProjectBrandKit>;
  options: GuardedMergeOptions;
};

export function applyGuardedAnalyzeMerge(input: AnalyzeMergeInput): GuardedMergeResult {
  const mergedTypography = mergeTypographyDraft(input.previous, input.candidateStrategy);
  const candidate: ProjectAssetsMetadata = {
    ...input.previous,
    brand: input.candidateBrand ? { ...input.previous.brand, ...input.candidateBrand } : input.previous.brand,
    knowledge: {
      ...input.previous.knowledge,
      corporateContext: input.candidateCorporateContext,
    },
    strategy: mergedTypography,
  };
  return applyGuardedAssetMerge(input.previous, candidate, input.options);
}

function mergeTypographyDraft(
  previous: ProjectAssetsMetadata,
  candidateStrategy: ProjectAssetsMetadata["strategy"],
): ProjectAssetsMetadata["strategy"] {
  const prev = previous.strategy as Record<string, unknown>;
  const next = candidateStrategy as Record<string, unknown>;
  const prevTypography =
    prev.typography && typeof prev.typography === "object"
      ? (prev.typography as Record<string, unknown>)
      : {};
  const nextTypography =
    next.typography && typeof next.typography === "object"
      ? (next.typography as Record<string, unknown>)
      : {};
  if (Object.keys(nextTypography).length === 0) return candidateStrategy;
  return {
    ...candidateStrategy,
    typography: {
      ...prevTypography,
      ...nextTypography,
    },
  } as ProjectAssetsMetadata["strategy"];
}

export function markSidecarValidatedOnManualWrite(
  boardMeta: BrandKitBoardMeta,
  key: ElementKey,
): BrandKitBoardMeta {
  const meta = getMeta(boardMeta, key);
  if (meta.status === "validated") return boardMeta;
  const interpretation = {
    ...boardMeta.interpretation,
    [key]: {
      ...meta,
      status: "validated" as const,
      validatedAt: new Date().toISOString(),
      conflict: undefined,
    },
  };
  return {
    ...boardMeta,
    interpretation,
    review: recountReview(interpretation),
  };
}

const TYPOGRAPHY_LLM_KEYS = ["typography.primary", "typography.secondary"] as const;

/** Marca tipografía de visión como proposed con evidencia llm-synthesis (§1 encargo). */
export function applyTypographyLlmSynthesisSidecar(
  boardMeta: BrandKitBoardMeta,
  input: {
    sourceId: string;
    confidence?: number;
    extractedAt?: string;
  },
): BrandKitBoardMeta {
  const extractedAt = input.extractedAt ?? new Date().toISOString();
  const evidence = [
    {
      sourceId: input.sourceId,
      kind: "llm-synthesis" as const,
      detail: "pdf-typography-vision-fallback",
      confidence: input.confidence ?? 0.42,
      extractedAt,
    },
  ];
  let next = boardMeta;
  for (const key of TYPOGRAPHY_LLM_KEYS) {
    const meta = getMeta(next, key);
    if (meta.status === "validated" || meta.status === "ghost") continue;
    next = patchMeta(next, key, {
      ...meta,
      status: "proposed",
      confidence: input.confidence ?? 0.42,
      evidence,
      proposedAt: extractedAt,
    });
  }
  return next;
}

export { FIELD_BINDINGS };
