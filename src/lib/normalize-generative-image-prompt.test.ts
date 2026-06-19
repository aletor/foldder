import { describe, expect, it } from "vitest";
import { normalizeGenerativeImagePrompt } from "./normalize-generative-image-prompt";

describe("normalizeGenerativeImagePrompt", () => {
  it("strips Create a scene prefixes from describer output", () => {
    const input =
      "Create a cozy indoor scene featuring a person lounging on a vintage leather sofa.";
    expect(normalizeGenerativeImagePrompt(input)).toBe(
      "A cozy indoor scene featuring a person lounging on a vintage leather sofa.",
    );
  });

  it("leaves descriptive prompts unchanged", () => {
    const input = "Eye-level medium shot, warm tungsten grade, person on a leather sofa.";
    expect(normalizeGenerativeImagePrompt(input)).toBe(input);
  });

  it("returns original when stripping would empty the prompt", () => {
    expect(normalizeGenerativeImagePrompt("Create an image")).toBe("Create an image");
  });
});
