import { describe, expect, it } from "vitest";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { cloneBlueprint } from "./site-blueprint-validate";
import { createSectionFromSelection } from "./site-blueprint-ops";
import {
  isLayerCanvasLocked,
  isUnitCanvasLocked,
  isUnitOwnCanvasLocked,
  setUnitCanvasLock,
} from "./site-creator-canvas-locks";
import { frontmostDirectHit, marqueeHits } from "./site-creator-hit-test";
import { createEmptySiteBlueprintV1 } from "./site-creator-types";

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

describe("site creator canvas locks", () => {
  it("locks a layer so canvas hit-test selects the one behind it", () => {
    const index = buildSiteSelectionIndex(
      page([
        layer({ id: "back", type: "rect", x: 0, y: 0, width: 80, height: 80 }),
        layer({ id: "front", type: "rect", x: 0, y: 0, width: 80, height: 80 }),
      ]),
    );
    const unlocked = createEmptySiteBlueprintV1();
    expect(frontmostDirectHit(index, [], { x: 10, y: 10 }, unlocked)?.layerId).toBe("front");

    const locked = setUnitCanvasLock(unlocked, { kind: "layer", layerId: "front" }, true);
    expect(isUnitOwnCanvasLocked(locked, { kind: "layer", layerId: "front" })).toBe(true);
    expect(frontmostDirectHit(index, [], { x: 10, y: 10 }, locked)?.layerId).toBe("back");
    expect(marqueeHits(index, [], { x: 0, y: 0, width: 20, height: 20 }, locked).map((e) => e.layerId)).toEqual([
      "back",
    ]);
  });

  it("locking a groupContainer also blocks its children on the canvas", () => {
    const index = buildSiteSelectionIndex(
      page([
        layer({
          id: "folder",
          type: "groupContainer",
          name: "Grupo",
          x: 0,
          y: 0,
          width: 120,
          height: 80,
          children: [layer({ id: "inner", type: "rect", x: 8, y: 8, width: 30, height: 30 })],
        }),
        layer({ id: "loose", type: "rect", x: 8, y: 8, width: 30, height: 30 }),
      ]),
    );
    const locked = setUnitCanvasLock(createEmptySiteBlueprintV1(), { kind: "layer", layerId: "folder" }, true);
    expect(isLayerCanvasLocked(locked, "inner", index)).toBe(true);
    expect(frontmostDirectHit(index, [], { x: 10, y: 10 }, locked)?.layerId).toBe("loose");
  });

  it("locking a section node blocks its layers on the canvas", () => {
    const committedPage = page([
      layer({ id: "a", type: "rect", x: 0, y: 0, width: 80, height: 80 }),
      layer({ id: "b", type: "rect", x: 200, y: 0, width: 80, height: 80 }),
    ]);
    const index = buildSiteSelectionIndex(committedPage);
    const created = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["a"],
      index,
      committedPage,
      sectionType: "generic",
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.createdNodeId) return;

    const locked = setUnitCanvasLock(
      created.blueprint,
      { kind: "blueprintNode", nodeId: created.createdNodeId },
      true,
    );
    expect(isUnitCanvasLocked(locked, { kind: "blueprintNode", nodeId: created.createdNodeId }, index)).toBe(true);
    expect(isLayerCanvasLocked(locked, "a", index)).toBe(true);
    expect(frontmostDirectHit(index, [], { x: 10, y: 10 }, locked)).toBeNull();
    expect(frontmostDirectHit(index, [], { x: 210, y: 10 }, locked)?.layerId).toBe("b");
  });

  it("cloneBlueprint copies canvasLocks without sharing arrays", () => {
    const locked = setUnitCanvasLock(createEmptySiteBlueprintV1(), { kind: "layer", layerId: "front" }, true);
    const cloned = cloneBlueprint(locked);
    expect(cloned.canvasLocks?.layerIds).toEqual(["front"]);
    cloned.canvasLocks!.layerIds![0] = "mutated";
    expect(locked.canvasLocks?.layerIds).toEqual(["front"]);
  });

  it("unlocking removes canvasLocks when empty", () => {
    const locked = setUnitCanvasLock(createEmptySiteBlueprintV1(), { kind: "layer", layerId: "front" }, true);
    const unlocked = setUnitCanvasLock(locked, { kind: "layer", layerId: "front" }, false);
    expect(unlocked.canvasLocks).toBeUndefined();
  });
});
