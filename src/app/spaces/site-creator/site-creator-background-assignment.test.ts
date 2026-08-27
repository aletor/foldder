import { beforeEach, describe, expect, it } from "vitest";
import type { ClippingContainerObject, FreehandObject } from "../FreehandStudio";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import {
  assignExplicitBackground,
  inferExplicitBackgroundCandidate,
  patchExplicitBackgroundCrop,
  resolveExplicitBackground,
  restoreExplicitBackground,
} from "./site-creator-background-assignment";
import { findDisplayObject, resolveSiteCreatorResponsiveDisplay } from "./site-creator-responsive";
import { makeLayer, makePage } from "./site-creator-responsive-fixtures";
import { applyNewSectionResponsiveDefaults } from "./site-creator-section-defaults";
import { compilePublishedSite } from "./site-creator-publish-compile";
import { createSectionFromSelection } from "./site-blueprint-ops";
import { resetSiteBlueprintIdSeqForTests } from "./site-blueprint-ids";
import { createEmptySiteBlueprintV1 } from "./site-creator-types";
import { resetResponsiveBand } from "./site-creator-responsive-tunes";
import { setResponsiveOverride } from "./site-creator-responsive-overrides";
import {
  SITE_CREATOR_MOBILE_WIDTH,
  SITE_CREATOR_TABLET_WIDTH,
} from "./site-creator-viewport";

function sectionFixture() {
  const page = makePage([
    makeLayer({
      id: "photo",
      type: "image",
      x: 120,
      y: 80,
      width: 620,
      height: 360,
      src: "https://cdn.example/photo.jpg",
    }),
    makeLayer({
      id: "title",
      type: "text",
      x: 840,
      y: 160,
      width: 700,
      height: 120,
      text: "Título",
    }),
  ]);
  const index = buildSiteSelectionIndex(page);
  const created = createSectionFromSelection({
    blueprint: createEmptySiteBlueprintV1(),
    selectedLayerIds: ["photo", "title"],
    index,
    committedPage: page,
    sectionType: "generic",
  });
  expect(created.ok).toBe(true);
  if (!created.ok || !created.createdNodeId) {
    throw new Error("No se pudo crear la sección de prueba");
  }
  return {
    page,
    index,
    blueprint: applyNewSectionResponsiveDefaults(
      created.blueprint,
      created.createdNodeId,
    ),
    sectionId: created.createdNodeId,
  };
}

