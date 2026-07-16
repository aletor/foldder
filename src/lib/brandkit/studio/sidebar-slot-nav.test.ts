import { describe, expect, it } from "vitest";
import { createEmptyBrandKit } from "../brand-kit-defaults";
import { buildSidebarNavItems, countConfirmedSlots, resolveSidebarSlotStatus } from "./sidebar-slot-nav";

describe("sidebar-slot-nav", () => {
  it("construye 8 entradas en orden de lectura del mosaico", () => {
    const doc = createEmptyBrandKit();
    const items = buildSidebarNavItems(doc);
    expect(items).toHaveLength(8);
    expect(items.map((item) => item.id)).toEqual([
      "logo",
      "essence",
      "palette",
      "typography",
      "voice",
      "visualWorld",
      "gallery",
      "applications",
    ]);
    expect(items.map((item) => item.number)).toEqual([
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
    ]);
  });

  it("cuenta bloques confirmados", () => {
    const doc = createEmptyBrandKit();
    doc.slots.logo.locked = true;
    doc.slots.logo.status = "resolved";
    doc.slots.logo.value = { assetId: "a", previewUrl: "x", format: "png", background: "transparent" };
    expect(countConfirmedSlots(doc)).toBe(1);
  });

  it("marca conflicto en navegación", () => {
    const doc = createEmptyBrandKit();
    doc.slots.voice.status = "candidates";
    doc.slots.voice.reconciliation = {
      outcome: "contradiction",
      previousSummary: "a",
      incomingSummary: "b",
    };
    expect(resolveSidebarSlotStatus(doc.slots.voice)).toBe("conflict");
  });
});
