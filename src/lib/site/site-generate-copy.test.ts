import { describe, expect, it } from "vitest";
import { applyGeneratedCopyToSection, parseSiteGeneratedCopy } from "./site-generate-copy";
import { createFactorySection } from "./site-presets";

describe("site-generate-copy", () => {
  it("parses FAQ json", () => {
    const result = parseSiteGeneratedCopy(
      "faq",
      JSON.stringify({
        items: [{ question: "¿Qué es?", answer: "Un sitio." }],
      }),
    );
    expect(result.kind).toBe("faq");
    if (result.kind === "faq") {
      expect(result.items[0]?.question).toBe("¿Qué es?");
    }
  });

  it("applies pricing copy with 3-column layout", () => {
    const section = createFactorySection("pricing");
    const next = applyGeneratedCopyToSection(
      section,
      {
        kind: "pricing",
        plans: [
          { name: "Starter", price: "9 €", description: "Básico", cta: "Elegir" },
          { name: "Pro", price: "29 €", description: "Pro", cta: "Elegir Pro" },
          { name: "Enterprise", price: "Custom", description: "Enterprise", cta: "Contactar" },
        ],
      },
      "es",
    );
    expect(next.layout.split?.groupSize).toBe(3);
    expect(next.layout.split?.rootPosition).toBe("above");
    expect(next.children?.length).toBe(9);
  });
});
