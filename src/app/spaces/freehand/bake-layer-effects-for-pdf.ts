/**
 * Hornea efectos de capa (CSS filter, SVG filter/mask, glow, look, máscara de capa…)
 * a bitmaps antes de svg2pdf — que no implementa filter/mask.
 */

import { sanitizeSvgNamedEntitiesForXml } from "./freehand-export";

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

function asNum(v: string | null | undefined, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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

function collectUrlRefIds(root: Element): Set<string> {
  const ids = new Set<string>();
  const re = /url\(\s*['"]?#([^)'"]+)['"]?\s*\)/gi;
  const consider = (raw: string | null) => {
    if (!raw) return;
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null) ids.add(m[1]!);
  };
  const walk = (el: Element) => {
    for (const attr of ["filter", "mask", "clip-path", "clipPath", "fill", "stroke", "style", "href", "xlink:href"]) {
      consider(el.getAttribute(attr));
    }
    for (const ch of Array.from(el.children)) walk(ch);
  };
  walk(root);
  return ids;
}

/** Copia defs referenciadas (y dependencias anidadas) al SVG temporal de rasterizado. */
function collectReferencedDefClones(doc: Document, root: Element): Element[] {
  const pending = collectUrlRefIds(root);
  const seen = new Set<string>();
  const clones: Element[] = [];
  while (pending.size > 0) {
    const id = pending.values().next().value as string;
    pending.delete(id);
    if (seen.has(id)) continue;
    seen.add(id);
    const el = doc.getElementById(id);
    if (!el) continue;
    const clone = el.cloneNode(true) as Element;
    clones.push(clone);
    for (const dep of collectUrlRefIds(clone)) {
      if (!seen.has(dep)) pending.add(dep);
    }
  }
  return clones;
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

function nodeDepth(el: Element): number {
  let d = 0;
  let p: Element | null = el.parentElement;
  while (p) {
    d++;
    p = p.parentElement;
  }
  return d;
}

async function rasterizeFxBakeGroup(doc: Document, bakeG: Element): Promise<boolean> {
  if (!canRasterizeInThisEnvironment()) return false;

  let x = asNum(bakeG.getAttribute("data-fh-fx-x"), NaN);
  let y = asNum(bakeG.getAttribute("data-fh-fx-y"), NaN);
  let w = asNum(bakeG.getAttribute("data-fh-fx-w"), NaN);
  let h = asNum(bakeG.getAttribute("data-fh-fx-h"), NaN);

  const liveHost = document.createElementNS(SVG_NS, "svg");
  liveHost.setAttribute("xmlns", SVG_NS);
  liveHost.setAttribute("xmlns:xlink", XLINK_NS);
  liveHost.style.cssText =
    "position:absolute;left:-100000px;top:0;width:10px;height:10px;overflow:hidden;opacity:0;pointer-events:none";

  const defClones = collectReferencedDefClones(doc, bakeG);
  if (defClones.length > 0) {
    const defs = document.createElementNS(SVG_NS, "defs");
    for (const c of defClones) defs.appendChild(document.importNode(c, true));
    liveHost.appendChild(defs);
  }

  const inner = document.createElementNS(SVG_NS, "g");
  for (const ch of Array.from(bakeG.childNodes)) {
    inner.appendChild(document.importNode(ch, true));
  }
  liveHost.appendChild(inner);
  document.body.appendChild(liveHost);

  try {
    await preloadSvgImages(liveHost);

    if (!(w > 0 && h > 0) || !Number.isFinite(x) || !Number.isFinite(y)) {
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
    if (!(w > 0 && h > 0) || !Number.isFinite(x) || !Number.isFinite(y)) {
      liveHost.remove();
      return false;
    }

    const scale = Math.min(2, 4096 / Math.max(w, h, 1));
    const pw = Math.max(1, Math.round(w * scale));
    const ph = Math.max(1, Math.round(h * scale));

    const parts: string[] = [];
    for (const ch of Array.from(liveHost.childNodes)) {
      parts.push(new XMLSerializer().serializeToString(ch));
    }
    const markup = sanitizeSvgNamedEntitiesForXml(
      `<svg xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}" width="${pw}" height="${ph}" viewBox="${x} ${y} ${w} ${h}">${parts.join("")}</svg>`,
    );
    liveHost.remove();

    const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
    let objectUrl: string | null = null;
    let imgSrc: string;
    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      objectUrl = URL.createObjectURL(blob);
      imgSrc = objectUrl;
    } else {
      imgSrc = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    }
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      const t = window.setTimeout(() => reject(new Error("fx bake timeout")), 10000);
      im.onload = () => {
        window.clearTimeout(t);
        resolve(im);
      };
      im.onerror = () => {
        window.clearTimeout(t);
        reject(new Error("fx bake"));
      };
      im.src = imgSrc;
    });
    if (objectUrl) URL.revokeObjectURL(objectUrl);

    const canvas = document.createElement("canvas");
    canvas.width = pw;
    canvas.height = ph;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");

    while (bakeG.firstChild) bakeG.removeChild(bakeG.firstChild);
    bakeG.removeAttribute("filter");
    bakeG.removeAttribute("style");
    bakeG.removeAttribute("mask");
    const image = doc.createElementNS(SVG_NS, "image");
    image.setAttribute("href", dataUrl);
    image.setAttributeNS(XLINK_NS, "href", dataUrl);
    image.setAttribute("x", String(x));
    image.setAttribute("y", String(y));
    image.setAttribute("width", String(w));
    image.setAttribute("height", String(h));
    image.setAttribute("preserveAspectRatio", "none");
    bakeG.appendChild(image);
    bakeG.removeAttribute("data-fh-fx-bake");
    bakeG.removeAttribute("data-fh-fx-x");
    bakeG.removeAttribute("data-fh-fx-y");
    bakeG.removeAttribute("data-fh-fx-w");
    bakeG.removeAttribute("data-fh-fx-h");
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
 * Sustituye cada `[data-fh-fx-bake]` por un PNG con filtros/máscaras ya aplicados.
 * Procesa de más profundo a más superficial (bakes anidados).
 */
export async function bakeLayerEffectsForVectorPdf(svgMarkup: string): Promise<string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitizeSvgNamedEntitiesForXml(svgMarkup), "image/svg+xml");
  if (doc.querySelector("parsererror")) return svgMarkup;

  const nodes = Array.from(doc.querySelectorAll("[data-fh-fx-bake]"));
  nodes.sort((a, b) => nodeDepth(b) - nodeDepth(a));

  for (const bakeG of nodes) {
    if (!doc.documentElement.contains(bakeG)) continue;
    if (bakeG.getAttribute("data-fh-page-content") != null) continue;
    if (bakeG.tagName.toLowerCase() === "svg") continue;
    await rasterizeFxBakeGroup(doc, bakeG);
  }

  return new XMLSerializer().serializeToString(doc.documentElement);
}
