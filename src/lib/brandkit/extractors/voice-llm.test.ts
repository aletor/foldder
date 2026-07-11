import { describe, expect, it } from "vitest";
import { createCandidate, signal } from "../model/evidence";
import type { Candidate } from "../model/evidence";
import {
  enrichForbiddenWhy,
  enrichVoiceExtraction,
  mergeVoiceExtractions,
  shouldRefineVoiceWithLlm,
} from "./voice-llm";
import type { ClaimValue } from "../model/trait-values";
import type { VoiceExtraction } from "./voice";

describe("voice-llm merge", () => {
  const sourceId = "src1";

  it("fusiona tono y tagline sin duplicar firmas", () => {
    const base: VoiceExtraction = {
      tagline: [],
      tone: [
        createCandidate({
          value: { text: "cercano" },
          signals: [signal("brand-manual")],
          signature: "cercano",
          sourceRefs: [sourceId],
        }),
      ],
      absolute: [],
      forbidden: [],
    };
    const llm: VoiceExtraction = {
      tagline: [
        createCandidate({
          value: { text: "Hacemos que pase." },
          signals: [signal("llm-vision")],
          signature: "hacemos-que-pase",
          sourceRefs: [sourceId],
        }),
      ],
      tone: [
        createCandidate({
          value: { text: "cercano" },
          signals: [signal("llm-vision")],
          signature: "cercano",
          sourceRefs: [sourceId],
        }),
        createCandidate({
          value: { text: "profesional" },
          signals: [signal("llm-vision")],
          signature: "profesional",
          sourceRefs: [sourceId],
        }),
      ],
      absolute: [],
      forbidden: [],
    };
    const merged = mergeVoiceExtractions(base, llm);
    expect(merged.tagline).toHaveLength(1);
    expect(merged.tone).toHaveLength(2);
    expect(merged.tone.map((t) => t.value.text)).toEqual(expect.arrayContaining(["cercano", "profesional"]));
  });

  it("enriquece el porqué de claims prohibidos genéricos", () => {
    const base: Candidate<ClaimValue>[] = [
      createCandidate<ClaimValue>({
        value: { text: "No digas garantizado", kind: "forbidden", why: "marcado como prohibido en el documento" },
        signals: [signal("brand-manual")],
        signature: "no-garantizado",
        sourceRefs: [sourceId],
      }),
    ];
    const llm: Candidate<ClaimValue>[] = [
      createCandidate<ClaimValue>({
        value: {
          text: "No digas garantizado",
          kind: "forbidden",
          why: "sector regulado — promesas absolutas no permitidas",
        },
        signals: [signal("llm-vision")],
        signature: "no-garantizado-llm",
        sourceRefs: [sourceId],
      }),
    ];
    const enriched = enrichForbiddenWhy(base, llm);
    expect(enriched[0]?.value.why).toContain("sector regulado");
  });

  it("detecta cuándo hace falta refinamiento LLM", () => {
    const sparse: VoiceExtraction = { tagline: [], tone: [], absolute: [], forbidden: [] };
    expect(shouldRefineVoiceWithLlm(sparse)).toBe(true);

    const rich: VoiceExtraction = {
      tagline: [
        createCandidate({
          value: { text: "Tag" },
          signals: [signal("headline")],
          signature: "tag",
          sourceRefs: [sourceId],
        }),
      ],
      tone: [
        createCandidate({
          value: { text: "cercano" },
          signals: [signal("brand-manual")],
          signature: "cercano",
          sourceRefs: [sourceId],
        }),
      ],
      absolute: [
        createCandidate({
          value: { text: "Líderes", kind: "absolute" },
          signals: [signal("brand-manual")],
          signature: "lideres",
          sourceRefs: [sourceId],
        }),
      ],
      forbidden: [],
    };
    expect(shouldRefineVoiceWithLlm(rich)).toBe(false);
  });

  it("no refinan con LLM sin allowPaidRefinement aunque el heurístico sea escaso", async () => {
    const sparse: VoiceExtraction = { tagline: [], tone: [], absolute: [], forbidden: [] };
    const sample = "x".repeat(120);
    const result = await enrichVoiceExtraction(sparse, sample, sourceId);
    expect(result).toBe(sparse);
  });
});
