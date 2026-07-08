/**
 * Fusiona resultados de extracción en un Genome (addCandidate, sin merge).
 * Respeta classifyIncoming: firmas conocidas → silencio; prompt → modal §4.
 */

import type { Candidate } from "../model/evidence";
import type { SourceRef } from "../model/evidence";
import { createCandidate, signal } from "../model/evidence";
import { colorTraitId, type ColorRole, type TraitId } from "../model/trait-ids";
import type { ColorValue, LogoValue, TypographyValue } from "../model/trait-values";
import { upsertTrait, type Genome } from "../model/trait";
import type { TypographyExtraction } from "../extractors/typography";
import type { VoiceExtraction } from "../extractors/voice";
import type { VisualExtraction } from "../extractors/visual";
import type { PdfPaletteColor } from "@/lib/brain/pdf-brand-extract";
import { imageTraitId, type ImageCategory } from "../model/trait-ids";
import type { ClaimValue, ImageDnaValue, TaglineValue, ToneValue } from "../model/trait-values";
import { applyCandidateToGenome, type ApplyMaterialPromptOptions, type CandidateApplyResult, type MaterialPromptPayload } from "./material-prompt";
import { paletteRoleDisplayName } from "./palette-labels";

const PALETTE_ROLE_MAP: Partial<Record<PdfPaletteColor["role"], ColorRole>> = {
  primario: "primary",
  secundario: "secondary",
  acento: "accent",
  fondo: "background",
  soporte: "text",
};

export type ApplyExtractionResult = {
  genome: Genome;
  prompts: MaterialPromptPayload[];
};

function mergeSource(genome: Genome, source: SourceRef): Genome {
  if (genome.sources.some((s) => s.id === source.id)) return genome;
  return { ...genome, sources: [...genome.sources, source], updatedAt: new Date().toISOString() };
}

function mergeApply(
  acc: CandidateApplyResult,
  traitId: TraitId,
  candidate: Candidate<unknown>,
  opts?: ApplyMaterialPromptOptions,
): CandidateApplyResult {
  const next = applyCandidateToGenome(acc.genome, traitId, candidate, opts);
  return {
    genome: next.genome,
    prompts: [...acc.prompts, ...next.prompts],
  };
}

function applyMany<T>(
  genome: Genome,
  traitId: TraitId,
  candidates: Candidate<T>[],
  opts?: ApplyMaterialPromptOptions,
): CandidateApplyResult {
  let acc: CandidateApplyResult = { genome, prompts: [] };
  for (const c of candidates) {
    acc = mergeApply(acc, traitId, c as Candidate<unknown>, opts);
  }
  return acc;
}

export function applyTypographyExtraction(
  genome: Genome,
  extraction: TypographyExtraction,
  source: SourceRef,
  opts?: ApplyMaterialPromptOptions,
): ApplyExtractionResult {
  let g = mergeSource(genome, source);
  let prompts: MaterialPromptPayload[] = [];
  for (const c of extraction.primary) {
    const r = applyMany<TypographyValue>(g, "typography.primary", [c], opts);
    g = r.genome;
    prompts = [...prompts, ...r.prompts];
  }
  for (const c of extraction.secondary) {
    const r = applyMany<TypographyValue>(g, "typography.secondary", [c], opts);
    g = r.genome;
    prompts = [...prompts, ...r.prompts];
  }
  for (const c of extraction.doubtful) {
    const r = applyMany<TypographyValue>(g, "typography.primary", [c], opts);
    g = r.genome;
    prompts = [...prompts, ...r.prompts];
  }
  return { genome: g, prompts };
}

export function applyPaletteCandidates(
  genome: Genome,
  candidates: Candidate<ColorValue>[],
  source: SourceRef,
  opts?: ApplyMaterialPromptOptions,
): ApplyExtractionResult {
  let g = mergeSource(genome, source);
  let prompts: MaterialPromptPayload[] = [];
  for (const c of candidates) {
    const r = applyMany<ColorValue>(g, colorTraitId(c.value.role), [c], opts);
    g = r.genome;
    prompts = [...prompts, ...r.prompts];
  }
  return { genome: g, prompts };
}

function logoTraitId(slot: "primary" | "secondary" | undefined, index: number): TraitId {
  const resolved = slot ?? (index === 0 ? "primary" : "secondary");
  return resolved === "primary" ? "logo.primary" : "logo.secondary";
}

export function applyLogoCandidates(
  genome: Genome,
  logos: Array<{
    imageUrl: string;
    signature: string;
    candidate: Candidate<LogoValue>;
    slot?: "primary" | "secondary";
  }>,
  source: SourceRef,
  opts?: ApplyMaterialPromptOptions,
): ApplyExtractionResult {
  let g = mergeSource(genome, source);
  let prompts: MaterialPromptPayload[] = [];
  logos.forEach((entry, index) => {
    const traitId = logoTraitId(entry.slot, index);
    const r = applyMany<LogoValue>(g, traitId, [entry.candidate], opts);
    g = r.genome;
    prompts = [...prompts, ...r.prompts];
  });
  return { genome: g, prompts };
}

export function applyVoiceExtraction(
  genome: Genome,
  extraction: VoiceExtraction,
  source: SourceRef,
  opts?: ApplyMaterialPromptOptions,
): ApplyExtractionResult {
  let g = mergeSource(genome, source);
  let prompts: MaterialPromptPayload[] = [];
  const batches: Array<[TraitId, Candidate<unknown>[]]> = [
    ["message.tagline", extraction.tagline as Candidate<unknown>[]],
    ["message.tone", extraction.tone as Candidate<unknown>[]],
    ["claim.absolute", extraction.absolute as Candidate<unknown>[]],
    ["claim.forbidden", extraction.forbidden as Candidate<unknown>[]],
  ];
  for (const [traitId, list] of batches) {
    for (const c of list) {
      const r = mergeApply({ genome: g, prompts }, traitId, c, opts);
      g = r.genome;
      prompts = r.prompts;
    }
  }
  return { genome: g, prompts };
}

export function applyVisualExtraction(
  genome: Genome,
  extraction: VisualExtraction,
  source: SourceRef,
  opts?: ApplyMaterialPromptOptions,
): ApplyExtractionResult {
  let g = mergeSource(genome, source);
  let prompts: MaterialPromptPayload[] = [];
  for (const [category, candidates] of Object.entries(extraction) as Array<[ImageCategory, Candidate<ImageDnaValue>[]]>) {
    const traitId = imageTraitId(category);
    for (const c of candidates ?? []) {
      const r = mergeApply({ genome: g, prompts }, traitId, c as Candidate<unknown>, opts);
      g = r.genome;
      prompts = r.prompts;
    }
  }
  return { genome: g, prompts };
}

export function applyPaletteColors(
  genome: Genome,
  palette: PdfPaletteColor[],
  source: SourceRef,
  opts?: ApplyMaterialPromptOptions,
): ApplyExtractionResult {
  const candidates = palette.flatMap((sw) => {
    const role = PALETTE_ROLE_MAP[sw.role];
    if (!role) return [];
    return [
      createCandidate<ColorValue>({
        value: { hex: sw.hex, role, name: paletteRoleDisplayName(sw.role) },
        signals: [signal("operator-color", { detail: sw.detail, sourceRef: source.id, scale: sw.confidence })],
        signature: sw.hex.toLowerCase(),
        sourceRefs: [source.id],
      }),
    ];
  });
  return applyPaletteCandidates(genome, candidates, source, opts);
}
