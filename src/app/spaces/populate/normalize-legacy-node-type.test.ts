import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import {
  normalizeLegacyPopulateNodeType,
  normalizeLegacyPopulateNodes,
} from "./normalize-legacy-node-type";

describe("normalizeLegacyPopulateNodeType", () => {
  it("keeps new Populate assign nodes", () => {
    const node: Node = {
      id: "p1",
      type: "populate",
      position: { x: 0, y: 0 },
      data: { label: "Populate", templateBindings: [], _populateKind: "assign" },
    };
    expect(normalizeLegacyPopulateNodeType(node).type).toBe("populate");
  });

  it("keeps populate nodes that already have templateBindings array", () => {
    const node: Node = {
      id: "p2",
      type: "populate",
      position: { x: 0, y: 0 },
      data: { templateBindings: [] },
    };
    expect(normalizeLegacyPopulateNodeType(node).type).toBe("populate");
  });

  it("migrates legacy batch populate nodes to loop", () => {
    const node: Node = {
      id: "old",
      type: "populate",
      position: { x: 0, y: 0 },
      data: { label: "Populate", listId: "l1" },
    };
    expect(normalizeLegacyPopulateNodeType(node).type).toBe("loop");
  });

  it("maps arrays in batch", () => {
    const nodes: Node[] = [
      {
        id: "a",
        type: "populate",
        position: { x: 0, y: 0 },
        data: { templateBindings: [] },
      },
      {
        id: "b",
        type: "loop",
        position: { x: 0, y: 0 },
        data: {},
      },
    ];
    expect(normalizeLegacyPopulateNodes(nodes).map((n) => n.type)).toEqual(["populate", "loop"]);
  });
});
