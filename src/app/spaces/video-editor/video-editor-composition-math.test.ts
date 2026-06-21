import { describe, expect, it } from "vitest";
import { createDefaultComposition } from "./video-editor-composition-types";
import { resolveCompositionTransform, upsertCompositionKeyframe } from "./video-editor-composition-math";

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
    comp = upsertCompositionKeyframe(comp, 0, {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      opacity: 1,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    });
    comp = upsertCompositionKeyframe(comp, 2, {
      x: 0.5,
      y: 0,
      width: 0.5,
      height: 0.5,
      opacity: 1,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    });
    const mid = resolveCompositionTransform(comp, 1);
    expect(mid.x).toBeGreaterThan(0.1);
    expect(mid.x).toBeLessThan(0.4);
    expect(mid.width).toBeLessThan(1);
  });
});
