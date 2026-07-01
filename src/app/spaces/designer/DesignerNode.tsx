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
import { FoldderStudioModeCenterButton } from "../foldder-node-ui";
import type { IndesignPageFormatId } from "../indesign/page-formats";
import { DEFAULT_DESIGNER_PAGE_FORMAT, getPageDimensions } from "../indesign/page-formats";
import { nodeFrameNeedsSync, resolveAspectLockedNodeFrame, resolveNodeChromeHeight } from "../studio-node-aspect";
import { DesignerPagePreview } from "./DesignerPagePreview";
import type { Story, TextFrame } from "../indesign/text-model";
import type { ImageFrameRecord } from "../indesign/image-frame-model";
import type { FreehandObject, LayoutGuide } from "../FreehandStudio";
import {
  dispatchFoldderExportCreated,
  type FoldderExportCreatedDetail,
} from "../foldder-export-events";
import { StudioCanvasNodeShell, type StudioCanvasNodeHandleSpec } from "../studio-node/studio-canvas-node";
import { hasFoldderStudioTouched, touchStudioNodeData } from "../studio-node/foldder-studio-touched";
import { StudioNodePortal, useStudioNodeController } from "../studio-node/studio-node-architecture";
import type { PresenterGroupStep } from "../presenter/presenter-group-animations";
import {
  clearLiveStudioNodeData,
  setLiveStudioNodeData,
} from "../studio-live-documents";
import { nodeFrameFromSnapshot, selectNodeFrameSnapshot } from "../react-flow-selectors";
import { buildDesignerPageFromLayerizerOutput } from "../layerizer/layerizer-to-designer";
import type { LayerizerOutput } from "../layerizer/layerizer-types";
import { useCanvasPerformanceModeRef } from "../use-canvas-performance-mode";
import { useFoldderRenderMetric } from "../use-performance-metrics";
import { useCanvasNodeMediaPreviewUrl } from "../hooks/use-authed-media-preview-url";
import { useNodeViewportVisibility } from "../use-node-viewport-visibility";
import { useDesignerConnectedDataset } from "./use-designer-connected-dataset";
import {
  brainBrandSignature,
  mergeBrainBrandIntoConstants,
} from "@/app/spaces/brandkit/brandkit-logic";
import { useProjectBrainCanvas } from "../project-brain-canvas-context";
import { normalizeProjectAssets } from "../project-assets-metadata";
import {
  applyDatasetToAllPages,
  collectDatasetLoopListId,
  reconcileDatasetLoopPages,
} from "./designer-dataset-page";
import { duplicateDesignerPageState } from "./designer-studio-pure";

const DESIGNER_NODE_MAX_WIDTH = 960;
const DESIGNER_NODE_MAX_HEIGHT = 2200;
const DESIGNER_EMPTY_BACKGROUND_SRC = "/assets/nodes/designer-empty-lime.png";

