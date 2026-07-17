import sharp from "sharp";
import type { PdfScanTextSpan } from "./pdf-scan-types";

export type CleanTextCoverRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

const DEFAULT_PAD_PX = 3;
const SAMPLE_RING_PX = 3;

/**
 * Pinta rectángulos opacos sobre las zonas de texto detectadas para que el fondo
 * de Designer no duplique el texto editable.
 * El color se estima muestreando píxeles del anillo exterior de cada bbox.
 */
export async function coverTextRegionsOnPageRaster(
  pngBuffer: Buffer,
  spans: Array<Pick<PdfScanTextSpan, "x" | "y" | "w" | "h">>,
  options?: { padPx?: number },
): Promise<Buffer> {
  if (!spans.length) return pngBuffer;

  const image = sharp(pngBuffer, { failOn: "none" });
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 1 || height < 1) return pngBuffer;

  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const pad = options?.padPx ?? DEFAULT_PAD_PX;

  const covers: Array<CleanTextCoverRect & { fill: string }> = [];
  for (const span of spans) {
    const x = clamp(Math.floor(span.x) - pad, 0, width - 1);
    const y = clamp(Math.floor(span.y) - pad, 0, height - 1);
    const right = clamp(Math.ceil(span.x + span.w) + pad, x + 1, width);
    const bottom = clamp(Math.ceil(span.y + span.h) + pad, y + 1, height);
    const w = Math.max(1, right - x);
    const h = Math.max(1, bottom - y);
    const fill = sampleFillAroundRect(data, width, height, channels, x, y, w, h);
    covers.push({ x, y, w, h, fill });
  }

  const svg = buildCoverSvg(width, height, covers);
  return sharp(pngBuffer, { failOn: "none" })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

/** Exportado para tests unitarios del muestreo/SVG. */
export function buildCoverSvg(
  width: number,
  height: number,
  covers: Array<CleanTextCoverRect & { fill: string }>,
): string {
  const rects = covers
    .map(
      (c) =>
        `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="${c.fill}" />`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rects}</svg>`;
}

function sampleFillAroundRect(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  x: number,
  y: number,
  w: number,
  h: number,
): string {
  const samples: number[] = [];
  const pushPixel = (px: number, py: number) => {
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    const i = (py * width + px) * channels;
    samples.push(data[i]!, data[i + 1]!, data[i + 2]!);
  };

  const outerLeft = Math.max(0, x - SAMPLE_RING_PX);
  const outerTop = Math.max(0, y - SAMPLE_RING_PX);
  const outerRight = Math.min(width - 1, x + w + SAMPLE_RING_PX - 1);
  const outerBottom = Math.min(height - 1, y + h + SAMPLE_RING_PX - 1);

  // Anillo exterior (arriba/abajo)
  for (let px = outerLeft; px <= outerRight; px += 2) {
    for (let py = outerTop; py < y; py += 1) pushPixel(px, py);
    for (let py = y + h; py <= outerBottom; py += 1) pushPixel(px, py);
  }
  // Anillo exterior (lados)
  for (let py = y; py < y + h; py += 2) {
    for (let px = outerLeft; px < x; px += 1) pushPixel(px, py);
    for (let px = x + w; px <= outerRight; px += 1) pushPixel(px, py);
  }

  if (samples.length < 9) return "#ffffff";

  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (let i = 0; i < samples.length; i += 3) {
    rs.push(samples[i]!);
    gs.push(samples[i + 1]!);
    bs.push(samples[i + 2]!);
  }
  return `#${toHex(median(rs))}${toHex(median(gs))}${toHex(median(bs))}`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 255;
}

function toHex(n: number): string {
  return clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
