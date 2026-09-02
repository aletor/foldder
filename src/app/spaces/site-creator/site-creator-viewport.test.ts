/**
 * Tests Fase 6A — viewport width vs preview zoom.
 */
import { describe, expect, it } from "vitest";
import {
  SITE_CREATOR_MOBILE_WIDTH,
  SITE_CREATOR_TABLET_MAX_WIDTH,
  SITE_CREATOR_TABLET_WIDTH,
  SITE_CREATOR_PREVIEW_ZOOM_MAX,
  SITE_CREATOR_PREVIEW_ZOOM_MIN,
  buildViewportState,
  clampPreviewZoom,
  clampViewportWidth,
  computeFillWidthPreviewZoom,
  computeFitPreviewZoom,
  computeCanvasFocusCamera,
  isRapidSecondClick,
  measureSiteCreatorPreviewAvailableSize,
  defaultDeviceConfig,
  detectViewportPreset,
  pageToScreenScale,
  resolveDeviceDimensions,
  resolveSiteCreatorLayout,
  cycleViewportBand,
  reserveDeviceFrameFitSize,
  siteCreatorTabletMediaMaxWidth,
  viewportWidthDeltaFromCenteredEdgeDrag,
  applyWorkAreaWheelDelta,
  forwardWorkAreaWheelToScroller,
  shouldRedirectCanvasWheelToWorkArea,
  resolveSiteCreatorDeviceChromeKind,
  siteCreatorDeviceChrome,
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

  it("keeps tablet media below typical desktop widths", () => {
    expect(siteCreatorTabletMediaMaxWidth(1920)).toBe(SITE_CREATOR_TABLET_MAX_WIDTH);
    expect(siteCreatorTabletMediaMaxWidth(800)).toBe(799);
    expect(siteCreatorTabletMediaMaxWidth(768)).toBe(768);
  });

  it("cycles original, monitor, tablet and mobile", () => {
    expect(cycleViewportBand("original", 1)).toBe("monitor");
    expect(cycleViewportBand("monitor", 1)).toBe("tablet");
    expect(cycleViewportBand("tablet", 1)).toBe("mobile");
    expect(cycleViewportBand("mobile", 1)).toBe("original");
    expect(cycleViewportBand("original", -1)).toBe("mobile");
    expect(cycleViewportBand("mobile", -1)).toBe("tablet");
    expect(cycleViewportBand("tablet", -1)).toBe("monitor");
    expect(cycleViewportBand("monitor", -1)).toBe("original");
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

  it("reserves rail and bezel so the device frame can fit in height", () => {
    expect(
      reserveDeviceFrameFitSize({
        availableWidth: 1000,
        availableHeight: 800,
        bezelPx: 12,
        railGutterPx: 52,
      }),
    ).toEqual({ width: 976, height: 708 });
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

  it("fills preview width without fitting height", () => {
    expect(
      computeFillWidthPreviewZoom({
        layoutWidth: 1920,
        availableWidth: 1920,
      }),
    ).toBe(1);
    expect(
      computeFillWidthPreviewZoom({
        layoutWidth: 1920,
        availableWidth: 960,
      }),
    ).toBeCloseTo(0.5);
    expect(
      computeFillWidthPreviewZoom({
        layoutWidth: 1920,
        availableWidth: 2560,
      }),
    ).toBeCloseTo(2560 / 1920);
    expect(
      computeFillWidthPreviewZoom({
        layoutWidth: 1500,
        availableWidth: 1800,
        maxCssWidth: 1500,
      }),
    ).toBe(1);
    expect(
      computeFillWidthPreviewZoom({
        layoutWidth: 1500,
        availableWidth: 1200,
        maxCssWidth: 1500,
      }),
    ).toBeCloseTo(0.8);
  });

  it("measures full client size in page preview and padded size in edit", () => {
    expect(
      measureSiteCreatorPreviewAvailableSize({
        clientWidth: 800,
        clientHeight: 600,
        fillViewport: true,
      }),
    ).toEqual({ width: 800, height: 600 });
    expect(
      measureSiteCreatorPreviewAvailableSize({
        clientWidth: 800,
        clientHeight: 600,
        fillViewport: false,
      }),
    ).toEqual({ width: 752, height: 552 });
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

  it("clamps manual preview zoom", () => {
    expect(clampPreviewZoom(0.01)).toBe(SITE_CREATOR_PREVIEW_ZOOM_MIN);
    expect(clampPreviewZoom(99)).toBe(SITE_CREATOR_PREVIEW_ZOOM_MAX);
    expect(clampPreviewZoom(1.25)).toBe(1.25);
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

  it("resolves device dimensions with orientation swap", () => {
    const portrait = resolveDeviceDimensions({
      band: "mobile",
      config: defaultDeviceConfig("mobile"),
      referenceWidth: 1920,
    });
    expect(portrait.width).toBe(390);
    expect(portrait.height).toBe(844);
    expect(portrait.sizeLabel).toBe("Estándar");

    const landscape = resolveDeviceDimensions({
      band: "mobile",
      config: { ...defaultDeviceConfig("mobile"), orientation: "landscape" },
      referenceWidth: 1920,
    });
    expect(landscape.width).toBe(844);
    expect(landscape.height).toBe(390);
  });

  it("defaults monitor standard to 1920 × 1080 landscape", () => {
    const dims = resolveDeviceDimensions({
      band: "monitor",
      config: defaultDeviceConfig("monitor"),
      referenceWidth: 1920,
    });
    expect(dims.width).toBe(1920);
    expect(dims.height).toBe(1080);
    expect(defaultDeviceConfig("monitor").orientation).toBe("landscape");
  });

  it("swaps monitor standard to 1080 × 1920 in portrait", () => {
    const dims = resolveDeviceDimensions({
      band: "monitor",
      config: { ...defaultDeviceConfig("monitor"), orientation: "portrait" },
      referenceWidth: 1920,
    });
    expect(dims.width).toBe(1080);
    expect(dims.height).toBe(1920);
  });

  it("defaults tablet standard to 820 × 1180", () => {
    const dims = resolveDeviceDimensions({
      band: "tablet",
      config: defaultDeviceConfig("tablet"),
      referenceWidth: 1920,
    });
    expect(dims.width).toBe(820);
    expect(dims.height).toBe(1180);
  });

  it("swaps tablet standard to 1180 × 820 in landscape", () => {
    const dims = resolveDeviceDimensions({
      band: "tablet",
      config: { ...defaultDeviceConfig("tablet"), orientation: "landscape" },
      referenceWidth: 1920,
    });
    expect(dims.width).toBe(1180);
    expect(dims.height).toBe(820);
  });

  it("redirects canvas wheel to the work scroller except when it already started there", () => {
    const inner = document.createElement("div");
    const child = document.createElement("span");
    inner.appendChild(child);
    expect(
      shouldRedirectCanvasWheelToWorkArea({
        readOnly: false,
        ctrlOrMeta: false,
        innerScroller: inner,
        eventTarget: document.createElement("div"),
      }),
    ).toBe(true);
    expect(
      shouldRedirectCanvasWheelToWorkArea({
        readOnly: false,
        ctrlOrMeta: false,
        innerScroller: inner,
        eventTarget: child,
      }),
    ).toBe(false);
    expect(
      shouldRedirectCanvasWheelToWorkArea({
        readOnly: true,
        ctrlOrMeta: false,
        innerScroller: inner,
        eventTarget: document.createElement("div"),
      }),
    ).toBe(false);
    expect(
      shouldRedirectCanvasWheelToWorkArea({
        readOnly: false,
        ctrlOrMeta: true,
        innerScroller: inner,
        eventTarget: document.createElement("div"),
      }),
    ).toBe(false);
    expect(
      shouldRedirectCanvasWheelToWorkArea({
        readOnly: false,
        ctrlOrMeta: false,
        innerScroller: null,
        eventTarget: document.createElement("div"),
      }),
    ).toBe(false);

    applyWorkAreaWheelDelta(inner, { deltaX: 4, deltaY: 80 });
    expect(inner.scrollTop).toBe(80);
    expect(inner.scrollLeft).toBe(4);
  });

  it("forwards work-area wheel unless the inner scroller prevents it", () => {
    const inner = document.createElement("div");
    forwardWorkAreaWheelToScroller(inner, { deltaX: 0, deltaY: 40 });
    expect(inner.scrollTop).toBe(40);
    inner.addEventListener("wheel", (event) => event.preventDefault(), { capture: true });
    forwardWorkAreaWheelToScroller(inner, { deltaX: 0, deltaY: 25 });
    expect(inner.scrollTop).toBe(40);
  });

  it("resolves a thicker rounded bezel for mobile than tablet", () => {
    expect(resolveSiteCreatorDeviceChromeKind({ width: 390, height: 844 })).toBe("mobile");
    expect(resolveSiteCreatorDeviceChromeKind({ width: 820, height: 1180 })).toBe("tablet");
    expect(resolveSiteCreatorDeviceChromeKind({ width: 1180, height: 820, kind: "tablet" })).toBe(
      "tablet",
    );
    expect(siteCreatorDeviceChrome("mobile")).toEqual({
      kind: "mobile",
      bezelPx: 10,
      radiusPx: 22,
      innerRadiusPx: 12,
      color: "#3a414c",
      rim: "0 0 0 1px rgba(255,255,255,0.22)",
    });
    expect(siteCreatorDeviceChrome("tablet")).toEqual({
      kind: "tablet",
      bezelPx: 8,
      radiusPx: 14,
      innerRadiusPx: 6,
      color: "#3a414c",
      rim: "0 0 0 1px rgba(255,255,255,0.22)",
    });
    expect(resolveSiteCreatorDeviceChromeKind({ width: 1920, height: 1080, kind: "monitor" })).toBe(
      "monitor",
    );
    expect(siteCreatorDeviceChrome("monitor")).toEqual({
      kind: "monitor",
      bezelPx: 12,
      radiusPx: 8,
      innerRadiusPx: 2,
      color: "#3a414c",
      rim: "0 0 0 1px rgba(255,255,255,0.22)",
    });
  });
});

describe("canvas object focus camera", () => {
  it("scales a small object to fill the available view", () => {
    const camera = computeCanvasFocusCamera({
      pageRect: { x: 100, y: 200, width: 200, height: 100 },
      pageWidth: 1000,
      pageHeight: 1000,
      contentDisplayWidth: 1000,
      contentDisplayHeight: 1000,
      contentOffsetX: 0,
      contentOffsetY: 0,
      wrapperWidth: 1000,
      wrapperHeight: 1000,
      availableWidth: 800,
      availableHeight: 600,
      paddingPx: 0,
    });
    expect(camera.scale).toBe(4);
    expect(camera.transform).toContain("scale(4)");
    expect(camera.transform).toContain("translate(-200px, -250px)");
  });

  it("does not zoom out when the object already fills the view", () => {
    const camera = computeCanvasFocusCamera({
      pageRect: { x: 0, y: 0, width: 1000, height: 1000 },
      pageWidth: 1000,
      pageHeight: 1000,
      contentDisplayWidth: 400,
      contentDisplayHeight: 400,
      contentOffsetX: 0,
      contentOffsetY: 0,
      wrapperWidth: 400,
      wrapperHeight: 400,
      availableWidth: 400,
      availableHeight: 400,
      paddingPx: 0,
    });
    expect(camera.scale).toBe(1);
  });

  it("treats a delayed second click as independent, not a double click", () => {
    expect(isRapidSecondClick(0, 180)).toBe(true);
    expect(isRapidSecondClick(0, 501)).toBe(false);
    expect(isRapidSecondClick(null, 20)).toBe(false);
  });
});
