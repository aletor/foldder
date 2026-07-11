import { describe, expect, it } from "vitest";
import { createFactorySection } from "./site-presets";
import {
  findBlockInSection,
  flattenSectionBlocks,
  patchBlockContent,
  updateBlockInSection,
} from "./site-block-tree";
import type { TextContent } from "./site-types";

describe("site-block-tree", () => {
  it("flattens hero section root and children", () => {
    const section = createFactorySection("hero");
    const blocks = flattenSectionBlocks(section);
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks[0]?.id).toBe(section.id);
  });

  it("patches child block content", () => {
    const section = createFactorySection("hero");
    const child = section.children?.[0];
    expect(child).toBeTruthy();

    const next = patchBlockContent(section, child!.id, {
      ...(child!.content as TextContent),
      value: "Nuevo subtítulo",
    });

    const updated = findBlockInSection(next, child!.id);
    expect((updated?.content as TextContent).value).toBe("Nuevo subtítulo");
  });

  it("updates section root via updater", () => {
    const section = createFactorySection("manifesto");
    const next = updateBlockInSection(section, section.id, (block) => ({
      ...block,
      layout: { ...block.layout, bleed: "full" },
    }));
    expect(next.layout.bleed).toBe("full");
  });
});
