import { describe, expect, it } from "vitest";
import {
  findPopulateTemplateLinkEdge,
  isPopulateTemplateLinkEdge,
} from "./populate-template-link";

describe("populate-template-link", () => {
  const nodes = [
    { id: "pop1", type: "populate" },
    { id: "nano1", type: "nanoBanana" },
    { id: "export1", type: "imageExport" },
  ];

  it("accepts image out → populate template", () => {
    const edge = {
      id: "e1",
      source: "nano1",
      target: "pop1",
      sourceHandle: "image",
      targetHandle: "template",
    };
    expect(isPopulateTemplateLinkEdge(edge, "pop1", "nanoBanana")).toBe(true);
    expect(findPopulateTemplateLinkEdge("pop1", nodes, [edge as any])?.id).toBe("e1");
  });

  it("accepts legacy template → populate template", () => {
    const edge = {
      id: "e2",
      source: "nano1",
      target: "pop1",
      sourceHandle: "template",
      targetHandle: "template",
    };
    expect(isPopulateTemplateLinkEdge(edge, "pop1", "nanoBanana")).toBe(true);
  });

  it("rejects non-orchestrable sources", () => {
    const edge = {
      id: "e3",
      source: "export1",
      target: "pop1",
      sourceHandle: "image",
      targetHandle: "template",
    };
    expect(isPopulateTemplateLinkEdge(edge, "pop1", "imageExport")).toBe(false);
    expect(findPopulateTemplateLinkEdge("pop1", nodes, [edge as any])).toBeUndefined();
  });

  it("accepts backgroundRemover rgba → populate template", () => {
    const edge = {
      id: "e4",
      source: "bg1",
      target: "pop1",
      sourceHandle: "rgba",
      targetHandle: "template",
    };
    expect(isPopulateTemplateLinkEdge(edge, "pop1", "backgroundRemover")).toBe(true);
    const nodesWithBg = [
      ...nodes,
      { id: "bg1", type: "backgroundRemover" },
    ];
    expect(findPopulateTemplateLinkEdge("pop1", nodesWithBg, [edge as any])?.id).toBe("e4");
  });

  it("accepts nested space media_list → populate template", () => {
    const edge = {
      id: "e5",
      source: "space1",
      target: "pop1",
      sourceHandle: "media_list",
      targetHandle: "template",
    };
    expect(isPopulateTemplateLinkEdge(edge, "pop1", "space")).toBe(true);
    const nodesWithSpace = [
      ...nodes,
      { id: "space1", type: "space" },
    ];
    expect(findPopulateTemplateLinkEdge("pop1", nodesWithSpace, [edge as any])?.id).toBe("e5");
  });
});
