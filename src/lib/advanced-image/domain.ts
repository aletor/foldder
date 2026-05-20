export type AdvancedImageCorrectionStatus = "active" | "inactive";
export type AdvancedImagePinMode = "anchor" | "composite" | "regenerate";
export type AdvancedImageAnalysisStatus = "pending" | "ready" | "failed";
export type AdvancedImageGenerationStatus = "idle" | "generating" | "failed";
export type AdvancedImageGlobalAdjustmentStatus = "draft" | "applied";
export type AdvancedImageZoneTool = "freehand";
export type AdvancedImageIntegrationCategory =
  | "add_object"
  | "change_texture_material"
  | "environmental"
  | "modify_attribute"
  | "remove_object"
  | "substitute_object";

export type AdvancedImagePoint = {
  x: number;
  y: number;
};

export type AdvancedImageStroke = {
  closed?: boolean;
  id: string;
  points: AdvancedImagePoint[];
  radius: number;
  opacity?: number;
};

export type AdvancedImageBox = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type AdvancedImageZone = {
  areaRatio: number;
  bbox: AdvancedImageBox;
  geometryHash?: string;
  locationDescription: string;
  locationAnalysisHash?: string;
  locationAnalysisSource?: "analyze-areas" | "fallback";
  maskHash?: string;
  maskS3Key?: string;
  normalizedBBox: AdvancedImageBox;
  sourceSize: {
    height: number;
    width: number;
  };
  strokes: AdvancedImageStroke[];
  tool?: AdvancedImageZoneTool;
};

export type AdvancedImageMaster = {
  contentHash: string;
  createdAt: string;
  generationMetadata?: Record<string, unknown>;
  height: number;
  id: string;
  imageUrl: string;
  promotedAt?: string;
  promotedFromSessionId?: string;
  s3Key?: string;
  sourceModel?: string;
  sourcePrompt?: string;
  sourceResolution?: string;
  width: number;
};

export type AdvancedImageUserReferenceGrid = {
  createdAt: string;
  gridHash: string;
  gridImageUrl: string;
  gridImageUrlStable?: string;
  gridS3Key?: string;
  id: string;
  layout?: {
    borderPx: number;
    cellSize: number;
    columns: number;
    discardedImageCount: number;
    height: number;
    mimeType: string;
    rows: number;
    usedImageCount: number;
    width: number;
  };
  sourceImageCount: number;
};

export type AdvancedImageIdentityAnchor = {
  bbox: AdvancedImageBox;
  createdAt: string;
  cropHash: string;
  cropS3Key?: string;
  cropUrl: string;
  description: string;
  perceptualHash: string;
  sourceWorkingHash: string;
};

export type AdvancedImageIntegrationContract = {
  avoidList: string[];
  category: AdvancedImageIntegrationCategory;
  contract: string;
  generatedAt: string;
  generatedBy: string;
  needsBinaryMask: boolean;
  originalElement?: string;
  targetElement?: string;
};

export type AdvancedImageCorrection = {
  appliedBatchNumber?: number;
  analysisStatus: AdvancedImageAnalysisStatus;
  dependencies: string[];
  geometryHash: string;
  id: string;
  identityAnchor?: AdvancedImageIdentityAnchor;
  integrationContract?: AdvancedImageIntegrationContract;
  instructionHash: string;
  lastGenerationError?: string;
  lastGenerationStatus: AdvancedImageGenerationStatus;
  order: number;
  pinMode: AdvancedImagePinMode;
  referenceHash?: string;
  status: AdvancedImageCorrectionStatus;
  timestamp: string;
  userInstruction: string;
  userReference?: AdvancedImageUserReferenceGrid;
  zone: AdvancedImageZone;
};

export type AdvancedImageWorkingImage = {
  activeCorrectionIds: string[];
  correctionSnapshots?: Record<
    string,
    {
      geometryHash: string;
      instructionHash: string;
      referenceHash?: string;
    }
  >;
  generatedAt: string;
  height: number;
  imageUrl: string;
  model: string;
  resolution: string;
  s3Key?: string;
  sourceHash: string;
  width: number;
};

export type AdvancedImageGenerationSettings = {
  analysisModel: string;
  cropMaxSide: number;
  driftThreshold: number;
  maxReferenceImages: number;
  model: string;
  promptVersion: string;
  resolution: string;
};

export type AdvancedImageGlobalAdjustment = {
  appliedAt?: string;
  appliedInBatch?: number;
  lastModifiedAt: string;
  status: AdvancedImageGlobalAdjustmentStatus;
  text: string;
};

export type AdvancedImageArchivedCorrectionGroup = {
  corrections: AdvancedImageCorrection[];
  id: string;
  promotedAt: string;
  promotedWorkingImage?: AdvancedImageWorkingImage;
  sourceMaster: AdvancedImageMaster;
};

export type AdvancedImageHistorySnapshot = {
  activeCorrectionIds: string[];
  batchNumber: number;
  corrections: AdvancedImageCorrection[];
  createdAt: string;
  globalAdjustment: AdvancedImageGlobalAdjustment;
  id: string;
  masterContentHash: string;
  sourceHash: string;
  summary: string;
  workingImage: AdvancedImageWorkingImage;
};

