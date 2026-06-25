import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";

/** Mirrors fingerprint logic in use-spaces-undo-redo.ts for unit tests. */
function graphFingerprint(nodes: Node[], edges: Edge[]): string {
  const nodePart = nodes
    .map((n) => `${n.id}:${Math.round(n.position.x)}:${Math.round(n.position.y)}:${n.type ?? ""}`)
    .sort()
    .join("|");
  const edgePart = edges
    .map((e) => `${e.id}:${e.source}:${e.target}:${e.sourceHandle ?? ""}:${e.targetHandle ?? ""}`)
    .sort()
    .join("|");
  return `${nodePart};;${edgePart}`;
}

describe("spaces undo fingerprint", () => {
  it("treats identical node positions as the same snapshot", () => {
    const nodes: Node[] = [
      { id: "a", type: "promptInput", position: { x: 10, y: 20 }, data: {} },
    ];
    const edges: Edge[] = [];
    const fp1 = graphFingerprint(nodes, edges);
    const fp2 = graphFingerprint(
      [{ ...nodes[0], position: { x: 10.2, y: 19.8 } }],
      edges,
    );
    expect(fp1).toBe(fp2);
  });

  it("detects moved nodes", () => {
    const base: Node[] = [{ id: "a", type: "promptInput", position: { x: 0, y: 0 }, data: {} }];
    const moved: Node[] = [{ id: "a", type: "promptInput", position: { x: 40, y: 0 }, data: {} }];
    expect(graphFingerprint(base, [])).not.toBe(graphFingerprint(moved, []));
  });
});
