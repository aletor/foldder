import { describe, expect, it } from "vitest";
import { createDemoGenomaFixture } from "./genoma-defaults";
import { buildGenomaStylePrompt, compileGenoma } from "./compile-genoma";

describe("compileGenoma", () => {
  it("builds compiled artifacts and stable hash from demo fixture", async () => {
    const doc = createDemoGenomaFixture();
    const first = await compileGenoma(doc);
    const second = await compileGenoma(doc);

    expect(first.compiled.stylePrompt).toContain("Brand editorial photo");
    expect(first.compiled.paletteTokens).toMatchObject({ schema: "foldder.brand-tokens.v1" });
    expect(first.compiled.fontStack).toBeTruthy();
    expect(first.compiledHash).toHaveLength(64);
    expect(first.compiledHash).toBe(second.compiledHash);
  });

  it("includes verdict hints in style prompt", () => {
    const doc = createDemoGenomaFixture();
    doc.slots.gallery = {
      ...doc.slots.gallery,
      status: "resolved",
      value: {
        harvested: [],
        generated: [{ assetId: "a", previewUrl: "https://example.com/a.png", verdict: "up", promptVersion: 1 }],
        stylePromptVersion: 1,
      },
    };
    const prompt = buildGenomaStylePrompt(doc, 1);
    expect(prompt).toContain("example.com/a.png");
  });
});
