import { describe, expect, it } from "vitest";
import {
  collectConnectedFlowNodeIds,
  extractFlowSubgraph,
  normalizeFlowForSave,
  remapInsertedFlow,
} from "./flow-graph";

describe("collectConnectedFlowNodeIds", () => {
  it("recorre el componente conexo en ambos sentidos", () => {
    const edges = [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
      { source: "x", target: "y" },
    ];
    expect([...collectConnectedFlowNodeIds("a", edges)].sort()).toEqual(["a", "b", "c"]);
    // Desde el último nodo se llega al primero (no dirigido).
    expect([...collectConnectedFlowNodeIds("c", edges)].sort()).toEqual(["a", "b", "c"]);
  });

  it("un nodo aislado es su propio flujo", () => {
    expect([...collectConnectedFlowNodeIds("solo", [])]).toEqual(["solo"]);
  });
});

describe("extractFlowSubgraph", () => {
  it("incluye solo nodos existentes y aristas internas", () => {
    const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "z" }];
    const edges = [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
      { source: "c", target: "ghost" }, // nodo inexistente
      { source: "z", target: "z2" },
    ];
    const sub = extractFlowSubgraph("a", nodes, edges);
    expect(sub.nodeIds.sort()).toEqual(["a", "b", "c"]);
    expect(sub.edges).toHaveLength(2);
    expect(sub.edges.every((e) => ["a", "b", "c"].includes(e.source) && ["a", "b", "c"].includes(e.target))).toBe(true);
  });
});

describe("normalizeFlowForSave", () => {
  it("desplaza posiciones al origen y limpia campos efímeros", () => {
    const nodes = [
      { id: "a", type: "x", position: { x: 100, y: 50 }, selected: true, dragging: true },
      { id: "b", type: "y", position: { x: 140, y: 90 }, measured: { width: 1 } },
    ];
    const { nodes: out } = normalizeFlowForSave(nodes, []);
    expect(out[0]!.position).toEqual({ x: 0, y: 0 });
    expect(out[1]!.position).toEqual({ x: 40, y: 40 });
    expect("selected" in out[0]!).toBe(false);
    expect("dragging" in out[0]!).toBe(false);
    expect("measured" in out[1]!).toBe(false);
  });
});

describe("remapInsertedFlow", () => {
  it("genera ids nuevos, desplaza y re-apunta aristas y parentId", () => {
    const nodes = [
      { id: "a", type: "designer", position: { x: 0, y: 0 }, data: { v: 1 } },
      { id: "b", type: "image", position: { x: 50, y: 50 }, data: { v: 2 }, parentId: "a" },
    ];
    const edges = [{ id: "e1", source: "a", target: "b", type: "buttonEdge" }];
    const { nodes: outNodes, edges: outEdges } = remapInsertedFlow(nodes, edges, {
      offset: { x: 1000, y: 500 },
    });
    expect(outNodes[0]!.id).not.toBe("a");
    expect(outNodes[1]!.id).not.toBe("b");
    expect(outNodes[0]!.position).toEqual({ x: 1000, y: 500 });
    expect(outNodes[1]!.position).toEqual({ x: 1050, y: 550 });
    // parentId re-apuntado al nuevo id del padre.
    expect(outNodes[1]!.parentId).toBe(outNodes[0]!.id);
    // aristas re-apuntadas.
    expect(outEdges[0]!.source).toBe(outNodes[0]!.id);
    expect(outEdges[0]!.target).toBe(outNodes[1]!.id);
    expect(outEdges[0]!.id).not.toBe("e1");
    // todos seleccionados.
    expect(outNodes.every((n) => (n as { selected?: boolean }).selected === true)).toBe(true);
    // data clonada (no es la misma referencia).
    expect(outNodes[0]!.data).not.toBe(nodes[0]!.data);
  });
});
