import { describe, expect, it } from "vitest";
import { estimateWalletCostForRoute } from "./wallet-cost-estimates";

describe("wallet-cost-estimates", () => {
  it("estimates Gemini image reserves from model and resolution", () => {
    const estimate = estimateWalletCostForRoute("/api/gemini/generate", {
      model: "flash31",
      resolution: "4k",
    });

    expect(estimate).toMatchObject({
      label: "Generar imagen",
      category: "image",
      tone: "confirm",
      estimatedCostMicros: 151_000,
      reserveMicros: 173_650,
    });
  });

  it("forces Veo 1080p reserves to the 8 second billing shape", () => {
    const estimate = estimateWalletCostForRoute("/api/gemini/video", {
      resolution: "1080p",
      durationSeconds: 4,
    });

    expect(estimate).toMatchObject({
      label: "Generar vídeo Veo",
      category: "video",
      tone: "strong",
      estimatedCostMicros: 480_000,
      reserveMicros: 552_000,
    });
  });

  it("keeps small text operations quiet", () => {
    const estimate = estimateWalletCostForRoute("/api/spaces/text-content", {
      text: "Corrige esta frase.",
      action: "correct",
    });

    expect(estimate?.category).toBe("text");
    expect(estimate?.tone).toBe("quiet");
    expect(estimate?.reserveMicros).toBeGreaterThan(0);
  });

  it("estimates video editor subtitle transcription from duration", () => {
    const estimate = estimateWalletCostForRoute("/api/video-editor/subtitles/transcribe", {
      durationSeconds: 120,
    });

    expect(estimate).toMatchObject({
      label: "Transcribir subtítulos",
      category: "utility",
      tone: "quiet",
      estimatedCostMicros: 12_000,
      reserveMicros: 18_000,
    });
  });

  it("estimates video editor render reserves from manifest shape", () => {
    const estimate = estimateWalletCostForRoute("/api/video-editor/render", {
      manifest: {
        durationSeconds: 30,
        settings: { fps: 30, width: 1920, height: 1080 },
      },
    });

    expect(estimate).toMatchObject({
      label: "Renderizar vídeo",
      category: "video",
      tone: "confirm",
    });
    expect(estimate?.reserveMicros).toBeGreaterThan(estimate?.estimatedCostMicros ?? 0);
  });

  it("ignores routes without a wallet-facing estimate", () => {
    expect(estimateWalletCostForRoute("/api/runway/status/task_1", {})).toBeNull();
  });
});
