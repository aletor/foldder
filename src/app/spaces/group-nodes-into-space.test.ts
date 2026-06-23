import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import { groupNodesIntoSpace } from "./group-nodes-into-space";

describe("groupNodesIntoSpace", () => {
  it("conecta el sink al spaceOutput y puentea la salida externa", () => {
    const a: Node = { id: "a", type: "urlImage", position: { x: 0, y: 0 }, data: {}, selected: true };
    const b: Node = { id: "b", type: "promptInput", position: { x: 300, y: 0 }, data: {}, selected: true };
    const c: Node = { id: "c", type: "enhancer", position: { x: 700, y: 0 }, data: {}, selected: false };

    const edges: Edge[] = [
      { id: "e_a_b", source: "a", target: "b", sourceHandle: "image", targetHandle: "prompt" },
      { id: "e_b_c", source: "b", target: "c", sourceHandle: "prompt", targetHandle: "p0" },
    ];

    const result = groupNodesIntoSpace({
      selectedNodes: [a, b],
      edges,
      allNodes: [a, b, c],
      spaceId: "space_test",
      spaceNodeId: "space_node_1",
      spacePosition: { x: 150, y: 50 },
    });

    expect(result).not.toBeNull();
    const inner = result!.spaceEntry;

    const toOut = inner.edges!.find((e) => e.target === "out");
    expect(toOut).toBeDefined();
    expect(toOut!.source).toBe("b");
    expect(toOut!.sourceHandle).toBe("prompt");

    const bridgedOut = result!.parentEdges.find((e) => e.source === "space_node_1" && e.target === "c");
    expect(bridgedOut).toBeDefined();
    expect(bridgedOut!.sourceHandle).toBe("out");
    expect(bridgedOut!.targetHandle).toBe("p0");

    expect(result!.parentNodes.some((n) => n.id === "a")).toBe(false);
    expect(result!.parentNodes.some((n) => n.id === "space_node_1")).toBe(true);
  });

  it("puentea entradas externas vía spaceInput y Space.in", () => {
    const ext: Node = { id: "ext", type: "urlImage", position: { x: -300, y: 0 }, data: {}, selected: false };
    const b: Node = { id: "b", type: "enhancer", position: { x: 300, y: 0 }, data: {}, selected: true };

    const edges: Edge[] = [
      { id: "e_ext_b", source: "ext", target: "b", sourceHandle: "image", targetHandle: "p0" },
    ];

    const result = groupNodesIntoSpace({
      selectedNodes: [b],
      edges,
      allNodes: [ext, b],
      spaceId: "space_in",
      spaceNodeId: "space_node_2",
      spacePosition: { x: 100, y: 0 },
    });

    expect(result).not.toBeNull();
    const fromInput = result!.spaceEntry.edges!.find((e) => e.source === "in" && e.target === "b");
    expect(fromInput).toBeDefined();

    const bridgedIn = result!.parentEdges.find((e) => e.source === "ext" && e.target === "space_node_2");
    expect(bridgedIn).toBeDefined();
    expect(bridgedIn!.targetHandle).toBe("in");
  });
});
