import type { Candidate, EssenceValue, LegacyOnelinerValue, Provenance, SlotState } from "./genoma-types";
import type { OnelinerLlmResponse } from "./llm/genoma-llm-validate";

function normalizeBeliefLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Huella de creencias compartidas; ignora headline y resumen. */
export function essenceBeliefsFingerprint(value: EssenceValue): string {
  return [...(value.beliefs ?? [])]
    .map((belief) => normalizeBeliefLabel(belief.label))
    .filter(Boolean)
    .sort()
    .join("|");
}

function buildEssenceSummaryFallback(
  beliefs: EssenceValue["beliefs"],
  headline: string | undefined,
  brandName?: string,
): string {
  const brand = brandName?.trim() || "La marca";
  const labels = beliefs.map((belief) => belief.label).filter(Boolean);
  if (labels.length >= 2) {
    return `${brand} se define por ${labels.slice(0, 3).join(", ")}, con una identidad verbal coherente y defendible.`;
  }
  if (headline) {
    return `${brand} comunica desde el claim «${headline}» con una propuesta de valor clara.`;
  }
  return `${brand} comunica con una identidad verbal propia, alejada del tono corporativo genérico.`;
}

function mergeEssenceHeadlineVariantValues(left: EssenceValue, right: EssenceValue): EssenceValue {
  const leftSummary = left.summary?.trim() ?? "";
  const rightSummary = right.summary?.trim() ?? "";
  const summary = rightSummary.length > leftSummary.length ? rightSummary : leftSummary;
  const headline = left.headline?.trim() || right.headline?.trim();
  const headlineOrigin = left.headline?.trim()
    ? left.headlineOrigin
    : right.headline?.trim()
      ? right.headlineOrigin
      : undefined;
  return {
    ...left,
    ...right,
    summary: summary || buildEssenceSummaryFallback(left.beliefs ?? right.beliefs ?? [], headline),
    headline: headline || undefined,
    headlineOrigin,
    beliefs: left.beliefs?.length ? left.beliefs : right.beliefs,
    evidence: left.evidence?.length ? left.evidence : right.evidence,
  };
}

/** Esencia resuelta a partir de creencias + opciones de oneliner (primer ingest). */
export function buildResolvedEssenceFromIngest(options: {
  beliefs: EssenceValue["beliefs"];
  onelinerLlm?: OnelinerLlmResponse | null;
  brandName?: string;
}): EssenceValue | null {
  const beliefs = (options.beliefs ?? []).filter((belief) => belief.label.trim());
  const primary = options.onelinerLlm?.options[0];
  const headline = primary?.text?.trim();

  if (!beliefs.length && !headline) return null;

  const summaryFromLlm = primary?.summary?.trim() ?? "";
  const summary =
    summaryFromLlm.length >= 24
      ? summaryFromLlm
      : buildEssenceSummaryFallback(beliefs, headline, options.brandName);

  return {
    summary,
    headline: headline || undefined,
    headlineOrigin: headline ? "generated" : undefined,
    beliefs,
    evidence: headline ? [{ quote: headline }] : [],
  };
}

/** Alternativas de headline (no bloquean el board; status sigue resolved). */
export function buildEssenceHeadlineAlternatives(
  resolved: EssenceValue,
  onelinerLlm: OnelinerLlmResponse,
  provenance: Provenance,
): Candidate<EssenceValue>[] {
  return buildEssenceHeadlineCandidates(resolved, { onelinerLlm }, provenance).filter(
    (candidate) => candidate.value.headline?.trim() !== resolved.headline?.trim(),
  );
}

/** Candidatos de headline que conservan el summary interpretativo del batch. */
export function buildEssenceHeadlineCandidates(
  base: EssenceValue,
  options: {
    onelinerLlm?: OnelinerLlmResponse | null;
    deterministicOneliners?: LegacyOnelinerValue[];
  },
  provenance: Provenance,
): Candidate<EssenceValue>[] {
  const headlines: { text: string; origin: "extracted" | "generated" }[] = [];

  if (options.onelinerLlm) {
    for (const option of options.onelinerLlm.options) {
      const text = option.text.trim();
      if (text && !headlines.some((item) => item.text === text)) {
        headlines.push({ text, origin: "generated" });
      }
    }
  }

  for (const item of options.deterministicOneliners ?? []) {
    const text = item.text.trim();
    if (text && !headlines.some((entry) => entry.text === text)) {
      headlines.push({ text, origin: "extracted" });
    }
  }

  return headlines.slice(0, 5).map((headline, index) => ({
    value: {
      ...base,
      headline: headline.text,
      headlineOrigin: headline.origin,
    },
    score: 0.58 - index * 0.04,
    provenance,
  }));
}

export function areEssenceHeadlineVariantsOnly(candidates: Candidate<EssenceValue>[]): boolean {
  if (candidates.length < 2) return false;
  const fingerprints = candidates
    .map((candidate) => essenceBeliefsFingerprint(candidate.value))
    .filter(Boolean);
  return fingerprints.length >= 2 && new Set(fingerprints).size === 1;
}

/** Colapsa variantes de headline (mismas creencias) a una esencia resuelta. */
export function collapseEssenceHeadlineVariants(
  slot: SlotState<EssenceValue>,
): SlotState<EssenceValue> {
  const sorted = [...slot.candidates].sort((a, b) => b.score - a.score);
  const value = sorted.reduce(
    (merged, candidate) => mergeEssenceHeadlineVariantValues(merged, candidate.value),
    sorted[0]?.value ?? ({} as EssenceValue),
  );
  const best = sorted[0];
  const alternatives = sorted
    .slice(1)
    .filter((candidate) => candidate.value.headline?.trim() !== value.headline?.trim());

  return {
    ...slot,
    status: "resolved",
    value,
    provenance: best?.provenance ?? slot.provenance,
    confidence: Math.max(slot.confidence, best?.score ?? 0, 0.68),
    candidates: alternatives,
    needsReviewReason: undefined,
    reconciliation: undefined,
  };
}

export function canResolveEssence(value: EssenceValue): boolean {
  const summary = value.summary?.trim() ?? "";
  if (summary.length < 24) return false;
  const beliefCount = value.beliefs?.filter((belief) => belief.label.trim()).length ?? 0;
  const evidenceCount = value.evidence?.filter((item) => item.quote.trim()).length ?? 0;
  return beliefCount >= 1 && beliefCount + evidenceCount >= 2;
}