export type AdvancedImageSessionState = {
  archivedCorrectionGroups: AdvancedImageArchivedCorrectionGroup[];
  corrections: AdvancedImageCorrection[];
  generationSettings: AdvancedImageGenerationSettings;
  globalAdjustment: AdvancedImageGlobalAdjustment;
  historySnapshots: AdvancedImageHistorySnapshot[];
  id: string;
  master: AdvancedImageMaster;
  revision: number;
  schemaVersion: "advanced_image_session_v1";
  updatedAt: string;
  workingImage?: AdvancedImageWorkingImage;
};

export type AdvancedImageUndoAction =
  | "addCorrection"
  | "editCorrection"
  | "toggleCorrection"
  | "reorderCorrections"
  | "removeCorrection"
  | "cloneCorrection"
  | "changePinMode"
  | "updateGlobalAdjustment"
  | "restoreHistorySnapshot"
  | "promoteToMaster";

export type AdvancedImageUndoStackEntry = {
  action: AdvancedImageUndoAction;
  after: AdvancedImageSessionState;
  before: AdvancedImageSessionState;
  id: string;
  timestamp: string;
};

export type AdvancedImageSession = AdvancedImageSessionState & {
  redoStack: AdvancedImageUndoStackEntry[];
  undoStack: AdvancedImageUndoStackEntry[];
};

export type AdvancedImageInvariantViolation = {
  code:
    | "MISSING_MASTER"
    | "DUPLICATE_CORRECTION_ID"
    | "INVALID_ORDER"
    | "MISSING_DEPENDENCY"
    | "SELF_DEPENDENCY"
    | "INACTIVE_DEPENDENCY"
    | "INVALID_ZONE"
    | "INVALID_HASH";
  correctionId?: string;
  detail: string;
};

export type AdvancedImageOperationMeta = {
  operationId?: string;
  timestamp: string;
};

export type AdvancedImageAddCorrectionInput = {
  dependencies?: string[];
  id: string;
  identityAnchor?: AdvancedImageIdentityAnchor;
  integrationContract?: AdvancedImageIntegrationContract;
  pinMode?: AdvancedImagePinMode;
  status?: AdvancedImageCorrectionStatus;
  timestamp: string;
  userInstruction: string;
  userReference?: AdvancedImageUserReferenceGrid;
  zone: AdvancedImageZone;
};

export type AdvancedImageEditCorrectionPatch = Partial<
  Pick<
    AdvancedImageCorrection,
    | "dependencies"
    | "identityAnchor"
    | "integrationContract"
    | "pinMode"
    | "status"
    | "userInstruction"
    | "userReference"
    | "zone"
  >
>;

export type AdvancedImageDependentStrategy = "deactivate" | "keep" | "remove";

export type AdvancedImageRuntimeMeta = {
  timestamp: string;
};

const DEFAULT_UNDO_DEPTH = 50;
const MAX_HISTORY_SNAPSHOTS = 20;

export function createAdvancedImageSession(args: {
  generationSettings: AdvancedImageGenerationSettings;
  id: string;
  master: AdvancedImageMaster;
  timestamp: string;
  workingImage?: AdvancedImageWorkingImage;
}): AdvancedImageSession {
  return assertAdvancedImageSessionInvariants({
    archivedCorrectionGroups: [],
    corrections: [],
    generationSettings: cloneJson(args.generationSettings),
    globalAdjustment: createDefaultAdvancedImageGlobalAdjustment(args.timestamp),
    historySnapshots: [],
    id: args.id,
    master: cloneJson(args.master),
    redoStack: [],
    revision: 0,
    schemaVersion: "advanced_image_session_v1",
    undoStack: [],
    updatedAt: args.timestamp,
    workingImage: args.workingImage ? cloneJson(args.workingImage) : undefined,
  });
}

export function updateAdvancedImageGlobalAdjustment(
  session: AdvancedImageSession,
  text: string,
  meta: AdvancedImageOperationMeta,
): AdvancedImageSession {
  return commitSessionChange(session, "updateGlobalAdjustment", meta, (draft) => {
    draft.globalAdjustment = normalizeGlobalAdjustment({
      ...draft.globalAdjustment,
      lastModifiedAt: meta.timestamp,
      status: "draft",
      text,
    }, meta.timestamp);
  });
}

export function clearAdvancedImageGlobalAdjustment(
  session: AdvancedImageSession,
  meta: AdvancedImageOperationMeta,
): AdvancedImageSession {
  return updateAdvancedImageGlobalAdjustment(session, "", meta);
}

export function addCorrection(
  session: AdvancedImageSession,
  input: AdvancedImageAddCorrectionInput,
  meta: AdvancedImageOperationMeta,
): AdvancedImageSession {
  return commitSessionChange(session, "addCorrection", meta, (draft) => {
    const correction = normalizeCorrectionInput(input, draft.corrections.length);
    draft.corrections.push(correction);
    draft.corrections = normalizeCorrectionOrder(draft.corrections);
  });
}

