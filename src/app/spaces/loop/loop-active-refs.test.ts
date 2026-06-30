import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import { resolveActiveImageRefs } from "./loop-active-refs";
import type { CreativeInputDescriptor } from "./loop-types";

const imageInputs: CreativeInputDescriptor[] = [
  { inputId: "image", label: "Ref 1 (Base)", kind: "image" },
  { inputId: "image2", label: "Ref 2", kind: "image" },
  { inputId: "image3", label: "Ref 3", kind: "image" },
  { inputId: "image4", label: "Ref 4", kind: "image" },
];

describe("resolveActiveImageRefs", () => {
  it("devuelve solo slots con cable y URL resuelta", () => {
    const nodes: Node[] = [
      { id: "nano1", type: "nanoBanana", position: { x: 0, y: 0 }, data: {} },
      { id: "m1", type: "mediaInput", position: { x: 0, y: 0 }, data: { label: "Fondo", value: "https://cdn/fondo.png" } },
      { id: "m3", type: "mediaInput", position: { x: 0, y: 0 }, data: { label: "Jugador", value: "https://cdn/jugador.png" } },
    ];
    const edges: Edge[] = [
      { id: "e1", source: "m1", target: "nano1", sourceHandle: "media", targetHandle: "image" },
      { id: "e3", source: "m3", target: "nano1", sourceHandle: "media", targetHandle: "image3" },
    ];
    const active = resolveActiveImageRefs({
      templateNodeId: "nano1",
      imageInputs,
      nodes,
      edges,
    });
    expect(active.map((r) => r.inputId)).toEqual(["image", "image3"]);
    expect(active[0]?.fixedUrl).toBe("https://cdn/fondo.png");
    expect(active[0]?.sourceLabel).toBe("Fondo");
    expect(active[1]?.fixedUrl).toBe("https://cdn/jugador.png");
  });

  it("ignora handles sin cable o sin URL", () => {
    const nodes: Node[] = [
      { id: "nano1", type: "nanoBanana", position: { x: 0, y: 0 }, data: {} },
      { id: "mEmpty", type: "mediaInput", position: { x: 0, y: 0 }, data: {} },
    ];
    const edges: Edge[] = [
      { id: "e1", source: "mEmpty", target: "nano1", sourceHandle: "media", targetHandle: "image2" },
    ];
    expect(
      resolveActiveImageRefs({ templateNodeId: "nano1", imageInputs, nodes, edges }),
    ).toEqual([]);
  });
});
