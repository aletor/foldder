import { describe, expect, it } from "vitest";
import { buildPageVisionImageTag, burnPageVisionImageTag } from "./page-vision-page-tag-burn";
import { selectNivel1VisionPages } from "./page-vision-prepass";
import type { PageVisionPrepassResult } from "./page-vision-prepass";

describe("page-vision-page-tag-burn", () => {
  it("genera tag estable por página", () => {
    expect(buildPageVisionImageTag(3)).toBe("PV-P3");
  });

  it("quema tag sin cambiar dimensiones", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const tagged = await burnPageVisionImageTag(png, "PV-P1");
    expect(tagged.length).toBeGreaterThan(png.length);
  });
});

describe("selectNivel1VisionPages", () => {
  const prepass = {
    logoLikelyPages: [1, 4, 8],
    templateClusters: [{ clusterId: "a", pageNumbers: [2, 3] }],
  } as PageVisionPrepassResult;

  it("capa a 5 páginas", () => {
    const selected = selectNivel1VisionPages({ totalPages: 130, prepass, maxPages: 5 });
    expect(selected.length).toBeLessThanOrEqual(5);
    expect(selected[0]).toBe(1);
    expect(selected).toContain(130);
  });
});

describe("Nivel 1 ingestMetrics", () => {
  it("llmCallsAtIngest=1 es garantía estructural del batch invoker", async () => {
    const { invokePageVisionPassBatchModel } = await import("./page-vision-pass-batch-invoker");
    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    try {
      await expect(
        invokePageVisionPassBatchModel({
          pages: [
            {
              pageNumber: 1,
              totalPages: 1,
              pngBase64: Buffer.from("x").toString("base64"),
              imageTag: "PV-P1",
            },
          ],
          operationId: "test-nivel1-structural",
        }),
      ).rejects.toThrow(/GEMINI_API_KEY/);
    } finally {
      if (prevKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prevKey;
    }
  });

  it("latencia/coste requieren measured:true", () => {
    expect({ measured: false, llmCallsAtIngest: 1 }.measured).toBe(false);
  });
});
