import type { ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
import type { BrandKitBoardMeta, ElementKey } from "./types";
import { getMeta, markRejected, markValidated, normalizeBrandKitBoardMeta, resolveConflict } from "./interpretation";
import { listLogoCandidates } from "./logo-candidates";
import {
  appendRejectedLogoSignature,
  applyVectorizationToAssets,
  shouldVectorizeOnValidation,
  vectorizeValidatedLogo,
} from "./vectorize-logo";
import { FIELD_BINDINGS } from "./guarded-merge";

export function readElementValue(assets: ProjectAssetsMetadata, key: ElementKey): unknown {
  const binding = FIELD_BINDINGS.find((b) => b.key === key);
  if (binding) return binding.read(assets);
  if (key.startsWith("messages.key.")) {
    const id = key.replace("messages.key.", "");
    return assets.strategy.messageBlueprints.find((bp) => bp.id === id)?.claim ?? "";
  }
  return undefined;
}

export function writeElementValue(
  assets: ProjectAssetsMetadata,
  key: ElementKey,
  value: unknown,
): ProjectAssetsMetadata {
  const binding = FIELD_BINDINGS.find((b) => b.key === key);
  if (binding) return binding.write(assets, value);
  return assets;
}

export function validateElementOnBoardMeta(
  boardMetaInput: BrandKitBoardMeta | undefined,
  key: ElementKey,
): BrandKitBoardMeta {
  return markValidated(normalizeBrandKitBoardMeta(boardMetaInput), key);
}

export function rejectElementOnBoardMeta(
  boardMetaInput: BrandKitBoardMeta | undefined,
  key: ElementKey,
): BrandKitBoardMeta {
  return markRejected(normalizeBrandKitBoardMeta(boardMetaInput), key);
}

export async function applyLogoPrimaryValidationEffects(
  assets: ProjectAssetsMetadata,
): Promise<ProjectAssetsMetadata> {
  if (!shouldVectorizeOnValidation("logo.primary")) return assets;
  const result = await vectorizeValidatedLogo(assets.brand.logoPositive);
  return applyVectorizationToAssets(assets, result);
}

export type LogoCrownInput = {
  url: string;
  elementKey: ElementKey;
  phash?: string | null;
};

/** P2-5 — coronación atómica: valida elegido y rechaza el resto por sidecar + pHash. */
export function crownLogoCandidateOnAssets(
  assets: ProjectAssetsMetadata,
  chosen: LogoCrownInput,
): ProjectAssetsMetadata {
  const boardMeta = normalizeBrandKitBoardMeta(assets.brainMeta?.boardMeta);
  const candidates = listLogoCandidates(assets, boardMeta);

  let nextBoardMeta = markValidated(boardMeta, "logo.primary");
  let next: ProjectAssetsMetadata = {
    ...assets,
    brand: {
      ...assets.brand,
      logoPositive: chosen.url,
      ...(chosen.phash?.trim() ? { logoSignature: chosen.phash.trim() } : {}),
    },
  };

  for (const candidate of candidates) {
    if (candidate.url === chosen.url) continue;
    if (candidate.id === "logo-primary-current") continue;
    nextBoardMeta = markRejected(nextBoardMeta, candidate.elementKey);
    next = appendRejectedLogoSignature(next, candidate.url, candidate.phash);
  }

  return {
    ...next,
    brainMeta: {
      brainVersion: assets.brainMeta?.brainVersion ?? 1,
      analysisStatus: assets.brainMeta?.analysisStatus ?? "idle",
      staleReasons: assets.brainMeta?.staleReasons ?? [],
      ...assets.brainMeta,
      ...next.brainMeta,
      boardMeta: nextBoardMeta,
      pendingLogoPicker: false,
    },
  };
}

export function selectLogoCandidateOnAssets(
  assets: ProjectAssetsMetadata,
  candidateUrl: string,
  options?: Pick<LogoCrownInput, "elementKey" | "phash">,
): ProjectAssetsMetadata {
  const boardMeta = normalizeBrandKitBoardMeta(assets.brainMeta?.boardMeta);
  const match = listLogoCandidates(assets, boardMeta).find((c) => c.url === candidateUrl);
  return crownLogoCandidateOnAssets(assets, {
    url: candidateUrl,
    elementKey: options?.elementKey ?? match?.elementKey ?? "logo.primary",
    phash: options?.phash ?? match?.phash,
  });
}

export function rejectLogoCandidateOnAssets(
  assets: ProjectAssetsMetadata,
  candidateUrl: string,
  candidateElementKey: ElementKey,
  phash?: string | null,
): { assets: ProjectAssetsMetadata; boardMeta: BrandKitBoardMeta } {
  const boardMeta = rejectElementOnBoardMeta(assets.brainMeta?.boardMeta, candidateElementKey);
  const nextAssets = appendRejectedLogoSignature(
    {
      ...assets,
      brainMeta: {
        ...assets.brainMeta,
        brainVersion: assets.brainMeta?.brainVersion ?? 1,
        analysisStatus: assets.brainMeta?.analysisStatus ?? "idle",
        staleReasons: assets.brainMeta?.staleReasons ?? [],
        boardMeta,
      },
    },
    candidateUrl,
    phash,
  );
  return { assets: nextAssets, boardMeta };
}

export function resolveElementConflictOnAssets(
  assets: ProjectAssetsMetadata,
  key: ElementKey,
  chosenValue: unknown,
): { assets: ProjectAssetsMetadata; boardMeta: BrandKitBoardMeta } {
  const boardMeta = normalizeBrandKitBoardMeta(assets.brainMeta?.boardMeta);
  const meta = getMeta(boardMeta, key);
  const nextAssets = writeElementValue(assets, key, chosenValue);
  const nextBoardMeta = resolveConflict(boardMeta, key, chosenValue, meta.conflict?.candidates?.[1]?.evidence);
  return { assets: nextAssets, boardMeta: nextBoardMeta };
}

export function formatConflictCandidate(value: unknown): string {
  if (typeof value === "string") return value.trim() || "(vacío)";
  if (Array.isArray(value)) return value.filter((x) => typeof x === "string").join(", ") || "(lista)";
  if (value == null) return "(vacío)";
  return JSON.stringify(value);
}
