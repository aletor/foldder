/**
 * Separa marcas compuestas por error (icono + barra de plantilla) en candidatos atómicos.
 * Un lockup real (isotipo + wordmark) permanece unido cuando las piezas están próximas.
 */

import sharp from "sharp";

export type ComponentBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixelCount: number;
};

const ALPHA_THRESHOLD = 16;
const MIN_COMPONENT_PIXELS = 80;
const MIN_COMPONENT_AREA_RATIO = 0.04;
const MAX_ATOMIC_COMPONENTS = 3;
const GAP_RATIO = 0.1;
const LOCKUP_HORIZONTAL_GAP_RATIO = 0.22;
const LOCKUP_VERTICAL_OVERLAP_RATIO = 0.45;

function findConnectedComponents(
  rgba: Buffer,
  width: number,
  height: number,
): ComponentBounds[] {
  const total = width * height;
  const labels = new Int32Array(total).fill(-1);
  const components: ComponentBounds[] = [];
  let nextLabel = 0;

  const index = (x: number, y: number) => y * width + x;
  const isOpaque = (x: number, y: number) => (rgba[index(x, y) * 4 + 3] ?? 0) > ALPHA_THRESHOLD;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = index(x, y);
      if (!isOpaque(x, y) || labels[idx] !== -1) continue;

      const label = nextLabel++;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      let pixelCount = 0;
      const stack: Array<[number, number]> = [[x, y]];
      labels[idx] = label;

      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        pixelCount += 1;
        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx);
        maxY = Math.max(maxY, cy);

        for (const [nx, ny] of [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ] as const) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nIdx = index(nx, ny);
          if (!isOpaque(nx, ny) || labels[nIdx] !== -1) continue;
          labels[nIdx] = label;
          stack.push([nx, ny]);
        }
      }

      components.push({ minX, minY, maxX, maxY, pixelCount });
    }
  }

  return components;
}

function verticalOverlapRatio(a: ComponentBounds, b: ComponentBounds): number {
  const overlapTop = Math.max(a.minY, b.minY);
  const overlapBottom = Math.min(a.maxY, b.maxY);
  if (overlapBottom < overlapTop) return 0;
  const overlap = overlapBottom - overlapTop + 1;
  const minHeight = Math.min(a.maxY - a.minY + 1, b.maxY - b.minY + 1);
  return minHeight > 0 ? overlap / minHeight : 0;
}

function horizontalGap(a: ComponentBounds, b: ComponentBounds): number {
  if (a.maxX < b.minX) return b.minX - a.maxX;
  if (b.maxX < a.minX) return a.minX - b.maxX;
  return 0;
}

function verticalGap(a: ComponentBounds, b: ComponentBounds): number {
  if (a.maxY < b.minY) return b.minY - a.maxY;
  if (b.maxY < a.minY) return a.minY - b.maxY;
  return 0;
}

/** Dos piezas en banda horizontal compartida — lockup legítimo (isotipo + wordmark). */
export function isHorizontalLogoLockup(a: ComponentBounds, b: ComponentBounds, imageWidth: number): boolean {
  const vOverlap = verticalOverlapRatio(a, b);
  const hGap = horizontalGap(a, b);
  return vOverlap >= LOCKUP_VERTICAL_OVERLAP_RATIO && hGap <= imageWidth * LOCKUP_HORIZONTAL_GAP_RATIO;
}

export function shouldSplitLogoComponents(
  components: ComponentBounds[],
  imageWidth: number,
  imageHeight: number,
): boolean {
  const opaquePixels = components.reduce((sum, c) => sum + c.pixelCount, 0);
  const significant = components.filter(
    (c) =>
      c.pixelCount >= MIN_COMPONENT_PIXELS &&
      c.pixelCount / Math.max(1, opaquePixels) >= MIN_COMPONENT_AREA_RATIO,
  );
  if (significant.length < 2) return false;

  const gapThreshold = Math.max(8, Math.round(Math.min(imageWidth, imageHeight) * GAP_RATIO));

  for (let i = 0; i < significant.length; i += 1) {
    for (let j = i + 1; j < significant.length; j += 1) {
      const a = significant[i]!;
      const b = significant[j]!;
      if (isHorizontalLogoLockup(a, b, imageWidth)) continue;
      const vGap = verticalGap(a, b);
      const hGap = horizontalGap(a, b);
      if (vGap >= gapThreshold || hGap >= gapThreshold) return true;
    }
  }
  return false;
}

async function cropComponent(
  rgba: Buffer,
  width: number,
  height: number,
  bounds: ComponentBounds,
  paddingPx = 4,
): Promise<Buffer> {
  const left = Math.max(0, bounds.minX - paddingPx);
  const top = Math.max(0, bounds.minY - paddingPx);
  const right = Math.min(width - 1, bounds.maxX + paddingPx);
  const bottom = Math.min(height - 1, bounds.maxY + paddingPx);
  return sharp(rgba)
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .png()
    .toBuffer();
}

export type LogoComponentSplitResult = {
  buffers: Buffer[];
  split: boolean;
  componentCount: number;
};

/** Devuelve uno o más recortes atómicos; no fusiona piezas distantes. */
export async function splitRasterLogoByComponents(buffer: Buffer): Promise<LogoComponentSplitResult> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const components = findConnectedComponents(data, width, height);
  if (components.length < 2) {
    return { buffers: [buffer], split: false, componentCount: components.length };
  }

  const opaquePixels = components.reduce((sum, c) => sum + c.pixelCount, 0);
  const significant = components.filter(
    (c) =>
      c.pixelCount >= MIN_COMPONENT_PIXELS &&
      c.pixelCount / Math.max(1, opaquePixels) >= MIN_COMPONENT_AREA_RATIO,
  );

  if (significant.length < 2 || significant.length > MAX_ATOMIC_COMPONENTS) {
    return { buffers: [buffer], split: false, componentCount: significant.length || components.length };
  }

  if (!shouldSplitLogoComponents(components, width, height)) {
    return { buffers: [buffer], split: false, componentCount: significant.length || components.length };
  }

  const rgba = await sharp(buffer).ensureAlpha().png().toBuffer();
  const parts = await Promise.all(significant.map((bounds) => cropComponent(rgba, width, height, bounds)));
  return { buffers: parts, split: true, componentCount: parts.length };
}
