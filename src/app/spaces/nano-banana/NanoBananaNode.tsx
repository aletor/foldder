"use client";

import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps } from "react";
import { createPortal, flushSync } from "react-dom";
import {
  NodeResizer,
  useNodeId,
  useReactFlow,
  useNodes,
  useStore,
  useUpdateNodeInternals,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowState,
} from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { Camera, ChevronLeft, ChevronRight, Eye, Globe, ImageIcon, Loader2, Maximize2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { FOLDDER_FIT_VIEW_EASE } from "@/lib/fit-view-ease";
import { runAiJobWithNotification } from "@/lib/ai-job-notifications";
import { isNodeAiExecutionActive, subscribeActiveAiJobs } from "@/lib/ai-active-jobs";
import { aiHudNanoBananaJobProgress, getAiHudNanoBananaJobProgressForNode } from "@/lib/ai-hud-generation-progress";
import { geminiGenerateWithServerProgress } from "@/lib/gemini-generate-stream-client";
import { openaiGenerateWithServerProgress } from "@/lib/openai-generate-stream-client";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
import { usePreventBrowserPinchZoom } from "@/lib/use-prevent-browser-pinch-zoom";
import { useInputMode } from "../input-mode-context";
import { useNanoBananaViewerTouch } from "./nano-banana-viewer-touch";
import { useBrainNodeTelemetry } from "@/lib/brain/use-brain-node-telemetry";
import type { BrainImageGeneratorPromptDiagnostics } from "@/lib/brain/build-brain-visual-prompt-context";
import {
  FoldderNodeContentDock,
  FoldderNodeContentDockActions,
  FoldderNodeContentDockMain,
  FoldderNodeContentMeta,
  FoldderNodeContentMetaRow,
  FoldderStudioModeCenterButton,
} from "../foldder-node-ui";
import { StudioCanvasNodeShell, type StudioCanvasNodeHandleSpec } from "../studio-node/studio-canvas-node";
import { getNodeGridFrameForType, growCanvasDimensionToGrid } from "../canvas-grid-layout";
import { resolveNodeFrameWidth } from "../studio-node-aspect";
import { NanoBananaNodeExteriorGridCell } from "./nano-banana-node-exterior-grid-cell";
import { NanoBananaNodeExteriorHistoryThumb } from "./nano-banana-node-exterior-history-thumb";
import { NanoBananaNodeDockProviderSelect } from "./nano-banana-node-dock-provider-select";
import {
  FoldderStudioHeader,
  foldderStudioHeaderActionClassName,
} from "../FoldderStudioHeader";
import { type FoldderStudioEventDetail } from "../desktop-studio-events";
import { applyCanvasGroupCollapse, resolvePromptValueFromEdgeSourceMap } from "../canvas-group-logic";
import { resolveMediaUrlFromEdgeSource } from "../resolve-connected-media-url";
import { useAuthedMediaPreviewUrl } from "../hooks/use-authed-media-preview-url";
import { normalizeGenerativeImagePrompt } from "@/lib/normalize-generative-image-prompt";
import { nodeFrameNeedsSync, parseAspectRatioValue, resolveAspectLockedNodeFrame, resolveNodeChromeHeight } from "../studio-node-aspect";
import { takePendingNanoStudioOpenFromCine } from "../cine/cine-nano-open-pending";
import type { CineImageStudioResult, CineImageStudioSession } from "../cine-types";
import { useRegisterAssistantNodeRun } from "../use-assistant-node-run";
import { nodeFrameFromSnapshot, selectNodeFrameSnapshot } from "../react-flow-selectors";
import { useCanvasPerformanceModeRef } from "../use-canvas-performance-mode";
import { useFoldderRenderMetric } from "../use-performance-metrics";
import { useNodeViewportVisibility } from "../use-node-viewport-visibility";
import { hasFoldderStudioTouched, hasNanoBananaStudioTouched, touchStudioNodeData } from "../studio-node/foldder-studio-touched";

interface BaseNodeData {
  value?: string;
  value2?: string;
  duration?: number;
  resolution?: string;
  aspect_ratio?: string;
  _foldderAspectRatio?: number;
  label?: string;
  loading?: boolean;
  error?: boolean;
  uploadError?: string;
}

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

const STUDIO_NODE_MAX_HEIGHT = 2200;
const NANO_BANANA_EMPTY_BACKGROUND_SRC = "/assets/nodes/nano-banana-empty-pink.png";
const NANO_BANANA_ACCENT = "#f16389";
const NANO_BANANA_DOCK_MIN_CHROME = 180;
const NANO_BANANA_CONNECTED_PREVIEW_MIN = 140;

function resolveNanoBananaNodeHeight(args: { baseHeight: number; hasDock: boolean }): number {
  if (!args.hasDock) return args.baseHeight;
  return Math.min(
    STUDIO_NODE_MAX_HEIGHT,
    growCanvasDimensionToGrid(Math.max(args.baseHeight, NANO_BANANA_CONNECTED_PREVIEW_MIN + NANO_BANANA_DOCK_MIN_CHROME)),
  );
}

function mapNanoBananaStatusLabel(status: string, isEmpty: boolean, isActivelyGenerating: boolean): string {
  if (isActivelyGenerating) return "Generando…";
  if (isEmpty) return "Vacío";
  if (status === "error") return "Error";
  if (status === "success") return "Listo";
  return "Conectado";
}

export type NanoBananaImageProvider = "gemini" | "openai";

function resolveNanoBananaImageProvider(value: unknown): NanoBananaImageProvider {
  return value === "openai" ? "openai" : "gemini";
}

function FoldderNodeResizer(props: ComponentProps<typeof NodeResizer>) {
  return <NodeResizer {...props} />;
}

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

const NANO_FLOW_SNAPSHOT_BRAIN = 0;
const NANO_FLOW_SNAPSHOT_PROMPT_CONNECTED = 1;
const NANO_FLOW_SNAPSHOT_PROMPT_VALUE = 2;
const NANO_FLOW_SNAPSHOT_REFS_START = 3;

function selectNanoBananaFlowSnapshot(state: ReactFlowState<Node, Edge>, nodeId: string): string[] {
  const result = new Array<string>(NANO_FLOW_SNAPSHOT_REFS_START + REF_SLOTS.length * 2).fill("");
  const refEdges = new Map<string, Edge>();
  let brainConnected = false;
  let promptEdge: Edge | undefined;

  for (const edge of state.edges) {
    if (edge.target !== nodeId) continue;
    if (!brainConnected && edge.targetHandle === "brain") {
      brainConnected = true;
    } else if (!promptEdge && edge.targetHandle === "prompt") {
      promptEdge = edge;
    }
    for (const slot of REF_SLOTS) {
      if (!refEdges.has(slot.id) && edge.targetHandle === slot.id) {
        refEdges.set(slot.id, edge);
      }
    }
  }

  const nodesById = state.nodeLookup as unknown as ReadonlyMap<string, Node>;
  const nodesList = Array.from(nodesById.values());
  result[NANO_FLOW_SNAPSHOT_BRAIN] = brainConnected ? "1" : "0";
  result[NANO_FLOW_SNAPSHOT_PROMPT_CONNECTED] = promptEdge ? "1" : "0";
  result[NANO_FLOW_SNAPSHOT_PROMPT_VALUE] = promptEdge ? resolvePromptValueFromEdgeSourceMap(promptEdge, nodesById) : "";
  REF_SLOTS.forEach((slot, index) => {
    const edge = refEdges.get(slot.id);
    const base = NANO_FLOW_SNAPSHOT_REFS_START + index * 2;
    result[base] = edge ? "1" : "0";
    result[base + 1] = edge ? resolveMediaUrlFromEdgeSource(edge, nodesList, state.edges) : "";
  });

  return result;
}

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

const ANALYZE_AREAS_SOFT_IMAGE_BYTES = 850_000;

function isDataImageUrl(value: unknown): value is string {
  return typeof value === 'string' && /^data:image\/[^;,]+(?:;[^,]*)?;base64,/i.test(value);
}

function loadImageElement(src: string, options?: { crossOrigin?: boolean }): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (options?.crossOrigin && !src.startsWith('data:') && !src.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo preparar la imagen para analizar áreas.'));
    img.src = src;
  });
}

async function loadCanvasSafeImageElement(src: string): Promise<{ img: HTMLImageElement; cleanup: () => void }> {
  const s3Key = tryExtractKnowledgeFilesKeyFromUrl(src);
  if (s3Key) {
    const res = await fetch(`/api/spaces/s3-download?key=${encodeURIComponent(s3Key)}`, { cache: 'no-store' });
    if (res.ok) {
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        const img = await loadImageElement(objectUrl);
        return { img, cleanup: () => URL.revokeObjectURL(objectUrl) };
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        throw error;
      }
    }
  }

  return {
    img: await loadImageElement(src, { crossOrigin: true }),
    cleanup: () => {},
  };
}

