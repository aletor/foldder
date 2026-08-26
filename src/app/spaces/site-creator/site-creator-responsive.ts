/**
 * Fase 6B.1 — layout responsive por contenedores + clusters visuales.
 * No modifica Designer ni persiste reglas responsive.
 */
import type { FreehandObject, PathObject } from "../FreehandStudio";
import type { DesignerPageState } from "../designer/DesignerNode";
import { getPageDimensions } from "../indesign/page-formats";
import { deepCloneDesignerPageState } from "./designer-source-snapshot";
import { collectSemanticCoverageLayerIds } from "./site-blueprint-ownership";
import {
  isWorldSpaceLayerId,
  sourceWorldBoundsOfIds,
  sourceWorldVisualBounds,
  worldSpaceAncestorId,
} from "./site-creator-layer-world-bounds";
import { unionPageRects, type PageRect } from "./site-creator-coordinate-space";
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import type { SiteBlueprintV1 } from "./site-creator-types";
import { isSiteSectionNode, type SiteBlueprintSectionNode } from "./site-creator-types";
import {
  SITE_CREATOR_TABLET_WIDTH,
  siteCreatorTabletMediaMaxWidth,
  clampViewportWidth,
  type SiteCreatorResolvedLayout,
  type SiteCreatorViewportBand,
} from "./site-creator-viewport";
import {
  deriveImageFocalFromSourceGeometry,
  resolveBackgroundContainTransform,
  resolveBackgroundCoverTransform,
  resolveBackgroundPreserveTransform,
  type NormalizedFocalPoint,
} from "./site-creator-background-cover";
import { clampNumber } from "./site-creator-responsive-math";
import {
  buildResolvedSceneFromIndex,
  collectVisibleLayerIdsFromPage,
  preservePageWithUniformMatrix,
  scalePathPointsUniform,
  transformPathObjectRelative,
  uniformScaleMatrix,
  type ResolvedResponsiveScene,
} from "./site-creator-responsive-matrix";
import {
  classifyLayoutGroupKind,
  classifyPageResponsiveKind,
} from "./site-creator-responsive-target-kind";
import { resolveEffectiveResponsiveMode } from "./site-creator-responsive-overrides";
import type { EffectiveResponsiveMode } from "./site-creator-responsive-overrides";
import {
  contentBoxX,
  contentBoxY,
  itemRefForCluster,
  resolveContainerTune,
  resolveMediaTune,
} from "./site-creator-responsive-tunes";
import {
  applyResponsiveContainerTunes,
  applyResponsiveItemTunes,
  applyResponsiveMediaTunes,
  sortClustersByItemOrder,
} from "./site-creator-responsive-apply";
import {
  analyzeSectionVisualPresentation,
  buildResponsiveVisualClusters,
  buildUnorganizedPresentationUnits,
  getObjectFontSize,
  roughlyContained,
  strongSurfaceContentRelation,
  type ResponsivePresentationUnit,
  type ResponsiveVisualCluster,
  type SectionVisualAnalysis,
} from "./site-creator-responsive-visual";
import { applyLayoutGroupWidthModes } from "./site-creator-group-width-layout";
import { applySectionViewportHeights, sectionCustomHeightForBand, sectionHeightModeForBand } from "./site-creator-section-height";

export type ResponsiveBand = "wide" | "tablet" | "mobile";

/** Cluster / región resuelta solo en memoria de preview — no se persiste. */
export type ResolvedResponsiveRegion = {
  sectionId: string;
  sectionType: "hero" | "generic";
  layoutRect: PageRect;
  /** Alto de contenido de esta banda antes de aplicar viewport/custom. */
  naturalHeight: number;
  /** Clip efectivo de la región (coincide con layoutRect). */
  clipRect: PageRect;
  backgroundLayerIds: string[];
  /** Focal usado por cada fondo imagen (layerId → focal). */
  backgroundFocals: Record<string, NormalizedFocalPoint>;
  /** Clusters efímeros (surface/preserve/solo); no existen en Blueprint. */
  ephemeralClusters: Array<{
    kind: ResponsiveVisualCluster["kind"];
    id: string;
    layerIds: string[];
    reason?: string;
    placedRect?: PageRect;
    anchor?: { x: number; y: number };
  }>;
};

export type ResolvedResponsiveSiteLayout = {
  band: ResponsiveBand;
  viewportWidth: number;
  pageRect: PageRect;
  regions: ResolvedResponsiveRegion[];
  /** layerId → clipRect de su región (fondos y capas de esa región). */
  objectClipById: Record<string, PageRect>;
};

export type SiteCreatorResponsiveDebug = {
  sectionAnalyses: SectionVisualAnalysis[];
  fallbackReasons: string[];
  resolved: ResolvedResponsiveSiteLayout | null;
};

export type SiteCreatorResponsiveResolveResult = {
  band: ResponsiveBand;
  strategy: "identity" | "auto" | "uniform-preserve";
  displayPage: DesignerPageState;
  layout: SiteCreatorResolvedLayout;
  resolvedLayout: ResolvedResponsiveSiteLayout | null;
  /** Escena canónica — misma matriz para render y selección. */
  resolvedScene?: ResolvedResponsiveScene | null;
  debug?: SiteCreatorResponsiveDebug;
};

export type { Matrix2D, ResolvedLayerInstance, ResolvedResponsiveScene } from "./site-creator-responsive-matrix";
export type { ResponsiveTargetKind } from "./site-creator-responsive-target-kind";

/** Gap entre regiones de primer nivel: 0 en 6B.1 (flujo contiguo). */
export const TOP_LEVEL_REGION_GAP = 0;

const MIN_TOUCH = 44;
const MIN_TEXT_MOBILE = 15;
const MIN_TEXT_TABLET = 14;
const CLUSTER_PAD = 16;

export { clampNumber } from "./site-creator-responsive-math";

/**
 * Mínimo editorial del Hero hasta que exista control explícito de altura.
 * Original/wide → 0 (identidad).
 */
export function resolveAutomaticHeroMinHeight(
  viewportWidth: number,
  band: ResponsiveBand,
): number {
  if (band === "mobile") {
    return clampNumber(520, viewportWidth * 1.35, 680);
  }
  if (band === "tablet") {
    return clampNumber(540, viewportWidth * 0.75, 720);
  }
  return 0;
}

export {
  analyzeSectionVisualPresentation,
  buildResponsiveVisualClusters,
  buildSectionPresentationUnits,
  buildUnorganizedPresentationUnits,
  classifyContainerBackground,
  strongSurfaceContentRelation,
} from "./site-creator-responsive-visual";

export function bandForViewportWidth(
  viewportWidth: number,
  referenceWidth: number,
): ResponsiveBand {
  const w = clampViewportWidth(viewportWidth, referenceWidth);
  const tabletMax = siteCreatorTabletMediaMaxWidth(referenceWidth);
  if (w > tabletMax) return "wide";
  if (w >= SITE_CREATOR_TABLET_WIDTH) return "tablet";
  return "mobile";
}

/**
 * Banda de layout en el editor. Tablet/Móvil siguen el dispositivo aunque el
 * ancho landscape cruce el breakpoint CSS (p. ej. iPad 1180px > 1024).
 */
export function bandForEditorDevice(
  viewportBand: SiteCreatorViewportBand,
  viewportWidth: number,
  referenceWidth: number,
): ResponsiveBand {
  if (viewportBand === "tablet" || viewportBand === "mobile") return viewportBand;
  return bandForViewportWidth(viewportWidth, referenceWidth);
}

function insetForBand(band: ResponsiveBand): number {
  if (band === "mobile") return 20;
  if (band === "tablet") return 28;
  return 0;
}

function gapForBand(band: ResponsiveBand): number {
  return band === "mobile" ? 16 : 20;
}

type SectionLayoutMetrics = {
  inset: number;
  gap: number;
  contentWidth: number;
  contentLeft: number;
  contentAlignX: "start" | "center" | "end" | null;
  contentAlignY: "start" | "center" | "end" | null;
  contentWidthMode: "content" | "container" | "full" | null;
  minHeight: number;
  autoHeight: boolean;
};

function resolveSectionLayoutMetrics(args: {
  blueprint: SiteBlueprintV1;
  sectionId: string;
  band: ResponsiveBand;
  viewportWidth: number;
  sectionType: "hero" | "generic";
}): SectionLayoutMetrics {
  const editable = args.band === "tablet" || args.band === "mobile" ? args.band : null;
  const tune = editable
    ? resolveContainerTune(args.blueprint, { kind: "blueprintNode", nodeId: args.sectionId }, editable)
    : null;
  const inset = typeof tune?.padding === "number" ? tune.padding : insetForBand(args.band);
  const gap = typeof tune?.gap === "number" ? tune.gap : gapForBand(args.band);
  const widthMode = tune?.contentWidthMode ?? null;
  const horizInset = widthMode === "full" ? 0 : inset;
  const padded = Math.max(80, args.viewportWidth - horizInset * 2);
  let contentWidth =
    typeof tune?.maxContentWidth === "number"
      ? Math.max(80, Math.min(padded, tune.maxContentWidth))
      : padded;
  if (widthMode === "full") contentWidth = args.viewportWidth;
  const contentAlignX = tune?.contentAlignX ?? null;
  const contentLeft = contentBoxX({
    align: contentAlignX ?? "center",
    contentLeft: horizInset,
    contentWidth: padded,
    boxWidth: Math.min(contentWidth, padded),
  });
  const editorial =
    args.sectionType === "hero" ? resolveAutomaticHeroMinHeight(args.viewportWidth, args.band) : 80;
  const minHeight = Math.max(editorial, tune?.minHeight ?? 0);
  return {
    inset,
    gap,
    contentWidth,
    contentLeft: widthMode === "full" ? 0 : contentLeft,
    contentAlignX,
    contentAlignY: tune?.contentAlignY ?? null,
    contentWidthMode:
      widthMode === "content" || widthMode === "container" || widthMode === "full" ? widthMode : null,
    minHeight,
    autoHeight: tune?.autoHeight !== false,
  };
}

