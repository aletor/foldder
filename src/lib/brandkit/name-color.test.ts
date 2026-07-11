import { describe, expect, it } from "vitest";
import { nameColor } from "./name-color";

describe("nameColor", () => {
  it("resuelve coincidencia exacta", () => {
    expect(nameColor("#1B3A8A")).toBe("Azul corporativo");
  });

  it("encuentra el más cercano para hex arbitrario", () => {
    const label = nameColor("#1B3A89");
    expect(label.length).toBeGreaterThan(0);
    expect(label).not.toBe("undefined");
  });

  it("nunca devuelve vacío", () => {
    expect(nameColor("invalid")).toBe("Color");
  });
});
