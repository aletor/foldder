import crypto from "crypto";
import sharp from "sharp";
import type { PdfLogoCandidate } from "@/lib/brain/pdf-brand-extract";
import {
  clampPixelBBox,
  renderPdfPageCrop,
  renderPdfPages,
  type PixelBBox,
  type RenderedPdfPage,
  PDF_PAGE_RENDER_DEFAULT_DPI,
} from "@/lib/brain/pdf-page-render";
import { matteCropWithBirefnet } from "@/lib/layerizer/layerizer-fal";

export const LOGO_SIG_WIDTH = 96;
export const LOGO_SIG_HEIGHT = 32;
export const LOGO_JACCARD_CLUSTER_THRESHOLD = 0.32;
export const LOGO_CLUSTER_MIN_PAGE_RATIO = 0.5;
/** Umbral más bajo para listar candidatos en picker (partners pueden repetirse poco). */
export const LOGO_CANDIDATE_MIN_PAGES = 2;
export const LOGO_CANDIDATE_MIN_PAGE_RATIO = 0.06;
export const LOGO_HIGH_RES_DPI = 300;

export type LogoRegionKind = RegionKind;

type RegionKind = "header" | "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

type RegionSample = {
  pageNumber: number;
  region: RegionKind;
  bbox: PixelBBox;
  signature: Uint8Array;
  inkRatio: number;
};

type LogoPolarity = "light_mark" | "dark_mark" | "unknown";

type ScoredInstance = {
  pageNumber: number;
  region: RegionKind;
  bbox: PixelBBox;
  polarity: LogoPolarity;
  score: number;
  bgVariance: number;
  bgLuminance: number;
  fgLuminance: number;
};

function luminance255(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function jaccardSimilarity(a: Uint8Array, b: Uint8Array): number {
  let inter = 0;
  let uni = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] || b[i]) uni += 1;
    if (a[i] && b[i]) inter += 1;
  }
  return uni ? inter / uni : 0;
}

function regionBoxes(pageWidth: number, pageHeight: number): Array<{ region: RegionKind; bbox: PixelBBox }> {
  const pct = (x: number, y: number, w: number, h: number): PixelBBox =>
    clampPixelBBox(pageWidth, pageHeight, {
      x: Math.round(pageWidth * x),
      y: Math.round(pageHeight * y),
      width: Math.round(pageWidth * w),
      height: Math.round(pageHeight * h),
    });

  return [
    { region: "header", bbox: pct(0, 0, 1, 0.12) },
    { region: "topLeft", bbox: pct(0, 0, 0.32, 0.15) },
    { region: "topRight", bbox: pct(0.68, 0, 0.32, 0.15) },
    { region: "bottomLeft", bbox: pct(0, 0.85, 0.32, 0.15) },
    { region: "bottomRight", bbox: pct(0.68, 0.85, 0.32, 0.15) },
  ];
}

