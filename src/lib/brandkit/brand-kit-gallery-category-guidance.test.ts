import { describe, expect, it } from "vitest";
import { buildGalleryImagePrompt } from "./brand-kit-gallery-category-guidance";

describe("buildGalleryImagePrompt", () => {
  const stylePrompt =
    "Brand editorial photo for Acme. Palette: primary:#E07A5F. Photorealistic brand imagery, no text overlays, no logos.";

  it("uses editorial style prompt for non-texture categories", () => {
    const prompt = buildGalleryImagePrompt("objects", stylePrompt, "Still life object on wood desk.");
    expect(prompt).toContain("Brand editorial photo");
    expect(prompt).toContain("Still life object on wood desk.");
  });

  it("uses macro texture prompt without editorial scene framing", () => {
    const prompt = buildGalleryImagePrompt(
      "textures",
      stylePrompt,
      "Brushed aluminum with fine linear grain, satin finish.",
      {
        brandName: { value: "Acme", provenance: { type: "user", detail: "" } },
        slots: {
          palette: {
            status: "resolved",
            value: {
              colors: [{ hex: "#E07A5F", role: "accent" }],
            },
          },
        },
        updatedAt: "",
      } as import("./brand-kit-types").BrandKitDocument,
    );
    expect(prompt).not.toContain("Brand editorial photo");
    expect(prompt).toContain("Macro material texture photograph");
    expect(prompt).toContain("Brushed aluminum");
    expect(prompt).toContain("No people");
    expect(prompt).toContain("#E07A5F");
  });

  it("uses empty environment prompt without editorial scene framing", () => {
    const prompt = buildGalleryImagePrompt(
      "places",
      stylePrompt,
      "Empty airport terminal at dawn, wide shot.",
      {
        brandName: { value: "Acme", provenance: { type: "user", detail: "" } },
        slots: {
          palette: {
            status: "resolved",
            value: { colors: [{ hex: "#336699", role: "primary" }] },
          },
          visualWorld: {
            status: "resolved",
            value: { summary: "Luz fría", moodTags: ["Cinematográfico"], visualTraits: [], limits: [], evidence: [] },
          },
        },
        updatedAt: "",
      } as import("./brand-kit-types").BrandKitDocument,
    );
    expect(prompt).not.toContain("Brand editorial photo");
    expect(prompt).toContain("no people");
    expect(prompt).toContain("Empty airport terminal");
    expect(prompt).toContain("Cinematográfico");
  });
});
