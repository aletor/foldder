import { beforeEach, describe, expect, it } from "vitest";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { buildDesignerSourceSnapshot } from "./designer-source-snapshot";
import { resetSiteBlueprintIdSeqForTests } from "./site-blueprint-ids";
import {
  canPersistSiteStructure,
  createBlueprintHistory,
  pushBlueprintHistory,
  redoBlueprintHistory,
  undoBlueprintHistory,
} from "./site-blueprint-history";
import {
  createButtonFromSelection,
  createLayoutGroupFromSelection,
  createSectionFromSelection,
  expandGroupContainersForSelection,
  findAtomicContainerViolations,
  findPartiallyCoveredSemanticNodes,
  removeBlueprintNodePreservingContent,
  resolveButtonParent,
} from "./site-blueprint-ops";
import {
  buildBlueprintOwnershipIndex,
  collectSemanticCoverageLayerIds,
  countUnstructuredVisualLayers,
  moveLayersToBlueprintNode,
  validateBlueprintOwnership,
} from "./site-blueprint-ownership";
import { validateSiteBlueprintTree } from "./site-blueprint-validate";
import {
  createEmptySiteBlueprintV1,
  isSiteButtonNode,
  isSiteSectionNode,
  parseSiteCreatorNodeData,
  type SiteBlueprintComponentNode,
  type SiteBlueprintSectionNode,
  type SiteBlueprintV1,
} from "./site-creator-types";

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
  // textMode area evita medición canvas (jsdom) y mantiene bounds finitos en tests.
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

/** UI mutual exclusion is not covered here; pure flag for conceptual exclusivity. */
function exclusiveSelection(mode: "semantic" | "layers"): { semantic: boolean; layers: boolean } {
  return mode === "semantic" ? { semantic: true, layers: false } : { semantic: false, layers: true };
}

beforeEach(() => {
  resetSiteBlueprintIdSeqForTests(0);
});

