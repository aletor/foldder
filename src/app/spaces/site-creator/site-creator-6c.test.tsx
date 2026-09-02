/**
 * Fase 6C — ajustes contextuales por vista.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { cloneBlueprint } from "./site-blueprint-validate";
import {
  findDisplayObject,
  resolveSiteCreatorResponsiveDisplay,
} from "./site-creator-responsive";
import {
  fixtureHeroPanelButton,
  fixtureHorizontalCardsGroup,
  fixtureRealEightLayersGrouped,
  makeLayer,
  makePage,
} from "./site-creator-responsive-fixtures";
import { setResponsiveOverride } from "./site-creator-responsive-overrides";
import { setSectionHeightMode, createMultiCardFromSelection, createSectionFromSelection } from "./site-blueprint-ops";
import { applyNewSectionResponsiveDefaults } from "./site-creator-section-defaults";
import {
  bandHasCustomizations,
  canonicalizeItemRef,
  itemGeometryFromDelta,
  itemTextBoxFromDelta,
  listTransformableItemTargets,
  patchContainerTune,
  patchItemTune,
  patchMediaTune,
  resetResponsiveBand,
  resolveContainerTune,
  resolveItemRef,
  resolveItemTune,
  resolveMediaTune,
} from "./site-creator-responsive-tunes";
import { SITE_CREATOR_MOBILE_WIDTH, SITE_CREATOR_TABLET_WIDTH } from "./site-creator-viewport";
import { SiteCreatorRefineControl } from "./SiteCreatorRefineControl";
import { createEmptySiteBlueprintV1 } from "./site-creator-types";
import { encodeMultiCardInstanceId, parseMultiCardInstanceId } from "./site-creator-multicard-ids";
import { resolveBackgroundContainTransform } from "./site-creator-background-cover";
describe("site-creator 6C contextual refine", () => {
  it("keeps Original identical to Designer when tablet/mobile tunes exist", () => {
    const fx = fixtureHeroPanelButton();
    const withTune = patchItemTune({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.buttonId },
      band: "mobile",
      patch: { hidden: true, alignX: "end" },
    }).blueprint;
    const index = buildSiteSelectionIndex(fx.page);
    const original = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: withTune,
      referenceIndex: index,
      viewportWidth: 1920,
    });
    expect(original.band).toBe("wide");
    expect(original.strategy).toBe("identity");
    const src = fx.page.objects?.find((o) => o.id === "btn_shape");
    const display = findDisplayObject(original.displayPage, "btn_shape");
    expect(display?.x).toBe(src?.x);
    expect(display?.y).toBe(src?.y);
    expect(display?.opacity).toBe(src?.opacity);
  });

  it("stores and applies section visibility independently in Original", () => {
    const fx = fixtureHeroPanelButton();
    const hiddenWide = patchItemTune({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "wide",
      patch: { hidden: true },
    }).blueprint;
    expect(
      resolveItemTune(
        hiddenWide,
        { kind: "blueprintNode", nodeId: fx.heroId },
        "wide",
      )?.hidden,
    ).toBe(true);
    const index = buildSiteSelectionIndex(fx.page);
    const original = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: hiddenWide,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "wide",
    });
    expect(findDisplayObject(original.displayPage, "title")?.opacity).toBe(0);
    const tablet = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: hiddenWide,
      referenceIndex: index,
      viewportWidth: 768,
      band: "tablet",
    });
    expect(findDisplayObject(tablet.displayPage, "title")?.opacity).not.toBe(0);
  });

  it("tablet item tune does not change mobile", () => {
    const fx = fixtureHeroPanelButton();
    const tablet = patchItemTune({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.buttonId },
      band: "tablet",
      patch: { hidden: true },
    }).blueprint;
    expect(resolveItemTune(tablet, { kind: "blueprintNode", nodeId: fx.buttonId }, "mobile")).toBeNull();
    expect(resolveItemTune(tablet, { kind: "blueprintNode", nodeId: fx.buttonId }, "tablet")?.hidden).toBe(
      true,
    );
  });

  it("hides an item only on the edited band", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const bp = patchItemTune({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.buttonId },
      band: "mobile",
      patch: { hidden: true },
    }).blueprint;
    const mobile = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: bp,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
    });
    const btn = findDisplayObject(mobile.displayPage, "btn_shape");
    expect(btn?.opacity).toBe(0);
    const tablet = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: bp,
      referenceIndex: index,
      viewportWidth: 768,
    });
    const tabletBtn = findDisplayObject(tablet.displayPage, "btn_shape");
    expect(tabletBtn?.opacity).toBeGreaterThan(0);
  });

  it("container padding is independent per band", () => {
    const fx = fixtureHeroPanelButton();
    const bp = patchContainerTune({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "mobile",
      patch: { padding: 8 },
    }).blueprint;
    expect(bp.responsive?.containerTunes?.[0]?.byBand.mobile?.padding).toBe(8);
    expect(bp.responsive?.containerTunes?.[0]?.byBand.tablet).toBeUndefined();
  });

  it("setResponsiveOverride preserves item tunes", () => {
    const fx = fixtureHeroPanelButton();
    const withItem = patchItemTune({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.buttonId },
      band: "mobile",
      patch: { alignX: "start" },
    }).blueprint;
    const withBoth = setResponsiveOverride({
      blueprint: withItem,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "mobile",
      mode: "stack",
    }).blueprint;
    expect(resolveItemTune(withBoth, { kind: "blueprintNode", nodeId: fx.buttonId }, "mobile")?.alignX).toBe(
      "start",
    );
    expect(withBoth.responsive?.rules[0]?.byBand.mobile).toBe("stack");
  });

  it("cloneBlueprint keeps 6C collections", () => {
    const fx = fixtureHeroPanelButton();
    const bp = patchMediaTune({
      blueprint: fx.blueprint,
      layerId: "photo",
      band: "tablet",
      patch: { fit: "contain", focal: { x: 0.2, y: 0.8 } },
    }).blueprint;
    const cloned = cloneBlueprint(bp);
    expect(resolveMediaTune(cloned, "photo", "tablet")?.fit).toBe("contain");
    expect(resolveMediaTune(cloned, "photo", "tablet")?.focal).toEqual({ x: 0.2, y: 0.8 });
  });

  it("resetResponsiveBand removes only that view", () => {
    const fx = fixtureHeroPanelButton();
    let bp = patchItemTune({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.buttonId },
      band: "mobile",
      patch: { hidden: true },
    }).blueprint;
    bp = patchItemTune({
      blueprint: bp,
      target: { kind: "blueprintNode", nodeId: fx.buttonId },
      band: "tablet",
      patch: { alignX: "center" },
    }).blueprint;
    const reset = resetResponsiveBand({ blueprint: bp, band: "mobile" }).blueprint;
    expect(bandHasCustomizations(reset, "mobile")).toBe(false);
    expect(bandHasCustomizations(reset, "tablet")).toBe(true);
  });

  it("restores the responsive section baseline instead of switching it to auto layout", () => {
    const fx = fixtureHeroPanelButton();
    let initial = applyNewSectionResponsiveDefaults(fx.blueprint, fx.heroId);
    initial = applyNewSectionResponsiveDefaults(initial, fx.sectionId);
    expect(bandHasCustomizations(initial, "mobile")).toBe(false);

    const index = buildSiteSelectionIndex(fx.page);
    const baseline = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: initial,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
      band: "mobile",
    });
    let customized = patchContainerTune({
      blueprint: initial,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "mobile",
      patch: { padding: 48, contentAlignX: "end" },
    }).blueprint;
    customized = setResponsiveOverride({
      blueprint: customized,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "mobile",
      mode: "stack",
    }).blueprint;
    expect(bandHasCustomizations(customized, "mobile")).toBe(true);

    const reset = resetResponsiveBand({ blueprint: customized, band: "mobile" }).blueprint;
    expect(bandHasCustomizations(reset, "mobile")).toBe(false);
    const restored = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: reset,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
      band: "mobile",
    });
    for (const id of ["photo", "panel", "title", "btn_shape", "btn_text", "sec_bg", "sec_text"]) {
      const before = findDisplayObject(baseline.displayPage, id);
      const after = findDisplayObject(restored.displayPage, id);
      expect(after, id).toMatchObject({
        x: before?.x,
        y: before?.y,
        width: before?.width,
        height: before?.height,
        opacity: before?.opacity,
      });
    }
  });

  it("keeps section height when resetting Tablet or Mobile refinements", () => {
    const fx = fixtureHeroPanelButton();
    for (const band of ["monitor", "tablet", "mobile"] as const) {
      let initial = applyNewSectionResponsiveDefaults(fx.blueprint, fx.heroId);
      const height = setSectionHeightMode(initial, fx.heroId, "custom", band, 1200);
      expect(height.ok).toBe(true);
      if (!height.ok) continue;
      initial = patchContainerTune({
        blueprint: height.blueprint,
        target: { kind: "blueprintNode", nodeId: fx.heroId },
        band,
        patch: { gap: 36, contentAlignY: "end" },
      }).blueprint;

      const reset = resetResponsiveBand({ blueprint: initial, band }).blueprint;
      expect(
        resolveContainerTune(
          reset,
          { kind: "blueprintNode", nodeId: fx.heroId },
          band,
        ),
      ).toMatchObject({
        padding: 0,
        gap: 0,
        minHeight: 0,
        heightMode: "custom",
        customHeight: 1200,
      });
      expect(bandHasCustomizations(reset, band)).toBe(false);
    }
  });

  it("contain fit keeps the image inside the target", () => {
    const placed = resolveBackgroundContainTransform({
      sourceRect: { x: 0, y: 0, width: 1920, height: 1080 },
      targetRect: { x: 0, y: 0, width: 390, height: 600 },
      focalPoint: { x: 0.5, y: 0.5 },
    });
    expect(placed.width).toBeLessThanOrEqual(390 + 0.01);
    expect(placed.height).toBeLessThanOrEqual(600 + 0.01);
    expect(placed.x).toBeGreaterThanOrEqual(-0.01);
    expect(placed.y).toBeGreaterThanOrEqual(-0.01);
  });

  it("refine microbar exposes align, width, hide and reset", () => {
    const onHide = vi.fn();
    const onAlignX = vi.fn();
    const onResetItem = vi.fn();
    render(
      <SiteCreatorRefineControl
        model={{
          band: "mobile",
          kind: "item",
          itemTune: { hidden: false, alignX: "start" },
          containerTune: null,
          mediaTune: null,
          canReorder: true,
          resetLabel: "Restablecer en Móvil",
          showReset: true,
        }}
        handlers={{ onHide, onAlignX, onResetItem }}
      />,
    );
    expect(screen.getByTestId("site-creator-refine")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Centrar"));
    expect(onAlignX).toHaveBeenCalledWith("center");
    fireEvent.click(screen.getByTestId("site-creator-refine-more"));
    expect(screen.getByTestId("site-creator-refine-popover").textContent).toContain("Ocultar en móvil");
    fireEvent.click(screen.getByText("Ocultar en móvil"));
    expect(onHide).toHaveBeenCalledWith(true);
  });

  it("pointerdown on a refine option fires the handler", () => {
    const onHide = vi.fn();
    render(
      <SiteCreatorRefineControl
        model={{
          band: "tablet",
          kind: "item",
          itemTune: null,
          containerTune: null,
          mediaTune: null,
          canReorder: false,
          resetLabel: "Restablecer en Tablet",
          showReset: false,
        }}
        handlers={{ onHide }}
      />,
    );
    fireEvent.click(screen.getByTestId("site-creator-refine-more"));
    fireEvent.pointerDown(screen.getByText("Ocultar en tablet"));
    expect(onHide).toHaveBeenCalledWith(true);
  });

  it("space menu hides gap with one child and auto clears padding on mobile", () => {
    const onPaddingAuto = vi.fn();
    const onContainerAlign = vi.fn();
    render(
      <SiteCreatorRefineControl
        model={{
          band: "mobile",
          kind: "container",
          itemTune: null,
          containerTune: { padding: 32 },
          mediaTune: null,
          canReorder: false,
          resetLabel: "Restablecer en Móvil",
          showReset: true,
          containerContentCount: 1,
        }}
        handlers={{ onContainerPaddingAuto: onPaddingAuto, onContainerAlign }}
      />,
    );
    fireEvent.click(screen.getByTestId("site-creator-refine-space"));
    expect(screen.getByTestId("site-creator-refine-popover")).toBeTruthy();
    expect(screen.queryByText("Espacio entre elementos")).toBeNull();
    expect(screen.getByText("32")).toBeTruthy();
    fireEvent.pointerDown(screen.getAllByText("Auto")[0]!);
    expect(onPaddingAuto).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(screen.getByTitle("Centro horizontal"));
    expect(onContainerAlign).toHaveBeenCalledWith("center");
  });

  it("container align and width controls are visible", () => {
    const onContainerAlign = vi.fn();
    const onWidth = vi.fn();
    render(
      <SiteCreatorRefineControl
        model={{
          band: "tablet",
          kind: "container",
          itemTune: null,
          containerTune: null,
          mediaTune: null,
          canReorder: false,
          resetLabel: "Restablecer en Tablet",
          showReset: false,
        }}
        handlers={{ onContainerAlign, onContainerWidthMode: onWidth }}
      />,
    );
    fireEvent.click(screen.getByLabelText("Alinear a la izquierda"));
    expect(onContainerAlign).toHaveBeenCalledWith("start");
    fireEvent.click(screen.getByTestId("site-creator-refine-width"));
    fireEvent.click(screen.getByText("Completo"));
    expect(onWidth).toHaveBeenCalledWith("full");
  });
});

describe("site-creator 6C visible layout effects", () => {
  it("stack packs units vertically unlike preserve", () => {
    const fx = fixtureHorizontalCardsGroup();
    const index = buildSiteSelectionIndex(fx.page);
    const preserve = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.groupId },
      band: "tablet",
      mode: "preserve",
    }).blueprint;
    const stack = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.groupId },
      band: "tablet",
      mode: "stack",
    }).blueprint;
    const preserveGeo = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: preserve,
      referenceIndex: index,
      viewportWidth: 768,
    });
    const stackGeo = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: stack,
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
    const sa = findDisplayObject(stackGeo.displayPage, "card_a")!;
    const sb = findDisplayObject(stackGeo.displayPage, "card_b")!;
    expect(pb.x).toBeGreaterThan(pa.x);
    expect(sb.y).toBeGreaterThan(sa.y + sa.height - 1);
    expect(JSON.stringify(preserveGeo.displayPage.objects)).not.toBe(
      JSON.stringify(stackGeo.displayPage.objects),
    );
    expect(JSON.stringify(autoGeo.displayPage.objects)).not.toBe(
      JSON.stringify(stackGeo.displayPage.objects),
    );
    const restored = setResponsiveOverride({
      blueprint: stack,
      target: { kind: "blueprintNode", nodeId: fx.groupId },
      band: "tablet",
      mode: "auto",
    }).blueprint;
    const restoredGeo = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: restored,
      referenceIndex: index,
      viewportWidth: 768,
    });
    expect(JSON.stringify(restoredGeo.displayPage.objects)).toBe(
      JSON.stringify(autoGeo.displayPage.objects),
    );
  });

  it("aligning a text to the end moves it without changing size", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const stacked = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "tablet",
      mode: "stack",
    }).blueprint;
    const aligned = patchItemTune({
      blueprint: stacked,
      target: { kind: "layer", layerId: "title" },
      band: "tablet",
      patch: { alignX: "end" },
    }).blueprint;
    const before = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: stacked,
      referenceIndex: index,
      viewportWidth: 768,
    });
    const after = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: aligned,
      referenceIndex: index,
      viewportWidth: 768,
    });
    const t0 = findDisplayObject(before.displayPage, "title")!;
    const t1 = findDisplayObject(after.displayPage, "title")!;
    expect(t1.x).toBeGreaterThan(t0.x + 8);
    expect(t1.width).toBeCloseTo(t0.width, 0);
    expect(t1.height).toBeCloseTo(t0.height, 0);
  });

  it("full width stretches an item to the viewport without overflowing", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const bp = patchItemTune({
      blueprint: fx.blueprint,
      target: { kind: "layer", layerId: "title" },
      band: "tablet",
      patch: { widthMode: "full" },
    }).blueprint;
    const geo = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: bp,
      referenceIndex: index,
      viewportWidth: 768,
    });
    const title = findDisplayObject(geo.displayPage, "title")!;
    expect(title.x).toBeGreaterThanOrEqual(-0.5);
    expect(title.x + title.width).toBeLessThanOrEqual(768.5);
    expect(title.width).toBeGreaterThan(600);
  });

  it("hiding a stacked item collapses the gap and stays visible in Original", () => {
    const fx = fixtureHorizontalCardsGroup();
    const index = buildSiteSelectionIndex(fx.page);
    let bp = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.groupId },
      band: "tablet",
      mode: "stack",
    }).blueprint;
    const shown = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: bp,
      referenceIndex: index,
      viewportWidth: 768,
    });
    bp = patchItemTune({
      blueprint: bp,
      target: { kind: "layer", layerId: "card_b" },
      band: "tablet",
      patch: { hidden: true },
    }).blueprint;
    const hidden = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: bp,
      referenceIndex: index,
      viewportWidth: 768,
    });
    const sa = findDisplayObject(shown.displayPage, "card_a")!;
    const sb = findDisplayObject(shown.displayPage, "card_b")!;
    const sc = findDisplayObject(shown.displayPage, "card_c")!;
    const ha = findDisplayObject(hidden.displayPage, "card_a")!;
    const hb = findDisplayObject(hidden.displayPage, "card_b")!;
    const hc = findDisplayObject(hidden.displayPage, "card_c")!;
    expect(sa.opacity).toBeGreaterThan(0);
    expect(ha.opacity).toBeGreaterThan(0);
    expect(hb.opacity).toBe(0);
    expect(hc.y).toBeLessThan(sc.y - 8);
    expect(hidden.layout.layoutHeight).toBeLessThan(shown.layout.layoutHeight - 8);
    expect(sb.opacity).toBeGreaterThan(0);
    const original = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: bp,
      referenceIndex: index,
      viewportWidth: 1920,
    });
    expect(findDisplayObject(original.displayPage, "card_b")?.opacity).toBeGreaterThan(0);
    void sa;
    void sb;
    void ha;
  });

  it("container padding changes the inset of stacked content", () => {
    const fx = fixtureHorizontalCardsGroup();
    const index = buildSiteSelectionIndex(fx.page);
    const bp = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.sectionId },
      band: "tablet",
      mode: "stack",
    }).blueprint;
    const tight = patchContainerTune({
      blueprint: bp,
      target: { kind: "blueprintNode", nodeId: fx.sectionId },
      band: "tablet",
      patch: { padding: 8 },
    }).blueprint;
    const roomy = patchContainerTune({
      blueprint: bp,
      target: { kind: "blueprintNode", nodeId: fx.sectionId },
      band: "tablet",
      patch: { padding: 80 },
    }).blueprint;
    const a = findDisplayObject(
      resolveSiteCreatorResponsiveDisplay({
        page: fx.page,
        blueprint: tight,
        referenceIndex: index,
        viewportWidth: 768,
      }).displayPage,
      "card_a",
    )!;
    const b = findDisplayObject(
      resolveSiteCreatorResponsiveDisplay({
        page: fx.page,
        blueprint: roomy,
        referenceIndex: index,
        viewportWidth: 768,
      }).displayPage,
      "card_a",
    )!;
    expect(b.y).toBeGreaterThan(a.y + 20);
  });

  it("group Espacio align, padding and gap move children", () => {
    const fx = fixtureHorizontalCardsGroup();
    const index = buildSiteSelectionIndex(fx.page);
    const target = { kind: "blueprintNode" as const, nodeId: fx.groupId };
    const left = patchContainerTune({
      blueprint: fx.blueprint,
      target,
      band: "tablet",
      patch: { contentAlignX: "start" },
    }).blueprint;
    const right = patchContainerTune({
      blueprint: fx.blueprint,
      target,
      band: "tablet",
      patch: { contentAlignX: "end" },
    }).blueprint;
    const aL = findDisplayObject(
      resolveSiteCreatorResponsiveDisplay({
        page: fx.page,
        blueprint: left,
        referenceIndex: index,
        viewportWidth: 768,
      }).displayPage,
      "card_a",
    )!;
    const aR = findDisplayObject(
      resolveSiteCreatorResponsiveDisplay({
        page: fx.page,
        blueprint: right,
        referenceIndex: index,
        viewportWidth: 768,
      }).displayPage,
      "card_a",
    )!;
    expect(aL.x).toBeLessThan(aR.x - 8);
    expect(aL.width).toBeCloseTo(aR.width, 0);

    const pad8 = patchContainerTune({
      blueprint: fx.blueprint,
      target,
      band: "tablet",
      patch: { padding: 8 },
    }).blueprint;
    const pad64 = patchContainerTune({
      blueprint: fx.blueprint,
      target,
      band: "tablet",
      patch: { padding: 64 },
    }).blueprint;
    const p8 = findDisplayObject(
      resolveSiteCreatorResponsiveDisplay({
        page: fx.page,
        blueprint: pad8,
        referenceIndex: index,
        viewportWidth: 768,
      }).displayPage,
      "card_a",
    )!;
    const p64 = findDisplayObject(
      resolveSiteCreatorResponsiveDisplay({
        page: fx.page,
        blueprint: pad64,
        referenceIndex: index,
        viewportWidth: 768,
      }).displayPage,
      "card_a",
    )!;
    expect(p64.y).toBeGreaterThan(p8.y + 20);

    const gap8 = patchContainerTune({
      blueprint: fx.blueprint,
      target,
      band: "tablet",
      patch: { gap: 8 },
    }).blueprint;
    const gap48 = patchContainerTune({
      blueprint: fx.blueprint,
      target,
      band: "tablet",
      patch: { gap: 48 },
    }).blueprint;
    const g8 = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: gap8,
      referenceIndex: index,
      viewportWidth: 768,
    });
    const g48 = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: gap48,
      referenceIndex: index,
      viewportWidth: 768,
    });
    const d8 =
      findDisplayObject(g8.displayPage, "card_b")!.y -
      (findDisplayObject(g8.displayPage, "card_a")!.y + findDisplayObject(g8.displayPage, "card_a")!.height);
    const d48 =
      findDisplayObject(g48.displayPage, "card_b")!.y -
      (findDisplayObject(g48.displayPage, "card_a")!.y + findDisplayObject(g48.displayPage, "card_a")!.height);
    expect(d48).toBeGreaterThan(d8 + 20);
  });

  it("cover and contain produce different image geometry", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const cover = patchMediaTune({
      blueprint: fx.blueprint,
      layerId: "photo",
      band: "tablet",
      patch: { fit: "cover", focal: { x: 0.5, y: 0.5 } },
    }).blueprint;
    const contain = patchMediaTune({
      blueprint: fx.blueprint,
      layerId: "photo",
      band: "tablet",
      patch: { fit: "contain", focal: { x: 0.5, y: 0.5 } },
    }).blueprint;
    const coverObj = findDisplayObject(
      resolveSiteCreatorResponsiveDisplay({
        page: fx.page,
        blueprint: cover,
        referenceIndex: index,
        viewportWidth: 768,
      }).displayPage,
      "photo",
    )!;
    const containObj = findDisplayObject(
      resolveSiteCreatorResponsiveDisplay({
        page: fx.page,
        blueprint: contain,
        referenceIndex: index,
        viewportWidth: 768,
      }).displayPage,
      "photo",
    )!;
    expect(coverObj.width !== containObj.width || coverObj.height !== containObj.height).toBe(true);
    expect(containObj.width).toBeLessThanOrEqual(768.5);
  });

  it("focal point is stored independently per band", () => {
    const fx = fixtureHeroPanelButton();
    let bp = patchMediaTune({
      blueprint: fx.blueprint,
      layerId: "photo",
      band: "tablet",
      patch: { fit: "cover", focal: { x: 0.2, y: 0.8 } },
    }).blueprint;
    bp = patchMediaTune({
      blueprint: bp,
      layerId: "photo",
      band: "mobile",
      patch: { fit: "cover", focal: { x: 0.9, y: 0.1 } },
    }).blueprint;
    expect(resolveMediaTune(bp, "photo", "tablet")?.focal).toEqual({ x: 0.2, y: 0.8 });
    expect(resolveMediaTune(bp, "photo", "mobile")?.focal).toEqual({ x: 0.9, y: 0.1 });
  });

  it("stores mask framing and zoom independently in Original", () => {
    const fx = fixtureHeroPanelButton();
    const bp = patchMediaTune({
      blueprint: fx.blueprint,
      layerId: "photo",
      band: "wide",
      patch: { focal: { x: 0.15, y: 0.7 }, zoom: 1.4 },
    }).blueprint;

    expect(resolveMediaTune(bp, "photo", "wide")).toEqual({
      focal: { x: 0.15, y: 0.7 },
      zoom: 1.4,
    });
    expect(resolveMediaTune(bp, "photo", "tablet")).toBeNull();
    expect(resolveMediaTune(bp, "photo", "mobile")).toBeNull();
  });

  it("stores clip zoom below 100% in Original", () => {
    const fx = fixtureHeroPanelButton();
    const bp = patchMediaTune({
      blueprint: fx.blueprint,
      layerId: "photo",
      band: "wide",
      patch: { zoom: 0.7 },
    }).blueprint;

    expect(resolveMediaTune(bp, "photo", "wide")?.zoom).toBe(0.7);
  });

  it("applies item controls on a page without Hero or Section", () => {
    const fx = fixtureRealEightLayersGrouped();
    const index = buildSiteSelectionIndex(fx.page);
    let bp = patchItemTune({
      blueprint: fx.blueprint,
      target: { kind: "layer", layerId: "web_title" },
      band: "tablet",
      patch: { alignX: "end", widthMode: "container" },
    }).blueprint;
    bp = patchItemTune({
      blueprint: bp,
      target: { kind: "layer", layerId: "hero_claim" },
      band: "tablet",
      patch: { hidden: true },
    }).blueprint;

    const automatic = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: 768,
    });
    const tuned = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: bp,
      referenceIndex: index,
      viewportWidth: 768,
    });
    const before = findDisplayObject(automatic.displayPage, "web_title")!;
    const after = findDisplayObject(tuned.displayPage, "web_title")!;
    expect(after.x).not.toBeCloseTo(before.x, 0);
    expect(after.width).toBeGreaterThan(before.width);
    expect(after.x + after.width).toBeLessThanOrEqual(768.5);
    expect(findDisplayObject(tuned.displayPage, "hero_claim")?.opacity).toBe(0);
  });

  it("applies the Espacio menu on a root group without Hero or Section", () => {
    const fx = fixtureRealEightLayersGrouped();
    const index = buildSiteSelectionIndex(fx.page);
    const target = { kind: "blueprintNode" as const, nodeId: fx.groupId };
    const compact = patchContainerTune({
      blueprint: fx.blueprint,
      target,
      band: "tablet",
      patch: { padding: 8, gap: 8, contentAlignX: "start", minHeight: 500 },
    }).blueprint;
    const spacious = patchContainerTune({
      blueprint: fx.blueprint,
      target,
      band: "tablet",
      patch: { padding: 60, gap: 48, contentAlignX: "end", minHeight: 900 },
    }).blueprint;
    const a = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: compact,
      referenceIndex: index,
      viewportWidth: 768,
    });
    const b = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: spacious,
      referenceIndex: index,
      viewportWidth: 768,
    });
    const aFirst = findDisplayObject(a.displayPage, "hero_image")!;
    const bFirst = findDisplayObject(b.displayPage, "hero_image")!;
    const aSecond = findDisplayObject(a.displayPage, "white_card")!;
    const bSecond = findDisplayObject(b.displayPage, "white_card")!;
    expect(bFirst.x).toBeGreaterThan(aFirst.x);
    expect(bFirst.y).toBeGreaterThan(aFirst.y + 20);
    expect(bSecond.y - (bFirst.y + bFirst.height)).toBeGreaterThan(
      aSecond.y - (aFirst.y + aFirst.height) + 20,
    );
    expect(b.layout.layoutHeight).toBeGreaterThanOrEqual(a.layout.layoutHeight);
  });

  it("converts a pixel drag into a percent of the automatic box", () => {
    expect(
      itemGeometryFromDelta({
        tune: null,
        delta: { dx: 20, dy: -8 },
        displayBounds: { width: 200, height: 80 },
      }),
    ).toEqual({ shiftX: 0.1, shiftY: -0.1, scale: 1 });
    expect(
      itemGeometryFromDelta({
        tune: null,
        delta: { dx: 1, dy: 0 },
        displayBounds: { width: 200, height: 80 },
      }).shiftX,
    ).toBeCloseTo(0.005, 4);
    expect(
      itemGeometryFromDelta({
        tune: null,
        delta: { dx: 0, dy: 10 },
        displayBounds: { width: 200, height: 80 },
      }).shiftY,
    ).toBeCloseTo(0.125, 4);
    expect(
      itemGeometryFromDelta({
        tune: { scale: 1.2 },
        delta: { dx: 0, dy: 0, dw: 24, dh: 0 },
        displayBounds: { width: 120, height: 40 },
      }).scale,
    ).toBeCloseTo(1.44, 2);
  });

  it("round-trips a drag on a scaled item so release matches the ghost box", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const scaled = patchItemTune({
      blueprint: fx.blueprint,
      target: { kind: "layer", layerId: "btn_shape" },
      band: "tablet",
      patch: { scale: 1.5 },
    }).blueprint;
    const before = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: scaled,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
    });
    const b0 = findDisplayObject(before.displayPage, "btn_shape")!;
    const dx = 30;
    const geometry = itemGeometryFromDelta({
      tune: { scale: 1.5 },
      delta: { dx, dy: 0 },
      displayBounds: { width: b0.width, height: b0.height },
    });
    const moved = patchItemTune({
      blueprint: scaled,
      target: { kind: "layer", layerId: "btn_shape" },
      band: "tablet",
      patch: { shiftX: geometry.shiftX, shiftY: geometry.shiftY },
    }).blueprint;
    const after = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: moved,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
    });
    const b1 = findDisplayObject(after.displayPage, "btn_shape")!;
    expect(b1.x).toBeCloseTo(b0.x + dx, 0);
    expect(b1.width).toBeCloseTo(b0.width, 0);
  });

  it("round-trips a drag when widthMode stretches the box", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const full = patchItemTune({
      blueprint: fx.blueprint,
      target: { kind: "layer", layerId: "title" },
      band: "tablet",
      patch: { widthMode: "container" },
    }).blueprint;
    const before = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: full,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
    });
    const t0 = findDisplayObject(before.displayPage, "title")!;
    const dy = 24;
    const geometry = itemGeometryFromDelta({
      tune: { widthMode: "container" },
      delta: { dx: 0, dy },
      displayBounds: { width: t0.width, height: t0.height },
    });
    const moved = patchItemTune({
      blueprint: full,
      target: { kind: "layer", layerId: "title" },
      band: "tablet",
      patch: { shiftX: geometry.shiftX, shiftY: geometry.shiftY },
    }).blueprint;
    const after = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: moved,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
    });
    const t1 = findDisplayObject(after.displayPage, "title")!;
    expect(t1.y).toBeCloseTo(t0.y + dy, 0);
    expect(t1.width).toBeCloseTo(t0.width, 0);
  });

  it("stores MultiCard instance drags on the mold layer", () => {
    const instanceId = encodeMultiCardInstanceId({
      nodeId: "mc1",
      cardId: "card_2",
      moldLayerId: "title",
    });
    expect(canonicalizeItemRef({ kind: "layer", layerId: instanceId })).toEqual({
      kind: "layer",
      layerId: "title",
    });
    const fx = fixtureHeroPanelButton();
    const patched = patchItemTune({
      blueprint: fx.blueprint,
      target: { kind: "layer", layerId: instanceId },
      band: "tablet",
      patch: { shiftX: 0.2 },
    }).blueprint;
    expect(resolveItemTune(patched, { kind: "layer", layerId: "title" }, "tablet")?.shiftX).toBe(0.2);
    expect(resolveItemTune(patched, { kind: "layer", layerId: instanceId }, "tablet")?.shiftX).toBe(0.2);
  });

  it("applies relative shift and scale from the automatic layout of that device", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const autoTablet = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
    });
    const b0 = findDisplayObject(autoTablet.displayPage, "btn_shape")!;
    const shifted = patchItemTune({
      blueprint: fx.blueprint,
      target: { kind: "layer", layerId: "btn_shape" },
      band: "tablet",
      patch: { shiftX: 0.2, shiftY: -0.15 },
    }).blueprint;
    const afterShift = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: shifted,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
    });
    const bShift = findDisplayObject(afterShift.displayPage, "btn_shape")!;
    expect(bShift.x).toBeCloseTo(b0.x + b0.width * 0.2, 0);
    expect(bShift.y).toBeCloseTo(b0.y - b0.height * 0.15, 0);
    expect(bShift.width).toBeCloseTo(b0.width, 0);

    const scaled = patchItemTune({
      blueprint: fx.blueprint,
      target: { kind: "layer", layerId: "btn_shape" },
      band: "tablet",
      patch: { scale: 1.25 },
    }).blueprint;
    const afterScale = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: scaled,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
    });
    const b1 = findDisplayObject(afterScale.displayPage, "btn_shape")!;
    expect(b1.width).toBeCloseTo(b0.width * 1.25, 0);
    expect(b1.height).toBeCloseTo(b0.height * 1.25, 0);
    expect(b1.x).toBeCloseTo(b0.x, 0);

    const autoMobile = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
    });
    const mobileTuned = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: shifted,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
    });
    const m0 = findDisplayObject(autoMobile.displayPage, "btn_shape")!;
    const m1 = findDisplayObject(mobileTuned.displayPage, "btn_shape")!;
    expect(m1.x).toBeCloseTo(m0.x, 0);
    expect(m1.width).toBeCloseTo(m0.width, 0);

    const original = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: shifted,
      referenceIndex: index,
      viewportWidth: 1920,
    });
    const src = fx.page.objects?.find((o) => o.id === "btn_shape");
    const orig = findDisplayObject(original.displayPage, "btn_shape");
    expect(orig?.x).toBe(src?.x);
    expect(orig?.width).toBe(src?.width);
  });

  it("still applies legacy absolute offset when no relative shift exists", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const auto = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
    });
    const t0 = findDisplayObject(auto.displayPage, "title")!;
    const legacy = patchItemTune({
      blueprint: fx.blueprint,
      target: { kind: "layer", layerId: "title" },
      band: "tablet",
      patch: { offset: { x: 40, y: 12 } },
    }).blueprint;
    const after = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: legacy,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
    });
    const t1 = findDisplayObject(after.displayPage, "title")!;
    expect(t1.x).toBeCloseTo(t0.x + 40, 0);
    expect(t1.y).toBeCloseTo(t0.y + 12, 0);
  });

  it("applies a mold-layer shift to every MultiCard copy", () => {
    const page = makePage(
      [
        makeLayer({ id: "bg", type: "rect", x: 0, y: 0, width: 800, height: 400, fill: "#eee" }),
        makeLayer({ id: "photo", type: "rect", x: 40, y: 80, width: 240, height: 160, fill: "#888" }),
        makeLayer({ id: "title", type: "text", x: 40, y: 260, width: 200, height: 32, text: "Card" }),
      ],
      { w: 800, h: 400 },
    );
    const index = buildSiteSelectionIndex(page);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "photo", "title"],
      index,
      committedPage: page,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok || !hero.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["photo", "title"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.createdNodeId) return;
    const auto = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: created.blueprint,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
      band: "tablet",
    });
    const title0 = findDisplayObject(auto.displayPage, "title")!;
    const shifted = patchItemTune({
      blueprint: created.blueprint,
      target: { kind: "layer", layerId: "title" },
      band: "tablet",
      patch: { shiftX: 0.2 },
    }).blueprint;
    const after = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: shifted,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
      band: "tablet",
    });
    const title1 = findDisplayObject(after.displayPage, "title")!;
    expect(title1.x).toBeCloseTo(title0.x + title0.width * 0.2, 0);

    const cloneTitles: Array<{ cardId: string; x: number; width: number }> = [];
    const walk = (objects: Array<{ id?: string; x?: number; width?: number; children?: unknown[] }> | undefined) => {
      for (const obj of objects ?? []) {
        const parsed = obj.id ? parseMultiCardInstanceId(obj.id) : null;
        if (parsed?.moldLayerId === "title") {
          cloneTitles.push({ cardId: parsed.cardId, x: obj.x ?? 0, width: obj.width ?? 0 });
        }
        walk(obj.children as typeof objects);
      }
    };
    walk(after.displayPage.objects);
    expect(cloneTitles.length).toBeGreaterThan(0);
    for (const clone of cloneTitles) {
      const autoCloneId = encodeMultiCardInstanceId({
        nodeId: created.createdNodeId,
        cardId: clone.cardId,
        moldLayerId: "title",
      });
      const beforeClone = findDisplayObject(auto.displayPage, autoCloneId);
      expect(beforeClone).toBeTruthy();
      if (!beforeClone) continue;
      expect(
        (clone.x - (beforeClone.x ?? 0)) / Math.max(1, beforeClone.width ?? 1),
      ).toBeCloseTo(0.2, 1);
    }
  });

  it("refine geometry chip edits relative X", () => {
    const onItemShift = vi.fn();
    render(
      <SiteCreatorRefineControl
        model={{
          band: "tablet",
          kind: "item",
          itemTune: null,
          containerTune: null,
          mediaTune: null,
          canReorder: false,
          resetLabel: "Restablecer en Tablet",
          showReset: false,
        }}
        handlers={{ onItemShift }}
      />,
    );
    expect(screen.getByTestId("site-creator-refine-geometry").textContent).toContain("Posición");
    fireEvent.click(screen.getByTestId("site-creator-refine-geometry"));
    expect(screen.getByTestId("site-creator-refine-popover").textContent).toContain("Corrección en tablet");
    fireEvent.pointerDown(screen.getAllByText("+")[0]!);
    expect(onItemShift).toHaveBeenCalledWith("x", 0.01);
  });

  it("converts a text-box drag into relative width without uniform scale", () => {
    expect(
      itemTextBoxFromDelta({
        tune: null,
        delta: { dx: 0, dy: 0, dw: 40 },
        displayBounds: { width: 200, height: 80 },
      }),
    ).toEqual({ shiftX: 0, shiftY: 0, boxW: 1.2, boxH: null, hugHeight: true });
    expect(
      itemTextBoxFromDelta({
        tune: null,
        delta: { dx: -20, dy: 0, dw: 20 },
        displayBounds: { width: 200, height: 80 },
      }),
    ).toEqual({ shiftX: -0.1, shiftY: 0, boxW: 1.1, boxH: null, hugHeight: true });
    expect(
      itemTextBoxFromDelta({
        tune: null,
        delta: { dx: 0, dy: 0, dh: 16 },
        displayBounds: { width: 200, height: 80 },
      }).hugHeight,
    ).toBe(false);
  });

  it("clears explicit text-box height so the frame hugs again", () => {
    const fx = fixtureHeroPanelButton();
    const withHeight = patchItemTune({
      blueprint: fx.blueprint,
      target: { kind: "layer", layerId: "title" },
      band: "tablet",
      patch: { boxH: 1.4 },
    }).blueprint;
    expect(resolveItemTune(withHeight, { kind: "layer", layerId: "title" }, "tablet")?.boxH).toBe(1.4);
    const hugged = patchItemTune({
      blueprint: withHeight,
      target: { kind: "layer", layerId: "title" },
      band: "tablet",
      patch: { boxH: null },
    }).blueprint;
    expect(resolveItemTune(hugged, { kind: "layer", layerId: "title" }, "tablet")?.boxH).toBeUndefined();
  });

  it("widens a text box without changing font size", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const auto = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
    });
    const t0 = findDisplayObject(auto.displayPage, "title")!;
    const widened = patchItemTune({
      blueprint: fx.blueprint,
      target: { kind: "layer", layerId: "title" },
      band: "tablet",
      patch: { boxW: 1.2 },
    }).blueprint;
    const after = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: widened,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
    });
    const t1 = findDisplayObject(after.displayPage, "title")!;
    expect(t1.width).toBeCloseTo(t0.width * 1.2, 0);
    expect((t1 as { fontSize?: number }).fontSize).toBe((t0 as { fontSize?: number }).fontSize);
    expect(t1.width / Math.max(1, t1.height)).not.toBeCloseTo(t0.width / Math.max(1, t0.height), 2);

    const autoMobile = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
    });
    const mobileTuned = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: widened,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
    });
    const m0 = findDisplayObject(autoMobile.displayPage, "title")!;
    const m1 = findDisplayObject(mobileTuned.displayPage, "title")!;
    expect(m1.width).toBeCloseTo(m0.width, 0);
    expect((m1 as { fontSize?: number }).fontSize).toBe((m0 as { fontSize?: number }).fontSize);

    const original = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: widened,
      referenceIndex: index,
      viewportWidth: 1920,
    });
    const src = fx.page.objects?.find((o) => o.id === "title");
    const orig = findDisplayObject(original.displayPage, "title");
    expect(orig?.x).toBe(src?.x);
    expect(orig?.width).toBe(src?.width);
    expect((orig as { fontSize?: number } | undefined)?.fontSize).toBe(
      (src as { fontSize?: number } | undefined)?.fontSize,
    );
  });

  it("scales text font independently of the box", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const auto = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
    });
    const t0 = findDisplayObject(auto.displayPage, "title")!;
    const scaled = patchItemTune({
      blueprint: fx.blueprint,
      target: { kind: "layer", layerId: "title" },
      band: "tablet",
      patch: { fontScale: 1.2 },
    }).blueprint;
    const after = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: scaled,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
    });
    const t1 = findDisplayObject(after.displayPage, "title")!;
    expect((t1 as { fontSize?: number }).fontSize).toBeCloseTo(
      ((t0 as { fontSize?: number }).fontSize ?? 16) * 1.2,
      0,
    );
    expect(t1.width).toBeCloseTo(t0.width, 0);
  });

  it("does not apply uniform scale to a text box", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const auto = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
    });
    const t0 = findDisplayObject(auto.displayPage, "title")!;
    const scaled = patchItemTune({
      blueprint: fx.blueprint,
      target: { kind: "layer", layerId: "title" },
      band: "tablet",
      patch: { scale: 1.4 },
    }).blueprint;
    const after = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: scaled,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_TABLET_WIDTH,
    });
    const t1 = findDisplayObject(after.displayPage, "title")!;
    expect(t1.width).toBeCloseTo(t0.width, 0);
    expect(t1.height).toBeCloseTo(t0.height, 0);
    expect((t1 as { fontSize?: number }).fontSize).toBe((t0 as { fontSize?: number }).fontSize);
  });

  it("refine geometry chip shows letter percent for text", () => {
    const onItemFontScale = vi.fn();
    render(
      <SiteCreatorRefineControl
        model={{
          band: "tablet",
          kind: "item",
          itemTune: { fontScale: 1.12 },
          containerTune: null,
          mediaTune: null,
          canReorder: false,
          resetLabel: "Restablecer en Tablet",
          showReset: true,
          transformKind: "textBox",
        }}
        handlers={{ onItemFontScale }}
      />,
    );
    expect(screen.getByTestId("site-creator-refine-geometry").textContent).toContain("letra 112%");
    fireEvent.click(screen.getByTestId("site-creator-refine-geometry"));
    expect(screen.getByTestId("site-creator-refine-popover").textContent).toContain("Letra");
    fireEvent.pointerDown(screen.getAllByText("+")[2]!);
    expect(onItemFontScale).toHaveBeenCalled();
  });

  it("resolveItemRef permite layoutGroup (no secciones) y listTransformableItemTargets excluye secciones", () => {
    const fx = fixtureHorizontalCardsGroup();
    expect(
      resolveItemRef({ kind: "blueprintNode", nodeId: fx.groupId }, fx.blueprint),
    ).toEqual({ kind: "blueprintNode", nodeId: fx.groupId });
    expect(
      resolveItemRef({ kind: "blueprintNode", nodeId: fx.sectionId }, fx.blueprint),
    ).toBeNull();
    expect(
      listTransformableItemTargets({
        units: [
          { kind: "blueprintNode", nodeId: fx.sectionId },
          { kind: "blueprintNode", nodeId: fx.groupId },
          { kind: "layer", layerId: "card_a" },
        ],
        blueprint: fx.blueprint,
      }),
    ).toEqual([
      { kind: "blueprintNode", nodeId: fx.groupId },
      { kind: "layer", layerId: "card_a" },
    ]);
  });

  it("reposiciona un layoutGroup entero con shiftX/shiftY en móvil", () => {
    const fx = fixtureHorizontalCardsGroup();
    const index = buildSiteSelectionIndex(fx.page);
    const auto = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
      band: "mobile",
    });
    const a0 = findDisplayObject(auto.displayPage, "card_a")!;
    const b0 = findDisplayObject(auto.displayPage, "card_b")!;
    const shifted = patchItemTune({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.groupId },
      band: "mobile",
      patch: { shiftX: 0.1, shiftY: 0.05 },
    }).blueprint;
    const after = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: shifted,
      referenceIndex: index,
      viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
      band: "mobile",
    });
    const a1 = findDisplayObject(after.displayPage, "card_a")!;
    const b1 = findDisplayObject(after.displayPage, "card_b")!;
    expect(a1.x).toBeGreaterThan(a0.x);
    expect(a1.y).toBeGreaterThan(a0.y);
    expect(b1.x - a1.x).toBeCloseTo(b0.x - a0.x, 0);
    expect(b1.y - a1.y).toBeCloseTo(b0.y - a0.y, 0);
  });
});
