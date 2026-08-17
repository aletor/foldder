"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, Globe, Loader2 } from "lucide-react";
import { getPageDimensions } from "../indesign/page-formats";
import { FoldderStudioHeader, foldderStudioHeaderActionClassName } from "../FoldderStudioHeader";
import { SiteCreatorPreview } from "./SiteCreatorPreview";
import {
  SiteCreatorDeviceSelector,
  SiteCreatorOrientationToggle,
} from "./SiteCreatorDeviceSelector";
import {
  clampViewportWidth,
  computeFillWidthPreviewZoom,
  computeFitPreviewZoom,
  defaultDeviceConfig,
  resolveDeviceDimensions,
  type SiteCreatorDeviceConfig,
  type SiteCreatorViewportBand,
} from "./site-creator-viewport";
import { resolveSiteCreatorResponsiveDisplay, bandForViewportWidth } from "./site-creator-responsive";
import { countContainerReflowUnits } from "./site-creator-responsive-apply";
import {
  SiteCreatorAdaptationControl,
  adaptationButtonLabel,
} from "./SiteCreatorAdaptationControl";
import { SiteCreatorRefineControl } from "./SiteCreatorRefineControl";
import { resolveAdaptationCapability } from "./site-creator-adaptation-capability";
import {
  bandToEditable,
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
  resolveItemRef,
  resolveItemTune,
  resolveMediaTune,
  unitCustomizationDotState,
  unitCustomizationTooltip,
} from "./site-creator-responsive-tunes";
import { analyzeSectionVisualPresentation } from "./site-creator-responsive-visual";
import { SiteCreatorChangeOriginDialog } from "./SiteCreatorChangeOriginDialog";
import { SiteCreatorOutlinePanel, expandPathForUnit } from "./SiteCreatorOutlinePanel";
import { SiteCreatorButtonLabelPrompt } from "./SiteCreatorSelectionToolbar";
import type { SiteCreatorUnitOutline } from "./SiteCreatorSelectionSurface";
import type { SiteCreatorGhostOutline } from "./SiteCreatorSelectionOverlay";
import type { SiteCreatorMicrobarModel } from "./SiteCreatorObjectMicrobar";
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
  unitStructureParentId,
  type SiteCreatorPrimaryAction,
} from "./site-creator-contextual-actions";
import { resolveSiteBlueprintReferenceState } from "./site-creator-blueprint-refs";
import { countSnapshotLayers } from "./designer-source-layers";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
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
import type { DesignerSourceSnapshotV1, ResponsiveEditableBand, ResponsiveItemRef, SiteBlueprintV1, SiteCreatorPublishStateV1 } from "./site-creator-types";
import { isSiteButtonNode, isSiteSectionNode } from "./site-creator-types";
import {
  collectPublishImageRefs,
  compilePublishedSite,
  publishAssetPlaceholder,
} from "./site-creator-publish-compile";
import type { DesignerPageState } from "../designer/DesignerNode";
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
} from "./site-blueprint-ownership";
import {
  createButtonFromSelection,
  createLayoutGroupFromSelection,
  createSectionFromSelection,
  extractAccessibleLabelFromLayers,
  removeBlueprintNodePreservingContent,
  removeUnitsFromContainer,
  reparentUnitsToContainer,
  resolveButtonParent,
  semanticNodeBounds,
} from "./site-blueprint-ops";
import { applyNewSectionResponsiveDefaults } from "./site-creator-section-defaults";
import {
  collapseLayersToSelectionUnits,
  deriveBlueprintNodeDisplayLabel,
  deriveLayerDisplayLabel,
  resolveInspectClickUnit,
  resolveRootClickUnit,
  sameSelectionUnit,
  toggleSelectionUnit,
  unitsToStructureLayerIds,
  type SiteCreatorSelectionUnit,
} from "./site-creator-display-labels";
import {
  buildBreadcrumbSegments,
  containerDisplayLabel,
  isSemanticContainerNode,
} from "./site-creator-hierarchy";
import {
  dismissDesignerMirrorNode,
  isAutoDesignerMirrorNode,
} from "./site-creator-designer-group-dismiss";
import type { SiteBlueprintLayoutGroupNode } from "./site-creator-types";

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

