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

  it("locks vertical crop and native 16:9 framing with thirds", () => {
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/vertical crop of the source must stay locked/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/VERTICAL CROP \(locked\)/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/BOTTOM EDGE:/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/feet NOT in frame/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/FINAL OUTPUT FRAMING/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/FRAME-LEFT EXTENSION/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/SUBJECT BAND/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/FRAME-RIGHT EXTENSION/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Outpaint coherence:/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/no black bars, no collage, no triptych/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/do NOT crop or zoom out vertically to reveal feet/i);
  });

  it("does not force full body when feet are cropped", () => {
    expect(MEDIA_DESCRIBER_VISION_PROMPT).not.toMatch(/If feet\/shoes visible → FS always/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/never imply feet\/legs if cropped out/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/MFS: head to knees or mid-thigh, feet NOT visible/i);
  });

  it("separates torso and head direction in frame coordinates", () => {
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/TORSO\/PELVIS faces/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/HEAD faces \(separate from torso/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Pose verified:/i);
  });

  it("requires support check and prop interaction for pose accuracy", () => {
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/SUPPORT CHECK/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/seated-on-counter/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/PROP INTERACTION/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/never call standing if thighs\/buttocks rest on a seat/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/seen from behind/i);
  });

  it("requires split toning and wardrobe text", () => {
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Highlight tone:/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Shadow tone:/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/WARDROBE & TEXT/i);
  });

  it("must-preserve copies lighting and color verbatim", () => {
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Lighting preserve:/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Color preserve:/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/copy verbatim from COLOR GRADE/i);
  });

  it("requires body weight and asymmetry with AMPLIFY rule", () => {
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/BODY WEIGHT & ASYMMETRY/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/AMPLIFY: if subtle asymmetry exists, exaggerate one step/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Shoulder line:/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/contrapposto/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/never generic "neutral hands"/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/symmetrical upright catalog pose/i);
  });

  it("expands pose verified with weight, shoulders, head tilt, and hands", () => {
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/weight on \[frame-left foot/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/shoulders \[frame-left higher ~15°/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/head tilt \[direction \+ degrees \+ chin\]/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/hands \[specific per-hand description\]/i);
  });

  it("forbids catalog language and requires per-hand descriptions", () => {
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(
      /AMPLIFY subtle body asymmetry — do not straighten to symmetrical catalog pose/i,
    );
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(
      /Never use catalog language \("neutral stance", "balanced posture"\)/i,
    );
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Describe each hand separately when both visible/i);
  });

  it("requires anti-perfection amplification for hair and environment", () => {
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/ANTI-PERFECTION/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/generators beautify and tidy by default/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/never invent dirt or mess not in the image/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/HAIR STYLING/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Hair styling: \[label\]/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/very-groomed-editorial/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/AMPLIFY hair disorder unless very-groomed-editorial/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/SURFACE CLUTTER/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Environment disorder: \[amplified level\]/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/AMPLIFY environment disorder — never tidy backgrounds/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Garment wear:/i);
  });

  it("must-preserve includes hair styling and imperfection anchor", () => {
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Hair styling line/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/prefer an imperfection anchor/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/perspective skew \/ off-center composition/i);
  });

  it("requires regeneration variance for text-only downstream", () => {
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/REGENERATION VARIANCE/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/MACRO-PRESERVE/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/MICRO-VARY/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Regeneration variance: macro-preserve/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/never triptych, black vertical bars/i);
  });

  it("requires lens type with normal default and ultra-wide only with evidence", () => {
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Default to normal/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/ultra-wide/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/ONLY if strong barrel distortion/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/never upgrade lens category/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Close camera distance alone is NOT ultra-wide/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Lens & camera: \[lens type/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Never write plain "eye-level"/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/intentionally level neutral-lens/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(
      /never upgrade to ultra-wide without strong edge-distortion evidence/i,
    );
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/copy Lens & camera line/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Perspective imperfection line/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/FRAME-LEFT EXTENSION \/ SUBJECT BAND \/ FRAME-RIGHT EXTENSION/i);
  });

  it("requires perspective imperfection with anti real-estate AMPLIFY", () => {
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/PERSPECTIVE IMPERFECTION/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/Perspective imperfection: camera offset/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/real-estate \/ architectural straight-on symmetry/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(/do NOT straighten to a perfect grid/i);
    expect(MEDIA_DESCRIBER_VISION_PROMPT).toMatch(
      /AMPLIFY perspective imperfection — off-center camera/i,
    );
  });
});
