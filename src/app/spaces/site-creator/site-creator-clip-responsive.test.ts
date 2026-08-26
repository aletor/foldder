import { beforeEach, describe, expect, it } from "vitest";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { resetSiteBlueprintIdSeqForTests } from "./site-blueprint-ids";
import { createSectionFromSelection, setSectionHeightMode } from "./site-blueprint-ops";
import { createEmptySiteBlueprintV1 } from "./site-creator-types";
import { applyNewSectionResponsiveDefaults } from "./site-creator-section-defaults";
import { findDisplayObject, resolveSiteCreatorResponsiveDisplay } from "./site-creator-responsive";
import { makeLayer, makePage } from "./site-creator-responsive-fixtures";
import { SITE_CREATOR_MOBILE_WIDTH, SITE_CREATOR_TABLET_WIDTH } from "./site-creator-viewport";
import { patchMediaTune } from "./site-creator-responsive-tunes";

function clipWithPhoto(): FreehandObject {
  return {
    ...makeLayer({ id: "clip", type: "rect", x: 200, y: 80, width: 800, height: 500 }),
    type: "clippingContainer",
    mask: makeLayer({ id: "mask", type: "rect", x: 0, y: 0, width: 800, height: 500 }),
    content: [
      makeLayer({
        id: "photo",
        type: "image",
        x: -40,
        y: -20,
        width: 960,
        height: 640,
        src: "https://cdn.example/photo.jpg",
      }),
    ],
  } as FreehandObject;
}

function photoOf(page: DesignerPageState) {
  const clip = findDisplayObject(page, "clip") as
    | (FreehandObject & { content?: FreehandObject[] })
    | undefined;
  return clip?.content?.find((c) => c.id === "photo") ?? findDisplayObject(page, "photo");
}

