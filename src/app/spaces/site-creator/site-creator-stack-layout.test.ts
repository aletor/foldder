import { beforeEach, describe, expect, it } from "vitest";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { resetSiteBlueprintIdSeqForTests } from "./site-blueprint-ids";
import { createSectionFromSelection } from "./site-blueprint-ops";
import { setResponsiveOverride } from "./site-creator-responsive-overrides";
import { findDisplayObject, resolveSiteCreatorResponsiveDisplay } from "./site-creator-responsive";
import { makeLayer, makePage } from "./site-creator-responsive-fixtures";
import { createEmptySiteBlueprintV1 } from "./site-creator-types";
import { applyNewSectionResponsiveDefaults } from "./site-creator-section-defaults";
import { SITE_CREATOR_MOBILE_WIDTH } from "./site-creator-viewport";
import {
  designedStackInsets,
  preservedStackGapPx,
  measureStackColumn,
} from "./site-creator-stack-layout";

function fixtureBentoGridSection() {
  const gutter = 40;
  const pad = 48;
  const cardW = 400;
  const cardH = 280;
  const panelX = 200;
  const panelY = 200;
  const panelW = pad * 2 + cardW * 2 + gutter;
  const panelH = pad * 2 + cardH * 2 + gutter;
  const x0 = panelX + pad;
  const y0 = panelY + pad;
  const page = makePage([
    makeLayer({
      id: "panel",
      type: "rect",
      x: panelX,
      y: panelY,
      width: panelW,
      height: panelH,
      fill: "#ffffff",
    }),
    makeLayer({ id: "a", type: "rect", x: x0, y: y0, width: cardW, height: cardH, fill: "#222" }),
    makeLayer({
      id: "b",
      type: "rect",
      x: x0 + cardW + gutter,
      y: y0,
      width: cardW,
      height: cardH,
      fill: "#888",
    }),
    makeLayer({
      id: "c",
      type: "rect",
      x: x0,
      y: y0 + cardH + gutter,
      width: cardW,
      height: cardH,
      fill: "#aaa",
    }),
    makeLayer({
      id: "d",
      type: "rect",
      x: x0 + cardW + gutter,
      y: y0 + cardH + gutter,
      width: cardW,
      height: cardH,
      fill: "#bbb",
    }),
  ]);
  const index = buildSiteSelectionIndex(page);
  const created = createSectionFromSelection({
    blueprint: createEmptySiteBlueprintV1(),
    selectedLayerIds: ["panel", "a", "b", "c", "d"],
    index,
    committedPage: page,
    sectionType: "generic",
  });
  if (!created.ok) throw new Error(created.message);
  const blueprint = applyNewSectionResponsiveDefaults(created.blueprint, created.createdNodeId!);
  return { page, blueprint, sectionId: created.createdNodeId!, gutter, cardW, cardH, x0, y0, pad, panelX, panelW };
}

