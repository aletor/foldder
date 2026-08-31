import { describe, expect, it } from "vitest";
import type { FreehandObject, PathObject } from "@/app/spaces/FreehandStudio";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { frontmostDirectHit, marqueeHits } from "./site-creator-hit-test";
import { buildResponsiveVisualClusters, buildUnorganizedPresentationUnits } from "./site-creator-responsive-visual";
import {
  isLineLikePath,
  strokePathHitsPoint,
  strokePathIntersectsRect,
} from "./site-creator-stroke-path";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";

function linePath(args: {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeWidth?: number;
}): PathObject {
  const { id, x1, y1, x2, y2, strokeWidth = 2 } = args;
  const pt = (x: number, y: number) => ({
    anchor: { x, y },
    handleIn: { x, y },
    handleOut: { x, y },
    vertexMode: "corner" as const,
  });
  return {
    id,
    name: "Line 1",
    type: "path",
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.max(Math.abs(x2 - x1), 1),
    height: Math.max(Math.abs(y2 - y1), 1),
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fill: { type: "solid", color: "none" },
    stroke: "#111111",
    strokeWidth,
    closed: false,
    isLineTool: true,
    points: [pt(x1, y1), pt(x2, y2)],
  } as PathObject;
}

function rect(id: string, x: number, y: number, width: number, height: number): FreehandObject {
  return {
    id,
    name: id,
    type: "rect",
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fill: "#ff00aa",
  } as FreehandObject;
}

function page(objects: FreehandObject[]): DesignerPageState {
  return { id: "pg", format: "web169", objects };
}

describe("site-creator stroke paths from Designer", () => {
  it("treats a line-tool path as a line, not a filled shape", () => {
    expect(isLineLikePath(linePath({ id: "rule", x1: 40, y1: 200, x2: 400, y2: 200 }))).toBe(true);
    expect(isLineLikePath(rect("box", 0, 0, 80, 80))).toBe(false);
  });

  it("hits a horizontal rule a few pixels off the 1px AABB", () => {
    const line = linePath({ id: "rule", x1: 40, y1: 200, x2: 400, y2: 200, strokeWidth: 2 });
    expect(strokePathHitsPoint(line, { x: 120, y: 204 })).toBe(true);
    expect(strokePathHitsPoint(line, { x: 120, y: 240 })).toBe(false);
    const index = buildSiteSelectionIndex(page([line]));
    expect(frontmostDirectHit(index, [], { x: 120, y: 204 })?.layerId).toBe("rule");
    expect(frontmostDirectHit(index, [], { x: 120, y: 240 })).toBeNull();
  });

  it("does not select a diagonal line from empty space inside its bounding box", () => {
    const line = linePath({ id: "diag", x1: 0, y1: 0, x2: 400, y2: 400 });
    expect(strokePathHitsPoint(line, { x: 200, y: 200 })).toBe(true);
    expect(strokePathHitsPoint(line, { x: 360, y: 40 })).toBe(false);
    const index = buildSiteSelectionIndex(page([line, rect("card", 300, 10, 80, 80)]));
    expect(frontmostDirectHit(index, [], { x: 340, y: 40 })?.layerId).toBe("card");
  });

  it("includes a thin rule in a marquee that covers the stroke", () => {
    const line = linePath({ id: "rule", x1: 40, y1: 200, x2: 400, y2: 200 });
    const index = buildSiteSelectionIndex(page([line]));
    const hits = marqueeHits(index, [], { x: 80, y: 196, width: 40, height: 12 });
    expect(hits.map((h) => h.layerId)).toContain("rule");
    expect(strokePathIntersectsRect(line, { x: 80, y: 80, width: 40, height: 20 })).toBe(false);
  });

  it("does not use a line as a clustering surface", () => {
    const diag = linePath({ id: "diag", x1: 0, y1: 0, x2: 500, y2: 400 });
    const a = rect("a", 40, 180, 60, 40);
    const b = rect("b", 300, 40, 60, 40);
    const index = buildSiteSelectionIndex(page([diag, a, b]));
    const units = buildUnorganizedPresentationUnits({
      layerIds: ["diag", "a", "b"],
      index,
    });
    const { clusters } = buildResponsiveVisualClusters({ units, index });
    expect(clusters.some((c) => c.kind === "surface" && c.surfaceLayerId === "diag")).toBe(false);
    const withLine = clusters.find((c) => c.allLayerIds.includes("diag"));
    expect(withLine).toBeTruthy();
    expect(withLine?.kind === "solo").toBe(false);
  });
});
