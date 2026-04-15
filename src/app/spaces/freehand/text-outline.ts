import opentype from "opentype.js";
import type { SpanStyle } from "../indesign/text-model";
import { sanitizeStoryLinkHref } from "../indesign/text-model";

export type VectorPdfTextRun = { text: string; style?: SpanStyle };

/** Opciones solo para PDF multipágina / vector (pasadas desde el modal de export). */
export type VectorPdfExportOptions = {
  /** Detecta `https://…` en texto plano y los convierte en enlaces con estilo (azul/subrayado). */
  makeUrlsClickable?: boolean;
  /** Dibuja un borde fino alrededor del rectángulo de clic de cada enlace (depuración / claridad). */
  outlineLinkRects?: boolean;
};

export const FONT_CONVERSION_UNAVAILABLE = "Fuente no disponible para conversión";

interface Point {
  x: number;
  y: number;
}

export interface OutlineBezierPoint {
  anchor: Point;
  handleIn: Point;
  handleOut: Point;
  vertexMode?: "smooth" | "cusp" | "corner";
}

/** Payload para construir `PathObject` en FreehandStudio (evita import circular). */
export type GlyphPathPayload = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  points: OutlineBezierPoint[];
  closed: boolean;
  /** Contornos múltiples (opentype); si existe, el render usa esto como `d`. */
  svgPathD?: string;
};

/** Fuentes cargadas por el usuario (FontFace) — buffer para opentype. Clave: `family|weight`. */
const userFontBuffers = new Map<string, ArrayBuffer>();

export function registerUserFontBuffer(primaryFamily: string, fontWeight: number, buffer: ArrayBuffer): void {
  const key = `${primaryFamily.trim().toLowerCase()}|${fontWeight}`;
  userFontBuffers.set(key, buffer.slice(0));
}

/** Fallback tipográfico si no hay URL para la familia (Noto ≈ Inter UI). */
const NOTO_SANS_REG =
  "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf";
const NOTO_SANS_BOLD =
  "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Bold.ttf";

/**
 * Slugs en fonts.bunny.net para nombres del selector (Google Fonts en la app).
 * Otras familias: `nombre` → slug `nombre-minúsculas-con-guiones`.
 */
const BUNNY_FAMILY_SLUG: Record<string, string> = {
  inter: "inter",
  roboto: "roboto",
  "open sans": "open-sans",
  lato: "lato",
  montserrat: "montserrat",
  "ibm plex sans": "ibm-plex-sans",
  system: "inter",
};

function normalizeFamilyKey(primary: string): string {
  return primary.trim().toLowerCase();
}

function familyToBunnySlug(primary: string): string {
  const k = normalizeFamilyKey(primary);
  return BUNNY_FAMILY_SLUG[k] ?? k.replace(/\s+/g, "-");
}

async function tryFetchArrayBuffer(url: string): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.arrayBuffer();
  } catch {
    return null;
  }
}

/** opentype.js acepta WOFF; probamos pesos cercanos por si falta un corte. */
function pickLatinFileWeights(requested: number): number[] {
  const r = Math.min(900, Math.max(100, Math.round(requested / 100) * 100));
  const order = [r, 400, 500, 600, 700, 300, 800, 200, 900, 100];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const w of order) {
    if (!seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
  }
  return out;
}

function bunnyLatinWoffUrl(slug: string, fileWeight: number): string {
  return `https://fonts.bunny.net/${slug}/files/${slug}-latin-${fileWeight}-normal.woff`;
}

async function fetchFontFromBunnyNet(slug: string, fontWeight: number): Promise<ArrayBuffer | null> {
  for (const w of pickLatinFileWeights(fontWeight)) {
    const buf = await tryFetchArrayBuffer(bunnyLatinWoffUrl(slug, w));
    if (buf) return buf;
  }
  return null;
}

function notoSansFallbackUrl(fontWeight: number): string {
  return fontWeight >= 600 ? NOTO_SANS_BOLD : NOTO_SANS_REG;
}

const fontCache = new Map<string, opentype.Font>();

