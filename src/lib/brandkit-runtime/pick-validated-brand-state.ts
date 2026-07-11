import type { ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
import type { BrandKitBoardMeta } from "./types";
import { bootstrapSidecarFromAssets } from "./board-projection";
import { getMeta } from "./interpretation";

/**
 * Filtra assets para runtime downstream: solo campos validated (o legacy sin sidecar).
 * PR2 cableará esto en buildBrainRuntimeContext sin cambiar el shape de salida.
 */
export function pickValidatedBrandState(
  assets: ProjectAssetsMetadata,
  boardMetaInput?: BrandKitBoardMeta,
): ProjectAssetsMetadata {
  const persisted = boardMetaInput ?? assets.brainMeta?.boardMeta;
  if (!persisted || Object.keys(persisted.interpretation ?? {}).length === 0) {
    return assets;
  }

  const taglineMeta = getMeta(persisted, "messages.tagline");
  const toneMeta = getMeta(persisted, "tone");

  const corporateContext = taglineMeta.status === "validated" ? assets.knowledge.corporateContext : "";

  const languageTraits = toneMeta.status === "validated" ? assets.strategy.languageTraits : [];

  return {
    ...assets,
    knowledge: { ...assets.knowledge, corporateContext },
    strategy: { ...assets.strategy, languageTraits },
  };
}

export function isRuntimeValidatedStatus(status: string): boolean {
  return status === "validated";
}
