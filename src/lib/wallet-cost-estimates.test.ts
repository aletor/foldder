import { describe, expect, it } from "vitest";
import { getAiRequestLabelForPathname } from "./ai-api-labels";
import { estimateWalletCostForRoute } from "./wallet-cost-estimates";

const WALLET_GATED_CLIENT_START_ROUTES = [
  "/api/gemini/analyze-areas",
  "/api/gemini/analyze-correction",
  "/api/gemini/describe-region",
  "/api/gemini/generate",
  "/api/gemini/generate-stream",
  "/api/openai/generate-stream",
  "/api/gemini/video",
  "/api/grok/generate",
  "/api/openai/enhance",
  "/api/runway/generate",
  "/api/seedance/video",
  "/api/spaces/assistant",
  "/api/spaces/cine/analyze",
  "/api/spaces/describe",
  "/api/spaces/matte",
  "/api/spaces/guionista",
  "/api/spaces/search",
  "/api/spaces/text-content",
  "/api/spaces/video-matte",
  "/api/video-editor/render",
  "/api/video-editor/subtitles/transcribe",
  "/api/spaces/genoma/visual/generate",
  "/api/spaces/genoma/logo/vectorize",
] as const;

function sampleBodyForRoute(route: string): Record<string, unknown> {
  if (route === "/api/gemini/generate" || route === "/api/gemini/generate-stream") {
    return { model: "flash31", prompt: "test", resolution: "2k" };
  }
  if (route === "/api/openai/generate-stream") {
    return { prompt: "test", resolution: "2k" };
  }
  if (route === "/api/gemini/video") return { durationSeconds: 8, resolution: "1080p" };
  if (route === "/api/runway/generate" || route === "/api/grok/generate") return { durationSeconds: 5 };
  if (route === "/api/seedance/video") return { duration: 5 };
  if (route === "/api/spaces/describe") return { type: "image", url: "https://example.com/a.png" };
  if (route === "/api/spaces/search") return { query: "modern workspace", verify: true, limit: 5 };
  if (route === "/api/spaces/guionista") return { task: "draft", idea: "Idea" };
  if (route === "/api/spaces/text-content") return { action: "correct", text: "Corrige esta frase." };
  if (route === "/api/spaces/assistant") return { prompt: "Create nodes", nodes: [], edges: [] };
  if (route === "/api/spaces/cine/analyze") return { script: "INT. ROOM - DAY", mode: "scenes" };
  if (route === "/api/video-editor/render") {
    return { manifest: { durationSeconds: 30, settings: { fps: 30, width: 1920, height: 1080 } } };
  }
  if (route === "/api/video-editor/subtitles/transcribe") return { durationSeconds: 120 };
  if (route === "/api/spaces/genoma/visual/generate") return { axes: { sujeto: "personas" } };
  if (route === "/api/spaces/genoma/logo/vectorize") return { logoUrl: "https://example.com/logo.png", logoSignature: "abc" };
  return {};
}

describe("wallet-cost-estimates", () => {
  it("covers every wallet-gated client start route with a label and estimate", () => {
    const missing = WALLET_GATED_CLIENT_START_ROUTES.flatMap((route) => {
      const issues: string[] = [];
      if (!getAiRequestLabelForPathname(route)) issues.push(`${route} missing AI label`);
      const estimate = estimateWalletCostForRoute(route, sampleBodyForRoute(route));
      if (!estimate || estimate.reserveMicros <= 0) issues.push(`${route} missing wallet estimate`);
      return issues;
    });

    expect(missing).toEqual([]);
  });

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

  it("estimates verified visual search for the two-pass worst case", () => {
    const estimate = estimateWalletCostForRoute("/api/spaces/search", {
      query: "modern workspace",
      verify: true,
      limit: 5,
    });

    expect(estimate).toMatchObject({
      label: "Búsqueda visual verificada",
      category: "analysis",
      tone: "confirm",
      estimatedCostMicros: 20_000,
      reserveMicros: 30_000,
    });
  });

  it("does not warn for unverified image search", () => {
    expect(estimateWalletCostForRoute("/api/spaces/search", { query: "cat", verify: false })).toBeNull();
  });

  it("ignores routes without a wallet-facing estimate", () => {
    expect(estimateWalletCostForRoute("/api/runway/status/task_1", {})).toBeNull();
  });
});
