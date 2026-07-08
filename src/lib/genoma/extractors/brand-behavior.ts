/**
 * Modelo de comportamiento de marca: qué se comporta como una marca en el corpus,
 * no qué parece un logo visualmente. Las métricas visuales (logo-ness) solo desempatan.
 */

import {
  jaccardSimilarity,
  regionPositionPrior,
  type LogoRegionKind,
} from "@/lib/brain/pdf-logo-pipeline";
import { hammingDistanceBits } from "@/lib/brain/pdf-logo-pipeline";
import type { RenderedPdfPage } from "@/lib/brain/pdf-page-render";
import type { PixelBBox } from "@/lib/brain/pdf-page-render";
import { signaturesMatch } from "@/lib/genoma/model/signature";
import type { Genome } from "@/lib/genoma/model/trait";
import { getTrait } from "@/lib/genoma/model/trait";

export const PHASH_IDENTICAL_MAX_BITS = 8;
export const BRAND_BEHAVIOR_DISCARD = 0.38;
export const BRAND_BEHAVIOR_PRIMARY = 0.52;
export const BRAND_BEHAVIOR_SECONDARY = 0.38;

/** Área candidato / área página: marca típica 0,3–8 %. */
export const BRAND_SCALE_IDEAL_MIN = 0.003;
export const BRAND_SCALE_IDEAL_MAX = 0.08;
export const BRAND_SCALE_HARD_MAX = 0.15;

export const BRAND_BEHAVIOR_WEIGHTS = {
  invariance: 0.35,
  structuralPosition: 0.2,
  interDocument: 0.3,
  scaleSubordination: 0.15,
} as const;

export type RegionSampleLike = {
  pageNumber: number;
  region: LogoRegionKind;
  bbox: PixelBBox;
  signature: Uint8Array;
  inkRatio: number;
};

export type BrandBehaviorSignals = {
  invariance: number;
  structuralPosition: number;
  interDocument: number;
  scaleSubordination: number;
};

export type BrandBehaviorScore = BrandBehaviorSignals & {
  total: number;
};

export type BrandCorpusContext = {
  documentIds: Set<string>;
  signaturesByDocument: Map<string, string[]>;
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function coefficientOfVariation(values: number[]): number {
  if (values.length <= 1) return 0;
  const m = mean(values);
  if (m <= 0) return 0;
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance) / m;
}

function pageByNumber(pages: RenderedPdfPage[]): Map<number, RenderedPdfPage> {
  return new Map(pages.map((p) => [p.pageNumber, p]));
}

/** 1 · Invarianza: misma firma, mismo tamaño relativo, muchas apariciones idénticas. */
export function scoreInvariance(
  cluster: RegionSampleLike[],
  pages: RenderedPdfPage[],
): number {
  if (cluster.length === 0) return 0;
  const pageMap = pageByNumber(pages);

  const relWidths: number[] = [];
  const relHeights: number[] = [];
  for (const sample of cluster) {
    const page = pageMap.get(sample.pageNumber);
    const pw = page?.width ?? 1;
    const ph = page?.height ?? 1;
    relWidths.push(sample.bbox.width / pw);
    relHeights.push(sample.bbox.height / ph);
  }
  const sizeStability = 1 - clamp01((coefficientOfVariation(relWidths) + coefficientOfVariation(relHeights)) / 2);

  let pairs = 0;
  let jaccardSum = 0;
  for (let i = 0; i < cluster.length; i += 1) {
    for (let j = i + 1; j < cluster.length; j += 1) {
      pairs += 1;
      jaccardSum += jaccardSimilarity(cluster[i].signature, cluster[j].signature);
    }
  }
  const signatureIdentity = pairs ? jaccardSum / pairs : 1;

  const pagesHit = new Set(cluster.map((s) => s.pageNumber)).size;
  const recurrence = pagesHit / Math.max(1, pages.length);

  if (pagesHit < 2) {
    return clamp01(recurrence * 0.35);
  }

  return clamp01(signatureIdentity * 0.45 + sizeStability * 0.35 + recurrence * 0.2);
}

/** 2 · Posición estructural: cromo del documento + baja varianza de coordenadas. */
export function scoreStructuralPosition(
  cluster: RegionSampleLike[],
  pages: RenderedPdfPage[],
): number {
  if (cluster.length === 0) return 0;
  const pageMap = pageByNumber(pages);

  const zoneScore =
    cluster.reduce((sum, s) => sum + regionPositionPrior(s.region), 0) / cluster.length;

  const centers: Array<{ nx: number; ny: number }> = [];
  for (const sample of cluster) {
    const page = pageMap.get(sample.pageNumber);
    const pw = page?.width ?? 1;
    const ph = page?.height ?? 1;
    centers.push({
      nx: (sample.bbox.x + sample.bbox.width / 2) / pw,
      ny: (sample.bbox.y + sample.bbox.height / 2) / ph,
    });
  }
  const nx = centers.map((c) => c.nx);
  const ny = centers.map((c) => c.ny);
  const positionSpread = Math.sqrt(coefficientOfVariation(nx) ** 2 + coefficientOfVariation(ny) ** 2);
  const positionStability = 1 - clamp01(positionSpread * 3);

  return clamp01(zoneScore * 0.55 + positionStability * 0.45);
}

/** 3 · Persistencia inter-documento: la firma cruza documentos del corpus. */
export function scoreInterDocumentPersistence(
  logoPHash: string,
  documentId: string,
  corpus: BrandCorpusContext | undefined,
): number {
  if (!corpus || corpus.documentIds.size === 0) return 1;

  const allDocIds = new Set(corpus.documentIds);
  allDocIds.add(documentId);
  const totalDocs = allDocIds.size;

  let docsWithMatch = 0;
  for (const docId of allDocIds) {
    if (docId === documentId) {
      docsWithMatch += 1;
      continue;
    }
    const sigs = corpus.signaturesByDocument.get(docId) ?? [];
    if (sigs.some((sig) => phashMatches(sig, logoPHash))) docsWithMatch += 1;
  }
  return docsWithMatch / Math.max(1, totalDocs);
}

