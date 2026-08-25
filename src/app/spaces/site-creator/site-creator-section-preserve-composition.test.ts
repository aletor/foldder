import { describe, expect, it } from "vitest";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { applyNewSectionResponsiveDefaults } from "./site-creator-section-defaults";
import { createSectionFromSelection } from "./site-blueprint-ops";
import { resolveSiteCreatorResponsiveDisplay } from "./site-creator-responsive";
import { createEmptySiteBlueprintV1 } from "./site-creator-types";

function layer(partial: Partial<FreehandObject> & { id: string; type: FreehandObject["type"] }): FreehandObject {
  return {
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    opacity: 1,
    ...partial,
  } as FreehandObject;
}

function findObject(page: DesignerPageState, id: string): FreehandObject | null {
  const stack = [...(page.objects ?? [])];
  while (stack.length) {
    const obj = stack.pop()!;
    if (obj.id === id) return obj;
    if (obj.type === "groupContainer" || obj.type === "booleanGroup") {
      stack.push(...((obj as { children?: FreehandObject[] }).children ?? []));
    }
  }
  return null;
}

function relativeOffsets(ids: string[], index: ReturnType<typeof buildSiteSelectionIndex>) {
  const first = index.byId[ids[0]!]!.visualBounds;
  return ids.map((id) => {
    const b = index.byId[id]!.visualBounds;
    return { id, dx: b.x - first.x, dy: b.y - first.y };
  });
}

function pageScale(viewportWidth: number, pageWidth = 1920) {
  return Math.min(1, viewportWidth / Math.max(1, pageWidth));
}

