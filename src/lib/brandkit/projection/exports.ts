import type { ProjectBrandKit } from "@/app/spaces/project-assets-metadata";
import type { SourceKind } from "../model/evidence";
import { buildBookView } from "../projection/book-view";
import { resolveLogoDisplayUrl } from "../projection/logo-display-url";
import { computeCompleteness } from "../projection/completeness";
import type { Genome } from "../model/trait";
import type { ImageCategory, TraitId } from "../model/trait-ids";
import { imageTraitId } from "../model/trait-ids";
import type { ClaimValue, ImageAxes, ImageDnaValue } from "../model/trait-values";

function crownedTraitSignature(genome: Genome, traitId: keyof Genome["traits"]): string | null {
  const trait = genome.traits[traitId];
  if (!trait) return null;
  const crownedId = trait.crownedIds[0];
  const candidate = crownedId
    ? trait.candidates.find((c) => c.id === crownedId)
    : trait.candidates.find((c) => c.status !== "archived");
  return candidate?.signature ?? null;
}

/** Puerto brand enriquecido: solo lo coronado, listo para nodos downstream. */
export type BrandKitBrandProjection = ProjectBrandKit & {
  tagline: string | null;
  toneTraits: string[];
  typographyPrimary: string | null;
  typographySecondary: string | null;
  typographyPrimaryLicense: string | null;
  logoPrimaryVector: string | null;
  claimsAbsolute: string[];
  claimsForbidden: Array<{ text: string; why?: string }>;
  visualReferences: Array<{ category: ImageCategory; imageUrl: string; axes: ImageAxes }>;
  sources: Array<{ label: string; kind: SourceKind; url?: string }>;
};

export function projectGenomeToBrandKit(genome: Genome): BrandKitBrandProjection {
  const view = buildBookView(genome);
  const primary = view.logo.primary.value;
  const secondary = view.logo.secondary.items.find((i) => i.crowned)?.value ?? view.logo.secondary.items[0]?.value;
  const color = (role: (typeof view.palette)[number]["role"]) =>
    view.palette.find((p) => p.role === role && p.slot.state === "crowned")?.slot.value?.hex ??
    view.palette.find((p) => p.role === role)?.slot.value?.hex ??
    null;

  const visualReferences = view.visualUniverse.flatMap(({ category, slot }) =>
    slot.items
      .filter((i) => i.crowned && (i.derived?.generatedImageUrl ?? (i.value as ImageDnaValue).referenceImageUrl))
      .map((i) => ({
        category,
        imageUrl: (i.derived?.generatedImageUrl ?? (i.value as ImageDnaValue).referenceImageUrl)!,
        axes: (i.value as ImageDnaValue).axes,
      })),
  );

  const crownedForbidden = view.voice.claimsForbidden.items.filter((i) => i.crowned);
  const crownedAbsolute = view.voice.claimsAbsolute.items.filter((i) => i.crowned);

  const crownedLogo = view.logo.primary.state === "crowned" ? view.logo.primary : null;
  const logoPrimaryVector = crownedLogo?.derived?.vectorUrl ?? null;
  const logoPositiveUrl =
    resolveLogoDisplayUrl(
      primary?.variant === "positive" ? primary : secondary ?? primary,
      view.logo.primary.derived,
    ) ??
    (primary?.variant === "positive" ? primary.imageUrl : secondary?.imageUrl ?? primary?.imageUrl ?? null);

  return {
    logoPositive: logoPositiveUrl,
    logoNegative:
      primary?.variant === "negative"
        ? resolveLogoDisplayUrl(primary, view.logo.primary.derived) ?? primary.imageUrl
        : null,
    logoPrimaryVector,
    logoSignature: crownedTraitSignature(genome, "logo.primary"),
    colorPrimary: color("primary"),
    colorSecondary: color("secondary"),
    colorAccent: color("accent"),
    tagline: view.voice.tagline.state === "crowned" ? view.voice.tagline.value?.text ?? null : null,
    toneTraits: view.voice.tone.items.filter((i) => i.crowned).map((i) => i.value.text),
    typographyPrimary:
      view.typography.primary.state === "crowned" ? view.typography.primary.value?.family ?? null : null,
    typographySecondary:
      view.typography.secondary.state === "crowned" ? view.typography.secondary.value?.family ?? null : null,
    typographyPrimaryLicense:
      view.typography.primary.state === "crowned" ? view.typography.primary.value?.specimenLicense ?? null : null,
    claimsAbsolute: crownedAbsolute.map((c) => c.value.text),
    claimsForbidden: crownedForbidden.map((c) => {
      const v = c.value as ClaimValue;
      return { text: v.text, why: v.why };
    }),
    visualReferences,
    sources: genome.sources.map((s) => ({
      label: s.label,
      kind: s.kind,
      url: s.kind === "url" ? s.label : undefined,
    })),
  };
}