function resolveSectionHeight(metrics: SectionLayoutMetrics, contentHeight: number): number {
  if (!metrics.autoHeight) return Math.max(1, metrics.minHeight);
  return Math.max(metrics.minHeight, contentHeight);
}

function cloneObj(obj: FreehandObject): FreehandObject {
  return structuredClone(obj);
}

function boundsOfIds(
  ids: string[],
  index: SiteCreatorSelectionIndex,
): PageRect | null {
  return sourceWorldBoundsOfIds(ids, index);
}

function setTextFontSize(obj: FreehandObject, fontSize: number): void {
  if (obj.type === "text" || obj.type === "textOnPath") {
    (obj as { fontSize?: number }).fontSize = fontSize;
  }
}

function scaleSubtreeLocal(obj: FreehandObject, scale: number, minFont: number): void {
  if (obj.type === "path") {
    scalePathPointsUniform((obj as PathObject).points, scale);
    if (typeof (obj as { strokeWidth?: number }).strokeWidth === "number") {
      (obj as { strokeWidth: number }).strokeWidth *= scale;
    }
    return;
  }
  if (obj.type === "text" || obj.type === "textOnPath") {
    setTextFontSize(obj, Math.max(minFont, getObjectFontSize(obj) * scale));
  }
  if (obj.type === "groupContainer" || obj.type === "booleanGroup") {
    for (const ch of (obj as { children?: FreehandObject[] }).children ?? []) {
      ch.x *= scale;
      ch.y *= scale;
      ch.width = Math.max(1, ch.width * scale);
      ch.height = Math.max(1, ch.height * scale);
      scaleSubtreeLocal(ch, scale, minFont);
    }
    return;
  }
  if (obj.type === "clippingContainer") {
    const c = obj as { mask?: FreehandObject; content?: FreehandObject[] };
    for (const ch of [c.mask, ...(c.content ?? [])].filter(Boolean) as FreehandObject[]) {
      ch.x *= scale;
      ch.y *= scale;
      ch.width = Math.max(1, ch.width * scale);
      ch.height = Math.max(1, ch.height * scale);
      scaleSubtreeLocal(ch, scale, minFont);
    }
  }
}

function parentUsesWorldSpaceChildren(
  parentId: string,
  index: SiteCreatorSelectionIndex,
): boolean {
  return index.byId[parentId]?.type === "groupContainer";
}

function writeWorldRect(
  byId: Map<string, FreehandObject>,
  index: SiteCreatorSelectionIndex,
  id: string,
  world: PageRect,
  transformSet: Set<string>,
): void {
  const obj = byId.get(id);
  const entry = index.byId[id];
  if (!obj || !entry) return;
  const parentId = entry.parentLayerId;
  if (
    parentId &&
    !transformSet.has(parentId) &&
    !parentUsesWorldSpaceChildren(parentId, index)
  ) {
    const parent = byId.get(parentId);
    if (parent) {
      obj.x = world.x - parent.x;
      obj.y = world.y - parent.y;
      obj.width = Math.max(1, world.width);
      obj.height = Math.max(1, world.height);
      return;
    }
  }
  obj.x = world.x;
  obj.y = world.y;
  obj.width = Math.max(1, world.width);
  obj.height = Math.max(1, world.height);
}

function mapSourceRectToTarget(
  source: PageRect,
  origin: PageRect,
  target: { x: number; y: number; scaleX: number; scaleY: number },
): PageRect {
  return {
    x: target.x + (source.x - origin.x) * target.scaleX,
    y: target.y + (source.y - origin.y) * target.scaleY,
    width: Math.max(1, source.width * target.scaleX),
    height: Math.max(1, source.height * target.scaleY),
  };
}

/** Hijos de carpeta Designer están en espacio de página, no locales al padre. */
function transformWorldSpaceGroupTree(
  obj: FreehandObject,
  index: SiteCreatorSelectionIndex,
  origin: PageRect,
  target: { x: number; y: number; scaleX: number; scaleY: number; minFont: number },
): void {
  const children = (obj as { children?: FreehandObject[] }).children ?? [];
  const uniform = Math.min(target.scaleX, target.scaleY);
  for (const ch of children) {
    const b = layoutSourceRect(ch, index);
    if (b) {
      const world = mapSourceRectToTarget(b, origin, target);
      ch.x = world.x;
      ch.y = world.y;
      ch.width = world.width;
      ch.height = world.height;
      if (ch.type === "path") {
        transformPathObjectRelative(ch as PathObject, origin, target);
      } else if (ch.type === "text" || ch.type === "textOnPath") {
        setTextFontSize(ch, Math.max(target.minFont, getObjectFontSize(ch) * uniform));
      }
    }
    if (ch.type === "groupContainer" || ch.type === "booleanGroup") {
      transformWorldSpaceGroupTree(ch, index, origin, target);
    } else if (ch.type === "clippingContainer") {
      scaleSubtreeLocal(ch, uniform, target.minFont);
    }
  }
}

function liftClipBooleanRoots(layerIds: string[], index: SiteCreatorSelectionIndex): string[] {
  const lifted = layerIds.map((id) => {
    const worldId = worldSpaceAncestorId(id, index);
    const type = index.byId[worldId]?.type;
    if (type === "clippingContainer" || type === "booleanGroup") return worldId;
    return id;
  });
  return [...new Set(lifted)];
}

/** Caja de layout: el clip usa su marco, no el AABB de la máscara. */
function layoutSourceRect(obj: FreehandObject, index: SiteCreatorSelectionIndex): PageRect | null {
  if (obj.type === "clippingContainer" && isWorldSpaceLayerId(obj.id, index)) {
    return {
      x: obj.x,
      y: obj.y,
      width: Math.max(1, obj.width),
      height: Math.max(1, obj.height),
    };
  }
  return sourceWorldVisualBounds(obj.id, index);
}

/** Escala uniforme relativa a un origen (preserva composición). */
function transformLayersRelative(
  byId: Map<string, FreehandObject>,
  layerIds: string[],
  index: SiteCreatorSelectionIndex,
  origin: PageRect,
  target: { x: number; y: number; scaleX: number; scaleY: number; minFont: number },
): PageRect | null {
  const set = new Set(liftClipBooleanRoots(layerIds, index));
  const roots = [...set].filter((id) => {
    const parent = index.byId[id]?.parentLayerId;
    return !parent || !set.has(parent);
  });
  if (roots.length === 0) return null;

  for (const id of roots) {
    const obj = byId.get(id);
    const entry = index.byId[id];
    if (!obj || !entry) continue;
    const b = layoutSourceRect(obj, index);
    if (!b) continue;
    const world: PageRect = {
      x: target.x + (b.x - origin.x) * target.scaleX,
      y: target.y + (b.y - origin.y) * target.scaleY,
      width: Math.max(1, b.width * target.scaleX),
      height: Math.max(1, b.height * target.scaleY),
    };
    if (obj.type === "path") {
      transformPathObjectRelative(obj as PathObject, origin, target);
    }
    writeWorldRect(byId, index, id, world, set);
    const uniform = Math.min(target.scaleX, target.scaleY);
    if (obj.type === "groupContainer") {
      transformWorldSpaceGroupTree(obj, index, origin, target);
    } else if (obj.type === "booleanGroup" || obj.type === "clippingContainer") {
      scaleSubtreeLocal(obj, uniform, target.minFont);
    } else if (obj.type === "text" || obj.type === "textOnPath") {
      setTextFontSize(obj, Math.max(target.minFont, getObjectFontSize(obj) * uniform));
    }
  }

  return {
    x: target.x,
    y: target.y,
    width: origin.width * target.scaleX,
    height: origin.height * target.scaleY,
  };
}

function transformAtomicUnit(
  byId: Map<string, FreehandObject>,
  unit: ResponsivePresentationUnit,
  index: SiteCreatorSelectionIndex,
  target: { x: number; y: number; scale: number; minFont: number },
): PageRect | null {
  return transformLayersRelative(byId, unit.layerIds, index, unit.bounds, {
    x: target.x,
    y: target.y,
    scaleX: target.scale,
    scaleY: target.scale,
    minFont: target.minFont,
  });
}

function minFontForBand(band: ResponsiveBand): number {
  return band === "mobile" ? MIN_TEXT_MOBILE : MIN_TEXT_TABLET;
}

function unitMinTextSize(
  unit: ResponsivePresentationUnit,
  index: SiteCreatorSelectionIndex,
): number {
  let min = Infinity;
  for (const id of unit.layerIds) {
    const obj = index.byId[id]?.object;
    if (!obj) continue;
    if (obj.type === "text" || obj.type === "textOnPath") {
      min = Math.min(min, getObjectFontSize(obj));
    }
  }
  return Number.isFinite(min) ? min : 16;
}

function unitButtonHeight(unit: ResponsivePresentationUnit): number {
  return unit.kind === "button" ? unit.bounds.height : 0;
}

function compositionKeepsUsability(
  scale: number,
  units: ResponsivePresentationUnit[],
  index: SiteCreatorSelectionIndex,
  minFont: number,
): boolean {
  for (const unit of units) {
    if (unit.kind === "button" && unit.bounds.height * scale < MIN_TOUCH - 0.5) {
      return false;
    }
    const textSize = unitMinTextSize(unit, index);
    if (textSize * scale < minFont - 0.5) return false;
  }
  return true;
}

