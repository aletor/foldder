import { describe, expect, it } from "vitest";
import { createEmptyBrandKit } from "@/lib/brandkit/brand-kit-defaults";
import type { SlotState } from "@/lib/brandkit/brand-kit-types";
import {
  buildInitialMotionStates,
  computeSlotDisplayPhase,
  detectSlotMotionTransition,
} from "./use-brand-kit-board-slot-motion";

function slot(partial: Partial<SlotState<unknown>>): SlotState<unknown> {
  return {
    ...createEmptyBrandKit().slots.logo,
    ...partial,
  };
}

describe("use-brandKit-board-slot-motion", () => {
  it("no anima en mount bootstrap", () => {
    const s = slot({ status: "resolved", value: { assetId: "a" }, updatedAt: "t1" });
    const t = detectSlotMotionTransition(s, undefined, false);
    expect(t.triggerEnter).toBe(false);
    expect(t.triggerGlow).toBe(false);
  });

  it("detecta primera materialización empty → resolved", () => {
    const prev = { status: "empty" as const, fingerprint: "empty:t0:0:0" };
    const next = slot({ status: "resolved", value: { assetId: "a" }, updatedAt: "t1" });
    const t = detectSlotMotionTransition(next, prev, true);
    expect(t.triggerEnter).toBe(true);
    expect(t.triggerGlow).toBe(false);
  });

  it("detecta primera materialización pending → resolved", () => {
    const prev = { status: "pending" as const, fingerprint: "pending:t0:0:0" };
    const next = slot({ status: "resolved", value: { assetId: "a" }, updatedAt: "t1" });
    expect(detectSlotMotionTransition(next, prev, true).triggerEnter).toBe(true);
  });

  it("segunda fuente resolved → candidates dispara glow, no enter", () => {
    const prev = { status: "resolved" as const, fingerprint: "resolved:t1:0:1" };
    const next = slot({
      status: "candidates",
      value: undefined,
      candidates: [{ value: { assetId: "a" }, score: 0.9, provenance: { type: "file_upload", detail: "x" } }],
      updatedAt: "t2",
    });
    const t = detectSlotMotionTransition(next, prev, true);
    expect(t.triggerEnter).toBe(false);
    expect(t.triggerGlow).toBe(true);
  });

  it("muestra skeleton cuando isAnalyzing y slot empty", () => {
    const s = slot({ status: "empty" });
    expect(computeSlotDisplayPhase(s, true, false, false)).toBe("skeleton");
  });

  it("sin analyzing empty → idle", () => {
    const s = slot({ status: "empty" });
    expect(computeSlotDisplayPhase(s, false, false, false)).toBe("idle");
  });

  it("buildInitialMotionStates skeleton durante análisis", () => {
    const doc = createEmptyBrandKit();
    const states = buildInitialMotionStates(doc.slots, true);
    expect(states.logo.phase).toBe("skeleton");
    expect(states.logo.stagger).toBe(false);
  });

  it("buildInitialMotionStates idle con brandKit resuelto", () => {
    const doc = createEmptyBrandKit();
    doc.slots.logo = slot({
      status: "resolved",
      value: { assetId: "web.svg", format: "svg", width: 1, height: 1, background: "transparent", variants: [] },
      updatedAt: "t1",
    });
    const states = buildInitialMotionStates(doc.slots, false);
    expect(states.logo.phase).toBe("idle");
  });
});
