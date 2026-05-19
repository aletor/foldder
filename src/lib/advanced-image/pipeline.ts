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
  type AdvancedImageMaster,
  type AdvancedImageSession,
  type AdvancedImageUserReferenceGrid,
  type AdvancedImageZone,
} from "./domain";
import { computeZoneOverlapMetrics } from "./mask";

export type AdvancedImagePipelineBaseImage = {
  contentHash: string;
  height: number;
  imageUrl: string;
  masterId: string;
  s3Key?: string;
  width: number;
};

export type AdvancedImagePipelineReferenceRole = "direction" | "identity";

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
  identityDescription?: string;
  instruction: string;
  originalReferenceId?: string;
  originalReferenceLayout?: AdvancedImageUserReferenceGrid["layout"];
  originalReferenceRole?: "direction";
  originalReferenceSourceImageCount?: number;
  phase: "apply" | "preserve";
  pinMode: AdvancedImageCorrection["pinMode"];
  referenceLayout?: AdvancedImageUserReferenceGrid["layout"];
  referenceId?: string;
  referenceRole?: AdvancedImagePipelineReferenceRole;
  referenceSourceImageCount?: number;
  strictZoneBoundary: boolean;
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

export type AdvancedImageStrictCompositeStep = {
  correctionId: string;
  featherPx: number;
  zone: AdvancedImageZone;
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
  postCompositeSteps: AdvancedImagePostCompositeStep[];
  prompt: AdvancedImageStructuredPrompt;
  promptVersion: string;
  referenceLimit: number;
  strictCompositeSteps: AdvancedImageStrictCompositeStep[];
  strictCorrectionIds: string[];
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

  const maxReferenceImages = Math.max(1, session.generationSettings.maxReferenceImages || 8);
  const referenceSelection = selectOperationalReferences({
    appliedCorrections,
    maxReferenceImages,
    pendingCorrections,
  });

  const postCompositeSteps = active
    .filter((correction) => correction.pinMode === "composite" && correction.identityAnchor)
    .map((correction) => postCompositeStepFromCorrection(correction, options.featherPx ?? 12));
  const strictCompositeSteps = active
    .filter((correction) => correction.strictZoneBoundary === true)
    .map((correction) => ({
      correctionId: correction.id,
      featherPx: 8,
      zone: correction.zone,
    }));
  const prompt = buildStructuredPrompt({
    active,
    appliedCorrections,
    directionReferences: referenceSelection.directionReferences,
    identityReferences: referenceSelection.identityReferences,
    master: session.master,
    pendingCorrections,
    globalAdjustmentText: globalAdjustmentActive ? globalAdjustmentText : undefined,
  });

  const referenceCount = referenceSelection.identityReferences.length + referenceSelection.directionReferences.length;
  const geminiStateHash = stableHash({
    appliedPreserveCorrectionIds: appliedCorrections.map((correction) => correction.id),
    baseGeminiStateHash: computeGeminiGenerationStateHash(session),
    batchPendingIds: pendingCorrections.map((correction) => correction.id),
      directionReferences: referenceSelection.directionReferences.map((ref) => [ref.id, ref.hash]),
      globalAdjustment: {
        text: globalAdjustmentActive ? globalAdjustmentText : "",
      },
      identityReferences: referenceSelection.identityReferences.map((ref) => [ref.id, ref.hash]),
    omittedDirectionReferenceCorrectionIds: referenceSelection.omittedDirectionReferenceCorrectionIds,
    omittedIdentityReferenceCorrectionIds: referenceSelection.omittedIdentityReferenceCorrectionIds,
    promptText: prompt.promptText,
  });
  const finalImageStateHash = stableHash({
    baseFinalImageStateHash: computeFinalImageStateHash(session),
    geminiStateHash,
    postCompositeSteps: postCompositeSteps.map((step) => [step.correctionId, step.cropHash, step.featherPx]),
    strictCompositeSteps: strictCompositeSteps.map((step) => [step.correctionId, step.zone.geometryHash, step.featherPx]),
  });
  return {
    ok: true,
    plan: {
      activeCorrectionIds: active.map((correction) => correction.id),
      appliedPreserveCorrectionIds: appliedCorrections.map((correction) => correction.id),
      baseImage: baseImageFromMaster(session.master),
      batchPendingIds: pendingCorrections.map((correction) => correction.id),
      cacheKeys: {
        finalImage: `advanced-image/final/${finalImageStateHash}`,
        geminiRaw: `advanced-image/gemini/${geminiStateHash}`,
      },
      consolidationRecommended:
        referenceSelection.omittedIdentityReferenceCorrectionIds.length > 0 ||
        referenceSelection.omittedDirectionReferenceCorrectionIds.length > 0 ||
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
      postCompositeSteps,
      prompt,
      promptVersion: session.generationSettings.promptVersion,
      referenceLimit: maxReferenceImages,
      strictCompositeSteps,
      strictCorrectionIds: strictCompositeSteps.map((step) => step.correctionId),
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
    snapshot.referenceHash === correction.referenceHash &&
    (snapshot.strictZoneBoundary ?? false) === (correction.strictZoneBoundary === true)
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
        priorityTier: 2,
        reference: identityReferenceFromAnchor(correction, correction.identityAnchor!, priority.reasons),
        stableOrder: appliedReferenceStableOrder(correction),
      };
    });

  const appliedDirectionCandidates: AdvancedImageReferenceCandidate[] = args.appliedCorrections
    .filter((correction) => correction.userReference)
    .map((correction) => ({
      correction,
      priorityScore: 0,
      priorityTier: 3,
      reference: directionReferenceFromGrid(correction.id, correction.userReference!, ["applied-original-direction"]),
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
        priorityTier: 4,
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
      const groupA = a.priorityTier === 3 ? 0 : 1;
      const groupB = b.priorityTier === 3 ? 0 : 1;
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
      const groupA = a.priorityTier === 3 ? 0 : 1;
      const groupB = b.priorityTier === 3 ? 0 : 1;
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

function appliedReferenceStableOrder(correction: AdvancedImageCorrection): number {
  return (correction.appliedBatchNumber ?? 1) * 10_000 + correction.order;
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
  master: AdvancedImageMaster;
  pendingCorrections: AdvancedImageCorrection[];
}): AdvancedImageStructuredPrompt {
  const identityRefByCorrectionId = new Map(args.identityReferences.map((ref) => [ref.correctionId, ref]));
  const directionRefByCorrectionId = new Map(args.directionReferences.map((ref) => [ref.correctionId, ref]));
  const blocks: AdvancedImagePromptCorrectionBlock[] = [
    ...args.appliedCorrections.map((correction) => {
      const identityRef = identityRefByCorrectionId.get(correction.id);
      const directionRef = directionRefByCorrectionId.get(correction.id);
      return {
        correctionId: correction.id,
        dependencies: correction.dependencies,
        identityDescription: correction.identityAnchor?.description,
        instruction: correction.userInstruction,
        originalReferenceId: directionRef?.id,
        originalReferenceLayout: directionRef?.layout,
        originalReferenceRole: directionRef ? ("direction" as const) : undefined,
        originalReferenceSourceImageCount: correction.userReference?.sourceImageCount,
        phase: "preserve" as const,
        pinMode: correction.pinMode,
        referenceId: identityRef?.id,
        referenceRole: identityRef?.role,
        strictZoneBoundary: correction.strictZoneBoundary === true,
        zone: promptZoneFromZone(correction.zone),
      };
    }),
    ...args.pendingCorrections.map((correction) => {
      const directionRef = directionRefByCorrectionId.get(correction.id);
      return {
        correctionId: correction.id,
        dependencies: correction.dependencies,
        identityDescription: correction.identityAnchor?.description,
        instruction: correction.userInstruction,
        phase: "apply" as const,
        pinMode: correction.pinMode,
        referenceId: directionRef?.id,
        referenceLayout: directionRef?.layout,
        referenceRole: directionRef?.role,
        referenceSourceImageCount: correction.userReference?.sourceImageCount,
        strictZoneBoundary: correction.strictZoneBoundary === true,
        zone: promptZoneFromZone(correction.zone),
      };
    }),
  ];
  const finalInstruction = "Generate the final image now, applying all active corrections together in one coherent pass.";
  return {
    blocks,
    finalInstruction,
    globalAdjustmentText: args.globalAdjustmentText,
    promptText: buildPromptText(args.master, blocks, finalInstruction, args.globalAdjustmentText),
  };
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
): string {
  const preserveBlocks = blocks.filter((block) => block.phase === "preserve");
  const applyBlocks = blocks.filter((block) => block.phase === "apply");
  const dependencyLines = buildDependencyLines(blocks);
  const hasGlobalAdjustment = Boolean(globalAdjustmentText?.trim());
  const lines = [
    "IMAGE CREATION ADVANCED - NON DESTRUCTIVE BATCH EDIT",
    `BASE IMAGE: ${master.id} (${master.width}x${master.height}, hash ${master.contentHash})`,
    "",
    "Editing BASE IMAGE. Apply the listed corrections coherently in one generation pass.",
    "",
    "REFERENCE IMAGE ORDER:",
    "- BASE IMAGE is the original immutable master image.",
    "- REF-ID-* images are identity anchors from previous accepted corrections. Use them to preserve visual identity.",
    "- REF-DIR-* images are visual direction references for new corrections. Treat them strictly as style/material/subject guidance. Never reproduce, paste, embed or recreate the reference images themselves in the output.",
    "",
    "PRESERVE EXISTING CHANGES:",
  ];
  if (preserveBlocks.length === 0) {
    lines.push("- None.");
  } else {
    preserveBlocks.forEach((block, index) => lines.push(...renderPreserveBlock(block, index + 1)));
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
      "Apply this transformation to the full image. Adjust lighting, color palette, ambiance, atmosphere or style as required. Preserve the structural composition, subjects, objects and all PRESERVE EXISTING CHANGES and APPLY NEW CHANGES described above. The global transformation should affect the overall scene mood while keeping individual elements coherent with their descriptions.",
    );
  }
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
    "- Preserve original composition, camera angle, perspective, lighting continuity, texture fidelity and resolution.",
    "- Each marked zone defines the exact boundary of its change. Do NOT extend any change to similar visual elements outside the marked zone, even if they appear to be part of the same object, wall, floor, surface, pattern or texture. Treat the boundary of each marked zone as a hard cutoff.",
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
    `PRESERVE EXISTING CHANGE ${index} (${block.correctionId}):`,
    `- Zone: ${formatZone(block.zone)}`,
  ];
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
  if (block.strictZoneBoundary) {
    lines.push(
      "- Strict zone boundary: enabled. This change MUST be confined to the exact marked zone only. Do NOT modify any area outside this specific zone under any circumstances.",
    );
  }
  return lines;
}

