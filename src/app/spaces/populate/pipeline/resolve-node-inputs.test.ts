import { describe, expect, it } from "vitest";
import {
  portValueFromOutput,
  resolveNodeInputs,
  type PipelineScope,
} from "./resolve-node-inputs";
import type { PipelineEdge } from "./discover-pipeline";
import type { ExecutorNode, PortInputValue } from "./node-executor";

const node: ExecutorNode = { id: "img", type: "nanoBanana" };

function edge(source: string, target: string, targetHandle: string): PipelineEdge {
  return { source, target, targetHandle };
}

describe("portValueFromOutput", () => {
  it("mapea cada tipo de output a su valor de input", () => {
    expect(portValueFromOutput({ kind: "text", text: "hola" })).toEqual({ kind: "text", text: "hola" });
    expect(portValueFromOutput({ kind: "image", url: "u", s3Key: "k" })).toEqual({
      kind: "image",
      url: "u",
      s3Key: "k",
    });
    expect(portValueFromOutput({ kind: "text", text: "" })).toBeUndefined();
    expect(portValueFromOutput({ kind: "image" })).toBeUndefined();
    expect(portValueFromOutput(undefined)).toBeUndefined();
  });
});

describe("resolveNodeInputs", () => {
  it("toma el valor de un nodo upstream de la tubería (scope)", () => {
    const scope: PipelineScope = { up: { kind: "image", url: "https://s/up.png", s3Key: "k" } };
    const res = resolveNodeInputs({
      node,
      inputHandles: [{ id: "image", kind: "image" }],
      edges: [edge("up", "img", "image")],
      pipelineNodeIds: new Set(["up", "img"]),
      scope,
    });
    expect(res.inputs.byHandle.image).toEqual({ kind: "image", url: "https://s/up.png", s3Key: "k" });
  });

  it("usa el valor fijo de una fuente externa (no pertenece a la tubería)", () => {
    const fixed: Record<string, PortInputValue> = {
      mi: { kind: "image", url: "https://s/fixed.png" },
    };
    const res = resolveNodeInputs({
      node,
      inputHandles: [{ id: "image", kind: "image" }],
      edges: [edge("mi", "img", "image")],
      pipelineNodeIds: new Set(["img"]), // 'mi' es externo
      scope: {},
      resolveFixedInput: (e) => fixed[e.source],
    });
    expect(res.inputs.byHandle.image).toEqual({ kind: "image", url: "https://s/fixed.png" });
  });

  it("el override de columna gana sobre el upstream y rellena byHandle si es media", () => {
    const scope: PipelineScope = { up: { kind: "image", url: "https://s/up.png" } };
    const res = resolveNodeInputs({
      node,
      inputHandles: [
        { id: "prompt", kind: "text" },
        { id: "image", kind: "image" },
      ],
      edges: [edge("up", "img", "image")],
      pipelineNodeIds: new Set(["up", "img"]),
      scope,
      bindableKeys: ["prompt", "image"],
      resolveColumnOverride: (nodeId, key) => {
        if (nodeId !== "img") return undefined;
        if (key === "prompt") return { kind: "text", text: "prompt de la fila" };
        if (key === "image") return { kind: "image", url: "https://s/col.png", s3Key: "ck" };
        return undefined;
      },
    });
    expect(res.overrides.prompt).toBe("prompt de la fila");
    expect(res.overrides.image).toBe("https://s/col.png");
    // la columna pisa el upstream en el handle de imagen
    expect(res.inputs.byHandle.image).toEqual({ kind: "image", url: "https://s/col.png", s3Key: "ck" });
  });

  it("sin fuente para un handle, queda sin valor (el executor cae a node.data)", () => {
    const res = resolveNodeInputs({
      node,
      inputHandles: [{ id: "prompt", kind: "text" }],
      edges: [],
      pipelineNodeIds: new Set(["img"]),
      scope: {},
    });
    expect(res.inputs.byHandle.prompt).toBeUndefined();
    expect(res.overrides).toEqual({});
  });
});
