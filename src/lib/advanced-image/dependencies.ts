import type {
  AdvancedImageCorrection,
  AdvancedImageSession,
  AdvancedImageZone,
} from "./domain";
import { computeZoneOverlapMetrics, type AdvancedImageZoneOverlapMetrics } from "./mask";

export type AdvancedImageDependencyCandidateSource = "geometric" | "semantic";

export type AdvancedImageDependencyCandidate = {
  confidence: number;
  correctionId: string;
  metrics?: AdvancedImageZoneOverlapMetrics;
  preselected: boolean;
  reasons: string[];
  sources: AdvancedImageDependencyCandidateSource[];
};

export type AdvancedImageDependencyDetectionInput = {
  currentCorrectionId?: string;
  userInstruction?: string;
  zone?: AdvancedImageZone;
};

export type AdvancedImageSemanticDependencyRequest = {
  currentCorrectionId?: string;
  currentInstruction: string;
  currentZoneDescription?: string;
  previousCorrections: Array<{
    id: string;
    instruction: string;
    order: number;
    zoneDescription: string;
  }>;
};

export type AdvancedImageSemanticDependencyResult = {
  dependencyIds: string[];
  rationaleById?: Record<string, string>;
  raw?: unknown;
};

export type AdvancedImageSemanticDependencyTransport = (
  request: AdvancedImageSemanticDependencyRequest,
  context: AdvancedImageDependencyDetectionContext,
) => Promise<AdvancedImageSemanticDependencyResult>;

export type AdvancedImageDependencyDetectionContext = {
  requestId: string;
  signal?: AbortSignal;
  userEmail: string;
};

export type AdvancedImageDependencyDetectionOptions = {
  geometric?: {
    containmentThreshold?: number;
    overlapOldThreshold?: number;
    sampleSize?: number;
  };
  semanticApproval?: {
    approved: boolean;
    reason: "dependency_detection" | "manual_retry";
  };
  semanticTransport?: AdvancedImageSemanticDependencyTransport;
  requestId?: string;
  signal?: AbortSignal;
  userEmail?: string;
};

export type AdvancedImageDependencyDetectionIssue = {
  code:
    | "CURRENT_CORRECTION_NOT_FOUND"
    | "SEMANTIC_NOT_APPROVED"
    | "SEMANTIC_REQUEST_NOT_ELIGIBLE"
    | "SEMANTIC_TRANSPORT_FAILED"
    | "SEMANTIC_TRANSPORT_MISSING"
    | "UNKNOWN_SEMANTIC_DEPENDENCY"
    | "USER_MISSING"
    | "REQUEST_ID_MISSING"
    | "ZONE_MISSING";
  correctionId?: string;
  dependencyId?: string;
  detail: string;
};

export type AdvancedImageDependencyDetectionResult = {
  candidates: AdvancedImageDependencyCandidate[];
  issues: AdvancedImageDependencyDetectionIssue[];
  semantic: {
    attempted: boolean;
    skippedReason?: "geometric_candidates_found" | "not_eligible" | "no_previous_corrections";
  };
};

const DEFAULT_OVERLAP_OLD_THRESHOLD = 0.3;
const DEFAULT_CONTAINMENT_THRESHOLD = 0.98;
const REFERENCE_TOKENS = new Set([
  "again",
  "anterior",
  "aquella",
  "aquellas",
  "aquello",
  "aquellos",
  "de",
  "del",
  "ella",
  "ellas",
  "ello",
  "ellos",
  "esa",
  "esas",
  "ese",
  "eses",
  "eso",
  "esta",
  "estas",
  "este",
  "estos",
  "her",
  "him",
  "igual",
  "it",
  "its",
  "la",
  "las",
  "lo",
  "los",
  "misma",
  "mismas",
  "mismo",
  "mismos",
  "previous",
  "same",
  "she",
  "su",
  "sus",
  "tambien",
  "también",
  "that",
  "the",
  "their",
  "them",
  "this",
]);

