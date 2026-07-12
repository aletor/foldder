"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cellsInRect,
  formatCellSize,
  isRegionInSelection,
  parseRegionKey,
  regionKey,
  regionRect,
  resolveSizingBarPlacement,
  resolveSharedTrackSpec,
  toggleRegionSelection,
  unionRegions,
  type RegionRef,
} from "./grid-cells";
import { GridSelectionSizingBar } from "./GridSizingPill";
import {
  isFluidViewport,
  VIEWPORT_ORDER,
  VIEWPORT_PRESETS,
  type ViewportPreset,
} from "./grid-viewports";
import {
  applyRootGridUpdate,
  cloneGridStateDeep,
  createNestedGridInRegion,
  deleteGridAtScope,
  detectScopedEdge,
  hitTestScopedRegion,
  hitTestScopedSegment,
  isFullGridSelection,
  listAllRenderSegments,
  listRegionsForScope,
  resolveEditContext,
  scopedRefsEqual,
  updateNestedGrid,
  type GridScope,
  type RenderSegment,
  type ScopedSegmentRef,
} from "./grid-nested";
import {
  addHorizontalLine,
  addVerticalLine,
  axisHasFixedPx,
  createInitialGrid,
  deleteSegment,
  moveHorizontalLine,
  moveVerticalLine,
  movableLineFromSegment,
  resizeGrid,
  syncSpecsAfterHorizontalMove,
  syncSpecsAfterVerticalMove,
  updateColSpecs,
  updateRowSpecs,
  type GridState,
  type TrackSpec,
} from "./grid-segments";

const EDGE_ZONE = 12;
const DRAG_THRESHOLD = 4;
const DOUBLE_CLICK_MS = 400;
const TOOLBAR_BLOCK = 44;

type DragMode =
  | { kind: "add-vertical"; position: number; scope: GridScope }
  | { kind: "add-horizontal"; position: number; scope: GridScope }
  | { kind: "move-vertical"; trackIndex: number; scope: GridScope }
  | { kind: "move-horizontal"; trackIndex: number; scope: GridScope }
  | { kind: "marquee"; x1: number; y1: number; x2: number; y2: number; scope: GridScope };

type PendingPointer = {
  x: number;
  y: number;
  localX: number;
  localY: number;
  scope: GridScope;
  edge: "left" | "right" | "top" | null;
  hit: ScopedSegmentRef | null;
  region: RegionRef | null;
  shiftKey: boolean;
};

function nestedDisplayRect(root: GridState, scope: GridScope, region: RegionRef) {
  if (!scope) return regionRect(root, region);
  const parentRegion = parseRegionKey(scope);
  const nested = root.nested?.[scope];
  if (!parentRegion || !nested) return regionRect(root, region);
  const parentRect = regionRect(root, parentRegion);
  const local = regionRect(nested, region);
  return {
    x: parentRect.x + local.x,
    y: parentRect.y + local.y,
    width: local.width,
    height: local.height,
  };
}

