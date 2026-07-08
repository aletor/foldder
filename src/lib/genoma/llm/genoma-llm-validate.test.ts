import { describe, expect, it } from "vitest";
import { corpusContainsQuote } from "../crawl/copy-corpus";
import { extractOnelinerDeterministic } from "../crawl/copy-extract";
import {
  parseOnelinerLlmResponse,
  parseVoiceLlmResponse,
  validateVoiceAgainstCorpus,
} from "./genoma-llm-validate";

describe("genoma llm validation", () => {
  it("requires evidence quotes to exist in corpus", () => {
    const corpus =
      "[/ h1] Hacemos que tu marca se entienda en segundos. Todo editable, todo tuyo. Siempre contigo.";
    const voice = {
      descriptors: ["claro", "cercano", "profesional"],
      rules: ["tuteo", "frases cortas", "sin jerga"],
      evidence: [
        { quote: "Hacemos que tu marca se entienda en segundos." },
        { quote: "Todo editable, todo tuyo." },
        { quote: "inventada" },
      ],
    };
    expect(validateVoiceAgainstCorpus(corpus, voice)?.evidence).toHaveLength(2);
    const grounded = {
      ...voice,
      evidence: [
        { quote: "Hacemos que tu marca se entienda en segundos." },
        { quote: "Todo editable, todo tuyo." },
        { quote: "Siempre contigo." },
      ],
    };
    expect(validateVoiceAgainstCorpus(corpus, grounded)?.evidence).toHaveLength(3);
  });

  it("parses voice json shape", () => {
    const parsed = parseVoiceLlmResponse({
      descriptors: ["a", "b", "c"],
      rules: ["r1", "r2", "r3"],
      evidence: [{ quote: "x" }, { quote: "y" }, { quote: "z" }],
    });
    expect(parsed?.descriptors).toHaveLength(3);
  });

  it("parses oneliner options", () => {
    const parsed = parseOnelinerLlmResponse({
      options: [{ text: "Uno" }, { text: "Dos" }, { text: "Tres" }],
    });
    expect(parsed?.options).toHaveLength(3);
  });

  it("extracts deterministic oneliner from og:title", () => {
    const html = `<html><head><meta property="og:title" content="Tu marca, desglosada." /></head><body><h1>Otro</h1></body></html>`;
    const result = extractOnelinerDeterministic([{ url: "https://x.test/", html, cssTexts: [] }]);
    expect(result?.value.text).toBe("Tu marca, desglosada.");
    expect(result?.value.origin).toBe("extracted");
  });

  it("matches corpus quotes with whitespace normalization", () => {
    expect(corpusContainsQuote("Hola   mundo", "Hola mundo")).toBe(true);
  });
});
