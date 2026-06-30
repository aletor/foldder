import { describe, expect, it } from "vitest";
import {
  analyzePipeline,
  classifyConstantIterated,
  discoverPipelineNodeIds,
  findPipelineSinkId,
  findPipelineSinkIds,
  topoSortPipeline,
  validatePipeline,
  type PipelineEdge,
  type PipelineNodeRef,
} from "./discover-pipeline";

type N = PipelineNodeRef;

function edge(source: string, target: string, targetHandle?: string): PipelineEdge {
  return { source, target, targetHandle: targetHandle ?? null };
}

describe("discoverPipeline — descubrimiento del subgrafo", () => {
  it("tubería de longitud 1: un solo nodo creativo es el sink (≡ comportamiento actual)", () => {
    const nodes: N[] = [
      { id: "pop", type: "loop" },
      { id: "ds", type: "dataset" },
      { id: "img", type: "nanoBanana" },
    ];
    const edges: PipelineEdge[] = [
      edge("ds", "pop", "dataset"),
      edge("img", "pop", "template"),
    ];
    expect(discoverPipelineNodeIds("pop", nodes, edges)).toEqual(["img"]);
    expect(findPipelineSinkId("pop", edges)).toBe("img");
  });

  it("el Dataset es frontera: nunca entra en la tubería", () => {
    const nodes: N[] = [
      { id: "pop", type: "loop" },
      { id: "ds", type: "dataset" },
      { id: "img", type: "nanoBanana" },
    ];
    const edges: PipelineEdge[] = [
      edge("ds", "pop", "dataset"),
      edge("ds", "img", "dataset"), // dataset también conectado directo al creativo
      edge("img", "pop", "template"),
    ];
    const ids = discoverPipelineNodeIds("pop", nodes, edges);
    expect(ids).toContain("img");
    expect(ids).not.toContain("ds");
  });

  it("mediaInput y promptInput son frontera: no entran en la tubería", () => {
    const nodes: N[] = [
      { id: "pop", type: "loop" },
      { id: "ds", type: "dataset" },
      { id: "img", type: "nanoBanana" },
      { id: "pr", type: "promptInput" },
      { id: "mi", type: "mediaInput" },
    ];
    const edges: PipelineEdge[] = [
      edge("ds", "pop", "dataset"),
      { source: "pr", target: "img", sourceHandle: "prompt", targetHandle: "prompt" },
      { source: "mi", target: "img", sourceHandle: "media", targetHandle: "image" },
      edge("img", "pop", "template"),
    ];
    expect(discoverPipelineNodeIds("pop", nodes, edges)).toEqual(["img"]);
    const analysis = analyzePipeline({
      loopId: "pop",
      nodes,
      edges,
      datasetBoundNodeIds: new Set(["img"]),
    });
    expect(analysis.order).toEqual(["img"]);
    expect(analysis.validation.ok).toBe(true);
  });

  it("painter es frontera: ref de imagen fija sin ejecución en la tubería", () => {
    const nodes: N[] = [
      { id: "pop", type: "loop" },
      { id: "ds", type: "dataset" },
      { id: "img", type: "nanoBanana" },
      { id: "bg", type: "backgroundRemover" },
      { id: "pt", type: "painter" },
    ];
    const edges: PipelineEdge[] = [
      edge("ds", "pop", "dataset"),
      { source: "pt", target: "img", sourceHandle: "image", targetHandle: "image2" },
      edge("img", "bg", "image"),
      edge("bg", "pop", "template"),
    ];
    expect(discoverPipelineNodeIds("pop", nodes, edges)).toEqual(["bg", "img"]);
    const analysis = analyzePipeline({
      loopId: "pop",
      nodes,
      edges,
      datasetBoundNodeIds: new Set(["img"]),
    });
    expect(analysis.order).toEqual(["img", "bg"]);
    expect(analysis.validation.ok).toBe(true);
    expect(analysis.order).not.toContain("pt");
  });

  it("cadena lineal de 3 nodos: descubre toda la tubería hacia atrás", () => {
    const nodes: N[] = [
      { id: "pop", type: "loop" },
      { id: "ds", type: "dataset" },
      { id: "img", type: "nanoBanana" },
      { id: "bg", type: "layerizer" },
      { id: "up", type: "upscaler" },
    ];
    // up → bg → img → pop
    const edges: PipelineEdge[] = [
      edge("ds", "pop", "dataset"),
      edge("up", "pop", "template"),
      edge("bg", "up", "image"),
      edge("img", "bg", "image"),
    ];
    expect(new Set(discoverPipelineNodeIds("pop", nodes, edges))).toEqual(
      new Set(["up", "bg", "img"]),
    );
  });

  it("DAG que reconverge antes de Loop: dos ramas que se unen en un compositor", () => {
    const nodes: N[] = [
      { id: "pop", type: "loop" },
      { id: "ds", type: "dataset" },
      { id: "imgA", type: "nanoBanana" },
      { id: "imgB", type: "nanoBanana" },
      { id: "comp", type: "compositor" },
    ];
    const edges: PipelineEdge[] = [
      edge("ds", "pop", "dataset"),
      edge("comp", "pop", "template"),
      edge("imgA", "comp", "image"),
      edge("imgB", "comp", "image2"),
    ];
    expect(new Set(discoverPipelineNodeIds("pop", nodes, edges))).toEqual(
      new Set(["comp", "imgA", "imgB"]),
    );
  });

  it("una fuente externa no-Dataset (Brain) SÍ entra en la tubería", () => {
    const nodes: N[] = [
      { id: "pop", type: "loop" },
      { id: "ds", type: "dataset" },
      { id: "img", type: "nanoBanana" },
      { id: "brain", type: "projectBrain" },
    ];
    const edges: PipelineEdge[] = [
      edge("ds", "pop", "dataset"),
      edge("img", "pop", "template"),
      edge("brain", "img", "brain"),
    ];
    expect(new Set(discoverPipelineNodeIds("pop", nodes, edges))).toEqual(
      new Set(["img", "brain"]),
    );
  });

  it("ignora aristas colgantes (a nodos inexistentes)", () => {
    const nodes: N[] = [
      { id: "pop", type: "loop" },
      { id: "img", type: "nanoBanana" },
    ];
    const edges: PipelineEdge[] = [
      edge("img", "pop", "template"),
      edge("ghost", "img", "image"),
    ];
    expect(discoverPipelineNodeIds("pop", nodes, edges)).toEqual(["img"]);
  });
});