export type BrandKitDatasetRowMeta = {
  traitId: TraitId;
  crowned: boolean;
  sourceIds: string[];
};

export type BrandKitDatasetConstant = {
  fieldId: string;
  constantId: string;
  text?: string;
  color?: string;
  imageUrl?: string;
  role?: string;
  meta: BrandKitDatasetRowMeta;
};

export type BrandKitDatasetMessageRow = {
  rowId: string;
  message: string;
  audience?: string;
  meta: BrandKitDatasetRowMeta;
};

export type BrandKitDatasetForbiddenClaimRow = {
  rowId: string;
  text: string;
  why: string;
  meta: BrandKitDatasetRowMeta;
};

export type BrandKitDatasetSourceRow = {
  rowId: string;
  label: string;
  kind: SourceKind;
  url?: string;
  addedAt: string;
};

export type BrandKitDatasetProjection = {
  nodeId: string;
  constants: BrandKitDatasetConstant[];
  lists: {
    messages: BrandKitDatasetMessageRow[];
    tone: string[];
    forbiddenClaims: BrandKitDatasetForbiddenClaimRow[];
    sources: BrandKitDatasetSourceRow[];
  };
  toneTraits: string[];
  tagline: string | null;
  completenessPercent: number;
};

const VISUAL_FIELD: Partial<Record<ImageCategory, string>> = {
  environments: "image_environment",
  textures: "image_textures",
  people: "image_people",
  objects: "image_objects",
  protagonists: "image_protagonist",
  general: "image_general",
};

const COLOR_FIELD: Record<string, string> = {
  primary: "color_primary",
  secondary: "color_secondary",
  accent: "color_accent",
  background: "color_background",
  text: "color_text",
};

function traitMeta(genome: Genome, traitId: TraitId, crowned: boolean): BrandKitDatasetRowMeta {
  const trait = genome.traits[traitId];
  const candidate = trait?.candidates.find((c) => trait.crownedIds.includes(c.id)) ?? trait?.candidates[0];
  return {
    traitId,
    crowned,
    sourceIds: candidate?.sourceRefs ?? [],
  };
}

