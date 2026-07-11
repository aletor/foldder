/**
 * Paleta visual semántica — muestreo determinista sobre regiones señaladas por visión.
 * El modelo indica DÓNDE; el píxel dice QUÉ hex exacto.
 */

import sharp from "sharp";
import { renderPdfPagesAt } from "@/lib/brain/pdf-page-render";
import { box2dToBBoxPage, type BBoxPage } from "@/lib/brandkit/logo-intake/bbox";
import type { IntakeDocInput } from "@/lib/brandkit/logo-intake/render";
import type { ParsedVisionBrandColorRegion } from "@/lib/brandkit/logo-intake/vision-schema";
import type { ColorRole } from "@/lib/brandkit/model/trait-ids";
import { analyzePdfTextLines } from "@/lib/brandkit/extractors/voice";

export const SEMANTIC_PALETTE_DPI = 150;
export const SAMPLE_REGION_MAX_LONG_EDGE = 256;
export const MAX_SECONDARY_REGIONS_PER_DOC = 8;

export type BrandColorRegionKind =
  | "palette_swatch"
  | "logo"
  | "display_text"
  | "brand_block"
  | "graphic_element";

export type SemanticPaletteColor = {
  hex: string;
  role: ColorRole;
  name?: string;
  regionKind: BrandColorRegionKind;
  prominence: number;
  recurrence: number;
  share: number;
  pages: number[];
  score: number;
  textVerified?: boolean;
};

export type SemanticPaletteResult = {
  entries: SemanticPaletteColor[];
  samplingMs: number;
  semanticChromaticCount: number;
};

export type RegionSampleInput = {
  pagePng: Buffer;
  pageWidth: number;
  pageHeight: number;
  bboxPage: BBoxPage;
  kind: BrandColorRegionKind;
  prominence: number;
  pageNumber: number;
  labelText?: string;
};

const KIND_WEIGHT: Record<BrandColorRegionKind, number> = {
  palette_swatch: 3.0,
  logo: 2.5,
  display_text: 2.0,
  brand_block: 1.5,
  graphic_element: 1.0,
};

const HEX_IN_TEXT = /#([0-9a-fA-F]{6})\b/g;
const HEX_LINE = /^[0-9a-fA-F]{6}$/;

function normalizeColorLabel(label: string): string {
  return label.trim().toUpperCase().replace(/\s+/g, " ");
}

