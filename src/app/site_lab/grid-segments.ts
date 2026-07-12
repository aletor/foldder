export type GridOrientation = "h" | "v";

export type TrackSpecMode = "fr" | "px";

export type TrackSpec = {
  mode: TrackSpecMode;
  value: number;
};

export type GridSegmentRef = {
  orientation: GridOrientation;
  fixedIndex: number;
  spanIndex: number;
};

export type GridState = {
  width: number;
  height: number;
  xTracks: number[];
  yTracks: number[];
  hEdges: Set<string>;
  vEdges: Set<string>;
  colSpecs: TrackSpec[];
  rowSpecs: TrackSpec[];
  nested?: Record<string, GridState>;
};

const MIN_GAP = 10;
const HIT_TOLERANCE = 8;

export function defaultTrackSpec(mode: TrackSpecMode = "fr", value = 1): TrackSpec {
  return { mode, value };
}

export function layoutTracksFromSpecs(total: number, specs: TrackSpec[]): number[] {
  if (specs.length === 0) return [0, total];
  const minSize = MIN_GAP;

  const sizes = specs.map((spec) =>
    spec.mode === "px" ? Math.max(minSize, Math.round(spec.value)) : 0,
  );
  const fixedTotal = sizes.reduce((acc, size) => acc + size, 0);

  let frTotal = 0;
  const frIndices: number[] = [];
  specs.forEach((spec, index) => {
    if (spec.mode === "fr") {
      frTotal += Math.max(0.1, spec.value);
      frIndices.push(index);
    }
  });

  let remaining = total - fixedTotal;
  if (remaining < minSize * frIndices.length && frIndices.length > 0) {
    remaining = minSize * frIndices.length;
  }

  for (const index of frIndices) {
    const spec = specs[index]!;
    sizes[index] = Math.max(
      minSize,
      Math.round(frTotal > 0 ? (remaining * spec.value) / frTotal : remaining / frIndices.length),
    );
  }

  if (frIndices.length === 0) {
    const drift = total - sizes.reduce((acc, size) => acc + size, 0);
    sizes[sizes.length - 1] = Math.max(minSize, sizes[sizes.length - 1]! + drift);
  } else {
    const drift = total - sizes.reduce((acc, size) => acc + size, 0);
    const lastFr = frIndices[frIndices.length - 1]!;
    sizes[lastFr] = Math.max(minSize, sizes[lastFr]! + drift);
  }

  const tracks = [0];
  for (const size of sizes) tracks.push(tracks[tracks.length - 1]! + size);
  tracks[tracks.length - 1] = total;
  return tracks;
}

export function axisHasFixedPx(specs: TrackSpec[]): boolean {
  return specs.some((spec) => spec.mode === "px");
}

export function resolveContentAxis(viewport: number, specs: TrackSpec[]): number {
  const viewportMin = Math.max(40, Math.round(viewport));
  if (!axisHasFixedPx(specs)) return viewportMin;

  const minSize = MIN_GAP;
  let fixedPx = 0;
  let frCount = 0;
  for (const spec of specs) {
    if (spec.mode === "px") fixedPx += Math.max(minSize, Math.round(spec.value));
    else frCount += 1;
  }
  return Math.max(viewportMin, fixedPx + frCount * minSize);
}

export function applyGridLayout(
  state: GridState,
  viewport?: { width: number; height: number },
): GridState {
  const viewportW = viewport?.width ?? state.width;
  const viewportH = viewport?.height ?? state.height;
  const width = resolveContentAxis(viewportW, state.colSpecs);
  const height = resolveContentAxis(viewportH, state.rowSpecs);
  return {
    ...state,
    width,
    height,
    xTracks: layoutTracksFromSpecs(width, state.colSpecs),
    yTracks: layoutTracksFromSpecs(height, state.rowSpecs),
  };
}

