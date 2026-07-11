/**
 * Proyección BrandKitDocument (slots v2) → Genome (traits) para libro de estilo / PDF.
 * Bloqueado en v2 ≈ coronado en traits; resuelto sin bloquear ≈ propuesto.
 */

import type {
  EssenceValue,
  GalleryValue,
  BrandKitDocument,
  LogoValue as SlotLogoValue,
  PaletteValue,
  SlotId,
  SlotState,
  TypographyValue as SlotTypographyValue,
  VoiceValue,
  VisualWorldValue,
} from "../brand-kit-types";
import { createCandidate, signal, type SourceRef as TraitSourceRef } from "../model/evidence";
import {
  addCandidate,
  crown,
  createTrait,
  emptyGenome,
  upsertTrait,
  type Genome,
  type Trait,
} from "../model/trait";
import { COLOR_ROLES, colorTraitId, imageTraitId, type ColorRole, type TraitId } from "../model/trait-ids";
import type {
  ClaimValue,
  ColorValue,
  ImageDnaValue,
  LogoValue,
  TaglineValue,
  ToneValue,
  TypographyValue,
} from "../model/trait-values";
import { fontFamilySignature, textSignature } from "../model/signature";
import { computeCompleteness } from "./completeness";
import { enrichTypographySpecimen } from "../specimen/typography-specimen";

function slot<T>(doc: BrandKitDocument, id: SlotId): SlotState<T> | undefined {
  return doc.slots[id] as SlotState<T> | undefined;
}

function mapSources(doc: BrandKitDocument): TraitSourceRef[] {
  return doc.sources.map((source, index) => ({
    id: `v2_${index}_${source.ts}`,
    kind: source.kind === "url" ? "url" : "pdf",
    label: source.ref,
    contentSha256: source.contentSha256,
    addedAt: source.ts,
  }));
}

function mapLogoValue(value: SlotLogoValue): LogoValue {
  const imageUrl = value.previewUrl?.trim() || value.assetId;
  const assetOrigin =
    value.format === "svg"
      ? "vector_native"
      : value.detectionMethod === "upload"
        ? "render_crop"
        : "xobject_native";
  return {
    imageUrl,
    variant: "positive",
    assetOrigin,
    sourcePageNumber: value.sourcePageNumber,
    sourceBbox: value.sourceBbox,
    label: value.variants?.[0]?.kind,
  };
}

function mapTypographyFamily(
  family: SlotTypographyValue["families"][number],
): TypographyValue {
  return enrichTypographySpecimen({
    family: family.family,
    weights: family.weights.map((w) => String(w)),
    specimenAvailable: family.source === "google",
    fallback: family.role === "body" ? "serif" : "sans-serif",
  });
}

function upsertSingleTrait<T>(
  genome: Genome,
  traitId: TraitId,
  slotState: SlotState<T> | undefined,
  mapValue: (value: T) => unknown,
  signatureOf: (value: T) => string,
): Genome {
  if (!slotState || (slotState.status === "empty" && slotState.candidates.length === 0)) {
    return genome;
  }

  const userSignal =
    slotState.provenance?.type === "user_input"
      ? [signal("user-supplied", { detail: slotState.provenance.detail })]
      : [signal("brand-manual", { detail: slotState.provenance?.detail ?? "brand-kit-v2" })];

  let trait: Trait<unknown> = createTrait(traitId);

  if (slotState.value !== undefined) {
    const mapped = mapValue(slotState.value);
    const candidate = createCandidate({
      value: mapped,
      signals: userSignal,
      signature: signatureOf(slotState.value),
    });
    trait = addCandidate(trait, candidate);
    if (slotState.locked) trait = crown(trait, candidate.id);
  }

  slotState.candidates.forEach((alt, index) => {
    const candidate = createCandidate({
      value: mapValue(alt.value),
      signals: [signal("single-appearance", { detail: alt.provenance.detail })],
      signature: `${signatureOf(alt.value)}_alt_${index}`,
    });
    trait = addCandidate(trait, candidate);
  });

  if (trait.candidates.length === 0) return genome;
  return upsertTrait(genome, trait);
}

