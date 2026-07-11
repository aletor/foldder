/**
 * Consolidación de instancias logoInstances (Fase A) → clusters.
 *
 * TODO(Fase-B-post-extracción): la consolidación definitiva debe hacerse sobre el asset
 * nativo extraído (SVG / XObject sin fondo), donde el pHash de tinta sí agrupa.
 * El merge por textInLogo es PROVISIONAL — ver page-vision-pass-apply.test known-limitation.
 */

import { computeInkLogoPHash } from "@/lib/brain/pdf-logo-pipeline";
import { LOGO_PHASH_MATCH_THRESHOLD, phashHammingDistance } from "@/lib/brandkit/logo-phash";
import type { PageVisionLogoInstance } from "./page-vision-pass-schema";

export type HarvestedLogo = {
  pageNumber: number;
  instance: PageVisionLogoInstance;
  buffer: Buffer;
  logoPHash: string;
};

export type LogoCluster = {
  phash: string;
  members: HarvestedLogo[];
  pageNumbers: Set<number>;
};

/** PROVISIONAL — muleta semántica; no sustituye pHash sobre asset nativo sin fondo. */
export function logoInstancesMatch(a: PageVisionLogoInstance, b: PageVisionLogoInstance): boolean {
  const textA = a.textInLogo?.trim().toUpperCase();
  const textB = b.textInLogo?.trim().toUpperCase();
  if (!textA || !textB || textA === "UNKNOWN" || textB === "UNKNOWN") return false;
  return textA === textB && a.variant === b.variant;
}

export function clusterHarvestedLogos(harvested: HarvestedLogo[]): LogoCluster[] {
  const clusters: LogoCluster[] = [];
  for (const item of harvested) {
    let cluster = clusters.find((c) => {
      if (phashHammingDistance(c.phash, item.logoPHash) <= LOGO_PHASH_MATCH_THRESHOLD) return true;
      return c.members.some((member) => logoInstancesMatch(member.instance, item.instance));
    });
    if (!cluster) {
      cluster = { phash: item.logoPHash, members: [], pageNumbers: new Set() };
      clusters.push(cluster);
    }
    cluster.members.push(item);
    cluster.pageNumbers.add(item.pageNumber);
  }
  return clusters;
}

/** Fase B — re-agrupa clusters cuyo asset nativo comparte pHash de tinta. */
export function mergeClustersByNativeAsset(
  clusters: LogoCluster[],
  nativeByClusterPhash: Map<string, { logoPHash: string }>,
): LogoCluster[] {
  const merged: LogoCluster[] = [];
  for (const cluster of clusters) {
    const native = nativeByClusterPhash.get(cluster.phash);
    const nativePhash = native?.logoPHash;
    let target = merged.find((m) => {
      if (!nativePhash) return false;
      const mNative = nativeByClusterPhash.get(m.phash);
      if (!mNative?.logoPHash) return false;
      return phashHammingDistance(mNative.logoPHash, nativePhash) <= LOGO_PHASH_MATCH_THRESHOLD;
    });
    if (!target) {
      target = { phash: nativePhash ?? cluster.phash, members: [], pageNumbers: new Set() };
      merged.push(target);
    }
    for (const member of cluster.members) {
      target.members.push(member);
      target.pageNumbers.add(member.pageNumber);
    }
  }
  return merged;
}

export async function harvestLogoPHash(buffer: Buffer): Promise<string> {
  return computeInkLogoPHash(buffer);
}
