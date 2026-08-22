/**
 * Adaptar un grupo al ancho de su contenedor, por vista.
 * Original: widthMode en el nodo; raíz → sección.
 * Tablet/móvil: containerTune de esa banda; nunca crea sección.
 */
import type { DesignerPageState } from "../designer/DesignerNode";
import type { FreehandObject } from "../FreehandStudio";
import { getPageDimensions } from "@/app/spaces/indesign/page-formats";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import {
  createSectionFromSelection,
  removeBlueprintNodePreservingContent,
  semanticNodeBounds,
  setLayoutGroupWidthMode,
  type BlueprintOpResult,
} from "./site-blueprint-ops";
import { cloneBlueprint } from "./site-blueprint-validate";
import { collectSemanticCoverageLayerIds, findLayerSemanticOwner } from "./site-blueprint-ownership";
import { type PageRect } from "./site-creator-coordinate-space";
import {
  collectVisualRowMates,
  coverageLayerIds,
  resolveLayoutGroupFitForBand,
} from "./site-creator-group-width-layout";
import { applyNewSectionResponsiveDefaults } from "./site-creator-section-defaults";
import { patchContainerTune } from "./site-creator-responsive-tunes";
import type { ResponsiveBandLike } from "./site-creator-responsive-overrides";
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import type {
  LayoutGroupFitOrigin,
  LayoutGroupWidthMode,
  SiteBlueprintLayoutGroupNode,
  SiteBlueprintV1,
} from "./site-creator-types";
import { isSiteSectionNode } from "./site-creator-types";
import { mirrorContainerLayerIdFromNode } from "./site-creator-designer-group-bootstrap";
import type { SiteCreatorViewportBand } from "./site-creator-viewport";

export type GroupFitMode = "full" | "scale";

export function fitLayoutBandFromViewport(band: SiteCreatorViewportBand): ResponsiveBandLike {
  if (band === "tablet") return "tablet";
  if (band === "mobile") return "mobile";
  return "wide";
}

export type GroupFitOpportunity = {
  groupId: string;
  bounds: PageRect;
  parentRect: PageRect;
  hasLeft: boolean;
  hasRight: boolean;
  fitted: { mode: "full" | "scale"; origin: "start" | "end" } | null;
  showSideLeft: boolean;
  showSideRight: boolean;
  showScaleLeft: boolean;
  showScaleRight: boolean;
  showRestoreLeft: boolean;
  showRestoreRight: boolean;
  willPromoteSection: boolean;
  previewFill: PageRect;
  previewScale: PageRect;
  previewRestore: PageRect;
};

function indexAsById(index: SiteCreatorSelectionIndex): Map<string, FreehandObject> {
  const byId = new Map<string, FreehandObject>();
  for (const entry of index.entries) {
    const b = entry.visualBounds;
    byId.set(entry.layerId, {
      id: entry.layerId,
      type: entry.type,
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
    } as FreehandObject);
  }
  return byId;
}

export function fitParentRect(args: {
  blueprint: SiteBlueprintV1;
  groupId: string;
  index: SiteCreatorSelectionIndex;
  pageWidth: number;
  pageHeight: number;
}): PageRect {
  const group = args.blueprint.nodes[args.groupId];
  const parentId = group?.parentId ?? null;
  if (parentId) {
    const parent = args.blueprint.nodes[parentId];
    if (parent?.kind === "layoutGroup") {
      const bounds = semanticNodeBounds(args.blueprint, parentId, args.index);
      if (bounds) return bounds;
    }
    if (parent && isSiteSectionNode(parent)) {
      return {
        x: 0,
        y: parent.sourceRange.top,
        width: args.pageWidth,
        height: Math.max(1, parent.sourceRange.bottom - parent.sourceRange.top),
      };
    }
  }
  return { x: 0, y: 0, width: args.pageWidth, height: args.pageHeight };
}

