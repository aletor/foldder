import { describe, expect, it } from "vitest";
import { fillLassoAlphaMask, isValidClosedLasso, pointInPolygon } from "./lasso-to-paint-data";
import { flattenStudioReferenceCells, gridCellsForCard } from "./studio-reference-grid";
import {
  buildStudioGenerateImageSlots,
  canStudioGenerate,
  describeStudioGenerateImageOrder,
  shouldBuildZoneMap,
  shouldRunAnalyzeAreas,
} from "./studio-generate-payload";
import { computePaintSpatialStats, hexToRgb, tintImageDataForColorMap, tintImageDataForMarkedBase } from "./studio-zone-map";
import { clientPointToImagePoint, hitTestLassoCard, lassoAnchorPercent, wheelZoomFactor, zoomTowardPoint } from "./studio-overlay-coords";
import { stripBriefForNode, stripDraftForNode } from "./studio-persist";
import { STUDIO_PAINT_ALPHA_THRESHOLD, createStudioCard, type StudioCard, type StudioGlobal } from "./studio-types";

function squareLasso() {
  const pts = [];
  for (let i = 0; i <= 40; i++) pts.push({ x: 10 + i, y: 10 });
  for (let i = 0; i <= 40; i++) pts.push({ x: 50, y: 10 + i });
  for (let i = 0; i <= 40; i++) pts.push({ x: 50 - i, y: 50 });
  for (let i = 0; i <= 40; i++) pts.push({ x: 10, y: 50 - i });
  return pts;
}

describe("lasso validity and fill", () => {
  it("rejects a tiny scribble and accepts a 30px+ closed path", () => {
    expect(isValidClosedLasso([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }])).toBe(false);
    expect(isValidClosedLasso(squareLasso())).toBe(true);
  });

  it("fills opaque alpha only inside the polygon", () => {
    const mask = fillLassoAlphaMask(80, 80, squareLasso());
    expect(mask[30 * 80 + 30]).toBe(255);
    expect(mask[0]).toBe(0);
    expect(pointInPolygon(30, 30, squareLasso())).toBe(true);
    expect(pointInPolygon(1, 1, squareLasso())).toBe(false);
  });
});

describe("zone map tint contract (identical to current Studio)", () => {
  function buffer(width: number, height: number) {
    return { data: new Uint8ClampedArray(width * height * 4), width, height };
  }

  it("colormap: alpha>30 becomes zone RGB at 255", () => {
    const id = buffer(2, 1);
    id.data[3] = STUDIO_PAINT_ALPHA_THRESHOLD + 1;
    id.data[7] = STUDIO_PAINT_ALPHA_THRESHOLD;
    tintImageDataForColorMap(id, "#1D4ED8");
    expect([id.data[0], id.data[1], id.data[2], id.data[3]]).toEqual([0x1d, 0x4e, 0xd8, 255]);
    expect(id.data[7]).toBe(STUDIO_PAINT_ALPHA_THRESHOLD);
  });

  it("marked-base: alpha>30 becomes zone RGB at min(220, a*3)", () => {
    const id = buffer(1, 1);
    id.data[3] = 80;
    tintImageDataForMarkedBase(id, "#DC2626");
    expect([id.data[0], id.data[1], id.data[2], id.data[3]]).toEqual([0xdc, 0x26, 0x26, 220]);
  });

  it("spatial stats use bbox center and the same quadrant labels", () => {
    const id = buffer(100, 100);
    for (let y = 10; y <= 30; y++) {
      for (let x = 10; x <= 30; x++) {
        id.data[(y * 100 + x) * 4 + 3] = 255;
      }
    }
    const spatial = computePaintSpatialStats(id, 100, 100);
    expect(spatial?.cx).toBe(20);
    expect(spatial?.cy).toBe(20);
    expect(spatial?.quadrant).toBe("tercio superior-izquierdo");
    expect(hexToRgb("#16A34A")).toEqual([0x16, 0xa3, 0x4a]);
  });
});

function card(partial: Partial<StudioCard> & { id: string }): StudioCard {
  return {
    ...createStudioCard(0),
    ...partial,
  };
}

describe("reference grid cells", () => {
  it("emits one cell per photo, labeled 1A/1B on the same card", () => {
    const cards = [
      card({ id: "c1", references: ["a.png", "b.png"] }),
      card({ id: "c2", references: ["c.png"] }),
    ];
    const cells = flattenStudioReferenceCells(cards);
    expect(cells.map((c) => c.cellId)).toEqual(["1A", "1B", "2A"]);
    expect(gridCellsForCard(cells, "c1")).toEqual(["1A", "1B"]);
  });
});

