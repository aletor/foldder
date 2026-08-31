import { describe, expect, it } from "vitest";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { designerGroupMirrorNodeId, reconcileDesignerGroupMirrors } from "./site-creator-designer-group-bootstrap";
import { applyLayoutGroupWidthModes } from "./site-creator-group-width-layout";
import { createLayoutGroupFromSelection, createSectionFromSelection, setLayoutGroupWidthMode } from "./site-blueprint-ops";
import { compilePublishedSite } from "./site-creator-publish-compile";
import { buildPublishForest, toLocalBox } from "./site-creator-publish-tree";
import { resolveSiteCreatorResponsiveDisplay } from "./site-creator-responsive";
import { patchContainerTune } from "./site-creator-responsive-tunes";
import { createEmptySiteBlueprintV1 } from "./site-creator-types";
import { makeLayer, makePage } from "./site-creator-responsive-fixtures";
import { SITE_CREATOR_MOBILE_WIDTH, SITE_CREATOR_TABLET_WIDTH } from "./site-creator-viewport";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";

function groupContainer(partial: {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  children: FreehandObject[];
}): FreehandObject {
  return {
    ...makeLayer({
      id: partial.id,
      type: "groupContainer",
      x: partial.x,
      y: partial.y,
      width: partial.width,
      height: partial.height,
    }),
    children: partial.children,
  } as FreehandObject;
}

function twoCardsPage() {
  const left = groupContainer({
    id: "left",
    x: 80,
    y: 100,
    width: 400,
    height: 220,
    children: [
      makeLayer({ id: "l1", type: "rect", x: 80, y: 100, width: 180, height: 220, fill: "#111" }),
      makeLayer({ id: "l2", type: "text", x: 280, y: 140, width: 180, height: 60, text: "A" }),
    ],
  });
  const right = groupContainer({
    id: "right",
    x: 560,
    y: 100,
    width: 400,
    height: 220,
    children: [
      makeLayer({ id: "r1", type: "rect", x: 560, y: 100, width: 400, height: 220, fill: "#222" }),
    ],
  });
  return makePage([left, right]);
}

function mirroredBlueprint(page: ReturnType<typeof makePage>) {
  const index = buildSiteSelectionIndex(page);
  return reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
}

