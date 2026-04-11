/**
 * Importación de SVG → objetos Freehand (rect, ellipse, path, text, image, grupos).
 * Contornos complejos (filter, clipPath, use/symbol) se omiten; opcional aviso agregado.
 */

import type { FillAppearance, GradientStop } from "./fill";
import { solidFill, defaultLinearGradient, migrateFill } from "./fill";

export type SvgImportOptions = {
  /** Generador de ids únicos (p.ej. uid del studio). */
  newId: () => string;
  /** Centro del lienzo donde colocar el grupo importado (coordenadas mundo). */
  targetCenter: { x: number; y: number };
  /** Si existe, escalar para encajar dentro manteniendo proporción (factor máx 1). */
  fitInside?: { x: number; y: number; w: number; h: number } | null;
};

export type SvgImportResult<TObject> = {
  objects: TObject[];
  warning?: string;
};

type ParsedGradient =
  | {
      kind: "linear";
      id: string;
      units: "userSpaceOnUse" | "objectBoundingBox";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stops: GradientStop[];
    }
  | {
      kind: "radial";
      id: string;
      units: "userSpaceOnUse" | "objectBoundingBox";
      cx: number;
      cy: number;
      r: number;
      fx?: number;
      fy?: number;
      stops: GradientStop[];
    };

function parseFloatAttr(el: Element, name: string, def: number): number {
  const v = el.getAttribute(name);
  if (v == null || v === "") return def;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : def;
}

function parseOpacity(el: Element): number {
  const o = parseFloatAttr(el, "opacity", 1);
  const fo = parseFloatAttr(el, "fill-opacity", 1);
  return Math.max(0, Math.min(1, o * fo));
}

function parseStrokeOpacity(el: Element): number {
  const o = parseFloatAttr(el, "opacity", 1);
  const so = parseFloatAttr(el, "stroke-opacity", 1);
  return Math.max(0, Math.min(1, o * so));
}

/** Parser mínimo de `transform` para SVG (translate, scale, rotate, matrix). */
export function parseSvgTransform(attr: string | null): DOMMatrix {
  const acc = new DOMMatrix();
  if (!attr || !attr.trim()) return acc;
  const re =
    /(matrix|translate|scale|rotate)\s*\(\s*([^)]+)\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attr)) !== null) {
    const cmd = m[1].toLowerCase();
    const nums = m[2]
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((s) => parseFloat(s))
      .filter((n) => Number.isFinite(n));
    if (cmd === "matrix" && nums.length >= 6) {
      acc.multiplySelf(new DOMMatrix([nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]]));
    } else if (cmd === "translate") {
      acc.translateSelf(nums[0] ?? 0, nums[1] ?? 0);
    } else if (cmd === "scale") {
      if (nums.length >= 2) acc.scaleSelf(nums[0], nums[1]);
      else acc.scaleSelf(nums[0] ?? 1, nums[0] ?? 1);
    } else if (cmd === "rotate") {
      const deg = nums[0] ?? 0;
      if (nums.length >= 3) {
        const cx = nums[1], cy = nums[2];
        acc.translateSelf(cx, cy);
        acc.rotateSelf(deg);
        acc.translateSelf(-cx, -cy);
      } else {
        acc.rotateSelf(deg);
      }
    }
  }
  return acc;
}

function parseStops(gradEl: Element): GradientStop[] {
  const stops: GradientStop[] = [];
  gradEl.querySelectorAll("stop").forEach((s) => {
    const off = s.getAttribute("offset") || "0";
    let pos = 0;
    if (off.endsWith("%")) pos = parseFloat(off) || 0;
    else pos = (parseFloat(off) || 0) * 100;
    let color = s.getAttribute("stop-color") || "#000000";
    const sc = s.getAttribute("style");
    if (sc && sc.includes("stop-color")) {
      const mm = sc.match(/stop-color:\s*([^;]+)/);
      if (mm) color = mm[1].trim();
    }
    const op = parseFloatAttr(s, "stop-opacity", 1);
    stops.push({ color: color.trim(), opacity: Math.max(0, Math.min(1, op)), position: Math.max(0, Math.min(100, pos)) });
  });
  if (stops.length === 0) {
    return [
      { color: "#000000", opacity: 1, position: 0 },
      { color: "#ffffff", opacity: 1, position: 100 },
    ];
  }
  stops.sort((a, b) => a.position - b.position);
  return stops;
}

