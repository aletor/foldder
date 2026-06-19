"use client";

/* eslint-disable @next/next/no-img-element */

import React, { memo, useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, type ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import { Position, NodeProps, BaseEdge, getSmoothStepPath, EdgeProps, useReactFlow, useStore, useUpdateNodeInternals, useNodes, useEdges, NodeResizer, useNodeId, type Node, type Edge, type ReactFlowState, type ConnectionLineComponentProps } from '@xyflow/react';
import { getSmartOrthogonalPath, type SmartEdgeRect } from './smart-edge-routing';
import {
  Video, 
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
  Layers,
  Link,
  FilePlus,
  Music,
  Info,
  Globe,
  Paintbrush,
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  Eraser,
  Crop,
  Pencil,
  Trash2,
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
  CircleDot,
  Film,
  Cpu,
  Copy,
} from 'lucide-react';
import { StandardStudioShellHeader, type StandardStudioShellConfig } from './StandardStudioShell';
import {
  FoldderStudioHeader,
  foldderStudioHeaderActionClassName,
} from './FoldderStudioHeader';
import {
  FOLDDER_STANDARD_STUDIO_CLOSE_REQUEST_EVENT,
  type FoldderStudioEventDetail,
} from './desktop-studio-events';
import { getNodeGridFrameForType } from './canvas-grid-layout';
import {
  getNodeCardBackgroundColor,
  PROMPT_DEFAULT_CARD_BG,
  PROMPT_MULTI_TARGET_CARD_BG,
} from './node-card-palette';


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
import { FOLDDER_FIT_VIEW_EASE } from '@/lib/fit-view-ease';
import { estimateVideoGeneratorPreviewUsd } from '@/lib/pricing-config';
import { runAiJobWithNotification } from '@/lib/ai-job-notifications';
import { readJsonWithHttpError, sanitizeUserFacingErrorMessage } from '@/lib/read-response-json';
import {
  FOLDDER_WALLET_PREFLIGHT_SKIP_HEADER,
  getOrigWindowFetch,
  runWalletFetchPreflight,
} from '@/lib/wallet-fetch-preflight';
import { isFoldderMediaPreviewAutoFitSuppressed } from '@/lib/media-preview-fit-suppress';
import { fetchBlobViaSpacesProxy } from '@/lib/spaces-proxy-fetch';
import { NODE_REGISTRY } from './nodeRegistry';
import { useRegisterAssistantNodeRun } from './use-assistant-node-run';
import { dispatchFoldderExportCreated } from './foldder-export-events';
import { useProjectAssetsCanvas } from "./project-assets-canvas-context";
import { uploadProjectMediaFile } from "./project-media-s3-save";
import { DEFAULT_EDGE_COLOR, FOLDDER_LOGO_BLUE } from './handle-type-colors';
import { loadVideoDimensions } from './presenter/presenter-video-frame-layout';
import {
  NodeIcon,
  resolveFoldderNodeState,
  FOLDDER_INTERNAL_CATEGORY_TO_ICON,
  type FoldderIconKey,
} from './foldder-icons';
import { NodeLabel, FoldderNodeHeaderTitle, FoldderStudioModeCenterButton } from "./foldder-node-ui";
import { hasFoldderStudioTouched, hasGeminiVideoStudioTouched, touchStudioNodeData } from "./studio-node/foldder-studio-touched";
import { FoldderStudioTouchedMark } from "./studio-node/foldder-studio-touched-mark";
import { DescriberNodeAnalysisOverlay, DESCRIBER_ICON_REVEAL_MS } from "./describer-node-analysis-grid";
import { DESCRIBER_ANALYSIS_CATEGORY_ORDER } from "@/lib/parse-describer-sections";
import {
  loadImageDimensions,
  nodeFrameNeedsSync,
  parseAspectRatioValue,
  resolveAspectLockedNodeFrame,
  resolveNodeChromeHeight,
} from "./studio-node-aspect";
import {
  applyPromptValueToEdgeSource,
  resolvePromptValueFromEdgeSource,
  resolvePromptValueFromEdgeSourceMap,
} from './canvas-group-logic';
import {
  resolveMediaUrlForDescriber,
  resolveMediaUrlFromEdgeSource,
  resolvePhotoRoomDocumentSize,
} from './resolve-connected-media-url';
import { mergeLiveStudioNodeDataIntoNodes, tryLiveDesignerMultipagePdfExport } from './studio-live-documents';
import type { DesignerPageState } from './designer/DesignerNode';
import { getPageDimensions } from './indesign/page-formats';
import { downloadS3Object, forceDownloadUrl, sanitizeDownloadFilename } from '@/lib/browser-download';
import { useAuthedMediaPreviewUrl } from './hooks/use-authed-media-preview-url';
import {
  buildVideoPromptAssembly,
  buildPhysicsFlagsFromNodeData,
  DIRECTOR_PROMPT_TEMPLATE_EN,
  estimatedApiImageCount,
  parseVideoRefSlots,
  refTag,
  SEEDANCE_REF_LIMITS,
  VIDEO_LIGHTING_PRESETS,
  VIDEO_PHYSICS_OPTIONS,
  VIDEO_VISUAL_STYLE_PRESETS,
  type VideoRefSlotImageKey,
  type VideoRefSlotKey,
  type VideoRefSlotsState,
} from '@/lib/video-generator-studio';
import {
  FoldderDataHandle,
  foldderDataTypeFromHandleClass,
  foldderMediaInputDataType,
} from './FoldderDataHandle';
import {
  NotesStickyCard,
  NOTE_MIN_HEIGHT,
  NOTE_WIDTH,
  normalizeNotesNodeData,
} from './NotesSticky';

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

type CropDragAction = 'move' | 'nw' | 'ne' | 'sw' | 'se';
type CropResizeAction = Exclude<CropDragAction, 'move'>;

const CROP_MIN_PERCENT = 5;
const CROP_ASPECT_RATIOS: Record<string, number> = {
  "1:1": 1,
  "16:9": 16 / 9,
  "9:16": 9 / 16,
};

function cropAspectRatioValue(value: string | undefined): number | null {
  if (!value || value === "free") return null;
  return CROP_ASPECT_RATIOS[value] ?? null;
}

function clampCropRect(rect: CropRect): CropRect {
  const w = Math.max(CROP_MIN_PERCENT, Math.min(100, rect.w));
  const h = Math.max(CROP_MIN_PERCENT, Math.min(100, rect.h));
  return {
    x: Math.max(0, Math.min(100 - w, rect.x)),
    y: Math.max(0, Math.min(100 - h, rect.y)),
    w,
    h,
  };
}

function fitCropRectToVisualAspect(rect: CropRect, ratio: number, container: DOMRect): CropRect {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  const cw = Math.max(1, container.width);
  const ch = Math.max(1, container.height);
  const current = clampCropRect(rect);
  const centerX = ((current.x + current.w / 2) / 100) * cw;
  const centerY = ((current.y + current.h / 2) / 100) * ch;
  const maxW = Math.max(1, 2 * Math.min(centerX, cw - centerX));
  const maxH = Math.max(1, 2 * Math.min(centerY, ch - centerY));
  const currentW = Math.max(1, (current.w / 100) * cw);
  const currentH = Math.max(1, (current.h / 100) * ch);
  const currentArea = currentW * currentH;
  let nextW = Math.sqrt(currentArea * safeRatio);
  let nextH = nextW / safeRatio;

  if (nextW > maxW) {
    nextW = maxW;
    nextH = nextW / safeRatio;
  }
  if (nextH > maxH) {
    nextH = maxH;
    nextW = nextH * safeRatio;
  }

  return clampCropRect({
    x: ((centerX - nextW / 2) / cw) * 100,
    y: ((centerY - nextH / 2) / ch) * 100,
    w: (nextW / cw) * 100,
    h: (nextH / ch) * 100,
  });
}

function resizeCropRectToVisualAspect(
  rect: CropRect,
  action: CropResizeAction,
  deltaXPercent: number,
  deltaYPercent: number,
  ratio: number,
  container: DOMRect,
): CropRect {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  const cw = Math.max(1, container.width);
  const ch = Math.max(1, container.height);
  const current = clampCropRect(rect);
  const left = (current.x / 100) * cw;
  const top = (current.y / 100) * ch;
  const width = (current.w / 100) * cw;
  const height = (current.h / 100) * ch;
  const right = left + width;
  const bottom = top + height;
  const dx = (deltaXPercent / 100) * cw;
  const dy = (deltaYPercent / 100) * ch;

  const geometry = {
    nw: { anchorX: right, anchorY: bottom, dragX: left + dx, dragY: top + dy, signX: -1, signY: -1 },
    ne: { anchorX: left, anchorY: bottom, dragX: right + dx, dragY: top + dy, signX: 1, signY: -1 },
    sw: { anchorX: right, anchorY: top, dragX: left + dx, dragY: bottom + dy, signX: -1, signY: 1 },
    se: { anchorX: left, anchorY: top, dragX: right + dx, dragY: bottom + dy, signX: 1, signY: 1 },
  }[action];

  const rawWidth = Math.max(1, geometry.signX * (geometry.dragX - geometry.anchorX));
  const rawHeight = Math.max(1, geometry.signY * (geometry.dragY - geometry.anchorY));
  const maxWidthFromAnchor = geometry.signX > 0 ? cw - geometry.anchorX : geometry.anchorX;
  const maxHeightFromAnchor = geometry.signY > 0 ? ch - geometry.anchorY : geometry.anchorY;
  const maxWidth = Math.max(1, Math.min(maxWidthFromAnchor, maxHeightFromAnchor * safeRatio));
  const minWidth = Math.min(
    maxWidth,
    Math.max((CROP_MIN_PERCENT / 100) * cw, (CROP_MIN_PERCENT / 100) * ch * safeRatio),
  );
  const projectedT = (rawWidth * safeRatio + rawHeight) / (safeRatio * safeRatio + 1);
  const projectedWidth = Number.isFinite(projectedT) ? projectedT * safeRatio : width;
  const nextWidth = Math.max(minWidth, Math.min(maxWidth, projectedWidth));
  const nextHeight = nextWidth / safeRatio;
  const nextLeft = geometry.signX > 0 ? geometry.anchorX : geometry.anchorX - nextWidth;
  const nextTop = geometry.signY > 0 ? geometry.anchorY : geometry.anchorY - nextHeight;

  return clampCropRect({
    x: (nextLeft / cw) * 100,
    y: (nextTop / ch) * 100,
    w: (nextWidth / cw) * 100,
    h: (nextHeight / ch) * 100,
  });
}

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

function syncAspectLockedFrameForNode(
  nodes: Node[],
  id: string,
  nextFrame: { width: number; height: number },
  aspectRatio?: number,
): Node[] {
  let didSync = false;
  const safeAspectRatio =
    typeof aspectRatio === "number" && Number.isFinite(aspectRatio) && aspectRatio > 0
      ? aspectRatio
      : null;
  const nextNodes = nodes.map((node) => {
    if (node.id !== id) return node;
    const needsFrameSync = nodeFrameNeedsSync(node, nextFrame);
    const currentAspectRatio =
      typeof (node.data as { _foldderAspectRatio?: unknown } | undefined)?._foldderAspectRatio === "number"
        ? ((node.data as { _foldderAspectRatio?: number })._foldderAspectRatio ?? null)
        : null;
    const needsAspectSync =
      safeAspectRatio !== null &&
      (currentAspectRatio === null || Math.abs(currentAspectRatio - safeAspectRatio) > 0.0001);
    if (!needsFrameSync && !needsAspectSync) return node;
    didSync = true;
    return {
      ...node,
      ...(needsFrameSync ? { width: nextFrame.width, height: nextFrame.height } : {}),
      ...(needsAspectSync
        ? {
            data: {
              ...node.data,
              _foldderAspectRatio: safeAspectRatio,
            },
          }
        : {}),
      style: needsFrameSync
        ? { ...node.style, width: nextFrame.width, height: nextFrame.height }
        : node.style,
    };
  });

  return didSync ? nextNodes : nodes;
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
    <div className="pointer-events-none absolute bottom-3 right-3 z-[22]">
      <button
        type="button"
        disabled={disabled}
        title="Subir otro archivo y reemplazar el actual"
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onClick();
        }}
        className="media-input-change-button pointer-events-auto nodrag inline-flex items-center gap-1.5 rounded-full border-0 bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-[#3a2a20] shadow-none transition hover:scale-[1.02] hover:bg-[#f7f7f4] disabled:pointer-events-none disabled:opacity-35"
      >
        <Upload size={13} strokeWidth={2.5} className="shrink-0" />
        Change media
      </button>
    </div>
  );
}

/** Tipos de nodo que NO actúan como obstáculo (contenedores). */
const SMART_EDGE_OBSTACLE_SKIP_TYPES = new Set(["canvasGroup"]);

/**
 * Firma compacta de las cajas absolutas de los nodos (redondeada para limitar
 * recomputaciones durante el arrastre). Cambia solo cuando cambian de verdad.
 */
function nodeRectsSignature(state: ReactFlowState): string {
  let sig = "";
  state.nodeLookup.forEach((n) => {
    const t = (n.type ?? "") as string;
    if (SMART_EDGE_OBSTACLE_SKIP_TYPES.has(t)) return;
    const w = n.measured?.width ?? 0;
    const h = n.measured?.height ?? 0;
    if (!w || !h) return;
    const p = n.internals.positionAbsolute;
    sig += `${n.id}|${t}|${Math.round(p.x / 8) * 8}|${Math.round(p.y / 8) * 8}|${Math.round(w)}|${Math.round(h)};`;
  });
  return sig;
}

/** Color heredado por un nodo prompt según el/los nodo(s) a los que alimenta. */
function resolvePromptInheritedColor(
  nodeId: string,
  nodes: Node[],
  edges: ReturnType<typeof useEdges>,
): string | null {
  const targetIds = new Set<string>();
  for (const edge of edges) {
    if (edge.source !== nodeId) continue;
    const handle = edge.sourceHandle ?? "prompt";
    if (handle !== "prompt") continue;
    targetIds.add(edge.target);
  }
  if (targetIds.size === 0) return null;
  if (targetIds.size > 1) return PROMPT_MULTI_TARGET_CARD_BG;
  const targetType = nodes.find((n) => n.id === [...targetIds][0])?.type;
  return getNodeCardBackgroundColor(targetType);
}

/** Tiempo que tarda la bola en recorrer la conexión (s); el ciclo completo dura el doble (viaje + pausa). */
const EDGE_BALL_TRAVEL_S = 2;
/** Separación entre puntos a lo largo del trazado (px de flujo). */
const EDGE_DOT_SPACING = 9;
/** Tope de puntos por conexión (rendimiento en líneas muy largas). */
const EDGE_DOT_MAX = 130;

/** Color realmente mostrado por un nodo (el prompt cambia según a quién alimenta). */
function resolveNodeDisplayColor(
  node: Node | undefined,
  nodes: Node[],
  edges: ReturnType<typeof useEdges>,
): string {
  if (!node?.type) return DEFAULT_EDGE_COLOR;
  if (node.type === "promptInput") {
    const inherited = resolvePromptInheritedColor(node.id, nodes, edges);
    if (inherited) return inherited;
    const override = (node.data as { _foldderCardBg?: string })?._foldderCardBg;
    return override ?? PROMPT_DEFAULT_CARD_BG;
  }
  return getNodeCardBackgroundColor(node.type);
}

export const ButtonEdge = ({
  id,
  source,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  target,
  style = {},
  markerEnd,
}: EdgeProps) => {
  const nodes = useNodes();
  const edges = useEdges();
  const rectsSig = useStore(nodeRectsSignature);

  const smartPath = useMemo(() => {
    const obstacles: SmartEdgeRect[] = [];
    if (rectsSig) {
      for (const part of rectsSig.split(";")) {
        if (!part) continue;
        const fields = part.split("|");
        const nodeId = fields[0];
        if (nodeId === source || nodeId === target) continue;
        obstacles.push({
          x: Number(fields[2]),
          y: Number(fields[3]),
          width: Number(fields[4]),
          height: Number(fields[5]),
        });
      }
    }
    return getSmartOrthogonalPath({
      source: { x: sourceX, y: sourceY, position: sourcePosition },
      target: { x: targetX, y: targetY, position: targetPosition },
      obstacles,
    });
  }, [rectsSig, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition]);

  let edgePath: string;
  if (smartPath) {
    edgePath = smartPath.svgPath;
  } else {
    [edgePath] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: 10,
    });
  }

  const sourceColor = useMemo(
    () => resolveNodeDisplayColor(nodes.find((n) => n.id === source), nodes, edges),
    [nodes, edges, source],
  );

  const targetColor = useMemo(
    () => resolveNodeDisplayColor(nodes.find((n) => n.id === target), nodes, edges),
    [nodes, edges, target],
  );

  const gradientId = `foldder-edge-grad-${id}`;

  // Muestrea el trazado en puntos equiespaciados para dibujar los "puntos" del tubo.
  const measureRef = useRef<SVGPathElement>(null);
  const [dots, setDots] = useState<{ x: number; y: number; t: number }[]>([]);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    let len = 0;
    try {
      len = el.getTotalLength();
    } catch {
      len = 0;
    }
    if (!len || !Number.isFinite(len)) {
      setDots([]);
      return;
    }
    const count = Math.min(EDGE_DOT_MAX, Math.max(2, Math.round(len / EDGE_DOT_SPACING)));
    const step = len / count;
    const next: { x: number; y: number; t: number }[] = [];
    for (let i = 0; i <= count; i++) {
      const d = i * step;
      const p = el.getPointAtLength(d);
      next.push({ x: p.x, y: p.y, t: d / len });
    }
    setDots(next);
  }, [edgePath]);

  return (
    <>
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1={sourceX}
          y1={sourceY}
          x2={targetX}
          y2={targetY}
        >
          <stop offset="0%" stopColor={sourceColor} />
          <stop offset="100%" stopColor={targetColor} />
        </linearGradient>
      </defs>
      {/* Path oculto solo para medir/muestrear el trazado. */}
      <path ref={measureRef} d={edgePath} fill="none" stroke="none" />
      {/* Trazado base invisible: mantiene selección/borrado y el hit-area auto de React Flow. */}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: "transparent",
        }}
      />
      <g className="foldder-edge-dots">
        {dots.map((dot, i) => (
          <circle
            key={i}
            cx={dot.x}
            cy={dot.y}
            r={1.6}
            fill={`url(#${gradientId})`}
            className="foldder-edge-ball-dot"
            style={{ animationDelay: `${(dot.t * EDGE_BALL_TRAVEL_S).toFixed(3)}s` }}
          />
        ))}
      </g>
    </>
  );
};

/**
 * Línea que se ve mientras se arrastra una conexión: mismo sistema rectangular
 * (ortogonal) y de puntos que las conexiones definitivas. Queda ajustada al
 * cursor (= borde derecho del nodo-preview que aparece a la izquierda).
 */
