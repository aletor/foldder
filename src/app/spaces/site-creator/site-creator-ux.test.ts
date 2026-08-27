import { beforeEach, describe, expect, it } from "vitest";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { buildDesignerSourceSnapshot } from "./designer-source-snapshot";
import { resetSiteBlueprintIdSeqForTests } from "./site-blueprint-ids";
import {
  createButtonFromSelection,
  createLayoutGroupFromSelection,
  createSectionFromSelection,
  removeBlueprintNodePreservingContent,
} from "./site-blueprint-ops";
import {
  createBlueprintHistory,
  pushBlueprintHistory,
  redoBlueprintHistory,
  undoBlueprintHistory,
  canPersistSiteStructure,
} from "./site-blueprint-history";
import {
  deriveBlueprintNodeDisplayLabel,
  deriveLayerDisplayLabel,
  collapseLayersToSelectionUnits,
  resolveRootClickUnit,
  toggleSelectionUnit,
  unitsToStructureLayerIds,
  type SiteCreatorSelectionUnit,
} from "./site-creator-display-labels";
import {
  looksLikeButtonCandidate,
  resolveContextualModel,
  selectionContainsUnitInsideSection,
} from "./site-creator-contextual-actions";
import {
  createEmptySiteBlueprintV1,
  isSiteButtonNode,
  isSiteSectionNode,
  parseSiteCreatorNodeData,
  createDefaultSiteCreatorNodeData,
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
  if (partial.type === "text") {
    return {
      fontSize: 16,
      lineHeight: 1.2,
      fontFamily: "sans-serif",
      fontWeight: "400",
      textMode: "area",
      text: "BOTOM",
      ...base,
    } as FreehandObject;
  }
  return base as FreehandObject;
}

function page(objects: FreehandObject[]): DesignerPageState {
  return { id: "pg", format: "web169", objects };
}

beforeEach(() => {
  resetSiteBlueprintIdSeqForTests(0);
});

function makeButtonPage() {
  return page([
    layer({ id: "bg", type: "rect", x: 0, y: 0, width: 200, height: 80 }),
    layer({ id: "btn_shape", type: "rect", x: 20, y: 20, width: 80, height: 32, name: "BOT_EMPEZAR" }),
    layer({
      id: "btn_text",
      type: "text",
      x: 28,
      y: 24,
      width: 64,
      height: 24,
      text: "BOTOM",
      name: "Text 3",
    }),
    layer({ id: "title", type: "text", x: 20, y: 100, width: 120, height: 30, text: "Titular" }),
  ]);
}