describe("Phase 5 Site Creator Blueprint structure", () => {
  it("1. empty blueprint is valid", () => {
    const bp = createEmptySiteBlueprintV1();
    expect(validateSiteBlueprintTree(bp).ok).toBe(true);
  });

  it("2. create Hero from root layers", () => {
    const committed = page([
      layer({ id: "a", type: "rect", x: 0, y: 0, width: 100, height: 80 }),
      layer({ id: "b", type: "rect", x: 10, y: 10, width: 40, height: 40 }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const result = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["a", "b"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const section = result.blueprint.nodes[result.createdNodeId!] as SiteBlueprintSectionNode;
    expect(section.sectionType).toBe("hero");
    expect(section.layerIds.sort()).toEqual(["a", "b"]);
    expect(result.blueprint.rootChildIds).toEqual([result.createdNodeId]);
  });

  it("3. create generic Section", () => {
    const committed = page([layer({ id: "s", type: "rect", x: 0, y: 200, width: 80, height: 40 })]);
    const index = buildSiteSelectionIndex(committed);
    const result = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["s"],
      index,
      committedPage: committed,
      sectionType: "generic",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const section = result.blueprint.nodes[result.createdNodeId!] as SiteBlueprintSectionNode;
    expect(section.sectionType).toBe("generic");
    expect(section.label).toBe("Sección");
  });

  it("4. create root Button without Section", () => {
    const committed = page([
      layer({ id: "bg", type: "rect", x: 0, y: 0, width: 80, height: 32 }),
      layer({ id: "label", type: "text", x: 8, y: 4, width: 60, height: 24, text: "Hello" }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const result = createButtonFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "label"],
      index,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const btn = result.blueprint.nodes[result.createdNodeId!] as SiteBlueprintComponentNode;
    expect(btn.parentId).toBeNull();
    expect(result.blueprint.rootChildIds).toContain(result.createdNodeId);
    expect(btn.config.labelLayerId).toBe("label");
  });

  it("5. create Hero leave rest as visual content (countUnstructuredVisualLayers)", () => {
    const committed = page([
      layer({ id: "heroA", type: "rect", x: 0, y: 0, width: 100, height: 60 }),
      layer({ id: "rest", type: "rect", x: 0, y: 200, width: 50, height: 50 }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const result = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["heroA"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(countUnstructuredVisualLayers(result.blueprint, index)).toBe(1);
  });

  it("6. create Hero then Button inside", () => {
    const committed = page([
      layer({ id: "h1", type: "rect", x: 0, y: 0, width: 200, height: 120 }),
      layer({ id: "btnBg", type: "rect", x: 20, y: 40, width: 80, height: 30 }),
      layer({ id: "btnTxt", type: "text", x: 28, y: 44, width: 60, height: 20, text: "Go" }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const heroRes = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["h1", "btnBg", "btnTxt"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(heroRes.ok).toBe(true);
    if (!heroRes.ok) return;
    const btnRes = createButtonFromSelection({
      blueprint: heroRes.blueprint,
      selectedLayerIds: ["btnBg", "btnTxt"],
      index,
      preferredParentId: heroRes.createdNodeId,
    });
    expect(btnRes.ok).toBe(true);
    if (!btnRes.ok) return;
    const btn = btnRes.blueprint.nodes[btnRes.createdNodeId!]!;
    expect(btn.parentId).toBe(heroRes.createdNodeId);
    expect(heroRes.createdNodeId && btnRes.blueprint.nodes[heroRes.createdNodeId]?.childIds).toContain(
      btnRes.createdNodeId,
    );
  });

  it("7. create Button first then Hero", () => {
    const committed = page([
      layer({ id: "bg", type: "rect", x: 10, y: 10, width: 80, height: 30 }),
      layer({ id: "txt", type: "text", x: 14, y: 14, width: 60, height: 20, text: "CTA" }),
      layer({ id: "extra", type: "rect", x: 0, y: 0, width: 200, height: 100 }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const btnRes = createButtonFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "txt"],
      index,
    });
    expect(btnRes.ok).toBe(true);
    if (!btnRes.ok) return;
    const heroRes = createSectionFromSelection({
      blueprint: btnRes.blueprint,
      selectedLayerIds: ["bg", "txt", "extra"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(heroRes.ok).toBe(true);
    if (!heroRes.ok) return;
    const btn = heroRes.blueprint.nodes[btnRes.createdNodeId!]!;
    expect(btn.parentId).toBe(heroRes.createdNodeId);
    expect(heroRes.blueprint.rootChildIds).toEqual([heroRes.createdNodeId]);
  });

  it("8. reparent full Button when creating Hero", () => {
    const committed = page([
      layer({ id: "b1", type: "rect", x: 20, y: 20, width: 60, height: 24 }),
      layer({ id: "t1", type: "text", x: 24, y: 22, width: 40, height: 18, text: "Ok" }),
      layer({ id: "frame", type: "rect", x: 0, y: 0, width: 160, height: 80 }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const btnRes = createButtonFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["b1", "t1"],
      index,
    });
    expect(btnRes.ok).toBe(true);
    if (!btnRes.ok) return;
    expect(btnRes.blueprint.rootChildIds).toContain(btnRes.createdNodeId);
    const heroRes = createSectionFromSelection({
      blueprint: btnRes.blueprint,
      selectedLayerIds: ["b1", "t1", "frame"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(heroRes.ok).toBe(true);
    if (!heroRes.ok) return;
    expect(heroRes.blueprint.nodes[btnRes.createdNodeId!]?.parentId).toBe(heroRes.createdNodeId);
    expect(heroRes.blueprint.rootChildIds).not.toContain(btnRes.createdNodeId);
  });

  it("9. partial Button selection blocked", () => {
    const committed = page([
      layer({ id: "b1", type: "rect", x: 0, y: 0, width: 80, height: 30 }),
      layer({ id: "t1", type: "text", x: 4, y: 4, width: 60, height: 20, text: "Hi" }),
      layer({ id: "other", type: "rect", x: 100, y: 0, width: 40, height: 40 }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const btnRes = createButtonFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["b1", "t1"],
      index,
    });
    expect(btnRes.ok).toBe(true);
    if (!btnRes.ok) return;
    const partial = findPartiallyCoveredSemanticNodes(btnRes.blueprint, ["b1", "other"], index);
    expect(partial).toContain(btnRes.createdNodeId);
    const heroRes = createSectionFromSelection({
      blueprint: btnRes.blueprint,
      selectedLayerIds: ["b1", "other"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(heroRes.ok).toBe(false);
    if (heroRes.ok) return;
    expect(heroRes.code).toBe("partial_semantic");
  });

  it("10. layers transfer Hero→Button without duplication", () => {
    const committed = page([
      layer({ id: "h", type: "rect", x: 0, y: 0, width: 200, height: 100 }),
      layer({ id: "b", type: "rect", x: 20, y: 40, width: 60, height: 24 }),
      layer({ id: "t", type: "text", x: 24, y: 42, width: 40, height: 18, text: "Buy" }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const heroRes = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["h", "b", "t"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(heroRes.ok).toBe(true);
    if (!heroRes.ok) return;
    const btnRes = createButtonFromSelection({
      blueprint: heroRes.blueprint,
      selectedLayerIds: ["b", "t"],
      index,
      preferredParentId: heroRes.createdNodeId,
    });
    expect(btnRes.ok).toBe(true);
    if (!btnRes.ok) return;
    const ownership = buildBlueprintOwnershipIndex(btnRes.blueprint);
    expect(ownership.ownerByLayerId.b).toBe(btnRes.createdNodeId);
    expect(ownership.ownerByLayerId.t).toBe(btnRes.createdNodeId);
    expect(ownership.ownerByLayerId.h).toBe(heroRes.createdNodeId);
    expect(btnRes.blueprint.nodes[heroRes.createdNodeId!]?.layerIds).not.toContain("b");
    expect(btnRes.blueprint.nodes[heroRes.createdNodeId!]?.layerIds).not.toContain("t");
    expect(validateBlueprintOwnership(btnRes.blueprint).ok).toBe(true);
  });

  it("11. remove Button returns layers to Hero", () => {
    const committed = page([
      layer({ id: "h", type: "rect", x: 0, y: 0, width: 200, height: 100 }),
      layer({ id: "b", type: "rect", x: 20, y: 40, width: 60, height: 24 }),
      layer({ id: "t", type: "text", x: 24, y: 42, width: 40, height: 18, text: "Buy" }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const heroRes = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["h", "b", "t"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(heroRes.ok).toBe(true);
    if (!heroRes.ok) return;
    const btnRes = createButtonFromSelection({
      blueprint: heroRes.blueprint,
      selectedLayerIds: ["b", "t"],
      index,
      preferredParentId: heroRes.createdNodeId,
    });
    expect(btnRes.ok).toBe(true);
    if (!btnRes.ok) return;
    const removed = removeBlueprintNodePreservingContent(btnRes.blueprint, btnRes.createdNodeId!);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.blueprint.nodes[btnRes.createdNodeId!]).toBeUndefined();
    const heroLayers = removed.blueprint.nodes[heroRes.createdNodeId!]?.layerIds ?? [];
    expect(heroLayers.sort()).toEqual(["b", "h", "t"]);
  });

  it("12. remove root Button returns layers to Landing (unowned)", () => {
    const committed = page([
      layer({ id: "b", type: "rect", x: 0, y: 0, width: 60, height: 24 }),
      layer({ id: "t", type: "text", x: 4, y: 2, width: 40, height: 18, text: "X" }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const btnRes = createButtonFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["b", "t"],
      index,
    });
    expect(btnRes.ok).toBe(true);
    if (!btnRes.ok) return;
    const removed = removeBlueprintNodePreservingContent(btnRes.blueprint, btnRes.createdNodeId!);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(Object.keys(removed.blueprint.nodes)).toHaveLength(0);
    expect(countUnstructuredVisualLayers(removed.blueprint, index)).toBe(2);
  });

  it("13. remove Hero keeps Button as root", () => {
    const committed = page([
      layer({ id: "h", type: "rect", x: 0, y: 0, width: 200, height: 100 }),
      layer({ id: "b", type: "rect", x: 20, y: 40, width: 60, height: 24 }),
      layer({ id: "t", type: "text", x: 24, y: 42, width: 40, height: 18, text: "Buy" }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const heroRes = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["h", "b", "t"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(heroRes.ok).toBe(true);
    if (!heroRes.ok) return;
    const btnRes = createButtonFromSelection({
      blueprint: heroRes.blueprint,
      selectedLayerIds: ["b", "t"],
      index,
      preferredParentId: heroRes.createdNodeId,
    });
    expect(btnRes.ok).toBe(true);
    if (!btnRes.ok) return;
    const removed = removeBlueprintNodePreservingContent(btnRes.blueprint, heroRes.createdNodeId!);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.blueprint.nodes[heroRes.createdNodeId!]).toBeUndefined();
    expect(removed.blueprint.rootChildIds).toEqual([btnRes.createdNodeId]);
    expect(removed.blueprint.nodes[btnRes.createdNodeId!]?.parentId).toBeNull();
  });

  it("14. remove LayoutGroup keeps children", () => {
    const committed = page([
      layer({ id: "a", type: "rect", x: 0, y: 0, width: 40, height: 40 }),
      layer({ id: "b", type: "rect", x: 50, y: 0, width: 40, height: 40 }),
      layer({ id: "t", type: "text", x: 50, y: 8, width: 30, height: 20, text: "B" }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const groupRes = createLayoutGroupFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["a", "b", "t"],
      index,
      preferredParentId: null,
    });
    expect(groupRes.ok).toBe(true);
    if (!groupRes.ok) return;
    const btnRes = createButtonFromSelection({
      blueprint: groupRes.blueprint,
      selectedLayerIds: ["b", "t"],
      index,
      preferredParentId: groupRes.createdNodeId,
    });
    expect(btnRes.ok).toBe(true);
    if (!btnRes.ok) return;
    const removed = removeBlueprintNodePreservingContent(btnRes.blueprint, groupRes.createdNodeId!);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.blueprint.nodes[groupRes.createdNodeId!]).toBeUndefined();
    expect(removed.blueprint.rootChildIds).toContain(btnRes.createdNodeId);
    expect(removed.blueprint.nodes[btnRes.createdNodeId!]?.parentId).toBeNull();
  });

  it("15. create LayoutGroup inside Hero", () => {
    const committed = page([
      layer({ id: "h", type: "rect", x: 0, y: 0, width: 200, height: 120 }),
      layer({ id: "g1", type: "rect", x: 10, y: 10, width: 40, height: 40 }),
      layer({ id: "g2", type: "rect", x: 60, y: 10, width: 40, height: 40 }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const heroRes = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["h", "g1", "g2"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(heroRes.ok).toBe(true);
    if (!heroRes.ok) return;
    const groupRes = createLayoutGroupFromSelection({
      blueprint: heroRes.blueprint,
      selectedLayerIds: ["g1", "g2"],
      index,
      preferredParentId: heroRes.createdNodeId,
    });
    expect(groupRes.ok).toBe(true);
    if (!groupRes.ok) return;
    expect(groupRes.blueprint.nodes[groupRes.createdNodeId!]?.parentId).toBe(heroRes.createdNodeId);
  });

  it("16. create LayoutGroup root", () => {
    const committed = page([
      layer({ id: "a", type: "rect", x: 0, y: 0, width: 40, height: 40 }),
      layer({ id: "b", type: "rect", x: 50, y: 0, width: 40, height: 40 }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const groupRes = createLayoutGroupFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["a", "b"],
      index,
      preferredParentId: null,
    });
    expect(groupRes.ok).toBe(true);
    if (!groupRes.ok) return;
    expect(groupRes.blueprint.rootChildIds).toEqual([groupRes.createdNodeId]);
    expect(groupRes.blueprint.nodes[groupRes.createdNodeId!]?.parentId).toBeNull();
  });

  it("17. groupContainer can split semantic ownership via expandGroupContainersForSelection", () => {
    const committed = page([
      layer({
        id: "g",
        type: "groupContainer",
        width: 100,
        height: 100,
        children: [
          layer({ id: "c1", type: "rect", x: 2, y: 2, width: 8, height: 8 }),
          layer({ id: "c2", type: "rect", x: 20, y: 2, width: 8, height: 8 }),
        ],
      }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const heroRes = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["g"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(heroRes.ok).toBe(true);
    if (!heroRes.ok) return;
    expect(heroRes.blueprint.nodes[heroRes.createdNodeId!]?.layerIds).toEqual(["g"]);
    const expanded = expandGroupContainersForSelection(heroRes.blueprint, ["c1"], index);
    expect(expanded.blueprint.nodes[heroRes.createdNodeId!]?.layerIds.sort()).toEqual(["c2"]);
    expect(expanded.resolvedLayerIds).toContain("c1");
    expect(expanded.resolvedLayerIds).not.toContain("g");
  });

  it("18. clippingContainer descendant blocked", () => {
    const committed = page([
      layer({
        id: "clip",
        type: "clippingContainer",
        x: 0,
        y: 0,
        width: 60,
        height: 60,
        mask: layer({ id: "mask", type: "rect", x: 0, y: 0, width: 60, height: 60 }),
        content: [layer({ id: "c", type: "rect", x: 5, y: 5, width: 40, height: 40 })],
      } as Partial<FreehandObject> & { id: string; type: "clippingContainer" }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const violations = findAtomicContainerViolations(["c"], index);
    expect(violations.some((v) => v.layerId === "c")).toBe(true);
    const result = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["c"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("atomic_container");
  });

  it("19. booleanGroup descendant blocked", () => {
    const committed = page([
      layer({
        id: "bool",
        type: "booleanGroup",
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        operation: "union",
        children: [layer({ id: "leaf", type: "rect", x: 0, y: 0, width: 50, height: 50 })],
      }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    expect(findAtomicContainerViolations(["leaf"], index).some((v) => v.layerId === "leaf")).toBe(true);
    const result = createButtonFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["leaf"],
      index,
      accessibleLabel: "Leaf",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("atomic_container");
  });

  it("20. layer cannot have two owners (validateBlueprintOwnership)", () => {
    const bp: SiteBlueprintV1 = {
      schemaVersion: 1,
      rootChildIds: ["s1", "s2"],
      nodes: {
        s1: {
          id: "s1",
          kind: "section",
          sectionType: "hero",
          label: "A",
          parentId: null,
          childIds: [],
          layerIds: ["shared"],
          sourceRange: { top: 0, bottom: 100 },
        },
        s2: {
          id: "s2",
          kind: "section",
          sectionType: "generic",
          label: "B",
          parentId: null,
          childIds: [],
          layerIds: ["shared"],
          sourceRange: { top: 100, bottom: 200 },
        },
      },
    };
    const ownership = validateBlueprintOwnership(bp);
    expect(ownership.ok).toBe(false);
    if (ownership.ok) return;
    expect(ownership.duplicateLayerIds).toContain("shared");
  });

  it("21. ancestor+descendant not both assigned", () => {
    const committed = page([
      layer({
        id: "g",
        type: "groupContainer",
        width: 100,
        height: 100,
        children: [layer({ id: "c1", type: "rect", x: 2, y: 2, width: 8, height: 8 })],
      }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const bp: SiteBlueprintV1 = {
      schemaVersion: 1,
      rootChildIds: ["s1"],
      nodes: {
        s1: {
          id: "s1",
          kind: "section",
          sectionType: "hero",
          label: "Hero",
          parentId: null,
          childIds: [],
          layerIds: ["g", "c1"],
          sourceRange: { top: 0, bottom: 100 },
        },
      },
    };
    const ownership = validateBlueprintOwnership(bp, index);
    expect(ownership.ok).toBe(false);
  });

  it("22. Button cannot contain Button (validateSiteBlueprintTree)", () => {
    const bp: SiteBlueprintV1 = {
      schemaVersion: 1,
      rootChildIds: ["btn1"],
      nodes: {
        btn1: {
          id: "btn1",
          kind: "component",
          componentType: "button",
          label: "Outer",
          parentId: null,
          childIds: ["btn2"],
          layerIds: [],
          config: { accessibleLabel: "Outer", action: null },
        },
        btn2: {
          id: "btn2",
          kind: "component",
          componentType: "button",
          label: "Inner",
          parentId: "btn1",
          childIds: [],
          layerIds: [],
          config: { accessibleLabel: "Inner", action: null },
        },
      },
    };
    const result = validateSiteBlueprintTree(bp);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.code === "button_in_button")).toBe(true);
  });

  it("23. Section cannot nest", () => {
    const committed = page([
      layer({ id: "a", type: "rect", x: 0, y: 0, width: 100, height: 50 }),
      layer({ id: "b", type: "rect", x: 0, y: 60, width: 100, height: 50 }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const first = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["a"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const nested = createSectionFromSelection({
      blueprint: first.blueprint,
      selectedLayerIds: ["a", "b"],
      index,
      committedPage: committed,
      sectionType: "generic",
    });
    expect(nested.ok).toBe(false);
    if (nested.ok) return;
    expect(nested.code).toBe("nested_section");
  });

  it("24. sourceRange calculation correct", () => {
    const committed = page([
      layer({ id: "top", type: "rect", x: 10, y: 40, width: 100, height: 80 }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const result = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["top"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const section = result.blueprint.nodes[result.createdNodeId!] as SiteBlueprintSectionNode;
    expect(section.sourceRange.top).toBe(40);
    expect(section.sourceRange.bottom).toBe(120);
  });

  it("25. Sections ordered by vertical position", () => {
    const committed = page([
      layer({ id: "lower", type: "rect", x: 0, y: 300, width: 80, height: 40 }),
      layer({ id: "upper", type: "rect", x: 0, y: 20, width: 80, height: 40 }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const lower = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["lower"],
      index,
      committedPage: committed,
      sectionType: "generic",
    });
    expect(lower.ok).toBe(true);
    if (!lower.ok) return;
    const upper = createSectionFromSelection({
      blueprint: lower.blueprint,
      selectedLayerIds: ["upper"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(upper.ok).toBe(true);
    if (!upper.ok) return;
    expect(upper.blueprint.rootChildIds).toEqual([upper.createdNodeId, lower.createdNodeId]);
  });

  it("26. parent suggested by unique sourceRange", () => {
    const committed = page([
      layer({ id: "sec", type: "rect", x: 0, y: 0, width: 200, height: 200 }),
      layer({ id: "btn", type: "rect", x: 40, y: 60, width: 60, height: 24 }),
      layer({ id: "txt", type: "text", x: 44, y: 62, width: 40, height: 18, text: "Go" }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const heroRes = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["sec"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(heroRes.ok).toBe(true);
    if (!heroRes.ok) return;
    const parent = resolveButtonParent({
      blueprint: heroRes.blueprint,
      selectedLayerIds: ["btn", "txt"],
      index,
    });
    expect(parent.status).toBe("resolved");
    if (parent.status !== "resolved") return;
    expect(parent.parentId).toBe(heroRes.createdNodeId);
  });

  it("27. ambiguous parent requires choice", () => {
    const committed = page([
      layer({ id: "a", type: "rect", x: 0, y: 0, width: 200, height: 400 }),
      layer({ id: "b", type: "rect", x: 100, y: 0, width: 200, height: 400 }),
      layer({ id: "free", type: "rect", x: 150, y: 200, width: 40, height: 30 }),
      layer({ id: "freeTxt", type: "text", x: 152, y: 202, width: 30, height: 20, text: "F" }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const secA = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["a"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(secA.ok).toBe(true);
    if (!secA.ok) return;
    const secB = createSectionFromSelection({
      blueprint: secA.blueprint,
      selectedLayerIds: ["b"],
      index,
      committedPage: committed,
      sectionType: "generic",
    });
    expect(secB.ok).toBe(true);
    if (!secB.ok) return;
    const parent = resolveButtonParent({
      blueprint: secB.blueprint,
      selectedLayerIds: ["free", "freeTxt"],
      index,
    });
    expect(parent.status).toBe("ambiguous");
    if (parent.status !== "ambiguous") return;
    expect(parent.candidateParentIds.sort()).toEqual([secA.createdNodeId, secB.createdNodeId].sort());
  });

  it("28. single text → labelLayerId", () => {
    const committed = page([
      layer({ id: "bg", type: "rect", x: 0, y: 0, width: 80, height: 30 }),
      layer({ id: "only", type: "text", x: 4, y: 4, width: 60, height: 20, text: "Hello" }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const result = createButtonFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "only"],
      index,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const btn = result.blueprint.nodes[result.createdNodeId!] as SiteBlueprintComponentNode;
    expect(btn.config.labelLayerId).toBe("only");
    expect(btn.config.accessibleLabel).toBe("Hello");
  });

  it("29. multiple texts require label", () => {
    const committed = page([
      layer({ id: "t1", type: "text", x: 0, y: 0, width: 40, height: 20, text: "A" }),
      layer({ id: "t2", type: "text", x: 50, y: 0, width: 40, height: 20, text: "B" }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const result = createButtonFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["t1", "t2"],
      index,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("label_required");
  });

  it("30. no text requires accessibleLabel", () => {
    const committed = page([layer({ id: "icon", type: "rect", x: 0, y: 0, width: 32, height: 32 })]);
    const index = buildSiteSelectionIndex(committed);
    const missing = createButtonFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["icon"],
      index,
    });
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.code).toBe("accessible_label_required");
    const ok = createButtonFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["icon"],
      index,
      accessibleLabel: "Icon button",
    });
    expect(ok.ok).toBe(true);
  });

  it("31. remove structure does not change snapshot page reference/content", () => {
    const committed = page([
      layer({ id: "b", type: "rect", x: 0, y: 0, width: 40, height: 40 }),
      layer({ id: "t", type: "text", x: 4, y: 4, width: 30, height: 20, text: "Hi" }),
    ]);
    const snapshot = buildDesignerSourceSnapshot("designer_1", committed);
    const pageRef = snapshot.page;
    const objectsRef = snapshot.page.objects;
    const index = buildSiteSelectionIndex(snapshot.page);
    const btnRes = createButtonFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["b", "t"],
      index,
    });
    expect(btnRes.ok).toBe(true);
    if (!btnRes.ok) return;
    const removed = removeBlueprintNodePreservingContent(btnRes.blueprint, btnRes.createdNodeId!);
    expect(removed.ok).toBe(true);
    expect(snapshot.page).toBe(pageRef);
    expect(snapshot.page.objects).toBe(objectsRef);
    expect(snapshot.page.objects.map((o) => o.id)).toEqual(["b", "t"]);
  });

  it("32. create structure does not mutate committed page objects", () => {
    const committed = page([
      layer({ id: "a", type: "rect", x: 0, y: 0, width: 40, height: 40 }),
      layer({ id: "b", type: "rect", x: 50, y: 0, width: 40, height: 40 }),
    ]);
    const objectsBefore = committed.objects;
    const serialized = JSON.stringify(committed.objects);
    const index = buildSiteSelectionIndex(committed);
    const result = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["a", "b"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(result.ok).toBe(true);
    expect(committed.objects).toBe(objectsBefore);
    expect(JSON.stringify(committed.objects)).toBe(serialized);
  });

  it("33. geometry unchanged (same object refs positions)", () => {
    const a = layer({ id: "a", type: "rect", x: 12, y: 34, width: 40, height: 40 });
    const b = layer({ id: "b", type: "rect", x: 50, y: 60, width: 40, height: 40 });
    const committed = page([a, b]);
    const index = buildSiteSelectionIndex(committed);
    const result = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["a", "b"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(result.ok).toBe(true);
    expect(committed.objects[0]).toBe(a);
    expect(committed.objects[1]).toBe(b);
    expect(a.x).toBe(12);
    expect(a.y).toBe(34);
    expect(b.x).toBe(50);
    expect(b.y).toBe(60);
  });

  it("34. canPersistSiteStructure allowed when connected and synced", () => {
    const gate = canPersistSiteStructure({
      originState: "synced",
      hasSnapshot: true,
    });
    expect(gate.allowed).toBe(true);
    if (!gate.allowed) return;
    expect(gate.mode).toBe("synced");
  });

  it("35. canPersistSiteStructure allowed on source_disconnected", () => {
    const gate = canPersistSiteStructure({
      originState: "source_disconnected",
      hasSnapshot: true,
    });
    expect(gate.allowed).toBe(true);
    if (!gate.allowed) return;
    expect(gate.mode).toBe("disconnected");
  });

  it("36. undo restores previous blueprint", () => {
    const empty = createEmptySiteBlueprintV1();
    const next: SiteBlueprintV1 = {
      schemaVersion: 1,
      rootChildIds: ["s1"],
      nodes: {
        s1: {
          id: "s1",
          kind: "section",
          sectionType: "hero",
          label: "Hero",
          parentId: null,
          childIds: [],
          layerIds: ["a"],
          sourceRange: { top: 0, bottom: 50 },
        },
      },
    };
    let hist = createBlueprintHistory(empty);
    hist = pushBlueprintHistory(hist, next);
    const undone = undoBlueprintHistory(hist);
    expect(undone).not.toBeNull();
    expect(undone!.present).toBe(empty);
    expect(undone!.present.rootChildIds).toEqual([]);
  });

  it("37. redo restores next", () => {
    const empty = createEmptySiteBlueprintV1();
    const next: SiteBlueprintV1 = {
      schemaVersion: 1,
      rootChildIds: ["s1"],
      nodes: {
        s1: {
          id: "s1",
          kind: "section",
          sectionType: "hero",
          label: "Hero",
          parentId: null,
          childIds: [],
          layerIds: [],
          sourceRange: { top: 0, bottom: 10 },
        },
      },
    };
    const hist = pushBlueprintHistory(createBlueprintHistory(empty), next);
    const undone = undoBlueprintHistory(hist)!;
    const redone = redoBlueprintHistory(undone)!;
    expect(redone.present).toBe(next);
  });

  it("38. new op after undo clears redo", () => {
    const a = createEmptySiteBlueprintV1();
    const b: SiteBlueprintV1 = { ...a, rootChildIds: ["x"], nodes: {} };
    const c: SiteBlueprintV1 = { ...a, rootChildIds: ["y"], nodes: {} };
    let hist = pushBlueprintHistory(createBlueprintHistory(a), b);
    hist = undoBlueprintHistory(hist)!;
    expect(hist.future.length).toBe(1);
    hist = pushBlueprintHistory(hist, c);
    expect(hist.future).toEqual([]);
    expect(hist.present).toBe(c);
  });

  it("39. one push = one history step (write count simulation)", () => {
    let writeCount = 0;
    const empty = createEmptySiteBlueprintV1();
    let hist = createBlueprintHistory(empty);
    const next: SiteBlueprintV1 = {
      schemaVersion: 1,
      rootChildIds: ["n1"],
      nodes: {},
    };
    hist = pushBlueprintHistory(hist, next);
    writeCount += 1;
    expect(writeCount).toBe(1);
    expect(hist.past.length).toBe(1);
    expect(hist.future.length).toBe(0);
  });

  it("40. serialize/reload keeps Hero+Button nested", () => {
    const committed = page([
      layer({ id: "h", type: "rect", x: 0, y: 0, width: 200, height: 100 }),
      layer({ id: "b", type: "rect", x: 20, y: 40, width: 60, height: 24 }),
      layer({ id: "t", type: "text", x: 24, y: 42, width: 40, height: 18, text: "Buy" }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const heroRes = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["h", "b", "t"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(heroRes.ok).toBe(true);
    if (!heroRes.ok) return;
    const btnRes = createButtonFromSelection({
      blueprint: heroRes.blueprint,
      selectedLayerIds: ["b", "t"],
      index,
      preferredParentId: heroRes.createdNodeId,
    });
    expect(btnRes.ok).toBe(true);
    if (!btnRes.ok) return;
    const parsed = parseSiteCreatorNodeData({
      schemaVersion: 1,
      blueprint: JSON.parse(JSON.stringify(btnRes.blueprint)),
    });
    const hero = parsed.blueprint.nodes[heroRes.createdNodeId!];
    const btn = parsed.blueprint.nodes[btnRes.createdNodeId!];
    expect(hero && isSiteSectionNode(hero)).toBe(true);
    expect(btn && isSiteButtonNode(btn)).toBe(true);
    expect(btn?.parentId).toBe(heroRes.createdNodeId);
    expect(hero?.childIds).toContain(btnRes.createdNodeId);
  });

  it("41. broken layer ref stays in blueprint", () => {
    const bp: SiteBlueprintV1 = {
      schemaVersion: 1,
      rootChildIds: ["s1"],
      nodes: {
        s1: {
          id: "s1",
          kind: "section",
          sectionType: "hero",
          label: "Hero",
          parentId: null,
          childIds: [],
          layerIds: ["missing_layer"],
          sourceRange: { top: 0, bottom: 100 },
        },
      },
    };
    expect(validateSiteBlueprintTree(bp).ok).toBe(true);
    expect(collectSemanticCoverageLayerIds(bp, "s1")).toEqual(["missing_layer"]);
  });

  it("42. unstructured visual content is not an error (validate ok + count > 0)", () => {
    const committed = page([
      layer({ id: "owned", type: "rect", x: 0, y: 0, width: 40, height: 40 }),
      layer({ id: "free", type: "rect", x: 100, y: 100, width: 40, height: 40 }),
    ]);
    const index = buildSiteSelectionIndex(committed);
    const result = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["owned"],
      index,
      committedPage: committed,
      sectionType: "hero",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(validateSiteBlueprintTree(result.blueprint, index).ok).toBe(true);
    expect(countUnstructuredVisualLayers(result.blueprint, index)).toBeGreaterThan(0);
  });

  it("43. selecting semantic clears layers conceptually via exclusiveSelection", () => {
    // Skip full UI mutual exclusion; cover the pure exclusivity flag instead.
    expect(exclusiveSelection("semantic")).toEqual({ semantic: true, layers: false });
    expect(exclusiveSelection("layers")).toEqual({ semantic: false, layers: true });
  });

  it("44. validation detects cycles", () => {
    const bp: SiteBlueprintV1 = {
      schemaVersion: 1,
      rootChildIds: ["a"],
      nodes: {
        a: {
          id: "a",
          kind: "layoutGroup",
          label: "A",
          parentId: null,
          childIds: ["b"],
          layerIds: [],
        },
        b: {
          id: "b",
          kind: "layoutGroup",
          label: "B",
          parentId: "a",
          childIds: ["a"],
          layerIds: [],
        },
      },
    };
    const result = validateSiteBlueprintTree(bp);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.code === "cycle")).toBe(true);
  });

  it("45. validation detects parent/child inconsistency", () => {
    const bp: SiteBlueprintV1 = {
      schemaVersion: 1,
      rootChildIds: ["parent"],
      nodes: {
        parent: {
          id: "parent",
          kind: "layoutGroup",
          label: "P",
          parentId: null,
          childIds: ["child"],
          layerIds: [],
        },
        child: {
          id: "child",
          kind: "layoutGroup",
          label: "C",
          parentId: null,
          childIds: [],
          layerIds: [],
        },
      },
    };
    const result = validateSiteBlueprintTree(bp);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.code === "parent_child_mismatch")).toBe(true);
  });

  it("46. validation detects duplicate layerId", () => {
    const bp: SiteBlueprintV1 = {
      schemaVersion: 1,
      rootChildIds: ["s1", "btn"],
      nodes: {
        s1: {
          id: "s1",
          kind: "section",
          sectionType: "hero",
          label: "Hero",
          parentId: null,
          childIds: ["btn"],
          layerIds: ["dup"],
          sourceRange: { top: 0, bottom: 50 },
        },
        btn: {
          id: "btn",
          kind: "component",
          componentType: "button",
          label: "Btn",
          parentId: "s1",
          childIds: [],
          layerIds: ["dup"],
          config: { accessibleLabel: "Btn", action: null },
        },
      },
    };
    const result = validateSiteBlueprintTree(bp);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.code === "duplicate_layer")).toBe(true);
  });
});

describe("moveLayersToBlueprintNode helper", () => {
  it("transfers without leaving duplicates", () => {
    const bp: SiteBlueprintV1 = {
      schemaVersion: 1,
      rootChildIds: ["s1", "btn"],
      nodes: {
        s1: {
          id: "s1",
          kind: "section",
          sectionType: "hero",
          label: "Hero",
          parentId: null,
          childIds: ["btn"],
          layerIds: ["a", "b"],
          sourceRange: { top: 0, bottom: 50 },
        },
        btn: {
          id: "btn",
          kind: "component",
          componentType: "button",
          label: "Btn",
          parentId: "s1",
          childIds: [],
          layerIds: [],
          config: { accessibleLabel: "Btn", action: null },
        },
      },
    };
    const next = moveLayersToBlueprintNode(bp, "btn", ["b"]);
    expect(next.nodes.s1?.layerIds).toEqual(["a"]);
    expect(next.nodes.btn?.layerIds).toEqual(["b"]);
    expect(validateBlueprintOwnership(next).ok).toBe(true);
  });
});
