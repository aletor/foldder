"use client";

import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  NodeResizer,
  useReactFlow,
  useStore,
  useUpdateNodeInternals,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowState,
} from "@xyflow/react";
import { shallow } from "zustand/shallow";
import {
  FoldderNodeContentDock,
  FoldderNodeContentDockActions,
  FoldderNodeContentDockMain,
  FoldderNodeContentMeta,
  FoldderNodeContentMetaRow,
  FoldderStudioModeCenterButton,
} from "../foldder-node-ui";
import type { IndesignPageFormatId } from "../indesign/page-formats";
import { DEFAULT_DESIGNER_PAGE_FORMAT, getPageDimensions } from "../indesign/page-formats";
import { getNodeGridFrameForType, growCanvasDimensionToGrid } from "../canvas-grid-layout";
import { nodeFrameNeedsSync, resolveAspectLockedNodeFrame, resolveNodeChromeHeight, resolveNodeFrameWidth } from "../studio-node-aspect";
import { DesignerPagePreview } from "./DesignerPagePreview";
import { DesignerNodeDockSlideFormats } from "./designer-node-dock-slide-formats";
import type { Story, TextFrame } from "../indesign/text-model";
import type { ImageFrameRecord } from "../indesign/image-frame-model";
import type { FreehandObject, LayoutGuide } from "../FreehandStudio";
import {
  dispatchFoldderExportCreated,
  type FoldderExportCreatedDetail,
} from "../foldder-export-events";
import { StudioCanvasNodeShell, type StudioCanvasNodeHandleSpec } from "../studio-node/studio-canvas-node";
import { hasFoldderStudioTouched, touchStudioNodeData } from "../studio-node/foldder-studio-touched";
import { resolveFoldderNodeStudioBackground } from "../studio-node/foldder-studio-node-backgrounds";
import { StudioNodePortal, useStudioNodeController } from "../studio-node/studio-node-architecture";
import type { PresenterGroupStep } from "../presenter/presenter-group-animations";
import {
  clearLiveStudioNodeData,
  setLiveStudioNodeData,
} from "../studio-live-documents";
import { nodeFrameFromSnapshot, selectNodeFrameSnapshot } from "../react-flow-selectors";
import { buildDesignerPageFromLayerizerOutput } from "../layerizer/layerizer-to-designer";
import type { LayerizerOutput } from "../layerizer/layerizer-types";
import {
  buildDesignerPagesFromPdfScanOutput,
  isPdfScanAnyLayoutOutput,
} from "../pdf-scan/pdf-scan-to-designer";
import { installPdfScanFontsIntoDesigner } from "../pdf-scan/pdf-scan-install-fonts";
import type { PdfScanAnyLayoutOutput } from "@/lib/pdf-scan/pdf-scan-types";
import { useCanvasPerformanceModeRef } from "../use-canvas-performance-mode";
import { useFoldderRenderMetric } from "../use-performance-metrics";
import { useCanvasNodeMediaPreviewUrl } from "../hooks/use-authed-media-preview-url";
import { useNodeViewportVisibility } from "../use-node-viewport-visibility";
import { useDesignerConnectedDataset } from "./use-designer-connected-dataset";
import { useDesignerBrandKitConnection } from "./use-designer-brandkit-connection";
import {
  applyDatasetToAllPages,
  collectDatasetLoopListId,
  reconcileDatasetLoopPages,
} from "./designer-dataset-page";
import { duplicateDesignerPageState } from "./designer-studio-pure";

const DESIGNER_NODE_MAX_WIDTH = 960;
const DESIGNER_NODE_MAX_HEIGHT = 2200;
const DESIGNER_ACCENT = "#abbc14";
const DESIGNER_DOCK_MIN_CHROME = 180;
const DESIGNER_CONNECTED_PREVIEW_MIN = 140;
const DESIGNER_EMPTY_BACKGROUND_SRC = resolveFoldderNodeStudioBackground("designer");

function resolveDesignerNodeHeight(args: { baseHeight: number; hasDock: boolean }): number {
  if (!args.hasDock) return args.baseHeight;
  return Math.min(
    DESIGNER_NODE_MAX_HEIGHT,
    growCanvasDimensionToGrid(Math.max(args.baseHeight, DESIGNER_CONNECTED_PREVIEW_MIN + DESIGNER_DOCK_MIN_CHROME)),
  );
}

