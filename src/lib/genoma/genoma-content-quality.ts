import type { GalleryValue, GenomaDocument, SlotState } from "./genoma-types";
import type { EssenceValue, VoiceValue, VisualWorldValue } from "./genoma-types";
import { finalizeSemanticCandidateSlot } from "./genoma-reconcile";
import { copyUnitsToCorpus, type CopyUnit } from "./crawl/copy-units";
import {
  isBareGenericDescriptor,
  looksLikeFragmentedBelief,
  looksLikeLiteralCorpusQuote,
  normalizeQuoteText,
  penalizeBareGenericDescriptors,
} from "./genoma-evidence";
import { galleryUsefulCount } from "./genoma-gallery-filter";
import { buildVisualWorldFromGallery } from "./genoma-visual-synthesis";

const REVIEW_REASON = "La síntesis necesita revisión";

export type QualityAction = "accept" | "repair" | "review" | "needs_user";

export type QualityResult<T = unknown> =
  | { action: "accept"; confidence?: number }
  | { action: "repair"; reasons: string[]; value: T; confidence: number }
  | { action: "review"; reasons: string[]; value?: T; confidence?: number }
  | { action: "needs_user"; reasons: string[] };

type SemanticSlotId = "essence" | "voice" | "visualWorld";

function collectEssenceIssues(essence: EssenceValue, corpus: string): string[] {
  const issues: string[] = [];
  const summary = normalizeQuoteText(essence.summary ?? "");
  if (!summary || summary.length < 24) issues.push("summary vacío o demasiado corto");
  if (looksLikeLiteralCorpusQuote(summary, corpus)) issues.push("summary es cita literal del corpus");
  if (essence.headline && normalizeQuoteText(essence.headline) === summary) {
    issues.push("summary duplica headline sin interpretar");
  }
  const fragmented = essence.beliefs.filter((belief) => looksLikeFragmentedBelief(belief.label));
  if (fragmented.length >= Math.max(1, Math.floor(essence.beliefs.length / 2))) {
    issues.push("beliefs son fragmentos del corpus");
  }
  if (!essence.beliefs.length && !essence.evidence?.length) issues.push("sin creencias ni evidencia");
  return issues;
}

function collectVoiceIssues(voice: VoiceValue, corpus: string): string[] {
  const issues: string[] = [];
  const summary = normalizeQuoteText(voice.summary ?? "");
  if (!summary || summary.length < 24) issues.push("summary vacío");
  if (looksLikeLiteralCorpusQuote(summary, corpus)) issues.push("summary es cita literal");
  if (voice.descriptors.some((descriptor) => looksLikeLiteralCorpusQuote(descriptor, corpus))) {
    issues.push("descriptors son citas del corpus");
  }
  const bareGeneric = voice.descriptors.filter((descriptor) => isBareGenericDescriptor(descriptor));
  if (bareGeneric.length >= 3) issues.push("descriptors genéricos sin sustancia");
  if (bareGeneric.length > 0) issues.push("descriptors genéricos a penalizar");
  if (voice.rules.length < 2) issues.push("rules insuficientes");
  return issues;
}

function collectVisualIssues(visual: VisualWorldValue, gallery?: GalleryValue): string[] {
  const useful = galleryUsefulCount(gallery);
  const issues: string[] = [];
  if (useful < 6) issues.push("galería insuficiente para mundo visual");
  const summary = normalizeQuoteText(visual.summary ?? "");
  if (!summary || summary.length < 24) issues.push("summary vacío");
  if (!visual.visualTraits?.length && !visual.moodTags?.length) issues.push("sin rasgos visuales");
  if (!visual.limits?.length) issues.push("sin límites visuales");
  return issues;
}

function repairEssenceValue(essence: EssenceValue, corpus: string, brandName?: string): EssenceValue {
  let summary = essence.summary?.trim() ?? "";
  if (!summary || summary.length < 24 || looksLikeLiteralCorpusQuote(summary, corpus)) {
    const brand = brandName?.trim() || "La marca";
    const labels = essence.beliefs.map((belief) => belief.label).filter(Boolean);
    summary =
      labels.length >= 2
        ? `${brand} se presenta con una mirada ${labels.slice(0, 2).join(" y ").toLowerCase()}, orientada a una identidad verbal propia y defendible.`
        : essence.headline
          ? `${brand} comunica desde un claim claro («${essence.headline}») con una síntesis que prioriza narrativa y carácter.`
          : `${brand} comunica con una identidad verbal propia, alejada del tono corporativo genérico.`;
  }

  const beliefs = essence.beliefs
    .filter((belief) => !looksLikeFragmentedBelief(belief.label))
    .map((belief) => ({
      ...belief,
      label: belief.label.trim(),
    }));

  return {
    ...essence,
    summary,
    beliefs: beliefs.length ? beliefs : essence.beliefs,
  };
}

