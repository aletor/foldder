/**
 * Cierre visual 6B.1 — cover, ancla, contigüidad, microbarra.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { buildDesignerSourceSnapshot } from "./designer-source-snapshot";
import { resetSiteBlueprintIdSeqForTests } from "./site-blueprint-ids";
import {
  buildSiteCreatorPresentationTree,
  presentationDirectChildren,
} from "./site-creator-presentation-tree";
import {
  deriveImageFocalFromSourceGeometry,
  resolveBackgroundCoverTransform,
} from "./site-creator-background-cover";
import {
  intersectionArea,
  resolveMicrobarPlacement,
} from "./site-creator-microbar-placement";
import {
  findDisplayObject,
  placeClusterByAnchor,
  resolveSiteCreatorResponsiveDisplay,
  TOP_LEVEL_REGION_GAP,
} from "./site-creator-responsive";
import { fixtureHeroPanelButton } from "./site-creator-responsive-fixtures";

describe("6B.1 visual close", () => {
  beforeEach(() => {
    resetSiteBlueprintIdSeqForTests();
  });

  it("TOP_LEVEL_REGION_GAP is 0", () => {
    expect(TOP_LEVEL_REGION_GAP).toBe(0);
  });

  it("cover centrado a 390 / 520 / 768 sin huecos y con focal 0.5", () => {
    for (const tw of [390, 520, 768]) {
      const source = { x: 0, y: 0, width: 1920, height: 900 };
      const target = { x: 0, y: 0, width: tw, height: 527 };
      const cover = resolveBackgroundCoverTransform({
        sourceRect: source,
        targetRect: target,
        focalPoint: { x: 0.5, y: 0.5 },
      });
      expect(cover.focalPoint).toEqual({ x: 0.5, y: 0.5 });
      expect(cover.width).toBeGreaterThanOrEqual(tw - 0.01);
      expect(cover.height).toBeGreaterThanOrEqual(527 - 0.01);
      // Cubre el target
      expect(cover.x).toBeLessThanOrEqual(0 + 0.01);
      expect(cover.x + cover.width).toBeGreaterThanOrEqual(tw - 0.01);
      expect(cover.y).toBeLessThanOrEqual(0 + 0.01);
      expect(cover.y + cover.height).toBeGreaterThanOrEqual(527 - 0.01);
      // No anclado a la izquierda por defecto: el exceso se reparte
      const overhangL = 0 - cover.x;
      const overhangR = cover.x + cover.width - tw;
      expect(Math.abs(overhangL - overhangR)).toBeLessThan(1);
    }
  });

  it("deriveImageFocal defaults to center for full-bleed image", () => {
    const focal = deriveImageFocalFromSourceGeometry({
      imageRect: { x: 0, y: 0, width: 1920, height: 900 },
      regionRect: { x: 0, y: 0, width: 1920, height: 900 },
    });
    expect(focal).toEqual({ x: 0.5, y: 0.5 });
  });

  it("mobile cover uses focal and oversized image clipped by region", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const mobile = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: 390,
    });
    const hero = mobile.resolvedLayout!.regions.find((r) => r.sectionType === "hero")!;
    expect(hero.backgroundFocals.photo).toEqual({ x: 0.5, y: 0.5 });
    const photo = findDisplayObject(mobile.displayPage, "photo")!;
    expect(photo.width).toBeGreaterThan(390);
    expect(photo.x).toBeLessThan(0);
    expect(photo.x + photo.width).toBeGreaterThanOrEqual(390);
    expect(mobile.resolvedLayout!.objectClipById.photo).toEqual(hero.clipRect);
  });

  it("cluster conserva ancla vertical (no pegado arriba) y queda dentro del padding", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const mobile = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: 390,
    });
    const hero = mobile.resolvedLayout!.regions.find((r) => r.sectionType === "hero")!;
    const surface = hero.ephemeralClusters.find((c) => c.kind === "surface")!;
    expect(surface.placedRect).toBeTruthy();
    expect(surface.anchor?.y).toBeGreaterThan(0.2);
    expect(surface.anchor?.y).toBeLessThan(0.8);

    const panel = findDisplayObject(mobile.displayPage, "panel")!;
    const heroMid = hero.layoutRect.y + hero.layoutRect.height / 2;
    const panelMid = panel.y + panel.height / 2;
    // Aproximadamente centrado (no pegado al top+inset)
    expect(panel.y).toBeGreaterThan(hero.layoutRect.y + 40);
    expect(Math.abs(panelMid - heroMid)).toBeLessThan(hero.layoutRect.height * 0.25);
    expect(panel.y).toBeGreaterThanOrEqual(hero.layoutRect.y + 18);
    expect(panel.y + panel.height).toBeLessThanOrEqual(
      hero.layoutRect.y + hero.layoutRect.height - 18,
    );

    const title = findDisplayObject(mobile.displayPage, "title")!;
    const btn = findDisplayObject(mobile.displayPage, "btn_shape")!;
    expect(title.y).toBeGreaterThanOrEqual(panel.y - 1);
    expect(btn.y + btn.height).toBeLessThanOrEqual(panel.y + panel.height + 1);
  });

  it("placeClusterByAnchor clamps inside padding", () => {
    const placed = placeClusterByAnchor({
      clusterSize: { width: 300, height: 120 },
      anchor: { x: 0.5, y: 0.05 },
      regionRect: { x: 0, y: 0, width: 390, height: 527 },
      padding: 20,
    });
    expect(placed.y).toBeGreaterThanOrEqual(20);
    expect(placed.y + placed.height).toBeLessThanOrEqual(527 - 20);
  });

  it("Hero y Section contiguos sin banda residual", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    for (const width of [390, 768]) {
      const result = resolveSiteCreatorResponsiveDisplay({
        page: fx.page,
        blueprint: fx.blueprint,
        referenceIndex: index,
        viewportWidth: width,
      });
      const hero = result.resolvedLayout!.regions.find((r) => r.sectionType === "hero")!;
      const section = result.resolvedLayout!.regions.find((r) => r.sectionId === fx.sectionId)!;
      expect(section.layoutRect.y).toBe(hero.layoutRect.y + hero.layoutRect.height);
      expect(section.clipRect.y).toBe(section.layoutRect.y);
      const last = section.layoutRect.y + section.layoutRect.height;
      expect(result.resolvedLayout!.pageRect.height).toBe(last);
    }
  });

  it("microbarra no intersecta la selección; en estrecho puede ir fuera del frame", () => {
    const selection = { x: 40, y: 80, width: 300, height: 140 };
    const placed = resolveMicrobarPlacement({
      selectionStageRect: selection,
      barWidth: 220,
      barHeight: 32,
      stageWidth: 390,
      stageHeight: 700,
      avoidRects: [{ x: 50, y: 100, width: 200, height: 40 }],
    });
    expect(intersectionArea(placed.barRect, selection)).toBe(0);
    expect(placed.outsideFrame || placed.barRect.y + placed.barRect.height <= selection.y).toBe(
      true,
    );
  });

  it("Original identidad; jerarquía idéntica Original↔Tablet↔Móvil↔Original", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const snap = buildDesignerSourceSnapshot("d1", fx.page);
    const treeAt = (page = fx.page) =>
      buildSiteCreatorPresentationTree({
        page,
        blueprint: fx.blueprint,
        selectionIndex: buildSiteSelectionIndex(page),
        snapshot: snap,
      });
    const idsOf = (width?: number) => {
      if (width && width !== 1920) {
        resolveSiteCreatorResponsiveDisplay({
          page: fx.page,
          blueprint: fx.blueprint,
          referenceIndex: index,
          viewportWidth: width,
        });
      }
      const kids = presentationDirectChildren(
        { kind: "blueprintNode", nodeId: fx.heroId },
        treeAt(fx.page),
      );
      return kids.map((k) =>
        k.kind === "semantic" ? `n:${k.nodeId}` : k.kind === "layer" ? `l:${k.layerId}` : k.id,
      );
    };

    const original = idsOf();
    expect(original).toHaveLength(4);
    expect(original.some((id) => id.includes("Grupo"))).toBe(false);

    const originalResolve = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
    });
    expect(originalResolve.strategy).toBe("identity");
    expect(JSON.stringify(originalResolve.displayPage.objects)).toBe(JSON.stringify(fx.page.objects));

    const tablet = idsOf(768);
    const mobile = idsOf(390);
    const back = idsOf(1920);
    expect(tablet).toEqual(original);
    expect(mobile).toEqual(original);
    expect(back).toEqual(original);

    expect(JSON.stringify(fx.blueprint).includes('"responsive"')).toBe(false);
    expect(buildDesignerSourceSnapshot("d1", fx.page).contentHash).toBe(snap.contentHash);
  });
});
