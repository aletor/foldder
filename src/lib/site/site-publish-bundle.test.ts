import { describe, expect, it } from "vitest";
import { createEmptySiteProject } from "./site-defaults";
import { createFactorySection } from "./site-presets";
import { buildPublishedSiteBundle } from "./site-publish";
import { validateSitePublishSlug } from "./site-publish-slug";

describe("site-publish-slug", () => {
  it("rejects reserved slugs", () => {
    const result = validateSitePublishSlug("api");
    expect(result.ok).toBe(false);
  });

  it("normalizes accents and spaces", () => {
    const result = validateSitePublishSlug("Mi Marca Studio");
    expect(result).toEqual({ ok: true, slug: "mi-marca-studio" });
  });
});

describe("site-publish bundle", () => {
  it("builds html documents for each page", async () => {
    const base = createEmptySiteProject();
    const section = createFactorySection("hero");
    const bundle = await buildPublishedSiteBundle({
      project: {
        ...base,
        slug: "demo-site",
        pages: [{ ...base.pages[0]!, sections: [section] }],
      },
      sectionLabels: { [section.id]: "Hero" },
      locale: "es",
    });
    expect(bundle.documents).toHaveLength(1);
    expect(bundle.documents[0]?.html).toContain("<!DOCTYPE html>");
    expect(bundle.documents[0]?.html).toContain("application/ld+json");
    expect(bundle.snapshotHash).toHaveLength(64);
  });
});
