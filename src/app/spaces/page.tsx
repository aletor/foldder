"use client";

import React, { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Node,
  Edge,
  OnConnect,
  ConnectionMode,
  ReactFlowProvider,
  useReactFlow,
  useUpdateNodeInternals,
  useNodesState,
  useEdgesState,
  useOnViewportChange,
  SelectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { 
  MediaInputNode, 
  PromptNode, 
  GrokNode, 
  ConcatenatorNode,
  ListadoNode,
  EnhancerNode, 
  NanoBananaNode,
  BackgroundRemoverNode,
  MediaDescriberNode,
  BackgroundNode,
  ImageComposerNode,
  ImageExportNode,
  UrlImageNode,
  SpaceNode,
  SpaceInputNode,
  SpaceOutputNode,
  GeminiVideoNode,
  VfxGeneratorNode,
  PainterNode,
  CropNode,
  BezierMaskNode,
  FreehandNode,
  IndesignNode,
  TextOverlayNode,
  ButtonEdge 
} from './CustomNodes';
import { CanvasGroupNode } from './CanvasGroupNode';
import {
  applyCanvasGroupCollapse,
  applyCanvasGroupExpand,
  createCanvasGroupFromNodeIds,
  normalizeCanvasGroupNodeZ,
  normalizeNodeZIndexForXYFlow,
  normalizeNodesForPersistence,
  normalizeSpacesMapNodesForPersistence,
  recomputeCanvasGroupFrames,
  nodeBoundsForLayout,
  removeEmptyCanvasGroups,
  ungroupCanvasGroup,
  filterEdgesForCollapsedCanvasGroups,
} from './canvas-group-logic';


import Sidebar from './Sidebar';
import { AgentHUD } from './AgentHUD';
import { ApiUsageHud } from './ApiUsageHud';
import { HandleTypeLegend } from './HandleTypeLegend';
import { AiRequestHud } from './AiRequestHud';
import { ExternalApiBlockedModal } from './ExternalApiBlockedModal';
import {
  TopbarPins,
} from './TopbarPins';
import {
  resolveHandleMetaForCanvasDrop,
  pickNewNodeTypeForCanvasDrop,
  defaultDataForCanvasDropNode,
} from '@/lib/canvas-connect-end-drop';
import { matchesClearCanvasIntent } from '@/lib/clear-canvas-intent';
import { matchesAddSpaceNodeIntent } from '@/lib/assistant-quick-intents';
import { installAiFetchOverlay } from '@/lib/ai-request-overlay';
import { readResponseJson } from '@/lib/read-response-json';
import { hydrateSpacesMapWithFreshUrls } from '@/lib/s3-media-hydrate';
import { deleteSupersededS3Key } from '@/lib/s3-delete-client';
import {
  AI_JOB_COMPLETE_EVENT,
  AI_JOB_CANVAS_NODE_ID,
  runAiJobWithNotification,
  type AiJobCompleteDetail,
} from '@/lib/ai-job-notifications';
import { FOLDDER_FIT_VIEW_EASE } from '@/lib/fit-view-ease';
import {
  isDocumentFullscreen,
  subscribeFullscreenChange,
  toggleDocumentFullscreen,
} from '@/lib/fullscreen';
import './spaces.css';
import { NODE_REGISTRY } from './nodeRegistry';
import {
  FOLDDER_LOGO_BLUE,
  getFoldderNodeHeaderTintColor,
  getFoldderNodeOutputBorderColor,
} from './handle-type-colors';

/** Tamaño inicial de nodos media: ancho en ratio 16:9 respecto al alto (preview del lienzo). */
const NANO_BANANA_DEFAULT_H = 480;
const NANO_BANANA_DEFAULT_W = Math.round((NANO_BANANA_DEFAULT_H * 16) / 9);
const GEMINI_VIDEO_DEFAULT_H = 540;
const GEMINI_VIDEO_DEFAULT_W = Math.round((GEMINI_VIDEO_DEFAULT_H * 16) / 9);
import {
  NodeExecutionProvider,
  useNodeExecutionRunner,
} from './NodeExecutionBridge';
import {
  areNodesConnectable,
  findLibraryDropPlan,
  computeLibraryDropPosition,
  findTopNodeUnderFlowPoint,
  findEmptyPositionForNewNode,
  preferredCenterRightOfRightmostNode,
  planDuplicateBelowMultiInput,
  orderedSourcesForSharedTarget,
  positionNewNodeRightOfSources,
} from './connection-utils';
import { NodeIconMono } from './foldder-icons';
import { 
  Save, 
  FolderOpen, 
  Trash2, 
  Check, 
  Settings2,
  Calendar,
  Clock,
  Copy,
  Workflow,
  Loader2,
  X,
  Edit2,
  Maximize,
  Maximize2,
  Minimize2,
  LayoutGrid,
  ChevronDown,
  Layers,
  Move,
  Download,
  ZoomIn,
  MessageCircle,
  CheckCircle2,
  AlertCircle,
  Wallet,
} from 'lucide-react';
import { SpacesWelcomeChrome } from './SpacesWelcomeChrome';
import { SpacesPasswordOverlay } from './SpacesPasswordOverlay';

const initialNodes: Node[] = [];

/** Fondos del lienzo: local + URLs directas (CDN). */
const CANVAS_BG_STORAGE_KEY = 'foldder-canvas-bg-id';

type CanvasBackgroundOption = { id: string; label: string; url: string };

const CANVAS_BACKGROUNDS: CanvasBackgroundOption[] = [
  { id: 'studio', label: 'Estudio (actual)', url: '/studio_back.jpg' },
  {
    id: 'magicdecor-mosaic',
    label: 'Mosaico Mughal',
    url: 'https://cdn.magicdecor.in/com/2023/12/13184932/Mughal-Marvels-Mosaic-Wallpaper-710x488.jpg',
  },
  {
    id: 'unsplash-city-night',
    label: 'Ciudad nocturna',
    url: 'https://images.unsplash.com/photo-1485470733090-0aae1788d5af?fm=jpg&q=60&w=3000&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTN8fGdhbWluZyUyMHdhbGxwYXBlcnxlbnwwfHwwfHx8MA%3D%3D',
  },
  {
    id: 'ftcdn-abstract',
    label: 'Abstracto',
    url: 'https://t3.ftcdn.net/jpg/04/83/77/82/360_F_483778295_PmGDVnK5jSPiHD0aVDVPsaycL7RDVqIr.jpg',
  },
  {
    id: 'unsplash-earth-space',
    label: 'Tierra · espacio (Unsplash)',
    url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?fm=jpg&q=60&w=3000&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NHx8Zm9uZG8lMjBkZSUyMHBhbnRhbGxhJTIwNGt8ZW58MHx8MHx8fDA%3D',
  },
  {
    id: 'pixelstalk-landscape-hd',
    label: 'Paisaje Full HD',
    url: 'https://www.pixelstalk.net/wp-content/uploads/wallpapers/Landscape-Wallpapers-Full-HD.jpg',
  },
  {
    id: 'pixabay-mountain-5242534',
    label: 'Montañas · Pixabay',
    url: 'https://cdn.pixabay.com/photo/2020/05/31/12/41/mountain-5242534_1280.jpg',
  },
  {
    id: 'wallpapershome-thumb-8164',
    label: 'Miniatura HD · Wallpapershome',
    url: 'https://wallpapershome.com/images/pages/pic_h/8164.jpg',
  },
  {
    id: 'wallpaperbat-fantasy-webp',
    label: 'Fantasía ultrahd',
    url: 'https://wallpaperbat.com/img/12457956-beautiful-fantasy-wallpaper-ultra-hd.webp',
  },
  {
    id: 'pixabay-sea-3652697',
    label: 'Mar · Pixabay',
    url: 'https://cdn.pixabay.com/photo/2018/09/03/23/56/sea-3652697_1280.jpg',
  },
  {
    id: 'infobae-horizon',
    label: 'Horizonte HD',
    url: 'https://www.infobae.com/resizer/v2/HA5THUH7O5G55D7G26I3QBQCCE.jpg?auth=6929fa20734fb29457770ab17cb4c935aa12166f0f536e0b95846e1a837c0adc&smart=true&width=1200&height=675&quality=85',
  },
  {
    id: 'getwallpapers-texture-882333',
    label: 'Textura HD',
    url: 'https://getwallpapers.com/wallpaper/full/f/5/6/882333-full-size-texture-hd-wallpapers-1920x1080-full-hd.jpg',
  },
];

const FINAL_NODE_ID = 'final_output_permanent';

/** Zoom intro 2s + typewriter cabecera (retraso 1s); se limpia al cabo para no persistir en guardados. */
const FOLDDER_CANVAS_INTRO_CLEAR_MS = 3600;

function withFoldderCanvasIntro(nodeType: string, data: Record<string, unknown>): Record<string, unknown> {
  if (nodeType === 'canvasGroup') return { ...data };
  return { ...data, _foldderCanvasIntro: true };
}

/**
 * Por defecto XY Flow usa `noPanClassName="nopan"`: si el wheel va a un descendiente de `.nopan`,
 * el filtro rechaza el evento y no hay pan con trackpad. Varios nodos llevan `nopan` en zonas amplias.
 * Usamos una clase que no existe en el DOM: el pan con dos dedos llega al lienzo; `nowheel` en inputs no cambia.
 */
const XYFLOW_NO_PAN_WHEEL_GUARD_CLASS = 'foldder-xyflow-nopan-guard-disabled';

/** Alineado con @xyflow/system (wheelDelta en createPanOnScrollHandler). */
function foldderIsMacOs(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.platform);
}

/**
 * Distingue rueda física vs trackpad (no hay API estándar).
 * - Línea/página → casi siempre ratón (zoom).
 * - Píxeles, delta grande en un eje → rueda rápida (zoom).
 * - Píxeles, deltas pequeños y eventos muy seguidos (~60 Hz) → scroll suave del trackpad (pan).
 * - Píxeles, deltas pequeños y ticks separados → rueda lenta (zoom); el umbral fijo ~40 fallaba aquí.
 *
 * @param dtFromPreviousMs tiempo desde el último wheel en el lienzo (∞ si no hay anterior).
 */
function foldderWheelLooksLikeMouse(e: WheelEvent, dtFromPreviousMs: number): boolean {
  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE || e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return true;
  }
  const ax = Math.abs(e.deltaX);
  const ay = Math.abs(e.deltaY);

  if (ax >= 4 && ay >= 4) return false;

  if (ax >= 6 && ay < 4) return false;

  if (ax < 3 && ay >= 40) return true;
  if (ay < 3 && ax >= 40) return true;

  const smallDeltas = ax < 36 && ay < 36 && Math.max(ax, ay) <= 12;
  const trackpadBurst =
    Number.isFinite(dtFromPreviousMs) &&
    dtFromPreviousMs > 0 &&
    dtFromPreviousMs < 42 &&
    smallDeltas;
  if (trackpadBurst) return false;

  return true;
}

/**
 * Margen relativo para `fitView` (@xyflow: default 0.1). Valores altos añaden mucho aire y el grafo se ve pequeño;
 * 1.2 era demasiado agresivo.
 */
const FIT_VIEW_PADDING = 0.14;

/**
 * Solo al arrastrar un tipo desde el sidebar (con parpadeo de compatibles): `FIT_VIEW_PADDING` × 5
 * para ver mucho más lienzo vacío al colocar. No afecta al resto de “ajustar a ventana”.
 */
const FIT_VIEW_PADDING_LIBRARY_DRAG = FIT_VIEW_PADDING * 5;

/** Al encuadrar uno o pocos nodos (doble clic, nodo nuevo, etc.): un poco más de margen que el fit a todo el grafo */
const FIT_VIEW_PADDING_NODE_FOCUS = 0.8;

/** Modo cartas: margen al encuadrar el nodo activo. */
const FIT_VIEW_PADDING_CARDS = 0.35;

/** Duración efectiva de encuadres `fitView` / `fitViewToNodeIds` (nominal ÷ 2; antes ÷ 4, demasiado rápido). Mín. 40 ms. */
function fitAnim(ms: number): number {
  return Math.max(40, Math.round(ms / 2));
}

/** Ancho/alto efectivos para layout (medido, style, defaults; alineado con marcos de grupo). */
function getNodeLayoutDimensions(n: Node): { w: number; h: number } {
  return nodeBoundsForLayout(n);
}

/** Componentes conexos (grafo no dirigido) restringidos a `nodeIds`. */
function undirectedLayoutComponents(nodeIds: string[], edges: Edge[]): string[][] {
  const idSet = new Set(nodeIds);
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    adj.get(e.target)!.push(e.source);
  }
  const visited = new Set<string>();
  const out: string[][] = [];
  for (const id of nodeIds) {
    if (visited.has(id)) continue;
    const comp: string[] = [];
    const stack = [id];
    visited.add(id);
    while (stack.length) {
      const u = stack.pop()!;
      comp.push(u);
      for (const v of adj.get(u) || []) {
        if (!visited.has(v)) {
          visited.add(v);
          stack.push(v);
        }
      }
    }
    out.push(comp);
  }
  return out;
}

/**
 * Columnas por orden topológico (Kahn) dentro de un subconjunto de nodos.
 * Los nodos sueltos no deben mezclarse aquí: van en otra columna al margen.
 */
function runKahnColumnLayout(
  toArrange: Node[],
  edges: Edge[],
  getDim: (n: Node) => { w: number; h: number },
  gap: number
): Record<string, { x: number; y: number }> {
  const ids = new Set(toArrange.map((n) => n.id));
  const inCount: Record<string, number> = {};
  const children: Record<string, string[]> = {};
  for (const n of toArrange) {
    inCount[n.id] = 0;
    children[n.id] = [];
  }
  for (const e of edges) {
    if (ids.has(e.source) && ids.has(e.target)) {
      inCount[e.target] = (inCount[e.target] || 0) + 1;
      children[e.source].push(e.target);
    }
  }
  const col: Record<string, number> = {};
  let queue = toArrange.filter((n) => inCount[n.id] === 0).map((n) => n.id);
  queue.forEach((id) => {
    col[id] = 0;
  });
  while (queue.length) {
    const next: string[] = [];
    for (const nodeId of queue) {
      for (const childId of children[nodeId]) {
        col[childId] = Math.max(col[childId] ?? 0, (col[nodeId] ?? 0) + 1);
        inCount[childId]--;
        if (inCount[childId] === 0) next.push(childId);
      }
    }
    queue = next;
  }
  const maxCol = Math.max(0, ...Object.values(col));
  for (const n of toArrange) {
    if (col[n.id] === undefined) col[n.id] = maxCol + 1;
  }
  const maxColIndex = Math.max(0, ...toArrange.map((n) => col[n.id] ?? 0));
  const nodesByColumn: Record<number, Node[]> = {};
  for (let c = 0; c <= maxColIndex; c++) nodesByColumn[c] = [];
  for (const n of toArrange) {
    const c = col[n.id] ?? 0;
    nodesByColumn[c].push(n);
  }
  for (let c = 0; c <= maxColIndex; c++) {
    nodesByColumn[c].sort(
      (a, b) => a.position.y - b.position.y || String(a.id).localeCompare(String(b.id))
    );
  }
  const positioned: Record<string, { x: number; y: number }> = {};
  let xCursor = 0;
  for (let c = 0; c <= maxColIndex; c++) {
    const list = nodesByColumn[c];
    if (!list.length) continue;
    const colMaxW = Math.max(...list.map((n) => getDim(n).w));
    const heights = list.map((n) => getDim(n).h);
    const totalH =
      heights.reduce((acc, h) => acc + h, 0) + (list.length > 1 ? (list.length - 1) * gap : 0);
    let yCursor = -totalH / 2;
    for (const n of list) {
      const { h } = getDim(n);
      positioned[n.id] = { x: xCursor, y: yCursor };
      yCursor += h + gap;
    }
    xCursor += colMaxW + gap;
  }
  return positioned;
}

/**
 * Si un nodo tiene **varias** entradas desde el mismo subconjunto (p. ej. prompts → concatenador / listado),
 * desplaza su `y` para que su centro vertical coincida con el centro del bloque formado por los orígenes.
 */
function alignMultiInputTargetsToSources(
  positioned: Record<string, { x: number; y: number }>,
  nodes: Node[],
  edges: Edge[],
  getDim: (n: Node) => { w: number; h: number }
): void {
  const idSet = new Set(nodes.map((n) => n.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    if (!incoming.has(e.target)) incoming.set(e.target, new Set());
    incoming.get(e.target)!.add(e.source);
  }
  for (const [targetId, srcSet] of incoming) {
    if (srcSet.size < 2) continue;
    let minTop = Infinity;
    let maxBottom = -Infinity;
    for (const sid of srcSet) {
      const p = positioned[sid];
      if (!p) continue;
      const sn = byId.get(sid);
      if (!sn) continue;
      const { h } = getDim(sn);
      minTop = Math.min(minTop, p.y);
      maxBottom = Math.max(maxBottom, p.y + h);
    }
    if (!Number.isFinite(minTop)) continue;
    const midY = (minTop + maxBottom) / 2;
    const tn = byId.get(targetId);
    if (!tn) continue;
    const { h: ht } = getDim(tn);
    const cur = positioned[targetId];
    if (!cur) continue;
    positioned[targetId] = { x: cur.x, y: midY - ht / 2 };
  }
}

/** Bajo el cursor del cliente: primer nodo/grupo React Flow (`.react-flow__node`) en el stack de pintado. */
function getReactFlowNodeIdAtClientPoint(clientX: number, clientY: number): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const stack = document.elementsFromPoint(clientX, clientY);
    for (const el of stack) {
      if (!(el instanceof Element)) continue;
      const wrap = el.closest('.react-flow__node');
      if (!wrap) continue;
      const id =
        wrap.getAttribute('data-id') ||
        (wrap instanceof HTMLElement && wrap.id ? wrap.id : null);
      if (id) return id;
    }
  } catch {
    /* elementsFromPoint puede fallar en coordenadas inválidas */
  }
  return null;
}

function sortNodesCardsOrder<T extends { id: string; position: { x: number; y: number } }>(arr: T[]): T[] {
  return [...arr].sort(
    (a, b) =>
      a.position.y !== b.position.y ? a.position.y - b.position.y : a.position.x - b.position.x
  );
}

/** `--foldder-node-output-color`: aristas/handles. `--foldder-node-header-tint-color`: vidrio+cabecera+botón (como Export; logo azul solo imagen/vídeo). */
function mergeNodeOutputBorderStyle(
  node: { style?: React.CSSProperties; type?: string; data?: Record<string, unknown> | null },
  extra?: React.CSSProperties
): React.CSSProperties {
  const borderColor = getFoldderNodeOutputBorderColor(node);
  const headerTintColor = getFoldderNodeHeaderTintColor(node);
  return {
    ...(node.style || {}),
    ...(extra || {}),
    ['--foldder-node-output-color' as string]: borderColor,
    ['--foldder-node-header-tint-color' as string]: headerTintColor,
  };
}

const nodeTypes: any = {
  mediaInput: MediaInputNode,
  promptInput: PromptNode,
  grokProcessor: GrokNode,
  concatenator: ConcatenatorNode,
  listado: ListadoNode,
  enhancer: EnhancerNode,
  nanoBanana: NanoBananaNode,
  backgroundRemover: BackgroundRemoverNode,
  mediaDescriber: MediaDescriberNode,
  background: BackgroundNode,
  imageComposer: ImageComposerNode,
  imageExport: ImageExportNode,
  urlImage: UrlImageNode,
  space: SpaceNode,
  spaceInput: SpaceInputNode,
  spaceOutput: SpaceOutputNode,
  geminiVideo: GeminiVideoNode,
  vfxGenerator: VfxGeneratorNode,
  painter: PainterNode,
  crop: CropNode,
  bezierMask: BezierMaskNode,
  freehand: FreehandNode,
  indesign: IndesignNode,
  textOverlay: TextOverlayNode,
  canvasGroup: CanvasGroupNode,
};


const edgeTypes = {
  buttonEdge: ButtonEdge,
  default: ButtonEdge, // Fallback for stability
};

const defaultEdgeOptions = {
  type: 'buttonEdge',
  animated: true,
};

const initialEdges: Edge[] = [];

