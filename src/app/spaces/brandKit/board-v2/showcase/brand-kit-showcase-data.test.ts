import { describe, expect, it } from "vitest";
import { createEmptyBrandKit } from "@/lib/brandkit/brand-kit-defaults";
import type { PaletteValue } from "@/lib/brandkit/brand-kit-types";
import {
  buildBrandKitShowcaseData,
  shouldRenderBrandKitShowcase,
} from "./brand-kit-showcase-data";

function withResolvedPalette(doc: ReturnType<typeof createEmptyBrandKit>) {
  const palette: PaletteValue = {
    colors: [{ hex: "#1B3A8A", role: "primary" }],
  };
  doc.slots.palette = {
    ...doc.slots.palette,
    status: "resolved",
    value: palette,
    locked: false,
  };
  doc.brandName = { value: "OARO", provenance: { type: "user_input", detail: "test" } };
  return doc;
}

describe("shouldRenderBrandKitShowcase", () => {
  it("requiere paleta resuelta y logo o nombre", () => {
    const doc = createEmptyBrandKit();
    expect(shouldRenderBrandKitShowcase(doc, false)).toBe(false);

    const ready = withResolvedPalette(doc);
    expect(shouldRenderBrandKitShowcase(ready, false)).toBe(true);
  });

  it("en solo confirmado oculta si paleta no está locked", () => {
    const doc = withResolvedPalette(createEmptyBrandKit());
    expect(shouldRenderBrandKitShowcase(doc, true)).toBe(false);

    doc.slots.palette.locked = true;
    expect(shouldRenderBrandKitShowcase(doc, true)).toBe(true);
  });
});

describe("buildBrandKitShowcaseData", () => {
  it("construye email de contacto desde fuente url", () => {
    const doc = withResolvedPalette(createEmptyBrandKit());
    doc.sources = [{ kind: "url", ref: "https://www.oaro.net", ts: new Date().toISOString() }];
    doc.slots.essence = {
      ...doc.slots.essence,
      status: "resolved",
      value: { summary: "Resumen", headline: "Headline real", beliefs: [], evidence: [] },
    };

    const data = buildBrandKitShowcaseData(doc, false);
    expect(data?.headline).toBe("Headline real");
    expect(data?.campaign.headline).toBe("Headline real");
    expect(data?.canRenderMockups).toBe(false);
    expect(data?.requirements.length).toBe(5);
    expect(data?.contactEmail).toBe("hola@oaro.net");
    expect(data?.ctaLabel).toBeTruthy();
  });
});