describe("topoSortPipeline", () => {
  it("ordena productores antes que consumidores", () => {
    const edges: PipelineEdge[] = [
      edge("img", "bg"),
      edge("bg", "up"),
    ];
    const res = topoSortPipeline(["up", "bg", "img"], edges);
    expect(res.ok).toBe(true);
    expect(res.order.indexOf("img")).toBeLessThan(res.order.indexOf("bg"));
    expect(res.order.indexOf("bg")).toBeLessThan(res.order.indexOf("up"));
  });

  it("detecta ciclos", () => {
    const edges: PipelineEdge[] = [
      edge("a", "b"),
      edge("b", "a"),
    ];
    const res = topoSortPipeline(["a", "b"], edges);
    expect(res.ok).toBe(false);
    expect(new Set(res.cyclic)).toEqual(new Set(["a", "b"]));
  });
});

describe("classifyConstantIterated", () => {
  it("propaga 'iterado' aguas abajo desde el nodo bound al Dataset", () => {
    // img(bound) → bg → up
    const edges: PipelineEdge[] = [
      edge("img", "bg"),
      edge("bg", "up"),
    ];
    const order = topoSortPipeline(["img", "bg", "up"], edges).order;
    const { iterated, constant } = classifyConstantIterated({
      order,
      edges,
      datasetBoundNodeIds: new Set(["img"]),
    });
    expect(iterated).toEqual(new Set(["img", "bg", "up"]));
    expect(constant.size).toBe(0);
  });

  it("una constante (Brain) que alimenta un iterado sigue siendo constante", () => {
    // brain(const) → img(bound, iterado)
    const edges: PipelineEdge[] = [edge("brain", "img")];
    const order = topoSortPipeline(["brain", "img"], edges).order;
    const { iterated, constant } = classifyConstantIterated({
      order,
      edges,
      datasetBoundNodeIds: new Set(["img"]),
    });
    expect(iterated).toEqual(new Set(["img"]));
    expect(constant).toEqual(new Set(["brain"]));
  });

  it("sin bindings al Dataset, todo es constante", () => {
    const edges: PipelineEdge[] = [edge("a", "b")];
    const order = topoSortPipeline(["a", "b"], edges).order;
    const { iterated, constant } = classifyConstantIterated({
      order,
      edges,
      datasetBoundNodeIds: new Set(),
    });
    expect(iterated.size).toBe(0);
    expect(constant).toEqual(new Set(["a", "b"]));
  });
});

