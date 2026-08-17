/**
 * Compila snapshot + blueprint a HTML/CSS/JS de esa web.
 * No importa runtime ni estilos de Foldder.
 */
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import { collectDesignerPageFontFamilies } from "@/app/spaces/designer/designer-page-text-frame-sync";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import { getPageDimensions } from "@/app/spaces/indesign/page-formats";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { resolveSiteCreatorResponsiveDisplay } from "./site-creator-responsive";
import {
  isSiteButtonNode,
  type SiteBlueprintV1,
} from "./site-creator-types";
import {
  SITE_CREATOR_MOBILE_WIDTH,
  SITE_CREATOR_TABLET_WIDTH,
} from "./site-creator-viewport";
import {
  publishAssetPlaceholder,
  type PublishImageRef,
} from "./site-creator-publish-placeholders";

export type { PublishImageRef };
export { publishAssetPlaceholder };

export type CompiledPublishedSite = {
  html: string;
  css: string;
  js: string;
};

type BandName = "wide" | "tablet" | "mobile";

type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
};

type CompiledLayer = {
  id: string;
  cssId: string;
  z: number;
  kind: "image" | "text" | "shape" | "path";
  boxes: Record<BandName, Box | null>;
  imageHref?: string;
  alt: string;
  textHtml?: string;
  fontFamily?: string;
  fontSize?: Record<BandName, number>;
  fontWeight?: string | number;
  fontStyle?: string;
  letterSpacing?: number;
  lineHeight?: number;
  textAlign?: string;
  color?: string;
  background?: string;
  stroke?: string;
  strokeWidth?: number;
  borderRadius?: string;
  objectFit?: string;
  pathD?: string;
  buttonLabel?: string;
};

const GENERIC_FONTS = new Set([
  "sans-serif",
  "serif",
  "monospace",
  "system-ui",
  "arial",
  "helvetica",
  "helvetica neue",
  "times",
  "times new roman",
  "georgia",
  "courier",
  "courier new",
  "ui-sans-serif",
]);

export function cssSafeId(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9_-]/g, "_");
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `s_${cleaned}`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function collectPublishImageRefs(page: DesignerPageState): PublishImageRef[] {
  const refs: PublishImageRef[] = [];
  const seen = new Set<string>();
  const visit = (objects: FreehandObject[] | undefined) => {
    for (const obj of objects ?? []) {
      const ref = imageRefFromObject(obj);
      if (ref && !seen.has(ref.layerId)) {
        seen.add(ref.layerId);
        refs.push(ref);
      }
      if (obj.type === "groupContainer" || obj.type === "booleanGroup") {
        visit((obj as { children?: FreehandObject[] }).children);
      } else if (obj.type === "clippingContainer") {
        const clip = obj as { mask?: FreehandObject; content?: FreehandObject[] };
        if (clip.mask) visit([clip.mask]);
        visit(clip.content);
      }
    }
  };
  visit(page.objects);
  return refs;
}

function imageRefFromObject(obj: FreehandObject): PublishImageRef | null {
  if (obj.type === "image") {
    const image = obj as FreehandObject & { src?: string; s3Key?: string; s3KeyOpt?: string };
    const optKey = pickS3Key(image.s3KeyOpt);
    const s3Key = optKey ?? pickS3Key(image.s3Key);
    const src = usableSrc(image.src);
    if (!s3Key && !src) return null;
    return { layerId: obj.id, s3Key, src, alreadyOptimized: Boolean(optKey) };
  }
  const frame = obj.imageFrameContent;
  if (frame) {
    const optKey = pickS3Key(frame.s3KeyOpt);
    const s3Key = optKey ?? pickS3Key(frame.s3Key, frame.s3KeyHr);
    const src = usableSrc(frame.src);
    if (!s3Key && !src) return null;
    return { layerId: obj.id, s3Key, src, alreadyOptimized: Boolean(optKey) };
  }
  return null;
}

function pickS3Key(...keys: Array<string | undefined>): string | undefined {
  for (const key of keys) {
    if (typeof key === "string" && key.trim() && !key.includes("..")) return key.trim();
  }
  return undefined;
}

