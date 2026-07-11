import { describe, expect, it } from "vitest";
import { createEmptySiteProject } from "./site-defaults";
import { createFactorySection } from "./site-presets";
import { getActiveSitePage, updateActiveSitePage } from "./site-project";
import { resolveSitePublishStatus } from "./site-publish-stale";

describe("site-publish-stale", () => {
  it("marks publish stale when preview content changes", async () => {
    const base = createEmptySiteProject();
    const hero = createFactorySection("hero");
    const published = updateActiveSitePage(base, { sections: [hero] });
    const publishedHash = "abc123";

    const status = await resolveSitePublishStatus({
      project: {
        ...published,
        publish: { status: "published", snapshotHash: publishedHash },
      },
      previewProject: {
        ...published,
        pages: [
          {
            ...getActiveSitePage(published),
            sections: [...getActiveSitePage(published).sections, createFactorySection("footer")],
          },
        ],
      },
    });

    expect(status).toBe("stale");
  });
});
