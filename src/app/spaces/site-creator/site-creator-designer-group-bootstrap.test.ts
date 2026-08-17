import { describe, expect, it } from "vitest";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { createSectionFromSelection } from "./site-blueprint-ops";
import {
  designerGroupMirrorNodeId,
  isDesignerGroupIdMirrorNode,
  isDesignerGroupMirrorNode,
  reconcileDesignerGroupMirrors,
} from "./site-creator-designer-group-bootstrap";
import { designerGroupIdMirrorNodeId } from "./site-creator-designer-group-id";
import {
  dismissDesignerGroupIdMirror,
  isDesignerGroupIdMirrorDismissed,
} from "./site-creator-designer-group-dismiss";
import { createEmptySiteBlueprintV1 } from "./site-creator-types";

function layer(partial: Partial<FreehandObject> & { id: string; type: FreehandObject["type"] }): FreehandObject {
  return {
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    ...partial,
  } as FreehandObject;
}

function page(objects: FreehandObject[]): DesignerPageState {
  return { id: "pg", format: "web169", objects };
}

describe("reconcileDesignerGroupMirrors", () => {
  it("creates layoutGroup mirrors for all top-level groupContainers", () => {
    const committed = page([
      layer({
        id: "g1",
        type: "groupContainer",
        name: "Card",
        children: [layer({ id: "t1", type: "text", text: "Hi" })],
      }),
      layer({ id: "solo", type: "rect", x: 100 }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const next = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const mirrorId = designerGroupMirrorNodeId("g1");
    expect(next.nodes[mirrorId]).toBeDefined();
    expect(next.nodes[mirrorId]?.kind).toBe("layoutGroup");
    expect(next.nodes[mirrorId]?.layerIds).toEqual(["g1"]);
    expect(next.nodes[mirrorId]?.label).toBe("Card");
    expect(next.rootChildIds).toContain(mirrorId);
    expect(isDesignerGroupMirrorNode(next.nodes[mirrorId]!, index)).toBe(true);
  });

  it("creates nested mirrors matching designer hierarchy", () => {
    const committed = page([
      layer({
        id: "outer",
        type: "groupContainer",
        name: "Outer",
        children: [
          layer({
            id: "inner",
            type: "groupContainer",
            name: "Inner",
            children: [layer({ id: "leaf", type: "rect" })],
          }),
        ],
      }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const next = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const outerId = designerGroupMirrorNodeId("outer");
    const innerId = designerGroupMirrorNodeId("inner");
    expect(next.nodes[outerId]?.childIds).toContain(innerId);
    expect(next.nodes[innerId]?.parentId).toBe(outerId);
    expect(next.nodes[innerId]?.layerIds).toEqual([]);
  });

  it("uses default label for unnamed groupContainers", () => {
    const committed = page([
      layer({
        id: "g",
        type: "groupContainer",
        children: [layer({ id: "c", type: "rect" })],
      }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const next = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    expect(next.nodes[designerGroupMirrorNodeId("g")]?.label).toBe("Grupo de capas");
  });

  it("skips mirror when user assigned groupContainer to a section", () => {
    const committed = page([
      layer({
        id: "g",
        type: "groupContainer",
        name: "Nav",
        children: [layer({ id: "btn", type: "rect" })],
      }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["g"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok) return;
    const next = reconcileDesignerGroupMirrors(hero.blueprint, index);
    expect(next.nodes[designerGroupMirrorNodeId("g")]).toBeUndefined();
    expect(next.rootChildIds).toContain(hero.createdNodeId);
  });

  it("adds new mirrors on re-sync when designer gains a group", () => {
    const before = page([layer({ id: "a", type: "rect" })]);
    const after = page([
      layer({ id: "a", type: "rect" }),
      layer({
        id: "newg",
        type: "groupContainer",
        name: "New",
        children: [layer({ id: "b", type: "rect", x: 10 })],
      }),
    ]);
    const indexBefore = buildSiteSelectionIndex(before);
    const indexAfter = buildSiteSelectionIndex(after);
    const once = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), indexBefore);
    expect(Object.keys(once.nodes)).toHaveLength(0);
    const twice = reconcileDesignerGroupMirrors(once, indexAfter);
    expect(twice.nodes[designerGroupMirrorNodeId("newg")]?.label).toBe("New");
  });

  it("removes stale mirrors when groupContainer is deleted in designer", () => {
    const withGroup = page([
      layer({
        id: "gone",
        type: "groupContainer",
        name: "G",
        children: [layer({ id: "c", type: "rect" })],
      }),
    ]);
    const withoutGroup = page([layer({ id: "c", type: "rect" })]);
    const indexWith = buildSiteSelectionIndex(withGroup);
    const indexWithout = buildSiteSelectionIndex(withoutGroup);
    const withMirror = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), indexWith);
    expect(withMirror.nodes[designerGroupMirrorNodeId("gone")]).toBeDefined();
    const cleaned = reconcileDesignerGroupMirrors(withMirror, indexWithout);
    expect(cleaned.nodes[designerGroupMirrorNodeId("gone")]).toBeUndefined();
  });

  it("updates mirror label when group is renamed in designer", () => {
    const v1 = page([
      layer({
        id: "g",
        type: "groupContainer",
        name: "Old",
        children: [layer({ id: "c", type: "rect" })],
      }),
    ]);
    const v2 = page([
      layer({
        id: "g",
        type: "groupContainer",
        name: "New name",
        children: [layer({ id: "c", type: "rect" })],
      }),
    ]);
    const index1 = buildSiteSelectionIndex(v1);
    const index2 = buildSiteSelectionIndex(v2);
    const once = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index1);
    const twice = reconcileDesignerGroupMirrors(once, index2);
    expect(twice.nodes[designerGroupMirrorNodeId("g")]?.label).toBe("New name");
  });

  it("creates layoutGroup mirrors for root-level Ctrl+G groups (groupId)", () => {
    const gid = "grp_1";
    const committed = page([
      layer({ id: "a", type: "rect", groupId: gid, x: 0 }),
      layer({ id: "b", type: "rect", groupId: gid, x: 50 }),
      layer({ id: "solo", type: "rect", x: 120 }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const next = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const mirrorId = designerGroupIdMirrorNodeId(gid);
    expect(next.nodes[mirrorId]?.kind).toBe("layoutGroup");
    expect(next.nodes[mirrorId]?.layerIds.sort()).toEqual(["a", "b"]);
    expect(next.nodes[mirrorId]?.label).toBe("Grupo · 2 capas");
    expect(next.rootChildIds).toContain(mirrorId);
    expect(isDesignerGroupIdMirrorNode(next.nodes[mirrorId]!)).toBe(true);
  });

  it("does not bootstrap Ctrl+G mirrors inside owned groupContainer folders", () => {
    const gid = "inner_grp";
    const committed = page([
      layer({
        id: "folder",
        type: "groupContainer",
        name: "Folder",
        children: [
          layer({ id: "a", type: "rect", groupId: gid }),
          layer({ id: "b", type: "rect", groupId: gid, x: 10 }),
        ],
      }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const next = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    expect(next.nodes[designerGroupMirrorNodeId("folder")]).toBeDefined();
    expect(next.nodes[designerGroupIdMirrorNodeId(gid)]).toBeUndefined();
  });

  it("removes stale Ctrl+G mirrors when group is ungrouped in designer", () => {
    const gid = "gone";
    const grouped = page([
      layer({ id: "a", type: "rect", groupId: gid }),
      layer({ id: "b", type: "rect", groupId: gid, x: 10 }),
    ]);
    const ungrouped = page([
      layer({ id: "a", type: "rect" }),
      layer({ id: "b", type: "rect", x: 10 }),
    ]);
    const withMirror = reconcileDesignerGroupMirrors(
      createEmptySiteBlueprintV1(),
      buildSiteSelectionIndex(grouped),
    );
    expect(withMirror.nodes[designerGroupIdMirrorNodeId(gid)]).toBeDefined();
    const cleaned = reconcileDesignerGroupMirrors(
      withMirror,
      buildSiteSelectionIndex(ungrouped),
    );
    expect(cleaned.nodes[designerGroupIdMirrorNodeId(gid)]).toBeUndefined();
  });

  it("does not recreate dismissed Ctrl+G mirrors on re-sync", () => {
    const gid = "grp_keep_dismissed";
    const committed = page([
      layer({ id: "a", type: "rect", groupId: gid }),
      layer({ id: "b", type: "rect", groupId: gid, x: 20 }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const withMirror = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const dismissed = dismissDesignerGroupIdMirror(withMirror, gid);
    expect(isDesignerGroupIdMirrorDismissed(dismissed, gid)).toBe(true);
    const resynced = reconcileDesignerGroupMirrors(dismissed, index);
    expect(resynced.nodes[designerGroupIdMirrorNodeId(gid)]).toBeUndefined();
  });

  it("does not recreate dismissed folder mirrors on re-sync", () => {
    const committed = page([
      layer({
        id: "folder",
        type: "groupContainer",
        name: "Folder",
        children: [layer({ id: "c", type: "rect" })],
      }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const withMirror = reconcileDesignerGroupMirrors(createEmptySiteBlueprintV1(), index);
    const dismissed = {
      ...withMirror,
      dismissedDesignerMirrors: { containerLayerIds: ["folder"], groupIds: [] },
    };
    const resynced = reconcileDesignerGroupMirrors(dismissed, index);
    expect(resynced.nodes[designerGroupMirrorNodeId("folder")]).toBeUndefined();
  });
});
