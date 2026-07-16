import type { BrandKitEvidence, EssenceBelief, EssenceValue, SlotId, SlotState } from "../brand-kit-types";
import { brandKitLocaleEs } from "../brand-kit-locale.es";
import { parseBrandKitRichText, stripBrandKitRichMarkup } from "../brand-kit-rich-text";
import { SLOT_LABELS_ES } from "./sidebar-slot-nav";
import { buildSlotTextEditConfig, isTextEditableSlotId } from "./brand-kit-slot-text-edit";

export type AtelierAttributeId =
  | "promise"
  | "purpose"
  | "pov"
  | "beliefs"
  | "summary"
  | "headline"
  | "descriptors"
  | "rules"
  | "avoid"
  | "moodTags"
  | "imageMedium"
  | "imageStyleTags"
  | "visualTraits"
  | "limits"
  | "primary"
  | "secondary"
  | `belief:${number}`;

export type AtelierEvidenceItem = {
  id: string;
  quote: string;
  sourceLabel: string;
  contributes?: string;
  attributeIds: AtelierAttributeId[];
  confidence?: "high" | "medium" | "low";
};

export type AtelierAttributeCard = {
  id: AtelierAttributeId;
  fieldId: string;
  label: string;
  hint?: string;
  essence: string;
  explanation?: string;
  keywords: string[];
  evidenceIds: string[];
  confirmed: boolean;
  multiline: boolean;
};

export type AtelierSynthesis = {
  kicker: string;
  headline: string;
  lead: string;
  rows: Array<{ label: string; value: string }>;
  personality: string[];
};

const ATTRIBUTE_HINTS: Partial<Record<AtelierAttributeId, string>> = {
  promise: "Qué garantiza la marca a su público.",
  purpose: "Por qué existe y qué protege.",
  pov: "Cómo interpreta su categoría.",
  beliefs: "Reglas que orientan sus decisiones.",
};

function uniqueKeywords(text: string): string[] {
  const fromMarkup = parseBrandKitRichText(text)
    .filter((segment) => segment.type === "bold")
    .map((segment) => stripBrandKitRichMarkup(segment.text).trim())
    .filter(Boolean);
  if (fromMarkup.length) return [...new Set(fromMarkup)].slice(0, 6);

  const plain = stripBrandKitRichMarkup(text);
  const parts = plain
    .split(/[·,;|/]/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3 && part.length <= 28 && part.split(/\s+/).length <= 3);
  return [...new Set(parts)].slice(0, 6);
}

function tokenize(text: string): string[] {
  return stripBrandKitRichMarkup(text)
    .toLowerCase()
    .split(/[^a-záéíóúüñ0-9]+/i)
    .filter((token) => token.length >= 4);
}

function overlapScore(a: string, b: string): number {
  const left = new Set(tokenize(a));
  const right = tokenize(b);
  if (!left.size || !right.length) return 0;
  let hits = 0;
  for (const token of right) {
    if (left.has(token)) hits += 1;
  }
  return hits / Math.max(left.size, 1);
}

function sourceLabelFromEvidence(item: BrandKitEvidence, index: number): string {
  if (item.sourceUrl) {
    try {
      const host = new URL(item.sourceUrl).hostname.replace(/^www\./, "");
      return host || `Fuente ${String(index + 1).padStart(2, "0")}`;
    } catch {
      return item.sourceUrl;
    }
  }
  if (item.fileId) return `Documento · ${item.fileId.slice(0, 8)}`;
  return `Fuente ${String(index + 1).padStart(2, "0")}`;
}

function contributeFromQuote(quote: string): string {
  const plain = stripBrandKitRichMarkup(quote).trim();
  if (plain.length <= 96) return plain;
  const sentence = plain.split(/(?<=[.!?])\s+/)[0] ?? plain;
  return sentence.length > 120 ? `${sentence.slice(0, 117).trim()}…` : sentence;
}

