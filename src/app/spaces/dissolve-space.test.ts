import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import { dissolveSpaceIntoParent } from "./dissolve-space";

describe("dissolveSpaceIntoParent", () => {
  it("puentea Input/Output y saca nodos al lienzo padre", () => {
    const spaceId = "space_inner";
    const parentSpaceId = "root";

    const innerNodes: Node[] = [
      { id: "in", type: "spaceInput", position: { x: 50, y: 100 }, data: {} },
      { id: "b", type: "promptInput", position: { x: 250, y: 100 }, data: {} },
      { id: "out", type: "spaceOutput", position: { x: 550, y: 100 }, data: {} },
    ];
    const innerEdges: Edge[] = [
      { id: "e_in_b", source: "in", target: "b", sourceHandle: "out" },
      { id: "e_b_out", source: "b", target: "out", targetHandle: "in" },
    ];

    const spacesMap = {
      root: {
        id: "root",
        nodes: [
          { id: "a", type: "urlImage", position: { x: 0, y: 0 }, data: {} },
          {
            id: "space_node",
            type: "space",
            position: { x: 400, y: 200 },
            data: { spaceId, hasInput: true, hasOutput: true },
          },
          { id: "c", type: "imageExport", position: { x: 900, y: 0 }, data: {} },
        ],
        edges: [
          { id: "e_a_space", source: "a", target: "space_node", targetHandle: "in", sourceHandle: "image" },
          { id: "e_space_c", source: "space_node", target: "c", sourceHandle: "out", targetHandle: "image" },
        ],
      },
      [spaceId]: {
        id: spaceId,
        nodes: innerNodes,
        edges: innerEdges,
      },
    };

    const result = dissolveSpaceIntoParent({
      spaceId,
      parentSpaceId,
      spacesMap,
      innerNodes,
      innerEdges,
    });

    expect(result).not.toBeNull();
    expect(result!.liftedNodeCount).toBe(1);
    expect(result!.spacesMap[spaceId]).toBeUndefined();
    expect(result!.parentNodes.some((n) => n.id === "space_node")).toBe(false);
    expect(result!.parentNodes.some((n) => n.id === "b")).toBe(true);
    expect(result!.parentNodes.some((n) => n.type === "spaceInput")).toBe(false);
    expect(result!.parentNodes.some((n) => n.type === "spaceOutput")).toBe(false);

    const bridgedIn = result!.parentEdges.find((e) => e.source === "a" && e.target === "b");
    const bridgedOut = result!.parentEdges.find((e) => e.source === "b" && e.target === "c");
    expect(bridgedIn).toBeDefined();
    expect(bridgedOut).toBeDefined();
  });
});
