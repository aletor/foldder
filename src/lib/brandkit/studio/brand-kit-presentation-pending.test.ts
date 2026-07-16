import { describe, expect, it } from "vitest";
import { createEmptyBrandKit } from "../brand-kit-defaults";
import {
  countPresentationPendingSlots,
  isSlotVisibleInPresentation,
  shouldShowApplicationsInPresentation,
} from "./brand-kit-presentation-pending";

describe("brand-kit-presentation-pending", () => {
  it("shows only locked slots in presentation", () => {
    const doc = createEmptyBrandKit();
    doc.slots.palette.status = "resolved";
    doc.slots.palette.locked = true;
    doc.slots.logo.status = "resolved";
    doc.slots.logo.locked = false;

    expect(isSlotVisibleInPresentation(doc.slots.palette)).toBe(true);
    expect(isSlotVisibleInPresentation(doc.slots.logo)).toBe(false);
    expect(countPresentationPendingSlots(doc)).toBe(1);
  });

  it("requires confirmed palette for applications in presentation", () => {
    const doc = createEmptyBrandKit();
    doc.brandName = { value: "Acme", provenance: { type: "llm_synthesis", detail: "test" } };
    expect(shouldShowApplicationsInPresentation(doc)).toBe(false);

    doc.slots.palette.status = "resolved";
    doc.slots.palette.locked = true;
    doc.slots.palette.value = { colors: [{ hex: "#111111", role: "primary" }] };
    expect(shouldShowApplicationsInPresentation(doc)).toBe(true);
  });
});
