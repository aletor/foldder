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
  destinationScrollKind,
  lastDocumentSection,
  listDocumentSections,
  listSectionScrollHops,
  scrollFlowUsesKind,
  sectionScrollNeedsViewportPad,
} from "./site-creator-section-scroll";
import { compilePublishedScrollScript } from "./site-creator-section-scroll-runtime";
import {
  blueprintHasViewportSection,
  sectionHeightModeForBand,
  type SectionHeightBand,
} from "./site-creator-section-height";
import {
  boxFromObject,
  buildPublishForest,
  collectObjectMap,
  toLocalBox,
  worldBoxForBand,
  type PublishBand as TreeBand,
  type PublishBox,
  type PublishForest,
  type PublishTreeNode,
} from "./site-creator-publish-tree";
import { containerIsFullWidthForBand } from "./site-creator-group-width-layout";
import {
  SITE_CREATOR_MOBILE_WIDTH,
  SITE_CREATOR_TABLET_WIDTH,
  siteCreatorTabletMediaMaxWidth,
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

type SectionLayoutHint = { sectionId: string; top: number; height: number };

function sectionLayoutHint(
  section: { id: string; sourceRange: { top: number; bottom: number } },
  hints: SectionLayoutHint[] | null | undefined,
): { top: number; bottom: number; designed: number } {
  const hint = hints?.find((item) => item.sectionId === section.id);
  if (hint) {
    return {
      top: hint.top,
      bottom: hint.top + hint.height,
      designed: Math.max(1, hint.height),
    };
  }
  return {
    top: section.sourceRange.top,
    bottom: section.sourceRange.bottom,
    designed: Math.max(1, section.sourceRange.bottom - section.sourceRange.top),
  };
}

function hintsFromResolved(result: {
  resolvedLayout?: { regions: { sectionId: string; layoutRect: { y: number; height: number } }[] } | null;
}): SectionLayoutHint[] | null {
  const regions = result.resolvedLayout?.regions;
  if (!regions?.length) return null;
  return regions.map((region) => ({
    sectionId: region.sectionId,
    top: region.layoutRect.y,
    height: region.layoutRect.height,
  }));
}

function extraShiftExpr(
  blueprint: SiteBlueprintV1,
  y: number,
  pageWidth: number,
  band: SectionHeightBand = "wide",
  hints?: SectionLayoutHint[] | null,
): string | null {
  if (!blueprintHasViewportSection(blueprint, band)) return null;
  const parts: string[] = [];
  for (const section of listDocumentSections(blueprint)) {
    if (sectionHeightModeForBand(blueprint, section, band) !== "viewport") continue;
    const layout = sectionLayoutHint(section, hints);
    if (y + 0.5 < layout.bottom) continue;
    parts.push(`max(0px,100dvh - 100cqw * ${layout.designed} / ${Math.max(1, pageWidth)})`);
  }
  return parts.length > 0 ? parts.join(" + ") : "0px";
}

function extraGrowExpr(
  blueprint: SiteBlueprintV1,
  box: { y: number; height: number; width: number },
  pageWidth: number,
  band: SectionHeightBand = "wide",
  hints?: SectionLayoutHint[] | null,
): string | null {
  if (!blueprintHasViewportSection(blueprint, band)) return null;
  for (const section of listDocumentSections(blueprint)) {
    if (sectionHeightModeForBand(blueprint, section, band) !== "viewport") continue;
    const layout = sectionLayoutHint(section, hints);
    const touchesBottom = box.y < layout.bottom && box.y + box.height >= layout.bottom - 4;
    if (touchesBottom && box.width >= pageWidth * 0.8) {
      return `max(0px,100dvh - 100cqw * ${layout.designed} / ${Math.max(1, pageWidth)})`;
    }
  }
  return null;
}

function emitSectionViewportCss(
  lines: string[],
  blueprint: SiteBlueprintV1,
  layout: { width: number; height: number },
  band: SectionHeightBand,
  hints: SectionLayoutHint[] | null | undefined,
  flow: boolean,
): void {
  const sections = listDocumentSections(blueprint);
  if (sections.length === 0) return;
  const pageHeight = Math.max(1, layout.height);
  const pageWidth = Math.max(1, layout.width);
  const extraParts: string[] = [];
  for (const section of sections) {
    const viewport = sectionHeightModeForBand(blueprint, section, band) === "viewport";
    const geom = sectionLayoutHint(section, hints);
    const shift = extraShiftExpr(blueprint, geom.top, pageWidth, band, hints);
    const top =
      shift != null ? `calc(${shift} + ${cqwLen(geom.top, pageWidth)})` : pct(geom.top, pageHeight);
    const heightRule = viewport
      ? ";height:100dvh;max-height:100dvh"
      : band === "wide"
        ? ""
        : ";height:0;min-height:0";
    lines.push(`.s-sec-anchor-${cssSafeId(section.id)}{top:${top}${heightRule}}`);
    if (viewport) {
      extraParts.push(`max(0px,100dvh - 100cqw * ${geom.designed} / ${pageWidth})`);
    }
  }
  if (extraParts.length > 0) {
    lines.push(
      `html.s-has-vh-secs .s-page{aspect-ratio:auto;height:auto;overflow:visible;min-height:calc(100cqw * ${pageHeight} / ${pageWidth} + ${extraParts.join(" + ")})}`,
    );
  } else if (band !== "wide") {
    if (flow) {
      lines.push(
        `html.s-has-vh-secs .s-page{aspect-ratio:auto;height:auto;overflow:visible;min-height:calc(100cqw * ${pageHeight} / ${pageWidth})}`,
      );
    } else {
      lines.push(
        `html.s-has-vh-secs .s-page{aspect-ratio:${pageWidth} / ${pageHeight};min-height:0;height:auto;overflow:hidden}`,
      );
    }
  }
  emitSectionScrollEndPad(lines, blueprint, pageWidth, band, hints);
}

/** Pad solo si la última sección no es viewport: alinea su inicio sin un viewport extra. */
function emitSectionScrollEndPad(
  lines: string[],
  blueprint: SiteBlueprintV1,
  pageWidth: number,
  band: SectionHeightBand,
  hints: SectionLayoutHint[] | null | undefined,
): void {
  if (!sectionScrollNeedsViewportPad(blueprint)) return;
  const last = lastDocumentSection(blueprint);
  if (!last) return;
  if (sectionHeightModeForBand(blueprint, last, band) === "viewport") {
    if (band !== "wide") {
      lines.push("html.s-scroll-smooth body,html.s-scroll-snap body{padding-bottom:0}");
    }
    return;
  }
  const geom = sectionLayoutHint(last, hints);
  lines.push(
    `html.s-scroll-smooth body,html.s-scroll-snap body{padding-bottom:max(0px,100dvh - 100cqw * ${geom.designed} / ${Math.max(1, pageWidth)})}`,
  );
}

function cqwLen(px: number, pageWidth: number): string {
  return `calc(100cqw * ${px} / ${Math.max(1, pageWidth)})`;
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
    expandViewportSections: false,
  });
  const tablet = resolveSiteCreatorResponsiveDisplay({
    page: args.page,
    blueprint: args.blueprint,
    referenceIndex,
    viewportWidth: SITE_CREATOR_TABLET_WIDTH,
    expandViewportSections: false,
  });
  const mobile = resolveSiteCreatorResponsiveDisplay({
    page: args.page,
    blueprint: args.blueprint,
    referenceIndex,
    viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
    expandViewportSections: false,
  });

  const layouts: Record<BandName, { width: number; height: number; objects: FreehandObject[] }> = {
    wide: { width: wide.layout.layoutWidth, height: wide.layout.layoutHeight, objects: wide.displayPage.objects ?? [] },
    tablet: { width: tablet.layout.layoutWidth, height: tablet.layout.layoutHeight, objects: tablet.displayPage.objects ?? [] },
    mobile: { width: mobile.layout.layoutWidth, height: mobile.layout.layoutHeight, objects: mobile.displayPage.objects ?? [] },
  };

  const forest = buildPublishForest({
    objectsByBand: {
      wide: layouts.wide.objects,
      tablet: layouts.tablet.objects,
      mobile: layouts.mobile.objects,
    },
    blueprint: args.blueprint,
    index: referenceIndex,
    pageRect: { x: 0, y: 0, width: reference.width, height: reference.height },
  });

  const buttonLabels = buttonLabelByLayerId(args.blueprint);
  const layers = new Map<string, CompiledLayer>();
  const wideMap = collectObjectMap(layouts.wide.objects);
  for (const obj of wideMap.values()) {
    const layer = compilePaintLayer(obj, args.imageHrefByLayerId, buttonLabels);
    if (!layer) continue;
    layers.set(obj.id, layer);
  }
  (["wide", "tablet", "mobile"] as BandName[]).forEach((band) => {
    const map = collectObjectMap(layouts[band].objects);
    for (const [id, layer] of layers) {
      const obj = map.get(id);
      if (!obj) {
        layer.boxes[band] = null;
        continue;
      }
      layer.boxes[band] = boxFromObject(obj);
      if (layer.kind === "text") {
        const size = (obj as { fontSize?: number }).fontSize;
        if (typeof size === "number") layer.fontSize![band] = size;
      }
    }
  });

  const pageBg =
    args.page.pageBackground === "black"
      ? "#000000"
      : args.page.pageBackground === "transparent"
        ? "transparent"
        : "#ffffff";

  const css = buildCss({
    pageBg,
    layouts,
    forest,
    layers,
    referenceWidth: reference.width,
    blueprint: args.blueprint,
    hintsByBand: {
      wide: hintsFromResolved(wide),
      tablet: hintsFromResolved(tablet),
      mobile: hintsFromResolved(mobile),
    },
  });
  const html = buildHtml({
    title: args.title.trim() || "Sitio",
    fontHref: googleFontsHref(collectDesignerPageFontFamilies(args.page)),
    forest,
    layers,
    blueprint: args.blueprint,
  });
  return { html, css, js: compilePublishedScrollScript(listSectionScrollHops(args.blueprint)) };
}

