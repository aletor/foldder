/**
 * Alto de sección: contenido real o al menos el alto de página / ventana.
 * No reescribe el Designer; es presentación (lienzo + publicación).
 */
import type {
  ClippingContainerObject,
  FreehandObject,
  PathObject,
} from "../FreehandStudio";
import type { DesignerPageState } from "../designer/DesignerNode";
import { deepCloneDesignerPageState } from "./designer-source-snapshot";
import { listDocumentSections } from "./site-creator-section-scroll";
import { isWorldSpaceLayerId, worldSpaceAncestorId } from "./site-creator-layer-world-bounds";
import {
  collectSemanticCoverageLayerIds,
  findLayerSemanticOwner,
} from "./site-blueprint-ownership";
import type { PageRect } from "./site-creator-coordinate-space";
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import type {
  SiteBlueprintNode,
  SiteBlueprintSectionNode,
  SiteBlueprintV1,
  SiteSectionHeightMode,
} from "./site-creator-types";
import { isResponsiveEditableBand, isSiteSectionNode } from "./site-creator-types";
import { resizeSectionCoverClip } from "./site-creator-clipping-resize";
import { transformPathObjectRelative } from "./site-creator-responsive-matrix";

const FIT_EPSILON = 8;

export type SectionHeightRange = {
  id: string;
  top: number;
  height: number;
  extra: number;
  fitted: boolean;
};

export type SectionHeightLayout = {
  viewportHeight: number;
  pageHeight: number;
  ranges: SectionHeightRange[];
};

export type SectionHeightOpportunity = {
  sectionId: string;
  bounds: PageRect;
  targetBounds: PageRect;
  restoreBounds: PageRect;
  fitted: boolean;
  showExpand: boolean;
  showRestore: boolean;
};

export function sectionHeightMode(node: SiteBlueprintSectionNode): SiteSectionHeightMode {
  if (node.heightMode === "viewport") return "viewport";
  if (node.heightMode === "custom" && typeof node.customHeight === "number" && node.customHeight > 0) {
    return "custom";
  }
  return "content";
}

export type SectionHeightBand = "wide" | "monitor" | "tablet" | "mobile";

function sectionTuneForBand(
  blueprint: SiteBlueprintV1,
  sectionId: string,
  band: "monitor" | "tablet" | "mobile",
): { heightMode?: SiteSectionHeightMode; customHeight?: number } | null {
  const rules = blueprint.responsive?.containerTunes ?? [];
  for (const rule of rules) {
    if (rule.target.kind !== "blueprintNode" || rule.target.nodeId !== sectionId) continue;
    const tune = rule.byBand[band];
    if (!tune) continue;
    return {
      heightMode: tune.heightMode,
      customHeight: tune.customHeight,
    };
  }
  return null;
}

export function sectionCustomHeightForBand(
  blueprint: SiteBlueprintV1,
  section: SiteBlueprintSectionNode,
  band: SectionHeightBand = "wide",
): number | null {
  if (isResponsiveEditableBand(band)) {
    const tune = sectionTuneForBand(blueprint, section.id, band);
    if (tune?.heightMode === "custom" && typeof tune.customHeight === "number" && tune.customHeight > 0) {
      return Math.max(1, Math.round(tune.customHeight));
    }
    return null;
  }
  if (section.heightMode === "custom" && typeof section.customHeight === "number" && section.customHeight > 0) {
    return Math.max(1, Math.round(section.customHeight));
  }
  return null;
}

/** Hueco vertical de diseño entre dos secciones consecutivas, en px de Original. */
export function designedSectionGapPx(
  from: SiteBlueprintSectionNode,
  to: SiteBlueprintSectionNode,
): number {
  return Math.max(0, to.sourceRange.top - from.sourceRange.bottom);
}

/** Padding inferior de diseño: hueco del sourceRange bajo el contenido. */
export function designedSectionBottomPaddingPx(
  section: SiteBlueprintSectionNode,
  contentBounds: { y: number; height: number },
): number {
  return Math.max(0, section.sourceRange.bottom - (contentBounds.y + contentBounds.height));
}

/** Padding superior de diseño: hueco del sourceRange sobre el contenido. */
export function designedSectionTopPaddingPx(
  section: SiteBlueprintSectionNode,
  contentBounds: { y: number; height: number },
): number {
  return Math.max(0, contentBounds.y - section.sourceRange.top);
}

export function clampSectionSourceRangeBottom(args: {
  contentBottom: number;
  nextSectionTop: number | null;
  pageHeight: number;
  requestedBottom: number;
}): number {
  const minBottom = args.contentBottom;
  const maxBottom =
    args.nextSectionTop != null
      ? Math.min(args.pageHeight, args.nextSectionTop)
      : args.pageHeight;
  const hi = Math.max(minBottom, maxBottom);
  return Math.round(
    Math.min(hi, Math.max(minBottom, args.requestedBottom)),
  );
}

