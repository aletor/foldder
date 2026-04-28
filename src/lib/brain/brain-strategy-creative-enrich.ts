import type { BrainStrategy, KnowledgeDocumentEntry } from "@/app/spaces/project-assets-metadata";
import type { BrainAnalysisOrigin, BrainMeta } from "./brain-creative-memory-types";
import { buildBrandVisualDnaFromVisualReferenceAnalysis } from "./brain-brand-visual-dna-synthesis";
import { buildContentDnaFromBrainSources } from "./brain-content-dna-from-sources";
import { inferWeakestContentSignalOrigin, mergeContentDnaWithPriority } from "./brain-merge-content-dna-priority";
import { mergeSafeCreativeRulesWithPriority } from "./brain-merge-safe-creative-rules-priority";
import { buildSafeCreativeRulesFromAssets } from "./brain-safe-creative-rules";
import { getBrainVersion } from "./brain-meta";

/**
 * Capas creativas persistibles tras análisis de conocimiento / visión.
 * `buildAutofillStrategy` sigue siendo el motor principal de voz y mensajes;
 * aquí solo sintetizamos ADN visual oficial, content DNA editorial y reglas seguras.
 */
export function enrichStrategyCreativeMemory(
  strategy: BrainStrategy,
  input?: {
    brainMeta?: BrainMeta | null;
    knowledgeDocuments?: KnowledgeDocumentEntry[];
    corporateContext?: string;
    /** Origen del lote actual (analyze); si no se pasa, se infiere desde `knowledgeDocuments`. */
    incomingCreativeSignalOrigins?: {
      contentDna?: BrainAnalysisOrigin;
      safeCreativeRules?: BrainAnalysisOrigin;
    };
  },
): BrainStrategy {
  const bv = getBrainVersion(input?.brainMeta ?? undefined);
  const brandVisualDna =
    buildBrandVisualDnaFromVisualReferenceAnalysis(strategy.visualReferenceAnalysis, { brainVersion: bv }) ??
    strategy.brandVisualDna;
  const docs = input?.knowledgeDocuments ?? [];
  const weakest = inferWeakestContentSignalOrigin(docs);
  const incomingContentOrigin = input?.incomingCreativeSignalOrigins?.contentDna ?? weakest;
  const incomingSafeOrigin = input?.incomingCreativeSignalOrigins?.safeCreativeRules ?? weakest;

  const builtContentDna = buildContentDnaFromBrainSources({
    documents: docs,
    corporateContext: input?.corporateContext ?? "",
    strategy,
    existingContentDna: strategy.contentDna,
    brainVersion: bv,
  });
  const contentDna = mergeContentDnaWithPriority({
    existingContentDna: strategy.contentDna,
    incomingContentDna: builtContentDna,
    sourceContext: { incomingOrigin: incomingContentOrigin },
  });

  const builtSafe = buildSafeCreativeRulesFromAssets({
    strategy,
    brandVisualDna: brandVisualDna ?? undefined,
  });
  const safeCreativeRules = mergeSafeCreativeRulesWithPriority({
    existingSafeCreativeRules: strategy.safeCreativeRules,
    incomingSafeCreativeRules: builtSafe,
    sourceContext: { incomingOrigin: incomingSafeOrigin },
  });
  return {
    ...strategy,
    ...(brandVisualDna ? { brandVisualDna } : {}),
    contentDna,
    safeCreativeRules,
  };
}
