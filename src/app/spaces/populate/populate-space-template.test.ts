import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import {
  findDesignerNodesFeedingSpaceOutput,
  listPopulateDesignerTemplatesFromSpacePortal,
  populateSpaceTemplateNodeId,
} from "./populate-space-template";

function designer(id: string, label: string): Node {
  return {
    id,
    type: "designer",
    position: { x: 0, y: 0 },
    data: { label, pages: [{ id: `pg-${id}`, name: "1", layers: [] }] },
  };
}

describe("populateSpaceTemplateNodeId", () => {
  it("prefixes inner designer id with space portal id", () => {
    expect(populateSpaceTemplateNodeId("space_1", "d1")).toBe("space_1::d1");
  });
});

describe("findDesignerNodesFeedingSpaceOutput", () => {
  it("returns designers wired to spaceOutput via document handle", () => {
    const nodes: Node[] = [designer("d1", "A"), designer("d2", "B")];
    const edges: Edge[] = [
      { id: "e1", source: "d1", target: "out", sourceHandle: "document", targetHandle: "in" },
      { id: "e2", source: "d2", target: "out", sourceHandle: "image", targetHandle: "in" },
    ];
    expect(findDesignerNodesFeedingSpaceOutput(nodes, edges).map((n) => n.id)).toEqual(["d1"]);
  });
});

describe("listPopulateDesignerTemplatesFromSpacePortal", () => {
  it("reads inner graph from portal cache", () => {
    const portal: Node = {
      id: "space_portal",
      type: "space",
      position: { x: 0, y: 0 },
      data: {
        _foldderSpaceInnerNodes: [designer("d1", "Kit A"), designer("d2", "Kit B")],
        _foldderSpaceInnerEdges: [
          { id: "e1", source: "d1", target: "out", sourceHandle: "document", targetHandle: "in" },
          { id: "e2", source: "d2", target: "out", sourceHandle: "document", targetHandle: "in" },
        ],
      },
    };
    const configs = listPopulateDesignerTemplatesFromSpacePortal(portal);
    expect(configs).toHaveLength(2);
    expect(configs[0]?.templateNodeId).toBe("space_portal::d1");
  });
});