describe("stack layout preserves designed gutters", () => {
  beforeEach(() => {
    resetSiteBlueprintIdSeqForTests();
  });

  it("uses horizontal gutter when stacking same-row cards", () => {
    const gutter = 40;
    const scale = 0.5;
    const card = { x: 0, y: 0, width: 200, height: 100 };
    const next = { x: 240, y: 0, width: 200, height: 100 };
    expect(preservedStackGapPx(card, next, scale, 16)).toBeCloseTo(gutter * scale, 2);
  });

  it("reads designed padding from parent to content union", () => {
    const parent = { x: 100, y: 50, width: 800, height: 600 };
    const content = { x: 140, y: 90, width: 720, height: 500 };
    expect(designedStackInsets(parent, content)).toEqual({
      left: 40,
      right: 40,
      top: 40,
      bottom: 60,
    });
  });

  it("measureStackColumn keeps parent padding inside contentWidth", () => {
    const parent = { x: 200, y: 200, width: 1000, height: 800 };
    const units = [
      { bounds: { x: 240, y: 240, width: 400, height: 200 } },
      { bounds: { x: 680, y: 240, width: 480, height: 200 } },
    ];
    const m = measureStackColumn({
      units,
      contentWidth: 390,
      fallbackGap: 16,
      parentBounds: parent,
    });
    expect(m.insets.left).toBeCloseTo(40 * (390 / 1000), 1);
    expect(m.insets.right).toBeCloseTo(40 * (390 / 1000), 1);
    expect(m.inner.width).toBeCloseTo(390 - m.insets.left - m.insets.right, 1);
    expect(m.gaps[0]).toBeGreaterThan(10);
  });

  it("keeps vertical gaps between stacked section clusters on mobile", () => {
    const fx = fixtureBentoGridSection();
    const index = buildSiteSelectionIndex(fx.page);
    const stacked = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.sectionId },
      band: "mobile",
      mode: "stack",
    }).blueprint;
    const mobile = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: stacked,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
      band: "mobile",
    });
    const panel = findDisplayObject(mobile.displayPage, "panel")!;
    const a = findDisplayObject(mobile.displayPage, "a")!;
    const b = findDisplayObject(mobile.displayPage, "b")!;
    const c = findDisplayObject(mobile.displayPage, "c")!;
    const parentScale = panel.width / fx.panelW;
    const expectedPad = fx.pad * parentScale;
    expect(a.x - panel.x).toBeGreaterThanOrEqual(expectedPad * 0.75);
    expect(panel.x + panel.width - (a.x + a.width)).toBeGreaterThanOrEqual(expectedPad * 0.75);
    expect(b.y - (a.y + a.height)).toBeGreaterThanOrEqual(fx.gutter * parentScale * 0.75);
    expect(c.y - (b.y + b.height)).toBeGreaterThanOrEqual(fx.gutter * parentScale * 0.75);
    expect(a.x).toBeCloseTo(b.x, 0);
  });

  it("does not shift hero section horizontal position when bento section stacks", () => {
    const gutter = 40;
    const cardW = 400;
    const cardH = 280;
    const page = makePage([
      makeLayer({
        id: "hero_bg",
        type: "rect",
        x: 0,
        y: 0,
        width: 1920,
        height: 400,
        fill: "#eee",
      }),
      makeLayer({
        id: "hero_title",
        type: "text",
        x: 120,
        y: 120,
        width: 600,
        height: 80,
        text: "Name",
        fontSize: 64,
      }),
      makeLayer({ id: "a", type: "rect", x: 120, y: 560, width: cardW, height: cardH, fill: "#222" }),
      makeLayer({
        id: "b",
        type: "rect",
        x: 120 + cardW + gutter,
        y: 560,
        width: cardW,
        height: cardH,
        fill: "#888",
      }),
    ]);
    const index = buildSiteSelectionIndex(page);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["hero_bg", "hero_title"],
      index,
      committedPage: page,
      sectionType: "hero",
    });
    if (!hero.ok) throw new Error(hero.message);
    const bento = createSectionFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["a", "b"],
      index,
      committedPage: page,
      sectionType: "generic",
    });
    if (!bento.ok) throw new Error(bento.message);
    let bp = applyNewSectionResponsiveDefaults(bento.blueprint, bento.createdNodeId!);
    const preserve = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: bp,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
      band: "mobile",
    });
    bp = setResponsiveOverride({
      blueprint: bp,
      target: { kind: "blueprintNode", nodeId: bento.createdNodeId! },
      band: "mobile",
      mode: "stack",
    }).blueprint;
    const stacked = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: bp,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
      band: "mobile",
    });
    const titleBefore = findDisplayObject(preserve.displayPage, "hero_title")!;
    const titleAfter = findDisplayObject(stacked.displayPage, "hero_title")!;
    expect(titleAfter.x).toBeCloseTo(titleBefore.x, 0);
    expect(titleAfter.width).toBeCloseTo(titleBefore.width, 0);
  });

  it("stretches section panel background to the stacked content frame", () => {
    const page = makePage([
      makeLayer({
        id: "hero_bg",
        type: "rect",
        x: 80,
        y: 40,
        width: 1760,
        height: 400,
        fill: "#222",
      }),
      makeLayer({
        id: "hero_title",
        type: "text",
        x: 160,
        y: 160,
        width: 600,
        height: 80,
        text: "Name",
        fontSize: 64,
      }),
      makeLayer({
        id: "panel",
        type: "rect",
        x: 280,
        y: 520,
        width: 1360,
        height: 700,
        fill: "#fff",
      }),
      makeLayer({ id: "card", type: "rect", x: 320, y: 560, width: 560, height: 300, fill: "#111" }),
      makeLayer({ id: "photo", type: "rect", x: 920, y: 560, width: 680, height: 300, fill: "#888" }),
    ]);
    const index = buildSiteSelectionIndex(page);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["hero_bg", "hero_title"],
      index,
      committedPage: page,
      sectionType: "hero",
    });
    if (!hero.ok) throw new Error(hero.message);
    const bento = createSectionFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["panel", "card", "photo"],
      index,
      committedPage: page,
      sectionType: "generic",
    });
    if (!bento.ok) throw new Error(bento.message);
    let bp = applyNewSectionResponsiveDefaults(bento.blueprint, bento.createdNodeId!);
    bp = applyNewSectionResponsiveDefaults(bp, hero.createdNodeId!);
    const preserve = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: bp,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
      band: "mobile",
    });
    bp = setResponsiveOverride({
      blueprint: bp,
      target: { kind: "blueprintNode", nodeId: bento.createdNodeId! },
      band: "mobile",
      mode: "stack",
    }).blueprint;
    const stacked = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: bp,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
      band: "mobile",
    });

    const heroBefore = findDisplayObject(preserve.displayPage, "hero_bg")!;
    const heroAfter = findDisplayObject(stacked.displayPage, "hero_bg")!;
    expect(heroAfter.x).toBeCloseTo(heroBefore.x, 0);
    expect(heroAfter.width).toBeCloseTo(heroBefore.width, 0);

    const panel = findDisplayObject(stacked.displayPage, "panel")!;
    const card = findDisplayObject(stacked.displayPage, "card")!;
    const photo = findDisplayObject(stacked.displayPage, "photo")!;
    expect(panel.width).toBeGreaterThanOrEqual(card.width - 1);
    expect(panel.x).toBeLessThanOrEqual(card.x + 1);
    expect(panel.x + panel.width).toBeGreaterThanOrEqual(card.x + card.width - 1);
    expect(card.width).toBeCloseTo(photo.width, 0);
    // Apilar no ensancha más que el footprint de Composition de esa sección.
    const panelPreserve = findDisplayObject(preserve.displayPage, "panel")!;
    expect(card.width).toBeLessThanOrEqual(panelPreserve.width + 8);
  });
});
