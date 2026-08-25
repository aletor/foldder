import { describe, expect, it } from "vitest";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import { getVisualAABB } from "@/app/spaces/FreehandStudio";
import { buildSiteSelectionIndex, isolationUnits, sortFrontToBack } from "./build-site-selection-index";
import { reconcileDesignerGroupMirrors } from "./site-creator-designer-group-bootstrap";
import { dismissDesignerContainerMirror, dismissDesignerGroupIdMirror } from "./site-creator-designer-group-dismiss";
import {
  clientPointToPagePoint,
  pagePointToClientPoint,
  pageRectToStageRect,
} from "./site-creator-coordinate-space";
import { resolveSiteCreatorDisplayPage } from "./site-creator-display-page";
import {
  canEnterContainer,
  collapseContainerDescendants,
  frontmostDirectHit,
  layerPickerHitsAtPoint,
  marqueeHits,
} from "./site-creator-hit-test";
import {
  EMPTY_SITE_CREATOR_SELECTION,
  type SiteCreatorSelectionState,
} from "./site-creator-selection-types";
import { reduceSiteCreatorSelection, reconcileSelectionToIndex } from "./site-creator-selection-reducer";
import { buildDesignerSourceSnapshot } from "./designer-source-snapshot";
import {
  createDefaultSiteCreatorNodeData,
  createEmptySiteBlueprintV1,
  parseSiteCreatorNodeData,
  type SiteBlueprintV1,
} from "./site-creator-types";

function layer(partial: Partial<FreehandObject> & { id: string; type: FreehandObject["type"] }): FreehandObject {
  return {
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
  } as FreehandObject;
}

function page(objects: FreehandObject[]): DesignerPageState {
  return { id: "pg", format: "web169", objects };
}

function reduce(
  indexPage: DesignerPageState,
  actions: Parameters<typeof reduceSiteCreatorSelection>[1][],
  initial: SiteCreatorSelectionState = EMPTY_SITE_CREATOR_SELECTION,
  blueprint?: SiteBlueprintV1,
) {
  const index = buildSiteSelectionIndex(indexPage);
  return {
    index,
    state: actions.reduce(
      (state, action) => reduceSiteCreatorSelection(state, action, index, blueprint),
      initial,
    ),
  };
}

describe("site creator selection index", () => {
  it("indexes root layers", () => {
    const index = buildSiteSelectionIndex(
      page([
        layer({ id: "a", type: "rect", x: 0, y: 0, width: 10, height: 10 }),
        layer({ id: "b", type: "rect", x: 20, y: 0, width: 10, height: 10 }),
      ]),
    );
    expect(index.entries.map((e) => e.layerId)).toEqual(["a", "b"]);
    expect(index.byId.a?.parentLayerId).toBeNull();
    expect(index.byId.b?.depth).toBe(0);
  });

  it("indexes nested group children", () => {
    const index = buildSiteSelectionIndex(
      page([
        layer({
          id: "g",
          type: "groupContainer",
          width: 100,
          height: 100,
          children: [
            layer({ id: "c1", type: "rect", x: 2, y: 2, width: 8, height: 8 }),
            layer({ id: "c2", type: "ellipse", x: 20, y: 2, width: 8, height: 8 }),
          ],
        }),
      ]),
    );
    expect(index.entries.map((e) => e.layerId)).toEqual(["g", "c1", "c2"]);
    expect(index.byId.c1?.parentLayerId).toBe("g");
    expect(index.byId.c1?.ancestorIds).toEqual(["g"]);
    expect(index.byId.g?.containerKind).toBe("groupContainer");
  });

  it("assigns later siblings a higher z-order", () => {
    const index = buildSiteSelectionIndex(
      page([
        layer({ id: "back", type: "rect" }),
        layer({ id: "front", type: "rect" }),
      ]),
    );
    const sorted = sortFrontToBack(index.entries);
    expect(sorted[0]?.layerId).toBe("front");
  });
});

