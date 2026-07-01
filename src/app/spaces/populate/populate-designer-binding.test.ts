import { describe, expect, it } from "vitest";
import { patchPopulateBinding } from "./populate-designer-binding";
import type { PopulateTemplateBinding } from "./populate-types";

describe("patchPopulateBinding", () => {
  it("inserta un binding nuevo si no existía", () => {
    const next: PopulateTemplateBinding = {
      templateNodeId: "tpl1",
      templateLabel: "A",
      labelColumnFieldId: "f1",
      picks: [],
      sources: {},
      slotColumns: { "slot::x::text": { listId: "l1", listKey: "l", fieldId: "f2", fieldKey: "nombre" } },
    };
    const out = patchPopulateBinding([], "tpl1", next);
    expect(out).toHaveLength(1);
    expect(out[0]?.slotColumns["slot::x::text"]?.fieldKey).toBe("nombre");
  });

  it("fusiona cambios sobre un binding existente", () => {
    const existing: PopulateTemplateBinding = {
      templateNodeId: "tpl1",
      templateLabel: "A",
      labelColumnFieldId: "f1",
      picks: [],
      sources: {},
      slotColumns: {},
    };
    const out = patchPopulateBinding([existing], "tpl1", {
      defaultPickedRows: { pick_a: "card_1" },
    });
    expect(out[0]?.defaultPickedRows).toEqual({ pick_a: "card_1" });
  });
});