function boundsForUnit(
  unit: SiteCreatorSelectionUnit,
  blueprint: SiteBlueprintV1,
  index: NonNullable<ReturnType<typeof buildSiteSelectionIndex>>,
): SiteCreatorUnitOutline["bounds"] | null {
  if (unit.kind === "blueprintNode") {
    return semanticNodeBounds(blueprint, unit.nodeId, index);
  }
  return index.byId[unit.layerId]?.visualBounds ?? null;
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
    if (!isSiteSectionNode(node) && node.kind !== "layoutGroup") continue;
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
  const [tabletDevice, setTabletDevice] = useState<SiteCreatorDeviceConfig>(() =>
    defaultDeviceConfig("tablet"),
  );
  const [mobileDevice, setMobileDevice] = useState<SiteCreatorDeviceConfig>(() =>
    defaultDeviceConfig("mobile"),
  );
  const [focalLayerId, setFocalLayerId] = useState<string | null>(null);
  const [availablePreviewSize, setAvailablePreviewSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [originDialogOpen, setOriginDialogOpen] = useState(false);
  const [pagePreviewMode, setPagePreviewMode] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [units, setUnits] = useState<SiteCreatorSelectionUnit[]>([]);
  /** Ancestros semánticos de la selección (no es un “modo” visible). */
  const [interactionPath, setInteractionPath] = useState<string[]>([]);
  const [designerShadow, setDesignerShadow] = useState<SiteCreatorSelectionState>(
    EMPTY_SITE_CREATOR_SELECTION,
  );
  const [expandedTreeIds, setExpandedTreeIds] = useState<Record<string, boolean>>({});
  const [outlineHoverKey, setOutlineHoverKey] = useState<string | null>(null);

  const [structureError, setStructureError] = useState<string | null>(null);
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const [addTargetMenuOpen, setAddTargetMenuOpen] = useState(false);
  const [buttonPrompt, setButtonPrompt] = useState<{
    preferredParentId?: string | null;
  } | null>(null);
  const [pendingParentChoice, setPendingParentChoice] = useState<{
    kind: "button" | "group";
    candidateParentIds: string[];
  } | null>(null);
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);

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
  const committedPage =
    originState === "synced" && page ? page : (snapshot?.page ?? null);
  const pageDimensions = page ? getPageDimensions(page) : null;
  const referenceWidth = pageDimensions?.width ?? 1920;
  const referenceHeight = pageDimensions?.height ?? 1080;
  const tabletDimensions = useMemo(
    () => resolveDeviceDimensions({ band: "tablet", config: tabletDevice, referenceWidth }),
    [referenceWidth, tabletDevice],
  );
  const mobileDimensions = useMemo(
    () => resolveDeviceDimensions({ band: "mobile", config: mobileDevice, referenceWidth }),
    [mobileDevice, referenceWidth],
  );
  const activeDeviceDimensions =
    viewportBand === "tablet" ? tabletDimensions : viewportBand === "mobile" ? mobileDimensions : null;
  const livePreviewWidth = clampViewportWidth(
    availablePreviewSize?.width ??
      (typeof window !== "undefined" ? window.innerWidth : referenceWidth),
    referenceWidth,
  );
  const effectiveViewportWidth = pagePreviewMode
    ? livePreviewWidth
    : viewportBand === "original"
      ? (originalViewportWidth ?? referenceWidth)
      : activeDeviceDimensions!.width;
  const deviceFrame =
    pagePreviewMode || activeDeviceDimensions == null
      ? null
      : { width: activeDeviceDimensions.width, height: activeDeviceDimensions.height };
  const responsiveBand = bandForViewportWidth(effectiveViewportWidth, referenceWidth);
  const showPreview = Boolean(page);

  const referenceIndex = useMemo(() => (page ? buildSiteSelectionIndex(page) : null), [page]);
  const committedIndex = useMemo(
    () => (committedPage ? buildSiteSelectionIndex(committedPage) : null),
    [committedPage],
  );

  const responsive = useMemo(() => {
    if (!page || !referenceIndex) return null;
    return resolveSiteCreatorResponsiveDisplay({
      page,
      blueprint,
      referenceIndex,
      viewportWidth: effectiveViewportWidth,
    });
  }, [blueprint, effectiveViewportWidth, page, referenceIndex]);

  const displayPage = responsive?.displayPage ?? page;
  const objectClipById = responsive?.resolvedLayout?.objectClipById;
  const selectionIndex = useMemo(
    () => (displayPage ? buildSiteSelectionIndex(displayPage) : null),
    [displayPage],
  );
  const layoutWidth = responsive?.layout.layoutWidth ?? referenceWidth;
  const layoutHeight = responsive?.layout.layoutHeight ?? referenceHeight;

  useEffect(() => {
    if (!pageDimensions) return;
    setViewportBand("original");
    setOriginalViewportWidth(pageDimensions.width);
  }, [pageDimensions?.width, pageDimensions?.height, snapshot?.contentHash]);

  const fitTargetWidth = deviceFrame?.width ?? layoutWidth;
  const fitTargetHeight = deviceFrame?.height ?? layoutHeight;

  useEffect(() => {
    if (!availablePreviewSize) return;
    if (availablePreviewSize.width < 80 || availablePreviewSize.height < 80) return;
    if (pagePreviewMode) {
      setPreviewZoom(
        computeFillWidthPreviewZoom({
          layoutWidth,
          availableWidth: availablePreviewSize.width,
        }),
      );
      return;
    }
    const z = computeFitPreviewZoom({
      layoutWidth: fitTargetWidth,
      layoutHeight: fitTargetHeight,
      availableWidth: availablePreviewSize.width,
      availableHeight: availablePreviewSize.height,
    });
    setPreviewZoom(z);
  }, [
    availablePreviewSize,
    fitTargetHeight,
    fitTargetWidth,
    layoutWidth,
    pagePreviewMode,
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

  const publishPage = snapshot?.page ?? page;
  const canPublish = Boolean(publishPage) && !publishing;

  const handlePublish = useCallback(async () => {
    if (!publishPage || publishing) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const refs = collectPublishImageRefs(publishPage);
      const imageHrefByLayerId = Object.fromEntries(
        refs.map((ref) => [ref.layerId, publishAssetPlaceholder(ref.layerId)]),
      );
      const compiled = compilePublishedSite({
        page: publishPage,
        blueprint,
        title: nodeLabel,
        imageHrefByLayerId,
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
  }, [blueprint, nodeLabel, onPublishChange, publish?.siteId, publishPage, publishing]);

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

  const applySection = useCallback(
    (sectionType: "hero" | "generic") => {
      if (!committedPage || !committedIndex) return;
      if (!persistGate.allowed) {
        setStructureError(persistGate.message);
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
      const result = createLayoutGroupFromSelection({
        blueprint,
        selectedLayerIds: structureLayerIds,
        index: committedIndex,
        preferredParentId,
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
    },
    [blueprint, commitBlueprint, committedIndex, persistGate, selectCreatedNode, structureLayerIds],
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
          if (!action.layerId) {
            if (action.additive) return;
            clearUnitsAndInspect();
            patchShadow({ type: "clear" });
            return;
          }

          // Profundidad: contenedor seleccionado o ancestro en interactionPath
          if (displayInspectNodeId) {
            const coverage = new Set(
              collectSemanticCoverageLayerIds(blueprint, displayInspectNodeId),
            );
            if (!coverage.has(action.layerId)) {
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
          const collapsed = collapseLayersToSelectionUnits(
            action.layerIds,
            blueprint,
            selectionIndex,
          );
          if (action.additive) {
            setUnits((current) => {
              let next = current;
              for (const unit of collapsed) {
                next = toggleSelectionUnit(next, unit, blueprint);
              }
              return next;
            });
          } else {
            setUnits(collapsed);
          }
          setInteractionPath([]);
          setStructureError(null);
          return;
        }

        case "doubleClickLayer": {
          const unit = resolveRootClickUnit(action.layerId, blueprint, selectionIndex);
          if (unit.kind === "blueprintNode") {
            const node = blueprint.nodes[unit.nodeId];
            if (
              node &&
              (isSiteButtonNode(node) || node.kind === "layoutGroup" || isSiteSectionNode(node))
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
              if (coverage.has(layerId)) {
                setUnits([{ kind: "layer", layerId }]);
                return;
              }
              setInteractionPath([]);
            }
            setUnits([resolveRootClickUnit(layerId, blueprint, selectionIndex)]);
            return;
          }

          const layerId = action.layerId;
          patchShadow({ type: "hover", layerId });
          if (displayInspectNodeId) {
            const coverage = new Set(
              collectSemanticCoverageLayerIds(blueprint, displayInspectNodeId),
            );
            if (coverage.has(layerId)) {
              setUnits([{ kind: "layer", layerId }]);
              return;
            }
            setInteractionPath([]);
          }
          setUnits([resolveRootClickUnit(layerId, blueprint, selectionIndex)]);
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
      selectionIndex,
    ],
  );

  const contextualModel = useMemo(() => {
    const model = resolveContextualModel({
      units: displayUnits,
      inspectNodeId: contextualInspectId,
      blueprint,
      index: selectionIndex ?? { entries: [], byId: {} },
      snapshot,
      persistGate,
    });
    return {
      ...model,
      primaryActions: model.primaryActions
        .filter((a) => a.id !== "editContent" && a.id !== "exitInspect")
        .slice(0, 3),
    };
  }, [blueprint, contextualInspectId, displayUnits, persistGate, selectionIndex, snapshot]);

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
        case "undoButton":
        case "undoSection":
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
      applyRemoveFromContainer,
      openReviewDialog,
      removeSelectedStructure,
    ],
  );

  const parentChoices = useMemo(() => {
    if (!pendingParentChoice) return [];
    const choices: { id: string | null; label: string }[] =
      pendingParentChoice.candidateParentIds.map((id) => ({
        id,
        label: parentChoiceLabel(id, blueprint, snapshot, committedIndex),
      }));
    choices.push({
      id: null,
      label: parentChoiceLabel(null, blueprint, snapshot, committedIndex),
    });
    return choices;
  }, [blueprint, committedIndex, pendingParentChoice, snapshot]);

  const hoverUnit = useMemo((): SiteCreatorSelectionUnit | null => {
    const hoverId = displayShadow.hoverId;
    if (!hoverId || !selectionIndex) return null;
    if (displayInspectNodeId) {
      const coverage = new Set(collectSemanticCoverageLayerIds(blueprint, displayInspectNodeId));
      if (!coverage.has(hoverId)) return null;
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
      if (coverage.has(hoverId)) {
        return resolveInspectClickUnit(hoverId, containerId, blueprint, selectionIndex);
      }
    }
    return resolveRootClickUnit(hoverId, blueprint, selectionIndex);
  }, [blueprint, displayInspectNodeId, displayShadow.hoverId, displayUnits, selectionIndex]);

  const unitOutlines = useMemo((): SiteCreatorUnitOutline[] => {
    if (!selectionIndex) return [];
    const outlines: SiteCreatorUnitOutline[] = [];
    for (const unit of displayUnits) {
      const bounds =
        presentationBoundsForUnit(unit, presentationTree, selectionIndex) ??
        boundsForUnit(unit, blueprint, selectionIndex);
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
  }, [blueprint, displayUnits, presentationTree, selectionIndex, snapshot]);

  const hoverOutline = useMemo((): SiteCreatorUnitOutline | null => {
    if (!hoverUnit || !selectionIndex) return null;
    if (displayUnits.some((u) => sameSelectionUnit(u, hoverUnit))) return null;
    const bounds =
      presentationBoundsForUnit(hoverUnit, presentationTree, selectionIndex) ??
      boundsForUnit(hoverUnit, blueprint, selectionIndex);
    if (!bounds) return null;
    return {
      bounds,
      kind: unitOutlineKind(hoverUnit, blueprint),
      label:
        hoverUnit.kind === "layer"
          ? deriveLayerDisplayLabel(hoverUnit.layerId, selectionIndex, snapshot)
          : containerDisplayLabel(blueprint.nodes[hoverUnit.nodeId]!, snapshot, selectionIndex),
    };
  }, [blueprint, displayUnits, hoverUnit, presentationTree, selectionIndex, snapshot]);

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
    // Radiografía: contenedor bajo hover O contenedor seleccionado (sin hijo hover)
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
      // Contenedor seleccionado: radiografía de hijos siempre (hover de hijo enfatiza)
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
      ghosts.push({
        bounds,
        emphasized,
        isContainer: child.isContainer || child.kind === "semantic",
      });
    }
    return ghosts;
  }, [blueprint.nodes, displayUnits, hoverUnit, presentationTree, selectionIndex]);

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
      resetLabel: editableBand === "mobile" ? "Restablecer en Móvil" : "Restablecer en Tablet",
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
        if (refineModel?.layerId) setFocalLayerId(refineModel.layerId);
      },
    }),
    [blueprint, commitBlueprint, commitTune, editableBand, refineModel],
  );

  const onTransformCommit = useCallback(
    (delta: { dx: number; dy: number; dw?: number; dh?: number }) => {
      if (!editableBand || !refineModel?.itemRef) return;
      const current = resolveItemTune(blueprint, refineModel.itemRef, editableBand);
      const bounds = unitOutlines[0]?.bounds;
      const patch: {
        offset?: { x: number; y: number };
        size?: { width?: number; height?: number };
      } = {};
      if (delta.dx || delta.dy) {
        patch.offset = {
          x: (current?.offset?.x ?? 0) + delta.dx,
          y: (current?.offset?.y ?? 0) + delta.dy,
        };
      }
      if ((delta.dw || delta.dh) && bounds) {
        patch.size = {
          width: Math.max(8, bounds.width + (delta.dw ?? 0)),
          height: Math.max(8, bounds.height + (delta.dh ?? 0)),
        };
      }
      if (!patch.offset && !patch.size) return;
      commitTune(
        patchItemTune({
          blueprint,
          target: refineModel.itemRef,
          band: editableBand,
          patch,
        }),
      );
    },
    [blueprint, commitTune, editableBand, refineModel, unitOutlines],
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
        summary: contextualModel.summary ?? `${displayUnits.length} elementos seleccionados`,
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
      const segments = buildBreadcrumbSegments(unit, blueprint, selectionIndex, snapshot).map(
        (s) => ({ unit: s.unit, label: s.label, current: s.current }),
      );
      return {
        bounds,
        segments,
        actions: contextualModel.primaryActions,
        summary: contextualModel.summary,
        hoverOnly: false,
        adaptationSlot: adaptationModel ? (
          <SiteCreatorAdaptationControl
            model={adaptationModel}
            onSelectMode={onAdaptationSelectMode}
            onFocusController={onAdaptationFocusController}
          />
        ) : null,
        refineSlot: refineModel ? (
          <SiteCreatorRefineControl model={refineModel} handlers={refineHandlers} />
        ) : null,
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
        segments: [{ unit: hoverUnit, label, current: true }],
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
    onAdaptationFocusController,
    onAdaptationSelectMode,
    presentationTree,
    refineHandlers,
    refineModel,
    selectionIndex,
    snapshot,
    unitOutlines,
  ]);

  const onMicrobarNavigate = useCallback(
    (unit: SiteCreatorSelectionUnit) => {
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
  }, [exitPagePreview, onBlueprintChange, pagePreviewMode, removeSelectedStructure, togglePagePreview]);

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
              disabled={!canPublish}
              onClick={() => void handlePublish()}
              className={foldderStudioHeaderActionClassName(
                publish ? "bg-[#22d3ee]/20 text-[#22d3ee] hover:bg-[#22d3ee]/30" : "",
              )}
            >
              {publishing ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" strokeWidth={2.25} aria-hidden />
              ) : (
                <Globe className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
              )}
              {publishing ? "Publicando" : publish ? "Publicar de nuevo" : "Publicar"}
            </button>
            {publishedUrl ? (
              <a
                data-testid="site-creator-publish-open"
                href={publishedUrl}
                target="_blank"
                rel="noreferrer"
                title={publishedUrl}
                className={foldderStudioHeaderActionClassName("")}
              >
                Abrir web
              </a>
            ) : null}
            {publish ? (
              <button
                type="button"
                data-testid="site-creator-unpublish"
                title="Quitar la web publicada"
                disabled={publishing}
                onClick={() => void handleUnpublish()}
                className={foldderStudioHeaderActionClassName("text-white/55")}
              >
                Despublicar
              </button>
            ) : null}
            <button
              type="button"
              data-testid="site-creator-page-preview-toggle"
              aria-pressed={pagePreviewMode}
              title={pagePreviewMode ? "Salir de Preview (P)" : "Preview (P)"}
              onClick={togglePagePreview}
              className={foldderStudioHeaderActionClassName(
                pagePreviewMode ? "bg-[#a3e635]/20 text-[#a3e635] hover:bg-[#a3e635]/30" : "",
              )}
            >
              <Eye className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
              Preview
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
            if (additive) {
              setUnits((current) => toggleSelectionUnit(current, unit, blueprint));
            } else {
              setInteractionPath(pathNodeIds);
              setUnits([unit]);
            }
            setStructureError(null);
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
            setUnits([source.unit]);
          }}
          visualLayerCount={visualLayerCount}
          reviewCount={reviewCount}
          resolveOverride={resolveOutlineOverride}
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
              readOnly={pagePreviewMode}
              onViewportWidthChange={pagePreviewMode ? undefined : setOriginalViewportWidth}
              onAvailableSizeChange={setAvailablePreviewSize}
              selection={pagePreviewMode ? undefined : displayShadow}
              selectionIndex={pagePreviewMode ? undefined : selectionIndex ?? undefined}
              blueprint={pagePreviewMode ? null : blueprint}
              onSelectionAction={pagePreviewMode ? undefined : dispatchSelection}
              unitOutlines={pagePreviewMode ? undefined : unitOutlines}
              hoverOutline={pagePreviewMode ? undefined : hoverOutline}
              contextOutlines={pagePreviewMode ? undefined : contextOutlines}
              sectionOutlines={pagePreviewMode ? undefined : sectionOutlines}
              ghostOutlines={pagePreviewMode ? undefined : ghostOutlines}
              microbar={pagePreviewMode ? null : microbarModel}
              onMicrobarNavigate={pagePreviewMode ? undefined : onMicrobarNavigate}
              onMicrobarAction={pagePreviewMode ? undefined : handleMicrobarAction}
              onCanvasInteraction={() => undefined}
              objectClipById={objectClipById}
              floatingPortalHost={pagePreviewMode ? null : floatingHostEl}
              transformEnabled={!pagePreviewMode && Boolean(editableBand && refineModel?.kind === "item")}
              transformBounds={
                !pagePreviewMode && editableBand && refineModel?.kind === "item"
                  ? unitOutlines[0]?.bounds ?? null
                  : null
              }
              onTransformCommit={pagePreviewMode ? undefined : onTransformCommit}
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
            />
          ) : (
            <div className="flex flex-1 items-center justify-center px-8">
              <p className="max-w-md text-center text-sm text-white/50">{emptyStateMessage(originState)}</p>
            </div>
          )}

          <footer className="site-creator-studio__footer flex h-11 shrink-0 items-center gap-3 border-t border-white/10 bg-[#101820] px-4 text-[11px] text-white/65">
            {pagePreviewMode ? (
              <span
                data-testid="site-creator-preview-live-band"
                className="shrink-0 rounded bg-white/12 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-white"
              >
                {responsiveBand === "wide"
                  ? "Original"
                  : responsiveBand === "tablet"
                    ? "Tablet"
                    : "Móvil"}{" "}
                {Math.round(effectiveViewportWidth)}
              </span>
            ) : (
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                data-testid="site-creator-preset-original"
                className={`shrink-0 rounded px-2.5 py-1 text-[10px] font-semibold tracking-wide transition ${
                  viewportBand === "original"
                    ? "bg-white/12 text-white"
                    : "text-white/50 hover:bg-white/6 hover:text-white/80"
                }`}
                onClick={() => {
                  setViewportBand("original");
                  setOriginalViewportWidth(referenceWidth);
                }}
              >
                Original {Math.round(referenceWidth)}
              </button>
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
                onActivate={() => {
                  setViewportBand("tablet");
                }}
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
                onActivate={() => {
                  setViewportBand("mobile");
                }}
                onConfigChange={(config) => {
                  setMobileDevice(config);
                  setViewportBand("mobile");
                }}
              />
            </div>
            )}

            {pagePreviewMode ? null : (
            <SiteCreatorOrientationToggle
              visible={viewportBand === "tablet" || viewportBand === "mobile"}
              orientation={
                viewportBand === "tablet" ? tabletDevice.orientation : mobileDevice.orientation
              }
              onChange={(orientation) => {
                if (viewportBand === "tablet") {
                  setTabletDevice((prev) => ({ ...prev, orientation }));
                } else if (viewportBand === "mobile") {
                  setMobileDevice((prev) => ({ ...prev, orientation }));
                }
              }}
            />
            )}

            <div className="ml-auto flex items-center gap-3">
              {!pagePreviewMode && editableBand && bandHasCustomizations(blueprint, editableBand) ? (
                <button
                  type="button"
                  data-testid="site-creator-reset-band"
                  className="rounded border border-white/12 px-2 py-0.5 text-[10px] font-semibold text-white/70 hover:border-white/25 hover:text-white"
                  title={`Quita todas las personalizaciones de ${editableBand === "mobile" ? "Móvil" : "Tablet"} (alineación, anchura, separación, visibilidad y adaptación). No cambia la otra vista ni Original.`}
                  onClick={() =>
                    commitTune(resetResponsiveBand({ blueprint, band: editableBand }))
                  }
                >
                  {editableBand === "mobile" ? "Restablecer en Móvil" : "Restablecer en Tablet"}
                </button>
              ) : null}
              <span className="tabular-nums text-white/40">
                {deviceFrame
                  ? `${Math.round(deviceFrame.width)} × ${Math.round(deviceFrame.height)} px`
                  : `${Math.round(layoutWidth)} × ${Math.round(layoutHeight)} px`}
              </span>
              {pagePreviewMode ? (
                <span className="text-white/40">Esc para salir</span>
              ) : (
                <span className="text-emerald-400/90">{showPreview ? "Sin errores" : "—"}</span>
              )}
            </div>
          </footer>
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
    </div>
  );
}