export function parsePrimaryFontFamily(fontFamily: string): string {
  const s = fontFamily.trim();
  const m = s.match(/^["']([^"']+)["']/);
  if (m) return m[1].trim();
  const first = s.split(",")[0].trim();
  return first.replace(/^["']|["']$/g, "").trim() || "Inter";
}

function fontFaceCheckString(primary: string, fontWeight: number, fontSize: number): string {
  return `${fontWeight} ${fontSize}px "${primary}"`;
}

export function isFontFaceAvailableForConversion(primary: string, fontWeight: number, fontSize: number): boolean {
  if (typeof document === "undefined" || !document.fonts?.check) return true;
  try {
    return document.fonts.check(fontFaceCheckString(primary, fontWeight, fontSize));
  } catch {
    return true;
  }
}

async function fetchFontBinary(primary: string, fontWeight: number): Promise<ArrayBuffer | null> {
  const uKey = `${primary.toLowerCase()}|${fontWeight}`;
  const userBuf = userFontBuffers.get(uKey);
  if (userBuf) return userBuf;

  const slug = familyToBunnySlug(primary);
  const fromBunny = await fetchFontFromBunnyNet(slug, fontWeight);
  if (fromBunny) return fromBunny;

  const slugAlt = normalizeFamilyKey(primary).replace(/\s+/g, "-");
  if (slugAlt !== slug) {
    const alt = await fetchFontFromBunnyNet(slugAlt, fontWeight);
    if (alt) return alt;
  }

  return await tryFetchArrayBuffer(notoSansFallbackUrl(fontWeight));
}

export async function loadFontForTextConversion(args: {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
}): Promise<{ font: opentype.Font } | { error: string }> {
  const primary = parsePrimaryFontFamily(args.fontFamily);
  if (!isFontFaceAvailableForConversion(primary, args.fontWeight, args.fontSize)) {
    return { error: FONT_CONVERSION_UNAVAILABLE };
  }
  const cacheKey = `${normalizeFamilyKey(primary)}|${args.fontWeight}`;
  if (fontCache.has(cacheKey)) return { font: fontCache.get(cacheKey)! };

  const binary = await fetchFontBinary(primary, args.fontWeight);
  if (!binary) return { error: FONT_CONVERSION_UNAVAILABLE };
  try {
    const font = opentype.parse(binary);
    fontCache.set(cacheKey, font);
    return { font };
  } catch {
    const fb = await tryFetchArrayBuffer(notoSansFallbackUrl(args.fontWeight));
    if (!fb) return { error: FONT_CONVERSION_UNAVAILABLE };
    try {
      const font = opentype.parse(fb);
      fontCache.set(cacheKey, font);
      return { font };
    } catch {
      return { error: FONT_CONVERSION_UNAVAILABLE };
    }
  }
}

/** Convierte comandos opentype.Path → puntos bezier (un subpath cerrado). */
function opentypeCommandsToBezierPoints(commands: opentype.PathCommand[]): OutlineBezierPoint[] {
  const pts: OutlineBezierPoint[] = [];
  let cur = { x: 0, y: 0 };
  for (const cmd of commands) {
    if (cmd.type === "M") {
      cur = { x: (cmd as { x: number; y: number }).x, y: (cmd as { y: number }).y };
      pts.push({
        anchor: { ...cur },
        handleIn: { ...cur },
        handleOut: { ...cur },
        vertexMode: "corner",
      });
    } else if (cmd.type === "L" && pts.length) {
      const x = (cmd as { x: number; y: number }).x;
      const y = (cmd as { y: number }).y;
      const prev = pts[pts.length - 1];
      prev.handleOut = { x: prev.anchor.x + (x - prev.anchor.x) / 3, y: prev.anchor.y + (y - prev.anchor.y) / 3 };
      pts.push({
        anchor: { x, y },
        handleIn: { x: x - (x - prev.anchor.x) / 3, y: y - (y - prev.anchor.y) / 3 },
        handleOut: { x, y },
        vertexMode: "corner",
      });
      cur = { x, y };
    } else if (cmd.type === "C" && pts.length) {
      const c = cmd as { x1: number; y1: number; x2: number; y2: number; x: number; y: number };
      pts[pts.length - 1].handleOut = { x: c.x1, y: c.y1 };
      pts.push({
        anchor: { x: c.x, y: c.y },
        handleIn: { x: c.x2, y: c.y2 },
        handleOut: { x: c.x, y: c.y },
        vertexMode: "smooth",
      });
      cur = { x: c.x, y: c.y };
    } else if (cmd.type === "Q" && pts.length) {
      const c = cmd as { x1: number; y1: number; x: number; y: number };
      const p0 = pts[pts.length - 1].anchor;
      const qp = { x: c.x1, y: c.y1 };
      const p2 = { x: c.x, y: c.y };
      const cp1 = { x: p0.x + (2 / 3) * (qp.x - p0.x), y: p0.y + (2 / 3) * (qp.y - p0.y) };
      const cp2 = { x: p2.x + (2 / 3) * (qp.x - p2.x), y: p2.y + (2 / 3) * (qp.y - p2.y) };
      pts[pts.length - 1].handleOut = cp1;
      pts.push({
        anchor: p2,
        handleIn: cp2,
        handleOut: { ...p2 },
        vertexMode: "smooth",
      });
      cur = p2;
    } else if (cmd.type === "Z" && pts.length > 2) {
      pts[pts.length - 1].handleOut = pts[0].handleIn;
    }
  }
  return pts;
}

function pathCommandsToPayload(name: string, path: opentype.Path, strokeFallback: boolean): GlyphPathPayload | null {
  const d = path.toPathData(2);
  const bb = path.getBoundingBox();
  if (!Number.isFinite(bb.x1) || !d.trim()) return null;
  const w = Math.max(1, bb.x2 - bb.x1);
  const h = Math.max(1, bb.y2 - bb.y1);
  const cmds = path.commands;
  const sub: opentype.PathCommand[][] = [];
  let cur: opentype.PathCommand[] = [];
  for (const c of cmds) {
    if (c.type === "M" && cur.length) {
      sub.push(cur);
      cur = [c];
    } else {
      cur.push(c);
    }
  }
  if (cur.length) sub.push(cur);

  if (sub.length <= 1) {
    const pts = opentypeCommandsToBezierPoints(cmds);
    if (pts.length < 2) return null;
    return {
      name,
      x: bb.x1,
      y: bb.y1,
      width: w,
      height: h,
      points: pts,
      closed: true,
      svgPathD: sub.length === 0 && d ? d : undefined,
    };
  }

  return {
    name,
    x: bb.x1,
    y: bb.y1,
    width: w,
    height: h,
    points: strokeFallback ? opentypeCommandsToBezierPoints(cmds) : [],
    closed: true,
    svgPathD: d,
  };
}

function measureLineWidth(
  font: opentype.Font,
  line: string,
  fontSize: number,
  letterSpacing: number,
  useKerning: boolean,
): number {
  if (!line) return 0;
  const glyphs = font.stringToGlyphs(line);
  const scale = fontSize / font.unitsPerEm;
  let w = 0;
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    let adv = (g.advanceWidth ?? 0) * scale;
    if (useKerning && i < glyphs.length - 1) {
      adv += font.getKerningValue(g, glyphs[i + 1]) * scale;
    }
    w += adv;
    if (i < glyphs.length - 1) w += letterSpacing;
  }
  return w;
}

/**
 * Ajuste de líneas para export PDF/SVG (opentype): mismo criterio que el lienzo en modo área
 * (el texto en memoria suele ser una sola cadena sin \n; el navegador envuelve con CSS).
 */
function wrapParagraphToLinesWithFirstIndent(
  font: opentype.Font,
  paragraph: string,
  fontSize: number,
  letterSpacing: number,
  useKern: boolean,
  maxWidthInner: number,
  firstLineIndent: number,
): { lines: string[]; starts: number[] } {
  if (!paragraph.length) return { lines: [""], starts: [0] };
  const lines: string[] = [];
  const starts: number[] = [];
  let charIdx = 0;
  let isFirstLineOfParagraph = true;

  while (charIdx < paragraph.length) {
    while (charIdx < paragraph.length && paragraph[charIdx] === " ") charIdx++;
    if (charIdx >= paragraph.length) break;

    const wrapW = Math.max(4, maxWidthInner - (isFirstLineOfParagraph ? firstLineIndent : 0));
    isFirstLineOfParagraph = false;

    let lineEnd = charIdx;
    let lastWordBreak = -1;

    while (lineEnd < paragraph.length) {
      const ch = paragraph[lineEnd]!;
      if (ch === "\n") break;
      const seg = paragraph.slice(charIdx, lineEnd + 1);
      const cw = measureLineWidth(font, seg, fontSize, letterSpacing, useKern);
      if (cw > wrapW && lineEnd > charIdx) {
        if (lastWordBreak > charIdx) lineEnd = lastWordBreak;
        break;
      }
      if (ch === " " || ch === "\t") lastWordBreak = lineEnd + 1;
      lineEnd++;
    }

    if (lineEnd === charIdx && charIdx < paragraph.length) {
      lineEnd = charIdx + 1;
    }

    starts.push(charIdx);
    lines.push(paragraph.slice(charIdx, lineEnd).replace(/\s+$/g, ""));
    charIdx = lineEnd;
  }

  return lines.length > 0 ? { lines, starts } : { lines: [""], starts: [0] };
}

export type TextConversionInput = {
  name: string;
  text: string;
  textMode: "point" | "area";
  x: number;
  y: number;
  width: number;
  height: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  fontKerning?: "auto" | "none";
  textAlign: "left" | "center" | "right" | "justify";
  paragraphIndent?: number;
};

type PhysicalLineMeta = { text: string; addParagraphIndent: boolean; globalTextStart: number };

function computePhysicalLines(t: TextConversionInput, font: opentype.Font): PhysicalLineMeta[] {
  const pad = t.textMode === "area" ? 4 : 0;
  const indent = t.paragraphIndent ?? 0;
  const boxW = t.textMode === "point" ? Math.max(t.width, 32) : t.width;
  const innerW = Math.max(4, boxW - 2 * pad);
  const useKern = t.fontKerning !== "none";

  if (t.textMode === "point") {
    const raw = t.text.split("\n");
    let acc = 0;
    return raw.map((text, i) => {
      const row: PhysicalLineMeta = {
        text,
        addParagraphIndent: i === 0,
        globalTextStart: acc,
      };
      acc += text.length + (i < raw.length - 1 ? 1 : 0);
      return row;
    });
  }

  const physicalLines: PhysicalLineMeta[] = [];
  let fullOff = 0;
  const paras = t.text.split(/\r?\n/);
  for (let pi = 0; pi < paras.length; pi++) {
    const para = paras[pi]!;
    const { lines, starts } = wrapParagraphToLinesWithFirstIndent(
      font,
      para,
      t.fontSize,
      t.letterSpacing,
      useKern,
      innerW,
      indent,
    );
    for (let wi = 0; wi < lines.length; wi++) {
      physicalLines.push({
        text: lines[wi]!,
        addParagraphIndent: wi === 0,
        globalTextStart: fullOff + starts[wi]!,
      });
    }
    fullOff += para.length;
    if (pi < paras.length - 1) fullOff += 1;
  }
  return physicalLines;
}

function effPdfWeight(base: number, st?: SpanStyle): number {
  if (!st?.fontWeight) return base;
  const fw = String(st.fontWeight);
  if (fw === "bold" || fw === "700") return Math.max(base, 700);
  const n = parseInt(fw, 10);
  return Number.isFinite(n) ? n : base;
}

function buildCharStyleMap(text: string, runs: Array<{ text: string; style?: SpanStyle }>): (SpanStyle | undefined)[] {
  const map: (SpanStyle | undefined)[] = new Array(text.length);
  let i = 0;
  for (const r of runs) {
    for (let k = 0; k < r.text.length && i < text.length; k++) {
      map[i++] = r.style;
    }
  }
  return map;
}

/** URLs sueltas en el texto (no sustituye enlaces ya definidos en la historia). */
const AUTO_URL_IN_TEXT_RE = /https?:\/\/[^\s<>"'{}|\\^`[\]()]+/gi;

function trimUrlMatchEnd(raw: string): string {
  return raw.replace(/[.,;:!?)\]]+$/u, "");
}

