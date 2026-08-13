"use client";

import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  useReactFlow,
  useStore,
  useUpdateNodeInternals,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowState,
} from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { getNodeGridFrameForType, growCanvasDimensionToGrid } from "../canvas-grid-layout";
import { nodeFrameNeedsSync } from "../studio-node-aspect";
import {
  StudioCanvasNodeShell,
  type StudioCanvasNodeHandleSpec,
} from "../studio-node/studio-canvas-node";
import { resolveFoldderNodeStudioBackground } from "../studio-node/foldder-studio-node-backgrounds";
import {
  FoldderNodeContentDock,
  FoldderNodeContentDockActions,
  FoldderNodeContentDockMain,
  FoldderNodeContentMeta,
  FoldderNodeContentMetaRow,
  FoldderStudioModeCenterButton,
} from "../foldder-node-ui";
import { type FoldderStudioEventDetail } from "../desktop-studio-events";
import { useFoldderRenderMetric } from "../use-performance-metrics";
import { getPageDimensions } from "../indesign/page-formats";
import type { DesignerNodeData, DesignerPageState } from "../designer/DesignerNode";
import { DesignerPagePreview } from "../designer/DesignerPagePreview";
import { useNodeViewportVisibility } from "../use-node-viewport-visibility";
import {
  getLiveStudioDocumentsEpoch,
  subscribeLiveStudioDocuments,
} from "../studio-live-documents";
import { captureSnapshotFromDesignerNode } from "./designer-source-snapshot";
import {
  designerPageCount,
  findSiteCreatorDocumentEdge,
  type SiteCreatorSourceStatus,
} from "./site-creator-connection";
import { computeDesignerPageContentHash } from "./designer-source-hash";
import { countSnapshotLayers } from "./designer-source-layers";
import {
  resolveSiteCreatorOriginState,
  siteCreatorOriginStateLabel,
} from "./site-creator-origin";
import {
  applyConfirmedOriginChange,
  applyConfirmedSnapshotUpdate,
  deriveCandidateSnapshotFromDesigner,
  resolveLiveDesignerPage,
  validateCandidateForSync,
} from "./site-creator-sync";
import { resolveSiteCreatorDisplayPage } from "./site-creator-display-page";
import { canReplaceDesignerOrigin } from "./site-creator-blueprint-refs";
import {
  createEmptySiteBlueprintV1,
  isValidSiteBlueprintV1,
  parseSiteCreatorNodeData,
  type SiteBlueprintV1,
  type DesignerSourceSnapshotV1,
} from "./site-creator-types";
import { isValidDesignerSourceSnapshotV1 } from "./designer-source-snapshot";
import { SiteCreatorStudio } from "./SiteCreatorStudio";

const STALE_SYNC_MESSAGE = "Designer volvió a cambiar. Revisa la actualización de nuevo.";

function syncValidationErrorMessage(reason: "stale" | "invalid_designer" | "invalid_pages"): string {
  switch (reason) {
    case "stale":
      return STALE_SYNC_MESSAGE;
    case "invalid_designer":
      return "El Designer conectado ya no está disponible.";
    case "invalid_pages":
      return "El Designer conectado debe tener exactamente una página.";
    default:
      return "No se pudo actualizar el diseño.";
  }
}

const SITE_CREATOR_ACCENT = "#22d3ee";
const SITE_CREATOR_EMPTY_BACKGROUND_SRC = resolveFoldderNodeStudioBackground("siteCreator");
const SITE_CREATOR_DOCK_MIN_CHROME = 180;
const SITE_CREATOR_CONNECTED_PREVIEW_MIN = 140;
const SITE_CREATOR_NODE_MAX_HEIGHT = 2200;

function resolveSiteCreatorNodeHeight(args: { baseHeight: number; hasDock: boolean }): number {
  if (!args.hasDock) return args.baseHeight;
  return Math.min(
    SITE_CREATOR_NODE_MAX_HEIGHT,
    growCanvasDimensionToGrid(
      Math.max(args.baseHeight, SITE_CREATOR_CONNECTED_PREVIEW_MIN + SITE_CREATOR_DOCK_MIN_CHROME),
    ),
  );
}

