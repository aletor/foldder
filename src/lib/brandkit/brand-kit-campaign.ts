import type { BrandKitDocument, EssenceValue, SlotState, VoiceValue } from "./brand-kit-types";

export type BrandKitCampaign = {
  index: number;
  concept: string;
  headline: string;
  subheadline?: string;
  cta: string;
  compositiveRule: string;
};

export type BrandKitCampaignOverrides = {
  concept?: string;
  headline?: string;
  subheadline?: string;
  cta?: string;
  lockedHeadline?: boolean;
  lockedCta?: boolean;
};

function slotUsableValue<T>(slot: SlotState<unknown>, presentationMode: boolean): T | undefined {
  if (presentationMode && !slot.locked) return undefined;
  return slot.value as T | undefined;
}

function firstSentence(text: string | undefined, maxLen = 120): string | undefined {
  if (!text?.trim()) return undefined;
  const sentence = text.trim().split(/(?<=[.!?])\s+/)[0]?.trim();
  if (!sentence) return undefined;
  return sentence.length > maxLen ? `${sentence.slice(0, maxLen - 1).trim()}…` : sentence;
}

function truncate(text: string, maxLen: number): string {
  const value = text.trim();
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen - 1).trim()}…`;
}

function defaultCta(brandName: string, voice?: VoiceValue): string {
  const descriptor = voice?.descriptors?.find((item) => item.trim().length >= 4)?.trim();
  if (descriptor && descriptor.length <= 24) return descriptor;
  return `Descubre ${brandName}`;
}

/** Deriva campaña madre desde Esencia + Voz (determinista, sin LLM). */
export function deriveBrandKitCampaign(
  doc: BrandKitDocument,
  presentationMode: boolean,
): BrandKitCampaign {
  const brandName = doc.brandName?.value?.trim() || "la marca";
  const essence = slotUsableValue<EssenceValue>(doc.slots.essence, presentationMode);
  const voice = slotUsableValue<VoiceValue>(doc.slots.voice, presentationMode);
  const overrides = doc.campaignOverrides;

  const concept =
    overrides?.concept?.trim() ||
    essence?.headline?.trim() ||
    firstSentence(essence?.summary) ||
    firstSentence(essence?.promise) ||
    `La esencia de ${brandName}`;

  const headline =
    (overrides?.lockedHeadline && overrides.headline?.trim()) ||
    essence?.headline?.trim() ||
    firstSentence(voice?.summary, 80) ||
    concept;

  const subheadline =
    overrides?.subheadline?.trim() ||
    firstSentence(essence?.summary, 160) ||
    (voice?.descriptors?.length
      ? voice.descriptors
          .slice(0, 3)
          .map((item) => item.trim())
          .filter(Boolean)
          .join(" · ")
      : undefined);

  const cta =
    (overrides?.lockedCta && overrides.cta?.trim()) ||
    defaultCta(brandName, voice);

  return {
    index: 1,
    concept: truncate(concept, 96),
    headline: truncate(headline, 72),
    subheadline: subheadline ? truncate(subheadline, 140) : undefined,
    cta: truncate(cta, 32),
    compositiveRule: "Logo visible · headline corto · imagen aprobada · paleta dominante",
  };
}

export function campaignDisplayTitle(campaign: BrandKitCampaign): string {
  return `Campaña ${String(campaign.index).padStart(2, "0")} — ${campaign.headline}`;
}
