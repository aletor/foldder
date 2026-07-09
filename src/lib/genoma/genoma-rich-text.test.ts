import { describe, expect, it } from "vitest";
import { parseGenomaRichText, stripGenomaRichMarkup, autoEmphasizeGenomaText } from "./genoma-rich-text";

describe("genoma-rich-text", () => {
  it("parses bold segments", () => {
    expect(parseGenomaRichText("Una marca **autoral** y clara")).toEqual([
      { type: "text", text: "Una marca " },
      { type: "bold", text: "autoral" },
      { type: "text", text: " y clara" },
    ]);
  });

  it("strips markup for plain comparison", () => {
    expect(stripGenomaRichMarkup("Voz **directa** y cercana")).toBe("Voz directa y cercana");
  });

  it("auto-emphasizes terms when markup is missing", () => {
    expect(autoEmphasizeGenomaText("Voz directa y cercana", ["directa"])).toBe("Voz **directa** y cercana");
  });
});
