/**
 * Compila snapshot + blueprint a HTML/CSS/JS de esa web.
 * No importa runtime ni estilos de Foldder.
 */
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import { collectDesignerPageFontFamilies } from "@/app/spaces/designer/designer-page-text-frame-sync";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import { getPageDimensions } from "@/app/spaces/indesign/page-formats";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { isLayerExplicitBackgroundSurface } from "./site-creator-background-assignment";
import {
  resolveDesignerPageBackground,
  resolvePageBackgroundCss,
} from "./site-creator-page-background";
import { resolveSiteCreatorResponsiveDisplay } from "./site-creator-responsive";
import { resolveMonitorMaxWidth } from "./site-creator-monitor-max-width";
import {
  encodeMultiCardInstanceId,
  moldLayerIdFromDisplay,
  parseMultiCardInstanceId,
} from "./site-creator-multicard-ids";
import {
  buildMultiCardPublishPlan,
  compilePublishedMultiCardScript,
  type MultiCardPublishPlan,
} from "./site-creator-multicard-publish";
import { MULTICARD_SCROLL_DURATION_MS, MULTICARD_SCROLL_EASE_CSS } from "./site-creator-multicard-layout";
import type { Dataset } from "../dataset/dataset-types";
import { mergedOverridesForCard } from "./site-creator-multicard-dataset";
import {
  isSiteButtonNode,
  isSiteMultiCardNode,
  type SiteBlueprintSectionNode,
  type SiteBlueprintV1,
  type SiteSectionScrollBand,
} from "./site-creator-types";
import {
  destinationScrollKind,
  lastDocumentSection,
  listDocumentSections,
  listSectionScrollHops,
  scrollFlowUsesKind,
} from "./site-creator-section-scroll";
import { compilePublishedScrollScript } from "./site-creator-section-scroll-runtime";
import { resolveMediaTune } from "./site-creator-responsive-tunes";
import {
  sectionCustomHeightForBand,
  sectionHeightModeForBand,
  type SectionHeightBand,
} from "./site-creator-section-height";
import {
  boxFromObject,
  buildPublishForest,
  collectObjectMap,
  toLocalBox,
  walkPublishTree,
  worldBoxForBand,
  type PublishBand as TreeBand,
  type PublishBox,
  type PublishForest,
  type PublishTreeNode,
} from "./site-creator-publish-tree";
import { collectSemanticCoverageLayerIds } from "./site-blueprint-ownership";
import { containerIsFullWidthForBand } from "./site-creator-group-width-layout";
import { ellipseClipPathCss, publishedPathGeom } from "./site-creator-publish-path";
import {
  googleFontsHrefFromFamilies,
  publishedBlendMode,
  publishedGlowFilter,
  publishedRichTextHtml,
  publishedShapeSvg,
  publishedTextFillInline,
} from "./site-creator-publish-paint";
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

function publishedDesktopScrollBand(blueprint: SiteBlueprintV1): SiteSectionScrollBand {
  return blueprint.scrollFlow?.byBand?.monitor ? "monitor" : "wide";
}

function publishedDesktopHeightBand(blueprint: SiteBlueprintV1): SectionHeightBand {
  return listDocumentSections(blueprint).some(
    (section) => sectionHeightModeForBand(blueprint, section, "monitor") !== "content",
  )
    ? "monitor"
    : "wide";
}

function heightLookupBand(blueprint: SiteBlueprintV1, cssBand: SectionHeightBand): SectionHeightBand {
  return cssBand === "wide" ? publishedDesktopHeightBand(blueprint) : cssBand;
}

function scrollLookupBand(
  blueprint: SiteBlueprintV1,
  cssBand: SiteSectionScrollBand,
): SiteSectionScrollBand {
  return cssBand === "wide" ? publishedDesktopScrollBand(blueprint) : cssBand;
}

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
  corners?: { tl: number; tr: number; br: number; bl: number } | "ellipse";
  objectFit?: string;
  imageFrame?: boolean;
  imageFrameCrop?: Partial<
    Record<BandName, { focal: { x: number; y: number }; zoom: number }>
  >;
  pathD?: string;
  pathViewBox?: { x: number; y: number; width: number; height: number };
  paintHtml?: string;
  mixBlendMode?: string;
  flipX?: boolean;
  flipY?: boolean;
  skewX?: number;
  skewY?: number;
  scaleX?: number;
  scaleY?: number;
  glowFilter?: string;
  fillInline?: string;
  textUnderline?: boolean;
  textStrikethrough?: boolean;
  fontVariantCaps?: string;
  paragraphIndent?: number;
  fontKerning?: string;
  fontFeatureSettings?: string;
  clips: Record<BandName, { x: number; y: number; width: number; height: number } | null>;
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

export function collectPublishImageRefs(
  page: DesignerPageState,
  blueprint?: SiteBlueprintV1,
  dataset?: Dataset | null,
): PublishImageRef[] {
  const refs: PublishImageRef[] = [];
  const seen = new Set<string>();
  const visit = (objects: FreehandObject[] | undefined) => {
    for (const obj of objects ?? []) {
      const ref = imageRefFromObject(obj);
      if (ref && !seen.has(ref.layerId)) {
        seen.add(ref.layerId);
        refs.push(ref);
      }
      if (obj.type === "groupContainer") {
        visit((obj as { children?: FreehandObject[] }).children);
      } else if (obj.type === "booleanGroup") {
        const cached = (obj as { cachedResult?: string }).cachedResult?.trim();
        if (!cached) visit((obj as { children?: FreehandObject[] }).children);
      } else if (obj.type === "clippingContainer") {
        const clip = obj as { mask?: FreehandObject; content?: FreehandObject[] };
        if (clip.mask) visit([clip.mask]);
        visit(clip.content);
      }
    }
  };
  visit(page.objects);
  if (blueprint) {
    for (const extra of collectMultiCardOverrideImageRefs(blueprint, dataset)) {
      if (seen.has(extra.layerId)) continue;
      seen.add(extra.layerId);
      refs.push(extra);
    }
  }
  return refs;
}

function publishFieldsFromMediaRef(media: { src?: string; s3Key?: string } | undefined): {
  s3Key?: string;
  src?: string;
} | null {
  if (!media) return null;
  const s3Key = pickS3Key(media.s3Key);
  const src = usableSrc(media.src);
  if (!s3Key && !src) return null;
  return { s3Key, src };
}

function collectMultiCardOverrideImageRefs(
  blueprint: SiteBlueprintV1,
  dataset?: Dataset | null,
): PublishImageRef[] {
  const refs: PublishImageRef[] = [];
  for (const node of Object.values(blueprint.nodes)) {
    if (!isSiteMultiCardNode(node)) continue;
    node.cards.forEach((card, cardIndex) => {
      const overrides = mergedOverridesForCard({ dataset, node, card, cardIndex });
      for (const [moldLayerId, slot] of Object.entries(overrides)) {
        const fields = publishFieldsFromMediaRef(slot.mediaRef);
        if (!fields) continue;
        refs.push({
          layerId: encodeMultiCardInstanceId({
            nodeId: node.id,
            cardId: card.id,
            moldLayerId,
          }),
          ...fields,
        });
      }
    });
  }
  return refs;
}

