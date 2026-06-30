import { describe, expect, it } from "vitest";
import {
  designerEntityId,
  designerSlotKey,
  makePendingDesignerBinding,
  populatePendingSlotKey,
} from "./designer-dataset-binding";

describe("designerSlotKey", () => {
  it("usa slotLabel normalizado como identidad", () => {
    const binding = makePendingDesignerBinding("text", "Jugador", "slot_abc123");
    expect(designerSlotKey(binding)).toBe("slot::jugador");
    expect(designerEntityId(binding)).toBe("jugador");
  });

  it("texto e imagen con el mismo slotLabel comparten entidad", () => {
    const text = makePendingDesignerBinding("text", "jugador_1", "slot_a");
    const image = makePendingDesignerBinding("image", "jugador_1", "slot_b");
    expect(designerSlotKey(text)).toBe(designerSlotKey(image));
    expect(designerEntityId(text)).toBe(designerEntityId(image));
  });

  it("fallback a slotId si no hay slotLabel (legacy)", () => {
    const binding = makePendingDesignerBinding("text", "");
    binding.slotLabel = "";
    expect(designerSlotKey(binding)).toBe(`slot::${binding.slotId}`);
  });

  it("makePendingDesignerBinding genera slotId interno", () => {
    const binding = makePendingDesignerBinding("image", "Foto");
    expect(binding.slotId).toBeTruthy();
    expect(binding.slotId).toMatch(/^slot_/);
  });
});

describe("populatePendingSlotKey", () => {
  it("prefija carpeta cuando hay folderEntityId", () => {
    const binding = makePendingDesignerBinding("text", "nombre");
    expect(populatePendingSlotKey(binding, "text", "jugador1")).toBe(
      "folder::jugador1::slot::nombre::text",
    );
    expect(populatePendingSlotKey(binding, "text")).toBe("slot::nombre::text");
  });
});
