import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";

import { nodeBoundsForLayout } from "./canvas-group-logic";
import { resolveVerticalOverlapsInColumns } from "./spaces-graph-layout";

describe("nodeBoundsForLayout", () => {
  it("uses grid floor when measured height is smaller than preset", () => {
    const node = {
      id: "e1",
      type: "enhancer",
      position: { x: 0, y: 0 },
      data: { value: "x".repeat(400) },
      measured: { width: 280, height: 240 },
    } as unknown as Node;

    const dims = nodeBoundsForLayout(node);
    expect(dims.h).toBeGreaterThan(300);
    expect(dims.w).toBeGreaterThanOrEqual(416);
  });

  it("grows promptInput with long text", () => {
    const node = {
      id: "p1",
      type: "promptInput",
      position: { x: 0, y: 0 },
      data: { value: "line\n".repeat(20) },
      measured: { width: 200, height: 120 },
    } as unknown as Node;

    const dims = nodeBoundsForLayout(node);
    expect(dims.h).toBeGreaterThan(200);
  });
});

describe("resolveVerticalOverlapsInColumns", () => {
  it("pushes lower nodes down when a multi-input align causes overlap", () => {
    const nodes = [
      { id: "a", type: "enhancer", position: { x: 0, y: 0 }, data: {} },
      { id: "b", type: "nanoBanana", position: { x: 0, y: 0 }, data: {} },
    ] as Node[];
    const positioned = {
      a: { x: 100, y: 0 },
      b: { x: 100, y: 200 },
    };
    const getDim = () => ({ w: 400, h: 360 });

    resolveVerticalOverlapsInColumns(positioned, nodes, getDim, 56);

    expect(positioned.b.y).toBeGreaterThanOrEqual(positioned.a.y + 360 + 56);
  });
});
