import { hitTestRegion, listRegions, parseRegionKey, regionKey, regionRect, type RegionRef } from "./grid-cells";
import {
  createInitialGrid,
  listRenderableSegments,
  resizeGrid,
  type GridSegmentRef,
  type GridState,
} from "./grid-segments";

export type GridScope = string | null;

export type ScopedSegmentRef = {
  scope: GridScope;
  ref: GridSegmentRef;
};

export function cloneGridStateDeep(state: GridState): GridState {
  const nested: Record<string, GridState> = {};
  for (const [key, child] of Object.entries(state.nested ?? {})) {
    nested[key] = cloneGridStateDeep(child);
  }
  return {
    ...state,
    hEdges: new Set(state.hEdges),
    vEdges: new Set(state.vEdges),
    xTracks: [...state.xTracks],
    yTracks: [...state.yTracks],
    colSpecs: [...state.colSpecs],
    rowSpecs: [...state.rowSpecs],
    nested: Object.keys(nested).length > 0 ? nested : undefined,
  };
}

export function getNestedGrid(state: GridState, scope: GridScope): GridState | null {
  if (!scope) return state;
  return state.nested?.[scope] ?? null;
}

export function setNestedGrid(state: GridState, scope: GridScope, nested: GridState): GridState {
  if (!scope) return nested;
  return {
    ...state,
    nested: {
      ...(state.nested ?? {}),
      [scope]: nested,
    },
  };
}

export function updateNestedGrid(
  state: GridState,
  scope: GridScope,
  updater: (grid: GridState) => GridState,
): GridState {
  if (!scope) return updater(state);
  const current = state.nested?.[scope];
  if (!current) return state;
  return setNestedGrid(state, scope, updater(current));
}

export function syncNestedGridSizes(state: GridState): GridState {
  if (!state.nested) return state;
  let next = state;
  for (const [key, nested] of Object.entries(state.nested)) {
    const region = parseRegionKey(key);
    if (!region) continue;
    const rect = regionRect(next, region);
    const w = Math.max(40, Math.round(rect.width));
    const h = Math.max(40, Math.round(rect.height));
    if (nested.width === w && nested.height === h) continue;
    next = setNestedGrid(next, key, resizeGrid(nested, w, h));
  }
  return next;
}

export function createNestedGridInRegion(
  state: GridState,
  region: RegionRef,
): { state: GridState; scope: string } {
  const rect = regionRect(state, region);
  const nested = createInitialGrid(rect.width, rect.height);
  const scope = regionKey(region);
  return {
    state: syncNestedGridSizes(setNestedGrid(state, scope, nested)),
    scope,
  };
}

export function pointInRegion(
  state: { xTracks: number[]; yTracks: number[] },
  region: RegionRef,
  px: number,
  py: number,
) {
  const rect = regionRect(state, region);
  return px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height;
}

export function findNestedScopeAtPoint(state: GridState, px: number, py: number): GridScope {
  if (!state.nested) return null;
  let best: { scope: string; area: number } | null = null;
  for (const key of Object.keys(state.nested)) {
    const region = parseRegionKey(key);
    if (!region || !pointInRegion(state, region, px, py)) continue;
    const rect = regionRect(state, region);
    const area = rect.width * rect.height;
    if (!best || area < best.area) best = { scope: key, area };
  }
  return best?.scope ?? null;
}

export type EditContext = {
  scope: GridScope;
  grid: GridState;
  region: RegionRef | null;
  rect: { x: number; y: number; width: number; height: number } | null;
  localX: number;
  localY: number;
};

export function resolveEditContext(
  root: GridState,
  px: number,
  py: number,
  preferredScope: GridScope = null,
): EditContext {
  const scope = preferredScope ?? findNestedScopeAtPoint(root, px, py);
  if (scope && root.nested?.[scope]) {
    const region = parseRegionKey(scope)!;
    const rect = regionRect(root, region);
    return {
      scope,
      grid: root.nested[scope]!,
      region,
      rect,
      localX: px - rect.x,
      localY: py - rect.y,
    };
  }
  return {
    scope: null,
    grid: root,
    region: null,
    rect: null,
    localX: px,
    localY: py,
  };
}