describe("section preserve composition", () => {
  it("preserves relative offsets between multiple loose rects on tablet", () => {
    const committedPage: DesignerPageState = {
      id: "pg",
      format: "web169",
      customWidth: 1920,
      customHeight: 1080,
      objects: [
        layer({ id: "a", type: "rect", x: 200, y: 100, width: 120, height: 40 }),
        layer({ id: "b", type: "rect", x: 240, y: 220, width: 80, height: 50 }),
        layer({ id: "c", type: "rect", x: 180, y: 360, width: 160, height: 30 }),
      ],
    };
    const index = buildSiteSelectionIndex(committedPage);
    const sourceOffsets = relativeOffsets(["a", "b", "c"], index);

    const created = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["a", "b", "c"],
      index,
      committedPage,
      sectionType: "generic",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const blueprint = applyNewSectionResponsiveDefaults(created.blueprint, created.createdNodeId!);
    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committedPage,
      blueprint,
      referenceIndex: index,
      viewportWidth: 768,
    });

    expect(resolved.band).toBe("tablet");
    const scale = pageScale(768);
    const firstObj = findObject(resolved.displayPage, "a")!;
    expect(firstObj.x).toBeCloseTo(200 * scale, 1);
    for (const { id, dx, dy } of sourceOffsets) {
      const obj = findObject(resolved.displayPage, id)!;
      const actualDx = obj.x - firstObj.x;
      const actualDy = obj.y - firstObj.y;
      expect(actualDx, `${id} dx`).toBeCloseTo(dx * scale, 1);
      expect(actualDy, `${id} dy`).toBeCloseTo(dy * scale, 1);
    }
  });

  it("preserves relative offsets when content is scaled down on mobile", () => {
    const committedPage: DesignerPageState = {
      id: "pg",
      format: "web169",
      customWidth: 1920,
      customHeight: 1080,
      objects: [
        layer({ id: "a", type: "rect", x: 200, y: 100, width: 400, height: 40 }),
        layer({ id: "b", type: "rect", x: 260, y: 220, width: 300, height: 50 }),
        layer({ id: "c", type: "rect", x: 220, y: 380, width: 360, height: 30 }),
      ],
    };
    const index = buildSiteSelectionIndex(committedPage);
    const sourceOffsets = relativeOffsets(["a", "b", "c"], index);
    const created = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["a", "b", "c"],
      index,
      committedPage,
      sectionType: "generic",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const blueprint = applyNewSectionResponsiveDefaults(created.blueprint, created.createdNodeId!);
    const viewportWidth = 390;
    const scale = pageScale(viewportWidth);
    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committedPage,
      blueprint,
      referenceIndex: index,
      viewportWidth,
    });

    expect(resolved.band).toBe("mobile");
    const firstObj = findObject(resolved.displayPage, "a")!;
    for (const { id, dx, dy } of sourceOffsets) {
      const src = index.byId[id]!.visualBounds;
      const obj = findObject(resolved.displayPage, id)!;
      expect(obj.x - firstObj.x, `${id} dx`).toBeCloseTo(dx * scale, 1);
      expect(obj.y - firstObj.y, `${id} dy`).toBeCloseTo(dy * scale, 1);
      expect(obj.width, `${id} width`).toBeCloseTo(src.width * scale, 1);
      expect(obj.height, `${id} height`).toBeCloseTo(src.height * scale, 1);
    }
  });

  it("preserves relative offsets between foreground rects when a background is detected", () => {
    const committedPage: DesignerPageState = {
      id: "pg",
      format: "web169",
      customWidth: 1920,
      customHeight: 1080,
      objects: [
        layer({ id: "bg", type: "rect", x: 0, y: 0, width: 1920, height: 900 }),
        layer({ id: "a", type: "rect", x: 120, y: 720, width: 400, height: 60 }),
        layer({ id: "b", type: "rect", x: 120, y: 820, width: 220, height: 56 }),
        layer({ id: "c", type: "rect", x: 120, y: 860, width: 300, height: 40 }),
      ],
    };
    const index = buildSiteSelectionIndex(committedPage);
    const sourceOffsets = relativeOffsets(["a", "b", "c"], index);

    const created = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "a", "b", "c"],
      index,
      committedPage,
      sectionType: "generic",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const blueprint = applyNewSectionResponsiveDefaults(created.blueprint, created.createdNodeId!);
    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committedPage,
      blueprint,
      referenceIndex: index,
      viewportWidth: 768,
    });

    const firstObj = findObject(resolved.displayPage, "a")!;
    const scale = pageScale(768);
    expect(firstObj.x).toBeCloseTo(120 * scale, 1);
    expect(firstObj.x).toBeGreaterThan(8);
    for (const { id, dx, dy } of sourceOffsets) {
      const obj = findObject(resolved.displayPage, id)!;
      expect(obj.x - firstObj.x, `${id} dx`).toBeCloseTo(dx * scale, 1);
      expect(obj.y - firstObj.y, `${id} dy`).toBeCloseTo(dy * scale, 1);
    }
  });

  it("preserves relative offsets inside a designer groupContainer", () => {
    const committedPage: DesignerPageState = {
      id: "pg",
      format: "web169",
      customWidth: 1920,
      customHeight: 1080,
      objects: [
        {
          id: "grp",
          type: "groupContainer",
          x: 110,
          y: 220,
          width: 170,
          height: 270,
          opacity: 1,
          children: [
            layer({ id: "a", type: "rect", x: 110, y: 220, width: 120, height: 40 }),
            layer({ id: "b", type: "rect", x: 140, y: 320, width: 80, height: 50 }),
            layer({ id: "c", type: "rect", x: 120, y: 460, width: 160, height: 30 }),
          ],
        } as FreehandObject,
      ],
    };
    const index = buildSiteSelectionIndex(committedPage);
    const sourceOffsets = relativeOffsets(["a", "b", "c"], index);

    const created = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["grp"],
      index,
      committedPage,
      sectionType: "generic",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const blueprint = applyNewSectionResponsiveDefaults(created.blueprint, created.createdNodeId!);
    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committedPage,
      blueprint,
      referenceIndex: index,
      viewportWidth: 390,
    });

    const firstObj = findObject(resolved.displayPage, "a")!;
    const scale = pageScale(390);
    expect(firstObj.x).toBeCloseTo(110 * scale, 1);
    for (const { id, dx, dy } of sourceOffsets) {
      const obj = findObject(resolved.displayPage, id)!;
      expect(obj.x - firstObj.x, `${id} dx`).toBeCloseTo(dx * scale, 1);
      expect(obj.y - firstObj.y, `${id} dy`).toBeCloseTo(dy * scale, 1);
    }
  });

  it("preserves relative offsets when selecting grouped children without the container", () => {
    const committedPage: DesignerPageState = {
      id: "pg",
      format: "web169",
      customWidth: 1920,
      customHeight: 1080,
      objects: [
        {
          id: "grp",
          type: "groupContainer",
          x: 110,
          y: 220,
          width: 170,
          height: 270,
          opacity: 1,
          children: [
            layer({ id: "a", type: "rect", x: 110, y: 220, width: 120, height: 40 }),
            layer({ id: "b", type: "rect", x: 140, y: 320, width: 80, height: 50 }),
            layer({ id: "c", type: "rect", x: 120, y: 460, width: 160, height: 30 }),
          ],
        } as FreehandObject,
      ],
    };
    const index = buildSiteSelectionIndex(committedPage);
    const sourceOffsets = relativeOffsets(["a", "b", "c"], index);

    const created = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["a", "b", "c"],
      index,
      committedPage,
      sectionType: "generic",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const blueprint = applyNewSectionResponsiveDefaults(created.blueprint, created.createdNodeId!);
    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committedPage,
      blueprint,
      referenceIndex: index,
      viewportWidth: 768,
    });

    const firstObj = findObject(resolved.displayPage, "a")!;
    const scale = pageScale(768);
    expect(firstObj.x).toBeCloseTo(110 * scale, 1);
    for (const { id, dx, dy } of sourceOffsets) {
      const obj = findObject(resolved.displayPage, id)!;
      expect(obj.x - firstObj.x, `${id} dx`).toBeCloseTo(dx * scale, 1);
      expect(obj.y - firstObj.y, `${id} dy`).toBeCloseTo(dy * scale, 1);
    }
  });

  it("keeps two full-bleed side-by-side groups in a row and spanning tablet width", () => {
    const committedPage: DesignerPageState = {
      id: "pg",
      format: "web169",
      customWidth: 1920,
      customHeight: 1080,
      objects: [
        {
          id: "left",
          type: "groupContainer",
          x: 0,
          y: 400,
          width: 960,
          height: 200,
          opacity: 1,
          children: [
            layer({ id: "left-bg", type: "rect", x: 0, y: 400, width: 960, height: 200 }),
            layer({ id: "left-label", type: "rect", x: 380, y: 470, width: 200, height: 40 }),
          ],
        } as FreehandObject,
        {
          id: "right",
          type: "groupContainer",
          x: 960,
          y: 400,
          width: 960,
          height: 200,
          opacity: 1,
          children: [
            layer({ id: "right-bg", type: "rect", x: 960, y: 400, width: 960, height: 200 }),
            layer({ id: "right-label", type: "rect", x: 1340, y: 450, width: 200, height: 80 }),
          ],
        } as FreehandObject,
      ],
    };
    const index = buildSiteSelectionIndex(committedPage);
    const created = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["left", "right"],
      index,
      committedPage,
      sectionType: "generic",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const blueprint = applyNewSectionResponsiveDefaults(created.blueprint, created.createdNodeId!);
    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committedPage,
      blueprint,
      referenceIndex: index,
      viewportWidth: 768,
    });

    expect(resolved.band).toBe("tablet");
    const leftBg = findObject(resolved.displayPage, "left-bg")!;
    const rightBg = findObject(resolved.displayPage, "right-bg")!;
    const scale = 768 / 1920;
    expect(leftBg.x).toBeCloseTo(0, 1);
    expect(rightBg.x).toBeCloseTo(960 * scale, 1);
    expect(rightBg.y).toBeCloseTo(leftBg.y, 1);
    expect(leftBg.width).toBeCloseTo(960 * scale, 1);
    expect(rightBg.width).toBeCloseTo(960 * scale, 1);
    expect(rightBg.x + rightBg.width).toBeCloseTo(768, 1);
  });
});
