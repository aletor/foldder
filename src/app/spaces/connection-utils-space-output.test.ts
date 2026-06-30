import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import { areNodesConnectable } from "./connection-utils";

function node(id: string, type: string): Node {
  return { id, type, position: { x: 0, y: 0 }, data: {} };
}

describe("spaceOutput connections", () => {
  const spaceOut = node("out", "spaceOutput");

  it("accepts designer document → spaceOutput in", () => {
    const designer = node("d1", "designer");
    expect(
      areNodesConnectable(designer, spaceOut, {
        sourceHandle: "document",
        targetHandle: "in",
      }),
    ).toBe(true);
  });

  it("accepts multiple designers document → same spaceOutput in", () => {
    const d1 = node("d1", "designer");
    const d2 = node("d2", "designer");
    expect(
      areNodesConnectable(d1, spaceOut, { sourceHandle: "document", targetHandle: "in" }),
    ).toBe(true);
    expect(
      areNodesConnectable(d2, spaceOut, { sourceHandle: "document", targetHandle: "in" }),
    ).toBe(true);
  });

  it("still accepts designer image → spaceOutput in", () => {
    const designer = node("d1", "designer");
    expect(
      areNodesConnectable(designer, spaceOut, {
        sourceHandle: "image",
        targetHandle: "in",
      }),
    ).toBe(true);
  });
});
