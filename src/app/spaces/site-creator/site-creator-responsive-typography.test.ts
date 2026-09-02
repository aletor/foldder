/**
 * Tipografía responsive — letterSpacing y reflow de cajas area.
 */
import { describe, expect, it } from "vitest";
import type { DesignerPageState } from "../designer/DesignerNode";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { makeLayer, makePage } from "./site-creator-responsive-fixtures";
import {
  applyUniformScaleToObjectTree,
  preservePageWithUniformMatrix,
} from "./site-creator-responsive-matrix";
import { applyPageInsetsToObjects } from "./site-creator-page-insets";
import { hugAreaTextHeight } from "./site-creator-text-frame";
import {
  scaleTextTypographyFields,
} from "./site-creator-responsive-typography";
import { findDisplayObject, resolveSiteCreatorResponsiveDisplay } from "./site-creator-responsive";
import { createEmptySiteBlueprintV1 } from "./site-creator-types";

describe("site-creator-responsive-typography", () => {
  it("scales letterSpacing proportionally with fontSize", () => {
    const text = makeLayer({
      id: "headline",
      type: "text",
      x: 100,
      y: 100,
      width: 800,
      height: 400,
      text: "Lorem ipsum dolor sit amet",
      fontSize: 80,
    }) as {
      letterSpacing: number;
      fontSize: number;
    };
    text.letterSpacing = -2.5;
    text.paragraphIndent = 12;

    scaleTextTypographyFields(text, 0.5);

    expect(text.fontSize).toBe(40);
    expect(text.letterSpacing).toBeCloseTo(-1.25);
    expect(text.paragraphIndent).toBeCloseTo(6);
  });

  it("scales letterSpacing in designer rich spans", () => {
    const text = makeLayer({
      id: "rich",
      type: "text",
      x: 40,
      y: 40,
      width: 600,
      height: 200,
      text: "Lorem ipsum",
      fontSize: 64,
    }) as {
      letterSpacing: number;
      _designerRichSpans: Array<{ text: string; style: { fontSize: number; letterSpacing: number } }>;
    };
    text.letterSpacing = -1.2;
    text._designerRichSpans = [
      { text: "Lorem ", style: { fontSize: 64, letterSpacing: -1.2 } },
      { text: "ipsum", style: { fontSize: 64, letterSpacing: -1.2 } },
    ];

    scaleTextTypographyFields(text, 0.5);

    expect(text._designerRichSpans[0]!.style.fontSize).toBe(32);
    expect(text._designerRichSpans[0]!.style.letterSpacing).toBeCloseTo(-0.6);
  });

  it("uniform-preserve keeps tracking ratio on page-unstructured mobile", () => {
    const text = makeLayer({
      id: "hero_text",
      type: "text",
      x: 200,
      y: 300,
      width: 900,
      height: 280,
      text: "Lorem ipsum dolor sit amet consectetur adipiscing elit",
      fontSize: 72,
    }) as {
      letterSpacing: number;
      fontSize: number;
      height: number;
    };
    text.letterSpacing = -1.8;

    const page = makePage([text], { w: 1920, h: 1200 });
    const blueprint = createEmptySiteBlueprintV1();
    const index = buildSiteSelectionIndex(page);

    const scale = 390 / 1920;
    const result = resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint,
      referenceIndex: index,
      viewportWidth: 390,
      band: "mobile",
    });

    const resolved = findDisplayObject(result.displayPage, "hero_text") as {
      fontSize: number;
      letterSpacing: number;
      height: number;
    };

    expect(result.strategy).toBe("uniform-preserve");
    expect(resolved.fontSize).toBeCloseTo(72 * scale, 1);
    expect(resolved.letterSpacing).toBeCloseTo(-1.8 * scale, 2);
    expect(resolved.letterSpacing / resolved.fontSize).toBeCloseTo(-1.8 / 72, 4);
    expect(resolved.height).toBeGreaterThanOrEqual(280 * scale * 0.95);
  });

  it("expands area text height when reflow needs more lines after scale", () => {
    const text = makeLayer({
      id: "body",
      type: "text",
      x: 40,
      y: 40,
      width: 600,
      height: 120,
      text: "Word ".repeat(40).trim(),
      fontSize: 48,
    }) as { height: number };

    const page = makePage([text], { w: 800, h: 400 });
    const displayPage: DesignerPageState = {
      ...page,
      objects: page.objects!.map((o) => structuredClone(o)),
    };
    preservePageWithUniformMatrix({
      displayPage,
      sourceWidth: 800,
      sourceHeight: 400,
      viewportWidth: 280,
    });

    const scaled = displayPage.objects![0] as { height: number; width: number };
    expect(scaled.height).toBeGreaterThan(120 * (280 / 800));
  });

  it("scales typography when page insets remap horizontal geometry", () => {
    const text = makeLayer({
      id: "headline",
      type: "text",
      x: 100,
      y: 100,
      width: 800,
      height: 200,
      text: "Lorem ipsum dolor sit amet",
      fontSize: 48,
    }) as { letterSpacing: number; width: number };
    text.letterSpacing = -1.5;

    applyPageInsetsToObjects([text], 0, 40, 0.75);

    expect(text.x).toBe(115);
    expect(text.width).toBe(600);
    expect(text.letterSpacing).toBeCloseTo(-1.125);
    expect((text as { fontSize: number }).fontSize).toBe(36);
  });

  it("area text keeps enough height after strong mobile scale (proportional pad)", () => {
    const text = makeLayer({
      id: "pill",
      type: "text",
      x: 40,
      y: 40,
      width: 120,
      height: 28,
      text: "GET TO KNOW US",
      fontSize: 14,
    }) as { height: number; width: number; fontSize: number; lineHeight: number };
    applyUniformScaleToObjectTree(text, 0.25);
    const hug = hugAreaTextHeight(text, text.width);
    expect(text.height).toBeGreaterThanOrEqual(hug - 0.5);
    expect(text.height).toBeGreaterThan(text.fontSize * (text.lineHeight ?? 1.2));
  });
});
