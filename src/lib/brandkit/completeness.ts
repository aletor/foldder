import type { ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
import type { BrandKitBoardMeta, ElementKey, InterpretationMeta } from "./types";
import { BRANDKIT_REF_CATEGORIES } from "./types";
import {
  resolveProjectableReferenceRule,
  resolveProjectableTagline,
  resolveProjectableToneTraits,
  buildRawArtifactOptions,
} from "./voice-projection";
import { isRawArtifact } from "./raw-artifact";
import { getMeta, statusWeight } from "./interpretation";
import {
  messageKeyElementKey,
  paletteRoleElementKey,
  referenceItemElementKey,
  referenceRuleElementKey,
} from "./element-registry";
import { VOICE_EXAMPLES_ELEMENT_KEY } from "./synthesize-voice-examples";

/** B4 v2 — identidad visual (logo + paleta + referencias ≈ 42 pts). */
const LOGO_PRIMARY_WEIGHT = 19;
const LOGO_ALT_WEIGHT = 5;
const PALETTE_TARGET = 3;
const PALETTE_WEIGHT = 12;
const REF_CATEGORY_WEIGHT = 2;

/** Tipografía — presencia en libro, peso moderado. */
const TYPO_PRIMARY_WEIGHT = 7;
const TYPO_SECONDARY_WEIGHT = 3;

/** Voz / mensajes — bloque unificado (~44 pts). */
const TAGLINE_WEIGHT = 9;
const KEY_MESSAGES_WEIGHT = 12;
const TONE_CHIP_TARGET = 3;
const TONE_WEIGHT = 8;
const VOICE_EXAMPLES_TARGET = 3;
const VOICE_EXAMPLES_WEIGHT = 15;

export type CompletenessBucketId =
  | "logo.primary"
  | "logo.alt"
  | "palette"
  | "typography"
  | "messages.tagline"
  | "messages.key"
  | "tone"
  | "voice.examples"
  | "references";

export type CompletenessBucket = {
  id: CompletenessBucketId;
  label: string;
  earned: number;
  max: number;
};

export type CompletenessBreakdown = {
  percent: number;
  earned: number;
  total: number;
  buckets: CompletenessBucket[];
};

function scoreElement(meta: InterpretationMeta, maxPoints: number): number {
  if (meta.status === "rejected") return 0;
  return maxPoints * statusWeight(meta.status);
}

function hasHex(value: string | null | undefined): boolean {
  return typeof value === "string" && /^#[0-9A-Fa-f]{3,8}$/.test(value.trim());
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

function collectReferenceImagesForCategory(
  assets: ProjectAssetsMetadata,
  category: (typeof BRANDKIT_REF_CATEGORIES)[number],
): Array<{ id: string }> {
  const slot = assets.strategy.visualStyle[category];
  if (slot?.imageUrl || slot?.imageS3Key) return [{ id: slot.key }];
  const analyses = assets.strategy.visualReferenceAnalysis?.analyses ?? [];
  return analyses
    .filter((a) => a.classification !== "RAW_ASSET_ONLY")
    .slice(0, 8)
    .map((a) => ({ id: a.sourceAssetId }));
}

export function computeCompletenessBreakdown(
  assets: ProjectAssetsMetadata,
  boardMeta: BrandKitBoardMeta | undefined,
): CompletenessBreakdown {
  let earned = 0;
  let total = 0;
  const buckets: CompletenessBucket[] = [];
  const artifactOptions = buildRawArtifactOptions(assets);

  const pushBucket = (id: CompletenessBucketId, label: string, bucketEarned: number, bucketMax: number) => {
    buckets.push({ id, label, earned: bucketEarned, max: bucketMax });
    earned += bucketEarned;
    total += bucketMax;
  };

  const logoPrimaryMeta = getMeta(boardMeta, "logo.primary");
  const logoPrimaryEarned = assets.brand.logoPositive
    ? scoreElement(logoPrimaryMeta, LOGO_PRIMARY_WEIGHT)
    : 0;
  pushBucket("logo.primary", "Logo principal", logoPrimaryEarned, LOGO_PRIMARY_WEIGHT);

  const logoAltMeta = getMeta(boardMeta, "logo.alt");
  const logoAltEarned = assets.brand.logoNegative ? scoreElement(logoAltMeta, LOGO_ALT_WEIGHT) : 0;
  pushBucket("logo.alt", "Logo alternativo", logoAltEarned, LOGO_ALT_WEIGHT);

  const paletteColors = [
    { hex: assets.brand.colorPrimary, key: "palette.colorPrimary" as ElementKey },
    { hex: assets.brand.colorSecondary, key: "palette.colorSecondary" as ElementKey },
    { hex: assets.brand.colorAccent, key: "palette.colorAccent" as ElementKey },
  ].filter((c) => hasHex(c.hex));

  let paletteEarned = 0;
  if (paletteColors.length >= PALETTE_TARGET) {
    const avg =
      paletteColors.reduce((sum, c) => sum + statusWeight(getMeta(boardMeta, c.key).status), 0) /
      paletteColors.length;
    paletteEarned = PALETTE_WEIGHT * avg;
  }
  pushBucket("palette", "Paleta", paletteEarned, PALETTE_WEIGHT);

  const typoPrimaryMeta = getMeta(boardMeta, "typography.primary");
  const typoSecondaryMeta = getMeta(boardMeta, "typography.secondary");
  const typoMax = TYPO_PRIMARY_WEIGHT + TYPO_SECONDARY_WEIGHT;
  let typoEarned = 0;
  const primaryFamily = readTypographyFamily(assets, "primary");
  if (primaryFamily) typoEarned += scoreElement(typoPrimaryMeta, TYPO_PRIMARY_WEIGHT);
  const secondaryFamily = readTypographyFamily(assets, "secondary");
  if (secondaryFamily) typoEarned += scoreElement(typoSecondaryMeta, TYPO_SECONDARY_WEIGHT);
  pushBucket("typography", "Tipografía", typoEarned, typoMax);

  const taglineMeta = getMeta(boardMeta, "messages.tagline");
  const tagline = resolveProjectableTagline(assets, boardMeta, artifactOptions);
  const taglineEarned =
    tagline && !isRawArtifact(tagline, artifactOptions) ? scoreElement(taglineMeta, TAGLINE_WEIGHT) : 0;
  pushBucket("messages.tagline", "Tagline", taglineEarned, TAGLINE_WEIGHT);

  const keyMessages = assets.strategy.messageBlueprints?.length ?? 0;
  let keyMessagesEarned = 0;
  if (keyMessages > 0) {
    const keyScore =
      assets.strategy.messageBlueprints
        .slice(0, 3)
        .reduce((sum, bp) => sum + statusWeight(getMeta(boardMeta, messageKeyElementKey(bp.id)).status), 0) /
      Math.min(3, keyMessages);
    keyMessagesEarned = KEY_MESSAGES_WEIGHT * keyScore;
  }
  pushBucket("messages.key", "Mensajes clave", keyMessagesEarned, KEY_MESSAGES_WEIGHT);

  const toneMeta = getMeta(boardMeta, "tone");
  const toneChips = resolveProjectableToneTraits(assets, artifactOptions).slice(0, TONE_CHIP_TARGET);
  let toneEarned = 0;
  if (toneChips.length >= TONE_CHIP_TARGET) {
    toneEarned = scoreElement(toneMeta, TONE_WEIGHT);
  } else if (toneChips.length > 0) {
    toneEarned = TONE_WEIGHT * statusWeight(toneMeta.status) * (toneChips.length / TONE_CHIP_TARGET);
  }
  pushBucket("tone", "Tono", toneEarned, TONE_WEIGHT);

  const voiceExamplesMeta = getMeta(boardMeta, VOICE_EXAMPLES_ELEMENT_KEY);
  const voiceExamples = assets.strategy.voiceExamples.filter((example) => example.text.trim());
  let voiceExamplesEarned = 0;
  if (voiceExamples.length >= VOICE_EXAMPLES_TARGET) {
    voiceExamplesEarned = scoreElement(voiceExamplesMeta, VOICE_EXAMPLES_WEIGHT);
  } else if (voiceExamples.length > 0) {
    voiceExamplesEarned =
      VOICE_EXAMPLES_WEIGHT * statusWeight(voiceExamplesMeta.status) * (voiceExamples.length / VOICE_EXAMPLES_TARGET);
  }
  pushBucket("voice.examples", "Ejemplos de voz", voiceExamplesEarned, VOICE_EXAMPLES_WEIGHT);

  const referencesMax = REF_CATEGORY_WEIGHT * BRANDKIT_REF_CATEGORIES.length;
  let referencesEarned = 0;
  for (const category of BRANDKIT_REF_CATEGORIES) {
    const ruleMeta = getMeta(boardMeta, referenceRuleElementKey(category));
    const ruleText = resolveProjectableReferenceRule(
      assets.strategy.visualStyle[category]?.description,
      artifactOptions,
    );
    let categoryEarned = 0;
    if (ruleText) categoryEarned += scoreElement(ruleMeta, REF_CATEGORY_WEIGHT);
    const refs = collectReferenceImagesForCategory(assets, category);
    if (refs.length > 0 && categoryEarned <= 0) {
      const refAvg =
        refs.reduce(
          (sum, ref) => sum + statusWeight(getMeta(boardMeta, referenceItemElementKey(category, ref.id)).status),
          0,
        ) / refs.length;
      categoryEarned += REF_CATEGORY_WEIGHT * refAvg;
    }
    referencesEarned += Math.min(REF_CATEGORY_WEIGHT, categoryEarned);
  }
  pushBucket("references", "Referencias visuales", referencesEarned, referencesMax);

  const percent = total <= 0 ? 0 : Math.round((earned / total) * 100);
  return { percent, earned, total, buckets };
}

export function computeCompleteness(
  assets: ProjectAssetsMetadata,
  boardMeta: BrandKitBoardMeta | undefined,
): number {
  return computeCompletenessBreakdown(assets, boardMeta).percent;
}

export { paletteRoleElementKey };
