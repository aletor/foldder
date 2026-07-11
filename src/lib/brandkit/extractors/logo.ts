/**
 * Extractor de logo (§3.2) — capa BrandKit sobre el pipeline de páginas renderizadas.
 *
 * Orden: SVG/vector (ingesta) → cosecha → brandBehaviorScore → desempate visual.
 */

import sharp from "sharp";
import { computeLogoPHash } from "@/lib/brain/pdf-logo-pipeline";
import {
  detectBrandKitLogosFromPdfBuffer,
  type BrandCorpusContext,
} from "./logo-detect";
import type { BrandBehaviorScore } from "./brand-behavior";
import type { LogoNessMetrics } from "./logo-ness";
import type { BrandKitVisionLogoHint } from "../ingest/pdf-vision-types";

export type BrandKitLogoCandidate = {
  buffer: Buffer;
  variant: "positive" | "negative";
  confidence: number;
  pageNumber: number;
  sourceBbox?: import("@/lib/brain/pdf-page-render").PixelBBox;
  logoPHash: string;
  evidenceDetail?: string;
  isolationMethod?: "keying" | "birefnet";
  slot: "primary" | "secondary";
  brandBehavior?: BrandBehaviorScore;
  visualTiebreak?: number;
  logoNess?: LogoNessMetrics;
};

export type BrandKitLogoExtraction = {
  logos: BrandKitLogoCandidate[];
  primaryLogos: BrandKitLogoCandidate[];
  secondaryLogos: BrandKitLogoCandidate[];
  /** Varios candidatos plausibles — no auto-corona; el usuario elige en el picker. */
  ambiguousPrimary: boolean;
};

export type ExtractLogoOptions = {
  maxPages?: number;
  paletteDarkHex?: string;
  documentId?: string;
  corpus?: BrandCorpusContext;
  visionEmitter?: BrandKitVisionLogoHint;
};

async function refineLogoBuffer(buffer: Buffer): Promise<{ buffer: Buffer; logoPHash: string }> {
  const trimmed = await sharp(buffer).trim({ threshold: 1 }).png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w < 20 || h < 10) {
    return { buffer, logoPHash: await computeLogoPHash(buffer) };
  }
  return { buffer: trimmed, logoPHash: await computeLogoPHash(trimmed) };
}

export async function extractLogoFromPdf(
  buffer: Buffer,
  options?: ExtractLogoOptions,
): Promise<BrandKitLogoExtraction> {
  const { logos: raw, ambiguousPrimary } = await detectBrandKitLogosFromPdfBuffer(buffer, options);
  const logos: BrandKitLogoCandidate[] = [];

  for (const entry of raw) {
    const refined = await refineLogoBuffer(entry.buffer);
    if (!refined.logoPHash) continue;
    logos.push({
      buffer: refined.buffer,
      variant: entry.variant,
      confidence: entry.confidence,
      pageNumber: entry.pageNumber,
      sourceBbox: entry.sourceBbox,
      logoPHash: refined.logoPHash,
      evidenceDetail: entry.evidenceDetail,
      slot: entry.slot,
      brandBehavior: entry.brandBehavior,
      visualTiebreak: entry.visualTiebreak,
      logoNess: entry.logoNess,
      isolationMethod: entry.isolationMethod,
    });
  }

  const primaryLogos = logos.filter((l) => l.slot === "primary");
  const secondaryLogos = logos.filter((l) => l.slot === "secondary");
  return { logos, primaryLogos, secondaryLogos, ambiguousPrimary };
}

export { buildBrandCorpusFromGenome } from "./brand-behavior";
