"use client";

/* eslint-disable @next/next/no-img-element */

import React, { memo, useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, type ComponentProps } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Position, NodeProps, BaseEdge, EdgeLabelRenderer, getBezierPath, EdgeProps, useReactFlow, useUpdateNodeInternals, useNodes, useEdges, NodeResizer, useNodeId, type Node } from '@xyflow/react';
import {
  Video, 
  Type, 
  Play, 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Compass, 
  Maximize2, 
  Download, 
  ArrowRight, 
  X,
  Zap,
  ImageIcon,
  RefreshCw,
  Scissors,
  Layers,
  Link,
  FilePlus,
  Music,
  Info,
  Globe,
  Eye,
  Paintbrush,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Sparkles,
  Eraser,
  Crop,
  Pencil,
  Trash2,
  Camera,
  Upload,
  BookOpen,
  FileText,
  Link2,
  Sun,
  Palette,
  Boxes,
  History,
  RectangleHorizontal,
  Clock,
  DollarSign,
  Ban,
  Move,
  ArrowRightCircle,
  ArrowUpFromLine,
  ZoomIn,
  Plane,
  Droplets,
  Wind,
  Hammer,
  LayoutTemplate,
  CircleDot,
  Film,
  Cpu,
  Pin,
} from 'lucide-react';
import { StandardStudioShellHeader, type StandardStudioShellConfig } from './StandardStudioShell';
import {
  FOLDDER_STANDARD_STUDIO_CLOSE_REQUEST_EVENT,
  type FoldderStudioEventDetail,
} from './desktop-studio-events';


/** Snapshot current output into _assetVersions for version history. */
function captureCurrentOutput(
  data: Record<string, unknown>,
  newUrl: string,
  source: string,
): Array<{ url: string; source: string; timestamp: number; s3Key?: string }> {
  const prev = Array.isArray(data._assetVersions) ? data._assetVersions : [];
  const entry: { url: string; source: string; timestamp: number; s3Key?: string } = {
    url: newUrl,
    source,
    timestamp: Date.now(),
  };
  if (typeof data.s3Key === "string") entry.s3Key = data.s3Key;
  return [...prev, entry];
}

import './spaces.css';
import { takePendingNanoStudioOpenFromPhotoRoom } from './photo-room/photo-room-nano-open-pending';
import { FOLDDER_FIT_VIEW_EASE } from '@/lib/fit-view-ease';
import { readResponseJson } from '@/lib/read-response-json';
import { estimateVideoGeneratorPreviewUsd } from '@/lib/pricing-config';
import { runAiJobWithNotification } from '@/lib/ai-job-notifications';
import {
  aiHudNanoBananaJobStart,
  aiHudNanoBananaJobProgress,
  aiHudNanoBananaJobEnd,
  getAiHudNanoBananaJobProgressForNode,
} from '@/lib/ai-hud-generation-progress';
import { geminiGenerateWithServerProgress } from '@/lib/gemini-generate-stream-client';
import { isFoldderMediaPreviewAutoFitSuppressed } from '@/lib/media-preview-fit-suppress';
import { tryExtractKnowledgeFilesKeyFromUrl } from '@/lib/s3-media-hydrate';
import { fetchBlobViaSpacesProxy } from '@/lib/spaces-proxy-fetch';
import { usePreventBrowserPinchZoom } from '@/lib/use-prevent-browser-pinch-zoom';
import { NODE_REGISTRY } from './nodeRegistry';
import { useRegisterAssistantNodeRun } from './use-assistant-node-run';
import { dispatchFoldderExportCreated } from './foldder-export-events';
import { useProjectBrainCanvas } from "./project-brain-canvas-context";
import { normalizeProjectAssets } from "./project-assets-metadata";
import {
  composeBrainImageGeneratorPromptWithRuntime,
  type BrainImageGeneratorPromptDiagnostics,
} from "@/lib/brain/build-brain-visual-prompt-context";
import { useBrainNodeTelemetry } from "@/lib/brain/use-brain-node-telemetry";
import { DEFAULT_EDGE_COLOR, FOLDDER_LOGO_BLUE, HANDLE_COLORS } from './handle-type-colors';
import { loadVideoDimensions } from './presenter/presenter-video-frame-layout';
import {
  NodeIcon,
  resolveFoldderNodeState,
  foldderIconKeyForSpaceOutputType,
  FOLDDER_INTERNAL_CATEGORY_TO_ICON,
  type FoldderIconKey,
} from './foldder-icons';
import { NodeLabel, FoldderNodeHeaderTitle, FoldderStudioModeCenterButton } from "./foldder-node-ui";
import {
  loadImageDimensions,
  nodeFrameNeedsSync,
  parseAspectRatioValue,
  resolveAspectLockedNodeFrame,
  resolveNodeChromeHeight,
} from "./studio-node-aspect";
import {
  applyCanvasGroupCollapse,
  applyPromptValueToEdgeSource,
  resolvePromptValueFromEdgeSource,
  resolvePromptValueFromEdgeSourceMap,
} from './canvas-group-logic';
import {
  buildDirectorEnhancementSuffix,
  buildPhysicsFlagsFromNodeData,
  countReferenceFiles,
  DIRECTOR_PROMPT_TEMPLATE_EN,
  estimatedApiImageCount,
  mergeBasePromptWithDirectorBlock,
  parseVideoRefSlots,
  refTag,
  SEEDANCE_CAMERA_QUICK_INSERTS,
  SEEDANCE_PROMPT_GUIDE_ES,
  SEEDANCE_REF_LIMITS,
  VIDEO_LIGHTING_PRESETS,
  VIDEO_PHYSICS_OPTIONS,
  VIDEO_VISUAL_STYLE_PRESETS,
  type VideoRefSlotAudioKey,
  type VideoRefSlotImageKey,
  type VideoRefSlotKey,
  type VideoRefSlotVideoKey,
  type VideoRefSlotsState,
} from '@/lib/video-generator-studio';
import {
  FoldderDataHandle,
  foldderDataTypeFromHandleClass,
  foldderMediaInputDataType,
} from './FoldderDataHandle';

interface BaseNodeData {
  value?: string;
  value2?: string;
  duration?: number;
  resolution?: string;
  aspect_ratio?: string;
  label?: string;
  loading?: boolean;
  error?: boolean;
  uploadError?: string;
}

type BackgroundRemoverNodeData = BaseNodeData & {
  expansion?: number;
  feather?: number;
  threshold?: number;
  result_rgba?: string;
  result_mask?: string;
  bbox?: number[];
};

type MattePreviewMode = 'original' | 'mask' | 'cutout';

type CropRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

function createNodeFrameSnapshot(
  node: Pick<Node, "width" | "height" | "measured" | "style"> | undefined,
): Pick<Node, "width" | "height" | "measured" | "style"> | undefined {
  if (!node) return undefined;
  return {
    width: node.width,
    height: node.height,
    measured: node.measured
      ? {
          width: node.measured.width,
          height: node.measured.height,
        }
      : undefined,
    style: node.style
      ? {
          width: node.style.width,
          height: node.style.height,
        }
      : undefined,
  };
}

function useCurrentNodeFrameSnapshot(node: Node | undefined): Pick<Node, "width" | "height" | "measured" | "style"> | undefined {
  const width = node?.width;
  const height = node?.height;
  const measuredWidth = node?.measured?.width;
  const measuredHeight = node?.measured?.height;
  const styleWidth = node?.style?.width;
  const styleHeight = node?.style?.height;

  return useMemo(() => {
    const hasFrame =
      width !== undefined ||
      height !== undefined ||
      measuredWidth !== undefined ||
      measuredHeight !== undefined ||
      styleWidth !== undefined ||
      styleHeight !== undefined;
    if (!hasFrame) return undefined;
    return createNodeFrameSnapshot({
      width,
      height,
      measured:
        measuredWidth !== undefined || measuredHeight !== undefined
          ? { width: measuredWidth, height: measuredHeight }
          : undefined,
      style:
        styleWidth !== undefined || styleHeight !== undefined
          ? { width: styleWidth, height: styleHeight }
          : undefined,
    });
  }, [height, measuredHeight, measuredWidth, styleHeight, styleWidth, width]);
}

/** Media Input: mismo patrón que Studio Mode — hover sobre el preview para elegir otro archivo (misma lógica que upload inicial). */
function MediaInputChangeMediaButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[20] overflow-hidden opacity-0 transition-opacity duration-200 group-hover:opacity-100">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-2">
        <button
          type="button"
          disabled={disabled}
          title="Subir otro archivo y reemplazar el actual"
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) onClick();
          }}
          className="pointer-events-auto nodrag flex max-w-[min(100%,240px)] flex-col items-center gap-1.5 rounded-2xl border border-white/30 bg-white/[0.12] px-6 py-3.5 shadow-xl backdrop-blur-xl transition-all duration-300 ease-out hover:scale-[1.03] hover:bg-white/[0.22] hover:shadow-2xl disabled:pointer-events-none disabled:opacity-35"
        >
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
            Change
          </span>
          <span className="flex items-center gap-2 font-mono text-[17px] font-black uppercase tracking-wide text-zinc-50">
            <Upload size={22} strokeWidth={2.5} className="shrink-0 text-violet-200" />
            Media
          </span>
        </button>
      </div>
    </div>
  );
}

export const ButtonEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceHandleId,
  style = {},
  markerEnd,
}: EdgeProps) => {
  const { setEdges } = useReactFlow();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Determine color from source handle type
  const handleKey = (sourceHandleId || '').toLowerCase();
  const strokeColor = HANDLE_COLORS[handleKey] ?? DEFAULT_EDGE_COLOR;

  const onEdgeClick = () => {
    setEdges((edges) => edges.filter((edge) => edge.id !== id));
  };

  return (
    <>
      <BaseEdge 
        path={edgePath} 
        markerEnd={markerEnd} 
        style={{ 
          ...style, 
          stroke: strokeColor,
          strokeWidth: 2,
        }} 
      />
      <EdgeLabelRenderer>
        <div
          key={id}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            fontSize: 12,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <button className="edgebutton" onClick={onEdgeClick} title="Disconnect">
            <X size={10} strokeWidth={4} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

/** Tras soltar el resize: encuadra solo este nodo (mismo criterio que foco tras crear nodo). */
const NODE_RESIZE_END_FIT_PADDING = 0.8;
const STUDIO_NODE_MAX_HEIGHT = 2200;

function FoldderNodeResizer(props: ComponentProps<typeof NodeResizer>) {
  const nodeId = useNodeId();
  const { fitView } = useReactFlow();
  const { onResizeEnd, ...rest } = props;
  return (
    <NodeResizer
      {...rest}
      onResizeEnd={(event, params) => {
        onResizeEnd?.(event, params);
        if (nodeId) {
          requestAnimationFrame(() => {
            void fitView({
              nodes: [{ id: nodeId }],
              padding: NODE_RESIZE_END_FIT_PADDING,
              duration: 560,
              interpolate: 'smooth',
              ...FOLDDER_FIT_VIEW_EASE,
            });
          });
        }
      }}
    />
  );
}

// --- CORE INPUT NODES ---

export const UrlImageNode = memo(function UrlImageNode({ id, data, selected }: NodeProps) {
  const nodeData = data as BaseNodeData & { 
    urls?: string[], 
    selectedIndex?: number,
    pendingSearch?: boolean,
    /** Frase de verificación (visión): qué debe mostrarse realmente en la imagen. */
    searchIntent?: string,
    count?: number,
  };
  const { setNodes } = useReactFlow();
  const [loading, setLoading] = useState(false);
  
  const urls = nodeData.urls || [];
  const selectedIndex = nodeData.selectedIndex ?? 0;
  const currentUrl = urls[selectedIndex] || nodeData.value || '';

  const runCarouselSearch = useCallback(async () => {
    if (!nodeData.label) return;
    setLoading(true);
    try {
      const ok = await runAiJobWithNotification({ nodeId: id, label: 'Búsqueda de imágenes' }, async () => {
        const lim = Math.min(Math.max(nodeData.count ?? 10, 3), 20);
        const verifyIntent =
          (typeof nodeData.searchIntent === 'string' && nodeData.searchIntent.trim()) ||
          nodeData.label ||
          '';
        const res = await fetch('/api/spaces/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: nodeData.label,
            limit: lim,
            verifyIntent,
          }),
        });
        const json = await res.json();
        if (json.urls && json.urls.length > 0) {
          setNodes((nds) => nds.map((n) => n.id === id ? {
            ...n,
            data: {
              ...n.data,
              urls: json.urls,
              value: json.urls[0],
              selectedIndex: 0,
              pendingSearch: false,
              type: 'image',
              source: 'url',
            },
          } : n));
        } else {
          setNodes((nds) => nds.map((n) => n.id === id ? {
            ...n,
            data: { ...n.data, pendingSearch: false },
          } : n));
        }
      });
      if (!ok) {
        setNodes((nds) => nds.map((n) => n.id === id ? {
          ...n,
          data: { ...n.data, pendingSearch: false },
        } : n));
      }
    } catch (err) {
      console.error('Search failed:', err);
      setNodes((nds) => nds.map((n) => n.id === id ? {
        ...n,
        data: { ...n.data, pendingSearch: false },
      } : n));
    } finally {
      setLoading(false);
    }
  }, [id, nodeData.label, nodeData.count, nodeData.searchIntent, setNodes]);

  useEffect(() => {
    if (nodeData.pendingSearch && nodeData.label && !loading) {
      void runCarouselSearch();
    }
  }, [nodeData.pendingSearch, nodeData.label, loading, runCarouselSearch]);

  useRegisterAssistantNodeRun(id, runCarouselSearch);

  const updateData = (updates: Record<string, unknown>) => {
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, ...updates } } : n));
  };

  const next = () => {
    if (urls.length === 0) return;
    const nextIdx = (selectedIndex + 1) % urls.length;
    updateData({ selectedIndex: nextIdx, value: urls[nextIdx], type: 'image' });
  };

  const prev = () => {
    if (urls.length === 0) return;
    const prevIdx = (selectedIndex - 1 + urls.length) % urls.length;
    updateData({ selectedIndex: prevIdx, value: urls[prevIdx], type: 'image' });
  };

  return (
    <div className={`custom-node url-image-node border-cyan-500/30 ${loading ? 'node-glow-running' : ''}`} style={{ minWidth: 280 }}>
      <FoldderNodeResizer minWidth={280} minHeight={320} isVisible={selected} />
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Image Search" />
      <div className="node-header">
        <NodeIcon type="urlImage" loading={loading} selected={selected} size={16} />
        <FoldderNodeHeaderTitle className="flex-1" introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}>
          CAROUSEL
        </FoldderNodeHeaderTitle>
        {loading && <Loader2 size={12} className="animate-spin shrink-0" />}
      </div>
      <div className="node-content">
        <div className="relative w-full aspect-video bg-slate-50 rounded-xl overflow-hidden border border-white/10 group mb-3 shadow-inner">
          {currentUrl ? (
            <img src={currentUrl} className="w-full h-full object-contain" alt="Carousel" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-700 gap-2">
              <Globe size={32} />
              <span className="text-[9px] font-black uppercase tracking-tighter">No URL provided</span>
            </div>
          )}
          
          {urls.length > 1 && (
            <>
              <button 
                onClick={prev}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-slate-100/50 backdrop-blur-md rounded-full text-white border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-cyan-500/20"
              >
                <ChevronLeft size={16} />
              </button>
              <button 
                onClick={next}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-slate-100/50 backdrop-blur-md rounded-full text-white border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-cyan-500/20"
              >
                <ChevronRight size={16} />
              </button>
              <div className="absolute bottom-2 right-2 bg-slate-100/50 backdrop-blur-md px-2 py-0.5 rounded text-[8px] font-mono text-cyan-400 border border-cyan-500/20">
                {selectedIndex + 1} / {urls.length}
              </div>
            </>
          )}
        </div>

        <div className="space-y-4">
           <div>
              <label className="node-label text-gray-500">Active URL</label>
              <div className="relative">
                <Link className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" size={12} />
                <input 
                  type="text"
                  className="node-input pl-9 text-[10px]"
                  placeholder="Paste URL..."
                  value={currentUrl}
                  onChange={(e) => {
                    const val = e.target.value;
                    const newUrls = [...urls];
                    if (newUrls.length === 0) newUrls.push(val);
                    else newUrls[selectedIndex] = val;
                    updateData({ urls: newUrls, value: val, type: 'image' });
                  }}
                />
              </div>
           </div>

           {urls.length > 0 && (
             <div className="pt-2 border-t border-slate-200/60">
                <div className="text-[8px] font-black text-gray-600 uppercase mb-2 tracking-widest flex justify-between items-center">
                  <span>Gallery Stack</span>
                  <button 
                    onClick={() => updateData({ urls: [...urls, ''] })}
                    className="text-cyan-500 hover:text-cyan-400 flex items-center gap-1 transition-colors"
                  >
                    <Plus size={10} /> ADD URL
                  </button>
                </div>
                <div className="flex gap-1 overflow-x-auto pb-2 custom-scrollbar no-scrollbar">
                  {urls.map((url, i) => (
                    <div 
                      key={i}
                      onClick={() => updateData({ selectedIndex: i, value: url, type: 'image' })}
                      className={`flex-shrink-0 w-12 h-12 rounded-lg border transition-all cursor-pointer overflow-hidden ${i === selectedIndex ? 'border-cyan-500 ring-2 ring-cyan-500/20' : 'border-white/10 opacity-50 hover:opacity-100'}`}
                    >
                      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-white/5 flex items-center justify-center"><Link size={10} /></div>}
                    </div>
                  ))}
                </div>
             </div>
           )}
        </div>
      </div>
      <div className="handle-wrapper handle-right">
        <span className="handle-label">Image Out</span>
        <FoldderDataHandle type="source" position={Position.Right} id="image" dataType="image" />
      </div>
    </div>
  );
});

type PinterestPin = { id: string; imageUrl: string; title?: string };

export const PinterestSearchNode = memo(function PinterestSearchNode({ id, data, selected }: NodeProps) {
  const nodeData = data as BaseNodeData & {
    pins?: PinterestPin[];
    selectedIndex?: number;
    lastHint?: string;
  };
  const nodes = useNodes();
  const edges = useEdges();
  const { setNodes } = useReactFlow();
  const [loading, setLoading] = useState(false);

  const promptEdge = useMemo(
    () => edges.find((e) => e.target === id && e.targetHandle === "prompt"),
    [edges, id]
  );
  const searchText = useMemo(() => {
    if (!promptEdge) return "";
    return String(resolvePromptValueFromEdgeSource(promptEdge, nodes as Node[]) ?? "").trim();
  }, [promptEdge, nodes]);

  const pins = Array.isArray(nodeData.pins) ? nodeData.pins : [];
  const selectedIndex = Math.min(Math.max(nodeData.selectedIndex ?? 0, 0), Math.max(pins.length - 1, 0));
  const current = pins[selectedIndex];
  const currentUrl = current?.imageUrl ?? (typeof nodeData.value === "string" ? nodeData.value : "");

  const updateData = useCallback(
    (updates: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...updates } } : n))
      );
    },
    [id, setNodes]
  );

  const runSearch = useCallback(async () => {
    const promptEdgeRun = edges.find((e) => e.target === id && e.targetHandle === "prompt");
    const q = promptEdgeRun
      ? String(resolvePromptValueFromEdgeSource(promptEdgeRun, nodes as Node[]) ?? "").trim()
      : "";
    if (!q) return;
    setLoading(true);
    try {
      const ok = await runAiJobWithNotification({ nodeId: id, label: "Pinterest" }, async () => {
        const res = await fetch("/api/pinterest/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, limit: 4 }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(typeof json.error === "string" ? json.error : `HTTP ${res.status}`);
        }
        const list = Array.isArray(json.pins) ? json.pins : [];
        const hint = typeof json.hint === "string" ? json.hint : undefined;
        if (list.length === 0) {
          updateData({
            pins: [],
            value: "",
            lastHint: hint || "Sin resultados.",
            type: "image",
            source: "pinterest",
          });
          return;
        }
        const first = list[0] as PinterestPin;
        updateData({
          pins: list,
          selectedIndex: 0,
          value: first.imageUrl,
          lastHint: hint,
          type: "image",
          source: "pinterest",
        });
      });
      if (!ok) {
        updateData({ lastHint: "Búsqueda cancelada o con error." });
      }
    } catch (e) {
      console.error("[PinterestSearchNode]", e);
      updateData({
        lastHint: e instanceof Error ? e.message : "Error al buscar.",
      });
    } finally {
      setLoading(false);
    }
  }, [id, edges, nodes, updateData]);

  useRegisterAssistantNodeRun(id, runSearch);

  const pick = (idx: number) => {
    if (idx < 0 || idx >= pins.length) return;
    const p = pins[idx];
    updateData({ selectedIndex: idx, value: p.imageUrl, type: "image", source: "pinterest" });
  };

  const previewSnippet =
    searchText.length > 120 ? `${searchText.slice(0, 117)}…` : searchText;

  return (
    <div
      className={`custom-node border-rose-500/35 pinterest-search-node ${loading ? "node-glow-running" : ""}`}
      style={{ minWidth: 280 }}
    >
      <div className="handle-wrapper handle-left" style={{ top: "32%" }}>
        <FoldderDataHandle type="target" position={Position.Left} id="prompt" dataType="prompt" />
        <span className="handle-label">Prompt</span>
      </div>
      <FoldderNodeResizer minWidth={280} minHeight={340} isVisible={selected} />
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Pinterest" />
      <div className="node-header">
        <NodeIcon type="pinterestSearch" loading={loading} selected={selected} size={16} />
        <FoldderNodeHeaderTitle
          className="flex-1"
          introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}
        >
          PINTEREST
        </FoldderNodeHeaderTitle>
        {loading && <Loader2 size={12} className="animate-spin shrink-0" />}
      </div>
      <div className="node-content">
        <div className="mb-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2">
          <p className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Texto de búsqueda (entrada)</p>
          {previewSnippet ? (
            <p className="mt-1 line-clamp-3 font-mono text-[9px] leading-snug text-rose-100/95">{previewSnippet}</p>
          ) : (
            <p className="mt-1 text-[9px] leading-snug text-zinc-500">
              Conecta un nodo <span className="font-bold text-zinc-400">Prompt</span> a la izquierda.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void runSearch()}
          disabled={loading || !searchText}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/15 py-2 text-[10px] font-black uppercase tracking-widest text-rose-100 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Pin size={14} strokeWidth={2} aria-hidden />
          Buscar
        </button>

        {nodeData.lastHint ? (
          <p className="mb-2 text-[9px] leading-snug text-amber-200/90">{nodeData.lastHint}</p>
        ) : null}

        <div className="relative mb-2 w-full overflow-hidden rounded-xl border border-white/10 bg-slate-900/40 aspect-video shadow-inner">
          {currentUrl ? (
            <img src={currentUrl} className="h-full w-full object-contain" alt="" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-500">
              <Pin size={28} strokeWidth={1.5} />
              <span className="text-[9px] font-black uppercase tracking-tighter">Resultado principal</span>
            </div>
          )}
        </div>

        {pins.length > 0 && (
          <div>
            <p className="mb-1.5 text-[8px] font-black uppercase tracking-widest text-zinc-500">Sugerencias</p>
            <div className="grid grid-cols-4 gap-1.5">
              {pins.slice(0, 4).map((p, idx) => (
                <button
                  key={p.id || idx}
                  type="button"
                  onClick={() => pick(idx)}
                  className={`aspect-square overflow-hidden rounded-lg border transition ${
                    idx === selectedIndex
                      ? "border-rose-400 ring-2 ring-rose-400/30"
                      : "border-white/10 opacity-80 hover:opacity-100"
                  }`}
                >
                  {p.imageUrl ? (
                    <img src={p.imageUrl} className="h-full w-full object-cover" alt="" />
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="handle-wrapper handle-right">
        <span className="handle-label">Imagen</span>
        <FoldderDataHandle type="source" position={Position.Right} id="image" dataType="image" />
      </div>
    </div>
  );
});

export const ImageExportNode = memo(function ImageExportNode({ id, data, selected }: NodeProps) {
  const nodes = useNodes();
  const edges = useEdges();
  const [format, setFormat] = useState<'png' | 'jpeg'>('png');
  const [isExporting, setIsExporting] = useState(false);
  const [detectedSize, setDetectedSize] = useState<{ url: string; w: number; h: number } | null>(null);

  // Refs for synchronous form-based download (bypasses Chrome async security blocks)
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const layersInputRef = useRef<HTMLInputElement>(null);
  const filenameInputRef = useRef<HTMLInputElement>(null);
  const formatInputRef = useRef<HTMLInputElement>(null);

  // Find the single source connected to this node
  const sourceEdge = edges.find(e => e.target === id);
  const sourceNode = sourceEdge ? nodes.find(n => n.id === sourceEdge.source) : null;
  const sourceNodeDimensions = sourceNode?.data as { width?: number; height?: number } | undefined;

  const layers = useMemo(() => {
    if (!sourceNode) return [];
    return [{
      type: sourceNode.type,
      value: sourceNode.data.value as string | undefined,
      width: sourceNodeDimensions?.width || 0,
      height: sourceNodeDimensions?.height || 0
    }].filter(l => l.value);
  }, [sourceNode, sourceNodeDimensions?.height, sourceNodeDimensions?.width]);

  // Native pixel size of the connected image (data URLs from Crop, http(s), blob: — all measured the same)
  const imageUrl = sourceNode?.data?.value as string | undefined;
  const activeDetectedSize =
    imageUrl && detectedSize?.url === imageUrl ? detectedSize : null;
  useEffect(() => {
    if (!imageUrl || typeof imageUrl !== 'string') return;
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setDetectedSize({ url: imageUrl, w: img.naturalWidth, h: img.naturalHeight });
      }
    };
    img.onerror = () => {
      const w = Number(sourceNodeDimensions?.width);
      const h = Number(sourceNodeDimensions?.height);
      if (w > 0 && h > 0) setDetectedSize({ url: imageUrl, w, h });
    };
    img.src = imageUrl;
  }, [imageUrl, sourceNode?.id, sourceNodeDimensions?.height, sourceNodeDimensions?.width]);

  // Export canvas = tamaño real de la imagen (p. ej. recorte); si aún no se midió, datos del nodo o fallback
  const exportW = activeDetectedSize?.w || Number(sourceNodeDimensions?.width) || 1920;
  const exportH = activeDetectedSize?.h || Number(sourceNodeDimensions?.height) || 1080;

  const directImageSrc =
    sourceNode && typeof sourceNode.data?.value === 'string' ? sourceNode.data.value : null;

  const handleExport = () => {
    if (!sourceNode) return alert("Connect an image first!");
    if (!formRef.current || !layersInputRef.current || !filenameInputRef.current || !formatInputRef.current) return;

    const extension = format === 'jpeg' ? 'jpg' : 'png';
    const filename = `AI_Space_Output_${Date.now()}.${extension}`;

    // Populate form inputs SYNCHRONOUSLY (before any awaits)
    layersInputRef.current.value = JSON.stringify(layers);
    filenameInputRef.current.value = filename;
    formatInputRef.current.value = format;

    // SYNCHRONOUS form submit → browser handles Content-Disposition: attachment natively
    formRef.current.submit();
    dispatchFoldderExportCreated({
      name: filename,
      extension: `.${extension}`,
      sourceNodeId: sourceNode.id,
      thumbnailUrl: directImageSrc ?? undefined,
      mimeType: format === "jpeg" ? "image/jpeg" : "image/png",
      exportedFrom: "imageExport",
      exportFormat: extension,
      metadata: {
        exportNodeId: id,
        width: exportW,
        height: exportH,
      },
    });

    setIsExporting(true);
    window.setTimeout(() => setIsExporting(false), 500);
  };

  useRegisterAssistantNodeRun(id, handleExport);



  return (
    <div
      className="custom-node processor-node export-node border-rose-500/30"
      style={{ minWidth: 240, maxHeight: 600 }}
    >
      <FoldderNodeResizer minWidth={240} minHeight={180} maxWidth={960} maxHeight={600} isVisible={selected} />
      <NodeLabel id={id} label={typeof data.label === "string" ? data.label : undefined} defaultLabel="Export" />

      {/* Hidden iframe — receives the form POST response (Content-Disposition: attachment) */}
      <iframe
        ref={iframeRef}
        name="export-download-frame"
        title="download"
        style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: '1px', height: '1px', opacity: 0 }}
      />

      {/* Hidden form — submitted synchronously when user clicks Export */}
      <form
        ref={formRef}
        action="/api/spaces/compose"
        method="POST"
        target="export-download-frame"
        style={{ display: 'none' }}
      >
        <input ref={layersInputRef} type="hidden" name="layers" />
        <input ref={filenameInputRef} type="hidden" name="filename" />
        <input ref={formatInputRef} type="hidden" name="format" />
        <input type="hidden" name="width" value={String(exportW)} />
        <input type="hidden" name="height" value={String(exportH)} />
        <input type="hidden" name="previewWidth" value={String(exportW)} />
        <input type="hidden" name="previewHeight" value={String(exportH)} />
      </form>

      <div className="handle-wrapper handle-left">
        <FoldderDataHandle type="target" position={Position.Left} id="image" dataType="image" />
        <span className="handle-label">Image Input</span>
      </div>
      <div className="node-header">
        <NodeIcon type="imageExport" selected={selected} loading={isExporting} size={16} />
        <FoldderNodeHeaderTitle introActive={!!(data as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}>
          IMAGE EXPORT
        </FoldderNodeHeaderTitle>
      </div>
      <div className="node-content flex flex-col gap-3">
        <div className="flex shrink-0 flex-col gap-3">
          <div className="flex gap-2">
            <button
              onClick={() => setFormat('png')}
              className={`flex-1 py-1 rounded text-[10px] font-bold transition-all ${format === 'png' ? 'bg-[#1d2433] text-white' : 'bg-white/5 text-gray-400 border border-white/10'}`}
            >
              PNG
            </button>
            <button
              onClick={() => setFormat('jpeg')}
              className={`flex-1 py-1 rounded text-[10px] font-bold transition-all ${format === 'jpeg' ? 'bg-[#1d2433] text-white' : 'bg-white/5 text-gray-400 border border-white/10'}`}
            >
              JPG
            </button>
          </div>

          <button
            className={`execute-btn w-full justify-center ${isExporting ? 'opacity-50' : ''}`}
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? (
              <>
                <Loader2 size={14} className="animate-spin" /> BUILDING...
              </>
            ) : (
              <>
                <Download size={14} /> EXPORT {format.toUpperCase()}
              </>
            )}
          </button>

          <div className="flex justify-between items-center text-[8px] font-mono text-gray-500 uppercase">
            <span>
              {exportW}×{exportH} PX{detectedSize ? ' · tamaño real' : ' · estimado'}
            </span>
            <span>EXPORT READY</span>
          </div>
        </div>

        {/* Preview: marco con la misma proporción que la imagen (exportW/H); encaja en el nodo sin deformar */}
        <div
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0a] group/out"
          style={{ minHeight: 120 }}
        >
          {directImageSrc ? (
            <div
              className="max-h-full max-w-full min-h-0 min-w-0"
              style={{
                aspectRatio: `${Math.max(1, exportW)} / ${Math.max(1, exportH)}`,
              }}
            >
              <img
                src={directImageSrc}
                className="block h-full w-full object-contain"
                alt="Export preview"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-500">
              <ImageIcon size={32} />
              <span className="text-[9px] font-black uppercase">No source connected</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});


// --- UNIVERSAL MEDIA INPUT NODE ---

export const MediaInputNode = memo(function MediaInputNode({ id, data, selected }: NodeProps) {
  const nodeData = data as BaseNodeData & { 
    type?: 'video' | 'image' | 'audio' | 'pdf' | 'txt' | 'url',
    source?: 'upload' | 'url' | 'asset',
    metadata?: { duration?: string, resolution?: string, fps?: number, size?: string, codec?: string }
  };
  const nodes = useNodes();
  const { setNodes, fitView } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const [isUploadingLocal, setIsUploadingLocal] = useState(false);
  const [showFullSize, setShowFullSize] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaFitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [mediaSize, setMediaSize] = useState<{ url: string; width: number; height: number } | null>(null);
  const isUploading = isUploadingLocal || nodeData.loading;
  const currentNode = nodes.find((node) => node.id === id);
  const currentFrameNode = useCurrentNodeFrameSnapshot(currentNode);

  /** Tras cargar imagen/vídeo el nodo cambia de alto (p. ej. a aspect-video): encuadrar; duración alineada con `fitAnim` (nominal/2) en page. */
  const scheduleFitViewportToThisNode = useCallback((opts?: { force?: boolean }) => {
    if (!opts?.force && isFoldderMediaPreviewAutoFitSuppressed()) return;
    if (mediaFitTimerRef.current) clearTimeout(mediaFitTimerRef.current);
    mediaFitTimerRef.current = setTimeout(() => {
      mediaFitTimerRef.current = null;
      if (!opts?.force && isFoldderMediaPreviewAutoFitSuppressed()) return;
      void fitView({
        nodes: [{ id }] as Node[],
        padding: 0.8,
        duration: Math.max(40, Math.round(650 / 2)),
        interpolate: 'smooth',
        ...FOLDDER_FIT_VIEW_EASE,
      });
    }, 100);
  }, [fitView, id]);

  useEffect(() => () => {
    if (mediaFitTimerRef.current) clearTimeout(mediaFitTimerRef.current);
  }, []);

  const updateNodeData = (updates: Record<string, unknown>) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...updates } } : n)));
  };

  const getFileType = (fileName: string, mime: string): 'video' | 'image' | 'audio' | 'pdf' | 'txt' | 'url' => {
    if (mime.startsWith('video/') || fileName.match(/\.(mp4|mov|avi|webm|mkv)$/i)) return 'video';
    if (mime.startsWith('image/') || fileName.match(/\.(jpg|jpeg|png|webp|avif|gif|svg)$/i)) return 'image';
    if (mime.startsWith('audio/') || fileName.match(/\.(mp3|wav|ogg|flac|m4a)$/i)) return 'audio';
    if (mime === 'application/pdf' || fileName.endsWith('.pdf')) return 'pdf';
    if (mime.startsWith('text/') || fileName.endsWith('.txt')) return 'txt';
    return 'url';
  };

  const handleFileUpload = async (file: File) => {
    setIsUploadingLocal(true);
    updateNodeData({ error: false, uploadError: undefined });
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/runway/upload', { method: 'POST', body: formData });
      const json = await readResponseJson<{ url?: string; s3Key?: string; error?: string }>(
        res,
        'POST /api/runway/upload (mediaInput)'
      );
      if (json?.url) {
        const type = getFileType(file.name, file.type);
        const mockMetadata = {
          size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
          resolution: (type === 'video' || type === 'image') ? '1920×1080' : '-',
          duration: (type === 'video' || type === 'audio') ? '–' : '-',
          codec: file.type.split('/')[1]?.toUpperCase() || 'UNKNOWN'
        };
        updateNodeData({
          value: json.url,
          type,
          source: 'upload',
          metadata: mockMetadata,
          ...(json.s3Key ? { s3Key: json.s3Key } : {}),
          error: false,
          uploadError: undefined,
        });
        if (type === 'image' || type === 'video') scheduleFitViewportToThisNode({ force: true });
      } else {
        const detail =
          json?.error ||
          (!res.ok ? `HTTP ${res.status}` : undefined) ||
          'El servidor no devolvió URL (revisa S3 y la consola).';
        console.error('[MediaInput] upload failed:', detail, json);
        updateNodeData({
          error: true,
          uploadError: detail,
        });
      }
    } catch (err) {
      console.error('Upload error:', err);
      updateNodeData({
        error: true,
        uploadError: err instanceof Error ? err.message : 'Error de red',
      });
    } finally {
      setIsUploadingLocal(false);
    }
  };

  /** Misma acción que «subir» inicial: abrir selector y dejar que onChange → handleFileUpload. */
  const triggerReplaceFile = useCallback(() => {
    const el = fileInputRef.current;
    if (!el) return;
    try {
      el.value = '';
    } catch {
      /* ignore */
    }
    el.click();
  }, []);

  const mediaIconKey = (): FoldderIconKey => {
    switch (nodeData.type) {
      case 'image': return 'asset';
      case 'video': return 'video';
      case 'audio': return 'nano';
      case 'pdf': return 'prompt';
      case 'txt': return 'prompt';
      case 'url': return 'web';
      default: return 'asset';
    }
  };

  const getTitleColor = () => {
    switch (nodeData.type) {
      case 'video':
      case 'image':
        return FOLDDER_LOGO_BLUE;
      case 'audio':
        return '#a855f7';
      default:
        return '#9ca3af';
    }
  };

  const hasMedia = !!nodeData.value;
  const isVisual = nodeData.type === 'image' || nodeData.type === 'video';
  const hasSizedVisualMedia =
    hasMedia && isVisual && !!nodeData.value && mediaSize?.url === nodeData.value;
  const visualMediaWidth = hasSizedVisualMedia ? mediaSize?.width ?? null : null;
  const visualMediaHeight = hasSizedVisualMedia ? mediaSize?.height ?? null : null;
  /** Preview: vídeo 16:9; imagen conserva ratio dentro del ancho del nodo y tope de alto (cabecera + resizer ~520px). */
  const mediaPreviewFrameClass =
    hasMedia && isVisual
      ? 'flex min-h-0 flex-1 items-center justify-center'
      : 'flex min-h-[160px] items-center justify-center';

  useEffect(() => {
    if (!hasMedia || !isVisual || !nodeData.value) return;
    let cancelled = false;
    const mediaUrl = nodeData.value;
    const loadDimensions =
      nodeData.type === 'video'
        ? loadVideoDimensions(mediaUrl)
        : loadImageDimensions(mediaUrl);
    loadDimensions
      .then(({ width, height }) => {
        if (!cancelled) setMediaSize({ url: mediaUrl, width, height });
      })
      .catch(() => {
        /* noop: si no podemos leer dimensiones, el nodo conserva su caja base */
      });
    return () => {
      cancelled = true;
    };
  }, [hasMedia, isVisual, nodeData.type, nodeData.value]);

  useLayoutEffect(() => {
    if (!hasSizedVisualMedia || visualMediaWidth == null || visualMediaHeight == null) return;
    const chromeHeight = resolveNodeChromeHeight(frameRef.current, previewRef.current);
    const nextFrame = resolveAspectLockedNodeFrame({
      node: currentFrameNode,
      contentWidth: visualMediaWidth,
      contentHeight: visualMediaHeight,
      minWidth: 280,
      maxWidth: 960,
      minHeight: 200,
      maxHeight: STUDIO_NODE_MAX_HEIGHT,
      chromeHeight,
    });
    if (!nodeFrameNeedsSync(currentFrameNode, nextFrame)) return;
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? {
              ...node,
              width: nextFrame.width,
              height: nextFrame.height,
              style: { ...node.style, width: nextFrame.width, height: nextFrame.height },
            }
          : node,
      ),
    );
    requestAnimationFrame(() => {
      updateNodeInternals(id);
      scheduleFitViewportToThisNode();
    });
  }, [
    currentFrameNode,
    hasMedia,
    hasSizedVisualMedia,
    id,
    isVisual,
    scheduleFitViewportToThisNode,
    setNodes,
    updateNodeInternals,
    visualMediaHeight,
    visualMediaWidth,
  ]);

  return (
    <div
      ref={frameRef}
      className="custom-node"
      style={{ padding: 0, minWidth: 280, borderRadius: 9, overflow: 'visible' }}
    >
      <FoldderNodeResizer
        minWidth={280}
        minHeight={hasMedia && isVisual ? 200 : 320}
        maxWidth={hasMedia && isVisual ? 960 : undefined}
        maxHeight={hasMedia && isVisual ? STUDIO_NODE_MAX_HEIGHT : undefined}
        keepAspectRatio={hasSizedVisualMedia}
        isVisible={selected}
      />
      <NodeLabel id={id} label={nodeData.label} defaultLabel={nodeData.type ? `${nodeData.type.charAt(0).toUpperCase() + nodeData.type.slice(1)} Input` : 'Media Input'} />

      {/* Persistent header */}
      <div className="node-header">
        <NodeIcon type="mediaInput" iconKey={mediaIconKey()} selected={selected} loading={isUploading} size={16} />
        <FoldderNodeHeaderTitle
          className="min-w-0 flex-1 tracking-tighter uppercase"
          introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}
        >
          {`${nodeData.type || 'Media'} Input`}
        </FoldderNodeHeaderTitle>
        {nodeData.type && (
          <span className="shrink-0 text-[8px] bg-white/10 px-2 py-0.5 rounded-full font-light uppercase tracking-widest text-white/75">
            {nodeData.source || 'upload'}
          </span>
        )}
      </div>

      {/* Full-bleed drop zone / preview */}
      <div
        ref={previewRef}
        className={`group relative w-full ${mediaPreviewFrameClass} overflow-hidden bg-zinc-900 ${hasMedia ? 'cursor-default' : 'cursor-pointer'} transition-all`}
        style={{ outline: isDragOver ? `2px dashed ${FOLDDER_LOGO_BLUE}` : 'none', outlineOffset: '-2px' }}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragOver(false); const file = e.dataTransfer.files[0]; if (file) handleFileUpload(file); }}
        onClick={() => !hasMedia && fileInputRef.current?.click()}
      >
        {/* sr-only: no usar display:none — en varios navegadores el .click() programático no abre el diálogo */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,image/*,audio/*,.pdf,.txt"
          className="sr-only"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFileUpload(f);
          }}
        />

        {/* Preview */}
        {isUploading ? (
          <div className="flex flex-col items-center gap-2 text-rose-400">
            <Loader2 size={28} className="animate-spin" />
            <span className="text-[9px] font-bold uppercase tracking-widest">Uploading…</span>
          </div>
        ) : nodeData.error && !hasMedia ? (
          <div
            className="flex flex-col items-center gap-2 px-4 text-center text-rose-400"
            onClick={(e) => e.stopPropagation()}
          >
            <AlertCircle size={28} className="shrink-0" />
            <span className="text-[9px] font-bold uppercase tracking-widest">Error al subir</span>
            {nodeData.uploadError && (
              <span className="text-[8px] leading-snug text-rose-200/90">{nodeData.uploadError}</span>
            )}
            <button
              type="button"
              className="nodrag mt-1 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                triggerReplaceFile();
              }}
            >
              Reintentar
            </button>
          </div>
        ) : hasMedia && nodeData.type === 'video' ? (
          <div className="relative w-full h-full">
            <video
              ref={videoRef}
              src={nodeData.value}
              className="w-full h-full object-contain"
              muted
              loop
              onLoadedData={() => scheduleFitViewportToThisNode()}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            />
            {/* Play/pause overlay button */}
            <button
              className="absolute inset-0 flex items-center justify-center nodrag group"
              onClick={(e) => {
                e.stopPropagation();
                const v = videoRef.current;
                if (!v) return;
                if (v.paused) { v.play(); } else { v.pause(); }
              }}
            >
              {!isPlaying && (
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-all group-hover:scale-110"
                  style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
                >
                  <svg width="14" height="16" viewBox="0 0 14 16" fill="white">
                    <path d="M0 0L14 8L0 16V0Z" />
                  </svg>
                </div>
              )}
              {isPlaying && (
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
                >
                  <svg width="12" height="14" viewBox="0 0 12 14" fill="white">
                    <rect x="0" y="0" width="4" height="14" />
                    <rect x="8" y="0" width="4" height="14" />
                  </svg>
                </div>
              )}
            </button>
          </div>

        ) : hasMedia && nodeData.type === 'image' ? (
          <img
            src={nodeData.value}
            className="mx-auto block h-full w-full object-contain"
            alt="Preview"
            onLoad={() => scheduleFitViewportToThisNode()}
          />
        ) : hasMedia && nodeData.type === 'audio' ? (
          <div className="flex flex-col items-center gap-3 text-purple-400">
            <Music size={36} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Audio Loaded</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 select-none">
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
              <FilePlus size={22} className="text-gray-600" />
            </div>
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-tight text-center px-6">
              Drop file or click to upload
            </span>
            <span className="text-[8px] text-gray-700 uppercase tracking-widest">
              video · image · audio · pdf
            </span>
          </div>
        )}

        {/* Drag-over replace hint */}
        {isDragOver && hasMedia && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="text-white font-black text-[11px] uppercase tracking-widest">Replace media</span>
          </div>
        )}

        {/* Metadata overlay strip */}
        {hasMedia && nodeData.metadata && isVisual && (
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-1.5"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)' }}>
            <span className="text-[8px] font-mono text-white/60 uppercase">
              {nodeData.metadata.resolution}
            </span>
            <span className="text-[8px] font-mono text-white/60 uppercase">
              {nodeData.metadata.codec}
            </span>
            <span className="text-[8px] font-mono text-white/60 uppercase">
              {nodeData.metadata.size}
            </span>
          </div>
        )}

        {/* Header pill top-left */}
        {hasMedia && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest"
            style={{ background: 'rgba(0,0,0,0.55)', color: getTitleColor(), backdropFilter: 'blur(6px)' }}>
            <NodeIcon type="mediaInput" iconKey={mediaIconKey()} size={12} colorOverride={getTitleColor()} />
            <span>{nodeData.type}</span>
          </div>
        )}

        {/* Fullscreen button top-right */}
        {hasMedia && isVisual && (
          <button
            className="absolute top-2 right-2 z-[21] w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-110 nodrag"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
            onClick={(e) => { e.stopPropagation(); setShowFullSize(true); }}
            title="Ver tamaño completo"
          >
            <Maximize2 size={12} className="text-white/70" />
          </button>
        )}

        {hasMedia && !isUploading && (
          <>
            <MediaInputChangeMediaButton disabled={isUploadingLocal} onClick={triggerReplaceFile} />
            <button
              type="button"
              className="absolute bottom-2 right-2 z-[22] flex h-8 w-8 items-center justify-center rounded-full nodrag transition-opacity hover:opacity-100"
              style={{ background: 'rgba(0,0,0,0.6)' }}
              title="Reemplazar archivo"
              onClick={(e) => {
                e.stopPropagation();
                triggerReplaceFile();
              }}
            >
              <FilePlus size={14} className="text-white/90" />
            </button>
          </>
        )}
      </div>

      {/* Fullscreen portal overlay */}
      {showFullSize && nodeData.value && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/95 flex flex-col items-center justify-center nodrag nopan"
          data-foldder-studio-canvas=""
          onClick={() => setShowFullSize(false)}
          style={{ backdropFilter: 'blur(12px)' }}
        >
          <div className="absolute top-6 right-6 flex items-center gap-4">
            <span className="text-white/40 text-[10px] uppercase tracking-widest">Click anywhere to close</span>
            <button className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all" onClick={() => setShowFullSize(false)}>
              <X size={20} className="text-white" />
            </button>
          </div>
          {/* Metadata bar */}
          {nodeData.metadata && (
            <div className="absolute top-6 left-6 flex items-center gap-4">
              {Object.entries(nodeData.metadata).map(([k,v]) => (
                <div key={k} className="text-center">
                  <div className="text-[8px] text-white/30 uppercase tracking-widest">{k}</div>
                  <div className="text-[11px] text-white/70 font-mono">{v as string}</div>
                </div>
              ))}
            </div>
          )}
          <div onClick={(e) => e.stopPropagation()} className="max-w-[90vw] max-h-[85vh]">
            {nodeData.type === 'video' ? (
              <video
                src={nodeData.value}
                className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl"
                controls
                autoPlay
              />
            ) : (
              <img
                src={nodeData.value}
                className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain"
                alt="Full size"
              />
            )}
          </div>
        </div>,
        document.body
      )}

      <div className="handle-wrapper handle-right" style={{ top: '50%' }}>
        <span className="handle-label">Media Asset</span>
        <FoldderDataHandle type="source" position={Position.Right} id="media" dataType={foldderMediaInputDataType(nodeData.type)} />
      </div>
    </div>
  );
});