const SpacesContent = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<any>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>(initialEdges);
  /** Siempre la misma referencia que `nodes` / `edges` (sync en render, no en useEffect) */
  const liveNodesRef = useRef<any[]>(initialNodes);
  const liveEdgesRef = useRef<any[]>(initialEdges);
  liveNodesRef.current = nodes;
  liveEdgesRef.current = edges;
  const { screenToFlowPosition, setViewport, fitView, getViewport } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const runAssistantPipeline = useNodeExecutionRunner();

  const scheduleFoldderCanvasIntroEnd = useCallback(
    (nodeId: string) => {
      window.setTimeout(() => {
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== nodeId) return n;
            if (!n.data || typeof n.data !== 'object') return n;
            const { _foldderCanvasIntro: _drop, ...rest } = n.data as Record<string, unknown>;
            return { ...n, data: rest };
          })
        );
        requestAnimationFrame(() => {
          updateNodeInternals(nodeId);
          for (const e of liveEdgesRef.current) {
            if (e.source === nodeId) updateNodeInternals(e.target);
            if (e.target === nodeId) updateNodeInternals(e.source);
          }
        });
      }, FOLDDER_CANVAS_INTRO_CLEAR_MS);
    },
    [setNodes, updateNodeInternals]
  );

  /**
   * Durante el zoom CSS de intro, los handles se mueven frame a frame; React Flow no remide solo.
   * Refrescamos internals en cada rAF mientras haya nodos con `_foldderCanvasIntro`.
   */
  useEffect(() => {
    let rafId = 0;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      const introIds = liveNodesRef.current
        .filter((n: any) => n.data?._foldderCanvasIntro)
        .map((n: any) => n.id as string);
      if (introIds.length === 0) return;

      const refresh = new Set<string>(introIds);
      for (const e of liveEdgesRef.current) {
        if (introIds.includes(e.source)) {
          refresh.add(e.source);
          refresh.add(e.target);
        }
        if (introIds.includes(e.target)) {
          refresh.add(e.source);
          refresh.add(e.target);
        }
      }
      for (const id of refresh) updateNodeInternals(id);

      if (!stopped) rafId = requestAnimationFrame(tick);
    };

    if (nodes.some((n: any) => n.data?._foldderCanvasIntro)) {
      rafId = requestAnimationFrame(tick);
    }

    return () => {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [nodes, updateNodeInternals]);

  // Persistence state
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeSpaceId, setActiveSpaceId] = useState<string>('root');
  const [currentName, setCurrentName] = useState<string>('');
  const [savedProjects, setSavedProjects] = useState<any[]>([]);
  const [spacesMap, setSpacesMap] = useState<Record<string, any>>({});
  const [metadata, setMetadata] = useState<any>({});
  
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isGeneratingAssistant, setIsGeneratingAssistant] = useState(false);
  /** Respuesta del modelo pidiendo desambiguación (opciones en modal). */
  const [assistantClarify, setAssistantClarify] = useState<{
    message: string;
    options: string[];
    originalPrompt: string;
  } | null>(null);
  /** Grafo listo para aplicar tras confirmar coste de APIs (misma respuesta del asistente). */
  const pendingAssistantCostPayloadRef = useRef<{
    nodes: Node[];
    edges: Edge[];
    executeNodeIds?: string[];
  } | null>(null);
  const [assistantCostApproval, setAssistantCostApproval] = useState<{
    message: string;
    apis: { id: string; name: string; count: number; eurMin: number; eurMax: number }[];
    totalEurMin: number;
    totalEurMax: number;
  } | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<any | null>(null);
  const [navigationStack, setNavigationStack] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, nodeId?: string } | null>(null);

  /** Zoom actual del lienzo (React Flow) — HUD fijo abajo-derecha */
  const [canvasZoom, setCanvasZoom] = useState(0.7);
  /** Panel de uso de APIs: oculto hasta pulsar el control de zoom */
  const [apiUsagePanelOpen, setApiUsagePanelOpen] = useState(false);

  /** Avisos poco intrusivos al terminar trabajos de IA en segundo plano */
  const [aiJobToasts, setAiJobToasts] = useState<Array<{ id: string } & AiJobCompleteDetail>>([]);

  /** Fondo visual del lienzo (persistido) */
  const [canvasBgId, setCanvasBgId] = useState<string>('studio');
  const [canvasBgMenuOpen, setCanvasBgMenuOpen] = useState(false);
  const canvasBgMenuRef = useRef<HTMLDivElement>(null);

  /** Tras soltar un nodo desde la librería en el lienzo, el panel queda colapsado hasta volver a la franja izquierda */
  const [sidebarLockedCollapsed, setSidebarLockedCollapsed] = useState(false);

  const [libraryDropTargetId, setLibraryDropTargetId] = useState<string | null>(null);
  /** Durante arrastre desde librería: ids de nodos que pueden conectar con el tipo arrastrado */
  const [libraryCompatibleIds, setLibraryCompatibleIds] = useState<string[]>([]);
  const libraryDropTargetIdRef = useRef<string | null>(null);
  const libraryDragTypeRef = useRef<string | null>(null);
  /** Viewport antes del fit al arrastrar desde la librería — se restaura si el nodo no se suelta en el lienzo */
  const libraryDragViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  /** true si onDrop en el lienzo añadió nodo(s) / archivos en este arrastre */
  const libraryCanvasDropSucceededRef = useRef(false);
  /** Arrastre activo desde la librería: oculta tooltips rollover y evita solapes de UI */
  const [paletteDragActive, setPaletteDragActive] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(CANVAS_BG_STORAGE_KEY);
      if (v && CANVAS_BACKGROUNDS.some((b) => b.id === v)) setCanvasBgId(v);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CANVAS_BG_STORAGE_KEY, canvasBgId);
    } catch {
      /* ignore */
    }
  }, [canvasBgId]);

  useEffect(() => {
    if (!canvasBgMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof globalThis.Node)) return;
      if (canvasBgMenuRef.current && !canvasBgMenuRef.current.contains(t)) {
        setCanvasBgMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [canvasBgMenuOpen]);

  const reactFlowCanvasStyle = useMemo((): React.CSSProperties => {
    const bg = CANVAS_BACKGROUNDS.find((b) => b.id === canvasBgId) ?? CANVAS_BACKGROUNDS[0];
    return {
      backgroundColor: '#f8fafc',
      backgroundImage: `url("${bg.url}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundAttachment: 'fixed',
    };
  }, [canvasBgId]);

  const handleLibraryDragStart = useCallback(
    (nodeType: string) => {
      setPaletteDragActive(true);
      libraryDragViewportRef.current = getViewport();
      libraryCanvasDropSucceededRef.current = false;
      libraryDragTypeRef.current = nodeType;

      const compatible: string[] = [];
      for (const n of nodes) {
        if (findLibraryDropPlan(nodeType, n, edges)) {
          compatible.push(n.id);
        }
      }
      queueMicrotask(() => {
        setLibraryCompatibleIds(compatible);
        fitView({
          padding: FIT_VIEW_PADDING_LIBRARY_DRAG,
          duration: fitAnim(420),
          ...FOLDDER_FIT_VIEW_EASE,
        });
      });
    },
    [fitView, getViewport, nodes, edges]
  );

  const handleLibraryDragEnd = useCallback(() => {
    setPaletteDragActive(false);
    const saved = libraryDragViewportRef.current;
    const dropOk = libraryCanvasDropSucceededRef.current;
    if (!dropOk && saved) {
      setViewport(saved, { duration: fitAnim(380), ...FOLDDER_FIT_VIEW_EASE });
    }
    libraryDragViewportRef.current = null;
    libraryCanvasDropSucceededRef.current = false;
    libraryDragTypeRef.current = null;
    libraryDropTargetIdRef.current = null;
    setLibraryDropTargetId(null);
    setLibraryCompatibleIds([]);
  }, [setViewport]);

  /** Encuadra solo los nodos indicados (normalmente uno: el recién añadido), sin fit a todo el grafo */
  const [browserFullscreen, setBrowserFullscreen] = useState(false);

  useEffect(() => {
    setBrowserFullscreen(isDocumentFullscreen());
    return subscribeFullscreenChange(() => setBrowserFullscreen(isDocumentFullscreen()));
  }, []);

  const togglePageFullscreen = useCallback(() => {
    void toggleDocumentFullscreen().catch((err) => {
      console.warn('[fullscreen]', err);
    });
  }, []);

  const fitViewToNodeIds = useCallback(
    (ids: string[], duration = 650, options?: { padding?: number }) => {
      const unique = [...new Set(ids.filter(Boolean))];
      if (unique.length === 0) return;
      const d = fitAnim(duration);
      const padding = options?.padding ?? FIT_VIEW_PADDING_NODE_FOCUS;
      setTimeout(() => {
        void fitView({
          nodes: unique.map((id) => ({ id })) as Node[],
          padding,
          duration: d,
          interpolate: 'smooth',
          ...FOLDDER_FIT_VIEW_EASE,
        });
      }, 60);
    },
    [fitView]
  );

  // ── Window Viewer Mode ─────────────────────────────────────────────────────
  const [windowMode, setWindowMode] = useState(false);

  /** `free`: grafo interactivo habitual. `cards`: un nodo a pantalla completa; ←/→ cambian la carta. */
  const [canvasViewMode, setCanvasViewMode] = useState<'free' | 'cards'>('free');
  const [cardsFocusIndex, setCardsFocusIndex] = useState(0);
  /** Alterna animación CSS al cambiar de carta (mismo keyframe con dos nombres). */
  const [cardsIntroTick, setCardsIntroTick] = useState(0);
  const cardsAnchorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cardsNavKeyRef = useRef<string>('');
  const freeLayoutSnapshotRef = useRef<Record<string, { x: number; y: number }>>({});
  const canvasViewModeRef = useRef<'free' | 'cards'>('free');
  canvasViewModeRef.current = canvasViewMode;

  const enterCardsViewMode = useCallback(() => {
    if (canvasViewModeRef.current === 'cards') return;
    if (nodes.length === 0) return;
    freeLayoutSnapshotRef.current = Object.fromEntries(
      nodes.map((n) => [n.id, { ...n.position }])
    );
    const el = document.querySelector('.react-flow__renderer');
    let cx = window.innerWidth / 2;
    let cy = window.innerHeight / 2;
    if (el) {
      const r = el.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
    }
    cardsAnchorRef.current = screenToFlowPosition({ x: cx, y: cy });
    const ordered = [...nodes].sort(
      (a, b) =>
        a.position.y !== b.position.y ? a.position.y - b.position.y : a.position.x - b.position.x
    );
    const sel = nodes.find((n) => n.selected);
    const fi = sel ? ordered.findIndex((n) => n.id === sel.id) : 0;
    setCardsFocusIndex(fi >= 0 ? fi : 0);
    setCanvasViewMode('cards');
  }, [nodes, screenToFlowPosition]);

  const exitCardsViewMode = useCallback(() => {
    if (canvasViewModeRef.current === 'free') return;
    setNodes((nds) =>
      nds.map((n) => {
        const p = freeLayoutSnapshotRef.current[n.id];
        const style: Record<string, unknown> = n.style ? { ...(n.style as object) } : {};
        if ('zIndex' in style) delete style.zIndex;
        const next = {
          ...n,
          style: Object.keys(style).length ? (style as React.CSSProperties) : undefined,
        };
        if (p) return { ...next, position: p };
        return next;
      })
    );
    setCanvasViewMode('free');
    setTimeout(() => {
      void fitView({
        padding: FIT_VIEW_PADDING,
        duration: fitAnim(800),
        interpolate: 'smooth',
        ...FOLDDER_FIT_VIEW_EASE,
      });
    }, 90);
  }, [setNodes, fitView]);

  useEffect(() => {
    if (canvasViewMode !== 'cards') return;
    if (nodes.length === 0) return;
    setCardsFocusIndex((i) => Math.min(i, nodes.length - 1));
  }, [nodes.length, canvasViewMode]);

  /** Encuadre pantalla completa del nodo activo + disparar zoom-in solo al cambiar de carta. */
  useEffect(() => {
    if (canvasViewMode !== 'cards') {
      cardsNavKeyRef.current = '';
      return;
    }
    if (nodes.length === 0) return;
    const ordered = sortNodesCardsOrder(nodes);
    const f = Math.min(Math.max(0, cardsFocusIndex), ordered.length - 1);
    const id = ordered[f]?.id;
    if (!id) return;
    const navKey = `${f}:${id}`;
    if (cardsNavKeyRef.current === navKey) return;
    cardsNavKeyRef.current = navKey;
    setCardsIntroTick((t) => t + 1);
    const delayMs = 90;
    const t = setTimeout(() => {
      fitViewToNodeIds([id], 560, { padding: FIT_VIEW_PADDING_CARDS });
    }, delayMs);
    return () => clearTimeout(t);
  }, [canvasViewMode, cardsFocusIndex, nodes, fitViewToNodeIds]);

  const [showWelcome, setShowWelcome] = useState(false); // triggered after auth
  const [showEmptyShortcutsHint, setShowEmptyShortcutsHint] = useState(false);

  useEffect(() => {
    if (showEmptyShortcutsHint && nodes.length > 0) {
      setShowEmptyShortcutsHint(false);
    }
  }, [nodes.length, showEmptyShortcutsHint]);

  /** Which node supplies `data.value` for the fullscreen viewer (opened via node header buttons). */
  const [viewerSourceNodeId, setViewerSourceNodeId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setViewport({ x: 120, y: 80, zoom: 0.72 });
    }, 50);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  const [viewerHeight, setViewerHeight] = useState(500); // safe SSR default; updated on mount

  const isDraggingViewer = useRef(false);
  const dragStartY = useRef(0);
  const dragStartH = useRef(0);

  const startViewerResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isDraggingViewer.current = true;
    dragStartY.current = e.clientY;
    dragStartH.current = viewerHeight;
    const onMove = (ev: PointerEvent) => {
      if (!isDraggingViewer.current) return;
      const delta = ev.clientY - dragStartY.current;
      const newH = Math.min(Math.max(dragStartH.current + delta, 200), Math.round(window.innerHeight * 0.82));
      setViewerHeight(newH);
    };
    const onUp = () => {
      isDraggingViewer.current = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [viewerHeight]);

    // ── Viewer pan / zoom ───────────────────────────────────────────────────────
  const [viewerTransform, setViewerTransform] = useState({ scale: 1, x: 0, y: 0 });
  const isPanningViewer = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });
  const viewerAreaRef = useRef<HTMLDivElement>(null);

  // Scroll → zoom centered on cursor
  const onViewerWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = Math.pow(0.998, e.deltaY);   // smooth, proportional to scroll speed
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setViewerTransform(prev => {
      const newScale = Math.min(Math.max(prev.scale * factor, 0.1), 20);
      const ratio = newScale / prev.scale;
      return {
        scale: newScale,
        x: mx - ratio * (mx - prev.x),
        y: my - ratio * (my - prev.y),
      };
    });
  }, []);

  // Pointer down → start pan
  const onViewerPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    isPanningViewer.current = true;
    panStart.current = { x: e.clientX, y: e.clientY };
    panOrigin.current = { x: 0, y: 0 }; // will be set from current transform in move
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setViewerTransform(prev => {
      panOrigin.current = { x: prev.x, y: prev.y };
      return prev;
    });
  }, []);

  const onViewerPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanningViewer.current) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setViewerTransform(prev => ({
      ...prev,
      x: panOrigin.current.x + dx,
      y: panOrigin.current.y + dy,
    }));
  }, []);

  const onViewerPointerUp = useCallback(() => {
    isPanningViewer.current = false;
  }, []);

  // Key 'A' → fit to view (reset transform)
  const onViewerKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'a' || e.key === 'A') {
      setViewerTransform({ scale: 1, x: 0, y: 0 });
    }
  }, []);

  // Media shown in the fullscreen viewer (from the node the user opened)
  const finalMedia = useMemo(() => {
    if (!viewerSourceNodeId) {
      return { value: null as string | null, type: 'image' as const };
    }
    const node = nodes.find((n: any) => n.id === viewerSourceNodeId);
    if (!node) {
      return { value: null as string | null, type: 'image' as const };
    }
    const value = typeof node.data?.value === 'string' ? node.data.value : null;
    let type: 'image' | 'video' = 'image';
    const nt = node.type as string;
    if (nt === 'geminiVideo' || nt === 'vfxGenerator' || nt === 'grokProcessor') type = 'video';
    else if (node.data?.type === 'video') type = 'video';
    else if (typeof value === 'string' && value.startsWith('data:video')) type = 'video';
    return { value, type };
  }, [nodes, viewerSourceNodeId]);

  // Download helper for viewer (placed after finalMedia to avoid use-before-declaration)
  const downloadViewerMedia = useCallback(async () => {
    if (!finalMedia.value) return;
    const ext = finalMedia.type === 'video' ? 'mp4' : 'png';
    const filename = `output.${ext}`;
    const url = finalMedia.value;

    if (url.startsWith('data:')) {
      // DataURL — direct download
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      // External URL — fetch as blob to force download (avoids new-tab opening)
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      } catch {
        // Fallback: open in new tab if fetch fails (e.g. strict CORS)
        window.open(url, '_blank');
      }
    }
  }, [finalMedia]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const ce = e as CustomEvent<{ nodeId?: string }>;
      const nid = ce.detail?.nodeId;
      if (!nid) return;
      setViewerSourceNodeId(nid);
      setWindowMode(true);
    };
    window.addEventListener('open-viewer-for-node', onOpen);
    return () => window.removeEventListener('open-viewer-for-node', onOpen);
  }, []);

  // Set real viewerHeight once mounted on client
  useEffect(() => {
    setViewerHeight(Math.max(Math.round(window.innerHeight * 0.5), 400));
  }, []);

  /** Mínimo garantizado: Ctrl+Z / Ctrl+Shift+Z (también Cmd en macOS). */
  const UNDO_REDO_DEPTH = 10;
  const historyRef = useRef<Array<{ nodes: any[]; edges: any[] }>>([]);
  const futureRef  = useRef<Array<{ nodes: any[]; edges: any[] }>>([]);

  // takeSnapshot: call BEFORE making a change so we record the pre-change state.
  const takeSnapshot = useCallback(() => {
    historyRef.current = [
      ...historyRef.current.slice(-(UNDO_REDO_DEPTH - 1)),
      { nodes: [...liveNodesRef.current], edges: [...liveEdgesRef.current] },
    ];
    futureRef.current = []; // any new action clears redo stack
  }, []);

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    futureRef.current.unshift({ nodes: [...liveNodesRef.current], edges: [...liveEdgesRef.current] });
    if (futureRef.current.length > UNDO_REDO_DEPTH) {
      futureRef.current.pop();
    }
    const prev = historyRef.current.pop()!;
    setNodes([...prev.nodes]);
    setEdges([...prev.edges]);
  }, [setNodes, setEdges]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    historyRef.current = [
      ...historyRef.current.slice(-(UNDO_REDO_DEPTH - 1)),
      { nodes: [...liveNodesRef.current], edges: [...liveEdgesRef.current] },
    ];
    const next = futureRef.current.shift()!;
    setNodes([...next.nodes]);
    setEdges([...next.edges]);
  }, [setNodes, setEdges]);

  /** Desagrupar en el lienzo: misma secuencia para menú contextual, atajo y botón del nodo `canvasGroup`. */
  const performCanvasUngroup = useCallback((groupId: string) => {
    let n = liveNodesRef.current;
    let e = liveEdgesRef.current;
    const cur = n.find((x) => x.id === groupId);
    if ((cur?.data as { collapsed?: boolean })?.collapsed) {
      const ex = applyCanvasGroupExpand(groupId, n, e);
      if (ex) {
        n = ex.nodes;
        e = ex.edges;
      }
    }
    takeSnapshot();
    const r = ungroupCanvasGroup(groupId, n);
    if (!r) return;
    setNodes(r.nodes);
    setEdges(e);
  }, [setNodes, setEdges, takeSnapshot]);

  useEffect(() => {
    const handler = (ev: Event) => {
      const gid = (ev as CustomEvent<{ groupId?: string }>).detail?.groupId;
      if (!gid) return;
      performCanvasUngroup(gid);
    };
    window.addEventListener("foldder-canvas-ungroup", handler as EventListener);
    return () => window.removeEventListener("foldder-canvas-ungroup", handler as EventListener);
  }, [performCanvasUngroup]);

  // ── Add node + smart auto-connect ──────────────────────────────────────
  const addNodeAtCenter = useCallback((type: string, extraData: Record<string, any> = {}) => {
    const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const newId  = `${type}_${Date.now()}`;

    // ── Auto-connect selected nodes ──────────────────────────────────────
    const selectedNodes = nodes.filter(n => n.selected);
    const newMeta   = NODE_REGISTRY[type];
    const autoEdges: any[] = [];
    const edgesToRemove = new Set<string>(); // for insert-between

    // Nodes that support multiple inputs of the same type via numbered slot handles
    const MULTI_SLOT_NODES: Record<string, Record<string, string[]>> = {
      concatenator: { prompt: ['p0','p1','p2','p3','p4','p5','p6','p7'] },
      listado:      { prompt: ['p0','p1','p2','p3','p4','p5','p6','p7'] },
      enhancer:     { prompt: ['p0','p1','p2','p3','p4','p5','p6','p7','p8','p9','p10','p11','p12','p13','p14','p15'] },
      vfxGenerator: { prompt: ['prompt'] },
      imageComposer: { image: ['layer_0','layer_1','layer_2','layer_3','layer_4','layer_5','layer_6','layer_7'] },
    };
    // Per-handle-type slot counters, reset per new node creation
    const slotCounters: Record<string, number> = {};
    const getSlot = (nodeType: string, handleType: string, fallbackId: string): string => {
      const slots = MULTI_SLOT_NODES[nodeType]?.[handleType];
      if (!slots) return fallbackId;
      const key = `${nodeType}:${handleType}`;
      const idx = slotCounters[key] ?? 0;
      slotCounters[key] = idx + 1;
      return slots[idx] ?? fallbackId;
    };


    if (newMeta && selectedNodes.length > 0) {
      const singleSelection = selectedNodes.length === 1;

      // For spaceOutput: only wire the last (rightmost) selected node
      let nodesToConnect: typeof selectedNodes =
        type === 'spaceOutput'
          ? [
              selectedNodes.reduce((prev, cur) =>
                cur.position.x > prev.position.x ||
                (cur.position.x === prev.position.x && cur.position.y > prev.position.y)
                  ? cur
                  : prev
              ),
            ]
          : selectedNodes;

      // Varios orígenes → concatenator / enhancer / composer: ranuras p0,p1… / layer_0… en orden de lienzo (arriba→abajo, izq→der), igual que ↑↓ entre fuentes
      if (type !== 'spaceOutput' && nodesToConnect.length > 1 && MULTI_SLOT_NODES[type]) {
        nodesToConnect = [...nodesToConnect].sort((a, b) => {
          if (a.position.y !== b.position.y) return a.position.y - b.position.y;
          if (a.position.x !== b.position.x) return a.position.x - b.position.x;
          return String(a.id).localeCompare(String(b.id));
        });
      }

      for (const sel of nodesToConnect) {
        const selMeta = NODE_REGISTRY[sel.type];
        if (!selMeta) continue;

        let connected = false;

        // ── Direction A: selected → new (selected as source) ──────────────
        for (const out of selMeta.outputs) {
          for (const inp of newMeta.inputs) {
            if (out.type !== inp.type) continue;
            const targetHandle = getSlot(type, inp.type, inp.id);
            const slotExhausted = MULTI_SLOT_NODES[type]?.[inp.type]
              ? (slotCounters[`${type}:${inp.type}`] ?? 1) > (MULTI_SLOT_NODES[type][inp.type].length)
              : false;
            if (slotExhausted) break;


            autoEdges.push({
              id: `ae-${sel.id}-${newId}-${out.id}-${targetHandle}`,
              source: sel.id,
              sourceHandle: out.id,
              target: newId,
              targetHandle,
              type: 'buttonEdge',
              animated: true,
            });
            connected = true;

            // ── Insert-between (only for single selected node) ──────────
            // If the source handle already feeds a downstream node,
            // bridge new→downstream and drop the original edge.
            if (singleSelection) {
              const downstreamEdge = edges.find(
                (e: any) => e.source === sel.id && e.sourceHandle === out.id
              );
              if (downstreamEdge) {
                // Find a matching output on the new node that connects to
                // the downstream handle's type
                const downTarget = nodes.find((n: any) => n.id === downstreamEdge.target);
                const downTargetMeta = downTarget ? NODE_REGISTRY[downTarget.type] : null;
                const downInpHandle = downTargetMeta?.inputs.find(
                  (i: any) => i.id === downstreamEdge.targetHandle
                ) ?? downTargetMeta?.inputs[0];
                const bridgeOut = newMeta.outputs.find(
                  (o: any) => o.type === (downInpHandle?.type ?? out.type)
                );
                if (bridgeOut && downInpHandle) {
                  // Remove original edge
                  edgesToRemove.add(downstreamEdge.id);
                  // Add bridge edge: new → downstream
                  autoEdges.push({
                    id: `ae-bridge-${newId}-${downstreamEdge.target}-${bridgeOut.id}-${downInpHandle.id}`,
                    source: newId,
                    sourceHandle: bridgeOut.id,
                    target: downstreamEdge.target,
                    targetHandle: downInpHandle.id,
                    type: 'buttonEdge',
                    animated: true,
                  });
                }
              }
            }
            break;
          }
          if (connected) break;
        }

        if (!connected) {
          // ── Direction B: new → selected (new as source) ─────────────────
          for (const out of newMeta.outputs) {
            for (const inp of selMeta.inputs) {
              if (out.type !== inp.type) continue;
              autoEdges.push({
                id: `ae-${newId}-${sel.id}-${out.id}-${inp.id}`,
                source: newId,
                sourceHandle: out.id,
                target: sel.id,
                targetHandle: inp.id,
                type: 'buttonEdge',
                animated: true,
              });
              break;
            }
          }
        }
      }
    }

    // Por defecto: hueco libre alrededor del centro del viewport (igual que doble clic en la barra inferior de accesos).
    let position = findEmptyPositionForNewNode(type, nodes, center);
    if (autoEdges.length > 0 && selectedNodes.length === 1) {
      const anchor = selectedNodes[0];
      const primary = autoEdges.find(
        (e: any) =>
          (e.target === newId && e.source === anchor.id) ||
          (e.source === newId && e.target === anchor.id)
      );
      if (primary) {
        const plan =
          primary.target === newId
            ? {
                direction: 'existing-to-new' as const,
                sourceHandle: primary.sourceHandle,
                targetHandle: primary.targetHandle,
              }
            : {
                direction: 'new-to-existing' as const,
                sourceHandle: primary.sourceHandle,
                targetHandle: primary.targetHandle,
              };
        const raw = computeLibraryDropPosition(anchor, type, plan);
        position = findEmptyPositionForNewNode(type, nodes, {
          x: raw.x + 160,
          y: raw.y + 120,
        });
      }
    }

    // Varios orígenes → nodo multi-ranura: colocar a la derecha del grupo (no en un hueco “libre” que suele quedar a la izquierda)
    const sourcesIntoNew = selectedNodes.filter((n) =>
      autoEdges.some((e: any) => e.source === n.id && e.target === newId)
    );
    if (
      sourcesIntoNew.length > 1 &&
      MULTI_SLOT_NODES[type] &&
      type !== 'spaceOutput'
    ) {
      const sortedSources = [...sourcesIntoNew].sort((a, b) => {
        if (a.position.y !== b.position.y) return a.position.y - b.position.y;
        if (a.position.x !== b.position.x) return a.position.x - b.position.x;
        return String(a.id).localeCompare(String(b.id));
      });
      const rawMulti = positionNewNodeRightOfSources(sortedSources, type);
      position = findEmptyPositionForNewNode(type, nodes, {
        x: rawMulti.x + 160,
        y: rawMulti.y + 120,
      });
    }

    const defaultStyleForType =
      type === 'nanoBanana'
        ? ({ width: NANO_BANANA_DEFAULT_W, height: NANO_BANANA_DEFAULT_H } as React.CSSProperties)
        : type === 'geminiVideo' || type === 'vfxGenerator'
          ? ({ width: GEMINI_VIDEO_DEFAULT_W, height: GEMINI_VIDEO_DEFAULT_H } as React.CSSProperties)
          : undefined;

    const newNode = {
      id: newId,
      type,
      position,
      data: withFoldderCanvasIntro(type, {
        ...defaultDataForCanvasDropNode(type),
        label: '',
        ...extraData,
      }),
      ...(defaultStyleForType ? { style: defaultStyleForType } : {}),
    };

    takeSnapshot(); // snapshot BEFORE adding node
    setNodes(nds => {
      const next = [...nds, newNode];
      return next;
    });
    scheduleFoldderCanvasIntroEnd(newId);
    // Delay edge render so nodes with dynamic handles (Enhancer, etc.)
    // have time to mount all their Handle components before ReactFlow draws curves.
    setTimeout(() => {
      setEdges(es => [
        ...es.filter((e: any) => !edgesToRemove.has(e.id)),
        ...autoEdges,
      ]);
      queueMicrotask(() => {
        updateNodeInternals(newId);
        autoEdges.forEach((e: any) => {
          updateNodeInternals(e.source);
          updateNodeInternals(e.target);
        });
      });
      requestAnimationFrame(() => {
        updateNodeInternals(newId);
        autoEdges.forEach((e: any) => {
          updateNodeInternals(e.source);
          updateNodeInternals(e.target);
        });
      });
    }, 50);

    // Encuadrar el nodo nuevo también si no hubo auto-conexión (antes solo con aristas)
    setTimeout(() => {
      fitViewToNodeIds([newId], 700);
    }, autoEdges.length > 0 ? 100 : 80);
  }, [screenToFlowPosition, nodes, edges, setNodes, setEdges, takeSnapshot, fitViewToNodeIds, updateNodeInternals, scheduleFoldderCanvasIntroEnd]);

  /** Doble clic en la barra inferior de accesos o en mosaico del sidebar: hueco libre (prioridad a la derecha del nodo más a la derecha) + fit */
  const addNodeFromTopbarPinDoubleClick = useCallback(
    (reactFlowType: string) => {
      if (!NODE_REGISTRY[reactFlowType]) return;
      const viewportCenter = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      const preferred = preferredCenterRightOfRightmostNode(nodes, reactFlowType);
      const center = preferred ?? viewportCenter;
      const position = findEmptyPositionForNewNode(reactFlowType, nodes, center);
      const newId = `node_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const pinStyle: React.CSSProperties | undefined =
        reactFlowType === 'nanoBanana'
          ? { width: NANO_BANANA_DEFAULT_W, height: NANO_BANANA_DEFAULT_H }
          : reactFlowType === 'geminiVideo' || reactFlowType === 'vfxGenerator'
            ? { width: GEMINI_VIDEO_DEFAULT_W, height: GEMINI_VIDEO_DEFAULT_H }
            : undefined;
      const newNode = {
        id: newId,
        type: reactFlowType,
        position,
        data: withFoldderCanvasIntro(reactFlowType, {
          ...defaultDataForCanvasDropNode(reactFlowType),
          value: '',
          label: `${reactFlowType} node`,
        }),
        ...(pinStyle ? { style: pinStyle } : {}),
      };
      takeSnapshot();
      setNodes((nds) => [...nds, newNode]);
      scheduleFoldderCanvasIntroEnd(newId);
      setTimeout(() => {
        fitViewToNodeIds([newId], 700);
      }, 100);
      setSidebarLockedCollapsed(true);
    },
    [screenToFlowPosition, nodes, setNodes, takeSnapshot, fitViewToNodeIds, scheduleFoldderCanvasIntroEnd]
  );

  // ── Node click: global z-order counter — each click brings that node above all others
  // **Solo `node.zIndex` (nivel superior), nunca `style.zIndex`:** XY Flow aplica style después
  // de internals.z; si un hijo de canvasGroup lleva zIndex en style, sustituye el z interno
  // (parent+1) y el nodo queda detrás del marco del grupo.
  const onNodeClick = useCallback((_evt: React.MouseEvent, node: any) => {
    if (canvasViewModeRef.current === 'cards') {
      const ordered = sortNodesCardsOrder(liveNodesRef.current);
      const idx = ordered.findIndex((n) => n.id === node.id);
      if (idx >= 0) setCardsFocusIndex(idx);
      return;
    }
    lastClickedRef.current = (lastClickedRef.current ?? 0) + 1;
    const nextZ = lastClickedRef.current;
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== node.id) return n;
        const style = n.style ? { ...(n.style as Record<string, unknown>) } : {};
        delete (style as { zIndex?: number }).zIndex;
        return {
          ...n,
          zIndex: nextZ,
          style: Object.keys(style).length > 0 ? (style as React.CSSProperties) : undefined,
        };
      })
    );
  }, [setNodes]);

  /** Clic en el vacío: migrar `style.zIndex` legado → `node.zIndex` en todos los nodos. */
  const onPaneClick = useCallback(() => {
    if (canvasViewModeRef.current === 'cards') return;
    setNodes((nds) => {
      let changed = false;
      const next = nds.map((n) => {
        const fixed =
          n.type === 'canvasGroup' ? normalizeCanvasGroupNodeZ(n) : normalizeNodeZIndexForXYFlow(n);
        if (fixed === n) return n;
        changed = true;
        return fixed;
      });
      return changed ? next : nds;
    });
  }, [setNodes]);

  const onNodeDoubleClick = useCallback(
    (_evt: React.MouseEvent, node: Node) => {
      if (lastDoubleClickFitNodeIdRef.current === node.id) {
        lastDoubleClickFitNodeIdRef.current = null;
        fitView({ padding: FIT_VIEW_PADDING, duration: fitAnim(800), ...FOLDDER_FIT_VIEW_EASE });
      } else {
        lastDoubleClickFitNodeIdRef.current = node.id;
        fitViewToNodeIds([node.id], 650);
      }
    },
    [fitView, fitViewToNodeIds]
  );

  /** Doble clic en el lienzo (no en un nodo) → fit a todo el grafo */
  const onCanvasDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const el = event.target as HTMLElement;
      if (el.closest('.react-flow__node')) return;
      event.preventDefault();
      lastDoubleClickFitNodeIdRef.current = null;
      fitView({ padding: FIT_VIEW_PADDING, duration: fitAnim(800), interpolate: 'smooth', ...FOLDDER_FIT_VIEW_EASE });
    },
    [fitView]
  );

  // ── Auto-layout (A key) ──────────────────────────────────────────────────
  /**
   * Solo nodos **raíz** (`!parentId`): los hijos de un `canvasGroup` usan coords relativas.
   * Por **componentes conexos** (no dirigido): los prompts+concatenador forman un bloque; los
   * nodos sin aristas al resto van en una columna al margen (no intercalados en la misma columna).
   * Con `horizontalIsolates`: los aislados se reparten en filas a izquierda y derecha del núcleo
   * conectado (mitades por posición X previa), para dejarlos accesibles a los lados.
   */
  const autoLayout = useCallback(
    (opts?: { ignoreSelection?: boolean; horizontalIsolates?: boolean }) => {
      const useAll = Boolean(opts?.ignoreSelection) || !nodes.some((n) => n.selected);
      const rawArrange = useAll ? [...nodes] : nodes.filter((n) => n.selected);
      const toArrange = rawArrange.filter((n) => !n.parentId);
      if (toArrange.length === 0) return;

      const GAP = 56;
      const nodeById = new Map(toArrange.map((n) => [n.id, n]));
      const comps = undirectedLayoutComponents(
        toArrange.map((n) => n.id),
        edges
      );

      const wired: string[][] = [];
      const isolates: string[] = [];
      for (const comp of comps) {
        if (comp.length === 1) isolates.push(comp[0]);
        else wired.push(comp);
      }

      wired.sort((a, b) => {
        const minA = Math.min(...a.map((id) => nodeById.get(id)!.position.x));
        const minB = Math.min(...b.map((id) => nodeById.get(id)!.position.x));
        return minA - minB || String(a[0]).localeCompare(String(b[0]));
      });
      isolates.sort((a, b) => {
        const na = nodeById.get(a)!;
        const nb = nodeById.get(b)!;
        return na.position.y - nb.position.y || a.localeCompare(b);
      });

      const positioned: Record<string, { x: number; y: number }> = {};
      let xCursor = 0;

      for (const comp of wired) {
        const subset = comp.map((id) => nodeById.get(id)!);
        const local = runKahnColumnLayout(subset, edges, getNodeLayoutDimensions, GAP);
        alignMultiInputTargetsToSources(local, subset, edges, getNodeLayoutDimensions);
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const n of subset) {
          const p = local[n.id];
          const { w, h } = getNodeLayoutDimensions(n);
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x + w);
          minY = Math.min(minY, p.y);
          maxY = Math.max(maxY, p.y + h);
        }
        const tx = xCursor - minX;
        const ty = -(minY + maxY) / 2;
        for (const n of subset) {
          const p = local[n.id];
          positioned[n.id] = { x: p.x + tx, y: p.y + ty };
        }
        xCursor += maxX - minX + GAP;
      }

      if (isolates.length) {
        const isoNodes = isolates.map((id) => nodeById.get(id)!);
        const horizontalIsolates = Boolean(opts?.horizontalIsolates);

        if (horizontalIsolates && wired.length > 0) {
          let WminX = Infinity;
          let WmaxX = -Infinity;
          let WminY = Infinity;
          let WmaxY = -Infinity;
          for (const comp of wired) {
            for (const id of comp) {
              const p = positioned[id];
              if (!p) continue;
              const n = nodeById.get(id);
              if (!n) continue;
              const { w, h } = getNodeLayoutDimensions(n);
              WminX = Math.min(WminX, p.x);
              WmaxX = Math.max(WmaxX, p.x + w);
              WminY = Math.min(WminY, p.y);
              WmaxY = Math.max(WmaxY, p.y + h);
            }
          }
          const cy = (WminY + WmaxY) / 2;
          const sortedIso = [...isolates].sort(
            (a, b) =>
              nodeById.get(a)!.position.x - nodeById.get(b)!.position.x ||
              String(a).localeCompare(String(b))
          );
          const mid = Math.ceil(sortedIso.length / 2);
          const leftIds = sortedIso.slice(0, mid);
          const rightIds = sortedIso.slice(mid);

          let xLeft = WminX - GAP;
          for (let i = leftIds.length - 1; i >= 0; i--) {
            const id = leftIds[i];
            const n = nodeById.get(id)!;
            const { w, h } = getNodeLayoutDimensions(n);
            xLeft -= w;
            positioned[id] = { x: xLeft, y: cy - h / 2 };
            xLeft -= GAP;
          }

          let xRight = WmaxX + GAP;
          for (const id of rightIds) {
            const n = nodeById.get(id)!;
            const { w, h } = getNodeLayoutDimensions(n);
            positioned[id] = { x: xRight, y: cy - h / 2 };
            xRight += w + GAP;
          }
        } else if (horizontalIsolates && wired.length === 0) {
          const sorted = [...isoNodes].sort(
            (a, b) => a.position.x - b.position.x || String(a.id).localeCompare(String(b.id))
          );
          let totalW = 0;
          const dims = sorted.map((n) => {
            const { w, h } = getNodeLayoutDimensions(n);
            totalW += w;
            return { n, w, h };
          });
          totalW += (sorted.length - 1) * GAP;
          let x = -totalW / 2;
          for (const { n, w, h } of dims) {
            positioned[n.id] = { x, y: -h / 2 };
            x += w + GAP;
          }
        } else {
          const heights = isoNodes.map((n) => getNodeLayoutDimensions(n).h);
          const totalH =
            heights.reduce((acc, h) => acc + h, 0) +
            (isoNodes.length > 1 ? (isoNodes.length - 1) * GAP : 0);
          let y = -totalH / 2;
          for (const n of isoNodes) {
            const { h } = getNodeLayoutDimensions(n);
            positioned[n.id] = { x: xCursor, y: y };
            y += h + GAP;
          }
        }
      }

      takeSnapshot();
      const arrangedIds = Object.keys(positioned);

      setNodes((nds) =>
        recomputeCanvasGroupFrames(
          nds.map((n) => (positioned[n.id] ? { ...n, position: positioned[n.id] } : n))
        )
      );

      setTimeout(() => {
        if (arrangedIds.length === 0) return;
        void fitView({
          nodes: arrangedIds.map((id) => ({ id })) as Node[],
          padding: FIT_VIEW_PADDING_NODE_FOCUS,
          duration: fitAnim(700),
          interpolate: 'smooth',
          ...FOLDDER_FIT_VIEW_EASE,
        });
      }, 100);
    },
    [nodes, edges, setNodes, takeSnapshot, fitView]
  );

  /** Se rellena tras definir `goToRootCanvas` (debajo de `syncCurrentSpaceState`) para no romper el orden de hooks. */
  const navigationEscapeRef = useRef<() => boolean>(() => false);
  const groupSelectedToSpaceRef = useRef<() => void>(() => {});
  const groupSelectedToCanvasGroupRef = useRef<() => void>(() => {});
  const ungroupSelectedCanvasGroupRef = useRef<() => void>(() => {});
  /** Tecla A: pares → aislados en columna (clásico); impares → aislados en horizontal a lados del núcleo. */
  const autoLayoutKeyParityRef = useRef(0);

  // ── Keyboard shortcuts (deps fijas `[]`: ref evita error de tamaño de array con Fast Refresh) ──
  const keyboardShortcutsRef = useRef({
    addNodeAtCenter,
    undo,
    redo,
    fitView,
    autoLayout,
    setNodes,
    setEdges,
    takeSnapshot,
    fitViewToNodeIds,
    handleEscape: () => navigationEscapeRef.current(),
    setCardsFocusIndex,
    canvasViewModeRef,
  });
  keyboardShortcutsRef.current = {
    addNodeAtCenter,
    undo,
    redo,
    fitView,
    autoLayout,
    setNodes,
    setEdges,
    takeSnapshot,
    fitViewToNodeIds,
    handleEscape: () => navigationEscapeRef.current(),
    setCardsFocusIndex,
    canvasViewModeRef,
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const {
        addNodeAtCenter: addNode,
        undo: doUndo,
        redo: doRedo,
        fitView: doFitView,
        autoLayout: doAutoLayout,
        setNodes: doSetNodes,
        setEdges: doSetEdges,
        takeSnapshot: doTakeSnapshot,
        fitViewToNodeIds: doFitViewToNodeIds,
      } = keyboardShortcutsRef.current;

      // When any Studio mode is open (fullscreen overlay), all canvas shortcuts are disabled
      if (typeof document !== 'undefined' && document.querySelector('[data-foldder-studio-canvas]')) return;

      const target = e.target as HTMLElement;
      const typing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;
      if (typing) return;

      /** Misma lógica que Tab / Shift+Tab: siguiente o anterior por aristas con wrap en el componente conexo. */
      const tryNavigateConnectedNodes = (forward: boolean): boolean => {
        const nds = liveNodesRef.current;
        const es = liveEdgesRef.current;
        const selected = nds.filter((n) => n.selected);
        if (selected.length !== 1) return false;
        const fromId = selected[0].id;
        const idSet = new Set(nds.map((n) => n.id));
        if (!idSet.has(fromId)) return false;

        const adj = new Map<string, string[]>();
        const link = (a: string, b: string) => {
          if (!idSet.has(a) || !idSet.has(b)) return;
          if (!adj.has(a)) adj.set(a, []);
          if (!adj.has(b)) adj.set(b, []);
          adj.get(a)!.push(b);
          adj.get(b)!.push(a);
        };
        for (const edge of es) link(edge.source, edge.target);

        const component = new Set<string>();
        const stack = [fromId];
        while (stack.length) {
          const id = stack.pop()!;
          if (!idSet.has(id) || component.has(id)) continue;
          component.add(id);
          for (const n of adj.get(id) || []) {
            if (!component.has(n)) stack.push(n);
          }
        }
        const sortedComponent = [...component].sort((a, b) => a.localeCompare(b));
        const wrapPool = sortedComponent.sort((a, b) => a.localeCompare(b));
        const sourcesInComponent = wrapPool.filter(
          (id) => !es.some((edge) => edge.target === id && component.has(edge.source))
        );
        const firstInLoop =
          [...sourcesInComponent].sort((a, b) => a.localeCompare(b))[0] ??
          wrapPool[0] ??
          sortedComponent[0];
        const sinksInComponent = wrapPool.filter(
          (id) => !es.some((edge) => edge.source === id && component.has(edge.target))
        );
        const lastInLoop =
          [...sinksInComponent].sort((a, b) => a.localeCompare(b)).slice(-1)[0] ??
          wrapPool[wrapPool.length - 1] ??
          sortedComponent[sortedComponent.length - 1];

        let nextId: string | null = null;
        if (forward) {
          const outs = es
            .filter((edge) => edge.source === fromId && idSet.has(edge.target))
            .sort((a, b) => String(a.target).localeCompare(String(b.target)));
          nextId = outs[0]?.target ?? firstInLoop ?? null;
        } else {
          const ins = es
            .filter((edge) => edge.target === fromId && idSet.has(edge.source))
            .sort((a, b) => String(a.source).localeCompare(String(b.source)));
          nextId = ins[0]?.source ?? lastInLoop ?? null;
        }
        if (!nextId) return false;
        doSetNodes((nds2) => nds2.map((n) => ({ ...n, selected: n.id === nextId })));
        doFitViewToNodeIds([nextId], 600);
        return true;
      };

      /** Varios nodos → mismo target: ↑/↓ ciclan entre fuentes que comparten ese destino (orden estable). */
      const tryNavigateSharedTargetPeers = (forward: boolean): boolean => {
        const nds = liveNodesRef.current;
        const es = liveEdgesRef.current;
        const selected = nds.filter((n) => n.selected);
        if (selected.length !== 1) return false;
        const fromId = selected[0].id;
        const idSet = new Set(nds.map((n) => n.id));
        if (!idSet.has(fromId)) return false;

        const outgoingTargets = [
          ...new Set(es.filter((edge) => edge.source === fromId).map((edge) => edge.target)),
        ].sort((a, b) => a.localeCompare(b));

        for (const targetId of outgoingTargets) {
          if (!idSet.has(targetId)) continue;
          const targetNode = nds.find((n) => n.id === targetId);
          const tgtType = targetNode?.type;
          if (!tgtType) continue;
          const sourcesToTarget = orderedSourcesForSharedTarget(tgtType, targetId, es, nds);
          if (sourcesToTarget.length <= 1) continue;

          const idx = sourcesToTarget.indexOf(fromId);
          if (idx === -1) continue;

          const n = sourcesToTarget.length;
          const nextIdx = forward ? (idx + 1) % n : (idx - 1 + n) % n;
          const nextId = sourcesToTarget[nextIdx];
          if (nextId === fromId) return false;

          doSetNodes((nds2) => nds2.map((node) => ({ ...node, selected: node.id === nextId })));
          doFitViewToNodeIds([nextId], 600);
          return true;
        }
        return false;
      };

      // Escape: cerrar menú contextual; si estamos en un space anidado, volver al lienzo root + fit
      if (e.key === 'Escape') {
        if (keyboardShortcutsRef.current.handleEscape?.()) {
          e.preventDefault();
        }
        return;
      }

      // Modo cartas: Tab y ← / → ciclan el nodo al frente (baraja)
      if (keyboardShortcutsRef.current.canvasViewModeRef.current === 'cards') {
        const nDeck = liveNodesRef.current.length;
        if (nDeck > 0) {
          if (e.key === 'Tab') {
            e.preventDefault();
            const dir = e.shiftKey ? -1 : 1;
            keyboardShortcutsRef.current.setCardsFocusIndex((f: number) => (f + dir + nDeck) % nDeck);
            return;
          }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            if (typeof document !== 'undefined' && document.querySelector('[data-foldder-studio-canvas]')) return;
            e.preventDefault();
            const dir = e.key === 'ArrowRight' ? 1 : -1;
            keyboardShortcutsRef.current.setCardsFocusIndex((f: number) => (f + dir + nDeck) % nDeck);
            return;
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            if (typeof document !== 'undefined' && document.querySelector('[data-foldder-studio-canvas]')) return;
            e.preventDefault();
            return;
          }
        }
      }

      // Tab / Shift+Tab — mismo grafo que flechas ← / →
      if (e.key === 'Tab') {
        if (!tryNavigateConnectedNodes(!e.shiftKey)) return;
        e.preventDefault();
        return;
      }

      // Flechas ← / → — igual que Tab; no en vistas studio (data-foldder-studio-canvas), p. ej. Composer
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (typeof document !== 'undefined' && document.querySelector('[data-foldder-studio-canvas]')) return;
        if (!tryNavigateConnectedNodes(e.key === 'ArrowRight')) return;
        e.preventDefault();
        return;
      }

      // Flechas ↑ / ↓ — otras fuentes que entran en el mismo nodo destino (p. ej. varios prompts → concatenator)
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (typeof document !== 'undefined' && document.querySelector('[data-foldder-studio-canvas]')) return;
        if (!tryNavigateSharedTargetPeers(e.key === 'ArrowDown')) return;
        e.preventDefault();
        return;
      }

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) doRedo(); else doUndo();
        return;
      }
      // Ctrl+D — duplicate selected nodes (ranuras múltiples: clon debajo + arista al siguiente handle libre)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const nds = liveNodesRef.current;
        const es = liveEdgesRef.current;
        const selected = nds.filter((n) => n.selected);
        if (selected.length === 0) return;

        if (selected.length === 1) {
          const src = selected[0];
          const plan = planDuplicateBelowMultiInput(src, es, nds);
          if (plan) {
            const newId = `${src.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            const clone = {
              ...src,
              id: newId,
              position: plan.position,
              selected: true,
              data: { ...src.data },
            };
            const newEdge = {
              id: `dup-${newId}-${plan.targetId}-${Date.now()}`,
              source: newId,
              sourceHandle: plan.sourceHandle,
              target: plan.targetId,
              targetHandle: plan.targetHandle,
              type: 'buttonEdge',
              animated: true,
            };
            doTakeSnapshot();
            doSetNodes((prev) => [...prev.map((n) => ({ ...n, selected: false })), clone]);
            doSetEdges((prev) => [...prev, newEdge]);
            return;
          }
        }

        doTakeSnapshot();
        doSetNodes((prev) => {
          const sel = prev.filter((n) => n.selected);
          if (sel.length === 0) return prev;
          const clones = sel.map((n) => ({
            ...n,
            id: `${n.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            position: { x: n.position.x + 30, y: n.position.y + 30 },
            selected: true,
            data: { ...n.data },
          }));
          return [...prev.map((n) => ({ ...n, selected: false })), ...clones];
        });
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // G = agrupar en el lienzo (2+ nodos); Mayús+G = desagrupar (nodo canvasGroup seleccionado)
      if (e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) {
          ungroupSelectedCanvasGroupRef.current();
        } else {
          groupSelectedToCanvasGroupRef.current();
        }
        return;
      }

      switch (e.key.toLowerCase()) {
        // ── Ingesta ──────────────────────────────────────────────────────
        case 'p': addNode('promptInput'); break;
        case 'm': addNode('mediaInput'); break;
        case 'b': addNode('background'); break;
        case 'u': addNode('urlImage'); break;
        // ── Inteligencia ─────────────────────────────────────────────────
        case 'n': addNode('nanoBanana'); break;
        case 'd': addNode('mediaDescriber'); break;
        case 'h': addNode('enhancer'); break;
        case 'k': addNode('grokProcessor'); break;
        case 'r': addNode('backgroundRemover'); break;
        case 'v': addNode('geminiVideo'); break;
        case 'y': addNode('vfxGenerator'); break;
        // ── Lógica ───────────────────────────────────────────────────────
        case 'q': addNode('concatenator'); break;
        case 'j': addNode('listado'); break;
        case 's': {
          const sel = liveNodesRef.current.filter(
            (n) => n.selected
          );
          if (sel.length > 1) {
            groupSelectedToSpaceRef.current();
          } else {
            addNode('space', { label: 'Space', hasInput: true, hasOutput: true });
          }
          break;
        }
        case 'i': addNode('spaceInput'); break;
        case 'o': addNode('spaceOutput'); break;
        // ── Composición ──────────────────────────────────────────────────
        case 'c': addNode('imageComposer'); break;
        case 'l': addNode('imageComposer'); break;   // alias
        case 'e': addNode('imageExport'); break;
        case 't': addNode('textOverlay'); break;
        case 'w': addNode('painter'); break;

        case 'x': addNode('crop'); break;
        case 'z': addNode('bezierMask'); break;
        case ',': addNode('indesign'); break;
        // ── Canvas actions ───────────────────────────────────────────────
        // F = Freehand / Vector Studio; Mayús+F = encuadrar todo el grafo. Listado = J.
        case 'f':
          if (e.shiftKey) {
            doFitView({ padding: FIT_VIEW_PADDING, duration: fitAnim(800), ...FOLDDER_FIT_VIEW_EASE });
          } else {
            addNode('freehand');
          }
          break;
        case 'a': {
          const horizontalIsolates = autoLayoutKeyParityRef.current % 2 === 1;
          doAutoLayout({ horizontalIsolates });
          autoLayoutKeyParityRef.current++;
          break;
        }
        default: break;
      }

    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  
  // ── Track last-clicked node for persistent z-index ──────────────────────
  const lastClickedRef = useRef<number>(0); // global z-order counter
  /** Doble clic en nodo: alterna encuadrar ese nodo / segundo doble clic en el mismo → fit global */
  const lastDoubleClickFitNodeIdRef = useRef<string | null>(null);

  // ── Espacio: pan; sin espacio: arrastre = selección (marco). Solo Espacio activa el modo overview (zoom out + hover + encuadre al soltar), no Ctrl ni Mayús.
  const [spaceHeld, setSpaceHeld] = useState(false);
  /** Espacio: fit global + rollover; al soltar → encuadrar nodo bajo cursor o restaurar zoom. */
  const spaceHeldForOverviewRef = useRef(false);
  const viewportBeforeOverviewRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const lastPointerClientRef = useRef({ x: 0, y: 0 });
  /** Rollover con Espacio (overview): recuadro grueso en el nodo/grupo bajo el cursor. */
  const [overviewHoverHighlightId, setOverviewHoverHighlightId] = useState<string | null>(null);
  /** Lienzo con clase CSS: animación de rollover + bloqueo de clics en controles de nodos. */
  const [overviewModeActive, setOverviewModeActive] = useState(false);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      lastPointerClientRef.current = { x: e.clientX, y: e.clientY };
      if (!spaceHeldForOverviewRef.current) return;
      const raw = getReactFlowNodeIdAtClientPoint(e.clientX, e.clientY);
      const id =
        raw && liveNodesRef.current.some((n) => n.id === raw) ? raw : null;
      setOverviewHoverHighlightId((prev) => (prev === id ? prev : id));
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  useEffect(() => {
    const typingTarget = (t: EventTarget | null) => {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (t.isContentEditable) return true;
      return !!t.closest('[contenteditable="true"]');
    };
    const restoreSavedViewport = (saved: { x: number; y: number; zoom: number }) => {
      setViewport({ x: saved.x, y: saved.y, zoom: saved.zoom }, {
        duration: fitAnim(480),
        ...FOLDDER_FIT_VIEW_EASE,
      });
    };
    const refreshOverviewHover = () => {
      const { x, y } = lastPointerClientRef.current;
      const raw = getReactFlowNodeIdAtClientPoint(x, y);
      const id =
        raw && liveNodesRef.current.some((n) => n.id === raw) ? raw : null;
      setOverviewHoverHighlightId(id);
    };
    /** blur: suelta “virtualmente” modificadores y restaura zoom (sin encuadrar nodo). */
    const onBlur = () => {
      if (!spaceHeldForOverviewRef.current) {
        return;
      }
      const saved = viewportBeforeOverviewRef.current;
      spaceHeldForOverviewRef.current = false;
      setSpaceHeld(false);
      viewportBeforeOverviewRef.current = null;
      setOverviewHoverHighlightId(null);
      setOverviewModeActive(false);
      if (saved) restoreSavedViewport(saved);
    };
    const onModifierDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (e.repeat) return;
      if (typingTarget(e.target)) return;
      if (typeof document !== 'undefined' && document.querySelector('[data-foldder-studio-canvas]')) return;

      e.preventDefault();

      setOverviewModeActive(true);

      const wasHeld = spaceHeldForOverviewRef.current;
      spaceHeldForOverviewRef.current = true;
      setSpaceHeld(true);

      if (wasHeld) {
        queueMicrotask(refreshOverviewHover);
        return;
      }

      viewportBeforeOverviewRef.current = getViewport();
      void fitView({
        padding: FIT_VIEW_PADDING,
        duration: fitAnim(480),
        interpolate: 'smooth',
        ...FOLDDER_FIT_VIEW_EASE,
      });
      queueMicrotask(refreshOverviewHover);
    };
    const onModifierUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;

      spaceHeldForOverviewRef.current = false;
      setSpaceHeld(false);

      setOverviewModeActive(false);

      const saved = viewportBeforeOverviewRef.current;
      viewportBeforeOverviewRef.current = null;
      setOverviewHoverHighlightId(null);

      const { x, y } = lastPointerClientRef.current;
      const nodeId = getReactFlowNodeIdAtClientPoint(x, y);
      if (nodeId && liveNodesRef.current.some((n) => n.id === nodeId)) {
        fitViewToNodeIds([nodeId], 520, { padding: FIT_VIEW_PADDING_NODE_FOCUS });
        return;
      }
      if (saved) restoreSavedViewport(saved);
    };
    window.addEventListener('keydown', onModifierDown, true);
    window.addEventListener('keyup', onModifierUp, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onModifierDown, true);
      window.removeEventListener('keyup', onModifierUp, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [getViewport, setViewport, fitView, fitViewToNodeIds]);

  /** Botón central (rueda): cursor mano + pan; mismo estilo que Espacio */
  const [middlePanHeld, setMiddlePanHeld] = useState(false);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (e.button === 1) setMiddlePanHeld(true);
    };
    const up = (e: PointerEvent) => {
      if (e.button === 1) setMiddlePanHeld(false);
    };
    const clear = () => setMiddlePanHeld(false);
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 1) return;
      const rf = document.querySelector('.react-flow__renderer');
      if (rf && e.target instanceof Element && rf.contains(e.target)) {
        e.preventDefault();
      }
    };
    window.addEventListener('mousedown', onMouseDown, { capture: true });
    return () => window.removeEventListener('mousedown', onMouseDown, { capture: true });
  }, []);

  // ── Wheel en el lienzo: XY Flow no ve eventos que salen de nodos; además hacemos
  // ratón (zoom) vs trackpad (pan) con heurística, interceptando en capture antes del core.
  const viewportRef = useRef({ zoom: 0.7, x: -559, y: 134 });
  /** Para distinguir ráfaga tipo trackpad vs ticks discretos de rueda (ms entre wheels en el lienzo). */
  const lastFlowWheelTsRef = useRef(0);

  const setViewportZoomCssVar = useCallback((zoom: number) => {
    const z = Math.max(0.05, Math.min(4, Number.isFinite(zoom) ? zoom : 1));
    document.documentElement.style.setProperty('--foldder-viewport-zoom', String(z));
  }, []);

  useLayoutEffect(() => {
    setViewportZoomCssVar(viewportRef.current.zoom);
  }, [setViewportZoomCssVar]);

  useEffect(() => {
    const PAN_ON_SCROLL_SPEED = 1;

    /**
     * El transform del store usa el mismo espacio que `screenToFlowPosition`: coords relativas al
     * `domNode` (`.react-flow`), no a `.react-flow__renderer`. Si mezclamos rectángulos, el zoom
     * al cursor introduce paneo espurio (muy visible en Y).
     */
    const applyWheelZoomMouse = (e: WheelEvent, flowDom: Element) => {
      const vp = getViewport();
      const rawScale = Math.pow(0.998, e.deltaY);
      const newZoom = Math.min(4, Math.max(0.05, vp.zoom * rawScale));
      if (Math.abs(newZoom - vp.zoom) < 1e-6) return;
      const rect = flowDom.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const ratio = newZoom / vp.zoom;
      const newX = mx - ratio * (mx - vp.x);
      const newY = my - ratio * (my - vp.y);
      const next = { x: newX, y: newY, zoom: newZoom };
      viewportRef.current = next;
      setViewport(next);
    };

    const applyWheelPanTrackpad = (e: WheelEvent) => {
      const vp = getViewport();
      const deltaNormalize = e.deltaMode === 1 ? 20 : 1;
      let deltaX = e.deltaX * deltaNormalize;
      let deltaY = e.deltaY * deltaNormalize;
      if (!foldderIsMacOs() && e.shiftKey) {
        deltaX = e.deltaY * deltaNormalize;
        deltaY = 0;
      }
      const newX = vp.x - (deltaX / vp.zoom) * PAN_ON_SCROLL_SPEED;
      const newY = vp.y - (deltaY / vp.zoom) * PAN_ON_SCROLL_SPEED;
      const next = { x: newX, y: newY, zoom: vp.zoom };
      viewportRef.current = next;
      setViewport(next);
    };

    const applyPinchZoom = (e: WheelEvent, flowDom: Element) => {
      const vp = getViewport();
      const factor = foldderIsMacOs() ? 10 : 1;
      const pinchDelta =
        -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) * factor;
      const newZoom = Math.min(4, Math.max(0.05, vp.zoom * 2 ** pinchDelta));
      if (Math.abs(newZoom - vp.zoom) < 1e-6) return;
      const rect = flowDom.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const ratio = newZoom / vp.zoom;
      const newX = mx - ratio * (mx - vp.x);
      const newY = my - ratio * (my - vp.y);
      const next = { x: newX, y: newY, zoom: newZoom };
      viewportRef.current = next;
      setViewport(next);
    };

    const onWheelCapture = (e: WheelEvent) => {
      if (canvasViewModeRef.current === 'cards') return;

      const flowDom = document.querySelector('.react-flow');
      if (!flowDom || !(e.target instanceof Element) || !flowDom.contains(e.target)) return;

      const prevTs = lastFlowWheelTsRef.current;
      const dtFromPreviousMs = prevTs > 0 ? e.timeStamp - prevTs : Number.POSITIVE_INFINITY;
      lastFlowWheelTsRef.current = e.timeStamp;

      if (e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        applyPinchZoom(e, flowDom);
        return;
      }

      if (foldderWheelLooksLikeMouse(e, dtFromPreviousMs)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        applyWheelZoomMouse(e, flowDom);
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      applyWheelPanTrackpad(e);
    };

    window.addEventListener('wheel', onWheelCapture, { capture: true, passive: false });
    return () => window.removeEventListener('wheel', onWheelCapture, { capture: true });
  }, [getViewport, setViewport, setViewportZoomCssVar]);

  // Ref + CSS var + HUD de zoom: cualquier cambio de viewport (rueda, pinch, fitView, setViewport…)
  const onViewportChangeFromFlow = useCallback(
    (vp: { x: number; y: number; zoom: number }) => {
      viewportRef.current = vp;
      if (typeof vp.zoom === 'number' && Number.isFinite(vp.zoom)) {
        setViewportZoomCssVar(vp.zoom);
        setCanvasZoom(vp.zoom);
      }
    },
    [setViewportZoomCssVar]
  );

  useOnViewportChange({ onChange: onViewportChangeFromFlow });

  const onCanvasInit = useCallback(() => {
    requestAnimationFrame(() => {
      try {
        onViewportChangeFromFlow(getViewport());
      } catch {
        /* ignore */
      }
    });
  }, [getViewport, onViewportChangeFromFlow]);

  const focusAiJobNode = useCallback(
    (nodeId: string | undefined) => {
      if (!nodeId || nodeId === AI_JOB_CANVAS_NODE_ID) {
        requestAnimationFrame(() => {
          fitView({
            padding: FIT_VIEW_PADDING,
            duration: fitAnim(650),
            interpolate: 'smooth',
            ...FOLDDER_FIT_VIEW_EASE,
          });
        });
        return;
      }
      setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === nodeId })));
      requestAnimationFrame(() => {
        fitView({
          nodes: [{ id: nodeId } as Node],
          padding: FIT_VIEW_PADDING_NODE_FOCUS,
          duration: fitAnim(650),
          interpolate: 'smooth',
          ...FOLDDER_FIT_VIEW_EASE,
        });
      });
    },
    [fitView, setNodes]
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<AiJobCompleteDetail>;
      const d = ce.detail;
      if (!d?.label) return;
      const id = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      setAiJobToasts((prev) => [...prev.slice(-4), { id, ...d }]);
      window.setTimeout(() => {
        setAiJobToasts((p) => p.filter((t) => t.id !== id));
      }, 5000);
    };
    window.addEventListener(AI_JOB_COMPLETE_EVENT, handler as EventListener);
    return () => window.removeEventListener(AI_JOB_COMPLETE_EVENT, handler as EventListener);
  }, []);

  // Access Security
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [passError, setPassError] = useState(false);

  const handleAuth = (val: string) => {
    setPasscode(val);
    if (val === '6666') {
      setIsAuthenticated(true);
      // Trigger welcome splash — output node appears when splash finishes
      setShowWelcome(true);
    } else if (val.length === 4) {
      setPassError(true);
      setTimeout(() => {
        setPasscode('');
        setPassError(false);
      }, 500);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    return installAiFetchOverlay();
  }, [isAuthenticated]);

  // Helper to detect structure and data output from a space
  const analyzeSpaceStructure = (nodes: any[], edges: any[]): { 
    type: string, 
    label: string,
    value: string | null, 
    hasInput: boolean, 
    hasOutput: boolean,
    internalCategories: string[] 
  } => {
    const inputNode = nodes.find(n => n.type === 'spaceInput');
    const outputNode = nodes.find(n => n.type === 'spaceOutput');
    
    // Extract internal categories for visualization
    const categoriesSet = new Set<string>();
    nodes.forEach(n => {
      const type = (n.type || '').toLowerCase();
      
      // AI / Intelligence Category
      if (type.includes('grok') || type.includes('runway') || type.includes('assistant') || type.includes('processor') || type.includes('banana') || type.includes('remover') || type.includes('describer')) {
        categoriesSet.add('ai');
      } 
      
      // Logic / Utility Category
      if (type.includes('composer') || type.includes('concatenator') || type.includes('listado') || type.includes('batch') || (type === 'space' && n.id !== 'in' && n.id !== 'out')) {
        categoriesSet.add('logic');
      }

      // Prompt Category
      if (type.includes('prompt') || type.includes('describer') || type.includes('enhancer')) {
        categoriesSet.add('prompt');
      }

      // Media / Image Category
      if (type.includes('image') || type.includes('media') || type.includes('matted')) {
        categoriesSet.add('image');
      }
      
      // Video Category
      if (type.includes('video')) {
        categoriesSet.add('video');
      }

      // Canvas / Composition Category
      if (type.includes('background') || type.includes('layer') || type.includes('export')) {
        categoriesSet.add('canvas');
      }

      // Tool Category
      if (type.includes('mask') || type.includes('tool') || type.includes('scissors') || type.includes('vision') || type.includes('describer')) {
        categoriesSet.add('tool');
      }
    });

    const result = {
      type: 'url',
      label: 'Space',
      value: null as string | null,
      hasInput: !!inputNode,
      hasOutput: !!outputNode,
      internalCategories: Array.from(categoriesSet).slice(0, 5) 
    };

    if (!outputNode) return result;

    // FIND THE EDGE: Be lenient with handle IDs
    const incomingEdge = edges.find(e => e.target === outputNode.id);
    if (!incomingEdge) return result;

    const sourceNode = nodes.find(n => n.id === incomingEdge.source);
    if (!sourceNode) return result;

    // Registry-Based Type Detection (Fail-safe)
    const sourceMetadata = NODE_REGISTRY[sourceNode.type];
    // Find matching output type by checking all handles of the source node if specific handle not found
    let sourceHandleType = sourceMetadata?.outputs.find(o => o.id === incomingEdge.sourceHandle)?.type;
    if (!sourceHandleType && sourceMetadata?.outputs.length === 1) {
        sourceHandleType = sourceMetadata.outputs[0].type;
    }
    
    // Check propagated type if it's reaching from a sub-space
    const propagatedType = (sourceNode.data?.outputType || sourceNode.data?.type || '').toLowerCase();

    // Final mapping to visual result types
    if (sourceHandleType === 'image' || propagatedType === 'image') {
        result.type = 'image';
        result.label = 'Image Space';
    }
    else if (sourceHandleType === 'video' || propagatedType === 'video') {
        result.type = 'video';
        result.label = 'Video Space';
    }
    else if (sourceHandleType === 'prompt' || propagatedType === 'prompt') {
        result.type = 'prompt';
        result.label = 'Prompt Space';
    }
    else if (sourceHandleType === 'mask' || propagatedType === 'mask') {
        result.type = 'mask';
        result.label = 'Mask Space';
    }
    else if (sourceHandleType === 'url' || propagatedType === 'url') {
        result.type = 'url';
        result.label = 'URL Space';
    }
    else if (sourceHandleType === 'json' || propagatedType === 'json') {
        result.type = 'json';
        result.label = 'Data Space';
    }
    
    result.value = sourceNode.data?.value || null;
    return result;
  };

  // Helper to commit current state AND propagate up
  const syncCurrentSpaceState = useCallback((currentNodes: any[], currentEdges: any[], currentSpacesMap: Record<string, any>, currentId: string) => {
    const structure = analyzeSpaceStructure(currentNodes, currentEdges);
    
    // 1. Detect INCOMING type from parent to this space
    let incomingType = 'url';
    Object.values(currentSpacesMap).forEach((space: any) => {
      const spaceNode = space.nodes?.find((n: any) => n.type === 'space' && n.data.spaceId === currentId);
      if (spaceNode) {
        const edge = space.edges?.find((e: any) => e.target === spaceNode.id && e.targetHandle === 'in');
        if (edge) {
          const srcNode = space.nodes?.find((n: any) => n.id === edge.source);
          if (srcNode) {
            const hType = NODE_REGISTRY[srcNode.type]?.outputs.find(o => o.id === edge.sourceHandle)?.type || srcNode.data.outputType;
            if (hType) incomingType = hType;
          }
        }
      }
    });

    // 2. Update THIS space entry
    const newMap = {
      ...currentSpacesMap,
      [currentId]: {
        ...(currentSpacesMap[currentId] || {}),
        id: currentId,
        nodes: currentNodes.map(n => n.type === 'spaceInput' ? { ...n, data: { ...n.data, inputType: incomingType } } : n),
        edges: [...currentEdges],
        outputType: structure.type,
        outputValue: structure.value,
        hasInput: structure.hasInput,
        hasOutput: structure.hasOutput,
        internalCategories: structure.internalCategories,
        updatedAt: new Date().toISOString()
      }
    };

    // 3. Propagate to ALL potential parents in the stack (Deep Propagation)
    // Update every parent space node in the map that points to this space (Upward).
    // No machacar `data.label` con structure.label ("Image Space", etc.): el usuario lo renombra con NodeLabel (máx. 5 palabras).
    Object.keys(newMap).forEach(key => {
        if (newMap[key].nodes) {
            newMap[key].nodes = newMap[key].nodes.map((n: any) => {
                if (n.type === 'space' && n.data.spaceId === currentId) {
                    const keepLabel =
                      n.data?.label != null && String(n.data.label).trim() !== ''
                        ? n.data.label
                        : structure.label;
                    return { 
                        ...n, 
                        data: { 
                            ...n.data, 
                            label: keepLabel,
                            outputType: structure.type, 
                            inputType: incomingType,
                            value: structure.value,
                            hasInput: structure.hasInput,
                            hasOutput: structure.hasOutput,
                            internalCategories: [...structure.internalCategories]
                        } 
                    };
                }
                return n;
            });
        }
    });

    // 4. DOWNWARD PROPAGATION: Find all spaces mentioned in CURRENT nodes and update their inputs
    currentNodes.filter(n => n.type === 'space' && n.data.spaceId).forEach(spaceNode => {
        const sId = spaceNode.data.spaceId;
        if (newMap[sId]) {
            // Find connection to this space node in currentEdges
            const edge = currentEdges.find(e => e.target === spaceNode.id && e.targetHandle === 'in');
            let sIncomingType = 'url';
            if (edge) {
                const srcNode = currentNodes.find(n => n.id === edge.source);
                if (srcNode) {
                    sIncomingType = NODE_REGISTRY[srcNode.type]?.outputs.find(o => o.id === edge.sourceHandle)?.type || srcNode.data.outputType || 'url';
                }
            }
            // Update the internal spaceInput of that child space
            newMap[sId].nodes = newMap[sId].nodes?.map((n: any) => 
                n.type === 'spaceInput' ? { ...n, data: { ...n.data, inputType: sIncomingType } } : n
            );
        }
    });

    // 4.5 INTERNAL OUTPUT SYNC: Ensure the internal spaceOutput node reflects the structure type
    newMap[currentId].nodes = newMap[currentId].nodes.map((n: any) => 
        n.type === 'spaceOutput' ? { ...n, data: { ...n.data, outputType: structure.type } } : n
    );

    // 4.6 Nombre en breadcrumb / avisos: copiar del NodeLabel del nodo Space en el lienzo padre (cada space referenciado)
    const resolveSpaceDisplayName = (map: Record<string, any>, sid: string, fallback: string) => {
      for (const key of Object.keys(map)) {
        const refNode = map[key]?.nodes?.find(
          (n: any) => n.type === 'space' && n.data?.spaceId === sid
        );
        const lbl = refNode?.data?.label;
        if (lbl != null && String(lbl).trim() !== '') return String(lbl).trim();
      }
      return fallback;
    };
    const referencedSpaceIds = new Set<string>([currentId]);
    Object.keys(newMap).forEach((key) => {
      newMap[key].nodes?.forEach((n: any) => {
        if (n.type === 'space' && n.data?.spaceId) referencedSpaceIds.add(n.data.spaceId);
      });
    });
    referencedSpaceIds.forEach((sid) => {
      if (!newMap[sid]) return;
      const fallback =
        currentSpacesMap[sid]?.name && String(currentSpacesMap[sid].name).trim() !== ''
          ? currentSpacesMap[sid].name
          : 'Space';
      const displayName = resolveSpaceDisplayName(newMap, sid, fallback);
      newMap[sid] = { ...newMap[sid], name: displayName };
    });

    // 5. COMMIT CHANGES TO STATE
    setSpacesMap(newMap);

    // 6. IF WE UPDATED THE CURRENT VIEW (activeSpaceId), update local states
    if (newMap[currentId]) {
        // Only update if nodes/edges were changed by propagation (like spaceInput type)
        // We check if the stringified nodes changed to avoid unnecessary renders
        if (JSON.stringify(newMap[currentId].nodes) !== JSON.stringify(currentNodes)) {
            setNodes(newMap[currentId].nodes);
        }
    }

    // 7. Notify any SpaceNode cards in the parent view so they refresh their preview
    window.dispatchEvent(new CustomEvent('space-data-updated', {
      detail: { spaceId: currentId, outputType: structure.type, outputValue: structure.value }
    }));

    return { newMap, structure };
  }, [analyzeSpaceStructure, setNodes, setSpacesMap]);

  // Navigation Logic
  const handleEnterSpace = useCallback((e: any) => {
    const { nodeId, spaceId } = e.detail;
    const currentId = activeSpaceId;
    
    // Sync current state first
    const { newMap: updatedSpacesMap } = syncCurrentSpaceState(nodes, edges, spacesMap, currentId);

    const triggerNode = nodes.find((n: any) => n.id === nodeId);
    const nameFromTrigger =
      triggerNode?.data?.label && String(triggerNode.data.label).trim()
        ? String(triggerNode.data.label).trim()
        : undefined;

    let targetSpaceId = spaceId;
    if (!targetSpaceId) {
      targetSpaceId = `space_${Date.now()}`;
      // Initialize if new
      updatedSpacesMap[targetSpaceId] = {
        id: targetSpaceId,
        name: nameFromTrigger || 'Nested Space',
        nodes: [
          { id: 'in', type: 'spaceInput', position: { x: 100, y: 200 }, data: { label: 'Input' } },
          { id: 'out', type: 'spaceOutput', position: { x: 800, y: 200 }, data: { label: 'Output' } }
        ],
        edges: [],
        createdAt: new Date().toISOString()
      };
      
      // Update parent trigger node in EVERYTHING (in case of deep linking)
      Object.keys(updatedSpacesMap).forEach(key => {
        if (updatedSpacesMap[key].nodes) {
          updatedSpacesMap[key].nodes = updatedSpacesMap[key].nodes.map((n: any) => 
            n.id === nodeId ? { ...n, data: { ...n.data, spaceId: targetSpaceId, hasInput: true, hasOutput: true } } : n
          );
        }
      });
    }

    const targetSpace = updatedSpacesMap[targetSpaceId];
    if (targetSpace && targetSpace.nodes) {
      const mapToCommit =
        nameFromTrigger
          ? {
              ...updatedSpacesMap,
              [targetSpaceId]: { ...targetSpace, name: nameFromTrigger },
            }
          : updatedSpacesMap;
      setSpacesMap(mapToCommit);
      setNodes([...targetSpace.nodes]);
      setEdges([...(targetSpace.edges || [])]);
      setNavigationStack(prev => [...prev, currentId]);
      setActiveSpaceId(targetSpaceId);
      setTimeout(() => fitView({ padding: FIT_VIEW_PADDING, duration: fitAnim(800), ...FOLDDER_FIT_VIEW_EASE }), 100);
    }
  }, [activeSpaceId, nodes, edges, spacesMap, setNodes, setEdges, fitView, syncCurrentSpaceState]);

  /** Vuelve al lienzo root con sync; fit a todo el grafo tras aplicar nodos (doble rAF = tras pintar). */
  const goToRootCanvas = useCallback(() => {
    if (activeSpaceId === 'root') return;
    const { newMap: updatedSpacesMap } = syncCurrentSpaceState(nodes, edges, spacesMap, activeSpaceId);
    const rootSpace = updatedSpacesMap['root'];
    if (!rootSpace) return;
    setSpacesMap(updatedSpacesMap);
    setNodes([...rootSpace.nodes]);
    setEdges([...(rootSpace.edges || [])]);
    setActiveSpaceId('root');
    setNavigationStack([]);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void fitView({ padding: FIT_VIEW_PADDING, duration: fitAnim(480), interpolate: 'smooth', ...FOLDDER_FIT_VIEW_EASE });
      });
    });
  }, [activeSpaceId, nodes, edges, spacesMap, setNodes, setEdges, fitView, syncCurrentSpaceState]);

  const handleEscapeNavigation = useCallback((): boolean => {
    if (assistantClarify) {
      setAssistantClarify(null);
      return true;
    }
    if (assistantCostApproval) {
      pendingAssistantCostPayloadRef.current = null;
      setAssistantCostApproval(null);
      return true;
    }
    if (showSaveModal || showLoadModal || projectToDelete) return false;
    if (windowMode) {
      setWindowMode(false);
      setViewerSourceNodeId(null);
      return true;
    }
    if (contextMenu) {
      setContextMenu(null);
      return true;
    }
    if (activeSpaceId !== 'root') {
      goToRootCanvas();
      return true;
    }
    return false;
  }, [
    assistantClarify,
    assistantCostApproval,
    showSaveModal,
    showLoadModal,
    projectToDelete,
    windowMode,
    contextMenu,
    activeSpaceId,
    goToRootCanvas,
  ]);

  navigationEscapeRef.current = handleEscapeNavigation;

  useEffect(() => {
    window.addEventListener('enter-space', handleEnterSpace);
    return () => window.removeEventListener('enter-space', handleEnterSpace);
  }, [handleEnterSpace]);

  // Reactive Propagation Bridge: Sync current space structure to map and parents on change
  useEffect(() => {
    if (!activeSpaceId) return;
    
    const timer = setTimeout(() => {
      // Pass the current states to ensure we sync the actual reflected view
      syncCurrentSpaceState(nodes, edges, spacesMap, activeSpaceId);
    }, 800); 
    return () => clearTimeout(timer);
  }, [nodes, edges, activeSpaceId, spacesMap, syncCurrentSpaceState]); 

  // Fetch saved projects on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/spaces');
        const data = await readResponseJson<unknown[]>(res, 'GET /api/spaces');
        if (Array.isArray(data)) setSavedProjects(data);
      } catch (err) {
        console.error('Fetch error:', err);
      }
    })();
  }, []);

  const saveProject = async (nameToSave?: string) => {
    setIsSaving(true);
    try {
      // Apilado XY Flow: persistir `node.zIndex`, no `style.zIndex` (evita hijos detrás del marco al recargar).
      const normalizedNodes = normalizeNodesForPersistence(nodes as Node[]);
      // Propagación completa (padres/hijos, spaceInput, etiquetas de nested spaces) — mismo criterio que al navegar
      const { newMap: syncedSpaces } = syncCurrentSpaceState(
        normalizedNodes,
        edges,
        spacesMap,
        activeSpaceId
      );
      const spacesToSave = normalizeSpacesMapNodesForPersistence(
        syncedSpaces as Record<string, { nodes?: Node[] }>
      );

      const uiSnapshot = {
        canvasBgId,
        canvasViewMode,
        cardsFocusIndex,
        viewport: getViewport(),
        navigationStack,
        activeSpaceId,
        sidebarLockedCollapsed,
        windowMode,
        viewerSourceNodeId,
      };

      const projectToSave = {
        id: activeProjectId,
        name: nameToSave || currentName || 'Untitled Project',
        rootSpaceId: 'root',
        spaces: spacesToSave,
        metadata: {
          ...metadata,
          ui: uiSnapshot,
          savedAt: new Date().toISOString(),
        },
      };

      const res = await fetch('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectToSave)
      });
      
      const updatedList = await readResponseJson<any[]>(res, 'POST /api/spaces (save)');
      
      if (Array.isArray(updatedList)) {
        setSavedProjects(updatedList);
        
        // If we were saving a new project, we need the active IDs from the server's last added project
        if (!activeProjectId) {
           const newest = updatedList[updatedList.length - 1];
           setActiveProjectId(newest.id);
           setActiveSpaceId(activeSpaceId);
           setCurrentName(newest.name);
           setSpacesMap(newest.spaces || spacesToSave);
        } else {
           setSpacesMap(spacesToSave as Record<string, unknown>);
        }
      }
      setShowSaveModal(false);
    } catch (err) {
      console.error('Save error:', err);
      alert('Error saving project. Check console for details.');
    } finally {
      setIsSaving(false);
    }
  };

  const loadProject = (project: any) => {
    void (async () => {
      const rootSpaceId = project.rootSpaceId || 'root';
      const rootSpace = project.spaces?.[rootSpaceId] || project.spaces?.['root'];

      if (!rootSpace) {
        console.error('Root space not found for project:', project.id);
        alert('Error: could not find the main space for this project.');
        return;
      }

      let spaces: Record<string, unknown> = project.spaces || {};
      try {
        spaces = await hydrateSpacesMapWithFreshUrls(spaces);
      } catch (e) {
        console.error('[loadProject] hydrate S3 URLs:', e);
      }

      const stripLegacyFinal = (ns: any[]) =>
        ns.filter((n: any) => n.id !== FINAL_NODE_ID && n.type !== 'finalOutput');
      const stripEdgesToFinal = (es: any[]) =>
        es.filter((e: any) => e.target !== FINAL_NODE_ID);

      const ui = project.metadata?.ui as
        | {
            canvasBgId?: string;
            canvasViewMode?: 'free' | 'cards';
            cardsFocusIndex?: number;
            viewport?: { x?: number; y?: number; zoom?: number };
            navigationStack?: string[];
            activeSpaceId?: string;
            sidebarLockedCollapsed?: boolean;
            windowMode?: boolean;
            viewerSourceNodeId?: string | null;
          }
        | undefined;

      const targetSpaceId =
        ui?.activeSpaceId &&
        spaces[ui.activeSpaceId] &&
        Array.isArray((spaces as Record<string, { nodes?: unknown[] }>)[ui.activeSpaceId]?.nodes)
          ? ui.activeSpaceId
          : rootSpaceId;
      const targetSpace =
        (spaces[targetSpaceId] as { nodes?: any[]; edges?: any[] } | undefined) ||
        (spaces[rootSpaceId] as { nodes?: any[]; edges?: any[] });

      const nextNodes = stripLegacyFinal([...(targetSpace?.nodes || [])]).map((n: any) => {
        if (!n.data || typeof n.data !== 'object') return n;
        const { _foldderCanvasIntro: _i, ...rest } = n.data as Record<string, unknown>;
        return { ...n, data: rest };
      });
      const nextEdges = stripEdgesToFinal([...(targetSpace?.edges || [])]);

      setNodes(nextNodes);
      setEdges(nextEdges);
      setActiveProjectId(project.id);
      setActiveSpaceId(targetSpaceId);
      setCurrentName(project.name);
      setSpacesMap(spaces as Record<string, any>);
      setMetadata(project.metadata || {});

      const nav = ui?.navigationStack;
      setNavigationStack(
        Array.isArray(nav) && nav.every((x) => typeof x === 'string') ? [...nav] : []
      );

      if (ui?.canvasBgId && CANVAS_BACKGROUNDS.some((b) => b.id === ui.canvasBgId)) {
        setCanvasBgId(ui.canvasBgId);
      }
      if (ui?.canvasViewMode === 'free' || ui?.canvasViewMode === 'cards') {
        setCanvasViewMode(ui.canvasViewMode);
      }
      if (typeof ui?.sidebarLockedCollapsed === 'boolean') {
        setSidebarLockedCollapsed(ui.sidebarLockedCollapsed);
      }
      if (typeof ui?.windowMode === 'boolean') {
        setWindowMode(ui.windowMode);
      }
      if (ui?.viewerSourceNodeId === null || typeof ui?.viewerSourceNodeId === 'string') {
        setViewerSourceNodeId(ui.viewerSourceNodeId);
      }

      const ci = ui?.cardsFocusIndex;
      if (typeof ci === 'number' && Number.isFinite(ci) && nextNodes.length > 0) {
        setCardsFocusIndex(Math.min(Math.max(0, Math.floor(ci)), Math.max(0, nextNodes.length - 1)));
      } else {
        setCardsFocusIndex(0);
      }

      setShowLoadModal(false);

      setTimeout(() => {
        const vp = ui?.viewport;
        if (
          vp &&
          typeof vp.x === 'number' &&
          typeof vp.y === 'number' &&
          typeof vp.zoom === 'number' &&
          Number.isFinite(vp.x) &&
          Number.isFinite(vp.y) &&
          Number.isFinite(vp.zoom)
        ) {
          setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
        } else {
          fitView({ padding: FIT_VIEW_PADDING, duration: fitAnim(800), ...FOLDDER_FIT_VIEW_EASE });
        }
      }, 100);
    })();
  };

  const deleteProject = async (idToDelete: string) => {
    try {
      const res = await fetch(`/api/spaces?id=${idToDelete}`, { method: 'DELETE' });
      const data = await readResponseJson<any[]>(res, 'DELETE /api/spaces');
      if (Array.isArray(data)) setSavedProjects(data);
      if (activeProjectId === idToDelete) {
        setActiveProjectId(null);
        setActiveSpaceId('root');
        setCurrentName('');
        setSpacesMap({});
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const duplicateProject = async (project: any) => {
    setIsSaving(true);
    try {
      const copyToSave = {
        name: `${project.name} (Copy)`,
        spaces: project.spaces,
        rootSpaceId: project.rootSpaceId,
        metadata: project.metadata
      };

      const res = await fetch('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(copyToSave)
      });
      
      const updatedList = await readResponseJson<any[]>(res, 'POST /api/spaces (duplicate)');
      if (Array.isArray(updatedList)) setSavedProjects(updatedList);
    } catch (err) {
      console.error('Duplicate error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const renameProject = async (id: string, newName: string) => {
    const projectToUpdate = savedProjects.find(p => p.id === id);
    if (!projectToUpdate) return;

    try {
      const res = await fetch('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...projectToUpdate,
          name: newName
        })
      });
      const updatedList = await readResponseJson<any[]>(res, 'POST /api/spaces (rename)');
      if (Array.isArray(updatedList)) {
        setSavedProjects(updatedList);
        if (activeProjectId === id) setCurrentName(newName);
      }
      setEditingId(null);
    } catch (err) {
      console.error('Rename error:', err);
    }
  };

  /** Mismo criterio que **A**, pero ordena todo el grafo (ignora selección). Menú «Ordenar nodos». */
  const autoLayoutNodes = useCallback(() => {
    autoLayout({ ignoreSelection: true, horizontalIsolates: false });
  }, [autoLayout]);

  const applyAssistantGraphPayload = (data: {
    nodes?: Node[];
    edges?: Edge[];
    executeNodeIds?: string[];
  }) => {
    if (!data || !Array.isArray(data.nodes)) return;
    const execIds = Array.isArray(data.executeNodeIds)
      ? data.executeNodeIds.filter((x): x is string => typeof x === 'string' && x.length > 0)
      : [];

    let validatedNodes = data.nodes.map((n: any) => ({
      ...n,
      position: n.position || { x: 0, y: 0 },
    }));

    if (execIds.length > 0) {
      validatedNodes = validatedNodes.map((n: any) => {
        if (n.type === 'urlImage' && n.data?.pendingSearch) {
          return { ...n, data: { ...n.data, pendingSearch: false } };
        }
        return n;
      });
    }

    setNodes(validatedNodes);
    setEdges(Array.isArray(data.edges) ? data.edges : []);

    setTimeout(() => {
      fitView({ padding: FIT_VIEW_PADDING, duration: fitAnim(800), ...FOLDDER_FIT_VIEW_EASE });
    }, 100);

    if (execIds.length > 0 && runAssistantPipeline) {
      setTimeout(() => {
        void runAssistantPipeline(execIds);
      }, 220);
    }
  };

  const onGenerateAssistant = async (prompt: string) => {
    if (matchesClearCanvasIntent(prompt)) {
      takeSnapshot();
      setNodes([]);
      setEdges([]);
      return;
    }

    if (matchesAddSpaceNodeIntent(prompt)) {
      takeSnapshot();
      addNodeAtCenter('space', { label: 'Space', hasInput: true, hasOutput: true });
      return;
    }

    setIsGeneratingAssistant(true);
    try {
      await runAiJobWithNotification(
        { nodeId: AI_JOB_CANVAS_NODE_ID, label: 'Asistente del lienzo' },
        async () => {
          const res = await fetch('/api/spaces/assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt,
              currentNodes: nodes,
              currentEdges: edges,
            }),
          });
          const data = await readResponseJson<{
            nodes?: Node[];
            edges?: Edge[];
            clarify?: { message?: string; question?: string; options?: unknown };
            executeNodeIds?: string[];
            pendingCostApproval?: boolean;
            costApproval?: {
              message: string;
              summary?: string;
              apis: { id: string; name: string; count: number; eurMin: number; eurMax: number }[];
              totalEurMin: number;
              totalEurMax: number;
            };
          }>(res, 'POST /api/spaces/assistant');

          if (data && data.clarify && typeof data.clarify === 'object') {
            const c = data.clarify;
            const msg = (c.message ?? c.question ?? '').trim() || '¿Qué prefieres?';
            const opts = Array.isArray(c.options)
              ? c.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
              : [];
            if (opts.length > 0) {
              setAssistantClarify({ message: msg, options: opts, originalPrompt: prompt });
            }
            return;
          }

          if (
            data &&
            data.pendingCostApproval &&
            data.costApproval &&
            Array.isArray(data.nodes)
          ) {
            pendingAssistantCostPayloadRef.current = {
              nodes: data.nodes,
              edges: Array.isArray(data.edges) ? data.edges : [],
              executeNodeIds: data.executeNodeIds,
            };
            setAssistantCostApproval({
              message: data.costApproval.message,
              apis: data.costApproval.apis,
              totalEurMin: data.costApproval.totalEurMin,
              totalEurMax: data.costApproval.totalEurMax,
            });
            return;
          }

          if (data && Array.isArray(data.nodes)) {
            applyAssistantGraphPayload(data);
          }
        }
      );
    } catch (err) {
      console.error('Assistant Generation error:', err);
    } finally {
      setIsGeneratingAssistant(false);
    }
  };

  const onAssistantCostApprovalConfirm = () => {
    const payload = pendingAssistantCostPayloadRef.current;
    pendingAssistantCostPayloadRef.current = null;
    setAssistantCostApproval(null);
    if (payload) {
      applyAssistantGraphPayload(payload);
    }
  };

  const onAssistantCostApprovalCancel = () => {
    pendingAssistantCostPayloadRef.current = null;
    setAssistantCostApproval(null);
  };

  const onAssistantClarifyPick = (option: string) => {
    if (!assistantClarify) return;
    const { originalPrompt } = assistantClarify;
    setAssistantClarify(null);
    void onGenerateAssistant(
      `[CLARIFICATION_REPLY] The user chose: "${option}". Original request: ${originalPrompt}`
    );
  };

  /** Refit del marco canvasGroup ~60fps mientras se arrastra o redimensiona un hijo (sin depender de expandParent). */
  const canvasGroupRefitRafRef = useRef<number | null>(null);
  const scheduleCanvasGroupRefit = useCallback(() => {
    if (canvasGroupRefitRafRef.current != null) return;
    canvasGroupRefitRafRef.current = requestAnimationFrame(() => {
      canvasGroupRefitRafRef.current = null;
      setNodes((prev) => recomputeCanvasGroupFrames(prev));
    });
  }, [setNodes]);

  const onNodeDrag = useCallback(() => {
    scheduleCanvasGroupRefit();
  }, [scheduleCanvasGroupRefit]);

  const onNodeDragStop = useCallback(
    (_event: unknown, _node: unknown, _nodes: unknown) => {
      if (canvasGroupRefitRafRef.current != null) {
        cancelAnimationFrame(canvasGroupRefitRafRef.current);
        canvasGroupRefitRafRef.current = null;
      }
      requestAnimationFrame(() => {
        setNodes((nds) => recomputeCanvasGroupFrames(nds));
      });
    },
    [setNodes]
  );

  const onNodeDragStart = useCallback(() => {
    takeSnapshot(); // capture state when drag begins, before positions change
  }, [takeSnapshot]);

  const onConnect: OnConnect = useCallback(
    (params) => {
      takeSnapshot();
      const edgeId = `e-${params.source}-${params.target}-${params.sourceHandle || 'def'}-${params.targetHandle || 'def'}-${Math.random().toString(36).substring(2, 6)}`;
      setEdges((eds) => addEdge({ ...params, id: edgeId, type: 'buttonEdge' }, eds));
      queueMicrotask(() => {
        updateNodeInternals(params.source);
        updateNodeInternals(params.target);
      });
      requestAnimationFrame(() => {
        updateNodeInternals(params.source);
        updateNodeInternals(params.target);
      });
      // Multi-ranura / medición DOM: asegurar bounds de handles tras pintar (si no, la arista no se renderiza).
      setTimeout(() => {
        updateNodeInternals(params.source);
        updateNodeInternals(params.target);
      }, 0);
      setTimeout(() => {
        updateNodeInternals(params.source);
        updateNodeInternals(params.target);
      }, 50);
      fitViewToNodeIds([params.target], 600);
    },
    [setEdges, takeSnapshot, fitViewToNodeIds, updateNodeInternals]
  );

  // ── Handle→Node: soltar conexión en el lienzo vacío crea el nodo más probable (ver canvas-connect-end-drop).
  // Requiere connectionMode={ConnectionMode.Loose} para poder arrastrar desde entradas (target).

  const onConnectEnd = useCallback((event: any, connectionState: any) => {
    // Solo si no se completó una conexión válida a otro nodo / handle
    if (connectionState?.isValid) return;
    if (connectionState?.toNode != null) return;

    const fromNodeId =
      connectionState?.fromNode?.id ?? connectionState?.from?.id ?? connectionState?.nodeId;
    const fromHandle = connectionState?.fromHandle ?? connectionState?.handle;
    const fromHandleId = fromHandle?.id as string | undefined;
    const fromType = (fromHandle?.type ?? connectionState?.fromHandle?.type) as
      | 'source'
      | 'target'
      | undefined;
    if (!fromNodeId || !fromHandleId || (fromType !== 'source' && fromType !== 'target')) return;

    const srcNode = nodes.find((n: any) => n.id === fromNodeId);
    const srcNodeType = srcNode?.type as string | undefined;
    const mediaAssetType = srcNodeType === 'mediaInput' ? (srcNode?.data as { type?: string })?.type : undefined;

    // Media output can fan out to several targets (e.g. multiple Nano Bananas)
    const allowMultiFromMedia =
      srcNodeType === 'mediaInput' && fromType === 'source' && fromHandleId === 'media';

    const alreadyConnected = !allowMultiFromMedia && edges.some((e: any) => {
      if (fromType === 'source') return e.source === fromNodeId && e.sourceHandle === fromHandleId;
      return e.target === fromNodeId && e.targetHandle === fromHandleId;
    });
    if (alreadyConnected) return;

    const handleMeta = resolveHandleMetaForCanvasDrop(srcNodeType, fromHandleId, fromType);
    if (!handleMeta) return;

    const lookupKey = `${handleMeta.type}:${fromType}`;
    let newType = pickNewNodeTypeForCanvasDrop(lookupKey, {
      srcNodeType,
      fromHandleId,
      fromFlow: fromType,
    });

    // Registry types media output as `url`, but an uploaded image behaves as image → Nano Banana on canvas drop
    if (srcNodeType === 'mediaInput' && fromType === 'source' && fromHandleId === 'media' && mediaAssetType === 'image') {
      newType = 'nanoBanana';
    }

    if (!newType) return;

    // Convert mouse position to flow coords
    const clientX = event.clientX ?? event.changedTouches?.[0]?.clientX ?? 0;
    const clientY = event.changedTouches?.[0]?.clientY ?? 0;
    const position  = screenToFlowPosition({ x: clientX, y: clientY });
    const newNodeId = `${newType}_${Date.now()}`;
    const newNode   = {
      id:       newNodeId,
      type:     newType,
      position: { x: position.x - 160, y: position.y - 80 },
      data:     withFoldderCanvasIntro(newType, defaultDataForCanvasDropNode(newType)),
    };

    const edgeId = `ae-${fromNodeId}-${newNodeId}-${fromHandleId}-${Date.now()}`;
    const newMeta  = NODE_REGISTRY[newType];

    // Pick the connecting handle on the new node
    const wireType =
      srcNodeType === 'mediaInput' && mediaAssetType === 'image' && newType === 'nanoBanana'
        ? 'image'
        : handleMeta.type;

    let newHandle: string | undefined;
    if (fromType === 'source') {
      // new node should receive: find its input matching the handle type
      // enhancer / concatenator / listado usan p0… en el DOM; el registry aún puede decir
      // `prompt` (igual que la salida) → XY Flow enlazaba al handle de salida.
      if (
        wireType === 'prompt' &&
        (newType === 'enhancer' || newType === 'concatenator' || newType === 'listado')
      ) {
        newHandle = 'p0';
      } else {
        newHandle = newMeta?.inputs.find((i: any) => i.type === wireType)?.id;
      }
    } else {
      // new node should provide: find its output matching the handle type
      newHandle = newMeta?.outputs.find((o: any) => o.type === handleMeta.type)?.id;
    }
    if (!newHandle) return;

    takeSnapshot();

    const newEdge = {
      id:           edgeId,
      source:       fromType === 'source' ? fromNodeId  : newNodeId,
      sourceHandle: fromType === 'source' ? fromHandleId : newHandle,
      target:       fromType === 'source' ? newNodeId   : fromNodeId,
      targetHandle: fromType === 'source' ? newHandle   : fromHandleId,
      type:         'buttonEdge',
      animated:     true,
    };

    setNodes((nds: any) => [...nds, newNode]);
    scheduleFoldderCanvasIntroEnd(newNodeId);
    // Delay edge slightly so ReactFlow's drag-cancel doesn't wipe it; luego recalcular handles (Enhancer, etc.)
    setTimeout(() => {
      setEdges((eds: any) => [...eds, newEdge]);
      const refreshHandles = () => {
        updateNodeInternals(newNodeId);
        updateNodeInternals(fromNodeId);
      };
      queueMicrotask(refreshHandles);
      requestAnimationFrame(() => {
        refreshHandles();
        requestAnimationFrame(refreshHandles);
      });
      fitViewToNodeIds([newNodeId], 600);
    }, 30);
  }, [edges, nodes, screenToFlowPosition, setNodes, setEdges, takeSnapshot, fitViewToNodeIds, updateNodeInternals, scheduleFoldderCanvasIntroEnd]);



  const onPaneContextMenu = useCallback((event: any) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  }, []);

  const onNodeContextMenu = useCallback((event: any, node: any) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
  }, []);

  const deleteNode = useCallback(
    (id: string) => {
      const target = nodes.find((n) => n.id === id);
      if (!target) return;
      /** El marco de agrupación en el lienzo no se elimina por menú contextual ni por tecla (solo Desagrupar). */
      if (target.type === "canvasGroup") {
        setContextMenu(null);
        return;
      }

      setNodes((nds) => {
        const next = nds.filter((n) => n.id !== id);
        return recomputeCanvasGroupFrames(next);
      });
      setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
      setContextMenu(null);
      setTimeout(() => {
        fitView({ padding: FIT_VIEW_PADDING, duration: fitAnim(650), ...FOLDDER_FIT_VIEW_EASE });
      }, 80);
    },
    [nodes, setNodes, setEdges, fitView]
  );

  const duplicateNode = useCallback(
    (id: string) => {
      const node = nodes.find((n) => n.id === id);
      if (!node) return;
      if (node.type === "canvasGroup") return;

      const plan = planDuplicateBelowMultiInput(node, edges, nodes);
      const newId = `${node.type}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const rawData = node.data && typeof node.data === 'object' ? { ...(node.data as object) } : {};
      delete (rawData as { _foldderCanvasIntro?: unknown })._foldderCanvasIntro;
      const newNode = {
        ...node,
        id: newId,
        position: plan?.position ?? { x: node.position.x + 20, y: node.position.y + 20 },
        selected: true,
        data: withFoldderCanvasIntro(String(node.type), rawData as Record<string, unknown>),
      };

      takeSnapshot();
      setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), newNode]);
      scheduleFoldderCanvasIntroEnd(newId);
      if (plan) {
        setEdges((eds) => [
          ...eds,
          {
            id: `dup-${newId}-${plan.targetId}-${Date.now()}`,
            source: newId,
            sourceHandle: plan.sourceHandle,
            target: plan.targetId,
            targetHandle: plan.targetHandle,
            type: 'buttonEdge',
            animated: true,
          },
        ]);
      }
      setContextMenu(null);
    },
    [nodes, edges, setNodes, setEdges, takeSnapshot, scheduleFoldderCanvasIntroEnd]
  );

  const groupSelectedToSpace = useCallback(() => {
    const selectedNodes = nodes.filter(
      (n) => n.selected
    );
    if (selectedNodes.length === 0) {
      setContextMenu(null);
      return;
    }

    takeSnapshot();

    const selectedIds = new Set(selectedNodes.map((n) => n.id));
    const internalEdges = edges.filter(
      (e) => selectedIds.has(e.source) && selectedIds.has(e.target)
    );

    const isSubgraphConnected = (): boolean => {
      if (selectedIds.size <= 1) return true;
      const adj = new Map<string, string[]>();
      const link = (a: string, b: string) => {
        if (!adj.has(a)) adj.set(a, []);
        if (!adj.has(b)) adj.set(b, []);
        adj.get(a)!.push(b);
        adj.get(b)!.push(a);
      };
      internalEdges.forEach((e) => link(e.source, e.target));
      const start = selectedNodes[0].id;
      const seen = new Set<string>();
      const stack = [start];
      while (stack.length) {
        const id = stack.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        for (const nb of adj.get(id) || []) {
          if (selectedIds.has(nb) && !seen.has(nb)) stack.push(nb);
        }
      }
      return seen.size === selectedIds.size;
    };

    const connected = isSubgraphConnected();

    const sinks = selectedNodes.filter(
      (n) =>
        !internalEdges.some(
          (e) => e.source === n.id && selectedIds.has(e.target)
        )
    );
    const sources = selectedNodes.filter(
      (n) =>
        !internalEdges.some(
          (e) => e.target === n.id && selectedIds.has(e.source)
        )
    );

    const reg = (t: string) => NODE_REGISTRY[t];
    let includeSpaceInput = true;
    if (sources.length === 1) {
      if ((reg(sources[0].type)?.inputs?.length ?? 0) === 0) {
        includeSpaceInput = false;
      }
    } else if (sources.length > 1) {
      if (sources.every((s) => (reg(s.type)?.inputs?.length ?? 0) === 0)) {
        includeSpaceInput = false;
      }
    }

    const minX = Math.min(...selectedNodes.map((n) => n.position.x));
    const minY = Math.min(...selectedNodes.map((n) => n.position.y));
    const maxX = Math.max(...selectedNodes.map((n) => n.position.x));
    const maxY = Math.max(...selectedNodes.map((n) => n.position.y));
    const avgX = (minX + maxX) / 2;
    const avgY = (minY + maxY) / 2;

    const newSpacesMap = { ...spacesMap };
    const spaceId = `space_group_${Date.now()}`;

    const nestedNodes = selectedNodes.map((n) => ({
      ...n,
      position: {
        x: n.position.x - minX + 200,
        y: n.position.y - minY + 200,
      },
      selected: false,
    }));

    const pickRightmost = (arr: typeof nestedNodes) =>
      arr.reduce((prev, cur) =>
        cur.position.x > prev.position.x ||
        (cur.position.x === prev.position.x && cur.position.y > prev.position.y)
          ? cur
          : prev
      );

    let lastNode = pickRightmost(nestedNodes);
    if (connected && sinks.length > 0) {
      const sinkNested = sinks
        .map((s) => nestedNodes.find((nn) => nn.id === s.id))
        .filter((n): n is (typeof nestedNodes)[0] => n != null);
      if (sinkNested.length > 0) lastNode = pickRightmost(sinkNested);
    }

    const lastNodeMeta = NODE_REGISTRY[lastNode.type];
    const lastNodeOutput = lastNodeMeta?.outputs?.[0];

    const autoOutEdge = lastNodeOutput
      ? [
          {
            id: `nested_auto_out_${Date.now()}`,
            source: lastNode.id,
            sourceHandle: lastNodeOutput.id,
            target: 'out',
            targetHandle: 'in',
            type: 'buttonEdge',
            animated: true,
          },
        ]
      : [];

    const allInternalEdges = [
      ...internalEdges.map((e: any) => ({ ...e, id: `nested_${e.id}` })),
      ...autoOutEdge,
    ];

    const virtualOutNode = { id: 'out', type: 'spaceOutput', data: {} };
    const structure = analyzeSpaceStructure(
      [...nestedNodes, virtualOutNode],
      allInternalEdges
    );

    const autoOutputType = lastNodeOutput?.type || structure.type;
    const autoOutputValue = lastNode.data?.value || structure.value || null;

    const maxNestedX = Math.max(...nestedNodes.map((n: any) => n.position.x));

    const innerNodes: any[] = [];
    if (includeSpaceInput) {
      innerNodes.push({
        id: 'in',
        type: 'spaceInput',
        position: { x: 50, y: 250 },
        data: { label: 'Input' },
      });
    }
    innerNodes.push({
      id: 'out',
      type: 'spaceOutput',
      position: {
        x: maxNestedX + 320,
        y: lastNode.position.y,
      },
      data: { label: 'Output', outputType: autoOutputType },
    });
    innerNodes.push(...nestedNodes);

    newSpacesMap[spaceId] = {
      id: spaceId,
      name: `Grouped Space`,
      nodes: innerNodes,
      edges: allInternalEdges,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      outputType: autoOutputType,
      outputValue: autoOutputValue,
      hasInput: includeSpaceInput,
      hasOutput: true,
      internalCategories: structure.internalCategories,
    };

    const spaceNodeId = `node_space_${Date.now()}`;
    const newNode = {
      id: spaceNodeId,
      type: 'space',
      position: { x: avgX, y: avgY },
      data: withFoldderCanvasIntro('space', {
        spaceId,
        label: structure.label || 'Nested Group',
        hasInput: includeSpaceInput,
        hasOutput: true,
        outputType: autoOutputType,
        value: autoOutputValue,
        internalCategories: structure.internalCategories,
      }),
    };

    const remainingNodes = nodes.filter((n) => !selectedIds.has(n.id));
    const remainingEdges = edges.filter(
      (e) => !selectedIds.has(e.source) && !selectedIds.has(e.target)
    );

    setNodes([...remainingNodes, newNode]);
    scheduleFoldderCanvasIntroEnd(spaceNodeId);
    setEdges(remainingEdges);
    setSpacesMap(newSpacesMap);
    setContextMenu(null);
  }, [
    nodes,
    edges,
    spacesMap,
    setNodes,
    setEdges,
    setSpacesMap,
    takeSnapshot,
    analyzeSpaceStructure,
    scheduleFoldderCanvasIntroEnd,
  ]);

  const groupSelectedToCanvasGroup = useCallback(() => {
    const sel = nodes.filter((n) => n.selected);
    if (sel.length < 2) return;
    const ids = sel.map((n) => n.id);
    const created = createCanvasGroupFromNodeIds(ids, nodes, "Grupo de prompts");
    if (!created) return;
    const gid = created.nodes.find((n) => n.type === "canvasGroup")?.id;
    if (!gid) return;
    const collapsed = applyCanvasGroupCollapse(gid, created.nodes, edges);
    if (!collapsed) return;
    takeSnapshot();
    setNodes(
      collapsed.nodes.map((n) => ({
        ...n,
        selected: n.id === gid,
      }))
    );
    setEdges(collapsed.edges);
    setContextMenu(null);
  }, [nodes, edges, setNodes, setEdges, takeSnapshot]);

  const ungroupSelectedCanvasGroup = useCallback(() => {
    const sel = liveNodesRef.current.filter((n) => n.selected);
    const group = sel.find((n) => n.type === "canvasGroup");
    if (!group) return;
    performCanvasUngroup(group.id);
  }, [performCanvasUngroup]);

  groupSelectedToSpaceRef.current = groupSelectedToSpace;
  groupSelectedToCanvasGroupRef.current = groupSelectedToCanvasGroup;
  ungroupSelectedCanvasGroupRef.current = ungroupSelectedCanvasGroup;

  const flowNodes = useMemo(() => {
    const compatSet = new Set(libraryCompatibleIds);

    if (canvasViewMode === 'cards' && nodes.length > 0) {
      const ordered = sortNodesCardsOrder(nodes);
      const n = ordered.length;
      const f = Math.min(Math.max(0, cardsFocusIndex), n - 1);
      const anchor = cardsAnchorRef.current;
      const introParity = cardsIntroTick % 2;
      const introClass = introParity === 0 ? 'foldder-cards-intro-a' : 'foldder-cards-intro-b';

      return nodes.map((node: any) => {
        const isCompat = compatSet.has(node.id);
        const isHover = node.id === libraryDropTargetId;
        const isOverviewHover = node.id === overviewHoverHighlightId;
        const stackIdx = ordered.findIndex((x) => x.id === node.id);
        if (stackIdx === -1) {
          const cls = [
            node.className,
            node.data?._foldderCanvasIntro && 'foldder-node-canvas-intro',
            isCompat && 'library-drop-compatible',
            isHover && 'library-drop-highlight',
            isOverviewHover && 'foldder-ctrl-overview-hover',
          ]
            .filter(Boolean)
            .join(' ');
          return { ...node, className: cls || undefined, style: mergeNodeOutputBorderStyle(node) };
        }

        const isFocused = stackIdx === f;
        const cls = [
          node.className,
          node.data?._foldderCanvasIntro && 'foldder-node-canvas-intro',
          isCompat && 'library-drop-compatible',
          isHover && 'library-drop-highlight',
          isOverviewHover && 'foldder-ctrl-overview-hover',
          isFocused && 'foldder-cards-front',
          isFocused && introClass,
        ]
          .filter(Boolean)
          .join(' ');

        if (!isFocused) {
          return {
            ...node,
            hidden: true,
            selected: false,
            className: cls || undefined,
            style: mergeNodeOutputBorderStyle(node),
          };
        }

        return {
          ...node,
          hidden: false,
          position: { x: anchor.x, y: anchor.y },
          zIndex: 200,
          draggable: false,
          selectable: true,
          selected: true,
          className: cls || undefined,
          style: mergeNodeOutputBorderStyle(node, { zIndex: 200 }),
        };
      });
    }

    return nodes.map((n: any) => {
      const isCompat = compatSet.has(n.id);
      const isHover = n.id === libraryDropTargetId;
      const isOverviewHover = n.id === overviewHoverHighlightId;
      const cls = [
        n.className,
        n.data?._foldderCanvasIntro && 'foldder-node-canvas-intro',
        isCompat && 'library-drop-compatible',
        isHover && 'library-drop-highlight',
        isOverviewHover && 'foldder-ctrl-overview-hover',
      ]
        .filter(Boolean)
        .join(' ');
      return {
        ...n,
        className: cls || undefined,
        style: mergeNodeOutputBorderStyle(n),
      };
    });
  }, [
    nodes,
    libraryDropTargetId,
    libraryCompatibleIds,
    canvasViewMode,
    cardsFocusIndex,
    cardsIntroTick,
    overviewHoverHighlightId,
  ]);

  const flowEdges = useMemo(
    () => filterEdgesForCollapsedCanvasGroups(nodes, edges),
    [nodes, edges]
  );

  const isValidConnection = useCallback((connection: any) => {
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);
    if (!sourceNode || !targetNode) return false;
    return areNodesConnectable(sourceNode, targetNode, connection, nodes);
  }, [nodes]);

  const onDragOver = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';

      const t = libraryDragTypeRef.current;
      if (!t) return;

      const p = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const hit = findTopNodeUnderFlowPoint(p, nodes);
      if (!hit) {
        libraryDropTargetIdRef.current = null;
        setLibraryDropTargetId(null);
        return;
      }
      const plan = findLibraryDropPlan(t, hit, edges);
      if (!plan) {
        libraryDropTargetIdRef.current = null;
        setLibraryDropTargetId(null);
        return;
      }
      libraryDropTargetIdRef.current = hit.id;
      setLibraryDropTargetId(hit.id);
    },
    [screenToFlowPosition, nodes, edges]
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const dt = event.dataTransfer;
      const rawType = (
        dt.getData('application/reactflow') ||
        dt.getData('text/plain') ||
        libraryDragTypeRef.current ||
        ''
      ).trim();
      const libraryType = rawType && NODE_REGISTRY[rawType] ? rawType : '';

      const snapTargetId = libraryDropTargetIdRef.current;

      libraryDragTypeRef.current = null;
      libraryDropTargetIdRef.current = null;
      setLibraryDropTargetId(null);
      setLibraryCompatibleIds([]);

      const files = Array.from(dt.files);

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Librería / pins: prioridad sobre archivos (algunos navegadores rellenan `files` o no exponen MIME custom hasta el drop)
      if (libraryType) {
        const targetNode = snapTargetId ? nodes.find((n) => n.id === snapTargetId) : null;
        const plan =
          targetNode && snapTargetId
            ? findLibraryDropPlan(libraryType, targetNode, edges)
            : null;

        if (targetNode && plan && snapTargetId === targetNode.id) {
          libraryCanvasDropSucceededRef.current = true;
          const dropPos = computeLibraryDropPosition(targetNode, libraryType, plan);
          const placement = findEmptyPositionForNewNode(libraryType, nodes, {
            x: dropPos.x + 160,
            y: dropPos.y + 120,
          });
          const newId = `node_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          const newNode = {
            id: newId,
            type: libraryType,
            position: placement,
            data: withFoldderCanvasIntro(libraryType, { value: '', label: `${libraryType} node` }),
          };

          const edgeId = `e-lib-${newId}-${targetNode.id}-${Date.now()}`;
          const newEdge =
            plan.direction === 'existing-to-new'
              ? {
                  id: edgeId,
                  source: targetNode.id,
                  sourceHandle: plan.sourceHandle,
                  target: newId,
                  targetHandle: plan.targetHandle,
                  type: 'buttonEdge' as const,
                  animated: true,
                }
              : {
                  id: edgeId,
                  source: newId,
                  sourceHandle: plan.sourceHandle,
                  target: targetNode.id,
                  targetHandle: plan.targetHandle,
                  type: 'buttonEdge' as const,
                  animated: true,
                };

          takeSnapshot();
          setNodes((nds: any) => {
            const next = [...nds, newNode];
            setEdges((eds: any) => addEdge(newEdge, eds));
            return next;
          });
          scheduleFoldderCanvasIntroEnd(newId);
          setTimeout(() => {
            fitViewToNodeIds([newId], 700);
          }, 100);
          setSidebarLockedCollapsed(true);
          return;
        }

        libraryCanvasDropSucceededRef.current = true;
        const placement = findEmptyPositionForNewNode(libraryType, nodes, {
          x: position.x + 160,
          y: position.y + 120,
        });
        const libDropId = `node_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const newNode = {
          id: libDropId,
          type: libraryType,
          position: placement,
          data: withFoldderCanvasIntro(libraryType, { value: '', label: `${libraryType} node` }),
        };

        takeSnapshot();
        setNodes((nds) => [...nds, newNode]);
        scheduleFoldderCanvasIntroEnd(libDropId);
        setTimeout(() => {
          fitViewToNodeIds([newNode.id], 700);
        }, 100);
        setSidebarLockedCollapsed(true);
        return;
      }

      // Handle Native File Drops
      if (files.length > 0) {
        const overFreehandStudio = (() => {
          const path = event.nativeEvent.composedPath?.() as EventTarget[] | undefined;
          if (
            path?.some(
              (t) => t instanceof HTMLElement && t.closest?.('[data-foldder-studio-canvas]')
            )
          ) {
            return true;
          }
          const top = document.elementFromPoint(event.clientX, event.clientY);
          return top instanceof HTMLElement && !!top.closest('[data-foldder-studio-canvas]');
        })();
        if (overFreehandStudio) return;

        libraryCanvasDropSucceededRef.current = true;
        const inferMediaType = (name: string, mime: string): string => {
          if (mime.startsWith('video/') || name.match(/\.(mp4|mov|avi|webm|mkv)$/i)) return 'video';
          if (mime.startsWith('image/') || name.match(/\.(jpg|jpeg|png|webp|avif|gif|svg)$/i)) return 'image';
          if (mime.startsWith('audio/') || name.match(/\.(mp3|wav|ogg|flac|m4a)$/i)) return 'audio';
          if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
          if (mime.startsWith('text/') || name.endsWith('.txt')) return 'txt';
          return 'url';
        };

        let virtualNodes: Node[] = [...nodes];
        for (let index = 0; index < files.length; index++) {
          const file = files[index];
          const fileType = inferMediaType(file.name, file.type);
          const preferredCenter = {
            x: position.x + index * 20 + 160,
            y: position.y + index * 20 + 120,
          };
          const placement = findEmptyPositionForNewNode('mediaInput', virtualNodes, preferredCenter);
          const nodeId = `node_${Date.now()}_${index}_${Math.floor(Math.random() * 1000)}`;
          virtualNodes = [
            ...virtualNodes,
            {
              id: nodeId,
              type: 'mediaInput',
              position: placement,
              data: {},
            } as Node,
          ];

          const newNode = {
            id: nodeId,
            type: 'mediaInput',
            position: placement,
            data: withFoldderCanvasIntro('mediaInput', {
              value: '',
              type: fileType,
              label: file.name,
              loading: true,
              source: 'upload',
            }),
          };

          setNodes((nds) => [...nds, newNode]);
          scheduleFoldderCanvasIntroEnd(nodeId);

          void (async () => {
            const formData = new FormData();
            formData.append('file', file);
            try {
              const res = await fetch('/api/runway/upload', { method: 'POST', body: formData });
              const json = await readResponseJson<{ url?: string; s3Key?: string; error?: string }>(
                res,
                'POST /api/runway/upload'
              );
              if (json?.url) {
                setNodes((nds) => {
                  const prevKey = nds.find((n) => n.id === nodeId)?.data?.s3Key;
                  deleteSupersededS3Key(prevKey, json.s3Key);
                  return nds.map((n) =>
                    n.id === nodeId
                      ? {
                          ...n,
                          data: {
                            ...n.data,
                            value: json.url,
                            s3Key: json.s3Key,
                            loading: false,
                            error: false,
                            metadata: {
                              size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
                              resolution: fileType === 'video' || fileType === 'image' ? 'Auto-detected' : '-',
                              codec: file.type.split('/')[1]?.toUpperCase() || 'RAW',
                            },
                          },
                        }
                      : n
                  );
                });
              } else {
                const detail =
                  json?.error ||
                  (!res.ok ? `HTTP ${res.status}` : null) ||
                  'El servidor no devolvió URL (revisa consola y credenciales S3).';
                console.error('[canvas drop upload]', detail, json);
                setNodes((nds) =>
                  nds.map((n) =>
                    n.id === nodeId
                      ? {
                          ...n,
                          data: {
                            ...n.data,
                            loading: false,
                            error: true,
                            uploadError: detail,
                          },
                        }
                      : n
                  )
                );
              }
            } catch (err) {
              console.error('Auto-drop upload error:', err);
              setNodes((nds) =>
                nds.map((n) =>
                  n.id === nodeId
                    ? {
                        ...n,
                        data: {
                          ...n.data,
                          loading: false,
                          error: true,
                          uploadError: err instanceof Error ? err.message : 'Upload error',
                        },
                      }
                    : n
                )
              );
            }
          })();
        }
        setTimeout(() => {
          fitView({ padding: FIT_VIEW_PADDING, duration: fitAnim(800), ...FOLDDER_FIT_VIEW_EASE });
        }, 100);
        return;
      }
    },
    [
      screenToFlowPosition,
      setNodes,
      setEdges,
      nodes,
      edges,
      takeSnapshot,
      fitView,
      fitViewToNodeIds,
      scheduleFoldderCanvasIntroEnd,
      setSidebarLockedCollapsed,
    ]
  );

  return (
    <div className="flex w-full h-full" ref={reactFlowWrapper} style={{ flexDirection: 'column' }}>

      <SpacesWelcomeChrome
        showWelcome={showWelcome}
        onWelcomeAnimationEnd={() => {
          setShowWelcome(false);
          if (liveNodesRef.current.length === 0) {
            setShowEmptyShortcutsHint(true);
          }
        }}
        isAuthenticated={isAuthenticated}
        showEmptyShortcutsHint={showEmptyShortcutsHint}
        windowMode={windowMode}
        nodeCount={nodes.length}
      />

      {/* ── WINDOW VIEWER PANEL ─────────────────────────────────────────────── */}
      {windowMode && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0,
            height: viewerHeight,
            zIndex: 9998,
            background: 'rgba(5,5,10,0.72)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            display: 'flex',
            flexDirection: 'column',
            userSelect: 'none',
          }}
        >

          {/* ─ Viewer action buttons (bottom-right) ─ */}
          <div style={{
            position: 'absolute', bottom: 32, right: 12, zIndex: 20,
            display: 'flex', gap: 6, alignItems: 'center',
          }}>
            {finalMedia.value && (
              <button
                onClick={downloadViewerMedia}
                title={`Download ${finalMedia.type}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px',
                  background: 'rgba(255,255,255,0.07)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 8,
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                  textTransform: 'uppercase', cursor: 'pointer',
                }}
                className="hover:bg-white/15 transition-all"
              >
                <Download size={11} />
                <span>{finalMedia.type === 'video' ? 'Video' : 'Imagen'}</span>
              </button>
            )}
            <button
              onClick={() => { setWindowMode(false); setViewerSourceNodeId(null); }}
              title="Close viewer"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 10px',
                background: 'rgba(255,255,255,0.05)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.5)',
                fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                textTransform: 'uppercase', cursor: 'pointer',
              }}
              className="hover:bg-white/12 hover:text-white/80 transition-all"
            >
              <X size={11} />
              <span>Cerrar</span>
            </button>
          </div>

          {/* ─ Connection circle at bottom center of viewer ─ */}
          <div style={{
            position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
            zIndex: 20,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            pointerEvents: 'none',
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              background: finalMedia.value
                ? FOLDDER_LOGO_BLUE
                : 'rgba(255,255,255,0.15)',
              border: `2px solid ${finalMedia.value ? FOLDDER_LOGO_BLUE : 'rgba(255,255,255,0.2)'}`,
              boxShadow: finalMedia.value ? '0 0 10px rgba(108,92,231,0.55)' : 'none',
            }} />
          </div>

          {/* Media display area — pan/zoom/fit */}
          <div
            ref={viewerAreaRef}
            tabIndex={0}
            onWheel={onViewerWheel}
            onPointerDown={onViewerPointerDown}
            onPointerMove={onViewerPointerMove}
            onPointerUp={onViewerPointerUp}
            onKeyDown={onViewerKeyDown}
            className="flex-1 overflow-hidden relative outline-none"
            style={{ cursor: isPanningViewer.current ? 'grabbing' : 'grab' }}
          >
            {finalMedia.value ? (
              /* Transformable inner div */
              <div
                style={{
                  position: 'absolute',
                  top: 0, left: 0,
                  width: '100%', height: '100%',
                  transform: `translate(${viewerTransform.x}px, ${viewerTransform.y}px) scale(${viewerTransform.scale})`,
                  transformOrigin: '0 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  willChange: 'transform',
                }}
              >
                {finalMedia.type === 'video' ? (
                  <video
                    src={finalMedia.value}
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
                    controls
                    autoPlay
                    loop
                  />
                ) : (
                  <img
                    src={finalMedia.value}
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block', userSelect: 'none', pointerEvents: 'none' }}
                    alt="Final output"
                    draggable={false}
                  />
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 opacity-30">
                <Maximize size={48} strokeWidth={1} className="text-amber-400" />
                <span className="text-amber-300 text-xs font-bold uppercase tracking-widest text-center px-6">No media on this node — generate or load image/video first, then open the viewer from the node header</span>
              </div>
            )}
          </div>

          {/* ─ Draggable resize handle — large hit area, thin visual ─ */}
          <div
            onPointerDown={startViewerResize}
            style={{
              position: 'absolute',
              bottom: 0, left: 0, right: 0,
              height: 24,               /* large pointer hit area */
              cursor: 'ns-resize',
              display: 'flex',
              alignItems: 'flex-end',   /* align visual strip to bottom edge */
              zIndex: 10,
            }}
          >
            {/* Visual strip — only 8px tall */}
            <div style={{
              width: '100%',
              height: 8,
              background: 'rgba(251,191,36,0.08)',
              borderTop: '1px solid rgba(251,191,36,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {/* Grip dots */}
              <div style={{ display: 'flex', gap: 3 }}>
                {[0,1,2,3,4].map(i => (
                  <div key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(251,191,36,0.5)' }} />
                ))}
              </div>
            </div>
          </div>
        </div>

      )}

      {/* ── MAIN CANVAS AREA — always full height, viewer overlays on top ── */}
      <div
        className="flex flex-1"
        style={{ height: '100%' }}
      >
      {/* Sidebar: solo tras autenticar (oculto en pantalla de acceso) */}
      {isAuthenticated && (
        <div data-foldder-sidebar style={{ position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 10003 }}>
          <Sidebar
            windowMode={windowMode}
            onLibraryDragStart={handleLibraryDragStart}
            onLibraryDragEnd={handleLibraryDragEnd}
            onLibraryTileDoubleClick={addNodeFromTopbarPinDoubleClick}
            sidebarLockedCollapsed={sidebarLockedCollapsed}
            onSidebarStripMouseEnter={() => setSidebarLockedCollapsed(false)}
            paletteDragActive={paletteDragActive}
          />
        </div>
      )}
      <div className="flex-1 relative" onContextMenu={(e) => e.preventDefault()} style={{ marginLeft: 0 }}>
        {/* Dentro de un Space anidado: viñeta + bordes laterales borrosos (se quita al volver a root) */}
        {isAuthenticated && activeSpaceId !== 'root' && (
          <div
            className="pointer-events-none fixed inset-0 z-[35] transition-opacity duration-500 ease-out"
            aria-hidden
          >
            <div
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(ellipse 72% 58% at 50% 48%, rgba(15,23,42,0) 0%, rgba(15,23,42,0.14) 58%, rgba(15,23,42,0.38) 100%)',
              }}
            />
            <div
              className="absolute left-0 top-0 bottom-0 w-[min(26vw,380px)]"
              style={{
                background: 'linear-gradient(to right, rgba(15,23,42,0.42), rgba(15,23,42,0.08) 55%, transparent)',
                backdropFilter: 'blur(14px) saturate(1.05)',
                WebkitBackdropFilter: 'blur(14px) saturate(1.05)',
                maskImage: 'linear-gradient(to right, black 0%, black 35%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to right, black 0%, black 35%, transparent 100%)',
              }}
            />
            <div
              className="absolute right-0 top-0 bottom-0 w-[min(26vw,380px)]"
              style={{
                background: 'linear-gradient(to left, rgba(15,23,42,0.42), rgba(15,23,42,0.08) 55%, transparent)',
                backdropFilter: 'blur(14px) saturate(1.05)',
                WebkitBackdropFilter: 'blur(14px) saturate(1.05)',
                maskImage: 'linear-gradient(to left, black 0%, black 35%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to left, black 0%, black 35%, transparent 100%)',
              }}
            />
          </div>
        )}
        {/* Wheel: listener global (ratón→zoom, trackpad→pan); panOnScroll false para no solapar con XY Flow. noPanClassName placeholder evita .nopan bloqueando wheel en nodos */}
        <ReactFlow
          onInit={onCanvasInit}
          nodes={flowNodes}
          edges={flowEdges}
          onNodesChange={(changes) => {
            const nds = liveNodesRef.current;
            const studioOpen = typeof document !== 'undefined' && !!document.querySelector('[data-foldder-studio-canvas]');
            const filtered = changes.filter((c) => {
              if (c.type !== "remove") return true;
              if (studioOpen) return false;
              const id = (c as { id?: string }).id;
              if (!id) return true;
              const node = nds.find((n) => n.id === id);
              return node?.type !== "canvasGroup";
            });
            const removals = filtered.filter((c) => c.type === "remove");
            if (removals.length > 0) {
              // S3 objects are not deleted here so undo/history and version restore keep working.
              // Orphans are removed when the whole project is deleted (api/spaces DELETE).
              takeSnapshot();
            }
            onNodesChange(filtered);

            const childLayoutChange = filtered.some((c) => {
              if (c.type !== "dimensions" && c.type !== "position") return false;
              const id = (c as { id?: string }).id;
              if (!id) return false;
              const node = nds.find((n) => n.id === id);
              return Boolean(node?.parentId);
            });
            if (removals.length > 0) {
              setTimeout(() => {
                setNodes((prev) => {
                  const reframed = recomputeCanvasGroupFrames(prev);
                  const { nodes: nextNodes, edges: nextEdges } = removeEmptyCanvasGroups(
                    reframed,
                    liveEdgesRef.current
                  );
                  setEdges(nextEdges);
                  return nextNodes;
                });
              }, 0);
            } else if (childLayoutChange) {
              scheduleCanvasGroupRefit();
            }

            if (removals.length > 0) {
              setTimeout(() => {
                void fitView({
                  padding: FIT_VIEW_PADDING_NODE_FOCUS,
                  duration: fitAnim(650),
                  interpolate: "smooth",
                  ...FOLDDER_FIT_VIEW_EASE,
                });
              }, 80);
            }
          }}
          onEdgesChange={(changes) => {
            if (typeof document !== 'undefined' && document.querySelector('[data-foldder-studio-canvas]')) {
              const safe = changes.filter((c) => c.type !== 'remove');
              if (safe.length > 0) onEdgesChange(safe);
              return;
            }
            onEdgesChange(changes);
          }}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
           onDrop={onDrop}
          onDragOver={onDragOver}
          onPaneClick={onPaneClick}
          onPaneContextMenu={onPaneContextMenu}
          onDoubleClick={onCanvasDoubleClick}
          onNodeContextMenu={onNodeContextMenu}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onConnectEnd={onConnectEnd}
          connectionMode={ConnectionMode.Loose}
          elevateEdgesOnSelect

          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          defaultViewport={{ x: -559, y: 134, zoom: 0.7 }}
          minZoom={0.05}
          maxZoom={4}
          proOptions={{ hideAttribution: true }}
          multiSelectionKeyCode="Shift"
          panOnDrag={spaceHeld ? true : [1]}
          selectionOnDrag={!spaceHeld && canvasViewMode === 'free'}
          selectionMode={SelectionMode.Partial}
          panOnScroll={false}
          panOnScrollSpeed={1}
          zoomOnScroll={false}
          zoomOnPinch={canvasViewMode !== 'cards'}
          zoomActivationKeyCode={null}
          noPanClassName={XYFLOW_NO_PAN_WHEEL_GUARD_CLASS}
          zoomOnDoubleClick={false}
          nodesDraggable={canvasViewMode === 'free'}
          nodesConnectable={canvasViewMode === 'free' && !overviewModeActive}

          className={`spaces-canvas${spaceHeld || middlePanHeld ? ' spaces-canvas--space-pan' : ''}${canvasViewMode === 'cards' ? ' spaces-canvas--cards-mode' : ''}${overviewModeActive ? ' foldder-overview-mode-active' : ''}`}
          style={reactFlowCanvasStyle}
        >
          <Background color="#111" gap={40} size={1} />
        </ReactFlow>

        {isAuthenticated && <HandleTypeLegend />}

        {isAuthenticated && <ExternalApiBlockedModal />}

        {isAuthenticated && (
          <div className="pointer-events-none fixed bottom-4 right-4 z-[10025] flex flex-col items-end gap-2">
            {aiJobToasts.length > 0 && (
              <div
                className="flex w-full max-w-[min(92vw,380px)] flex-col items-stretch gap-2"
                aria-live="polite"
              >
                {aiJobToasts.map((t) => {
                  const focusCanvas =
                    !t.nodeId || t.nodeId === AI_JOB_CANVAS_NODE_ID;
                  return (
                    <div
                      key={t.id}
                      className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-white/25 bg-white/[0.06] px-3 py-2.5 shadow-lg backdrop-blur-xl"
                    >
                      {t.ok ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-white/85" aria-hidden />
                      ) : (
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-white/75" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold leading-snug text-white">
                          {t.ok ? 'Listo' : 'Error'} · <span className="text-white/90">{t.label}</span>
                        </p>
                        {!t.ok && t.message && (
                          <p className="mt-0.5 line-clamp-3 text-[9px] leading-snug text-white/65">{t.message}</p>
                        )}
                        {t.ok && (
                          <p className="mt-0.5 text-[9px] text-white/55">La petición anterior ha terminado.</p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <button
                          type="button"
                          className="rounded-lg border border-white/25 bg-white/[0.08] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-white shadow-sm backdrop-blur-xl transition-colors hover:bg-white/[0.14]"
                          onClick={() => {
                            focusAiJobNode(t.nodeId);
                            setAiJobToasts((p) => p.filter((x) => x.id !== t.id));
                          }}
                        >
                          {focusCanvas ? 'Ver lienzo' : 'Ir al nodo'}
                        </button>
                        <button
                          type="button"
                          className="rounded px-1 py-0.5 text-[8px] text-white/45 transition-colors hover:text-white/80"
                          onClick={() => setAiJobToasts((p) => p.filter((x) => x.id !== t.id))}
                        >
                          Cerrar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {apiUsagePanelOpen && <ApiUsageHud />}
            <AiRequestHud />
            <button
              type="button"
              className="pointer-events-auto flex select-none items-center gap-1 rounded-md border border-white/25 bg-black/55 px-2 py-1.5 font-mono text-[11px] font-medium tabular-nums text-white shadow-md backdrop-blur-md hover:bg-black/70"
              aria-expanded={apiUsagePanelOpen}
              aria-controls="foldder-api-usage-panel"
              aria-live="polite"
              title={apiUsagePanelOpen ? 'Ocultar uso de APIs' : 'Ver uso de APIs (zoom del lienzo)'}
              onClick={() => setApiUsagePanelOpen((v) => !v)}
            >
              <ZoomIn className="h-3.5 w-3.5 shrink-0 text-white" strokeWidth={2} aria-hidden />
              <span className="text-white">{(canvasZoom * 100).toFixed(0)}%</span>
            </button>
          </div>
        )}

        {!isAuthenticated && (
          <SpacesPasswordOverlay
            passcode={passcode}
            passError={passError}
            onPasscodeChange={handleAuth}
          />
        )}

        {/* Context Menu */}
        {contextMenu && (
          <div 
            className="context-menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onMouseLeave={() => setContextMenu(null)}
          >
            <div className="px-3 py-2 text-[8px] font-black text-white/30 uppercase tracking-widest border-b border-white/5 mb-1">
              Actions
            </div>
            
            {contextMenu.nodeId ? (
              <>
                {nodes.find((n) => n.id === contextMenu.nodeId)?.type === "canvasGroup" && (
                  <div
                    className="context-menu-item primary"
                    onClick={() => {
                      const gid = contextMenu.nodeId!;
                      performCanvasUngroup(gid);
                      setContextMenu(null);
                    }}
                  >
                    <NodeIconMono iconKey="concat" size={14} className="text-violet-300 opacity-90" /> Desagrupar (lienzo)
                  </div>
                )}
                <div 
                  className="context-menu-item"
                  onClick={() => duplicateNode(contextMenu.nodeId!)}
                >
                  <NodeIconMono iconKey="concat" size={14} className="text-blue-400 opacity-90" /> Duplicate Node
                </div>
                {nodes.find((n) => n.id === contextMenu.nodeId)?.type !== "canvasGroup" && (
                  <div
                    className="context-menu-item danger"
                    onClick={() => deleteNode(contextMenu.nodeId!)}
                  >
                    <NodeIconMono iconKey="matting" size={14} className="text-rose-400 opacity-90" /> Delete Node
                  </div>
                )}
              </>
            ) : (
              <>
                {nodes.filter((n) => n.selected).length >= 2 && (
                  <div
                    className="context-menu-item primary"
                    onClick={groupSelectedToCanvasGroup}
                  >
                    <NodeIconMono iconKey="concat" size={14} className="text-violet-300 opacity-90" /> Agrupar en el lienzo
                  </div>
                )}
                <div 
                  className="context-menu-item primary"
                  onClick={groupSelectedToSpace}
                >
                  <NodeIconMono iconKey="space" size={14} className="text-cyan-300 opacity-90" /> Group into Nested Space
                </div>
                <div className="context-menu-separator" />
                <div 
                  className="context-menu-item"
                  onClick={() => {
                    setNodes([]);
                    setEdges([]);
                    setContextMenu(null);
                  }}
                >
                  <NodeIconMono iconKey="canvas" size={14} className="text-slate-300 opacity-80" /> Clear Canvas
                </div>
              </>
            )}
          </div>
        )}
        
        {windowMode && isAuthenticated && (
          <AgentHUD
            onGenerate={onGenerateAssistant}
            isGenerating={isGeneratingAssistant}
            windowMode
            selectedNodeCount={nodes.filter((n) => n.selected).length}
          />
        )}

        {/* Action HUD — fila1: agente (izq.) + acciones (der.); fila2: accesos fijos inferiores. Oculto con body.nb-studio-open (Nano Banana Studio fullscreen). */}
        <div
          key="action-hud"
          data-foldder-top-hud
          className="pointer-events-none flex min-w-0 flex-col gap-2"
          style={windowMode
            ? { position: 'fixed', top: 8, left: 16, right: 16, zIndex: 100 }
            : { position: 'absolute', top: 24, left: 24, right: 24, zIndex: 100 }}
        >
          <div className="flex w-full min-w-0 max-w-full items-center gap-2 sm:gap-3">
            {isAuthenticated && !windowMode && (
              <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                <div className="flex shrink-0 items-center self-center" aria-hidden>
                  <svg
                    width={34}
                    height={34}
                    viewBox="0 0 60 60"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="block shrink-0 drop-shadow-md"
                  >
                    <path
                      d="M4 8 Q4 4 8 4 L48 4 L56 12 L56 52 Q56 56 52 56 L8 56 Q4 56 4 52 Z"
                      fill="#6C5CE7"
                    />
                    <path d="M48 4 L56 12 L48 12 Z" fill="rgba(0,0,0,0.25)" />
                    <rect x="17" y="18" width="5" height="24" rx="2" fill="white" />
                    <rect x="17" y="18" width="20" height="5" rx="2" fill="white" />
                    <rect x="17" y="28" width="15" height="5" rx="2" fill="white" />
                  </svg>
                </div>
                <div className="flex min-h-[40px] min-w-0 flex-1 items-center rounded-xl border border-white/25 bg-white/[0.08] px-2 py-1 shadow-sm backdrop-blur-xl">
                  <AgentHUD
                    variant="topbar"
                    onGenerate={onGenerateAssistant}
                    isGenerating={isGeneratingAssistant}
                    selectedNodeCount={nodes.filter((n) => n.selected).length}
                  />
                </div>
              </div>
            )}
            <div
              className={
                isAuthenticated && !windowMode
                  ? 'pointer-events-auto ml-auto flex min-w-0 shrink-0 items-center gap-2 sm:gap-3'
                  : 'pointer-events-auto flex w-full min-w-0 flex-1 items-center justify-between gap-3'
              }
            >
              {/* Quick Actions */}
              <div className="flex shrink-0 gap-1.5">
                <div className="flex overflow-hidden rounded-xl border border-white/25 bg-white/[0.08] shadow-sm backdrop-blur-xl">
                  <button
                    type="button"
                    onClick={exitCardsViewMode}
                    title="Modo lienzo: arrastra y redimensiona nodos"
                    className={`flex h-10 w-10 items-center justify-center transition-all ${
                      canvasViewMode === 'free'
                        ? 'bg-slate-800/95 text-white shadow-inner backdrop-blur-sm'
                        : 'text-slate-700 hover:bg-white/[0.18] hover:text-slate-900'
                    }`}
                  >
                    <Move size={16} className={canvasViewMode === 'free' ? 'text-white' : 'text-slate-700'} />
                  </button>
                  <button
                    type="button"
                    onClick={enterCardsViewMode}
                    title="Modo cartas: un nodo a pantalla completa; ← → o Tab cambian la carta con zoom suave (sin cables ni conectores)."
                    className={`flex h-10 w-10 items-center justify-center border-l border-white/20 transition-all ${
                      canvasViewMode === 'cards'
                        ? 'bg-slate-800/95 text-white shadow-inner backdrop-blur-sm'
                        : 'text-slate-700 hover:bg-white/[0.18] hover:text-slate-900'
                    }`}
                  >
                    <Layers size={16} className={canvasViewMode === 'cards' ? 'text-white' : 'text-slate-700'} />
                  </button>
                </div>
                <div className="relative" ref={canvasBgMenuRef}>
                  <button
                    type="button"
                    onClick={() => setCanvasBgMenuOpen((o) => !o)}
                    title="Fondo del lienzo y ordenar nodos"
                    aria-expanded={canvasBgMenuOpen}
                    className="group relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/25 bg-white/[0.08] text-slate-700 shadow-sm backdrop-blur-xl transition-all hover:scale-105 hover:bg-white/[0.15] hover:text-slate-900"
                  >
                    <LayoutGrid size={16} className="text-slate-700 group-hover:text-slate-900" />
                    <ChevronDown
                      size={12}
                      className={`absolute bottom-1 right-1 text-slate-600 transition-transform ${canvasBgMenuOpen ? 'rotate-180' : ''}`}
                      aria-hidden
                    />
                  </button>
                  {canvasBgMenuOpen && (
                    <div
                      className="absolute right-0 top-[calc(100%+6px)] z-[220] w-[min(94vw,380px)] overflow-hidden rounded-xl border border-white/25 bg-white/[0.94] py-1.5 shadow-xl backdrop-blur-xl dark:bg-slate-900/95"
                      role="menu"
                      aria-label="Fondo del lienzo"
                    >
                      <div className="max-h-[min(58vh,440px)] overflow-y-auto px-2">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {CANVAS_BACKGROUNDS.map((bg) => (
                            <button
                              key={bg.id}
                              type="button"
                              role="menuitem"
                              aria-label={bg.label}
                              onClick={() => {
                                setCanvasBgId(bg.id);
                                setCanvasBgMenuOpen(false);
                              }}
                              className={`block w-full rounded-none border border-slate-200/90 bg-slate-50/80 p-0 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800/80 dark:hover:bg-slate-700 ${
                                canvasBgId === bg.id
                                  ? 'ring-2 ring-slate-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-900'
                                  : ''
                              }`}
                            >
                              <span
                                className="block aspect-[4/3] w-full bg-slate-200 bg-cover bg-center dark:bg-slate-700"
                                style={{ backgroundImage: `url("${bg.url}")` }}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="mt-1 border-t border-slate-200/80 px-1.5 pt-1.5 dark:border-slate-600/80">
                        <button
                          type="button"
                          onClick={() => {
                            autoLayoutNodes();
                            setCanvasBgMenuOpen(false);
                          }}
                          className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600"
                        >
                          <LayoutGrid size={14} aria-hidden />
                          Ordenar nodos
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={togglePageFullscreen}
                  title={
                    browserFullscreen
                      ? 'Salir de pantalla completa (Esc)'
                      : 'Pantalla completa (ocultar barra del navegador)'
                  }
                  aria-pressed={browserFullscreen}
                  className="group flex h-10 w-10 items-center justify-center rounded-xl border border-white/25 bg-white/[0.08] text-slate-700 shadow-sm backdrop-blur-xl transition-all hover:scale-105 hover:bg-white/[0.15] hover:text-slate-900"
                >
                  {browserFullscreen ? (
                    <Minimize2 size={16} className="text-slate-700 group-hover:text-slate-900" aria-hidden />
                  ) : (
                    <Maximize2 size={16} className="text-slate-700 group-hover:text-slate-900" aria-hidden />
                  )}
                </button>
                <button
                  onClick={() => setShowLoadModal(true)}
                  title="My Spaces"
                  className="group flex h-10 w-10 items-center justify-center rounded-xl border border-white/25 bg-white/[0.08] text-slate-700 shadow-sm backdrop-blur-xl transition-all hover:scale-105 hover:bg-white/[0.15] hover:text-slate-900"
                >
                  <FolderOpen size={16} className="text-slate-700 group-hover:text-slate-900" />
                </button>
                <button
                  type="button"
                  onClick={() => (activeProjectId ? void saveProject() : setShowSaveModal(true))}
                  disabled={isSaving}
                  title={
                    activeProjectId
                      ? 'Guardar cambios en el proyecto actual'
                      : 'Guardar proyecto (elige nombre si es nuevo)'
                  }
                  className={`flex h-10 items-center gap-2 rounded-xl border px-4 text-[9px] font-black uppercase tracking-widest shadow-sm backdrop-blur-xl transition-all hover:scale-105 disabled:opacity-50 ${
                    activeProjectId
                      ? 'border-rose-400/45 bg-rose-500/[0.10] text-rose-900 hover:bg-rose-500/[0.18]'
                      : 'border-rose-400/35 bg-rose-600/88 text-white hover:bg-rose-600'
                  }`}
                >
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} className={activeProjectId ? 'text-rose-800' : ''} />}
                  <span className="hidden sm:inline">Guardar</span>
                </button>
              </div>
            </div>
          </div>
          {isAuthenticated && activeSpaceId !== 'root' && (
            <div className="pointer-events-none w-full flex justify-center px-3 pt-3 sm:pt-4">
              <p className="max-w-[min(640px,92vw)] text-center text-[10px] sm:text-[11px] font-medium leading-snug text-slate-600 drop-shadow-sm">
                Estás dentro del space{' '}
                <span className="font-bold text-slate-800">
                  {spacesMap[activeSpaceId]?.name || 'Space'}
                </span>
                , pulsa{' '}
                <button
                  type="button"
                  onClick={() => goToRootCanvas()}
                  className="pointer-events-auto inline rounded border border-slate-400/50 bg-white/50 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-slate-700 shadow-sm align-baseline cursor-pointer transition-colors hover:bg-white/80 hover:border-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
                  aria-label="Salir del space (equivalente a ESC)"
                >
                  ESC
                </button>{' '}
                para salir
              </p>
            </div>
          )}
        </div>

        {/* Barra inferior: accesos fijos (Vector, imagen, vídeo, VFX, Indesign) */}
        {isAuthenticated && !windowMode && (
          <div
            data-foldder-top-hud
            className="pointer-events-none absolute bottom-6 left-0 right-0 z-[120] flex justify-center overflow-visible px-4"
          >
            <TopbarPins
              embedded
              fullWidthRow
              onPinDoubleClick={addNodeFromTopbarPinDoubleClick}
              paletteDragActive={paletteDragActive}
            />
          </div>
        )}

        {assistantClarify && (
          <div className="fixed inset-0 z-[10006] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/45 backdrop-blur-xl"
              onClick={() => setAssistantClarify(null)}
              aria-hidden
            />
            <div
              className="relative z-10 w-full max-w-md rounded-3xl border border-white/25 bg-white/20 p-6 shadow-2xl shadow-black/20 backdrop-blur-xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="assistant-clarify-title"
            >
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2
                  id="assistant-clarify-title"
                  className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-800"
                >
                  <MessageCircle size={18} className="shrink-0 text-violet-500" />
                  Aclaración
                </h2>
                <button
                  type="button"
                  onClick={() => setAssistantClarify(null)}
                  className="rounded-full p-2 text-slate-500 transition-colors hover:bg-white/40 hover:text-slate-800"
                  aria-label="Cerrar"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="mb-4 text-sm leading-relaxed text-slate-700">{assistantClarify.message}</p>
              <div className="flex flex-col gap-2">
                {assistantClarify.options.map((opt, idx) => (
                  <button
                    key={`${idx}-${opt.slice(0, 48)}`}
                    type="button"
                    onClick={() => onAssistantClarifyPick(opt)}
                    className="rounded-2xl border border-white/25 bg-white/15 px-4 py-3 text-left text-sm font-bold text-slate-800 transition-all hover:bg-white/35"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {assistantCostApproval && (
          <div className="fixed inset-0 z-[10007] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/45 backdrop-blur-xl"
              onClick={onAssistantCostApprovalCancel}
              aria-hidden
            />
            <div
              className="relative z-10 w-full max-w-lg rounded-3xl border border-white/25 bg-white/20 p-6 shadow-2xl shadow-black/20 backdrop-blur-xl md:p-8"
              role="dialog"
              aria-modal="true"
              aria-labelledby="assistant-cost-title"
            >
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2
                  id="assistant-cost-title"
                  className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-800"
                >
                  <Wallet size={20} className="shrink-0 text-cyan-500" strokeWidth={2} />
                  Coste de APIs
                </h2>
                <button
                  type="button"
                  onClick={onAssistantCostApprovalCancel}
                  className="rounded-full p-2 text-slate-500 transition-colors hover:bg-white/40 hover:text-slate-800"
                  aria-label="Cerrar"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="mb-4 text-sm leading-relaxed text-slate-700">
                {assistantCostApproval.message}
              </p>
              <div className="mb-4 max-h-40 overflow-y-auto rounded-2xl border border-white/15 bg-white/10 p-3 shadow-inner backdrop-blur-sm">
                <ul className="list-inside list-disc space-y-1.5 text-xs text-slate-700">
                  {assistantCostApproval.apis.map((a, idx) => (
                    <li key={`${a.id}-${idx}-${a.name}`}>
                      <span className="font-semibold text-slate-800">{a.name}</span>
                      {a.count > 1 ? ` ×${a.count}` : ''}{' '}
                      <span className="text-slate-600">
                        — ~€{a.eurMin.toFixed(2)}–€{a.eurMax.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="mb-6 text-center text-base font-black tracking-tight text-cyan-700 drop-shadow-sm">
                Total orientativo: €{assistantCostApproval.totalEurMin.toFixed(2)} – €
                {assistantCostApproval.totalEurMax.toFixed(2)}
              </p>
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={onAssistantCostApprovalCancel}
                  className="rounded-2xl border border-white/25 bg-white/15 px-5 py-2.5 text-[11px] font-black uppercase tracking-widest text-slate-700 transition-all hover:bg-white/35"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={onAssistantCostApprovalConfirm}
                  className="rounded-2xl border border-cyan-500/45 bg-cyan-600 px-5 py-2.5 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-cyan-900/20 transition-all hover:bg-cyan-500"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modals — mismo estilo que tarjetas Lógica en Sidebar (borde blanco /25, fondo white/20, slate-700) */}
        {showSaveModal && (
          <div className="fixed inset-0 z-[10004] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/45 backdrop-blur-xl"
              onClick={() => setShowSaveModal(false)}
              aria-hidden
            />
            <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/25 bg-white/20 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="flex items-center gap-3 text-xl font-black uppercase tracking-wide text-slate-800">
                  <Save size={20} className="text-cyan-500" /> Save Workspace
                </h2>
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="rounded-full p-2 text-slate-500 transition-colors hover:bg-white/40 hover:text-slate-800"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
              <input
                type="text"
                autoFocus
                placeholder="Give your project a name..."
                value={currentName}
                onChange={(e) => setCurrentName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveProject();
                  if (e.key === 'Escape') setShowSaveModal(false);
                }}
                className="mb-6 w-full rounded-2xl border border-white/25 bg-white/25 px-4 py-3 text-sm font-bold text-slate-800 shadow-inner outline-none backdrop-blur-sm transition-all placeholder:text-slate-500 focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/25"
              />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="rounded-2xl border border-white/25 bg-white/15 px-6 py-2.5 font-black text-[11px] uppercase tracking-widest text-slate-700 transition-all hover:bg-white/35"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => saveProject()}
                  className="flex items-center gap-2 rounded-2xl border border-cyan-400/40 bg-cyan-500 px-6 py-2.5 font-black text-[11px] uppercase tracking-widest text-white shadow-lg shadow-cyan-500/25 transition-all hover:bg-cyan-400"
                >
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Project
                </button>
              </div>
            </div>
          </div>
        )}

        {showLoadModal && (
          <div className="fixed inset-0 z-[10004] flex items-center justify-center p-3 sm:p-4">
            <div
              className="absolute inset-0 bg-black/45 backdrop-blur-xl"
              onClick={() => setShowLoadModal(false)}
              aria-hidden
            />
            <div className="relative z-10 flex max-h-[min(85vh,560px)] w-full max-w-lg flex-col rounded-2xl border border-white/25 bg-white/20 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-800">
                  <FolderOpen size={16} className="shrink-0 text-rose-500" /> Your Projects
                </h2>
                <button
                  type="button"
                  onClick={() => setShowLoadModal(false)}
                  className="shrink-0 rounded-full p-1 text-slate-500 transition-colors hover:bg-white/40 hover:text-slate-800"
                  aria-label="Close"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="mb-3 text-[11px] leading-snug text-slate-600">
                Select a configuration to restore it to the canvas.
              </p>

              <div className="custom-scrollbar min-h-0 max-h-[min(52vh,340px)] flex-1 overflow-y-auto -mx-1 px-1 pb-1 sm:max-h-[min(48vh,380px)]">
                {savedProjects.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/30 bg-white/10 py-10 text-center backdrop-blur-sm">
                    <FolderOpen className="mx-auto mb-2 text-slate-400" size={28} />
                    <p className="text-xs font-bold text-slate-600">No saved projects yet.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {savedProjects.map((project) => (
                      <div
                        key={project.id}
                        className="group/item flex items-center gap-2.5 rounded-xl border border-white/25 bg-white/15 px-2.5 py-2 shadow-sm backdrop-blur-sm transition-all hover:bg-white/28"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/20 text-rose-500">
                          <Workflow size={15} />
                        </div>
                        <div className="min-w-0 flex-1">
                          {editingId === project.id ? (
                            <input
                              autoFocus
                              type="text"
                              className="w-full rounded-lg border border-white/25 bg-white/35 px-2 py-1 text-xs font-black text-slate-900 shadow-inner outline-none backdrop-blur-sm placeholder:text-slate-500 focus:border-rose-400/50 focus:ring-1 focus:ring-rose-400/20"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onBlur={() => renameProject(project.id, editingName)}
                              onKeyDown={(e) => e.key === 'Enter' && renameProject(project.id, editingName)}
                            />
                          ) : (
                            <h4
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                setEditingId(project.id);
                                setEditingName(project.name);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  setEditingId(project.id);
                                  setEditingName(project.name);
                                }
                              }}
                              className="group/title flex cursor-pointer items-center gap-1.5 truncate text-[13px] font-black leading-tight tracking-tight text-slate-800 hover:text-rose-600"
                            >
                              {project.name}
                              <Edit2
                                size={10}
                                className="shrink-0 text-slate-400 opacity-0 transition-opacity group-hover/title:opacity-100"
                              />
                            </h4>
                          )}
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                            <div className="flex items-center gap-1">
                              <Calendar size={10} /> {new Date(project.updatedAt).toLocaleDateString()}
                            </div>
                            <div className="flex items-center gap-1">
                              <Settings2 size={10} /> {Object.keys(project.spaces || {}).length} spaces
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => duplicateProject(project)}
                            title="Duplicate"
                            className="rounded-lg border border-white/20 bg-white/12 p-1.5 text-slate-500 transition-all hover:border-sky-400/50 hover:bg-white/35 hover:text-sky-600"
                          >
                            <Copy size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setProjectToDelete(project)}
                            title="Delete"
                            className="rounded-lg border border-white/20 bg-white/12 p-1.5 text-slate-500 transition-all hover:border-rose-400/50 hover:bg-white/35 hover:text-rose-600"
                          >
                            <Trash2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => loadProject(project)}
                            className="rounded-lg border border-white/25 bg-white/35 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-slate-800 shadow-sm transition-all hover:border-slate-400/40 hover:bg-white/50"
                          >
                            Load
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Delete — mismo cristal / borde que Save & Load (compacto, alto contraste) */}
        {projectToDelete && (
          <div className="fixed inset-0 z-[10005] flex items-center justify-center p-3 sm:p-4">
            <div
              className="absolute inset-0 bg-black/45 backdrop-blur-xl"
              onClick={() => setProjectToDelete(null)}
              aria-hidden
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-project-title"
              className="relative z-10 w-full max-w-sm rounded-2xl border border-white/25 bg-white/20 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-500/35 bg-rose-500/12">
                  <Trash2 size={18} className="text-rose-600" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2
                    id="delete-project-title"
                    className="text-sm font-black uppercase tracking-wide text-slate-900"
                  >
                    Delete project?
                  </h2>
                  <p className="mt-2 text-left text-[11px] font-medium leading-snug text-slate-800">
                    This will permanently remove{' '}
                    <span className="font-bold text-slate-950">&quot;{projectToDelete.name}&quot;</span>. This cannot be
                    undone.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setProjectToDelete(null)}
                  className="flex-1 rounded-xl border border-white/25 bg-white/15 py-2 text-[10px] font-black uppercase tracking-widest text-slate-800 transition-all hover:bg-white/35"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deleteProject(projectToDelete.id);
                    setProjectToDelete(null);
                  }}
                  className="flex-1 rounded-xl border border-rose-500/45 bg-rose-600 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-md shadow-rose-900/20 transition-all hover:bg-rose-500 hover:brightness-105"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default function SpacesPage() {
  return (
    <div className="w-screen h-screen bg-slate-50">
      <ReactFlowProvider>
        <NodeExecutionProvider>
          <SpacesContent />
        </NodeExecutionProvider>
      </ReactFlowProvider>
    </div>
  );
}