function placeBackgroundLayers(args: {
  byId: Map<string, FreehandObject>;
  backgroundLayerIds: string[];
  layoutRect: PageRect;
  sourceRegion: PageRect;
  index: SiteCreatorSelectionIndex;
  blueprint?: SiteBlueprintV1;
  band?: ResponsiveBand;
}): Record<string, NormalizedFocalPoint> {
  const focals: Record<string, NormalizedFocalPoint> = {};
  const editable = args.band === "tablet" || args.band === "mobile" ? args.band : null;
  for (const bgId of args.backgroundLayerIds) {
    const obj = args.byId.get(bgId);
    const entry = args.index.byId[bgId];
    if (!obj || !entry) continue;
    const sourceRect =
      sourceWorldVisualBounds(bgId, args.index) ?? entry.visualBounds;

    if (obj.type === "image") {
      const media = editable && args.blueprint ? resolveMediaTune(args.blueprint, bgId, editable) : null;
      const focal =
        media?.focal ??
        deriveImageFocalFromSourceGeometry({
          imageRect: sourceRect,
          regionRect: args.sourceRegion,
        });
      const fit = media?.fit ?? "cover";
      const placed =
        fit === "contain"
          ? resolveBackgroundContainTransform({
              sourceRect,
              targetRect: args.layoutRect,
              focalPoint: focal,
            })
          : fit === "preserve"
            ? resolveBackgroundPreserveTransform({
                sourceRect,
                sourceRegion: args.sourceRegion,
                targetRect: args.layoutRect,
              })
            : resolveBackgroundCoverTransform({
                sourceRect,
                targetRect: args.layoutRect,
                focalPoint: focal,
              });
      obj.x = placed.x;
      obj.y = placed.y;
      obj.width = placed.width;
      obj.height = placed.height;
      (obj as { imagePreserveAspectRatio?: string }).imagePreserveAspectRatio = "none";
      focals[bgId] = placed.focalPoint;
      continue;
    }

    // Formas de fondo: estirar al marco de la región.
    if (obj.type === "clippingContainer") {
      const source = layoutSourceRect(obj, args.index) ?? sourceRect;
      const sx = args.layoutRect.width / Math.max(1, source.width);
      const sy = args.layoutRect.height / Math.max(1, source.height);
      obj.x = args.layoutRect.x;
      obj.y = args.layoutRect.y;
      obj.width = args.layoutRect.width;
      obj.height = args.layoutRect.height;
      scaleSubtreeLocal(obj, Math.min(sx, sy), 0);
      continue;
    }
    obj.x = args.layoutRect.x;
    obj.y = args.layoutRect.y;
    obj.width = args.layoutRect.width;
    obj.height = args.layoutRect.height;
  }
  return focals;
}

function clusterNormalizedAnchor(
  clusterBounds: PageRect,
  sourceRegion: PageRect,
): { x: number; y: number } {
  const cx = clusterBounds.x + clusterBounds.width / 2;
  const cy = clusterBounds.y + clusterBounds.height / 2;
  return {
    x: (cx - sourceRegion.x) / Math.max(1, sourceRegion.width),
    y: (cy - sourceRegion.y) / Math.max(1, sourceRegion.height),
  };
}

/** Coloca un rectángulo de cluster alrededor de su ancla normalizada, con clamp de padding. */
export function placeClusterByAnchor(args: {
  clusterSize: { width: number; height: number };
  anchor: { x: number; y: number };
  regionRect: PageRect;
  padding: number;
}): PageRect {
  const { clusterSize, anchor, regionRect, padding } = args;
  const pad = Math.max(0, padding);
  const availW = Math.max(1, regionRect.width - pad * 2);
  const availH = Math.max(1, regionRect.height - pad * 2);
  const w = Math.min(clusterSize.width, availW);
  const h = Math.min(clusterSize.height, availH);

  const ax = clampNumber(0, anchor.x, 1);
  let ay = clampNumber(0, anchor.y, 1);
  // Si el ancla cae fuera de la zona útil tras clamp de tamaño, preferir centro.
  if (h + pad * 2 > regionRect.height * 0.98) {
    ay = 0.5;
  }

  let x = regionRect.x + ax * regionRect.width - w / 2;
  let y = regionRect.y + ay * regionRect.height - h / 2;

  const minX = regionRect.x + pad;
  const maxX = regionRect.x + regionRect.width - pad - w;
  const minY = regionRect.y + pad;
  const maxY = regionRect.y + regionRect.height - pad - h;

  x = maxX < minX ? regionRect.x + (regionRect.width - w) / 2 : clampNumber(minX, x, maxX);
  y = maxY < minY ? regionRect.y + (regionRect.height - h) / 2 : clampNumber(minY, y, maxY);

  return { x, y, width: w, height: h };
}

function layoutPreserveComposition(args: {
  byId: Map<string, FreehandObject>;
  layerIds: string[];
  origin: PageRect;
  index: SiteCreatorSelectionIndex;
  band: ResponsiveBand;
  targetX: number;
  targetY: number;
  scale: number;
  /** Explicit preserve (6B.2): no forzar tipografía mínima. */
  enforceMinFont?: boolean;
}): PageRect {
  const minFont = args.enforceMinFont === false ? 0 : minFontForBand(args.band);
  return (
    transformLayersRelative(args.byId, args.layerIds, args.index, args.origin, {
      x: args.targetX,
      y: args.targetY,
      scaleX: args.scale,
      scaleY: args.scale,
      minFont,
    }) ?? {
      x: args.targetX,
      y: args.targetY,
      width: args.origin.width * args.scale,
      height: args.origin.height * args.scale,
    }
  );
}

/** Unidades directas de un layoutGroup para Apilar. */
function directStackUnitsForLayoutGroup(args: {
  blueprint: SiteBlueprintV1;
  groupId: string;
  index: SiteCreatorSelectionIndex;
}): Array<{ layerIds: string[]; bounds: PageRect; z: number }> {
  const group = args.blueprint.nodes[args.groupId];
  if (!group || group.kind !== "layoutGroup") return [];
  const units: Array<{ layerIds: string[]; bounds: PageRect; z: number }> = [];
  const used = new Set<string>();

  for (const childId of group.childIds) {
    const child = args.blueprint.nodes[childId];
    if (!child) continue;
    const layerIds = collectSemanticCoverageLayerIds(args.blueprint, childId);
    const bounds = boundsOfIds(layerIds, args.index);
    if (!bounds || layerIds.length === 0) continue;
    layerIds.forEach((id) => used.add(id));
    units.push({
      layerIds,
      bounds,
      z: Math.min(
        ...layerIds.map((id) => args.index.byId[id]?.zOrderPath.at(-1) ?? 0),
      ),
    });
  }
  for (const layerId of group.layerIds) {
    if (used.has(layerId)) continue;
    const entry = args.index.byId[layerId];
    if (!entry?.visible) continue;
    used.add(layerId);
    units.push({
      layerIds: [layerId],
      bounds: entry.visualBounds,
      z: entry.zOrderPath.at(-1) ?? 0,
    });
  }
  units.sort((a, b) => {
    const dy = a.bounds.y - b.bounds.y;
    if (Math.abs(dy) > 0.5) return dy;
    const dx = a.bounds.x - b.bounds.x;
    if (Math.abs(dx) > 0.5) return dx;
    return a.z - b.z;
  });
  return units;
}

function measureStackUnits(
  units: Array<{ bounds: PageRect }>,
  contentWidth: number,
  gap: number,
): { width: number; height: number; scales: number[] } {
  const scales = units.map((u) => Math.min(1, contentWidth / Math.max(1, u.bounds.width)));
  let height = 0;
  for (let i = 0; i < units.length; i++) {
    height += units[i]!.bounds.height * scales[i]! + (i > 0 ? gap : 0);
  }
  return { width: contentWidth, height, scales };
}

function layoutStackUnitsAt(args: {
  byId: Map<string, FreehandObject>;
  units: Array<{ layerIds: string[]; bounds: PageRect }>;
  scales: number[];
  index: SiteCreatorSelectionIndex;
  band: ResponsiveBand;
  target: PageRect;
  gap: number;
  enforceMinFont?: boolean;
}): PageRect {
  let y = args.target.y;
  let maxR = args.target.x;
  for (let i = 0; i < args.units.length; i++) {
    const u = args.units[i]!;
    const scale = args.scales[i]!;
    const w = u.bounds.width * scale;
    const h = u.bounds.height * scale;
    const x = args.target.x + (args.target.width - Math.min(w, args.target.width)) / 2;
    layoutPreserveComposition({
      byId: args.byId,
      layerIds: u.layerIds,
      origin: u.bounds,
      index: args.index,
      band: args.band,
      targetX: x,
      targetY: y,
      scale,
      enforceMinFont: args.enforceMinFont,
    });
    maxR = Math.max(maxR, x + w);
    y += h + args.gap;
  }
  return {
    x: args.target.x,
    y: args.target.y,
    width: args.target.width,
    height: Math.max(0, y - args.target.y - (args.units.length ? args.gap : 0)),
  };
}

function nestedOverrideForCluster(
  cluster: ResponsiveVisualCluster,
  blueprint: SiteBlueprintV1,
  band: ResponsiveBand,
  index: SiteCreatorSelectionIndex,
): EffectiveResponsiveMode | null {
  if (cluster.kind !== "solo") return null;
  if (cluster.unit.kind === "layoutGroup" && cluster.unit.nodeId) {
    const effective = resolveEffectiveResponsiveMode({
      blueprint,
      target: { kind: "blueprintNode", nodeId: cluster.unit.nodeId },
      band,
      index,
    });
    if (effective.mode === "auto") {
      const kind = classifyLayoutGroupKind({
        blueprint,
        groupId: cluster.unit.nodeId,
        index,
      });
      if (kind === "composition-group") {
        return { mode: "preserve", source: "default" };
      }
    }
    return effective;
  }
  if (cluster.unit.kind === "designerGroup") {
    const rootId = cluster.unit.layerIds[0];
    if (!rootId) return null;
    return resolveEffectiveResponsiveMode({
      blueprint,
      target: { kind: "designerGroup", layerId: rootId },
      band,
      index,
    });
  }
  return null;
}

