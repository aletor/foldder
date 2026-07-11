/**
 * Pipeline BrandKit de detección de logo: cosecha → brandBehaviorScore → ranking.
 * Las métricas visuales solo desempatan.
 */

import {
  clusterAllRegionSamples,
  collectRegionSamples,
  computeLogoPHash,
  harvestPrimaryLogoFromCluster,
  synthesizeLogoPolarityVariant,
} from "@/lib/brain/pdf-logo-pipeline";
import { renderPdfPages } from "@/lib/brain/pdf-page-render";
import {
  buildBrandCorpusFromGenome,
  passesBrandBehaviorPreFilter,
  scoreBrandBehavior,
  BRAND_BEHAVIOR_DISCARD,
  type BrandBehaviorScore,
  type BrandCorpusContext,
} from "./brand-behavior";
import { detectEmbeddedRasterLogos } from "./pdf-embedded-logo";
import { harvestLogoFromVisionHint } from "./logo-vision-harvest";
import type { BrandKitVisionLogoHint } from "../ingest/pdf-vision-types";
import { logLogoIsolationPath } from "../ingest/brand-kit-vision-debug";
import { measureLogoNess, visualTiebreakScore } from "./logo-ness";
import { splitRasterLogoByComponents } from "./logo-component-split";
import { finalizeLogoHarvestRanking } from "./logo-ranking";
import type { RawBrandKitLogoHarvest, ScoredBrandKitLogoHarvest } from "./logo-harvest-types";

export type { BrandCorpusContext, BrandBehaviorScore } from "./brand-behavior";
export type { RawBrandKitLogoHarvest } from "./logo-harvest-types";
export { buildBrandCorpusFromGenome } from "./brand-behavior";

export type DetectBrandKitLogosOptions = {
  maxPages?: number;
  paletteDarkHex?: string;
  documentId?: string;
  corpus?: BrandCorpusContext;
  /** Logo del emisor localizado por el pase de visión unificado. */
  visionEmitter?: BrandKitVisionLogoHint;
};

async function appendPolarityVariant(
  entry: ScoredBrandKitLogoHarvest,
  paletteDarkHex?: string,
): Promise<ScoredBrandKitLogoHarvest[]> {
  const opposite = entry.variant === "positive" ? "negative" : "positive";
  const synthesized = await synthesizeLogoPolarityVariant(entry.buffer, opposite, paletteDarkHex);
  return [
    entry,
    {
      ...entry,
      variant: opposite,
      buffer: synthesized,
      confidence: entry.confidence * 0.88,
      evidenceDetail: `${entry.evidenceDetail ?? ""} · sintetizado`.trim(),
      isolationMethod: entry.isolationMethod ?? "keying",
    },
  ];
}

async function scoredEntriesFromBuffer(input: {
  buffer: Buffer;
  variant: "positive" | "negative";
  confidence: number;
  pageNumber: number;
  sourceBbox?: import("@/lib/brain/pdf-page-render").PixelBBox;
  isolationMethod: "keying" | "birefnet";
  cluster: Parameters<typeof scoreBrandBehavior>[0];
  pages: Parameters<typeof scoreBrandBehavior>[1];
  documentId: string;
  corpus?: BrandCorpusContext;
  paletteDarkHex?: string;
}): Promise<ScoredBrandKitLogoHarvest[]> {
  const split = await splitRasterLogoByComponents(input.buffer);
  const out: ScoredBrandKitLogoHarvest[] = [];

  for (const buffer of split.buffers) {
    const logoPHash = await computeLogoPHash(buffer);
    const brandBehavior = scoreBrandBehavior(
      input.cluster,
      input.pages,
      logoPHash,
      input.documentId,
      input.corpus,
    );
    if (brandBehavior.total < BRAND_BEHAVIOR_DISCARD) continue;

    const logoNess = await measureLogoNess(buffer);
    const visualTiebreak = visualTiebreakScore(logoNess);
    const detail = split.split
      ? `${formatEvidenceDetail(brandBehavior)} · componente atómico`
      : formatEvidenceDetail(brandBehavior);

    const base: ScoredBrandKitLogoHarvest = {
      buffer,
      variant: input.variant,
      confidence: input.confidence,
      pageNumber: input.pageNumber,
      sourceBbox: input.sourceBbox,
      evidenceDetail: detail,
      brandBehavior,
      visualTiebreak,
      logoNess,
      logoPHash,
      isolationMethod: input.isolationMethod,
    };

    out.push(...(await appendPolarityVariant(base, input.paletteDarkHex)));
  }

  return out;
}

function mergeHarvestEntries(entries: ScoredBrandKitLogoHarvest[]): ScoredBrandKitLogoHarvest[] {
  const byKey = new Map<string, ScoredBrandKitLogoHarvest>();
  for (const entry of entries) {
    const key = `${entry.logoPHash}:${entry.variant}`;
    const prev = byKey.get(key);
    if (!prev || entry.brandBehavior.total > prev.brandBehavior.total) {
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()];
}

export async function detectBrandKitLogosFromPdfBuffer(
  buffer: Buffer,
  options?: DetectBrandKitLogosOptions,
): Promise<{ pageCount: number; logos: RawBrandKitLogoHarvest[]; ambiguousPrimary: boolean }> {
  const pages = await renderPdfPages(buffer, {
    maxPages: options?.maxPages ?? 20,
  });
  if (pages.length === 0) return { pageCount: 0, logos: [], ambiguousPrimary: false };

  const documentId = options?.documentId ?? "document";
  const corpus = options?.corpus;
  const scored: ScoredBrandKitLogoHarvest[] = [];

  if (options?.visionEmitter) {
    scored.push(...(await harvestLogoFromVisionHint(pages, buffer, options.visionEmitter, {
      paletteDarkHex: options.paletteDarkHex,
    })));
  } else {
    logLogoIsolationPath("deterministic-fallback");
  }

  const samples = await collectRegionSamples(pages);
  const clusters = clusterAllRegionSamples(samples, pages.length);

  for (const cluster of clusters) {
    if (!passesBrandBehaviorPreFilter(cluster, pages)) continue;

    const harvested = await harvestPrimaryLogoFromCluster(pages, buffer, cluster, {
      allowPaidMatting: false,
    });
    if (!harvested) continue;

    scored.push(
      ...(await scoredEntriesFromBuffer({
        buffer: harvested.buffer,
        variant: harvested.variant,
        confidence: harvested.confidence,
        pageNumber: harvested.pageNumber,
        sourceBbox: harvested.bbox,
        isolationMethod: harvested.isolationMethod,
        cluster,
        pages,
        documentId,
        corpus,
        paletteDarkHex: options?.paletteDarkHex,
      })),
    );
  }

  const embedded = await detectEmbeddedRasterLogos(buffer, pages, {
    maxPages: options?.maxPages,
    documentId,
    corpus,
    paletteDarkHex: options?.paletteDarkHex,
  });
  scored.push(...embedded);

  const merged = mergeHarvestEntries(scored);
  const { logos, ambiguousPrimary } = finalizeLogoHarvestRanking(merged);

  return { pageCount: pages.length, logos, ambiguousPrimary };
}

function formatEvidenceDetail(behavior: BrandBehaviorScore): string {
  const pct = (v: number) => Math.round(v * 100);
  return (
    `marca ${pct(behavior.total)}% · inv ${pct(behavior.invariance)} · pos ${pct(behavior.structuralPosition)} · ` +
    `xdoc ${pct(behavior.interDocument)} · escala ${pct(behavior.scaleSubordination)}`
  );
}
