import type { Candidate, EssenceValue, LegacyOnelinerValue, Provenance } from "./genoma-types";
import type { OnelinerLlmResponse } from "./llm/genoma-llm-validate";

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

export function canResolveEssence(value: EssenceValue): boolean {
  const summary = value.summary?.trim() ?? "";
  if (summary.length < 24) return false;
  const beliefCount = value.beliefs?.filter((belief) => belief.label.trim()).length ?? 0;
  const evidenceCount = value.evidence?.filter((item) => item.quote.trim()).length ?? 0;
  return beliefCount >= 1 && beliefCount + evidenceCount >= 2;
}
