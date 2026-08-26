import { beforeEach, describe, expect, it } from "vitest";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { resetSiteBlueprintIdSeqForTests } from "./site-blueprint-ids";
import { createSectionFromSelection } from "./site-blueprint-ops";
import { createEmptySiteBlueprintV1 } from "./site-creator-types";
import { applyNewSectionResponsiveDefaults } from "./site-creator-section-defaults";
import { findDisplayObject, resolveSiteCreatorResponsiveDisplay } from "./site-creator-responsive";
import { makeLayer, makePage } from "./site-creator-responsive-fixtures";
import { SITE_CREATOR_MOBILE_WIDTH, SITE_CREATOR_TABLET_WIDTH } from "./site-creator-viewport";

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

function photoOf(page: { objects?: FreehandObject[] }) {
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
    const scale = SITE_CREATOR_TABLET_WIDTH / 1920;
    const tablet = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
    });
    const photo = photoOf(tablet.displayPage)!;
    const clip = findDisplayObject(tablet.displayPage, "clip")!;
    expect(clip.width).toBeCloseTo(800 * scale, 1);
    expect(photo.width).toBeCloseTo(960 * scale, 1);
  });
});