export function editCorrection(
  session: AdvancedImageSession,
  correctionId: string,
  patch: AdvancedImageEditCorrectionPatch,
  meta: AdvancedImageOperationMeta,
): AdvancedImageSession {
  return commitSessionChange(session, "editCorrection", meta, (draft) => {
    const index = findCorrectionIndexOrThrow(draft, correctionId);
    const previous = draft.corrections[index];
    const contentChanged =
      patch.zone !== undefined ||
      patch.userInstruction !== undefined ||
      patch.userReference !== undefined;
    const next: AdvancedImageCorrection = normalizeCorrection({
      ...previous,
      ...cloneJson(patch),
      identityAnchor:
        patch.identityAnchor !== undefined
          ? patch.identityAnchor
          : contentChanged
            ? undefined
            : previous.identityAnchor,
      integrationContract:
        patch.integrationContract !== undefined
          ? patch.integrationContract
          : contentChanged
            ? undefined
            : previous.integrationContract,
      analysisStatus:
        patch.identityAnchor !== undefined
          ? "ready"
          : contentChanged
            ? "pending"
            : previous.analysisStatus,
      lastGenerationStatus: "idle",
      order: previous.order,
    });
    draft.corrections[index] = next;
    draft.corrections = normalizeCorrectionOrder(draft.corrections);
  });
}

export function toggleCorrection(
  session: AdvancedImageSession,
  correctionId: string,
  meta: AdvancedImageOperationMeta,
  options: { dependentStrategy?: Exclude<AdvancedImageDependentStrategy, "remove">; status?: AdvancedImageCorrectionStatus } = {},
): AdvancedImageSession {
  return commitSessionChange(session, "toggleCorrection", meta, (draft) => {
    const index = findCorrectionIndexOrThrow(draft, correctionId);
    const nextStatus =
      options.status ?? (draft.corrections[index].status === "active" ? "inactive" : "active");
    draft.corrections[index] = { ...draft.corrections[index], status: nextStatus };

    if (nextStatus === "inactive" && options.dependentStrategy !== "keep") {
      const dependentIds = collectDependentIds(draft.corrections, [correctionId]);
      draft.corrections = draft.corrections.map((correction) =>
        dependentIds.has(correction.id) ? { ...correction, status: "inactive" } : correction,
      );
    }

    if (nextStatus === "active") {
      const dependencyIds = new Set(draft.corrections[index].dependencies);
      draft.corrections = draft.corrections.map((correction) =>
        dependencyIds.has(correction.id) ? { ...correction, status: "active" } : correction,
      );
    }

  });
}

export function reorderCorrections(
  session: AdvancedImageSession,
  orderedIds: string[],
  meta: AdvancedImageOperationMeta,
): AdvancedImageSession {
  return commitSessionChange(session, "reorderCorrections", meta, (draft) => {
    const currentIds = draft.corrections.map((correction) => correction.id).sort();
    const nextIds = [...orderedIds].sort();
    if (currentIds.join("\u0000") !== nextIds.join("\u0000")) {
      throw new Error("orderedIds must contain exactly the current correction IDs");
    }
    const byId = new Map(draft.corrections.map((correction) => [correction.id, correction]));
    draft.corrections = orderedIds.map((id, order) => ({ ...byId.get(id)!, order }));
  });
}

export function removeCorrection(
  session: AdvancedImageSession,
  correctionId: string,
  meta: AdvancedImageOperationMeta,
  options: { dependentStrategy?: AdvancedImageDependentStrategy } = {},
): AdvancedImageSession {
  return commitSessionChange(session, "removeCorrection", meta, (draft) => {
    findCorrectionIndexOrThrow(draft, correctionId);
    const dependentStrategy = options.dependentStrategy ?? "deactivate";
    const removedIds = new Set([correctionId]);
    if (dependentStrategy === "remove") {
      for (const id of collectDependentIds(draft.corrections, [correctionId])) removedIds.add(id);
    }

    draft.corrections = draft.corrections
      .filter((correction) => !removedIds.has(correction.id))
      .map((correction) => {
        const dependencies = correction.dependencies.filter((dependencyId) => !removedIds.has(dependencyId));
        const shouldDeactivate =
          dependentStrategy === "deactivate" && correction.dependencies.includes(correctionId);
        return {
          ...correction,
          dependencies,
          status: shouldDeactivate ? "inactive" : correction.status,
        };
      });
    draft.corrections = normalizeCorrectionOrder(draft.corrections);
  });
}

export function cloneCorrection(
  session: AdvancedImageSession,
  correctionId: string,
  args: { id: string; insertAfterId?: string; timestamp: string },
  meta: AdvancedImageOperationMeta,
): AdvancedImageSession {
  return commitSessionChange(session, "cloneCorrection", meta, (draft) => {
    const sourceIndex = findCorrectionIndexOrThrow(draft, correctionId);
    const source = draft.corrections[sourceIndex];
    const insertAfterIndex =
      args.insertAfterId === undefined ? sourceIndex : findCorrectionIndexOrThrow(draft, args.insertAfterId);
    const clone: AdvancedImageCorrection = normalizeCorrection({
      ...cloneJson(source),
      id: args.id,
      order: insertAfterIndex + 1,
      timestamp: args.timestamp,
    });
    const next = [...draft.corrections];
    next.splice(insertAfterIndex + 1, 0, clone);
    draft.corrections = normalizeCorrectionOrder(next);
    draft.workingImage = undefined;
  });
}

export function changePinMode(
  session: AdvancedImageSession,
  correctionId: string,
  pinMode: AdvancedImagePinMode,
  meta: AdvancedImageOperationMeta,
): AdvancedImageSession {
  return commitSessionChange(session, "changePinMode", meta, (draft) => {
    const index = findCorrectionIndexOrThrow(draft, correctionId);
    draft.corrections[index] = { ...draft.corrections[index], pinMode };
    draft.workingImage = undefined;
  });
}

