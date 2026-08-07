/**
 * Normaliza `<clipPath>` del SVG de export para svg2pdf.js:
 * - Mueve clips fuera de `<defs>` (p. ej. «pegar dentro») a un `<defs>` local bajo el mismo padre.
 * - Sustituye hijos (ellipse/rect/g/path+transform) por un único `<path d>` con transforms horneados.
 * - Si la máscara es `<image>` (o no se puede aplanar), rasteriza el grupo compuesto.
 *
 * El lienzo deja el clipPath fuera de defs a propósito (coordenadas en browser);
 * svg2pdf no lo soporta bien → imágenes enmascaradas desaparecen en el PDF.
 */

import { sanitizeSvgNamedEntitiesForXml } from "./freehand-export";

const SVG_NS = "http://www.w3.org/2000/svg";

type Mat2D = { a: number; b: number; c: number; d: number; e: number; f: number };

function identityMat(): Mat2D {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

function multiplyMat(a: Mat2D, b: Mat2D): Mat2D {
  return {
    a: a.a * b.a + a.c * b.b,
    b: a.b * b.a + a.d * b.b,
    c: a.a * b.c + a.c * b.d,
    d: a.b * b.c + a.d * b.d,
    e: a.a * b.e + a.c * b.f + a.e,
    f: a.b * b.e + a.d * b.f + a.f,
  };
}

function transformPointMat(m: Mat2D, x: number, y: number): [number, number] {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

function matFromDomMatrixLike(m: { a: number; b: number; c: number; d: number; e: number; f: number }): Mat2D {
  return { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f };
}

function isIdentityMat(m: Mat2D): boolean {
  return (
    Math.abs(m.a - 1) < 1e-9 &&
    Math.abs(m.b) < 1e-9 &&
    Math.abs(m.c) < 1e-9 &&
    Math.abs(m.d - 1) < 1e-9 &&
    Math.abs(m.e) < 1e-9 &&
    Math.abs(m.f) < 1e-9
  );
}

function parseTransformToMat(attr: string | null): Mat2D {
  let acc = identityMat();
  if (!attr || !attr.trim()) return acc;
  const re = /(matrix|translate|scale|rotate)\s*\(\s*([^)]+)\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attr)) !== null) {
    const cmd = m[1]!.toLowerCase();
    const nums = m[2]!
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((s) => parseFloat(s))
      .filter((n) => Number.isFinite(n));
    if (cmd === "matrix" && nums.length >= 6) {
      acc = multiplyMat(acc, {
        a: nums[0]!,
        b: nums[1]!,
        c: nums[2]!,
        d: nums[3]!,
        e: nums[4]!,
        f: nums[5]!,
      });
    } else if (cmd === "translate") {
      acc = multiplyMat(acc, { a: 1, b: 0, c: 0, d: 1, e: nums[0] ?? 0, f: nums[1] ?? 0 });
    } else if (cmd === "scale") {
      const sx = nums[0] ?? 1;
      const sy = nums.length >= 2 ? nums[1]! : sx;
      acc = multiplyMat(acc, { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
    } else if (cmd === "rotate") {
      const deg = nums[0] ?? 0;
      const rad = (deg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      if (nums.length >= 3) {
        const cx = nums[1]!;
        const cy = nums[2]!;
        acc = multiplyMat(acc, { a: 1, b: 0, c: 0, d: 1, e: cx, f: cy });
        acc = multiplyMat(acc, { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 });
        acc = multiplyMat(acc, { a: 1, b: 0, c: 0, d: 1, e: -cx, f: -cy });
      } else {
        acc = multiplyMat(acc, { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 });
      }
    }
  }
  return acc;
}

function asNum(v: string | null | undefined, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Elipse → path cúbico (aprox. estándar κ). */
export function ellipseToPathD(cx: number, cy: number, rx: number, ry: number): string {
  const κ = 0.5522847498307936;
  const ox = rx * κ;
  const oy = ry * κ;
  return [
    `M ${cx - rx} ${cy}`,
    `C ${cx - rx} ${cy - oy} ${cx - ox} ${cy - ry} ${cx} ${cy - ry}`,
    `C ${cx + ox} ${cy - ry} ${cx + rx} ${cy - oy} ${cx + rx} ${cy}`,
    `C ${cx + rx} ${cy + oy} ${cx + ox} ${cy + ry} ${cx} ${cy + ry}`,
    `C ${cx - ox} ${cy + ry} ${cx - rx} ${cy + oy} ${cx - rx} ${cy}`,
    `Z`,
  ].join(" ");
}

function rectToPathD(x: number, y: number, w: number, h: number, rx = 0, ry = 0): string {
  const rxi = Math.min(Math.max(0, rx), w / 2);
  const ryi = Math.min(Math.max(0, ry || rx), h / 2);
  if (rxi <= 0 && ryi <= 0) {
    return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
  }
  return [
    `M ${x + rxi} ${y}`,
    `H ${x + w - rxi}`,
    `A ${rxi} ${ryi} 0 0 1 ${x + w} ${y + ryi}`,
    `V ${y + h - ryi}`,
    `A ${rxi} ${ryi} 0 0 1 ${x + w - rxi} ${y + h}`,
    `H ${x + rxi}`,
    `A ${rxi} ${ryi} 0 0 1 ${x} ${y + h - ryi}`,
    `V ${y + ryi}`,
    `A ${rxi} ${ryi} 0 0 1 ${x + rxi} ${y}`,
    `Z`,
  ].join(" ");
}

function circleToPathD(cx: number, cy: number, r: number): string {
  return ellipseToPathD(cx, cy, r, r);
}

/**
 * Aplana la geometría de un clipPath a un `d` SVG con transforms aplicados (Paper.js).
 * Devuelve null si hay `<image>` u otro contenido no vectorizable.
 */
export async function flattenClipPathChildrenToPathD(clipPathEl: Element): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const children = Array.from(clipPathEl.children);
  if (children.length === 0) return null;
  if (children.some((c) => c.tagName.toLowerCase() === "image")) return null;

  const inner = children.map((c) => c.outerHTML).join("");
  const svg = `<svg xmlns="${SVG_NS}">${inner}</svg>`;

  try {
    let has2d = false;
    try {
      has2d = !!document.createElement("canvas").getContext("2d");
    } catch {
      has2d = false;
    }
    if (!has2d) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paperMod = await import("paper");
    const paper = paperMod.default as any;
    const canvas = document.createElement("canvas");
    paper.setup(canvas);
    const root = paper.project.importSVG(svg, { insert: true });
    if (!root) {
      paper.project.clear();
      return null;
    }

    const raw = paper.project.getItems({
      recursive: true,
      match: (it: { clipMask?: boolean }) => {
        if (it.clipMask) return false;
        return (
          it instanceof paper.Path ||
          it instanceof paper.CompoundPath ||
          it instanceof paper.Shape
        );
      },
    });

    const paths: InstanceType<typeof import("paper")["PathItem"]>[] = [];
    for (const it of raw) {
      if (it instanceof paper.Shape) {
        const p = it.toPath(false);
        if (p && String(p.pathData ?? "").trim().length > 0) paths.push(p);
      } else if (String((it as { pathData?: string }).pathData ?? "").trim().length > 0) {
        paths.push(it);
      }
    }

    if (paths.length === 0) {
      paper.project.clear();
      return null;
    }

    let acc = paths[0]!;
    for (let i = 1; i < paths.length; i++) {
      acc = acc.unite(paths[i]!) as typeof acc;
    }
    const d = String(acc.pathData ?? "").trim();
    paper.project.clear();
    return d.length > 0 ? d : null;
  } catch {
    return null;
  }
}

/** Fallback síncrono sin Paper: convierte etiquetas simples y aplica `transform` del elemento. */
export function flattenClipPathChildrenToPathDSync(clipPathEl: Element): string | null {
  const parts: string[] = [];
  const walk = (el: Element, parentM: Mat2D) => {
    const tag = el.tagName.toLowerCase();
    const local = parseTransformToMat(el.getAttribute("transform"));
    const m = multiplyMat(parentM, local);

    if (tag === "g") {
      for (const ch of Array.from(el.children)) walk(ch, m);
      return;
    }
    if (tag === "image") return;

    let localD: string | null = null;
    if (tag === "path") {
      localD = el.getAttribute("d");
    } else if (tag === "ellipse") {
      localD = ellipseToPathD(
        asNum(el.getAttribute("cx")),
        asNum(el.getAttribute("cy")),
        asNum(el.getAttribute("rx")),
        asNum(el.getAttribute("ry")),
      );
    } else if (tag === "circle") {
      localD = circleToPathD(
        asNum(el.getAttribute("cx")),
        asNum(el.getAttribute("cy")),
        asNum(el.getAttribute("r")),
      );
    } else if (tag === "rect") {
      localD = rectToPathD(
        asNum(el.getAttribute("x")),
        asNum(el.getAttribute("y")),
        asNum(el.getAttribute("width")),
        asNum(el.getAttribute("height")),
        asNum(el.getAttribute("rx")),
        asNum(el.getAttribute("ry")),
      );
    } else if (tag === "polygon" || tag === "polyline") {
      const pts = (el.getAttribute("points") || "")
        .trim()
        .replace(/,/g, " ")
        .split(/\s+/)
        .map(Number)
        .filter((n) => Number.isFinite(n));
      if (pts.length >= 4) {
        const cmds: string[] = [];
        for (let i = 0; i + 1 < pts.length; i += 2) {
          cmds.push(`${i === 0 ? "M" : "L"} ${pts[i]} ${pts[i + 1]}`);
        }
        if (tag === "polygon") cmds.push("Z");
        localD = cmds.join(" ");
      }
    }

    if (!localD) return;
    const baked = transformPathDWithMatrix(localD, m);
    if (baked) parts.push(baked);
  };

  for (const ch of Array.from(clipPathEl.children)) walk(ch, identityMat());
  if (parts.length === 0) return null;
  return parts.join(" ");
}

/** Transforma comandos frecuentes (M/L/H/V/C/Q/Z); arcs `A` → null (usar Paper). */
export function transformPathDWithMatrix(
  d: string,
  m: Mat2D | { a: number; b: number; c: number; d: number; e: number; f: number },
): string | null {
  const mat = matFromDomMatrixLike(m);
  if (isIdentityMat(mat)) return d;
  if (/[aA]/.test(d)) return null;

  const mapPt = (x: number, y: number): [number, number] => transformPointMat(mat, x, y);

  const tokens = d.match(/[MmLlHhVvCcSsQqTtZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!tokens) return null;

  let i = 0;
  let cmd = "";
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  const out: string[] = [];

  const readNum = (): number => {
    const t = tokens[i++];
    const n = Number(t);
    return Number.isFinite(n) ? n : 0;
  };

  while (i < tokens.length) {
    const t = tokens[i]!;
    if (/^[MmLlHhVvCcSsQqTtZz]$/.test(t)) {
      cmd = t;
      i++;
    }
    if (!cmd) break;

    const abs = cmd === cmd.toUpperCase();
    const c = cmd.toUpperCase();

    if (c === "Z") {
      out.push("Z");
      cx = startX;
      cy = startY;
      continue;
    }
    if (c === "M" || c === "L") {
      const x0 = readNum();
      const y0 = readNum();
      const x = abs ? x0 : cx + x0;
      const y = abs ? y0 : cy + y0;
      const [tx, ty] = mapPt(x, y);
      out.push(`${c === "M" ? "M" : "L"} ${tx} ${ty}`);
      cx = x;
      cy = y;
      if (c === "M") {
        startX = x;
        startY = y;
      }
      while (i < tokens.length && !/^[MmLlHhVvCcSsQqTtZz]$/.test(tokens[i]!)) {
        const x1 = abs ? readNum() : cx + readNum();
        const y1 = abs ? readNum() : cy + readNum();
        const [ux, uy] = mapPt(x1, y1);
        out.push(`L ${ux} ${uy}`);
        cx = x1;
        cy = y1;
      }
      continue;
    }
    if (c === "H") {
      const x0 = readNum();
      const x = abs ? x0 : cx + x0;
      const [tx, ty] = mapPt(x, cy);
      out.push(`L ${tx} ${ty}`);
      cx = x;
      continue;
    }
    if (c === "V") {
      const y0 = readNum();
      const y = abs ? y0 : cy + y0;
      const [tx, ty] = mapPt(cx, y);
      out.push(`L ${tx} ${ty}`);
      cy = y;
      continue;
    }
    if (c === "C") {
      const x1 = abs ? readNum() : cx + readNum();
      const y1 = abs ? readNum() : cy + readNum();
      const x2 = abs ? readNum() : cx + readNum();
      const y2 = abs ? readNum() : cy + readNum();
      const x = abs ? readNum() : cx + readNum();
      const y = abs ? readNum() : cy + readNum();
      const [a1, b1] = mapPt(x1, y1);
      const [a2, b2] = mapPt(x2, y2);
      const [ax, ay] = mapPt(x, y);
      out.push(`C ${a1} ${b1} ${a2} ${b2} ${ax} ${ay}`);
      cx = x;
      cy = y;
      continue;
    }
    if (c === "Q") {
      const x1 = abs ? readNum() : cx + readNum();
      const y1 = abs ? readNum() : cy + readNum();
      const x = abs ? readNum() : cx + readNum();
      const y = abs ? readNum() : cy + readNum();
      const [a1, b1] = mapPt(x1, y1);
      const [ax, ay] = mapPt(x, y);
      out.push(`Q ${a1} ${b1} ${ax} ${ay}`);
      cx = x;
      cy = y;
      continue;
    }
    return null;
  }

  return out.length > 0 ? out.join(" ") : null;
}

function clipPathNeedsNormalize(clipPath: Element): boolean {
  if (!clipPath.closest("defs")) return true;
  for (const ch of Array.from(clipPath.querySelectorAll("*"))) {
    const tag = ch.tagName.toLowerCase();
    if (tag === "ellipse" || tag === "circle" || tag === "rect" || tag === "g" || tag === "image") {
      return true;
    }
    if (ch.getAttribute("transform")) return true;
  }
  return false;
}

function ensureLocalDefs(parent: Element, doc: Document): Element {
  for (const ch of Array.from(parent.children)) {
    if (ch.tagName.toLowerCase() === "defs") return ch;
  }
  const defs = doc.createElementNS(SVG_NS, "defs");
  parent.insertBefore(defs, parent.firstChild);
  return defs;
}

function replaceClipPathWithBakedPath(doc: Document, clipPath: Element, d: string): void {
  const fillRule =
    clipPath.querySelector("[fill-rule]")?.getAttribute("fill-rule") ||
    clipPath.querySelector("[clip-rule]")?.getAttribute("clip-rule") ||
    null;
  while (clipPath.firstChild) clipPath.removeChild(clipPath.firstChild);
  const path = doc.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "#000");
  if (fillRule) path.setAttribute("fill-rule", fillRule);
  clipPath.appendChild(path);
  clipPath.setAttribute("clipPathUnits", "userSpaceOnUse");
}

function elementSubtreeHasImage(el: Element): boolean {
  if (el.tagName.toLowerCase() === "image") return true;
  return !!el.querySelector("image");
}

function isSafeRasterComposite(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === "svg") return false;
  if (el.getAttribute("data-fh-page-content") != null) return false;
  if (el.hasAttribute("data-fh-clip-composite")) return true;
  return false;
}

async function preloadSvgImages(root: Element): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("image"));
  await Promise.all(
    imgs.map(async (imgEl) => {
      const href = imgEl.getAttribute("href") || imgEl.getAttribute("xlink:href") || "";
      if (!href || href.startsWith("#")) return;
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        const t = window.setTimeout(done, 2500);
        const im = new Image();
        im.onload = () => {
          window.clearTimeout(t);
          done();
        };
        im.onerror = () => {
          window.clearTimeout(t);
          done();
        };
        im.src = href;
      });
    }),
  );
}

