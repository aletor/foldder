import type { GalleryValue, GenomaDocument, LogoValue, SlotState, VoiceValue, VisualWorldValue, EssenceValue } from "./genoma-types";
import { galleryItemSourceUrl } from "./genoma-gallery-media";
import { galleryUsefulCount, normalizeGalleryInclusions } from "./genoma-gallery-filter";
import { buildVisualWorldFromGallery } from "./genoma-visual-synthesis";
import { groupLogoCandidatesForDisplay } from "./genoma-logo-policy";
import { rankHarvestedGalleryItems, rankLogoCandidatesMultiSource } from "./genoma-visual-rank";

const PLACEHOLDER_SUMMARY_RE =
  /activa ia|propuesta de respaldo|pendiente de revisión|manifiesto —|síntesis pendiente|revisa la síntesis antes de confirmar/i;

function isPlaceholderSummary(summary?: string): boolean {
  return PLACEHOLDER_SUMMARY_RE.test(summary ?? "");
}

function now(): string {
  return new Date().toISOString();
}

function autoResolveSingleCandidate<T>(slot: SlotState<T>): SlotState<T> {
  if (slot.status !== "candidates" || slot.candidates.length !== 1) return slot;
  const candidate = slot.candidates[0];
  return {
    ...slot,
    status: "resolved",
    value: candidate.value,
    provenance: candidate.provenance ?? slot.provenance,
    confidence: Math.max(candidate.score, slot.confidence, 0.62),
    needsReviewReason: slot.needsReviewReason ?? "La síntesis necesita revisión",
    updatedAt: now(),
  };
}

function improveEssenceValue(
  value: EssenceValue,
  brandName?: string,
): EssenceValue {
  if (!isPlaceholderSummary(value.summary)) return value;
  const brand = brandName?.trim() || "La marca";
  const labels = value.beliefs?.map((belief) => belief.label).filter(Boolean) ?? [];
  const headline = value.headline?.trim();
  const summary =
    labels.length >= 2
      ? `${brand} se presenta como una **productora audiovisual** con mirada **${labels.slice(0, 2).join(" y ").toLowerCase()}**, orientada a piezas con **narrativa**, carácter y emoción.`
      : headline
        ? `${brand} comunica desde un claim claro («${headline}») con una mirada **autoral y emocional**.`
        : `${brand} comunica con una **identidad verbal propia**, alejada del tono corporativo genérico.`;

  return {
    ...value,
    summary,
    beliefs: value.beliefs?.map((belief) => ({
      ...belief,
      label: belief.label.endsWith(".") ? belief.label : `${belief.label.replace(/\.$/, "")}.`,
    })),
  };
}

function improveVoiceValue(value: VoiceValue): VoiceValue {
  if (!/inferida del manifiesto|revisa la síntesis|activa ia|propuesta de respaldo/i.test(value.summary ?? "")) {
    return value;
  }
  const descriptors = value.descriptors?.slice(0, 3).join(", ") || "directa y narrativa";
  return {
    ...value,
    summary: `Voz **${descriptors}** con **reglas claras de escritura**, alejada del tono corporativo genérico.`,
  };
}

function normalizeGalleryHarvestedPreviewUrls(
  harvested: GalleryValue["harvested"],
): GalleryValue["harvested"] {
  return harvested.map((item) => {
    const preview = item.previewUrl?.trim();
    if (preview) return item;
    const source = galleryItemSourceUrl(item);
    return source ? { ...item, previewUrl: source } : item;
  });
}

/** Completa slots semánticos y normaliza galería tras crawl o al cargar documento. */
export function enrichGenomaDocument(doc: GenomaDocument): GenomaDocument {
  const slots = { ...doc.slots };
  const brandName = doc.brandName?.value;

  const gallerySlot = slots.gallery;
  if (gallerySlot?.value) {
    const normalizedGallery = normalizeGalleryInclusions(gallerySlot.value as GalleryValue);
    slots.gallery = {
      ...gallerySlot,
      value: {
        ...normalizedGallery,
        harvested: rankHarvestedGalleryItems(
          normalizeGalleryHarvestedPreviewUrls(normalizedGallery.harvested),
        ),
      },
      updatedAt: now(),
    };
  }

  const gallery = slots.gallery?.value as GalleryValue | undefined;
  const usefulImages = galleryUsefulCount(gallery);

  let essence = slots.essence;
  if (essence.status === "resolved" && essence.value && !essence.locked) {
    const improved = improveEssenceValue(essence.value as EssenceValue, brandName);
    if (improved.summary !== (essence.value as EssenceValue).summary) {
      essence = { ...essence, value: improved, updatedAt: now() };
    }
  } else if (!essence.locked) {
    essence = autoResolveSingleCandidate(essence as SlotState<EssenceValue>);
    if (essence.status === "resolved" && essence.value) {
      essence = {
        ...essence,
        value: improveEssenceValue(essence.value as EssenceValue, brandName),
        updatedAt: now(),
      };
    }
  }
  slots.essence = essence;

  let voice = slots.voice as SlotState<VoiceValue>;
  if (!voice.locked) {
    voice = autoResolveSingleCandidate(voice);
  }
  if (voice.status === "resolved" && voice.value && !voice.locked) {
    const improvedVoice = improveVoiceValue(voice.value as VoiceValue);
    if (improvedVoice.summary !== (voice.value as VoiceValue).summary) {
      voice = { ...voice, value: improvedVoice, updatedAt: now() };
    }
  }
  slots.voice = voice;

  const visualSlot = slots.visualWorld;
  const hasVisualSummary =
    visualSlot.status === "resolved" &&
    Boolean((visualSlot.value as VisualWorldValue | undefined)?.summary?.trim());

  if (!hasVisualSummary && gallery && usefulImages >= 6 && !visualSlot.locked) {
    const synthesized = buildVisualWorldFromGallery(gallery, brandName);
    if (synthesized) {
      slots.visualWorld = {
        ...visualSlot,
        status: "resolved",
        value: synthesized,
        confidence: Math.max(visualSlot.confidence, 0.68),
        provenance: visualSlot.provenance ?? {
          type: "llm_synthesis",
          detail: `síntesis visual desde ${usefulImages} imágenes`,
        },
        needsReviewReason: visualSlot.status === "needs_user" ? "La síntesis necesita revisión" : undefined,
        updatedAt: now(),
      };
    }
  }

  const logoSlot = slots.logo;
  if (logoSlot.candidates.length > 0 && !logoSlot.locked) {
    const candidates = groupLogoCandidatesForDisplay(
      rankLogoCandidatesMultiSource(
      logoSlot.candidates as import("./genoma-types").Candidate<LogoValue>[],
      doc.sources,
      ),
    );
    slots.logo = {
      ...logoSlot,
      candidates,
      confidence: Math.max(logoSlot.confidence, candidates[0]?.score ?? 0),
      updatedAt: now(),
    };
  }

  return { ...doc, slots, updatedAt: now() };
}
