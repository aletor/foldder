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
import { createMultiCardFromSelection, createSectionFromSelection, setSectionHeightMode } from "./site-blueprint-ops";
import { createEmptySiteBlueprintV1, parseSiteCreatorNodeData } from "./site-creator-types";
import { fixtureHeroPanelButton, makeLayer, makePage } from "./site-creator-responsive-fixtures";

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

  it("emits stroke, corner radius and real path geometry instead of empty placeholders", () => {
    const page = makePage([
      {
        ...makeLayer({ id: "card", type: "rect", x: 40, y: 40, width: 200, height: 80, fill: "#111111" }),
        stroke: "#ff00aa",
        strokeWidth: 4,
        cornerRadius: { topLeft: 16, topRight: 16, bottomRight: 16, bottomLeft: 16 },
      } as ReturnType<typeof makeLayer>,
      {
        ...makeLayer({ id: "blob", type: "path", x: 80, y: 160, width: 120, height: 60, fill: "#00aa88" }),
        type: "path",
        closed: true,
        points: [
          { anchor: { x: 80, y: 160 }, handleIn: { x: 80, y: 160 }, handleOut: { x: 80, y: 160 } },
          { anchor: { x: 200, y: 160 }, handleIn: { x: 200, y: 160 }, handleOut: { x: 200, y: 160 } },
          { anchor: { x: 200, y: 220 }, handleIn: { x: 200, y: 220 }, handleOut: { x: 200, y: 220 } },
          { anchor: { x: 80, y: 220 }, handleIn: { x: 80, y: 220 }, handleOut: { x: 80, y: 220 } },
        ],
      } as ReturnType<typeof makeLayer>,
      {
        ...makeLayer({ id: "icon", type: "path", x: 300, y: 40, width: 50, height: 40, fill: "#222" }),
        type: "path",
        svgPathD: "M 0 0 H 50 V 40 H 0 Z",
        svgPathIntrinsicW: 50,
        svgPathIntrinsicH: 40,
        points: [],
      } as ReturnType<typeof makeLayer>,
    ]);
    const compiled = compilePublishedSite({
      page,
      blueprint: createEmptySiteBlueprintV1(),
      title: "Estilo",
      imageHrefByLayerId: {},
    });
    expect(compiled.html).toContain('fill="#111111"');
    expect(compiled.html).toContain('stroke="#ff00aa"');
    expect(compiled.html).toContain('stroke-width="4"');
    expect(compiled.html).toContain("s-paint");
    expect(compiled.html).toMatch(/A 16 16 0 0 1/);
    expect(compiled.css).not.toMatch(/\.s-el-card\{[^}]*background:/);
    expect(compiled.html).toContain('viewBox="80 160 120 60"');
    expect(compiled.html).not.toContain('viewBox="0 0 1 1"');
    expect(compiled.html).toContain('d="M 80 160 L 200 160 L 200 220 L 80 220 L 80 160 Z"');
    expect(compiled.html).toContain('viewBox="0 0 50 40"');
    expect(compiled.html).toContain('d="M 0 0 H 50 V 40 H 0 Z"');
  });

  it("publishes a boolean group as its cached raster instead of flattening children", () => {
    const page = makePage([
      {
        ...makeLayer({ id: "bool", type: "rect", x: 10, y: 10, width: 80, height: 80 }),
        type: "booleanGroup",
        operation: "subtract",
        cachedResult: "https://cdn.example/bool.webp",
        children: [
          makeLayer({ id: "a", type: "rect", x: 10, y: 10, width: 80, height: 80, fill: "#f00" }),
          makeLayer({ id: "b", type: "rect", x: 30, y: 30, width: 40, height: 40, fill: "#0f0" }),
        ],
      } as ReturnType<typeof makeLayer>,
    ]);
    const compiled = compilePublishedSite({
      page,
      blueprint: createEmptySiteBlueprintV1(),
      title: "Bool",
      imageHrefByLayerId: { bool: "assets/bool.webp" },
    });
    expect(compiled.html).toContain('src="assets/bool.webp"');
    expect(compiled.html).toContain("s-el-bool");
    expect(compiled.html).not.toMatch(/class="[^"]*s-el-a(?:\s|")/);
    expect(compiled.html).not.toMatch(/class="[^"]*s-el-b(?:\s|")/);
    expect(collectPublishImageRefs(page).some((ref) => ref.layerId === "bool")).toBe(true);
  });

  it("clips overflowing section media and ellipse paste-inside masks", () => {
    const { page, blueprint } = fixtureHeroPanelButton();
    const compiled = compilePublishedSite({
      page,
      blueprint,
      title: "Clip",
      imageHrefByLayerId: { photo: "assets/photo.webp" },
    });
    const mobileCss = compiled.css.split("@media (max-width:767px)")[1] ?? "";
    expect(mobileCss).toMatch(/\.s-el-photo\{[^}]*clip-path:inset\(/);

    const clipped = makePage([
      {
        ...makeLayer({ id: "hole", type: "rect", x: 100, y: 80, width: 200, height: 200 }),
        type: "clippingContainer",
        mask: makeLayer({ id: "mask", type: "ellipse", x: 0, y: 0, width: 200, height: 200 }),
        content: [
          makeLayer({
            id: "pic",
            type: "image",
            x: 0,
            y: 0,
            width: 200,
            height: 200,
            src: "https://cdn.example/p.jpg",
          }),
        ],
      } as ReturnType<typeof makeLayer>,
    ]);
    const clipCompiled = compilePublishedSite({
      page: clipped,
      blueprint: createEmptySiteBlueprintV1(),
      title: "Elipse",
      imageHrefByLayerId: { pic: "assets/p.webp" },
    });
    expect(clipCompiled.css).toContain("clip-path:ellipse(50% 50% at 50% 50%)");
  });

  it("positions nested group children with container cqw instead of percent-of-auto-height", () => {
    const page = makePage([
      {
        ...makeLayer({ id: "card", type: "groupContainer", x: 80, y: 100, width: 400, height: 220 }),
        type: "groupContainer",
        children: [
          makeLayer({ id: "block", type: "rect", x: 80, y: 100, width: 180, height: 220, fill: "#111" }),
          makeLayer({ id: "label", type: "text", x: 280, y: 140, width: 180, height: 60, text: "A" }),
        ],
      } as ReturnType<typeof makeLayer>,
    ]);
    const compiled = compilePublishedSite({
      page,
      blueprint: createEmptySiteBlueprintV1(),
      title: "Grupo",
      imageHrefByLayerId: {},
    });
    const wideCss = compiled.css.split("@media")[0] ?? "";
    expect(wideCss).toMatch(/\.s-el-block\{[^}]*width:calc\(100cqw \* 180 \/ 380\)/);
    expect(wideCss).toMatch(/\.s-el-block\{[^}]*height:calc\(100cqw \* 220 \/ 380\)/);
    expect(wideCss).not.toMatch(/\.s-el-block\{[^}]*height:100%/);
  });

  it("paints Designer fills, fonts and text decorations instead of CSS boxes", () => {
    const page = makePage([
      {
        ...makeLayer({ id: "box", type: "rect", x: 0, y: 0, width: 200, height: 80 }),
        fill: { type: "solid", color: "#1e4fd6" },
      } as ReturnType<typeof makeLayer>,
      {
        ...makeLayer({
          id: "copy",
          type: "text",
          x: 20,
          y: 20,
          width: 160,
          height: 40,
          text: "Hola",
          fontSize: 32,
          fill: "#fafafa",
        }),
        fontFamily: "Inter",
        fontWeight: 600,
        fontStyle: "italic",
        letterSpacing: 1.5,
        textUnderline: true,
        textAlign: "center",
      } as ReturnType<typeof makeLayer>,
    ]);
    const compiled = compilePublishedSite({
      page,
      blueprint: createEmptySiteBlueprintV1(),
      title: "Tipografia",
      imageHrefByLayerId: {},
    });
    expect(compiled.html).toContain('fill="#1e4fd6"');
    expect(compiled.html).toContain("Hola");
    expect(compiled.css).toMatch(/\.s-el-copy\{[^}]*font-family:"Inter",sans-serif/);
    expect(compiled.css).toMatch(/\.s-el-copy\{[^}]*font-style:italic/);
    expect(compiled.css).toMatch(/\.s-el-copy\{[^}]*text-decoration:underline/);
    expect(compiled.css).toMatch(/\.s-el-copy\{[^}]*color:#fafafa/);
    expect(compiled.html).toContain("fonts.googleapis.com");
    expect(compiled.html).toContain("ital,wght@");
  });

  it("keeps overlapping section layers absolutely stacked instead of a flex row", () => {
    const page = makePage([
      {
        ...makeLayer({ id: "clip", type: "rect", x: 80, y: 40, width: 1760, height: 500 }),
        type: "clippingContainer",
        mask: makeLayer({ id: "mask", type: "rect", x: 0, y: 0, width: 1760, height: 500 }),
        content: [
          makeLayer({
            id: "photo",
            type: "image",
            x: 0,
            y: 0,
            width: 1760,
            height: 500,
            src: "https://cdn.example/hero.jpg",
          }),
        ],
      } as ReturnType<typeof makeLayer>,
      makeLayer({ id: "panel", type: "rect", x: 80, y: 580, width: 1760, height: 400, fill: "#6366f1" }),
      makeLayer({ id: "copy", type: "text", x: 120, y: 600, width: 640, height: 160, text: "Hola" }),
      makeLayer({ id: "btn", type: "rect", x: 1400, y: 900, width: 360, height: 56, fill: "#687d73" }),
      makeLayer({ id: "pulsa", type: "text", x: 1520, y: 912, width: 120, height: 32, text: "PULSA" }),
    ]);
    const compiled = compilePublishedSite({
      page,
      blueprint: createEmptySiteBlueprintV1(),
      title: "Secciones",
      imageHrefByLayerId: { photo: "assets/hero.jpg" },
    });
    expect(compiled.html).not.toContain("s-row-rest");
    expect(compiled.html).not.toContain("s-flow-item");
    expect(compiled.html).not.toContain("s-page s-flow");
    expect(compiled.css).toMatch(/\.s-el-panel\{[^}]*top:calc\(100cqw \* 580/);
    expect(compiled.css).toMatch(/\.s-el-copy\{[^}]*top:calc\(100cqw \* 600/);
    expect(compiled.css).toMatch(/\.s-el-btn\{[^}]*left:calc\(100cqw \* 1400/);
    expect(compiled.css).toMatch(/\.s-el-pulsa\{[^}]*left:calc\(100cqw \* 1520/);
  });

  it("keeps desktop published layout on the artboard instead of 100dvh", () => {
    const page = makePage([
      makeLayer({ id: "hero", type: "rect", x: 0, y: 0, width: 1920, height: 400, fill: "#111" }),
      makeLayer({ id: "title", type: "text", x: 80, y: 120, width: 600, height: 60, text: "Hola" }),
    ]);
    const index = buildSiteSelectionIndex(page);
    const section = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["hero", "title"],
      index,
      committedPage: page,
      sectionType: "hero",
    });
    expect(section.ok).toBe(true);
    if (!section.ok || !section.createdNodeId) return;
    const fitted = setSectionHeightMode(section.blueprint, section.createdNodeId, "viewport");
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    const compiled = compilePublishedSite({
      page,
      blueprint: fitted.blueprint,
      title: "Ordenador",
      imageHrefByLayerId: {},
    });
    const wideCss = compiled.css.split("@media")[0] ?? "";
    expect(wideCss).not.toContain("100dvh");
    expect(wideCss).toMatch(/\.s-el-title\{[^}]*top:calc\(100cqw \* 120 \/ 1920\)/);
    expect(wideCss).toMatch(/\.s-el-hero\{[^}]*height:calc\(100cqw \* 400 \/ 1920\)/);
  });

  it("nests an overlapping clip inside a designer group so overlays stay above it", () => {
    const page = makePage([
      {
        ...makeLayer({ id: "card-bg", type: "rect", x: 80, y: 100, width: 400, height: 500, fill: "#ffffff" }),
        groupId: "card1",
      } as ReturnType<typeof makeLayer>,
      {
        ...makeLayer({ id: "jeans", type: "rect", x: 110, y: 120, width: 280, height: 280 }),
        type: "clippingContainer",
        mask: makeLayer({ id: "jeans-mask", type: "rect", x: 0, y: 0, width: 280, height: 280 }),
        content: [
          makeLayer({
            id: "jeans-img",
            type: "image",
            x: 0,
            y: 0,
            width: 280,
            height: 280,
            src: "https://cdn.example/jeans.png",
          }),
        ],
      } as ReturnType<typeof makeLayer>,
      {
        ...makeLayer({ id: "price", type: "text", x: 300, y: 320, width: 140, height: 70, text: "35" }),
        groupId: "card1",
      } as ReturnType<typeof makeLayer>,
    ]);
    const compiled = compilePublishedSite({
      page,
      blueprint: createEmptySiteBlueprintV1(),
      title: "Tarjeta",
      imageHrefByLayerId: { "jeans-img": "assets/jeans.png" },
    });
    expect(compiled.html).toMatch(
      /data-group="scgrp_dg_gid_card1"[\s\S]*s-group-jeans[\s\S]*s-el-price/,
    );
    expect(compiled.html).not.toMatch(/s-group-jeans[\s\S]*data-group="scgrp_dg_gid_card1"/);
  });

  it("publishes MultiCard copies with the mold image href", () => {
    const page = makePage([
      makeLayer({ id: "bg", type: "rect", x: 0, y: 0, width: 1920, height: 400, fill: "#111" }),
      makeLayer({
        id: "photo",
        type: "image",
        x: 40,
        y: 80,
        width: 240,
        height: 160,
        src: "https://cdn.example/photo.png",
      }),
      makeLayer({ id: "title", type: "text", x: 40, y: 260, width: 200, height: 32, text: "Card" }),
    ]);
    const index = buildSiteSelectionIndex(page);
    const hero = createSectionFromSelection({
      blueprint: createEmptySiteBlueprintV1(),
      selectedLayerIds: ["bg", "photo", "title"],
      index,
      committedPage: page,
      sectionType: "hero",
    });
    expect(hero.ok).toBe(true);
    if (!hero.ok || !hero.createdNodeId) return;
    const created = createMultiCardFromSelection({
      blueprint: hero.blueprint,
      selectedLayerIds: ["photo", "title"],
      index,
      preferredParentId: hero.createdNodeId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const compiled = compilePublishedSite({
      page,
      blueprint: created.blueprint,
      title: "Multi",
      imageHrefByLayerId: { photo: "assets/photo.webp" },
    });
    const photos = compiled.html.match(/src="assets\/photo\.webp"/g) ?? [];
    expect(photos.length).toBeGreaterThanOrEqual(3);
    const titles = compiled.html.match(/>Card</g) ?? [];
    expect(titles.length).toBeGreaterThanOrEqual(3);
    expect(compiled.html).toContain("s-mc-track");
    expect(compiled.js).toContain("[data-mc]");
  });
});