export async function computeEdgeSignature(pngBuffer: Buffer, bbox: PixelBBox): Promise<Uint8Array> {
  const { data, info } = await sharp(pngBuffer)
    .extract({ left: bbox.x, top: bbox.y, width: bbox.width, height: bbox.height })
    .greyscale()
    .normalize({ lower: 1, upper: 99 })
    .linear(1.4, -(128 * 0.25))
    .convolve({
      width: 3,
      height: 3,
      kernel: [-1, 0, 1, -2, 0, 2, -1, 0, 1],
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const sorted = [...data].sort((a, b) => a - b);
  const threshold = sorted[Math.floor(sorted.length * 0.6)] ?? 128;
  const resized = await sharp(Buffer.from(data), {
    raw: { width: info.width, height: info.height, channels: 1 },
  })
    .resize(LOGO_SIG_WIDTH, LOGO_SIG_HEIGHT, { fit: "fill" })
    .raw()
    .toBuffer();

  const signature = new Uint8Array(LOGO_SIG_WIDTH * LOGO_SIG_HEIGHT);
  for (let i = 0; i < resized.length; i += 1) {
    signature[i] = resized[i] > threshold ? 1 : 0;
  }
  return signature;
}

async function estimateInkRatio(pngBuffer: Buffer, bbox: PixelBBox): Promise<number> {
  const { data } = await sharp(pngBuffer)
    .extract({ left: bbox.x, top: bbox.y, width: bbox.width, height: bbox.height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const buckets = new Map<string, number>();
  for (let i = 0; i < data.length; i += 4) {
    const r = Math.round((data[i] ?? 0) / 16) * 16;
    const g = Math.round((data[i + 1] ?? 0) / 16) * 16;
    const b = Math.round((data[i + 2] ?? 0) / 16) * 16;
    const key = `${r},${g},${b}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const bg = (buckets.entries().next().value?.[0] ?? "255,255,255").split(",").map((v) => Number(v));
  let ink = 0;
  for (let i = 0; i < data.length; i += 4) {
    const dr = Math.abs((data[i] ?? 0) - (bg[0] ?? 255));
    const dg = Math.abs((data[i + 1] ?? 0) - (bg[1] ?? 255));
    const db = Math.abs((data[i + 2] ?? 0) - (bg[2] ?? 255));
    if (dr + dg + db > 42) ink += 1;
  }
  return ink / (data.length / 4);
}

export async function collectRegionSamples(pages: RenderedPdfPage[]): Promise<RegionSample[]> {
  const samples: RegionSample[] = [];
  for (const page of pages) {
    for (const { region, bbox } of regionBoxes(page.width, page.height)) {
      const [signature, inkRatio] = await Promise.all([
        computeEdgeSignature(page.pngBuffer, bbox),
        estimateInkRatio(page.pngBuffer, bbox),
      ]);
      if (inkRatio < 0.003) continue;
      samples.push({
        pageNumber: page.pageNumber,
        region,
        bbox,
        signature,
        inkRatio,
      });
    }
  }
  return samples;
}

export function clusterRegionSamples(
  samples: RegionSample[],
  pageCount: number,
): RegionSample[] {
  if (samples.length === 0) return [];

  let bestCluster: RegionSample[] = [];
  for (const seed of samples) {
    const cluster = samples.filter(
      (s) => jaccardSimilarity(seed.signature, s.signature) >= LOGO_JACCARD_CLUSTER_THRESHOLD,
    );
    const pagesInCluster = new Set(cluster.map((c) => c.pageNumber)).size;
    const bestPages = new Set(bestCluster.map((c) => c.pageNumber)).size;
    if (pagesInCluster > bestPages) bestCluster = cluster;
  }

  const minPages = Math.max(2, Math.ceil(pageCount * LOGO_CLUSTER_MIN_PAGE_RATIO));
  if (new Set(bestCluster.map((c) => c.pageNumber)).size < minPages) {
    return [];
  }
  return bestCluster;
}

/** Todos los clusters disjuntos por firma Jaccard (para picker multi-logo). */
export function clusterAllRegionSamples(
  samples: RegionSample[],
  pageCount: number,
  options?: { minPages?: number; minPageRatio?: number; jaccardThreshold?: number },
): RegionSample[][] {
  if (samples.length === 0 || pageCount <= 0) return [];

  const threshold = options?.jaccardThreshold ?? LOGO_JACCARD_CLUSTER_THRESHOLD;
  const minPages = Math.max(
    options?.minPages ?? LOGO_CANDIDATE_MIN_PAGES,
    Math.ceil(pageCount * (options?.minPageRatio ?? LOGO_CANDIDATE_MIN_PAGE_RATIO)),
  );
  const claimed = new Set<number>();
  const clusters: RegionSample[][] = [];

  const seedOrder = [...samples.entries()].sort(
    (a, b) => b[1].inkRatio - a[1].inkRatio || a[0] - b[0],
  );

  for (const [seedIndex, seed] of seedOrder) {
    if (claimed.has(seedIndex)) continue;
    const clusterIndices: number[] = [];
    for (let i = 0; i < samples.length; i += 1) {
      if (claimed.has(i)) continue;
      if (jaccardSimilarity(seed.signature, samples[i].signature) >= threshold) {
        clusterIndices.push(i);
      }
    }
    const pagesHit = new Set(clusterIndices.map((i) => samples[i].pageNumber)).size;
    if (pagesHit < minPages) continue;
    for (const i of clusterIndices) claimed.add(i);
    clusters.push(clusterIndices.map((i) => samples[i]));
  }

  return clusters.sort(
    (a, b) => new Set(b.map((s) => s.pageNumber)).size - new Set(a.map((s) => s.pageNumber)).size,
  );
}

export function regionPositionPrior(region: LogoRegionKind): number {
  if (region === "header" || region === "topLeft" || region === "topRight") return 1;
  if (region === "bottomLeft" || region === "bottomRight") return 0.55;
  return 0.35;
}

export function scoreLogoCluster(cluster: RegionSample[], pageCount: number): number {
  const pagesHit = new Set(cluster.map((s) => s.pageNumber)).size;
  const recurrence = pagesHit / Math.max(1, pageCount);
  const position =
    cluster.reduce((sum, s) => sum + regionPositionPrior(s.region), 0) / Math.max(1, cluster.length);
  const ink = cluster.reduce((sum, s) => sum + s.inkRatio, 0) / Math.max(1, cluster.length);
  return recurrence * 0.55 + position * 0.3 + Math.min(1, ink * 12) * 0.15;
}

export function signatureToClusterId(signature: Uint8Array): string {
  const hex = Buffer.from(signature).toString("hex");
  return `c_${hex.slice(0, 16)}`;
}

/** Cosecha el mark principal (variant positive) de un cluster para picker / S3. */
export async function harvestPrimaryLogoFromCluster(
  pages: RenderedPdfPage[],
  pdfBuffer: Buffer,
  cluster: RegionSample[],
  options: { allowPaidMatting?: boolean } = {},
): Promise<{
  buffer: Buffer;
  variant: "positive" | "negative";
  pageNumber: number;
  bbox: PixelBBox;
  confidence: number;
  isolationMethod: "keying" | "birefnet";
} | null> {
  const scored = await scoreClusterInstances(pages, cluster);
  if (scored.length === 0) return null;

  const dark = pickBestByPolarity(scored, "dark_mark");
  const light = pickBestByPolarity(scored, "light_mark");
  const instance = dark ?? light ?? scored[0];
  if (!instance) return null;

  const variant: "positive" | "negative" = dark ? "positive" : "negative";
  const scale = LOGO_HIGH_RES_DPI / PDF_PAGE_RENDER_DEFAULT_DPI;
  const scaledBbox: PixelBBox = {
    x: Math.round(instance.bbox.x * scale),
    y: Math.round(instance.bbox.y * scale),
    width: Math.round(instance.bbox.width * scale),
    height: Math.round(instance.bbox.height * scale),
  };
  const hiResCrop = await renderPdfPageCrop(pdfBuffer, instance.pageNumber, scaledBbox, LOGO_HIGH_RES_DPI);
  const { buffer: rgba, method } = await isolateLogoCrop(hiResCrop, instance.bgVariance, instance.polarity, options);
  const trimmedMeta = await sharp(rgba).metadata();
  if ((trimmedMeta.width ?? 0) < 20 || (trimmedMeta.height ?? 0) < 10) return null;

  const clusterPageRatio = new Set(cluster.map((c) => c.pageNumber)).size / Math.max(1, pages.length);
  return {
    buffer: rgba,
    variant,
    pageNumber: instance.pageNumber,
    bbox: instance.bbox,
    confidence: Math.min(0.94, 0.5 + clusterPageRatio * 0.35 + instance.score * 0.15),
    isolationMethod: method,
  };
}

export async function classifyRegionPolarity(
  pngBuffer: Buffer,
  pageWidth: number,
  pageHeight: number,
  bbox: PixelBBox,
): Promise<{ polarity: LogoPolarity; bgVariance: number; bgLuminance: number; fgLuminance: number }> {
  const clamped = clampPixelBBox(pageWidth, pageHeight, bbox);
  const { data, info } = await sharp(pngBuffer)
    .extract({ left: clamped.x, top: clamped.y, width: clamped.width, height: clamped.height })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const buckets = new Map<string, number>();
  const lumSamples: number[] = [];
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    lumSamples.push(luminance255(r, g, b));
    const key = `${Math.round(r / 16) * 16},${Math.round(g / 16) * 16},${Math.round(b / 16) * 16}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  const mean = lumSamples.reduce((a, b) => a + b, 0) / Math.max(1, lumSamples.length);
  const bgVariance =
    lumSamples.reduce((acc, v) => acc + (v - mean) ** 2, 0) / Math.max(1, lumSamples.length);

  const bgKey = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "255,255,255";
  const bg = bgKey.split(",").map((v) => Number(v));
  const bgLuminance = luminance255(bg[0] ?? 255, bg[1] ?? 255, bg[2] ?? 255);

  let fgSum = 0;
  let fgCount = 0;
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const dr = Math.abs(r - (bg[0] ?? 0));
    const dg = Math.abs(g - (bg[1] ?? 0));
    const db = Math.abs(b - (bg[2] ?? 0));
    if (dr + dg + db > 40) {
      fgSum += luminance255(r, g, b);
      fgCount += 1;
    }
  }

  const fgLuminance = fgCount ? fgSum / fgCount : bgLuminance;
  let polarity: LogoPolarity = "unknown";
  if (fgLuminance > bgLuminance + 12) polarity = "light_mark";
  else if (fgLuminance < bgLuminance - 12) polarity = "dark_mark";

  return { polarity, bgVariance, bgLuminance, fgLuminance };
}

async function scoreClusterInstances(
  pages: RenderedPdfPage[],
  cluster: RegionSample[],
): Promise<ScoredInstance[]> {
  const pageByNumber = new Map(pages.map((p) => [p.pageNumber, p]));
  const scored: ScoredInstance[] = [];

  for (const sample of cluster) {
    const page = pageByNumber.get(sample.pageNumber);
    if (!page) continue;
    const { polarity, bgVariance, bgLuminance, fgLuminance } = await classifyRegionPolarity(
      page.pngBuffer,
      page.width,
      page.height,
      sample.bbox,
    );
    const isolation = Math.min(1, sample.inkRatio * 8);
    const score = isolation * (polarity === "unknown" ? 0.35 : 1);
    scored.push({
      pageNumber: sample.pageNumber,
      region: sample.region,
      bbox: sample.bbox,
      polarity,
      score,
      bgVariance,
      bgLuminance,
      fgLuminance,
    });
  }

  return scored.sort((a, b) => b.score - a.score);
}

export async function isolateLogoWithKeying(
  cropBuffer: Buffer,
  polarity: LogoPolarity = "unknown",
): Promise<Buffer> {
  const { data, info } = await sharp(cropBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const buckets = new Map<string, number>();
  for (let i = 0; i < data.length; i += 4) {
    const r = Math.round((data[i] ?? 0) / 16) * 16;
    const g = Math.round((data[i + 1] ?? 0) / 16) * 16;
    const b = Math.round((data[i + 2] ?? 0) / 16) * 16;
    const key = `${r},${g},${b}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const bg = (buckets.entries().next().value?.[0] ?? "255,255,255").split(",").map((v) => Number(v));
  const bgLum = luminance255(bg[0] ?? 255, bg[1] ?? 255, bg[2] ?? 255);

  const masked = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const pxLum = luminance255(r, g, b);
    const dr = Math.abs(r - (bg[0] ?? 0));
    const dg = Math.abs(g - (bg[1] ?? 0));
    const db = Math.abs(b - (bg[2] ?? 0));
    let fg =
      polarity === "light_mark"
        ? pxLum > bgLum + 12
        : polarity === "dark_mark"
          ? pxLum < bgLum - 12
          : dr + dg + db > 42;
    masked[i] = fg && polarity === "light_mark" ? 255 : r;
    masked[i + 1] = fg && polarity === "light_mark" ? 255 : g;
    masked[i + 2] = fg && polarity === "light_mark" ? 255 : b;
    masked[i + 3] = fg ? 255 : 0;
  }

  return sharp(masked, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ threshold: 1 })
    .png()
    .toBuffer();
}

async function isolateLogoCrop(
  cropBuffer: Buffer,
  bgVariance: number,
  polarity: LogoPolarity,
  options: { allowPaidMatting?: boolean } = {},
): Promise<{ buffer: Buffer; method: "keying" | "birefnet" }> {
  const flatBackground = bgVariance < 900;
  if (flatBackground) {
    return { buffer: await isolateLogoWithKeying(cropBuffer, polarity), method: "keying" };
  }

  const meta = await sharp(cropBuffer).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  if (options.allowPaidMatting && (process.env.FAL_KEY || process.env.FAL_API_KEY)) {
    try {
      const { rgba } = await matteCropWithBirefnet(cropBuffer, w, h);
      return { buffer: rgba, method: "birefnet" };
    } catch {
      // fallback to keying
    }
  }
  return { buffer: await isolateLogoWithKeying(cropBuffer, polarity), method: "keying" };
}

/** Matting de pago (BiRefNet) — solo tras coronación del usuario. */
export async function isolateLogoCropForCrownedMark(
  cropBuffer: Buffer,
  bgVariance: number,
  polarity: LogoPolarity,
): Promise<{ buffer: Buffer; method: "keying" | "birefnet" }> {
  return isolateLogoCrop(cropBuffer, bgVariance, polarity, { allowPaidMatting: true });
}

function bitsFromGreyBuffer(data: Buffer): string {
  const avg = data.reduce((a, b) => a + b, 0) / data.length;
  let bits = "";
  for (const v of data) bits += v >= avg ? "1" : "0";
  return bits;
}

export function computeLogoPHash(buffer: Buffer): Promise<string> {
  return sharp(buffer)
    .greyscale()
    .resize(32, 32, { fit: "fill" })
    .raw()
    .toBuffer()
    .then(bitsFromGreyBuffer);
}

const INK_LUMINANCE_DELTA = 28;

function largestInkComponentMask(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  const seen = new Uint8Array(w * h);
  let best: number[] = [];

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const start = y * w + x;
      if (!mask[start] || seen[start]) continue;
      const stack = [start];
      const component: number[] = [];
      seen[start] = 1;
      while (stack.length) {
        const idx = stack.pop()!;
        component.push(idx);
        const cx = idx % w;
        const cy = Math.floor(idx / w);
        for (const [nx, ny] of [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ]) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (!mask[ni] || seen[ni]) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
      if (component.length > best.length) best = component;
    }
  }

  for (const idx of best) out[idx] = 1;
  return out;
}

/**
 * pHash sobre silueta de tinta (componente conectado mayor), normalizada negro sobre blanco.
 * Reduce deriva por fondo fotográfico vs liso en el bbox del crop.
 */
export async function computeInkLogoPHash(buffer: Buffer): Promise<string> {
  const trimmed = await sharp(buffer).trim({ threshold: 8 }).png().toBuffer().catch(() => buffer);
  const { data, info } = await sharp(trimmed).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  if (!w || !h) return computeLogoPHash(buffer);

  const cornerCoords = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ] as const;
  const cornerLums = cornerCoords.map(([x, y]) => {
    const i = (y * w + x) * 4;
    return luminance255(data[i] ?? 255, data[i + 1] ?? 255, data[i + 2] ?? 255);
  });
  const bgLum = cornerLums.reduce((a, b) => a + b, 0) / cornerLums.length;

  const rawMask = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const lum = luminance255(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
      rawMask[y * w + x] = Math.abs(lum - bgLum) > INK_LUMINANCE_DELTA ? 1 : 0;
    }
  }

  const mask = largestInkComponentMask(rawMask, w, h);
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!mask[y * w + x]) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX <= minX || maxY <= minY) return computeLogoPHash(trimmed);

  const pad = 2;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  const rgba = Buffer.alloc(cropW * cropH * 4, 255);
  for (let y = 0; y < cropH; y += 1) {
    for (let x = 0; x < cropW; x += 1) {
      if (!mask[(minY + y) * w + (minX + x)]) continue;
      const o = (y * cropW + x) * 4;
      rgba[o] = 0;
      rgba[o + 1] = 0;
      rgba[o + 2] = 0;
      rgba[o + 3] = 255;
    }
  }

  const normalized = await sharp(rgba, { raw: { width: cropW, height: cropH, channels: 4 } })
    .resize(LOGO_SIG_WIDTH, LOGO_SIG_HEIGHT, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .greyscale()
    .raw()
    .toBuffer();

  return bitsFromGreyBuffer(normalized);
}

export function hammingDistanceBits(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let dist = Math.abs(a.length - b.length);
  for (let i = 0; i < len; i += 1) {
    if (a[i] !== b[i]) dist += 1;
  }
  return dist;
}

async function synthesizeVariantFromMask(
  rgba: Buffer,
  target: "positive" | "negative",
  paletteDarkHex?: string,
): Promise<Buffer> {
  const darkHex = paletteDarkHex ?? "#182448";
  const r = parseInt(darkHex.slice(1, 3), 16);
  const g = parseInt(darkHex.slice(3, 5), 16);
  const b = parseInt(darkHex.slice(5, 7), 16);
  const fill =
    target === "negative"
      ? { r: 255, g: 255, b: 255 }
      : { r, g, b };

  const { data, info } = await sharp(rgba).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    if ((out[i + 3] ?? 0) > 16) {
      out[i] = fill.r;
      out[i + 1] = fill.g;
      out[i + 2] = fill.b;
      out[i + 3] = 255;
    } else {
      out[i + 3] = 0;
    }
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

/** Sintetiza la variante de polaridad opuesta a partir de una máscara RGBA aislada. */
export async function synthesizeLogoPolarityVariant(
  rgba: Buffer,
  target: "positive" | "negative",
  paletteDarkHex?: string,
): Promise<Buffer> {
  return synthesizeVariantFromMask(rgba, target, paletteDarkHex);
}

function pickBestByPolarity(
  scored: ScoredInstance[],
  polarity: LogoPolarity,
): ScoredInstance | undefined {
  const candidates = scored.filter((s) => s.polarity === polarity);
  if (!candidates.length) return undefined;

  const rank = (item: ScoredInstance) => {
    let value = item.score;
    const contrast = (item.fgLuminance - item.bgLuminance) / 255;
    if (polarity === "light_mark") {
      value += item.bgLuminance < 120 ? 0.5 : -0.4;
      value += contrast * 0.35;
    }
    if (polarity === "dark_mark") {
      value += item.bgLuminance > 140 ? 0.35 : 0;
      value += -contrast * 0.25;
    }
    return value;
  };

  if (polarity === "light_mark") {
    const onDark = candidates.filter((s) => s.bgLuminance < 120);
    const pool = onDark.length ? onDark : candidates;
    return pool.sort((a, b) => rank(b) - rank(a))[0];
  }

  if (polarity === "dark_mark") {
    const onLight = candidates.filter((s) => s.bgLuminance > 140);
    const pool = onLight.length ? onLight : candidates;
    return pool.sort((a, b) => rank(b) - rank(a))[0];
  }

  return candidates.sort((a, b) => rank(b) - rank(a))[0];
}

async function buildLogoCandidate(input: {
  instance: ScoredInstance;
  variant: "positive" | "negative";
  origin: "cosechado" | "sintetizado";
  method: "keying" | "birefnet";
  rgba: Buffer;
  confidence: number;
}): Promise<PdfLogoCandidate> {
  return {
    buffer: input.rgba,
    mime: "image/png",
    bbox: input.instance.bbox,
    variant: input.variant,
    confidence: input.confidence,
    pageNumber: input.instance.pageNumber,
    evidenceDetail: `p.${input.instance.pageNumber} · ${input.origin} · ${input.method}`,
    isolationMethod: input.method,
    logoPHash: await computeLogoPHash(input.rgba),
  };
}

export async function detectLogosFromRenderedPages(
  pages: RenderedPdfPage[],
  pdfBuffer: Buffer,
  options?: { paletteDarkHex?: string; allowPaidMatting?: boolean },
): Promise<PdfLogoCandidate[]> {
  if (pages.length === 0) return [];

  const samples = await collectRegionSamples(pages);
  const cluster = clusterRegionSamples(samples, pages.length);
  if (cluster.length === 0) return [];

  const scored = await scoreClusterInstances(pages, cluster);
  if (scored.length === 0) return [];

  const light = pickBestByPolarity(scored, "light_mark");
  const dark = pickBestByPolarity(scored, "dark_mark");

  const logos: PdfLogoCandidate[] = [];
  const clusterPageRatio = new Set(cluster.map((c) => c.pageNumber)).size / pages.length;

  async function harvest(
    instance: ScoredInstance,
    variant: "positive" | "negative",
  ): Promise<PdfLogoCandidate | null> {
    const scale = LOGO_HIGH_RES_DPI / PDF_PAGE_RENDER_DEFAULT_DPI;
    const scaledBbox: PixelBBox = {
      x: Math.round(instance.bbox.x * scale),
      y: Math.round(instance.bbox.y * scale),
      width: Math.round(instance.bbox.width * scale),
      height: Math.round(instance.bbox.height * scale),
    };
    const hiResCrop = await renderPdfPageCrop(
      pdfBuffer,
      instance.pageNumber,
      scaledBbox,
      LOGO_HIGH_RES_DPI,
    );
    const { buffer: rgba, method } = await isolateLogoCrop(
      hiResCrop,
      instance.bgVariance,
      instance.polarity,
      options,
    );
    const trimmedMeta = await sharp(rgba).metadata();
    if ((trimmedMeta.width ?? 0) < 20 || (trimmedMeta.height ?? 0) < 10) return null;

    return buildLogoCandidate({
      instance,
      variant,
      origin: "cosechado",
      method,
      rgba,
      confidence: Math.min(0.94, 0.55 + clusterPageRatio * 0.35 + instance.score * 0.15),
    });
  }

  if (dark) {
    const positive = await harvest(dark, "positive");
    if (positive) logos.push(positive);
  }
  if (light) {
    const negative = await harvest(light, "negative");
    if (negative) logos.push(negative);
  }

  if (!dark && light) {
    const scale = LOGO_HIGH_RES_DPI / PDF_PAGE_RENDER_DEFAULT_DPI;
    const scaledBbox: PixelBBox = {
      x: Math.round(light.bbox.x * scale),
      y: Math.round(light.bbox.y * scale),
      width: Math.round(light.bbox.width * scale),
      height: Math.round(light.bbox.height * scale),
    };
    const hiResCrop = await renderPdfPageCrop(pdfBuffer, light.pageNumber, scaledBbox, LOGO_HIGH_RES_DPI);
    const { buffer: rgba, method } = await isolateLogoCrop(
      hiResCrop,
      light.bgVariance,
      light.polarity,
      options,
    );
    const synthesized = await synthesizeVariantFromMask(rgba, "positive", options?.paletteDarkHex);
    logos.push(
      await buildLogoCandidate({
        instance: light,
        variant: "positive",
        origin: "sintetizado",
        method,
        rgba: synthesized,
        confidence: 0.68,
      }),
    );
  } else if (!light && dark) {
    const scale = LOGO_HIGH_RES_DPI / PDF_PAGE_RENDER_DEFAULT_DPI;
    const scaledBbox: PixelBBox = {
      x: Math.round(dark.bbox.x * scale),
      y: Math.round(dark.bbox.y * scale),
      width: Math.round(dark.bbox.width * scale),
      height: Math.round(dark.bbox.height * scale),
    };
    const hiResCrop = await renderPdfPageCrop(pdfBuffer, dark.pageNumber, scaledBbox, LOGO_HIGH_RES_DPI);
    const { buffer: rgba, method } = await isolateLogoCrop(
      hiResCrop,
      dark.bgVariance,
      dark.polarity,
      options,
    );
    const synthesized = await synthesizeVariantFromMask(rgba, "negative");
    logos.push(
      await buildLogoCandidate({
        instance: dark,
        variant: "negative",
        origin: "sintetizado",
        method,
        rgba: synthesized,
        confidence: 0.66,
      }),
    );
  }

  return logos;
}

export async function detectLogosFromPdfBuffer(
  buffer: Buffer,
  options?: { maxPages?: number; dpi?: number; paletteDarkHex?: string },
): Promise<{ pages: RenderedPdfPage[]; logos: PdfLogoCandidate[] }> {
  const pages = await renderPdfPages(buffer, {
    maxPages: options?.maxPages,
    dpi: options?.dpi ?? PDF_PAGE_RENDER_DEFAULT_DPI,
  });
  const logos = await detectLogosFromRenderedPages(pages, buffer, options);
  return { pages, logos };
}
