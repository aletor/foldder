"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ExternalLink,
  Eye,
  Globe,
  Loader2,
  Monitor,
  RotateCcw,
  Smartphone,
  Square,
  Tablet,
  Trash2,
} from "lucide-react";
import { getPageDimensions } from "../indesign/page-formats";
import {
  FoldderStudioHeader,
  foldderStudioHeaderIconActionClassName,
} from "../FoldderStudioHeader";
import { SiteCreatorPreview } from "./SiteCreatorPreview";
import {
  SITE_CREATOR_SECTION_SPINE_GUTTER_PX,
  SITE_CREATOR_SECTION_SPINE_PAGE_GAP_PX,
} from "./SiteCreatorSectionSpine";
import { SITE_CREATOR_PAGE_INSET_RAIL_GUTTER_PX } from "./SiteCreatorPageInsetRail";
import {
  detectPageContentInsets,
  resolvePageInsetsForBand,
  scalePageInsets,
  setPageInsets,
} from "./site-creator-page-insets";
import {
  resolveMonitorMaxWidth,
  setMonitorMaxWidth,
} from "./site-creator-monitor-max-width";
import {
  SiteCreatorDeviceSelector,
  SiteCreatorOrientationToggle,
} from "./SiteCreatorDeviceSelector";
import {
  clampViewportWidth,
  computeFillWidthPreviewZoom,
  computeFitPreviewZoom,
  cycleViewportBand,
  defaultDeviceConfig,
  reserveDeviceFrameFitSize,
  resolveDeviceDimensions,
  resolveSiteCreatorDeviceChromeKind,
  siteCreatorDeviceChrome,
  SITE_CREATOR_DEFAULT_MONITOR_MAX_WIDTH,
  fitLayoutBandFromViewport,
  type SiteCreatorDeviceConfig,
  type SiteCreatorViewportBand,
} from "./site-creator-viewport";
import {
  resolveSiteCreatorResponsiveDisplay,
  bandForEditorDevice,
  previewResponsiveLayout,
} from "./site-creator-responsive";
import { countContainerReflowUnits } from "./site-creator-responsive-apply";
import {
  SiteCreatorAdaptationControl,
  adaptationButtonLabel,
} from "./SiteCreatorAdaptationControl";
import { resolveAdaptationCapability } from "./site-creator-adaptation-capability";
import {
  bandToEditable,
  editableBandResetLabel,
  isAdaptationEligibleUnit,
  isResponsiveTargetBroken,
  resolveEffectiveResponsiveMode,
  resolveResponsiveTarget,
  setResponsiveOverride,
  treeOverrideDotState,
  treeOverrideTooltip,
  listBrokenResponsiveTargets,
} from "./site-creator-responsive-overrides";
import {
  bandHasCustomizations,
  clearContainerTuneField,
  patchContainerTune,
  patchItemTune,
  patchMediaTune,
  reorderSiblingItems,
  resetItemToAuto,
  resetMediaToAuto,
  resetResponsiveBand,
  resolveContainerTune,
  isHiddenItemTune,
  isLayerHiddenInBand,
  itemTunePatchFromTransformDelta,
  itemRefKey,
  listTransformableItemTargets,
  resolveItemRef,
  resolveItemTune,
  resolveMediaTune,
  unitCustomizationDotState,
  unitCustomizationTooltip,
} from "./site-creator-responsive-tunes";
import { analyzeSectionVisualPresentation } from "./site-creator-responsive-visual";
import { unionPageRects } from "./site-creator-coordinate-space";
import {
  assignExplicitBackground,
  inferExplicitBackgroundCandidate,
  patchExplicitBackgroundCrop,
  resolveExplicitBackground,
  restoreExplicitBackground,
} from "./site-creator-background-assignment";
import { imageFrameTuneForSiteCreator } from "./site-creator-image-frame";
import { resolveItemTransformKind, type ItemTransformKind } from "./site-creator-text-frame";
import {
  isDesignerPageBackgroundLayer,
  patchPageBackgroundCrop,
  reconcilePageBackground,
  resolvePageBackgroundCss,
} from "./site-creator-page-background";
import { SiteCreatorChangeOriginDialog } from "./SiteCreatorChangeOriginDialog";
import { SiteCreatorOutlinePanel, expandPathForUnit } from "./SiteCreatorOutlinePanel";
import { SiteCreatorButtonLabelPrompt } from "./SiteCreatorSelectionToolbar";
import type {
  SiteCreatorClipImageEdit,
  SiteCreatorUnitOutline,
} from "./SiteCreatorSelectionSurface";
import type { SiteCreatorGhostOutline } from "./SiteCreatorSelectionOverlay";
import type { SiteCreatorMicrobarModel } from "./SiteCreatorObjectMicrobar";
import { SiteCreatorMultiCardControl } from "./SiteCreatorMultiCardControl";
import {
  SiteCreatorMultiCardDatasetOverlay,
  type ArmedDatasetChip,
} from "./SiteCreatorMultiCardDatasetOverlay";
import { SiteCreatorMediaPicker, type SiteCreatorMediaPickItem } from "./SiteCreatorMediaPicker";
import { findOwningMultiCardDisplay } from "./site-creator-multicard";
import { isMultiCardDatasetBound, usableDatasetLists } from "./site-creator-multicard-dataset";
import {
  clampMultiCardScrollIndex,
  easePower2InOut,
  MULTICARD_SCROLL_DURATION_MS,
  resolveMultiCardBandPresentation,
} from "./site-creator-multicard-layout";
import { createPortal } from "react-dom";
import {
  buildSiteCreatorPresentationTree,
  presentationBoundsForUnit,
  presentationDirectChildren,
  findPresentationNode,
  type SiteCreatorPresentationNode,
} from "./site-creator-presentation-tree";
import {
  resolveContextualModel,
  selectionContainsUnitInsideSection,
  unitStructureParentId,
  type SiteCreatorPrimaryAction,
} from "./site-creator-contextual-actions";
import { resolveSiteBlueprintReferenceState } from "./site-creator-blueprint-refs";
import { countSnapshotLayers } from "./designer-source-layers";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { strokePathOutlineBounds } from "./site-creator-stroke-path";
import {
  reduceSiteCreatorSelection,
  reconcileSelectionToIndex,
} from "./site-creator-selection-reducer";
import {
  EMPTY_SITE_CREATOR_SELECTION,
  type SiteCreatorSelectionAction,
  type SiteCreatorSelectionIndex,
  type SiteCreatorSelectionState,
} from "./site-creator-selection-types";
import {
  siteCreatorOriginStateLabel,
  type SiteCreatorOriginState,
} from "./site-creator-origin";
import type {
  DesignerSourceSnapshotV1,
  ResponsiveEditableBand,
  ResponsiveItemRef,
  ResponsiveMediaBand,
  ResponsiveVisibilityBand,
  SiteBlueprintV1,
  SiteCreatorPublishStateV1,
  SitePageInsetBandV1,
  SiteSectionHeightMode,
  SiteSectionScrollKind,
} from "./site-creator-types";
import { isResponsiveEditableBand, isSiteButtonNode, isSiteMultiCardNode, isSiteSectionNode, MULTICARD_COUNT_MAX } from "./site-creator-types";
import {
  collectPublishImageRefs,
  compilePublishedSite,
  publishAssetPlaceholder,
} from "./site-creator-publish-compile";
import type { DesignerPageState } from "../designer/DesignerNode";
import type { Dataset } from "../dataset/dataset-types";
import { FOLDDER_STUDIO_BODY_CLASS } from "../studio-node/studio-node-architecture";
import {
  canPersistSiteStructure,
  createBlueprintHistory,
  pushBlueprintHistory,
  redoBlueprintHistory,
  undoBlueprintHistory,
  type SiteBlueprintHistoryState,
} from "./site-blueprint-history";
import {
  collectSemanticCoverageLayerIds,
  countUnstructuredVisualLayers,
  findLayerSemanticOwner,
} from "./site-blueprint-ownership";
import {
  createButtonFromSelection,
  createLayoutGroupFromSelection,
  createGroupFromSelection,
  createMultiCardFromSelection,
  createSectionFromSelection,
  extractAccessibleLabelFromLayers,
  removeBlueprintNodePreservingContent,
  removeUnitsFromContainer,
  reparentUnitsToContainer,
  resolveButtonParent,
  semanticNodeBounds,
  setMultiCardCount,
  setMultiCardLayoutMode,
  setMultiCardSlotOverride,
  claimMultiCardDatasetList,
  setMultiCardSlotBinding,
  duplicateMultiCardCard,
  removeMultiCardCard,
  moveMultiCardCard,
  setSectionHeightMode,
  stretchSectionSourceRangeBottom,
  setSectionPinToTop,
} from "./site-blueprint-ops";
import { applyNewSectionResponsiveDefaults } from "./site-creator-section-defaults";
import { isUnitCanvasLocked, isUnitOwnCanvasLocked, setUnitCanvasLock } from "./site-creator-canvas-locks";
import type { SectionSpineStation } from "./SiteCreatorSectionSpine";
import {
  setSectionScrollHop,
  listDocumentSections,
  listSectionScrollHops,
} from "./site-creator-section-scroll";
import type { SectionHeightBand } from "./site-creator-section-height";
import {
  liveViewportHeightInPageUnits,
  sectionCustomHeightForBand,
  sectionHeightModeForBand,
  sectionScrollStationsFromDisplay,
} from "./site-creator-section-height";
import {
  collapseLayersToSelectionUnits,
  deriveBlueprintNodeDisplayLabel,
  deriveLayerDisplayLabel,
  layersToMarqueeSelectionUnits,
  MARQUEE_GROUP_BLOCK_MESSAGE,
  marqueeUnitsBlockGrouping,
  resolveDeviceItemClickUnit,
  resolveHoverScopeUnit,
  resolveInspectClickUnit,
  resolveRootClickUnit,
  sameSelectionUnit,
  toggleSelectionUnit,
  unitsToStructureLayerIds,
  type SiteCreatorSelectionUnit,
} from "./site-creator-display-labels";
import { moldLayerIdFromDisplay } from "./site-creator-multicard-ids";
import {
  containerDisplayLabel,
  isSemanticContainerNode,
} from "./site-creator-hierarchy";
import {
  dismissDesignerMirrorNode,
  isAutoDesignerMirrorNode,
} from "./site-creator-designer-group-dismiss";
import type { SiteBlueprintLayoutGroupNode } from "./site-creator-types";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";

const SITE_CREATOR_ACCENT = "#22d3ee";
const STALE_SYNC_MESSAGE = "Designer volvió a cambiar. Revisa la actualización de nuevo.";

export interface SiteCreatorStudioProps {
  nodeLabel: string;
  designerLabel: string | null;
  originState: SiteCreatorOriginState;
  snapshot: DesignerSourceSnapshotV1 | null;
  previewPage: DesignerPageState | null;
  blueprint: SiteBlueprintV1;
  candidateSnapshot: DesignerSourceSnapshotV1 | null;
  syncBusy?: boolean;
  syncErrorMessage?: string | null;
  onClose: () => void;
  onConfirmOriginChange: (reviewedCandidateHash: string) => void;
  onDismissSyncError: () => void;
  /** Una sola escritura atómica del Blueprint. */
  onBlueprintChange: (next: SiteBlueprintV1) => void;
  publish?: SiteCreatorPublishStateV1 | null;
  onPublishChange?: (next: SiteCreatorPublishStateV1 | null) => void;
  /** Inventario de imágenes de Foldder para overrides de MultiCard. */
  projectMedia?: SiteCreatorMediaPickItem[];
  /** Dataset vivo enchufado al nodo (catálogo MultiCard). */
  dataset?: Dataset | null;
}

function emptyStateMessage(originState: SiteCreatorOriginState): string {
  switch (originState) {
    case "no_source":
      return "Conecta Document de un Designer de una sola página para importar el diseño.";
    case "preparing":
      return "Preparando diseño importado…";
    case "incompatible_document":
      return "El Designer conectado debe tener exactamente una página.";
    case "different_source":
      return "Hay un diseño importado de otro Designer. Revisa la conexión antes de continuar.";
    case "source_disconnected":
      return "El Designer ya no está conectado. Se muestra la última versión importada.";
    default:
      return "Snapshot no disponible.";
  }
}

function selectionLooksEqual(a: SiteCreatorSelectionState, b: SiteCreatorSelectionState): boolean {
  return (
    a.hoverId === b.hoverId &&
    a.selectedIds.join("\0") === b.selectedIds.join("\0") &&
    a.isolationIds.join("\0") === b.isolationIds.join("\0")
  );
}

function isOriginStatusActionable(originState: SiteCreatorOriginState): boolean {
  return originState === "different_source";
}

function reconcileUnits(
  units: SiteCreatorSelectionUnit[],
  blueprint: SiteBlueprintV1,
  index: ReturnType<typeof buildSiteSelectionIndex> | null,
): SiteCreatorSelectionUnit[] {
  if (!index) return [];
  return units.filter((unit) => {
    if (unit.kind === "layer") return Boolean(index.byId[unit.layerId]);
    return Boolean(blueprint.nodes[unit.nodeId]);
  });
}

function unitOutlineKind(
  unit: SiteCreatorSelectionUnit,
  blueprint: SiteBlueprintV1,
): SiteCreatorUnitOutline["kind"] {
  if (unit.kind === "layer") return "layer";
  const node = blueprint.nodes[unit.nodeId];
  if (!node) return "layer";
  if (isSiteSectionNode(node)) return "section";
  if (isSiteButtonNode(node)) return "component";
  return "group";
}

function coverageHasDisplayLayer(coverage: Set<string>, layerId: string): boolean {
  if (coverage.has(layerId)) return true;
  const moldId = moldLayerIdFromDisplay(layerId);
  return moldId !== layerId && coverage.has(moldId);
}

function isImageLikeObject(object: { type?: string; imageFrameContent?: unknown } | undefined): boolean {
  if (!object) return false;
  return object.type === "image" || Boolean(object.imageFrameContent);
}

function slotKindFromObject(
  object: { type?: string; imageFrameContent?: unknown } | undefined,
): "text" | "image" | null {
  if (!object) return null;
  if (object.type === "text" || object.type === "textOnPath") return "text";
  if (isImageLikeObject(object)) return "image";
  return null;
}

function mediaItemsFromPage(page: DesignerPageState | null | undefined): SiteCreatorMediaPickItem[] {
  if (!page) return [];
  const out: SiteCreatorMediaPickItem[] = [];
  const visit = (objects: DesignerPageState["objects"] | undefined) => {
    for (const obj of objects ?? []) {
      const src =
        (obj as { src?: string }).src ||
        (obj as { imageFrameContent?: { src?: string } }).imageFrameContent?.src;
      if (typeof src === "string" && src.trim()) {
        const s3Key =
          tryExtractKnowledgeFilesKeyFromUrl(src) ??
          (obj as { s3Key?: string }).s3Key ??
          (obj as { imageFrameContent?: { s3Key?: string } }).imageFrameContent?.s3Key;
        out.push({
          id: obj.id,
          url: src,
          s3Key: typeof s3Key === "string" && s3Key.trim() ? s3Key : undefined,
          sourceLabel: obj.name && obj.name !== obj.id ? obj.name : "Diseño",
        });
      }
      if (obj.type === "groupContainer" || obj.type === "booleanGroup") {
        visit((obj as { children?: DesignerPageState["objects"] }).children);
      } else if (obj.type === "clippingContainer") {
        const clip = obj as { mask?: { id: string }; content?: DesignerPageState["objects"] };
        visit(clip.content);
      }
    }
  };
  visit(page.objects);
  return out;
}

function boundsForUnit(
  unit: SiteCreatorSelectionUnit,
  blueprint: SiteBlueprintV1,
  index: NonNullable<ReturnType<typeof buildSiteSelectionIndex>>,
): SiteCreatorUnitOutline["bounds"] | null {
  if (unit.kind === "blueprintNode") {
    return semanticNodeBounds(blueprint, unit.nodeId, index);
  }
  const geometric = index.byId[unit.layerId]?.visualBounds ?? null;
  if (!geometric) return null;
  const obj = index.byId[unit.layerId]?.object;
  return obj ? strokePathOutlineBounds(obj, geometric) : geometric;
}

function parentChoiceLabel(
  parentId: string | null,
  blueprint: SiteBlueprintV1,
  snapshot: DesignerSourceSnapshotV1 | null,
  index: NonNullable<ReturnType<typeof buildSiteSelectionIndex>> | null,
): string {
  if (parentId == null) return "En Página";
  const node = blueprint.nodes[parentId];
  if (!node) return "En Página";
  if (isSiteSectionNode(node) && node.sectionType === "hero") return "En Hero";
  if (isSiteSectionNode(node)) return "En Sección";
  if (node.kind === "layoutGroup") return "En Grupo";
  if (isSiteMultiCardNode(node)) return "En MultiCard";
  return `En ${deriveBlueprintNodeDisplayLabel(node, snapshot, index)}`;
}

function siblingItemRefs(
  unit: SiteCreatorSelectionUnit,
  tree: import("./site-creator-presentation-tree").SiteCreatorPresentationTree,
  blueprint: SiteBlueprintV1,
): ResponsiveItemRef[] {
  const walk = (
    nodes: import("./site-creator-presentation-tree").SiteCreatorPresentationNode[],
  ): import("./site-creator-presentation-tree").SiteCreatorPresentationNode[] | null => {
    for (const n of nodes) {
      if (n.unit && sameSelectionUnit(n.unit, unit)) return nodes;
      const inner = walk(n.children);
      if (inner) return inner;
    }
    return null;
  };
  const siblings = walk(tree.roots);
  if (!siblings) return [];
  const refs: ResponsiveItemRef[] = [];
  for (const n of siblings) {
    if (!n.unit) continue;
    const ref = resolveItemRef(n.unit, blueprint);
    if (ref) refs.push(ref);
  }
  return refs;
}

function selectionParentIsStacked(
  unit: SiteCreatorSelectionUnit,
  blueprint: SiteBlueprintV1,
  band: ResponsiveEditableBand,
  index: SiteCreatorSelectionIndex | null,
): boolean {
  if (unit.kind === "blueprintNode") {
    const parentId = blueprint.nodes[unit.nodeId]?.parentId;
    if (!parentId) return false;
    return (
      resolveEffectiveResponsiveMode({
        blueprint,
        target: { kind: "blueprintNode", nodeId: parentId },
        band,
        index,
      }).mode === "stack"
    );
  }
  for (const node of Object.values(blueprint.nodes)) {
    if (!isSiteSectionNode(node) && node.kind !== "layoutGroup" && !isSiteMultiCardNode(node)) continue;
    if (!node.layerIds.includes(unit.layerId)) continue;
    return (
      resolveEffectiveResponsiveMode({
        blueprint,
        target: { kind: "blueprintNode", nodeId: node.id },
        band,
        index,
      }).mode === "stack"
    );
  }
  return false;
}

function unitHiddenInCurrentBand(
  unit: SiteCreatorSelectionUnit,
  blueprint: SiteBlueprintV1,
  band: ResponsiveEditableBand,
): boolean {
  if (unit.kind === "blueprintNode") {
    return isHiddenItemTune(blueprint, { kind: "blueprintNode", nodeId: unit.nodeId }, band);
  }
  return isLayerHiddenInBand({ blueprint, layerId: unit.layerId, band });
}

function visibilityRefForUnit(
  unit: SiteCreatorSelectionUnit,
): ResponsiveItemRef {
  return unit.kind === "blueprintNode"
    ? { kind: "blueprintNode", nodeId: unit.nodeId }
    : { kind: "layer", layerId: unit.layerId };
}