function usableSrc(src: string | undefined): string | undefined {
  if (typeof src !== "string") return undefined;
  const trimmed = src.trim();
  if (!trimmed || trimmed === "data:," || trimmed === "data:") return undefined;
  if (trimmed.startsWith("data:") || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return undefined;
}

function flattenPaintList(objects: FreehandObject[] | undefined): FreehandObject[] {
  const out: FreehandObject[] = [];
  const visit = (list: FreehandObject[] | undefined) => {
    for (const obj of list ?? []) {
      if (obj.visible === false) continue;
      if (obj.type === "groupContainer") {
        visit((obj as { children?: FreehandObject[] }).children);
        continue;
      }
      if (obj.type === "booleanGroup") {
        visit((obj as { children?: FreehandObject[] }).children);
        continue;
      }
      if (obj.type === "clippingContainer") {
        const clip = obj as { content?: FreehandObject[] };
        visit(clip.content);
        continue;
      }
      if (obj.type === "adjustmentLayer") continue;
      out.push(obj);
    }
  };
  visit(objects);
  return out;
}

function boxFromObject(obj: FreehandObject): Box {
  return {
    x: obj.x,
    y: obj.y,
    width: Math.max(0, obj.width),
    height: Math.max(0, obj.height),
    rotation: obj.rotation || 0,
    opacity: obj.opacity == null ? 1 : obj.opacity,
    visible: obj.visible !== false,
  };
}

function cssPaint(fill: unknown, asText: boolean): string | null {
  if (fill == null) return null;
  if (typeof fill === "string") {
    if (!fill || fill === "none" || fill === "transparent") return null;
    return fill;
  }
  if (typeof fill !== "object") return null;
  const rec = fill as { type?: string; color?: string; stops?: Array<{ color?: string; opacity?: number; position?: number }>; x1?: number; y1?: number; x2?: number; y2?: number };
  if (rec.type === "solid") {
    if (!rec.color || rec.color === "none" || rec.color === "transparent") return null;
    return rec.color;
  }
  if (asText) return rec.stops?.[0]?.color ?? null;
  if (rec.type === "gradient-linear" && rec.stops?.length) {
    const stops = rec.stops
      .map((stop) => {
        const color = stop.color || "#000";
        const pos = Number.isFinite(stop.position) ? `${stop.position}%` : "";
        return `${color}${pos ? ` ${pos}` : ""}`;
      })
      .join(", ");
    const x1 = rec.x1 ?? 0;
    const y1 = rec.y1 ?? 0.5;
    const x2 = rec.x2 ?? 1;
    const y2 = rec.y2 ?? 0.5;
    const angle = Math.round((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI);
    return `linear-gradient(${angle}deg, ${stops})`;
  }
  return rec.color ?? null;
}

function pct(value: number, total: number): string {
  return `${((value / Math.max(1, total)) * 100).toFixed(4)}%`;
}

function textInnerHtml(obj: FreehandObject): string {
  const textObj = obj as FreehandObject & {
    text?: string;
    _designerRichSpans?: Array<{ text: string; style?: { fontWeight?: string; fontStyle?: string; color?: string } }>;
  };
  if (textObj._designerRichSpans?.length) {
    return textObj._designerRichSpans
      .map((span) => {
        const bits: string[] = [];
        if (span.style?.fontWeight) bits.push(`font-weight:${escapeHtml(String(span.style.fontWeight))}`);
        if (span.style?.fontStyle) bits.push(`font-style:${escapeHtml(String(span.style.fontStyle))}`);
        if (span.style?.color) bits.push(`color:${escapeHtml(span.style.color)}`);
        const open = bits.length ? `<span style="${bits.join(";")}">` : "";
        const close = bits.length ? "</span>" : "";
        return `${open}${escapeHtml(span.text)}${close}`;
      })
      .join("");
  }
  return escapeHtml(textObj.text ?? "");
}

function googleFontsHref(families: string[]): string | null {
  const unique = [...new Set(families.map((f) => f.trim()).filter(Boolean))].filter(
    (family) => !GENERIC_FONTS.has(family.toLowerCase()),
  );
  if (!unique.length) return null;
  const params = unique
    .map((family) => `family=${encodeURIComponent(family)}:wght@400;500;600;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

function buttonLabelByLayerId(blueprint: SiteBlueprintV1): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of Object.values(blueprint.nodes)) {
    if (!isSiteButtonNode(node)) continue;
    const label = node.config.accessibleLabel?.trim() || node.label;
    for (const layerId of node.layerIds) map.set(layerId, label);
  }
  return map;
}

function applyStroke(layer: CompiledLayer, obj: FreehandObject): void {
  const stroke = typeof obj.stroke === "string" ? obj.stroke.trim() : "";
  const width = typeof obj.strokeWidth === "number" ? obj.strokeWidth : 0;
  if (!stroke || stroke === "none" || stroke === "transparent" || width <= 0) return;
  layer.stroke = stroke;
  layer.strokeWidth = width;
}

function objectFitForFrame(obj: FreehandObject): string | undefined {
  const mode = obj.imageFrameContent?.fittingMode;
  if (!mode) return obj.type === "image" ? "cover" : undefined;
  if (mode === "fit-proportional" || mode === "center-content") return "contain";
  return "cover";
}

export function compilePublishedSite(args: {
  page: DesignerPageState;
  blueprint: SiteBlueprintV1;
  title: string;
  imageHrefByLayerId: Record<string, string>;
}): CompiledPublishedSite {
  const referenceIndex = buildSiteSelectionIndex(args.page);
  const reference = getPageDimensions(args.page);
  const wide = resolveSiteCreatorResponsiveDisplay({
    page: args.page,
    blueprint: args.blueprint,
    referenceIndex,
    viewportWidth: reference.width,
  });
  const tablet = resolveSiteCreatorResponsiveDisplay({
    page: args.page,
    blueprint: args.blueprint,
    referenceIndex,
    viewportWidth: SITE_CREATOR_TABLET_WIDTH,
  });
  const mobile = resolveSiteCreatorResponsiveDisplay({
    page: args.page,
    blueprint: args.blueprint,
    referenceIndex,
    viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
  });

  const layouts: Record<BandName, { width: number; height: number; objects: FreehandObject[] }> = {
    wide: {
      width: wide.layout.layoutWidth,
      height: wide.layout.layoutHeight,
      objects: flattenPaintList(wide.displayPage.objects),
    },
    tablet: {
      width: tablet.layout.layoutWidth,
      height: tablet.layout.layoutHeight,
      objects: flattenPaintList(tablet.displayPage.objects),
    },
    mobile: {
      width: mobile.layout.layoutWidth,
      height: mobile.layout.layoutHeight,
      objects: flattenPaintList(mobile.displayPage.objects),
    },
  };

  const buttonLabels = buttonLabelByLayerId(args.blueprint);
  const layers = new Map<string, CompiledLayer>();
  const order: string[] = [];

  (["wide", "tablet", "mobile"] as BandName[]).forEach((band) => {
    layouts[band].objects.forEach((obj, index) => {
      let layer = layers.get(obj.id);
      if (!layer) {
        const kind: CompiledLayer["kind"] =
          obj.type === "text" || obj.type === "textOnPath"
            ? "text"
            : obj.type === "image" || obj.imageFrameContent
              ? "image"
              : obj.type === "path"
                ? "path"
                : "shape";
        layer = {
          id: obj.id,
          cssId: cssSafeId(obj.id),
          z: index + 1,
          kind,
          boxes: { wide: null, tablet: null, mobile: null },
          imageHref: args.imageHrefByLayerId[obj.id],
          alt: buttonLabels.get(obj.id) || (obj.name && obj.name !== obj.id ? obj.name : ""),
          fontSize: { wide: 16, tablet: 16, mobile: 16 },
          buttonLabel: buttonLabels.get(obj.id),
        };
        if (kind === "text") {
          const textObj = obj as FreehandObject & {
            fontFamily?: string;
            fontWeight?: string | number;
            fontStyle?: string;
            letterSpacing?: number;
            lineHeight?: number;
            textAlign?: string;
            fontSize?: number;
          };
          layer.textHtml = textInnerHtml(obj);
          layer.fontFamily = textObj.fontFamily;
          layer.fontWeight = textObj.fontWeight;
          layer.fontStyle = textObj.fontStyle;
          layer.letterSpacing = textObj.letterSpacing;
          layer.lineHeight = textObj.lineHeight;
          layer.textAlign = textObj.textAlign;
          layer.color = cssPaint(obj.fill, true) ?? "#111";
        } else if (kind === "shape") {
          layer.background = cssPaint(obj.fill, false) ?? undefined;
          applyStroke(layer, obj);
          if (obj.type === "ellipse") layer.borderRadius = "50%";
          else if (obj.type === "rect") {
            const rx = (obj as { rx?: number }).rx;
            if (rx) layer.borderRadius = `${rx}px`;
          }
        } else if (kind === "image") {
          layer.objectFit = objectFitForFrame(obj);
        } else if (kind === "path") {
          const path = obj as { svgPathD?: string };
          layer.pathD = path.svgPathD;
          layer.background = cssPaint(obj.fill, false) ?? undefined;
          applyStroke(layer, obj);
        }
        layers.set(obj.id, layer);
        order.push(obj.id);
      }
      layer.boxes[band] = boxFromObject(obj);
      if (layer.kind === "text") {
        const size = (obj as { fontSize?: number }).fontSize;
        if (typeof size === "number") layer.fontSize![band] = size;
      }
      layer.z = Math.max(layer.z, index + 1);
    });
  });

  const pageBg =
    args.page.pageBackground === "black" ? "#000000" : args.page.pageBackground === "transparent" ? "transparent" : "#ffffff";

  const css = buildCss({
    pageBg,
    layouts,
    layers: order.map((id) => layers.get(id)!).filter(Boolean),
    referenceWidth: reference.width,
  });
  const html = buildHtml({
    title: args.title.trim() || "Sitio",
    fontHref: googleFontsHref(collectDesignerPageFontFamilies(args.page)),
    layers: order.map((id) => layers.get(id)!).filter(Boolean),
  });
  const js = `"use strict";\n`;

  return { html, css, js };
}

function buildCss(args: {
  pageBg: string;
  layouts: Record<BandName, { width: number; height: number }>;
  layers: CompiledLayer[];
  referenceWidth: number;
}): string {
  const tabletMax = Math.max(SITE_CREATOR_TABLET_WIDTH, args.referenceWidth - 1);
  const lines: string[] = [
    "*,*::before,*::after{box-sizing:border-box}",
    "html,body{margin:0;padding:0;width:100%;min-height:100%}",
    `body{background:${args.pageBg};-webkit-font-smoothing:antialiased}`,
    ".s-page{position:relative;width:100%;overflow:hidden;container-type:inline-size}",
    ".s-el{position:absolute;display:block;margin:0;border:0;padding:0;max-width:none}",
    ".s-btn{background:transparent;cursor:pointer;appearance:none}",
    ".s-el img,.s-image{width:100%;height:100%;object-fit:cover;display:block}",
    ".s-text{white-space:pre-wrap;overflow:visible}",
    ".s-path{width:100%;height:100%;display:block}",
    bandPageCss("wide", args.layouts.wide, false),
  ];

  for (const layer of args.layers) {
    lines.push(layerBoxCss(layer, "wide", args.layouts.wide, false));
  }

  lines.push(`@media (max-width:${tabletMax}px) and (min-width:${SITE_CREATOR_TABLET_WIDTH}px){`);
  lines.push(bandPageCss("tablet", args.layouts.tablet, true));
  for (const layer of args.layers) lines.push(layerBoxCss(layer, "tablet", args.layouts.tablet, true));
  lines.push("}");

  lines.push(`@media (max-width:${SITE_CREATOR_TABLET_WIDTH - 1}px){`);
  lines.push(bandPageCss("mobile", args.layouts.mobile, true));
  for (const layer of args.layers) lines.push(layerBoxCss(layer, "mobile", args.layouts.mobile, true));
  lines.push("}");

  return `${lines.filter(Boolean).join("\n")}\n`;
}

function bandPageCss(_band: BandName, layout: { width: number; height: number }, _nested: boolean): string {
  return `.s-page{aspect-ratio:${Math.max(1, layout.width)} / ${Math.max(1, layout.height)};min-height:0}`;
}

function layerBoxCss(
  layer: CompiledLayer,
  band: BandName,
  layout: { width: number; height: number },
  _nested: boolean,
): string {
  const box = layer.boxes[band];
  const sel = `.s-el-${layer.cssId}`;
  if (!box) return `${sel}{display:none}`;
  const transform = box.rotation ? `transform:rotate(${box.rotation}deg)` : "";
  const font =
    layer.kind === "text"
      ? `font-size:calc(${layer.fontSize?.[band] ?? 16} * 100cqw / ${Math.max(1, layout.width)})`
      : "";
  const rules = [
    "display:block",
    `left:${pct(box.x, layout.width)}`,
    `top:${pct(box.y, layout.height)}`,
    `width:${pct(box.width, layout.width)}`,
    `height:${pct(box.height, layout.height)}`,
    `z-index:${layer.z}`,
    box.opacity < 1 ? `opacity:${box.opacity}` : "",
    transform,
    font,
    layer.kind === "text" && layer.fontFamily ? `font-family:${cssFontFamily(layer.fontFamily)}` : "",
    layer.kind === "text" && layer.fontWeight != null ? `font-weight:${layer.fontWeight}` : "",
    layer.kind === "text" && layer.fontStyle ? `font-style:${layer.fontStyle}` : "",
    layer.kind === "text" && layer.letterSpacing != null ? `letter-spacing:${layer.letterSpacing}px` : "",
    layer.kind === "text" && layer.lineHeight != null ? `line-height:${layer.lineHeight}` : "",
    layer.kind === "text" && layer.textAlign ? `text-align:${layer.textAlign}` : "",
    layer.kind === "text" && layer.color ? `color:${layer.color}` : "",
    layer.kind === "shape" && layer.background ? `background:${layer.background}` : "",
    layer.stroke && layer.strokeWidth ? `border:${layer.strokeWidth}px solid ${layer.stroke}` : "",
    layer.borderRadius ? `border-radius:${layer.borderRadius}` : "",
    layer.kind === "image" && layer.objectFit ? `object-fit:${layer.objectFit}` : "",
  ].filter(Boolean);
  return `${sel}{${rules.join(";")}}`;
}

function cssFontFamily(family: string): string {
  const trimmed = family.trim();
  if (!trimmed) return "sans-serif";
  if (GENERIC_FONTS.has(trimmed.toLowerCase())) return trimmed;
  if (trimmed.includes(",")) return trimmed;
  return `"${trimmed.replace(/"/g, "")}",sans-serif`;
}

function buildHtml(args: {
  title: string;
  fontHref: string | null;
  layers: CompiledLayer[];
}): string {
  const nodes = args.layers.map((layer) => {
    const cls = `s-el s-el-${layer.cssId}${layer.kind === "text" ? " s-text" : ""}${layer.kind === "image" ? " s-image" : ""}${layer.buttonLabel ? " s-btn" : ""}`;
    const labelAttr = layer.buttonLabel ? ` aria-label="${escapeHtml(layer.buttonLabel)}"` : "";
    if (layer.kind === "image") {
      const src = layer.imageHref ? escapeHtml(layer.imageHref) : "";
      if (layer.buttonLabel) {
        return src
          ? `<button type="button" class="${cls}"${labelAttr}><img src="${src}" alt=""></button>`
          : `<button type="button" class="${cls}"${labelAttr}></button>`;
      }
      return src
        ? `<img class="${cls}" src="${src}" alt="${escapeHtml(layer.alt)}" />`
        : `<div class="${cls}" aria-hidden="true"></div>`;
    }
    if (layer.kind === "text") {
      const tag = layer.buttonLabel ? "button" : "div";
      const typeAttr = layer.buttonLabel ? ` type="button"` : "";
      return `<${tag} class="${cls}"${typeAttr}${labelAttr}>${layer.textHtml ?? ""}</${tag}>`;
    }
    if (layer.kind === "path" && layer.pathD) {
      return `<svg class="${cls} s-path" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true"><path d="${escapeHtml(layer.pathD)}" fill="${escapeHtml(layer.background || "currentColor")}" /></svg>`;
    }
    const tag = layer.buttonLabel ? "button" : "div";
    const typeAttr = layer.buttonLabel ? ` type="button"` : "";
    const hidden = layer.buttonLabel ? "" : ` aria-hidden="true"`;
    return `<${tag} class="${cls}"${typeAttr}${labelAttr}${hidden}></${tag}>`;
  });

  const fontLink = args.fontHref
    ? `  <link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n  <link rel="stylesheet" href="${escapeHtml(args.fontHref)}">\n`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(args.title)}</title>
${fontLink}  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main class="s-page">
${nodes.map((n) => `    ${n}`).join("\n")}
  </main>
  <script src="script.js"></script>
</body>
</html>
`;
}
