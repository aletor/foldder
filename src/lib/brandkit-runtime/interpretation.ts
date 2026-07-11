import type {
  BrandKitBoardMeta,
  BrandKitSourceType,
  ElementKey,
  EvidenceRef,
  InterpretationMeta,
  InterpretationStatus,
  SectionId,
} from "./types";
import { BRANDKIT_REF_CATEGORIES } from "./types";

export function createGhostMeta(): InterpretationMeta {
  return { status: "ghost", confidence: 0, evidence: [] };
}

export function createLegacyMeta(kind: EvidenceRef["kind"] = "legacy"): InterpretationMeta {
  return {
    status: "proposed",
    confidence: 0.5,
    evidence: [{ sourceId: "legacy", kind, detail: "legacy", confidence: 0.5, extractedAt: new Date(0).toISOString() }],
    proposedAt: new Date(0).toISOString(),
  };
}

export function createValidatedMeta(sourceId = "user", detail?: string): InterpretationMeta {
  const now = new Date().toISOString();
  return {
    status: "validated",
    confidence: 1,
    evidence: [{ sourceId, kind: "user", detail, confidence: 1, extractedAt: now }],
    validatedAt: now,
  };
}

export function emptyBrandKitBoardMeta(): BrandKitBoardMeta {
  return {
    interpretation: {},
    review: { pending: 0, conflicts: 0 },
    board: { sectionSeq: {}, sectionState: {} },
  };
}

export function normalizeBrandKitBoardMeta(raw: unknown): BrandKitBoardMeta {
  const base = emptyBrandKitBoardMeta();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const interpretation =
    r.interpretation && typeof r.interpretation === "object" && !Array.isArray(r.interpretation)
      ? (r.interpretation as Record<ElementKey, InterpretationMeta>)
      : base.interpretation;
  const reviewRaw = r.review && typeof r.review === "object" ? (r.review as Record<string, unknown>) : {};
  const boardRaw = r.board && typeof r.board === "object" ? (r.board as Record<string, unknown>) : {};
  const meta: BrandKitBoardMeta = {
    interpretation,
    review: {
      pending: typeof reviewRaw.pending === "number" ? reviewRaw.pending : 0,
      conflicts: typeof reviewRaw.conflicts === "number" ? reviewRaw.conflicts : 0,
    },
    board: {
      lastRunId: typeof boardRaw.lastRunId === "string" ? boardRaw.lastRunId : undefined,
      sectionSeq:
        boardRaw.sectionSeq && typeof boardRaw.sectionSeq === "object"
          ? (boardRaw.sectionSeq as BrandKitBoardMeta["board"]["sectionSeq"])
          : {},
      sectionState:
        boardRaw.sectionState && typeof boardRaw.sectionState === "object"
          ? (boardRaw.sectionState as BrandKitBoardMeta["board"]["sectionState"])
          : {},
    },
  };
  return { ...meta, review: recountReview(meta.interpretation) };
}

export function getMeta(boardMeta: BrandKitBoardMeta | undefined, key: ElementKey): InterpretationMeta {
  return boardMeta?.interpretation[key] ?? createGhostMeta();
}

export function statusWeight(status: InterpretationStatus): number {
  if (status === "validated") return 1;
  if (status === "proposed") return 0.7;
  if (status === "conflict") return 0.5;
  if (status === "rejected") return 0;
  return 0;
}

