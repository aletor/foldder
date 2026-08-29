/**
 * Pintura fiel al canvas Designer: SVG (fill/stroke/path) + CSS de texto completo.
 */
import type { CSSProperties } from "react";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import {
  fillDefSvgString,
  fillPaintValue,
  migrateFill,
  textFillCssProperties,
} from "@/app/spaces/freehand/fill";
import { publishedPathGeom } from "./site-creator-publish-path";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function roundedRectD(
  w: number,
  h: number,
  c: { tl: number; tr: number; br: number; bl: number },
): string {
  const maxR = Math.max(0, Math.min(w, h) / 2);
  const tl = Math.min(maxR, Math.max(0, c.tl));
  const tr = Math.min(maxR, Math.max(0, c.tr));
  const br = Math.min(maxR, Math.max(0, c.br));
  const bl = Math.min(maxR, Math.max(0, c.bl));
  const arc = (r: number, x: number, y: number) =>
    r <= 1e-9 ? `L ${x} ${y}` : `A ${r} ${r} 0 0 1 ${x} ${y}`;
  return [
    `M ${tl} 0`,
    `L ${w - tr} 0`,
    arc(tr, w, tr),
    `L ${w} ${h - br}`,
    arc(br, w - br, h),
    `L ${bl} ${h}`,
    arc(bl, 0, h - bl),
    `L 0 ${tl}`,
    arc(tl, tl, 0),
    "Z",
  ].join(" ");
}

function cornersOf(obj: FreehandObject): { tl: number; tr: number; br: number; bl: number } | null {
  if (obj.type !== "rect") return null;
  const rect = obj as {
    rx?: number;
    cornerRadius?: number | { topLeft?: number; topRight?: number; bottomRight?: number; bottomLeft?: number };
  };
  if (rect.cornerRadius && typeof rect.cornerRadius === "object") {
    return {
      tl: Math.max(0, rect.cornerRadius.topLeft ?? 0),
      tr: Math.max(0, rect.cornerRadius.topRight ?? 0),
      br: Math.max(0, rect.cornerRadius.bottomRight ?? 0),
      bl: Math.max(0, rect.cornerRadius.bottomLeft ?? 0),
    };
  }
  const r =
    typeof rect.cornerRadius === "number" ? rect.cornerRadius : typeof rect.rx === "number" ? rect.rx : 0;
  if (r <= 0) return { tl: 0, tr: 0, br: 0, bl: 0 };
  return { tl: r, tr: r, br: r, bl: r };
}

function strokeAttrs(obj: FreehandObject): string {
  const stroke = typeof obj.stroke === "string" ? obj.stroke.trim() : "";
  const width = typeof obj.strokeWidth === "number" ? obj.strokeWidth : 0;
  if (!stroke || stroke === "none" || stroke === "transparent" || width <= 0) {
    return `stroke="none" stroke-width="0"`;
  }
  const cap = obj.strokeLinecap || "butt";
  const join = obj.strokeLinejoin || "miter";
  const dash = obj.strokeDasharray?.trim();
  const miter = obj.strokeMiterlimit;
  const offset = obj.strokeDashoffset;
  const bits = [
    `stroke="${esc(stroke)}"`,
    `stroke-width="${width}"`,
    `stroke-linecap="${esc(cap)}"`,
    `stroke-linejoin="${esc(join)}"`,
  ];
  if (dash && dash !== "none") bits.push(`stroke-dasharray="${esc(dash)}"`);
  if (typeof miter === "number") bits.push(`stroke-miterlimit="${miter}"`);
  if (typeof offset === "number") bits.push(`stroke-dashoffset="${offset}"`);
  return bits.join(" ");
}

function wrapSvg(id: string, vb: { x: number; y: number; width: number; height: number }, inner: string): string {
  return `<svg class="s-paint" viewBox="${vb.x} ${vb.y} ${vb.width} ${vb.height}" preserveAspectRatio="none" aria-hidden="true">${inner}</svg>`;
}

/** SVG de forma/path con el mismo fill+stroke que el lienzo. */
export function publishedShapeSvg(obj: FreehandObject): string | null {
  const w = Math.max(1, obj.width);
  const h = Math.max(1, obj.height);
  const fill = migrateFill(obj.fill);
  const gid = `s-fill-${obj.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const paint = fillPaintValue(fill, gid);
  const def = fillDefSvgString(fill, gid);
  const defs = def ? `<defs>${def}</defs>` : "";
  const fillAttr = `fill="${esc(paint)}"`;
  const stroke = strokeAttrs(obj);

  if (obj.type === "ellipse") {
    return wrapSvg(obj.id, { x: 0, y: 0, width: w, height: h }, `${defs}<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" ${fillAttr} ${stroke} />`);
  }

  if (obj.type === "path") {
    const geom = publishedPathGeom(obj);
    if (!geom) {
      return wrapSvg(obj.id, { x: 0, y: 0, width: w, height: h }, `${defs}<rect x="0" y="0" width="${w}" height="${h}" ${fillAttr} ${stroke} />`);
    }
    const tf = geom.matrix
      ? ` transform="matrix(${geom.matrix.a} ${geom.matrix.b} ${geom.matrix.c} ${geom.matrix.d} ${geom.matrix.e} ${geom.matrix.f})"`
      : "";
    return wrapSvg(
      obj.id,
      geom.viewBox,
      `${defs}<path d="${esc(geom.d)}" ${fillAttr} ${stroke}${tf} />`,
    );
  }

  if (obj.type === "rect" && !obj.isImageFrame) {
    const c = cornersOf(obj) ?? { tl: 0, tr: 0, br: 0, bl: 0 };
    const d = roundedRectD(w, h, c);
    return wrapSvg(obj.id, { x: 0, y: 0, width: w, height: h }, `${defs}<path d="${esc(d)}" ${fillAttr} ${stroke} />`);
  }

  return null;
}

