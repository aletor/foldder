import { describe, expect, it } from "vitest";
import type { ActiveImageRef } from "./loop-active-refs";
import {
  buildLoopStudioSlots,
  buildLoopStudioSummary,
  estimateLoopImageCostUsd,
} from "./loop-studio-summary";

const schema = [
  { id: "f1", key: "titulo", label: "Título", type: "text" as const },
  { id: "f2", key: "imagen", label: "Imagen", type: "image" as const },
];

const refs: ActiveImageRef[] = [
  {
    inputId: "image",
    label: "Ref 1",
    kind: "image",
    fixedUrl: "https://example.com/a.png",
    sourceLabel: "Media",
  },
];

describe("loop-studio-summary", () => {
  it("lists prompt, tokens, add-token and refs", () => {
    const slots = buildLoopStudioSlots({
      promptText: "Hola {titulo}",
      bindings: {},
      activeImageRefs: refs,
      schema,
      constantFields: [],
    });
    expect(slots.map((s) => s.kind)).toEqual(["prompt", "token", "ref"]);
    expect(slots.find((s) => s.kind === "token")?.fieldKey).toBe("titulo");
  });

  it("blocks when template or rows missing", () => {
    const summary = buildLoopStudioSummary({
      templateLabel: "Image Creation",
      listName: "Catálogo",
      rowCount: 0,
      promptText: "test",
      bindings: {},
      activeImageRefs: [],
      schema,
      constantFields: [],
      model: { modelKey: "flash31", aspectRatio: "16:9", resolution: "2k", provider: "gemini" },
      datasetConnected: true,
      hasTemplate: false,
    });
    expect(summary.canGenerate).toBe(false);
    expect(summary.blockers.some((b) => b.includes("Image Creation"))).toBe(true);
  });

  it("cuenta 5 imágenes cuando el prompt usa columna del listado", () => {
    const summary = buildLoopStudioSummary({
      templateLabel: "Image Creation",
      listName: "Prompts",
      rowCount: 5,
      promptText: "{titulo}",
      bindings: {},
      activeImageRefs: [],
      schema,
      constantFields: [],
      model: { modelKey: "flash31", aspectRatio: "16:9", resolution: "2k", provider: "gemini" },
      datasetConnected: true,
      hasTemplate: true,
    });
    expect(summary.willIterate).toBe(true);
    expect(summary.expectedImageCount).toBe(5);
    expect(summary.canGenerate).toBe(true);
    expect(summary.lines.some((l) => l.includes("1 por fila"))).toBe(true);
  });

  it("cuenta 1 imagen cuando el prompt es fijo sin bindings", () => {
    const summary = buildLoopStudioSummary({
      templateLabel: "Image Creation",
      listName: "Prompts",
      rowCount: 5,
      promptText: "logo corporativo",
      bindings: {},
      activeImageRefs: [],
      schema,
      constantFields: [],
      model: { modelKey: "flash31", aspectRatio: "16:9", resolution: "2k", provider: "gemini" },
      datasetConnected: true,
      hasTemplate: true,
    });
    expect(summary.willIterate).toBe(false);
    expect(summary.expectedImageCount).toBe(1);
    expect(summary.lines.some((l) => l.includes("plantilla fija"))).toBe(true);
  });

  it("marca tokens de listado como itera por fila", () => {
    const slots = buildLoopStudioSlots({
      promptText: "Hola {titulo}",
      bindings: {},
      activeImageRefs: [],
      schema,
      constantFields: [],
    });
    expect(slots.find((s) => s.kind === "token")?.status).toContain("itera por fila");
  });

  it("estimates gemini batch cost", () => {
    const per = estimateLoopImageCostUsd({
      modelKey: "flash31",
      aspectRatio: "16:9",
      resolution: "2k",
      provider: "gemini",
    });
    expect(per).toBeGreaterThan(0);
  });
});