describe("generate image slots", () => {
  const global: StudioGlobal = { promptDraft: "", schemaData: null, text: "" };

  it("keeps today's order: base, zone map, grid — schema last, never in the map slot", () => {
    const slots = buildStudioGenerateImageSlots({
      baseImage: "base.png",
      zoneMapImage: "map.png",
      referenceGridImage: "grid.png",
      schemaImage: "schema.png",
    });
    expect(slots).toEqual(["base.png", "map.png", "grid.png", "schema.png"]);
    const order = describeStudioGenerateImageOrder({
      baseImage: "base.png",
      zoneMapImage: "map.png",
      referenceGridImage: "grid.png",
      schemaImage: "schema.png",
    });
    expect(order.kinds).toEqual(["base", "zoneMap", "referenceGrid", "schema"]);
  });

  it("with zones and no refs: exactly two images, second is the map", () => {
    const slots = buildStudioGenerateImageSlots({
      baseImage: "base.png",
      zoneMapImage: "map.png",
      referenceGridImage: null,
      schemaImage: null,
    });
    expect(slots).toEqual(["base.png", "map.png"]);
  });

  it("empty canvas + refs, no lasso: only the grid, no analyze-areas", () => {
    const cards = [card({ id: "c1", description: "fondo", references: ["a.png"] })];
    expect(shouldBuildZoneMap(cards)).toBe(false);
    expect(shouldRunAnalyzeAreas(cards)).toBe(false);
    expect(
      buildStudioGenerateImageSlots({
        baseImage: null,
        zoneMapImage: null,
        referenceGridImage: "grid.png",
        schemaImage: null,
      }),
    ).toEqual(["grid.png"]);
  });

  it("schema stays last and is never the zone-map slot", () => {
    const slots = buildStudioGenerateImageSlots({
      baseImage: "base.png",
      zoneMapImage: "map.png",
      referenceGridImage: null,
      schemaImage: "schema.png",
    });
    expect(slots).toEqual(["base.png", "map.png", "schema.png"]);
    expect(slots[1]).toBe("map.png");
    expect(slots.at(-1)).toBe("schema.png");
    expect(
      describeStudioGenerateImageOrder({
        baseImage: "base.png",
        zoneMapImage: "map.png",
        referenceGridImage: null,
        schemaImage: "schema.png",
      }).kinds,
    ).toEqual(["base", "zoneMap", "schema"]);
  });

  it("schema-only or text-only cards without paint skip analyze-areas", () => {
    expect(shouldRunAnalyzeAreas([])).toBe(false);
    expect(shouldRunAnalyzeAreas([card({ id: "c1", description: "fondo", references: ["a.png"] })])).toBe(false);
    expect(canStudioGenerate([], { promptDraft: "", text: "", schemaData: "schema.png" })).toBe(true);
    expect(shouldRunAnalyzeAreas([card({ id: "c1", paintData: "p.png", description: "" })])).toBe(false);
    expect(shouldRunAnalyzeAreas([card({ id: "c1", paintData: "p.png", description: "cambia esto" })])).toBe(true);
  });

  it("deleted cards are simply absent from the payload inputs", () => {
    const remaining = [card({ id: "keep", description: "x", paintData: "p.png" })];
    expect(shouldBuildZoneMap(remaining)).toBe(true);
    expect(canStudioGenerate(remaining, global)).toBe(true);
    expect(canStudioGenerate([], global)).toBe(false);
  });
});

describe("studio overlay coords", () => {
  it("maps a pointer through a zoomed overlay box onto image pixels", () => {
    const pt = clientPointToImagePoint(
      150,
      120,
      { left: 100, top: 100, width: 200, height: 100 },
      { width: 1000, height: 500 },
    );
    expect(pt).toEqual({ x: 250, y: 100 });
  });

  it("anchors the lasso popover to the top-right of the polygon", () => {
    const anchor = lassoAnchorPercent(
      [
        { x: 10, y: 40 },
        { x: 90, y: 40 },
        { x: 90, y: 80 },
      ],
      { width: 100, height: 100 },
    );
    expect(anchor?.left).toBe(90);
    expect(anchor?.top).toBe(40);
  });

  it("zooms toward the cursor so that point stays put", () => {
    const next = zoomTowardPoint({ pan: { x: 0, y: 0 }, zoom: 1 }, { x: 100, y: 200 }, 2);
    expect(next.zoom).toBe(2);
    expect(next.pan).toEqual({ x: -100, y: -200 });
  });

  it("hit-tests the topmost lasso that contains the point", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ];
    expect(
      hitTestLassoCard(
        [
          { id: "a", lassoPoints: square },
          { id: "b", lassoPoints: square },
        ],
        { x: 10, y: 10 },
      ),
    ).toBe("b");
    expect(hitTestLassoCard([{ id: "a", lassoPoints: square }], { x: 80, y: 80 })).toBeNull();
  });

  it("slows wheel zoom with a small exponential factor", () => {
    expect(wheelZoomFactor(100)).toBeGreaterThan(0.85);
    expect(wheelZoomFactor(100)).toBeLessThan(0.95);
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1.05);
  });
});

describe("studio persist stripping", () => {
  it("drops data URLs from node drafts and keeps lasso points", () => {
    const stripped = stripDraftForNode({
      cards: [
        card({
          id: "c1",
          description: "cambia el vaso",
          lassoPoints: [{ x: 1, y: 2 }],
          paintData: "data:image/png;base64,aaaa",
          references: ["data:image/png;base64,bbbb", "https://cdn.example/ref.jpg"],
        }),
      ],
      global: { promptDraft: "escena", text: "luz más baja", schemaData: "data:image/png;base64,cccc" },
    });
    expect(stripped.cards[0]?.paintData).toBeNull();
    expect(stripped.cards[0]?.lassoPoints).toEqual([{ x: 1, y: 2 }]);
    expect(stripped.cards[0]?.references).toEqual(["https://cdn.example/ref.jpg"]);
    expect(stripped.global.schemaData).toBeNull();
    expect(stripped.global.text).toBe("luz más baja");
    expect(stripped.global.promptDraft).toBe("escena");
  });

  it("keeps output urls on briefs and strips nested paint", () => {
    const stripped = stripBriefForNode({
      outputUrl: "https://cdn.example/out.jpg",
      baseUrl: "data:image/png;base64,base",
      cards: [card({ id: "c1", paintData: "data:image/png;base64,p", description: "x" })],
      global: { promptDraft: "", text: "", schemaData: null },
    });
    expect(stripped.outputUrl).toBe("https://cdn.example/out.jpg");
    expect(stripped.baseUrl).toBeNull();
    expect(stripped.cards[0]?.paintData).toBeNull();
  });
});