describe("site-creator group html containers", () => {
  it("emits a wrapper div per Designer group with local child coordinates", () => {
    const page = twoCardsPage();
    const compiled = compilePublishedSite({
      page,
      blueprint: mirroredBlueprint(page),
      title: "Grupos",
      imageHrefByLayerId: {},
    });
    expect(compiled.html).toContain('data-group="left"');
    expect(compiled.html).toContain('data-group="right"');
    expect(compiled.html).toContain("s-group-left");
    expect(compiled.html.indexOf("s-group-left")).toBeLessThan(compiled.html.indexOf("s-el-l1"));
    expect(compiled.css).toContain(".s-group{container-type:inline-size");
    expect(compiled.css).toContain(".s-group-left{");

    const forest = buildPublishForest({
      objectsByBand: { wide: page.objects ?? [], tablet: page.objects ?? [], mobile: page.objects ?? [] },
      blueprint: mirroredBlueprint(page),
      index: buildSiteSelectionIndex(page),
      pageRect: { x: 0, y: 0, width: 1920, height: 1080 },
    });
    const left = forest.children.find((n) => n.kind === "group" && n.id === "left")
      ?? forest.children.flatMap((n) => (n.kind === "row" ? n.children : [])).find((n) => n.kind === "group" && n.id === "left");
    expect(left?.kind).toBe("group");
    if (left?.kind !== "group") return;
    const child = left.children.find((c) => c.kind === "layer" && c.id === "l1");
    expect(child?.kind).toBe("layer");
    if (child?.kind !== "layer" || !left.world.wide || !child.world.wide) return;
    const local = toLocalBox(child.world.wide, left.world.wide);
    expect(local.x).toBeCloseTo(0);
    expect(local.y).toBeCloseTo(0);
  });

  it("marks a full-width group and keeps siblings in a wrapping row", () => {
    const page = twoCardsPage();
    const mirrored = mirroredBlueprint(page);
    const leftId = designerGroupMirrorNodeId("left");
    const result = setLayoutGroupWidthMode(mirrored, leftId, "full");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const compiled = compilePublishedSite({
      page,
      blueprint: result.blueprint,
      title: "Full",
      imageHrefByLayerId: {},
    });
    expect(compiled.html).toContain("s-group-left s-full");
    expect(compiled.html).toContain("s-row-full");
    expect(compiled.html).toContain("s-flow-item");
    expect(compiled.html.indexOf("s-group-left")).toBeLessThan(compiled.html.indexOf("s-group-right"));
    expect(compiled.css).toContain(".s-row>.s-flow-item{position:relative");
    expect(compiled.css).toContain("left:auto;top:auto");
    expect(compiled.css).toMatch(/\.s-group-left\{[^}]*width:100%/);
  });

  it("expands a full-width group in canvas preview and pushes the same-row sibling below", () => {
    const page = twoCardsPage();
    const mirrored = mirroredBlueprint(page);
    const leftId = designerGroupMirrorNodeId("left");
    const result = setLayoutGroupWidthMode(mirrored, leftId, "full");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const index = buildSiteSelectionIndex(page);
    const laidOut = applyLayoutGroupWidthModes({
      page,
      blueprint: result.blueprint,
      index,
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    const left = laidOut.page.objects?.find((o) => o.id === "left");
    const right = laidOut.page.objects?.find((o) => o.id === "right");
    expect(left?.width).toBeGreaterThan(1500);
    expect(right?.y).toBeGreaterThan((left?.y ?? 0) + (left?.height ?? 0) - 1);
    expect(right?.width).toBeGreaterThan(1500);
    expect(right?.x ?? 0).toBeLessThan(40);
    expect(JSON.stringify(page.objects)).not.toContain('"width":1920');
  });

  it("moves free layers on the same visual row below, keeping their x", () => {
    const page = makePage([
      groupContainer({
        id: "card",
        x: 80,
        y: 100,
        width: 400,
        height: 220,
        children: [makeLayer({ id: "c1", type: "rect", x: 80, y: 100, width: 400, height: 220 })],
      }),
      makeLayer({ id: "side", type: "text", x: 560, y: 120, width: 300, height: 80, text: "Hola" }),
    ]);
    const mirrored = mirroredBlueprint(page);
    const cardId = designerGroupMirrorNodeId("card");
    const result = setLayoutGroupWidthMode(mirrored, cardId, "full");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const laidOut = applyLayoutGroupWidthModes({
      page,
      blueprint: result.blueprint,
      index: buildSiteSelectionIndex(page),
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    const card = laidOut.page.objects?.find((o) => o.id === "card");
    const side = laidOut.page.objects?.find((o) => o.id === "side");
    expect(card?.width).toBeGreaterThan(1500);
    expect(side?.y).toBeGreaterThan((card?.y ?? 0) + (card?.height ?? 0));
    expect(side?.x).toBeCloseTo(560, 0);
  });

  it("keeps several side units on one lower row instead of stacking them", () => {
    const page = makePage([
      groupContainer({
        id: "card",
        x: 40,
        y: 80,
        width: 360,
        height: 200,
        children: [makeLayer({ id: "c1", type: "rect", x: 40, y: 80, width: 360, height: 200 })],
      }),
      groupContainer({
        id: "mid",
        x: 440,
        y: 90,
        width: 280,
        height: 180,
        children: [makeLayer({ id: "m1", type: "rect", x: 440, y: 90, width: 280, height: 180 })],
      }),
      makeLayer({ id: "side", type: "text", x: 760, y: 100, width: 200, height: 60, text: "X" }),
    ]);
    const mirrored = mirroredBlueprint(page);
    const cardId = designerGroupMirrorNodeId("card");
    const result = setLayoutGroupWidthMode(mirrored, cardId, "full");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const laidOut = applyLayoutGroupWidthModes({
      page,
      blueprint: result.blueprint,
      index: buildSiteSelectionIndex(page),
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    const card = laidOut.page.objects?.find((o) => o.id === "card");
    const mid = laidOut.page.objects?.find((o) => o.id === "mid");
    const side = laidOut.page.objects?.find((o) => o.id === "side");
    const bottom = (card?.y ?? 0) + (card?.height ?? 0);
    expect(mid?.y).toBeGreaterThan(bottom);
    expect(side?.y).toBeGreaterThan(bottom);
    expect(Math.abs((mid?.y ?? 0) - (side?.y ?? 0))).toBeLessThan(40);
    expect((mid?.x ?? 0) < (side?.x ?? 0)).toBe(true);
    expect((side?.x ?? 0) + (side?.width ?? 0) - (mid?.x ?? 0)).toBeGreaterThan(1400);
  });

  it("stacks two full-width groups on separate rows instead of overlapping", () => {
    const page = twoCardsPage();
    const mirrored = mirroredBlueprint(page);
    const leftId = designerGroupMirrorNodeId("left");
    const rightId = designerGroupMirrorNodeId("right");
    const leftFull = setLayoutGroupWidthMode(mirrored, leftId, "full");
    expect(leftFull.ok).toBe(true);
    if (!leftFull.ok) return;
    const both = setLayoutGroupWidthMode(leftFull.blueprint, rightId, "full");
    expect(both.ok).toBe(true);
    if (!both.ok) return;
    const laidOut = applyLayoutGroupWidthModes({
      page,
      blueprint: both.blueprint,
      index: buildSiteSelectionIndex(page),
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    const left = laidOut.page.objects?.find((o) => o.id === "left");
    const right = laidOut.page.objects?.find((o) => o.id === "right");
    expect(left?.width).toBeGreaterThan(1500);
    expect(right?.width).toBeGreaterThan(1500);
    expect(right?.y).toBeGreaterThan((left?.y ?? 0) + (left?.height ?? 0) - 1);
    expect((right?.y ?? 0) + (right?.height ?? 0)).toBeGreaterThan((left?.y ?? 0) + (left?.height ?? 0));
  });

  it("stacks two tablet Ancho completo groups on separate rows", () => {
    const page = twoCardsPage();
    const mirrored = mirroredBlueprint(page);
    const leftId = designerGroupMirrorNodeId("left");
    const rightId = designerGroupMirrorNodeId("right");
    let bp = patchContainerTune({
      blueprint: mirrored,
      target: { kind: "blueprintNode", nodeId: leftId },
      band: "tablet",
      patch: { contentWidthMode: "full" },
    }).blueprint;
    bp = patchContainerTune({
      blueprint: bp,
      target: { kind: "blueprintNode", nodeId: rightId },
      band: "tablet",
      patch: { contentWidthMode: "full" },
    }).blueprint;
    const index = buildSiteSelectionIndex(page);
    const tabletResolved = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: bp,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
    });
    const left = tabletResolved.displayPage.objects?.find((o) => o.id === "left");
    const right = tabletResolved.displayPage.objects?.find((o) => o.id === "right");
    expect(left?.width).toBeGreaterThan(SITE_CREATOR_TABLET_WIDTH * 0.85);
    expect(right?.width).toBeGreaterThan(SITE_CREATOR_TABLET_WIDTH * 0.85);
    expect(right?.y).toBeGreaterThan((left?.y ?? 0) + (left?.height ?? 0) - 1);
  });

  it("stacks two mobile Ancho completo groups in original left-to-right order", () => {
    const page = twoCardsPage();
    const mirrored = mirroredBlueprint(page);
    const leftId = designerGroupMirrorNodeId("left");
    const rightId = designerGroupMirrorNodeId("right");
    let bp = patchContainerTune({
      blueprint: mirrored,
      target: { kind: "blueprintNode", nodeId: leftId },
      band: "mobile",
      patch: { contentWidthMode: "full" },
    }).blueprint;
    bp = patchContainerTune({
      blueprint: bp,
      target: { kind: "blueprintNode", nodeId: rightId },
      band: "mobile",
      patch: { contentWidthMode: "full" },
    }).blueprint;
    const mobileResolved = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: bp,
      referenceIndex: buildSiteSelectionIndex(page),
      viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
    });
    const left = mobileResolved.displayPage.objects?.find((o) => o.id === "left");
    const right = mobileResolved.displayPage.objects?.find((o) => o.id === "right");
    expect(left?.width).toBeGreaterThan(SITE_CREATOR_MOBILE_WIDTH * 0.85);
    expect(right?.width).toBeGreaterThan(SITE_CREATOR_MOBILE_WIDTH * 0.85);
    expect(right?.y).toBeGreaterThan((left?.y ?? 0) + (left?.height ?? 0) - 1);
  });

  it("keeps original left group on top when the display already swapped their y", () => {
    const sourcePage = twoCardsPage();
    const page = twoCardsPage();
    const right = page.objects?.find((o) => o.id === "right");
    expect(right).toBeTruthy();
    const shiftTree = (obj: FreehandObject, dy: number) => {
      obj.y += dy;
      const children = (obj as { children?: FreehandObject[] }).children;
      if (children) for (const child of children) shiftTree(child, dy);
    };
    shiftTree(right!, -120);
    const mirrored = mirroredBlueprint(sourcePage);
    const leftId = designerGroupMirrorNodeId("left");
    const rightId = designerGroupMirrorNodeId("right");
    let bp = patchContainerTune({
      blueprint: mirrored,
      target: { kind: "blueprintNode", nodeId: leftId },
      band: "mobile",
      patch: { contentWidthMode: "full" },
    }).blueprint;
    bp = patchContainerTune({
      blueprint: bp,
      target: { kind: "blueprintNode", nodeId: rightId },
      band: "mobile",
      patch: { contentWidthMode: "full" },
    }).blueprint;
    const laidOut = applyLayoutGroupWidthModes({
      page,
      blueprint: bp,
      index: buildSiteSelectionIndex(sourcePage),
      viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
      viewportHeight: 844,
      band: "mobile",
    });
    const left = laidOut.page.objects?.find((o) => o.id === "left");
    const rightAfter = laidOut.page.objects?.find((o) => o.id === "right");
    expect(rightAfter?.y).toBeGreaterThan((left?.y ?? 0) + (left?.height ?? 0) - 1);
  });

  it("keeps internal padding and child size when stretching a group to full width", () => {
    const page = makePage([
      groupContainer({
        id: "card",
        x: 80,
        y: 100,
        width: 400,
        height: 220,
        children: [
          makeLayer({ id: "bg", type: "rect", x: 80, y: 100, width: 400, height: 220, fill: "#0f0" }),
          makeLayer({ id: "t", type: "text", x: 104, y: 124, width: 200, height: 40, text: "HOLAAAAA" }),
          makeLayer({ id: "a", type: "rect", x: 104, y: 180, width: 160, height: 100, fill: "#80f" }),
          makeLayer({ id: "b", type: "rect", x: 280, y: 180, width: 160, height: 100, fill: "#80f" }),
        ],
      }),
    ]);
    const mirrored = mirroredBlueprint(page);
    const cardId = designerGroupMirrorNodeId("card");
    const full = setLayoutGroupWidthMode(mirrored, cardId, "full");
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    const laidOut = applyLayoutGroupWidthModes({
      page,
      blueprint: full.blueprint,
      index: buildSiteSelectionIndex(page),
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    const children = (laidOut.page.objects?.find((o) => o.id === "card") as { children?: FreehandObject[] } | undefined)
      ?.children ?? [];
    const bg = children.find((o) => o.id === "bg");
    const text = children.find((o) => o.id === "t");
    const boxA = children.find((o) => o.id === "a");
    expect(bg?.width).toBeGreaterThan(1500);
    expect((text?.x ?? 0) - (bg?.x ?? 0)).toBeCloseTo(24, 0);
    expect((text?.y ?? 0) - (bg?.y ?? 0)).toBeCloseTo(24, 0);
    expect(text?.width).toBeCloseTo(200, 0);
    expect(boxA?.width).toBeCloseTo(160, 0);
  });

  it("restores natural width when switching back to content", () => {
    const page = twoCardsPage();
    const mirrored = mirroredBlueprint(page);
    const leftId = designerGroupMirrorNodeId("left");
    const full = setLayoutGroupWidthMode(mirrored, leftId, "full");
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    const natural = setLayoutGroupWidthMode(full.blueprint, leftId, "content");
    expect(natural.ok).toBe(true);
    if (!natural.ok) return;
    expect(natural.blueprint.nodes[leftId]?.kind === "layoutGroup" && natural.blueprint.nodes[leftId].widthMode).toBeUndefined();
    const laidOut = applyLayoutGroupWidthModes({
      page,
      blueprint: natural.blueprint,
      index: buildSiteSelectionIndex(page),
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    expect(laidOut.page).toBe(page);
  });

  it("wraps the sibling on tablet when Ancho completo is set on the group tune, not on Original", () => {
    const page = twoCardsPage();
    const mirrored = mirroredBlueprint(page);
    const leftId = designerGroupMirrorNodeId("left");
    const withTune = patchContainerTune({
      blueprint: mirrored,
      target: { kind: "blueprintNode", nodeId: leftId },
      band: "tablet",
      patch: { contentWidthMode: "full" },
    }).blueprint;
    const index = buildSiteSelectionIndex(page);

    const original = applyLayoutGroupWidthModes({
      page,
      blueprint: withTune,
      index,
      viewportWidth: 1920,
      viewportHeight: 1080,
      band: "wide",
    });
    expect(original.page.objects?.find((o) => o.id === "left")?.width).toBeCloseTo(400);
    expect(original.page.objects?.find((o) => o.id === "right")?.y).toBeCloseTo(100);

    const tabletResolved = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: withTune,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
    });
    const tablet = applyLayoutGroupWidthModes({
      page: tabletResolved.displayPage,
      blueprint: withTune,
      index,
      viewportWidth: tabletResolved.layout.layoutWidth,
      viewportHeight: tabletResolved.layout.layoutHeight,
      band: tabletResolved.band,
    });
    const left = tablet.page.objects?.find((o) => o.id === "left");
    const right = tablet.page.objects?.find((o) => o.id === "right");
    expect(left?.width).toBeGreaterThan(SITE_CREATOR_TABLET_WIDTH * 0.9);
    expect(right?.y).toBeGreaterThan((left?.y ?? 0) + (left?.height ?? 0) - 1);

    const compiled = compilePublishedSite({
      page,
      blueprint: withTune,
      title: "Tablet full",
      imageHrefByLayerId: {},
    });
    expect(compiled.html).not.toContain("s-group-left s-full");
    const tabletCss = compiled.css.split("@media")[1] ?? "";
    expect(tabletCss).toMatch(/\.s-group-left\{[^}]*width:100%/);
    const wideCss = compiled.css.split("@media")[0] ?? "";
    expect(wideCss).not.toMatch(/\.s-group-left\{[^}]*width:100%/);
  });

  it("does not inherit Original full width onto tablet", () => {
    const page = twoCardsPage();
    const mirrored = mirroredBlueprint(page);
    const leftId = designerGroupMirrorNodeId("left");
    const full = setLayoutGroupWidthMode(mirrored, leftId, "full");
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    const index = buildSiteSelectionIndex(page);
    const tablet = applyLayoutGroupWidthModes({
      page,
      blueprint: full.blueprint,
      index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
      viewportHeight: 1080,
      band: "tablet",
    });
    expect(tablet.page.objects?.find((o) => o.id === "left")?.width).toBeCloseTo(400);
    expect(tablet.page.objects?.find((o) => o.id === "right")?.y).toBeCloseTo(100);
  });

  it("wraps an ungrouped sibling card as one row when only the left group is full width", () => {
    const page = makePage([
      groupContainer({
        id: "left",
        x: 40,
        y: 80,
        width: 900,
        height: 520,
        children: [
          makeLayer({ id: "lbg", type: "rect", x: 40, y: 80, width: 900, height: 520, fill: "#80f" }),
          makeLayer({ id: "lt", type: "text", x: 60, y: 100, width: 300, height: 60, text: "HOLAAAAA" }),
        ],
      }),
      makeLayer({ id: "rbg", type: "rect", x: 980, y: 80, width: 900, height: 520, fill: "#0f0" }),
      makeLayer({ id: "rt", type: "text", x: 1000, y: 100, width: 300, height: 60, text: "HOLAAAAA" }),
      makeLayer({ id: "rp1", type: "rect", x: 1000, y: 200, width: 400, height: 300, fill: "#80f" }),
      makeLayer({ id: "rp2", type: "rect", x: 1440, y: 200, width: 400, height: 300, fill: "#80f" }),
    ]);
    const mirrored = mirroredBlueprint(page);
    const leftId = designerGroupMirrorNodeId("left");
    const withTune = patchContainerTune({
      blueprint: mirrored,
      target: { kind: "blueprintNode", nodeId: leftId },
      band: "tablet",
      patch: { contentWidthMode: "full" },
    }).blueprint;
    const index = buildSiteSelectionIndex(page);
    const tabletResolved = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: withTune,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
    });
    const tablet = applyLayoutGroupWidthModes({
      page: tabletResolved.displayPage,
      blueprint: withTune,
      index,
      viewportWidth: tabletResolved.layout.layoutWidth,
      viewportHeight: tabletResolved.layout.layoutHeight,
      band: tabletResolved.band,
    });
    const left = tablet.page.objects?.find((o) => o.id === "left");
    const rbg = tablet.page.objects?.find((o) => o.id === "rbg");
    const rt = tablet.page.objects?.find((o) => o.id === "rt");
    const rp1 = tablet.page.objects?.find((o) => o.id === "rp1");
    const leftBottom = (left?.y ?? 0) + (left?.height ?? 0);
    expect(left?.width).toBeGreaterThan(SITE_CREATOR_TABLET_WIDTH * 0.85);
    expect(rbg?.y).toBeGreaterThan(leftBottom - 1);
    expect(rt?.y).toBeGreaterThan(leftBottom - 1);
    expect(rp1?.y).toBeGreaterThan(leftBottom - 1);
    expect(Math.abs((rbg?.y ?? 0) - (rt?.y ?? 0))).toBeLessThan(80);
    expect(rbg?.width).toBeGreaterThan(SITE_CREATOR_TABLET_WIDTH * 0.7);
  });

  it("wraps ungrouped siblings when the group was created with Agrupar, not a Designer folder", () => {
    const page = makePage([
      makeLayer({ id: "lbg", type: "rect", x: 40, y: 80, width: 900, height: 520, fill: "#80f" }),
      makeLayer({ id: "lt", type: "text", x: 60, y: 100, width: 300, height: 60, text: "HOLAAAAA" }),
      makeLayer({ id: "lg1", type: "rect", x: 60, y: 200, width: 400, height: 300, fill: "#0f0" }),
      makeLayer({ id: "lg2", type: "rect", x: 500, y: 200, width: 400, height: 300, fill: "#0f0" }),
      makeLayer({ id: "rbg", type: "rect", x: 980, y: 80, width: 900, height: 520, fill: "#0f0" }),
      makeLayer({ id: "rt", type: "text", x: 1000, y: 100, width: 300, height: 60, text: "HOLAAAAA" }),
      makeLayer({ id: "rp1", type: "rect", x: 1000, y: 200, width: 400, height: 300, fill: "#80f" }),
      makeLayer({ id: "rp2", type: "rect", x: 1440, y: 200, width: 400, height: 300, fill: "#80f" }),
    ]);
    const index = buildSiteSelectionIndex(page);
    const grouped = createLayoutGroupFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["lbg", "lt", "lg1", "lg2"],
      index,
    });
    expect(grouped.ok).toBe(true);
    if (!grouped.ok) return;
    const groupId = grouped.createdNodeId!;
    const withTune = patchContainerTune({
      blueprint: grouped.blueprint,
      target: { kind: "blueprintNode", nodeId: groupId },
      band: "tablet",
      patch: { contentWidthMode: "full" },
    }).blueprint;
    const tabletW = 820;
    const tabletResolved = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: withTune,
      referenceIndex: index,
      viewportWidth: tabletW,
    });
    const tablet = applyLayoutGroupWidthModes({
      page: tabletResolved.displayPage,
      blueprint: withTune,
      index,
      viewportWidth: tabletResolved.layout.layoutWidth,
      viewportHeight: tabletResolved.layout.layoutHeight,
      band: tabletResolved.band,
    });
    const lbg = tablet.page.objects?.find((o) => o.id === "lbg");
    const rbg = tablet.page.objects?.find((o) => o.id === "rbg");
    const rt = tablet.page.objects?.find((o) => o.id === "rt");
    const rp1 = tablet.page.objects?.find((o) => o.id === "rp1");
    const leftBottom = (lbg?.y ?? 0) + (lbg?.height ?? 0);
    expect(tabletResolved.band).toBe("tablet");
    expect(lbg?.width).toBeGreaterThan(tabletW * 0.85);
    expect(rbg?.y).toBeGreaterThan(leftBottom - 1);
    expect(rt?.y).toBeGreaterThan(leftBottom - 1);
    expect(rp1?.y).toBeGreaterThan(leftBottom - 1);
    expect(Math.abs((rbg?.y ?? 0) - (rt?.y ?? 0))).toBeLessThan(80);
  });

  it("pushes section-owned loose layers and a thin rule below a nested full-width group", () => {
    const page = makePage([
      makeLayer({ id: "secbg", type: "rect", x: 0, y: 80, width: 1920, height: 520, fill: "#887" }),
      makeLayer({ id: "lbg", type: "rect", x: 40, y: 100, width: 720, height: 400, fill: "#0a0" }),
      makeLayer({ id: "lt", type: "text", x: 60, y: 120, width: 400, height: 80, text: "LEFT" }),
      makeLayer({ id: "rt", type: "text", x: 980, y: 110, width: 400, height: 80, text: "RIGHT" }),
      makeLayer({ id: "rimg", type: "rect", x: 980, y: 200, width: 400, height: 280, fill: "#ccc" }),
      makeLayer({ id: "rline", type: "rect", x: 980, y: 490, width: 400, height: 2, fill: "#fff" }),
    ]);
    const index = buildSiteSelectionIndex(page);
    const grouped = createLayoutGroupFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["lbg", "lt"],
      index,
    });
    expect(grouped.ok).toBe(true);
    if (!grouped.ok) return;
    const section = createSectionFromSelection({
      blueprint: grouped.blueprint,
      selectedLayerIds: ["secbg", "lbg", "lt", "rt", "rimg", "rline"],
      index,
      committedPage: page,
      sectionType: "generic",
    });
    expect(section.ok).toBe(true);
    if (!section.ok) return;
    const full = setLayoutGroupWidthMode(section.blueprint, grouped.createdNodeId!, "full");
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    const laidOut = applyLayoutGroupWidthModes({
      page,
      blueprint: full.blueprint,
      index,
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    const lbg = laidOut.page.objects?.find((o) => o.id === "lbg");
    const rt = laidOut.page.objects?.find((o) => o.id === "rt");
    const rimg = laidOut.page.objects?.find((o) => o.id === "rimg");
    const rline = laidOut.page.objects?.find((o) => o.id === "rline");
    const leftBottom = (lbg?.y ?? 0) + (lbg?.height ?? 0);
    expect(lbg?.width).toBeGreaterThan(1500);
    expect(rt?.y).toBeGreaterThan(leftBottom - 1);
    expect(rimg?.y).toBeGreaterThan(leftBottom - 1);
    expect(rline?.y).toBeGreaterThan(leftBottom - 1);
  });

  it("does not swallow a side-by-side column that only touches the group edge", () => {
    const page = makePage([
      groupContainer({
        id: "left",
        x: 40,
        y: 80,
        width: 900,
        height: 400,
        children: [makeLayer({ id: "l1", type: "rect", x: 40, y: 80, width: 900, height: 400 })],
      }),
      makeLayer({ id: "rimg", type: "rect", x: 930, y: 90, width: 420, height: 360, fill: "#ccc" }),
    ]);
    const mirrored = mirroredBlueprint(page);
    const leftId = designerGroupMirrorNodeId("left");
    const full = setLayoutGroupWidthMode(mirrored, leftId, "full");
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    const laidOut = applyLayoutGroupWidthModes({
      page,
      blueprint: full.blueprint,
      index: buildSiteSelectionIndex(page),
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    const left = laidOut.page.objects?.find((o) => o.id === "left");
    const rimg = laidOut.page.objects?.find((o) => o.id === "rimg");
    expect(left?.width).toBeGreaterThan(1500);
    expect(rimg?.y).toBeGreaterThan((left?.y ?? 0) + (left?.height ?? 0) - 1);
  });

  it("pushes the next visual row down when leftovers occupy that band", () => {
    const page = makePage([
      groupContainer({
        id: "left",
        x: 40,
        y: 80,
        width: 400,
        height: 200,
        children: [makeLayer({ id: "l1", type: "rect", x: 40, y: 80, width: 400, height: 200 })],
      }),
      groupContainer({
        id: "right",
        x: 480,
        y: 80,
        width: 400,
        height: 200,
        children: [makeLayer({ id: "r1", type: "rect", x: 480, y: 80, width: 400, height: 200 })],
      }),
      makeLayer({ id: "below", type: "rect", x: 40, y: 300, width: 800, height: 120, fill: "#333" }),
    ]);
    const mirrored = mirroredBlueprint(page);
    const leftId = designerGroupMirrorNodeId("left");
    const full = setLayoutGroupWidthMode(mirrored, leftId, "full");
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    const laidOut = applyLayoutGroupWidthModes({
      page,
      blueprint: full.blueprint,
      index: buildSiteSelectionIndex(page),
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    const left = laidOut.page.objects?.find((o) => o.id === "left");
    const right = laidOut.page.objects?.find((o) => o.id === "right");
    const below = laidOut.page.objects?.find((o) => o.id === "below");
    const rightBottom = (right?.y ?? 0) + (right?.height ?? 0);
    expect(right?.y).toBeGreaterThan((left?.y ?? 0) + (left?.height ?? 0) - 1);
    expect(below?.y).toBeGreaterThan(rightBottom - 1);
  });
});
