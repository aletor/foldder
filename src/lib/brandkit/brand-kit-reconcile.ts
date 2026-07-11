import type {
  Candidate,
  EssenceValue,
  Provenance,
  SlotId,
  SlotReconciliation,
  SlotState,
  SourceRef,
  VisualWorldValue,
  VoiceValue,
} from "./brand-kit-types";
import {
  areEssenceHeadlineVariantsOnly,
  collapseEssenceHeadlineVariants,
} from "./brand-kit-essence-headline";
import { authoritativeScoreBonus, isAuthoritativeProvenance } from "./brand-kit-source-policy";

export type ReconcileOutcome = "identical" | "reinforcement" | "extension" | "contradiction" | "ignore";

export type SemanticTextSlotId = "essence" | "voice" | "visualWorld";

export type ReconcileResult =
  | { outcome: "identical" | "ignore"; value: unknown; confidenceDelta: number }
  | { outcome: "reinforcement" | "extension"; value: unknown; confidenceDelta: number }
  | {
      outcome: "contradiction";
      previous: unknown;
      incoming: unknown;
      previousProvenance?: Provenance;
      incomingProvenance?: Provenance;
      reconciliation: SlotReconciliation;
    };

const SEMANTIC_TEXT_SLOTS = new Set<SlotId>(["essence", "voice", "visualWorld"]);

const STOP_WORDS = new Set([
  "a",
  "al",
  "con",
  "de",
  "del",
  "el",
  "en",
  "es",
  "la",
  "las",
  "lo",
  "los",
  "para",
  "por",
  "que",
  "se",
  "su",
  "sus",
  "un",
  "una",
  "y",
]);

const OPPOSITION_PAIRS: [string, string][] = [
  ["formal", "informal"],
  ["institucional", "cercano"],
  ["serio", "divertido"],
  ["premium", "accesible"],
  ["minimal", "recargado"],
  ["corporativo", "rebelde"],
  ["sobrio", "colorido"],
  ["tradicional", "moderno"],
  ["lujo", "popular"],
  ["frío", "cálido"],
  ["oscuro", "luminoso"],
];

export function isSemanticTextSlot(slotId: SlotId): slotId is SemanticTextSlotId {
  return SEMANTIC_TEXT_SLOTS.has(slotId);
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): Set<string> {
  const tokens = normalizeText(text)
    .split(" ")
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
  return new Set(tokens);
}