function canRasterizeInThisEnvironment(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    return !!(ctx && typeof ctx.drawImage === "function");
  } catch {
    return false;
  }
}

async function rasterizeClippedCompositeToImage(doc: Document, parentG: Element): Promise<boolean> {
  if (!canRasterizeInThisEnvironment()) return false;

  const attrW = asNum(parentG.getAttribute("data-fh-clip-w"), 0);
  const attrH = asNum(parentG.getAttribute("data-fh-clip-h"), 0);

  const liveHost = document.createElementNS(SVG_NS, "svg");
  liveHost.setAttribute("xmlns", SVG_NS);
  liveHost.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  liveHost.style.cssText =
    "position:absolute;left:-100000px;top:0;width:10px;height:10px;overflow:hidden;opacity:0;pointer-events:none";

  /** Clonar hijos SIN el transform del contenedor (va en el viewBox local 0..w × 0..h). */
  const inner = document.createElementNS(SVG_NS, "g");
  for (const ch of Array.from(parentG.childNodes)) {
    inner.appendChild(document.importNode(ch, true));
  }
  liveHost.appendChild(inner);
  document.body.appendChild(liveHost);

  try {
    await preloadSvgImages(inner);

    let x = 0;
    let y = 0;
    let w = attrW;
    let h = attrH;
    if (!(w > 0 && h > 0)) {
      try {
        const bb = (inner as SVGGraphicsElement).getBBox();
        if (bb.width > 0 && bb.height > 0) {
          x = bb.x;
          y = bb.y;
          w = bb.width;
          h = bb.height;
        }
      } catch {
        /* ignore */
      }
    }
    if (!(w > 0 && h > 0)) {
      liveHost.remove();
      return false;
    }

    const pad = 2;
    x -= pad;
    y -= pad;
    w += pad * 2;
    h += pad * 2;
    const scale = Math.min(2, 4096 / Math.max(w, h, 1));
    const pw = Math.max(1, Math.round(w * scale));
    const ph = Math.max(1, Math.round(h * scale));

    const markup = sanitizeSvgNamedEntitiesForXml(
      `<svg xmlns="${SVG_NS}" xmlns:xlink="http://www.w3.org/1999/xlink" width="${pw}" height="${ph}" viewBox="${x} ${y} ${w} ${h}">${new XMLSerializer().serializeToString(inner)}</svg>`,
    );
    liveHost.remove();

    const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      const t = window.setTimeout(() => reject(new Error("raster clip timeout")), 8000);
      im.onload = () => {
        window.clearTimeout(t);
        resolve(im);
      };
      im.onerror = () => {
        window.clearTimeout(t);
        reject(new Error("raster clip"));
      };
      im.src = url;
    });
    URL.revokeObjectURL(url);
    const canvas = document.createElement("canvas");
    canvas.width = pw;
    canvas.height = ph;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");

    while (parentG.firstChild) parentG.removeChild(parentG.firstChild);
    /** Conservar `transform` del contenedor; imagen en espacio local. */
    const image = doc.createElementNS(SVG_NS, "image");
    image.setAttribute("href", dataUrl);
    image.setAttributeNS("http://www.w3.org/1999/xlink", "href", dataUrl);
    image.setAttribute("x", String(x));
    image.setAttribute("y", String(y));
    image.setAttribute("width", String(w));
    image.setAttribute("height", String(h));
    image.setAttribute("preserveAspectRatio", "none");
    parentG.appendChild(image);
    parentG.removeAttribute("data-fh-clip-composite");
    parentG.removeAttribute("data-fh-clip-w");
    parentG.removeAttribute("data-fh-clip-h");
    return true;
  } catch {
    try {
      liveHost.remove();
    } catch {
      /* ignore */
    }
    return false;
  }
}

