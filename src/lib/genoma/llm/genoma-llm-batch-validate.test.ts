import { describe, expect, it } from "vitest";
import { buildBatchSlotPatch } from "./genoma-batch-slot-patch";
import { validateBatchResponse } from "./genoma-llm-batch-validate";
import { createEmptyGenoma } from "../genoma-defaults";
import type { EssenceValue } from "../genoma-types";
import type { EvidenceCandidate } from "../genoma-evidence-candidates";

const CORPUS =
  "Somos directores de cine frustrados. Hacemos cine y publicidad. No tenemos clientes: tenemos cómplices.";

const EVIDENCE_CANDIDATES: EvidenceCandidate[] = [
  {
    id: "ev_01",
    quote: "Somos directores de cine frustrados",
    role: "hero",
    weight: 1,
  },
  {
    id: "ev_02",
    quote: "Hacemos cine y publicidad",
    role: "about",
    weight: 0.9,
  },
  {
    id: "ev_03",
    quote: "No tenemos clientes: tenemos cómplices",
    role: "body",
    weight: 0.4,
  },
];

const VALID_ESSENCE = {
  summary:
    "Productora audiovisual con mirada cinematográfica, centrada en historias con carácter y emoción.",
  headline: "¿Quieres contar una buena historia?",
  beliefs: [{ label: "La narrativa es el centro.", evidenceIds: ["ev_02"] }],
  evidenceIds: ["ev_01"],
};

const VALID_VOICE = {
  summary: "Voz cinematográfica, directa y emocional, alejada del tono corporativo de agencia.",
  descriptors: ["cinematográfica", "directa", "comprometida"],
  rules: [
    "Usar frases cortas con ritmo y seguridad.",
    "Priorizar imagen, narrativa y emoción.",
    "Evitar lenguaje corporativo genérico.",
  ],
  evidenceIds: ["ev_01", "ev_02", "ev_03"],
  avoid: ["evitar lenguaje técnico"],
};

const VALID_VISUAL = {
  summary: "Estética cinematográfica y contrastada con rostros, luz dramática y tensión narrativa.",
  moodTags: ["cinematográfico", "íntimo"],
  visualTraits: ["Primeros planos de personas.", "Luz dramática o direccional."],
  limits: ["Evitar stock corporativo.", "Evitar estética publicitaria plana."],
  evidenceIds: ["ev_02"],
};

describe("genoma batch validate", () => {
  it("accepts valid keys independently with evidenceIds", () => {
    const result = validateBatchResponse(
      {
        essence: VALID_ESSENCE,
        voice: VALID_VOICE,
        visualWorld: VALID_VISUAL,
      },
      CORPUS,
      EVIDENCE_CANDIDATES,
    );
    expect(result.essence.ok).toBe(true);
    expect(result.voice.ok).toBe(true);
    expect(result.visualWorld.ok).toBe(true);
    if (result.voice.ok) {
      expect(result.voice.value.evidence[0].quote).toBe("Somos directores de cine frustrados");
    }
  });

  it("accepts voice with two concrete descriptors after penalizing generics", () => {
    const result = validateBatchResponse(
      {
        essence: VALID_ESSENCE,
        voice: {
          ...VALID_VOICE,
          descriptors: ["cinematográfica", "profesional", "directa"],
        },
        visualWorld: VALID_VISUAL,
      },
      CORPUS,
      EVIDENCE_CANDIDATES,
    );
    expect(result.voice.ok).toBe(true);
    if (result.voice.ok) {
      expect(result.voice.value.descriptors).not.toContain("profesional");
      expect(result.voice.value.descriptors.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("corrupt visualWorld does not invalidate essence or voice", () => {
    const result = validateBatchResponse(
      {
        essence: VALID_ESSENCE,
        voice: VALID_VOICE,
        visualWorld: { limits: 123 },
      },
      CORPUS,
      EVIDENCE_CANDIDATES,
    );
    expect(result.essence.ok).toBe(true);
    expect(result.voice.ok).toBe(true);
    expect(result.visualWorld.ok).toBe(false);
  });

  it("accepts voice via evidenceIds even when legacy quotes would fail", () => {
    const result = validateBatchResponse(
      {
        essence: VALID_ESSENCE,
        voice: {
          ...VALID_VOICE,
          evidenceIds: ["ev_01", "ev_02"],
          evidence: [{ quote: "cita inventada que no está en corpus" }],
        },
        visualWorld: VALID_VISUAL,
      },
      CORPUS,
      EVIDENCE_CANDIDATES,
    );
    expect(result.voice.ok).toBe(true);
  });
});

describe("buildBatchSlotPatch", () => {
  it("adds candidate when slot is locked", () => {
    const current = {
      ...createEmptyGenoma().slots.essence,
      status: "resolved" as const,
      locked: true,
      value: {
        summary: "Síntesis original con suficiente longitud para validar.",
        headline: "Original",
        beliefs: [],
        evidence: [],
      } satisfies EssenceValue,
      provenance: { type: "user_input" as const, detail: "tú" },
    };
    const patch = buildBatchSlotPatch({
      current,
      value: {
        summary: "Propuesta batch con síntesis defendible y extensa.",
        headline: "Propuesta batch",
        beliefs: [{ label: "Nuevo" }],
        evidence: [],
      },
      provenance: { type: "llm_synthesis", detail: "batch v2" },
      confidence: 0.7,
      locked: true,
    });
    expect(patch.status).toBe("resolved");
    expect((patch.value as EssenceValue).headline).toBe("Original");
    expect(patch.candidates).toHaveLength(1);
    expect(patch.candidates?.[0]?.provenance.detail).toBe("alternativas");
  });
});
