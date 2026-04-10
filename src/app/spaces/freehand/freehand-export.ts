export type Rect = { x: number; y: number; w: number; h: number };

type BoundsObj = { x: number; y: number; width: number; height: number };

type IdRef = { id: string };

/** Union AABB of objects (world space). */
export function boundsOfObjects(objs: BoundsObj[]): Rect | null {
  if (objs.length === 0) return null;
  let x1 = Infinity,
    y1 = Infinity,
    x2 = -Infinity,
    y2 = -Infinity;
  for (const o of objs) {
    x1 = Math.min(x1, o.x);
    y1 = Math.min(y1, o.y);
    x2 = Math.max(x2, o.x + o.width);
    y2 = Math.max(y2, o.y + o.height);
  }
  if (!Number.isFinite(x1)) return null;
  return { x: x1, y: y1, w: Math.max(x2 - x1, 1), h: Math.max(y2 - y1, 1) };
}

/** Include clip-mask ids when a clipped child is selected. */
export function expandExportIds(
  selectedIds: Set<string>,
  _objects: BoundsObj[],
  clippedGroups: Map<string, IdRef[]>,
): Set<string> {
  const out = new Set(selectedIds);
  for (const [clipId, members] of clippedGroups) {
    if (members.some((m) => selectedIds.has(m.id))) out.add(clipId);
  }
  return out;
}

export type ExportDomOptions = {
  /** If null, export all object groups (full scene minus UI). */
  exportIds: Set<string> | null;
  bounds: Rect;
  scale: number;
  background: "transparent" | string;
};

/**
 * Builds standalone SVG markup from the live canvas SVG (same world coordinates as objects).
 * Strips UI, filters by selection, resets viewBox to bounds, applies optional scale for width/height attrs.
 */
export function buildStandaloneSvgFromCanvasDom(
  svgEl: SVGSVGElement,
  opts: ExportDomOptions,
): string {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll("[data-ui]").forEach((el) => el.remove());

  const exportIds = opts.exportIds;

  if (exportIds) {
    clone.querySelectorAll("g[data-fh-obj]").forEach((g) => {
      const id = g.getAttribute("data-fh-obj");
      if (id && !exportIds.has(id)) g.remove();
    });
    clone.querySelectorAll("g[data-fh-clip-root]").forEach((g) => {
      if (!g.querySelector("g[data-fh-obj]")) g.remove();
    });
  }

  const world = clone.querySelector("g[data-fh-world]");
  if (!world) return "";

  world.removeAttribute("transform");

  const innerXml = world.innerHTML;
  const defs = clone.querySelector("defs");
  const defsXml = defs ? defs.outerHTML : "";

  const { bounds, scale, background } = opts;
  const w = Math.max(1, Math.round(bounds.w * scale));
  const h = Math.max(1, Math.round(bounds.h * scale));
  const bgRect =
    background === "transparent"
      ? ""
      : `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.w}" height="${bounds.h}" fill="${escapeXml(background)}"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}">
${defsXml}
${bgRect}<g>${innerXml}</g>
</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