/**
 * Marca caracteres que coinciden con URL en texto plano. Los `linkHref` existentes tienen prioridad.
 */
function applyAutoLinksToCharStyleMap(text: string, map: (SpanStyle | undefined)[]): void {
  AUTO_URL_IN_TEXT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = AUTO_URL_IN_TEXT_RE.exec(text)) !== null) {
    const raw = trimUrlMatchEnd(m[0]);
    const href = sanitizeStoryLinkHref(raw);
    if (!href) continue;
    const a = m.index;
    const b = Math.min(text.length, a + raw.length);
    for (let i = a; i < b; i++) {
      const prevHref = map[i]?.linkHref ? sanitizeStoryLinkHref(map[i]!.linkHref!) : "";
      if (prevHref.length > 0) continue;
      const base = map[i] ?? {};
      map[i] = {
        ...base,
        linkHref: href,
        textUnderline: true,
        color: base.color && base.color !== "none" ? base.color : PDF_LINK_BLUE,
      };
    }
  }
}

function measureLineWidthMixed(
  line: string,
  globalLineStart: number,
  fontSize: number,
  letterSpacing: number,
  useKern: boolean,
  charStyles: (SpanStyle | undefined)[],
  baseWeight: number,
  fontForWeight: (w: number) => opentype.Font,
): number {
  let w = 0;
  for (let i = 0; i < line.length; i++) {
    const gi = globalLineStart + i;
    const st = charStyles[gi];
    const weight = effPdfWeight(baseWeight, st);
    const font = fontForWeight(weight);
    const glyphs = font.stringToGlyphs(line[i]!);
    const glyph = glyphs[0];
    if (!glyph) continue;
    const scale = fontSize / font.unitsPerEm;
    let adv = (glyph.advanceWidth ?? 0) * scale;
    if (useKern && i < line.length - 1) {
      const gn = font.stringToGlyphs(line[i + 1]!);
      const g2 = gn[0];
      if (g2) adv += font.getKerningValue(glyph, g2) * scale;
    }
    w += adv;
    if (i < line.length - 1) w += letterSpacing;
  }
  return w;
}