const DESIGNER_NODE_HANDLES: StudioCanvasNodeHandleSpec[] = [
  { side: "left", top: "20%", style: { transform: "translateY(-50%)" }, type: "target", id: "brain", dataType: "brain", label: "Marca" },
  { side: "left", top: "40%", style: { transform: "translateY(-50%)" }, type: "target", id: "dataset", dataType: "dataset", label: "Dataset" },
  { side: "left", top: "80%", style: { transform: "translateY(-50%)" }, type: "target", id: "layout", dataType: "generic", label: "Image Layout" },
  { side: "right", top: "30%", style: { transform: "translateY(-50%)" }, type: "source", id: "image", dataType: "image", label: "Image" },
  { side: "right", top: "52%", style: { transform: "translateY(-50%)" }, type: "source", id: "document", dataType: "generic", label: "Document" },
  { side: "right", top: "74%", style: { transform: "translateY(-50%)" }, type: "source", id: "media_list", dataType: "generic", label: "Export Multimedia" },
];

export type DesignerPageState = {
  id: string;
  format: IndesignPageFormatId;
  customWidth?: number;
  customHeight?: number;
  /** Fondo del pliego: blanco, negro o transparente. */
  pageBackground?: "white" | "black" | "transparent";
  /** Preset Web/Arte aplicado al lienzo (solo lectura en UI; no editable a mano). */
  canvasPresetId?: string | null;
  objects: FreehandObject[];
  layoutGuides?: LayoutGuide[];
  stories?: Story[];
  textFrames?: TextFrame[];
  imageFrames?: ImageFrameRecord[];
  /** Presenter: pasos de animación en Play (persistido en la página). */
  presenterGroupSteps?: PresenterGroupStep[];
  /** Presenter: omitir en modo Play; miniatura muy atenuada en el rail. */
  presenterSkipSlide?: boolean;
  /**
   * Identidad ESTABLE de la slide, independiente de su `id` (que se remapea al clonar) y de su
   * posición en el rail. La usa Loop para nombrar columnas del Dataset por slide sin que
   * reordenar/insertar slides las desalinee. Si falta, se usa `id` como fallback determinista
   * (ver `resolveSlideKey`). El duplicado de una sola página la limpia (slide nueva = clave nueva);
   * el clon de documento completo (Loop por fila) la re-estampa desde la plantilla.
   */
  slideKey?: string;
  /** Nombre legible de la slide editable en el rail; la columna del Dataset hereda este nombre. */
  slideName?: string;
  /** Fila del Dataset enlazado para esta página (por defecto = índice de página). */
  datasetRowIndex?: number;
  /**
   * Modo bucle: id del listado del Dataset que generó esta página con "+ Bucle".
   * Si está presente en las páginas, el deck se mantiene en alta/baja según las filas del listado.
   */
  datasetLoopListId?: string;
  /** Modo bucle: id estable de la fila (Card) que representa esta página; permite mapear alta/baja/reordenado. */
  datasetLoopCardId?: string;
  /** Correcciones de relleno generativo no destructivas (metadata; capa en objects). */
  generativeFillCorrections?: import("@/lib/designer/generative-fill/types").GenerativeFillCorrection[];
};

export type DesignerNodeData = {
  label?: string;
  value?: string;
  pages?: DesignerPageState[];
  activePageIndex?: number;
  /** Auto-optimización: cola legada HR→OPT en segundo plano; las imágenes nuevas solo persisten OPT en S3. */
  autoImageOptimization?: boolean;
  /** Layerizer: jobId del último Image Layout importado como página (evita reimportar). */
  _layerizerImportedJobId?: string;
  /** PDFScan: jobId del último layout importado (páginas + texto editable). */
  _pdfScanImportedJobId?: string;
  /** Raster en vivo por página (pageId → dataURL); alimenta la salida media_list / Export Multimedia. */
  pageThumbnails?: Record<string, string>;
};

function designerPageHasContent(page: DesignerPageState): boolean {
  return (
    (page.objects?.length ?? 0) > 0 ||
    (page.textFrames?.length ?? 0) > 0 ||
    (page.imageFrames?.length ?? 0) > 0
  );
}

function DesignerNodeResizer(props: React.ComponentProps<typeof NodeResizer>) {
  return <NodeResizer {...props} />;
}

