/**
 * Métricas visuales de logo — solo desempate cuando dos candidatos empatan en
 * brandBehaviorScore. No filtran ni vetan logos fotográficos/multicolor.
 */

import sharp from "sharp";

export const LOGONESS_MAX_DISTINCT_COLORS = 12;
export const LOGONESS_MAX_TONAL_ENTROPY = 3.0;
export const LOGONESS_MIN_INK_DENSITY = 0.03;
export const LOGONESS_MAX_INK_DENSITY = 0.45;

export type LogoNessMetrics = {
  distinctColors: number;
  tonalEntropy: number;
  inkDensity: number;
  containsFace: boolean;
  geometricEdges: boolean;
  width: number;
  height: number;
  /** Rectángulo/círculo sólido de plantilla — no es logotipo. */
  simpleSolidShape: boolean;
  /** Cuota del color de tinta dominante sobre píxeles opacos. */
  dominantFillShare: number;
};

function isSkinTone(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 15) return false;
  return r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15;
}

function shannonEntropy(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let entropy = 0;
  for (const c of counts) {
    if (c <= 0) continue;
    const p = c / total;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

async function rawRgba(buffer: Buffer, maxSide = 256): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(buffer)
    .resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export async function measureDistinctColors(buffer: Buffer): Promise<number> {
  const { data } = await rawRgba(buffer);
  const colors = new Set<string>();
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] ?? 0;
    if (a < 32) continue;
    const r = Math.round((data[i] ?? 0) / 16) * 16;
    const g = Math.round((data[i + 1] ?? 0) / 16) * 16;
    const b = Math.round((data[i + 2] ?? 0) / 16) * 16;
    colors.add(`${r},${g},${b}`);
  }
  return colors.size;
}

export async function measureTonalEntropy(buffer: Buffer): Promise<number> {
  const { data } = await rawRgba(buffer);
  const bins = new Array<number>(32).fill(0);
  let pixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] ?? 0;
    if (a < 32) continue;
    pixels += 1;
    const lum = Math.round(
      0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0),
    );
    bins[Math.min(31, Math.floor(lum / 8))] += 1;
  }
  if (pixels === 0) return 0;
  return shannonEntropy(bins.filter((c) => c > 0));
}

export async function measureInkDensity(buffer: Buffer): Promise<number> {
  const { data } = await rawRgba(buffer);
  const buckets = new Map<string, number>();
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] ?? 0;
    if (a < 32) continue;
    const r = Math.round((data[i] ?? 0) / 16) * 16;
    const g = Math.round((data[i + 1] ?? 0) / 16) * 16;
    const b = Math.round((data[i + 2] ?? 0) / 16) * 16;
    const key = `${r},${g},${b}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const bgKey = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "255,255,255";
  const bg = bgKey.split(",").map((v) => Number(v));
  let ink = 0;
  let pixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] ?? 0;
    if (a < 32) continue;
    pixels += 1;
    const dr = Math.abs((data[i] ?? 0) - (bg[0] ?? 255));
    const dg = Math.abs((data[i + 1] ?? 0) - (bg[1] ?? 255));
    const db = Math.abs((data[i + 2] ?? 0) - (bg[2] ?? 255));
    if (dr + dg + db > 42) ink += 1;
  }
  return pixels ? ink / pixels : 0;
}

export async function containsFaceHeuristic(buffer: Buffer): Promise<boolean> {
  const { data } = await rawRgba(buffer, 192);
  let skin = 0;
  let opaque = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] ?? 0;
    if (a < 32) continue;
    opaque += 1;
    if (isSkinTone(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0)) skin += 1;
  }
  if (opaque === 0) return false;
  const skinRatio = skin / opaque;
  if (skinRatio > 0.1) return true;
  if (skinRatio > 0.05) {
    const [colors, entropy] = await Promise.all([measureDistinctColors(buffer), measureTonalEntropy(buffer)]);
    if (colors > 40 || entropy > 2.5) return true;
  }
  return false;
}

export async function hasGeometricEdges(buffer: Buffer): Promise<boolean> {
  const { data, width, height } = await rawRgba(buffer, 128);
  const grey = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      grey[y * width + x] = 0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0);
    }
  }

  const magnitudes: number[] = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const gx =
        -grey[(y - 1) * width + (x - 1)] +
        grey[(y - 1) * width + (x + 1)] -
        2 * grey[y * width + (x - 1)] +
        2 * grey[y * width + (x + 1)] -
        grey[(y + 1) * width + (x - 1)] +
        grey[(y + 1) * width + (x + 1)];
      const gy =
        -grey[(y - 1) * width + (x - 1)] -
        2 * grey[(y - 1) * width + x] -
        grey[(y - 1) * width + (x + 1)] +
        grey[(y + 1) * width + (x - 1)] +
        2 * grey[(y + 1) * width + x] +
        grey[(y + 1) * width + (x + 1)];
      magnitudes.push(Math.hypot(gx, gy));
    }
  }
  if (magnitudes.length === 0) return true;

  const sorted = [...magnitudes].sort((a, b) => a - b);
  const threshold = sorted[Math.floor(sorted.length * 0.72)] ?? 24;
  const strong = magnitudes.filter((m) => m > threshold).length / magnitudes.length;
  const entropy = await measureTonalEntropy(buffer);

  // Gráficos planos: baja entropía; formas vectoriales: bordes fuertes pero no difusos.
  if (entropy < 2.5) return true;
  return strong >= 0.03 && strong <= 0.38 && entropy < 4;
}

export function measureDominantFillShare(data: Buffer, width: number, height: number): number {
  const buckets = new Map<string, number>();
  let opaque = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] ?? 0;
    if (a < 32) continue;
    opaque += 1;
    const r = Math.round((data[i] ?? 0) / 16) * 16;
    const g = Math.round((data[i + 1] ?? 0) / 16) * 16;
    const b = Math.round((data[i + 2] ?? 0) / 16) * 16;
    const key = `${r},${g},${b}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  if (opaque === 0) return 0;
  const max = Math.max(...buckets.values());
  return max / opaque;
}

