import sharp from "sharp";
import type { BBoxPage } from "./logo-intake/bbox";
import type { BrandBoardLogoRegionScore } from "./genoma-brand-board-logo-regions";

const GRID_COLS = 12;
const GRID_ROWS = 12;
const MIN_CELL_FILL = 0.08;
const MIN_REGION_CELLS = 4;

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function cellsToBbox(cells: Set<number>, cols: number, rows: number): BBoxPage | null {
  if (!cells.size) return null;
  let minX = cols;
  let minY = rows;
  let maxX = 0;
  let maxY = 0;
  for (const cell of cells) {
    const x = cell % cols;
    const y = Math.floor(cell / cols);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const padX = 1 / cols;
  const padY = 1 / rows;
  return [
    Math.max(0, minX / cols - padX * 0.25),
    Math.max(0, minY / rows - padY * 0.25),
    Math.min(1, (maxX + 1) / cols + padX * 0.25),
    Math.min(1, (maxY + 1) / rows + padY * 0.25),
  ];
}

function floodRegion(
  start: number,
  active: boolean[],
  cols: number,
  rows: number,
  visited: boolean[],
): Set<number> {
  const stack = [start];
  const region = new Set<number>();
  while (stack.length) {
    const cell = stack.pop()!;
    if (visited[cell] || !active[cell]) continue;
    visited[cell] = true;
    region.add(cell);
    const x = cell % cols;
    const y = Math.floor(cell / cols);
    if (x > 0) stack.push(cell - 1);
    if (x < cols - 1) stack.push(cell + 1);
    if (y > 0) stack.push(cell - cols);
    if (y < rows - 1) stack.push(cell + cols);
  }
  return region;
}

/** Regiones por contraste (componentes conectados en rejilla) — complementa plantillas fijas. */
export async function segmentContrastLogoRegions(
  pngBuffer: Buffer,
  width: number,
  height: number,
): Promise<BrandBoardLogoRegionScore[]> {
  const targetWidth = 360;
  const resized = await sharp(pngBuffer)
    .resize({ width: targetWidth, withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rw = resized.info.width;
  const rh = resized.info.height;
  const data = resized.data;
  const channels = resized.info.channels || 3;
  const cellW = Math.max(1, Math.floor(rw / GRID_COLS));
  const cellH = Math.max(1, Math.floor(rh / GRID_ROWS));

  const cellLum: number[] = [];
  const cellContrast: number[] = [];

  for (let gy = 0; gy < GRID_ROWS; gy += 1) {
    for (let gx = 0; gx < GRID_COLS; gx += 1) {
      let sum = 0;
      let sumSq = 0;
      let count = 0;
      const x0 = gx * cellW;
      const y0 = gy * cellH;
      const x1 = Math.min(rw, x0 + cellW);
      const y1 = Math.min(rh, y0 + cellH);
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const idx = (y * rw + x) * channels;
          const lum = luminance(data[idx] ?? 0, data[idx + 1] ?? 0, data[idx + 2] ?? 0);
          sum += lum;
          sumSq += lum * lum;
          count += 1;
        }
      }
      const mean = count ? sum / count : 0;
      const variance = count ? Math.max(0, sumSq / count - mean * mean) : 0;
      cellLum.push(mean);
      cellContrast.push(Math.sqrt(variance));
    }
  }

  const active = cellLum.map((mean, index) => {
    const contrast = cellContrast[index] ?? 0;
    const brightMark = mean > 150 && contrast > 18;
    const darkPanel = mean < 120 && contrast > 22;
    return brightMark || darkPanel;
  });

  const visited = new Array(GRID_COLS * GRID_ROWS).fill(false);
  const regions: BrandBoardLogoRegionScore[] = [];

  for (let cell = 0; cell < active.length; cell += 1) {
    if (!active[cell] || visited[cell]) continue;
    const cluster = floodRegion(cell, active, GRID_COLS, GRID_ROWS, visited);
    if (cluster.size < MIN_REGION_CELLS) continue;
    const fill = cluster.size / (GRID_COLS * GRID_ROWS);
    if (fill < MIN_CELL_FILL || fill > 0.55) continue;
    const bbox = cellsToBbox(cluster, GRID_COLS, GRID_ROWS);
    if (!bbox) continue;
    const aspect = (bbox[2] - bbox[0]) / Math.max(0.02, bbox[3] - bbox[1]);
    if (aspect < 0.25 || aspect > 8) continue;
    const meanLum =
      [...cluster].reduce((sum, idx) => sum + (cellLum[idx] ?? 0), 0) / cluster.size;
    const meanContrast =
      [...cluster].reduce((sum, idx) => sum + (cellContrast[idx] ?? 0), 0) / cluster.size;
    let score = 0.42 + Math.min(0.28, meanContrast / 120);
    if (meanLum > 140 || meanLum < 110) score += 0.08;
    regions.push({ bbox, label: "segment_contrast", score: Math.min(0.9, score) });
  }

  return regions.sort((a, b) => b.score - a.score).slice(0, 4);
}
