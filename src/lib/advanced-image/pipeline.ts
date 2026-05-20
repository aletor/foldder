import {
  computeFinalImageStateHash,
  computeGeminiGenerationStateHash,
  isAdvancedImageGlobalAdjustmentActive,
  isAdvancedImageGlobalAdjustmentPending,
  listAdvancedImageSessionInvariantViolations,
  stableHash,
  type AdvancedImageBox,
  type AdvancedImageCorrection,
  type AdvancedImageIdentityAnchor,
  type AdvancedImageIntegrationCategory,
  type AdvancedImageMaster,
  type AdvancedImageSession,
  type AdvancedImageUserReferenceGrid,
  type AdvancedImageZone,
} from "./domain";
import { buildAdvancedImageMaskSvgDataUrl, computeZoneOverlapMetrics, deriveMaskHashFromSvg, buildAdvancedImageMaskSvg } from "./mask";

export type AdvancedImagePipelineBaseImage = {
  contentHash: string;
  height: number;
  imageUrl: string;
  masterId: string;
  s3Key?: string;
  width: number;
};

export const ADVANCED_IMAGE_INTEGRATION_PROMPT_VERSION = "v3-integration-contracts";

export type AdvancedImagePipelineReferenceRole = "direction" | "identity" | "mask";

export type AdvancedImagePipelineReference = {
  correctionId: string;
  hash: string;
  id: string;
  label: string;
  layout?: AdvancedImageUserReferenceGrid["layout"];
  priorityReasons: string[];
  role: AdvancedImagePipelineReferenceRole;
  sourceImageCount?: number;
  s3Key?: string;
  url: string;
};

export type AdvancedImagePromptCorrectionBlock = {
  correctionId: string;
  dependencies: string[];
  dependencySources?: AdvancedImagePromptDependencySource[];
  identityDescription?: string;
  integrationAvoidList?: string[];
  integrationCategory?: AdvancedImageIntegrationCategory;
  integrationContract?: string;
  integrationOriginalElement?: string;
  integrationTargetElement?: string;
  instruction: string;
  originalReferenceId?: string;
  originalReferenceLayout?: AdvancedImageUserReferenceGrid["layout"];
  originalReferenceRole?: "direction";
  originalReferenceSourceImageCount?: number;
  phase: "apply" | "combined" | "preserve";
  pinMode: AdvancedImageCorrection["pinMode"];
  referenceLayout?: AdvancedImageUserReferenceGrid["layout"];
  referenceId?: string;
  referenceRole?: AdvancedImagePipelineReferenceRole;
  referenceSourceImageCount?: number;
  maskReferenceId?: string;
  zone: AdvancedImagePromptZone;
};

export type AdvancedImagePromptDependencySource = {
  correctionId: string;
  dependencyReason: string;
  identityDescription?: string;
  integrationAvoidList?: string[];
  integrationCategory?: AdvancedImagePromptCorrectionBlock["integrationCategory"];
  integrationContract?: string;
  integrationOriginalElement?: string;
  integrationTargetElement?: string;
  instruction: string;
  originalReferenceId?: string;
  originalReferenceLayout?: AdvancedImageUserReferenceGrid["layout"];
  originalReferenceRole?: "direction";
  originalReferenceSourceImageCount?: number;
  pinMode: AdvancedImageCorrection["pinMode"];
  referenceId?: string;
  referenceRole?: AdvancedImagePipelineReferenceRole;
  zone: AdvancedImagePromptZone;
};

export type AdvancedImagePromptZone = {
  areaRatio: number;
  bbox: AdvancedImageBox;
  description: string;
  normalizedBBox: AdvancedImageBox;
};

export type AdvancedImageStructuredPrompt = {
  blocks: AdvancedImagePromptCorrectionBlock[];
  finalInstruction: string;
  globalAdjustmentText?: string;
  promptText: string;
};

export type AdvancedImagePostCompositeStep = {
  bbox: AdvancedImageBox;
  correctionId: string;
  cropHash: string;
  cropS3Key?: string;
  cropUrl: string;
  featherPx: number;
};

export type AdvancedImageGenerationPlan = {
  activeCorrectionIds: string[];
  appliedPreserveCorrectionIds: string[];
  baseImage: AdvancedImagePipelineBaseImage;
  batchPendingIds: string[];
  cacheKeys: {
    finalImage: string;
    geminiRaw: string;
  };
  consolidationRecommended: boolean;
  directionReferences: AdvancedImagePipelineReference[];
  finalImageStateHash: string;
  geminiStateHash: string;
  globalAdjustmentActive: boolean;
  globalAdjustmentPending: boolean;
  globalAdjustmentText?: string;
  identityReferences: AdvancedImagePipelineReference[];
  omittedDirectionReferenceCorrectionIds: string[];
  omittedIdentityReferenceCorrectionIds: string[];
  omittedMaskReferenceCorrectionIds: string[];
  maskReferences: AdvancedImagePipelineReference[];
  postCompositeSteps: AdvancedImagePostCompositeStep[];
  prompt: AdvancedImageStructuredPrompt;
  promptVersion: string;
  referenceLimit: number;
  model: string;
  resolution: string;
};

export type AdvancedImagePipelineIssue = {
  code:
    | "BATCH_PENDING_CORRECTION_NOT_FOUND"
    | "DEPENDENCY_INACTIVE"
    | "DEPENDENCY_MISSING"
    | "SESSION_INVARIANT_FAILED";
  correctionId?: string;
  dependencyId?: string;
  detail: string;
};

export type AdvancedImageGenerationPlanResult =
  | { ok: true; plan: AdvancedImageGenerationPlan }
  | { issues: AdvancedImagePipelineIssue[]; ok: false };

export type AdvancedImageBuildGenerationPlanOptions = {
  batchPendingIds?: string[];
  featherPx?: number;
};