function selectionBBoxDisplay(root: GridState, scope: GridScope, regions: RegionRef[]) {
  if (regions.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const cols = new Set<number>();
  const rows = new Set<number>();
  for (const region of regions) {
    const rect = nestedDisplayRect(root, scope, region);
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
    for (let col = region.minCol; col <= region.maxCol; col += 1) cols.add(col);
    for (let row = region.minRow; row <= region.maxRow; row += 1) rows.add(row);
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    cols: [...cols],
    rows: [...rows],
  };
}

function renderCanvasContent({
  grid,
  activeScope,
  selectedRegions,
  hoverRegion,
  bbox,
  segments,
  selectedSegment,
  drag,
}: {
  grid: GridState | null;
  activeScope: GridScope;
  selectedRegions: RegionRef[];
  hoverRegion: RegionRef | null;
  bbox: ReturnType<typeof selectionBBoxDisplay>;
  segments: RenderSegment[];
  selectedSegment: ScopedSegmentRef | null;
  drag: DragMode | null;
}) {
  if (!grid) {
    return <p className="site-lab-grid__hint">Pulsa + para crear el grid inicial de la página.</p>;
  }

  const activeNested = activeScope ? grid.nested?.[activeScope] : null;
  const editGrid = activeNested ?? grid;

  return (
    <svg className="site-lab-grid__svg" viewBox={`0 0 ${grid.width} ${grid.height}`} preserveAspectRatio="none" aria-hidden>
      {activeScope && activeNested
        ? (() => {
            const region = parseRegionKey(activeScope);
            if (!region) return null;
            const rect = regionRect(grid, region);
            return (
              <rect
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                className="site-lab-grid__nested-host"
              />
            );
          })()
        : null}
      {selectedRegions.map((region) => {
        const rect = nestedDisplayRect(grid, activeScope, region);
        const colSpecValue = resolveSharedTrackSpec(
          Array.from({ length: region.maxCol - region.minCol + 1 }, (_, index) =>
            editGrid.colSpecs[region.minCol + index]!,
          ),
        );
        const rowSpecValue = resolveSharedTrackSpec(
          Array.from({ length: region.maxRow - region.minRow + 1 }, (_, index) =>
            editGrid.rowSpecs[region.minRow + index]!,
          ),
        );
        const colLabel = colSpecValue && colSpecValue !== "mixed" ? colSpecValue : undefined;
        const rowLabel = rowSpecValue && rowSpecValue !== "mixed" ? rowSpecValue : undefined;
        return (
          <g key={regionKey(region)}>
            <rect
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              className="site-lab-grid__cell-fill is-selected"
            />
            <text x={rect.x + rect.width / 2} y={rect.y + rect.height / 2} className="site-lab-grid__cell-label">
              {formatCellSize(rect.width, rect.height, colLabel, rowLabel)}
            </text>
          </g>
        );
      })}
      {hoverRegion && !isRegionInSelection(selectedRegions, hoverRegion) ? (
        <rect {...nestedDisplayRect(grid, activeScope, hoverRegion)} className="site-lab-grid__cell-fill is-hover" />
      ) : null}
      {bbox ? (
        <rect
          x={bbox.x}
          y={bbox.y}
          width={bbox.width}
          height={bbox.height}
          className="site-lab-grid__selection-bbox"
        />
      ) : null}
      {segments.map(({ scope, ref, x1, y1, x2, y2 }) => {
        const isSelected = scopedRefsEqual(selectedSegment, { scope, ref });
        const isNested = scope !== null;
        return (
          <line
            key={`${scope ?? "root"}-${ref.orientation}-${ref.fixedIndex}-${ref.spanIndex}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            className={`site-lab-grid__line${isNested ? " is-nested" : ""}${isSelected ? " is-selected" : ""}`}
          />
        );
      })}
      {drag?.kind === "add-vertical"
        ? (() => {
            if (drag.scope) {
              const region = parseRegionKey(drag.scope);
              if (!region) return null;
              const rect = regionRect(grid, region);
              const x = rect.x + drag.position;
              return (
                <line x1={x} y1={rect.y} x2={x} y2={rect.y + rect.height} className="site-lab-grid__preview is-nested" />
              );
            }
            const x = Math.max(0, Math.min(grid.width, drag.position));
            return <line x1={x} y1={0} x2={x} y2={grid.height} className="site-lab-grid__preview" />;
          })()
        : null}
      {drag?.kind === "add-horizontal"
        ? (() => {
            if (drag.scope) {
              const region = parseRegionKey(drag.scope);
              if (!region) return null;
              const rect = regionRect(grid, region);
              const y = rect.y + drag.position;
              return (
                <line
                  x1={rect.x}
                  y1={y}
                  x2={rect.x + rect.width}
                  y2={y}
                  className="site-lab-grid__preview is-nested"
                />
              );
            }
            const y = Math.max(0, Math.min(grid.height, drag.position));
            return <line x1={0} y1={y} x2={grid.width} y2={y} className="site-lab-grid__preview" />;
          })()
        : null}
      {drag?.kind === "marquee" ? (
        <rect
          x={Math.min(drag.x1, drag.x2)}
          y={Math.min(drag.y1, drag.y2)}
          width={Math.abs(drag.x2 - drag.x1)}
          height={Math.abs(drag.y2 - drag.y1)}
          className="site-lab-grid__marquee"
        />
      ) : null}
    </svg>
  );
}

export function GridEditor() {
  const shellRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<PendingPointer | null>(null);
  const lastLineClickRef = useRef<{ segment: ScopedSegmentRef; time: number } | null>(null);
  const [grid, setGrid] = useState<GridState | null>(null);
  const [activeScope, setActiveScope] = useState<GridScope>(null);
  const [selectedSegment, setSelectedSegment] = useState<ScopedSegmentRef | null>(null);
  const [selectedRegions, setSelectedRegions] = useState<RegionRef[]>([]);
  const [drag, setDrag] = useState<DragMode | null>(null);
  const [hoverEdge, setHoverEdge] = useState<"left" | "right" | "top" | null>(null);
  const [hoverLine, setHoverLine] = useState<ScopedSegmentRef | null>(null);
  const [hoverRegion, setHoverRegion] = useState<RegionRef | null>(null);
  const [viewport, setViewport] = useState<ViewportPreset>("desktop");
  const [fitScale, setFitScale] = useState(1);
  const [fluidSize, setFluidSize] = useState({ width: 1080, height: 800 });

  const isDesktop = isFluidViewport(viewport);
  const deviceSize = VIEWPORT_PRESETS[viewport];
  const viewportSize = isDesktop ? fluidSize : deviceSize;
  const colFluid = grid ? !axisHasFixedPx(grid.colSpecs) : true;
  const rowFluid = grid ? !axisHasFixedPx(grid.rowSpecs) : true;
  const canvasWidth = grid?.width ?? viewportSize.width;
  const canvasHeight = grid?.height ?? viewportSize.height;
  const canvasStyle = grid
    ? {
        width: colFluid ? "100%" : canvasWidth,
        height: rowFluid ? "100%" : canvasHeight,
        ...(colFluid ? {} : { minWidth: viewportSize.width }),
        ...(rowFluid ? {} : { minHeight: viewportSize.height }),
      }
    : undefined;

  const syncLayout = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;

    if (isFluidViewport(viewport)) {
      const width = Math.max(40, shell.clientWidth);
      const height = Math.max(40, shell.clientHeight);
      setFluidSize({ width, height });
      setFitScale(1);
      setGrid((prev) => (prev ? applyRootGridUpdate(prev, (g) => resizeGrid(g, width, height)) : prev));
      return;
    }

    const preset = VIEWPORT_PRESETS[viewport];
    const scale = Math.min(1, shell.clientWidth / preset.width, shell.clientHeight / preset.height);
    setFitScale(Math.max(0.25, scale));
  }, [viewport]);

  useEffect(() => {
    syncLayout();
    const shell = shellRef.current;
    if (!shell) return undefined;
    const ro = new ResizeObserver(() => syncLayout());
    ro.observe(shell);
    return () => ro.disconnect();
  }, [syncLayout]);

  const resolveCreateSize = useCallback(() => {
    const shell = shellRef.current;
    if (isFluidViewport(viewport) && shell) {
      return { width: Math.max(40, shell.clientWidth), height: Math.max(40, shell.clientHeight) };
    }
    const preset = VIEWPORT_PRESETS[viewport];
    return { width: preset.width, height: preset.height };
  }, [viewport]);

  const applyViewport = useCallback(
    (next: ViewportPreset) => {
      setViewport(next);
      const shell = shellRef.current;
      if (isFluidViewport(next) && shell) {
        const width = Math.max(40, shell.clientWidth);
        const height = Math.max(40, shell.clientHeight);
        setGrid((prev) => (prev ? applyRootGridUpdate(prev, (g) => resizeGrid(g, width, height)) : prev));
        return;
      }
      const size = VIEWPORT_PRESETS[next];
      setGrid((prev) => (prev ? applyRootGridUpdate(prev, (g) => resizeGrid(g, size.width, size.height)) : prev));
    },
    [],
  );

  const handleCreateGrid = () => {
    if (!grid) {
      const size = resolveCreateSize();
      setGrid(createInitialGrid(size.width, size.height));
      setActiveScope(null);
      setSelectedSegment(null);
      setSelectedRegions([]);
      setDrag(null);
      pendingRef.current = null;
      return;
    }

    const target = unionRegions(selectedRegions);
    if (!target) return;

    const { state: next, scope } = createNestedGridInRegion(grid, target);
    setGrid(cloneGridStateDeep(next));
    setActiveScope(scope);
    setSelectedSegment(null);
    setSelectedRegions([]);
    setDrag(null);
    pendingRef.current = null;
  };

  const createGridTitle = !grid
    ? "Crear grid"
    : activeScope
      ? "Sal del grid anidado (Escape) para crear otro"
    : selectedRegions.length > 0
      ? "Crear grid anidado dentro de la selección"
      : "Selecciona un recuadro primero";

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.target as HTMLElement).closest("input, textarea, [contenteditable=true]")) return;

      if (event.key === "Escape") {
        setSelectedRegions([]);
        setSelectedSegment(null);
        setActiveScope(null);
        lastLineClickRef.current = null;
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && grid) {
        if (selectedSegment) {
          event.preventDefault();
          setGrid(
            cloneGridStateDeep(
              selectedSegment.scope
                ? updateNestedGrid(grid, selectedSegment.scope, (scoped) =>
                    deleteSegment(scoped, selectedSegment.ref),
                  )
                : applyRootGridUpdate(grid, (scoped) => deleteSegment(scoped, selectedSegment.ref)),
            ),
          );
          setSelectedSegment(null);
          return;
        }

        if (
          selectedRegions.length > 0 &&
          isFullGridSelection(grid, activeScope, selectedRegions)
        ) {
          event.preventDefault();
          if (activeScope) {
            setGrid(cloneGridStateDeep(deleteGridAtScope(grid, activeScope)!));
            setActiveScope(null);
          } else {
            setGrid(null);
          }
          setSelectedRegions([]);
          lastLineClickRef.current = null;
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [grid, selectedSegment, selectedRegions, activeScope]);

  const fallbackSize = isDesktop ? fluidSize : deviceSize;

  const localPoint = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      const wrap = canvas?.parentElement;
      const rect = canvas?.getBoundingClientRect();
      if (!rect || !canvas) return null;
      const logicW = grid?.width ?? fallbackSize.width;
      const logicH = grid?.height ?? fallbackSize.height;
      const scaleX = logicW > 0 ? rect.width / logicW : 1;
      const scaleY = logicH > 0 ? rect.height / logicH : 1;
      return {
        x: (clientX - rect.left) / scaleX + (wrap?.scrollLeft ?? 0) / scaleX,
        y: (clientY - rect.top) / scaleY + (wrap?.scrollTop ?? 0) / scaleY,
      };
    },
    [grid, fallbackSize],
  );

  const clearRegionSelection = () => setSelectedRegions([]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!grid || drag) return;
    if ((event.target as HTMLElement).closest(".site-lab-grid__sizing-bar, .site-lab-grid__pill-field")) return;

    const point = localPoint(event.clientX, event.clientY);
    if (!point) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    const segmentHit = hitTestScopedSegment(grid, point.x, point.y);
    const edgeHit = segmentHit ? null : detectScopedEdge(grid, point.x, point.y, EDGE_ZONE);
    const scope = segmentHit?.scope ?? edgeHit?.scope ?? null;
    const ctx = resolveEditContext(grid, point.x, point.y, scope);
    const regionHit = hitTestScopedRegion(grid, point.x, point.y);
    pendingRef.current = {
      x: point.x,
      y: point.y,
      localX: ctx.localX,
      localY: ctx.localY,
      scope,
      edge: edgeHit?.edge ?? null,
      hit: segmentHit,
      region: regionHit?.region ?? null,
      shiftKey: event.shiftKey,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!grid) return;
    const point = localPoint(event.clientX, event.clientY);
    if (!point) return;

    if (drag?.kind === "move-vertical") {
      const ctx = resolveEditContext(grid, point.x, point.y, drag.scope);
      const x = drag.scope ? ctx.localX : point.x;
      setGrid((prev) => {
        if (!prev) return prev;
        return cloneGridStateDeep(
          updateNestedGrid(prev, drag.scope, (scoped) => moveVerticalLine(scoped, drag.trackIndex, x)),
        );
      });
      return;
    }

    if (drag?.kind === "move-horizontal") {
      const ctx = resolveEditContext(grid, point.x, point.y, drag.scope);
      const y = drag.scope ? ctx.localY : point.y;
      setGrid((prev) => {
        if (!prev) return prev;
        return cloneGridStateDeep(
          updateNestedGrid(prev, drag.scope, (scoped) => moveHorizontalLine(scoped, drag.trackIndex, y)),
        );
      });
      return;
    }

    if (drag?.kind === "add-vertical") {
      const ctx = resolveEditContext(grid, point.x, point.y, drag.scope);
      setDrag({ kind: "add-vertical", position: drag.scope ? ctx.localX : point.x, scope: drag.scope });
      return;
    }

    if (drag?.kind === "add-horizontal") {
      const ctx = resolveEditContext(grid, point.x, point.y, drag.scope);
      setDrag({ kind: "add-horizontal", position: drag.scope ? ctx.localY : point.y, scope: drag.scope });
      return;
    }

    if (drag?.kind === "marquee") {
      setDrag({ ...drag, x2: point.x, y2: point.y });
      return;
    }

    const pending = pendingRef.current;
    if (pending) {
      const dx = point.x - pending.x;
      const dy = point.y - pending.y;
      if (Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
        const ctx = resolveEditContext(grid, point.x, point.y, pending.scope);
        if (pending.edge === "left" || pending.edge === "right") {
          setActiveScope(pending.scope);
          setDrag({
            kind: "add-vertical",
            position: pending.scope ? ctx.localX : point.x,
            scope: pending.scope,
          });
          pendingRef.current = null;
          setSelectedSegment(null);
          clearRegionSelection();
          return;
        }
        if (pending.edge === "top") {
          setActiveScope(pending.scope);
          setDrag({
            kind: "add-horizontal",
            position: pending.scope ? ctx.localY : point.y,
            scope: pending.scope,
          });
          pendingRef.current = null;
          setSelectedSegment(null);
          clearRegionSelection();
          return;
        }

        const scopedGrid = pending.scope ? grid.nested?.[pending.scope] : grid;
        const movable =
          pending.hit && scopedGrid ? movableLineFromSegment(scopedGrid, pending.hit.ref) : null;
        if (movable) {
          setActiveScope(pending.scope);
          setDrag({
            kind: movable.orientation === "v" ? "move-vertical" : "move-horizontal",
            trackIndex: movable.fixedIndex,
            scope: pending.scope,
          });
          pendingRef.current = null;
          setSelectedSegment(null);
          clearRegionSelection();
          return;
        }

        if (!pending.hit) {
          setActiveScope(pending.scope);
          setDrag({
            kind: "marquee",
            x1: pending.x,
            y1: pending.y,
            x2: point.x,
            y2: point.y,
            scope: pending.scope,
          });
          pendingRef.current = null;
          return;
        }
      }
    }

    const segmentHit = hitTestScopedSegment(grid, point.x, point.y);
    if (segmentHit) {
      const scopedGrid = segmentHit.scope ? grid.nested?.[segmentHit.scope] : grid;
      setHoverLine(
        scopedGrid && movableLineFromSegment(scopedGrid, segmentHit.ref) ? segmentHit : null,
      );
      setHoverEdge(null);
      setHoverRegion(null);
      return;
    }

    const edgeHit = detectScopedEdge(grid, point.x, point.y, EDGE_ZONE);
    setHoverEdge(edgeHit?.edge ?? null);
    if (edgeHit) {
      setHoverLine(null);
      setHoverRegion(null);
      return;
    }

    setHoverLine(null);
    setHoverRegion(hitTestScopedRegion(grid, point.x, point.y)?.region ?? null);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!grid) return;
    const point = localPoint(event.clientX, event.clientY);

    if (drag?.kind === "add-vertical" && point) {
      const ctx = resolveEditContext(grid, point.x, point.y, drag.scope);
      const x = drag.scope ? ctx.localX : point.x;
      setGrid(
        cloneGridStateDeep(
          applyRootGridUpdate(grid, (root) => updateNestedGrid(root, drag.scope, (scoped) => addVerticalLine(scoped, x))),
        ),
      );
    } else if (drag?.kind === "add-horizontal" && point) {
      const ctx = resolveEditContext(grid, point.x, point.y, drag.scope);
      const y = drag.scope ? ctx.localY : point.y;
      setGrid(
        cloneGridStateDeep(
          applyRootGridUpdate(grid, (root) => updateNestedGrid(root, drag.scope, (scoped) => addHorizontalLine(scoped, y))),
        ),
      );
    } else if (drag?.kind === "move-vertical") {
      setGrid((prev) =>
        prev
          ? cloneGridStateDeep(
              applyRootGridUpdate(prev, (root) =>
                updateNestedGrid(root, drag.scope, (scoped) =>
                  syncSpecsAfterVerticalMove(scoped, drag.trackIndex),
                ),
              ),
            )
          : prev,
      );
    } else if (drag?.kind === "move-horizontal") {
      setGrid((prev) =>
        prev
          ? cloneGridStateDeep(
              applyRootGridUpdate(prev, (root) =>
                updateNestedGrid(root, drag.scope, (scoped) =>
                  syncSpecsAfterHorizontalMove(scoped, drag.trackIndex),
                ),
              ),
            )
          : prev,
      );
    } else if (drag?.kind === "marquee" && point) {
      const ctx = resolveEditContext(grid, drag.x1, drag.y1, drag.scope);
      const endCtx = resolveEditContext(grid, point.x, point.y, drag.scope);
      const picked = cellsInRect(ctx.grid, ctx.localX, ctx.localY, endCtx.localX, endCtx.localY);
      setActiveScope(drag.scope);
      setSelectedRegions(picked);
      setSelectedSegment(null);
    } else if (pendingRef.current && point) {
      const pending = pendingRef.current;
      const segmentHit = hitTestScopedSegment(grid, point.x, point.y);
      const regionHit = hitTestScopedRegion(grid, point.x, point.y);
      if (segmentHit) {
        const now = Date.now();
        const isDoubleClick =
          lastLineClickRef.current &&
          scopedRefsEqual(lastLineClickRef.current.segment, segmentHit) &&
          now - lastLineClickRef.current.time <= DOUBLE_CLICK_MS;

        if (isDoubleClick) {
          setActiveScope(segmentHit.scope);
          setSelectedRegions(listRegionsForScope(grid, segmentHit.scope));
          setSelectedSegment(null);
          lastLineClickRef.current = null;
        } else {
          setActiveScope(segmentHit.scope);
          setSelectedSegment(segmentHit);
          clearRegionSelection();
          lastLineClickRef.current = { segment: segmentHit, time: now };
        }
      } else if (regionHit) {
        lastLineClickRef.current = null;
        setActiveScope(regionHit.scope);
        setSelectedSegment(null);
        setSelectedRegions((prev) =>
          pending.shiftKey && activeScope === regionHit.scope
            ? toggleRegionSelection(prev, regionHit.region)
            : [regionHit.region],
        );
      } else if (!pending.shiftKey) {
        clearRegionSelection();
        setSelectedSegment(null);
        setActiveScope(null);
        lastLineClickRef.current = null;
      }
    }

    setDrag(null);
    pendingRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const segments = grid ? listAllRenderSegments(grid) : [];
  const bbox =
    grid && selectedRegions.length > 0 ? selectionBBoxDisplay(grid, activeScope, selectedRegions) : null;
  const sizingBarPlacement = bbox && grid ? resolveSizingBarPlacement(bbox, grid.width, grid.height) : null;

  const editGrid = grid && activeScope && grid.nested?.[activeScope] ? grid.nested[activeScope] : grid;

  const colSpec = useMemo(() => {
    if (!editGrid || !bbox) return null;
    return resolveSharedTrackSpec(bbox.cols.map((col) => editGrid.colSpecs[col]!));
  }, [bbox, editGrid]);

  const rowSpec = useMemo(() => {
    if (!editGrid || !bbox) return null;
    return resolveSharedTrackSpec(bbox.rows.map((row) => editGrid.rowSpecs[row]!));
  }, [bbox, editGrid]);

  const updateColumnSpec = (spec: TrackSpec) => {
    if (!grid || !bbox) return;
    setGrid(
      cloneGridStateDeep(
        updateNestedGrid(grid, activeScope, (scoped) =>
          updateColSpecs(scoped, bbox.cols, spec, viewportSize),
        ),
      ),
    );
  };

  const updateRowSpec = (spec: TrackSpec) => {
    if (!grid || !bbox) return;
    setGrid(
      cloneGridStateDeep(
        updateNestedGrid(grid, activeScope, (scoped) =>
          updateRowSpecs(scoped, bbox.rows, spec, viewportSize),
        ),
      ),
    );
  };

  const dragClass =
    drag?.kind === "move-vertical" || drag?.kind === "add-vertical"
      ? " is-dragging-v"
      : drag?.kind === "move-horizontal" || drag?.kind === "add-horizontal"
        ? " is-dragging-h"
        : drag?.kind === "marquee"
          ? " is-marquee"
          : "";
  const hoverClass = hoverLine
    ? hoverLine.ref.orientation === "v"
      ? " is-hover-v"
      : " is-hover-h"
    : hoverEdge
      ? ` is-edge-${hoverEdge}`
      : hoverRegion
        ? " is-hover-cell"
        : "";

  const toolbar = (
    <div className={`site-lab-grid__toolbar${isDesktop ? " site-lab-grid__toolbar--overlay" : ""}`}>
      <button
        type="button"
        className="site-lab-grid__btn"
        onClick={handleCreateGrid}
        disabled={Boolean(grid && (selectedRegions.length === 0 || activeScope))}
        title={createGridTitle}
      >
        +
      </button>
      <div className="site-lab-grid__viewport-switch" role="group" aria-label="Tamaño del contenedor">
        {VIEWPORT_ORDER.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`site-lab-grid__btn site-lab-grid__btn--viewport${viewport === preset ? " is-active" : ""}`}
            onClick={() => applyViewport(preset)}
            title={
              isFluidViewport(preset)
                ? VIEWPORT_PRESETS[preset].label
                : `${VIEWPORT_PRESETS[preset].label} · ${VIEWPORT_PRESETS[preset].width}×${VIEWPORT_PRESETS[preset].height}`
            }
          >
            {VIEWPORT_PRESETS[preset].label}
          </button>
        ))}
      </div>
    </div>
  );

  const canvasBlock = (
    <div className={`site-lab-grid__canvas-wrap${isDesktop ? " site-lab-grid__canvas-wrap--fluid" : ""}`}>
      <div
        ref={canvasRef}
        className={`site-lab-grid__canvas site-lab-grid__canvas--${viewport}${grid ? " has-grid" : ""}${hoverClass}${dragClass}${drag ? " is-dragging" : ""}${isDesktop ? " site-lab-grid__canvas--fluid" : ""}`}
        style={canvasStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          setHoverEdge(null);
          setHoverLine(null);
          setHoverRegion(null);
          pendingRef.current = null;
        }}
      >
        {renderCanvasContent({
          grid,
          activeScope,
          selectedRegions,
          hoverRegion,
          bbox,
          segments,
          selectedSegment,
          drag,
        })}
      </div>

      {bbox && sizingBarPlacement ? (
        <div className="site-lab-grid__overlay">
          <GridSelectionSizingBar
            colSpec={colSpec}
            rowSpec={rowSpec}
            onColChange={updateColumnSpec}
            onRowChange={updateRowSpec}
            style={sizingBarPlacement}
          />
        </div>
      ) : null}
    </div>
  );

  if (isDesktop) {
    return (
      <div ref={shellRef} className="site-lab-grid-shell site-lab-grid-shell--desktop">
        <div className="site-lab-grid site-lab-grid--desktop">
          {toolbar}
          {canvasBlock}
        </div>
      </div>
    );
  }

  const scaledW = deviceSize.width * fitScale;
  const scaledH = (deviceSize.height + TOOLBAR_BLOCK) * fitScale;

  return (
    <div ref={shellRef} className="site-lab-grid-shell site-lab-grid-shell--device">
      <div className="site-lab-grid-scaler" style={{ width: scaledW, height: scaledH }}>
        <div
          className="site-lab-grid site-lab-grid--device"
          style={{
            width: deviceSize.width,
            transform: `scale(${fitScale})`,
            transformOrigin: "top left",
          }}
        >
          {toolbar}
          <div
            className="site-lab-grid__canvas-wrap"
            style={{ width: deviceSize.width, height: deviceSize.height }}
          >
            <div
              ref={canvasRef}
              className={`site-lab-grid__canvas site-lab-grid__canvas--${viewport}${grid ? " has-grid" : ""}${hoverClass}${dragClass}${drag ? " is-dragging" : ""}`}
              style={canvasStyle ?? { width: deviceSize.width, height: deviceSize.height }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={() => {
                setHoverEdge(null);
                setHoverLine(null);
                setHoverRegion(null);
                pendingRef.current = null;
              }}
            >
              {renderCanvasContent({
          grid,
          activeScope,
          selectedRegions,
          hoverRegion,
          bbox,
          segments,
          selectedSegment,
          drag,
        })}
            </div>

            {bbox && sizingBarPlacement ? (
              <div className="site-lab-grid__overlay">
                <GridSelectionSizingBar
                  colSpec={colSpec}
                  rowSpec={rowSpec}
                  onColChange={updateColumnSpec}
                  onRowChange={updateRowSpec}
                  style={sizingBarPlacement}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