describe("site creator hit testing", () => {
  const overlap = page([
    layer({ id: "back", type: "rect", x: 0, y: 0, width: 80, height: 80 }),
    layer({ id: "front", type: "rect", x: 10, y: 10, width: 80, height: 80 }),
  ]);

  it("selects the frontmost layer first", () => {
    const index = buildSiteSelectionIndex(overlap);
    const hit = frontmostDirectHit(index, [], { x: 20, y: 20 });
    expect(hit?.layerId).toBe("front");
  });

  it("clicks through a front image when other content is under the cursor", () => {
    const index = buildSiteSelectionIndex(
      page([
        layer({ id: "title", type: "rect", x: 40, y: 40, width: 120, height: 40 }),
        layer({ id: "bg", type: "image", x: 0, y: 0, width: 400, height: 300, src: "data:," }),
      ]),
    );
    // La imagen está delante en z-order y cubre el contenido; el clic debe ir a la forma.
    expect(frontmostDirectHit(index, [], { x: 60, y: 50 })?.layerId).toBe("title");
  });

  it("still selects an image when it is the only hit under the cursor", () => {
    const index = buildSiteSelectionIndex(
      page([
        layer({ id: "title", type: "rect", x: 0, y: 0, width: 40, height: 20 }),
        layer({ id: "bg", type: "image", x: 200, y: 200, width: 100, height: 100, src: "data:," }),
      ]),
    );
    expect(frontmostDirectHit(index, [], { x: 220, y: 220 })?.layerId).toBe("bg");
  });

  it("clicks through a front image onto a group in front of the design stack", () => {
    const index = buildSiteSelectionIndex(
      page([
        layer({
          id: "folder",
          type: "groupContainer",
          x: 10,
          y: 10,
          width: 100,
          height: 80,
          children: [layer({ id: "inner", type: "rect", x: 20, y: 20, width: 40, height: 40 })],
        }),
        layer({ id: "bg", type: "image", x: 0, y: 0, width: 400, height: 300, src: "data:," }),
      ]),
    );
    expect(frontmostDirectHit(index, [], { x: 30, y: 30 })?.layerId).toBe("folder");
  });

  it("hits children on canvas after a folder mirror was dismissed", () => {
    const indexPage = page([
      layer({
        id: "folder",
        type: "groupContainer",
        x: 10,
        y: 10,
        width: 120,
        height: 100,
        children: [
          layer({
            id: "title",
            type: "rect",
            x: 20,
            y: 20,
            width: 80,
            height: 24,
          }),
        ],
      }),
    ]);
    const index = buildSiteSelectionIndex(indexPage);
    const withMirror = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const blueprint = dismissDesignerContainerMirror(withMirror, "folder");
    expect(frontmostDirectHit(index, [], { x: 30, y: 30 }, blueprint)?.layerId).toBe("title");
  });

  it("excludes hidden layers from canvas hits", () => {
    const index = buildSiteSelectionIndex(
      page([
        layer({ id: "hidden", type: "rect", x: 0, y: 0, width: 80, height: 80, visible: false }),
        layer({ id: "shown", type: "rect", x: 0, y: 0, width: 80, height: 80 }),
      ]),
    );
    expect(index.byId.hidden?.selectableFromCanvas).toBe(false);
    expect(frontmostDirectHit(index, [], { x: 10, y: 10 })?.layerId).toBe("shown");
  });

  it("excludes opacity 0 from direct click", () => {
    const index = buildSiteSelectionIndex(
      page([
        layer({ id: "ghost", type: "rect", x: 0, y: 0, width: 80, height: 80, opacity: 0 }),
        layer({ id: "solid", type: "rect", x: 40, y: 0, width: 80, height: 80 }),
      ]),
    );
    expect(index.byId.ghost?.directClickable).toBe(false);
    expect(index.byId.ghost?.selectableFromCanvas).toBe(true);
    expect(frontmostDirectHit(index, [], { x: 10, y: 10 })).toBeNull();
  });

  it("allows selecting locked layers", () => {
    const index = buildSiteSelectionIndex(
      page([layer({ id: "lock", type: "rect", x: 0, y: 0, width: 80, height: 80, locked: true })]),
    );
    expect(index.byId.lock?.locked).toBe(true);
    expect(frontmostDirectHit(index, [], { x: 10, y: 10 })?.layerId).toBe("lock");
  });

  it("skips Site Creator canvas-locked layers even if Designer locked is false", () => {
    const index = buildSiteSelectionIndex(
      page([
        layer({ id: "back", type: "rect", x: 0, y: 0, width: 80, height: 80 }),
        layer({ id: "front", type: "rect", x: 0, y: 0, width: 80, height: 80 }),
      ]),
    );
    const blueprint: SiteBlueprintV1 = {
      ...createEmptySiteBlueprintV1(),
      canvasLocks: { layerIds: ["front"] },
    };
    expect(frontmostDirectHit(index, [], { x: 10, y: 10 }, blueprint)?.layerId).toBe("back");
  });
});

