import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import {
  analyzeNestedSpaceStructure,
  buildMediaSinkToSpaceOutputEdges,
  collectMediaSinkInfos,
  detectSpaceOutputMode,
  reconcileSpacePortalNode,
} from "./space-media-list";

function nano(id: string, x: number, y: number, value?: string): Node {
  return {
    id,
    type: "nanoBanana",
    position: { x, y },
    data: { label: id, value, type: "image" },
  };
}

function bgRemover(id: string, y: number, value: string, s3Key?: string): Node {
  return {
    id,
    type: "backgroundRemover",
    position: { x: 0, y },
    data: {
      label: id,
      value,
      result_rgba: value,
      type: "image",
      ...(s3Key ? { s3Key } : {}),
    },
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

  it("collection mode with background remover cutouts (PNG / data URL)", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    const nodes: Node[] = [
      bgRemover("bg1", 0, png),
      bgRemover("bg2", 200, png),
      bgRemover("bg3", 400, "https://cdn/cutout.png", "knowledge-files/user/matte/x.png"),
      { id: "out", type: "spaceOutput", position: { x: 800, y: 0 }, data: {} },
    ];
    const structure = analyzeNestedSpaceStructure(nodes, [], {
      spaceId: "space_bg",
      spaceName: "Recortes",
    });
    expect(structure.outputMode).toBe("collection");
    expect(structure.type).toBe("media_list");
    expect(structure.mediaListOutput?.items).toHaveLength(3);
    expect(structure.mediaListOutput?.items[0]?.url).toBe(png);
    expect(structure.mediaListOutput?.items[0]?.mimeType).toBe("image/png");
    expect(structure.mediaListOutput?.items[2]?.s3Key).toBe("knowledge-files/user/matte/x.png");
  });

  it("reconciles stale parent portal from inner collection space", () => {
    const png = "https://cdn/a.png";
    const innerNodes: Node[] = [
      bgRemover("bg1", 0, png),
      bgRemover("bg2", 200, png),
      bgRemover("bg3", 400, png),
      { id: "out", type: "spaceOutput", position: { x: 800, y: 0 }, data: {} },
    ];
    const spacesMap = {
      space_batch: {
        nodes: innerNodes,
        edges: [],
        name: "Medium Space",
      },
    };
    const stalePortal: Node = {
      id: "portal1",
      type: "space",
      position: { x: 0, y: 0 },
      data: {
        spaceId: "space_batch",
        label: "Medium Space",
        outputType: "url",
        hasOutput: true,
      },
    };
    const reconciled = reconcileSpacePortalNode(stalePortal, spacesMap);
    expect((reconciled.data as { outputType?: string }).outputType).toBe("media_list");
    expect((reconciled.data as { mediaListOutput?: { items?: unknown[] } }).mediaListOutput?.items).toHaveLength(3);
  });
});
