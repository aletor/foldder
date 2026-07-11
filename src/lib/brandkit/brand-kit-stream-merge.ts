import type { Candidate, GalleryValue, BrandKitDocument, LogoValue, Provenance, SlotId, SlotState, SourceRef } from "./brand-kit-types";
import {
  applyReconcileResultToSlot,
  finalizeSemanticCandidateSlot,
  isSemanticTextSlot,
  reconcileSemanticSlot,
  semanticCandidateFingerprint,
} from "./brand-kit-reconcile";
import { applyLockedSlotPolicy } from "./brand-kit-source-policy";
import { brandKitLocaleEs } from "./brand-kit-locale.es";
import { finalizeLogoCandidateSlot, logoCandidateFingerprint, logosAreSameFamily } from "./brand-kit-logo-policy";
import { rankHarvestedGalleryItems, rankLogoCandidatesMultiSource } from "./brand-kit-visual-rank";

export type BrandKitStreamMergeOptions = {
  respectLocks?: boolean;
  sources?: SourceRef[];
};

function hasSubstantiveSlotContent(slot: SlotState<unknown>): boolean {
  if (slot.status === "resolved" && slot.value !== undefined) return true;
  if (slot.status === "candidates" && slot.candidates.length > 0) return true;
  if (slot.status === "needs_user") return true;
  return false;
}

function candidateKey(candidate: Candidate<unknown>, slotId?: SlotId): string {
  if (slotId === "logo") {
    return logoCandidateFingerprint(candidate as Candidate<LogoValue>);
  }
  const value = candidate.value as Record<string, unknown> | null;
  if (value && typeof value.assetId === "string") return `asset:${value.assetId}`;
  if (slotId && isSemanticTextSlot(slotId)) {
    const fingerprint = semanticCandidateFingerprint(slotId, candidate.value);
    if (fingerprint) return `semantic:${fingerprint}`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return `${candidate.score}:${candidate.provenance?.detail ?? ""}`;
  }
}

function priorCandidateFromSlot(current: SlotState<unknown>): Candidate<unknown> | null {
  if (current.value === undefined) return null;
  return {
    value: current.value,
    score: current.confidence ?? 0.55,
    provenance: current.provenance ?? ({ type: "llm_synthesis", detail: "versión anterior" } satisfies Provenance),
  };
}

function mergeCandidates(
  existing: Candidate<unknown>[],
  incoming: Candidate<unknown>[],
  slotId?: SlotId,
): Candidate<unknown>[] {
  if (slotId === "logo") {
    const seen = new Set(existing.map((candidate) => candidateKey(candidate, slotId)));
    const merged = [...existing];
    for (const candidate of incoming) {
      const key = candidateKey(candidate, slotId);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(candidate);
    }
    return merged.sort((a, b) => b.score - a.score).slice(0, 24);
  }
  const seen = new Set(existing.map((candidate) => candidateKey(candidate, slotId)));
  const merged = [...existing];
  for (const candidate of incoming) {
    const key = candidateKey(candidate, slotId);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(candidate);
  }
  return merged.sort((a, b) => b.score - a.score).slice(0, 12);
}

function mergeGalleryValues(current: GalleryValue, incoming: GalleryValue): GalleryValue {
  const harvestedIds = new Set(current.harvested.map((item) => item.assetId));
  const harvested = rankHarvestedGalleryItems([
    ...current.harvested,
    ...incoming.harvested.filter((item) => !harvestedIds.has(item.assetId)),
  ]);
  return {
    ...current,
    harvested,
    generated: current.generated?.length ? current.generated : incoming.generated,
    stylePromptVersion: current.stylePromptVersion ?? incoming.stylePromptVersion ?? 0,
    styleToneExplanation: current.styleToneExplanation ?? incoming.styleToneExplanation,
  };
}