describe("site creator groups and isolation", () => {
  const grouped = page([
    layer({
      id: "folder",
      type: "groupContainer",
      name: "Grupo",
      x: 0,
      y: 0,
      width: 120,
      height: 80,
      children: [
        layer({ id: "inner", type: "rect", x: 8, y: 8, width: 30, height: 30 }),
        layer({ id: "inner2", type: "rect", x: 50, y: 8, width: 30, height: 30 }),
      ],
    }),
  ]);

  it("treats groupContainer as the initial unit", () => {
    const index = buildSiteSelectionIndex(grouped);
    expect(frontmostDirectHit(index, [], { x: 20, y: 20 })?.layerId).toBe("folder");
    expect(isolationUnits(index, []).map((e) => e.layerId)).toEqual(["folder"]);
  });

  it("double click enters a groupContainer", () => {
    const { state } = reduce(grouped, [
      { type: "click", layerId: "folder", additive: false },
      { type: "doubleClickEnter", containerId: "folder", childId: "inner" },
    ]);
    expect(state.isolationIds).toEqual(["folder"]);
    expect(state.selectedIds).toEqual(["inner"]);
  });

  it("treats clippingContainer as a unit", () => {
    const clipped = page([
      layer({
        id: "clip",
        type: "clippingContainer",
        x: 0,
        y: 0,
        width: 60,
        height: 60,
        mask: layer({ id: "mask", type: "rect", x: 0, y: 0, width: 60, height: 60 }),
        content: [layer({ id: "clipped", type: "rect", x: 0, y: 0, width: 60, height: 60 })],
      } as Partial<FreehandObject> & { id: string; type: "clippingContainer" }),
    ]);
    const index = buildSiteSelectionIndex(clipped);
    expect(index.byId.clip?.containerKind).toBe("clippingContainer");
    expect(frontmostDirectHit(index, [], { x: 10, y: 10 })?.layerId).toBe("clip");
    expect(index.byId.mask?.selectableFromCanvas).toBe(false);
    expect(index.byId.clipped?.selectableFromCanvas).toBe(false);
    expect(canEnterContainer(index.byId.clip)).toBe(false);
  });

  it("treats booleanGroup as a unit", () => {
    const boolPage = page([
      layer({
        id: "bool",
        type: "booleanGroup",
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        children: [layer({ id: "leaf", type: "rect", x: 0, y: 0, width: 50, height: 50 })],
      }),
    ]);
    const index = buildSiteSelectionIndex(boolPage);
    expect(frontmostDirectHit(index, [], { x: 10, y: 10 })?.layerId).toBe("bool");
  });
});

