import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";

import {
  designerHasDirectDataset,
  designerIsLoopTemplate,
  designerModeConflictReason,
} from "./connection-utils";

function node(id: string, type: string): Node {
  return { id, type, position: { x: 0, y: 0 }, data: {} } as Node;
}

const nodes: Node[] = [
  node("ds1", "dataset"),
  node("dz1", "designer"),
  node("pop1", "loop"),
];

function templateEdge(): Edge {
  return { id: "e1", source: "dz1", target: "pop1", sourceHandle: "document", targetHandle: "template" } as Edge;
}
function datasetEdge(): Edge {
  return { id: "e2", source: "ds1", target: "dz1", sourceHandle: "dataset", targetHandle: "dataset" } as Edge;
}

describe("designer Modo 1/2 detección", () => {
  it("designerIsLoopTemplate", () => {
    expect(designerIsLoopTemplate("dz1", [templateEdge()])).toBe(true);
    expect(designerIsLoopTemplate("dz1", [datasetEdge()])).toBe(false);
  });
  it("designerHasDirectDataset", () => {
    expect(designerHasDirectDataset("dz1", [datasetEdge()])).toBe(true);
    expect(designerHasDirectDataset("dz1", [templateEdge()])).toBe(false);
  });
});

describe("designerModeConflictReason", () => {
  it("bloquea Dataset → Designer que ya es plantilla de Loop (Caso A)", () => {
    const conn = { source: "ds1", target: "dz1", sourceHandle: "dataset", targetHandle: "dataset" };
    const reason = designerModeConflictReason(conn, nodes, [templateEdge()]);
    expect(reason).toMatch(/ya es plantilla/i);
  });

  it("bloquea Designer (con Dataset directo) → Plantilla de Loop (Caso B)", () => {
    const conn = { source: "dz1", target: "pop1", sourceHandle: "document", targetHandle: "template" };
    const reason = designerModeConflictReason(conn, nodes, [datasetEdge()]);
    expect(reason).toMatch(/ya usa un Dataset directo/i);
  });

  it("permite Dataset → Designer sin plantilla", () => {
    const conn = { source: "ds1", target: "dz1", sourceHandle: "dataset", targetHandle: "dataset" };
    expect(designerModeConflictReason(conn, nodes, [])).toBeNull();
  });

  it("permite Designer → Plantilla sin Dataset directo", () => {
    const conn = { source: "dz1", target: "pop1", sourceHandle: "document", targetHandle: "template" };
    expect(designerModeConflictReason(conn, nodes, [])).toBeNull();
  });

  it("no afecta a otros tipos de nodo en el mismo handle", () => {
    const conn = { source: "ds1", target: "pop1", sourceHandle: "dataset", targetHandle: "dataset" };
    expect(designerModeConflictReason(conn, nodes, [templateEdge()])).toBeNull();
  });
});
