import { describe, expect, it } from "vitest";
import {
  areEssenceHeadlineVariantsOnly,
  buildResolvedEssenceFromIngest,
  buildEssenceHeadlineCandidates,
  canResolveEssence,
  collapseEssenceHeadlineVariants,
} from "./genoma-essence-headline";
import type { EssenceValue } from "./genoma-types";
import { createEmptyGenoma } from "./genoma-defaults";

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

  it("builds resolved essence from beliefs and oneliner options", () => {
    const resolved = buildResolvedEssenceFromIngest({
      brandName: "OARO",
      beliefs: [
        { label: "Trust" },
        { label: "Security" },
        { label: "Simplicity" },
      ],
      onelinerLlm: {
        options: [
          { text: "OARO: La confianza digital que tu empresa necesita." },
          { text: "OARO: Redefiniendo la identidad digital con innovación y sencillez." },
        ],
      },
    });

    expect(resolved?.headline).toBe("OARO: La confianza digital que tu empresa necesita.");
    expect(resolved?.summary.length).toBeGreaterThan(24);
    expect(resolved?.beliefs).toHaveLength(3);
  });

  it("detects headline-only variants and collapses to resolved", () => {
    const beliefs = [
      { label: "Trust" },
      { label: "Security" },
      { label: "Simplicity" },
    ];
    const candidates = [
      {
        value: { summary: "", beliefs },
        score: 0.62,
        provenance: { type: "llm_synthesis" as const, detail: "documentos" },
      },
      {
        value: {
          summary: "OARO impulsa la identidad digital.",
          headline: "OARO: La confianza digital que tu empresa necesita.",
          headlineOrigin: "generated" as const,
          beliefs,
          evidence: [],
        },
        score: 0.55,
        provenance: { type: "llm_synthesis" as const, detail: "generado" },
      },
      {
        value: {
          summary: "OARO impulsa la identidad digital.",
          headline: "OARO: Redefiniendo la identidad digital con innovación y sencillez.",
          headlineOrigin: "generated" as const,
          beliefs,
          evidence: [],
        },
        score: 0.5,
        provenance: { type: "llm_synthesis" as const, detail: "generado" },
      },
    ];

    expect(areEssenceHeadlineVariantsOnly(candidates)).toBe(true);

    const collapsed = collapseEssenceHeadlineVariants({
      ...createEmptyGenoma().slots.essence,
      status: "candidates",
      candidates,
      confidence: 0.48,
    });

    expect(collapsed.status).toBe("resolved");
    expect(collapsed.value?.headline).toBe("OARO: La confianza digital que tu empresa necesita.");
    expect(collapsed.candidates.length).toBeGreaterThan(0);
  });

  it("allows resolving essence without headline", () => {
    expect(canResolveEssence(BASE_ESSENCE)).toBe(true);
    expect(canResolveEssence({ ...BASE_ESSENCE, summary: "corto", beliefs: [] })).toBe(false);
  });
});