export function scaleOriginalPxToBand(
  px: number,
  viewportWidth: number,
  sourceWidth: number,
): number {
  return Math.max(0, px) * (Math.max(1, viewportWidth) / Math.max(1, sourceWidth));
}

export function scaledDesignedSectionGap(
  from: SiteBlueprintSectionNode,
  to: SiteBlueprintSectionNode,
  viewportWidth: number,
  sourceWidth: number,
): number {
  return Math.round(scaleOriginalPxToBand(designedSectionGapPx(from, to), viewportWidth, sourceWidth));
}

/**
 * Alto objetivo en tablet/móvil: custom de esa banda, o el custom de Original
 * escalado si la banda no tiene override. Viewport solo se congela en el editor.
 */
export function resolveBandSectionTargetHeight(args: {
  blueprint: SiteBlueprintV1;
  section: SiteBlueprintSectionNode;
  band: SectionHeightBand;
  contentHeight: number;
  viewportHeight: number;
  layoutScale: number;
  expandViewportSections: boolean;
}): number {
  let target = Math.max(1, args.contentHeight);
  const mode = sectionHeightModeForBand(args.blueprint, args.section, args.band);
  if (mode === "viewport") {
    if (args.expandViewportSections) {
      target = Math.max(target, Math.max(1, args.viewportHeight));
    }
    return target;
  }
  if (mode === "custom") {
    const custom = sectionCustomHeightForBand(args.blueprint, args.section, args.band);
    if (custom != null) return Math.max(target, custom);
    return target;
  }
  if (sectionHeightMode(args.section) === "custom") {
    const wideCustom = args.section.customHeight;
    if (typeof wideCustom === "number" && wideCustom > 0) {
      target = Math.max(target, wideCustom * Math.max(0, args.layoutScale));
    }
  }
  return target;
}

export function sectionHeightModeForBand(
  blueprint: SiteBlueprintV1,
  section: SiteBlueprintSectionNode,
  band: SectionHeightBand = "wide",
): SiteSectionHeightMode {
  if (isResponsiveEditableBand(band)) {
    const tune = sectionTuneForBand(blueprint, section.id, band);
    if (tune?.heightMode === "viewport") return "viewport";
    if (
      tune?.heightMode === "custom" &&
      typeof tune.customHeight === "number" &&
      tune.customHeight > 0
    ) {
      return "custom";
    }
    return "content";
  }
  return sectionHeightMode(section);
}

export function blueprintHasViewportSection(
  blueprint: SiteBlueprintV1,
  band?: SectionHeightBand,
): boolean {
  const bands: SectionHeightBand[] = band ? [band] : ["wide", "monitor", "tablet", "mobile"];
  return listDocumentSections(blueprint).some((section) =>
    bands.some((item) => sectionHeightModeForBand(blueprint, section, item) === "viewport"),
  );
}

function sectionDesignedHeight(section: SiteBlueprintSectionNode): number {
  return Math.max(1, section.sourceRange.bottom - section.sourceRange.top);
}

function sectionResolvedHeight(
  blueprint: SiteBlueprintV1,
  section: SiteBlueprintSectionNode,
  band: SectionHeightBand,
  viewportHeight: number,
): { height: number; extra: number; fitted: boolean; mode: SiteSectionHeightMode } {
  const designed = sectionDesignedHeight(section);
  const mode = sectionHeightModeForBand(blueprint, section, band);
  if (mode === "viewport") {
    const height = Math.max(designed, Math.max(1, viewportHeight));
    return { height, extra: Math.max(0, height - designed), fitted: true, mode };
  }
  if (mode === "custom") {
    const custom = sectionCustomHeightForBand(blueprint, section, band) ?? designed;
    const height = Math.max(designed, custom);
    return { height, extra: Math.max(0, height - designed), fitted: false, mode };
  }
  return { height: designed, extra: 0, fitted: false, mode };
}

export function planSectionHeightLayout(
  blueprint: SiteBlueprintV1,
  viewportHeight: number,
  band: SectionHeightBand = "wide",
): SectionHeightLayout {
  const screen = Math.max(1, viewportHeight);
  const sections = listDocumentSections(blueprint);
  const ranges: SectionHeightRange[] = [];
  let shift = 0;
  let pageHeight = screen;
  for (const section of sections) {
    const resolved = sectionResolvedHeight(blueprint, section, band, screen);
    const top = section.sourceRange.top + shift;
    ranges.push({
      id: section.id,
      top,
      height: resolved.height,
      extra: resolved.extra,
      fitted: resolved.fitted,
    });
    shift += resolved.extra;
    pageHeight = Math.max(pageHeight, top + resolved.height);
  }
  return { viewportHeight: screen, pageHeight, ranges };
}