export function textSimilarity(a: string, b: string): number {
  const left = tokenize(a);
  const right = tokenize(b);
  if (!left.size && !right.size) return 1;
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function hasOpposition(a: string, b: string): boolean {
  const left = tokenize(a);
  const right = tokenize(b);
  for (const [termA, termB] of OPPOSITION_PAIRS) {
    if ((left.has(termA) && right.has(termB)) || (left.has(termB) && right.has(termA))) return true;
  }
  return false;
}

function uniqueStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = normalizeText(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  return out;
}

function mergeEvidence<T extends { quote: string }>(left: T[] = [], right: T[] = []): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of [...left, ...right]) {
    const key = normalizeText(item.quote);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function pickRicherSummary(current: string, incoming: string): string {
  if (!incoming.trim()) return current;
  if (!current.trim()) return incoming;
  return incoming.length > current.length * 1.15 ? incoming : current;
}

function mergeVoice(current: VoiceValue, incoming: VoiceValue, outcome: "reinforcement" | "extension"): VoiceValue {
  return {
    summary: outcome === "reinforcement" ? pickRicherSummary(current.summary, incoming.summary) : current.summary,
    descriptors: uniqueStrings([...current.descriptors, ...incoming.descriptors]),
    rules: uniqueStrings([...current.rules, ...incoming.rules]),
    avoid: uniqueStrings([...(current.avoid ?? []), ...(incoming.avoid ?? [])]),
    evidence: mergeEvidence(current.evidence, incoming.evidence),
  };
}

function mergeBeliefs(
  current: EssenceValue["beliefs"] = [],
  incoming: EssenceValue["beliefs"] = [],
): EssenceValue["beliefs"] {
  const byLabel = new Map<string, EssenceValue["beliefs"][number]>();
  for (const belief of [...current, ...incoming]) {
    const key = normalizeText(belief.label);
    if (!key) continue;
    const existing = byLabel.get(key);
    if (!existing) {
      byLabel.set(key, belief);
      continue;
    }
    byLabel.set(key, {
      label: existing.label,
      explanation: existing.explanation || belief.explanation,
      evidence: existing.evidence || belief.evidence,
    });
  }
  return [...byLabel.values()];
}

function mergeEssence(
  current: EssenceValue,
  incoming: EssenceValue,
  outcome: "reinforcement" | "extension",
): EssenceValue {
  return {
    ...current,
    summary:
      outcome === "reinforcement" ? pickRicherSummary(current.summary, incoming.summary) : current.summary,
    headline: current.headline || incoming.headline,
    headlineOrigin: current.headlineOrigin ?? incoming.headlineOrigin,
    headlineProvenance: current.headlineProvenance ?? incoming.headlineProvenance,
    promise: current.promise || incoming.promise,
    purpose: current.purpose || incoming.purpose,
    pov: current.pov || incoming.pov,
    beliefs: mergeBeliefs(current.beliefs, incoming.beliefs),
    evidence: mergeEvidence(current.evidence, incoming.evidence),
    brandContext: current.brandContext || incoming.brandContext,
  };
}

function mergeVisualWorld(
  current: VisualWorldValue,
  incoming: VisualWorldValue,
  outcome: "reinforcement" | "extension",
): VisualWorldValue {
  return {
    summary:
      outcome === "reinforcement" ? pickRicherSummary(current.summary, incoming.summary) : current.summary,
    moodTags: uniqueStrings([...(current.moodTags ?? []), ...(incoming.moodTags ?? [])]),
    visualTraits: uniqueStrings([...(current.visualTraits ?? []), ...(incoming.visualTraits ?? [])]),
    limits: uniqueStrings([...(current.limits ?? []), ...(incoming.limits ?? [])]),
    evidence: mergeEvidence(current.evidence ?? [], incoming.evidence ?? []),
    galleryRefs: uniqueStrings([...(current.galleryRefs ?? []), ...(incoming.galleryRefs ?? [])]),
  };
}

function sortedNormalized(items: string[] | undefined): string {
  return [...(items ?? [])].map((item) => normalizeText(item)).filter(Boolean).sort().join("|");
}

/** Huella del contenido visible al usuario; ignora evidence, galleryRefs y metadatos de ingest. */
export function semanticCandidateFingerprint(slotId: SemanticTextSlotId, value: unknown): string {
  if (!value || typeof value !== "object") return "";
  if (slotId === "visualWorld") {
    const visual = value as VisualWorldValue;
    return [
      normalizeText(visual.summary ?? ""),
      sortedNormalized(visual.moodTags),
      sortedNormalized(visual.visualTraits),
      sortedNormalized(visual.limits),
    ].join("§");
  }
  if (slotId === "voice") {
    const voice = value as VoiceValue;
    return [
      normalizeText(voice.summary ?? ""),
      sortedNormalized(voice.descriptors),
      sortedNormalized(voice.rules),
      sortedNormalized(voice.avoid),
    ].join("§");
  }
  const essence = value as EssenceValue;
  return [
    normalizeText(essence.summary ?? ""),
    normalizeText(essence.headline ?? ""),
    normalizeText(essence.promise ?? ""),
    normalizeText(essence.purpose ?? ""),
    sortedNormalized((essence.beliefs ?? []).map((belief) => belief.label)),
  ].join("§");
}

export function areSemanticValuesEqual(slotId: SemanticTextSlotId, left: unknown, right: unknown): boolean {
  const fingerprint = semanticCandidateFingerprint(slotId, left);
  return Boolean(fingerprint) && fingerprint === semanticCandidateFingerprint(slotId, right);
}

export function dedupeSemanticCandidates<T>(
  slotId: SlotId,
  candidates: Candidate<T>[],
): Candidate<T>[] {
  if (!isSemanticTextSlot(slotId) || candidates.length < 2) return candidates;
  const seen = new Set<string>();
  const deduped: Candidate<T>[] = [];
  for (const candidate of [...candidates].sort((a, b) => b.score - a.score)) {
    const key = semanticCandidateFingerprint(slotId, candidate.value);
    if (!key) {
      deduped.push(candidate);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped.sort((a, b) => b.score - a.score);
}

export function finalizeSemanticCandidateSlot(slotId: SlotId, slot: SlotState<unknown>): SlotState<unknown> {
  if (!isSemanticTextSlot(slotId) || slot.status !== "candidates") {
    return slot;
  }

  if (
    slotId === "essence" &&
    areEssenceHeadlineVariantsOnly(slot.candidates as Candidate<EssenceValue>[])
  ) {
    return collapseEssenceHeadlineVariants(slot as SlotState<EssenceValue>);
  }

  const candidates =
    slot.candidates.length >= 2 ? dedupeSemanticCandidates(slotId, slot.candidates) : slot.candidates;
  const collapsedToSingle = candidates.length === 1 && slot.candidates.length > 1;
  const staleMultiChoicePrompt =
    candidates.length === 1 && slot.needsReviewReason?.toLowerCase().includes("elige");

  if (!collapsedToSingle && !staleMultiChoicePrompt) {
    return candidates.length === slot.candidates.length ? slot : { ...slot, candidates };
  }

  const next: SlotState<unknown> = { ...slot, candidates };
  if (next.reconciliation?.outcome === "contradiction") {
    next.reconciliation = undefined;
  }
  if (staleMultiChoicePrompt || collapsedToSingle) {
    next.needsReviewReason = "Revisa la síntesis antes de confirmar";
  }
  return next;
}

export function extractSemanticSummary(slotId: SemanticTextSlotId, value: unknown): string {
  if (!value || typeof value !== "object") return "";
  if (slotId === "voice") {
    const voice = value as VoiceValue;
    return [voice.summary, ...(voice.descriptors ?? [])].filter(Boolean).join(" ");
  }
  if (slotId === "essence") {
    const essence = value as EssenceValue;
    return [essence.summary, essence.headline, essence.promise, essence.purpose].filter(Boolean).join(" ");
  }
  const visual = value as VisualWorldValue;
  return [visual.summary, ...(visual.moodTags ?? [])].filter(Boolean).join(" ");
}

export function formatReconcileSourceLabel(provenance?: Provenance): string | undefined {
  if (!provenance) return undefined;
  if (provenance.sourceUrl) {
    try {
      return new URL(provenance.sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      return provenance.sourceUrl;
    }
  }
  if (provenance.type === "file_upload") return "archivo";
  if (provenance.type === "llm_synthesis") return provenance.detail || "síntesis ia";
  return provenance.detail || provenance.type;
}

function isGenericSummary(text: string): boolean {
  const normalized = normalizeText(text);
  return (
    normalized.length < 24 ||
    normalized.includes("sin sintesis") ||
    normalized.includes("propuesta de respaldo") ||
    normalized.includes("aun no hay")
  );
}

export function reconcileSemanticSlot(
  slotId: SemanticTextSlotId,
  currentValue: unknown,
  incomingValue: unknown,
  currentProvenance?: Provenance,
  incomingProvenance?: Provenance,
  sources: SourceRef[] = [],
): ReconcileResult {
  const currentSummary = extractSemanticSummary(slotId, currentValue);
  const incomingSummary = extractSemanticSummary(slotId, incomingValue);
  const authoritativeIncoming = isAuthoritativeProvenance(sources, incomingProvenance);

  if (!incomingSummary.trim() || isGenericSummary(incomingSummary)) {
    return { outcome: "ignore", value: currentValue, confidenceDelta: 0 };
  }

  if (!currentSummary.trim()) {
    return {
      outcome: "extension",
      value: incomingValue,
      confidenceDelta: 0.08 + authoritativeScoreBonus(sources, incomingProvenance),
    };
  }

  const similarity = textSimilarity(currentSummary, incomingSummary);
  const opposition = hasOpposition(currentSummary, incomingSummary);

  if (similarity >= 0.82 && !opposition) {
    return {
      outcome: "identical",
      value: currentValue,
      confidenceDelta: 0.04 + (authoritativeIncoming ? 0.03 : 0),
    };
  }

  if (opposition || (similarity < 0.28 && currentSummary.length > 20 && incomingSummary.length > 20)) {
    return {
      outcome: "contradiction",
      previous: currentValue,
      incoming: incomingValue,
      previousProvenance: currentProvenance,
      incomingProvenance: incomingProvenance,
      reconciliation: {
        outcome: "contradiction",
        previousSummary: currentSummary.slice(0, 220),
        incomingSummary: incomingSummary.slice(0, 220),
        sourceLabel: authoritativeIncoming
          ? `${formatReconcileSourceLabel(incomingProvenance) ?? "nueva fuente"} · autoritativa`
          : formatReconcileSourceLabel(incomingProvenance),
      },
    };
  }

  if (similarity >= 0.45 && !opposition) {
    const merged =
      slotId === "voice"
        ? mergeVoice(currentValue as VoiceValue, incomingValue as VoiceValue, "reinforcement")
        : slotId === "essence"
          ? mergeEssence(currentValue as EssenceValue, incomingValue as EssenceValue, "reinforcement")
          : mergeVisualWorld(
              currentValue as VisualWorldValue,
              incomingValue as VisualWorldValue,
              "reinforcement",
            );
    return { outcome: "reinforcement", value: merged, confidenceDelta: 0.06 + authoritativeScoreBonus(sources, incomingProvenance) };
  }

  const merged =
    slotId === "voice"
      ? mergeVoice(currentValue as VoiceValue, incomingValue as VoiceValue, "extension")
      : slotId === "essence"
        ? mergeEssence(currentValue as EssenceValue, incomingValue as EssenceValue, "extension")
        : mergeVisualWorld(currentValue as VisualWorldValue, incomingValue as VisualWorldValue, "extension");

  return {
    outcome: "extension",
    value: merged,
    confidenceDelta: 0.03 + authoritativeScoreBonus(sources, incomingProvenance),
  };
}

export function mergeSemanticValues(slotId: SemanticTextSlotId, left: unknown, right: unknown): unknown {
  if (slotId === "voice") return mergeVoice(left as VoiceValue, right as VoiceValue, "extension");
  if (slotId === "essence") return mergeEssence(left as EssenceValue, right as EssenceValue, "extension");
  return mergeVisualWorld(left as VisualWorldValue, right as VisualWorldValue, "extension");
}

export function applyReconcileResultToSlot(
  slotId: SlotId,
  current: SlotState<unknown>,
  result: ReconcileResult,
  patch: Partial<SlotState<unknown>>,
  sources: SourceRef[] = [],
): SlotState<unknown> {
  const updatedAt = patch.updatedAt ?? new Date().toISOString();

  if (result.outcome === "contradiction") {
    if (
      isSemanticTextSlot(slotId) &&
      areSemanticValuesEqual(slotId, result.previous, result.incoming)
    ) {
      return {
        ...current,
        status: "resolved",
        value: result.previous,
        confidence: Math.min(0.97, current.confidence + 0.06),
        needsReviewReason: undefined,
        reconciliation: undefined,
        updatedAt,
      };
    }

    const incomingProvenance =
      result.incomingProvenance ??
      (patch.provenance as Provenance | undefined) ??
      ({ type: "llm_synthesis", detail: "nueva fuente" } satisfies Provenance);
    const incomingScore =
      (typeof patch.confidence === "number" ? patch.confidence : 0.72) +
      authoritativeScoreBonus(sources, incomingProvenance);
    return {
      ...current,
      status: "candidates",
      value: undefined,
      candidates: [
        {
          value: result.previous,
          score: current.confidence ?? 0.55,
          provenance:
            result.previousProvenance ??
            current.provenance ??
            ({ type: "llm_synthesis", detail: "versión anterior" } satisfies Provenance),
        },
        {
          value: result.incoming,
          score: incomingScore,
          provenance: incomingProvenance,
        },
      ],
      confidence: Math.max(current.confidence, incomingScore),
      needsReviewReason: "Posible contradicción entre fuentes",
      reconciliation: result.reconciliation,
      updatedAt,
    };
  }

  const nextConfidence = Math.min(0.97, current.confidence + result.confidenceDelta);
  const clearReview = { needsReviewReason: undefined, reconciliation: undefined };

  if (result.outcome === "identical" || result.outcome === "ignore") {
    return {
      ...current,
      ...clearReview,
      confidence: nextConfidence,
      provenance: current.provenance ?? (patch.provenance as Provenance | undefined),
      updatedAt,
    };
  }

  return {
    ...current,
    ...clearReview,
    status: "resolved",
    value: result.value,
    confidence: nextConfidence,
    provenance: (patch.provenance as Provenance | undefined) ?? current.provenance,
    candidates: current.candidates,
    updatedAt,
  };
}

export function countPendingBrandKitConflicts(slots: Record<SlotId, SlotState<unknown>>): number {
  return Object.values(slots).filter(
    (slot) => slot.status === "candidates" && slot.reconciliation?.outcome === "contradiction",
  ).length;
}
