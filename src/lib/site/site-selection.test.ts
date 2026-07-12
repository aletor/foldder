import { describe, expect, it } from "vitest";
import { createFactorySection } from "./site-presets";
import {
  getBlockHumanLabel,
  getContextToolbarActions,
  getSelectionCapabilities,
  getSelectableBlockIds,
  resolveSiteSelection,
} from "./site-selection";

describe("site-selection", () => {
  it("resolves section-level selection without block controls", () => {
    const section = createFactorySection("hero");
    const ctx = resolveSiteSelection(
      section,
      { sectionId: section.id, blockId: null, kind: "section" },
      { [section.id]: "Hero" },
    );
    expect(ctx?.kind).toBe("section");
    expect(ctx?.capabilities.toolbarProfile).toBe("section");
    expect(getContextToolbarActions(ctx!.capabilities)).not.toContain("type");
    expect(getContextToolbarActions(ctx!.capabilities)).not.toContain("alignment");
  });

  it("resolves headline block separately from body in hero", () => {
    const section = createFactorySection("hero");
    const body = section.children?.[0];
    expect(body?.type).toBe("text");

    const headline = resolveSiteSelection(
      section,
      { sectionId: section.id, blockId: section.id, kind: "block" },
      { [section.id]: "Hero" },
    );
    const bodySel = resolveSiteSelection(
      section,
      { sectionId: section.id, blockId: body!.id, kind: "block" },
      { [section.id]: "Hero" },
    );

    expect(headline?.humanLabel).toBe("Titular");
    expect(bodySel?.humanLabel).toBe("Texto descriptivo");
    expect(headline?.capabilities.toolbarProfile).toBe("text");
    expect(bodySel?.capabilities.toolbarProfile).toBe("text");
    expect(headline?.blockId).not.toBe(bodySel?.blockId);
  });

  it("builds breadcrumb Hero / Texto descriptivo for body block", () => {
    const section = createFactorySection("hero");
    const body = section.children![0]!;
    const ctx = resolveSiteSelection(
      section,
      { sectionId: section.id, blockId: body.id, kind: "block" },
      { [section.id]: "Hero" },
    );
    expect(ctx?.breadcrumb.map((item) => item.label)).toEqual(["Hero", "Texto descriptivo"]);
  });

  it("lists stable selectable block ids for hero preset", () => {
    const section = createFactorySection("hero");
    const ids = getSelectableBlockIds(section);
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBe(section.id);
    expect(ids[1]).toBe(section.children?.[0]?.id);
    expect(ids[2]).toBe(section.children?.[1]?.id);
  });

  it("labels primary button in hero", () => {
    const section = createFactorySection("hero");
    const button = section.children?.find((child) => child.type === "button");
    expect(button).toBeTruthy();
    const label = getBlockHumanLabel(button!, {
      isSectionRoot: false,
      siblingIndex: 2,
      sectionLabel: "Hero",
      buttonsBefore: 0,
    });
    expect(label).toBe("Botón principal");
  });

  it("media profile excludes text alignment actions", () => {
    const section = createFactorySection("gallery");
    const caps = getSelectionCapabilities({
      kind: "block",
      sectionId: section.id,
      blockId: section.id,
      section,
      block: section,
      sectionLabel: "Galería",
      isSectionRootBlock: true,
      humanLabel: "Collection",
      breadcrumb: [],
      capabilities: null as never,
    });
    expect(caps.toolbarProfile).toBe("collection");
    expect(getContextToolbarActions(caps)).not.toContain("alignment");
  });
});
