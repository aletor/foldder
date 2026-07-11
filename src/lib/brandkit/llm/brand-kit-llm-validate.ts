import type { Candidate, EssenceValue, LegacyValuesValue, VoiceValue } from "../brand-kit-types";
import { corpusContainsQuote } from "../crawl/copy-corpus";

export type VoiceLlmResponse = {
  summary: string;
  descriptors: string[];
  rules: string[];
  avoid?: string[];
  evidence: { quote: string; sourceUrl?: string }[];
};

export type OnelinerLlmResponse = {
  options: { text: string; summary?: string }[];
};

export type ValuesLlmResponse = {
  values: { label: string; evidence?: string }[];
};

export type LogoLabelLlmResponse = {
  labels: { index: number; isLikelyLogo: boolean; kind?: string; background?: string }[];
};

function isStringArray(value: unknown, min: number, max: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= min &&
    value.length <= max &&
    value.every((item) => typeof item === "string" && item.trim().length > 0)
  );
}

export function parseVoiceLlmResponse(raw: unknown): VoiceLlmResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!isStringArray(o.descriptors, 3, 5)) return null;
  if (!isStringArray(o.rules, 3, 6)) return null;
  if (!Array.isArray(o.evidence) || o.evidence.length < 3) return null;
  const evidence = o.evidence
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const quote = typeof row.quote === "string" ? row.quote.trim() : "";
      if (!quote) return null;
      return {
        quote,
        sourceUrl: typeof row.sourceUrl === "string" ? row.sourceUrl : undefined,
      };
    })
    .filter(Boolean) as VoiceLlmResponse["evidence"];
  if (evidence.length < 3) return null;
  const summary = typeof o.summary === "string" ? o.summary.trim() : "";
  const descriptors = o.descriptors.map((s) => s.trim());
  const fallbackSummary =
    summary.length >= 24
      ? summary
      : descriptors.length >= 2
        ? `Voz ${descriptors.slice(0, 4).join(", ")}.`
        : "Voz inferida del corpus web; revisa la síntesis generada.";
  return {
    summary: fallbackSummary,
    descriptors: o.descriptors.map((s) => s.trim()),
    rules: o.rules.map((s) => s.trim()),
    avoid: Array.isArray(o.avoid) ? o.avoid.map((s) => String(s).trim()).filter(Boolean) : undefined,
    evidence: evidence.slice(0, 3),
  };
}

export function validateVoiceAgainstCorpus(corpus: string, voice: VoiceLlmResponse): VoiceLlmResponse | null {
  const evidence = voice.evidence.filter((item) => corpusContainsQuote(corpus, item.quote));
  if (evidence.length >= 1) {
    return { ...voice, evidence: evidence.slice(0, 3) };
  }
  if (voice.descriptors.length >= 3 && voice.rules.length >= 2) {
    return voice;
  }
  return null;
}

export function parseValuesLlmResponse(raw: unknown): ValuesLlmResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.values) || o.values.length < 3 || o.values.length > 5) return null;
  const values = o.values
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const label = typeof row.label === "string" ? row.label.trim() : "";
      if (!label) return null;
      const evidence = typeof row.evidence === "string" ? row.evidence.trim() : undefined;
      return { label, evidence };
    })
    .filter(Boolean) as ValuesLlmResponse["values"];
  if (values.length < 3) return null;
  return { values };
}

export function validateValuesAgainstCorpus(corpus: string, values: ValuesLlmResponse): LegacyValuesValue | null {
  const grounded = values.values.filter((item) => !item.evidence || corpusContainsQuote(corpus, item.evidence));
  if (grounded.length < 3) {
    if (values.values.length >= 3) {
      return { values: values.values.slice(0, 5).map(({ label, evidence }) => ({ label, evidence })) };
    }
    return null;
  }
  return { values: grounded.slice(0, 5) };
}

export function parseOnelinerLlmResponse(raw: unknown): OnelinerLlmResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.options) || o.options.length !== 3) return null;
  const options = o.options
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const text = typeof row.text === "string" ? row.text.trim() : "";
      return text ? { text } : null;
    })
    .filter(Boolean) as { text: string }[];
  if (options.length !== 3) return null;
  return { options };
}

export function parseLogoLabelLlmResponse(raw: unknown, candidateCount: number): LogoLabelLlmResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.labels)) return null;
  const labels = o.labels
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const index = Number(row.index);
      if (!Number.isInteger(index) || index < 0 || index >= candidateCount) return null;
      return {
        index,
        isLikelyLogo: row.isLikelyLogo === true,
        kind: typeof row.kind === "string" ? row.kind : undefined,
        background: typeof row.background === "string" ? row.background : undefined,
      };
    })
    .filter(Boolean) as LogoLabelLlmResponse["labels"];
  return labels.length ? { labels } : null;
}

export function voiceValueFromLlm(voice: VoiceLlmResponse): VoiceValue {
  return {
    summary: voice.summary.trim(),
    descriptors: voice.descriptors,
    rules: voice.rules,
    avoid: voice.avoid ?? [],
    evidence: voice.evidence,
  };
}

export function essenceCandidatesFromOnelinerLlm(
  response: OnelinerLlmResponse,
  beliefs: EssenceValue["beliefs"] = [],
  sourceUrl?: string,
): Candidate<EssenceValue>[] {
  return response.options.map((option, index) => ({
    value: {
      summary: option.summary?.trim() ?? "",
      headline: option.text.trim(),
      headlineOrigin: "generated" as const,
      beliefs,
      evidence: [{ quote: option.text, sourceUrl }],
    },
    score: 0.55 - index * 0.05,
    provenance: { type: "llm_synthesis", detail: "generado", sourceUrl },
  }));
}
