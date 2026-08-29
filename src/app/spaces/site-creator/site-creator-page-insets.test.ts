import { describe, expect, it } from "vitest";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { cloneBlueprint } from "./site-blueprint-validate";
import {
  applyPageInsetsToObjects,
  bandHasPageInsets,
  clampPageInsets,
  copyPageInsetsFromMonitor,
  detectPageContentInsets,
  parseSitePageInsets,
  remapPageInsetRect,
  resolvePageInsetsForBand,
  setPageInsets,
  snapPageInsetsToDesign,
} from "./site-creator-page-insets";
import { resolveSiteCreatorResponsiveDisplay } from "./site-creator-responsive";
import { fixtureSimpleSection, makeLayer, makePage } from "./site-creator-responsive-fixtures";
import { createEmptySiteBlueprintV1, sanitizeSiteBlueprintV1 } from "./site-creator-types";
import type { FreehandObject } from "../FreehandStudio";

describe("site-creator-page-insets", () => {
  it("mantiene márgenes gemelos y un mínimo interior", () => {
    const linked = clampPageInsets(400, 10, 1000, true);
    expect(linked).toEqual({ left: 400, right: 400, linked: true, enabled: true });

    const tooWide = clampPageInsets(900, 900, 1000, true);
    expect(tooWide.left + tooWide.right).toBeLessThanOrEqual(800);
    expect(tooWide.left).toBe(tooWide.right);

    const split = clampPageInsets(100, 50, 1000, false);
    expect(split).toEqual({ left: 100, right: 50, linked: false, enabled: true });
  });

  it("detecta el gutter del Original e ignora fondos a sangre", () => {
    const page = makePage(
      [
        makeLayer({ id: "paper", type: "rect", x: 0, y: 0, width: 1920, height: 1080, fill: "#fff" }),
        makeLayer({ id: "hero", type: "rect", x: 160, y: 80, width: 1600, height: 400, fill: "#333" }),
        makeLayer({ id: "card", type: "rect", x: 160, y: 520, width: 1600, height: 200, fill: "#c44" }),
      ],
      { w: 1920, h: 1080 },
    );
    expect(detectPageContentInsets(page, 1920)).toEqual({
      left: 160,
      right: 160,
      linked: true,
      enabled: true,
    });
    const leftover = makePage(
      [makeLayer({ id: "card", type: "rect", x: 40, y: 40, width: 200, height: 80 })],
      { w: 1920, h: 1080 },
    );
    expect(detectPageContentInsets(leftover, 1920)).toEqual({
      left: 0,
      right: 0,
      linked: true,
      enabled: true,
    });
  });

  it("no vuelve a estrechar un diseño que ya tiene esos márgenes", () => {
    const page = makePage(
      [makeLayer({ id: "hero", type: "rect", x: 200, y: 40, width: 1520, height: 400 })],
      { w: 1920, h: 1080 },
    );
    const index = buildSiteSelectionIndex(page);
    const result = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: createEmptySiteBlueprintV1(),
      referenceIndex: index,
      viewportWidth: 1920,
      band: "monitor",
      expandViewportSections: false,
    });
    expect(result.displayPage.objects?.[0]).toMatchObject({ x: 200, width: 1520 });
  });

  it("al desactivar márgenes expande el contenido a sangre", () => {
    const page = makePage(
      [makeLayer({ id: "hero", type: "rect", x: 200, y: 40, width: 1520, height: 400 })],
      { w: 1920, h: 1080 },
    );
    const index = buildSiteSelectionIndex(page);
    const blueprint = setPageInsets(
      createEmptySiteBlueprintV1(),
      "monitor",
      { left: 200, right: 200, linked: true, enabled: false },
      1920,
    );
    const result = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "monitor",
      expandViewportSections: false,
    });
    const hero = result.displayPage.objects?.[0];
    expect(hero?.x).toBeCloseTo(0, 0);
    expect(hero!.x + hero!.width).toBeCloseTo(1920, 0);
  });

  it("recuerda left/right al apagar márgenes", () => {
    const off = setPageInsets(
      createEmptySiteBlueprintV1(),
      "tablet",
      { left: 48, right: 48, linked: true, enabled: false },
      768,
    );
    expect(off.pageInsets?.tablet).toMatchObject({
      left: 48,
      right: 48,
      linked: true,
      enabled: false,
    });
    const on = setPageInsets(
      off,
      "tablet",
      { left: 48, right: 48, linked: true, enabled: true },
      768,
    );
    expect(on.pageInsets?.tablet?.enabled).not.toBe(false);
  });

  it("hace snap al margen del diseño", () => {
    const design = { left: 120, right: 120, linked: true, enabled: true };
    const near = snapPageInsetsToDesign(
      { left: 126, right: 126, linked: true, enabled: true },
      design,
      1920,
    );
    expect(near.snapped).toBe(true);
    expect(near.insets.left).toBe(120);
    const far = snapPageInsetsToDesign(
      { left: 40, right: 40, linked: true, enabled: true },
      design,
      1920,
    );
    expect(far.snapped).toBe(false);
    expect(far.insets.left).toBe(40);
  });

  it("remapea X de raíces y de hijos locales, sin recortar Y", () => {
    const child = makeLayer({
      id: "child",
      type: "rect",
      x: 20,
      y: 8,
      width: 40,
      height: 16,
    });
    const group = {
      ...makeLayer({ id: "group", type: "rect", x: 0, y: 10, width: 100, height: 50 }),
      type: "groupContainer",
      children: [child],
    } as FreehandObject;
    const bg = makeLayer({ id: "bg", type: "rect", x: 0, y: 0, width: 200, height: 80 });
    applyPageInsetsToObjects([bg, group], 0, 20, 0.8);
    expect(bg).toMatchObject({ x: 20, y: 0, width: 160, height: 80 });
    expect(group).toMatchObject({ x: 20, y: 10, width: 80, height: 50 });
    expect(child).toMatchObject({ x: 16, y: 8, width: 32, height: 16 });
  });

  it("aplica insets en el resolve de dispositivo y no en Original", () => {
    const fx = fixtureSimpleSection();
    const withInsets = setPageInsets(
      fx.blueprint,
      "mobile",
      { left: 40, right: 40, linked: true },
      390,
    );
    const index = buildSiteSelectionIndex(fx.page);
    const mobile = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: withInsets,
      referenceIndex: index,
      viewportWidth: 390,
      band: "mobile",
      expandViewportSections: false,
    });
    const block = (mobile.displayPage.objects ?? []).find((object) => object.id === "block");
    expect(block).toBeTruthy();
    expect(block!.x + block!.width).toBeLessThanOrEqual(390 + 0.75);
    expect(mobile.layout.layoutWidth).toBe(390);

    const original = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: withInsets,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "wide",
      expandViewportSections: false,
    });
    const originalBlock = (original.displayPage.objects ?? []).find((object) => object.id === "block");
    expect(originalBlock).toMatchObject({ x: 100, width: 800 });
  });

  it("copia del monitor proporcionalmente y persiste en clone/sanitize", () => {
    let blueprint = setPageInsets(
      createEmptySiteBlueprintV1(),
      "monitor",
      { left: 120, right: 120, linked: true },
      1200,
    );
    blueprint = copyPageInsetsFromMonitor(blueprint, "tablet", 1200, 768);
    const tablet = resolvePageInsetsForBand(blueprint.pageInsets, "tablet", 768);
    expect(tablet.left).toBe(Math.round(120 * (768 / 1200)));
    expect(tablet.right).toBe(tablet.left);
    expect(bandHasPageInsets(blueprint, "monitor")).toBe(true);

    const cloned = cloneBlueprint(blueprint);
    expect(cloned.pageInsets).toEqual(blueprint.pageInsets);
    expect(sanitizeSiteBlueprintV1(cloned).pageInsets).toEqual(blueprint.pageInsets);
    expect(parseSitePageInsets({ tablet: { left: 10, right: 4, linked: false } })).toEqual({
      tablet: { left: 10, right: 4, linked: false, enabled: true },
    });
  });

  it("remapea clips del layout resuelto", () => {
    expect(remapPageInsetRect({ x: 0, y: 10, width: 200, height: 40 }, 0, 20, 0.8)).toEqual({
      x: 20,
      y: 10,
      width: 160,
      height: 40,
    });
  });

  it("al ensanchar una máscara reencuadra la foto para que no queden huecos", () => {
    const frame = {
      ...makeLayer({ id: "frame", type: "rect", x: 200, y: 0, width: 400, height: 200 }),
      isImageFrame: true,
      imageFrameContent: {
        src: "https://cdn.example/hero.jpg",
        originalWidth: 400,
        originalHeight: 400,
        scaleX: 1,
        scaleY: 1,
        offsetX: 0,
        offsetY: -100,
        fittingMode: "fill-proportional" as const,
      },
    } as FreehandObject;
    applyPageInsetsToObjects([frame], 200, 0, 1920 / 1520);
    const content = frame.imageFrameContent!;
    const imageWidth = content.originalWidth * content.scaleX;
    const imageHeight = content.originalHeight * content.scaleY;
    expect(imageWidth).toBeGreaterThanOrEqual(frame.width - 0.5);
    expect(imageHeight).toBeGreaterThanOrEqual(frame.height - 0.5);
    expect(content.offsetX).toBeLessThanOrEqual(0.5);
    expect(content.offsetX + imageWidth).toBeGreaterThanOrEqual(frame.width - 0.5);
    expect(content.offsetY).toBeLessThanOrEqual(0.5);
    expect(content.offsetY + imageHeight).toBeGreaterThanOrEqual(frame.height - 0.5);
    expect(content.scaleX).toBeCloseTo(content.scaleY, 6);
  });

  it("al ensanchar un clippingContainer cubre la máscara sin estirar la foto", () => {
    const photo = makeLayer({
      id: "photo",
      type: "image",
      x: 0,
      y: 0,
      width: 400,
      height: 200,
    });
    const clip = {
      ...makeLayer({ id: "clip", type: "rect", x: 200, y: 40, width: 400, height: 200 }),
      type: "clippingContainer",
      mask: makeLayer({ id: "mask", type: "rect", x: 0, y: 0, width: 400, height: 200 }),
      content: [photo],
    } as FreehandObject;
    applyPageInsetsToObjects([clip], 200, 0, 1920 / 1520);
    const mask = (clip as { mask: FreehandObject }).mask;
    expect(photo.width / photo.height).toBeCloseTo(2, 6);
    expect(photo.x).toBeLessThanOrEqual(mask.x + 0.5);
    expect(photo.x + photo.width).toBeGreaterThanOrEqual(mask.x + mask.width - 0.5);
    expect(photo.y).toBeLessThanOrEqual(mask.y + 0.5);
    expect(photo.y + photo.height).toBeGreaterThanOrEqual(mask.y + mask.height - 0.5);
  });
});