export function isSimpleSolidLogoShape(
  metrics: Pick<
    LogoNessMetrics,
    "distinctColors" | "tonalEntropy" | "inkDensity" | "width" | "height" | "dominantFillShare"
  >,
): boolean {
  const aspect = metrics.width / Math.max(1, metrics.height);
  const extremeBar = aspect >= 5.5 || aspect <= 0.18;
  /** Banda de plantilla: un bloque casi monocromo y extremadamente alargado. */
  const flatTemplate =
    extremeBar &&
    metrics.dominantFillShare >= 0.96 &&
    metrics.tonalEntropy <= 0.55 &&
    metrics.distinctColors <= 2;
  return flatTemplate;
}

export function simpleSolidShapePenalty(metrics: Pick<LogoNessMetrics, "simpleSolidShape">): number {
  return metrics.simpleSolidShape ? 0.72 : 0;
}

export async function measureLogoNess(buffer: Buffer): Promise<LogoNessMetrics> {
  const meta = await sharp(buffer).metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;
  const { data } = await rawRgba(buffer);
  const dominantFillShare = measureDominantFillShare(data, width, height);
  const [distinctColors, tonalEntropy, inkDensity, containsFace, geometricEdges] = await Promise.all([
    measureDistinctColors(buffer),
    measureTonalEntropy(buffer),
    measureInkDensity(buffer),
    containsFaceHeuristic(buffer),
    hasGeometricEdges(buffer),
  ]);
  const base = {
    distinctColors,
    tonalEntropy,
    inkDensity,
    containsFace,
    geometricEdges,
    width,
    height,
    dominantFillShare,
  };
  return { ...base, simpleSolidShape: isSimpleSolidLogoShape(base) };
}

export function visualTiebreakScore(metrics: LogoNessMetrics): number {
  if (metrics.simpleSolidShape) return 0.05;
  let score = 0;
  if (metrics.distinctColors < LOGONESS_MAX_DISTINCT_COLORS) score += 0.28;
  if (metrics.tonalEntropy < LOGONESS_MAX_TONAL_ENTROPY) score += 0.28;
  if (metrics.geometricEdges) score += 0.22;
  if (
    metrics.inkDensity >= LOGONESS_MIN_INK_DENSITY &&
    metrics.inkDensity <= LOGONESS_MAX_INK_DENSITY
  ) {
    score += 0.22;
  }
  return score;
}

/** @deprecated Solo tests legacy — el filtro real es brandBehaviorScore. */
export function passesLogoNessFilter(metrics: LogoNessMetrics): boolean {
  return (
    metrics.distinctColors < LOGONESS_MAX_DISTINCT_COLORS &&
    metrics.tonalEntropy < LOGONESS_MAX_TONAL_ENTROPY &&
    metrics.inkDensity >= LOGONESS_MIN_INK_DENSITY &&
    metrics.inkDensity <= LOGONESS_MAX_INK_DENSITY &&
    !metrics.containsFace &&
    metrics.geometricEdges
  );
}

export async function isLogoLike(buffer: Buffer): Promise<boolean> {
  return passesLogoNessFilter(await measureLogoNess(buffer));
}

export function isLogoFilename(fileName: string): boolean {
  return /logo|logotipo|marca|brand/i.test(fileName);
}