export function promoteToMaster(
  session: AdvancedImageSession,
  args: {
    archiveGroupId: string;
    newMaster: AdvancedImageMaster;
    promotedWorkingImage?: AdvancedImageWorkingImage;
  },
  meta: AdvancedImageOperationMeta,
): AdvancedImageSession {
  return commitSessionChange(session, "promoteToMaster", meta, (draft) => {
    draft.archivedCorrectionGroups.push({
      corrections: cloneJson(draft.corrections),
      id: args.archiveGroupId,
      promotedAt: meta.timestamp,
      promotedWorkingImage: args.promotedWorkingImage ? cloneJson(args.promotedWorkingImage) : undefined,
      sourceMaster: cloneJson(draft.master),
    });
    draft.master = cloneJson(args.newMaster);
    draft.corrections = [];
    draft.globalAdjustment = createDefaultAdvancedImageGlobalAdjustment(meta.timestamp);
    draft.historySnapshots = [];
    draft.workingImage = args.promotedWorkingImage ? cloneJson(args.promotedWorkingImage) : undefined;
  });
}

export function undo(session: AdvancedImageSession): AdvancedImageSession {
  const undoStack = Array.isArray(session.undoStack) ? session.undoStack : [];
  const redoStack = Array.isArray(session.redoStack) ? session.redoStack : [];
  const entry = undoStack[undoStack.length - 1];
  if (!entry) return session;
  return assertAdvancedImageSessionInvariants({
    ...cloneJson(entry.before),
    redoStack: [...redoStack, entry],
    undoStack: undoStack.slice(0, -1),
  });
}

export function redo(session: AdvancedImageSession): AdvancedImageSession {
  const undoStack = Array.isArray(session.undoStack) ? session.undoStack : [];
  const redoStack = Array.isArray(session.redoStack) ? session.redoStack : [];
  const entry = redoStack[redoStack.length - 1];
  if (!entry) return session;
  return assertAdvancedImageSessionInvariants({
    ...cloneJson(entry.after),
    redoStack: redoStack.slice(0, -1),
    undoStack: [...undoStack, entry].slice(-DEFAULT_UNDO_DEPTH),
  });
}

export function setAdvancedImageWorkingImage(
  session: AdvancedImageSession,
  workingImage: AdvancedImageWorkingImage | undefined,
  meta: AdvancedImageRuntimeMeta,
): AdvancedImageSession {
  assertAdvancedImageSessionInvariants(session);
  return assertAdvancedImageSessionInvariants({
    ...cloneJson(session),
    revision: session.revision + 1,
    updatedAt: meta.timestamp,
    workingImage: workingImage ? cloneJson(workingImage) : undefined,
  });
}

export function appendAdvancedImageHistorySnapshot(
  session: AdvancedImageSession,
  args: { summary?: string } = {},
  meta: AdvancedImageRuntimeMeta,
): AdvancedImageSession {
  assertAdvancedImageSessionInvariants(session);
  if (!session.workingImage) return session;
  const batchNumber = getLatestGeneratedBatchNumber(session);
  const workingImage = cloneJson(session.workingImage);
  const snapshot: AdvancedImageHistorySnapshot = {
    activeCorrectionIds: [...workingImage.activeCorrectionIds],
    batchNumber,
    corrections: normalizeCorrectionOrder(cloneJson(session.corrections)),
    createdAt: meta.timestamp,
    globalAdjustment: normalizeGlobalAdjustment(session.globalAdjustment, meta.timestamp),
    id: `history-${stableHash({
      batchNumber,
      sessionId: session.id,
      sourceHash: workingImage.sourceHash,
      timestamp: meta.timestamp,
    }).slice(0, 16)}`,
    masterContentHash: session.master.contentHash,
    sourceHash: workingImage.sourceHash,
    summary: args.summary ?? createHistorySummary(session, batchNumber),
    workingImage,
  };
  const previous = getHistorySnapshots(session).filter(
    (item) => item.id !== snapshot.id && item.sourceHash !== snapshot.sourceHash,
  );
  return assertAdvancedImageSessionInvariants({
    ...cloneJson(session),
    historySnapshots: [...previous, snapshot].slice(-MAX_HISTORY_SNAPSHOTS),
    revision: session.revision + 1,
    updatedAt: meta.timestamp,
  });
}

export function restoreAdvancedImageHistorySnapshot(
  session: AdvancedImageSession,
  snapshotId: string,
  meta: AdvancedImageOperationMeta,
): AdvancedImageSession {
  const history = getHistorySnapshots(session);
  const snapshotIndex = history.findIndex((item) => item.id === snapshotId);
  const snapshot = history[snapshotIndex];
  if (!snapshot) throw new Error(`History snapshot '${snapshotId}' not found`);
  return commitSessionChange(session, "restoreHistorySnapshot", meta, (draft) => {
    draft.corrections = normalizeCorrectionOrder(
      snapshot.corrections.map((correction) =>
        mergeCurrentCorrectionRuntimeIntoSnapshot(correction, session.corrections.find((item) => item.id === correction.id)),
      ),
    );
    draft.globalAdjustment = normalizeGlobalAdjustment(snapshot.globalAdjustment, meta.timestamp);
    draft.historySnapshots = history.slice(0, snapshotIndex + 1);
    draft.workingImage = cloneJson(snapshot.workingImage);
  });
}

