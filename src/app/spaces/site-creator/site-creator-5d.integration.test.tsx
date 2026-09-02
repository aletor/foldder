/**
 * Fase 5D — navegación continua, radiografía, árbol de presentación, microbarra.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
import {
  SiteCreatorObjectMicrobar,
  visibleMicrobarActions,
  visibleMicrobarSegments,
} from "./SiteCreatorObjectMicrobar";
import { SiteCreatorOutlinePanel } from "./SiteCreatorOutlinePanel";
import {
  buildSiteCreatorPresentationTree,
  presentationBoundsForUnit,
  presentationDirectChildren,
} from "./site-creator-presentation-tree";
import { deriveLayerDisplayLabel } from "./site-creator-display-labels";
import { EMPTY_SITE_CREATOR_SELECTION } from "./site-creator-selection-types";
import { SC_VISUAL } from "./site-creator-visual-tokens";
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
  it("shows a clipping mask as one selectable row and hides its interior", () => {
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
        content: [layer({ id: "inside", type: "image", x: 4, y: 4, width: 40, height: 40, name: "Foto portada" })],
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
    const layerIds: string[] = [];
    const walk = (nodes: typeof tree.roots) => {
      for (const n of nodes) {
        labels.push(n.label);
        if (n.kind === "layer") layerIds.push(n.layerId);
        walk(n.children);
      }
    };
    walk(tree.roots);
    expect(labels.join(" | ")).toMatch(/Máscara · Foto portada/);
    expect(labels.join(" | ")).not.toMatch(/Clip 1|Grupo recortado/i);
    expect(layerIds).toContain("clip");
    expect(layerIds).not.toContain("inside");
    expect(layerIds).not.toContain("mask");
    expect(deriveLayerDisplayLabel("clip", index)).toBe("Máscara · Foto portada");
    const clipNode = tree.roots
      .flatMap((n) => (n.kind === "unorganized" ? n.children : [n]))
      .find((n) => n.kind === "layer" && n.layerId === "clip");
    expect(clipNode?.children).toEqual([]);
    expect(clipNode?.unit).toEqual({ kind: "layer", layerId: "clip" });
  });

  it("shows a Designer image frame as a mask row, not a plain image", () => {
    const filled = layer({
      id: "frame",
      type: "rect",
      name: "Image Frame 8",
      x: 0,
      y: 0,
      width: 120,
      height: 80,
      isImageFrame: true,
      imageFrameContent: {
        src: "https://cdn.example/photo.jpg",
        originalWidth: 1200,
        originalHeight: 800,
        scaleX: 1,
        scaleY: 1,
        offsetX: 0,
        offsetY: 0,
        fittingMode: "fill-proportional",
      },
    });
    const empty = layer({
      id: "empty-frame",
      type: "rect",
      name: "Image Frame 9",
      x: 140,
      y: 0,
      width: 80,
      height: 80,
      isImageFrame: true,
      imageFrameContent: null,
    });
    const p = page([filled, empty]);
    const index = buildSiteSelectionIndex(p);
    const snap = buildDesignerSourceSnapshot("d1", p);
    const tree = buildSiteCreatorPresentationTree({
      page: p,
      blueprint: createEmptySiteBlueprintV1(),
      selectionIndex: index,
      snapshot: snap,
    });
    const labels: string[] = [];
    const layerIds: string[] = [];
    const walk = (nodes: typeof tree.roots) => {
      for (const n of nodes) {
        labels.push(n.label);
        if (n.kind === "layer") layerIds.push(n.layerId);
        walk(n.children);
      }
    };
    walk(tree.roots);
    expect(labels.join(" | ")).toMatch(/Máscara · Imagen/);
    expect(labels.join(" | ")).toMatch(/Máscara(?! ·)/);
    expect(labels.join(" | ")).not.toMatch(/Image Frame/i);
    expect(layerIds).toContain("frame");
    expect(layerIds).toContain("empty-frame");
    expect(deriveLayerDisplayLabel("frame", index)).toBe("Máscara · Imagen");
    expect(deriveLayerDisplayLabel("empty-frame", index)).toBe("Máscara");
    expect(index.byId.frame?.selectableFromCanvas).toBe(true);
    expect(index.byId["empty-frame"]?.selectableFromCanvas).toBe(true);
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
    expect(btnKids.map((c) => c.label).join(",")).toMatch(/Forma|Rectángulo/);
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
    const childIds = (unorg?.children ?? [])
      .filter((c): c is Extract<typeof c, { kind: "layer" }> => c.kind === "layer")
      .map((c) => c.layerId);
    expect(childIds).toContain("a");
    expect(childIds).toContain("clip");
    expect(childIds).not.toContain("b");
    expect(childIds).not.toContain("mask");
    const labels = (unorg?.children ?? []).map((c) => c.label).join("|");
    expect(labels).toMatch(/Máscara/);
    expect(labels).not.toMatch(/Clip 1|Grupo recortado/i);
    const loose = unorg?.children.find((c) => c.kind === "layer" && c.layerId === "a");
    expect(loose?.unit).toBeTruthy();
    if (loose?.unit) {
      const b = presentationBoundsForUnit(loose.unit, tree, index);
      expect(b).toBeTruthy();
      expect(b!.width).toBeLessThan(200);
      expect(b!.height).toBeLessThan(200);
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

  it("no scope veil element exists when nothing is selected", () => {
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

  it("grouping selection darkens the page and uses a thicker box", () => {
    const { container } = render(
      <SiteCreatorSelectionOverlay
        pageWidth={400}
        pageHeight={240}
        index={buildSiteSelectionIndex(makePage())}
        selection={EMPTY_SITE_CREATOR_SELECTION}
        marquee={null}
        hoverName={null}
        unitOutlines={[
          { bounds: { x: 20, y: 20, width: 200, height: 80 }, kind: "section" },
        ]}
      />,
    );
    const veil = container.querySelector("[data-site-creator-scope-veil]");
    expect(veil).toBeTruthy();
    expect(veil!.getAttribute("fill")).toBe(SC_VISUAL.veil);
    expect(veil!.getAttribute("fill-rule")).toBe("evenodd");
    const groupBox = container.querySelector('[data-site-creator-selection][data-scope="group"] rect');
    expect(groupBox).toBeTruthy();
    expect(groupBox!.getAttribute("stroke-width")).toBe(String(SC_VISUAL.groupSelectionStroke));
  });

  it("leaf object selection has no veil and the regular stroke", () => {
    const { container } = render(
      <SiteCreatorSelectionOverlay
        pageWidth={400}
        pageHeight={240}
        index={buildSiteSelectionIndex(makePage())}
        selection={EMPTY_SITE_CREATOR_SELECTION}
        marquee={null}
        hoverName={null}
        unitOutlines={[{ bounds: { x: 20, y: 20, width: 80, height: 24 }, kind: "layer" }]}
      />,
    );
    expect(container.querySelector("[data-site-creator-scope-veil]")).toBeNull();
    const leafBox = container.querySelector('[data-site-creator-selection][data-scope="object"] rect');
    expect(leafBox).toBeTruthy();
    expect(leafBox!.getAttribute("stroke-width")).toBe(String(SC_VISUAL.selectionStroke));
  });
});

describe("5D microbar + actions", () => {
  it("microbar lives in HTML (not SVG) and shows actions without a path", () => {
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
    expect(screen.queryByText("Hero")).toBeNull();
    expect(screen.queryByText("Botón “BOTOM”")).toBeNull();
    expect(screen.queryByText("Editar contenido")).toBeNull();
    expect(screen.queryByText("Dentro de Hero")).toBeNull();
  });

  it("hides remove-from-section in the selection microbar", () => {
    expect(
      visibleMicrobarActions([
        { id: "createMultiCard", label: "Multiplicar" },
        { id: "removeFromContainer", label: "Sacar de Sección" },
      ]).map((action) => action.id),
    ).toEqual(["createMultiCard"]);
  });

  it("keeps structural group actions without width-fit entries", () => {
    expect(
      visibleMicrobarActions([
        { id: "separateGroup", label: "Desagrupar" },
        { id: "createMultiCard", label: "Multiplicar" },
      ]).map((action) => action.id),
    ).toEqual(["separateGroup", "createMultiCard"]);
  });

  it("shortens a long breadcrumb to the last two segments", () => {
    const crumb = visibleMicrobarSegments([
      { unit: { kind: "blueprintNode", nodeId: "s1" }, label: "Hero", current: false },
      { unit: { kind: "blueprintNode", nodeId: "g1" }, label: "Grupo", current: false },
      { unit: { kind: "layer", layerId: "t1" }, label: "Título", current: true },
    ]);
    expect(crumb.truncated).toBe(true);
    expect(crumb.segments.map((s) => s.label)).toEqual(["Grupo", "Título"]);
  });

  it("does not mount refine controls in the selection microbar", () => {
    render(
      <SiteCreatorObjectMicrobar
        scale={1}
        stageWidth={400}
        stageHeight={300}
        model={{
          bounds: { x: 40, y: 140, width: 100, height: 36 },
          segments: [{ unit: { kind: "blueprintNode", nodeId: "g1" }, label: "Grupo", current: true }],
          actions: [
            { id: "separateGroup", label: "Desagrupar" },
          ],
        }}
      />,
    );
    expect(screen.queryByTestId("site-creator-refine")).toBeNull();
    expect(screen.queryByTestId("site-creator-micro-groupWidthFull")).toBeNull();
    expect(screen.getByTestId("site-creator-micro-separateGroup")).toBeTruthy();
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
    const visibilityToggles: string[] = [];
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
        revealMode="manual"
        activeVisibilityBand="tablet"
        resolveVisibility={(_node, band) => ({
          hidden: band === "mobile",
        })}
        onToggleVisibility={(node, band) => {
          visibilityToggles.push(`${node.id}:${band}`);
        }}
        onShowAllVisibility={() => {}}
      />,
    );
    expect(screen.getByTestId("site-creator-outline-panel").getAttribute("data-state")).toBe(
      "closed",
    );
    expect(screen.queryByText(/Hero/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar panel Página" }));
    expect(screen.getByText("Página")).toBeTruthy();
    expect(screen.getByText(/Hero/)).toBeTruthy();
    expect(screen.getAllByText(/BOTOM/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Contenido sin organizar/)).toBeTruthy();
    expect(screen.queryByText(/Grupo recortado/)).toBeNull();
    expect(screen.queryByText(/Clip 1/)).toBeNull();
    expect(screen.queryByText(/^Texto /)).toBeNull();
    expect(screen.queryByText(/Rectángulo/)).toBeNull();
    expect(screen.queryByText(/^Máscara/)).toBeNull();
    expect(screen.queryByText(/Botón/)).toBeNull();
    const heroNode = tree.roots.find(
      (node) => node.kind === "semantic" && node.nodeId === hero.createdNodeId,
    );
    expect(heroNode).toBeTruthy();
    if (!heroNode) return;
    expect(screen.queryByTestId(`outline-visibility-${heroNode.id}-wide`)).toBeNull();
    expect(screen.queryByTestId(`outline-visibility-${heroNode.id}-monitor`)).toBeNull();
    expect(screen.queryByTestId(`outline-visibility-${heroNode.id}-mobile`)).toBeNull();
    const visibility = screen.getByTestId(`outline-visibility-${heroNode.id}`);
    expect(visibility.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(visibility);
    expect(visibilityToggles).toEqual([`${heroNode.id}:tablet`]);
    expect(screen.getByTestId("outline-show-all")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ocultar panel Página" }));
    expect(screen.getByTestId("site-creator-outline-panel").getAttribute("data-state")).toBe(
      "closed",
    );
    expect(screen.queryByText(/Hero/)).toBeNull();
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