export const DesignerNode = memo(({ id, data, selected }: NodeProps<any>) => {
  useFoldderRenderMetric("DesignerNode", id);
  const nodeData = data as DesignerNodeData;
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const liveDesignerPatchRef = useRef<Partial<DesignerNodeData> | null>(null);
  const { isStudioOpen, openStudio, closeStudio } = useStudioNodeController({
    nodeId: id,
    nodeType: "designer",
  });
  const { brainConnected, paletteColors: brandKitPaletteColors } = useDesignerBrandKitConnection(id);
  const { datasetConnected, connectedDataset, datasetLoading } = useDesignerConnectedDataset(id);
  const effectiveDataset = connectedDataset;
  const currentNodeFrameSnapshot = useStore(
    useCallback((state: ReactFlowState<Node, Edge>) => selectNodeFrameSnapshot(state, id), [id]),
    shallow,
  );

  const connectedLayerizerOutput = useStore(
    useCallback(
      (state: ReactFlowState<Node, Edge>): LayerizerOutput | null => {
        const edge = state.edges.find((e) => e.target === id && e.targetHandle === "layout");
        if (!edge) return null;
        const source = state.nodes.find((n) => n.id === edge.source);
        const out = (source?.data as { output?: unknown } | undefined)?.output;
        if (!out || typeof out !== "object") return null;
        if (isPdfScanAnyLayoutOutput(out)) return null;
        const candidate = out as LayerizerOutput;
        return candidate.jobId && candidate.background?.url ? candidate : null;
      },
      [id],
    ),
    shallow,
  );
  const connectedPdfScanOutput = useStore(
    useCallback(
      (state: ReactFlowState<Node, Edge>): PdfScanAnyLayoutOutput | null => {
        const edge = state.edges.find((e) => e.target === id && e.targetHandle === "layout");
        if (!edge) return null;
        const source = state.nodes.find((n) => n.id === edge.source);
        const out = (source?.data as { output?: unknown } | undefined)?.output;
        return isPdfScanAnyLayoutOutput(out) ? out : null;
      },
      [id],
    ),
    shallow,
  );
  const layerizerConnected = useStore(
    useCallback(
      (state: ReactFlowState<Node, Edge>) => state.edges.some((edge) => edge.target === id && edge.targetHandle === "layout"),
      [id],
    ),
  );

  const pages: DesignerPageState[] =
    Array.isArray(nodeData.pages) && nodeData.pages.length > 0
      ? nodeData.pages
      : [
          {
            id: `dpg_${id}_0`,
            format: DEFAULT_DESIGNER_PAGE_FORMAT,
            objects: [],
            layoutGuides: [],
            stories: [],
            textFrames: [],
            imageFrames: [],
          },
        ];

  const activeIdx = Math.min(
    Math.max(0, nodeData.activePageIndex ?? 0),
    Math.max(0, pages.length - 1),
  );

  const firstPageDims = pages[0] ? getPageDimensions(pages[0]) : null;
  const currentNodeFrame = nodeFrameFromSnapshot(currentNodeFrameSnapshot);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const frameSyncKeyRef = useRef<string | null>(null);
  const nodeMediaVisible = useNodeViewportVisibility(id, 900, selected);
  const designerPreviewValue = typeof nodeData.value === "string" && nodeData.value.length > 0 ? nodeData.value : null;
  const { displayUrl: designerCanvasUrl } = useCanvasNodeMediaPreviewUrl(designerPreviewValue);
  const canvasPerformanceModeRef = useCanvasPerformanceModeRef(
    useCallback((active: boolean) => {
      if (!active) requestAnimationFrame(() => updateNodeInternals(id));
    }, [id, updateNodeInternals]),
  );
  const refreshHandleGeometry = useCallback(() => {
    if (canvasPerformanceModeRef.current) return;
    const run = () => updateNodeInternals(id);
    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
    window.setTimeout(run, 140);
  }, [id, updateNodeInternals]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => refreshHandleGeometry());
    const t = window.setTimeout(() => refreshHandleGeometry(), 160);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [refreshHandleGeometry, nodeData.value, pages.length, firstPageDims?.width, firstPageDims?.height]);

  useLayoutEffect(() => {
    const baseFrame = getNodeGridFrameForType("designer");
    if (!baseFrame || !firstPageDims) return;

    const isLonePlaceholder =
      pages.length === 1 &&
      !designerPageHasContent(pages[0]) &&
      !nodeData._layerizerImportedJobId &&
      !nodeData._pdfScanImportedJobId;
    const hasDesignedContent =
      Boolean(nodeData.value) ||
      !isLonePlaceholder ||
      Boolean(nodeData._layerizerImportedJobId) ||
      Boolean(nodeData._pdfScanImportedJobId);
    const hasConnections = brainConnected || datasetConnected || layerizerConnected;
    const studioTouched = hasFoldderStudioTouched(nodeData as Record<string, unknown>);
    const hasDock = hasConnections || hasDesignedContent || studioTouched;
    const isEmpty = !hasDock;
    const shouldAspectLock = hasDesignedContent;

    if (!shouldAspectLock) {
      if (isEmpty) {
        const syncKey = "designer-base";
        if (frameSyncKeyRef.current === syncKey) return;
        frameSyncKeyRef.current = syncKey;
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== id) return n;
            if (!nodeFrameNeedsSync(n, baseFrame)) return n;
            return {
              ...n,
              width: baseFrame.width,
              height: baseFrame.height,
              measured: { width: baseFrame.width, height: baseFrame.height },
              style: { ...(n.style as React.CSSProperties), width: baseFrame.width, height: baseFrame.height, minHeight: baseFrame.height },
            };
          }),
        );
        requestAnimationFrame(() => updateNodeInternals(id));
        return;
      }

      const measuredHeight = resolveDesignerNodeHeight({ baseHeight: baseFrame.height, hasDock: true });
      const syncKey = `designer-content:${hasConnections ? "connected" : "idle"}:${measuredHeight}`;
      if (frameSyncKeyRef.current === syncKey) return;
      frameSyncKeyRef.current = syncKey;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const resolvedWidth = resolveNodeFrameWidth(n, baseFrame.width);
          const resolvedTarget = { width: resolvedWidth, height: measuredHeight };
          if (!nodeFrameNeedsSync(n, resolvedTarget)) return n;
          return {
            ...n,
            width: resolvedWidth,
            height: measuredHeight,
            measured: { width: resolvedWidth, height: measuredHeight },
            style: {
              ...(n.style as React.CSSProperties),
              width: resolvedWidth,
              height: measuredHeight,
              minHeight: measuredHeight,
              maxHeight: DESIGNER_NODE_MAX_HEIGHT,
            },
          };
        }),
      );
      requestAnimationFrame(() => updateNodeInternals(id));
      return;
    }

    const syncKey = `${firstPageDims.width}x${firstPageDims.height}:${hasDock ? "dock" : "preview"}`;
    if (frameSyncKeyRef.current === syncKey) return;
    const chromeHeight = resolveNodeChromeHeight(frameRef.current, previewRef.current);
    const nextFrame = resolveAspectLockedNodeFrame({
      node: currentNodeFrame,
      contentWidth: firstPageDims.width,
      contentHeight: firstPageDims.height,
      minWidth: 280,
      maxWidth: DESIGNER_NODE_MAX_WIDTH,
      minHeight: 200,
      maxHeight: DESIGNER_NODE_MAX_HEIGHT,
      chromeHeight,
    });
    frameSyncKeyRef.current = syncKey;
    if (!nodeFrameNeedsSync(currentNodeFrame, nextFrame)) return;
    const nextAspectRatio = firstPageDims.width / firstPageDims.height;
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id !== id) return node;
        const currentAspectRatio =
          typeof (node.data as { _foldderAspectRatio?: unknown } | undefined)?._foldderAspectRatio === "number"
            ? ((node.data as { _foldderAspectRatio?: number })._foldderAspectRatio ?? null)
            : null;
        const needsAspectSync =
          currentAspectRatio === null || Math.abs(currentAspectRatio - nextAspectRatio) > 0.0001;
        return {
          ...node,
          width: nextFrame.width,
          height: nextFrame.height,
          data: needsAspectSync ? { ...node.data, _foldderAspectRatio: nextAspectRatio } : node.data,
          style: { ...node.style, width: nextFrame.width, height: nextFrame.height },
        };
      }),
    );
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [
    brainConnected,
    currentNodeFrame,
    datasetConnected,
    firstPageDims?.height,
    firstPageDims?.width,
    id,
    layerizerConnected,
    nodeData._layerizerImportedJobId,
    nodeData._pdfScanImportedJobId,
    nodeData.value,
    pages,
    setNodes,
    updateNodeInternals,
  ]);

  const onUpdatePages = useCallback(
    (next: DesignerPageState[], nextActiveIdx?: number) => {
      if (isStudioOpen) {
        const patch: Partial<DesignerNodeData> = {
          pages: next,
          ...(nextActiveIdx !== undefined ? { activePageIndex: nextActiveIdx } : {}),
        };
        liveDesignerPatchRef.current = {
          ...(liveDesignerPatchRef.current ?? {}),
          ...patch,
        };
        setLiveStudioNodeData(id, patch);
        return;
      }
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                data: {
                  ...n.data,
                  pages: next,
                  ...(nextActiveIdx !== undefined ? { activePageIndex: nextActiveIdx } : {}),
                },
              }
            : n,
        ),
      );
    },
    [id, isStudioOpen, setNodes],
  );

  const onUpdatePageThumbnails = useCallback(
    (thumbnails: Record<string, string>) => {
      const patch: Partial<DesignerNodeData> = { pageThumbnails: thumbnails };
      if (isStudioOpen) {
        liveDesignerPatchRef.current = {
          ...(liveDesignerPatchRef.current ?? {}),
          ...patch,
        };
        setLiveStudioNodeData(id, patch);
        return;
      }
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
        ),
      );
    },
    [id, isStudioOpen, setNodes],
  );

  const commitLiveDesignerPatch = useCallback(() => {
    const patch = liveDesignerPatchRef.current;
    if (!patch || Object.keys(patch).length === 0) {
      clearLiveStudioNodeData(id);
      return;
    }
    liveDesignerPatchRef.current = null;
    clearLiveStudioNodeData(id);
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? {
              ...n,
              data: touchStudioNodeData(n.data as Record<string, unknown>, patch as Record<string, unknown>),
            }
          : n,
      ),
    );
  }, [id, setNodes]);

  useEffect(() => () => clearLiveStudioNodeData(id), [id]);

  /**
   * Sincronización Dataset → Designer a nivel de NODO (estudio cerrado). El estudio abierto ya
   * sincroniza por su cuenta; aquí cubrimos el caso de editar el Dataset sin abrir el Designer:
   *
   * - Deck en modo bucle: alta/baja/reordenado de slides según las filas del listado (por `cardId`).
   * - Resto: re-aplica los valores enlazados a las páginas con bindings.
   *
   * Guard por `datasetId:version` → solo corre cuando cambia de verdad el contenido del Dataset,
   * nunca por reescribir `pages` (no entra en bucle).
   */
  const lastNodeDatasetSyncRef = useRef<string | null>(null);
  useEffect(() => {
    const ds = effectiveDataset;
    if (!ds) {
      lastNodeDatasetSyncRef.current = null;
      return;
    }
    const syncKey = `${ds.id}:${ds.version}`;
    // Con el estudio abierto manda el estudio; solo marcamos para no duplicar al cerrar.
    if (isStudioOpen) {
      lastNodeDatasetSyncRef.current = syncKey;
      return;
    }
    if (lastNodeDatasetSyncRef.current === syncKey) return;
    lastNodeDatasetSyncRef.current = syncKey;

    const current = (Array.isArray(nodeData.pages) ? nodeData.pages : []) as DesignerPageState[];
    if (current.length === 0) return;

    const loopListId = collectDatasetLoopListId(current);
    const loopActive = !!loopListId && ds.lists.some((l: { id: string }) => l.id === loopListId);
    const next = loopActive
      ? reconcileDatasetLoopPages(current, ds, loopListId!, activeIdx, duplicateDesignerPageState)
      : applyDatasetToAllPages(current, ds);
    if (next === current) return;

    const nextActiveIdx = Math.min(activeIdx, Math.max(0, next.length - 1));
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? {
              ...n,
              data: touchStudioNodeData(n.data as Record<string, unknown>, {
                pages: next,
                activePageIndex: nextActiveIdx,
              } as Record<string, unknown>),
            }
          : n,
      ),
    );
  }, [effectiveDataset, isStudioOpen, id, setNodes, nodeData.pages, activeIdx]);

  /**
   * Layerizer → Designer: al conectar un Image Layout, abrir un documento nuevo del tamaño
   * del fondo con cada objeto extraído como capa. Idempotente por jobId.
   */
  useEffect(() => {
    const output = connectedLayerizerOutput;
    if (!output) return;
    if (nodeData._layerizerImportedJobId === output.jobId) return;

    const pageId = `dpg_${id}_lz_${output.jobId}`;
    const newPage = buildDesignerPageFromLayerizerOutput(output, pageId);

    const isLonePlaceholder =
      pages.length === 1 &&
      (pages[0].objects?.length ?? 0) === 0 &&
      (pages[0].textFrames?.length ?? 0) === 0;
    const nextPages = isLonePlaceholder ? [newPage] : [...pages, newPage];
    const nextActiveIdx = nextPages.length - 1;

    const patch: Partial<DesignerNodeData> = {
      pages: nextPages,
      activePageIndex: nextActiveIdx,
      _layerizerImportedJobId: output.jobId,
    };

    if (isStudioOpen) {
      liveDesignerPatchRef.current = { ...(liveDesignerPatchRef.current ?? {}), ...patch };
      setLiveStudioNodeData(id, patch);
      return;
    }
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? { ...n, data: touchStudioNodeData(n.data as Record<string, unknown>, patch as Record<string, unknown>) }
          : n,
      ),
    );
  }, [connectedLayerizerOutput, nodeData._layerizerImportedJobId, pages, id, isStudioOpen, setNodes]);

  /**
   * PDFScan → Designer: importa todas las páginas (fondo raster + texto editable).
   * Idempotente por jobId; si el Designer está vacío, sustituye el placeholder.
   * Tipografías embebidas del PDF → custom fonts Designer (FontFace + almacén).
   */
  useEffect(() => {
    const output = connectedPdfScanOutput;
    if (!output) return;
    if (nodeData._pdfScanImportedJobId === output.jobId) return;

    const pageIdPrefix = `dpg_${id}_pdf_${output.jobId}`;
    const newPages = buildDesignerPagesFromPdfScanOutput(output, pageIdPrefix);
    if (newPages.length === 0) return;

    const isLonePlaceholder =
      pages.length === 1 &&
      (pages[0].objects?.length ?? 0) === 0 &&
      (pages[0].textFrames?.length ?? 0) === 0;
    const nextPages = isLonePlaceholder ? newPages : [...pages, ...newPages];
    const nextActiveIdx = isLonePlaceholder ? 0 : pages.length;

    const patch: Partial<DesignerNodeData> = {
      pages: nextPages,
      activePageIndex: nextActiveIdx,
      _pdfScanImportedJobId: output.jobId,
    };

    void installPdfScanFontsIntoDesigner(output.fonts).catch(() => undefined);

    if (isStudioOpen) {
      liveDesignerPatchRef.current = { ...(liveDesignerPatchRef.current ?? {}), ...patch };
      setLiveStudioNodeData(id, patch);
      return;
    }
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? { ...n, data: touchStudioNodeData(n.data as Record<string, unknown>, patch as Record<string, unknown>) }
          : n,
      ),
    );
  }, [connectedPdfScanOutput, nodeData._pdfScanImportedJobId, pages, id, isStudioOpen, setNodes]);

  const onExport = useCallback(
    (dataUrl: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: touchStudioNodeData(n.data as Record<string, unknown>, { value: dataUrl }) } : n,
        ),
      );
    },
    [id, setNodes],
  );

  const onAutoImageOptimizationChange = useCallback(
    (enabled: boolean) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, autoImageOptimization: enabled } } : n,
        ),
      );
    },
    [id, setNodes],
  );

  const isLonePlaceholder =
    pages.length === 1 &&
    !designerPageHasContent(pages[0]) &&
    !nodeData._layerizerImportedJobId &&
    !nodeData._pdfScanImportedJobId;
  const hasDesignedContent =
    Boolean(nodeData.value) ||
    !isLonePlaceholder ||
    Boolean(nodeData._layerizerImportedJobId) ||
    Boolean(nodeData._pdfScanImportedJobId);
  const hasConnections = brainConnected || datasetConnected || layerizerConnected;
  const studioTouched = hasFoldderStudioTouched(nodeData as Record<string, unknown>);
  const hasDock = hasConnections || hasDesignedContent || studioTouched;
  const isEmpty = !hasDock;
  const connectedOnly = hasConnections && !hasDesignedContent && !studioTouched;
  const showExteriorTile = hasDock;
  const hasCanvasPreview =
    Boolean(pages[0] && designerPageHasContent(pages[0]) && firstPageDims);
  const hasExportPreview = Boolean(nodeData.value && nodeMediaVisible);
  const hasPreviewVisual = hasExportPreview || hasCanvasPreview;
  const objectCount = pages.reduce(
    (sum, page) =>
      sum + (page.objects?.length ?? 0) + (page.textFrames?.length ?? 0) + (page.imageFrames?.length ?? 0),
    0,
  );
  const headerTitle = nodeData.label?.trim() || "Designer";
  const pagesLabel = `${pages.length} página${pages.length === 1 ? "" : "s"}`;
  const objectsLabel = `${objectCount} objeto${objectCount === 1 ? "" : "s"}`;
  const inputsLabel = useMemo(() => {
    const parts: string[] = [];
    if (brainConnected) parts.push("Marca");
    if (datasetConnected) parts.push("Dataset");
    if (layerizerConnected) parts.push("Layout");
    return parts.length > 0 ? parts.join(" · ") : "—";
  }, [brainConnected, datasetConnected, layerizerConnected]);
  const datasetLabel = effectiveDataset?.name?.trim() || connectedDataset?.name?.trim() || "—";
  const statusLabel = isEmpty
    ? "Vacío"
    : connectedOnly
      ? "Conectado"
      : nodeData.value
        ? "Exportado"
        : studioTouched || hasDesignedContent
          ? "En edición"
          : "Configurado";
  const previewLine = hasExportPreview
    ? "Documento rasterizado listo para salida."
    : hasCanvasPreview
      ? `${pagesLabel} · ${objectsLabel}`
      : hasConnections
        ? "Entradas conectadas. Abre Studio para diseñar."
        : "Componé páginas, enlazá Dataset o Marca y exportá.";

  return (
    <StudioCanvasNodeShell
      ref={frameRef}
      nodeId={id}
      nodeType="designer"
      selected={selected}
      label={nodeData.label}
      defaultLabel="Designer"
      title="DESIGNER"
      className={`designer-node foldder-frameless-label-dark${hasDock ? " designer-node--has-content" : " designer-node--empty"}${hasPreviewVisual ? " designer-node--has-preview" : ""}${connectedOnly ? " designer-node--connected-only" : ""}${hasConnections ? " designer-node--connected" : ""}`}
      minWidth={280}
      handles={DESIGNER_NODE_HANDLES}
      variant="frameless"
      material="media"
      introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}
      studioTouched={showExteriorTile && studioTouched}
      exteriorTileMark={showExteriorTile}
      style={
        {
          minWidth: 280,
          minHeight: hasDock ? DESIGNER_DOCK_MIN_CHROME + DESIGNER_CONNECTED_PREVIEW_MIN : 300,
          "--foldder-node-card-bg": DESIGNER_ACCENT,
          "--foldder-frameless-glass-bg": DESIGNER_ACCENT,
          "--foldder-frameless-accent": DESIGNER_ACCENT,
        } as React.CSSProperties
      }
    >
      <DesignerNodeResizer
        minWidth={280}
        minHeight={200}
        maxWidth={DESIGNER_NODE_MAX_WIDTH}
        maxHeight={DESIGNER_NODE_MAX_HEIGHT}
        keepAspectRatio={hasDesignedContent}
        isVisible={selected}
      />

      <div
        className={`node-content foldder-frameless-main designer-node-main${hasDock ? " foldder-node-content-main--with-dock" : ""}`}
      >
        <div
          ref={previewRef}
          className="designer-node-preview-area foldder-node-content-preview-area"
        >
          {hasExportPreview ? (
            <img
              src={designerCanvasUrl ?? nodeData.value}
              alt="Designer preview — página 1"
              className="designer-node-preview-img"
              decoding="async"
              draggable={false}
              onLoad={refreshHandleGeometry}
              onError={refreshHandleGeometry}
            />
          ) : hasCanvasPreview && pages[0] && firstPageDims ? (
            <div className="designer-node-page-preview absolute inset-0 overflow-hidden bg-[#fafafa]">
              <DesignerPagePreview
                objects={pages[0].objects}
                pageWidth={firstPageDims.width}
                pageHeight={firstPageDims.height}
                renderImages={nodeMediaVisible}
              />
            </div>
          ) : (
            <img
              src={DESIGNER_EMPTY_BACKGROUND_SRC}
              alt=""
              className="designer-node-bg"
              draggable={false}
              onLoad={refreshHandleGeometry}
              onError={refreshHandleGeometry}
            />
          )}

          {isEmpty ? (
            <>
              <div className="designer-node-empty-hint" aria-hidden>
                <span className="designer-node-empty-hint__title">Designer vacío</span>
                <span className="designer-node-empty-hint__body">
                  Conecta Marca, Dataset o Layout y abre Studio.
                </span>
              </div>
              <FoldderStudioModeCenterButton
                label="Empezar"
                title="Abrir Designer Studio"
                onClick={openStudio}
              />
            </>
          ) : null}
        </div>

        {hasDock ? (
          <div className="designer-node-dock-wrap shrink-0">
            <FoldderNodeContentDock allowNodeDrag>
              <FoldderNodeContentDockMain>
                <p className="foldder-node-content-dock-text">{headerTitle}</p>
                <p className="foldder-node-content-dock-text foldder-node-content-dock-text--placeholder">
                  {previewLine}
                </p>
                <FoldderNodeContentMeta>
                  <FoldderNodeContentMetaRow label="Slides" value={<DesignerNodeDockSlideFormats pages={pages} />} />
                  <FoldderNodeContentMetaRow label="Páginas" value={pagesLabel} />
                  <FoldderNodeContentMetaRow label="Objetos" value={objectsLabel} />
                  <FoldderNodeContentMetaRow label="Entradas" value={inputsLabel} />
                  <FoldderNodeContentMetaRow label="Dataset" value={datasetLabel} />
                  <FoldderNodeContentMetaRow label="Estado" value={statusLabel} variant="status" />
                </FoldderNodeContentMeta>
              </FoldderNodeContentDockMain>
              <FoldderNodeContentDockActions className="designer-node-dock-actions">
                <FoldderStudioModeCenterButton
                  variant="dock"
                  label="Abrir Designer"
                  title="Abrir Designer Studio"
                  onClick={openStudio}
                />
              </FoldderNodeContentDockActions>
            </FoldderNodeContentDock>
          </div>
        ) : null}
      </div>

      {isStudioOpen && (
        <StudioNodePortal>
          <DesignerStudioLazy
            initialPages={pages}
            activePageIndex={activeIdx}
            initialPageThumbnails={nodeData.pageThumbnails ?? {}}
            designerCanvasInstanceKey={id}
            brainConnected={brainConnected}
            brandKitPaletteColors={brandKitPaletteColors}
            datasetConnected={datasetConnected}
            designerConnectedDataset={effectiveDataset}
            designerConnectedDatasetLoading={datasetLoading}
            onClose={() => {
              commitLiveDesignerPatch();
              closeStudio();
            }}
            onExport={onExport}
            onFinalExport={(detail) => {
              dispatchFoldderExportCreated({ ...detail, sourceNodeId: id });
            }}
            onUpdatePages={onUpdatePages}
            onUpdatePageThumbnails={onUpdatePageThumbnails}
            autoImageOptimization={nodeData.autoImageOptimization !== false}
            onAutoImageOptimizationChange={onAutoImageOptimizationChange}
          />
        </StudioNodePortal>
      )}
    </StudioCanvasNodeShell>
  );
});