function repairVoiceValue(voice: VoiceValue): VoiceValue {
  let summary = voice.summary?.trim() ?? "";
  if (summary.length < 24) {
    summary = "Voz con tono directo y narrativo, alejada del lenguaje corporativo genérico.";
  }

  const descriptors = penalizeBareGenericDescriptors(voice.descriptors);
  const rules =
    voice.rules.length >= 2
      ? voice.rules
      : [
          "Usar frases cortas con ritmo y claridad.",
          "Priorizar narrativa y emoción sobre mensajes vacíos.",
          ...(voice.rules ?? []),
        ].slice(0, 6);

  return {
    ...voice,
    summary,
    descriptors: descriptors.length > 0 ? descriptors : voice.descriptors.slice(0, 2),
    rules,
  };
}

function repairVisualWorldValue(
  visual: VisualWorldValue,
  gallery?: GalleryValue,
  brandName?: string,
): VisualWorldValue {
  const fallback = gallery ? buildVisualWorldFromGallery(gallery, brandName) : null;
  if (!fallback) return visual;

  return {
    summary: visual.summary?.trim().length >= 24 ? visual.summary : fallback.summary,
    moodTags: visual.moodTags?.length ? visual.moodTags : fallback.moodTags,
    visualTraits: visual.visualTraits?.length ? visual.visualTraits : fallback.visualTraits,
    limits: visual.limits?.length ? visual.limits : fallback.limits,
    evidence: visual.evidence?.length ? visual.evidence : fallback.evidence,
    galleryRefs: visual.galleryRefs?.length ? visual.galleryRefs : fallback.galleryRefs,
  };
}

function hasUsefulEssence(value: EssenceValue): boolean {
  return normalizeQuoteText(value.summary ?? "").length >= 24;
}

function hasUsefulVoice(value: VoiceValue): boolean {
  return normalizeQuoteText(value.summary ?? "").length >= 24 && value.rules.length >= 1;
}

function hasUsefulVisual(value: VisualWorldValue): boolean {
  return normalizeQuoteText(value.summary ?? "").length >= 24;
}

function assessEssenceQuality(
  essence: EssenceValue,
  corpus: string,
  brandName?: string,
): QualityResult<EssenceValue> {
  const issues = collectEssenceIssues(essence, corpus);
  if (!issues.length) return { action: "accept" };

  const repaired = repairEssenceValue(essence, corpus, brandName);
  const remaining = collectEssenceIssues(repaired, corpus);
  if (!remaining.length) return { action: "repair", reasons: issues, value: repaired, confidence: 0.68 };
  if (hasUsefulEssence(repaired)) {
    return { action: "review", reasons: remaining, value: repaired, confidence: 0.62 };
  }
  return { action: "needs_user", reasons: remaining };
}

function assessVoiceQuality(voice: VoiceValue, corpus: string): QualityResult<VoiceValue> {
  const issues = collectVoiceIssues(voice, corpus);
  if (!issues.length) return { action: "accept" };

  const repaired = repairVoiceValue(voice);
  const remaining = collectVoiceIssues(repaired, corpus);
  if (!remaining.length) return { action: "repair", reasons: issues, value: repaired, confidence: 0.7 };
  if (hasUsefulVoice(repaired)) {
    return { action: "review", reasons: remaining, value: repaired, confidence: 0.65 };
  }
  return { action: "needs_user", reasons: remaining };
}

function assessVisualQuality(
  visual: VisualWorldValue,
  gallery?: GalleryValue,
  brandName?: string,
): QualityResult<VisualWorldValue> {
  const useful = galleryUsefulCount(gallery);
  if (useful < 6) {
    const fallback = gallery ? buildVisualWorldFromGallery(gallery, brandName) : null;
    if (fallback) {
      return { action: "repair", reasons: ["sin síntesis visual IA"], value: fallback, confidence: 0.66 };
    }
    return { action: "needs_user", reasons: ["galería insuficiente para mundo visual"] };
  }

  const issues = collectVisualIssues(visual, gallery);
  if (!issues.length) return { action: "accept" };

  const repaired = repairVisualWorldValue(visual, gallery, brandName);
  const remaining = collectVisualIssues(repaired, gallery);
  if (!remaining.length) return { action: "repair", reasons: issues, value: repaired, confidence: 0.68 };
  if (hasUsefulVisual(repaired)) {
    return { action: "review", reasons: remaining, value: repaired, confidence: 0.64 };
  }
  return { action: "needs_user", reasons: remaining };
}