export const PromptNode = memo(function PromptNode({ id, data, selected }: NodeProps) {
  const nodeData = data as BaseNodeData;
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const taRef = useRef<HTMLTextAreaElement>(null);

  const syncTextareaHeight = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.max(el.scrollHeight, 0)}px`;
  }, []);

  useLayoutEffect(() => {
    syncTextareaHeight();
    updateNodeInternals(id);
  }, [nodeData.value, syncTextareaHeight, id, updateNodeInternals]);

  return (
    <div className="custom-node prompt-node prompt-node--compact" style={{ minWidth: 260 }}>
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Prompt" />
      <div className="node-header">
        <NodeIcon type="promptInput" selected={selected} size={16} />
        <FoldderNodeHeaderTitle introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}>
          PROMPT
        </FoldderNodeHeaderTitle>
      </div>
      <div className="node-content node-content--prompt-fill">
        <textarea
          ref={taRef}
          className="node-textarea node-textarea--prompt-compact nowheel nodrag nokey"
          rows={1}
          placeholder="Describe your vision…"
          value={nodeData.value || ''}
          onChange={(e) =>
            setNodes((nds) =>
              nds.map((n) =>
                n.id === id ? { ...n, data: { ...n.data, value: e.target.value } } : n
              )
            )
          }
          onContextMenu={(e) => e.stopPropagation()}
        />
      </div>
      <div className="handle-wrapper handle-right">
        <span className="handle-label">Prompt out</span>
        <FoldderDataHandle type="source" position={Position.Right} id="prompt" dataType="prompt" />
      </div>
    </div>
  );
});

// --- LOGIC NODES ---

export const ConcatenatorNode = memo(function ConcatenatorNode({ id, data, selected }: NodeProps) {
  const nodeData = data as BaseNodeData;
  const nodes = useNodes();
  const edges = useEdges();
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();

  const ALL_HANDLES = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];

  const connectedEdges = useMemo(
    () =>
      edges
        .filter((e) => e.target === id)
        .sort((a, b) => (a.targetHandle || '').localeCompare(b.targetHandle || '')),
    [edges, id]
  );

  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const connectedHandleIds = useMemo(() => new Set(connectedEdges.map((e) => e.targetHandle)), [connectedEdges]);
  const visibleCount = Math.min(Math.max(connectedEdges.length + 1, 1), ALL_HANDLES.length);

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, visibleCount, updateNodeInternals]);

  // Dynamic logic: result is concatenation of all connected prompt values
  useEffect(() => {
    const values = connectedEdges.map((edge) =>
      resolvePromptValueFromEdgeSourceMap(edge, nodesById)
    );

    const result = values.filter((v): v is string => Boolean(v)).join(' ').trim();
    if (result !== (nodeData.value || '')) {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, value: result } } : n))
      );
    }
  }, [connectedEdges, nodesById, id, nodeData.value, setNodes]);

  return (
    <div className={`custom-node tool-node` } style={{ minWidth: 240 }}>
      <FoldderNodeResizer minWidth={240} minHeight={180} maxWidth={600} maxHeight={520} isVisible={selected} />
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Concatenator" />
      {ALL_HANDLES.map((hId, index) => {
        const visible = index < visibleCount;
        return (
          <div
            key={hId}
            className="handle-wrapper handle-left"
            style={{
              top: `${((index + 1) / (ALL_HANDLES.length + 1)) * 100}%`,
              opacity: visible ? 1 : 0,
              pointerEvents: visible ? 'auto' : 'none',
            }}
          >
            <FoldderDataHandle
              type="target"
              position={Position.Left}
              id={hId}
              dataType="prompt"
              className={connectedHandleIds.has(hId) ? '' : 'opacity-40'}
            />
            <span className="handle-label" style={{ fontSize: 4 }}>
              {connectedHandleIds.has(hId) ? `In ${index + 1} ✓` : `In ${index + 1}`}
            </span>
          </div>
        );
      })}
      
      <div className="node-header">
        <NodeIcon type="concatenator" selected={selected} size={16} />
        <FoldderNodeHeaderTitle introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}>
          Concatenator
        </FoldderNodeHeaderTitle>
        <div className="node-badge">UTILITY</div>
      </div>
      <div className="node-content flex min-w-0 flex-col gap-3 px-3 pb-3 pt-2">
        <div className="min-w-0">
          <span className="node-label">Salida concatenada</span>
          <div className="max-h-[180px] min-h-[50px] min-w-0 w-full max-w-full overflow-y-auto break-words whitespace-pre-wrap rounded-xl border border-slate-200/60 bg-slate-50/50 p-3 shadow-inner">
            {nodeData.value?.trim() ? (
              <span className="font-mono text-[10px] leading-relaxed text-slate-900">{nodeData.value}</span>
            ) : (
              <span className="text-[10px] italic text-slate-500">
                Conecta prompts a la izquierda para combinarlos…
              </span>
            )}
          </div>
        </div>
        <div className="text-[8px] font-bold uppercase tracking-tighter text-slate-500">
          {connectedEdges.length} inputs activos
        </div>
      </div>

      <div className="handle-wrapper handle-right">
        <span className="handle-label">Result</span>
        <FoldderDataHandle type="source" position={Position.Right} id="prompt" dataType="prompt" />
      </div>
    </div>
  );
});

/** Salida del listado: título del nodo (data.label) + texto de la opción elegida. */
function formatListadoOutput(label: string | undefined, rawOptionValue: string): string {
  const name = (label ?? '').trim() || 'Listado';
  return `${name}: ${rawOptionValue}`;
}

export const ListadoNode = memo(function ListadoNode({ id, data, selected }: NodeProps) {
  const nodeData = data as BaseNodeData & { selectedEdgeId?: string };
  const nodes = useNodes();
  const edges = useEdges();
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();

  const ALL_HANDLES = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];

  const connectedEdges = useMemo(
    () =>
      edges
        .filter((e) => e.target === id)
        .sort((a, b) => (a.targetHandle || '').localeCompare(b.targetHandle || '')),
    [edges, id]
  );

  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const connectedHandleIds = useMemo(() => new Set(connectedEdges.map((e) => e.targetHandle)), [connectedEdges]);
  /** Una ranura vacía debajo de la última conexión (máx. 8). */
  const visibleCount = Math.min(Math.max(connectedEdges.length + 1, 1), ALL_HANDLES.length);

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, visibleCount, updateNodeInternals]);

  const options = useMemo(() => {
    return connectedEdges.map((edge, i: number) => {
      const val = String(resolvePromptValueFromEdgeSourceMap(edge, nodesById) ?? '');
      const truncated = val.length > 72 ? `${val.slice(0, 72)}…` : val;
      const display = val.trim() ? truncated : `(vacío) · entrada ${i + 1}`;
      return {
        edgeId: edge.id,
        sourceId: edge.source,
        targetHandle: edge.targetHandle || '',
        display,
        value: val,
      };
    });
  }, [connectedEdges, nodesById]);

  useEffect(() => {
    if (options.length === 0) {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const d = n.data || {};
          if ((d.value || '') === '' && !d.selectedEdgeId) return n;
          return { ...n, data: { ...d, value: '', selectedEdgeId: undefined } };
        })
      );
      return;
    }
    let edgeId = nodeData.selectedEdgeId;
    if (!edgeId || !options.some((o) => o.edgeId === edgeId)) {
      edgeId = options[0].edgeId;
    }
    const chosen = options.find((o) => o.edgeId === edgeId)!;
    const newVal = formatListadoOutput(nodeData.label, chosen.value);
    if (newVal !== (nodeData.value ?? '') || edgeId !== nodeData.selectedEdgeId) {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? { ...n, data: { ...n.data, value: newVal, selectedEdgeId: edgeId } }
            : n
        )
      );
    }
  }, [options, nodeData.selectedEdgeId, nodeData.value, nodeData.label, id, setNodes]);

  return (
    <div className="custom-node tool-node" style={{ minWidth: 280 }}>
      <FoldderNodeResizer minWidth={280} minHeight={130} maxWidth={520} maxHeight={400} isVisible={selected} />
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Listado" />
      {ALL_HANDLES.map((hId, index) => {
        const visible = index < visibleCount;
        return (
          <div
            key={hId}
            className="handle-wrapper handle-left"
            style={{
              top: `${((index + 1) / (ALL_HANDLES.length + 1)) * 100}%`,
              opacity: visible ? 1 : 0,
              pointerEvents: visible ? 'auto' : 'none',
            }}
          >
            <FoldderDataHandle
              type="target"
              position={Position.Left}
              id={hId}
              dataType="prompt"
              className={connectedHandleIds.has(hId) ? '' : 'opacity-40'}
            />
            <span className="handle-label" style={{ fontSize: 4 }}>
              {connectedHandleIds.has(hId) ? `In ${index + 1} ✓` : `In ${index + 1}`}
            </span>
          </div>
        );
      })}

      <div className="node-header">
        <NodeIcon type="listado" selected={selected} size={16} />
        <FoldderNodeHeaderTitle introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}>
          Listado
        </FoldderNodeHeaderTitle>
        <div className="node-badge">LOGIC</div>
      </div>
      <div className="node-content flex flex-col gap-2 px-3 pb-3 pt-2">
        <label className="node-label text-[9px] text-gray-500">Salida (título del nodo: texto elegido)</label>
        <select
          className="nodrag nowheel w-full cursor-pointer rounded-lg border border-slate-200/70 bg-white/[0.92] px-2.5 py-2 text-[11px] font-medium text-slate-800 shadow-inner outline-none transition-colors focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/30"
          value={nodeData.selectedEdgeId && options.some((o) => o.edgeId === nodeData.selectedEdgeId) ? nodeData.selectedEdgeId : options[0]?.edgeId || ''}
          onChange={(e) => {
            const nextId = e.target.value;
            const opt = options.find((o) => o.edgeId === nextId);
            setNodes((nds) =>
              nds.map((n) => {
                if (n.id !== id) return n;
                const lbl = (n.data as BaseNodeData)?.label;
                return {
                  ...n,
                  data: {
                    ...n.data,
                    selectedEdgeId: nextId || undefined,
                    value: formatListadoOutput(lbl, opt?.value ?? ''),
                  },
                };
              })
            );
          }}
          disabled={options.length === 0}
        >
          {options.length === 0 ? (
            <option value="">Conecta nodos prompt (ranuras In 1…)</option>
          ) : (
            options.map((o) => (
              <option key={o.edgeId} value={o.edgeId}>
                {o.display}
              </option>
            ))
          )}
        </select>
        <div className="rounded-md border border-slate-200/40 bg-slate-50/40 px-2 py-1.5 text-[9px] leading-snug text-slate-500">
          {options.length === 0
            ? 'Conecta varios prompts por la izquierda; elige cuál enviar por la salida.'
            : `${options.length} fuente(s) · salida: «${(nodeData.label ?? '').trim() || 'Listado'}»: texto de la opción.`}
        </div>
      </div>

      <div className="handle-wrapper handle-right">
        <span className="handle-label">Prompt out</span>
        <FoldderDataHandle type="source" position={Position.Right} id="prompt" dataType="prompt" />
      </div>
    </div>
  );
});

export const EnhancerNode = memo(function EnhancerNode({ id, data, selected }: NodeProps) {
  const nodeData = data as BaseNodeData;
  const nodes = useNodes();
  const edges = useEdges();
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const [loading, setLoading] = useState(false);

  // Fixed 8 slots — always in DOM so ReactFlow can always draw edges to them
  const ALL_HANDLES = ['p0','p1','p2','p3','p4','p5','p6','p7'];

  // All edges targeting this node, sorted by handle id
  const connectedEdges = useMemo(() =>
    edges.filter((e) => e.target === id)
         .sort((a, b) => (a.targetHandle || '').localeCompare(b.targetHandle || '')),
    [edges, id]
  );

  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const connectedHandleIds = useMemo(() => new Set(connectedEdges.map((e) => e.targetHandle)), [connectedEdges]);
  /** Misma lógica que Concatenator: al menos 1 ranura visible. */
  const visibleCount = Math.min(Math.max(connectedEdges.length + 1, 1), ALL_HANDLES.length);

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, connectedEdges.length, visibleCount, updateNodeInternals]);

  // Live concatenation
  const concatenated = useMemo(
    () =>
      connectedEdges
        .map((edge) => resolvePromptValueFromEdgeSourceMap(edge, nodesById))
        .filter(Boolean)
        .join('\n\n'),
    [connectedEdges, nodesById]
  );

  const handleEnhance = useCallback(async () => {
    const input = concatenated || nodeData.value;
    if (!input) return alert('Connect at least one prompt!');
    setLoading(true);
    try {
      await runAiJobWithNotification({ nodeId: id, label: 'Prompt Enhancer' }, async () => {
        const res = await fetch('/api/openai/enhance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: input }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const json = await res.json();
        setNodes((nds) =>
          nds.map((n) => n.id === id ? { ...n, data: { ...n.data, value: json.enhanced } } : n)
        );
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [concatenated, nodeData.value, id, setNodes]);

  useRegisterAssistantNodeRun(id, handleEnhance);

  return (
    <div className="custom-node tool-node" style={{ minWidth: 240 }}>
      <FoldderNodeResizer minWidth={240} minHeight={180} maxWidth={600} maxHeight={520} isVisible={selected} />
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Enhancer" />

      {ALL_HANDLES.map((hId, index) => {
        const visible = index < visibleCount;
        return (
          <div
            key={hId}
            className="handle-wrapper handle-left"
            style={{
              top: `${((index + 1) / (ALL_HANDLES.length + 1)) * 100}%`,
              opacity: visible ? 1 : 0,
              pointerEvents: visible ? 'auto' : 'none',
            }}
          >
            <FoldderDataHandle
              type="target"
              position={Position.Left}
              id={hId}
              dataType="prompt"
              className={connectedHandleIds.has(hId) ? '' : 'opacity-40'}
            />
            <span className="handle-label" style={{ fontSize: 4 }}>
              {connectedHandleIds.has(hId) ? `In ${index + 1} ✓` : `In ${index + 1}`}
            </span>
          </div>
        );
      })}

      <div className="node-header">
        <NodeIcon type="enhancer" selected={selected} loading={loading} size={16} />
        <FoldderNodeHeaderTitle introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}>
          Prompt Enhancer
        </FoldderNodeHeaderTitle>
        <div className="node-badge">UTILITY</div>
      </div>

      <div className="node-content flex min-w-0 flex-col gap-3 px-3 pb-3 pt-2">
        <div className="min-w-0">
          <span className="node-label">Entrada combinada</span>
          <div className="max-h-[150px] min-h-[50px] min-w-0 w-full max-w-full overflow-y-auto break-words whitespace-pre-wrap rounded-xl border border-slate-200/60 bg-slate-50/50 p-3 shadow-inner">
            {concatenated ? (
              <span className="font-mono text-[10px] leading-relaxed text-slate-800">{concatenated}</span>
            ) : (
              <span className="text-[10px] italic text-slate-500">Conecta prompts a la izquierda para combinarlos…</span>
            )}
          </div>
        </div>
        <div className="text-[8px] font-bold uppercase tracking-tighter text-slate-500">
          {connectedEdges.length} inputs activos
        </div>

        <button type="button" className="execute-btn w-full shrink-0" onClick={handleEnhance} disabled={loading}>
          {loading ? (
            <>
              <Loader2 size={12} className="animate-spin" /> ENHANCING…
            </>
          ) : (
            'ENHANCE WITH OPENAI'
          )}
        </button>

        <div className="min-w-0">
          <span className="node-label">Salida mejorada</span>
          <div className="max-h-[180px] min-h-[50px] min-w-0 w-full max-w-full overflow-y-auto break-words whitespace-pre-wrap rounded-xl border border-slate-200/60 bg-slate-50/50 p-3 shadow-inner">
            {nodeData.value ? (
              <span className="font-mono text-[10px] leading-relaxed text-slate-800">{String(nodeData.value)}</span>
            ) : (
              <span className="text-[10px] italic text-slate-500">El prompt mejorado aparecerá aquí…</span>
            )}
          </div>
        </div>
      </div>

      <div className="handle-wrapper handle-right">
        <span className="handle-label">Result</span>
        <FoldderDataHandle type="source" position={Position.Right} id="prompt" dataType="prompt" />
      </div>
    </div>
  );
});


// --- GENERATOR NODES ---




export const GrokNode = memo(function GrokNode({ id, data, selected }: NodeProps) {
  const nodeData = data as BaseNodeData;
  const { setNodes } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState<string | null>(null);

  const onRun = async () => {
    const video = nodes.find(n => n.id === edges.find(e => e.target === id && e.targetHandle === 'video')?.source)?.data.value;
    const prompt = nodes.find(n => n.id === edges.find(e => e.target === id && e.targetHandle === 'prompt')?.source)?.data.value;
    if (!prompt) return alert("Need prompt!");

    setStatus('running');
    const ok = await runAiJobWithNotification({ nodeId: id, label: 'Grok Imagine' }, async () => {
      const res = await fetch('/api/grok/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptText: prompt,
          videoUrl: video,
          duration: nodeData.duration || 5,
          resolution: nodeData.resolution || '720p',
          aspect_ratio: nodeData.aspect_ratio || '16:9'
        })
      });
      const json = (await res.json().catch(() => ({}))) as { taskId?: string; error?: string };
      if (!res.ok) {
        throw new Error(
          typeof json.error === 'string' && json.error
            ? json.error
            : `Grok generate failed (${res.status})`,
        );
      }
      if (!json.taskId) throw new Error('No task from Grok');

      await new Promise<void>((resolve, reject) => {
        let polls = 0;
        const check = setInterval(async () => {
          polls += 1;
          if (polls > 400) {
            clearInterval(check);
            reject(new Error('Tiempo de espera agotado (Grok)'));
            return;
          }
          try {
            const sRes = await fetch(`/api/grok/status/${json.taskId}`);
            const sJson = (await sRes.json().catch(() => ({}))) as { status?: string; output?: string[]; error?: string };
            if (!sRes.ok) {
              clearInterval(check);
              reject(
                new Error(
                  typeof sJson.error === 'string' && sJson.error
                    ? sJson.error
                    : `Grok status failed (${sRes.status})`,
                ),
              );
              return;
            }
            const st = (sJson.status || '').toUpperCase();
            if (['SUCCEEDED', 'DONE'].includes(st)) {
              clearInterval(check);
              const videoUrl = sJson.output?.[0];
              setResult(videoUrl ?? null);
              if (videoUrl) {
                setNodes((nds) => nds.map((n) => {
                  if (n.id !== id) return n;
                  const versions = captureCurrentOutput(n.data, videoUrl, 'graph-run');
                  return { ...n, data: { ...n.data, value: videoUrl, type: 'video', _assetVersions: versions } };
                }));
              }
              resolve();
            } else if (['FAILED', 'EXPIRED'].includes(st) || st === 'ERROR') {
              clearInterval(check);
              reject(new Error(sJson.error || 'Grok failed'));
            }
          } catch (e) {
            clearInterval(check);
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        }, 3000);
      });
    });
    setStatus(ok ? 'success' : 'error');
  };

  useRegisterAssistantNodeRun(id, onRun);

  return (
    <div className={`custom-node processor-node ${status === 'running' ? 'node-glow-running' : ''}`} style={{ minWidth: 300 }}>
      <FoldderNodeResizer minWidth={300} minHeight={280} maxWidth={620} maxHeight={620} isVisible={selected} />
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Grok Imagine" />
      <div className="handle-wrapper handle-left" style={{ top: '30%' }}>
        <FoldderDataHandle type="target" position={Position.Left} id="video" dataType="video" />
        <span className="handle-label">Video in</span>
      </div>
      <div className="handle-wrapper handle-left" style={{ top: '70%' }}>
        <FoldderDataHandle type="target" position={Position.Left} id="prompt" dataType="prompt" />
        <span className="handle-label">Prompt in</span>
      </div>
      <div className="node-header">
        <NodeIcon
          type="grokProcessor"
          selected={selected}
          state={resolveFoldderNodeState({ error: status === 'error', loading: status === 'running', done: status === 'success' })}
          size={16}
        />
        <FoldderNodeHeaderTitle introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}>
          GROK IMAGINE
        </FoldderNodeHeaderTitle>
      </div>
      <div className="node-content">
        <div className="flex gap-2 mb-3">
          <select className="node-input text-[10px]" value={nodeData.resolution || '720p'} onChange={(e) => setNodes((nds) => nds.map((n) => n.id === id ? {...n, data: {...n.data, resolution: e.target.value}} : n))}>
            <option value="720p">720p</option>
            <option value="480p">480p</option>
          </select>
          <select className="node-input text-[10px]" value={nodeData.aspect_ratio || '16:9'} onChange={(e) => setNodes((nds) => nds.map((n) => n.id === id ? {...n, data: {...n.data, aspect_ratio: e.target.value}} : n))}>
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
          </select>
          <select className="node-input text-[10px]" value={nodeData.duration || 5} onChange={(e) => setNodes((nds) => nds.map((n) => n.id === id ? {...n, data: {...n.data, duration: Number(e.target.value)}} : n))}>
            <option value={5}>5s</option>
            <option value={10}>10s</option>
          </select>
        </div>
        <button className="execute-btn w-full justify-center" onClick={onRun}>{status === 'running' ? 'PROCESSING...' : 'GENERATE VIDEO'}</button>
        {result && <video src={result} className="mt-4 rounded-lg w-full" controls />}
      </div>
      <div className="handle-wrapper handle-right">
        <span className="handle-label">Video out</span>
        <FoldderDataHandle type="source" position={Position.Right} id="video" dataType="video" />
      </div>
    </div>
  );
});


// ── NANO BANANA NODE ─────────────────────────────────────────────────────────
const NB_MODELS = [
  { id: 'flash31', label: 'Flash 3.1', badge: 'SPEED+', color: 'text-cyan-400', borderColor: 'border-cyan-500/40', bg: 'bg-cyan-500/10' },
  { id: 'pro3',    label: 'Pro 3',     badge: 'PRO',     color: 'text-violet-400', borderColor: 'border-violet-500/40', bg: 'bg-violet-500/10' },
  { id: 'flash25', label: 'Flash 2.5', badge: 'FAST',    color: 'text-emerald-400', borderColor: 'border-emerald-500/40', bg: 'bg-emerald-500/10' },
] as const;

const REF_SLOTS = [
  { id: 'image',  label: 'Ref 1', top: '15%' },
  { id: 'image2', label: 'Ref 2', top: '32%' },
  { id: 'image3', label: 'Ref 3', top: '49%' },
  { id: 'image4', label: 'Ref 4', top: '66%' },
] as const;

/** Stable empty ref for `generationHistory` when absent (avoid new [] each render). */
const NANO_BANANA_EMPTY_GEN_HISTORY: string[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// NanoBanana STUDIO — fullscreen iterative image generation with paint masks
// ─────────────────────────────────────────────────────────────────────────────

// Palette of easily-distinguishable colors for NanoBanana area references
const CHANGE_PALETTE = [
  { name: 'azul',     hex: '#1D4ED8' },
  { name: 'rojo',     hex: '#DC2626' },
  { name: 'verde',    hex: '#16A34A' },
  { name: 'naranja',  hex: '#EA580C' },
  { name: 'amarillo', hex: '#CA8A04' },
  { name: 'violeta',  hex: '#7C3AED' },
  { name: 'marrón',   hex: '#92400E' },
  { name: 'blanco',   hex: '#F9FAFB' },
  { name: 'negro',    hex: '#111827' },
];

// Build a labeled reference grid from per-change reference images.
// Returns a data URL (JPEG) or null if no changes have reference images.
const buildReferenceGrid = (
  changes: Array<{ referenceImage: string | null; assignedColor: { name: string; hex: string }; description: string }>
): Promise<string | null> => {
  const withRefs = changes.filter(c => c.referenceImage);
  if (withRefs.length === 0) return Promise.resolve(null);

  const CELL_W = 400;
  const CELL_H = 320;
  const HEADER_H = 36;
  const COLS = Math.min(2, withRefs.length);
  const ROWS = Math.ceil(withRefs.length / COLS);

  const canvas = document.createElement('canvas');
  canvas.width = COLS * CELL_W;
  canvas.height = ROWS * CELL_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f4f4f5';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const loadImg = (src: string): Promise<HTMLImageElement> =>
    new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });

  return Promise.all(
    withRefs.map(async (c, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = col * CELL_W;
      const y = row * CELL_H;

      // Header bar in change color
      ctx.fillStyle = c.assignedColor.hex;
      ctx.fillRect(x, y, CELL_W, HEADER_H);

      // Color label
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(
        `● ${c.assignedColor.name.toUpperCase()} — ${c.description.slice(0, 38)}`,
        x + 10,
        y + HEADER_H / 2 + 5
      );

      // Image area (white bg)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y + HEADER_H, CELL_W, CELL_H - HEADER_H);

      if (c.referenceImage) {
        try {
          const img = await loadImg(c.referenceImage);
          const iw = img.width, ih = img.height;
          const scale = Math.min((CELL_W - 8) / iw, (CELL_H - HEADER_H - 8) / ih);
          const dw = iw * scale, dh = ih * scale;
          const dx = x + (CELL_W - dw) / 2;
          const dy = y + HEADER_H + (CELL_H - HEADER_H - dh) / 2;
          ctx.drawImage(img, dx, dy, dw, dh);
        } catch { /* skip if image fails */ }
      }

      // Cell border
      ctx.strokeStyle = '#e4e4e7';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, CELL_W - 1, CELL_H - 1);
    })
  ).then(() => canvas.toDataURL('image/png')); // PNG lossless — no quality degradation
};


/** Studio “Cámara”: solo cambios moderados que el modelo i2i suele respetar (sin órbitas extremas ni perfiles inventados). */
const NB_CAMERA_PROMPT_PREFIX =
  'Apply this as a global camera change to the full scene, not as a local object replacement.\n\n';

const CAMERA_PRESETS: { group: string; items: { label: string; prompt: string }[] }[] = [
  {
    group: 'Giro y distancia',
    items: [
      {
        label: 'Giro suave a la izquierda',
        prompt:
          NB_CAMERA_PROMPT_PREFIX +
          'Shift the viewpoint slightly by orbiting the camera about 15 degrees to the left around the main subject. Keep identity, set, and lighting; only adjust perspective moderately. Do not invent large unseen areas.',
      },
      {
        label: 'Giro suave a la derecha',
        prompt:
          NB_CAMERA_PROMPT_PREFIX +
          'Shift the viewpoint slightly by orbiting the camera about 15 degrees to the right around the main subject. Keep identity, set, and lighting; only adjust perspective moderately. Do not invent large unseen areas.',
      },
      {
        label: 'Acercar un poco',
        prompt:
          NB_CAMERA_PROMPT_PREFIX +
          'Move the camera slightly closer (moderate zoom in) so the main subject fills a bit more of the frame. Preserve the same scene, lighting, colors, and style.',
      },
      {
        label: 'Alejar un poco',
        prompt:
          NB_CAMERA_PROMPT_PREFIX +
          'Move the camera slightly farther (moderate zoom out) to show a bit more context around the subject. Preserve the same scene, lighting, colors, and style.',
      },
    ],
  },
  {
    group: 'Altura del encuadre',
    items: [
      {
        label: 'Altura de ojo',
        prompt:
          NB_CAMERA_PROMPT_PREFIX +
          'Use a natural eye-level camera height with a neutral, straight-on feel. Preserve the same scene content, lighting, colors, and style.',
      },
      {
        label: 'Ángulo bajo',
        prompt:
          NB_CAMERA_PROMPT_PREFIX +
          'Lower the camera toward a low angle, looking slightly upward at the subject. Keep the scene consistent; avoid inventing new background.',
      },
      {
        label: 'Ligeramente desde arriba',
        prompt:
          NB_CAMERA_PROMPT_PREFIX +
          'Raise the camera slightly so the view looks gently downward at the scene (mild high angle, not full overhead). Preserve the same scene content, lighting, colors, and style.',
      },
    ],
  },
  {
    group: 'Tipo de plano',
    items: [
      {
        label: 'Plano más amplio',
        prompt:
          NB_CAMERA_PROMPT_PREFIX +
          'Widen the framing to show more of the environment while keeping the main subject clearly visible. Preserve the same scene elements, lighting, colors, and style.',
      },
      {
        label: 'Plano medio',
        prompt:
          NB_CAMERA_PROMPT_PREFIX +
          'Use a medium shot framing the main subject from about waist up. Preserve identity, set, lighting, colors, and style.',
      },
      {
        label: 'Primer plano',
        prompt:
          NB_CAMERA_PROMPT_PREFIX +
          'Tighten to a close-up on the face or main focal point without extreme macro. Preserve lighting, colors, and overall style.',
      },
    ],
  },
  {
    group: 'Composición',
    items: [
      {
        label: 'Centrar el sujeto',
        prompt:
          NB_CAMERA_PROMPT_PREFIX +
          'Reframe so the main subject sits near the center of the frame. Preserve the same scene, lighting, colors, and style.',
      },
      {
        label: 'Regla de tercios',
        prompt:
          NB_CAMERA_PROMPT_PREFIX +
          'Reframe placing the main subject on a rule-of-thirds intersection. Preserve the same scene, lighting, colors, and style.',
      },
    ],
  },
];


interface NBChange {
  id: string;
  paintData: string | null;   // canvas PNG dataURL
  description: string;
  targetObject: string;       // what object is in this area (e.g. "mosquito gigante")
  color: string;              // brush UI color (user picks freely)
  assignedColor: { name: string; hex: string }; // auto-assigned from CHANGE_PALETTE
  referenceImage: string | null; // optional visual reference (data URL) for this change
  isGlobal?: boolean;         // if true: no paintData needed — applies to whole image
}

/** Output resolution for Nano Banana (Studio + nodo). Default 2k; invalid/missing → 2k */
function normalizeNanoBananaResolution(r: string | undefined): '1k' | '2k' | '4k' {
  if (r === '1k' || r === '2k' || r === '4k') return r;
  return '2k';
}

interface NanoBananaStudioProps {
  nodeId: string;
  initialImage: string | null;   // connected image (ref slot 0)
  lastGenerated: string | null;  // last generated image
  modelKey: string;
  aspectRatio: string;
  resolution: string;
  thinking: boolean;
  prompt: string;
  /**
   * Tras abrir el Studio al menos una vez en el nodo: no usar el prompt del grafo;
   * solo instrucciones / cámara / zonas configuradas dentro del Studio.
   */
  externalPromptIgnored?: boolean;
  /**
   * Con Brain conectado al nodo: compone tema de usuario + ADN visual Brain.
   * Si devuelve null, se mantiene el prompt tal cual (mismo comportamiento que sin Brain).
   */
  composeBrainImageGeneratorPrompt?: (
    userThemePrompt: string,
  ) => { prompt: string; diagnostics: BrainImageGeneratorPromptDiagnostics } | null;
  /** Última composición Brain aplicada en Studio (para «Ver por qué» en el nodo). */
  onBrainImageGeneratorDiagnostics?: (d: BrainImageGeneratorPromptDiagnostics | null) => void;
  /** Solo entrada desde PhotoRoom «Modificar imagen con IA»: botón superior = volver al PhotoRoom. */
  topBarCloseMode?: 'default' | 'returnPhotoRoom';
  onClose: () => void;
  onGenerated: (dataUrl: string, s3Key?: string) => void;
  onResolutionChange?: (resolution: '1k' | '2k' | '4k') => void;
  /** Historial de generaciones previas (estado en el nodo para no perderlo al cerrar Studio). */
  generationHistory: string[];
  onGenerationHistoryChange: React.Dispatch<React.SetStateAction<string[]>>;
  standardShell?: StandardStudioShellConfig;
}

// NanaBananaPaintCanvas: draws ONLY over the actual image pixels.
// bounds = { left, top, w, h } pixel coords within the container div.
// natW/natH = image natural dimensions (canvas resolution).
const NanaBananaPaintCanvas = memo(({
  natW, natH, bounds, color, brushSize, active, onSave,
}: {
  natW: number; natH: number;
  bounds: { left: number; top: number; w: number; h: number };
  color: string; brushSize: number;
  active: boolean; onSave: (data: string) => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  // Canvas resolution = natural image size so strokes map 1:1 to image pixels
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !natW || !natH) return;
    canvas.width = natW;
    canvas.height = natH;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, natW, natH);
  }, [natW, natH]);

  const getXY = useCallback((e: PointerEvent, canvas: HTMLCanvasElement) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (natW / r.width),
      y: (e.clientY - r.top)  * (natH / r.height),
    };
  }, [natH, natW]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return;
    const ctx = canvas.getContext('2d')!;

    const onDown = (e: PointerEvent) => {
      drawing.current = true;
      ctx.beginPath();
      const {x,y} = getXY(e, canvas);
      ctx.moveTo(x,y);
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drawing.current) return;
      const {x,y} = getXY(e, canvas);
      ctx.lineTo(x,y);
      ctx.strokeStyle = color;
      // Scale lineWidth from display px to natural px
      ctx.lineWidth = brushSize * (natW / (bounds.w || natW));
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.85;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x,y);
    };
    const onUp = () => {
      if (!drawing.current) return;
      drawing.current = false;
      onSave(canvas.toDataURL('image/png'));
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
    };
  }, [active, color, brushSize, natW, natH, bounds.w, getXY, onSave]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        left: bounds.left,
        top:  bounds.top,
        width:  bounds.w,
        height: bounds.h,
        cursor: active ? 'crosshair' : 'default',
        pointerEvents: active ? 'all' : 'none',
        zIndex: 10,
      }}
    />
  );
});
NanaBananaPaintCanvas.displayName = 'NanaBananaPaintCanvas';

// Helper: convert hex color to [r, g, b]
const hexToRgb = (hex: string): [number, number, number] => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
};

/**
 * REF 2 lleva trazos de color como guía; el modelo de imagen a veces los copia en la salida.
 * Este bloque lo prohíbe explícitamente (Studio + máscaras).
 */
function nanoBananaPromptExcludeZoneGuideArtifacts(prompt: string): string {
  const block =
    '\n\n[SALIDA — obligatorio] Los colores, trazos y formas dibujadas en la imagen de referencia de zonas (REF 2 / mapa) son solo guías de posición. La imagen generada NO debe mostrar esas líneas, círculos de contorno, marcas de anotación ni superposición de la guía. Integra los cambios en la escena de forma natural y fotorrealista, sin artefactos de dibujo de referencia.';
  return prompt.trim() + block;
}

function mergeNanoBananaStudioPromptWithBrain(
  compose: NonNullable<NanoBananaStudioProps["composeBrainImageGeneratorPrompt"]> | undefined,
  onDiag: NanoBananaStudioProps["onBrainImageGeneratorDiagnostics"] | undefined,
  userTheme: string,
  body: string,
  sectionTitle: string,
): string {
  if (!compose) return body;
  const pack = compose(userTheme.trim() || "Generación en Nano Banana Studio.");
  if (!pack) {
    onDiag?.(null);
    return body;
  }
  onDiag?.(pack.diagnostics);
  return `${pack.prompt}\n\n--- ${sectionTitle} ---\n${body}`.trim();
}

const NanoBananaStudio = memo(({
  nodeId, initialImage, lastGenerated, modelKey, aspectRatio, resolution,
  thinking, prompt, externalPromptIgnored,
  composeBrainImageGeneratorPrompt: composeBrainImageGeneratorPromptProp,
  onBrainImageGeneratorDiagnostics,
  topBarCloseMode = 'default', onClose, onGenerated, onResolutionChange,
  generationHistory, onGenerationHistoryChange,
  standardShell,
}: NanoBananaStudioProps) => {
  // ── Generation state ────────────────────────────────────────────────────
  const [genStatus, setGenStatus] = useState<'idle'|'running'|'success'|'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [generatedOnce, setGeneratedOnce] = useState(!!lastGenerated);
  const [reSendGenerated, setReSendGenerated] = useState(!!lastGenerated); // default ON only if already has generated image

  // currentImage: the one to DISPLAY in studio (affected by reSendGenerated toggle)
  const displayedImage = reSendGenerated ? (lastGenerated || initialImage) : initialImage;
  const [currentImage, setCurrentImage] = useState<string|null>(displayedImage);

  // ── Studio-local model/resolution overrides ──────────────────────────────
  const [studioModelKey, setStudioModelKey] = useState(modelKey);
  const normalizedRes = normalizeNanoBananaResolution(resolution);
  const [studioResolution, setStudioResolution] = useState(normalizedRes);
  useEffect(() => {
    setStudioResolution(normalizeNanoBananaResolution(resolution));
  }, [resolution]);

  // ── Change layers ────────────────────────────────────────────────────────
  const [changes, setChanges] = useState<NBChange[]>([]);
  const [showGlobalInput, setShowGlobalInput] = useState(false);
  const [globalDesc, setGlobalDesc] = useState('');
  const [showCameraMenu, setShowCameraMenu] = useState(false);
  // Prompt cache: only re-call analyze-areas when edits change (incl. refs visuales por zona)
  const [cachedPromptData, setCachedPromptData] = useState<{
    changesKey: string;
    preview: { colorMapUrl: string; fullPrompt: string };
    /** Misma REF2 que devolvió analyze-areas (base+trazos); evitar perderla en hit de caché */
    markedRef2: string | null;
  } | null>(null);
  const [analyzingCall, setAnalyzingCall] = useState(false);
  const [callPreview, setCallPreview] = useState<{ colorMapUrl: string; fullPrompt: string; markedRef2?: string | null; referenceGridUrl?: string | null } | null>(null);
  const [activeChangeId, setActiveChangeId] = useState<string|null>(null);
  const [addingChange, setAddingChange] = useState(false);
  const [newDesc, setNewDesc] = useState('');
  const [newTargetObject, setNewTargetObject] = useState('');
  const [brushColor, setBrushColor] = useState('#ff3366');
  const [brushSize, setBrushSize] = useState(12);
  const pendingPaintRef = useRef<string|null>(null);
  /** Copia síncrona de `currentImage` para archivar la salida anterior al generar (evita cierres obsoletos). */
  const currentImageRef = useRef<string | null>(null);

  const [galleryOpen, setGalleryOpen] = useState(true);
  /** Se incrementa tras generar con éxito para forzar desmontaje de capas de pintura (franjas) sobre la imagen. */
  const [studioVisualEpoch, setStudioVisualEpoch] = useState(0);

  /** Solo con zona pintada + descripción tiene sentido analyze-areas («Ver llamada»). Sin eso → Generar = imagen + prompt directo. */
  const hasPaintedZoneWithDescription = useMemo(
    () => changes.some((c) => !c.isGlobal && !!c.paintData && !!c.description.trim()),
    [changes],
  );

  /** Evita re-firmar en bucle tras actualizar URLs; se invalida al cambiar el conjunto de claves S3 del historial. */
  const lastHistoryKeysSigRef = useRef<string | null>(null);

  /**
   * Las URLs prefirmadas caducan (~1 h). Al salir y volver a entrar en Studio sin recargar el proyecto,
   * el historial seguía apuntando a URLs muertas → miniaturas rotas. Renueva contra /api/spaces/s3-presign.
   */
  useLayoutEffect(() => {
    const list = generationHistory;
    if (!Array.isArray(list) || list.length === 0) return;

    const keysList = list.map((u) => (typeof u === 'string' ? tryExtractKnowledgeFilesKeyFromUrl(u) : null));
    if (!keysList.some(Boolean)) return;

    const sig = keysList.map((k) => k || '').join('\u0001');
    if (sig === lastHistoryKeysSigRef.current) return;

    let cancelled = false;
    void (async () => {
      const keys = new Set<string>();
      for (const k of keysList) {
        if (k) keys.add(k);
      }
      try {
        const res = await fetch('/api/spaces/s3-presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys: [...keys] }),
        });
        if (!res.ok || cancelled) return;
        const payload = (await res.json()) as { urls?: Record<string, string> };
        const urls = payload.urls;
        if (!urls || cancelled) return;
        const next = list.map((item) => {
          if (typeof item !== 'string') return item;
          const kk = tryExtractKnowledgeFilesKeyFromUrl(item);
          if (kk && urls[kk]) return urls[kk];
          return item;
        });
        const changed = next.some((u, i) => u !== list[i]);
        if (!cancelled) {
          if (changed) onGenerationHistoryChange(next);
          lastHistoryKeysSigRef.current = sig;
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [generationHistory, onGenerationHistoryChange]);

  currentImageRef.current = currentImage;

  // ── Pan / Zoom viewer (ref-based, no re-render = smooth) ──────────────────
  const vZoom  = useRef(1);
  const vPan   = useRef({ x: 0, y: 0 });
  const vIsDragging = useRef(false);
  const vDragStart  = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const zoomWrapRef = useRef<HTMLDivElement>(null);
  const zoomLabelRef = useRef<HTMLButtonElement>(null);
  const applyViewTransform = () => {
    if (!zoomWrapRef.current) return;
    zoomWrapRef.current.style.transform =
      `translate(${vPan.current.x}px,${vPan.current.y}px) scale(${vZoom.current})`;
    if (zoomLabelRef.current) {
      const pct = Math.round(vZoom.current * 100);
      zoomLabelRef.current.style.display = vZoom.current === 1 ? 'none' : 'flex';
      zoomLabelRef.current.textContent = `✕ ${pct}% · doble clic`;
    }
  };
  const resetViewTransform = () => {
    vZoom.current = 1; vPan.current = { x: 0, y: 0 }; applyViewTransform();
  };

  // ── Canvas size ─────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  /** Pinch/trackpad zoom must not change browser zoom; only this viewer (same pattern as FreehandStudio). */
  usePreventBrowserPinchZoom(containerRef);
  const imgRef = useRef<HTMLImageElement>(null);
  // Natural image dimensions (resolution for the color map canvas)
  const [imgNat, setImgNat] = useState({ w: 1280, h: 720 });
  // Where the image actually renders inside the container (object-contain bounds)
  const [imgBounds, setImgBounds] = useState({ left: 0, top: 0, w: 1280, h: 720 });

  const recalcBounds = useCallback(() => {
    const img = imgRef.current;
    const cont = containerRef.current;
    if (!img || !cont || !img.naturalWidth) return;
    const natW = img.naturalWidth;
    const natH = img.naturalHeight;
    const cW   = cont.clientWidth;
    const cH   = cont.clientHeight;
    const scale = Math.min(cW / natW, cH / natH);
    const rW    = natW * scale;
    const rH    = natH * scale;
    setImgNat({ w: natW, h: natH });
    setImgBounds({ left: (cW - rW) / 2, top: (cH - rH) / 2, w: rW, h: rH });
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(recalcBounds);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [recalcBounds]);

  // Update displayed image when toggle changes — BUT only before any generation has happened.
  // After generation, the toggle controls the BASE image for next gen, not the viewer display.
  useEffect(() => {
    if (generatedOnce) return; // don't override after user has generated something
    if (reSendGenerated) {
      setCurrentImage(lastGenerated || initialImage);
    } else {
      setCurrentImage(initialImage);
    }
  }, [reSendGenerated, lastGenerated, initialImage, generatedOnce]);

  const isPro = studioModelKey === 'pro3';
  const isFlash25 = studioModelKey === 'flash25';

  // Block left sidebar hover while studio is fullscreen
  useEffect(() => {
    document.body.classList.add('nb-studio-open');
    return () => document.body.classList.remove('nb-studio-open');
  }, []);

  // ── Changes ───────────────────────────────────────────────────────────────
  const startAddChange = () => {
    if (addingChange) return;
    const id = `chg_${Date.now()}`;
    setChanges(prev => {
      const assigned = CHANGE_PALETTE[prev.length % CHANGE_PALETTE.length];
      return [...prev, { id, paintData: null, description: '', targetObject: '', color: brushColor, assignedColor: assigned, referenceImage: null }];
    });
    setActiveChangeId(id);
    setAddingChange(true);
    setNewDesc('');
    pendingPaintRef.current = null;
  };

  const confirmChange = () => {
    if (!activeChangeId) return;
    setCachedPromptData(null); // invalidate cache when change is updated
    setChanges(prev => prev.map(c => c.id === activeChangeId
      ? { ...c, paintData: pendingPaintRef.current, description: newDesc, targetObject: newTargetObject }
      : c
    ));
    setActiveChangeId(null);
    setAddingChange(false);
    setNewDesc('');
  };

  const cancelChange = () => {
    setChanges(prev => prev.filter(c => c.id !== activeChangeId));
    setActiveChangeId(null);
    setAddingChange(false);
    setNewDesc('');
    setNewTargetObject('');
  };

  const addGlobalChange = (desc: string) => {
    if (!desc.trim()) return;
    const idx = changes.length;
    const assigned = CHANGE_PALETTE[idx % CHANGE_PALETTE.length];
    const newChange: NBChange = {
      id: `glb_${Date.now()}`,
      paintData: null,
      description: desc.trim(),
      targetObject: 'global',
      color: assigned.hex,
      assignedColor: assigned,
      referenceImage: null,
      isGlobal: true,
    };
    setChanges(prev => [...prev, newChange]);
    setGlobalDesc('');
    setShowGlobalInput(false);
    setShowCameraMenu(false);
  };

  const deleteChange = (id: string) => {
    setCachedPromptData(null); // invalidate cache
    setChanges(prev => prev.filter(c => c.id !== id));
    if (activeChangeId === id) { setActiveChangeId(null); setAddingChange(false); }
  };

  const handlePaintSave = useCallback((data: string) => {
    pendingPaintRef.current = data;
  }, []);

  /** Limpia chips de cambios, caché de llamada, inputs global/cámara y trazos tras una gen. Studio completa. */
  const clearStudioEditsAfterSuccessfulGenerate = useCallback(() => {
    setStudioVisualEpoch((e) => e + 1);
    setChanges([]);
    setCachedPromptData(null);
    setCallPreview(null);
    setShowGlobalInput(false);
    setGlobalDesc('');
    setShowCameraMenu(false);
    setActiveChangeId(null);
    setAddingChange(false);
    pendingPaintRef.current = null;
  }, []);

  /**
   * Misma lógica que «Ver llamada»: mapa de color, analyze-areas, refs y grid.
   * `notifyAreasJob`: si true, envuelve el análisis en runAiJobWithNotification (botón Ver llamada).
   */
  const buildStudioCallPreviewPayload = useCallback(
    async (opts: { notifyAreasJob: boolean }): Promise<{
      colorMapUrl: string;
      fullPrompt: string;
      markedRef2: string | null;
      referenceGridUrl: string | null;
      changesKey: string;
    } | null> => {
      const validChanges = changes.filter((c) =>
        c.isGlobal ? c.description.trim() : c.paintData && c.description.trim(),
      );
      if (validChanges.length === 0) return null;

      const W = imgNat.w || 1280;
      const H = imgNat.h || 720;
      const offscreen = document.createElement('canvas');
      offscreen.width = W;
      offscreen.height = H;
      const ctx = offscreen.getContext('2d')!;

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, W, H);

      for (const change of changes) {
        if (!change.paintData) continue;
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            const tmp = document.createElement('canvas');
            tmp.width = W;
            tmp.height = H;
            const tc = tmp.getContext('2d')!;
            tc.drawImage(img, 0, 0, W, H);
            const id = tc.getImageData(0, 0, W, H);
            const hex = change.assignedColor.hex.replace('#', '');
            const cr = parseInt(hex.slice(0, 2), 16);
            const cg = parseInt(hex.slice(2, 4), 16);
            const cb = parseInt(hex.slice(4, 6), 16);
            for (let i = 0; i < id.data.length; i += 4) {
              if (id.data[i + 3] > 30) {
                id.data[i] = cr;
                id.data[i + 1] = cg;
                id.data[i + 2] = cb;
                id.data[i + 3] = 255;
              }
            }
            tc.putImageData(id, 0, 0);
            ctx.drawImage(tmp, 0, 0);
            resolve();
          };
          img.src = change.paintData!;
        });
      }

      const colorMapUrl = offscreen.toDataURL('image/png');

      const changesKey = JSON.stringify(
        validChanges.map((c) => ({
          id: c.id,
          desc: c.description,
          color: c.assignedColor.name,
          hasPaint: !!c.paintData,
          isGlobal: !!c.isGlobal,
          /** Sin esto, al añadir/quitar 📎 ref visual se reutilizaba el prompt sin REF 3 */
          refSig: c.referenceImage ? String(c.referenceImage.length) : '0',
        })),
      );

      if (cachedPromptData && cachedPromptData.changesKey === changesKey) {
        const referenceGridUrl = await buildReferenceGrid(validChanges);
        return {
          colorMapUrl,
          fullPrompt: cachedPromptData.preview.fullPrompt,
          markedRef2: cachedPromptData.markedRef2,
          referenceGridUrl,
          changesKey,
        };
      }

      let fullPrompt = '';
      let markedRef2DataUrl: string | null = null;

      type PosEntry = {
        cx: number;
        cy: number;
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        areaPct: number;
        quadrant: string;
      };
      let positionData: Record<string, PosEntry> = {};

      const runAnalyzeBlock = async () => {
        const vc = changes.filter((c) =>
          c.isGlobal ? c.description.trim() : c.paintData && c.description.trim(),
        );

        let markedBaseUrl = colorMapUrl;
        const domImg = imgRef.current;
        if (domImg && domImg.complete && domImg.naturalWidth > 0) {
          try {
            const marked = document.createElement('canvas');
            marked.width = W;
            marked.height = H;
            const mc = marked.getContext('2d')!;
            mc.drawImage(domImg, 0, 0, W, H);
            for (const change of vc) {
              if (!change.paintData) continue;
              await new Promise<void>((r2) => {
                const strokeImg = new Image();
                strokeImg.onload = () => {
                  const tmp = document.createElement('canvas');
                  tmp.width = W;
                  tmp.height = H;
                  const tc = tmp.getContext('2d')!;
                  tc.drawImage(strokeImg, 0, 0, W, H);
                  const id = tc.getImageData(0, 0, W, H);
                  const [r3, g3, b3] = hexToRgb(change.assignedColor.hex);
                  for (let i = 0; i < id.data.length; i += 4) {
                    if (id.data[i + 3] > 30) {
                      id.data[i] = r3;
                      id.data[i + 1] = g3;
                      id.data[i + 2] = b3;
                      id.data[i + 3] = Math.min(220, id.data[i + 3] * 3);
                    }
                  }
                  tc.putImageData(id, 0, 0);
                  mc.drawImage(tmp, 0, 0);
                  r2();
                };
                strokeImg.src = change.paintData!;
              });
            }
            markedBaseUrl = marked.toDataURL('image/png');
          } catch (e) {
            console.warn('[marked-base] Canvas draw failed, using color map fallback:', e);
          }
        }

        positionData = {};
        for (const change of vc) {
          if (!change.paintData) continue;
          await new Promise<void>((resolve) => {
            const tmp2 = document.createElement('canvas');
            tmp2.width = W;
            tmp2.height = H;
            const tc2 = tmp2.getContext('2d')!;
            const img2 = new Image();
            img2.onload = () => {
              tc2.drawImage(img2, 0, 0, W, H);
              const pd2 = tc2.getImageData(0, 0, W, H);
              let mx = W,
                my = H,
                Mx = 0,
                My = 0,
                found2 = false;
              let paintedPixels = 0;
              for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                  if (pd2.data[(y * W + x) * 4 + 3] > 30) {
                    if (x < mx) mx = x;
                    if (y < my) my = y;
                    if (x > Mx) Mx = x;
                    if (y > My) My = y;
                    found2 = true;
                    paintedPixels++;
                  }
                }
              }
              if (found2) {
                const cx = Math.round(((mx + Mx) / 2 / W) * 100);
                const cy = Math.round(((my + My) / 2 / H) * 100);
                const x1 = Math.round((mx / W) * 100);
                const y1 = Math.round((my / H) * 100);
                const x2 = Math.round((Mx / W) * 100);
                const y2 = Math.round((My / H) * 100);
                const areaPct = Math.round((paintedPixels / (W * H)) * 100 * 10) / 10;

                const row = cy < 33 ? 'superior' : cy > 66 ? 'inferior' : 'central';
                const col = cx < 33 ? 'izquierdo' : cx > 66 ? 'derecho' : 'central';
                const quadrant =
                  row === 'central' && col === 'central'
                    ? 'centro de la imagen'
                    : row === col
                      ? `tercio ${row}`
                      : `tercio ${row}-${col}`;

                positionData[change.assignedColor.name] = { cx, cy, x1, y1, x2, y2, areaPct, quadrant };
              }
              resolve();
            };
            img2.src = change.paintData!;
          });
        }

        const hasPaintedZones = vc.some((c) => !c.isGlobal && c.paintData);
        const aiRes = await fetch('/api/gemini/analyze-areas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baseImage: currentImage,
            colorMapImage: hasPaintedZones ? markedBaseUrl : null,
            changes: vc.map((c) => {
              const pd = positionData[c.assignedColor.name];
              return {
                color: c.assignedColor.name,
                description: c.description.trim(),
                posX: pd?.cx ?? null,
                posY: pd?.cy ?? null,
                bboxX1: pd?.x1 ?? null,
                bboxY1: pd?.y1 ?? null,
                bboxX2: pd?.x2 ?? null,
                bboxY2: pd?.y2 ?? null,
                areaPct: pd?.areaPct ?? null,
                quadrant: pd?.quadrant ?? null,
                paintData: c.paintData ?? null,
                assignedColorHex: c.assignedColor.hex,
                referenceImageData: c.referenceImage ?? null,
                isGlobal: !!c.isGlobal,
              };
            }),
          }),
        });
        const aiJson = await aiRes.json();
        if (aiRes.ok && aiJson.prompt) {
          fullPrompt = aiJson.prompt;
          if (aiJson.markedImageData) {
            const mime =
              typeof aiJson.markedImageMime === 'string' && aiJson.markedImageMime
                ? aiJson.markedImageMime
                : 'image/png';
            markedRef2DataUrl = `data:${mime};base64,${aiJson.markedImageData}`;
          }
        } else {
          throw new Error(aiJson.error || 'No prompt returned');
        }
      };

      const wrapAnalyze = async () => {
        setAnalyzingCall(true);
        try {
          try {
            await runAnalyzeBlock();
          } catch (e: unknown) {
            console.warn('[analyze-areas] AI call failed, using fallback:', e instanceof Error ? e.message : String(e));
            const validChangesFb = changes.filter((c) => c.description.trim());
            fullPrompt = [
              'REFERENCIA 1: imagen base. Mantén todo lo que no se indica cambiar, conservando composición donde aplique.',
              'REFERENCIA 2: zonas marcadas en color (trazos reales) — respetar la posición, forma y extensión de cada trazo.',
              '',
              ...validChangesFb
                .filter((c) => !c.isGlobal)
                .map((c) => {
                  const pd = positionData[c.assignedColor.name];
                  const spatial = pd
                    ? ` (${pd.quadrant}; centroide ${pd.cx}% izq. ${pd.cy}% arriba; bbox ${pd.x1}%-${pd.x2}% horiz., ${pd.y1}%-${pd.y2}% vert.; ~${pd.areaPct}% de la imagen)`
                    : '';
                  return `En la zona del trazo ${c.assignedColor.name} en REF 2${spatial}: ${c.description}`;
                }),
              ...validChangesFb.filter((c) => c.isGlobal).map((c) => `CAMBIO GLOBAL: ${c.description}`),
            ].join('\n');
          }
        } finally {
          setAnalyzingCall(false);
        }
      };

      if (opts.notifyAreasJob) {
        const ok = await runAiJobWithNotification({ nodeId, label: 'Nano Banana · Áreas' }, wrapAnalyze);
        if (!ok) return null;
      } else {
        await wrapAnalyze();
      }

      const referenceGridUrl = await buildReferenceGrid(validChanges);
      setCachedPromptData({
        changesKey,
        preview: { colorMapUrl, fullPrompt },
        markedRef2: markedRef2DataUrl,
      });
      return {
        colorMapUrl,
        fullPrompt,
        markedRef2: markedRef2DataUrl,
        referenceGridUrl,
        changesKey,
      };
    },
    [changes, imgNat, cachedPromptData, currentImage, imgRef, nodeId],
  );

  // ── Generate ──────────────────────────────────────────────────────────────
  const onGenerate = async () => {
    /** Con al menos una zona dibujada: analyze-areas + refs (como Ver llamada) y luego generar. Sin zona dibujada: imagen + prompt directo a Nano Banana. */
    if (hasPaintedZoneWithDescription) {
      setGenStatus('running');
      setProgress(0);
      aiHudNanoBananaJobStart(nodeId);

      let genFinishedOk = false;
      try {
        const ok = await runAiJobWithNotification({ nodeId, label: 'Nano Banana Studio' }, async () => {
          const payload = await buildStudioCallPreviewPayload({ notifyAreasJob: false });
          if (!payload) {
            throw new Error('No se pudo preparar la llamada de imagen.');
          }
          const ref2 = payload.markedRef2 || payload.colorMapUrl;
          const refImages = [
            ...(currentImage ? [currentImage] : []),
            ref2,
            ...(payload.referenceGridUrl ? [payload.referenceGridUrl] : []),
          ];
          const graphPromptForBrain = externalPromptIgnored ? "" : String(prompt ?? "");
          const zoneBody = payload.fullPrompt;
          const mergedZone = mergeNanoBananaStudioPromptWithBrain(
            composeBrainImageGeneratorPromptProp,
            onBrainImageGeneratorDiagnostics,
            graphPromptForBrain.trim() || "Edición guiada por zonas sobre la imagen.",
            zoneBody,
            "DETALLE POR ZONAS Y MAPA (prioridad local de máscaras; estética global según bloque Brain anterior)",
          );
          const json = await geminiGenerateWithServerProgress(
            {
              prompt: nanoBananaPromptExcludeZoneGuideArtifacts(mergedZone),
              images: refImages,
              aspect_ratio: aspectRatio,
              resolution: isFlash25 ? '1k' : studioResolution,
              model: studioModelKey,
              thinking: thinking && isPro,
            },
            (pct) => {
              setProgress(pct);
              aiHudNanoBananaJobProgress(nodeId, pct);
            },
          );
          const out = json.output;
          const prev = currentImageRef.current;
          onGenerationHistoryChange((h) => {
            const next = [...h];
            if (prev && prev !== out && !next.includes(prev)) next.push(prev);
            if (!next.includes(out)) next.push(out);
            return next;
          });
          currentImageRef.current = out;
          setCurrentImage(out);
          setGeneratedOnce(true);
          setReSendGenerated(true);
          onGenerated(out, typeof json.key === 'string' ? json.key : undefined);
          genFinishedOk = true;
        });
        if (!ok) setGenStatus('error');
      } catch (e: unknown) {
        console.error('[NanoBananaStudio] onGenerate (studio pipeline):', e);
        setGenStatus('error');
      } finally {
        if (genFinishedOk) {
          flushSync(() => {
            clearStudioEditsAfterSuccessfulGenerate();
            setProgress(100);
            setGenStatus('success');
            aiHudNanoBananaJobProgress(nodeId, 100);
          });
        }
        aiHudNanoBananaJobEnd(nodeId);
        setTimeout(() => setProgress(0), 1000);
      }
      return;
    }

    const graphPrompt = externalPromptIgnored ? '' : String(prompt ?? '');
    if (!externalPromptIgnored && !graphPrompt.trim()) {
      return alert('No hay prompt conectado.');
    }
    const imageToSend = generatedOnce && reSendGenerated && currentImage ? currentImage : initialImage;

    const changeDescriptions = changes.map((c) => c.description).filter(Boolean).join('. ');
    let fullPrompt: string;
    if (changeDescriptions) {
      fullPrompt = graphPrompt
        ? `${graphPrompt}. INSTRUCCIONES DE CAMBIO: ${changeDescriptions}`
        : `INSTRUCCIONES DE CAMBIO: ${changeDescriptions}`;
    } else {
      fullPrompt = graphPrompt;
    }
    if (!fullPrompt.trim()) {
      return alert(
        externalPromptIgnored
          ? 'En Studio (modo avanzado) añade instrucciones: cambios globales, zonas, cámara o previsualización.'
          : 'No hay prompt conectado.',
      );
    }

    let promptForModel = fullPrompt;
    if (composeBrainImageGeneratorPromptProp) {
      const pack = composeBrainImageGeneratorPromptProp(fullPrompt.trim());
      if (pack) {
        promptForModel = pack.prompt;
        onBrainImageGeneratorDiagnostics?.(pack.diagnostics);
      } else {
        onBrainImageGeneratorDiagnostics?.(null);
      }
    }

    setGenStatus('running');
    setProgress(0);
    aiHudNanoBananaJobStart(nodeId);

    const maskImages = changes.map((c) => c.paintData).filter(Boolean) as string[];
    const refImages = [...(imageToSend ? [imageToSend] : []), ...maskImages];

    let genFinishedOkLegacy = false;
    try {
      const ok = await runAiJobWithNotification({ nodeId, label: 'Nano Banana Studio' }, async () => {
        const json = await geminiGenerateWithServerProgress(
          {
            prompt:
              maskImages.length > 0
                ? nanoBananaPromptExcludeZoneGuideArtifacts(promptForModel)
                : promptForModel,
            images: refImages,
            aspect_ratio: aspectRatio,
            resolution: isFlash25 ? '1k' : studioResolution,
            model: studioModelKey,
            thinking: thinking && isPro,
          },
          (pct) => {
            setProgress(pct);
            aiHudNanoBananaJobProgress(nodeId, pct);
          },
        );
        const out = json.output;
        const prev = currentImageRef.current;
        onGenerationHistoryChange((h) => {
          const next = [...h];
          if (prev && prev !== out && !next.includes(prev)) next.push(prev);
          if (!next.includes(out)) next.push(out);
          return next;
        });
        currentImageRef.current = out;
        setCurrentImage(out);
        setGeneratedOnce(true);
        setReSendGenerated(true);
        onGenerated(out, typeof json.key === 'string' ? json.key : undefined);
        genFinishedOkLegacy = true;
      });
      if (!ok) setGenStatus('error');
    } catch (e: unknown) {
      console.error('[NanoBananaStudio] onGenerate:', e);
      setGenStatus('error');
    } finally {
      if (genFinishedOkLegacy) {
        flushSync(() => {
          clearStudioEditsAfterSuccessfulGenerate();
          setProgress(100);
          setGenStatus('success');
          aiHudNanoBananaJobProgress(nodeId, 100);
        });
      }
      aiHudNanoBananaJobEnd(nodeId);
      setTimeout(() => setProgress(0), 1000);
    }
  };

  // ── Generate Call: vista previa modal (misma preparación que Generar con zonas) ──
  const onGenerateCall = async () => {
    if (!hasPaintedZoneWithDescription) {
      alert(
        'Añade al menos una zona dibujada con descripción para ver la llamada con mapa de zonas. Si solo usas instrucciones globales o el prompt del grafo, pulsa Generar: se envía la imagen y el texto directamente a Nano Banana.',
      );
      return;
    }
    const payload = await buildStudioCallPreviewPayload({ notifyAreasJob: true });
    if (!payload) return;
    setCallPreview({
      colorMapUrl: payload.colorMapUrl,
      fullPrompt: payload.fullPrompt,
      markedRef2: payload.markedRef2,
      referenceGridUrl: payload.referenceGridUrl,
    });
  };

  const onGenerateFromCall = async (
    colorMapUrl: string,
    customPrompt: string,
    markedRef2?: string | null,
    referenceGridUrl?: string | null,
  ) => {
    setCallPreview(null);
    setGenStatus('running');
    setProgress(0);
    aiHudNanoBananaJobStart(nodeId);

    const ref2 = markedRef2 || colorMapUrl;
    const refImages = [
      ...(currentImage ? [currentImage] : []),
      ref2,
      ...(referenceGridUrl ? [referenceGridUrl] : []),
    ];

    const graphPromptForCall = externalPromptIgnored ? "" : String(prompt ?? "");
    const mergedCall = mergeNanoBananaStudioPromptWithBrain(
      composeBrainImageGeneratorPromptProp,
      onBrainImageGeneratorDiagnostics,
      graphPromptForCall.trim() || "Generación desde vista previa de zonas.",
      customPrompt,
      "DETALLE POR ZONAS Y MAPA",
    );

    let genFinishedOk = false;
    try {
      const ok = await runAiJobWithNotification({ nodeId, label: 'Nano Banana Studio' }, async () => {
        const json = await geminiGenerateWithServerProgress(
          {
            prompt: nanoBananaPromptExcludeZoneGuideArtifacts(mergedCall),
            images: refImages,
            aspect_ratio: aspectRatio,
            resolution: isFlash25 ? '1k' : studioResolution,
            model: studioModelKey,
            thinking: thinking && isPro,
          },
          (pct) => {
            setProgress(pct);
            aiHudNanoBananaJobProgress(nodeId, pct);
          },
        );
        const out = json.output;
        const prev = currentImageRef.current;
        onGenerationHistoryChange((h) => {
          const next = [...h];
          if (prev && prev !== out && !next.includes(prev)) next.push(prev);
          if (!next.includes(out)) next.push(out);
          return next;
        });
        currentImageRef.current = out;
        setCurrentImage(out);
        setGeneratedOnce(true);
        setReSendGenerated(true);
        onGenerated(out, typeof json.key === 'string' ? json.key : undefined);
        genFinishedOk = true;
      });
      if (!ok) setGenStatus('error');
    } catch (e: unknown) {
      console.error('[NanoBananaStudio] onGenerateFromCall:', e);
      setGenStatus('error');
    } finally {
      if (genFinishedOk) {
        flushSync(() => {
          clearStudioEditsAfterSuccessfulGenerate();
          setProgress(100);
          setGenStatus('success');
          aiHudNanoBananaJobProgress(nodeId, 100);
        });
      }
      aiHudNanoBananaJobEnd(nodeId);
      setTimeout(() => setProgress(0), 1000);
    }
  };

    return createPortal(
    <div
      className="nb-studio-root fixed inset-0 flex flex-col"
      data-foldder-studio-canvas=""
    >
      {standardShell ? <StandardStudioShellHeader shell={standardShell} /> : null}

      {/* ══ TOP BAR: Header + Model + Resolution + Usar generada ══════════════ */}
      <div
        className="nb-studio-topbar flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 flex-shrink-0"
      >

        {/* Logo / title */}
        <div className="flex items-center gap-2 pr-4 shrink-0" style={{ borderRight: '1px solid rgba(255,255,255,0.12)' }}>
          <Sparkles size={14} className="text-[#a78bfa] shrink-0" aria-hidden />
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-zinc-100">Studio</span>
            <span className="nb-studio-brand-sub text-[9px] font-semibold text-zinc-400 font-mono tracking-tight">Nano Banana</span>
          </div>
        </div>

        {/* Model pills — active ring = Foldder violet; dot keeps model hue */}
        <div className="flex items-center gap-2" role="group" aria-label="Modelo de imagen">
          {[
            { key: 'flash25',  label: 'NB 1',  sub: 'Rápido',   color: '#34d399' },
            { key: 'flash31',  label: 'NB 2',  sub: 'Calidad',  color: '#38bdf8' },
            { key: 'pro3',     label: 'Pro',   sub: 'Máximo',   color: '#fbbf24' },
          ].map(m => (
            <button
              key={m.key}
              type="button"
              onClick={() => setStudioModelKey(m.key)}
              className="flex flex-col items-start gap-0.5 px-3 py-1.5 rounded-xl text-left transition-all min-w-[4.5rem]"
              style={
                studioModelKey === m.key
                  ? {
                      background: 'rgba(108,92,231,0.16)',
                      color: '#ede9fe',
                      border: '2px solid #6C5CE7',
                      boxShadow: '0 0 0 1px rgba(108,92,231,0.35)',
                    }
                  : {
                      background: 'rgba(39,39,48,0.9)',
                      color: '#d4d4d8',
                      border: '1px solid rgba(113,113,122,0.45)',
                    }
              }
            >
              <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide leading-none">
                <span className="w-1.5 h-1.5 rounded-full shrink-0 ring-1 ring-white/15" style={{ background: m.color }} />
                {m.label}
              </span>
              <span
                className="nb-studio-model-sub text-[9px] font-semibold normal-case tracking-normal leading-none"
                style={{ color: studioModelKey === m.key ? '#c4b5fd' : '#a1a1aa' }}
              >
                {m.sub}
              </span>
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-zinc-600/60 shrink-0" aria-hidden />

        {/* Resolution chips — only non-flash25 */}
        {studioModelKey !== 'flash25' && (
          <div className="flex items-center gap-1.5" role="group" aria-label="Resolución de salida">
            <span className="text-[9px] font-black text-zinc-400 uppercase tracking-wider mr-0.5">Res</span>
            {(['1k', '2k', '4k'] as const).map(r => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setStudioResolution(r);
                  onResolutionChange?.(r);
                }}
                className="min-w-[2rem] px-2 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all"
                style={
                  studioResolution === r
                    ? {
                        background: 'rgba(108,92,231,0.22)',
                        color: '#ede9fe',
                        border: '2px solid rgba(108,92,231,0.65)',
                      }
                    : {
                        background: 'rgba(39,39,48,0.9)',
                        color: '#d4d4d8',
                        border: '1px solid rgba(113,113,122,0.45)',
                      }
                }
              >
                {r}
              </button>
            ))}
          </div>
        )}
        {studioModelKey === 'flash25' && (
          <span
            className="max-w-[11rem] shrink-0 text-[8px] font-semibold leading-tight text-amber-200/85"
            title="NB 1 (rápido) solo genera en 1K. Para 2K/4K usa NB 2 o Pro. Varios pasos img→img pueden suavizar detalle."
          >
            1K fijo · img→img puede perder nitidez
          </span>
        )}

        {/* Divider */}
        {generatedOnce && <div className="h-6 w-px bg-zinc-600/60 shrink-0" aria-hidden />}

        {/* Usar generada toggle */}
        {generatedOnce && (
          <div className="flex items-center gap-2 rounded-lg px-2 py-1 bg-zinc-800/60 border border-zinc-600/40">
            {lastGenerated && (
              <img src={lastGenerated} alt="" className="w-8 h-6 object-cover rounded border border-zinc-500/50 flex-shrink-0" />
            )}
            <span className="text-[9px] font-bold text-zinc-300 uppercase tracking-wide">
              {reSendGenerated ? 'Base: última gen.' : 'Base: original'}
            </span>
            <button
              type="button"
              onClick={() => setReSendGenerated(v => !v)}
              className="w-9 h-5 rounded-full flex items-center px-0.5 transition-all shrink-0"
              style={{ background: reSendGenerated ? '#6C5CE7' : 'rgba(63,63,70,0.95)', justifyContent: reSendGenerated ? 'flex-end' : 'flex-start' }}
              title={reSendGenerated ? 'Usar imagen conectada como base' : 'Usar última generación como base'}
            >
              <div className="w-3.5 h-3.5 rounded-full shadow-sm" style={{ background: reSendGenerated ? '#0a0a0f' : '#e4e4e7' }} />
            </button>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1 min-w-[1rem]" />

        {/* Generate buttons in top bar */}
        <button
          type="button"
          onClick={onGenerateCall}
          disabled={addingChange || analyzingCall || !hasPaintedZoneWithDescription}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all disabled:opacity-35 disabled:cursor-not-allowed shadow-sm border"
          style={{
            background: 'rgba(108,92,231,0.2)',
            color: '#ede9fe',
            borderColor: 'rgba(108,92,231,0.45)',
          }}
        >
          {analyzingCall ? <><Loader2 size={11} className="animate-spin shrink-0" /> Analizando…</> : <><Eye size={11} className="shrink-0" /> Ver llamada</>}
        </button>
        <button
          type="button"
          onClick={onGenerate}
          disabled={genStatus === 'running' || addingChange || analyzingCall}
          className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all disabled:opacity-45 disabled:cursor-not-allowed shadow-[0_2px_14px_rgba(108,92,231,0.4)] border border-[#6C5CE7]/50"
          style={{ background: 'linear-gradient(135deg,#6C5CE7,#5548c8)', color: '#fafafa' }}
        >
          {genStatus === 'running'
            ? <><Loader2 size={12} className="animate-spin shrink-0" /> Generando…</>
            : <><Sparkles size={12} className="shrink-0" /> Generar</>
          }
        </button>

        {/* Close — desde PhotoRoom: volver al nodo PhotoRoom; resto: X */}
        {topBarCloseMode === 'returnPhotoRoom' ? (
          <button
            type="button"
            onClick={onClose}
            className="ml-1 flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[#6C5CE7]/40 bg-[#6C5CE7]/15 px-3 text-[10px] font-black uppercase tracking-wide text-violet-100 transition-all hover:border-[#6C5CE7]/55 hover:bg-[#6C5CE7]/25"
            title="Cerrar Nano Banana Studio y volver al PhotoRoom"
          >
            <ChevronLeft size={14} className="shrink-0" strokeWidth={2.5} />
            Volver a PhotoRoom
          </button>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-transparent text-zinc-400 transition-all hover:border-[#6C5CE7]/35 hover:bg-white/[0.08] hover:text-zinc-100"
            title="Cerrar Studio"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* ══ Galería (historial) + lienzo ═════════════════════════════════════════ */}
      <div className="flex min-h-0 w-full flex-1 flex-row">
        <div
          className="flex shrink-0 flex-col overflow-hidden border-r border-white/[0.08] bg-[#08080c]/98 transition-[width] duration-200 ease-out"
          style={{ width: galleryOpen ? 200 : 44 }}
        >
          <button
            type="button"
            onClick={() => setGalleryOpen((o) => !o)}
            className="flex items-center justify-center gap-1 border-b border-white/[0.08] px-2 py-2.5 text-[9px] font-black uppercase tracking-wider text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
            title={galleryOpen ? 'Ocultar historial' : 'Mostrar historial de generaciones'}
          >
            <ChevronRight size={14} className={`shrink-0 transition-transform ${galleryOpen ? 'rotate-180' : ''}`} aria-hidden />
            {galleryOpen && <span className="truncate">Historial</span>}
          </button>
          {galleryOpen && (
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden p-2">
              {generationHistory.length === 0 ? (
                <p className="px-1 text-[9px] leading-snug text-zinc-600">
                  Cada generación añade la imagen anterior y la nueva al historial. La última miniatura coincide con la vista actual. Pulsa cualquiera para recuperarla.
                </p>
              ) : (
                generationHistory.map((url, i) => (
                  <button
                    key={`hist-${i}-${url.slice(0, 48)}`}
                    type="button"
                    onClick={() => {
                      setCurrentImage(url);
                      currentImageRef.current = url;
                      setGeneratedOnce(true);
                      setReSendGenerated(true);
                      /** Salida del nodo + preview del canvas: misma URL que la vista. */
                      onGenerated(url);
                    }}
                    className="relative aspect-square w-full shrink-0 overflow-hidden rounded-lg border border-white/10 transition-colors hover:border-violet-500/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60"
                    title={`Generación ${i + 1}`}
                  >
                    <img src={url} alt="" className="h-full w-full object-cover" />
                    <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 text-[8px] font-bold text-zinc-200">
                      {i + 1}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

      {/* ══ CANVAS (flex-1) ════════════════════════════════════════════════════ */}
      <div
          ref={containerRef}
          className="relative min-w-0 flex-1 touch-none overflow-hidden"
          style={{ background: '#0a0a0f', cursor: addingChange ? 'crosshair' : 'grab' }}
          onWheel={e => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.03 : 1 / 1.03;
            const rect = containerRef.current!.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const nz = Math.min(Math.max(vZoom.current * factor, 0.25), 10);
            const scale = nz / vZoom.current;
            vPan.current = { x: mx - scale * (mx - vPan.current.x), y: my - scale * (my - vPan.current.y) };
            vZoom.current = nz;
            applyViewTransform();
          }}
          onPointerDown={e => {
            if (e.button === 0 && !addingChange) {
              e.preventDefault();
              vIsDragging.current = true;
              vDragStart.current = { mx: e.clientX, my: e.clientY, px: vPan.current.x, py: vPan.current.y };
              containerRef.current?.setPointerCapture(e.pointerId);
              if (containerRef.current) containerRef.current.style.cursor = 'grabbing';
            }
          }}
          onPointerMove={e => {
            if (!vIsDragging.current) return;
            vPan.current = { x: vDragStart.current.px + e.clientX - vDragStart.current.mx, y: vDragStart.current.py + e.clientY - vDragStart.current.my };
            applyViewTransform();
          }}
          onPointerUp={() => {
            vIsDragging.current = false;
            if (containerRef.current) containerRef.current.style.cursor = addingChange ? 'crosshair' : 'grab';
          }}
          onDoubleClick={() => resetViewTransform()}
        >
        {/* Zoom/pan inner wrapper */}
        <div ref={zoomWrapRef} style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transform: 'translate(0px,0px) scale(1)',
          transformOrigin: '0 0', willChange: 'transform'
        }}>
        {/* Image */}
        {currentImage ? (
          <img
            ref={imgRef}
            src={currentImage}
            alt="Generated"
            onLoad={recalcBounds}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <ImageIcon size={56} className="text-zinc-500" strokeWidth={1.25} />
            <div>
              <p className="text-zinc-300 text-sm font-bold">Conecta una imagen en Ref 1 del nodo</p>
              <p className="text-zinc-500 text-xs mt-1">Luego podrás pintar zonas y generar desde arriba.</p>
            </div>
          </div>
        )}

        {/* Paint overlay */}
        {addingChange && activeChangeId && (
          <NanaBananaPaintCanvas
            key={`nb-paint-${studioVisualEpoch}-${activeChangeId}`}
            natW={imgNat.w}
            natH={imgNat.h}
            bounds={imgBounds}
            color={brushColor}
            brushSize={brushSize}
            active={true}
            onSave={handlePaintSave}
          />
        )}

        {/* Completed change overlays */}
        {changes.filter(c => c.id !== activeChangeId && c.paintData).map(c => (
          <img key={`${c.id}-${studioVisualEpoch}`} src={c.paintData!} alt=""
            style={{
              position: 'absolute',
              left: imgBounds.left, top: imgBounds.top,
              width: imgBounds.w, height: imgBounds.h,
              objectFit: 'fill',
              pointerEvents: 'none',
              opacity: 0.6,
            }}
          />
        ))}
        </div>{/* end zoom-transform */}

        {/* Progress bar — oculta al 100% aunque genStatus tarde un tick (misma lógica que el nodo) */}
        {genStatus === 'running' && progress < 100 && (
          <div className="absolute bottom-0 left-0 right-0">
            <div className="w-full h-1 bg-black/50">
              <div className="h-full bg-gradient-to-r from-[#6C5CE7] to-[#a78bfa] transition-all duration-500"
                   style={{ width: `${progress}%` }} />
            </div>
            <p className="text-[9px] text-violet-300 font-black text-center py-1 bg-black/70 animate-pulse uppercase tracking-widest">
              {isPro && thinking ? `Thinking… ${Math.round(progress)}%` : `Generating… ${Math.round(progress)}%`}
            </p>
          </div>
        )}

        {/* Drawing-mode hint */}
        {addingChange && (
          <div
            className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-rose-50 shadow-lg"
            style={{
              background: 'rgba(12,10,14,0.92)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(251,113,133,0.5)',
            }}
          >
            <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse shadow-[0_0_10px_rgba(251,113,133,0.8)]" />
            Dibuja el área · Arrastra para mover la vista
          </div>
        )}

        {/* Zoom reset label */}
        <button
          ref={zoomLabelRef}
          onClick={() => resetViewTransform()}
          style={{ display: 'none', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.08)' }}
        />
      </div>
      </div>{/* end gallery + canvas row */}

      {/* ══ BOTTOM BAR: Changes ════════════════════════════════════════════════ */}
      <div
        className="nb-studio-bottombar flex-shrink-0"
      >

        {/* Active drawing controls */}
        {addingChange && activeChangeId && (
          <div
            className="flex items-center gap-4 px-4 py-3.5"
            style={{ background: 'rgba(251,113,133,0.08)', borderBottom: '1px solid rgba(251,113,133,0.25)' }}
          >
            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-rose-300 flex-shrink-0">
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse shadow-[0_0_8px_rgba(251,113,133,0.6)]" />
              Dibujando área
            </span>
            {/* Color */}
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold text-zinc-400">Color</span>
              <input type="color" value={brushColor} onChange={e => setBrushColor(e.target.value)}
                className="w-8 h-8 rounded-lg border border-white/10 cursor-pointer" />
            </div>
            {/* Brush size */}
            <div className="flex items-center gap-2 flex-1 max-w-[200px]">
              <span className="text-[9px] font-bold text-zinc-400 flex-shrink-0">Grosor {brushSize}px</span>
              <input type="range" min={4} max={48} value={brushSize} onChange={e => setBrushSize(+e.target.value)}
                className="flex-1" />
            </div>
            {/* Description */}
            <input
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="¿Qué quieres cambiar en esta área?…"
              className="flex-1 bg-zinc-950/80 border border-zinc-600/50 rounded-lg px-3 py-2 text-[11px] text-zinc-100 placeholder-zinc-500 outline-none focus:border-rose-400/70 focus:ring-1 focus:ring-rose-500/30"
            />
            <button onClick={confirmChange}
              className="px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap"
              style={{ background: 'rgba(251,113,133,0.2)', color: '#fb7185', border: '1px solid rgba(251,113,133,0.4)' }}>
              ✓ Confirmar
            </button>
            <button onClick={cancelChange}
              className="px-4 py-2 rounded-lg bg-white/[0.04] text-zinc-500 border border-white/[0.08] text-[10px] font-black uppercase tracking-wider hover:text-zinc-300 transition-colors whitespace-nowrap">
              Cancelar
            </button>
          </div>
        )}

        {/* Changes list row — chips in scrollable section, buttons outside scroll */}
        <div className="nb-studio-changes-row flex items-center gap-0 px-4 py-4" style={{ minHeight: 72 }}>
          {/* Label */}
          <div
            className="flex flex-col gap-0.5 flex-shrink-0 pr-3 mr-2"
            style={{ borderRight: '1px solid rgba(255,255,255,0.12)' }}
          >
            <span className="text-[10px] font-black text-zinc-200 uppercase tracking-[0.12em]">Cambios</span>
            <span className="text-[8px] font-medium text-zinc-500 normal-case tracking-normal max-w-[11rem] leading-tight">
              En REF 2: 1.º azul · 2.º rojo · 3.º verde… (orden de creación)
            </span>
          </div>

          {/* Scrollable chips — overflow isolated here */}
          <div className="flex items-center gap-3 flex-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {changes.length === 0 && (
              <div className="flex flex-col gap-1 flex-shrink-0 py-0.5">
                <span className="text-[10px] font-semibold text-zinc-300">Ningún cambio todavía</span>
                <span className="text-[9px] text-zinc-500 leading-snug max-w-md">
                  Usa <span className="text-rose-300 font-semibold">Zona</span> para pintar qué editar, o{' '}
                  <span className="text-violet-300 font-semibold">Global</span> /{' '}
                  <span className="text-violet-200 font-semibold">Cámara</span> para el resto.
                </span>
              </div>
            )}

            {/* Change chips — larger and with ref upload */}
            {changes.map((ch) => {
              const hex = ch.assignedColor.hex;
              return (
                <div key={ch.id}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl flex-shrink-0 transition-all"
                  style={ch.isGlobal || (ch.paintData && ch.description.trim())
                    ? { background: hex + '22', color: '#f4f4f5', border: '1px solid ' + hex + '66' }
                    : { background: 'rgba(39,39,48,0.85)', color: '#a1a1aa', border: '1px solid rgba(113,113,122,0.4)' }
                  }
                >
                  {/* Color dot — mismo color que REF 2 / API (assignedColor), no el índice en lista */}
                  {ch.isGlobal
                    ? <Globe size={11} className="flex-shrink-0" style={{ color: hex }} />
                    : <span className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-white/20" style={{ background: hex }} title={ch.assignedColor.name} />
                  }

                  {/* Description */}
                  <span className="text-[10px] font-bold uppercase tracking-wide max-w-[160px] truncate">
                    {ch.description || 'Sin descripción'}
                  </span>

                  {/* Reference image preview or upload — only for painted changes */}
                  {!ch.isGlobal && (
                    <label className="flex items-center gap-1 cursor-pointer flex-shrink-0">
                      {ch.referenceImage ? (
                        <img src={ch.referenceImage} alt="ref"
                          className="w-8 h-8 rounded-lg object-cover border-2 flex-shrink-0"
                          style={{ borderColor: hex + '80' }} />
                      ) : (
                        <span className="flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-wide transition-all hover:opacity-80"
                          style={{ background: hex + '15', color: hex, border: '1px dashed ' + hex + '50' }}>
                          <ImageIcon size={10} /> Ref
                        </span>
                      )}
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = ev => {
                            const url = ev.target?.result as string;
                            setCachedPromptData(null);
                            setChanges(prev => prev.map(c => c.id === ch.id ? { ...c, referenceImage: url } : c));
                          };
                          reader.readAsDataURL(file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => deleteChange(ch.id)}
                    className="text-zinc-500 hover:text-rose-400 transition-colors flex-shrink-0 ml-1 p-0.5 rounded hover:bg-white/5"
                    title="Quitar cambio"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              );
            })}
          </div>{/* end scrollable chips */}

          {/* ── Action buttons — OUTSIDE overflow-x-auto so dropdowns aren't clipped ── */}
          <div className="flex items-center gap-2 flex-shrink-0 pl-3" style={{ borderLeft: '1px solid rgba(255,255,255,0.12)' }}>

            {/* Global change inline input */}
            {showGlobalInput && (
              <div className="flex items-center gap-2" style={{ minWidth: 340 }}>
                <Globe size={12} className="text-violet-400 flex-shrink-0" aria-hidden />
                <input
                  autoFocus
                  value={globalDesc}
                  onChange={e => setGlobalDesc(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addGlobalChange(globalDesc); if (e.key === 'Escape') { setShowGlobalInput(false); setGlobalDesc(''); } }}
                  placeholder="Describe el cambio global…"
                  className="flex-1 bg-zinc-950/80 border border-violet-500/45 rounded-xl px-3 py-2.5 text-[11px] text-zinc-100 placeholder-zinc-500 outline-none focus:border-violet-400/80 focus:ring-1 focus:ring-violet-500/25"
                />
                <button onClick={() => addGlobalChange(globalDesc)}
                  className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap"
                  style={{ background: 'rgba(108,92,231,0.22)', color: '#ddd6fe', border: '1px solid rgba(108,92,231,0.45)' }}>
                  ✓
                </button>
                <button onClick={() => { setShowGlobalInput(false); setGlobalDesc(''); }}
                  className="px-2 py-2 rounded-lg bg-white/[0.04] text-zinc-500 border border-white/[0.06] text-[10px] font-black hover:text-zinc-300 transition-colors">
                  ✕
                </button>
              </div>
            )}

            {!addingChange && !showGlobalInput && (<>
              {/* Pintar área */}
              <button
                type="button"
                onClick={startAddChange}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex-shrink-0 whitespace-nowrap shadow-sm hover:brightness-110"
                style={{
                  background: 'linear-gradient(180deg, rgba(251,113,133,0.22) 0%, rgba(251,113,133,0.1) 100%)',
                  color: '#fecdd3',
                  border: '1px solid rgba(251,113,133,0.45)',
                }}
                title="Pinta sobre la imagen qué parte quieres cambiar"
              >
                <Plus size={12} strokeWidth={2.5} /> Zona
              </button>

              {/* Global */}
              <button
                type="button"
                onClick={() => setShowGlobalInput(true)}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex-shrink-0 whitespace-nowrap shadow-sm hover:brightness-110"
                style={{
                  background: 'linear-gradient(180deg, rgba(108,92,231,0.24) 0%, rgba(108,92,231,0.1) 100%)',
                  color: '#ede9fe',
                  border: '1px solid rgba(108,92,231,0.45)',
                }}
                title="Instrucción que afecta a toda la imagen"
              >
                <Globe size={12} strokeWidth={2.5} /> Global
              </button>

              {/* Camera — dropdown goes UPWARD, no overflow clipping because parent has no overflow-x-auto */}
              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCameraMenu(v => !v)}
                  className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap shadow-sm hover:brightness-110"
                  style={{
                    background: 'linear-gradient(180deg, rgba(108,92,231,0.18) 0%, rgba(108,92,231,0.08) 100%)',
                    color: '#e8e4ff',
                    border: '1px solid rgba(108,92,231,0.4)',
                  }}
                  title="Solo ajustes suaves de encuadre (recomendado para esta API)"
                >
                  <Camera size={12} strokeWidth={2.5} /> Cámara ▾
                </button>
                {showCameraMenu && (
                  <div
                    className="absolute bottom-full mb-2 right-0 z-[9999] rounded-xl overflow-hidden shadow-2xl"
                    style={{
                      background: 'rgba(22,22,30,0.96)',
                      backdropFilter: 'blur(16px)',
                      border: '1px solid rgba(108,92,231,0.35)',
                      minWidth: 220,
                      maxHeight: 360,
                      overflowY: 'auto',
                    }}
                  >
                    <div
                      className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-violet-300 sticky top-0"
                      style={{ background: 'rgba(22,22,30,0.98)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
                    >
                      Encuadre posible
                    </div>
                    <p className="px-3 py-2 text-[8px] text-zinc-500 leading-snug border-b border-white/[0.06]">
                      Evita giros extremos o vistas que no existan en la imagen base.
                    </p>
                    {CAMERA_PRESETS.map(group => (
                      <div key={group.group}>
                        <div
                          className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-400"
                          style={{ background: 'rgba(0,0,0,0.25)', borderTop: '1px solid rgba(255,255,255,0.06)' }}
                        >
                          {group.group}
                        </div>
                        {group.items.map(preset => (
                          <button
                            key={`${group.group}-${preset.label}`}
                            type="button"
                            onClick={() => { addGlobalChange(preset.prompt); setShowCameraMenu(false); }}
                            className="w-full text-left px-4 py-2.5 text-[10px] font-medium text-zinc-200 hover:bg-[#6C5CE7]/25 hover:text-white transition-colors border-b border-white/[0.04] last:border-0"
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>)}

          </div>{/* end action buttons */}
        </div>{/* end bottom bar row */}
      </div>{/* end canvas+bottom flex column */}

      {/* ── Call Preview Modal ─────────────────────────────────────────── */}
      {callPreview && (
        <div
          className="fixed inset-0 z-[10060] flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.88)' }}
          data-foldder-studio-canvas=""
        >
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl flex flex-col"
               style={{ background: '#1a1a22', border: '1px solid rgba(255,255,255,0.12)' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.1] bg-white/[0.04] backdrop-blur-md">
              <div className="flex flex-col gap-0.5">
                <span className="text-[12px] font-black uppercase tracking-[0.1em] text-violet-200">Vista previa de la llamada</span>
                <span className="text-[10px] text-zinc-500 font-medium normal-case tracking-normal">Revisa refs y el texto que se enviará a Nano Banana</span>
              </div>
              <button type="button" onClick={() => setCallPreview(null)} className="text-zinc-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10" title="Cerrar">
                <X size={20} />
              </button>
            </div>

            {/* ── 3-image panels ── */}
            <div className="p-6 grid grid-cols-3 gap-4 border-b border-white/[0.06]">
              {/* REF 1 — Base image */}
              <div className="space-y-2">
                <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Ref 1 · Imagen base</p>
                {currentImage ? (
                  <img src={currentImage} alt="Base" className="w-full rounded-xl border border-white/10 object-contain max-h-40" />
                ) : (
                  <div className="w-full h-32 rounded-xl border border-white/10 flex items-center justify-center text-[9px] text-zinc-600">Sin imagen base</div>
                )}
              </div>

              {/* REF 2 — Marked image (base + strokes, fallback to color map) */}
              <div className="space-y-2">
                <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Ref 2 · Mapa de zonas</p>
                <img
                  src={callPreview.markedRef2 || callPreview.colorMapUrl}
                  alt="Color map"
                  className="w-full rounded-xl border border-white/10 object-contain max-h-40"
                />
                <div className="flex flex-wrap gap-1">
                  {changes.filter(c=>c.paintData).map(c => (
                    <div key={c.id} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[7px] font-black uppercase"
                         style={{ background: c.assignedColor.hex + '22', color: c.assignedColor.hex }}>
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: c.assignedColor.hex }} />
                      {c.assignedColor.name}
                    </div>
                  ))}
                </div>
              </div>

              {/* REF 3 — Reference grid */}
              <div className="space-y-2">
                <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Ref 3 · Grid de referencias</p>
                {callPreview.referenceGridUrl ? (
                  <img
                    src={callPreview.referenceGridUrl}
                    alt="Reference grid"
                    className="w-full rounded-xl border border-violet-500/20 object-contain max-h-40"
                  />
                ) : (
                  <div className="w-full h-32 rounded-xl border border-dashed border-white/10 flex flex-col items-center justify-center gap-2 text-center px-3">
                    <ImageIcon size={20} className="text-zinc-700" />
                    <p className="text-[8px] text-zinc-600 leading-snug">Sin imágenes de referencia.<br/>Súbelas en cada cambio con el ícono 📎.</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Prompt (full width) ── */}
            <div className="p-6 space-y-3">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Prompt completo (editable)</p>
              <textarea
                value={callPreview.fullPrompt}
                onChange={e => setCallPreview(prev => prev ? { ...prev, fullPrompt: e.target.value } : null)}
                rows={8}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-[10px] text-zinc-300 font-mono leading-relaxed resize-none"
              />
              <p className="text-[8px] text-zinc-600 leading-snug">
                ref1 = base · ref2 = dónde editar (prioridad sobre texto si choca izq./der.) · ref3 = estilos de referencia
              </p>
            </div>
            {/* Send button */}
            <div className="px-6 py-4 border-t border-white/[0.07] flex justify-end gap-3">
              <button onClick={() => setCallPreview(null)}
                className="px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider text-zinc-500 border border-white/[0.08] hover:text-zinc-300 transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => onGenerateFromCall(callPreview.colorMapUrl, callPreview.fullPrompt, callPreview.markedRef2, callPreview.referenceGridUrl)}
                disabled={genStatus === 'running'}
                className="px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 transition-all disabled:opacity-40 shadow-[0_2px_12px_rgba(108,92,231,0.35)]"
                style={{ background: 'linear-gradient(135deg,#6C5CE7,#5548c8)', color: '#fafafa' }}
              >
                <Sparkles size={13} /> Generar imagen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
});
NanoBananaStudio.displayName = 'NanoBananaStudio';


export const NanoBananaNode = memo(function NanoBananaNode({ id, data, selected }: NodeProps) {
  const nodeData = data as BaseNodeData & {
    aspect_ratio?: string;
    resolution?: string;
    modelKey?: string;
    thinking?: boolean;
    /** Persisted with the project (Studio + main-run versions). */
    generationHistory?: string[];
  };
  const nodes = useNodes();
  const edges = useEdges();
  const { setNodes, setEdges, fitView, getNodes, getEdges } = useReactFlow();
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [showFullSize, setShowFullSize] = useState(false);
  const [showStudio, setShowStudio] = useState(false);
  const [standardShell, setStandardShell] = useState<StandardStudioShellConfig | null>(null);
  const currentNode = nodes.find((node) => node.id === id);
  const currentFrameNode = useCurrentNodeFrameSnapshot(currentNode);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  /** Al abrir Studio desde PhotoRoom «Modificar imagen con IA»: id del nodo PhotoRoom para fitView + reabrir su Studio. */
  const photoRoomReturnTargetRef = useRef<string | null>(null);
  const [nanoStudioTopBarCloseMode, setNanoStudioTopBarCloseMode] = useState<'default' | 'returnPhotoRoom'>('default');

  const updateNodeInternals = useUpdateNodeInternals();
  const brainCanvasCtx = useProjectBrainCanvas();
  const brainTelemetry = useBrainNodeTelemetry({ canvasNodeId: id, nodeType: "IMAGE_GENERATOR" });
  const [brainImageDiag, setBrainImageDiag] = useState<BrainImageGeneratorPromptDiagnostics | null>(null);
  const [showBrainWhy, setShowBrainWhy] = useState(false);
  const brainDiagRef = useRef<BrainImageGeneratorPromptDiagnostics | null>(null);
  const setBrainImageDiagSync = useCallback((d: BrainImageGeneratorPromptDiagnostics | null) => {
    brainDiagRef.current = d;
    setBrainImageDiag(d);
  }, []);

  const brainConnected = useMemo(
    () =>
      edges.some((e: { target: string; targetHandle?: string | null; source: string }) => {
        if (e.target !== id || e.targetHandle !== "brain") return false;
        const src = nodes.find((n: Node) => n.id === e.source);
        return src?.type === "projectBrain";
      }),
    [edges, id, nodes],
  );

  const composeBrainForStudio = useMemo(() => {
    if (!brainConnected || !brainCanvasCtx?.assetsMetadata) return undefined;
    return (userThemePrompt: string): { prompt: string; diagnostics: BrainImageGeneratorPromptDiagnostics } | null => {
      try {
        const assets = normalizeProjectAssets(brainCanvasCtx.assetsMetadata);
        return composeBrainImageGeneratorPromptWithRuntime({ assets, userThemePrompt, targetNodeId: id });
      } catch {
        return null;
      }
    };
  }, [brainConnected, brainCanvasCtx?.assetsMetadata, id]);

  const refreshNanoHandleGeometry = useCallback(() => {
    const run = () => updateNodeInternals(id);
    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
    window.setTimeout(run, 140);
  }, [id, updateNodeInternals]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => refreshNanoHandleGeometry());
    const t = window.setTimeout(() => refreshNanoHandleGeometry(), 180);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [refreshNanoHandleGeometry, brainConnected]);

  useEffect(() => {
    const onWired = (ev: Event) => {
      const nid = (ev as CustomEvent<{ nodeId?: string }>).detail?.nodeId;
      if (nid !== id) return;
      brainTelemetry.track({
        kind: "CONTENT_EXPORTED",
        artifactType: "image",
        exportFormat: "output_edge",
        custom: { surface: "downstream_wired" },
      });
    };
    window.addEventListener("foldder-nano-banana-output-wired", onWired as EventListener);
    return () => {
      window.removeEventListener("foldder-nano-banana-output-wired", onWired as EventListener);
    };
  }, [id, brainTelemetry]);

  const openNanoStudioNormal = useCallback(() => {
    photoRoomReturnTargetRef.current = null;
    setNanoStudioTopBarCloseMode('default');
    setStandardShell(null);
    setShowStudio(true);
  }, []);

  const closeNanoStudio = useCallback(() => {
    const prFlowId = photoRoomReturnTargetRef.current;
    photoRoomReturnTargetRef.current = null;
    setNanoStudioTopBarCloseMode('default');
    setStandardShell(null);
    setShowStudio(false);

    const graphNodes = getNodes() as Node[];
    const graphEdges = getEdges();
    const self = graphNodes.find((n) => n.id === id);
    const parentId = self?.parentId;
    if (parentId) {
      const parent = graphNodes.find((n) => n.id === parentId && n.type === 'canvasGroup');
      const lab = String((parent?.data as { label?: string })?.label ?? '').trim();
      const isPrBundle = /^imagen_\d+_PR$/i.test(lab);
      const alreadyCollapsed = !!(parent?.data as { collapsed?: boolean })?.collapsed;
      if (parent && isPrBundle && !alreadyCollapsed) {
        const collapsed = applyCanvasGroupCollapse(parentId, graphNodes, graphEdges);
        if (collapsed) {
          setNodes(collapsed.nodes);
          setEdges(collapsed.edges);
        }
      }
    }

    if (prFlowId) {
      requestAnimationFrame(() => {
        void fitView({
          nodes: [{ id: prFlowId }],
          padding: 0.45,
          duration: 560,
          interpolate: 'smooth',
          ...FOLDDER_FIT_VIEW_EASE,
        });
        window.dispatchEvent(
          new CustomEvent('foldder-open-photo-room-studio', { detail: { photoRoomNodeId: prFlowId } }),
        );
      });
    }
  }, [fitView, getNodes, getEdges, setNodes, setEdges, id]);

  useEffect(() => {
    const onOpenFromPhotoRoom = (ev: Event) => {
      const e = ev as CustomEvent<{ nanoNodeId: string; photoRoomNodeId: string }>;
      if (e.detail?.nanoNodeId !== id) return;
      photoRoomReturnTargetRef.current = e.detail.photoRoomNodeId;
      setNanoStudioTopBarCloseMode('returnPhotoRoom');
      setStandardShell(null);
      setShowStudio(true);
    };
    window.addEventListener('foldder-open-nano-studio-from-photo-room', onOpenFromPhotoRoom as EventListener);
    return () =>
      window.removeEventListener('foldder-open-nano-studio-from-photo-room', onOpenFromPhotoRoom as EventListener);
  }, [id]);

  useEffect(() => {
    const onOpenStudio = (ev: Event) => {
      const detail = (ev as CustomEvent<FoldderStudioEventDetail>).detail;
      if (detail?.nodeId !== id) return;
      photoRoomReturnTargetRef.current = null;
      setNanoStudioTopBarCloseMode('default');
      setStandardShell(detail.standardShell ? { ...detail.standardShell, nodeId: id, nodeType: 'nanoBanana', fileId: detail.fileId, appId: detail.appId } : null);
      setShowStudio(true);
    };
    const onCloseStudio = (ev: Event) => {
      const detail = (ev as CustomEvent<FoldderStudioEventDetail>).detail;
      if (detail?.nodeId !== id) return;
      closeNanoStudio();
    };
    window.addEventListener('foldder:open-studio', onOpenStudio as EventListener);
    window.addEventListener('foldder-open-node-studio', onOpenStudio as EventListener);
    window.addEventListener('foldder:close-studio', onCloseStudio as EventListener);
    window.addEventListener('foldder-close-node-studio', onCloseStudio as EventListener);
    return () => {
      window.removeEventListener('foldder:open-studio', onOpenStudio as EventListener);
      window.removeEventListener('foldder-open-node-studio', onOpenStudio as EventListener);
      window.removeEventListener('foldder:close-studio', onCloseStudio as EventListener);
      window.removeEventListener('foldder-close-node-studio', onCloseStudio as EventListener);
    };
  }, [closeNanoStudio, id]);

  /** Creación reciente desde PhotoRoom: consume registro síncrono al montar (antes que `useEffect` del listener). */
  useLayoutEffect(() => {
    const pending = takePendingNanoStudioOpenFromPhotoRoom(id);
    if (!pending) return;
    photoRoomReturnTargetRef.current = pending.photoRoomNodeId;
    setNanoStudioTopBarCloseMode('returnPhotoRoom');
    setStandardShell(null);
    setShowStudio(true);
  }, [id]);

  const persistedGenerationHistory = Array.isArray(nodeData.generationHistory)
    ? nodeData.generationHistory
    : NANO_BANANA_EMPTY_GEN_HISTORY;

  const onGenerationHistoryChange = useCallback(
    (action: React.SetStateAction<string[]>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = Array.isArray(n.data.generationHistory) ? n.data.generationHistory : [];
          const next = typeof action === "function" ? (action as (p: string[]) => string[])(prev) : action;
          return { ...n, data: { ...n.data, generationHistory: next } };
        })
      );
    },
    [id, setNodes]
  );

  /**
   * Rehidratar al montar/volver al espacio si el HUD sigue con un trabajo activo para este nodo.
   * No suscribimos al HUD en cada notify: duplicaba el callback del stream y un notify tardío con ~90%
   * podía pisar `progress`/`status` tras terminar (barra + glow + sin Studio).
   */
  useLayoutEffect(() => {
    const p = getAiHudNanoBananaJobProgressForNode(id);
    if (p != null && p < 100) {
      setStatus((s) => (s === 'success' || s === 'error' ? s : 'running'));
      setProgress((prev) => Math.max(prev, p));
    }
  }, [id]);

  /** Incrementa en cada onRun para ignorar callbacks de progreso de una petición anterior. */
  const graphGenEpochRef = useRef(0);

  const selectedModel = nodeData.modelKey || 'flash31';
  const modelInfo = NB_MODELS.find(m => m.id === selectedModel) || NB_MODELS[0];
  const isPro = selectedModel === 'pro3';
  const isFlash25 = selectedModel === 'flash25';

  const updateData = (key: string, val: unknown) =>
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, [key]: val } } : n));

  // Collect all connected reference images
  const getRefImages = () => {
    const imgs: (string | null)[] = [];
    for (const slot of REF_SLOTS) {
      const edge = edges.find(e => e.target === id && e.targetHandle === slot.id);
      const rawVal = edge ? resolvePromptValueFromEdgeSource(edge, nodes) : '';
      imgs.push(typeof rawVal === 'string' && rawVal ? rawVal : null);
    }
    return imgs;
  };

  // Check which handles have connections
  const connectedSlots = REF_SLOTS.map(slot =>
    edges.some(e => e.target === id && e.targetHandle === slot.id)
  );

  const onRun = async () => {
    const promptEdge = edges.find(e => e.target === id && e.targetHandle === 'prompt');
    const prompt = promptEdge ? resolvePromptValueFromEdgeSource(promptEdge, nodes) : '';
    if (!prompt) return alert("Connect a prompt node!");

    const userPromptRaw = String(prompt ?? "");
    let promptToSend = userPromptRaw;
    let diagForRun: BrainImageGeneratorPromptDiagnostics | null = null;
    if (brainConnected && brainCanvasCtx?.assetsMetadata) {
      try {
        const assets = normalizeProjectAssets(brainCanvasCtx.assetsMetadata);
        const pack = composeBrainImageGeneratorPromptWithRuntime({
          assets,
          userThemePrompt: userPromptRaw,
          targetNodeId: id,
        });
        promptToSend = pack.prompt;
        diagForRun = pack.diagnostics;
      } catch {
        promptToSend = userPromptRaw;
        diagForRun = null;
      }
    }
    const refImages = getRefImages().filter(Boolean) as string[];

    const epoch = ++graphGenEpochRef.current;
    setStatus('running');
    setProgress(0);
    aiHudNanoBananaJobStart(id);

    let genFinishedOk = false;
    try {
      const ok = await runAiJobWithNotification({ nodeId: id, label: 'Nano Banana' }, async () => {
        const json = await geminiGenerateWithServerProgress(
          {
            prompt: promptToSend,
            images: refImages,
            aspect_ratio: nodeData.aspect_ratio || '16:9',
            resolution: isFlash25 ? '1k' : normalizeNanoBananaResolution(nodeData.resolution),
            model: selectedModel,
            thinking: nodeData.thinking && isPro,
          },
          (pct) => {
            if (graphGenEpochRef.current !== epoch) return;
            setProgress(pct);
            aiHudNanoBananaJobProgress(id, pct);
          }
        );
        const out = json.output;
        setResult(out);
        setNodes(nds => nds.map(n => {
          if (n.id !== id) return n;
          const oldVal = typeof n.data?.value === 'string' && n.data.value ? n.data.value : null;
          const h = Array.isArray(n.data.generationHistory) ? [...n.data.generationHistory] : [];
          if (oldVal && oldVal !== out && !h.includes(oldVal)) h.push(oldVal);
          if (!h.includes(out)) h.push(out);
          const versions = captureCurrentOutput(n.data, out, 'graph-run');
          return {
            ...n,
            data: {
              ...n.data,
              value: out,
              type: 'image',
              ...(typeof json.key === 'string' ? { s3Key: json.key } : {}),
              generationHistory: h,
              _assetVersions: versions,
            },
          };
        }));
        genFinishedOk = true;
        setBrainImageDiagSync(diagForRun);
        brainTelemetry.track({
          kind: "IMAGE_GENERATED",
          artifactType: "image",
          custom: {
            brainConnected,
            confirmedVisualPatternsUsed: diagForRun?.confirmedVisualPatternsUsed ?? false,
            trustedVisualAnalysisCount: diagForRun?.trustedVisualAnalysisCount ?? 0,
            textOnlyGeneration: diagForRun?.textOnlyGeneration ?? false,
            usedBrainVisualCompose: Boolean(diagForRun),
          },
        });
        brainTelemetry.track({
          kind: "IMAGE_USED",
          artifactType: "image",
          custom: { surface: "graph_output_committed" },
        });
      });
      if (!ok && graphGenEpochRef.current === epoch) setStatus('error');
    } finally {
      if (genFinishedOk && graphGenEpochRef.current === epoch) {
        flushSync(() => {
          setProgress(100);
          setStatus('success');
          aiHudNanoBananaJobProgress(id, 100);
        });
      }
      if (graphGenEpochRef.current === epoch) {
        aiHudNanoBananaJobEnd(id);
        setTimeout(() => {
          if (graphGenEpochRef.current === epoch) setProgress(0);
        }, 1000);
      }
    }
  };

  useRegisterAssistantNodeRun(id, onRun);

  // Preview of connected ref slot 0 (the base image)
  const refImgPreview = (() => {
    // REF_SLOTS[0].id === 'image' — the first/main reference slot
    const edge = edges.find(e => e.target === id && e.targetHandle === 'image');
    const v = edge ? resolvePromptValueFromEdgeSource(edge, nodes) : '';
    return typeof v === 'string' && v ? v : null;
  })();

  /** Persisted URL/base64 from node data (S3 presigned after save + hydrate). `result` is only in-memory after generate. */
  const persistedOutput =
    typeof nodeData.value === 'string' && nodeData.value.length > 0 ? nodeData.value : null;
  const outputImage = result ?? persistedOutput;

  /** Barra y glow solo con avance <100%; a 100% se oculta aunque `status` tarde un tick en pasar a success. */
  const isActivelyGenerating = status === 'running' && progress < 100;

  const promptConnected = edges.some(e => e.target === id && e.targetHandle === 'prompt');
  const nbResLabel = isFlash25 ? '1K' : normalizeNanoBananaResolution(nodeData.resolution).toUpperCase();
  const nanoAspect = parseAspectRatioValue(nodeData.aspect_ratio || '16:9') ?? { width: 16, height: 9 };

  useLayoutEffect(() => {
    const chromeHeight = resolveNodeChromeHeight(frameRef.current, previewRef.current);
    const nextFrame = resolveAspectLockedNodeFrame({
      node: currentFrameNode,
      contentWidth: nanoAspect.width,
      contentHeight: nanoAspect.height,
      minWidth: 240,
      maxWidth: 960,
      minHeight: 180,
      maxHeight: STUDIO_NODE_MAX_HEIGHT,
      chromeHeight,
    });
    if (!nodeFrameNeedsSync(currentFrameNode, nextFrame)) return;
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? {
              ...node,
              width: nextFrame.width,
              height: nextFrame.height,
              style: { ...node.style, width: nextFrame.width, height: nextFrame.height },
            }
          : node,
      ),
    );
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [
    currentFrameNode,
    id,
    nanoAspect.height,
    nanoAspect.width,
    setNodes,
    updateNodeInternals,
  ]);

  return (
    <div className={`custom-node processor-node group/node ${isActivelyGenerating ? 'node-glow-running' : ''}`}
         style={{ minWidth: 240 }}
         ref={frameRef}>
      <FoldderNodeResizer minWidth={240} minHeight={180} maxWidth={960} maxHeight={STUDIO_NODE_MAX_HEIGHT} keepAspectRatio isVisible={selected} />
      <NodeLabel id={id} label={nodeData.label} defaultLabel="CREACION DE IMAGEN" />

      {/* ── Handles ── */}
      <div className="handle-wrapper handle-left" style={{ top: "2%" }}>
        <FoldderDataHandle type="target" position={Position.Left} id="brain" dataType="brain" />
        <span
          className="handle-label"
          style={{
            color: brainConnected ? "#a78bfa" : undefined,
          }}
        >
          {brainConnected ? "✓ Brain" : "Brain"}
        </span>
      </div>
      {REF_SLOTS.map((slot, i) => (
        <div key={slot.id} className="handle-wrapper handle-left"
             style={{ top: slot.top, opacity: i === 0 || connectedSlots[i - 1] ? 1 : 0.35 }}>
          <FoldderDataHandle type="target" position={Position.Left} id={slot.id} dataType="image" />
          <span className="handle-label" style={{
            color: connectedSlots[i] ? '#f59e0b' : undefined,
          }}>
            {connectedSlots[i] ? `✓ ${slot.label}` : slot.label}
          </span>
        </div>
      ))}
      <div className="handle-wrapper handle-left" style={{ top: '94%' }}>
        <FoldderDataHandle type="target" position={Position.Left} id="prompt" dataType="prompt" />
        <span className="handle-label">Prompt</span>
      </div>
      <div className="handle-wrapper handle-right" style={{ top: '50%' }}>
        <span className="handle-label">Image out</span>
        <FoldderDataHandle type="source" position={Position.Right} id="image" dataType="image" />
      </div>

      {/* ── Header ── */}
      <div className="node-header">
        <NodeIcon
          type="nanoBanana"
          selected={selected}
          state={resolveFoldderNodeState({ error: status === 'error', loading: isActivelyGenerating, done: !!outputImage })}
          size={16}
        />
        <FoldderNodeHeaderTitle
          className="min-w-0 flex-1 uppercase leading-tight tracking-tight line-clamp-3"
          introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}
        >
          CREACION DE IMAGEN
        </FoldderNodeHeaderTitle>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-[8px] font-mono font-light uppercase leading-none">
          <span
            className={`rounded-md border px-1.5 py-0.5 ${modelInfo.borderColor} ${modelInfo.bg} ${modelInfo.color}`}
            title="Calidad del modelo"
          >
            {modelInfo.label}
          </span>
          <span
            className="rounded-md border border-white/20 bg-black/[0.06] px-1.5 py-0.5 text-zinc-600"
            title="Resolución de salida"
          >
            {nbResLabel}
          </span>
        </div>
      </div>

      {/* ── Main image area: preview encaja sin recortar (object-contain); la imagen generada sigue con su resolución real ── */}
      <div
        ref={previewRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-b-[24px] bg-[#0a0a0a] group/out"
        style={{ minHeight: 120 }}
      >

        {/* OUTPUT image — preview ajustado al marco del nodo */}
        {outputImage ? (
          <>
            <img
              src={outputImage}
              alt="Generated"
              className="max-h-full max-w-full w-auto h-auto object-contain"
            />
            {/* Hover gradient + actions */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent
                            opacity-0 group-hover/out:opacity-100 transition-opacity" />
            <button
              onClick={() => setShowFullSize(true)}
              className="absolute top-2 right-2 z-20 bg-black/60 hover:bg-black/90 text-white
                         text-[7px] font-black px-2 py-1 rounded flex items-center gap-1
                         opacity-0 group-hover/out:opacity-100 transition-opacity"
            >
              <Maximize2 size={8} /> EXPAND
            </button>
            {/* Model info badge on hover */}
            <span className="absolute top-2 left-2 z-20 text-[6px] font-black uppercase text-white/70
                             bg-black/50 px-1.5 py-0.5 rounded
                             opacity-0 group-hover/out:opacity-100 transition-opacity">
              {modelInfo.label} · {nbResLabel} · {nodeData.aspect_ratio || '16:9'}
            </span>
          </>
        ) : (
          /* No output yet — show input image at full opacity as reference preview */
          refImgPreview ? (
            <>
              <img src={refImgPreview} alt="Input" className="max-h-full max-w-full object-contain" />
              <div className="absolute bottom-0 left-0 right-0 flex items-center px-2 py-1 z-[12]"
                   style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}>
                <span className="text-[7px] font-black uppercase tracking-wider text-white/70">REF · sin generar</span>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2"
                 style={{ background: 'rgba(0,0,0,0.04)' }}>
              <ImageIcon size={28} className="text-zinc-400/50" />
              <span className="text-[7px] font-black uppercase tracking-widest text-zinc-400/60 text-center leading-tight">
                Conecta Ref 1<br/>y abre Studio
              </span>
            </div>
          )
        )}

        {/* Siempre visible: al quedar el estado «generando» por carrera, el usuario puede reabrir Studio */}
        <FoldderStudioModeCenterButton onClick={openNanoStudioNormal} />

        {/* INPUT image badge — bottom-left corner overlay (always visible when connected) */}
        {refImgPreview && outputImage && (
          <div className="absolute bottom-2 left-2 rounded overflow-hidden border-2 border-white/60 shadow-lg"
               style={{ width: 56, height: 40 }}>
            <img src={refImgPreview} alt="ref" className="w-full h-full object-cover" />
            <span className="absolute bottom-0 left-0 right-0 text-[5px] font-black uppercase text-white bg-black/60 text-center py-px">BASE</span>
          </div>
        )}

        {/* Progress bar while generating — z-50 para quedar por encima del preview object-contain */}
        {isActivelyGenerating && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[50]">
            <div className="h-px w-full bg-white/15">
              <div
                className="h-full bg-white transition-all duration-500"
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
            <p className="bg-black/80 px-2 py-1 text-center text-[7px] font-black uppercase tracking-widest text-white/95 backdrop-blur-sm">
              {isPro && nodeData.thinking ? `Thinking… ${Math.round(progress)}%` : `Generando… ${Math.round(progress)}%`}
            </p>
          </div>
        )}
      </div>

      {promptConnected && !showStudio && (
        <div className="nodrag flex shrink-0 border-t border-black/[0.06] bg-white/[0.04] px-2 py-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRun();
            }}
            disabled={isActivelyGenerating}
            className="execute-btn nodrag w-full !py-2.5 !text-[9px] justify-center disabled:cursor-not-allowed disabled:opacity-40"
          >
            Generar Imagen con prompt
          </button>
        </div>
      )}

      {brainConnected && !showStudio && (
        <div className="nodrag flex shrink-0 flex-col gap-1 border-t border-black/[0.06] bg-violet-950/15 px-2 py-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowBrainWhy((s) => !s);
            }}
            className="text-left text-[8px] font-black uppercase tracking-wider text-violet-200/90 hover:text-violet-100"
          >
            {showBrainWhy ? "Ocultar por qué" : "Ver por qué · Brain"}
          </button>
          {showBrainWhy &&
            (brainImageDiag ? (
              <div className="max-h-40 overflow-y-auto rounded border border-white/10 bg-black/45 px-2 py-1.5 text-[7px] leading-relaxed text-zinc-200">
                <div className="mb-1 font-bold uppercase tracking-wide text-violet-200/90">Última composición</div>
                <div>finalPromptUsed (recorte):</div>
                <pre className="mt-0.5 max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-zinc-400">
                  {brainImageDiag.finalPromptUsed.length > 1600
                    ? `${brainImageDiag.finalPromptUsed.slice(0, 1600)}…`
                    : brainImageDiag.finalPromptUsed}
                </pre>
                <div className="mt-1 border-t border-white/10 pt-1 text-zinc-300">
                  confirmedVisualPatterns: {String(brainImageDiag.confirmedVisualPatternsUsed)}
                </div>
                <div>trusted visual analyses: {brainImageDiag.trustedVisualAnalysisCount}</div>
                <div>textOnlyGeneration: {String(brainImageDiag.textOnlyGeneration)}</div>
                {brainImageDiag.varietyMode ? (
                  <div className="mt-0.5 text-zinc-400">
                    variedad: {brainImageDiag.varietyMode}
                    {brainImageDiag.familyUsed ? ` · familia: ${brainImageDiag.familyUsed}` : ""}
                    {brainImageDiag.repeatedElementsAvoided != null
                      ? ` · repetición evitada: ${String(brainImageDiag.repeatedElementsAvoided)}`
                      : ""}
                  </div>
                ) : null}
                {brainImageDiag.chosenVariationAxes ? (
                  <div className="mt-0.5 text-zinc-500">
                    ejes: {brainImageDiag.chosenVariationAxes.subjectMode} ·{" "}
                    {brainImageDiag.chosenVariationAxes.framing} · {brainImageDiag.chosenVariationAxes.environment}
                  </div>
                ) : null}
                <div className="mt-0.5">visualAvoid (muestra):</div>
                <pre className="max-h-14 overflow-y-auto whitespace-pre-wrap text-zinc-500">
                  {brainImageDiag.visualAvoid.slice(0, 12).join("; ")}
                  {brainImageDiag.visualAvoid.length > 12 ? "…" : ""}
                </pre>
              </div>
            ) : (
              <p className="text-[7px] text-zinc-500">
                Genera desde el botón o Studio para ver el prompt enviado y las señales Brain.
              </p>
            ))}
        </div>
      )}



      {/* ── NanoBanana Studio ── */}
      {showStudio && (() => {
        const promptEdge = edges.find((e) => e.target === id && e.targetHandle === 'prompt');
        const promptVal = promptEdge
          ? String(resolvePromptValueFromEdgeSource(promptEdge, nodes) ?? '')
          : '';
        const refImgs = getRefImages();
        const connected0 = (refImgs[0] as string | null | undefined) ?? null;
        return (
          <NanoBananaStudio
            nodeId={id}
            initialImage={connected0}
            lastGenerated={outputImage}
            modelKey={nodeData.modelKey || 'flash31'}
            aspectRatio={nodeData.aspect_ratio || '16:9'}
            resolution={normalizeNanoBananaResolution(nodeData.resolution)}
            thinking={!!nodeData.thinking}
            prompt={promptVal}
            externalPromptIgnored
            composeBrainImageGeneratorPrompt={composeBrainForStudio}
            onBrainImageGeneratorDiagnostics={setBrainImageDiagSync}
            topBarCloseMode={nanoStudioTopBarCloseMode}
            generationHistory={persistedGenerationHistory}
            onGenerationHistoryChange={onGenerationHistoryChange}
            standardShell={standardShell ?? undefined}
            onClose={() => {
              const shell = standardShell;
              closeNanoStudio();
              if (shell && typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent(FOLDDER_STANDARD_STUDIO_CLOSE_REQUEST_EVENT, {
                    detail: { nodeId: id, nodeType: 'nanoBanana', fileId: shell.fileId, appId: shell.appId },
                  }),
                );
              }
            }}
            onGenerated={(url, s3Key) => {
              const d = brainDiagRef.current;
              brainTelemetry.track({
                kind: "IMAGE_GENERATED",
                artifactType: "image",
                custom: {
                  studio: true,
                  brainConnected,
                  confirmedVisualPatternsUsed: d?.confirmedVisualPatternsUsed ?? false,
                  trustedVisualAnalysisCount: d?.trustedVisualAnalysisCount ?? 0,
                  textOnlyGeneration: d?.textOnlyGeneration ?? false,
                },
              });
              brainTelemetry.track({
                kind: "IMAGE_USED",
                artifactType: "image",
                custom: { surface: "studio_output_committed" },
              });
              setResult(url);
              setNodes((nds) => nds.map((n) => {
                if (n.id !== id) return n;
                const data: Record<string, unknown> = { ...n.data, value: url, type: 'image' };
                if (s3Key) data.s3Key = s3Key;
                else delete data.s3Key;
                return { ...n, data };
              }));
            }}
            onResolutionChange={(r) => updateData('resolution', r)}
          />
        );
      })()}

      {/* ── Fullscreen overlay ─── */}
      {showFullSize && outputImage && (
        <div
          className="fixed inset-0 z-[9999] bg-black/92 flex items-center justify-center p-10 cursor-zoom-out nodrag nopan"
          data-foldder-studio-canvas=""
          onClick={() => setShowFullSize(false)}
        >
          <div className="absolute top-8 right-8 text-white/50 hover:text-white transition-colors">
            <X size={36} strokeWidth={2} />
          </div>
          <img
            src={outputImage}
            className="max-h-full max-w-full w-auto h-auto rounded-2xl object-contain shadow-2xl"
            alt="Full size"
          />
        </div>
      )}
    </div>
  );
});



// ── TEXT OVERLAY NODE ────────────────────────────────────────────────────────
const FONT_FAMILIES = [
  { label: 'Inter',        value: 'Inter, sans-serif' },
  { label: 'Serif',        value: 'Georgia, serif' },
  { label: 'Mono',         value: 'monospace' },
  { label: 'Display',      value: '"Bebas Neue", sans-serif' },
  { label: 'Playfair',     value: '"Playfair Display", serif' },
  { label: 'Roboto',       value: 'Roboto, sans-serif' },
  { label: 'Oswald',       value: 'Oswald, sans-serif' },
  { label: 'Lato',         value: 'Lato, sans-serif' },
  { label: 'Montserrat',   value: 'Montserrat, sans-serif' },
  { label: 'Comic',        value: '"Comic Sans MS", cursive' },
];

const FONT_WEIGHTS = [
  { label: 'Thin',    value: '300' },
  { label: 'Regular', value: '400' },
  { label: 'Bold',    value: '700' },
  { label: 'Black',   value: '900' },
];

export const TextOverlayNode = memo(function TextOverlayNode({ id, data, selected }: NodeProps) {
  const nodeData = data as BaseNodeData & {
    text?: string;
    fontFamily?: string;
    fontSize?: number;
    color?: string;
    fontWeight?: string;
    textAlign?: CanvasTextAlign;
    canvasW?: number;
    canvasH?: number;
  };
  const { setNodes } = useReactFlow();
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  const text       = nodeData.text      ?? 'Your text here';
  const fontFamily = nodeData.fontFamily ?? 'Inter, sans-serif';
  const fontSize   = nodeData.fontSize  ?? 72;
  const color      = nodeData.color     ?? '#ffffff';
  const fontWeight = nodeData.fontWeight ?? '700';
  const textAlign  = (nodeData.textAlign ?? 'center') as CanvasTextAlign;
  const canvasW    = nodeData.canvasW   ?? 1920;
  const canvasH    = nodeData.canvasH   ?? 400;

  const updateData = (key: string, val: unknown) =>
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, [key]: val } } : n));

  // Render text on canvas and push to output
  const renderText = useCallback(() => {
    const offscreen = document.createElement('canvas');
    offscreen.width  = canvasW;
    offscreen.height = canvasH;
    const ctx = offscreen.getContext('2d')!;

    // Transparent background
    ctx.clearRect(0, 0, canvasW, canvasH);

    ctx.font         = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.fillStyle    = color;
    ctx.textAlign    = textAlign;
    ctx.textBaseline = 'middle';

    const x = textAlign === 'left' ? 40 : textAlign === 'right' ? canvasW - 40 : canvasW / 2;

    // Multi-line support (split by \n)
    const lines = text.split('\n');
    const lineH  = fontSize * 1.3;
    const startY = canvasH / 2 - ((lines.length - 1) * lineH) / 2;
    lines.forEach((line, i) => ctx.fillText(line, x, startY + i * lineH));

    const dataUrl = offscreen.toDataURL('image/png');

    // Show in preview
    if (previewRef.current) {
      const pCtx = previewRef.current.getContext('2d')!;
      previewRef.current.width  = previewRef.current.offsetWidth  || 280;
      previewRef.current.height = previewRef.current.offsetHeight || 80;
      const scale = Math.min(previewRef.current.width / canvasW, previewRef.current.height / canvasH);
      pCtx.clearRect(0, 0, previewRef.current.width, previewRef.current.height);
      const img = new Image();
      img.onload = () => {
        pCtx.drawImage(img, 0, 0, canvasW * scale, canvasH * scale);
        setRendered(true);
      };
      img.src = dataUrl;
    }

    // Push to output
    setNodes((nds) => nds.map((n) =>
      n.id === id ? { ...n, data: { ...n.data, value: dataUrl, type: 'image' } } : n
    ));
  }, [text, fontFamily, fontSize, color, fontWeight, textAlign, canvasW, canvasH, id, setNodes]);

  return (
    <div className={`custom-node tool-node` } style={{ minWidth: 300 }}>
      <FoldderNodeResizer minWidth={300} minHeight={280} maxWidth={700} maxHeight={720} isVisible={selected} />
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Text Overlay" />

      <div className="node-header">
        <NodeIcon type="textOverlay" selected={selected} size={16} />
        <FoldderNodeHeaderTitle introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}>
          Text Overlay
        </FoldderNodeHeaderTitle>
        <div className="node-badge border border-white/15">TEXT</div>
      </div>

      <div className="node-content space-y-3">

        {/* Text input */}
        <div className="space-y-1">
          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Text</span>
          <textarea
            className="node-textarea w-full text-sm"
            rows={3}
            value={text}
            placeholder="Your text here…"
            onChange={e => updateData('text', e.target.value)}
            style={{ fontFamily, fontSize: Math.min(fontSize, 16), color, fontWeight, resize: 'none' }}
          />
        </div>

        {/* Font family */}
        <div className="space-y-1">
          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Font Family</span>
          <div className="grid grid-cols-5 gap-1">
            {FONT_FAMILIES.map(f => (
              <button
                key={f.value}
                onClick={() => updateData('fontFamily', f.value)}
                className={`py-1 rounded text-[7px] font-bold border transition-all truncate
                  ${fontFamily === f.value
                    ? 'bg-purple-500/20 text-purple-400 border-purple-500/40'
                    : 'bg-white/[0.02] text-zinc-600 border-white/5 hover:border-white/15 hover:text-zinc-400'
                  }`}
                style={{ fontFamily: f.value }}
                title={f.label}
              >{f.label}</button>
            ))}
          </div>
        </div>

        {/* Font size + weight row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Size: {fontSize}px</span>
            <input
              type="range" min={12} max={300} step={2} value={fontSize}
              onChange={e => updateData('fontSize', Number(e.target.value))}
              className="node-slider w-full"
            />
          </div>
          <div className="space-y-1">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Weight</span>
            <div className="grid grid-cols-4 gap-0.5">
              {FONT_WEIGHTS.map(w => (
                <button
                  key={w.value}
                  onClick={() => updateData('fontWeight', w.value)}
                  className={`py-1 rounded text-[7px] border transition-all
                    ${fontWeight === w.value
                      ? 'bg-purple-500/20 text-purple-400 border-purple-500/40'
                      : 'bg-white/[0.02] text-zinc-600 border-white/5 hover:text-zinc-400'
                    }`}
                  style={{ fontWeight: w.value }}
                >{w.label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Color + align row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Color</span>
            <div className="flex items-center gap-2">
              <input
                type="color" value={color}
                onChange={e => updateData('color', e.target.value)}
                className="w-8 h-8 rounded-lg border border-white/10 bg-transparent cursor-pointer"
              />
              <input
                type="text" value={color} maxLength={7}
                onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) updateData('color', e.target.value); }}
                className="node-input text-[9px] !py-1 !px-2 font-mono uppercase"
              />
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Align</span>
            <div className="grid grid-cols-3 gap-1">
              {(['left','center','right'] as CanvasTextAlign[]).map(a => (
                <button
                  key={a}
                  onClick={() => updateData('textAlign', a)}
                  className={`py-1 rounded text-[8px] font-black border transition-all
                    ${textAlign === a
                      ? 'bg-purple-500/20 text-purple-400 border-purple-500/40'
                      : 'bg-white/[0.02] text-zinc-600 border-white/5 hover:text-zinc-400'
                    }`}
                >{a === 'left' ? '⟵' : a === 'center' ? '≡' : '⟶'}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Canvas size (compact) */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-0.5">
            <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Canvas W</span>
            <input type="number" value={canvasW} min={100} max={4000} step={10}
              onChange={e => updateData('canvasW', Number(e.target.value))}
              className="node-input text-[9px] !py-1 !px-2" />
          </div>
          <div className="space-y-0.5">
            <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Canvas H</span>
            <input type="number" value={canvasH} min={100} max={4000} step={10}
              onChange={e => updateData('canvasH', Number(e.target.value))}
              className="node-input text-[9px] !py-1 !px-2" />
          </div>
        </div>

        {/* Render button */}
        <button className="execute-btn w-full !py-2.5 !text-xs" onClick={renderText}>
          <Type size={11} /> <span className="ml-2">RENDER TEXT → IMAGE</span>
        </button>

        {/* Preview canvas */}
        <div className="w-full rounded-xl overflow-hidden border border-white/10 bg-gray-900"
             style={{ height: 80 }}>
          <canvas
            ref={previewRef}
            style={{ width: '100%', height: '100%' }}
          />
          {!rendered && (
            <div className="flex items-center justify-center h-full opacity-25">
              <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Preview after render</span>
            </div>
          )}
        </div>
      </div>

      {/* Output handle */}
      <div className="handle-wrapper handle-right">
        <span className="handle-label">Image out</span>
        <FoldderDataHandle type="source" position={Position.Right} id="image" dataType="image" />
      </div>
    </div>
  );
});


export const BackgroundRemoverNode = memo(function BackgroundRemoverNode({ id, data, selected }: NodeProps) {
  const nodeData = data as BackgroundRemoverNodeData;
  const nodes = useNodes();
  const edges = useEdges();
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const [status, setStatus] = useState('idle');
  const [previewMode, setPreviewMode] = useState<MattePreviewMode>('cutout');
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const currentNode = nodes.find((node) => node.id === id);
  const currentFrameNode = useCurrentNodeFrameSnapshot(currentNode);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [aspectImageSize, setAspectImageSize] = useState<{ url: string; width: number; height: number } | null>(null);

  const updateNestedData = (key: string, val: unknown) => {
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, [key]: val } } : n));
  };

  const threshold = nodeData.threshold ?? 0.9;

  const onRun = async () => {
    // Find ANY incoming edge if the specific one fails
    const incomingEdges = edges.filter(e => e.target === id);

    if (incomingEdges.length === 0) {
      return alert("No input connected! Connect an image node to the left side.");
    }

    // Try to find a node with a value among all connected sources
    let media = "";
    let sourceNodeLabel = "";

    for (const edge of incomingEdges) {
      const val = resolvePromptValueFromEdgeSource(edge, nodes);
      if (typeof val === 'string' && val) {
        media = val;
        const srcNode = nodes.find(n => n.id === edge.source);
        sourceNodeLabel = ((srcNode?.data as { label?: string })?.label || srcNode?.id || '') as string;
        break;
      }
    }

    if (!media) {
      return alert("Connected node (" + sourceNodeLabel + ") has no image data. Try selecting an image in the source node first.");
    }

    setStatus('running');
    const ok = await runAiJobWithNotification({ nodeId: id, label: 'Quitar fondo' }, async () => {
      const res = await fetch('/api/spaces/matte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: media,
          expansion: nodeData.expansion ?? 0,
          feather: nodeData.feather ?? 0.6,
          threshold
        })
      });

      const json = await res.json();
      if (json.error) throw new Error(json.error);

      setNodes((nds) => nds.map((n) => n.id === id ? {
        ...n,
        data: {
          ...n.data,
          rgba: json.rgba_image,
          mask: json.mask,
          bbox: json.bbox,
          result_rgba: json.rgba_image,
          result_mask: json.mask,
          value: json.rgba_image,
          metadata: json.metadata,
          type: 'image'
        }
      } : n));
    });
    setStatus(ok ? 'success' : 'idle');
  };

  useRegisterAssistantNodeRun(id, onRun);

  const sourceEdge = edges.find(e => e.target === id && e.targetHandle === 'media');
  const sourceNode = nodes.find(n => n.id === sourceEdge?.source);
  const originalPreview = sourceNode?.data.value as string | undefined;
  const aspectImageUrl = originalPreview || nodeData.result_rgba || nodeData.result_mask || null;
  const activeAspectImageSize =
    aspectImageUrl && aspectImageSize?.url === aspectImageUrl ? aspectImageSize : null;
  const aspectContentWidth = activeAspectImageSize?.width ?? null;
  const aspectContentHeight = activeAspectImageSize?.height ?? null;

  useEffect(() => {
    if (!aspectImageUrl) return;
    let cancelled = false;
    loadImageDimensions(aspectImageUrl)
      .then(({ width, height }) => {
        if (!cancelled) setAspectImageSize({ url: aspectImageUrl, width, height });
      });
    return () => {
      cancelled = true;
    };
  }, [aspectImageUrl]);

  useLayoutEffect(() => {
    if (aspectContentWidth == null || aspectContentHeight == null) return;
    const chromeHeight = resolveNodeChromeHeight(frameRef.current, previewRef.current);
    const nextFrame = resolveAspectLockedNodeFrame({
      node: currentFrameNode,
      contentWidth: aspectContentWidth,
      contentHeight: aspectContentHeight,
      minWidth: 320,
      maxWidth: 700,
      minHeight: 320,
      maxHeight: STUDIO_NODE_MAX_HEIGHT,
      chromeHeight,
    });
    if (!nodeFrameNeedsSync(currentFrameNode, nextFrame)) return;
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? {
              ...node,
              width: nextFrame.width,
              height: nextFrame.height,
              style: { ...node.style, width: nextFrame.width, height: nextFrame.height },
            }
          : node,
      ),
    );
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [
    aspectContentHeight,
    aspectContentWidth,
    currentFrameNode,
    id,
    setNodes,
    updateNodeInternals,
  ]);

  const getPreviewImage = () => {
    switch (previewMode) {
      case 'original': return originalPreview;
      case 'mask': return nodeData.result_mask;
      case 'cutout': return nodeData.result_rgba;
      default: return originalPreview;
    }
  };

  return (
    <div ref={frameRef} className={`custom-node mask-node group/node ${status === 'running' ? 'node-glow-running' : ''}`} style={{ minWidth: 320 }}>
      <FoldderNodeResizer minWidth={320} minHeight={320} maxWidth={700} maxHeight={STUDIO_NODE_MAX_HEIGHT} keepAspectRatio isVisible={selected} />
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Background Remover" />
      <div className="handle-wrapper handle-left">
        <FoldderDataHandle type="target" position={Position.Left} id="media" dataType="image" />
        <span className="handle-label">Media Input</span>
      </div>
      
      <div className="node-header">
        <NodeIcon
          type="backgroundRemover"
          selected={selected}
          state={resolveFoldderNodeState({ loading: status === 'running', done: status === 'success' })}
          size={16}
        />
        <FoldderNodeHeaderTitle introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}>
          Remove Background
        </FoldderNodeHeaderTitle>
      </div>
      
      <div className="flex min-h-0 flex-1 flex-col">
          {/* PREVIEW AREA */}
          <div ref={previewRef} className="relative group/preview min-h-[180px] flex-1 overflow-hidden bg-slate-100/50 flex items-center justify-center border-b border-slate-200/60">
             <div className="absolute top-2 left-2 z-10 flex gap-1 bg-slate-50/50 p-1 rounded-lg backdrop-blur-md border border-slate-200/60">
                {(['original', 'mask', 'cutout'] as const).map(mode => (
                  <button 
                    key={mode}
                    onClick={() => setPreviewMode(mode)}
                    className={`px-2 py-1 rounded-md text-[7px] font-black uppercase tracking-widest transition-all ${previewMode === mode ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                  >
                    {mode}
                  </button>
                ))}
             </div>

            {getPreviewImage() ? (
              <img 
                src={getPreviewImage()} 
                className={`w-full h-full object-contain ${previewMode === 'mask' ? 'invert brightness-150' : ''}`} 
                alt="Remover Preview" 
              />
            ) : (
              <div className="flex flex-col items-center gap-2 opacity-20">
                 <Scissors size={40} className="text-cyan-400" />
                 <span className="text-[10px] font-bold uppercase tracking-widest">Awaiting Output</span>
              </div>
            )}

            {status !== 'running' && (
              <FoldderStudioModeCenterButton onClick={() => setIsStudioOpen(true)} />
            )}

            {status === 'running' && (
              <div className="absolute inset-0 bg-slate-50 backdrop-blur-sm flex flex-col items-center justify-center z-20">
                 <Loader2 size={24} className="animate-spin text-cyan-400 mb-2" />
                 <span className="text-[9px] font-black text-white uppercase tracking-widest">Processing Alpha...</span>
              </div>
            )}
          </div>

          {/* CONTROLS */}
          <div className="p-4 space-y-5">
            <button 
              onClick={onRun}
              disabled={status === 'running'}
              className="execute-btn w-full"
            >
              {status === 'running' ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              <span>{status === 'running' ? 'REMOVING...' : 'REMOVE BACKGROUND'}</span>
            </button>

            <div className="space-y-4 pt-2 border-t border-slate-200/60">
               <div className="space-y-2">
                  <div className="flex justify-between items-center">
                     <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Threshold (Precision)</span>
                     <span className="text-[10px] font-mono text-pink-500 font-black bg-pink-500/10 px-2 py-0.5 rounded">{threshold.toFixed(2)}</span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.01"
                    value={threshold}
                    onChange={(e) => updateNestedData('threshold', parseFloat(e.target.value))}
                    className="node-slider nodrag accent-pink-500"
                  />
               </div>

               <div className="space-y-2">
                  <div className="flex justify-between items-center">
                     <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Expansion</span>
                     <span className="text-[10px] font-mono text-cyan-400 font-black bg-cyan-400/10 px-2 py-0.5 rounded">{nodeData.expansion ?? 0}px</span>
                  </div>
                  <input 
                    type="range" min="-10" max="10" step="1"
                    value={nodeData.expansion ?? 0}
                    onChange={(e) => updateNestedData('expansion', parseInt(e.target.value))}
                    className="node-slider nodrag accent-cyan-500"
                  />
               </div>

               <div className="space-y-2">
                  <div className="flex justify-between items-center">
                     <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Borders (Feather)</span>
                     <span className="text-[10px] font-mono text-blue-400 font-black bg-blue-400/10 px-2 py-0.5 rounded">{(nodeData.feather ?? 0.6).toFixed(1)}px</span>
                  </div>
                  <input 
                    type="range" min="0" max="2" step="0.1"
                    value={nodeData.feather ?? 0.6}
                    onChange={(e) => updateNestedData('feather', parseFloat(e.target.value))}
                    className="node-slider nodrag accent-blue-400"
                  />
               </div>
            </div>
          </div>
      </div>

      <div className="flex flex-col gap-2 absolute right-[-14px] top-[40px] nodrag">
          <div className="relative group/h mb-4">
             <FoldderDataHandle type="source" position={Position.Right} id="mask" dataType="mask" className="!right-0 shadow-[0_0_10px_rgba(34,211,238,0.5)] cursor-crosshair" />
             <span className="absolute left-6 top-1/2 -translate-y-1/2 text-[7px] font-black uppercase text-cyan-400 bg-black/90 px-1 border border-cyan-400/20 rounded opacity-0 group-hover/h:opacity-100 transition-opacity whitespace-nowrap">MASK</span>
          </div>
          <div className="relative group/h mb-4">
             <FoldderDataHandle type="source" position={Position.Right} id="rgba" dataType="image" className="!right-0 shadow-[0_0_10px_rgba(236,72,153,0.5)] cursor-crosshair" />
             <span className="absolute left-6 top-1/2 -translate-y-1/2 text-[7px] font-black uppercase text-pink-500 bg-black/90 px-1 border border-pink-500/20 rounded opacity-0 group-hover/h:opacity-100 transition-opacity whitespace-nowrap">CUTOUT</span>
          </div>
          <div className="relative group/h">
             <FoldderDataHandle type="source" position={Position.Right} id="bbox" dataType="txt" className="!right-0 shadow-[0_0_10px_rgba(245,158,11,0.5)] cursor-crosshair" />
             <span className="absolute left-6 top-1/2 -translate-y-1/2 text-[7px] font-black uppercase text-amber-500 bg-slate-100/50 px-1 border border-amber-500/20 rounded opacity-0 group-hover/h:opacity-100 transition-opacity whitespace-nowrap">BBOX</span>
          </div>
      </div>

      {isStudioOpen && createPortal(
        <MatteStudioOverlay 
          nodeData={nodeData}
          previewMode={previewMode}
          setPreviewMode={setPreviewMode}
          onRun={onRun}
          status={status}
          updateNestedData={updateNestedData}
          onClose={() => setIsStudioOpen(false)}
          getPreviewImage={getPreviewImage}
        />,
        document.body
      )}
    </div>
  );
});

