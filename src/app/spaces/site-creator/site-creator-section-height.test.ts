import { describe, expect, it } from "vitest";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { createSectionFromSelection } from "./site-blueprint-ops";
import { cloneBlueprint } from "./site-blueprint-validate";
import { compilePublishedSite } from "./site-creator-publish-compile";
import { setSectionHeightMode } from "./site-blueprint-ops";
import {
  applySectionViewportHeights,
  describeSectionHeightOpportunity,
  designedSectionGapPx,
  liveViewportHeightInPageUnits,
  planSectionHeightLayout,
  resolveBandSectionTargetHeight,
  scaledDesignedSectionGap,
  sectionCustomHeightForBand,
  sectionHeightMode,
  sectionHeightModeForBand,
  sectionScrollStationsFromDisplay,
} from "./site-creator-section-height";
import { createEmptySiteBlueprintV1 } from "./site-creator-types";
import {
  fixtureHeroPanelButton,
  makeLayer,
  makePage,
} from "./site-creator-responsive-fixtures";
import { findDisplayObject, resolveSiteCreatorResponsiveDisplay } from "./site-creator-responsive";
import { SITE_CREATOR_TABLET_WIDTH } from "./site-creator-viewport";

function twoSections() {
  const page = makePage([
    makeLayer({ id: "h", type: "rect", x: 0, y: 0, width: 1920, height: 400, fill: "#111" }),
    makeLayer({ id: "b", type: "rect", x: 0, y: 500, width: 1920, height: 400, fill: "#222" }),
  ]);
  const index = buildSiteSelectionIndex(page);
  const hero = createSectionFromSelection({
    blueprint: createEmptySiteBlueprintV1(),
    selectedLayerIds: ["h"],
    index,
    committedPage: page,
    sectionType: "hero",
  });
  expect(hero.ok).toBe(true);
  if (!hero.ok || !hero.createdNodeId) throw new Error("hero");
  const section = createSectionFromSelection({
    blueprint: hero.blueprint,
    selectedLayerIds: ["b"],
    index,
    committedPage: page,
    sectionType: "generic",
  });
  expect(section.ok).toBe(true);
  if (!section.ok || !section.createdNodeId) throw new Error("section");
  return {
    page,
    index,
    blueprint: section.blueprint,
    heroId: hero.createdNodeId,
    sectionId: section.createdNodeId,
  };
}

function rectangularPath(id = "path-bg"): FreehandObject {
  const point = (x: number, y: number) => ({
    anchor: { x, y },
    handleIn: { x, y },
    handleOut: { x, y },
  });
  return {
    ...makeLayer({
      id,
      type: "path",
      x: 0,
      y: 0,
      width: 1920,
      height: 400,
      fill: "#111",
    }),
    type: "path",
    closed: true,
    points: [
      point(0, 0),
      point(1920, 0),
      point(1920, 400),
      point(0, 400),
    ],
  } as FreehandObject;
}