describe("site creator selection reducer", () => {
  const two = page([
    layer({ id: "a", type: "rect", x: 0, y: 0, width: 20, height: 20 }),
    layer({ id: "b", type: "rect", x: 30, y: 0, width: 20, height: 20 }),
  ]);

  it("shift adds a layer", () => {
    const { state } = reduce(two, [
      { type: "click", layerId: "a", additive: false },
      { type: "click", layerId: "b", additive: true },
    ]);
    expect(state.selectedIds).toEqual(["a", "b"]);
  });

  it("shift removes a selected layer", () => {
    const { state } = reduce(two, [
      { type: "click", layerId: "a", additive: false },
      { type: "click", layerId: "b", additive: true },
      { type: "click", layerId: "a", additive: true },
    ]);
    expect(state.selectedIds).toEqual(["b"]);
  });

  it("empty click clears selection", () => {
    const { state } = reduce(two, [
      { type: "click", layerId: "a", additive: false },
      { type: "click", layerId: null, additive: false },
    ]);
    expect(state.selectedIds).toEqual([]);
  });

  it("ctrl/cmd click cycles overlapping layers", () => {
    const overlap = page([
      layer({ id: "back", type: "rect", x: 0, y: 0, width: 80, height: 80 }),
      layer({ id: "front", type: "rect", x: 0, y: 0, width: 80, height: 80 }),
    ]);
    const { state } = reduce(overlap, [
      { type: "cycle", layerIdsUnderPoint: ["front", "back"], x: 10, y: 10 },
      { type: "cycle", layerIdsUnderPoint: ["front", "back"], x: 10, y: 10 },
    ]);
    expect(state.selectedIds).toEqual(["back"]);
  });
});

describe("site creator layer picker and marquee", () => {
  it("lists layers under a point from front to back", () => {
    const overlap = page([
      layer({ id: "back", type: "rect", x: 0, y: 0, width: 80, height: 80, name: "Atrás" }),
      layer({ id: "front", type: "rect", x: 0, y: 0, width: 80, height: 80, name: "Frente" }),
    ]);
    const index = buildSiteSelectionIndex(overlap);
    expect(layerPickerHitsAtPoint(index, [], { x: 10, y: 10 }).map((e) => e.layerId)).toEqual([
      "front",
      "back",
    ]);
  });

  it("marquee selects layers that intersect the selection box", () => {
    const boxes = page([
      layer({ id: "in", type: "rect", x: 10, y: 10, width: 10, height: 10 }),
      layer({ id: "partial", type: "rect", x: 30, y: 30, width: 20, height: 20 }),
      layer({ id: "out", type: "rect", x: 80, y: 80, width: 40, height: 40 }),
    ]);
    const index = buildSiteSelectionIndex(boxes);
    const hits = marqueeHits(index, [], { x: 0, y: 0, width: 40, height: 40 });
    expect(hits.map((e) => e.layerId).sort()).toEqual(["in", "partial"]);
  });

  it("marquee at root includes layers inside folders", () => {
    const grouped = page([
      layer({
        id: "folder",
        type: "groupContainer",
        x: 0,
        y: 0,
        width: 200,
        height: 80,
        children: [
          layer({ id: "c1", type: "rect", x: 10, y: 10, width: 10, height: 10 }),
          layer({ id: "c2", type: "rect", x: 50, y: 10, width: 10, height: 10 }),
        ],
      }),
    ]);
    const index = buildSiteSelectionIndex(grouped);
    expect(marqueeHits(index, [], { x: 0, y: 0, width: 30, height: 30 }).map((e) => e.layerId)).toEqual([
      "c1",
    ]);
  });

  it("marquee respects isolation level", () => {
    const grouped = page([
      layer({
        id: "folder",
        type: "groupContainer",
        x: 0,
        y: 0,
        width: 200,
        height: 80,
        children: [
          layer({ id: "c1", type: "rect", x: 10, y: 10, width: 10, height: 10 }),
          layer({ id: "c2", type: "rect", x: 40, y: 10, width: 10, height: 10 }),
        ],
      }),
    ]);
    const index = buildSiteSelectionIndex(grouped);
    expect(marqueeHits(index, [], { x: 0, y: 0, width: 80, height: 80 }).map((e) => e.layerId).sort()).toEqual([
      "c1",
      "c2",
    ]);
    expect(marqueeHits(index, ["folder"], { x: 0, y: 0, width: 80, height: 80 }).map((e) => e.layerId)).toEqual([
      "c1",
      "c2",
    ]);
  });

  it("does not keep a container and its descendant together", () => {
    const index = buildSiteSelectionIndex(
      page([
        layer({
          id: "folder",
          type: "groupContainer",
          children: [layer({ id: "c1", type: "rect", x: 0, y: 0, width: 10, height: 10 })],
        }),
      ]),
    );
    expect(collapseContainerDescendants(["folder", "c1"], index)).toEqual(["folder"]);
  });
});

