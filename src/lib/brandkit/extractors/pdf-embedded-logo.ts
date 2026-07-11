/**
 * Cosecha logos raster embebidos (XObject) — complemento a regiones renderizadas (A1).
 */

import sharp from "sharp";
import {
  extractEmbeddedRasterImagesFromPdf,
  type PdfEmbeddedRasterImage,
} from "@/lib/brain/pdf-visual-extract";
import {
  computeLogoPHash,
  hammingDistanceBits,
  synthesizeLogoPolarityVariant,
} from "@/lib/brain/pdf-logo-pipeline";
import type { RenderedPdfPage } from "@/lib/brain/pdf-page-render";
import type { LogoRegionKind } from "@/lib/brain/pdf-logo-pipeline";
import {
  BRAND_BEHAVIOR_DISCARD,
  computeBrandBehaviorScore,
  scoreBrandBehavior,
  type BrandBehaviorScore,
  type BrandCorpusContext,
  type RegionSampleLike,
} from "./brand-behavior";
import { measureLogoNess, visualTiebreakScore } from "./logo-ness";
import { splitRasterLogoByComponents } from "./logo-component-split";
import type { ScoredBrandKitLogoHarvest } from "./logo-harvest-types";

const PHASH_CLUSTER_MAX_BITS = 8;

type EmbeddedGroup = {
  images: PdfEmbeddedRasterImage[];
  pageNumbers: number[];
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function buildEmbeddedRegionCluster(
  group: EmbeddedGroup,
  pages: RenderedPdfPage[],
): RegionSampleLike[] {
  const pageByNumber = new Map(pages.map((p) => [p.pageNumber, p]));
  return group.images.map((image) => {
    const page = pageByNumber.get(image.pageNumber);
    const pw = page?.width ?? 1200;
    const ph = page?.height ?? 1600;
    const relW = Math.min(0.22, image.width / pw);
    const relH = Math.min(0.1, image.height / ph);
    return {
      pageNumber: image.pageNumber,
      region: "header" as LogoRegionKind,
      bbox: {
        x: Math.round(pw * 0.03),
        y: Math.round(ph * 0.02),
        width: Math.max(20, Math.round(pw * relW)),
        height: Math.max(10, Math.round(ph * relH)),
      },
      signature: new Uint8Array(96 * 32),
      inkRatio: 0.12,
    };
  });
}

function boostEmbeddedInvariance(
  behavior: BrandBehaviorScore,
  uniquePages: number,
  totalPages: number,
  occurrences: number,
): BrandBehaviorScore {
  const recurrence = uniquePages / Math.max(1, totalPages);
  const invariance = Math.max(
    behavior.invariance,
    clamp01(occurrences >= 3 ? 0.55 + recurrence * 0.35 : recurrence * 0.75),
  );
  const signals = { ...behavior, invariance };
  return { ...signals, total: computeBrandBehaviorScore(signals) };
}

async function groupEmbeddedImages(
  images: PdfEmbeddedRasterImage[],
): Promise<Array<EmbeddedGroup & { phashes: string[] }>> {
  const groups: Array<EmbeddedGroup & { phashes: string[] }> = [];

  for (const image of images) {
    const phash = await computeLogoPHash(
      await sharp(image.buffer).trim({ threshold: 1 }).png().toBuffer(),
    );
    let placed = false;
    for (const group of groups) {
      const ref = group.phashes[0];
      if (!ref) continue;
      if (hammingDistanceBits(phash, ref) > PHASH_CLUSTER_MAX_BITS) continue;
      group.images.push(image);
      group.pageNumbers.push(image.pageNumber);
      group.phashes.push(phash);
      placed = true;
      break;
    }
    if (placed) continue;
    groups.push({ images: [image], pageNumbers: [image.pageNumber], phashes: [phash] });
  }

  return groups;
}

async function pickBestEmbeddedBuffer(group: EmbeddedGroup): Promise<Buffer> {
  const best = [...group.images].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!best) return Buffer.alloc(0);
  return sharp(best.buffer).trim({ threshold: 1 }).png().toBuffer();
}

async function buildEmbeddedHarvestEntries(
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
      isolationMethod: "keying",
    },
  ];
}

export async function detectEmbeddedRasterLogos(
  pdfBuffer: Buffer,
  pages: RenderedPdfPage[],
  options: {
    maxPages?: number;
    documentId?: string;
    corpus?: BrandCorpusContext;
    paletteDarkHex?: string;
  } = {},
): Promise<ScoredBrandKitLogoHarvest[]> {
  const embedded = await extractEmbeddedRasterImagesFromPdf(pdfBuffer, {
    maxPages: options.maxPages ?? pages.length,
  });
  if (embedded.length === 0) return [];

  const groups = await groupEmbeddedImages(embedded);
  const out: ScoredBrandKitLogoHarvest[] = [];
  const documentId = options.documentId ?? "document";

  for (const group of groups) {
    const uniquePages = new Set(group.pageNumbers).size;
    if (uniquePages < 2 && group.images.length < 2) continue;

    const buffer = await pickBestEmbeddedBuffer(group);
    if (buffer.length === 0) continue;

    const split = await splitRasterLogoByComponents(buffer);
    for (const partBuffer of split.buffers) {
      const logoNess = await measureLogoNess(partBuffer);
      if (logoNess.containsFace || logoNess.simpleSolidShape) continue;

      const logoPHash = await computeLogoPHash(partBuffer);
      const cluster = buildEmbeddedRegionCluster(group, pages);
      let brandBehavior = scoreBrandBehavior(cluster, pages, logoPHash, documentId, options.corpus);
      brandBehavior = boostEmbeddedInvariance(
        brandBehavior,
        uniquePages,
        pages.length,
        group.images.length,
      );
      if (brandBehavior.total < BRAND_BEHAVIOR_DISCARD) continue;

      const visualTiebreak = visualTiebreakScore(logoNess);
      const pageNumber = group.pageNumbers[0] ?? 1;
      const base: ScoredBrandKitLogoHarvest = {
        buffer: partBuffer,
        variant: "positive",
        confidence: Math.min(0.9, 0.45 + uniquePages / Math.max(1, pages.length) * 0.35),
        pageNumber,
        evidenceDetail: split.split
          ? `embebido · componente atómico · págs ${uniquePages}/${pages.length}`
          : `embebido · págs ${uniquePages}/${pages.length}`,
        brandBehavior,
        visualTiebreak,
        logoNess,
        logoPHash,
        isolationMethod: "keying",
      };

      const withVariants = await buildEmbeddedHarvestEntries(base, options.paletteDarkHex);
      out.push(...withVariants);
    }
  }

  return out;
}
