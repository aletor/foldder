/**
 * Raster JPG/PNG: el blob SVG no pinta `foreignObject` (Chrome). Los trazados opentype
 * usan otro fichero y no reproducen kerning GPOS ni font-stretch del motor CSS.
 * Aquí se pinta el HTML vivo con Canvas 2D (misma cara, peso, tracking y kerning).
 */

export type CssFontStretch = "normal" | "condensed" | "expanded";

export function combinedLetterSpacingPx(letterSpacing?: number, charSpacing?: number): number {
  const a = Number.isFinite(letterSpacing) ? Number(letterSpacing) : 0;
  const b = Number.isFinite(charSpacing) ? Number(charSpacing) : 0;
  return a + b;
}

export function parseCssFontStretch(stretch: string | undefined | null): CssFontStretch {
  const s = (stretch ?? "").trim().toLowerCase();
  if (!s || s === "normal" || s === "100%") return "normal";
  if (s.includes("condens") || s.includes("narrow") || s.includes("compress")) return "condensed";
  if (s.includes("expand") || s.includes("extend") || s.includes("wide")) return "expanded";
  const pct = Number.parseFloat(s);
  if (Number.isFinite(pct) && pct > 0) {
    if (pct < 90) return "condensed";
    if (pct > 110) return "expanded";
  }
  return "normal";
}

export function canvasFontFromComputed(cs: CSSStyleDeclaration, fontSizePx: number): string {
  const style = cs.fontStyle && cs.fontStyle !== "normal" ? `${cs.fontStyle} ` : "";
  const weight = cs.fontWeight || "400";
  const stretchRaw = cs.fontStretch || "normal";
  const stretchKind = parseCssFontStretch(stretchRaw);
  const stretch =
    stretchKind === "normal" ? "" : stretchRaw.includes("%") ? `${stretchKind} ` : `${stretchRaw} `;
  const family = cs.fontFamily || "sans-serif";
  return `${style}${weight} ${stretch}${fontSizePx}px ${family}`;
}

function isTransparentCssColor(color: string): boolean {
  const c = color.trim().toLowerCase();
  return c === "transparent" || c === "rgba(0, 0, 0, 0)" || c === "rgba(0,0,0,0)";
}

function graphemeUtf16Ranges(text: string): Array<{ start: number; end: number; text: string }> {
  const out: Array<{ start: number; end: number; text: string }> = [];
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    for (const part of seg.segment(text)) {
      out.push({ start: part.index, end: part.index + part.segment.length, text: part.segment });
    }
    return out;
  }
  for (const { 0: ch, index } of text.matchAll(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\s\S]/g)) {
    const start = index ?? 0;
    out.push({ start, end: start + ch.length, text: ch });
  }
  return out;
}

function screenPointToParentUser(
  svg: SVGSVGElement,
  parent: SVGGraphicsElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const ctm = parent.getScreenCTM();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  try {
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  } catch {
    return null;
  }
}

type GlyphPaint = {
  ch: string;
  x: number;
  y: number;
  lineH: number;
  fontSize: number;
  font: string;
  fill: string;
  strokeColor: string;
  strokeWidth: number;
};

function collectGlyphPaints(
  svg: SVGSVGElement,
  fo: SVGForeignObjectElement,
  htmlRoot: HTMLElement,
): GlyphPaint[] | null {
  const parent = (fo.parentNode instanceof SVGGraphicsElement ? fo.parentNode : fo) as SVGGraphicsElement;
  const foX = fo.x.baseVal.value;
  const foY = fo.y.baseVal.value;
  const paints: GlyphPaint[] = [];
  const walker = document.createTreeWalker(htmlRoot, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    const parentEl = textNode.parentElement;
    const raw = textNode.data;
    node = walker.nextNode();
    if (!parentEl || !raw) continue;
    const cs = getComputedStyle(parentEl);
    const fontSize = Number.parseFloat(cs.fontSize);
    if (!Number.isFinite(fontSize) || fontSize <= 0) continue;
    const fill = (cs.getPropertyValue("-webkit-text-fill-color") || cs.color || "").trim() || cs.color;
    const strokeWidth = Number.parseFloat(cs.getPropertyValue("-webkit-text-stroke-width") || "0") || 0;
    const strokeColor = cs.getPropertyValue("-webkit-text-stroke-color") || cs.color;
    const fillTransparent = isTransparentCssColor(fill);
    if (fillTransparent && strokeWidth <= 0) continue;
    const font = canvasFontFromComputed(cs, fontSize);
    const ranges = graphemeUtf16Ranges(raw);
    for (const g of ranges) {
      if (g.text === "\n" || g.text === "\r") continue;
      const range = document.createRange();
      try {
        range.setStart(textNode, g.start);
        range.setEnd(textNode, g.end);
      } catch {
        continue;
      }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const top = screenPointToParentUser(svg, parent, rect.left, rect.top);
      const bottom = screenPointToParentUser(svg, parent, rect.left, rect.bottom);
      if (!top || !bottom) return null;
      paints.push({
        ch: g.text,
        x: top.x - foX,
        y: top.y - foY,
        lineH: Math.abs(bottom.y - top.y),
        fontSize,
        font,
        fill: fillTransparent ? "transparent" : fill,
        strokeColor,
        strokeWidth,
      });
    }
  }
  return paints;
}

