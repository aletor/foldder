import { describe, expect, it } from "vitest";
import { createDemoTextMediaSection } from "./site-presets";
import { createEmptySiteProject } from "./site-defaults";
import { getActiveSitePage } from "./site-project";
import { computeSiteSnapshotHash } from "./site-publish-hash";
import { sitePublishSlug } from "./site-publish-slug";

describe("site-publish", () => {
  it("derives slug from seo title", () => {
    const project = createEmptySiteProject();
    getActiveSitePage(project).seo.title = "Mi Marca Studio";
    expect(sitePublishSlug(project)).toBe("mi-marca-studio");
  });

  it("computes stable snapshot hash", async () => {
    const section = createDemoTextMediaSection();
    const base = createEmptySiteProject();
    const project = {
      ...base,
      pages: [
        {
          ...getActiveSitePage(base),
          sections: [section],
          seo: { title: "Demo", description: "Test" },
        },
      ],
    };
    const first = await computeSiteSnapshotHash(project);
    const second = await computeSiteSnapshotHash(project);
    expect(first).toHaveLength(64);
    expect(first).toBe(second);
  });
});
