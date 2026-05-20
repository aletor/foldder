import {
  stableHash,
  type AdvancedImageCorrection,
  type AdvancedImageIntegrationCategory,
  type AdvancedImageIntegrationContract,
  type AdvancedImageSession,
} from "./domain";

export type AdvancedImageCorrectionZoneSize = "large" | "medium" | "small";

export type AdvancedImageAnalyzeCorrectionRequest = {
  masterCropUrl?: string;
  model?: string;
  referenceImageUrl?: string;
  userInstruction: string;
  userReferenceHash?: string;
  zoneSize: AdvancedImageCorrectionZoneSize;
};

export type AdvancedImageAnalyzeCorrectionResponse = {
  integrationContract: AdvancedImageIntegrationContract;
  raw?: unknown;
};

export type AdvancedImageCorrectionContractTransport = (
  request: AdvancedImageAnalyzeCorrectionRequest,
) => Promise<AdvancedImageAnalyzeCorrectionResponse>;

const VALID_CATEGORIES = new Set<AdvancedImageIntegrationCategory>([
  "add_object",
  "change_texture_material",
  "environmental",
  "modify_attribute",
  "remove_object",
  "substitute_object",
]);

export function getAdvancedImageCorrectionZoneSize(correction: Pick<AdvancedImageCorrection, "zone">): AdvancedImageCorrectionZoneSize {
  const area = correction.zone.areaRatio;
  if (area < 0.015) return "small";
  if (area < 0.08) return "medium";
  return "large";
}

export function buildAdvancedImageCorrectionContractCacheKey(args: {
  masterContextHash?: string;
  userInstruction: string;
  userReferenceHash?: string;
  zoneSize: AdvancedImageCorrectionZoneSize;
}): string {
  return stableHash({
    instruction: args.userInstruction.trim().replace(/\s+/g, " "),
    masterContextHash: args.masterContextHash ?? null,
    referenceHash: args.userReferenceHash ?? null,
    zoneSize: args.zoneSize,
  });
}

export function buildAdvancedImageCorrectionMasterContextHash(
  session: AdvancedImageSession,
  correction: AdvancedImageCorrection,
): string {
  return stableHash({
    geometryHash: correction.geometryHash,
    masterContentHash: session.master.contentHash,
    masterId: session.master.id,
  });
}

export function getAdvancedImageCorrectionsNeedingIntegrationContract(
  session: AdvancedImageSession,
  batchPendingIds: string[],
): AdvancedImageCorrection[] {
  const pending = new Set(batchPendingIds);
  return session.corrections
    .filter((correction) => correction.status === "active")
    .filter((correction) => !correction.integrationContract)
    .filter((correction) => pending.has(correction.id) || isAppliedInCurrentWorkingImage(session, correction))
    .sort((a, b) => {
      const aPending = pending.has(a.id) ? 0 : 1;
      const bPending = pending.has(b.id) ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      return a.order - b.order;
    });
}

export function normalizeAdvancedImageIntegrationContract(
  value: unknown,
  fallback: { generatedAt: string; generatedBy: string },
): AdvancedImageIntegrationContract {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawCategory = normalizeText(record.category ?? record.CATEGORY).toLowerCase();
  const category = VALID_CATEGORIES.has(rawCategory as AdvancedImageIntegrationCategory)
    ? (rawCategory as AdvancedImageIntegrationCategory)
    : "modify_attribute";
  const contract = normalizeText(record.integrationContract ?? record.contract ?? record.INTEGRATION_CONTRACT).slice(0, 900);
  const rawAvoid = record.avoidList ?? record.AVOID_LIST;
  const avoidList = Array.isArray(rawAvoid)
    ? rawAvoid.map(normalizeText).filter(Boolean).slice(0, 3)
    : [];
  const rawNeedsMask = record.needsBinaryMask ?? record.NEEDS_BINARY_MASK;
  const needsBinaryMask =
    typeof rawNeedsMask === "boolean"
      ? rawNeedsMask
      : category !== "environmental";
  const originalElement = normalizeText(
    record.originalElement ?? record.ORIGINAL_ELEMENT ?? record.original_element,
  ).slice(0, 240);
  const targetElement = normalizeText(
    record.targetElement ?? record.TARGET_ELEMENT ?? record.target_element ?? record.replacementElement ?? record.REPLACEMENT_ELEMENT,
  ).slice(0, 240);

  return {
    avoidList,
    category,
    contract: contract || fallbackContractForCategory(category),
    generatedAt: fallback.generatedAt,
    generatedBy: fallback.generatedBy,
    needsBinaryMask,
    originalElement: originalElement || undefined,
    targetElement: targetElement || undefined,
  };
}

export async function analyzeAdvancedImageCorrectionContract(
  correction: AdvancedImageCorrection,
  args: {
    cache?: Map<string, AdvancedImageIntegrationContract>;
    masterCropUrl?: string;
    model?: string;
    now: string;
    session: AdvancedImageSession;
    transport: AdvancedImageCorrectionContractTransport;
  },
): Promise<{ cacheHit: boolean; integrationContract: AdvancedImageIntegrationContract }> {
  const zoneSize = getAdvancedImageCorrectionZoneSize(correction);
  const cacheKey = buildAdvancedImageCorrectionContractCacheKey({
    masterContextHash: buildAdvancedImageCorrectionMasterContextHash(args.session, correction),
    userInstruction: correction.userInstruction,
    userReferenceHash: correction.referenceHash,
    zoneSize,
  });
  const cached = args.cache?.get(cacheKey);
  if (cached) return { cacheHit: true, integrationContract: cached };
  const result = await args.transport({
    model: args.model,
    masterCropUrl: args.masterCropUrl,
    referenceImageUrl: correction.userReference?.gridImageUrlStable ?? correction.userReference?.gridImageUrl,
    userInstruction: correction.userInstruction,
    userReferenceHash: correction.referenceHash,
    zoneSize,
  });
  const contract = {
    ...result.integrationContract,
    generatedAt: result.integrationContract.generatedAt || args.now,
    generatedBy: result.integrationContract.generatedBy || args.model || "gemini-2.5-flash",
  };
  args.cache?.set(cacheKey, contract);
  return { cacheHit: false, integrationContract: contract };
}

function isAppliedInCurrentWorkingImage(session: AdvancedImageSession, correction: AdvancedImageCorrection): boolean {
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

function fallbackContractForCategory(category: AdvancedImageIntegrationCategory): string {
  if (category === "environmental") {
    return "Apply the requested atmospheric or stylistic change consistently across the full scene while preserving subjects, objects, composition and photographic continuity.";
  }
  if (category === "remove_object") {
    return "Remove the targeted element and reconstruct the background plausibly with matching texture, lighting, perspective and focus. Avoid visible boundaries.";
  }
  return "Integrate the requested change naturally into the photographed scene with matching scale, perspective, lighting, shadows, texture, focus, grain and color temperature.";
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}