export function buildAtelierEvidenceItems(
  slotId: SlotId,
  slot: SlotState<unknown>,
): AtelierEvidenceItem[] {
  const items: AtelierEvidenceItem[] = [];

  if (slotId === "essence") {
    const essence = slot.value as EssenceValue | undefined;
    if (!essence) return items;

    (essence.evidence ?? []).forEach((evidence, index) => {
      const quote = evidence.quote?.trim();
      if (!quote) return;
      const attributeIds: AtelierAttributeId[] = [];
      const fields: Array<{ id: AtelierAttributeId; text?: string }> = [
        { id: "promise", text: essence.promise },
        { id: "purpose", text: essence.purpose },
        { id: "pov", text: essence.pov },
        { id: "summary", text: essence.summary },
      ];
      for (const field of fields) {
        if (field.text && overlapScore(field.text, quote) >= 0.12) attributeIds.push(field.id);
      }
      (essence.beliefs ?? []).forEach((belief, beliefIndex) => {
        const beliefText = `${belief.label} ${belief.explanation ?? ""}`;
        if (overlapScore(beliefText, quote) >= 0.12 || belief.evidence === quote) {
          attributeIds.push(`belief:${beliefIndex}`);
        }
      });
      if (!attributeIds.length) attributeIds.push("summary");

      items.push({
        id: `slot-${index}`,
        quote,
        sourceLabel: sourceLabelFromEvidence(evidence, index),
        contributes: contributeFromQuote(quote),
        attributeIds,
        confidence: attributeIds.length >= 2 ? "high" : "medium",
      });
    });

    (essence.beliefs ?? []).forEach((belief, beliefIndex) => {
      const quote = belief.evidence?.trim();
      if (!quote) return;
      if (items.some((item) => item.quote === quote)) {
        const existing = items.find((item) => item.quote === quote);
        if (existing && !existing.attributeIds.includes(`belief:${beliefIndex}`)) {
          existing.attributeIds.push(`belief:${beliefIndex}`);
        }
        return;
      }
      items.push({
        id: `belief-ev-${beliefIndex}`,
        quote,
        sourceLabel: brandKitLocaleEs.beliefs,
        contributes: contributeFromQuote(belief.explanation ?? belief.label),
        attributeIds: [`belief:${beliefIndex}`, "beliefs"],
        confidence: "medium",
      });
    });

    return items;
  }

  const value = slot.value as { evidence?: BrandKitEvidence[] } | undefined;
  (value?.evidence ?? []).forEach((evidence, index) => {
    const quote = evidence.quote?.trim();
    if (!quote) return;
    items.push({
      id: `slot-${index}`,
      quote,
      sourceLabel: sourceLabelFromEvidence(evidence, index),
      contributes: contributeFromQuote(quote),
      attributeIds: ["summary"],
      confidence: "medium",
    });
  });

  return items;
}

function splitEssenceParagraphs(text: string): { essence: string; explanation?: string } {
  const plain = stripBrandKitRichMarkup(text).trim();
  if (!plain) return { essence: "" };
  const parts = plain.split(/\n+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { essence: parts[0]!, explanation: parts.slice(1).join("\n") };
  }
  const sentences = plain.split(/(?<=[.!?])\s+/);
  if (sentences.length >= 2 && sentences[0]!.length <= 120) {
    return { essence: sentences[0]!, explanation: sentences.slice(1).join(" ") };
  }
  return { essence: plain };
}

function beliefCard(
  belief: EssenceBelief,
  index: number,
  evidenceItems: AtelierEvidenceItem[],
  confirmed: boolean,
): AtelierAttributeCard {
  const id = `belief:${index}` as const;
  const body = stripBrandKitRichMarkup(belief.explanation ?? "").trim();
  return {
    id,
    fieldId: "beliefs",
    label: stripBrandKitRichMarkup(belief.label).trim() || brandKitLocaleEs.beliefs,
    hint: ATTRIBUTE_HINTS.beliefs,
    essence: body || stripBrandKitRichMarkup(belief.label).trim(),
    explanation: undefined,
    keywords: uniqueKeywords(belief.explanation ?? belief.label),
    evidenceIds: evidenceItems.filter((item) => item.attributeIds.includes(id)).map((item) => item.id),
    confirmed,
    multiline: true,
  };
}