export function FoldderConnectionLine({
  fromX,
  fromY,
  fromPosition,
  toX,
  toY,
  toPosition,
  fromNode,
}: ConnectionLineComponentProps) {
  const rectsSig = useStore(nodeRectsSignature);
  const fromId = fromNode?.id;

  const path = useMemo(() => {
    const obstacles: SmartEdgeRect[] = [];
    if (rectsSig) {
      for (const part of rectsSig.split(";")) {
        if (!part) continue;
        const fields = part.split("|");
        if (fields[0] === fromId) continue;
        obstacles.push({
          x: Number(fields[2]),
          y: Number(fields[3]),
          width: Number(fields[4]),
          height: Number(fields[5]),
        });
      }
    }
    const smart = getSmartOrthogonalPath({
      source: { x: fromX, y: fromY, position: fromPosition },
      target: { x: toX, y: toY, position: toPosition ?? Position.Right },
      obstacles,
    });
    if (smart) return smart.svgPath;
    const [p] = getSmoothStepPath({
      sourceX: fromX,
      sourceY: fromY,
      sourcePosition: fromPosition,
      targetX: toX,
      targetY: toY,
      targetPosition: toPosition ?? Position.Right,
      borderRadius: 10,
    });
    return p;
  }, [rectsSig, fromId, fromX, fromY, fromPosition, toX, toY, toPosition]);

  const color = getNodeCardBackgroundColor(fromNode?.type);

  return (
    <path
      d={path}
      fill="none"
      stroke={color}
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeDasharray="0.1 9"
    />
  );
}

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
  const nodes = useNodes();
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const [loading, setLoading] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const frameSyncKeyRef = useRef<string | null>(null);
  const [activeImageSize, setActiveImageSize] = useState<{ url: string; width: number; height: number } | null>(null);
  
  const urls = nodeData.urls || [];
  const selectedIndex = nodeData.selectedIndex ?? 0;
  const currentUrl = urls[selectedIndex] || nodeData.value || '';
  const currentUrlDisplay = currentUrl.startsWith('data:image/')
    ? 'Imagen embebida'
    : currentUrl;
  const currentNode = nodes.find((node) => node.id === id);

  useEffect(() => {
    if (!currentUrl) {
      frameSyncKeyRef.current = null;
      return;
    }
    let cancelled = false;
    loadImageDimensions(currentUrl)
      .then(({ width, height }) => {
        if (!cancelled) setActiveImageSize({ url: currentUrl, width, height });
      })
      .catch(() => {
        /* keep default square frame if the remote image cannot be measured */
      });
    return () => {
      cancelled = true;
    };
  }, [currentUrl]);

  useLayoutEffect(() => {
    if (!currentUrl || activeImageSize?.url !== currentUrl) return;
    const syncKey = `${currentUrl}:${activeImageSize.width}x${activeImageSize.height}`;
    if (frameSyncKeyRef.current === syncKey) return;
    const nextFrame = resolveAspectLockedNodeFrame({
      node: currentNode,
      contentWidth: activeImageSize.width,
      contentHeight: activeImageSize.height,
      minWidth: 200,
      maxWidth: 960,
      minHeight: 120,
      maxHeight: STUDIO_NODE_MAX_HEIGHT,
      chromeHeight: resolveNodeChromeHeight(frameRef.current, previewFrameRef.current),
    });
    frameSyncKeyRef.current = syncKey;
    setNodes((nds) => syncAspectLockedFrameForNode(nds as Node[], id, nextFrame, activeImageSize.width / activeImageSize.height));
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [activeImageSize, currentNode, currentUrl, id, setNodes, updateNodeInternals]);

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

  const hasPreview = Boolean(currentUrl);
  const URL_IMAGE_TOUCHED_MARK_SRC = "/nodes/url-image-mark.png";

  return (
    <div
      ref={frameRef}
      className={`custom-node url-image-node foldder-node--frameless node--media group/node ${hasPreview ? 'url-image-node--has-preview' : 'url-image-node--empty'} ${loading ? 'node-glow-running' : ''}`}
      style={{
        minWidth: 200,
        minHeight: hasPreview ? 120 : 300,
        "--foldder-frameless-accent": "#383522",
        "--foldder-node-card-bg": "#383522",
      } as React.CSSProperties}
    >
      <FoldderNodeResizer minWidth={200} minHeight={120} maxWidth={960} maxHeight={STUDIO_NODE_MAX_HEIGHT} keepAspectRatio={Boolean(currentUrl)} isVisible={selected} />
      {hasPreview ? <FoldderStudioTouchedMark nodeType="urlImage" backgroundSrc={URL_IMAGE_TOUCHED_MARK_SRC} /> : null}
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Image Search" />
      <div className="node-header">
        <NodeIcon type="urlImage" loading={loading} selected={selected} size={16} />
        <FoldderNodeHeaderTitle className="flex-1" introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}>
          Image Search
        </FoldderNodeHeaderTitle>
        {loading && <Loader2 size={12} className="animate-spin shrink-0" />}
      </div>

      <div ref={previewFrameRef} className="node-content foldder-frameless-main url-image-node-main">
        {!hasPreview ? (
          <img
            src="/nodes/url-image-bg.png"
            alt=""
            className="url-image-node-bg"
            draggable={false}
          />
        ) : null}
        {currentUrl ? (
          <img
            src={currentUrl}
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            alt="Carousel"
          />
        ) : null}

        {loading && (
          <div className="absolute inset-0 z-[7] flex flex-col items-center justify-center gap-2 bg-black/55 backdrop-blur-sm">
            <Loader2 size={22} className="animate-spin text-white/90" />
            <span className="text-[8px] font-black uppercase tracking-[0.25em] text-white/80">Searching Images</span>
          </div>
        )}

        {urls.length > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              className="url-image-carousel-nav url-image-carousel-nav--prev nodrag"
              aria-label="Previous image"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={next}
              className="url-image-carousel-nav url-image-carousel-nav--next nodrag"
              aria-label="Next image"
            >
              <ChevronRight size={16} />
            </button>
            <div className="url-image-carousel-counter nodrag">
              {selectedIndex + 1} / {urls.length}
            </div>
          </>
        )}

        {urls.length > 0 && (
          <div className="url-image-gallery-strip nodrag nopan">
            <div className="url-image-gallery-scroll no-scrollbar">
              {urls.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateData({ selectedIndex: i, value: url, type: 'image' });
                  }}
                  className={`url-image-gallery-thumb nodrag ${i === selectedIndex ? 'is-active' : ''}`}
                >
                  {url ? (
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Link size={10} />
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                updateData({ urls: [...urls, ''] });
              }}
              className="url-image-gallery-add nodrag"
              aria-label="Add URL"
            >
              <Plus size={10} />
            </button>
          </div>
        )}

      </div>

      <div className="url-image-url-dock nodrag nopan">
        <div className="url-image-url-field">
          <Link className="url-image-url-icon" size={14} aria-hidden />
          <input
            type="text"
            className="node-input url-image-url-input nodrag"
            placeholder="Paste URL..."
            value={currentUrlDisplay}
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

      <div className="handle-wrapper handle-right">
        <span className="handle-label">Image Out</span>
        <FoldderDataHandle type="source" position={Position.Right} id="image" dataType="image" />
      </div>
    </div>
  );
});

function formatExportByteSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function inferExportImageFormatLabel(url: string, mimeType?: string | null): string {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.includes("jpeg") || mime.includes("jpg")) return "JPEG";
  if (mime.includes("png")) return "PNG";
  if (mime.includes("webp")) return "WEBP";
  if (mime.includes("gif")) return "GIF";
  if (mime.includes("svg")) return "SVG";
  const lower = url.split("?")[0]?.toLowerCase() ?? "";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "JPEG";
  if (lower.endsWith(".png")) return "PNG";
  if (lower.endsWith(".webp")) return "WEBP";
  if (lower.endsWith(".gif")) return "GIF";
  if (lower.endsWith(".svg")) return "SVG";
  return "IMG";
}

function formatExportAspectRatio(w: number, h: number): string {
  if (w <= 0 || h <= 0) return "—";
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(Math.round(w), Math.round(h));
  return `${Math.round(w / d)}:${Math.round(h / d)}`;
}

function formatExportMegapixels(w: number, h: number): string {
  if (w <= 0 || h <= 0) return "—";
  return `${((w * h) / 1_000_000).toFixed(2)} MP`;
}

function formatExportDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function inferExportVideoFormatLabel(url: string, mimeType?: string | null): string {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.includes("mp4")) return "MP4";
  if (mime.includes("webm")) return "WEBM";
  if (mime.includes("quicktime") || mime.includes("mov")) return "MOV";
  const lower = url.split("?")[0]?.toLowerCase() ?? "";
  if (lower.endsWith(".mp4")) return "MP4";
  if (lower.endsWith(".webm")) return "WEBM";
  if (lower.endsWith(".mov")) return "MOV";
  if (lower.endsWith(".m4v")) return "M4V";
  return "MP4";
}

function loadVideoProbe(videoUrl: string): Promise<{ width: number; height: number; durationSec: number | null }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const done = () => {
      video.removeEventListener("loadedmetadata", onOk);
      video.removeEventListener("error", onErr);
    };
    const onOk = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      const durationSec = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
      done();
      if (width > 0 && height > 0) resolve({ width, height, durationSec });
      else reject(new Error("sin dimensiones de vídeo"));
    };
    const onErr = () => {
      done();
      reject(new Error("no se pudo cargar el vídeo"));
    };
    video.addEventListener("loadedmetadata", onOk);
    video.addEventListener("error", onErr);
    video.src = videoUrl;
  });
}

function resolveVideoSourceHints(sourceNode: Node | null | undefined): {
  durationSec: number | null;
  resolutionLabel: string | null;
  fps: number | null;
  sizeLabel: string | null;
  codec: string | null;
} {
  if (!sourceNode) {
    return { durationSec: null, resolutionLabel: null, fps: null, sizeLabel: null, codec: null };
  }
  const nodeData = sourceNode.data as {
    duration?: string | number;
    resolution?: string;
    fps?: number;
    metadata?: { duration?: string; resolution?: string; fps?: number; size?: string; codec?: string };
  };
  const meta = nodeData.metadata;
  let durationSec: number | null = null;
  const rawDuration = meta?.duration ?? nodeData.duration;
  if (typeof rawDuration === "number" && Number.isFinite(rawDuration) && rawDuration > 0) {
    durationSec = rawDuration;
  } else if (typeof rawDuration === "string") {
    const trimmed = rawDuration.trim().replace(/s$/i, "");
    const parsed = Number.parseFloat(trimmed);
    if (Number.isFinite(parsed) && parsed > 0) durationSec = parsed;
  }
  return {
    durationSec,
    resolutionLabel: meta?.resolution ?? nodeData.resolution ?? null,
    fps: meta?.fps ?? nodeData.fps ?? null,
    sizeLabel: meta?.size ?? null,
    codec: meta?.codec ?? null,
  };
}

const VIDEO_SOURCE_NODE_TYPES = new Set([
  "geminiVideo",
  "grokProcessor",
  "vfxGenerator",
  "videoEditor",
]);

type ImageExportMode = "image" | "designer-pdf" | "video";

function isVideoSourceNode(node: Node | null | undefined): boolean {
  if (!node) return false;
  if (VIDEO_SOURCE_NODE_TYPES.has(node.type ?? "")) return true;
  const nodeData = node.data as { type?: string };
  if (node.type === "mediaInput") return nodeData.type === "video";
  return nodeData.type === "video";
}

function resolveImageExportEdges(edges: Edge[], targetId: string) {
  const inputEdges = edges.filter((e) => e.target === targetId);
  const documentEdge = inputEdges.find((e) => e.targetHandle === "document") ?? null;
  const videoEdge = inputEdges.find((e) => e.targetHandle === "video") ?? null;
  const imageEdge = inputEdges.find((e) => e.targetHandle === "image" || !e.targetHandle) ?? null;
  const activeEdge = documentEdge ?? videoEdge ?? imageEdge ?? null;
  return { documentEdge, videoEdge, imageEdge, activeEdge, inputEdges };
}

function resolveImageExportMode(
  nodes: Node[],
  documentEdge: { source: string } | null,
  videoEdge: { source: string } | null,
  activeEdge: { source: string; targetHandle?: string | null } | null,
): ImageExportMode {
  const documentSource = documentEdge ? nodes.find((n) => n.id === documentEdge.source) : null;
  if (documentSource?.type === "designer") return "designer-pdf";
  const activeSource = activeEdge ? nodes.find((n) => n.id === activeEdge.source) : null;
  if (activeSource?.type === "designer" && activeEdge?.targetHandle !== "video") return "designer-pdf";
  if (videoEdge || activeEdge?.targetHandle === "video" || isVideoSourceNode(activeSource)) return "video";
  return "image";
}

type HeadlessDesignerPdfExportState = {
  designerNodeId: string;
  pages: DesignerPageState[];
  activePageIndex: number;
  filenameBase: string;
  requestId: number;
};

function HeadlessDesignerPdfExportPortal({
  state,
  onDone,
  onError,
  onFinalExport,
}: {
  state: HeadlessDesignerPdfExportState;
  onDone: () => void;
  onError: (err: Error) => void;
  onFinalExport: (detail: Parameters<typeof dispatchFoldderExportCreated>[0]) => void;
}) {
  const [Studio, setStudio] = useState<React.ComponentType<any> | null>(null);
  useEffect(() => {
    void import("./designer/DesignerStudio").then((m) => setStudio(() => m.default));
  }, []);
  if (!Studio) return null;
  return createPortal(
    <Studio
      initialPages={state.pages}
      activePageIndex={state.activePageIndex}
      designerCanvasInstanceKey={state.designerNodeId}
      onClose={onDone}
      onExport={() => {}}
      onUpdatePages={() => {}}
      onFinalExport={(detail: Omit<Parameters<typeof dispatchFoldderExportCreated>[0], "sourceNodeId">) => {
        onFinalExport({ ...detail, sourceNodeId: state.designerNodeId });
      }}
      headlessPdfExport={{
        requestId: state.requestId,
        filenameBase: state.filenameBase,
        onDone,
        onError,
      }}
    />,
    document.body,
  );
}

