import { describe, expect, it } from "vitest";
import {
  cellRect,
  hitTestCell,
  hitTestRegion,
  listClosedCells,
  listRegions,
  regionRect,
  selectionBBox,
  unionRegions,
} from "./grid-cells";
import { createNestedGridInRegion, listAllRenderSegments } from "./grid-nested";
import { addHorizontalLine, addVerticalLine, createInitialGrid, deleteSegment, hKey, parseEdgeKey, vKey } from "./grid-segments";

describe("grid-cells", () => {
  it("detects the initial single closed cell", () => {
    const grid = createInitialGrid(400, 300);
    expect(listClosedCells(grid)).toEqual([{ minCol: 0, maxCol: 0, minRow: 0, maxRow: 0 }]);
    expect(listRegions(grid)).toHaveLength(1);
  });

  it("hit tests a region from pointer position", () => {
    const grid = createInitialGrid(400, 300);
    expect(hitTestRegion(grid, 200, 150)).toEqual({ minCol: 0, maxCol: 0, minRow: 0, maxRow: 0 });
    expect(hitTestCell(grid, 200, 150)).toEqual({ minCol: 0, maxCol: 0, minRow: 0, maxRow: 0 });
  });

  it("builds a selection bbox across multiple cells", () => {
    let grid = createInitialGrid(400, 300);
    grid = addVerticalLine(grid, 200);
    const bbox = selectionBBox(grid, [
      { minCol: 0, maxCol: 0, minRow: 0, maxRow: 0 },
      { minCol: 1, maxCol: 1, minRow: 0, maxRow: 0 },
    ]);
    expect(bbox?.width).toBe(400);
    expect(bbox?.height).toBe(300);
    expect(cellRect(grid, 0, 0).width).toBe(200);
  });

  it("creates a nested grid inside a selected region", () => {
    let grid = createInitialGrid(400, 300);
    grid = addVerticalLine(grid, 200);
    grid = addHorizontalLine(grid, 150);
    const target = { minCol: 0, maxCol: 1, minRow: 0, maxRow: 1 };
    const { state: next, scope } = createNestedGridInRegion(grid, target);
    expect(scope).toBeTruthy();
    expect(next.nested?.[scope]?.width).toBe(400);
    expect(next.nested?.[scope]?.height).toBe(300);
    expect(next.hEdges.has(hKey(1, 0))).toBe(true);
    expect(next.vEdges.has(vKey(1, 0))).toBe(true);
    const segments = listAllRenderSegments(next);
    expect(segments.some((segment) => segment.scope === scope)).toBe(true);
  });

  it("unions multiple selected regions into one bbox", () => {
    expect(
      unionRegions([
        { minCol: 0, maxCol: 0, minRow: 0, maxRow: 0 },
        { minCol: 1, maxCol: 1, minRow: 0, maxRow: 0 },
      ]),
    ).toEqual({ minCol: 0, maxCol: 1, minRow: 0, maxRow: 0 });
  });

  it("detects merged regions after deleting an internal segment", () => {
    let grid = createInitialGrid(400, 300);
    grid = addVerticalLine(grid, 200);
    grid = addHorizontalLine(grid, 150);
    grid = deleteSegment(grid, parseEdgeKey(hKey(1, 0))!);
    const regions = listRegions(grid);
    expect(regions.some((region) => region.minCol === 0 && region.maxCol === 0 && region.minRow === 0 && region.maxRow === 1)).toBe(
      true,
    );
    expect(hitTestRegion(grid, 100, 200)).toEqual({
      minCol: 0,
      maxCol: 0,
      minRow: 0,
      maxRow: 1,
    });
    expect(regionRect(grid, hitTestRegion(grid, 100, 200)!).height).toBe(300);
  });
});
