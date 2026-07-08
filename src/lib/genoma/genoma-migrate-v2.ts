import type {
  EssenceValue,
  GalleryValue,
  GenomaDocument,
  LegacyOnelinerValue,
  LegacyProhibitionsValue,
  LegacyValuesValue,
  Provenance,
  SlotHistoryEntry,
  SlotId,
  SlotState,
  SlotStatus,
  VisualWorldValue,
  VoiceValue,
} from "./genoma-types";
import { looksLikeFragmentedBelief } from "./genoma-evidence";

export const LEGACY_SLOT_KEYS = ["oneliner", "values", "prohibitions"] as const;

const VERBAL_PROHIBITION_RE = /lenguaje|tono|tecnicismo|palabra|frase|humor/i;

type Contributor = {
  hasContent: boolean;
  locked: boolean;
  confidence: number;
  provenance?: Provenance;
};

type LegacySlots = Record<string, SlotState<unknown> | undefined>;

function mergeContributors(contributors: Contributor[]): {
  locked: boolean;
  confidence: number;
  provenance?: Provenance;
} {
  const active = contributors.filter((item) => item.hasContent);
  if (!active.length) return { locked: false, confidence: 0, provenance: undefined };
  return {
    locked: active.every((item) => item.locked),
    confidence: Math.min(...active.map((item) => item.confidence)),
    provenance: [...active].sort((a, b) => b.confidence - a.confidence)[0]?.provenance,
  };
}

function legacySlot(slots: LegacySlots, key: string): SlotState<unknown> | undefined {
  return slots[key];
}

function onelinerText(slot: SlotState<unknown> | undefined): string | undefined {
  if (!slot) return undefined;
  if (slot.status === "resolved" && slot.value) {
    return (slot.value as LegacyOnelinerValue).text;
  }
  if (slot.status === "candidates" && slot.candidates[0]) {
    return (slot.candidates[0].value as LegacyOnelinerValue).text;
  }
  return undefined;
}

function essenceIsPopulated(slot?: SlotState<unknown>): boolean {
  if (!slot || slot.status === "empty") return false;
  if (slot.status === "resolved") {
    const value = slot.value as EssenceValue | undefined;
    return Boolean(value?.summary?.trim());
  }
  return slot.status === "candidates" || slot.status === "needs_user";
}

function visualWorldIsPopulated(slot?: SlotState<unknown>): boolean {
  if (!slot || slot.status === "empty") return false;
  if (slot.status === "resolved") {
    const value = slot.value as VisualWorldValue | undefined;
    return Boolean(value?.summary?.trim());
  }
  return slot.status === "candidates" || slot.status === "needs_user";
}