describe("site creator coordinate conversion", () => {
  it("converts client coordinates at Fit width scale", () => {
    const stage = { left: 100, top: 40, width: 480, height: 270 };
    const scale = 0.25;
    const page = clientPointToPagePoint(125, 52.5, stage, scale);
    expect(page).toEqual({ x: 100, y: 50 });
    expect(pagePointToClientPoint(page, stage, scale)).toEqual({ x: 125, y: 52.5 });
  });

  it("converts with 50% zoom", () => {
    const stage = { left: 0, top: 0, width: 960, height: 540 };
    expect(clientPointToPagePoint(480, 270, stage, 0.5)).toEqual({ x: 960, y: 540 });
    expect(pageRectToStageRect({ x: 10, y: 20, width: 40, height: 30 }, 0.5)).toEqual({
      x: 5,
      y: 10,
      width: 20,
      height: 15,
    });
  });

  it("converts with 100% zoom", () => {
    const stage = { left: 10, top: 20, width: 1920, height: 1080 };
    expect(clientPointToPagePoint(110, 120, stage, 1)).toEqual({ x: 100, y: 100 });
  });

  it("accounts for scroll via stage client rect", () => {
    const scrolled = { left: 80, top: -200, width: 960, height: 2000 };
    expect(clientPointToPagePoint(80, 0, scrolled, 1)).toEqual({ x: 0, y: 200 });
  });

  it("produces larger AABB for a rotated layer", () => {
    const unrotated = layer({ id: "r", type: "rect", x: 50, y: 50, width: 40, height: 20, rotation: 0 });
    const rotated = layer({ id: "r", type: "rect", x: 50, y: 50, width: 40, height: 20, rotation: 45 });
    const a = getVisualAABB(unrotated);
    const b = getVisualAABB(rotated);
    expect(b.w).toBeGreaterThan(a.w);
    expect(b.h).toBeGreaterThan(a.h);
    const index = buildSiteSelectionIndex(page([rotated]));
    expect(index.byId.r?.visualBounds.width).toBeCloseTo(b.w, 5);
  });
});

