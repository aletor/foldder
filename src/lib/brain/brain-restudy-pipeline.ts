import { normalizeProjectAssets, type BrainVisionProviderId, type ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
import { buildBrainBrandSummary, isTrustedRemoteVisionAnalysis } from "./brain-brand-summary";
import { countVisualImageAnalysisDisposition } from "./brain-learning-provenance";
import { defaultBrainService } from "./brain-service";
import {
  aggregateVisualPatterns,
  createVisualLearningCandidates,
} from "./brain-visual-analysis";
import { annotateAnalysesWithQuality, validateVisualAnalysisSpecificity } from "./brain-visual-analysis-quality";
import { hydrateProjectAssetsForBrainVision } from "./brain-visual-assets-hydrate";
import { reanalyzeVisualReferencesAsync } from "./brain-vision-analyze-async";
import { createBrainVisionProviderForRestudy } from "./brain-vision-providers-impl";
import {
  pruneVisualReferenceAnalysesForRestudy,
  shouldPrunePendingLearningRow,
  stripLegacyEnglishFromStrategy,
} from "./brain-restudy-cleanup";
import { ApiServiceDisabledError, assertApiServiceEnabled } from "@/lib/api-usage-controls";
import {
  buildVisualStyleFromVisionAnalyses,
  mergeVisualStyleWithVisionDerivedDescriptions,
} from "./brain-visual-style-from-vision";
import { canWriteBrainScope, BRAIN_BRAND_LOCKED_MESSAGE } from "./brain-scope-policy";

export type BrainRestudyProviderChoice = "gemini" | "openai" | "mock";

export type BrainRestudyOptionsInput = {
  clearPendingLearnings?: boolean;
  clearMockVisualAnalyses?: boolean;
  clearLegacyEnglishCopy?: boolean;
  reanalyzeCoreDocuments?: boolean;
  reanalyzeVisualReferences?: boolean;
  rebuildAggregatedVisualPatterns?: boolean;
  rebuildBrandSummary?: boolean;
  createPendingCandidates?: boolean;
  provider?: BrainRestudyProviderChoice;
  /** Muestra subjectTags/visualStyle de hasta 3 imágenes y exige algo no genérico en al menos una. */
  devValidateThreeImages?: boolean;
};

export type BrainRestudyStep = { step: string; ok: boolean; detail?: string };

function withDefaults(o: BrainRestudyOptionsInput | undefined) {
  return {
    clearPendingLearnings: o?.clearPendingLearnings ?? true,
    clearMockVisualAnalyses: o?.clearMockVisualAnalyses ?? true,
    clearLegacyEnglishCopy: o?.clearLegacyEnglishCopy ?? true,
    reanalyzeCoreDocuments: o?.reanalyzeCoreDocuments ?? true,
    reanalyzeVisualReferences: o?.reanalyzeVisualReferences ?? true,
    rebuildAggregatedVisualPatterns: o?.rebuildAggregatedVisualPatterns ?? true,
    rebuildBrandSummary: o?.rebuildBrandSummary ?? true,
    createPendingCandidates: o?.createPendingCandidates ?? true,
    provider: (o?.provider ?? "gemini") as BrainRestudyProviderChoice,
    devValidateThreeImages: o?.devValidateThreeImages ?? false,
  };
}

export async function runBrainRestudyPipeline(input: {
  origin: string;
  cookieHeader: string | null;
  projectId: string;
  workspaceId?: string | null;
  userEmail: string;
  assetsRaw: unknown;
  options?: BrainRestudyOptionsInput;
}): Promise<{
  ok: boolean;
  steps: BrainRestudyStep[];
  visual: {
    totalImages: number;
    analyzedReal: number;
    fallback: number;
    failed: number;
    tooGeneric: number;
    mock: number;
    provider: string;
  };
  documents: {
    totalCoreDocuments: number;
    analyzed: number;
    failed: number;
  };
  summary: {
    identityNarrative: string;
    tone: string;
    messages: string;
    visualDirection: string;
    confidence: number;
    warnings: string[];
  };
  candidatesCreated: number;
  warnings: string[];
  nextAssets: ReturnType<typeof normalizeProjectAssets>;
  traceability: Record<string, unknown>;
  devValidation?: {
    samples: Array<{ sourceAssetId: string; subjectTags: string[]; visualStyle: string[]; quality: string }>;
    passed: boolean;
    warning?: string;
  };
}> {
  const opt = withDefaults(input.options);
  const steps: BrainRestudyStep[] = [];
  const warnings: string[] = [];
  let working = normalizeProjectAssets(input.assetsRaw ?? {});
  const brandLocked = !canWriteBrainScope("brand", working);

  const cleanupFlags = {
    clearPendingLearnings: opt.clearPendingLearnings,
    clearMockVisualAnalyses: opt.clearMockVisualAnalyses,
    clearLegacyEnglishCopy: opt.clearLegacyEnglishCopy,
    treatAsSpanishProject: opt.clearLegacyEnglishCopy,
  };

  try {
    if (opt.clearPendingLearnings) {
      const { removed } = defaultBrainService.devRemovePendingLearningsIf(input.projectId, (row) =>
        shouldPrunePendingLearningRow(row, cleanupFlags),
      );
      steps.push({ step: "clear_pending_learnings", ok: true, detail: `removed=${removed}` });
    } else {
      steps.push({ step: "clear_pending_learnings", ok: true, detail: "skipped" });
    }

    if (opt.clearLegacyEnglishCopy && !brandLocked) {
      working = normalizeProjectAssets({
        ...working,
        strategy: stripLegacyEnglishFromStrategy(working.strategy),
      });
      steps.push({ step: "strip_legacy_strategy_copy", ok: true });
    } else if (opt.clearLegacyEnglishCopy && brandLocked) {
      warnings.push(BRAIN_BRAND_LOCKED_MESSAGE);
      steps.push({ step: "strip_legacy_strategy_copy", ok: true, detail: "skipped_brand_locked" });
    } else {
      steps.push({ step: "strip_legacy_strategy_copy", ok: true, detail: "skipped" });
    }

    if (opt.clearMockVisualAnalyses) {
      const pruned = pruneVisualReferenceAnalysesForRestudy(
        working.strategy.visualReferenceAnalysis?.analyses,
        true,
      );
      working = normalizeProjectAssets({
        ...working,
        strategy: {
          ...working.strategy,
          visualReferenceAnalysis: {
            ...working.strategy.visualReferenceAnalysis,
            analyses: pruned,
            aggregated: aggregateVisualPatterns(pruned),
          },
        },
      });
      steps.push({ step: "prune_mock_fallback_visual_rows", ok: true, detail: `rows=${pruned.length}` });
    } else {
      steps.push({ step: "prune_mock_fallback_visual_rows", ok: true, detail: "skipped" });
    }

    const coreDocs = working.knowledge.documents.filter((d) => d.scope === "core");
    let coreAnalyzed = coreDocs.filter((d) => d.status === "Analizado").length;

    if (opt.reanalyzeCoreDocuments && coreDocs.length && !brandLocked) {
      try {
        const url = `${input.origin.replace(/\/$/, "")}/api/spaces/brain/knowledge/analyze`;
        const docsPayload = working.knowledge.documents.map((d) =>
          d.scope === "core" ? { ...d, status: "Subido" as const } : d,
        );
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(input.cookieHeader ? { Cookie: input.cookieHeader } : {}),
          },
          body: JSON.stringify({
            documents: docsPayload,
            strategy: working.strategy,
            projectId: input.projectId,
            workspaceId: input.workspaceId ?? undefined,
          }),
        });
        const json = (await res.json()) as {
          documents?: ProjectAssetsMetadata["knowledge"]["documents"];
          strategy?: ProjectAssetsMetadata["strategy"];
          corporateContext?: string;
          error?: string;
        };
        if (!res.ok) {
          steps.push({
            step: "reanalyze_core_documents",
            ok: false,
            detail: json.error ?? res.statusText,
          });
          warnings.push(`Documentos CORE: ${json.error ?? "fallo al reanalizar"}`);
        } else {
          working = normalizeProjectAssets({
            ...working,
            knowledge: {
              ...working.knowledge,
              documents: json.documents ?? working.knowledge.documents,
              corporateContext: json.corporateContext ?? working.knowledge.corporateContext,
            },
            strategy: json.strategy ?? working.strategy,
          });
          const after = working.knowledge.documents.filter((d) => d.scope === "core");
          coreAnalyzed = after.filter((d) => d.status === "Analizado").length;
          steps.push({ step: "reanalyze_core_documents", ok: true, detail: `analyzed=${coreAnalyzed}` });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        steps.push({ step: "reanalyze_core_documents", ok: false, detail: msg });
        warnings.push(`Documentos CORE: ${msg}`);
      }
    } else {
      steps.push({
        step: "reanalyze_core_documents",
        ok: true,
        detail: brandLocked && coreDocs.length ? "skipped_brand_locked" : coreDocs.length ? "skipped" : "no_core_docs",
      });
    }

    let providerId = "mock";

    if (opt.reanalyzeVisualReferences) {
  working = await hydrateProjectAssetsForBrainVision(working, input.userEmail);
      const provider = createBrainVisionProviderForRestudy(opt.provider);
      providerId = provider.id;
      let visionGateOk = true;
      try {
        if (provider.id === "openai-vision") {
          await assertApiServiceEnabled("openai-vision-analysis");
        } else if (provider.id === "gemini-vision") {
          await assertApiServiceEnabled("gemini-vision-analysis");
        }
      } catch (e) {
        if (e instanceof ApiServiceDisabledError) {
          visionGateOk = false;
          warnings.push(`Visión: API bloqueada (${e.label}).`);
          steps.push({ step: "vision_provider_gate", ok: false, detail: e.label });
        } else {
          throw e;
        }
      }

      if (visionGateOk) {
        try {
          const { layer, providerId: pid } = await reanalyzeVisualReferencesAsync(input.projectId, working, {
            provider,
            userEmail: input.userEmail,
            route: "/api/spaces/brain/restudy",
            forceRestudy: true,
          });
          providerId = pid;
          const analysesQ = opt.rebuildAggregatedVisualPatterns
            ? annotateAnalysesWithQuality(layer.analyses)
            : layer.analyses;
          const aggregated = opt.rebuildAggregatedVisualPatterns
            ? aggregateVisualPatterns(analysesQ)
            : (layer.aggregated ?? aggregateVisualPatterns(analysesQ));
          const analyzerVersion = provider.id === "mock" ? "mock-1" : `${provider.id}-v1`;
          const nextLayer = {
            ...layer,
            analyses: analysesQ,
            aggregated,
            analyzerVersion,
            lastVisionProviderId: pid as BrainVisionProviderId,
          };
          working = normalizeProjectAssets({
            ...working,
            strategy: {
              ...working.strategy,
              visualReferenceAnalysis: nextLayer,
            },
          });
          const derivedVs = buildVisualStyleFromVisionAnalyses(nextLayer.analyses);
          if (derivedVs) {
            working = normalizeProjectAssets({
              ...working,
              strategy: {
                ...working.strategy,
                visualStyle: mergeVisualStyleWithVisionDerivedDescriptions(working.strategy.visualStyle, derivedVs),
              },
            });
          }
          steps.push({ step: "reanalyze_visual_references", ok: true, detail: `provider=${providerId}` });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          steps.push({ step: "reanalyze_visual_references", ok: false, detail: msg });
          warnings.push(`Visión: ${msg}`);
        }
      }
    } else {
      steps.push({ step: "reanalyze_visual_references", ok: true, detail: "skipped" });
    }

    const disp = countVisualImageAnalysisDisposition(working.strategy.visualReferenceAnalysis?.analyses);
    const analyses = working.strategy.visualReferenceAnalysis?.analyses ?? [];
    let tooGenericTotal = 0;
    let mockTier = 0;
    for (const a of analyses) {
      const q = a.analysisQuality ?? validateVisualAnalysisSpecificity(a);
      if (q === "too_generic") tooGenericTotal += 1;
      if (q === "mock") mockTier += 1;
    }
    if (tooGenericTotal > 0 && disp.realRemoteAnalyzed > 0) {
      warnings.push(
        `${tooGenericTotal} fila(s) marcadas como «demasiado genéricas» tras la heurística de especificidad (revisar prompts o proveedor).`,
      );
    }

    let candidatesCreated = 0;
    if (opt.createPendingCandidates) {
      const agg = working.strategy.visualReferenceAnalysis?.aggregated ?? aggregateVisualPatterns(analyses);
      const cands = createVisualLearningCandidates(input.projectId, analyses, agg);
      if (cands.length) {
        const { ids } = await defaultBrainService.createLearningCandidates(input.projectId, cands, {
          workspaceId: input.workspaceId ?? undefined,
          nodeId: undefined,
          telemetryNodeType: undefined,
        });
        candidatesCreated = ids.length;
      }
      steps.push({ step: "create_pending_candidates", ok: true, detail: `n=${candidatesCreated}` });
    } else {
      steps.push({ step: "create_pending_candidates", ok: true, detail: "skipped" });
    }

    const brand = opt.rebuildBrandSummary ? buildBrainBrandSummary(working) : null;
    if (brand) {
      steps.push({ step: "rebuild_brand_summary", ok: true });
    } else {
      steps.push({ step: "rebuild_brand_summary", ok: true, detail: "skipped" });
    }

    const summaryWarnings = [
      ...warnings,
      ...(brand?.identityNarrative.warnings ?? []),
      ...(brand?.tone.warnings ?? []),
      ...(brand?.messages.warnings ?? []),
      ...(brand?.visualDirection.warnings ?? []),
    ];
    const confidence =
      (working.strategy.visualReferenceAnalysis?.aggregated?.patternConfidence ?? 0.45) *
      (disp.realRemoteAnalyzed > 0 ? 1 : 0.35);

    let devValidation: {
      samples: Array<{ sourceAssetId: string; subjectTags: string[]; visualStyle: string[]; quality: string }>;
      passed: boolean;
      warning?: string;
    } | undefined;

    if (opt.devValidateThreeImages) {
      const pool = analyses.filter((a) => isTrustedRemoteVisionAnalysis(a));
      const picks = pool.slice(0, 3);
      const samples = picks.map((a) => ({
        sourceAssetId: a.sourceAssetId,
        subjectTags: a.subjectTags ?? [],
        visualStyle: a.visualStyle ?? [],
        quality: validateVisualAnalysisSpecificity(a),
      }));
      const passed = samples.some((s) => s.quality !== "too_generic" && s.quality !== "failed" && s.quality !== "mock");
      devValidation = {
        samples,
        passed,
        ...(!passed && samples.length
          ? {
              warning:
                "Brain necesita una relectura visual más específica. El proveedor devolvió análisis genérico en la muestra.",
            }
          : {}),
      };
      if (!passed && samples.length && devValidation.warning) {
        warnings.push(devValidation.warning);
      }
    }

    const traceability: Record<string, unknown> = {
      ...(brand?.diagnostics ?? {}),
      restudyProvider: providerId,
      visualQuality: {
        tooGenericRows: tooGenericTotal,
        mockTierRows: mockTier,
      },
    };

    const finalCoreDocs = working.knowledge.documents.filter((d) => d.scope === "core");
    const fatal = steps.some((s) => s.step === "fatal" && !s.ok);
    return {
      ok: !fatal,
      steps,
      visual: {
        totalImages: disp.totalRows,
        analyzedReal: disp.realRemoteAnalyzed,
        fallback: disp.fallbackOrMockAnalyzed,
        failed: disp.failed,
        tooGeneric: tooGenericTotal,
        mock: mockTier,
        provider: providerId,
      },
      documents: {
        totalCoreDocuments: finalCoreDocs.length,
        analyzed: finalCoreDocs.filter((d) => d.status === "Analizado").length,
        failed: finalCoreDocs.filter((d) => d.status === "Error").length,
      },
      summary: {
        identityNarrative: brand?.identityNarrative.value ?? "",
        tone: brand?.tone.value ?? "",
        messages: brand?.messages.value ?? "",
        visualDirection: brand?.visualDirection.value ?? "",
        confidence,
        warnings: summaryWarnings,
      },
      candidatesCreated,
      warnings: summaryWarnings,
      nextAssets: working,
      traceability,
      ...(devValidation ? { devValidation } : {}),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warnings.push(msg);
    steps.push({ step: "fatal", ok: false, detail: msg });
    return {
      ok: false,
      steps,
      visual: {
        totalImages: 0,
        analyzedReal: 0,
        fallback: 0,
        failed: 0,
        tooGeneric: 0,
        mock: 0,
        provider: "mock",
      },
      documents: { totalCoreDocuments: 0, analyzed: 0, failed: 0 },
      summary: {
        identityNarrative: "",
        tone: "",
        messages: "",
        visualDirection: "",
        confidence: 0,
        warnings,
      },
      candidatesCreated: 0,
      warnings,
      nextAssets: working,
      traceability: {},
    };
  }
}