export function buildAdvancedImageGenerationPlan(
  session: AdvancedImageSession,
  options: AdvancedImageBuildGenerationPlanOptions = {},
): AdvancedImageGenerationPlanResult {
  const invariantIssues = listAdvancedImageSessionInvariantViolations(session);
  if (invariantIssues.length > 0) {
    return {
      issues: invariantIssues.map((issue) => ({
        code: "SESSION_INVARIANT_FAILED",
        correctionId: issue.correctionId,
        detail: `${issue.code}: ${issue.detail}`,
      })),
      ok: false,
    };
  }

  const active = activeCorrections(session);
  const pendingIds = options.batchPendingIds
    ? uniqueOrdered(options.batchPendingIds)
    : getAdvancedImagePendingCorrectionIds(session);
  const activeIds = new Set(active.map((correction) => correction.id));
  const missingPendingId = pendingIds.find((id) => !activeIds.has(id));
  if (missingPendingId) {
    return {
      issues: [
        {
          code: "BATCH_PENDING_CORRECTION_NOT_FOUND",
          correctionId: missingPendingId,
          detail: "Every batch pending correction must exist and be active to build a generation plan.",
        },
      ],
      ok: false,
    };
  }
  const pendingIdSet = new Set(pendingIds);
  const pendingCorrections = active.filter((correction) => pendingIdSet.has(correction.id));
  const appliedCorrections = active.filter((correction) => !pendingIdSet.has(correction.id));
  const globalAdjustmentText = (session.globalAdjustment?.text ?? "").trim().replace(/\s+/g, " ");
  const globalAdjustmentActive = isAdvancedImageGlobalAdjustmentActive(session);
  const globalAdjustmentPending = isAdvancedImageGlobalAdjustmentPending(session);

  const dependencyIssues = findDependencyIssues(active);
  if (dependencyIssues.length > 0) return { issues: dependencyIssues, ok: false };

  const strongDependencySourcesByPendingId = resolveStrongAppliedDependencySources(appliedCorrections, pendingCorrections);
  const strongDependencySourceIds = new Set(
    [...strongDependencySourcesByPendingId.values()].flatMap((sources) => sources.map((source) => source.correction.id)),
  );
  const configuredReferenceImages = Math.max(1, session.generationSettings.maxReferenceImages || 8);
  const maxReferenceImages = Math.min(
    configuredReferenceImages,
    operationalReferenceLimitForModel(session.generationSettings.model),
  );
  const referenceSelection = selectOperationalReferences({
    appliedCorrections,
    maxReferenceImages,
    pendingCorrections,
    strongDependencySourceIds,
  });
  const selectedReferenceCount =
    referenceSelection.identityReferences.length +
    referenceSelection.directionReferences.length;
  const maskSelection = selectMaskReferences({
    activeCorrections: active,
    maxMaskImages: Math.max(0, maxReferenceImages - selectedReferenceCount),
    pendingIdSet,
  });

  const postCompositeSteps = active
    .filter((correction) => correction.pinMode === "composite" && correction.identityAnchor)
    .map((correction) => postCompositeStepFromCorrection(correction, options.featherPx ?? 12));
  const prompt = buildStructuredPrompt({
    active,
    appliedCorrections,
    directionReferences: referenceSelection.directionReferences,
    identityReferences: referenceSelection.identityReferences,
    maskReferences: maskSelection.maskReferences,
    master: session.master,
    pendingCorrections,
    strongDependencySourcesByPendingId,
    globalAdjustmentText: globalAdjustmentActive ? globalAdjustmentText : undefined,
  });
  const appliedPreserveCorrectionIds = prompt.blocks
    .filter((block) => block.phase === "preserve")
    .map((block) => block.correctionId);

  const referenceCount =
    referenceSelection.identityReferences.length +
    referenceSelection.directionReferences.length +
    maskSelection.maskReferences.length;
  const geminiStateHash = stableHash({
    appliedPreserveCorrectionIds,
    baseGeminiStateHash: computeGeminiGenerationStateHash(session),
    batchPendingIds: pendingCorrections.map((correction) => correction.id),
    directionReferences: referenceSelection.directionReferences.map((ref) => [ref.id, ref.hash]),
    globalAdjustment: {
      text: globalAdjustmentActive ? globalAdjustmentText : "",
    },
    identityReferences: referenceSelection.identityReferences.map((ref) => [ref.id, ref.hash]),
    maskReferences: maskSelection.maskReferences.map((ref) => [ref.id, ref.hash]),
    omittedDirectionReferenceCorrectionIds: referenceSelection.omittedDirectionReferenceCorrectionIds,
    omittedIdentityReferenceCorrectionIds: referenceSelection.omittedIdentityReferenceCorrectionIds,
    omittedMaskReferenceCorrectionIds: maskSelection.omittedMaskReferenceCorrectionIds,
    promptText: prompt.promptText,
    promptVersion: ADVANCED_IMAGE_INTEGRATION_PROMPT_VERSION,
  });
  const finalImageStateHash = stableHash({
    baseFinalImageStateHash: computeFinalImageStateHash(session),
    geminiStateHash,
    postCompositeSteps: postCompositeSteps.map((step) => [step.correctionId, step.cropHash, step.featherPx]),
  });
  return {
    ok: true,
    plan: {
      activeCorrectionIds: active.map((correction) => correction.id),
      appliedPreserveCorrectionIds,
      baseImage: baseImageFromMaster(session.master),
      batchPendingIds: pendingCorrections.map((correction) => correction.id),
      cacheKeys: {
        finalImage: `advanced-image/final/${finalImageStateHash}`,
        geminiRaw: `advanced-image/gemini/${geminiStateHash}`,
      },
      consolidationRecommended:
        referenceSelection.omittedIdentityReferenceCorrectionIds.length > 0 ||
        referenceSelection.omittedDirectionReferenceCorrectionIds.length > 0 ||
        maskSelection.omittedMaskReferenceCorrectionIds.length > 0 ||
        referenceCount >= maxReferenceImages,
      directionReferences: referenceSelection.directionReferences,
      finalImageStateHash,
      geminiStateHash,
      globalAdjustmentActive,
      globalAdjustmentPending,
      globalAdjustmentText: globalAdjustmentActive ? globalAdjustmentText : undefined,
      identityReferences: referenceSelection.identityReferences,
      omittedDirectionReferenceCorrectionIds: referenceSelection.omittedDirectionReferenceCorrectionIds,
      omittedIdentityReferenceCorrectionIds: referenceSelection.omittedIdentityReferenceCorrectionIds,
      omittedMaskReferenceCorrectionIds: maskSelection.omittedMaskReferenceCorrectionIds,
      maskReferences: maskSelection.maskReferences,
      postCompositeSteps,
      prompt,
      promptVersion: ADVANCED_IMAGE_INTEGRATION_PROMPT_VERSION,
      referenceLimit: maxReferenceImages,
      model: session.generationSettings.model,
      resolution: session.generationSettings.resolution,
    },
  };
}

export function getAdvancedImageActiveCorrections(session: AdvancedImageSession): AdvancedImageCorrection[] {
  return activeCorrections(session);
}

export function getAdvancedImagePendingCorrectionIds(session: AdvancedImageSession): string[] {
  return activeCorrections(session)
    .filter((correction) => !isCorrectionAppliedToWorking(correction, session))
    .map((correction) => correction.id);
}

export function isCorrectionAppliedToWorking(
  correction: AdvancedImageCorrection,
  session: AdvancedImageSession,
): boolean {
  if (correction.status !== "active") return false;
  const working = session.workingImage;
  if (!working?.activeCorrectionIds.includes(correction.id)) return false;
  const snapshot = working.correctionSnapshots?.[correction.id];
  if (!snapshot) return true;
  return (
    snapshot.geometryHash === correction.geometryHash &&
    snapshot.instructionHash === correction.instructionHash &&
    snapshot.referenceHash === correction.referenceHash
  );
}

