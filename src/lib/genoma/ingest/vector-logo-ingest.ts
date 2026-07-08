/**
 * Coronación directa de logo vectorial (SVG en corpus) — paso 1 universal.
 */

import { createCandidate, signal, type SourceRef } from "../model/evidence";
import type { LogoValue } from "../model/trait-values";
import { crown, getTrait, normalizeGenome, upsertTrait, type Genome } from "../model/trait";
import { applyLogoCandidates, type ApplyExtractionResult } from "./apply-extract";
import { bufferContentSha256 } from "./paid-operations-server";
import type { ApplyMaterialPromptOptions } from "./material-prompt";
import { BRAND_BEHAVIOR_PRIMARY } from "../extractors/brand-behavior";
import type { GenomaLogoCandidate } from "../extractors/logo";

export const AUTO_CROWN_MIN_INVARIANCE = 0.45;

export function hasCrownedLogoPrimary(genome: Genome): boolean {
  const trait = getTrait(genome, "logo.primary");
  return Boolean(trait?.crownedIds.length);
}

export function hasVectorCrownedLogo(genome: Genome): boolean {
  const trait = getTrait(genome, "logo.primary");
  const crowned = trait?.crownedIds
    .map((id) => trait.candidates.find((c) => c.id === id))
    .find(Boolean);
  return Boolean(crowned?.derived?.vectorUrl);
}

export async function crownVectorLogoIntoGenome(input: {
  svgBuffer: Buffer;
  label: string;
  genomeInput: Genome;
  source: SourceRef;
  signalDetail: string;
  userSupplied?: boolean;
  opts?: ApplyMaterialPromptOptions;
}): Promise<ApplyExtractionResult & { imageUrl: string; signature: string }> {
  let genome = normalizeGenome(input.genomeInput);
  const contentSha256 = bufferContentSha256(input.svgBuffer);
  const imageUrl = `data:image/svg+xml;base64,${input.svgBuffer.toString("base64")}`;
  const signature = `svg_${contentSha256.slice(0, 32)}`;

  const signals = input.userSupplied
    ? [signal("user-supplied", { detail: input.signalDetail, sourceRef: input.source.id })]
    : [
        signal("recurrence", { detail: input.signalDetail, sourceRef: input.source.id, scale: 1 }),
        signal("shape-dominant", { detail: input.signalDetail, sourceRef: input.source.id, scale: 1 }),
      ];

  const candidate = createCandidate<LogoValue>({
    value: { imageUrl, variant: "positive", label: input.label.replace(/\.svg$/i, "") || "logo" },
    signals,
    signature,
    sourceRefs: [input.source.id],
  });

  const withVector = {
    ...candidate,
    derived: { vectorUrl: imageUrl, generatedAt: new Date().toISOString() },
  };

  const logoApply = applyLogoCandidates(
    genome,
    [{ imageUrl, signature, candidate: withVector, slot: "primary" }],
    input.source,
    { allowMaterialPrompts: false, ...input.opts },
  );
  genome = logoApply.genome;

  const trait = getTrait(genome, "logo.primary");
  const added = trait?.candidates.find((c) => c.signature === signature);
  if (added && trait) {
    genome = upsertTrait(genome, crown(trait, added.id));
  }

  return { ...logoApply, genome, imageUrl, signature };
}

/** Corona el candidato raster principal si el comportamiento de marca supera el umbral (primer lote). */
export function autoCrownRasterLogoPrimary(
  genomeInput: Genome,
  primaryLogo: GenomaLogoCandidate | undefined,
  opts?: { minBehavior?: number; minInvariance?: number },
): Genome {
  if (!primaryLogo || hasCrownedLogoPrimary(genomeInput)) return genomeInput;

  const behavior = primaryLogo.brandBehavior?.total ?? 0;
  const invariance = primaryLogo.brandBehavior?.invariance ?? 0;
  const minBehavior = opts?.minBehavior ?? BRAND_BEHAVIOR_PRIMARY;
  const minInvariance = opts?.minInvariance ?? AUTO_CROWN_MIN_INVARIANCE;

  if (behavior < minBehavior || invariance < minInvariance) return genomeInput;

  const trait = getTrait(genomeInput, "logo.primary");
  const candidate = trait?.candidates.find((c) => c.signature === primaryLogo.logoPHash);
  if (!candidate || !trait) return genomeInput;

  return crownLogoPrimaryBySignature(genomeInput, primaryLogo.logoPHash);
}

export function crownLogoPrimaryBySignature(
  genomeInput: Genome,
  signature: string,
  options?: { replaceExisting?: boolean },
): Genome {
  if (hasCrownedLogoPrimary(genomeInput) && !options?.replaceExisting) return genomeInput;
  const trait = getTrait(genomeInput, "logo.primary");
  const candidate = trait?.candidates.find((c) => c.signature === signature);
  if (!candidate || !trait) return genomeInput;
  return upsertTrait(genomeInput, crown(trait, candidate.id));
}

export function applyRasterLogoExtraction(
  genomeInput: Genome,
  applyResult: ApplyExtractionResult,
  primaryLogo: GenomaLogoCandidate | undefined,
  promptOpts: ApplyMaterialPromptOptions,
  ambiguousPrimary = false,
): ApplyExtractionResult {
  const shouldAutoCrown =
    promptOpts.allowMaterialPrompts === false &&
    primaryLogo?.slot === "primary" &&
    !ambiguousPrimary;
  const genome = shouldAutoCrown
    ? autoCrownRasterLogoPrimary(applyResult.genome, primaryLogo)
    : applyResult.genome;
  return { ...applyResult, genome };
}
