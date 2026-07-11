import { describe, expect, it } from "vitest";
import {
  computeSiteNodeStatus,
  createEmptySiteProject,
  createNeutralTheme,
  isSiteProjectEmpty,
  normalizeSiteProject,
} from "./site-defaults";
import { createFactorySection } from "./site-presets";

describe("site-defaults", () => {
  it("creates an empty project with neutral theme", () => {
    const project = createEmptySiteProject();
    expect(project.theme.base).toBe("neutral");
    expect(project.locales).toEqual(["es"]);
    expect(isSiteProjectEmpty(project)).toBe(true);
    expect(computeSiteNodeStatus(project)).toBe("empty");
  });

  it("normalizes partial project data", () => {
    const project = normalizeSiteProject({
      id: "p1",
      slug: "demo",
      page: {
        id: "page1",
        sections: [createFactorySection("hero")],
        nav: { enabled: true, include: [] },
        seo: { title: "Demo", description: "" },
      },
      theme: createNeutralTheme(),
      locales: ["es"],
      publish: { status: "draft" },
      ledger: [],
    } as Parameters<typeof normalizeSiteProject>[0]);
    expect(project.pages[0]?.sections).toHaveLength(1);
    expect(computeSiteNodeStatus(project)).toBe("draft");
  });
});
