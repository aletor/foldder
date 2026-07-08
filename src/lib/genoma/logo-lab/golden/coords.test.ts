import { describe, expect, it } from "vitest";
import { bboxIoU } from "@/lib/genoma/logo-lab/golden/coords";

describe("bboxIoU", () => {
  it("returns 1 for identical boxes", () => {
    const b: [number, number, number, number] = [0.1, 0.2, 0.4, 0.5];
    expect(bboxIoU(b, b)).toBeCloseTo(1);
  });

  it("returns 0 for non-overlapping boxes", () => {
    expect(bboxIoU([0, 0, 0.1, 0.1], [0.5, 0.5, 0.6, 0.6])).toBe(0);
  });

  it("computes partial overlap", () => {
    const iou = bboxIoU([0, 0, 0.5, 0.5], [0.25, 0.25, 0.75, 0.75]);
    expect(iou).toBeGreaterThan(0.1);
    expect(iou).toBeLessThan(1);
  });
});

describe("frame/page bbox identity", () => {
  it("assertFrameMatchesScaledPage passes when dims match", async () => {
    const { assertFrameMatchesScaledPage } = await import("@/lib/genoma/logo-lab/golden/coords");
    expect(() => assertFrameMatchesScaledPage(640, 480, 640, 480)).not.toThrow();
  });

  it("assertFrameMatchesScaledPage throws on mismatch", async () => {
    const { assertFrameMatchesScaledPage } = await import("@/lib/genoma/logo-lab/golden/coords");
    expect(() => assertFrameMatchesScaledPage(640, 480, 640, 481)).toThrow(/frame_page_dim_mismatch/);
  });
});
