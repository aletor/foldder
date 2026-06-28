import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import { areNodesConnectable } from "./connection-utils";
import {
  expandSpacePortalTemplateForPipeline,
  isPopulateSpacePortalConnection,
  resolveSpacePortalInnerTemplate,
} from "./space-portal-populate-link";

function bgRemover(id: string, y: number): Node {
  return {
    id,
    type: "backgroundRemover",
    position: { x: 0, y },
    data: { label: id, value: "https://cdn/cutout.png", type: "image" },
  };
}

describe("space-portal-populate-link", () => {
  const innerNodes: Node[] = [
    bgRemover("bg1", 0),
    bgRemover("bg2", 200),
    bgRemover("bg3", 400),
    { id: "out", type: "spaceOutput", position: { x: 800, y: 0 }, data: {} },
  ];
  const spacesMap = {
    space_batch: { nodes: innerNodes, edges: [], name: "Medium Space" },
  };
  const portal: Node = {
    id: "portal1",
    type: "space",
    position: { x: 0, y: 0 },
    data: { spaceId: "space_batch", outputType: "media_list", hasInput: true, hasOutput: true },
  };
  const populate: Node = {
    id: "pop1",
    type: "populate",
    position: { x: 400, y: 0 },
    data: {},
  };

  it("resolves inner backgroundRemover template from nested space", () => {
    const inner = resolveSpacePortalInnerTemplate(portal, spacesMap);
    expect(inner?.nodeType).toBe("backgroundRemover");
    expect(inner?.sourceHandle).toBe("rgba");
  });

  it("blocks space → populate template (hard block: rompe binding dinámico / multi-canal)", () => {
    expect(
      areNodesConnectable(portal, populate, { sourceHandle: "media_list", targetHandle: "template" }, [], {
        spacesMap,
      }),
    ).toBe(false);
    // También bloqueado si el space expone salida simple `out`.
    expect(
      areNodesConnectable(portal, populate, { sourceHandle: "out", targetHandle: "template" }, [], {
        spacesMap,
      }),
    ).toBe(false);
  });

  it("allows populate out → space in (portal de salida)", () => {
    expect(
      isPopulateSpacePortalConnection(populate, portal, {
        source: populate.id,
        target: portal.id,
        sourceHandle: "out",
        targetHandle: "in",
      }),
    ).toBe(true);
    expect(
      areNodesConnectable(populate, portal, { sourceHandle: "out", targetHandle: "in" }),
    ).toBe(true);
  });

  it("allows space in ← populate out when cableando en sentido inverso", () => {
    expect(
      isPopulateSpacePortalConnection(portal, populate, {
        source: portal.id,
        target: populate.id,
        sourceHandle: "in",
        targetHandle: "out",
      }),
    ).toBe(true);
    expect(
      areNodesConnectable(portal, populate, { sourceHandle: "in", targetHandle: "out" }),
    ).toBe(true);
  });

  it("expands inner graph for pipeline discovery", () => {
    const edges: Edge[] = [
      {
        id: "e1",
        source: "portal1",
        target: "pop1",
        sourceHandle: "media_list",
        targetHandle: "template",
      },
    ];
    const expanded = expandSpacePortalTemplateForPipeline([portal, populate], edges, spacesMap);
    expect(expanded.nodes.some((n) => n.id.includes("bg1"))).toBe(true);
    const templateEdge = expanded.edges.find((e) => e.target === "pop1" && e.targetHandle === "template");
    expect(templateEdge?.source).toContain("bg1");
    expect(templateEdge?.sourceHandle).toBe("rgba");
  });
});
