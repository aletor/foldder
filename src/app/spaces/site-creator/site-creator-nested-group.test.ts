import { beforeEach, describe, expect, it } from "vitest";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { resetSiteBlueprintIdSeqForTests } from "./site-blueprint-ids";
import {
  createGroupFromSelection,
  createLayoutGroupFromSelection,
  createSectionFromSelection,
  resolveButtonParent,
  wrapSemanticNodesInGroup,
} from "./site-blueprint-ops";
import { commonContainersForFreeLayers, deepestContainerCandidates } from "./site-creator-hierarchy";
import { canWrapSemanticUnits, groupActionLabel, resolveContextualModel } from "./site-creator-contextual-actions";
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

beforeEach(() => {
  resetSiteBlueprintIdSeqForTests(0);
});

describe("site-creator nested groups", () => {
  it("infers layoutGroup parent for free layers inside a group bounds", () => {
    const committed = page([
      layer({ id: "h", type: "rect", x: 0, y: 0, width: 300, height: 300 }),
      layer({ id: "a", type: "rect", x: 20, y: 20, width: 40, height: 40 }),
      layer({ id: "b", type: "rect", x: 80, y: 20, width: 40, height: 40 }),
      layer({ id: "c", type: "rect", x: 30, y: 30, width: 20, height: 20 }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    let blueprint = createEmptySiteBlueprintV1();
    const hero = createSectionFromSelection({
      blueprint,
      selectedLayerIds: ["h"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok) return;
    blueprint = hero.blueprint;
    const card = createLayoutGroupFromSelection({
      blueprint,
      selectedLayerIds: ["a", "b"],
      index,
      preferredParentId: hero.createdNodeId,
      label: "Tarjetas",
    });
    expect(card.ok).toBe(true);
    if (!card.ok) return;
    blueprint = card.blueprint;

    const containers = commonContainersForFreeLayers(["c"], blueprint, index);
    expect(containers).toContain(card.createdNodeId!);
    expect(containers).not.toContain(hero.createdNodeId!);

    const parent = resolveButtonParent({
      blueprint,
      selectedLayerIds: ["c"],
      index,
    });
    expect(parent.status).toBe("resolved");
    if (parent.status !== "resolved") return;
    expect(parent.parentId).toBe(card.createdNodeId);
  });

  it("wraps sibling layoutGroups in a parent group", () => {
    const committed = page([
      layer({ id: "a1", type: "rect", x: 0, y: 0, width: 30, height: 30 }),
      layer({ id: "a2", type: "rect", x: 40, y: 0, width: 30, height: 30 }),
      layer({ id: "b1", type: "rect", x: 0, y: 50, width: 30, height: 30 }),
      layer({ id: "b2", type: "rect", x: 40, y: 50, width: 30, height: 30 }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    let blueprint = createEmptySiteBlueprintV1();
    const g1 = createLayoutGroupFromSelection({
      blueprint,
      selectedLayerIds: ["a1", "a2"],
      index,
      label: "Grupo A",
    });
    const g2 = createLayoutGroupFromSelection({
      blueprint: g1.ok ? g1.blueprint : blueprint,
      selectedLayerIds: ["b1", "b2"],
      index,
      label: "Grupo B",
    });
    expect(g1.ok && g2.ok).toBe(true);
    if (!g1.ok || !g2.ok) return;

    const wrapped = wrapSemanticNodesInGroup({
      blueprint: g2.blueprint,
      selectedNodeIds: [g1.createdNodeId!, g2.createdNodeId!],
      index,
      label: "Fila",
    });
    expect(wrapped.ok).toBe(true);
    if (!wrapped.ok) return;

    const parent = wrapped.blueprint.nodes[wrapped.createdNodeId!];
    expect(parent?.kind).toBe("layoutGroup");
    expect(parent?.childIds.sort()).toEqual([g1.createdNodeId!, g2.createdNodeId!].sort());
    expect(wrapped.blueprint.nodes[g1.createdNodeId!]?.parentId).toBe(wrapped.createdNodeId);
    expect(wrapped.blueprint.nodes[g2.createdNodeId!]?.parentId).toBe(wrapped.createdNodeId);
  });

  it("createGroupFromSelection uses wrap path for sibling groups", () => {
    const committed = page([
      layer({ id: "a1", type: "rect", x: 0, y: 0, width: 30, height: 30 }),
      layer({ id: "b1", type: "rect", x: 50, y: 0, width: 30, height: 30 }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const g1 = createLayoutGroupFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["a1"],
      index,
    });
    const g2 = createLayoutGroupFromSelection({
      blueprint: g1.ok ? g1.blueprint : createEmptySiteBlueprintV1(),
      selectedLayerIds: ["b1"],
      index,
    });
    expect(g1.ok && g2.ok).toBe(true);
    if (!g1.ok || !g2.ok) return;

    const result = createGroupFromSelection({
      blueprint: g2.blueprint,
      units: [
        { kind: "blueprintNode", nodeId: g1.createdNodeId! },
        { kind: "blueprintNode", nodeId: g2.createdNodeId! },
      ],
      index,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const wrapper = result.blueprint.nodes[result.createdNodeId!];
    expect(wrapper?.childIds).toHaveLength(2);
  });

  it("shows Envolver en grupo for sibling layoutGroup units", () => {
    const committed = page([
      layer({ id: "a1", type: "rect", x: 0, y: 0, width: 30, height: 30 }),
      layer({ id: "b1", type: "rect", x: 50, y: 0, width: 30, height: 30 }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const g1 = createLayoutGroupFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["a1"],
      index,
    });
    const g2 = createLayoutGroupFromSelection({
      blueprint: g1.ok ? g1.blueprint : createEmptySiteBlueprintV1(),
      selectedLayerIds: ["b1"],
      index,
    });
    if (!g1.ok || !g2.ok) return;
    const units = [
      { kind: "blueprintNode" as const, nodeId: g1.createdNodeId! },
      { kind: "blueprintNode" as const, nodeId: g2.createdNodeId! },
    ];
    expect(canWrapSemanticUnits(units, g2.blueprint)).toBe(true);
    expect(groupActionLabel(units, g2.blueprint)).toBe("Envolver en grupo");
    const model = resolveContextualModel({
      units,
      inspectNodeId: null,
      blueprint: g2.blueprint,
      index,
      snapshot: null,
      persistGate: { allowed: true, message: "" },
    });
    expect(model.primaryActions.find((a) => a.id === "keepTogether")?.label).toBe("Envolver en grupo");
  });

  it("deepestContainerCandidates drops ancestor containers", () => {
    const committed = page([
      layer({ id: "h", type: "rect", x: 0, y: 0, width: 300, height: 300 }),
      layer({ id: "a", type: "rect", x: 20, y: 20, width: 40, height: 40 }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    let blueprint = createEmptySiteBlueprintV1();
    const hero = createSectionFromSelection({
      blueprint,
      selectedLayerIds: ["h", "a"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    if (!hero.ok) return;
    blueprint = hero.blueprint;
    const group = createLayoutGroupFromSelection({
      blueprint,
      selectedLayerIds: ["a"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    if (!group.ok) return;

    const deepest = deepestContainerCandidates([hero.createdNodeId!, group.createdNodeId!], group.blueprint);
    expect(deepest).toEqual([group.createdNodeId]);
  });
});