function upsertPaletteTraits(genome: Genome, palette: SlotState<PaletteValue> | undefined): Genome {
  if (!palette?.value?.colors?.length) return genome;

  let next = genome;
  const locked = palette.locked;

  for (const color of palette.value.colors) {
    const role = color.role === "neutral" ? "text" : (color.role as ColorRole);
    if (!COLOR_ROLES.includes(role)) continue;

    const traitId = colorTraitId(role);
    const colorValue: ColorValue = { hex: color.hex, role, name: color.role };
    let trait = createTrait<ColorValue>(traitId);
    const candidate = createCandidate({
      value: colorValue,
      signals: [signal("operator-color", { detail: palette.provenance?.detail ?? role })],
      signature: textSignature(`${role}:${color.hex}`),
    });
    trait = addCandidate(trait, candidate);
    if (locked) trait = crown(trait, candidate.id);
    next = upsertTrait(next, trait);
  }

  return next;
}

function upsertVoiceTraits(
  genome: Genome,
  voice: SlotState<VoiceValue> | undefined,
  essence: SlotState<EssenceValue> | undefined,
): Genome {
  let next = genome;

  const taglineText =
    essence?.value?.headline?.trim() ||
    essence?.value?.summary?.trim().split(/[.!?]/)[0]?.trim() ||
    "";
  if (taglineText) {
    const traitId: TraitId = "message.tagline";
    let trait = createTrait<TaglineValue>(traitId);
    const candidate = createCandidate({
      value: { text: taglineText },
      signals: [signal("brand-manual", { detail: "essence" })],
      signature: textSignature(taglineText),
    });
    trait = addCandidate(trait, candidate);
    if (essence?.locked || voice?.locked) trait = crown(trait, candidate.id);
    next = upsertTrait(next, trait);
  }

  const descriptors = voice?.value?.descriptors?.filter(Boolean) ?? [];
  if (descriptors.length) {
    const traitId: TraitId = "message.tone";
    let trait = createTrait<ToneValue>(traitId);
    descriptors.forEach((text, index) => {
      const candidate = createCandidate({
        value: { text },
        signals: [signal("brand-manual", { detail: "voice" })],
        signature: textSignature(text),
      });
      trait = addCandidate(trait, candidate);
      if (voice?.locked && index === 0) trait = crown(trait, candidate.id);
    });
    next = upsertTrait(next, trait);
  }

  const beliefs = essence?.value?.beliefs?.filter((b) => b.label?.trim()) ?? [];
  if (beliefs.length) {
    const traitId: TraitId = "claim.absolute";
    let trait = createTrait<ClaimValue>(traitId);
    beliefs.forEach((belief, index) => {
      const text = belief.label.trim();
      const candidate = createCandidate({
        value: { text, kind: "absolute" as const },
        signals: [signal("brand-manual", { detail: belief.explanation ?? "belief" })],
        signature: textSignature(text),
      });
      trait = addCandidate(trait, candidate);
      if (essence?.locked && index === 0) trait = crown(trait, candidate.id);
    });
    next = upsertTrait(next, trait);
  }

  const avoid = voice?.value?.avoid?.filter(Boolean) ?? [];
  if (avoid.length) {
    const traitId: TraitId = "claim.forbidden";
    let trait = createTrait<ClaimValue>(traitId);
    avoid.forEach((text, index) => {
      const candidate = createCandidate({
        value: { text, kind: "forbidden" as const },
        signals: [signal("brand-manual", { detail: "avoid" })],
        signature: textSignature(text),
      });
      trait = addCandidate(trait, candidate);
      if (voice?.locked && index === 0) trait = crown(trait, candidate.id);
    });
    next = upsertTrait(next, trait);
  }

  return next;
}

