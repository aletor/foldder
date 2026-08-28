import { beforeEach, describe, expect, it } from "vitest";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { resetSiteBlueprintIdSeqForTests } from "./site-blueprint-ids";
import { createBlueprintHistory, pushBlueprintHistory } from "./site-blueprint-history";
import {
  createMultiCardFromSelection,
  createSectionFromSelection,
  createLayoutGroupFromSelection,
  duplicateMultiCardCard,
  removeBlueprintNodePreservingContent,
  removeMultiCardCard,
  setMultiCardCount,
  setMultiCardLayoutMode,
  setMultiCardSlotOverride,
} from "./site-blueprint-ops";
import { cloneBlueprint, validateSiteBlueprintTree } from "./site-blueprint-validate";
import {
  createEmptySiteBlueprintV1,
  isSiteMultiCardNode,
  parseSiteCreatorNodeData,
  type SiteBlueprintMultiCardNode,
} from "./site-creator-types";
import { resolveContextualModel } from "./site-creator-contextual-actions";
import { parseMultiCardInstanceId, encodeMultiCardInstanceId, isMultiCardInstanceId } from "./site-creator-multicard-ids";
import {
  clampMultiCardScrollIndex,
  easePower2InOut,
  multiCardMaxScrollIndex,
  multiCardNavIsVisible,
  multiCardVisibleCount,
  planMultiCardGrid,
  resolveMultiCardBandPresentation,
} from "./site-creator-multicard-layout";
import { findDisplayObject, resolveSiteCreatorResponsiveDisplay } from "./site-creator-responsive";
import { buildSiteCreatorPresentationTree } from "./site-creator-presentation-tree";
import { resolveRootClickUnit } from "./site-creator-display-labels";
import { canvasHitTestUnits, canEnterContainer, frontmostDirectHit } from "./site-creator-hit-test";
import { compilePublishedSite, collectPublishImageRefs, publishAssetPlaceholder } from "./site-creator-publish-compile";

function layer(partial: Partial<FreehandObject> & { id: string; type: FreehandObject["type"] }): FreehandObject {
  const base = {
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    name: partial.id,
    ...partial,
  };
  if (partial.type === "text") {
    return {
      fontSize: 16,
      lineHeight: 1.2,
      fontFamily: "sans-serif",
      fontWeight: "400",
      textMode: "area",
      ...base,
    } as FreehandObject;
  }
  return base as FreehandObject;
}

function page(objects: FreehandObject[]): DesignerPageState {
  return { id: "pg", format: "web169", objects };
}

function bezier(x: number, y: number) {
  return { anchor: { x, y }, handleIn: { x, y }, handleOut: { x, y } };
}

function pathPlate(partial: {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  name?: string;
}): FreehandObject {
  const { x, y, width, height } = partial;
  return {
    ...layer({
      id: partial.id,
      type: "path",
      x,
      y,
      width,
      height,
      fill: partial.fill,
      name: partial.name ?? partial.id,
    }),
    type: "path",
    closed: true,
    points: [
      bezier(x, y),
      bezier(x + width, y),
      bezier(x + width, y + height),
      bezier(x, y + height),
    ],
  } as FreehandObject;
}

function collectDisplayObjects(objects: FreehandObject[] | undefined): FreehandObject[] {
  const out: FreehandObject[] = [];
  const visit = (list: FreehandObject[] | undefined) => {
    for (const obj of list ?? []) {
      out.push(obj);
      if (obj.type === "groupContainer" || obj.type === "booleanGroup") {
        visit((obj as { children?: FreehandObject[] }).children);
      } else if (obj.type === "clippingContainer") {
        const clip = obj as { mask?: FreehandObject; content?: FreehandObject[] };
        if (clip.mask) visit([clip.mask]);
        visit(clip.content);
      }
    }
  };
  visit(objects);
  return out;
}

function copiesOfPage(objects: FreehandObject[] | undefined, moldId: string): FreehandObject[] {
  return collectDisplayObjects(objects).filter(
    (obj) => parseMultiCardInstanceId(obj.id)?.moldLayerId === moldId,
  );
}

function layersNamed(objects: FreehandObject[] | undefined, moldId: string): FreehandObject[] {
  return collectDisplayObjects(objects).filter(
    (obj) => obj.id === moldId || parseMultiCardInstanceId(obj.id)?.moldLayerId === moldId,
  );
}

beforeEach(() => {
  resetSiteBlueprintIdSeqForTests(0);
});

function heroWithCard() {
  const committed = page([
    layer({ id: "bg", type: "rect", x: 0, y: 0, width: 800, height: 400 }),
    layer({ id: "photo", type: "rect", x: 40, y: 80, width: 240, height: 160, fill: "#888" }),
    layer({ id: "title", type: "text", x: 40, y: 260, width: 200, height: 32, text: "Card" }),
  ]);
  const index = buildSiteSelectionIndex(committed);
  const hero = createSectionFromSelection({
    blueprint: createEmptySiteBlueprintV1(),
    selectedLayerIds: ["bg", "photo", "title"],
    index,
    committedPage: committed,
    sectionType: "hero",
  });
  return { committed, index, hero };
}