export function markAdvancedImageGlobalAdjustmentApplied(
  session: AdvancedImageSession,
  args: { batchNumber: number; timestamp: string },
): AdvancedImageSession {
  assertAdvancedImageSessionInvariants(session);
  return assertAdvancedImageSessionInvariants({
    ...cloneJson(session),
    globalAdjustment: normalizeGlobalAdjustment({
      ...session.globalAdjustment,
      appliedAt: args.timestamp,
      appliedInBatch: args.batchNumber,
      status: "applied",
    }, args.timestamp),
    revision: session.revision + 1,
    updatedAt: args.timestamp,
  });
}

export function markAdvancedImageCorrectionRuntime(
  session: AdvancedImageSession,
  correctionId: string,
  patch: {
    analysisStatus?: AdvancedImageAnalysisStatus;
    identityAnchor?: AdvancedImageIdentityAnchor;
    integrationContract?: AdvancedImageIntegrationContract;
    lastGenerationError?: string | null;
    lastGenerationStatus?: AdvancedImageGenerationStatus;
  },
  meta: AdvancedImageRuntimeMeta,
): AdvancedImageSession {
  assertAdvancedImageSessionInvariants(session);
  const corrections = session.corrections.map((correction) => {
    if (correction.id !== correctionId) return correction;
    return normalizeCorrection({
      ...correction,
      analysisStatus:
        patch.identityAnchor !== undefined ? "ready" : patch.analysisStatus ?? correction.analysisStatus,
      identityAnchor: patch.identityAnchor !== undefined ? patch.identityAnchor : correction.identityAnchor,
      integrationContract:
        patch.integrationContract !== undefined ? patch.integrationContract : correction.integrationContract,
      lastGenerationError:
        patch.lastGenerationError === null
          ? undefined
          : patch.lastGenerationError !== undefined
            ? patch.lastGenerationError
            : correction.lastGenerationError,
      lastGenerationStatus: patch.lastGenerationStatus ?? correction.lastGenerationStatus,
    });
  });
  if (!corrections.some((correction) => correction.id === correctionId)) {
    throw new Error(`Correction '${correctionId}' does not exist.`);
  }
  return assertAdvancedImageSessionInvariants({
    ...cloneJson(session),
    corrections,
    revision: session.revision + 1,
    updatedAt: meta.timestamp,
  });
}

export function assignAdvancedImageAppliedBatchNumber(
  session: AdvancedImageSession,
  correctionIds: string[],
  batchNumber: number,
  meta: AdvancedImageRuntimeMeta,
): AdvancedImageSession {
  assertAdvancedImageSessionInvariants(session);
  const wanted = new Set(correctionIds);
  const corrections = session.corrections.map((correction) =>
    wanted.has(correction.id)
      ? normalizeCorrection({
          ...correction,
          appliedBatchNumber: batchNumber,
        })
      : correction,
  );
  return assertAdvancedImageSessionInvariants({
    ...cloneJson(session),
    corrections,
    revision: session.revision + 1,
    updatedAt: meta.timestamp,
  });
}

export function listAdvancedImageSessionInvariantViolations(
  session: AdvancedImageSession,
): AdvancedImageInvariantViolation[] {
  const violations: AdvancedImageInvariantViolation[] = [];
  if (!session.master?.id || !session.master.contentHash || !session.master.imageUrl) {
    violations.push({ code: "MISSING_MASTER", detail: "Session must have a master with id, imageUrl and contentHash." });
  }

  const ids = new Set<string>();
  for (const correction of session.corrections) {
    if (ids.has(correction.id)) {
      violations.push({
        code: "DUPLICATE_CORRECTION_ID",
        correctionId: correction.id,
        detail: `Correction id '${correction.id}' is duplicated.`,
      });
    }
    ids.add(correction.id);

    if (!correction.geometryHash || correction.geometryHash !== computeZoneGeometryHash(correction.zone)) {
      violations.push({
        code: "INVALID_HASH",
        correctionId: correction.id,
        detail: "Correction geometryHash does not match its zone.",
      });
    }
    if (!correction.instructionHash || correction.instructionHash !== computeInstructionHash(correction.userInstruction)) {
      violations.push({
        code: "INVALID_HASH",
        correctionId: correction.id,
        detail: "Correction instructionHash does not match its instruction.",
      });
    }
    if (correction.userReference && correction.referenceHash !== computeReferenceHash(correction.userReference)) {
      violations.push({
        code: "INVALID_HASH",
        correctionId: correction.id,
        detail: "Correction referenceHash does not match its userReference.",
      });
    }
    if (correction.dependencies.includes(correction.id)) {
      violations.push({
        code: "SELF_DEPENDENCY",
        correctionId: correction.id,
        detail: "A correction cannot depend on itself.",
      });
    }
    if (!isValidZone(correction.zone)) {
      violations.push({
        code: "INVALID_ZONE",
        correctionId: correction.id,
        detail: "Zone must have a valid source size, bbox, normalized bbox and vector strokes.",
      });
    }
  }

  const sortedOrders = session.corrections.map((correction) => correction.order).sort((a, b) => a - b);
  for (let order = 0; order < sortedOrders.length; order += 1) {
    if (sortedOrders[order] !== order) {
      violations.push({ code: "INVALID_ORDER", detail: "Correction order must be contiguous and zero-based." });
      break;
    }
  }

  const byId = new Map(session.corrections.map((correction) => [correction.id, correction]));
  for (const correction of session.corrections) {
    for (const dependencyId of correction.dependencies) {
      const dependency = byId.get(dependencyId);
      if (!dependency) {
        violations.push({
          code: "MISSING_DEPENDENCY",
          correctionId: correction.id,
          detail: `Dependency '${dependencyId}' does not exist.`,
        });
      } else if (correction.status === "active" && dependency.status !== "active") {
        violations.push({
          code: "INACTIVE_DEPENDENCY",
          correctionId: correction.id,
          detail: `Active correction depends on inactive correction '${dependencyId}'.`,
        });
      }
    }
  }

  return violations;
}

