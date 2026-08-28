import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { createSectionFromSelection } from "./site-blueprint-ops";
import { cloneBlueprint } from "./site-blueprint-validate";
import { compilePublishedSite } from "./site-creator-publish-compile";
import { SiteCreatorSectionSpine } from "./SiteCreatorSectionSpine";
import {
  bindSectionScroller,
  compilePublishedScrollScript,
  planScrollStep,
} from "./site-creator-section-scroll-runtime";
import { forwardWorkAreaWheelToScroller } from "./site-creator-viewport";
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

function fireNativePointer(
  target: Window | Document | Element,
  type: string,
  values: { clientY: number; pointerId: number },
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientY: { value: values.clientY },
    pointerId: { value: values.pointerId },
  });
  fireEvent(target, event);
}

async function flushAnimationFrame(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  });
}

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

function threeSectionsBlueprint() {
  const page = makePage([
    makeLayer({ id: "h", type: "rect", x: 0, y: 0, width: 1920, height: 400, fill: "#111" }),
    makeLayer({ id: "b", type: "rect", x: 0, y: 500, width: 1920, height: 400, fill: "#222" }),
    makeLayer({ id: "c", type: "rect", x: 0, y: 1000, width: 1920, height: 280, fill: "#333" }),
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
  const mid = createSectionFromSelection({
    blueprint: hero.blueprint,
    selectedLayerIds: ["b"],
    index,
    committedPage: page,
    sectionType: "generic",
  });
  expect(mid.ok).toBe(true);
  if (!mid.ok || !mid.createdNodeId) throw new Error("mid");
  const last = createSectionFromSelection({
    blueprint: mid.blueprint,
    selectedLayerIds: ["c"],
    index,
    committedPage: page,
    sectionType: "generic",
  });
  expect(last.ok).toBe(true);
  if (!last.ok || !last.createdNodeId) throw new Error("last");
  return {
    page,
    blueprint: last.blueprint,
    heroId: hero.createdNodeId,
    midId: mid.createdNodeId,
    lastId: last.createdNodeId,
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

  it("stores Original, Tablet and Mobile scroll independently", () => {
    const { blueprint, heroId, sectionId } = twoSectionsBlueprint();
    const wide = setSectionScrollHop(blueprint, heroId, sectionId, "snap", "wide");
    const tablet = setSectionScrollHop(wide, heroId, sectionId, "smooth", "tablet");

    expect(resolveSectionScrollHop(tablet, heroId, sectionId, "wide")).toBe("snap");
    expect(resolveSectionScrollHop(tablet, heroId, sectionId, "tablet")).toBe("smooth");
    expect(resolveSectionScrollHop(tablet, heroId, sectionId, "mobile")).toBe("natural");
    expect(tablet.scrollFlow?.hops?.[`${heroId}>${sectionId}`]).toBe("snap");
    expect(tablet.scrollFlow?.byBand?.tablet?.hops?.[`${heroId}>${sectionId}`]).toBe(
      "smooth",
    );

    const restoredTablet = setSectionScrollHop(
      tablet,
      heroId,
      sectionId,
      "natural",
      "tablet",
    );
    expect(resolveSectionScrollHop(restoredTablet, heroId, sectionId, "wide")).toBe("snap");
    expect(resolveSectionScrollHop(restoredTablet, heroId, sectionId, "tablet")).toBe(
      "natural",
    );
    expect(restoredTablet.scrollFlow?.byBand).toBeUndefined();
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
    const withHop = setSectionScrollHop(
      setSectionScrollHop(blueprint, heroId, sectionId, "smooth"),
      heroId,
      sectionId,
      "snap",
      "mobile",
    );
    const cloned = cloneBlueprint(withHop);
    expect(cloned.scrollFlow?.hops?.[`${heroId}>${sectionId}`]).toBe("smooth");
    expect(cloned.scrollFlow?.byBand?.mobile?.hops?.[`${heroId}>${sectionId}`]).toBe(
      "snap",
    );
    cloned.scrollFlow!.hops![`${heroId}>${sectionId}`] = "snap";
    cloned.scrollFlow!.byBand!.mobile!.hops![`${heroId}>${sectionId}`] = "smooth";
    expect(withHop.scrollFlow?.hops?.[`${heroId}>${sectionId}`]).toBe("smooth");
    expect(withHop.scrollFlow?.byBand?.mobile?.hops?.[`${heroId}>${sectionId}`]).toBe(
      "snap",
    );
  });

  it("renders section spine stations and hop menus", () => {
    const { blueprint, heroId, sectionId } = twoSectionsBlueprint();
    const withHop = setSectionScrollHop(blueprint, heroId, sectionId, "snap");
    const hops = listSectionScrollHops(withHop);
    const sections = listDocumentSections(withHop);
    const onSelect = vi.fn();
    const onScroll = vi.fn();
    render(
      <div style={{ position: "relative", height: 1200 }}>
        <SiteCreatorSectionSpine
          pageHeight={1200}
          scale={1}
          stations={sections.map((section, index) => ({
            sectionId: section.id,
            label: section.label,
            top: section.sourceRange.top,
            bottom: section.sourceRange.bottom,
            height: section.sourceRange.bottom - section.sourceRange.top,
            designedHeight: section.sourceRange.bottom - section.sourceRange.top,
            heightMode: "content" as const,
            customHeight: null,
            selected: section.id === heroId,
            outgoing: hops[index + 1]
              ? {
                  fromId: section.id,
                  toId: sections[index + 1]!.id,
                  kind: hops[index + 1]!.kind,
                }
              : null,
          }))}
          addSectionY={null}
          canAddSection={false}
          onSelectSection={onSelect}
          onRemoveSection={() => undefined}
          onAddSection={() => undefined}
          onScrollChange={onScroll}
          onHeightModeChange={() => undefined}
          onCustomHeightChange={() => undefined}
        />
      </div>,
    );
    expect(screen.getByTestId("site-creator-section-spine")).toBeTruthy();
    expect(
      screen.getByTestId(`site-creator-section-spine-station-${heroId}`).contains(
        screen.getByTestId(`site-creator-section-spine-hop-${heroId}-${sectionId}`),
      ),
    ).toBe(true);
    expect(
      screen.getAllByTestId(/site-creator-section-spine-drag-/),
    ).toHaveLength(sections.length);
    fireEvent.click(screen.getByLabelText(sections.find((s) => s.id === sectionId)!.label));
    expect(onSelect).toHaveBeenCalledWith(sectionId);
    fireEvent.click(screen.getByTestId(`site-creator-section-spine-hop-${heroId}-${sectionId}`));
    expect(screen.getByRole("presentation").className).toContain("pointer-events-auto");
    fireEvent.click(screen.getByTestId(`site-creator-section-spine-hop-${heroId}-${sectionId}-smooth`));
    expect(onScroll).toHaveBeenCalledWith(heroId, sectionId, "smooth");
    expect(
      screen.queryByTestId(`site-creator-section-spine-hop-${sectionId}-${heroId}`),
    ).toBeNull();
  });

  it("Original structure spine uses a marker ball without height or scroll chips", () => {
    const { blueprint, heroId, sectionId } = twoSectionsBlueprint();
    const hops = listSectionScrollHops(blueprint);
    const sections = listDocumentSections(blueprint);
    const onSelect = vi.fn();
    const onCustom = vi.fn();
    render(
      <div style={{ position: "relative", height: 1200 }}>
        <SiteCreatorSectionSpine
          pageHeight={1200}
          scale={1}
          mode="structure"
          stations={sections.map((section, index) => ({
            sectionId: section.id,
            label: section.label,
            top: section.sourceRange.top,
            bottom: section.sourceRange.bottom,
            height: section.sourceRange.bottom - section.sourceRange.top,
            designedHeight: section.sourceRange.bottom - section.sourceRange.top,
            heightMode: "content" as const,
            customHeight: null,
            selected: section.id === heroId,
            outgoing: hops[index + 1]
              ? {
                  fromId: section.id,
                  toId: sections[index + 1]!.id,
                  kind: hops[index + 1]!.kind,
                }
              : null,
          }))}
          addSectionY={null}
          canAddSection={false}
          onSelectSection={onSelect}
          onRemoveSection={() => undefined}
          onAddSection={() => undefined}
          onScrollChange={() => undefined}
          onHeightModeChange={() => undefined}
          onCustomHeightChange={onCustom}
        />
      </div>,
    );
    expect(screen.getByTestId("site-creator-section-spine").getAttribute("data-spine-mode")).toBe(
      "structure",
    );
    expect(screen.queryByTestId(`site-creator-section-spine-height-${heroId}`)).toBeNull();
    expect(screen.queryByTestId(`site-creator-section-spine-hop-${heroId}-${sectionId}`)).toBeNull();
    const mark = screen.getByTestId(`site-creator-section-spine-drag-${heroId}`);
    expect(mark.className).toContain("rounded-full");
    expect(mark.className).not.toContain("cursor-ns-resize");
    fireEvent.click(mark);
    expect(onSelect).toHaveBeenCalledWith(heroId);
    fireEvent.pointerDown(mark, { clientY: 400, pointerId: 1 });
    fireNativePointer(window, "pointermove", { clientY: 520, pointerId: 1 });
    fireNativePointer(window, "pointerup", { clientY: 520, pointerId: 1 });
    expect(onCustom).not.toHaveBeenCalled();
  });

  it("offers Custom in the height menu", () => {
    const { blueprint, heroId } = twoSectionsBlueprint();
    const hops = listSectionScrollHops(blueprint);
    const sections = listDocumentSections(blueprint);
    const onHeight = vi.fn();
    render(
      <div style={{ position: "relative", height: 1200 }}>
        <SiteCreatorSectionSpine
          pageHeight={1200}
          scale={1}
          stations={sections.map((section, index) => ({
            sectionId: section.id,
            label: section.label,
            top: section.sourceRange.top,
            bottom: section.sourceRange.bottom,
            height: section.sourceRange.bottom - section.sourceRange.top,
            designedHeight: section.sourceRange.bottom - section.sourceRange.top,
            heightMode: "content" as const,
            customHeight: null,
            selected: section.id === heroId,
            outgoing: hops[index + 1]
              ? {
                  fromId: section.id,
                  toId: sections[index + 1]!.id,
                  kind: hops[index + 1]!.kind,
                }
              : null,
          }))}
          addSectionY={null}
          canAddSection={false}
          onSelectSection={() => undefined}
          onRemoveSection={() => undefined}
          onAddSection={() => undefined}
          onScrollChange={() => undefined}
          onHeightModeChange={onHeight}
          onCustomHeightChange={() => undefined}
        />
      </div>,
    );
    fireEvent.click(screen.getByTestId(`site-creator-section-spine-height-${heroId}`));
    expect(
      screen.getByTestId(`site-creator-section-spine-height-${heroId}-custom`),
    ).toBeTruthy();
    fireEvent.scroll(window);
    expect(
      screen.queryByTestId(`site-creator-section-spine-height-${heroId}-custom`),
    ).toBeNull();
    fireEvent.click(screen.getByTestId(`site-creator-section-spine-height-${heroId}`));
    fireEvent.click(screen.getByTestId(`site-creator-section-spine-height-${heroId}-custom`));
    expect(onHeight).toHaveBeenCalledWith(heroId, "custom");
  });

  it("keeps the drag scale stable while custom height rerenders the preview", async () => {
    const { blueprint, heroId } = twoSectionsBlueprint();
    const hero = listDocumentSections(blueprint)[0]!;
    const onCustomHeightChange = vi.fn();
    const station = {
      sectionId: heroId,
      label: hero.label,
      top: hero.sourceRange.top,
      bottom: hero.sourceRange.bottom,
      height: 400,
      designedHeight: 400,
      heightMode: "custom" as const,
      customHeight: 400,
      selected: true,
      outgoing: null,
    };
    const commonProps = {
      pageHeight: 1200,
      stations: [station],
      addSectionY: null,
      canAddSection: false,
      onSelectSection: () => undefined,
      onRemoveSection: () => undefined,
      onAddSection: () => undefined,
      onScrollChange: () => undefined,
      onHeightModeChange: () => undefined,
      onCustomHeightChange,
    };
    const { rerender } = render(
      <SiteCreatorSectionSpine {...commonProps} scale={1} />,
    );
    const handle = screen.getByTestId(
      `site-creator-section-spine-drag-${heroId}`,
    );
    const centerControls = screen.getByTestId(
      `site-creator-section-spine-station-${heroId}`,
    );
    const boundaryControls = screen.getByTestId(
      `site-creator-section-spine-boundary-${heroId}`,
    );

    expect(centerControls.style.top).toBe("200px");
    expect(boundaryControls.style.top).toBe("400px");
    expect(centerControls.className).toContain("right-[32px]");
    expect(boundaryControls.className).toContain("right-[10px]");
    expect(
      centerControls.contains(
        screen.getByTestId(`site-creator-section-spine-height-${heroId}`),
      ),
    ).toBe(true);
    expect(boundaryControls.contains(handle)).toBe(true);

    fireNativePointer(handle, "pointerdown", { clientY: 100, pointerId: 7 });
    rerender(<SiteCreatorSectionSpine {...commonProps} scale={0.5} />);
    fireNativePointer(window, "pointermove", { clientY: 200, pointerId: 7 });
    fireNativePointer(window, "pointermove", { clientY: 200, pointerId: 7 });
    await flushAnimationFrame();

    expect(onCustomHeightChange).toHaveBeenCalledTimes(1);
    expect(onCustomHeightChange).toHaveBeenLastCalledWith(heroId, 500);
    expect(
      screen.getByTestId(`site-creator-section-spine-station-${heroId}`).style.top,
    ).toBe("125px");
    expect(
      screen.getByTestId(`site-creator-section-spine-boundary-${heroId}`).style.top,
    ).toBe("250px");
    fireNativePointer(window, "pointerup", { clientY: 200, pointerId: 7 });
  });

  it("marks Toda la página after the controlled mode changes", () => {
    const { blueprint, heroId } = twoSectionsBlueprint();
    const hero = listDocumentSections(blueprint)[0]!;
    const onHeight = vi.fn();
    const station = {
      sectionId: hero.id,
      label: hero.label,
      top: hero.sourceRange.top,
      bottom: hero.sourceRange.bottom,
      height: hero.sourceRange.bottom - hero.sourceRange.top,
      designedHeight: hero.sourceRange.bottom - hero.sourceRange.top,
      customHeight: null,
      selected: true,
      outgoing: null,
    };
    const commonProps = {
      pageHeight: 1200,
      scale: 1,
      addSectionY: null,
      canAddSection: false,
      onSelectSection: () => undefined,
      onRemoveSection: () => undefined,
      onAddSection: () => undefined,
      onScrollChange: () => undefined,
      onHeightModeChange: onHeight,
      onCustomHeightChange: () => undefined,
    } as const;
    const { rerender } = render(
      <SiteCreatorSectionSpine
        {...commonProps}
        stations={[{ ...station, heightMode: "custom" as const, customHeight: 900 }]}
      />,
    );

    fireEvent.click(screen.getByTestId(`site-creator-section-spine-height-${heroId}`));
    fireEvent.click(screen.getByTestId(`site-creator-section-spine-height-${heroId}-viewport`));
    expect(onHeight).toHaveBeenCalledWith(heroId, "viewport");

    rerender(
      <SiteCreatorSectionSpine
        {...commonProps}
        stations={[{ ...station, heightMode: "viewport" as const, height: 1080 }]}
      />,
    );
    expect(screen.getByTestId(`site-creator-section-spine-height-${heroId}`).getAttribute("aria-label")).toBe(
      "Alto: Toda la página",
    );
    fireEvent.click(screen.getByTestId(`site-creator-section-spine-height-${heroId}`));
    expect(
      screen.getByTestId(`site-creator-section-spine-height-${heroId}-viewport`).getAttribute(
        "aria-selected",
      ),
    ).toBe("true");
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
    expect(compiled.html).toContain("s-sec-last");
    expect(compiled.html).not.toMatch(/s-sec-last[^"]*s-snap/);
    expect(compiled.html).not.toMatch(/s-snap-[^"]*s-sec-last/);
    expect(compiled.css).toContain("scroll-behavior:smooth");
    expect(compiled.css).toContain("scroll-snap-type:y proximity");
    expect(compiled.css).toContain("scroll-snap-align:start");
    expect(compiled.css).toContain(".s-sec-last{scroll-snap-align:none;scroll-snap-stop:normal}");
    expect(compiled.js).toContain("scrollTo");
    expect(compiled.js).toContain('"kind":"snap"');
    expect(compiled.js).not.toMatch(/foldder/i);
  });

  it("keeps snap on middle sections and never on the last one", () => {
    const { page, blueprint, heroId, midId, lastId } = threeSectionsBlueprint();
    const compiled = compilePublishedSite({
      page,
      blueprint: setSectionScrollHop(
        setSectionScrollHop(blueprint, heroId, midId, "snap"),
        midId,
        lastId,
        "snap",
      ),
      title: "Última corta",
      imageHrefByLayerId: {},
    });
    expect(compiled.html).toContain("s-snap-wide");
    expect(compiled.html).toContain("s-sec-last");
    expect(compiled.html).not.toMatch(/s-sec-last[^"]*s-snap/);
    expect(compiled.html).not.toMatch(/s-snap-[^"]*s-sec-last/);
    expect(compiled.css).not.toContain("padding-bottom:max(0px,100dvh");
    expect(compiled.css).toContain(".s-sec-last{scroll-snap-align:none;scroll-snap-stop:normal}");
  });

  it("publishes a different scroll flow for each responsive band", () => {
    const { page, blueprint, heroId, sectionId } = twoSectionsBlueprint();
    const perBand = setSectionScrollHop(
      setSectionScrollHop(blueprint, heroId, sectionId, "snap", "wide"),
      heroId,
      sectionId,
      "smooth",
      "tablet",
    );
    const compiled = compilePublishedSite({
      page,
      blueprint: perBand,
      title: "Recorrido responsive",
      imageHrefByLayerId: {},
    });

    expect(compiled.html).toContain("s-sec-last");
    expect(compiled.html).not.toContain("s-snap-wide");
    expect(compiled.html).not.toContain("s-snap-tablet");
    expect(compiled.html).not.toContain("s-snap-mobile");
    expect(compiled.css).toContain(".s-sec-anchor.s-snap-wide");
    expect(compiled.css).toContain(".s-sec-last{scroll-snap-align:none;scroll-snap-stop:normal}");
    expect(compiled.js).toContain(`"wide":[`);
    expect(compiled.js).toContain(`"tablet":[`);
    expect(compiled.js).toContain(`"mobile":[`);
    expect(compiled.js).toContain("function activeHops()");
    expect(compiled.js).toContain("lockedDirection");
    expect(compiled.js).not.toContain("y > current.y + 16");
  });

  it("emits intercept script when a hop is suave", () => {
    const { page, blueprint, heroId, sectionId } = twoSectionsBlueprint();
    const compiled = compilePublishedSite({
      page,
      blueprint: setSectionScrollHop(blueprint, heroId, sectionId, "smooth"),
      title: "Suave",
      imageHrefByLayerId: {},
    });
    expect(compiled.js).toContain("scrollTo");
    expect(compiled.js).toContain(`"kind":"smooth"`);
    expect(compiled.js).toContain(heroId);
    expect(compiled.js).toContain(sectionId);
    expect(compiled.js).toContain("scrollHeight");
    expect(compiled.css).not.toContain("padding-bottom:max(0px,100dvh");
    expect(compiled.css).not.toContain("padding-bottom:100vh");
    expect(compiled.js).toContain("visualViewport");
    expect(compiled.js).not.toMatch(/foldder/i);
  });

  it("does not lengthen the published page so Suave can dock the last section", () => {
    const { page, blueprint, heroId, sectionId } = twoSectionsBlueprint();
    const compiled = compilePublishedSite({
      page,
      blueprint: setSectionScrollHop(blueprint, heroId, sectionId, "smooth"),
      title: "Sin pad",
      imageHrefByLayerId: {},
    });
    expect(compiled.css).not.toContain("padding-bottom:max(0px,100dvh");
    expect(compiled.css).not.toContain("padding-bottom:100vh");
    expect(compiled.html).toContain("s-sec-last");
    expect(compiled.html).not.toMatch(/s-sec-last[^"]*s-snap/);
    expect(compiled.js).toContain("Math.min(next.y, limit)");
  });

  it("leaves published js empty when every hop is natural", () => {
    const hops = listSectionScrollHops(twoSectionsBlueprint().blueprint);
    expect(compilePublishedScrollScript(hops)).toBe('"use strict";\n');
  });
});

describe("planScrollStep", () => {
  const stations = [
    { id: "hero", y: 0 },
    { id: "products", y: 900 },
    { id: "contact", y: 1700 },
  ];
  const hops = [
    { fromId: "hero", toId: "products", kind: "smooth" as const },
    { fromId: "products", toId: "contact", kind: "natural" as const },
  ];

  it("animates down to the next section when the hop is suave", () => {
    expect(
      planScrollStep({ stations, hops, scrollY: 0, direction: 1 }),
    ).toEqual({
      kind: "smooth",
      toId: "products",
      targetY: 900,
    });
  });

  it("does not intercept wheel when the next hop is natural", () => {
    expect(planScrollStep({ stations, hops, scrollY: 900, direction: 1 })).toBeNull();
  });

  it("moves directly to the previous section when scrolling up from mid-section", () => {
    expect(
      planScrollStep({ stations, hops, scrollY: 1200, direction: -1 }),
    ).toEqual({
      kind: "smooth",
      toId: "hero",
      targetY: 0,
    });
  });

  it("jumps instantly when the hop is ancla", () => {
    const snapHops = [{ fromId: "hero", toId: "products", kind: "snap" as const }];
    expect(
      planScrollStep({ stations, hops: snapHops, scrollY: 0, direction: 1 }),
    ).toEqual({
      kind: "snap",
      toId: "products",
      targetY: 900,
    });
  });
});

describe("bindSectionScroller", () => {
  function mockScrollerOverflow(
    scroller: HTMLElement,
    scrollHeight: number,
    clientHeight: number,
  ): void {
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: scrollHeight });
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: clientHeight });
  }

  it("releases a smooth-scroll lock when the user reverses direction", () => {
    const scroller = document.createElement("div");
    mockScrollerOverflow(scroller, 1800, 800);
    const scrollTo = vi.fn(({ top }: ScrollToOptions) => {
      scroller.scrollTop = Number(top ?? 0);
    });
    Object.defineProperty(scroller, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    const dispose = bindSectionScroller({
      scroller,
      stations: () => [
        { id: "hero", y: 0 },
        { id: "products", y: 900 },
      ],
      hops: [{ fromId: "hero", toId: "products", kind: "smooth" }],
    });

    const down = new WheelEvent("wheel", { deltaY: 120, cancelable: true });
    scroller.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({ top: 900, behavior: "smooth" });

    scroller.scrollTop = 450;
    const up = new WheelEvent("wheel", { deltaY: -120, cancelable: true });
    scroller.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(false);

    dispose();
  });

  it("lets Suave intercept a forwarded work-area wheel without binding keys", () => {
    const scroller = document.createElement("div");
    mockScrollerOverflow(scroller, 1800, 800);
    const scrollTo = vi.fn(({ top }: ScrollToOptions) => {
      scroller.scrollTop = Number(top ?? 0);
    });
    Object.defineProperty(scroller, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    const dispose = bindSectionScroller({
      scroller,
      bindKeyboard: false,
      stations: () => [
        { id: "hero", y: 0 },
        { id: "products", y: 900 },
      ],
      hops: [{ fromId: "hero", toId: "products", kind: "smooth" }],
    });

    forwardWorkAreaWheelToScroller(scroller, { deltaX: 0, deltaY: 120 });
    expect(scrollTo).toHaveBeenCalledWith({ top: 900, behavior: "smooth" });

    const key = new KeyboardEvent("keydown", { key: "ArrowDown", cancelable: true, bubbles: true });
    window.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
    expect(scrollTo).toHaveBeenCalledTimes(1);

    dispose();
  });

  it("does not intercept wheel when the page already fits the device", () => {
    const scroller = document.createElement("div");
    mockScrollerOverflow(scroller, 1080, 1080);
    const scrollTo = vi.fn();
    Object.defineProperty(scroller, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    const dispose = bindSectionScroller({
      scroller,
      stations: () => [
        { id: "hero", y: 0 },
        { id: "products", y: 400 },
      ],
      hops: [{ fromId: "hero", toId: "products", kind: "smooth" }],
    });

    const down = new WheelEvent("wheel", { deltaY: 120, cancelable: true });
    scroller.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();

    dispose();
  });

  it("stops at the real page end instead of inventing extra length", () => {
    const scroller = document.createElement("div");
    mockScrollerOverflow(scroller, 1000, 800);
    const scrollTo = vi.fn(({ top }: ScrollToOptions) => {
      scroller.scrollTop = Number(top ?? 0);
    });
    Object.defineProperty(scroller, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    const dispose = bindSectionScroller({
      scroller,
      stations: () => [
        { id: "hero", y: 0 },
        { id: "products", y: 900 },
      ],
      hops: [{ fromId: "hero", toId: "products", kind: "smooth" }],
    });

    const down = new WheelEvent("wheel", { deltaY: 120, cancelable: true });
    scroller.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({ top: 200, behavior: "smooth" });

    dispose();
  });

  it("plans the last hop to the page end when the last section is shorter than the screen", () => {
    expect(
      planScrollStep({
        stations: [
          { id: "hero", y: 0 },
          { id: "products", y: 900 },
        ],
        hops: [{ fromId: "hero", toId: "products", kind: "smooth" }],
        scrollY: 0,
        direction: 1,
        maxScrollTop: 200,
      }),
    ).toEqual({
      kind: "smooth",
      toId: "products",
      targetY: 200,
    });
  });
});
