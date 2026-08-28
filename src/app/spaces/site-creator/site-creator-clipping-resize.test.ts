import { describe, expect, it } from "vitest";
import type { ClippingContainerObject } from "@/app/spaces/FreehandStudio";
import { makeLayer } from "./site-creator-responsive-fixtures";
import {
  clipImageMinZoom,
  clipImageMinZoomFromRendered,
  reframeClippingImage,
  resizeSectionCoverClip,
} from "./site-creator-clipping-resize";

function clipFixture(): ClippingContainerObject {
  return {
    ...makeLayer({
      id: "clip",
      type: "rect",
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    }),
    type: "clippingContainer",
    mask: makeLayer({
      id: "mask",
      type: "rect",
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    }) as ClippingContainerObject["mask"],
    content: [
      makeLayer({
        id: "photo",
        type: "image",
        x: -10,
        y: 0,
        width: 120,
        height: 50,
      }),
    ],
  } as ClippingContainerObject;
}

describe("section cover clipping resize", () => {
  it("expands the mask and scales its content uniformly with cover", () => {
    const clip = clipFixture();
    const sourceRatio = clip.content[0]!.width / clip.content[0]!.height;

    resizeSectionCoverClip(clip, { x: 20, y: 30, width: 100, height: 200 });

    expect(clip).toMatchObject({ x: 20, y: 30, width: 100, height: 200 });
    expect(clip.mask).toMatchObject({ x: 0, y: 0, width: 100, height: 200 });
    const photo = clip.content[0]!;
    expect(photo.width / photo.height).toBeCloseTo(sourceRatio, 8);
    expect(photo.width).toBe(480);
    expect(photo.height).toBe(200);
    expect(photo.x + photo.width / 2).toBeCloseTo(50, 8);
    expect(photo.y + photo.height / 2).toBeCloseTo(100, 8);
  });

  it("reframes the inner image without exposing empty mask areas", () => {
    const clip = clipFixture();

    expect(
      reframeClippingImage(clip, "photo", {
        focal: { x: 1, y: 0 },
        zoom: 2,
      }),
    ).toBe(true);

    const photo = clip.content[0]!;
    expect(photo.width / photo.height).toBeCloseTo(120 / 50, 8);
    expect(photo.width).toBe(240);
    expect(photo.height).toBe(100);
    expect(photo.x).toBe(-140);
    expect(photo.y).toBe(0);
    expect(photo.x).toBeLessThanOrEqual(clip.mask.x);
    expect(photo.x + photo.width).toBeGreaterThanOrEqual(
      clip.mask.x + clip.mask.width,
    );
    expect(photo.y).toBeLessThanOrEqual(clip.mask.y);
    expect(photo.y + photo.height).toBeGreaterThanOrEqual(
      clip.mask.y + clip.mask.height,
    );
  });

  it("allows zooming below 100% down to cover without empty mask areas", () => {
    const clip = {
      ...clipFixture(),
      content: [
        makeLayer({
          id: "photo",
          type: "image",
          x: -50,
          y: -25,
          width: 200,
          height: 100,
        }),
      ],
    } as ClippingContainerObject;

    expect(clipImageMinZoom(clip.content[0]!, clip.mask)).toBeCloseTo(0.5, 8);

    expect(
      reframeClippingImage(clip, "photo", {
        focal: { x: 0.5, y: 0.5 },
        zoom: 0.5,
      }),
    ).toBe(true);

    const photo = clip.content[0]!;
    expect(photo.width).toBeCloseTo(100, 8);
    expect(photo.height).toBeCloseTo(50, 8);
    expect(photo.x).toBeLessThanOrEqual(clip.mask.x + 0.01);
    expect(photo.y).toBeLessThanOrEqual(clip.mask.y + 0.01);
    expect(photo.x + photo.width).toBeGreaterThanOrEqual(clip.mask.x + clip.mask.width - 0.01);
    expect(photo.y + photo.height).toBeGreaterThanOrEqual(clip.mask.y + clip.mask.height - 0.01);
  });

  it("clamps zoom-out so the image still covers the mask", () => {
    const clip = {
      ...clipFixture(),
      content: [
        makeLayer({
          id: "photo",
          type: "image",
          x: -50,
          y: -25,
          width: 200,
          height: 100,
        }),
      ],
    } as ClippingContainerObject;

    reframeClippingImage(clip, "photo", { zoom: 0.1 });
    const photo = clip.content[0]!;
    expect(photo.width).toBeCloseTo(100, 8);
    expect(photo.height).toBeCloseTo(50, 8);
    expect(clipImageMinZoomFromRendered({
      image: photo,
      mask: clip.mask,
      currentZoom: 0.5,
    })).toBeCloseTo(0.5, 8);
  });
});
