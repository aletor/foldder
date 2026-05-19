import { describe, expect, it } from "vitest";

import { computeZoneGeometryHash } from "./domain";
import {
  buildAdvancedImageMaskSvg,
  buildAdvancedImageMaskSvgDataUrl,
  computeStrokesBoundingBox,
  computeZoneOverlapMetrics,
  createZoneFromStrokes,
  deriveMaskHashFromSvg,
  estimateStrokeAreaRatio,
  normalizeAdvancedImageStrokes,
} from "./mask";

const sourceSize = { height: 1000, width: 1000 };

describe("advanced-image-mask", () => {
  it("creates a zone from vector strokes and computes bbox/normalized bbox from strokes", () => {
    const zone = createZoneFromStrokes({
      sourceSize,
      strokes: [
        {
          id: "stroke-1",
          points: [
            { x: 100, y: 200 },
            { x: 300, y: 400 },
          ],
          radius: 20,
        },
      ],
    });

    expect(zone.bbox).toEqual({ height: 240, width: 240, x: 80, y: 180 });
    expect(zone.normalizedBBox).toEqual({ height: 0.24, width: 0.24, x: 0.08, y: 0.18 });
    expect(zone.locationDescription).toContain("region");
    expect(zone.geometryHash).toBe(computeZoneGeometryHash(zone));
    expect(zone.areaRatio).toBeGreaterThan(0);
  });

  it("clamps strokes to source bounds and rejects empty zones", () => {
    const strokes = normalizeAdvancedImageStrokes(
      [
        {
          id: "outside",
          points: [
            { x: -50, y: 50 },
            { x: 1200, y: 1200 },
          ],
          radius: 5,
        },
      ],
      sourceSize,
    );

    expect(strokes[0].points).toEqual([
      { x: 0, y: 50 },
      { x: 1000, y: 1000 },
    ]);
    expect(() => createZoneFromStrokes({ sourceSize, strokes: [] })).toThrow(/requires at least one/);
  });

  it("keeps raster mask metadata derived: changing maskHash does not change geometryHash", () => {
    const base = createZoneFromStrokes({
      maskHash: "mask-a",
      sourceSize,
      strokes: [{ id: "dot", points: [{ x: 500, y: 500 }], radius: 30 }],
    });
    const withDifferentMaskCache = {
      ...base,
      maskHash: "mask-b",
      maskS3Key: "knowledge-files/masks/other.svg",
    };

    expect(computeZoneGeometryHash(withDifferentMaskCache)).toBe(computeZoneGeometryHash(base));
  });

  it("area ratio is deterministic for identical strokes", () => {
    const strokes = [
      {
        id: "stroke",
        points: [
          { x: 100, y: 100 },
          { x: 900, y: 100 },
        ],
        radius: 20,
      },
    ];

    expect(estimateStrokeAreaRatio(strokes, sourceSize, 96)).toBe(estimateStrokeAreaRatio(strokes, sourceSize, 96));
  });

  it("computes overlap metrics from stroke coverage, not from stored mask cache", () => {
    const oldZone = createZoneFromStrokes({
      sourceSize,
      strokes: [{ id: "old", points: [{ x: 500, y: 500 }], radius: 80 }],
    });
    const containingNewZone = createZoneFromStrokes({
      sourceSize,
      strokes: [{ id: "new", points: [{ x: 500, y: 500 }], radius: 160 }],
    });
    const separateZone = createZoneFromStrokes({
      sourceSize,
      strokes: [{ id: "far", points: [{ x: 100, y: 100 }], radius: 40 }],
    });

    const contained = computeZoneOverlapMetrics(containingNewZone, oldZone, 160);
    const separate = computeZoneOverlapMetrics(separateZone, oldZone, 160);

    expect(contained.intersectionOverOld).toBeGreaterThan(0.95);
    expect(contained.containsOldZone).toBe(true);
    expect(separate.intersectionOverOld).toBe(0);
  });

  it("exports an SVG mask and data URL as derived artifacts", () => {
    const zone = createZoneFromStrokes({
      sourceSize,
      strokes: [
        {
          id: "line",
          points: [
            { x: 100, y: 100 },
            { x: 200, y: 200 },
          ],
          radius: 10,
        },
      ],
    });

    const svg = buildAdvancedImageMaskSvg(zone, { height: 500, includeGeometryMetadata: true, width: 500 });
    const dataUrl = buildAdvancedImageMaskSvgDataUrl(zone, { height: 500, width: 500 });

    expect(svg).toContain("<svg");
    expect(svg).toContain("<metadata>");
    expect(svg).toContain("<polyline");
    expect(deriveMaskHashFromSvg(svg)).toMatch(/^h1_/);
    expect(dataUrl).toMatch(/^data:image\/svg\+xml/);
  });

  it("supports closed freehand polygon zones as filled regions", () => {
    const zone = createZoneFromStrokes({
      sourceSize,
      strokes: [
        {
          closed: true,
          id: "lasso",
          points: [
            { x: 200, y: 200 },
            { x: 800, y: 200 },
            { x: 800, y: 800 },
            { x: 200, y: 800 },
          ],
          radius: 1,
        },
      ],
    });

    const svg = buildAdvancedImageMaskSvg(zone);

    expect(zone.bbox.width).toBeGreaterThanOrEqual(600);
    expect(zone.areaRatio).toBeGreaterThan(0.3);
    expect(svg).toContain("<polygon");
  });

  it("returns zero bbox for normalized empty stroke lists", () => {
    expect(computeStrokesBoundingBox([{ id: "", points: [], radius: 0 }], sourceSize)).toEqual({
      height: 0,
      width: 0,
      x: 0,
      y: 0,
    });
  });
});
