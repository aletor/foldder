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

  it("appends full-body framing preservation for describer FS output", () => {
    const input =
      "COMPOSITION & FRAMING: FULL BODY head to toe — feet fully visible, do not crop at ankles.";
    expect(normalizeGenerativeImagePrompt(input, { targetAspectRatio: "16:9" })).toMatch(
      /do not crop at ankles or knees/,
    );
  });

  it("appends full-body suffix when MFS contradicts visible feet", () => {
    const input = "COMPOSITION: Knee-crop (MFS). Subject wearing cyan sneakers on floor.";
    expect(normalizeGenerativeImagePrompt(input, { targetAspectRatio: "16:9" })).toMatch(
      /full-body shot/i,
    );
  });

  it("appends 16:9 horizontal expansion for portrait source", () => {
    const input =
      "SOURCE ORIENTATION: portrait vertical. FULL BODY head to toe — feet/shoes fully visible.";
    const out = normalizeGenerativeImagePrompt(input, { targetAspectRatio: "16:9" });
    expect(out).toMatch(/expand the environment horizontally/i);
    expect(out).toMatch(/do NOT zoom in/i);
    expect(out).toMatch(/do NOT crop ankles/i);
  });

  it("skips widescreen expansion when target is square", () => {
    const input = "SOURCE ORIENTATION: portrait vertical. FULL BODY head to toe.";
    const out = normalizeGenerativeImagePrompt(input, { targetAspectRatio: "1:1" });
    expect(out).not.toMatch(/expand the environment horizontally/i);
  });

  it("appends cool shadow preservation for blue-teal grade", () => {
    const input = "COLOR GRADE: Shadow tone: deep blue-teal shadows under stool.";
    expect(normalizeGenerativeImagePrompt(input)).toMatch(/cool blue-teal color cast in all shadows/i);
  });

  it("preserves decoupled torso/head pose", () => {
    const input =
      "Pose verified: torso toward frame-left, head toward frame-right, gaze frame-right.";
    expect(normalizeGenerativeImagePrompt(input)).toMatch(/decoupled pose/i);
  });
});
