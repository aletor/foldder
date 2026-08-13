/**
 * Tests Fase 6A — viewport width vs preview zoom.
 */
import { describe, expect, it } from "vitest";
import {
  SITE_CREATOR_MOBILE_WIDTH,
  SITE_CREATOR_TABLET_WIDTH,
  buildViewportState,
  clampViewportWidth,
  computeFitPreviewZoom,
  detectViewportPreset,
  pageToScreenScale,
  resolveSiteCreatorLayout,
  viewportWidthDeltaFromCenteredEdgeDrag,
} from "./site-creator-viewport";

describe("site-creator-viewport", () => {
  it("resolves provisional layoutScale without mutating reference size", () => {
    const layout = resolveSiteCreatorLayout({
      referenceWidth: 1920,
      referenceHeight: 1080,
      viewportWidth: 390,
    });
    expect(layout.layoutWidth).toBe(390);
    expect(layout.layoutScale).toBeCloseTo(390 / 1920);
    expect(layout.layoutHeight).toBeCloseTo(1080 * (390 / 1920));
    expect(layout.referenceWidth).toBe(1920);
  });

  it("detects presets and custom widths", () => {
    expect(detectViewportPreset(1920, 1920)).toBe("original");
    expect(detectViewportPreset(SITE_CREATOR_TABLET_WIDTH, 1920)).toBe("tablet");
    expect(detectViewportPreset(SITE_CREATOR_MOBILE_WIDTH, 1920)).toBe("mobile");
    expect(detectViewportPreset(412, 1920)).toBe("custom");
  });

  it("clamps width to allowed range", () => {
    expect(clampViewportWidth(100, 1920)).toBe(280);
    expect(clampViewportWidth(99999, 1920)).toBe(3840);
    expect(clampViewportWidth(5000, 5000)).toBe(5000);
  });

  it("computes fit zoom once as a number, capped at 200%", () => {
    const z = computeFitPreviewZoom({
      layoutWidth: 1920,
      layoutHeight: 1080,
      availableWidth: 960,
      availableHeight: 800,
    });
    expect(z).toBeCloseTo(0.5);
    expect(z).toBeLessThanOrEqual(2);

    const zoomedIn = computeFitPreviewZoom({
      layoutWidth: 200,
      layoutHeight: 100,
      availableWidth: 800,
      availableHeight: 600,
    });
    expect(zoomedIn).toBe(2);
  });

  it("keeps page→screen scale as layoutScale × previewZoom", () => {
    expect(pageToScreenScale(0.5, 2)).toBeCloseTo(1);
    expect(pageToScreenScale(390 / 1920, 1)).toBeCloseTo(390 / 1920);
  });

  it("applies centered edge drag so the side follows the pointer", () => {
    // pointer moves +10 CSS px on the right edge at 100% zoom → width +20
    expect(
      viewportWidthDeltaFromCenteredEdgeDrag({
        deltaClientAlongOutward: 10,
        previewZoom: 1,
      }),
    ).toBe(20);
    expect(
      viewportWidthDeltaFromCenteredEdgeDrag({
        deltaClientAlongOutward: 10,
        previewZoom: 2,
      }),
    ).toBe(10);
  });

  it("buildViewportState rounds and labels preset", () => {
    const state = buildViewportState({
      width: 390.4,
      referenceWidth: 1920,
      previewZoom: 1.25,
    });
    expect(state.width).toBe(390);
    expect(state.preset).toBe("mobile");
    expect(state.previewZoom).toBe(1.25);
  });
});