function baselineForGlyph(ctx: CanvasRenderingContext2D, glyph: GlyphPaint): number {
  ctx.font = glyph.font;
  const metrics = ctx.measureText(glyph.ch === " " ? "H" : glyph.ch);
  const ascent =
    Number.isFinite(metrics.fontBoundingBoxAscent) && metrics.fontBoundingBoxAscent > 0
      ? metrics.fontBoundingBoxAscent
      : Number.isFinite(metrics.actualBoundingBoxAscent) && metrics.actualBoundingBoxAscent > 0
        ? metrics.actualBoundingBoxAscent
        : glyph.fontSize * 0.8;
  const descent =
    Number.isFinite(metrics.fontBoundingBoxDescent) && metrics.fontBoundingBoxDescent >= 0
      ? metrics.fontBoundingBoxDescent
      : Number.isFinite(metrics.actualBoundingBoxDescent) && metrics.actualBoundingBoxDescent >= 0
        ? metrics.actualBoundingBoxDescent
        : glyph.fontSize * 0.2;
  const lineH = glyph.lineH > 0 ? glyph.lineH : ascent + descent;
  const halfLeading = Math.max(0, (lineH - ascent - descent) / 2);
  return glyph.y + halfLeading + ascent;
}

function paintGlyphsToCanvas(ctx: CanvasRenderingContext2D, glyphs: GlyphPaint[]): void {
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  for (const g of glyphs) {
    ctx.font = g.font;
    ctx.letterSpacing = "0px";
    ctx.fontKerning = "none";
    const x = g.x;
    const y = baselineForGlyph(ctx, g);
    if (g.strokeWidth > 0 && g.strokeColor) {
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.lineWidth = g.strokeWidth;
      ctx.strokeStyle = g.strokeColor;
      ctx.strokeText(g.ch, x, y);
    }
    if (g.fill && g.fill !== "transparent") {
      ctx.fillStyle = g.fill;
      ctx.fillText(g.ch, x, y);
    }
  }
}

function rasterizeForeignObject(
  svg: SVGSVGElement,
  fo: SVGForeignObjectElement,
  pixelRatio: number,
): string | null {
  const htmlRoot = fo.firstElementChild as HTMLElement | null;
  if (!htmlRoot) return null;
  const csRoot = getComputedStyle(htmlRoot);
  if (csRoot.opacity === "0" || csRoot.visibility === "hidden") return null;
  const foW = Math.max(1, fo.width.baseVal.value);
  const foH = Math.max(1, fo.height.baseVal.value);
  const glyphs = collectGlyphPaints(svg, fo, htmlRoot);
  if (!glyphs || glyphs.length === 0) return null;

  const pr = Math.max(1, pixelRatio);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(foW * pr));
  canvas.height = Math.max(1, Math.ceil(foH * pr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(pr, pr);
  if (csRoot.overflow === "hidden" || fo.style.overflow === "hidden") {
    ctx.beginPath();
    ctx.rect(0, 0, foW, foH);
    ctx.clip();
  }
  paintGlyphsToCanvas(ctx, glyphs);
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export function liveFontStretchForTextGroup(liveSvg: SVGSVGElement, textId: string): CssFontStretch {
  const g = liveSvg.querySelector(`g[data-fh-text="${CSS.escape(textId)}"]`);
  const el = g?.querySelector("foreignObject")?.firstElementChild as HTMLElement | undefined;
  if (!el) return "normal";
  return parseCssFontStretch(getComputedStyle(el).fontStretch);
}

/**
 * Sustituye cada `foreignObject` de texto por un `<image>` pintado del DOM vivo.
 * Devuelve los ids rasterizados; el resto debe seguir el fallback de trazados.
 */
export async function substituteLiveTextWithRasterImagesInSvg(
  liveSvg: SVGSVGElement,
  svgXml: string,
  textIds: string[],
  pixelRatio = 2,
): Promise<{ svgXml: string; rasterizedIds: Set<string> }> {
  const rasterizedIds = new Set<string>();
  if (typeof document === "undefined" || textIds.length === 0) {
    return { svgXml, rasterizedIds };
  }
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* ignore */
    }
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgXml, "image/svg+xml");
  if (doc.querySelector("parsererror")) return { svgXml, rasterizedIds };

  for (const id of textIds) {
    const liveG = liveSvg.querySelector(`g[data-fh-text="${CSS.escape(id)}"]`);
    const liveFo = liveG?.querySelector("foreignObject") as SVGForeignObjectElement | null;
    if (!liveFo) continue;
    const dataUrl = rasterizeForeignObject(liveSvg, liveFo, pixelRatio);
    if (!dataUrl) continue;

    const exportG = doc.querySelector(`g[data-fh-text="${CSS.escape(id)}"]`);
    if (!exportG) continue;
    const exportFo = exportG.querySelector("foreignObject");
    if (!exportFo) continue;

    const image = doc.createElementNS("http://www.w3.org/2000/svg", "image");
    const x = exportFo.getAttribute("x") ?? String(liveFo.x.baseVal.value);
    const y = exportFo.getAttribute("y") ?? String(liveFo.y.baseVal.value);
    const w = exportFo.getAttribute("width") ?? String(liveFo.width.baseVal.value);
    const h = exportFo.getAttribute("height") ?? String(liveFo.height.baseVal.value);
    image.setAttribute("x", x);
    image.setAttribute("y", y);
    image.setAttribute("width", w);
    image.setAttribute("height", h);
    image.setAttribute("href", dataUrl);
    try {
      image.setAttributeNS("http://www.w3.org/1999/xlink", "href", dataUrl);
    } catch {
      /* ignore */
    }
    image.setAttribute("preserveAspectRatio", "none");
    exportFo.replaceWith(image);
    rasterizedIds.add(id);
  }

  return {
    svgXml: new XMLSerializer().serializeToString(doc.documentElement),
    rasterizedIds,
  };
}