function renderApplyBlock(block: AdvancedImagePromptCorrectionBlock, index: number): string[] {
  const lines = [
    `APPLY NEW CHANGE ${index} (${block.correctionId}):`,
    `- Zone: ${formatZone(block.zone)}`,
    `- Instruction: ${block.instruction}`,
  ];
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
  if (block.strictZoneBoundary) {
    lines.push(
      "- Strict zone boundary: enabled. This change MUST be confined to the exact marked zone only. Do NOT modify any area outside this specific zone under any circumstances.",
    );
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
      labelById.set(block.correctionId, `PRESERVE EXISTING CHANGE ${preserveIndex} (${shortInstructionLabel(block.instruction)})`);
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
  return `${zone.description}; bbox px ${formatBox(zone.bbox)}; normalized ${formatBox(zone.normalizedBBox)}; area ${round(zone.areaRatio * 100)}%`;
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
    omittedDirectionReferenceCorrectionIds: plan.omittedDirectionReferenceCorrectionIds,
    omittedIdentityReferenceCorrectionIds: plan.omittedIdentityReferenceCorrectionIds,
    postCompositeSteps: plan.postCompositeSteps.map((step) => [step.correctionId, step.cropHash, step.featherPx]),
    promptText: plan.prompt.promptText,
    strictCompositeSteps: plan.strictCompositeSteps.map((step) => [step.correctionId, step.zone.geometryHash, step.featherPx]),
  });
}
