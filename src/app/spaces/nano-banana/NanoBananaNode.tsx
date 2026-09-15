"use client";

import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps } from "react";
import { flushSync } from "react-dom";
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
import { ImageIcon, Loader2, Maximize2, X } from "lucide-react";
import { FOLDDER_FIT_VIEW_EASE } from "@/lib/fit-view-ease";
import { runAiJobWithNotification } from "@/lib/ai-job-notifications";
import { isNodeAiExecutionActive, subscribeActiveAiJobs } from "@/lib/ai-active-jobs";
import { aiHudNanoBananaJobProgress, getAiHudNanoBananaJobProgressForNode } from "@/lib/ai-hud-generation-progress";
import { geminiGenerateWithServerProgress } from "@/lib/gemini-generate-stream-client";
import { openaiGenerateWithServerProgress } from "@/lib/openai-generate-stream-client";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
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
import { NanoBananaNodeDockSelect } from "./nano-banana-node-dock-select";
import { ImageCreationStudio } from "./ImageCreationStudio";
import { stripBriefForNode, type StudioDraftState } from "./studio-persist";
import type { StudioHistoryBrief } from "./studio-types";
import {
  coerceNanoBananaAspect,
  coerceNanoBananaResolution,
  nanoBananaAspectSelectOptions,
  nanoBananaResolutionSelectOptions,
  normalizeNanoBananaResolution,
  resolveNanoBananaImageProvider,
  type NanoBananaAspectRatio,
  type NanoBananaImageProvider,
  type NanoBananaResolution,
} from "./nano-banana-output-options";
import { type FoldderStudioEventDetail } from "../desktop-studio-events";
import { applyCanvasGroupCollapse, resolvePromptValueFromEdgeSourceMap } from "../canvas-group-logic";
import { resolveMediaUrlFromEdgeSource } from "../resolve-connected-media-url";
import { useAuthedMediaPreviewUrl } from "../hooks/use-authed-media-preview-url";
import { normalizeGenerativeImagePrompt } from "@/lib/normalize-generative-image-prompt";
import { nodeFrameNeedsSync, parseAspectRatioValue, resolveAspectLockedNodeFrame, resolveNodeChromeHeight } from "../studio-node-aspect";
import { takePendingNanoStudioOpenFromCine } from "../cine/cine-nano-open-pending";
import type { CineImageStudioResult, CineImageStudioSession } from "../cine-types";
import {
  FOLDDER_OPEN_DESIGNER_STUDIO_EVENT,
  takePendingNanoStudioOpenFromDesigner,
} from "../designer/designer-nano-open-pending";
import type {
  DesignerImageStudioResult,
  DesignerImageStudioSession,
} from "../designer/designer-image-studio-types";
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
const NANO_BANANA_DOCK_MIN_CHROME = 220;
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