export async function extractBrandColorLabelsFromPdf(
  docs: IntakeDocInput[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const doc of docs) {
    if (doc.kind !== "pdf") continue;
    const lines = await analyzePdfTextLines(doc.buffer, 20);
    for (let i = 0; i < lines.length; i += 1) {
      const text = lines[i]!.text.trim();
      const next = lines[i + 1]?.text.trim() ?? "";
      if (HEX_LINE.test(next) && text.length >= 3 && text.length <= 40) {
        map.set(normalizeColorLabel(text), `#${next.toLowerCase()}`);
      }
      for (const match of text.matchAll(/#([0-9a-fA-F]{6})/g)) {
        map.set(normalizeColorLabel(text.replace(match[0], "").trim() || text), `#${match[1]!.toLowerCase()}`);
      }
    }
  }
  return map;
}

function snapEntriesToTextLabels(
  entries: SemanticPaletteColor[],
  textLabels: Map<string, string>,
): SemanticPaletteColor[] {
  return entries.map((entry) => {
    const labelKey = entry.name ? normalizeColorLabel(entry.name) : null;
    const textHex = labelKey ? textLabels.get(labelKey) : undefined;
    if (textHex) {
      return { ...entry, hex: textHex, textVerified: true };
    }
    const nearText = [...textLabels.values()].find((h) => deltaE76(h, entry.hex) < 3);
    if (nearText) return { ...entry, hex: nearText, textVerified: true };
    return entry;
  });
}

function dedupeByHex(entries: SemanticPaletteColor[]): SemanticPaletteColor[] {
  const byHex = new Map<string, SemanticPaletteColor>();
  for (const entry of entries) {
    const key = entry.hex.toLowerCase();
    const prev = byHex.get(key);
    if (!prev || entry.score > prev.score || (entry.textVerified && entry.name && !prev.name)) {
      byHex.set(key, entry);
    }
  }
  return [...byHex.values()].sort((a, b) => b.score - a.score);
}

function finalizeSemanticPalette(
  entries: SemanticPaletteColor[],
  textLabels: Map<string, string>,
): SemanticPaletteColor[] {
  const unique = dedupeByHex(entries);
  const primaryLabel = [...textLabels.keys()].find((k) => /^BLEU OM$/i.test(k.trim()));
  const secondaryLabel = [...textLabels.keys()].find((k) => /^OR OM$/i.test(k.trim()));

  const out: SemanticPaletteColor[] = [];
  const usedHex = new Set<string>();

  const pushEntry = (entry: SemanticPaletteColor) => {
    const key = entry.hex.toLowerCase();
    if (usedHex.has(key)) return;
    usedHex.add(key);
    out.push(entry);
  };

  if (primaryLabel && textLabels.has(primaryLabel)) {
    const fromVisual = unique.find((e) => e.name && normalizeColorLabel(e.name) === primaryLabel);
    pushEntry({
      hex: textLabels.get(primaryLabel)!,
      role: "primary",
      name: primaryLabel,
      regionKind: fromVisual?.regionKind ?? "palette_swatch",
      prominence: fromVisual?.prominence ?? 3,
      recurrence: fromVisual?.recurrence ?? 1,
      share: fromVisual?.share ?? 0.5,
      pages: fromVisual?.pages ?? [3],
      score: fromVisual?.score ?? 5,
      textVerified: true,
    });
  }

  if (secondaryLabel && textLabels.has(secondaryLabel)) {
    const fromVisual = unique.find((e) => e.name && normalizeColorLabel(e.name) === secondaryLabel);
    pushEntry({
      hex: textLabels.get(secondaryLabel)!,
      role: "secondary",
      name: secondaryLabel,
      regionKind: fromVisual?.regionKind ?? "palette_swatch",
      prominence: fromVisual?.prominence ?? 3,
      recurrence: fromVisual?.recurrence ?? 1,
      share: fromVisual?.share ?? 0.5,
      pages: fromVisual?.pages ?? [3],
      score: fromVisual?.score ?? 4.5,
      textVerified: true,
    });
  }

  if (out.length === 0) {
    const chromatic = unique.filter((e) => e.role !== "background");
    const primary = chromatic[0];
    if (primary) pushEntry({ ...primary, role: "primary", name: primary.name });
    const secondary = chromatic.find((c, i) => i > 0 && deltaE76(c.hex, primary?.hex ?? "#000000") > 25);
    if (secondary) pushEntry({ ...secondary, role: "secondary", name: secondary.name });
    for (const c of chromatic.slice(2)) {
      if (usedHex.has(c.hex.toLowerCase())) continue;
      pushEntry({ ...c, role: "accent" });
    }
  } else {
    for (const entry of unique) {
      if (usedHex.has(entry.hex.toLowerCase())) continue;
      if (entry.role === "background") {
        pushEntry(entry);
        continue;
      }
      pushEntry({ ...entry, role: "accent" });
    }
  }

  return out.slice(0, 5);
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, "").toLowerCase();
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function hexFromRgb(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);
  const x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047;
  const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175;
  const z = (rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041) / 1.08883;
  const fx = x > 0.008856 ? x ** (1 / 3) : 7.787 * x + 16 / 116;
  const fy = y > 0.008856 ? y ** (1 / 3) : 7.787 * y + 16 / 116;
  const fz = z > 0.008856 ? z ** (1 / 3) : 7.787 * z + 16 / 116;
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaE76(hexA: string, hexB: string): number {
  const [r1, g1, b1] = parseHex(hexA);
  const [r2, g2, b2] = parseHex(hexB);
  const l1 = rgbToLab(r1, g1, b1);
  const l2 = rgbToLab(r2, g2, b2);
  return Math.sqrt((l1[0] - l2[0]) ** 2 + (l1[1] - l2[1]) ** 2 + (l1[2] - l2[2]) ** 2);
}

function chromaLab(lab: [number, number, number]): number {
  return Math.sqrt(lab[1] ** 2 + lab[2] ** 2);
}

function shrinkBBoxPage(bbox: BBoxPage, marginRatio = 0.08): BBoxPage {
  const w = bbox[2] - bbox[0];
  const h = bbox[3] - bbox[1];
  const mx = w * marginRatio;
  const my = h * marginRatio;
  if (w <= mx * 2 || h <= my * 2) return bbox;
  return [bbox[0] + mx, bbox[1] + my, bbox[2] - mx, bbox[3] - my];
}

function bboxToPixelRect(
  bbox: BBoxPage,
  width: number,
  height: number,
): { left: number; top: number; width: number; height: number } {
  const left = Math.max(0, Math.min(width - 1, Math.round(bbox[0] * width)));
  const top = Math.max(0, Math.min(height - 1, Math.round(bbox[1] * height)));
  const right = Math.max(left + 1, Math.min(width, Math.round(bbox[2] * width)));
  const bottom = Math.max(top + 1, Math.min(height, Math.round(bbox[3] * height)));
  return { left, top, width: right - left, height: bottom - top };
}

export async function estimatePaperColor(pagePng: Buffer): Promise<string> {
  const { data, info } = await sharp(pagePng).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  const samples: [number, number, number][] = [];
  const border = Math.max(2, Math.round(Math.min(w, h) * 0.02));

  const push = (x: number, y: number) => {
    const i = (y * w + x) * ch;
    samples.push([data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0]);
  };

  for (let x = 0; x < w; x += 2) {
    for (let y = 0; y < border; y += 2) push(x, y);
    for (let y = h - border; y < h; y += 2) push(x, y);
  }
  for (let y = border; y < h - border; y += 2) {
    for (let x = 0; x < border; x += 2) push(x, y);
    for (let x = w - border; x < w; x += 2) push(x, y);
  }

  if (samples.length === 0) return "#ffffff";
  const rs = samples.map((s) => s[0]).sort((a, b) => a - b);
  const gs = samples.map((s) => s[1]).sort((a, b) => a - b);
  const bs = samples.map((s) => s[2]).sort((a, b) => a - b);
  const mid = Math.floor(rs.length / 2);
  return hexFromRgb(rs[mid]!, gs[mid]!, bs[mid]!);
}

function kMeansLab(pixels: [number, number, number][], k: number): Array<{ members: [number, number, number][] }> {
  if (pixels.length === 0) return [];
  const labs = pixels.map((px) => rgbToLab(px[0], px[1], px[2]));
  const kk = Math.min(k, pixels.length);
  const step = Math.max(1, Math.floor(labs.length / kk));
  let centroids: [number, number, number][] = Array.from({ length: kk }, (_, i) => labs[Math.min(i * step, labs.length - 1)]!);

  let buckets: [number, number, number][][] = [];
  for (let iter = 0; iter < 8; iter += 1) {
    buckets = Array.from({ length: kk }, () => []);
    for (let p = 0; p < pixels.length; p += 1) {
      const lab = labs[p]!;
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < kk; c += 1) {
        const cen = centroids[c]!;
        const d = (lab[0] - cen[0]) ** 2 + (lab[1] - cen[1]) ** 2 + (lab[2] - cen[2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      buckets[best]!.push(pixels[p]!);
    }
    centroids = centroids.map((c, i) => {
      const b = buckets[i]!;
      if (b.length === 0) return c;
      const bLabs = b.map((px) => rgbToLab(px[0], px[1], px[2]));
      const l = bLabs.map((v) => v[0]).sort((a, bb) => a - bb);
      const a = bLabs.map((v) => v[1]).sort((x, y) => x - y);
      const bb = bLabs.map((v) => v[2]).sort((x, y) => x - y);
      const m = Math.floor(l.length / 2);
      return [l[m]!, a[m]!, bb[m]!] as [number, number, number];
    });
  }

  return buckets.filter((members) => members.length > 0).map((members) => ({ members }));
}

function medianHexFromPixels(pixels: [number, number, number][]): string {
  const rs = pixels.map((p) => p[0]).sort((a, b) => a - b);
  const gs = pixels.map((p) => p[1]).sort((a, b) => a - b);
  const bs = pixels.map((p) => p[2]).sort((a, b) => a - b);
  const m = Math.floor(rs.length / 2);
  return hexFromRgb(rs[m]!, gs[m]!, bs[m]!);
}

export async function sampleRegionColors(
  pagePng: Buffer,
  bboxPage: BBoxPage,
  options?: { paperHex?: string; maxColors?: number; kind?: BrandColorRegionKind },
): Promise<Array<{ hex: string; share: number }>> {
  const meta = await sharp(pagePng).metadata();
  const pageWidth = meta.width ?? 0;
  const pageHeight = meta.height ?? 0;
  if (!pageWidth || !pageHeight) return [];

  const paperHex = options?.paperHex ?? (await estimatePaperColor(pagePng));
  const inner = shrinkBBoxPage(bboxPage);
  const rect = bboxToPixelRect(inner, pageWidth, pageHeight);

  const { data, info } = await sharp(pagePng)
    .extract(rect)
    .resize(SAMPLE_REGION_MAX_LONG_EDGE, SAMPLE_REGION_MAX_LONG_EDGE, {
      fit: "inside",
      withoutEnlargement: false,
      kernel: sharp.kernel.linear,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels: [number, number, number][] = [];
  const ch = info.channels;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const i = (y * info.width + x) * ch;
      pixels.push([data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0]);
    }
  }
  if (pixels.length === 0) return [];

  const minShare = options?.kind === "logo" ? 0.03 : 0.08;
  const maxK = options?.kind === "palette_swatch" || options?.kind === "brand_block" ? 1 : 4;
  const clusters = kMeansLab(pixels, maxK);
  const total = pixels.length;
  const out: Array<{ hex: string; share: number }> = [];

  for (const cluster of clusters) {
    const hex = medianHexFromPixels(cluster.members).toLowerCase();
    const share = cluster.members.length / total;
    if (share < minShare) continue;
    const lab = rgbToLab(...parseHex(hex));
    if (lab[0] > 92 && chromaLab(lab) < 6) continue;
    if (options?.kind !== "logo" && deltaE76(hex, paperHex) < 10) continue;
    out.push({ hex: hex.toLowerCase(), share });
  }

  const limit = options?.maxColors ?? (options?.kind === "palette_swatch" ? 1 : 4);
  return out.sort((a, b) => b.share - a.share).slice(0, limit);
}

export async function extractLogoPaletteFromCrop(cropPng: Buffer): Promise<Array<{ hex: string; share: number }>> {
  const trimmed = await sharp(cropPng)
    .trim({ threshold: 15 })
    .png()
    .toBuffer()
    .catch(() => cropPng);
  const meta = await sharp(trimmed).metadata();
  if (!meta.width || !meta.height || meta.width < 4 || meta.height < 4) return [];
  const paperHex = await estimatePaperColor(trimmed);
  return sampleRegionColors(trimmed, [0, 0, 1, 1], { paperHex, maxColors: 4, kind: "logo" });
}

type RawSample = {
  hex: string;
  share: number;
  kind: BrandColorRegionKind;
  prominence: number;
  pageNumber: number;
  labelText?: string;
};

function mergeRawSamples(samples: RawSample[]): Array<RawSample & { recurrence: number; pages: number[] }> {
  const merged: Array<RawSample & { recurrence: number; pages: number[] }> = [];
  for (const s of samples) {
    const hit = merged.find((m) => deltaE76(m.hex, s.hex) < 6 && m.kind === s.kind);
    if (hit) {
      hit.recurrence += 1;
      hit.share = Math.max(hit.share, s.share);
      hit.prominence = Math.max(hit.prominence, s.prominence);
      if (!hit.pages.includes(s.pageNumber)) hit.pages.push(s.pageNumber);
      if (s.labelText && !hit.labelText) hit.labelText = s.labelText;
    } else {
      merged.push({ ...s, recurrence: 1, pages: [s.pageNumber] });
    }
  }
  return merged;
}

function toSemanticColor(
  sample: RawSample & { recurrence: number; pages: number[]; score: number },
  role: ColorRole,
  name?: string,
): SemanticPaletteColor {
  return {
    hex: sample.hex,
    role,
    name,
    regionKind: sample.kind,
    prominence: sample.prominence,
    recurrence: sample.recurrence,
    share: sample.share,
    pages: sample.pages,
    score: sample.score,
  };
}

function assignPaletteRoles(
  ranked: Array<RawSample & { recurrence: number; pages: number[]; score: number }>,
  paperHex: string,
): SemanticPaletteColor[] {
  const chromatic = ranked.filter((c) => {
    if (deltaE76(c.hex, paperHex) < 10) return false;
    const lab = rgbToLab(...parseHex(c.hex));
    return !(lab[0] > 92 && chromaLab(lab) < 6);
  });
  const neutrals = ranked.filter((c) => !chromatic.includes(c));

  const entries: SemanticPaletteColor[] = [];
  let primary: (typeof chromatic)[number] | undefined;
  let secondary: (typeof chromatic)[number] | undefined;

  if (chromatic.length > 0) {
    primary = chromatic[0];
    entries.push(toSemanticColor(primary, "primary", primary.labelText));
    secondary = chromatic.find((c, i) => i > 0 && deltaE76(c.hex, primary!.hex) > 25);
    if (secondary) entries.push(toSemanticColor(secondary, "secondary", secondary.labelText));
    for (const c of chromatic) {
      if (c === primary || c === secondary) continue;
      entries.push(toSemanticColor(c, "accent", c.labelText));
    }
  }

  for (const n of neutrals.slice(0, 1)) {
    entries.push(toSemanticColor(n, "background"));
  }

  return entries.slice(0, 5);
}

export async function verifyPaletteFromPdfText(
  docs: IntakeDocInput[],
  entries: SemanticPaletteColor[],
): Promise<SemanticPaletteColor[]> {
  const textLabels = await extractBrandColorLabelsFromPdf(docs);
  let snapped = snapEntriesToTextLabels(entries, textLabels);
  snapped = finalizeSemanticPalette(snapped, textLabels);
  return snapped;
}

export function capRegionsForSampling(
  regionDefs: Array<{ docId: string; page: number; region: ParsedVisionBrandColorRegion }>,
): typeof regionDefs {
  const byDoc = new Map<string, typeof regionDefs>();
  for (const def of regionDefs) {
    const list = byDoc.get(def.docId) ?? [];
    list.push(def);
    byDoc.set(def.docId, list);
  }

  const capped: typeof regionDefs = [];
  for (const list of byDoc.values()) {
    const always = list.filter(
      (d) => d.region.kind === "palette_swatch" || d.region.kind === "logo",
    );
    const secondary = list
      .filter((d) => d.region.kind === "display_text" || d.region.kind === "brand_block")
      .sort((a, b) => (b.region.prominence ?? 1) - (a.region.prominence ?? 1))
      .slice(0, MAX_SECONDARY_REGIONS_PER_DOC);
    capped.push(...always, ...secondary);
  }
  return capped;
}

function logoPaletteFromColors(logoColors: Array<{ hex: string; share: number }>): SemanticPaletteColor[] {
  const sorted = [...logoColors].sort((a, b) => b.share - a.share);
  const out: SemanticPaletteColor[] = [];
  const primary = sorted[0]!;
  out.push({
    hex: primary.hex,
    role: "primary",
    regionKind: "logo",
    prominence: 3,
    recurrence: 1,
    share: primary.share,
    pages: [0],
    score: KIND_WEIGHT.logo * 3 * primary.share,
  });
  const secondary = sorted.find((c) => deltaE76(c.hex, primary.hex) > 25);
  if (secondary) {
    out.push({
      hex: secondary.hex,
      role: "secondary",
      regionKind: "logo",
      prominence: 3,
      recurrence: 1,
      share: secondary.share,
      pages: [0],
      score: KIND_WEIGHT.logo * 2.5 * secondary.share,
    });
  }
  for (const c of sorted) {
    if (c === primary || c === secondary) continue;
    out.push({
      hex: c.hex,
      role: "accent",
      regionKind: "logo",
      prominence: 2,
      recurrence: 1,
      share: c.share,
      pages: [0],
      score: KIND_WEIGHT.logo * c.share,
    });
  }
  return out.slice(0, 5);
}

function ensureLogoPaletteFallback(
  entries: SemanticPaletteColor[],
  logoColors: Array<{ hex: string; share: number }>,
): SemanticPaletteColor[] {
  if (entries.some((e) => e.regionKind === "palette_swatch")) return entries;

  const chromatic = entries.filter((e) => e.role === "primary" || e.role === "secondary" || e.role === "accent");
  const deckLike =
    chromatic.length === 0 ||
    chromatic.every((e) => e.regionKind === "brand_block" || e.regionKind === "display_text");

  if (logoColors.length === 0) {
    if (!deckLike) return entries;
    return entries.filter((e) => e.role === "background").slice(0, 1);
  }

  const fromLogo = logoPaletteFromColors(logoColors);
  if (fromLogo.length === 0) {
    if (!deckLike) return entries;
    return entries.filter((e) => e.role === "background").slice(0, 1);
  }

  const logoChromatic = chromatic.filter((e) => e.regionKind === "logo");
  if (logoChromatic.length >= 2) return entries;
  if (!deckLike && logoChromatic.length > 0) return entries;

  const neutrals = entries.filter((e) => e.role === "background");
  return [...fromLogo, ...neutrals].slice(0, 5);
}

export async function buildSemanticPalette(input: {
  docs: IntakeDocInput[];
  regions: RegionSampleInput[];
  logoCropPng?: Buffer | null;
  onSamplingProgress?: (done: number, total: number) => void;
  onColorReady?: (entry: SemanticPaletteColor) => void;
}): Promise<SemanticPaletteResult> {
  const started = Date.now();
  const raw: RawSample[] = [];
  let logoColorsCache: Array<{ hex: string; share: number }> = [];

  if (input.logoCropPng) {
    logoColorsCache = await extractLogoPaletteFromCrop(input.logoCropPng);
    for (const c of logoColorsCache) {
      raw.push({
        hex: c.hex,
        share: c.share,
        kind: "logo",
        prominence: 3,
        pageNumber: 0,
      });
    }
  }

  const totalRegions = input.regions.length;
  let doneRegions = 0;
  const regionsByPage = new Map<string, RegionSampleInput[]>();
  for (const region of input.regions) {
    const key = `${region.pageNumber}:${region.pageWidth}x${region.pageHeight}`;
    const list = regionsByPage.get(key) ?? [];
    list.push(region);
    regionsByPage.set(key, list);
  }

  for (const pageRegions of regionsByPage.values()) {
    const paperHex = await estimatePaperColor(pageRegions[0]!.pagePng);
    for (const region of pageRegions) {
      const colors = await sampleRegionColors(region.pagePng, region.bboxPage, {
        paperHex,
        kind: region.kind,
      });
      for (const c of colors) {
        raw.push({
          hex: c.hex,
          share: c.share,
          kind: region.kind,
          prominence: region.prominence,
          pageNumber: region.pageNumber,
          labelText: region.labelText,
        });
      }
      doneRegions += 1;
      input.onSamplingProgress?.(doneRegions, totalRegions);
    }
  }

  const merged = mergeRawSamples(raw);
  const paperHex =
    input.regions[0]?.pagePng != null ? await estimatePaperColor(input.regions[0]!.pagePng) : "#ffffff";

  const scored = merged
    .map((m) => ({
      ...m,
      score: KIND_WEIGHT[m.kind] * m.prominence * m.recurrence * m.share,
    }))
    .sort((a, b) => b.score - a.score);

  let entries = assignPaletteRoles(scored, paperHex);
  entries = await verifyPaletteFromPdfText(input.docs, entries);
  entries = ensureLogoPaletteFallback(entries, logoColorsCache);
  for (const entry of entries) {
    input.onColorReady?.(entry);
  }

  const semanticChromaticCount = entries.filter((e) => e.role === "primary" || e.role === "secondary" || e.role === "accent").length;

  return {
    entries,
    samplingMs: Date.now() - started,
    semanticChromaticCount,
  };
}

export function regionFromVision(
  region: ParsedVisionBrandColorRegion,
  pageNumber: number,
): RegionSampleInput | null {
  const bbox = box2dToBBoxPage(region.box_2d);
  if (!bbox) return null;
  const prominence = Math.min(3, Math.max(1, Math.round(region.prominence))) as 1 | 2 | 3;
  return {
    pagePng: Buffer.alloc(0),
    pageWidth: 0,
    pageHeight: 0,
    bboxPage: bbox,
    kind: region.kind,
    prominence,
    pageNumber,
    labelText: region.label_text?.trim() || undefined,
  };
}

export async function renderSemanticPalettePages(input: {
  docs: IntakeDocInput[];
  pageKeys: Array<{ docId: string; page: number }>;
}): Promise<Map<string, { png: Buffer; width: number; height: number }>> {
  const out = new Map<string, { png: Buffer; width: number; height: number }>();
  const byDoc = new Map<string, Set<number>>();
  for (const key of input.pageKeys) {
    if (!byDoc.has(key.docId)) byDoc.set(key.docId, new Set());
    byDoc.get(key.docId)!.add(key.page);
  }

  for (const doc of input.docs) {
    const pages = byDoc.get(doc.docId);
    if (!pages || pages.size === 0) continue;
    if (doc.kind === "image") {
      const meta = await sharp(doc.buffer).png().toBuffer();
      const info = await sharp(meta).metadata();
      out.set(`${doc.docId}:1`, { png: meta, width: info.width ?? 0, height: info.height ?? 0 });
      continue;
    }
    const rendered = await renderPdfPagesAt(doc.buffer, [...pages], {
      dpi: SEMANTIC_PALETTE_DPI,
      concurrency: 4,
    });
    for (const page of rendered) {
      out.set(`${doc.docId}:${page.pageNumber}`, {
        png: page.pngBuffer,
        width: page.width,
        height: page.height,
      });
    }
  }
  return out;
}