/** Card 1 override lives on the instance id so clones falling back to the mold keep the original asset. */
function card1OverrideHrefKeys(
  blueprint: SiteBlueprintV1,
  dataset?: Dataset | null,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of Object.values(blueprint.nodes)) {
    if (!isSiteMultiCardNode(node)) continue;
    const card1 = node.cards[0];
    if (!card1) continue;
    const overrides = mergedOverridesForCard({ dataset, node, card: card1, cardIndex: 0 });
    for (const [moldLayerId, slot] of Object.entries(overrides)) {
      if (!publishFieldsFromMediaRef(slot.mediaRef)) continue;
      map.set(
        moldLayerId,
        encodeMultiCardInstanceId({
          nodeId: node.id,
          cardId: card1.id,
          moldLayerId,
        }),
      );
    }
  }
  return map;
}

function resolvePublishedImageHref(
  layerId: string,
  hrefMap: Record<string, string>,
  card1OverrideKeys: Map<string, string>,
): string | undefined {
  const parsed = parseMultiCardInstanceId(layerId);
  if (parsed) {
    return hrefMap[layerId] ?? hrefMap[parsed.moldLayerId];
  }
  const card1Key = card1OverrideKeys.get(layerId);
  if (card1Key && hrefMap[card1Key]) return hrefMap[card1Key];
  return hrefMap[layerId];
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
  if (obj.type === "booleanGroup") {
    const cached = usableSrc((obj as { cachedResult?: string }).cachedResult);
    if (!cached) return null;
    return { layerId: obj.id, src: cached };
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

function cssStop(color: string, opacity?: number): string {
  if (opacity == null || opacity >= 0.999) return color;
  const hex = color.trim().match(/^#([0-9a-f]{6})$/i);
  if (!hex) return color;
  const n = parseInt(hex[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, opacity))})`;
}

function cssPaint(fill: unknown, asText: boolean): string | null {
  if (fill == null) return null;
  if (typeof fill === "string") {
    if (!fill || fill === "none" || fill === "transparent") return null;
    return fill;
  }
  if (typeof fill !== "object") return null;
  const rec = fill as {
    type?: string;
    color?: string;
    stops?: Array<{ color?: string; opacity?: number; position?: number }>;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    cx?: number;
    cy?: number;
    r?: number;
  };
  if (rec.type === "solid") {
    if (!rec.color || rec.color === "none" || rec.color === "transparent") return null;
    return rec.color;
  }
  if (asText) return rec.stops?.[0]?.color ?? null;
  const stopList = (rec.stops ?? [])
    .map((stop) => {
      const color = cssStop(stop.color || "#000", stop.opacity);
      const pos = Number.isFinite(stop.position) ? ` ${stop.position}%` : "";
      return `${color}${pos}`;
    })
    .join(", ");
  if (rec.type === "gradient-linear" && rec.stops?.length) {
    const x1 = rec.x1 ?? 0;
    const y1 = rec.y1 ?? 0.5;
    const x2 = rec.x2 ?? 1;
    const y2 = rec.y2 ?? 0.5;
    const angle = Math.round((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI);
    return `linear-gradient(${angle}deg, ${stopList})`;
  }
  if (rec.type === "gradient-radial" && rec.stops?.length) {
    const cx = Math.round((rec.cx ?? 0.5) * 1000) / 10;
    const cy = Math.round((rec.cy ?? 0.5) * 1000) / 10;
    return `radial-gradient(circle at ${cx}% ${cy}%, ${stopList})`;
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

function blueprintHasExpandedSection(
  blueprint: SiteBlueprintV1,
  band?: SectionHeightBand,
): boolean {
  const bands: SectionHeightBand[] = band ? [band] : ["wide", "monitor", "tablet", "mobile"];
  return bands.some((currentBand) =>
    listDocumentSections(blueprint).some(
      (section) => sectionHeightModeForBand(blueprint, section, currentBand) !== "content",
    ),
  );
}

/** Cabecera fija: solo la primera sección con `pinToTop`. */
function resolvePinnedTopSection(blueprint: SiteBlueprintV1): SiteBlueprintSectionNode | null {
  const first = listDocumentSections(blueprint)[0] ?? null;
  return first?.pinToTop ? first : null;
}

function publishTreeTouchesPinned(node: PublishTreeNode, pinnedLayerIds: Set<string>): boolean {
  if (node.kind === "row") {
    return node.children.some((child) => publishTreeTouchesPinned(child, pinnedLayerIds));
  }
  if (pinnedLayerIds.has(node.id)) return true;
  if (node.kind === "group") {
    return node.children.some((child) => publishTreeTouchesPinned(child, pinnedLayerIds));
  }
  return false;
}

function partitionPinnedPublishRoots(
  roots: PublishTreeNode[],
  pinnedLayerIds: Set<string>,
): { pinned: PublishTreeNode[]; rest: PublishTreeNode[] } {
  const pinned: PublishTreeNode[] = [];
  const rest: PublishTreeNode[] = [];
  for (const node of roots) {
    if (publishTreeTouchesPinned(node, pinnedLayerIds)) pinned.push(node);
    else rest.push(node);
  }
  return { pinned, rest };
}

function sectionExtraExpr(
  blueprint: SiteBlueprintV1,
  section: SiteBlueprintSectionNode,
  layout: { designed: number },
  pageWidth: number,
  lookupBand: SectionHeightBand,
  cssBand: SectionHeightBand,
): string | null {
  const mode = sectionHeightModeForBand(blueprint, section, lookupBand);
  if (mode === "viewport") {
    // Desktop CSS matches the Studio artboard. 100dvh is tablet/mobile only.
    if (cssBand === "wide") return null;
    return `max(0px,100dvh - 100cqw * ${layout.designed} / ${Math.max(1, pageWidth)})`;
  }
  if (mode === "custom") {
    const custom = sectionCustomHeightForBand(blueprint, section, lookupBand);
    const extra = custom == null ? 0 : Math.max(0, custom - layout.designed);
    if (extra > 0.5) return `calc(100cqw * ${extra} / ${Math.max(1, pageWidth)})`;
  }
  return null;
}

function extraShiftExpr(
  blueprint: SiteBlueprintV1,
  box: { y: number; height: number; width: number },
  pageWidth: number,
  band: SectionHeightBand = "wide",
  hints?: SectionLayoutHint[] | null,
  centerWithinSection = true,
): string | null {
  const lookup = heightLookupBand(blueprint, band);
  if (!blueprintHasExpandedSection(blueprint, lookup)) return null;
  const parts: string[] = [];
  for (const section of listDocumentSections(blueprint)) {
    const layout = sectionLayoutHint(section, hints);
    const extra = sectionExtraExpr(blueprint, section, layout, pageWidth, lookup, band);
    if (!extra) continue;
    if (box.y + 0.5 >= layout.bottom) {
      parts.push(extra);
      continue;
    }
    const fillsSectionBottom =
      box.y < layout.bottom &&
      box.y + box.height >= layout.bottom - 4 &&
      box.width >= pageWidth * 0.8;
    const midpoint = box.y + box.height / 2;
    const belongsToSection = midpoint >= layout.top && midpoint < layout.bottom;
    if (centerWithinSection && belongsToSection && !fillsSectionBottom) {
      parts.push(`(${extra}) / 2`);
    }
  }
  return parts.length > 0 ? parts.join(" + ") : null;
}

function extraGrowExpr(
  blueprint: SiteBlueprintV1,
  box: { y: number; height: number; width: number },
  pageWidth: number,
  band: SectionHeightBand = "wide",
  hints?: SectionLayoutHint[] | null,
): string | null {
  const lookup = heightLookupBand(blueprint, band);
  if (!blueprintHasExpandedSection(blueprint, lookup)) return null;
  for (const section of listDocumentSections(blueprint)) {
    const layout = sectionLayoutHint(section, hints);
    const extra = sectionExtraExpr(blueprint, section, layout, pageWidth, lookup, band);
    if (!extra) continue;
    const touchesBottom = box.y < layout.bottom && box.y + box.height >= layout.bottom - 4;
    if (touchesBottom && box.width >= pageWidth * 0.8) {
      return extra;
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
  const lookup = heightLookupBand(blueprint, band);
  const pageHeight = Math.max(1, layout.height);
  const pageWidth = Math.max(1, layout.width);
  const extraParts: string[] = [];
  for (const section of sections) {
    const viewport =
      band !== "wide" && sectionHeightModeForBand(blueprint, section, lookup) === "viewport";
    const geom = sectionLayoutHint(section, hints);
    const extra = sectionExtraExpr(blueprint, section, geom, pageWidth, lookup, band);
    const shift = extraShiftExpr(
      blueprint,
      { y: geom.top, height: 0, width: 0 },
      pageWidth,
      band,
      hints,
      false,
    );
    const top =
      shift != null ? `calc(${shift} + ${cqwLen(geom.top, pageWidth)})` : pct(geom.top, pageHeight);
    const heightRule = viewport
      ? ";height:100dvh;max-height:100dvh"
      : band === "wide"
        ? ""
        : ";height:0;min-height:0";
    lines.push(`.s-sec-anchor-${cssSafeId(section.id)}{top:${top}${heightRule}}`);
    if (extra) extraParts.push(extra);
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
}

function cqwLen(px: number, pageWidth: number): string {
  return `calc(100cqw * ${px} / ${Math.max(1, pageWidth)})`;
}

function googleFontsHref(families: string[]): string | null {
  return googleFontsHrefFromFamilies(families, GENERIC_FONTS);
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

function compiledTransform(layer: CompiledLayer, rotation: number): string {
  const parts: string[] = [];
  if (rotation) parts.push(`rotate(${rotation}deg)`);
  if (layer.skewX) parts.push(`skewX(${layer.skewX}deg)`);
  if (layer.skewY) parts.push(`skewY(${layer.skewY}deg)`);
  const sx = layer.flipX ? -1 : layer.scaleX && layer.scaleX !== 1 ? layer.scaleX : 1;
  const sy = layer.flipY ? -1 : layer.scaleY && layer.scaleY !== 1 ? layer.scaleY : 1;
  if (sx !== 1 || sy !== 1) parts.push(`scale(${sx}, ${sy})`);
  return parts.join(" ");
}

function applyStroke(layer: CompiledLayer, obj: FreehandObject): void {
  const stroke = typeof obj.stroke === "string" ? obj.stroke.trim() : "";
  const width = typeof obj.strokeWidth === "number" ? obj.strokeWidth : 0;
  if (!stroke || stroke === "none" || stroke === "transparent" || width <= 0) return;
  layer.stroke = stroke;
  layer.strokeWidth = width;
}

function objectCorners(obj: FreehandObject): CompiledLayer["corners"] {
  if (obj.type === "ellipse") return "ellipse";
  if (obj.type !== "rect") return undefined;
  const rect = obj as {
    rx?: number;
    cornerRadius?: number | { topLeft?: number; topRight?: number; bottomRight?: number; bottomLeft?: number };
  };
  if (rect.cornerRadius && typeof rect.cornerRadius === "object") {
    const tl = Math.max(0, rect.cornerRadius.topLeft ?? 0);
    const tr = Math.max(0, rect.cornerRadius.topRight ?? 0);
    const br = Math.max(0, rect.cornerRadius.bottomRight ?? 0);
    const bl = Math.max(0, rect.cornerRadius.bottomLeft ?? 0);
    if (tl + tr + br + bl <= 0) return undefined;
    return { tl, tr, br, bl };
  }
  const r =
    typeof rect.cornerRadius === "number"
      ? rect.cornerRadius
      : typeof rect.rx === "number"
        ? rect.rx
        : 0;
  if (r <= 0) return undefined;
  return { tl: r, tr: r, br: r, bl: r };
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
  dataset?: Dataset | null;
}): CompiledPublishedSite {
  const referenceIndex = buildSiteSelectionIndex(args.page);
  const reference = getPageDimensions(args.page);
  const desktopWidth = resolveMonitorMaxWidth(
    args.blueprint,
    reference.width,
    reference.width,
  );
  const wide = resolveSiteCreatorResponsiveDisplay({
    page: args.page,
    blueprint: args.blueprint,
    referenceIndex,
    viewportWidth: desktopWidth,
    expandViewportSections: false,
    preserveExplicitBackgroundSurfaces: true,
    band: "monitor",
    dataset: args.dataset,
  });
  const tablet = resolveSiteCreatorResponsiveDisplay({
    page: args.page,
    blueprint: args.blueprint,
    referenceIndex,
    viewportWidth: SITE_CREATOR_TABLET_WIDTH,
    expandViewportSections: false,
    preserveExplicitBackgroundSurfaces: true,
    dataset: args.dataset,
  });
  const mobile = resolveSiteCreatorResponsiveDisplay({
    page: args.page,
    blueprint: args.blueprint,
    referenceIndex,
    viewportWidth: SITE_CREATOR_MOBILE_WIDTH,
    expandViewportSections: false,
    preserveExplicitBackgroundSurfaces: true,
    dataset: args.dataset,
  });

  const layouts: Record<BandName, { width: number; height: number; objects: FreehandObject[] }> = {
    wide: { width: wide.layout.layoutWidth, height: wide.layout.layoutHeight, objects: wide.displayPage.objects ?? [] },
    tablet: { width: tablet.layout.layoutWidth, height: tablet.layout.layoutHeight, objects: tablet.displayPage.objects ?? [] },
    mobile: { width: mobile.layout.layoutWidth, height: mobile.layout.layoutHeight, objects: mobile.displayPage.objects ?? [] },
  };
  const clipsByBand: Record<BandName, Record<string, { x: number; y: number; width: number; height: number }>> = {
    wide: wide.resolvedLayout?.objectClipById ?? {},
    tablet: tablet.resolvedLayout?.objectClipById ?? {},
    mobile: mobile.resolvedLayout?.objectClipById ?? {},
  };

  const forest = buildPublishForest({
    objectsByBand: {
      wide: layouts.wide.objects,
      tablet: layouts.tablet.objects,
      mobile: layouts.mobile.objects,
    },
    blueprint: args.blueprint,
    index: referenceIndex,
    pageRect: { x: 0, y: 0, width: layouts.wide.width, height: layouts.wide.height },
  });
  const multiCardPlan = buildMultiCardPublishPlan({
    blueprint: args.blueprint,
    wide,
    tablet,
    mobile,
  });

  const buttonLabels = buttonLabelByLayerId(args.blueprint);
  const card1OverrideKeys = card1OverrideHrefKeys(args.blueprint, args.dataset);
  const layers = new Map<string, CompiledLayer>();
  const imageHrefByLayerId = { ...args.imageHrefByLayerId };
  for (const rule of args.blueprint.responsive?.backgrounds ?? []) {
    const source = referenceIndex.byId[rule.sourceLayerId];
    if (
      source?.type !== "image" &&
      !source?.object.imageFrameContent?.src
    ) {
      continue;
    }
    const href = args.imageHrefByLayerId[rule.sourceLayerId];
    if (href) imageHrefByLayerId[`${rule.sourceLayerId}__background_image`] = href;
  }
  const wideMap = collectObjectMap(layouts.wide.objects);
  for (const obj of wideMap.values()) {
    const layer = compilePaintLayer(obj, imageHrefByLayerId, buttonLabels, card1OverrideKeys);
    if (!layer) continue;
    layers.set(obj.id, layer);
  }
  (["wide", "tablet", "mobile"] as BandName[]).forEach((band) => {
    const map = collectObjectMap(layouts[band].objects);
    const mediaBand = band === "wide" ? "monitor" : band;
    for (const [id, layer] of layers) {
      const obj = map.get(id);
      if (
        !obj ||
        isLayerExplicitBackgroundSurface(
          args.blueprint,
          id,
          mediaBand,
        )
      ) {
        layer.boxes[band] = null;
        continue;
      }
      layer.boxes[band] = boxFromObject(obj);
      const clip = clipsByBand[band][id];
      layer.clips[band] = clip ?? null;
      if (layer.kind === "text") {
        const size = (obj as { fontSize?: number }).fontSize;
        if (typeof size === "number") layer.fontSize![band] = size;
      }
      if (layer.imageFrame) {
        const tune = resolveMediaTune(args.blueprint, moldLayerIdFromDisplay(id), mediaBand);
        if (tune?.focal || tune?.zoom) {
          layer.imageFrameCrop![band] = {
            focal: tune.focal ?? { x: 0.5, y: 0.5 },
            zoom: tune.zoom ?? 1,
          };
        }
      }
    }
  });

  walkPublishTree(forest.children, (node) => {
    if (node.kind !== "layer") return;
    const layer = layers.get(node.id);
    if (layer) layer.z = node.z;
  });

  const detectedPageBg = resolveDesignerPageBackground(args.page, args.blueprint);
  const designerPageBgCss =
    detectedPageBg?.kind === "image"
      ? resolvePageBackgroundCss(
          args.page,
          args.blueprint,
          args.imageHrefByLayerId[detectedPageBg.imageLayerId] ??
            args.imageHrefByLayerId[detectedPageBg.sourceLayerId],
        )
      : detectedPageBg?.kind === "color" || detectedPageBg?.kind === "gradient"
        ? detectedPageBg.css
        : null;
  const pageBg =
    designerPageBgCss ??
    (args.page.pageBackground === "black"
      ? "#000000"
      : args.page.pageBackground === "transparent"
        ? "transparent"
        : "#fafafa");

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
    multiCardPlan,
  });
  const html = buildHtml({
    title: args.title.trim() || "Sitio",
    fontHref: googleFontsHref(collectDesignerPageFontFamilies(args.page)),
    forest,
    layers,
    blueprint: args.blueprint,
    multiCardPlan,
  });
  const tabletMax = siteCreatorTabletMediaMaxWidth(reference.width);
  const scrollJs = compilePublishedScrollScript(listSectionScrollHops(args.blueprint, publishedDesktopScrollBand(args.blueprint)), {
    wide: listSectionScrollHops(args.blueprint, publishedDesktopScrollBand(args.blueprint)),
    tablet: listSectionScrollHops(args.blueprint, "tablet"),
    mobile: listSectionScrollHops(args.blueprint, "mobile"),
    tabletMax,
    mobileMax: SITE_CREATOR_TABLET_WIDTH - 1,
  });
  const multiCardJs = compilePublishedMultiCardScript(multiCardPlan, {
    tabletMax,
    mobileMax: SITE_CREATOR_TABLET_WIDTH - 1,
  });
  const js = joinPublishedScripts(scrollJs, multiCardJs);
  return {
    html,
    css,
    js,
  };
}

function joinPublishedScripts(...parts: string[]): string {
  const bodies = parts
    .map((part) => part.replace(/^"use strict";\s*/m, "").trim())
    .filter(Boolean);
  if (bodies.length === 0) return `"use strict";\n`;
  return `"use strict";\n${bodies.join("\n")}\n`;
}

function compilePaintLayer(
  obj: FreehandObject,
  imageHrefByLayerId: Record<string, string>,
  buttonLabels: Map<string, string>,
  card1OverrideKeys: Map<string, string>,
): CompiledLayer | null {
  if (obj.visible === false) return null;
  if (
    obj.type === "groupContainer" ||
    obj.type === "clippingContainer" ||
    obj.type === "adjustmentLayer" ||
    (obj.type === "booleanGroup" && !(obj as { cachedResult?: string }).cachedResult)
  ) {
    return null;
  }
  const booleanSrc = obj.type === "booleanGroup" ? usableSrc((obj as { cachedResult?: string }).cachedResult) : undefined;
  const kind: CompiledLayer["kind"] =
    obj.type === "text" || obj.type === "textOnPath"
      ? "text"
      : obj.type === "image" || obj.imageFrameContent || booleanSrc
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
    clips: { wide: null, tablet: null, mobile: null },
    imageHref:
      resolvePublishedImageHref(obj.id, imageHrefByLayerId, card1OverrideKeys) ?? booleanSrc,
    alt: buttonLabels.get(obj.id) || buttonLabels.get(moldLayerIdFromDisplay(obj.id)) || (obj.name && obj.name !== obj.id ? obj.name : ""),
    fontSize: { wide: 16, tablet: 16, mobile: 16 },
    buttonLabel: buttonLabels.get(obj.id),
  };
  const blend = publishedBlendMode(obj);
  if (blend) layer.mixBlendMode = blend;
  const glow = publishedGlowFilter(obj);
  if (glow) layer.glowFilter = glow;
  if (obj.flipX) layer.flipX = true;
  if (obj.flipY) layer.flipY = true;
  if (obj.skewX) layer.skewX = obj.skewX;
  if (obj.skewY) layer.skewY = obj.skewY;
  const textScale = obj as { scaleX?: number; scaleY?: number };
  if (typeof textScale.scaleX === "number") layer.scaleX = textScale.scaleX;
  if (typeof textScale.scaleY === "number") layer.scaleY = textScale.scaleY;

  if (kind === "text") {
    const textObj = obj as FreehandObject & {
      fontFamily?: string;
      fontWeight?: string | number;
      fontStyle?: string;
      letterSpacing?: number;
      lineHeight?: number;
      textAlign?: string;
      textUnderline?: boolean;
      textStrikethrough?: boolean;
      fontVariantCaps?: string;
      paragraphIndent?: number;
      fontKerning?: string;
      fontFeatureSettings?: string;
    };
    layer.textHtml = publishedRichTextHtml(obj);
    layer.fontFamily = textObj.fontFamily;
    layer.fontWeight = textObj.fontWeight;
    layer.fontStyle = textObj.fontStyle;
    layer.letterSpacing = textObj.letterSpacing;
    layer.lineHeight = textObj.lineHeight;
    layer.textAlign = textObj.textAlign;
    layer.fillInline = publishedTextFillInline(obj);
    layer.textUnderline = textObj.textUnderline;
    layer.textStrikethrough = textObj.textStrikethrough;
    layer.fontVariantCaps = textObj.fontVariantCaps;
    layer.paragraphIndent = textObj.paragraphIndent;
    layer.fontKerning = textObj.fontKerning;
    layer.fontFeatureSettings = textObj.fontFeatureSettings;
    applyStroke(layer, obj);
  } else if (kind === "shape" || kind === "path") {
    applyStroke(layer, obj);
    layer.corners = objectCorners(obj);
    const svg = publishedShapeSvg(obj);
    if (svg) {
      layer.paintHtml = svg;
      if (kind === "path") {
        const geom = publishedPathGeom(obj);
        if (geom) {
          layer.pathD = geom.d;
          layer.pathViewBox = geom.viewBox;
        }
      }
    } else {
      layer.background = cssPaint(obj.fill, false) ?? undefined;
    }
  } else if (kind === "image") {
    layer.objectFit = objectFitForFrame(obj) ?? (booleanSrc ? "cover" : undefined);
    if (obj.imageFrameContent) {
      layer.imageFrame = true;
      layer.imageFrameCrop = {};
    }
    layer.corners = objectCorners(obj);
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
  multiCardPlan: MultiCardPublishPlan;
}): string {
  const tabletMax = siteCreatorTabletMediaMaxWidth(args.referenceWidth);
  const flow = args.forest.usesFlow;
  const lines: string[] = [
    "*,*::before,*::after{box-sizing:border-box}",
    "html,body{margin:0;padding:0;width:100%;min-height:100%}",
    `body{background:${args.pageBg};-webkit-font-smoothing:antialiased}`,
    `.s-page{position:relative;width:100%;max-width:${Math.max(1, args.layouts.wide.width)}px;margin-inline:auto;overflow:${flow ? "visible" : "hidden"};container-type:inline-size}`,
    ".s-el,.s-group{position:absolute;display:block;margin:0;border:0;padding:0;max-width:none}",
    ".s-group{container-type:inline-size;overflow:visible}",
    ".s-group.s-clip{overflow:hidden}",
    ".s-clip-svg{position:absolute;width:0;height:0;overflow:hidden}",
    ".s-row{position:relative;display:flex;flex-wrap:wrap;align-items:flex-start;width:100%;left:auto;top:auto;box-sizing:border-box}",
    ".s-row>.s-flow-item{position:relative;flex:0 0 auto;top:auto;left:auto}",
    ".s-row-full>.s-flow-item{flex:0 0 100%;width:100%}",
    ".s-row-rest>.s-group.s-flow-item{flex:1 1 0;min-width:0;width:auto}",
    ".s-group.s-has-flow{height:auto}",
    ".s-page.s-flow{height:auto;overflow:visible}",
    ".s-page.s-flow>.s-row{position:relative;left:auto;top:auto;width:100%}",
    ".s-btn{background:transparent;cursor:pointer;appearance:none}",
    ".s-el img,.s-image{width:100%;height:100%;object-fit:cover;display:block}",
    ".s-text{white-space:pre-wrap;overflow:visible}",
    ".s-path,.s-paint{width:100%;height:100%;display:block;overflow:visible}",
    ".s-mc{position:absolute;pointer-events:none}",
    `.s-mc>.s-mc-track{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:auto;will-change:transform;transition:transform ${MULTICARD_SCROLL_DURATION_MS}ms ${MULTICARD_SCROLL_EASE_CSS}}`,
    ".s-mc-nav{position:absolute;inset:0;pointer-events:none;z-index:20}",
    ".s-mc[data-nav=\"0\"] .s-mc-nav{display:none}",
    ".s-mc[data-nav-style=\"dots\"] .s-mc-btn{display:none}",
    ".s-mc[data-nav-style=\"arrows\"] .s-mc-dots{display:none}",
    ".s-mc-btn{position:absolute;pointer-events:auto;width:calc(100cqw * 28 / var(--s-mc-page,1920));height:calc(100cqw * 28 / var(--s-mc-page,1920));border:0;border-radius:999px;background:rgba(16,24,32,.72);color:#fff;cursor:pointer}",
    ".s-mc-prev{left:calc(100cqw * 8 / var(--s-mc-page,1920));top:50%;transform:translateY(-50%)}",
    ".s-mc-next{right:calc(100cqw * 8 / var(--s-mc-page,1920));top:50%;transform:translateY(-50%)}",
    ".s-mc[data-axis=\"v\"] .s-mc-prev{left:50%;top:calc(100cqw * 8 / var(--s-mc-page,1920));right:auto;transform:translateX(-50%)}",
    ".s-mc[data-axis=\"v\"] .s-mc-next{left:50%;bottom:calc(100cqw * 8 / var(--s-mc-page,1920));right:auto;top:auto;transform:translateX(-50%)}",
    ".s-mc-dots{position:absolute;left:50%;bottom:calc(100cqw * 10 / var(--s-mc-page,1920));display:flex;gap:calc(100cqw * 6 / var(--s-mc-page,1920));transform:translateX(-50%);pointer-events:auto}",
    ".s-mc-dot{width:calc(100cqw * 8 / var(--s-mc-page,1920));height:calc(100cqw * 8 / var(--s-mc-page,1920));border:0;border-radius:999px;background:rgba(255,255,255,.45);padding:0;cursor:pointer}",
    ".s-mc-dot[aria-current=\"true\"]{background:#a8ff32}",
    bandPageCss(args.layouts.wide, flow),
  ];

  emitBandScrollCss(lines, args.blueprint, "wide");
  const sections = listDocumentSections(args.blueprint);
  const pinned = resolvePinnedTopSection(args.blueprint);
  if (pinned) {
    const pinHint = sectionLayoutHint(pinned, args.hintsByBand.wide);
    const pinH = Math.max(1, pinHint.designed);
    const pinW = Math.max(1, args.layouts.wide.width);
    lines.push(
      `.s-pin{position:fixed;top:0;left:50%;translate:-50% 0;width:100%;max-width:${pinW}px;z-index:2147483646;isolation:isolate;pointer-events:none;background:transparent;height:auto;min-height:0}`,
    );
    lines.push(
      ".s-pin>.s-el,.s-pin>.s-group,.s-pin>.s-row{pointer-events:auto;z-index:2147483646}",
    );
    lines.push(".s-pin .s-el,.s-pin .s-group{z-index:2147483646}");
    lines.push(
      `html.s-has-pin{scroll-padding-top:calc(100cqw * ${pinH} / ${pinW})}`,
    );
  }
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
    args.multiCardPlan.layerToNode,
  );
  emitMultiCardCss(
    lines,
    args.multiCardPlan,
    "wide",
    args.layouts.wide,
    args.layers,
    args.blueprint,
    args.hintsByBand.wide,
  );

  lines.push(`@media (max-width:${tabletMax}px) and (min-width:${SITE_CREATOR_TABLET_WIDTH}px){`);
  lines.push(".s-page{max-width:none;margin-inline:0}");
  if (pinned) {
    lines.push(".s-pin{max-width:none;left:0;translate:none;width:100%}");
    const pinHint = sectionLayoutHint(pinned, args.hintsByBand.tablet);
    lines.push(
      `html.s-has-pin{scroll-padding-top:calc(100cqw * ${Math.max(1, pinHint.designed)} / ${Math.max(1, args.layouts.tablet.width)})}`,
    );
  }
  lines.push(bandPageCss(args.layouts.tablet, flow));
  emitBandScrollCss(lines, args.blueprint, "tablet");
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
    args.multiCardPlan.layerToNode,
  );
  emitMultiCardCss(
    lines,
    args.multiCardPlan,
    "tablet",
    args.layouts.tablet,
    args.layers,
    args.blueprint,
    args.hintsByBand.tablet,
  );
  lines.push("}");

  lines.push(`@media (max-width:${SITE_CREATOR_TABLET_WIDTH - 1}px){`);
  lines.push(".s-page{max-width:none;margin-inline:0}");
  if (pinned) {
    lines.push(".s-pin{max-width:none;left:0;translate:none;width:100%}");
    const pinHint = sectionLayoutHint(pinned, args.hintsByBand.mobile);
    lines.push(
      `html.s-has-pin{scroll-padding-top:calc(100cqw * ${Math.max(1, pinHint.designed)} / ${Math.max(1, args.layouts.mobile.width)})}`,
    );
  }
  lines.push(bandPageCss(args.layouts.mobile, flow));
  emitBandScrollCss(lines, args.blueprint, "mobile");
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
    args.multiCardPlan.layerToNode,
  );
  emitMultiCardCss(
    lines,
    args.multiCardPlan,
    "mobile",
    args.layouts.mobile,
    args.layers,
    args.blueprint,
    args.hintsByBand.mobile,
  );
  lines.push("}");

  if (pinned) {
    // Después de todo el CSS de capas: el pin debe ganar siempre el apilado.
    lines.push(
      ".s-pin{position:fixed!important;top:0!important;z-index:2147483646!important;isolation:isolate!important;pointer-events:none;background:transparent!important}",
    );
    lines.push(
      ".s-pin .s-el,.s-pin .s-group,.s-pin .s-row,.s-pin .s-mc{z-index:2147483646!important;pointer-events:auto}",
    );
  }

  return `${lines.filter(Boolean).join("\n")}\n`;
}

function emitBandScrollCss(
  lines: string[],
  blueprint: SiteBlueprintV1,
  band: SectionHeightBand,
): void {
  const lookup = scrollLookupBand(blueprint, band);
  const usesSmooth = scrollFlowUsesKind(blueprint, "smooth", lookup);
  const usesSnap = scrollFlowUsesKind(blueprint, "snap", lookup);
  lines.push(`html.s-scroll-smooth{scroll-behavior:${usesSmooth ? "smooth" : "auto"}}`);
  lines.push(`html.s-scroll-snap{scroll-snap-type:${usesSnap ? "y proximity" : "none"}}`);
  if (usesSnap) {
    lines.push(
      `.s-sec-anchor.s-snap-${band}{scroll-snap-align:start;scroll-snap-stop:always}`,
    );
    lines.push(".s-sec-last{scroll-snap-align:none;scroll-snap-stop:normal}");
  }
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
  skipLayers?: Map<string, string>,
): void {
  const percentParent: PublishBox =
    parent ?? { x: 0, y: 0, width: layout.width, height: layout.height, rotation: 0, opacity: 1, visible: true };
  for (const node of nodes) {
    if (node.kind === "row") {
      lines.push(rowBoxCss(node, band, percentParent));
      collectTreeCss(lines, node.children, band, layout, percentParent, layers, true, blueprint, hints, skipLayers);
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
        skipLayers,
      );
      continue;
    }
    if (skipLayers?.has(node.id)) continue;
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
  const shift = pageParent ? extraShiftExpr(blueprint, box, pageWidth, band, hints) : null;
  const unit = Math.max(1, parent.width);
  const grow = pageParent ? extraGrowExpr(blueprint, box, pageWidth, band, hints) : null;
  const rules = [
    inRow ? "left:auto;top:auto" : full ? "left:0" : `left:${cqwLen(local.x, unit)}`,
    inRow || full
      ? ""
      : shift != null
        ? `top:calc(${shift} + ${cqwLen(local.y, unit)})`
        : `top:${cqwLen(local.y, unit)}`,
    full ? "width:100%" : inRow ? "width:auto;flex:1 1 0;min-width:0" : `width:${cqwLen(local.width, unit)}`,
    inRow && full ? "flex:0 0 100%" : "",
    full || inRow
      ? `height:auto;aspect-ratio:${Math.max(1, box.width)} / ${Math.max(1, box.height)}`
      : grow
        ? `height:calc(${cqwLen(local.height, unit)} + ${grow})`
        : `height:${cqwLen(local.height, unit)}`,
    `z-index:${node.z}`,
    box.opacity < 1 ? `opacity:${box.opacity}` : "",
    box.rotation ? `transform:rotate(${box.rotation}deg)` : "",
    node.clipOverflow ? "overflow:hidden" : "",
    node.clipMaskKind === "ellipse" ? `clip-path:${ellipseClipPathCss()}` : "",
    node.clipMaskKind === "path" && node.clipPathD
      ? `clip-path:url(#s-mask-${cssSafeId(node.id)})`
      : "",
  ].filter(Boolean);
  const clipContent = node.clipOverflow
    ? `\n${sel}>.s-clip-content{position:absolute;left:50%;top:50%;height:max(100%,calc(100cqw * ${Math.max(1, box.height)} / ${Math.max(1, box.width)}));width:auto;aspect-ratio:${Math.max(1, box.width)} / ${Math.max(1, box.height)};transform:translate(-50%,-50%)}`
    : "";
  return `${sel}{${rules.join(";")}}${clipContent}`;
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
  opts?: { cqwUnit?: number; omitClip?: boolean },
): string {
  const sel = `.s-el-${layer.cssId}`;
  if (layer.boxes[band] === null) return `${sel}{display:none}`;
  const box = world ?? layer.boxes[band];
  const local = toLocalBox(box, parent);
  const pageParent =
    !inRow && Boolean(blueprint) && parent.x === 0 && parent.y === 0 && Math.abs(parent.width - pageWidth) < 1;
  const shift = pageParent && blueprint ? extraShiftExpr(blueprint, box, pageWidth, band, hints) : null;
  const unit = Math.max(1, opts?.cqwUnit ?? parent.width);
  const grow = pageParent && blueprint ? extraGrowExpr(blueprint, box, pageWidth, band, hints) : null;
  const transform = compiledTransform(layer, box.rotation);
  const font =
    layer.kind === "text"
      ? `font-size:calc(${layer.fontSize?.[band] ?? 16} * 100cqw / ${unit})`
      : "";
  const radius = layer.kind === "image" ? cornerRadiusCss(layer.corners, unit) : "";
  const clip = opts?.omitClip ? "" : layerClipCss(box, layer.clips[band], unit, grow);
  const deco = [
    layer.textUnderline ? "underline" : "",
    layer.textStrikethrough ? "line-through" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const rules = [
    "display:block",
    inRow ? "left:auto;top:auto" : `left:${cqwLen(local.x, unit)}`,
    inRow
      ? ""
      : shift != null
        ? `top:calc(${shift} + ${cqwLen(local.y, unit)})`
        : `top:${cqwLen(local.y, unit)}`,
    `width:${cqwLen(local.width, unit)}`,
    inRow
      ? `height:auto;aspect-ratio:${Math.max(1, box.width)} / ${Math.max(1, box.height)}`
      : grow
        ? `height:calc(${cqwLen(local.height, unit)} + ${grow})`
        : `height:${cqwLen(local.height, unit)}`,
    `z-index:${layer.z}`,
    box.opacity < 1 ? `opacity:${box.opacity}` : "",
    transform ? `transform:${transform}` : "",
    font,
    layer.kind === "text" && layer.fontFamily ? `font-family:${cssFontFamily(layer.fontFamily)}` : "",
    layer.kind === "text" && layer.fontWeight != null ? `font-weight:${layer.fontWeight}` : "",
    layer.kind === "text" && layer.fontStyle ? `font-style:${layer.fontStyle}` : "",
    layer.kind === "text" && layer.letterSpacing != null
      ? `letter-spacing:${cqwLen(layer.letterSpacing, unit)}`
      : "",
    layer.kind === "text" && layer.lineHeight != null ? `line-height:${layer.lineHeight}` : "",
    layer.kind === "text" && layer.textAlign ? `text-align:${layer.textAlign}` : "",
    layer.kind === "text" && layer.fillInline ? layer.fillInline : "",
    layer.kind === "text" && deco ? `text-decoration:${deco}` : "",
    layer.kind === "text" && layer.fontVariantCaps ? `font-variant-caps:${layer.fontVariantCaps}` : "",
    layer.kind === "text" && layer.fontKerning ? `font-kerning:${layer.fontKerning}` : "",
    layer.kind === "text" && layer.fontFeatureSettings
      ? `font-feature-settings:${layer.fontFeatureSettings}`
      : "",
    layer.kind === "text" && layer.paragraphIndent
      ? `text-indent:${cqwLen(layer.paragraphIndent, unit)}`
      : "",
    layer.kind === "text" && layer.stroke && layer.strokeWidth
      ? `-webkit-text-stroke:${cqwLen(layer.strokeWidth, unit)} ${layer.stroke}`
      : "",
    layer.kind === "shape" && !layer.paintHtml && layer.background ? `background:${layer.background}` : "",
    radius,
    layer.mixBlendMode ?? "",
    layer.glowFilter ?? "",
    clip,
    layer.imageFrame || radius ? "overflow:hidden" : "",
    !layer.imageFrame && layer.objectFit ? `object-fit:${layer.objectFit}` : "",
  ].filter(Boolean);
  const crop = layer.imageFrameCrop?.[band];
  const frameImage = layer.imageFrame
    ? `${sel}>img{width:100%;height:100%;display:block;object-fit:${crop ? "cover" : layer.objectFit ?? "cover"};${
        crop
          ? `object-position:${crop.focal.x * 100}% ${crop.focal.y * 100}%;transform:scale(${crop.zoom});transform-origin:${crop.focal.x * 100}% ${crop.focal.y * 100}%`
          : ""
      }}`
    : "";
  return `${sel}{${rules.join(";")}}${frameImage}`;
}

function cornerRadiusCss(
  corners: CompiledLayer["corners"],
  unit: number,
): string {
  if (corners === "ellipse") return "border-radius:50%";
  if (!corners) return "";
  const tl = cqwLen(corners.tl, unit);
  const tr = cqwLen(corners.tr, unit);
  const br = cqwLen(corners.br, unit);
  const bl = cqwLen(corners.bl, unit);
  if (tl === tr && tr === br && br === bl) return `border-radius:${tl}`;
  return `border-radius:${tl} ${tr} ${br} ${bl}`;
}

function layerClipCss(
  box: Box,
  clip: { x: number; y: number; width: number; height: number } | null | undefined,
  unit: number,
  grow: string | null,
): string {
  if (!clip) return "";
  const top = Math.max(0, clip.y - box.y);
  const left = Math.max(0, clip.x - box.x);
  const right = Math.max(0, box.x + box.width - (clip.x + clip.width));
  const bottom = grow ? 0 : Math.max(0, box.y + box.height - (clip.y + clip.height));
  if (top < 0.5 && left < 0.5 && right < 0.5 && bottom < 0.5) return "";
  return `clip-path:inset(${cqwLen(top, unit)} ${cqwLen(right, unit)} ${cqwLen(bottom, unit)} ${cqwLen(left, unit)})`;
}

function cssFontFamily(family: string): string {
  const trimmed = family.trim();
  if (!trimmed) return "sans-serif";
  if (GENERIC_FONTS.has(trimmed.toLowerCase())) return trimmed;
  if (trimmed.includes(",")) return trimmed;
  return `"${trimmed.replace(/"/g, "")}",sans-serif`;
}

function emitMultiCardCss(
  lines: string[],
  plan: MultiCardPublishPlan,
  band: BandName,
  layout: { width: number; height: number },
  layers: Map<string, CompiledLayer>,
  blueprint: SiteBlueprintV1,
  hints: SectionLayoutHint[] | null,
): void {
  const page: PublishBox = {
    x: 0,
    y: 0,
    width: layout.width,
    height: layout.height,
    rotation: 0,
    opacity: 1,
    visible: true,
  };
  const specs = plan.byBand[band];
  const layerIdsByNode = layerIdsGrouped(plan);
  for (const spec of specs) {
    const cssId = cssSafeId(spec.nodeId);
    const sel = `.s-mc-${cssId}`;
    const box = {
      x: spec.layoutRect.x,
      y: spec.layoutRect.y,
      width: spec.layoutRect.width,
      height: spec.layoutRect.height,
      rotation: 0,
      opacity: 1,
      visible: true,
    };
    const local = toLocalBox(box, page);
    const shift = extraShiftExpr(blueprint, box, layout.width, band, hints);
    const z = maxLayerZ(layers, layerIdsByNode.get(spec.nodeId) ?? []);
    const overflow = spec.overflow && spec.axis ? "hidden" : "visible";
    const rules = [
      `left:${cqwLen(local.x, layout.width)}`,
      shift != null
        ? `top:calc(${shift} + ${cqwLen(local.y, layout.width)})`
        : `top:${cqwLen(local.y, layout.width)}`,
      `width:${cqwLen(local.width, layout.width)}`,
      `height:${cqwLen(local.height, layout.width)}`,
      `overflow:${overflow}`,
      `z-index:${z}`,
      `--s-mc-page:${Math.max(1, spec.pageWidth)}`,
    ];
    lines.push(`${sel}{${rules.join(";")}}`);
    const parent: PublishBox = {
      x: spec.layoutRect.x,
      y: spec.layoutRect.y,
      width: spec.layoutRect.width,
      height: spec.layoutRect.height,
      rotation: 0,
      opacity: 1,
      visible: true,
    };
    for (const layerId of layerIdsByNode.get(spec.nodeId) ?? []) {
      const layer = layers.get(layerId);
      if (!layer) continue;
      const world = layer.boxes[band];
      lines.push(
        layerBoxCss(layer, band, parent, world, false, undefined, layout.width, null, {
          cqwUnit: layout.width,
          omitClip: true,
        }),
      );
    }
  }
}

function layerIdsGrouped(plan: MultiCardPublishPlan): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const [layerId, nodeId] of plan.layerToNode) {
    const list = grouped.get(nodeId) ?? [];
    list.push(layerId);
    grouped.set(nodeId, list);
  }
  return grouped;
}

function maxLayerZ(layers: Map<string, CompiledLayer>, layerIds: string[]): number {
  let z = 1;
  for (const id of layerIds) {
    const layer = layers.get(id);
    if (layer) z = Math.max(z, layer.z);
  }
  return z;
}

function serializeMultiCardHtml(
  plan: MultiCardPublishPlan,
  layers: Map<string, CompiledLayer>,
): string {
  if (plan.nodeIds.length === 0) return "";
  const layerIdsByNode = layerIdsGrouped(plan);
  const wideById = new Map(plan.byBand.wide.map((spec) => [spec.nodeId, spec]));
  return plan.nodeIds
    .map((nodeId) => {
      const spec = wideById.get(nodeId) ?? plan.byBand.tablet.find((item) => item.nodeId === nodeId) ?? plan.byBand.mobile.find((item) => item.nodeId === nodeId);
      if (!spec) return "";
      const cssId = cssSafeId(nodeId);
      const owned = (layerIdsByNode.get(nodeId) ?? [])
        .map((id) => layers.get(id))
        .filter((layer): layer is CompiledLayer => Boolean(layer))
        .sort((a, b) => a.z - b.z);
      if (owned.length === 0) return "";
      const inner = owned.map((layer) => `      ${serializeLayerHtml(layer)}`).join("\n");
      const dots = Array.from({ length: spec.count }, (_, i) => {
        const current = i === 0 ? ` aria-current="true"` : "";
        return `      <button type="button" class="s-mc-dot" data-i="${i}" aria-label="Card ${i + 1}"${current}></button>`;
      }).join("\n");
      return `    <div class="s-mc s-mc-${cssId}" data-mc="${escapeHtml(nodeId)}" data-nav="0" data-nav-style="${escapeHtml(spec.navStyle)}" data-axis="${spec.axis ?? "none"}">
      <div class="s-mc-track">
${inner}
      </div>
      <div class="s-mc-nav">
        <button type="button" class="s-mc-btn s-mc-prev" aria-label="Anterior">&#8249;</button>
        <button type="button" class="s-mc-btn s-mc-next" aria-label="Siguiente">&#8250;</button>
        <div class="s-mc-dots">
${dots}
        </div>
      </div>
    </div>`;
    })
    .filter(Boolean)
    .join("\n");
}

function serializeTreeHtml(
  nodes: PublishTreeNode[],
  layers: Map<string, CompiledLayer>,
  indent: string,
  inRow = false,
  skipLayers?: Map<string, string>,
): string {
  return nodes
    .map((node) => {
      if (node.kind === "row") {
        const role = node.role === "full" ? " s-row-full" : " s-row-rest";
        const inner = serializeTreeHtml(node.children, layers, `${indent}  `, true, skipLayers);
        return `${indent}<div class="s-row s-row-${cssSafeId(node.id)}${role}">\n${inner}\n${indent}</div>`;
      }
      if (node.kind === "group") {
        const full = node.widthMode === "full" ? " s-full" : "";
        const hasFlow = node.children.some((c) => c.kind === "row" || (c.kind === "group" && c.widthMode === "full"));
        const flowHost = hasFlow ? " s-has-flow" : "";
        const flowItem = inRow ? " s-flow-item" : "";
        const clip = node.kind === "group" && node.clipOverflow ? " s-clip" : "";
        const inner = serializeTreeHtml(node.children, layers, `${indent}  `, false, skipLayers);
        const maskSvg =
          node.clipMaskKind === "path" && node.clipPathD
            ? `${indent}  <svg class="s-clip-svg" width="0" height="0" aria-hidden="true"><defs><clipPath id="s-mask-${cssSafeId(node.id)}" clipPathUnits="objectBoundingBox"><path transform="scale(${1 / Math.max(1, worldBoxForBand(node, "wide")?.width ?? 1)},${1 / Math.max(1, worldBoxForBand(node, "wide")?.height ?? 1)})" d="${escapeHtml(node.clipPathD)}" /></clipPath></defs></svg>\n`
            : "";
        const content = node.clipOverflow
          ? `${maskSvg}${indent}  <div class="s-clip-content">\n${inner}\n${indent}  </div>`
          : `${maskSvg}${inner}`;
        return `${indent}<div class="s-group s-group-${cssSafeId(node.id)}${full}${flowHost}${flowItem}${clip}" data-group="${escapeHtml(node.id)}">\n${content}\n${indent}</div>`;
      }
      if (skipLayers?.has(node.id)) return "";
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
    if (layer.imageFrame) {
      const tag = layer.buttonLabel ? "button" : "div";
      const typeAttr = layer.buttonLabel ? ` type="button"` : "";
      return src
        ? `<${tag}${typeAttr} class="${cls} s-image-frame"${labelAttr}><img src="${src}" alt="${escapeHtml(layer.alt)}" /></${tag}>`
        : `<${tag}${typeAttr} class="${cls} s-image-frame"${labelAttr} aria-hidden="true"></${tag}>`;
    }
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
  if (layer.paintHtml) {
    const tag = layer.buttonLabel ? "button" : "div";
    const typeAttr = layer.buttonLabel ? ` type="button"` : "";
    const hidden = layer.buttonLabel ? "" : ` aria-hidden="true"`;
    return `<${tag} class="${cls}"${typeAttr}${labelAttr}${hidden}>${layer.paintHtml}</${tag}>`;
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
  multiCardPlan: MultiCardPublishPlan;
}): string {
  const pinned = resolvePinnedTopSection(args.blueprint);
  let mainBody: string;
  let pinShell = "";
  if (pinned) {
    const coverage = new Set(collectSemanticCoverageLayerIds(args.blueprint, pinned.id));
    const { pinned: pinRoots, rest } = partitionPinnedPublishRoots(args.forest.children, coverage);
    const pinInner = serializeTreeHtml(
      pinRoots,
      args.layers,
      "    ",
      false,
      args.multiCardPlan.layerToNode,
    );
    mainBody = serializeTreeHtml(
      rest,
      args.layers,
      "    ",
      false,
      args.multiCardPlan.layerToNode,
    );
    pinShell = `  <div class="s-pin" data-section-pin="${escapeHtml(pinned.id)}">\n${pinInner}\n  </div>`;
  } else {
    mainBody = serializeTreeHtml(
      args.forest.children,
      args.layers,
      "    ",
      false,
      args.multiCardPlan.layerToNode,
    );
  }
  const multiCardHtml = serializeMultiCardHtml(args.multiCardPlan, args.layers);
  const pageClass = args.forest.usesFlow ? "s-page s-flow" : "s-page";
  const htmlClass = [
    scrollFlowUsesKind(args.blueprint, "smooth") ? "s-scroll-smooth" : "",
    scrollFlowUsesKind(args.blueprint, "snap") ? "s-scroll-snap" : "",
    blueprintHasExpandedSection(args.blueprint) ? "s-has-vh-secs" : "",
    pinned ? "s-has-pin" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const lastSectionId = lastDocumentSection(args.blueprint)?.id;
  const anchors = listDocumentSections(args.blueprint)
    .map((section) => {
      const isLast = section.id === lastSectionId;
      const snapBands: Array<"wide" | "tablet" | "mobile"> = ["wide", "tablet", "mobile"];
      const snapClasses = isLast
        ? ""
        : snapBands
            .filter((band) => destinationScrollKind(args.blueprint, section.id, scrollLookupBand(args.blueprint, band)) === "snap")
            .map((band) => `s-snap-${band}`)
            .join(" ");
      const snap = snapClasses ? ` ${snapClasses}` : "";
      const last = isLast ? " s-sec-last" : "";
      return `    <div class="s-sec-anchor s-sec-anchor-${cssSafeId(section.id)}${snap}${last}" id="s-sec-${cssSafeId(section.id)}" data-section="${escapeHtml(section.id)}"></div>`;
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
${anchors ? `${anchors}\n` : ""}${mainBody}${multiCardHtml ? `\n${multiCardHtml}` : ""}
  </main>
${pinShell ? `${pinShell}\n` : ""}  <script src="script.js"></script>
</body>
</html>
`;
}