/** Posición X izquierda de cada carácter en la línea; `lefts[i+1]-lefts[i]` = avance. */
function measureLineCharLeftEdges(
  line: string,
  globalLineStart: number,
  startX: number,
  fontSize: number,
  letterSpacing: number,
  useKern: boolean,
  charStyles: (SpanStyle | undefined)[],
  baseWeight: number,
  fontForWeight: (w: number) => opentype.Font,
): number[] {
  const lefts = new Array<number>(line.length + 1);
  let x = startX;
  lefts[0] = x;
  for (let i = 0; i < line.length; i++) {
    const gi = globalLineStart + i;
    const st = charStyles[gi];
    const weight = effPdfWeight(baseWeight, st);
    const font = fontForWeight(weight);
    const ch = line[i]!;
    if (ch === "\r") {
      lefts[i + 1] = x;
      continue;
    }
    const glyphs = font.stringToGlyphs(ch);
    const glyph = glyphs[0];
    if (!glyph) {
      x += letterSpacing;
      lefts[i + 1] = x;
      continue;
    }
    const scale = fontSize / font.unitsPerEm;
    let adv = (glyph.advanceWidth ?? 0) * scale;
    if (useKern && i < line.length - 1) {
      const g2 = font.stringToGlyphs(line[i + 1]!)[0];
      if (g2) adv += font.getKerningValue(glyph, g2) * scale;
    }
    x += adv + letterSpacing;
    lefts[i + 1] = x;
  }
  return lefts;
}

const PDF_LINK_BLUE = "#38bdf8";

function wantsUnderlineForPdf(st?: SpanStyle): boolean {
  if (!st) return false;
  const href = st.linkHref ? sanitizeStoryLinkHref(st.linkHref) : "";
  if (href.length > 0) return true;
  return !!st.textUnderline;
}

function underlineStrokeColor(st: SpanStyle | undefined, defaultFill: string): string {
  const href = st?.linkHref ? sanitizeStoryLinkHref(st.linkHref) : "";
  if (href.length > 0) {
    return st?.color && st.color !== "none" ? st.color : PDF_LINK_BLUE;
  }
  if (st?.color && st.color !== "none") return st.color;
  return defaultFill;
}