async function compactImageForAnalyzeAreas(
  src: string | null | undefined,
  options?: { maxSide?: number; quality?: number; maxBytes?: number },
): Promise<string | null> {
  if (!src) return null;
  if (!isDataImageUrl(src) || typeof document === 'undefined') return src;
  const maxBytes = options?.maxBytes ?? ANALYZE_AREAS_SOFT_IMAGE_BYTES;
  if (src.length <= maxBytes) return src;

  const img = await loadImageElement(src);
  let maxSide = options?.maxSide ?? 1280;
  let quality = options?.quality ?? 0.72;
  let best = src;

  for (let attempt = 0; attempt < 4; attempt++) {
    const scale = Math.min(
      1,
      maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height, 1),
    );
    const width = Math.max(1, Math.round((img.naturalWidth || img.width || 1) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || img.height || 1) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return best;
    ctx.drawImage(img, 0, 0, width, height);
    best = canvas.toDataURL('image/jpeg', quality);
    if (best.length <= maxBytes) return best;
    maxSide = Math.max(480, Math.floor(maxSide * 0.72));
    quality = Math.max(0.52, quality - 0.08);
  }

  return best;
}

async function compactMaskForAnalyzeAreas(
  src: string | null | undefined,
  options?: { maxSide?: number; maxBytes?: number },
): Promise<string | null> {
  if (!src) return null;
  if (!isDataImageUrl(src) || typeof document === 'undefined') return src;
  const maxBytes = options?.maxBytes ?? ANALYZE_AREAS_SOFT_IMAGE_BYTES;
  if (src.length <= maxBytes) return src;

  const img = await loadImageElement(src);
  let maxSide = options?.maxSide ?? 960;
  let best = src;

  for (let attempt = 0; attempt < 5; attempt++) {
    const scale = Math.min(
      1,
      maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height, 1),
    );
    const width = Math.max(1, Math.round((img.naturalWidth || img.width || 1) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || img.height || 1) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return best;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    best = canvas.toDataURL('image/png');
    if (best.length <= maxBytes) return best;
    maxSide = Math.max(360, Math.floor(maxSide * 0.7));
  }

  return best;
}

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

/** Output resolution for Nano Banana (Studio + nodo). Default 1k; invalid/missing → 1k */
function normalizeNanoBananaResolution(r: string | undefined): '1k' | '2k' | '4k' {
  if (r === '1k' || r === '2k' || r === '4k') return r;
  return '1k';
}

interface NanoBananaStudioProps {
  nodeId: string;
  nodeLabel?: string;
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
  /** Entradas desde otros Studio: botón superior = volver al Studio origen. */
  topBarCloseMode?: 'default' | 'returnCine';
  onClose: () => void;
  onGenerated: (dataUrl: string, s3Key?: string) => void;
  onResolutionChange?: (resolution: '1k' | '2k' | '4k') => void;
  /** Historial de generaciones previas (estado en el nodo para no perderlo al cerrar Studio). */
  generationHistory: string[];
  onGenerationHistoryChange: React.Dispatch<React.SetStateAction<string[]>>;
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
  const pack = compose(userTheme.trim() || "Generación en Image Creation Studio.");
  if (!pack) {
    onDiag?.(null);
    return body;
  }
  onDiag?.(pack.diagnostics);
  return `${pack.prompt}\n\n--- ${sectionTitle} ---\n${body}`.trim();
}