export type { NanoBananaImageProvider } from "./nano-banana-output-options";

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
    generationBriefs?: StudioHistoryBrief[];
    studioDraft?: StudioDraftState;
    /** Studio · "Conservar zonas sin cambios" (por defecto activo). */
    studioPreserveUnchanged?: boolean;
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
  const dockRef = useRef<HTMLDivElement | null>(null);
  const frameSyncKeyRef = useRef<string | null>(null);
  const nodeMediaVisible = useNodeViewportVisibility(id, 900, selected);
  const cineReturnSessionRef = useRef<CineImageStudioSession | null>(null);
  const designerReturnSessionRef = useRef<DesignerImageStudioSession | null>(null);
  const latestStudioAssetRef = useRef<string | null>(null);
  const latestStudioS3KeyRef = useRef<string | null>(null);
  const [cineStudioPrompt, setCineStudioPrompt] = useState("");
  const [cineStudioSourceImage, setCineStudioSourceImage] = useState<string | null>(null);
  const [cineStudioHistory, setCineStudioHistory] = useState<string[]>([]);
  const [cineStudioBriefs, setCineStudioBriefs] = useState<StudioHistoryBrief[]>([]);
  const [cineStudioDraft, setCineStudioDraft] = useState<StudioDraftState | undefined>();
  const [nanoStudioTopBarCloseMode, setNanoStudioTopBarCloseMode] = useState<
    "default" | "returnCine" | "returnDesigner"
  >("default");

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
    designerReturnSessionRef.current = null;
    setCineStudioPrompt("");
    setCineStudioSourceImage(null);
    setCineStudioHistory([]);
    setNanoStudioTopBarCloseMode('default');
    setShowStudio(true);
  }, []);

  const closeNanoStudio = useCallback(() => {
    const cineSession = cineReturnSessionRef.current;
    const designerSession = designerReturnSessionRef.current;
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
    const designerResult: DesignerImageStudioResult | null = designerSession
      ? {
          imageUrl: latestStudioAssetRef.current || undefined,
          s3Key: latestStudioS3KeyRef.current || undefined,
        }
      : null;
    cineReturnSessionRef.current = null;
    designerReturnSessionRef.current = null;
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
      return;
    }

    if (designerSession) {
      requestAnimationFrame(() => {
        window.dispatchEvent(
          new CustomEvent(FOLDDER_OPEN_DESIGNER_STUDIO_EVENT, {
            detail: {
              designerNodeId: designerSession.designerNodeId,
              session: designerSession,
              result: designerResult ?? {},
            },
          }),
        );
      });
    }
  }, [getNodes, getEdges, setNodes, setEdges, id]);

  useEffect(() => {
    const openFromCineSession = (session: CineImageStudioSession) => {
      designerReturnSessionRef.current = null;
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
    const openFromDesignerSession = (session: DesignerImageStudioSession) => {
      cineReturnSessionRef.current = null;
      designerReturnSessionRef.current = session;
      latestStudioAssetRef.current = null;
      latestStudioS3KeyRef.current = null;
      setCineStudioPrompt("");
      setCineStudioSourceImage(session.sourceImageUrl || null);
      setCineStudioHistory(session.sourceImageUrl ? [session.sourceImageUrl] : []);
      setNanoStudioTopBarCloseMode("returnDesigner");
      setShowStudio(true);
    };
    const onOpenFromDesigner = (ev: Event) => {
      const e = ev as CustomEvent<{ nanoNodeId: string; session: DesignerImageStudioSession }>;
      if (e.detail?.nanoNodeId !== id || !e.detail.session) return;
      takePendingNanoStudioOpenFromDesigner(id);
      openFromDesignerSession(e.detail.session);
    };
    window.addEventListener("foldder-open-nano-studio-from-designer", onOpenFromDesigner as EventListener);
    return () =>
      window.removeEventListener(
        "foldder-open-nano-studio-from-designer",
        onOpenFromDesigner as EventListener,
      );
  }, [id]);

  useEffect(() => {
    const onOpenStudio = (ev: Event) => {
      const detail = (ev as CustomEvent<FoldderStudioEventDetail>).detail;
      if (detail?.nodeId !== id) return;
      cineReturnSessionRef.current = null;
      designerReturnSessionRef.current = null;
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
    const pendingDesigner = takePendingNanoStudioOpenFromDesigner(id);
    if (pendingDesigner) {
      cineReturnSessionRef.current = null;
      designerReturnSessionRef.current = pendingDesigner;
      latestStudioAssetRef.current = null;
      latestStudioS3KeyRef.current = null;
      setCineStudioPrompt("");
      setCineStudioSourceImage(pendingDesigner.sourceImageUrl || null);
      setCineStudioHistory(pendingDesigner.sourceImageUrl ? [pendingDesigner.sourceImageUrl] : []);
      setNanoStudioTopBarCloseMode("returnDesigner");
      setShowStudio(true);
      return;
    }
    const pending = takePendingNanoStudioOpenFromCine(id);
    if (!pending) return;
    designerReturnSessionRef.current = null;
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
  const persistedGenerationBriefs = Array.isArray(nodeData.generationBriefs)
    ? nodeData.generationBriefs
    : [];

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

  const onGenerationBriefsChange = useCallback(
    (action: React.SetStateAction<StudioHistoryBrief[]>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = Array.isArray(n.data.generationBriefs) ? (n.data.generationBriefs as StudioHistoryBrief[]) : [];
          const next = typeof action === "function" ? action(prev) : action;
          return { ...n, data: { ...n.data, generationBriefs: next.map(stripBriefForNode) } };
        })
      );
    },
    [id, setNodes]
  );

  const onStudioDraftChange = useCallback(
    (draft: StudioDraftState) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          return { ...n, data: { ...n.data, studioDraft: draft } };
        }),
      );
    },
    [id, setNodes],
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
  const imageProvider = resolveNanoBananaImageProvider(nodeData.imageProvider);
  const isOpenAiProvider = imageProvider === 'openai';
  const dockAspect = coerceNanoBananaAspect(nodeData.aspect_ratio);
  const dockResolution = coerceNanoBananaResolution(imageProvider, selectedModel, nodeData.resolution);

  const updateData = (key: string, val: unknown) =>
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, [key]: val } } : n));

  useEffect(() => {
    if (dockResolution !== normalizeNanoBananaResolution(nodeData.resolution)) {
      updateData("resolution", dockResolution);
    }
    if (dockAspect !== (nodeData.aspect_ratio || "16:9").trim()) {
      updateData("aspect_ratio", dockAspect);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar proveedor/modelo o valores incompatibles
  }, [imageProvider, selectedModel, dockResolution, dockAspect]);

  const inlinePromptText = typeof nodeData.promptText === "string" ? nodeData.promptText : "";
  /** Prompt efectivo: el conectado manda; si no, el inline. */
  const effectivePromptValue = promptValue || inlinePromptText;

  const onRun = async () => {
    if (!effectivePromptValue) return alert("Connect a prompt node!");

    const connectedRefImages = refImages.filter((img, index) => connectedSlots[index] && img) as string[];
    const textOnlyRecreation = connectedRefImages.length === 0;

    const userPromptRaw = normalizeGenerativeImagePrompt(String(effectivePromptValue ?? ""), {
      targetAspectRatio: dockAspect,
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
          aspect_ratio: dockAspect,
          resolution: dockResolution,
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
  const nbResLabel = dockResolution.toUpperCase();
  const nanoAspect = parseAspectRatioValue(dockAspect) ?? { width: 16, height: 9 };

  const hasConnections = brainConnected || promptConnected || connectedSlots.some(Boolean);
  const hasGeneratedOutput = Boolean(outputImage);
  const outputSettingsLocked = hasGeneratedOutput;
  /** Como Cine/Export: con salida generada el faldón debe existir aunque no haya cables. */
  const hasDock = hasConnections || hasGeneratedOutput;
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
  const formatLabel = dockAspect;
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
      const remeasureId = requestAnimationFrame(() => {
        // Hueco fijo para el faldón (como Export mide chrome = frame − preview).
        // No dependemos de un measure circular: con preview a height 100% el chrome salía 0.
        const measuredDock = dockRef.current?.offsetHeight ?? 0;
        const chromeHeight = hasDock
          ? Math.max(NANO_BANANA_DOCK_MIN_CHROME, measuredDock)
          : resolveNodeChromeHeight(frameRef.current, previewRef.current);
        const nextFrame = resolveAspectLockedNodeFrame({
          node: currentFrameNode,
          contentWidth: nanoAspect.width,
          contentHeight: nanoAspect.height,
          minWidth: 200,
          maxWidth: 960,
          minHeight: hasDock ? NANO_BANANA_DOCK_MIN_CHROME + NANO_BANANA_CONNECTED_PREVIEW_MIN : 120,
          maxHeight: STUDIO_NODE_MAX_HEIGHT,
          chromeHeight,
        });
        const syncKey = `${nodeData.aspect_ratio || "16:9"}:${nanoAspect.width}x${nanoAspect.height}:${hasDock ? "dock" : "preview-only"}:${hasHistoryStrip ? "history" : "hero"}:h${nextFrame.height}`;
        const needsFrameSync = nodeFrameNeedsSync(currentFrameNode, nextFrame);
        if (frameSyncKeyRef.current === syncKey && !needsFrameSync) return;
        frameSyncKeyRef.current = syncKey;
        setNodes((nds) =>
          nds.map((node) => {
            if (node.id !== id) return node;
            const frameOutOfSync = nodeFrameNeedsSync(node, nextFrame);
            if (!frameOutOfSync) return node;
            // Sin _foldderAspectRatio: este nodo ya no está en ASPECT_RATIO_NODE_TYPES,
            // así el snap de rejilla no vuelve a aplastar el faldón al ratio de la foto.
            const nextData = { ...(node.data as Record<string, unknown>) };
            delete nextData._foldderAspectRatio;
            return {
              ...node,
              width: nextFrame.width,
              height: nextFrame.height,
              measured: { width: nextFrame.width, height: nextFrame.height },
              data: nextData,
              style: {
                ...node.style,
                width: nextFrame.width,
                height: nextFrame.height,
                minHeight: nextFrame.height,
              },
            };
          }),
        );
        requestAnimationFrame(() => updateNodeInternals(id));
      });
      return () => cancelAnimationFrame(remeasureId);
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
      className={`nano-banana-node foldder-frameless-label-dark${isEmpty ? " nano-banana-node--empty" : hasDock ? " nano-banana-node--has-content" : ""}${hasPreviewVisual ? " nano-banana-node--has-preview" : ""}${connectedOnly ? " nano-banana-node--connected-only" : ""}${hasConnections ? " nano-banana-node--connected" : ""}${hasGeneratedOutput ? " nano-banana-node--has-output" : ""}${status === "error" ? " foldder-node--error" : ""}${isActivelyGenerating ? " node-glow-running" : ""}`}
      style={
        {
          width: "100%",
          height: "100%",
          minWidth: 200,
          minHeight: hasDock ? NANO_BANANA_DOCK_MIN_CHROME + NANO_BANANA_CONNECTED_PREVIEW_MIN : 300,
          "--foldder-node-card-bg": NANO_BANANA_ACCENT,
          "--foldder-frameless-glass-bg": NANO_BANANA_ACCENT,
          "--foldder-frameless-accent": "#fbcfe8",
        } as React.CSSProperties
      }
    >
      <FoldderNodeResizer
        minWidth={200}
        minHeight={hasDock ? NANO_BANANA_DOCK_MIN_CHROME + NANO_BANANA_CONNECTED_PREVIEW_MIN : 120}
        maxWidth={960}
        maxHeight={STUDIO_NODE_MAX_HEIGHT}
        keepAspectRatio={hasPreviewVisual && !hasDock}
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
          <div ref={dockRef} className="nano-banana-node-dock-wrap shrink-0">
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
                        onChange={(provider) => {
                          updateData("imageProvider", provider);
                          const nextRes = coerceNanoBananaResolution(
                            provider,
                            selectedModel,
                            nodeData.resolution,
                          );
                          if (nextRes !== normalizeNanoBananaResolution(nodeData.resolution)) {
                            updateData("resolution", nextRes);
                          }
                        }}
                      />
                    }
                  />
                  <FoldderNodeContentMetaRow
                    label="Modelo"
                    value={
                      outputSettingsLocked || isOpenAiProvider ? (
                        modelLabel
                      ) : (
                        <NanoBananaNodeDockSelect
                          value={selectedModel}
                          disabled={isActivelyGenerating}
                          ariaLabel="Modelo de imagen"
                          options={[
                            { value: "flash25", label: "NB 1" },
                            { value: "flash31", label: "NB 2" },
                            { value: "pro3", label: "Pro" },
                          ]}
                          onChange={(next) => updateData("modelKey", next)}
                        />
                      )
                    }
                  />
                  <FoldderNodeContentMetaRow
                    label="Formato"
                    value={
                      outputSettingsLocked ? (
                        formatLabel
                      ) : (
                      <NanoBananaNodeDockSelect
                        value={dockAspect}
                        disabled={isActivelyGenerating}
                        ariaLabel="Formato de imagen"
                        options={nanoBananaAspectSelectOptions()}
                        onChange={(next) => updateData("aspect_ratio", coerceNanoBananaAspect(next))}
                      />
                      )
                    }
                  />
                  <FoldderNodeContentMetaRow
                    label="Resolución"
                    value={
                      outputSettingsLocked ? (
                        nbResLabel
                      ) : (
                      <NanoBananaNodeDockSelect
                        value={dockResolution}
                        disabled={isActivelyGenerating}
                        ariaLabel="Resolución de imagen"
                        options={nanoBananaResolutionSelectOptions(imageProvider, selectedModel)}
                        onChange={(next) =>
                          updateData(
                            "resolution",
                            coerceNanoBananaResolution(imageProvider, selectedModel, next),
                          )
                        }
                      />
                      )
                    }
                  />
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
        const refImgs = refImages;
        const connected0 = cineStudioSourceImage || (refImgs[0] as string | null | undefined) || null;
        const isHostStudioSession = Boolean(
          cineReturnSessionRef.current ||
            designerReturnSessionRef.current ||
            cineStudioPrompt ||
            cineStudioSourceImage,
        );
        const studioLastGenerated = isHostStudioSession ? null : outputImage;
        return (
          <ImageCreationStudio
            nodeId={id}
            nodeLabel={nodeData.label?.trim() || "Image Creation"}
            initialImage={connected0}
            lastGenerated={studioLastGenerated}
            modelKey={nodeData.modelKey || 'flash31'}
            aspectRatio={dockAspect}
            resolution={dockResolution}
            imageProvider={imageProvider}
            thinking={!!nodeData.thinking}
            prompt={isHostStudioSession ? cineStudioPrompt || promptValue : effectivePromptValue}
            connectedImages={
              isHostStudioSession
                ? cineStudioSourceImage
                  ? [cineStudioSourceImage]
                  : []
                : connectedRefImages
            }
            onBrainImageGeneratorDiagnostics={setBrainImageDiagSync}
            topBarCloseMode={nanoStudioTopBarCloseMode}
            generationHistory={isHostStudioSession ? cineStudioHistory : persistedGenerationHistory}
            onGenerationHistoryChange={isHostStudioSession ? setCineStudioHistory : onGenerationHistoryChange}
            generationBriefs={isHostStudioSession ? cineStudioBriefs : persistedGenerationBriefs}
            onGenerationBriefsChange={isHostStudioSession ? setCineStudioBriefs : onGenerationBriefsChange}
            studioDraft={isHostStudioSession ? cineStudioDraft : nodeData.studioDraft}
            onStudioDraftChange={isHostStudioSession ? setCineStudioDraft : onStudioDraftChange}
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
                  generatedByAiSource:
                    n.data.imageProvider === "openai"
                      ? "openai-image-generator:studio"
                      : "gemini-image-generator:studio",
                });
                if (s3Key) data.s3Key = s3Key;
                else delete data.s3Key;
                return { ...n, data };
              }));
            }}
            onResolutionChange={(r) => updateData('resolution', r)}
            onAspectRatioChange={(ratio) => updateData('aspect_ratio', ratio)}
            onModelKeyChange={(key) => updateData('modelKey', key)}
            preserveUnchanged={nodeData.studioPreserveUnchanged !== false}
            onPreserveUnchangedChange={(enabled) => updateData("studioPreserveUnchanged", enabled)}
            onImageProviderChange={(provider) => {
              updateData("imageProvider", provider);
              const nextRes = coerceNanoBananaResolution(provider, selectedModel, nodeData.resolution);
              if (nextRes !== normalizeNanoBananaResolution(nodeData.resolution)) {
                updateData("resolution", nextRes);
              }
            }}
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
