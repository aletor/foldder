/**
 * Check determinista de integridad del wordmark (Fase B).
 * Renderiza el SVG y compara densidad de tinta por glifo esperado vs textInLogo (Fase A).
 */

import sharp from "sharp";

export type WordmarkIntegrityResult = {
  ok: boolean;
  expected: string;
  /** Índices de letras con tinta insuficiente (palabra concatenada sin espacios). */
  missingLetterIndices: number[];
  /** Densidad relativa por letra (0–1 vs mediana). */
  letterInk: number[];
  detail: string;
};

function normalizeWordmarkText(text: string): string {
  return text
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[^A-Z0-9 ]/g, "");
}

async function renderSvgOnBackground(svg: string, bg: string, width = 1200): Promise<Buffer> {
  const logoPng = await sharp(Buffer.from(svg)).resize(width).png().toBuffer();
  const meta = await sharp(logoPng).metadata();
  const w = meta.width ?? width;
  const h = meta.height ?? 1;
  return sharp({
    create: { width: w, height: h, channels: 3, background: bg },
  })
    .composite([{ input: logoPng, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

type InkMask = { mask: Uint8Array; w: number; h: number; mode: "dark" | "light" };

async function buildInkMask(svg: string, mode: "dark" | "light", bg?: string): Promise<InkMask> {
  const background = bg ?? (mode === "dark" ? "#f5f5f0" : "#1a1a2e");
  const png = await renderSvgOnBackground(svg, background);
  const meta = await sharp(png).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const lum = (r + g + b) / 3;
      if (mode === "dark" ? lum < 220 : lum > 200) mask[y * w + x] = 1;
    }
  }
  return { mask, w, h, mode };
}

function columnInk(mask: Uint8Array, w: number, h: number, x: number, y0: number, y1: number): number {
  let sum = 0;
  for (let y = y0; y <= y1; y += 1) sum += mask[y * w + x] ?? 0;
  return sum;
}

function segmentWordRegions(
  cols: number[],
  w: number,
  gapMin: number,
): Array<{ left: number; right: number }> {
  const inkCols = cols.map((c, i) => ({ i, c })).filter((v) => v.c > 0);
  if (!inkCols.length) return [];
  const regions: Array<{ left: number; right: number }> = [];
  let start = inkCols[0]!.i;
  let prev = start;
  for (let idx = 1; idx < inkCols.length; idx += 1) {
    const x = inkCols[idx]!.i;
    if (x - prev > gapMin) {
      regions.push({ left: start, right: prev });
      start = x;
    }
    prev = x;
  }
  regions.push({ left: start, right: prev });
  return regions.slice(0, 4);
}

function checkWordLetters(
  mask: InkMask,
  word: string,
  region: { left: number; right: number },
  y0: number,
  y1: number,
): { missingLocal: number[]; ink: number[] } {
  const letters = word.replace(/ /g, "");
  const span = Math.max(1, region.right - region.left + 1);
  const sliceW = span / letters.length;
  const ink: number[] = [];
  const missingLocal: number[] = [];
  for (let li = 0; li < letters.length; li += 1) {
    const x0 = Math.floor(region.left + li * sliceW);
    const x1 = Math.floor(region.left + (li + 1) * sliceW);
    let sum = 0;
    for (let x = x0; x < x1; x += 1) sum += columnInk(mask.mask, mask.w, mask.h, x, y0, y1);
    ink.push(sum);
  }
  const sorted = [...ink].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 1;
  const threshold = Math.max(3, median * 0.18);
  for (let li = 0; li < letters.length; li += 1) {
    if ((ink[li] ?? 0) < threshold) missingLocal.push(li);
  }
  return { missingLocal, ink };
}

/** Compara tinta horizontal por palabra/glifo en textInLogo. */
export async function verifyWordmarkIntegrity(
  svg: string,
  textInLogo: string,
): Promise<WordmarkIntegrityResult> {
  const expected = normalizeWordmarkText(textInLogo);
  const words = expected.split(" ").filter(Boolean);
  if (!words.length) {
    return {
      ok: false,
      expected,
      missingLetterIndices: [],
      letterInk: [],
      detail: "textInLogo vacío",
    };
  }

  const dark = await buildInkMask(svg, "dark");
  const lightOnLight = words.length > 1 ? await buildInkMask(svg, "light", "#f5f5f0") : null;
  const rowTop = 0;
  const rowBottom = Math.floor(dark.h * 0.72);
  const cols = new Array(dark.w).fill(0).map((_, x) => columnInk(dark.mask, dark.w, dark.h, x, rowTop, rowBottom));
  const regions = segmentWordRegions(cols, dark.w, Math.max(8, Math.floor(dark.w * 0.02)));
  if (words.length > 1 && regions.length < words.length && lightOnLight) {
    const lightCols = new Array(lightOnLight.w)
      .fill(0)
      .map((_, x) => columnInk(lightOnLight.mask, lightOnLight.w, lightOnLight.h, x, rowTop, rowBottom));
    const lightRegions = segmentWordRegions(lightCols, lightOnLight.w, Math.max(8, Math.floor(lightOnLight.w * 0.02)));
    while (regions.length < words.length && lightRegions.length > regions.length) {
      regions.push(lightRegions[regions.length]!);
    }
  }

  const letterInk: number[] = [];
  const missingLetterIndices: number[] = [];
  let offset = 0;

  for (let wi = 0; wi < words.length; wi += 1) {
    const word = words[wi]!;
    const region = regions[wi] ?? regions[0];
    if (!region) {
      return {
        ok: false,
        expected,
        missingLetterIndices: [...word].map((_, i) => offset + i),
        letterInk,
        detail: `sin región de tinta para "${word}"`,
      };
    }
    const mask = wi === 0 ? dark : (lightOnLight ?? dark);
    const { missingLocal, ink } = checkWordLetters(mask, word, region, rowTop, rowBottom);
    letterInk.push(...ink);
    for (const mi of missingLocal) missingLetterIndices.push(offset + mi);
    offset += word.length;
  }

  const missingChars = missingLetterIndices
    .map((i) => expected.replace(/ /g, "")[i])
    .filter(Boolean)
    .join("");
  const ok = missingLetterIndices.length === 0;
  return {
    ok,
    expected,
    missingLetterIndices,
    letterInk,
    detail: ok
      ? `wordmark integrity ✓ · ${expected}`
      : `faltan glifos [${missingChars}] en posiciones ${missingLetterIndices.join(",")}`,
  };
}

export { wordmarkIntegrityPasses, assessWordmarkIntegrityStatus } from "../projection/logo-crown-policy";
export type { WordmarkIntegrityStatus } from "../projection/logo-crown-policy";