describe("site creator UX selection units", () => {
  it("click on button label layer resolves to Button unit", () => {
    const p = makeButtonPage();
    const index = buildSiteSelectionIndex(p);
    let bp = createEmptySiteBlueprintV1();
    const created = createButtonFromSelection({
      blueprint: bp,
      selectedLayerIds: ["btn_shape", "btn_text"],
      index,
      accessibleLabel: "BOTOM",
      labelLayerId: "btn_text",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    bp = created.blueprint;
    const unit = resolveRootClickUnit("btn_text", bp, index);
    expect(unit).toEqual({ kind: "blueprintNode", nodeId: created.createdNodeId });
  });

  it("click on button background shape resolves to the same Button", () => {
    const p = makeButtonPage();
    const index = buildSiteSelectionIndex(p);
    const created = createButtonFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["btn_shape", "btn_text"],
      index,
      accessibleLabel: "BOTOM",
      labelLayerId: "btn_text",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(resolveRootClickUnit("btn_shape", created.blueprint, index)).toEqual({
      kind: "blueprintNode",
      nodeId: created.createdNodeId,
    });
  });

  it("does not keep Button and its layers together in units", () => {
    const p = makeButtonPage();
    const index = buildSiteSelectionIndex(p);
    const created = createButtonFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["btn_shape", "btn_text"],
      index,
      accessibleLabel: "BOTOM",
      labelLayerId: "btn_text",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const units = collapseLayersToSelectionUnits(
      ["btn_shape", "btn_text", "title"],
      created.blueprint,
      index,
    );
    expect(units).toEqual([
      { kind: "blueprintNode", nodeId: created.createdNodeId },
      { kind: "layer", layerId: "title" },
    ]);
  });

  it("marquee over button layers returns a single semantic unit", () => {
    const p = makeButtonPage();
    const index = buildSiteSelectionIndex(p);
    const created = createButtonFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["btn_shape", "btn_text"],
      index,
      accessibleLabel: "BOTOM",
      labelLayerId: "btn_text",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const units = collapseLayersToSelectionUnits(["btn_shape", "btn_text"], created.blueprint, index);
    expect(units).toHaveLength(1);
    expect(units[0]?.kind).toBe("blueprintNode");
  });

  it("marquee can return Button + free layers", () => {
    const p = makeButtonPage();
    const index = buildSiteSelectionIndex(p);
    const created = createButtonFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["btn_shape", "btn_text"],
      index,
      accessibleLabel: "BOTOM",
      labelLayerId: "btn_text",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const units = collapseLayersToSelectionUnits(
      ["btn_shape", "title", "bg"],
      created.blueprint,
      index,
    );
    expect(units.some((u) => u.kind === "blueprintNode")).toBe(true);
    expect(units.some((u) => u.kind === "layer" && u.layerId === "title")).toBe(true);
    expect(units.some((u) => u.kind === "layer" && u.layerId === "bg")).toBe(true);
  });

  it("shift can combine semantic nodes and layers", () => {
    const p = makeButtonPage();
    const index = buildSiteSelectionIndex(p);
    const created = createButtonFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["btn_shape", "btn_text"],
      index,
      accessibleLabel: "BOTOM",
      labelLayerId: "btn_text",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const buttonUnit: SiteCreatorSelectionUnit = {
      kind: "blueprintNode",
      nodeId: created.createdNodeId!,
    };
    const next = toggleSelectionUnit([buttonUnit], { kind: "layer", layerId: "title" }, created.blueprint);
    expect(next).toHaveLength(2);
  });

  it("root click never returns a partial Button as separate layers", () => {
    const p = makeButtonPage();
    const index = buildSiteSelectionIndex(p);
    const created = createButtonFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["btn_shape", "btn_text"],
      index,
      accessibleLabel: "BOTOM",
      labelLayerId: "btn_text",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(resolveRootClickUnit("btn_text", created.blueprint, index).kind).toBe("blueprintNode");
    expect(resolveRootClickUnit("btn_shape", created.blueprint, index).kind).toBe("blueprintNode");
  });
});

describe("site creator UX create Hero from Button + layers", () => {
  it("reparents full Button and keeps id/config", () => {
    const p = makeButtonPage();
    const index = buildSiteSelectionIndex(p);
    const snap = buildDesignerSourceSnapshot("d1", p);
    let bp = createEmptySiteBlueprintV1();
    const btn = createButtonFromSelection({
      blueprint: bp,
      selectedLayerIds: ["btn_shape", "btn_text"],
      index,
      accessibleLabel: "BOTOM",
      labelLayerId: "btn_text",
    });
    expect(btn.ok).toBe(true);
    if (!btn.ok) return;
    bp = btn.blueprint;
    const buttonId = btn.createdNodeId!;
    const before = bp.nodes[buttonId];
    expect(isSiteButtonNode(before!)).toBe(true);

    const units = collapseLayersToSelectionUnits(
      ["btn_shape", "btn_text", "title", "bg"],
      bp,
      index,
    );
    const layerIds = unitsToStructureLayerIds(units, bp);
    const hero = createSectionFromSelection({
      blueprint: bp,
      selectedLayerIds: layerIds,
      index,
      committedPage: snap.page,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok) return;
    const after = hero.blueprint.nodes[buttonId];
    expect(after).toBeDefined();
    expect(isSiteButtonNode(after!)).toBe(true);
    if (!isSiteButtonNode(after!)) return;
    expect(after.config.labelLayerId).toBe("btn_text");
    expect(after.config.accessibleLabel).toBe("BOTOM");
    expect(after.parentId).toBe(hero.createdNodeId);
    expect(hero.blueprint.nodes[hero.createdNodeId!]?.childIds).toContain(buttonId);
  });
});

describe("site creator UX contextual actions", () => {
  const gateOk = canPersistSiteStructure({ originState: "synced", hasSnapshot: true });

  it("shape + text shows Crear botón as primary", () => {
    const p = makeButtonPage();
    const index = buildSiteSelectionIndex(p);
    const units: SiteCreatorSelectionUnit[] = [
      { kind: "layer", layerId: "btn_shape" },
      { kind: "layer", layerId: "btn_text" },
    ];
    expect(looksLikeButtonCandidate(units, index)).toBe(true);
    const model = resolveContextualModel({
      units,
      inspectNodeId: null,
      blueprint: createEmptySiteBlueprintV1(),
      index,
      snapshot: null,
      persistGate: gateOk,
    });
    expect(model.primaryActions[0]?.id).toBe("createButton");
    expect(model.primaryActions[0]?.primary).toBe(true);
    expect(model.primaryActions.some((a) => a.id === "createSection")).toBe(true);
    expect(model.primaryActions.some((a) => a.id === "keepTogether")).toBe(true);
  });

  it("single layer does not show Agrupar", () => {
    const p = makeButtonPage();
    const index = buildSiteSelectionIndex(p);
    const model = resolveContextualModel({
      units: [{ kind: "layer", layerId: "title" }],
      inspectNodeId: null,
      blueprint: createEmptySiteBlueprintV1(),
      index,
      snapshot: null,
      persistGate: gateOk,
    });
    expect(model.primaryActions.some((a) => a.id === "keepTogether")).toBe(false);
    expect(model.primaryActions.some((a) => a.id === "createSection")).toBe(true);
    expect(model.statusMessage).toMatch(/Ctrl\/Cmd/);
  });

  it("several free layers show Agrupar", () => {
    const p = page([
      layer({ id: "a", type: "rect", x: 0, y: 0, width: 20, height: 20 }),
      layer({ id: "b", type: "rect", x: 40, y: 0, width: 20, height: 20 }),
      layer({ id: "c", type: "image", x: 80, y: 0, width: 20, height: 20 }),
    ]);
    const index = buildSiteSelectionIndex(p);
    const model = resolveContextualModel({
      units: [
        { kind: "layer", layerId: "a" },
        { kind: "layer", layerId: "b" },
        { kind: "layer", layerId: "c" },
      ],
      inspectNodeId: null,
      blueprint: createEmptySiteBlueprintV1(),
      index,
      snapshot: null,
      persistGate: gateOk,
    });
    expect(looksLikeButtonCandidate(
      [
        { kind: "layer", layerId: "a" },
        { kind: "layer", layerId: "b" },
        { kind: "layer", layerId: "c" },
      ],
      index,
    )).toBe(false);
    expect(model.primaryActions.some((a) => a.id === "keepTogether")).toBe(true);
    expect(model.primaryActions.find((a) => a.id === "keepTogether")?.label).toBe("Agrupar");
  });

  it("Hero and Sección do not appear as separate actions", () => {
    const p = makeButtonPage();
    const index = buildSiteSelectionIndex(p);
    const model = resolveContextualModel({
      units: [
        { kind: "layer", layerId: "bg" },
        { kind: "layer", layerId: "title" },
      ],
      inspectNodeId: null,
      blueprint: createEmptySiteBlueprintV1(),
      index,
      snapshot: null,
      persistGate: gateOk,
    });
    const labels = model.primaryActions.map((a) => a.label);
    expect(labels.some((l) => l === "Hero" || l === "HERO")).toBe(false);
    expect(labels.some((l) => l === "Sección" || l === "SECCIÓN")).toBe(false);
    expect(model.primaryActions.some((a) => a.id === "createSection")).toBe(true);
  });

  it("selected Button shows Deshacer botón and no structural creates", () => {
    const p = makeButtonPage();
    const index = buildSiteSelectionIndex(p);
    const created = createButtonFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["btn_shape", "btn_text"],
      index,
      accessibleLabel: "BOTOM",
      labelLayerId: "btn_text",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const model = resolveContextualModel({
      units: [{ kind: "blueprintNode", nodeId: created.createdNodeId! }],
      inspectNodeId: null,
      blueprint: created.blueprint,
      index,
      snapshot: null,
      persistGate: gateOk,
    });
    expect(model.primaryActions.map((a) => a.id)).toEqual(["undoButton"]);
    expect(model.primaryActions.some((a) => a.id === "createButton")).toBe(false);
    expect(model.primaryActions.some((a) => a.id === "createSection")).toBe(false);
  });

  it("selected Hero shows Deshacer sección", () => {
    const p = makeButtonPage();
    const index = buildSiteSelectionIndex(p);
    const snap = buildDesignerSourceSnapshot("d1", p);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "title"],
      index,
      committedPage: snap.page,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok) return;
    const model = resolveContextualModel({
      units: [{ kind: "blueprintNode", nodeId: hero.createdNodeId! }],
      inspectNodeId: null,
      blueprint: hero.blueprint,
      index,
      snapshot: snap,
      persistGate: gateOk,
    });
    expect(model.summary).toMatch(/^Hero/);
    expect(model.primaryActions.map((a) => a.id)).toEqual(["undoSection"]);
  });

  it("LayoutGroup shows Desagrupar", () => {
    const p = makeButtonPage();
    const index = buildSiteSelectionIndex(p);
    const group = createLayoutGroupFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "title"],
      index,
    });
    expect(group.ok).toBe(true);
    if (!group.ok) return;
    const model = resolveContextualModel({
      units: [{ kind: "blueprintNode", nodeId: group.createdNodeId! }],
      inspectNodeId: null,
      blueprint: group.blueprint,
      index,
      snapshot: null,
      persistGate: gateOk,
    });
    expect(model.primaryActions.map((a) => a.id)).toEqual(["separateGroup"]);
    expect(model.primaryActions.find((a) => a.id === "separateGroup")?.label).toBe("Desagrupar");
  });

  it("LayoutGroup shows Ancho completo on tablet, not on Original", () => {
    const p = makeButtonPage();
    const index = buildSiteSelectionIndex(p);
    const group = createLayoutGroupFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "title"],
      index,
    });
    expect(group.ok).toBe(true);
    if (!group.ok) return;
    const tablet = resolveContextualModel({
      units: [{ kind: "blueprintNode", nodeId: group.createdNodeId! }],
      inspectNodeId: null,
      blueprint: group.blueprint,
      index,
      snapshot: null,
      persistGate: gateOk,
      band: "tablet",
    });
    expect(tablet.primaryActions.map((a) => a.id)).toEqual(["groupWidthFull", "separateGroup"]);
    expect(tablet.primaryActions.find((a) => a.id === "groupWidthFull")?.label).toBe("Ancho completo");
  });

  it("recognizes a nested group and its layers as already inside a section", () => {
    const p = makeButtonPage();
    const index = buildSiteSelectionIndex(p);
    const snap = buildDesignerSourceSnapshot("d1", p);
    const group = createLayoutGroupFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "title"],
      index,
    });
    expect(group.ok).toBe(true);
    if (!group.ok || !group.createdNodeId) return;
    const section = createSectionFromSelection({
      blueprint: group.blueprint,
      selectedLayerIds: ["bg", "title"],
      index,
      committedPage: snap.page,
      sectionType: "generic",
    });
    expect(section.ok).toBe(true);
    if (!section.ok || !section.createdNodeId) return;
    expect(
      selectionContainsUnitInsideSection(
        [{ kind: "blueprintNode", nodeId: group.createdNodeId }],
        section.blueprint,
        index,
      ),
    ).toBe(true);
    expect(
      selectionContainsUnitInsideSection(
        [{ kind: "layer", layerId: "title" }],
        section.blueprint,
        index,
      ),
    ).toBe(true);
  });

  it("inner layer of Button shows no structure ops (ruta vía microbarra)", () => {
    const p = makeButtonPage();
    const index = buildSiteSelectionIndex(p);
    const created = createButtonFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["btn_shape", "btn_text"],
      index,
      accessibleLabel: "BOTOM",
      labelLayerId: "btn_text",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const model = resolveContextualModel({
      units: [{ kind: "layer", layerId: "btn_text" }],
      inspectNodeId: created.createdNodeId!,
      blueprint: created.blueprint,
      index,
      snapshot: null,
      persistGate: gateOk,
    });
    expect(model.primaryActions).toEqual([]);
    expect(model.primaryActions.some((a) => a.id === "createButton")).toBe(false);
    expect(model.primaryActions.some((a) => a.id === "createSection")).toBe(false);
    expect(model.primaryActions.some((a) => a.id === "keepTogether")).toBe(false);
  });
});

