import { describe, expect, it } from "vitest";
import { parseBrandKitRichText, stripBrandKitRichMarkup, autoEmphasizeBrandKitText } from "./brand-kit-rich-text";

describe("brand-kit-rich-text", () => {
  it("parses bold segments", () => {
    expect(parseBrandKitRichText("Una marca **autoral** y clara")).toEqual([
      { type: "text", text: "Una marca " },
      { type: "bold", text: "autoral" },
      { type: "text", text: " y clara" },
    ]);
  });

  it("strips markup for plain comparison", () => {
    expect(stripBrandKitRichMarkup("Voz **directa** y cercana")).toBe("Voz directa y cercana");
  });

  it("auto-emphasizes terms when markup is missing", () => {
    expect(autoEmphasizeBrandKitText("Voz directa y cercana", ["directa"])).toBe("Voz **directa** y cercana");
  });
});
