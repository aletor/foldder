"use client";

import {
  type FreehandObject,
  type RectObject,
  rectangleToRoundedPath,
  normalizeCornerRadius,
} from "../FreehandStudio";

function looseThumbRect(o: FreehandObject): { x: number; y: number; w: number; h: number } | null {
  if (!o.visible) return null;
  if (o.isClipMask) return null;

  if (o.type === "path") {
    const pts = (o as { points?: { anchor: { x: number; y: number } }[] }).points;
    if (pts && pts.length > 0) {
      let x1 = Infinity;
      let y1 = Infinity;
      let x2 = -Infinity;
      let y2 = -Infinity;
      for (const p of pts) {
        x1 = Math.min(x1, p.anchor.x);
        y1 = Math.min(y1, p.anchor.y);
        x2 = Math.max(x2, p.anchor.x);
        y2 = Math.max(y2, p.anchor.y);
      }
      if (!Number.isFinite(x1)) return null;
      const pad = 4;
      return {
        x: x1 - pad,
        y: y1 - pad,
        w: Math.max(x2 - x1 + pad * 2, 6),
        h: Math.max(y2 - y1 + pad * 2, 6),
      };
    }
  }

  const a = o as { x?: number; y?: number; width?: number; height?: number };
  if (
    typeof a.x === "number" &&
    typeof a.y === "number" &&
    typeof a.width === "number" &&
    typeof a.height === "number"
  ) {
    return { x: a.x, y: a.y, w: Math.max(a.width, 1), h: Math.max(a.height, 1) };
  }
  return null;
}

/**
 * Miniatura del contenido de una página: marcos de imagen y objetos `image` muestran el raster si hay `src`;
 * el resto sigue siendo bloques esquemáticos.
 */
export function DesignerPagePreview({
  objects,
  pageWidth,
  pageHeight,
}: {
  objects: FreehandObject[];
  pageWidth: number;
  pageHeight: number;
}) {
  const pw = Math.max(32, pageWidth);
  const ph = Math.max(32, pageHeight);
  const sw = Math.max(pw, ph) * 0.0035;

  return (
    <svg
      className="pointer-events-none block h-full w-full"
      viewBox={`0 0 ${pw} ${ph}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect width={pw} height={ph} fill="#fafafa" />
      {objects.map((o) => {
        if (!o.visible || o.isClipMask) return null;

        if (o.type === "rect" && o.isImageFrame) {
          const rObj = o as RectObject;
          const corners = normalizeCornerRadius(rObj.cornerRadius ?? rObj.rx ?? 0, rObj.width, rObj.height);
          const d = rectangleToRoundedPath(
            { x: rObj.x, y: rObj.y, width: rObj.width, height: rObj.height },
            corners,
          );
          const ifc = rObj.imageFrameContent;
          const cid = `dpp-clip-${rObj.id}`;
          if (ifc?.src) {
            return (
              <g key={o.id}>
                <defs>
                  <clipPath id={cid}>
                    <path d={d} />
                  </clipPath>
                </defs>
                <path
                  d={d}
                  fill="#f4f4f5"
                  stroke="rgba(99,102,241,0.42)"
                  strokeWidth={sw}
                />
                <image
                  clipPath={`url(#${cid})`}
                  href={ifc.src}
                  x={rObj.x + ifc.offsetX}
                  y={rObj.y + ifc.offsetY}
                  width={ifc.originalWidth * ifc.scaleX}
                  height={ifc.originalHeight * ifc.scaleY}
                  preserveAspectRatio={
                    Math.abs(ifc.scaleX - ifc.scaleY) < 1e-5 ? "xMidYMid meet" : "none"
                  }
                />
              </g>
            );
          }
        }

        if (o.type === "image") {
          const im = o as FreehandObject & { src: string };
          if (im.src) {
            return (
              <image
                key={o.id}
                href={im.src}
                x={im.x}
                y={im.y}
                width={im.width}
                height={im.height}
                preserveAspectRatio="none"
              />
            );
          }
        }

        const r = looseThumbRect(o);
        if (!r) return null;
        return (
          <rect
            key={o.id}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            fill="rgba(99,102,241,0.18)"
            stroke="rgba(99,102,241,0.42)"
            strokeWidth={sw}
            rx={Math.min(3, sw * 3)}
          />
        );
      })}
    </svg>
  );
}
