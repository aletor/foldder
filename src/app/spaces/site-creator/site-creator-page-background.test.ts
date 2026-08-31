import { describe, expect, it } from "vitest";
import { cloneBlueprint } from "./site-blueprint-validate";
import { compilePublishedSite } from "./site-creator-publish-compile";
import {
  detectDesignerPageBackground,
  reconcilePageBackground,
  resolveDesignerPageBackground,
  resolvePageBackgroundCss,
} from "./site-creator-page-background";
import { findDisplayObject, resolveSiteCreatorResponsiveDisplay } from "./site-creator-responsive";
import { makeLayer, makePage } from "./site-creator-responsive-fixtures";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { createEmptySiteBlueprintV1 } from "./site-creator-types";

describe("designer page background", () => {
  it("detects a full-page color rectangle", () => {
    const page = makePage([
      makeLayer({ id: "bg", type: "rect", x: 0, y: 0, width: 1920, height: 1080, fill: "#112233" }),
      makeLayer({ id: "title", type: "text", x: 80, y: 120, width: 400, height: 80, text: "Hola" }),
    ]);
    expect(detectDesignerPageBackground(page)).toEqual({
      kind: "color",
      sourceLayerId: "bg",
      css: "#112233",
    });
  });

  it("detects a full-page linear gradient", () => {
    const page = makePage([
      {
        ...makeLayer({ id: "bg", type: "rect", x: 0, y: 0, width: 1920, height: 1080 }),
        fill: {
          type: "gradient-linear",
          stops: [
            { color: "#ff0000", opacity: 1, position: 0 },
            { color: "#0000ff", opacity: 1, position: 100 },
          ],
          x1: 0,
          y1: 0.5,
          x2: 1,
          y2: 0.5,
        },
      },
    ]);
    const detected = detectDesignerPageBackground(page);
    expect(detected?.kind).toBe("gradient");
    expect(detected?.sourceLayerId).toBe("bg");
    expect(detected && "css" in detected ? detected.css : "").toContain("linear-gradient");
  });

  it("detects a full-page image", () => {
    const page = makePage([
      makeLayer({
        id: "photo",
        type: "image",
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        src: "https://cdn.example/bg.jpg",
      }),
      makeLayer({ id: "title", type: "text", x: 80, y: 120, width: 400, height: 80, text: "Hola" }),
    ]);
    expect(detectDesignerPageBackground(page)).toEqual({
      kind: "image",
      sourceLayerId: "photo",
      imageLayerId: "photo",
      focal: { x: 0.5, y: 0.5 },
      zoom: 1,
    });
  });

  it("ignores a hero band that is not the full page", () => {
    const page = makePage([
      makeLayer({ id: "hero", type: "rect", x: 0, y: 0, width: 1920, height: 400, fill: "#112233" }),
    ]);
    expect(detectDesignerPageBackground(page)).toBeNull();
  });

  it("hides the color rectangle in Site Creator display", () => {
    const page = makePage([
      makeLayer({ id: "bg", type: "rect", x: 0, y: 0, width: 1920, height: 1080, fill: "#ffcc00" }),
      makeLayer({ id: "title", type: "text", x: 80, y: 120, width: 400, height: 80, text: "Hola" }),
    ]);
    const index = buildSiteSelectionIndex(page);
    const resolved = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: createEmptySiteBlueprintV1(),
      referenceIndex: index,
      viewportWidth: 1920,
      band: "wide",
    });
    const bg = findDisplayObject(resolved.displayPage, "bg");
    expect(bg?.visible).toBe(false);
    expect(findDisplayObject(resolved.displayPage, "title")?.visible).not.toBe(false);
    expect(resolvePageBackgroundCss(page, createEmptySiteBlueprintV1())).toBe("#ffcc00");
  });

  it("keeps a background image as a full-page clip in preview", () => {
    const page = makePage([
      makeLayer({
        id: "photo",
        type: "image",
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        src: "https://cdn.example/bg.jpg",
      }),
    ]);
    const index = buildSiteSelectionIndex(page);
    const resolved = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: createEmptySiteBlueprintV1(),
      referenceIndex: index,
      viewportWidth: 1920,
      band: "wide",
    });
    const photo = findDisplayObject(resolved.displayPage, "photo");
    expect(photo?.type).toBe("clippingContainer");
    expect(photo?.visible).not.toBe(false);
    expect(photo?.width).toBe(1920);
    expect(photo?.height).toBe(1080);
  });

  it("publishes the color as the page background and omits the rectangle", () => {
    const page = makePage([
      makeLayer({ id: "bg", type: "rect", x: 0, y: 0, width: 1920, height: 1080, fill: "#112233" }),
      makeLayer({ id: "title", type: "text", x: 80, y: 120, width: 400, height: 80, text: "Hola" }),
    ]);
    const compiled = compilePublishedSite({
      page,
      blueprint: createEmptySiteBlueprintV1(),
      title: "Fondo",
      imageHrefByLayerId: {},
    });
    expect(compiled.css).toContain("body{background:#112233");
    expect(compiled.css).not.toContain(".s-el-bg{");
    expect(compiled.html).toContain("Hola");
    expect(compiled.html).not.toContain("s-el-bg");
  });

  it("publishes a background image as cover on the body", () => {
    const page = makePage([
      makeLayer({
        id: "photo",
        type: "image",
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        src: "https://cdn.example/bg.jpg",
      }),
    ]);
    const compiled = compilePublishedSite({
      page,
      blueprint: createEmptySiteBlueprintV1(),
      title: "Fondo",
      imageHrefByLayerId: { photo: "assets/bg.jpg" },
    });
    expect(compiled.css).toContain('url("assets/bg.jpg")');
    expect(compiled.css).toContain("cover");
    expect(compiled.html).not.toContain("s-el-photo");
  });

  it("reconciles and clones pageBackground without sharing the object", () => {
    const page = makePage([
      makeLayer({ id: "bg", type: "rect", x: 0, y: 0, width: 1920, height: 1080, fill: "#000" }),
    ]);
    const seeded = reconcilePageBackground(createEmptySiteBlueprintV1(), page);
    expect(seeded.pageBackground).toEqual({ sourceLayerId: "bg" });
    const cloned = cloneBlueprint(seeded);
    cloned.pageBackground!.sourceLayerId = "mutated";
    expect(seeded.pageBackground?.sourceLayerId).toBe("bg");
    expect(resolveDesignerPageBackground(page, seeded)?.sourceLayerId).toBe("bg");
  });
});