export function specsFromTracks(tracks: number[], specs: TrackSpec[]): TrackSpec[] {
  return tracks.slice(0, -1).map((start, index) => {
    const size = tracks[index + 1]! - start;
    const prev = specs[index];
    if (prev?.mode === "fr") return { mode: "fr", value: prev.value };
    return { mode: "px", value: size };
  });
}

function splitTrackSpec(spec: TrackSpec, ratio: number): [TrackSpec, TrackSpec] {
  if (spec.mode === "px") {
    const left = Math.max(MIN_GAP, Math.round(spec.value * ratio));
    const right = Math.max(MIN_GAP, Math.round(spec.value * (1 - ratio)));
    return [{ mode: "px", value: left }, { mode: "px", value: right }];
  }
  return [
    { mode: "fr", value: spec.value },
    { mode: "fr", value: spec.value },
  ];
}

export function updateColSpecs(
  state: GridState,
  cols: number[],
  spec: TrackSpec,
  viewport?: { width: number; height: number },
): GridState {
  const colSpecs = [...state.colSpecs];
  for (const col of cols) {
    if (col >= 0 && col < colSpecs.length) colSpecs[col] = { ...spec };
  }
  return applyGridLayout({ ...state, colSpecs }, viewport);
}

export function updateRowSpecs(
  state: GridState,
  rows: number[],
  spec: TrackSpec,
  viewport?: { width: number; height: number },
): GridState {
  const rowSpecs = [...state.rowSpecs];
  for (const row of rows) {
    if (row >= 0 && row < rowSpecs.length) rowSpecs[row] = { ...spec };
  }
  return applyGridLayout({ ...state, rowSpecs }, viewport);
}

export function syncSpecsAfterVerticalMove(state: GridState, trackIndex: number): GridState {
  const colSpecs = [...state.colSpecs];
  const left = trackIndex - 1;
  const right = trackIndex;
  if (left >= 0 && left < colSpecs.length && colSpecs[left]?.mode === "px") {
    colSpecs[left] = { mode: "px", value: state.xTracks[trackIndex]! - state.xTracks[left]! };
  }
  if (right >= 0 && right < colSpecs.length && colSpecs[right]?.mode === "px") {
    colSpecs[right] = { mode: "px", value: state.xTracks[trackIndex + 1]! - state.xTracks[trackIndex]! };
  }
  return { ...state, colSpecs };
}

export function syncSpecsAfterHorizontalMove(state: GridState, trackIndex: number): GridState {
  const rowSpecs = [...state.rowSpecs];
  const top = trackIndex - 1;
  const bottom = trackIndex;
  if (top >= 0 && top < rowSpecs.length && rowSpecs[top]?.mode === "px") {
    rowSpecs[top] = { mode: "px", value: state.yTracks[trackIndex]! - state.yTracks[top]! };
  }
  if (bottom >= 0 && bottom < rowSpecs.length && rowSpecs[bottom]?.mode === "px") {
    rowSpecs[bottom] = { mode: "px", value: state.yTracks[trackIndex + 1]! - state.yTracks[trackIndex]! };
  }
  return { ...state, rowSpecs };
}

export function hKey(yIdx: number, xIdx: number) {
  return `h|${yIdx}|${xIdx}`;
}

export function vKey(xIdx: number, yIdx: number) {
  return `v|${xIdx}|${yIdx}`;
}

export function parseEdgeKey(key: string): GridSegmentRef | null {
  const [kind, fixedStr, spanStr] = key.split("|");
  if (kind === "h") return { orientation: "h", fixedIndex: Number(fixedStr), spanIndex: Number(spanStr) };
  if (kind === "v") return { orientation: "v", fixedIndex: Number(fixedStr), spanIndex: Number(spanStr) };
  return null;
}

export function segmentRefToKey(ref: GridSegmentRef) {
  return ref.orientation === "h" ? hKey(ref.fixedIndex, ref.spanIndex) : vKey(ref.fixedIndex, ref.spanIndex);
}