export function describeSectionHeightOpportunity(args: {
  blueprint: SiteBlueprintV1;
  sectionId: string;
  pageWidth: number;
  viewportHeight: number;
  band?: SectionHeightBand;
  /**
   * Recuadro visual de la sección en el lienzo (unión de capas).
   * Si `sourceRange` está inflado, la flecha debe anclarse aquí, no al rango.
   */
  visualRect?: PageRect | null;
}): SectionHeightOpportunity | null {
  const node = args.blueprint.nodes[args.sectionId];
  if (!node || !isSiteSectionNode(node)) return null;
  const layout = planSectionHeightLayout(args.blueprint, args.viewportHeight, args.band ?? "wide");
  const range = layout.ranges.find((item) => item.id === args.sectionId);
  if (!range) return null;
  const sourceDesigned = Math.max(1, node.sourceRange.bottom - node.sourceRange.top);
  const visualH = args.visualRect ? Math.max(1, args.visualRect.height) : sourceDesigned;
  const top = args.visualRect ? args.visualRect.y : range.top;
  const designed = visualH;
  const mode = sectionHeightModeForBand(args.blueprint, node, args.band ?? "wide");
  const customH = sectionCustomHeightForBand(args.blueprint, node, args.band ?? "wide");
  const currentH =
    mode === "custom" && customH != null
      ? Math.max(designed, customH)
      : range.fitted
        ? Math.max(designed, range.height)
        : designed;
  const canExpand = designed < args.viewportHeight - FIT_EPSILON;
  return {
    sectionId: args.sectionId,
    bounds: { x: 0, y: top, width: args.pageWidth, height: currentH },
    targetBounds: {
      x: 0,
      y: top,
      width: args.pageWidth,
      height: Math.max(currentH, args.viewportHeight),
    },
    restoreBounds: { x: 0, y: top, width: args.pageWidth, height: designed },
    fitted: range.fitted,
    showExpand: mode === "content" && canExpand,
    showRestore: mode === "viewport",
  };
}

function walkObjects(objs: FreehandObject[] | undefined, byId: Map<string, FreehandObject>): void {
  for (const obj of objs ?? []) {
    byId.set(obj.id, obj);
    if (obj.type === "groupContainer" || obj.type === "booleanGroup") {
      walkObjects((obj as { children?: FreehandObject[] }).children, byId);
    } else if (obj.type === "clippingContainer") {
      const clip = obj as { mask?: FreehandObject; content?: FreehandObject[] };
      if (clip.mask) walkObjects([clip.mask], byId);
      walkObjects(clip.content, byId);
    }
  }
}

export function applySectionViewportHeights(args: {
  page: DesignerPageState;
  blueprint: SiteBlueprintV1;
  index: SiteCreatorSelectionIndex;
  viewportHeight: number;
  band?: SectionHeightBand;
}): { page: DesignerPageState; layout: SectionHeightLayout } {
  const band = args.band ?? "wide";
  const layout = planSectionHeightLayout(args.blueprint, args.viewportHeight, band);
  if (!layout.ranges.some((range) => range.extra > 0.5)) {
    return { page: args.page, layout };
  }
  const page = deepCloneDesignerPageState(args.page);
  const byId = new Map<string, FreehandObject>();
  walkObjects(page.objects, byId);
  let acc = 0;
  const pageWidth = Math.max(1, page.customWidth ?? 1);
  for (const section of listDocumentSections(args.blueprint)) {
    const designed = Math.max(1, section.sourceRange.bottom - section.sourceRange.top);
    const mode = sectionHeightModeForBand(args.blueprint, section, band);
    const extra =
      mode === "viewport"
        ? Math.max(0, args.viewportHeight - designed)
        : mode === "custom"
          ? Math.max(0, (sectionCustomHeightForBand(args.blueprint, section, band) ?? designed) - designed)
          : 0;
    const designedBottom = section.sourceRange.bottom + acc;
    if (extra > 0.5) {
      const sectionWorldIds = new Set(
        collectSemanticCoverageLayerIds(args.blueprint, section.id).map((id) =>
          worldSpaceAncestorId(id, args.index),
        ),
      );
      for (const [id, obj] of byId) {
        if (!isWorldSpaceLayerId(id, args.index)) continue;
        const worldId = worldSpaceAncestorId(id, args.index);
        if (worldId !== id) continue;
        if (typeof obj.y !== "number") continue;
        if (obj.y + 0.5 >= designedBottom) {
          obj.y += extra;
        } else if (
          sectionWorldIds.has(id) &&
          typeof obj.height === "number" &&
          typeof obj.width === "number" &&
          obj.y < designedBottom &&
          obj.y + obj.height >= designedBottom - 4 &&
          obj.width >= pageWidth * 0.8
        ) {
          if (obj.type === "clippingContainer") {
            resizeSectionCoverClip(obj as ClippingContainerObject, {
              x: obj.x,
              y: obj.y,
              width: obj.width,
              height: obj.height + extra,
            });
          } else {
            if (obj.type === "path") {
              transformPathObjectRelative(
                obj as PathObject,
                {
                  x: obj.x,
                  y: obj.y,
                  width: obj.width,
                  height: obj.height,
                },
                {
                  x: obj.x,
                  y: obj.y,
                  scaleX: 1,
                  scaleY: (obj.height + extra) / Math.max(1, obj.height),
                },
              );
            }
            obj.height = Math.max(1, obj.height + extra);
          }
        } else if (sectionWorldIds.has(id)) {
          obj.y += extra / 2;
        }
      }
    }
    acc += extra;
  }
  page.customHeight = layout.pageHeight;
  return { page, layout };
}