function applyQualityResult<T>(
  slot: SlotState<T>,
  result: QualityResult<T>,
): SlotState<T> {
  const now = new Date().toISOString();

  if (result.action === "accept") {
    const { needsReviewReason: _removed, ...rest } = slot;
    return { ...rest, updatedAt: now };
  }

  if (result.action === "repair" && result.value !== undefined) {
    return {
      ...slot,
      status: "resolved",
      value: result.value,
      confidence: result.confidence,
      needsReviewReason: undefined,
      updatedAt: now,
    };
  }

  if (result.action === "review" && result.value !== undefined) {
    return {
      ...slot,
      status: "resolved",
      value: result.value,
      confidence: result.confidence ?? 0.62,
      needsReviewReason: REVIEW_REASON,
      updatedAt: now,
    };
  }

  if (result.action === "review" || result.action === "needs_user") {
    const value = slot.value;
    if (value !== undefined) {
      return {
        ...slot,
        status: "candidates",
        value: undefined,
        candidates: [
          {
            value,
            score: slot.confidence,
            provenance: slot.provenance ?? { type: "llm_synthesis", detail: "revisión" },
          },
          ...slot.candidates,
        ],
        confidence: 0.55,
        needsReviewReason: result.reasons.join("; "),
        updatedAt: now,
      };
    }
    return {
      ...slot,
      status: "needs_user",
      value: undefined,
      confidence: 0,
      needsReviewReason: undefined,
      updatedAt: now,
    };
  }

  return slot;
}

function processSemanticSlot(
  slotId: SemanticSlotId,
  slot: SlotState<unknown>,
  corpus: string,
  gallery: GalleryValue | undefined,
  brandName?: string,
): SlotState<unknown> {
  if (slot.status !== "resolved" || !slot.value) return slot;
  if (slot.locked) return slot;

  if (slotId === "essence") {
    return finalizeSemanticCandidateSlot(
      slotId,
      applyQualityResult(slot, assessEssenceQuality(slot.value as EssenceValue, corpus, brandName)),
    );
  }
  if (slotId === "voice") {
    return finalizeSemanticCandidateSlot(
      slotId,
      applyQualityResult(slot, assessVoiceQuality(slot.value as VoiceValue, corpus)),
    );
  }
  return finalizeSemanticCandidateSlot(
    slotId,
    applyQualityResult(
      slot,
      assessVisualQuality(slot.value as VisualWorldValue, gallery, brandName),
    ),
  );
}

export function buildCorpusForQualityCheck(doc: GenomaDocument, copyUnits?: CopyUnit[]): string {
  if (copyUnits?.length) return copyUnitsToCorpus(copyUnits);
  const essence = doc.slots.essence?.value as EssenceValue | undefined;
  const voice = doc.slots.voice?.value as VoiceValue | undefined;
  const chunks = [
    ...(essence?.evidence ?? []).map((item) => item.quote),
    ...(voice?.evidence ?? []).map((item) => item.quote),
    ...(essence?.beliefs ?? []).map((belief) => belief.evidence ?? "").filter(Boolean),
  ];
  return chunks.join("\n");
}

/** Valida calidad semántica: repara antes de degradar; solo needs_user en casos vacíos. */
export function validateGenomaContentQuality(
  doc: GenomaDocument,
  options?: { corpus?: string; copyUnits?: CopyUnit[] },
): GenomaDocument {
  const corpus = options?.corpus ?? buildCorpusForQualityCheck(doc, options?.copyUnits);
  const gallery = doc.slots.gallery?.value as GalleryValue | undefined;
  const brandName = doc.brandName?.value;
  const slots = { ...doc.slots };

  for (const slotId of ["essence", "voice", "visualWorld"] as const) {
    slots[slotId] = processSemanticSlot(slotId, slots[slotId], corpus, gallery, brandName);
  }

  return { ...doc, slots, updatedAt: new Date().toISOString() };
}

export { REVIEW_REASON };
