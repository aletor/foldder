/**
 * Tests de integración 5B: recorrido real UI → Blueprint → outline.
 * No bastan reducers/matrices puras: se renderizan componentes y userEvent.
 */
import React, { useCallback, useMemo, useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
} from "./site-blueprint-history";
import {
  collapseLayersToSelectionUnits,
  resolveRootClickUnit,
  toggleSelectionUnit,
  unitsToStructureLayerIds,
  type SiteCreatorSelectionUnit,
} from "./site-creator-display-labels";
import { resolveContextualModel } from "./site-creator-contextual-actions";
import { SiteCreatorHeaderActions } from "./SiteCreatorHeaderActions";
import { SiteCreatorOutlinePanel } from "./SiteCreatorOutlinePanel";
import { buildSiteCreatorPresentationTree } from "./site-creator-presentation-tree";
import { SiteCreatorSelectionOverlay } from "./SiteCreatorSelectionOverlay";
import {
  createEmptySiteBlueprintV1,
  isSiteButtonNode,
  isSiteSectionNode,
  parseSiteCreatorNodeData,
  createDefaultSiteCreatorNodeData,
  type SiteBlueprintV1,
} from "./site-creator-types";
import {
  EMPTY_SITE_CREATOR_SELECTION,
  type SiteCreatorSelectionState,
} from "./site-creator-selection-types";
import { reduceSiteCreatorSelection } from "./site-creator-selection-reducer";

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

function makePage() {
  return page([
    layer({ id: "bg", type: "rect", x: 0, y: 0, width: 400, height: 200 }),
    layer({ id: "title", type: "text", x: 20, y: 20, width: 200, height: 40, text: "Titular" }),
    layer({ id: "btn_shape", type: "rect", x: 20, y: 120, width: 100, height: 36 }),
    layer({
      id: "btn_text",
      type: "text",
      x: 30,
      y: 126,
      width: 80,
      height: 24,
      text: "BOTOM",
    }),
  ]);
}

