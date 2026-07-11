import { describe, expect, it } from "vitest";
import { brandKitReviewQuestion } from "./brand-kit-review-queue";
import { createEmptyBrandKit } from "./brand-kit-defaults";

describe("brandKitReviewQuestion", () => {
  it("formula preguntas en castellano", () => {
    const doc = createEmptyBrandKit();
    doc.slots.palette = {
      ...doc.slots.palette,
      status: "candidates",
      candidates: [{ value: { colors: [] }, score: 0.5, provenance: { type: "css_var", detail: "" } }, { value: { colors: [] }, score: 0.4, provenance: { type: "css_var", detail: "" } }],
    };
    expect(brandKitReviewQuestion(doc, { slotId: "palette", kind: "candidates" })).toContain("2 propuestas");
  });
});