export async function detectAdvancedImageDependencies(
  session: AdvancedImageSession,
  input: AdvancedImageDependencyDetectionInput,
  options: AdvancedImageDependencyDetectionOptions = {},
): Promise<AdvancedImageDependencyDetectionResult> {
  const resolved = resolveDependencyInput(session, input);
  if (!resolved.ok) {
    return {
      candidates: [],
      issues: [resolved.issue],
      semantic: { attempted: false, skippedReason: "not_eligible" },
    };
  }

  const previousCorrections = getPreviousActiveCorrections(session, resolved.currentCorrection);
  const geometricCandidates = detectGeometricDependencyCandidates(previousCorrections, resolved.zone, options.geometric);
  if (previousCorrections.length === 0) {
    return {
      candidates: geometricCandidates,
      issues: [],
      semantic: { attempted: false, skippedReason: "no_previous_corrections" },
    };
  }
  if (geometricCandidates.length > 0) {
    return {
      candidates: geometricCandidates,
      issues: [],
      semantic: { attempted: false, skippedReason: "geometric_candidates_found" },
    };
  }

  const eligibility = shouldRunSemanticDependencyDetection(resolved.userInstruction, previousCorrections);
  if (!eligibility.eligible) {
    return {
      candidates: [],
      issues: [
        {
          code: "SEMANTIC_REQUEST_NOT_ELIGIBLE",
          detail: eligibility.reason,
        },
      ],
      semantic: { attempted: false, skippedReason: "not_eligible" },
    };
  }

  const guardIssues = validateSemanticOptions(options);
  if (guardIssues.length > 0 || !options.semanticTransport) {
    return {
      candidates: [],
      issues: guardIssues,
      semantic: { attempted: false, skippedReason: "not_eligible" },
    };
  }

  try {
    const semanticResult = await options.semanticTransport(
      {
        currentCorrectionId: input.currentCorrectionId,
        currentInstruction: resolved.userInstruction,
        currentZoneDescription: resolved.zone.locationDescription,
        previousCorrections: previousCorrections.map((correction) => ({
          id: correction.id,
          instruction: correction.userInstruction,
          order: correction.order,
          zoneDescription: correction.zone.locationDescription,
        })),
      },
      {
        requestId: options.requestId!,
        signal: options.signal,
        userEmail: normalizeEmail(options.userEmail ?? ""),
      },
    );

    const byId = new Map(previousCorrections.map((correction) => [correction.id, correction]));
    const candidates = [...geometricCandidates];
    const issues: AdvancedImageDependencyDetectionIssue[] = [];
    for (const dependencyId of uniqueStrings(semanticResult.dependencyIds)) {
      const dependency = byId.get(dependencyId);
      if (!dependency) {
        issues.push({
          code: "UNKNOWN_SEMANTIC_DEPENDENCY",
          dependencyId,
          detail: `Semantic dependency '${dependencyId}' is not an active previous correction.`,
        });
        continue;
      }
      upsertCandidate(candidates, {
        confidence: 0.72,
        correctionId: dependency.id,
        preselected: true,
        reasons: [
          semanticResult.rationaleById?.[dependency.id] ?? "Semantic detector marked this correction as conceptually related.",
        ],
        sources: ["semantic"],
      });
    }

    return {
      candidates: sortCandidates(candidates),
      issues,
      semantic: { attempted: true },
    };
  } catch (error) {
    return {
      candidates: [],
      issues: [
        {
          code: "SEMANTIC_TRANSPORT_FAILED",
          detail: error instanceof Error ? error.message : "Semantic dependency detection failed.",
        },
      ],
      semantic: { attempted: true },
    };
  }
}

export function detectGeometricDependencyCandidates(
  previousCorrections: AdvancedImageCorrection[],
  zone: AdvancedImageZone,
  options: AdvancedImageDependencyDetectionOptions["geometric"] = {},
): AdvancedImageDependencyCandidate[] {
  const overlapOldThreshold = options.overlapOldThreshold ?? DEFAULT_OVERLAP_OLD_THRESHOLD;
  const containmentThreshold = options.containmentThreshold ?? DEFAULT_CONTAINMENT_THRESHOLD;
  const candidates: AdvancedImageDependencyCandidate[] = [];
  for (const correction of previousCorrections) {
    if (correction.status !== "active") continue;
    const metrics = computeZoneOverlapMetrics(zone, correction.zone, options.sampleSize);
    const reasons: string[] = [];
    if (metrics.containsOldZone || metrics.intersectionOverOld >= containmentThreshold) {
      reasons.push("The new zone contains a previous correction.");
    }
    if (metrics.intersectionOverOld > overlapOldThreshold) {
      reasons.push(`The new zone overlaps ${Math.round(metrics.intersectionOverOld * 100)}% of a previous correction.`);
    }
    if (reasons.length === 0) continue;
    candidates.push({
      confidence: Math.min(1, Math.max(metrics.intersectionOverOld, metrics.intersectionOverNew)),
      correctionId: correction.id,
      metrics,
      preselected: true,
      reasons,
      sources: ["geometric"],
    });
  }
  return sortCandidates(candidates);
}

