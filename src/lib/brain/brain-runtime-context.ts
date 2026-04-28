import type { ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
import type {
  BrainGuionistaRuntimePack,
  BrainRuntimeContext,
  BrainRuntimeVisualDnaLayer,
} from "./brain-creative-memory-types";
import { getBrainFreshnessSummary, getBrainVersion, normalizeBrainMeta } from "./brain-meta";
import { normalizeVisualDnaSlots } from "@/lib/brain/visual-dna-slot/normalize";
import type { VisualDnaLayer } from "@/lib/brain/visual-dna-slot/types";
import { buildSelectedVisualDnaSlotRuntimeView, summarizeVisualDnaSlots } from "@/lib/brain/visual-dna-slot/runtime-layer";

function isGuionistaTarget(t: string): boolean {
  const n = t.toLowerCase();
  return n.includes("guion") || n.includes("writer") || n.includes("script");
}

function buildGuionistaPack(assets: ProjectAssetsMetadata): BrainGuionistaRuntimePack | undefined {
  const cd = assets.strategy.contentDna;
  const cc = (assets.knowledge.corporateContext || "").trim();
  const excerpt = cc.length > 420 ? `${cc.slice(0, 417)}…` : cc || undefined;
  if (!cd && !assets.strategy.personas.length && !cc) return undefined;
  return {
    topics: cd?.topics ?? [],
    contentPillars: cd?.contentPillars ?? [],
    trendOpportunities: cd?.trendOpportunities ?? [],
    preferredFormats: cd?.preferredFormats ?? [],
    articleStructures: cd?.articleStructures ?? [],
    approvedClaims: cd?.approvedClaims ?? [],
    forbiddenClaims: cd?.forbiddenClaims ?? [],
    narrativeAngles: cd?.narrativeAngles ?? [],
    writingDo: cd?.writingDo ?? [],
    writingAvoid: cd?.writingAvoid ?? [],
    ctaStyle: cd?.ctaStyle,
    readingLevel: cd?.readingLevel,
    corporateExcerpt: excerpt,
  };
}

export function buildBrainRuntimeContext(input: {
  assets: ProjectAssetsMetadata;
  targetNodeType: string;
  targetNodeId?: string;
  flowNodes?: unknown;
  flowEdges?: unknown;
  projectScopeId?: string;
  useCase?: string;
  selectedVisualDnaSlotId?: string;
  selectedVisualDnaLayer?: VisualDnaLayer;
}): BrainRuntimeContext {
  void input.flowNodes;
  void input.flowEdges;
  const meta = normalizeBrainMeta(input.assets.brainMeta ?? undefined);
  const strategy = input.assets.strategy;
  const slices: string[] = [];
  const warnings: string[] = [];

  if (input.useCase) slices.push(`useCase:${input.useCase}`);
  if (meta.staleReasons.length) {
    warnings.push(...meta.staleReasons.slice(0, 6));
    slices.push(`freshness:${getBrainFreshnessSummary(meta)}`);
  }

  const node = input.targetNodeType.toLowerCase();
  const guionista = isGuionistaTarget(node);

  if (node.includes("image") || node === "imagegenerator") {
    slices.push("slice:brand_visual_dna", "slice:safe_generation", "slice:palette");
  } else if (node.includes("designer")) {
    slices.push("slice:brand", "slice:visual_dna", "slice:layout");
  } else if (guionista) {
    slices.push(
      "slice:voice",
      "slice:content_dna",
      "slice:knowledge",
      "slice:approved_claims",
      "slice:forbidden_claims",
      "slice:article_structures",
      "slice:safe_creative_rules",
    );
  } else if (node.includes("video")) {
    slices.push("slice:atmosphere", "slice:narrative", "slice:visual_dna");
  } else if (node.includes("photoroom") || node.includes("photo")) {
    slices.push("slice:product_language", "slice:visual_integration");
  } else {
    slices.push("slice:core_brain");
  }

  const avoid = [
    ...(strategy.tabooPhrases ?? []),
    ...(strategy.forbiddenTerms ?? []),
    ...(strategy.brandVisualDna?.globalVisualRules.avoid ?? []),
    ...(strategy.safeCreativeRules?.doNotGenerate ?? []),
  ]
    .map((s) => s.trim())
    .filter(Boolean);
  const uniqAvoid = Array.from(new Set(avoid)).slice(0, 48);

  const evidence = [
    ...(strategy.brandVisualDna?.evidence ?? []),
    ...(strategy.contentDna?.evidence ?? []),
    ...(strategy.safeCreativeRules?.evidence ?? []),
  ];

  const confidence =
    typeof strategy.brandVisualDna?.confidence === "number"
      ? strategy.brandVisualDna.confidence
      : typeof strategy.contentDna?.confidence === "number"
        ? strategy.contentDna.confidence
        : 0.45;

  const wantsVisualSlotContext =
    node.includes("designer") ||
    node.includes("photoroom") ||
    node.includes("photo") ||
    node.includes("nano") ||
    node.includes("image") ||
    node.includes("video");

  const visualDnaSlots = normalizeVisualDnaSlots(strategy.visualDnaSlots);
  const visualDnaSlotsSummary = wantsVisualSlotContext ? summarizeVisualDnaSlots(visualDnaSlots) : undefined;
  const selectedSlot =
    wantsVisualSlotContext && input.selectedVisualDnaSlotId
      ? visualDnaSlots.find((s) => s.id === input.selectedVisualDnaSlotId)
      : undefined;
  const selectedVisualDnaSlot = buildSelectedVisualDnaSlotRuntimeView(
    selectedSlot,
    input.selectedVisualDnaLayer as VisualDnaLayer | undefined,
  );
  if (visualDnaSlotsSummary?.length) {
    slices.push("slice:visual_dna_slots");
  }
  if (selectedVisualDnaSlot && input.selectedVisualDnaSlotId) {
    slices.push(`slice:visual_dna_slot:${input.selectedVisualDnaSlotId}`);
    if (input.selectedVisualDnaLayer) {
      slices.push(`slice:visual_dna_slot_layer:${input.selectedVisualDnaLayer}`);
    }
  }

  const knowledge =
    guionista
      ? {
          corporateContext: input.assets.knowledge.corporateContext,
          documentsAnalyzed: input.assets.knowledge.documents.filter((d) => d.status === "Analizado").length,
          documentTitles: input.assets.knowledge.documents
            .filter((d) => d.status === "Analizado")
            .slice(0, 12)
            .map((d) => ({ id: d.id, name: d.name, scope: d.scope })),
        }
      : {
          corporateContext: input.assets.knowledge.corporateContext,
          documentsAnalyzed: input.assets.knowledge.documents.filter((d) => d.status === "Analizado").length,
        };

  return {
    targetNodeType: input.targetNodeType,
    targetNodeId: input.targetNodeId,
    projectScopeId: input.projectScopeId,
    brainVersion: getBrainVersion(meta),
    contextSlices: slices,
    brand: input.assets.brand,
    voice: {
      examples: strategy.voiceExamples,
      traits: strategy.languageTraits,
      preferredTerms: strategy.preferredTerms,
      tabooPhrases: strategy.tabooPhrases,
      approvedPhrases: strategy.approvedPhrases,
    },
    knowledge,
    visualDna: strategy.brandVisualDna,
    contentDna: strategy.contentDna,
    safeCreativeRules: strategy.safeCreativeRules,
    productContext: strategy.messageBlueprints?.slice(0, 6),
    audience: strategy.personas,
    recommendations: strategy.approvedPatterns,
    ...(guionista ? { guionistaPack: buildGuionistaPack(input.assets) } : {}),
    ...(visualDnaSlotsSummary?.length ? { visualDnaSlotsSummary } : {}),
    ...(selectedVisualDnaSlot ? { selectedVisualDnaSlot } : {}),
    ...(input.selectedVisualDnaLayer && selectedVisualDnaSlot
      ? { selectedVisualDnaLayer: input.selectedVisualDnaLayer as BrainRuntimeVisualDnaLayer }
      : {}),
    avoid: uniqAvoid,
    evidence,
    confidence,
    warnings,
  };
}
