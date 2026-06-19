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

  it("preserves vertical crop when feet are not in frame", () => {
    const input =
      "BOTTOM EDGE: mid-thigh cut — feet NOT in frame. SOURCE ORIENTATION: portrait vertical.";
    const out = normalizeGenerativeImagePrompt(input, { targetAspectRatio: "16:9" });
    expect(out).toMatch(/do not zoom out to reveal feet/i);
    expect(out).toMatch(/single native 16:9 landscape photograph|ONE continuous native 16:9/i);
    expect(out).toMatch(/no vertical black bars|ONE continuous photograph filling the entire 16:9/i);
    expect(out).not.toMatch(/feet and shoes fully in frame/i);
  });

  it("prepends text-only recreation prefix when no reference images", () => {
    const input =
      "SOURCE ORIENTATION: portrait vertical. FINAL OUTPUT FRAMING: FRAME-LEFT EXTENSION: sky continues gradient frame-left.";
    const out = normalizeGenerativeImagePrompt(input, {
      targetAspectRatio: "16:9",
      textOnlyRecreation: true,
    });
    expect(out).toMatch(/^Recreate this scene as ONE single continuous 16:9/i);
    expect(out).toMatch(/not a copy of any source file/i);
    expect(out).toMatch(/no vertical black bars|ONE continuous photograph filling the entire 16:9/i);
  });

  it("skips text-only prefix when reference images are used", () => {
    const input = "SOURCE ORIENTATION: portrait vertical. FRAME-LEFT EXTENSION: wall.";
    const out = normalizeGenerativeImagePrompt(input, {
      targetAspectRatio: "16:9",
      textOnlyRecreation: false,
    });
    expect(out).not.toMatch(/^Recreate this scene from the description/i);
  });

  it("preserves full-body vertical crop when feet are in source", () => {
    const input = "BOTTOM EDGE: feet/shoes visible. Preserve exact vertical crop.";
    const out = normalizeGenerativeImagePrompt(input, { targetAspectRatio: "16:9" });
    expect(out).toMatch(/identical top\/bottom frame boundaries|same top\/bottom boundaries/i);
    expect(out).not.toMatch(/reveal feet, legs, or headroom that were cropped/i);
  });

  it("skips widescreen expansion when target is square", () => {
    const input = "SOURCE ORIENTATION: portrait vertical. feet NOT in frame.";
    const out = normalizeGenerativeImagePrompt(input, { targetAspectRatio: "1:1" });
    expect(out).not.toMatch(/expand the environment horizontally/i);
  });

  it("appends cool shadow preservation for blue-teal grade", () => {
    const input = "COLOR GRADE: Shadow tone: deep blue-teal crushed shadows under stool.";
    expect(normalizeGenerativeImagePrompt(input)).toMatch(/cool shadow color cast/i);
    expect(normalizeGenerativeImagePrompt(input)).toMatch(/deep blue-teal crushed shadows/i);
  });

  it("appends highlight and shadow preservation from must-preserve color bullet", () => {
    const input =
      'Color preserve: Highlight tone: blazing warm golden highlights AND Shadow tone: deep blue-teal shadows. Lighting preserve: direct sun, Quality hard, contrast very high.';
    const out = normalizeGenerativeImagePrompt(input);
    expect(out).toMatch(/blazing warm golden highlights/i);
    expect(out).toMatch(/deep blue-teal shadows/i);
    expect(out).toMatch(/hard directional lighting/i);
  });

  it("preserves seated-on-counter pose", () => {
    const input = "Pose verified: support counter, archetype seated-on-counter, torso toward frame-left.";
    expect(normalizeGenerativeImagePrompt(input)).toMatch(/seated-on-counter pose/i);
  });

  it("preserves seen-from-behind pose", () => {
    const input = "face not visible, seen from behind. Pose preserve: archetype seen-from-behind.";
    expect(normalizeGenerativeImagePrompt(input)).toMatch(/seen-from-behind framing/i);
  });

  it("preserves decoupled torso/head pose", () => {
    const input =
      "Pose verified: torso toward frame-left, head toward frame-right, gaze frame-right.";
    expect(normalizeGenerativeImagePrompt(input)).toMatch(/decoupled pose/i);
  });

  it("appends asymmetric pose preservation for shoulder tilt", () => {
    const input =
      "Pose verified: shoulders frame-left higher ~15°, torso toward frame-left.";
    const out = normalizeGenerativeImagePrompt(input);
    expect(out).toMatch(/shoulder inclination exactly as described/i);
    expect(out).toMatch(/do not level shoulders/i);
  });

  it("appends head tilt preservation suffix", () => {
    const input = "Pose verified: head tilt frame-right ~10°, chin slightly down.";
    const out = normalizeGenerativeImagePrompt(input);
    expect(out).toMatch(/head and neck tilt exactly as described/i);
    expect(out).toMatch(/do not straighten to upright catalog pose/i);
  });

  it("appends weight shift and relaxed limb preservation", () => {
    const input =
      "Pose verified: weight on frame-left foot, frame-right hand loose grip, left arm hanging.";
    const out = normalizeGenerativeImagePrompt(input);
    expect(out).toMatch(/natural asymmetric body weight and relaxed limb hang/i);
    expect(out).toMatch(/do not straighten to symmetrical catalog pose/i);
  });

  it("appends contrapposto asymmetric preservation", () => {
    const input = "BODY WEIGHT & ASYMMETRY: hips contrapposto, one side lower.";
    const out = normalizeGenerativeImagePrompt(input);
    expect(out).toMatch(/natural asymmetric body weight/i);
  });

  it("skips asymmetric suffix when pose is symmetric catalog", () => {
    const input = "Pose verified: support floor, archetype standing, torso toward camera.";
    const out = normalizeGenerativeImagePrompt(input);
    expect(out).not.toMatch(/natural asymmetric body weight/i);
  });

  it("appends hair mess preservation for tousled styling", () => {
    const input = 'Hair styling: tousled — flyaways at crown, uneven volume frame-left.';
    const out = normalizeGenerativeImagePrompt(input);
    expect(out).toMatch(/hair disorder exactly as described/i);
    expect(out).toMatch(/do not smooth to salon-perfect hair/i);
  });

  it("skips hair mess preservation for very-groomed-editorial", () => {
    const input = "Hair styling: very-groomed-editorial — sleek blowout, no flyaways.";
    const out = normalizeGenerativeImagePrompt(input);
    expect(out).not.toMatch(/hair disorder exactly as described/i);
  });

  it("appends environment disorder preservation", () => {
    const input =
      'Environment disorder: cluttered — mug frame-left, crumpled napkin frame-right, crooked picture frame.';
    const out = normalizeGenerativeImagePrompt(input);
    expect(out).toMatch(/environment disorder exactly as described/i);
    expect(out).toMatch(/do not tidy or clean the background/i);
  });

  it("appends imperfection preservation for garment wear", () => {
    const input = "Garment wear: wrinkled collar, fabric bunching at waist, uneven hem.";
    const out = normalizeGenerativeImagePrompt(input);
    expect(out).toMatch(/visible imperfections exactly as described/i);
    expect(out).toMatch(/do not press, iron, or restore props/i);
  });

  it("appends imperfection preservation for worn props", () => {
    const input = "ALIGNMENT & WEAR: worn edges on chair arm, stain on counter.";
    const out = normalizeGenerativeImagePrompt(input);
    expect(out).toMatch(/worn edges, stains, and crooked alignment/i);
  });

  it("appends lens and camera preservation for ultra-wide lupa distortion", () => {
    const input =
      'Lens & camera: ultra-wide ≈14mm feel — barrel distortion, facial lupa magnification on nose and cheeks; placement slight-low ~10°, dutch none, camera below chin subject, distance close.';
    const out = normalizeGenerativeImagePrompt(input);
    expect(out).toMatch(/Preserve lens distortion exactly as described/i);
    expect(out).toMatch(/magnifying-glass \/ lupa effect/i);
    expect(out).toMatch(/low \/ slight-low camera angle/i);
  });

  it("skips lens preservation for intentionally level neutral-lens", () => {
    const input =
      "Lens & camera: intentionally level neutral-lens — clean 50mm, zero tilt.";
    const out = normalizeGenerativeImagePrompt(input);
    expect(out).not.toMatch(/lens distortion and off-level camera placement/i);
  });

  it("appends dutch tilt preservation when present", () => {
    const input =
      "Lens & camera: wide ≈24mm — edge stretch; placement slight-high ~8°, dutch slight ~5°.";
    const out = normalizeGenerativeImagePrompt(input);
    expect(out).toMatch(/dutch tilt \/ roll exactly as described/i);
    expect(out).toMatch(/slight-high camera angle/i);
  });

  it("skips ultra-wide lupa suffix for normal lens with slight-low only", () => {
    const input =
      "Lens & camera: normal ≈50mm — distortion none/minimal; placement slight-low ~8°, dutch none, camera chest height subject, distance medium.";
    const out = normalizeGenerativeImagePrompt(input);
    expect(out).not.toMatch(/ultra-wide magnifying-glass/i);
    expect(out).toMatch(/slight-low camera angle/i);
  });

  it("appends perspective imperfection preservation for cafe interior", () => {
    const input =
      'ENVIRONMENT & PROPS: cozy cafe interior. Perspective imperfection: camera offset frame-left ~12%, verticals slight converge frame-right ~4°, horizontals tilt ~3° frame-right-down, composition asymmetric — more space frame-right, foreground chair arm clipped frame-left.';
    const out = normalizeGenerativeImagePrompt(input, { targetAspectRatio: "16:9" });
    expect(out).toMatch(/casual off-center perspective/i);
    expect(out).toMatch(/avoid real-estate or architectural straight-on symmetry/i);
    expect(out).toMatch(/casual snapshot, not a staged property/i);
    expect(out).toMatch(/skewed horizontals/i);
  });

  it("skips perspective suffix for intentionally level neutral-lens", () => {
    const input =
      "intentionally level neutral-lens. Perspective imperfection: camera offset centered.";
    const out = normalizeGenerativeImagePrompt(input);
    expect(out).not.toMatch(/avoid real-estate or architectural straight-on symmetry/i);
  });
});