export function sectionDisplayTop(
  blueprint: SiteBlueprintV1,
  sectionId: string,
  viewportHeight: number,
  band: SectionHeightBand = "wide",
): number | null {
  const range = planSectionHeightLayout(blueprint, viewportHeight, band).ranges.find((item) => item.id === sectionId);
  return range?.top ?? null;
}

export type SectionScrollStationPoint = {
  id: string;
  y: number;
  height: number;
  /** Mínimo natural de la banda antes de ampliar viewport/custom. */
  naturalHeight: number;
};

/** Tops de sección en el espacio del display (tablet/móvil = regiones; Original = plan). */
export function sectionScrollStationsFromDisplay(args: {
  blueprint: SiteBlueprintV1;
  viewportHeight: number;
  band: SectionHeightBand;
  regions?: {
    sectionId: string;
    layoutRect: { y: number; height: number };
    naturalHeight?: number;
  }[] | null;
}): SectionScrollStationPoint[] {
  const sections = listDocumentSections(args.blueprint);
  if (args.regions && args.regions.length > 0) {
    return sections.map((section) => {
      const region = args.regions!.find((item) => item.sectionId === section.id);
      if (region) {
        return {
          id: section.id,
          y: region.layoutRect.y,
          height: region.layoutRect.height,
          naturalHeight: Math.max(1, region.naturalHeight ?? region.layoutRect.height),
        };
      }
      const range = planSectionHeightLayout(args.blueprint, args.viewportHeight, args.band).ranges.find(
        (item) => item.id === section.id,
      );
      return {
        id: section.id,
        y: range?.top ?? section.sourceRange.top,
        height: range?.height ?? Math.max(1, section.sourceRange.bottom - section.sourceRange.top),
        naturalHeight: Math.max(1, section.sourceRange.bottom - section.sourceRange.top),
      };
    });
  }
  return planSectionHeightLayout(args.blueprint, args.viewportHeight, args.band).ranges.map((range) => ({
    id: range.id,
    y: range.top,
    height: range.height,
    naturalHeight: Math.max(1, range.height - range.extra),
  }));
}

/** Alto de ventana en unidades de página, según el marco visible actual (cambia con el resize). */
export function liveViewportHeightInPageUnits(args: {
  pageWidth: number;
  availableWidth: number;
  availableHeight: number;
}): number {
  const width = Math.max(1, args.availableWidth);
  const pageWidth = Math.max(1, args.pageWidth);
  return Math.max(1, args.availableHeight * (pageWidth / width));
}

function sectionIdFromNode(
  blueprint: SiteBlueprintV1,
  nodeId: string | null | undefined,
): string | null {
  if (!nodeId) return null;
  let current: SiteBlueprintNode | undefined = blueprint.nodes[nodeId];
  while (current) {
    if (isSiteSectionNode(current)) return current.id;
    current = current.parentId ? blueprint.nodes[current.parentId] : undefined;
  }
  return null;
}

/** Sección bajo selección o hover, incluyendo capas hijas. */
export function resolveSectionIdForHeightHandles(args: {
  blueprint: SiteBlueprintV1;
  index: SiteCreatorSelectionIndex;
  selectedNodeId?: string | null;
  selectedLayerId?: string | null;
  hoverNodeId?: string | null;
  hoverLayerId?: string | null;
}): string | null {
  const fromNode = (id?: string | null) => sectionIdFromNode(args.blueprint, id);
  const fromLayer = (layerId?: string | null) => {
    if (!layerId) return null;
    return fromNode(findLayerSemanticOwner(args.blueprint, layerId, args.index)?.id);
  };
  return (
    fromNode(args.selectedNodeId) ??
    fromLayer(args.selectedLayerId) ??
    fromNode(args.hoverNodeId) ??
    fromLayer(args.hoverLayerId)
  );
}
