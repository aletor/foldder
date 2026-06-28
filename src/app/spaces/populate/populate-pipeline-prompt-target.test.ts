import { describe, expect, it } from "vitest";
import type { PipelineAnalysis } from "./pipeline/discover-pipeline";
import type { ExecutorNode } from "./pipeline/node-executor";
import {
  adaptPopulateBindingsForPipeline,
  buildMultiChannelPipelinePromptTemplates,
  buildPromptTemplatesByNodeId,
  findImageGeneratorUpstreamOf,
  findPromptTemplateTargetNodeId,
} from "./populate-pipeline-prompt-target";

function analysis(overrides: Partial<PipelineAnalysis> = {}): PipelineAnalysis {
  return {
    pipelineNodeIds: [],
    order: [],
    sinkId: null,
    sinkIds: [],
    iterated: new Set(),
    constant: new Set(),
    validation: { ok: true, errors: [], sinkId: null, sinkIds: [] },
    ...overrides,
  };
}

describe("findPromptTemplateTargetNodeId", () => {
  const nodeById = new Map<string, ExecutorNode>([
    ["cat", { id: "cat", type: "concatenator" }],
    ["enh", { id: "enh", type: "enhancer" }],
    ["img", { id: "img", type: "nanoBanana" }],
  ]);

  it("prioriza concatenator antes que image creation", () => {
    expect(
      findPromptTemplateTargetNodeId(
        analysis({ order: ["cat", "img"], sinkId: "img" }),
        nodeById,
      ),
    ).toBe("cat");
  });

  it("prioriza enhancer antes que image creation", () => {
    expect(
      findPromptTemplateTargetNodeId(
        analysis({ order: ["enh", "img"], sinkId: "img" }),
        nodeById,
      ),
    ).toBe("enh");
  });
});

describe("buildPromptTemplatesByNodeId", () => {
  it("aplica templatePrompt al concatenator upstream", () => {
    const nodeById = new Map<string, ExecutorNode>([
      ["cat", { id: "cat", type: "concatenator" }],
      ["img", { id: "img", type: "nanoBanana" }],
    ]);
    const map = buildPromptTemplatesByNodeId({
      analysis: analysis({ order: ["cat", "img"], sinkId: "img" }),
      templatePrompt: "foto de jugador",
      nodeById,
    });
    expect(map).toEqual({ cat: "foto de jugador" });
  });
});

describe("adaptPopulateBindingsForPipeline", () => {
  it("namespaces prompt legacy a concatenator.p0", () => {
    const nodeById = new Map<string, ExecutorNode>([
      ["cat", { id: "cat", type: "concatenator" }],
      ["img", { id: "img", type: "nanoBanana" }],
    ]);
    const out = adaptPopulateBindingsForPipeline(
      {
        prompt: { inputId: "prompt", source: "manual", manualValue: "hola" },
      },
      analysis({ order: ["cat", "img"], sinkId: "img" }),
      nodeById,
    );
    expect(out["cat.p0"]).toEqual({
      inputId: "p0",
      source: "manual",
      manualValue: "hola",
    });
    expect(out["cat.prompt"]).toBeUndefined();
  });

  it("namespaces image legacy a cada Image Creation, no al concatenator", () => {
    const nodeById = new Map<string, ExecutorNode>([
      ["cat", { id: "cat", type: "concatenator" }],
      ["imgA", { id: "imgA", type: "nanoBanana" }],
      ["imgB", { id: "imgB", type: "nanoBanana" }],
    ]);
    const fotoBinding = {
      inputId: "image",
      source: "column" as const,
      listId: "l1",
      fieldId: "f_foto",
      fieldKey: "foto",
    };
    const out = adaptPopulateBindingsForPipeline(
      { image: fotoBinding },
      analysis({
        order: ["cat", "imgA", "imgB"],
        sinkIds: ["imgA", "imgB"],
      }),
      nodeById,
    );
    expect(out["imgA.image"]).toEqual(fotoBinding);
    expect(out["imgB.image"]).toEqual(fotoBinding);
    expect(out["cat.image"]).toBeUndefined();
  });
});

describe("buildMultiChannelPipelinePromptTemplates", () => {
  it("base al concatenator compartido + delta al generador de cada canal", () => {
    const nodeById = new Map<string, ExecutorNode>([
      ["cat", { id: "cat", type: "concatenator" }],
      ["imgA", { id: "imgA", type: "nanoBanana" }],
      ["bgA", { id: "bgA", type: "backgroundRemover" }],
      ["imgB", { id: "imgB", type: "nanoBanana" }],
      ["bgB", { id: "bgB", type: "backgroundRemover" }],
    ]);
    const edges = [
      { source: "cat", target: "imgA", sourceHandle: "prompt", targetHandle: "prompt" },
      { source: "imgA", target: "bgA", sourceHandle: "image", targetHandle: "media" },
      { source: "cat", target: "imgB", sourceHandle: "prompt", targetHandle: "prompt" },
      { source: "imgB", target: "bgB", sourceHandle: "image", targetHandle: "media" },
    ];
    const pipelineNodeIds = ["cat", "imgA", "bgA", "imgB", "bgB"];
    const map = buildMultiChannelPipelinePromptTemplates({
      channels: [
        { channelId: "bgA", nodePrompt: "", channelPrompt: "de frente" },
        { channelId: "bgB", nodePrompt: "", channelPrompt: "de perfil" },
      ],
      analysis: analysis({
        order: ["cat", "imgA", "imgB", "bgA", "bgB"],
        pipelineNodeIds,
        sinkIds: ["bgA", "bgB"],
      }),
      edges,
      nodeById,
      templatePrompt: "identidad compartida",
    });
    expect(map?.cat).toBe("identidad compartida");
    expect(map?.imgA).toBe("de frente");
    expect(map?.imgB).toBe("de perfil");
  });
});

describe("findImageGeneratorUpstreamOf", () => {
  it("encuentra nanoBanana upstream de backgroundRemover", () => {
    const nodeById = new Map<string, ExecutorNode>([
      ["img", { id: "img", type: "nanoBanana" }],
      ["bg", { id: "bg", type: "backgroundRemover" }],
    ]);
    const id = findImageGeneratorUpstreamOf(
      "bg",
      [{ source: "img", target: "bg", sourceHandle: "image", targetHandle: "media" }],
      new Set(["img", "bg"]),
      nodeById,
    );
    expect(id).toBe("img");
  });
});
