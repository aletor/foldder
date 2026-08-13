import { describe, expect, it } from "vitest";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import { diffDesignerSourceSnapshots, diffModifiedLayerCount } from "./designer-source-diff";
import { buildDesignerSourceSnapshot, deepCloneDesignerPageState } from "./designer-source-snapshot";

function basePage(objects: FreehandObject[] = []): DesignerPageState {
  return {
    id: "pg_root",
    format: "web169",
    objects,
  };
}

function snapFromPage(page: DesignerPageState, designerId = "d1") {
  return buildDesignerSourceSnapshot(designerId, page);
}

describe("diffDesignerSourceSnapshots", () => {
  it("returns no changes for identical snapshots", () => {
    const page = basePage([
      { id: "a", type: "rect", x: 0, y: 0, width: 10, height: 10 } as FreehandObject,
    ]);
    const current = snapFromPage(page);
    const candidate = snapFromPage(deepCloneDesignerPageState(page));
    const diff = diffDesignerSourceSnapshots(current, candidate);
    expect(diff.summary.added).toBe(0);
    expect(diff.summary.removed).toBe(0);
    expect(diff.summary.visuallyChanged).toBe(0);
    expect(diff.summary.hierarchyChanged).toBe(0);
    expect(diff.layers.unchangedIds).toEqual(["a"]);
    expect(diff.pageChanges.dimensionsChanged).toBe(false);
    expect(diff.pageChanges.backgroundChanged).toBe(false);
  });

  it("detects added layer", () => {
    const current = snapFromPage(basePage());
    const candidate = snapFromPage(
      basePage([{ id: "new_layer", type: "rect", x: 0, y: 0, width: 5, height: 5 } as FreehandObject]),
    );
    const diff = diffDesignerSourceSnapshots(current, candidate);
    expect(diff.layers.addedIds).toEqual(["new_layer"]);
    expect(diff.summary.added).toBe(1);
  });

  it("detects removed layer", () => {
    const page = basePage([{ id: "gone", type: "rect", x: 0, y: 0, width: 5, height: 5 } as FreehandObject]);
    const current = snapFromPage(page);
    const candidate = snapFromPage(basePage());
    const diff = diffDesignerSourceSnapshots(current, candidate);
    expect(diff.layers.removedIds).toEqual(["gone"]);
    expect(diff.summary.removed).toBe(1);
  });

  it("detects text change", () => {
    const page = basePage([
      { id: "txt", type: "text", x: 0, y: 0, width: 20, height: 10, text: "A" } as FreehandObject,
    ]);
    const current = snapFromPage(page);
    const changed = deepCloneDesignerPageState(page);
    (changed.objects[0] as { text: string }).text = "B";
    const candidate = snapFromPage(changed);
    const diff = diffDesignerSourceSnapshots(current, candidate);
    expect(diff.layers.visuallyChangedIds).toEqual(["txt"]);
    expect(diff.layers.unchangedIds).not.toContain("txt");
  });

  it("detects geometry change", () => {
    const page = basePage([
      { id: "rect", type: "rect", x: 0, y: 0, width: 10, height: 10 } as FreehandObject,
    ]);
    const current = snapFromPage(page);
    const changed = deepCloneDesignerPageState(page);
    changed.objects[0]!.x = 50;
    const candidate = snapFromPage(changed);
    const diff = diffDesignerSourceSnapshots(current, candidate);
    expect(diff.layers.visuallyChangedIds).toEqual(["rect"]);
  });

  it("detects style change", () => {
    const page = basePage([
      { id: "styled", type: "rect", x: 0, y: 0, width: 10, height: 10, opacity: 1 } as FreehandObject,
    ]);
    const current = snapFromPage(page);
    const changed = deepCloneDesignerPageState(page);
    (changed.objects[0] as { opacity: number }).opacity = 0.5;
    const candidate = snapFromPage(changed);
    const diff = diffDesignerSourceSnapshots(current, candidate);
    expect(diff.layers.visuallyChangedIds).toEqual(["styled"]);
  });

  it("detects visibility change", () => {
    const page = basePage([
      { id: "vis", type: "rect", x: 0, y: 0, width: 10, height: 10, visible: true } as FreehandObject,
    ]);
    const current = snapFromPage(page);
    const changed = deepCloneDesignerPageState(page);
    (changed.objects[0] as { visible: boolean }).visible = false;
    const candidate = snapFromPage(changed);
    const diff = diffDesignerSourceSnapshots(current, candidate);
    expect(diff.layers.visuallyChangedIds).toEqual(["vis"]);
  });

  it("detects sibling order change", () => {
    const page = basePage([
      { id: "first", type: "rect", x: 0, y: 0, width: 1, height: 1 } as FreehandObject,
      { id: "second", type: "rect", x: 1, y: 1, width: 1, height: 1 } as FreehandObject,
    ]);
    const current = snapFromPage(page);
    const changed = deepCloneDesignerPageState(page);
    changed.objects = [changed.objects[1]!, changed.objects[0]!];
    const candidate = snapFromPage(changed);
    const diff = diffDesignerSourceSnapshots(current, candidate);
    expect(diff.layers.hierarchyChangedIds.sort()).toEqual(["first", "second"]);
    expect(diffModifiedLayerCount(diff)).toBe(2);
  });

  it("detects move to another container", () => {
    const page = basePage([
      {
        id: "group_a",
        type: "groupContainer",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        children: [{ id: "child", type: "rect", x: 0, y: 0, width: 5, height: 5 } as FreehandObject],
      } as FreehandObject,
      {
        id: "group_b",
        type: "groupContainer",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        children: [],
      } as unknown as FreehandObject,
    ]);
    const current = snapFromPage(page);
    const changed = deepCloneDesignerPageState(page);
    const groupA = changed.objects[0] as FreehandObject & { children: FreehandObject[] };
    const groupB = changed.objects[1] as FreehandObject & { children: FreehandObject[] };
    const child = groupA.children[0]!;
    groupA.children = [];
    groupB.children = [child];
    const candidate = snapFromPage(changed);
    const diff = diffDesignerSourceSnapshots(current, candidate);
    expect(diff.layers.hierarchyChangedIds).toEqual(["child"]);
  });

  it("detects container added or removed", () => {
    const withGroup = basePage([
      {
        id: "grp",
        type: "groupContainer",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        children: [{ id: "inner", type: "rect", x: 0, y: 0, width: 1, height: 1 } as FreehandObject],
      } as FreehandObject,
    ]);
    const withoutGroup = basePage([
      { id: "inner", type: "rect", x: 0, y: 0, width: 1, height: 1 } as FreehandObject,
    ]);
    const addedContainer = diffDesignerSourceSnapshots(snapFromPage(withoutGroup), snapFromPage(withGroup));
    expect(addedContainer.layers.addedIds).toContain("grp");
    expect(addedContainer.layers.addedIds).not.toContain("inner");

    const removedContainer = diffDesignerSourceSnapshots(snapFromPage(withGroup), snapFromPage(withoutGroup));
    expect(removedContainer.layers.removedIds).toContain("grp");
  });

  it("detects page dimensions change", () => {
    const current = snapFromPage(basePage());
    const changed = deepCloneDesignerPageState(basePage());
    changed.format = "a4v";
    const candidate = snapFromPage(changed);
    const diff = diffDesignerSourceSnapshots(current, candidate);
    expect(diff.pageChanges.dimensionsChanged).toBe(true);
  });

  it("detects background change", () => {
    const current = snapFromPage(basePage());
    const changed = deepCloneDesignerPageState(basePage());
    changed.pageBackground = "black";
    const candidate = snapFromPage(changed);
    const diff = diffDesignerSourceSnapshots(current, candidate);
    expect(diff.pageChanges.backgroundChanged).toBe(true);
  });

  it("produces deterministic diff arrays", () => {
    const page = basePage([
      { id: "z_layer", type: "rect", x: 0, y: 0, width: 1, height: 1 } as FreehandObject,
      { id: "a_layer", type: "rect", x: 1, y: 1, width: 1, height: 1 } as FreehandObject,
    ]);
    const current = snapFromPage(page);
    const changed = deepCloneDesignerPageState(page);
    changed.objects.push({ id: "m_layer", type: "rect", x: 2, y: 2, width: 1, height: 1 } as FreehandObject);
    changed.objects = changed.objects.slice().reverse();
    const candidate = snapFromPage(changed);
    const diff1 = diffDesignerSourceSnapshots(current, candidate);
    const diff2 = diffDesignerSourceSnapshots(current, candidate);
    expect(diff1.layers.addedIds).toEqual(["m_layer"]);
    expect(diff1.layers.hierarchyChangedIds).toEqual(diff2.layers.hierarchyChangedIds);
    expect([...diff1.layers.hierarchyChangedIds].sort()).toEqual(diff1.layers.hierarchyChangedIds);
  });
});