interface MatteStudioOverlayProps {
  nodeData: BackgroundRemoverNodeData;
  previewMode: MattePreviewMode;
  setPreviewMode: React.Dispatch<React.SetStateAction<MattePreviewMode>>;
  onRun: () => void;
  status: string;
  updateNestedData: (key: string, val: unknown) => void;
  onClose: () => void;
  getPreviewImage: () => string | undefined;
}

const MatteStudioOverlay = ({ 
  nodeData, 
  previewMode, 
  setPreviewMode, 
  onRun, 
  status, 
  updateNestedData, 
  onClose,
  getPreviewImage 
}: MatteStudioOverlayProps) => {
  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-xl flex flex-col studio-overlay nodrag nopan"
      data-foldder-studio-canvas=""
    >
      <div className="h-16 border-b border-slate-200/60 bg-slate-50/50 flex items-center px-8 gap-6 backdrop-blur-md">
        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors cursor-pointer"><X size={20} /></button>
        <div className="h-6 w-px bg-white/10" />
        <div className="flex items-center gap-3">
          <Scissors className="text-cyan-500" size={18} />
          <span className="text-[11px] font-black uppercase tracking-[3px] text-white">Background Remover <span className="text-cyan-500/50">Studio</span></span>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <button 
            onClick={onRun}
            disabled={status === 'running'}
            className="group relative bg-cyan-500 hover:bg-cyan-400 text-black px-10 py-2.5 rounded-full text-[10px] font-black uppercase tracking-[2px] transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] flex items-center gap-2"
          >
            {status === 'running' ? <Loader2 size={12} className="animate-spin" /> : <Play size={10} />}
            {status === 'running' ? 'Computing...' : 'Run Extraction'}
            <div className="absolute inset-0 rounded-full group-hover:animate-ping bg-cyan-500/20 pointer-events-none"></div>
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 bg-slate-50/50 relative flex items-center justify-center p-12">
           <div className="absolute top-8 left-8 z-10 flex gap-2">
              {(['original', 'mask', 'cutout'] as const).map(mode => (
                <button 
                  key={mode}
                  onClick={() => setPreviewMode(mode)}
                  className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${previewMode === mode ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.4)]' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                >
                  {mode}
                </button>
              ))}
           </div>

           <div className="w-full h-full relative group/canvas flex items-center justify-center">
              {getPreviewImage() ? (
                <img 
                  src={getPreviewImage()} 
                  className={`max-w-full max-h-full object-contain rounded-2xl shadow-[0_40px_100px_rgba(0,0,0,0.8)] border border-slate-200/60 ${previewMode === 'mask' ? 'invert brightness-125' : ''}`} 
                  alt="Studio Preview" 
                />
              ) : (
                <div className="text-gray-800 flex flex-col items-center gap-4">
                  <ImageIcon size={64} opacity={0.2} />
                  <span className="text-sm font-black uppercase tracking-widest opacity-20">Waiting for media</span>
                </div>
              )}

              {status === 'running' && (
                <div className="absolute inset-0 bg-slate-50 backdrop-blur-sm flex flex-col items-center justify-center z-20 rounded-2xl">
                   <div className="w-48 h-1 bg-cyan-500/10 rounded-full overflow-hidden mb-4">
                      <div className="h-full bg-cyan-500 animate-pulse w-full" />
                   </div>
                   <span className="text-xs font-black text-cyan-400 uppercase tracking-[4px] animate-pulse">Neural Processing...</span>
                </div>
              )}
           </div>
        </div>

        <div className="w-[380px] border-l border-slate-200/60 bg-slate-50/50 backdrop-blur-xl p-8 overflow-y-auto flex flex-col gap-8">
           <section className="space-y-4">
              <div className="flex items-center gap-2 text-cyan-400">
                 <Zap size={14} />
                 <h3 className="text-[10px] font-black uppercase tracking-widest">Configuration</h3>
              </div>
              <div className="space-y-4 bg-white/[0.02] p-4 rounded-2xl border border-slate-200/60">
                <div>
                  <label className="node-label flex justify-between mb-2">Threshold <span className="text-cyan-500">{(nodeData.threshold ?? 0.9).toFixed(2)}</span></label>
                  <input 
                    type="range" min="0" max="1" step="0.01"
                    value={nodeData.threshold ?? 0.9}
                    onChange={(e) => updateNestedData('threshold', parseFloat(e.target.value))}
                    className="w-full h-1.5 accent-cyan-500 bg-white/5 rounded-full appearance-none"
                  />
                </div>
              </div>
           </section>

           <section className="space-y-4">
              <div className="flex items-center gap-2 text-pink-500">
                 <Paintbrush size={14} />
                 <h3 className="text-[10px] font-black uppercase tracking-widest">Refinement</h3>
              </div>
              <div className="space-y-6 bg-white/[0.02] p-6 rounded-2xl border border-slate-200/60">
                <div>
                  <label className="node-label flex justify-between mb-3 uppercase tracking-tighter">Expansion <span className="text-cyan-400 font-mono">{nodeData.expansion ?? 0}px</span></label>
                  <input 
                    type="range" min="-10" max="10" step="1"
                    value={nodeData.expansion ?? 0}
                    onChange={(e) => updateNestedData('expansion', parseInt(e.target.value))}
                    className="w-full h-1.5 accent-cyan-500 bg-white/5 rounded-full appearance-none"
                  />
                </div>

                <div>
                  <label className="node-label flex justify-between mb-3 uppercase tracking-tighter">Feather <span className="text-pink-500 font-mono">{(nodeData.feather ?? 0.6).toFixed(1)}px</span></label>
                  <input 
                    type="range" min="0" max="2" step="0.1"
                    value={nodeData.feather ?? 0.6}
                    onChange={(e) => updateNestedData('feather', parseFloat(e.target.value))}
                    className="w-full h-1.5 accent-pink-500 bg-white/5 rounded-full appearance-none"
                  />
                </div>
              </div>
           </section>

           <div className="mt-auto space-y-4 px-2">
              <div className="flex items-center gap-3 p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl">
                 <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500"><Info size={16} /></div>
                 <div className="flex-1">
                    <p className="text-[9px] font-bold text-amber-500 uppercase">GPU Acceleration Active</p>
                    <p className="text-[8px] text-gray-500">851-labs Professional Engine</p>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};



