import { describe, expect, it } from "vitest";
import { createEmptyBrandKit } from "../brand-kit-defaults";
import {
  buildSlotTextEditConfig,
  canEditSlotText,
  isTextEditableSlotId,
} from "./brand-kit-slot-text-edit";

describe("brand-kit-slot-text-edit", () => {
  it("marca slots textuales editables", () => {
    expect(isTextEditableSlotId("essence")).toBe(true);
    expect(isTextEditableSlotId("logo")).toBe(false);
  });

  it("construye campos aunque el slot esté bloqueado (lectura)", () => {
    const doc = createEmptyBrandKit();
    doc.slots.voice = {
      ...doc.slots.voice,
      status: "resolved",
      locked: true,
      value: {
        summary: "Voz",
        descriptors: [],
        rules: [],
        avoid: [],
        evidence: [],
      },
    };
    expect(canEditSlotText(doc.slots.voice, "voice")).toBe(false);
    expect(buildSlotTextEditConfig("voice", doc.slots.voice)?.fields.length).toBeGreaterThan(0);
  });

  it("no permite editar si está bloqueado o vacío", () => {
    const doc = createEmptyBrandKit();
    expect(canEditSlotText(doc.slots.essence, "essence")).toBe(false);
  });

  it("construye y aplica edición de voz", () => {
    const doc = createEmptyBrandKit();
    doc.slots.voice = {
      ...doc.slots.voice,
      status: "resolved",
      locked: false,
      value: {
        summary: "Autoritaria",
        descriptors: ["clara"],
        rules: ["Corto"],
        avoid: ["Jerga"],
        evidence: [],
      },
    };
    const config = buildSlotTextEditConfig("voice", doc.slots.voice);
    expect(config?.fields).toHaveLength(4);
    const next = config!.applyValues({
      summary: "Nueva voz",
      descriptors: "a, b",
      rules: "Uno\nDos",
      avoid: "",
    }) as { summary: string; descriptors: string[]; rules: string[]; avoid: string[] };
    expect(next.summary).toBe("Nueva voz");
    expect(next.descriptors).toEqual(["a", "b"]);
    expect(next.rules).toEqual(["Uno", "Dos"]);
    expect(next.avoid).toEqual([]);
  });
});