export function createInitialGrid(width: number, height: number): GridState {
  const w = Math.max(40, Math.round(width));
  const h = Math.max(40, Math.round(height));
  return applyGridLayout(
    {
      width: w,
      height: h,
      xTracks: [0, w],
      yTracks: [0, h],
      hEdges: new Set([hKey(0, 0), hKey(1, 0)]),
      vEdges: new Set([vKey(0, 0), vKey(1, 0)]),
      colSpecs: [defaultTrackSpec()],
      rowSpecs: [defaultTrackSpec()],
    },
    { width: w, height: h },
  );
}

export function resizeGrid(state: GridState, viewportWidth: number, viewportHeight: number): GridState {
  const w = Math.max(40, Math.round(viewportWidth));
  const h = Math.max(40, Math.round(viewportHeight));
  const next = applyGridLayout(state, { width: w, height: h });
  if (!next.nested) return next;
  const nested: Record<string, GridState> = {};
  for (const [key, child] of Object.entries(next.nested)) {
    nested[key] = child;
  }
  return { ...next, nested };
}

function shiftHorizontalEdges(hEdges: Set<string>, insertXIdx: number, oldXLen: number, yCount: number) {
  const next = new Set<string>();
  for (let yIdx = 0; yIdx < yCount; yIdx += 1) {
    for (let xIdx = 0; xIdx < oldXLen - 1; xIdx += 1) {
      const key = hKey(yIdx, xIdx);
      if (!hEdges.has(key)) continue;
      if (xIdx >= insertXIdx) next.add(hKey(yIdx, xIdx + 1));
      else if (xIdx === insertXIdx - 1) {
        next.add(hKey(yIdx, xIdx));
        next.add(hKey(yIdx, xIdx + 1));
      } else next.add(hKey(yIdx, xIdx));
    }
  }
  return next;
}

function shiftVerticalEdges(vEdges: Set<string>, insertXIdx: number) {
  const next = new Set<string>();
  for (const key of vEdges) {
    const ref = parseEdgeKey(key);
    if (!ref || ref.orientation !== "v") continue;
    const xIdx = ref.fixedIndex >= insertXIdx ? ref.fixedIndex + 1 : ref.fixedIndex;
    next.add(vKey(xIdx, ref.spanIndex));
  }
  return next;
}

function shiftVerticalEdgesForHorizontalInsert(vEdges: Set<string>, insertYIdx: number, oldYLen: number, xCount: number) {
  const next = new Set<string>();
  for (let xIdx = 0; xIdx < xCount; xIdx += 1) {
    for (let yIdx = 0; yIdx < oldYLen - 1; yIdx += 1) {
      const key = vKey(xIdx, yIdx);
      if (!vEdges.has(key)) continue;
      if (yIdx >= insertYIdx) next.add(vKey(xIdx, yIdx + 1));
      else if (yIdx === insertYIdx - 1) {
        next.add(vKey(xIdx, yIdx));
        next.add(vKey(xIdx, yIdx + 1));
      } else next.add(vKey(xIdx, yIdx));
    }
  }
  return next;
}

function shiftHorizontalEdgesForHorizontalInsert(hEdges: Set<string>, insertYIdx: number) {
  const next = new Set<string>();
  for (const key of hEdges) {
    const ref = parseEdgeKey(key);
    if (!ref || ref.orientation !== "h") continue;
    const yIdx = ref.fixedIndex >= insertYIdx ? ref.fixedIndex + 1 : ref.fixedIndex;
    next.add(hKey(yIdx, ref.spanIndex));
  }
  return next;
}