export function resolveLayoutGroupFromHover(args: {
  blueprint: SiteBlueprintV1;
  index: SiteCreatorSelectionIndex;
  hoverLayerId: string | null;
  selectedGroupId?: string | null;
}): SiteBlueprintLayoutGroupNode | null {
  if (args.hoverLayerId) {
    const owner = findLayerSemanticOwner(args.blueprint, args.hoverLayerId, args.index);
    if (owner?.kind === "layoutGroup") return owner;
    const direct = args.blueprint.nodes[args.hoverLayerId];
    if (direct?.kind === "layoutGroup") return direct;
  }
  if (args.selectedGroupId) {
    const node = args.blueprint.nodes[args.selectedGroupId];
    if (node?.kind === "layoutGroup") return node;
  }
  return null;
}

export function describeGroupFitOpportunity(args: {
  blueprint: SiteBlueprintV1;
  groupId: string;
  index: SiteCreatorSelectionIndex;
  page: DesignerPageState;
  band?: ResponsiveBandLike;
  viewportWidth?: number;
}): GroupFitOpportunity | null {
  const group = args.blueprint.nodes[args.groupId];
  if (!group || group.kind !== "layoutGroup") return null;
  const dims = getPageDimensions(args.page);
  const viewportWidth = args.viewportWidth ?? dims.width;
  const band = args.band ?? "wide";
  const bounds = semanticNodeBounds(args.blueprint, group.id, args.index);
  if (!bounds || bounds.width < 1) return null;
  const parentRect = fitParentRect({
    blueprint: args.blueprint,
    groupId: group.id,
    index: args.index,
    pageWidth: viewportWidth,
    pageHeight: dims.height,
  });
  const fitted = resolveLayoutGroupFitForBand(args.blueprint, group, band);
  const sourceBounds =
    semanticNodeBounds(args.blueprint, group.id, buildSiteSelectionIndex(args.page)) ?? bounds;
  const pageScale = viewportWidth / Math.max(1, dims.width);
  const ids = coverageLayerIds(args.blueprint, group.id, args.index);
  const byId = indexAsById(args.index);
  const mates = collectVisualRowMates({
    blueprint: args.blueprint,
    group,
    byId,
    index: args.index,
    origin: bounds,
    parentRect,
    groupLayerIds: new Set(ids),
  });
  const hasLeft = mates.some((m) => m.bounds.x + m.bounds.width <= bounds.x + 8 || m.bounds.x < bounds.x - 4);
  const hasRight = mates.some(
    (m) => m.bounds.x >= bounds.x + bounds.width - 8 || m.bounds.x + 4 > bounds.x + bounds.width,
  );
  const alone = !hasLeft && !hasRight;
  const gap = Math.max(8, parentRect.width * 0.04);
  const canGrow = parentRect.width - bounds.width >= gap;
  const roomLeft = bounds.x >= parentRect.x + gap;
  const roomRight = bounds.x + bounds.width <= parentRect.x + parentRect.width - gap;
  const scale = parentRect.width / Math.max(1, bounds.width);
  const natural = {
    x: sourceBounds.x * pageScale,
    y: sourceBounds.y * pageScale,
    width: Math.max(1, sourceBounds.width * pageScale),
    height: Math.max(1, sourceBounds.height * pageScale),
  };
  const restoreX =
    fitted?.origin === "end" ? parentRect.x + parentRect.width - natural.width : natural.x;
  return {
    groupId: group.id,
    bounds,
    parentRect,
    hasLeft,
    hasRight,
    fitted,
    showSideLeft: Boolean(!fitted && canGrow && (hasLeft || (alone && roomLeft))),
    showSideRight: Boolean(!fitted && canGrow && (hasRight || (alone && roomRight))),
    showScaleLeft: Boolean(!fitted && canGrow && (hasLeft || alone)),
    showScaleRight: Boolean(!fitted && canGrow && (hasRight || alone)),
    showRestoreLeft: Boolean(fitted && fitted.origin === "end"),
    showRestoreRight: Boolean(fitted && fitted.origin === "start"),
    willPromoteSection: band === "wide" && group.parentId == null,
    previewFill: {
      x: parentRect.x,
      y: bounds.y,
      width: parentRect.width,
      height: bounds.height,
    },
    previewScale: {
      x: parentRect.x,
      y: bounds.y,
      width: parentRect.width,
      height: Math.max(1, bounds.height * scale),
    },
    previewRestore: {
      x: restoreX,
      y: natural.y,
      width: natural.width,
      height: natural.height,
    },
  };
}