/** Harness que replica el cableado Studio: selección → cabecera → ops → outline. */
function StructureHarness({ initialPage }: { initialPage: DesignerPageState }) {
  const snapshot = useMemo(() => buildDesignerSourceSnapshot("designer-1", initialPage), [initialPage]);
  const index = useMemo(() => buildSiteSelectionIndex(snapshot.page), [snapshot.page]);
  const [blueprint, setBlueprint] = useState<SiteBlueprintV1>(() => createEmptySiteBlueprintV1());
  const [units, setUnits] = useState<SiteCreatorSelectionUnit[]>([]);
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const [history, setHistory] = useState(() => createBlueprintHistory(createEmptySiteBlueprintV1()));
  const [error, setError] = useState<string | null>(null);

  const persistGate = { allowed: true as const, mode: "synced" as const };

  const commit = useCallback((next: SiteBlueprintV1) => {
    setBlueprint(next);
    setHistory((h) => pushBlueprintHistory(h, next));
  }, []);

  const model = useMemo(
    () =>
      resolveContextualModel({
        units,
        inspectNodeId: null,
        blueprint,
        index,
        snapshot,
        persistGate,
      }),
    [blueprint, index, snapshot, units],
  );

  const structureLayerIds = useMemo(
    () => unitsToStructureLayerIds(units, blueprint),
    [blueprint, units],
  );

  const clickLayer = (layerId: string, additive: boolean) => {
    const unit = resolveRootClickUnit(layerId, blueprint, index);
    setUnits((current) => (additive ? toggleSelectionUnit(current, unit, blueprint) : [unit]));
    setError(null);
  };

  const applySection = (sectionType: "hero" | "generic") => {
    const result = createSectionFromSelection({
      blueprint,
      selectedLayerIds: structureLayerIds,
      index,
      committedPage: snapshot.page,
      sectionType,
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    commit(result.blueprint);
    setUnits([{ kind: "blueprintNode", nodeId: result.createdNodeId! }]);
    setSectionMenuOpen(false);
  };

  const applyButton = () => {
    const result = createButtonFromSelection({
      blueprint,
      selectedLayerIds: structureLayerIds,
      index,
      accessibleLabel: "BOTOM",
      labelLayerId: "btn_text",
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    commit(result.blueprint);
    setUnits([{ kind: "blueprintNode", nodeId: result.createdNodeId! }]);
  };

  const applyGroup = () => {
    const result = createLayoutGroupFromSelection({
      blueprint,
      selectedLayerIds: structureLayerIds,
      index,
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    commit(result.blueprint);
    setUnits([{ kind: "blueprintNode", nodeId: result.createdNodeId! }]);
  };

  const removeSelected = () => {
    const id = units[0]?.kind === "blueprintNode" ? units[0].nodeId : null;
    if (!id) return;
    const result = removeBlueprintNodePreservingContent(blueprint, id);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    commit(result.blueprint);
    setUnits([]);
  };

  const undo = () => {
    const next = undoBlueprintHistory(history);
    if (!next) return;
    setHistory(next);
    setBlueprint(next.present);
  };

  const redo = () => {
    const next = redoBlueprintHistory(history);
    if (!next) return;
    setHistory(next);
    setBlueprint(next.present);
  };

  const onAction = (id: string) => {
    if (id === "createButton") applyButton();
    else if (id === "createSection") setSectionMenuOpen(true);
    else if (id === "keepTogether") applyGroup();
    else if (id === "undoButton" || id === "undoSection" || id === "separateGroup") removeSelected();
  };

  const selectedUnits = units;

  const tree = useMemo(
    () =>
      buildSiteCreatorPresentationTree({
        page: snapshot.page,
        blueprint,
        selectionIndex: index,
        snapshot,
      }),
    [blueprint, index, snapshot],
  );

  const expandedIds = useMemo(() => {
    const next: Record<string, boolean> = { unorganized: true };
    for (const id of Object.keys(blueprint.nodes)) next[`node:${id}`] = true;
    return next;
  }, [blueprint.nodes]);

  return (
    <div data-testid="structure-harness">
      <div data-testid="layer-clicks">
        {(["bg", "title", "btn_shape", "btn_text"] as const).map((id) => (
          <button
            key={id}
            type="button"
            data-testid={`click-${id}`}
            onClick={(e) => clickLayer(id, e.ctrlKey || e.metaKey)}
          >
            {id}
          </button>
        ))}
      </div>
      <SiteCreatorHeaderActions
        model={model}
        onAction={onAction as never}
        sectionMenuOpen={sectionMenuOpen}
        onSectionMenuOpenChange={setSectionMenuOpen}
        onChooseSectionType={applySection}
        heroDisabled={Object.values(blueprint.nodes).some(
          (n) => isSiteSectionNode(n) && n.sectionType === "hero",
        )}
        parentChoiceOpen={false}
        parentChoices={[]}
        onChooseParent={() => {}}
        onCancelParentChoice={() => {}}
        multiSelectHint={
          model.statusMessage === "Ctrl/Cmd + clic para añadir elementos" ? model.statusMessage : null
        }
      />
      {error ? <p data-testid="structure-error">{error}</p> : null}
      <SiteCreatorOutlinePanel
        tree={tree}
        selectedUnits={selectedUnits}
        expandedIds={expandedIds}
        onExpandedIdsChange={() => {}}
        onSelectUnit={(unit) => {
          if (!unit) setUnits([]);
          else if (unit.kind === "blueprintNode") setUnits([unit]);
        }}
        onHoverUnit={() => {}}
        visualLayerCount={index.entries.length}
        reviewCount={0}
      />
      <button type="button" data-testid="undo" onClick={undo}>
        Undo
      </button>
      <button type="button" data-testid="redo" onClick={redo}>
        Redo
      </button>
      <pre data-testid="blueprint-json">{JSON.stringify(blueprint)}</pre>
      <pre data-testid="units-json">{JSON.stringify(units)}</pre>
    </div>
  );
}

beforeEach(() => {
  resetSiteBlueprintIdSeqForTests(0);
});

describe("5B integration — header section popover", () => {
  it("Crear sección opens portal menu; Hero writes Blueprint and updates outline", async () => {
    const user = userEvent.setup();
    render(<StructureHarness initialPage={makePage()} />);

    await user.click(screen.getByTestId("click-bg"));
    expect(screen.getByTestId("site-creator-create-section")).toBeInTheDocument();
    expect(screen.queryByTestId("site-creator-section-menu")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("site-creator-create-section"));
    const menu = await screen.findByTestId("site-creator-section-menu");
    expect(within(menu).getByText("Hero")).toBeInTheDocument();
    expect(within(menu).getByText("Sección")).toBeInTheDocument();

    await user.click(screen.getByTestId("site-creator-section-hero"));
    expect(screen.queryByTestId("site-creator-section-menu")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Hero/).length).toBeGreaterThanOrEqual(1);

    const bp = JSON.parse(screen.getByTestId("blueprint-json").textContent!) as SiteBlueprintV1;
    const hero = Object.values(bp.nodes).find((n) => isSiteSectionNode(n) && n.sectionType === "hero");
    expect(hero).toBeTruthy();
    expect(bp.rootChildIds).toContain(hero!.id);
  });
});

describe("5B integration — multi-select modifiers", () => {
  it("Ctrl adds/removes; Shift does not; Meta adds; replace on plain click", async () => {
    const user = userEvent.setup();
    render(<StructureHarness initialPage={makePage()} />);

    await user.click(screen.getByTestId("click-btn_text"));
    let units = JSON.parse(screen.getByTestId("units-json").textContent!) as SiteCreatorSelectionUnit[];
    expect(units).toEqual([{ kind: "layer", layerId: "btn_text" }]);
    expect(screen.getAllByText(/Ctrl\/Cmd/).length).toBeGreaterThanOrEqual(1);

    await user.keyboard("{Control>}");
    await user.click(screen.getByTestId("click-btn_shape"));
    await user.keyboard("{/Control}");
    units = JSON.parse(screen.getByTestId("units-json").textContent!);
    expect(units).toHaveLength(2);
    expect(screen.getByText("2 elementos seleccionados")).toBeInTheDocument();

    await user.keyboard("{Control>}");
    await user.click(screen.getByTestId("click-btn_shape"));
    await user.keyboard("{/Control}");
    units = JSON.parse(screen.getByTestId("units-json").textContent!);
    expect(units).toEqual([{ kind: "layer", layerId: "btn_text" }]);

    await user.click(screen.getByTestId("click-title"));
    units = JSON.parse(screen.getByTestId("units-json").textContent!);
    expect(units).toEqual([{ kind: "layer", layerId: "title" }]);

    // Shift no añade (el harness solo mira ctrl/meta; Shift+click = replace)
    await user.keyboard("{Shift>}");
    await user.click(screen.getByTestId("click-bg"));
    await user.keyboard("{/Shift}");
    units = JSON.parse(screen.getByTestId("units-json").textContent!);
    expect(units).toEqual([{ kind: "layer", layerId: "bg" }]);

    await user.keyboard("{Meta>}");
    await user.click(screen.getByTestId("click-title"));
    await user.keyboard("{/Meta}");
    units = JSON.parse(screen.getByTestId("units-json").textContent!);
    expect(units).toHaveLength(2);
  });

  it("selection reducer additive flag matches Ctrl/Cmd contract", () => {
    const p = makePage();
    const index = buildSiteSelectionIndex(p);
    let state: SiteCreatorSelectionState = EMPTY_SITE_CREATOR_SELECTION;
    state = reduceSiteCreatorSelection(state, { type: "click", layerId: "btn_text", additive: false }, index);
    state = reduceSiteCreatorSelection(state, { type: "click", layerId: "btn_shape", additive: true }, index);
    expect(state.selectedIds).toEqual(["btn_text", "btn_shape"]);
    state = reduceSiteCreatorSelection(state, { type: "click", layerId: "btn_shape", additive: true }, index);
    expect(state.selectedIds).toEqual(["btn_text"]);
    state = reduceSiteCreatorSelection(state, { type: "click", layerId: "title", additive: false }, index);
    expect(state.selectedIds).toEqual(["title"]);
    // shift no existe en la acción; additive false siempre sustituye
    state = reduceSiteCreatorSelection(state, { type: "click", layerId: "bg", additive: false }, index);
    expect(state.selectedIds).toEqual(["bg"]);
  });

  it("overlay draws a rect per selected unit", () => {
    const { container } = render(
      <SiteCreatorSelectionOverlay
        pageWidth={400}
        pageHeight={300}
        index={buildSiteSelectionIndex(makePage())}
        selection={EMPTY_SITE_CREATOR_SELECTION}
        marquee={null}
        hoverName={null}
        unitOutlines={[
          { bounds: { x: 0, y: 0, width: 40, height: 20 }, label: "A" },
          { bounds: { x: 50, y: 0, width: 40, height: 20 }, label: "B" },
        ]}
      />,
    );
    const strokes = container.querySelectorAll('rect[stroke="#A8FF32"]');
    expect(strokes.length).toBeGreaterThanOrEqual(2);
  });
});

describe("5B integration — Crear botón / Agrupar / Hero con Button", () => {
  it("forma+texto → Crear botón → outline Botón “BOTOM”; siguiente resolución selecciona Button", async () => {
    const user = userEvent.setup();
    render(<StructureHarness initialPage={makePage()} />);

    await user.click(screen.getByTestId("click-btn_shape"));
    await user.keyboard("{Control>}");
    await user.click(screen.getByTestId("click-btn_text"));
    await user.keyboard("{/Control}");

    expect(screen.getByTestId("site-creator-action-createButton")).toBeInTheDocument();
    expect(screen.getByTestId("site-creator-create-section")).toBeInTheDocument();
    expect(screen.getByTestId("site-creator-action-keepTogether")).toHaveTextContent("Agrupar");

    await user.click(screen.getByTestId("site-creator-action-createButton"));
    expect(screen.getAllByText("Botón “BOTOM”").length).toBeGreaterThanOrEqual(1);

    const bp = JSON.parse(screen.getByTestId("blueprint-json").textContent!) as SiteBlueprintV1;
    const btn = Object.values(bp.nodes).find(isSiteButtonNode);
    expect(btn).toBeTruthy();
    expect(btn!.layerIds.sort()).toEqual(["btn_shape", "btn_text"].sort());

    // Clic en forma/texto resuelve al Button completo
    await user.click(screen.getByTestId("click-btn_shape"));
    const units = JSON.parse(screen.getByTestId("units-json").textContent!) as SiteCreatorSelectionUnit[];
    expect(units).toEqual([{ kind: "blueprintNode", nodeId: btn!.id }]);
  });

  it("Agrupar crea layoutGroup; Desagrupar restaura", async () => {
    const user = userEvent.setup();
    render(<StructureHarness initialPage={makePage()} />);

    await user.click(screen.getByTestId("click-bg"));
    await user.keyboard("{Control>}");
    await user.click(screen.getByTestId("click-title"));
    await user.keyboard("{/Control}");
    await user.click(screen.getByTestId("site-creator-action-keepTogether"));

    expect(screen.getAllByText(/Grupo · 2 elementos/).length).toBeGreaterThanOrEqual(1);
    await user.click(screen.getByTestId("site-creator-action-separateGroup"));
    expect(screen.getAllByText(/Contenido sin organizar/).length).toBeGreaterThanOrEqual(1);
    const bp = JSON.parse(screen.getByTestId("blueprint-json").textContent!) as SiteBlueprintV1;
    expect(Object.keys(bp.nodes)).toHaveLength(0);
  });

  it("Hero alrededor de Button conserva el Button hijo", async () => {
    const user = userEvent.setup();
    render(<StructureHarness initialPage={makePage()} />);

    await user.click(screen.getByTestId("click-btn_shape"));
    await user.keyboard("{Control>}");
    await user.click(screen.getByTestId("click-btn_text"));
    await user.keyboard("{/Control}");
    await user.click(screen.getByTestId("site-creator-action-createButton"));

    const afterBtn = JSON.parse(screen.getByTestId("blueprint-json").textContent!) as SiteBlueprintV1;
    const btn = Object.values(afterBtn.nodes).find(isSiteButtonNode)!;

    await user.keyboard("{Control>}");
    await user.click(screen.getByTestId("click-title"));
    await user.click(screen.getByTestId("click-bg"));
    await user.keyboard("{/Control}");

    await user.click(screen.getByTestId("site-creator-create-section"));
    await user.click(await screen.findByTestId("site-creator-section-hero"));

    const bp = JSON.parse(screen.getByTestId("blueprint-json").textContent!) as SiteBlueprintV1;
    const hero = Object.values(bp.nodes).find((n) => isSiteSectionNode(n) && n.sectionType === "hero")!;
    expect(hero.childIds).toContain(btn.id);
    expect(isSiteButtonNode(bp.nodes[btn.id]!)).toBe(true);
    expect(screen.getAllByText(/Hero/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Botón “BOTOM”").length).toBeGreaterThanOrEqual(1);
  });
});

describe("5B integration — persistencia y undo", () => {
  it("round-trip node.data conserva Blueprint", async () => {
    const user = userEvent.setup();
    render(<StructureHarness initialPage={makePage()} />);
    await user.click(screen.getByTestId("click-btn_shape"));
    await user.keyboard("{Control>}");
    await user.click(screen.getByTestId("click-btn_text"));
    await user.keyboard("{/Control}");
    await user.click(screen.getByTestId("site-creator-action-createButton"));

    const bp = JSON.parse(screen.getByTestId("blueprint-json").textContent!) as SiteBlueprintV1;
    const data = createDefaultSiteCreatorNodeData();
    data.blueprint = bp;
    const serialized = JSON.parse(JSON.stringify(data));
    const parsed = parseSiteCreatorNodeData(serialized);
    expect(parsed.blueprint).toEqual(bp);
  });

  it("undo/redo Button luego Hero", async () => {
    const user = userEvent.setup();
    render(<StructureHarness initialPage={makePage()} />);

    await user.click(screen.getByTestId("click-btn_shape"));
    await user.keyboard("{Control>}");
    await user.click(screen.getByTestId("click-btn_text"));
    await user.keyboard("{/Control}");
    await user.click(screen.getByTestId("site-creator-action-createButton"));

    await user.keyboard("{Control>}");
    await user.click(screen.getByTestId("click-bg"));
    await user.click(screen.getByTestId("click-title"));
    await user.keyboard("{/Control}");
    await user.click(screen.getByTestId("site-creator-create-section"));
    await user.click(await screen.findByTestId("site-creator-section-hero"));

    expect(screen.getAllByText(/Hero/).length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByTestId("undo"));
    const afterUndoHero = JSON.parse(screen.getByTestId("blueprint-json").textContent!) as SiteBlueprintV1;
    expect(Object.values(afterUndoHero.nodes).some((n) => isSiteSectionNode(n))).toBe(false);
    expect(Object.values(afterUndoHero.nodes).some(isSiteButtonNode)).toBe(true);

    await user.click(screen.getByTestId("undo"));
    const afterUndoBtn = JSON.parse(screen.getByTestId("blueprint-json").textContent!) as SiteBlueprintV1;
    expect(Object.keys(afterUndoBtn.nodes)).toHaveLength(0);
    expect(screen.getAllByText(/Contenido sin organizar/).length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByTestId("redo"));
    const afterRedoBtn = JSON.parse(screen.getByTestId("blueprint-json").textContent!) as SiteBlueprintV1;
    expect(Object.values(afterRedoBtn.nodes).some(isSiteButtonNode)).toBe(true);
    await user.click(screen.getByTestId("redo"));
    const afterRedoHero = JSON.parse(screen.getByTestId("blueprint-json").textContent!) as SiteBlueprintV1;
    expect(Object.values(afterRedoHero.nodes).some((n) => isSiteSectionNode(n))).toBe(true);
  });

  it("collapseLayersToSelectionUnits no mezcla Button con sus capas", () => {
    const p = makePage();
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
    expect(units).toHaveLength(2);
    expect(units.some((u) => u.kind === "blueprintNode")).toBe(true);
    expect(units.some((u) => u.kind === "layer" && u.layerId === "title")).toBe(true);
  });
});