const SITE_CREATOR_NODE_HANDLES: StudioCanvasNodeHandleSpec[] = [
  {
    id: "document",
    label: "Document",
    side: "left",
    top: "42%",
    type: "target",
    dataType: "txt",
  },
  {
    id: "template",
    label: "Site template",
    side: "right",
    top: "50%",
    type: "source",
    dataType: "site_template",
  },
];

const EMPTY_SITE_BLUEPRINT = createEmptySiteBlueprintV1();

/** Selector ligero: sin hash ni recorrido de capas (evita bloquear el hilo en cada tick del canvas). */
interface SiteCreatorGraphSlice {
  label: string;
  blueprint: SiteBlueprintV1;
  sourceSnapshot: DesignerSourceSnapshotV1 | undefined;
  hasDocumentEdge: boolean;
  designerNodeId: string | null;
  designerNodeType: string | null;
  designerPageCount: number;
  designerLabel: string | null;
  pageDimensionsWidth: number | null;
  pageDimensionsHeight: number | null;
  designerNodeData: unknown;
  designerPages: DesignerPageState[] | null;
}

function resolveDesignerLabel(data: unknown, fallbackId: string): string {
  if (data && typeof data === "object" && typeof (data as DesignerNodeData).label === "string") {
    const trimmed = (data as DesignerNodeData).label!.trim();
    if (trimmed) return trimmed;
  }
  return fallbackId;
}

function useSiteCreatorGraphContext(siteCreatorId: string): SiteCreatorGraphSlice {
  return useStore(
    useCallback(
      (state: ReactFlowState<Node, Edge>) => {
        const siteNode = state.nodeLookup.get(siteCreatorId);
        const rawData = siteNode?.data;
        const sourceSnapshot = isValidDesignerSourceSnapshotV1(rawData?.sourceSnapshot)
          ? rawData.sourceSnapshot
          : undefined;
        const blueprint = isValidSiteBlueprintV1(rawData?.blueprint)
          ? rawData.blueprint
          : EMPTY_SITE_BLUEPRINT;
        const label = typeof rawData?.label === "string" ? rawData.label : "Site Creator";

        const documentEdge = findSiteCreatorDocumentEdge(siteCreatorId, state.edges);
        const designerNodeId = documentEdge?.source ?? null;
        const designerNode = designerNodeId ? state.nodeLookup.get(designerNodeId) : undefined;
        const designerNodeData = designerNode?.data ?? null;
        const designerNodeType = designerNode?.type ?? null;
        const pageCount = designerNode ? designerPageCount(designerNode) : 0;

        let pageDimensionsWidth: number | null = null;
        let pageDimensionsHeight: number | null = null;
        if (designerNode?.type === "designer" && pageCount === 1) {
          const pages = (designerNodeData as DesignerNodeData | null)?.pages;
          const page = Array.isArray(pages) && pages.length === 1 ? pages[0]! : null;
          if (page) {
            const dims = getPageDimensions(page);
            pageDimensionsWidth = dims.width;
            pageDimensionsHeight = dims.height;
          }
        }

        return {
          label,
          blueprint,
          sourceSnapshot,
          hasDocumentEdge: Boolean(documentEdge),
          designerNodeId,
          designerNodeType,
          designerPageCount: pageCount,
          designerLabel: designerNodeId ? resolveDesignerLabel(designerNodeData, designerNodeId) : null,
          pageDimensionsWidth,
          pageDimensionsHeight,
          designerNodeData,
          designerPages: Array.isArray((designerNodeData as DesignerNodeData | null)?.pages)
            ? ((designerNodeData as DesignerNodeData).pages ?? null)
            : null,
        };
      },
      [siteCreatorId],
    ),
    shallow,
  );
}

function resolveSourceStatus(slice: SiteCreatorGraphSlice): SiteCreatorSourceStatus {
  if (!slice.hasDocumentEdge) return "none";
  if (!slice.designerNodeId || slice.designerNodeType !== "designer") return "needs_review";
  if (slice.designerPageCount !== 1) return "needs_review";
  return "valid";
}