function markSectionPromoted(
  blueprint: SiteBlueprintV1,
  sectionId: string,
  groupId: string,
): SiteBlueprintV1 {
  const section = blueprint.nodes[sectionId];
  if (!section || !isSiteSectionNode(section)) return blueprint;
  const next = cloneBlueprint(blueprint);
  next.nodes[sectionId] = { ...section, promotedFromGroupId: groupId };
  return next;
}

function demotePromotedSection(
  blueprint: SiteBlueprintV1,
  groupId: string,
): BlueprintOpResult {
  const group = blueprint.nodes[groupId];
  if (!group || group.kind !== "layoutGroup" || !group.parentId) {
    return { ok: true, blueprint };
  }
  const parent = blueprint.nodes[group.parentId];
  if (!parent || !isSiteSectionNode(parent)) return { ok: true, blueprint };
  if (parent.promotedFromGroupId !== groupId) return { ok: true, blueprint };
  if (parent.childIds.length !== 1 || parent.childIds[0] !== groupId) {
    return { ok: true, blueprint };
  }
  return removeBlueprintNodePreservingContent(blueprint, parent.id);
}

function patchBandFitTune(
  blueprint: SiteBlueprintV1,
  group: SiteBlueprintLayoutGroupNode,
  band: "tablet" | "mobile",
  patch: Partial<{ contentWidthMode: "full" | "scale"; fitOrigin: LayoutGroupFitOrigin }>,
): SiteBlueprintV1 {
  let next = patchContainerTune({
    blueprint,
    target: { kind: "blueprintNode", nodeId: group.id },
    band,
    patch,
  }).blueprint;
  const containerId = mirrorContainerLayerIdFromNode(group);
  if (containerId) {
    next = patchContainerTune({
      blueprint: next,
      target: { kind: "designerGroup", layerId: containerId },
      band,
      patch,
    }).blueprint;
  }
  return next;
}

function clearBandFitTune(
  blueprint: SiteBlueprintV1,
  group: SiteBlueprintLayoutGroupNode,
  band: "tablet" | "mobile",
): SiteBlueprintV1 {
  return patchBandFitTune(blueprint, group, band, {
    contentWidthMode: undefined,
    fitOrigin: undefined,
  });
}

export function applyGroupFitToContainer(args: {
  blueprint: SiteBlueprintV1;
  groupId: string;
  mode: LayoutGroupWidthMode;
  origin?: LayoutGroupFitOrigin;
  index: SiteCreatorSelectionIndex;
  page: DesignerPageState;
  band?: ResponsiveBandLike;
}): BlueprintOpResult {
  const group = args.blueprint.nodes[args.groupId];
  if (!group || group.kind !== "layoutGroup") {
    return { ok: false, code: "invalid_target", message: "Selecciona un grupo." };
  }
  const band = args.band ?? "wide";

  if (band === "tablet" || band === "mobile") {
    if (args.mode === "content") {
      return { ok: true, blueprint: clearBandFitTune(args.blueprint, group, band) };
    }
    const contentWidthMode = args.mode === "scale" ? "scale" : "full";
    const origin = args.origin === "end" ? "end" : "start";
    return {
      ok: true,
      blueprint: patchBandFitTune(args.blueprint, group, band, {
        contentWidthMode,
        fitOrigin: origin,
      }),
    };
  }

  if (args.mode === "content") {
    const cleared = setLayoutGroupWidthMode(args.blueprint, args.groupId, "content");
    if (!cleared.ok) return cleared;
    return demotePromotedSection(cleared.blueprint, args.groupId);
  }

  let blueprint = args.blueprint;
  if (group.parentId == null) {
    const coverage = collectSemanticCoverageLayerIds(blueprint, group.id);
    const created = createSectionFromSelection({
      blueprint,
      selectedLayerIds: coverage.length ? coverage : group.layerIds,
      index: args.index,
      committedPage: args.page,
      sectionType: "generic",
      label: "Sección",
    });
    if (created.ok && created.createdNodeId) {
      blueprint = markSectionPromoted(created.blueprint, created.createdNodeId, args.groupId);
      blueprint = applyNewSectionResponsiveDefaults(blueprint, created.createdNodeId);
    }
  }

  return setLayoutGroupWidthMode(blueprint, args.groupId, args.mode, args.origin);
}