function cssPropsToInline(style: CSSProperties): string {
  const map: Record<string, string> = {
    color: "color",
    backgroundImage: "background-image",
    backgroundClip: "background-clip",
    WebkitBackgroundClip: "-webkit-background-clip",
    WebkitTextFillColor: "-webkit-text-fill-color",
    backgroundSize: "background-size",
    backgroundPosition: "background-position",
  };
  const bits: string[] = [];
  for (const [key, cssKey] of Object.entries(map)) {
    const value = style[key as keyof CSSProperties];
    if (typeof value === "string" && value) bits.push(`${cssKey}:${value}`);
  }
  return bits.join(";");
}

export function publishedTextFillInline(obj: FreehandObject): string {
  return cssPropsToInline(textFillCssProperties(migrateFill(obj.fill)));
}

export function publishedRichTextHtml(obj: FreehandObject): string {
  const textObj = obj as FreehandObject & {
    text?: string;
    _designerRichSpans?: Array<{
      text: string;
      style?: {
        fontWeight?: string;
        fontStyle?: string;
        textUnderline?: boolean;
        textStrikethrough?: boolean;
        fontSize?: number;
        color?: string;
        fontFamily?: string;
        letterSpacing?: number;
        linkHref?: string;
      };
    }>;
  };
  if (!textObj._designerRichSpans?.length) return esc(textObj.text ?? "");
  const baseSize =
    typeof (textObj as { fontSize?: number }).fontSize === "number"
      ? (textObj as { fontSize: number }).fontSize
      : 16;
  return textObj._designerRichSpans
    .map((span) => {
      const bits: string[] = [];
      const st = span.style;
      if (st?.fontWeight) bits.push(`font-weight:${esc(String(st.fontWeight))}`);
      if (st?.fontStyle) bits.push(`font-style:${esc(st.fontStyle)}`);
      if (st?.color) bits.push(`color:${esc(st.color)}`);
      if (st?.fontFamily) bits.push(`font-family:${esc(st.fontFamily)}`);
      if (typeof st?.fontSize === "number") bits.push(`font-size:${st.fontSize / Math.max(1, baseSize)}em`);
      if (typeof st?.letterSpacing === "number") {
        bits.push(`letter-spacing:${st.letterSpacing / Math.max(1, baseSize)}em`);
      }
      const deco: string[] = [];
      if (st?.textUnderline) deco.push("underline");
      if (st?.textStrikethrough) deco.push("line-through");
      if (deco.length) bits.push(`text-decoration:${deco.join(" ")}`);
      const open = bits.length ? `<span style="${bits.join(";")}">` : "";
      const close = bits.length ? "</span>" : "";
      const inner = `${open}${esc(span.text)}${close}`;
      if (st?.linkHref && /^https?:\/\//i.test(st.linkHref)) {
        return `<a href="${esc(st.linkHref)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
      }
      return inner;
    })
    .join("");
}

export function publishedLayerTransform(obj: FreehandObject, rotation: number): string {
  const parts: string[] = [];
  if (rotation) parts.push(`rotate(${rotation}deg)`);
  if (obj.skewX) parts.push(`skewX(${obj.skewX}deg)`);
  if (obj.skewY) parts.push(`skewY(${obj.skewY}deg)`);
  const sx = obj.flipX ? -1 : (obj as { scaleX?: number }).scaleX && (obj as { scaleX?: number }).scaleX !== 1
    ? (obj as { scaleX?: number }).scaleX!
    : 1;
  const sy = obj.flipY ? -1 : (obj as { scaleY?: number }).scaleY && (obj as { scaleY?: number }).scaleY !== 1
    ? (obj as { scaleY?: number }).scaleY!
    : 1;
  if (sx !== 1 || sy !== 1) parts.push(`scale(${sx}, ${sy})`);
  return parts.join(" ");
}

export function publishedBlendMode(obj: FreehandObject): string {
  const mode = obj.blendMode;
  if (!mode || mode === "normal") return "";
  return `mix-blend-mode:${mode}`;
}

export function publishedGlowFilter(obj: FreehandObject): string {
  const glow = obj.layerEffects?.outerGlow;
  if (!glow?.enabled) return "";
  const color = glow.color || "#000";
  const size = Math.max(0, glow.size ?? 0);
  const opacity = Math.max(0, Math.min(1, glow.opacity ?? 1));
  if (size <= 0 || opacity <= 0) return "";
  return `filter:drop-shadow(0 0 ${size}px ${color})`;
}

export function googleFontsHrefFromFamilies(families: string[], generic: Set<string>): string | null {
  const unique = [...new Set(families.map((f) => f.trim()).filter(Boolean))].filter(
    (family) => !generic.has(family.toLowerCase()),
  );
  if (!unique.length) return null;
  const params = unique
    .map(
      (family) =>
        `family=${encodeURIComponent(family)}:ital,wght@0,400;0,500;0,600;0,700;1,400;1,700`,
    )
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}
