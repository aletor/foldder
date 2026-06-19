import { describe, expect, it } from "vitest";
import { MEDIA_DESCRIBER_VISION_PROMPT } from "./media-describer-prompt";

describe("MEDIA_DESCRIBER_VISION_PROMPT", () => {
  it("requires structured sections for image regeneration", () => {
    for (const header of [
      "SUBJECT & POSE:",
      "WARDROBE & TEXT:",
      "CAMERA:",
      "COMPOSITION & FRAMING:",
      "LIGHTING:",
      "COLOR GRADE:",
      "ENVIRONMENT & PROPS:",
      "MOOD, ATMOSPHERE & STYLE:",
      "MUST-PRESERVE FOR REGENERATION:",
    ]) {
      expect(MEDIA_DESCRIBER_VISION_PROMPT).toContain(header);
    }
  });

  it("targets 16:9 landscape expansion for portrait sources", () => {
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/16:9 landscape/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/SOURCE ORIENTATION/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/expand environment left and right/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/do NOT zoom in/i);
  });

  it("separates torso and head direction in frame coordinates", () => {
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/TORSO\/PELVIS faces/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/HEAD faces \(separate from torso/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/POSE ARCHETYPE/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/never mirror left\/right/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/NEVER use subject's anatomical left\/right/i);
  });

  it("requires bottom-edge check and FS when feet visible", () => {
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Bottom-edge check/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/FULL BODY head to toe/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/NEVER MFS or MS/i);
  });

  it("requires split toning and wardrobe text", () => {
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Split toning/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Highlight tone:/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Shadow tone:/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/WARDROBE & TEXT/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/quote literally with text color/i);
  });

  it("requires must-preserve bullets", () => {
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Exactly 5 bullets/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/expand to 16:9 without cropping feet/i);
  });

  it("detects subtle wind and atmospheric air before defaulting to still", () => {
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Atmospheric air & openness/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/BEFORE writing still air/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/subtle displacement = at least gentle breeze/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Do NOT default to still air/i);
  });

  it("amplifies lighting and avoids default soft/warm", () => {
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/on-camera flash/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/AMPLIFY/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Do NOT default warm/i);
  });
});
