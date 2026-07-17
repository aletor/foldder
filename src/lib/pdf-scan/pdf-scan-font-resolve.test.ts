import { describe, expect, it } from "vitest";
import {
  isGenericCssFontFamily,
  pickPdfFontNameForMapping,
} from "./pdf-scan-font-resolve";
import { mapPdfFontToDesigner } from "./pdf-scan-font-map";
import { isAxisAlignedRectPathD } from "@/app/spaces/pdf-scan/pdf-scan-to-designer";
import { collectGoogleFontFamiliesFromObjects } from "@/app/spaces/pdf-scan/pdf-scan-ensure-fonts";

describe("pickPdfFontNameForMapping", () => {
  it("prefers embedded PostScript name over generic CSS family", () => {
    expect(
      pickPdfFontNameForMapping({
        resourceFont: "g_d0_f1",
        embeddedName: "ABCDEF+Montserrat-Bold",
        styleFamily: "sans-serif",
      }),
    ).toBe("ABCDEF+Montserrat-Bold");
  });

  it("ignores generic style families", () => {
    expect(isGenericCssFontFamily("sans-serif")).toBe(true);
    expect(
      pickPdfFontNameForMapping({
        resourceFont: "g_d0_f2",
        embeddedName: null,
        styleFamily: "sans-serif",
      }),
    ).toBe("g_d0_f2");
  });
});

describe("mapPdfFontToDesigner with embedded names", () => {
  it("maps Montserrat subset to Google family", () => {
    const mapped = mapPdfFontToDesigner("ABCDEF+Montserrat-Bold");
    expect(mapped.matched).toBe(true);
    expect(mapped.fontFamily).toBe("Montserrat");
    expect(mapped.fontWeight).toBe(700);
  });
});

describe("isAxisAlignedRectPathD", () => {
  it("detects closed axis-aligned rectangle", () => {
    const d = "M 10 20 L 110 20 L 110 80 L 10 80 Z";
    expect(isAxisAlignedRectPathD(d, 10, 20, 100, 60)).toBe(true);
  });

  it("rejects non-rect paths", () => {
    const d = "M 10 20 L 110 20 L 60 80 Z";
    expect(isAxisAlignedRectPathD(d, 10, 20, 100, 60)).toBe(false);
  });
});

describe("collectGoogleFontFamiliesFromObjects", () => {
  it("collects primary Google families from text objects", () => {
    const families = collectGoogleFontFamiliesFromObjects([
      { type: "text", fontFamily: "Montserrat" },
      { type: "text", fontFamily: 'Helvetica, "Helvetica Neue", Arial, sans-serif' },
      {
        type: "groupContainer",
        children: [{ type: "text", fontFamily: "Roboto" }],
      },
    ]);
    expect(families).toEqual(["Montserrat", "Roboto"]);
  });
});
