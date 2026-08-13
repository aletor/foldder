/**
 * 6B.2 QA end-to-end — capacidad, ciclo funcional, unorganized, floating, labels.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { resetSiteBlueprintIdSeqForTests } from "./site-blueprint-ids";
import {
  createBlueprintHistory,
  pushBlueprintHistory,
  redoBlueprintHistory,
  undoBlueprintHistory,
} from "./site-blueprint-history";
import { cloneBlueprint } from "./site-blueprint-validate";
import {
  resolveAdaptationCapability,
  countReorganizableDirectUnits,
} from "./site-creator-adaptation-capability";
import {
  SiteCreatorAdaptationControl,
  adaptationButtonLabel,
} from "./SiteCreatorAdaptationControl";
import {
  resolveFloatingEditorPlacement,
  resolveAdaptationPopoverPlacement,
} from "./site-creator-floating-placement";
import {
  findDisplayObject,
  resolveSiteCreatorResponsiveDisplay,
} from "./site-creator-responsive";
import {
  fixtureHeroPanelButton,
  fixtureHorizontalCardsGroup,
  fixtureSectionBackgroundOnly,
  fixtureUnorganizedSurfaceText,
  makeLayer,
  makePage,
} from "./site-creator-responsive-fixtures";
import {
  resolveResponsiveOverride,
  resolveResponsiveTarget,
  setResponsiveOverride,
} from "./site-creator-responsive-overrides";
import { deriveLayerDisplayLabel } from "./site-creator-display-labels";
import { buildBreadcrumbSegments } from "./site-creator-hierarchy";

function collectVisibleIds(page: { objects?: Array<{ id: string; visible?: boolean }> }): string[] {
  const out: string[] = [];
  const walk = (objs: Array<{ id: string; visible?: boolean; type?: string; children?: unknown; content?: unknown; mask?: unknown }> | undefined) => {
    for (const o of objs ?? []) {
      if (o.visible === false) continue;
      out.push(o.id);
      if (o.type === "groupContainer" || o.type === "booleanGroup") {
        walk((o as { children?: typeof objs }).children);
      } else if (o.type === "clippingContainer") {
        const c = o as { mask?: { id: string; visible?: boolean }; content?: typeof objs };
        if (c.mask && c.mask.visible !== false) out.push(c.mask.id);
        walk(c.content);
      }
    }
  };
  walk(page.objects as never);
  return out.sort();
}

describe("6B.2 capability statuses", () => {
  beforeEach(() => resetSiteBlueprintIdSeqForTests());

  it("1. Section solo fondo → hidden", () => {
    const fx = fixtureSectionBackgroundOnly();
    const index = buildSiteSelectionIndex(fx.page);
    const cap = resolveAdaptationCapability({
      target: { kind: "blueprintNode", nodeId: fx.sectionId },
      band: "tablet",
      blueprint: fx.blueprint,
      index,
    });
    expect(cap).toEqual({ status: "hidden", reason: "insufficient-content" });
    expect(
      countReorganizableDirectUnits({
        target: { kind: "blueprintNode", nodeId: fx.sectionId },
        blueprint: fx.blueprint,
        index,
      }),
    ).toBeLessThan(2);
  });

  it("2. Override antiguo e inútil → reset-only", () => {
    const fx = fixtureSectionBackgroundOnly();
    const index = buildSiteSelectionIndex(fx.page);
    const bp = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.sectionId },
      band: "mobile",
      mode: "stack",
    }).blueprint;
    const cap = resolveAdaptationCapability({
      target: { kind: "blueprintNode", nodeId: fx.sectionId },
      band: "mobile",
      blueprint: bp,
      index,
    });
    expect(cap.status).toBe("reset-only");
  });

  it("3. Ancestro preserve → readonly", () => {
    const fx = fixtureHorizontalCardsGroup();
    const index = buildSiteSelectionIndex(fx.page);
    const bp = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.sectionId },
      band: "mobile",
      mode: "preserve",
    }).blueprint;
    const cap = resolveAdaptationCapability({
      target: { kind: "blueprintNode", nodeId: fx.groupId },
      band: "mobile",
      blueprint: bp,
      index,
    });
    expect(cap.status).toBe("readonly");
    if (cap.status === "readonly") {
      expect(cap.reason).toBe("controlled-by-ancestor");
    }
  });

  it("4. Sync bloqueado → readonly", () => {
    const fx = fixtureHorizontalCardsGroup();
    const index = buildSiteSelectionIndex(fx.page);
    const cap = resolveAdaptationCapability({
      target: { kind: "blueprintNode", nodeId: fx.groupId },
      band: "tablet",
      blueprint: fx.blueprint,
      index,
      syncBlocked: true,
    });
    expect(cap).toEqual({ status: "readonly", reason: "sync-blocked" });
  });

  it("Group horizontal → editable con 3 modos", () => {
    const fx = fixtureHorizontalCardsGroup();
    const index = buildSiteSelectionIndex(fx.page);
    const cap = resolveAdaptationCapability({
      target: { kind: "blueprintNode", nodeId: fx.groupId },
      band: "tablet",
      blueprint: fx.blueprint,
      index,
    });
    expect(cap.status).toBe("editable");
    if (cap.status === "editable") {
      expect(cap.foregroundUnitCount).toBeGreaterThanOrEqual(2);
      expect(cap.supportedModes).toEqual(["auto", "preserve", "stack"]);
    }
  });

  it("Original / Button / capa → hidden", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    expect(
      resolveAdaptationCapability({
        target: { kind: "blueprintNode", nodeId: fx.heroId },
        band: "wide",
        blueprint: fx.blueprint,
        index,
      }).status,
    ).toBe("hidden");
    expect(resolveResponsiveTarget({ kind: "blueprintNode", nodeId: fx.buttonId }, fx.blueprint, index)).toBeNull();
    expect(resolveResponsiveTarget({ kind: "layer", layerId: "panel" }, fx.blueprint, index)).toBeNull();
  });
});

describe("6B.2 ciclo funcional real Auto/Preserve/Stack", () => {
  beforeEach(() => resetSiteBlueprintIdSeqForTests());

  it("5–9. click UI → blueprint → geometrías distintas · undo · reload · bands", async () => {
    const fx = fixtureHorizontalCardsGroup();
    const index = buildSiteSelectionIndex(fx.page);
    const target = { kind: "blueprintNode" as const, nodeId: fx.groupId };
    let blueprint = fx.blueprint;
    let history = createBlueprintHistory(blueprint);

    const applyMode = (mode: "auto" | "preserve" | "stack") => {
      const result = setResponsiveOverride({
        blueprint: history.present,
        target,
        band: "tablet",
        mode,
      });
      if (!result.changed) return;
      history = pushBlueprintHistory(history, result.blueprint);
      blueprint = result.blueprint;
    };

    const onSelect = vi.fn((mode: "auto" | "preserve" | "stack") => {
      applyMode(mode);
    });

    const { rerender } = render(
      <SiteCreatorAdaptationControl
        model={{
          band: "tablet",
          effective: { mode: "auto", source: "default" },
          buttonLabel: adaptationButtonLabel("auto"),
          target,
        }}
        onSelectMode={onSelect}
      />,
    );

    fireEvent.click(screen.getByTestId("site-creator-adaptation-trigger"));
    await waitFor(() => expect(screen.getByTestId("site-creator-adaptation-popover")).toBeTruthy());
    fireEvent.click(screen.getByTestId("site-creator-adaptation-option-preserve"));
    expect(onSelect).toHaveBeenCalledWith("preserve");
    expect(resolveResponsiveOverride(blueprint, target, "tablet")).toBe("preserve");
    expect(resolveResponsiveOverride(blueprint, target, "mobile")).toBeNull();

    const preserveGeo = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint,
      referenceIndex: index,
      viewportWidth: 768,
    });

    rerender(
      <SiteCreatorAdaptationControl
        model={{
          band: "tablet",
          effective: { mode: "preserve", source: "explicit", controller: target },
          buttonLabel: adaptationButtonLabel("preserve"),
          target,
        }}
        onSelectMode={onSelect}
      />,
    );
    fireEvent.click(screen.getByTestId("site-creator-adaptation-trigger"));
    await waitFor(() => expect(screen.getByTestId("site-creator-adaptation-option-stack")).toBeTruthy());
    fireEvent.click(screen.getByTestId("site-creator-adaptation-option-stack"));
    expect(resolveResponsiveOverride(blueprint, target, "tablet")).toBe("stack");

    const stackGeo = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint,
      referenceIndex: index,
      viewportWidth: 768,
    });

    const autoGeo = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: 768,
    });

    const pa = findDisplayObject(preserveGeo.displayPage, "card_a")!;
    const pb = findDisplayObject(preserveGeo.displayPage, "card_b")!;
    expect(pb.x).toBeGreaterThan(pa.x);

    const sa = findDisplayObject(stackGeo.displayPage, "card_a")!;
    const sb = findDisplayObject(stackGeo.displayPage, "card_b")!;
    expect(sb.y).toBeGreaterThan(sa.y + sa.height - 1);
    expect(stackGeo.layout.layoutHeight).toBeGreaterThan(preserveGeo.layout.layoutHeight - 1);
    expect(JSON.stringify(preserveGeo.displayPage.objects)).not.toBe(
      JSON.stringify(stackGeo.displayPage.objects),
    );
    expect(JSON.stringify(autoGeo.displayPage.objects)).not.toBe(
      JSON.stringify(stackGeo.displayPage.objects),
    );

    // Undo / redo
    const undone = undoBlueprintHistory(history)!;
    expect(resolveResponsiveOverride(undone.present, target, "tablet")).toBe("preserve");
    const redone = redoBlueprintHistory(undone)!;
    expect(resolveResponsiveOverride(redone.present, target, "tablet")).toBe("stack");

    // Reload via clone
    const reloaded = cloneBlueprint(redone.present);
    expect(reloaded.responsive).toEqual(redone.present.responsive);

    // Auto elimina override
    const cleared = setResponsiveOverride({
      blueprint: reloaded,
      target,
      band: "tablet",
      mode: "auto",
    });
    expect(cleared.blueprint.responsive).toBeUndefined();

    // Original identidad
    const identity = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: cleared.blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
    });
    expect(identity.strategy).toBe("identity");
  });
});

describe("6B.2 floating placement", () => {
  it("10–11. cerca del ancla (≤12); sin solape selección/header/footer; popover no tapa microbarra", () => {
    const studio = { x: 0, y: 0, width: 1400, height: 900 };
    const frame = { x: 200, y: 80, width: 768, height: 700 };
    const sel = { x: 240, y: 200, width: 400, height: 280 };
    const header = { x: 0, y: 0, width: 1400, height: 48 };
    const footer = { x: 0, y: 860, width: 1400, height: 40 };
    const bar = resolveFloatingEditorPlacement({
      anchorRect: sel,
      floatingSize: { width: 280, height: 32 },
      selectionRect: sel,
      pageFrameRect: frame,
      studioViewportRect: studio,
      headerRect: header,
      footerRect: footer,
    });
    // Distancia del centro de la barra al ancla; con espacio libre ≤ ~12+mitad altura.
    expect(bar.distanceToAnchor).toBeLessThanOrEqual(12 + 16);
    expect(
      !(
        bar.left < sel.x + sel.width &&
        bar.left + 280 > sel.x &&
        bar.top < sel.y + sel.height &&
        bar.top + 32 > sel.y
      ),
    ).toBe(true);
    expect(
      !(
        bar.left < header.x + header.width &&
        bar.left + 280 > header.x &&
        bar.top < header.y + header.height &&
        bar.top + 32 > header.y
      ),
    ).toBe(true);
    expect(
      !(
        bar.left < footer.x + footer.width &&
        bar.left + 280 > footer.x &&
        bar.top < footer.y + footer.height &&
        bar.top + 32 > footer.y
      ),
    ).toBe(true);

    // Móvil estrecho: sigue visible en studio
    const mobileFrame = { x: 40, y: 60, width: 390, height: 720 };
    const mobileSel = { x: 60, y: 180, width: 350, height: 220 };
    const mobileBar = resolveFloatingEditorPlacement({
      anchorRect: mobileSel,
      floatingSize: { width: 260, height: 32 },
      selectionRect: mobileSel,
      pageFrameRect: mobileFrame,
      studioViewportRect: studio,
      headerRect: header,
      footerRect: footer,
    });
    expect(mobileBar.left).toBeGreaterThanOrEqual(studio.x);
    expect(mobileBar.top).toBeGreaterThanOrEqual(studio.y);
    expect(mobileBar.left + 260).toBeLessThanOrEqual(studio.x + studio.width);
    expect(mobileBar.top + 32).toBeLessThanOrEqual(studio.y + studio.height);
    expect(mobileBar.distanceToAnchor).toBeLessThanOrEqual(12 + 16);

    const trigger = { x: bar.left + 160, y: bar.top, width: 100, height: 24 };
    const micro = { x: bar.left, y: bar.top, width: 280, height: 32 };
    const pop = resolveAdaptationPopoverPlacement({
      triggerRect: trigger,
      microbarRect: micro,
      selectionRect: sel,
      studioViewportRect: studio,
      headerRect: header,
      footerRect: footer,
    });
    expect(
      !(
        pop.left < micro.x + micro.width &&
        pop.left + 240 > micro.x &&
        pop.top < micro.y + micro.height &&
        pop.top + 148 > micro.y
      ),
    ).toBe(true);
    // Coordenadas client directas (sin escalado extra): left/top = rect.x/y
    expect(pop.left).toBe(pop.rect.x);
    expect(pop.top).toBe(pop.rect.y);
    expect(bar.left).toBe(bar.rect.x);
  });
});

describe("6B.2 unorganized conservation", () => {
  beforeEach(() => resetSiteBlueprintIdSeqForTests());

  it("12–13. IDs visibles conservados; panel+título relacionados", () => {
    const fx = fixtureUnorganizedSurfaceText();
    const index = buildSiteSelectionIndex(fx.page);
    const sourceIds = collectVisibleIds(fx.page);
    const pageBefore = JSON.stringify(fx.page);
    const bpBefore = JSON.stringify(fx.blueprint);

    for (const width of [1920, 768, 390] as const) {
      const result = resolveSiteCreatorResponsiveDisplay({
        page: fx.page,
        blueprint: fx.blueprint,
        referenceIndex: index,
        viewportWidth: width,
      });
      if (width === 1920) {
        expect(result.strategy).toBe("identity");
      }
      const resolvedIds = collectVisibleIds(result.displayPage);
      expect(resolvedIds).toEqual(sourceIds);
      const panel = findDisplayObject(result.displayPage, "loose_panel")!;
      const title = findDisplayObject(result.displayPage, "loose_title")!;
      expect(panel.width).toBeGreaterThan(20);
      expect(title.x).toBeGreaterThanOrEqual(panel.x - 4);
      expect(title.x + title.width).toBeLessThanOrEqual(panel.x + panel.width + 8);
      expect(title.y).toBeGreaterThanOrEqual(panel.y - 4);
      expect(title.y + title.height).toBeLessThanOrEqual(panel.y + panel.height + 8);
      expect(JSON.stringify(fx.page)).toBe(pageBefore);
      expect(JSON.stringify(fx.blueprint)).toBe(bpBefore);
    }
  });
});

describe("6B.2 labels ES", () => {
  it("14. Text/Shape/Image/Photo → español; Hero/Foto", () => {
    const page = makePage([
      makeLayer({ id: "s", type: "rect", name: "Shape" }),
      makeLayer({ id: "t", type: "text", name: "Text", text: "" }),
      makeLayer({ id: "i", type: "image", name: "Image" }),
      makeLayer({ id: "p", type: "image", name: "Photo" }),
      makeLayer({ id: "r", type: "rect", name: "Rect" }),
    ]);
    const index = buildSiteSelectionIndex(page);
    expect(deriveLayerDisplayLabel("s", index)).toBe("Forma");
    expect(deriveLayerDisplayLabel("t", index)).toBe("Texto");
    expect(deriveLayerDisplayLabel("i", index)).toBe("Imagen");
    expect(deriveLayerDisplayLabel("p", index)).toBe("Foto");
    expect(deriveLayerDisplayLabel("r", index)).toBe("Rectángulo");

    const fx = fixtureHeroPanelButton();
    const hi = buildSiteSelectionIndex(fx.page);
    expect(deriveLayerDisplayLabel("photo", hi)).toMatch(/Imagen|Foto/);
    const segs = buildBreadcrumbSegments(
      { kind: "layer", layerId: "photo" },
      fx.blueprint,
      hi,
      null,
    );
    const path = segs.map((s) => s.label).join(" / ");
    expect(path).not.toMatch(/\bText\b|\bShape\b|\bUndo\b/);
    expect(path).toMatch(/Hero/);
    expect(path).toMatch(/Imagen|Foto/);
  });

  it("15. componentes principales no renderizan literales EN técnicos", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <SiteCreatorAdaptationControl
        model={{
          band: "tablet",
          effective: { mode: "auto", source: "default" },
          buttonLabel: adaptationButtonLabel("auto"),
          target: { kind: "blueprintNode", nodeId: "g1" },
        }}
        onSelectMode={onSelect}
      />,
    );
    fireEvent.click(screen.getByTestId("site-creator-adaptation-trigger"));
    const text = container.ownerDocument?.body.textContent ?? "";
    expect(text).not.toMatch(/\b(Text|Shape|Undo|Image|Photo)\b/);
    expect(text).toMatch(/Adaptación/);
    expect(text).toMatch(/Automática|Mantener|Apilar/);

    const page = makePage([
      makeLayer({ id: "s", type: "rect", name: "Shape" }),
      makeLayer({ id: "t", type: "text", name: "Text", text: "" }),
    ]);
    const index = buildSiteSelectionIndex(page);
    for (const id of ["s", "t"] as const) {
      const label = deriveLayerDisplayLabel(id, index);
      expect(label).not.toMatch(/^(Text|Shape|Image|Photo|Undo)$/);
    }
  });
});