export function projectGenomeToDataset(nodeId: string, genome: Genome): BrandKitDatasetProjection {
  const view = buildBookView(genome);
  const constants: BrandKitDatasetConstant[] = [];
  const prefix = `gn:${nodeId}`;

  for (const { role, slot } of view.palette) {
    const hex = slot.value?.hex;
    if (!hex) continue;
    const fieldId = COLOR_FIELD[role] ?? `color_${role}`;
    constants.push({
      fieldId,
      constantId: `${prefix}:${fieldId}`,
      color: hex,
      role,
      meta: traitMeta(genome, slot.traitId, slot.state === "crowned"),
    });
  }

  const logoPositive =
    resolveLogoDisplayUrl(view.logo.primary.value, view.logo.primary.derived) ??
    view.logo.secondary.items[0]?.value?.imageUrl;
  if (logoPositive) {
    constants.push({
      fieldId: "logo_positive",
      constantId: `${prefix}:logo_positive`,
      imageUrl: logoPositive,
      meta: traitMeta(genome, "logo.primary", view.logo.primary.state === "crowned"),
    });
  }

  const negativePrimary = view.logo.primary.value;
  const negativeSecondary = view.logo.secondary.items.find((i) => i.value.variant === "negative");
  const logoNegative =
    negativePrimary?.variant === "negative"
      ? resolveLogoDisplayUrl(negativePrimary, view.logo.primary.derived) ?? negativePrimary.imageUrl
      : negativeSecondary
        ? resolveLogoDisplayUrl(negativeSecondary.value, negativeSecondary.derived) ??
          negativeSecondary.value.imageUrl
        : undefined;
  if (logoNegative) {
    constants.push({
      fieldId: "logo_negative",
      constantId: `${prefix}:logo_negative`,
      imageUrl: logoNegative,
      meta: traitMeta(genome, "logo.primary", view.logo.primary.state === "crowned"),
    });
  }

  if (view.voice.tagline.value?.text) {
    constants.push({
      fieldId: "context",
      constantId: `${prefix}:context`,
      text: view.voice.tagline.value.text,
      meta: traitMeta(genome, "message.tagline", view.voice.tagline.state === "crowned"),
    });
  }

  const toneTexts = view.voice.tone.items.map((i) => i.value.text);
  if (toneTexts.length) {
    constants.push({
      fieldId: "tone",
      constantId: `${prefix}:tone`,
      text: toneTexts.join(", "),
      meta: traitMeta(genome, "message.tone", view.voice.tone.items.some((i) => i.crowned)),
    });
  }

  for (const { category, slot } of view.visualUniverse) {
    const fieldId = VISUAL_FIELD[category];
    if (!fieldId) continue;
    for (const item of slot.items) {
      const url = item.derived?.generatedImageUrl ?? (item.value as ImageDnaValue).referenceImageUrl;
      if (!url) continue;
      constants.push({
        fieldId,
        constantId: `${prefix}:${fieldId}:${item.candidateId}`,
        imageUrl: url,
        meta: traitMeta(genome, imageTraitId(category), item.crowned),
      });
    }
  }

  const messages: BrandKitDatasetMessageRow[] = [];
  if (view.voice.tagline.value) {
    messages.push({
      rowId: "tagline",
      message: view.voice.tagline.value.text,
      audience: "marca",
      meta: traitMeta(genome, "message.tagline", view.voice.tagline.state === "crowned"),
    });
  }
  view.voice.claimsAbsolute.items.forEach((item, idx) => {
    messages.push({
      rowId: `claim_abs_${idx}`,
      message: item.value.text,
      audience: "claim permitido",
      meta: traitMeta(genome, "claim.absolute", item.crowned),
    });
  });

  const forbiddenClaims: BrandKitDatasetForbiddenClaimRow[] = view.voice.claimsForbidden.items.map((item, idx) => ({
    rowId: `claim_forb_${idx}`,
    text: item.value.text,
    why: item.value.why ?? "riesgo de credibilidad o cumplimiento",
    meta: traitMeta(genome, "claim.forbidden", item.crowned),
  }));

  const sources: BrandKitDatasetSourceRow[] = genome.sources.map((s) => ({
    rowId: s.id,
    label: s.label,
    kind: s.kind,
    url: s.kind === "url" ? s.label : undefined,
    addedAt: s.addedAt,
  }));

  return {
    nodeId,
    constants,
    lists: {
      messages,
      tone: toneTexts,
      forbiddenClaims,
      sources,
    },
    toneTraits: view.voice.tone.items.filter((i) => i.crowned).map((i) => i.value.text),
    tagline: view.voice.tagline.value?.text ?? null,
    completenessPercent: computeCompleteness(genome),
  };
}

export function syncGenomeExports(nodeId: string, genome: Genome) {
  return {
    brandKit: projectGenomeToBrandKit(genome),
    datasetProjection: projectGenomeToDataset(nodeId, genome),
    completenessPercent: computeCompleteness(genome),
  };
}