describe("section height mode", () => {
  it("stores viewport height on the section and clones it", () => {
    const { blueprint, heroId } = twoSections();
    const next = setSectionHeightMode(blueprint, heroId, "viewport");
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(sectionHeightMode(next.blueprint.nodes[heroId] as never)).toBe("viewport");
    const cloned = cloneBlueprint(next.blueprint);
    expect(cloned.nodes[heroId]).toMatchObject({ heightMode: "viewport" });
    expect(cloned.nodes[heroId]).not.toBe(next.blueprint.nodes[heroId]);
    cloned.nodes[heroId] = { ...cloned.nodes[heroId]!, label: "mutated" };
    expect(next.blueprint.nodes[heroId]).toMatchObject({ heightMode: "viewport", label: expect.not.stringMatching(/^mutated$/) });
  });

  it("plans extra space so a short section fills the page height", () => {
    const { blueprint, heroId, sectionId } = twoSections();
    const fitted = setSectionHeightMode(blueprint, heroId, "viewport");
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    const layout = planSectionHeightLayout(fitted.blueprint, 1080);
    const hero = layout.ranges.find((r) => r.id === heroId)!;
    const next = layout.ranges.find((r) => r.id === sectionId)!;
    expect(hero.fitted).toBe(true);
    expect(hero.height).toBe(1080);
    expect(hero.extra).toBeGreaterThan(600);
    expect(next.top).toBeGreaterThan(hero.top + 400);
  });

  it("plans custom height without treating it as viewport fit", () => {
    const { blueprint, heroId, sectionId } = twoSections();
    const custom = setSectionHeightMode(blueprint, heroId, "custom", "wide", 900);
    expect(custom.ok).toBe(true);
    if (!custom.ok) return;
    expect(sectionHeightMode(custom.blueprint.nodes[heroId] as never)).toBe("custom");
    const layout = planSectionHeightLayout(custom.blueprint, 1080);
    const hero = layout.ranges.find((r) => r.id === heroId)!;
    const next = layout.ranges.find((r) => r.id === sectionId)!;
    expect(hero.fitted).toBe(false);
    expect(hero.height).toBe(900);
    expect(hero.extra).toBe(500);
    // El hueco de diseño entre hero (0–400) y body (500) se conserva al empujar.
    expect(next.top).toBe(1000);
  });

  it("keeps the original gap between sections on tablet and mobile", () => {
    const { page, index, blueprint, heroId, sectionId } = twoSections();
    const hero = blueprint.nodes[heroId];
    const section = blueprint.nodes[sectionId];
    expect(hero?.kind).toBe("section");
    expect(section?.kind).toBe("section");
    if (hero?.kind !== "section" || section?.kind !== "section") return;
    expect(designedSectionGapPx(hero, section)).toBe(100);

    for (const width of [SITE_CREATOR_TABLET_WIDTH, 390]) {
      const resolved = resolveSiteCreatorResponsiveDisplay({
        page,
        blueprint,
        referenceIndex: index,
        viewportWidth: width,
      });
      const heroRegion = resolved.resolvedLayout?.regions.find((region) => region.sectionId === heroId);
      const nextRegion = resolved.resolvedLayout?.regions.find((region) => region.sectionId === sectionId);
      expect(heroRegion).toBeTruthy();
      expect(nextRegion).toBeTruthy();
      if (!heroRegion || !nextRegion) return;
      const gap = scaledDesignedSectionGap(hero, section, width, 1920);
      expect(gap).toBeGreaterThan(0);
      expect(nextRegion.layoutRect.y).toBe(heroRegion.layoutRect.y + heroRegion.layoutRect.height + gap);
    }
  });

  it("inherits Original custom extra onto tablet when that band has no override", () => {
    const { page, index, blueprint, sectionId } = twoSections();
    const custom = setSectionHeightMode(blueprint, sectionId, "custom", "wide", 900);
    expect(custom.ok).toBe(true);
    if (!custom.ok) return;
    const section = custom.blueprint.nodes[sectionId];
    expect(section?.kind).toBe("section");
    if (section?.kind !== "section") return;

    const baseline = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
      band: "tablet",
    });
    const expanded = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: custom.blueprint,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
      band: "tablet",
    });
    const baselineRegion = baseline.resolvedLayout?.regions.find((region) => region.sectionId === sectionId);
    const expandedRegion = expanded.resolvedLayout?.regions.find((region) => region.sectionId === sectionId);
    expect(baselineRegion).toBeTruthy();
    expect(expandedRegion).toBeTruthy();
    if (!baselineRegion || !expandedRegion) return;

    const scale = SITE_CREATOR_TABLET_WIDTH / 1920;
    const target = resolveBandSectionTargetHeight({
      blueprint: custom.blueprint,
      section,
      band: "tablet",
      contentHeight: baselineRegion.layoutRect.height,
      viewportHeight: 1080,
      layoutScale: scale,
      expandViewportSections: true,
    });
    expect(expandedRegion.layoutRect.height).toBeCloseTo(target, 4);
    expect(expandedRegion.layoutRect.height).toBeGreaterThan(baselineRegion.layoutRect.height);
  });

  it("keeps original side insets of a section background on tablet and mobile", () => {
    const page = makePage([
      makeLayer({
        id: "photo",
        type: "image",
        x: 120,
        y: 40,
        width: 1680,
        height: 700,
      }),
    ]);
    const index = buildSiteSelectionIndex(page);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["photo"],
      index,
      committedPage: page,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok || !hero.createdNodeId) return;

    for (const width of [SITE_CREATOR_TABLET_WIDTH, 390]) {
      const resolved = resolveSiteCreatorResponsiveDisplay({
        page,
        blueprint: hero.blueprint,
        referenceIndex: index,
        viewportWidth: width,
      });
      const photo = findDisplayObject(resolved.displayPage, "photo")!;
      const scale = width / 1920;
      expect(photo.x).toBeCloseTo(120 * scale, 1);
      expect(photo.width).toBeCloseTo(1680 * scale, 1);
      expect(photo.x).toBeGreaterThan(4);
      expect(photo.x + photo.width).toBeLessThan(width - 4);
    }
  });

  it("shows expand arrow for content and restore for viewport", () => {
    const { blueprint, heroId } = twoSections();
    const content = describeSectionHeightOpportunity({
      blueprint,
      sectionId: heroId,
      pageWidth: 1920,
      viewportHeight: 1080,
    });
    expect(content?.showExpand).toBe(true);
    expect(content?.showRestore).toBe(false);
    const fitted = setSectionHeightMode(blueprint, heroId, "viewport");
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    const restore = describeSectionHeightOpportunity({
      blueprint: fitted.blueprint,
      sectionId: heroId,
      pageWidth: 1920,
      viewportHeight: 1080,
    });
    expect(restore?.showExpand).toBe(false);
    expect(restore?.showRestore).toBe(true);
  });

  it("anchors the expand handle to visual bounds when sourceRange is taller than the section", () => {
    const { blueprint, heroId } = twoSections();
    const node = blueprint.nodes[heroId];
    expect(node && node.kind === "section").toBe(true);
    if (!node || node.kind !== "section") return;
    node.sourceRange = { top: 0, bottom: 1080 };
    const inflated = describeSectionHeightOpportunity({
      blueprint,
      sectionId: heroId,
      pageWidth: 1920,
      viewportHeight: 1080,
    });
    expect(inflated?.showExpand).toBe(false);
    const visual = describeSectionHeightOpportunity({
      blueprint,
      sectionId: heroId,
      pageWidth: 1920,
      viewportHeight: 1080,
      visualRect: { x: 0, y: 0, width: 1920, height: 400 },
    });
    expect(visual?.showExpand).toBe(true);
    expect(visual?.bounds.height).toBe(400);
    expect(visual?.bounds.y).toBe(0);
    expect(visual?.targetBounds.height).toBe(1080);
  });

  it("shifts following layers down on the preview page", () => {
    const { page, blueprint, index, heroId } = twoSections();
    const fitted = setSectionHeightMode(blueprint, heroId, "viewport");
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    const laidOut = applySectionViewportHeights({
      page,
      blueprint: fitted.blueprint,
      index,
      viewportHeight: 1080,
    });
    const body = laidOut.page.objects?.find((obj) => obj.id === "b");
    expect(body?.y).toBeGreaterThan(1000);
    expect(laidOut.page.customHeight).toBeGreaterThan(1400);
  });

  it("centers section content as one block without changing its internal spacing", () => {
    const page = makePage([
      makeLayer({ id: "bg", type: "rect", x: 0, y: 0, width: 1920, height: 400, fill: "#111" }),
      makeLayer({ id: "title", type: "text", x: 240, y: 100, width: 600, height: 60, text: "Title" }),
      makeLayer({ id: "subtitle", type: "text", x: 240, y: 220, width: 500, height: 40, text: "Subtitle" }),
      makeLayer({ id: "body", type: "rect", x: 0, y: 500, width: 1920, height: 400, fill: "#222" }),
    ]);
    const index = buildSiteSelectionIndex(page);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "title", "subtitle"],
      index,
      committedPage: page,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok || !hero.createdNodeId) return;
    const fitted = setSectionHeightMode(hero.blueprint, hero.createdNodeId, "custom", "wide", 1000);
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;

    const laidOut = applySectionViewportHeights({
      page,
      blueprint: fitted.blueprint,
      index,
      viewportHeight: 1080,
    }).page;
    const bg = findDisplayObject(laidOut, "bg")!;
    const title = findDisplayObject(laidOut, "title")!;
    const subtitle = findDisplayObject(laidOut, "subtitle")!;
    const body = findDisplayObject(laidOut, "body")!;

    expect(bg.y).toBe(0);
    expect(bg.height).toBe(1000);
    expect(title.y).toBe(400);
    expect(subtitle.y).toBe(520);
    expect(subtitle.y - title.y).toBe(120);
    expect(body.y).toBe(1100);
  });

  it("stretches path geometry used as a section background", () => {
    const path = rectangularPath();
    const title = makeLayer({
      id: "title",
      type: "text",
      x: 240,
      y: 120,
      width: 600,
      height: 60,
      text: "Title",
    });
    const page = makePage([path, title]);
    const index = buildSiteSelectionIndex(page);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: [path.id, title.id],
      index,
      committedPage: page,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok || !hero.createdNodeId) return;
    const custom = setSectionHeightMode(
      hero.blueprint,
      hero.createdNodeId,
      "custom",
      "wide",
      1000,
    );
    expect(custom.ok).toBe(true);
    if (!custom.ok) return;

    const laidOut = applySectionViewportHeights({
      page,
      blueprint: custom.blueprint,
      index,
      viewportHeight: 1080,
    }).page;
    const expanded = findDisplayObject(laidOut, path.id) as
      | (FreehandObject & {
          points?: Array<{ anchor: { x: number; y: number } }>;
        })
      | undefined;

    expect(expanded?.height).toBeCloseTo(1000, 6);
    expect(
      Math.max(...(expanded?.points ?? []).map((item) => item.anchor.y)),
    ).toBeCloseTo(1000, 6);
  });

  it("expands a wide section mask while preserving inner content proportions", () => {
    const clip = {
      ...makeLayer({ id: "clip", type: "rect", x: 0, y: 0, width: 1920, height: 400 }),
      type: "clippingContainer",
      mask: makeLayer({ id: "mask", type: "rect", x: 0, y: 0, width: 1920, height: 400 }),
      content: [
        makeLayer({ id: "photo", type: "image", x: 0, y: 0, width: 1920, height: 400 }),
      ],
    } as FreehandObject;
    const page = makePage([clip]);
    const index = buildSiteSelectionIndex(page);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["clip"],
      index,
      committedPage: page,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok || !hero.createdNodeId) return;
    const custom = setSectionHeightMode(hero.blueprint, hero.createdNodeId, "custom", "wide", 1000);
    expect(custom.ok).toBe(true);
    if (!custom.ok) return;

    const laidOut = applySectionViewportHeights({
      page,
      blueprint: custom.blueprint,
      index,
      viewportHeight: 1080,
    }).page;
    const expanded = findDisplayObject(laidOut, "clip") as
      | (FreehandObject & { mask?: FreehandObject; content?: FreehandObject[] })
      | undefined;
    const photo = expanded?.content?.find((child) => child.id === "photo");
    expect(expanded?.height).toBe(1000);
    expect(expanded?.mask?.height).toBe(1000);
    expect(photo?.width / (photo?.height ?? 1)).toBeCloseTo(1920 / 400, 8);
    expect(photo?.height).toBeGreaterThanOrEqual(1000);

    const compiled = compilePublishedSite({
      page,
      blueprint: custom.blueprint,
      title: "Máscara adaptable",
      imageHrefByLayerId: {},
    });
    expect(compiled.html).toContain('<div class="s-clip-content">');
    expect(compiled.css).toContain(
      ".s-group-clip>.s-clip-content{position:absolute;left:50%;top:50%;height:max(100%,calc(100cqw * 400 / 1920));width:auto;aspect-ratio:1920 / 400",
    );
  });

  it("centers a local mask without stretching its frame or contents", () => {
    const clip = {
      ...makeLayer({ id: "clip", type: "rect", x: 200, y: 100, width: 600, height: 200 }),
      type: "clippingContainer",
      mask: makeLayer({ id: "mask", type: "rect", x: 0, y: 0, width: 600, height: 200 }),
      content: [
        makeLayer({ id: "photo", type: "image", x: 0, y: 0, width: 600, height: 200 }),
      ],
    } as FreehandObject;
    const page = makePage([
      makeLayer({ id: "bg", type: "rect", x: 0, y: 0, width: 1920, height: 400 }),
      clip,
    ]);
    const index = buildSiteSelectionIndex(page);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "clip"],
      index,
      committedPage: page,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok || !hero.createdNodeId) return;
    const custom = setSectionHeightMode(hero.blueprint, hero.createdNodeId, "custom", "wide", 1000);
    expect(custom.ok).toBe(true);
    if (!custom.ok) return;

    const laidOut = applySectionViewportHeights({
      page,
      blueprint: custom.blueprint,
      index,
      viewportHeight: 1080,
    }).page;
    const centered = findDisplayObject(laidOut, "clip") as
      | (FreehandObject & { mask?: FreehandObject; content?: FreehandObject[] })
      | undefined;
    const photo = centered?.content?.find((child) => child.id === "photo");
    expect(centered).toMatchObject({ y: 400, width: 600, height: 200 });
    expect(centered?.mask).toMatchObject({ width: 600, height: 200 });
    expect(photo).toMatchObject({ x: 0, y: 0, width: 600, height: 200 });
  });

  it("centers responsive content while backgrounds keep covering the expanded section", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const baseline = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
      band: "tablet",
    });
    const baselineRegion = baseline.resolvedLayout?.regions.find(
      (region) => region.sectionId === fx.heroId,
    );
    expect(baselineRegion).toBeTruthy();
    if (!baselineRegion) return;
    const baselineTitle = findDisplayObject(baseline.displayPage, "title")!;
    const baselinePanel = findDisplayObject(baseline.displayPage, "panel")!;
    const baselinePhoto = findDisplayObject(baseline.displayPage, "photo")!;

    const custom = setSectionHeightMode(
      fx.blueprint,
      fx.heroId,
      "custom",
      "tablet",
      baselineRegion.naturalHeight + 200,
    );
    expect(custom.ok).toBe(true);
    if (!custom.ok) return;
    const expanded = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: custom.blueprint,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
      band: "tablet",
    });
    const expandedRegion = expanded.resolvedLayout?.regions.find(
      (region) => region.sectionId === fx.heroId,
    );
    expect(expandedRegion).toBeTruthy();
    if (!expandedRegion) return;
    const title = findDisplayObject(expanded.displayPage, "title")!;
    const panel = findDisplayObject(expanded.displayPage, "panel")!;
    const photo = findDisplayObject(expanded.displayPage, "photo")!;

    expect(title.y - baselineTitle.y).toBeCloseTo(100, 4);
    expect(panel.y - baselinePanel.y).toBeCloseTo(100, 4);
    expect(title.y - panel.y).toBeCloseTo(baselineTitle.y - baselinePanel.y, 4);
    expect(photo.y).toBeCloseTo(expandedRegion.layoutRect.y, 4);
    expect(photo.height).toBeCloseTo(expandedRegion.layoutRect.height, 4);
    expect(photo.y).toBeCloseTo(baselinePhoto.y, 4);
  });

  it("keeps a path background fitted after responsive custom-height expansion", () => {
    const path = rectangularPath("responsive-path-bg");
    const title = makeLayer({
      id: "responsive-title",
      type: "text",
      x: 240,
      y: 120,
      width: 600,
      height: 60,
      text: "Title",
    });
    const page = makePage([path, title]);
    const index = buildSiteSelectionIndex(page);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: [path.id, title.id],
      index,
      committedPage: page,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok || !hero.createdNodeId) return;
    const baseline = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: hero.blueprint,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
      band: "tablet",
    });
    const baselineRegion = baseline.resolvedLayout?.regions.find(
      (region) => region.sectionId === hero.createdNodeId,
    );
    expect(baselineRegion).toBeTruthy();
    if (!baselineRegion) return;
    const custom = setSectionHeightMode(
      hero.blueprint,
      hero.createdNodeId,
      "custom",
      "tablet",
      baselineRegion.naturalHeight + 200,
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
    const region = expanded.resolvedLayout?.regions.find(
      (item) => item.sectionId === hero.createdNodeId,
    );
    const expandedPath = findDisplayObject(expanded.displayPage, path.id) as
      | (FreehandObject & {
          points?: Array<{ anchor: { x: number; y: number } }>;
        })
      | undefined;
    const ys = (expandedPath?.points ?? []).map((item) => item.anchor.y);

    expect(region).toBeTruthy();
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(
      region?.layoutRect.height ?? 0,
      4,
    );
  });

  it("emits exact 100dvh height in published CSS", () => {
    const { page, blueprint, heroId } = twoSections();
    const fitted = setSectionHeightMode(blueprint, heroId, "viewport");
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    const compiled = compilePublishedSite({
      page,
      blueprint: fitted.blueprint,
      title: "Alto",
      imageHrefByLayerId: {},
    });
    expect(compiled.html).toContain("s-has-vh-secs");
    expect(compiled.css).toContain("height:100dvh");
    expect(compiled.css).toContain("max-height:100dvh");
    expect(compiled.css).toContain("100cqw");
    expect(compiled.css).toMatch(/s-sec-anchor-[^{]+\{[^}]*calc\(/);
    expect(compiled.css).not.toMatch(/foldder/i);
  });

  it("publishes the same half-extra vertical translation for section content", () => {
    const page = makePage([
      makeLayer({ id: "bg", type: "rect", x: 0, y: 0, width: 1920, height: 400, fill: "#111" }),
      makeLayer({ id: "title", type: "text", x: 240, y: 120, width: 600, height: 60, text: "Title" }),
    ]);
    const index = buildSiteSelectionIndex(page);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "title"],
      index,
      committedPage: page,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok || !hero.createdNodeId) return;
    const fitted = setSectionHeightMode(hero.blueprint, hero.createdNodeId, "viewport");
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    const compiled = compilePublishedSite({
      page,
      blueprint: fitted.blueprint,
      title: "Centrado",
      imageHrefByLayerId: {},
    });

    expect(compiled.css).toContain(
      "top:calc((max(0px,100dvh - 100cqw * 400 / 1920)) / 2 + calc(100cqw * 120 / 1920))",
    );
    expect(compiled.css).toMatch(/\.s-el-bg\{[^}]*height:calc\([^}]*100dvh/);

    const custom = setSectionHeightMode(hero.blueprint, hero.createdNodeId, "custom", "wide", 1000);
    expect(custom.ok).toBe(true);
    if (!custom.ok) return;
    const customCompiled = compilePublishedSite({
      page,
      blueprint: custom.blueprint,
      title: "Centrado custom",
      imageHrefByLayerId: {},
    });
    expect(customCompiled.html).toContain("s-has-vh-secs");
    expect(customCompiled.css).toContain(
      "top:calc((calc(100cqw * 600 / 1920)) / 2 + calc(100cqw * 120 / 1920))",
    );
    expect(customCompiled.css).toContain(
      "height:calc(calc(100cqw * 400 / 1920) + calc(100cqw * 600 / 1920))",
    );
  });

  it("maps the live window to page units so height changes with resize", () => {
    expect(
      liveViewportHeightInPageUnits({ pageWidth: 1920, availableWidth: 960, availableHeight: 500 }),
    ).toBe(1000);
    expect(
      liveViewportHeightInPageUnits({ pageWidth: 1920, availableWidth: 960, availableHeight: 700 }),
    ).toBe(1400);
  });

  it("plans a different extra when the live viewport height changes", () => {
    const { blueprint, heroId } = twoSections();
    const fitted = setSectionHeightMode(blueprint, heroId, "viewport");
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    const short = planSectionHeightLayout(fitted.blueprint, 800);
    const tall = planSectionHeightLayout(fitted.blueprint, 1200);
    const shortHero = short.ranges.find((r) => r.id === heroId)!;
    const tallHero = tall.ranges.find((r) => r.id === heroId)!;
    expect(tallHero.height).toBeGreaterThan(shortHero.height);
    expect(tallHero.extra).toBe(shortHero.extra + 400);
  });

  it("does not freeze following layers to a snapshot height in published CSS", () => {
    const { page, blueprint, heroId } = twoSections();
    const fitted = setSectionHeightMode(blueprint, heroId, "viewport");
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    const compiled = compilePublishedSite({
      page,
      blueprint: fitted.blueprint,
      title: "Alto",
      imageHrefByLayerId: {},
    });
    expect(compiled.css).toContain("100dvh");
    expect(compiled.css).toMatch(/100cqw \* 500 \//);
    expect(compiled.css).not.toMatch(/100cqw \* 1180 \//);
  });

  it("keeps viewport height independent per original / tablet / mobile", () => {
    const { blueprint, heroId } = twoSections();
    const section = blueprint.nodes[heroId];
    if (!section || section.kind !== "section") throw new Error("section");
    const original = setSectionHeightMode(blueprint, heroId, "viewport");
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    expect(sectionHeightMode(original.blueprint.nodes[heroId] as never)).toBe("viewport");
    expect(sectionHeightModeForBand(original.blueprint, section, "tablet")).toBe("content");
    expect(sectionHeightModeForBand(original.blueprint, section, "mobile")).toBe("content");

    const tablet = setSectionHeightMode(original.blueprint, heroId, "viewport", "tablet");
    expect(tablet.ok).toBe(true);
    if (!tablet.ok) return;
    expect(sectionHeightMode(tablet.blueprint.nodes[heroId] as never)).toBe("viewport");
    expect(sectionHeightModeForBand(tablet.blueprint, section, "tablet")).toBe("viewport");
    expect(sectionHeightModeForBand(tablet.blueprint, section, "mobile")).toBe("content");

    const restored = setSectionHeightMode(tablet.blueprint, heroId, "content", "tablet");
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(sectionHeightMode(restored.blueprint.nodes[heroId] as never)).toBe("viewport");
    expect(sectionHeightModeForBand(restored.blueprint, section, "tablet")).toBe("content");
  });

  it("switches from custom to viewport and clears the custom value per band", () => {
    const { blueprint, heroId } = twoSections();
    const section = blueprint.nodes[heroId];
    if (!section || section.kind !== "section") throw new Error("section");

    const customWide = setSectionHeightMode(blueprint, heroId, "custom", "wide", 900);
    expect(customWide.ok).toBe(true);
    if (!customWide.ok) return;
    const viewportWide = setSectionHeightMode(customWide.blueprint, heroId, "viewport", "wide");
    expect(viewportWide.ok).toBe(true);
    if (!viewportWide.ok) return;
    const viewportWideSection = viewportWide.blueprint.nodes[heroId];
    if (!viewportWideSection || viewportWideSection.kind !== "section") throw new Error("section");
    expect(sectionHeightModeForBand(viewportWide.blueprint, viewportWideSection, "wide")).toBe(
      "viewport",
    );
    expect(
      sectionCustomHeightForBand(viewportWide.blueprint, viewportWideSection, "wide"),
    ).toBeNull();

    const customTablet = setSectionHeightMode(
      viewportWide.blueprint,
      heroId,
      "custom",
      "tablet",
      900,
    );
    expect(customTablet.ok).toBe(true);
    if (!customTablet.ok) return;
    const viewportTablet = setSectionHeightMode(
      customTablet.blueprint,
      heroId,
      "viewport",
      "tablet",
    );
    expect(viewportTablet.ok).toBe(true);
    if (!viewportTablet.ok) return;
    expect(sectionHeightModeForBand(viewportTablet.blueprint, section, "tablet")).toBe("viewport");
    expect(sectionCustomHeightForBand(viewportTablet.blueprint, section, "tablet")).toBeNull();
  });

  it("does not clamp Tablet or Mobile custom height to the Original section height", () => {
    const { blueprint, heroId } = twoSections();
    const section = blueprint.nodes[heroId];
    if (!section || section.kind !== "section") throw new Error("section");

    const tablet = setSectionHeightMode(blueprint, heroId, "custom", "tablet", 240);
    expect(tablet.ok).toBe(true);
    if (!tablet.ok) return;
    expect(sectionCustomHeightForBand(tablet.blueprint, section, "tablet")).toBe(240);

    const wide = setSectionHeightMode(blueprint, heroId, "custom", "wide", 240);
    expect(wide.ok).toBe(true);
    if (!wide.ok) return;
    const wideSection = wide.blueprint.nodes[heroId];
    if (!wideSection || wideSection.kind !== "section") throw new Error("section");
    expect(sectionCustomHeightForBand(wide.blueprint, wideSection, "wide")).toBe(400);
  });

  it("keeps the natural responsive height separate from a custom expansion", () => {
    const { page, index, blueprint, heroId } = twoSections();
    const baseline = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
      band: "tablet",
    });
    const baselineRegion = baseline.resolvedLayout?.regions.find(
      (region) => region.sectionId === heroId,
    );
    expect(baselineRegion).toBeTruthy();
    if (!baselineRegion) return;

    const custom = setSectionHeightMode(
      blueprint,
      heroId,
      "custom",
      "tablet",
      baselineRegion.naturalHeight + 120,
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
      (region) => region.sectionId === heroId,
    );
    expect(expandedRegion?.layoutRect.height).toBe(baselineRegion.naturalHeight + 120);
    expect(expandedRegion?.naturalHeight).toBe(baselineRegion.naturalHeight);

    const stations = sectionScrollStationsFromDisplay({
      blueprint: custom.blueprint,
      viewportHeight: 1000,
      band: "tablet",
      regions: expanded.resolvedLayout?.regions,
    });
    expect(stations.find((station) => station.id === heroId)?.naturalHeight).toBe(
      baselineRegion.naturalHeight,
    );
  });

  it("applies tablet viewport height to the live responsive region", () => {
    const { page, index, blueprint, heroId } = twoSections();
    const fitted = setSectionHeightMode(blueprint, heroId, "viewport", "tablet");
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    const resolved = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: fitted.blueprint,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
      viewportHeight: 1000,
      band: "tablet",
    });
    const heroRegion = resolved.resolvedLayout?.regions.find((region) => region.sectionId === heroId);
    expect(heroRegion?.layoutRect.height).toBeGreaterThanOrEqual(1000);
  });

  it("does not double-offset leftover layers when creating a section on tablet", () => {
    const page = makePage([
      makeLayer({ id: "h", type: "rect", x: 0, y: 0, width: 1920, height: 400, fill: "#111" }),
      makeLayer({ id: "b", type: "rect", x: 0, y: 500, width: 1920, height: 400, fill: "#222" }),
    ]);
    const index = buildSiteSelectionIndex(page);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["h"],
      index,
      committedPage: page,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok || !hero.createdNodeId) throw new Error("hero");
    const resolved = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: hero.blueprint,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
    });
    const body = findDisplayObject(resolved.displayPage, "b");
    const heroObj = findDisplayObject(resolved.displayPage, "h");
    expect(body).toBeTruthy();
    expect(heroObj).toBeTruthy();
    const heroBottom = (heroObj?.y ?? 0) + (heroObj?.height ?? 0);
    expect(body!.y).toBeGreaterThanOrEqual(heroBottom - 2);
    expect(body!.y).toBeLessThan(heroBottom + 80);
    expect(resolved.layout.layoutHeight).toBeLessThan((body!.y ?? 0) + (body!.height ?? 0) + 24);
  });

  it("emits 100dvh only inside the tablet band when height is tablet-only", () => {
    const { page, blueprint, heroId } = twoSections();
    const fitted = setSectionHeightMode(blueprint, heroId, "viewport", "tablet");
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    const compiled = compilePublishedSite({
      page,
      blueprint: fitted.blueprint,
      title: "Alto tablet",
      imageHrefByLayerId: {},
    });
    expect(compiled.html).toContain("s-has-vh-secs");
    const wideCss = compiled.css.split("@media")[0] ?? "";
    expect(wideCss).not.toContain("height:100dvh");
    expect(compiled.css).toContain("height:100dvh");
  });
});
