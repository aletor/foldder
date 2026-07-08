import { describe, expect, it } from "vitest";
import { normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import { LEGACY_BRANDKIT_RUNTIME_FIXTURE } from "./fixtures/legacy-brandkit-assets.fixture";
import { evaluateStyleGuidePrintGate } from "./style-guide-print-gate";
import {
  applyVoiceExamplesSynthesisOnAssets,
  VOICE_EXAMPLES_ELEMENT_KEY,
} from "./synthesize-voice-examples";
import { createValidatedMeta, patchMeta, emptyBrandKitBoardMeta } from "./interpretation";

describe("style-guide-print-gate", () => {
  it("modo operativo siempre permite export", () => {
    const assets = normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    expect(evaluateStyleGuidePrintGate(assets, "operativo").allowed).toBe(true);
  });

  it("modo cliente bloquea ejemplos sintetizados sin validar", () => {
    const assets = applyVoiceExamplesSynthesisOnAssets(normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE), [
      { id: "s1", kind: "approved_voice", text: "Voz validada pendiente." },
      { id: "s2", kind: "bad_piece", text: "Evitar exageración." },
    ]);
    const gate = evaluateStyleGuidePrintGate(assets, "cliente");
    expect(gate.allowed).toBe(false);
    expect(gate.blockers[0]?.code).toBe("voice_examples_not_validated");
  });

  it("modo cliente permite ejemplos legacy sin validación explícita", () => {
    const assets = normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    expect(evaluateStyleGuidePrintGate(assets, "cliente").allowed).toBe(true);
  });

  it("modo cliente permite ejemplos sintetizados validados", () => {
    const assets = normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    const boardMeta = patchMeta(emptyBrandKitBoardMeta(), VOICE_EXAMPLES_ELEMENT_KEY, createValidatedMeta());
    const withMeta = {
      ...assets,
      brainMeta: { ...assets.brainMeta, boardMeta },
    };
    expect(evaluateStyleGuidePrintGate(withMeta, "cliente").allowed).toBe(true);
  });
});
