import { describe, expect, it } from "vitest";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { applyNewSectionResponsiveDefaults } from "./site-creator-section-defaults";
import { createSectionFromSelection } from "./site-blueprint-ops";
import { resolveSiteCreatorResponsiveDisplay } from "./site-creator-responsive";
import { collectSemanticCoverageLayerIds } from "./site-blueprint-ownership";
import { analyzeSectionVisualPresentation } from "./site-creator-responsive-visual";
import { createEmptySiteBlueprintV1 } from "./site-creator-types";

function layer(partial: Partial<FreehandObject> & { id: string; type: FreehandObject["type"] }): FreehandObject {
  return {
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    opacity: 1,
    ...partial,
  } as FreehandObject;
}

function findObject(page: DesignerPageState, id: string): FreehandObject | null {
  const stack = [...(page.objects ?? [])];
  while (stack.length) {
    const obj = stack.pop()!;
    if (obj.id === id) return obj;
    if (obj.type === "groupContainer" || obj.type === "booleanGroup") {
      stack.push(...((obj as { children?: FreehandObject[] }).children ?? []));
    }
  }
  return null;
}

describe("section preserve visibility", () => {
  it("keeps all section layers visible on tablet when one rect is classified as background", () => {
    const committedPage: DesignerPageState = {
      id: "pg",
      format: "web169",
      customWidth: 1920,
      customHeight: 1080,
      objects: [
        layer({
          id: "bg",
          type: "rect",
          x: 0,
          y: 0,
          width: 1920,
          height: 900,
        }),
        layer({ id: "a", type: "rect", x: 120, y: 720, width: 400, height: 60 }),
        layer({ id: "b", type: "rect", x: 120, y: 820, width: 220, height: 56 }),
        layer({ id: "c", type: "rect", x: 120, y: 860, width: 300, height: 40 }),
      ],
    };
    const index = buildSiteSelectionIndex(committedPage);
    const created = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "a", "b", "c"],
      index,
      committedPage,
      sectionType: "generic",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const blueprint = applyNewSectionResponsiveDefaults(created.blueprint, created.createdNodeId!);
    const sectionId = created.createdNodeId!;
    const coverage = collectSemanticCoverageLayerIds(blueprint, sectionId);
    expect(coverage.sort()).toEqual(["a", "b", "bg", "c"]);

    const analysis = analyzeSectionVisualPresentation({ blueprint, sectionId, index });
    expect(analysis?.background.backgroundLayerIds).toContain("bg");

    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committedPage,
      blueprint,
      referenceIndex: index,
      viewportWidth: 768,
    });

    expect(resolved.band).toBe("tablet");
    for (const id of ["a", "b", "c"]) {
      const obj = findObject(resolved.displayPage, id);
      expect(obj, id).toBeTruthy();
      expect(obj!.opacity ?? 1).toBeGreaterThan(0);
      expect(obj!.width).toBeGreaterThan(1);
      expect(obj!.height).toBeGreaterThan(1);
    }

    const clip = resolved.resolvedLayout?.objectClipById;
    for (const id of coverage) {
      const obj = findObject(resolved.displayPage, id)!;
      const c = clip?.[id];
      expect(c, `clip for ${id}`).toBeTruthy();
      expect(obj.y + obj.height).toBeLessThanOrEqual(c!.y + c!.height + 1);
    }
  });
});
