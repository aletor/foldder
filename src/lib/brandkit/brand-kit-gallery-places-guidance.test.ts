import { describe, expect, it } from "vitest";
import { brandPlacesWorldHint, PLACES_LOCATION_FIRST_CORE } from "./brand-kit-gallery-places-guidance";

describe("brand-kit-gallery-places-guidance", () => {
  it("allows ambient crowds and graffiti in core rule", () => {
    expect(PLACES_LOCATION_FIRST_CORE).toContain("Crowds, ambient objects");
    expect(PLACES_LOCATION_FIRST_CORE).toContain("graffiti");
    expect(PLACES_LOCATION_FIRST_CORE).toContain("hero SKU");
  });

  it("brandPlacesWorldHint avoids product context", () => {
    const hint = brandPlacesWorldHint({
      brandName: { value: "Acme", provenance: { type: "user", detail: "" } },
      slots: {
        essence: {
          status: "resolved",
          value: {
            summary: "Calzado",
            beliefs: [],
            evidence: [],
            brandContext: "Running shoes catalog",
            purpose: "Urban running culture",
          },
        },
        visualWorld: {
          status: "resolved",
          value: {
            summary: "Ciudad nocturna",
            moodTags: ["urbano"],
            visualTraits: [],
            limits: [],
            evidence: [],
            galleryRefs: [],
          },
        },
      },
      updatedAt: "",
    } as import("./brand-kit-types").BrandKitDocument);

    expect(hint).toContain("place and atmosphere");
    expect(hint).toContain("Urban running culture");
    expect(hint.toLowerCase()).not.toContain("running shoes catalog");
    expect(hint.toLowerCase()).not.toContain("product context");
  });
});
