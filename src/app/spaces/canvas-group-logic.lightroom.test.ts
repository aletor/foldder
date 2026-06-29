import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import { resolvePromptValueFromEdgeSource } from "./canvas-group-logic";

describe("resolvePromptValueFromEdgeSource lightroom", () => {
  const edge: Pick<Edge, "source" | "sourceHandle"> = { source: "lr1", sourceHandle: "image" };

  it("prefers previewDataUrl over stale value", () => {
    const nodes: Node[] = [
      {
        id: "lr1",
        type: "lightroom",
        position: { x: 0, y: 0 },
        data: {
          previewDataUrl: "data:image/png;base64,PREVIEW",
          value: "data:image/png;base64,OLD_EXPORT",
        },
      },
    ];
    expect(resolvePromptValueFromEdgeSource(edge, nodes)).toBe("data:image/png;base64,PREVIEW");
  });

  it("falls back to value when preview is missing", () => {
    const nodes: Node[] = [
      {
        id: "lr1",
        type: "lightroom",
        position: { x: 0, y: 0 },
        data: { value: "data:image/png;base64,EXPORTED" },
      },
    ];
    expect(resolvePromptValueFromEdgeSource(edge, nodes)).toBe("data:image/png;base64,EXPORTED");
  });
});