describe("site creator selection vs live snapshot", () => {
  it("builds an index from a live page", () => {
    const live = page([layer({ id: "live", type: "rect", x: 0, y: 0, width: 12, height: 12 })]);
    const display = resolveSiteCreatorDisplayPage({
      originState: "synced",
      snapshot: buildDesignerSourceSnapshot("d1", page([])),
      livePage: live,
    });
    expect(display.displaySource).toBe("live-candidate");
    const index = buildSiteSelectionIndex(display.displayPage!);
    expect(frontmostDirectHit(index, [], { x: 4, y: 4 })?.layerId).toBe("live");
  });

  it("can select a layer added on the live page", () => {
    const live = page([
      layer({ id: "old", type: "rect", x: 0, y: 0, width: 10, height: 10 }),
      layer({ id: "new", type: "rect", x: 40, y: 0, width: 10, height: 10 }),
    ]);
    const index = buildSiteSelectionIndex(live);
    expect(frontmostDirectHit(index, [], { x: 44, y: 4 })?.layerId).toBe("new");
  });

  it("drops a removed layer from selection", () => {
    const before = page([layer({ id: "gone", type: "rect" }), layer({ id: "kept", type: "rect", x: 50 })]);
    const after = page([layer({ id: "kept", type: "rect", x: 50 })]);
    const { state } = reduce(before, [{ type: "click", layerId: "gone", additive: false }]);
    const next = reconcileSelectionToIndex(state, buildSiteSelectionIndex(after));
    expect(next.selectedIds).toEqual([]);
  });

  it("reconciles against the snapshot when disconnected", () => {
    const snapPage = page([layer({ id: "saved", type: "rect", x: 0, y: 0, width: 20, height: 20 })]);
    const live = page([layer({ id: "ephemeral", type: "rect", x: 0, y: 0, width: 20, height: 20 })]);
    const disconnected = resolveSiteCreatorDisplayPage({
      originState: "source_disconnected",
      snapshot: buildDesignerSourceSnapshot("d1", snapPage),
      livePage: live,
    });
    expect(disconnected.displaySource).toBe("committed");
    expect(disconnected.displayPage?.objects[0]?.id).toBe("saved");
    const state: SiteCreatorSelectionState = {
      ...EMPTY_SITE_CREATOR_SELECTION,
      selectedIds: ["ephemeral"],
    };
    const next = reconcileSelectionToIndex(state, buildSiteSelectionIndex(disconnected.displayPage!));
    expect(next.selectedIds).toEqual([]);
  });

  it("does not mutate sourceSnapshot when selecting", () => {
    const snap = buildDesignerSourceSnapshot("d1", page([layer({ id: "a", type: "rect" })]));
    const snapshotPage = snap.page;
    reduce(snap.page, [{ type: "click", layerId: "a", additive: false }]);
    expect(snap.page).toBe(snapshotPage);
    expect(snap.page.objects[0]?.id).toBe("a");
  });

  it("does not mutate the Blueprint when selecting", () => {
    const blueprint: SiteBlueprintV1 = { schemaVersion: 1, rootChildIds: [], nodes: {} };
    const frozen = JSON.stringify(blueprint);
    reduce(page([layer({ id: "a", type: "rect" })]), [{ type: "click", layerId: "a", additive: false }]);
    expect(JSON.stringify(blueprint)).toBe(frozen);
  });

  it("does not write selection into node.data", () => {
    const nodeData = createDefaultSiteCreatorNodeData();
    const parsed = parseSiteCreatorNodeData(JSON.parse(JSON.stringify(nodeData)));
    expect("selectedIds" in parsed).toBe(false);
    expect("selection" in parsed).toBe(false);
  });

  it("expands Ctrl+G groupId selection to all members when mirror is active", () => {
    const gid = "g1";
    const indexPage = page([
      layer({ id: "a", type: "rect", groupId: gid }),
      layer({ id: "b", type: "rect", groupId: gid, x: 20 }),
    ]);
    const index = buildSiteSelectionIndex(indexPage);
    const blueprint = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const { state } = reduce(
      indexPage,
      [{ type: "click", layerId: "a", additive: false }],
      EMPTY_SITE_CREATOR_SELECTION,
      blueprint,
    );
    expect(state.selectedIds.sort()).toEqual(["a", "b"]);
  });

  it("selects a single layer after Ctrl+G mirror was dismissed", () => {
    const gid = "g1";
    const indexPage = page([
      layer({ id: "a", type: "rect", groupId: gid }),
      layer({ id: "b", type: "rect", groupId: gid, x: 20 }),
    ]);
    const index = buildSiteSelectionIndex(indexPage);
    const withMirror = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const blueprint = dismissDesignerGroupIdMirror(withMirror, gid);
    const { state } = reduce(
      indexPage,
      [{ type: "click", layerId: "a", additive: false }],
      EMPTY_SITE_CREATOR_SELECTION,
      blueprint,
    );
    expect(state.selectedIds).toEqual(["a"]);
  });

  it("does not restore selection after serialize/reload", () => {
    const snap = buildDesignerSourceSnapshot("d1", page([layer({ id: "a", type: "rect" })]));
    const persisted = parseSiteCreatorNodeData(
      JSON.parse(JSON.stringify({ ...createDefaultSiteCreatorNodeData(), sourceSnapshot: snap })),
    );
    expect(persisted.sourceSnapshot?.page.objects[0]?.id).toBe("a");
    expect(EMPTY_SITE_CREATOR_SELECTION.selectedIds).toEqual([]);
  });
});
