import { describe, expect, it } from "vitest";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { designerGroupMirrorNodeId, reconcileDesignerGroupMirrors } from "./site-creator-designer-group-bootstrap";
import {
  applyGroupFitToContainer,
  describeGroupFitOpportunity,
} from "./site-creator-group-fit";
import { applyLayoutGroupWidthModes } from "./site-creator-group-width-layout";
import { createLayoutGroupFromSelection, wrapSemanticNodesInGroup } from "./site-blueprint-ops";
import { resolveContainerTune } from "./site-creator-responsive-tunes";
import { createEmptySiteBlueprintV1, isSiteSectionNode } from "./site-creator-types";
import { makeLayer, makePage } from "./site-creator-responsive-fixtures";
import { SITE_CREATOR_TABLET_WIDTH } from "./site-creator-viewport";

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

function clippingImage(partial: {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}): FreehandObject {
  return {
    ...makeLayer({
      id: partial.id,
      type: "clippingContainer",
      x: partial.x,
      y: partial.y,
      width: partial.width,
      height: partial.height,
    }),
    mask: makeLayer({
      id: `${partial.id}-mask`,
      type: "rect",
      x: 0,
      y: 0,
      width: partial.width,
      height: partial.height,
      fill: "#000",
    }),
    content: [
      makeLayer({
        id: `${partial.id}-photo`,
        type: "image",
        x: 0,
        y: 0,
        width: partial.width,
        height: partial.height,
      }),
    ],
  } as FreehandObject;
}

function findLayer(objects: FreehandObject[] | undefined, id: string): FreehandObject | undefined {
  for (const obj of objects ?? []) {
    if (obj.id === id) return obj;
    const nested = findLayer((obj as { children?: FreehandObject[] }).children, id);
    if (nested) return nested;
    if (obj.type === "clippingContainer") {
      const clip = obj as { mask?: FreehandObject; content?: FreehandObject[] };
      if (clip.mask?.id === id) return clip.mask;
      const inContent = findLayer(clip.content, id);
      if (inContent) return inContent;
    }
  }
  return undefined;
}