export function assertAdvancedImageSessionInvariants<T extends AdvancedImageSession>(session: T): T {
  const violations = listAdvancedImageSessionInvariantViolations(session);
  if (violations.length > 0) {
    throw new Error(`Advanced image session invariant failed: ${violations[0].code} ${violations[0].detail}`);
  }
  return session;
}

export function computeZoneGeometryHash(zone: AdvancedImageZone): string {
  return stableHash({
    areaRatio: roundNumber(zone.areaRatio),
    bbox: normalizeBox(zone.bbox),
    normalizedBBox: normalizeBox(zone.normalizedBBox),
    sourceSize: zone.sourceSize,
    strokes: zone.strokes.map((stroke) => ({
      id: stroke.id,
      opacity: stroke.opacity === undefined ? undefined : roundNumber(stroke.opacity),
      points: stroke.points.map((point) => ({ x: roundNumber(point.x), y: roundNumber(point.y) })),
      radius: roundNumber(stroke.radius),
    })),
    tool: zone.tool ?? "freehand",
  });
}

export function computeInstructionHash(instruction: string): string {
  return stableHash(normalizeInstruction(instruction));
}

export function computeReferenceHash(reference: AdvancedImageUserReferenceGrid): string {
  return stableHash({
    gridHash: reference.gridHash,
    id: reference.id,
    layout: reference.layout
      ? {
          borderPx: reference.layout.borderPx,
          cellSize: reference.layout.cellSize,
          columns: reference.layout.columns,
          discardedImageCount: reference.layout.discardedImageCount,
          height: reference.layout.height,
          mimeType: reference.layout.mimeType,
          rows: reference.layout.rows,
          usedImageCount: reference.layout.usedImageCount,
          width: reference.layout.width,
        }
      : undefined,
    sourceImageCount: reference.sourceImageCount,
  });
}

export function isAdvancedImageGlobalAdjustmentActive(session: AdvancedImageSession): boolean {
  return normalizeGlobalText(session.globalAdjustment?.text ?? "").length > 0;
}

export function isAdvancedImageGlobalAdjustmentPending(session: AdvancedImageSession): boolean {
  const global = normalizeGlobalAdjustment(session.globalAdjustment, session.updatedAt);
  const hasText = normalizeGlobalText(global.text).length > 0;
  if (hasText && global.status === "draft") return true;
  return !hasText && global.status === "draft" && Boolean(global.appliedAt);
}

export function getAdvancedImageGlobalAdjustmentHashInput(session: AdvancedImageSession): Record<string, unknown> {
  const global = normalizeGlobalAdjustment(session.globalAdjustment, session.updatedAt);
  return {
    activeText: normalizeGlobalText(global.text),
  };
}

export function computeGeminiGenerationStateHash(session: AdvancedImageSession): string {
  return stableHash({
    activeCorrections: activeCorrections(session).map((correction) => correctionGenerationHashInput(correction, "gemini")),
    master: {
      contentHash: session.master.contentHash,
      id: session.master.id,
    },
    globalAdjustment: getAdvancedImageGlobalAdjustmentHashInput(session),
    settings: {
      maxReferenceImages: session.generationSettings.maxReferenceImages,
      model: session.generationSettings.model,
      promptVersion: session.generationSettings.promptVersion,
      resolution: session.generationSettings.resolution,
    },
  });
}

export function computeFinalImageStateHash(session: AdvancedImageSession): string {
  return stableHash({
    geminiStateHash: computeGeminiGenerationStateHash(session),
    postComposite: activeCorrections(session).map((correction) => correctionGenerationHashInput(correction, "final")),
  });
}

export function stableHash(value: unknown): string {
  return `h1_${fnv1a53(stableStringify(value)).toString(36)}`;
}

function commitSessionChange(
  session: AdvancedImageSession,
  action: AdvancedImageUndoAction,
  meta: AdvancedImageOperationMeta,
  mutate: (draft: AdvancedImageSessionState) => void,
): AdvancedImageSession {
  assertAdvancedImageSessionInvariants(session);
  const undoStack = Array.isArray(session.undoStack) ? session.undoStack : [];
  const before = toSessionState(session);
  const draft = cloneJson(before);
  draft.globalAdjustment = normalizeGlobalAdjustment(draft.globalAdjustment, meta.timestamp);
  mutate(draft);
  draft.revision = before.revision + 1;
  draft.updatedAt = meta.timestamp;
  const after = assertAdvancedImageSessionInvariants({
    ...draft,
    redoStack: [],
    undoStack: [],
  });
  const entry: AdvancedImageUndoStackEntry = {
    action,
    after: toSessionState(after),
    before,
    id: meta.operationId ?? stableHash({ action, beforeRevision: before.revision, timestamp: meta.timestamp }),
    timestamp: meta.timestamp,
  };
  return assertAdvancedImageSessionInvariants({
    ...toSessionState(after),
    redoStack: [],
    undoStack: [...undoStack, entry].slice(-DEFAULT_UNDO_DEPTH),
  });
}