function strikeStrokeColor(st: SpanStyle | undefined, defaultFill: string): string {
  if (st?.color && st.color !== "none") return st.color;
  return defaultFill;
}

function effectiveGlyphFill(
  st: SpanStyle | undefined,
  defaultFillColor: string,
  stroked: boolean,
): string {
  if (stroked) return "none";
  const href = st?.linkHref ? sanitizeStoryLinkHref(st.linkHref) : "";
  if (href.length > 0) {
    return st?.color && st.color !== "none" ? st.color : PDF_LINK_BLUE;
  }
  if (st?.color && st.color !== "none") return st.color;
  return defaultFillColor;
}

/**
 * Área clic PDF alineada al trazado real del glifo (bbox del path opentype).
 * Evita el desfase ~20–40px que daban solo ascender/descender de la fuente vs svg2pdf.
 */
function linkHitRectFromGlyphPath(path: opentype.Path): { x: number; y: number; width: number; height: number } | null {
  const bb = path.getBoundingBox();
  if (bb.isEmpty()) return null;
  const w = bb.x2 - bb.x1;
  const h = bb.y2 - bb.y1;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { x: bb.x1, y: bb.y1, width: w, height: Math.max(0.25, h) };
}

function unionLinkHitRects(
  rects: { x: number; y: number; width: number; height: number }[],
): { x: number; y: number; width: number; height: number } | null {
  if (rects.length === 0) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const r of rects) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.width);
    y2 = Math.max(y2, r.y + r.height);
  }
  if (!Number.isFinite(x1) || !Number.isFinite(y1)) return null;
  const w = x2 - x1;
  const h = y2 - y1;
  if (w <= 0 || h <= 0) return null;
  return { x: x1, y: y1, width: w, height: Math.max(0.25, h) };
}

export type PdfGlyphPaintOp = {
  d: string;
  fill: string;
  strokeAttr: string;
  op: string;
  linkHref?: string;
  /** Rectángulo invisible (área clic PDF por glifo); coincide con bbox del path del glifo. */
  linkHitRect?: { x: number; y: number; width: number; height: number };
  /**
   * Solo en el primer glifo de un tramo de enlace cuando `outlineLinkRects`: bbox unión de todo el tramo
   * (palabra/URL completa en la línea), para dibujar un solo recuadro.
   */
  linkSpanOutlineRect?: { x: number; y: number; width: number; height: number };
};

type PdfTextExtras = { stroke?: string; strokeWidth?: number; opacity?: number };

/**
 * Texto enriquecido (negrita, color, subrayado, enlaces) → paths SVG para PDF vectorial.
 */
