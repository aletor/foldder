import { describe, expect, it } from "vitest";
import {
  inspectorSubtitleForSlot,
  mapDetailTabToInspectorTab,
  partitionInspectorPanels,
  resolveInspectorFooterVariant,
} from "./brand-kit-inspector";
import type { SlotState } from "../brand-kit-types";

function slot(partial: Partial<SlotState<unknown>>): SlotState<unknown> {
  return {
    id: "essence",
    status: "resolved",
    candidates: [],
    confidence: 1,
    locked: false,
    history: [],
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

describe("brand-kit-inspector", () => {
  it("maps detail tab ids to inspector tabs", () => {
    expect(mapDetailTabToInspectorTab("evidence")).toBe("evidence");
    expect(mapDetailTabToInspectorTab("alternatives")).toBe("evidence");
    expect(mapDetailTabToInspectorTab("history")).toBe("history");
    expect(mapDetailTabToInspectorTab("beliefs")).toBe("attributes");
    expect(mapDetailTabToInspectorTab("content")).toBe("synthesis");
  });

  it("partitions panels into content, evidence and history", () => {
    const result = partitionInspectorPanels([
      { id: "beliefs", label: "Creencias", content: "a" },
      { id: "evidence", label: "Evidencia", content: "b" },
      { id: "detail", label: "Detalle", content: "c" },
      { id: "alternatives", label: "Alt", content: "d" },
      { id: "empty", label: "Vacío", content: null },
    ]);

    expect(result.content.map((p) => p.id)).toEqual(["beliefs", "detail"]);
    expect(result.evidence.map((p) => p.id)).toEqual(["evidence", "alternatives"]);
    expect(result.history).toHaveLength(0);
  });

  it("resolves footer variant by slot state", () => {
    expect(resolveInspectorFooterVariant(slot({ locked: true }))).toBe("locked");
    expect(resolveInspectorFooterVariant(slot({ status: "candidates" }))).toBe("review");
    expect(resolveInspectorFooterVariant(slot({ status: "resolved" }))).toBe("confirmable");
    expect(resolveInspectorFooterVariant(slot({ status: "needs_user" }))).toBe("idle");
  });

  it("builds inspector subtitle with export eligibility", () => {
    expect(inspectorSubtitleForSlot(slot({ locked: true }))).toContain("Confirmada");
    expect(inspectorSubtitleForSlot(slot({ locked: true }))).toContain("Incluida en exportación");
    expect(inspectorSubtitleForSlot(slot({ locked: false, status: "resolved" }))).toContain(
      "Pendiente de exportación",
    );
  });
});