function activeCorrections(session: AdvancedImageSession): AdvancedImageCorrection[] {
  return session.corrections
    .filter((correction) => correction.status === "active")
    .slice()
    .sort((a, b) => a.order - b.order);
}

function uniqueOrdered(ids: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function findDependencyIssues(active: AdvancedImageCorrection[]): AdvancedImagePipelineIssue[] {
  const byId = new Map(active.map((correction) => [correction.id, correction]));
  const issues: AdvancedImagePipelineIssue[] = [];
  for (const correction of active) {
    for (const dependencyId of correction.dependencies) {
      if (!byId.has(dependencyId)) {
        issues.push({
          code: "DEPENDENCY_INACTIVE",
          correctionId: correction.id,
          dependencyId,
          detail: `Active correction '${correction.id}' requires active dependency '${dependencyId}'.`,
        });
      }
    }
  }
  return issues;
}

type AdvancedImageReferenceCandidate = {
  correction: AdvancedImageCorrection;
  priorityScore: number;
  priorityTier: number;
  reference: AdvancedImagePipelineReference;
  stableOrder: number;
};

function selectOperationalReferences(args: {
  appliedCorrections: AdvancedImageCorrection[];
  maxReferenceImages: number;
  pendingCorrections: AdvancedImageCorrection[];
  strongDependencySourceIds?: Set<string>;
}): {
  directionReferences: AdvancedImagePipelineReference[];
  identityReferences: AdvancedImagePipelineReference[];
  omittedDirectionReferenceCorrectionIds: string[];
  omittedIdentityReferenceCorrectionIds: string[];
} {
  const pendingDirectionCandidates: AdvancedImageReferenceCandidate[] = args.pendingCorrections
    .filter((correction) => correction.userReference)
    .map((correction, index) => ({
      correction,
      priorityScore: 0,
      priorityTier: 1,
      reference: directionReferenceFromGrid(correction.id, correction.userReference!, ["pending-direction"]),
      stableOrder: index,
    }));

  const compositeIdentityCandidates: AdvancedImageReferenceCandidate[] = args.appliedCorrections
    .filter((correction) => correction.pinMode === "composite")
    .filter((correction) => correction.identityAnchor)
    .map((correction) => {
      const priority = identityReferencePriority(correction, args.pendingCorrections);
      return {
        correction,
        priorityScore: priority.score,
        priorityTier: args.strongDependencySourceIds?.has(correction.id) ? 3 : 4,
        reference: identityReferenceFromAnchor(correction, correction.identityAnchor!, priority.reasons),
        stableOrder: appliedReferenceStableOrder(correction),
      };
    });

  const appliedDirectionCandidates: AdvancedImageReferenceCandidate[] = args.appliedCorrections
    .filter((correction) => correction.userReference)
    .map((correction) => ({
      correction,
      priorityScore: 0,
      priorityTier: args.strongDependencySourceIds?.has(correction.id) ? 2 : 5,
      reference: directionReferenceFromGrid(
        correction.id,
        correction.userReference!,
        args.strongDependencySourceIds?.has(correction.id)
          ? ["strong-dependency-original-direction"]
          : ["applied-original-direction"],
      ),
      stableOrder: appliedReferenceStableOrder(correction),
    }));

  const anchorIdentityCandidates: AdvancedImageReferenceCandidate[] = args.appliedCorrections
    .filter((correction) => correction.pinMode === "anchor" || correction.pinMode === "composite")
    .filter((correction) => correction.pinMode !== "composite")
    .filter((correction) => correction.identityAnchor)
    .map((correction) => {
      const priority = identityReferencePriority(correction, args.pendingCorrections);
      return {
        correction,
        priorityScore: priority.score,
        priorityTier: args.strongDependencySourceIds?.has(correction.id) ? 3 : 6,
        reference: identityReferenceFromAnchor(correction, correction.identityAnchor!, priority.reasons),
        stableOrder: appliedReferenceStableOrder(correction),
      };
    });

  const candidates = [
    ...pendingDirectionCandidates,
    ...compositeIdentityCandidates,
    ...appliedDirectionCandidates,
    ...anchorIdentityCandidates,
  ];
  const selected = candidates
    .slice()
    .sort((a, b) => {
      if (a.priorityTier !== b.priorityTier) return a.priorityTier - b.priorityTier;
      if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
      return a.stableOrder - b.stableOrder;
    })
    .slice(0, args.maxReferenceImages);
  const selectedKeys = new Set(selected.map((candidate) => referenceSelectionKey(candidate.reference)));

  const identityReferences = [...compositeIdentityCandidates, ...anchorIdentityCandidates]
    .filter((candidate) => selectedKeys.has(referenceSelectionKey(candidate.reference)))
    .sort((a, b) => a.stableOrder - b.stableOrder)
    .map((candidate) => candidate.reference);
  const directionReferences = [...appliedDirectionCandidates, ...pendingDirectionCandidates]
    .filter((candidate) => selectedKeys.has(referenceSelectionKey(candidate.reference)))
    .sort((a, b) => {
      const groupA = a.priorityTier === 2 || a.priorityTier === 5 ? 0 : 1;
      const groupB = b.priorityTier === 2 || b.priorityTier === 5 ? 0 : 1;
      if (groupA !== groupB) return groupA - groupB;
      return a.stableOrder - b.stableOrder;
    })
    .map((candidate) => candidate.reference);
  const omittedIdentityReferenceCorrectionIds = [...compositeIdentityCandidates, ...anchorIdentityCandidates]
    .filter((candidate) => !selectedKeys.has(referenceSelectionKey(candidate.reference)))
    .sort((a, b) => a.stableOrder - b.stableOrder)
    .map((candidate) => candidate.correction.id);
  const omittedDirectionReferenceCorrectionIds = [...appliedDirectionCandidates, ...pendingDirectionCandidates]
    .filter((candidate) => !selectedKeys.has(referenceSelectionKey(candidate.reference)))
    .sort((a, b) => {
      const groupA = a.priorityTier === 2 || a.priorityTier === 5 ? 0 : 1;
      const groupB = b.priorityTier === 2 || b.priorityTier === 5 ? 0 : 1;
      if (groupA !== groupB) return groupA - groupB;
      return a.stableOrder - b.stableOrder;
    })
    .map((candidate) => candidate.correction.id);

  return {
    directionReferences,
    identityReferences,
    omittedDirectionReferenceCorrectionIds,
    omittedIdentityReferenceCorrectionIds,
  };
}

function referenceSelectionKey(reference: AdvancedImagePipelineReference): string {
  return `${reference.role}:${reference.correctionId}`;
}

function selectMaskReferences(args: {
  activeCorrections: AdvancedImageCorrection[];
  maxMaskImages: number;
  pendingIdSet: Set<string>;
}): {
  maskReferences: AdvancedImagePipelineReference[];
  omittedMaskReferenceCorrectionIds: string[];
} {
  const candidates = args.activeCorrections
    .filter((correction) => correction.integrationContract?.needsBinaryMask)
    .map((correction) => ({
      correction,
      reference: maskReferenceFromCorrection(correction),
      stableOrder: args.pendingIdSet.has(correction.id)
        ? 0 + correction.order
        : (correction.appliedBatchNumber ?? 1) * 10_000 + correction.order,
    }))
    .sort((a, b) => a.stableOrder - b.stableOrder);
  const limit = Math.max(0, args.maxMaskImages);
  const selected = candidates.slice(0, limit);
  const selectedIds = new Set(selected.map((item) => item.correction.id));
  return {
    maskReferences: selected.map((item) => item.reference),
    omittedMaskReferenceCorrectionIds: candidates
      .filter((item) => !selectedIds.has(item.correction.id))
      .map((item) => item.correction.id),
  };
}

function appliedReferenceStableOrder(correction: AdvancedImageCorrection): number {
  return (correction.appliedBatchNumber ?? 1) * 10_000 + correction.order;
}

function operationalReferenceLimitForModel(model: string): number {
  const normalized = model.trim().toLowerCase();
  if (normalized === "pro3" || normalized === "gemini-3-pro-image-preview") return 4;
  if (
    normalized === "flash31" ||
    normalized === "gemini-3.1-flash-image-preview" ||
    normalized === "flash25" ||
    normalized === "gemini-2.5-flash-image"
  ) {
    return 3;
  }
  return 4;
}

function identityReferencePriority(
  correction: AdvancedImageCorrection,
  pendingCorrections: AdvancedImageCorrection[],
): { reasons: string[]; score: number } {
  let score = correction.order;
  const reasons: string[] = ["recent-order"];
  if (correction.pinMode === "composite") {
    score += 10_000;
    reasons.unshift("composite-critical");
  }
  if (pendingCorrections.length > 0) {
    try {
      const bestOverlap = pendingCorrections.reduce((best, pending) => {
        const overlap = computeZoneOverlapMetrics(pending.zone, correction.zone, 96);
        return Math.max(best, overlap.intersectionOverOld, overlap.intersectionOverNew);
      }, 0);
      if (bestOverlap > 0.3) {
        score += 5_000 + Math.round(bestOverlap * 1_000);
        reasons.unshift("spatial-overlap");
      }
    } catch {
      // Different source sizes can happen only in malformed imported sessions; ignore priority boost.
    }
  }
  return { reasons, score };
}

function identityReferenceFromAnchor(
  correction: AdvancedImageCorrection,
  anchor: AdvancedImageIdentityAnchor,
  priorityReasons: string[],
): AdvancedImagePipelineReference {
  return {
    correctionId: correction.id,
    hash: anchor.cropHash,
    id: `REF-ID-${correction.id}`,
    label: `REF-ID-${correction.id}`,
    priorityReasons,
    role: "identity",
    s3Key: anchor.cropS3Key,
    url: anchor.cropUrl,
  };
}

function directionReferenceFromGrid(
  correctionId: string,
  grid: AdvancedImageUserReferenceGrid,
  priorityReasons: string[] = ["batch-direction"],
): AdvancedImagePipelineReference {
  return {
    correctionId,
    hash: grid.gridHash,
    id: `REF-DIR-${correctionId}`,
    label: `REF-DIR-${correctionId}`,
    layout: grid.layout,
    priorityReasons,
    role: "direction",
    s3Key: grid.gridS3Key,
    sourceImageCount: grid.sourceImageCount,
    url: grid.gridImageUrlStable || grid.gridImageUrl,
  };
}

function maskReferenceFromCorrection(correction: AdvancedImageCorrection): AdvancedImagePipelineReference {
  const svg = buildAdvancedImageMaskSvg(correction.zone, {
    background: "#000000",
    foreground: "#ffffff",
    includeGeometryMetadata: true,
  });
  return {
    correctionId: correction.id,
    hash: deriveMaskHashFromSvg(svg),
    id: `REF-MASK-${correction.id}`,
    label: `REF-MASK-${correction.id}`,
    priorityReasons: ["clean-binary-mask"],
    role: "mask",
    url: buildAdvancedImageMaskSvgDataUrl(correction.zone, {
      background: "#000000",
      foreground: "#ffffff",
      includeGeometryMetadata: true,
    }),
  };
}

function postCompositeStepFromCorrection(
  correction: AdvancedImageCorrection,
  featherPx: number,
): AdvancedImagePostCompositeStep {
  const anchor = correction.identityAnchor!;
  return {
    bbox: anchor.bbox,
    correctionId: correction.id,
    cropHash: anchor.cropHash,
    cropS3Key: anchor.cropS3Key,
    cropUrl: anchor.cropUrl,
    featherPx,
  };
}

function buildStructuredPrompt(args: {
  active: AdvancedImageCorrection[];
  appliedCorrections: AdvancedImageCorrection[];
  directionReferences: AdvancedImagePipelineReference[];
  globalAdjustmentText?: string;
  identityReferences: AdvancedImagePipelineReference[];
  maskReferences: AdvancedImagePipelineReference[];
  master: AdvancedImageMaster;
  pendingCorrections: AdvancedImageCorrection[];
  strongDependencySourcesByPendingId?: Map<string, Array<{ correction: AdvancedImageCorrection; reason: string }>>;
}): AdvancedImageStructuredPrompt {
  const identityRefByCorrectionId = new Map(args.identityReferences.map((ref) => [ref.correctionId, ref]));
  const directionRefByCorrectionId = new Map(args.directionReferences.map((ref) => [ref.correctionId, ref]));
  const maskRefByCorrectionId = new Map(args.maskReferences.map((ref) => [ref.correctionId, ref]));
  const strongDependencySourcesByPendingId =
    args.strongDependencySourcesByPendingId ??
    resolveStrongAppliedDependencySources(args.appliedCorrections, args.pendingCorrections);
  const absorbedPreserveSourceIds = new Set(
    [...strongDependencySourcesByPendingId.values()].flatMap((sources) => sources.map((source) => source.correction.id)),
  );
  const blocks: AdvancedImagePromptCorrectionBlock[] = [
    ...args.appliedCorrections.filter((correction) => !absorbedPreserveSourceIds.has(correction.id)).map((correction) => {
      const identityRef = identityRefByCorrectionId.get(correction.id);
      const directionRef = directionRefByCorrectionId.get(correction.id);
      const maskRef = maskRefByCorrectionId.get(correction.id);
      return {
        correctionId: correction.id,
        dependencies: correction.dependencies,
        identityDescription: correction.identityAnchor?.description,
        integrationAvoidList: correction.integrationContract?.avoidList,
        integrationCategory: correction.integrationContract?.category,
        integrationContract: correction.integrationContract?.contract,
        integrationOriginalElement: correction.integrationContract?.originalElement,
        integrationTargetElement: correction.integrationContract?.targetElement,
        instruction: correction.userInstruction,
        originalReferenceId: directionRef?.id,
        originalReferenceLayout: directionRef?.layout,
        originalReferenceRole: directionRef ? ("direction" as const) : undefined,
        originalReferenceSourceImageCount: correction.userReference?.sourceImageCount,
        phase: "preserve" as const,
        pinMode: correction.pinMode,
        referenceId: identityRef?.id,
        referenceRole: identityRef?.role,
        maskReferenceId: maskRef?.id,
        zone: promptZoneFromZone(correction.zone),
      };
    }),
    ...args.pendingCorrections.map((correction) => {
      const directionRef = directionRefByCorrectionId.get(correction.id);
      const maskRef = maskRefByCorrectionId.get(correction.id);
      const dependencySources = strongDependencySourcesByPendingId.get(correction.id)?.map(({ correction: source, reason }) => {
        const identityRef = identityRefByCorrectionId.get(source.id);
        const directionRef = directionRefByCorrectionId.get(source.id);
        return {
          correctionId: source.id,
          dependencyReason: reason,
          identityDescription: source.identityAnchor?.description,
          integrationAvoidList: source.integrationContract?.avoidList,
          integrationCategory: source.integrationContract?.category,
          integrationContract: source.integrationContract?.contract,
          integrationOriginalElement: source.integrationContract?.originalElement,
          integrationTargetElement: source.integrationContract?.targetElement,
          instruction: source.userInstruction,
          originalReferenceId: directionRef?.id,
          originalReferenceLayout: directionRef?.layout,
          originalReferenceRole: directionRef ? ("direction" as const) : undefined,
          originalReferenceSourceImageCount: source.userReference?.sourceImageCount,
          pinMode: source.pinMode,
          referenceId: identityRef?.id,
          referenceRole: identityRef?.role,
          zone: promptZoneFromZone(source.zone),
        };
      }) ?? [];
      return {
        correctionId: correction.id,
        dependencies: uniqueOrdered([...correction.dependencies, ...dependencySources.map((source) => source.correctionId)]),
        dependencySources: dependencySources.length > 0 ? dependencySources : undefined,
        identityDescription: correction.identityAnchor?.description,
        integrationAvoidList: correction.integrationContract?.avoidList,
        integrationCategory: correction.integrationContract?.category,
        integrationContract: correction.integrationContract?.contract,
        integrationOriginalElement: correction.integrationContract?.originalElement,
        integrationTargetElement: correction.integrationContract?.targetElement,
        instruction: correction.userInstruction,
        phase: dependencySources.length > 0 ? ("combined" as const) : ("apply" as const),
        pinMode: correction.pinMode,
        referenceId: directionRef?.id,
        referenceLayout: directionRef?.layout,
        referenceRole: directionRef?.role,
        referenceSourceImageCount: correction.userReference?.sourceImageCount,
        maskReferenceId: maskRef?.id,
        zone: promptZoneFromZone(correction.zone),
      };
    }),
  ];
  const finalInstruction = "Generate the final image now, applying all active corrections together in one coherent pass.";
  return {
    blocks,
    finalInstruction,
    globalAdjustmentText: args.globalAdjustmentText,
    promptText: buildPromptText(args.master, blocks, finalInstruction, args.globalAdjustmentText, args.maskReferences.length > 0),
  };
}

function resolveStrongAppliedDependencySources(
  appliedCorrections: AdvancedImageCorrection[],
  pendingCorrections: AdvancedImageCorrection[],
): Map<string, Array<{ correction: AdvancedImageCorrection; reason: string }>> {
  const result = new Map<string, Array<{ correction: AdvancedImageCorrection; reason: string }>>();
  for (const pending of pendingCorrections) {
    const sources: Array<{ correction: AdvancedImageCorrection; reason: string }> = [];
    for (const applied of appliedCorrections) {
      const explicit = pending.dependencies.includes(applied.id);
      let metrics: ReturnType<typeof computeZoneOverlapMetrics> | undefined;
      try {
        metrics = computeZoneOverlapMetrics(pending.zone, applied.zone, 96);
      } catch {
        metrics = undefined;
      }
      const strongOverlap = Boolean(
        metrics &&
          (metrics.containsOldZone || metrics.intersectionOverOld > 0.3 || metrics.intersectionOverNew > 0.3),
      );
      if (!explicit && !strongOverlap) continue;
      const reason = explicit
        ? "Explicit dependency selected by the session."
        : metrics?.containsOldZone
          ? "The new marked zone contains the previous correction zone."
          : metrics && metrics.intersectionOverNew > metrics.intersectionOverOld
            ? `The new marked zone sits inside or strongly overlaps the previous correction (${Math.round(metrics.intersectionOverNew * 100)}% of the new zone overlaps it).`
            : metrics
              ? `The new marked zone modifies a substantial part of the previous correction (${Math.round(metrics.intersectionOverOld * 100)}% of the previous zone overlaps it).`
              : "The new correction depends on a previous correction.";
      sources.push({ correction: applied, reason });
    }
    if (sources.length > 0) {
      result.set(
        pending.id,
        sources.sort((a, b) => a.correction.order - b.correction.order),
      );
    }
  }
  return result;
}

function promptZoneFromZone(zone: AdvancedImageZone): AdvancedImagePromptZone {
  return {
    areaRatio: zone.areaRatio,
    bbox: zone.bbox,
    description: zone.locationDescription,
    normalizedBBox: zone.normalizedBBox,
  };
}

function buildPromptText(
  master: AdvancedImageMaster,
  blocks: AdvancedImagePromptCorrectionBlock[],
  finalInstruction: string,
  globalAdjustmentText?: string,
  hasMaskReferences = false,
): string {
  const preserveBlocks = blocks.filter((block) => block.phase === "preserve");
  const combinedBlocks = blocks.filter((block) => block.phase === "combined");
  const applyBlocks = blocks.filter((block) => block.phase === "apply");
  const dependencyLines = buildDependencyLines(blocks);
  const hasGlobalAdjustment = Boolean(globalAdjustmentText?.trim());
  const integrationRequirementLines = buildIntegrationRequirementLines(blocks);
  const avoidLines = buildAvoidLines(blocks);
  const lines = [
    "IMAGE CREATION ADVANCED - NON DESTRUCTIVE BATCH EDIT",
    `BASE IMAGE: ${master.id} (${master.width}x${master.height}, hash ${master.contentHash})`,
    "",
    "Editing BASE IMAGE. Apply the listed corrections coherently in one generation pass.",
    "",
    ...(hasMaskReferences
      ? [
          "MASK CONVENTION:",
          "- REF-MASK-* images are binary masks. White areas indicate the exact zone to modify. Black areas indicate zones to preserve. Soft gradient edges indicate natural blending boundaries.",
          "- Apply changes ONLY within the white areas of each corresponding REF-MASK.",
          "- The masks are not visual content to reproduce; they are spatial guides for editing.",
          "",
        ]
      : []),
    "REFERENCE IMAGE ORDER:",
    "- BASE IMAGE is the original immutable master image.",
    "- REF-ID-* images are identity anchors from previous accepted corrections. Use them to preserve visual identity.",
    "- REF-DIR-* images are visual direction references for new corrections. Treat them strictly as style/material/subject guidance. Never reproduce, paste, embed or recreate the reference images themselves in the output.",
    ...(hasMaskReferences
      ? ["- REF-MASK-* images are binary spatial masks. White = edit area, black = preserve."]
      : []),
    "",
    "RECONSTRUCT ACCEPTED PREVIOUS CHANGES:",
  ];
  if (preserveBlocks.length === 0) {
    lines.push("- None.");
  } else {
    preserveBlocks.forEach((block, index) => lines.push(...renderPreserveBlock(block, index + 1)));
  }
  if (combinedBlocks.length > 0) {
    lines.push("", "APPLY RESOLVED CHANGES OVER PREVIOUS EDITS:");
    combinedBlocks.forEach((block, index) => lines.push(...renderCombinedBlock(block, index + 1)));
  }
  lines.push("", "APPLY NEW CHANGES:");
  if (applyBlocks.length === 0) {
    lines.push("- None.");
  } else {
    applyBlocks.forEach((block, index) => lines.push(...renderApplyBlock(block, index + 1)));
  }
  if (dependencyLines.length > 0) {
    lines.push("", "DEPENDENCIES:", ...dependencyLines);
  }
  if (hasGlobalAdjustment) {
    lines.push(
      "",
      "GLOBAL TRANSFORMATION (applied to entire image):",
      globalAdjustmentText!.trim(),
      "",
      "Apply this transformation to the full image. Adjust lighting, color palette, ambiance, atmosphere or style as required. Preserve the structural composition, subjects, objects and all RECONSTRUCT ACCEPTED PREVIOUS CHANGES and APPLY NEW CHANGES described above. The global transformation should affect the overall scene mood while keeping individual elements coherent with their descriptions.",
    );
  }
  if (integrationRequirementLines.length > 0) {
    lines.push("", "INTEGRATION REQUIREMENTS:", ...integrationRequirementLines);
  }
  lines.push(
    "",
    "AVOID:",
    ...(avoidLines.length > 0 ? avoidLines : []),
    "- Editing tool artifacts of any kind (colored lines, polygon overlays, selection marks, UI annotations).",
    "- Sticker/cutout appearance on inserted objects.",
    "- Literal reproduction of reference images as flat overlays.",
  );
  lines.push(
    "",
    "CRITICAL FINAL RULES:",
    hasGlobalAdjustment
      ? "- Only modify the explicitly marked zones for local changes. The GLOBAL TRANSFORMATION affects the entire image."
      : "- Only modify the explicitly marked zones.",
    ...(hasGlobalAdjustment
      ? ["- The GLOBAL TRANSFORMATION applies to the entire image. Do not restrict it to a specific zone."]
      : []),
    hasGlobalAdjustment
      ? "- For local changes, preserve everything outside marked zones. Only the GLOBAL TRANSFORMATION may alter the full-scene lighting, color, ambiance or style."
      : "- Preserve everything outside marked zones EXACTLY. Do not modify any area outside the explicitly marked zones.",
    "- Each marked zone defines the exact boundary and target of its change. Do NOT extend a local change to similar, paired, repeated or symmetric visual elements outside the marked zone, even if they appear to be part of the same face, body, object, wall, floor, surface, pattern or texture.",
    "- If a zone marks only one eye, one lip, one hand, one shoe, one logo, one tile, one object instance or one side of a pair, modify only that marked instance and never its unmarked counterpart.",
    "- Preserve original composition, camera angle, perspective, lighting continuity, texture fidelity and resolution.",
    "- Do not draw colored masks, outlines, guide circles, labels, zone borders, UI marks or reference annotations into the final image.",
    "- Output one clean final image at the same resolution and aspect ratio as the BASE IMAGE.",
    "- If a described zone cannot be reliably located in the base image, apply the change in the most plausible nearby area and prioritize visual coherence over literal location matching.",
    "",
    finalInstruction,
  );
  return lines.join("\n");
}

function renderPreserveBlock(block: AdvancedImagePromptCorrectionBlock, index: number): string[] {
  const lines = [
    `RECONSTRUCT ACCEPTED PREVIOUS CHANGE ${index} (${block.correctionId}):`,
    `- Zone: ${formatZone(block.zone)}`,
    ...(block.maskReferenceId
      ? [`- Spatial guide: ${block.maskReferenceId} (binary mask, white = edit area, black = preserve area).`]
      : []),
    `- Original instruction: ${block.instruction}.`,
    "- Rebuild this accepted previous correction from the BASE IMAGE and keep it visible in the final output. It does not exist in the BASE IMAGE, so it must be recreated, not merely preserved.",
    "- Reconstruct this previous correction only inside this exact marked zone. Do not broaden, mirror, duplicate or reinterpret it on unmarked similar elements.",
  ];
  lines.push(...renderPhotographicFitLines(block, "preserve"));
  lines.push(...renderSubstitutionLines(block, "preserve"));
  if (block.identityDescription && block.referenceId && block.referenceRole === "identity") {
    lines.push(`- Identity to preserve: ${block.identityDescription}.`, `- Use ${block.referenceId} as identity anchor.`);
  } else if (block.identityDescription) {
    lines.push(
      `- Identity to preserve: ${block.identityDescription}.`,
      "- No image anchor is included for this change; preserve from written identity description.",
    );
  } else {
    lines.push(
      `- Previously applied change: ${block.instruction}.`,
      "- Reproduce coherently. No identity anchor available; preserve from written description.",
    );
  }
  if (block.originalReferenceId && block.originalReferenceRole === "direction") {
    lines.push(`- Original visual reference: ${block.originalReferenceId}. Preserve coherence with this reference.`);
    if (block.originalReferenceLayout && (block.originalReferenceSourceImageCount ?? 0) > 1) {
      lines.push(
        `- ${block.originalReferenceId} is the original composite reference image of ${block.originalReferenceSourceImageCount} references arranged in a ${block.originalReferenceLayout.columns}x${block.originalReferenceLayout.rows} grid: ${describeGridLayout(block.originalReferenceLayout, block.originalReferenceSourceImageCount ?? block.originalReferenceLayout.usedImageCount)}.`,
      );
    }
  } else if (block.originalReferenceSourceImageCount) {
    lines.push(
      "- Reference image originally used for this change is not included in this call; preserve from written description.",
    );
  }
  appendIntegrationLines(lines, block);
  return lines;
}

function renderCombinedBlock(block: AdvancedImagePromptCorrectionBlock, index: number): string[] {
  const lines = [
    `APPLY RESOLVED CHANGE ${index} (${block.correctionId}):`,
    "- This is a strong dependency case: the current change modifies one or more previous accepted corrections.",
    "- Do NOT send contradictory intents to the image model. Resolve the previous correction and the current override as one coherent instruction.",
    `- Current target zone: ${formatZone(block.zone)}`,
    `- Current local override: ${block.instruction}`,
    "- The current local override has priority only inside the current target zone.",
  ];
  lines.push(...renderPhotographicFitLines(block, "apply"));
  if (block.maskReferenceId) {
    lines.push(`- Spatial guide: ${block.maskReferenceId} (binary mask, white = edit area, black = preserve area).`);
  }
  if (block.referenceId && block.referenceRole === "direction") {
    lines.push(`- Current visual direction: use ${block.referenceId} as guidance for the override only.`);
    if (block.referenceLayout && (block.referenceSourceImageCount ?? 0) > 1) {
      lines.push(
        `- ${block.referenceId} is a composite image of ${block.referenceSourceImageCount} references arranged in a ${block.referenceLayout.columns}x${block.referenceLayout.rows} grid: ${describeGridLayout(block.referenceLayout, block.referenceSourceImageCount ?? block.referenceLayout.usedImageCount)}. Use them collectively as visual direction for the override.`,
      );
    }
  }
  for (const source of block.dependencySources ?? []) {
    lines.push(
      `- Previous correction source ${source.correctionId}:`,
      `  - Dependency reason: ${source.dependencyReason}`,
      `  - Previous zone: ${formatZone(source.zone)}`,
      `  - Previous original instruction: ${source.instruction}.`,
      "  - Preserve this previous correction everywhere it should remain visible outside the current override zone.",
    );
    lines.push(...renderPhotographicFitLines(source, "combined-source", "  - "));
    if (source.identityDescription && source.referenceId && source.referenceRole === "identity") {
      lines.push(
        `  - Identity to preserve: ${source.identityDescription}.`,
        `  - Use ${source.referenceId} as identity anchor for the previous correction.`,
      );
    } else if (source.identityDescription) {
      lines.push(
        `  - Identity to preserve: ${source.identityDescription}.`,
        "  - No image anchor is included for this previous correction; preserve from written identity description.",
      );
    } else {
      lines.push("  - No identity anchor is available; preserve from the previous original instruction and zone.");
    }
    if (source.originalReferenceId && source.originalReferenceRole === "direction") {
      lines.push(
        `  - Original visual reference: ${source.originalReferenceId}. Use it as the base visual identity/material/style for the previous correction, not as a literal object to paste.`,
      );
      if (source.originalReferenceLayout && (source.originalReferenceSourceImageCount ?? 0) > 1) {
        lines.push(
          `  - ${source.originalReferenceId} is the original composite reference image of ${source.originalReferenceSourceImageCount} references arranged in a ${source.originalReferenceLayout.columns}x${source.originalReferenceLayout.rows} grid: ${describeGridLayout(source.originalReferenceLayout, source.originalReferenceSourceImageCount ?? source.originalReferenceLayout.usedImageCount)}.`,
        );
      }
    } else if (source.originalReferenceSourceImageCount) {
      lines.push("  - The original visual reference for this previous correction is not included due to the reference limit; preserve from written identity and instruction.");
    }
    lines.push(...renderSubstitutionLines(source, "combined-source", "  - "));
  }
  lines.push(
    "- Resolved instruction: rebuild the previous correction source(s) from the immutable master using their anchors/references/descriptions as visual identity, then apply the current local override inside the current target zone.",
    "- If a previous reference, previous anchor or previous instruction conflicts with the current local override, the current local override wins only inside the current target zone.",
    "- Keep all non-overridden parts of the previous correction coherent with their original reference/identity.",
  );
  appendIntegrationLines(lines, block);
  return lines;
}

function renderApplyBlock(block: AdvancedImagePromptCorrectionBlock, index: number): string[] {
  const lines = [
    `APPLY NEW CHANGE ${index} (${block.correctionId}):`,
    `- Zone: ${formatZone(block.zone)}`,
    ...(block.maskReferenceId
      ? [`- Spatial guide: ${block.maskReferenceId} (binary mask, white = edit area, black = preserve area).`]
      : []),
    `- Instruction: ${block.instruction}`,
    "- Apply this change only inside this exact marked zone. Do not modify matching, paired, repeated or symmetric elements outside the selected area unless the instruction explicitly asks for them.",
  ];
  lines.push(...renderPhotographicFitLines(block, "apply"));
  lines.push(...renderSubstitutionLines(block, "apply"));
  if (block.referenceId && block.referenceRole === "direction") {
    lines.push(`- Use ${block.referenceId} as visual direction for this change.`);
    if (block.referenceLayout && (block.referenceSourceImageCount ?? 0) > 1) {
      lines.push(
        `- ${block.referenceId} is a composite image of ${block.referenceSourceImageCount} references arranged in a ${block.referenceLayout.columns}x${block.referenceLayout.rows} grid: ${describeGridLayout(block.referenceLayout, block.referenceSourceImageCount ?? block.referenceLayout.usedImageCount)}. Use them collectively as visual direction.`,
      );
    }
  } else if (block.referenceSourceImageCount) {
    lines.push("- A visual direction grid exists but is not included due to the reference limit. Use the written instruction only.");
  }
  appendIntegrationLines(lines, block);
  return lines;
}

function appendIntegrationLines(lines: string[], block: AdvancedImagePromptCorrectionBlock): void {
  if (block.integrationCategory) lines.push(`- Category: ${block.integrationCategory}.`);
  if (block.integrationContract) lines.push(`- Integration: ${block.integrationContract}`);
  if (block.integrationAvoidList?.length) {
    lines.push(`- Avoid: ${block.integrationAvoidList.join(" ")}`);
  }
}

function renderPhotographicFitLines(
  block: Pick<AdvancedImagePromptCorrectionBlock, "integrationCategory">,
  mode: "apply" | "combined-source" | "preserve",
  prefix = "- ",
): string[] {
  if (block.integrationCategory === "environmental") return [];
  const target =
    mode === "combined-source"
      ? "this previous correction source"
      : mode === "preserve"
        ? "this accepted previous change"
        : "this specific change";
  return [
    `${prefix}Photographic fit: maintain the BASE IMAGE's real perspective, camera/lens angle, lighting direction, shadow softness, contact shadows, occlusion, depth of field, grain, texture fidelity and color temperature for ${target}. The result must look physically present in the original photograph, never pasted, flat, sticker-like or catalog-like.`,
  ];
}

function renderSubstitutionLines(
  block: Pick<
    AdvancedImagePromptCorrectionBlock,
    "integrationCategory" | "integrationOriginalElement" | "integrationTargetElement"
  >,
  mode: "apply" | "combined-source" | "preserve",
  prefix = "- ",
): string[] {
  if (block.integrationCategory !== "substitute_object") return [];
  const original = block.integrationOriginalElement?.trim();
  const target = block.integrationTargetElement?.trim();
  if (mode === "apply") {
    return [
      `${prefix}SUBSTITUTION RULE: replace the existing element inside this marked zone with the requested new element. Do not keep or restore the original element from the BASE IMAGE inside this zone.`,
      ...(original ? [`${prefix}Original element to replace from BASE IMAGE: ${original}.`] : []),
      ...(target ? [`${prefix}Replacement element to construct: ${target}.`] : []),
    ];
  }
  if (mode === "combined-source") {
    return [
      `${prefix}SUBSTITUTION SOURCE RULE: this previous correction replaced an original master element. Keep that replacement active wherever it is not overridden by the current local change.`,
      ...(original ? [`${prefix}Original master element that must remain replaced: ${original}.`] : []),
      ...(target ? [`${prefix}Accepted replacement to preserve/reconstruct: ${target}.`] : []),
    ];
  }
  return [
    `${prefix}IMPORTANT SUBSTITUTION: this accepted previous correction replaced an element that exists in the BASE IMAGE. Do not restore the original master element in this zone; reconstruct the accepted replacement instead.`,
    ...(original ? [`${prefix}Original master element that must remain replaced: ${original}.`] : []),
    ...(target ? [`${prefix}Accepted replacement to reconstruct: ${target}.`] : []),
  ];
}

function buildIntegrationRequirementLines(blocks: AdvancedImagePromptCorrectionBlock[]): string[] {
  return blocks
    .filter((block) => block.integrationContract)
    .map((block) => `- ${block.correctionId}: ${block.integrationContract}`);
}

function buildAvoidLines(blocks: AdvancedImagePromptCorrectionBlock[]): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const block of blocks) {
    for (const item of block.integrationAvoidList ?? []) {
      const normalized = item.trim();
      if (!normalized || seen.has(normalized.toLowerCase())) continue;
      seen.add(normalized.toLowerCase());
      lines.push(`- ${normalized}`);
    }
  }
  return lines;
}

