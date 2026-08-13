/**
 * Fase 5D — navegación continua, radiografía, árbol de presentación, microbarra.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { buildDesignerSourceSnapshot } from "./designer-source-snapshot";
import { resetSiteBlueprintIdSeqForTests } from "./site-blueprint-ids";
import {
  createButtonFromSelection,
  createSectionFromSelection,
  reparentUnitsToContainer,
} from "./site-blueprint-ops";
import {
  createEmptySiteBlueprintV1,
  isSiteButtonNode,
  isSiteSectionNode,
  type SiteBlueprintV1,
} from "./site-creator-types";
import { resolveContextualModel } from "./site-creator-contextual-actions";
import { SiteCreatorSelectionOverlay } from "./SiteCreatorSelectionOverlay";
import { SiteCreatorObjectMicrobar } from "./SiteCreatorObjectMicrobar";
import { SiteCreatorOutlinePanel } from "./SiteCreatorOutlinePanel";
import {
  buildSiteCreatorPresentationTree,
  presentationBoundsForUnit,
  presentationDirectChildren,
} from "./site-creator-presentation-tree";
import { deriveLayerDisplayLabel } from "./site-creator-display-labels";
import { EMPTY_SITE_CREATOR_SELECTION } from "./site-creator-selection-types";
import { canPersistSiteStructure } from "./site-blueprint-history";
import { buildBreadcrumbSegments } from "./site-creator-hierarchy";

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
    layer({ id: "title", type: "text", x: 20, y: 20, width: 200, height: 40, text: "HOLAAAAa" }),
    layer({ id: "btn_shape", type: "rect", x: 40, y: 140, width: 100, height: 36 }),
    layer({
      id: "btn_text",
      type: "text",
      x: 50,
      y: 146,
      width: 80,
      height: 24,
      text: "BOTOM",
    }),
    layer({ id: "orphan", type: "rect", x: 300, y: 20, width: 40, height: 40 }),
  ]);
}

function structureFingerprint(bp: SiteBlueprintV1): unknown {
  const walk = (id: string): unknown => {
    const n = bp.nodes[id]!;
    return {
      kind: n.kind,
      sectionType: isSiteSectionNode(n) ? n.sectionType : undefined,
      isButton: isSiteButtonNode(n),
      layers: [...n.layerIds].sort(),
      children: n.childIds.map(walk),
    };
  };
  return bp.rootChildIds.map(walk);
}

beforeEach(() => {
  resetSiteBlueprintIdSeqForTests();
});

const gateOk = canPersistSiteStructure({ originState: "synced", hasSnapshot: true });

describe("5D presentation tree", () => {
  it("hides clipping wrappers and never shows Clip / Grupo recortado", () => {
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
    const snap = buildDesignerSourceSnapshot("d1", p);
    const tree = buildSiteCreatorPresentationTree({
      page: p,
      blueprint: createEmptySiteBlueprintV1(),
      selectionIndex: index,
      snapshot: snap,
    });
    const labels: string[] = [];
    const walk = (nodes: typeof tree.roots) => {
      for (const n of nodes) {
        labels.push(n.label);
        walk(n.children);
      }
    };
    walk(tree.roots);
    expect(labels.join(" | ")).not.toMatch(/Clip 1|Grupo recortado/i);
    expect(deriveLayerDisplayLabel("clip", index)).not.toBe("Grupo recortado");
  });

  it("Hero tree shows direct presentation children; Button nests Forma + Texto", () => {
    const p = makePage();
    const index = buildSiteSelectionIndex(p);
    const snap = buildDesignerSourceSnapshot("d1", p);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "title", "btn_shape", "btn_text"],
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
      accessibleLabel: "BOTOM",
      labelLayerId: "btn_text",
      preferredParentId: hero.createdNodeId!,
    });
    expect(btn.ok).toBe(true);
    if (!btn.ok) return;

    const tree = buildSiteCreatorPresentationTree({
      page: p,
      blueprint: btn.blueprint,
      selectionIndex: index,
      snapshot: snap,
    });
    const heroNode = tree.roots.find((r) => r.kind === "semantic" && r.nodeId === hero.createdNodeId);
    expect(heroNode).toBeTruthy();
    const kids = presentationDirectChildren(
      { kind: "blueprintNode", nodeId: hero.createdNodeId! },
      tree,
    );
    expect(kids.some((c) => c.kind === "semantic" && c.nodeId === btn.createdNodeId)).toBe(true);
    expect(kids.some((c) => c.kind === "layer" && c.layerId === "title")).toBe(true);

    const btnKids = presentationDirectChildren(
      { kind: "blueprintNode", nodeId: btn.createdNodeId! },
      tree,
    );
    expect(btnKids.map((c) => c.label).join(",")).toMatch(/Forma/);
    expect(btnKids.map((c) => c.label).join(",")).toMatch(/Texto|BOTOM/);
  });

  it("semantic bounds ignore clipping AABB page-edge inflation", () => {
    const p = page([
      layer({ id: "a", type: "rect", x: 10, y: 10, width: 50, height: 50, name: "Rect 1" }),
      layer({
        id: "clip",
        type: "clippingContainer",
        name: "Clip 1",
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        mask: layer({ id: "mask", type: "rect", x: 0, y: 0, width: 1920, height: 1080 }),
        content: [layer({ id: "b", type: "rect", x: 20, y: 20, width: 30, height: 30, name: "Rect 2" })],
      } as Partial<FreehandObject> & { id: string; type: "clippingContainer" }),
    ]);
    const index = buildSiteSelectionIndex(p);
    const snap = buildDesignerSourceSnapshot("d1", p);
    const tree = buildSiteCreatorPresentationTree({
      page: p,
      blueprint: createEmptySiteBlueprintV1(),
      selectionIndex: index,
      snapshot: snap,
    });
    const unorg = tree.roots.find((r) => r.kind === "unorganized");
    expect(unorg).toBeTruthy();
    const labels = (unorg?.children ?? []).map((c) => c.label).join("|");
    expect(labels).not.toMatch(/Clip 1|Grupo recortado/i);
    // Bounds presentados no usan el AABB 1920×1080 del clip
    for (const child of unorg?.children ?? []) {
      if (!child.unit) continue;
      const b = presentationBoundsForUnit(child.unit, tree, index);
      expect(b).toBeTruthy();
      if (!b) continue;
      expect(b.width).toBeLessThan(200);
      expect(b.height).toBeLessThan(200);
    }
  });
});

describe("5D radiography overlay", () => {
  it("ghost children render at low opacity; emphasized child higher", () => {
    const { container } = render(
      <SiteCreatorSelectionOverlay
        pageWidth={400}
        pageHeight={240}
        index={buildSiteSelectionIndex(makePage())}
        selection={EMPTY_SITE_CREATOR_SELECTION}
        marquee={null}
        hoverName={null}
        hoverOutline={{
          bounds: { x: 0, y: 0, width: 400, height: 240 },
          kind: "section",
        }}
        ghostOutlines={[
          { bounds: { x: 20, y: 20, width: 200, height: 40 }, emphasized: false },
          {
            bounds: { x: 40, y: 140, width: 100, height: 36 },
            emphasized: true,
            isContainer: true,
          },
        ]}
      />,
    );
    const ghosts = container.querySelectorAll("[data-site-creator-ghost]");
    expect(ghosts.length).toBe(2);
    expect(ghosts[0]!.getAttribute("data-emphasized")).toBe("false");
    expect(ghosts[1]!.getAttribute("data-emphasized")).toBe("true");
    const rects = container.querySelectorAll("[data-site-creator-ghost] rect");
    expect(rects[0]!.getAttribute("stroke-opacity")).toBe("0.22");
    expect(rects[1]!.getAttribute("stroke-opacity")).toBe("0.82");
  });

  it("no scope veil element exists", () => {
    const { container } = render(
      <SiteCreatorSelectionOverlay
        pageWidth={100}
        pageHeight={100}
        index={buildSiteSelectionIndex(makePage())}
        selection={EMPTY_SITE_CREATOR_SELECTION}
        marquee={null}
        hoverName={null}
      />,
    );
    expect(container.querySelector("[data-site-creator-scope-veil]")).toBeNull();
  });
});

describe("5D microbar + actions", () => {
  it("microbar lives in HTML (not SVG) and shows path + actions", () => {
    const { container } = render(
      <div style={{ position: "relative", width: 400, height: 300 }}>
        <SiteCreatorObjectMicrobar
          scale={1}
          stageWidth={400}
          stageHeight={300}
          model={{
            bounds: { x: 40, y: 140, width: 100, height: 36 },
            segments: [
              { unit: { kind: "blueprintNode", nodeId: "h1" }, label: "Hero", current: false },
              {
                unit: { kind: "blueprintNode", nodeId: "b1" },
                label: "Botón “BOTOM”",
                current: true,
              },
            ],
            actions: [{ id: "undoButton", label: "Deshacer botón" }],
          }}
        />
      </div>,
    );
    expect(container.querySelector("[data-site-creator-microbar]")).toBeTruthy();
    expect(container.querySelector("svg [data-site-creator-microbar]")).toBeNull();
    expect(screen.getByTestId("site-creator-micro-undoButton")).toBeTruthy();
    expect(screen.queryByText("Editar contenido")).toBeNull();
    expect(screen.queryByText("Dentro de Hero")).toBeNull();
  });

  it("Hero selected has Deshacer Hero, never Editar contenido", () => {
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
    expect(model.primaryActions.some((a) => a.id === "editContent")).toBe(false);
    expect(model.primaryActions.some((a) => a.id === "exitInspect")).toBe(false);
    expect(model.primaryActions[0]?.label).toBe("Deshacer Hero");
  });

  it("breadcrumb has three levels for text inside Button inside Hero", () => {
    const p = makePage();
    const index = buildSiteSelectionIndex(p);
    const snap = buildDesignerSourceSnapshot("d1", p);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "title", "btn_shape", "btn_text"],
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
      accessibleLabel: "BOTOM",
      labelLayerId: "btn_text",
      preferredParentId: hero.createdNodeId!,
    });
    expect(btn.ok).toBe(true);
    if (!btn.ok) return;
    const segs = buildBreadcrumbSegments(
      { kind: "layer", layerId: "btn_text" },
      btn.blueprint,
      index,
      snap,
    );
    expect(segs.length).toBeGreaterThanOrEqual(3);
    const path = segs.map((s) => s.label).join(" › ");
    expect(path).toMatch(/Hero/);
    expect(path).toMatch(/Botón/);
  });
});

describe("5D outline tree", () => {
  it("renders expanded Hero › Button hierarchy and unorganized", () => {
    const p = makePage();
    const index = buildSiteSelectionIndex(p);
    const snap = buildDesignerSourceSnapshot("d1", p);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "title", "btn_shape", "btn_text"],
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
      accessibleLabel: "BOTOM",
      labelLayerId: "btn_text",
      preferredParentId: hero.createdNodeId!,
    });
    expect(btn.ok).toBe(true);
    if (!btn.ok) return;
    const tree = buildSiteCreatorPresentationTree({
      page: p,
      blueprint: btn.blueprint,
      selectionIndex: index,
      snapshot: snap,
    });
    const expanded: Record<string, boolean> = {
      [`node:${hero.createdNodeId}`]: true,
      [`node:${btn.createdNodeId}`]: true,
      unorganized: true,
    };
    render(
      <SiteCreatorOutlinePanel
        tree={tree}
        selectedUnits={[]}
        expandedIds={expanded}
        onExpandedIdsChange={() => {}}
        onSelectUnit={() => {}}
        onHoverUnit={() => {}}
        visualLayerCount={1}
        reviewCount={0}
      />,
    );
    expect(screen.getByText("Página")).toBeTruthy();
    expect(screen.getByText(/Hero/)).toBeTruthy();
    expect(screen.getByText(/Botón/)).toBeTruthy();
    expect(screen.getByText(/Contenido sin organizar/)).toBeTruthy();
    expect(screen.queryByText(/Grupo recortado/)).toBeNull();
    expect(screen.queryByText(/Clip 1/)).toBeNull();
  });
});

describe("5D reparent + creation order", () => {
  it("reparent orphan into Hero without changing geometry refs", () => {
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
    const before = structuredClone(snap.page.objects);
    const result = reparentUnitsToContainer({
      blueprint: hero.blueprint,
      units: [{ kind: "layer", layerId: "orphan" }],
      targetContainerId: hero.createdNodeId!,
      index,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blueprint.nodes[hero.createdNodeId!]!.layerIds).toContain("orphan");
    expect(JSON.stringify(snap.page.objects)).toBe(JSON.stringify(before));
  });

  it("Hero→Button and Button→Hero produce equivalent structure", () => {
    const p = makePage();
    const index = buildSiteSelectionIndex(p);
    const snap = buildDesignerSourceSnapshot("d1", p);

    const heroFirst = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "title", "btn_shape", "btn_text"],
      index,
      committedPage: snap.page,
      sectionType: "hero",
    });
    expect(heroFirst.ok).toBe(true);
    if (!heroFirst.ok) return;
    const btnInHero = createButtonFromSelection({
      blueprint: heroFirst.blueprint,
      selectedLayerIds: ["btn_shape", "btn_text"],
      index,
      accessibleLabel: "BOTOM",
      labelLayerId: "btn_text",
      preferredParentId: heroFirst.createdNodeId!,
    });
    expect(btnInHero.ok).toBe(true);
    if (!btnInHero.ok) return;

    const btnFirst = createButtonFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["btn_shape", "btn_text"],
      index,
      accessibleLabel: "BOTOM",
      labelLayerId: "btn_text",
    });
    expect(btnFirst.ok).toBe(true);
    if (!btnFirst.ok) return;
    const heroOnly = createSectionFromSelection({
      blueprint: btnFirst.blueprint,
      selectedLayerIds: ["bg", "title"],
      index,
      committedPage: snap.page,
      sectionType: "hero",
    });
    expect(heroOnly.ok).toBe(true);
    if (!heroOnly.ok) return;
    const moved = reparentUnitsToContainer({
      blueprint: heroOnly.blueprint,
      units: [{ kind: "blueprintNode", nodeId: btnFirst.createdNodeId! }],
      targetContainerId: heroOnly.createdNodeId!,
      index,
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;

    expect(structureFingerprint(btnInHero.blueprint)).toEqual(structureFingerprint(moved.blueprint));
  });
});
