import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { createSectionFromSelection } from "./site-blueprint-ops";
import { cloneBlueprint } from "./site-blueprint-validate";
import { compilePublishedSite } from "./site-creator-publish-compile";
import { SiteCreatorSectionFlowRail } from "./SiteCreatorSectionFlowRail";
import {
  listDocumentSections,
  listSectionScrollHops,
  pruneScrollFlow,
  resolveSectionScrollHop,
  setEntryScrollKind,
  setSectionScrollHop,
} from "./site-creator-section-scroll";
import { createEmptySiteBlueprintV1 } from "./site-creator-types";
import { makeLayer, makePage } from "./site-creator-responsive-fixtures";

function twoSectionsBlueprint() {
  const page = makePage([
    makeLayer({ id: "h", type: "rect", x: 0, y: 0, width: 1920, height: 400, fill: "#111" }),
    makeLayer({ id: "b", type: "rect", x: 0, y: 500, width: 1920, height: 400, fill: "#222" }),
  ]);
  const index = buildSiteSelectionIndex(page);
  const hero = createSectionFromSelection({
    blueprint: createEmptySiteBlueprintV1(),
    selectedLayerIds: ["h"],
    index,
    committedPage: page,
    sectionType: "hero",
  });
  expect(hero.ok).toBe(true);
  if (!hero.ok || !hero.createdNodeId) throw new Error("hero");
  const section = createSectionFromSelection({
    blueprint: hero.blueprint,
    selectedLayerIds: ["b"],
    index,
    committedPage: page,
    sectionType: "generic",
  });
  expect(section.ok).toBe(true);
  if (!section.ok || !section.createdNodeId) throw new Error("section");
  return {
    page,
    blueprint: section.blueprint,
    heroId: hero.createdNodeId,
    sectionId: section.createdNodeId,
  };
}

describe("site-creator section scroll flow", () => {
  it("lists Hero first by document order", () => {
    const { blueprint, heroId, sectionId } = twoSectionsBlueprint();
    expect(listDocumentSections(blueprint).map((s) => s.id)).toEqual([heroId, sectionId]);
  });

  it("stores the hop on the edge, not on the destination section", () => {
    const { blueprint, heroId, sectionId } = twoSectionsBlueprint();
    const next = setSectionScrollHop(blueprint, heroId, sectionId, "snap");
    expect(resolveSectionScrollHop(next, heroId, sectionId)).toBe("snap");
    expect(next.nodes[sectionId]).not.toHaveProperty("scrollKind");
    expect(next.scrollFlow?.hops?.[`${heroId}>${sectionId}`]).toBe("snap");
    expect(setSectionScrollHop(next, heroId, sectionId, "natural").scrollFlow).toBeUndefined();
  });

  it("defaults missing hops to natural and prunes stale keys", () => {
    const { blueprint, heroId, sectionId } = twoSectionsBlueprint();
    const dirty = {
      ...blueprint,
      scrollFlow: { hops: { "gone>away": "snap" as const, [`${heroId}>${sectionId}`]: "smooth" as const } },
    };
    const hops = listSectionScrollHops(dirty);
    expect(hops[0]?.kind).toBe("natural");
    expect(hops[1]?.kind).toBe("smooth");
    const pruned = pruneScrollFlow(dirty);
    expect(pruned.scrollFlow?.hops?.["gone>away"]).toBeUndefined();
    expect(pruned.scrollFlow?.hops?.[`${heroId}>${sectionId}`]).toBe("smooth");
  });

  it("clones scrollFlow with the blueprint", () => {
    const { blueprint, heroId, sectionId } = twoSectionsBlueprint();
    const withHop = setSectionScrollHop(blueprint, heroId, sectionId, "smooth");
    const cloned = cloneBlueprint(withHop);
    expect(cloned.scrollFlow?.hops?.[`${heroId}>${sectionId}`]).toBe("smooth");
    cloned.scrollFlow!.hops![`${heroId}>${sectionId}`] = "snap";
    expect(withHop.scrollFlow?.hops?.[`${heroId}>${sectionId}`]).toBe("smooth");
  });

  it("renders section boxes and hop menus", () => {
    const { blueprint, heroId, sectionId } = twoSectionsBlueprint();
    const onSelect = vi.fn();
    const onHop = vi.fn();
    render(
      <SiteCreatorSectionFlowRail
        blueprint={setSectionScrollHop(blueprint, heroId, sectionId, "snap")}
        selectedNodeId={heroId}
        onSelectSection={onSelect}
        onEntryKindChange={() => undefined}
        onHopKindChange={onHop}
      />,
    );
    expect(screen.getByTestId("site-creator-section-flow")).toBeTruthy();
    fireEvent.click(screen.getByTestId(`site-creator-section-flow-node-${sectionId}`));
    expect(onSelect).toHaveBeenCalledWith(sectionId);
    fireEvent.click(screen.getByTestId(`site-creator-section-flow-hop-${heroId}-${sectionId}`));
    fireEvent.click(screen.getByTestId(`site-creator-section-flow-hop-${heroId}-${sectionId}-smooth`));
    expect(onHop).toHaveBeenCalledWith(heroId, sectionId, "smooth");
  });

  it("emits snap CSS and anchors when a hop is ancla", () => {
    const { page, blueprint, heroId, sectionId } = twoSectionsBlueprint();
    const compiled = compilePublishedSite({
      page,
      blueprint: setSectionScrollHop(setEntryScrollKind(blueprint, "smooth"), heroId, sectionId, "snap"),
      title: "Recorrido",
      imageHrefByLayerId: {},
    });
    expect(compiled.html).toContain('class="s-scroll-smooth s-scroll-snap"');
    expect(compiled.html).toContain(`data-section="${sectionId}"`);
    expect(compiled.html).toContain("s-snap");
    expect(compiled.css).toContain("scroll-behavior:smooth");
    expect(compiled.css).toContain("scroll-snap-type:y proximity");
    expect(compiled.css).toContain("scroll-snap-align:start");
  });
});
