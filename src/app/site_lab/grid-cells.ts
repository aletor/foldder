import { hKey, vKey } from "./grid-segments";
import type { TrackSpec } from "./grid-segments";

export type RegionRef = {
  minCol: number;
  minRow: number;
  maxCol: number;
  maxRow: number;
};

/** @deprecated Use RegionRef */
export type CellRef = RegionRef;

type GridFaceState = {
  hEdges: Set<string>;
  vEdges: Set<string>;
  xTracks: number[];
  yTracks: number[];
};

export function regionKey(region: RegionRef) {
  return `r|${region.minCol}|${region.minRow}|${region.maxCol}|${region.maxRow}`;
}

export function parseRegionKey(key: string): RegionRef | null {
  const parts = key.split("|");
  if (parts[0] !== "r" || parts.length !== 5) return null;
  const minCol = Number(parts[1]);
  const minRow = Number(parts[2]);
  const maxCol = Number(parts[3]);
  const maxRow = Number(parts[4]);
  if ([minCol, minRow, maxCol, maxRow].some((value) => Number.isNaN(value))) return null;
  return { minCol, minRow, maxCol, maxRow };
}

export function regionRefsEqual(a: RegionRef | null, b: RegionRef | null) {
  if (!a || !b) return false;
  return (
    a.minCol === b.minCol &&
    a.minRow === b.minRow &&
    a.maxCol === b.maxCol &&
    a.maxRow === b.maxRow
  );
}

function unitIndex(col: number, row: number, colCount: number) {
  return row * colCount + col;
}

function hasClosedBoundary(state: GridFaceState, region: RegionRef) {
  for (let col = region.minCol; col <= region.maxCol; col += 1) {
    if (!state.hEdges.has(hKey(region.minRow, col))) return false;
    if (!state.hEdges.has(hKey(region.maxRow + 1, col))) return false;
  }
  for (let row = region.minRow; row <= region.maxRow; row += 1) {
    if (!state.vEdges.has(vKey(region.minCol, row))) return false;
    if (!state.vEdges.has(vKey(region.maxCol + 1, row))) return false;
  }
  return true;
}

export function listRegions(state: GridFaceState): RegionRef[] {
  const colCount = state.xTracks.length - 1;
  const rowCount = state.yTracks.length - 1;
  if (colCount <= 0 || rowCount <= 0) return [];

  const parent = Array.from({ length: colCount * rowCount }, (_, index) => index);
  const find = (index: number): number => {
    if (parent[index] === index) return index;
    parent[index] = find(parent[index]!);
    return parent[index]!;
  };
  const unite = (colA: number, rowA: number, colB: number, rowB: number) => {
    const rootA = find(unitIndex(colA, rowA, colCount));
    const rootB = find(unitIndex(colB, rowB, colCount));
    if (rootA !== rootB) parent[rootB] = rootA;
  };

  for (let row = 0; row < rowCount; row += 1) {
    for (let col = 0; col < colCount; col += 1) {
      if (col + 1 < colCount && !state.vEdges.has(vKey(col + 1, row))) {
        unite(col, row, col + 1, row);
      }
      if (row + 1 < rowCount && !state.hEdges.has(hKey(row + 1, col))) {
        unite(col, row, col, row + 1);
      }
    }
  }

  type Bounds = {
    minCol: number;
    maxCol: number;
    minRow: number;
    maxRow: number;
    cells: number;
  };

  const groups = new Map<number, Bounds>();
  for (let row = 0; row < rowCount; row += 1) {
    for (let col = 0; col < colCount; col += 1) {
      const root = find(unitIndex(col, row, colCount));
      const current = groups.get(root);
      if (!current) {
        groups.set(root, { minCol: col, maxCol: col, minRow: row, maxRow: row, cells: 1 });
        continue;
      }
      current.minCol = Math.min(current.minCol, col);
      current.maxCol = Math.max(current.maxCol, col);
      current.minRow = Math.min(current.minRow, row);
      current.maxRow = Math.max(current.maxRow, row);
      current.cells += 1;
    }
  }

  const regions: RegionRef[] = [];
  for (const bounds of groups.values()) {
    const spanW = bounds.maxCol - bounds.minCol + 1;
    const spanH = bounds.maxRow - bounds.minRow + 1;
    if (bounds.cells !== spanW * spanH) continue;
    const region = {
      minCol: bounds.minCol,
      maxCol: bounds.maxCol,
      minRow: bounds.minRow,
      maxRow: bounds.maxRow,
    };
    if (hasClosedBoundary(state, region)) regions.push(region);
  }

  return regions;
}

export function isClosedCell(state: GridFaceState, col: number, row: number) {
  return listRegions(state).some(
    (region) => region.minCol === col && region.maxCol === col && region.minRow === row && region.maxRow === row,
  );
}

export function listClosedCells(state: GridFaceState): RegionRef[] {
  return listRegions(state).filter(
    (region) => region.minCol === region.maxCol && region.minRow === region.maxRow,
  );
}

export function regionRect(state: { xTracks: number[]; yTracks: number[] }, region: RegionRef) {
  return {
    x: state.xTracks[region.minCol] ?? 0,
    y: state.yTracks[region.minRow] ?? 0,
    width: (state.xTracks[region.maxCol + 1] ?? 0) - (state.xTracks[region.minCol] ?? 0),
    height: (state.yTracks[region.maxRow + 1] ?? 0) - (state.yTracks[region.minRow] ?? 0),
  };
}

export function cellRect(state: { xTracks: number[]; yTracks: number[] }, col: number, row: number) {
  return regionRect(state, { minCol: col, maxCol: col, minRow: row, maxRow: row });
}