describe("explicit responsive container backgrounds", () => {
  beforeEach(() => {
    resetSiteBlueprintIdSeqForTests();
  });

  it("assigns and restores a background only in the active device", () => {
    const fixture = sectionFixture();
    const candidate = inferExplicitBackgroundCandidate({
      blueprint: fixture.blueprint,
      index: fixture.index,
      layerId: "photo",
    });
    expect(candidate).toMatchObject({
      sourceLayerId: "photo",
      imageLayerId: "photo",
      target: { kind: "blueprintNode", nodeId: fixture.sectionId },
    });
    if (!candidate) return;

    const assigned = assignExplicitBackground({
      blueprint: fixture.blueprint,
      candidate,
      band: "tablet",
    });
    expect(assigned.changed).toBe(true);
    expect(resolveExplicitBackground(assigned.blueprint, "photo", "tablet")).toBeTruthy();
    expect(resolveExplicitBackground(assigned.blueprint, "photo", "wide")).toBeNull();
    expect(resolveExplicitBackground(assigned.blueprint, "photo", "mobile")).toBeNull();

    const restored = restoreExplicitBackground({
      blueprint: assigned.blueprint,
      sourceLayerId: "photo",
      band: "tablet",
    });
    expect(restored.changed).toBe(true);
    expect(resolveExplicitBackground(restored.blueprint, "photo", "tablet")).toBeNull();
  });

  it("removes the image from Tablet flow and renders it as a clamped mask background", () => {
    const fixture = sectionFixture();
    const candidate = inferExplicitBackgroundCandidate({
      blueprint: fixture.blueprint,
      index: fixture.index,
      layerId: "photo",
    });
    if (!candidate) throw new Error("Falta candidato de fondo");
    const assigned = assignExplicitBackground({
      blueprint: fixture.blueprint,
      candidate,
      band: "tablet",
    }).blueprint;
    const cropped = patchExplicitBackgroundCrop({
      blueprint: assigned,
      sourceLayerId: "photo",
      band: "tablet",
      focal: { x: 1, y: 0 },
      zoom: 1.5,
    }).blueprint;

    const tablet = resolveSiteCreatorResponsiveDisplay({
      page: fixture.page,
      blueprint: cropped,
      referenceIndex: fixture.index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
      band: "tablet",
    });
    const region = tablet.resolvedLayout?.regions.find(
      (candidateRegion) => candidateRegion.sectionId === fixture.sectionId,
    );
    const background = findDisplayObject(
      tablet.displayPage,
      "photo",
    ) as ClippingContainerObject | undefined;
    expect(region).toBeTruthy();
    expect(background?.type).toBe("clippingContainer");
    if (!region || !background) return;
    expect(background).toMatchObject({
      x: region.layoutRect.x,
      y: region.layoutRect.y,
      width: region.layoutRect.width,
      height: region.layoutRect.height,
    });
    const image = background.content.find(
      (child) => child.id === "photo__background_image",
    );
    expect(image).toBeTruthy();
    if (!image) return;
    expect(image.width).toBeGreaterThanOrEqual(background.width);
    expect(image.height).toBeGreaterThanOrEqual(background.height);
    expect(image.x).toBeLessThanOrEqual(0);
    expect(image.x + image.width).toBeGreaterThanOrEqual(background.width);
    expect(tablet.displayPage.objects[0]?.id).toBe("photo");
  });

  it("keeps the same layer in normal flow on devices where it is not a background", () => {
    const fixture = sectionFixture();
    const candidate = inferExplicitBackgroundCandidate({
      blueprint: fixture.blueprint,
      index: fixture.index,
      layerId: "photo",
    });
    if (!candidate) throw new Error("Falta candidato de fondo");
    const assigned = assignExplicitBackground({
      blueprint: fixture.blueprint,
      candidate,
      band: "tablet",
    }).blueprint;

    const baselineMobile = resolveSiteCreatorResponsiveDisplay({
      page: fixture.page,
      blueprint: fixture.blueprint,
      referenceIndex: fixture.index,
      viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
      band: "mobile",
    });
    const assignedMobile = resolveSiteCreatorResponsiveDisplay({
      page: fixture.page,
      blueprint: assigned,
      referenceIndex: fixture.index,
      viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
      band: "mobile",
    });
    const baseline = findDisplayObject(baselineMobile.displayPage, "photo");
    const neutralClip = findDisplayObject(
      assignedMobile.displayPage,
      "photo",
    ) as ClippingContainerObject | undefined;
    expect(baseline).toBeTruthy();
    expect(neutralClip?.type).toBe("clippingContainer");
    if (!baseline || !neutralClip) return;
    expect(neutralClip).toMatchObject({
      x: baseline.x,
      y: baseline.y,
      width: baseline.width,
      height: baseline.height,
    });

    const restored = restoreExplicitBackground({
      blueprint: assigned,
      sourceLayerId: "photo",
      band: "tablet",
    }).blueprint;
    const restoredMobile = resolveSiteCreatorResponsiveDisplay({
      page: fixture.page,
      blueprint: restored,
      referenceIndex: fixture.index,
      viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
      band: "mobile",
    });
    expect(
      (findDisplayObject(restoredMobile.displayPage, "photo") as FreehandObject | undefined)
        ?.type,
    ).toBe("image");
  });

  it("publishes the generated mask content with the original image asset", () => {
    const fixture = sectionFixture();
    const candidate = inferExplicitBackgroundCandidate({
      blueprint: fixture.blueprint,
      index: fixture.index,
      layerId: "photo",
    });
    if (!candidate) throw new Error("Falta candidato de fondo");
    const blueprint = assignExplicitBackground({
      blueprint: fixture.blueprint,
      candidate,
      band: "mobile",
    }).blueprint;

    const compiled = compilePublishedSite({
      page: fixture.page,
      blueprint,
      title: "Fondo responsive",
      imageHrefByLayerId: { photo: "/assets/photo.webp" },
    });

    expect(compiled.html).toContain("/assets/photo.webp");
    expect(compiled.html).toContain("photo__background_image");
  });

  it("restablecer Tablet removes only its background assignment", () => {
    const fixture = sectionFixture();
    const candidate = inferExplicitBackgroundCandidate({
      blueprint: fixture.blueprint,
      index: fixture.index,
      layerId: "photo",
    });
    if (!candidate) throw new Error("Falta candidato de fondo");
    let blueprint = assignExplicitBackground({
      blueprint: fixture.blueprint,
      candidate,
      band: "wide",
    }).blueprint;
    blueprint = assignExplicitBackground({
      blueprint,
      candidate,
      band: "tablet",
    }).blueprint;

    const reset = resetResponsiveBand({ blueprint, band: "tablet" }).blueprint;
    expect(resolveExplicitBackground(reset, "photo", "tablet")).toBeNull();
    expect(resolveExplicitBackground(reset, "photo", "wide")).toBeTruthy();
  });

  it("keeps background assignments when changing adaptation mode", () => {
    const fixture = sectionFixture();
    const candidate = inferExplicitBackgroundCandidate({
      blueprint: fixture.blueprint,
      index: fixture.index,
      layerId: "photo",
    });
    if (!candidate) throw new Error("Falta candidato de fondo");
    const assigned = assignExplicitBackground({
      blueprint: fixture.blueprint,
      candidate,
      band: "mobile",
    }).blueprint;
    const changed = setResponsiveOverride({
      blueprint: assigned,
      target: { kind: "blueprintNode", nodeId: fixture.sectionId },
      band: "mobile",
      mode: "stack",
    }).blueprint;

    expect(resolveExplicitBackground(changed, "photo", "mobile")).toBeTruthy();
  });

  it("uses the full-cover lower rectangle as the new mask and discards the old mask", () => {
    const surface = {
      ...makeLayer({
        id: "surface",
        type: "rect",
        x: 0,
        y: 0,
        width: 1920,
        height: 900,
        fill: "#16324a",
      }),
      rx: 24,
    } as FreehandObject;
    const oldMask = makeLayer({
      id: "old-mask",
      type: "ellipse",
      x: 0,
      y: 0,
      width: 620,
      height: 440,
    });
    const clip = {
      ...makeLayer({
        id: "clip",
        type: "rect",
        x: 260,
        y: 120,
        width: 620,
        height: 440,
      }),
      type: "clippingContainer",
      mask: oldMask,
      content: [
        makeLayer({
          id: "inside-photo",
          type: "image",
          x: -20,
          y: 0,
          width: 660,
          height: 440,
          src: "https://cdn.example/inside.jpg",
        }),
      ],
    } as ClippingContainerObject;
    const page = makePage([
      surface,
      clip,
      makeLayer({
        id: "copy",
        type: "text",
        x: 980,
        y: 240,
        width: 650,
        height: 160,
        text: "Contenido",
      }),
    ]);
    const index = buildSiteSelectionIndex(page);
    const created = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["surface", "clip", "copy"],
      index,
      committedPage: page,
      sectionType: "hero",
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.createdNodeId) return;
    const blueprint = applyNewSectionResponsiveDefaults(
      created.blueprint,
      created.createdNodeId,
    );
    const candidate = inferExplicitBackgroundCandidate({
      blueprint,
      index,
      layerId: "clip",
    });
    expect(candidate?.surfaceLayerId).toBe("surface");
    if (!candidate) return;
    const assigned = assignExplicitBackground({
      blueprint,
      candidate,
      band: "mobile",
    }).blueprint;
    const mobile = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: assigned,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
      band: "mobile",
    });
    const background = findDisplayObject(
      mobile.displayPage,
      "clip",
    ) as ClippingContainerObject | undefined;
    const displayedSurface = findDisplayObject(mobile.displayPage, "surface");
    expect(background?.mask.type).toBe("rect");
    expect(background?.mask.id).toBe("clip__background_mask");
    expect(
      (background?.mask as FreehandObject & { rx?: number } | undefined)?.rx,
    ).toBe(24);
    expect(background?.content.map((child) => child.id)).toEqual([
      "inside-photo",
    ]);
    expect(displayedSurface?.visible).toBe(false);
    expect(mobile.displayPage.objects.map((object) => object.id).slice(0, 2)).toEqual([
      "surface",
      "clip",
    ]);
    const wide = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: assigned,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "wide",
    });
    expect(findDisplayObject(wide.displayPage, "surface")?.visible).not.toBe(false);
    const published = compilePublishedSite({
      page,
      blueprint: assigned,
      title: "Surface mask",
      imageHrefByLayerId: {
        "inside-photo": "https://cdn.example/inside.jpg",
      },
    });
    expect(published.css).toContain(".s-el-surface{display:none}");
  });

  it("targets the immediate Designer group when selecting an image inside a mask", () => {
    const group = {
      ...makeLayer({
        id: "card",
        type: "rect",
        x: 220,
        y: 120,
        width: 1000,
        height: 620,
      }),
      type: "groupContainer",
      children: [
        makeLayer({
          id: "card-surface",
          type: "rect",
          x: 0,
          y: 0,
          width: 1000,
          height: 620,
          fill: "#d05c38",
        }),
        {
          ...makeLayer({
            id: "card-photo-clip",
            type: "rect",
            x: 40,
            y: 60,
            width: 420,
            height: 420,
          }),
          type: "clippingContainer",
          mask: makeLayer({
            id: "card-old-mask",
            type: "ellipse",
            x: 0,
            y: 0,
            width: 420,
            height: 420,
          }),
          content: [
            makeLayer({
              id: "card-photo",
              type: "image",
              x: -80,
              y: 0,
              width: 580,
              height: 420,
              src: "https://cdn.example/card.jpg",
            }),
          ],
        } as ClippingContainerObject,
        makeLayer({
          id: "card-copy",
          type: "text",
          x: 520,
          y: 180,
          width: 400,
          height: 120,
          text: "Tarjeta",
        }),
      ],
    } as FreehandObject;
    const page = makePage([group]);
    const index = buildSiteSelectionIndex(page);
    const created = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["card"],
      index,
      committedPage: page,
      sectionType: "generic",
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.createdNodeId) return;
    const blueprint = applyNewSectionResponsiveDefaults(
      created.blueprint,
      created.createdNodeId,
    );
    const candidate = inferExplicitBackgroundCandidate({
      blueprint,
      index,
      layerId: "card-photo",
    });
    expect(candidate).toMatchObject({
      sourceLayerId: "card-photo-clip",
      imageLayerId: "card-photo",
      target: { kind: "designerGroup", layerId: "card" },
      surfaceLayerId: "card-surface",
    });
  });

  it("uses a Designer Image Frame photo as a reversible group background", () => {
    const surface = makeLayer({
      id: "frame-surface",
      type: "rect",
      x: 0,
      y: 0,
      width: 1000,
      height: 600,
      fill: "#203040",
    });
    const frame = {
      ...makeLayer({
        id: "image-frame",
        type: "rect",
        x: 80,
        y: 90,
        width: 420,
        height: 360,
      }),
      isImageFrame: true,
      imageFrameContent: {
        src: "https://cdn.example/frame-background.jpg",
        originalWidth: 1600,
        originalHeight: 900,
        scaleX: 0.47,
        scaleY: 0.47,
        offsetX: -55,
        offsetY: 0,
        fittingMode: "fill-proportional",
      },
    } as FreehandObject;
    const group = {
      ...makeLayer({
        id: "frame-group",
        type: "rect",
        x: 240,
        y: 100,
        width: 1000,
        height: 600,
      }),
      type: "groupContainer",
      children: [
        surface,
        frame,
        makeLayer({
        id: "frame-copy",
        type: "text",
        x: 560,
        y: 180,
        width: 360,
        height: 140,
        text: "Marco como fondo",
      }),
      ],
    } as FreehandObject;
    const page = makePage([group]);
    const index = buildSiteSelectionIndex(page);
    const created = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["frame-group"],
      index,
      committedPage: page,
      sectionType: "hero",
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.createdNodeId) return;
    const blueprint = applyNewSectionResponsiveDefaults(
      created.blueprint,
      created.createdNodeId,
    );
    const candidate = inferExplicitBackgroundCandidate({
      blueprint,
      index,
      layerId: "image-frame",
    });
    expect(candidate).toMatchObject({
      sourceLayerId: "image-frame",
      imageLayerId: "image-frame",
      surfaceLayerId: "frame-surface",
      target: { kind: "designerGroup", layerId: "frame-group" },
    });
    if (!candidate) return;
    const assigned = assignExplicitBackground({
      blueprint,
      candidate,
      band: "mobile",
    }).blueprint;
    const mobile = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: assigned,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
      band: "mobile",
    });
    const background = findDisplayObject(
      mobile.displayPage,
      "image-frame",
    ) as ClippingContainerObject | undefined;
    expect(background?.type).toBe("clippingContainer");
    expect(background?.content[0]?.id).toBe(
      "image-frame__background_image",
    );
    expect(background?.content[0]?.type).toBe("image");
    expect(
      findDisplayObject(mobile.displayPage, "frame-surface")?.visible,
    ).toBe(false);
    const restored = restoreExplicitBackground({
      blueprint: assigned,
      sourceLayerId: "image-frame",
      band: "mobile",
    }).blueprint;
    const restoredMobile = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: restored,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
      band: "mobile",
    });
    expect(findDisplayObject(restoredMobile.displayPage, "image-frame")?.type).toBe(
      "rect",
    );
    const published = compilePublishedSite({
      page,
      blueprint: assigned,
      title: "Frame background",
      imageHrefByLayerId: {
        "image-frame": "https://cdn.example/frame-background.jpg",
      },
    });
    expect(published.html).toContain(
      'src="https://cdn.example/frame-background.jpg"',
    );
  });
});
