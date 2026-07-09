import { describe, expect, it } from "vitest";
import { createEmptyGenoma } from "./genoma-defaults";
import { getSlotAttention, summarizeGenomaBoard } from "./genoma-board-status";

describe("genoma-board-status", () => {
  it("flags contradiction attention", () => {
    const slot = {
      ...createEmptyGenoma().slots.voice,
      status: "candidates" as const,
      reconciliation: {
        outcome: "contradiction" as const,
        previousSummary: "A",
        incomingSummary: "B",
      },
      candidates: [],
    };
    expect(getSlotAttention(slot).kind).toBe("conflict");
  });

  it("flags single candidate as review", () => {
    const slot = {
      ...createEmptyGenoma().slots.visualWorld,
      status: "candidates" as const,
      candidates: [
        {
          value: {
            summary: "x",
            moodTags: [],
            visualTraits: [],
            limits: [],
            evidence: [],
            galleryRefs: [],
          },
          score: 0.5,
          provenance: { type: "llm_synthesis", detail: "test" },
        },
      ],
    };
    expect(getSlotAttention(slot).label).toBe("Borrador");
  });

  it("summarizes board needs", () => {
    const doc = createEmptyGenoma();
    doc.slots.voice.status = "candidates";
    doc.slots.voice.candidates = [
      {
        value: { summary: "x", descriptors: [], rules: [], avoid: [], evidence: [] },
        score: 0.5,
        provenance: { type: "llm_synthesis", detail: "test" },
      },
    ];
    const summary = summarizeGenomaBoard(doc);
    expect(summary.needsYou).toBeGreaterThan(0);
  });
});