function normalizeCorrectionInput(input: AdvancedImageAddCorrectionInput, order: number): AdvancedImageCorrection {
  return normalizeCorrection({
    appliedBatchNumber: undefined,
    analysisStatus: input.identityAnchor ? "ready" : "pending",
    dependencies: input.dependencies ?? [],
    geometryHash: "",
    id: input.id,
    identityAnchor: input.identityAnchor,
    integrationContract: input.integrationContract,
    instructionHash: "",
    lastGenerationStatus: "idle",
    order,
    pinMode: input.pinMode ?? "anchor",
    referenceHash: undefined,
    status: input.status ?? "active",
    timestamp: input.timestamp,
    userInstruction: input.userInstruction,
    userReference: input.userReference,
    zone: input.zone,
  });
}

function createDefaultAdvancedImageGlobalAdjustment(timestamp: string): AdvancedImageGlobalAdjustment {
  return {
    lastModifiedAt: timestamp,
    status: "draft",
    text: "",
  };
}

function normalizeGlobalAdjustment(
  adjustment: AdvancedImageGlobalAdjustment | undefined,
  fallbackTimestamp: string,
): AdvancedImageGlobalAdjustment {
  const status = adjustment?.status === "applied" ? "applied" : "draft";
  const appliedInBatch =
    typeof adjustment?.appliedInBatch === "number" && adjustment.appliedInBatch > 0
      ? Math.floor(adjustment.appliedInBatch)
      : undefined;
  return {
    appliedAt: adjustment?.appliedAt || undefined,
    appliedInBatch,
    lastModifiedAt: adjustment?.lastModifiedAt || fallbackTimestamp,
    status,
    text: normalizeGlobalText(adjustment?.text ?? ""),
  };
}

function normalizeGlobalText(text: string | undefined): string {
  return (text ?? "").trim().replace(/\s+/g, " ");
}

function normalizeCorrection(correction: AdvancedImageCorrection & { strictZoneBoundary?: unknown }): AdvancedImageCorrection {
  const cloned = cloneJson(correction) as AdvancedImageCorrection & { strictZoneBoundary?: unknown };
  const { strictZoneBoundary: _strictZoneBoundary, ...rest } = cloned;
  const zone: AdvancedImageZone = { ...cloneJson(correction.zone), tool: "freehand" };
  return {
    ...rest,
    appliedBatchNumber:
      typeof correction.appliedBatchNumber === "number" && correction.appliedBatchNumber > 0
        ? Math.floor(correction.appliedBatchNumber)
        : undefined,
    dependencies: uniqueSorted(correction.dependencies ?? []),
    geometryHash: computeZoneGeometryHash(zone),
    integrationContract: normalizeIntegrationContract(correction.integrationContract),
    instructionHash: computeInstructionHash(correction.userInstruction),
    pinMode: correction.pinMode ?? "anchor",
    referenceHash: correction.userReference ? computeReferenceHash(correction.userReference) : undefined,
    userInstruction: normalizeInstruction(correction.userInstruction),
    zone,
  };
}

function normalizeIntegrationContract(
  contract: AdvancedImageIntegrationContract | undefined,
): AdvancedImageIntegrationContract | undefined {
  if (!contract) return undefined;
  const categories = new Set<AdvancedImageIntegrationCategory>([
    "add_object",
    "change_texture_material",
    "environmental",
    "modify_attribute",
    "remove_object",
    "substitute_object",
  ]);
  const category = categories.has(contract.category) ? contract.category : "modify_attribute";
  return {
    avoidList: (contract.avoidList ?? []).map((item) => normalizeInstruction(item)).filter(Boolean).slice(0, 3),
    category,
    contract: normalizeInstruction(contract.contract).slice(0, 900),
    generatedAt: contract.generatedAt || new Date(0).toISOString(),
    generatedBy: normalizeInstruction(contract.generatedBy || "unknown"),
    needsBinaryMask: Boolean(contract.needsBinaryMask),
    originalElement: normalizeInstruction(contract.originalElement ?? "").slice(0, 240) || undefined,
    targetElement: normalizeInstruction(contract.targetElement ?? "").slice(0, 240) || undefined,
  };
}

function normalizeCorrectionOrder(corrections: AdvancedImageCorrection[]): AdvancedImageCorrection[] {
  return corrections
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((correction, order) => ({ ...correction, order }));
}

function correctionGenerationHashInput(
  correction: AdvancedImageCorrection,
  scope: "final" | "gemini",
): Record<string, unknown> {
  const normalizedPinMode =
    scope === "gemini" && correction.pinMode === "composite" ? "anchor" : correction.pinMode;
  return {
    dependencies: correction.dependencies,
    geometryHash: correction.geometryHash,
    id: correction.id,
    identityAnchor: correction.identityAnchor
      ? {
          cropHash: correction.identityAnchor.cropHash,
          description: correction.identityAnchor.description,
          perceptualHash: correction.identityAnchor.perceptualHash,
        }
      : null,
    integrationContract: correction.integrationContract
      ? {
          avoidList: correction.integrationContract.avoidList,
          category: correction.integrationContract.category,
          contract: correction.integrationContract.contract,
          generatedBy: correction.integrationContract.generatedBy,
          needsBinaryMask: correction.integrationContract.needsBinaryMask,
          originalElement: correction.integrationContract.originalElement ?? null,
          targetElement: correction.integrationContract.targetElement ?? null,
        }
      : null,
    instructionHash: correction.instructionHash,
    order: correction.order,
    pinMode: normalizedPinMode,
    referenceHash: correction.referenceHash ?? null,
  };
}

