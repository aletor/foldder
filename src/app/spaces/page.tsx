"use client";

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
  ReactFlowProvider,
  useReactFlow,
  useNodesState,
  useEdgesState,
  SelectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { 
  MediaInputNode, 
  PromptNode, 
  GrokNode, 
  ConcatenatorNode, 
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
  PainterNode,
  CropNode,
  BezierMaskNode,
  TextOverlayNode,
  FinalOutputNode,
  ButtonEdge 
} from './CustomNodes';


import Sidebar from './Sidebar';
import { AgentHUD } from './AgentHUD';
import { readResponseJson } from '@/lib/read-response-json';
import './spaces.css';
import { NODE_REGISTRY } from './nodeRegistry';
import {
  areNodesConnectable,
  findLibraryDropPlan,
  computeLibraryDropPosition,
  findTopNodeUnderFlowPoint,
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
  LayoutGrid,
  ChevronLeft,
  Layers,
  Sparkles,
  Download,
  Brain,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const AUTH_HIGHLIGHTS: {
  icon: LucideIcon;
  title: string;
  description: string;
}[] = [
  {
    icon: Layers,
    title: 'Your Entire Creative Stack. Rebuilt.',
    description: 'Photoshop, Illustrator, DaVinci… now inside one canvas.',
  },
  {
    icon: Workflow,
    title: 'From Tools to Systems',
    description: 'Design the full creative process as a connected flow.',
  },
  {
    icon: Brain,
    title: 'AI That Works Like You Do',
    description: 'Not prompts. Pipelines. Fully visual and reusable.',
  },
  {
    icon: Sparkles,
    title: "Create What Didn't Exist Before",
    description: 'Image, video and logic combined into new workflows.',
  },
];

const initialNodes: Node[] = [];

const FINAL_NODE_ID = 'final_output_permanent';

/** Margin around the graph when fitting the viewport — higher = more “air”, nodes read smaller */
const FIT_VIEW_PADDING = 1.2;

const nodeTypes: any = {
  mediaInput: MediaInputNode,
  promptInput: PromptNode,
  grokProcessor: GrokNode,
  concatenator: ConcatenatorNode,
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
  painter: PainterNode,
  crop: CropNode,
  bezierMask: BezierMaskNode,
  textOverlay: TextOverlayNode,
  finalOutput: FinalOutputNode,
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
  const { screenToFlowPosition, setViewport, fitView, getViewport } = useReactFlow();
  
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
  const [projectToDelete, setProjectToDelete] = useState<any | null>(null);
  const [navigationStack, setNavigationStack] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, nodeId?: string } | null>(null);

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

  const handleLibraryDragStart = useCallback(
    (nodeType: string) => {
      libraryDragViewportRef.current = getViewport();
      libraryCanvasDropSucceededRef.current = false;
      libraryDragTypeRef.current = nodeType;

      const compatible: string[] = [];
      for (const n of nodes) {
        if (n.id === FINAL_NODE_ID) continue;
        if (findLibraryDropPlan(nodeType, n, edges)) {
          compatible.push(n.id);
        }
      }
      setLibraryCompatibleIds(compatible);

      fitView({ padding: FIT_VIEW_PADDING, duration: 420 });
    },
    [fitView, getViewport, nodes, edges]
  );

  const handleLibraryDragEnd = useCallback(() => {
    const saved = libraryDragViewportRef.current;
    if (!libraryCanvasDropSucceededRef.current && saved) {
      setViewport(saved, { duration: 380 });
    }
    libraryDragViewportRef.current = null;
    libraryCanvasDropSucceededRef.current = false;
    libraryDragTypeRef.current = null;
    libraryDropTargetIdRef.current = null;
    setLibraryDropTargetId(null);
    setLibraryCompatibleIds([]);
  }, [setViewport]);

  /** Encuadra solo los nodos indicados (normalmente uno: el recién añadido), sin fit a todo el grafo */
  const fitViewToNodeIds = useCallback(
    (ids: string[], duration = 650) => {
      const unique = [...new Set(ids.filter(Boolean))];
      if (unique.length === 0) return;
      setTimeout(() => {
        void fitView({
          nodes: unique.map((id) => ({ id })) as Node[],
          padding: FIT_VIEW_PADDING,
          duration,
        });
      }, 60);
    },
    [fitView]
  );

  // ── Window Viewer Mode ─────────────────────────────────────────────────────
  const [windowMode, setWindowMode] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false); // triggered after auth
  const [showFinalOut, setShowFinalOut] = useState(false); // appears 3s after welcome splash ends

  // On mount: position viewport so FINAL node is ~50px from right, vertically centered
  useEffect(() => {
    const t = setTimeout(() => {
      const zoom = 0.7;
      const nodeX = 1400, nodeY = 200, nodeW = 260, nodeH = 180;
      const marginRight = 50;
      // Screen position of node's right edge = window.innerWidth - marginRight
      const vpX = (window.innerWidth - marginRight) - (nodeX + nodeW) * zoom;
      const vpY = window.innerHeight / 2 - (nodeY + nodeH / 2) * zoom;
      setViewport({ x: vpX, y: vpY, zoom });
    }, 50);
    // Welcome disappears via onAnimationEnd (not setTimeout) for smooth fade-out
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  const [viewerHeight, setViewerHeight] = useState(500); // safe SSR default; updated on mount
  const viewerHeightRef = useRef(500);
  const windowModeRef = useRef(false);
  useEffect(() => { viewerHeightRef.current = viewerHeight; }, [viewerHeight]);
  useEffect(() => { windowModeRef.current = windowMode; }, [windowMode]);

  // Compute canvas position for FINAL node so handles align with visual dots
  const syncFinalNode = useCallback((vp: { x: number; y: number; zoom: number }) => {
    let screenX: number, screenY: number;
    if (windowModeRef.current) {
      // viewerMode: bottom-center of the viewer panel
      screenX = window.innerWidth / 2 - 16;
      screenY = viewerHeightRef.current - 48;
    } else {
      // Card: right:50, width:130 → card left edge = innerWidth - 50 - 130 = innerWidth - 180
      // Dots: left:-18 from card edge → dot screen X = innerWidth - 180 - 18 = innerWidth - 198
      // Card top = innerHeight/2 - 50 (centered, height=100)
      // Dot img: cardTop + 100*0.35 = innerHeight/2 - 50 + 35 = innerHeight/2 - 15
      // Dot vid: cardTop + 100*0.65 = innerHeight/2 - 50 + 65 = innerHeight/2 + 15
      // Node placed at midpoint between both dots:
      screenX = window.innerWidth - 198; // dot X
      screenY = window.innerHeight / 2;  // midpoint between img(-15) and vid(+15)
    }
    const canvasX = (screenX - vp.x) / vp.zoom;
    const canvasY = (screenY - vp.y) / vp.zoom;
    setNodes((prev: any[]) => prev.map((n: any) =>
      n.id === FINAL_NODE_ID
        ? { ...n, position: { x: canvasX, y: canvasY }, data: { ...(n.data || {}), vpZoom: vp.zoom } }
        : n
    ));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Keep live refs in sync with React state for snapshot access
  useEffect(() => { liveNodesRef.current = nodes; }, [nodes]);
  useEffect(() => { liveEdgesRef.current = edges; }, [edges]);

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

  // Move FINAL node to viewer bottom in windowMode; restore on close
  const savedFinalPosition = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    setNodes((prev: any[]) =>
      prev.map((n: any) => {
        if (n.id !== FINAL_NODE_ID) return n;
        if (windowMode) {
          // Save original position
          savedFinalPosition.current = { x: n.position.x, y: n.position.y };
          // Map viewer bottom-center to canvas coords
          const canvasPos = screenToFlowPosition({
            x: window.innerWidth / 2 - 16,
            y: viewerHeight - 40,
          });
          return {
            ...n,
            position: canvasPos,
            style: { ...(n.style || {}), opacity: 1, pointerEvents: 'auto' },
            data: { ...(n.data || {}), viewerMode: true },
          };
        } else {
          // Restore original position
          const restored = savedFinalPosition.current || n.position;
          return {
            ...n,
            position: restored,
            style: { ...(n.style || {}), opacity: 1, pointerEvents: 'auto' },
            data: { ...(n.data || {}), viewerMode: false },
          };
        }
      })
    );
  }, [windowMode, viewerHeight, screenToFlowPosition]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track final output media for the viewer panel
  const finalMedia = useMemo(() => {
    const imgEdge = edges.find((e: any) => e.target === FINAL_NODE_ID && e.targetHandle === 'image');
    const vidEdge = edges.find((e: any) => e.target === FINAL_NODE_ID && e.targetHandle === 'video');
    const vidNode = vidEdge ? nodes.find((n: any) => n.id === vidEdge.source) : null;
    const imgNode = imgEdge ? nodes.find((n: any) => n.id === imgEdge.source) : null;
    const value = (typeof vidNode?.data?.value === 'string' ? vidNode.data.value : null) ||
                  (typeof imgNode?.data?.value === 'string' ? imgNode.data.value : null);
    const type = vidNode?.data?.value ? 'video' : 'image';
    return { value, type } as { value: string | null; type: 'image' | 'video' };
  }, [nodes, edges]);

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

  // Listen for toggle-final-window events from the FinalOutputNode button
  useEffect(() => {
    const handler = () => setWindowMode(prev => !prev);
    window.addEventListener('toggle-final-window', handler);
    return () => window.removeEventListener('toggle-final-window', handler);
  }, []); // toggle-final-window listener

  // FINAL OUT overlay is hidden whenever we're inside a nested space
  const isInsideNestedSpace = navigationStack.length > 0;

  // Initialize FINAL node on empty canvas (first ever use, no project loaded)
  useEffect(() => {
    setNodes(prev => {
      if (prev.some((n: any) => n.id === FINAL_NODE_ID)) return prev;
      return [...prev, {
        id: FINAL_NODE_ID,
        type: 'finalOutput',
        position: { x: 1400, y: 200 },
        data: { label: 'FINAL OUT' },
        deletable: false,
        draggable: false,
      }];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set real viewerHeight once mounted on client
  useEffect(() => {
    setViewerHeight(Math.max(Math.round(window.innerHeight * 0.5), 400));
  }, []);

  const MAX_HISTORY = 20;
  const historyRef = useRef<Array<{ nodes: any[]; edges: any[] }>>([]);
  const futureRef  = useRef<Array<{ nodes: any[]; edges: any[] }>>([]);
  // Ref holding LIVE nodes/edges so snapshot can access them synchronously
  const liveNodesRef = useRef<any[]>(initialNodes);
  const liveEdgesRef = useRef<any[]>(initialEdges);

  // takeSnapshot: call BEFORE making a change so we record the pre-change state.
  // This replaces the old pushHistory(newState) pattern — call it before setNodes/setEdges.
  const takeSnapshot = useCallback(() => {
    historyRef.current = [
      ...historyRef.current.slice(-(MAX_HISTORY - 1)),
      { nodes: [...liveNodesRef.current], edges: [...liveEdgesRef.current] },
    ];
    futureRef.current = []; // any new action clears redo stack
  }, []);

  // Keep refs in sync whenever React re-renders with new nodes/edges
  // (We also use a legacy alias so old pushHistory call-sites still work without crash)
  const pushHistory = useCallback((ns: any[], es: any[]) => {
    // Legacy: some callers pass the NEW state — we store it but this is less accurate.
    // Prefer takeSnapshot() before mutations going forward.
    historyRef.current = [...historyRef.current.slice(-(MAX_HISTORY - 1)), { nodes: [...ns], edges: [...es] }];
    futureRef.current = [];
  }, []);

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    // Save current state to future so redo can restore it
    futureRef.current.unshift({ nodes: [...liveNodesRef.current], edges: [...liveEdgesRef.current] });
    const prev = historyRef.current.pop()!;
    setNodes([...prev.nodes]);
    setEdges([...prev.edges]);
  }, [setNodes, setEdges]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    // Save current state to history before jumping forward
    historyRef.current = [
      ...historyRef.current.slice(-(MAX_HISTORY - 1)),
      { nodes: [...liveNodesRef.current], edges: [...liveEdgesRef.current] },
    ];
    const next = futureRef.current.shift()!;
    setNodes([...next.nodes]);
    setEdges([...next.edges]);
  }, [setNodes, setEdges]);

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
      enhancer:     { prompt: ['p0','p1','p2','p3','p4','p5','p6','p7','p8','p9','p10','p11','p12','p13','p14','p15'] },
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
      const nodesToConnect = type === 'spaceOutput'
        ? [selectedNodes.reduce((prev, cur) =>
            (cur.position.x > prev.position.x || (cur.position.x === prev.position.x && cur.position.y > prev.position.y))
              ? cur : prev
          )]
        : selectedNodes;

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

    let position = { x: center.x - 160, y: center.y - 120 };
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
        position = computeLibraryDropPosition(anchor, type, plan);
      }
    }

    const newNode = {
      id: newId,
      type,
      position,
      data: { label: '', ...extraData },
    };

    takeSnapshot(); // snapshot BEFORE adding node
    setNodes(nds => {
      const next = [...nds, newNode];
      return next;
    });
    // Delay edge render so nodes with dynamic handles (Enhancer, etc.)
    // have time to mount all their Handle components before ReactFlow draws curves.
    setTimeout(() => {
      setEdges(es => [
        ...es.filter((e: any) => !edgesToRemove.has(e.id)),
        ...autoEdges,
      ]);
    }, 50);

    if (autoEdges.length > 0) {
      setTimeout(() => {
        fitViewToNodeIds([newId], 700);
      }, 100);
    }
  }, [screenToFlowPosition, nodes, edges, setNodes, setEdges, pushHistory, takeSnapshot, fitViewToNodeIds]);


  // ── Node click: global z-order counter — each click brings that node above all others
  // Every previously clicked node keeps its own relative position in the stack.
  const onNodeClick = useCallback((_evt: React.MouseEvent, node: any) => {
    lastClickedRef.current = (lastClickedRef.current ?? 0) + 1;
    const nextZ = lastClickedRef.current;
    setNodes(nds => nds.map(n =>
      n.id === node.id
        ? { ...n, style: { ...n.style, zIndex: nextZ } }
        : n
    ));
  }, [setNodes]);

  // ── Auto-layout (A key) ──────────────────────────────────────────────────

  const autoLayout = useCallback(() => {
    const COL_GAP = 560; // horizontal distance between columns (flow units)
    const ROW_GAP = 360; // vertical distance between rows

    const toArrange = nodes.some(n => n.selected)
      ? nodes.filter(n => n.selected)
      : [...nodes];

    const ids = new Set(toArrange.map(n => n.id));

    // Build adjacency: only edges between nodes being arranged
    const inCount: Record<string, number> = {};
    const children: Record<string, string[]> = {};
    for (const n of toArrange) { inCount[n.id] = 0; children[n.id] = []; }

    for (const e of edges) {
      if (ids.has(e.source) && ids.has(e.target)) {
        inCount[e.target] = (inCount[e.target] || 0) + 1;
        children[e.source].push(e.target);
      }
    }

    // Kahn's algorithm — assign each node to a column (pass)
    const col: Record<string, number> = {};
    let queue = toArrange.filter(n => inCount[n.id] === 0).map(n => n.id);
    queue.forEach(id => { col[id] = 0; });

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

    // Nodes not reached by Kahn (isolated / cycles) → put after last column
    const maxCol = Math.max(0, ...Object.values(col));
    for (const n of toArrange) {
      if (col[n.id] === undefined) col[n.id] = maxCol + 1;
    }

    // Assign row positions within each column
    const colRows: Record<number, number> = {};
    const positioned: Record<string, { x: number; y: number }> = {};

    // Sort toArrange so nodes in same column are ordered predictably
    const sorted = [...toArrange].sort((a, b) => (col[a.id] ?? 0) - (col[b.id] ?? 0));
    for (const n of sorted) {
      const c = col[n.id] ?? 0;
      const r = colRows[c] ?? 0;
      positioned[n.id] = { x: c * COL_GAP, y: r * ROW_GAP };
      colRows[c] = r + 1;
    }

    // Apply positions (don't touch nodes not being arranged)
    takeSnapshot(); // snapshot before layout
    setNodes(nds => nds.map(n =>
      positioned[n.id]
        ? { ...n, position: positioned[n.id] }
        : n
    ));

    setTimeout(() => fitView({ padding: FIT_VIEW_PADDING, duration: 600 }), 50);
  }, [nodes, edges, setNodes, pushHistory, takeSnapshot, fitView]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (typing) return;

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      // Ctrl+D — duplicate selected nodes
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setNodes(nds => {
          const selected = nds.filter(n => n.selected);
          if (selected.length === 0) return nds;
          const clones = selected.map(n => ({
            ...n,
            id: `${n.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            position: { x: n.position.x + 30, y: n.position.y + 30 },
            selected: true,
            data: { ...n.data },
          }));
          const next = [...nds.map(n => ({ ...n, selected: false })), ...clones];
          pushHistory(next, edges);
          return next;
        });
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;


      switch (e.key.toLowerCase()) {
        // ── Ingesta ──────────────────────────────────────────────────────
        case 'p': addNodeAtCenter('promptInput'); break;
        case 'm': addNodeAtCenter('mediaInput'); break;
        case 'b': addNodeAtCenter('background'); break;
        case 'u': addNodeAtCenter('urlImage'); break;
        // ── Inteligencia ─────────────────────────────────────────────────
        case 'n': addNodeAtCenter('nanoBanana'); break;
        case 'd': addNodeAtCenter('mediaDescriber'); break;
        case 'h': addNodeAtCenter('enhancer'); break;
        case 'g': addNodeAtCenter('grokProcessor'); break;
        case 'r': addNodeAtCenter('backgroundRemover'); break;
        case 'v': addNodeAtCenter('geminiVideo'); break;
        // ── Lógica ───────────────────────────────────────────────────────
        case 'q': addNodeAtCenter('concatenator'); break;
        case 's': addNodeAtCenter('space', { label: 'Space', hasInput: true, hasOutput: true }); break;
        case 'i': addNodeAtCenter('spaceInput'); break;
        case 'o': addNodeAtCenter('spaceOutput'); break;
        // ── Composición ──────────────────────────────────────────────────
        case 'c': addNodeAtCenter('imageComposer'); break;
        case 'l': addNodeAtCenter('imageComposer'); break;   // alias
        case 'e': addNodeAtCenter('imageExport'); break;
        case 't': addNodeAtCenter('textOverlay'); break;
        case 'w': addNodeAtCenter('painter'); break;

        case 'x': addNodeAtCenter('crop'); break;
        case 'z': addNodeAtCenter('bezierMask'); break;
        // ── Canvas actions ───────────────────────────────────────────────
        case 'f': fitView({ padding: FIT_VIEW_PADDING, duration: 800 }); break;
        case 'a': autoLayout(); break;
        default: break;
      }

    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [addNodeAtCenter, undo, redo, fitView, autoLayout]);

  
  // ── Track last-clicked node for persistent z-index ──────────────────────
  const lastClickedRef = useRef<number>(0); // global z-order counter

  // ── Track Shift key for canvas pan ──────────────────────────────────────
  const [shiftHeld, setShiftHeld] = useState(false);
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(true); };
    const onUp   = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(false); };
    const onBlur = () => setShiftHeld(false); // safety: reset if window loses focus
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // ── Allow canvas zoom from anywhere (including over inputs / textareas) ──
  // Problem: ReactFlow's zoom listener is on .react-flow__pane, which is a
  // DOM SIBLING of .react-flow__nodes — events from inside nodes don't bubble
  // to it. So we must manually call setViewport when wheel fires over inputs.
  const viewportRef = useRef({ zoom: 1, x: 0, y: 0 });
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      const isInput =
        (tag === 'INPUT' && (target as HTMLInputElement).type !== 'submit') ||
        tag === 'TEXTAREA';
      if (!isInput) return;

      // Only act when inside the ReactFlow canvas (not the sidebar etc.)
      const rfRoot = document.querySelector('.react-flow__renderer');
      if (!rfRoot || !rfRoot.contains(target)) return;

      e.preventDefault(); // stop scroll / value-change

      // Manually compute new zoom centered on the mouse position
      const SENSITIVITY = 0.001;
      const vp = viewportRef.current;
      const rawScale = Math.pow(0.998, e.deltaY);
      const newZoom  = Math.min(4, Math.max(0.1, vp.zoom * rawScale));
      if (Math.abs(newZoom - vp.zoom) < 0.0001) return;

      const rect = rfRoot.getBoundingClientRect();
      const mx   = e.clientX - rect.left;
      const my   = e.clientY - rect.top;
      const ratio = newZoom / vp.zoom;
      const newX  = mx - ratio * (mx - vp.x);
      const newY  = my - ratio * (my - vp.y);

      const next = { x: newX, y: newY, zoom: newZoom };
      viewportRef.current = next;
      setViewport(next);
    };
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => window.removeEventListener('wheel', onWheel, { capture: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setViewport]);

  // Keep viewportRef in sync with ReactFlow viewport changes (drag, pinch, etc.)
  // so our manual zoom starts from the correct position.
  const onMoveHandler = useCallback((evt: any, vp: any) => {
    viewportRef.current = vp;
    syncFinalNode(vp);
  }, [syncFinalNode]);


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
      if (type.includes('composer') || type.includes('concatenator') || type.includes('batch') || (type === 'space' && n.id !== 'in' && n.id !== 'out')) {
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
    // Update every parent space node in the map that points to this space (Upward)
    Object.keys(newMap).forEach(key => {
        if (newMap[key].nodes) {
            newMap[key].nodes = newMap[key].nodes.map((n: any) => {
                if (n.type === 'space' && n.data.spaceId === currentId) {
                    return { 
                        ...n, 
                        data: { 
                            ...n.data, 
                            label: structure.label,
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

    let targetSpaceId = spaceId;
    if (!targetSpaceId) {
      targetSpaceId = `space_${Date.now()}`;
      // Initialize if new
      updatedSpacesMap[targetSpaceId] = {
        id: targetSpaceId,
        name: `Nested Space`,
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
      setSpacesMap(updatedSpacesMap);
      setNodes([...targetSpace.nodes]);
      setEdges([...(targetSpace.edges || [])]);
      setNavigationStack(prev => [...prev, currentId]);
      setActiveSpaceId(targetSpaceId);
      setTimeout(() => fitView({ padding: FIT_VIEW_PADDING, duration: 800 }), 100);
    }
  }, [activeSpaceId, nodes, edges, spacesMap, setNodes, setEdges, fitView, syncCurrentSpaceState]);

  const handleGoBack = useCallback(() => {
    if (navigationStack.length === 0) return;
    
    const newStack = [...navigationStack];
    const parentSpaceId = newStack.pop() as string;
    const currentId = activeSpaceId;
    
    // 1. Sync current state AND propagate up
    const { newMap: updatedSpacesMap } = syncCurrentSpaceState(nodes, edges, spacesMap, currentId);

    // 2. Switch to parent
    const parentSpace = updatedSpacesMap[parentSpaceId];
    if (parentSpace) {
      setSpacesMap(updatedSpacesMap);
      setNodes([...parentSpace.nodes]);
      setEdges([...(parentSpace.edges || [])]);
      setActiveSpaceId(parentSpaceId);
      setNavigationStack(newStack);
      setTimeout(() => fitView({ padding: FIT_VIEW_PADDING, duration: 800 }), 100);
    }
  }, [activeSpaceId, nodes, edges, spacesMap, navigationStack, setNodes, setEdges, fitView, syncCurrentSpaceState]);

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
      // Synchronize current nodes/edges to the active space in the map
      const structure = analyzeSpaceStructure(nodes, edges);
      const updatedSpacesMap = {
        ...spacesMap,
        [activeSpaceId]: {
          ...(spacesMap[activeSpaceId] || {}),
          id: activeSpaceId,
          nodes: [...nodes],
          edges: [...edges],
          outputType: structure.type,
          outputValue: structure.value,
          hasInput: structure.hasInput,
          hasOutput: structure.hasOutput,
          internalCategories: structure.internalCategories,
          updatedAt: new Date().toISOString()
        }
      };

      const projectToSave = {
        id: activeProjectId,
        name: nameToSave || currentName || 'Untitled Project',
        rootSpaceId: 'root', // Always 'root' now
        spaces: updatedSpacesMap,
        metadata: metadata
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
           setActiveSpaceId('root');
           setCurrentName(newest.name);
           setSpacesMap(newest.spaces);
        } else {
           setSpacesMap(updatedSpacesMap);
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
    // Migration/Normalization: Use project.rootSpaceId or default to 'root'
    const rootSpaceId = project.rootSpaceId || 'root';
    const rootSpace = project.spaces?.[rootSpaceId] || project.spaces?.['root'];
    
    if (!rootSpace) {
      console.error("Root space not found for project:", project.id);
      alert("Error: could not find the main space for this project.");
      return;
    }

    const makeFinalNode = (existingNodes: any[]) => {
      const hasFinal = existingNodes.some((n: any) => n.id === FINAL_NODE_ID);
      if (hasFinal) return existingNodes;
      const finalNode = {
        id: FINAL_NODE_ID,
        type: 'finalOutput',
        position: { x: 1400, y: 200 },
        data: { label: 'FINAL OUT' },
        deletable: false,
      };
      return [...existingNodes, finalNode];
    };

    setNodes(makeFinalNode([...(rootSpace.nodes || [])]));
    setEdges([...(rootSpace.edges || [])]);
    setActiveProjectId(project.id);
    setActiveSpaceId(rootSpaceId);
    setCurrentName(project.name);
    setSpacesMap(project.spaces);
    setMetadata(project.metadata || {});
    setNavigationStack([]); // Clear stack on new project load
    setShowLoadModal(false);
    
    // Smooth transition
    setTimeout(() => {
      fitView({ padding: FIT_VIEW_PADDING, duration: 800 });
    }, 100);
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

  const autoLayoutNodes = useCallback(() => {
    const nodeWidth = 350;
    const nodeHeight = 450;
    const paddingX = 250; // Increased from 100
    const paddingY = 150; // Increased from 50

    // 1. Build dependency map
    const incomingEdges: Record<string, string[]> = {};
    nodes.forEach(n => incomingEdges[n.id] = []);
    edges.forEach(e => {
      if (incomingEdges[e.target]) incomingEdges[e.target].push(e.source);
    });

    // 2. Identify layers (Sugiyama-style)
    const layers: Record<string, number> = {};
    const getLayer = (nodeId: string, visited = new Set()): number => {
      if (layers[nodeId] !== undefined) return layers[nodeId];
      if (visited.has(nodeId)) return 0; // Prevent circularity crashes
      
      visited.add(nodeId);
      const deps = incomingEdges[nodeId] || [];
      if (deps.length === 0) {
        layers[nodeId] = 0;
        return 0;
      }
      
      const maxDepLayer = Math.max(...deps.map(d => getLayer(d, visited)));
      layers[nodeId] = maxDepLayer + 1;
      return layers[nodeId];
    };

    nodes.forEach(n => getLayer(n.id));

    // 3. Group nodes by layer
    const grouped: Record<number, string[]> = {};
    Object.entries(layers).forEach(([id, layer]) => {
      if (!grouped[layer]) grouped[layer] = [];
      grouped[layer].push(id);
    });

    // 4. Calculate new positions
    const newNodes = nodes.map(node => {
      const layer = layers[node.id] || 0;
      const indexInLayer = grouped[layer].indexOf(node.id);
      
      // Vertical centering: find total height of this layer
      const layerNodes = grouped[layer].length;
      const totalLayerHeight = layerNodes * nodeHeight + (layerNodes - 1) * paddingY;
      const startY = -totalLayerHeight / 2;

      return {
        ...node,
        position: {
          x: layer * (nodeWidth + paddingX),
          y: startY + indexInLayer * (nodeHeight + paddingY)
        }
      };
    });

    setNodes(newNodes);
    setTimeout(() => fitView({ padding: FIT_VIEW_PADDING, duration: 800 }), 100);
  }, [nodes, edges, setNodes, fitView]);

  const onGenerateAssistant = async (prompt: string) => {
    // Client-side clear detection — no AI needed for simple canvas reset
    const clearKeywords = ['clear', 'limpiar', 'reset', 'borrar', 'vaciar', 'limpia', 'elimina todo', 'nueva pizarra', 'start over', 'new canvas'];
    if (clearKeywords.some(kw => prompt.toLowerCase().includes(kw))) {
      // Keep the permanent FINAL node when clearing
      setNodes(prev => prev.filter((n: any) => n.id === FINAL_NODE_ID));
      setEdges([]);
      return;
    }

    setIsGeneratingAssistant(true);
    try {
      const res = await fetch('/api/spaces/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt,
          currentNodes: nodes,
          currentEdges: edges
        })
      });
      const data = await readResponseJson<{ nodes?: Node[]; edges?: Edge[] }>(
        res,
        'POST /api/spaces/assistant'
      );
      
      if (data?.nodes && data?.edges) {
        // Validation: Ensure all nodes have a valid position {x, y}
        const validatedNodes = data.nodes.map((n: any) => ({
          ...n,
          position: n.position || { x: 0, y: 0 } // Fail-safe default
        }));

        setNodes(validatedNodes);
        setEdges(data.edges);
        
        // Smooth transition to center generated workflow
        setTimeout(() => {
          fitView({ padding: FIT_VIEW_PADDING, duration: 800 });
        }, 100);
      }
    } catch (err) {
      console.error('Assistant Generation error:', err);
      alert('AI Assistant failed to generate the space. Try again.');
    } finally {
      setIsGeneratingAssistant(false);
    }
  };


  const onNodeDragStop = useCallback((_: any, __: any, _ns: any[]) => {
    // History snapshot was already taken at drag START (via onNodeDragStart)
    // Nothing to do here for history — positions are already in liveRef
  }, []);

  const onNodeDragStart = useCallback(() => {
    takeSnapshot(); // capture state when drag begins, before positions change
  }, [takeSnapshot]);

  const onConnect: OnConnect = useCallback(
    (params) => {
      const edgeId = `e-${params.source}-${params.target}-${params.sourceHandle || 'def'}-${params.targetHandle || 'def'}-${Math.random().toString(36).substring(2, 6)}`;
      setEdges((eds) => {
        const next = addEdge({ ...params, id: edgeId, type: 'buttonEdge' }, eds);
        pushHistory(nodes, next);
        return next;
      });
      fitViewToNodeIds([params.target], 600);
    },
    [setEdges, nodes, pushHistory, fitViewToNodeIds]
  );

  // ── Handle→Node type suggestions ─────────────────────────────────────────
  // When a handle drag ends on the canvas, create the most useful connected node.
  // key: `${handleDataType}:${fromDirection}` → nodeType to create
  const HANDLE_DROP_MAP: Record<string, string> = {
    'prompt:source':  'enhancer',       // dragging OUT a prompt → enhancer consumes it
    'prompt:target':  'promptInput',    // dragging INTO a prompt input → provide a prompt
    'image:source':   'imageExport',    // dragging OUT an image → export or compose
    'image:target':   'nanoBanana',     // dragging INTO an image input → generate one
    'video:source':   'imageExport',
    'video:target':   'geminiVideo',
    'mask:source':    'imageComposer',
    'mask:target':    'backgroundRemover',
    'url:source':     'mediaDescriber',
    'url:target':     'mediaInput',
    'audio:source':   'imageExport',
    'audio:target':   'mediaInput',
  };

  const onConnectEnd = useCallback((event: any, connectionState: any) => {
    // Only act when drop landed on the pane (no valid target node found)
    if (connectionState?.isValid) return;

    const fromNodeId   = connectionState?.fromNode?.id;
    const fromHandleId = connectionState?.fromHandle?.id;
    const fromType     = connectionState?.fromHandle?.type; // 'source' | 'target'
    if (!fromNodeId || !fromHandleId) return;

    // Check if this handle ALREADY has a connection — if so, skip
    const alreadyConnected = edges.some((e: any) => {
      if (fromType === 'source') return e.source === fromNodeId && e.sourceHandle === fromHandleId;
      return e.target === fromNodeId && e.targetHandle === fromHandleId;
    });
    if (alreadyConnected) return;

    // Determine handle data type from NODE_REGISTRY
    const srcNodeType = nodes.find((n: any) => n.id === fromNodeId)?.type;
    const meta = srcNodeType ? NODE_REGISTRY[srcNodeType] : null;
    if (!meta) return;

    const handleMeta =
      fromType === 'source'
        ? meta.outputs.find((o: any) => o.id === fromHandleId)
        : meta.inputs.find((i: any) => i.id === fromHandleId);
    if (!handleMeta) return;

    const lookupKey  = `${handleMeta.type}:${fromType}`;
    const newType    = HANDLE_DROP_MAP[lookupKey];
    if (!newType) return;

    // Convert mouse position to flow coords
    const clientX = event.clientX ?? event.changedTouches?.[0]?.clientX ?? 0;
    const clientY = event.clientY ?? event.changedTouches?.[0]?.clientY ?? 0;
    const position  = screenToFlowPosition({ x: clientX, y: clientY });
    const newNodeId = `${newType}_${Date.now()}`;
    const newNode   = {
      id:       newNodeId,
      type:     newType,
      position: { x: position.x - 160, y: position.y - 80 },
      data:     { label: '' },
    };

    const edgeId = `ae-${fromNodeId}-${newNodeId}-${fromHandleId}-${Date.now()}`;
    const newMeta  = NODE_REGISTRY[newType];

    // Pick the connecting handle on the new node
    let newHandle: string | undefined;
    if (fromType === 'source') {
      // new node should receive: find its input matching the handle type
      newHandle = newMeta?.inputs.find((i: any) => i.type === handleMeta.type)?.id;
    } else {
      // new node should provide: find its output matching the handle type
      newHandle = newMeta?.outputs.find((o: any) => o.type === handleMeta.type)?.id;
    }
    if (!newHandle) return;

    const newEdge = {
      id:           edgeId,
      source:       fromType === 'source' ? fromNodeId  : newNodeId,
      sourceHandle: fromType === 'source' ? fromHandleId : newHandle,
      target:       fromType === 'source' ? newNodeId   : fromNodeId,
      targetHandle: fromType === 'source' ? newHandle   : fromHandleId,
      type:         'buttonEdge',
      animated:     true,
    };

    setNodes((nds: any) => {
      const next = [...nds, newNode];
      pushHistory(next, [...edges, newEdge]);
      return next;
    });
    // Delay edge slightly so ReactFlow's drag-cancel doesn't wipe it
    setTimeout(() => {
      setEdges((eds: any) => [...eds, newEdge]);
      fitViewToNodeIds([newNodeId], 600);
    }, 30);
  }, [edges, nodes, screenToFlowPosition, setNodes, setEdges, pushHistory, fitViewToNodeIds]);



  const onPaneContextMenu = useCallback((event: any) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  }, []);

  const onNodeContextMenu = useCallback((event: any, node: any) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
  }, []);

  const deleteNode = useCallback((id: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== id));
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
    setContextMenu(null);
    setTimeout(() => {
      fitView({ padding: FIT_VIEW_PADDING, duration: 650 });
    }, 80);
  }, [setNodes, setEdges, fitView]);

  const duplicateNode = useCallback((id: string) => {
    const node = nodes.find((n) => n.id === id);
    if (!node) return;

    const newNode = {
      ...node,
      id: `${node.type}_${Date.now()}`,
      position: { x: node.position.x + 20, y: node.position.y + 20 },
      selected: false,
    };

    setNodes((nds) => [...nds, newNode]);
    setContextMenu(null);
  }, [nodes, setNodes]);

  const groupSelectedToSpace = useCallback(() => {
    const selectedNodes = nodes.filter(n => n.selected);
    if (selectedNodes.length === 0) {
      setContextMenu(null);
      return;
    }

    const selectedIds = new Set(selectedNodes.map(n => n.id));
    const internalEdges = edges.filter(e => selectedIds.has(e.source) && selectedIds.has(e.target));
    
    const spaceId = `space_group_${Date.now()}`;
    const minX = Math.min(...selectedNodes.map(n => n.position.x));
    const minY = Math.min(...selectedNodes.map(n => n.position.y));
    const maxX = Math.max(...selectedNodes.map(n => n.position.x));
    const maxY = Math.max(...selectedNodes.map(n => n.position.y));
    const avgX = (minX + maxX) / 2;
    const avgY = (minY + maxY) / 2;

    // Create the new space
    const newSpacesMap = { ...spacesMap };
    
    // Offset nodes to be centered in the new space
    const nestedNodes = selectedNodes.map(n => ({
      ...n,
      position: { x: n.position.x - minX + 200, y: n.position.y - minY + 200 },
      selected: false
    }));

    // Find the rightmost node to auto-connect to SpaceOutput
    const lastNode = nestedNodes.reduce((prev: any, cur: any) =>
      (cur.position.x > prev.position.x || (cur.position.x === prev.position.x && cur.position.y > prev.position.y))
        ? cur : prev
    );
    const lastNodeMeta = NODE_REGISTRY[lastNode.type];
    const lastNodeOutput = lastNodeMeta?.outputs?.[0];

    // Build auto-edge FIRST so analyzeSpaceStructure can see it
    const autoOutEdge = lastNodeOutput ? [{
      id: `nested_auto_out_${Date.now()}`,
      source: lastNode.id,
      sourceHandle: lastNodeOutput.id,
      target: 'out',
      targetHandle: 'in',
      type: 'buttonEdge',
      animated: true,
    }] : [];

    const allInternalEdges = [
      ...internalEdges.map((e: any) => ({ ...e, id: `nested_${e.id}` })),
      ...autoOutEdge,
    ];

    // NOW analyze structure with the complete edge set
    const virtualOutNode = { id: 'out', type: 'spaceOutput', data: {} };
    const structure = analyzeSpaceStructure([...nestedNodes, virtualOutNode], allInternalEdges);

    // Output type and value come from last node directly (most reliable)
    const autoOutputType = lastNodeOutput?.type || structure.type;
    const autoOutputValue = lastNode.data?.value || structure.value || null;

    newSpacesMap[spaceId] = {
      id: spaceId,
      name: `Grouped Space`,
      nodes: [
        { id: 'in', type: 'spaceInput', position: { x: 50, y: 250 }, data: { label: 'Input' } },
        { id: 'out', type: 'spaceOutput', position: { x: Math.max(...nestedNodes.map((n: any) => n.position.x)) + 320, y: lastNode.position.y }, data: { label: 'Output', outputType: autoOutputType } },
        ...nestedNodes
      ],
      edges: allInternalEdges,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      outputType: autoOutputType,
      outputValue: autoOutputValue,
      hasInput: structure.hasInput,
      hasOutput: true,
      internalCategories: structure.internalCategories
    };

    // Replace grouped nodes with a single space node
    const newNode = {
      id: `node_space_${Date.now()}`,
      type: 'space',
      position: { x: avgX, y: avgY },
      data: { 
        spaceId, 
        label: structure.label || 'Nested Group',
        hasInput: true,
        hasOutput: true,
        outputType: autoOutputType,
        value: autoOutputValue,
        internalCategories: structure.internalCategories
      },
    };


    const remainingNodes = nodes.filter(n => !selectedIds.has(n.id));
    const remainingEdges = edges.filter(e => !selectedIds.has(e.source) && !selectedIds.has(e.target));

    setNodes([...remainingNodes, newNode]);
    setEdges(remainingEdges);
    setSpacesMap(newSpacesMap);
    setContextMenu(null);
  }, [nodes, edges, spacesMap, setNodes, setEdges]);

  const flowNodes = useMemo(() => {
    const compatSet = new Set(libraryCompatibleIds);
    return nodes.map((n: any) => {
      const isCompat = compatSet.has(n.id);
      const isHover = n.id === libraryDropTargetId;
      const cls = [n.className, isCompat && 'library-drop-compatible', isHover && 'library-drop-highlight']
        .filter(Boolean)
        .join(' ');
      return {
        ...n,
        className: cls || undefined,
      };
    });
  }, [nodes, libraryDropTargetId, libraryCompatibleIds]);

  const isValidConnection = useCallback((connection: any) => {
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);
    if (!sourceNode || !targetNode) return false;
    return areNodesConnectable(sourceNode, targetNode, connection);
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
      const hit = findTopNodeUnderFlowPoint(p, nodes, {
        excludeIds: new Set([FINAL_NODE_ID]),
      });
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

      const reactFlowType =
        event.dataTransfer.getData('application/reactflow') || libraryDragTypeRef.current || '';
      const snapTargetId = libraryDropTargetIdRef.current;

      libraryDragTypeRef.current = null;
      libraryDropTargetIdRef.current = null;
      setLibraryDropTargetId(null);
      setLibraryCompatibleIds([]);

      const files = Array.from(event.dataTransfer.files);

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Handle Native File Drops
      if (files.length > 0) {
        libraryCanvasDropSucceededRef.current = true;
        files.forEach(async (file, index) => {
          const type = (name: string, mime: string): any => {
            if (mime.startsWith('video/') || name.match(/\.(mp4|mov|avi|webm|mkv)$/i)) return 'video';
            if (mime.startsWith('image/') || name.match(/\.(jpg|jpeg|png|webp|avif|gif|svg)$/i)) return 'image';
            if (mime.startsWith('audio/') || name.match(/\.(mp3|wav|ogg|flac|m4a)$/i)) return 'audio';
            if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
            if (mime.startsWith('text/') || name.endsWith('.txt')) return 'txt';
            return 'url';
          };

          const fileType = type(file.name, file.type);
          const nodeId = `node_${Date.now()}_${index}_${Math.floor(Math.random() * 1000)}`;
          
          const newNode = {
            id: nodeId,
            type: 'mediaInput',
            position: { x: position.x + (index * 20), y: position.y + (index * 20) },
            data: { 
              value: '', 
              type: fileType, 
              label: file.name,
              loading: true,
              source: 'upload'
            },
          };

          setNodes((nds) => [...nds, newNode]);

          // Trigger Upload
          const formData = new FormData();
          formData.append('file', file);
          try {
            const res = await fetch('/api/runway/upload', { method: 'POST', body: formData });
            const json = await readResponseJson<{ url?: string; s3Key?: string }>(
              res,
              'POST /api/runway/upload'
            );
            if (json?.url) {
              setNodes((nds) => nds.map((n) => n.id === nodeId ? {
                ...n,
                data: {
                  ...n.data,
                  value: json.url,
                  s3Key: json.s3Key, // Store physical key for cleanup
                  loading: false,
                  metadata: {
                    size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
                    resolution: (fileType === 'video' || fileType === 'image') ? 'Auto-detected' : '-',
                    codec: file.type.split('/')[1]?.toUpperCase() || 'RAW'
                  }
                }
              } : n));
            }
          } catch (err) {
            console.error("Auto-drop upload error:", err);
            setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, loading: false, error: true } } : n));
          }
        });
        setTimeout(() => {
          fitView({ padding: FIT_VIEW_PADDING, duration: 800 });
        }, 100);
        return;
      }

      // Handle Sidebar Drops
      if (!reactFlowType) return;

      const targetNode = snapTargetId ? nodes.find((n) => n.id === snapTargetId) : null;
      const plan =
        targetNode && snapTargetId
          ? findLibraryDropPlan(reactFlowType, targetNode, edges)
          : null;

      if (targetNode && plan && snapTargetId === targetNode.id) {
        libraryCanvasDropSucceededRef.current = true;
        const dropPos = computeLibraryDropPosition(targetNode, reactFlowType, plan);
        const newId = `node_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const newNode = {
          id: newId,
          type: reactFlowType,
          position: dropPos,
          data: { value: '', label: `${reactFlowType} node` },
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
          setEdges((eds: any) => {
            const nextE = addEdge(newEdge, eds);
            pushHistory(next, nextE);
            return nextE;
          });
          return next;
        });
        setTimeout(() => {
          fitViewToNodeIds([newId], 700);
        }, 100);
        setSidebarLockedCollapsed(true);
        return;
      }

      libraryCanvasDropSucceededRef.current = true;
      const newNode = {
        id: `node_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        type: reactFlowType,
        position,
        data: { value: '', label: `${reactFlowType} node` },
      };

      setNodes((nds) => [...nds, newNode]);
      setTimeout(() => {
        fitViewToNodeIds([newNode.id], 700);
      }, 100);
      setSidebarLockedCollapsed(true);
    },
    [screenToFlowPosition, setNodes, setEdges, nodes, edges, takeSnapshot, pushHistory, fitView, fitViewToNodeIds]
  );

  return (
    <div className="flex w-full h-full" ref={reactFlowWrapper} style={{ flexDirection: 'column' }}>

      {!windowMode && !isInsideNestedSpace && showFinalOut && (
        <div style={{
          position: 'fixed', right: 50, top: '50%', transform: 'translateY(-50%)',
          zIndex: 9997, width: 130, pointerEvents: 'auto', transition: 'opacity 0.5s ease',
        }}>
          {/* Connection handle indicators */}
          <div style={{ position:'absolute', left:-18, top:'35%', transform:'translateY(-50%)', display:'flex', alignItems:'center', gap:3, pointerEvents:'none' }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:'#ec4899', border:'2px solid white', boxShadow:'0 0 5px #ec4899' }} />
          </div>
          <div style={{ position:'absolute', left:-18, top:'65%', transform:'translateY(-50%)', display:'flex', alignItems:'center', gap:3, pointerEvents:'none' }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:'#f43f5e', border:'2px solid white', boxShadow:'0 0 5px #f43f5e' }} />
          </div>

          {/* Card */}
          <div style={{
            borderRadius: 14, overflow: 'hidden', position: 'relative',
            border: '2px solid rgba(251,191,36,0.6)',
            boxShadow: '0 12px 32px rgba(251,191,36,0.25)',
            background: finalMedia.value ? 'transparent' : 'rgba(20,16,8,0.95)',
            height: 100,
          }}>
            {/* Top bar */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '4px 6px',
              background: 'linear-gradient(to bottom,rgba(0,0,0,0.8) 0%,transparent 100%)',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background:'#fbbf24', boxShadow:'0 0 4px #fbbf24' }} />
                <span style={{ fontSize:7, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.1em', color:'#fcd34d' }}>Output</span>
              </div>
              <button
                onClick={() => setWindowMode(true)}
                title="Open viewer"
                style={{
                  display:'flex', alignItems:'center', justifyContent:'center',
                  padding:3, borderRadius:6, cursor:'pointer',
                  background:'rgba(251,191,36,0.2)', border:'1px solid rgba(251,191,36,0.4)',
                  color:'#fbbf24',
                }}
              >
                <Maximize2 size={9} />
              </button>
            </div>

            {/* Content */}
            {finalMedia.value ? (
              <>
                {finalMedia.type === 'video'
                  ? <video src={finalMedia.value} style={{ width:'100%', height:'100%', objectFit:'cover' }} loop muted />
                  : <img src={finalMedia.value} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="output" />
                }
                <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top,rgba(0,0,0,0.5) 0%,transparent 60%)', pointerEvents:'none' }} />
              </>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:4 }}>
                <Maximize size={16} style={{ color:'#fbbf24', opacity:0.5 }} strokeWidth={1.5} />
                <span style={{ fontSize:7, color:'rgba(251,191,36,0.5)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', textAlign:'center', lineHeight:1.3 }}>
                  Connect<br/>node
                </span>
              </div>
            )}
          </div>
        </div>
      )}


      {/* ── WELCOME SPLASH ─────────────────────────────────────────────────── */}
      {showWelcome && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 20000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
          animation: 'welcomeFade 4s ease forwards',
        }}
        onAnimationEnd={() => { setShowWelcome(false); setShowFinalOut(true); }}
        >
          <style>{`
            @keyframes welcomeFade {
              0%   { opacity: 0; transform: scale(0.94); }
              15%  { opacity: 1; transform: scale(1); }
              80%  { opacity: 1; transform: scale(1); }
              100% { opacity: 0; transform: scale(1.03); }
            }
          `}</style>
          <span style={{
            fontSize: 'clamp(48px,8vw,96px)',
            fontWeight: 900,
            letterSpacing: '-0.04em',
            color: 'transparent',
            backgroundImage: 'linear-gradient(135deg,#fff 0%,rgba(255,255,255,0.35) 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            userSelect: 'none',
          }}>
            Bienvenido
          </span>
        </div>
      )}

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
              onClick={() => setWindowMode(false)}
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
              background: finalMedia.value ? (finalMedia.type === 'video' ? '#f43f5e' : '#ec4899') : 'rgba(255,255,255,0.15)',
              border: `2px solid ${finalMedia.value ? (finalMedia.type === 'video' ? '#f43f5e' : '#ec4899') : 'rgba(255,255,255,0.2)'}`,
              boxShadow: finalMedia.value ? `0 0 10px ${finalMedia.type === 'video' ? 'rgba(244,63,94,0.6)' : 'rgba(236,72,153,0.6)'}` : 'none',
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
                <span className="text-amber-300 text-xs font-bold uppercase tracking-widest">No output yet — connect a node to FINAL OUT</span>
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
        <div style={{ position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 10003 }}>
          <Sidebar
            windowMode={windowMode}
            onLibraryDragStart={handleLibraryDragStart}
            onLibraryDragEnd={handleLibraryDragEnd}
            onAgentGenerate={!windowMode ? onGenerateAssistant : undefined}
            isAgentGenerating={isGeneratingAssistant}
            sidebarLockedCollapsed={sidebarLockedCollapsed}
            onSidebarStripMouseEnter={() => setSidebarLockedCollapsed(false)}
          />
        </div>
      )}
      <div className="flex-1 relative" onContextMenu={(e) => e.preventDefault()} style={{ marginLeft: 0 }}>
        <ReactFlow
          nodes={flowNodes}
          edges={edges}
          onNodesChange={(changes) => {
            // Guard: prevent deletion of the permanent FINAL output node
            const removals = changes.filter(c => c.type === 'remove');
            if (removals.length > 0) {
              // Snapshot BEFORE ReactFlow applies the deletion so undo can restore
              takeSnapshot();
            }
            const filtered = changes.filter(
              (c) => !(c.type === 'remove' && c.id === FINAL_NODE_ID)
            );
            onNodesChange(filtered);
            if (filtered.some((c) => c.type === 'remove')) {
              setTimeout(() => {
                fitView({ padding: FIT_VIEW_PADDING, duration: 650 });
              }, 80);
            }
          }}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
           onDrop={onDrop}
          onDragOver={onDragOver}
          onPaneContextMenu={onPaneContextMenu}
          onNodeContextMenu={onNodeContextMenu}
          onNodeClick={onNodeClick}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onConnectEnd={onConnectEnd}
          onMove={onMoveHandler}

          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          defaultViewport={{ x: -559, y: 134, zoom: 0.7 }}
          minZoom={0.05}
          maxZoom={4}
          proOptions={{ hideAttribution: true }}
          multiSelectionKeyCode="Shift"
          panOnDrag={!shiftHeld}
          selectionOnDrag={shiftHeld}
          selectionMode={SelectionMode.Partial}
          panOnScroll={false}

          className="spaces-canvas"


        >
          <Background color="#111" gap={40} size={1} />
          
          {/* Initial State Message */}
          {isAuthenticated && nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <span className="text-white/90 text-[14px] font-black uppercase tracking-[20px] animate-pulse drop-shadow-2xl">
                Hola
              </span>
            </div>
          )}
        </ReactFlow>

        {/* Password Overlay */}
        {!isAuthenticated && (
          <div className="fixed inset-0 z-[1000] bg-[#0a0a0a] flex flex-col items-center justify-center backdrop-blur-3xl overflow-hidden">
            {/* Ambient Background Glows */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px] animate-pulse delay-700" />
            
            <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-xl px-6">
               <div className="flex flex-col items-center gap-2 w-full max-w-sm">
                 <div className="flex flex-col items-center gap-1 mb-4">
                   {/* FOLDDER logo icon */}
                   <svg width="64" height="64" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
                     <path d="M4 6 Q4 2 8 2 L36 2 L50 16 L50 46 Q50 50 46 50 L8 50 Q4 50 4 46 Z" fill="#6C5CE7"/>
                     <path d="M36 2 L50 16 L36 16 Z" fill="rgba(0,0,0,0.22)"/>
                     <rect x="14" y="15" width="5" height="22" rx="2.5" fill="white"/>
                     <rect x="14" y="15" width="19" height="5" rx="2.5" fill="white"/>
                     <rect x="14" y="25.5" width="14" height="5" rx="2.5" fill="white"/>
                   </svg>
                 </div>
                 <h1 className="text-2xl font-black text-white uppercase tracking-[8px] mr-[-8px]">Foldder</h1>
                 <p className="text-[10px] font-bold text-violet-400 uppercase tracking-[4px] opacity-80">Studio Access</p>
               </div>

               <div className="w-full max-w-sm flex flex-col gap-4">
                 <div className="relative">
                   <input 
                     type="password"
                     autoFocus
                     maxLength={4}
                     value={passcode}
                     onChange={(e) => handleAuth(e.target.value)}
                     placeholder="••••"
                     className={`w-full bg-white/5 border ${passError ? 'border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.2)]' : 'border-white/10'} rounded-2xl py-5 text-center text-4xl font-black tracking-[1.5em] pl-[1.5em] text-white focus:outline-none focus:border-cyan-500/40 transition-all placeholder:text-white/10`}
                   />
                   {passError && (
                     <p className="absolute -bottom-6 left-0 w-full text-center text-[8px] font-black text-rose-500 uppercase tracking-widest animate-bounce">
                       Invalid passcode
                     </p>
                   )}
                 </div>
                 <p className="text-center text-[9px] font-medium text-white/30 uppercase tracking-[2px]">Enter security key to initialize studio</p>
               </div>

               <div className="w-full max-w-xl mx-auto mt-16 grid grid-cols-2 gap-6">
                 {AUTH_HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
                   <div
                     key={title}
                     className="flex items-start gap-3 opacity-80 hover:opacity-100 transition group"
                   >
                     <Icon
                       size={18}
                       strokeWidth={1.5}
                       className="shrink-0 text-purple-400 drop-shadow-[0_0_6px_rgba(168,85,247,0.6)] group-hover:scale-110 transition-transform duration-300"
                       aria-hidden
                     />
                     <div className="min-w-0 pt-0.5">
                       <p className="text-sm font-medium text-white">{title}</p>
                       <p className="text-xs text-white/40 leading-snug mt-1">{description}</p>
                     </div>
                   </div>
                 ))}
               </div>
            </div>

            <div className="absolute bottom-12 flex flex-col items-center gap-2 opacity-20 hover:opacity-100 transition-opacity">
               <div className="flex items-center gap-2">
                 <div className="w-1 h-1 rounded-full bg-cyan-500" />
                 <span className="text-[8px] font-bold text-white uppercase tracking-[4px]">Verified Infrastructure</span>
               </div>
            </div>
          </div>
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
                <div 
                  className="context-menu-item"
                  onClick={() => duplicateNode(contextMenu.nodeId!)}
                >
                  <NodeIconMono iconKey="concat" size={14} className="text-blue-400 opacity-90" /> Duplicate Node
                </div>
                <div 
                  className="context-menu-item danger"
                  onClick={() => deleteNode(contextMenu.nodeId!)}
                >
                  <NodeIconMono iconKey="matting" size={14} className="text-rose-400 opacity-90" /> Delete Node
                </div>
              </>
            ) : (
              <>
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
          <AgentHUD onGenerate={onGenerateAssistant} isGenerating={isGeneratingAssistant} windowMode />
        )}

        {/* Action HUD - Consolidating Breadcrumbs & Actions on the Right */}
        <div
          key="action-hud"
          className="flex items-center gap-4"
          style={windowMode
            ? { position: 'fixed', top: 8, right: 16, zIndex: 10002 }
            : { position: 'absolute', top: 24, right: 24, zIndex: 50 }}
        >
            {/* Navigation & Project Context (Clean Ghost Style) */}
            <div className="flex items-center gap-3 pr-2 border-r border-white/10">
              <button 
                onClick={handleGoBack}
                disabled={navigationStack.length === 0}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all disabled:opacity-0"
              >
                <ChevronLeft size={16} />
              </button>
              
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[2px]">
                <NodeIconMono iconKey="canvas" size={12} className="opacity-70" />
                <span 
                  onClick={() => {
                    if (activeSpaceId !== 'root') {
                      const { newMap: updatedSpacesMap } = syncCurrentSpaceState(nodes, edges, spacesMap, activeSpaceId);
                      const rootSpace = updatedSpacesMap['root'];
                      if (rootSpace) {
                        setSpacesMap(updatedSpacesMap);
                        setNodes([...rootSpace.nodes]);
                        setEdges([...(rootSpace.edges || [])]);
                        setActiveSpaceId('root');
                        setNavigationStack([]);
                      }
                    }
                  }}
                  className={`hover:text-cyan-400 cursor-pointer transition-colors ${activeSpaceId === 'root' ? 'text-cyan-400 font-bold' : 'text-slate-400'}`}
                >
                  Canvas
                </span>
                
                {navigationStack.map((id, idx) => (
                  <React.Fragment key={id}>
                    <span className="text-white/20">/</span>
                    <span className="inline-flex items-center gap-1">
                    <NodeIconMono iconKey="space" size={11} className="opacity-60" />
                    <span 
                      onClick={() => {
                        const { newMap: updatedSpacesMap } = syncCurrentSpaceState(nodes, edges, spacesMap, activeSpaceId);
                        const newStack = navigationStack.slice(0, idx);
                        const targetSpace = updatedSpacesMap[id];
                        if (targetSpace) {
                          setSpacesMap(updatedSpacesMap);
                          setNodes([...targetSpace.nodes]);
                          setEdges([...(targetSpace.edges || [])]);
                          setActiveSpaceId(id);
                          setNavigationStack(newStack);
                        }
                      }}
                      className="text-slate-400 hover:text-cyan-400 cursor-pointer transition-colors"
                    >
                      {spacesMap[id]?.name || 'Space'}
                    </span>
                    </span>
                  </React.Fragment>
                ))}
                
                {activeSpaceId !== 'root' && (
                  <>
                    <span className="text-white/20">/</span>
                    <span className="inline-flex items-center gap-1 text-cyan-400 font-bold tracking-wider">
                      <NodeIconMono iconKey="space" size={11} />
                      {spacesMap[activeSpaceId]?.name || 'Nested Space'}
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl">
                 <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]" />
                 <span className="text-[10px] font-black text-white uppercase tracking-widest drop-shadow-sm">
                   {currentName || 'Untitled Composition'}
                 </span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-1.5">
              <button 
                onClick={autoLayoutNodes}
                title="Order Nodes"
                className="w-10 h-10 bg-white/5 hover:bg-white/10 backdrop-blur-md border border-white/5 rounded-xl text-white flex items-center justify-center transition-all hover:scale-105 group"
              >
                <LayoutGrid size={16} className="text-emerald-400 group-hover:text-emerald-300" />
              </button>
              <button 
                onClick={() => fitView({ padding: FIT_VIEW_PADDING, duration: 800 })}
                title="Fit View"
                className="w-10 h-10 bg-white/5 hover:bg-white/10 backdrop-blur-md border border-white/5 rounded-xl text-white flex items-center justify-center transition-all hover:scale-105 group"
              >
                <Maximize size={16} className="text-cyan-400 group-hover:text-cyan-300" />
              </button>
              <button 
                onClick={() => setShowLoadModal(true)}
                title="My Spaces"
                className="w-10 h-10 bg-white/5 hover:bg-white/10 backdrop-blur-md border border-white/5 rounded-xl text-white flex items-center justify-center transition-all hover:scale-105 group"
              >
                <FolderOpen size={16} className="text-rose-400 group-hover:text-rose-300" />
              </button>
              <button 
                onClick={() => activeProjectId ? saveProject() : setShowSaveModal(true)}
                disabled={isSaving}
                className={`h-10 px-4 ${activeProjectId ? 'bg-rose-600/20 text-rose-400 border-rose-500/30' : 'bg-rose-600 text-white'} hover:brightness-110 backdrop-blur-xl border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2 transition-all hover:scale-105 disabled:opacity-50 shadow-xl shadow-rose-900/10`}
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 
                <span className="hidden sm:inline">{activeProjectId ? 'Commit' : 'Save'}</span>
              </button>
            </div>
        </div>

        {/* Legend HUD - Ultra Minimal Single Row (always visible) */}
        <div key="legend-hud" className="absolute bottom-6 left-6 flex items-center gap-6 px-6 py-2.5 bg-white/5 backdrop-blur-2xl border border-white/5 rounded-full z-50 pointer-events-none shadow-2xl shadow-black/5">
            {[
              { color: 'bg-blue-500', label: 'Prompt' },
              { color: 'bg-rose-500', label: 'Video' },
              { color: 'bg-pink-500', label: 'Image' },
              { color: 'bg-purple-500', label: 'Sound' },
              { color: 'bg-cyan-500', label: 'Mask' },
              { color: 'bg-orange-500', label: 'PDF' },
              { color: 'bg-amber-500', label: 'Txt' },
              { color: 'bg-emerald-500', label: 'Url' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${item.color} shadow-[0_0_8px_rgba(255,255,255,0.2)]`} />
                <span className="text-[8px] font-black text-white/60 uppercase tracking-widest">{item.label}</span>
              </div>
            ))}
            <div className="h-3 w-[1px] bg-white/10 mx-1" />
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full border border-rose-500/50 flex items-center justify-center">
                <div className="w-1 h-1 rounded-full bg-rose-500" />
              </div>
              <span className="text-[8px] font-black text-white/60 uppercase tracking-widest">Disconnect</span>
            </div>
        </div>

        {/* Modals */}
        {showSaveModal && (
          <div className="fixed inset-0 z-[10004] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowSaveModal(false)}></div>
            <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl relative z-10 border border-slate-200">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-wide flex items-center gap-3">
                  <Save size={20} className="text-cyan-500" /> Save Workspace
                </h2>
                <button 
                  onClick={() => setShowSaveModal(false)}
                  className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 rounded-full transition-colors"
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
                className="w-full bg-slate-50 border-2 border-slate-200 focus:border-cyan-500 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none transition-all placeholder:text-slate-400 mb-6"
              />
              <div className="flex gap-3 justify-end">
                <button 
                  onClick={() => setShowSaveModal(false)}
                  className="px-6 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => saveProject()}
                  className="px-6 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-widest bg-cyan-500 hover:bg-cyan-400 text-white shadow-lg shadow-cyan-500/30 transition-all flex items-center gap-2"
                >
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Project
                </button>
              </div>
            </div>
          </div>
        )}

        {showLoadModal && (
          <div className="fixed inset-0 z-[10004] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowLoadModal(false)}></div>
            <div className="bg-white rounded-3xl p-8 w-full max-w-2xl shadow-2xl relative z-10 border border-slate-200 max-h-[80vh] flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-wide flex items-center gap-3">
                  <FolderOpen size={20} className="text-rose-500" /> Your Projects
                </h2>
                <button 
                  onClick={() => setShowLoadModal(false)}
                  className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 rounded-full transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="text-slate-500 text-sm mb-6">Select a configuration to restore it to the canvas.</p>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar -mx-8 px-8 pb-8">
                {savedProjects.length === 0 ? (
                  <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-3xl">
                    <FolderOpen className="mx-auto mb-4 text-slate-400" size={48} />
                    <p className="text-slate-500 font-bold">No saved projects found yet.</p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {savedProjects.map((project) => (
                      <div key={project.id} className="group/item flex items-center gap-4 p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl transition-all shadow-sm hover:shadow-md">
                        <div className="w-14 h-14 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center border border-rose-100 shrink-0">
                          <Workflow size={24} />
                        </div>
                        <div className="flex-1 min-w-0">
                          {editingId === project.id ? (
                            <input 
                              autoFocus
                              type="text"
                              className="bg-slate-50 border-2 border-rose-500 rounded-lg px-3 py-2 text-sm font-black text-slate-900 w-full focus:outline-none"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onBlur={() => renameProject(project.id, editingName)}
                              onKeyDown={(e) => e.key === 'Enter' && renameProject(project.id, editingName)}
                            />
                          ) : (
                            <h4 
                              onClick={() => {
                                setEditingId(project.id);
                                setEditingName(project.name);
                              }}
                              className="text-[15px] font-black text-slate-900 truncate tracking-tight cursor-pointer hover:text-rose-600 flex items-center gap-2 group/title"
                            >
                              {project.name}
                              <Edit2 size={12} className="opacity-0 group-hover/title:opacity-100 text-slate-400 transition-opacity" />
                            </h4>
                          )}
                          <div className="flex items-center gap-4 mt-2">
                             <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase font-bold tracking-widest">
                               <Calendar size={12} /> {new Date(project.updatedAt).toLocaleDateString()}
                             </div>
                             <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase font-bold tracking-widest">
                               <Settings2 size={12} /> {Object.keys(project.spaces || {}).length} Spaces
                             </div>
                          </div>
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0">
                          <button 
                            onClick={() => duplicateProject(project)}
                            title="Duplicate Project"
                            className="p-3 text-slate-400 hover:text-blue-600 hover:bg-blue-50 bg-slate-100 rounded-xl transition-all"
                          >
                            <Copy size={16} />
                          </button>
                          <button 
                            onClick={() => setProjectToDelete(project)}
                            title="Delete Project"
                            className="p-3 text-slate-400 hover:text-rose-600 hover:bg-rose-50 bg-slate-100 rounded-xl transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                          <button 
                            onClick={() => loadProject(project)}
                            className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-all shadow-lg shadow-slate-900/20"
                          >
                            LOAD
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

        {/* Delete Confirmation Modal */}
        {projectToDelete && (
          <div className="absolute inset-0 z-[150] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
            <div className="w-full max-w-md bg-white border border-rose-200 rounded-3xl p-8 shadow-2xl relative overflow-hidden text-center">
              
              <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mb-6 mx-auto">
                <Trash2 size={36} className="text-rose-500" />
              </div>

              <h2 className="text-2xl font-black text-slate-900 mb-2">Delete Project?</h2>
              <p className="text-slate-500 text-sm mb-8 leading-relaxed">
                This will permanently remove <strong className="text-slate-900">"{projectToDelete.name}"</strong>. This action cannot be undone.
              </p>
              
              <div className="flex gap-4">
                <button 
                  onClick={() => setProjectToDelete(null)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black uppercase text-[11px] tracking-widest transition-all"
                >
                  CANCEL
                </button>
                <button 
                  onClick={() => {
                    deleteProject(projectToDelete.id);
                    setProjectToDelete(null);
                  }}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-black uppercase text-[11px] tracking-widest transition-all shadow-lg shadow-rose-600/20"
                >
                  DELETE
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
        <SpacesContent />
      </ReactFlowProvider>
    </div>
  );
}
