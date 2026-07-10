import { describe, expect, it } from "vitest";
import { genomaReviewQuestion } from "./genoma-review-queue";
import { createEmptyGenoma } from "./genoma-defaults";

describe("genomaReviewQuestion", () => {
  it("formula preguntas en castellano", () => {
    const doc = createEmptyGenoma();
    doc.slots.palette = {
      ...doc.slots.palette,
      status: "candidates",
      candidates: [{ value: { colors: [] }, score: 0.5, provenance: { type: "css_var", detail: "" } }, { value: { colors: [] }, score: 0.4, provenance: { type: "css_var", detail: "" } }],
    };
    expect(genomaReviewQuestion(doc, { slotId: "palette", kind: "candidates" })).toContain("2 propuestas");
  });
});