function collectDefs(root: Element): Map<string, ParsedGradient> {
  const map = new Map<string, ParsedGradient>();
  root.querySelectorAll("linearGradient").forEach((el) => {
    const id = el.getAttribute("id");
    if (!id) return;
    const u = (el.getAttribute("gradientUnits") || "objectBoundingBox").trim();
    const units = u === "userSpaceOnUse" ? "userSpaceOnUse" : "objectBoundingBox";
    const x1 = parseFloatAttr(el, "x1", 0);
    const y1 = parseFloatAttr(el, "y1", 0);
    const x2 = parseFloatAttr(el, "x2", 1);
    const y2 = parseFloatAttr(el, "y2", 0);
    map.set(id, {
      kind: "linear",
      id,
      units,
      x1,
      y1,
      x2,
      y2,
      stops: parseStops(el),
    });
  });
  root.querySelectorAll("radialGradient").forEach((el) => {
    const id = el.getAttribute("id");
    if (!id) return;
    const u = (el.getAttribute("gradientUnits") || "objectBoundingBox").trim();
    const units = u === "userSpaceOnUse" ? "userSpaceOnUse" : "objectBoundingBox";
    map.set(id, {
      kind: "radial",
      id,
      units,
      cx: parseFloatAttr(el, "cx", 0.5),
      cy: parseFloatAttr(el, "cy", 0.5),
      r: parseFloatAttr(el, "r", 0.5),
      fx: el.hasAttribute("fx") ? parseFloatAttr(el, "fx", 0.5) : undefined,
      fy: el.hasAttribute("fy") ? parseFloatAttr(el, "fy", 0.5) : undefined,
      stops: parseStops(el),
    });
  });
  return map;
}