function normalizeLegacyBelief(label: string, evidence?: string): EssenceValue["beliefs"][number] {
  let text = label.trim();
  if (looksLikeFragmentedBelief(text) && !/[.!?]$/.test(text)) {
    text = `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
  }
  return {
    label: text,
    explanation: evidence && evidence !== label ? evidence : undefined,
    evidence,
  };
}

function legacyVoiceSummary(descriptors: string[]): string {
  const tone = descriptors.slice(0, 3).join(", ");
  return `Voz ${tone || "propia"} inferida del corpus migrado; revisa la síntesis para afinar tono y reglas.`;
}

function ensureVoiceContract(voice: SlotState<unknown> | undefined): SlotState<unknown> | undefined {
  if (!voice || voice.status !== "resolved" || !voice.value) return voice;
  const value = voice.value as VoiceValue;
  const summary =
    value.summary?.trim().length >= 24 ? value.summary : legacyVoiceSummary(value.descriptors ?? []);
  return {
    ...voice,
    value: {
      summary,
      descriptors: value.descriptors ?? [],
      rules: value.rules ?? [],
      avoid: value.avoid ?? [],
      evidence: value.evidence ?? [],
    },
  };
}
function legacyEssenceSummary(headline: string | undefined, beliefs: EssenceValue["beliefs"]): string {
  const labels = beliefs.map((belief) => belief.label).filter(Boolean);
  if (labels.length >= 2) {
    return `Marca orientada a ${labels.slice(0, 3).join(", ")}${headline ? `, con claim «${headline}»` : ""}.`;
  }
  if (headline && headline.length >= 24) return headline;
  return "";
}

function buildEssenceFromLegacy(
  oneliner: SlotState<unknown> | undefined,
  values: SlotState<unknown> | undefined,
): SlotState<EssenceValue> | null {
  const headline = onelinerText(oneliner);
  const valuesValue = values?.status === "resolved" ? (values.value as LegacyValuesValue | undefined) : undefined;
  const beliefs =
    valuesValue?.values?.map((item) => normalizeLegacyBelief(item.label, item.evidence)) ?? [];

  if (!headline && !beliefs.length && oneliner?.status !== "candidates") return null;

  const headlineOrigin =
    oneliner?.status === "resolved"
      ? (oneliner.value as LegacyOnelinerValue | undefined)?.origin
      : oneliner?.candidates[0]
        ? (oneliner.candidates[0].value as LegacyOnelinerValue).origin
        : undefined;

  const meta = mergeContributors([
    {
      hasContent: Boolean(headline),
      locked: oneliner?.locked ?? false,
      confidence: oneliner?.confidence ?? 0,
      provenance: oneliner?.provenance,
    },
    {
      hasContent: beliefs.length > 0,
      locked: values?.locked ?? false,
      confidence: values?.confidence ?? 0,
      provenance: values?.provenance,
    },
  ]);

  const evidence = [
    ...(headline ? [{ quote: headline, sourceUrl: oneliner?.provenance?.sourceUrl }] : []),
    ...beliefs
      .filter((belief) => belief.evidence)
      .map((belief) => ({ quote: belief.evidence!, sourceUrl: values?.provenance?.sourceUrl })),
  ];

  const summary = legacyEssenceSummary(headline, beliefs);
  const essenceValue: EssenceValue = {
    summary: summary || "Síntesis pendiente de revisión tras migración.",
    headline,
    headlineOrigin,
    headlineProvenance: oneliner?.provenance,
    beliefs,
    evidence,
  };

  const onelinerCandidates =
    oneliner?.status === "candidates"
      ? oneliner.candidates.map((candidate) => ({
          value: {
            summary: legacyEssenceSummary((candidate.value as LegacyOnelinerValue).text, beliefs) || essenceValue.summary,
            headline: (candidate.value as LegacyOnelinerValue).text,
            headlineOrigin: (candidate.value as LegacyOnelinerValue).origin,
            beliefs,
            evidence,
          } satisfies EssenceValue,
          score: candidate.score,
          provenance: candidate.provenance,
        }))
      : [];

  const status: SlotStatus =
    summary.length >= 24 && oneliner?.status !== "candidates" && values?.status !== "candidates"
      ? "resolved"
      : onelinerCandidates.length || headline || beliefs.length
        ? "candidates"
        : "needs_user";

  return {
    id: "essence",
    status,
    value: status === "resolved" ? essenceValue : undefined,
    candidates:
      status === "candidates"
        ? onelinerCandidates.length
          ? onelinerCandidates
          : [{ value: essenceValue, score: meta.confidence, provenance: oneliner?.provenance ?? { type: "llm_synthesis", detail: "migración legacy" } }]
        : [],
    confidence: meta.confidence,
    provenance: oneliner?.provenance ?? values?.provenance,
    locked: meta.locked,
    history: [...(oneliner?.history ?? []), ...(values?.history ?? [])].slice(0, 5) as SlotHistoryEntry<EssenceValue>[],
    updatedAt: oneliner?.updatedAt ?? values?.updatedAt ?? new Date().toISOString(),
  };
}

function splitProhibitions(items: LegacyProhibitionsValue["items"]): { verbal: string[]; visual: string[] } {
  const verbal: string[] = [];
  const visual: string[] = [];
  for (const item of items) {
    const text = item.compiledNegative ?? item.text;
    if (!text.trim()) continue;
    if (VERBAL_PROHIBITION_RE.test(text) && !item.compiledNegative) {
      verbal.push(text);
    } else {
      visual.push(text);
    }
  }
  return { verbal, visual };
}

function mergeVoiceAvoid(voice: SlotState<unknown> | undefined, verbalAvoid: string[]): SlotState<unknown> | undefined {
  if (!voice || voice.status !== "resolved" || !voice.value || !verbalAvoid.length) return voice;
  const value = voice.value as VoiceValue;
  const mergedAvoid = [...(value.avoid ?? []), ...verbalAvoid.filter((item) => !(value.avoid ?? []).includes(item))];
  if (mergedAvoid.length === (value.avoid ?? []).length) return voice;
  return { ...voice, value: { ...value, avoid: mergedAvoid } };
}

function buildVisualWorldFromLegacy(
  prohibitions: SlotState<unknown> | undefined,
  gallery: SlotState<unknown> | undefined,
): SlotState<VisualWorldValue> | null {
  const prohibitionItems =
    prohibitions?.status === "resolved"
      ? ((prohibitions.value as LegacyProhibitionsValue | undefined)?.items ?? [])
      : [];
  const { visual } = splitProhibitions(prohibitionItems);
  const galleryValue = gallery?.status === "resolved" ? (gallery.value as GalleryValue | undefined) : undefined;
  const galleryRefs =
    galleryValue?.harvested?.filter((item) => item.included).map((item) => item.assetId) ?? [];

  if (!visual.length && !galleryRefs.length) return null;

  return {
    id: "visualWorld",
    status: "needs_user",
    value: undefined,
    candidates: [
      {
        value: {
          summary: visual.length
            ? `Evitar estética incompatible: ${visual.slice(0, 2).join("; ")}.`
            : "Mundo visual pendiente de síntesis con más referencias.",
          moodTags: [],
          visualTraits: [],
          limits: visual,
          evidence: [],
          galleryRefs,
        },
        score: prohibitions?.confidence ?? gallery?.confidence ?? 0.5,
        provenance: prohibitions?.provenance ?? gallery?.provenance ?? { type: "llm_synthesis", detail: "migración legacy" },
      },
    ],
    confidence: prohibitions?.confidence ?? gallery?.confidence ?? 0,
    provenance: prohibitions?.provenance ?? gallery?.provenance,
    locked: false,
    history: (prohibitions?.history ?? []) as SlotHistoryEntry<VisualWorldValue>[],
    updatedAt: prohibitions?.updatedAt ?? gallery?.updatedAt ?? new Date().toISOString(),
  };
}

export function hasLegacyGenomaSlots(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const slots = (raw as GenomaDocument).slots as LegacySlots | undefined;
  if (!slots) return false;
  return LEGACY_SLOT_KEYS.some((key) => {
    const slot = slots[key];
    return slot && slot.status !== "empty";
  });
}

/** Migra documentos legacy a slots v2 y elimina oneliner/values/prohibitions del resultado. */
export function migrateGenomaDocument(doc: GenomaDocument, legacy: LegacySlots): GenomaDocument {
  const slots = { ...doc.slots } as Record<SlotId, SlotState<unknown>>;
  const oneliner = legacySlot(legacy, "oneliner");
  const values = legacySlot(legacy, "values");
  const prohibitions = legacySlot(legacy, "prohibitions");
  const prohibitionItems =
    prohibitions?.status === "resolved"
      ? ((prohibitions.value as LegacyProhibitionsValue | undefined)?.items ?? [])
      : [];
  const { verbal: verbalAvoid } = splitProhibitions(prohibitionItems);

  if (!essenceIsPopulated(slots.essence)) {
    const essence = buildEssenceFromLegacy(oneliner, values);
    if (essence) slots.essence = essence;
  }

  if (slots.voice) {
    let voice = ensureVoiceContract(slots.voice);
    voice = mergeVoiceAvoid(voice, verbalAvoid);
    if (voice) slots.voice = voice;
  }

  if (!visualWorldIsPopulated(slots.visualWorld)) {
    const visualWorld = buildVisualWorldFromLegacy(prohibitions, slots.gallery);
    if (visualWorld) slots.visualWorld = visualWorld;
  }

  return { ...doc, slots };
}
