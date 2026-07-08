import { describe, expect, it } from "vitest";
import { normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import { LEGACY_BRANDKIT_RUNTIME_FIXTURE } from "./fixtures/legacy-brandkit-assets.fixture";
import {
  applyVoiceExamplesSynthesisOnAssets,
  buildVoiceSynthesisPrompt,
  parseVoiceSynthesisResponse,
  hasPendingVoiceSynthesis,
  VOICE_EXAMPLES_ELEMENT_KEY,
} from "./synthesize-voice-examples";
import { createValidatedMeta, patchMeta, emptyBrandKitBoardMeta } from "./interpretation";

describe("synthesize-voice-examples", () => {
  it("parsea respuesta JSON de ejemplos", () => {
    const parsed = parseVoiceSynthesisResponse({
      voiceExamples: [
        { kind: "approved_voice", text: "Claridad antes que hype." },
        { kind: "bad_piece", text: "Somos los mejores del mundo." },
      ],
    });
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.kind).toBe("approved_voice");
  });

  it("aplica síntesis como proposed con evidencia llm-synthesis", () => {
    const assets = normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    const next = applyVoiceExamplesSynthesisOnAssets(assets, [
      { id: "x1", kind: "approved_voice", text: "Ejemplo sintetizado." },
      { id: "x2", kind: "bad_piece", text: "Ejemplo a evitar." },
    ]);
    expect(next.strategy.voiceExamples).toHaveLength(2);
    expect(hasPendingVoiceSynthesis(next.brainMeta?.boardMeta)).toBe(true);
    const meta = next.brainMeta?.boardMeta?.interpretation?.[VOICE_EXAMPLES_ELEMENT_KEY];
    expect(meta?.status).toBe("proposed");
    expect(meta?.evidence[0]?.kind).toBe("llm-synthesis");
  });

  it("buildVoiceSynthesisPrompt incluye tono y mensaje", () => {
    const assets = normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    const prompt = buildVoiceSynthesisPrompt({
      tagline: "Marca clara",
      toneTraits: ["directo"],
      approvedPhrases: [],
      tabooPhrases: [],
      forbiddenTerms: [],
      messageClaims: ["Rendimiento real"],
      existingExamples: [],
    });
    expect(prompt).toContain("Marca clara");
    expect(prompt).toContain("directo");
  });

  it("hasPendingVoiceSynthesis es false cuando está validado", () => {
    const boardMeta = patchMeta(emptyBrandKitBoardMeta(), VOICE_EXAMPLES_ELEMENT_KEY, createValidatedMeta());
    expect(hasPendingVoiceSynthesis(boardMeta)).toBe(false);
  });
});
