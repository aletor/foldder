import { describe, expect, it } from "vitest";
import { createDemoBrandKitFixture } from "./brand-kit-defaults";
import { buildBrandKitStylePrompt, compileBrandKit } from "./compile-brand-kit";

describe("compileBrandKit", () => {
  it("builds compiled artifacts and stable hash from demo fixture", async () => {
    const doc = createDemoBrandKitFixture();
    const first = await compileBrandKit(doc);
    const second = await compileBrandKit(doc);

    expect(first.compiled.stylePrompt).toContain("Brand editorial photo");
    expect(first.compiled.paletteTokens).toMatchObject({ schema: "foldder.brand-tokens.v1" });
    expect(first.compiled.fontStack).toBeTruthy();
    expect(first.compiledHash).toHaveLength(64);
    expect(first.compiledHash).toBe(second.compiledHash);
  });

  it("includes verdict hints in style prompt", () => {
    const doc = createDemoBrandKitFixture();
    doc.slots.gallery = {
      ...doc.slots.gallery,
      status: "resolved",
      value: {
        harvested: [],
        generated: [{ assetId: "a", previewUrl: "https://example.com/a.png", verdict: "up", promptVersion: 1 }],
        stylePromptVersion: 1,
      },
    };
    const prompt = buildBrandKitStylePrompt(doc, 1);
    expect(prompt).toContain("example.com/a.png");
  });

  it("treats generated images without verdict as accepted in style prompt", () => {
    const doc = createDemoBrandKitFixture();
    doc.slots.gallery = {
      ...doc.slots.gallery,
      status: "resolved",
      value: {
        harvested: [],
        generated: [{ assetId: "b", previewUrl: "https://example.com/b.png", promptVersion: 1 }],
        stylePromptVersion: 1,
      },
    };
    const prompt = buildBrandKitStylePrompt(doc, 1);
    expect(prompt).toContain("example.com/b.png");
  });
});