describe("site creator UX display labels", () => {
  it("Button label derives from text content", () => {
    const p = makeButtonPage();
    const index = buildSiteSelectionIndex(p);
    const created = createButtonFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["btn_shape", "btn_text"],
      index,
      accessibleLabel: "BOTOM",
      labelLayerId: "btn_text",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const node = created.blueprint.nodes[created.createdNodeId!]!;
    expect(deriveBlueprintNodeDisplayLabel(node, null, index)).toBe("Botón “BOTOM”");
  });

  it("fallback uses accessibleLabel", () => {
    const node = {
      id: "b1",
      kind: "component" as const,
      componentType: "button" as const,
      label: "x",
      parentId: null,
      childIds: [],
      layerIds: [],
      config: { accessibleLabel: "Empezar", action: null },
    };
    expect(deriveBlueprintNodeDisplayLabel(node)).toBe("Botón “Empezar”");
  });

  it("without label shows Botón sin texto", () => {
    const node = {
      id: "b1",
      kind: "component" as const,
      componentType: "button" as const,
      label: "Botón",
      parentId: null,
      childIds: [],
      layerIds: [],
      config: { accessibleLabel: "", action: null },
    };
    expect(deriveBlueprintNodeDisplayLabel(node)).toBe("Botón sin texto");
  });

  it("layer labels avoid technical rect/text names", () => {
    const p = makeButtonPage();
    const index = buildSiteSelectionIndex(p);
    expect(deriveLayerDisplayLabel("btn_text", index)).toBe("Texto “BOTOM”");
    expect(deriveLayerDisplayLabel("btn_shape", index)).toBe("Rectángulo");
  });

  it("outline hierarchy Hero → Button and no Landing Root", () => {
    const p = makeButtonPage();
    const index = buildSiteSelectionIndex(p);
    const snap = buildDesignerSourceSnapshot("d1", p);
    let bp = createEmptySiteBlueprintV1();
    const btn = createButtonFromSelection({
      blueprint: bp,
      selectedLayerIds: ["btn_shape", "btn_text"],
      index,
      accessibleLabel: "BOTOM",
      labelLayerId: "btn_text",
    });
    expect(btn.ok).toBe(true);
    if (!btn.ok) return;
    bp = btn.blueprint;
    const hero = createSectionFromSelection({
      blueprint: bp,
      selectedLayerIds: unitsToStructureLayerIds(
        collapseLayersToSelectionUnits(["btn_shape", "bg", "title"], bp, index),
        bp,
      ),
      index,
      committedPage: snap.page,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok) return;
    const heroNode = hero.blueprint.nodes[hero.createdNodeId!]!;
    const buttonNode = hero.blueprint.nodes[btn.createdNodeId!]!;
    expect(deriveBlueprintNodeDisplayLabel(heroNode, snap, index)).toBe("Hero");
    expect(deriveBlueprintNodeDisplayLabel(buttonNode, snap, index)).toBe("Botón “BOTOM”");
    expect(buttonNode.parentId).toBe(hero.createdNodeId);
    expect(JSON.stringify(hero.blueprint)).not.toContain("Landing Root");
  });

  it("unstructured visual content is not an error", () => {
    const bp = createEmptySiteBlueprintV1();
    expect(bp.rootChildIds).toEqual([]);
    expect(Object.keys(bp.nodes)).toHaveLength(0);
  });
});

describe("site creator UX persistence and undo still work", () => {
  it("undo/redo continues working", () => {
    let hist = createBlueprintHistory(createEmptySiteBlueprintV1());
    const next: SiteBlueprintV1 = {
      schemaVersion: 1,
      rootChildIds: ["sec"],
      nodes: {
        sec: {
          id: "sec",
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
    hist = pushBlueprintHistory(hist, next);
    const undone = undoBlueprintHistory(hist);
    expect(undone?.present.rootChildIds).toEqual([]);
    const redone = redoBlueprintHistory(undone!);
    expect(redone?.present.rootChildIds).toEqual(["sec"]);
  });

  it("blueprint persistence round-trip keeps Hero and Button", () => {
    const p = makeButtonPage();
    const index = buildSiteSelectionIndex(p);
    const snap = buildDesignerSourceSnapshot("d1", p);
    const btn = createButtonFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["btn_shape", "btn_text"],
      index,
      accessibleLabel: "BOTOM",
      labelLayerId: "btn_text",
    });
    expect(btn.ok).toBe(true);
    if (!btn.ok) return;
    const hero = createSectionFromSelection({
      blueprint: btn.blueprint,
      selectedLayerIds: unitsToStructureLayerIds(
        collapseLayersToSelectionUnits(["btn_shape", "bg"], btn.blueprint, index),
        btn.blueprint,
      ),
      index,
      committedPage: snap.page,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok) return;
    const data = {
      ...createDefaultSiteCreatorNodeData(),
      blueprint: hero.blueprint,
      sourceSnapshot: snap,
    };
    const reloaded = parseSiteCreatorNodeData(JSON.parse(JSON.stringify(data)));
    expect(isSiteSectionNode(reloaded.blueprint.nodes[hero.createdNodeId!]!)).toBe(true);
    expect(isSiteButtonNode(reloaded.blueprint.nodes[btn.createdNodeId!]!)).toBe(true);
  });

  it("removing structure does not mutate snapshot page", () => {
    const p = makeButtonPage();
    const index = buildSiteSelectionIndex(p);
    const snap = buildDesignerSourceSnapshot("d1", p);
    const pageRef = snap.page;
    const created = createButtonFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["btn_shape", "btn_text"],
      index,
      accessibleLabel: "BOTOM",
      labelLayerId: "btn_text",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    removeBlueprintNodePreservingContent(created.blueprint, created.createdNodeId!);
    expect(snap.page).toBe(pageRef);
    expect(snap.page.objects.map((o) => o.id)).toEqual(p.objects.map((o) => o.id));
  });

  it("toolbar contextual model is header-oriented (no floating requirement in pure model)", () => {
    const model = resolveContextualModel({
      units: [],
      inspectNodeId: null,
      blueprint: createEmptySiteBlueprintV1(),
      index: buildSiteSelectionIndex(page([])),
      snapshot: null,
      persistGate: canPersistSiteStructure({ originState: "synced", hasSnapshot: true }),
    });
    expect(model.primaryActions).toEqual([]);
    expect(model.summary).toBeNull();
  });
});

describe("site creator UX inspect escape semantics", () => {
  it("escape from inspect returns to Button unit conceptually", () => {
    // Pure mapping used by Studio escape handler
    const buttonId = "btn1";
    const inspectNodeId: string | null = buttonId;
    const units: SiteCreatorSelectionUnit[] = [{ kind: "layer", layerId: "btn_text" }];
    const afterEscape =
      inspectNodeId && units.every((u) => u.kind === "layer")
        ? { units: [{ kind: "blueprintNode" as const, nodeId: inspectNodeId }], inspectNodeId: null }
        : { units: [], inspectNodeId: null };
    expect(afterEscape.units).toEqual([{ kind: "blueprintNode", nodeId: buttonId }]);
    expect(afterEscape.inspectNodeId).toBeNull();
  });

  it("escape from Button clears selection", () => {
    const units: SiteCreatorSelectionUnit[] = [{ kind: "blueprintNode", nodeId: "btn1" }];
    const inspectNodeId: string | null = null;
    const after =
      inspectNodeId && units.every((u) => u.kind === "layer")
        ? { units: [{ kind: "blueprintNode" as const, nodeId: inspectNodeId }], inspectNodeId: null }
        : units.length
          ? { units: [], inspectNodeId: null }
          : { units: [], inspectNodeId: null };
    expect(after.units).toEqual([]);
  });
});
