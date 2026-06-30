import { describe, expect, it } from "vitest";
import {
  findLoopTemplateLinkEdge,
  isLoopTemplateLinkEdge,
} from "./loop-template-link";

describe("loop-template-link", () => {
  const nodes = [
    { id: "pop1", type: "loop" },
    { id: "nano1", type: "nanoBanana" },
    { id: "export1", type: "imageExport" },
  ];

  it("accepts image out → loop template", () => {
    const edge = {
      id: "e1",
      source: "nano1",
      target: "pop1",
      sourceHandle: "image",
      targetHandle: "template",
    };
    expect(isLoopTemplateLinkEdge(edge, "pop1", "nanoBanana")).toBe(true);
    expect(findLoopTemplateLinkEdge("pop1", nodes, [edge as any])?.id).toBe("e1");
  });

  it("accepts legacy template → loop template", () => {
    const edge = {
      id: "e2",
      source: "nano1",
      target: "pop1",
      sourceHandle: "template",
      targetHandle: "template",
    };
    expect(isLoopTemplateLinkEdge(edge, "pop1", "nanoBanana")).toBe(true);
  });

  it("rejects non-orchestrable sources", () => {
    const edge = {
      id: "e3",
      source: "export1",
      target: "pop1",
      sourceHandle: "image",
      targetHandle: "template",
    };
    expect(isLoopTemplateLinkEdge(edge, "pop1", "imageExport")).toBe(false);
    expect(findLoopTemplateLinkEdge("pop1", nodes, [edge as any])).toBeUndefined();
  });

  it("accepts backgroundRemover rgba → loop template", () => {
    const edge = {
      id: "e4",
      source: "bg1",
      target: "pop1",
      sourceHandle: "rgba",
      targetHandle: "template",
    };
    expect(isLoopTemplateLinkEdge(edge, "pop1", "backgroundRemover")).toBe(true);
    const nodesWithBg = [
      ...nodes,
      { id: "bg1", type: "backgroundRemover" },
    ];
    expect(findLoopTemplateLinkEdge("pop1", nodesWithBg, [edge as any])?.id).toBe("e4");
  });

  it("accepts nested space media_list → loop template", () => {
    const edge = {
      id: "e5",
      source: "space1",
      target: "pop1",
      sourceHandle: "media_list",
      targetHandle: "template",
    };
    expect(isLoopTemplateLinkEdge(edge, "pop1", "space")).toBe(true);
    const nodesWithSpace = [
      ...nodes,
      { id: "space1", type: "space" },
    ];
    expect(findLoopTemplateLinkEdge("pop1", nodesWithSpace, [edge as any])?.id).toBe("e5");
  });
});
