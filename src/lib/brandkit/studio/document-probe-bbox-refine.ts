/**
 * Refina bbox del probe sin LLM: flood-fill desde la caja del modelo
 * hasta el límite del fondo uniforme (transición a color de fondo).
 */

import sharp from "sharp";

export type ProbeLogoBbox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const BG_SAMPLE_BORDER = 6;
const FOREGROUND_THRESHOLD = 30;
const SEARCH_EXPAND_X = 2.4;
const SEARCH_EXPAND_Y = 2.2;
const OUTPUT_PAD_RATIO = 0.012;
/** Puente horizontal máximo (px) para unir wordmark + isotipo separados por fondo. */
const BRIDGE_GAP_MIN = 10;
const BRIDGE_GAP_MAX = 44;
/** Tope de crecimiento por lado respecto a la semilla LLM (asimétrico: más margen a la izq.). */
const GROW_CAP_LEFT_RATIO = 1.05;
const GROW_CAP_RIGHT_RATIO = 0.5;
const GROW_CAP_TOP_RATIO = 0.35;
const GROW_CAP_BOTTOM_RATIO = 0.38;
const GROW_CAP_MIN_PX = 18;
const GROW_CAP_MAX_PX_X = 88;
const GROW_CAP_MAX_PX_Y = 64;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function colorDist(
  r: number,
  g: number,
  b: number,
  br: number,
  bg: number,
  bb: number,
): number {
  const dr = r - br;
  const dg = g - bg;
  const db = b - bb;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function medianRgb(samples: Array<[number, number, number]>): [number, number, number] {
  if (!samples.length) return [255, 255, 255];
  const rs = samples.map((s) => s[0]).sort((a, b) => a - b);
  const gs = samples.map((s) => s[1]).sort((a, b) => a - b);
  const bs = samples.map((s) => s[2]).sort((a, b) => a - b);
  const mid = Math.floor(samples.length / 2);
  return [rs[mid]!, gs[mid]!, bs[mid]!];
}

function pixelAt(data: Buffer, channels: number, width: number, x: number, y: number): [number, number, number] {
  const i = (y * width + x) * channels;
  return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
}

function estimateBackgroundColor(
  data: Buffer,
  channels: number,
  width: number,
  height: number,
  seed: { left: number; top: number; right: number; bottom: number },
): [number, number, number] {
  const samples: Array<[number, number, number]> = [];

  for (let x = 0; x < width; x += 4) {
    for (let b = 0; b < BG_SAMPLE_BORDER && b < height; b += 1) {
      samples.push(pixelAt(data, channels, width, x, b));
      samples.push(pixelAt(data, channels, width, x, height - 1 - b));
    }
  }
  for (let y = 0; y < height; y += 4) {
    for (let b = 0; b < BG_SAMPLE_BORDER && b < width; b += 1) {
      samples.push(pixelAt(data, channels, width, b, y));
      samples.push(pixelAt(data, channels, width, width - 1 - b, y));
    }
  }

  const padX = Math.max(4, Math.round((seed.right - seed.left) * 0.25));
  const padY = Math.max(4, Math.round((seed.bottom - seed.top) * 0.25));
  const outer = {
    left: Math.max(0, seed.left - padX),
    top: Math.max(0, seed.top - padY),
    right: Math.min(width - 1, seed.right + padX),
    bottom: Math.min(height - 1, seed.bottom + padY),
  };

  for (let x = outer.left; x <= outer.right; x += 2) {
    for (let y = outer.top; y <= outer.top + 2; y += 1) samples.push(pixelAt(data, channels, width, x, y));
    for (let y = outer.bottom - 2; y <= outer.bottom; y += 1) samples.push(pixelAt(data, channels, width, x, y));
  }
  for (let y = outer.top; y <= outer.bottom; y += 2) {
    for (let x = outer.left; x <= outer.left + 2; x += 1) samples.push(pixelAt(data, channels, width, x, y));
    for (let x = outer.right - 2; x <= outer.right; x += 1) samples.push(pixelAt(data, channels, width, x, y));
  }

  return medianRgb(samples);
}

type ForegroundRun = { start: number; end: number };

function foregroundRunsOnRow(
  y: number,
  searchLeft: number,
  searchRight: number,
  isForeground: (x: number, y: number) => boolean,
): ForegroundRun[] {
  const runs: ForegroundRun[] = [];
  let start = -1;
  for (let x = searchLeft; x <= searchRight; x += 1) {
    if (isForeground(x, y)) {
      if (start < 0) start = x;
    } else if (start >= 0) {
      runs.push({ start, end: x - 1 });
      start = -1;
    }
  }
  if (start >= 0) runs.push({ start, end: searchRight });
  return runs;
}

function gapIsBackground(
  x0: number,
  x1: number,
  y: number,
  isForeground: (x: number, y: number) => boolean,
): boolean {
  if (x0 > x1) return true;
  for (let x = x0; x <= x1; x += 1) {
    if (isForeground(x, y)) return false;
  }
  return true;
}

function runBridgesToExtent(
  run: ForegroundRun,
  left: number,
  right: number,
  bridgeGap: number,
  y: number,
  isForeground: (x: number, y: number) => boolean,
): boolean {
  if (run.end >= left && run.start <= right) return true;
  if (run.start > right) {
    const gap = run.start - right - 1;
    return gap <= bridgeGap && gapIsBackground(right + 1, run.start - 1, y, isForeground);
  }
  if (run.end < left) {
    const gap = left - run.end - 1;
    return gap <= bridgeGap && gapIsBackground(run.end + 1, left - 1, y, isForeground);
  }
  return false;
}

function clampExtentToSeedGrowth(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  seedLeft: number,
  seedRight: number,
  seedTop: number,
  seedBottom: number,
  seedW: number,
  seedH: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const growLeft = Math.min(
    GROW_CAP_MAX_PX_X,
    Math.max(GROW_CAP_MIN_PX, Math.round(seedW * GROW_CAP_LEFT_RATIO)),
  );
  const growRight = Math.min(
    GROW_CAP_MAX_PX_X,
    Math.max(GROW_CAP_MIN_PX, Math.round(seedW * GROW_CAP_RIGHT_RATIO)),
  );
  const growTop = Math.min(
    GROW_CAP_MAX_PX_Y,
    Math.max(GROW_CAP_MIN_PX, Math.round(seedH * GROW_CAP_TOP_RATIO)),
  );
  const growBottom = Math.min(
    GROW_CAP_MAX_PX_Y,
    Math.max(GROW_CAP_MIN_PX, Math.round(seedH * GROW_CAP_BOTTOM_RATIO)),
  );

  return {
    minX: Math.max(minX, seedLeft - growLeft),
    maxX: Math.min(maxX, seedRight + growRight),
    minY: Math.max(minY, seedTop - growTop),
    maxY: Math.min(maxY, seedBottom + growBottom),
  };
}

function bridgeHorizontalGaps(
  visited: Set<number>,
  floodMinX: number,
  floodMaxX: number,
  bandTop: number,
  bandBottom: number,
  searchLeft: number,
  searchRight: number,
  imageWidth: number,
  bridgeGap: number,
  seedLeft: number,
  seedRight: number,
  seedTop: number,
  seedBottom: number,
  isForeground: (x: number, y: number) => boolean,
): { minX: number; maxX: number } {
  let minX = floodMinX;
  let maxX = floodMaxX;

  for (let y = bandTop; y <= bandBottom; y += 1) {
    const inSeedBand = y >= seedTop && y <= seedBottom;
    let anchorLeft = Number.POSITIVE_INFINITY;
    let anchorRight = Number.NEGATIVE_INFINITY;
    let hasVisitedOnRow = false;
    for (let x = searchLeft; x <= searchRight; x += 1) {
      if (!visited.has(y * imageWidth + x)) continue;
      hasVisitedOnRow = true;
      anchorLeft = Math.min(anchorLeft, x);
      anchorRight = Math.max(anchorRight, x);
    }

    if (!hasVisitedOnRow && !inSeedBand) continue;

    if (inSeedBand) {
      anchorLeft = Math.min(anchorLeft, seedLeft);
      anchorRight = Math.max(anchorRight, seedRight);
    }
    if (!Number.isFinite(anchorLeft)) {
      anchorLeft = floodMinX;
      anchorRight = floodMaxX;
    }

    const runs = foregroundRunsOnRow(y, searchLeft, searchRight, isForeground);
    let changed = true;
    while (changed) {
      changed = false;
      for (const run of runs) {
        if (!runBridgesToExtent(run, anchorLeft, anchorRight, bridgeGap, y, isForeground)) continue;
        const nextLeft = Math.min(anchorLeft, run.start);
        const nextRight = Math.max(anchorRight, run.end);
        if (nextLeft < anchorLeft || nextRight > anchorRight) {
          anchorLeft = nextLeft;
          anchorRight = nextRight;
          changed = true;
        }
      }
    }

    minX = Math.min(minX, anchorLeft);
    maxX = Math.max(maxX, anchorRight);
  }

  return { minX, maxX };
}

function toNormBbox(
  left: number,
  top: number,
  right: number,
  bottom: number,
  width: number,
  height: number,
): ProbeLogoBbox {
  const padX = Math.round((right - left + 1) * OUTPUT_PAD_RATIO);
  const padY = Math.round((bottom - top + 1) * OUTPUT_PAD_RATIO);
  const l = Math.max(0, left - padX);
  const t = Math.max(0, top - padY);
  const r = Math.min(width - 1, right + padX);
  const b = Math.min(height - 1, bottom + padY);
  return {
    x: clamp01(l / width),
    y: clamp01(t / height),
    width: clamp01((r - l + 1) / width),
    height: clamp01((b - t + 1) / height),
  };
}

/**
 * Expande la caja LLM por componente conexo de “no-fondo” anclado a la semilla.
 */
export async function refineProbeLogoBboxFromBackground(
  jpegBase64: string,
  seed: ProbeLogoBbox,
): Promise<ProbeLogoBbox> {
  const buffer = Buffer.from(jpegBase64, "base64");
  const meta = await sharp(buffer).metadata();
  const iw = meta.width ?? 1;
  const ih = meta.height ?? 1;

  const seedLeft = Math.max(0, Math.floor(seed.x * iw));
  const seedTop = Math.max(0, Math.floor(seed.y * ih));
  const seedRight = Math.min(iw - 1, Math.ceil((seed.x + seed.width) * iw) - 1);
  const seedBottom = Math.min(ih - 1, Math.ceil((seed.y + seed.height) * ih) - 1);
  if (seedRight <= seedLeft || seedBottom <= seedTop) return seed;

  const seedW = seedRight - seedLeft + 1;
  const seedH = seedBottom - seedTop + 1;
  const cx = Math.floor((seedLeft + seedRight) / 2);
  const cy = Math.floor((seedTop + seedBottom) / 2);

  const searchHalfW = Math.max(Math.round(seedW * SEARCH_EXPAND_X), 48);
  const searchHalfH = Math.max(Math.round(seedH * SEARCH_EXPAND_Y), 32);
  const searchLeft = Math.max(0, cx - searchHalfW);
  const searchTop = Math.max(0, cy - searchHalfH);
  const searchRight = Math.min(iw - 1, cx + searchHalfW);
  const searchBottom = Math.min(ih - 1, cy + searchHalfH);

  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const bg = estimateBackgroundColor(data, channels, iw, ih, {
    left: seedLeft,
    top: seedTop,
    right: seedRight,
    bottom: seedBottom,
  });

  const isForeground = (x: number, y: number): boolean => {
    const [r, g, b] = pixelAt(data, channels, iw, x, y);
    return colorDist(r, g, b, bg[0], bg[1], bg[2]) > FOREGROUND_THRESHOLD;
  };

  const visited = new Set<number>();
  const queue: Array<[number, number]> = [];

  for (let y = seedTop; y <= seedBottom; y += 1) {
    for (let x = seedLeft; x <= seedRight; x += 1) {
      if (!isForeground(x, y)) continue;
      const key = y * iw + x;
      visited.add(key);
      queue.push([x, y]);
    }
  }

  if (!queue.length) return seed;

  let minX = iw;
  let minY = ih;
  let maxX = 0;
  let maxY = 0;

  const neighbors: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  while (queue.length) {
    const [x, y] = queue.pop()!;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);

    for (const [dx, dy] of neighbors) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < searchLeft || nx > searchRight || ny < searchTop || ny > searchBottom) continue;
      const key = ny * iw + nx;
      if (visited.has(key)) continue;
      if (!isForeground(nx, ny)) continue;
      visited.add(key);
      queue.push([nx, ny]);
    }
  }

  // Puente horizontal acotado: une wordmark + isotipo solo si el hueco de fondo es pequeño.
  const bandPad = Math.max(2, Math.round((maxY - minY + 1) * 0.15));
  const bandTop = Math.max(searchTop, minY - bandPad);
  const bandBottom = Math.min(searchBottom, maxY + bandPad);
  const bridgeGap = Math.min(
    BRIDGE_GAP_MAX,
    Math.max(BRIDGE_GAP_MIN, Math.round(seedW * 0.38)),
  );
  const bridged = bridgeHorizontalGaps(
    visited,
    minX,
    maxX,
    bandTop,
    bandBottom,
    searchLeft,
    searchRight,
    iw,
    bridgeGap,
    seedLeft,
    seedRight,
    seedTop,
    seedBottom,
    isForeground,
  );
  minX = bridged.minX;
  maxX = bridged.maxX;

  ({ minX, maxX, minY, maxY } = clampExtentToSeedGrowth(
    minX,
    maxX,
    minY,
    maxY,
    seedLeft,
    seedRight,
    seedTop,
    seedBottom,
    seedW,
    seedH,
  ));

  if (maxX <= minX || maxY <= minY) return seed;

  const refined = toNormBbox(minX, minY, maxX, maxY, iw, ih);
  const grew =
    refined.width > seed.width * 1.04 ||
    refined.height > seed.height * 1.04 ||
    refined.x < seed.x - 0.005 ||
    refined.y < seed.y - 0.005;

  return grew ? refined : seed;
}