function upsertVisualTraits(
  genome: Genome,
  visualWorld: SlotState<VisualWorldValue> | undefined,
  gallery: SlotState<GalleryValue> | undefined,
): Genome {
  let next = genome;
  const locked = Boolean(visualWorld?.locked || gallery?.locked);

  const harvested =
    gallery?.value?.harvested?.filter((item) => item.included !== false && (item.previewUrl || item.assetId)) ?? [];
  if (harvested.length) {
    const traitId = imageTraitId("general");
    let trait = createTrait<ImageDnaValue>(traitId);
    harvested.slice(0, 8).forEach((item, index) => {
      const url = item.previewUrl ?? item.assetId;
      const candidate = createCandidate({
        value: {
          axes: { sujeto: "referencia visual", tratamiento: item.provenance.detail || "cosecha web" },
          referenceImageUrl: url,
        },
        signals: [signal("visual-brand", { detail: item.provenance.detail })],
        signature: textSignature(url),
      });
      trait = addCandidate(trait, candidate);
      if (locked && index === 0) trait = crown(trait, candidate.id);
    });
    next = upsertTrait(next, trait);
  }

  const mood = visualWorld?.value?.moodTags?.filter(Boolean) ?? [];
  if (mood.length) {
    const traitId = imageTraitId("environments");
    let trait = createTrait<ImageDnaValue>(traitId);
    const axes: ImageDnaValue["axes"] = {
      sujeto: visualWorld?.value?.summary?.trim() || "entornos de marca",
      tratamiento: mood.slice(0, 3).join(", "),
      paleta: visualWorld?.value?.visualTraits?.slice(0, 2).join(", "),
    };
    const candidate = createCandidate({
      value: { axes },
      signals: [signal("llm-vision", { detail: "visual-world" })],
      signature: textSignature(JSON.stringify(axes)),
    });
    trait = addCandidate(trait, candidate);
    if (locked) trait = crown(trait, candidate.id);
    next = upsertTrait(next, trait);
  }

  return next;
}

/** Proyecta un documento v2 a Genome para render PDF / libro de estilo. */
export function brandKitDocumentToGenome(doc: BrandKitDocument): Genome {
  const sources = mapSources(doc);
  let genome: Genome = { ...emptyGenome(), sources, updatedAt: doc.updatedAt };

  const logoSlot = slot<SlotLogoValue>(doc, "logo");
  genome = upsertSingleTrait(genome, "logo.primary", logoSlot, mapLogoValue, (v) =>
    textSignature(v.previewUrl ?? v.assetId),
  );

  const typoSlot = slot<SlotTypographyValue>(doc, "typography");
  if (typoSlot?.value?.families?.length) {
    const primary =
      typoSlot.value.families.find((f) => f.role === "display" || f.role === "heading") ??
      typoSlot.value.families[0];
    const secondary =
      typoSlot.value.families.find((f) => f.role === "body" && f.family !== primary?.family) ??
      typoSlot.value.families[1];

    if (primary) {
      genome = upsertSingleTrait(
        genome,
        "typography.primary",
        { ...typoSlot, value: { families: [primary] } as SlotTypographyValue },
        () => mapTypographyFamily(primary),
        (v) => fontFamilySignature(v.families[0]?.family ?? primary.family),
      );
    }
    if (secondary) {
      genome = upsertSingleTrait(
        genome,
        "typography.secondary",
        { ...typoSlot, value: { families: [secondary] } as SlotTypographyValue },
        () => mapTypographyFamily(secondary),
        (v) => fontFamilySignature(v.families[0]?.family ?? secondary.family),
      );
    }
  }

  genome = upsertPaletteTraits(genome, slot<PaletteValue>(doc, "palette"));
  genome = upsertVoiceTraits(genome, slot<VoiceValue>(doc, "voice"), slot<EssenceValue>(doc, "essence"));
  genome = upsertVisualTraits(
    genome,
    slot<VisualWorldValue>(doc, "visualWorld"),
    slot<GalleryValue>(doc, "gallery"),
  );

  return {
    ...genome,
    completenessPercent: computeCompleteness(genome),
    updatedAt: doc.updatedAt,
  };
}