const DESIGNER_NODE_HANDLES: StudioCanvasNodeHandleSpec[] = [
  { side: "left", top: "20%", style: { transform: "translateY(-50%)" }, type: "target", id: "brain", dataType: "brain", label: "BrandKit" },
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
  /** Raster en vivo por página (pageId → dataURL); alimenta la salida media_list / Export Multimedia. */
  pageThumbnails?: Record<string, string>;
};

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
  const brainNodeId = useStore(
    useCallback(
      (state: ReactFlowState<Node, Edge>) =>
        state.edges.find((edge) => edge.target === id && edge.targetHandle === "brain")?.source ?? null,
      [id],
    ),
  );
  const brainConnected = !!brainNodeId;
  const brainCanvasCtx = useProjectBrainCanvas();
  const brainBrand = useMemo(
    () => (brainNodeId ? normalizeProjectAssets(brainCanvasCtx?.assetsMetadata).brand : null),
    [brainNodeId, brainCanvasCtx?.assetsMetadata],
  );
  const brainBrandSig = useMemo(() => brainBrandSignature(brainNodeId, brainBrand), [brainNodeId, brainBrand]);
  const { datasetConnected, connectedDataset, datasetLoading } = useDesignerConnectedDataset(id);
  /**
   * Dataset efectivo: el conectado + la marca del BrandKit (Brain) conectado —logo/colores—
   * inyectados como constantes namespaced. Es lo que se aplica a las páginas y se pasa al estudio,
   * de modo que los bindings `source: "node"`/`"constant"` resuelven por la vía de constantes ya
   * existente.
   */
  const effectiveDataset = useMemo(
    () => {
      if (brainNodeId && brainBrand) return mergeBrainBrandIntoConstants(connectedDataset, brainNodeId, brainBrand);
      return connectedDataset;
    },
    // brainBrandSig captura el cambio de contenido sin re-fusionar en cada tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connectedDataset, brainBrandSig],
  );
  const currentNodeFrameSnapshot = useStore(
    useCallback((state: ReactFlowState<Node, Edge>) => selectNodeFrameSnapshot(state, id), [id]),
    shallow,
  );

  /** Layerizer: salida del nodo conectado al handle `layout` (Image Layout). */
  const connectedLayerizerOutput = useStore(
    useCallback(
      (state: ReactFlowState<Node, Edge>): LayerizerOutput | null => {
        const edge = state.edges.find((e) => e.target === id && e.targetHandle === "layout");
        if (!edge) return null;
        const source = state.nodes.find((n) => n.id === edge.source);
        const out = (source?.data as { output?: unknown } | undefined)?.output;
        if (!out || typeof out !== "object") return null;
        const candidate = out as LayerizerOutput;
        return candidate.jobId && candidate.background?.url ? candidate : null;
      },
      [id],
    ),
    shallow,
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
    if (!firstPageDims) return;
    const syncKey = `${firstPageDims.width}x${firstPageDims.height}`;
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
  }, [firstPageDims?.width, firstPageDims?.height, id, setNodes, updateNodeInternals]);

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
    // La firma de la marca (Brain) entra en la clave: editar el BrandKit re-aplica aunque el Dataset no cambie.
    const syncKey = `${ds.id}:${ds.version}:${brainBrandSig}`;
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
  }, [effectiveDataset, brainBrandSig, isStudioOpen, id, setNodes, nodeData.pages, activeIdx]);

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

  return (
    <StudioCanvasNodeShell
      ref={frameRef}
      nodeId={id}
      nodeType="designer"
      selected={selected}
      label={nodeData.label}
      defaultLabel="Designer"
      title="Designer"
      badge="DESIGN"
      headerIcon={
        <span className="flex h-5 w-5 items-center justify-center rounded-none bg-[#fdb04b]">
          <img src="/designer_icon.svg" alt="" className="h-3.5 w-3.5 object-contain" draggable={false} />
        </span>
      }
      headerClassName="border-b border-violet-500/15 bg-gradient-to-r from-zinc-900/90 via-zinc-900/70 to-zinc-900/90"
      titleClassName="flex-1 truncate uppercase tracking-[0.14em] text-zinc-100"
      className="group/node designer-node foldder-frameless-label-dark"
      minWidth={280}
      handles={DESIGNER_NODE_HANDLES}
      variant="frameless"
      material="media"
      introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}
      studioTouched={hasFoldderStudioTouched(nodeData as Record<string, unknown>)}
    >
      <DesignerNodeResizer
        minWidth={280}
        minHeight={200}
        maxWidth={DESIGNER_NODE_MAX_WIDTH}
        maxHeight={DESIGNER_NODE_MAX_HEIGHT}
        keepAspectRatio
        isVisible={selected}
      />

      <div
        ref={previewRef}
        className="foldder-frameless-main relative flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        {nodeData.value && nodeMediaVisible ? (
          <div className="absolute inset-0 overflow-hidden" aria-hidden>
            <img
              src={designerCanvasUrl ?? nodeData.value}
              alt="Designer preview — página 1"
              className="h-full w-full object-cover bg-zinc-950/80"
              decoding="async"
              onLoad={refreshHandleGeometry}
              onError={refreshHandleGeometry}
            />
          </div>
        ) : pages[0] && (pages[0].objects?.length ?? 0) > 0 && firstPageDims ? (
          <div
            className="absolute inset-0 overflow-hidden bg-[#fafafa]"
            style={{
              aspectRatio: `${Math.max(1, firstPageDims.width)} / ${Math.max(1, firstPageDims.height)}`,
            }}
          >
            <DesignerPagePreview
              objects={pages[0].objects}
              pageWidth={firstPageDims.width}
              pageHeight={firstPageDims.height}
              renderImages={nodeMediaVisible}
            />
          </div>
        ) : (
          <div className="designer-empty-background absolute inset-0 overflow-hidden" aria-hidden>
            <img
              src={DESIGNER_EMPTY_BACKGROUND_SRC}
              alt=""
              className="h-full w-full object-contain object-bottom"
              draggable={false}
              onLoad={refreshHandleGeometry}
              onError={refreshHandleGeometry}
            />
          </div>
        )}
        <div className="relative z-10 flex min-h-0 flex-1 flex-col pointer-events-none">
          <div className="flex-1" />
          <FoldderStudioModeCenterButton onClick={() => {
            openStudio();
          }} />
        </div>
      </div>

      {isStudioOpen && (
        <StudioNodePortal>
          <DesignerStudioLazy
            initialPages={pages}
            activePageIndex={activeIdx}
            initialPageThumbnails={nodeData.pageThumbnails ?? {}}
            designerCanvasInstanceKey={id}
            brainConnected={brainConnected}
            datasetConnected={datasetConnected || !!(effectiveDataset && effectiveDataset !== connectedDataset)}
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
