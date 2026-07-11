import type { BrainDiscoveredBrandAsset, ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
import { collectDiscoveredLogos } from "./dataset-value-resolvers";
import { isLogoSignatureRejected } from "./logo-signature";
import { logoCandidateElementKey } from "./element-registry";
import type { BrandKitBoardMeta, ElementKey } from "./types";
import { isPhashNearRejected, phashHammingDistance, LOGO_PHASH_MATCH_THRESHOLD } from "@/lib/brandkit/logo-phash";

export type LogoCandidateView = {
  id: string;
  elementKey: ElementKey;
  url: string;
  label: string;
  contextLine: string;
  pageCount: number;
  documentCount: number;
  score: number;
  rejected: boolean;
  phash?: string;
};

function candidateContextLine(asset: BrainDiscoveredBrandAsset): string {
  const pages = asset.pageCount ?? 1;
  const docs = asset.documentCount ?? 1;
  return `aparece en ${pages} página${pages === 1 ? "" : "s"} · ${docs} documento${docs === 1 ? "" : "s"}`;
}

function isCandidateRejected(
  asset: BrainDiscoveredBrandAsset,
  rejected: string[],
  boardMeta?: BrandKitBoardMeta,
): boolean {
  const key = logoCandidateElementKey(asset.id);
  const metaStatus = boardMeta?.interpretation[key]?.status;
  if (metaStatus === "rejected") return true;
  if (asset.logoPHash && isPhashNearRejected(asset.logoPHash, rejected)) return true;
  const url = asset.imageUrl?.trim() || asset.value?.trim();
  return isLogoSignatureRejected(url, rejected);
}

export function listLogoCandidates(
  assets: ProjectAssetsMetadata,
  boardMeta?: BrandKitBoardMeta,
): LogoCandidateView[] {
  const rejected = assets.brainMeta?.rejectedLogoSignatures ?? [];
  const signatureBonus = assets.brand.logoSignature?.trim() ?? "";
  const seen = new Set<string>();
  const out: LogoCandidateView[] = [];

  const scoreForAsset = (asset: BrainDiscoveredBrandAsset): number => {
    const base = asset.clusterScore ?? asset.confidence ?? 0;
    if (
      signatureBonus &&
      asset.logoPHash &&
      phashHammingDistance(signatureBonus, asset.logoPHash) <= LOGO_PHASH_MATCH_THRESHOLD
    ) {
      return base + 0.15;
    }
    return base;
  };

  const push = (asset: BrainDiscoveredBrandAsset) => {
    const url = asset.imageUrl?.trim() || asset.value?.trim();
    if (!url || seen.has(url)) return;
    if (isCandidateRejected(asset, rejected, boardMeta)) return;
    seen.add(url);
    out.push({
      id: asset.id,
      elementKey: logoCandidateElementKey(asset.id),
      url,
      label: asset.label || "Logo detectado",
      contextLine: candidateContextLine(asset),
      pageCount: asset.pageCount ?? 1,
      documentCount: asset.documentCount ?? 1,
      score: scoreForAsset(asset),
      rejected: false,
      phash: asset.logoPHash,
    });
  };

  for (const asset of collectDiscoveredLogos(assets)) push(asset);

  const primaryUrl = assets.brand.logoPositive?.trim() ?? "";
  if (primaryUrl && !seen.has(primaryUrl) && !isLogoSignatureRejected(primaryUrl, rejected)) {
    out.unshift({
      id: "logo-primary-current",
      elementKey: "logo.primary",
      url: primaryUrl,
      label: "Logo actual",
      contextLine: "propuesto en el Board",
      pageCount: 0,
      documentCount: 0,
      score: 1,
      rejected: false,
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

export function countDistinctLogoClusters(candidates: LogoCandidateView[]): number {
  const phashes = new Set(candidates.map((c) => c.phash).filter((p): p is string => Boolean(p)));
  if (phashes.size >= 2) return phashes.size;
  const nonPrimary = candidates.filter((c) => c.elementKey !== "logo.primary");
  return nonPrimary.length >= 2 ? nonPrimary.length : candidates.length;
}

export function shouldPromptLogoPicker(
  assets: ProjectAssetsMetadata,
  boardMeta?: BrandKitBoardMeta,
): boolean {
  const meta = boardMeta ?? assets.brainMeta?.boardMeta;
  if (!meta) return false;
  const primary = meta.interpretation?.["logo.primary"];
  if (primary?.status === "validated") return false;
  const candidates = listLogoCandidates(assets, meta);
  return countDistinctLogoClusters(candidates) >= 2;
}