export async function richTextToGlyphPaintOps(
  t: TextConversionInput,
  runs: Array<{ text: string; style?: SpanStyle }>,
  baseFont: opentype.Font,
  defaultFillColor: string,
  extras?: PdfTextExtras,
  pdfOpts?: VectorPdfExportOptions,
): Promise<PdfGlyphPaintOp[]> {
  const pad = t.textMode === "area" ? 4 : 0;
  const indent = t.paragraphIndent ?? 0;
  const boxW = t.textMode === "point" ? Math.max(t.width, 32) : t.width;
  const lhPx = t.fontSize * t.lineHeight;
  const useKern = t.fontKerning !== "none";
  const ta = t.textAlign === "justify" ? "left" : t.textAlign;
  const charStyles = buildCharStyleMap(t.text, runs);
  if (pdfOpts?.makeUrlsClickable) {
    applyAutoLinksToCharStyleMap(t.text, charStyles);
  }
  const weights = new Set<number>();
  weights.add(t.fontWeight);
  for (let i = 0; i < t.text.length; i++) {
    weights.add(effPdfWeight(t.fontWeight, charStyles[i]));
  }
  const fontByWeight = new Map<number, opentype.Font>();
  for (const w of weights) {
    const res = await loadFontForTextConversion({ fontFamily: t.fontFamily, fontSize: t.fontSize, fontWeight: w });
    if ("error" in res) fontByWeight.set(w, baseFont);
    else fontByWeight.set(w, res.font);
  }
  const pickFont = (w: number) => fontByWeight.get(w) ?? baseFont;

  const physicalLines = computePhysicalLines(t, baseFont);
  const out: PdfGlyphPaintOp[] = [];
  const sw = extras?.strokeWidth ?? 0;
  const strokeAttr =
    extras?.stroke && extras.stroke !== "none" && sw > 0
      ? ` stroke="${escapeXml(extras.stroke)}" stroke-width="${sw}"`
      : "";
  const op = extras?.opacity != null && extras.opacity !== 1 ? ` opacity="${extras.opacity}"` : "";

  let gIdx = 0;
  for (let li = 0; li < physicalLines.length; li++) {
    const { text: line, addParagraphIndent, globalTextStart } = physicalLines[li]!;
    const baselineY = t.y + pad + t.fontSize + li * lhPx;
    const lineW = measureLineWidthMixed(
      line,
      globalTextStart,
      t.fontSize,
      t.letterSpacing,
      useKern,
      charStyles,
      t.fontWeight,
      pickFont,
    );
    const indentPx = addParagraphIndent ? indent : 0;

    let xCursor: number;
    if (ta === "center") {
      xCursor = t.x + boxW / 2 - lineW / 2;
    } else if (ta === "right") {
      xCursor = t.x + boxW - pad - lineW;
    } else {
      xCursor = t.x + pad + indentPx;
    }

    const lefts = measureLineCharLeftEdges(
      line,
      globalTextStart,
      xCursor,
      t.fontSize,
      t.letterSpacing,
      useKern,
      charStyles,
      t.fontWeight,
      pickFont,
    );

    const linkLineBuf: Array<{
      outIndex: number;
      gi: number;
      hr: { x: number; y: number; width: number; height: number };
    }> = [];

    const underlineY = baselineY + Math.max(1.5, t.fontSize * 0.105);
    const strikeY = baselineY - t.fontSize * 0.31;
    const decoW = Math.max(0.65, Math.min(2.75, t.fontSize * 0.055));

    for (let i = 0; i < line.length; i++) {
      const gi = globalTextStart + i;
      const st = charStyles[gi];
      const weight = effPdfWeight(t.fontWeight, st);
      const font = pickFont(weight);
      const stroked = !!(extras?.stroke && extras.stroke !== "none" && sw > 0);
      const fillColor = effectiveGlyphFill(st, defaultFillColor, stroked);

      const ch = line[i]!;
      if (ch === "\r") continue;
      const xAt = lefts[i]!;
      const glyphs = font.stringToGlyphs(ch);
      const glyph = glyphs[0];
      if (!glyph) continue;

      const linkRaw = st?.linkHref ? sanitizeStoryLinkHref(st.linkHref) : "";

      if (!glyph.path || glyph.path.commands.length === 0) continue;

      const path = glyph.getPath(xAt, baselineY, t.fontSize);
      const payload = pathCommandsToPayload(`${t.name}·${gIdx}`, path, true);
      if (payload) {
        const d = payload.svgPathD && payload.svgPathD.length > 0 ? payload.svgPathD : pathPayloadToSvgD(payload);
        if (d) {
          const opBase: PdfGlyphPaintOp = {
            d,
            fill: fillColor,
            strokeAttr,
            op,
            linkHref: linkRaw || undefined,
          };
          if (linkRaw) {
            const hr = linkHitRectFromGlyphPath(path);
            if (hr) opBase.linkHitRect = hr;
          }
          out.push(opBase);
          if (pdfOpts?.outlineLinkRects && linkRaw && opBase.linkHitRect) {
            linkLineBuf.push({ outIndex: out.length - 1, gi, hr: opBase.linkHitRect });
          }
          gIdx++;
        }
      }
    }

    if (pdfOpts?.outlineLinkRects && linkLineBuf.length > 0) {
      let segCh = 0;
      while (segCh < line.length) {
        const gi0 = globalTextStart + segCh;
        const lr0 = charStyles[gi0]?.linkHref ? sanitizeStoryLinkHref(charStyles[gi0]!.linkHref!) : "";
        if (!lr0) {
          segCh++;
          continue;
        }
        let endCh = segCh + 1;
        while (endCh < line.length) {
          const lx = charStyles[globalTextStart + endCh]?.linkHref
            ? sanitizeStoryLinkHref(charStyles[globalTextStart + endCh]!.linkHref!)
            : "";
          if (lx !== lr0) break;
          endCh++;
        }
        const gMin = globalTextStart + segCh;
        const gMax = globalTextStart + endCh;
        const hrs = linkLineBuf.filter((e) => e.gi >= gMin && e.gi < gMax).map((e) => e.hr);
        const merged = unionLinkHitRects(hrs);
        if (merged) {
          const first = linkLineBuf.find((e) => e.gi >= gMin && e.gi < gMax);
          if (first) {
            const glyphOp = out[first.outIndex];
            if (glyphOp) glyphOp.linkSpanOutlineRect = merged;
          }
        }
        segCh = endCh;
      }
    }

    let ui = 0;
    while (ui < line.length) {
      const st = charStyles[globalTextStart + ui];
      if (!wantsUnderlineForPdf(st)) {
        ui++;
        continue;
      }
      const c0 = underlineStrokeColor(st, defaultFillColor);
      let uj = ui + 1;
      while (uj < line.length) {
        const stj = charStyles[globalTextStart + uj];
        if (!wantsUnderlineForPdf(stj)) break;
        if (underlineStrokeColor(stj, defaultFillColor) !== c0) break;
        uj++;
      }
      const x1 = lefts[ui]!;
      const x2 = lefts[uj]!;
      if (x2 - x1 > 0.2) {
        out.push({
          d: `M ${x1} ${underlineY} L ${x2} ${underlineY}`,
          fill: "none",
          strokeAttr: ` stroke="${escapeXml(c0)}" stroke-width="${decoW}" stroke-linecap="butt"`,
          op,
        });
      }
      ui = uj;
    }

    let si = 0;
    while (si < line.length) {
      const st = charStyles[globalTextStart + si];
      if (!st?.textStrikethrough) {
        si++;
        continue;
      }
      const c0 = strikeStrokeColor(st, defaultFillColor);
      let sj = si + 1;
      while (sj < line.length) {
        const stj = charStyles[globalTextStart + sj];
        if (!stj?.textStrikethrough) break;
        if (strikeStrokeColor(stj, defaultFillColor) !== c0) break;
        sj++;
      }
      const x1 = lefts[si]!;
      const x2 = lefts[sj]!;
      if (x2 - x1 > 0.2) {
        out.push({
          d: `M ${x1} ${strikeY} L ${x2} ${strikeY}`,
          fill: "none",
          strokeAttr: ` stroke="${escapeXml(c0)}" stroke-width="${decoW}" stroke-linecap="butt"`,
          op,
        });
      }
      si = sj;
    }
  }

  return out;
}

