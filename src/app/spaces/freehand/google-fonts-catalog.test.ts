import { describe, expect, it } from "vitest";
import {
  paginateGoogleFontCatalog,
  parseFontsourceCatalog,
  searchGoogleFontCatalog,
} from "./google-fonts-catalog";
import { googleFontBatchStylesheetHref, googleFontStylesheetHref } from "./google-fonts";

describe("google-fonts-catalog", () => {
  it("parsea Fontsource y busca por nombre", () => {
    const catalog = parseFontsourceCatalog([
      { family: "Inter", category: "sans-serif", type: "google" },
      { family: "Playfair Display", category: "serif", type: "google" },
      { family: "Other", category: "sans-serif", type: "other" },
    ]);
    expect(catalog).toHaveLength(2);
    expect(searchGoogleFontCatalog(catalog, "play")).toHaveLength(1);
    expect(searchGoogleFontCatalog(catalog, "serif")).toHaveLength(1);
  });

  it("pagina resultados", () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ family: `F${i}`, category: "Sans" }));
    const p1 = paginateGoogleFontCatalog(items, 1, 24);
    expect(p1.pageItems).toHaveLength(24);
    expect(p1.totalPages).toBe(3);
    const p3 = paginateGoogleFontCatalog(items, 3, 24);
    expect(p3.pageItems).toHaveLength(2);
  });
});

describe("google-fonts hrefs", () => {
  it("usa URL compatible sin ejes variables inválidos", () => {
    expect(googleFontStylesheetHref("Antic Didone")).toBe(
      "https://fonts.googleapis.com/css2?family=Antic+Didone&display=swap",
    );
  });

  it("batch preview concatena familias", () => {
    expect(googleFontBatchStylesheetHref(["Antic Didone", "Inter"])).toBe(
      "https://fonts.googleapis.com/css2?family=Antic+Didone&family=Inter&display=swap",
    );
  });
});