function resolveUrlFill(
  raw: string,
  defs: Map<string, ParsedGradient>,
  objBox: { x: number; y: number; w: number; h: number },
  _newObjId: string,
): FillAppearance {
  const m = raw.match(/url\s*\(\s*#([^)]+)\s*\)/);
  if (!m) return solidFill("#000000");
  const id = m[1].trim();
  const g = defs.get(id);
  if (!g) return solidFill("#000000");
  if (g.kind === "linear") {
    if (g.units === "objectBoundingBox") {
      return migrateFill({
        type: "gradient-linear",
        stops: g.stops.map((s) => ({ ...s })),
        x1: g.x1,
        y1: g.y1,
        x2: g.x2,
        y2: g.y2,
      });
    }
    const { x, y, w, h } = objBox;
    if (w < 1e-9 || h < 1e-9) return defaultLinearGradient();
    return {
      type: "gradient-linear",
      stops: g.stops.map((s) => ({ ...s })),
      x1: (g.x1 - x) / w,
      y1: (g.y1 - y) / h,
      x2: (g.x2 - x) / w,
      y2: (g.y2 - y) / h,
    };
  }
  if (g.units === "objectBoundingBox") {
    return {
      type: "gradient-radial",
      stops: g.stops.map((s) => ({ ...s })),
      cx: g.cx,
      cy: g.cy,
      r: g.r,
      fx: g.fx,
      fy: g.fy,
    };
  }
  const { x, y, w, h } = objBox;
  if (w < 1e-9 || h < 1e-9) return migrateFill(defaultLinearGradient());
  return {
    type: "gradient-radial",
    stops: g.stops.map((s) => ({ ...s })),
    cx: (g.cx - x) / w,
    cy: (g.cy - y) / h,
    r: g.r / Math.max(w, h),
    fx: g.fx != null ? (g.fx - x) / w : undefined,
    fy: g.fy != null ? (g.fy - y) / h : undefined,
  };
}

function parsePaint(
  el: Element,
  attr: "fill" | "stroke",
  defs: Map<string, ParsedGradient>,
  objBox: { x: number; y: number; w: number; h: number },
  objId: string,
  fallback: string,
): string | FillAppearance {
  const raw = (el.getAttribute(attr) ?? "").trim();
  if (!raw || raw === "none") return "none";
  if (raw.startsWith("url(")) return resolveUrlFill(raw, defs, objBox, objId);
  return raw;
}

function pathBBoxFromD(d: string): { x: number; y: number; w: number; h: number } {
  if (typeof document === "undefined") return { x: 0, y: 0, w: 100, h: 100 };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "1");
  svg.setAttribute("height", "1");
  svg.style.cssText = "position:fixed;left:-9999px;top:0;visibility:hidden";
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  svg.appendChild(path);
  document.body.appendChild(svg);
  try {
    const bb = path.getBBox();
    return { x: bb.x, y: bb.y, w: Math.max(bb.width, 1), h: Math.max(bb.height, 1) };
  } catch {
    return { x: 0, y: 0, w: 100, h: 100 };
  } finally {
    document.body.removeChild(svg);
  }
}

/** Bounding box del path con `transform` aplicado (coordenadas de usuario del SVG raíz). */
function pathBBoxWithMatrix(d: string, m: DOMMatrix): { x: number; y: number; w: number; h: number } {
  if (typeof document === "undefined") return { x: 0, y: 0, w: 100, h: 100 };
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", "8000");
  svg.setAttribute("height", "8000");
  svg.style.cssText = "position:fixed;left:-9999px;top:0;visibility:hidden;overflow:visible";
  const g = document.createElementNS(ns, "g");
  g.setAttribute("transform", `matrix(${m.a},${m.b},${m.c},${m.d},${m.e},${m.f})`);
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", d);
  g.appendChild(path);
  svg.appendChild(g);
  document.body.appendChild(svg);
  try {
    const bb = g.getBBox();
    return { x: bb.x, y: bb.y, w: Math.max(bb.width, 1), h: Math.max(bb.height, 1) };
  } catch {
    return pathBBoxFromD(d);
  } finally {
    document.body.removeChild(svg);
  }
}

/** Traslada coordenadas absolutas en `d` (heurística: pares x,y en orden de aparición). */
function translatePathD(d: string, dx: number, dy: number): string {
  if (dx === 0 && dy === 0) return d;
  let numIdx = 0;
  return d.replace(/[-+]?[0-9]*\.?[0-9]+([eE][-+]?\d+)?/g, (m) => {
    const n = parseFloat(m);
    const t = numIdx % 2 === 0 ? dx : dy;
    numIdx++;
    return String(Math.round((n + t) * 1000) / 1000);
  });
}

function scaleSvgPathD(d: string, scale: number): string {
  if (scale === 1 || !d) return d;
  return d.replace(/[-+]?[0-9]*\.?[0-9]+([eE][-+]?\d+)?/g, (m) => {
    const n = parseFloat(m) * scale;
    return String(Math.round(n * 1000) / 1000);
  });
}

function polygonToPathD(pointsAttr: string, close: boolean): string {
  const pts = pointsAttr
    .trim()
    .split(/[\s,]+/)
    .map((s) => parseFloat(s))
    .filter((n) => Number.isFinite(n));
  if (pts.length < 2) return "";
  let d = `M ${pts[0]} ${pts[1]}`;
  for (let i = 2; i < pts.length; i += 2) {
    d += ` L ${pts[i]} ${pts[i + 1]}`;
  }
  if (close) d += " Z";
  return d;
}

type Gid = { groupId?: string };

export type SvgImportShape =
  | ({
      kind: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      rx: number;
      fill: FillAppearance | string;
      stroke: string;
      strokeWidth: number;
      opacity: number;
      rotation: number;
    } & Gid)
  | ({
      kind: "ellipse";
      x: number;
      y: number;
      width: number;
      height: number;
      fill: FillAppearance | string;
      stroke: string;
      strokeWidth: number;
      opacity: number;
      rotation: number;
    } & Gid)
  | ({
      kind: "path";
      x: number;
      y: number;
      width: number;
      height: number;
      /** Coordenadas del atributo `d` tal como salen del parseo (antes del encaje al lienzo). */
      svgPathD: string;
      /**
       * Escala uniforme + traslación del lote import: P' = matrix(a,b,c,d,e,f) × P.
       * Sin reescribir `d` (evita romper arcos, H/V, etc.).
       */
      svgPathMatrix?: { a: number; b: number; c: number; d: number; e: number; f: number };
      closed: boolean;
      fill: FillAppearance | string;
      stroke: string;
      strokeWidth: number;
      opacity: number;
      rotation: number;
    } & Gid)
  | ({
      kind: "text";
      x: number;
      y: number;
      width: number;
      height: number;
      text: string;
      fontFamily: string;
      fontSize: number;
      fontWeight: number;
      fill: FillAppearance | string;
      stroke: string;
      strokeWidth: number;
      opacity: number;
      rotation: number;
    } & Gid)
  | ({
      kind: "image";
      x: number;
      y: number;
      width: number;
      height: number;
      href: string;
      opacity: number;
      rotation: number;
    } & Gid);

export function shapesToPlainBounds(shapes: SvgImportShape[]): { x: number; y: number; w: number; h: number } {
  if (shapes.length === 0) return { x: 0, y: 0, w: 1, h: 1 };
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const s of shapes) {
    x1 = Math.min(x1, s.x);
    y1 = Math.min(y1, s.y);
    x2 = Math.max(x2, s.x + s.width);
    y2 = Math.max(y2, s.y + s.height);
  }
  if (!Number.isFinite(x1)) return { x: 0, y: 0, w: 1, h: 1 };
  return { x: x1, y: y1, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1) };
}