export function addVerticalLine(state: GridState, x: number): GridState {
  const clamped = Math.round(Math.max(MIN_GAP, Math.min(state.width - MIN_GAP, x)));
  if (state.xTracks.some((track) => Math.abs(track - clamped) < MIN_GAP)) return state;

  const insertIdx = state.xTracks.findIndex((track) => track > clamped);
  const splitIndex = Math.max(0, insertIdx - 1);
  const splitRatio =
    insertIdx > 0
      ? (clamped - state.xTracks[splitIndex]!) /
        Math.max(1, state.xTracks[insertIdx]! - state.xTracks[splitIndex]!)
      : 0.5;
  const baseSpec = state.colSpecs[splitIndex] ?? defaultTrackSpec();
  const [leftSpec, rightSpec] = splitTrackSpec(baseSpec, splitRatio);
  const colSpecs = [
    ...state.colSpecs.slice(0, splitIndex),
    leftSpec,
    rightSpec,
    ...state.colSpecs.slice(splitIndex + 1),
  ];
  const newXTracks = [...state.xTracks.slice(0, insertIdx), clamped, ...state.xTracks.slice(insertIdx)];
  const oldXLen = state.xTracks.length;

  let hEdges = shiftHorizontalEdges(state.hEdges, insertIdx, oldXLen, state.yTracks.length);
  let vEdges = shiftVerticalEdges(state.vEdges, insertIdx);
  for (let yIdx = 0; yIdx < state.yTracks.length - 1; yIdx += 1) {
    vEdges.add(vKey(insertIdx, yIdx));
  }

  return {
    ...state,
    xTracks: newXTracks,
    colSpecs,
    hEdges,
    vEdges,
  };
}

export function addHorizontalLine(state: GridState, y: number): GridState {
  const clamped = Math.round(Math.max(MIN_GAP, Math.min(state.height - MIN_GAP, y)));
  if (state.yTracks.some((track) => Math.abs(track - clamped) < MIN_GAP)) return state;

  const insertIdx = state.yTracks.findIndex((track) => track > clamped);
  const splitIndex = Math.max(0, insertIdx - 1);
  const splitRatio =
    insertIdx > 0
      ? (clamped - state.yTracks[splitIndex]!) /
        Math.max(1, state.yTracks[insertIdx]! - state.yTracks[splitIndex]!)
      : 0.5;
  const baseSpec = state.rowSpecs[splitIndex] ?? defaultTrackSpec();
  const [topSpec, bottomSpec] = splitTrackSpec(baseSpec, splitRatio);
  const rowSpecs = [
    ...state.rowSpecs.slice(0, splitIndex),
    topSpec,
    bottomSpec,
    ...state.rowSpecs.slice(splitIndex + 1),
  ];
  const newYTracks = [...state.yTracks.slice(0, insertIdx), clamped, ...state.yTracks.slice(insertIdx)];
  const oldYLen = state.yTracks.length;

  let vEdges = shiftVerticalEdgesForHorizontalInsert(state.vEdges, insertIdx, oldYLen, state.xTracks.length);
  let hEdges = shiftHorizontalEdgesForHorizontalInsert(state.hEdges, insertIdx);
  for (let xIdx = 0; xIdx < state.xTracks.length - 1; xIdx += 1) {
    hEdges.add(hKey(insertIdx, xIdx));
  }

  return {
    ...state,
    yTracks: newYTracks,
    rowSpecs,
    hEdges,
    vEdges,
  };
}

export function isMovableTrack(state: GridState, orientation: GridOrientation, trackIndex: number) {
  if (orientation === "v") return trackIndex > 0 && trackIndex < state.xTracks.length - 1;
  return trackIndex > 0 && trackIndex < state.yTracks.length - 1;
}

export function movableLineFromSegment(state: GridState, ref: GridSegmentRef): GridSegmentRef | null {
  if (!isMovableTrack(state, ref.orientation, ref.fixedIndex)) return null;
  return ref;
}