export const SpaceNode = memo(function SpaceNode({ id, data, selected }: NodeProps) {
  const nodeData = data as BaseNodeData & { 
    outputType?: string, 
    inputType?: string,
    spaceId?: string,
    hasInput?: boolean,
    hasOutput?: boolean,
    internalCategories?: string[]
  };
  const { setNodes } = useReactFlow();
  const spaceId = nodeData.spaceId;

  // Refresh node when returning from an inner space (so preview updates)
  useEffect(() => {
    const onSpaceDataUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.spaceId === spaceId) {
        // Trigger a force-update by touching the node
        setNodes(prev => prev.map(n => n.id === id ? { ...n, data: { ...n.data, _ts: Date.now() } } : n));
      }
    };
    window.addEventListener('space-data-updated', onSpaceDataUpdated);
    return () => window.removeEventListener('space-data-updated', onSpaceDataUpdated);
  }, [id, spaceId, setNodes]);

  const onEnterSpace = () => {
    // This will be handled by the parent component via a custom event or callback
    const targetId = nodeData.spaceId || nodeData.value;
    const event = new CustomEvent('enter-space', { detail: { nodeId: id, spaceId: targetId } });
    window.dispatchEvent(event);
  };

  const getHandleClass = () => {
    switch (nodeData.outputType) {
      case 'brain': return 'handle-brain';
      case 'image': return 'handle-image';
      case 'video': return 'handle-video';
      case 'prompt': return 'handle-prompt';
      case 'mask': return 'handle-mask';
      case 'url': return 'handle-emerald';
      case 'json': return 'handle-sound';
      default: return '';
    }
  };

  const getInputHandleClass = () => {
    switch (nodeData.inputType) {
      case 'brain': return 'handle-brain';
      case 'image': return 'handle-image';
      case 'video': return 'handle-video';
      case 'prompt': return 'handle-prompt';
      case 'mask': return 'handle-mask';
      case 'url': return 'handle-emerald';
      case 'json': return 'handle-sound';
      default: return '';
    }
  };

  const renderInternalIcon = (cat: string) => {
    const key = FOLDDER_INTERNAL_CATEGORY_TO_ICON[cat];
    if (!key) return null;
    return <NodeIcon key={cat} type="space" iconKey={key} size={14} />;
  };

  return (
    <div className="relative" style={{ isolation: 'isolate' }}>
      {/* Ghost card layer 2 (furthest back) */}
      <div className="absolute inset-0 rounded-[18px] border border-white/30"
        style={{
          transform: 'translate(6px, 6px) rotate(1.5deg)',
          background: 'rgba(255,255,255,0.18)',
          zIndex: -2,
        }}
      />
      {/* Ghost card layer 1 */}
      <div className="absolute inset-0 rounded-[18px] border border-white/40"
        style={{
          transform: 'translate(3px, 3px) rotate(0.7deg)',
          background: 'rgba(255,255,255,0.25)',
          zIndex: -1,
        }}
      />

      {/* Main node card */}
      <div className={`custom-node space-node border-cyan-500/30` } style={{ position: 'relative', zIndex: 0 }}>
            <FoldderNodeResizer minWidth={280} minHeight={180} isVisible={selected} />
<NodeLabel id={id} label={nodeData.label} defaultLabel="Space" />
      
      {/* Input handle only if space has an internal InputNode */}
      {nodeData.hasInput !== false && (
        <div className="handle-wrapper handle-left">
          <FoldderDataHandle type="target" position={Position.Left} id="in" dataType={foldderDataTypeFromHandleClass(getInputHandleClass())} />
          <span className="handle-label">Data In</span>
        </div>
      )}
      
      <div className="node-header">
        <NodeIcon
          type="space"
          iconKey={foldderIconKeyForSpaceOutputType(nodeData.outputType)}
          selected={selected}
          size={16}
        />
        <FoldderNodeHeaderTitle className="uppercase" introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}>
          {nodeData.outputType ? `${nodeData.outputType} Space` : 'NESTED SPACE'}
        </FoldderNodeHeaderTitle>
      </div>
      
      <div className="node-content">
        {/* Internal Blueprint Summary */}
        <div className="flex flex-col gap-1.5 mb-3 p-2 bg-slate-50/50 border border-slate-200/60 rounded-xl shadow-inner">
          <div className="flex justify-between items-center px-1">
             <span className="text-[7.5px] font-black text-gray-500 uppercase tracking-widest">Internal Blueprint</span>
             <NodeIcon type="space" iconKey="layout" size={12} />
          </div>
          <div className="flex items-center justify-center gap-3 py-1 min-h-[24px]">
            {nodeData.internalCategories && nodeData.internalCategories.length > 0 ? (
              nodeData.internalCategories.map(cat => renderInternalIcon(cat))
            ) : (
              <span className="text-[8px] text-gray-700 font-bold uppercase tracking-tighter">Initializing...</span>
            )}
          </div>
        </div>

        {/* Output media preview */}
        {nodeData.value && (nodeData.outputType === 'image' || nodeData.outputType === 'video') && (
          <div className="relative w-full aspect-video overflow-hidden rounded-xl mb-3" style={{ background: '#0a0a0a' }}>
            {nodeData.outputType === 'video' ? (
              <video src={nodeData.value as string} className="w-full h-full object-cover" muted />
            ) : (
              <img src={nodeData.value as string} className="w-full h-full object-cover" alt="Space output" />
            )}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 60%)' }} />
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest"
              style={{ background: 'rgba(0,0,0,0.6)', color: FOLDDER_LOGO_BLUE, backdropFilter: 'blur(6px)' }}>
              {nodeData.outputType} output
            </div>
          </div>
        )}
        
        <button 
          onClick={onEnterSpace}
          className="execute-btn w-full flex items-center justify-center gap-2 !py-3 text-[11px] font-black transition-all active:scale-95 group/btn"
        >
          <Maximize2 size={16} className="group-hover/btn:scale-110 transition-transform" /> ENTER SPACE
        </button>
      </div>


      {/* Output handle only if space has an internal OutputNode */}
      {nodeData.hasOutput !== false && (
        <div className="handle-wrapper handle-right">
          <span className="handle-label">Result Out</span>
          <FoldderDataHandle type="source" position={Position.Right} id="out" dataType={foldderDataTypeFromHandleClass(getHandleClass())} />
        </div>
      )}
    </div>
    </div>
  );
});