function activeCorrections(session: AdvancedImageSession): AdvancedImageCorrection[] {
  return session.corrections
    .filter((correction) => correction.status === "active")
    .sort((a, b) => a.order - b.order);
}

function collectDependentIds(corrections: AdvancedImageCorrection[], rootIds: string[]): Set<string> {
  const roots = new Set(rootIds);
  const dependents = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const correction of corrections) {
      if (roots.has(correction.id) || dependents.has(correction.id)) continue;
      if (correction.dependencies.some((dependencyId) => roots.has(dependencyId) || dependents.has(dependencyId))) {
        dependents.add(correction.id);
        changed = true;
      }
    }
  }
  return dependents;
}

function findCorrectionIndexOrThrow(session: AdvancedImageSessionState, correctionId: string): number {
  const index = session.corrections.findIndex((correction) => correction.id === correctionId);
  if (index < 0) throw new Error(`Correction '${correctionId}' not found`);
  return index;
}

function isValidZone(zone: AdvancedImageZone): boolean {
  return (
    zone.sourceSize.width > 0 &&
    zone.sourceSize.height > 0 &&
    zone.bbox.width >= 0 &&
    zone.bbox.height >= 0 &&
    zone.normalizedBBox.width >= 0 &&
    zone.normalizedBBox.height >= 0 &&
    zone.areaRatio >= 0 &&
    zone.areaRatio <= 1 &&
    Array.isArray(zone.strokes) &&
    zone.strokes.every((stroke) => stroke.radius > 0 && stroke.points.length > 0)
  );
}

function toSessionState(session: AdvancedImageSession): AdvancedImageSessionState {
  return cloneJson({
    archivedCorrectionGroups: session.archivedCorrectionGroups,
    corrections: session.corrections,
    generationSettings: session.generationSettings,
    globalAdjustment: normalizeGlobalAdjustment(session.globalAdjustment, session.updatedAt),
    historySnapshots: getHistorySnapshots(session),
    id: session.id,
    master: session.master,
    revision: session.revision,
    schemaVersion: session.schemaVersion,
    updatedAt: session.updatedAt,
    workingImage: session.workingImage,
  });
}

function normalizeInstruction(instruction: string): string {
  return instruction.trim().replace(/\s+/g, " ");
}

function getHistorySnapshots(session: Pick<AdvancedImageSessionState, "historySnapshots">): AdvancedImageHistorySnapshot[] {
  return Array.isArray(session.historySnapshots) ? cloneJson(session.historySnapshots) : [];
}

function getLatestGeneratedBatchNumber(session: AdvancedImageSession): number {
  const correctionBatch = session.corrections.reduce(
    (max, correction) => Math.max(max, correction.appliedBatchNumber ?? 0),
    0,
  );
  const globalBatch = session.globalAdjustment?.appliedInBatch ?? 0;
  const historyBatch = getHistorySnapshots(session).reduce((max, snapshot) => Math.max(max, snapshot.batchNumber), 0);
  return Math.max(1, correctionBatch, globalBatch, historyBatch);
}

function createHistorySummary(session: AdvancedImageSession, batchNumber: number): string {
  const activeCount = session.workingImage?.activeCorrectionIds.length ?? 0;
  const global = isAdvancedImageGlobalAdjustmentActive(session) ? " + global" : "";
  if (activeCount === 0 && global) return `Global adjustment batch #${batchNumber}`;
  return `${activeCount} active correction${activeCount === 1 ? "" : "s"}${global}`;
}

function mergeCurrentCorrectionRuntimeIntoSnapshot(
  snapshotCorrection: AdvancedImageCorrection,
  currentCorrection: AdvancedImageCorrection | undefined,
): AdvancedImageCorrection {
  if (
    !currentCorrection ||
    currentCorrection.geometryHash !== snapshotCorrection.geometryHash ||
    currentCorrection.instructionHash !== snapshotCorrection.instructionHash ||
    currentCorrection.referenceHash !== snapshotCorrection.referenceHash
  ) {
    return normalizeCorrection(cloneJson(snapshotCorrection));
  }
  return normalizeCorrection({
    ...cloneJson(snapshotCorrection),
    analysisStatus: currentCorrection.identityAnchor ? "ready" : snapshotCorrection.analysisStatus,
    identityAnchor: currentCorrection.identityAnchor ?? snapshotCorrection.identityAnchor,
    lastGenerationError: currentCorrection.lastGenerationError ?? snapshotCorrection.lastGenerationError,
    lastGenerationStatus: currentCorrection.lastGenerationStatus,
  });
}

function normalizeBox(box: AdvancedImageBox): AdvancedImageBox {
  return {
    height: roundNumber(box.height),
    width: roundNumber(box.width),
    x: roundNumber(box.x),
    y: roundNumber(box.y),
  };
}

function roundNumber(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 1_000_000) / 1_000_000 : 0;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
}

function fnv1a53(input: string): number {
  let hash = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x100000001b3");
  const mask = BigInt("0xffffffffffffffff");
  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return Number(hash % BigInt(Number.MAX_SAFE_INTEGER));
}
