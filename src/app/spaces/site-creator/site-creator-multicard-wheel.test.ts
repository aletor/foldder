import { describe, expect, it } from "vitest";
import type { MultiCardContainerLayout } from "./site-creator-multicard-layout";
import {
  multiCardWheelDecision,
  resolveMultiCardWheelTarget,
} from "./site-creator-multicard-wheel";

describe("multiCardWheelDecision", () => {
  it("takes a scrollV wheel while remaining cards exist", () => {
    expect(
      multiCardWheelDecision({
        axis: "v",
        overflow: true,
        scrollIndex: 0,
        count: 3,
        gesture: { deltaX: 0, deltaY: 80, shiftKey: false },
      }),
    ).toEqual({ action: "take", nextIndex: 1 });
  });

  it("passes a scrollV wheel at the last card so the section can consume it", () => {
    expect(
      multiCardWheelDecision({
        axis: "v",
        overflow: true,
        scrollIndex: 2,
        count: 3,
        gesture: { deltaX: 0, deltaY: 80, shiftKey: false },
      }),
    ).toEqual({ action: "pass" });
  });

  it("passes a plain vertical wheel on scrollH", () => {
    expect(
      multiCardWheelDecision({
        axis: "h",
        overflow: true,
        scrollIndex: 0,
        count: 3,
        gesture: { deltaX: 0, deltaY: 80, shiftKey: false },
      }),
    ).toEqual({ action: "pass" });
  });

  it("takes Shift+vertical on scrollH", () => {
    expect(
      multiCardWheelDecision({
        axis: "h",
        overflow: true,
        scrollIndex: 0,
        count: 3,
        gesture: { deltaX: 0, deltaY: 80, shiftKey: true },
      }),
    ).toEqual({ action: "take", nextIndex: 1 });
  });

  it("stops horizontal scroll when the last visible page is reached", () => {
    expect(
      multiCardWheelDecision({
        axis: "h",
        overflow: true,
        scrollIndex: 4,
        count: 7,
        visibleCount: 3,
        gesture: { deltaX: 80, deltaY: 0, shiftKey: false },
      }),
    ).toEqual({ action: "pass" });
  });
});

describe("resolveMultiCardWheelTarget", () => {
  const container = (partial: Partial<MultiCardContainerLayout>): MultiCardContainerLayout => ({
    nodeId: "scmc_1",
    layoutMode: "scrollV",
    layoutRect: { x: 0, y: 0, width: 400, height: 300 },
    clipRect: { x: 40, y: 80, width: 240, height: 160 },
    cardRects: [],
    gap: 24,
    scale: 1,
    count: 3,
    nav: { visibility: "auto", style: "arrows" },
    axis: "v",
    step: 160,
    overflow: true,
    scrollIndex: 0,
    visibleCount: 1,
    ...partial,
  });

  it("takes when the pointer is over a MultiCard with remaining travel", () => {
    expect(
      resolveMultiCardWheelTarget(
        [container({})],
        { x: 80, y: 120 },
        { deltaX: 0, deltaY: 80, shiftKey: false },
      ),
    ).toEqual({ nodeId: "scmc_1", nextIndex: 1 });
  });

  it("does not take when the pointer is outside the clip", () => {
    expect(
      resolveMultiCardWheelTarget(
        [container({})],
        { x: 8, y: 8 },
        { deltaX: 0, deltaY: 80, shiftKey: false },
      ),
    ).toBeNull();
  });
});