function walk(
  el: Element,
  defs: Map<string, ParsedGradient>,
  world: DOMMatrix,
  groupId: string | undefined,
  shapes: SvgImportShape[],
  skipped: { n: number },
): void {
  const tag = el.tagName.toLowerCase();
  if (tag === "defs" || tag === "title" || tag === "desc" || tag === "metadata") return;
  if (tag === "foreignobject") {
    skipped.n += 1;
    return;
  }

  if (tag === "g") {
    const lm = parseSvgTransform(el.getAttribute("transform"));
    const next = world.multiply(lm);
    const kids = Array.from(el.children).filter((c) => {
      const t = c.tagName.toLowerCase();
      return t !== "defs" && t !== "title" && t !== "desc" && t !== "metadata";
    });
    const drawableTags = new Set(["rect", "circle", "ellipse", "path", "line", "polyline", "polygon", "text", "image", "g"]);
    const drawableCount = kids.filter((k) => drawableTags.has(k.tagName.toLowerCase())).length;
    const gid = drawableCount > 1 ? `svg-g-${Math.random().toString(36).slice(2, 11)}` : groupId;
    for (const c of el.children) walk(c, defs, next, gid, shapes, skipped);
    return;
  }

  if (tag === "svg") {
    const lm = parseSvgTransform(el.getAttribute("transform"));
    for (const c of el.children) walk(c, defs, world.multiply(lm), groupId, shapes, skipped);
    return;
  }

  if (tag === "use" || tag === "symbol" || tag === "filter" || tag === "clippath") {
    skipped.n += 1;
    return;
  }

  const lm = parseSvgTransform(el.getAttribute("transform"));
  const m = world.multiply(lm);

  let strokeW = parseFloatAttr(el, "stroke-width", 0);
  const op = parseOpacity(el);
  const strokeP = parsePaint(el, "stroke", defs, { x: 0, y: 0, w: 1, h: 1 }, "", "none");

  if (tag === "rect") {
    const x = parseFloatAttr(el, "x", 0);
    const y = parseFloatAttr(el, "y", 0);
    const w = parseFloatAttr(el, "width", 0);
    const h = parseFloatAttr(el, "height", 0);
    const rx = Math.max(0, parseFloatAttr(el, "rx", 0) || parseFloatAttr(el, "ry", 0));
    const box = { x, y, w: Math.max(1, w), h: Math.max(1, h) };
    const oid = `tmp-${shapes.length}`;
    const fill = parsePaint(el, "fill", defs, box, oid, "#000000");
    const rotation = (Math.atan2(m.m12, m.m11) * 180) / Math.PI;
    const sx = Math.hypot(m.m11, m.m12);
    const sy = Math.hypot(m.m21, m.m22);
    const tl = new DOMPoint(x, y).matrixTransform(m);
    shapes.push({
      kind: "rect",
      x: tl.x,
      y: tl.y,
      width: Math.max(4, w * sx),
      height: Math.max(4, h * sy),
      rx: rx * ((sx + sy) / 2),
      fill,
      stroke: typeof strokeP === "string" ? strokeP : "#000000",
      strokeWidth: strokeW,
      opacity: op,
      rotation,
      ...(groupId ? { groupId } : {}),
    });
    return;
  }

  if (tag === "circle") {
    const cx = parseFloatAttr(el, "cx", 0);
    const cy = parseFloatAttr(el, "cy", 0);
    const r = parseFloatAttr(el, "r", 0);
    const x = cx - r, y = cy - r, w = 2 * r, h = 2 * r;
    const box = { x, y, w: Math.max(1, w), h: Math.max(1, h) };
    const fill = parsePaint(el, "fill", defs, box, `tmp-${shapes.length}`, "#000000");
    const rotation = (Math.atan2(m.m12, m.m11) * 180) / Math.PI;
    const sx = Math.hypot(m.m11, m.m12);
    const sy = Math.hypot(m.m21, m.m22);
    const tl = new DOMPoint(x, y).matrixTransform(m);
    shapes.push({
      kind: "ellipse",
      x: tl.x,
      y: tl.y,
      width: Math.max(4, w * sx),
      height: Math.max(4, h * sy),
      fill,
      stroke: typeof strokeP === "string" ? strokeP : "#000000",
      strokeWidth: strokeW,
      opacity: op,
      rotation,
      ...(groupId ? { groupId } : {}),
    });
    return;
  }

  if (tag === "ellipse") {
    const cx = parseFloatAttr(el, "cx", 0);
    const cy = parseFloatAttr(el, "cy", 0);
    const rx = parseFloatAttr(el, "rx", 0);
    const ry = parseFloatAttr(el, "ry", 0);
    const x = cx - rx, y = cy - ry, w = 2 * rx, h = 2 * ry;
    const box = { x, y, w: Math.max(1, w), h: Math.max(1, h) };
    const fill = parsePaint(el, "fill", defs, box, `tmp-${shapes.length}`, "#000000");
    const rotation = (Math.atan2(m.m12, m.m11) * 180) / Math.PI;
    const sx = Math.hypot(m.m11, m.m12);
    const sy = Math.hypot(m.m21, m.m22);
    const tl = new DOMPoint(x, y).matrixTransform(m);
    shapes.push({
      kind: "ellipse",
      x: tl.x,
      y: tl.y,
      width: Math.max(4, w * sx),
      height: Math.max(4, h * sy),
      fill,
      stroke: typeof strokeP === "string" ? strokeP : "#000000",
      strokeWidth: strokeW,
      opacity: op,
      rotation,
      ...(groupId ? { groupId } : {}),
    });
    return;
  }

  if (tag === "line") {
    const x1 = parseFloatAttr(el, "x1", 0);
    const y1 = parseFloatAttr(el, "y1", 0);
    const x2 = parseFloatAttr(el, "x2", 0);
    const y2 = parseFloatAttr(el, "y2", 0);
    const d = `M ${x1} ${y1} L ${x2} ${y2}`;
    const p0 = new DOMPoint(x1, y1).matrixTransform(m);
    const p1 = new DOMPoint(x2, y2).matrixTransform(m);
    const bb = {
      x: Math.min(p0.x, p1.x),
      y: Math.min(p0.y, p1.y),
      w: Math.max(1, Math.abs(p1.x - p0.x)),
      h: Math.max(1, Math.abs(p1.y - p0.y)),
    };
    const dWorld = `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y}`;
    const fill = parsePaint(el, "fill", defs, bb, `tmp-${shapes.length}`, "none");
    shapes.push({
      kind: "path",
      x: bb.x,
      y: bb.y,
      width: bb.w,
      height: bb.h,
      svgPathD: dWorld,
      closed: false,
      fill,
      stroke: typeof strokeP === "string" ? strokeP : "#000000",
      strokeWidth: strokeW || 1,
      opacity: op,
      rotation: 0,
      ...(groupId ? { groupId } : {}),
    });
    return;
  }

  if (tag === "polyline" || tag === "polygon") {
    const pts = el.getAttribute("points") || "";
    const d = polygonToPathD(pts, tag === "polygon");
    if (!d) return;
    const bb0 = pathBBoxFromD(d);
    const fill = parsePaint(el, "fill", defs, bb0, `tmp-${shapes.length}`, tag === "polygon" ? "#000000" : "none");
    const parts = d.match(/[ML]\s*[\d.-]+\s*[\d.-]+/gi) || [];
    let dW = "";
    const re = /[ML]\s*([\d.-]+)\s*([\d.-]+)/i;
    for (const seg of parts) {
      const mm = seg.match(re);
      if (!mm) continue;
      const px = parseFloat(mm[1]), py = parseFloat(mm[2]);
      const pt = new DOMPoint(px, py).matrixTransform(m);
      dW += dW ? ` L ${pt.x} ${pt.y}` : `M ${pt.x} ${pt.y}`;
    }
    if (tag === "polygon" && dW) dW += " Z";
    const bb = pathBBoxFromD(dW);
    shapes.push({
      kind: "path",
      x: bb.x,
      y: bb.y,
      width: bb.w,
      height: bb.h,
      svgPathD: dW,
      closed: tag === "polygon",
      fill,
      stroke: typeof strokeP === "string" ? strokeP : "#000000",
      strokeWidth: strokeW,
      opacity: op,
      rotation: 0,
      ...(groupId ? { groupId } : {}),
    });
    return;
  }

  if (tag === "path") {
    const d = el.getAttribute("d") || "";
    if (!d.trim()) return;
    const bb0 = pathBBoxFromD(d);
    const wbb = pathBBoxWithMatrix(d, m);
    const fill = parsePaint(el, "fill", defs, bb0, `tmp-${shapes.length}`, "#000000");
    const closed = /\s[Zz]\s*$/.test(d.trim()) || d.trim().toUpperCase().endsWith("Z");
    if (/[CcSsQqTtAa]/.test(d)) skipped.n += 1;
    const dAligned = translatePathD(d, wbb.x - bb0.x, wbb.y - bb0.y);
    shapes.push({
      kind: "path",
      x: wbb.x,
      y: wbb.y,
      width: wbb.w,
      height: wbb.h,
      svgPathD: dAligned,
      closed,
      fill,
      stroke: typeof strokeP === "string" ? strokeP : "#000000",
      strokeWidth: strokeW,
      opacity: op,
      rotation: 0,
      ...(groupId ? { groupId } : {}),
    });
    return;
  }

  if (tag === "text") {
    const x = parseFloatAttr(el, "x", 0);
    const y = parseFloatAttr(el, "y", 0);
    const fs = parseFloatAttr(el, "font-size", 16);
    const ff = (el.getAttribute("font-family") || "Inter, system-ui, sans-serif").split(",")[0].replace(/["']/g, "").trim();
    const fw = parseFloatAttr(el, "font-weight", 400);
    const text = (el.textContent || "").trim() || " ";
    const box = { x, y: y - fs, w: Math.max(120, text.length * fs * 0.6), h: fs * 1.35 };
    const fill = parsePaint(el, "fill", defs, box, `tmp-${shapes.length}`, "#000000");
    const tl = new DOMPoint(x, y - fs).matrixTransform(m);
    const rotation = (Math.atan2(m.m12, m.m11) * 180) / Math.PI;
    shapes.push({
      kind: "text",
      x: tl.x,
      y: tl.y,
      width: box.w,
      height: box.h,
      text,
      fontFamily: `${ff}, system-ui, sans-serif`,
      fontSize: fs,
      fontWeight: fw,
      fill,
      stroke: typeof strokeP === "string" ? strokeP : "none",
      strokeWidth: strokeW,
      opacity: op,
      rotation,
      ...(groupId ? { groupId } : {}),
    });
    return;
  }

  if (tag === "image") {
    let href = el.getAttribute("href") || el.getAttribute("xlink:href") || "";
    const w = parseFloatAttr(el, "width", 100);
    const h = parseFloatAttr(el, "height", 100);
    const x = parseFloatAttr(el, "x", 0);
    const y = parseFloatAttr(el, "y", 0);
    if (!href) return;
    const tl = new DOMPoint(x, y).matrixTransform(m);
    const sx = Math.hypot(m.m11, m.m12);
    const sy = Math.hypot(m.m21, m.m22);
    shapes.push({
      kind: "image",
      x: tl.x,
      y: tl.y,
      width: Math.max(4, w * sx),
      height: Math.max(4, h * sy),
      href,
      opacity: op,
      rotation: (Math.atan2(m.m12, m.m11) * 180) / Math.PI,
      ...(groupId ? { groupId } : {}),
    });
    return;
  }

  // Etiquetas no contempladas arriba (<a>, <switch>, <g> con nombre distinto, etc.): descender para no perder hijos.
  for (const c of el.children) walk(c, defs, world, groupId, shapes, skipped);
}

/** Extrae formas del SVG; no instancia objetos del studio (eso hace FreehandStudio). */
export function parseSvgToShapes(svgText: string): { shapes: SvgImportShape[]; defs: Map<string, ParsedGradient>; skipped: number; rootViewBox: { x: number; y: number; w: number; h: number } } {
  const raw = svgText.replace(/^\uFEFF/, "").trim();
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  let svg: Element | null = doc.querySelector("svg");
  if (!svg) {
    const ns = doc.getElementsByTagNameNS("http://www.w3.org/2000/svg", "svg");
    svg = ns[0] ?? null;
  }
  if (!svg || doc.querySelector("parsererror")) {
    return { shapes: [], defs: new Map(), skipped: 0, rootViewBox: { x: 0, y: 0, w: 100, h: 100 } };
  }
  const defs = collectDefs(svg);
  const vb = svg.getAttribute("viewBox");
  let vx = 0, vy = 0, vw = 100, vh = 100;
  if (vb) {
    const p = vb.trim().split(/[\s,]+/).map(parseFloat);
    if (p.length >= 4 && p.every((n) => Number.isFinite(n))) {
      vx = p[0];
      vy = p[1];
      vw = Math.max(1, p[2]);
      vh = Math.max(3, p[3]);
    }
  } else {
    vw = parseFloatAttr(svg, "width", 100);
    vh = parseFloatAttr(svg, "height", 100);
  }
  const shapes: SvgImportShape[] = [];
  const skipped = { n: 0 };
  const world = new DOMMatrix();
  for (const c of svg.children) walk(c, defs, world, undefined, shapes, skipped);
  return { shapes, defs, skipped: skipped.n, rootViewBox: { x: vx, y: vy, w: vw, h: vh } };
}

export function offsetAndScaleShapes(
  shapes: SvgImportShape[],
  opts: SvgImportOptions,
): SvgImportShape[] {
  if (shapes.length === 0) return [];
  const b = shapesToPlainBounds(shapes);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  let scale = 1;
  if (opts.fitInside && opts.fitInside.w > 1 && opts.fitInside.h > 1) {
    scale = Math.min(opts.fitInside.w / b.w, opts.fitInside.h / b.h, 1) * 0.95;
  }
  const tx = opts.targetCenter.x - cx * scale;
  const ty = opts.targetCenter.y - cy * scale;
  return shapes.map((s) => {
    const nx = s.x * scale + tx;
    const ny = s.y * scale + ty;
    const nw = Math.max(4, s.width * scale);
    const nh = Math.max(4, s.height * scale);
    if (s.kind === "rect")
      return { ...s, x: nx, y: ny, width: nw, height: nh, rx: s.rx * scale, strokeWidth: s.strokeWidth * scale };
    if (s.kind === "ellipse") return { ...s, x: nx, y: ny, width: nw, height: nh, strokeWidth: s.strokeWidth * scale };
    if (s.kind === "image") return { ...s, x: nx, y: ny, width: nw, height: nh };
    if (s.kind === "text")
      return {
        ...s,
        x: nx,
        y: ny,
        width: Math.max(40, s.width * scale),
        height: Math.max(12, s.height * scale),
        fontSize: Math.max(4, s.fontSize * scale),
        strokeWidth: s.strokeWidth * scale,
      };
    if (s.kind === "path") {
      return {
        ...s,
        x: nx,
        y: ny,
        width: nw,
        height: nh,
        svgPathD: s.svgPathD,
        svgPathMatrix: { a: scale, b: 0, c: 0, d: scale, e: tx, f: ty },
        strokeWidth: s.strokeWidth * scale,
      };
    }
    return s;
  });
}
