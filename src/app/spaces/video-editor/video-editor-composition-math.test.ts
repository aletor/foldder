import { describe, expect, it } from "vitest";
import { createDefaultComposition, DEFAULT_COMPOSITION_TRANSFORM } from "./video-editor-composition-types";
import { resolveCompositionTransform, upsertCompositionKeyframe } from "./video-editor-composition-math";

const FULL_TRANSFORM = DEFAULT_COMPOSITION_TRANSFORM;

describe("video-editor-composition-units", () => {
  it("converts px to norm and back", async () => {
    const { transformToPx, patchTransformFromPx } = await import("./video-editor-composition-units");
    const transform = { ...FULL_TRANSFORM, x: 0.25, y: 0.1, width: 0.5, height: 0.4 };
    const px = transformToPx(transform, 1920, 1080);
    expect(px.x).toBe(480);
    expect(px.width).toBe(960);
    const next = patchTransformFromPx(transform, 1920, 1080, { x: 100, y: 50 });
    expect(next.x).toBeCloseTo(100 / 1920);
    expect(next.y).toBeCloseTo(50 / 1080);
  });
});

describe("video-editor-composition-math", () => {
  it("returns default transform at t=0", () => {
    const comp = createDefaultComposition();
    const t = resolveCompositionTransform(comp, 0);
    expect(t.x).toBe(0);
    expect(t.width).toBe(1);
    expect(t.opacity).toBe(1);
  });

  it("interpolates with easing between keyframes", () => {
    let comp = createDefaultComposition();
    comp = upsertCompositionKeyframe(comp, 0, { ...FULL_TRANSFORM, x: 0, width: 1, height: 1 });
    comp = upsertCompositionKeyframe(comp, 2, { ...FULL_TRANSFORM, x: 0.5, width: 0.5, height: 0.5 });
    const mid = resolveCompositionTransform(comp, 1);
    expect(mid.x).toBeGreaterThan(0.1);
    expect(mid.x).toBeLessThan(0.4);
    expect(mid.width).toBeLessThan(1);
  });

  it("animates only keyed properties independently", async () => {
    const { upsertCompositionPropertiesAtTime } = await import("./video-editor-composition-properties");
    let comp = createDefaultComposition();
    comp = upsertCompositionPropertiesAtTime(comp, 0, { ...FULL_TRANSFORM, opacity: 1 }, ["opacity"]);
    comp = upsertCompositionPropertiesAtTime(comp, 2, { ...FULL_TRANSFORM, opacity: 0.2 }, ["opacity"]);
    comp = upsertCompositionPropertiesAtTime(comp, 0, { ...FULL_TRANSFORM, x: 0.2 }, ["x"]);
    comp = upsertCompositionPropertiesAtTime(comp, 2, { ...FULL_TRANSFORM, x: 0.2 }, ["x"]);
    const mid = resolveCompositionTransform(comp, 1);
    expect(mid.opacity).toBeGreaterThan(0.25);
    expect(mid.opacity).toBeLessThan(0.9);
    expect(mid.x).toBeCloseTo(0.2, 2);
  });
});