function buildDependencyLines(blocks: AdvancedImagePromptCorrectionBlock[]): string[] {
  const labelById = new Map<string, string>();
  let preserveIndex = 0;
  let applyIndex = 0;
  for (const block of blocks) {
    if (block.phase === "preserve") {
      preserveIndex += 1;
      labelById.set(block.correctionId, `RECONSTRUCT ACCEPTED PREVIOUS CHANGE ${preserveIndex} (${shortInstructionLabel(block.instruction)})`);
    } else if (block.phase === "combined") {
      applyIndex += 1;
      labelById.set(block.correctionId, `APPLY RESOLVED CHANGE ${applyIndex} (${shortInstructionLabel(block.instruction)})`);
    } else {
      applyIndex += 1;
      labelById.set(block.correctionId, `APPLY NEW CHANGE ${applyIndex} (${shortInstructionLabel(block.instruction)})`);
    }
  }
  const lines: string[] = [];
  for (const block of blocks) {
    const blockLabel = labelById.get(block.correctionId);
    if (!blockLabel) continue;
    for (const dependencyId of block.dependencies) {
      const dependencyLabel = labelById.get(dependencyId);
      if (!dependencyLabel) continue;
      lines.push(`- ${blockLabel} depends on ${dependencyLabel}. Apply them coherently together.`);
    }
  }
  return lines;
}

