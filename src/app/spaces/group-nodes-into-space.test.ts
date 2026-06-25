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

  it("agrupa sinks paralelos en modo colección con media_list", () => {
    const a: Node = {
      id: "img1",
      type: "nanoBanana",
      position: { x: 0, y: 0 },
      data: { value: "https://a.jpg", type: "image" },
      selected: true,
    };
    const b: Node = {
      id: "img2",
      type: "nanoBanana",
      position: { x: 0, y: 300 },
      data: { value: "https://b.jpg", type: "image" },
      selected: true,
    };
    const c: Node = { id: "c", type: "export_multimedia", position: { x: 900, y: 0 }, data: {}, selected: false };

    const edges: Edge[] = [
      { id: "e1", source: "img1", target: "c", sourceHandle: "image", targetHandle: "ml0" },
      { id: "e2", source: "img2", target: "c", sourceHandle: "image", targetHandle: "ml1" },
    ];

    const result = groupNodesIntoSpace({
      selectedNodes: [a, b],
      edges,
      allNodes: [a, b, c],
      spaceId: "space_collection",
      spaceNodeId: "space_node_coll",
      spacePosition: { x: 200, y: 100 },
    });

    expect(result).not.toBeNull();
    const inner = result!.spaceEntry;
    const toOut = inner.edges!.filter((e) => e.target === "out");
    expect(toOut).toHaveLength(2);
    expect(inner.outputType).toBe("media_list");
    expect(inner.mediaListOutput).toBeDefined();
    expect((inner.mediaListOutput as { items?: unknown[] })?.items).toHaveLength(2);

    const bridged = result!.parentEdges.filter((e) => e.source === "space_node_coll");
    expect(bridged.length).toBeGreaterThan(0);
    expect(bridged.every((e) => e.sourceHandle === "media_list")).toBe(true);

    const portal = result!.spaceNode;
    expect(portal.data.outputType).toBe("media_list");
    expect(portal.data.mediaListOutput).toBeDefined();
  });
});