export function buildAtelierAttributeCards(
  slotId: SlotId,
  slot: SlotState<unknown>,
  evidenceItems: AtelierEvidenceItem[],
): AtelierAttributeCard[] {
  if (!isTextEditableSlotId(slotId)) return [];
  const confirmed = Boolean(slot.locked || slot.status === "resolved");
  const config = buildSlotTextEditConfig(slotId, slot);
  if (!config) return [];

  if (slotId === "essence") {
    const essence = slot.value as EssenceValue;
    const cards: AtelierAttributeCard[] = [];
    for (const id of ["promise", "purpose", "pov"] as const) {
      const text = essence[id]?.trim() ?? "";
      if (!text && !confirmed) continue;
      const split = splitEssenceParagraphs(text);
      cards.push({
        id,
        fieldId: id,
        label:
          id === "promise"
            ? brandKitLocaleEs.promise
            : id === "purpose"
              ? brandKitLocaleEs.purpose
              : brandKitLocaleEs.pov,
        hint: ATTRIBUTE_HINTS[id],
        essence: split.essence,
        explanation: split.explanation,
        keywords: uniqueKeywords(text),
        evidenceIds: evidenceItems.filter((item) => item.attributeIds.includes(id)).map((item) => item.id),
        confirmed,
        multiline: true,
      });
    }

    const beliefs = essence.beliefs ?? [];
    if (beliefs.length) {
      beliefs.forEach((belief, index) => {
        cards.push(beliefCard(belief, index, evidenceItems, confirmed));
      });
    }
    return cards;
  }

  return config.fields
    .filter((field) => field.id !== "summary" && field.id !== "headline")
    .map((field) => {
      const split = splitEssenceParagraphs(field.value);
      const id = field.id as AtelierAttributeId;
      return {
        id,
        fieldId: field.id,
        label: field.label,
        hint: ATTRIBUTE_HINTS[id],
        essence: split.essence || "—",
        explanation: split.explanation,
        keywords: uniqueKeywords(field.value),
        evidenceIds: evidenceItems
          .filter((item) => item.attributeIds.includes(id) || item.attributeIds.includes("summary"))
          .map((item) => item.id),
        confirmed,
        multiline: Boolean(field.multiline),
      } satisfies AtelierAttributeCard;
    });
}

export function buildAtelierSynthesis(
  slotId: SlotId,
  slot: SlotState<unknown>,
): AtelierSynthesis | null {
  if (!isTextEditableSlotId(slotId) || !slot.value) return null;

  if (slotId === "essence") {
    const essence = slot.value as EssenceValue;
    const personality = (essence.beliefs ?? [])
      .map((belief) => stripBrandKitRichMarkup(belief.label).trim())
      .filter(Boolean)
      .slice(0, 5);
    const headline = stripBrandKitRichMarkup(essence.headline ?? "").trim();
    const lead = stripBrandKitRichMarkup(essence.summary).trim();
    return {
      kicker: brandKitLocaleEs.essenceBrandKicker,
      headline: headline || (lead.length <= 90 ? lead : ""),
      lead: headline && lead === headline ? "" : lead,
      rows: [
        { label: brandKitLocaleEs.promise, value: stripBrandKitRichMarkup(essence.promise ?? "").trim() },
        { label: brandKitLocaleEs.purpose, value: stripBrandKitRichMarkup(essence.purpose ?? "").trim() },
        { label: brandKitLocaleEs.pov, value: stripBrandKitRichMarkup(essence.pov ?? "").trim() },
        {
          label: brandKitLocaleEs.personality,
          value: personality.join(" · "),
        },
      ].filter((row) => row.value),
      personality,
    };
  }

  const config = buildSlotTextEditConfig(slotId, slot);
  if (!config) return null;
  const summary = stripBrandKitRichMarkup(
    config.fields.find((field) => field.id === "summary")?.value ?? "",
  ).trim();
  const headlineRaw = stripBrandKitRichMarkup(
    config.fields.find((field) => field.id === "headline")?.value ?? "",
  ).trim();
  const headline = headlineRaw && headlineRaw.length <= 120 ? headlineRaw : "";
  const rows = config.fields
    .filter((field) => field.id !== "summary" && field.id !== "headline")
    .slice(0, 6)
    .map((field) => ({
      label: field.label,
      value: stripBrandKitRichMarkup(field.value).trim(),
    }))
    .filter((row) => row.value);

  return {
    kicker: SLOT_LABELS_ES[slotId] ?? slotId,
    headline,
    lead: summary,
    rows,
    personality: [],
  };
}

export function filterEvidenceForAttribute(
  items: AtelierEvidenceItem[],
  attributeId: AtelierAttributeId | null,
): AtelierEvidenceItem[] {
  if (!attributeId) return items;
  const matched = items.filter((item) => item.attributeIds.includes(attributeId));
  return matched.length ? matched : items;
}