function applyVisualSlotRanking(
  slotId: SlotId,
  slot: SlotState<unknown>,
  sources: SourceRef[] = [],
): SlotState<unknown> {
  if (slotId === "logo" && slot.candidates.length > 0) {
    const candidates = rankLogoCandidatesMultiSource(slot.candidates as Candidate<LogoValue>[], sources);
    return {
      ...slot,
      candidates,
      confidence: Math.max(slot.confidence, candidates[0]?.score ?? 0),
    };
  }

  if (slotId === "gallery" && slot.value) {
    const gallery = slot.value as GalleryValue;
    if (!gallery.harvested.length) return slot;
    return {
      ...slot,
      value: {
        ...gallery,
        harvested: rankHarvestedGalleryItems(gallery.harvested),
      },
    };
  }

  return slot;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function finishMerge(slotId: SlotId, slot: SlotState<unknown>, sources: SourceRef[] = []): SlotState<unknown> {
  const ranked = applyVisualSlotRanking(slotId, slot, sources);
  if (slotId === "logo") {
    return finalizeLogoCandidateSlot(ranked, sources);
  }
  return finalizeSemanticCandidateSlot(slotId, ranked);
}

/**
 * Fusiona un patch de stream sobre un slot existente (modo acumulativo).
 * Devuelve null si el patch debe ignorarse por completo (slot bloqueado).
 */
export function mergeSlotStreamPatch(
  slotId: SlotId,
  current: SlotState<unknown>,
  patch: Partial<SlotState<unknown>>,
  options?: BrandKitStreamMergeOptions,
): SlotState<unknown> | null {
  const additive = options?.respectLocks === true;
  if (additive && current.locked) {
    return applyLockedSlotPolicy(slotId, current, patch, options?.sources ?? []);
  }

  let nextPatch: Partial<SlotState<unknown>> = { ...patch };

  if (additive && nextPatch.status === "pending" && hasSubstantiveSlotContent(current)) {
    const { status: _pending, ...rest } = nextPatch;
    nextPatch = rest;
    if (Object.keys(nextPatch).length === 0) return current;
  }

  if (slotId === "gallery" && nextPatch.value && current.value) {
    nextPatch = {
      ...nextPatch,
      value: mergeGalleryValues(current.value as GalleryValue, nextPatch.value as GalleryValue),
    };
  }

  const incomingValue = nextPatch.value;
  const hasIncomingValue = incomingValue !== undefined;
  const hasCurrentValue = current.value !== undefined;

  if (
    additive &&
    nextPatch.candidates?.length &&
    hasCurrentValue &&
    !hasIncomingValue &&
    current.status === "resolved"
  ) {
    const previous = priorCandidateFromSlot(current);
    if (previous) {
      nextPatch = {
        ...nextPatch,
        status: "candidates",
        value: undefined,
        candidates: mergeCandidates([previous], nextPatch.candidates, slotId),
        needsReviewReason:
          nextPatch.needsReviewReason ??
          current.needsReviewReason ??
          brandKitLocaleEs.logoMultiSourceReview,
      };
    }
  } else if (nextPatch.candidates?.length) {
    nextPatch.candidates = mergeCandidates(current.candidates ?? [], nextPatch.candidates, slotId);
    if (slotId === "logo") {
      nextPatch.candidates = rankLogoCandidatesMultiSource(
        nextPatch.candidates as Candidate<LogoValue>[],
        options?.sources ?? [],
      );
    }
  }

  if (
    additive &&
    hasIncomingValue &&
    hasCurrentValue &&
    slotId === "logo" &&
    logosAreSameFamily(current.value as LogoValue, incomingValue as LogoValue)
  ) {
    return finishMerge(
      slotId,
      {
        ...current,
        confidence: Math.max(
          current.confidence,
          typeof nextPatch.confidence === "number" ? nextPatch.confidence : 0.72,
        ),
        updatedAt: nextPatch.updatedAt ?? new Date().toISOString(),
      },
      options?.sources ?? [],
    );
  }

  if (
    additive &&
    hasIncomingValue &&
    hasCurrentValue &&
    !valuesEqual(current.value, incomingValue) &&
    (nextPatch.status === "resolved" || (current.status === "resolved" && !nextPatch.status))
  ) {
    if (isSemanticTextSlot(slotId)) {
      const result = reconcileSemanticSlot(
        slotId,
        current.value,
        incomingValue,
        current.provenance,
        (nextPatch.provenance as Provenance | undefined) ?? undefined,
        options?.sources ?? [],
      );
      return finishMerge(
        slotId,
        applyReconcileResultToSlot(slotId, current, result, nextPatch, options?.sources ?? []),
        options?.sources ?? [],
      );
    }

    const previous: Candidate<unknown> = {
      value: current.value,
      score: current.confidence ?? 0.55,
      provenance: current.provenance ?? ({ type: "llm_synthesis", detail: "versión anterior" } satisfies Provenance),
    };
    const incoming: Candidate<unknown> = {
      value: incomingValue,
      score: typeof nextPatch.confidence === "number" ? nextPatch.confidence : 0.72,
      provenance:
        (nextPatch.provenance as Provenance | undefined) ??
        ({ type: "llm_synthesis", detail: "nueva fuente" } satisfies Provenance),
    };
    const mergedCandidates = mergeCandidates([previous, incoming], nextPatch.candidates ?? [], slotId);
    const candidates =
      slotId === "logo"
        ? rankLogoCandidatesMultiSource(mergedCandidates as Candidate<LogoValue>[], options?.sources ?? [])
        : mergedCandidates;
    return finishMerge(
      slotId,
      {
        ...current,
        status: "candidates",
        value: undefined,
        candidates,
        confidence: Math.max(current.confidence, incoming.score),
        needsReviewReason: brandKitLocaleEs.logoMultiSourceReview,
        updatedAt: nextPatch.updatedAt ?? new Date().toISOString(),
      },
      options?.sources ?? [],
    );
  }

  if (slotId === "gallery" && nextPatch.value && !current.value) {
    nextPatch = {
      ...nextPatch,
      value: {
        ...(nextPatch.value as GalleryValue),
        harvested: rankHarvestedGalleryItems((nextPatch.value as GalleryValue).harvested),
      },
    };
  }

  return finishMerge(
    slotId,
    {
      ...current,
      ...nextPatch,
      id: slotId,
      updatedAt: nextPatch.updatedAt ?? new Date().toISOString(),
    },
    options?.sources ?? [],
  );
}

export function countLockedBrandKitSlots(slots: BrandKitDocument["slots"]): number {
  return Object.values(slots).filter((slot) => slot.locked).length;
}
