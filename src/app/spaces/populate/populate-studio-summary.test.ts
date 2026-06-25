import { describe, expect, it } from "vitest";
import type { ActiveImageRef } from "./populate-active-refs";
import {
  buildPopulateStudioSlots,
  buildPopulateStudioSummary,
  estimatePopulateImageCostUsd,
} from "./populate-studio-summary";

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

describe("populate-studio-summary", () => {
  it("lists prompt, tokens, add-token and refs", () => {
    const slots = buildPopulateStudioSlots({
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
    const summary = buildPopulateStudioSummary({
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

  it("estimates gemini batch cost", () => {
    const per = estimatePopulateImageCostUsd({
      modelKey: "flash31",
      aspectRatio: "16:9",
      resolution: "2k",
      provider: "gemini",
    });
    expect(per).toBeGreaterThan(0);
  });
});
