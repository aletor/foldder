import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import {
  analyzeNestedSpaceStructure,
  buildMediaSinkToSpaceOutputEdges,
  collectMediaSinkInfos,
  detectSpaceOutputMode,
} from "./space-media-list";

function nano(id: string, x: number, y: number, value?: string): Node {
  return {
    id,
    type: "nanoBanana",
    position: { x, y },
    data: { label: id, value, type: "image" },
  };
}

describe("space-media-list", () => {
  it("detects collection mode with 2+ parallel image sinks", () => {
    const nodes: Node[] = [
      nano("a", 0, 0, "https://a.jpg"),
      nano("b", 0, 200, "https://b.jpg"),
      { id: "out", type: "spaceOutput", position: { x: 800, y: 0 }, data: {} },
    ];
    const sinks = collectMediaSinkInfos(nodes, []);
    expect(sinks).toHaveLength(2);
    expect(detectSpaceOutputMode(sinks)).toBe("collection");
  });

  it("builds media_list output for collection mode", () => {
    const nodes: Node[] = [
      nano("a", 0, 0, "https://a.jpg"),
      nano("b", 0, 200, "https://b.jpg"),
      { id: "out", type: "spaceOutput", position: { x: 800, y: 0 }, data: {} },
    ];
    const structure = analyzeNestedSpaceStructure(nodes, [], {
      spaceId: "space_test",
      spaceName: "Batch",
    });
    expect(structure.outputMode).toBe("collection");
    expect(structure.type).toBe("media_list");
    expect(structure.mediaListOutput?.items).toHaveLength(2);
    expect(structure.mediaListOutput?.items[0]?.url).toBe("https://a.jpg");
  });

  it("scalar mode for single sink pipeline", () => {
    const a = nano("a", 0, 0, "https://solo.jpg");
    const b: Node = { id: "b", type: "promptInput", position: { x: 300, y: 0 }, data: { value: "hi" } };
    const nodes: Node[] = [
      b,
      a,
      { id: "out", type: "spaceOutput", position: { x: 800, y: 0 }, data: {} },
    ];
    const edges: Edge[] = [
      { id: "e1", source: "b", target: "a", sourceHandle: "prompt", targetHandle: "prompt" },
      { id: "e2", source: "a", target: "out", sourceHandle: "image", targetHandle: "in" },
    ];
    const structure = analyzeNestedSpaceStructure(nodes, edges);
    expect(structure.outputMode).toBe("scalar");
    expect(structure.type).toBe("image");
    expect(structure.value).toBe("https://solo.jpg");
    expect(structure.mediaListOutput).toBeNull();
  });

  it("builds parallel edges to spaceOutput", () => {
    const edges = buildMediaSinkToSpaceOutputEdges([
      { nodeId: "a", sourceHandle: "image" },
      { nodeId: "b", sourceHandle: "image" },
    ]);
    expect(edges).toHaveLength(2);
    expect(edges.every((e) => e.target === "out" && e.targetHandle === "in")).toBe(true);
  });
});
