import { describe, expect, it } from "vitest";
import { createDemoBrandKitFixture } from "@/lib/brandkit/brand-kit-defaults";
import { resolveSiteAdnFromBrandKit } from "./site-adn";
import { createSiteId } from "./site-defaults";
import { createDemoTextMediaSection } from "./site-presets";
import { buildSiteSrcDoc, renderSiteProject } from "./site-render";
import { compileSiteTheme } from "./site-theme";
import type { SiteProject } from "./site-types";

function demoProject(): SiteProject {
  const section = createDemoTextMediaSection();
  const pageId = createSiteId();
  return {
    id: createSiteId(),
    slug: "demo",
    pages: [
      {
        id: pageId,
        sections: [section],
        nav: { enabled: true, include: [section.id] },
        seo: { title: "Demo Site", description: "Renderer F0" },
      },
    ],
    activePageId: pageId,
    theme: {
      base: "neutral",
      dials: { rhythm: "normal", radius: "soft", polarity: "light", motionIntensity: 1 },
      finishPreset: "editorial",
      motionDNA: "soft",
      respectReducedMotion: true,
    },
    locales: ["es"],
    previewLocale: "es",
    autoGraphSync: true,
    publish: { status: "draft" },
    ledger: [],
  };
}

describe("site-theme", () => {
  it("compiles neutral theme variables", () => {
    const compiled = compileSiteTheme(demoProject().theme);
    expect(compiled.polarity).toBe("light");
    expect(compiled.variables["--c-bg"]).toBe("#f5f4f1");
    expect(compiled.variables["--f-display"]).toContain("Helvetica");
    expect(compiled.variables["--space-unit"]).toBe("1rem");
    expect(compiled.variables["--radius"]).toBe("8px");
    expect(compiled.variables["--motion-curve"]).toContain("cubic-bezier");
  });
});

describe("site-render", () => {
  it("renders semantic text + media section", () => {
    const output = renderSiteProject(demoProject());
    expect(output.html).toContain("<main");
    expect(output.html).toContain("<section");
    expect(output.html).toContain("<h1");
    expect(output.html).toContain("<figure");
    expect(output.html).toContain("Foldder Site");
    expect(output.css).toContain("--c-bg");
    expect(output.css).toContain("--space-unit");
    expect(output.js).toBe("");
  });

  it("builds a full srcDoc document for iframe preview", () => {
    const srcDoc = buildSiteSrcDoc(demoProject());
    expect(srcDoc).toContain("<!DOCTYPE html>");
    expect(srcDoc).toContain('<html lang="es">');
    expect(srcDoc).toContain("<header");
    expect(srcDoc).toContain("<nav");
    expect(srcDoc).toContain("site-section");
  });

  it("injects editor selection script in studio preview mode", () => {
    const srcDoc = buildSiteSrcDoc(demoProject(), { editorMode: true });
    expect(srcDoc).toContain("foldder-site-section-select");
    expect(srcDoc).toContain("data-section-id");
  });

  it("applies brandKit ADN tokens in css output", () => {
    const adn = resolveSiteAdnFromBrandKit(createDemoBrandKitFixture());
    const output = renderSiteProject(demoProject(), { adn });
    expect(output.css).toContain(adn.brandTheme.vars["--brand-surface-page"]);
    expect(output.css).toContain(adn.brandTheme.vars["--brand-font-display"]);
  });

  it("renders collection carousel markup", () => {
    const project = demoProject();
    const section = project.pages[0]!.sections[0]!;
    section.type = "collection";
    section.content = {
      view: "carousel",
      itemTemplate: {
        id: "tpl",
        type: "media",
        source: { kind: "manual" },
        content: {
          mediaType: "image",
          src: "",
          ratio: "1:1",
          fit: "cover",
          duotone: false,
        },
        layout: {},
        motion: { mode: "inherit" },
      },
      items: [{ src: "https://example.com/a.jpg" }],
      overflow: "grow",
      viewOptions: { snap: true, autoplay: false, peek: true, controls: "dots" },
    };
    const output = renderSiteProject(project);
    expect(output.html).toContain('data-view="carousel"');
    expect(output.html).toContain("site-collection__carousel-track");
  });
});
