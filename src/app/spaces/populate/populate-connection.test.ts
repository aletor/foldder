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

  it("accepts space out → populate template", () => {
    const space = node("s1", "space");
    const populate = node("p1", "populate");
    expect(
      areNodesConnectable(space, populate, {
        sourceHandle: "out",
        targetHandle: "template",
      }),
    ).toBe(true);
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

  it("lists designer templates from a reconciled space portal cache", async () => {
    const { listPopulateDesignerTemplateConfigs } = await import(
      "@/app/spaces/populate/populate-designer-template"
    );
    const { reconcileSpacePortalNode } = await import("@/app/spaces/space-media-list");

    const innerDesigners = [
      {
        id: "d1",
        type: "designer",
        position: { x: 0, y: 0 },
        data: { label: "Home", pages: [{ id: "pg1", name: "1", layers: [] }] },
      },
      {
        id: "d2",
        type: "designer",
        position: { x: 100, y: 0 },
        data: { label: "Away", pages: [{ id: "pg2", name: "1", layers: [] }] },
      },
    ];
    const spacesMap = {
      space_tpl: {
        nodes: [
          ...innerDesigners,
          { id: "out", type: "spaceOutput", position: { x: 400, y: 0 }, data: {} },
        ],
        edges: [
          { id: "e1", source: "d1", target: "out", sourceHandle: "document", targetHandle: "in" },
          { id: "e2", source: "d2", target: "out", sourceHandle: "document", targetHandle: "in" },
        ],
      },
    };
    const portal = reconcileSpacePortalNode(
      {
        id: "space_portal",
        type: "space",
        position: { x: 0, y: 0 },
        data: { spaceId: "space_tpl", label: "Templates" },
      },
      spacesMap,
    );
    const nodes: Node[] = [node("p1", "populate"), portal];
    const edges: Edge[] = [
      {
        id: "e_space",
        source: "space_portal",
        target: "p1",
        targetHandle: "template",
        sourceHandle: "out",
      },
    ];
    const configs = listPopulateDesignerTemplateConfigs("p1", nodes, edges, spacesMap);
    expect(configs).toHaveLength(2);
    expect(configs.map((c) => c.templateLabel)).toEqual(["Home", "Away"]);
  });

  it("lists designer templates from a connected space portal", async () => {
    const { listPopulateDesignerTemplateConfigs } = await import(
      "@/app/spaces/populate/populate-designer-template"
    );
    const nodes: Node[] = [
      node("p1", "populate"),
      {
        id: "space_portal",
        type: "space",
        position: { x: 0, y: 0 },
        data: {
          spaceId: "space_tpl",
          _foldderSpaceInnerNodes: [
            {
              id: "d1",
              type: "designer",
              position: { x: 0, y: 0 },
              data: { label: "Home", pages: [{ id: "pg1", name: "1", layers: [] }] },
            },
            {
              id: "d2",
              type: "designer",
              position: { x: 100, y: 0 },
              data: { label: "Away", pages: [{ id: "pg2", name: "1", layers: [] }] },
            },
          ],
          _foldderSpaceInnerEdges: [
            { id: "e1", source: "d1", target: "out", sourceHandle: "document", targetHandle: "in" },
            { id: "e2", source: "d2", target: "out", sourceHandle: "document", targetHandle: "in" },
          ],
        },
      },
    ];
    const edges: Edge[] = [
      {
        id: "e_space",
        source: "space_portal",
        target: "p1",
        targetHandle: "template",
        sourceHandle: "out",
      },
    ];
    const configs = listPopulateDesignerTemplateConfigs("p1", nodes, edges);
    expect(configs).toHaveLength(2);
    expect(configs.map((c) => c.templateLabel)).toEqual(["Home", "Away"]);
    expect(configs.map((c) => c.templateNodeId)).toEqual([
      "space_portal::d1",
      "space_portal::d2",
    ]);
  });

  it("merges direct designers and space templates up to the max", async () => {
    const { listPopulateDesignerTemplateConfigs } = await import(
      "@/app/spaces/populate/populate-designer-template"
    );
    const nodes: Node[] = [
      node("p1", "populate"),
      {
        id: "d0",
        type: "designer",
        position: { x: 0, y: 0 },
        data: { label: "Direct", pages: [{ id: "pg0", name: "1", layers: [] }] },
      },
      {
        id: "space_portal",
        type: "space",
        position: { x: 0, y: 0 },
        data: {
          _foldderSpaceInnerNodes: [
            {
              id: "d1",
              type: "designer",
              position: { x: 0, y: 0 },
              data: { label: "In Space", pages: [{ id: "pg1", name: "1", layers: [] }] },
            },
          ],
          _foldderSpaceInnerEdges: [
            { id: "e1", source: "d1", target: "out", sourceHandle: "document", targetHandle: "in" },
          ],
        },
      },
    ];
    const edges: Edge[] = [
      { id: "e_direct", source: "d0", target: "p1", targetHandle: "template", sourceHandle: "document" },
      { id: "e_space", source: "space_portal", target: "p1", targetHandle: "template", sourceHandle: "out" },
    ];
    const configs = listPopulateDesignerTemplateConfigs("p1", nodes, edges);
    expect(configs).toHaveLength(2);
    expect(configs.map((c) => c.templateLabel)).toEqual(["Direct", "In Space"]);
  });
});

describe("populateDesignerTemplatesSignature", () => {
  it("cambia cuando hay un hueco dinámico dentro de un clip", async () => {
    const { populateDesignerTemplatesSignature } = await import(
      "@/app/spaces/populate/populate-designer-template"
    );
    const clip = {
      id: "clip1",
      type: "clippingContainer",
      mask: { id: "m1", type: "rect", x: 0, y: 0, width: 10, height: 10 },
      content: [
        {
          id: "t1",
          type: "text",
          _designerDatasetBinding: {
            listId: "",
            listKey: "",
            fieldId: "",
            fieldKey: "",
            kind: "text",
            slotLabel: "Nombre",
          },
        },
      ],
    };
    const basePages = [{ id: "pg1", format: "a4v", objects: [] }];
    const clippedPages = [{ id: "pg1", format: "a4v", objects: [clip] }];
    const nodes: Node[] = [
      node("p1", "populate"),
      {
        id: "d1",
        type: "designer",
        position: { x: 0, y: 0 },
        data: { pages: basePages },
      },
    ];
    const edges: Edge[] = [
      { id: "e1", source: "d1", target: "p1", targetHandle: "template", sourceHandle: "document" },
    ];
    const before = populateDesignerTemplatesSignature("p1", nodes, edges);
    nodes[1] = { ...nodes[1]!, data: { pages: clippedPages } };
    const after = populateDesignerTemplatesSignature("p1", nodes, edges);
    expect(before).not.toBe(after);
    expect(after).toContain("slot::nombre::text");
  });
});