export function recountReview(interpretation: Record<ElementKey, InterpretationMeta>): {
  pending: number;
  conflicts: number;
} {
  let pending = 0;
  let conflicts = 0;
  for (const meta of Object.values(interpretation)) {
    if (meta.status === "proposed") pending += 1;
    if (meta.status === "conflict") conflicts += 1;
  }
  return { pending, conflicts };
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

export type SynthesisApplyInput = {
  key: ElementKey;
  nextValue: unknown;
  evidence?: EvidenceRef[];
  confidence?: number;
};

/** Aplica síntesis respetando validated (→ conflict) y proposed (→ overwrite + history). */
export function applySynthesisToSidecar(
  boardMeta: BrandKitBoardMeta,
  currentValue: unknown,
  input: SynthesisApplyInput,
): BrandKitBoardMeta {
  const prev = getMeta(boardMeta, input.key);
  const now = new Date().toISOString();
  const evidence = input.evidence?.length ? input.evidence : prev.evidence;
  const confidence = input.confidence ?? prev.confidence ?? 0.5;

  if (prev.status === "validated" && !valuesEqual(currentValue, input.nextValue)) {
    const nextMeta: InterpretationMeta = {
      status: "conflict",
      confidence,
      evidence: prev.evidence,
      validatedAt: prev.validatedAt,
      conflict: {
        candidates: [
          { value: currentValue, evidence: prev.evidence },
          { value: input.nextValue, evidence },
        ],
        raisedAt: now,
      },
    };
    return patchMeta(boardMeta, input.key, nextMeta);
  }

  if (prev.status === "validated" && valuesEqual(currentValue, input.nextValue)) {
    return boardMeta;
  }

  const history =
    prev.status === "proposed" && !valuesEqual(currentValue, input.nextValue)
      ? [...(prev.history ?? []), { value: currentValue, replacedAt: now }]
      : prev.history;

  const nextMeta: InterpretationMeta = {
    status: "proposed",
    confidence,
    evidence,
    proposedAt: now,
    history,
  };
  return patchMeta(boardMeta, input.key, nextMeta);
}

export function resolveConflict(
  boardMeta: BrandKitBoardMeta,
  key: ElementKey,
  chosenValue: unknown,
  evidence?: EvidenceRef[],
): BrandKitBoardMeta {
  const now = new Date().toISOString();
  const nextMeta: InterpretationMeta = {
    status: "validated",
    confidence: 1,
    evidence: evidence?.length ? evidence : [{ sourceId: "user", kind: "user", confidence: 1, extractedAt: now }],
    validatedAt: now,
  };
  return patchMeta(boardMeta, key, nextMeta);
}

export function markValidated(
  boardMeta: BrandKitBoardMeta,
  key: ElementKey,
  evidence?: EvidenceRef[],
): BrandKitBoardMeta {
  return patchMeta(boardMeta, key, createValidatedMeta("user", evidence?.[0]?.detail));
}

export function markRejected(
  boardMeta: BrandKitBoardMeta,
  key: ElementKey,
  evidence?: EvidenceRef[],
): BrandKitBoardMeta {
  const now = new Date().toISOString();
  return patchMeta(boardMeta, key, {
    status: "rejected",
    confidence: 0,
    evidence: evidence?.length
      ? evidence
      : [{ sourceId: "user", kind: "user", detail: "rejected", confidence: 0, extractedAt: now }],
  });
}

export function patchMeta(
  boardMeta: BrandKitBoardMeta,
  key: ElementKey,
  meta: InterpretationMeta,
): BrandKitBoardMeta {
  const interpretation = { ...boardMeta.interpretation, [key]: meta };
  return {
    ...boardMeta,
    interpretation,
    review: recountReview(interpretation),
  };
}

export function affectedSections(sourceType: BrandKitSourceType): SectionId[] {
  switch (sourceType) {
    case "url":
      return ["palette", "logo", "typography", "messages", "tone"];
    case "pdf":
    case "doc":
      return ["typography", "messages", "tone", "palette", "logo"];
    case "image":
      return [...BRANDKIT_REF_CATEGORIES.map((c) => `references.${c}` as SectionId), "palette"];
    case "logo":
      return ["logo"];
    default:
      return [];
  }
}

export function shouldApplySectionEvent(
  boardMeta: BrandKitBoardMeta,
  section: SectionId,
  runId: string,
  seq: number,
): boolean {
  const lastRun = boardMeta.board.lastRunId;
  const lastSeq = boardMeta.board.sectionSeq[section] ?? 0;
  if (lastRun && runId < lastRun) return false;
  if (lastRun === runId && seq < lastSeq) return false;
  return true;
}

export function recordSectionEvent(
  boardMeta: BrandKitBoardMeta,
  section: SectionId,
  runId: string,
  seq: number,
): BrandKitBoardMeta {
  return {
    ...boardMeta,
    board: {
      ...boardMeta.board,
      lastRunId: runId,
      sectionSeq: { ...boardMeta.board.sectionSeq, [section]: seq },
    },
  };
}
