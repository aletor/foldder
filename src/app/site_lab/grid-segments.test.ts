import { describe, expect, it } from "vitest";
import {
  addHorizontalLine,
  addVerticalLine,
  applyGridLayout,
  createInitialGrid,
  deleteSegment,
  hKey,
  layoutTracksFromSpecs,
  moveHorizontalLine,
  moveVerticalLine,
  parseEdgeKey,
  resizeGrid,
  updateColSpecs,
  vKey,
} from "./grid-segments";

describe("grid-segments", () => {
  it("creates a 1x1 grid with four border segments", () => {
    const grid = createInitialGrid(400, 300);
    expect(grid.xTracks).toEqual([0, 400]);
    expect(grid.yTracks).toEqual([0, 300]);
    expect(grid.hEdges.has(hKey(0, 0))).toBe(true);
    expect(grid.hEdges.has(hKey(1, 0))).toBe(true);
    expect(grid.vEdges.has(vKey(0, 0))).toBe(true);
    expect(grid.vEdges.has(vKey(1, 0))).toBe(true);
  });

  it("splits horizontal segments when adding a vertical line", () => {
    let grid = createInitialGrid(400, 300);
    grid = addVerticalLine(grid, 200);
    expect(grid.xTracks).toEqual([0, 200, 400]);
    expect(grid.hEdges.has(hKey(0, 0))).toBe(true);
    expect(grid.hEdges.has(hKey(0, 1))).toBe(true);
    expect(grid.vEdges.has(vKey(1, 0))).toBe(true);
  });

  it("deletes only the selected segment", () => {
    let grid = createInitialGrid(400, 300);
    grid = addVerticalLine(grid, 200);
    grid = deleteSegment(grid, parseEdgeKey(hKey(0, 0))!);
    expect(grid.hEdges.has(hKey(0, 0))).toBe(false);
    expect(grid.hEdges.has(hKey(0, 1))).toBe(true);
    expect(grid.hEdges.has(hKey(1, 0))).toBe(true);
  });

  it("splits vertical segments when adding a horizontal line", () => {
    let grid = createInitialGrid(400, 300);
    grid = addHorizontalLine(grid, 150);
    expect(grid.yTracks).toEqual([0, 150, 300]);
    expect(grid.vEdges.has(vKey(0, 0))).toBe(true);
    expect(grid.vEdges.has(vKey(0, 1))).toBe(true);
    expect(grid.vEdges.has(vKey(1, 0))).toBe(true);
    expect(grid.vEdges.has(vKey(1, 1))).toBe(true);
  });

  it("moves an interior vertical line within adjacent tracks", () => {
    let grid = addVerticalLine(createInitialGrid(400, 300), 200);
    grid = moveVerticalLine(grid, 1, 260);
    expect(grid.xTracks).toEqual([0, 260, 400]);
    grid = moveVerticalLine(grid, 1, 20);
    expect(grid.xTracks[1]).toBeGreaterThanOrEqual(10);
    grid = moveVerticalLine(grid, 1, 999);
    expect(grid.xTracks[1]).toBeLessThanOrEqual(390);
  });

  it("moves an interior horizontal line within adjacent tracks", () => {
    let grid = addHorizontalLine(createInitialGrid(400, 300), 150);
    grid = moveHorizontalLine(grid, 1, 220);
    expect(grid.yTracks).toEqual([0, 220, 300]);
  });

  it("does not move border tracks", () => {
    const grid = createInitialGrid(400, 300);
    expect(moveVerticalLine(grid, 0, 100)).toEqual(grid);
    expect(moveHorizontalLine(grid, 1, 100)).toEqual(grid);
  });

  it("lays out fr tracks to fill available space", () => {
    expect(layoutTracksFromSpecs(400, [{ mode: "fr", value: 1 }])).toEqual([0, 400]);
    expect(layoutTracksFromSpecs(400, [{ mode: "fr", value: 1 }, { mode: "fr", value: 2 }])).toEqual([
      0, 133, 400,
    ]);
  });

  it("respects px tracks on resize", () => {
    let grid = createInitialGrid(400, 300);
    grid = addVerticalLine(grid, 200);
    grid = updateColSpecs(grid, [0], { mode: "px", value: 180 });
    grid = resizeGrid(grid, 500, 300);
    expect(grid.xTracks).toEqual([0, 180, 500]);
  });

  it("grows content beyond the viewport when px tracks exceed it", () => {
    let grid = createInitialGrid(400, 300);
    grid = addVerticalLine(grid, 200);
    grid = updateColSpecs(
      grid,
      [0, 1],
      { mode: "px", value: 300 },
      { width: 400, height: 300 },
    );
    expect(grid.width).toBe(600);
    expect(grid.xTracks).toEqual([0, 300, 600]);
  });

  it("keeps fr row specs when splitting with a horizontal line", () => {
    const grid = addHorizontalLine(createInitialGrid(400, 300), 150);
    expect(grid.rowSpecs).toEqual([
      { mode: "fr", value: 1 },
      { mode: "fr", value: 1 },
    ]);
  });

  it("relayouts fr-only rows to match the viewport on resize", () => {
    let grid = addHorizontalLine(createInitialGrid(400, 300), 150);
    grid = resizeGrid(grid, 400, 500);
    expect(grid.height).toBe(500);
    expect(grid.yTracks).toEqual([0, 250, 500]);
    grid = resizeGrid(grid, 400, 220);
    expect(grid.height).toBe(220);
    expect(grid.yTracks).toEqual([0, 110, 220]);
  });
});