/** Un path por glifo (o svgPathD si hay contornos múltiples). */
export async function textToGlyphPathPayloads(
  t: TextConversionInput,
  font: opentype.Font,
): Promise<GlyphPathPayload[]> {
  const pad = t.textMode === "area" ? 4 : 0;
  const indent = t.paragraphIndent ?? 0;
  const boxW = t.textMode === "point" ? Math.max(t.width, 32) : t.width;
  const lhPx = t.fontSize * t.lineHeight;
  const useKern = t.fontKerning !== "none";
  const physicalLines = computePhysicalLines(t, font);
  const ta = t.textAlign === "justify" ? "left" : t.textAlign;
  const out: GlyphPathPayload[] = [];
  let gIdx = 0;

  for (let li = 0; li < physicalLines.length; li++) {
    const { text: line, addParagraphIndent } = physicalLines[li]!;
    const baselineY = t.y + pad + t.fontSize + li * lhPx;
    const lineW = measureLineWidth(font, line, t.fontSize, t.letterSpacing, useKern);
    const indentPx = addParagraphIndent ? indent : 0;

    let xCursor: number;
    if (ta === "center") {
      xCursor = t.x + boxW / 2 - lineW / 2;
    } else if (ta === "right") {
      xCursor = t.x + boxW - pad - lineW;
    } else {
      xCursor = t.x + pad + indentPx;
    }

    const glyphs = font.stringToGlyphs(line);
    const scale = t.fontSize / font.unitsPerEm;
    for (let i = 0; i < glyphs.length; i++) {
      const glyph = glyphs[i];
      const ch = line[i] ?? "";
      if (ch === "\r") continue;

      let adv = (glyph.advanceWidth ?? 0) * scale;
      if (useKern && i < glyphs.length - 1) {
        adv += font.getKerningValue(glyph, glyphs[i + 1]) * scale;
      }

      if (!glyph.path || glyph.path.commands.length === 0) {
        xCursor += adv + t.letterSpacing;
        continue;
      }

      const path = glyph.getPath(xCursor, baselineY, t.fontSize);
      const payload = pathCommandsToPayload(`${t.name} · ${gIdx}`, path, true);
      if (payload) {
        out.push(payload);
        gIdx += 1;
      }
      xCursor += adv + t.letterSpacing;
    }
  }

  return out;
}