export function moveVerticalLine(state: GridState, xIdx: number, x: number): GridState {
  if (!isMovableTrack(state, "v", xIdx)) return state;
  const minX = state.xTracks[xIdx - 1]! + MIN_GAP;
  const maxX = state.xTracks[xIdx + 1]! - MIN_GAP;
  if (minX > maxX) return state;
  const clamped = Math.round(Math.max(minX, Math.min(maxX, x)));
  const xTracks = [...state.xTracks];
  xTracks[xIdx] = clamped;
  return { ...state, xTracks };
}

export function moveHorizontalLine(state: GridState, yIdx: number, y: number): GridState {
  if (!isMovableTrack(state, "h", yIdx)) return state;
  const minY = state.yTracks[yIdx - 1]! + MIN_GAP;
  const maxY = state.yTracks[yIdx + 1]! - MIN_GAP;
  if (minY > maxY) return state;
  const clamped = Math.round(Math.max(minY, Math.min(maxY, y)));
  const yTracks = [...state.yTracks];
  yTracks[yIdx] = clamped;
  return { ...state, yTracks };
}

export function deleteSegment(state: GridState, ref: GridSegmentRef): GridState {
  const key = segmentRefToKey(ref);
  if (ref.orientation === "h") {
    if (!state.hEdges.has(key)) return state;
    const hEdges = new Set(state.hEdges);
    hEdges.delete(key);
    return { ...state, hEdges };
  }
  if (!state.vEdges.has(key)) return state;
  const vEdges = new Set(state.vEdges);
  vEdges.delete(key);
  return { ...state, vEdges };
}

export function segmentEndpoints(state: GridState, ref: GridSegmentRef) {
  if (ref.orientation === "h") {
    const y = state.yTracks[ref.fixedIndex] ?? 0;
    const x1 = state.xTracks[ref.spanIndex] ?? 0;
    const x2 = state.xTracks[ref.spanIndex + 1] ?? state.width;
    return { x1, y1: y, x2, y2: y };
  }
  const x = state.xTracks[ref.fixedIndex] ?? 0;
  const y1 = state.yTracks[ref.spanIndex] ?? 0;
  const y2 = state.yTracks[ref.spanIndex + 1] ?? state.height;
  return { x1: x, y1, x2: x, y2 };
}

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export function hitTestSegment(state: GridState, px: number, py: number): GridSegmentRef | null {
  let best: { ref: GridSegmentRef; dist: number } | null = null;

  for (const key of state.hEdges) {
    const ref = parseEdgeKey(key);
    if (!ref) continue;
    const { x1, y1, x2, y2 } = segmentEndpoints(state, ref);
    const dist = distanceToSegment(px, py, x1, y1, x2, y2);
    if (dist <= HIT_TOLERANCE && (!best || dist < best.dist)) best = { ref, dist };
  }

  for (const key of state.vEdges) {
    const ref = parseEdgeKey(key);
    if (!ref) continue;
    const { x1, y1, x2, y2 } = segmentEndpoints(state, ref);
    const dist = distanceToSegment(px, py, x1, y1, x2, y2);
    if (dist <= HIT_TOLERANCE && (!best || dist < best.dist)) best = { ref, dist };
  }

  return best?.ref ?? null;
}

export function listRenderableSegments(state: GridState) {
  const segments: Array<{ ref: GridSegmentRef; x1: number; y1: number; x2: number; y2: number }> = [];
  for (const key of state.hEdges) {
    const ref = parseEdgeKey(key);
    if (!ref) continue;
    segments.push({ ref, ...segmentEndpoints(state, ref) });
  }
  for (const key of state.vEdges) {
    const ref = parseEdgeKey(key);
    if (!ref) continue;
    segments.push({ ref, ...segmentEndpoints(state, ref) });
  }
  return segments;
}

export function refsEqual(a: GridSegmentRef | null, b: GridSegmentRef | null) {
  if (!a || !b) return false;
  return a.orientation === b.orientation && a.fixedIndex === b.fixedIndex && a.spanIndex === b.spanIndex;
}
