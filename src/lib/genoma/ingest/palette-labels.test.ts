import { describe, expect, it } from "vitest";
import { paletteRoleDisplayName } from "./palette-labels";

describe("paletteRoleDisplayName", () => {
  it("devuelve el rol en español sin jerga de operador PDF", () => {
    expect(paletteRoleDisplayName("primario")).toBe("primario");
    expect(paletteRoleDisplayName("acento")).toBe("acento");
  });
});