describe("validatePipeline", () => {
  const base: N[] = [
    { id: "pop", type: "loop" },
    { id: "ds", type: "dataset" },
    { id: "img", type: "nanoBanana" },
  ];

  it("acepta una tubería válida con sink único", () => {
    const edges: PipelineEdge[] = [
      edge("ds", "pop", "dataset"),
      edge("img", "pop", "template"),
    ];
    const v = validatePipeline({ loopId: "pop", nodes: base, edges });
    expect(v.ok).toBe(true);
    expect(v.sinkId).toBe("img");
    expect(v.sinkIds).toEqual(["img"]);
  });

  it("acepta sink múltiple como canales de salida (uno por conexión a plantilla)", () => {
    const nodes: N[] = [...base, { id: "img2", type: "nanoBanana" }];
    const edges: PipelineEdge[] = [
      edge("ds", "pop", "dataset"),
      edge("img", "pop", "template"),
      edge("img2", "pop", "template"),
    ];
    const v = validatePipeline({ loopId: "pop", nodes, edges });
    expect(v.ok).toBe(true);
    // No hay sink "primario" único, pero sí dos canales.
    expect(v.sinkId).toBeNull();
    expect(new Set(v.sinkIds)).toEqual(new Set(["img", "img2"]));
  });

  it("falla si no hay ningún sink (nada conectado a la plantilla)", () => {
    const edges: PipelineEdge[] = [edge("ds", "pop", "dataset")];
    const v = validatePipeline({ loopId: "pop", nodes: base, edges });
    expect(v.ok).toBe(false);
    expect(v.sinkIds).toEqual([]);
    expect(v.errors.some((e) => /no tiene plantilla/i.test(e))).toBe(true);
  });

  it("prohíbe Loop anidado dentro de la tubería (v1)", () => {
    const nodes: N[] = [...base, { id: "pop2", type: "loop" }];
    const edges: PipelineEdge[] = [
      edge("ds", "pop", "dataset"),
      edge("img", "pop", "template"),
      edge("pop2", "img", "template"),
    ];
    const v = validatePipeline({ loopId: "pop", nodes, edges });
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => /anidado/i.test(e))).toBe(true);
  });

  it("rechaza ciclos en la tubería", () => {
    const nodes: N[] = [
      { id: "pop", type: "loop" },
      { id: "a", type: "nanoBanana" },
      { id: "b", type: "layerizer" },
    ];
    const edges: PipelineEdge[] = [
      edge("a", "pop", "template"),
      edge("b", "a", "image"),
      edge("a", "b", "image"), // ciclo a↔b
    ];
    const v = validatePipeline({ loopId: "pop", nodes, edges });
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => /ciclo/i.test(e))).toBe(true);
  });
});

describe("analyzePipeline — integración", () => {
  it("descubre, ordena, clasifica y valida una cadena Brain + Image → Background", () => {
    const nodes: N[] = [
      { id: "pop", type: "loop" },
      { id: "ds", type: "dataset" },
      { id: "brain", type: "projectBrain" },
      { id: "img", type: "nanoBanana" },
      { id: "bg", type: "layerizer" },
    ];
    const edges: PipelineEdge[] = [
      edge("ds", "pop", "dataset"),
      edge("bg", "pop", "template"),
      edge("img", "bg", "image"),
      edge("brain", "img", "brain"),
    ];
    const analysis = analyzePipeline({
      loopId: "pop",
      nodes,
      edges,
      datasetBoundNodeIds: new Set(["img"]), // el prompt/ref de img lee una columna
    });

    expect(analysis.validation.ok).toBe(true);
    expect(analysis.sinkId).toBe("bg");
    expect(new Set(analysis.pipelineNodeIds)).toEqual(new Set(["brain", "img", "bg"]));
    // brain constante; img y bg iterados (bg hereda de img).
    expect(analysis.constant).toEqual(new Set(["brain"]));
    expect(analysis.iterated).toEqual(new Set(["img", "bg"]));
    // orden: brain antes que img; img antes que bg.
    expect(analysis.order.indexOf("brain")).toBeLessThan(analysis.order.indexOf("img"));
    expect(analysis.order.indexOf("img")).toBeLessThan(analysis.order.indexOf("bg"));
  });

  it("multi-canal: dos creadores comparten un Brain → unión de subgrafos, 2 sinks", () => {
    const nodes: N[] = [
      { id: "pop", type: "loop" },
      { id: "ds", type: "dataset" },
      { id: "brain", type: "projectBrain" },
      { id: "imgA", type: "nanoBanana" },
      { id: "imgB", type: "nanoBanana" },
    ];
    const edges: PipelineEdge[] = [
      edge("ds", "pop", "dataset"),
      edge("imgA", "pop", "template"),
      edge("imgB", "pop", "template"),
      edge("brain", "imgA", "brain"),
      edge("brain", "imgB", "brain"),
    ];

    expect(new Set(findPipelineSinkIds("pop", edges))).toEqual(new Set(["imgA", "imgB"]));

    const analysis = analyzePipeline({
      loopId: "pop",
      nodes,
      edges,
      datasetBoundNodeIds: new Set(["imgA", "imgB"]),
    });

    expect(analysis.validation.ok).toBe(true);
    expect(analysis.sinkId).toBeNull(); // no hay sink primario único
    expect(new Set(analysis.sinkIds)).toEqual(new Set(["imgA", "imgB"]));
    // El Brain compartido se descubre UNA sola vez (deduplicado por id) y es constante.
    expect(new Set(analysis.pipelineNodeIds)).toEqual(new Set(["brain", "imgA", "imgB"]));
    expect(analysis.constant).toEqual(new Set(["brain"]));
    expect(analysis.iterated).toEqual(new Set(["imgA", "imgB"]));
  });
});