export const SpaceInputNode = memo(function SpaceInputNode({ id, data, selected }: NodeProps) {
  const nodeData = data as BaseNodeData & { inputType?: string };
  
  const getHandleClass = () => {
    switch (nodeData.inputType) {
      case 'brain': return 'handle-brain';
      case 'image': return 'handle-image';
      case 'video': return 'handle-video';
      case 'prompt': return 'handle-prompt';
      case 'mask': return 'handle-mask';
      case 'url': return 'handle-emerald';
      case 'json': return 'handle-sound';
      default: return 'handle-emerald';
    }
  };

  const logoMediaTheme = {
    border: 'border-[#6C5CE7]/30',
    text: 'text-violet-300',
    bg: 'bg-[#6C5CE7]/10 border-[#6C5CE7]/20',
    icon: 'text-[#6C5CE7]',
  } as const;

  const getThemeColors = () => {
    switch (nodeData.inputType) {
      case 'brain':
        return { border: 'border-fuchsia-500/30', text: 'text-fuchsia-300', bg: 'bg-fuchsia-500/10 border-fuchsia-500/20', icon: 'text-fuchsia-400' };
      case 'prompt':
        return { border: 'border-blue-500/30', text: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', icon: 'text-blue-500' };
      case 'image':
      case 'video':
        return logoMediaTheme;
      default:
        return { border: 'border-emerald-500/30', text: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', icon: 'text-emerald-500' };
    }
  };

  const theme = getThemeColors();

  return (
    <div className={`custom-node space-io-node ${theme.border}`}>
            <FoldderNodeResizer minWidth={200} minHeight={120} isVisible={selected} />
<NodeLabel id={id} label={nodeData.label} defaultLabel="Input" />
      <div className="node-header">
        <NodeIcon type="spaceInput" selected={selected} size={16} />
        <FoldderNodeHeaderTitle introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}>
          SPACE INPUT
        </FoldderNodeHeaderTitle>
      </div>
      <div className="node-content text-center py-4">
        <div className={`w-12 h-12 ${theme.bg} rounded-full flex items-center justify-center border mx-auto mb-2`}>
          <ArrowRight size={24} className={theme.icon} />
        </div>
        <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Entry Point</span>
      </div>
      <div className="handle-wrapper handle-right">
        <FoldderDataHandle type="source" position={Position.Right} id="out" dataType={foldderDataTypeFromHandleClass(getHandleClass())} />
      </div>
    </div>
  );
});

export const SpaceOutputNode = memo(function SpaceOutputNode({ id, data, selected }: NodeProps) {
  const nodeData = data as BaseNodeData & { outputType?: string };
  const nodes = useNodes();
  const edges = useEdges();

  // Find what's connected to the 'in' handle
  const inputEdge = edges.find((e) => e.target === id && e.targetHandle === 'in');
  const sourceNode = inputEdge ? nodes.find((n) => n.id === inputEdge.source) : null;
  const sourceValue: string | undefined = typeof sourceNode?.data?.value === 'string' ? sourceNode.data.value : undefined;
  // Resolve output type: NODE_REGISTRY is most reliable, fallback to data fields
  const nodeType = sourceNode?.type as string | undefined;
  const registryOutputType = nodeType ? (NODE_REGISTRY[nodeType]?.outputs?.[0]?.type ?? '') : '';
  const sourceType: string = registryOutputType || (sourceNode?.data?.outputType as string) || (sourceNode?.data?.type as string) || '';
  const isVisual = sourceType === 'image' || sourceType === 'video';

  const getHandleClass = () => {
    if (sourceType === 'brain') return 'handle-brain';
    if (sourceType === 'image') return 'handle-image';
    if (sourceType === 'video') return 'handle-video';
    if (sourceType === 'prompt') return 'handle-prompt';
    return 'handle-rose';
  };

  const logoMediaTheme = {
    border: 'border-[#6C5CE7]/30',
    text: 'text-violet-300',
    bg: 'bg-[#6C5CE7]/10 border-[#6C5CE7]/20',
    icon: 'text-[#6C5CE7]',
  } as const;

  const getThemeColors = () => {
    if (sourceType === 'brain') return { border: 'border-fuchsia-500/30', text: 'text-fuchsia-300', bg: 'bg-fuchsia-500/10 border-fuchsia-500/20', icon: 'text-fuchsia-400' };
    if (sourceType === 'image' || sourceType === 'video') return logoMediaTheme;
    if (sourceType === 'prompt') return { border: 'border-blue-500/30', text: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', icon: 'text-blue-500' };
    return { border: 'border-rose-500/30', text: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20', icon: 'text-rose-500' };
  };

  const theme = getThemeColors();

  return (
    <div className={`custom-node space-io-node ${theme.border}`} style={{ padding: 0, overflow: 'visible', minWidth: 200 }}>
            <FoldderNodeResizer minWidth={200} minHeight={120} isVisible={selected} />
<NodeLabel id={id} label={nodeData.label} defaultLabel="Output" />

      <div className="handle-wrapper handle-left">
        <FoldderDataHandle type="target" position={Position.Left} id="in" dataType={foldderDataTypeFromHandleClass(getHandleClass())} />
      </div>

      {/* Header */}
      <div className="node-header" style={{ padding: 'calc(10px * 0.7) calc(14px * 0.7)' }}>
        <NodeIcon type="spaceOutput" selected={selected} done={!!inputEdge} size={16} />
        <FoldderNodeHeaderTitle className="tracking-tighter uppercase" introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}>
          Space Output
        </FoldderNodeHeaderTitle>
      </div>

      {/* Media preview if connected visual node */}
      {isVisual && sourceValue ? (
        <div className="relative w-full aspect-video overflow-hidden" style={{ background: '#0a0a0a' }}>
          {sourceType === 'video' ? (
            <video src={sourceValue} className="w-full h-full object-cover" muted />
          ) : (
            <img src={sourceValue} className="w-full h-full object-cover" alt="Output preview" />
          )}
          {/* Type badge */}
          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest"
            style={{ background: 'rgba(0,0,0,0.6)', color: FOLDDER_LOGO_BLUE, backdropFilter: 'blur(6px)' }}>
            {sourceType}
          </div>
        </div>
      ) : (
        <div className="node-content text-center py-4">
          <div className={`w-12 h-12 ${theme.bg} rounded-full flex items-center justify-center border mx-auto mb-2`}>
            <CheckCircle size={24} className={theme.icon} />
          </div>
          <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
            {inputEdge ? 'Connected' : 'Exit Point'}
          </span>
        </div>
      )}
    </div>
  );
});



export const MediaDescriberNode = memo(function MediaDescriberNode({ id, data, selected }: NodeProps) {
  const nodeData = data as BaseNodeData;
  const nodes = useNodes();
  const edges = useEdges();
  const { setNodes } = useReactFlow();
  const [status, setStatus] = useState('idle');
  const [description, setDescription] = useState<string | null>(null);

  const onRun = async () => {
    const inputEdge = edges.find(e => e.target === id && e.targetHandle === 'media');
    const inputNode = nodes.find(n => n.id === inputEdge?.source);
    
    if (!inputNode) return alert("Need media input to describe!");

    setStatus('running');

    const ok = await runAiJobWithNotification({ nodeId: id, label: 'Gemini Describer' }, async () => {
      let finalMediaUrl = inputNode.data?.value as string | undefined;
      let finalMediaType: string;

      if (inputNode.type === 'space') {
        const sd = inputNode.data as { value?: string; outputType?: string; type?: string };
        finalMediaUrl = sd?.value;
        finalMediaType = (sd.outputType || sd.type || 'image') as string;
      } else {
        finalMediaType = ((inputNode.data as { type?: string })?.type || 'image') as string;
      }

      if (!finalMediaUrl) throw new Error("No media URL available to describe.");

      const res = await fetch('/api/spaces/describe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: finalMediaUrl,
          type: finalMediaType,
          metadata: inputNode.data.metadata
        })
      });
      const json = await res.json();

      if (json.description) {
        setDescription(json.description);
        setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, value: json.description } } : n)));
      } else {
        throw new Error(json.error || "Failed to analyze");
      }
    });
    setStatus(ok ? 'success' : 'error');
    if (!ok) console.error("Describe error");
  };

  useRegisterAssistantNodeRun(id, onRun);

  return (
    <div className={`custom-node describer-node ${status === 'running' ? 'node-glow-running' : ''}`} style={{ minWidth: 300 }}>
      <FoldderNodeResizer minWidth={300} minHeight={300} maxWidth={700} maxHeight={720} isVisible={selected} />
      <div className="handle-wrapper handle-left">
        <FoldderDataHandle type="target" position={Position.Left} id="media" dataType="image" />
        <span className="handle-label">Media in</span>
      </div>
      
      <div className="node-header">
        <NodeIcon type="mediaDescriber" selected={selected} state={resolveFoldderNodeState({ loading: status === 'running', done: status === 'success', error: status === 'error' })} size={16} />
        <FoldderNodeHeaderTitle introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}>
          Gemini Describer
        </FoldderNodeHeaderTitle>
        <div className="node-badge">VISION</div>
      </div>
      
      <div className="node-content">
        <p className="text-[10px] text-gray-500 mb-3 italic">Analyze any media and generate a detailed prompt description.</p>
        
        <button className="execute-btn w-full justify-center mb-4" onClick={onRun} disabled={status === 'running'}>
          {status === 'running' ? 'ANALYZING...' : 'GENERATE DESCRIPTION'}
        </button>

        <div className="p-3 bg-slate-50/50 rounded-xl border border-slate-200/60 min-h-[80px]">
          {description ? (
            <div className="text-[10px] text-gray-300 leading-relaxed font-mono">{description}</div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center opacity-20 py-4">
              <Zap size={24} className="mb-2" />
              <span className="text-[8px] font-bold uppercase">Awaiting analysis</span>
            </div>
          )}
        </div>
      </div>

      <div className="handle-wrapper handle-right">
        <span className="handle-label">Description (Prompt)</span>
        <FoldderDataHandle type="source" position={Position.Right} id="prompt" dataType="prompt" />
      </div>
    </div>
  );
});