/**
 * Prepara clips del SVG de página para svg2pdf (pegar dentro + legacy).
 * Si el contenido recortado incluye `<image>`, rasteriza el compuesto (svg2pdf no recorta bien fotos en `<g clip-path>`).
 */
export async function normalizeSvgClipsForVectorPdf(svgMarkup: string): Promise<string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitizeSvgNamedEntitiesForXml(svgMarkup), "image/svg+xml");
  if (doc.querySelector("parsererror")) return svgMarkup;

  /**
   * Solo rasterizar composites explícitos de «pegar dentro».
   * Nunca el clip de página (`fh-page-content-clip`) ni image-frames (`imf-clip-*`):
   * eso vaciaba/rompía todas las imágenes del PDF.
   */
  for (const composite of Array.from(doc.querySelectorAll("[data-fh-clip-composite]"))) {
    if (!elementSubtreeHasImage(composite)) continue;
    if (!isSafeRasterComposite(composite)) continue;
    await rasterizeClippedCompositeToImage(doc, composite);
  }

  /** Bake de geometría de clip (ellipse/transform → path). No rasterizar aquí. */
  const clipPaths = Array.from(doc.querySelectorAll("clipPath"));
  for (const clipPath of clipPaths) {
    if (!doc.documentElement.contains(clipPath)) continue;
    /** Skip clips cuyo composite ya se sustituyó por un bitmap. */
    const markedRoot = clipPath.closest("[data-fh-clip-composite]");
    if (markedRoot && !elementSubtreeHasImage(markedRoot) && markedRoot.querySelector(":scope > image")) {
      continue;
    }

    if (!clipPathNeedsNormalize(clipPath)) continue;
    const clipId = clipPath.getAttribute("id") || "";
    /** No tocar clips de página / image-frame (ya compatibles con svg2pdf). */
    if (clipId === "fh-page-content-clip" || clipId.startsWith("imf-clip-")) continue;

    let d = await flattenClipPathChildrenToPathD(clipPath);
    if (!d) d = flattenClipPathChildrenToPathDSync(clipPath);
    if (!d) continue;

    replaceClipPathWithBakedPath(doc, clipPath, d);

    if (!clipPath.closest("defs")) {
      const parent = clipPath.parentElement;
      if (parent && parent.tagName.toLowerCase() !== "svg") {
        const defs = ensureLocalDefs(parent, doc);
        defs.appendChild(clipPath);
      }
    }
  }

  return new XMLSerializer().serializeToString(doc.documentElement);
}
