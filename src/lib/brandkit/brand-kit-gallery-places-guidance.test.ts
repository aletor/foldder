import { describe, expect, it } from "vitest";
import {
  brandPlacesWorldHint,
  PLACES_LOCATION_FIRST_CORE,
  PLACES_LOCATION_FIRST_FINISH,
  PLACES_NO_TEXT_OVERLAY_RULE,
  placesAdnSuggestsPopulatedVenue,
} from "./brand-kit-gallery-places-guidance";

describe("brand-kit-gallery-places-guidance", () => {
  it("defaults to uninhabited spaces and only allows people when brief specifies", () => {
    expect(PLACES_LOCATION_FIRST_CORE).toContain("Default to uninhabited");
    expect(PLACES_LOCATION_FIRST_CORE).toContain("only if the scene brief explicitly");
    expect(PLACES_LOCATION_FIRST_CORE).not.toContain("are welcome");
    expect(PLACES_LOCATION_FIRST_FINISH).toContain("unless the scene brief");
  });

  it("forbids overlaid titles and marketing typography", () => {
    expect(PLACES_NO_TEXT_OVERLAY_RULE).toContain("no titles");
    expect(PLACES_LOCATION_FIRST_CORE).toContain("no titles");
    expect(PLACES_LOCATION_FIRST_FINISH).toContain("overlaid titles");
  });

  it("detects populated venue cues from ADN", () => {
    expect(placesAdnSuggestsPopulatedVenue({ moodTags: ["festival", "nocturno"] })).toBe(true);
    expect(placesAdnSuggestsPopulatedVenue({ moodTags: ["minimal", "sereno"] })).toBe(false);
  });

  it("brandPlacesWorldHint uses visual territory only, not purpose copy", () => {
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

    expect(hint).toContain("place, light, and atmosphere");
    expect(hint).toContain("Ciudad nocturna");
    expect(hint).toContain("never as overlaid titles");
    expect(hint).not.toContain("Urban running culture");
    expect(hint.toLowerCase()).not.toContain("running shoes catalog");
  });
});
