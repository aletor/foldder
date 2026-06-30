import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import { areNodesConnectable } from "@/app/spaces/connection-utils";

function node(id: string, type: string): Node {
  return { id, type, position: { x: 0, y: 0 }, data: {} };
}

describe("populate connections", () => {
  it("accepts designer document → populate template", () => {
    const designer = node("d1", "designer");
    const populate = node("p1", "populate");
    expect(
      areNodesConnectable(designer, populate, {
        sourceHandle: "document",
        targetHandle: "template",
      }),
    ).toBe(true);
  });

  it("rejects space → populate template", () => {
    const space = node("s1", "space");
    const populate = node("p1", "populate");
    expect(
      areNodesConnectable(space, populate, {
        sourceHandle: "out",
        targetHandle: "template",
      }),
    ).toBe(false);
  });

  it("accepts dataset → populate dataset", () => {
    const dataset = node("ds", "dataset");
    const populate = node("p1", "populate");
    expect(
      areNodesConnectable(dataset, populate, {
        sourceHandle: "dataset",
        targetHandle: "dataset",
      }),
    ).toBe(true);
  });

  it("accepts populate media_list → export_multimedia", () => {
    const populate = node("p1", "populate");
    const exp = node("e1", "export_multimedia");
    expect(
      areNodesConnectable(populate, exp, {
        sourceHandle: "media_list",
        targetHandle: "ml0",
      }),
    ).toBe(true);
  });
});

describe("listPopulateDesignerTemplateConfigs", () => {
  it("lists up to connected designer templates", async () => {
    const { listPopulateDesignerTemplateConfigs } = await import(
      "@/app/spaces/populate/populate-designer-template"
    );
    const nodes: Node[] = [
      node("p1", "populate"),
      {
        id: "d1",
        type: "designer",
        position: { x: 0, y: 0 },
        data: { label: "A", pages: [{ id: "pg1", name: "1", layers: [] }] },
      },
      {
        id: "d2",
        type: "designer",
        position: { x: 0, y: 0 },
        data: { label: "B", pages: [{ id: "pg2", name: "1", layers: [] }] },
      },
    ];
    const edges: Edge[] = [
      { id: "e1", source: "d1", target: "p1", targetHandle: "template", sourceHandle: "document" },
      { id: "e2", source: "d2", target: "p1", targetHandle: "template", sourceHandle: "document" },
    ];
    const configs = listPopulateDesignerTemplateConfigs("p1", nodes, edges);
    expect(configs).toHaveLength(2);
    expect(configs.map((c) => c.templateLabel)).toEqual(["A", "B"]);
  });
});