function measureSurfaceClusterSize(args: {
  cluster: Extract<ResponsiveVisualCluster, { kind: "surface" }>;
  index: SiteCreatorSelectionIndex;
  band: ResponsiveBand;
  contentWidth: number;
  gap: number;
}): { width: number; height: number; mode: "preserve" | "reflow"; scale: number } {
  const { cluster, index, band, contentWidth, gap } = args;
  const minFont = minFontForBand(band);
  const scale = Math.min(1, contentWidth / Math.max(1, cluster.bounds.width));
  if (compositionKeepsUsability(scale, cluster.members, index, minFont)) {
    return {
      width: cluster.bounds.width * scale,
      height: cluster.bounds.height * scale,
      mode: "preserve",
      scale,
    };
  }

  const surfaceW = contentWidth;
  let innerH = CLUSTER_PAD;
  const ordered = [...cluster.members].sort(
    (a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x,
  );
  for (const member of ordered) {
    if (member.kind === "button") {
      const fit = Math.min(1, (surfaceW - CLUSTER_PAD * 2) / Math.max(1, member.bounds.width));
      const need = Math.max(MIN_TOUCH / Math.max(1, member.bounds.height), 1);
      const s = Math.max(
        fit,
        Math.min(need, (surfaceW - CLUSTER_PAD * 2) / Math.max(1, member.bounds.width)),
      );
      innerH += Math.max(MIN_TOUCH, member.bounds.height * s) + gap;
      continue;
    }
    const textSize = unitMinTextSize(member, index);
    const fit = Math.min(1, (surfaceW - CLUSTER_PAD * 2) / Math.max(1, member.bounds.width));
    const fontScale = textSize > 0 ? Math.max(minFont / textSize, fit) : fit;
    const s = Math.min(1, Math.max(fit, Math.min(fontScale, 1)));
    innerH += member.bounds.height * s + gap;
  }
  innerH += CLUSTER_PAD - gap;
  const surfaceH = Math.max(
    cluster.surfaceBounds.height * Math.min(1, surfaceW / Math.max(1, cluster.surfaceBounds.width)),
    innerH,
  );
  return { width: surfaceW, height: surfaceH, mode: "reflow", scale: 1 };
}

function layoutSurfaceClusterAt(args: {
  byId: Map<string, FreehandObject>;
  cluster: Extract<ResponsiveVisualCluster, { kind: "surface" }>;
  index: SiteCreatorSelectionIndex;
  band: ResponsiveBand;
  contentWidth: number;
  gap: number;
  target: PageRect;
  mode: "preserve" | "reflow";
  scale: number;
}): PageRect {
  const { cluster, index, band, contentWidth, gap, target, mode, scale } = args;
  const minFont = minFontForBand(band);

  if (mode === "preserve") {
    return layoutPreserveComposition({
      byId: args.byId,
      layerIds: cluster.allLayerIds,
      origin: cluster.bounds,
      index,
      band,
      targetX: target.x,
      targetY: target.y,
      scale,
    });
  }

  const surfaceW = target.width;
  const surfaceX = target.x;
  let innerY = target.y + CLUSTER_PAD;

  const ordered = [...cluster.members].sort(
    (a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x,
  );

  for (const member of ordered) {
    if (member.kind === "button") {
      const fit = Math.min(1, (surfaceW - CLUSTER_PAD * 2) / Math.max(1, member.bounds.width));
      const need = Math.max(MIN_TOUCH / Math.max(1, member.bounds.height), 1);
      const s = Math.max(
        fit,
        Math.min(need, (surfaceW - CLUSTER_PAD * 2) / Math.max(1, member.bounds.width)),
      );
      const h = Math.max(MIN_TOUCH, member.bounds.height * s);
      transformAtomicUnit(args.byId, member, index, {
        x: surfaceX + CLUSTER_PAD,
        y: innerY,
        scale: s,
        minFont,
      });
      for (const id of member.layerIds) {
        const obj = args.byId.get(id);
        const entry = index.byId[id];
        if (!obj || !entry) continue;
        if ((entry.type === "rect" || entry.type === "ellipse") && obj.height < MIN_TOUCH) {
          const cy = obj.y + obj.height / 2;
          obj.height = MIN_TOUCH;
          obj.y = cy - MIN_TOUCH / 2;
        }
      }
      innerY += h + gap;
      continue;
    }

    const textSize = unitMinTextSize(member, index);
    const fit = Math.min(1, (surfaceW - CLUSTER_PAD * 2) / Math.max(1, member.bounds.width));
    const fontScale = textSize > 0 ? Math.max(minFont / textSize, fit) : fit;
    const s = Math.min(1, Math.max(fit, Math.min(fontScale, 1)));
    const w = Math.min(surfaceW - CLUSTER_PAD * 2, member.bounds.width * s);
    const placed = transformAtomicUnit(args.byId, member, index, {
      x: surfaceX + CLUSTER_PAD,
      y: innerY,
      scale: s,
      minFont,
    });
    for (const id of member.layerIds) {
      const obj = args.byId.get(id);
      if (!obj) continue;
      if (obj.type === "text" || obj.type === "textOnPath") obj.width = w;
    }
    innerY += (placed?.height ?? member.bounds.height * s) + gap;
  }

  writeWorldRect(
    args.byId,
    index,
    cluster.surfaceLayerId,
    { x: surfaceX, y: target.y, width: surfaceW, height: target.height },
    new Set(),
  );
  return { ...target };
}

function layoutSoloUnitAt(args: {
  byId: Map<string, FreehandObject>;
  unit: ResponsivePresentationUnit;
  index: SiteCreatorSelectionIndex;
  band: ResponsiveBand;
  target: PageRect;
  scale: number;
}): PageRect {
  const minFont = minFontForBand(args.band);
  const placed = transformAtomicUnit(args.byId, args.unit, args.index, {
    x: args.target.x,
    y: args.target.y,
    scale: args.scale,
    minFont,
  });
  if (args.unit.kind === "button") {
    for (const id of args.unit.layerIds) {
      const obj = args.byId.get(id);
      const entry = args.index.byId[id];
      if (!obj || !entry) continue;
      if ((entry.type === "rect" || entry.type === "ellipse") && obj.height < MIN_TOUCH) {
        const cy = obj.y + obj.height / 2;
        obj.height = MIN_TOUCH;
        obj.y = cy - MIN_TOUCH / 2;
      }
    }
  }
  return (
    placed ?? {
      x: args.target.x,
      y: args.target.y,
      width: args.unit.bounds.width * args.scale,
      height: args.unit.bounds.height * args.scale,
    }
  );
}

function layoutSectionFromAnalysis(args: {
  byId: Map<string, FreehandObject>;
  analysis: SectionVisualAnalysis;
  blueprint: SiteBlueprintV1;
  index: SiteCreatorSelectionIndex;
  band: ResponsiveBand;
  viewportWidth: number;
  sourceWidth: number;
  yCursor: number;
}): ResolvedResponsiveRegion {
  const { analysis, index, band, viewportWidth } = args;
  const effective = resolveEffectiveResponsiveMode({
    blueprint: args.blueprint,
    target: { kind: "blueprintNode", nodeId: analysis.sectionId },
    band,
    index,
  });
  if (effective.mode === "preserve") {
    return layoutSectionPreserveMode(args);
  }
  if (effective.mode === "stack") {
    return layoutSectionStackMode(args);
  }
  return layoutSectionAutoMode(args);
}

function layoutSectionPreserveMode(args: {
  byId: Map<string, FreehandObject>;
  analysis: SectionVisualAnalysis;
  blueprint: SiteBlueprintV1;
  index: SiteCreatorSelectionIndex;
  band: ResponsiveBand;
  viewportWidth: number;
  sourceWidth: number;
  yCursor: number;
}): ResolvedResponsiveRegion {
  const { analysis, index, band, viewportWidth } = args;
  const sectionNode = args.blueprint.nodes[analysis.sectionId];
  const sectionType: "hero" | "generic" =
    isSiteSectionNode(sectionNode) && sectionNode.sectionType === "hero" ? "hero" : "generic";
  const metrics = resolveSectionLayoutMetrics({
    blueprint: args.blueprint,
    sectionId: analysis.sectionId,
    band,
    viewportWidth,
    sectionType,
  });
  const inset = metrics.inset;
  const contentWidth = metrics.contentWidth;
  const sectionTop = args.yCursor;

  const bgSet = new Set(analysis.background.backgroundLayerIds);
  const foregroundIds = collectSemanticCoverageLayerIds(args.blueprint, analysis.sectionId).filter(
    (id) => !bgSet.has(id),
  );
  const origin: PageRect = {
    x: 0,
    y: analysis.containerBounds.y,
    width: Math.max(1, args.sourceWidth),
    height: Math.max(1, analysis.containerBounds.height),
  };
  const scale = Math.min(1, contentWidth / Math.max(1, origin.width));
  const compW = origin.width * scale;
  const compH = origin.height * scale;
  const containerH = analysis.containerBounds.height * scale;
  const anchor = clusterNormalizedAnchor(origin, analysis.containerBounds);

  const editableBand = band === "tablet" || band === "mobile" ? band : null;
  const tune = editableBand
    ? resolveContainerTune(args.blueprint, { kind: "blueprintNode", nodeId: analysis.sectionId }, editableBand)
    : null;
  const tuneMin = typeof tune?.minHeight === "number" ? tune.minHeight : 0;
  const sectionHeight = metrics.autoHeight
    ? Math.max(tuneMin, containerH + inset * 2, compH + inset * 2)
    : Math.max(1, metrics.minHeight);
  let layoutRect: PageRect = {
    x: 0,
    y: sectionTop,
    width: viewportWidth,
    height: sectionHeight,
  };

  const backgroundFocals = placeBackgroundLayers({
    byId: args.byId,
    backgroundLayerIds: analysis.background.backgroundLayerIds,
    layoutRect,
    sourceRegion: analysis.containerBounds,
    index,
    blueprint: args.blueprint,
    band,
  });

  const placedBoxRaw = placeClusterByAnchor({
    clusterSize: { width: compW, height: compH },
    anchor,
    regionRect: layoutRect,
    padding: inset,
  });
  const placedBox = {
    ...placedBoxRaw,
    x:
      metrics.contentAlignX != null
        ? contentBoxX({
            align: metrics.contentAlignX,
            contentLeft: metrics.contentLeft,
            contentWidth: metrics.contentWidth,
            boxWidth: placedBoxRaw.width,
          })
        : placedBoxRaw.x,
    y:
      metrics.contentAlignY != null
        ? contentBoxY({
            align: metrics.contentAlignY,
            contentTop: layoutRect.y + inset,
            contentHeight: Math.max(1, layoutRect.height - inset * 2),
            boxHeight: placedBoxRaw.height,
          })
        : placedBoxRaw.y,
  };
  const placed = layoutPreserveComposition({
    byId: args.byId,
    layerIds: foregroundIds,
    origin,
    index,
    band,
    targetX: placedBox.x,
    targetY: placedBox.y,
    scale,
    enforceMinFont: false,
  });

  if (placed) {
    const neededBottom = Math.max(
      layoutRect.y + layoutRect.height,
      placed.y + placed.height + inset,
    );
    const neededHeight = neededBottom - layoutRect.y;
    if (neededHeight > layoutRect.height + 0.5) {
      layoutRect = { ...layoutRect, height: neededHeight };
    }
  }

  return {
    sectionId: analysis.sectionId,
    sectionType,
    layoutRect,
    naturalHeight: layoutRect.height,
    clipRect: { ...layoutRect },
    backgroundLayerIds: [...analysis.background.backgroundLayerIds],
    backgroundFocals,
    ephemeralClusters: [
      {
        kind: "preserve",
        id: `override-preserve:${analysis.sectionId}`,
        layerIds: foregroundIds,
        reason: "explicit-preserve",
        placedRect: placed,
        anchor,
      },
    ],
  };
}

function layoutSectionStackMode(args: {
  byId: Map<string, FreehandObject>;
  analysis: SectionVisualAnalysis;
  blueprint: SiteBlueprintV1;
  index: SiteCreatorSelectionIndex;
  band: ResponsiveBand;
  viewportWidth: number;
  yCursor: number;
}): ResolvedResponsiveRegion {
  const { analysis, index, band, viewportWidth } = args;
  const sectionNode = args.blueprint.nodes[analysis.sectionId];
  const sectionType: "hero" | "generic" =
    isSiteSectionNode(sectionNode) && sectionNode.sectionType === "hero" ? "hero" : "generic";
  const metrics = resolveSectionLayoutMetrics({
    blueprint: args.blueprint,
    sectionId: analysis.sectionId,
    band,
    viewportWidth,
    sectionType,
  });
  const inset = metrics.inset;
  const gap = metrics.gap;
  let contentWidth = metrics.contentWidth;
  let contentLeft = metrics.contentLeft;
  const sectionTop = args.yCursor;

  // Unidades = clusters (surfaces intactas); forzar reflow interno si no cabe.
  type Measured = {
    cluster: ResponsiveVisualCluster;
    width: number;
    height: number;
    scale: number;
    mode: "preserve" | "reflow";
    nestedStack?: Array<{ layerIds: string[]; bounds: PageRect }>;
    nestedScales?: number[];
    enforceMinFont?: boolean;
  };
  let measured: Measured[] = [...analysis.clusters]
    .sort((a, b) => {
      const dy = a.bounds.y - b.bounds.y;
      if (Math.abs(dy) > 0.5) return dy;
      const dx = a.bounds.x - b.bounds.x;
      if (Math.abs(dx) > 0.5) return dx;
      return 0;
    })
    .map((cluster) => {
      const nested = nestedOverrideForCluster(cluster, args.blueprint, band, index);
      if (
        nested?.mode === "stack" &&
        cluster.kind === "solo" &&
        cluster.unit.kind === "layoutGroup" &&
        cluster.unit.nodeId
      ) {
        const units = directStackUnitsForLayoutGroup({
          blueprint: args.blueprint,
          groupId: cluster.unit.nodeId,
          index,
        });
        const m = measureStackUnits(units, contentWidth, gap);
        return {
          cluster,
          width: m.width,
          height: m.height,
          scale: 1,
          mode: "reflow" as const,
          nestedStack: units,
          nestedScales: m.scales,
        };
      }
      if (cluster.kind === "surface") {
        const m = measureSurfaceClusterSize({
          cluster,
          index,
          band,
          contentWidth,
          gap,
        });
        return {
          cluster,
          width: m.width,
          height: m.height,
          scale: m.scale,
          mode: m.mode,
        };
      }
      if (cluster.kind === "preserve" || nested?.mode === "preserve") {
        const origin = cluster.kind === "solo" ? cluster.unit.bounds : cluster.bounds;
        const scale = Math.min(1, contentWidth / Math.max(1, origin.width));
        return {
          cluster,
          width: origin.width * scale,
          height: origin.height * scale,
          scale,
          mode: "preserve" as const,
          enforceMinFont: nested?.mode === "preserve" ? false : undefined,
        };
      }
      let scale = Math.min(1, contentWidth / Math.max(1, cluster.unit.bounds.width));
      if (cluster.unit.kind === "button") {
        const need = MIN_TOUCH / Math.max(1, cluster.unit.bounds.height);
        scale = Math.min(
          1,
          Math.max(scale, Math.min(need, contentWidth / Math.max(1, cluster.unit.bounds.width))),
        );
      }
      return {
        cluster,
        width: cluster.unit.bounds.width * scale,
        height: Math.max(
          cluster.unit.kind === "button" ? MIN_TOUCH : 0,
          cluster.unit.bounds.height * scale,
        ),
        scale,
        mode: "preserve" as const,
      };
    });

  const editableBand = band === "tablet" || band === "mobile" ? band : null;
  if (editableBand) {
    measured = sortClustersByItemOrder(measured, args.blueprint, editableBand, (item) =>
      itemRefForCluster(item.cluster),
    );
  }

  if (metrics.contentWidthMode === "content") {
    const hug = Math.max(
      80,
      ...measured.map((item) => item.width),
      0,
    );
    contentWidth = Math.min(contentWidth, hug);
    const padded = Math.max(80, viewportWidth - inset * 2);
    contentLeft = contentBoxX({
      align: metrics.contentAlignX ?? "center",
      contentLeft: inset,
      contentWidth: padded,
      boxWidth: contentWidth,
    });
  }

  let stackH = inset;
  for (const item of measured) {
    stackH += item.height + gap;
  }
  stackH += inset - (measured.length ? gap : 0);

  const sectionHeight = resolveSectionHeight(metrics, stackH);
  const layoutRect: PageRect = {
    x: 0,
    y: sectionTop,
    width: viewportWidth,
    height: sectionHeight,
  };

  const backgroundFocals = placeBackgroundLayers({
    byId: args.byId,
    backgroundLayerIds: analysis.background.backgroundLayerIds,
    layoutRect,
    sourceRegion: analysis.containerBounds,
    index,
    blueprint: args.blueprint,
    band,
  });

  const extraY = Math.max(0, sectionHeight - stackH);
  const yAlign = metrics.contentAlignY ?? "start";
  const yShift =
    yAlign === "end" ? extraY : yAlign === "center" ? extraY / 2 : 0;

  const ephemeralClusters: ResolvedResponsiveRegion["ephemeralClusters"] = [];
  let y = sectionTop + inset + yShift;
  for (const item of measured) {
    const boxW = Math.min(item.width, contentWidth);
    const placedBox: PageRect = {
      x:
        metrics.contentAlignX != null
          ? contentBoxX({
              align: metrics.contentAlignX,
              contentLeft,
              contentWidth,
              boxWidth: boxW,
            })
          : contentLeft + (contentWidth - boxW) / 2,
      y,
      width: boxW,
      height: item.height,
    };
    if (item.nestedStack && item.nestedScales) {
      const placed = layoutStackUnitsAt({
        byId: args.byId,
        units: item.nestedStack,
        scales: item.nestedScales,
        index,
        band,
        target: placedBox,
        gap,
        enforceMinFont: false,
      });
      ephemeralClusters.push({
        kind: "solo",
        id: item.cluster.id,
        layerIds: [...item.cluster.allLayerIds],
        placedRect: placed,
      });
      y = placed.y + placed.height + gap;
      continue;
    }
    if (item.cluster.kind === "surface") {
      const placed = layoutSurfaceClusterAt({
        byId: args.byId,
        cluster: item.cluster,
        index,
        band,
        contentWidth,
        gap,
        target: placedBox,
        mode: item.mode,
        scale: item.scale,
      });
      ephemeralClusters.push({
        kind: item.cluster.kind,
        id: item.cluster.id,
        layerIds: [...item.cluster.allLayerIds],
        placedRect: placed,
      });
      y = placed.y + placed.height + gap;
      continue;
    }
    if (item.cluster.kind === "preserve" || item.enforceMinFont === false) {
      const origin =
        item.cluster.kind === "solo" ? item.cluster.unit.bounds : item.cluster.bounds;
      const layerIds =
        item.cluster.kind === "solo" ? item.cluster.unit.layerIds : item.cluster.allLayerIds;
      const placed = layoutPreserveComposition({
        byId: args.byId,
        layerIds,
        origin,
        index,
        band,
        targetX: placedBox.x,
        targetY: placedBox.y,
        scale: item.scale,
        enforceMinFont: item.enforceMinFont,
      });
      ephemeralClusters.push({
        kind: item.cluster.kind === "preserve" ? "preserve" : "solo",
        id: item.cluster.id,
        layerIds: [...item.cluster.allLayerIds],
        reason: item.cluster.kind === "preserve" ? item.cluster.reason : undefined,
        placedRect: placed,
      });
      y = placed.y + placed.height + gap;
      continue;
    }
    const placed = layoutSoloUnitAt({
      byId: args.byId,
      unit: item.cluster.unit,
      index,
      band,
      target: placedBox,
      scale: item.scale,
    });
    ephemeralClusters.push({
      kind: "solo",
      id: item.cluster.id,
      layerIds: [...item.cluster.allLayerIds],
      placedRect: placed,
    });
    y = placed.y + placed.height + gap;
  }

  return {
    sectionId: analysis.sectionId,
    sectionType,
    layoutRect,
    naturalHeight: layoutRect.height,
    clipRect: { ...layoutRect },
    backgroundLayerIds: [...analysis.background.backgroundLayerIds],
    backgroundFocals,
    ephemeralClusters,
  };
}

function layoutSectionAutoMode(args: {
  byId: Map<string, FreehandObject>;
  analysis: SectionVisualAnalysis;
  blueprint: SiteBlueprintV1;
  index: SiteCreatorSelectionIndex;
  band: ResponsiveBand;
  viewportWidth: number;
  yCursor: number;
}): ResolvedResponsiveRegion {
  const { analysis, index, band, viewportWidth } = args;
  const sectionNode = args.blueprint.nodes[analysis.sectionId];
  const sectionType: "hero" | "generic" =
    isSiteSectionNode(sectionNode) && sectionNode.sectionType === "hero" ? "hero" : "generic";
  const metrics = resolveSectionLayoutMetrics({
    blueprint: args.blueprint,
    sectionId: analysis.sectionId,
    band,
    viewportWidth,
    sectionType,
  });
  const inset = metrics.inset;
  const gap = metrics.gap;
  const contentWidth = metrics.contentWidth;
  const sectionTop = args.yCursor;

  type Measured = {
    cluster: ResponsiveVisualCluster;
    width: number;
    height: number;
    scale: number;
    mode: "preserve" | "reflow";
    anchor: { x: number; y: number };
    nestedStack?: Array<{ layerIds: string[]; bounds: PageRect }>;
    nestedScales?: number[];
    enforceMinFont?: boolean;
  };
  const measured: Measured[] = [];

  for (const cluster of analysis.clusters) {
    const anchor = clusterNormalizedAnchor(cluster.bounds, analysis.containerBounds);
    const nested = nestedOverrideForCluster(cluster, args.blueprint, band, index);
    if (
      nested?.mode === "stack" &&
      cluster.kind === "solo" &&
      cluster.unit.kind === "layoutGroup" &&
      cluster.unit.nodeId
    ) {
      const units = directStackUnitsForLayoutGroup({
        blueprint: args.blueprint,
        groupId: cluster.unit.nodeId,
        index,
      });
      const m = measureStackUnits(units, contentWidth, gap);
      measured.push({
        cluster,
        width: m.width,
        height: m.height,
        scale: 1,
        mode: "reflow",
        anchor,
        nestedStack: units,
        nestedScales: m.scales,
      });
      continue;
    }
    if (cluster.kind === "surface") {
      const m = measureSurfaceClusterSize({
        cluster,
        index,
        band,
        contentWidth,
        gap,
      });
      measured.push({
        cluster,
        width: m.width,
        height: m.height,
        scale: m.scale,
        mode: m.mode,
        anchor,
      });
      continue;
    }
    if (cluster.kind === "preserve" || nested?.mode === "preserve") {
      const origin = cluster.kind === "solo" ? cluster.unit.bounds : cluster.bounds;
      const scale = Math.min(1, contentWidth / Math.max(1, origin.width));
      measured.push({
        cluster,
        width: origin.width * scale,
        height: origin.height * scale,
        scale,
        mode: "preserve",
        anchor,
        enforceMinFont: nested?.mode === "preserve" ? false : undefined,
      });
      continue;
    }
    let scale = Math.min(1, contentWidth / Math.max(1, cluster.unit.bounds.width));
    if (cluster.unit.kind === "button") {
      const need = MIN_TOUCH / Math.max(1, cluster.unit.bounds.height);
      scale = Math.min(
        1,
        Math.max(scale, Math.min(need, contentWidth / Math.max(1, cluster.unit.bounds.width))),
      );
    }
    measured.push({
      cluster,
      width: cluster.unit.bounds.width * scale,
      height: Math.max(
        cluster.unit.kind === "button" ? MIN_TOUCH : 0,
        cluster.unit.bounds.height * scale,
      ),
      scale,
      mode: "preserve",
      anchor,
    });
  }

  const autoEditable = band === "tablet" || band === "mobile" ? band : null;
  if (autoEditable) {
    const ordered = sortClustersByItemOrder(measured, args.blueprint, autoEditable, (item) =>
      itemRefForCluster(item.cluster),
    );
    measured.length = 0;
    measured.push(...ordered);
  }

  const tallestCluster = measured.reduce((m, c) => Math.max(m, c.height), 0);
  const sectionHeight = resolveSectionHeight(metrics, tallestCluster + inset * 2);
  const layoutRect: PageRect = {
    x: 0,
    y: sectionTop,
    width: viewportWidth,
    height: sectionHeight,
  };

  const backgroundFocals = placeBackgroundLayers({
    byId: args.byId,
    backgroundLayerIds: analysis.background.backgroundLayerIds,
    layoutRect,
    sourceRegion: analysis.containerBounds,
    index,
    blueprint: args.blueprint,
    band,
  });

  const ephemeralClusters: ResolvedResponsiveRegion["ephemeralClusters"] = [];

  for (const item of measured) {
    const placedBoxRaw = placeClusterByAnchor({
      clusterSize: { width: item.width, height: item.height },
      anchor: item.anchor,
      regionRect: layoutRect,
      padding: inset,
    });
    const placedBox =
      metrics.contentAlignX != null
        ? {
            ...placedBoxRaw,
            x: contentBoxX({
              align: metrics.contentAlignX,
              contentLeft: metrics.contentLeft,
              contentWidth,
              boxWidth: placedBoxRaw.width,
            }),
          }
        : placedBoxRaw;

    if (item.nestedStack && item.nestedScales) {
      const placed = layoutStackUnitsAt({
        byId: args.byId,
        units: item.nestedStack,
        scales: item.nestedScales,
        index,
        band,
        target: { ...placedBox, width: contentWidth, x: inset },
        gap,
        enforceMinFont: false,
      });
      ephemeralClusters.push({
        kind: "solo",
        id: item.cluster.id,
        layerIds: [...item.cluster.allLayerIds],
        placedRect: placed,
        anchor: item.anchor,
      });
      continue;
    }

    if (item.cluster.kind === "surface") {
      const placed = layoutSurfaceClusterAt({
        byId: args.byId,
        cluster: item.cluster,
        index,
        band,
        contentWidth,
        gap,
        target: placedBox,
        mode: item.mode,
        scale: item.scale,
      });
      ephemeralClusters.push({
        kind: item.cluster.kind,
        id: item.cluster.id,
        layerIds: [...item.cluster.allLayerIds],
        placedRect: placed,
        anchor: item.anchor,
      });
      continue;
    }

    if (item.cluster.kind === "preserve" || item.enforceMinFont === false) {
      const origin =
        item.cluster.kind === "solo" ? item.cluster.unit.bounds : item.cluster.bounds;
      const layerIds =
        item.cluster.kind === "solo" ? item.cluster.unit.layerIds : item.cluster.allLayerIds;
      const placed = layoutPreserveComposition({
        byId: args.byId,
        layerIds,
        origin,
        index,
        band,
        targetX: placedBox.x,
        targetY: placedBox.y,
        scale: item.scale,
        enforceMinFont: item.enforceMinFont,
      });
      ephemeralClusters.push({
        kind: item.cluster.kind === "preserve" ? "preserve" : "solo",
        id: item.cluster.id,
        layerIds: [...item.cluster.allLayerIds],
        reason: item.cluster.kind === "preserve" ? item.cluster.reason : undefined,
        placedRect: placed,
        anchor: item.anchor,
      });
      continue;
    }

    const placed = layoutSoloUnitAt({
      byId: args.byId,
      unit: item.cluster.unit,
      index,
      band,
      target: placedBox,
      scale: item.scale,
    });
    ephemeralClusters.push({
      kind: "solo",
      id: item.cluster.id,
      layerIds: [...item.cluster.allLayerIds],
      placedRect: placed,
      anchor: item.anchor,
    });
  }

  return {
    sectionId: analysis.sectionId,
    sectionType,
    layoutRect,
    naturalHeight: layoutRect.height,
    clipRect: { ...layoutRect },
    backgroundLayerIds: [...analysis.background.backgroundLayerIds],
    backgroundFocals,
    ephemeralClusters,
  };
}

function layoutUniformMatrixPreserve(args: {
  byId: Map<string, FreehandObject>;
  layerIds: string[];
  index: SiteCreatorSelectionIndex;
  sourceWidth: number;
  sourceHeight: number;
  viewportWidth: number;
  targetY: number;
  band: ResponsiveBand;
}): number {
  const scale = args.viewportWidth / Math.max(1, args.sourceWidth);
  const cluster = boundsOfIds(args.layerIds, args.index);
  const originY = cluster?.y ?? 0;
  const originH = Math.max(1, cluster?.height ?? args.sourceHeight);
  layoutPreserveComposition({
    byId: args.byId,
    layerIds: args.layerIds,
    origin: { x: 0, y: originY, width: args.sourceWidth, height: originH },
    index: args.index,
    band: args.band,
    targetX: 0,
    targetY: args.targetY,
    scale,
    enforceMinFont: false,
  });
  return args.targetY + originH * scale;
}

/** @deprecated Hotfix: sustituido por layoutUniformMatrixPreserve (matriz única). */
function layoutUnorganizedPreserve(args: {
  byId: Map<string, FreehandObject>;
  layerIds: string[];
  index: SiteCreatorSelectionIndex;
  band: ResponsiveBand;
  viewportWidth: number;
  yCursor: number;
}): number {
  const inset = insetForBand(args.band);
  const gap = gapForBand(args.band);
  const contentWidth = Math.max(80, args.viewportWidth - inset * 2);

  const units = buildUnorganizedPresentationUnits({
    layerIds: args.layerIds,
    index: args.index,
  });
  let { clusters } = buildResponsiveVisualClusters({
    units,
    index: args.index,
  });

  // Si hay relación fuerte surface+contenido y el clustering los separó, forzar preserve conjunto.
  if (clusters.length >= 2) {
    const shapeLike = units.filter(
      (u) =>
        u.kind === "layer" &&
        u.layerIds.length === 1 &&
        (args.index.byId[u.layerIds[0]!]?.type === "rect" ||
          args.index.byId[u.layerIds[0]!]?.type === "ellipse" ||
          args.index.byId[u.layerIds[0]!]?.type === "path"),
    );
    const contentLike = units.filter((u) => !shapeLike.some((s) => s.id === u.id));
    for (const surface of shapeLike) {
      for (const content of contentLike) {
        if (
          strongSurfaceContentRelation({
            surfaceBounds: surface.bounds,
            contentBounds: content.bounds,
            surfaceZ: surface.zOrder,
            contentZ: content.zOrder,
          })
        ) {
          const pairIds = new Set([...surface.layerIds, ...content.layerIds]);
          const rest = clusters.filter(
            (c) => !c.allLayerIds.some((id) => pairIds.has(id)),
          );
          const bounds = unionPageRects([surface.bounds, content.bounds]);
          if (bounds) {
            clusters = [
              {
                kind: "preserve",
                id: `unorganized-preserve:${surface.id}+${content.id}`,
                reason: "unorganized-surface-content",
                units: [surface, content],
                bounds,
                allLayerIds: [...pairIds],
              },
              ...rest,
            ];
          }
        }
      }
    }
  }

  // Fallback seguro: si no hay clusters, preserve de todas las capas juntas.
  if (clusters.length === 0 && args.layerIds.length > 0) {
    const bounds = boundsOfIds(args.layerIds, args.index);
    if (bounds) {
      clusters = [
        {
          kind: "preserve",
          id: "unorganized-all",
          reason: "unorganized-fallback-preserve",
          units,
          bounds,
          allLayerIds: [...args.layerIds],
        },
      ];
    }
  }

  const ordered = [...clusters].sort((a, b) => {
    const dy = a.bounds.y - b.bounds.y;
    if (Math.abs(dy) > 0.5) return dy;
    return a.bounds.x - b.bounds.x;
  });

  const placedIds = new Set<string>();
  let y = args.yCursor + inset;
  for (const cluster of ordered) {
    const scale = Math.min(1, contentWidth / Math.max(1, cluster.bounds.width));
    const w = cluster.bounds.width * scale;
    const x = inset + (contentWidth - w) / 2;
    layoutPreserveComposition({
      byId: args.byId,
      layerIds: cluster.allLayerIds,
      origin: cluster.bounds,
      index: args.index,
      band: args.band,
      targetX: x,
      targetY: y,
      scale,
      enforceMinFont: false,
    });
    cluster.allLayerIds.forEach((id) => placedIds.add(id));
    const h = cluster.bounds.height * scale;
    y += h + gap;
  }

  // Invariante: ninguna capa visible sin colocar.
  const missing = args.layerIds.filter((id) => !placedIds.has(id) && args.byId.has(id));
  if (missing.length > 0) {
    const bounds = boundsOfIds(missing, args.index);
    if (bounds) {
      const scale = Math.min(1, contentWidth / Math.max(1, bounds.width));
      const w = bounds.width * scale;
      const x = inset + (contentWidth - w) / 2;
      layoutPreserveComposition({
        byId: args.byId,
        layerIds: missing,
        origin: bounds,
        index: args.index,
        band: args.band,
        targetX: x,
        targetY: y,
        scale,
        enforceMinFont: false,
      });
      y += bounds.height * scale + gap;
    }
  }

  return ordered.length || missing.length ? y - gap + inset : args.yCursor;
}

function walkObjects(objs: FreehandObject[], byId: Map<string, FreehandObject>): void {
  for (const o of objs) {
    byId.set(o.id, o);
    if (o.type === "groupContainer" || o.type === "booleanGroup") {
      walkObjects((o as { children?: FreehandObject[] }).children ?? [], byId);
    } else if (o.type === "clippingContainer") {
      const c = o as { mask?: FreehandObject; content?: FreehandObject[] };
      if (c.mask) walkObjects([c.mask], byId);
      walkObjects(c.content ?? [], byId);
    }
  }
}

function maxRight(page: DesignerPageState): number {
  let max = 0;
  const visit = (objs: FreehandObject[]) => {
    for (const o of objs) {
      max = Math.max(max, o.x + o.width);
      if (o.type === "groupContainer" || o.type === "booleanGroup") {
        visit((o as { children?: FreehandObject[] }).children ?? []);
      } else if (o.type === "clippingContainer") {
        const c = o as { mask?: FreehandObject; content?: FreehandObject[] };
        if (c.mask) visit([c.mask]);
        visit(c.content ?? []);
      }
    }
  };
  visit(page.objects ?? []);
  return max;
}

function shiftSectionContentY(args: {
  byId: Map<string, FreehandObject>;
  blueprint: SiteBlueprintV1;
  index: SiteCreatorSelectionIndex;
  sectionId: string;
  backgroundLayerIds: string[];
  deltaY: number;
}): void {
  if (!(Math.abs(args.deltaY) > 0.01)) return;
  const backgroundRoots = new Set(
    args.backgroundLayerIds.map((id) => worldSpaceAncestorId(id, args.index)),
  );
  const shifted = new Set<string>();
  for (const id of collectSemanticCoverageLayerIds(args.blueprint, args.sectionId)) {
    const worldId = worldSpaceAncestorId(id, args.index);
    if (backgroundRoots.has(worldId) || shifted.has(worldId)) continue;
    if (!isWorldSpaceLayerId(worldId, args.index)) continue;
    const obj = args.byId.get(worldId);
    if (!obj || typeof obj.y !== "number") continue;
    obj.y += args.deltaY;
    shifted.add(worldId);
  }
}

/**
 * Resuelve la página de preview para un ancho dado.
 * `wide` → identidad. `tablet`/`mobile` → Automático con clusters visuales.
 */
function withLayoutGroupWidthModes(
  result: SiteCreatorResponsiveResolveResult,
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
  sectionViewport?: { viewportHeight?: number; expandViewportSections?: boolean },
): SiteCreatorResponsiveResolveResult {
  const laidOut = applyLayoutGroupWidthModes({
    page: result.displayPage,
    blueprint,
    index,
    viewportWidth: result.layout.layoutWidth,
    viewportHeight: result.layout.layoutHeight,
    band: result.band,
  });
  let page = laidOut.page;
  let layoutHeight = laidOut.layoutHeight;
  const expand = sectionViewport?.expandViewportSections !== false;
  const screenH = sectionViewport?.viewportHeight ?? result.layout.referenceHeight;
  if (result.band === "wide" && expand) {
    const sectioned = applySectionViewportHeights({
      page,
      blueprint,
      index,
      viewportHeight: screenH,
      band: "wide",
    });
    page = sectioned.page;
    layoutHeight = Math.max(layoutHeight, sectioned.layout.pageHeight);
  }
  if (page === result.displayPage && layoutHeight === result.layout.layoutHeight) {
    return result;
  }
  page.customWidth = result.layout.layoutWidth;
  page.customHeight = layoutHeight;
  return {
    ...result,
    displayPage: page,
    layout: { ...result.layout, layoutHeight },
  };
}

export function resolveSiteCreatorResponsiveDisplay(args: {
  page: DesignerPageState;
  blueprint: SiteBlueprintV1;
  referenceIndex: SiteCreatorSelectionIndex;
  viewportWidth: number;
  /** Alto vivo de la ventana en unidades de página. Ausente = alto del artboard. */
  viewportHeight?: number;
  /** false al publicar: el CSS usa 100dvh en vivo, sin congelar píxeles. */
  expandViewportSections?: boolean;
  /**
   * Fuerza la banda (editor en marco de dispositivo). Si falta, se infiere del ancho.
   * El CSS publicado sigue infiriendo por media query.
   */
  band?: ResponsiveBand;
}): SiteCreatorResponsiveResolveResult {
  const reference = getPageDimensions(args.page);
  const viewportWidth = clampViewportWidth(args.viewportWidth, reference.width);
  const band = args.band ?? bandForViewportWidth(viewportWidth, reference.width);
  const sectionViewport = {
    viewportHeight: args.viewportHeight ?? reference.height,
    expandViewportSections: args.expandViewportSections !== false,
  };

  if (band === "wide") {
    const displayPage = deepCloneDesignerPageState(args.page);
    const sourceIds = collectVisibleLayerIdsFromPage(args.page);
    return withLayoutGroupWidthModes(
      {
        band,
        strategy: "identity",
        displayPage,
        layout: {
          referenceWidth: reference.width,
          referenceHeight: reference.height,
          viewportWidth,
          layoutWidth: reference.width,
          layoutHeight: reference.height,
          layoutScale: 1,
        },
        resolvedLayout: null,
        resolvedScene: buildResolvedSceneFromIndex({
          index: args.referenceIndex,
          matrix: uniformScaleMatrix(1),
          width: reference.width,
          height: reference.height,
          layerIds: sourceIds,
        }),
      },
      args.blueprint,
      args.referenceIndex,
      sectionViewport,
    );
  }

  const pageKind = classifyPageResponsiveKind(args.blueprint);

  const displayPage = deepCloneDesignerPageState(args.page);
  displayPage.objects = (displayPage.objects ?? []).map((o) => cloneObj(o));
  const byId = new Map<string, FreehandObject>();
  walkObjects(displayPage.objects, byId);

  const index = args.referenceIndex;

  // Página sin Hero/Section: una sola matriz proporcional para todo.
  if (pageKind === "page-unstructured") {
    const sourceIds = collectVisibleLayerIdsFromPage(args.page);
    const preserved = preservePageWithUniformMatrix({
      displayPage,
      sourceWidth: reference.width,
      sourceHeight: reference.height,
      viewportWidth,
    });
    const syntheticRegion: ResolvedResponsiveRegion = {
      sectionId: "__page__",
      sectionType: "generic",
      layoutRect: { x: 0, y: 0, width: viewportWidth, height: preserved.layoutHeight },
      naturalHeight: preserved.layoutHeight,
      clipRect: { x: 0, y: 0, width: viewportWidth, height: preserved.layoutHeight },
      backgroundLayerIds: [],
      backgroundFocals: {},
      ephemeralClusters: [],
    };
    if (band === "tablet" || band === "mobile") {
      applyResponsiveContainerTunes({
        byId,
        blueprint: args.blueprint,
        index,
        band,
        regions: [syntheticRegion],
        viewportWidth,
      });
      applyResponsiveItemTunes({
        byId,
        blueprint: args.blueprint,
        index,
        band,
        regions: [syntheticRegion],
        viewportWidth,
      });
      applyResponsiveMediaTunes({
        byId,
        blueprint: args.blueprint,
        index,
        band,
        backgroundLayerIds: new Set(),
      });
    }
    const layoutHeight = Math.max(1, syntheticRegion.layoutRect.height);
    displayPage.customWidth = viewportWidth;
    displayPage.customHeight = layoutHeight;
    const resolvedScene = buildResolvedSceneFromIndex({
      index,
      matrix: preserved.matrix,
      width: viewportWidth,
      height: layoutHeight,
      layerIds: sourceIds,
    });
    const resolvedLayout: ResolvedResponsiveSiteLayout = {
      band,
      viewportWidth,
      pageRect: { x: 0, y: 0, width: viewportWidth, height: layoutHeight },
      regions: [syntheticRegion],
      objectClipById: {},
    };
    return withLayoutGroupWidthModes(
      {
        band,
        strategy: "uniform-preserve",
        displayPage,
        layout: {
          referenceWidth: reference.width,
          referenceHeight: reference.height,
          viewportWidth,
          layoutWidth: viewportWidth,
          layoutHeight,
          layoutScale: 1,
        },
        resolvedLayout,
        resolvedScene,
        debug: {
          sectionAnalyses: [],
          fallbackReasons: ["page-unstructured-matrix"],
          resolved: resolvedLayout,
        },
      },
      args.blueprint,
      args.referenceIndex,
      sectionViewport,
    );
  }

  const owned = new Set<string>();
  const sections = args.blueprint.rootChildIds
    .map((id) => args.blueprint.nodes[id])
    .filter((n): n is SiteBlueprintSectionNode => Boolean(n) && isSiteSectionNode(n))
    .sort((a, b) => a.sourceRange.top - b.sourceRange.top);

  const sectionAnalyses: SectionVisualAnalysis[] = [];
  const fallbackReasons: string[] = [];
  const regions: ResolvedResponsiveRegion[] = [];
  const objectClipById: Record<string, PageRect> = {};

  for (const section of sections) {
    for (const id of collectSemanticCoverageLayerIds(args.blueprint, section.id)) {
      owned.add(id);
      for (const ancestorId of index.byId[id]?.ancestorIds ?? []) {
        owned.add(ancestorId);
      }
    }
  }

  let yCursor = 0;
  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i]!;
    const analysis = analyzeSectionVisualPresentation({
      blueprint: args.blueprint,
      sectionId: section.id,
      index,
    });
    if (!analysis) continue;
    sectionAnalyses.push(analysis);
    fallbackReasons.push(...analysis.fallbackReasons);
    const region = layoutSectionFromAnalysis({
      byId,
      analysis,
      blueprint: args.blueprint,
      index,
      band,
      viewportWidth,
      sourceWidth: reference.width,
      yCursor,
    });
    if (band === "tablet" || band === "mobile") {
      const sectionMode = resolveEffectiveResponsiveMode({
        blueprint: args.blueprint,
        target: { kind: "blueprintNode", nodeId: section.id },
        band,
        index,
      }).mode;
      if (sectionMode !== "preserve") {
        applyResponsiveContainerTunes({
          byId,
          blueprint: args.blueprint,
          index,
          band,
          regions: [region],
          viewportWidth,
        });
      }
    }
    region.naturalHeight = Math.max(1, region.layoutRect.height);
    regions.push(region);

    if (sectionViewport.expandViewportSections && (band === "tablet" || band === "mobile")) {
      const heightBand = band === "mobile" ? "mobile" : "tablet";
      const mode = sectionHeightModeForBand(args.blueprint, section, heightBand);
      let targetH: number | null = null;
      if (mode === "viewport") {
        targetH = Math.max(region.layoutRect.height, sectionViewport.viewportHeight);
      } else if (mode === "custom") {
        const custom = sectionCustomHeightForBand(args.blueprint, section, heightBand);
        if (custom != null) targetH = Math.max(region.layoutRect.height, custom);
      }
      if (targetH != null) {
        const extra = Math.max(0, targetH - region.layoutRect.height);
        if (extra > 0.5) {
          shiftSectionContentY({
            byId,
            blueprint: args.blueprint,
            index,
            sectionId: section.id,
            backgroundLayerIds: region.backgroundLayerIds,
            deltaY: extra / 2,
          });
          region.layoutRect = { ...region.layoutRect, height: region.layoutRect.height + extra };
          region.clipRect = { ...region.clipRect, height: region.clipRect.height + extra };
          placeBackgroundLayers({
            byId,
            backgroundLayerIds: region.backgroundLayerIds,
            layoutRect: region.layoutRect,
            sourceRegion: analysis.containerBounds,
            index,
            blueprint: args.blueprint,
            band,
          });
        }
      }
    }

    // Clip de render: fondos + capas de cobertura de la región
    for (const layerId of collectSemanticCoverageLayerIds(args.blueprint, section.id)) {
      objectClipById[layerId] = { ...region.clipRect };
    }
    for (const bgId of region.backgroundLayerIds) {
      objectClipById[bgId] = { ...region.clipRect };
    }

    yCursor = region.layoutRect.y + region.layoutRect.height;
    if (i < sections.length - 1) yCursor += TOP_LEVEL_REGION_GAP;
  }

  if (band === "tablet" || band === "mobile") {
    applyResponsiveItemTunes({
      byId,
      blueprint: args.blueprint,
      index,
      band,
      regions: regions.map((r) => ({
        sectionId: r.sectionId,
        layoutRect: r.layoutRect,
        clipRect: r.clipRect,
      })),
      viewportWidth,
    });
    const backgroundLayerIds = new Set<string>();
    for (const region of regions) {
      for (const id of region.backgroundLayerIds) backgroundLayerIds.add(id);
    }
    applyResponsiveMediaTunes({
      byId,
      blueprint: args.blueprint,
      index,
      band,
      backgroundLayerIds,
    });
  }

  const unorganized = index.entries
    .filter(
      (e) =>
        e.visible &&
        e.selectableFromCanvas &&
        !owned.has(e.layerId) &&
        e.parentLayerId == null &&
        e.type !== "adjustmentLayer",
    )
    .map((e) => e.layerId);

  if (unorganized.length > 0) {
    fallbackReasons.push("unorganized-uniform-matrix");
    yCursor = layoutUniformMatrixPreserve({
      byId,
      layerIds: unorganized,
      index,
      sourceWidth: reference.width,
      sourceHeight: reference.height,
      viewportWidth,
      targetY: yCursor,
      band,
    });
  }

  const layoutHeight = Math.max(1, yCursor);
  displayPage.customWidth = viewportWidth;
  displayPage.customHeight = layoutHeight;

  const scale = viewportWidth / Math.max(1, reference.width);
  const sourceIds = collectVisibleLayerIdsFromPage(args.page);
  const resolvedScene = buildResolvedSceneFromIndex({
    index,
    matrix: uniformScaleMatrix(scale, 0, 0),
    width: viewportWidth,
    height: layoutHeight,
    layerIds: sourceIds,
  });

  const resolvedLayout: ResolvedResponsiveSiteLayout = {
    band,
    viewportWidth,
    pageRect: { x: 0, y: 0, width: viewportWidth, height: layoutHeight },
    regions,
    objectClipById,
  };

  return withLayoutGroupWidthModes(
    {
      band,
      strategy: "auto",
      displayPage,
      layout: {
        referenceWidth: reference.width,
        referenceHeight: reference.height,
        viewportWidth,
        layoutWidth: viewportWidth,
        layoutHeight,
        layoutScale: 1,
      },
      resolvedLayout,
      resolvedScene,
      debug: { sectionAnalyses, fallbackReasons, resolved: resolvedLayout },
    },
    args.blueprint,
    args.referenceIndex,
    sectionViewport,
  );
}

/** Helpers exportados para tests de geometría. */
export function assertNoHorizontalOverflow(
  page: DesignerPageState,
  viewportWidth: number,
  ignoreLayerIds?: Iterable<string>,
): boolean {
  const ignore = new Set(ignoreLayerIds ?? []);
  let max = 0;
  const visit = (objs: FreehandObject[]) => {
    for (const o of objs) {
      if (!ignore.has(o.id)) {
        max = Math.max(max, o.x + o.width);
      }
      if (o.type === "groupContainer" || o.type === "booleanGroup") {
        visit((o as { children?: FreehandObject[] }).children ?? []);
      } else if (o.type === "clippingContainer") {
        const c = o as { mask?: FreehandObject; content?: FreehandObject[] };
        if (c.mask) visit([c.mask]);
        visit(c.content ?? []);
      }
    }
  };
  visit(page.objects ?? []);
  return max <= viewportWidth + 0.75;
}

export function findDisplayObject(
  page: DesignerPageState,
  id: string,
): FreehandObject | undefined {
  const byId = new Map<string, FreehandObject>();
  walkObjects(page.objects ?? [], byId);
  return byId.get(id);
}

export { roughlyContained };