function trackIndexAt(value: number, tracks: number[]) {
  return tracks.findIndex((track, index) => {
    if (index === tracks.length - 1) return false;
    const next = tracks[index + 1]!;
    return value >= track && value < next;
  });
}

export function hitTestRegion(state: GridFaceState, px: number, py: number): RegionRef | null {
  const col = trackIndexAt(px, state.xTracks);
  const row = trackIndexAt(py, state.yTracks);
  if (col < 0 || row < 0) return null;
  return (
    listRegions(state).find(
      (region) =>
        col >= region.minCol && col <= region.maxCol && row >= region.minRow && row <= region.maxRow,
    ) ?? null
  );
}

export function hitTestCell(state: GridFaceState, px: number, py: number): RegionRef | null {
  return hitTestRegion(state, px, py);
}

export function regionsInRect(
  state: GridFaceState,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): RegionRef[] {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  return listRegions(state).filter((region) => {
    const rect = regionRect(state, region);
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    return cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
  });
}

export function cellsInRect(
  state: GridFaceState,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): RegionRef[] {
  return regionsInRect(state, x1, y1, x2, y2);
}

export function selectionBBox(state: { xTracks: number[]; yTracks: number[] }, regions: RegionRef[]) {
  if (regions.length === 0) return null;
  let minCol = Infinity;
  let maxCol = -Infinity;
  let minRow = Infinity;
  let maxRow = -Infinity;
  for (const region of regions) {
    minCol = Math.min(minCol, region.minCol);
    maxCol = Math.max(maxCol, region.maxCol);
    minRow = Math.min(minRow, region.minRow);
    maxRow = Math.max(maxRow, region.maxRow);
  }
  const topLeft = regionRect(state, { minCol, maxCol: minCol, minRow, maxRow: minRow });
  const bottomRight = regionRect(state, { minCol: maxCol, maxCol, minRow: maxRow, maxRow });
  const cols: number[] = [];
  const rows: number[] = [];
  for (let col = minCol; col <= maxCol; col += 1) cols.push(col);
  for (let row = minRow; row <= maxRow; row += 1) rows.push(row);
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x + bottomRight.width - topLeft.x,
    height: bottomRight.y + bottomRight.height - topLeft.y,
    cols,
    rows,
  };
}

export function formatTrackSpec(spec: TrackSpec) {
  return spec.mode === "fr" ? `${spec.value}fr` : `${Math.round(spec.value)}px`;
}

export function formatCellSize(width: number, height: number, colSpec?: TrackSpec, rowSpec?: TrackSpec) {
  const widthLabel = colSpec ? formatTrackSpec(colSpec) : `${Math.round(width)}px`;
  const heightLabel = rowSpec ? formatTrackSpec(rowSpec) : `${Math.round(height)}px`;
  return `${widthLabel} × ${heightLabel}`;
}

export function resolveSharedTrackSpec(specs: TrackSpec[]): TrackSpec | "mixed" | null {
  if (specs.length === 0) return null;
  const [first, ...rest] = specs;
  for (const spec of rest) {
    if (spec.mode !== first.mode || spec.value !== first.value) return "mixed";
  }
  return first;
}

export function isRegionInSelection(regions: RegionRef[], target: RegionRef) {
  return regions.some((region) => regionRefsEqual(region, target));
}

export function isCellInSelection(regions: RegionRef[], target: RegionRef) {
  return isRegionInSelection(regions, target);
}

export function toggleRegionSelection(regions: RegionRef[], target: RegionRef) {
  if (isRegionInSelection(regions, target)) {
    return regions.filter((region) => !regionRefsEqual(region, target));
  }
  return [...regions, target];
}

export function toggleCellSelection(regions: RegionRef[], target: RegionRef) {
  return toggleRegionSelection(regions, target);
}

export function unionRegions(regions: RegionRef[]): RegionRef | null {
  if (regions.length === 0) return null;
  let minCol = Infinity;
  let maxCol = -Infinity;
  let minRow = Infinity;
  let maxRow = -Infinity;
  for (const region of regions) {
    minCol = Math.min(minCol, region.minCol);
    maxCol = Math.max(maxCol, region.maxCol);
    minRow = Math.min(minRow, region.minRow);
    maxRow = Math.max(maxRow, region.maxRow);
  }
  return { minCol, maxCol, minRow, maxRow };
}

export function resolvePillPlacement(
  bbox: { x: number; y: number; width: number; height: number },
  gridWidth: number,
  gridHeight: number,
) {
  const pad = 12;
  const pillBlock = 44;
  const placeAltoOnLeft = bbox.x + bbox.width + pad + pillBlock > gridWidth;
  const placeAnchoAbove = bbox.y + bbox.height + pad + pillBlock > gridHeight;

  return {
    alto: placeAltoOnLeft
      ? {
          left: `${((bbox.x) / gridWidth) * 100}%`,
          top: `${((bbox.y + bbox.height / 2) / gridHeight) * 100}%`,
          transform: "translate(calc(-100% - 12px), -50%)",
        }
      : {
          left: `${((bbox.x + bbox.width) / gridWidth) * 100}%`,
          top: `${((bbox.y + bbox.height / 2) / gridHeight) * 100}%`,
          transform: "translate(12px, -50%)",
        },
    ancho: placeAnchoAbove
      ? {
          left: `${((bbox.x + bbox.width / 2) / gridWidth) * 100}%`,
          top: `${((bbox.y) / gridHeight) * 100}%`,
          transform: "translate(-50%, calc(-100% - 12px))",
        }
      : {
          left: `${((bbox.x + bbox.width / 2) / gridWidth) * 100}%`,
          top: `${((bbox.y + bbox.height) / gridHeight) * 100}%`,
          transform: "translate(-50%, 12px)",
        },
  };
}