const NanoBananaStudio = memo(({
  nodeId, nodeLabel = "Image Creation", initialImage, lastGenerated, modelKey, aspectRatio, resolution,
  thinking, prompt, externalPromptIgnored,
  composeBrainImageGeneratorPrompt: composeBrainImageGeneratorPromptProp,
  onBrainImageGeneratorDiagnostics,
  topBarCloseMode = 'default', onClose, onGenerated, onResolutionChange,
  generationHistory, onGenerationHistoryChange,
}: NanoBananaStudioProps) => {
  const { isTouchUI } = useInputMode();
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
      zoomLabelRef.current.textContent = isTouchUI
        ? `✕ ${pct}% · pinch · doble tap`
        : `✕ ${pct}% · doble clic`;
    }
  };
  const resetViewTransform = () => {
    vZoom.current = 1; vPan.current = { x: 0, y: 0 }; applyViewTransform();
  };

  const addingChangeRef = useRef(addingChange);
  addingChangeRef.current = addingChange;

  // ── Canvas size ─────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  /** Pinch/trackpad zoom must not change browser zoom; only this viewer (same pattern as FreehandStudio). */
  usePreventBrowserPinchZoom(containerRef);

  const getViewerTransform = useCallback(
    () => ({ zoom: vZoom.current, pan: { ...vPan.current } }),
    [],
  );
  const setViewerTransform = useCallback((view: { zoom: number; pan: { x: number; y: number } }) => {
    vZoom.current = view.zoom;
    vPan.current = { ...view.pan };
    applyViewTransform();
  }, []);

  const touchViewerHandlers = useNanoBananaViewerTouch({
    enabled: isTouchUI,
    containerRef,
    canInteract: () => !addingChangeRef.current,
    getView: getViewerTransform,
    setView: setViewerTransform,
    minZoom: 0.25,
    maxZoom: 10,
    onDragActiveChange: (active) => {
      if (!containerRef.current) return;
      containerRef.current.style.cursor = active
        ? "grabbing"
        : addingChangeRef.current
          ? "crosshair"
          : "grab";
    },
  });

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
        {
          v: 2,
          baseSig: currentImage ? String(currentImage.length) : '0',
          changes: validChanges.map((c) => ({
            id: c.id,
            desc: c.description,
            color: c.assignedColor.name,
            hasPaint: !!c.paintData,
            isGlobal: !!c.isGlobal,
            /** Sin esto, al añadir/quitar 📎 ref visual se reutilizaba el prompt sin REF 3 */
            refSig: c.referenceImage ? String(c.referenceImage.length) : '0',
          })),
        },
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
        const baseSrcForCanvas = currentImage || domImg?.src || null;
        if (baseSrcForCanvas) {
          let loadedBase: { img: HTMLImageElement; cleanup: () => void } | null = null;
          try {
            loadedBase = await loadCanvasSafeImageElement(baseSrcForCanvas);
            const marked = document.createElement('canvas');
            marked.width = W;
            marked.height = H;
            const mc = marked.getContext('2d')!;
            mc.drawImage(loadedBase.img, 0, 0, W, H);
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
          } finally {
            loadedBase?.cleanup();
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
        const colorMapImageKind =
          hasPaintedZones && markedBaseUrl !== colorMapUrl ? 'marked-base' : 'abstract-map';
        const [baseImageForAnalyze, colorMapImageForAnalyze] = await Promise.all([
          compactImageForAnalyzeAreas(currentImage, { maxSide: 1280, quality: 0.72, maxBytes: 900_000 }),
          compactImageForAnalyzeAreas(hasPaintedZones ? markedBaseUrl : null, {
            maxSide: 960,
            quality: 0.68,
            maxBytes: 520_000,
          }),
        ]);
        if (colorMapImageKind === 'marked-base' && colorMapImageForAnalyze) {
          markedRef2DataUrl = colorMapImageForAnalyze;
        }
        const changesForAnalyze = await Promise.all(
          vc.map(async (c) => {
            const pd = positionData[c.assignedColor.name];
            const [paintData, referenceImageData] = await Promise.all([
              compactMaskForAnalyzeAreas(c.paintData ?? null, {
                maxSide: 960,
                maxBytes: 420_000,
              }),
              compactImageForAnalyzeAreas(c.referenceImage ?? null, {
                maxSide: 960,
                quality: 0.7,
                maxBytes: 520_000,
              }),
            ]);
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
              paintData,
              assignedColorHex: c.assignedColor.hex,
              referenceImageData,
              isGlobal: !!c.isGlobal,
            };
          }),
        );
        const aiRes = await fetch('/api/gemini/analyze-areas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baseImage: baseImageForAnalyze,
            colorMapImage: colorMapImageForAnalyze,
            colorMapImageKind,
            changes: changesForAnalyze,
          }),
        });
        const aiJson = await aiRes.json().catch(async () => {
          const text = await aiRes.text().catch(() => "");
          return { error: text || `Analyze areas failed (${aiRes.status})` };
        });
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
        const ok = await runAiJobWithNotification({ nodeId, label: 'Image Creation · Áreas' }, wrapAnalyze);
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

      let genFinishedOk = false;
      try {
        const ok = await runAiJobWithNotification({ nodeId, label: 'Image Creation Studio' }, async () => {
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
        setTimeout(() => setProgress(0), 1000);
      }
      return;
    }

    const graphPrompt = externalPromptIgnored
      ? ''
      : normalizeGenerativeImagePrompt(String(prompt ?? ''), {
          targetAspectRatio: aspectRatio,
          textOnlyRecreation: !initialImage,
        });
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

    const maskImages = changes.map((c) => c.paintData).filter(Boolean) as string[];
    const refImages = [...(imageToSend ? [imageToSend] : []), ...maskImages];

    let genFinishedOkLegacy = false;
    try {
      const ok = await runAiJobWithNotification({ nodeId, label: 'Image Creation Studio' }, async () => {
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
      setTimeout(() => setProgress(0), 1000);
    }
  };

  // ── Generate Call: vista previa modal (misma preparación que Generar con zonas) ──
  const onGenerateCall = async () => {
    if (!hasPaintedZoneWithDescription) {
      alert(
        'Añade al menos una zona dibujada con descripción para ver la llamada con mapa de zonas. Si solo usas instrucciones globales o el prompt del grafo, pulsa Generar: se envía la imagen y el texto directamente a Image Creation.',
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
      const ok = await runAiJobWithNotification({ nodeId, label: 'Image Creation Studio' }, async () => {
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
      setTimeout(() => setProgress(0), 1000);
    }
  };

    return createPortal(
    <div
      className="nb-studio-root fixed inset-0 z-[100090] flex flex-col bg-[#0b0f14] text-white"
      data-foldder-studio-panel
      data-foldder-studio-canvas
      data-foldder-nano-banana-studio
      data-foldder-i18n-ignore
    >
      <FoldderStudioHeader
        nodeType="nanoBanana"
        nodeLabel={nodeLabel}
        subtitle="Iterative image edits"
        onClose={topBarCloseMode === "default" ? onClose : undefined}
        actions={
          topBarCloseMode !== "default" ? (
            <button
              type="button"
              onClick={onClose}
              className={foldderStudioHeaderActionClassName()}
              title="Volver a Cine"
            >
              <ChevronLeft size={14} strokeWidth={2.5} aria-hidden />
              <span className="hidden sm:inline">Cine</span>
            </button>
          ) : undefined
        }
      />

      <div className="nb-studio-controls flex h-9 shrink-0 items-stretch divide-x divide-white/10 border-b border-white/10 bg-white/[0.04]">
        <div className="flex items-stretch" role="group" aria-label="Modelo de imagen">
          {[
            { key: "flash25", label: "NB 1", color: "#34d399" },
            { key: "flash31", label: "NB 2", color: "#38bdf8" },
            { key: "pro3", label: "Pro", color: "#fbbf24" },
          ].map((m) => {
            const active = studioModelKey === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setStudioModelKey(m.key)}
                className={`flex h-full items-center gap-1 px-2.5 text-[8px] font-black uppercase tracking-[0.06em] transition ${
                  active
                    ? "bg-white text-slate-950"
                    : "text-white/45 hover:bg-white/[0.08] hover:text-white/85"
                }`}
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full ring-1 ring-black/10"
                  style={{ background: m.color }}
                />
                {m.label}
              </button>
            );
          })}
        </div>

        {studioModelKey !== "flash25" ? (
          <div className="flex items-stretch" role="group" aria-label="Resolución de salida">
            {(["1k", "2k", "4k"] as const).map((r) => {
              const active = studioResolution === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setStudioResolution(r);
                    onResolutionChange?.(r);
                  }}
                  className={`min-w-[2.25rem] px-2 text-[8px] font-black uppercase tracking-[0.06em] transition ${
                    active
                      ? "bg-[#6C5CE7]/28 text-violet-100"
                      : "text-white/40 hover:bg-white/[0.07] hover:text-white/80"
                  }`}
                >
                  {r}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex max-w-[9rem] items-center px-2 text-[7px] font-semibold leading-tight text-amber-200/80">
            1K fijo
          </div>
        )}

        {generatedOnce ? (
          <div className="flex items-center gap-1.5 px-2">
            {lastGenerated ? (
              <img
                src={lastGenerated}
                alt=""
                className="h-5 w-6 shrink-0 border border-white/15 object-cover"
              />
            ) : null}
            <span className="hidden text-[7px] font-bold uppercase tracking-[0.06em] text-white/45 sm:inline">
              {reSendGenerated ? "Última gen." : "Original"}
            </span>
            <button
              type="button"
              onClick={() => setReSendGenerated((v) => !v)}
              className="flex h-4 w-7 shrink-0 items-center px-0.5 transition-all"
              style={{
                background: reSendGenerated ? "#6C5CE7" : "rgba(63,63,70,0.95)",
                justifyContent: reSendGenerated ? "flex-end" : "flex-start",
              }}
              title={reSendGenerated ? "Usar imagen conectada como base" : "Usar última generación como base"}
            >
              <div
                className="h-3 w-3 rounded-full shadow-sm"
                style={{ background: reSendGenerated ? "#0a0a0f" : "#e4e4e7" }}
              />
            </button>
          </div>
        ) : null}

        <div className="min-w-[0.5rem] flex-1" />

        <button
          type="button"
          onClick={onGenerateCall}
          disabled={addingChange || analyzingCall || !hasPaintedZoneWithDescription}
          className="flex h-full items-center gap-1 px-3 text-[8px] font-black uppercase tracking-[0.06em] text-violet-100 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-35"
        >
          {analyzingCall ? (
            <>
              <Loader2 size={11} className="animate-spin shrink-0" /> Analizando
            </>
          ) : (
            <>
              <Eye size={11} className="shrink-0" /> Llamada
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onGenerate}
          disabled={genStatus === "running" || addingChange || analyzingCall}
          className="flex h-full items-center gap-1.5 bg-[#6C5CE7] px-4 text-[8px] font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#5b4ed4] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {genStatus === "running" ? (
            <>
              <Loader2 size={11} className="animate-spin shrink-0" /> Gen…
            </>
          ) : (
            <>
              <Sparkles size={11} className="shrink-0" /> Generar
            </>
          )}
        </button>
      </div>

      {/* Galería (historial) + lienzo */}
      <div className="flex min-h-0 w-full flex-1 flex-row">
        <div
          className="flex shrink-0 flex-col overflow-hidden border-r border-white/[0.08] bg-[#08080c]/98 transition-[width] duration-200 ease-out"
          style={{ width: galleryOpen ? 148 : 36 }}
          data-foldder-nano-banana-gallery
        >
          <button
            type="button"
            onClick={() => setGalleryOpen((o) => !o)}
            className="flex h-8 items-center justify-center gap-1 border-b border-white/[0.08] px-1 text-[8px] font-black uppercase tracking-[0.06em] text-white/40 transition-colors hover:bg-white/[0.04] hover:text-white/75"
            title={galleryOpen ? "Ocultar historial" : "Mostrar historial de generaciones"}
          >
            <ChevronRight size={12} className={`shrink-0 transition-transform ${galleryOpen ? "rotate-180" : ""}`} aria-hidden />
            {galleryOpen ? <span className="truncate">Hist</span> : null}
          </button>
          {galleryOpen ? (
            <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-1.5">
              {generationHistory.length === 0 ? (
                <p className="px-0.5 text-[8px] leading-snug text-white/28">
                  Cada generación se guarda aquí.
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
                      onGenerated(url);
                    }}
                    className="relative aspect-square w-full shrink-0 overflow-hidden border border-white/10 transition-colors hover:border-violet-500/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60"
                    title={`Generación ${i + 1}`}
                  >
                    <img src={url} alt="" className="h-full w-full object-cover" />
                    <span className="absolute bottom-0.5 right-0.5 bg-black/75 px-1 text-[7px] font-bold text-zinc-200">
                      {i + 1}
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}
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
            if (isTouchUI && e.pointerType !== "mouse") {
              touchViewerHandlers.onPointerDown(e);
              return;
            }
            if (e.button === 0 && !addingChange) {
              e.preventDefault();
              vIsDragging.current = true;
              vDragStart.current = { mx: e.clientX, my: e.clientY, px: vPan.current.x, py: vPan.current.y };
              containerRef.current?.setPointerCapture(e.pointerId);
              if (containerRef.current) containerRef.current.style.cursor = 'grabbing';
            }
          }}
          onPointerMove={e => {
            if (isTouchUI && e.pointerType !== "mouse") {
              touchViewerHandlers.onPointerMove(e);
              return;
            }
            if (!vIsDragging.current) return;
            vPan.current = { x: vDragStart.current.px + e.clientX - vDragStart.current.mx, y: vDragStart.current.py + e.clientY - vDragStart.current.my };
            applyViewTransform();
          }}
          onPointerUp={e => {
            if (isTouchUI && e.pointerType !== "mouse") {
              touchViewerHandlers.onPointerUp(e);
              return;
            }
            vIsDragging.current = false;
            if (containerRef.current) containerRef.current.style.cursor = addingChange ? 'crosshair' : 'grab';
          }}
          onPointerCancel={e => {
            if (isTouchUI && e.pointerType !== "mouse") {
              touchViewerHandlers.onPointerCancel(e);
            }
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
          <div className="absolute left-1/2 top-2 flex -translate-x-1/2 items-center gap-2 border border-rose-400/45 bg-black/85 px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.08em] text-rose-100 backdrop-blur-md">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
            Dibuja · arrastra para mover
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
            className="flex items-center gap-3 border-b border-rose-400/25 bg-rose-500/[0.08] px-3 py-2"
          >
            <span className="flex shrink-0 items-center gap-1 text-[8px] font-black uppercase tracking-[0.06em] text-rose-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
              Dibujando
            </span>
            <div className="flex items-center gap-1">
              <input
                type="color"
                value={brushColor}
                onChange={(e) => setBrushColor(e.target.value)}
                className="h-7 w-7 cursor-pointer border border-white/10"
              />
            </div>
            <div className="flex max-w-[160px] flex-1 items-center gap-2">
              <span className="shrink-0 text-[8px] font-bold text-white/40">{brushSize}px</span>
              <input
                type="range"
                min={4}
                max={48}
                value={brushSize}
                onChange={(e) => setBrushSize(+e.target.value)}
                className="flex-1"
              />
            </div>
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="¿Qué cambiar en esta área?"
              className="min-w-0 flex-1 border border-white/10 bg-black/40 px-2 py-1.5 text-[10px] text-white outline-none placeholder:text-white/30 focus:border-rose-400/60"
            />
            <button
              onClick={confirmChange}
              className="shrink-0 border border-rose-400/40 bg-rose-500/15 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-[0.06em] text-rose-200"
            >
              ✓
            </button>
            <button
              onClick={cancelChange}
              className="shrink-0 border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[8px] font-black uppercase tracking-[0.06em] text-white/45"
            >
              ✕
            </button>
          </div>
        )}

        <div className="nb-studio-changes-row flex items-center gap-0 px-2 py-2" style={{ minHeight: 52 }}>
          <div
            className="mr-2 flex shrink-0 flex-col gap-0 pr-2"
            style={{ borderRight: "1px solid rgba(255,255,255,0.1)" }}
          >
            <span className="text-[8px] font-black uppercase tracking-[0.1em] text-white/70">Cambios</span>
            <span className="max-w-[7rem] text-[7px] leading-tight text-white/35">REF2: azul · rojo · verde…</span>
          </div>

          <div className="flex items-center gap-2 flex-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {changes.length === 0 ? (
              <span className="shrink-0 text-[8px] text-white/35">
                Zona · Global · Cámara
              </span>
            ) : null}

            {changes.map((ch) => {
              const hex = ch.assignedColor.hex;
              return (
                <div
                  key={ch.id}
                  className="flex shrink-0 items-center gap-1.5 border px-2 py-1.5 transition-all"
                  style={
                    ch.isGlobal || (ch.paintData && ch.description.trim())
                      ? { background: hex + "22", color: "#f4f4f5", borderColor: hex + "66" }
                      : { background: "rgba(39,39,48,0.85)", color: "#a1a1aa", borderColor: "rgba(113,113,122,0.4)" }
                  }
                >
                  {ch.isGlobal ? (
                    <Globe size={10} className="shrink-0" style={{ color: hex }} />
                  ) : (
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/20"
                      style={{ background: hex }}
                      title={ch.assignedColor.name}
                    />
                  )}

                  <span className="max-w-[120px] truncate text-[8px] font-bold uppercase tracking-wide">
                    {ch.description || "Sin descripción"}
                  </span>

                  {!ch.isGlobal ? (
                    <label className="flex shrink-0 cursor-pointer items-center gap-1">
                      {ch.referenceImage ? (
                        <img
                          src={ch.referenceImage}
                          alt="ref"
                          className="h-6 w-6 shrink-0 border object-cover"
                          style={{ borderColor: hex + "80" }}
                        />
                      ) : (
                        <span
                          className="flex items-center gap-0.5 border border-dashed px-1.5 py-0.5 text-[7px] font-black uppercase"
                          style={{ background: hex + "15", color: hex, borderColor: hex + "50" }}
                        >
                          <ImageIcon size={9} /> Ref
                        </span>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const url = ev.target?.result as string;
                            setCachedPromptData(null);
                            setChanges((prev) =>
                              prev.map((c) => (c.id === ch.id ? { ...c, referenceImage: url } : c)),
                            );
                          };
                          reader.readAsDataURL(file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => deleteChange(ch.id)}
                    className="ml-0.5 shrink-0 p-0.5 text-white/35 transition-colors hover:bg-white/5 hover:text-rose-400"
                    title="Quitar cambio"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              );
            })}
          </div>

          <div
            className="flex shrink-0 items-center gap-1 pl-2"
            style={{ borderLeft: "1px solid rgba(255,255,255,0.1)" }}
          >

            {showGlobalInput ? (
              <div className="flex items-center gap-1.5" style={{ minWidth: 280 }}>
                <Globe size={11} className="shrink-0 text-violet-400" aria-hidden />
                <input
                  autoFocus
                  value={globalDesc}
                  onChange={(e) => setGlobalDesc(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addGlobalChange(globalDesc);
                    if (e.key === "Escape") {
                      setShowGlobalInput(false);
                      setGlobalDesc("");
                    }
                  }}
                  placeholder="Cambio global…"
                  className="min-w-0 flex-1 border border-violet-500/40 bg-black/40 px-2 py-1.5 text-[10px] text-white outline-none placeholder:text-white/30 focus:border-violet-400/70"
                />
                <button
                  onClick={() => addGlobalChange(globalDesc)}
                  className="border border-violet-500/40 bg-violet-500/15 px-2 py-1.5 text-[8px] font-black uppercase text-violet-100"
                >
                  ✓
                </button>
                <button
                  onClick={() => {
                    setShowGlobalInput(false);
                    setGlobalDesc("");
                  }}
                  className="border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[8px] font-black uppercase text-white/45"
                >
                  ✕
                </button>
              </div>
            ) : null}

            {!addingChange && !showGlobalInput ? (
              <>
                <button
                  type="button"
                  onClick={startAddChange}
                  className="flex shrink-0 items-center gap-1 border border-rose-400/40 bg-rose-500/10 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-[0.06em] text-rose-100 transition hover:bg-rose-500/18"
                  title="Pinta sobre la imagen qué parte quieres cambiar"
                >
                  <Plus size={11} strokeWidth={2.5} /> Zona
                </button>

                <button
                  type="button"
                  onClick={() => setShowGlobalInput(true)}
                  className="flex shrink-0 items-center gap-1 border border-violet-500/40 bg-violet-500/10 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-[0.06em] text-violet-100 transition hover:bg-violet-500/18"
                  title="Instrucción que afecta a toda la imagen"
                >
                  <Globe size={11} strokeWidth={2.5} /> Global
                </button>

                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowCameraMenu((v) => !v)}
                    className="flex items-center gap-1 border border-violet-500/35 bg-violet-500/8 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-[0.06em] text-violet-100 transition hover:bg-violet-500/15"
                    title="Ajustes suaves de encuadre"
                  >
                    <Camera size={11} strokeWidth={2.5} /> Cam ▾
                  </button>
                {showCameraMenu && (
                  <div
                    className="absolute bottom-full mb-2 right-0 z-[9999] rounded-none overflow-hidden shadow-2xl"
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
              </>
            ) : null}

          </div>
        </div>
      </div>

      {/* ── Call Preview Modal ─────────────────────────────────────────── */}
      {callPreview && (
        <div
          className="fixed inset-0 z-[10060] flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.88)' }}
          data-foldder-studio-canvas=""
        >
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-none flex flex-col"
               style={{ background: '#1a1a22', border: '1px solid rgba(255,255,255,0.12)' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.1] bg-white/[0.04] backdrop-blur-md">
              <div className="flex flex-col gap-0.5">
                <span className="text-[12px] font-black uppercase tracking-[0.1em] text-violet-200">Vista previa de la llamada</span>
                <span className="text-[10px] text-zinc-500 font-medium normal-case tracking-normal">Revisa refs y el texto que se enviará a Image Creation</span>
              </div>
              <button type="button" onClick={() => setCallPreview(null)} className="text-zinc-400 hover:text-white transition-colors p-1 rounded-none hover:bg-white/10" title="Cerrar">
                <X size={20} />
              </button>
            </div>

            {/* ── 3-image panels ── */}
            <div className="p-6 grid grid-cols-3 gap-4 border-b border-white/[0.06]">
              {/* REF 1 — Base image */}
              <div className="space-y-2">
                <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Ref 1 · Imagen base</p>
                {currentImage ? (
                  <img src={currentImage} alt="Base" className="w-full rounded-none border border-white/10 object-contain max-h-40" />
                ) : (
                  <div className="w-full h-32 rounded-none border border-white/10 flex items-center justify-center text-[9px] text-zinc-600">Sin imagen base</div>
                )}
              </div>

              {/* REF 2 — Marked image (base + strokes, fallback to color map) */}
              <div className="space-y-2">
                <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Ref 2 · Mapa de zonas</p>
                <img
                  src={callPreview.markedRef2 || callPreview.colorMapUrl}
                  alt="Color map"
                  className="w-full rounded-none border border-white/10 object-contain max-h-40"
                />
                <div className="flex flex-wrap gap-1">
                  {changes.filter(c=>c.paintData).map(c => (
                    <div key={c.id} className="flex items-center gap-1 px-1.5 py-0.5 rounded-none text-[7px] font-black uppercase"
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
                    className="w-full rounded-none border border-violet-500/20 object-contain max-h-40"
                  />
                ) : (
                  <div className="w-full h-32 rounded-none border border-dashed border-white/10 flex flex-col items-center justify-center gap-2 text-center px-3">
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
                className="w-full bg-black/40 border border-white/10 rounded-none px-3 py-2.5 text-[10px] text-zinc-300 font-mono leading-relaxed resize-none"
              />
              <p className="text-[8px] text-zinc-600 leading-snug">
                ref1 = base · ref2 = dónde editar (prioridad sobre texto si choca izq./der.) · ref3 = estilos de referencia
              </p>
            </div>
            {/* Send button */}
            <div className="px-6 py-4 border-t border-white/[0.07] flex justify-end gap-3">
              <button onClick={() => setCallPreview(null)}
                className="px-5 py-2.5 rounded-none text-[11px] font-black uppercase tracking-wider text-zinc-500 border border-white/[0.08] hover:text-zinc-300 transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => onGenerateFromCall(callPreview.colorMapUrl, callPreview.fullPrompt, callPreview.markedRef2, callPreview.referenceGridUrl)}
                disabled={genStatus === 'running'}
                className="px-6 py-2.5 rounded-none text-[11px] font-black uppercase tracking-widest flex items-center gap-2 transition-all disabled:opacity-40 shadow-[0_2px_12px_rgba(108,92,231,0.35)]"
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
  useFoldderRenderMetric("NanoBananaNode", id);
  const nodes = useNodes();
  const flowNode = nodes.find((node) => node.id === id);
  const nodeData = (flowNode?.data ?? data) as BaseNodeData & {
    aspect_ratio?: string;
    resolution?: string;
    modelKey?: string;
    thinking?: boolean;
    imageProvider?: NanoBananaImageProvider;
    /** Persisted with the project (Studio + main-run versions). */
    generationHistory?: string[];
    /**
     * Loop (legacy/semilla): prompt inline. La edición de plantilla vive ahora
     * en el nodo Loop; esto solo sirve como semilla y prompt inline normal.
     */
    promptText?: string;
  };
  const { setNodes, setEdges, getNodes, getEdges } = useReactFlow();
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [showFullSize, setShowFullSize] = useState(false);
  const [showStudio, setShowStudio] = useState(false);
  const [studioTouched, setStudioTouched] = useState(
    () => hasNanoBananaStudioTouched(data as Record<string, unknown>),
  );
  const currentFrameSnapshot = useStore(
    useCallback((state: ReactFlowState<Node, Edge>) => selectNodeFrameSnapshot(state, id), [id]),
    shallow,
  );
  const nanoFlowSnapshot = useStore(
    useCallback((state: ReactFlowState<Node, Edge>) => selectNanoBananaFlowSnapshot(state, id), [id]),
    shallow,
  );
  const {
    width: currentFrameWidth,
    height: currentFrameHeight,
    measuredWidth: currentFrameMeasuredWidth,
    measuredHeight: currentFrameMeasuredHeight,
    styleWidth: currentFrameStyleWidth,
    styleHeight: currentFrameStyleHeight,
  } = currentFrameSnapshot;
  const currentFrameNode = useMemo(
    () =>
      nodeFrameFromSnapshot({
        width: currentFrameWidth,
        height: currentFrameHeight,
        measuredWidth: currentFrameMeasuredWidth,
        measuredHeight: currentFrameMeasuredHeight,
        styleWidth: currentFrameStyleWidth,
        styleHeight: currentFrameStyleHeight,
      }),
    [
      currentFrameWidth,
      currentFrameHeight,
      currentFrameMeasuredWidth,
      currentFrameMeasuredHeight,
      currentFrameStyleWidth,
      currentFrameStyleHeight,
    ],
  );
  const frameRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const frameSyncKeyRef = useRef<string | null>(null);
  const nodeMediaVisible = useNodeViewportVisibility(id, 900, selected);
  const cineReturnSessionRef = useRef<CineImageStudioSession | null>(null);
  const latestStudioAssetRef = useRef<string | null>(null);
  const latestStudioS3KeyRef = useRef<string | null>(null);
  const [cineStudioPrompt, setCineStudioPrompt] = useState("");
  const [cineStudioSourceImage, setCineStudioSourceImage] = useState<string | null>(null);
  const [cineStudioHistory, setCineStudioHistory] = useState<string[]>([]);
  const [nanoStudioTopBarCloseMode, setNanoStudioTopBarCloseMode] = useState<'default' | 'returnCine'>('default');

  const updateNodeInternals = useUpdateNodeInternals();
  const canvasPerformanceModeRef = useCanvasPerformanceModeRef(
    useCallback((active: boolean) => {
      if (!active) requestAnimationFrame(() => updateNodeInternals(id));
    }, [id, updateNodeInternals]),
  );
  const brainTelemetry = useBrainNodeTelemetry({ canvasNodeId: id, nodeType: "IMAGE_GENERATOR" });
  const [brainImageDiag, setBrainImageDiag] = useState<BrainImageGeneratorPromptDiagnostics | null>(null);
  const brainDiagRef = useRef<BrainImageGeneratorPromptDiagnostics | null>(null);
  const setBrainImageDiagSync = useCallback((d: BrainImageGeneratorPromptDiagnostics | null) => {
    brainDiagRef.current = d;
    setBrainImageDiag(d);
  }, []);

  const brainConnected = nanoFlowSnapshot[NANO_FLOW_SNAPSHOT_BRAIN] === "1";
  const promptConnected = nanoFlowSnapshot[NANO_FLOW_SNAPSHOT_PROMPT_CONNECTED] === "1";
  const promptValue = nanoFlowSnapshot[NANO_FLOW_SNAPSHOT_PROMPT_VALUE] ?? "";
  const connectedSlots = useMemo(
    () => REF_SLOTS.map((_, index) => nanoFlowSnapshot[NANO_FLOW_SNAPSHOT_REFS_START + index * 2] === "1"),
    [nanoFlowSnapshot],
  );
  const refImages = useMemo(
    () =>
      REF_SLOTS.map((_, index) => {
        const value = nanoFlowSnapshot[NANO_FLOW_SNAPSHOT_REFS_START + index * 2 + 1];
        return typeof value === "string" && value ? value : null;
      }),
    [nanoFlowSnapshot],
  );

  const refreshNanoHandleGeometry = useCallback(() => {
    if (canvasPerformanceModeRef.current) return;
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
    cineReturnSessionRef.current = null;
    setCineStudioPrompt("");
    setCineStudioSourceImage(null);
    setCineStudioHistory([]);
    setNanoStudioTopBarCloseMode('default');
    setShowStudio(true);
  }, []);

  const closeNanoStudio = useCallback(() => {
    const cineSession = cineReturnSessionRef.current;
    const cineResult: CineImageStudioResult | null = cineSession
      ? {
          assetId: latestStudioAssetRef.current || undefined,
          s3Key: latestStudioS3KeyRef.current || undefined,
          originalAssetId: cineSession.sourceAssetId,
          promptUsed: cineSession.prompt,
          negativePromptUsed: cineSession.negativePrompt,
          mode: cineSession.mode,
        }
      : null;
    cineReturnSessionRef.current = null;
    latestStudioS3KeyRef.current = null;
    setCineStudioPrompt("");
    setCineStudioSourceImage(null);
    setCineStudioHistory([]);
    setNanoStudioTopBarCloseMode('default');
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

    if (cineSession) {
      requestAnimationFrame(() => {
        window.dispatchEvent(
          new CustomEvent("foldder-open-cine-studio", {
            detail: {
              cineNodeId: cineSession.cineNodeId,
              returnTab: cineSession.returnTab,
              returnSceneId: cineSession.returnSceneId,
              session: cineSession,
              result: cineResult ?? {
                originalAssetId: cineSession.sourceAssetId,
                promptUsed: cineSession.prompt,
                negativePromptUsed: cineSession.negativePrompt,
                mode: cineSession.mode,
              },
            },
          }),
        );
      });
    }
  }, [getNodes, getEdges, setNodes, setEdges, id]);

  useEffect(() => {
    const openFromCineSession = (session: CineImageStudioSession) => {
      cineReturnSessionRef.current = session;
      latestStudioAssetRef.current = null;
      latestStudioS3KeyRef.current = null;
      setCineStudioPrompt(session.prompt);
      setCineStudioSourceImage(session.sourceAssetId || null);
      setCineStudioHistory(session.sourceAssetId ? [session.sourceAssetId] : []);
      setNanoStudioTopBarCloseMode('returnCine');
      setShowStudio(true);
    };
    const onOpenFromCine = (ev: Event) => {
      const e = ev as CustomEvent<{ nanoNodeId: string; session: CineImageStudioSession }>;
      if (e.detail?.nanoNodeId !== id || !e.detail.session) return;
      takePendingNanoStudioOpenFromCine(id);
      openFromCineSession(e.detail.session);
    };
    window.addEventListener('foldder-open-nano-studio-from-cine', onOpenFromCine as EventListener);
    return () =>
      window.removeEventListener('foldder-open-nano-studio-from-cine', onOpenFromCine as EventListener);
  }, [id]);

  useEffect(() => {
    const onOpenStudio = (ev: Event) => {
      const detail = (ev as CustomEvent<FoldderStudioEventDetail>).detail;
      if (detail?.nodeId !== id) return;
      cineReturnSessionRef.current = null;
      setCineStudioPrompt("");
      setCineStudioSourceImage(null);
      setCineStudioHistory([]);
      setNanoStudioTopBarCloseMode('default');
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

  useLayoutEffect(() => {
    const pending = takePendingNanoStudioOpenFromCine(id);
    if (!pending) return;
    cineReturnSessionRef.current = pending;
    latestStudioAssetRef.current = null;
    latestStudioS3KeyRef.current = null;
    setCineStudioPrompt(pending.prompt);
    setCineStudioSourceImage(pending.sourceAssetId || null);
    setCineStudioHistory(pending.sourceAssetId ? [pending.sourceAssetId] : []);
    setNanoStudioTopBarCloseMode('returnCine');
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
  const imageProvider = resolveNanoBananaImageProvider(nodeData.imageProvider);
  const isOpenAiProvider = imageProvider === 'openai';

  const updateData = (key: string, val: unknown) =>
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, [key]: val } } : n));

  const inlinePromptText = typeof nodeData.promptText === "string" ? nodeData.promptText : "";
  /** Prompt efectivo: el conectado manda; si no, el inline. */
  const effectivePromptValue = promptValue || inlinePromptText;

  const onRun = async () => {
    if (!effectivePromptValue) return alert("Connect a prompt node!");

    const connectedRefImages = refImages.filter((img, index) => connectedSlots[index] && img) as string[];
    const textOnlyRecreation = connectedRefImages.length === 0;

    const userPromptRaw = normalizeGenerativeImagePrompt(String(effectivePromptValue ?? ""), {
      targetAspectRatio: nodeData.aspect_ratio || "16:9",
      textOnlyRecreation,
    });
    const promptToSend = userPromptRaw;

    const epoch = ++graphGenEpochRef.current;
    setStatus('running');
    setProgress(0);

    let genFinishedOk = false;
    try {
      const ok = await runAiJobWithNotification({ nodeId: id, label: 'Image Creation' }, async () => {
        const generateBody = {
          prompt: promptToSend,
          images: connectedRefImages,
          aspect_ratio: nodeData.aspect_ratio || '16:9',
          resolution: isFlash25 ? '1k' : normalizeNanoBananaResolution(nodeData.resolution),
          model: selectedModel,
          thinking: nodeData.thinking && isPro,
        };
        const onGenProgress = (pct: number) => {
          if (graphGenEpochRef.current !== epoch) return;
          setProgress(pct);
          aiHudNanoBananaJobProgress(id, pct);
        };
        const json = isOpenAiProvider
          ? await openaiGenerateWithServerProgress(generateBody, onGenProgress)
          : await geminiGenerateWithServerProgress(generateBody, onGenProgress);
        const out = json.output;
        const aiSource = isOpenAiProvider ? "openai-image-generator" : "gemini-image-generator";
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
            data: touchStudioNodeData(n.data as Record<string, unknown>, {
              value: out,
              type: 'image',
              ...(typeof json.key === 'string' ? { s3Key: json.key } : {}),
              generatedByAi: true,
              generatedByAiSource: aiSource,
              generationHistory: h,
              _assetVersions: versions,
            }),
          };
        }));
        genFinishedOk = true;
        setStudioTouched(true);
        setBrainImageDiagSync(null);
        brainTelemetry.track({
          kind: "IMAGE_GENERATED",
          artifactType: "image",
          custom: {
            brainConnected,
            confirmedVisualPatternsUsed: false,
            trustedVisualAnalysisCount: 0,
            textOnlyGeneration: false,
            usedBrainVisualCompose: false,
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
        setTimeout(() => {
          if (graphGenEpochRef.current === epoch) setProgress(0);
        }, 1000);
      }
    }
  };

  useRegisterAssistantNodeRun(id, onRun);

  const connectedRefImages = useMemo(
    () => refImages.filter((img, index) => connectedSlots[index] && img) as string[],
    [connectedSlots, refImages],
  );

  /** Persisted URL/base64 from node data (S3 presigned after save + hydrate). `result` is only in-memory after generate. */
  const persistedOutput =
    typeof nodeData.value === 'string' && nodeData.value.length > 0 ? nodeData.value : null;
  const outputImage = result ?? persistedOutput;
  const outputS3Key = typeof (nodeData as { s3Key?: unknown }).s3Key === "string"
    ? (nodeData as { s3Key: string }).s3Key
    : undefined;
  const { displayUrl: outputPreviewUrl, fullUrl: outputFullUrl, retryWithBlob: retryOutputPreview } = useAuthedMediaPreviewUrl(
    outputImage,
    outputS3Key,
    { canvasThumbnail: true },
  );

  /** Barra y glow siguen el store global de jobs IA (misma fuente que la banda del header). */
  const isAiExecutionActive = useSyncExternalStore(
    subscribeActiveAiJobs,
    () => isNodeAiExecutionActive(id),
    () => false,
  );
  const isActivelyGenerating = isAiExecutionActive;
  const nbResLabel = isFlash25 ? '1K' : normalizeNanoBananaResolution(nodeData.resolution).toUpperCase();
  const nanoAspect = parseAspectRatioValue(nodeData.aspect_ratio || '16:9') ?? { width: 16, height: 9 };

  const hasConnections = brainConnected || promptConnected || connectedSlots.some(Boolean);
  const hasGeneratedOutput = Boolean(outputImage);
  const hasDock = hasConnections;
  const isEmpty = !hasConnections && !hasGeneratedOutput;
  const hasHeroPreview = hasGeneratedOutput && nodeMediaVisible;
  const hasGridPreview = hasConnections && !hasGeneratedOutput && connectedRefImages.length > 0;
  const hasPreviewVisual = hasHeroPreview || hasGridPreview;
  const connectedOnly = hasConnections && !hasPreviewVisual;
  const showExteriorTile = hasDock;
  const previousVersions = useMemo(() => {
    if (!outputImage) return [] as string[];
    const fromHistory = persistedGenerationHistory.filter((url) => url && url !== outputImage);
    if (fromHistory.length > 0) return fromHistory;
    const versions = Array.isArray((nodeData as { _assetVersions?: unknown })._assetVersions)
      ? ((nodeData as { _assetVersions: Array<{ url?: string }> })._assetVersions ?? [])
      : [];
    return versions
      .map((entry) => entry.url)
      .filter((url): url is string => typeof url === "string" && url.length > 0 && url !== outputImage);
  }, [nodeData, outputImage, persistedGenerationHistory]);
  const hasHistoryStrip = hasHeroPreview && previousVersions.length > 0;
  const gridCountClass = `nano-banana-node-frame-grid--count-${Math.min(Math.max(connectedRefImages.length, 1), 4)}`;
  const showDockGenerate = hasDock && promptConnected;

  const nanoBananaHandles = useMemo((): StudioCanvasNodeHandleSpec[] => {
    const handles: StudioCanvasNodeHandleSpec[] = [
      {
        side: "left",
        top: "2%",
        type: "target",
        id: "brain",
        dataType: "brain",
        label: brainConnected ? "✓ Marca" : "Marca",
        labelStyle: brainConnected ? { color: "#a78bfa" } : undefined,
      },
    ];
    REF_SLOTS.forEach((slot, index) => {
      handles.push({
        side: "left",
        top: slot.top,
        type: "target",
        id: slot.id,
        dataType: "image",
        label: connectedSlots[index] ? `✓ ${slot.label}` : slot.label,
        labelStyle: connectedSlots[index] ? { color: "#f59e0b" } : undefined,
        style: index === 0 || connectedSlots[index - 1] ? undefined : { opacity: 0.35 },
      });
    });
    handles.push({
      side: "left",
      top: "94%",
      type: "target",
      id: "prompt",
      dataType: "prompt",
      label: promptConnected ? "✓ Prompt" : "Prompt",
      labelStyle: promptConnected ? { color: "#3a8f96" } : undefined,
    });
    handles.push({
      side: "right",
      top: "55%",
      type: "source",
      id: "image",
      dataType: "image",
      label: "Image out",
    });
    return handles;
  }, [brainConnected, connectedSlots, promptConnected]);

  const headerTitle = String(nodeData.label || "Image Creation");
  const modelLabel = isOpenAiProvider ? "GPT Image 2" : modelInfo.label;
  const formatLabel = nodeData.aspect_ratio || "16:9";
  const inputsLabel = useMemo(() => {
    const parts: string[] = [];
    if (brainConnected) parts.push("Marca");
    if (promptConnected) parts.push("Prompt");
    const refCount = connectedSlots.filter(Boolean).length;
    if (refCount > 0) parts.push(`${refCount} ref${refCount === 1 ? "" : "s"}`);
    return parts.length > 0 ? parts.join(" · ") : "—";
  }, [brainConnected, connectedSlots, promptConnected]);
  const versionsLabel = hasGeneratedOutput
    ? `${Math.max(1, previousVersions.length + 1)} versión${previousVersions.length + 1 === 1 ? "" : "es"}`
    : "—";
  const statusLabel = mapNanoBananaStatusLabel(status, isEmpty, isActivelyGenerating);
  const previewLine = isEmpty
    ? "Conecta Prompt, refs o Marca y abre Studio."
    : isActivelyGenerating
      ? `Generando imagen… ${Math.round(progress)}%`
      : hasGeneratedOutput
        ? `${modelLabel} · ${nbResLabel} · ${formatLabel}`
        : hasGridPreview
          ? `${connectedRefImages.length} ref${connectedRefImages.length === 1 ? "" : "s"} conectada${connectedRefImages.length === 1 ? "" : "s"}. Abre Studio para generar.`
          : hasConnections
            ? "Entradas listas. Abre Studio para generar."
            : "Conecta entradas y abre Studio.";

  useLayoutEffect(() => {
    const baseFrame = getNodeGridFrameForType("nanoBanana");
    if (!baseFrame) return;

    if (hasPreviewVisual) {
      const syncKey = `${nodeData.aspect_ratio || "16:9"}:${nanoAspect.width}x${nanoAspect.height}:${hasDock ? "dock" : "preview-only"}:${hasHistoryStrip ? "history" : "hero"}`;
      if (frameSyncKeyRef.current === syncKey) return;
      const chromeHeight = resolveNodeChromeHeight(frameRef.current, previewRef.current);
      const nextFrame = resolveAspectLockedNodeFrame({
        node: currentFrameNode,
        contentWidth: nanoAspect.width,
        contentHeight: nanoAspect.height,
        minWidth: 200,
        maxWidth: 960,
        minHeight: 120,
        maxHeight: STUDIO_NODE_MAX_HEIGHT,
        chromeHeight,
      });
      const nextAspectRatio = nanoAspect.width / nanoAspect.height;
      frameSyncKeyRef.current = syncKey;
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== id) return node;
          const needsFrameSync = nodeFrameNeedsSync(node, nextFrame);
          const currentAspectRatio =
            typeof (node.data as { _foldderAspectRatio?: unknown } | undefined)?._foldderAspectRatio === "number"
              ? ((node.data as { _foldderAspectRatio?: number })._foldderAspectRatio ?? null)
              : null;
          const needsAspectSync =
            currentAspectRatio === null || Math.abs(currentAspectRatio - nextAspectRatio) > 0.0001;
          if (!needsFrameSync && !needsAspectSync) return node;
          return {
            ...node,
            ...(needsFrameSync ? { width: nextFrame.width, height: nextFrame.height } : {}),
            data: { ...node.data, _foldderAspectRatio: nextAspectRatio },
            style: needsFrameSync ? { ...node.style, width: nextFrame.width, height: nextFrame.height } : node.style,
          };
        }),
      );
      requestAnimationFrame(() => updateNodeInternals(id));
      return;
    }

    if (isEmpty) {
      const syncKey = "nano-banana-base";
      if (frameSyncKeyRef.current === syncKey) return;
      frameSyncKeyRef.current = syncKey;
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== id) return node;
          if (!nodeFrameNeedsSync(node, baseFrame)) return node;
          return {
            ...node,
            width: baseFrame.width,
            height: baseFrame.height,
            measured: { width: baseFrame.width, height: baseFrame.height },
            style: { ...(node.style as React.CSSProperties), width: baseFrame.width, height: baseFrame.height, minHeight: baseFrame.height },
          };
        }),
      );
      requestAnimationFrame(() => updateNodeInternals(id));
      return;
    }

    const measuredHeight = resolveNanoBananaNodeHeight({ baseHeight: baseFrame.height, hasDock: true });
    const syncKey = `nano-banana-content:${hasConnections ? "connected" : "idle"}:${hasGeneratedOutput ? "output" : "meta"}:${measuredHeight}:${status}`;
    if (frameSyncKeyRef.current === syncKey) return;

    frameSyncKeyRef.current = syncKey;
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id !== id) return node;
        const resolvedWidth = resolveNodeFrameWidth(node, baseFrame.width);
        const resolvedTarget = { width: resolvedWidth, height: measuredHeight };
        if (!nodeFrameNeedsSync(node, resolvedTarget)) return node;
        return {
          ...node,
          width: resolvedWidth,
          height: measuredHeight,
          measured: { width: resolvedWidth, height: measuredHeight },
          style: {
            ...(node.style as React.CSSProperties),
            width: resolvedWidth,
            height: measuredHeight,
            minHeight: measuredHeight,
            maxHeight: STUDIO_NODE_MAX_HEIGHT,
          },
        };
      }),
    );
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [
    connectedOnly,
    currentFrameNode,
    hasConnections,
    hasDock,
    hasGeneratedOutput,
    hasHistoryStrip,
    hasPreviewVisual,
    id,
    isEmpty,
    nanoAspect.height,
    nanoAspect.width,
    nodeData.aspect_ratio,
    setNodes,
    status,
    updateNodeInternals,
  ]);

  useEffect(() => {
    if (hasNanoBananaStudioTouched(nodeData as Record<string, unknown>)) {
      setStudioTouched(true);
      if (!hasFoldderStudioTouched(nodeData as Record<string, unknown>)) {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === id ? { ...n, data: touchStudioNodeData(n.data as Record<string, unknown>) } : n,
          ),
        );
      }
    }
  }, [id, nodeData, setNodes]);

  return (
    <StudioCanvasNodeShell
      ref={frameRef}
      nodeId={id}
      nodeType="nanoBanana"
      selected={selected}
      label={typeof nodeData.label === "string" ? nodeData.label : undefined}
      defaultLabel="Image Creation"
      title="IMAGE CREATION"
      introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}
      studioTouched={showExteriorTile && studioTouched}
      exteriorTileMark={showExteriorTile}
      minWidth={200}
      handles={nanoBananaHandles}
      variant="frameless"
      material="media"
      className={`nano-banana-node foldder-frameless-label-dark${isEmpty ? " nano-banana-node--empty" : hasConnections ? " nano-banana-node--has-content" : ""}${hasPreviewVisual ? " nano-banana-node--has-preview" : ""}${connectedOnly ? " nano-banana-node--connected-only" : ""}${hasConnections ? " nano-banana-node--connected" : ""}${hasGeneratedOutput ? " nano-banana-node--has-output" : ""}${status === "error" ? " foldder-node--error" : ""}${isActivelyGenerating ? " node-glow-running" : ""}`}
      style={
        {
          width: "100%",
          height: "100%",
          minWidth: 200,
          minHeight: hasConnections ? NANO_BANANA_DOCK_MIN_CHROME + NANO_BANANA_CONNECTED_PREVIEW_MIN : 300,
          "--foldder-node-card-bg": NANO_BANANA_ACCENT,
          "--foldder-frameless-glass-bg": NANO_BANANA_ACCENT,
          "--foldder-frameless-accent": "#fbcfe8",
        } as React.CSSProperties
      }
    >
      <FoldderNodeResizer
        minWidth={200}
        minHeight={120}
        maxWidth={960}
        maxHeight={STUDIO_NODE_MAX_HEIGHT}
        keepAspectRatio={hasPreviewVisual}
        isVisible={selected}
      />

      <div
        className={`node-content foldder-frameless-main nano-banana-node-main${hasDock ? " foldder-node-content-main--with-dock" : ""}`}
      >
        <div
          ref={previewRef}
          className={`nano-banana-node-preview-area foldder-node-content-preview-area group/nano-banana${hasGridPreview ? " nano-banana-node-preview-area--grid" : ""}${hasHeroPreview ? " nano-banana-node-preview-area--generated" : ""}${hasHistoryStrip ? " nano-banana-node-preview-area--with-history" : ""}`}
        >
          {hasHeroPreview ? (
            <>
              <div className="nano-banana-node-hero">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={outputPreviewUrl}
                  alt="Generated"
                  className="nano-banana-node-hero__img"
                  decoding="async"
                  draggable={false}
                  onError={() => {
                    void retryOutputPreview();
                  }}
                />
                <div className="nano-banana-node-hero__shade" aria-hidden />
                <button
                  type="button"
                  onClick={() => setShowFullSize(true)}
                  className="nano-banana-node-hero__expand nodrag nopan"
                  title="Ver a tamaño completo"
                >
                  <Maximize2 size={10} aria-hidden />
                  <span>Expandir</span>
                </button>
              </div>
              {hasHistoryStrip ? (
                <div className="nano-banana-node-history-strip" aria-label="Versiones anteriores">
                  {previousVersions.map((url, index) => (
                    <NanoBananaNodeExteriorHistoryThumb
                      key={`${url.slice(0, 48)}-${index}`}
                      url={url}
                      index={index}
                      mediaVisible={nodeMediaVisible}
                    />
                  ))}
                </div>
              ) : null}
            </>
          ) : hasGeneratedOutput ? (
            <div className="nano-banana-node-preview-paused">
              <ImageIcon size={28} className="text-zinc-400/50" aria-hidden />
              <span className="nano-banana-node-preview-paused__label">Preview pausada fuera de viewport</span>
            </div>
          ) : hasGridPreview ? (
            <div className={`nano-banana-node-frame-grid ${gridCountClass}`} aria-hidden>
              {connectedRefImages.map((url, index) => (
                <NanoBananaNodeExteriorGridCell
                  key={`${url.slice(0, 48)}-${index}`}
                  url={url}
                  label={`Ref ${index + 1}`}
                  mediaVisible={nodeMediaVisible}
                />
              ))}
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={NANO_BANANA_EMPTY_BACKGROUND_SRC}
              alt=""
              className="nano-banana-node-bg"
              draggable={false}
            />
          )}

          {isEmpty ? (
            <>
              <div className="nano-banana-node-empty-hint" aria-hidden>
                <span className="nano-banana-node-empty-hint__title">Image Creation vacío</span>
                <span className="nano-banana-node-empty-hint__body">
                  Conecta Prompt, refs o Marca y abre Studio.
                </span>
              </div>
              <FoldderStudioModeCenterButton
                label="Empezar"
                title="Abrir Image Creation Studio"
                onClick={openNanoStudioNormal}
              />
            </>
          ) : null}

          {isActivelyGenerating ? (
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
          ) : null}
        </div>

        {hasDock ? (
          <div className="nano-banana-node-dock-wrap shrink-0">
            <FoldderNodeContentDock allowNodeDrag>
              <FoldderNodeContentDockMain>
                <p className="foldder-node-content-dock-text">{headerTitle}</p>
                <p className="foldder-node-content-dock-text foldder-node-content-dock-text--placeholder">
                  {previewLine}
                </p>
                <FoldderNodeContentMeta>
                  <FoldderNodeContentMetaRow
                    label="Proveedor"
                    value={
                      <NanoBananaNodeDockProviderSelect
                        value={imageProvider}
                        disabled={isActivelyGenerating}
                        onChange={(provider) => updateData("imageProvider", provider)}
                      />
                    }
                  />
                  <FoldderNodeContentMetaRow label="Modelo" value={modelLabel} />
                  <FoldderNodeContentMetaRow label="Formato" value={formatLabel} />
                  <FoldderNodeContentMetaRow label="Resolución" value={nbResLabel} />
                  <FoldderNodeContentMetaRow label="Entradas" value={inputsLabel} />
                  <FoldderNodeContentMetaRow label="Versiones" value={versionsLabel} />
                  <FoldderNodeContentMetaRow label="Estado" value={statusLabel} variant="status" />
                </FoldderNodeContentMeta>
              </FoldderNodeContentDockMain>
              <FoldderNodeContentDockActions className="nano-banana-node-dock-actions">
                <FoldderStudioModeCenterButton
                  variant="dock"
                  label="Open Studio"
                  title="Abrir Image Creation Studio"
                  onClick={openNanoStudioNormal}
                />
                {showDockGenerate ? (
                  <FoldderStudioModeCenterButton
                    variant="dock"
                    label="Generate"
                    title="Generar imagen con el prompt conectado"
                    disabled={isActivelyGenerating || !effectivePromptValue}
                    onClick={() => {
                      void onRun();
                    }}
                  />
                ) : null}
              </FoldderNodeContentDockActions>
            </FoldderNodeContentDock>
          </div>
        ) : null}
      </div>

      {/* ── NanoBanana Studio ── */}
      {showStudio && (() => {
        const studioPrompt = cineStudioPrompt || promptValue;
        const refImgs = refImages;
        const connected0 = cineStudioSourceImage || (refImgs[0] as string | null | undefined) || null;
        const isCineStudioSession = Boolean(cineStudioPrompt || cineStudioSourceImage);
        const studioLastGenerated = isCineStudioSession ? null : outputImage;
        return (
          <NanoBananaStudio
            nodeId={id}
            nodeLabel={nodeData.label?.trim() || "Image Creation"}
            initialImage={connected0}
            lastGenerated={studioLastGenerated}
            modelKey={nodeData.modelKey || 'flash31'}
            aspectRatio={nodeData.aspect_ratio || '16:9'}
            resolution={normalizeNanoBananaResolution(nodeData.resolution)}
            thinking={!!nodeData.thinking}
            prompt={studioPrompt}
            externalPromptIgnored={!cineStudioPrompt}
            onBrainImageGeneratorDiagnostics={setBrainImageDiagSync}
            topBarCloseMode={nanoStudioTopBarCloseMode}
            generationHistory={isCineStudioSession ? cineStudioHistory : persistedGenerationHistory}
            onGenerationHistoryChange={isCineStudioSession ? setCineStudioHistory : onGenerationHistoryChange}
            onClose={closeNanoStudio}
            onGenerated={(url, s3Key) => {
              latestStudioAssetRef.current = url;
              latestStudioS3KeyRef.current = s3Key || null;
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
              setStudioTouched(true);
              setNodes((nds) => nds.map((n) => {
                if (n.id !== id) return n;
                const data: Record<string, unknown> = touchStudioNodeData(n.data as Record<string, unknown>, {
                  value: url,
                  type: 'image',
                  generatedByAi: true,
                  generatedByAiSource: "gemini-image-generator:studio",
                });
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
            src={outputFullUrl ?? outputImage}
            className="max-h-full max-w-full w-auto h-auto rounded-none object-contain shadow-2xl"
            alt="Full size"
          />
        </div>
      )}
    </StudioCanvasNodeShell>
  );
});