function compilePaintLayer(
  obj: FreehandObject,
  imageHrefByLayerId: Record<string, string>,
  buttonLabels: Map<string, string>,
): CompiledLayer | null {
  if (obj.visible === false) return null;
  if (
    obj.type === "groupContainer" ||
    obj.type === "booleanGroup" ||
    obj.type === "clippingContainer" ||
    obj.type === "adjustmentLayer"
  ) {
    return null;
  }
  const kind: CompiledLayer["kind"] =
    obj.type === "text" || obj.type === "textOnPath"
      ? "text"
      : obj.type === "image" || obj.imageFrameContent
        ? "image"
        : obj.type === "path"
          ? "path"
          : "shape";
  const layer: CompiledLayer = {
    id: obj.id,
    cssId: cssSafeId(obj.id),
    z: 1,
    kind,
    boxes: { wide: null, tablet: null, mobile: null },
    imageHref: imageHrefByLayerId[obj.id],
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
  return layer;
}

function buildCss(args: {
  pageBg: string;
  layouts: Record<BandName, { width: number; height: number }>;
  forest: PublishForest;
  layers: Map<string, CompiledLayer>;
  referenceWidth: number;
  blueprint: SiteBlueprintV1;
  hintsByBand: Record<BandName, SectionLayoutHint[] | null>;
}): string {
  const tabletMax = siteCreatorTabletMediaMaxWidth(args.referenceWidth);
  const flow = args.forest.usesFlow;
  const lines: string[] = [
    "*,*::before,*::after{box-sizing:border-box}",
    "html,body{margin:0;padding:0;width:100%;min-height:100%}",
    `body{background:${args.pageBg};-webkit-font-smoothing:antialiased}`,
    `.s-page{position:relative;width:100%;overflow:${flow ? "visible" : "hidden"};container-type:inline-size}`,
    ".s-el,.s-group{position:absolute;display:block;margin:0;border:0;padding:0;max-width:none}",
    ".s-group{container-type:inline-size;overflow:visible}",
    ".s-row{position:relative;display:flex;flex-wrap:wrap;align-items:flex-start;width:100%;left:auto;top:auto;box-sizing:border-box}",
    ".s-row>.s-flow-item{position:relative;flex:0 0 auto;top:auto;left:auto}",
    ".s-row-full>.s-flow-item{flex:0 0 100%;width:100%}",
    ".s-group.s-has-flow{height:auto}",
    ".s-page.s-flow{height:auto;overflow:visible}",
    ".s-page.s-flow>.s-row{position:relative;left:auto;top:auto;width:100%}",
    ".s-btn{background:transparent;cursor:pointer;appearance:none}",
    ".s-el img,.s-image{width:100%;height:100%;object-fit:cover;display:block}",
    ".s-text{white-space:pre-wrap;overflow:visible}",
    ".s-path{width:100%;height:100%;display:block}",
    bandPageCss(args.layouts.wide, flow),
  ];

  if (scrollFlowUsesKind(args.blueprint, "smooth")) {
    lines.push("html.s-scroll-smooth{scroll-behavior:smooth}");
  }
  if (scrollFlowUsesKind(args.blueprint, "snap")) {
    lines.push("html.s-scroll-snap{scroll-snap-type:y proximity}");
    lines.push(".s-sec-anchor.s-snap{scroll-snap-align:start;scroll-snap-stop:always}");
  }
  const sections = listDocumentSections(args.blueprint);
  if (sections.length > 0) {
    lines.push(".s-sec-anchor{position:absolute;left:0;width:100%;height:0;pointer-events:none}");
    emitSectionViewportCss(
      lines,
      args.blueprint,
      args.layouts.wide,
      "wide",
      args.hintsByBand.wide,
      flow,
    );
  }

  collectTreeCss(
    lines,
    args.forest.children,
    "wide",
    args.layouts.wide,
    null,
    args.layers,
    false,
    args.blueprint,
    args.hintsByBand.wide,
  );

  lines.push(`@media (max-width:${tabletMax}px) and (min-width:${SITE_CREATOR_TABLET_WIDTH}px){`);
  lines.push(bandPageCss(args.layouts.tablet, flow));
  emitSectionViewportCss(
    lines,
    args.blueprint,
    args.layouts.tablet,
    "tablet",
    args.hintsByBand.tablet,
    flow,
  );
  collectTreeCss(
    lines,
    args.forest.children,
    "tablet",
    args.layouts.tablet,
    null,
    args.layers,
    false,
    args.blueprint,
    args.hintsByBand.tablet,
  );
  lines.push("}");

  lines.push(`@media (max-width:${SITE_CREATOR_TABLET_WIDTH - 1}px){`);
  lines.push(bandPageCss(args.layouts.mobile, flow));
  emitSectionViewportCss(
    lines,
    args.blueprint,
    args.layouts.mobile,
    "mobile",
    args.hintsByBand.mobile,
    flow,
  );
  collectTreeCss(
    lines,
    args.forest.children,
    "mobile",
    args.layouts.mobile,
    null,
    args.layers,
    false,
    args.blueprint,
    args.hintsByBand.mobile,
  );
  lines.push("}");

  return `${lines.filter(Boolean).join("\n")}\n`;
}

function bandPageCss(layout: { width: number; height: number }, flow: boolean): string {
  if (!flow) {
    return `.s-page{aspect-ratio:${Math.max(1, layout.width)} / ${Math.max(1, layout.height)};min-height:0}`;
  }
  return `.s-page{min-height:calc(100cqw * ${Math.max(1, layout.height)} / ${Math.max(1, layout.width)});aspect-ratio:auto}`;
}

function collectTreeCss(
  lines: string[],
  nodes: PublishTreeNode[],
  band: BandName,
  layout: { width: number; height: number },
  parent: PublishBox | null,
  layers: Map<string, CompiledLayer>,
  inRow = false,
  blueprint: SiteBlueprintV1,
  hints: SectionLayoutHint[] | null = null,
): void {
  const percentParent: PublishBox =
    parent ?? { x: 0, y: 0, width: layout.width, height: layout.height, rotation: 0, opacity: 1, visible: true };
  for (const node of nodes) {
    if (node.kind === "row") {
      lines.push(rowBoxCss(node, band, percentParent));
      collectTreeCss(lines, node.children, band, layout, percentParent, layers, true, blueprint, hints);
      continue;
    }
    if (node.kind === "group") {
      lines.push(groupBoxCss(node, band, percentParent, inRow, blueprint, layout.width, hints));
      collectTreeCss(
        lines,
        node.children,
        band,
        layout,
        worldBoxForBand(node, band as TreeBand),
        layers,
        false,
        blueprint,
        hints,
      );
      continue;
    }
    const layer = layers.get(node.id);
    if (!layer) continue;
    lines.push(
      layerBoxCss(layer, band, percentParent, worldBoxForBand(node, band as TreeBand), inRow, blueprint, layout.width, hints),
    );
  }
}

function rowBoxCss(
  node: Extract<PublishTreeNode, { kind: "row" }>,
  band: BandName,
  _parent: PublishBox,
): string {
  const sel = `.s-row-${cssSafeId(node.id)}`;
  const box = worldBoxForBand(node, band as TreeBand);
  if (!box) return `${sel}{display:none}`;
  return `${sel}{display:flex;width:100%;z-index:${node.z}}`;
}

function groupBoxCss(
  node: Extract<PublishTreeNode, { kind: "group" }>,
  band: BandName,
  parent: PublishBox,
  inRow: boolean,
  blueprint: SiteBlueprintV1,
  pageWidth = parent.width,
  hints: SectionLayoutHint[] | null = null,
): string {
  const sel = `.s-group-${cssSafeId(node.id)}`;
  const box = worldBoxForBand(node, band as TreeBand);
  if (!box) return `${sel}{display:none}`;
  const local = toLocalBox(box, parent);
  const full = node.widthMode === "full" || containerIsFullWidthForBand(blueprint, node.id, band);
  const pageParent = !inRow && parent.x === 0 && parent.y === 0 && Math.abs(parent.width - pageWidth) < 1;
  const shift = pageParent ? extraShiftExpr(blueprint, box.y, pageWidth, band, hints) : null;
  const useCqw = Boolean(pageParent && shift != null);
  const grow = useCqw ? extraGrowExpr(blueprint, box, pageWidth, band, hints) : null;
  const rules = [
    inRow ? "left:auto;top:auto" : full ? "left:0" : useCqw ? `left:${cqwLen(box.x, pageWidth)}` : `left:${pct(local.x, parent.width)}`,
    inRow || full
      ? ""
      : useCqw
        ? `top:calc(${shift} + ${cqwLen(box.y, pageWidth)})`
        : `top:${pct(local.y, parent.height)}`,
    full ? "width:100%" : useCqw ? `width:${cqwLen(box.width, pageWidth)}` : `width:${pct(local.width, parent.width)}`,
    inRow && full ? "flex:0 0 100%" : "",
    full || inRow
      ? `height:auto;aspect-ratio:${Math.max(1, box.width)} / ${Math.max(1, box.height)}`
      : useCqw
        ? grow
          ? `height:calc(${cqwLen(box.height, pageWidth)} + ${grow})`
          : `height:${cqwLen(box.height, pageWidth)}`
        : `height:${pct(local.height, parent.height)}`,
    `z-index:${node.z}`,
    box.opacity < 1 ? `opacity:${box.opacity}` : "",
    box.rotation ? `transform:rotate(${box.rotation}deg)` : "",
  ].filter(Boolean);
  return `${sel}{${rules.join(";")}}`;
}

function layerBoxCss(
  layer: CompiledLayer,
  band: BandName,
  parent: PublishBox,
  world: PublishBox | null,
  inRow = false,
  blueprint?: SiteBlueprintV1,
  pageWidth = parent.width,
  hints: SectionLayoutHint[] | null = null,
): string {
  const sel = `.s-el-${layer.cssId}`;
  const box = world ?? layer.boxes[band];
  if (!box) return `${sel}{display:none}`;
  const local = toLocalBox(box, parent);
  const pageParent =
    !inRow && Boolean(blueprint) && parent.x === 0 && parent.y === 0 && Math.abs(parent.width - pageWidth) < 1;
  const shift = pageParent && blueprint ? extraShiftExpr(blueprint, box.y, pageWidth, band, hints) : null;
  const useCqw = Boolean(pageParent && shift != null);
  const grow = useCqw && blueprint ? extraGrowExpr(blueprint, box, pageWidth, band, hints) : null;
  const transform = box.rotation ? `transform:rotate(${box.rotation}deg)` : "";
  const font =
    layer.kind === "text"
      ? `font-size:calc(${layer.fontSize?.[band] ?? 16} * 100cqw / ${Math.max(1, parent.width)})`
      : "";
  const rules = [
    "display:block",
    inRow ? "left:auto;top:auto" : useCqw ? `left:${cqwLen(box.x, pageWidth)}` : `left:${pct(local.x, parent.width)}`,
    inRow
      ? ""
      : useCqw
        ? `top:calc(${shift} + ${cqwLen(box.y, pageWidth)})`
        : `top:${pct(local.y, parent.height)}`,
    useCqw ? `width:${cqwLen(box.width, pageWidth)}` : `width:${pct(local.width, parent.width)}`,
    inRow
      ? `height:auto;aspect-ratio:${Math.max(1, box.width)} / ${Math.max(1, box.height)}`
      : useCqw
        ? grow
          ? `height:calc(${cqwLen(box.height, pageWidth)} + ${grow})`
          : `height:${cqwLen(box.height, pageWidth)}`
        : `height:${pct(local.height, parent.height)}`,
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
    layer.objectFit ? `object-fit:${layer.objectFit}` : "",
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

function serializeTreeHtml(
  nodes: PublishTreeNode[],
  layers: Map<string, CompiledLayer>,
  indent: string,
  inRow = false,
): string {
  return nodes
    .map((node) => {
      if (node.kind === "row") {
        const role = node.role === "full" ? " s-row-full" : " s-row-rest";
        const inner = serializeTreeHtml(node.children, layers, `${indent}  `, true);
        return `${indent}<div class="s-row s-row-${cssSafeId(node.id)}${role}">\n${inner}\n${indent}</div>`;
      }
      if (node.kind === "group") {
        const full = node.widthMode === "full" ? " s-full" : "";
        const hasFlow = node.children.some((c) => c.kind === "row" || (c.kind === "group" && c.widthMode === "full"));
        const flowHost = hasFlow ? " s-has-flow" : "";
        const flowItem = inRow ? " s-flow-item" : "";
        const inner = serializeTreeHtml(node.children, layers, `${indent}  `, false);
        return `${indent}<div class="s-group s-group-${cssSafeId(node.id)}${full}${flowHost}${flowItem}" data-group="${escapeHtml(node.id)}">\n${inner}\n${indent}</div>`;
      }
      const layer = layers.get(node.id);
      if (!layer) return "";
      return `${indent}${serializeLayerHtml(layer, inRow)}`;
    })
    .filter(Boolean)
    .join("\n");
}

function serializeLayerHtml(layer: CompiledLayer, inRow = false): string {
  const flowItem = inRow ? " s-flow-item" : "";
  const cls = `s-el s-el-${layer.cssId}${layer.kind === "text" ? " s-text" : ""}${layer.kind === "image" ? " s-image" : ""}${layer.buttonLabel ? " s-btn" : ""}${flowItem}`;
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
}

function buildHtml(args: {
  title: string;
  fontHref: string | null;
  forest: PublishForest;
  layers: Map<string, CompiledLayer>;
  blueprint: SiteBlueprintV1;
}): string {
  const body = serializeTreeHtml(args.forest.children, args.layers, "    ");
  const pageClass = args.forest.usesFlow ? "s-page s-flow" : "s-page";
  const htmlClass = [
    scrollFlowUsesKind(args.blueprint, "smooth") ? "s-scroll-smooth" : "",
    scrollFlowUsesKind(args.blueprint, "snap") ? "s-scroll-snap" : "",
    blueprintHasViewportSection(args.blueprint) ? "s-has-vh-secs" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const anchors = listDocumentSections(args.blueprint)
    .map((section) => {
      const snap = destinationScrollKind(args.blueprint, section.id) === "snap" ? " s-snap" : "";
      return `    <div class="s-sec-anchor s-sec-anchor-${cssSafeId(section.id)}${snap}" id="s-sec-${cssSafeId(section.id)}" data-section="${escapeHtml(section.id)}"></div>`;
    })
    .join("\n");
  const fontLink = args.fontHref
    ? `  <link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n  <link rel="stylesheet" href="${escapeHtml(args.fontHref)}">\n`
    : "";

  return `<!DOCTYPE html>
<html lang="es"${htmlClass ? ` class="${htmlClass}"` : ""}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(args.title)}</title>
${fontLink}  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main class="${pageClass}">
${anchors ? `${anchors}\n` : ""}${body}
  </main>
  <script src="script.js"></script>
</body>
</html>
`;
}