export const SiteCreatorNode = memo(({ id, data, selected }: NodeProps) => {
  useFoldderRenderMetric("SiteCreatorNode", id);
  const { setNodes, getNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const frameRef = useRef<HTMLDivElement | null>(null);
  const frameSyncKeyRef = useRef<string | null>(null);
  const captureAttemptedForDesignerRef = useRef<string | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const liveStudioEpoch = useSyncExternalStore(
    subscribeLiveStudioDocuments,
    getLiveStudioDocumentsEpoch,
    getLiveStudioDocumentsEpoch,
  );
  const graph = useSiteCreatorGraphContext(id);
  const sourceSnapshot = graph.sourceSnapshot;
  const blueprint = graph.blueprint;
  const nodeLabel = graph.label;
  const nodeMediaVisible = useNodeViewportVisibility(id, 900, selected);

  const sourceStateStatus = resolveSourceStatus(graph);

  const livePage = useMemo(() => {
    void liveStudioEpoch;
    return resolveLiveDesignerPage(graph.designerNodeId, graph.designerPages);
  }, [graph.designerNodeId, graph.designerPages, liveStudioEpoch]);

  const liveDesignerLayerCount = useMemo(() => {
    if (!livePage) return 0;
    return countSnapshotLayers(livePage);
  }, [livePage]);

  const livePageContentHash = useMemo(() => {
    if (!livePage) return null;
    return computeDesignerPageContentHash(livePage);
  }, [livePage]);

  const isCapturing =
    sourceStateStatus === "valid" && !sourceSnapshot && Boolean(graph.designerNodeId);

  const originState = resolveSiteCreatorOriginState({
    snapshot: sourceSnapshot,
    documentEdge: graph.designerNodeId ? { source: graph.designerNodeId } : null,
    liveDesignerPageCount: graph.designerPageCount,
    livePageContentHash,
    isCapturing,
  });

  const candidateSnapshot = useMemo(() => {
    void liveStudioEpoch;
    if (!studioOpen) return null;
    if (originState !== "update_available" && originState !== "different_source") return null;
    if (!graph.designerNodeId || graph.designerNodeData == null) return null;
    const designerNode = getNodes().find((node) => node.id === graph.designerNodeId);
    if (!designerNode) return null;
    return deriveCandidateSnapshotFromDesigner(designerNode);
  }, [getNodes, graph.designerNodeData, graph.designerNodeId, liveStudioEpoch, originState, studioOpen]);

  const display = resolveSiteCreatorDisplayPage({
    originState,
    snapshot: sourceSnapshot ?? null,
    livePage,
  });
  const previewPage = display.displayPage;
  const previewPageDims = previewPage ? getPageDimensions(previewPage) : null;
  const hasCanvasPreview = Boolean(previewPage && previewPageDims);

  const dismissSyncError = useCallback(() => setSyncErrorMessage(null), []);

  const onConfirmSnapshotSync = useCallback(
    (reviewedCandidateHash: string) => {
      if (syncBusy || !sourceSnapshot) return;
      const expectedDesignerNodeId = sourceSnapshot.designerNodeId;
      const liveDesignerNode = graph.designerNodeId
        ? getNodes().find((node) => node.id === graph.designerNodeId)
        : undefined;
      setSyncBusy(true);
      setSyncErrorMessage(null);

      const validation = validateCandidateForSync({
        reviewedCandidateHash,
        expectedDesignerNodeId,
        liveDesignerNode,
      });

      if (!validation.ok) {
        setSyncErrorMessage(syncValidationErrorMessage(validation.reason));
        setSyncBusy(false);
        return;
      }

      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== id) return node;
          const current = parseSiteCreatorNodeData(node.data);
          if (!current.sourceSnapshot) return node;
          const updated = applyConfirmedSnapshotUpdate(current, validation.candidate);
          return { ...node, data: { ...updated } };
        }),
      );
      setSyncBusy(false);
      setSyncErrorMessage(null);
    },
    [getNodes, graph.designerNodeId, id, setNodes, sourceSnapshot, syncBusy],
  );

  const onConfirmOriginChange = useCallback(
    (reviewedCandidateHash: string) => {
      if (syncBusy || !sourceSnapshot || !graph.designerNodeId) return;
      if (!canReplaceDesignerOrigin(blueprint)) return;

      const liveDesignerNode = getNodes().find((node) => node.id === graph.designerNodeId);
      setSyncBusy(true);
      setSyncErrorMessage(null);

      const validation = validateCandidateForSync({
        reviewedCandidateHash,
        expectedDesignerNodeId: graph.designerNodeId,
        liveDesignerNode,
      });

      if (!validation.ok) {
        setSyncErrorMessage(syncValidationErrorMessage(validation.reason));
        setSyncBusy(false);
        return;
      }

      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== id) return node;
          const current = parseSiteCreatorNodeData(node.data);
          const updated = applyConfirmedOriginChange(current, validation.candidate);
          return { ...node, data: { ...updated } };
        }),
      );
      setSyncBusy(false);
      setSyncErrorMessage(null);
    },
    [blueprint, getNodes, graph.designerNodeId, id, setNodes, sourceSnapshot, syncBusy],
  );

  const onBlueprintChange = useCallback(
    (nextBlueprint: SiteBlueprintV1) => {
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== id) return node;
          const current = parseSiteCreatorNodeData(node.data);
          if (current.blueprint === nextBlueprint) return node;
          return {
            ...node,
            data: {
              ...current,
              blueprint: nextBlueprint,
            },
          };
        }),
      );
    },
    [id, setNodes],
  );

  const connected = sourceStateStatus !== "none";
  const hasDock = connected || Boolean(sourceSnapshot);
  const hasSnapshot = Boolean(sourceSnapshot);
  const canOpenStudio = hasSnapshot || connected || isCapturing;
  const openStudioDisabledReason = canOpenStudio
    ? undefined
    : "Conecta Document de un Designer de una sola página";
  const headerTitle = nodeLabel?.trim() || "Site Creator";
  const displayLayerCount = sourceSnapshot?.layerCount ?? liveDesignerLayerCount;
  const dimensionsLabel = sourceSnapshot
    ? (() => {
        const dims = getPageDimensions(sourceSnapshot.page);
        return `${dims.width}×${dims.height}`;
      })()
    : graph.pageDimensionsWidth != null && graph.pageDimensionsHeight != null
      ? `${graph.pageDimensionsWidth}×${graph.pageDimensionsHeight}`
      : "—";

  useEffect(() => {
    if (sourceSnapshot) return;
    if (sourceStateStatus === "none") {
      captureAttemptedForDesignerRef.current = null;
      return;
    }
    if (sourceStateStatus !== "valid" || !graph.designerNodeId) return;
    if (captureAttemptedForDesignerRef.current === graph.designerNodeId) return;

    const designerNode = getNodes().find((node) => node.id === graph.designerNodeId);
    if (!designerNode) return;

    captureAttemptedForDesignerRef.current = graph.designerNodeId;
    try {
      const snapshot = captureSnapshotFromDesignerNode(designerNode);
      if (!snapshot) {
        captureAttemptedForDesignerRef.current = null;
        return;
      }
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== id) return node;
          const current = parseSiteCreatorNodeData(node.data);
          if (current.sourceSnapshot) return node;
          return {
            ...node,
            data: {
              ...current,
              sourceSnapshot: snapshot,
            },
          };
        }),
      );
    } catch {
      captureAttemptedForDesignerRef.current = null;
    }
  }, [getNodes, graph.designerNodeId, id, setNodes, sourceSnapshot, sourceStateStatus]);

  const openStudio = useCallback(() => {
    if (!canOpenStudio) return;
    setStudioOpen(true);
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...parseSiteCreatorNodeData(node.data),
                studioState: { lastOpenedAt: new Date().toISOString() },
              },
            }
          : node,
      ),
    );
  }, [canOpenStudio, id, setNodes]);

  useEffect(() => {
    const onOpenStudio = (ev: Event) => {
      const detail = (ev as CustomEvent<FoldderStudioEventDetail>).detail;
      if (detail?.nodeId !== id) return;
      if (!canOpenStudio) return;
      setStudioOpen(true);
    };
    const onCloseStudio = (ev: Event) => {
      const detail = (ev as CustomEvent<{ nodeId?: string }>).detail;
      if (detail?.nodeId != null && detail.nodeId !== id) return;
      setStudioOpen(false);
    };
    window.addEventListener("foldder:open-studio", onOpenStudio as EventListener);
    window.addEventListener("foldder-open-node-studio", onOpenStudio as EventListener);
    window.addEventListener("foldder:close-studio", onCloseStudio as EventListener);
    window.addEventListener("foldder-close-node-studio", onCloseStudio as EventListener);
    return () => {
      window.removeEventListener("foldder:open-studio", onOpenStudio as EventListener);
      window.removeEventListener("foldder-open-node-studio", onOpenStudio as EventListener);
      window.removeEventListener("foldder:close-studio", onCloseStudio as EventListener);
      window.removeEventListener("foldder-close-node-studio", onCloseStudio as EventListener);
    };
  }, [canOpenStudio, id]);

  useLayoutEffect(() => {
    const baseFrame = getNodeGridFrameForType("siteCreator");
    if (!baseFrame) return;

    const current = getNodes().find((node) => node.id === id);
    if (!current) return;

    if (!hasDock) {
      const syncKey = "site-creator-empty";
      if (frameSyncKeyRef.current === syncKey) return;
      if (!nodeFrameNeedsSync(current, baseFrame)) {
        frameSyncKeyRef.current = syncKey;
        return;
      }
      frameSyncKeyRef.current = syncKey;
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== id) return node;
          if (!nodeFrameNeedsSync(node, baseFrame)) return node;
          return {
            ...node,
            width: baseFrame.width,
            height: baseFrame.height,
            measured: { width: baseFrame.width, height: baseFrame.height },
            style: {
              ...(node.style as React.CSSProperties),
              width: baseFrame.width,
              height: baseFrame.height,
              minHeight: baseFrame.height,
            },
          };
        }),
      );
      requestAnimationFrame(() => updateNodeInternals(id));
      return;
    }

    const measuredHeight = resolveSiteCreatorNodeHeight({ baseHeight: baseFrame.height, hasDock: true });
    const syncKey = `site-creator-connected:${measuredHeight}`;
    if (frameSyncKeyRef.current === syncKey) return;
    const nextFrame = { width: baseFrame.width, height: measuredHeight };
    if (!nodeFrameNeedsSync(current, nextFrame)) {
      frameSyncKeyRef.current = syncKey;
      return;
    }
    frameSyncKeyRef.current = syncKey;
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id !== id) return node;
        if (!nodeFrameNeedsSync(node, nextFrame)) return node;
        return {
          ...node,
          width: nextFrame.width,
          height: nextFrame.height,
          measured: { width: nextFrame.width, height: nextFrame.height },
          style: {
            ...(node.style as React.CSSProperties),
            width: nextFrame.width,
            height: nextFrame.height,
            minHeight: measuredHeight,
            maxHeight: SITE_CREATOR_NODE_MAX_HEIGHT,
          },
        };
      }),
    );
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [getNodes, hasDock, id, setNodes, updateNodeInternals]);

  const designerLabel = graph.designerLabel ?? sourceSnapshot?.designerNodeId ?? null;

  return (
    <StudioCanvasNodeShell
      ref={frameRef}
      nodeId={id}
      nodeType="siteCreator"
      selected={selected}
      label={nodeLabel}
      defaultLabel="Site Creator"
      title="SITE CREATOR"
      introActive={!!(data as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}
      exteriorTileMark={hasDock}
      minWidth={260}
      className={`site-creator-node foldder-frameless-label-dark${hasDock ? " site-creator-node--has-content" : " site-creator-node--empty"}${connected || hasSnapshot ? " site-creator-node--connected" : ""}${hasCanvasPreview ? " site-creator-node--has-preview" : ""}${originState === "different_source" || originState === "incompatible_document" ? " site-creator-node--invalid-connection" : ""}`}
      handles={SITE_CREATOR_NODE_HANDLES}
      variant="frameless"
      material="media"
      style={
        {
          minWidth: 260,
          minHeight: hasDock ? SITE_CREATOR_DOCK_MIN_CHROME + SITE_CREATOR_CONNECTED_PREVIEW_MIN : 300,
          "--foldder-node-card-bg": SITE_CREATOR_ACCENT,
          "--foldder-frameless-glass-bg": SITE_CREATOR_ACCENT,
          "--foldder-frameless-accent": SITE_CREATOR_ACCENT,
        } as React.CSSProperties
      }
    >
      <div
        className={`node-content foldder-frameless-main site-creator-node-main${hasDock ? " foldder-node-content-main--with-dock" : ""}`}
      >
        <div className="site-creator-node-preview-area foldder-node-content-preview-area">
          {hasCanvasPreview && previewPage && previewPageDims ? (
            <div className="site-creator-node-page-preview absolute inset-0 overflow-hidden bg-[#fafafa]">
              <DesignerPagePreview
                objects={previewPage.objects ?? []}
                pageWidth={previewPageDims.width}
                pageHeight={previewPageDims.height}
                renderImages={nodeMediaVisible}
              />
            </div>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={SITE_CREATOR_EMPTY_BACKGROUND_SRC}
                alt=""
                className="site-creator-node-bg"
                draggable={false}
              />
            </>
          )}
          {!hasDock ? (
            <>
              <div className="site-creator-node-empty-hint" aria-hidden>
                <span className="site-creator-node-empty-hint__title">Site Creator</span>
                <span className="site-creator-node-empty-hint__body">
                  Conecta Document de un Designer de una sola página.
                </span>
              </div>
              <FoldderStudioModeCenterButton
                label="Empezar"
                title="Conectar Designer"
                onClick={() => undefined}
                disabled
              />
            </>
          ) : null}
        </div>

        {hasDock ? (
          <div className="site-creator-node-dock-wrap shrink-0">
            <FoldderNodeContentDock allowNodeDrag>
              <FoldderNodeContentDockMain>
                <p className="foldder-node-content-dock-text">{headerTitle}</p>
                <p className="foldder-node-content-dock-text foldder-node-content-dock-text--placeholder">
                  {hasSnapshot
                    ? "Diseño importado. Abre Studio para revisarlo."
                    : originState === "preparing"
                      ? "Preparando diseño importado…"
                      : "Documento compatible. Abre Studio para importar."}
                </p>
                <FoldderNodeContentMeta>
                  <FoldderNodeContentMetaRow label="Designer" value={designerLabel ?? "—"} />
                  <FoldderNodeContentMetaRow label="Dimensiones" value={dimensionsLabel} />
                  <FoldderNodeContentMetaRow label="Capas" value={String(displayLayerCount)} />
                  <FoldderNodeContentMetaRow
                    label="Estado"
                    value={siteCreatorOriginStateLabel(originState)}
                    variant="status"
                  />
                </FoldderNodeContentMeta>
              </FoldderNodeContentDockMain>
              <FoldderNodeContentDockActions className="site-creator-node-dock-actions">
                <FoldderStudioModeCenterButton
                  variant="dock"
                  label="Abrir Studio"
                  title={openStudioDisabledReason ?? "Abrir Site Creator Studio"}
                  onClick={openStudio}
                  disabled={!canOpenStudio}
                />
              </FoldderNodeContentDockActions>
            </FoldderNodeContentDock>
          </div>
        ) : null}
      </div>

      {studioOpen && typeof document !== "undefined"
        ? createPortal(
            <SiteCreatorStudio
              nodeLabel={headerTitle}
              designerLabel={designerLabel}
              originState={originState}
              snapshot={sourceSnapshot ?? null}
              previewPage={previewPage}
              blueprint={blueprint}
              candidateSnapshot={candidateSnapshot}
              syncBusy={syncBusy}
              syncErrorMessage={syncErrorMessage}
              onClose={() => setStudioOpen(false)}
              onConfirmSnapshotSync={onConfirmSnapshotSync}
              onConfirmOriginChange={onConfirmOriginChange}
              onDismissSyncError={dismissSyncError}
              onBlueprintChange={onBlueprintChange}
            />,
            document.body,
          )
        : null}
    </StudioCanvasNodeShell>
  );
});

SiteCreatorNode.displayName = "SiteCreatorNode";
