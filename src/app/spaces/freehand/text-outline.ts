import opentype from "opentype.js";

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

/** TTF conocidos (fallback si hay FontFace pero no tenemos buffer). */
const FONT_URLS: Record<string, string> = {
  Inter: "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf",
  Roboto: "https://github.com/googlefonts/roboto/raw/main/src/hinted/Roboto-Regular.ttf",
  "Open Sans": "https://cdn.jsdelivr.net/gh/googlefonts/opensans@main/fonts/ttf/OpenSans-Regular.ttf",
  Lato: "https://cdn.jsdelivr.net/gh/googlefonts/lato@main/fonts/Lato-Regular.ttf",
  Montserrat: "https://cdn.jsdelivr.net/gh/googlefonts/montserrat@main/fonts/ttf/Montserrat-Regular.ttf",
  "IBM Plex Sans": "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf",
  system: "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf",
};

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
  const buf = userFontBuffers.get(uKey);
  if (buf) return buf;
  const url = FONT_URLS[primary] ?? FONT_URLS.Inter;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.arrayBuffer();
  } catch {
    return null;
  }
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
  const cacheKey = `${primary}|${args.fontWeight}`;
  if (fontCache.has(cacheKey)) return { font: fontCache.get(cacheKey)! };

  const binary = await fetchFontBinary(primary, args.fontWeight);
  if (!binary) return { error: FONT_CONVERSION_UNAVAILABLE };
  try {
    const font = opentype.parse(binary);
    fontCache.set(cacheKey, font);
    return { font };
  } catch {
    return { error: FONT_CONVERSION_UNAVAILABLE };
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

export type TextConversionInput = {
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
};

/** Un path por glifo (o svgPathD si hay contornos múltiples). */
export async function textToGlyphPathPayloads(
  t: TextConversionInput,
  font: opentype.Font,
): Promise<GlyphPathPayload[]> {
  const pad = t.textMode === "area" ? 4 : 0;
  const indent = t.paragraphIndent ?? 0;
  const boxW = t.textMode === "point" ? Math.max(t.width, 32) : t.width;
  const lhPx = t.fontSize * t.lineHeight;
  const lines = t.text.split("\n");
  const ta = t.textAlign === "justify" ? "left" : t.textAlign;
  const useKern = t.fontKerning !== "none";
  const out: GlyphPathPayload[] = [];
  let gIdx = 0;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const baselineY = t.y + pad + t.fontSize + li * lhPx;
    const lineW = measureLineWidth(font, line, t.fontSize, t.letterSpacing, useKern);

    let xCursor: number;
    if (ta === "center") {
      xCursor = t.x + boxW / 2 - lineW / 2;
    } else if (ta === "right") {
      xCursor = t.x + boxW - pad - lineW;
    } else {
      xCursor = t.x + pad + (li === 0 ? indent : 0);
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
  }>,
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
    const payloads = await textToGlyphPathPayloads(
      {
        name: t.name,
        text: t.text,
        textMode: t.textMode,
        x: t.x,
        y: t.y,
        width: t.width,
        height: t.height,
        fontSize: t.fontSize,
        fontWeight: t.fontWeight,
        lineHeight: t.lineHeight,
        letterSpacing: t.letterSpacing,
        fontKerning: t.fontKerning,
        textAlign: t.textAlign,
        paragraphIndent: t.paragraphIndent,
      },
      fontRes.font,
    );
    g.replaceChildren();
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
      if (pathEl) g.appendChild(pathEl);
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