describe("MultiCard", () => {
  it("creates a MultiCard inside a section with 3 cards and preserve defaults", () => {
    const { committed, index, hero } = heroWithCard();
    expect(hero.ok).toBe(true);
    if (!hero.ok || !hero.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["photo", "title"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.createdNodeId) return;
    const node = created.blueprint.nodes[created.createdNodeId];
    expect(node && isSiteMultiCardNode(node)).toBe(true);
    if (!node || !isSiteMultiCardNode(node)) return;
    expect(node.parentId).toBe(hero.createdNodeId);
    expect(node.count).toBe(3);
    expect(node.cards).toHaveLength(3);
    expect(node.layoutMode).toBe("grid");
    expect(node.gap).toBe(24);
    expect(node.layerIds).toEqual(expect.arrayContaining(["photo", "title"]));
    expect(created.blueprint.rootChildIds).not.toContain(created.createdNodeId);
    expect(validateSiteBlueprintTree(created.blueprint, index).ok).toBe(true);
    const preserve = created.blueprint.responsive?.rules.find(
      (rule) => rule.target.kind === "blueprintNode" && rule.target.nodeId === created.createdNodeId,
    );
    expect(preserve?.byBand.monitor).toBe("preserve");
    expect(preserve?.byBand.tablet).toBe("preserve");
    expect(preserve?.byBand.mobile).toBe("preserve");
    void committed;
  });

  it("rejects a MultiCard at page root", () => {
    const committed = page([
      layer({ id: "a", type: "rect", x: 0, y: 0, width: 80, height: 80 }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const created = createMultiCardFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["a"],
      index,
    });
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.code).toBe("multicard_needs_parent");
  });

  it("rejects a selection that spans two sections", () => {
    const committed = page([
      layer({ id: "a", type: "rect", x: 0, y: 0, width: 200, height: 120 }),
      layer({ id: "b", type: "rect", x: 0, y: 200, width: 200, height: 120 }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const first = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["a"],
      index,
      committedPage: committed,
      sectionType: "generic",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = createSectionFromSelection({
      blueprint: first.blueprint,
      selectedLayerIds: ["b"],
      index,
      committedPage: committed,
      sectionType: "generic",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const created = createMultiCardFromSelection({
      blueprint: second.blueprint,
      selectedLayerIds: ["a", "b"],
      index,
    });
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.code).toBe("multicard_cross_section");
  });

  it("rejects nesting a MultiCard inside another", () => {
    const { index, hero } = heroWithCard();
    if (!hero.ok || !hero.createdNodeId) return;
    const first = createMultiCardFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["photo", "title"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const nested = createMultiCardFromSelection({
      blueprint: first.blueprint,
      selectedLayerIds: ["photo"],
      index,
      preferredParentId: first.createdNodeId,
    });
    expect(nested.ok).toBe(false);
    if (nested.ok) return;
    expect(nested.code).toBe("multicard_nested");
  });

  it("multiplies a clipping frame that fills the section without locking the tree", () => {
    const committed = page([
      layer({
        id: "clip",
        type: "clippingContainer",
        x: 40,
        y: 80,
        width: 240,
        height: 160,
        mask: layer({ id: "mask", type: "rect", x: 0, y: 0, width: 240, height: 160 }),
        content: [layer({ id: "inner", type: "rect", x: 20, y: 20, width: 120, height: 80, fill: "#444" })],
      } as Partial<FreehandObject> & { id: string; type: "clippingContainer" }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["clip"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok || !hero.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["clip"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.createdNodeId) return;
    const multi = created.blueprint.nodes[created.createdNodeId];
    const section = created.blueprint.nodes[hero.createdNodeId];
    expect(multi && isSiteMultiCardNode(multi)).toBe(true);
    expect(multi?.parentId).toBe(hero.createdNodeId);
    expect(section?.childIds).toContain(created.createdNodeId);
    expect(multi?.childIds).not.toContain(hero.createdNodeId);
    expect(multi?.layerIds).toContain("clip");
    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committed,
      blueprint: created.blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "wide",
    });
    const clips = (resolved.displayPage.objects ?? []).filter(
      (obj) => obj.id === "clip" || parseMultiCardInstanceId(obj.id)?.moldLayerId === "clip",
    );
    expect(clips).toHaveLength(3);
  });

  it("keeps SVG-safe instance ids and round-trips node/card/mold", () => {
    const id = encodeMultiCardInstanceId({
      nodeId: "scmc_1",
      cardId: "scmcc_2",
      moldLayerId: "Rect 4 (trazo)",
    });
    expect(id).toMatch(/^scmcinst_[A-Za-z0-9_]+$/);
    expect(id).not.toMatch(/[/%#:]/);
    expect(parseMultiCardInstanceId(id)).toEqual({
      nodeId: "scmc_1",
      cardId: "scmcc_2",
      moldLayerId: "Rect 4 (trazo)",
    });
  });

  it("multiplies a layout group of stacked layers as one card composition", () => {
    const committed = page([
      layer({ id: "bg", type: "rect", x: 0, y: 0, width: 1920, height: 900, fill: "#eee" }),
      layer({ id: "plate", type: "rect", x: 80, y: 200, width: 220, height: 360, fill: "#1a1a1a" }),
      layer({ id: "swatch", type: "rect", x: 115, y: 250, width: 150, height: 110, fill: "#7c5cff" }),
      layer({ id: "label", type: "text", x: 115, y: 380, width: 150, height: 36, text: "SEPRONA" }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "plate", "swatch", "label"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok || !hero.createdNodeId) return;
    const grouped = createLayoutGroupFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["plate", "swatch", "label"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    expect(grouped.ok).toBe(true);
    if (!grouped.ok || !grouped.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: grouped.blueprint,
      selectedLayerIds: ["plate", "swatch", "label"],
      index,
      preferredParentId: grouped.createdNodeId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.createdNodeId) return;

    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committed,
      blueprint: created.blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "wide",
    });
    const copiesOf = (moldId: string) => copiesOfPage(resolved.displayPage.objects, moldId);
    const plates = copiesOf("plate");
    const swatches = copiesOf("swatch");
    const labels = copiesOf("label");
    expect(plates).toHaveLength(2);
    expect(swatches).toHaveLength(2);
    expect(labels).toHaveLength(2);
    const moldPlate = findDisplayObject(resolved.displayPage, "plate")!;
    const moldSwatch = findDisplayObject(resolved.displayPage, "swatch")!;
    const dx = plates[0]!.x - moldPlate.x;
    const dy = plates[0]!.y - moldPlate.y;
    expect(dx).toBeGreaterThan(10);
    expect(swatches[0]!.x - moldSwatch.x).toBeCloseTo(dx, 1);
    expect(swatches[0]!.y - moldSwatch.y).toBeCloseTo(dy, 1);
    expect(labels[0]!.x - 115).toBeCloseTo(dx, 1);
    expect(labels[0]!.y - 380).toBeCloseTo(dy, 1);

    const extraCards = (resolved.displayPage.objects ?? []).filter((obj) =>
      parseMultiCardInstanceId(obj.id),
    );
    expect(extraCards).toHaveLength(2);
    expect(extraCards.every((obj) => obj.type === "groupContainer")).toBe(true);
    expect(extraCards[0]).toMatchObject({
      children: expect.arrayContaining([
        expect.objectContaining({ id: expect.stringMatching(/^scmcinst_/) }),
      ]),
    });

    const tree = buildSiteCreatorPresentationTree({
      page: resolved.displayPage,
      blueprint: created.blueprint,
      selectionIndex: buildSiteSelectionIndex(resolved.displayPage),
      snapshot: null,
    });
    const unorganized = tree.roots.find((node) => node.kind === "unorganized");
    const dumped = unorganized?.children.some(
      (child) => child.kind === "layer" && parseMultiCardInstanceId(child.layerId),
    );
    expect(dumped).toBeFalsy();
  });

  it("clicking any multiplied card on the canvas selects the MultiCard", () => {
    const committed = page([
      layer({ id: "bg", type: "rect", x: 0, y: 0, width: 1920, height: 900, fill: "#eee" }),
      layer({ id: "plate", type: "rect", x: 80, y: 200, width: 220, height: 360, fill: "#fff" }),
      layer({
        id: "clip",
        type: "clippingContainer",
        x: 90,
        y: 210,
        width: 200,
        height: 180,
        mask: layer({ id: "mask", type: "rect", x: 0, y: 0, width: 200, height: 180 }),
        content: [
          layer({
            id: "photo",
            type: "image",
            x: 0,
            y: 0,
            width: 200,
            height: 180,
            src: "https://cdn.example/jeans.png",
          }),
        ],
      } as Partial<FreehandObject> & { id: string; type: "clippingContainer" }),
      layer({ id: "title", type: "text", x: 90, y: 400, width: 200, height: 28, text: "PANTALÓN GENIAL!" }),
      layer({ id: "price", type: "text", x: 90, y: 430, width: 80, height: 24, text: "35" }),
      layer({ id: "cta", type: "rect", x: 90, y: 470, width: 200, height: 40, fill: "#d4c4a8" }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "plate", "clip", "title", "price", "cta"],
      index,
      committedPage: committed,
      sectionType: "generic",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok || !hero.createdNodeId) return;
    const grouped = createLayoutGroupFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["plate", "clip", "title", "price", "cta"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    expect(grouped.ok).toBe(true);
    if (!grouped.ok || !grouped.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: grouped.blueprint,
      selectedLayerIds: ["plate", "clip", "title", "price", "cta"],
      index,
      preferredParentId: grouped.createdNodeId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.createdNodeId) return;
    const eight = setMultiCardCount(created.blueprint, created.createdNodeId, 8);
    expect(eight.ok).toBe(true);
    if (!eight.ok) return;

    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committed,
      blueprint: eight.blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "wide",
    });
    const displayIndex = buildSiteSelectionIndex(resolved.displayPage);
    const clipById = resolved.resolvedLayout?.objectClipById;
    const extraCards = (resolved.displayPage.objects ?? []).filter((obj) =>
      parseMultiCardInstanceId(obj.id),
    );
    expect(extraCards.length).toBeGreaterThan(0);

    const moldHit = frontmostDirectHit(
      displayIndex,
      [],
      { x: 190, y: 380 },
      eight.blueprint,
      { clipById },
    );
    expect(moldHit).toBeTruthy();
    expect(resolveRootClickUnit(moldHit!.layerId, eight.blueprint, displayIndex)).toEqual({
      kind: "blueprintNode",
      nodeId: created.createdNodeId,
    });

    for (const copy of extraCards) {
      const bounds = displayIndex.byId[copy.id]?.visualBounds;
      expect(bounds && bounds.width > 0 && bounds.height > 0).toBe(true);
      if (!bounds) continue;
      const point = {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      };
      const hit = frontmostDirectHit(displayIndex, [], point, eight.blueprint, { clipById });
      expect(hit, `copy ${copy.id} at ${point.x},${point.y}`).toBeTruthy();
      expect(resolveRootClickUnit(hit!.layerId, eight.blueprint, displayIndex)).toEqual({
        kind: "blueprintNode",
        nodeId: created.createdNodeId,
      });
    }

    const units = canvasHitTestUnits(displayIndex, [], eight.blueprint);
    expect(units.some((entry) => parseMultiCardInstanceId(entry.layerId))).toBe(true);
  });

  it("clicking a copy still selects the MultiCard after entering the mold folder", () => {
    const committed = page([
      layer({
        id: "folder",
        type: "groupContainer",
        x: 0,
        y: 0,
        width: 1920,
        height: 900,
        children: [
          layer({ id: "bg", type: "rect", x: 0, y: 0, width: 1920, height: 900, fill: "#eee" }),
          layer({ id: "plate", type: "rect", x: 80, y: 200, width: 220, height: 360, fill: "#fff" }),
          layer({ id: "title", type: "text", x: 90, y: 400, width: 200, height: 28, text: "PANTALÓN GENIAL!" }),
        ],
      } as Partial<FreehandObject> & { id: string; type: "groupContainer" }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const section = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["folder"],
      index,
      committedPage: committed,
      sectionType: "generic",
    });
    expect(section.ok).toBe(true);
    if (!section.ok || !section.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: section.blueprint,
      selectedLayerIds: ["plate", "title"],
      index,
      preferredParentId: section.createdNodeId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.createdNodeId) return;
    const eight = setMultiCardCount(created.blueprint, created.createdNodeId, 8);
    expect(eight.ok).toBe(true);
    if (!eight.ok) return;

    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committed,
      blueprint: eight.blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "wide",
    });
    const displayIndex = buildSiteSelectionIndex(resolved.displayPage);
    const clipById = resolved.resolvedLayout?.objectClipById;
    const extraCards = (resolved.displayPage.objects ?? []).filter((obj) =>
      parseMultiCardInstanceId(obj.id),
    );
    expect(extraCards.length).toBeGreaterThan(0);
    const copy = extraCards[0]!;
    expect(canEnterContainer(displayIndex.byId[copy.id] ?? null, eight.blueprint)).toBe(false);

    const bounds = displayIndex.byId[copy.id]?.visualBounds;
    expect(bounds && bounds.width > 0 && bounds.height > 0).toBe(true);
    if (!bounds) return;
    const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const hit = frontmostDirectHit(displayIndex, ["folder"], point, eight.blueprint, { clipById });
    expect(hit).toBeTruthy();
    expect(isMultiCardInstanceId(hit!.layerId)).toBe(true);
    expect(resolveRootClickUnit(hit!.layerId, eight.blueprint, displayIndex)).toEqual({
      kind: "blueprintNode",
      nodeId: created.createdNodeId,
    });
  });

  it("shifts Designer groupContainer children with the cloned card", () => {
    const committed = page([
      layer({
        id: "folder",
        type: "groupContainer",
        x: 80,
        y: 200,
        width: 220,
        height: 360,
        children: [
          layer({ id: "plate", type: "rect", x: 80, y: 200, width: 220, height: 360, fill: "#1a1a1a" }),
          layer({ id: "swatch", type: "rect", x: 115, y: 250, width: 150, height: 110, fill: "#7c5cff" }),
        ],
      } as Partial<FreehandObject> & { id: string; type: "groupContainer" }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["folder"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok || !hero.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["folder"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committed,
      blueprint: created.blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "wide",
    });
    const folders = (resolved.displayPage.objects ?? []).filter(
      (obj) => obj.id === "folder" || parseMultiCardInstanceId(obj.id)?.moldLayerId === "folder",
    );
    expect(folders).toHaveLength(3);
    const clone = folders.find((obj) => parseMultiCardInstanceId(obj.id)) as {
      children?: Array<{ id: string; x: number }>;
      x: number;
    };
    expect(clone?.children?.length).toBe(2);
    const plateCopy = clone.children?.find((child) => parseMultiCardInstanceId(child.id)?.moldLayerId === "plate");
    expect(plateCopy?.x).toBeCloseTo(clone.x, 1);
    expect(plateCopy?.x).toBeGreaterThan(80);
  });

  it("shifts path Bézier geometry with the cloned card", () => {
    const committed = page([
      layer({ id: "bg", type: "rect", x: 0, y: 0, width: 1920, height: 900, fill: "#eee" }),
      pathPlate({
        id: "plate",
        name: "Rect 4 (trazo)",
        x: 80,
        y: 200,
        width: 220,
        height: 360,
        fill: "#1a1a1a",
      }),
      layer({ id: "swatch", type: "rect", x: 115, y: 250, width: 150, height: 110, fill: "#7c5cff" }),
      layer({ id: "label", type: "text", x: 115, y: 380, width: 150, height: 36, text: "SEPRONA" }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "plate", "swatch", "label"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok || !hero.createdNodeId) return;
    const grouped = createLayoutGroupFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["plate", "swatch", "label"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    expect(grouped.ok).toBe(true);
    if (!grouped.ok || !grouped.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: grouped.blueprint,
      selectedLayerIds: ["plate", "swatch", "label"],
      index,
      preferredParentId: grouped.createdNodeId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committed,
      blueprint: created.blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "wide",
    });
    const all = collectDisplayObjects(resolved.displayPage.objects);
    const moldPlate = all.find((obj) => obj.id === "plate") as { x: number; points?: Array<{ anchor: { x: number } }> };
    const plateCopy = all.find(
      (obj) => parseMultiCardInstanceId(obj.id)?.moldLayerId === "plate",
    ) as { x: number; points?: Array<{ anchor: { x: number } }> };
    expect(plateCopy).toBeTruthy();
    const dx = plateCopy.x - moldPlate.x;
    expect(dx).toBeGreaterThan(10);
    expect(plateCopy.points?.[0]?.anchor.x).toBeCloseTo((moldPlate.points?.[0]?.anchor.x ?? 0) + dx, 1);
    const swatchCopy = all.find((obj) => parseMultiCardInstanceId(obj.id)?.moldLayerId === "swatch");
    expect(swatchCopy?.x).toBeCloseTo(115 + dx, 1);
  });

  it("clones a fully covered Designer folder as one card instead of extracting children", () => {
    const committed = page([
      layer({ id: "bg", type: "rect", x: 0, y: 0, width: 1920, height: 900, fill: "#eee" }),
      layer({
        id: "folder",
        type: "groupContainer",
        x: 80,
        y: 200,
        width: 220,
        height: 360,
        children: [
          pathPlate({ id: "plate", x: 80, y: 200, width: 220, height: 360, fill: "#1a1a1a" }),
          layer({ id: "swatch", type: "rect", x: 115, y: 250, width: 150, height: 110, fill: "#7c5cff" }),
          layer({ id: "label", type: "text", x: 115, y: 380, width: 150, height: 36, text: "SEPRONA" }),
        ],
      } as Partial<FreehandObject> & { id: string; type: "groupContainer" }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "folder"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok || !hero.createdNodeId) return;
    const grouped = createLayoutGroupFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["plate", "swatch", "label"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    expect(grouped.ok).toBe(true);
    if (!grouped.ok || !grouped.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: grouped.blueprint,
      selectedLayerIds: ["plate", "swatch", "label"],
      index,
      preferredParentId: grouped.createdNodeId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committed,
      blueprint: created.blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "wide",
    });
    const topLevel = resolved.displayPage.objects ?? [];
    const extractedSwatches = topLevel.filter(
      (obj) => parseMultiCardInstanceId(obj.id)?.moldLayerId === "swatch",
    );
    expect(extractedSwatches).toHaveLength(0);
    const folderClones = topLevel.filter(
      (obj) => parseMultiCardInstanceId(obj.id)?.moldLayerId === "folder",
    );
    expect(folderClones).toHaveLength(2);
    const clone = folderClones[0] as {
      x: number;
      children?: Array<{ id: string; type: string; x: number; points?: Array<{ anchor: { x: number } }> }>;
    };
    expect(clone.children?.map((child) => parseMultiCardInstanceId(child.id)?.moldLayerId).sort()).toEqual(
      ["label", "plate", "swatch"],
    );
    const plateCopy = clone.children?.find((child) => parseMultiCardInstanceId(child.id)?.moldLayerId === "plate");
    expect(plateCopy?.x).toBeCloseTo(clone.x, 1);
    expect(plateCopy?.points?.[0]?.anchor.x).toBeCloseTo(clone.x, 1);
  });

  it("remaps sibling clipMaskId onto the cloned card", () => {
    const committed = page([
      layer({ id: "bg", type: "rect", x: 0, y: 0, width: 1920, height: 900, fill: "#eee" }),
      layer({
        id: "plate",
        type: "rect",
        x: 80,
        y: 200,
        width: 220,
        height: 360,
        fill: "#1a1a1a",
        isClipMask: true,
      } as Partial<FreehandObject> & { id: string; type: "rect" }),
      layer({
        id: "swatch",
        type: "rect",
        x: 115,
        y: 250,
        width: 150,
        height: 110,
        fill: "#7c5cff",
        clipMaskId: "plate",
      } as Partial<FreehandObject> & { id: string; type: "rect" }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "plate", "swatch"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok || !hero.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["plate", "swatch"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committed,
      blueprint: created.blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "wide",
    });
    const all = collectDisplayObjects(resolved.displayPage.objects);
    const plateCopy = all.find((obj) => parseMultiCardInstanceId(obj.id)?.moldLayerId === "plate");
    const swatchCopy = all.find((obj) => parseMultiCardInstanceId(obj.id)?.moldLayerId === "swatch") as {
      clipMaskId?: string;
    };
    expect(plateCopy).toBeTruthy();
    expect(swatchCopy?.clipMaskId).toBe(plateCopy?.id);
    expect(swatchCopy?.clipMaskId).not.toBe("plate");
  });

  it("multiplies a Site Creator group with an image as whole cards, not loose copies", () => {
    const committed = page([
      layer({ id: "bg", type: "rect", x: 0, y: 0, width: 1920, height: 900, fill: "#eee" }),
      layer({ id: "plate", type: "rect", x: 80, y: 200, width: 220, height: 360, fill: "#1a1a1a" }),
      layer({
        id: "photo",
        type: "image",
        x: 100,
        y: 230,
        width: 180,
        height: 140,
        src: "https://cdn.example/card.png",
      }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "plate", "photo"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok || !hero.createdNodeId) return;
    const grouped = createLayoutGroupFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["plate", "photo"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    expect(grouped.ok).toBe(true);
    if (!grouped.ok || !grouped.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: grouped.blueprint,
      selectedLayerIds: ["plate", "photo"],
      index,
      preferredParentId: grouped.createdNodeId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committed,
      blueprint: created.blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "wide",
    });
    const topLevel = resolved.displayPage.objects ?? [];
    const originalPhoto = topLevel.find((obj) => obj.id === "photo") as { x: number; src?: string };
    expect(originalPhoto?.src).toBe("https://cdn.example/card.png");
    expect(originalPhoto?.x).toBe(100);
    expect(topLevel.filter((obj) => parseMultiCardInstanceId(obj.id)?.moldLayerId === "photo")).toHaveLength(0);
    const extraCards = topLevel.filter((obj) => parseMultiCardInstanceId(obj.id));
    expect(extraCards).toHaveLength(2);
    expect(extraCards.every((obj) => obj.type === "groupContainer")).toBe(true);
    const photoCopies = copiesOfPage(topLevel, "photo");
    expect(photoCopies).toHaveLength(2);
    expect(photoCopies.every((obj) => (obj as { src?: string }).src === "https://cdn.example/card.png")).toBe(true);
    expect(photoCopies[0]!.x).toBeGreaterThan(100);
  });

  it("does not stuff image copies into the original group; clipped photos stay in the mask", () => {
    const committed = page([
      layer({ id: "bg", type: "rect", x: 0, y: 0, width: 1920, height: 900, fill: "#eee" }),
      layer({
        id: "folder",
        type: "groupContainer",
        x: 80,
        y: 200,
        width: 220,
        height: 360,
        children: [
          layer({ id: "plate", type: "rect", x: 80, y: 200, width: 220, height: 360, fill: "#1a1a1a" }),
          layer({
            id: "clip",
            type: "clippingContainer",
            x: 100,
            y: 230,
            width: 180,
            height: 140,
            mask: layer({ id: "mask", type: "rect", x: 0, y: 0, width: 180, height: 140 }),
            content: [
              layer({
                id: "photo",
                type: "image",
                x: -20,
                y: -10,
                width: 220,
                height: 160,
                src: "https://cdn.example/card.png",
              }),
            ],
          } as Partial<FreehandObject> & { id: string; type: "clippingContainer" }),
        ],
      } as Partial<FreehandObject> & { id: string; type: "groupContainer" }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "folder"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok || !hero.createdNodeId) return;
    const grouped = createLayoutGroupFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["plate", "clip"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    expect(grouped.ok).toBe(true);
    if (!grouped.ok || !grouped.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: grouped.blueprint,
      selectedLayerIds: ["plate", "clip"],
      index,
      preferredParentId: grouped.createdNodeId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committed,
      blueprint: created.blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "wide",
    });
    const originalFolder = (resolved.displayPage.objects ?? []).find((obj) => obj.id === "folder") as {
      children?: Array<{ id: string; type: string; content?: Array<{ id: string; x: number; src?: string }> }>;
    };
    expect(originalFolder?.children?.some((child) => parseMultiCardInstanceId(child.id))).toBeFalsy();
    const originalPhoto = originalFolder?.children
      ?.find((child) => child.id === "clip")
      ?.content?.find((child) => child.id === "photo");
    expect(originalPhoto?.src).toBe("https://cdn.example/card.png");
    expect(originalPhoto?.x).toBe(-20);

    const topLevel = resolved.displayPage.objects ?? [];
    const extractedPhotos = topLevel.filter(
      (obj) => parseMultiCardInstanceId(obj.id)?.moldLayerId === "photo",
    );
    expect(extractedPhotos).toHaveLength(0);

    const folderClones = topLevel.filter(
      (obj) => parseMultiCardInstanceId(obj.id)?.moldLayerId === "folder",
    );
    expect(folderClones.length).toBeGreaterThan(0);
    const cloneClip = (
      folderClones[0] as {
        children?: Array<{
          id: string;
          x: number;
          content?: Array<{ id: string; x: number; src?: string }>;
        }>;
      }
    ).children?.find((child) => parseMultiCardInstanceId(child.id)?.moldLayerId === "clip");
    const clonePhoto = cloneClip?.content?.find(
      (child) => parseMultiCardInstanceId(child.id)?.moldLayerId === "photo",
    );
    expect(clonePhoto?.src).toBe("https://cdn.example/card.png");
    expect(clonePhoto?.x).toBe(-20);
    expect(cloneClip?.x).toBeGreaterThan(100);
  });

  it("cloneBlueprint keeps kind multicard (does not become a layoutGroup)", () => {
    const { index, hero } = heroWithCard();
    if (!hero.ok || !hero.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["photo", "title"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.createdNodeId) return;
    const history = pushBlueprintHistory(createBlueprintHistory(hero.blueprint), created.blueprint);
    const cloned = cloneBlueprint(history.present);
    const node = cloned.nodes[created.createdNodeId];
    expect(node && isSiteMultiCardNode(node)).toBe(true);
    if (!node || !isSiteMultiCardNode(node)) return;
    expect(node.cards).toHaveLength(3);
    expect(node.count).toBe(3);
  });

  it("parse drops invalid cards and keeps at least card 1", () => {
    const parsed = parseSiteCreatorNodeData({
      schemaVersion: 1,
      blueprint: {
        schemaVersion: 1,
        rootChildIds: ["scsec_hero"],
        nodes: {
          scsec_hero: {
            id: "scsec_hero",
            kind: "section",
            sectionType: "hero",
            label: "Hero",
            parentId: null,
            childIds: ["scmc_one"],
            layerIds: [],
            sourceRange: { top: 0, bottom: 400 },
          },
          scmc_one: {
            id: "scmc_one",
            kind: "multicard",
            label: "MultiCard",
            parentId: "scsec_hero",
            childIds: [],
            layerIds: ["photo"],
            count: 99,
            layoutMode: "nope",
            gap: -4,
            cards: [{ id: "bad" }, { id: "scmcc_ok", overrides: { photo: { text: "Hola" } } }],
          },
        },
      },
    });
    const node = parsed.blueprint.nodes.scmc_one as SiteBlueprintMultiCardNode;
    expect(node.kind).toBe("multicard");
    expect(node.layoutMode).toBe("grid");
    expect(node.gap).toBe(24);
    expect(node.cards).toHaveLength(1);
    expect(node.cards[0]?.id).toBe("scmcc_ok");
    expect(node.count).toBe(1);
    expect(node.cards[0]?.overrides.photo?.text).toBe("Hola");
  });

  it("removing the MultiCard restores mold layers to the section", () => {
    const { index, hero } = heroWithCard();
    if (!hero.ok || !hero.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["photo", "title"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.createdNodeId) return;
    const removed = removeBlueprintNodePreservingContent(created.blueprint, created.createdNodeId);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.blueprint.nodes[created.createdNodeId]).toBeUndefined();
    const section = removed.blueprint.nodes[hero.createdNodeId];
    expect(section?.layerIds).toEqual(expect.arrayContaining(["photo", "title"]));
  });

  it("shows Multiplicar on a layer selection inside a section", () => {
    const { committed, index, hero } = heroWithCard();
    expect(hero.ok).toBe(true);
    if (!hero.ok) return;
    const model = resolveContextualModel({
      units: [
        { kind: "layer", layerId: "photo" },
        { kind: "layer", layerId: "title" },
      ],
      inspectNodeId: null,
      blueprint: hero.blueprint,
      index,
      snapshot: null,
      persistGate: { allowed: true, mode: "synced" },
    });
    expect(model.primaryActions.some((action) => action.id === "createMultiCard")).toBe(true);
    expect(model.primaryActions.find((action) => action.id === "createMultiCard")?.label).toBe(
      "Multiplicar",
    );
    void committed;
  });

  it("plans a 3-card grid with automatic columns", () => {
    const planned = planMultiCardGrid({
      mold: { x: 40, y: 80, width: 240, height: 212 },
      count: 3,
      gap: 24,
      containerWidth: 800,
      layoutMode: "grid",
    });
    expect(planned.cols).toBe(3);
    expect(planned.rows).toBe(1);
    expect(planned.cardRects).toHaveLength(3);
    expect(planned.cardRects[0]).toEqual({ x: 40, y: 80, width: 240, height: 212 });
    expect(planned.cardRects[1]?.x).toBe(40 + 240 + 24);
    expect(planned.container.height).toBe(212);
  });

  it("plans scrollH with the full container width and as many cards as fit", () => {
    const planned = planMultiCardGrid({
      mold: { x: 40, y: 80, width: 240, height: 212 },
      count: 7,
      gap: 24,
      containerWidth: 800,
      layoutMode: "scrollH",
    });
    expect(planned.container.width).toBe(800);
    expect(planned.cardRects).toHaveLength(7);
    expect(planned.cardRects[0]).toEqual({ x: 40, y: 80, width: 240, height: 212 });
    expect(planned.cardRects[1]?.x).toBe(40 + 240 + 24);
    const visible = multiCardVisibleCount({
      viewportSize: planned.container.width,
      cardSize: 240,
      gap: 24,
      count: 7,
    });
    expect(visible).toBe(3);
    expect(multiCardMaxScrollIndex(7, visible)).toBe(4);
    expect(clampMultiCardScrollIndex(7, 9, visible)).toBe(4);
    expect(easePower2InOut(0)).toBe(0);
    expect(easePower2InOut(1)).toBe(1);
    expect(easePower2InOut(0.5)).toBeCloseTo(0.5, 5);
  });

  it("instantiates 3 cards on Original and keeps Designer sync", () => {
    const { committed, index, hero } = heroWithCard();
    if (!hero.ok || !hero.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["photo", "title"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.createdNodeId) return;
    const node = created.blueprint.nodes[created.createdNodeId];
    if (!node || !isSiteMultiCardNode(node)) return;

    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committed,
      blueprint: created.blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "wide",
    });
    const photos = layersNamed(resolved.displayPage.objects, "photo");
    const titles = layersNamed(resolved.displayPage.objects, "title");
    expect(photos).toHaveLength(3);
    expect(titles).toHaveLength(3);
    expect(photos[1]!.x).toBeCloseTo(40 + 240 + 24, 1);
    expect(titles[1]!.x).toBeCloseTo(40 + 240 + 24, 1);
    expect(resolved.multiCard?.containers[0]?.layoutMode).toBe("grid");

    const caption = findDisplayObject(resolved.displayPage, "bg");
    expect(caption).toBeTruthy();

    const live = {
      ...committed,
      objects: (committed.objects ?? []).map((obj) =>
        obj.id === "title" ? { ...obj, text: "Live" } : obj,
      ),
    };
    const synced = resolveSiteCreatorResponsiveDisplay({
      page: live,
      blueprint: created.blueprint,
      referenceIndex: buildSiteSelectionIndex(live),
      viewportWidth: 1920,
      band: "wide",
    });
    const syncedTitles = layersNamed(synced.displayPage.objects, "title");
    expect(syncedTitles.every((obj) => (obj as { text?: string }).text === "Live")).toBe(true);
  });

  it("applies a text override only on that card", () => {
    const { committed, index, hero } = heroWithCard();
    if (!hero.ok || !hero.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["photo", "title"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    if (!created.ok || !created.createdNodeId) return;
    const node = created.blueprint.nodes[created.createdNodeId];
    if (!node || !isSiteMultiCardNode(node)) return;
    const card2 = node.cards[1]!;
    const next = {
      ...created.blueprint,
      nodes: {
        ...created.blueprint.nodes,
        [node.id]: {
          ...node,
          cards: node.cards.map((card) =>
            card.id === card2.id
              ? { ...card, overrides: { title: { text: "Otra" } } }
              : card,
          ),
        },
      },
    };
    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committed,
      blueprint: next,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "wide",
    });
    const moldTitle = findDisplayObject(resolved.displayPage, "title");
    expect((moldTitle as { text?: string } | undefined)?.text).toBe("Card");
    const copies = copiesOfPage(resolved.displayPage.objects, "title");
    const overridden = copies.find((obj) => parseMultiCardInstanceId(obj.id)?.cardId === card2.id);
    expect((overridden as { text?: string } | undefined)?.text).toBe("Otra");
    const other = copies.find((obj) => parseMultiCardInstanceId(obj.id)?.cardId !== card2.id);
    expect((other as { text?: string } | undefined)?.text).toBe("Card");
  });

  it("applies a media override only on that card and leaves the mold source unchanged", () => {
    const committed = page([
      layer({ id: "bg", type: "rect", x: 0, y: 0, width: 800, height: 400 }),
      layer({
        id: "photo",
        type: "image",
        x: 40,
        y: 80,
        width: 240,
        height: 160,
        src: "https://cdn.example/mold.png",
      }),
      layer({ id: "title", type: "text", x: 40, y: 260, width: 200, height: 32, text: "Card" }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "photo", "title"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok || !hero.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["photo", "title"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.createdNodeId) return;
    const node = created.blueprint.nodes[created.createdNodeId];
    if (!node || !isSiteMultiCardNode(node)) return;
    const card2 = node.cards[1]!;
    const patched = setMultiCardSlotOverride({
      blueprint: created.blueprint,
      nodeId: node.id,
      cardId: card2.id,
      moldLayerId: "photo",
      patch: { mediaRef: { src: "https://cdn.example/card2.png" } },
    });
    expect(patched.ok).toBe(true);
    if (!patched.ok) return;
    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committed,
      blueprint: patched.blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "wide",
    });
    const moldPhoto = findDisplayObject(resolved.displayPage, "photo");
    expect((moldPhoto as { src?: string } | undefined)?.src).toBe("https://cdn.example/mold.png");
    const copies = copiesOfPage(resolved.displayPage.objects, "photo");
    const overridden = copies.find((obj) => parseMultiCardInstanceId(obj.id)?.cardId === card2.id);
    expect((overridden as { src?: string } | undefined)?.src).toBe("https://cdn.example/card2.png");
    const other = copies.find((obj) => parseMultiCardInstanceId(obj.id)?.cardId !== card2.id);
    expect((other as { src?: string } | undefined)?.src).toBe("https://cdn.example/mold.png");
    expect((committed.objects?.find((obj) => obj.id === "photo") as { src?: string } | undefined)?.src).toBe(
      "https://cdn.example/mold.png",
    );
  });

  it("publishes card-1 media override on the mold layer without stealing it for copies", () => {
    const committed = page([
      layer({ id: "bg", type: "rect", x: 0, y: 0, width: 800, height: 400 }),
      layer({
        id: "photo",
        type: "image",
        x: 40,
        y: 80,
        width: 240,
        height: 160,
        src: "https://cdn.example/mold.png",
      }),
      layer({ id: "title", type: "text", x: 40, y: 260, width: 200, height: 32, text: "Card" }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "photo", "title"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok || !hero.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["photo", "title"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.createdNodeId) return;
    const node = created.blueprint.nodes[created.createdNodeId];
    if (!node || !isSiteMultiCardNode(node)) return;
    const card1 = node.cards[0]!;
    const card2 = node.cards[1]!;
    let next = setMultiCardSlotOverride({
      blueprint: created.blueprint,
      nodeId: node.id,
      cardId: card1.id,
      moldLayerId: "photo",
      patch: { mediaRef: { src: "https://cdn.example/card1.png" } },
    });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    next = setMultiCardSlotOverride({
      blueprint: next.blueprint,
      nodeId: node.id,
      cardId: card2.id,
      moldLayerId: "photo",
      patch: { mediaRef: { src: "https://cdn.example/card2.png" } },
    });
    expect(next.ok).toBe(true);
    if (!next.ok) return;

    const refs = collectPublishImageRefs(committed, next.blueprint);
    const card1Id = encodeMultiCardInstanceId({
      nodeId: node.id,
      cardId: card1.id,
      moldLayerId: "photo",
    });
    const card2Id = encodeMultiCardInstanceId({
      nodeId: node.id,
      cardId: card2.id,
      moldLayerId: "photo",
    });
    expect(refs.find((ref) => ref.layerId === "photo")?.src).toBe("https://cdn.example/mold.png");
    expect(refs.find((ref) => ref.layerId === card1Id)?.src).toBe("https://cdn.example/card1.png");
    expect(refs.find((ref) => ref.layerId === card2Id)?.src).toBe("https://cdn.example/card2.png");
    expect(refs.filter((ref) => ref.src === "https://cdn.example/mold.png")).toHaveLength(1);

    const hrefMap = Object.fromEntries(
      refs.map((ref) => [ref.layerId, publishAssetPlaceholder(ref.layerId)]),
    );
    const compiled = compilePublishedSite({
      page: committed,
      blueprint: next.blueprint,
      title: "Carrusel",
      imageHrefByLayerId: hrefMap,
    });
    expect(compiled.html).toContain(publishAssetPlaceholder(card1Id));
    expect(compiled.html).toContain(publishAssetPlaceholder(card2Id));
    expect(compiled.html).toContain(publishAssetPlaceholder("photo"));

    const display = resolveSiteCreatorResponsiveDisplay({
      page: committed,
      blueprint: next.blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "wide",
    });
    expect((findDisplayObject(display.displayPage, "photo") as { src?: string } | undefined)?.src).toBe(
      "https://cdn.example/card1.png",
    );
    const copy3 = copiesOfPage(display.displayPage.objects, "photo").find((obj) => {
      const parsed = parseMultiCardInstanceId(obj.id);
      return parsed?.cardId !== card1.id && parsed?.cardId !== card2.id;
    });
    expect((copy3 as { src?: string } | undefined)?.src).toBe("https://cdn.example/mold.png");
  });

  it("pushes content below the mold when the grid grows a row", () => {
    const committed = page([
      layer({ id: "bg", type: "rect", x: 0, y: 0, width: 1920, height: 400 }),
      layer({ id: "photo", type: "rect", x: 40, y: 80, width: 700, height: 160, fill: "#888" }),
      layer({ id: "title", type: "text", x: 40, y: 260, width: 200, height: 32, text: "Card" }),
      layer({ id: "below", type: "text", x: 40, y: 360, width: 200, height: 24, text: "Below" }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "photo", "title", "below"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok || !hero.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["photo", "title"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committed,
      blueprint: created.blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "wide",
    });
    const below = findDisplayObject(resolved.displayPage, "below");
    expect(below).toBeTruthy();
    expect(below!.y).toBeGreaterThan(360);
  });

  it("clicking a copy selects the MultiCard", () => {
    const { committed, index, hero } = heroWithCard();
    if (!hero.ok || !hero.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["photo", "title"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    if (!created.ok || !created.createdNodeId) return;
    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committed,
      blueprint: created.blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "wide",
    });
    const copy = (resolved.displayPage.objects ?? []).find((obj) => parseMultiCardInstanceId(obj.id));
    expect(copy).toBeTruthy();
    const displayIndex = buildSiteSelectionIndex(resolved.displayPage);
    expect(resolveRootClickUnit(copy!.id, created.blueprint, displayIndex)).toEqual({
      kind: "blueprintNode",
      nodeId: created.createdNodeId,
    });
  });

  it("stepper changes count and layout mode", () => {
    const { index, hero } = heroWithCard();
    if (!hero.ok || !hero.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["photo", "title"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    if (!created.ok || !created.createdNodeId) return;
    const four = setMultiCardCount(created.blueprint, created.createdNodeId, 4);
    expect(four.ok).toBe(true);
    if (!four.ok) return;
    const node = four.blueprint.nodes[created.createdNodeId];
    expect(node && isSiteMultiCardNode(node) && node.count).toBe(4);
    const scrolled = setMultiCardLayoutMode(four.blueprint, created.createdNodeId, "scrollH");
    expect(scrolled.ok).toBe(true);
    if (!scrolled.ok) return;
    const next = scrolled.blueprint.nodes[created.createdNodeId];
    expect(next && isSiteMultiCardNode(next) && next.layoutMode).toBe("scrollH");
  });

  it("duplicates a card and refuses to delete card 1", () => {
    const { index, hero } = heroWithCard();
    if (!hero.ok || !hero.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["photo", "title"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    if (!created.ok || !created.createdNodeId) return;
    const node = created.blueprint.nodes[created.createdNodeId];
    if (!node || !isSiteMultiCardNode(node)) return;
    const duplicated = duplicateMultiCardCard(created.blueprint, node.id, node.cards[1]!.id);
    expect(duplicated.ok).toBe(true);
    if (!duplicated.ok) return;
    const after = duplicated.blueprint.nodes[node.id];
    expect(after && isSiteMultiCardNode(after) && after.count).toBe(4);
    const blocked = removeMultiCardCard(duplicated.blueprint, node.id, node.cards[0]!.id);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.code).toBe("multicard_card1");
  });

  it("mobile grid becomes scrollH unless the band overrides it", () => {
    const { index, hero } = heroWithCard();
    if (!hero.ok || !hero.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["photo", "title"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    if (!created.ok || !created.createdNodeId) return;
    const node = created.blueprint.nodes[created.createdNodeId];
    if (!node || !isSiteMultiCardNode(node)) return;
    const auto = resolveMultiCardBandPresentation(created.blueprint, node, "mobile", 390, 1920);
    expect(auto.layoutMode).toBe("scrollH");
    expect(auto.mobileAutoScrollH).toBe(true);
    const forced = setMultiCardLayoutMode(created.blueprint, node.id, "grid", "mobile");
    expect(forced.ok).toBe(true);
    if (!forced.ok) return;
    const forcedNode = forced.blueprint.nodes[node.id];
    if (!forcedNode || !isSiteMultiCardNode(forcedNode)) return;
    const explicit = resolveMultiCardBandPresentation(forced.blueprint, forcedNode, "mobile", 390, 1920);
    expect(explicit.layoutMode).toBe("grid");
  });

  it("scrollH clips copies and scroll index 1 moves the mold", () => {
    const { committed, index, hero } = heroWithCard();
    if (!hero.ok || !hero.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["photo", "title"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.createdNodeId) return;
    const scrolled = setMultiCardLayoutMode(created.blueprint, created.createdNodeId, "scrollH");
    expect(scrolled.ok).toBe(true);
    if (!scrolled.ok) return;
    const counted = setMultiCardCount(scrolled.blueprint, created.createdNodeId, 8);
    expect(counted.ok).toBe(true);
    if (!counted.ok) return;
    const at0 = resolveSiteCreatorResponsiveDisplay({
      page: committed,
      blueprint: counted.blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "wide",
    });
    const container = at0.multiCard?.containers.find((item) => item.nodeId === created.createdNodeId);
    expect(container?.axis).toBe("h");
    expect(container?.overflow).toBe(true);
    expect(container?.layoutRect.width).toBeGreaterThan(600);
    expect(container?.visibleCount).toBeGreaterThanOrEqual(2);
    expect(at0.resolvedLayout?.objectClipById.photo).toEqual(container?.clipRect);
    expect(multiCardNavIsVisible({ overflow: false, visibility: "auto" })).toBe(false);
    expect(multiCardNavIsVisible({ overflow: true, visibility: "hidden" })).toBe(false);
    expect(multiCardNavIsVisible({ overflow: true, visibility: "auto" })).toBe(true);

    const mold0 = findDisplayObject(at0.displayPage, "photo");
    const at1 = resolveSiteCreatorResponsiveDisplay({
      page: committed,
      blueprint: counted.blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "wide",
      multiCardScrollIndexByNodeId: { [created.createdNodeId]: 1 },
    });
    const mold1 = findDisplayObject(at1.displayPage, "photo");
    expect(mold0).toBeTruthy();
    expect(mold1).toBeTruthy();
    expect(mold1!.x).toBeLessThan(mold0!.x);
    expect(at1.multiCard?.containers[0]?.scrollIndex).toBe(1);
    expect(clampMultiCardScrollIndex(3, 9)).toBe(2);

    const displayIndex = buildSiteSelectionIndex(at1.displayPage);
    const clip = at1.resolvedLayout?.objectClipById.photo;
    expect(clip).toBeTruthy();
    const outside = { x: mold1!.x + 8, y: mold1!.y + 8 };
    expect(outside.x).toBeLessThan(clip!.x);
    expect(
      frontmostDirectHit(displayIndex, [], outside, counted.blueprint, {
        clipById: at1.resolvedLayout?.objectClipById,
      })?.layerId === "photo",
    ).toBe(false);
  });

  it("publishes a MultiCard viewport wrapper and carousel script", () => {
    const { committed, index, hero } = heroWithCard();
    if (!hero.ok || !hero.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["photo", "title"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const scrolled = setMultiCardLayoutMode(created.blueprint, created.createdNodeId!, "scrollH");
    expect(scrolled.ok).toBe(true);
    if (!scrolled.ok) return;
    const compiled = compilePublishedSite({
      page: committed,
      blueprint: scrolled.blueprint,
      title: "Carrusel",
      imageHrefByLayerId: {},
    });
    expect(compiled.html).toContain('class="s-mc');
    expect(compiled.html).toContain("s-mc-track");
    expect(compiled.css).toContain(".s-mc{");
    expect(compiled.js).toContain("[data-mc]");
    expect(compiled.js).toContain("__sMcConsumeWheel");
    expect(compiled.css).toContain("cubic-bezier(0.455, 0.03, 0.515, 0.955)");
  });
});
