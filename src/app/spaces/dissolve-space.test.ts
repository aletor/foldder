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

  it("no multiplica edges: el puente es un producto cartesiano y la entrada puede traer duplicados", () => {
    // Regresión: ciclos agrupar→disolver acumulaban edges duplicados (mismo source/handle→target/handle).
    // El producto cartesiano parentIncoming×innerFromInput los multiplicaba (3→9→27→…→miles),
    // congelando el lienzo. El resultado NO debe contener conexiones redundantes.
    const spaceId = "space_inner";

    const innerNodes: Node[] = [
      { id: "in", type: "spaceInput", position: { x: 50, y: 100 }, data: {} },
      { id: "b", type: "nanoBanana", position: { x: 250, y: 100 }, data: {} },
      { id: "out", type: "spaceOutput", position: { x: 550, y: 100 }, data: {} },
    ];
    const innerEdges: Edge[] = [
      { id: "ie1", source: "in", target: "b", targetHandle: "image" },
      // Duplicado interno (misma conexión) que también debe colapsar.
      { id: "ie2", source: "in", target: "b", targetHandle: "image" },
    ];

    const spacesMap = {
      root: {
        id: "root",
        nodes: [
          { id: "a", type: "mediaInput", position: { x: 0, y: 0 }, data: {} },
          {
            id: "space_node",
            type: "space",
            position: { x: 400, y: 200 },
            data: { spaceId, hasInput: true, hasOutput: true },
          },
        ],
        // 3 edges externos idénticos a->space(in) (como dejaría un dissolve previo sin dedup).
        edges: [
          { id: "pe1", source: "a", target: "space_node", targetHandle: "in", sourceHandle: "media" },
          { id: "pe2", source: "a", target: "space_node", targetHandle: "in", sourceHandle: "media" },
          { id: "pe3", source: "a", target: "space_node", targetHandle: "in", sourceHandle: "media" },
        ],
      },
      [spaceId]: { id: spaceId, nodes: innerNodes, edges: innerEdges },
    };

    const result = dissolveSpaceIntoParent({
      spaceId,
      parentSpaceId: "root",
      spacesMap,
      innerNodes,
      innerEdges,
    });

    expect(result).not.toBeNull();
    // Sin dedup serían 3 (externos) × 2 (internos) = 6 edges a->b(image). Debe quedar 1.
    const aToB = result!.parentEdges.filter(
      (e) => e.source === "a" && e.target === "b" && e.targetHandle === "image",
    );
    expect(aToB).toHaveLength(1);

    // Ninguna conexión (source|sourceHandle|target|targetHandle) debe estar repetida.
    const keys = result!.parentEdges.map(
      (e) => `${e.source}|${e.sourceHandle ?? ""}|${e.target}|${e.targetHandle ?? ""}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
