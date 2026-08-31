import { describe, expect, it } from "vitest";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { applyNewSectionResponsiveDefaults } from "./site-creator-section-defaults";
import {
  createSectionFromSelection,
  setSectionHeightMode,
  stretchSectionSourceRangeBottom,
} from "./site-blueprint-ops";
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

  it("keeps a headline above a full-bleed photo on monitor, tablet and mobile", () => {
    const committedPage: DesignerPageState = {
      id: "pg",
      format: "web169",
      customWidth: 1920,
      customHeight: 1080,
      objects: [
        layer({ id: "title", type: "rect", x: 560, y: 24, width: 800, height: 64, fill: "#111111" }),
        layer({ id: "photo", type: "rect", x: 0, y: 110, width: 1920, height: 520, fill: "#888888" }),
      ],
    };
    const index = buildSiteSelectionIndex(committedPage);
    const created = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["title", "photo"],
      index,
      committedPage,
      sectionType: "hero",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const blueprint = applyNewSectionResponsiveDefaults(created.blueprint, created.createdNodeId!);
    const cases: Array<{ viewportWidth: number; band: "monitor" | "tablet" | "mobile" }> = [
      { viewportWidth: 1920, band: "monitor" },
      { viewportWidth: 768, band: "tablet" },
      { viewportWidth: 390, band: "mobile" },
    ];
    for (const { viewportWidth, band } of cases) {
      const resolved = resolveSiteCreatorResponsiveDisplay({
        page: committedPage,
        blueprint,
        referenceIndex: index,
        viewportWidth,
        band,
      });
      expect(resolved.band, band).toBe(band);
      const title = findObject(resolved.displayPage, "title")!;
      const photo = findObject(resolved.displayPage, "photo")!;
      expect(title.opacity ?? 1, `${band} title opacity`).toBeGreaterThan(0);
      expect(title.y + title.height, `${band} title above photo`).toBeLessThanOrEqual(photo.y + 2);
      expect(title.height, `${band} title size`).toBeGreaterThan(8);
    }
  });

  it("keeps a headline that sits in the section frame but was not a selected child", () => {
    const committedPage: DesignerPageState = {
      id: "pg",
      format: "web169",
      customWidth: 1920,
      customHeight: 1080,
      objects: [
        layer({ id: "title", type: "rect", x: 560, y: 24, width: 800, height: 64, fill: "#111111" }),
        layer({ id: "photo", type: "rect", x: 0, y: 110, width: 1920, height: 520, fill: "#888888" }),
      ],
    };
    const index = buildSiteSelectionIndex(committedPage);
    const created = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["photo"],
      index,
      committedPage,
      sectionType: "hero",
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.createdNodeId) return;
    const section = created.blueprint.nodes[created.createdNodeId];
    expect(section && "sourceRange" in section).toBe(true);
    if (!section || !("sourceRange" in section)) return;
    const withRange = {
      ...created.blueprint,
      nodes: {
        ...created.blueprint.nodes,
        [created.createdNodeId]: {
          ...section,
          sourceRange: { top: 0, bottom: section.sourceRange.bottom },
        },
      },
    };
    const blueprint = applyNewSectionResponsiveDefaults(withRange, created.createdNodeId);
    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committedPage,
      blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "monitor",
    });
    const title = findObject(resolved.displayPage, "title")!;
    const photo = findObject(resolved.displayPage, "photo")!;
    expect(title.opacity ?? 1).toBeGreaterThan(0);
    expect(title.y + title.height).toBeLessThanOrEqual(photo.y + 2);
  });

  it("keeps the designed top page offset on monitor, tablet and mobile", () => {
    const committedPage: DesignerPageState = {
      id: "pg",
      format: "web169",
      customWidth: 1920,
      customHeight: 1080,
      objects: [
        layer({ id: "a", type: "rect", x: 200, y: 80, width: 400, height: 48 }),
        layer({ id: "b", type: "rect", x: 200, y: 160, width: 280, height: 32 }),
      ],
    };
    const index = buildSiteSelectionIndex(committedPage);
    const created = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["a", "b"],
      index,
      committedPage,
      sectionType: "generic",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const blueprint = applyNewSectionResponsiveDefaults(created.blueprint, created.createdNodeId!);
    const section = Object.values(blueprint.nodes).find((n) => n.kind === "section");
    expect(section && "sourceRange" in section ? section.sourceRange.top : null).toBe(0);

    const cases: Array<{ viewportWidth: number; band: "monitor" | "tablet" | "mobile" }> = [
      { viewportWidth: 1920, band: "monitor" },
      { viewportWidth: 768, band: "tablet" },
      { viewportWidth: 390, band: "mobile" },
    ];
    for (const { viewportWidth, band } of cases) {
      const resolved = resolveSiteCreatorResponsiveDisplay({
        page: committedPage,
        blueprint,
        referenceIndex: index,
        viewportWidth,
        band,
      });
      expect(resolved.band, band).toBe(band);
      const scale = pageScale(viewportWidth);
      const first = findObject(resolved.displayPage, "a")!;
      const second = findObject(resolved.displayPage, "b")!;
      expect(first.y, `${band} content y`).toBeCloseTo(80 * scale, 1);
      expect(second.y - first.y, `${band} inner gap`).toBeCloseTo(80 * scale, 1);
      const region = resolved.resolvedLayout?.regions[0];
      expect(region, band).toBeTruthy();
      expect(region!.layoutRect.y, `${band} section y`).toBeCloseTo(0, 1);
    }
  });

  it("keeps stretched bottom padding on monitor without moving content up", () => {
    const committedPage: DesignerPageState = {
      id: "pg",
      format: "web169",
      customWidth: 1920,
      customHeight: 1080,
      objects: [
        layer({ id: "hero", type: "rect", x: 0, y: 0, width: 1920, height: 400 }),
        layer({ id: "next", type: "rect", x: 0, y: 520, width: 1920, height: 200 }),
      ],
    };
    const index = buildSiteSelectionIndex(committedPage);
    const created = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["hero"],
      index,
      committedPage,
      sectionType: "hero",
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.createdNodeId) return;
    // Estirar el padding inferior antes de crear la siguiente: si no, ese hueco
    // queda reclamado como margen superior de la sección inferior.
    const stretched = stretchSectionSourceRangeBottom({
      blueprint: applyNewSectionResponsiveDefaults(created.blueprint, created.createdNodeId),
      sectionId: created.createdNodeId,
      bottom: 500,
      index,
      pageHeight: 1080,
    });
    expect(stretched.ok).toBe(true);
    if (!stretched.ok) return;
    const withNext = createSectionFromSelection({
      blueprint: stretched.blueprint,
      selectedLayerIds: ["next"],
      index,
      committedPage,
      sectionType: "generic",
    });
    expect(withNext.ok).toBe(true);
    if (!withNext.ok || !withNext.createdNodeId) return;
    const blueprint = applyNewSectionResponsiveDefaults(withNext.blueprint, withNext.createdNodeId);

    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committedPage,
      blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "monitor",
    });
    const region = resolved.resolvedLayout?.regions.find(
      (item) => item.sectionId === created.createdNodeId,
    );
    expect(region).toBeTruthy();
    expect(region!.layoutRect.height).toBeGreaterThanOrEqual(500);
    const hero = findObject(resolved.displayPage, "hero")!;
    expect(hero.y).toBeCloseTo(0, 1);
    expect(hero.height).toBeCloseTo(400, 1);
  });

  it("keeps designed bottom padding when custom height expands on monitor", () => {
    const committedPage: DesignerPageState = {
      id: "pg",
      format: "web169",
      customWidth: 1920,
      customHeight: 1080,
      objects: [
        layer({ id: "hero", type: "rect", x: 0, y: 0, width: 1920, height: 400 }),
        layer({ id: "next", type: "rect", x: 0, y: 520, width: 1920, height: 200 }),
      ],
    };
    const index = buildSiteSelectionIndex(committedPage);
    const created = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["hero"],
      index,
      committedPage,
      sectionType: "hero",
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.createdNodeId) return;
    const stretched = stretchSectionSourceRangeBottom({
      blueprint: applyNewSectionResponsiveDefaults(created.blueprint, created.createdNodeId),
      sectionId: created.createdNodeId,
      bottom: 500,
      index,
      pageHeight: 1080,
    });
    expect(stretched.ok).toBe(true);
    if (!stretched.ok) return;
    const withNext = createSectionFromSelection({
      blueprint: stretched.blueprint,
      selectedLayerIds: ["next"],
      index,
      committedPage,
      sectionType: "generic",
    });
    expect(withNext.ok).toBe(true);
    if (!withNext.ok || !withNext.createdNodeId) return;
    const withDefaults = applyNewSectionResponsiveDefaults(withNext.blueprint, withNext.createdNodeId);
    const custom = setSectionHeightMode(
      withDefaults,
      created.createdNodeId,
      "custom",
      "monitor",
      540,
    );
    expect(custom.ok).toBe(true);
    if (!custom.ok) return;

    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committedPage,
      blueprint: custom.blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "monitor",
    });
    const region = resolved.resolvedLayout?.regions.find(
      (item) => item.sectionId === created.createdNodeId,
    );
    expect(region).toBeTruthy();
    expect(region!.layoutRect.height).toBe(540);
    const hero = findObject(resolved.displayPage, "hero")!;
    expect(hero.y + hero.height).toBeLessThan(region!.layoutRect.y + region!.layoutRect.height - 50);
    expect(hero.height).toBeLessThan(region!.layoutRect.height - 50);
  });
});