/** PDF: sustituir grupos `data-fh-text` por paths SVG (sin tocar el documento en vivo). */
export async function substituteTextWithOutlinedPathsInSvg(
  svgXml: string,
  texts: Array<{
    id: string;
    name: string;
    text: string;
    textMode: "point" | "area";
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    fontWeight: number;
    lineHeight: number;
    letterSpacing: number;
    fontKerning?: "auto" | "none";
    textAlign: "left" | "center" | "right" | "justify";
    paragraphIndent?: number;
    fontFamily: string;
    fillColor: string;
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
    /** Si viene de Designer (`_designerRichSpans`), conserva negrita/color/enlaces en el PDF. */
    richRuns?: VectorPdfTextRun[];
  }>,
  pdfOpts?: VectorPdfExportOptions,
): Promise<string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgXml, "image/svg+xml");
  if (doc.querySelector("parsererror")) return svgXml;

  for (const t of texts) {
    const g = doc.querySelector(`g[data-fh-text="${t.id}"]`);
    if (!g) continue;
    const fontRes = await loadFontForTextConversion({
      fontFamily: t.fontFamily,
      fontSize: t.fontSize,
      fontWeight: t.fontWeight,
    });
    if ("error" in fontRes) {
      g.querySelectorAll("foreignObject").forEach((el) => el.remove());
      continue;
    }
    const conv: TextConversionInput = {
      name: t.name,
      text: t.text,
      textMode: t.textMode,
      x: t.x,
      y: t.y,
      width: t.width,
      height: t.height,
      fontFamily: t.fontFamily,
      fontSize: t.fontSize,
      fontWeight: t.fontWeight,
      lineHeight: t.lineHeight,
      letterSpacing: t.letterSpacing,
      fontKerning: t.fontKerning,
      textAlign: t.textAlign,
      paragraphIndent: t.paragraphIndent,
    };
    g.replaceChildren();
    const useRich = !!(t.richRuns && t.richRuns.length > 0);
    const useRichPipeline = useRich || !!pdfOpts?.makeUrlsClickable;

    if (useRichPipeline) {
      const runs = useRich ? t.richRuns! : [{ text: t.text }];
      const ops = await richTextToGlyphPaintOps(
        conv,
        runs,
        fontRes.font,
        t.fillColor,
        {
          stroke: t.stroke,
          strokeWidth: t.strokeWidth,
          opacity: t.opacity,
        },
        pdfOpts,
      );
      for (const op of ops) {
        const frag = parser.parseFromString(
          `<svg xmlns="http://www.w3.org/2000/svg"><path d="${escapeXml(op.d)}" fill="${escapeXml(op.fill)}"${op.strokeAttr}${op.op}/></svg>`,
          "image/svg+xml",
        );
        const pathEl = frag.querySelector("path");
        if (!pathEl) continue;
        const pathImported = doc.importNode(pathEl, true);
        if (op.linkHref) {
          const aEl = doc.createElementNS("http://www.w3.org/2000/svg", "a");
          aEl.setAttribute("href", op.linkHref);
          try {
            aEl.setAttributeNS("http://www.w3.org/1999/xlink", "href", op.linkHref);
          } catch {
            /* ignore */
          }
          aEl.setAttribute("target", "_blank");
          aEl.setAttribute("rel", "noopener noreferrer");
          if (op.linkHitRect) {
            const hr = op.linkSpanOutlineRect ?? op.linkHitRect;
            const hit = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
            hit.setAttribute("x", String(hr.x));
            hit.setAttribute("y", String(hr.y));
            hit.setAttribute("width", String(hr.width));
            hit.setAttribute("height", String(hr.height));
            hit.setAttribute("fill", "none");
            /** Un solo recuadro visible por tramo de enlace (`linkSpanOutlineRect` solo en el 1.er glifo del tramo). */
            const outlineVisible = !!(pdfOpts?.outlineLinkRects && op.linkSpanOutlineRect);
            if (outlineVisible) {
              hit.setAttribute("stroke", "rgba(37,99,235,0.75)");
              hit.setAttribute("stroke-width", "0.35");
              hit.setAttribute("vector-effect", "non-scaling-stroke");
            } else {
              hit.setAttribute("stroke", "none");
            }
            aEl.appendChild(hit);
          }
          aEl.appendChild(pathImported);
          g.appendChild(aEl);
        } else {
          g.appendChild(pathImported);
        }
      }
    } else {
      const payloads = await textToGlyphPathPayloads(conv, fontRes.font);
      const strokeAttr =
        t.stroke && t.stroke !== "none" && (t.strokeWidth ?? 0) > 0
          ? ` stroke="${escapeXml(t.stroke)}" stroke-width="${t.strokeWidth}"`
          : "";
      const op = t.opacity != null && t.opacity !== 1 ? ` opacity="${t.opacity}"` : "";
      for (const p of payloads) {
        const d = p.svgPathD && p.svgPathD.length > 0 ? p.svgPathD : pathPayloadToSvgD(p);
        if (!d) continue;
        const frag = parser.parseFromString(
          `<svg xmlns="http://www.w3.org/2000/svg"><path d="${escapeXml(d)}" fill="${escapeXml(t.fillColor)}"${strokeAttr}${op}/></svg>`,
          "image/svg+xml",
        );
        const pathEl = frag.querySelector("path");
        if (pathEl) g.appendChild(doc.importNode(pathEl, true));
      }
    }
  }
  return new XMLSerializer().serializeToString(doc.documentElement);
}

function pathPayloadToSvgD(p: GlyphPathPayload): string {
  if (p.svgPathD) return p.svgPathD;
  if (p.points.length === 0) return "";
  let d = `M ${p.points[0].anchor.x} ${p.points[0].anchor.y}`;
  for (let i = 1; i < p.points.length; i++) {
    const prev = p.points[i - 1];
    const curr = p.points[i];
    d += ` C ${prev.handleOut.x} ${prev.handleOut.y} ${curr.handleIn.x} ${curr.handleIn.y} ${curr.anchor.x} ${curr.anchor.y}`;
  }
  if (p.closed && p.points.length > 1) {
    const last = p.points[p.points.length - 1];
    const first = p.points[0];
    d += ` C ${last.handleOut.x} ${last.handleOut.y} ${first.handleIn.x} ${first.handleIn.y} ${first.anchor.x} ${first.anchor.y} Z`;
  }
  return d;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** @deprecated Usar `textToGlyphPathPayloads` + loadFontForTextConversion */
export async function textToOutlinePaths(
  text: string,
  fontFamily: string,
  fontSize: number,
  fontWeight: number,
  originX: number,
  originY: number,
): Promise<{ points: OutlineBezierPoint[]; closed: boolean } | null> {
  const res = await loadFontForTextConversion({ fontFamily, fontSize, fontWeight });
  if ("error" in res) return null;
  const payloads = await textToGlyphPathPayloads(
    {
      name: "T",
      text,
      textMode: "point",
      x: originX,
      y: originY - fontSize,
      width: 400,
      height: 40,
      fontFamily,
      fontSize,
      fontWeight,
      lineHeight: 1.2,
      letterSpacing: 0,
      textAlign: "left",
    },
    res.font,
  );
  if (payloads.length === 0) return null;
  const merged = payloads.flatMap((p) => p.points);
  if (merged.length < 2) return null;
  return { points: merged, closed: true };
}
