import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  deriveBrandThemeFromDoc,
  mixHex,
  relativeLuminance,
} from "./brand-theme-color";
import { createEmptyGenoma } from "./genoma-defaults";
import {
  buildGoogleFontsCssUrl,
  normalizeFontDisplayName,
} from "./normalize-font-display-name";

describe("normalizeFontDisplayName", () => {
  it("limpia slugs internos de CSS", () => {
    expect(normalizeFontDisplayName("__fractul_a47117")).toBe("Fractul");
  });

  it("descarta fallbacks", () => {
    expect(normalizeFontDisplayName("_Fallback_sans")).toBeNull();
  });
});

describe("deriveBrandThemeFromDoc", () => {
  it("no está listo sin paleta resuelta", () => {
    expect(deriveBrandThemeFromDoc(createEmptyGenoma()).ready).toBe(false);
  });

  it("genera tema editorial claro con primario válido", () => {
    const doc = createEmptyGenoma();
    doc.slots.palette = {
      ...doc.slots.palette,
      status: "resolved",
      value: {
        colors: [
          { hex: "#1B3A8A", role: "primary" },
          { hex: "#FF6B00", role: "accent" },
          { hex: "#E8ECF5", role: "background" },
          { hex: "#141414", role: "text" },
        ],
      },
      confidence: 0.9,
    };

    const theme = deriveBrandThemeFromDoc(doc);
    expect(theme.ready).toBe(true);
    expect(theme.polarity).toBe("light");
    expect(theme.vars["--brand-primary"]).toBe("#1B3A8A");
    expect(contrastRatio(theme.vars["--brand-ink"], theme.vars["--brand-surface-page"])).toBeGreaterThanOrEqual(4.5);
  });

  it("usa polaridad oscura con background profundo", () => {
    const doc = createEmptyGenoma();
    doc.slots.palette = {
      ...doc.slots.palette,
      status: "resolved",
      value: {
        colors: [
          { hex: "#5B8CFF", role: "primary" },
          { hex: "#101018", role: "background" },
          { hex: "#F5F5F5", role: "text" },
        ],
      },
      confidence: 0.88,
    };

    const theme = deriveBrandThemeFromDoc(doc);
    expect(theme.ready).toBe(true);
    expect(theme.polarity).toBe("dark");
    expect(relativeLuminance(theme.vars["--brand-surface-page"])).toBeLessThan(0.35);
  });

  it("falla limpio con primario inválido", () => {
    const doc = createEmptyGenoma();
    doc.slots.palette = {
      ...doc.slots.palette,
      status: "resolved",
      value: { colors: [{ hex: "nope", role: "primary" }] },
      confidence: 0.2,
    };
    expect(deriveBrandThemeFromDoc(doc).ready).toBe(false);
  });
});

describe("buildGoogleFontsCssUrl", () => {
  it("construye URL con pesos deduplicados", () => {
    const url = buildGoogleFontsCssUrl([{ name: "Inter", weights: [400, 600, 400] }]);
    expect(url).toContain("family=Inter");
    expect(url).toContain("wght@400;600");
  });
});

// re-export editorialSurface for test - actually I didn't export it, remove that import

describe("mixHex", () => {
  it("mezcla hacia blanco", () => {
    expect(mixHex("#000000", "#FFFFFF", 0.5).toUpperCase()).toBe("#808080");
  });
});
