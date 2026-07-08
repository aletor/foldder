import crypto from "crypto";
import type { BrainDiscoveredBrandAsset } from "@/app/spaces/project-assets-metadata";
import { renderPdfPages } from "@/lib/brain/pdf-page-render";
import {
  clusterAllRegionSamples,
  collectRegionSamples,
  computeLogoPHash,
  detectLogosFromPdfBuffer,
  harvestPrimaryLogoFromCluster,
  scoreLogoCluster,
} from "@/lib/brain/pdf-logo-pipeline";

export {
  LOGO_PHASH_MATCH_THRESHOLD,
  phashHammingDistance,
  isPhashNearRejected,
} from "@/lib/brandkit/logo-phash";

export type PdfLogoClusterDraft = {
  clusterId: string;
  phash: string;
  pageCount: number;
  score: number;
  buffer: Buffer;
  mime: "image/png";
  pageNumber: number;
  variant: "positive" | "negative";
};

export function clusterIdFromPhash(phash: string): string {
  return `cluster_${crypto.createHash("sha256").update(phash).digest("hex").slice(0, 12)}`;
}

export async function detectAllLogoClusterDrafts(
  buffer: Buffer,
  options?: { maxPages?: number },
): Promise<{ pageCount: number; clusters: PdfLogoClusterDraft[] }> {
  const pages = await renderPdfPages(buffer, { maxPages: options?.maxPages });
  if (pages.length === 0) return { pageCount: 0, clusters: [] };

  const samples = await collectRegionSamples(pages);
  const grouped = clusterAllRegionSamples(samples, pages.length);
  const clusters: PdfLogoClusterDraft[] = [];

  for (const cluster of grouped) {
    const harvested = await harvestPrimaryLogoFromCluster(pages, buffer, cluster);
    if (!harvested) continue;
    const phash = await computeLogoPHash(harvested.buffer);
    clusters.push({
      clusterId: clusterIdFromPhash(phash),
      phash,
      pageCount: new Set(cluster.map((s) => s.pageNumber)).size,
      score: scoreLogoCluster(cluster, pages.length),
      buffer: harvested.buffer,
      mime: "image/png",
      pageNumber: harvested.pageNumber,
      variant: harvested.variant,
    });
  }

  clusters.sort((a, b) => b.score - a.score);
  return { pageCount: pages.length, clusters };
}

/** Incluye clusters del picker y el par positive/negative del pipeline L2–L3. */
export async function detectLogoClustersForBrandKit(
  buffer: Buffer,
  options?: { maxPages?: number },
): Promise<{ pageCount: number; clusters: PdfLogoClusterDraft[] }> {
  const { pageCount, clusters } = await detectAllLogoClusterDrafts(buffer, options);
  const seenPhash = new Set(clusters.map((c) => c.phash));

  const logoPass = await detectLogosFromPdfBuffer(buffer, options);
  for (const logo of logoPass.logos) {
    const phash = logo.logoPHash ?? (await computeLogoPHash(logo.buffer));
    if (seenPhash.has(phash)) continue;
    seenPhash.add(phash);
    clusters.push({
      clusterId: clusterIdFromPhash(phash),
      phash,
      pageCount: 1,
      score: logo.confidence,
      buffer: logo.buffer,
      mime: logo.mime,
      pageNumber: logo.pageNumber,
      variant: logo.variant,
    });
  }

  clusters.sort((a, b) => b.score - a.score);
  return { pageCount, clusters };
}

export function buildDiscoveredLogoAssetFromCluster(input: {
  cluster: PdfLogoClusterDraft;
  imageRef: string;
  documentId: string;
  documentName: string;
  documentCount?: number;
}): BrainDiscoveredBrandAsset {
  const pages = input.cluster.pageCount;
  const docs = input.documentCount ?? 1;
  return {
    id: input.cluster.clusterId,
    kind: "logo",
    label: `Logo · ${pages} pág.`,
    value: input.imageRef,
    imageUrl: input.imageRef,
    sourceDocumentId: input.documentId,
    sourceName: input.documentName,
    confidence: input.cluster.score,
    discoveredAt: new Date().toISOString(),
    logoPHash: input.cluster.phash,
    pageCount: pages,
    documentCount: docs,
    sourceDocumentIds: [input.documentId],
    clusterScore: input.cluster.score,
    polarity: input.cluster.variant,
  };
}
