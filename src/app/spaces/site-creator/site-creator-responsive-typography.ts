/**
 * Escala campos tipográficos en px junto con fontSize al reducir viewport.
 * Sin esto, letterSpacing fijo hace que el tracking relativo empeore en móvil/tablet.
 */
import type { FreehandObject } from "../FreehandStudio";
import type { DesignerPageState } from "../designer/DesignerNode";
import { hugAreaTextHeight, isAreaTextObject } from "./site-creator-text-frame";
import { getObjectFontSize } from "./site-creator-responsive-visual";

type TextTypographyObject = FreehandObject & {
  fontSize?: number;
  letterSpacing?: number;
  charSpacing?: number;
  baselineShift?: number;
  paragraphIndent?: number;
  pathWidth?: number;
  _designerRichSpans?: Array<{
    text: string;
    style?: {
      fontSize?: number;
      letterSpacing?: number;
      charSpacing?: number;
    };
  }>;
};

function scaleRichSpanStyles(
  obj: TextTypographyObject,
  scale: number,
  minFont: number,
): void {
  const spans = obj._designerRichSpans;
  if (!spans?.length || !Number.isFinite(scale) || scale <= 0) return;
  for (const span of spans) {
    const st = span.style;
    if (!st) continue;
    if (typeof st.fontSize === "number") {
      st.fontSize = Math.max(minFont, st.fontSize * scale);
    }
    if (typeof st.letterSpacing === "number") st.letterSpacing *= scale;
    if (typeof st.charSpacing === "number") st.charSpacing *= scale;
  }
}

/** Multiplica fontSize y métricas en px por `scale` (preserve, reflow, grupos). */
export function scaleTextTypographyFields(
  obj: FreehandObject,
  scale: number,
  minFont = 1,
): void {
  if (obj.type !== "text" && obj.type !== "textOnPath") return;
  if (!Number.isFinite(scale) || scale <= 0) return;

  const t = obj as TextTypographyObject;
  const current = getObjectFontSize(obj);
  t.fontSize = Math.max(minFont, current * scale);

  if (typeof t.letterSpacing === "number") t.letterSpacing *= scale;
  if (typeof t.charSpacing === "number") t.charSpacing *= scale;
  if (typeof t.baselineShift === "number") t.baselineShift *= scale;
  if (typeof t.paragraphIndent === "number") t.paragraphIndent *= scale;
  if (obj.type === "textOnPath" && typeof t.pathWidth === "number") {
    t.pathWidth = Math.max(0.5, t.pathWidth * scale);
  }
  scaleRichSpanStyles(t, scale, minFont);
}

/** Tras escalar, expande altura de cajas area si el reflow necesita más espacio. */
export function reflowAreaTextHeightsInTree(obj: FreehandObject): void {
  if (obj.type === "text" && isAreaTextObject(obj)) {
    const hug = hugAreaTextHeight(obj, obj.width);
    obj.height = Math.max(obj.height, hug);
    return;
  }
  if (obj.type === "groupContainer" || obj.type === "booleanGroup") {
    for (const ch of (obj as { children?: FreehandObject[] }).children ?? []) {
      reflowAreaTextHeightsInTree(ch);
    }
    return;
  }
  if (obj.type === "clippingContainer") {
    const c = obj as { mask?: FreehandObject; content?: FreehandObject[] };
    if (c.mask) reflowAreaTextHeightsInTree(c.mask);
    for (const ch of c.content ?? []) reflowAreaTextHeightsInTree(ch);
  }
}

export function reflowAreaTextHeightsInPage(page: DesignerPageState): void {
  for (const obj of page.objects ?? []) {
    if (obj.visible === false) continue;
    reflowAreaTextHeightsInTree(obj);
  }
}
