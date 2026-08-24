/**
 * Tests Fase 6B.1 — reflow que preserva composición visual.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { getPageDimensions } from "@/app/spaces/indesign/page-formats";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { frontmostDirectHit } from "./site-creator-hit-test";
import { resetSiteBlueprintIdSeqForTests } from "./site-blueprint-ids";
import { createEmptySiteBlueprintV1 } from "./site-creator-types";
import {
  analyzeSectionVisualPresentation,
  assertNoHorizontalOverflow,
  bandForViewportWidth,
  classifyContainerBackground,
  findDisplayObject,
  resolveSiteCreatorResponsiveDisplay,
  roughlyContained,
} from "./site-creator-responsive";
import {
  fixtureAmbiguousOverlap,
  fixtureHeroBackgroundNoPanel,
  fixtureHeroPanelButton,
  fixtureSimpleSection,
  makeLayer,
  makePage,
} from "./site-creator-responsive-fixtures";

describe("site-creator-responsive 6B.1", () => {
  beforeEach(() => {
    resetSiteBlueprintIdSeqForTests();
  });

  it("H — Original es identidad píxel a píxel (sin reflow)", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const before = JSON.stringify(fx.page.objects);
    const result = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
    });
    expect(result.strategy).toBe("identity");
    expect(result.band).toBe("wide");
    expect(JSON.stringify(result.displayPage.objects)).toBe(before);
    expect(JSON.stringify(fx.page.objects)).toBe(before);
    expect(fx.blueprint.nodes[fx.heroId]).toBeTruthy();
    expect((fx.blueprint as { responsive?: unknown }).responsive).toBeUndefined();
  });

  it("A/E/F/G — Hero panel cluster: fondo excluido, panel+título+Button juntos, Section después", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const analysis = analyzeSectionVisualPresentation({
      blueprint: fx.blueprint,
      sectionId: fx.heroId,
      index,
    });
    expect(analysis).toBeTruthy();
    expect(analysis!.background.backgroundLayerIds).toEqual(["photo"]);
    expect(analysis!.clusters.some((c) => c.kind === "surface")).toBe(true);
    const surface = analysis!.clusters.find((c) => c.kind === "surface");
    expect(surface && surface.kind === "surface" && surface.surfaceLayerId).toBe("panel");
    if (surface && surface.kind === "surface") {
      const memberKinds = surface.members.map((m) => m.kind).sort();
      expect(memberKinds).toContain("button");
      expect(surface.members.some((m) => m.layerIds.includes("title"))).toBe(true);
      expect(surface.allLayerIds).not.toContain("photo");
    }

    const mobile = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: 390,
    });
    expect(mobile.layout.layoutHeight).toBeGreaterThan(400);
    expect(mobile.layout.layoutScale).toBe(1);

    const photo = findDisplayObject(mobile.displayPage, "photo")!;
    const panel = findDisplayObject(mobile.displayPage, "panel")!;
    const title = findDisplayObject(mobile.displayPage, "title")!;
    const btn = findDisplayObject(mobile.displayPage, "btn_shape")!;
    const secBg = findDisplayObject(mobile.displayPage, "sec_bg")!;
    const hero = mobile.resolvedLayout!.regions.find((r) => r.sectionType === "hero")!;

    // Cover: la foto puede ser más ancha; el clip de región la contiene.
    expect(photo.width).toBeGreaterThanOrEqual(390);
    expect(mobile.resolvedLayout!.objectClipById.photo).toEqual(hero.clipRect);
    expect(panel.y).toBeGreaterThanOrEqual(hero.layoutRect.y);
    expect(panel.y + panel.height).toBeLessThanOrEqual(
      hero.layoutRect.y + hero.layoutRect.height + 1,
    );
    expect(roughlyContained(
      { x: panel.x, y: panel.y, width: panel.width, height: panel.height },
      { x: title.x, y: title.y, width: title.width, height: Math.min(title.height, panel.height) },
      8,
    )).toBe(true);
    expect(roughlyContained(
      { x: panel.x, y: panel.y, width: panel.width, height: panel.height },
      { x: btn.x, y: btn.y, width: btn.width, height: Math.min(btn.height, panel.height) },
      8,
    )).toBe(true);
    expect(btn.height).toBeGreaterThanOrEqual(44);
    expect((title as { fontSize?: number }).fontSize ?? 0).toBeGreaterThanOrEqual(15);
    // Section contigua al Hero
    expect(secBg.y).toBe(hero.layoutRect.y + hero.layoutRect.height);
    expect(title.y).toBeLessThan(panel.y + panel.height);
    expect(
      assertNoHorizontalOverflow(mobile.displayPage, 390, hero.backgroundLayerIds),
    ).toBe(true);
  });

  it("B — Hero con fondo sin panel no inventa superficie", () => {
    const fx = fixtureHeroBackgroundNoPanel();
    const index = buildSiteSelectionIndex(fx.page);
    const analysis = analyzeSectionVisualPresentation({
      blueprint: fx.blueprint,
      sectionId: fx.heroId,
      index,
    });
    expect(analysis!.background.backgroundLayerIds).toEqual(["photo"]);
    expect(analysis!.clusters.every((c) => c.kind !== "surface")).toBe(true);

    const mobile = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: 390,
    });
    const photo = findDisplayObject(mobile.displayPage, "photo")!;
    const title = findDisplayObject(mobile.displayPage, "title")!;
    const hero = mobile.resolvedLayout!.regions.find((r) => r.sectionType === "hero")!;
    expect(photo.width).toBeGreaterThanOrEqual(390);
    expect(title.y).toBeGreaterThanOrEqual(hero.layoutRect.y);
    expect(title.y).toBeLessThan(hero.layoutRect.y + hero.layoutRect.height);
  });

  it("C — Section vertical simple fluye sin overflow", () => {
    const fx = fixtureSimpleSection();
    const index = buildSiteSelectionIndex(fx.page);
    for (const width of [390, 768, 520]) {
      const result = resolveSiteCreatorResponsiveDisplay({
        page: fx.page,
        blueprint: fx.blueprint,
        referenceIndex: index,
        viewportWidth: width,
      });
      expect(assertNoHorizontalOverflow(result.displayPage, width)).toBe(true);
      expect(result.layout.layoutWidth).toBe(width);
    }
  });

  it("D — solape ambiguo activa preserve y no apila capas", () => {
    const fx = fixtureAmbiguousOverlap();
    const index = buildSiteSelectionIndex(fx.page);
    const analysis = analyzeSectionVisualPresentation({
      blueprint: fx.blueprint,
      sectionId: fx.sectionId,
      index,
    });
    expect(analysis!.fallbackReasons.length).toBeGreaterThan(0);
    expect(analysis!.clusters.some((c) => c.kind === "preserve")).toBe(true);

    const mobile = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: 390,
    });
    const a = findDisplayObject(mobile.displayPage, "a")!;
    const b = findDisplayObject(mobile.displayPage, "b")!;
    const t = findDisplayObject(mobile.displayPage, "t")!;
    // Siguen solapándose (composición preservada), no en filas Y disjuntas
    const aBottom = a.y + a.height;
    const bTop = b.y;
    expect(bTop).toBeLessThan(aBottom);
    expect(t.y).toBeGreaterThanOrEqual(Math.min(a.y, b.y));
    expect(t.y).toBeLessThan(Math.max(a.y + a.height, b.y + b.height));
  });

  it("I — cero overflow horizontal en 390 / 768 / 520", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    for (const width of [390, 768, 520]) {
      const result = resolveSiteCreatorResponsiveDisplay({
        page: fx.page,
        blueprint: fx.blueprint,
        referenceIndex: index,
        viewportWidth: width,
      });
      const bgIds = result.resolvedLayout?.regions.flatMap((r) => r.backgroundLayerIds) ?? [];
      // Los fondos imagen usan cover (pueden desbordar el AABB); el clip de región los contiene.
      expect(assertNoHorizontalOverflow(result.displayPage, width, bgIds)).toBe(true);
      expect(bandForViewportWidth(width, 1920)).not.toBe("wide");
    }
  });

  it("J — bounds/hit-test usan geometría responsive (displayPage)", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const mobile = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: 390,
    });
    const displayIndex = buildSiteSelectionIndex(mobile.displayPage);
    const title = findDisplayObject(mobile.displayPage, "title")!;
    const hit = frontmostDirectHit(displayIndex, [], {
      x: title.x + title.width / 2,
      y: title.y + Math.min(12, title.height / 2),
    });
    expect(hit?.layerId).toBe("title");
    expect(displayIndex.byId.title?.visualBounds.x).toBeCloseTo(title.x, 0);
    expect(displayIndex.byId.title?.visualBounds.y).toBeCloseTo(title.y, 0);
  });

  it("K/L — no escribe Designer/sourceSnapshot ni reglas responsive en Blueprint", () => {
    const fx = fixtureHeroPanelButton();
    const pageBefore = JSON.stringify(fx.page);
    const bpBefore = JSON.stringify(fx.blueprint);
    const index = buildSiteSelectionIndex(fx.page);
    resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: 390,
    });
    expect(JSON.stringify(fx.page)).toBe(pageBefore);
    expect(JSON.stringify(fx.blueprint)).toBe(bpBefore);
    expect(JSON.stringify(fx.blueprint).includes('"responsive"')).toBe(false);
  });

  it("classifyContainerBackground rechaza imagen pequeña de contenido", () => {
    const page = makePage([
      makeLayer({ id: "hero_bg", type: "rect", x: 0, y: 0, width: 1920, height: 900, fill: "#333" }),
      makeLayer({ id: "thumb", type: "image", x: 100, y: 100, width: 120, height: 80 }),
      makeLayer({ id: "title", type: "text", x: 400, y: 400, width: 400, height: 60 }),
    ]);
    const index = buildSiteSelectionIndex(page);
    const result = classifyContainerBackground({
      containerBounds: { x: 0, y: 0, width: 1920, height: 900 },
      layerIds: ["hero_bg", "thumb", "title"],
      index,
      buttonLayerIds: new Set(),
    });
    expect(result.backgroundLayerIds).toContain("hero_bg");
    expect(result.backgroundLayerIds).not.toContain("thumb");
    expect(result.reasons.thumb).toMatch(/small-content-image/);
  });

  it("maps viewport widths to bands", () => {
    expect(bandForViewportWidth(1920, 1920)).toBe("wide");
    expect(bandForViewportWidth(1440, 1920)).toBe("wide");
    expect(bandForViewportWidth(1280, 1920)).toBe("wide");
    expect(bandForViewportWidth(1025, 1920)).toBe("wide");
    expect(bandForViewportWidth(1024, 1920)).toBe("tablet");
    expect(bandForViewportWidth(768, 1920)).toBe("tablet");
    expect(bandForViewportWidth(390, 1920)).toBe("mobile");
  });

  it("empty blueprint wide path still identity", () => {
    const page = makePage([makeLayer({ id: "x", type: "rect", x: 0, y: 0, width: 100, height: 100 })]);
    const index = buildSiteSelectionIndex(page);
    const result = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: createEmptySiteBlueprintV1(),
      referenceIndex: index,
      viewportWidth: 1920,
    });
    expect(getPageDimensions(result.displayPage)).toEqual(getPageDimensions(page));
  });
});
