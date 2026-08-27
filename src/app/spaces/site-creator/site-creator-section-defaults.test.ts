import { describe, expect, it } from "vitest";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { applyNewSectionResponsiveDefaults } from "./site-creator-section-defaults";
import { createSectionFromSelection } from "./site-blueprint-ops";
import { resolveEffectiveResponsiveMode } from "./site-creator-responsive-overrides";
import { resolveContainerTune } from "./site-creator-responsive-tunes";
import { resolveSiteCreatorResponsiveDisplay } from "./site-creator-responsive";
import { createEmptySiteBlueprintV1 } from "./site-creator-types";

function layer(partial: Partial<FreehandObject> & { id: string; type: FreehandObject["type"] }): FreehandObject {
  return {
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    ...partial,
  } as FreehandObject;
}

function page(objects: FreehandObject[]): DesignerPageState {
  return {
    id: "pg",
    format: "web169",
    customWidth: 400,
    customHeight: 300,
    objects,
  };
}

describe("site creator section defaults", () => {
  it("new sections default to Mantener composición without extra padding", () => {
    const committedPage = page([
      layer({ id: "a", type: "rect", x: 20, y: 30, width: 50, height: 40 }),
      layer({ id: "b", type: "rect", x: 90, y: 35, width: 40, height: 30 }),
    ]);
    const index = buildSiteSelectionIndex(committedPage);
    const result = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["a", "b"],
      index,
      committedPage,
      sectionType: "generic",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const blueprint = applyNewSectionResponsiveDefaults(result.blueprint, result.createdNodeId!);
    const sectionId = result.createdNodeId!;
    const target = { kind: "blueprintNode" as const, nodeId: sectionId };

    for (const band of ["monitor", "tablet", "mobile"] as const) {
      expect(resolveEffectiveResponsiveMode({ blueprint, target, band }).mode).toBe(
        "preserve",
      );
      expect(resolveContainerTune(blueprint, target, band)?.padding).toBe(0);
      expect(resolveContainerTune(blueprint, target, band)?.gap).toBe(0);
      expect(resolveContainerTune(blueprint, target, band)?.minHeight).toBe(0);
    }
  });

  it("preserve layout hugs section content without editorial min height", () => {
    const committedPage: DesignerPageState = {
      id: "pg",
      format: "web169",
      customWidth: 1920,
      customHeight: 1080,
      objects: [
        layer({ id: "a", type: "rect", x: 10, y: 10, width: 60, height: 30 }),
      ],
    };
    const index = buildSiteSelectionIndex(committedPage);
    const created = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["a"],
      index,
      committedPage,
      sectionType: "generic",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const blueprint = applyNewSectionResponsiveDefaults(created.blueprint, created.createdNodeId!);

    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committedPage,
      blueprint,
      referenceIndex: index,
      viewportWidth: 768,
    });

    expect(resolved.band).toBe("tablet");
    const region = resolved.resolvedLayout?.regions[0];
    expect(region).toBeTruthy();
    expect(region!.layoutRect.height).toBeLessThanOrEqual(34);
  });
});