export function SiteCreatorStudio({
  nodeLabel,
  designerLabel,
  originState,
  snapshot,
  previewPage,
  blueprint,
  candidateSnapshot,
  syncBusy = false,
  syncErrorMessage,
  onClose,
  onConfirmOriginChange,
  onDismissSyncError,
  onBlueprintChange,
  publish = null,
  onPublishChange,
  projectMedia = [],
  dataset = null,
}: SiteCreatorStudioProps) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.add(FOLDDER_STUDIO_BODY_CLASS);
    return () => document.body.classList.remove(FOLDDER_STUDIO_BODY_CLASS);
  }, []);

  const [previewZoom, setPreviewZoom] = useState(1);
  const [floatingHostEl, setFloatingHostEl] = useState<HTMLElement | null>(null);
  const setFloatingHostRef = useCallback((el: HTMLElement | null) => {
    setFloatingHostEl((prev) => (prev === el ? prev : el));
  }, []);
  const [viewportBand, setViewportBand] = useState<SiteCreatorViewportBand>("original");
  const [originalViewportWidth, setOriginalViewportWidth] = useState<number | null>(null);
  const [monitorDevice, setMonitorDevice] = useState<SiteCreatorDeviceConfig>(() => {
    const base = defaultDeviceConfig("monitor");
    return {
      ...base,
      sizeId: "custom",
      customWidth: SITE_CREATOR_DEFAULT_MONITOR_MAX_WIDTH,
    };
  });
  const [tabletDevice, setTabletDevice] = useState<SiteCreatorDeviceConfig>(() =>
    defaultDeviceConfig("tablet"),
  );
  const [mobileDevice, setMobileDevice] = useState<SiteCreatorDeviceConfig>(() =>
    defaultDeviceConfig("mobile"),
  );
  const [focalLayerId, setFocalLayerId] = useState<string | null>(null);
  const [clipImageEditTarget, setClipImageEditTarget] = useState<{
    kind: "clip" | "imageFrame";
    clipId: string;
    imageId: string;
    band: ResponsiveMediaBand;
    initialFocal?: { x: number; y: number };
    initialZoom?: number;
  } | null>(null);
  const [clipImageDraft, setClipImageDraft] = useState<{
    imageId: string;
    band: ResponsiveMediaBand;
    focal: { x: number; y: number };
    zoom: number;
  } | null>(null);
  const [transformLiveDraft, setTransformLiveDraft] = useState<{
    delta: { dx: number; dy: number; dw: number; dh: number };
    band: ResponsiveEditableBand;
    items: Array<{
      target: ResponsiveItemRef;
      startBounds: { x: number; y: number; width: number; height: number };
      kind: ItemTransformKind;
    }>;
  } | null>(null);
  const transformLiveRafRef = useRef<number | null>(null);
  const transformLivePendingRef = useRef<typeof transformLiveDraft>(null);
  const [availablePreviewSize, setAvailablePreviewSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [originDialogOpen, setOriginDialogOpen] = useState(false);
  const [pagePreviewMode, setPagePreviewMode] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [units, setUnits] = useState<SiteCreatorSelectionUnit[]>([]);
  /** Solo el marquee selecciona objetos sueltos; el clic sigue resolviendo agrupaciones. */
  const [selectionFromMarquee, setSelectionFromMarquee] = useState(false);
  const [marqueeGroupBlockOpen, setMarqueeGroupBlockOpen] = useState(false);
  /** Ancestros semánticos de la selección (no es un “modo” visible). */
  const [interactionPath, setInteractionPath] = useState<string[]>([]);
  const [designerShadow, setDesignerShadow] = useState<SiteCreatorSelectionState>(
    EMPTY_SITE_CREATOR_SELECTION,
  );
  const [expandedTreeIds, setExpandedTreeIds] = useState<Record<string, boolean>>({});
  const [outlineHoverKey, setOutlineHoverKey] = useState<string | null>(null);
  const [revealPageRect, setRevealPageRect] = useState<{
    requestId: number;
    rect: { x: number; y: number; width: number; height: number };
  } | null>(null);

  const [structureError, setStructureError] = useState<string | null>(null);
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const [addTargetMenuOpen, setAddTargetMenuOpen] = useState(false);
  const [buttonPrompt, setButtonPrompt] = useState<{
    preferredParentId?: string | null;
  } | null>(null);
  const [pendingParentChoice, setPendingParentChoice] = useState<{
    kind: "button" | "group" | "multicard";
    candidateParentIds: string[];
  } | null>(null);
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);
  const [multiCardTextEdit, setMultiCardTextEdit] = useState<{
    nodeId: string;
    cardId: string;
    moldLayerId: string;
    text: string;
  } | null>(null);
  const [multiCardScrollIndexByNodeId, setMultiCardScrollIndexByNodeId] = useState<
    Record<string, number>
  >({});
  const multiCardScrollDisplayRef = useRef(multiCardScrollIndexByNodeId);
  multiCardScrollDisplayRef.current = multiCardScrollIndexByNodeId;
  const multiCardScrollAnimRef = useRef<Record<string, number>>({});
  const [multiCardActiveCardByNodeId, setMultiCardActiveCardByNodeId] = useState<
    Record<string, string>
  >({});
  const [multiCardMediaPick, setMultiCardMediaPick] = useState<{
    nodeId: string;
    cardId: string;
    moldLayerId: string;
  } | null>(null);
  const [armedDatasetChip, setArmedDatasetChip] = useState<ArmedDatasetChip | null>(null);
  const [datasetFlash, setDatasetFlash] = useState(false);
  const hadStudioDatasetRef = useRef(Boolean(dataset));
  useEffect(() => {
    if (!hadStudioDatasetRef.current && dataset) {
      setDatasetFlash(true);
      const timer = window.setTimeout(() => setDatasetFlash(false), 1600);
      hadStudioDatasetRef.current = true;
      return () => window.clearTimeout(timer);
    }
    hadStudioDatasetRef.current = Boolean(dataset);
    if (!dataset) setDatasetFlash(false);
  }, [dataset]);
  useEffect(() => {
    if (!dataset) setArmedDatasetChip(null);
  }, [dataset]);

  const historyRef = useRef<SiteBlueprintHistoryState>(createBlueprintHistory(blueprint));
  const writeCountRef = useRef(0);

  useEffect(() => {
    if (historyRef.current.present !== blueprint) {
      historyRef.current = createBlueprintHistory(blueprint);
    }
  }, [blueprint]);

  const commitBlueprint = useCallback(
    (next: SiteBlueprintV1) => {
      historyRef.current = pushBlueprintHistory(historyRef.current, next);
      writeCountRef.current += 1;
      onBlueprintChange(next);
      setStructureError(null);
    },
    [onBlueprintChange],
  );

  const page = previewPage ?? snapshot?.page ?? null;
  const pickerMediaItems = useMemo(() => {
    const merged = new Map<string, SiteCreatorMediaPickItem>();
    for (const item of [...projectMedia, ...mediaItemsFromPage(page)]) {
      const key = item.s3Key || item.url;
      if (!key || merged.has(key)) continue;
      merged.set(key, item);
    }
    return [...merged.values()];
  }, [page, projectMedia]);
  const committedPage =
    originState === "synced" && page ? page : (snapshot?.page ?? null);
  const pageDimensions = page ? getPageDimensions(page) : null;
  const referenceWidth = pageDimensions?.width ?? 1920;
  const referenceHeight = pageDimensions?.height ?? 1080;
  const monitorDimensions = useMemo(
    () => resolveDeviceDimensions({ band: "monitor", config: monitorDevice, referenceWidth }),
    [monitorDevice, referenceWidth],
  );
  const tabletDimensions = useMemo(
    () => resolveDeviceDimensions({ band: "tablet", config: tabletDevice, referenceWidth }),
    [referenceWidth, tabletDevice],
  );
  const mobileDimensions = useMemo(
    () => resolveDeviceDimensions({ band: "mobile", config: mobileDevice, referenceWidth }),
    [mobileDevice, referenceWidth],
  );
  const activeDeviceDimensions =
    viewportBand === "monitor"
      ? monitorDimensions
      : viewportBand === "tablet"
        ? tabletDimensions
        : viewportBand === "mobile"
          ? mobileDimensions
          : null;
  const livePreviewWidth = clampViewportWidth(
    availablePreviewSize?.width ??
      (typeof window !== "undefined" ? window.innerWidth : referenceWidth),
    referenceWidth,
  );
  const monitorMaxWidth = resolveMonitorMaxWidth(blueprint, referenceWidth);
  const effectiveViewportWidth = pagePreviewMode
    ? livePreviewWidth
    : viewportBand === "original"
      ? (originalViewportWidth ?? referenceWidth)
      : activeDeviceDimensions!.width;
  const deviceFrame =
    pagePreviewMode || activeDeviceDimensions == null
      ? null
      : {
          width: activeDeviceDimensions.width,
          height: activeDeviceDimensions.height,
          kind:
            viewportBand === "monitor"
              ? ("monitor" as const)
              : viewportBand === "tablet"
                ? ("tablet" as const)
                : ("mobile" as const),
        };
  const previewLayout = pagePreviewMode
    ? previewResponsiveLayout(effectiveViewportWidth, referenceWidth, monitorMaxWidth)
    : null;
  const responsiveBand = pagePreviewMode
    ? previewLayout!.band
    : bandForEditorDevice(viewportBand, effectiveViewportWidth, referenceWidth);
  const layoutViewportWidth = pagePreviewMode
    ? previewLayout!.viewportWidth
    : effectiveViewportWidth;
  const mediaBand: ResponsiveMediaBand = responsiveBand;
  const displayBlueprint = useMemo(() => {
    let next = blueprint;
    if (clipImageDraft && clipImageDraft.band === mediaBand) {
      if (
        clipImageEditTarget &&
        page &&
        isDesignerPageBackgroundLayer(page, clipImageEditTarget.clipId, blueprint)
      ) {
        next = patchPageBackgroundCrop({
          blueprint: next,
          sourceLayerId: clipImageEditTarget.clipId,
          focal: clipImageDraft.focal,
          zoom: clipImageDraft.zoom,
        }).blueprint;
      } else {
        const explicit =
          clipImageEditTarget?.band === mediaBand
            ? resolveExplicitBackground(
                next,
                clipImageEditTarget.clipId,
                mediaBand,
              )
            : null;
        if (explicit && clipImageEditTarget) {
          next = patchExplicitBackgroundCrop({
            blueprint: next,
            sourceLayerId: clipImageEditTarget.clipId,
            band: mediaBand,
            focal: clipImageDraft.focal,
            zoom: clipImageDraft.zoom,
          }).blueprint;
        } else {
          next = patchMediaTune({
            blueprint: next,
            layerId: clipImageDraft.imageId,
            band: clipImageDraft.band,
            patch: {
              focal: clipImageDraft.focal,
              zoom: clipImageDraft.zoom,
            },
          }).blueprint;
        }
      }
    }
    if (transformLiveDraft) {
      for (const item of transformLiveDraft.items) {
        const current = resolveItemTune(next, item.target, transformLiveDraft.band);
        const patch = itemTunePatchFromTransformDelta({
          tune: current,
          delta: transformLiveDraft.delta,
          displayBounds: item.startBounds,
          kind: item.kind === "moveOnly" ? "uniform" : item.kind,
        });
        if (patch) {
          next = patchItemTune({
            blueprint: next,
            target: item.target,
            band: transformLiveDraft.band,
            patch,
          }).blueprint;
        }
      }
    }
    return next;
  }, [
    blueprint,
    clipImageDraft,
    clipImageEditTarget,
    mediaBand,
    page,
    transformLiveDraft,
  ]);
  const clipImageEdit = useMemo((): SiteCreatorClipImageEdit | null => {
    if (!clipImageEditTarget || clipImageEditTarget.band !== mediaBand) return null;
    const draft =
      clipImageDraft?.imageId === clipImageEditTarget.imageId &&
      clipImageDraft.band === mediaBand
        ? clipImageDraft
        : null;
    const saved = resolveMediaTune(
      blueprint,
      clipImageEditTarget.imageId,
      mediaBand,
    );
    const explicit = resolveExplicitBackground(
      blueprint,
      clipImageEditTarget.clipId,
      mediaBand,
    );
    return {
      kind: clipImageEditTarget.kind,
      clipId: clipImageEditTarget.clipId,
      imageId: clipImageEditTarget.imageId,
      focal:
        draft?.focal ??
        explicit?.focal ??
        saved?.focal ??
        clipImageEditTarget.initialFocal ??
        { x: 0.5, y: 0.5 },
      zoom:
        draft?.zoom ??
        explicit?.zoom ??
        saved?.zoom ??
        clipImageEditTarget.initialZoom ??
        1,
    };
  }, [blueprint, clipImageDraft, clipImageEditTarget, mediaBand]);
  const showPreview = Boolean(page);

  const referenceIndex = useMemo(() => (page ? buildSiteSelectionIndex(page) : null), [page]);
  const committedIndex = useMemo(
    () => (committedPage ? buildSiteSelectionIndex(committedPage) : null),
    [committedPage],
  );

  const liveViewportHeight = useMemo(() => {
    if (deviceFrame) return Math.max(1, deviceFrame.height);
    const layoutWidthForLive =
      responsiveBand === "wide" || responsiveBand === "monitor"
        ? referenceWidth
        : Math.max(1, layoutViewportWidth);
    if (availablePreviewSize && availablePreviewSize.width > 1 && availablePreviewSize.height > 1) {
      return liveViewportHeightInPageUnits({
        pageWidth: layoutWidthForLive,
        availableWidth: availablePreviewSize.width,
        availableHeight: availablePreviewSize.height,
      });
    }
    return referenceHeight;
  }, [
    availablePreviewSize,
    deviceFrame,
    layoutViewportWidth,
    referenceHeight,
    referenceWidth,
    responsiveBand,
  ]);

  const responsive = useMemo(() => {
    if (!page || !referenceIndex) return null;
    return resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint: displayBlueprint,
      referenceIndex,
      viewportWidth: layoutViewportWidth,
      viewportHeight: liveViewportHeight,
      band: responsiveBand,
      multiCardScrollIndexByNodeId,
      dataset,
    });
  }, [
    dataset,
    displayBlueprint,
    layoutViewportWidth,
    liveViewportHeight,
    multiCardScrollIndexByNodeId,
    page,
    referenceIndex,
    responsiveBand,
  ]);

  const displayPage = responsive?.displayPage ?? page;
  const objectClipById = responsive?.resolvedLayout?.objectClipById;
  const pageBackgroundCss = useMemo(
    () => (page ? resolvePageBackgroundCss(page, blueprint) : null),
    [blueprint, page],
  );

  useEffect(() => {
    const anims = multiCardScrollAnimRef.current;
    return () => {
      for (const id of Object.keys(anims)) {
        const handle = anims[id];
        if (handle) cancelAnimationFrame(handle);
      }
    };
  }, []);

  const commitMultiCardScrollIndex = useCallback((nodeId: string, index: number) => {
    const from = multiCardScrollDisplayRef.current[nodeId] ?? 0;
    const prev = multiCardScrollAnimRef.current[nodeId];
    if (prev) {
      cancelAnimationFrame(prev);
      delete multiCardScrollAnimRef.current[nodeId];
    }
    if (Math.abs(from - index) < 1e-4) {
      setMultiCardScrollIndexByNodeId((current) =>
        current[nodeId] === index ? current : { ...current, [nodeId]: index },
      );
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / MULTICARD_SCROLL_DURATION_MS);
      const value = from + (index - from) * easePower2InOut(t);
      const nextVal = t >= 1 ? index : value;
      setMultiCardScrollIndexByNodeId((current) =>
        current[nodeId] === nextVal ? current : { ...current, [nodeId]: nextVal },
      );
      if (t < 1) {
        multiCardScrollAnimRef.current[nodeId] = requestAnimationFrame(tick);
      } else {
        delete multiCardScrollAnimRef.current[nodeId];
      }
    };
    multiCardScrollAnimRef.current[nodeId] = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const containers = responsive?.multiCard?.containers;
    if (!containers || containers.length === 0) return;
    setMultiCardScrollIndexByNodeId((current) => {
      let changed = false;
      const next = { ...current };
      for (const container of containers) {
        const clamped = container.overflow
          ? clampMultiCardScrollIndex(
              container.count,
              current[container.nodeId] ?? 0,
              container.visibleCount,
            )
          : 0;
        if ((current[container.nodeId] ?? 0) !== clamped) {
          const handle = multiCardScrollAnimRef.current[container.nodeId];
          if (handle) {
            cancelAnimationFrame(handle);
            delete multiCardScrollAnimRef.current[container.nodeId];
          }
          next[container.nodeId] = clamped;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [responsive?.multiCard?.containers]);
  const selectionIndex = useMemo(
    () => (displayPage ? buildSiteSelectionIndex(displayPage) : null),
    [displayPage],
  );
  const layoutWidth = responsive?.layout.layoutWidth ?? referenceWidth;
  const layoutHeight = responsive?.layout.layoutHeight ?? referenceHeight;
  const liveHeightBand: SectionHeightBand = isResponsiveEditableBand(responsiveBand)
    ? responsiveBand
    : "wide";
  const sectionScrollStations = useMemo(
    () =>
      sectionScrollStationsFromDisplay({
        blueprint,
        viewportHeight: liveViewportHeight,
        band: liveHeightBand,
        regions: responsive?.resolvedLayout?.regions,
      }),
    [blueprint, liveHeightBand, liveViewportHeight, responsive],
  );

  useEffect(() => {
    if (!pageDimensions) return;
    setViewportBand("original");
    setOriginalViewportWidth(pageDimensions.width);
  }, [pageDimensions?.width, pageDimensions?.height, snapshot?.contentHash]);

  useEffect(() => {
    if (blueprint.monitorMaxWidth == null) return;
    const width = resolveMonitorMaxWidth(blueprint, referenceWidth);
    setMonitorDevice((prev) => {
      const current = resolveDeviceDimensions({
        band: "monitor",
        config: prev,
        referenceWidth,
      }).width;
      if (current === width) return prev;
      return {
        ...prev,
        sizeId: "custom",
        customWidth: prev.orientation === "portrait" ? prev.customWidth : width,
        customHeight: prev.orientation === "portrait" ? width : prev.customHeight,
      };
    });
  }, [blueprint.monitorMaxWidth, referenceWidth]);

  const fitTargetWidth = deviceFrame?.width ?? layoutWidth;
  const fitTargetHeight = deviceFrame?.height ?? layoutHeight;

  useEffect(() => {
    if (!availablePreviewSize) return;
    if (availablePreviewSize.width < 80 || availablePreviewSize.height < 80) return;
    if (pagePreviewMode) {
      const desktopPreview =
        responsiveBand === "wide" || responsiveBand === "monitor";
      const z = computeFillWidthPreviewZoom({
        layoutWidth,
        availableWidth: availablePreviewSize.width,
        maxCssWidth: desktopPreview ? monitorMaxWidth : undefined,
      });
      setPreviewZoom((prev) => (Math.abs(prev - z) < 1e-4 ? prev : z));
      return;
    }
    const spineReserve = deviceFrame
      ? SITE_CREATOR_SECTION_SPINE_GUTTER_PX + SITE_CREATOR_SECTION_SPINE_PAGE_GAP_PX
      : 0;
    const chrome = deviceFrame
      ? siteCreatorDeviceChrome(resolveSiteCreatorDeviceChromeKind(deviceFrame))
      : null;
    const fitBox = chrome
      ? reserveDeviceFrameFitSize({
          availableWidth: Math.max(1, availablePreviewSize.width - spineReserve),
          availableHeight: availablePreviewSize.height,
          bezelPx: chrome.bezelPx,
          railGutterPx: SITE_CREATOR_PAGE_INSET_RAIL_GUTTER_PX,
        })
      : {
          width: Math.max(1, availablePreviewSize.width - spineReserve),
          height: availablePreviewSize.height,
        };
    const z = computeFitPreviewZoom({
      layoutWidth: fitTargetWidth,
      layoutHeight: fitTargetHeight,
      availableWidth: fitBox.width,
      availableHeight: fitBox.height,
    });
    setPreviewZoom((prev) => (Math.abs(prev - z) < 1e-4 ? prev : z));
  }, [
    availablePreviewSize,
    deviceFrame,
    fitTargetHeight,
    fitTargetWidth,
    layoutWidth,
    monitorMaxWidth,
    pagePreviewMode,
    responsiveBand,
  ]);

  useEffect(() => {
    if (responsiveBand === "wide") setFocalLayerId(null);
  }, [responsiveBand]);

  const displayShadow = useMemo(() => {
    if (!selectionIndex) return EMPTY_SITE_CREATOR_SELECTION;
    const next = reconcileSelectionToIndex(designerShadow, selectionIndex);
    return selectionLooksEqual(next, designerShadow) ? designerShadow : next;
  }, [designerShadow, selectionIndex]);

  const displayUnits = useMemo(
    () => reconcileUnits(units, blueprint, selectionIndex),
    [blueprint, selectionIndex, units],
  );

  const displayInspectNodeId = useMemo(() => {
    // Scope de profundidad: contenedor seleccionado, o último ancestro del path.
    if (displayUnits.length === 1 && displayUnits[0]!.kind === "blueprintNode") {
      const node = blueprint.nodes[displayUnits[0]!.nodeId];
      if (node && isSemanticContainerNode(node)) return displayUnits[0]!.nodeId;
    }
    for (let i = interactionPath.length - 1; i >= 0; i--) {
      const id = interactionPath[i]!;
      if (blueprint.nodes[id]) return id;
    }
    return null;
  }, [blueprint.nodes, displayUnits, interactionPath]);

  const presentationTree = useMemo(
    () =>
      buildSiteCreatorPresentationTree({
        page: displayPage,
        blueprint,
        selectionIndex,
        snapshot,
      }),
    [blueprint, displayPage, selectionIndex, snapshot],
  );

  /** Scope de acciones “dentro de”: solo si la selección es un hijo, no el contenedor. */
  const contextualInspectId = useMemo(() => {
    if (
      displayUnits.length === 1 &&
      displayUnits[0]!.kind === "blueprintNode" &&
      isSemanticContainerNode(blueprint.nodes[displayUnits[0]!.nodeId])
    ) {
      return null;
    }
    if (interactionPath.length > 0) {
      return interactionPath[interactionPath.length - 1]!;
    }
    if (displayUnits.length > 0 && selectionIndex) {
      return unitStructureParentId(displayUnits[0]!, blueprint, selectionIndex);
    }
    return null;
  }, [blueprint, displayUnits, interactionPath, selectionIndex]);

  const clearUnitsAndInspect = useCallback(() => {
    setUnits([]);
    setInteractionPath([]);
    setStructureError(null);
    setSectionMenuOpen(false);
    setPendingParentChoice(null);
    setSelectionFromMarquee(false);
    setMarqueeGroupBlockOpen(false);
  }, []);

  const exitPagePreview = useCallback(() => {
    setPagePreviewMode(false);
  }, []);

  const togglePagePreview = useCallback(() => {
    setPagePreviewMode((open) => {
      if (open) return false;
      clearUnitsAndInspect();
      setDesignerShadow(EMPTY_SITE_CREATOR_SELECTION);
      setOutlineHoverKey(null);
      setFocalLayerId(null);
      return true;
    });
  }, [clearUnitsAndInspect]);

  const applyViewportBand = useCallback(
    (band: SiteCreatorViewportBand) => {
      setViewportBand(band);
      if (band === "original") setOriginalViewportWidth(referenceWidth);
    },
    [referenceWidth],
  );

  const publishPage = snapshot?.page ?? page;
  const canPublish = Boolean(publishPage) && !publishing;

  const handlePublish = useCallback(async () => {
    if (!publishPage || publishing) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const refs = collectPublishImageRefs(publishPage, blueprint, dataset);
      const imageHrefByLayerId = Object.fromEntries(
        refs.map((ref) => [ref.layerId, publishAssetPlaceholder(ref.layerId)]),
      );
      const compiled = compilePublishedSite({
        page: publishPage,
        blueprint,
        title: nodeLabel,
        imageHrefByLayerId,
        dataset,
      });
      const response = await fetch("/api/site-creator-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: publish?.siteId,
          html: compiled.html,
          css: compiled.css,
          js: compiled.js,
          imageRefs: refs,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | SiteCreatorPublishStateV1
        | { error?: string }
        | null;
      if (!response.ok || !payload || !("siteId" in payload) || !payload.siteId) {
        throw new Error(
          (payload && "error" in payload && payload.error) || "No se pudo publicar el sitio.",
        );
      }
      onPublishChange?.({
        siteId: payload.siteId,
        publishedAt: payload.publishedAt,
        publicPath: payload.publicPath,
        fileCount: payload.fileCount,
      });
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "No se pudo publicar el sitio.");
    } finally {
      setPublishing(false);
    }
  }, [blueprint, dataset, nodeLabel, onPublishChange, publish?.siteId, publishPage, publishing]);

  const handleUnpublish = useCallback(async () => {
    if (!publish?.siteId || publishing) return;
    const confirmed = window.confirm("¿Quitar la web publicada? Se borra la carpeta pública.");
    if (!confirmed) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const response = await fetch(
        `/api/site-creator-publish?siteId=${encodeURIComponent(publish.siteId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "No se pudo despublicar el sitio.");
      }
      onPublishChange?.(null);
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "No se pudo despublicar el sitio.");
    } finally {
      setPublishing(false);
    }
  }, [onPublishChange, publish?.siteId, publishing]);

  const publishedUrl = publish?.publicPath
    ? `${typeof window !== "undefined" ? window.location.origin : ""}${publish.publicPath}`
    : null;

  const selectCreatedNode = useCallback((nodeId: string | null | undefined) => {
    setSelectionFromMarquee(false);
    setMarqueeGroupBlockOpen(false);
    if (!nodeId) {
      setUnits([]);
      setInteractionPath([]);
      return;
    }
    const node = blueprint.nodes[nodeId];
    const parentPath = node?.parentId ? [node.parentId] : [];
    // Incluir ancestros
    const path: string[] = [];
    let walk: string | null = node?.parentId ?? null;
    while (walk) {
      path.unshift(walk);
      walk = blueprint.nodes[walk]?.parentId ?? null;
    }
    setInteractionPath(path);
    setUnits([{ kind: "blueprintNode", nodeId }]);
  }, [blueprint.nodes]);

  const deepenToChild = useCallback(
    (parentId: string, child: SiteCreatorSelectionUnit) => {
      setInteractionPath((prev) => {
        const withoutTail = prev.filter((id) => id !== parentId);
        return [...withoutTail, parentId];
      });
      setUnits([child]);
      setStructureError(null);
      setSelectionFromMarquee(false);
      setMarqueeGroupBlockOpen(false);
    },
    [],
  );

  const persistGate = canPersistSiteStructure({
    originState,
    hasSnapshot: Boolean(snapshot),
  });

  const structureLayerIds = useMemo(
    () => unitsToStructureLayerIds(displayUnits, blueprint),
    [blueprint, displayUnits],
  );
  const selectionInsideSection = useMemo(
    () =>
      Boolean(
        selectionIndex &&
          selectionContainsUnitInsideSection(
            displayUnits,
            blueprint,
            selectionIndex,
          ),
      ),
    [blueprint, displayUnits, selectionIndex],
  );

  const applySection = useCallback(
    (sectionType: "hero" | "generic") => {
      if (!committedPage || !committedIndex) return;
      if (!persistGate.allowed) {
        setStructureError(persistGate.message);
        return;
      }
      if (selectionInsideSection) {
        setStructureError(
          "Este elemento ya pertenece a una sección. No se puede crear otra sección dentro.",
        );
        setSectionMenuOpen(false);
        return;
      }
      const result = createSectionFromSelection({
        blueprint,
        selectedLayerIds: structureLayerIds,
        index: committedIndex,
        committedPage,
        sectionType,
      });
      if (!result.ok || !result.createdNodeId) {
        setStructureError(result.ok ? "No se pudo crear la sección." : result.message);
        return;
      }
      const blueprintWithDefaults = applyNewSectionResponsiveDefaults(
        result.blueprint,
        result.createdNodeId,
      );
      commitBlueprint(blueprintWithDefaults);
      selectCreatedNode(result.createdNodeId);
      setSectionMenuOpen(false);
    },
    [
      blueprint,
      commitBlueprint,
      committedIndex,
      committedPage,
      persistGate,
      selectionInsideSection,
      selectCreatedNode,
      structureLayerIds,
    ],
  );

  const applyGroup = useCallback(
    (preferredParentId?: string | null) => {
      if (!committedIndex) return;
      if (!persistGate.allowed) {
        setStructureError(persistGate.message);
        return;
      }
      const parentId =
        preferredParentId !== undefined ? preferredParentId : contextualInspectId ?? undefined;
      if (
        selectionFromMarquee &&
        marqueeUnitsBlockGrouping(displayUnits, blueprint, committedIndex)
      ) {
        setMarqueeGroupBlockOpen(true);
        return;
      }
      const result = createGroupFromSelection({
        blueprint,
        units: displayUnits,
        index: committedIndex,
        preferredParentId: parentId,
      });
      if (!result.ok) {
        if (result.code === "ambiguous_parent" && result.candidateParentIds) {
          setPendingParentChoice({ kind: "group", candidateParentIds: result.candidateParentIds });
          setStructureError(result.message);
          return;
        }
        setStructureError(result.message);
        return;
      }
      commitBlueprint(result.blueprint);
      setPendingParentChoice(null);
      selectCreatedNode(result.createdNodeId);
      const created = result.createdNodeId ? result.blueprint.nodes[result.createdNodeId] : null;
      if (created?.parentId) {
        setInteractionPath([created.parentId]);
      }
    },
    [
      blueprint,
      commitBlueprint,
      committedIndex,
      contextualInspectId,
      displayUnits,
      persistGate,
      selectCreatedNode,
      selectionFromMarquee,
    ],
  );

  const applyMultiCard = useCallback(
    (preferredParentId?: string | null) => {
      if (!committedIndex) return;
      if (!persistGate.allowed) {
        setStructureError(persistGate.message);
        return;
      }
      const parentId =
        preferredParentId !== undefined ? preferredParentId : contextualInspectId ?? undefined;
      const result = createMultiCardFromSelection({
        blueprint,
        selectedLayerIds: structureLayerIds,
        index: committedIndex,
        preferredParentId: parentId,
      });
      if (!result.ok) {
        if (result.code === "ambiguous_parent" && result.candidateParentIds) {
          setPendingParentChoice({
            kind: "multicard",
            candidateParentIds: result.candidateParentIds,
          });
          setStructureError(result.message);
          return;
        }
        setStructureError(result.message);
        return;
      }
      let nextBlueprint = result.blueprint;
      const lists = dataset ? usableDatasetLists(dataset) : [];
      if (dataset && result.createdNodeId && lists.length === 1) {
        const claimed = claimMultiCardDatasetList({
          blueprint: nextBlueprint,
          nodeId: result.createdNodeId,
          dataset,
          listId: lists[0]!.id,
          index: committedIndex,
        });
        if (claimed.ok && claimed.blueprint) nextBlueprint = claimed.blueprint;
      }
      commitBlueprint(nextBlueprint);
      setPendingParentChoice(null);
      selectCreatedNode(result.createdNodeId);
      const created = result.createdNodeId ? nextBlueprint.nodes[result.createdNodeId] : null;
      if (created?.parentId) {
        setInteractionPath([created.parentId]);
      }
    },
    [
      blueprint,
      commitBlueprint,
      committedIndex,
      contextualInspectId,
      dataset,
      persistGate,
      selectCreatedNode,
      structureLayerIds,
    ],
  );

  const commitMultiCardOp = useCallback(
    (result: { ok: boolean; blueprint?: SiteBlueprintV1; message?: string }) => {
      if (!result.ok || !result.blueprint) {
        if (result.message) setStructureError(result.message);
        return;
      }
      commitBlueprint(result.blueprint);
    },
    [commitBlueprint],
  );

  const openMultiCardMediaPicker = useCallback(
    (owning: { nodeId: string; cardId: string; moldLayerId: string }) => {
      setMultiCardMediaPick(owning);
      setMultiCardActiveCardByNodeId((current) => ({
        ...current,
        [owning.nodeId]: owning.cardId,
      }));
      setUnits([{ kind: "blueprintNode", nodeId: owning.nodeId }]);
    },
    [],
  );

  const applyButton = useCallback(
    (opts?: {
      preferredParentId?: string | null;
      accessibleLabel?: string;
      labelLayerId?: string;
    }) => {
      if (!committedIndex) return;
      if (!persistGate.allowed) {
        setStructureError(persistGate.message);
        return;
      }

      if (!opts?.accessibleLabel && !opts?.labelLayerId) {
        const parentRes = resolveButtonParent({
          blueprint,
          selectedLayerIds: structureLayerIds,
          index: committedIndex,
          preferredParentId: opts?.preferredParentId,
        });
        if (parentRes.status === "blocked") {
          setStructureError(parentRes.message);
          return;
        }
        if (parentRes.status === "ambiguous") {
          setPendingParentChoice({
            kind: "button",
            candidateParentIds: parentRes.candidateParentIds,
          });
          setStructureError(parentRes.message);
          return;
        }
        const { textLayerIds, autoLabel } = extractAccessibleLabelFromLayers(
          structureLayerIds,
          committedIndex,
        );
        if (textLayerIds.length > 1 || textLayerIds.length === 0) {
          setButtonPrompt({ preferredParentId: parentRes.parentId });
          setStructureError(null);
          return;
        }
        if (!autoLabel) {
          setButtonPrompt({ preferredParentId: parentRes.parentId });
          return;
        }
      }

      const result = createButtonFromSelection({
        blueprint,
        selectedLayerIds: structureLayerIds,
        index: committedIndex,
        preferredParentId: opts?.preferredParentId,
        accessibleLabel: opts?.accessibleLabel,
        labelLayerId: opts?.labelLayerId,
      });
      if (!result.ok) {
        if (result.code === "ambiguous_parent" && result.candidateParentIds) {
          setPendingParentChoice({
            kind: "button",
            candidateParentIds: result.candidateParentIds,
          });
        }
        setStructureError(result.message);
        return;
      }
      commitBlueprint(result.blueprint);
      setButtonPrompt(null);
      setPendingParentChoice(null);
      selectCreatedNode(result.createdNodeId);
      // Si se creó dentro de un contenedor, mantener scope
      const created = result.createdNodeId ? result.blueprint.nodes[result.createdNodeId] : null;
      if (created?.parentId) {
        setInteractionPath(created.parentId ? [created.parentId] : []);
      }
    },
    [blueprint, commitBlueprint, committedIndex, persistGate, selectCreatedNode, structureLayerIds],
  );

  const applyAddToContainer = useCallback(
    (targetContainerId: string) => {
      if (!committedIndex) return;
      if (!persistGate.allowed) {
        setStructureError(persistGate.message);
        return;
      }
      const payloadUnits = displayUnits.filter((u) => {
        if (u.kind === "blueprintNode" && u.nodeId === targetContainerId) return false;
        return true;
      });
      const result = reparentUnitsToContainer({
        blueprint,
        units: payloadUnits,
        targetContainerId,
        index: committedIndex,
      });
      if (!result.ok) {
        setStructureError(result.message);
        return;
      }
      commitBlueprint(result.blueprint);
      setInteractionPath([targetContainerId]);
      setUnits(payloadUnits);
      setStructureError(null);
      setSectionMenuOpen(false);
    },
    [blueprint, commitBlueprint, committedIndex, displayUnits, persistGate],
  );

  const applyRemoveFromContainer = useCallback(
    (containerId: string) => {
      if (!committedIndex) return;
      if (!persistGate.allowed) {
        setStructureError(persistGate.message);
        return;
      }
      const result = removeUnitsFromContainer({
        blueprint,
        units: displayUnits,
        containerId,
        index: committedIndex,
      });
      if (!result.ok) {
        setStructureError(result.message);
        return;
      }
      commitBlueprint(result.blueprint);
      setInteractionPath([]);
      setUnits(displayUnits);
      setStructureError(null);
    },
    [blueprint, commitBlueprint, committedIndex, displayUnits, persistGate],
  );

  const openReviewDialog = useCallback(() => {
    if (syncBusy) return;
    onDismissSyncError();
    if (originState === "different_source") {
      setOriginDialogOpen(true);
    }
  }, [onDismissSyncError, originState, syncBusy]);

  const closeOriginDialog = useCallback(() => {
    if (syncBusy) return;
    setOriginDialogOpen(false);
    onDismissSyncError();
  }, [onDismissSyncError, syncBusy]);

  const selectedBlueprintNodeId = useMemo(() => {
    if (displayInspectNodeId) return displayInspectNodeId;
    if (displayUnits.length === 1 && displayUnits[0]!.kind === "blueprintNode") {
      return displayUnits[0]!.nodeId;
    }
    return null;
  }, [displayInspectNodeId, displayUnits]);

  const selectedBlueprintNode = selectedBlueprintNodeId
    ? blueprint.nodes[selectedBlueprintNodeId] ?? null
    : null;

  const removeBlueprintStructureNode = useCallback(
    (nodeId: string) => {
      const node = blueprint.nodes[nodeId];
      if (!node) return;
      let source = blueprint;
      if (committedIndex && isAutoDesignerMirrorNode(node, committedIndex)) {
        source = dismissDesignerMirrorNode(
          blueprint,
          node as SiteBlueprintLayoutGroupNode,
          committedIndex,
        );
      }
      const result = removeBlueprintNodePreservingContent(source, nodeId);
      if (!result.ok) {
        setStructureError(result.message);
        return;
      }
      commitBlueprint(result.blueprint);
      clearUnitsAndInspect();
    },
    [blueprint, clearUnitsAndInspect, commitBlueprint, committedIndex],
  );

  const removeSelectedStructure = useCallback(() => {
    if (!selectedBlueprintNode || contextualInspectId) return;
    if (selectedBlueprintNode.childIds.length > 0) {
      setRemoveConfirmId(selectedBlueprintNode.id);
      return;
    }
    removeBlueprintStructureNode(selectedBlueprintNode.id);
  }, [contextualInspectId, removeBlueprintStructureNode, selectedBlueprintNode]);

  const confirmRemove = useCallback(() => {
    if (!removeConfirmId) return;
    removeBlueprintStructureNode(removeConfirmId);
    setRemoveConfirmId(null);
  }, [removeBlueprintStructureNode, removeConfirmId]);

  const dispatchSelection = useCallback(
    (action: SiteCreatorSelectionAction) => {
      if (!selectionIndex) return;

      const clickUnitForLayer = (layerId: string) =>
        isResponsiveEditableBand(responsiveBand)
          ? resolveDeviceItemClickUnit(layerId, blueprint, selectionIndex)
          : resolveRootClickUnit(layerId, blueprint, selectionIndex);

      const patchShadow = (nextAction: SiteCreatorSelectionAction) => {
        setDesignerShadow((current) => {
          const base = reconcileSelectionToIndex(current, selectionIndex);
          return reconcileSelectionToIndex(
            reduceSiteCreatorSelection(base, nextAction, selectionIndex),
            selectionIndex,
          );
        });
      };

      switch (action.type) {
        case "hover": {
          patchShadow(action);
          return;
        }

        case "click": {
          setSelectionFromMarquee(false);
          setMarqueeGroupBlockOpen(false);
          if (armedDatasetChip) {
            if (!action.layerId) {
              setArmedDatasetChip(null);
            } else {
              const owning = findOwningMultiCardDisplay(blueprint, action.layerId, selectionIndex);
              if (owning && owning.nodeId === armedDatasetChip.nodeId) {
                const kind = slotKindFromObject(selectionIndex.byId[action.layerId]?.object);
                if (kind === armedDatasetChip.kind) {
                  const node = blueprint.nodes[owning.nodeId];
                  const current =
                    node && isSiteMultiCardNode(node)
                      ? node.slotBindings?.[owning.moldLayerId]
                      : undefined;
                  const sameField =
                    current?.source === armedDatasetChip.source &&
                    current.fieldId === armedDatasetChip.fieldId;
                  commitMultiCardOp(
                    setMultiCardSlotBinding({
                      blueprint,
                      nodeId: owning.nodeId,
                      moldLayerId: owning.moldLayerId,
                      binding: sameField
                        ? null
                        : {
                            source: armedDatasetChip.source,
                            fieldId: armedDatasetChip.fieldId,
                            fieldKey: armedDatasetChip.fieldKey,
                          },
                    }),
                  );
                  setArmedDatasetChip(null);
                  return;
                }
              }
              return;
            }
          }
          if (!action.layerId) {
            if (action.additive) return;
            clearUnitsAndInspect();
            patchShadow({ type: "clear" });
            return;
          }
          if (selectionIndex) {
            const owning = findOwningMultiCardDisplay(blueprint, action.layerId, selectionIndex);
            if (owning) {
              setMultiCardActiveCardByNodeId((current) => ({
                ...current,
                [owning.nodeId]: owning.cardId,
              }));
            }
          }

          // Profundidad: contenedor seleccionado o ancestro en interactionPath
          if (displayInspectNodeId) {
            const coverage = new Set(
              collectSemanticCoverageLayerIds(blueprint, displayInspectNodeId),
            );
            if (!coverageHasDisplayLayer(coverage, action.layerId)) {
              setInteractionPath([]);
              const clickUnits = collapseLayersToSelectionUnits(
                [action.layerId],
                blueprint,
                selectionIndex,
              );
              setUnits(
                action.additive
                  ? collapseLayersToSelectionUnits(
                      [
                        ...unitsToStructureLayerIds(displayUnits, blueprint),
                        ...unitsToStructureLayerIds(clickUnits, blueprint),
                      ],
                      blueprint,
                      selectionIndex,
                    )
                  : clickUnits,
              );
              patchShadow({ type: "hover", layerId: action.layerId });
              return;
            }
            const unit = resolveInspectClickUnit(
              action.layerId,
              displayInspectNodeId,
              blueprint,
              selectionIndex,
            );
            if (action.additive) {
              setUnits((current) => toggleSelectionUnit(current, unit, blueprint));
              return;
            }
            // Clic en el propio contenedor (misma unidad) → mantener selección
            if (
              unit.kind === "blueprintNode" &&
              unit.nodeId === displayInspectNodeId &&
              displayUnits.length === 1 &&
              displayUnits[0]!.kind === "blueprintNode" &&
              displayUnits[0]!.nodeId === displayInspectNodeId
            ) {
              return;
            }
            deepenToChild(displayInspectNodeId, unit);
            return;
          }

          const clickUnits = collapseLayersToSelectionUnits(
            [action.layerId],
            blueprint,
            selectionIndex,
          );
          if (action.additive) {
            const allSelected = clickUnits.every((candidate) =>
              displayUnits.some((existing) => sameSelectionUnit(existing, candidate)),
            );
            setUnits(
              allSelected
                ? displayUnits.filter(
                    (existing) =>
                      !clickUnits.some((candidate) => sameSelectionUnit(existing, candidate)),
                  )
                : collapseLayersToSelectionUnits(
                    [
                      ...unitsToStructureLayerIds(displayUnits, blueprint),
                      ...unitsToStructureLayerIds(clickUnits, blueprint),
                    ],
                    blueprint,
                    selectionIndex,
                  ),
            );
          } else {
            const unit = clickUnits[0]!;
            if (unit.kind === "blueprintNode") {
              const path: string[] = [];
              let walk: string | null = blueprint.nodes[unit.nodeId]?.parentId ?? null;
              while (walk) {
                path.unshift(walk);
                walk = blueprint.nodes[walk]?.parentId ?? null;
              }
              setInteractionPath(path);
            } else {
              const parent = unitStructureParentId(unit, blueprint, selectionIndex);
              if (parent) {
                const path: string[] = [parent];
                let walk: string | null = blueprint.nodes[parent]?.parentId ?? null;
                while (walk) {
                  path.unshift(walk);
                  walk = blueprint.nodes[walk]?.parentId ?? null;
                }
                setInteractionPath(path);
              } else {
                setInteractionPath([]);
              }
            }
            setUnits(clickUnits);
          }
          setStructureError(null);
          return;
        }

        case "enterContainer": {
          if (
            displayUnits.length === 1 &&
            displayUnits[0]!.kind === "blueprintNode"
          ) {
            // Atajo: sin hijo inequívoco no hace nada (radiografía ya muestra hijos).
            return;
          }
          return;
        }

        case "marquee": {
          const loose = layersToMarqueeSelectionUnits(
            action.layerIds,
            blueprint,
            selectionIndex,
          );
          setSelectionFromMarquee(true);
          setMarqueeGroupBlockOpen(false);
          if (action.additive) {
            setUnits((current) => {
              let next = current;
              for (const unit of loose) {
                next = toggleSelectionUnit(next, unit, blueprint);
              }
              return next;
            });
          } else {
            setUnits(loose);
          }
          setInteractionPath([]);
          setStructureError(null);
          return;
        }

        case "doubleClickLayer": {
          setSelectionFromMarquee(false);
          setMarqueeGroupBlockOpen(false);
          if (armedDatasetChip) setArmedDatasetChip(null);
          const hit = selectionIndex?.byId[action.layerId];
          const owning =
            selectionIndex
              ? findOwningMultiCardDisplay(blueprint, action.layerId, selectionIndex)
              : null;
          const isText = hit?.type === "text" || hit?.type === "textOnPath";
          if (owning && isText) {
            const displayText =
              typeof (hit?.object as { text?: string } | undefined)?.text === "string"
                ? (hit!.object as { text?: string }).text ?? ""
                : "";
            setMultiCardTextEdit({
              nodeId: owning.nodeId,
              cardId: owning.cardId,
              moldLayerId: owning.moldLayerId,
              text: displayText,
            });
            setMultiCardActiveCardByNodeId((current) => ({
              ...current,
              [owning.nodeId]: owning.cardId,
            }));
            setUnits([{ kind: "blueprintNode", nodeId: owning.nodeId }]);
            return;
          }
          if (owning && isImageLikeObject(hit?.object)) {
            openMultiCardMediaPicker(owning);
            return;
          }
          const unit = resolveRootClickUnit(action.layerId, blueprint, selectionIndex);
          if (unit.kind === "blueprintNode") {
            const node = blueprint.nodes[unit.nodeId];
            if (
              node &&
              (isSiteButtonNode(node) ||
                node.kind === "layoutGroup" ||
                isSiteMultiCardNode(node) ||
                isSiteSectionNode(node))
            ) {
              // Doble clic: seleccionar contenedor (hijos ya accesibles al estar seleccionado)
              setUnits([unit]);
              setInteractionPath((prev) => {
                const path: string[] = [];
                let walk: string | null = node.parentId;
                while (walk) {
                  path.unshift(walk);
                  walk = blueprint.nodes[walk]?.parentId ?? null;
                }
                return path;
              });
              return;
            }
          }
          setUnits([unit]);
          setInteractionPath([]);
          return;
        }

        case "doubleClickEnter": {
          patchShadow(action);
          return;
        }

        case "escape": {
          setSelectionFromMarquee(false);
          setMarqueeGroupBlockOpen(false);
          if (interactionPath.length > 0) {
            const parentId = interactionPath[interactionPath.length - 1]!;
            setUnits([{ kind: "blueprintNode", nodeId: parentId }]);
            setInteractionPath(interactionPath.slice(0, -1));
            setStructureError(null);
            return;
          }
          if (displayUnits.length > 0) {
            clearUnitsAndInspect();
            return;
          }
          if (displayShadow.isolationIds.length > 0) {
            patchShadow({ type: "escape" });
            return;
          }
          clearUnitsAndInspect();
          patchShadow({ type: "clear" });
          return;
        }

        case "pickExact":
        case "cycle": {
          setSelectionFromMarquee(false);
          setMarqueeGroupBlockOpen(false);
          if (action.type === "cycle") {
            const reduced = reduceSiteCreatorSelection(
              reconcileSelectionToIndex(displayShadow, selectionIndex),
              action,
              selectionIndex,
            );
            const layerId = reduced.selectedIds[0] ?? null;
            setDesignerShadow({
              ...reduced,
              selectedIds: [],
            });
            if (!layerId) {
              clearUnitsAndInspect();
              return;
            }
            if (displayInspectNodeId) {
              const coverage = new Set(
                collectSemanticCoverageLayerIds(blueprint, displayInspectNodeId),
              );
              if (coverageHasDisplayLayer(coverage, layerId)) {
                setUnits([{ kind: "layer", layerId: moldLayerIdFromDisplay(layerId) }]);
                return;
              }
              setInteractionPath([]);
            }
            setUnits([clickUnitForLayer(layerId)]);
            return;
          }

          const layerId = action.layerId;
          patchShadow({ type: "hover", layerId });
          if (displayInspectNodeId) {
            const coverage = new Set(
              collectSemanticCoverageLayerIds(blueprint, displayInspectNodeId),
            );
            if (coverageHasDisplayLayer(coverage, layerId)) {
              setUnits([{ kind: "layer", layerId: moldLayerIdFromDisplay(layerId) }]);
              return;
            }
            setInteractionPath([]);
          }
          setUnits([clickUnitForLayer(layerId)]);
          return;
        }

        case "clear": {
          clearUnitsAndInspect();
          patchShadow({ type: "clear" });
          return;
        }

        case "setIsolation": {
          patchShadow(action);
          return;
        }

        default:
          patchShadow(action);
      }
    },
    [
      blueprint,
      clearUnitsAndInspect,
      deepenToChild,
      displayInspectNodeId,
      displayShadow,
      displayUnits,
      interactionPath,
      openMultiCardMediaPicker,
      responsiveBand,
      selectionIndex,
    ],
  );

  const backgroundAction = useMemo((): SiteCreatorPrimaryAction | null => {
    if (viewportBand === "original") return null;
    if (!persistGate.allowed || displayUnits.length !== 1 || !referenceIndex) {
      return null;
    }
    const unit = displayUnits[0]!;
    if (unit.kind !== "layer") return null;
    if (resolveExplicitBackground(blueprint, unit.layerId, mediaBand)) {
      return {
        id: "restoreBackground",
        label: "Restaurar",
      };
    }
    const candidate = inferExplicitBackgroundCandidate({
      blueprint,
      index: referenceIndex,
      layerId: unit.layerId,
    });
    return candidate
      ? {
          id: "useAsBackground",
          label: "Usar como fondo",
          primary: true,
        }
      : null;
  }, [blueprint, displayUnits, mediaBand, persistGate.allowed, referenceIndex, viewportBand]);

  const contextualModel = useMemo(() => {
    const model = resolveContextualModel({
      units: displayUnits,
      inspectNodeId: contextualInspectId,
      blueprint,
      index: selectionIndex ?? { entries: [], byId: {} },
      snapshot,
      persistGate,
      band: fitLayoutBandFromViewport(viewportBand),
    });
    const structural = model.primaryActions.filter(
      (action) => action.id !== "editContent" && action.id !== "exitInspect",
    );
    return {
      ...model,
      primaryActions: [
        ...(backgroundAction ? [backgroundAction] : []),
        ...structural,
      ].slice(0, 3),
      summary:
        backgroundAction?.id === "restoreBackground"
          ? `Fondo · ${model.summary ?? "Imagen"}`
          : model.summary,
    };
  }, [
    backgroundAction,
    blueprint,
    contextualInspectId,
    displayUnits,
    persistGate,
    selectionIndex,
    snapshot,
    viewportBand,
  ]);

  const handleMicrobarAction = useCallback(
    (action: SiteCreatorPrimaryAction) => {
      const id = action.id;
      switch (id) {
        case "createButton":
          applyButton({
            preferredParentId: action.targetContainerId,
          });
          return;
        case "createSection":
          setSectionMenuOpen(true);
          return;
        case "keepTogether":
          applyGroup();
          return;
        case "createMultiCard":
          applyMultiCard();
          return;
        case "undoButton":
        case "undoSection":
        case "undoMultiCard":
        case "separateGroup":
          removeSelectedStructure();
          return;
        case "addToContainer":
          if (action.targetContainerId) applyAddToContainer(action.targetContainerId);
          return;
        case "removeFromContainer":
          if (action.targetContainerId) applyRemoveFromContainer(action.targetContainerId);
          return;
        case "chooseAddTarget":
          setAddTargetMenuOpen(true);
          return;
        case "useAsBackground": {
          const unit = displayUnits[0];
          if (!unit || unit.kind !== "layer" || !referenceIndex) return;
          const candidate = inferExplicitBackgroundCandidate({
            blueprint,
            index: referenceIndex,
            layerId: unit.layerId,
          });
          if (!candidate) return;
          const result = assignExplicitBackground({
            blueprint,
            candidate,
            band: mediaBand,
          });
          if (result.changed) commitBlueprint(result.blueprint);
          return;
        }
        case "restoreBackground": {
          const unit = displayUnits[0];
          if (!unit || unit.kind !== "layer") return;
          setClipImageDraft(null);
          setClipImageEditTarget(null);
          const result = restoreExplicitBackground({
            blueprint,
            sourceLayerId: unit.layerId,
            band: mediaBand,
          });
          if (result.changed) commitBlueprint(result.blueprint);
          return;
        }
        case "editContent":
        case "exitInspect":
          return;
        default:
          return;
      }
    },
    [
      applyAddToContainer,
      applyButton,
      applyGroup,
      applyMultiCard,
      applyRemoveFromContainer,
      armedDatasetChip,
      blueprint,
      commitBlueprint,
      commitMultiCardOp,
      committedPage,
      displayUnits,
      mediaBand,
      openReviewDialog,
      referenceIndex,
      removeSelectedStructure,
      selectionIndex,
      viewportBand,
    ],
  );

  const parentChoices = useMemo(() => {
    if (!pendingParentChoice) return [];
    const choices: { id: string | null; label: string }[] =
      pendingParentChoice.candidateParentIds.map((id) => ({
        id,
        label: parentChoiceLabel(id, blueprint, snapshot, committedIndex),
      }));
    if (pendingParentChoice.kind !== "multicard") {
      choices.push({
        id: null,
        label: parentChoiceLabel(null, blueprint, snapshot, committedIndex),
      });
    }
    return choices;
  }, [blueprint, committedIndex, pendingParentChoice, snapshot]);

  const hoverUnit = useMemo((): SiteCreatorSelectionUnit | null => {
    const hoverId = displayShadow.hoverId;
    if (!hoverId || !selectionIndex) return null;
    if (displayInspectNodeId) {
      const coverage = new Set(collectSemanticCoverageLayerIds(blueprint, displayInspectNodeId));
      if (!coverageHasDisplayLayer(coverage, hoverId)) return null;
      return resolveInspectClickUnit(hoverId, displayInspectNodeId, blueprint, selectionIndex);
    }
    // Contenedor seleccionado: revelar hijo directo bajo el cursor
    if (
      displayUnits.length === 1 &&
      displayUnits[0]!.kind === "blueprintNode" &&
      isSemanticContainerNode(blueprint.nodes[displayUnits[0]!.nodeId])
    ) {
      const containerId = displayUnits[0]!.nodeId;
      const coverage = new Set(collectSemanticCoverageLayerIds(blueprint, containerId));
      if (coverageHasDisplayLayer(coverage, hoverId)) {
        return resolveInspectClickUnit(hoverId, containerId, blueprint, selectionIndex);
      }
    }
    if (isResponsiveEditableBand(responsiveBand)) {
      return resolveDeviceItemClickUnit(hoverId, blueprint, selectionIndex);
    }
    return resolveRootClickUnit(hoverId, blueprint, selectionIndex);
  }, [blueprint, displayInspectNodeId, displayShadow.hoverId, displayUnits, responsiveBand, selectionIndex]);

  const unitOutlines = useMemo((): SiteCreatorUnitOutline[] => {
    if (!selectionIndex) return [];
    const outlines: SiteCreatorUnitOutline[] = [];
    for (const unit of displayUnits) {
      let bounds =
        presentationBoundsForUnit(unit, presentationTree, selectionIndex) ??
        boundsForUnit(unit, blueprint, selectionIndex);
      if (viewportBand === "original" && unit.kind === "blueprintNode") {
        const node = blueprint.nodes[unit.nodeId];
        if (node && isSiteSectionNode(node)) {
          bounds = {
            x: 0,
            y: node.sourceRange.top,
            width: referenceWidth,
            height: Math.max(1, node.sourceRange.bottom - node.sourceRange.top),
          };
        }
      }
      if (!bounds) continue;
      const label =
        unit.kind === "layer"
          ? deriveLayerDisplayLabel(unit.layerId, selectionIndex, snapshot)
          : containerDisplayLabel(blueprint.nodes[unit.nodeId]!, snapshot, selectionIndex);
      outlines.push({
        bounds,
        label,
        kind: unitOutlineKind(unit, blueprint),
      });
    }
    return outlines;
  }, [blueprint, displayUnits, presentationTree, referenceWidth, selectionIndex, snapshot, viewportBand]);

  const hoverOutline = useMemo((): SiteCreatorUnitOutline | null => {
    const hoverId = displayShadow.hoverId;
    if (!hoverId || !selectionIndex) return null;
    const scope = resolveHoverScopeUnit(hoverId, blueprint, selectionIndex);
    const unit = scope ?? hoverUnit;
    if (!unit) return null;
    if (displayUnits.some((u) => sameSelectionUnit(u, unit))) return null;
    const bounds =
      presentationBoundsForUnit(unit, presentationTree, selectionIndex) ??
      boundsForUnit(unit, blueprint, selectionIndex);
    if (!bounds) return null;
    return {
      bounds,
      kind: unitOutlineKind(unit, blueprint),
      label:
        unit.kind === "layer"
          ? deriveLayerDisplayLabel(unit.layerId, selectionIndex, snapshot)
          : containerDisplayLabel(blueprint.nodes[unit.nodeId]!, snapshot, selectionIndex),
    };
  }, [blueprint, displayShadow.hoverId, displayUnits, hoverUnit, presentationTree, selectionIndex, snapshot]);

  const spineHeightBand: SectionHeightBand = liveHeightBand;
  const blueprintRef = useRef(blueprint);
  blueprintRef.current = blueprint;

  const applyMonitorMaxWidth = useCallback(
    (width: number) => {
      const next = clampViewportWidth(width, referenceWidth);
      setMonitorDevice((prev) => ({
        ...prev,
        sizeId: "custom",
        customWidth: prev.orientation === "portrait" ? prev.customWidth : next,
        customHeight: prev.orientation === "portrait" ? next : prev.customHeight,
      }));
      if (!persistGate.allowed) {
        setStructureError(persistGate.message);
        return;
      }
      const updated = setMonitorMaxWidth(blueprintRef.current, next, referenceWidth);
      blueprintRef.current = updated;
      commitBlueprint(updated);
    },
    [commitBlueprint, persistGate, referenceWidth],
  );

  useEffect(() => {
    if (!persistGate.allowed) return;
    if (blueprint.monitorMaxWidth != null) return;
    const seeded = setMonitorMaxWidth(
      blueprintRef.current,
      SITE_CREATOR_DEFAULT_MONITOR_MAX_WIDTH,
      referenceWidth,
    );
    blueprintRef.current = seeded;
    commitBlueprint(seeded);
  }, [blueprint.monitorMaxWidth, commitBlueprint, persistGate.allowed, referenceWidth]);

  useEffect(() => {
    if (!persistGate.allowed || !page) return;
    const seeded = reconcilePageBackground(blueprintRef.current, page);
    if (seeded === blueprintRef.current) return;
    blueprintRef.current = seeded;
    commitBlueprint(seeded);
  }, [commitBlueprint, page, persistGate.allowed, snapshot?.contentHash]);

  const sectionSpineModel = useMemo(() => {
    if (pagePreviewMode || !selectionIndex) return null;
    const selectedId =
      displayUnits.length === 1 && displayUnits[0]?.kind === "blueprintNode"
        ? (() => {
            const node = blueprint.nodes[displayUnits[0].nodeId];
            return node && isSiteSectionNode(node) ? node.id : null;
          })()
        : null;
    const sections = listDocumentSections(blueprint);
    const hops = listSectionScrollHops(blueprint, spineHeightBand);
    const stationsDisplay = sectionScrollStations;
    const pageH = Math.max(
      1,
      committedPage ? getPageDimensions(committedPage).height : 1,
    );
    const stations: SectionSpineStation[] = sections.map((section, index) => {
      const display = stationsDisplay.find((item) => item.id === section.id) ?? null;
      const visual =
        presentationBoundsForUnit(
          { kind: "blueprintNode", nodeId: section.id },
          presentationTree,
          selectionIndex,
        ) ?? semanticNodeBounds(blueprint, section.id, selectionIndex);
      const useRange = viewportBand === "original";
      const top = useRange
        ? section.sourceRange.top
        : (display?.y ?? visual?.y ?? section.sourceRange.top);
      const height = useRange
        ? Math.max(1, section.sourceRange.bottom - section.sourceRange.top)
        : (display?.height ??
          visual?.height ??
          Math.max(1, section.sourceRange.bottom - section.sourceRange.top));
      const designedHeight =
        spineHeightBand === "wide"
          ? Math.max(1, section.sourceRange.bottom - section.sourceRange.top)
          : Math.max(1, display?.naturalHeight ?? visual?.height ?? height);
      const contentBottom = visual ? visual.y + visual.height : section.sourceRange.bottom;
      const contentHeight = Math.max(1, contentBottom - section.sourceRange.top);
      const nextSection = sections[index + 1] ?? null;
      const mode = sectionHeightModeForBand(blueprint, section, spineHeightBand);
      const customHeight = sectionCustomHeightForBand(blueprint, section, spineHeightBand);
      const hopToNext = hops[index + 1] ?? null;
      return {
        sectionId: section.id,
        label: section.label,
        top,
        bottom: top + height,
        height,
        designedHeight,
        contentHeight,
        maxBottom: nextSection ? nextSection.sourceRange.top : pageH,
        heightMode: mode,
        customHeight,
        selected: selectedId === section.id,
        canPinToTop: index === 0,
        pinToTop: Boolean(section.pinToTop),
        outgoing:
          nextSection && hopToNext
            ? { fromId: section.id, toId: nextSection.id, kind: hopToNext.kind }
            : null,
      };
    });

    const selectionBounds =
      displayUnits.length >= 1
        ? displayUnits
            .map((unit) => presentationBoundsForUnit(unit, presentationTree, selectionIndex))
            .filter((b): b is NonNullable<typeof b> => Boolean(b))
            .reduce<{ x: number; y: number; width: number; height: number } | null>((acc, b) => {
              if (!acc) return { ...b };
              const x1 = Math.min(acc.x, b.x);
              const y1 = Math.min(acc.y, b.y);
              const x2 = Math.max(acc.x + acc.width, b.x + b.width);
              const y2 = Math.max(acc.y + acc.height, b.y + b.height);
              return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
            }, null)
        : null;

    const canAdd =
      Boolean(persistGate.allowed) &&
      structureLayerIds.length > 0 &&
      displayUnits.length >= 1 &&
      !selectionInsideSection &&
      !displayUnits.every(
        (u) => u.kind === "blueprintNode" && isSiteSectionNode(blueprint.nodes[u.nodeId]!),
      );

    return {
      stations,
      addSectionY: canAdd && selectionBounds ? selectionBounds.y + selectionBounds.height : null,
      canAddSection: canAdd,
      mode: viewportBand === "original" ? ("structure" as const) : ("device" as const),
    };
  }, [
    blueprint,
    displayUnits,
    spineHeightBand,
    pagePreviewMode,
    persistGate.allowed,
    presentationTree,
    sectionScrollStations,
    selectionIndex,
    selectionInsideSection,
    structureLayerIds.length,
    viewportBand,
    committedPage,
  ]);

  const handleSpineScrollChange = useCallback(
    (fromId: string | null, toId: string, kind: SiteSectionScrollKind) => {
      if (!persistGate.allowed) {
        setStructureError(persistGate.message);
        return;
      }
      if (fromId == null) return;
      if (spineHeightBand === "wide") return;
      const next = setSectionScrollHop(
        blueprintRef.current,
        fromId,
        toId,
        kind,
        spineHeightBand,
      );
      blueprintRef.current = next;
      commitBlueprint(next);
    },
    [commitBlueprint, persistGate, spineHeightBand],
  );

  const handleSpineHeightModeChange = useCallback(
    (sectionId: string, mode: SiteSectionHeightMode) => {
      if (!persistGate.allowed) {
        setStructureError(persistGate.message);
        return;
      }
      if (spineHeightBand === "wide") return;
      if (mode === "custom") {
        const current = blueprintRef.current;
        const node = current.nodes[sectionId];
        const designed =
          node && isSiteSectionNode(node)
            ? Math.max(
                1,
                sectionScrollStations.find((station) => station.id === sectionId)
                  ?.naturalHeight ?? 1,
              )
            : 1;
        const existing = isSiteSectionNode(node)
          ? sectionCustomHeightForBand(current, node, spineHeightBand)
          : null;
        const result = setSectionHeightMode(
          current,
          sectionId,
          "custom",
          spineHeightBand,
          existing ?? designed,
        );
        if (result.ok) {
          blueprintRef.current = result.blueprint;
          commitBlueprint(result.blueprint);
        }
        return;
      }
      const result = setSectionHeightMode(
        blueprintRef.current,
        sectionId,
        mode,
        spineHeightBand,
      );
      if (result.ok) {
        blueprintRef.current = result.blueprint;
        commitBlueprint(result.blueprint);
      }
    },
    [commitBlueprint, persistGate, sectionScrollStations, spineHeightBand],
  );

  const handleSpineCustomHeightChange = useCallback(
    (sectionId: string, heightPx: number) => {
      if (!persistGate.allowed) {
        setStructureError(persistGate.message);
        return;
      }
      if (spineHeightBand === "wide") return;
      const result = setSectionHeightMode(
        blueprintRef.current,
        sectionId,
        "custom",
        spineHeightBand,
        heightPx,
      );
      if (result.ok) {
        blueprintRef.current = result.blueprint;
        commitBlueprint(result.blueprint);
      }
    },
    [commitBlueprint, persistGate, spineHeightBand],
  );

  const handleSpineSourceRangeBottomChange = useCallback(
    (sectionId: string, bottom: number) => {
      if (!persistGate.allowed) {
        setStructureError(persistGate.message);
        return;
      }
      if (!selectionIndex || !committedPage) return;
      const result = stretchSectionSourceRangeBottom({
        blueprint: blueprintRef.current,
        sectionId,
        bottom,
        index: selectionIndex,
        pageHeight: getPageDimensions(committedPage).height,
      });
      if (result.ok) {
        blueprintRef.current = result.blueprint;
        commitBlueprint(result.blueprint);
      }
    },
    [commitBlueprint, committedPage, persistGate, selectionIndex],
  );

  const handleSpinePinToTopChange = useCallback(
    (sectionId: string, pinToTop: boolean) => {
      if (!persistGate.allowed) {
        setStructureError(persistGate.message);
        return;
      }
      const result = setSectionPinToTop(blueprintRef.current, sectionId, pinToTop);
      if (result.ok) {
        blueprintRef.current = result.blueprint;
        commitBlueprint(result.blueprint);
      } else {
        setStructureError(result.message);
      }
    },
    [commitBlueprint, persistGate],
  );

  const pageInsetBand: ResponsiveEditableBand | null =
    viewportBand === "monitor" || viewportBand === "tablet" || viewportBand === "mobile"
      ? viewportBand
      : null;
  const pageInsetsModel = useMemo(() => {
    if (pagePreviewMode || !pageInsetBand || !page) return null;
    const originalDetected = detectPageContentInsets(page, referenceWidth);
    const designInsets = scalePageInsets(
      originalDetected,
      referenceWidth,
      layoutViewportWidth,
    );
    return {
      band: pageInsetBand,
      insets: resolvePageInsetsForBand(
        blueprint.pageInsets,
        pageInsetBand,
        layoutViewportWidth,
        designInsets,
      ),
      designInsets,
    };
  }, [blueprint, layoutViewportWidth, page, pageInsetBand, pagePreviewMode, referenceWidth]);

  const handlePageInsetsChange = useCallback(
    (next: SitePageInsetBandV1) => {
      if (!persistGate.allowed) {
        setStructureError(persistGate.message);
        return;
      }
      if (!pageInsetBand) return;
      const updated = setPageInsets(
        blueprintRef.current,
        pageInsetBand,
        next,
        layoutViewportWidth,
      );
      blueprintRef.current = updated;
      commitBlueprint(updated);
    },
    [commitBlueprint, layoutViewportWidth, pageInsetBand, persistGate],
  );

  const contextOutlines = useMemo((): SiteCreatorUnitOutline[] => {
    if (!selectionIndex || displayUnits.length === 0) return [];
    const outlines: SiteCreatorUnitOutline[] = [];
    for (const ancestorId of interactionPath) {
      const unit = { kind: "blueprintNode" as const, nodeId: ancestorId };
      const bounds =
        presentationBoundsForUnit(unit, presentationTree, selectionIndex) ??
        semanticNodeBounds(blueprint, ancestorId, selectionIndex);
      if (!bounds) continue;
      outlines.push({
        bounds,
        kind: unitOutlineKind(unit, blueprint),
      });
    }
    return outlines;
  }, [blueprint, displayUnits.length, interactionPath, presentationTree, selectionIndex]);

  const ghostOutlines = useMemo((): SiteCreatorGhostOutline[] => {
    if (!selectionIndex) return [];
    // Contenedor bajo hover o seleccionado: solo marcar el hijo enfatizado, no todos.
    let subject: SiteCreatorSelectionUnit | null = null;
    if (hoverUnit && hoverUnit.kind === "blueprintNode") {
      const n = blueprint.nodes[hoverUnit.nodeId];
      if (n && isSemanticContainerNode(n)) subject = hoverUnit;
    }
    if (
      !subject &&
      displayUnits.length === 1 &&
      displayUnits[0]!.kind === "blueprintNode" &&
      isSemanticContainerNode(blueprint.nodes[displayUnits[0]!.nodeId])
    ) {
      subject = displayUnits[0]!;
    }
    if (!subject) return [];
    const children = presentationDirectChildren(subject, presentationTree);
    const ghosts: SiteCreatorGhostOutline[] = [];
    for (const child of children) {
      if (!child.unit) continue;
      const bounds = presentationBoundsForUnit(child.unit, presentationTree, selectionIndex);
      if (!bounds) continue;
      const emphasized = Boolean(hoverUnit && child.unit && sameSelectionUnit(hoverUnit, child.unit));
      if (!emphasized) continue;
      ghosts.push({
        bounds,
        emphasized: true,
        isContainer: child.isContainer || child.kind === "semantic",
      });
    }
    if (subject.kind === "blueprintNode" && isSiteMultiCardNode(blueprint.nodes[subject.nodeId])) {
      const mold = responsive?.multiCard?.containers.find((item) => item.nodeId === subject.nodeId);
      const card1 = mold?.cardRects[0];
      if (card1) {
        ghosts.unshift({ bounds: card1, emphasized: true, isContainer: true });
      }
    }
    return ghosts;
  }, [blueprint.nodes, displayUnits, hoverUnit, presentationTree, responsive?.multiCard, selectionIndex]);

  const datasetCompatibleBounds = useMemo(() => {
    if (!armedDatasetChip || !selectionIndex) return [];
    const bounds: { x: number; y: number; width: number; height: number }[] = [];
    for (const entry of selectionIndex.entries) {
      const owning = findOwningMultiCardDisplay(blueprint, entry.layerId, selectionIndex);
      if (!owning || owning.nodeId !== armedDatasetChip.nodeId) continue;
      if (slotKindFromObject(entry.object) !== armedDatasetChip.kind) continue;
      bounds.push(entry.visualBounds);
    }
    return bounds;
  }, [armedDatasetChip, blueprint, selectionIndex]);

  const sectionOutlines = useMemo((): SiteCreatorUnitOutline[] => {
    return [];
  }, []);

  const adaptationModel = useMemo(() => {
    if (displayUnits.length !== 1 || !selectionIndex) return null;
    if (!isAdaptationEligibleUnit(displayUnits[0]!, blueprint, selectionIndex, responsiveBand)) {
      return null;
    }
    const target = resolveResponsiveTarget(displayUnits[0]!, blueprint, selectionIndex);
    if (!target) return null;
    const editable = bandToEditable(responsiveBand);
    if (!editable) return null;

    const analysisIndex = referenceIndex ?? committedIndex ?? selectionIndex;
    let sectionAnalysis = null as ReturnType<typeof analyzeSectionVisualPresentation>;
    if (target.kind === "blueprintNode") {
      const node = blueprint.nodes[target.nodeId];
      if (node && isSiteSectionNode(node) && analysisIndex) {
        sectionAnalysis = analyzeSectionVisualPresentation({
          blueprint,
          sectionId: node.id,
          index: analysisIndex,
        });
      }
    }

    const syncBlocked = !persistGate.allowed;
    const capability = resolveAdaptationCapability({
      target,
      band: responsiveBand,
      blueprint,
      index: analysisIndex,
      resolvedContainer: { sectionAnalysis },
      syncBlocked,
    });

    if (capability.status === "hidden") return null;

    const effective = resolveEffectiveResponsiveMode({
      blueprint,
      target,
      band: responsiveBand,
      index: selectionIndex,
    });

    if (capability.status === "readonly") {
      if (capability.reason === "controlled-by-ancestor") {
        return {
          band: editable,
          effective,
          buttonLabel: adaptationButtonLabel(effective.mode),
          controlledByLabel: capability.ownerLabel ?? "contenedor",
          controller: effective.controller,
        };
      }
      return {
        band: editable,
        effective,
        buttonLabel: adaptationButtonLabel(effective.mode),
        locked: true,
        lockedReason: "Actualiza el diseño para cambiar la adaptación",
      };
    }

    if (capability.status === "reset-only") {
      return {
        band: editable,
        effective,
        buttonLabel: "Adaptación sin efecto · Restablecer",
        target,
        resetOnly: true,
      };
    }

    if (isResponsiveTargetBroken(blueprint, target, selectionIndex)) {
      return {
        band: editable,
        effective,
        buttonLabel: adaptationButtonLabel(effective.mode),
        locked: true,
        lockedReason: "Actualiza el diseño para cambiar la adaptación",
      };
    }

    return {
      band: editable,
      effective,
      buttonLabel: adaptationButtonLabel(effective.mode),
      target,
    };
  }, [
    blueprint,
    committedIndex,
    displayUnits,
    originState,
    persistGate.allowed,
    referenceIndex,
    responsiveBand,
    selectionIndex,
  ]);

  const onAdaptationSelectMode = useCallback(
    (mode: "auto" | "preserve" | "stack") => {
      if (!adaptationModel || !("target" in adaptationModel) || !adaptationModel.target) return;
      if (!persistGate.allowed) {
        setStructureError(persistGate.message);
        return;
      }
      const result = setResponsiveOverride({
        blueprint,
        target: adaptationModel.target,
        band: adaptationModel.band,
        mode,
      });
      if (!result.changed) return;
      commitBlueprint(result.blueprint);
    },
    [adaptationModel, blueprint, commitBlueprint, persistGate],
  );

  const onAdaptationFocusController = useCallback(() => {
    if (!adaptationModel?.controller) return;
    const c = adaptationModel.controller;
    if (c.kind === "blueprintNode") {
      selectCreatedNode(c.nodeId);
    } else {
      setSelectionFromMarquee(false);
      setMarqueeGroupBlockOpen(false);
      setUnits([{ kind: "layer", layerId: c.layerId }]);
      setInteractionPath([]);
    }
  }, [adaptationModel, selectCreatedNode]);

  const editableBand = bandToEditable(responsiveBand);

  const commitTune = useCallback(
    (result: { blueprint: SiteBlueprintV1; changed: boolean }) => {
      if (!persistGate.allowed) {
        setStructureError(persistGate.message);
        return;
      }
      if (!result.changed) return;
      commitBlueprint(result.blueprint);
    },
    [commitBlueprint, persistGate],
  );

  const refineModel = useMemo(() => {
    if (!editableBand || displayUnits.length !== 1 || !selectionIndex) return null;
    if (!persistGate.allowed) return null;
    const unit = displayUnits[0]!;
    const containerTarget = resolveResponsiveTarget(unit, blueprint, selectionIndex);
    const itemRef = resolveItemRef(unit, blueprint);
    const layerId = unit.kind === "layer" ? unit.layerId : null;
    const layerType = layerId ? selectionIndex.byId[layerId]?.type : null;
    const isMedia = layerType === "image";
    const kind: "container" | "media" | "item" | null = containerTarget
      ? "container"
      : isMedia
        ? "media"
        : itemRef
          ? "item"
          : null;
    if (!kind) return null;
    const siblings = siblingItemRefs(unit, presentationTree, blueprint);
    const itemTune = itemRef ? resolveItemTune(blueprint, itemRef, editableBand) : null;
    const containerTune = containerTarget
      ? resolveContainerTune(blueprint, containerTarget, editableBand)
      : null;
    const mediaTune = layerId ? resolveMediaTune(blueprint, layerId, editableBand) : null;
    const showReset = Boolean(itemTune || containerTune || mediaTune);
    return {
      band: editableBand,
      kind,
      itemTune,
      containerTune,
      mediaTune,
      canReorder:
        (kind === "item" || kind === "media") &&
        siblings.length > 1 &&
        selectionParentIsStacked(unit, blueprint, editableBand, selectionIndex),
      resetLabel: editableBandResetLabel(editableBand),
      showReset,
      containerContentCount: containerTarget
        ? countContainerReflowUnits({
            blueprint,
            target: containerTarget,
            index: selectionIndex,
            band: editableBand,
          })
        : 0,
      itemRef,
      containerTarget,
      layerId,
      siblings,
      transformKind: itemRef
        ? resolveItemTransformKind({
            blueprint,
            target: itemRef,
            index: selectionIndex,
          })
        : "uniform",
    };
  }, [
    blueprint,
    displayUnits,
    editableBand,
    persistGate.allowed,
    presentationTree,
    selectionIndex,
  ]);

  /** Reposicionado en dispositivos: 1+ ítems/grupos (nunca secciones). */
  const transformSelection = useMemo(() => {
    if (!editableBand || !selectionIndex || !persistGate.allowed) return null;
    const refs = listTransformableItemTargets({ units: displayUnits, blueprint });
    if (refs.length === 0) return null;
    const refKeys = new Set(refs.map(itemRefKey));
    const boundsList: Array<{ x: number; y: number; width: number; height: number }> = [];
    for (const unit of displayUnits) {
      const ref = resolveItemRef(unit, blueprint);
      if (!ref || !refKeys.has(itemRefKey(ref))) continue;
      const bounds =
        presentationBoundsForUnit(unit, presentationTree, selectionIndex) ??
        boundsForUnit(unit, blueprint, selectionIndex);
      if (bounds) boundsList.push(bounds);
    }
    const bounds = unionPageRects(boundsList);
    if (!bounds) return null;
    const singleRef = refs.length === 1 ? refs[0]! : null;
    const kind: ItemTransformKind =
      refs.length > 1
        ? "moveOnly"
        : resolveItemTransformKind({
            blueprint,
            target: singleRef,
            index: selectionIndex,
          });
    const itemTune = singleRef ? resolveItemTune(blueprint, singleRef, editableBand) : null;
    return {
      refs,
      bounds,
      kind,
      correction: {
        shiftX: itemTune?.shiftX ?? 0,
        shiftY: itemTune?.shiftY ?? 0,
        scale: itemTune?.scale ?? 1,
        boxW: itemTune?.boxW,
        boxH: itemTune?.boxH,
        fontScale: itemTune?.fontScale ?? 1,
      },
      fontScale: itemTune?.fontScale ?? 1,
    };
  }, [
    blueprint,
    displayUnits,
    editableBand,
    persistGate.allowed,
    presentationTree,
    selectionIndex,
  ]);

  const refineHandlers = useMemo(
    () => ({
      onAlignX: (align: "start" | "center" | "end") => {
        if (!editableBand) return;
        if (refineModel?.kind !== "container" && refineModel?.itemRef) {
          commitTune(
            patchItemTune({
              blueprint,
              target: refineModel.itemRef,
              band: editableBand,
              patch: { alignX: align },
            }),
          );
          return;
        }
        if (refineModel?.containerTarget) {
          commitTune(
            patchContainerTune({
              blueprint,
              target: refineModel.containerTarget,
              band: editableBand,
              patch: { contentAlignX: align },
            }),
          );
        }
      },
      onAlignY: (align: "start" | "center" | "end") => {
        if (!editableBand) return;
        if (refineModel?.kind !== "container" && refineModel?.itemRef) {
          commitTune(
            patchItemTune({
              blueprint,
              target: refineModel.itemRef,
              band: editableBand,
              patch: { alignY: align },
            }),
          );
          return;
        }
        if (refineModel?.containerTarget) {
          commitTune(
            patchContainerTune({
              blueprint,
              target: refineModel.containerTarget,
              band: editableBand,
              patch: { contentAlignY: align },
            }),
          );
        }
      },
      onWidthMode: (mode: "content" | "container" | "full") => {
        if (!editableBand) return;
        if (refineModel?.kind !== "container" && refineModel?.itemRef) {
          commitTune(
            patchItemTune({
              blueprint,
              target: refineModel.itemRef,
              band: editableBand,
              patch: { widthMode: mode, size: undefined },
            }),
          );
          return;
        }
        if (refineModel?.containerTarget) {
          commitTune(
            patchContainerTune({
              blueprint,
              target: refineModel.containerTarget,
              band: editableBand,
              patch: { contentWidthMode: mode },
            }),
          );
        }
      },
      onHide: (hidden: boolean) => {
        if (!refineModel?.itemRef || !editableBand) return;
        commitTune(
          patchItemTune({
            blueprint,
            target: refineModel.itemRef,
            band: editableBand,
            patch: { hidden },
          }),
        );
      },
      onItemShift: (axis: "x" | "y", value: number | null) => {
        if (!refineModel?.itemRef || !editableBand) return;
        commitTune(
          patchItemTune({
            blueprint,
            target: refineModel.itemRef,
            band: editableBand,
            patch:
              axis === "x"
                ? { shiftX: value ?? 0, offset: undefined, size: undefined }
                : { shiftY: value ?? 0, offset: undefined, size: undefined },
          }),
        );
      },
      onItemScale: (value: number | null) => {
        if (!refineModel?.itemRef || !editableBand) return;
        commitTune(
          patchItemTune({
            blueprint,
            target: refineModel.itemRef,
            band: editableBand,
            patch: { scale: value ?? 1, offset: undefined, size: undefined },
          }),
        );
      },
      onItemFontScale: (value: number | null) => {
        if (!refineModel?.itemRef || !editableBand) return;
        commitTune(
          patchItemTune({
            blueprint,
            target: refineModel.itemRef,
            band: editableBand,
            patch: { fontScale: value ?? 1 },
          }),
        );
      },
      onReorder: (delta: -1 | 1) => {
        if (!refineModel?.itemRef || !editableBand) return;
        commitTune(
          reorderSiblingItems({
            blueprint,
            target: refineModel.itemRef,
            siblings: refineModel.siblings,
            band: editableBand,
            delta,
          }),
        );
      },
      onResetItem: () => {
        if (!editableBand) return;
        if (refineModel?.kind === "media" && refineModel.layerId) {
          let next = resetMediaToAuto({
            blueprint,
            layerId: refineModel.layerId,
            band: editableBand,
          }).blueprint;
          if (refineModel.itemRef) {
            next = resetItemToAuto({ blueprint: next, target: refineModel.itemRef, band: editableBand }).blueprint;
          }
          if (next !== blueprint) commitBlueprint(next);
          return;
        }
        if (refineModel?.itemRef) {
          commitTune(resetItemToAuto({ blueprint, target: refineModel.itemRef, band: editableBand }));
        }
      },
      onResetContainer: () => {
        if (!editableBand || !refineModel?.containerTarget) return;
        let next = patchContainerTune({
          blueprint,
          target: refineModel.containerTarget,
          band: editableBand,
          patch: null,
        }).blueprint;
        next = setResponsiveOverride({
          blueprint: next,
          target: refineModel.containerTarget,
          band: editableBand,
          mode: "auto",
        }).blueprint;
        if (next !== blueprint) commitBlueprint(next);
      },
      onResetBand: () => {
        if (!editableBand) return;
        commitTune(resetResponsiveBand({ blueprint, band: editableBand }));
      },
      onContainerPadding: (value: number) => {
        if (!refineModel?.containerTarget || !editableBand) return;
        commitTune(
          patchContainerTune({
            blueprint,
            target: refineModel.containerTarget,
            band: editableBand,
            patch: { padding: value },
          }),
        );
      },
      onContainerPaddingAuto: () => {
        if (!refineModel?.containerTarget || !editableBand) return;
        commitTune(
          clearContainerTuneField({
            blueprint,
            target: refineModel.containerTarget,
            band: editableBand,
            field: "padding",
          }),
        );
      },
      onContainerGap: (value: number) => {
        if (!refineModel?.containerTarget || !editableBand) return;
        commitTune(
          patchContainerTune({
            blueprint,
            target: refineModel.containerTarget,
            band: editableBand,
            patch: { gap: value },
          }),
        );
      },
      onContainerGapAuto: () => {
        if (!refineModel?.containerTarget || !editableBand) return;
        commitTune(
          clearContainerTuneField({
            blueprint,
            target: refineModel.containerTarget,
            band: editableBand,
            field: "gap",
          }),
        );
      },
      onContainerAlign: (align: "start" | "center" | "end") => {
        if (!refineModel?.containerTarget || !editableBand) return;
        commitTune(
          patchContainerTune({
            blueprint,
            target: refineModel.containerTarget,
            band: editableBand,
            patch: { contentAlignX: align },
          }),
        );
      },
      onContainerAlignY: (align: "start" | "center" | "end") => {
        if (!refineModel?.containerTarget || !editableBand) return;
        commitTune(
          patchContainerTune({
            blueprint,
            target: refineModel.containerTarget,
            band: editableBand,
            patch: { contentAlignY: align },
          }),
        );
      },
      onContainerAlignAuto: () => {
        if (!refineModel?.containerTarget || !editableBand) return;
        commitTune(
          clearContainerTuneField({
            blueprint,
            target: refineModel.containerTarget,
            band: editableBand,
            field: "contentAlignX",
          }),
        );
      },
      onContainerAlignYAuto: () => {
        if (!refineModel?.containerTarget || !editableBand) return;
        commitTune(
          clearContainerTuneField({
            blueprint,
            target: refineModel.containerTarget,
            band: editableBand,
            field: "contentAlignY",
          }),
        );
      },
      onContainerWidthMode: (mode: "content" | "container" | "full") => {
        if (!refineModel?.containerTarget || !editableBand) return;
        commitTune(
          patchContainerTune({
            blueprint,
            target: refineModel.containerTarget,
            band: editableBand,
            patch: { contentWidthMode: mode },
          }),
        );
      },
      onContainerMaxWidth: (value: number | null) => {
        if (!refineModel?.containerTarget || !editableBand) return;
        if (value == null) {
          commitTune(
            clearContainerTuneField({
              blueprint,
              target: refineModel.containerTarget,
              band: editableBand,
              field: "maxContentWidth",
            }),
          );
          return;
        }
        commitTune(
          patchContainerTune({
            blueprint,
            target: refineModel.containerTarget,
            band: editableBand,
            patch: { maxContentWidth: value },
          }),
        );
      },
      onContainerMaxWidthAuto: () => {
        if (!refineModel?.containerTarget || !editableBand) return;
        commitTune(
          clearContainerTuneField({
            blueprint,
            target: refineModel.containerTarget,
            band: editableBand,
            field: "maxContentWidth",
          }),
        );
      },
      onContainerMinHeight: (value: number | null) => {
        if (!refineModel?.containerTarget || !editableBand) return;
        if (value == null) {
          commitTune(
            clearContainerTuneField({
              blueprint,
              target: refineModel.containerTarget,
              band: editableBand,
              field: "minHeight",
            }),
          );
          return;
        }
        commitTune(
          patchContainerTune({
            blueprint,
            target: refineModel.containerTarget,
            band: editableBand,
            patch: { minHeight: value },
          }),
        );
      },
      onContainerMinHeightAuto: () => {
        if (!refineModel?.containerTarget || !editableBand) return;
        commitTune(
          clearContainerTuneField({
            blueprint,
            target: refineModel.containerTarget,
            band: editableBand,
            field: "minHeight",
          }),
        );
      },
      onMediaFit: (fit: "cover" | "contain" | "preserve") => {
        if (!refineModel?.layerId || !editableBand) return;
        commitTune(
          patchMediaTune({
            blueprint,
            layerId: refineModel.layerId,
            band: editableBand,
            patch: { fit },
          }),
        );
      },
      onEnterFocal: () => {
        if (refineModel?.layerId) {
          setClipImageDraft(null);
          setClipImageEditTarget(null);
          setFocalLayerId(refineModel.layerId);
        }
      },
    }),
    [blueprint, commitBlueprint, commitTune, editableBand, refineModel],
  );

  const onTransformCommit = useCallback(
    (
      delta: { dx: number; dy: number; dw?: number; dh?: number },
      meta: { startBounds: { x: number; y: number; width: number; height: number } },
    ) => {
      if (transformLiveRafRef.current != null) {
        cancelAnimationFrame(transformLiveRafRef.current);
        transformLiveRafRef.current = null;
      }
      transformLivePendingRef.current = null;
      setTransformLiveDraft(null);
      if (!editableBand || !selectionIndex || !persistGate.allowed) return;
      const refs = listTransformableItemTargets({ units: displayUnits, blueprint });
      if (refs.length === 0) return;
      const isMulti = refs.length > 1;
      // Multi: solo reposicionar (mismo dx/dy en px por caja). Resize solo con un objetivo.
      if (isMulti && (delta.dw || delta.dh)) return;
      const refKeys = new Set(refs.map(itemRefKey));
      let next = blueprint;
      let changed = false;
      for (const unit of displayUnits) {
        const ref = resolveItemRef(unit, blueprint);
        if (!ref || !refKeys.has(itemRefKey(ref))) continue;
        const bounds =
          presentationBoundsForUnit(unit, presentationTree, selectionIndex) ??
          boundsForUnit(unit, blueprint, selectionIndex);
        if (!bounds) continue;
        // Al soltar, meta.startBounds es la unión; cada ítem usa su caja propia.
        const displayBounds = isMulti ? bounds : meta.startBounds;
        const resolvedKind = isMulti
          ? ("moveOnly" as const)
          : resolveItemTransformKind({
              blueprint: next,
              target: ref,
              index: selectionIndex,
            });
        const patchKind =
          resolvedKind === "textBox"
            ? ("textBox" as const)
            : resolvedKind === "textFontOnly"
              ? ("textFontOnly" as const)
              : ("uniform" as const);
        const current = resolveItemTune(next, ref, editableBand);
        const patch = itemTunePatchFromTransformDelta({
          tune: current,
          delta,
          displayBounds,
          kind: patchKind,
        });
        if (!patch) continue;
        const result = patchItemTune({
          blueprint: next,
          target: ref,
          band: editableBand,
          patch,
        });
        next = result.blueprint;
        changed = changed || result.changed;
      }
      if (changed) commitTune({ blueprint: next, changed: true });
    },
    [
      blueprint,
      commitTune,
      displayUnits,
      editableBand,
      persistGate.allowed,
      presentationTree,
      selectionIndex,
    ],
  );

  const onTransformLive = useCallback(
    (
      draft: {
        delta: { dx: number; dy: number; dw: number; dh: number };
        startBounds: { x: number; y: number; width: number; height: number };
      } | null,
    ) => {
      if (!draft) {
        if (transformLiveRafRef.current != null) {
          cancelAnimationFrame(transformLiveRafRef.current);
          transformLiveRafRef.current = null;
        }
        transformLivePendingRef.current = null;
        setTransformLiveDraft(null);
        return;
      }
      if (!editableBand || !selectionIndex || !persistGate.allowed) return;
      const refs = listTransformableItemTargets({ units: displayUnits, blueprint });
      if (refs.length === 0) return;
      const isMulti = refs.length > 1;
      if (isMulti && (draft.delta.dw || draft.delta.dh)) return;
      const refKeys = new Set(refs.map(itemRefKey));
      const items: NonNullable<typeof transformLiveDraft>["items"] = [];
      for (const unit of displayUnits) {
        const ref = resolveItemRef(unit, blueprint);
        if (!ref || !refKeys.has(itemRefKey(ref))) continue;
        const bounds =
          presentationBoundsForUnit(unit, presentationTree, selectionIndex) ??
          boundsForUnit(unit, blueprint, selectionIndex);
        if (!bounds) continue;
        items.push({
          target: ref,
          startBounds: isMulti ? bounds : draft.startBounds,
          kind: isMulti
            ? "moveOnly"
            : resolveItemTransformKind({
                blueprint,
                target: ref,
                index: selectionIndex,
              }),
        });
      }
      if (items.length === 0) return;
      transformLivePendingRef.current = {
        delta: draft.delta,
        band: editableBand,
        items,
      };
      if (transformLiveRafRef.current != null) return;
      transformLiveRafRef.current = requestAnimationFrame(() => {
        transformLiveRafRef.current = null;
        const pending = transformLivePendingRef.current;
        if (pending) setTransformLiveDraft(pending);
      });
    },
    [
      blueprint,
      displayUnits,
      editableBand,
      persistGate.allowed,
      presentationTree,
      selectionIndex,
    ],
  );

  const transformLiveItemKey =
    refineModel?.itemRef == null
      ? null
      : refineModel.itemRef.kind === "layer"
        ? `layer:${refineModel.itemRef.layerId}`
        : `node:${refineModel.itemRef.nodeId}`;

  useEffect(() => {
    setTransformLiveDraft(null);
  }, [editableBand, transformLiveItemKey]);

  const onFontScale = useCallback(
    (value: number) => {
      if (!editableBand || !refineModel?.itemRef) return;
      commitTune(
        patchItemTune({
          blueprint,
          target: refineModel.itemRef,
          band: editableBand,
          patch: { fontScale: value },
        }),
      );
    },
    [blueprint, commitTune, editableBand, refineModel],
  );

  const microbarModel = useMemo((): SiteCreatorMicrobarModel | null => {
    if (!selectionIndex) return null;

    if (displayUnits.length > 1) {
      const hullBounds = unitOutlines.map((o) => o.bounds);
      if (hullBounds.length === 0) return null;
      const xs = hullBounds.map((b) => b.x);
      const ys = hullBounds.map((b) => b.y);
      const x2 = hullBounds.map((b) => b.x + b.width);
      const y2 = hullBounds.map((b) => b.y + b.height);
      const bounds = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...x2) - Math.min(...xs),
        height: Math.max(...y2) - Math.min(...ys),
      };
      return {
        bounds,
        segments: [],
        summary: null,
        actions: contextualModel.primaryActions,
        hoverOnly: false,
      };
    }

    if (displayUnits.length === 1) {
      const unit = displayUnits[0]!;
      const bounds =
        presentationBoundsForUnit(unit, presentationTree, selectionIndex) ??
        boundsForUnit(unit, blueprint, selectionIndex);
      if (!bounds) return null;
      const segments: SiteCreatorMicrobarModel["segments"] = [];
      const multiCardNode =
        unit.kind === "blueprintNode" ? blueprint.nodes[unit.nodeId] : null;
      const datasetBound =
        Boolean(multiCardNode && isSiteMultiCardNode(multiCardNode) && isMultiCardDatasetBound(multiCardNode));
      const multiCardActiveCardId =
        multiCardNode && isSiteMultiCardNode(multiCardNode)
          ? multiCardActiveCardByNodeId[multiCardNode.id] ??
            multiCardNode.cards[Math.max(0, multiCardNode.cards.length - 1)]?.id ??
            multiCardNode.cards[0]?.id ??
            null
          : null;
      const multiCardActiveIndex =
        multiCardNode && isSiteMultiCardNode(multiCardNode) && multiCardActiveCardId
          ? Math.max(
              0,
              multiCardNode.cards.findIndex((card) => card.id === multiCardActiveCardId),
            )
          : 0;
      const multiCardSlot =
        multiCardNode && isSiteMultiCardNode(multiCardNode) ? (
          <div className="flex items-center gap-1">
            <SiteCreatorMultiCardControl
              model={{
                nodeId: multiCardNode.id,
                count: multiCardNode.count,
                layoutMode: resolveMultiCardBandPresentation(
                  blueprint,
                  multiCardNode,
                  responsiveBand,
                  layoutWidth,
                  referenceWidth,
                ).layoutMode,
                activeCardIndex: multiCardActiveIndex,
                canDuplicate:
                  !datasetBound &&
                  multiCardNode.count < MULTICARD_COUNT_MAX &&
                  Boolean(multiCardActiveCardId),
                canRemoveActive:
                  !datasetBound && multiCardActiveIndex > 0 && multiCardNode.count > 1,
                canMoveLeft: !datasetBound && multiCardActiveIndex > 1,
                canMoveRight:
                  !datasetBound &&
                  multiCardActiveIndex > 0 &&
                  multiCardActiveIndex < multiCardNode.cards.length - 1,
                datasetBound,
                hasException: Object.keys(
                  multiCardNode.cards[multiCardActiveIndex]?.overrides ?? {},
                ).length > 0,
              }}
              onCountChange={(count) => commitMultiCardOp(setMultiCardCount(blueprint, multiCardNode.id, count))}
              onLayoutMode={(mode) =>
                commitMultiCardOp(
                  setMultiCardLayoutMode(
                    blueprint,
                    multiCardNode.id,
                    mode,
                    viewportBand === "original" ? "wide" : responsiveBand === "wide" ? "wide" : responsiveBand,
                  ),
                )
              }
              onDuplicateActive={() => {
                if (!multiCardActiveCardId) return;
                const result = duplicateMultiCardCard(
                  blueprint,
                  multiCardNode.id,
                  multiCardActiveCardId,
                );
                if (result.ok && result.blueprint) {
                  const nextNode = result.blueprint.nodes[multiCardNode.id];
                  if (nextNode && isSiteMultiCardNode(nextNode)) {
                    const from = nextNode.cards.findIndex((card) => card.id === multiCardActiveCardId);
                    const copy = from >= 0 ? nextNode.cards[from + 1] : null;
                    if (copy) {
                      setMultiCardActiveCardByNodeId((current) => ({
                        ...current,
                        [multiCardNode.id]: copy.id,
                      }));
                    }
                  }
                }
                commitMultiCardOp(result);
              }}
              onRemoveActive={() => {
                if (!multiCardActiveCardId) return;
                const result = removeMultiCardCard(
                  blueprint,
                  multiCardNode.id,
                  multiCardActiveCardId,
                );
                if (result.ok && result.blueprint) {
                  const nextNode = result.blueprint.nodes[multiCardNode.id];
                  if (nextNode && isSiteMultiCardNode(nextNode)) {
                    const fallback =
                      nextNode.cards[Math.min(multiCardActiveIndex, nextNode.cards.length - 1)] ??
                      nextNode.cards[0];
                    if (fallback) {
                      setMultiCardActiveCardByNodeId((current) => ({
                        ...current,
                        [multiCardNode.id]: fallback.id,
                      }));
                    }
                  }
                }
                commitMultiCardOp(result);
              }}
              onMoveActive={(direction) => {
                if (!multiCardActiveCardId) return;
                commitMultiCardOp(
                  moveMultiCardCard(blueprint, multiCardNode.id, multiCardActiveCardId, direction),
                );
              }}
            />
            {multiCardTextEdit && multiCardTextEdit.nodeId === multiCardNode.id ? (
              <input
                data-testid="site-creator-multicard-text-edit"
                aria-label="Texto de la card"
                className="h-6 w-28 rounded border border-white/15 bg-white/10 px-1.5 text-[10px] text-white outline-none"
                value={multiCardTextEdit.text}
                autoFocus
                onChange={(e) =>
                  setMultiCardTextEdit((current) =>
                    current ? { ...current, text: e.target.value } : current,
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitMultiCardOp(
                      setMultiCardSlotOverride({
                        blueprint,
                        nodeId: multiCardTextEdit.nodeId,
                        cardId: multiCardTextEdit.cardId,
                        moldLayerId: multiCardTextEdit.moldLayerId,
                        patch: { text: multiCardTextEdit.text },
                      }),
                    );
                    setMultiCardTextEdit(null);
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setMultiCardTextEdit(null);
                  }
                }}
                onBlur={() => {
                  if (!multiCardTextEdit) return;
                  commitMultiCardOp(
                    setMultiCardSlotOverride({
                      blueprint,
                      nodeId: multiCardTextEdit.nodeId,
                      cardId: multiCardTextEdit.cardId,
                      moldLayerId: multiCardTextEdit.moldLayerId,
                      patch: { text: multiCardTextEdit.text },
                    }),
                  );
                  setMultiCardTextEdit(null);
                }}
              />
            ) : null}
          </div>
        ) : null;
      return {
        bounds,
        segments,
        actions: contextualModel.primaryActions,
        summary: null,
        hoverOnly: false,
        adaptationSlot: adaptationModel ? (
          <SiteCreatorAdaptationControl
            model={adaptationModel}
            onSelectMode={onAdaptationSelectMode}
            onFocusController={onAdaptationFocusController}
          />
        ) : null,
        multiCardSlot,
      };
    }

    if (hoverUnit) {
      const bounds =
        presentationBoundsForUnit(hoverUnit, presentationTree, selectionIndex) ??
        boundsForUnit(hoverUnit, blueprint, selectionIndex);
      if (!bounds) return null;
      const pres = findPresentationNode(presentationTree, hoverUnit);
      const label =
        pres?.label ??
        (hoverUnit.kind === "layer"
          ? deriveLayerDisplayLabel(hoverUnit.layerId, selectionIndex, snapshot)
          : containerDisplayLabel(blueprint.nodes[hoverUnit.nodeId]!, snapshot, selectionIndex));
      return {
        bounds,
        segments: [],
        summary: label,
        actions: [],
        hoverOnly: true,
      };
    }
    return null;
  }, [
    adaptationModel,
    blueprint,
    contextualModel.primaryActions,
    contextualModel.summary,
    displayUnits,
    hoverUnit,
    mediaBand,
    onAdaptationFocusController,
    onAdaptationSelectMode,
    presentationTree,
    selectionIndex,
    snapshot,
    unitOutlines,
    commitMultiCardOp,
    layoutWidth,
    multiCardActiveCardByNodeId,
    multiCardTextEdit,
    referenceWidth,
    responsiveBand,
    viewportBand,
  ]);

  const onMicrobarNavigate = useCallback(
    (unit: SiteCreatorSelectionUnit) => {
      setSelectionFromMarquee(false);
      setMarqueeGroupBlockOpen(false);
      if (unit.kind === "blueprintNode") {
        // Clic en ancestro: path = ancestros de ese nodo
        const path: string[] = [];
        let walk: string | null = blueprint.nodes[unit.nodeId]?.parentId ?? null;
        while (walk) {
          path.unshift(walk);
          walk = blueprint.nodes[walk]?.parentId ?? null;
        }
        setInteractionPath(path);
        setUnits([unit]);
        return;
      }
      if (!selectionIndex) return;
      const parent = unitStructureParentId(unit, blueprint, selectionIndex);
      const path: string[] = [];
      let walk: string | null = parent;
      while (walk) {
        path.unshift(walk);
        walk = blueprint.nodes[walk]?.parentId ?? null;
      }
      setInteractionPath(path);
      setUnits([unit]);
    },
    [blueprint, selectionIndex],
  );


  useEffect(() => {
    if (!hoverUnit) return;
    const key =
      hoverUnit.kind === "layer"
        ? `layer:${hoverUnit.layerId}`
        : `node:${hoverUnit.nodeId}`;
    setOutlineHoverKey(key);
  }, [hoverUnit]);

  useEffect(() => {
    if (displayUnits.length !== 1) return;
    setExpandedTreeIds((prev) => expandPathForUnit(presentationTree, displayUnits[0]!, prev));
  }, [displayUnits, presentationTree]);

  const visualLayerCount =
    committedIndex && blueprint
      ? countUnstructuredVisualLayers(blueprint, committedIndex)
      : page
        ? countSnapshotLayers(page)
        : 0;

  const referenceState = useMemo(
    () => resolveSiteBlueprintReferenceState(blueprint, snapshot ?? undefined),
    [blueprint, snapshot],
  );
  const reviewCount = useMemo(() => {
    const brokenNodes = listBrokenResponsiveTargets(blueprint, selectionIndex).filter(
      (t) => t.kind === "blueprintNode",
    ).length;
    return referenceState.missingLayerIds.length + brokenNodes;
  }, [blueprint, referenceState.missingLayerIds.length, selectionIndex]);

  const resolveOutlineOverride = useCallback(
    (node: SiteCreatorPresentationNode) => {
      if (!node.unit || responsiveBand === "wide") return null;
      const editable = bandToEditable(responsiveBand);
      const hidden =
        editable && node.unit ? unitHiddenInCurrentBand(node.unit, blueprint, editable) : false;
      const custom = unitCustomizationDotState({
        blueprint,
        unit: node.unit,
        currentBand: responsiveBand,
        index: selectionIndex,
      });
      if (custom) {
        return {
          dot: custom,
          title: unitCustomizationTooltip({
            blueprint,
            unit: node.unit,
            index: selectionIndex,
          }) ?? "",
          hidden,
        };
      }
      const target = resolveResponsiveTarget(node.unit, blueprint, selectionIndex);
      if (!target) {
        return hidden ? { dot: "current" as const, title: "Oculto en esta vista", hidden: true } : null;
      }
      const dot = treeOverrideDotState({
        blueprint,
        target,
        currentBand: responsiveBand,
      });
      if (!dot) {
        return hidden ? { dot: "current" as const, title: "Oculto en esta vista", hidden: true } : null;
      }
      return {
        dot,
        title: treeOverrideTooltip({ blueprint, target }) ?? "",
        hidden,
      };
    },
    [blueprint, responsiveBand, selectionIndex],
  );

  const resolveOutlineVisibility = useCallback(
    (
      node: SiteCreatorPresentationNode,
      band: ResponsiveVisibilityBand,
    ): { hidden: boolean; inherited?: boolean } | null => {
      if (!node.unit) return null;
      const target = visibilityRefForUnit(node.unit);
      const direct = isHiddenItemTune(blueprint, target, band);
      if (direct) return { hidden: true, inherited: false };
      if (node.unit.kind === "layer") {
        const inherited = isLayerHiddenInBand({
          blueprint,
          layerId: node.unit.layerId,
          band,
        });
        return { hidden: inherited, inherited };
      }
      const coverage = collectSemanticCoverageLayerIds(
        blueprint,
        node.unit.nodeId,
      );
      const inherited =
        coverage.length > 0 &&
        coverage.every((layerId) =>
          isLayerHiddenInBand({ blueprint, layerId, band }),
        );
      return { hidden: inherited, inherited };
    },
    [blueprint],
  );

  const toggleOutlineVisibility = useCallback(
    (
      node: SiteCreatorPresentationNode,
      band: ResponsiveVisibilityBand,
    ) => {
      if (!node.unit) return;
      const state = resolveOutlineVisibility(node, band);
      if (state?.inherited) return;
      const current = blueprintRef.current;
      const target = visibilityRefForUnit(node.unit);
      commitTune(
        patchItemTune({
          blueprint: current,
          target,
          band,
          patch: {
            hidden: !isHiddenItemTune(current, target, band),
          },
        }),
      );
    },
    [commitTune, resolveOutlineVisibility],
  );

  const showAllOutlineVisibility = useCallback(() => {
    const band = responsiveBand;
    let next = blueprintRef.current;
    let changed = false;
    for (const rule of next.responsive?.items ?? []) {
      if (rule.byBand[band]?.hidden !== true) continue;
      const result = patchItemTune({
        blueprint: next,
        target: rule.target,
        band,
        patch: { hidden: false },
      });
      if (result.changed) {
        next = result.blueprint;
        changed = true;
      }
    }
    if (changed) commitTune({ blueprint: next, changed: true });
  }, [commitTune, responsiveBand]);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable ||
        Boolean(target.closest('[contenteditable="true"], input, textarea, select'))
      );
    };

    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) return;

      if (!event.metaKey && !event.ctrlKey && !event.altKey && (event.key === "p" || event.key === "P")) {
        event.preventDefault();
        event.stopPropagation();
        togglePagePreview();
        return;
      }
      if (pagePreviewMode && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        exitPagePreview();
        return;
      }
      if (pagePreviewMode) return;
      if (event.key === "Escape" && armedDatasetChip) {
        event.preventDefault();
        event.stopPropagation();
        setArmedDatasetChip(null);
        return;
      }

      if (
        event.key === "Tab" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        event.stopPropagation();
        applyViewportBand(cycleViewportBand(viewportBand, event.shiftKey ? -1 : 1));
        return;
      }

      const meta = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      // Undo / Redo del blueprint — captura para no disparar el lienzo general.
      if (meta && key === "z") {
        event.preventDefault();
        event.stopPropagation();
        const next = event.shiftKey
          ? redoBlueprintHistory(historyRef.current)
          : undoBlueprintHistory(historyRef.current);
        if (!next) return;
        historyRef.current = next;
        writeCountRef.current += 1;
        onBlueprintChange(next.present);
        return;
      }
      if (meta && key === "y") {
        event.preventDefault();
        event.stopPropagation();
        const next = redoBlueprintHistory(historyRef.current);
        if (!next) return;
        historyRef.current = next;
        writeCountRef.current += 1;
        onBlueprintChange(next.present);
        return;
      }

      // Suprimir / Retroceso: estructura interna, nunca el nodo del lienzo.
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        event.stopPropagation();
        removeSelectedStructure();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [
    applyViewportBand,
    armedDatasetChip,
    exitPagePreview,
    onBlueprintChange,
    pagePreviewMode,
    removeSelectedStructure,
    togglePagePreview,
    viewportBand,
  ]);

  const originLabel = siteCreatorOriginStateLabel(originState);
  const designerLine = designerLabel?.trim() || snapshot?.designerNodeId || "—";

  const textOptions =
    committedIndex && buttonPrompt
      ? extractAccessibleLabelFromLayers(structureLayerIds, committedIndex).textLayerIds.map(
          (id) => ({ id, name: committedIndex.byId[id]?.name ?? id }),
        )
      : [];

  const heroDisabled = Object.values(blueprint.nodes).some(
    (n) => isSiteSectionNode(n) && n.sectionType === "hero",
  );
  const selectedSectionId =
    displayUnits.length === 1 && displayUnits[0]?.kind === "blueprintNode"
      ? (() => {
          const node = blueprint.nodes[displayUnits[0].nodeId];
          return node && isSiteSectionNode(node) ? node.id : null;
        })()
      : null;

  const PreviewDeviceIcon =
    responsiveBand === "wide"
      ? Square
      : responsiveBand === "monitor"
        ? Monitor
        : responsiveBand === "tablet"
          ? Tablet
          : Smartphone;
  const canResetBand = Boolean(
    editableBand && bandHasCustomizations(blueprint, editableBand),
  );
  const resetBandLabel = editableBand ? editableBandResetLabel(editableBand) : "Restablecer vista";
  const headerDeviceControls = pagePreviewMode ? (
    <span
      data-testid="site-creator-preview-live-band"
      title={`${responsiveBand === "wide" ? "Original" : responsiveBand === "monitor" ? "Monitor" : responsiveBand === "tablet" ? "Tablet" : "Móvil"} · ${Math.round(effectiveViewportWidth)} px`}
      className="pointer-events-auto inline-flex h-7 w-11 items-center justify-center bg-white/10 text-white/80"
    >
      <PreviewDeviceIcon className="h-3.5 w-3.5" aria-hidden />
    </span>
  ) : (
    <div
      data-testid="site-creator-header-device-controls"
      className="pointer-events-auto flex h-8 items-center border border-white/12 bg-black/25 px-0.5"
    >
      <button
        type="button"
        data-testid="site-creator-preset-original"
        aria-label="Original"
        title={`Original · ${Math.round(referenceWidth)} px`}
        className={`flex h-7 w-11 items-center justify-center transition ${
          viewportBand === "original"
            ? "bg-white/12 text-white"
            : "text-white/40 hover:bg-white/6 hover:text-white/80"
        }`}
        onClick={() => applyViewportBand("original")}
      >
        <Square className="h-3.5 w-3.5" aria-hidden />
      </button>
      <SiteCreatorDeviceSelector
        band="monitor"
        bandLabel="Monitor"
        active={viewportBand === "monitor"}
        config={monitorDevice}
        referenceWidth={referenceWidth}
        resolvedWidth={monitorDimensions.width}
        resolvedHeight={monitorDimensions.height}
        sizeLabel={monitorDimensions.sizeLabel}
        portalHost={floatingHostEl}
        compact
        onActivate={() => applyViewportBand("monitor")}
        onConfigChange={(config) => {
          setMonitorDevice(config);
          setViewportBand("monitor");
          const width = resolveDeviceDimensions({
            band: "monitor",
            config,
            referenceWidth,
          }).width;
          if (!persistGate.allowed) return;
          const updated = setMonitorMaxWidth(blueprintRef.current, width, referenceWidth);
          blueprintRef.current = updated;
          commitBlueprint(updated);
        }}
      />
      <SiteCreatorDeviceSelector
        band="tablet"
        bandLabel="Tablet"
        active={viewportBand === "tablet"}
        config={tabletDevice}
        referenceWidth={referenceWidth}
        resolvedWidth={tabletDimensions.width}
        resolvedHeight={tabletDimensions.height}
        sizeLabel={tabletDimensions.sizeLabel}
        portalHost={floatingHostEl}
        compact
        onActivate={() => applyViewportBand("tablet")}
        onConfigChange={(config) => {
          setTabletDevice(config);
          setViewportBand("tablet");
        }}
      />
      <SiteCreatorDeviceSelector
        band="mobile"
        bandLabel="Móvil"
        active={viewportBand === "mobile"}
        config={mobileDevice}
        referenceWidth={referenceWidth}
        resolvedWidth={mobileDimensions.width}
        resolvedHeight={mobileDimensions.height}
        sizeLabel={mobileDimensions.sizeLabel}
        portalHost={floatingHostEl}
        compact
        onActivate={() => applyViewportBand("mobile")}
        onConfigChange={(config) => {
          setMobileDevice(config);
          setViewportBand("mobile");
        }}
      />
      <SiteCreatorOrientationToggle
        compact
        visible={viewportBand === "monitor" || viewportBand === "tablet" || viewportBand === "mobile"}
        orientation={
          viewportBand === "monitor"
            ? monitorDevice.orientation
            : viewportBand === "tablet"
              ? tabletDevice.orientation
              : mobileDevice.orientation
        }
        onChange={(orientation) => {
          if (viewportBand === "monitor") {
            setMonitorDevice((prev) => ({ ...prev, orientation }));
          } else if (viewportBand === "tablet") {
            setTabletDevice((prev) => ({ ...prev, orientation }));
          } else if (viewportBand === "mobile") {
            setMobileDevice((prev) => ({ ...prev, orientation }));
          }
        }}
      />
      <button
        type="button"
        data-testid="site-creator-reset-band"
        disabled={!canResetBand}
        aria-label={resetBandLabel}
        title={
          canResetBand
            ? resetBandLabel
            : editableBand
              ? "Esta vista no tiene personalizaciones"
              : "Restablecer está disponible en Monitor, Tablet y Móvil"
        }
        className={`flex h-7 w-11 items-center justify-center border-l border-white/10 text-white/40 transition hover:bg-white/[0.06] hover:text-white ${
          canResetBand ? "" : "cursor-default opacity-20"
        }`}
        onClick={() => {
          if (!editableBand) return;
          commitTune(resetResponsiveBand({ blueprint, band: editableBand }));
        }}
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );

  const headerTitleSlot = (
    <div className="flex min-w-0 w-full flex-1 items-center gap-3 text-[10px]">
      <div className="flex min-w-0 shrink items-center gap-3">
        <span className="shrink-0 font-black uppercase tracking-[0.1em] text-white">{nodeLabel}</span>
        <span className="truncate text-white/45">Designer / {designerLine}</span>
        {isOriginStatusActionable(originState) ? (
          <button
            type="button"
            className="truncate font-semibold text-[#22d3ee] underline-offset-2 hover:underline"
            onClick={openReviewDialog}
            disabled={syncBusy}
          >
            {originLabel}
          </button>
        ) : (
          <span className="truncate font-medium text-white/55">{originLabel}</span>
        )}
      </div>
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
        {headerDeviceControls}
      </div>
      <div className="min-w-0 flex-1" />
      {publishError ||
      structureError ||
      (contextualModel.statusMessage &&
        contextualModel.statusMessage !== "Ctrl/Cmd + clic para añadir elementos") ? (
        <span
          className="max-w-[220px] shrink-0 truncate text-[10px] text-rose-300/90"
          title={publishError ?? structureError ?? contextualModel.statusMessage ?? undefined}
        >
          {publishError ?? structureError ?? contextualModel.statusMessage}
        </span>
      ) : (
        <span className="w-0 shrink-0" />
      )}
    </div>
  );

  return (
    <div
      className="site-creator-studio fixed inset-0 z-[100010] flex flex-col bg-[#0b0f14] text-white"
      data-foldder-studio-root
      data-foldder-studio-canvas=""
      data-foldder-site-creator-studio=""
      data-site-creator-page-preview={pagePreviewMode ? "1" : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={setFloatingHostRef}
        className="site-creator-floating-layer pointer-events-none fixed inset-0 z-[100050]"
        aria-hidden
      />
      <FoldderStudioHeader
        nodeType="siteCreator"
        nodeLabel={nodeLabel}
        onClose={onClose}
        iconBackground={SITE_CREATOR_ACCENT}
        titleSlot={headerTitleSlot}
        actions={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="site-creator-publish"
              title={publish ? "Publicar de nuevo" : "Publicar sitio"}
              aria-label={
                publishing
                  ? "Publicando"
                  : publish
                    ? "Publicar de nuevo"
                    : "Publicar"
              }
              disabled={!canPublish}
              onClick={() => void handlePublish()}
              className={foldderStudioHeaderIconActionClassName(
                publish ? "bg-[#22d3ee]/20 text-[#22d3ee] hover:bg-[#22d3ee]/30" : "",
              )}
            >
              {publishing ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" strokeWidth={2.25} aria-hidden />
              ) : (
                <Globe className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
              )}
            </button>
            {publishedUrl ? (
              <a
                data-testid="site-creator-publish-open"
                href={publishedUrl}
                target="_blank"
                rel="noreferrer"
                title="Abrir web publicada"
                aria-label="Abrir web publicada"
                className={foldderStudioHeaderIconActionClassName()}
              >
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              </a>
            ) : null}
            {publish ? (
              <button
                type="button"
                data-testid="site-creator-unpublish"
                title="Quitar la web publicada"
                aria-label="Despublicar"
                disabled={publishing}
                onClick={() => void handleUnpublish()}
                className={foldderStudioHeaderIconActionClassName("text-white/55")}
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2.1} aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              data-testid="site-creator-page-preview-toggle"
              aria-pressed={pagePreviewMode}
              aria-label={pagePreviewMode ? "Salir de Preview" : "Preview"}
              title={pagePreviewMode ? "Salir de Preview (P)" : "Preview (P)"}
              onClick={togglePagePreview}
              className={foldderStudioHeaderIconActionClassName(
                pagePreviewMode ? "bg-[#a3e635]/20 text-[#a3e635] hover:bg-[#a3e635]/30" : "",
              )}
            >
              <Eye className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
            </button>
          </div>
        }
      />

      <div className="site-creator-studio__body flex min-h-0 flex-1">
        {pagePreviewMode ? null : (
        <SiteCreatorOutlinePanel
          tree={presentationTree}
          selectedUnits={displayUnits}
          hoveredKey={outlineHoverKey}
          expandedIds={expandedTreeIds}
          onExpandedIdsChange={setExpandedTreeIds}
          onSelectUnit={(unit, additive, pathNodeIds) => {
            if (!unit) {
              clearUnitsAndInspect();
              return;
            }
            setSelectionFromMarquee(false);
            setMarqueeGroupBlockOpen(false);
            if (additive) {
              setUnits((current) => toggleSelectionUnit(current, unit, blueprint));
            } else {
              setInteractionPath(pathNodeIds);
              setUnits([unit]);
            }
            setStructureError(null);
            if (selectionIndex) {
              const bounds = boundsForUnit(unit, blueprint, selectionIndex);
              if (bounds) {
                setRevealPageRect({
                  requestId: Date.now(),
                  rect: bounds,
                });
              }
            }
          }}
          onHoverUnit={(unit, key) => {
            setOutlineHoverKey(key);
            if (!unit || !selectionIndex) {
              setDesignerShadow((s) => ({ ...s, hoverId: null }));
              return;
            }
            if (unit.kind === "layer") {
              setDesignerShadow((s) => ({ ...s, hoverId: unit.layerId }));
              return;
            }
            const coverage = collectSemanticCoverageLayerIds(blueprint, unit.nodeId);
            setDesignerShadow((s) => ({ ...s, hoverId: coverage[0] ?? null }));
          }}
          onReparentToSemantic={(targetNodeId, source) => {
            if (!committedIndex || !source.unit) return;
            const target = blueprint.nodes[targetNodeId];
            if (!target || isSiteButtonNode(target)) {
              setStructureError("No se puede soltar aquí.");
              return;
            }
            if (
              source.kind === "semantic" &&
              (source.nodeId === targetNodeId ||
                (function isCycle() {
                  let w: string | null = targetNodeId;
                  while (w) {
                    if (w === source.nodeId) return true;
                    w = blueprint.nodes[w]?.parentId ?? null;
                  }
                  return false;
                })())
            ) {
              setStructureError("No se puede mover un contenedor dentro de sí mismo.");
              return;
            }
            const result = reparentUnitsToContainer({
              blueprint,
              units: [source.unit],
              targetContainerId: targetNodeId,
              index: committedIndex,
            });
            if (!result.ok) {
              setStructureError(result.message);
              return;
            }
            commitBlueprint(result.blueprint);
            setInteractionPath([targetNodeId]);
            setSelectionFromMarquee(false);
            setMarqueeGroupBlockOpen(false);
            setUnits([source.unit]);
          }}
          visualLayerCount={visualLayerCount}
          reviewCount={reviewCount}
          resolveOverride={resolveOutlineOverride}
          activeVisibilityBand={responsiveBand}
          resolveVisibility={resolveOutlineVisibility}
          onToggleVisibility={toggleOutlineVisibility}
          onShowAllVisibility={showAllOutlineVisibility}
          selectionIndex={selectionIndex}
          canvasLockForUnit={(unit) => {
            const own = isUnitOwnCanvasLocked(blueprint, unit);
            const locked = selectionIndex
              ? isUnitCanvasLocked(blueprint, unit, selectionIndex)
              : own;
            return { locked, inherited: locked && !own };
          }}
          onToggleCanvasLock={(unit) => {
            const own = isUnitOwnCanvasLocked(blueprint, unit);
            const inherited = Boolean(
              selectionIndex && isUnitCanvasLocked(blueprint, unit, selectionIndex) && !own,
            );
            if (inherited) return;
            commitBlueprint(setUnitCanvasLock(blueprint, unit, !own));
          }}
          emptyHint={!showPreview ? emptyStateMessage(originState) : null}
        />
        )}

        <main
          className={`site-creator-studio__canvas flex min-h-0 min-w-0 flex-1 flex-col ${
            pagePreviewMode ? "bg-[#f4f4f5]" : "bg-[#171b22]"
          }`}
        >
          {showPreview && displayPage ? (
            <SiteCreatorPreview
              page={displayPage}
              viewportWidth={effectiveViewportWidth}
              referenceWidth={referenceWidth}
              previewZoom={previewZoom}
              deviceFrame={deviceFrame}
              canvasBackground={pageBackgroundCss}
              readOnly={pagePreviewMode}
              previewPageMaxWidth={
                pagePreviewMode &&
                (responsiveBand === "wide" || responsiveBand === "monitor")
                  ? monitorMaxWidth
                  : undefined
              }
              onViewportWidthChange={
                pagePreviewMode || viewportBand !== "monitor"
                  ? undefined
                  : applyMonitorMaxWidth
              }
              onAvailableSizeChange={setAvailablePreviewSize}
              selection={pagePreviewMode ? undefined : displayShadow}
              selectionIndex={pagePreviewMode ? undefined : selectionIndex ?? undefined}
              blueprint={displayBlueprint}
              onSelectionAction={pagePreviewMode ? undefined : dispatchSelection}
              canvasHitPassthroughImages={pagePreviewMode ? undefined : !displayInspectNodeId}
              unitOutlines={pagePreviewMode ? undefined : unitOutlines}
              hoverOutline={pagePreviewMode ? undefined : hoverOutline}
              contextOutlines={pagePreviewMode ? undefined : contextOutlines}
              sectionOutlines={pagePreviewMode ? undefined : sectionOutlines}
              ghostOutlines={pagePreviewMode ? undefined : ghostOutlines}
              sectionHeight={null}
              onSectionHeight={undefined}
              pageScreenHeight={liveViewportHeight}
              heightBand={liveHeightBand}
              sectionScrollStations={sectionScrollStations}
              sectionSpine={pagePreviewMode ? null : sectionSpineModel}
              onSpineSelectSection={(sectionId) => {
                selectCreatedNode(sectionId);
                setStructureError(null);
              }}
              onSpineRemoveSection={(sectionId) => {
                setRemoveConfirmId(sectionId);
              }}
              onSpineAddSection={() => applySection("generic")}
              onSpineScrollChange={handleSpineScrollChange}
              onSpineHeightModeChange={handleSpineHeightModeChange}
              onSpineCustomHeightChange={handleSpineCustomHeightChange}
              onSpineSourceRangeBottomChange={handleSpineSourceRangeBottomChange}
              onSpinePinToTopChange={handleSpinePinToTopChange}
              pageInsets={pageInsetsModel}
              onPageInsetsChange={pagePreviewMode ? undefined : handlePageInsetsChange}
              revealPageRect={pagePreviewMode ? null : revealPageRect}
              microbar={pagePreviewMode || clipImageEdit ? null : microbarModel}
              onMicrobarNavigate={pagePreviewMode ? undefined : onMicrobarNavigate}
              onMicrobarAction={pagePreviewMode ? undefined : handleMicrobarAction}
              onCanvasInteraction={() => undefined}
              objectClipById={objectClipById}
              multiCardNav={responsive?.multiCard?.containers ?? []}
              onMultiCardScrollIndex={commitMultiCardScrollIndex}
              datasetChipArmed={Boolean(armedDatasetChip)}
              datasetOverlay={
                pagePreviewMode || !dataset
                  ? null
                  : (
                      <SiteCreatorMultiCardDatasetOverlay
                        containers={responsive?.multiCard?.containers ?? []}
                        blueprint={blueprint}
                        dataset={dataset}
                        armed={armedDatasetChip}
                        compatibleBounds={datasetCompatibleBounds}
                        flashUnclaimed={datasetFlash}
                        onClaimList={(nodeId, listId) => {
                          if (!committedIndex) return;
                          commitMultiCardOp(
                            claimMultiCardDatasetList({
                              blueprint,
                              nodeId,
                              dataset,
                              listId,
                              index: committedIndex,
                            }),
                          );
                        }}
                        onArmChip={setArmedDatasetChip}
                        onUnbindLayer={(nodeId, moldLayerId) => {
                          commitMultiCardOp(
                            setMultiCardSlotBinding({
                              blueprint,
                              nodeId,
                              moldLayerId,
                              binding: null,
                            }),
                          );
                          setArmedDatasetChip((current) =>
                            current?.nodeId === nodeId ? null : current,
                          );
                        }}
                      />
                    )
              }
              floatingPortalHost={pagePreviewMode ? null : floatingHostEl}
              transformEnabled={
                !pagePreviewMode && !clipImageEdit && Boolean(transformSelection)
              }
              transformBounds={
                !pagePreviewMode && transformSelection ? transformSelection.bounds : null
              }
              transformCorrection={
                !pagePreviewMode && transformSelection ? transformSelection.correction : null
              }
              onTransformCommit={pagePreviewMode ? undefined : onTransformCommit}
              onTransformLive={pagePreviewMode ? undefined : onTransformLive}
              transformKind={
                !pagePreviewMode && transformSelection ? transformSelection.kind : "uniform"
              }
              textBoxLockWidth={
                refineModel?.itemTune?.widthMode === "full" ||
                refineModel?.itemTune?.widthMode === "container"
              }
              fontScale={transformSelection?.fontScale ?? refineModel?.itemTune?.fontScale ?? 1}
              onFontScale={
                pagePreviewMode
                  ? undefined
                  : transformSelection?.kind === "textBox" ||
                      transformSelection?.kind === "textFontOnly"
                    ? onFontScale
                    : undefined
              }
              focalLayerId={pagePreviewMode ? null : focalLayerId}
              onFocalPoint={(focal) => {
                if (!editableBand || !focalLayerId) return;
                commitTune(
                  patchMediaTune({
                    blueprint,
                    layerId: focalLayerId,
                    band: editableBand,
                    patch: { focal },
                  }),
                );
                setFocalLayerId(null);
              }}
              onCancelFocal={() => setFocalLayerId(null)}
              clipImageEdit={pagePreviewMode ? null : clipImageEdit}
              onEnterClipImageEdit={({ kind = "clip", clipId, imageId }) => {
                const owning = selectionIndex
                  ? findOwningMultiCardDisplay(blueprint, imageId, selectionIndex) ??
                    findOwningMultiCardDisplay(blueprint, clipId, selectionIndex)
                  : null;
                if (owning) {
                  openMultiCardMediaPicker({
                    ...owning,
                    moldLayerId: moldLayerIdFromDisplay(imageId),
                  });
                  return;
                }
                setFocalLayerId(null);
                setClipImageDraft(null);
                const initial =
                  kind === "imageFrame"
                    ? imageFrameTuneForSiteCreator(
                        selectionIndex?.byId[clipId]?.object,
                      )
                    : null;
                setClipImageEditTarget({
                  kind,
                  clipId,
                  imageId,
                  band: mediaBand,
                  ...(initial
                    ? {
                        initialFocal: initial.focal,
                        initialZoom: initial.zoom,
                      }
                    : {}),
                });
              }}
              onClipImageTuneChange={(tune, commit) => {
                if (!clipImageEditTarget || clipImageEditTarget.band !== mediaBand) return;
                if (!commit) {
                  setClipImageDraft({
                    imageId: clipImageEditTarget.imageId,
                    band: mediaBand,
                    focal: tune.focal,
                    zoom: tune.zoom,
                  });
                  return;
                }
                setClipImageDraft(null);
                const pageBgCrop = isDesignerPageBackgroundLayer(
                  page ?? displayPage ?? { objects: [] },
                  clipImageEditTarget.clipId,
                  blueprint,
                )
                  ? patchPageBackgroundCrop({
                      blueprint,
                      sourceLayerId: clipImageEditTarget.clipId,
                      focal: tune.focal,
                      zoom: tune.zoom,
                    })
                  : null;
                const explicit = resolveExplicitBackground(
                  blueprint,
                  clipImageEditTarget.clipId,
                  mediaBand,
                );
                commitTune(
                  pageBgCrop && pageBgCrop.changed
                    ? pageBgCrop
                    : explicit
                    ? patchExplicitBackgroundCrop({
                        blueprint,
                        sourceLayerId: clipImageEditTarget.clipId,
                        band: mediaBand,
                        focal: tune.focal,
                        zoom: tune.zoom,
                      })
                    : patchMediaTune({
                        blueprint,
                        layerId: clipImageEditTarget.imageId,
                        band: mediaBand,
                        patch: tune,
                      }),
                );
              }}
              onResetClipImageEdit={() => {
                if (!clipImageEditTarget || clipImageEditTarget.band !== mediaBand) return;
                setClipImageDraft(null);
                const pageBgReset =
                  page &&
                  isDesignerPageBackgroundLayer(page, clipImageEditTarget.clipId, blueprint)
                    ? patchPageBackgroundCrop({
                        blueprint,
                        sourceLayerId: clipImageEditTarget.clipId,
                        focal: { x: 0.5, y: 0.5 },
                        zoom: 1,
                      })
                    : null;
                const explicit = resolveExplicitBackground(
                  blueprint,
                  clipImageEditTarget.clipId,
                  mediaBand,
                );
                commitTune(
                  pageBgReset && pageBgReset.changed
                    ? pageBgReset
                    : explicit
                    ? patchExplicitBackgroundCrop({
                        blueprint,
                        sourceLayerId: clipImageEditTarget.clipId,
                        band: mediaBand,
                        focal: { x: 0.5, y: 0.5 },
                        zoom: 1,
                      })
                    : resetMediaToAuto({
                        blueprint,
                        layerId: clipImageEditTarget.imageId,
                        band: mediaBand,
                      }),
                );
              }}
              onExitClipImageEdit={() => {
                setClipImageDraft(null);
                setClipImageEditTarget(null);
              }}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center px-8">
              <p className="max-w-md text-center text-sm text-white/50">{emptyStateMessage(originState)}</p>
            </div>
          )}

        </main>
      </div>

      <SiteCreatorButtonLabelPrompt
        open={Boolean(buttonPrompt)}
        textLayerOptions={textOptions}
        requireAccessibleLabel={textOptions.length === 0}
        onCancel={() => setButtonPrompt(null)}
        onConfirm={({ labelLayerId, accessibleLabel }) => {
          applyButton({
            preferredParentId: buttonPrompt?.preferredParentId,
            labelLayerId,
            accessibleLabel,
          });
        }}
      />

      {removeConfirmId ? (
        <div className="fixed inset-0 z-[100055] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg border border-white/10 bg-[#101820] p-4 shadow-2xl">
            <p className="text-sm font-semibold">Quitar estructura</p>
            <p className="mt-2 text-xs text-white/60">
              Los hijos semánticos se conservarán y las capas volverán al padre. El diseño visual no
              cambia.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded px-3 py-1.5 text-[11px] uppercase tracking-wide text-white/50"
                onClick={() => setRemoveConfirmId(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded bg-rose-500/20 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-200"
                onClick={confirmRemove}
              >
                Quitar
              </button>
            </div>
          </div>
        </div>
      ) : null}


      {sectionMenuOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              role="menu"
              aria-label="Crear sección"
              data-testid="site-creator-section-menu"
              className="fixed left-1/2 top-24 z-[100060] w-[260px] -translate-x-1/2 rounded-md border border-white/15 bg-[#101820] p-2 shadow-2xl"
            >
              <p className="px-2 pb-1 text-[9px] font-black uppercase tracking-[0.14em] text-white/40">
                Crear sección
              </p>
              <button
                type="button"
                role="menuitem"
                data-testid="site-creator-section-hero"
                disabled={heroDisabled}
                className="flex w-full flex-col rounded px-2 py-2 text-left hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => {
                  if (heroDisabled) return;
                  setSectionMenuOpen(false);
                  applySection("hero");
                }}
              >
                <span className="text-[12px] font-semibold text-white">Hero</span>
                <span className="text-[10px] text-white/45">
                  {heroDisabled ? "Ya existe un Hero" : "Sección principal de la landing"}
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                data-testid="site-creator-section-generic"
                className="flex w-full flex-col rounded px-2 py-2 text-left hover:bg-white/10"
                onClick={() => {
                  setSectionMenuOpen(false);
                  applySection("generic");
                }}
              >
                <span className="text-[12px] font-semibold text-white">Sección</span>
                <span className="text-[10px] text-white/45">Bloque normal de contenido</span>
              </button>
              <button
                type="button"
                className="mt-1 w-full px-2 py-1 text-left text-[10px] text-white/40"
                onClick={() => setSectionMenuOpen(false)}
              >
                Cancelar
              </button>
            </div>,
            document.body,
          )
        : null}

      {addTargetMenuOpen && contextualModel.addTargetCandidates && typeof document !== "undefined"
        ? createPortal(
            <div
              role="menu"
              aria-label="Añadir a"
              data-testid="site-creator-add-target-menu"
              className="fixed left-1/2 top-24 z-[100060] w-[220px] -translate-x-1/2 rounded-md border border-white/15 bg-[#101820] p-2 shadow-2xl"
            >
              {contextualModel.addTargetCandidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="menuitem"
                  className="block w-full rounded px-2 py-1.5 text-left text-[12px] text-white hover:bg-white/10"
                  onClick={() => {
                    setAddTargetMenuOpen(false);
                    applyAddToContainer(c.id);
                  }}
                >
                  {c.label}
                </button>
              ))}
              <button
                type="button"
                className="mt-1 w-full px-2 py-1 text-left text-[10px] text-white/40"
                onClick={() => setAddTargetMenuOpen(false)}
              >
                Cancelar
              </button>
            </div>,
            document.body,
          )
        : null}

      {marqueeGroupBlockOpen ? (
        <div className="fixed inset-0 z-[100055] flex items-center justify-center bg-black/40 p-4">
          <div
            className="w-full max-w-xs rounded-md border border-white/10 bg-[#101820] p-3 shadow-xl"
            role="dialog"
            aria-labelledby="site-creator-marquee-group-block-title"
            data-testid="site-creator-marquee-group-block"
          >
            <p
              id="site-creator-marquee-group-block-title"
              className="px-2 py-2 text-center text-[13px] text-white"
            >
              {MARQUEE_GROUP_BLOCK_MESSAGE}
            </p>
            <button
              type="button"
              className="mt-1 w-full rounded px-2 py-1.5 text-center text-[12px] text-white/70 hover:bg-white/10"
              onClick={() => setMarqueeGroupBlockOpen(false)}
            >
              Entendido
            </button>
          </div>
        </div>
      ) : null}

      {pendingParentChoice ? (
        <div className="fixed inset-0 z-[100055] flex items-center justify-center bg-black/40 p-4">
          <div
            className="w-full max-w-xs rounded-md border border-white/10 bg-[#101820] p-3 shadow-xl"
            data-testid="site-creator-parent-choice"
          >
            <p className="px-2 pb-1 text-[9px] font-black uppercase tracking-[0.14em] text-white/40">
              ¿Dónde quieres crearlo?
            </p>
            {parentChoices.map((choice) => (
              <button
                key={String(choice.id)}
                type="button"
                className="block w-full rounded px-2 py-1.5 text-left text-[12px] text-white hover:bg-white/10"
                onClick={() => {
                  if (!pendingParentChoice) return;
                  if (pendingParentChoice.kind === "button") applyButton({ preferredParentId: choice.id });
                  else if (pendingParentChoice.kind === "multicard") applyMultiCard(choice.id);
                  else applyGroup(choice.id);
                }}
              >
                {choice.label}
              </button>
            ))}
            <button
              type="button"
              className="mt-1 w-full px-2 py-1 text-left text-[10px] text-white/40"
              onClick={() => setPendingParentChoice(null)}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {snapshot && candidateSnapshot && originDialogOpen && originState === "different_source" ? (
        <SiteCreatorChangeOriginDialog
          open
          blueprint={blueprint}
          currentSnapshot={snapshot}
          candidateSnapshot={candidateSnapshot}
          currentDesignerLabel={snapshot.designerNodeId}
          newDesignerLabel={designerLabel?.trim() || candidateSnapshot.designerNodeId}
          busy={syncBusy}
          errorMessage={syncErrorMessage}
          onCancel={closeOriginDialog}
          onConfirm={onConfirmOriginChange}
        />
      ) : null}

      {syncErrorMessage && !originDialogOpen ? (
        <div className="pointer-events-none fixed bottom-14 left-1/2 z-[100040] -translate-x-1/2 rounded border border-rose-400/40 bg-[#101820] px-4 py-2 text-xs text-rose-200 shadow-lg">
          {syncErrorMessage === "stale" ? STALE_SYNC_MESSAGE : syncErrorMessage}
        </div>
      ) : null}
      {multiCardMediaPick ? (
        <SiteCreatorMediaPicker
          items={pickerMediaItems}
          onClose={() => setMultiCardMediaPick(null)}
          onPick={(item) => {
            commitMultiCardOp(
              setMultiCardSlotOverride({
                blueprint,
                nodeId: multiCardMediaPick.nodeId,
                cardId: multiCardMediaPick.cardId,
                moldLayerId: multiCardMediaPick.moldLayerId,
                patch: {
                  mediaRef: {
                    src: item.url,
                    ...(item.s3Key ? { s3Key: item.s3Key } : {}),
                  },
                },
              }),
            );
            setMultiCardMediaPick(null);
          }}
        />
      ) : null}
    </div>
  );
}