function twoCardsPage() {
  const left = groupContainer({
    id: "left",
    x: 80,
    y: 100,
    width: 400,
    height: 220,
    children: [
      makeLayer({ id: "l1", type: "rect", x: 80, y: 100, width: 400, height: 220, fill: "#111" }),
      makeLayer({ id: "l2", type: "text", x: 104, y: 124, width: 180, height: 40, text: "A" }),
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

describe("site-creator group fit to container", () => {
  it("shows right arrows when a sibling sits on the same row", () => {
    const page = twoCardsPage();
    const index = buildSiteSelectionIndex(page);
    const blueprint = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const leftId = designerGroupMirrorNodeId("left");
    const opportunity = describeGroupFitOpportunity({
      blueprint,
      groupId: leftId,
      index,
      page,
    });
    expect(opportunity?.fitted).toBeNull();
    expect(opportunity?.showSideRight).toBe(true);
    expect(opportunity?.showSideLeft).toBe(false);
    expect(opportunity?.showScaleRight).toBe(true);
    expect(opportunity?.showRestoreRight).toBe(false);
    expect(opportunity?.willPromoteSection).toBe(true);
  });

  it("shows the same width and scale arrows on nested groups with the same structure", () => {
    const page = makePage([
      groupContainer({
        id: "purple",
        x: 80,
        y: 100,
        width: 520,
        height: 480,
        children: [
          makeLayer({ id: "pbg", type: "rect", x: 80, y: 100, width: 520, height: 480, fill: "#80f" }),
          makeLayer({ id: "pt", type: "text", x: 100, y: 120, width: 200, height: 40, text: "HOLAAAAA" }),
          makeLayer({ id: "g1", type: "rect", x: 140, y: 280, width: 160, height: 140, fill: "#9f6" }),
          makeLayer({ id: "g2", type: "rect", x: 320, y: 280, width: 160, height: 140, fill: "#9f6" }),
        ],
      }),
      groupContainer({
        id: "green",
        x: 640,
        y: 100,
        width: 520,
        height: 480,
        children: [
          makeLayer({ id: "gbg", type: "rect", x: 640, y: 100, width: 520, height: 480, fill: "#9f6" }),
          makeLayer({ id: "gt", type: "text", x: 660, y: 120, width: 200, height: 40, text: "HOLAAAAA" }),
          makeLayer({ id: "b1", type: "rect", x: 700, y: 280, width: 160, height: 140, fill: "#80f" }),
          makeLayer({ id: "b2", type: "rect", x: 880, y: 280, width: 160, height: 140, fill: "#80f" }),
        ],
      }),
    ]);
    const index = buildSiteSelectionIndex(page);
    const mirrored = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const purpleId = designerGroupMirrorNodeId("purple");
    const greenId = designerGroupMirrorNodeId("green");
    const leftInner = createLayoutGroupFromSelection({
      blueprint: mirrored,
      selectedLayerIds: ["g1", "g2"],
      index,
      preferredParentId: purpleId,
      label: "Cajas",
    });
    expect(leftInner.ok).toBe(true);
    if (!leftInner.ok) return;
    const rightInner = createLayoutGroupFromSelection({
      blueprint: leftInner.blueprint,
      selectedLayerIds: ["b1", "b2"],
      index,
      preferredParentId: greenId,
      label: "Cajas",
    });
    expect(rightInner.ok).toBe(true);
    if (!rightInner.ok) return;
    const leftOpp = describeGroupFitOpportunity({
      blueprint: rightInner.blueprint,
      groupId: leftInner.createdNodeId!,
      index,
      page,
    });
    const rightOpp = describeGroupFitOpportunity({
      blueprint: rightInner.blueprint,
      groupId: rightInner.createdNodeId!,
      index,
      page,
    });
    expect(leftOpp?.willPromoteSection).toBe(false);
    expect(rightOpp?.willPromoteSection).toBe(false);
    expect(leftOpp?.showSideRight).toBe(true);
    expect(leftOpp?.showScaleRight).toBe(true);
    expect(rightOpp?.showSideRight).toBe(true);
    expect(rightOpp?.showScaleRight).toBe(true);
    expect(rightOpp?.showSideRight).toBe(leftOpp?.showSideRight);
    expect(rightOpp?.showScaleRight).toBe(leftOpp?.showScaleRight);
    expect(rightOpp?.showSideLeft).toBe(leftOpp?.showSideLeft);
    expect(rightOpp?.showScaleLeft).toBe(leftOpp?.showScaleLeft);
  });

  it("promotes a root group to a section when filling page width", () => {
    const page = twoCardsPage();
    const index = buildSiteSelectionIndex(page);
    const blueprint = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const leftId = designerGroupMirrorNodeId("left");
    const result = applyGroupFitToContainer({
      blueprint,
      groupId: leftId,
      mode: "full",
      origin: "start",
      index,
      page,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const group = result.blueprint.nodes[leftId];
    expect(group?.kind).toBe("layoutGroup");
    if (group?.kind !== "layoutGroup") return;
    expect(group.widthMode).toBe("full");
    expect(group.parentId).toBeTruthy();
    const section = result.blueprint.nodes[group.parentId!];
    expect(section && isSiteSectionNode(section)).toBe(true);
    if (!section || !isSiteSectionNode(section)) return;
    expect(section.promotedFromGroupId).toBe(leftId);
    expect(result.blueprint.rootChildIds).toContain(section.id);
    expect(result.blueprint.rootChildIds).not.toContain(leftId);
  });

  it("does not create a section when the group is nested in another group", () => {
    const page = makePage([
      makeLayer({ id: "a", type: "rect", x: 20, y: 20, width: 120, height: 80 }),
      makeLayer({ id: "b", type: "rect", x: 160, y: 20, width: 120, height: 80 }),
      makeLayer({ id: "c", type: "rect", x: 20, y: 140, width: 120, height: 80 }),
      makeLayer({ id: "d", type: "rect", x: 160, y: 140, width: 120, height: 80 }),
    ]);
    const index = buildSiteSelectionIndex(page);
    const g1 = createLayoutGroupFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["a", "b"],
      index,
      label: "A",
    });
    expect(g1.ok).toBe(true);
    if (!g1.ok) return;
    const g2 = createLayoutGroupFromSelection({
      blueprint: g1.blueprint,
      selectedLayerIds: ["c", "d"],
      index,
      label: "B",
    });
    expect(g2.ok).toBe(true);
    if (!g2.ok) return;
    const wrapped = wrapSemanticNodesInGroup({
      blueprint: g2.blueprint,
      selectedNodeIds: [g1.createdNodeId!, g2.createdNodeId!],
      index,
      label: "Fila",
    });
    expect(wrapped.ok).toBe(true);
    if (!wrapped.ok) return;
    const result = applyGroupFitToContainer({
      blueprint: wrapped.blueprint,
      groupId: g1.createdNodeId!,
      mode: "full",
      origin: "start",
      index,
      page,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const child = result.blueprint.nodes[g1.createdNodeId!];
    expect(child?.parentId).toBe(wrapped.createdNodeId);
    expect(child?.kind === "layoutGroup" && child.widthMode).toBe("full");
    expect(Object.values(result.blueprint.nodes).some((n) => n.kind === "section")).toBe(false);
  });

  it("wraps sibling product cards when one grouped card goes full width", () => {
    const cards = [0, 1, 2, 3].map((i) =>
      groupContainer({
        id: `card${i}`,
        x: 40 + i * 280,
        y: 400,
        width: 260,
        height: 360,
        children: [
          makeLayer({
            id: `bg${i}`,
            type: "rect",
            x: 40 + i * 280,
            y: 400,
            width: 260,
            height: 360,
            fill: "#eee",
          }),
          makeLayer({
            id: `img${i}`,
            type: "rect",
            x: 50 + i * 280,
            y: 410,
            width: 240,
            height: 160,
            fill: "#36f",
          }),
        ],
      }),
    );
    const page = makePage(cards);
    const index = buildSiteSelectionIndex(page);
    const blueprint = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const card1 = designerGroupMirrorNodeId("card1");
    const fitted = applyGroupFitToContainer({
      blueprint,
      groupId: card1,
      mode: "full",
      origin: "start",
      index,
      page,
    });
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    const laidOut = applyLayoutGroupWidthModes({
      page,
      blueprint: fitted.blueprint,
      index,
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    const selected = laidOut.page.objects?.find((o) => o.id === "card1");
    const neighbor = laidOut.page.objects?.find((o) => o.id === "card2");
    expect(selected?.width).toBeGreaterThan(1500);
    expect(neighbor?.y).toBeGreaterThan((selected?.y ?? 0) + (selected?.height ?? 0) - 1);
  });

  it("wraps sibling cards inside a shared parent group", () => {
    const cards = [0, 1, 2, 3].map((i) =>
      groupContainer({
        id: `card${i}`,
        x: 40 + i * 280,
        y: 400,
        width: 260,
        height: 360,
        children: [
          makeLayer({
            id: `bg${i}`,
            type: "rect",
            x: 40 + i * 280,
            y: 400,
            width: 260,
            height: 360,
            fill: "#eee",
          }),
        ],
      }),
    );
    const page = makePage(cards);
    const index = buildSiteSelectionIndex(page);
    let blueprint = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const ids = [0, 1, 2, 3].map((i) => designerGroupMirrorNodeId(`card${i}`));
    const wrapped = wrapSemanticNodesInGroup({
      blueprint,
      selectedNodeIds: ids,
      index,
      label: "Fila",
    });
    expect(wrapped.ok).toBe(true);
    if (!wrapped.ok) return;
    const fitted = applyGroupFitToContainer({
      blueprint: wrapped.blueprint,
      groupId: ids[1]!,
      mode: "full",
      origin: "start",
      index,
      page,
    });
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    const laidOut = applyLayoutGroupWidthModes({
      page,
      blueprint: fitted.blueprint,
      index,
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    const selected = laidOut.page.objects?.find((o) => o.id === "card1");
    const neighbor = laidOut.page.objects?.find((o) => o.id === "card2");
    expect(selected?.width).toBeGreaterThan(1000);
    expect(neighbor?.y).toBeGreaterThan((selected?.y ?? 0) + (selected?.height ?? 0) - 1);
  });

  it("wraps sibling cards that sit on a shared full-width background", () => {
    const bg = makeLayer({
      id: "rowbg",
      type: "rect",
      x: 0,
      y: 380,
      width: 1920,
      height: 400,
      fill: "#cfc",
    });
    const cards = [0, 1, 2, 3].map((i) =>
      groupContainer({
        id: `card${i}`,
        x: 40 + i * 280,
        y: 400,
        width: 260,
        height: 360,
        children: [
          makeLayer({
            id: `bg${i}`,
            type: "rect",
            x: 40 + i * 280,
            y: 400,
            width: 260,
            height: 360,
            fill: "#eee",
          }),
        ],
      }),
    );
    const page = makePage([bg, ...cards]);
    const index = buildSiteSelectionIndex(page);
    const blueprint = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const fitted = applyGroupFitToContainer({
      blueprint,
      groupId: designerGroupMirrorNodeId("card1"),
      mode: "full",
      origin: "start",
      index,
      page,
    });
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    const laidOut = applyLayoutGroupWidthModes({
      page,
      blueprint: fitted.blueprint,
      index,
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    const selected = laidOut.page.objects?.find((o) => o.id === "card1");
    const neighbor = laidOut.page.objects?.find((o) => o.id === "card2");
    expect(selected?.width).toBeGreaterThan(1500);
    expect(neighbor?.y).toBeGreaterThan((selected?.y ?? 0) + (selected?.height ?? 0) - 1);
  });

  it("wraps page-level product clips with their neighbor cards", () => {
    const bg = makeLayer({
      id: "rowbg",
      type: "rect",
      x: 0,
      y: 380,
      width: 1920,
      height: 400,
      fill: "#cfc",
    });
    const cards = [0, 1, 2].map((i) => {
      const x = 40 + i * 400;
      return groupContainer({
        id: `card${i}`,
        x,
        y: 400,
        width: 360,
        height: 360,
        children: [
          makeLayer({
            id: `bg${i}`,
            type: "rect",
            x,
            y: 400,
            width: 360,
            height: 360,
            fill: "#fff",
          }),
          makeLayer({
            id: `title${i}`,
            type: "text",
            x: x + 20,
            y: 600,
            width: 280,
            height: 40,
            text: "PANTALÓN GENIAL!",
          }),
        ],
      });
    });
    const clips = [0, 1, 2].map((i) =>
      clippingImage({
        id: `img${i}`,
        x: 60 + i * 400,
        y: 410,
        width: 320,
        height: 180,
      }),
    );
    const page = makePage([bg, ...cards, ...clips]);
    const index = buildSiteSelectionIndex(page);
    const blueprint = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const fitted = applyGroupFitToContainer({
      blueprint,
      groupId: designerGroupMirrorNodeId("card0"),
      mode: "full",
      origin: "start",
      index,
      page,
    });
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    const laidOut = applyLayoutGroupWidthModes({
      page,
      blueprint: fitted.blueprint,
      index,
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    const neighbor = findLayer(laidOut.page.objects, "card1");
    const neighborTitle = findLayer(laidOut.page.objects, "title1");
    const neighborClip = findLayer(laidOut.page.objects, "img1");
    const neighborPhoto = findLayer(laidOut.page.objects, "img1-photo");
    expect(neighbor?.y).toBeGreaterThan(700);
    expect(neighborClip?.y).toBeGreaterThan(700);
    expect(Math.abs((neighborClip?.y ?? 0) - (neighbor?.y ?? 0))).toBeLessThan(80);
    expect(neighborTitle?.y).toBeGreaterThan((neighborClip?.y ?? 0) + 100);
    expect(neighborPhoto?.x).toBeLessThan(8);
    expect(neighborPhoto?.y).toBeLessThan(8);
  });

  it("keeps the fitted card's page-level photo instead of wrapping it as a mate", () => {
    const bg = makeLayer({
      id: "rowbg",
      type: "rect",
      x: 0,
      y: 380,
      width: 1920,
      height: 400,
      fill: "#cfc",
    });
    const cards = [0, 1].map((i) => {
      const x = 40 + i * 400;
      return groupContainer({
        id: `card${i}`,
        x,
        y: 400,
        width: 360,
        height: 360,
        children: [
          makeLayer({
            id: `bg${i}`,
            type: "rect",
            x,
            y: 400,
            width: 360,
            height: 360,
            fill: "#fff",
          }),
          makeLayer({
            id: `title${i}`,
            type: "text",
            x: x + 20,
            y: 600,
            width: 280,
            height: 40,
            text: "PANTALÓN GENIAL!",
          }),
        ],
      });
    });
    const clips = [0, 1].map((i) =>
      clippingImage({
        id: `img${i}`,
        x: 60 + i * 400,
        y: 410,
        width: 320,
        height: 180,
      }),
    );
    const page = makePage([bg, ...cards, ...clips]);
    const index = buildSiteSelectionIndex(page);
    const blueprint = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const fitted = applyGroupFitToContainer({
      blueprint,
      groupId: designerGroupMirrorNodeId("card0"),
      mode: "full",
      origin: "start",
      index,
      page,
    });
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    const laidOut = applyLayoutGroupWidthModes({
      page,
      blueprint: fitted.blueprint,
      index,
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    const selected = findLayer(laidOut.page.objects, "card0");
    const selectedClip = findLayer(laidOut.page.objects, "img0");
    const selectedTitle = findLayer(laidOut.page.objects, "title0");
    const neighbor = findLayer(laidOut.page.objects, "card1");
    const neighborClip = findLayer(laidOut.page.objects, "img1");
    expect(selected?.width).toBeGreaterThan(1500);
    expect(selectedClip?.y).toBeLessThan((selected?.y ?? 0) + 40);
    expect(Math.abs((selectedClip?.y ?? 0) - 410)).toBeLessThan(40);
    expect(selectedTitle?.y).toBeGreaterThan((selectedClip?.y ?? 0) + 100);
    expect(neighbor?.y).toBeGreaterThan((selected?.y ?? 0) + (selected?.height ?? 0) - 1);
    expect(Math.abs((neighborClip?.y ?? 0) - (neighbor?.y ?? 0))).toBeLessThan(80);
  });

  it("wraps product clips nested in a full-bleed photos folder", () => {
    const bg = makeLayer({
      id: "rowbg",
      type: "rect",
      x: 0,
      y: 380,
      width: 1920,
      height: 400,
      fill: "#cfc",
    });
    const cards = [0, 1, 2].map((i) => {
      const x = 40 + i * 400;
      return groupContainer({
        id: `card${i}`,
        x,
        y: 400,
        width: 360,
        height: 360,
        children: [
          makeLayer({
            id: `bg${i}`,
            type: "rect",
            x,
            y: 400,
            width: 360,
            height: 360,
            fill: "#fff",
          }),
          makeLayer({
            id: `title${i}`,
            type: "text",
            x: x + 20,
            y: 600,
            width: 280,
            height: 40,
            text: "PANTALÓN GENIAL!",
          }),
        ],
      });
    });
    const photos = groupContainer({
      id: "photos",
      x: 0,
      y: 380,
      width: 1920,
      height: 220,
      children: [0, 1, 2].map((i) =>
        clippingImage({
          id: `img${i}`,
          x: 60 + i * 400,
          y: 410,
          width: 320,
          height: 180,
        }),
      ),
    });
    const page = makePage([bg, ...cards, photos]);
    const index = buildSiteSelectionIndex(page);
    const blueprint = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const fitted = applyGroupFitToContainer({
      blueprint,
      groupId: designerGroupMirrorNodeId("card0"),
      mode: "full",
      origin: "start",
      index,
      page,
    });
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    const laidOut = applyLayoutGroupWidthModes({
      page,
      blueprint: fitted.blueprint,
      index,
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    const neighbor = findLayer(laidOut.page.objects, "card1");
    const neighborClip = findLayer(laidOut.page.objects, "img1");
    const neighborTitle = findLayer(laidOut.page.objects, "title1");
    expect(neighbor?.y).toBeGreaterThan(700);
    expect(neighborClip?.y).toBeGreaterThan(700);
    expect(Math.abs((neighborClip?.y ?? 0) - (neighbor?.y ?? 0))).toBeLessThan(80);
    expect(neighborTitle?.y).toBeGreaterThan((neighborClip?.y ?? 0) + 100);
  });

  it("wraps a page-sized clip whose painted jeans sit on a neighbor card", () => {
    const bg = makeLayer({
      id: "rowbg",
      type: "rect",
      x: 0,
      y: 380,
      width: 1920,
      height: 400,
      fill: "#cfc",
    });
    const left = groupContainer({
      id: "card0",
      x: 40,
      y: 400,
      width: 360,
      height: 360,
      children: [
        makeLayer({ id: "bg0", type: "rect", x: 40, y: 400, width: 360, height: 360, fill: "#fff" }),
        makeLayer({ id: "title0", type: "text", x: 60, y: 600, width: 280, height: 40, text: "A" }),
      ],
    });
    const right = groupContainer({
      id: "card1",
      x: 440,
      y: 400,
      width: 360,
      height: 360,
      children: [
        makeLayer({ id: "bg1", type: "rect", x: 440, y: 400, width: 360, height: 360, fill: "#fff" }),
        makeLayer({ id: "title1", type: "text", x: 460, y: 600, width: 280, height: 40, text: "B" }),
      ],
    });
    const clip = {
      ...clippingImage({ id: "img1", x: 0, y: 0, width: 1920, height: 1080 }),
      mask: makeLayer({
        id: "img1-mask",
        type: "rect",
        x: 460,
        y: 410,
        width: 320,
        height: 180,
        fill: "#000",
      }),
      content: [
        makeLayer({
          id: "img1-photo",
          type: "image",
          x: 460,
          y: 410,
          width: 320,
          height: 180,
        }),
      ],
    } as FreehandObject;
    const page = makePage([bg, left, right, clip]);
    const index = buildSiteSelectionIndex(page);
    const blueprint = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const fitted = applyGroupFitToContainer({
      blueprint,
      groupId: designerGroupMirrorNodeId("card0"),
      mode: "full",
      origin: "start",
      index,
      page,
    });
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    const laidOut = applyLayoutGroupWidthModes({
      page,
      blueprint: fitted.blueprint,
      index,
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    const neighbor = findLayer(laidOut.page.objects, "card1");
    const neighborClip = findLayer(laidOut.page.objects, "img1");
    const neighborMask = findLayer(laidOut.page.objects, "img1-mask");
    expect(neighbor?.y).toBeGreaterThan(700);
    const paintedY = (neighborClip?.y ?? 0) + (neighborMask?.y ?? 0);
    expect(paintedY).toBeGreaterThan(700);
    expect(Math.abs(paintedY - (neighbor?.y ?? 0))).toBeLessThan(80);
  });

  it("keeps clipped photos attached when a product card goes full width", () => {
    const bg = makeLayer({
      id: "rowbg",
      type: "rect",
      x: 0,
      y: 380,
      width: 1920,
      height: 400,
      fill: "#cfc",
    });
    const cards = [0, 1, 2, 3].map((i) => {
      const x = 40 + i * 280;
      return groupContainer({
        id: `card${i}`,
        x,
        y: 400,
        width: 260,
        height: 360,
        children: [
          clippingImage({ id: `img${i}`, x: x + 10, y: 410, width: 240, height: 180 }),
          makeLayer({
            id: `price${i}`,
            type: "rect",
            x: x + 16,
            y: 430,
            width: 64,
            height: 28,
            fill: "#b80",
          }),
          makeLayer({
            id: `title${i}`,
            type: "text",
            x: x + 16,
            y: 600,
            width: 220,
            height: 36,
            text: "PANTALÓN GENIAL!",
          }),
          makeLayer({
            id: `btn${i}`,
            type: "rect",
            x: x + 16,
            y: 720,
            width: 120,
            height: 28,
            fill: "#b80",
          }),
        ],
      });
    });
    const page = makePage([bg, ...cards]);
    const index = buildSiteSelectionIndex(page);
    const blueprint = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const fitted = applyGroupFitToContainer({
      blueprint,
      groupId: designerGroupMirrorNodeId("card0"),
      mode: "full",
      origin: "start",
      index,
      page,
    });
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    const laidOut = applyLayoutGroupWidthModes({
      page,
      blueprint: fitted.blueprint,
      index,
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    const selected = findLayer(laidOut.page.objects, "card0");
    const neighbor = findLayer(laidOut.page.objects, "card1");
    const clip = findLayer(laidOut.page.objects, "img0");
    const photo = findLayer(laidOut.page.objects, "img0-photo");
    const title = findLayer(laidOut.page.objects, "title0");
    expect(selected?.width).toBeGreaterThan(1500);
    expect(neighbor?.y).toBeGreaterThan((selected?.y ?? 0) + (selected?.height ?? 0) - 1);
    expect(photo?.x).toBeLessThan(8);
    expect(photo?.y).toBeLessThan(8);
    expect(clip?.x).toBeGreaterThan((selected?.x ?? 0) - 1);
    expect((clip?.x ?? 0) + (clip?.width ?? 0)).toBeLessThan((selected?.x ?? 0) + (selected?.width ?? 0) + 1);
    expect(title?.x).toBeGreaterThan((clip?.x ?? 0) - 8);
    expect(title?.y).toBeGreaterThan((clip?.y ?? 0) + (clip?.height ?? 0) - 8);
  });

  it("does not treat clipped content as page-absolute orphans inside a layout group", () => {
    const bg = makeLayer({
      id: "rowbg",
      type: "rect",
      x: 0,
      y: 380,
      width: 1920,
      height: 400,
      fill: "#cfc",
    });
    const cards: FreehandObject[] = [];
    const layerIdsByCard: string[][] = [];
    for (let i = 0; i < 4; i += 1) {
      const x = 40 + i * 280;
      const clip = clippingImage({ id: `img${i}`, x: x + 10, y: 410, width: 240, height: 180 });
      const price = makeLayer({
        id: `price${i}`,
        type: "rect",
        x: x + 16,
        y: 430,
        width: 64,
        height: 28,
        fill: "#b80",
      });
      const title = makeLayer({
        id: `title${i}`,
        type: "text",
        x: x + 16,
        y: 600,
        width: 220,
        height: 36,
        text: "PANTALÓN GENIAL!",
      });
      const btn = makeLayer({
        id: `btn${i}`,
        type: "rect",
        x: x + 16,
        y: 720,
        width: 120,
        height: 28,
        fill: "#b80",
      });
      cards.push(clip, price, title, btn);
      layerIdsByCard.push([clip.id, price.id, title.id, btn.id]);
    }
    const page = makePage([bg, ...cards]);
    const index = buildSiteSelectionIndex(page);
    let blueprint = createEmptySiteBlueprintV1();
    const groupIds: string[] = [];
    for (const ids of layerIdsByCard) {
      const grouped = createLayoutGroupFromSelection({
        blueprint,
        selectedLayerIds: ids,
        index,
        label: "Card",
      });
      expect(grouped.ok).toBe(true);
      if (!grouped.ok) return;
      blueprint = grouped.blueprint;
      groupIds.push(grouped.createdNodeId!);
    }
    const fitted = applyGroupFitToContainer({
      blueprint,
      groupId: groupIds[0]!,
      mode: "full",
      origin: "start",
      index,
      page,
    });
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    const laidOut = applyLayoutGroupWidthModes({
      page,
      blueprint: fitted.blueprint,
      index,
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    const clip = findLayer(laidOut.page.objects, "img0");
    const photo = findLayer(laidOut.page.objects, "img0-photo");
    const title = findLayer(laidOut.page.objects, "title0");
    const neighborClip = findLayer(laidOut.page.objects, "img1");
    expect(clip?.width).toBeGreaterThan(200);
    expect(photo?.x).toBeLessThan(8);
    expect(photo?.y).toBeLessThan(8);
    expect(title?.y).toBeGreaterThan((clip?.y ?? 0) + (clip?.height ?? 0) - 8);
    expect(Math.abs((title?.x ?? 0) - (clip?.x ?? 0))).toBeLessThan(80);
    expect(neighborClip?.y).toBeGreaterThan((clip?.y ?? 0) + (clip?.height ?? 0) - 1);
  });

  it("wraps a neighbor card without leaving its clipped photo behind", () => {
    const cards = [0, 1].map((i) => {
      const x = 40 + i * 400;
      return groupContainer({
        id: `card${i}`,
        x,
        y: 400,
        width: 360,
        height: 360,
        children: [
          makeLayer({
            id: `bg${i}`,
            type: "rect",
            x,
            y: 400,
            width: 360,
            height: 360,
            fill: "#eee",
          }),
          clippingImage({ id: `img${i}`, x: x + 20, y: 420, width: 320, height: 180 }),
          makeLayer({
            id: `title${i}`,
            type: "text",
            x: x + 20,
            y: 620,
            width: 280,
            height: 40,
            text: "PANTALÓN",
          }),
        ],
      });
    });
    const page = makePage(cards);
    const index = buildSiteSelectionIndex(page);
    const mirrored = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const card0 = designerGroupMirrorNodeId("card0");
    const card1 = designerGroupMirrorNodeId("card1");
    const node1 = mirrored.nodes[card1];
    expect(node1?.kind).toBe("layoutGroup");
    if (node1?.kind !== "layoutGroup") return;
    const patched = {
      ...mirrored,
      nodes: {
        ...mirrored.nodes,
        [card1]: {
          ...node1,
          layerIds: node1.layerIds.flatMap((id) => (id === "card1" ? ["img1-photo", "title1", "bg1"] : [id])),
        },
      },
    };
    const fitted = applyGroupFitToContainer({
      blueprint: patched,
      groupId: card0,
      mode: "full",
      origin: "start",
      index,
      page,
    });
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    const laidOut = applyLayoutGroupWidthModes({
      page,
      blueprint: fitted.blueprint,
      index,
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    const again = applyLayoutGroupWidthModes({
      page: laidOut.page,
      blueprint: fitted.blueprint,
      index,
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    const clip = findLayer(again.page.objects, "img1");
    const photo = findLayer(again.page.objects, "img1-photo");
    const title = findLayer(again.page.objects, "title1");
    expect(photo?.x).toBeLessThan(8);
    expect(photo?.y).toBeLessThan(8);
    expect(clip?.y).toBeGreaterThan(500);
    expect(Math.abs((title?.y ?? 0) - ((clip?.y ?? 0) + (clip?.height ?? 0)))).toBeLessThan(80);
  });

  it("keeps card photos attached when fitting a page already scaled to tablet", () => {
    const scale = SITE_CREATOR_TABLET_WIDTH / 1920;
    const originalCards = [0, 1].map((i) => {
      const x = 40 + i * 400;
      return groupContainer({
        id: `card${i}`,
        x,
        y: 400,
        width: 360,
        height: 360,
        children: [
          makeLayer({
            id: `bg${i}`,
            type: "rect",
            x,
            y: 400,
            width: 360,
            height: 360,
            fill: "#eee",
          }),
          clippingImage({ id: `img${i}`, x: x + 20, y: 420, width: 320, height: 180 }),
          makeLayer({
            id: `title${i}`,
            type: "text",
            x: x + 20,
            y: 620,
            width: 280,
            height: 40,
            text: "PANTALÓN",
          }),
        ],
      });
    });
    const originalPage = makePage(originalCards);
    const originalIndex = buildSiteSelectionIndex(originalPage);

    const scaleWorld = (obj: FreehandObject, local: boolean): FreehandObject => {
      const next = {
        ...obj,
        x: local ? obj.x * scale : obj.x * scale,
        y: local ? obj.y * scale : obj.y * scale,
        width: obj.width * scale,
        height: obj.height * scale,
      } as FreehandObject;
      if (next.type === "groupContainer") {
        (next as { children?: FreehandObject[] }).children = (
          (obj as { children?: FreehandObject[] }).children ?? []
        ).map((ch) => scaleWorld(ch, false));
      }
      if (next.type === "clippingContainer") {
        const clip = obj as { mask?: FreehandObject; content?: FreehandObject[] };
        (next as { mask?: FreehandObject }).mask = clip.mask
          ? scaleWorld(clip.mask, true)
          : undefined;
        (next as { content?: FreehandObject[] }).content = (clip.content ?? []).map((ch) =>
          scaleWorld(ch, true),
        );
      }
      return next;
    };
    const scaledPage = makePage(
      (originalPage.objects ?? []).map((o) => scaleWorld(o, false)),
      { w: SITE_CREATOR_TABLET_WIDTH, h: 1080 },
    );
    const blueprint = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), originalIndex);
    const fitted = applyGroupFitToContainer({
      blueprint,
      groupId: designerGroupMirrorNodeId("card0"),
      mode: "full",
      origin: "start",
      index: originalIndex,
      page: originalPage,
      band: "tablet",
    });
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    const laidOut = applyLayoutGroupWidthModes({
      page: scaledPage,
      blueprint: fitted.blueprint,
      index: originalIndex,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
      viewportHeight: 1080,
      band: "tablet",
    });
    const card = findLayer(laidOut.page.objects, "card0");
    const clip = findLayer(laidOut.page.objects, "img0");
    const photo = findLayer(laidOut.page.objects, "img0-photo");
    const title = findLayer(laidOut.page.objects, "title0");
    const neighbor = findLayer(laidOut.page.objects, "card1");
    expect(card?.width).toBeGreaterThan(SITE_CREATOR_TABLET_WIDTH * 0.8);
    expect(photo?.x).toBeLessThan(8);
    expect(photo?.y).toBeLessThan(8);
    expect(clip?.x).toBeGreaterThan((card?.x ?? 0) - 1);
    expect(title?.y).toBeGreaterThan((clip?.y ?? 0) + (clip?.height ?? 0) - 8);
    expect(neighbor?.y).toBeGreaterThan((card?.y ?? 0) + (card?.height ?? 0) - 1);
  });

  it("demotes the auto-section when returning to natural width", () => {
    const page = twoCardsPage();
    const index = buildSiteSelectionIndex(page);
    const blueprint = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const leftId = designerGroupMirrorNodeId("left");
    const full = applyGroupFitToContainer({
      blueprint,
      groupId: leftId,
      mode: "full",
      index,
      page,
    });
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    const natural = applyGroupFitToContainer({
      blueprint: full.blueprint,
      groupId: leftId,
      mode: "content",
      index,
      page,
    });
    expect(natural.ok).toBe(true);
    if (!natural.ok) return;
    const group = natural.blueprint.nodes[leftId];
    expect(group?.kind).toBe("layoutGroup");
    if (group?.kind !== "layoutGroup") return;
    expect(group.widthMode).toBeUndefined();
    expect(group.parentId).toBeNull();
    expect(Object.values(natural.blueprint.nodes).some((n) => n.kind === "section")).toBe(false);
  });

  it("scales width and height together in scale mode", () => {
    const page = twoCardsPage();
    const index = buildSiteSelectionIndex(page);
    const mirrored = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const leftId = designerGroupMirrorNodeId("left");
    const fitted = applyGroupFitToContainer({
      blueprint: mirrored,
      groupId: leftId,
      mode: "scale",
      origin: "start",
      index,
      page,
    });
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    const laidOut = applyLayoutGroupWidthModes({
      page,
      blueprint: fitted.blueprint,
      index,
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    const left = laidOut.page.objects?.find((o) => o.id === "left");
    expect(left?.width).toBeGreaterThan(1500);
    expect(left?.height).toBeGreaterThan(800);
  });

  it("shows inverse restore arrows for the origin used in that view", () => {
    const page = twoCardsPage();
    const index = buildSiteSelectionIndex(page);
    const blueprint = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const leftId = designerGroupMirrorNodeId("left");
    const fitted = applyGroupFitToContainer({
      blueprint,
      groupId: leftId,
      mode: "full",
      origin: "start",
      index,
      page,
    });
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    const opportunity = describeGroupFitOpportunity({
      blueprint: fitted.blueprint,
      groupId: leftId,
      index,
      page,
      band: "wide",
    });
    expect(opportunity?.fitted).toEqual({ mode: "full", origin: "start" });
    expect(opportunity?.showRestoreRight).toBe(true);
    expect(opportunity?.showRestoreLeft).toBe(false);
    expect(opportunity?.showSideRight).toBe(false);
    expect(opportunity?.showScaleRight).toBe(false);
  });

  it("stores tablet fit on the band tune without changing Original or creating a section", () => {
    const page = twoCardsPage();
    const index = buildSiteSelectionIndex(page);
    const blueprint = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const leftId = designerGroupMirrorNodeId("left");
    const result = applyGroupFitToContainer({
      blueprint,
      groupId: leftId,
      mode: "full",
      origin: "start",
      index,
      page,
      band: "tablet",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const group = result.blueprint.nodes[leftId];
    expect(group?.kind).toBe("layoutGroup");
    if (group?.kind !== "layoutGroup") return;
    expect(group.widthMode).toBeUndefined();
    expect(group.parentId).toBeNull();
    expect(Object.values(result.blueprint.nodes).some((n) => n.kind === "section")).toBe(false);
    const tune = resolveContainerTune(
      result.blueprint,
      { kind: "blueprintNode", nodeId: leftId },
      "tablet",
    );
    expect(tune?.contentWidthMode).toBe("full");
    expect(tune?.fitOrigin).toBe("start");
    const original = applyLayoutGroupWidthModes({
      page,
      blueprint: result.blueprint,
      index,
      viewportWidth: 1920,
      viewportHeight: 1080,
      band: "wide",
    });
    expect(original.page.objects?.find((o) => o.id === "left")?.width).toBeCloseTo(400);
  });

  it("does not wrap tablet when Original is full width", () => {
    const page = twoCardsPage();
    const index = buildSiteSelectionIndex(page);
    const blueprint = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const leftId = designerGroupMirrorNodeId("left");
    const originalFit = applyGroupFitToContainer({
      blueprint,
      groupId: leftId,
      mode: "full",
      origin: "start",
      index,
      page,
      band: "wide",
    });
    expect(originalFit.ok).toBe(true);
    if (!originalFit.ok) return;
    const tablet = applyLayoutGroupWidthModes({
      page,
      blueprint: originalFit.blueprint,
      index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
      viewportHeight: 1080,
      band: "tablet",
    });
    expect(tablet.page.objects?.find((o) => o.id === "left")?.width).toBeCloseTo(400);
    expect(tablet.page.objects?.find((o) => o.id === "right")?.y).toBeCloseTo(100);
  });

  it("restores tablet without demoting an Original section", () => {
    const page = twoCardsPage();
    const index = buildSiteSelectionIndex(page);
    const blueprint = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const leftId = designerGroupMirrorNodeId("left");
    const originalFit = applyGroupFitToContainer({
      blueprint,
      groupId: leftId,
      mode: "full",
      origin: "start",
      index,
      page,
      band: "wide",
    });
    expect(originalFit.ok).toBe(true);
    if (!originalFit.ok) return;
    const tabletFit = applyGroupFitToContainer({
      blueprint: originalFit.blueprint,
      groupId: leftId,
      mode: "full",
      origin: "end",
      index,
      page,
      band: "tablet",
    });
    expect(tabletFit.ok).toBe(true);
    if (!tabletFit.ok) return;
    const restored = applyGroupFitToContainer({
      blueprint: tabletFit.blueprint,
      groupId: leftId,
      mode: "content",
      index,
      page,
      band: "tablet",
    });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    const group = restored.blueprint.nodes[leftId];
    expect(group?.kind).toBe("layoutGroup");
    if (group?.kind !== "layoutGroup") return;
    expect(group.widthMode).toBe("full");
    expect(group.parentId).toBeTruthy();
    const section = restored.blueprint.nodes[group.parentId!];
    expect(section && isSiteSectionNode(section)).toBe(true);
    if (!section || !isSiteSectionNode(section)) return;
    expect(section.promotedFromGroupId).toBe(leftId);
    const tabletTune = resolveContainerTune(
      restored.blueprint,
      { kind: "blueprintNode", nodeId: leftId },
      "tablet",
    );
    expect(tabletTune?.contentWidthMode).toBeUndefined();
  });

  it("fits a nested group to its parent without displacing an uncle sibling", () => {
    const page = makePage([
      groupContainer({
        id: "purple",
        x: 80,
        y: 100,
        width: 520,
        height: 480,
        children: [
          makeLayer({ id: "pbg", type: "rect", x: 80, y: 100, width: 520, height: 480, fill: "#80f" }),
          makeLayer({ id: "pt", type: "text", x: 100, y: 120, width: 200, height: 40, text: "HOLAAAAA" }),
          makeLayer({ id: "g1", type: "rect", x: 140, y: 280, width: 160, height: 140, fill: "#9f6" }),
          makeLayer({ id: "g2", type: "rect", x: 320, y: 280, width: 160, height: 140, fill: "#9f6" }),
        ],
      }),
      groupContainer({
        id: "right",
        x: 640,
        y: 100,
        width: 520,
        height: 480,
        children: [
          makeLayer({ id: "rbg", type: "rect", x: 640, y: 100, width: 520, height: 480, fill: "#9f6" }),
        ],
      }),
    ]);
    const index = buildSiteSelectionIndex(page);
    const mirrored = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const purpleId = designerGroupMirrorNodeId("purple");
    const grouped = createLayoutGroupFromSelection({
      blueprint: mirrored,
      selectedLayerIds: ["g1", "g2"],
      index,
      preferredParentId: purpleId,
      label: "Cajas",
    });
    expect(grouped.ok).toBe(true);
    if (!grouped.ok) return;
    const inner = grouped.blueprint.nodes[grouped.createdNodeId!];
    expect(inner?.kind).toBe("layoutGroup");
    if (inner?.kind !== "layoutGroup") return;
    expect(inner.parentId).toBe(purpleId);
    expect(inner.layerIds).toEqual(expect.arrayContaining(["g1", "g2"]));

    const fitted = applyGroupFitToContainer({
      blueprint: grouped.blueprint,
      groupId: inner.id,
      mode: "full",
      origin: "start",
      index,
      page,
    });
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    expect(Object.values(fitted.blueprint.nodes).some((n) => n.kind === "section")).toBe(false);

    const laidOut = applyLayoutGroupWidthModes({
      page,
      blueprint: fitted.blueprint,
      index,
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    const findChild = (parentId: string, childId: string) => {
      const parent = laidOut.page.objects?.find((o) => o.id === parentId) as
        | { children?: FreehandObject[] }
        | undefined;
      return parent?.children?.find((o) => o.id === childId);
    };
    const g1 = findChild("purple", "g1");
    const g2 = findChild("purple", "g2");
    const right = laidOut.page.objects?.find((o) => o.id === "right");
    const unionLeft = Math.min(g1?.x ?? 0, g2?.x ?? 0);
    const unionRight = Math.max((g1?.x ?? 0) + (g1?.width ?? 0), (g2?.x ?? 0) + (g2?.width ?? 0));
    expect(unionRight - unionLeft).toBeGreaterThan(480);
    expect(unionLeft).toBeCloseTo(80, 0);
    expect(right?.x).toBeCloseTo(640, 0);
    expect(right?.y).toBeCloseTo(100, 0);
  });
});
