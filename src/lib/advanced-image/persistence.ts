import {
  assertAdvancedImageSessionInvariants,
  listAdvancedImageSessionInvariantViolations,
  stableHash,
  updateAdvancedImageGlobalAdjustment,
  type AdvancedImageSession,
  type AdvancedImageSessionState,
} from "./domain";

export type AdvancedImageSessionSnapshot = AdvancedImageSession;

export type AdvancedImagePersistenceFingerprintOptions = {
  includeUndoRedo?: boolean;
  includeWorkingImage?: boolean;
};

export type AdvancedImageSerializeOptions = {
  includeUndoRedo?: boolean;
};

export type AdvancedImagePersistenceIssue = {
  code:
    | "INVALID_JSON"
    | "INVALID_SCHEMA"
    | "SESSION_INVARIANT_FAILED";
  detail: string;
};

export type AdvancedImageParseSessionResult =
  | {
      ok: true;
      session: AdvancedImageSession;
    }
  | {
      issues: AdvancedImagePersistenceIssue[];
      ok: false;
    };

export function createAdvancedImageSessionSnapshot(
  session: AdvancedImageSession,
  options: AdvancedImageSerializeOptions = {},
): AdvancedImageSessionSnapshot {
  const snapshot = cloneJson(session);
  if (!options.includeUndoRedo) {
    snapshot.undoStack = [];
    snapshot.redoStack = [];
  }
  return assertAdvancedImageSessionInvariants(snapshot);
}

export function serializeAdvancedImageSession(
  session: AdvancedImageSession,
  options: AdvancedImageSerializeOptions = {},
): string {
  return JSON.stringify(createAdvancedImageSessionSnapshot(session, options));
}

export function parseAdvancedImageSessionJson(json: string): AdvancedImageParseSessionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return {
      issues: [
        {
          code: "INVALID_JSON",
          detail: error instanceof Error ? error.message : "Invalid advanced image session JSON.",
        },
      ],
      ok: false,
    };
  }
  return restoreAdvancedImageSession(parsed);
}

export function restoreAdvancedImageSession(value: unknown): AdvancedImageParseSessionResult {
  if (!isSessionLike(value)) {
    return {
      issues: [
        {
          code: "INVALID_SCHEMA",
          detail: "Advanced image session snapshot is missing required schema fields.",
        },
      ],
      ok: false,
    };
  }

  const base = cloneJson(value as AdvancedImageSession);
  let session: AdvancedImageSession = {
    ...base,
    globalAdjustment: base.globalAdjustment ?? {
      lastModifiedAt: base.updatedAt,
      status: "draft",
      text: "",
    },
    historySnapshots: Array.isArray(base.historySnapshots) ? cloneJson(base.historySnapshots) : [],
    redoStack: Array.isArray(base.redoStack) ? cloneJson(base.redoStack) : [],
    undoStack: Array.isArray(base.undoStack) ? cloneJson(base.undoStack) : [],
  };
  if (!base.globalAdjustment) {
    session = updateAdvancedImageGlobalAdjustment(session, "", { timestamp: base.updatedAt });
    session.undoStack = [];
    session.redoStack = [];
    session.revision = base.revision;
  }
  const violations = listAdvancedImageSessionInvariantViolations(session);
  if (violations.length > 0) {
    return {
      issues: violations.map((violation) => ({
        code: "SESSION_INVARIANT_FAILED",
        detail: `${violation.code}: ${violation.detail}`,
      })),
      ok: false,
    };
  }
  return { ok: true, session };
}

export function stripAdvancedImageUndoRedo(session: AdvancedImageSession): AdvancedImageSession {
  return assertAdvancedImageSessionInvariants({
    ...cloneJson(session),
    redoStack: [],
    undoStack: [],
  });
}

export function computeAdvancedImageSessionPersistenceFingerprint(
  session: AdvancedImageSession,
  options: AdvancedImagePersistenceFingerprintOptions = {},
): string {
  const includeUndoRedo = options.includeUndoRedo ?? false;
  const includeWorkingImage = options.includeWorkingImage ?? true;
  const payload: AdvancedImageSessionState & Pick<AdvancedImageSession, "redoStack" | "undoStack"> = {
    archivedCorrectionGroups: session.archivedCorrectionGroups,
    corrections: session.corrections,
    generationSettings: session.generationSettings,
    globalAdjustment: session.globalAdjustment,
    historySnapshots: session.historySnapshots,
    id: session.id,
    master: session.master,
    redoStack: includeUndoRedo ? session.redoStack : [],
    revision: session.revision,
    schemaVersion: session.schemaVersion,
    undoStack: includeUndoRedo ? session.undoStack : [],
    updatedAt: session.updatedAt,
    workingImage: includeWorkingImage ? session.workingImage : undefined,
  };
  return stableHash(payload);
}

export function estimateAdvancedImageSessionStorageBytes(
  session: AdvancedImageSession,
  options: AdvancedImageSerializeOptions = {},
): number {
  return new TextEncoder().encode(serializeAdvancedImageSession(session, options)).byteLength;
}

function isSessionLike(value: unknown): value is Partial<AdvancedImageSession> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AdvancedImageSession>;
  return (
    candidate.schemaVersion === "advanced_image_session_v1" &&
    Boolean(candidate.id) &&
    Boolean(candidate.master) &&
    Array.isArray(candidate.corrections) &&
    Array.isArray(candidate.archivedCorrectionGroups) &&
    Boolean(candidate.generationSettings)
  );
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