function shortInstructionLabel(instruction: string): string {
  const compact = instruction.trim().replace(/\s+/g, " ");
  if (!compact) return "change";
  const words = compact.split(" ").slice(0, 4).join(" ");
  return words.length > 34 ? `${words.slice(0, 31)}...` : words;
}

function formatZone(zone: AdvancedImagePromptZone): string {
  return `${sanitizeSpatialDescription(zone.description)}; bbox px ${formatBox(zone.bbox)}; normalized ${formatBox(zone.normalizedBBox)}; area ${round(zone.areaRatio * 100)}%`;
}

function sanitizeSpatialDescription(description: string): string {
  return description
    .replace(/\b(trazo|stroke|mask|máscara|mascara|color|rojo|red|verde|green|azul|blue|magenta|amarillo|yellow)\b/gi, "marked region")
    .replace(/\bREF\s*2\b/gi, "spatial analysis")
    .replace(/\s+/g, " ")
    .trim();
}

function describeGridLayout(
  layout: NonNullable<AdvancedImageUserReferenceGrid["layout"]>,
  count: number,
): string {
  const positions: string[] = [];
  for (let index = 0; index < Math.min(count, layout.usedImageCount); index += 1) {
    const row = Math.floor(index / layout.columns) + 1;
    const column = (index % layout.columns) + 1;
    positions.push(`image ${index + 1}: row ${row}, column ${column}`);
  }
  return positions.join("; ");
}

