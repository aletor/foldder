import { describe, expect, it } from "vitest";
import { createEmptyGenoma } from "@/lib/genoma/genoma-defaults";
import type { PaletteValue } from "@/lib/genoma/genoma-types";
import {
  buildGenomaShowcaseData,
  shouldRenderGenomaShowcase,
} from "./genoma-showcase-data";

function withResolvedPalette(doc: ReturnType<typeof createEmptyGenoma>) {
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

describe("shouldRenderGenomaShowcase", () => {
  it("requiere paleta resuelta y logo o nombre", () => {
    const doc = createEmptyGenoma();
    expect(shouldRenderGenomaShowcase(doc, false)).toBe(false);

    const ready = withResolvedPalette(doc);
    expect(shouldRenderGenomaShowcase(ready, false)).toBe(true);
  });

  it("en solo confirmado oculta si paleta no está locked", () => {
    const doc = withResolvedPalette(createEmptyGenoma());
    expect(shouldRenderGenomaShowcase(doc, true)).toBe(false);

    doc.slots.palette.locked = true;
    expect(shouldRenderGenomaShowcase(doc, true)).toBe(true);
  });
});

describe("buildGenomaShowcaseData", () => {
  it("construye email de contacto desde fuente url", () => {
    const doc = withResolvedPalette(createEmptyGenoma());
    doc.sources = [{ kind: "url", ref: "https://www.oaro.net", ts: new Date().toISOString() }];
    doc.slots.essence = {
      ...doc.slots.essence,
      status: "resolved",
      value: { summary: "Resumen", headline: "Headline real", beliefs: [], evidence: [] },
    };

    const data = buildGenomaShowcaseData(doc, false);
    expect(data?.headline).toBe("Headline real");
    expect(data?.contactEmail).toBe("hola@oaro.net");
    expect(data?.ctaLabel).toBe("Descubrir más");
  });
});
