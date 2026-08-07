import { describe, expect, it } from "vitest";
import { parseGeminiProviderError } from "./gemini-provider-error";

describe("parseGeminiProviderError", () => {
  it("detecta tope de gasto mensual de AI Studio", () => {
    const err = new Error(
      JSON.stringify({
        error: {
          code: 429,
          message:
            "Your project has exceeded its monthly spending cap. Please go to AI Studio at https://ai.studio/spend to manage your project spend cap.",
          status: "RESOURCE_EXHAUSTED",
        },
      }),
    );
    const info = parseGeminiProviderError(err);
    expect(info?.status).toBe(429);
    expect(info?.userMessage).toMatch(/tope de gasto/i);
    expect(info?.userMessage).toContain("ai.studio/spend");
  });

  it("devuelve null si no es cuota", () => {
    expect(parseGeminiProviderError(new Error("Veo terminó pero no devolvió un vídeo"))).toBeNull();
  });
});
