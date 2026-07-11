import { describe, expect, it } from "vitest";
import { createDemoBrandKitFixture, createEmptyBrandKit } from "./brand-kit-defaults";
import { applySlotAction } from "./brand-kit-slot-actions";

describe("brandKit slot actions", () => {
  it("sets value with user provenance and resolved status", () => {
    const doc = createEmptyBrandKit();
    const next = applySlotAction(doc, "essence", {
      action: "set",
      value: {
        headline: "Hola mundo",
        headlineOrigin: "extracted",
        beliefs: [{ label: "Claridad" }],
      },
    });
    expect(next.slots.essence.status).toBe("resolved");
    expect(next.slots.essence.provenance?.type).toBe("user_input");
    expect(next.slots.essence.confidence).toBe(1);
  });

  it("chooses candidate and optionally locks", () => {
    const doc = createDemoBrandKitFixture();
    const next = applySlotAction(doc, "typography", { action: "choose_candidate", candidateIndex: 0, lock: true });
    expect(next.slots.typography.status).toBe("resolved");
    expect(next.slots.typography.locked).toBe(true);
    expect(next.slots.typography.value).toBeTruthy();
  });

  it("locks and unlocks without changing value", () => {
    let doc = createDemoBrandKitFixture();
    doc = applySlotAction(doc, "palette", { action: "lock" });
    expect(doc.slots.palette.locked).toBe(true);
    doc = applySlotAction(doc, "palette", { action: "unlock" });
    expect(doc.slots.palette.locked).toBe(false);
  });

  it("reverts to previous history entry", () => {
    let doc = createDemoBrandKitFixture();
    const previous = doc.slots.palette.value;
    doc = applySlotAction(doc, "palette", {
      action: "set",
      value: { colors: [{ hex: "#000000", role: "primary" }] },
    });
    expect(doc.slots.palette.history.length).toBeGreaterThan(0);
    doc = applySlotAction(doc, "palette", { action: "revert", historyIndex: 0 });
    expect(doc.slots.palette.value).toEqual(previous);
  });
});
