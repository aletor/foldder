import type { ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
import { filterLegacyLanguageTraits } from "@/lib/brain/brain-brand-summary";
import type { BrandKitBoardMeta } from "./types";
import { getMeta } from "./interpretation";
import {
  filterProjectableToneTraits,
  isProjectableVoiceEvidence,
  isRawArtifact,
  type RawArtifactOptions,
} from "./raw-artifact";

export function buildRawArtifactOptions(assets: ProjectAssetsMetadata): RawArtifactOptions {
  const sourceFilenames = assets.knowledge.documents.map((d) => d.name).filter(Boolean);
  return { sourceFilenames };
}

function firstNonArtifactLine(text: string, options?: RawArtifactOptions): string | null {
  for (const line of text.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || isRawArtifact(trimmed, options)) continue;
    return trimmed;
  }
  return null;
}

function taglineFromFunnel(assets: ProjectAssetsMetadata, options?: RawArtifactOptions): string | null {
  for (const message of assets.strategy.funnelMessages ?? []) {
    const text = message.text?.trim();
    if (text && !isRawArtifact(text, options)) return text;
  }
  return null;
}

function taglineFromBlueprints(assets: ProjectAssetsMetadata, options?: RawArtifactOptions): string | null {
  for (const bp of assets.strategy.messageBlueprints ?? []) {
    const claim = bp.claim?.trim();
    if (claim && !isRawArtifact(claim, options)) return claim;
  }
  return null;
}

/**
 * Resolves a projectable brand message — never raw `extractedContext` / corporate headers.
 */
export function resolveProjectableTagline(
  assets: ProjectAssetsMetadata,
  boardMeta?: BrandKitBoardMeta,
  options?: RawArtifactOptions,
): string | null {
  const artifactOptions = options ?? buildRawArtifactOptions(assets);
  const taglineMeta = getMeta(boardMeta, "messages.tagline");
  const hasSynthesisEvidence = taglineMeta.evidence.some((e) => isProjectableVoiceEvidence(e.kind));

  const fromFunnel = taglineFromFunnel(assets, artifactOptions);
  if (fromFunnel) return fromFunnel;

  const fromBlueprint = taglineFromBlueprints(assets, artifactOptions);
  if (fromBlueprint) return fromBlueprint;

  if (taglineMeta.status === "validated" || hasSynthesisEvidence) {
    const corporate = assets.knowledge.corporateContext?.trim();
    if (corporate) {
      const line = firstNonArtifactLine(corporate, artifactOptions);
      if (line) return line;
    }
  }

  return null;
}

export function resolveProjectableReferenceRule(
  rule: string | undefined | null,
  options?: RawArtifactOptions,
): string {
  const text = rule?.trim() ?? "";
  if (!text || isRawArtifact(text, options)) return "";
  return text;
}

export function resolveProjectableToneTraits(
  assets: ProjectAssetsMetadata,
  options?: RawArtifactOptions,
): string[] {
  const artifactOptions = options ?? buildRawArtifactOptions(assets);
  return filterProjectableToneTraits(filterLegacyLanguageTraits(assets.strategy.languageTraits), artifactOptions);
}
