import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import {
  buildLoopToSpaceEdge,
  computeSpacePortalPositionBeside,
  findLoopSpacePortalNode,
  resolveLoopCommitSpaceId,
} from "./loop-space-portal";

const loop: Node = {
  id: "populate_1",
  type: "loop",
  position: { x: 100, y: 200 },
  data: {},
  style: { width: 416, height: 308 },
};

describe("loop-space-portal", () => {
  it("finds a space node connected to loop", () => {
    const space: Node = { id: "space_portal", type: "space", position: { x: 0, y: 0 }, data: { spaceId: "s1" } };
    const edges: Edge[] = [
      { id: "e1", source: "populate_1", target: "space_portal", sourceHandle: "out", targetHandle: "in" },
    ];
    expect(findLoopSpacePortalNode("populate_1", [loop, space], edges)?.id).toBe("space_portal");
  });

  it("places portal to the right of loop", () => {
    const pos = computeSpacePortalPositionBeside(loop);
    expect(pos.x).toBeGreaterThan(loop.position.x);
  });

  it("reuses spaceId when portal is connected", () => {
    const portal: Node = {
      id: "space_portal",
      type: "space",
      position: { x: 0, y: 0 },
      data: { spaceId: "space_existing" },
    };
    const resolved = resolveLoopCommitSpaceId("populate_1", portal);
    expect(resolved.isNewPortal).toBe(false);
    expect(resolved.spaceId).toBe("space_existing");
    expect(resolved.portalNodeId).toBe("space_portal");
  });

  it("creates new ids when no portal is connected", () => {
    const resolved = resolveLoopCommitSpaceId("populate_1", null);
    expect(resolved.isNewPortal).toBe(true);
    expect(resolved.spaceId).toContain("space_populate_populate_1_");
    expect(resolved.portalNodeId).toContain("node_space_pop_populate_1_");
  });

  it("builds loop out → space in edge", () => {
    const edge = buildLoopToSpaceEdge("populate_1", "space_portal");
    expect(edge.source).toBe("populate_1");
    expect(edge.sourceHandle).toBe("out");
    expect(edge.target).toBe("space_portal");
    expect(edge.targetHandle).toBe("in");
  });
});
