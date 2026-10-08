import { describe, expect, it } from "vitest";
import { createEmptyBrandKit } from "@/lib/brandkit/brand-kit-defaults";
import { guionistaBrainFromBrandKitData } from "./guionista-brandkit";

describe("guionistaBrainFromBrandKitData", () => {
  it("returns disabled context when BrandKit is empty", () => {
    const mapped = guionistaBrainFromBrandKitData({ brandKit: createEmptyBrandKit() });
    expect(mapped.context.enabled).toBe(false);
    expect(mapped.hints).toEqual([]);
  });

  it("maps voice and essence into Guionista brain context", () => {
    const doc = createEmptyBrandKit();
    doc.brandName = { value: "LaLiga", provenance: { type: "user_input", detail: "tú" } };
    doc.slots.voice = {
      ...doc.slots.voice,
      status: "resolved",
      value: {
        summary: "Cercana y orgullosa",
        descriptors: ["cercana", "institucional"],
        rules: ["Hablar de afición", "Evitar jerga técnica"],
        avoid: ["disruptivo", "sinergia"],
        evidence: [{ quote: "LaLiga con la comunidad" }],
      },
      confidence: 0.9,
    };
    doc.slots.essence = {
      ...doc.slots.essence,
      status: "resolved",
      value: {
        summary: "Compromiso con la comunidad",
        headline: "El fútbol une",
        purpose: "Impulsar el fútbol",
        beliefs: [{ label: "Comunidad primero" }],
        evidence: [],
      },
      confidence: 0.88,
    };

    const mapped = guionistaBrainFromBrandKitData({ brandKit: doc });
    expect(mapped.context.enabled).toBe(true);
    expect(mapped.context.projectContext).toContain("LaLiga");
    expect(mapped.context.projectContext).toContain("Compromiso con la comunidad");
    expect(mapped.context.tone).toEqual(expect.arrayContaining(["cercana", "institucional"]));
    expect(mapped.context.approvedClaims).toEqual(expect.arrayContaining(["El fútbol une", "Comunidad primero"]));
    expect(mapped.context.avoidPhrases).toEqual(expect.arrayContaining(["disruptivo", "sinergia"]));
    expect(mapped.context.notes).toEqual(expect.arrayContaining(["Hablar de afición"]));
    expect(mapped.context.references?.[0]).toContain("comunidad");
    expect(mapped.hints.length).toBeGreaterThan(0);
  });
});
