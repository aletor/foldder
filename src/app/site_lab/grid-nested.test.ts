import { describe, expect, it } from "vitest";
import {
  createNestedGridInRegion,
  deleteGridAtScope,
  hitTestScopedSegment,
  isFullGridSelection,
  listAllRenderSegments,
  listRegionsForScope,
} from "./grid-nested";
import { addHorizontalLine, addVerticalLine, createInitialGrid } from "./grid-segments";

describe("grid-nested", () => {
  it("renders nested segments with global coordinates", () => {
    let grid = createInitialGrid(400, 300);
    grid = addVerticalLine(grid, 200);
    const target = { minCol: 1, maxCol: 1, minRow: 0, maxRow: 0 };
    const { state, scope } = createNestedGridInRegion(grid, target);
    const nested = state.nested?.[scope]!;
    const withLine = addVerticalLine(nested, 100);
    const next = { ...state, nested: { ...state.nested, [scope]: withLine } };
    const segments = listAllRenderSegments(next);
    expect(segments.some((segment) => segment.scope === scope && segment.x1 >= 200)).toBe(true);
  });

  it("prioritizes the closest segment regardless of scope", () => {
    let grid = createInitialGrid(400, 300);
    grid = addVerticalLine(grid, 200);
    const target = { minCol: 1, maxCol: 1, minRow: 0, maxRow: 0 };
    const { state, scope } = createNestedGridInRegion(grid, target);
    const nested = addVerticalLine(state.nested![scope]!, 100);
    const next = { ...state, nested: { ...state.nested, [scope]: nested } };
    const nestedHit = hitTestScopedSegment(next, 300, 150);
    expect(nestedHit?.scope).toBe(scope);
    const rootHit = hitTestScopedSegment(next, 198, 150);
    expect(rootHit?.scope).toBeNull();
    expect(rootHit?.ref.fixedIndex).toBe(1);
  });

  it("lists all regions for a scoped grid", () => {
    let grid = createInitialGrid(400, 300);
    grid = addVerticalLine(grid, 200);
    grid = addHorizontalLine(grid, 150);
    expect(listRegionsForScope(grid, null)).toHaveLength(4);

    const target = { minCol: 1, maxCol: 1, minRow: 0, maxRow: 0 };
    const { state, scope } = createNestedGridInRegion(grid, target);
    const nested = addVerticalLine(state.nested![scope]!, 100);
    const next = { ...state, nested: { ...state.nested, [scope]: nested } };
    expect(listRegionsForScope(next, scope)).toHaveLength(2);
  });

  it("detects a full-grid selection and deletes nested grids", () => {
    let grid = createInitialGrid(400, 300);
    grid = addVerticalLine(grid, 200);
    const target = { minCol: 1, maxCol: 1, minRow: 0, maxRow: 0 };
    const { state, scope } = createNestedGridInRegion(grid, target);
    const nested = addVerticalLine(state.nested![scope]!, 100);
    const withNested = { ...state, nested: { ...state.nested, [scope]: nested } };
    const all = listRegionsForScope(withNested, scope);
    expect(all).toHaveLength(2);
    expect(isFullGridSelection(withNested, scope, all)).toBe(true);
    expect(isFullGridSelection(withNested, scope, all.slice(0, 1))).toBe(false);

    const withoutNested = deleteGridAtScope(withNested, scope)!;
    expect(withoutNested.nested?.[scope]).toBeUndefined();
    expect(isFullGridSelection(withoutNested, null, listRegionsForScope(withoutNested, null))).toBe(true);
    expect(deleteGridAtScope(withoutNested, null)).toBeNull();
  });
});
