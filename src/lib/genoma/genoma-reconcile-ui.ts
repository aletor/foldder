import type { Candidate, Provenance, SlotId, VoiceValue, EssenceValue, VisualWorldValue } from "./genoma-types";
import { formatReconcileSourceLabel, isSemanticTextSlot } from "./genoma-reconcile";

const GENERIC_SUMMARY_MARKERS = [
  "voz inferida del corpus",
  "revisa la sintesis generada",
  "revisa la síntesis generada",
  "propuesta de respaldo",
  "opcion generada por ia",
  "opción generada por ia",
  "aun no hay",
  "sin sintesis",
  "sin síntesis",
];

export function isGenericReconcileSummary(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (!normalized || normalized.length < 24) return true;
  return GENERIC_SUMMARY_MARKERS.some((marker) => normalized.includes(marker));
}

export function reconcileCandidateSourceLabel(
  provenance: Provenance | undefined,
  fallback: string,
): string {
  if (provenance?.type === "file_upload" && provenance.detail?.trim()) {
    return provenance.detail.trim();
  }
  return formatReconcileSourceLabel(provenance) ?? fallback;
}

export function reconcilePreviousCandidateLabel(provenance: Provenance | undefined): string {
  return reconcileCandidateSourceLabel(provenance, "versión anterior");
}

export function reconcileIncomingSourceLabel(
  sourceLabel: string | undefined,
  provenance: Provenance | undefined,
  fallback: string,
): string {
  if (sourceLabel?.trim()) return sourceLabel.trim();
  return formatReconcileSourceLabel(provenance) ?? fallback;
}

export type ReconcileOptionDetail = {
  summary: string;
  summaryIsSynthetic: boolean;
  headline?: string;
  chips: string[];
  chipsLabel: "descriptors" | "mood" | "beliefs";
  bullets: string[];
  bulletsLabel: "rules" | "beliefs" | "traits";
  visualTraits?: string[];
  limits?: string[];
  avoid: string[];
  fields: { label: string; value: string }[];
};

function synthesizeVoiceSummary(voice: VoiceValue): string {
  const descriptors = (voice.descriptors ?? []).slice(0, 4);
  if (!descriptors.length) return "";
  return `Tono de marca: ${descriptors.join(", ")}.`;
}

function synthesizeEssenceSummary(essence: EssenceValue): string {
  if (essence.headline?.trim()) return essence.headline.trim();
  const parts = [essence.promise, essence.purpose].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  const beliefs = (essence.beliefs ?? []).slice(0, 3).map((belief) => belief.label);
  if (beliefs.length) return `Creencias clave: ${beliefs.join(", ")}.`;
  return "";
}

function synthesizeVisualSummary(visual: VisualWorldValue): string {
  const tags = (visual.moodTags ?? []).slice(0, 4);
  if (!tags.length) return "";
  return `Mood visual: ${tags.join(", ")}.`;
}

function resolveSummary(
  rawSummary: string,
  fallbackSummary: string | undefined,
  slotId: SlotId,
  value: unknown,
): { summary: string; summaryIsSynthetic: boolean } {
  if (!isGenericReconcileSummary(rawSummary)) {
    return { summary: rawSummary.trim(), summaryIsSynthetic: false };
  }

  const fallback = fallbackSummary?.trim() ?? "";
  if (fallback && !isGenericReconcileSummary(fallback)) {
    return { summary: fallback, summaryIsSynthetic: false };
  }

  if (slotId === "voice") {
    const synthetic = synthesizeVoiceSummary(value as VoiceValue);
    if (synthetic) return { summary: synthetic, summaryIsSynthetic: true };
  }
  if (slotId === "essence") {
    const synthetic = synthesizeEssenceSummary(value as EssenceValue);
    if (synthetic) return { summary: synthetic, summaryIsSynthetic: true };
  }
  if (slotId === "visualWorld") {
    const synthetic = synthesizeVisualSummary(value as VisualWorldValue);
    if (synthetic) return { summary: synthetic, summaryIsSynthetic: true };
  }

  return { summary: rawSummary.trim(), summaryIsSynthetic: true };
}

function essenceFields(essence: EssenceValue): { label: string; value: string }[] {
  return [
    essence.promise ? { label: "promise", value: essence.promise } : null,
    essence.purpose ? { label: "purpose", value: essence.purpose } : null,
    essence.pov ? { label: "pov", value: essence.pov } : null,
  ].filter(Boolean) as { label: string; value: string }[];
}

export function buildReconcileOptionDetail(
  slotId: SlotId,
  value: unknown,
  fallbackSummary?: string,
): ReconcileOptionDetail {
  if (slotId === "voice") {
    const voice = value as VoiceValue;
    const { summary, summaryIsSynthetic } = resolveSummary(voice.summary ?? "", fallbackSummary, slotId, voice);
    return {
      summary,
      summaryIsSynthetic,
      chips: voice.descriptors ?? [],
      chipsLabel: "descriptors",
      bullets: voice.rules ?? [],
      bulletsLabel: "rules",
      avoid: voice.avoid ?? [],
      fields: [],
    };
  }

  if (slotId === "essence") {
    const essence = value as EssenceValue;
    const rawSummary = essence.summary ?? "";
    const headline = essence.headline?.trim() ?? "";
    const summaryGeneric = isGenericReconcileSummary(rawSummary);
    const summaryDuplicatesHeadline =
      Boolean(headline) && rawSummary.trim().toLowerCase() === headline.toLowerCase();
    const { summary, summaryIsSynthetic } = resolveSummary(rawSummary, fallbackSummary, slotId, essence);

    return {
      summary: summaryGeneric || summaryDuplicatesHeadline ? "" : summary,
      summaryIsSynthetic: summaryGeneric && headline ? false : summaryIsSynthetic,
      headline: headline || undefined,
      chips: (essence.beliefs ?? []).map((belief) => belief.label),
      chipsLabel: "beliefs",
      bullets: (essence.beliefs ?? [])
        .map((belief) => (belief.explanation ? `${belief.label} — ${belief.explanation}` : belief.label))
        .filter(Boolean),
      bulletsLabel: "beliefs",
      avoid: [],
      fields: essenceFields(essence),
    };
  }

  const visual = value as VisualWorldValue;
  const { summary, summaryIsSynthetic } = resolveSummary(visual.summary ?? "", fallbackSummary, slotId, visual);
  return {
    summary,
    summaryIsSynthetic,
    chips: visual.moodTags ?? [],
    chipsLabel: "mood",
    bullets: [],
    bulletsLabel: "traits",
    visualTraits: visual.visualTraits ?? [],
    limits: visual.limits ?? [],
    avoid: [],
    fields: [],
  };
}

export function chipsUniqueToOption(chips: string[], otherChips: string[]): Set<string> {
  const other = new Set(otherChips.map((chip) => chip.toLowerCase()));
  return new Set(chips.filter((chip) => !other.has(chip.toLowerCase())));
}

export function bulletsUniqueToOption(bullets: string[], otherBullets: string[]): Set<string> {
  const other = new Set(otherBullets.map((bullet) => bullet.toLowerCase()));
  return new Set(bullets.filter((bullet) => !other.has(bullet.toLowerCase())));
}

export function assertReconcileCandidates(
  slotId: SlotId,
  candidates: Candidate<unknown>[],
): candidates is [Candidate<unknown>, Candidate<unknown>] {
  return isSemanticTextSlot(slotId) && candidates.length >= 2;
}

export function isSemanticCandidateSlot(slotId: SlotId): slotId is "voice" | "essence" | "visualWorld" {
  return isSemanticTextSlot(slotId);
}