const CameraMotionSelector = ({
  value,
  onChange,
  compact,
}: {
  value: string;
  onChange: (val: string) => void;
  /** Una fila densa (p. ej. Video Studio fullscreen sin scroll). */
  compact?: boolean;
}) => {
  const motions = [
    { id: '', label: 'Auto', icon: <div className="w-full h-full border border-dashed border-white/20 rounded-md" /> },
    { id: 'Dolly-in', label: 'Dolly-in', icon: (
      <svg viewBox="0 0 40 40" className="w-full h-full">
        <rect x="10" y="10" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1" className="animate-dolly-in" />
        <path d="M5 5 L15 15 M35 5 L25 15 M5 35 L15 25 M35 35 L25 25" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" />
      </svg>
    )},
    { id: 'Dolly-out', label: 'Dolly-out', icon: (
      <svg viewBox="0 0 40 40" className="w-full h-full">
        <rect x="10" y="10" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1" className="animate-dolly-out" />
        <path d="M5 5 L15 15 M35 5 L25 15 M5 35 L15 25 M35 35 L25 25" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" />
      </svg>
    )},
    { id: 'Orbit-Left', label: 'Orbit L', icon: (
      <svg viewBox="0 0 40 40" className="w-full h-full">
        <circle cx="20" cy="20" r="12" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" />
        <circle cx="20" cy="8" r="3" fill="currentColor" className="animate-orbit" />
      </svg>
    )},
    { id: 'Slow-Pan', label: 'Pan', icon: (
      <svg viewBox="0 0 40 40" className="w-full h-full">
        <rect x="5" y="12" width="30" height="16" fill="none" stroke="currentColor" strokeWidth="1" rx="2" />
        <path d="M8 15 L12 15 M15 15 L19 15 M22 15 L26 15" stroke="currentColor" strokeWidth="0.5" className="animate-pan" />
      </svg>
    )},
    { id: 'Crane-Up', label: 'Crane', icon: (
      <svg viewBox="0 0 40 40" className="w-full h-full">
        <rect x="12" y="5" width="16" height="30" fill="none" stroke="currentColor" strokeWidth="1" rx="2" />
        <path d="M15 8 L15 12 M15 15 L15 19 M15 22 L15 26" stroke="currentColor" strokeWidth="0.5" className="animate-crane" />
      </svg>
    )},
  ];

  return (
    <div className={compact ? 'grid grid-cols-6 gap-1' : 'grid grid-cols-3 gap-2'}>
      {motions.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          className={`group flex flex-col items-center border transition-all ${
            compact ? 'gap-0.5 rounded-md p-1' : 'gap-1.5 rounded-xl p-2'
          } ${
            value === m.id
              ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
              : 'bg-white/5 border-slate-200/60 text-zinc-500 hover:border-white/20'
          }`}
        >
          <div
            className={`flex items-center justify-center ${compact ? 'h-6 w-6' : 'h-10 w-10'}`}
          >
            {m.icon}
          </div>
          <span
            className={`font-black uppercase tracking-widest ${compact ? 'text-[5px] leading-tight' : 'text-[7px]'}`}
          >
            {m.label}
          </span>
        </button>
      ))}
    </div>
  );
};

const VEO_ASPECT_OPTIONS = [
  { value: '16:9', label: '16:9 horizontal' },
  { value: '9:16', label: '9:16 vertical' },
] as const;
const SEEDANCE_ASPECT_OPTIONS = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
] as const;
const VEO_RESOLUTION_OPTIONS = [
  { value: '720p', label: '720p (4–8 s)' },
  { value: '1080p', label: '1080p (8 s)' },
  { value: '4K', label: '4K (8 s)' },
] as const;
const VEO_DURATION_OPTIONS = [4, 6, 8] as const;
const SEEDANCE_DURATION_OPTIONS = Array.from({ length: 11 }, (_, i) => i + 2) as number[];

/** Veo: 1080p y 4K solo 8 s en API. 720p: 4 / 6 / 8. */
function veoDurationChoicesForResolution(resolution: string): number[] {
  const r = resolution.toLowerCase();
  if (r.includes('1080') || r.includes('4k')) return [8];
  return [...VEO_DURATION_OPTIONS];
}

function normalizeVeoDuration(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return 6;
  if (n < 5) return 4;
  if (n < 7) return 6;
  return 8;
}

interface GeminiVideoStudioProps {
  onClose: () => void;
  updateData: (key: string, val: unknown) => void;
  onGenerate: () => void;
  status: string;
  progress: number;
  outputVideo: string | null;
  /** Texto del prompt conectado al handle (sin recortar; sincroniza `data.value` del nodo fuente al editar). */
  graphPromptFromEdge: string;
  hasPromptEdge: boolean;
  onGraphPromptChange: (text: string) => void;
  useSeedance: boolean;
  videoFormatForApi: string;
  resolutionForApi: string;
  durationSecondsForApi: number;
  previewCost: { usdPerSecond: number; totalUsd: number };
  preGenProgressPct: number;
  nodeData: BaseNodeData & {
    videoModel?: 'veo31' | 'seedance2';
    videoFormat?: string;
    prompt?: string;
    negativePrompt?: string;
    audio?: boolean;
    seed?: number;
    animationPrompt?: string;
    cameraPreset?: string;
    videoLightingPreset?: string;
    videoVisualStylePreset?: string;
    videoPhysics_cloth?: boolean;
    videoPhysics_fluid?: boolean;
    videoPhysics_hair?: boolean;
    videoPhysics_collision?: boolean;
    videoPhysics_gravity?: boolean;
    videoRefSlots?: VideoRefSlotsState;
  };
  historyUrls: string[];
  /** Imágenes resueltas desde los handles del grafo (firstFrame / lastFrame). */
  connectedFirstFrame: string | null;
  connectedLastFrame: string | null;
  standardShell?: StandardStudioShellConfig;
}

function VideoStudioFrameSlot({
  label,
  url,
  icon: Icon,
}: {
  label: string;
  url: string | null;
  icon: React.ComponentType<{ className?: string; size?: number }>;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center gap-1 text-zinc-500">
        <Icon className="h-3 w-3 shrink-0 text-emerald-500/80" aria-hidden />
        <span className="truncate text-[8px] font-black uppercase tracking-wider">{label}</span>
      </div>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border border-white/[0.1] bg-zinc-950/90 ring-1 ring-inset ring-white/[0.04]">
        {url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full min-h-[3.25rem] flex-col items-center justify-center gap-0.5 px-1 text-center">
            <ImageIcon className="h-4 w-4 text-zinc-700" strokeWidth={1.25} aria-hidden />
            <span className="text-[7px] leading-tight text-zinc-600">—</span>
          </div>
        )}
      </div>
    </div>
  );
}

