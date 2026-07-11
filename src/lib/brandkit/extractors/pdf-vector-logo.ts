/**
 * Extracción de SVG embebidos en PDF — atajo de vector en el corpus (paso 1).
 * Escanea streams comprimidos y texto plano; no rasteriza.
 */

import crypto from "crypto";
import zlib from "zlib";
import { isLogoFilename } from "./logo-ness";

export type EmbeddedPdfSvg = {
  svg: string;
  contentSha256: string;
  label: string;
  occurrenceCount: number;
};

const SVG_FRAGMENT_RE = /<svg[\s\S]*?<\/svg>/gi;

function pdfStreamStartOffset(buffer: Buffer, streamTokenEnd: number): number {
  if (buffer[streamTokenEnd] === 0x0d && buffer[streamTokenEnd + 1] === 0x0a) return streamTokenEnd + 2;
  if (buffer[streamTokenEnd] === 0x0a || buffer[streamTokenEnd] === 0x0d) return streamTokenEnd + 1;
  return streamTokenEnd;
}

function pdfStreamEndOffset(buffer: Buffer, endstreamStart: number): number {
  if (endstreamStart >= 2 && buffer[endstreamStart - 2] === 0x0d && buffer[endstreamStart - 1] === 0x0a) {
    return endstreamStart - 2;
  }
  if (endstreamStart >= 1 && (buffer[endstreamStart - 1] === 0x0a || buffer[endstreamStart - 1] === 0x0d)) {
    return endstreamStart - 1;
  }
  return endstreamStart;
}

function viewBoxArea(svg: string): number | null {
  const viewBox = svg.match(/viewBox=["']([^"']+)["']/i)?.[1];
  if (!viewBox) return null;
  const parts = viewBox.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return Math.abs(parts[2] * parts[3]);
}

export function isPlausibleBrandSvg(svg: string): boolean {
  const trimmed = svg.trim();
  if (!/^<svg[\s>]/i.test(trimmed)) return false;
  if (trimmed.length < 32 || trimmed.length > 600_000) return false;
  const area = viewBoxArea(trimmed);
  if (area != null && area > 400_000) return false;
  return true;
}

function collectSvgFragments(text: string): string[] {
  const matches = text.match(SVG_FRAGMENT_RE) ?? [];
  return matches.map((m) => m.trim()).filter(isPlausibleBrandSvg);
}

function registerSvg(bucket: Map<string, EmbeddedPdfSvg>, svg: string, label: string): void {
  const contentSha256 = crypto.createHash("sha256").update(svg).digest("hex");
  const existing = bucket.get(contentSha256);
  if (existing) {
    existing.occurrenceCount += 1;
    return;
  }
  bucket.set(contentSha256, { svg, contentSha256, label, occurrenceCount: 1 });
}

function scanTextForSvgs(text: string, label: string, bucket: Map<string, EmbeddedPdfSvg>): void {
  for (const svg of collectSvgFragments(text)) {
    registerSvg(bucket, svg, label);
  }
}

/** Escanea un buffer PDF en busca de fragmentos `<svg>…</svg>`. */
export function extractEmbeddedSvgsFromPdfBuffer(
  buffer: Buffer,
  fileName = "document.pdf",
): EmbeddedPdfSvg[] {
  const bucket = new Map<string, EmbeddedPdfSvg>();
  const ascii = buffer.toString("latin1");
  scanTextForSvgs(ascii, fileName, bucket);

  const re = /(\d+)\s+(\d+)\s+obj([\s\S]*?)\bstream\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(ascii))) {
    const dict = match[3] ?? "";
    const streamTokenEnd = match.index + match[0].length;
    const endstream = ascii.indexOf("endstream", streamTokenEnd);
    if (endstream < 0) break;
    const start = pdfStreamStartOffset(buffer, streamTokenEnd);
    const end = pdfStreamEndOffset(buffer, endstream);
    if (end <= start) continue;

    const stream = buffer.subarray(start, end);
    const label = `${fileName}#obj${match[1]}`;

    scanTextForSvgs(stream.toString("utf8"), label, bucket);
    scanTextForSvgs(stream.toString("latin1"), label, bucket);

    if (/\/Filter\s*(?:\[)?\s*\/FlateDecode\b/.test(dict)) {
      try {
        const inflated = zlib.inflateSync(stream);
        scanTextForSvgs(inflated.toString("utf8"), label, bucket);
      } catch {
        /* stream no inflable */
      }
    }

    re.lastIndex = endstream + "endstream".length;
  }

  return [...bucket.values()].sort(
    (a, b) => scoreEmbeddedSvg(b, fileName) - scoreEmbeddedSvg(a, fileName),
  );
}

export function scoreEmbeddedSvg(svg: EmbeddedPdfSvg, fileName: string): number {
  let score = svg.occurrenceCount * 12;
  if (isLogoFilename(svg.label) || isLogoFilename(fileName)) score += 24;

  const area = viewBoxArea(svg.svg);
  if (area != null) {
    if (area >= 80 && area <= 40_000) score += 18;
    else if (area > 120_000) score -= 40;
  }

  if (/logo|logotipo|marca|brand|isotipo|icon/i.test(svg.svg.slice(0, 400))) score += 8;
  return score;
}

export function selectCorpusVectorLogo(
  svgs: EmbeddedPdfSvg[],
  fileName: string,
): EmbeddedPdfSvg | null {
  if (svgs.length === 0) return null;
  const ranked = [...svgs].sort((a, b) => scoreEmbeddedSvg(b, fileName) - scoreEmbeddedSvg(a, fileName));
  const top = ranked[0];
  if (!top || scoreEmbeddedSvg(top, fileName) < 8) return null;
  return top;
}
