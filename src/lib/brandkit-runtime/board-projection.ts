import type { ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
import { normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import type {
  BrandBoardView,
  BrandKitBoardMeta,
  ElementKey,
  InterpretationMeta,
  RefCategory,
  RefImageView,
  SwatchView,
} from "./types";
import { BRANDKIT_REF_CATEGORIES } from "./types";
import { computeCompleteness } from "./completeness";
import {
  createGhostMeta,
  createLegacyMeta,
  getMeta,
  normalizeBrandKitBoardMeta,
  patchMeta,
} from "./interpretation";
import { messageKeyElementKey, referenceItemElementKey, referenceRuleElementKey } from "./element-registry";
import {
  buildRawArtifactOptions,
  resolveProjectableReferenceRule,
  resolveProjectableTagline,
  resolveProjectableToneTraits,
} from "./voice-projection";

export function bootstrapSidecarFromAssets(assets: ProjectAssetsMetadata): BrandKitBoardMeta {
  let boardMeta = normalizeBrandKitBoardMeta(assets.brainMeta?.boardMeta);
  if (Object.keys(boardMeta.interpretation).length > 0) return boardMeta;

  const markIfValue = (key: ElementKey, hasValue: boolean, manual = false) => {
    if (!hasValue) return;
    boardMeta = patchMeta(boardMeta, key, manual ? createLegacyMeta("user") : createLegacyMeta());
    const meta = boardMeta.interpretation[key];
    if (meta && manual) {
      boardMeta = patchMeta(boardMeta, key, { ...meta, status: "validated", validatedAt: new Date(0).toISOString() });
    }
  };

  markIfValue("logo.primary", Boolean(assets.brand.logoPositive));
  markIfValue("logo.alt", Boolean(assets.brand.logoNegative));
  markIfValue("palette.colorPrimary", Boolean(assets.brand.colorPrimary));
  markIfValue("palette.colorSecondary", Boolean(assets.brand.colorSecondary));
  markIfValue("palette.colorAccent", Boolean(assets.brand.colorAccent));
  const artifactOptions = buildRawArtifactOptions(assets);
  markIfValue("messages.tagline", Boolean(resolveProjectableTagline(assets, boardMeta, artifactOptions)));
  markIfValue("tone", resolveProjectableToneTraits(assets, artifactOptions).length > 0);
  markIfValue("voice.examples", assets.strategy.voiceExamples.some((example) => example.text.trim()));

  for (const bp of assets.strategy.messageBlueprints.slice(0, 5)) {
    markIfValue(messageKeyElementKey(bp.id), Boolean(bp.claim.trim()));
  }

  for (const category of BRANDKIT_REF_CATEGORIES) {
    const ruleKey = referenceRuleElementKey(category);
    const desc = resolveProjectableReferenceRule(
      assets.strategy.visualStyle[category]?.description,
      artifactOptions,
    );
    markIfValue(ruleKey, Boolean(desc));
    const slot = assets.strategy.visualStyle[category];
    if (slot?.imageUrl || slot?.imageS3Key) {
      markIfValue(referenceItemElementKey(category, slot.key), true, slot.source === "manual");
    }
  }

  return boardMeta;
}

export function buildBrandBoardView(
  rawAssets: unknown,
  boardMetaInput?: BrandKitBoardMeta,
): BrandBoardView {
  const assets = normalizeProjectAssets(rawAssets);
  const boardMeta = boardMetaInput ?? bootstrapSidecarFromAssets(assets);
  const artifactOptions = buildRawArtifactOptions(assets);

  const palette: SwatchView[] = [
    swatchFromBrand("colorPrimary", assets.brand.colorPrimary, boardMeta),
    swatchFromBrand("colorSecondary", assets.brand.colorSecondary, boardMeta),
    swatchFromBrand("colorAccent", assets.brand.colorAccent, boardMeta),
  ].filter((s): s is SwatchView => Boolean(s));

  const references = {} as BrandBoardView["references"];
  for (const category of BRANDKIT_REF_CATEGORIES) {
    references[category] = buildReferenceSection(assets, category, boardMeta);
  }

  const primaryFamily = readTypographyFamily(assets, "primary");
  const secondaryFamily = readTypographyFamily(assets, "secondary");

  return {
    logo: {
      primary: { url: assets.brand.logoPositive, meta: getMeta(boardMeta, "logo.primary") },
      alt: { url: assets.brand.logoNegative, meta: getMeta(boardMeta, "logo.alt") },
    },
    palette,
    typography: {
      primaryFamily,
      secondaryFamily,
      weights: readTypographyWeights(assets),
      metaPrimary: getMeta(boardMeta, "typography.primary"),
      metaSecondary: getMeta(boardMeta, "typography.secondary"),
    },
    voice: {
      tagline: resolveProjectableTagline(assets, boardMeta, artifactOptions),
      taglineMeta: getMeta(boardMeta, "messages.tagline"),
      toneChips: resolveProjectableToneTraits(assets, artifactOptions)
        .slice(0, 8)
        .map((text) => ({ text, meta: getMeta(boardMeta, "tone") })),
    },
    references,
    sourcesCount: assets.knowledge.documents.length + assets.knowledge.urls.length,
    completenessPercent: computeCompleteness(assets, boardMeta),
    review: boardMeta.review,
  };
}

function swatchFromBrand(
  id: "colorPrimary" | "colorSecondary" | "colorAccent",
  hex: string | null,
  boardMeta: BrandKitBoardMeta,
): SwatchView | null {
  if (!hex || !/^#[0-9A-Fa-f]{3,8}$/.test(hex.trim())) return null;
  const key = `palette.${id}` as ElementKey;
  return { id, hex: hex.trim(), meta: getMeta(boardMeta, key) };
}

function buildReferenceSection(
  assets: ProjectAssetsMetadata,
  category: RefCategory,
  boardMeta: BrandKitBoardMeta,
) {
  const slot = assets.strategy.visualStyle[category];
  const artifactOptions = buildRawArtifactOptions(assets);
  const rule = resolveProjectableReferenceRule(slot?.description, artifactOptions);
  const items: RefImageView[] = [];
  if (slot?.imageUrl) {
    items.push({
      id: slot.key,
      assetUrl: slot.imageUrl,
      category,
      sourceId: slot.imageS3Key ?? slot.key,
      canonical: true,
      meta: getMeta(boardMeta, referenceItemElementKey(category, slot.key)),
    });
  }
  return {
    rule,
    ruleMeta: getMeta(boardMeta, referenceRuleElementKey(category)),
    items,
    order: items.map((i) => i.id),
  };
}

function readTypographyFamily(assets: ProjectAssetsMetadata, slot: "primary" | "secondary"): string | null {
  const strategy = assets.strategy as Record<string, unknown>;
  const typography = strategy.typography;
  if (!typography || typeof typography !== "object") return null;
  const entry = (typography as Record<string, unknown>)[slot];
  if (!entry || typeof entry !== "object") return null;
  const family = (entry as Record<string, unknown>).family;
  return typeof family === "string" && family.trim() ? family.trim() : null;
}

function readTypographyWeights(assets: ProjectAssetsMetadata): string[] {
  const strategy = assets.strategy as Record<string, unknown>;
  const typography = strategy.typography;
  if (!typography || typeof typography !== "object") return [];
  const primary = (typography as Record<string, unknown>).primary;
  if (!primary || typeof primary !== "object") return [];
  const weights = (primary as Record<string, unknown>).weights;
  if (!Array.isArray(weights)) return [];
  return weights.filter((w): w is string => typeof w === "string" && w.trim().length > 0).map((w) => w.trim());
}

/** Meta ghost por defecto exportado para UI. */
export { createGhostMeta };