const GeminiVideoStudio = memo(function GeminiVideoStudio({
  onClose,
  updateData,
  onGenerate,
  status,
  progress,
  outputVideo,
  graphPromptFromEdge,
  hasPromptEdge,
  onGraphPromptChange,
  useSeedance,
  videoFormatForApi,
  resolutionForApi,
  durationSecondsForApi,
  previewCost,
  preGenProgressPct,
  nodeData,
  historyUrls,
  connectedFirstFrame,
  connectedLastFrame,
  standardShell,
}: GeminiVideoStudioProps) {
  useEffect(() => {
    document.body.classList.add('nb-studio-open');
    return () => document.body.classList.remove('nb-studio-open');
  }, []);

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [refsPanelOpen, setRefsPanelOpen] = useState(false);
  const promptLocalRef = useRef<HTMLTextAreaElement>(null);
  const isRunning = status === 'running';
  const hasPrompt =
    graphPromptFromEdge.trim().length > 0 ||
    (typeof nodeData.prompt === 'string' && nodeData.prompt.trim().length > 0);
  const historyPreview = historyUrls.slice(0, 4);
  const historyExtra = Math.max(0, historyUrls.length - historyPreview.length);

  const refSlots = useMemo(() => parseVideoRefSlots(nodeData.videoRefSlots), [nodeData.videoRefSlots]);
  const refFileCounts = useMemo(() => countReferenceFiles(refSlots), [refSlots]);

  const insertIntoPromptLocal = useCallback(
    (snippet: string) => {
      const cur = typeof nodeData.prompt === 'string' ? nodeData.prompt : '';
      const ins = snippet.endsWith(' ') ? snippet : `${snippet} `;
      const el = promptLocalRef.current;
      if (el) {
        const start = el.selectionStart ?? cur.length;
        const end = el.selectionEnd ?? cur.length;
        updateData('prompt', cur.slice(0, start) + ins + cur.slice(end));
        requestAnimationFrame(() => {
          el.focus();
          const pos = start + ins.length;
          el.setSelectionRange(pos, pos);
        });
      } else {
        updateData('prompt', `${cur}${cur && !cur.endsWith(' ') ? ' ' : ''}${ins}`);
      }
    },
    [nodeData.prompt, updateData],
  );

  const setRefSlotFile = useCallback(
    (key: VideoRefSlotKey, file: File | null) => {
      if (!file) {
        const next = { ...refSlots };
        delete next[key];
        updateData('videoRefSlots', Object.keys(next).length ? next : undefined);
        return;
      }
      const maxBytes = 35 * 1024 * 1024;
      if (file.size > maxBytes) {
        alert('Archivo demasiado grande (máx. ~35 MB por slot).');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const next = { ...refSlots, [key]: dataUrl };
        const imgTotal = estimatedApiImageCount({
          graphFirstFrame: connectedFirstFrame,
          graphLastFrame: connectedLastFrame,
          extraSlots: next,
        });
        if (key.startsWith('Image') && imgTotal > SEEDANCE_REF_LIMITS.maxImages) {
          alert(
            `Máximo ${SEEDANCE_REF_LIMITS.maxImages} imágenes en total (primer/último frame del grafo + referencias @Image).`,
          );
          return;
        }
        const c = countReferenceFiles(next);
        if (c.total > SEEDANCE_REF_LIMITS.maxTotal) {
          alert(`Máximo ${SEEDANCE_REF_LIMITS.maxTotal} archivos de referencia por petición.`);
          return;
        }
        if (key.startsWith('Video') && c.videos > SEEDANCE_REF_LIMITS.maxVideos) {
          alert(`Máximo ${SEEDANCE_REF_LIMITS.maxVideos} vídeos de referencia (≤15 s c/u recomendado).`);
          return;
        }
        if (key.startsWith('Audio') && c.audios > SEEDANCE_REF_LIMITS.maxAudios) {
          alert(`Máximo ${SEEDANCE_REF_LIMITS.maxAudios} audios de referencia.`);
          return;
        }
        updateData('videoRefSlots', next);
      };
      reader.readAsDataURL(file);
    },
    [refSlots, connectedFirstFrame, connectedLastFrame, updateData],
  );

  const seedCamIcon = (id: string): React.ComponentType<{ className?: string }> => {
    switch (id) {
      case 'dolly_in':
        return Move;
      case 'tracking':
        return ArrowRight;
      case 'crane_up':
        return ArrowUpFromLine;
      case 'orbit':
        return RefreshCw;
      case 'vertigo':
        return ZoomIn;
      case 'fpv':
        return Plane;
      default:
        return Move;
    }
  };

  const physicIcon = (id: string): React.ComponentType<{ className?: string }> => {
    switch (id) {
      case 'cloth':
        return Layers;
      case 'fluid':
        return Droplets;
      case 'hair':
        return Wind;
      case 'collision':
        return Hammer;
      case 'gravity':
        return CircleDot;
      default:
        return Boxes;
    }
  };

  return createPortal(
    <div
      className="nb-studio-root fixed inset-0 z-[10050] flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden overscroll-none"
      data-foldder-studio-canvas=""
      data-gv-video-studio=""
    >
      {standardShell ? <StandardStudioShellHeader shell={standardShell} /> : null}
      <div className="nb-studio-topbar flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.07] bg-[#08080c] px-2 py-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
          <div className="flex shrink-0 items-center gap-2 border-r border-white/10 pr-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600/35 to-cyan-600/20 ring-1 ring-white/10">
              <Video className="h-[18px] w-[18px] text-violet-200" strokeWidth={1.75} aria-hidden />
            </div>
            <div className="leading-tight">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-100">Studio</p>
              <p className="text-[7px] font-medium text-zinc-500">Vídeo IA</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Motor">
            {(
              [
                {
                  key: 'veo31' as const,
                  label: 'Veo',
                  sub: 'Gemini',
                  Icon: Sparkles,
                  activeBg: 'rgba(34,211,238,0.12)',
                  activeBorder: 'rgba(34,211,238,0.45)',
                  iconColor: '#22d3ee',
                },
                {
                  key: 'seedance2' as const,
                  label: 'Seed',
                  sub: 'Ark',
                  Icon: Film,
                  activeBg: 'rgba(244,114,182,0.12)',
                  activeBorder: 'rgba(244,114,182,0.45)',
                  iconColor: '#f472b6',
                },
              ] as const
            ).map((m) => {
              const active = (nodeData.videoModel || 'veo31') === m.key;
              const Icon = m.Icon;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => {
                    updateData('videoModel', m.key);
                    if (m.key === 'seedance2') {
                      const f = nodeData.videoFormat;
                      const fmt = f === '1:1' || f === '9:16' || f === '16:9' ? f : '16:9';
                      updateData('videoFormat', fmt);
                      updateData(
                        'duration',
                        String(Math.min(12, Math.max(2, Number(nodeData.duration) || 5))),
                      );
                    } else {
                      updateData('videoFormat', nodeData.videoFormat === '9:16' ? '9:16' : '16:9');
                      updateData(
                        'resolution',
                        nodeData.resolution && ['720p', '1080p', '4K'].includes(nodeData.resolution)
                          ? nodeData.resolution
                          : '1080p',
                      );
                      updateData('duration', String(normalizeVeoDuration(nodeData.duration)));
                    }
                  }}
                  title={`${m.label} · ${m.sub}`}
                  className="flex items-center gap-1 rounded-lg border px-2 py-1 transition-all"
                  style={{
                    background: active ? m.activeBg : 'rgba(24,24,32,0.95)',
                    borderColor: active ? m.activeBorder : 'rgba(82,82,91,0.45)',
                    color: active ? '#fafafa' : '#a1a1aa',
                  }}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: active ? m.iconColor : '#71717a' }} />
                  <span className="text-[9px] font-black uppercase tracking-wide">{m.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-black/40 px-1 py-0.5">
            <RectangleHorizontal className="h-3 w-3 shrink-0 text-zinc-500" aria-hidden />
            <select
              className="max-w-[5.5rem] cursor-pointer border-0 bg-transparent py-0 pl-0.5 pr-0 text-[9px] font-bold text-zinc-200 outline-none"
              value={videoFormatForApi}
              onChange={(e) => updateData('videoFormat', e.target.value)}
            >
              {(useSeedance ? SEEDANCE_ASPECT_OPTIONS : VEO_ASPECT_OPTIONS).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.value}
                </option>
              ))}
            </select>
          </div>

          {!useSeedance && (
            <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-black/40 px-1 py-0.5">
              <Cpu className="h-3 w-3 shrink-0 text-zinc-500" aria-hidden />
              <select
                className="max-w-[4.5rem] cursor-pointer border-0 bg-transparent py-0 pl-0.5 pr-0 text-[9px] font-bold text-zinc-200 outline-none"
                value={resolutionForApi}
                onChange={(e) => updateData('resolution', e.target.value)}
              >
                {VEO_RESOLUTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.value}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-black/40 px-1 py-0.5">
            <Clock className="h-3 w-3 shrink-0 text-zinc-500" aria-hidden />
            <select
              className="w-[3.25rem] cursor-pointer border-0 bg-transparent py-0 pl-0.5 pr-0 text-[9px] font-bold text-zinc-200 outline-none"
              value={String(durationSecondsForApi)}
              onChange={(e) => updateData('duration', e.target.value)}
            >
              {(useSeedance
                ? SEEDANCE_DURATION_OPTIONS
                : veoDurationChoicesForResolution(resolutionForApi)
              ).map((sec) => (
                <option key={sec} value={String(sec)}>
                  {sec}s
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-w-0 max-w-[11rem] shrink flex-col gap-0.5 rounded-lg border border-emerald-500/20 bg-emerald-950/15 px-1.5 py-1">
            <div className="flex items-center gap-1">
              <DollarSign className="h-2.5 w-2.5 shrink-0 text-emerald-500/80" aria-hidden />
              <span className="truncate text-[8px] font-mono tabular-nums leading-none text-emerald-400/95">
                {previewCost.usdPerSecond.toFixed(3)}/s · ${previewCost.totalUsd.toFixed(2)}
              </span>
            </div>
            <div className="h-0.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-600/90 to-cyan-500/80 transition-all duration-300"
                style={{ width: `${preGenProgressPct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onGenerate}
            disabled={isRunning || !hasPrompt}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-wide transition-all disabled:cursor-not-allowed disabled:opacity-45"
            style={{
              background: 'linear-gradient(135deg,#6C5CE7,#5548c8)',
              color: '#fafafa',
              border: '1px solid rgba(108,92,231,0.45)',
              boxShadow: '0 2px 10px rgba(108,92,231,0.35)',
            }}
            title={!hasPrompt ? 'Conecta un prompt o rellena el panel' : undefined}
          >
            {isRunning ? (
              <>
                <Loader2 size={14} className="shrink-0 animate-spin" /> {Math.round(progress)}%
              </>
            ) : (
              <>
                <Zap size={14} className="shrink-0" /> Generar
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-zinc-400 transition-all hover:border-white/20 hover:bg-white/[0.09] hover:text-white"
            title="Cerrar"
          >
            <X size={17} strokeWidth={2.25} />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 w-full flex-1 flex-row overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
          <div
            className="flex shrink-0 flex-col overflow-hidden border-r border-white/[0.08] bg-[#08080c]/98 transition-[width] duration-200 ease-out"
            style={{ width: galleryOpen ? 112 : 36 }}
          >
            <button
              type="button"
              onClick={() => setGalleryOpen((o) => !o)}
              className="flex flex-col items-center justify-center gap-0.5 border-b border-white/[0.08] py-2 text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
              title={galleryOpen ? 'Ocultar historial' : 'Historial'}
            >
              <History size={15} strokeWidth={1.75} className="shrink-0 opacity-80" />
              <ChevronRight size={10} className={`shrink-0 opacity-60 transition-transform ${galleryOpen ? 'rotate-180' : ''}`} />
            </button>
            {galleryOpen && (
              <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden p-1.5">
                {historyUrls.length === 0 ? (
                  <p className="px-0.5 text-[7px] leading-tight text-zinc-600">
                    Las versiones aparecen aquí (máx. 4 vista previa).
                  </p>
                ) : (
                  <>
                    {historyPreview.map((url, i) => (
                      <button
                        key={`vh-${i}-${url.slice(0, 48)}`}
                        type="button"
                        onClick={() => {
                          updateData('value', url);
                          updateData('type', 'video');
                        }}
                        className="relative h-12 w-full shrink-0 overflow-hidden rounded-sm border border-white/10 transition-colors hover:border-cyan-500/55"
                        title={`Versión ${historyUrls.length - i}`}
                      >
                        <video src={url} className="h-full w-full object-cover" muted playsInline />
                        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/75 px-0.5 text-[7px] font-bold text-zinc-200">
                          {historyUrls.length - i}
                        </span>
                      </button>
                    ))}
                    {historyExtra > 0 && (
                      <p className="text-center text-[7px] font-mono text-zinc-600">+{historyExtra}</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-[#0a0a0f] p-2">
            {outputVideo ? (
              <video
                src={outputVideo}
                className="max-h-full max-w-full object-contain"
                controls
                loop
                muted
                playsInline
              />
            ) : (
              <div className="flex max-w-xs flex-col items-center justify-center gap-2 px-4 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.06] bg-zinc-900/50">
                  <Video size={28} className="text-zinc-600" strokeWidth={1.15} />
                </div>
                <p className="text-[11px] font-bold text-zinc-500">Sin vídeo</p>
                <p className="flex flex-wrap items-center justify-center gap-1 text-[9px] leading-snug text-zinc-600">
                  <span>Panel derecho</span>
                  <Zap className="h-3 w-3 shrink-0 text-violet-400" aria-hidden />
                  <span>Generar</span>
                </p>
              </div>
            )}
            {isRunning && (
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10">
                <div className="h-0.5 w-full bg-black/50">
                  <div
                    className="h-full bg-gradient-to-r from-[#6C5CE7] to-cyan-400 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="bg-black/85 py-0.5 text-center text-[8px] font-black uppercase tracking-widest text-violet-200">
                  Generando… {Math.round(progress)}%
                </p>
              </div>
            )}
          </div>
        </div>

        <aside className="nb-studio-bottombar flex w-[min(100%,400px)] shrink-0 flex-col overflow-y-auto border-l border-white/[0.09] bg-[#06060a] sm:w-[min(100%,430px)]">
          <div className="sticky top-0 z-[1] flex items-center gap-2 border-b border-white/[0.07] bg-[#07070c]/98 px-2.5 py-2 backdrop-blur-md">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600/30 to-fuchsia-600/15 ring-1 ring-white/10">
              <Sparkles className="h-4 w-4 text-violet-200" strokeWidth={1.75} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-100">Director</p>
              <p className="truncate text-[7px] text-zinc-500">Flujo 1→4 · 7 capas en texto · refuerzos API · cola</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 p-2">
            <details className="group rounded-lg border border-white/[0.07] bg-zinc-950/40">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-2 text-zinc-300 marker:content-none [&::-webkit-details-marker]:hidden">
                <BookOpen className="h-3.5 w-3.5 shrink-0 text-amber-400/95" aria-hidden />
                <span className="text-[9px] font-black uppercase tracking-wider">Guía prompt</span>
                <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-1.5 border-t border-white/[0.05] px-2 pb-2 pt-1.5 text-[8px] leading-snug text-zinc-400">
                <p>
                  <span className="font-bold text-zinc-300">Siete capas:</span> {SEEDANCE_PROMPT_GUIDE_ES.sevenLayersIntro}
                </p>
                <p className="space-y-0.5 text-[7px] leading-snug text-zinc-500">
                  <span className="block text-zinc-400">1 {SEEDANCE_PROMPT_GUIDE_ES.layer1}</span>
                  <span className="block">2 {SEEDANCE_PROMPT_GUIDE_ES.layer2}</span>
                  <span className="block">3 {SEEDANCE_PROMPT_GUIDE_ES.layer3}</span>
                  <span className="block">4 {SEEDANCE_PROMPT_GUIDE_ES.layer4}</span>
                  <span className="block">5 {SEEDANCE_PROMPT_GUIDE_ES.layer5}</span>
                  <span className="block">6 {SEEDANCE_PROMPT_GUIDE_ES.layer6}</span>
                  <span className="block">7 {SEEDANCE_PROMPT_GUIDE_ES.layer7}</span>
                </p>
                <p>
                  <span className="font-bold text-zinc-300">Gestor (cómo encaja):</span> {SEEDANCE_PROMPT_GUIDE_ES.gestorMapping}
                </p>
                <p>
                  <span className="font-bold text-zinc-300">Resumen orden texto:</span> {SEEDANCE_PROMPT_GUIDE_ES.structure}
                </p>
                <p className="rounded bg-black/30 px-1.5 py-1 font-mono text-[6.5px] leading-relaxed text-zinc-500 whitespace-pre-wrap">
                  {DIRECTOR_PROMPT_TEMPLATE_EN}
                </p>
                <p>
                  <span className="font-bold text-zinc-300">Iluminación:</span> {SEEDANCE_PROMPT_GUIDE_ES.lighting}
                </p>
                <p>
                  <span className="font-bold text-zinc-300">Cámara vs sujeto:</span>{' '}
                  {SEEDANCE_PROMPT_GUIDE_ES.cameraVsSubject}
                </p>
                <p>
                  <span className="font-bold text-zinc-300">Ritmo:</span> {SEEDANCE_PROMPT_GUIDE_ES.fastWarning}
                </p>
                <p>
                  <span className="font-bold text-zinc-300">@Reference:</span> {SEEDANCE_PROMPT_GUIDE_ES.references}
                </p>
              </div>
            </details>

            <div className="rounded-md border border-dashed border-white/[0.08] bg-zinc-950/25 px-2 py-1.5">
              <p className="text-[7px] font-bold uppercase tracking-wider text-zinc-500">Orden en el gestor</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-3.5 text-[7px] leading-snug text-zinc-400">
                <li>Medios: frames del grafo y @Refs (sube archivos; luego inserta @ImageN… en el texto, capa 2).</li>
                <li>Texto: prompt del grafo o local en inglés (capas 1–7; puede ir incompleto).</li>
                <li>Refuerzos: presets Luz, Estilo y Física (keywords en inglés tras tu párrafo al generar).</li>
                <li>Cola API: animación → preset cámara → negative (el servidor las concatena al final del prompt).</li>
              </ol>
            </div>

            <div className="space-y-2">
              <p className="px-0.5 text-[7px] font-black uppercase tracking-[0.18em] text-zinc-500">1 · Medios</p>
              <div className="rounded-lg border border-white/[0.06] bg-zinc-950/30 p-2">
                <div className="mb-1.5 flex items-center gap-1.5 text-zinc-500">
                  <ImageIcon className="h-3 w-3 text-cyan-500/80" aria-hidden />
                  <span className="text-[8px] font-black uppercase tracking-wider">Frames grafo</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <VideoStudioFrameSlot label="1º frame" icon={ImageIcon} url={connectedFirstFrame} />
                  <VideoStudioFrameSlot label="Último" icon={ArrowRightCircle} url={connectedLastFrame} />
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-fuchsia-500/15 bg-fuchsia-950/[0.08]">
                <button
                  type="button"
                  aria-expanded={refsPanelOpen}
                  onClick={() => setRefsPanelOpen((v) => !v)}
                  className="flex w-full cursor-pointer items-center justify-between gap-2 px-2 py-2 text-left outline-none ring-fuchsia-500/40 focus-visible:ring-2"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Link className="h-3.5 w-3.5 shrink-0 text-fuchsia-400/90" aria-hidden />
                    <span className="truncate text-[8px] font-black uppercase tracking-wider text-fuchsia-100/90">
                      @Refs
                    </span>
                    <span className="hidden text-[7px] text-zinc-500 sm:inline">img · vídeo · audio</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-[7px] font-mono text-zinc-500">
                      {refFileCounts.total}/{SEEDANCE_REF_LIMITS.maxTotal} · img{' '}
                      {estimatedApiImageCount({
                        graphFirstFrame: connectedFirstFrame,
                        graphLastFrame: connectedLastFrame,
                        extraSlots: refSlots,
                      })}
                      /{SEEDANCE_REF_LIMITS.maxImages}
                    </span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform ${refsPanelOpen ? 'rotate-180' : ''}`}
                      aria-hidden
                    />
                  </div>
                </button>
                {refsPanelOpen ? (
                  <div className="space-y-2 border-t border-white/[0.06] px-2 pb-2 pt-1.5">
                    <p className="text-[7px] leading-tight text-zinc-500">
                      Pulsa <Upload className="inline h-2.5 w-2.5 opacity-70" /> o slot; chip inserta tag en prompt (capa
                      2).
                    </p>
                    <div className="mb-0">
                      <div className="mb-1 flex items-center gap-1 text-[7px] font-bold uppercase tracking-wider text-fuchsia-400/80">
                        <ImageIcon className="h-3 w-3" />
                        Img
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((n) => {
                          const key = `Image${n}` as VideoRefSlotImageKey;
                          const tag = refTag(key);
                          const url = refSlots[key];
                          return (
                            <div key={key} className="min-w-0">
                              <div className="relative aspect-square overflow-hidden rounded-md border border-white/[0.08] bg-zinc-950/90">
                                {url ? (
                                  <img src={url} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full min-h-[2.25rem] flex-col items-center justify-center gap-0.5">
                                    <Upload className="h-3 w-3 text-zinc-600" strokeWidth={1.5} />
                                    <span className="font-mono text-[6px] text-zinc-600">{n}</span>
                                  </div>
                                )}
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="absolute inset-0 cursor-pointer opacity-0"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    setRefSlotFile(key, f ?? null);
                                    e.target.value = '';
                                  }}
                                />
                              </div>
                              {url ? (
                                <div className="mt-0.5 flex justify-center gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() => insertIntoPromptLocal(tag)}
                                    className="rounded bg-fuchsia-600/30 px-1 py-px font-mono text-[6px] font-bold text-fuchsia-100"
                                  >
                                    {tag}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRefSlotFile(key, null)}
                                    className="rounded p-0.5 text-zinc-500 hover:text-rose-400"
                                    title="Quitar"
                                  >
                                    <Trash2 className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="mb-2">
                      <div className="mb-1 flex items-center gap-1 text-[7px] font-bold uppercase tracking-wider text-cyan-400/80">
                        <Film className="h-3 w-3" />
                        Vídeo
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {([1, 2, 3] as const).map((n) => {
                          const key = `Video${n}` as VideoRefSlotVideoKey;
                          const tag = refTag(key);
                          const url = refSlots[key];
                          return (
                            <div key={key} className="min-w-0">
                              <div className="relative flex min-h-[2.5rem] flex-col justify-center rounded-md border border-white/[0.08] bg-zinc-950/90 px-1 py-1">
                                <Film className={`mx-auto h-3 w-3 ${url ? 'text-cyan-400' : 'text-zinc-600'}`} />
                                <input
                                  type="file"
                                  accept="video/*"
                                  className="absolute inset-0 cursor-pointer opacity-0"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    setRefSlotFile(key, f ?? null);
                                    e.target.value = '';
                                  }}
                                />
                              </div>
                              {url ? (
                                <div className="mt-0.5 flex justify-center gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() => insertIntoPromptLocal(tag)}
                                    className="rounded bg-cyan-600/30 px-1 py-px font-mono text-[6px] font-bold text-cyan-100"
                                  >
                                    {tag}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRefSlotFile(key, null)}
                                    className="rounded p-0.5 text-zinc-500 hover:text-rose-400"
                                    title="Quitar"
                                  >
                                    <Trash2 className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center gap-1 text-[7px] font-bold uppercase tracking-wider text-emerald-400/80">
                        <Music className="h-3 w-3" />
                        Audio
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {([1, 2, 3] as const).map((n) => {
                          const key = `Audio${n}` as VideoRefSlotAudioKey;
                          const tag = refTag(key);
                          const url = refSlots[key];
                          return (
                            <div key={key} className="min-w-0">
                              <div className="relative flex min-h-[2.5rem] flex-col justify-center rounded-md border border-white/[0.08] bg-zinc-950/90 px-1 py-1">
                                <Music className={`mx-auto h-3 w-3 ${url ? 'text-emerald-400' : 'text-zinc-600'}`} />
                                <input
                                  type="file"
                                  accept="audio/*"
                                  className="absolute inset-0 cursor-pointer opacity-0"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    setRefSlotFile(key, f ?? null);
                                    e.target.value = '';
                                  }}
                                />
                              </div>
                              {url ? (
                                <div className="mt-0.5 flex justify-center gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() => insertIntoPromptLocal(tag)}
                                    className="rounded bg-emerald-600/30 px-1 py-px font-mono text-[6px] font-bold text-emerald-100"
                                  >
                                    {tag}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRefSlotFile(key, null)}
                                    className="rounded p-0.5 text-zinc-500 hover:text-rose-400"
                                    title="Quitar"
                                  >
                                    <Trash2 className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <p className="px-0.5 text-[7px] font-black uppercase tracking-[0.18em] text-zinc-500">2 · Texto director</p>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/[0.12] p-2">
              <div className="mb-1 flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 text-emerald-400/90" aria-hidden />
                <span className="text-[8px] font-black uppercase tracking-wider text-emerald-200/90">
                  Prompt grafo
                </span>
              </div>
              {hasPromptEdge ? (
                <textarea
                  value={graphPromptFromEdge}
                  onChange={(e) => onGraphPromptChange(e.target.value)}
                  rows={3}
                  className="max-h-36 w-full resize-y rounded-md border border-emerald-500/25 bg-black/30 px-2 py-1.5 text-[10px] leading-snug text-zinc-100 outline-none focus:border-emerald-400/50"
                />
              ) : (
                <div className="flex items-start gap-2 rounded-md border border-dashed border-white/10 bg-black/25 px-2 py-2 text-[9px] leading-snug text-zinc-500">
                  <Link2 className="mt-0.5 h-3 w-3 shrink-0 opacity-40" />
                  Sin cable al Prompt — usa prompt local o conecta un nodo.
                </div>
              )}
            </div>

            <div className="rounded-lg border border-violet-500/15 bg-violet-950/10 p-2">
              <div className="mb-1 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-violet-300/90" aria-hidden />
                <span className="text-[8px] font-black uppercase tracking-wider text-violet-200/90">
                  Prompt local
                </span>
              </div>
              <textarea
                ref={promptLocalRef}
                value={nodeData.prompt ?? ''}
                onChange={(e) => updateData('prompt', e.target.value)}
                rows={4}
                placeholder="Inglés · 7 capas: 1 cámara → 2 sujeto/@Image → 3 acción+físicas → 4 entorno → 5 luz → 6 estilo → 7 locks (puedes acortar)"
                className="w-full resize-y rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-[10px] leading-snug text-zinc-100 placeholder-zinc-600 outline-none focus:border-violet-500/45"
              />
              <div className="mt-2 space-y-2">
                <div className="rounded-md border border-violet-500/25 bg-violet-950/20 px-2 py-1.5">
                  <div className="mb-1 flex items-center gap-1.5">
                    <LayoutTemplate className="h-3.5 w-3.5 text-violet-300" aria-hidden />
                    <span className="text-[8px] font-black uppercase tracking-wider text-violet-100/95">
                      Plantilla de escena
                    </span>
                  </div>
                  <p className="mb-1.5 text-[7px] leading-snug text-zinc-500">
                    Esqueleto en 7 capas (inglés); el gestor añade luz/estilo/física y el preset de cámara al enviar.
                    Puedes borrar líneas que no uses. No sustituye el preset API ni las frases rápidas de cámara.
                  </p>
                  <button
                    type="button"
                    onClick={() => insertIntoPromptLocal(DIRECTOR_PROMPT_TEMPLATE_EN)}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-violet-500/40 bg-violet-950/40 px-2 text-[7px] font-bold uppercase tracking-wide text-violet-100 hover:bg-violet-900/50"
                    title={DIRECTOR_PROMPT_TEMPLATE_EN}
                  >
                    <LayoutTemplate className="h-3 w-3 shrink-0" />
                    Insertar plantilla
                  </button>
                </div>
                <div className="rounded-md border border-cyan-500/25 bg-cyan-950/15 px-2 py-1.5">
                  <div className="mb-1 flex items-center gap-1.5">
                    <Camera className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
                    <span className="text-[8px] font-black uppercase tracking-wider text-cyan-100/95">
                      Frases de cámara (prompt)
                    </span>
                  </div>
                  <p className="mb-1.5 text-[7px] leading-snug text-zinc-500">
                    Atajos que insertan una frase en inglés sobre cómo se mueve la cámara (distinto de la plantilla
                    de escena y del bloque «Cámara (preset)» de la API).
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {SEEDANCE_CAMERA_QUICK_INSERTS.map((c) => {
                      const CamI = seedCamIcon(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          title={`${c.label}: ${c.en}`}
                          onClick={() => insertIntoPromptLocal(c.en + ',')}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-cyan-500/35 bg-cyan-950/30 text-cyan-200/90 hover:bg-cyan-900/45"
                        >
                          <CamI className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              {hasPromptEdge ? (
                <p className="mt-1 flex items-start gap-1 text-[7px] leading-tight text-zinc-500">
                  <Info className="mt-0.5 h-3 w-3 shrink-0 opacity-70" />
                  El grafo tiene prioridad; editar arriba actualiza el nodo fuente.
                </p>
              ) : null}
            </div>
            </div>

            <div className="space-y-2">
              <p className="px-0.5 text-[7px] font-black uppercase tracking-[0.18em] text-zinc-500">3 · Refuerzos API</p>
              <p className="px-0.5 text-[7px] leading-snug text-zinc-600">
                Keywords en inglés tras tu párrafo: refuerzan luz (capa 5), estilo (6) y física (3). Opcional si ya lo
                describes en el texto.
              </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-amber-500/15 bg-amber-950/10 p-2">
                <div className="mb-1 flex items-center gap-1.5">
                  <Sun className="h-3.5 w-3.5 text-amber-400" aria-hidden />
                  <span className="text-[8px] font-black uppercase tracking-wider text-amber-100/90">Luz</span>
                </div>
                <select
                  className="w-full rounded-md border border-white/10 bg-black/45 py-1 pl-1.5 pr-1 text-[9px] text-zinc-100 outline-none focus:border-amber-500/40"
                  value={nodeData.videoLightingPreset ?? ''}
                  onChange={(e) => updateData('videoLightingPreset', e.target.value || undefined)}
                >
                  {VIDEO_LIGHTING_PRESETS.map((p) => (
                    <option key={p.id || 'none'} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-lg border border-sky-500/15 bg-sky-950/10 p-2">
                <div className="mb-1 flex items-center gap-1.5">
                  <Palette className="h-3.5 w-3.5 text-sky-400" aria-hidden />
                  <span className="text-[8px] font-black uppercase tracking-wider text-sky-100/90">Estilo</span>
                </div>
                <select
                  className="w-full rounded-md border border-white/10 bg-black/45 py-1 pl-1.5 pr-1 text-[9px] text-zinc-100 outline-none focus:border-sky-500/40"
                  value={nodeData.videoVisualStylePreset ?? ''}
                  onChange={(e) => updateData('videoVisualStylePreset', e.target.value || undefined)}
                >
                  {VIDEO_VISUAL_STYLE_PRESETS.map((p) => (
                    <option key={p.id || 'none'} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-lg border border-white/[0.06] bg-zinc-950/35 p-2">
              <div className="mb-1.5 flex items-center gap-1.5 text-zinc-500">
                <Boxes className="h-3 w-3 text-zinc-400" aria-hidden />
                <span className="text-[8px] font-black uppercase tracking-wider">Física</span>
              </div>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {VIDEO_PHYSICS_OPTIONS.map((p) => {
                  const PI = physicIcon(p.id);
                  return (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-white/[0.05] bg-black/25 px-1.5 py-1 text-[8px] text-zinc-400 hover:bg-white/[0.03]"
                    >
                      <input
                        type="checkbox"
                        checked={!!(nodeData as Record<string, unknown>)[`videoPhysics_${p.id}`]}
                        onChange={(e) => updateData(`videoPhysics_${p.id}`, e.target.checked)}
                        className="rounded border-zinc-600"
                      />
                      <PI className="h-3 w-3 shrink-0 text-zinc-500" aria-hidden />
                      <span className="leading-tight">{p.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            </div>

            <div className="space-y-2">
              <p className="px-0.5 text-[7px] font-black uppercase tracking-[0.18em] text-zinc-500">4 · Cola API</p>
              <p className="px-0.5 text-[7px] leading-snug text-zinc-600">
                El servidor concatena al final del prompt, en este orden:{' '}
                <span className="text-zinc-500">Animación</span> →{' '}
                <span className="text-zinc-500">Cámara (preset)</span> →{' '}
                <span className="text-zinc-500">Negative</span>. La capa 1 sigue siendo la primera frase de tu texto
                principal.
              </p>

              <div className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-zinc-950/30 p-2 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-1.5">
                    <Move className="h-3 w-3 text-zinc-500" aria-hidden />
                    <span className="text-[8px] font-black uppercase tracking-wider text-zinc-500">Animación (API)</span>
                  </div>
                  <p className="mb-1 text-[7px] leading-snug text-zinc-600">
                    Fragmento extra de movimiento; distinto del preset de cámara y de la capa 1 en el prompt.
                  </p>
                  <input
                    type="text"
                    value={nodeData.animationPrompt ?? ''}
                    onChange={(e) => updateData('animationPrompt', e.target.value)}
                    className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-[10px] text-zinc-100 outline-none focus:border-violet-500/40"
                    placeholder="Opcional (inglés)…"
                  />
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-white/[0.06] bg-black/30 px-2 py-2 text-[8px] text-zinc-400">
                  <input
                    type="checkbox"
                    checked={!!nodeData.audio}
                    onChange={(e) => updateData('audio', e.target.checked)}
                    className="rounded border-zinc-600"
                  />
                  <Music className="h-3.5 w-3.5 text-violet-400/80" />
                  Gen. audio
                </label>
              </div>

              <div className="rounded-lg border border-white/[0.06] bg-zinc-950/35 p-2">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Compass className="h-3.5 w-3.5 text-cyan-400/80" aria-hidden />
                  <span className="text-[8px] font-black uppercase tracking-wider text-zinc-400">Cámara (preset API)</span>
                </div>
                <p className="mb-1.5 text-[7px] leading-snug text-zinc-600">
                  Etiqueta de movimiento que añade el backend; puedes combinarla con la capa 1 del prompt local.
                </p>
                <CameraMotionSelector
                  compact
                  value={nodeData.cameraPreset || ''}
                  onChange={(val) => updateData('cameraPreset', val)}
                />
              </div>

              <div className="rounded-lg border border-rose-500/15 bg-rose-950/10 p-2">
                <div className="mb-1 flex items-center gap-1.5">
                  <Ban className="h-3.5 w-3.5 text-rose-400/85" aria-hidden />
                  <span className="text-[8px] font-black uppercase tracking-wider text-rose-100/90">
                    Negative / exclusión
                  </span>
                </div>
                <p className="mb-1 text-[7px] leading-snug text-zinc-600">
                  Complementa la capa 7 (locks) del texto; el backend lo añade al final como exclusión.
                </p>
                <textarea
                  value={nodeData.negativePrompt ?? ''}
                  onChange={(e) => updateData('negativePrompt', e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] leading-snug text-zinc-100 placeholder-zinc-600 outline-none focus:border-rose-500/35"
                  placeholder="Opcional (inglés)…"
                />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>,
    document.body,
  );
});
GeminiVideoStudio.displayName = 'GeminiVideoStudio';

export const GeminiVideoNode = memo(function GeminiVideoNode({ id, data, selected }: NodeProps) {
  const nodeData = data as BaseNodeData & {
    videoModel?: 'veo31' | 'seedance2';
    videoFormat?: string;
    prompt?: string;
    negativePrompt?: string;
    audio?: boolean;
    seed?: number;
    animationPrompt?: string;
    cameraPreset?: string;
    videoLightingPreset?: string;
    videoVisualStylePreset?: string;
    videoPhysics_cloth?: boolean;
    videoPhysics_fluid?: boolean;
    videoPhysics_hair?: boolean;
    videoPhysics_collision?: boolean;
    videoPhysics_gravity?: boolean;
    videoRefSlots?: VideoRefSlotsState;
  };
  const { setNodes, getEdges, getNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const edges = useEdges();
  const nodes = useNodes();
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<string | null>(nodeData.value || null);
  const [showStudio, setShowStudio] = useState(false);
  const [standardShell, setStandardShell] = useState<StandardStudioShellConfig | null>(null);
  const currentNode = nodes.find((node) => node.id === id);
  const currentFrameNode = useCurrentNodeFrameSnapshot(currentNode);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const openVideoStudioFromPresenter = Boolean(
    (nodeData as { _foldderOpenVideoStudio?: boolean })._foldderOpenVideoStudio,
  );
  useEffect(() => {
    if (!openVideoStudioFromPresenter) return;
    const timer = window.setTimeout(() => {
      setStandardShell(null);
      setShowStudio(true);
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, _foldderOpenVideoStudio: undefined } } : n,
        ),
      );
    }, 140);
    return () => window.clearTimeout(timer);
  }, [id, openVideoStudioFromPresenter, setNodes]);

  useEffect(() => {
    const onOpenStudio = (ev: Event) => {
      const detail = (ev as CustomEvent<FoldderStudioEventDetail>).detail;
      if (detail?.nodeId !== id) return;
      setStandardShell(detail.standardShell ? { ...detail.standardShell, nodeId: id, nodeType: 'geminiVideo', fileId: detail.fileId, appId: detail.appId } : null);
      setShowStudio(true);
    };
    const onCloseStudio = (ev: Event) => {
      const detail = (ev as CustomEvent<FoldderStudioEventDetail>).detail;
      if (detail?.nodeId !== id) return;
      setStandardShell(null);
      setShowStudio(false);
    };
    window.addEventListener('foldder:open-studio', onOpenStudio as EventListener);
    window.addEventListener('foldder-open-node-studio', onOpenStudio as EventListener);
    window.addEventListener('foldder:close-studio', onCloseStudio as EventListener);
    window.addEventListener('foldder-close-node-studio', onCloseStudio as EventListener);
    return () => {
      window.removeEventListener('foldder:open-studio', onOpenStudio as EventListener);
      window.removeEventListener('foldder-open-node-studio', onOpenStudio as EventListener);
      window.removeEventListener('foldder:close-studio', onCloseStudio as EventListener);
      window.removeEventListener('foldder-close-node-studio', onCloseStudio as EventListener);
    };
  }, [id]);

  const useSeedance = nodeData.videoModel === 'seedance2';
  const modelKey = useSeedance ? 'seedance2' : 'veo31';

  const videoFormatForApi = useMemo(() => {
    const f = (nodeData.videoFormat || '16:9').trim();
    if (useSeedance) {
      if (f === '9:16' || f === '1:1' || f === '16:9') return f;
      return '16:9';
    }
    return f === '9:16' ? '9:16' : '16:9';
  }, [nodeData.videoFormat, useSeedance]);

  const resolutionForApi = useMemo(() => {
    const r = nodeData.resolution || '1080p';
    if (['720p', '1080p', '4K'].includes(r)) return r;
    return '1080p';
  }, [nodeData.resolution]);

  const durationSecondsForApi = useMemo(() => {
    if (useSeedance) {
      const n = Math.round(Number(nodeData.duration));
      const d = Number.isFinite(n) ? n : 5;
      return Math.min(12, Math.max(2, d));
    }
    const rl = resolutionForApi.toLowerCase();
    if (rl.includes('1080') || rl.includes('4k')) return 8;
    return normalizeVeoDuration(nodeData.duration);
  }, [nodeData.duration, useSeedance, resolutionForApi]);

  useEffect(() => {
    const nextFmt = videoFormatForApi;
    const nextDur = durationSecondsForApi;
    const nextRes = resolutionForApi;
    const durRaw = nodeData.duration;
    const durMatch =
      durRaw != null &&
      String(durRaw).trim() !== "" &&
      Math.round(Number(durRaw)) === nextDur;
    const fmtMatch = nextFmt === (nodeData.videoFormat || "16:9");
    const resMatch =
      useSeedance || nextRes === (nodeData.resolution || "1080p");
    if (fmtMatch && durMatch && resMatch) {
      return;
    }
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== id) return n;
        return {
          ...n,
          data: {
            ...n.data,
            videoFormat: nextFmt,
            duration: String(nextDur),
            resolution: useSeedance ? n.data.resolution : nextRes,
          },
        };
      }),
    );
  }, [
    id,
    setNodes,
    useSeedance,
    videoFormatForApi,
    durationSecondsForApi,
    resolutionForApi,
    nodeData.videoFormat,
    nodeData.duration,
    nodeData.resolution,
  ]);

  const previewCost = useMemo(
    () =>
      estimateVideoGeneratorPreviewUsd({
        model: modelKey,
        resolution: resolutionForApi,
        durationSec: durationSecondsForApi,
        videoFormat: videoFormatForApi,
      }),
    [modelKey, resolutionForApi, durationSecondsForApi, videoFormatForApi],
  );

  const preGenProgressPct = useMemo(() => {
    const max = useSeedance ? 12 : 8;
    return Math.min(100, (durationSecondsForApi / max) * 100);
  }, [useSeedance, durationSecondsForApi]);
  const videoAspect = parseAspectRatioValue(videoFormatForApi) ?? { width: 16, height: 9 };

  useLayoutEffect(() => {
    const chromeHeight = resolveNodeChromeHeight(frameRef.current, previewRef.current);
    const nextFrame = resolveAspectLockedNodeFrame({
      node: currentFrameNode,
      contentWidth: videoAspect.width,
      contentHeight: videoAspect.height,
      minWidth: 280,
      maxWidth: 960,
      minHeight: 200,
      maxHeight: STUDIO_NODE_MAX_HEIGHT,
      chromeHeight,
    });
    if (!nodeFrameNeedsSync(currentFrameNode, nextFrame)) return;
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? {
              ...node,
              width: nextFrame.width,
              height: nextFrame.height,
              style: { ...node.style, width: nextFrame.width, height: nextFrame.height },
            }
          : node,
      ),
    );
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [
    currentFrameNode,
    id,
    setNodes,
    updateNodeInternals,
    videoAspect.height,
    videoAspect.width,
  ]);

  const displayVideo = useMemo(() => {
    const v = nodeData.value;
    if (typeof v === 'string' && v.length > 0) return v;
    return result;
  }, [nodeData.value, result]);

  const historyUrls = useMemo(() => {
    const raw = (nodeData as { _assetVersions?: unknown })._assetVersions;
    if (!Array.isArray(raw)) return [];
    const urls = raw
      .map((x: unknown) =>
        x &&
        typeof x === 'object' &&
        x !== null &&
        'url' in x &&
        typeof (x as { url: unknown }).url === 'string'
          ? (x as { url: string }).url
          : null,
      )
      .filter((u): u is string => typeof u === 'string' && u.length > 0);
    return [...urls].reverse();
  }, [nodeData]);

  const promptEdge = useMemo(
    () => edges.find((e) => e.target === id && e.targetHandle === 'prompt'),
    [edges, id],
  );

  const graphPromptFromEdge = useMemo(() => {
    if (!promptEdge) return '';
    return String(resolvePromptValueFromEdgeSource(promptEdge, nodes as Node[]) ?? '');
  }, [promptEdge, nodes]);

  const onGraphPromptChange = useCallback(
    (text: string) => {
      if (!promptEdge) return;
      setNodes((nds) => applyPromptValueToEdgeSource(promptEdge, nds as Node[], text));
    },
    [promptEdge, setNodes],
  );

  const connectedFirstFrame = useMemo(() => {
    const edge = edges.find((e) => e.target === id && e.targetHandle === 'firstFrame');
    if (!edge) return null;
    const v = resolvePromptValueFromEdgeSource(edge, nodes as Node[]);
    return typeof v === 'string' && v.trim().length > 0 ? v : null;
  }, [edges, nodes, id]);

  const connectedLastFrame = useMemo(() => {
    const edge = edges.find((e) => e.target === id && e.targetHandle === 'lastFrame');
    if (!edge) return null;
    const v = resolvePromptValueFromEdgeSource(edge, nodes as Node[]);
    return typeof v === 'string' && v.trim().length > 0 ? v : null;
  }, [edges, nodes, id]);

  const hasPrompt =
    graphPromptFromEdge.trim().length > 0 ||
    (typeof nodeData.prompt === 'string' && nodeData.prompt.trim().length > 0);

  const isActivelyGenerating = status === 'running' && progress < 100;

  const onRun = async () => {
    const edges = getEdges();
    const nodes = getNodes();
    
    // Find inputs
    const promptEdge = edges.find((e) => e.target === id && e.targetHandle === 'prompt');
    const firstFrameEdge = edges.find((e) => e.target === id && e.targetHandle === 'firstFrame');
    const lastFrameEdge = edges.find((e) => e.target === id && e.targetHandle === 'lastFrame');
    const negativePromptEdge = edges.find((e) => e.target === id && e.targetHandle === 'negativePrompt');

    const findSourceValue = (edge: typeof promptEdge) => {
      if (!edge) return null;
      const v = resolvePromptValueFromEdgeSource(edge, nodes);
      return v || null;
    };

    const basePrompt = findSourceValue(promptEdge) || nodeData.prompt || "";
    const enhancement = buildDirectorEnhancementSuffix({
      lightingId: nodeData.videoLightingPreset,
      visualStyleId: nodeData.videoVisualStylePreset,
      physics: buildPhysicsFlagsFromNodeData(nodeData as Record<string, unknown>),
    });
    const prompt = mergeBasePromptWithDirectorBlock(basePrompt, enhancement);
    const firstFrame = findSourceValue(firstFrameEdge);
    const lastFrame = findSourceValue(lastFrameEdge);
    const negativePrompt = findSourceValue(negativePromptEdge) || nodeData.negativePrompt;

    if (!basePrompt.trim())
      return alert(
        "Se necesita un Creative Prompt para generar video. Escribe en el panel (7 capas recomendadas) o conecta un nodo de Prompt.",
      );

    const apiPath = useSeedance ? '/api/seedance/video' : '/api/gemini/video';
    const modelLabel = useSeedance ? 'Seedance 2' : 'Gemini Veo 3.1';

    setStatus('running');
    setProgress(0);

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + (100 - prev) * 0.05;
        return next > 99 ? 99 : next;
      });
    }, 2000);

    try {
      const ok = await runAiJobWithNotification(
        { nodeId: id, label: `Video Generator (${modelLabel})` },
        async () => {
        const res = await fetch(apiPath, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            firstFrame,
            lastFrame,
            videoRefSlots: nodeData.videoRefSlots,
            resolution: useSeedance ? videoFormatForApi : resolutionForApi,
            aspectRatio: videoFormatForApi,
            durationSeconds: durationSecondsForApi,
            audio: nodeData.audio || false,
            seed: nodeData.seed,
            negativePrompt: negativePrompt,
            animationPrompt: nodeData.animationPrompt,
            cameraPreset: nodeData.cameraPreset,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Generation failed");
        }

        const json = await res.json();
        if (!json.output) throw new Error("No video output");
        setResult(json.output);
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== id) return n;
            const versions = captureCurrentOutput(
              n.data as Record<string, unknown>,
              json.output as string,
              'graph-run',
            );
            return {
              ...n,
              data: {
                ...n.data,
                value: json.output,
                type: 'video',
                ...(typeof json.key === 'string' ? { s3Key: json.key } : {}),
                _assetVersions: versions,
              },
            };
          }),
        );
      },
      );
      setStatus(ok ? 'success' : 'error');
    } finally {
      clearInterval(progressInterval);
      setProgress(100);
    }
  };

  useRegisterAssistantNodeRun(id, onRun);

  const updateData = (key: string, val: unknown) => {
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, [key]: val } } : n));
  };

  return (
    <div
      ref={frameRef}
      className={`custom-node processor-node group/node ${isActivelyGenerating ? 'node-glow-running' : ''}`}
      style={{ minWidth: 280 }}
    >
      <FoldderNodeResizer minWidth={280} minHeight={200} maxWidth={960} maxHeight={STUDIO_NODE_MAX_HEIGHT} keepAspectRatio isVisible={selected} />
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Video Generator" />

      <div className="handle-wrapper handle-left !top-[20%]">
        <FoldderDataHandle type="target" position={Position.Left} id="firstFrame" dataType="image" />
        <span className="handle-label text-emerald-600">First Frame</span>
      </div>
      <div className="handle-wrapper handle-left !top-[38%]">
        <FoldderDataHandle type="target" position={Position.Left} id="lastFrame" dataType="image" />
        <span className="handle-label text-emerald-600">Last Frame</span>
      </div>
      <div className="handle-wrapper handle-left !top-[56%]">
        <FoldderDataHandle type="target" position={Position.Left} id="prompt" dataType="prompt" />
        <span className="handle-label text-emerald-600">Prompt</span>
      </div>
      <div className="handle-wrapper handle-left !top-[74%]">
        <FoldderDataHandle type="target" position={Position.Left} id="negativePrompt" dataType="prompt" className="border-rose-500/50" />
        <span className="handle-label text-rose-600">Negative</span>
      </div>

      <div className="node-header">
        <NodeIcon
          type="geminiVideo"
          selected={selected}
          state={resolveFoldderNodeState({
            loading: isActivelyGenerating,
            done: !!displayVideo,
            error: status === 'error',
          })}
          size={16}
        />
        <FoldderNodeHeaderTitle
          className="flex-1"
          introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}
        >
          Video Generator
        </FoldderNodeHeaderTitle>
        <div
          className="node-badge max-w-[7rem] truncate"
          title={nodeData.videoModel === 'seedance2' ? 'Seedance 2 (火山方舟)' : 'Gemini Veo 3.1'}
        >
          {nodeData.videoModel === 'seedance2' ? 'SEEDANCE 2' : 'VEO 3.1'}
        </div>
      </div>

      <div
        ref={previewRef}
        className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-b-[24px] bg-[#0a0a0a] group/out"
        style={{ minHeight: 140 }}
      >
        {displayVideo ? (
          <>
            <video
              src={displayVideo}
              className="max-h-full max-w-full object-contain"
              controls
              loop
              muted
              playsInline
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 transition-opacity group-hover/out:opacity-100" />
            <div className="pointer-events-none absolute top-2 left-2 z-20 opacity-0 transition-opacity group-hover/out:opacity-100">
              <span className="rounded bg-black/55 px-1.5 py-0.5 text-[6px] font-black uppercase tracking-widest text-white/75">
                {useSeedance ? videoFormatForApi : resolutionForApi} · {durationSecondsForApi}s
              </span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-6 opacity-30">
            <Video size={32} className="text-zinc-400" />
            <span className="text-center text-[8px] font-black uppercase tracking-widest text-zinc-500">
              Sin vídeo · Studio para opciones
            </span>
          </div>
        )}

        <FoldderStudioModeCenterButton onClick={() => {
          setStandardShell(null);
          setShowStudio(true);
        }} />

        {isActivelyGenerating && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[50]">
            <div className="h-px w-full bg-white/15">
              <div
                className="h-full bg-white transition-all duration-500"
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
            <p className="bg-black/80 px-2 py-1 text-center text-[7px] font-black uppercase tracking-widest text-white/95 backdrop-blur-sm">
              Generando… {Math.round(progress)}%
            </p>
          </div>
        )}
      </div>

      {!showStudio && (
        <div className="nodrag flex shrink-0 border-t border-black/[0.06] bg-white/[0.04] px-2 py-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRun();
            }}
            disabled={isActivelyGenerating || !hasPrompt}
            title={
              !hasPrompt
                ? 'Conecta un prompt o abre Studio y escribe el guion en Prompt local'
                : undefined
            }
            className="execute-btn nodrag w-full !py-2.5 !text-[9px] justify-center disabled:cursor-not-allowed disabled:opacity-40"
          >
            Generar vídeo
          </button>
        </div>
      )}

      {showStudio && (
        <GeminiVideoStudio
          standardShell={standardShell ?? undefined}
          onClose={() => {
            const shell = standardShell;
            setStandardShell(null);
            setShowStudio(false);
            if (shell && typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent(FOLDDER_STANDARD_STUDIO_CLOSE_REQUEST_EVENT, {
                  detail: { nodeId: id, nodeType: 'geminiVideo', fileId: shell.fileId, appId: shell.appId },
                }),
              );
            }
          }}
          updateData={updateData}
          onGenerate={onRun}
          status={status}
          progress={progress}
          outputVideo={displayVideo}
          graphPromptFromEdge={graphPromptFromEdge}
          hasPromptEdge={!!promptEdge}
          onGraphPromptChange={onGraphPromptChange}
          useSeedance={useSeedance}
          videoFormatForApi={videoFormatForApi}
          resolutionForApi={resolutionForApi}
          durationSecondsForApi={durationSecondsForApi}
          previewCost={previewCost}
          preGenProgressPct={preGenProgressPct}
          nodeData={nodeData}
          historyUrls={historyUrls}
          connectedFirstFrame={connectedFirstFrame}
          connectedLastFrame={connectedLastFrame}
        />
      )}

      <div className="handle-wrapper handle-right" style={{ top: '50%' }}>
        <span className="handle-label text-cyan-400">Video Out</span>
        <FoldderDataHandle type="source" position={Position.Right} id="video" dataType="video" />
      </div>
    </div>
  );
});

// --- PAINTER NODE ---
const PAINT_COLORS = [
  { id: 'white',  hex: '#ffffff', label: 'White' },
  { id: 'black',  hex: '#111111', label: 'Black' },
  { id: 'blue',   hex: '#3b82f6', label: 'Blue' },
  { id: 'pink',   hex: '#ec4899', label: 'Pink' },
  { id: 'yellow', hex: '#eab308', label: 'Yellow' },
  { id: 'green',  hex: '#22c55e', label: 'Green' },
];
const PAINT_RATIOS = [
  { label: '1:1',  value: '1:1',  w: 1024, h: 1024 },
  { label: '16:9', value: '16:9', w: 1920, h: 1080 },
  { label: '9:16', value: '9:16', w: 1080, h: 1920 },
];

export const PainterNode = memo(function PainterNode({ id, data, selected }: NodeProps) {
  const { setNodes } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const nodeData = data as BaseNodeData & {
    bgColor?: string; strokeColor?: string; brushSize?: number;
    aspectRatio?: string;
  };

  const baseImageUrl = useMemo(() => {
    const edge = edges.find((e) => e.target === id && e.targetHandle === 'image');
    if (!edge) return null;
    const src = nodes.find((n) => n.id === edge.source);
    const v = src?.data && typeof (src.data as { value?: unknown }).value === 'string'
      ? (src.data as { value: string }).value
      : null;
    if (!v) return null;
    if (v.startsWith('http') || v.startsWith('data:') || v.startsWith('blob:')) return v;
    return null;
  }, [edges, nodes, id]);

  const ratio    = PAINT_RATIOS.find(r => r.value === (nodeData.aspectRatio || '16:9')) || PAINT_RATIOS[1];
  const canvasW  = ratio.w;
  const canvasH  = ratio.h;

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const cursorDotRef = useRef<HTMLDivElement>(null);   // ref-based cursor, no setState
  const isDrawingRef = useRef(false);
  const modeRef      = useRef<'brush'|'eraser'>('brush');
  const colorRef     = useRef('#111111');
  const bgHexRef     = useRef('#111111');
  const brushSizeRef = useRef(10);

  // UI state (controls panel) — these don't trigger canvas re-renders
  const [colorId,    setColorId]    = useState<string>('white');
  const [bgColor,    setBgColor]    = useState<'white'|'black'>(nodeData.bgColor === '#ffffff' ? 'white' : 'black');
  const [brushSize,  setBrushSize]  = useState(nodeData.brushSize || 10);
  const [mode,       setMode]       = useState<'brush'|'eraser'>('brush');
  const [fullscreen, setFullscreen] = useState(false);
  const [standardShell, setStandardShell] = useState<StandardStudioShellConfig | null>(null);

  useEffect(() => {
    if (fullscreen) document.body.classList.add('nb-studio-open');
    else document.body.classList.remove('nb-studio-open');
    return () => document.body.classList.remove('nb-studio-open');
  }, [fullscreen]);

  useEffect(() => {
    const onOpenStudio = (ev: Event) => {
      const detail = (ev as CustomEvent<FoldderStudioEventDetail>).detail;
      if (detail?.nodeId !== id) return;
      setStandardShell(detail.standardShell ? { ...detail.standardShell, nodeId: id, nodeType: 'painter', fileId: detail.fileId, appId: detail.appId } : null);
      setFullscreen(true);
    };
    const onCloseStudio = (ev: Event) => {
      const detail = (ev as CustomEvent<FoldderStudioEventDetail>).detail;
      if (detail?.nodeId !== id) return;
      setStandardShell(null);
      setFullscreen(false);
    };
    window.addEventListener('foldder:open-studio', onOpenStudio as EventListener);
    window.addEventListener('foldder-open-node-studio', onOpenStudio as EventListener);
    window.addEventListener('foldder:close-studio', onCloseStudio as EventListener);
    window.addEventListener('foldder-close-node-studio', onCloseStudio as EventListener);
    return () => {
      window.removeEventListener('foldder:open-studio', onOpenStudio as EventListener);
      window.removeEventListener('foldder-open-node-studio', onOpenStudio as EventListener);
      window.removeEventListener('foldder:close-studio', onCloseStudio as EventListener);
      window.removeEventListener('foldder-close-node-studio', onCloseStudio as EventListener);
    };
  }, [id]);

  // Keep refs in sync with state
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => {
    const hex = PAINT_COLORS.find(c => c.id === colorId)?.hex || '#111111';
    colorRef.current = hex;
  }, [colorId]);
  useEffect(() => { bgHexRef.current = bgColor === 'white' ? '#ffffff' : '#111111'; }, [bgColor]);
  useEffect(() => { brushSizeRef.current = brushSize; }, [brushSize]);

  const bgHex = bgColor === 'white' ? '#ffffff' : '#111111';
  const color = PAINT_COLORS.find(c => c.id === colorId)?.hex || '#111111';

  const updateData = useCallback((key: string, val: unknown) =>
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, [key]: val } } : n))
  , [id, setNodes]);

  const saveToNode = useCallback(() => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL('image/png');
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, value: url, type: 'image' } } : n));
  }, [id, setNodes]);

  // Init canvas — saved `data.value` wins; else optional upstream Base image; else flat fill
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const paintFromUrl = (url: string) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.clearRect(0, 0, canvasW, canvasH);
        ctx.drawImage(img, 0, 0, canvasW, canvasH);
        saveToNode();
      };
      img.onerror = () => {
        ctx.fillStyle = bgHexRef.current;
        ctx.fillRect(0, 0, canvasW, canvasH);
        saveToNode();
      };
      img.src = url;
    };
    if (typeof data.value === 'string' && data.value) {
      paintFromUrl(data.value);
    } else if (baseImageUrl) {
      paintFromUrl(baseImageUrl);
    } else {
      ctx.fillStyle = bgHexRef.current;
      ctx.fillRect(0, 0, canvasW, canvasH);
      saveToNode();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasW, canvasH, fullscreen, baseImageUrl]);

  // Repaint background when bgColor changes (preserving drawing content)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Save current drawing as image
    const snap = canvas.toDataURL();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = bgHexRef.current;
    ctx.fillRect(0, 0, canvasW, canvasH);
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0);
    img.src = snap;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgColor]);

  // ── Drawing handlers (all use refs, never trigger re-render) ──────────────
  const getXY = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvasW / rect.width),
      y: (e.clientY - rect.top)  * (canvasH / rect.height),
    };
  };

  const updateCursorDot = (e: React.PointerEvent, visible: boolean) => {
    const dot = cursorDotRef.current;
    if (!dot || !canvasRef.current) return;
    if (!visible) { dot.style.display = 'none'; return; }
    const rect = canvasRef.current.getBoundingClientRect();
    const cssScale = rect.width / canvasW;
    const sz = brushSizeRef.current * cssScale * (modeRef.current === 'eraser' ? 3 : 1);
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const c = modeRef.current === 'eraser' ? 'rgba(255,255,255,0.7)' : colorRef.current;
    dot.style.display = 'block';
    dot.style.left    = `${x}px`;
    dot.style.top     = `${y}px`;
    dot.style.width   = `${sz}px`;
    dot.style.height  = `${sz}px`;
    dot.style.borderColor = c;
    dot.style.background  = modeRef.current === 'eraser' ? 'rgba(255,255,255,0.1)' : `${colorRef.current}33`;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getXY(e);
    const pressure = e.pressure > 0 ? e.pressure : 1;
    const sz = modeRef.current === 'eraser' ? brushSizeRef.current * 3 : brushSizeRef.current * pressure;
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth   = sz;
    ctx.globalCompositeOperation = modeRef.current === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = modeRef.current === 'eraser' ? bgHexRef.current : colorRef.current;
    ctx.beginPath();
    ctx.moveTo(x, y);
    isDrawingRef.current = true;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    updateCursorDot(e, true);
    if (!isDrawingRef.current) return;
    e.preventDefault(); e.stopPropagation();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getXY(e);
    const pressure = e.pressure > 0 ? e.pressure : 1;
    const sz = modeRef.current === 'eraser' ? brushSizeRef.current * 3 : brushSizeRef.current * pressure;
    ctx.lineWidth = sz;
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const onPointerUp = () => {
    if (!isDrawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) { ctx.closePath(); ctx.globalCompositeOperation = 'source-over'; }
    isDrawingRef.current = false;
    saveToNode();
  };

  const clearCanvas = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = bgHexRef.current;
    ctx.fillRect(0, 0, canvasW, canvasH);
    saveToNode();
  };

  const switchBg = (bg: 'white'|'black') => {
    setBgColor(bg);
    updateData('bgColor', bg === 'white' ? '#ffffff' : '#111111');
  };

  // ── Canvas JSX — shared between node and fullscreen ─────────────────────
  const canvasJSX = (
    <div className="relative w-full nodrag nopan" style={{ cursor: 'none', background: bgHex }}
      onPointerLeave={() => { if (cursorDotRef.current) cursorDotRef.current.style.display = 'none'; }}
    >
      <canvas
        ref={canvasRef}
        width={canvasW}
        height={canvasH}
        className="w-full h-auto block touch-none"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      {/* Cursor circle — updated via ref, never triggers re-render */}
      <div ref={cursorDotRef} style={{
        position: 'absolute', display: 'none',
        borderRadius: '50%', border: '1.5px solid',
        pointerEvents: 'none',
        transform: 'translate(-50%,-50%)',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
      }} />
    </div>
  );

  // ── Controls JSX ──────────────────────────────────────────────────────────
  const controlsJSX = (showFSButton: boolean) => (
    <div className="bg-[#1a1a1a] border-t border-white/10 p-3 space-y-2.5">
      {/* Colors + eraser + clear */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5">
          {PAINT_COLORS.map(c => (
            <button key={c.id} onClick={() => { setColorId(c.id); setMode('brush'); }}
              title={c.label} style={{ background: c.hex }}
              className={`w-5 h-5 rounded-full border-2 transition-all ${colorId === c.id && mode === 'brush' ? 'border-white scale-110 shadow-md' : 'border-transparent opacity-70 hover:opacity-100'}`}
            />
          ))}
        </div>
        <button onClick={() => setMode(mode === 'eraser' ? 'brush' : 'eraser')} title="Eraser"
          className={`ml-1 p-1.5 rounded-lg border transition-all ${mode === 'eraser' ? 'bg-white/20 border-white/40 text-white' : 'bg-white/[0.03] border-white/10 text-zinc-500 hover:text-white'}`}>
          <Eraser size={13} />
        </button>
        <button onClick={clearCanvas} className="ml-auto text-[9px] text-zinc-600 hover:text-red-400 transition-colors font-bold uppercase tracking-widest">Clear</button>
      </div>
      {/* Brush size */}
      <div className="flex items-center gap-2">
        <Paintbrush size={11} className="text-zinc-500 shrink-0" />
        <input type="range" min="1" max="80" value={brushSize}
          onChange={e => { const v = parseInt(e.target.value); setBrushSize(v); updateData('brushSize', v); }}
          className="flex-1 accent-white nodrag" />
        <div style={{
          width: Math.min(Math.max(brushSize / 2, 6), 28),
          height: Math.min(Math.max(brushSize / 2, 6), 28),
          borderRadius: '50%',
          background: mode === 'eraser' ? 'rgba(255,255,255,0.2)' : color,
          border: '1.5px solid rgba(255,255,255,0.3)',
          flexShrink: 0,
        }} />
      </div>
      {/* Ratio + bg + fullscreen toggle */}
      <div className="flex items-center gap-1.5">
        {PAINT_RATIOS.map(r => (
          <button key={r.value} onClick={() => updateData('aspectRatio', r.value)}
            className={`px-2 py-0.5 rounded text-[7px] font-black border transition-all ${ratio.value === r.value ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-white/[0.02] text-zinc-600 border-white/5 hover:text-zinc-400'}`}>
            {r.label}
          </button>
        ))}
        <div className="ml-auto flex gap-1.5 items-center">
          <button onClick={() => switchBg('white')} title="White bg"
            className={`w-5 h-5 rounded border-2 transition-all ${bgColor === 'white' ? 'border-white' : 'border-zinc-600 opacity-50'}`}
            style={{ background: '#ffffff' }} />
          <button onClick={() => switchBg('black')} title="Black bg"
            className={`w-5 h-5 rounded border-2 transition-all ${bgColor === 'black' ? 'border-white' : 'border-zinc-600 opacity-50'}`}
            style={{ background: '#111111' }} />
          {showFSButton && (
            <button onClick={() => {
              setStandardShell(null);
              setFullscreen(true);
            }} className="p-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-zinc-500 hover:text-white transition-colors">
              <Maximize2 size={11} />
            </button>
          )}
          {!showFSButton && (
            <button onClick={() => {
              const shell = standardShell;
              setStandardShell(null);
              setFullscreen(false);
              if (shell && typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent(FOLDDER_STANDARD_STUDIO_CLOSE_REQUEST_EVENT, {
                    detail: { nodeId: id, nodeType: 'painter', fileId: shell.fileId, appId: shell.appId },
                  }),
                );
              }
            }} className="p-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white transition-colors" title="Close fullscreen">
              <X size={11} />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className={`custom-node bg-[#141414] border-amber-900/30` } style={{ padding: 0, overflow: 'visible', minWidth: 280, minHeight: 280 }}>
      <FoldderNodeResizer minWidth={280} minHeight={280} isVisible={selected} />
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Painter" />

      <div className="handle-wrapper handle-left" style={{ top: '50%' }}>
        <FoldderDataHandle type="target" position={Position.Left} id="image" dataType="image" />
        <span className="handle-label">Base</span>
      </div>

      <div className="node-header">
        <NodeIcon type="painter" selected={selected} size={16} />
        <FoldderNodeHeaderTitle introActive={!!(data as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}>
          Painter
        </FoldderNodeHeaderTitle>
        <span className="text-[10px] font-light uppercase tracking-widest text-white/65 ml-auto">{ratio.label}</span>
      </div>

      {/* Small node: preview image only — no painting here */}
      {!fullscreen && (
        <>
          {/* Hidden canvas (still mounts so init effect can run on fullscreen-close restore) */}
          <div style={{ width: 0, height: 0, overflow: 'hidden', position: 'absolute' }}>
            {canvasJSX}
          </div>

          {/* Preview area */}
          <div className="relative w-full bg-[#0a0a0a]" style={{ height: 180 }}>
            {typeof data.value === 'string' && data.value ? (
              <img src={data.value} className="w-full h-full object-contain" alt="Drawing preview" />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2 opacity-30">
                <Pencil size={28} className="text-amber-400" />
                <span className="text-[8px] font-black uppercase tracking-widest text-amber-500">Open to paint</span>
              </div>
            )}

            {/* Fullscreen button — center on hover, always accessible */}
            <button
              onClick={() => {
                setStandardShell(null);
                setFullscreen(true);
              }}
              className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/40 transition-all group"
            >
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 bg-amber-500 text-black px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-lg">
                <Maximize2 size={12} />
                Paint
              </div>
            </button>
          </div>

          {/* Mini footer: ratio badge (read-only) + fullscreen button */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-white/5">
            <span className={`px-1.5 py-0.5 rounded text-[6px] font-black border bg-amber-500/20 text-amber-400 border-amber-500/30`}>
              {ratio.label}
            </span>
            <button onClick={() => {
              setStandardShell(null);
              setFullscreen(true);
            }}
              className="p-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors">
              <Maximize2 size={11} />
            </button>
          </div>
        </>
      )}

      <div className="handle-wrapper handle-right" style={{ top: '50%' }}>
        <span className="handle-label">Output</span>
        <FoldderDataHandle type="source" position={Position.Right} id="image" dataType="image" />
      </div>

      {/* Fullscreen — portal to body so it covers everything */}
      {typeof document !== 'undefined' && fullscreen && createPortal(
        <div
          className="fixed inset-0 flex flex-col bg-[#0a0a0a]"
          style={{ zIndex: 99999 }}
          data-foldder-studio-canvas=""
        >
          {standardShell ? <StandardStudioShellHeader shell={standardShell} /> : null}
          <div className="flex items-center gap-3 px-4 py-2.5 bg-[#1a1a1a] border-b border-white/10">
            <Paintbrush size={14} className="text-amber-400" />
            <span className="text-[10px] font-black text-amber-300 uppercase tracking-widest">Painter — Fullscreen · {ratio.label}</span>
            <button onClick={() => {
              const shell = standardShell;
              setStandardShell(null);
              setFullscreen(false);
              if (shell && typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent(FOLDDER_STANDARD_STUDIO_CLOSE_REQUEST_EVENT, {
                    detail: { nodeId: id, nodeType: 'painter', fileId: shell.fileId, appId: shell.appId },
                  }),
                );
              }
            }} className="ml-auto text-zinc-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden p-4">
            <div style={{ maxWidth: '100%', maxHeight: '100%', aspectRatio: `${canvasW}/${canvasH}`, width: '100%' }}>
              {canvasJSX}
            </div>
          </div>
          {controlsJSX(false)}
        </div>,
        document.body
      )}
    </div>
  );
});


/** `object-contain`: tamaño y offset de la imagen dibujada dentro del contenedor cw×ch */
function containedImageRect(cw: number, ch: number, nw: number, nh: number) {
  const ir = nw / nh;
  const cr = cw / ch;
  if (ir > cr) {
    const dw = cw;
    const dh = cw / ir;
    return { dw, dh, ox: 0, oy: (ch - dh) / 2 };
  }
  const dh = ch;
  const dw = ch * ir;
  return { dw, dh, ox: (cw - dw) / 2, oy: 0 };
}

/** Carga http(s) vía proxy POST (GET ?url= rompe con URLs prefirmadas largas) y devuelve URL lista para <img>. */
async function resolveImageUrlForCanvasCrop(src: string): Promise<string> {
  const trimmed = src.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return trimmed;
  if (trimmed.includes("/api/spaces/proxy") && trimmed.includes("url=")) {
    try {
      const u = new URL(trimmed, typeof window !== "undefined" ? window.location.href : "http://localhost");
      const remote = u.searchParams.get("url");
      if (remote) {
        const blob = await fetchBlobViaSpacesProxy(remote);
        return URL.createObjectURL(blob);
      }
    } catch {
      /* fall through */
    }
    return trimmed;
  }

  let abs = trimmed;
  if (trimmed.startsWith("//") && typeof window !== "undefined") {
    abs = `${window.location.protocol}${trimmed}`;
  }

  try {
    const u = new URL(abs, typeof window !== "undefined" ? window.location.href : "http://localhost");
    if (typeof window !== "undefined" && u.origin === window.location.origin) return abs;
  } catch {
    /* ignore */
  }
  if (/^https?:\/\//i.test(abs)) {
    try {
      const blob = await fetchBlobViaSpacesProxy(abs);
      return URL.createObjectURL(blob);
    } catch {
      return abs;
    }
  }
  return abs;
}

// --- CROP NODE ---
export const CropNode = memo(function CropNode({ id, data, selected }: NodeProps) {
  const { setNodes } = useReactFlow();
  const edges = useEdges();
  const nodes = useNodes();
  
  const nodeData = data as BaseNodeData & { 
    aspectRatio?: string,
    cropConfig?: { x: number, y: number, w: number, h: number }
  };
  
  const [aspectRatio, setAspectRatio] = useState(nodeData.aspectRatio || 'free'); 
  const [crop, setCrop] = useState<CropRect>(nodeData.cropConfig || { x: 10, y: 10, w: 80, h: 80 }); 
  
  const previewRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [draggingAction, setDraggingAction] = useState<'move' | 'nw' | 'ne' | 'sw' | 'se' | null>(null);
  const [dragStartInfo, setDragStartInfo] = useState<{ startX: number, startY: number, initialCrop: CropRect } | null>(null);
  const latestCropRef = useRef(crop);
  useEffect(() => {
    latestCropRef.current = crop;
  }, [crop]);

  const inputEdge = edges.find(e => e.target === id && e.targetHandle === 'image');
  const inputNode = nodes.find(n => n.id === inputEdge?.source);
  const sourceHandle = inputEdge?.sourceHandle;
  const rawValue = sourceHandle 
    ? (inputNode?.data[sourceHandle] || inputNode?.data[`result_${sourceHandle}`] || inputNode?.data.value)
    : inputNode?.data?.value;
    
  const sourceImage = typeof rawValue === 'string' ? rawValue : undefined;

  const updateData = (key: string, val: unknown) => {
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, [key]: val } } : n));
  };
  
  const commitCropRect = useCallback(
    (rect: { x: number; y: number; w: number; h: number }) => {
      if (!sourceImage || !containerRef.current) return;

      void (async () => {
        let loadUrl: string;
        let revokeBlob: string | null = null;
        try {
          loadUrl = await resolveImageUrlForCanvasCrop(sourceImage);
          if (loadUrl.startsWith("blob:")) revokeBlob = loadUrl;
        } catch {
          return;
        }

        const img = new Image();
        if (!loadUrl.startsWith("data:") && !loadUrl.startsWith("blob:")) {
          img.crossOrigin = "anonymous";
        }
        img.onload = () => {
          if (revokeBlob) {
            URL.revokeObjectURL(revokeBlob);
            revokeBlob = null;
          }
          const container = containerRef.current;
          if (!container) return;

          const cw = container.clientWidth;
          const ch = container.clientHeight;
          if (cw < 2 || ch < 2) return;

          const nw = img.naturalWidth;
          const nh = img.naturalHeight;
          if (!nw || !nh) return;

          const { dw, dh, ox, oy } = containedImageRect(cw, ch, nw, nh);

          const cropLeft = (rect.x / 100) * cw;
          const cropTop = (rect.y / 100) * ch;
          const cropWpx = (rect.w / 100) * cw;
          const cropHpx = (rect.h / 100) * ch;

          let sx = ((cropLeft - ox) / dw) * nw;
          let sy = ((cropTop - oy) / dh) * nh;
          let sw = (cropWpx / dw) * nw;
          let sh = (cropHpx / dh) * nh;

          sx = Math.max(0, Math.min(nw - 1, Math.round(sx)));
          sy = Math.max(0, Math.min(nh - 1, Math.round(sy)));
          sw = Math.max(1, Math.min(nw - sx, Math.round(sw)));
          sh = Math.max(1, Math.min(nh - sy, Math.round(sh)));

          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          canvas.width = sw;
          canvas.height = sh;
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

          let croppedDataUrl: string;
          try {
            croppedDataUrl = canvas.toDataURL("image/png");
          } catch (e) {
            console.error("[CropNode] toDataURL failed (CORS/taint?)", e);
            return;
          }

          setNodes((nds) =>
            nds.map((n) =>
              n.id === id
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      value: croppedDataUrl,
                      type: "image",
                      cropConfig: rect,
                      aspectRatio,
                    },
                  }
                : n,
            ),
          );
        };
        img.onerror = () => {
          if (revokeBlob) URL.revokeObjectURL(revokeBlob);
          console.warn("[CropNode] could not load image for cropping", {
            loadUrlPrefix: loadUrl.slice(0, 96),
            sourcePrefix: sourceImage.slice(0, 96),
          });
        };
        img.src = loadUrl;
      })();
    },
    [sourceImage, id, setNodes, aspectRatio],
  );

  useEffect(() => {
    if (!sourceImage) return;
    const t = window.setTimeout(() => {
      commitCropRect(latestCropRef.current);
    }, 150);
    return () => clearTimeout(t);
  }, [commitCropRect, sourceImage]);

  const handlePointerDown = (e: React.PointerEvent, action: 'move' | 'nw' | 'ne' | 'sw' | 'se') => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingAction(action);
    setDragStartInfo({ startX: e.clientX, startY: e.clientY, initialCrop: { ...crop } });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingAction || !dragStartInfo || !containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = containerRef.current.getBoundingClientRect();
    const deltaX = ((e.clientX - dragStartInfo.startX) / rect.width) * 100;
    const deltaY = ((e.clientY - dragStartInfo.startY) / rect.height) * 100;

    let newX = dragStartInfo.initialCrop.x;
    let newY = dragStartInfo.initialCrop.y;
    let newW = dragStartInfo.initialCrop.w;
    let newH = dragStartInfo.initialCrop.h;

    if (draggingAction === 'move') {
      newX = Math.max(0, Math.min(100 - newW, dragStartInfo.initialCrop.x + deltaX));
      newY = Math.max(0, Math.min(100 - newH, dragStartInfo.initialCrop.y + deltaY));
    } else if (draggingAction === 'nw') {
      newX = Math.max(0, Math.min(newX + newW - 5, dragStartInfo.initialCrop.x + deltaX));
      newY = Math.max(0, Math.min(newY + newH - 5, dragStartInfo.initialCrop.y + deltaY));
      newW = dragStartInfo.initialCrop.w - (newX - dragStartInfo.initialCrop.x);
      newH = dragStartInfo.initialCrop.h - (newY - dragStartInfo.initialCrop.y);
    } else if (draggingAction === 'ne') {
      newY = Math.max(0, Math.min(newY + newH - 5, dragStartInfo.initialCrop.y + deltaY));
      newW = Math.max(5, Math.min(100 - newX, dragStartInfo.initialCrop.w + deltaX));
      newH = dragStartInfo.initialCrop.h - (newY - dragStartInfo.initialCrop.y);
    } else if (draggingAction === 'sw') {
      newX = Math.max(0, Math.min(newX + newW - 5, dragStartInfo.initialCrop.x + deltaX));
      newW = dragStartInfo.initialCrop.w - (newX - dragStartInfo.initialCrop.x);
      newH = Math.max(5, Math.min(100 - newY, dragStartInfo.initialCrop.h + deltaY));
    } else if (draggingAction === 'se') {
      newW = Math.max(5, Math.min(100 - newX, dragStartInfo.initialCrop.w + deltaX));
      newH = Math.max(5, Math.min(100 - newY, dragStartInfo.initialCrop.h + deltaY));
    }

    if (newX < 0) newX = 0;
    if (newY < 0) newY = 0;
    if (newX + newW > 100) newW = 100 - newX;
    if (newY + newH > 100) newH = 100 - newY;

    const next = { x: newX, y: newY, w: newW, h: newH };
    latestCropRef.current = next;
    setCrop(next);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingAction) {
      const rect = latestCropRef.current;
      setDraggingAction(null);
      setDragStartInfo(null);
      e.stopPropagation();
      requestAnimationFrame(() => {
        commitCropRect(rect);
      });
    }
  };

  return (
    <div className={`custom-node bg-[#1e1e1e] border-slate-700 w-[340px]` }>
            <FoldderNodeResizer minWidth={320} minHeight={340} isVisible={selected} />
<NodeLabel id={id} label={nodeData.label} defaultLabel="Crop Asset" />
      
      <div className="handle-wrapper handle-left">
        <FoldderDataHandle type="target" position={Position.Left} id="image" dataType="image" />
        <span className="handle-label text-emerald-500">Source Image</span>
      </div>

      <div className="node-content p-3 space-y-3 flex flex-col items-center">
        <div 
          ref={containerRef}
          className="relative bg-black rounded-2xl border border-white/10 overflow-hidden flex items-center justify-center min-h-[150px] w-full touch-none select-none nodrag nopan flex-1 shadow-inner"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {!sourceImage ? (
            <div className="flex flex-col items-center gap-2 opacity-30 p-8">
              <Crop size={24} />
              <span className="text-[9px] uppercase tracking-widest font-black text-center">Connect an image<br/>to crop</span>
            </div>
          ) : (
            <>
              <img
                ref={previewRef}
                src={sourceImage}
                alt="Source"
                className="w-full h-full min-h-0 object-contain pointer-events-none block"
              />
              
              <div className="absolute inset-0 bg-black/40 pointer-events-none"></div>
              
              <div 
                className="absolute border border-amber-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] group/crop cursor-move"
                style={{
                  left: `${crop.x}%`,
                  top: `${crop.y}%`,
                  width: `${crop.w}%`,
                  height: `${crop.h}%`,
                  pointerEvents: draggingAction !== null ? 'none' : 'auto' 
                }}
                onPointerDown={(e) => handlePointerDown(e, 'move')}
              >
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-0 group-hover/crop:opacity-50 transition-opacity">
                   <div className="border-b border-r border-amber-400/40"></div>
                   <div className="border-b border-r border-amber-400/40"></div>
                   <div className="border-b border-amber-400/40"></div>
                   <div className="border-b border-r border-amber-400/40"></div>
                   <div className="border-b border-r border-amber-400/40"></div>
                   <div className="border-b border-amber-400/40"></div>
                   <div className="border-r border-amber-400/40"></div>
                   <div className="border-r border-amber-400/40"></div>
                   <div></div>
                </div>

                <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-amber-500 cursor-nwse-resize pointer-events-auto shadow-sm" onPointerDown={(e) => handlePointerDown(e, 'nw')}></div>
                <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-amber-500 cursor-nesw-resize pointer-events-auto shadow-sm" onPointerDown={(e) => handlePointerDown(e, 'ne')}></div>
                <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-amber-500 cursor-nesw-resize pointer-events-auto shadow-sm" onPointerDown={(e) => handlePointerDown(e, 'sw')}></div>
                <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-amber-500 cursor-nwse-resize pointer-events-auto shadow-sm" onPointerDown={(e) => handlePointerDown(e, 'se')}></div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 w-full pt-2">
           <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Aspect</span>
           <select
             value={aspectRatio}
             onChange={(e) => {
               const v = e.target.value;
               setAspectRatio(v);
               updateData('aspectRatio', v);
               let next = { ...latestCropRef.current };
               if (v === '1:1') next = { x: 25, y: 10, w: 50, h: 80 };
               if (v === '16:9') next = { x: 10, y: 25, w: 80, h: 50 };
               if (v === '9:16') next = { x: 30, y: 10, w: 40, h: 80 };
               latestCropRef.current = next;
               setCrop(next);
               window.setTimeout(() => commitCropRect(next), 0);
             }}
             className="node-input text-[10px] w-full max-w-[140px] nodrag"
           >
             <option value="free">Freeform</option>
             <option value="1:1">1:1 Square</option>
             <option value="16:9">16:9 Wide</option>
             <option value="9:16">9:16 Story</option>
           </select>
        </div>
      </div>

      <div className="handle-wrapper handle-right">
        <span className="handle-label text-cyan-500">Cropped Out</span>
        <FoldderDataHandle type="source" position={Position.Right} id="image" dataType="image" />
      </div>
    </div>
  );
});

export { VfxGeneratorNode } from "./VfxGeneratorNode";
export { DesignerNode } from "./designer/DesignerNode";
export { ProjectBrainNode } from "./ProjectBrainNode";
export { ProjectAssetsNode } from "./ProjectAssetsNode";
export { PresenterNode } from "./presenter/PresenterNode";
