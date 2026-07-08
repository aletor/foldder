import type { BrainDiscoveredBrandAsset, ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
import type { BrainStrategy } from "@/app/spaces/project-assets-metadata";
import { normalizeBrandKitBoardMeta, patchMeta } from "./interpretation";
import { logoCandidateElementKey } from "./element-registry";
import type { BrandKitBoardMeta } from "./types";
import { isPhashNearRejected, phashHammingDistance, LOGO_PHASH_MATCH_THRESHOLD } from "@/lib/brandkit/logo-phash";

function mergeClusterAsset(
  previous: BrainDiscoveredBrandAsset,
  incoming: BrainDiscoveredBrandAsset,
): BrainDiscoveredBrandAsset {
  const prevDocs = previous.sourceDocumentIds ?? (previous.sourceDocumentId ? [previous.sourceDocumentId] : []);
  const nextDocs = incoming.sourceDocumentIds ?? (incoming.sourceDocumentId ? [incoming.sourceDocumentId] : []);
  const mergedDocIds = [...new Set([...prevDocs, ...nextDocs])];
  const incomingScore = incoming.clusterScore ?? incoming.confidence ?? 0;
  const previousScore = previous.clusterScore ?? previous.confidence ?? 0;
  const useIncomingMaster = incomingScore >= previousScore;

  return {
    ...previous,
    ...(useIncomingMaster
      ? {
          value: incoming.value,
          imageUrl: incoming.imageUrl,
          label: incoming.label,
        }
      : {}),
    pageCount: (previous.pageCount ?? 0) + (incoming.pageCount ?? 0),
    documentCount: mergedDocIds.length,
    sourceDocumentIds: mergedDocIds,
    sourceDocumentId: mergedDocIds[0] ?? previous.sourceDocumentId,
    clusterScore: Math.max(previousScore, incomingScore),
    confidence: Math.max(previous.confidence ?? 0, incoming.confidence ?? 0),
    logoPHash: previous.logoPHash ?? incoming.logoPHash,
    polarity: previous.polarity ?? incoming.polarity,
  };
}

export function mergeDiscoveredLogoClusterAssets(
  previous: BrainDiscoveredBrandAsset[],
  incoming: BrainDiscoveredBrandAsset[],
): BrainDiscoveredBrandAsset[] {
  const logos = previous.filter((a) => a.kind === "logo");
  const colors = previous.filter((a) => a.kind === "color");

  for (const asset of incoming) {
    if (asset.kind !== "logo") continue;
    const matchIdx = logos.findIndex(
      (p) =>
        p.logoPHash &&
        asset.logoPHash &&
        phashHammingDistance(p.logoPHash, asset.logoPHash) <= LOGO_PHASH_MATCH_THRESHOLD,
    );
    if (matchIdx >= 0) {
      logos[matchIdx] = mergeClusterAsset(logos[matchIdx], asset);
    } else {
      logos.push({ ...asset, documentCount: asset.documentCount ?? 1 });
    }
  }

  return [...logos, ...colors]
    .sort((a, b) => (b.clusterScore ?? b.confidence ?? 0) - (a.clusterScore ?? a.confidence ?? 0))
    .slice(0, 40);
}

export function mergeDiscoveredLogoClustersIntoStrategy(
  strategy: BrainStrategy,
  incoming: BrainDiscoveredBrandAsset[],
): BrainStrategy {
  if (!incoming.length) return strategy;
  const general = strategy.visualGeneralLook ?? {};
  const merged = mergeDiscoveredLogoClusterAssets(general.discoveredBrandAssets ?? [], incoming);
  return {
    ...strategy,
    visualGeneralLook: {
      ...general,
      discoveredBrandAssets: merged,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function applyLogoCandidateSidecar(
  boardMetaInput: BrandKitBoardMeta | undefined,
  candidates: BrainDiscoveredBrandAsset[],
  rejectedSignatures?: string[],
): BrandKitBoardMeta {
  let boardMeta = normalizeBrandKitBoardMeta(boardMetaInput);
  for (const candidate of candidates) {
    if (candidate.kind !== "logo") continue;
    const key = logoCandidateElementKey(candidate.id);
    const existing = boardMeta.interpretation[key];
    if (existing?.status === "validated" || existing?.status === "rejected") continue;
    if (candidate.logoPHash && isPhashNearRejected(candidate.logoPHash, rejectedSignatures)) {
      boardMeta = patchMeta(boardMeta, key, { status: "rejected", validatedAt: undefined });
      continue;
    }
    if (existing?.status === "proposed") continue;
    boardMeta = patchMeta(boardMeta, key, {
      status: "proposed",
      confidence: Math.max(0.35, Math.min(0.95, candidate.clusterScore ?? candidate.confidence ?? 0.5)),
      evidence: [
        {
          sourceId: candidate.id,
          kind: "pdf-embedded",
          detail: `cluster ${candidate.pageCount ?? 0}p`,
          confidence: 0.6,
          extractedAt: new Date().toISOString(),
        },
      ],
      proposedAt: new Date().toISOString(),
    });
  }
  return boardMeta;
}

export function topDiscoveredLogoUrl(assets: ProjectAssetsMetadata): string | null {
  const logos = (assets.strategy.visualGeneralLook?.discoveredBrandAssets ?? []).filter((a) => a.kind === "logo");
  const top = logos.sort(
    (a, b) => (b.clusterScore ?? b.confidence ?? 0) - (a.clusterScore ?? a.confidence ?? 0),
  )[0];
  return top?.imageUrl?.trim() || top?.value?.trim() || null;
}
