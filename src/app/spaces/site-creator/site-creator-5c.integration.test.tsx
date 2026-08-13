/**
 * Fase 5C — jerarquía visual, reparent y Button dentro de Hero.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { useMemo, useState } from "react";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { buildDesignerSourceSnapshot } from "./designer-source-snapshot";
import { resetSiteBlueprintIdSeqForTests } from "./site-blueprint-ids";
import {
  createButtonFromSelection,
  createSectionFromSelection,
  reparentUnitsToContainer,
  removeUnitsFromContainer,
} from "./site-blueprint-ops";
import {
  createBlueprintHistory,
  pushBlueprintHistory,
  redoBlueprintHistory,
  undoBlueprintHistory,
} from "./site-blueprint-history";
import {
  createEmptySiteBlueprintV1,
  isSiteButtonNode,
  isSiteSectionNode,
  type SiteBlueprintV1,
} from "./site-creator-types";
import {
  buildBreadcrumbSegments,
  containerDisplayLabel,
  containersFullyContainingUnit,
  inferSingleContainerForFreeLayers,
} from "./site-creator-hierarchy";
import { resolveContextualModel } from "./site-creator-contextual-actions";
import { SiteCreatorSelectionOverlay } from "./SiteCreatorSelectionOverlay";
import { SiteCreatorSelectionChips } from "./SiteCreatorSelectionChips";
import { deriveLayerDisplayLabel } from "./site-creator-display-labels";
import { EMPTY_SITE_CREATOR_SELECTION } from "./site-creator-selection-types";
import { SC_VISUAL } from "./site-creator-visual-tokens";
import { canPersistSiteStructure } from "./site-blueprint-history";

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
    layer({ id: "bg", type: "rect", x: 0, y: 0, width: 400, height: 240 }),
    layer({ id: "title", type: "text", x: 20, y: 20, width: 200, height: 40, text: "Titular" }),
    layer({ id: "btn_shape", type: "rect", x: 40, y: 140, width: 100, height: 36 }),
    layer({
      id: "btn_text",
      type: "text",
      x: 50,
      y: 146,
      width: 80,
      height: 24,
      text: "BOTOM",
      name: "Clip 1",
    }),
  ]);
}

beforeEach(() => {
  resetSiteBlueprintIdSeqForTests(0);
});

describe("5C visual grammar", () => {
  it("hover uses cold stroke; selection uses lime; no dashed multi hull", () => {
    const { container } = render(
      <SiteCreatorSelectionOverlay
        pageWidth={400}
        pageHeight={300}
        index={buildSiteSelectionIndex(makePage())}
        selection={EMPTY_SITE_CREATOR_SELECTION}
        marquee={null}
        hoverName={null}
        hoverOutline={{ bounds: { x: 10, y: 10, width: 40, height: 20 }, kind: "layer" }}
        unitOutlines={[
          { bounds: { x: 0, y: 0, width: 40, height: 20 }, kind: "layer" },
          { bounds: { x: 50, y: 0, width: 40, height: 20 }, kind: "layer" },
        ]}
      />,
    );
    expect(container.querySelector('[data-site-creator-hover] rect')?.getAttribute("stroke")).toBe(
      SC_VISUAL.hover,
    );
    expect(container.querySelectorAll('[data-site-creator-selection] rect').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('rect[stroke-dasharray]').length).toBe(0);
    expect(container.querySelector("[data-site-creator-corners]")).toBeTruthy();
  });

  it("chips live outside SVG and show human path", () => {
    const p = makePage();
    const index = buildSiteSelectionIndex(p);
    const { container } = render(
      <div style={{ position: "relative", width: 400, height: 300 }}>
        <SiteCreatorSelectionChips
          scale={1}
          stageWidth={400}
          stageHeight={300}
          chip={{
            bounds: { x: 40, y: 140, width: 100, height: 36 },
            segments: [
              { unit: { kind: "blueprintNode", nodeId: "h" }, label: "Hero", current: false },
              {
                unit: { kind: "layer", layerId: "btn_text" },
                label: deriveLayerDisplayLabel("btn_text", index),
                current: true,
              },
            ],
            kind: "layer",
          }}
        />
      </div>,
    );
    expect(container.querySelector("[data-site-creator-chip]")).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByText("Hero")).toBeInTheDocument();
    expect(screen.getByText(/Texto/)).toBeInTheDocument();
    expect(screen.queryByText("Clip 1")).not.toBeInTheDocument();
  });

  it("clipping / technical names map to human labels", () => {
    const p = page([
      layer({
        id: "clip",
        type: "clippingContainer",
        name: "Clip 1",
        x: 0,
        y: 0,
        width: 80,
        height: 80,
        mask: layer({ id: "mask", type: "rect", x: 0, y: 0, width: 80, height: 80 }),
        content: [layer({ id: "inside", type: "rect", x: 4, y: 4, width: 40, height: 40 })],
      } as Partial<FreehandObject> & { id: string; type: "clippingContainer" }),
    ]);
    const index = buildSiteSelectionIndex(p);
    expect(deriveLayerDisplayLabel("clip", index)).toBe("Elemento");
  });

  it("strokes declare non-scaling-stroke", () => {
    const { container } = render(
      <SiteCreatorSelectionOverlay
        pageWidth={100}
        pageHeight={100}
        index={buildSiteSelectionIndex(makePage())}
        selection={EMPTY_SITE_CREATOR_SELECTION}
        marquee={{ x: 1, y: 1, width: 20, height: 20 }}
        hoverName={null}
        unitOutlines={[{ bounds: { x: 5, y: 5, width: 10, height: 10 }, kind: "component" }]}
      />,
    );
    const stroked = container.querySelectorAll("rect[stroke], path[stroke]");
    expect(stroked.length).toBeGreaterThan(0);
    stroked.forEach((el) => {
      expect(el.getAttribute("vector-effect")).toBe("non-scaling-stroke");
    });
  });
});

describe("5C add / remove / button after hero", () => {
  const gateOk = canPersistSiteStructure({ originState: "synced", hasSnapshot: true });

  it("Hero + free layer shows Añadir a Hero and reparent keeps designer intact", () => {
    const p = makePage();
    const index = buildSiteSelectionIndex(p);
    const snap = buildDesignerSourceSnapshot("d1", p);
    const pageBefore = JSON.stringify(snap.page);
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
      units: [
        { kind: "blueprintNode", nodeId: hero.createdNodeId! },
        { kind: "layer", layerId: "btn_text" },
      ],
      inspectNodeId: null,
      blueprint: hero.blueprint,
      index,
      snapshot: snap,
      persistGate: gateOk,
    });
    expect(model.primaryActions.some((a) => a.id === "addToContainer")).toBe(true);
    expect(model.primaryActions.find((a) => a.id === "addToContainer")?.label).toMatch(/Añadir/);

    const added = reparentUnitsToContainer({
      blueprint: hero.blueprint,
      units: [{ kind: "layer", layerId: "btn_text" }],
      targetContainerId: hero.createdNodeId!,
      index,
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const section = added.blueprint.nodes[hero.createdNodeId!]!;
    expect(section.layerIds).toContain("btn_text");
    expect(JSON.stringify(snap.page)).toBe(pageBefore);
  });

  it("infer single containing Hero for free layers", () => {
    const p = makePage();
    const index = buildSiteSelectionIndex(p);
    const snap = buildDesignerSourceSnapshot("d1", p);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg"],
      index,
      committedPage: snap.page,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok) return;
    // btn_shape visually inside bg/hero bounds
    const inferred = inferSingleContainerForFreeLayers(["btn_shape", "btn_text"], hero.blueprint, index);
    expect(inferred).toBe(hero.createdNodeId);
  });

  it("ambiguous containment does not auto-pick", () => {
    const p = page([
      layer({ id: "a", type: "rect", x: 0, y: 0, width: 200, height: 200 }),
      layer({ id: "b", type: "rect", x: 0, y: 0, width: 200, height: 200 }),
      layer({ id: "inner", type: "rect", x: 40, y: 40, width: 20, height: 20 }),
    ]);
    const index = buildSiteSelectionIndex(p);
    const snap = buildDesignerSourceSnapshot("d1", p);
    const s1 = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["a"],
      index,
      committedPage: snap.page,
      sectionType: "generic",
      label: "A",
    });
    expect(s1.ok).toBe(true);
    if (!s1.ok) return;
    const s2 = createSectionFromSelection({
      blueprint: s1.blueprint,
      selectedLayerIds: ["b"],
      index,
      committedPage: snap.page,
      sectionType: "generic",
      label: "B",
    });
    expect(s2.ok).toBe(true);
    if (!s2.ok) return;
    const hits = containersFullyContainingUnit(
      { kind: "layer", layerId: "inner" },
      s2.blueprint,
      index,
    );
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  it("Hero first then Button inside via inspect layers", () => {
    const p = makePage();
    const index = buildSiteSelectionIndex(p);
    const snap = buildDesignerSourceSnapshot("d1", p);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "btn_shape", "btn_text"],
      index,
      committedPage: snap.page,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok) return;
    const btn = createButtonFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["btn_shape", "btn_text"],
      index,
      preferredParentId: hero.createdNodeId!,
      accessibleLabel: "BOTOM",
      labelLayerId: "btn_text",
    });
    expect(btn.ok).toBe(true);
    if (!btn.ok) return;
    const button = btn.blueprint.nodes[btn.createdNodeId!]!;
    expect(isSiteButtonNode(button)).toBe(true);
    expect(button.parentId).toBe(hero.createdNodeId);
    expect(btn.blueprint.nodes[hero.createdNodeId!]!.childIds).toContain(btn.createdNodeId);
  });

  it("Sacar de Hero restores root ownership; undo via history", () => {
    const p = makePage();
    const index = buildSiteSelectionIndex(p);
    const snap = buildDesignerSourceSnapshot("d1", p);
    let history = createBlueprintHistory(createEmptySiteBlueprintV1());
    const hero = createSectionFromSelection({
      blueprint: history.present,
      selectedLayerIds: ["bg", "title"],
      index,
      committedPage: snap.page,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok) return;
    history = pushBlueprintHistory(history, hero.blueprint);
    const btn = createButtonFromSelection({
      blueprint: history.present,
      selectedLayerIds: ["btn_shape", "btn_text"],
      index,
      accessibleLabel: "BOTOM",
      labelLayerId: "btn_text",
    });
    expect(btn.ok).toBe(true);
    if (!btn.ok) return;
    history = pushBlueprintHistory(history, btn.blueprint);
    const wrapped = reparentUnitsToContainer({
      blueprint: history.present,
      units: [{ kind: "blueprintNode", nodeId: btn.createdNodeId! }],
      targetContainerId: hero.createdNodeId!,
      index,
    });
    expect(wrapped.ok).toBe(true);
    if (!wrapped.ok) return;
    history = pushBlueprintHistory(history, wrapped.blueprint);

    const removed = removeUnitsFromContainer({
      blueprint: history.present,
      units: [{ kind: "blueprintNode", nodeId: btn.createdNodeId! }],
      containerId: hero.createdNodeId!,
      index,
    });
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    history = pushBlueprintHistory(history, removed.blueprint);
    expect(history.present.nodes[btn.createdNodeId!]!.parentId).toBeNull();

    const undone = undoBlueprintHistory(history);
    expect(undone).toBeTruthy();
    expect(undone!.present.nodes[btn.createdNodeId!]!.parentId).toBe(hero.createdNodeId);
    const redone = redoBlueprintHistory(undone!);
    expect(redone!.present.nodes[btn.createdNodeId!]!.parentId).toBeNull();
  });

  it("breadcrumb path uses human names", () => {
    const p = makePage();
    const index = buildSiteSelectionIndex(p);
    const snap = buildDesignerSourceSnapshot("d1", p);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "btn_shape", "btn_text"],
      index,
      committedPage: snap.page,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok) return;
    const btn = createButtonFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["btn_shape", "btn_text"],
      index,
      preferredParentId: hero.createdNodeId!,
      accessibleLabel: "BOTOM",
      labelLayerId: "btn_text",
    });
    expect(btn.ok).toBe(true);
    if (!btn.ok) return;
    const segments = buildBreadcrumbSegments(
      { kind: "blueprintNode", nodeId: btn.createdNodeId! },
      btn.blueprint,
      index,
      snap,
    );
    const joined = segments.map((s) => s.label).join(" / ");
    expect(joined).toMatch(/Hero/);
    expect(joined).toMatch(/Botón/);
    expect(joined).not.toMatch(/Clip|rect|layoutGroup|Root/i);
    expect(containerDisplayLabel(btn.blueprint.nodes[hero.createdNodeId!]!, snap, index)).toMatch(
      /Hero ·/,
    );
  });

  it("container selected exposes Deshacer Hero (sin Editar contenido)", () => {
    const p = makePage();
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
    expect(model.primaryActions.map((a) => a.id)).toEqual(["undoSection"]);
    expect(model.primaryActions[0]?.label).toBe("Deshacer Hero");
    expect(model.primaryActions.some((a) => a.id === "editContent")).toBe(false);
  });
});