DesignerNode.displayName = "DesignerNode";

function DesignerStudioLazy(props: {
  initialPages: DesignerPageState[];
  activePageIndex: number;
  initialPageThumbnails?: Record<string, string>;
  designerCanvasInstanceKey: string;
  brainConnected?: boolean;
  brandKitPaletteColors?: string[];
  datasetConnected?: boolean;
  designerConnectedDataset?: import("@/app/spaces/dataset/dataset-types").Dataset | null;
  designerConnectedDatasetLoading?: boolean;
  onClose: () => void;
  onExport: (dataUrl: string) => void;
  onFinalExport?: (detail: Omit<FoldderExportCreatedDetail, "sourceNodeId">) => void;
  onUpdatePages: (pages: DesignerPageState[], activeIdx?: number) => void;
  onUpdatePageThumbnails?: (thumbnails: Record<string, string>) => void;
  autoImageOptimization?: boolean;
  onAutoImageOptimizationChange?: (enabled: boolean) => void;
}) {
  const [Studio, setStudio] = useState<React.ComponentType<any> | null>(null);
  useEffect(() => {
    import("./DesignerStudio").then((m) => setStudio(() => m.default));
  }, []);
  if (!Studio) {
    return (
      <div className="fixed inset-0 z-[100090] flex items-center justify-center bg-[#0b0d10]">
        <span className="animate-pulse text-sm text-zinc-500">Loading Designer Studio…</span>
      </div>
    );
  }
  return <Studio {...props} />;
}
