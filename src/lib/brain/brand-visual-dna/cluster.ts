import type { BrandVisualDnaComputedCluster, BrandVisualDnaRawImageAnalysis } from "./types";
import { BRAND_VISUAL_DNA_EMBEDDING_DIM, buildVisualFeatureEmbedding, cosineSimilarity, l2Normalize } from "./embedding";

type LabeledVec = { id: string; vec: number[] };

function vecAdd(a: number[], b: number[]): number[] {
  return a.map((x, i) => x + (b[i] ?? 0));
}

function vecScale(a: number[], s: number): number[] {
  return a.map((x) => x * s);
}

function nearestCentroid(vec: number[], centroids: number[][]): number {
  let best = 0;
  let bestSim = -Infinity;
  for (let k = 0; k < centroids.length; k++) {
    const sim = cosineSimilarity(vec, centroids[k]!);
    if (sim > bestSim) {
      bestSim = sim;
      best = k;
    }
  }
  return best;
}

function meanVec(members: number[][]): number[] {
  if (!members.length) return Array(BRAND_VISUAL_DNA_EMBEDDING_DIM).fill(0);
  const acc = Array(BRAND_VISUAL_DNA_EMBEDDING_DIM).fill(0);
  for (const m of members) {
    for (let i = 0; i < BRAND_VISUAL_DNA_EMBEDDING_DIM; i++) acc[i] += m[i] ?? 0;
  }
  const n = members.length;
  return acc.map((x) => x / n);
}

function clusterCommonTraits(
  members: BrandVisualDnaRawImageAnalysis[],
): string[] {
  if (!members.length) return [];
  const comp = new Map<string, number>();
  const bg = new Map<string, number>();
  const obj = new Map<string, number>();
  for (const m of members) {
    comp.set(m.composition_type, (comp.get(m.composition_type) ?? 0) + 1);
    bg.set(m.background_type, (bg.get(m.background_type) ?? 0) + 1);
    obj.set(m.object_category_hint, (obj.get(m.object_category_hint) ?? 0) + 1);
  }
  const top = (map: Map<string, number>, label: string) => {
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const [k, n] = sorted[0] ?? ["unknown", 0];
    return `${label}:${k}(${n}/${members.length})`;
  };
  return [top(comp, "composición"), top(bg, "fondo"), top(obj, "categoría_hint")];
}

/** K-means cosine en vectores L2-normalizados (rápido y estable para pocos puntos). */
export function clusterImagesByVisualFeatures(
  analyses: BrandVisualDnaRawImageAnalysis[],
  opts: { maxClusters?: number; totalSetCount: number },
): BrandVisualDnaComputedCluster[] {
  const ok = analyses.filter((a) => a.status === "analyzed" || a.status === "fallback_used");
  const n = ok.length;
  const total = Math.max(1, opts.totalSetCount);
  if (n === 0) return [];

  const labeled: LabeledVec[] = ok.map((a) => ({
    id: a.image_id,
    vec: l2Normalize(buildVisualFeatureEmbedding(a)),
  }));

  const kMax = Math.max(1, Math.min(opts.maxClusters ?? 5, n));
  const k = n === 1 ? 1 : Math.min(kMax, Math.max(2, Math.round(Math.sqrt(n))));

  let centroids = labeled.slice(0, k).map((l) => [...l.vec]);
  const assignments = new Array(n).fill(0);

  for (let iter = 0; iter < 24; iter++) {
    for (let i = 0; i < n; i++) {
      assignments[i] = nearestCentroid(labeled[i]!.vec, centroids);
    }
    const buckets: number[][][] = Array.from({ length: k }, () => []);
    for (let i = 0; i < n; i++) {
      buckets[assignments[i]!]!.push(labeled[i]!.vec);
    }
    const next = buckets.map((b) => l2Normalize(meanVec(b)));
    let stable = true;
    for (let c = 0; c < k; c++) {
      if (cosineSimilarity(centroids[c]!, next[c]!) < 0.9995) stable = false;
    }
    centroids = next;
    if (stable) break;
  }

  const memberIds: string[][] = Array.from({ length: k }, () => []);
  for (let i = 0; i < n; i++) {
    memberIds[assignments[i]!]!.push(labeled[i]!.id);
  }

  const clusters: BrandVisualDnaComputedCluster[] = [];
  let idx = 0;
  for (let c = 0; c < k; c++) {
    const ids = memberIds[c]!.filter(Boolean);
    if (!ids.length) continue;
    const members = ok.filter((a) => ids.includes(a.image_id));
    clusters.push({
      cluster_id: `cluster_${idx++}`,
      member_image_ids: ids,
      centroid: centroids[c]!,
      weight_percentage: Math.round((ids.length / total) * 1000) / 10,
      common_traits: clusterCommonTraits(members),
    });
  }
  return clusters;
}

export function nearestClusterIdForVector(
  vec: number[],
  clusters: BrandVisualDnaComputedCluster[],
): string {
  if (!clusters.length) return "cluster_0";
  const nv = l2Normalize(vec);
  let best = clusters[0]!.cluster_id;
  let bestSim = -Infinity;
  for (const c of clusters) {
    const sim = cosineSimilarity(nv, c.centroid);
    if (sim > bestSim) {
      bestSim = sim;
      best = c.cluster_id;
    }
  }
  return best;
}