export function phashMatches(a: string, b: string, maxBits = PHASH_IDENTICAL_MAX_BITS): boolean {
  if (a === b) return true;
  if (/^[01]+$/.test(a) && /^[01]+$/.test(b)) {
    return hammingDistanceBits(a, b) <= maxBits;
  }
  return signaturesMatch(a, b, maxBits);
}

/** 4 · Subordinación de escala: pequeño respecto a la página (marca, no contenido). */
export function scoreScaleSubordination(
  cluster: RegionSampleLike[],
  pages: RenderedPdfPage[],
): number {
  if (cluster.length === 0) return 0;
  const pageMap = pageByNumber(pages);

  const areaRatios = cluster.map((sample) => {
    const page = pageMap.get(sample.pageNumber);
    const pageArea = Math.max(1, (page?.width ?? 1) * (page?.height ?? 1));
    return (sample.bbox.width * sample.bbox.height) / pageArea;
  });
  const avg = mean(areaRatios);

  if (avg > BRAND_SCALE_HARD_MAX) return 0;
  if (avg >= BRAND_SCALE_IDEAL_MIN && avg <= BRAND_SCALE_IDEAL_MAX) return 1;
  if (avg < BRAND_SCALE_IDEAL_MIN) {
    return clamp01(avg / BRAND_SCALE_IDEAL_MIN);
  }
  return clamp01(1 - (avg - BRAND_SCALE_IDEAL_MAX) / (BRAND_SCALE_HARD_MAX - BRAND_SCALE_IDEAL_MAX));
}

export function computeBrandBehaviorScore(
  signals: BrandBehaviorSignals,
): number {
  const w = BRAND_BEHAVIOR_WEIGHTS;
  if (signals.scaleSubordination <= 0) {
    return clamp01(Math.min(BRAND_BEHAVIOR_DISCARD - 0.05, w.structuralPosition * signals.structuralPosition * 0.5));
  }
  let total =
    w.invariance * signals.invariance +
    w.structuralPosition * signals.structuralPosition +
    w.interDocument * signals.interDocument +
    w.scaleSubordination * signals.scaleSubordination;
  if (signals.scaleSubordination < 0.35) {
    total *= signals.scaleSubordination / 0.35;
  }
  return clamp01(total);
}

export function scoreBrandBehavior(
  cluster: RegionSampleLike[],
  pages: RenderedPdfPage[],
  logoPHash: string,
  documentId: string,
  corpus?: BrandCorpusContext,
): BrandBehaviorScore {
  const signals: BrandBehaviorSignals = {
    invariance: scoreInvariance(cluster, pages),
    structuralPosition: scoreStructuralPosition(cluster, pages),
    interDocument: scoreInterDocumentPersistence(logoPHash, documentId, corpus),
    scaleSubordination: scoreScaleSubordination(cluster, pages),
  };
  return { ...signals, total: computeBrandBehaviorScore(signals) };
}

/** Pre-filtro barato (sin pHash): descarta lo que claramente no se comporta como marca. */
export function passesBrandBehaviorPreFilter(
  cluster: RegionSampleLike[],
  pages: RenderedPdfPage[],
): boolean {
  const partial = computeBrandBehaviorScore({
    invariance: scoreInvariance(cluster, pages),
    structuralPosition: scoreStructuralPosition(cluster, pages),
    interDocument: 1,
    scaleSubordination: scoreScaleSubordination(cluster, pages),
  });
  return partial >= BRAND_BEHAVIOR_DISCARD * 0.85;
}

export function classifyBrandBehaviorSlot(
  score: number,
  rank: number,
  signals?: Pick<BrandBehaviorSignals, "invariance">,
): "primary" | "secondary" | "discard" {
  if (score < BRAND_BEHAVIOR_SECONDARY) return "discard";
  if (rank === 0 && score >= BRAND_BEHAVIOR_PRIMARY && (signals?.invariance ?? 0) >= 0.45) {
    return "primary";
  }
  if (score >= BRAND_BEHAVIOR_SECONDARY) return "secondary";
  return "discard";
}

/** Construye contexto de corpus desde firmas de logo ya ingeridas. */
export function buildBrandCorpusFromGenome(genome: Genome): BrandCorpusContext {
  const documentIds = new Set(genome.sources.map((s) => s.id));
  const signaturesByDocument = new Map<string, string[]>();

  for (const traitId of ["logo.primary", "logo.secondary"] as const) {
    const trait = getTrait(genome, traitId);
    if (!trait) continue;
    for (const candidate of trait.candidates) {
      if (candidate.status === "archived") continue;
      for (const srcId of candidate.sourceRefs) {
        const prev = signaturesByDocument.get(srcId) ?? [];
        if (!prev.includes(candidate.signature)) {
          signaturesByDocument.set(srcId, [...prev, candidate.signature]);
        }
      }
    }
  }

  return { documentIds, signaturesByDocument };
}

export function compareBrandCandidates(
  a: { brandBehavior: BrandBehaviorScore; visualTiebreak: number },
  b: { brandBehavior: BrandBehaviorScore; visualTiebreak: number },
): number {
  const scoreDiff = b.brandBehavior.total - a.brandBehavior.total;
  if (Math.abs(scoreDiff) > 0.02) return scoreDiff;
  return b.visualTiebreak - a.visualTiebreak;
}