describe("clip images resize with the page", () => {
  beforeEach(() => {
    resetSiteBlueprintIdSeqForTests();
  });

  it("scales an unorganized clip on a page that already has a section", () => {
    const page = makePage([
      makeLayer({ id: "title", type: "text", x: 40, y: 20, width: 400, height: 60, text: "Hola" }),
      clipWithPhoto(),
    ]);
    const index = buildSiteSelectionIndex(page);
    const created = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["title"],
      index,
      committedPage: page,
      sectionType: "hero",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const blueprint = applyNewSectionResponsiveDefaults(created.blueprint, created.createdNodeId!);
    const scale = SITE_CREATOR_MOBILE_WIDTH / 1920;
    const mobile = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
    });
    const photo = photoOf(mobile.displayPage)!;
    const clip = findDisplayObject(mobile.displayPage, "clip")!;
    expect(clip.width).toBeCloseTo(800 * scale, 1);
    expect(photo.width).toBeCloseTo(960 * scale, 1);
    expect(photo.x).toBeCloseTo(-40 * scale, 1);
  });

  it("scales a clip owned by a section on tablet", () => {
    const page = makePage([clipWithPhoto()]);
    const index = buildSiteSelectionIndex(page);
    const created = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["clip"],
      index,
      committedPage: page,
      sectionType: "hero",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const blueprint = applyNewSectionResponsiveDefaults(created.blueprint, created.createdNodeId!);
    const tablet = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
    });
    const photo = photoOf(tablet.displayPage)!;
    const clip = findDisplayObject(tablet.displayPage, "clip")!;
    expect(clip.width).toBeCloseTo(SITE_CREATOR_TABLET_WIDTH, 1);
    expect(photo.width / photo.height).toBeCloseTo(960 / 640, 6);
    expect(photo.width).toBeGreaterThanOrEqual(clip.width - 0.5);
    expect(photo.height).toBeGreaterThanOrEqual(clip.height - 0.5);
  });

  it("expands a section-cover mask without distorting its inner photo", () => {
    const page = makePage([clipWithPhoto()]);
    const index = buildSiteSelectionIndex(page);
    const created = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["clip"],
      index,
      committedPage: page,
      sectionType: "hero",
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.createdNodeId) return;
    const initial = applyNewSectionResponsiveDefaults(created.blueprint, created.createdNodeId);
    const baseline = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: initial,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
      band: "tablet",
    });
    const baselineRegion = baseline.resolvedLayout?.regions.find(
      (region) => region.sectionId === created.createdNodeId,
    );
    expect(baselineRegion).toBeTruthy();
    if (!baselineRegion) return;
    const custom = setSectionHeightMode(
      initial,
      created.createdNodeId,
      "custom",
      "tablet",
      baselineRegion.naturalHeight + 240,
    );
    expect(custom.ok).toBe(true);
    if (!custom.ok) return;

    const expanded = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: custom.blueprint,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
      band: "tablet",
    });
    const expandedRegion = expanded.resolvedLayout?.regions.find(
      (region) => region.sectionId === created.createdNodeId,
    );
    const clip = findDisplayObject(expanded.displayPage, "clip") as
      | (FreehandObject & { mask?: FreehandObject; content?: FreehandObject[] })
      | undefined;
    const photo = clip?.content?.find((child) => child.id === "photo");
    expect(clip).toBeTruthy();
    expect(photo).toBeTruthy();
    expect(expandedRegion).toBeTruthy();
    if (!clip?.mask || !photo || !expandedRegion) return;

    expect(clip.height).toBeCloseTo(expandedRegion.layoutRect.height, 4);
    expect(clip.mask.height).toBeCloseTo(clip.height, 4);
    expect(photo.width / photo.height).toBeCloseTo(960 / 640, 6);
    expect(photo.width).toBeGreaterThanOrEqual(clip.width - 0.5);
    expect(photo.height).toBeGreaterThanOrEqual(clip.height - 0.5);
  });

  it("keeps a local mask at its natural size and only centers it", () => {
    const localClip = {
      ...clipWithPhoto(),
      x: 420,
      y: 220,
      width: 600,
      height: 300,
      mask: makeLayer({ id: "mask", type: "rect", x: 0, y: 0, width: 600, height: 300 }),
      content: [
        makeLayer({
          id: "photo",
          type: "image",
          x: -30,
          y: 0,
          width: 660,
          height: 300,
          src: "https://cdn.example/photo.jpg",
        }),
      ],
    } as FreehandObject;
    const page = makePage([
      makeLayer({ id: "bg", type: "rect", x: 0, y: 0, width: 1920, height: 900 }),
      localClip,
    ]);
    const index = buildSiteSelectionIndex(page);
    const created = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "clip"],
      index,
      committedPage: page,
      sectionType: "hero",
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.createdNodeId) return;
    const initial = applyNewSectionResponsiveDefaults(created.blueprint, created.createdNodeId);
    const baseline = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: initial,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
      band: "mobile",
    });
    const baselineRegion = baseline.resolvedLayout?.regions.find(
      (region) => region.sectionId === created.createdNodeId,
    );
    const baselineClip = findDisplayObject(baseline.displayPage, "clip") as
      | (FreehandObject & { mask?: FreehandObject })
      | undefined;
    expect(baselineRegion).toBeTruthy();
    expect(baselineClip).toBeTruthy();
    if (!baselineRegion || !baselineClip) return;
    const custom = setSectionHeightMode(
      initial,
      created.createdNodeId,
      "custom",
      "mobile",
      baselineRegion.naturalHeight + 200,
    );
    expect(custom.ok).toBe(true);
    if (!custom.ok) return;

    const expanded = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: custom.blueprint,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
      band: "mobile",
    });
    const centered = findDisplayObject(expanded.displayPage, "clip") as
      | (FreehandObject & { mask?: FreehandObject })
      | undefined;
    expect(centered).toBeTruthy();
    if (!centered) return;
    const expandedRegion = expanded.resolvedLayout?.regions.find(
      (region) => region.sectionId === created.createdNodeId,
    );
    expect(expandedRegion).toBeTruthy();
    if (!expandedRegion) return;
    const expectedShift = (expandedRegion.layoutRect.height - baselineRegion.layoutRect.height) / 2;
    expect(centered?.y - baselineClip.y).toBeCloseTo(expectedShift, 4);
    expect(centered?.width).toBeCloseTo(baselineClip.width, 4);
    expect(centered?.height).toBeCloseTo(baselineClip.height, 4);
    expect(centered?.mask?.height).toBeCloseTo(baselineClip.mask?.height ?? 0, 4);
  });

  it("applies a different mask image crop in every responsive band", () => {
    const page = makePage([clipWithPhoto()]);
    const index = buildSiteSelectionIndex(page);
    const created = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["clip"],
      index,
      committedPage: page,
      sectionType: "hero",
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.createdNodeId) return;
    const initial = applyNewSectionResponsiveDefaults(
      created.blueprint,
      created.createdNodeId,
    );
    let tuned = patchMediaTune({
      blueprint: initial,
      layerId: "photo",
      band: "wide",
      patch: { focal: { x: 1, y: 0.5 }, zoom: 2 },
    }).blueprint;
    tuned = patchMediaTune({
      blueprint: tuned,
      layerId: "photo",
      band: "tablet",
      patch: { focal: { x: 0, y: 0.5 }, zoom: 1.5 },
    }).blueprint;

    const resolve = (
      blueprint: typeof initial,
      band: "wide" | "tablet" | "mobile",
      viewportWidth: number,
    ) =>
      resolveSiteCreatorResponsiveDisplay({
        page,
        blueprint,
        referenceIndex: index,
        viewportWidth,
        band,
      });
    const baseWide = photoOf(resolve(initial, "wide", 1920).displayPage)!;
    const tunedWide = photoOf(resolve(tuned, "wide", 1920).displayPage)!;
    const baseTablet = photoOf(
      resolve(initial, "tablet", SITE_CREATOR_TABLET_WIDTH).displayPage,
    )!;
    const tunedTablet = photoOf(
      resolve(tuned, "tablet", SITE_CREATOR_TABLET_WIDTH).displayPage,
    )!;
    const baseMobile = photoOf(
      resolve(initial, "mobile", SITE_CREATOR_MOBILE_WIDTH).displayPage,
    )!;
    const tunedMobile = photoOf(
      resolve(tuned, "mobile", SITE_CREATOR_MOBILE_WIDTH).displayPage,
    )!;

    expect(tunedWide.width / baseWide.width).toBeCloseTo(2, 6);
    expect(tunedTablet.width / baseTablet.width).toBeCloseTo(1.5, 6);
    expect(tunedMobile).toMatchObject({
      x: baseMobile.x,
      y: baseMobile.y,
      width: baseMobile.width,
      height: baseMobile.height,
    });
  });
});
