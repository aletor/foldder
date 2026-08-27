import { describe, expect, it } from "vitest";
import type { DesignerPageState } from "../designer/DesignerNode";
import type { FreehandObject } from "../FreehandStudio";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import {
  findDisplayObject,
  resolveSiteCreatorResponsiveDisplay,
} from "./site-creator-responsive";
import { patchMediaTune } from "./site-creator-responsive-tunes";
import { createEmptySiteBlueprintV1 } from "./site-creator-types";
import { compilePublishedSite } from "./site-creator-publish-compile";
import { imageFrameTuneForSiteCreator } from "./site-creator-image-frame";

function imageFrame(): FreehandObject {
  return {
    id: "frame",
    type: "rect",
    x: 20,
    y: 30,
    width: 200,
    height: 100,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    isImageFrame: true,
    imageFrameContent: {
      src: "https://cdn.example/frame.jpg",
      originalWidth: 200,
      originalHeight: 200,
      scaleX: 1,
      scaleY: 1,
      offsetX: 0,
      offsetY: -50,
      fittingMode: "fill-proportional",
    },
  } as FreehandObject;
}

describe("Site Creator Designer Image Frame crop", () => {
  it("scales the inner photo with a newly connected frame on Mobile", () => {
    const frame = imageFrame();
    const page: DesignerPageState = {
      id: "fresh-page",
      format: "web169",
      customWidth: 400,
      customHeight: 300,
      objects: [frame],
    };
    const index = buildSiteSelectionIndex(page);
    const mobile = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: createEmptySiteBlueprintV1(),
      referenceIndex: index,
      viewportWidth: 200,
      band: "mobile",
    });
    const display = findDisplayObject(mobile.displayPage, "frame");
    const frameRatio = (display?.width ?? 0) / frame.width;
    expect(frameRatio).toBeGreaterThan(0);
    expect(display?.imageFrameContent?.scaleX).toBeCloseTo(
      (frame.imageFrameContent?.scaleX ?? 0) * frameRatio,
      6,
    );
    expect(display?.imageFrameContent?.scaleY).toBeCloseTo(
      (frame.imageFrameContent?.scaleY ?? 0) * frameRatio,
      6,
    );
    expect(display?.imageFrameContent?.offsetY).toBeCloseTo(
      (frame.imageFrameContent?.offsetY ?? 0) * frameRatio,
      6,
    );
    expect(frame.imageFrameContent?.offsetY).toBe(-50);
  });

  it("derives the initial focal point and zoom from the Designer framing", () => {
    const frame = imageFrame();
    if (!frame.imageFrameContent) return;
    frame.imageFrameContent.scaleX = 2;
    frame.imageFrameContent.scaleY = 2;
    frame.imageFrameContent.offsetX = -100;
    frame.imageFrameContent.offsetY = -150;
    expect(imageFrameTuneForSiteCreator(frame)).toEqual({
      focal: { x: 0.5, y: 0.5 },
      zoom: 2,
    });
  });

  it("stores a different clamped framing in Original and Mobile", () => {
    const frame = imageFrame();
    const page: DesignerPageState = {
      id: "page",
      format: "web169",
      customWidth: 400,
      customHeight: 300,
      objects: [frame],
    };
    const index = buildSiteSelectionIndex(page);
    const wide = patchMediaTune({
      blueprint: createEmptySiteBlueprintV1(),
      layerId: "frame",
      band: "wide",
      patch: { focal: { x: 0, y: 0 }, zoom: 1 },
    }).blueprint;
    const tuned = patchMediaTune({
      blueprint: wide,
      layerId: "frame",
      band: "mobile",
      patch: { focal: { x: 1, y: 1 }, zoom: 2 },
    }).blueprint;
    const originalDisplay = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: tuned,
      referenceIndex: index,
      viewportWidth: 400,
      band: "wide",
    });
    const mobileDisplay = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: tuned,
      referenceIndex: index,
      viewportWidth: 390,
      band: "mobile",
    });
    const originalFrame = findDisplayObject(
      originalDisplay.displayPage,
      "frame",
    );
    const mobileFrame = findDisplayObject(mobileDisplay.displayPage, "frame");
    expect(originalFrame?.imageFrameContent?.offsetY).toBe(0);
    expect(mobileFrame?.imageFrameContent?.scaleX).toBeGreaterThan(
      originalFrame?.imageFrameContent?.scaleX ?? 0,
    );
    expect(mobileFrame?.imageFrameContent?.offsetX).toBeLessThanOrEqual(0);
    expect(mobileFrame?.imageFrameContent?.offsetY).toBeLessThanOrEqual(0);
    expect(frame.imageFrameContent?.offsetY).toBe(-50);
    const published = compilePublishedSite({
      page,
      blueprint: tuned,
      title: "Image frame",
      imageHrefByLayerId: {
        frame: "https://cdn.example/frame.jpg",
      },
    });
    expect(published.html).toContain("s-image-frame");
    expect(published.css).toContain(
      "object-position:100% 100%;transform:scale(2)",
    );
  });
});
