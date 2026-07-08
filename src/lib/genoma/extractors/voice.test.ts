import { describe, expect, it } from "vitest";
import { createCandidate, signal } from "../model/evidence";
import { applyVoiceExtraction } from "../ingest/apply-extract";
import { emptyGenome } from "../model/trait";
import type { VoiceExtraction } from "../extractors/voice";

describe("applyVoiceExtraction", () => {
  it("añade tagline, tono y claims como candidatos", () => {
    const source = { id: "src1", kind: "pdf" as const, label: "manual.pdf", addedAt: new Date().toISOString() };
    const extraction: VoiceExtraction = {
      tagline: [
        createCandidate({
          value: { text: "Hacemos que pase." },
          signals: [signal("headline")],
          signature: "hacemos-que-pase",
          sourceRefs: [source.id],
        }),
      ],
      tone: [
        createCandidate({
          value: { text: "cercano" },
          signals: [signal("brand-manual")],
          signature: "cercano",
          sourceRefs: [source.id],
        }),
      ],
      absolute: [],
      forbidden: [],
    };
    const genome = applyVoiceExtraction(emptyGenome(), extraction, source).genome;
    expect(genome.traits["message.tagline"]?.candidates).toHaveLength(1);
    expect(genome.traits["message.tone"]?.candidates).toHaveLength(1);
  });
});