export function shouldRunSemanticDependencyDetection(
  currentInstruction: string,
  previousCorrections: Pick<AdvancedImageCorrection, "userInstruction">[],
): { eligible: true } | { eligible: false; reason: string } {
  const tokens = tokenize(currentInstruction);
  if (previousCorrections.length === 0) {
    return { eligible: false, reason: "Semantic dependency detection requires at least one previous correction." };
  }
  if (tokens.length <= 3) {
    return { eligible: false, reason: "Instruction is too short for semantic dependency detection." };
  }
  if (tokens.some((token) => REFERENCE_TOKENS.has(token))) return { eligible: true };

  const previousMeaningful = new Set(previousCorrections.flatMap((correction) => meaningfulTokens(correction.userInstruction)));
  if (meaningfulTokens(currentInstruction).some((token) => previousMeaningful.has(token))) return { eligible: true };

  return {
    eligible: false,
    reason: "Instruction does not appear to reference a previous correction.",
  };
}

function resolveDependencyInput(
  session: AdvancedImageSession,
  input: AdvancedImageDependencyDetectionInput,
):
  | { currentCorrection?: AdvancedImageCorrection; ok: true; userInstruction: string; zone: AdvancedImageZone }
  | { issue: AdvancedImageDependencyDetectionIssue; ok: false } {
  const currentCorrection = input.currentCorrectionId
    ? session.corrections.find((correction) => correction.id === input.currentCorrectionId)
    : undefined;
  if (input.currentCorrectionId && !currentCorrection) {
    return {
      issue: {
        code: "CURRENT_CORRECTION_NOT_FOUND",
        correctionId: input.currentCorrectionId,
        detail: `Correction '${input.currentCorrectionId}' does not exist.`,
      },
      ok: false,
    };
  }
  const zone = input.zone ?? currentCorrection?.zone;
  if (!zone) {
    return {
      issue: {
        code: "ZONE_MISSING",
        correctionId: input.currentCorrectionId,
        detail: "A zone is required to detect dependencies.",
      },
      ok: false,
    };
  }
  return {
    currentCorrection,
    ok: true,
    userInstruction: input.userInstruction ?? currentCorrection?.userInstruction ?? "",
    zone,
  };
}

function getPreviousActiveCorrections(
  session: AdvancedImageSession,
  currentCorrection?: AdvancedImageCorrection,
): AdvancedImageCorrection[] {
  return session.corrections
    .filter((correction) => correction.status === "active")
    .filter((correction) => correction.id !== currentCorrection?.id)
    .filter((correction) => currentCorrection === undefined || correction.order < currentCorrection.order)
    .slice()
    .sort((a, b) => a.order - b.order);
}

function validateSemanticOptions(
  options: AdvancedImageDependencyDetectionOptions,
): AdvancedImageDependencyDetectionIssue[] {
  const issues: AdvancedImageDependencyDetectionIssue[] = [];
  if (!options.semanticTransport) {
    issues.push({
      code: "SEMANTIC_TRANSPORT_MISSING",
      detail: "A semantic dependency transport is required before any semantic dependency call.",
    });
  }
  if (!options.semanticApproval?.approved) {
    issues.push({
      code: "SEMANTIC_NOT_APPROVED",
      detail: "Semantic dependency detection must be explicitly approved by the caller.",
    });
  }
  if (!options.requestId?.trim()) {
    issues.push({
      code: "REQUEST_ID_MISSING",
      detail: "A requestId is required for semantic dependency detection traceability.",
    });
  }
  if (!normalizeEmail(options.userEmail ?? "")) {
    issues.push({
      code: "USER_MISSING",
      detail: "A user email is required before any semantic dependency call.",
    });
  }
  return issues;
}

function upsertCandidate(
  candidates: AdvancedImageDependencyCandidate[],
  next: AdvancedImageDependencyCandidate,
): void {
  const existing = candidates.find((candidate) => candidate.correctionId === next.correctionId);
  if (!existing) {
    candidates.push(next);
    return;
  }
  existing.confidence = Math.max(existing.confidence, next.confidence);
  existing.preselected = existing.preselected || next.preselected;
  existing.reasons = uniqueStrings([...existing.reasons, ...next.reasons]);
  existing.sources = uniqueStrings([...existing.sources, ...next.sources]) as AdvancedImageDependencyCandidateSource[];
}

function sortCandidates(candidates: AdvancedImageDependencyCandidate[]): AdvancedImageDependencyCandidate[] {
  return candidates.slice().sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.correctionId.localeCompare(b.correctionId);
  });
}

function meaningfulTokens(value: string): string[] {
  return tokenize(value).filter((token) => token.length >= 4 && !REFERENCE_TOKENS.has(token));
}

function tokenize(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9áéíóúüñ]+/i)
    .filter(Boolean);
}

function uniqueStrings<T extends string>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
