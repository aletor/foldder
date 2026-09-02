"use client";

import type { ReactNode } from "react";
import {
  type ClippingContainerObject,
  type FreehandObject,
  type RectObject,
  type TextObject,
  rectangleToRoundedPath,
  normalizeCornerRadius,
} from "../FreehandStudio";
import {
  fillPaintValue,
  migrateFill,
  renderFillDef,
  textFillCssProperties,
} from "../freehand/fill";

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

function objectTransform(o: FreehandObject): string | undefined {
  if (!o.rotation) return undefined;
  return `rotate(${o.rotation} ${o.x + o.width / 2} ${o.y + o.height / 2})`;
}

function previewPaint(o: FreehandObject): { paint: string; def: ReactNode } {
  const fill = migrateFill(o.fill);
  const gradientId = `dpp-fill-${o.id}`;
  return {
    paint: fillPaintValue(fill, gradientId),
    def: renderFillDef(fill, gradientId),
  };
}

function shapeStroke(o: FreehandObject): { stroke: string; strokeWidth: number } {
  const stroke = o.stroke && o.stroke !== "none" && o.stroke !== "transparent" ? o.stroke : "none";
  return { stroke, strokeWidth: stroke === "none" ? 0 : o.strokeWidth ?? 0 };
}

function previewObject(o: FreehandObject, renderImages: boolean): ReactNode {
  if (!o.visible || o.isClipMask) return null;

  if (o.type === "groupContainer" || o.type === "booleanGroup") {
    const kids = (o as { children?: FreehandObject[] }).children ?? [];
    return (
      <g key={o.id} opacity={o.opacity} transform={objectTransform(o)}>
        {kids.map((child) => previewObject(child, renderImages))}
      </g>
    );
  }

  if (o.type === "clippingContainer") {
    const clip = o as ClippingContainerObject;
    const bounds = looseThumbRect(clip.mask as FreehandObject) ?? looseThumbRect(o);
    const cid = `dpp-nest-${clip.id}`;
    const inner = (clip.content ?? []).map((child) => previewObject(child, renderImages));
    if (!bounds) return inner;
    return (
      <g key={clip.id} opacity={o.opacity} transform={objectTransform(o)}>
        <defs>
          <clipPath id={cid}>
            <rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${cid})`}>{inner}</g>
      </g>
    );
  }

  if (o.type === "rect" && o.isImageFrame) {
    const rObj = o as RectObject;
    const corners = normalizeCornerRadius(rObj.cornerRadius ?? rObj.rx ?? 0, rObj.width, rObj.height);
    const d = rectangleToRoundedPath(
      { x: rObj.x, y: rObj.y, width: rObj.width, height: rObj.height },
      corners,
    );
    const ifc = rObj.imageFrameContent;
    const cid = `dpp-clip-${rObj.id}`;
    if (ifc?.src && renderImages) {
      return (
        <g key={o.id} opacity={o.opacity} transform={objectTransform(o)}>
          <defs>
            <clipPath id={cid}>
              <path d={d} />
            </clipPath>
          </defs>
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
    const im = o as FreehandObject & { src?: string };
    if (im.src && renderImages) {
      return (
        <image
          key={o.id}
          href={im.src}
          x={im.x}
          y={im.y}
          width={im.width}
          height={im.height}
          opacity={o.opacity}
          transform={objectTransform(o)}
          preserveAspectRatio="none"
        />
      );
    }
  }

  if (o.type === "text") {
    const t = o as TextObject;
    const w = Math.max(1, t.width);
    const h = Math.max(1, t.height);
    const fillCss = textFillCssProperties(migrateFill(t.fill));
    const rich = t._designerRichSpans;
    const text =
      rich && rich.length > 0 ? rich.map((span) => span.text).join("") : t.text;
    return (
      <foreignObject
        key={t.id}
        x={t.x}
        y={t.y}
        width={w}
        height={h}
        opacity={t.opacity}
        transform={objectTransform(t)}
      >
        <div
          {...({ xmlns: "http://www.w3.org/1999/xhtml" } as Record<string, unknown>)}
          style={{
            boxSizing: "border-box",
            width: "100%",
            height: "100%",
            overflow: "hidden",
            fontFamily: t.fontFamily,
            fontSize: t.fontSize,
            fontWeight: t.fontWeight,
            fontStyle: t.fontStyle ?? "normal",
            lineHeight: t.lineHeight,
            letterSpacing:
              (t.letterSpacing ?? 0) + ((t as { charSpacing?: number }).charSpacing ?? 0),
            textAlign: t.textAlign === "justify" ? "justify" : t.textAlign,
            whiteSpace: t.textMode === "point" ? "pre" : "pre-wrap",
            wordBreak: t.textMode === "area" ? "break-word" : "normal",
            ...fillCss,
          }}
        >
          {text || "\u00a0"}
        </div>
      </foreignObject>
    );
  }

  const { paint, def } = previewPaint(o);
  const { stroke, strokeWidth } = shapeStroke(o);
  const transform = objectTransform(o);

  if (o.type === "ellipse") {
    return (
      <g key={o.id} opacity={o.opacity} transform={transform}>
        {def ? <defs>{def}</defs> : null}
        <ellipse
          cx={o.x + o.width / 2}
          cy={o.y + o.height / 2}
          rx={Math.max(0.5, o.width / 2)}
          ry={Math.max(0.5, o.height / 2)}
          fill={paint}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      </g>
    );
  }

  if (o.type === "path") {
    const d = (o as { svgPathD?: string }).svgPathD;
    if (d) {
      return (
        <g key={o.id} opacity={o.opacity} transform={transform}>
          {def ? <defs>{def}</defs> : null}
          <path d={d} fill={paint} stroke={stroke} strokeWidth={strokeWidth} />
        </g>
      );
    }
  }

  if (o.type === "rect") {
    const rObj = o as RectObject;
    const corners = normalizeCornerRadius(rObj.cornerRadius ?? rObj.rx ?? 0, rObj.width, rObj.height);
    const d = rectangleToRoundedPath(
      { x: rObj.x, y: rObj.y, width: rObj.width, height: rObj.height },
      corners,
    );
    return (
      <g key={o.id} opacity={o.opacity} transform={transform}>
        {def ? <defs>{def}</defs> : null}
        <path d={d} fill={paint} stroke={stroke} strokeWidth={strokeWidth} />
      </g>
    );
  }

  const r = looseThumbRect(o);
  if (!r) return null;
  return (
    <g key={o.id} opacity={o.opacity} transform={transform}>
      {def ? <defs>{def}</defs> : null}
      <rect
        x={r.x}
        y={r.y}
        width={r.w}
        height={r.h}
        fill={paint}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    </g>
  );
}

/**
 * Miniatura del contenido de una página: fotos, rellenos y texto reales (no placeholders).
 */
export function DesignerPagePreview({
  objects,
  pageWidth,
  pageHeight,
  renderImages = true,
  visibleHeight,
}: {
  objects: FreehandObject[];
  pageWidth: number;
  pageHeight: number;
  renderImages?: boolean;
  /** Recorte desde arriba, en unidades de página. Ausente = página completa. */
  visibleHeight?: number;
}) {
  const pw = Math.max(32, pageWidth);
  const ph = Math.max(32, pageHeight);
  const vh = Math.max(32, Math.min(ph, visibleHeight ?? ph));

  return (
    <svg
      className="pointer-events-none block h-full w-full"
      viewBox={`0 0 ${pw} ${vh}`}
      preserveAspectRatio={visibleHeight != null ? "xMidYMin meet" : "xMidYMid meet"}
      data-testid="designer-page-preview"
    >
      <rect width={pw} height={ph} fill="#fafafa" />
      {objects.map((o) => previewObject(o, renderImages))}
    </svg>
  );
}