export const ImageExportNode = memo(function ImageExportNode({ id, data, selected }: NodeProps) {
  const nodes = useNodes();
  const edges = useEdges();
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const [format, setFormat] = useState<'png' | 'jpeg'>('png');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [headlessDesignerExport, setHeadlessDesignerExport] = useState<HeadlessDesignerPdfExportState | null>(null);
  const [detectedSize, setDetectedSize] = useState<{
    url: string;
    w: number;
    h: number;
    measured: boolean;
  } | null>(null);
  const [sourceFileMeta, setSourceFileMeta] = useState<{
    url: string;
    byteSize: number | null;
    mimeType: string | null;
    loading: boolean;
  } | null>(null);
  const [detectedVideoMeta, setDetectedVideoMeta] = useState<{
    url: string;
    w: number;
    h: number;
    durationSec: number | null;
    measured: boolean;
  } | null>(null);
  const [videoFileMeta, setVideoFileMeta] = useState<{
    url: string;
    byteSize: number | null;
    mimeType: string | null;
    loading: boolean;
  } | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const exportVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isExportVideoPlaying, setIsExportVideoPlaying] = useState(false);
  const frameSyncKeyRef = useRef<string | null>(null);
  const exportNode = nodes.find(n => n.id === id);
  const exportNodeStyle = exportNode?.style as React.CSSProperties | undefined;
  const hasManualExportFrame = typeof exportNodeStyle?.height === 'number' || typeof exportNodeStyle?.height === 'string';

  const mergedNodes = useMemo(() => mergeLiveStudioNodeDataIntoNodes(nodes), [nodes]);
  const { documentEdge, videoEdge, imageEdge, activeEdge } = useMemo(
    () => resolveImageExportEdges(edges, id),
    [edges, id],
  );
  const exportMode = useMemo(
    () => resolveImageExportMode(mergedNodes, documentEdge, videoEdge, activeEdge),
    [mergedNodes, documentEdge, videoEdge, activeEdge],
  );
  const sourceEdge = exportMode === "video"
    ? (videoEdge ?? activeEdge)
    : exportMode === "designer-pdf"
      ? (documentEdge ?? imageEdge ?? activeEdge)
      : (imageEdge ?? activeEdge);
  const sourceNode = sourceEdge ? mergedNodes.find(n => n.id === sourceEdge.source) : null;
  const designerNode = useMemo(() => {
    if (documentEdge) {
      const node = mergedNodes.find((n) => n.id === documentEdge.source);
      if (node?.type === "designer") return node;
    }
    if (imageEdge) {
      const node = mergedNodes.find((n) => n.id === imageEdge.source);
      if (node?.type === "designer") return node;
    }
    return null;
  }, [mergedNodes, documentEdge, imageEdge]);
  const designerPages = useMemo(() => {
    if (!designerNode) return [] as DesignerPageState[];
    const nodeData = designerNode.data as { pages?: DesignerPageState[]; activePageIndex?: number };
    return Array.isArray(nodeData.pages) && nodeData.pages.length > 0 ? nodeData.pages : [];
  }, [designerNode]);
  const designerActivePageIndex = useMemo(() => {
    if (!designerNode) return 0;
    const nodeData = designerNode.data as { activePageIndex?: number };
    return Math.min(Math.max(0, nodeData.activePageIndex ?? 0), Math.max(0, designerPages.length - 1));
  }, [designerNode, designerPages.length]);
  const designerPageDims = useMemo(() => {
    const page = designerPages[designerActivePageIndex] ?? designerPages[0];
    if (!page) return null;
    return getPageDimensions(page);
  }, [designerPages, designerActivePageIndex]);
  const documentSize = exportMode === "image" ? resolvePhotoRoomDocumentSize(sourceNode) : null;

  const resolvedImageUrl = useMemo(() => {
    if (exportMode === "video") {
      const edge = videoEdge ?? (isVideoSourceNode(sourceNode) ? sourceEdge : null);
      if (!edge) return "";
      return resolveMediaUrlFromEdgeSource(edge, mergedNodes, edges).trim();
    }
    if (exportMode === "designer-pdf") {
      const thumb = typeof designerNode?.data?.value === "string" ? designerNode.data.value.trim() : "";
      if (thumb) return thumb;
      if (!imageEdge) return "";
      return resolveMediaUrlFromEdgeSource(imageEdge, mergedNodes, edges).trim();
    }
    if (!sourceEdge) return "";
    return resolveMediaUrlFromEdgeSource(sourceEdge, mergedNodes, edges).trim();
  }, [exportMode, videoEdge, sourceNode, sourceEdge, mergedNodes, edges, designerNode, imageEdge]);

  const layers = useMemo(() => {
    if (exportMode !== "image" || !sourceNode || !resolvedImageUrl) return [];
    const sourceData = sourceNode.data as Record<string, unknown>;
    const s3Key = typeof sourceData.s3Key === "string" ? sourceData.s3Key : undefined;
    return [{
      type: sourceNode.type,
      value: s3Key ? undefined : resolvedImageUrl,
      s3Key,
    }].filter(l => l.value || l.s3Key);
  }, [exportMode, resolvedImageUrl, sourceNode]);

  const imageUrl = exportMode === "image" ? (resolvedImageUrl || undefined) : undefined;
  const videoUrl = exportMode === "video" ? (resolvedImageUrl || undefined) : undefined;
  const designerPreviewUrl = exportMode === "designer-pdf" ? (resolvedImageUrl || undefined) : undefined;
  const activeDetectedSize =
    imageUrl && detectedSize?.url === imageUrl ? detectedSize : null;
  useEffect(() => {
    if (!imageUrl) {
      setDetectedSize(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setDetectedSize({
          url: imageUrl,
          w: img.naturalWidth,
          h: img.naturalHeight,
          measured: true,
        });
      }
    };
    img.onerror = () => {
      if (documentSize) {
        setDetectedSize({
          url: imageUrl,
          w: documentSize.w,
          h: documentSize.h,
          measured: false,
        });
      }
    };
    img.src = imageUrl;
  }, [documentSize, imageUrl]);

  useEffect(() => {
    if (!imageUrl || exportMode !== "image") {
      setSourceFileMeta(null);
      return;
    }

    let cancelled = false;

    const finish = (byteSize: number | null, mimeType: string | null) => {
      if (!cancelled) {
        setSourceFileMeta({ url: imageUrl, byteSize, mimeType, loading: false });
      }
    };

    setSourceFileMeta({ url: imageUrl, byteSize: null, mimeType: null, loading: true });

    if (imageUrl.startsWith("data:")) {
      const commaIndex = imageUrl.indexOf(",");
      const header = commaIndex >= 0 ? imageUrl.slice(0, commaIndex) : imageUrl;
      const payload = commaIndex >= 0 ? imageUrl.slice(commaIndex + 1) : "";
      const mimeType = header.match(/^data:([^;,]+)/i)?.[1] ?? null;
      if (header.includes(";base64") && payload) {
        const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
        finish(Math.max(0, Math.floor((payload.length * 3) / 4) - padding), mimeType);
      } else {
        finish(payload.length, mimeType);
      }
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        const headRes = await fetch(imageUrl, { method: "HEAD", credentials: "same-origin" });
        const contentLength = headRes.headers.get("content-length");
        const mimeType = headRes.headers.get("content-type");
        if (contentLength) {
          const byteSize = Number.parseInt(contentLength, 10);
          if (Number.isFinite(byteSize) && byteSize > 0) {
            finish(byteSize, mimeType);
            return;
          }
        }
      } catch {
        /* fall through to GET */
      }

      try {
        const res = await fetch(imageUrl, { credentials: "same-origin" });
        const blob = await res.blob();
        finish(blob.size, blob.type || res.headers.get("content-type"));
      } catch {
        finish(null, null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [exportMode, imageUrl]);

  useEffect(() => {
    if (exportMode !== "video" || !videoUrl) {
      setDetectedVideoMeta(null);
      return;
    }
    let cancelled = false;
    void loadVideoProbe(videoUrl)
      .then(({ width, height, durationSec }) => {
        if (!cancelled) {
          setDetectedVideoMeta({
            url: videoUrl,
            w: width,
            h: height,
            durationSec,
            measured: true,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetectedVideoMeta({
            url: videoUrl,
            w: 1920,
            h: 1080,
            durationSec: null,
            measured: false,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [exportMode, videoUrl]);

  useEffect(() => {
    if (exportMode !== "video" || !videoUrl) {
      setVideoFileMeta(null);
      return;
    }

    let cancelled = false;

    const finish = (byteSize: number | null, mimeType: string | null) => {
      if (!cancelled) {
        setVideoFileMeta({ url: videoUrl, byteSize, mimeType, loading: false });
      }
    };

    setVideoFileMeta({ url: videoUrl, byteSize: null, mimeType: null, loading: true });

    if (videoUrl.startsWith("data:")) {
      const commaIndex = videoUrl.indexOf(",");
      const header = commaIndex >= 0 ? videoUrl.slice(0, commaIndex) : videoUrl;
      const payload = commaIndex >= 0 ? videoUrl.slice(commaIndex + 1) : "";
      const mimeType = header.match(/^data:([^;,]+)/i)?.[1] ?? null;
      if (header.includes(";base64") && payload) {
        const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
        finish(Math.max(0, Math.floor((payload.length * 3) / 4) - padding), mimeType);
      } else {
        finish(payload.length, mimeType);
      }
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        const headRes = await fetch(videoUrl, { method: "HEAD", credentials: "same-origin" });
        const contentLength = headRes.headers.get("content-length");
        const mimeType = headRes.headers.get("content-type");
        if (contentLength) {
          const byteSize = Number.parseInt(contentLength, 10);
          if (Number.isFinite(byteSize) && byteSize > 0) {
            finish(byteSize, mimeType);
            return;
          }
        }
      } catch {
        /* fall through to GET */
      }

      try {
        const res = await fetch(videoUrl, { credentials: "same-origin" });
        const blob = await res.blob();
        finish(blob.size, blob.type || res.headers.get("content-type"));
      } catch {
        finish(null, null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [exportMode, videoUrl]);

  useEffect(() => {
    setIsExportVideoPlaying(false);
    const video = exportVideoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
  }, [videoUrl]);

  const activeSourceFileMeta =
    imageUrl && sourceFileMeta?.url === imageUrl ? sourceFileMeta : null;
  const activeVideoFileMeta =
    videoUrl && videoFileMeta?.url === videoUrl ? videoFileMeta : null;
  const activeDetectedVideoMeta =
    videoUrl && detectedVideoMeta?.url === videoUrl ? detectedVideoMeta : null;
  const videoSourceHints = useMemo(() => resolveVideoSourceHints(sourceNode), [sourceNode]);

  const actualExportW = activeDetectedSize?.w ?? null;
  const actualExportH = activeDetectedSize?.h ?? null;
  const exportW = actualExportW || documentSize?.w || 1920;
  const exportH = actualExportH || documentSize?.h || 1080;
  const composeW = actualExportW ?? exportW;
  const composeH = actualExportH ?? exportH;
  const resolutionMismatch =
    Boolean(documentSize && actualExportW && actualExportH) &&
    (actualExportW! < documentSize!.w * 0.9 || actualExportH! < documentSize!.h * 0.9);

  const directImageSrc = exportMode === "image" ? (imageUrl || null) : exportMode === "designer-pdf" ? (designerPreviewUrl || null) : null;
  const designerPreviewW = designerPageDims?.width ?? 1920;
  const designerPreviewH = designerPageDims?.height ?? 1080;
  const previewFrameW = exportMode === "designer-pdf"
    ? designerPreviewW
    : exportMode === "video"
      ? (activeDetectedVideoMeta?.w ?? 1920)
      : exportW;
  const previewFrameH = exportMode === "designer-pdf"
    ? designerPreviewH
    : exportMode === "video"
      ? (activeDetectedVideoMeta?.h ?? 1080)
      : exportH;
  const hasExportPreview = Boolean(
    directImageSrc
    || (exportMode === "video" && videoUrl)
    || (exportMode === "designer-pdf" && designerPages.length > 0),
  );
  const lockExportAspectRatio = exportMode === "designer-pdf"
    ? designerPages.length > 0
    : hasExportPreview;

  const exportFrameSyncKey = useMemo(() => {
    if (exportMode === "designer-pdf") {
      if (!designerPageDims || designerPages.length === 0) return "";
      return `designer:${designerNode?.id ?? id}:${designerActivePageIndex}:${designerPageDims.width}x${designerPageDims.height}`;
    }
    const previewSrc = exportMode === "video" ? videoUrl : directImageSrc;
    if (!previewSrc) return "";
    const srcTail = previewSrc.length > 48 ? previewSrc.slice(-48) : previewSrc;
    return `${exportMode}:${previewFrameW}x${previewFrameH}:${previewSrc.length}:${srcTail}`;
  }, [
    designerActivePageIndex,
    designerNode?.id,
    designerPageDims,
    designerPages.length,
    directImageSrc,
    exportMode,
    id,
    previewFrameH,
    previewFrameW,
    videoUrl,
  ]);

  useLayoutEffect(() => {
    if (!exportFrameSyncKey) {
      frameSyncKeyRef.current = null;
      return;
    }
    if (frameSyncKeyRef.current === exportFrameSyncKey) return;

    if (exportMode === "designer-pdf") {
      if (!designerPageDims || designerPages.length === 0) return;
      const nextFrame = resolveAspectLockedNodeFrame({
        node: exportNode,
        contentWidth: designerPageDims.width,
        contentHeight: designerPageDims.height,
        minWidth: 200,
        maxWidth: 960,
        minHeight: 120,
        maxHeight: STUDIO_NODE_MAX_HEIGHT,
        chromeHeight: resolveNodeChromeHeight(frameRef.current, previewRef.current),
      });
      frameSyncKeyRef.current = exportFrameSyncKey;
      setNodes((nds) =>
        syncAspectLockedFrameForNode(
          nds as Node[],
          id,
          nextFrame,
          designerPageDims.width / designerPageDims.height,
        ),
      );
      requestAnimationFrame(() => updateNodeInternals(id));
      return;
    }

    const nextFrame = resolveAspectLockedNodeFrame({
      node: exportNode,
      contentWidth: previewFrameW,
      contentHeight: previewFrameH,
      minWidth: 200,
      maxWidth: 960,
      minHeight: 120,
      maxHeight: STUDIO_NODE_MAX_HEIGHT,
      chromeHeight: resolveNodeChromeHeight(frameRef.current, previewRef.current),
    });
    frameSyncKeyRef.current = exportFrameSyncKey;
    setNodes((nds) => syncAspectLockedFrameForNode(nds as Node[], id, nextFrame, previewFrameW / previewFrameH));
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [exportFrameSyncKey, exportMode, designerPageDims, designerPages.length, exportNode, id, previewFrameH, previewFrameW, setNodes, updateNodeInternals]);

  useEffect(() => {
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [documentEdge, exportMode, id, imageEdge, updateNodeInternals, videoEdge]);

  const handleExport = async (formatOverride?: 'png' | 'jpeg') => {
    if (!sourceNode) return alert("Connect an image first!");
    if (!layers.length) return alert("The connected node has no image to export.");
    if (!activeDetectedSize?.measured) {
      return alert("Espera a que se mida la imagen conectada antes de exportar.");
    }
    if (resolutionMismatch && documentSize) {
      return alert(
        `PhotoRoom exportó a ${actualExportW}×${actualExportH} px pero el documento mide ${documentSize.w}×${documentSize.h} px. Cierra PhotoRoom (exporta a tamaño completo) y vuelve a intentar.`,
      );
    }

    const exportFormat = formatOverride ?? format;
    if (formatOverride) setFormat(formatOverride);

    const extension = exportFormat === 'jpeg' ? 'jpg' : 'png';
    const filename = `AI_Space_Output_${Date.now()}.${extension}`;
    const body = new FormData();
    body.set("layers", JSON.stringify(layers));
    body.set("filename", filename);
    body.set("format", exportFormat);
    body.set("width", String(composeW));
    body.set("height", String(composeH));
    body.set("previewWidth", String(composeW));
    body.set("previewHeight", String(composeH));

    setExportError(null);
    setIsExporting(true);
    try {
      const res = await fetch("/api/spaces/compose", {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      if (!res.ok) {
        let message = `Export failed (${res.status}).`;
        try {
          const payload = (await res.json()) as { error?: unknown };
          if (typeof payload.error === "string" && payload.error.trim()) message = payload.error.trim();
        } catch {
          const text = await res.text().catch(() => "");
          if (text.trim()) message = text.trim().slice(0, 180);
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.rel = "noreferrer";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

      dispatchFoldderExportCreated({
        name: filename,
        extension: `.${extension}`,
        sourceNodeId: sourceNode.id,
        thumbnailUrl: directImageSrc ?? undefined,
        mimeType: exportFormat === "jpeg" ? "image/jpeg" : "image/png",
        exportedFrom: "imageExport",
        exportFormat: extension,
        metadata: {
          exportNodeId: id,
          width: composeW,
          height: composeH,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed.";
      setExportError(message);
      console.error("[ImageExportNode] Export failed:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDesignerPdfExport = async () => {
    if (!designerNode) return alert("Conecta un Designer primero.");
    if (designerPages.length === 0) return alert("El Designer no tiene páginas para exportar.");
    setExportError(null);
    setIsExporting(true);
    try {
      const ok = await tryLiveDesignerMultipagePdfExport(designerNode.id, {});
      if (ok) {
        setIsExporting(false);
        return;
      }
      const label = typeof designerNode.data?.label === "string" ? designerNode.data.label : undefined;
      const filenameBase = (await import("./designer/DesignerStudio")).safeDesignerExportFilenameBase(label);
      setHeadlessDesignerExport({
        designerNodeId: designerNode.id,
        pages: designerPages,
        activePageIndex: designerActivePageIndex,
        filenameBase,
        requestId: Date.now(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo exportar el PDF.";
      setExportError(message);
      setIsExporting(false);
    }
  };

  const handleVideoDownload = async () => {
    const edge = videoEdge ?? (isVideoSourceNode(sourceNode) ? sourceEdge : null);
    if (!edge || !sourceNode) return alert("Conecta un vídeo primero.");
    const url = resolveMediaUrlFromEdgeSource(edge, mergedNodes, edges).trim();
    const sourceData = sourceNode.data as { s3Key?: string; label?: string };
    const s3Key = typeof sourceData.s3Key === "string" ? sourceData.s3Key : undefined;
    if (!url && !s3Key) return alert("El nodo conectado no tiene vídeo para descargar.");

    const rawName = typeof sourceData.label === "string" && sourceData.label.trim()
      ? `${sourceData.label.trim()}.mp4`
      : `foldder-video-${Date.now()}.mp4`;
    const filename = sanitizeDownloadFilename(rawName, "foldder-video.mp4");

    setExportError(null);
    setIsExporting(true);
    try {
      if (s3Key) {
        downloadS3Object(s3Key, filename);
      } else {
        await forceDownloadUrl(url, filename);
      }
      dispatchFoldderExportCreated({
        name: filename,
        extension: ".mp4",
        sourceNodeId: sourceNode.id,
        fileUrl: url || undefined,
        mimeType: "video/mp4",
        exportedFrom: "imageExport",
        exportFormat: "mp4",
        metadata: {
          exportNodeId: id,
          sourceNodeType: sourceNode.type,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo descargar el vídeo.";
      setExportError(message);
    } finally {
      setIsExporting(false);
    }
  };

  const runExportForMode = useCallback(async () => {
    if (exportMode === "designer-pdf") {
      await handleDesignerPdfExport();
      return;
    }
    if (exportMode === "video") {
      await handleVideoDownload();
      return;
    }
    await handleExport();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mode-specific handlers are stable enough for assistant runs
  }, [exportMode]);

  useRegisterAssistantNodeRun(id, runExportForMode);

  const hasSource = exportMode === "designer-pdf"
    ? Boolean(designerNode && designerPages.length > 0)
    : exportMode === "video"
      ? Boolean(sourceNode && (videoUrl || (sourceNode.data as { s3Key?: string }).s3Key))
      : Boolean(sourceNode && layers.length);

  const IMAGE_EXPORT_TOUCHED_MARK_SRC = "/nodes/image-export-mark.png";
  const displayW = actualExportW ?? exportW;
  const displayH = actualExportH ?? exportH;
  const sourceFormatLabel = imageUrl
    ? inferExportImageFormatLabel(imageUrl, activeSourceFileMeta?.mimeType)
    : "—";
  const sourceWeightLabel = activeSourceFileMeta?.loading
    ? "Midiendo…"
    : formatExportByteSize(activeSourceFileMeta?.byteSize);
  const resolutionLabel = activeDetectedSize?.measured
    ? `${displayW}×${displayH} px`
    : `${displayW}×${displayH} px · midiendo…`;
  const aspectRatioLabel = formatExportAspectRatio(displayW, displayH);
  const megapixelsLabel = formatExportMegapixels(displayW, displayH);
  const exportStatusLabel = resolutionMismatch
    ? "Baja resolución"
    : activeDetectedSize?.measured
      ? "Listo para exportar"
      : "Midiendo imagen…";
  const sourceNodeLabel = sourceNode?.type
    ? sourceNode.type.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim()
    : "—";
  const designerPageCountLabel = designerPages.length > 0 ? `${designerPages.length} página${designerPages.length === 1 ? "" : "s"}` : "—";
  const videoDisplayW = activeDetectedVideoMeta?.w ?? 1920;
  const videoDisplayH = activeDetectedVideoMeta?.h ?? 1080;
  const videoFormatLabel = videoUrl
    ? inferExportVideoFormatLabel(videoUrl, activeVideoFileMeta?.mimeType)
    : "MP4";
  const videoWeightLabel = activeVideoFileMeta?.loading
    ? "Midiendo…"
    : (activeVideoFileMeta?.byteSize != null
      ? formatExportByteSize(activeVideoFileMeta.byteSize)
      : (videoSourceHints.sizeLabel ?? "—"));
  const videoResolutionLabel = activeDetectedVideoMeta?.measured
    ? `${videoDisplayW}×${videoDisplayH} px`
    : videoSourceHints.resolutionLabel
      ? videoSourceHints.resolutionLabel
      : `${videoDisplayW}×${videoDisplayH} px · midiendo…`;
  const videoAspectRatioLabel = formatExportAspectRatio(videoDisplayW, videoDisplayH);
  const videoDurationLabel = formatExportDuration(
    activeDetectedVideoMeta?.durationSec ?? videoSourceHints.durationSec,
  );
  const videoFpsLabel = videoSourceHints.fps != null && Number.isFinite(videoSourceHints.fps)
    ? `${videoSourceHints.fps} fps`
    : null;
  const videoCodecLabel = videoSourceHints.codec?.trim() || null;
  const videoStatusLabel = videoUrl || (sourceNode?.data as { s3Key?: string } | undefined)?.s3Key
    ? activeDetectedVideoMeta?.measured
      ? "Listo para descargar"
      : "Midiendo vídeo…"
    : "Sin vídeo";
  const isPortraitPreview = hasExportPreview && exportMode !== "video" && previewFrameH > previewFrameW * 1.02;
  const isPortraitVideoPreview = hasExportPreview && exportMode === "video" && previewFrameH > previewFrameW * 1.02;

  return (
    <div
      ref={frameRef}
      className={`custom-node processor-node export-node image-export-node foldder-node--frameless ${hasExportPreview ? 'node--media image-export-node--has-preview' : 'node--glass image-export-node--empty foldder-frameless-label-dark'} ${hasExportPreview ? ((isPortraitPreview || isPortraitVideoPreview) ? 'image-export-node--portrait' : 'image-export-node--landscape') : ''} ${hasSource ? 'image-export-node--show-controls' : ''} ${hasManualExportFrame ? 'foldder-node-frame-manual' : ''} ${isExporting ? 'node-glow-running' : ''} ${exportError ? 'foldder-node--error' : ''}`}
      style={{
        minWidth: 200,
        minHeight: hasExportPreview ? 120 : 300,
        '--foldder-node-card-bg': '#DDDE55',
        '--foldder-frameless-glass-bg': '#DDDE55',
        '--foldder-frameless-accent': '#1f2328',
      } as React.CSSProperties}
    >
      <FoldderNodeResizer minWidth={200} minHeight={120} maxWidth={960} maxHeight={STUDIO_NODE_MAX_HEIGHT} keepAspectRatio={lockExportAspectRatio} isVisible={selected} />
      {hasExportPreview ? (
        <FoldderStudioTouchedMark nodeType="imageExport" backgroundSrc={IMAGE_EXPORT_TOUCHED_MARK_SRC} />
      ) : null}
      <NodeLabel id={id} label={typeof data.label === "string" ? data.label : undefined} defaultLabel="Export" />

      <div className="handle-wrapper handle-left" style={{ top: "38%" }}>
        <FoldderDataHandle type="target" position={Position.Left} id="image" dataType="image" />
        <span className="handle-label">Image Input</span>
      </div>
      <div className="handle-wrapper handle-left" style={{ top: "50%" }}>
        <FoldderDataHandle type="target" position={Position.Left} id="video" dataType="video" />
        <span className="handle-label">Video Input</span>
      </div>
      <div className="handle-wrapper handle-left" style={{ top: "62%" }}>
        <FoldderDataHandle type="target" position={Position.Left} id="document" dataType="generic" />
        <span className="handle-label">Document Input</span>
      </div>
      <div className="node-header">
        <NodeIcon type="imageExport" selected={selected} loading={isExporting} size={16} />
        <FoldderNodeHeaderTitle introActive={!!(data as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}>
          IMAGE EXPORT
        </FoldderNodeHeaderTitle>
      </div>
      <div className={`node-content foldder-frameless-main image-export-node-content flex flex-col ${hasExportPreview ? 'image-export-node-content--preview' : ''}`}>
        {!hasExportPreview ? (
          <img
            src="/nodes/image-export-bg.png"
            alt=""
            className="image-export-node-bg"
            draggable={false}
          />
        ) : null}

        <div
          ref={previewRef}
          className={`image-export-preview relative flex min-h-0 flex-1 items-center justify-center overflow-hidden ${hasExportPreview ? 'image-export-preview--visible' : 'image-export-preview--hidden'}`}
          style={{ minHeight: hasExportPreview ? 120 : 0 }}
        >
          {directImageSrc || (exportMode === "designer-pdf" && designerPages.length > 0) ? (
            <div
              className="image-export-preview-frame max-h-full max-w-full min-h-0 min-w-0"
              style={{
                aspectRatio: `${Math.max(1, previewFrameW)} / ${Math.max(1, previewFrameH)}`,
              }}
            >
              {directImageSrc ? (
                <img
                  src={directImageSrc}
                  className="block h-full w-full object-contain"
                  alt="Export preview"
                />
              ) : null}
            </div>
          ) : exportMode === "video" && videoUrl ? (
            <div
              className="image-export-preview-frame max-h-full max-w-full min-h-0 min-w-0"
              style={{
                aspectRatio: `${Math.max(1, previewFrameW)} / ${Math.max(1, previewFrameH)}`,
              }}
            >
              <div className="image-export-video-preview relative h-full w-full">
                <video
                  ref={exportVideoRef}
                  src={videoUrl}
                  className="block h-full w-full object-contain"
                  muted
                  playsInline
                  preload="metadata"
                  onPlay={() => setIsExportVideoPlaying(true)}
                  onPause={() => setIsExportVideoPlaying(false)}
                  onEnded={() => setIsExportVideoPlaying(false)}
                />
                <button
                  type="button"
                  className="image-export-video-play-toggle absolute inset-0 flex items-center justify-center nodrag nopan group"
                  aria-label={isExportVideoPlaying ? "Pausar vídeo" : "Reproducir vídeo"}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    const video = exportVideoRef.current;
                    if (!video) return;
                    if (video.paused) {
                      void video.play();
                    } else {
                      video.pause();
                    }
                  }}
                >
                  {!isExportVideoPlaying ? (
                    <div className="image-export-video-play-icon flex h-10 w-10 items-center justify-center transition-transform group-hover:scale-110">
                      <svg width="14" height="16" viewBox="0 0 14 16" fill="white" aria-hidden>
                        <path d="M0 0L14 8L0 16V0Z" />
                      </svg>
                    </div>
                  ) : (
                    <div className="image-export-video-play-icon flex h-10 w-10 items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                      <svg width="12" height="14" viewBox="0 0 12 14" fill="white" aria-hidden>
                        <rect x="0" y="0" width="4" height="14" />
                        <rect x="8" y="0" width="4" height="14" />
                      </svg>
                    </div>
                  )}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {hasSource ? (
          <div className="image-export-dock nodrag">
            <div className="image-export-meta">
              {exportMode === "designer-pdf" ? (
                <>
                  <div className="image-export-meta-row">
                    <span className="image-export-meta-label">Páginas</span>
                    <span className="image-export-meta-value">{designerPageCountLabel}</span>
                  </div>
                  <div className="image-export-meta-row">
                    <span className="image-export-meta-label">Formato</span>
                    <span className="image-export-meta-value">PDF</span>
                  </div>
                  <div className="image-export-meta-row image-export-meta-row--optional">
                    <span className="image-export-meta-label">Origen</span>
                    <span className="image-export-meta-value">{sourceNodeLabel}</span>
                  </div>
                  <div className="image-export-meta-row image-export-meta-row--status">
                    <span className="image-export-meta-label">Estado</span>
                    <span className="image-export-meta-value">
                      {designerPages.length > 0 ? "Listo para exportar" : "Sin páginas"}
                    </span>
                  </div>
                </>
              ) : exportMode === "video" ? (
                <>
                  <div className="image-export-meta-row">
                    <span className="image-export-meta-label">Resolución</span>
                    <span className="image-export-meta-value">{videoResolutionLabel}</span>
                  </div>
                  <div className="image-export-meta-row">
                    <span className="image-export-meta-label">Peso</span>
                    <span className="image-export-meta-value">{videoWeightLabel}</span>
                  </div>
                  <div className="image-export-meta-row">
                    <span className="image-export-meta-label">Formato</span>
                    <span className="image-export-meta-value">{videoFormatLabel}</span>
                  </div>
                  <div className="image-export-meta-row">
                    <span className="image-export-meta-label">Ratio</span>
                    <span className="image-export-meta-value">{videoAspectRatioLabel}</span>
                  </div>
                  <div className="image-export-meta-row">
                    <span className="image-export-meta-label">Duración</span>
                    <span className="image-export-meta-value">{videoDurationLabel}</span>
                  </div>
                  {videoFpsLabel ? (
                    <div className="image-export-meta-row image-export-meta-row--optional">
                      <span className="image-export-meta-label">FPS</span>
                      <span className="image-export-meta-value">{videoFpsLabel}</span>
                    </div>
                  ) : null}
                  {videoCodecLabel ? (
                    <div className="image-export-meta-row image-export-meta-row--optional">
                      <span className="image-export-meta-label">Codec</span>
                      <span className="image-export-meta-value">{videoCodecLabel}</span>
                    </div>
                  ) : null}
                  <div className="image-export-meta-row image-export-meta-row--optional">
                    <span className="image-export-meta-label">Origen</span>
                    <span className="image-export-meta-value">{sourceNodeLabel}</span>
                  </div>
                  <div className="image-export-meta-row image-export-meta-row--status">
                    <span className="image-export-meta-label">Estado</span>
                    <span className="image-export-meta-value">{videoStatusLabel}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="image-export-meta-row">
                    <span className="image-export-meta-label">Resolución</span>
                    <span className="image-export-meta-value">{resolutionLabel}</span>
                  </div>
                  <div className="image-export-meta-row">
                    <span className="image-export-meta-label">Peso</span>
                    <span className="image-export-meta-value">{sourceWeightLabel}</span>
                  </div>
                  <div className="image-export-meta-row">
                    <span className="image-export-meta-label">Formato</span>
                    <span className="image-export-meta-value">{sourceFormatLabel}</span>
                  </div>
                  <div className="image-export-meta-row">
                    <span className="image-export-meta-label">Ratio</span>
                    <span className="image-export-meta-value">{aspectRatioLabel}</span>
                  </div>
                  <div className="image-export-meta-row">
                    <span className="image-export-meta-label">Megapíxeles</span>
                    <span className="image-export-meta-value">{megapixelsLabel}</span>
                  </div>
                  <div className="image-export-meta-row image-export-meta-row--optional">
                    <span className="image-export-meta-label">Origen</span>
                    <span className="image-export-meta-value">{sourceNodeLabel}</span>
                  </div>
                  <div className="image-export-meta-row image-export-meta-row--status">
                    <span className="image-export-meta-label">Estado</span>
                    <span className={`image-export-meta-value ${resolutionMismatch ? "is-warning" : ""}`}>
                      {exportStatusLabel}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="image-export-format-row nodrag flex gap-2">
              {exportMode === "designer-pdf" ? (
                <button
                  type="button"
                  onClick={() => void handleDesignerPdfExport()}
                  disabled={isExporting}
                  className={`image-export-format-option image-export-download-btn nodrag is-active ${isExporting ? 'opacity-50' : ''}`}
                  aria-label="Descargar PDF"
                >
                  {isExporting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  <span>Descargar PDF</span>
                </button>
              ) : exportMode === "video" ? (
                <button
                  type="button"
                  onClick={() => void handleVideoDownload()}
                  disabled={isExporting}
                  className={`image-export-format-option image-export-download-btn nodrag is-active ${isExporting ? 'opacity-50' : ''}`}
                  aria-label="Descargar mp4"
                >
                  {isExporting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  <span>Descargar mp4</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void handleExport('png')}
                    disabled={isExporting}
                    className={`image-export-format-option image-export-download-btn nodrag ${format === 'png' ? 'is-active' : ''} ${isExporting ? 'opacity-50' : ''}`}
                    aria-label="Download PNG"
                  >
                    {isExporting && format === 'png' ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Download size={14} />
                    )}
                    <span>PNG</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExport('jpeg')}
                    disabled={isExporting}
                    className={`image-export-format-option image-export-download-btn nodrag ${format === 'jpeg' ? 'is-active' : ''} ${isExporting ? 'opacity-50' : ''}`}
                    aria-label="Download JPG"
                  >
                    {isExporting && format === 'jpeg' ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Download size={14} />
                    )}
                    <span>JPG</span>
                  </button>
                </>
              )}
            </div>
          </div>
        ) : null}

        <div className="image-export-controls flex shrink-0 flex-col gap-3">
          {exportMode === "image" && resolutionMismatch && documentSize ? (
            <div className="image-export-warning rounded-none border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[9px] font-semibold leading-snug text-amber-100">
              PhotoRoom guardó una miniatura de {actualExportW}×{actualExportH} px. Cierra el studio para exportar a{" "}
              {documentSize.w}×{documentSize.h} px.
            </div>
          ) : null}
          {exportError ? (
            <div className="image-export-error rounded-none border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[9px] font-semibold leading-snug text-rose-100">
              {exportError}
            </div>
          ) : null}
        </div>
      </div>
      {headlessDesignerExport ? (
        <HeadlessDesignerPdfExportPortal
          state={headlessDesignerExport}
          onDone={() => {
            setHeadlessDesignerExport(null);
            setIsExporting(false);
          }}
          onError={(err) => {
            setHeadlessDesignerExport(null);
            setExportError(err.message);
            setIsExporting(false);
          }}
          onFinalExport={(detail) => {
            dispatchFoldderExportCreated({
              ...detail,
              metadata: {
                ...(detail.metadata ?? {}),
                exportNodeId: id,
              },
            });
          }}
        />
      ) : null}
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
  const projectAssetsCtx = useProjectAssetsCanvas();
  const updateNodeInternals = useUpdateNodeInternals();
  const [isUploadingLocal, setIsUploadingLocal] = useState(false);
  const [showFullSize, setShowFullSize] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaFitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameSyncKeyRef = useRef<string | null>(null);
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
    try {
      const uploaded = await uploadProjectMediaFile(file, {
        projectId: projectAssetsCtx?.projectScopeId ?? null,
      });
      const type = getFileType(file.name, file.type || uploaded.contentType);
      const mockMetadata = {
        size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        resolution: (type === 'video' || type === 'image') ? 'Auto-detected' : '-',
        duration: (type === 'video' || type === 'audio') ? '–' : '-',
        codec: (file.type || uploaded.contentType).split('/')[1]?.toUpperCase() || 'UNKNOWN'
      };
      updateNodeData({
        value: uploaded.url,
        type,
        source: 'upload',
        metadata: mockMetadata,
        s3Key: uploaded.s3Key,
        error: false,
        uploadError: undefined,
      });
      if (type === 'image' || type === 'video') scheduleFitViewportToThisNode({ force: true });
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
    const frameSyncKey = `${nodeData.value ?? "empty"}:${visualMediaWidth}x${visualMediaHeight}`;
    if (frameSyncKeyRef.current === frameSyncKey) return;
    const chromeHeight = resolveNodeChromeHeight(frameRef.current, previewRef.current);
    const nextFrame = resolveAspectLockedNodeFrame({
      node: currentFrameNode,
      contentWidth: visualMediaWidth,
      contentHeight: visualMediaHeight,
      minWidth: 200,
      maxWidth: 960,
      minHeight: 120,
      maxHeight: STUDIO_NODE_MAX_HEIGHT,
      chromeHeight,
    });
    frameSyncKeyRef.current = frameSyncKey;
    setNodes((nds) => syncAspectLockedFrameForNode(nds as Node[], id, nextFrame, visualMediaWidth / visualMediaHeight));
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
    nodeData.value,
    scheduleFitViewportToThisNode,
    setNodes,
    updateNodeInternals,
    visualMediaHeight,
    visualMediaWidth,
  ]);

  return (
    <div
      ref={frameRef}
      className={`custom-node media-input-node foldder-node--frameless ${hasMedia && isVisual ? 'node--media' : 'node--glass foldder-frameless-label-dark'} ${isUploading ? 'node-glow-running' : ''} ${nodeData.error ? 'foldder-node--error' : ''}`}
      style={{
        padding: 0,
        minWidth: 200,
        minHeight: 120,
        overflow: 'visible',
        '--foldder-frameless-accent': getTitleColor(),
      } as React.CSSProperties}
    >
      <FoldderNodeResizer
        minWidth={200}
        minHeight={hasMedia && isVisual ? 120 : 200}
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
        className={`media-input-preview group relative w-full ${mediaPreviewFrameClass} overflow-hidden bg-zinc-900 ${hasMedia ? 'cursor-default' : 'cursor-pointer'} transition-all`}
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
          <div className="media-input-empty-state flex flex-col items-center gap-2 text-rose-400">
            <Loader2 size={28} className="animate-spin" />
            <span className="text-[9px] font-bold uppercase tracking-widest">Uploading…</span>
          </div>
        ) : nodeData.error && !hasMedia ? (
          <div
            className="media-input-empty-state flex flex-col items-center gap-2 px-4 text-center text-rose-400"
            onClick={(e) => e.stopPropagation()}
          >
            <AlertCircle size={28} className="shrink-0" />
            <span className="text-[9px] font-bold uppercase tracking-widest">Error al subir</span>
            {nodeData.uploadError && (
              <span className="text-[8px] leading-snug text-rose-200/90">{nodeData.uploadError}</span>
            )}
            <button
              type="button"
              className="nodrag mt-1 rounded-none border border-white/20 bg-white/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white hover:bg-white/20"
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
          <div className="media-input-empty-state flex flex-col items-center gap-3 text-purple-400">
            <Music size={36} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Audio Loaded</span>
          </div>
        ) : (
          <div className="media-input-empty-state flex flex-col items-center gap-3 select-none">
            <div className="w-12 h-12 rounded-none bg-white/5 flex items-center justify-center">
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
          <div className="media-input-metadata-strip absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-1.5"
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
          <div className="media-input-type-chip absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest"
            style={{ background: 'rgba(0,0,0,0.55)', color: getTitleColor(), backdropFilter: 'blur(6px)' }}>
            <NodeIcon type="mediaInput" iconKey={mediaIconKey()} size={12} colorOverride={getTitleColor()} />
            <span>{nodeData.type}</span>
          </div>
        )}

        {/* Fullscreen button top-right */}
        {hasMedia && isVisual && (
          <button
            className="media-input-fullscreen-button absolute top-2 right-2 z-[21] w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-110 nodrag"
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
              className="media-input-replace-icon absolute bottom-2 right-2 z-[22] flex h-8 w-8 items-center justify-center rounded-full nodrag transition-opacity hover:opacity-100"
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
                className="max-w-full max-h-[85vh] rounded-none shadow-2xl"
                controls
                autoPlay
              />
            ) : (
              <img
                src={nodeData.value}
                className="max-w-full max-h-[85vh] rounded-none shadow-2xl object-contain"
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
  const promptValue = nodeData.value;
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const edges = useEdges();
  const nodes = useNodes();
  const taRef = useRef<HTMLTextAreaElement>(null);

  const inheritedCardBg = useMemo(() => {
    const targetIds = new Set<string>();
    for (const edge of edges) {
      if (edge.source !== id) continue;
      const handle = edge.sourceHandle ?? "prompt";
      if (handle !== "prompt") continue;
      targetIds.add(edge.target);
    }
    if (targetIds.size === 0) return null;
    if (targetIds.size > 1) return PROMPT_MULTI_TARGET_CARD_BG;
    const targetId = [...targetIds][0];
    const targetType = nodes.find((n) => n.id === targetId)?.type;
    return getNodeCardBackgroundColor(targetType);
  }, [edges, id, nodes]);

  /** Color sugerido al crearse (p. ej. al tirar de un conector): el del nodo que lo genera. */
  const overrideCardBg = (nodeData as { _foldderCardBg?: string })._foldderCardBg;

  const promptNodeStyle = useMemo((): React.CSSProperties => {
    const cardBg = inheritedCardBg ?? overrideCardBg ?? PROMPT_DEFAULT_CARD_BG;
    return {
      minWidth: 260,
      minHeight: 76,
      "--foldder-node-card-bg": cardBg,
      "--foldder-frameless-glass-bg": cardBg,
    } as React.CSSProperties;
  }, [inheritedCardBg, overrideCardBg]);

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

  useEffect(() => {
    const requiredFrame = getNodeGridFrameForType("promptInput", { value: promptValue });
    if (!requiredFrame) return;
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== id) return n;
        const style = (n.style ?? {}) as React.CSSProperties;
        const currentWidth = typeof style.width === "number" ? style.width : 0;
        const currentHeight = typeof style.height === "number" ? style.height : 0;
        const nextWidth = Math.max(currentWidth, requiredFrame.width);
        const nextHeight = Math.max(currentHeight, requiredFrame.height);
        if (currentWidth === nextWidth && currentHeight === nextHeight) return n;
        return {
          ...n,
          style: {
            ...style,
            width: nextWidth,
            height: nextHeight,
          },
        };
      }),
    );
  }, [id, promptValue, setNodes]);

  const linkClass =
    inheritedCardBg === null
      ? ""
      : inheritedCardBg === PROMPT_MULTI_TARGET_CARD_BG
        ? "prompt-node--multi-linked"
        : "prompt-node--linked";

  return (
    <div
      className={`custom-node prompt-node prompt-node--compact foldder-node--frameless node--glass ${linkClass}`.trim()}
      style={promptNodeStyle}
    >
      <FoldderNodeResizer
        minWidth={260}
        minHeight={76}
        maxWidth={960}
        maxHeight={524}
        isVisible={selected}
      />
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

export const NotesNode = memo(function NotesNode({ id, data, selected }: NodeProps) {
  const nodeData = normalizeNotesNodeData(data);
  const { setNodes, setEdges } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const nodes = useNodes();
  const currentNode = nodes.find((node) => node.id === id);
  const style = (currentNode?.style as React.CSSProperties | undefined) ?? {};
  const width = typeof style.width === "number" ? style.width : NOTE_WIDTH;
  const height = typeof style.height === "number" ? style.height : NOTE_MIN_HEIGHT;

  const applyPatch = useCallback(
    (patch: Partial<typeof nodeData>) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...patch,
                },
              }
            : node,
        ),
      );
    },
    [id, setNodes],
  );

  const duplicateNote = useCallback(() => {
    const duplicateId = `notes_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setNodes((nds) => {
      const source = nds.find((node) => node.id === id);
      if (!source) return nds;
      const sourceStyle = (source.style as React.CSSProperties | undefined) ?? {};
      const nextWidth = typeof sourceStyle.width === "number" ? sourceStyle.width : NOTE_WIDTH;
      const nextHeight = typeof sourceStyle.height === "number" ? sourceStyle.height : NOTE_MIN_HEIGHT;
      return [
        ...nds.map((node) => ({ ...node, selected: false })),
        {
          ...source,
          id: duplicateId,
          selected: true,
          dragHandle: ".notes-drag-surface",
          position: {
            x: source.position.x + 36,
            y: source.position.y + 36,
          },
          data: {
            ...source.data,
            title: `${nodeData.title ?? "Note"} copy`,
            label: `${nodeData.title ?? "Note"} copy`,
            updatedAt: new Date().toISOString(),
          },
          style: {
            ...sourceStyle,
            width: nextWidth,
            height: nextHeight,
          },
        },
      ];
    });
  }, [id, nodeData.title, setNodes]);

  const deleteNote = useCallback(() => {
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
    setNodes((nds) => nds.filter((node) => node.id !== id));
  }, [id, setEdges, setNodes]);

  const syncAutoHeight = useCallback((nextHeight: number) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id !== id) return node;
        const currentStyle = (node.style as React.CSSProperties | undefined) ?? {};
        const currentWidth = typeof currentStyle.width === "number" ? currentStyle.width : NOTE_WIDTH;
        if (typeof currentStyle.height === "number" && Math.abs(currentStyle.height - nextHeight) < 2) {
          return node;
        }
        return {
          ...node,
          height: nextHeight,
          measured: {
            ...(node.measured ?? {}),
            width: currentWidth,
            height: nextHeight,
          },
          style: {
            ...currentStyle,
            width: currentWidth,
            height: nextHeight,
          },
        };
      }),
    );
    requestAnimationFrame(() => {
      updateNodeInternals(id);
      requestAnimationFrame(() => updateNodeInternals(id));
    });
  }, [id, setNodes, updateNodeInternals]);

  return (
    <div
      className="custom-node note-node relative"
      style={{
        width,
        height,
        minHeight: NOTE_MIN_HEIGHT,
      }}
    >
      <FoldderNodeResizer minWidth={200} minHeight={NOTE_MIN_HEIGHT} maxWidth={960} maxHeight={2200} isVisible={selected} />
      <NotesStickyCard
        nodeId={id}
        mode="node"
        title={nodeData.title}
        contentHtml={nodeData.contentHtml}
        selected={selected}
        onChange={applyPatch}
        onDuplicate={duplicateNote}
        onDelete={deleteNote}
        onAutoHeightChange={syncAutoHeight}
      />
      <div className="handle-wrapper handle-right !right-[-16px] top-1/2 z-[8] -translate-y-1/2">
        <span className="handle-label">Prompt</span>
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
  /** Una ranura visible: la última conectada + la siguiente libre (máx. 8). */
  const visibleCount = Math.min(Math.max(connectedEdges.length + 1, 1), ALL_HANDLES.length);
  const visibleHandles = useMemo(() => ALL_HANDLES.slice(0, visibleCount), [visibleCount]);

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

  const hasOutput = Boolean(nodeData.value?.trim());
  const isActive = connectedEdges.length > 0 || hasOutput;

  return (
    <div
      className={`custom-node tool-node concatenator-node foldder-node--frameless node--glass foldder-frameless-label-dark ${isActive ? "concatenator-node--active" : "concatenator-node--empty"}`}
      style={{
        minWidth: 280,
        minHeight: 300,
        "--foldder-node-card-bg": "#FADC93",
        "--foldder-frameless-glass-bg": "#FADC93",
        "--foldder-frameless-accent": "#1f2328",
      } as React.CSSProperties}
    >
      <FoldderNodeResizer minWidth={280} minHeight={300} maxWidth={640} maxHeight={520} isVisible={selected} />
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Concatenator" />
      {visibleHandles.map((hId, index) => (
          <div
            key={hId}
            className="handle-wrapper handle-left"
            style={{
              top: `${((index + 1) / (visibleHandles.length + 1)) * 100}%`,
            }}
          >
            <FoldderDataHandle
              type="target"
              position={Position.Left}
              id={hId}
              dataType="prompt"
              className={connectedHandleIds.has(hId) ? 'foldder-data-handle--connected' : ''}
            />
          </div>
        ))}

      <div className="node-header">
        <NodeIcon type="concatenator" selected={selected} size={16} />
        <FoldderNodeHeaderTitle introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}>
          Concatenator
        </FoldderNodeHeaderTitle>
      </div>

      <div className="node-content foldder-frameless-main concatenator-node-main nodrag nopan">
        <img
          src="/nodes/concatenator-bg.png"
          alt=""
          className="concatenator-node-bg"
          draggable={false}
        />
        {isActive ? (
          <div className="concatenator-node-output-dock">
            {hasOutput ? (
              <p className="concatenator-node-output-text">{nodeData.value}</p>
            ) : (
              <p className="concatenator-node-output-placeholder">Esperando prompts conectados…</p>
            )}
            <span className="concatenator-node-meta">
              {connectedEdges.length} {connectedEdges.length === 1 ? "input" : "inputs"}
            </span>
          </div>
        ) : (
          <div className="concatenator-node-empty-hint" aria-hidden>
            Connect prompts on the left
          </div>
        )}
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
    <div className="custom-node tool-node listado-node" style={{ minWidth: 280 }}>
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
          className="nodrag nowheel w-full cursor-pointer rounded-none border border-slate-200/70 bg-white/[0.92] px-2.5 py-2 text-[11px] font-medium text-slate-800 shadow-inner outline-none transition-colors focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/30"
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
        <div className="rounded-none border border-slate-200/40 bg-slate-50/40 px-2 py-1.5 text-[9px] leading-snug text-slate-500">
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
  /** Una ranura visible: conectadas + la siguiente libre (máx. 8). */
  const visibleCount = Math.min(Math.max(connectedEdges.length + 1, 1), ALL_HANDLES.length);
  const visibleHandles = useMemo(() => ALL_HANDLES.slice(0, visibleCount), [visibleCount]);

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, visibleCount, updateNodeInternals]);

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

  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const enhancedText = String(nodeData.value ?? '').trim();

  const onCopyEnhancedPrompt = useCallback(async () => {
    if (!enhancedText) return;
    try {
      await navigator.clipboard.writeText(enhancedText);
      setCopiedPrompt(true);
      window.setTimeout(() => setCopiedPrompt(false), 1500);
    } catch {
      // clipboard may be unavailable
    }
  }, [enhancedText]);

  const hasInput = Boolean(concatenated.trim());
  const hasOutput = Boolean(enhancedText);
  const showEnhanceButton = connectedEdges.length > 0 || loading;
  const isActive = connectedEdges.length > 0 || hasInput || hasOutput || loading;

  return (
    <div
      className={`custom-node tool-node enhancer-node foldder-node--frameless node--glass foldder-frameless-label-dark ${isActive ? 'enhancer-node--active' : 'enhancer-node--empty'} ${showEnhanceButton ? 'enhancer-node--show-run' : ''} ${loading ? 'node-glow-running' : ''}`}
      style={{
        minWidth: 280,
        minHeight: 300,
        '--foldder-node-card-bg': '#21817f',
        '--foldder-frameless-glass-bg': '#21817f',
        '--foldder-frameless-accent': '#1f2328',
      } as React.CSSProperties}
    >
      <FoldderNodeResizer minWidth={280} minHeight={300} maxWidth={640} maxHeight={560} isVisible={selected} />
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Enhancer" />

      {visibleHandles.map((hId, index) => (
          <div
            key={hId}
            className="handle-wrapper handle-left"
            style={{
              top: `${((index + 1) / (visibleHandles.length + 1)) * 100}%`,
            }}
          >
            <FoldderDataHandle
              type="target"
              position={Position.Left}
              id={hId}
              dataType="prompt"
              className={connectedHandleIds.has(hId) ? 'foldder-data-handle--connected' : ''}
            />
          </div>
        ))}

      <div className="node-header">
        <NodeIcon type="enhancer" selected={selected} loading={loading} size={16} />
        <FoldderNodeHeaderTitle introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}>
          Prompt Enhancer
        </FoldderNodeHeaderTitle>
      </div>

      <div className="node-content foldder-frameless-main enhancer-node-main nodrag nopan">
        <img
          src="/nodes/enhancer-bg.png"
          alt=""
          className="enhancer-node-bg"
          draggable={false}
        />

        {loading ? (
          <div className="enhancer-node-loading absolute inset-0 z-[8] flex flex-col items-center justify-center gap-2 bg-black/45 backdrop-blur-[2px]">
            <Loader2 size={22} className="animate-spin text-white/90" />
            <span className="text-[8px] font-black uppercase tracking-[0.25em] text-white/80">Enhancing</span>
          </div>
        ) : null}

        {(hasInput || hasOutput) ? (
          <div className="enhancer-node-dock nodrag">
            {hasOutput ? (
              <div className="enhancer-node-output-row">
                <p className="enhancer-node-output-text">{enhancedText}</p>
                <button
                  type="button"
                  className="enhancer-copy-prompt-btn nodrag shrink-0"
                  onClick={() => void onCopyEnhancedPrompt()}
                  title={copiedPrompt ? 'Copied' : 'Copy prompt'}
                  aria-label={copiedPrompt ? 'Copied' : 'Copy prompt'}
                >
                  <Copy size={15} strokeWidth={2} aria-hidden />
                </button>
              </div>
            ) : hasInput ? (
              <p className="enhancer-node-input-preview">{concatenated}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {showEnhanceButton ? (
        <div className="foldder-frameless-footer-action nodrag enhancer-node-footer">
          <button
            type="button"
            className="execute-btn enhancer-run-button nodrag w-full"
            onClick={handleEnhance}
            disabled={loading || !hasInput}
          >
            {loading ? (
              <>
                <Loader2 size={12} className="animate-spin" /> Enhancing…
              </>
            ) : (
              'Enhance with OpenAI'
            )}
          </button>
        </div>
      ) : null}

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
  const updateNodeInternals = useUpdateNodeInternals();
  const nodes = useNodes();
  const edges = useEdges();
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState<string | null>(null);
  const currentNode = nodes.find((node) => node.id === id);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const frameSyncKeyRef = useRef<string | null>(null);

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
  const grokAspect = parseAspectRatioValue(nodeData.aspect_ratio || '16:9') ?? { width: 16, height: 9 };

  useLayoutEffect(() => {
    const syncKey = `${nodeData.aspect_ratio || '16:9'}:${grokAspect.width}x${grokAspect.height}`;
    if (frameSyncKeyRef.current === syncKey) return;
    const nextFrame = resolveAspectLockedNodeFrame({
      node: currentNode,
      contentWidth: grokAspect.width,
      contentHeight: grokAspect.height,
      minWidth: 200,
      maxWidth: 960,
      minHeight: 120,
      maxHeight: STUDIO_NODE_MAX_HEIGHT,
      chromeHeight: resolveNodeChromeHeight(frameRef.current, previewRef.current),
    });
    frameSyncKeyRef.current = syncKey;
    setNodes((nds) => syncAspectLockedFrameForNode(nds as Node[], id, nextFrame, grokAspect.width / grokAspect.height));
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [
    currentNode,
    grokAspect.height,
    grokAspect.width,
    id,
    nodeData.aspect_ratio,
    setNodes,
    updateNodeInternals,
  ]);

  return (
    <div ref={frameRef} className={`custom-node processor-node grok-processor-node foldder-node--frameless node--glass ${status === 'running' ? 'node-glow-running' : ''}`} style={{ minWidth: 200, minHeight: 120 }}>
      <FoldderNodeResizer minWidth={200} minHeight={120} maxWidth={960} maxHeight={STUDIO_NODE_MAX_HEIGHT} keepAspectRatio isVisible={selected} />
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
      <div ref={previewRef} className="node-content grok-node-content">
        <div className="grok-settings-row flex gap-2 mb-3">
          <select className="node-input grok-select text-[10px]" value={nodeData.resolution || '720p'} onChange={(e) => setNodes((nds) => nds.map((n) => n.id === id ? {...n, data: {...n.data, resolution: e.target.value}} : n))}>
            <option value="720p">720p</option>
            <option value="480p">480p</option>
          </select>
          <select className="node-input grok-select text-[10px]" value={nodeData.aspect_ratio || '16:9'} onChange={(e) => setNodes((nds) => nds.map((n) => n.id === id ? {...n, data: {...n.data, aspect_ratio: e.target.value}} : n))}>
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
          </select>
          <select className="node-input grok-select text-[10px]" value={nodeData.duration || 5} onChange={(e) => setNodes((nds) => nds.map((n) => n.id === id ? {...n, data: {...n.data, duration: Number(e.target.value)}} : n))}>
            <option value={5}>5s</option>
            <option value={10}>10s</option>
          </select>
        </div>
        <button className="execute-btn w-full justify-center" onClick={onRun}>{status === 'running' ? 'PROCESSING...' : 'GENERATE VIDEO'}</button>
        {result && <video src={result} className="mt-4 rounded-none w-full" controls />}
      </div>
      <div className="handle-wrapper handle-right">
        <span className="handle-label">Video out</span>
        <FoldderDataHandle type="source" position={Position.Right} id="video" dataType="video" />
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
  const currentNode = nodes.find((node) => node.id === id);
  const currentFrameNode = useCurrentNodeFrameSnapshot(currentNode);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const frameSyncKeyRef = useRef<string | null>(null);
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

  const sourceEdge = edges.find(e => e.target === id && e.targetHandle === 'media') ?? edges.find(e => e.target === id);
  const sourceNode = nodes.find(n => n.id === sourceEdge?.source);
  const resolvedSourceValue = sourceEdge ? resolvePromptValueFromEdgeSource(sourceEdge, nodes) : undefined;
  const originalPreview = (typeof resolvedSourceValue === 'string' && resolvedSourceValue
    ? resolvedSourceValue
    : (sourceNode?.data.value as string | undefined));
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
    const syncKey = `${aspectImageUrl ?? "empty"}:${aspectContentWidth}x${aspectContentHeight}`;
    if (frameSyncKeyRef.current === syncKey) return;
    const chromeHeight = resolveNodeChromeHeight(frameRef.current, previewRef.current);
    const nextFrame = resolveAspectLockedNodeFrame({
      node: currentFrameNode,
      contentWidth: aspectContentWidth,
      contentHeight: aspectContentHeight,
      minWidth: 200,
      maxWidth: 960,
      minHeight: 120,
      maxHeight: STUDIO_NODE_MAX_HEIGHT,
      chromeHeight,
    });
    frameSyncKeyRef.current = syncKey;
    setNodes((nds) => syncAspectLockedFrameForNode(nds as Node[], id, nextFrame, aspectContentWidth / aspectContentHeight));
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [
    aspectImageUrl,
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
      case 'mask': return nodeData.result_mask ?? originalPreview;
      case 'cutout': return nodeData.result_rgba ?? originalPreview;
      default: return originalPreview;
    }
  };

  const hasPreview = Boolean(getPreviewImage());
  const hasResult = Boolean(nodeData.result_rgba || nodeData.result_mask);
  const hasInput = Boolean(originalPreview);

  return (
    <div
      ref={frameRef}
      className={`custom-node mask-node foldder-node--frameless node--media group/node ${hasPreview ? 'mask-node--has-preview' : 'mask-node--empty'} ${status === 'running' ? 'node-glow-running' : ''}`}
      style={{
        minWidth: 200,
        minHeight: 120,
        "--foldder-frameless-accent": "#22d3ee",
      } as React.CSSProperties}
    >
      <FoldderNodeResizer minWidth={200} minHeight={120} maxWidth={960} maxHeight={STUDIO_NODE_MAX_HEIGHT} keepAspectRatio={Boolean(aspectImageUrl)} isVisible={selected} />
      {hasInput ? <FoldderStudioTouchedMark nodeType="backgroundRemover" /> : null}
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Background Remover" />

      <div className="handle-wrapper handle-left">
        <FoldderDataHandle type="target" position={Position.Left} id="media" dataType="image" />
        <span className="handle-label text-emerald-400">Media Input</span>
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

      <div ref={previewRef} className="node-content foldder-frameless-main">
        {hasPreview ? (
          <img
            src={getPreviewImage()}
            draggable={false}
            className={`pointer-events-none absolute inset-0 h-full w-full object-contain ${previewMode === 'mask' ? 'invert brightness-150' : ''}`}
            alt="Cutout preview"
          />
        ) : null}

        {status === 'running' && (
          <div className="absolute inset-0 z-[7] flex flex-col items-center justify-center gap-2 bg-black/55 backdrop-blur-sm">
            <Loader2 size={22} className="animate-spin text-cyan-300" />
            <span className="text-[8px] font-black uppercase tracking-[0.25em] text-white/80">Processing Alpha</span>
          </div>
        )}

        {hasInput && (
          <div className="foldder-frameless-secondary-panel nodrag flex w-[150px] flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="flex items-center justify-between text-[7px] font-black uppercase tracking-[0.12em] text-white/55">
                Precision <span className="font-mono text-white/85">{threshold.toFixed(2)}</span>
              </span>
              <input
                type="range" min="0" max="1" step="0.01"
                value={threshold}
                onChange={(e) => updateNestedData('threshold', parseFloat(e.target.value))}
                className="node-slider nodrag h-1 w-full accent-cyan-400"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="flex items-center justify-between text-[7px] font-black uppercase tracking-[0.12em] text-white/55">
                Expansion <span className="font-mono text-white/85">{nodeData.expansion ?? 0}px</span>
              </span>
              <input
                type="range" min="-10" max="10" step="1"
                value={nodeData.expansion ?? 0}
                onChange={(e) => updateNestedData('expansion', parseInt(e.target.value))}
                className="node-slider nodrag h-1 w-full accent-cyan-400"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="flex items-center justify-between text-[7px] font-black uppercase tracking-[0.12em] text-white/55">
                Feather <span className="font-mono text-white/85">{(nodeData.feather ?? 0.6).toFixed(1)}px</span>
              </span>
              <input
                type="range" min="0" max="2" step="0.1"
                value={nodeData.feather ?? 0.6}
                onChange={(e) => updateNestedData('feather', parseFloat(e.target.value))}
                className="node-slider nodrag h-1 w-full accent-pink-400"
              />
            </label>
          </div>
        )}

        <button
          onClick={onRun}
          disabled={status === 'running'}
          className="execute-btn nodrag"
        >
          {status === 'running' ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
          <span>{status === 'running' ? 'Removing…' : 'Remove BG'}</span>
        </button>
      </div>

      {hasResult && (
        <div
          className="nodrag nopan flex gap-1"
          style={{ position: 'absolute', top: 8, right: 8, zIndex: 60, pointerEvents: 'auto' }}
        >
          {(['original', 'mask', 'cutout'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPreviewMode(mode);
              }}
              style={{ pointerEvents: 'auto', cursor: 'pointer' }}
              className={`nodrag px-2 py-1 text-[7px] font-black uppercase tracking-[0.15em] transition-colors ${previewMode === mode ? 'bg-white text-black' : 'bg-black/45 text-white/55 hover:text-white'}`}
            >
              {mode}
            </button>
          ))}
        </div>
      )}

      <div className="handle-wrapper handle-right">
        <span className="handle-label text-pink-400">Cutout</span>
        <FoldderDataHandle type="source" position={Position.Right} id="rgba" dataType="image" />
      </div>
    </div>
  );
});

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

  const hasMediaPreview = Boolean(
    nodeData.value && (nodeData.outputType === 'image' || nodeData.outputType === 'video'),
  );

  return (
    <div className="relative" style={{ isolation: 'isolate' }}>
      {/* Ghost card stack (nested-space identity) — capas con colores PhotoRoom / Designer / Presenter */}
      <div className="absolute inset-0 rounded-none border border-white/20"
        style={{
          transform: 'translate(20px, 20px) rotate(3deg)',
          background: '#f5b91b',
          zIndex: -3,
        }}
      />
      <div className="absolute inset-0 rounded-none border border-white/20"
        style={{
          transform: 'translate(13px, 13px) rotate(2deg)',
          background: '#abbc14',
          zIndex: -2,
        }}
      />
      <div className="absolute inset-0 rounded-none border border-white/20"
        style={{
          transform: 'translate(6px, 6px) rotate(1deg)',
          background: '#71449f',
          zIndex: -1,
        }}
      />

      {/* Main node card — patrón canónico frameless media (como Inspiration/NanoBanana) */}
      <div
        className={`custom-node space-node foldder-node--frameless node--media group/node ${hasMediaPreview ? 'space-node--has-preview' : 'space-node--empty'}`}
        style={{ position: 'relative', zIndex: 0, '--foldder-frameless-accent': '#8A5755' } as React.CSSProperties}
      >
        <FoldderNodeResizer minWidth={280} minHeight={180} isVisible={selected} />
        <NodeLabel id={id} label={nodeData.label} defaultLabel="Space" />

        {/* Input handle only if space has an internal InputNode */}
        {nodeData.hasInput !== false && (
          <div className="handle-wrapper handle-left">
            <FoldderDataHandle type="target" position={Position.Left} id="in" dataType={foldderDataTypeFromHandleClass(getInputHandleClass())} />
            <span className="handle-label">Data In</span>
          </div>
        )}

        <div className="node-content foldder-frameless-main">
          {/* Media a sangre (ocupa todo el nodo) */}
          {hasMediaPreview ? (
            nodeData.outputType === 'video' ? (
              <video src={nodeData.value as string} className="absolute inset-0 h-full w-full object-cover" muted />
            ) : (
              <img src={nodeData.value as string} className="absolute inset-0 h-full w-full object-cover" alt="Space output" />
            )
          ) : null}

          {/* Chip de blueprint interno (overlay abajo-izquierda) */}
          <div className="absolute bottom-3 left-3.5 z-[9] flex items-center gap-2 bg-black/45 px-2 py-1 text-white nodrag">
            <span className="text-[7px] font-black uppercase tracking-[0.18em] text-white/55">Blueprint</span>
            <div className="flex items-center gap-2.5 [&_svg]:text-white">
              {nodeData.internalCategories && nodeData.internalCategories.length > 0 ? (
                nodeData.internalCategories.map(cat => renderInternalIcon(cat))
              ) : (
                <NodeIcon type="space" iconKey="layout" size={12} />
              )}
            </div>
          </div>

          {/* Botón "Enter Space" — chip blanco cuadrado abajo-derecha (CTA canónico) */}
          <button
            onClick={onEnterSpace}
            className="execute-btn nodrag"
            type="button"
          >
            <Maximize2 size={13} /> Enter Space
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



const DESCRIBER_TOUCHED_MARK_SRC = "/nodes/describer-bg.png";

function describerPhotoAspectRatio(width?: number, height?: number): number | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || !width || !height) return null;
  return Math.min(2.4, Math.max(0.56, width / height));
}

export const MediaDescriberNode = memo(function MediaDescriberNode({ id, data, selected }: NodeProps) {
  const nodeData = data as BaseNodeData;
  const nodes = useNodes();
  const edges = useEdges();
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const frameRef = useRef<HTMLDivElement | null>(null);
  const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const frameSyncKeyRef = useRef<string | null>(null);
  const [inputImageSize, setInputImageSize] = useState<{ url: string; width: number; height: number } | null>(null);
  const currentNode = nodes.find((node) => node.id === id);
  const [status, setStatus] = useState('idle');
  const [description, setDescription] = useState<string | null>(
    typeof nodeData.value === 'string' && nodeData.value.trim() ? nodeData.value : null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [revealedIconCount, setRevealedIconCount] = useState(0);
  const [iconRevealActive, setIconRevealActive] = useState(false);
  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userManuallyResizedRef = useRef(false);
  const persistedDescription = typeof nodeData.value === 'string' && nodeData.value.trim() ? nodeData.value : null;
  const visibleDescription = description || persistedDescription;
  const inputEdge = useMemo(
    () => edges.find((e) => e.target === id && e.targetHandle === 'media'),
    [edges, id],
  );
  const mediaConnected = Boolean(inputEdge);

  const connectedInputMedia = useMemo(() => {
    if (!inputEdge) return null;
    const mergedNodes = mergeLiveStudioNodeDataIntoNodes(nodes);
    const sourceNode = mergedNodes.find((n) => n.id === inputEdge.source);
    if (!sourceNode) return null;
    const url = resolveMediaUrlFromEdgeSource(inputEdge, nodes, edges).trim();
    if (!url) return null;
    let mediaType = 'image';
    if (sourceNode.type === 'space') {
      const sd = sourceNode.data as { outputType?: string; type?: string };
      mediaType = (sd.outputType || sd.type || 'image') as string;
    } else {
      mediaType = ((sourceNode.data as { type?: string })?.type || 'image') as string;
    }
    const s3Key =
      typeof (sourceNode.data as { s3Key?: unknown }).s3Key === 'string'
        ? (sourceNode.data as { s3Key: string }).s3Key
        : undefined;
    return { url, s3Key, mediaType, sourceId: inputEdge.source };
  }, [inputEdge, nodes, edges]);

  const inputMediaKey = connectedInputMedia
    ? `${connectedInputMedia.sourceId}:${connectedInputMedia.s3Key ?? connectedInputMedia.url}`
    : null;
  const inputMediaKeyRef = useRef<string | null>(inputMediaKey);

  const clearDescriberOutput = useCallback(() => {
    setDescription(null);
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, value: '' } } : n,
      ),
    );
  }, [id, setNodes]);

  const { displayUrl: inputPreviewUrl, retryWithBlob: retryInputPreview } = useAuthedMediaPreviewUrl(
    connectedInputMedia?.mediaType === 'image' ? connectedInputMedia.url : null,
    connectedInputMedia?.s3Key,
  );

  const hasImagePreview = Boolean(
    mediaConnected && connectedInputMedia?.mediaType === 'image' && inputPreviewUrl,
  );
  const isAnalyzing = status === 'running';
  const isAnalysisBusy = isAnalyzing || iconRevealActive;
  const showIconReveal = Boolean(
    hasImagePreview
    && mediaConnected
    && !errorMessage
    && (iconRevealActive || (isAnalyzing && revealedIconCount > 0)),
  );
  const showInputPreview = Boolean(hasImagePreview && !visibleDescription && !isAnalysisBusy && !errorMessage);
  const showAnalyzedView = Boolean(visibleDescription && mediaConnected && !isAnalysisBusy && !errorMessage);
  const showMediaError = Boolean(errorMessage && hasImagePreview && mediaConnected);
  const showAnalyzingShell = Boolean(isAnalysisBusy && hasImagePreview && mediaConnected && !showAnalyzedView && !errorMessage);
  const showMediaBackground = Boolean(hasImagePreview && (showInputPreview || showAnalyzingShell || showAnalyzedView || showIconReveal || showMediaError));
  const hasSizedInputImage = Boolean(
    hasImagePreview && inputPreviewUrl && inputImageSize?.url === inputPreviewUrl,
  );
  const inputImageWidth = hasSizedInputImage ? inputImageSize?.width ?? null : null;
  const inputImageHeight = hasSizedInputImage ? inputImageSize?.height ?? null : null;

  const clearIconRevealTimer = useCallback(() => {
    if (revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }
    if (revealIntervalRef.current) {
      clearInterval(revealIntervalRef.current);
      revealIntervalRef.current = null;
    }
  }, []);

  const startIconRevealProgress = useCallback(() => {
    clearIconRevealTimer();
    setIconRevealActive(true);
    setRevealedIconCount(0);
    revealTimeoutRef.current = setTimeout(() => {
      revealTimeoutRef.current = null;
      setRevealedIconCount(1);
      revealIntervalRef.current = setInterval(() => {
        setRevealedIconCount((prev) => {
          const next = Math.min(prev + 1, DESCRIBER_ANALYSIS_CATEGORY_ORDER.length);
          if (next >= DESCRIBER_ANALYSIS_CATEGORY_ORDER.length) {
            clearIconRevealTimer();
            setIconRevealActive(false);
          }
          return next;
        });
      }, DESCRIBER_ICON_REVEAL_MS);
    }, DESCRIBER_ICON_REVEAL_MS);
  }, [clearIconRevealTimer]);

  const resetAnalysisProgress = useCallback(() => {
    clearIconRevealTimer();
    setRevealedIconCount(0);
    setIconRevealActive(false);
  }, [clearIconRevealTimer]);

  useEffect(() => {
    if (inputMediaKey === inputMediaKeyRef.current) return;
    inputMediaKeyRef.current = inputMediaKey;
    userManuallyResizedRef.current = false;
    frameSyncKeyRef.current = null;
    if (inputMediaKey === null) return;
    clearDescriberOutput();
    setErrorMessage(null);
    resetAnalysisProgress();
  }, [inputMediaKey, clearDescriberOutput, resetAnalysisProgress]);

  useEffect(() => {
    if (!inputPreviewUrl || connectedInputMedia?.mediaType !== 'image') {
      frameSyncKeyRef.current = null;
      setInputImageSize(null);
      return;
    }

    let cancelled = false;
    void loadImageDimensions(inputPreviewUrl)
      .then(({ width, height }) => {
        if (cancelled) return;
        setInputImageSize((prev) => {
          if (prev?.url === inputPreviewUrl && prev.width === width && prev.height === height) return prev;
          return { url: inputPreviewUrl, width, height };
        });
      })
      .catch(() => {
        /* keep default frame if the connected image cannot be measured */
      });

    return () => {
      cancelled = true;
    };
  }, [connectedInputMedia?.mediaType, inputPreviewUrl]);

  useEffect(() => () => {
    clearIconRevealTimer();
  }, [clearIconRevealTimer]);

  const syncDescriberNodeFrame = useCallback(() => {
    if (userManuallyResizedRef.current) return;

    if (!hasSizedInputImage || inputImageWidth == null || inputImageHeight == null) {
      if (mediaConnected) return;
      const baseFrame = getNodeGridFrameForType('mediaDescriber');
      if (!baseFrame) return;
      const syncKey = 'empty';
      if (frameSyncKeyRef.current === syncKey) return;
      frameSyncKeyRef.current = syncKey;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const needsFrameSync = nodeFrameNeedsSync(n, baseFrame);
          const hasAspectRatio =
            typeof (n.data as { _foldderAspectRatio?: unknown })._foldderAspectRatio === 'number';
          if (!needsFrameSync && !hasAspectRatio) return n;
          const nextData = { ...(n.data as Record<string, unknown>) };
          delete nextData._foldderAspectRatio;
          return {
            ...n,
            width: baseFrame.width,
            height: baseFrame.height,
            measured: { width: baseFrame.width, height: baseFrame.height },
            data: nextData,
            style: { ...(n.style as React.CSSProperties), width: baseFrame.width, height: baseFrame.height },
          };
        }),
      );
      requestAnimationFrame(() => updateNodeInternals(id));
      return;
    }

    const syncKey = `${inputPreviewUrl}:${inputImageWidth}x${inputImageHeight}`;
    if (frameSyncKeyRef.current === syncKey) return;
    const aspectRatio =
      describerPhotoAspectRatio(inputImageWidth, inputImageHeight) ?? inputImageWidth / inputImageHeight;
    const nextFrame = resolveAspectLockedNodeFrame({
      node: currentNode,
      contentWidth: inputImageWidth,
      contentHeight: inputImageHeight,
      minWidth: 200,
      maxWidth: 960,
      minHeight: 120,
      maxHeight: STUDIO_NODE_MAX_HEIGHT,
      chromeHeight: 0,
    });
    frameSyncKeyRef.current = syncKey;
    setNodes((nds) => syncAspectLockedFrameForNode(nds as Node[], id, nextFrame, aspectRatio));
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [
    currentNode,
    hasSizedInputImage,
    id,
    inputImageHeight,
    inputImageWidth,
    inputPreviewUrl,
    mediaConnected,
    setNodes,
    updateNodeInternals,
  ]);

  useLayoutEffect(() => {
    syncDescriberNodeFrame();
  }, [syncDescriberNodeFrame]);

  const onRun = async () => {
    if (!inputEdge) {
      setStatus('error');
      setErrorMessage("Connect an image before generating a description.");
      return;
    }

    setStatus('running');
    setErrorMessage(null);
    resetAnalysisProgress();

    let capturedError = "";
    const ok = await runAiJobWithNotification({ nodeId: id, label: 'Image Describer' }, async () => {
      try {
        const mergedNodes = mergeLiveStudioNodeDataIntoNodes(nodes);
        const inputNode = mergedNodes.find((n) => n.id === inputEdge.source);
        if (!inputNode) throw new Error("Connect an image before generating a description.");

        const resolvedMediaUrl = await resolveMediaUrlForDescriber(inputEdge, nodes, edges);
        let finalMediaType: string;

        if (inputNode.type === 'space') {
          const sd = inputNode.data as { outputType?: string; type?: string };
          finalMediaType = (sd.outputType || sd.type || 'image') as string;
        } else {
          finalMediaType = ((inputNode.data as { type?: string })?.type || 'image') as string;
        }

        const describeInit: RequestInit = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: resolvedMediaUrl,
            type: finalMediaType,
            metadata: inputNode.data.metadata,
            s3Key: (inputNode.data as { s3Key?: string }).s3Key,
          }),
        };

        const preflightBlocked = await runWalletFetchPreflight({
          route: '/api/spaces/describe',
          requestInput: '/api/spaces/describe',
          requestInit: describeInit,
          fetcher: getOrigWindowFetch(),
        });
        if (preflightBlocked) {
          const preflightJson = await preflightBlocked.json().catch(() => ({})) as { error?: string };
          throw new Error(preflightJson.error || 'Operation cancelled before reserving balance.');
        }

        startIconRevealProgress();

        const res = await fetch('/api/spaces/describe', {
          ...describeInit,
          headers: {
            ...(describeInit.headers as Record<string, string>),
            [FOLDDER_WALLET_PREFLIGHT_SKIP_HEADER]: '1',
          },
        });
        const json = await readJsonWithHttpError<{ description?: string; error?: string }>(
          res,
          'POST /api/spaces/describe',
        );

        if (json.description) {
          setDescription(json.description);
          userManuallyResizedRef.current = false;
          setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, value: json.description } } : n)));
        } else {
          throw new Error(json.error || "Failed to analyze");
        }
      } catch (e: unknown) {
        capturedError = sanitizeUserFacingErrorMessage(e instanceof Error ? e.message : String(e));
        throw e;
      }
    });
    if (ok) {
      setStatus('success');
    } else {
      resetAnalysisProgress();
      clearDescriberOutput();
      setErrorMessage(
        capturedError ||
          "The visual description could not be generated. Check the connected image or API access.",
      );
      setStatus('idle');
      console.error("Describe error", capturedError);
    }
  };

  useRegisterAssistantNodeRun(id, onRun);

  const onCopyPrompt = useCallback(async () => {
    if (!visibleDescription) return;
    try {
      await navigator.clipboard.writeText(visibleDescription);
      setCopiedPrompt(true);
      window.setTimeout(() => setCopiedPrompt(false), 1500);
    } catch {
      // clipboard may be unavailable
    }
  }, [visibleDescription]);

  return (
    <div
      ref={frameRef}
      className={`custom-node describer-node foldder-node--frameless describer-node--expanded ${showMediaBackground ? 'node--media' : 'node--glass'} ${showAnalyzedView ? 'describer-node--analyzed' : showMediaError ? 'describer-node--error-media' : showAnalyzingShell || showIconReveal ? 'describer-node--analyzing' : showInputPreview ? 'describer-node--preview' : ''} ${mediaConnected ? 'describer-node--has-media' : 'describer-node--no-media'} ${errorMessage && !showMediaError ? 'foldder-node--error' : ''} ${isAnalysisBusy ? 'node-glow-running' : ''}`}
      style={{ minWidth: hasSizedInputImage ? 200 : 300, minHeight: hasSizedInputImage ? 0 : 330 }}
    >
      <FoldderNodeResizer
        minWidth={hasSizedInputImage ? 200 : 300}
        minHeight={hasSizedInputImage ? 120 : 300}
        maxWidth={hasSizedInputImage ? 960 : 700}
        maxHeight={STUDIO_NODE_MAX_HEIGHT}
        keepAspectRatio={hasSizedInputImage}
        isVisible={selected}
        onResizeEnd={() => {
          userManuallyResizedRef.current = true;
        }}
      />
      {showMediaBackground ? (
        <FoldderStudioTouchedMark nodeType="mediaDescriber" backgroundSrc={DESCRIBER_TOUCHED_MARK_SRC} />
      ) : null}
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Image Describer" />
      <div className="handle-wrapper handle-left">
        <FoldderDataHandle type="target" position={Position.Left} id="media" dataType="image" />
        <span className="handle-label">Media in</span>
      </div>

      <div className="node-header">
        <NodeIcon type="mediaDescriber" selected={selected} state={resolveFoldderNodeState({ loading: status === 'running', done: Boolean(visibleDescription) && !errorMessage, error: Boolean(errorMessage) })} size={16} />
        <FoldderNodeHeaderTitle introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}>
          Image Describer
        </FoldderNodeHeaderTitle>
        <div className="node-badge">VISION</div>
      </div>

      <div
        ref={previewFrameRef}
        className={`node-content foldder-frameless-main describer-node-content ${showMediaBackground ? 'describer-node-content--media-preview' : ''}`}
      >
        {errorMessage && !showMediaError ? (
          <div className="foldder-frameless-error describer-node-error shrink-0 rounded-none border border-rose-500/30 bg-rose-500/10 p-2 text-[9px] leading-snug text-rose-200">
            {errorMessage}
          </div>
        ) : null}

        {showMediaBackground ? (
          <img
            src={inputPreviewUrl}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            draggable={false}
            onError={() => {
              void retryInputPreview();
            }}
          />
        ) : null}

        {showMediaError ? (
          <div className="describer-node-error-banner absolute inset-0 z-[9] flex items-center justify-center px-6 nodrag nopan">
            <p className="describer-node-error-text">{errorMessage}</p>
          </div>
        ) : null}

        {showIconReveal ? (
          <DescriberNodeAnalysisOverlay mode="progress" revealedCount={revealedIconCount} />
        ) : null}

        {showAnalyzedView && visibleDescription ? (
          <>
            <DescriberNodeAnalysisOverlay
              mode="complete"
              description={visibleDescription}
              onCopy={() => void onCopyPrompt()}
              copied={copiedPrompt}
            />
            <span className="sr-only">{visibleDescription}</span>
          </>
        ) : null}

        {!showAnalyzedView && !showIconReveal ? (
        <div className="describer-output-body min-h-0 flex-1">
          {!mediaConnected ? (
            <div className="describer-node-empty" aria-label="No image connected">
              <div className="describer-node-empty-icon">
                <ImageIcon className="describer-node-empty-icon-glyph" size={26} strokeWidth={1.5} aria-hidden />
              </div>
            </div>
          ) : null}
        </div>
        ) : null}
      </div>

      {mediaConnected ? (
      <div className="foldder-frameless-footer-action nodrag describer-node-footer">
        <button
          type="button"
          className="execute-btn describer-generate-button nodrag"
          onClick={onRun}
          disabled={isAnalysisBusy}
        >
          {isAnalysisBusy ? 'Analyzing...' : visibleDescription ? 'Re-analyze' : 'Generate description'}
        </button>
      </div>
      ) : null}

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
    { id: '', label: 'Auto', icon: <div className="w-full h-full border border-dashed border-white/20 rounded-none" /> },
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
            compact ? 'gap-0.5 rounded-none p-1' : 'gap-1.5 rounded-none p-2'
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
  graphNegativePromptFromEdge: string;
  hasNegativePromptEdge: boolean;
  onGraphNegativePromptChange: (text: string) => void;
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
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-none border border-white/[0.1] bg-zinc-950/90 ring-1 ring-inset ring-white/[0.04]">
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
  graphNegativePromptFromEdge,
  hasNegativePromptEdge,
  onGraphNegativePromptChange,
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
  const [showApiPromptPreview, setShowApiPromptPreview] = useState(false);
  const promptLocalRef = useRef<HTMLTextAreaElement>(null);
  const isRunning = status === 'running';
  const activePromptValue = hasPromptEdge ? graphPromptFromEdge : nodeData.prompt ?? '';
  const activeNegativePrompt = hasNegativePromptEdge ? graphNegativePromptFromEdge : nodeData.negativePrompt ?? '';
  const activePromptSourceLabel = hasPromptEdge ? 'Grafo' : 'Local';
  const negativePromptSourceLabel = hasNegativePromptEdge ? 'Grafo' : 'Local';
  const hasPrompt =
    graphPromptFromEdge.trim().length > 0 ||
    (typeof nodeData.prompt === 'string' && nodeData.prompt.trim().length > 0);
  const historyPreview = historyUrls.slice(0, 4);
  const historyExtra = Math.max(0, historyUrls.length - historyPreview.length);

  const refSlots = useMemo(() => parseVideoRefSlots(nodeData.videoRefSlots), [nodeData.videoRefSlots]);
  const referenceImageCount = useMemo(
    () =>
      estimatedApiImageCount({
        graphFirstFrame: connectedFirstFrame,
        graphLastFrame: connectedLastFrame,
        extraSlots: refSlots,
      }),
    [connectedFirstFrame, connectedLastFrame, refSlots],
  );
  const referenceImageLimit = useSeedance ? SEEDANCE_REF_LIMITS.maxImages : 3;
  const veoFramesOverrideImageRefs = !useSeedance && Boolean(connectedFirstFrame || connectedLastFrame);
  const physicsForPrompt = useMemo(
    () =>
      buildPhysicsFlagsFromNodeData({
        videoPhysics_cloth: nodeData.videoPhysics_cloth,
        videoPhysics_fluid: nodeData.videoPhysics_fluid,
        videoPhysics_hair: nodeData.videoPhysics_hair,
        videoPhysics_collision: nodeData.videoPhysics_collision,
        videoPhysics_gravity: nodeData.videoPhysics_gravity,
      }),
    [
      nodeData.videoPhysics_cloth,
      nodeData.videoPhysics_collision,
      nodeData.videoPhysics_fluid,
      nodeData.videoPhysics_gravity,
      nodeData.videoPhysics_hair,
    ],
  );
  const promptAssembly = useMemo(
    () =>
      buildVideoPromptAssembly({
        basePrompt: activePromptValue,
        lightingId: nodeData.videoLightingPreset,
        visualStyleId: nodeData.videoVisualStylePreset,
        physics: physicsForPrompt,
        animationPrompt: nodeData.animationPrompt,
        cameraPreset: nodeData.cameraPreset,
        negativePrompt: activeNegativePrompt,
        includeNegativeInPreview: useSeedance,
      }),
    [
      activeNegativePrompt,
      activePromptValue,
      nodeData.animationPrompt,
      nodeData.cameraPreset,
      nodeData.videoLightingPreset,
      nodeData.videoVisualStylePreset,
      physicsForPrompt,
      useSeedance,
    ],
  );
  const finalPromptPreview =
    promptAssembly.readablePrompt ||
    'Escribe un prompt o conecta un nodo Prompt para ver aquí el texto final.';

  const writeActivePrompt = useCallback(
    (text: string) => {
      if (hasPromptEdge) onGraphPromptChange(text);
      else updateData('prompt', text);
    },
    [hasPromptEdge, onGraphPromptChange, updateData],
  );

  const writeActiveNegativePrompt = useCallback(
    (text: string) => {
      if (hasNegativePromptEdge) onGraphNegativePromptChange(text);
      else updateData('negativePrompt', text);
    },
    [hasNegativePromptEdge, onGraphNegativePromptChange, updateData],
  );

  const insertIntoPromptLocal = useCallback(
    (snippet: string) => {
      const cur = activePromptValue;
      const ins = snippet.endsWith(' ') ? snippet : `${snippet} `;
      const el = promptLocalRef.current;
      if (el) {
        const start = el.selectionStart ?? cur.length;
        const end = el.selectionEnd ?? cur.length;
        writeActivePrompt(cur.slice(0, start) + ins + cur.slice(end));
        requestAnimationFrame(() => {
          el.focus();
          const pos = start + ins.length;
          el.setSelectionRange(pos, pos);
        });
      } else {
        writeActivePrompt(`${cur}${cur && !cur.endsWith(' ') ? ' ' : ''}${ins}`);
      }
    },
    [activePromptValue, writeActivePrompt],
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
        if (key.startsWith('Image') && imgTotal > referenceImageLimit) {
          alert(
            `Máximo ${referenceImageLimit} imágenes de referencia para el motor seleccionado.`,
          );
          return;
        }
        updateData('videoRefSlots', next);
      };
      reader.readAsDataURL(file);
    },
    [refSlots, connectedFirstFrame, connectedLastFrame, referenceImageLimit, updateData],
  );

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

  const modelLabel = useSeedance ? 'Seedance' : 'Veo 3.1';

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden overscroll-none bg-[#0b0f14] text-white"
      data-foldder-studio-canvas=""
      data-foldder-gemini-video-studio=""
    >
      {standardShell ? <StandardStudioShellHeader shell={standardShell} /> : null}

      <FoldderStudioHeader
        nodeType="geminiVideo"
        nodeLabel="Video Generator"
        subtitle={`${modelLabel} · ${videoFormatForApi} · ${useSeedance ? '' : `${resolutionForApi} · `}${durationSecondsForApi}s · $${previewCost.totalUsd.toFixed(2)}`}
        onClose={onClose}
        closeLabel="Cerrar Studio"
        actions={
          <button
            type="button"
            onClick={onGenerate}
            disabled={isRunning || !hasPrompt}
            className={`${foldderStudioHeaderActionClassName()} bg-[#3239ba] hover:bg-[#3d45c9] disabled:bg-black/30`}
            title={!hasPrompt ? 'Prompt requerido' : 'Generar vídeo'}
          >
            {isRunning ? <Loader2 size={14} className="shrink-0 animate-spin" /> : <Zap size={14} className="shrink-0" />}
            {isRunning ? `${Math.round(progress)}%` : 'Generar'}
          </button>
        }
      />

      <div className="flex h-10 shrink-0 items-stretch divide-x divide-white/10 border-b border-white/10 bg-white/[0.04]">
        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
          {(
            [
              { key: 'veo31' as const, label: 'Veo 3.1' },
              { key: 'seedance2' as const, label: 'Seedance' },
            ] as const
          ).map((m) => {
            const active = (nodeData.videoModel || 'veo31') === m.key;
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
                    updateData('duration', String(Math.min(12, Math.max(2, Number(nodeData.duration) || 5))));
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
                className={`flex h-10 shrink-0 items-center px-4 text-[9px] font-black uppercase tracking-[0.1em] transition ${
                  active ? 'bg-[#3239ba]/25 text-white' : 'text-white/45 hover:bg-white/[0.04] hover:text-white/75'
                }`}
              >
                {m.label}
              </button>
            );
          })}
          <label className="flex h-10 shrink-0 items-center gap-1.5 border-l border-white/10 px-3">
            <RectangleHorizontal className="h-3.5 w-3.5 shrink-0 text-white/35" aria-hidden />
            <select
              className="cursor-pointer border-0 bg-transparent p-0 text-[10px] font-semibold text-white outline-none"
              value={videoFormatForApi}
              onChange={(e) => updateData('videoFormat', e.target.value)}
              title="Aspect ratio"
            >
              {(useSeedance ? SEEDANCE_ASPECT_OPTIONS : VEO_ASPECT_OPTIONS).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.value}
                </option>
              ))}
            </select>
          </label>
          {!useSeedance ? (
            <label className="flex h-10 shrink-0 items-center gap-1.5 border-l border-white/10 px-3">
              <Cpu className="h-3.5 w-3.5 shrink-0 text-white/35" aria-hidden />
              <select
                className="cursor-pointer border-0 bg-transparent p-0 text-[10px] font-semibold text-white outline-none"
                value={resolutionForApi}
                onChange={(e) => updateData('resolution', e.target.value)}
                title="Resolution"
              >
                {VEO_RESOLUTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.value}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex h-10 shrink-0 items-center gap-1.5 border-l border-white/10 px-3">
            <Clock className="h-3.5 w-3.5 shrink-0 text-white/35" aria-hidden />
            <select
              className="cursor-pointer border-0 bg-transparent p-0 text-[10px] font-semibold text-white outline-none"
              value={String(durationSecondsForApi)}
              onChange={(e) => updateData('duration', e.target.value)}
              title="Duration"
            >
              {(useSeedance ? SEEDANCE_DURATION_OPTIONS : veoDurationChoicesForResolution(resolutionForApi)).map((sec) => (
                <option key={sec} value={String(sec)}>
                  {sec}s
                </option>
              ))}
            </select>
          </label>
        </div>
        <span className="flex h-10 shrink-0 items-center gap-1.5 border-l border-white/10 px-3 text-[9px] font-semibold uppercase tracking-wide text-white/40">
          Prompt · {activePromptSourceLabel}
        </span>
      </div>

      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
          <div
            className="flex shrink-0 flex-col overflow-hidden border-r border-white/10 bg-black/20 transition-[width] duration-200"
            style={{ width: galleryOpen ? 96 : 36 }}
          >
            <button
              type="button"
              onClick={() => setGalleryOpen((o) => !o)}
              className="flex h-10 flex-col items-center justify-center gap-0.5 border-b border-white/10 text-white/45 transition hover:bg-white/[0.04] hover:text-white/75"
              title={galleryOpen ? 'Ocultar historial' : 'Historial'}
            >
              <History size={14} strokeWidth={1.75} className="shrink-0" />
              <ChevronRight size={9} className={`shrink-0 transition-transform ${galleryOpen ? 'rotate-180' : ''}`} />
            </button>
            {galleryOpen ? (
              <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-1">
                {historyUrls.length === 0 ? (
                  <p className="px-1 text-[9px] leading-tight text-white/30">Sin versiones</p>
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
                        className="relative h-12 w-full shrink-0 overflow-hidden border border-white/10 transition hover:border-[#3239ba]/60"
                        title={`Versión ${historyUrls.length - i}`}
                      >
                        <video src={url} className="h-full w-full object-cover" muted playsInline />
                        <span className="absolute bottom-0 right-0 bg-black/75 px-1 text-[8px] font-bold text-white/80">
                          {historyUrls.length - i}
                        </span>
                      </button>
                    ))}
                    {historyExtra > 0 ? (
                      <p className="text-center text-[9px] font-mono text-white/30">+{historyExtra}</p>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>

          <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-black/40 p-3">
            {outputVideo ? (
              <video src={outputVideo} className="max-h-full max-w-full object-contain" controls loop muted playsInline />
            ) : (
              <div className="flex max-w-xs flex-col items-center gap-2 px-4 text-center">
                <Video size={24} className="text-white/25" strokeWidth={1.25} />
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/35">Sin vídeo</p>
              </div>
            )}
            {isRunning ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
                <div className="h-0.5 w-full bg-white/10">
                  <div className="h-full bg-[#3239ba] transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="custom-scrollbar flex w-[min(100%,420px)] shrink-0 flex-col overflow-y-auto border-l border-white/10 bg-[#0b0f14] lg:w-[400px]">
          <div className="divide-y divide-white/10">
            <section className="p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-[9px] font-black uppercase tracking-[0.12em] text-white/50">Prompt</h2>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => insertIntoPromptLocal(DIRECTOR_PROMPT_TEMPLATE_EN)}
                    className="h-7 border border-white/10 px-2 text-[9px] font-semibold uppercase tracking-wide text-white/55 transition hover:bg-white/[0.04] hover:text-white"
                    title="Insertar plantilla 7 capas"
                  >
                    Plantilla
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowApiPromptPreview((v) => !v)}
                    className={`h-7 border px-2 text-[9px] font-semibold uppercase tracking-wide transition ${
                      showApiPromptPreview
                        ? 'border-[#3239ba]/40 bg-[#3239ba]/15 text-white'
                        : 'border-white/10 text-white/55 hover:bg-white/[0.04] hover:text-white'
                    }`}
                  >
                    Vista API
                  </button>
                </div>
              </div>
              <textarea
                ref={promptLocalRef}
                value={activePromptValue}
                onChange={(e) => writeActivePrompt(e.target.value)}
                rows={10}
                placeholder="Plano, sujeto, acción, entorno, luz, estilo y locks."
                className="min-h-[11rem] w-full resize-y border border-white/10 bg-black/30 px-3 py-2 text-[12px] leading-6 text-white placeholder:text-white/25 outline-none focus:border-[#3239ba]/50"
              />
              {showApiPromptPreview ? (
                <div className="mt-2 border border-white/10 bg-black/40 p-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[8px] font-black uppercase tracking-[0.1em] text-white/40">
                      Prompt enviado a la API
                      {promptAssembly.directorEnhancement ? ' · enriquecido' : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard?.writeText(finalPromptPreview)}
                      className="text-[8px] font-semibold uppercase tracking-wide text-white/45 hover:text-white"
                    >
                      Copiar
                    </button>
                  </div>
                  <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-5 text-white/70">
                    {finalPromptPreview}
                  </pre>
                </div>
              ) : null}
            </section>

            <section className="p-3">
              <h2 className="mb-2 text-[9px] font-black uppercase tracking-[0.12em] text-white/50">Dirección</h2>
              <div className="grid grid-cols-2 gap-2">
                <label className="min-w-0">
                  <span className="mb-1 block text-[8px] font-semibold uppercase tracking-wide text-white/35">Luz</span>
                  <select
                    className="h-8 w-full border border-white/10 bg-black/30 px-2 text-[11px] text-white outline-none"
                    value={nodeData.videoLightingPreset ?? ''}
                    onChange={(e) => updateData('videoLightingPreset', e.target.value || undefined)}
                  >
                    {VIDEO_LIGHTING_PRESETS.map((p) => (
                      <option key={p.id || 'none'} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="min-w-0">
                  <span className="mb-1 block text-[8px] font-semibold uppercase tracking-wide text-white/35">Estilo</span>
                  <select
                    className="h-8 w-full border border-white/10 bg-black/30 px-2 text-[11px] text-white outline-none"
                    value={nodeData.videoVisualStylePreset ?? ''}
                    onChange={(e) => updateData('videoVisualStylePreset', e.target.value || undefined)}
                  >
                    {VIDEO_VISUAL_STYLE_PRESETS.map((p) => (
                      <option key={p.id || 'none'} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="min-w-0">
                  <span className="mb-1 block text-[8px] font-semibold uppercase tracking-wide text-white/35">Animación</span>
                  <input
                    type="text"
                    value={nodeData.animationPrompt ?? ''}
                    onChange={(e) => updateData('animationPrompt', e.target.value)}
                    className="h-8 w-full border border-white/10 bg-black/30 px-2 text-[11px] text-white outline-none"
                    placeholder="Opcional"
                  />
                </label>
                <div className="min-w-0">
                  <span className="mb-1 block text-[8px] font-semibold uppercase tracking-wide text-white/35">Cámara</span>
                  <CameraMotionSelector compact value={nodeData.cameraPreset || ''} onChange={(val) => updateData('cameraPreset', val)} />
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1">
                {VIDEO_PHYSICS_OPTIONS.map((p) => {
                  const PI = physicIcon(p.id);
                  const checked = !!(nodeData as Record<string, unknown>)[`videoPhysics_${p.id}`];
                  return (
                    <label
                      key={p.id}
                      className={`flex min-h-8 cursor-pointer items-center gap-2 border px-2 text-[10px] transition ${
                        checked ? 'border-[#3239ba]/40 bg-[#3239ba]/12 text-white' : 'border-white/10 bg-black/20 text-white/45'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => updateData(`videoPhysics_${p.id}`, e.target.checked)}
                        className="h-3.5 w-3.5"
                      />
                      <PI className="h-3 w-3 shrink-0" aria-hidden />
                      <span className="truncate">{p.label}</span>
                    </label>
                  );
                })}
              </div>
            </section>

            <section className="p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="min-w-0">
                  <span className="mb-1 block text-[8px] font-semibold uppercase tracking-wide text-white/35">
                    Negative · {negativePromptSourceLabel}
                  </span>
                  <textarea
                    value={activeNegativePrompt}
                    onChange={(e) => writeActiveNegativePrompt(e.target.value)}
                    rows={3}
                    className="min-h-[4.5rem] w-full resize-y border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] leading-5 text-white outline-none"
                    placeholder="Evitar…"
                  />
                </label>
                {useSeedance ? (
                  <label className="flex min-h-[4.5rem] cursor-pointer items-center gap-2 border border-white/10 bg-black/20 px-3 text-[11px] text-white/70">
                    <input
                      type="checkbox"
                      checked={!!nodeData.audio}
                      onChange={(e) => updateData('audio', e.target.checked)}
                      className="h-3.5 w-3.5"
                    />
                    <Music className="h-3.5 w-3.5 shrink-0 text-white/50" />
                    Audio
                  </label>
                ) : (
                  <div className="flex min-h-[4.5rem] items-center border border-white/10 bg-black/20 px-3 text-[10px] leading-snug text-white/35">
                    Negative se envía por API al final del prompt ensamblado.
                  </div>
                )}
              </div>
            </section>

            <section className="p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-[9px] font-black uppercase tracking-[0.12em] text-white/50">Referencias</h2>
                <span
                  className={`text-[8px] font-semibold uppercase tracking-wide ${
                    veoFramesOverrideImageRefs ? 'text-amber-300/80' : 'text-white/35'
                  }`}
                >
                  {veoFramesOverrideImageRefs ? 'Frames del grafo activos' : `${referenceImageCount}/${referenceImageLimit}`}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <VideoStudioFrameSlot label="First frame" icon={ImageIcon} url={connectedFirstFrame} />
                <VideoStudioFrameSlot label="Last frame" icon={ArrowRightCircle} url={connectedLastFrame} />
              </div>
              <div className={`mt-2 grid grid-cols-3 gap-1.5 ${veoFramesOverrideImageRefs ? 'opacity-50' : ''}`}>
                {([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).slice(0, referenceImageLimit).map((n) => {
                  const key = `Image${n}` as VideoRefSlotImageKey;
                  const tag = refTag(key);
                  const url = refSlots[key];
                  return (
                    <div key={key} className="min-w-0">
                      <div className="relative aspect-square overflow-hidden border border-white/10 bg-black/30">
                        {url ? (
                          <img src={url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full min-h-[3.5rem] flex-col items-center justify-center gap-0.5">
                            <Upload className="h-3.5 w-3.5 text-white/25" strokeWidth={1.5} />
                            <span className="font-mono text-[9px] text-white/25">{n}</span>
                          </div>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          disabled={veoFramesOverrideImageRefs}
                          className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            setRefSlotFile(key, f ?? null);
                            e.target.value = '';
                          }}
                        />
                      </div>
                      {url ? (
                        <div className="mt-0.5 flex justify-center gap-1">
                          <button
                            type="button"
                            disabled={veoFramesOverrideImageRefs}
                            onClick={() => insertIntoPromptLocal(tag)}
                            className="px-1 font-mono text-[9px] text-white/45 hover:text-white disabled:opacity-40"
                          >
                            {tag}
                          </button>
                          <button
                            type="button"
                            onClick={() => setRefSlotFile(key, null)}
                            className="p-0.5 text-white/30 hover:text-rose-400"
                            title="Quitar"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </aside>
      </div>
    </div>,
    document.body,
  );
});
GeminiVideoStudio.displayName = 'GeminiVideoStudio';

const GEMINI_VIDEO_EMPTY_BACKGROUND_SRC = "/assets/nodes/gemini-video-empty-blue.png";

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
  const [studioTouched, setStudioTouched] = useState(
    () => hasGeminiVideoStudioTouched(nodeData as Record<string, unknown>),
  );
  const showStudioRef = useRef(false);
  const markVideoStudioTouchedRef = useRef<() => void>(() => {});
  useEffect(() => {
    showStudioRef.current = showStudio;
  }, [showStudio]);

  const markVideoStudioTouched = useCallback(() => {
    setStudioTouched(true);
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: touchStudioNodeData(n.data as Record<string, unknown>) } : n,
      ),
    );
  }, [id, setNodes]);

  useEffect(() => {
    markVideoStudioTouchedRef.current = markVideoStudioTouched;
  }, [markVideoStudioTouched]);

  useEffect(() => {
    if (!hasGeminiVideoStudioTouched(nodeData as Record<string, unknown>)) return;
    setStudioTouched(true);
    if (!hasFoldderStudioTouched(nodeData as Record<string, unknown>)) {
      markVideoStudioTouchedRef.current();
    }
  }, [id, nodeData]);

  const [standardShell, setStandardShell] = useState<StandardStudioShellConfig | null>(null);

  const openVideoStudio = useCallback(() => {
    setStandardShell(null);
    setShowStudio(true);
    markVideoStudioTouchedRef.current();
  }, []);
  const currentNode = nodes.find((node) => node.id === id);
  const currentFrameNode = useCurrentNodeFrameSnapshot(currentNode);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const frameSyncKeyRef = useRef<string | null>(null);

  const openVideoStudioFromPresenter = Boolean(
    (nodeData as { _foldderOpenVideoStudio?: boolean })._foldderOpenVideoStudio,
  );
  useEffect(() => {
    if (!openVideoStudioFromPresenter) return;
    const timer = window.setTimeout(() => {
      openVideoStudio();
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, _foldderOpenVideoStudio: undefined } } : n,
        ),
      );
    }, 140);
    return () => window.clearTimeout(timer);
  }, [id, openVideoStudio, openVideoStudioFromPresenter, setNodes]);

  useEffect(() => {
    const onOpenStudio = (ev: Event) => {
      const detail = (ev as CustomEvent<FoldderStudioEventDetail>).detail;
      if (detail?.nodeId !== id) return;
      setStandardShell(detail.standardShell ? { ...detail.standardShell, nodeId: id, nodeType: 'geminiVideo', fileId: detail.fileId, appId: detail.appId } : null);
      setShowStudio(true);
      markVideoStudioTouchedRef.current();
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
    const syncKey = `${videoFormatForApi}:${videoAspect.width}x${videoAspect.height}`;
    if (frameSyncKeyRef.current === syncKey) return;
    const chromeHeight = resolveNodeChromeHeight(frameRef.current, previewRef.current);
    const nextFrame = resolveAspectLockedNodeFrame({
      node: currentFrameNode,
      contentWidth: videoAspect.width,
      contentHeight: videoAspect.height,
      minWidth: 200,
      maxWidth: 960,
      minHeight: 120,
      maxHeight: STUDIO_NODE_MAX_HEIGHT,
      chromeHeight,
    });
    frameSyncKeyRef.current = syncKey;
    setNodes((nds) => syncAspectLockedFrameForNode(nds as Node[], id, nextFrame, videoAspect.width / videoAspect.height));
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [
    currentFrameNode,
    id,
    setNodes,
    updateNodeInternals,
    videoFormatForApi,
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

  const negativePromptEdgeForStudio = useMemo(
    () => edges.find((e) => e.target === id && e.targetHandle === 'negativePrompt'),
    [edges, id],
  );

  const graphNegativePromptFromEdge = useMemo(() => {
    if (!negativePromptEdgeForStudio) return '';
    return String(resolvePromptValueFromEdgeSource(negativePromptEdgeForStudio, nodes as Node[]) ?? '');
  }, [negativePromptEdgeForStudio, nodes]);

  const onGraphNegativePromptChange = useCallback(
    (text: string) => {
      if (!negativePromptEdgeForStudio) return;
      setNodes((nds) => applyPromptValueToEdgeSource(negativePromptEdgeForStudio, nds as Node[], text));
    },
    [negativePromptEdgeForStudio, setNodes],
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
    const negativePrompt = findSourceValue(negativePromptEdge) || nodeData.negativePrompt;
    const promptAssembly = buildVideoPromptAssembly({
      basePrompt,
      lightingId: nodeData.videoLightingPreset,
      visualStyleId: nodeData.videoVisualStylePreset,
      physics: buildPhysicsFlagsFromNodeData(nodeData as Record<string, unknown>),
      animationPrompt: nodeData.animationPrompt,
      cameraPreset: nodeData.cameraPreset,
      negativePrompt,
      includeNegativeInPreview: useSeedance,
    });
    const prompt = promptAssembly.promptForRequest;
    const firstFrame = findSourceValue(firstFrameEdge);
    const lastFrame = findSourceValue(lastFrameEdge);

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
            audio: useSeedance ? nodeData.audio || false : false,
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
            const outputPatch = {
              value: json.output,
              type: 'video',
              generatedByAi: true,
              generatedByAiSource: showStudioRef.current
                ? 'gemini-video-generator:studio'
                : 'gemini-video-generator',
              ...(typeof json.key === 'string' ? { s3Key: json.key } : {}),
              _assetVersions: versions,
            };
            return {
              ...n,
              data: showStudioRef.current
                ? touchStudioNodeData(n.data as Record<string, unknown>, outputPatch)
                : { ...n.data, ...outputPatch },
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

  const updateData = useCallback((key: string, val: unknown) => {
    if (showStudioRef.current) {
      setStudioTouched(true);
    }
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? {
              ...n,
              data: showStudioRef.current
                ? touchStudioNodeData(n.data as Record<string, unknown>, { [key]: val })
                : { ...n.data, [key]: val },
            }
          : n,
      ),
    );
  }, [id, setNodes]);

  const showGeminiVideoEmpty = !displayVideo;

  return (
    <div
      ref={frameRef}
      className={`custom-node processor-node gemini-video-node group/node foldder-node--frameless node--media ${studioTouched ? "foldder-node--studio-touched" : ""} ${showGeminiVideoEmpty ? "gemini-video-node--empty foldder-frameless-label-dark" : ""} ${status === 'error' ? 'foldder-node--error' : ''} ${isActivelyGenerating ? 'node-glow-running' : ''}`}
      style={{
        minWidth: 200,
        minHeight: 120,
        "--foldder-frameless-accent": useSeedance ? "#f97316" : "#8b5cf6",
      } as React.CSSProperties}
    >
      <FoldderNodeResizer minWidth={200} minHeight={120} maxWidth={960} maxHeight={STUDIO_NODE_MAX_HEIGHT} keepAspectRatio isVisible={selected} />
      {studioTouched ? <FoldderStudioTouchedMark nodeType="geminiVideo" /> : null}
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
        className={`gemini-video-preview foldder-frameless-main relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden group/out ${showGeminiVideoEmpty ? "" : "bg-[#0a0a0a]"}`}
        style={{ minHeight: 140 }}
      >
        {displayVideo ? (
          <>
            <video
              src={displayVideo}
              className="h-full w-full object-cover"
              controls
              loop
              muted
              playsInline
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 transition-opacity group-hover/out:opacity-100" />
            <div className="pointer-events-none absolute top-2 left-2 z-20 opacity-0 transition-opacity group-hover/out:opacity-100">
              <span className="rounded-none bg-black/55 px-1.5 py-0.5 text-[6px] font-black uppercase tracking-widest text-white/75">
                {useSeedance ? videoFormatForApi : resolutionForApi} · {durationSecondsForApi}s
              </span>
            </div>
          </>
        ) : (
          <div className="gemini-video-empty-background absolute inset-0 overflow-hidden" aria-hidden>
            <img
              src={GEMINI_VIDEO_EMPTY_BACKGROUND_SRC}
              alt=""
              className="h-full w-full object-contain object-bottom"
              draggable={false}
            />
          </div>
        )}

        <FoldderStudioModeCenterButton onClick={openVideoStudio} />

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
        <div className="foldder-frameless-footer-action nodrag flex shrink-0 px-2 py-2">
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
            className="execute-btn nodrag justify-center disabled:cursor-not-allowed disabled:opacity-40"
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
          graphNegativePromptFromEdge={graphNegativePromptFromEdge}
          hasNegativePromptEdge={!!negativePromptEdgeForStudio}
          onGraphNegativePromptChange={onGraphNegativePromptChange}
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
const PAINT_CANVAS_SIZE = 1024;
const PAINT_BRUSH_MIN = 1;
const PAINT_BRUSH_MAX = 80;

export const PainterNode = memo(function PainterNode({ id, data, selected }: NodeProps) {
  const { setNodes } = useReactFlow();
  const nodes = useNodes();
  const updateNodeInternals = useUpdateNodeInternals();
  const currentNode = nodes.find((node) => node.id === id);
  const currentFrameNode = useCurrentNodeFrameSnapshot(currentNode);
  const nodeData = data as BaseNodeData & {
    bgColor?: string; strokeColor?: string; brushSize?: number;
  };

  const canvasW = PAINT_CANVAS_SIZE;
  const canvasH = PAINT_CANVAS_SIZE;

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const cursorDotRef = useRef<HTMLDivElement>(null);   // ref-based cursor, no setState
  const painterStudioRootRef = useRef<HTMLDivElement>(null);
  const painterFrameSyncKeyRef = useRef<string | null>(null);
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
  const hasDrawingPreview = typeof data.value === 'string' && Boolean(data.value);
  const PAINTER_TOUCHED_MARK_SRC = "/nodes/painter-mark.png";

  useLayoutEffect(() => {
    if (!hasDrawingPreview) {
      painterFrameSyncKeyRef.current = null;
      return;
    }
    const syncKey = "1:1:drawing";
    if (painterFrameSyncKeyRef.current === syncKey) return;
    const nextFrame = resolveAspectLockedNodeFrame({
      node: currentFrameNode,
      contentWidth: PAINT_CANVAS_SIZE,
      contentHeight: PAINT_CANVAS_SIZE,
      minWidth: 200,
      maxWidth: 960,
      minHeight: 200,
      maxHeight: STUDIO_NODE_MAX_HEIGHT,
      chromeHeight: 0,
    });
    painterFrameSyncKeyRef.current = syncKey;
    setNodes((nds) => syncAspectLockedFrameForNode(nds as Node[], id, nextFrame, 1));
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [currentFrameNode, hasDrawingPreview, id, setNodes, updateNodeInternals]);

  const openPainterStudio = useCallback(() => {
    setStandardShell(null);
    setFullscreen(true);
  }, []);

  const closePainterStudio = useCallback(() => {
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
  }, [id, standardShell]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePainterStudio();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, closePainterStudio]);

  const updateData = useCallback((key: string, val: unknown) =>
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, [key]: val } } : n))
  , [id, setNodes]);

  useEffect(() => {
    if (!fullscreen) return;
    const root = painterStudioRootRef.current;
    if (!root) return;

    const onWheel = (e: WheelEvent) => {
      if (!(e.target instanceof Node) || !root.contains(e.target)) return;
      if ((e.target as Element).closest?.('[data-painter-studio-controls]')) return;

      e.preventDefault();
      e.stopPropagation();

      const sign = e.deltaY > 0 ? -1 : 1;
      const step = Math.max(1, Math.min(10, Math.round(Math.abs(e.deltaY) / 20)));
      const next = Math.min(
        PAINT_BRUSH_MAX,
        Math.max(PAINT_BRUSH_MIN, brushSizeRef.current + sign * step),
      );
      if (next === brushSizeRef.current) return;
      brushSizeRef.current = next;
      setBrushSize(next);
      updateData('brushSize', next);
    };

    root.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => root.removeEventListener('wheel', onWheel, { capture: true });
  }, [fullscreen, updateData]);

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
    } else {
      ctx.fillStyle = bgHexRef.current;
      ctx.fillRect(0, 0, canvasW, canvasH);
      saveToNode();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasW, canvasH, fullscreen]);

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

  const controlsJSX = () => (
    <div className="bg-[#1a1a1a] border-t border-white/10 p-3" data-painter-studio-controls="">
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
          className={`ml-1 p-1.5 rounded-none border transition-all ${mode === 'eraser' ? 'bg-white/20 border-white/40 text-white' : 'bg-white/[0.03] border-white/10 text-zinc-500 hover:text-white'}`}>
          <Eraser size={13} />
        </button>
        <button onClick={clearCanvas} className="ml-auto text-[9px] text-zinc-600 hover:text-red-400 transition-colors font-bold uppercase tracking-widest">Clear</button>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
          Scroll · grosor {brushSize}px
        </span>
        <div className="flex items-center gap-1.5">
          <button onClick={() => switchBg('white')} title="White bg"
            className={`w-5 h-5 rounded-none border-2 transition-all ${bgColor === 'white' ? 'border-white' : 'border-zinc-600 opacity-50'}`}
            style={{ background: '#ffffff' }} />
          <button onClick={() => switchBg('black')} title="Black bg"
            className={`w-5 h-5 rounded-none border-2 transition-all ${bgColor === 'black' ? 'border-white' : 'border-zinc-600 opacity-50'}`}
            style={{ background: '#111111' }} />
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={`custom-node tool-node painter-node foldder-node--frameless ${hasDrawingPreview ? 'node--media painter-node--has-preview' : 'node--glass painter-node--empty foldder-frameless-label-dark'}`}
      style={{
        padding: 0,
        overflow: 'visible',
        minWidth: 200,
        minHeight: hasDrawingPreview ? 200 : 300,
        '--foldder-node-card-bg': '#890AF3',
        '--foldder-frameless-glass-bg': '#890AF3',
        '--foldder-frameless-accent': '#1f2328',
      } as React.CSSProperties}
    >
      <FoldderNodeResizer minWidth={200} minHeight={hasDrawingPreview ? 200 : 120} maxWidth={960} maxHeight={STUDIO_NODE_MAX_HEIGHT} keepAspectRatio={hasDrawingPreview} isVisible={selected} />
      {hasDrawingPreview ? <FoldderStudioTouchedMark nodeType="painter" backgroundSrc={PAINTER_TOUCHED_MARK_SRC} /> : null}
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Painter" />


      <div className="node-header">
        <NodeIcon type="painter" selected={selected} size={16} />
        <FoldderNodeHeaderTitle introActive={!!(data as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}>
          Painter
        </FoldderNodeHeaderTitle>
      </div>

      {!fullscreen && (
        <>
          <div style={{ width: 0, height: 0, overflow: 'hidden', position: 'absolute' }}>
            {canvasJSX}
          </div>

          <div className="node-content foldder-frameless-main painter-node-main">
            {!hasDrawingPreview ? (
              <img
                src="/nodes/painter-bg.png"
                alt=""
                className="painter-node-bg"
                draggable={false}
              />
            ) : null}

            {hasDrawingPreview ? (
              <div className="painter-node-preview">
                <div
                  className="painter-node-preview-frame max-h-full max-w-full min-h-0 min-w-0"
                  style={{ aspectRatio: "1 / 1" }}
                >
                  <img
                    src={data.value as string}
                    className="painter-node-preview-img block h-full w-full object-contain"
                    alt="Drawing preview"
                    draggable={false}
                  />
                </div>
              </div>
            ) : null}

            <FoldderStudioModeCenterButton label="Paint" title="Paint" onClick={openPainterStudio} />
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
          ref={painterStudioRootRef}
          className="fixed inset-0 z-[100050] flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden overscroll-none bg-[#0b0f14] text-white"
          data-foldder-studio-canvas=""
        >
          {standardShell ? (
            <StandardStudioShellHeader shell={standardShell} />
          ) : (
            <FoldderStudioHeader
              nodeType="painter"
              nodeLabel={nodeData.label?.trim() || "Painter"}
              onClose={closePainterStudio}
            />
          )}
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
            <div className="h-full w-full max-h-full max-w-full" style={{ aspectRatio: '1 / 1' }}>
              {canvasJSX}
            </div>
          </div>
          {controlsJSX()}
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

const CROP_OUTPUT_MAX_SIDE = 2048;

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
const CROP_TOUCHED_MARK_SRC = "/nodes/crop-mark.png";

export const CropNode = memo(function CropNode({ id, data, selected }: NodeProps) {
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const edges = useEdges();
  const nodes = useNodes();
  const currentNode = nodes.find((node) => node.id === id);
  const currentFrameNode = useCurrentNodeFrameSnapshot(currentNode);
  
  const nodeData = data as BaseNodeData & { 
    aspectRatio?: string,
    cropConfig?: { x: number, y: number, w: number, h: number }
  };
  
  const [aspectRatio, setAspectRatio] = useState(nodeData.aspectRatio || 'free'); 
  const [crop, setCrop] = useState<CropRect>(nodeData.cropConfig || { x: 10, y: 10, w: 80, h: 80 }); 
  
  const previewRef = useRef<HTMLImageElement>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cropFrameSyncKeyRef = useRef<string | null>(null);
  const [sourceImageSize, setSourceImageSize] = useState<{ url: string; width: number; height: number } | null>(null);
  
  const [draggingAction, setDraggingAction] = useState<CropDragAction | null>(null);
  const [dragStartInfo, setDragStartInfo] = useState<{ startX: number, startY: number, initialCrop: CropRect } | null>(null);
  const aspectRatioRef = useRef(aspectRatio);
  const latestCropRef = useRef(crop);
  useEffect(() => {
    latestCropRef.current = crop;
  }, [crop]);
  useEffect(() => {
    aspectRatioRef.current = aspectRatio;
  }, [aspectRatio]);
  useEffect(() => {
    const persistedAspectRatio = nodeData.aspectRatio || 'free';
    if (persistedAspectRatio !== aspectRatioRef.current) {
      aspectRatioRef.current = persistedAspectRatio;
      setAspectRatio(persistedAspectRatio);
    }
  }, [nodeData.aspectRatio]);
  useEffect(() => {
    if (!nodeData.cropConfig) return;
    const nextCrop = clampCropRect(nodeData.cropConfig);
    const currentCrop = latestCropRef.current;
    const changed =
      Math.abs(currentCrop.x - nextCrop.x) > 0.01 ||
      Math.abs(currentCrop.y - nextCrop.y) > 0.01 ||
      Math.abs(currentCrop.w - nextCrop.w) > 0.01 ||
      Math.abs(currentCrop.h - nextCrop.h) > 0.01;
    if (!changed) return;
    latestCropRef.current = nextCrop;
    setCrop(nextCrop);
  }, [nodeData.cropConfig]);

  const inputEdge = edges.find(e => e.target === id && e.targetHandle === 'image');
  const inputNode = nodes.find(n => n.id === inputEdge?.source);
  const sourceHandle = inputEdge?.sourceHandle;
  const rawValue = sourceHandle 
    ? (inputNode?.data[sourceHandle] || inputNode?.data[`result_${sourceHandle}`] || inputNode?.data.value)
    : inputNode?.data?.value;
    
  const sourceImage = typeof rawValue === 'string' ? rawValue : undefined;
  const hasSource = Boolean(sourceImage);

  useEffect(() => {
    if (!sourceImage) {
      cropFrameSyncKeyRef.current = null;
      return;
    }
    let cancelled = false;
    loadImageDimensions(sourceImage)
      .then(({ width, height }) => {
        if (!cancelled) setSourceImageSize({ url: sourceImage, width, height });
      })
      .catch(() => {
        if (!cancelled) setSourceImageSize(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceImage]);

  useLayoutEffect(() => {
    if (!sourceImage || sourceImageSize?.url !== sourceImage) return;
    const syncKey = `${sourceImage}:${sourceImageSize.width}x${sourceImageSize.height}`;
    if (cropFrameSyncKeyRef.current === syncKey) return;
    const nextFrame = resolveAspectLockedNodeFrame({
      node: currentFrameNode,
      contentWidth: sourceImageSize.width,
      contentHeight: sourceImageSize.height,
      minWidth: 200,
      maxWidth: 960,
      minHeight: 120,
      maxHeight: STUDIO_NODE_MAX_HEIGHT,
      chromeHeight: resolveNodeChromeHeight(frameRef.current, containerRef.current),
    });
    cropFrameSyncKeyRef.current = syncKey;
    setNodes((nds) => syncAspectLockedFrameForNode(nds as Node[], id, nextFrame, sourceImageSize.width / sourceImageSize.height));
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [
    currentFrameNode,
    id,
    setNodes,
    sourceImage,
    sourceImageSize,
    updateNodeInternals,
  ]);

  const updateData = useCallback((key: string, val: unknown) => {
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, [key]: val } } : n));
  }, [id, setNodes]);

  const setCropAspectMode = useCallback((nextAspectRatio: string) => {
    aspectRatioRef.current = nextAspectRatio;
    setAspectRatio(nextAspectRatio);
    updateData('aspectRatio', nextAspectRatio);
  }, [updateData]);
  
  const commitCropRect = useCallback(
    (rect: CropRect, rectAspectRatio = aspectRatioRef.current) => {
      if (!sourceImage || !containerRef.current) return;
      const boundedRect = clampCropRect(rect);

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

          const cropLeft = (boundedRect.x / 100) * cw;
          const cropTop = (boundedRect.y / 100) * ch;
          const cropWpx = (boundedRect.w / 100) * cw;
          const cropHpx = (boundedRect.h / 100) * ch;

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

          const outputScale = Math.min(1, CROP_OUTPUT_MAX_SIDE / Math.max(sw, sh, 1));
          const outW = Math.max(1, Math.round(sw * outputScale));
          const outH = Math.max(1, Math.round(sh * outputScale));

          canvas.width = outW;
          canvas.height = outH;
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

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
                      cropConfig: boundedRect,
                      aspectRatio: rectAspectRatio,
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
    [sourceImage, id, setNodes],
  );

  useEffect(() => {
    if (!sourceImage) return;
    const t = window.setTimeout(() => {
      commitCropRect(latestCropRef.current);
    }, 150);
    return () => clearTimeout(t);
  }, [commitCropRect, sourceImage]);

  const handlePointerDown = (e: React.PointerEvent, action: CropDragAction) => {
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

    const lockedRatio = cropAspectRatioValue(aspectRatioRef.current);
    if (draggingAction !== 'move' && lockedRatio) {
      const next = resizeCropRectToVisualAspect(
        dragStartInfo.initialCrop,
        draggingAction,
        deltaX,
        deltaY,
        lockedRatio,
        rect,
      );
      latestCropRef.current = next;
      setCrop(next);
      return;
    }

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

    const next = clampCropRect({ x: newX, y: newY, w: newW, h: newH });
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
    <div
      ref={frameRef}
      className={`custom-node crop-node foldder-node--frameless ${hasSource ? 'node--media crop-node--has-source' : 'node--glass crop-node--empty foldder-frameless-label-dark'}`}
      style={{
        padding: 0,
        overflow: 'visible',
        minWidth: 200,
        minHeight: hasSource ? 120 : 300,
        '--foldder-node-card-bg': '#F0804D',
        '--foldder-frameless-glass-bg': '#F0804D',
        '--foldder-frameless-accent': '#1f2328',
      } as React.CSSProperties}
    >
      <FoldderNodeResizer minWidth={200} minHeight={120} maxWidth={960} maxHeight={STUDIO_NODE_MAX_HEIGHT} keepAspectRatio={hasSource} isVisible={selected} />
      {hasSource ? <FoldderStudioTouchedMark nodeType="crop" backgroundSrc={CROP_TOUCHED_MARK_SRC} /> : null}
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Crop Asset" />

      <div className="node-header">
        <NodeIcon type="crop" selected={selected} state={resolveFoldderNodeState({ selected, done: Boolean(nodeData.value) })} size={16} />
        <FoldderNodeHeaderTitle introActive={!!(data as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}>
          Crop
        </FoldderNodeHeaderTitle>
      </div>
      
      <div className="handle-wrapper handle-left">
        <FoldderDataHandle type="target" position={Position.Left} id="image" dataType="image" />
        <span className="handle-label text-emerald-500">Source Image</span>
      </div>

      <div className="node-content foldder-frameless-main crop-node-main">
        {!hasSource ? (
          <img
            src="/nodes/crop-bg.png"
            alt=""
            className="crop-node-bg"
            draggable={false}
          />
        ) : (
          <>
            <div
              ref={containerRef}
              className="crop-node-crop-area relative flex min-h-0 flex-1 items-center justify-center overflow-hidden touch-none select-none nodrag nopan"
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              <img
                ref={previewRef}
                src={sourceImage}
                alt="Source"
                className="crop-node-source-img pointer-events-none block h-full w-full min-h-0 object-contain"
              />

              <div className="pointer-events-none absolute inset-0 bg-black/40" />

              <div
                className="group/crop absolute cursor-move border border-amber-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
                style={{
                  left: `${crop.x}%`,
                  top: `${crop.y}%`,
                  width: `${crop.w}%`,
                  height: `${crop.h}%`,
                  pointerEvents: draggingAction !== null ? 'none' : 'auto',
                }}
                onPointerDown={(e) => handlePointerDown(e, 'move')}
              >
                <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-0 transition-opacity group-hover/crop:opacity-50">
                  <div className="border-b border-r border-amber-400/40" />
                  <div className="border-b border-r border-amber-400/40" />
                  <div className="border-b border-amber-400/40" />
                  <div className="border-b border-r border-amber-400/40" />
                  <div className="border-b border-r border-amber-400/40" />
                  <div className="border-b border-amber-400/40" />
                  <div className="border-r border-amber-400/40" />
                  <div className="border-r border-amber-400/40" />
                  <div />
                </div>

                <div className="pointer-events-auto absolute -left-1.5 -top-1.5 h-3 w-3 cursor-nwse-resize border border-amber-500 bg-white shadow-sm" onPointerDown={(e) => handlePointerDown(e, 'nw')} />
                <div className="pointer-events-auto absolute -right-1.5 -top-1.5 h-3 w-3 cursor-nesw-resize border border-amber-500 bg-white shadow-sm" onPointerDown={(e) => handlePointerDown(e, 'ne')} />
                <div className="pointer-events-auto absolute -bottom-1.5 -left-1.5 h-3 w-3 cursor-nesw-resize border border-amber-500 bg-white shadow-sm" onPointerDown={(e) => handlePointerDown(e, 'sw')} />
                <div className="pointer-events-auto absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize border border-amber-500 bg-white shadow-sm" onPointerDown={(e) => handlePointerDown(e, 'se')} />
              </div>
            </div>

            <div className="crop-node-aspect-dock nodrag">
              <select
                value={aspectRatio}
                onChange={(e) => {
                  const v = e.target.value;
                  setCropAspectMode(v);
                  const targetRatio = cropAspectRatioValue(v);
                  const bounds = containerRef.current?.getBoundingClientRect();
                  let next = clampCropRect({ ...latestCropRef.current });
                  if (targetRatio && bounds) {
                    next = fitCropRectToVisualAspect(next, targetRatio, bounds);
                  }
                  latestCropRef.current = next;
                  setCrop(next);
                  window.setTimeout(() => commitCropRect(next, v), 0);
                }}
                className="crop-node-aspect-select nodrag"
                aria-label="Aspect ratio"
              >
                <option value="free">Freeform</option>
                <option value="1:1">1:1 Square</option>
                <option value="16:9">16:9 Wide</option>
                <option value="9:16">9:16 Story</option>
              </select>
            </div>
          </>
        )}
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