function baseImageFromMaster(master: AdvancedImageMaster): AdvancedImagePipelineBaseImage {
  return {
    contentHash: master.contentHash,
    height: master.height,
    imageUrl: master.imageUrl,
    masterId: master.id,
    s3Key: master.s3Key,
    width: master.width,
  };
}

function formatBox(box: AdvancedImageBox): string {
  return `x=${round(box.x)}, y=${round(box.y)}, w=${round(box.width)}, h=${round(box.height)}`;
}

function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 1_000_000) / 1_000_000 : 0;
}

export function computeAdvancedImagePlanFingerprint(plan: AdvancedImageGenerationPlan): string {
  return stableHash({
    activeCorrectionIds: plan.activeCorrectionIds,
    appliedPreserveCorrectionIds: plan.appliedPreserveCorrectionIds,
    baseImage: plan.baseImage,
    batchPendingIds: plan.batchPendingIds,
    directionReferences: plan.directionReferences.map((ref) => [ref.id, ref.hash]),
    finalImageStateHash: plan.finalImageStateHash,
    geminiStateHash: plan.geminiStateHash,
    globalAdjustmentText: plan.globalAdjustmentText,
    identityReferences: plan.identityReferences.map((ref) => [ref.id, ref.hash]),
    maskReferences: plan.maskReferences.map((ref) => [ref.id, ref.hash]),
    omittedDirectionReferenceCorrectionIds: plan.omittedDirectionReferenceCorrectionIds,
    omittedIdentityReferenceCorrectionIds: plan.omittedIdentityReferenceCorrectionIds,
    omittedMaskReferenceCorrectionIds: plan.omittedMaskReferenceCorrectionIds,
    postCompositeSteps: plan.postCompositeSteps.map((step) => [step.correctionId, step.cropHash, step.featherPx]),
    promptText: plan.prompt.promptText,
  });
}
