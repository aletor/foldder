import { describe, expect, it } from "vitest";
import { estimateStudioJobUsd, formatStudioUsd, clampStudioVariantCount } from "./studio-cost";
import { studioPrepareCacheKey } from "./studio-prepare-cache";
import { openAiEditMaskAlpha } from "./studio-openai-mask";
import { createStudioCard } from "./studio-types";

describe("studio-cost", () => {
  it("suma análisis de zonas y variantes", () => {
    const card = { ...createStudioCard(0), description: "cambia el cielo", paintData: "data:image/png;base64,xx" };
    const job = estimateStudioJobUsd({
      provider: "gemini",
      modelKey: "flash31",
      resolution: "2k",
      aspectRatio: "16:9",
      cards: [card],
      hasBaseImage: true,
      variantCount: 2,
    });
    expect(job.generateUsd).toBe(0.101);
    expect(job.analyzeUsd).toBe(0.02);
    expect(job.variantCount).toBe(2);
    expect(job.totalUsd).toBe(0.222);
    expect(formatStudioUsd(job.totalUsd)).toBe("~0,22 $");
  });

  it("no cobra análisis sin lazo descrito", () => {
    const job = estimateStudioJobUsd({
      provider: "openai",
      modelKey: "flare",
      resolution: "1k",
      aspectRatio: "1:1",
      cards: [],
      hasBaseImage: true,
      variantCount: 1,
    });
    expect(job.analyzeUsd).toBe(0);
    expect(clampStudioVariantCount(9)).toBe(3);
  });

  it("encarece ChatGPT si la calidad es Alta a 2K", () => {
    const medium = estimateStudioJobUsd({
      provider: "openai",
      modelKey: "flare",
      resolution: "2k",
      aspectRatio: "16:9",
      cards: [],
      hasBaseImage: false,
      quality: "medium",
    });
    const high = estimateStudioJobUsd({
      provider: "openai",
      modelKey: "flare",
      resolution: "2k",
      aspectRatio: "16:9",
      cards: [],
      hasBaseImage: false,
      quality: "high",
    });
    expect(high.generateUsd).toBeGreaterThan(medium.generateUsd);
  });

  it("encarece ChatGPT si la calidad es Máxima", () => {
    const high = estimateStudioJobUsd({
      provider: "openai",
      modelKey: "flare",
      resolution: "2k",
      aspectRatio: "16:9",
      cards: [],
      hasBaseImage: false,
      quality: "high",
    });
    const max = estimateStudioJobUsd({
      provider: "openai",
      modelKey: "flare",
      resolution: "2k",
      aspectRatio: "16:9",
      cards: [],
      hasBaseImage: false,
      quality: "max",
    });
    expect(max.generateUsd).toBeGreaterThan(high.generateUsd);
  });
});

describe("studio-prepare-cache key", () => {
  it("cambia si cambia el texto de una zona", () => {
    const base = {
      baseImage: "https://x/a.png",
      frameWidth: 1280,
      frameHeight: 720,
      global: { promptDraft: "escena", schemaData: null, text: "" },
    };
    const a = studioPrepareCacheKey({
      ...base,
      cards: [{ ...createStudioCard(0), id: "c1", description: "uno" }],
    });
    const b = studioPrepareCacheKey({
      ...base,
      cards: [{ ...createStudioCard(0), id: "c1", description: "dos" }],
    });
    expect(a).not.toBe(b);
  });
});

describe("openAiEditMaskAlpha", () => {
  it("perfora el interior del lazo y deja opaco el resto", () => {
    const pts = [];
    for (let i = 0; i <= 40; i++) pts.push({ x: 10 + i, y: 10 });
    for (let i = 0; i <= 40; i++) pts.push({ x: 50, y: 10 + i });
    for (let i = 0; i <= 40; i++) pts.push({ x: 50 - i, y: 50 });
    for (let i = 0; i <= 40; i++) pts.push({ x: 10, y: 50 - i });
    const card = {
      ...createStudioCard(0),
      description: "editar",
      lassoPoints: pts,
    };
    const alpha = openAiEditMaskAlpha(80, 80, [card]);
    expect(alpha).not.toBeNull();
    expect(alpha![30 * 80 + 30]).toBe(0);
    expect(alpha![0]).toBe(255);
  });
});
