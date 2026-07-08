import { describe, expect, it } from "vitest";
import { buildEssenceHeadlineCandidates, canResolveEssence } from "./genoma-essence-headline";
import type { EssenceValue } from "./genoma-types";

const BASE_ESSENCE: EssenceValue = {
  summary:
    "Productora audiovisual con mirada cinematográfica, centrada en historias con carácter y emoción.",
  beliefs: [
    { label: "La narrativa es el centro." },
    { label: "El cine guía la publicidad." },
  ],
  evidence: [{ quote: "Hacemos cine y publicidad" }],
};

describe("genoma essence headline", () => {
  it("keeps batch summary in headline candidates", () => {
    const candidates = buildEssenceHeadlineCandidates(
      BASE_ESSENCE,
      {
        onelinerLlm: {
          options: [
            { text: "¿Quieres contar una buena historia?" },
            { text: "Historias que muerden" },
          ],
        },
      },
      { type: "llm_synthesis", detail: "batch v2" },
    );

    expect(candidates).toHaveLength(2);
    expect(candidates[0].value.summary).toBe(BASE_ESSENCE.summary);
    expect(candidates[0].value.headline).toBe("¿Quieres contar una buena historia?");
  });

  it("allows resolving essence without headline", () => {
    expect(canResolveEssence(BASE_ESSENCE)).toBe(true);
    expect(canResolveEssence({ ...BASE_ESSENCE, summary: "corto", beliefs: [] })).toBe(false);
  });
});
