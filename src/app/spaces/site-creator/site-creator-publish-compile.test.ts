import { describe, expect, it } from "vitest";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import {
  collectPublishImageRefs,
  compilePublishedSite,
  cssSafeId,
  escapeHtml,
  publishAssetPlaceholder,
} from "./site-creator-publish-compile";
import { applyPublishedAssetHrefs, rewritePublishedHtmlForPublicUrl } from "./site-creator-publish-placeholders";
import { createEmptySiteBlueprintV1, parseSiteCreatorNodeData } from "./site-creator-types";
import { makeLayer, makePage } from "./site-creator-responsive-fixtures";

describe("site-creator-publish-compile", () => {
  it("emits separate html, css and js without Foldder runtime", () => {
    const page = makePage([
      makeLayer({ id: "hero", type: "rect", x: 0, y: 0, width: 1920, height: 400, fill: "#112233" }),
      makeLayer({
        id: "title",
        type: "text",
        x: 80,
        y: 120,
        width: 800,
        height: 80,
        text: "Hola <mundo>",
      }),
    ]);
    const compiled = compilePublishedSite({
      page,
      blueprint: createEmptySiteBlueprintV1(),
      title: "Landing",
      imageHrefByLayerId: {},
    });

    expect(compiled.html).toContain("<!DOCTYPE html>");
    expect(compiled.html).toContain('href="styles.css"');
    expect(compiled.html).toContain('src="script.js"');
    expect(compiled.html).toContain("Hola &lt;mundo&gt;");
    expect(compiled.html.toLowerCase()).not.toContain("foldder");
    expect(compiled.css.toLowerCase()).not.toContain("foldder");
    expect(compiled.js.toLowerCase()).not.toContain("foldder");
    expect(compiled.css).toContain(".s-page{");
    expect(compiled.css).toContain("@media (max-width:767px)");
    expect(compiled.css).toContain("@media (max-width:1024px) and (min-width:768px)");
    expect(compiled.css).not.toContain("max-width:1919px");
    expect(compiled.css).toContain(".s-el-hero{");
    expect(compiled.css).toContain(".s-el-title{");
  });

  it("uses relative asset paths instead of session URLs", () => {
    const page = makePage([
      makeLayer({
        id: "photo",
        type: "image",
        x: 0,
        y: 0,
        width: 400,
        height: 300,
        src: "https://example.invalid/expires?X-Amz-Expires=3600",
      }),
    ]);
    const compiled = compilePublishedSite({
      page,
      blueprint: createEmptySiteBlueprintV1(),
      title: "Foto",
      imageHrefByLayerId: { photo: "assets/img-abc.webp" },
    });
    expect(compiled.html).toContain('src="assets/img-abc.webp"');
    expect(compiled.html).not.toContain("X-Amz-Expires");
    expect(compiled.html).not.toContain("example.invalid");
  });

  it("uses replaceable asset placeholders when compiling for publish", () => {
    const page = makePage([
      makeLayer({
        id: "photo",
        type: "image",
        x: 0,
        y: 0,
        width: 400,
        height: 300,
        src: "https://cdn.example/x",
      }),
    ]);
    const placeholder = publishAssetPlaceholder("photo");
    const compiled = compilePublishedSite({
      page,
      blueprint: createEmptySiteBlueprintV1(),
      title: "Foto",
      imageHrefByLayerId: { photo: placeholder },
    });
    expect(compiled.html).toContain(`src="${placeholder}"`);
    expect(applyPublishedAssetHrefs(compiled.html, { photo: "assets/img-hash.webp" })).toContain(
      'src="assets/img-hash.webp"',
    );
  });

  it("rewrites hosted html so css and js resolve under /s/{id}/", () => {
    const html = `<!DOCTYPE html><html><head>
  <link rel="stylesheet" href="styles.css">
</head><body>
  <script src="script.js"></script>
</body></html>`;
    const siteId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const rewritten = rewritePublishedHtmlForPublicUrl(html, siteId);
    expect(rewritten).toContain(`<base href="/s/${siteId}/">`);
    expect(rewritten).toContain(`href="/s/${siteId}/styles.css"`);
    expect(rewritten).toContain(`src="/s/${siteId}/script.js"`);
  });

  it("collects s3 keys and skips empty data URLs", () => {
    const page = makePage([
      makeLayer({ id: "empty", type: "image", src: "data:," }),
      {
        ...makeLayer({ id: "kept", type: "image" }),
        s3Key: "knowledge-files/project-media/a.png",
        src: "https://cdn.example/presigned",
      } as ReturnType<typeof makeLayer>,
    ]);
    const refs = collectPublishImageRefs(page);
    expect(refs.some((ref) => ref.layerId === "empty")).toBe(false);
    expect(refs).toEqual([
      {
        layerId: "kept",
        s3Key: "knowledge-files/project-media/a.png",
        src: "https://cdn.example/presigned",
        alreadyOptimized: false,
      },
    ]);
  });

  it("marks s3KeyOpt refs as already optimized", () => {
    const page = makePage([
      {
        ...makeLayer({ id: "opt", type: "image" }),
        s3KeyOpt: "knowledge-files/spaces/x/designer/a_OPT.webp",
        s3Key: "knowledge-files/spaces/x/designer/a_HR.png",
        src: "https://cdn.example/opt",
      } as ReturnType<typeof makeLayer>,
    ]);
    expect(collectPublishImageRefs(page)).toEqual([
      {
        layerId: "opt",
        s3Key: "knowledge-files/spaces/x/designer/a_OPT.webp",
        src: "https://cdn.example/opt",
        alreadyOptimized: true,
      },
    ]);
  });

  it("escapes html and sanitizes css ids", () => {
    expect(escapeHtml('<a href="x">')).toBe("&lt;a href=&quot;x&quot;&gt;");
    expect(cssSafeId("12ab")).toBe("s_12ab");
    expect(cssSafeId("hero-1")).toBe("hero-1");
  });

  it("persists publish metadata on the node without storing html", () => {
    const parsed = parseSiteCreatorNodeData({
      schemaVersion: 1,
      blueprint: createEmptySiteBlueprintV1(),
      publish: {
        siteId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        publishedAt: "2026-08-17T00:00:00.000Z",
        publicPath: "/s/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/",
        fileCount: 4,
      },
    });
    expect(parsed.publish?.siteId).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(parsed.publish?.publicPath).toBe("/s/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/");
    expect(JSON.stringify(parsed)).not.toContain("<html");
    expect(parseSiteCreatorNodeData({ publish: { siteId: "../x" } }).publish).toBeNull();
  });

  it("does not mutate the source page while compiling", () => {
    const page = makePage([makeLayer({ id: "box", type: "rect", x: 10, y: 10, width: 40, height: 40 })]);
    const before = JSON.stringify(page);
    compilePublishedSite({
      page,
      blueprint: createEmptySiteBlueprintV1(),
      title: "X",
      imageHrefByLayerId: {},
    });
    expect(JSON.stringify(page)).toBe(before);
    expect(buildSiteSelectionIndex(page).byId.box).toBeTruthy();
  });
});
