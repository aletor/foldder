/**
 * 6B hotfix — matriz uniforme, conservación de capas, popover sin click-through.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { resetSiteBlueprintIdSeqForTests } from "./site-blueprint-ids";
import {
  SiteCreatorAdaptationControl,
  adaptationButtonLabel,
} from "./SiteCreatorAdaptationControl";
import {
  assertResolvedLayerConservation,
  collectVisibleLayerIdsFromPage,
  expectAabbProportional,
  uniformScaleMatrix,
} from "./site-creator-responsive-matrix";
import { makeLayer, makePage } from "./site-creator-responsive-fixtures";
import { createEmptySiteBlueprintV1 } from "./site-creator-types";
import {
  classifyLayoutGroupKind,
  classifyPageResponsiveKind,
} from "./site-creator-responsive-target-kind";
import {
  findDisplayObject,
  resolveSiteCreatorResponsiveDisplay,
} from "./site-creator-responsive";
import {
  fixtureRealEightLayersGrouped,
  fixtureRealEightLayersPage,
} from "./site-creator-responsive-fixtures";
import { modeOptionLabel, setResponsiveOverride } from "./site-creator-responsive-overrides";

describe("6B hotfix matrix preserve", () => {
  beforeEach(() => resetSiteBlueprintIdSeqForTests());

  it("page-unstructured → uniform-preserve en Tablet y Móvil", () => {
    const fx = fixtureRealEightLayersPage();
    const index = buildSiteSelectionIndex(fx.page);
    expect(classifyPageResponsiveKind(fx.blueprint)).toBe("page-unstructured");

    const sourceIds = collectVisibleLayerIdsFromPage(fx.page);
    expect(sourceIds.sort()).toEqual([...fx.layerIds].sort());

    for (const [width, expectedH] of [
      [768, 2027 * (768 / 1920)],
      [390, 2027 * (390 / 1920)],
    ] as const) {
      const result = resolveSiteCreatorResponsiveDisplay({
        page: fx.page,
        blueprint: fx.blueprint,
        referenceIndex: index,
        viewportWidth: width,
      });
      expect(result.strategy).toBe("uniform-preserve");
      expect(result.layout.layoutHeight).toBeCloseTo(expectedH, 1);
      expect(result.resolvedScene).toBeTruthy();
      assertResolvedLayerConservation(sourceIds, result.resolvedScene!);

      const scale = width / 1920;
      for (const id of fx.layerIds) {
        const src = index.byId[id]!.visualBounds;
        const resolved = findDisplayObject(result.displayPage, id)!;
        const resolvedBox = {
          x: resolved.x,
          y: resolved.y,
          width: resolved.width,
          height: resolved.height,
        };
        const entry = index.byId[id]!;
        if (entry.type === "text" || entry.type === "textOnPath") {
          expectAabbProportional({
            source: src,
            resolved: { ...resolvedBox, height: src.height * scale },
            scale,
          });
          expect(resolvedBox.height).toBeGreaterThanOrEqual(src.height * scale - 0.5);
          continue;
        }
        expectAabbProportional({
          source: src,
          resolved: resolvedBox,
          scale,
        });
      }
    }
  });

  it("Original mantiene identidad 1920×2027", () => {
    const fx = fixtureRealEightLayersPage();
    const index = buildSiteSelectionIndex(fx.page);
    const result = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
    });
    expect(result.strategy).toBe("identity");
    expect(result.layout.layoutWidth).toBe(1920);
    expect(result.layout.layoutHeight).toBe(2027);
    expect(result.resolvedScene?.instances.every(
      (i) => JSON.stringify(i.matrix) === JSON.stringify(uniformScaleMatrix(1)),
    )).toBe(true);
  });

  it("grupo 8 capas → composition-group; Auto = preserve proporcional", () => {
    const fx = fixtureRealEightLayersGrouped();
    const index = buildSiteSelectionIndex(fx.page);
    expect(
      classifyLayoutGroupKind({
        blueprint: fx.blueprint,
        groupId: fx.groupId,
        index,
      }),
    ).toBe("composition-group");

    const auto = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: 768,
    });
    const preserve = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: setResponsiveOverride({
        blueprint: fx.blueprint,
        target: { kind: "blueprintNode", nodeId: fx.groupId },
        band: "tablet",
        mode: "preserve",
      }).blueprint,
      referenceIndex: index,
      viewportWidth: 768,
    });

    expect(auto.strategy).toBe("uniform-preserve");
    expect(JSON.stringify(auto.displayPage.objects)).toBe(
      JSON.stringify(preserve.displayPage.objects),
    );
  });

  it("path redondeado (Rect trazo) escala vértices Bézier en Tablet", () => {
    const page = makePage([
      makeLayer({
        id: "white_path_card",
        type: "path",
        x: 483.685,
        y: 172.961,
        width: 952.63,
        height: 606.219,
        fill: "#ffffff",
        name: "Tarjeta blanca (trazo)",
      }),
    ], { w: 1920, h: 2027 });
    const pathObj = page.objects![0] as {
      type: "path";
      points: Array<{ anchor: { x: number; y: number }; handleIn: { x: number; y: number }; handleOut: { x: number; y: number }; cornerRadius?: number }>;
      closed: boolean;
    };
    pathObj.points = [
      { anchor: { x: 483.685, y: 172.961 }, handleIn: { x: 483.685, y: 172.961 }, handleOut: { x: 483.685, y: 172.961 }, cornerRadius: 112.58 },
      { anchor: { x: 1436.315, y: 172.961 }, handleIn: { x: 1436.315, y: 172.961 }, handleOut: { x: 1436.315, y: 172.961 }, cornerRadius: 112.58 },
      { anchor: { x: 1436.315, y: 779.18 }, handleIn: { x: 1436.315, y: 779.18 }, handleOut: { x: 1436.315, y: 779.18 }, cornerRadius: 112.58 },
      { anchor: { x: 483.685, y: 779.18 }, handleIn: { x: 483.685, y: 779.18 }, handleOut: { x: 483.685, y: 779.18 }, cornerRadius: 112.58 },
    ];
    pathObj.closed = true;

    const blueprint = createEmptySiteBlueprintV1();
    const index = buildSiteSelectionIndex(page);
    const scale = 768 / 1920;
    const result = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint,
      referenceIndex: index,
      viewportWidth: 768,
    });
    const resolved = findDisplayObject(result.displayPage, "white_path_card")! as typeof pathObj;
    expect(resolved.points[0]!.anchor.x).toBeCloseTo(483.685 * scale, 1);
    expect(resolved.points[0]!.anchor.y).toBeCloseTo(172.961 * scale, 1);
    expect(resolved.points[1]!.anchor.x).toBeCloseTo(1436.315 * scale, 1);
    expect(resolved.points[0]!.cornerRadius).toBeCloseTo(112.58 * scale, 1);
    expectAabbProportional({
      source: index.byId.white_path_card!.visualBounds,
      resolved: {
        x: resolved.x,
        y: resolved.y,
        width: resolved.width,
        height: resolved.height,
      },
      scale,
    });
  });

  it("Mantener composición (label ES) y click sin atravesar", () => {
    expect(modeOptionLabel("preserve")).toBe("Mantener composición");

    const onSelect = vi.fn();
    render(
      <SiteCreatorAdaptationControl
        model={{
          band: "tablet",
          effective: { mode: "auto", source: "default" },
          buttonLabel: adaptationButtonLabel("auto"),
          target: { kind: "blueprintNode", nodeId: "grp" },
        }}
        onSelectMode={onSelect}
      />,
    );

    fireEvent.click(screen.getByTestId("site-creator-adaptation-trigger"));
    const option = screen.getByTestId("site-creator-adaptation-option-preserve");
    expect(option.textContent).toMatch(/Mantener composición/i);

    fireEvent.pointerDown(option, { bubbles: true, cancelable: true });
    fireEvent.click(option, { bubbles: true, cancelable: true });
    expect(onSelect).toHaveBeenCalledWith("preserve");
    expect(screen.queryByTestId("site-creator-adaptation-popover")).toBeNull();
  });
});
