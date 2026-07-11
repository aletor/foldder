import { describe, expect, it } from "vitest";
import { createEmptyBrandKit } from "../brand-kit-defaults";
import { brandKitDocumentToGenome } from "./brand-kit-document-to-genome";
import { buildBookView } from "./book-view";
import { getTrait } from "../model/trait";

describe("brandKitDocumentToGenome", () => {
  it("proyecta slots resueltos a traits con corona si están bloqueados", () => {
    const doc = createEmptyBrandKit();
    doc.brandName = { value: "Acme", provenance: { type: "user_input", detail: "tú" } };
    doc.slots.palette = {
      ...doc.slots.palette,
      status: "resolved",
      locked: true,
      value: {
        colors: [
          { hex: "#FFBD1B", role: "primary" },
          { hex: "#1A1B1E", role: "secondary" },
        ],
      },
      provenance: { type: "css_var", detail: "web" },
      updatedAt: doc.updatedAt,
    };
    doc.slots.logo = {
      ...doc.slots.logo,
      status: "resolved",
      locked: false,
      value: {
        assetId: "logo.png",
        previewUrl: "https://example.com/logo.png",
        format: "png",
        width: 200,
        height: 80,
        background: "transparent",
        variants: [],
      },
      provenance: { type: "header_img", detail: "web" },
      updatedAt: doc.updatedAt,
    };

    const genome = brandKitDocumentToGenome(doc);
    const view = buildBookView(genome);

    expect(view.palette.find((p) => p.role === "primary")?.slot.state).toBe("crowned");
    expect(view.palette.find((p) => p.role === "secondary")?.slot.state).toBe("crowned");
    expect(view.logo.primary.state).toBe("proposed");
    expect(view.logo.primary.value?.imageUrl).toBe("https://example.com/logo.png");

    const logoTrait = getTrait(genome, "logo.primary");
    expect(logoTrait?.crownedIds).toHaveLength(0);
    expect(logoTrait?.candidates).toHaveLength(1);
  });

  it("mapea voz y esencia a sección voice del libro", () => {
    const doc = createEmptyBrandKit();
    doc.slots.essence = {
      ...doc.slots.essence,
      status: "resolved",
      locked: true,
      value: {
        summary: "Marca cercana y rigurosa.",
        headline: "Mueve lo que importa",
        beliefs: [{ label: "transparencia" }],
        evidence: [],
      },
      updatedAt: doc.updatedAt,
    };
    doc.slots.voice = {
      ...doc.slots.voice,
      status: "resolved",
      locked: true,
      value: {
        summary: "Cercana",
        descriptors: ["cercana", "rigurosa"],
        rules: [],
        avoid: ["jerga vacía"],
        evidence: [],
      },
      updatedAt: doc.updatedAt,
    };

    const view = buildBookView(brandKitDocumentToGenome(doc));
    expect(view.voice.tagline.state).toBe("crowned");
    expect(view.voice.tagline.value?.text).toBe("Mueve lo que importa");
    expect(view.voice.tone.items.length).toBeGreaterThan(0);
    expect(view.voice.claimsForbidden.items.length).toBeGreaterThan(0);
  });
});