export function scopedRefsEqual(a: ScopedSegmentRef | null, b: ScopedSegmentRef | null) {
  if (!a || !b) return false;
  return (
    a.scope === b.scope &&
    a.ref.orientation === b.ref.orientation &&
    a.ref.fixedIndex === b.ref.fixedIndex &&
    a.ref.spanIndex === b.ref.spanIndex
  );
}

export type RenderSegment = {
  scope: GridScope;
  ref: GridSegmentRef;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export function listAllRenderSegments(state: GridState): RenderSegment[] {
  const segments: RenderSegment[] = [];

  for (const segment of listRenderableSegments(state)) {
    segments.push({ scope: null, ref: segment.ref, x1: segment.x1, y1: segment.y1, x2: segment.x2, y2: segment.y2 });
  }

  for (const [key, nested] of Object.entries(state.nested ?? {})) {
    const region = parseRegionKey(key);
    if (!region) continue;
    const rect = regionRect(state, region);
    for (const segment of listRenderableSegments(nested)) {
      segments.push({
        scope: key,
        ref: segment.ref,
        x1: segment.x1 + rect.x,
        y1: segment.y1 + rect.y,
        x2: segment.x2 + rect.x,
        y2: segment.y2 + rect.y,
      });
    }
  }

  return segments;
}

export function listRegionsForScope(root: GridState, scope: GridScope): RegionRef[] {
  const scoped = scope ? root.nested?.[scope] : root;
  if (!scoped) return [];
  return listRegions(scoped);
}

export function applyRootGridUpdate(
  root: GridState,
  updater: (grid: GridState) => GridState,
): GridState {
  return syncNestedGridSizes(updater(root));
}

const HIT_TOLERANCE = 8;

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export function detectScopedEdge(
  state: GridState,
  px: number,
  py: number,
  edgeZone: number,
): { scope: GridScope; edge: "left" | "right" | "top" } | null {
  const detect = (x: number, y: number, width: number, height: number) => {
    if (x <= edgeZone && y >= 0 && y <= height) return "left" as const;
    if (x >= width - edgeZone && y >= 0 && y <= height) return "right" as const;
    if (y <= edgeZone && x >= 0 && x <= width) return "top" as const;
    return null;
  };

  const rootEdge = detect(px, py, state.width, state.height);
  if (rootEdge) return { scope: null, edge: rootEdge };

  let best: { scope: string; edge: "left" | "right" | "top"; area: number } | null = null;
  for (const key of Object.keys(state.nested ?? {})) {
    const region = parseRegionKey(key);
    if (!region || !pointInRegion(state, region, px, py)) continue;
    const rect = regionRect(state, region);
    const edge = detect(px - rect.x, py - rect.y, rect.width, rect.height);
    if (!edge) continue;
    const area = rect.width * rect.height;
    if (!best || area < best.area) best = { scope: key, edge, area };
  }

  return best ? { scope: best.scope, edge: best.edge } : null;
}

export function hitTestScopedSegment(root: GridState, px: number, py: number): ScopedSegmentRef | null {
  let best: { scope: GridScope; ref: GridSegmentRef; dist: number } | null = null;

  for (const segment of listAllRenderSegments(root)) {
    const dist = distanceToSegment(px, py, segment.x1, segment.y1, segment.x2, segment.y2);
    if (dist <= HIT_TOLERANCE && (!best || dist < best.dist)) {
      best = { scope: segment.scope, ref: segment.ref, dist };
    }
  }

  return best ? { scope: best.scope, ref: best.ref } : null;
}

export function hitTestScopedRegion(
  root: GridState,
  px: number,
  py: number,
): { scope: GridScope; region: RegionRef } | null {
  const scope = findNestedScopeAtPoint(root, px, py);
  if (scope && root.nested?.[scope]) {
    const region = parseRegionKey(scope)!;
    const rect = regionRect(root, region);
    const nestedRegion = hitTestRegion(root.nested[scope], px - rect.x, py - rect.y);
    if (nestedRegion) return { scope, region: nestedRegion };
  }

  const rootRegion = hitTestRegion(root, px, py);
  if (!rootRegion) return null;
  if (scope && root.nested?.[scope]) {
    const host = parseRegionKey(scope)!;
    if (
      rootRegion.minCol === host.minCol &&
      rootRegion.maxCol === host.maxCol &&
      rootRegion.minRow === host.minRow &&
      rootRegion.maxRow === host.maxRow
    ) {
      return null;
    }
  }
  return { scope: null, region: rootRegion };
}
