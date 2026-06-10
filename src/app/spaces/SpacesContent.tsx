"use client";

import React, { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal, flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
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
  useReactFlow,
  useUpdateNodeInternals,
  useNodesState,
  useEdgesState,
  useOnViewportChange,
  SelectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { DesignerSpaceIdContext } from "@/contexts/DesignerSpaceIdContext";
import { SpacesActiveProjectIdContext } from "@/contexts/SpacesActiveProjectIdContext";
import { useLanguage } from "@/components/LanguageProvider";
import { LANGUAGE_OPTIONS } from "@/lib/i18n";
import { ProjectBrainCanvasContext } from "./project-brain-canvas-context";
import { ProjectAssetsCanvasContext } from "./project-assets-canvas-context";

import {
  applyCanvasGroupCollapse,
  createCanvasGroupFromNodeIds,
  normalizeCanvasGroupNodeZ,
  normalizeNodeZIndexForXYFlow,
  normalizeNodesForPersistence,
  normalizeSpacesMapNodesForPersistence,
  sanitizeLegacyRemovedNodesFromGraph,
  sanitizeLegacyRemovedNodesFromSpacesMap,
  recomputeCanvasGroupFrames,
  removeEmptyCanvasGroups,
  filterEdgesForCollapsedCanvasGroups,
  edgeTargetsMemberInput,
} from "./canvas-group-logic";

import Sidebar from "./Sidebar";
import { AgentHUD } from "./AgentHUD";
import { ApiUsageHud } from "./ApiUsageHud";
import { AiRequestHud } from "./AiRequestHud";
import { ExternalApiBlockedModal } from "./ExternalApiBlockedModal";
import { WalletBalanceButton } from "./WalletBalanceButton";
import { WalletCostGuardDialog } from "./WalletCostGuardDialog";
import { TopbarPins } from "./TopbarPins";
import { StandardDesktopView } from "./StandardDesktopView";
import {
  createEmptyNotesNodeData,
  NOTE_GAP,
  NOTE_HEIGHT,
  NOTE_MARGIN,
  NOTE_MIN_HEIGHT,
  NOTE_WIDTH,
} from "./NotesSticky";
import { ProjectBrainFullscreen, type BrainMainSection } from "./ProjectBrainFullscreen";
import { ProjectAssetsFullscreen } from "./ProjectAssetsFullscreen";
import { PerformanceHud } from "./PerformanceHud";
import {
  resolveHandleMetaForCanvasDrop,
  pickNewNodeTypeForCanvasDrop,
  defaultDataForCanvasDropNode,
  getHandleCenterFlowPosition,
  getNodeFlowRect,
} from "@/lib/canvas-connect-end-drop";
import { matchesClearCanvasIntent } from "@/lib/clear-canvas-intent";
import { matchesAddSpaceNodeIntent } from "@/lib/assistant-quick-intents";
import { installAiFetchOverlay } from "@/lib/ai-request-overlay";
import { readJsonWithHttpError, readResponseJson, type HttpJsonError } from "@/lib/read-response-json";
import { hydrateSpacesMapWithFreshUrls } from "@/lib/s3-media-hydrate";
import {
  AI_JOB_COMPLETE_EVENT,
  AI_JOB_CANVAS_NODE_ID,
  runAiJobWithNotification,
  type AiJobCompleteDetail,
} from "@/lib/ai-job-notifications";
import { FOLDDER_FIT_VIEW_EASE } from "@/lib/fit-view-ease";
import "./spaces.css";
import { NODE_REGISTRY } from "./nodeRegistry";
import {
  createProjectFileForStudioNode,
  createProjectExportFile,
  getProjectFilesFromMetadata,
  reconcileProjectFilesFromNodes,
  setProjectFilesInMetadata,
  updateProjectFileInMetadata,
  upsertProjectFile,
  type ProjectFile,
  type WorkspaceViewMode,
} from "./project-files";
import { studioAppForFileKind, type StudioAppConfig } from "./studioApps";
import {
  dispatchFoldderStudioEvent,
  FOLDDER_CLOSE_STUDIO_EVENT,
  FOLDDER_LEGACY_CLOSE_NODE_STUDIO_EVENT,
  FOLDDER_LEGACY_OPEN_NODE_STUDIO_EVENT,
  FOLDDER_MINIMIZE_STUDIO_EVENT,
  FOLDDER_OPEN_STUDIO_EVENT,
  FOLDDER_RESTORE_STUDIO_EVENT,
  FOLDDER_STANDARD_STUDIO_CLOSE_REQUEST_EVENT,
  FOLDDER_STANDARD_STUDIO_MINIMIZE_REQUEST_EVENT,
  FOLDDER_STANDARD_STUDIO_SAVE_AS_REQUEST_EVENT,
  FOLDDER_STUDIO_CLOSED_EVENT,
  FOLDDER_STUDIO_OPENED_EVENT,
  type FoldderStudioEventDetail,
} from "./desktop-studio-events";
import { collectFoldderLibrarySections } from "./foldder-library";
import { compactProjectForSave } from "./compact-project-save";
import { dispatchFoldderCanvasPerformanceMode, dispatchFoldderPerformanceMeasure } from "./performance-events";
import { prepareProjectSavePayload } from "./project-save-worker-client";
import { projectSaveFingerprint } from "./project-save-utils";
import { buildProjectSaveManifest } from "./project-save-manifest";
import { mergeLiveStudioNodeDataIntoNodes } from "./studio-live-documents";
import { useFoldderRenderMetric } from "./use-performance-metrics";
import {
  materializeProjectSpacesMediaForSave,
  uploadProjectMediaFile,
  type ProjectMediaUploadCache,
} from "./project-media-s3-save";
import {
  getGuionistaTextAssetsFromMetadata,
  setGuionistaTextAssetsInMetadata,
  upsertGuionistaTextAsset,
  type GuionistaTextAsset,
} from "./guionista-types";
import {
  FOLDDER_EXPORT_CREATED_EVENT,
  type FoldderExportCreatedDetail,
} from "./foldder-export-events";
import {
  FOLDDER_OPEN_GEMINI_VIDEO_WITH_IMAGE_EVENT,
  type FoldderOpenGeminiVideoDetail,
} from "./presenter/presenter-image-video-types";
import { useNodeExecutionRunner } from "./NodeExecutionBridge";
import {
  areNodesConnectable,
  findLibraryDropPlan,
  computeLibraryDropPosition,
  findTopNodeUnderFlowPoint,
  findEmptyPositionForNewNode,
  preferredCenterRightOfRightmostNode,
  orderedSourcesForSharedTarget,
  positionNewNodeRightOfSources,
} from "./connection-utils";
import {
  FolderPlus,
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
  Maximize2,
  Minimize2,
  LayoutGrid,
  Languages,
  ChevronDown,
  ZoomIn,
  MessageCircle,
  CheckCircle2,
  AlertCircle,
  Wallet,
} from "lucide-react";
import { CanvasWallpaperTransition } from "./CanvasWallpaperTransition";
import { CANVAS_BACKGROUNDS } from "./canvas-backgrounds";
import { SpacesWelcomeChrome } from "./SpacesWelcomeChrome";
import {
  spacesInitialNodes as initialNodes,
  spacesInitialEdges as initialEdges,
  spacesNodeTypes as nodeTypes,
  spacesEdgeTypes as edgeTypes,
  spacesDefaultEdgeOptions as defaultEdgeOptions,
} from "./spaces-react-flow-config";
import {
  NANO_BANANA_DEFAULT_H,
  NANO_BANANA_DEFAULT_W,
  GEMINI_VIDEO_DEFAULT_H,
  GEMINI_VIDEO_DEFAULT_W,
  FINAL_NODE_ID,
  XYFLOW_NO_PAN_WHEEL_GUARD_CLASS,
  FIT_VIEW_PADDING,
  FIT_VIEW_PADDING_LIBRARY_DRAG,
  FIT_VIEW_PADDING_NODE_FOCUS,
  FIT_VIEW_PADDING_CARDS,
  fitAnim,
} from "./spaces-view-constants";
import { withFoldderCanvasIntro } from "./spaces-canvas-intro";
import { foldderIsMacOs, foldderWheelLooksLikeMouse } from "./spaces-wheel";
import {
  getNodeLayoutDimensions,
  undirectedLayoutComponents,
  runKahnColumnLayout,
  alignMultiInputTargetsToSources,
} from "./spaces-graph-layout";
import { getReactFlowNodeIdAtClientPoint } from "./spaces-flow-hit-test";
import { sortNodesCardsOrder, mergeNodeOutputBorderStyle } from "./spaces-node-style";
import {
  useFoldderCanvasIntro,
  useSpacesBrowserFullscreen,
  useSpacesCanvasBackground,
  useSpacesCanvasUngroup,
  useSpacesFitViewToNodeIds,
  useSpacesUndoRedo,
  type SpacesCanvasKeyboardShortcutsRef,
  useSpacesCanvasKeyboard,
} from "./hooks";

function preserveBrainVisualCollageMetadata(
  incoming: Record<string, unknown>,
  current: Record<string, unknown>,
): Record<string, unknown> {
  const currentAssets = current.assets as Record<string, unknown> | undefined;
  const currentStrategy = currentAssets?.strategy as Record<string, unknown> | undefined;
  const currentVisual = currentStrategy?.visualReferenceAnalysis as Record<string, unknown> | undefined;
  const currentCollage = typeof currentVisual?.dnaCollageImageDataUrl === "string" ? currentVisual.dnaCollageImageDataUrl : "";
  if (!currentCollage.trim()) return incoming;

  const incomingAssets = incoming.assets as Record<string, unknown> | undefined;
  const incomingStrategy = incomingAssets?.strategy as Record<string, unknown> | undefined;
  const incomingVisual = incomingStrategy?.visualReferenceAnalysis as Record<string, unknown> | undefined;
  const incomingCollage = typeof incomingVisual?.dnaCollageImageDataUrl === "string" ? incomingVisual.dnaCollageImageDataUrl : "";
  if (incomingCollage.trim()) return incoming;

  return {
    ...incoming,
    assets: {
      ...(incomingAssets ?? {}),
      strategy: {
        ...(incomingStrategy ?? {}),
        visualReferenceAnalysis: {
          ...(incomingVisual ?? {}),
          dnaCollageImageDataUrl: currentVisual?.dnaCollageImageDataUrl,
          dnaCollageSourceFingerprint: currentVisual?.dnaCollageSourceFingerprint,
          dnaCollageGeneratedAt: currentVisual?.dnaCollageGeneratedAt,
        },
      },
    },
  };
}

function stripVolatileProjectMetadata(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object") return {};
  // `ui` contains viewport/navigation state. It is persisted with real saves, but
  // must not make the content fingerprint dirty by itself.
  const { savedAt: _savedAt, ui: _ui, ...stable } = metadata;
  return stable;
}

function projectMetadataEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return projectSaveFingerprint(stripVolatileProjectMetadata(a)) === projectSaveFingerprint(stripVolatileProjectMetadata(b));
}

function projectRecordEqual(a: unknown, b: unknown): boolean {
  return projectSaveFingerprint(a) === projectSaveFingerprint(b);
}

function newLocalWorkspaceScopeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `lw_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

const URL_PROJECT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,140}$/;

function normalizeUrlProjectId(value: string | null | undefined): string | null {
  const projectId = value?.trim() ?? "";
  return projectId && URL_PROJECT_ID_PATTERN.test(projectId) ? projectId : null;
}

type SavedProjectMeta = {
  createdAt?: string;
  id: string;
  metadata?: Record<string, unknown>;
  name: string;
  revision?: number | null;
  rootSpaceId?: string;
  spacesCount?: number | null;
  updatedAt?: string;
};

type SavedProjectDetail = SavedProjectMeta & {
  spaces: Record<string, any>;
};

type SaveProjectOptions = {
  reason?: "autosave" | "brain-assets" | "debounced" | "manual" | "text-asset";
  silentError?: boolean;
  skipIfUnchanged?: boolean;
};

type SaveHealthState = "idle" | "saving" | "saved" | "error" | "conflict" | "too-large";

type SaveHealth = {
  state: SaveHealthState;
  message?: string;
  at?: number;
};

type ProjectUiSnapshot = {
  activeSpaceId: string;
  canvasBgId: string;
  canvasViewMode: "free" | "cards";
  cardsFocusIndex: number;
  navigationStack: string[];
  sidebarLockedCollapsed: boolean;
  viewport: { x: number; y: number; zoom: number };
  workspaceViewMode: WorkspaceViewMode;
};

const CLIENT_SAVE_BODY_LIMIT_BYTES = 4_250_000;
const PROJECT_SAVE_DEBOUNCE_MS = 25_000;
const PROJECT_SAVE_HEARTBEAT_MS = 90_000;
const PROJECT_UI_SAVE_DEBOUNCE_MS = 60_000;

function isRevisionConflictMessage(message: string): boolean {
  return /changed on another device|revision conflict/i.test(message);
}

function isPayloadTooLargeMessage(message: string): boolean {
  return /too large|413|límite|limite|payload/i.test(message);
}

function getHttpJsonError(err: unknown): HttpJsonError | null {
  return err instanceof Error ? (err as HttpJsonError) : null;
}

function classifyProjectSaveError(err: unknown): {
  alertMessage: string;
  healthMessage: string;
  state: SaveHealthState;
} {
  const httpError = getHttpJsonError(err);
  const message = err instanceof Error ? err.message : String(err ?? "");
  const status = httpError?.status;
  const code = httpError?.code;

  if (isRevisionConflictMessage(message)) {
    return {
      alertMessage: "This project changed on another device. Reload it before saving again.",
      healthMessage: "Project changed elsewhere. Reload before saving.",
      state: "conflict",
    };
  }

  if (isPayloadTooLargeMessage(message) || status === 413) {
    return {
      alertMessage: "This project is too heavy to save. Keep large media in cloud storage and try again.",
      healthMessage: "Project is too heavy to save. Media must stay in cloud storage.",
      state: "too-large",
    };
  }

  if (status === 401 || /unauthorized|session/i.test(message)) {
    return {
      alertMessage: "Your session expired. Sign in again before saving.",
      healthMessage: "Session expired. Sign in again before saving.",
      state: "error",
    };
  }

  if (status === 403 || /forbidden|not allowed|access/i.test(message)) {
    return {
      alertMessage: "Some project media is not accessible with this account. Reload the project or sign in again.",
      healthMessage: "Project media is not accessible. Reload before saving.",
      state: "error",
    };
  }

  if (code === "PROJECT_DATA_INTEGRITY_ERROR") {
    return {
      alertMessage: "The saved project data failed an integrity check. Reload the project before continuing.",
      healthMessage: "Project data integrity check failed. Reload before saving.",
      state: "error",
    };
  }

  if (status && status >= 500) {
    return {
      alertMessage: "The server could not save the project. Your local changes remain open; try again shortly.",
      healthMessage: "Server save failed. Retrying on the next change.",
      state: "error",
    };
  }

  return {
    alertMessage: "Error saving project. Check console for details.",
    healthMessage: "Save failed. Retrying on the next change.",
    state: "error",
  };
}

type OpenDesktopApp = {
  id: string;
  appId: string;
  fileId?: string;
  nodeId?: string;
  nodeType?: string;
  fileName?: string;
  status: "open" | "minimized";
  openedAt: string;
  updatedAt: string;
  /** Compatibilidad con la primera iteración del runtime estándar. */
  title: string;
  kind?: ProjectFile["kind"] | "app";
};

type StandardRuntimeApp = OpenDesktopApp;

function createOpenDesktopApp(input: {
  id: string;
  appId: string;
  title: string;
  kind?: ProjectFile["kind"] | "app";
  fileId?: string;
  nodeId?: string;
  nodeType?: string;
  fileName?: string;
  status?: OpenDesktopApp["status"];
  openedAt?: string;
}): OpenDesktopApp {
  const now = new Date().toISOString();
  return {
    ...input,
    fileName: input.fileName ?? input.title,
    status: input.status ?? "open",
    openedAt: input.openedAt ?? now,
    updatedAt: now,
  };
}

function standardShellForRuntimeApp(app: StandardRuntimeApp): FoldderStudioEventDetail["standardShell"] {
  const label =
    app.kind && app.kind !== "app"
      ? studioAppForFileKind(app.kind)?.label
      : undefined;
  return {
    appLabel: label ?? app.appId ?? "App",
    fileName: app.fileId ? app.fileName ?? app.title : undefined,
    canSaveAs: Boolean(app.fileId && app.kind !== "brain" && app.kind !== "assets" && app.kind !== "export"),
  };
}

function defaultCanvasNodeStyleForType(type: string): React.CSSProperties | undefined {
  if (type === "nanoBanana") {
    return { width: NANO_BANANA_DEFAULT_W, height: NANO_BANANA_DEFAULT_H };
  }
  if (type === "geminiVideo" || type === "vfxGenerator") {
    return { width: GEMINI_VIDEO_DEFAULT_W, height: GEMINI_VIDEO_DEFAULT_H };
  }
  if (type === "notes") {
    return {
      width: NOTE_WIDTH,
      height: NOTE_HEIGHT,
      minHeight: NOTE_MIN_HEIGHT,
    };
  }
  return undefined;
}

function defaultCanvasNodeDragHandle(type: string): string | undefined {
  return type === "notes" ? ".notes-drag-surface" : undefined;
}

function normalizeNotesNodeForRuntime<T extends Node>(node: T): T {
  if (node.type !== "notes") return node;
  const style = (node.style as React.CSSProperties | undefined) ?? {};
  const styleHeight = typeof style.height === "number" ? style.height : undefined;
  const measuredHeight = typeof node.measured?.height === "number" ? node.measured.height : undefined;
  const nodeHeight = typeof node.height === "number" ? node.height : undefined;
  const height = Math.max(NOTE_HEIGHT, styleHeight ?? 0, measuredHeight ?? 0, nodeHeight ?? 0);
  return {
    ...node,
    dragHandle: ".notes-drag-surface",
    height,
    measured: {
      ...(node.measured ?? {}),
      width: NOTE_WIDTH,
      height,
    },
    style: {
      ...style,
      width: NOTE_WIDTH,
      height,
      minHeight: NOTE_MIN_HEIGHT,
    },
  };
}

export function SpacesContent() {
  useFoldderRenderMetric("SpacesContent");
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const { language, setLanguage } = useLanguage();
  const isAuthenticated = sessionStatus === "authenticated";
  const [nodes, setNodes, onNodesChange] = useNodesState<any>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>(initialEdges);
  /** Siempre la misma referencia que `nodes` / `edges` (sync en render, no en useEffect) */
  const liveNodesRef = useRef<any[]>(initialNodes);
  const liveEdgesRef = useRef<any[]>(initialEdges);
  liveNodesRef.current = nodes;
  liveEdgesRef.current = edges;
  const [canvasPerformanceMode, setCanvasPerformanceMode] = useState(false);
  const canvasPerformanceModeRef = useRef(false);
  const canvasPerformanceReleaseTimerRef = useRef<number | null>(null);
  const canvasInteractionStartedAtRef = useRef<number | null>(null);
  const pendingProjectSaveAfterInteractionRef = useRef(false);
  const pendingProjectSaveAfterInFlightRef = useRef(false);
  const nodeDataSignatureTokensRef = useRef(new WeakMap<object, number>());
  const nodeDataSignatureCounterRef = useRef(0);
  const { screenToFlowPosition, setViewport, fitView, getViewport } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const runAssistantPipeline = useNodeExecutionRunner();

  const {
    canvasBgId,
    setCanvasBgId,
    canvasBgMenuOpen,
    setCanvasBgMenuOpen,
    canvasBgMenuRef,
    reactFlowCanvasStyle,
  } = useSpacesCanvasBackground();

  const { scheduleFoldderCanvasIntroEnd } = useFoldderCanvasIntro(
    nodes,
    setNodes,
    liveNodesRef,
    liveEdgesRef,
    updateNodeInternals,
  );

  const { takeSnapshot, undo, redo } = useSpacesUndoRedo(setNodes, setEdges, liveNodesRef, liveEdgesRef);

  const { browserFullscreen, togglePageFullscreen } = useSpacesBrowserFullscreen();

  const fitViewToNodeIds = useSpacesFitViewToNodeIds();
  const scheduleNodeInternalsRefresh = useCallback((nodeIds: string[]) => {
    if (!Array.isArray(nodeIds) || nodeIds.length === 0) return;
    const uniq = Array.from(new Set(nodeIds.filter((id) => typeof id === "string" && id.length > 0)));
    if (uniq.length === 0) return;
    const run = () => {
      for (const id of uniq) updateNodeInternals(id);
    };
    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
    window.setTimeout(run, 180);
    window.setTimeout(run, 420);
    window.setTimeout(run, 900);
  }, [updateNodeInternals]);
  const scheduleEdgeGeometryRefresh = useCallback(() => {
    const run = () => {
      setEdges((eds) => eds.map((e) => ({ ...e })));
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
    window.setTimeout(run, 200);
    window.setTimeout(run, 480);
    window.setTimeout(run, 980);
  }, [setEdges]);

  // Persistence state
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const activeProjectIdRef = useRef<string | null>(null);
  activeProjectIdRef.current = activeProjectId;
  const [activeProjectRevision, setActiveProjectRevision] = useState<number | null>(null);
  const activeProjectRevisionRef = useRef<number | null>(null);
  activeProjectRevisionRef.current = activeProjectRevision;
  const [activeSpaceId, setActiveSpaceId] = useState<string>('root');
  const [currentName, setCurrentName] = useState<string>('');
  const [workspaceViewMode, setWorkspaceViewMode] = useState<WorkspaceViewMode>('standard');
  const [savedProjects, setSavedProjects] = useState<SavedProjectMeta[]>([]);
  const [spacesMap, setSpacesMap] = useState<Record<string, any>>({});
  const [metadata, setMetadata] = useState<any>({});
  const brainAssetsFingerprint = useMemo(
    () => projectSaveFingerprint(metadata?.assets ?? null),
    [metadata?.assets],
  );
  const metadataVersionRef = useRef(0);
  const metadataIdentityRef = useRef(metadata);
  if (metadataIdentityRef.current !== metadata) {
    metadataVersionRef.current += 1;
    metadataIdentityRef.current = metadata;
  }
  /** True hasta el próximo guardado: análisis visual en memoria distinto del último persistido. */
  const [visualReferenceAnalysisDirty, setVisualReferenceAnalysisDirty] = useState(false);
  
  const [isSaving, setIsSaving] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectNameInput, setNewProjectNameInput] = useState('');
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [projectsListLoading, setProjectsListLoading] = useState(false);
  const [projectsListError, setProjectsListError] = useState<string | null>(null);
  const [projectLoadingId, setProjectLoadingId] = useState<string | null>(null);
  const [projectLoadingStage, setProjectLoadingStage] = useState<string>("");
  const [projectLoadingError, setProjectLoadingError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isGeneratingAssistant, setIsGeneratingAssistant] = useState(false);
  const [assistantHudOpen, setAssistantHudOpen] = useState(false);
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
  /** Borrado en curso (API + S3); bloquea otras acciones sobre proyectos. */
  const [projectDeleteInProgress, setProjectDeleteInProgress] = useState<{
    projectName: string;
  } | null>(null);
  /** Evita doble clic en «Delete» antes de que React oculte el diálogo. */
  const projectDeleteLockRef = useRef(false);
  const [navigationStack, setNavigationStack] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, nodeId?: string } | null>(null);

  /** Zoom actual del lienzo (React Flow) — HUD fijo abajo-derecha */
  const [canvasZoom, setCanvasZoom] = useState(0.7);
  /** Panel de uso de APIs: oculto hasta pulsar el control de zoom */
  const [apiUsagePanelOpen, setApiUsagePanelOpen] = useState(false);
  /** Indicador visual breve tras guardado automático (intervalo 1 min) */
  const [showAutosavePulse, setShowAutosavePulse] = useState(false);
  const [saveHealth, setSaveHealth] = useState<SaveHealth>({ state: "idle" });
  const autosavePulseTimerRef = useRef<number | null>(null);
  const projectSaveDebounceTimerRef = useRef<number | null>(null);
  const projectUiSaveDebounceTimerRef = useRef<number | null>(null);
  const lastSavedFingerprintRef = useRef<string | null>(null);
  const lastSavedUiFingerprintRef = useRef<string | null>(null);
  const lastSaveWasSkippedRef = useRef(false);
  const projectMediaUploadCacheRef = useRef<ProjectMediaUploadCache>(new Map());
  const devBypassHeaders = useMemo<Record<string, string>>(() => ({}), []);

  /** Avisos poco intrusivos al terminar trabajos de IA en segundo plano */
  const [aiJobToasts, setAiJobToasts] = useState<Array<{ id: string } & AiJobCompleteDetail>>([]);

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
  const [projectBrainOpen, setProjectBrainOpen] = useState(false);
  const [brainInitialSection, setBrainInitialSection] = useState<BrainMainSection | null>(null);
  const [projectAssetsOpen, setProjectAssetsOpen] = useState(false);
  const [standardRuntimeApp, setStandardRuntimeApp] = useState<StandardRuntimeApp | null>(null);
  const [standardMinimizedApp, setStandardMinimizedApp] = useState<StandardRuntimeApp | null>(null);
  const [openDesktopApps, setOpenDesktopApps] = useState<OpenDesktopApp[]>([]);
  const [standardFoldderOpenRequest, setStandardFoldderOpenRequest] = useState(0);
  /** Aísla caché (p. ej. sugerencias de imagen) cuando aún no hay `activeProjectId`; evita reutilizar `__local__` entre borradores. */
  const [localWorkspaceScopeId, setLocalWorkspaceScopeId] = useState(() => newLocalWorkspaceScopeId());
  const projectScopeId = activeProjectId ?? localWorkspaceScopeId;

  const registerStandardRuntimeApp = useCallback((app: StandardRuntimeApp) => {
    const nextApp = { ...app, status: "open" as const, updatedAt: new Date().toISOString() };
    setStandardRuntimeApp(nextApp);
    setStandardMinimizedApp(null);
    setOpenDesktopApps((apps) => {
      const existing = apps.find((row) => row.id === nextApp.id);
      const openedAt = existing?.openedAt ?? nextApp.openedAt;
      return [
        ...apps.filter((row) => row.id !== nextApp.id),
        { ...nextApp, openedAt },
      ];
    });
  }, []);

  const minimizeRegisteredDesktopApp = useCallback((app: StandardRuntimeApp) => {
    const minimized = { ...app, status: "minimized" as const, updatedAt: new Date().toISOString() };
    setStandardRuntimeApp(null);
    setStandardMinimizedApp(minimized);
    setOpenDesktopApps((apps) => {
      const existing = apps.find((row) => row.id === minimized.id);
      return [
        ...apps.filter((row) => row.id !== minimized.id),
        { ...minimized, openedAt: existing?.openedAt ?? minimized.openedAt },
      ];
    });
  }, []);

  const closeRegisteredDesktopApp = useCallback((app: StandardRuntimeApp | null) => {
    if (!app) return;
    setOpenDesktopApps((apps) => apps.filter((row) => row.id !== app.id));
    setStandardRuntimeApp((current) => (current?.id === app.id ? null : current));
    setStandardMinimizedApp((current) => (current?.id === app.id ? null : current));
  }, []);

  const openFoldder = useCallback(
    (target?: "panel" | "fullscreen") => {
      const resolvedTarget = target ?? (workspaceViewMode === "standard" ? "panel" : "fullscreen");
      registerStandardRuntimeApp(createOpenDesktopApp({ id: "foldder", title: "Foldder", kind: "assets", appId: "files", nodeType: "projectAssets" }));
      if (resolvedTarget === "panel") {
        setProjectAssetsOpen(false);
        setStandardFoldderOpenRequest((value) => value + 1);
        return;
      }
      setProjectAssetsOpen(true);
    },
    [registerStandardRuntimeApp, workspaceViewMode],
  );

  const projectFiles = useMemo(
    () => reconcileProjectFilesFromNodes(metadata, nodes as Node[]),
    [metadata, nodes],
  );

  const generatedTextAssets = useMemo(
    () => getGuionistaTextAssetsFromMetadata(metadata),
    [metadata],
  );

  const saveGuionistaTextAsset = useCallback((asset: GuionistaTextAsset) => {
    setMetadata((m: Record<string, unknown>) => {
      const current = getGuionistaTextAssetsFromMetadata(m);
      return setGuionistaTextAssetsInMetadata(m, upsertGuionistaTextAsset(current, asset));
    });
    window.setTimeout(() => {
      void saveProjectRef.current(undefined, {
        reason: "text-asset",
        silentError: true,
        skipIfUnchanged: true,
      });
    }, 200);
  }, []);

  const openGuionistaTextAsset = useCallback((assetId: string) => {
    const asset = getGuionistaTextAssetsFromMetadata(metadata).items.find((item) => item.id === assetId);
    if (!asset) return;
    const existingNode = liveNodesRef.current.find((node) => node.id === asset.nodeId && node.type === "guionista")
      ?? liveNodesRef.current.find((node) => node.type === "guionista" && (node.data as Record<string, unknown> | undefined)?.assetId === assetId);
    let nodeId = existingNode?.id;
    if (!nodeId) {
      nodeId = `guionista_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const center = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      const position = findEmptyPositionForNewNode("guionista", liveNodesRef.current, center);
      setNodes((nds) => [
        ...nds.map((node) => ({ ...node, selected: false })),
        {
          id: nodeId,
          type: "guionista",
          position,
          data: withFoldderCanvasIntro("guionista", {
            ...defaultDataForCanvasDropNode("guionista"),
            label: "Guionista",
            title: asset.title,
            format: asset.type,
            versions: asset.versions,
            activeVersionId: asset.activeVersionId,
            assetId: asset.id,
            status: asset.status,
            value: asset.markdown,
            promptValue: asset.markdown,
            comments: asset.comments ?? [],
            globalAdjustmentNotes: asset.globalAdjustmentNotes ?? "",
            updatedAt: asset.updatedAt,
          }),
        } satisfies Node,
      ]);
      scheduleFoldderCanvasIntroEnd(nodeId);
    }
    const targetNodeId = nodeId;
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("foldder-open-guionista-asset", {
          detail: { assetId, nodeId: targetNodeId },
        }),
      );
    }, 80);
  }, [metadata, scheduleFoldderCanvasIntroEnd, screenToFlowPosition, setNodes]);

  const getNodeDataSignatureToken = useCallback((value: unknown): string => {
    if (!value || typeof value !== "object") return String(value ?? "");
    const known = nodeDataSignatureTokensRef.current.get(value);
    if (known != null) return String(known);
    nodeDataSignatureCounterRef.current += 1;
    const next = nodeDataSignatureCounterRef.current;
    nodeDataSignatureTokensRef.current.set(value, next);
    return String(next);
  }, []);

  const nodesContentSignature = useMemo(
    () =>
      (nodes as Node[])
        .map((node) => `${node.id}:${node.type ?? ""}:${getNodeDataSignatureToken(node.data)}`)
        .join("|"),
    [nodes, getNodeDataSignatureToken],
  );

  const brainFlowNodesSignature = useMemo(
    () =>
      (nodes as Node[])
        .map((node) => {
          const data = (node.data ?? {}) as { label?: unknown; title?: unknown; name?: unknown };
          return [
            node.id,
            node.type ?? "",
            typeof data.label === "string" ? data.label : "",
            typeof data.title === "string" ? data.title : "",
            typeof data.name === "string" ? data.name : "",
          ].join(":");
        })
        .join("|"),
    [nodes],
  );

  const brainFlowNodes = useMemo(
    () =>
      (nodes as Node[]).map((node) => {
        const data = (node.data ?? {}) as { label?: unknown; title?: unknown; name?: unknown };
        return {
          id: node.id,
          type: node.type,
          data: {
            label: typeof data.label === "string" ? data.label : undefined,
            title: typeof data.title === "string" ? data.title : undefined,
            name: typeof data.name === "string" ? data.name : undefined,
          },
        };
      }),
    // Only rebuild when the Brain-relevant identity/label signature changes; node position changes should not refresh Brain cards.
    [brainFlowNodesSignature],
  );

  const brainFlowEdges = useMemo(
    () =>
      (edges as Edge[]).map((edge) => ({
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      })),
    [edges],
  );

  const projectBrainCanvasValue = useMemo(
    () => ({
      assetsMetadata: metadata.assets,
      projectScopeId,
      openProjectBrain: () => {
        setBrainInitialSection(null);
        setProjectBrainOpen(true);
      },
      openProjectBrainReview: () => {
        setBrainInitialSection("review");
        setProjectBrainOpen(true);
      },
      flowNodes: brainFlowNodes,
      flowEdges: brainFlowEdges,
    }),
    [metadata.assets, projectScopeId, brainFlowNodes, brainFlowEdges],
  );

  const foldderLibrarySections = useMemo(
    () =>
      collectFoldderLibrarySections({
        nodes: nodes as Node[],
        assetsMetadata: metadata.assets,
        projectScopeId,
        projectFiles,
        generatedTextAssets,
      }),
    // Project media is driven by node type/data, not canvas x/y movement. Avoid rescanning heavy Designer pages during drag.
    [metadata.assets, nodesContentSignature, projectFiles, generatedTextAssets, projectScopeId],
  );

  const projectAssetsLibrarySummary = useMemo(
    () => ({
      nImported: foldderLibrarySections.importedMedia.length,
      nGenerated: foldderLibrarySections.generatedMedia.length + foldderLibrarySections.generatedTexts.length,
      nFiles: foldderLibrarySections.mediaFiles.length,
      nExports: foldderLibrarySections.exports.length,
    }),
    [foldderLibrarySections],
  );

  const projectAssetsCanvasValue = useMemo(
    () => ({
      librarySummary: projectAssetsLibrarySummary,
      assetsMetadata: metadata.assets,
      projectFiles,
      generatedTextAssets,
      projectScopeId,
      openProjectAssets: () => openFoldder("fullscreen"),
      saveGuionistaTextAsset,
      openGuionistaTextAsset,
    }),
    [
      projectAssetsLibrarySummary,
      metadata.assets,
      projectFiles,
      generatedTextAssets,
      projectScopeId,
      openFoldder,
      saveGuionistaTextAsset,
      openGuionistaTextAsset,
    ],
  );
  const standardDesktopNotes = useMemo(
    () => (nodes as Node[]).filter((node) => node.type === "notes"),
    [nodes],
  );
  const standardActiveFile = useMemo(
    () =>
      standardRuntimeApp?.fileId
        ? projectFiles.items.find((file) => file.id === standardRuntimeApp.fileId) ?? null
        : null,
    [projectFiles.items, standardRuntimeApp?.fileId],
  );
  const activeDesktopAppId = standardRuntimeApp?.appId ?? null;
  const primaryMinimizedApp = useMemo(
    () => standardMinimizedApp ?? openDesktopApps.find((app) => app.status === "minimized") ?? null,
    [openDesktopApps, standardMinimizedApp],
  );
  const minimizedDesktopAppId = useMemo(
    () => primaryMinimizedApp?.appId ?? null,
    [primaryMinimizedApp?.appId],
  );

  useEffect(() => {
    const onOpenBrain = () => {
      setBrainInitialSection(null);
      setProjectBrainOpen(true);
    };
    window.addEventListener("foldder-open-project-brain", onOpenBrain);
    return () => window.removeEventListener("foldder-open-project-brain", onOpenBrain);
  }, []);

  useEffect(() => {
    const onOpenAssets = () => openFoldder();
    window.addEventListener("foldder-open-project-assets", onOpenAssets);
    return () => window.removeEventListener("foldder-open-project-assets", onOpenAssets);
  }, [openFoldder]);

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

  const [showWelcome, setShowWelcome] = useState(false); // solo tras crear proyecto nuevo (post-login)
  /** Tras la clave: obliga a elegir proyecto o crear uno nuevo antes de cerrar el modal de proyectos. */
  const [postAuthProjectsGate, setPostAuthProjectsGate] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setViewport({ x: 120, y: 80, zoom: 0.72 });
    }, 50);
    return () => clearTimeout(t);
  }, []);

  const performCanvasUngroup = useSpacesCanvasUngroup(
    setNodes,
    setEdges,
    liveNodesRef,
    liveEdgesRef,
    takeSnapshot,
  );

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
      photoRoom: { image: ['in_0','in_1','in_2','in_3','in_4','in_5','in_6','in_7'] },
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
              animated: false,
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
                    animated: false,
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
                animated: false,
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

    const defaultStyleForType = defaultCanvasNodeStyleForType(type);

    const newNode = {
      id: newId,
      type,
      position,
      dragHandle: defaultCanvasNodeDragHandle(type),
      data: withFoldderCanvasIntro(type, {
        ...defaultDataForCanvasDropNode(type),
        label: type === "notes" ? "Note" : '',
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

  /** Presenter: botón «Generar video con esta imagen» → Carousel + Video Generator en el grafo. `liveNodesRef` en el handler evita re-suscribir el listener en cada cambio de nodos. */
  useEffect(() => {
    const onPresenterOpenGemini = (ev: Event) => {
      const d = (ev as CustomEvent<FoldderOpenGeminiVideoDetail>).detail;
      const url = d?.imageUrl;
      const videoPrompt = d?.videoPrompt;
      if (typeof url !== "string" || !url.trim()) return;
      if (typeof videoPrompt !== "string" || !videoPrompt.trim()) return;
      const t = Date.now();
      const promptId = `promptInput_${t}`;
      const urlId = `urlImage_${t}`;
      const vidId = `geminiVideo_${t}`;
      const center = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      const posVid = findEmptyPositionForNewNode("geminiVideo", liveNodesRef.current, center);
      const posUrl = findEmptyPositionForNewNode("urlImage", liveNodesRef.current, {
        x: posVid.x - 480,
        y: posVid.y + 20,
      });
      const posPrompt = findEmptyPositionForNewNode("promptInput", liveNodesRef.current, {
        x: posVid.x - 360,
        y: posVid.y - 300,
      });
      const promptNode = {
        id: promptId,
        type: "promptInput" as const,
        position: posPrompt,
        data: withFoldderCanvasIntro("promptInput", {
          ...defaultDataForCanvasDropNode("promptInput"),
          label: "Video — intención",
          value: videoPrompt.trim(),
        }),
      };
      const urlNode = {
        id: urlId,
        type: "urlImage" as const,
        position: posUrl,
        data: withFoldderCanvasIntro("urlImage", {
          ...defaultDataForCanvasDropNode("urlImage"),
          label: "Presentación",
          value: url.trim(),
          urls: [url.trim()],
          selectedIndex: 0,
          type: "image",
        }),
      };
      const vidNode = {
        id: vidId,
        type: "geminiVideo" as const,
        position: posVid,
        data: withFoldderCanvasIntro("geminiVideo", {
          ...defaultDataForCanvasDropNode("geminiVideo"),
          label: "Video Generator",
          _foldderOpenVideoStudio: true,
        }),
        style: {
          width: GEMINI_VIDEO_DEFAULT_W,
          height: GEMINI_VIDEO_DEFAULT_H,
        } as React.CSSProperties,
      };
      const edgePrompt = {
        id: `ae-${promptId}-${vidId}-prompt`,
        source: promptId,
        sourceHandle: "prompt",
        target: vidId,
        targetHandle: "prompt",
        type: "buttonEdge" as const,
        animated: false,
      };
      const edgeFrame = {
        id: `ae-${urlId}-${vidId}-image-firstFrame`,
        source: urlId,
        sourceHandle: "image",
        target: vidId,
        targetHandle: "firstFrame",
        type: "buttonEdge" as const,
        animated: false,
      };
      takeSnapshot();
      setNodes((nds) => [...nds, promptNode, urlNode, vidNode]);
      scheduleFoldderCanvasIntroEnd(promptId);
      scheduleFoldderCanvasIntroEnd(urlId);
      scheduleFoldderCanvasIntroEnd(vidId);
      setTimeout(() => {
        setEdges((es) => [...es, edgePrompt, edgeFrame]);
        queueMicrotask(() => {
          updateNodeInternals(promptId);
          updateNodeInternals(urlId);
          updateNodeInternals(vidId);
        });
      }, 50);
      setTimeout(() => {
        fitViewToNodeIds([promptId, urlId, vidId], 700);
      }, 100);
    };
    window.addEventListener(FOLDDER_OPEN_GEMINI_VIDEO_WITH_IMAGE_EVENT, onPresenterOpenGemini as EventListener);
    return () =>
      window.removeEventListener(FOLDDER_OPEN_GEMINI_VIDEO_WITH_IMAGE_EVENT, onPresenterOpenGemini as EventListener);
  }, [
    screenToFlowPosition,
    setNodes,
    setEdges,
    takeSnapshot,
    fitViewToNodeIds,
    updateNodeInternals,
    scheduleFoldderCanvasIntroEnd,
  ]);

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
      const pinStyle: React.CSSProperties | undefined = defaultCanvasNodeStyleForType(reactFlowType);
      const newNode = {
        id: newId,
        type: reactFlowType,
        position,
        dragHandle: defaultCanvasNodeDragHandle(reactFlowType),
        data: withFoldderCanvasIntro(reactFlowType, {
          ...defaultDataForCanvasDropNode(reactFlowType),
          value: '',
          label: reactFlowType === "notes" ? "Note" : `${reactFlowType} node`,
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

  const scheduleProjectSave = useCallback(() => {
    if (typeof window === "undefined") return;
    if (projectSaveDebounceTimerRef.current !== null) {
      window.clearTimeout(projectSaveDebounceTimerRef.current);
    }
    projectSaveDebounceTimerRef.current = window.setTimeout(() => {
      projectSaveDebounceTimerRef.current = null;
      const g = autosaveGateRef.current;
      if (!g.authenticated || !g.hasProject || g.openLoad || g.openNew || g.deleting) return;
      if (isSavingRef.current) {
        pendingProjectSaveAfterInFlightRef.current = true;
        return;
      }
      if (canvasPerformanceModeRef.current) {
        pendingProjectSaveAfterInteractionRef.current = true;
        return;
      }
      void saveProjectRef.current(undefined, {
        reason: "debounced",
        silentError: true,
        skipIfUnchanged: true,
      });
    }, PROJECT_SAVE_DEBOUNCE_MS);
  }, []);
  const notesProjectSaveTimerRef = useRef<number | null>(null);
  const scheduleNotesProjectSave = useCallback(() => {
    if (typeof window === "undefined") return;
    if (notesProjectSaveTimerRef.current !== null) {
      window.clearTimeout(notesProjectSaveTimerRef.current);
    }
    notesProjectSaveTimerRef.current = window.setTimeout(() => {
      notesProjectSaveTimerRef.current = null;
      scheduleProjectSave();
    }, 720);
  }, [scheduleProjectSave]);

  useEffect(
    () => () => {
      if (notesProjectSaveTimerRef.current !== null) {
        window.clearTimeout(notesProjectSaveTimerRef.current);
      }
    },
    [],
  );

  const beginCanvasPerformanceInteraction = useCallback(() => {
    if (typeof window !== "undefined" && canvasPerformanceReleaseTimerRef.current !== null) {
      window.clearTimeout(canvasPerformanceReleaseTimerRef.current);
      canvasPerformanceReleaseTimerRef.current = null;
    }
    if (canvasPerformanceModeRef.current) return;
    canvasPerformanceModeRef.current = true;
    canvasInteractionStartedAtRef.current = performance.now();
    setCanvasPerformanceMode(true);
    dispatchFoldderCanvasPerformanceMode(true);
  }, []);

  const endCanvasPerformanceInteraction = useCallback(() => {
    if (typeof window === "undefined") {
      canvasPerformanceModeRef.current = false;
      setCanvasPerformanceMode(false);
      dispatchFoldderCanvasPerformanceMode(false);
      return;
    }
    if (canvasPerformanceReleaseTimerRef.current !== null) {
      window.clearTimeout(canvasPerformanceReleaseTimerRef.current);
    }
    canvasPerformanceReleaseTimerRef.current = window.setTimeout(() => {
      canvasPerformanceReleaseTimerRef.current = null;
      canvasPerformanceModeRef.current = false;
      const startedAt = canvasInteractionStartedAtRef.current;
      canvasInteractionStartedAtRef.current = null;
      setCanvasPerformanceMode(false);
      dispatchFoldderCanvasPerformanceMode(false);
      if (startedAt !== null) {
        dispatchFoldderPerformanceMeasure({
          name: "canvas.interaction",
          durationMs: performance.now() - startedAt,
        });
      }
      if (pendingProjectSaveAfterInteractionRef.current) {
        pendingProjectSaveAfterInteractionRef.current = false;
        scheduleProjectSave();
      }
    }, 180);
  }, [scheduleProjectSave]);

  useEffect(() => {
    if (!edges.some((edge) => edge.animated)) return;
    setEdges((currentEdges) => {
      let changed = false;
      const nextEdges = currentEdges.map((edge) => {
        if (!edge.animated) return edge;
        changed = true;
        return { ...edge, animated: false };
      });
      return changed ? nextEdges : currentEdges;
    });
  }, [edges, setEdges]);

  const createStandardNote = useCallback(() => {
    const viewport = getViewport();
    const topSafe = Math.max(360, Math.min(440, window.innerHeight * 0.4));
    const bottomSafe = 130;
    const maxX = Math.max(NOTE_MARGIN, window.innerWidth - NOTE_MARGIN - NOTE_WIDTH);
    const maxY = Math.max(topSafe, window.innerHeight - bottomSafe - NOTE_HEIGHT);
    const existingNotes = liveNodesRef.current
      .filter((node) => node.type === "notes")
      .map((node) => {
        const style = (node.style as { width?: number; height?: number } | undefined) ?? {};
        const width = typeof style.width === "number" ? style.width : NOTE_WIDTH;
        const height = typeof style.height === "number" ? style.height : NOTE_HEIGHT;
        return {
          left: node.position.x * viewport.zoom + viewport.x,
          top: node.position.y * viewport.zoom + viewport.y,
          width: width * viewport.zoom,
          height: height * viewport.zoom,
        };
      });

    let chosenScreenX = NOTE_MARGIN;
    let chosenScreenY = topSafe;
    let foundSlot = false;
    for (let y = topSafe; y <= maxY && !foundSlot; y += NOTE_HEIGHT + NOTE_GAP) {
      for (let x = NOTE_MARGIN; x <= maxX && !foundSlot; x += NOTE_WIDTH + NOTE_GAP) {
        const overlaps = existingNotes.some((note) => {
          const horizontal = x < note.left + note.width + NOTE_GAP && x + NOTE_WIDTH + NOTE_GAP > note.left;
          const vertical = y < note.top + note.height + NOTE_GAP && y + NOTE_HEIGHT + NOTE_GAP > note.top;
          return horizontal && vertical;
        });
        if (!overlaps) {
          chosenScreenX = x;
          chosenScreenY = y;
          foundSlot = true;
        }
      }
    }

    const nodeId = `notes_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const newNode = {
      id: nodeId,
      type: "notes",
      position: screenToFlowPosition({ x: chosenScreenX, y: chosenScreenY }),
      dragHandle: defaultCanvasNodeDragHandle("notes"),
      data: withFoldderCanvasIntro("notes", createEmptyNotesNodeData()),
      style: defaultCanvasNodeStyleForType("notes"),
      selected: true,
    };
    takeSnapshot();
    setNodes((nds) => [...nds.map((node) => ({ ...node, selected: false })), newNode]);
    scheduleFoldderCanvasIntroEnd(nodeId);
    scheduleNotesProjectSave();
  }, [getViewport, scheduleFoldderCanvasIntroEnd, scheduleNotesProjectSave, screenToFlowPosition, setNodes, takeSnapshot]);

  const updateStandardNote = useCallback((nodeId: string, patch: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId
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
    scheduleNotesProjectSave();
  }, [scheduleNotesProjectSave, setNodes]);

  const duplicateStandardNote = useCallback((nodeId: string) => {
    takeSnapshot();
    setNodes((nds) => {
      const source = nds.find((node) => node.id === nodeId && node.type === "notes");
      if (!source) return nds;
      const style = (source.style as React.CSSProperties | undefined) ?? defaultCanvasNodeStyleForType("notes");
      const duplicateId = `notes_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
            title: typeof source.data?.title === "string" ? `${source.data.title} copy` : "Note copy",
            label: typeof source.data?.title === "string" ? `${source.data.title} copy` : "Note copy",
            updatedAt: new Date().toISOString(),
          },
          style,
        },
      ];
    });
    scheduleNotesProjectSave();
  }, [scheduleNotesProjectSave, setNodes, takeSnapshot]);

  const deleteStandardNote = useCallback((nodeId: string) => {
    takeSnapshot();
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    scheduleNotesProjectSave();
  }, [scheduleNotesProjectSave, setEdges, setNodes, takeSnapshot]);

  const moveStandardNote = useCallback((nodeId: string, dxPx: number, dyPx: number) => {
    const zoom = Math.max(getViewport().zoom || 1, 0.01);
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              position: {
                x: node.position.x + dxPx / zoom,
                y: node.position.y + dyPx / zoom,
              },
            }
          : node,
      ),
    );
    scheduleNotesProjectSave();
  }, [getViewport, scheduleNotesProjectSave, setNodes]);

  const syncStandardNoteHeight = useCallback((nodeId: string, heightPx: number) => {
    const nextHeight = Math.max(NOTE_HEIGHT, heightPx);
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id !== nodeId) return node;
        const style = (node.style as React.CSSProperties | undefined) ?? {};
        if (typeof style.height === "number" && Math.abs(style.height - nextHeight) < 2) {
          return node;
        }
        return {
          ...node,
          height: nextHeight,
          measured: {
            ...(node.measured ?? {}),
            width: NOTE_WIDTH,
            height: nextHeight,
          },
          style: {
            ...style,
            width: NOTE_WIDTH,
            height: nextHeight,
          },
        };
      }),
    );
    requestAnimationFrame(() => {
      updateNodeInternals(nodeId);
      requestAnimationFrame(() => updateNodeInternals(nodeId));
    });
    scheduleNotesProjectSave();
  }, [scheduleNotesProjectSave, setNodes, updateNodeInternals]);

  const dispatchStudioOpen = useCallback((detail: FoldderStudioEventDetail) => {
    dispatchFoldderStudioEvent(FOLDDER_OPEN_STUDIO_EVENT, detail);
    dispatchFoldderStudioEvent(FOLDDER_LEGACY_OPEN_NODE_STUDIO_EVENT, detail);
    dispatchFoldderStudioEvent(FOLDDER_STUDIO_OPENED_EVENT, detail);
    if (detail.nodeType === "photoRoom" && detail.nodeId) {
      window.dispatchEvent(
        new CustomEvent("foldder-open-photo-room-studio", {
          detail: { ...detail, nodeId: detail.nodeId, photoRoomNodeId: detail.nodeId },
        }),
      );
    }
  }, []);

  const dispatchStudioClose = useCallback((detail: FoldderStudioEventDetail) => {
    dispatchFoldderStudioEvent(FOLDDER_CLOSE_STUDIO_EVENT, detail);
    dispatchFoldderStudioEvent(FOLDDER_LEGACY_CLOSE_NODE_STUDIO_EVENT, detail);
    dispatchFoldderStudioEvent(FOLDDER_STUDIO_CLOSED_EVENT, detail);
  }, []);

  const openStandardBackedNode = useCallback(
    (
      nodeId: string,
      nodeType?: string,
      fileId?: string,
      appId?: string,
      standardShell?: FoldderStudioEventDetail["standardShell"],
    ) => {
      if (nodeType === "projectBrain") {
        setBrainInitialSection(null);
        setProjectBrainOpen(true);
        return;
      }
      if (nodeType === "projectAssets") {
        openFoldder();
        return;
      }
      dispatchStudioOpen({ nodeId, nodeType, fileId, appId, standardShell });
    },
    [dispatchStudioOpen, openFoldder],
  );

  const closeStandardRuntimeSurface = useCallback((app: StandardRuntimeApp | null) => {
    if (!app) return;
    if (app.kind === "brain" || app.nodeType === "projectBrain") {
      setProjectBrainOpen(false);
      setBrainInitialSection(null);
      return;
    }
    if (app.kind === "assets" || app.nodeType === "projectAssets") {
      setProjectAssetsOpen(false);
      return;
    }
    if (!app.nodeId) return;
    dispatchStudioClose({ nodeId: app.nodeId, nodeType: app.nodeType, fileId: app.fileId, appId: app.appId });
  }, [dispatchStudioClose]);

  const minimizeStandardRuntimeApp = useCallback(() => {
    const app = standardRuntimeApp;
    if (!app) return;
    dispatchFoldderStudioEvent(FOLDDER_MINIMIZE_STUDIO_EVENT, {
      nodeId: app.nodeId,
      nodeType: app.nodeType,
      fileId: app.fileId,
      appId: app.appId,
    });
    closeStandardRuntimeSurface(app);
    minimizeRegisteredDesktopApp(app);
  }, [closeStandardRuntimeSurface, minimizeRegisteredDesktopApp, standardRuntimeApp]);

  const closeStandardRuntimeApp = useCallback(() => {
    closeStandardRuntimeSurface(standardRuntimeApp);
    closeRegisteredDesktopApp(standardRuntimeApp);
  }, [closeRegisteredDesktopApp, closeStandardRuntimeSurface, standardRuntimeApp]);

  const restoreStandardRuntimeApp = useCallback((appToRestore?: StandardRuntimeApp | null) => {
    const app = appToRestore ?? standardMinimizedApp;
    if (!app) return;
    dispatchFoldderStudioEvent(FOLDDER_RESTORE_STUDIO_EVENT, {
      nodeId: app.nodeId,
      nodeType: app.nodeType,
      fileId: app.fileId,
      appId: app.appId,
    });
    registerStandardRuntimeApp({ ...app, status: "open" });
    if (app.nodeId) openStandardBackedNode(app.nodeId, app.nodeType, app.fileId, app.appId, standardShellForRuntimeApp(app));
    else if (app.kind === "brain") {
      setBrainInitialSection(null);
      setProjectBrainOpen(true);
    } else if (app.kind === "assets") {
      openFoldder();
    }
  }, [openFoldder, openStandardBackedNode, registerStandardRuntimeApp, standardMinimizedApp]);

  useEffect(() => {
    const onExportCreated = (event: Event) => {
      const detail = (event as CustomEvent<FoldderExportCreatedDetail>).detail;
      if (!detail?.name || !detail.extension) return;
      const currentFiles = getProjectFilesFromMetadata(metadata);
      const sourceFileId =
        detail.sourceFileId ??
        currentFiles.items.find(
          (file) =>
            file.kind !== "export" &&
            file.metadata?.hidden !== true &&
            detail.sourceNodeId &&
            file.backingNodeId === detail.sourceNodeId,
        )?.id;
      const sourceNode = detail.sourceNodeId
        ? nodes.find((node) => node.id === detail.sourceNodeId)
        : null;
      const sourceThumbnail =
        detail.thumbnailUrl ??
        (sourceNode?.data && typeof sourceNode.data === "object" && typeof (sourceNode.data as Record<string, unknown>).value === "string"
          ? ((sourceNode.data as Record<string, unknown>).value as string)
          : undefined);

      const exportFile = createProjectExportFile({
        ...detail,
        sourceFileId,
        thumbnailUrl: sourceThumbnail,
      });
      setMetadata((m: Record<string, unknown>) => ({
        ...setProjectFilesInMetadata(m, upsertProjectFile(m, exportFile)),
      }));
      scheduleProjectSave();
    };

    window.addEventListener(FOLDDER_EXPORT_CREATED_EVENT, onExportCreated as EventListener);
    return () => window.removeEventListener(FOLDDER_EXPORT_CREATED_EVENT, onExportCreated as EventListener);
  }, [metadata, nodes, scheduleProjectSave]);

  const openStandardFile = useCallback(
    (file: ProjectFile) => {
      const appConfig = studioAppForFileKind(file.kind);
      if (file.kind === "export" || !appConfig?.nodeType || !appConfig.canOpenFile) {
        window.alert("Este archivo todavía no tiene apertura directa.");
        return;
      }
      if (!file.backingNodeId) {
        if (file.kind === "brain") {
          registerStandardRuntimeApp(createOpenDesktopApp({ id: file.id, title: file.name, appId: appConfig.appId, fileId: file.id, kind: file.kind, nodeType: appConfig.nodeType }));
          setBrainInitialSection(null);
          setProjectBrainOpen(true);
          return;
        }
        if (file.kind === "assets") {
          registerStandardRuntimeApp(createOpenDesktopApp({ id: file.id, title: file.name, appId: appConfig.appId, fileId: file.id, kind: file.kind, nodeType: appConfig.nodeType }));
          openFoldder();
          return;
        }
        window.alert("Este archivo todavía no tiene apertura directa.");
        return;
      }
      const backingNode = nodes.find((node) => node.id === file.backingNodeId);
      if (!backingNode) {
        window.alert("No encuentro el nodo interno de este archivo. Cambia a Vista Pro para revisar el proyecto.");
        return;
      }
      const nodeType = file.nodeType || backingNode.type;
      if (!nodeType || nodeType !== appConfig.nodeType) {
        window.alert("Este archivo todavía no tiene apertura directa.");
        return;
      }
      const app = createOpenDesktopApp({
        id: file.id,
        title: file.name,
        appId: appConfig.appId,
        fileId: file.id,
        kind: file.kind,
        nodeId: file.backingNodeId,
        nodeType,
      });
      registerStandardRuntimeApp(app);
      openStandardBackedNode(file.backingNodeId, nodeType, file.id, appConfig.appId, {
        appLabel: appConfig.label,
        fileName: file.name,
        canSaveAs: true,
      });
    },
    [nodes, openFoldder, openStandardBackedNode, registerStandardRuntimeApp],
  );

  const createStandardFileForApp = useCallback(
    (app: StudioAppConfig) => {
      const reactFlowType = app.nodeType;
      if (!app || !reactFlowType) return;
      if (reactFlowType === "projectBrain") {
        registerStandardRuntimeApp(createOpenDesktopApp({ id: "brain", title: "Brain", kind: "brain", appId: app.appId, nodeType: reactFlowType }));
        setBrainInitialSection(null);
        setProjectBrainOpen(true);
        return;
      }
      if (reactFlowType === "projectAssets") {
        openFoldder();
        return;
      }
      if (app.requiresSourceFile) {
        window.alert("Presentar necesita un archivo .design. Elige uno desde la carpeta Foldder.");
        return;
      }
      if (!NODE_REGISTRY[reactFlowType]) return;
      const defaultName = `${app.label} ${nodes.filter((node) => node.type === reactFlowType).length + 1}`;
      const requestedName = window.prompt(`Nuevo archivo ${app.label}`, defaultName);
      if (requestedName === null) return;
      const baseName = requestedName.trim() || defaultName;

      const viewportCenter = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      const preferred = preferredCenterRightOfRightmostNode(nodes, reactFlowType);
      const position = findEmptyPositionForNewNode(reactFlowType, nodes, preferred ?? viewportCenter);
      const nodeId = `node_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const standardStyle: React.CSSProperties | undefined = defaultCanvasNodeStyleForType(reactFlowType);
      const newNode = {
        id: nodeId,
        type: reactFlowType,
        position,
        dragHandle: defaultCanvasNodeDragHandle(reactFlowType),
        data: withFoldderCanvasIntro(reactFlowType, {
          ...defaultDataForCanvasDropNode(reactFlowType),
          label: baseName,
        }),
        ...(standardStyle ? { style: standardStyle } : {}),
      };
      const file = createProjectFileForStudioNode({
        node: newNode as Node,
        name: baseName,
      });

      takeSnapshot();
      setNodes((nds) => [...nds, newNode]);
      scheduleFoldderCanvasIntroEnd(nodeId);
      if (file) {
        registerStandardRuntimeApp(createOpenDesktopApp({
          id: file.id,
          title: file.name,
          appId: app.appId,
          fileId: file.id,
          kind: file.kind,
          nodeId,
          nodeType: reactFlowType,
        }));
        setMetadata((m: Record<string, unknown>) => ({
          ...setProjectFilesInMetadata(m, upsertProjectFile(m, file)),
        }));
        scheduleProjectSave();
      }
      window.setTimeout(() => openStandardBackedNode(nodeId, reactFlowType, file?.id, app.appId, file ? {
        appLabel: app.label,
        fileName: file.name,
        canSaveAs: true,
      } : undefined), 180);
    },
    [
      nodes,
      openFoldder,
      openStandardBackedNode,
      registerStandardRuntimeApp,
      scheduleFoldderCanvasIntroEnd,
      scheduleProjectSave,
      screenToFlowPosition,
      setNodes,
      takeSnapshot,
    ],
  );

  const renameProjectFile = useCallback((file: ProjectFile) => {
    const requestedName = window.prompt("Renombrar archivo", file.name);
    if (requestedName === null) return;
    const trimmed = requestedName.trim();
    if (!trimmed) return;
    const ext = file.extension ?? "";
    const nextName = ext && !trimmed.toLowerCase().endsWith(ext.toLowerCase()) ? `${trimmed}${ext}` : trimmed;
    const label = ext && nextName.toLowerCase().endsWith(ext.toLowerCase())
      ? nextName.slice(0, -ext.length)
      : nextName;
    setMetadata((m: Record<string, unknown>) => ({
      ...setProjectFilesInMetadata(
        m,
        updateProjectFileInMetadata(m, file.id, (row) => ({
          ...row,
          name: nextName,
          updatedAt: new Date().toISOString(),
        })),
      ),
    }));
    if (file.backingNodeId) {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === file.backingNodeId
            ? { ...node, data: { ...node.data, label } }
            : node,
        ),
      );
    }
    scheduleProjectSave();
  }, [scheduleProjectSave, setNodes]);

  const hideProjectFile = useCallback((file: ProjectFile) => {
    const ok = window.confirm(`Quitar "${file.name}" de la vista Foldder? No se borrará el nodo ni los assets.`);
    if (!ok) return;
    setMetadata((m: Record<string, unknown>) => ({
      ...setProjectFilesInMetadata(
        m,
        updateProjectFileInMetadata(m, file.id, (row) => ({
          ...row,
          metadata: { ...(row.metadata ?? {}), hidden: true },
          updatedAt: new Date().toISOString(),
        })),
      ),
    }));
    scheduleProjectSave();
  }, [scheduleProjectSave]);

  const saveProjectFileAs = useCallback((file: ProjectFile) => {
    if (file.kind === "export") {
      window.alert("Guardar como solo duplica trabajos editables de Media Files, no exports.");
      return;
    }
    if (!file.backingNodeId) {
      window.alert("Este archivo todavía no tiene un nodo interno para duplicar.");
      return;
    }
    const original = nodes.find((node) => node.id === file.backingNodeId);
    if (!original || !original.type || original.type === "canvasGroup") {
      window.alert("No encuentro el nodo interno de este archivo. Cambia a Vista Pro para revisar el proyecto.");
      return;
    }
    const appConfig = studioAppForFileKind(file.kind);
    if (!appConfig?.nodeType || original.type !== appConfig.nodeType) {
      window.alert("Este archivo todavía no se puede duplicar con Guardar como.");
      return;
    }
    const ext = file.extension ?? "";
    const baseForPrompt = ext && file.name.toLowerCase().endsWith(ext.toLowerCase())
      ? file.name.slice(0, -ext.length)
      : file.name;
    const requestedName = window.prompt("Guardar como", `${baseForPrompt} v2`);
    if (requestedName === null) return;
    const trimmed = requestedName.trim();
    if (!trimmed) return;
    const nextName = ext && !trimmed.toLowerCase().endsWith(ext.toLowerCase()) ? `${trimmed}${ext}` : trimmed;
    const label = ext && nextName.toLowerCase().endsWith(ext.toLowerCase())
      ? nextName.slice(0, -ext.length)
      : nextName;
    const newId = `${original.type}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    let rawData: Record<string, unknown> = {};
    if (original.data && typeof original.data === "object") {
      try {
        rawData = JSON.parse(JSON.stringify(original.data)) as Record<string, unknown>;
      } catch {
        rawData = { ...(original.data as Record<string, unknown>) };
      }
    }
    delete rawData._foldderCanvasIntro;
    const newNode = {
      ...original,
      id: newId,
      position: { x: original.position.x + 36, y: original.position.y + 36 },
      selected: false,
      data: withFoldderCanvasIntro(String(original.type), { ...rawData, label }),
    };
    const newFile = createProjectFileForStudioNode({
      node: newNode as Node,
      name: nextName,
      sourceFileId: file.sourceFileId ?? file.id,
      sourceNodeId: file.sourceNodeId ?? file.backingNodeId,
    });
    takeSnapshot();
    setNodes((nds) => [...nds.map((node) => ({ ...node, selected: false })), newNode]);
    scheduleFoldderCanvasIntroEnd(newId);
    if (newFile) {
      setMetadata((m: Record<string, unknown>) => ({
        ...setProjectFilesInMetadata(m, upsertProjectFile(m, newFile)),
      }));
      const appConfig = studioAppForFileKind(newFile.kind);
      registerStandardRuntimeApp(createOpenDesktopApp({
        id: newFile.id,
        title: newFile.name,
        appId: appConfig?.appId ?? String(newFile.kind),
        fileId: newFile.id,
        kind: newFile.kind,
        nodeId: newId,
        nodeType: original.type,
      }));
      window.setTimeout(() => openStandardBackedNode(newId, original.type, newFile.id, appConfig?.appId, {
        appLabel: appConfig?.label ?? "App",
        fileName: newFile.name,
        canSaveAs: true,
      }), 180);
    }
    scheduleProjectSave();
  }, [nodes, openStandardBackedNode, registerStandardRuntimeApp, scheduleFoldderCanvasIntroEnd, scheduleProjectSave, setNodes, takeSnapshot]);

  const openPresenterForDesignFile = useCallback((file: ProjectFile) => {
    if (file.kind !== "designer" || !file.backingNodeId) {
      window.alert("Presentar necesita un archivo .design con nodo Designer interno.");
      return;
    }
    const designerNode = nodes.find((node) => node.id === file.backingNodeId);
    if (!designerNode || designerNode.type !== "designer") {
      window.alert("No encuentro el nodo Designer interno de este archivo.");
      return;
    }
    const currentProjectFiles = getProjectFilesFromMetadata(metadata);
    const existing = currentProjectFiles.items.find(
      (row) =>
        row.kind === "presenter" &&
        row.metadata?.hidden !== true &&
        (row.sourceFileId === file.id || row.sourceNodeId === file.backingNodeId) &&
        row.backingNodeId &&
        nodes.some((node) => node.id === row.backingNodeId && node.type === "presenter"),
    );
    if (existing?.backingNodeId) {
      openStandardFile(existing);
      return;
    }

    const connectedPresenterEdge = edges.find(
      (edge) =>
        edge.source === file.backingNodeId &&
        (edge.targetHandle === "document" || edge.targetHandle == null) &&
        nodes.some((node) => node.id === edge.target && node.type === "presenter"),
    );
    const connectedPresenterNode = connectedPresenterEdge
      ? nodes.find((node) => node.id === connectedPresenterEdge.target && node.type === "presenter")
      : null;
    if (connectedPresenterNode) {
      const nodeLabel =
        typeof connectedPresenterNode.data?.label === "string" && connectedPresenterNode.data.label.trim()
          ? connectedPresenterNode.data.label.trim()
          : `Presentar ${file.name.replace(/\.design$/i, "")}`;
      const projectFile = createProjectFileForStudioNode({
        node: connectedPresenterNode as Node,
        name: `${nodeLabel}.presenter`,
        sourceFileId: file.id,
        sourceNodeId: file.backingNodeId,
      });
      if (!projectFile) {
        openStandardBackedNode(connectedPresenterNode.id, "presenter", undefined, "presenter");
        return;
      }
      setMetadata((m: Record<string, unknown>) => ({
        ...setProjectFilesInMetadata(m, upsertProjectFile(m, projectFile)),
      }));
      registerStandardRuntimeApp(createOpenDesktopApp({
        id: projectFile.id,
        title: projectFile.name,
        appId: "presenter",
        fileId: projectFile.id,
        kind: "presenter",
        nodeId: connectedPresenterNode.id,
        nodeType: "presenter",
      }));
      window.setTimeout(() => openStandardBackedNode(connectedPresenterNode.id, "presenter", projectFile.id, "presenter", {
        appLabel: "Presentar",
        fileName: projectFile.name,
        canSaveAs: true,
      }), 120);
      scheduleProjectSave();
      return;
    }

    const nodeId = `presenter_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const nodeLabel = `Presentar ${file.name.replace(/\.design$/i, "")}`;
    const presenterNode = {
      id: nodeId,
      type: "presenter",
      position: {
        x: designerNode.position.x + 420,
        y: designerNode.position.y,
      },
      data: withFoldderCanvasIntro("presenter", {
        ...defaultDataForCanvasDropNode("presenter"),
        label: nodeLabel,
      }),
    };
    const edge = {
      id: `std-present-${file.backingNodeId}-${nodeId}-${Date.now()}`,
      source: file.backingNodeId,
      sourceHandle: "document",
      target: nodeId,
      targetHandle: "document",
      type: "buttonEdge" as const,
      animated: false,
    };
    const projectFile = createProjectFileForStudioNode({
      node: presenterNode as Node,
      name: `${nodeLabel}.presenter`,
      sourceFileId: file.id,
      sourceNodeId: file.backingNodeId,
    });
    takeSnapshot();
    setNodes((nds) => [...nds, presenterNode]);
    setEdges((eds) => [...eds, edge]);
    scheduleFoldderCanvasIntroEnd(nodeId);
    if (projectFile) {
      setMetadata((m: Record<string, unknown>) => ({
        ...setProjectFilesInMetadata(m, upsertProjectFile(m, projectFile)),
      }));
      registerStandardRuntimeApp(createOpenDesktopApp({
        id: projectFile.id,
        title: projectFile.name,
        appId: "presenter",
        fileId: projectFile.id,
        kind: "presenter",
        nodeId,
        nodeType: "presenter",
      }));
      window.setTimeout(() => openStandardBackedNode(nodeId, "presenter", projectFile.id, "presenter", {
        appLabel: "Presentar",
        fileName: projectFile.name,
        canSaveAs: true,
      }), 180);
    }
    scheduleProjectSave();
  }, [
    edges,
    metadata,
    nodes,
    openStandardBackedNode,
    openStandardFile,
    registerStandardRuntimeApp,
    scheduleFoldderCanvasIntroEnd,
    scheduleProjectSave,
    setEdges,
    setNodes,
    takeSnapshot,
  ]);

  const handleDesktopDockAppClick = useCallback((app: StudioAppConfig) => {
    const minimizedApp =
      openDesktopApps.find((row) => row.appId === app.appId && row.status === "minimized") ??
      (standardMinimizedApp?.appId === app.appId ? standardMinimizedApp : null);
    if (minimizedApp) {
      restoreStandardRuntimeApp(minimizedApp);
      return;
    }
    if (app.appId === "brain") {
      registerStandardRuntimeApp(createOpenDesktopApp({ id: "brain", title: "Brain", kind: "brain", appId: app.appId, nodeType: app.nodeType }));
      setBrainInitialSection(null);
      setProjectBrainOpen(true);
      return;
    }
    if (app.appId === "files") {
      openFoldder("panel");
    }
  }, [openDesktopApps, openFoldder, registerStandardRuntimeApp, restoreStandardRuntimeApp, standardMinimizedApp]);

  useEffect(() => {
    const onSaveAs = (event: Event) => {
      const detail = (event as CustomEvent<FoldderStudioEventDetail>).detail;
      const file =
        (detail?.fileId ? projectFiles.items.find((item) => item.id === detail.fileId) : null) ??
        standardActiveFile;
      if (file) saveProjectFileAs(file);
    };
    const onMinimize = () => minimizeStandardRuntimeApp();
    const onClose = () => closeStandardRuntimeApp();
    window.addEventListener(FOLDDER_STANDARD_STUDIO_SAVE_AS_REQUEST_EVENT, onSaveAs as EventListener);
    window.addEventListener(FOLDDER_STANDARD_STUDIO_MINIMIZE_REQUEST_EVENT, onMinimize);
    window.addEventListener(FOLDDER_STANDARD_STUDIO_CLOSE_REQUEST_EVENT, onClose);
    return () => {
      window.removeEventListener(FOLDDER_STANDARD_STUDIO_SAVE_AS_REQUEST_EVENT, onSaveAs as EventListener);
      window.removeEventListener(FOLDDER_STANDARD_STUDIO_MINIMIZE_REQUEST_EVENT, onMinimize);
      window.removeEventListener(FOLDDER_STANDARD_STUDIO_CLOSE_REQUEST_EVENT, onClose);
    };
  }, [closeStandardRuntimeApp, minimizeStandardRuntimeApp, projectFiles.items, saveProjectFileAs, standardActiveFile]);

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
    setNodes((nds) => {
      const target = nds.find((n) => n.id === node.id);
      if (!target) return nds;
      const styleSrc = target.style as Record<string, unknown> | undefined;
      const hasLegacyStyleZ = !!styleSrc && Object.prototype.hasOwnProperty.call(styleSrc, "zIndex");
      const maxZ = nds.reduce((m, n) => Math.max(m, Number.isFinite(n.zIndex as number) ? (n.zIndex as number) : 0), 0);
      const currentZ = Number.isFinite(target.zIndex as number) ? (target.zIndex as number) : 0;
      if (!hasLegacyStyleZ && currentZ >= maxZ) return nds;
      lastClickedRef.current = Math.max(lastClickedRef.current ?? 0, maxZ) + 1;
      const nextZ = lastClickedRef.current;
      return nds.map((n) => {
        if (n.id !== node.id) return n;
        const style = n.style ? { ...(n.style as Record<string, unknown>) } : {};
        delete (style as { zIndex?: number }).zIndex;
        return {
          ...n,
          zIndex: nextZ,
          style: Object.keys(style).length > 0 ? (style as React.CSSProperties) : undefined,
        };
      });
    });
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
        if (node.type === "notes" && reactFlowWrapper.current) {
          const nodeEl = document.querySelector(`.react-flow__node[data-id="${CSS.escape(node.id)}"]`) as HTMLElement | null;
          const wrapperEl = reactFlowWrapper.current;
          if (nodeEl) {
            const nodeRect = nodeEl.getBoundingClientRect();
            const wrapperRect = wrapperEl.getBoundingClientRect();
            const currentViewport = getViewport();
            const currentZoom = Math.max(currentViewport.zoom || 1, 0.0001);
            const flowLeft = (nodeRect.left - wrapperRect.left - currentViewport.x) / currentZoom;
            const flowTop = (nodeRect.top - wrapperRect.top - currentViewport.y) / currentZoom;
            const flowWidth = nodeRect.width / currentZoom;
            const flowHeight = nodeRect.height / currentZoom;
            const paddingRatio = 0.12;
            const availableWidth = Math.max(120, wrapperRect.width * (1 - paddingRatio * 2));
            const availableHeight = Math.max(120, wrapperRect.height * (1 - paddingRatio * 2));
            const nextZoom = Math.min(availableWidth / flowWidth, availableHeight / flowHeight);
            const centerX = flowLeft + flowWidth / 2;
            const centerY = flowTop + flowHeight / 2;
            void setViewport(
              {
                x: wrapperRect.width / 2 - centerX * nextZoom,
                y: wrapperRect.height / 2 - centerY * nextZoom,
                zoom: nextZoom,
              },
              { duration: fitAnim(650), interpolate: "smooth", ...FOLDDER_FIT_VIEW_EASE },
            );
            return;
          }
        }
        updateNodeInternals(node.id);
        requestAnimationFrame(() => {
          updateNodeInternals(node.id);
          requestAnimationFrame(() => {
            fitViewToNodeIds([node.id], 650);
          });
        });
      }
    },
    [fitView, fitViewToNodeIds, getViewport, setViewport, updateNodeInternals]
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
  const keyboardShortcutsRef = useRef<SpacesCanvasKeyboardShortcutsRef>({
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

  useSpacesCanvasKeyboard(
    liveNodesRef,
    liveEdgesRef,
    keyboardShortcutsRef,
    autoLayoutKeyParityRef,
    groupSelectedToSpaceRef,
    groupSelectedToCanvasGroupRef,
    ungroupSelectedCanvasGroupRef,
  );

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
      return !!t.closest('[contenteditable="true"], .nokey, [data-foldder-text-editing="true"]');
    };
    const isTypingNow = (eventTarget: EventTarget | null) => {
      if (typingTarget(eventTarget)) return true;
      return typingTarget(document.activeElement);
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
      if (isTypingNow(e.target)) return;
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
      if (isTypingNow(e.target) && !spaceHeldForOverviewRef.current) return;

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
  const buildProjectUiSnapshot = useCallback(
    (): ProjectUiSnapshot => ({
      activeSpaceId,
      canvasBgId,
      canvasViewMode,
      cardsFocusIndex,
      navigationStack,
      sidebarLockedCollapsed,
      viewport: viewportRef.current,
      workspaceViewMode,
    }),
    [
      activeSpaceId,
      canvasBgId,
      canvasViewMode,
      cardsFocusIndex,
      navigationStack,
      sidebarLockedCollapsed,
      workspaceViewMode,
    ],
  );

  const saveProjectUiSnapshot = useCallback(async () => {
    if (!isAuthenticated || !activeProjectId) return;
    const ui = buildProjectUiSnapshot();
    const fingerprint = projectSaveFingerprint(ui);
    if (lastSavedUiFingerprintRef.current === fingerprint) return;
    try {
      const res = await fetch("/api/spaces/ui", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...devBypassHeaders },
        body: JSON.stringify({ id: activeProjectId, ui }),
      });
      if (!res.ok) {
        const payload = await readResponseJson<{ error?: string }>(res, "POST /api/spaces/ui");
        console.warn("[FOLDDER ui-save] Lightweight UI save failed:", payload?.error ?? res.status);
        return;
      }
      lastSavedUiFingerprintRef.current = fingerprint;
    } catch (error) {
      console.warn("[FOLDDER ui-save] Lightweight UI save failed:", error);
    }
  }, [activeProjectId, buildProjectUiSnapshot, devBypassHeaders, isAuthenticated]);

  const scheduleProjectUiSave = useCallback(() => {
    if (!isAuthenticated || !activeProjectId || typeof window === "undefined") return;
    if (projectUiSaveDebounceTimerRef.current !== null) {
      window.clearTimeout(projectUiSaveDebounceTimerRef.current);
    }
    projectUiSaveDebounceTimerRef.current = window.setTimeout(() => {
      projectUiSaveDebounceTimerRef.current = null;
      void saveProjectUiSnapshot();
    }, PROJECT_UI_SAVE_DEBOUNCE_MS);
  }, [activeProjectId, isAuthenticated, saveProjectUiSnapshot]);

  const onViewportChangeFromFlow = useCallback(
    (vp: { x: number; y: number; zoom: number }) => {
      viewportRef.current = vp;
      if (typeof vp.zoom === 'number' && Number.isFinite(vp.zoom)) {
        setViewportZoomCssVar(vp.zoom);
        setCanvasZoom(vp.zoom);
      }
      scheduleProjectUiSave();
    },
    [scheduleProjectUiSave, setViewportZoomCssVar]
  );

  useOnViewportChange({ onChange: onViewportChangeFromFlow });

  useEffect(() => {
    scheduleProjectUiSave();
  }, [
    activeSpaceId,
    canvasBgId,
    canvasViewMode,
    cardsFocusIndex,
    navigationStack,
    scheduleProjectUiSave,
    sidebarLockedCollapsed,
    workspaceViewMode,
  ]);

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

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.replace("/");
    }
  }, [router, sessionStatus]);

  useEffect(() => {
    if (!isAuthenticated) return;
    return installAiFetchOverlay();
  }, [isAuthenticated]);

  /** Al entrar o salir de pantalla completa (navegador), reencuadrar el grafo al nuevo tamaño de viewport. */
  const prevBrowserFullscreenRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!isAuthenticated) return;
    if (canvasViewMode === 'cards') return;

    if (prevBrowserFullscreenRef.current === null) {
      prevBrowserFullscreenRef.current = browserFullscreen;
      return;
    }
    if (prevBrowserFullscreenRef.current === browserFullscreen) return;
    prevBrowserFullscreenRef.current = browserFullscreen;

    if (nodes.length === 0) return;

    const t = window.setTimeout(() => {
      void fitView({
        padding: FIT_VIEW_PADDING,
        duration: fitAnim(700),
        interpolate: 'smooth',
        ...FOLDDER_FIT_VIEW_EASE,
      });
    }, 160);

    return () => clearTimeout(t);
  }, [
    browserFullscreen,
    isAuthenticated,
    canvasViewMode,
    nodes.length,
    fitView,
  ]);

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
      if (type.includes('concatenator') || type.includes('listado') || type.includes('batch') || (type === 'space' && n.id !== 'in' && n.id !== 'out')) {
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
      if (
        type.includes('export') ||
        type.includes('paint') ||
        type.includes('crop') ||
        type.includes('photo') ||
        type.includes('design') ||
        type.includes('present') ||
        type.includes('textoverlay')
      ) {
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
    if (sourceHandleType === 'brain' || propagatedType === 'brain') {
        result.type = 'brain';
        result.label = 'Brain Space';
    }
    else if (sourceHandleType === 'image' || propagatedType === 'image') {
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
      const nextSpaceNodes = [...targetSpace.nodes];
      setNodes(nextSpaceNodes);
      setEdges([...(targetSpace.edges || [])]);
      scheduleNodeInternalsRefresh(nextSpaceNodes.map((n: any) => String(n.id)));
      scheduleEdgeGeometryRefresh();
      setNavigationStack(prev => [...prev, currentId]);
      setActiveSpaceId(targetSpaceId);
      setTimeout(() => fitView({ padding: FIT_VIEW_PADDING, duration: fitAnim(800), ...FOLDDER_FIT_VIEW_EASE }), 100);
    }
  }, [activeSpaceId, nodes, edges, spacesMap, setNodes, setEdges, fitView, syncCurrentSpaceState, scheduleNodeInternalsRefresh, scheduleEdgeGeometryRefresh]);

  /** Vuelve al lienzo root con sync; fit a todo el grafo tras aplicar nodos (doble rAF = tras pintar). */
  const goToRootCanvas = useCallback(() => {
    if (activeSpaceId === 'root') return;
    const { newMap: updatedSpacesMap } = syncCurrentSpaceState(nodes, edges, spacesMap, activeSpaceId);
    const rootSpace = updatedSpacesMap['root'];
    if (!rootSpace) return;
    setSpacesMap(updatedSpacesMap);
    const nextRootNodes = [...rootSpace.nodes];
    setNodes(nextRootNodes);
    setEdges([...(rootSpace.edges || [])]);
    scheduleNodeInternalsRefresh(nextRootNodes.map((n: any) => String(n.id)));
    scheduleEdgeGeometryRefresh();
    setActiveSpaceId('root');
    setNavigationStack([]);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void fitView({ padding: FIT_VIEW_PADDING, duration: fitAnim(480), interpolate: 'smooth', ...FOLDDER_FIT_VIEW_EASE });
      });
    });
  }, [activeSpaceId, nodes, edges, spacesMap, setNodes, setEdges, fitView, syncCurrentSpaceState, scheduleNodeInternalsRefresh, scheduleEdgeGeometryRefresh]);

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
    if (showNewProjectModal) {
      if (!isSaving) setShowNewProjectModal(false);
      return true;
    }
    if (showLoadModal) {
      if (!postAuthProjectsGate) setShowLoadModal(false);
      return true;
    }
    if (projectToDelete || projectDeleteInProgress) return false;
    if (canvasViewMode === 'cards') {
      exitCardsViewMode();
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
    showNewProjectModal,
    showLoadModal,
    postAuthProjectsGate,
    isSaving,
    projectToDelete,
    projectDeleteInProgress,
    canvasViewMode,
    exitCardsViewMode,
    contextMenu,
    activeSpaceId,
    goToRootCanvas,
  ]);

  navigationEscapeRef.current = handleEscapeNavigation;

  useEffect(() => {
    window.addEventListener('enter-space', handleEnterSpace);
    return () => window.removeEventListener('enter-space', handleEnterSpace);
  }, [handleEnterSpace]);

  // PhotoRoom rasterize disconnect: custom nodes' useReactFlow().setEdges does not update
  // the canvas when edges are controlled via useEdgesState in this component (xyflow #4750).
  useEffect(() => {
    const handler = (ev: Event) => {
      const ce = ev as CustomEvent<{
        photoRoomNodeId?: string;
        slot?: string;
        studioObjects?: unknown[];
      }>;
      const photoRoomNodeId = ce.detail?.photoRoomNodeId;
      const slot = typeof ce.detail?.slot === 'string' ? ce.detail.slot.trim() : '';
      if (!photoRoomNodeId || !slot) return;

      const studioObjectsNext = Array.isArray(ce.detail?.studioObjects) ? ce.detail.studioObjects : null;

      const dropEdge = (e: Edge) => edgeTargetsMemberInput(e as any, photoRoomNodeId, slot);

      setEdges((eds) => eds.filter((e) => !dropEdge(e)));

      setNodes((nds) =>
        nds.map((n: any) => {
          if (n.type === 'canvasGroup') {
            const bak = n.data?.collapseBackup as
              | { crossingEdges?: Edge[]; internalEdges?: Edge[] }
              | undefined;
            if (!bak) return n;
            const crossing0 = Array.isArray(bak.crossingEdges) ? bak.crossingEdges : [];
            const internal0 = Array.isArray(bak.internalEdges) ? bak.internalEdges : [];
            const crossing = crossing0.filter((e) => !dropEdge(e as Edge));
            const internal = internal0.filter((e) => !dropEdge(e as Edge));
            if (crossing.length === crossing0.length && internal.length === internal0.length) return n;
            return {
              ...n,
              data: {
                ...n.data,
                collapseBackup: { ...bak, crossingEdges: crossing, internalEdges: internal },
              },
            };
          }
          if (n.id !== photoRoomNodeId) return n;
          if (studioObjectsNext) {
            return { ...n, data: { ...n.data, studioObjects: studioObjectsNext } };
          }
          const objs = n.data?.studioObjects;
          if (!Array.isArray(objs)) return n;
          const cleaned = objs.filter(
            (o: { type?: string; photoRoomInputSlot?: string }) =>
              !(o?.type === 'image' && o?.photoRoomInputSlot === slot),
          );
          if (cleaned.length === objs.length) return n;
          return { ...n, data: { ...n.data, studioObjects: cleaned } };
        }),
      );

      requestAnimationFrame(() => updateNodeInternals(photoRoomNodeId));
    };
    window.addEventListener('foldder-photoroom-disconnect-slot', handler);
    return () => window.removeEventListener('foldder-photoroom-disconnect-slot', handler);
  }, [setEdges, setNodes, updateNodeInternals]);

  // Reactive Propagation Bridge: Sync current space structure to map and parents on change
  useEffect(() => {
    if (!activeSpaceId) return;
    
    const timer = setTimeout(() => {
      // Pass the current states to ensure we sync the actual reflected view
      syncCurrentSpaceState(nodes, edges, spacesMap, activeSpaceId);
    }, 800); 
    return () => clearTimeout(timer);
  }, [nodes, edges, activeSpaceId, spacesMap, syncCurrentSpaceState]); 

  const refreshProjectsList = useCallback(async (opts?: { withLoader?: boolean }) => {
    const withLoader = opts?.withLoader ?? true;
    if (withLoader) setProjectsListLoading(true);
    setProjectsListError(null);
    try {
      const res = await fetch('/api/spaces?meta=1', {
        headers: devBypassHeaders,
        cache: 'no-store',
      });
      const data = await readResponseJson<unknown[]>(res, 'GET /api/spaces?meta=1');
      if (Array.isArray(data)) {
        setSavedProjects(data as SavedProjectMeta[]);
        return data as SavedProjectMeta[];
      }
      setSavedProjects([]);
      setProjectsListError("Respuesta inválida al cargar el listado de proyectos.");
      return [];
    } catch (err) {
      console.error('[refreshProjectsList] error:', err);
      setSavedProjects([]);
      setProjectsListError(
        err instanceof Error && err.message ? err.message : "No se pudo cargar el listado de proyectos."
      );
      return [];
    } finally {
      if (withLoader) setProjectsListLoading(false);
    }
  }, [devBypassHeaders]);

  const upsertSavedProjectMeta = useCallback((project: SavedProjectMeta) => {
    setSavedProjects((prev) => {
      const next = prev.filter((p) => p.id !== project.id);
      next.unshift(project);
      return next;
    });
  }, []);

  const fetchProjectDetailById = useCallback(async (projectId: string) => {
    const res = await fetch(`/api/spaces?id=${encodeURIComponent(projectId)}`, {
      headers: devBypassHeaders,
      cache: 'no-store',
    });
    return readJsonWithHttpError<SavedProjectDetail>(res, 'GET /api/spaces?id=...');
  }, [devBypassHeaders]);

  const readProjectIdFromUrl = useCallback((): string | null => {
    if (typeof window === "undefined") return null;
    try {
      return normalizeUrlProjectId(new URL(window.location.href).searchParams.get("projectId"));
    } catch {
      return null;
    }
  }, []);

  const syncProjectIdInUrl = useCallback((projectId: string | null) => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      const nextProjectId = normalizeUrlProjectId(projectId);
      if (nextProjectId) {
        url.searchParams.set("projectId", nextProjectId);
      } else {
        url.searchParams.delete("projectId");
      }
      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextUrl !== currentUrl) {
        window.history.replaceState(window.history.state, "", nextUrl);
      }
    } catch {
      // URL sync is a navigation convenience; project access remains server-authorized.
    }
  }, []);

  /** Identidad para la que debe coincidir el listado de proyectos (cambia al switchar cuenta Gmail). */
  const projectsListOwnerKey =
    sessionStatus === 'authenticated'
      ? `google:${String(session?.user?.email ?? session?.user?.id ?? '')}`
      : '';

  const projectsListOwnerRef = useRef<string | null>(null);

  // Lista al entrar / al cambiar usuario real (misma sesión "authenticated" → deps sin email no bastaba)
  useEffect(() => {
    if (!isAuthenticated) {
      projectsListOwnerRef.current = null;
      setSavedProjects([]);
      return;
    }

    const prevOwner = projectsListOwnerRef.current;
    if (projectsListOwnerKey && prevOwner !== projectsListOwnerKey) {
      projectsListOwnerRef.current = projectsListOwnerKey;
      setSavedProjects([]);
    }

    void refreshProjectsList({ withLoader: showLoadModal });
  }, [isAuthenticated, projectsListOwnerKey, refreshProjectsList, showLoadModal]);

  const saveProject = async (
    nameToSave?: string,
    options?: SaveProjectOptions
  ): Promise<boolean> => {
    const metadataVersionAtSaveStart = metadataVersionRef.current;
    lastSaveWasSkippedRef.current = false;
    try {
      setIsSaving(true);
      setSaveHealth({ state: "saving", message: "Preparing project save...", at: Date.now() });
      // Apilado XY Flow: persistir `node.zIndex`, no `style.zIndex` (evita hijos detrás del marco al recargar).
      const nodesWithLiveStudioDocs = mergeLiveStudioNodeDataIntoNodes(nodes as Node[]);
      const normalizedNodes = normalizeNodesForPersistence(nodesWithLiveStudioDocs as Node[]);
      const sanitizedGraph = sanitizeLegacyRemovedNodesFromGraph(
        normalizedNodes as Node[],
        edges as Edge[],
      );
      // Propagación completa (padres/hijos, spaceInput, etiquetas de nested spaces) — mismo criterio que al navegar
      const { newMap: syncedSpaces } = syncCurrentSpaceState(
        sanitizedGraph.nodes,
        sanitizedGraph.edges,
        spacesMap,
        activeSpaceId
      );
      const spacesToSave = normalizeSpacesMapNodesForPersistence(
        syncedSpaces as Record<string, { nodes?: Node[] }>
      );
      setSaveHealth({ state: "saving", message: "Moving heavy media to cloud storage...", at: Date.now() });
      const materializedMedia = await materializeProjectSpacesMediaForSave(spacesToSave, {
        cache: projectMediaUploadCacheRef.current,
        projectId: projectScopeId,
      });
      const spacesReadyForSave = materializedMedia.spaces;
      if (materializedMedia.uploaded > 0 || materializedMedia.reused > 0) {
        console.info(
          `[FOLDDER save] Media S3-first: ${materializedMedia.uploaded} uploaded, ${materializedMedia.reused} reused, ${Math.round(materializedMedia.projectMediaBytes / 1024)}KB moved.`,
        );
      }

      const uiSnapshot = buildProjectUiSnapshot();

      const stableMetadata = stripVolatileProjectMetadata(metadata);
      const metadataToSave = setProjectFilesInMetadata(
        stableMetadata,
        reconcileProjectFilesFromNodes(metadata, sanitizedGraph.nodes as Node[]),
      );
      const saveManifest = buildProjectSaveManifest(spacesReadyForSave as Record<string, unknown>, {
        uploaded: materializedMedia.uploaded,
        reused: materializedMedia.reused,
        bytes: materializedMedia.projectMediaBytes,
      });
      const metadataWithSaveManifest = {
        ...metadataToSave,
        saveManifest,
      };
      const effectiveProjectId = activeProjectId ?? localWorkspaceScopeId;
      const creatingProject = !activeProjectId;

      const projectFingerprintInput = {
        id: effectiveProjectId,
        name: nameToSave || currentName || 'Untitled Project',
        rootSpaceId: 'root',
        spaces: spacesReadyForSave,
        metadata: stripVolatileProjectMetadata({
          ...metadataWithSaveManifest,
          ui: uiSnapshot,
        }),
      };

      const projectToSave = {
        id: effectiveProjectId,
        createIfMissing: creatingProject,
        expectedRevision: creatingProject ? 0 : activeProjectRevisionRef.current,
        name: nameToSave || currentName || 'Untitled Project',
        rootSpaceId: 'root',
        spaces: spacesReadyForSave,
        metadata: {
          ...metadataWithSaveManifest,
          ui: uiSnapshot,
        },
      };

      setSaveHealth({ state: "saving", message: "Preparing save payload...", at: Date.now() });
      const preparedSave = await prepareProjectSavePayload({
        fingerprintInput: projectFingerprintInput,
        projectToSave,
      });
      dispatchFoldderPerformanceMeasure({
        name: "save.prepare",
        durationMs: preparedSave.durationMs,
        bytes: preparedSave.payloadBeforeBytes,
        worker: preparedSave.usedWorker,
      });
      const fingerprint = preparedSave.fingerprint;
      if (options?.skipIfUnchanged && lastSavedFingerprintRef.current === fingerprint) {
        lastSaveWasSkippedRef.current = true;
        setSaveHealth((current) => (current.state === "saving" ? { state: "idle" } : current));
        return true;
      }

      let requestBody = preparedSave.payloadJson;
      let saveBytes = preparedSave.payloadBeforeBytes;
      let savedProjectFallback = projectToSave;
      if (preparedSave.needsMainCompaction) {
        setSaveHealth({ state: "saving", message: "Compacting project payload...", at: Date.now() });
        const compactStartedAt = performance.now();
        const compactedSave = await compactProjectForSave(projectToSave);
        dispatchFoldderPerformanceMeasure({
          name: "save.compact",
          durationMs: performance.now() - compactStartedAt,
          bytes: compactedSave.bytes,
          compacted: compactedSave.compacted,
        });
        requestBody = JSON.stringify(compactedSave.project);
        saveBytes = compactedSave.bytes;
        savedProjectFallback = compactedSave.project;
        if (compactedSave.compacted) {
          console.info(
            `[FOLDDER save] Proyecto compactado antes de guardar: ${Math.round(preparedSave.payloadBeforeBytes / 1024)}KB → ${Math.round(compactedSave.bytes / 1024)}KB.`,
          );
        }
      }
      if (preparedSave.needsMainCompaction && saveBytes <= preparedSave.payloadBeforeBytes) {
        console.info(
          `[FOLDDER save] Payload preparado: ${Math.round(preparedSave.payloadBeforeBytes / 1024)}KB${preparedSave.usedWorker ? " en worker" : ""}.`,
        );
      }
      if (saveBytes > CLIENT_SAVE_BODY_LIMIT_BYTES) {
        throw new Error(
          `Project save is still too large after compaction (${Math.round(saveBytes / 1024)}KB). Heavy media must stay in S3 and only previews should be saved in the project document.`,
        );
      }

      setSaveHealth({ state: "saving", message: "Saving project...", at: Date.now() });
      const requestStartedAt = performance.now();
      const res = await fetch('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...devBypassHeaders },
        body: requestBody
      });
      
      const savedProject = await readJsonWithHttpError<SavedProjectDetail>(res, 'POST /api/spaces (save)');
      dispatchFoldderPerformanceMeasure({
        name: "save.request",
        durationMs: performance.now() - requestStartedAt,
        bytes: saveBytes,
      });
      if (!savedProject || typeof savedProject !== 'object' || !savedProject.id) {
        return false;
      }
      upsertSavedProjectMeta({
        id: savedProject.id,
        name: savedProject.name,
        rootSpaceId: savedProject.rootSpaceId,
        createdAt: savedProject.createdAt,
        updatedAt: savedProject.updatedAt,
        metadata: savedProject.metadata,
        revision: savedProject.revision,
        spacesCount: Object.keys(savedProject.spaces || {}).length,
      });
      const savedRevision =
        typeof savedProject.revision === "number" && Number.isFinite(savedProject.revision)
          ? savedProject.revision
          : activeProjectRevisionRef.current;
      activeProjectIdRef.current = savedProject.id;
      setActiveProjectRevision(savedRevision);
      activeProjectRevisionRef.current = savedRevision;
      lastSavedFingerprintRef.current = projectSaveFingerprint({
        ...projectFingerprintInput,
        id: savedProject.id,
      });
      lastSavedUiFingerprintRef.current = projectSaveFingerprint(uiSnapshot);
      setSaveHealth({ state: "saved", message: "Saved", at: Date.now() });

      if (!activeProjectId) {
        setActiveProjectId(savedProject.id);
        syncProjectIdInUrl(savedProject.id);
        setActiveSpaceId(activeSpaceId);
        setCurrentName(savedProject.name);
        setSpacesMap(savedProject.spaces || spacesReadyForSave);
      } else {
        const nextSpacesMap = (savedProject.spaces || spacesReadyForSave) as Record<string, unknown>;
        setSpacesMap((current: Record<string, unknown>) =>
          projectRecordEqual(current, nextSpacesMap) ? current : nextSpacesMap,
        );
      }
      if (metadataVersionRef.current === metadataVersionAtSaveStart) {
        const serverMetadata = stripVolatileProjectMetadata(
          (savedProject.metadata || savedProjectFallback.metadata) as Record<string, unknown>,
        );
        setMetadata((current: Record<string, unknown>) => {
          const currentStable = stripVolatileProjectMetadata(current);
          const next = preserveBrainVisualCollageMetadata(serverMetadata, currentStable);
          return projectMetadataEqual(currentStable, next) ? current : next;
        });
        setVisualReferenceAnalysisDirty(false);
      } else {
        console.info(
          "[FOLDDER save] Se ignora metadata antigua recibida del servidor porque hubo cambios locales durante el guardado.",
        );
      }
      return true;
    } catch (err) {
      console.error('Save error:', err);
      const message = err instanceof Error ? err.message : String(err ?? "");
      if (isRevisionConflictMessage(message)) {
        console.warn("[FOLDDER save] Conflicto de revisión: otro dispositivo guardó este proyecto antes.");
      }
      const classifiedSaveError = classifyProjectSaveError(err);
      setSaveHealth({
        state: classifiedSaveError.state,
        message: classifiedSaveError.healthMessage,
        at: Date.now(),
      });
      if (!options?.silentError) {
        alert(classifiedSaveError.alertMessage);
      }
      return false;
    } finally {
      setIsSaving(false);
      if (pendingProjectSaveAfterInFlightRef.current) {
        pendingProjectSaveAfterInFlightRef.current = false;
        if (typeof window !== "undefined") {
          window.setTimeout(() => scheduleProjectSave(), 120);
        }
      }
    }
  };

  const flashAutosavePulse = useCallback(() => {
    setShowAutosavePulse(true);
    if (autosavePulseTimerRef.current) window.clearTimeout(autosavePulseTimerRef.current);
    autosavePulseTimerRef.current = window.setTimeout(() => {
      setShowAutosavePulse(false);
      autosavePulseTimerRef.current = null;
    }, 2200);
  }, []);

  const flashAutosavePulseRef = useRef(flashAutosavePulse);
  flashAutosavePulseRef.current = flashAutosavePulse;

  const saveProjectRef = useRef(saveProject);
  saveProjectRef.current = saveProject;
  const isSavingRef = useRef(false);
  isSavingRef.current = isSaving;

  const prepareProjectForCheckout = useCallback(async (): Promise<{
    ok: boolean;
    projectId?: string | null;
    error?: string;
  }> => {
    const startedAt = Date.now();
    while (isSavingRef.current && Date.now() - startedAt < 12_000) {
      await new Promise((resolve) => window.setTimeout(resolve, 200));
    }
    if (isSavingRef.current) {
      return {
        ok: false,
        error: "Hay un guardado en curso. Espera unos segundos y vuelve a intentar la recarga.",
      };
    }

    const ok = await saveProjectRef.current(undefined, {
      reason: "manual",
      silentError: true,
    });
    if (!ok) {
      return {
        ok: false,
        error: "No se pudo guardar el proyecto antes de abrir Stripe. Revisa la conexión y vuelve a intentarlo.",
      };
    }
    return {
      ok: true,
      projectId: activeProjectIdRef.current ?? readProjectIdFromUrl(),
    };
  }, [readProjectIdFromUrl]);

  const brainAssetsAutosaveTimerRef = useRef<number | null>(null);
  const hasSeenBrainAssetsChangeRef = useRef(false);
  const brainAssetsAutosaveProjectRef = useRef<string | null>(null);

  const autosaveGateRef = useRef({
    authenticated: false,
    hasProject: false,
    openLoad: false,
    openNew: false,
    deleting: false,
  });
  autosaveGateRef.current = {
    authenticated: isAuthenticated,
    hasProject: !!activeProjectId,
    openLoad: showLoadModal,
    openNew: showNewProjectModal,
    deleting: !!projectDeleteInProgress,
  };

  /**
   * Autosave de latido: solo persiste si hay cambios reales desde el último guardado correcto.
   * Así mantenemos seguridad sin reenviar proyectos pesados cada minuto.
   */
  useEffect(() => {
    if (!isAuthenticated || !activeProjectId) return;

    const tick = () => {
      const g = autosaveGateRef.current;
      if (
        !g.authenticated ||
        !g.hasProject ||
        g.openLoad ||
        g.openNew ||
        g.deleting ||
        isSavingRef.current ||
        canvasPerformanceModeRef.current
      ) {
        if (canvasPerformanceModeRef.current) pendingProjectSaveAfterInteractionRef.current = true;
        return;
      }
      void (async () => {
        const ok = await saveProjectRef.current(undefined, {
          reason: "autosave",
          silentError: true,
          skipIfUnchanged: true,
        });
        if (!ok) {
          console.warn(
            '[FOLDDER autosave] No se pudo guardar (revisa red, API /api/spaces o que el proyecto exista en el servidor).'
          );
        } else if (!lastSaveWasSkippedRef.current) {
          flashAutosavePulseRef.current();
        }
      })();
    };

    const id = window.setInterval(tick, PROJECT_SAVE_HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [isAuthenticated, activeProjectId]);

  useEffect(() => {
    if (!isAuthenticated || !activeProjectId) return;
    if (projectSaveDebounceTimerRef.current !== null) {
      window.clearTimeout(projectSaveDebounceTimerRef.current);
    }
    projectSaveDebounceTimerRef.current = window.setTimeout(() => {
      projectSaveDebounceTimerRef.current = null;
      const g = autosaveGateRef.current;
      if (!g.authenticated || !g.hasProject || g.openLoad || g.openNew || g.deleting || isSavingRef.current) return;
      if (canvasPerformanceModeRef.current) {
        pendingProjectSaveAfterInteractionRef.current = true;
        return;
      }
      void (async () => {
        const ok = await saveProjectRef.current(undefined, {
          reason: "debounced",
          silentError: true,
          skipIfUnchanged: true,
        });
        if (ok && !lastSaveWasSkippedRef.current) {
          flashAutosavePulseRef.current();
        }
      })();
    }, PROJECT_SAVE_DEBOUNCE_MS);
    return () => {
      if (projectSaveDebounceTimerRef.current !== null) {
        window.clearTimeout(projectSaveDebounceTimerRef.current);
        projectSaveDebounceTimerRef.current = null;
      }
    };
  }, [
    activeProjectId,
    activeSpaceId,
    currentName,
    edges,
    isAuthenticated,
    metadata,
    nodes,
    spacesMap,
  ]);

  useEffect(() => {
    return () => {
      if (autosavePulseTimerRef.current) window.clearTimeout(autosavePulseTimerRef.current);
      if (projectSaveDebounceTimerRef.current) window.clearTimeout(projectSaveDebounceTimerRef.current);
      if (projectUiSaveDebounceTimerRef.current) window.clearTimeout(projectUiSaveDebounceTimerRef.current);
      if (canvasPerformanceReleaseTimerRef.current) window.clearTimeout(canvasPerformanceReleaseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (saveHealth.state !== "saved") return;
    const at = saveHealth.at;
    const id = window.setTimeout(() => {
      setSaveHealth((current) =>
        current.state === "saved" && current.at === at ? { state: "idle" } : current,
      );
    }, 3200);
    return () => window.clearTimeout(id);
  }, [saveHealth]);

  /**
   * Brain: persistencia defensiva de `metadata.assets` poco después de cambios relevantes
   * (subidas, análisis visual, ADN por imagen), para no perder progreso ante refresh inesperado.
   */
  useEffect(() => {
    if (!isAuthenticated || !activeProjectId) {
      brainAssetsAutosaveProjectRef.current = null;
      return;
    }
    if (brainAssetsAutosaveProjectRef.current !== activeProjectId) {
      brainAssetsAutosaveProjectRef.current = activeProjectId;
      hasSeenBrainAssetsChangeRef.current = true;
      return;
    }
    if (!hasSeenBrainAssetsChangeRef.current) {
      hasSeenBrainAssetsChangeRef.current = true;
      return;
    }
    if (brainAssetsAutosaveTimerRef.current) {
      window.clearTimeout(brainAssetsAutosaveTimerRef.current);
      brainAssetsAutosaveTimerRef.current = null;
    }
    brainAssetsAutosaveTimerRef.current = window.setTimeout(() => {
      brainAssetsAutosaveTimerRef.current = null;
      const g = autosaveGateRef.current;
      if (!g.authenticated || !g.hasProject || g.openLoad || g.openNew || g.deleting) return;
      if (canvasPerformanceModeRef.current) {
        pendingProjectSaveAfterInteractionRef.current = true;
        return;
      }
      if (isSavingRef.current) {
        brainAssetsAutosaveTimerRef.current = window.setTimeout(() => {
          brainAssetsAutosaveTimerRef.current = null;
          const retryGate = autosaveGateRef.current;
          if (
            !retryGate.authenticated ||
            !retryGate.hasProject ||
            retryGate.openLoad ||
            retryGate.openNew ||
            retryGate.deleting ||
            isSavingRef.current ||
            canvasPerformanceModeRef.current
          ) {
            if (canvasPerformanceModeRef.current) pendingProjectSaveAfterInteractionRef.current = true;
            return;
          }
          void saveProjectRef.current(undefined, {
            reason: "brain-assets",
            silentError: true,
            skipIfUnchanged: true,
          });
        }, 1500);
        return;
      }
      void saveProjectRef.current(undefined, {
        reason: "brain-assets",
        silentError: true,
        skipIfUnchanged: true,
      });
    }, 5000);
  }, [brainAssetsFingerprint, isAuthenticated, activeProjectId]);

  useEffect(() => {
    return () => {
      if (brainAssetsAutosaveTimerRef.current) {
        window.clearTimeout(brainAssetsAutosaveTimerRef.current);
        brainAssetsAutosaveTimerRef.current = null;
      }
    };
  }, []);

  const submitNewProject = useCallback(async () => {
    const trimmed = newProjectNameInput.trim();
    if (!trimmed) {
      alert('Introduce un nombre para el proyecto.');
      return;
    }
    if (projectDeleteInProgress) return;
    projectMediaUploadCacheRef.current.clear();
    syncProjectIdInUrl(null);
    flushSync(() => {
      setNodes([]);
      setEdges([]);
      setActiveSpaceId('root');
      setNavigationStack([]);
      setSpacesMap({});
      activeProjectIdRef.current = null;
      setActiveProjectId(null);
      setActiveProjectRevision(null);
      activeProjectRevisionRef.current = null;
      lastSavedFingerprintRef.current = null;
      lastSavedUiFingerprintRef.current = null;
      setLocalWorkspaceScopeId(newLocalWorkspaceScopeId());
      setMetadata({});
      setVisualReferenceAnalysisDirty(false);
      setCurrentName(trimmed);
      setCardsFocusIndex(0);
      setCanvasViewMode('free');
      setWorkspaceViewMode('pro');
      setAssistantHudOpen(false);
    });
    const ok = await saveProjectRef.current(trimmed);
    if (ok) {
      setShowNewProjectModal(false);
      setNewProjectNameInput('');
      setShowLoadModal(false);
      setShowWelcome(true);
      if (postAuthProjectsGate) {
        setPostAuthProjectsGate(false);
      }
    }
  }, [newProjectNameInput, projectDeleteInProgress, postAuthProjectsGate, setNodes, setEdges, syncProjectIdInUrl]);

  const openLoadProjectsModal = useCallback(() => {
    setShowLoadModal(true);
    setProjectLoadingError(null);
    void refreshProjectsList({ withLoader: true });
  }, [refreshProjectsList]);

  // Access Security
  const prevAuthRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated) {
      prevAuthRef.current = false;
      return;
    }
    if (prevAuthRef.current) return;
    prevAuthRef.current = true;
    setShowWelcome(false);
    if (readProjectIdFromUrl()) {
      setShowLoadModal(false);
      setPostAuthProjectsGate(false);
      return;
    }
    openLoadProjectsModal();
    setPostAuthProjectsGate(true);
  }, [isAuthenticated, openLoadProjectsModal, readProjectIdFromUrl]);

  const loadProject = (projectMeta: SavedProjectMeta, options?: { directUrl?: boolean }) => {
    void (async () => {
      let project: SavedProjectDetail;
      projectMediaUploadCacheRef.current.clear();
      setProjectLoadingError(null);
      setProjectLoadingId(projectMeta.id);
      setProjectLoadingStage("Solicitando datos del proyecto al servidor…");
      try {
        project = await fetchProjectDetailById(projectMeta.id);
      } catch (error) {
        console.error('[loadProject] detail fetch failed:', error);
        const msg = error instanceof Error ? error.message : String(error ?? "");
        if (/404|Project not found/i.test(msg)) {
          // Si el listado trae una entrada obsoleta, refrescamos y evitamos reintentos sobre ese id.
          await refreshProjectsList({ withLoader: true }).catch(() => undefined);
          setSavedProjects((prev) => prev.filter((p) => p.id !== projectMeta.id));
          setProjectLoadingError(
            options?.directUrl
              ? 'No se pudo abrir el proyecto del enlace. Elige uno de tus proyectos.'
              : 'Este proyecto ya no está disponible en servidor. Se actualizó la lista.'
          );
          if (options?.directUrl) setShowLoadModal(true);
          setProjectLoadingId(null);
          setProjectLoadingStage("");
          return;
        }
        setProjectLoadingError(
          options?.directUrl
            ? 'No se pudo abrir el proyecto del enlace. Elige uno de tus proyectos.'
            : 'No se pudo leer el proyecto desde el servidor.'
        );
        if (options?.directUrl) {
          await refreshProjectsList({ withLoader: true }).catch(() => undefined);
          setShowLoadModal(true);
        }
        setProjectLoadingId(null);
        setProjectLoadingStage("");
        return;
      }

      const rootSpaceId = project.rootSpaceId || 'root';
      const rootSpace = project.spaces?.[rootSpaceId] || project.spaces?.['root'];

      if (!rootSpace) {
        console.error('Root space not found for project:', project.id);
        setProjectLoadingError('No se encontró el espacio principal del proyecto.');
        setProjectLoadingId(null);
        setProjectLoadingStage("");
        return;
      }

      setProjectLoadingStage("Preparando estructura de espacios…");
      let spaces: Record<string, unknown> = project.spaces || {};
      try {
        setProjectLoadingStage("Actualizando URLs de medios desde S3…");
        spaces = await hydrateSpacesMapWithFreshUrls(spaces);
      } catch (e) {
        console.error('[loadProject] hydrate S3 URLs:', e);
      }
      spaces = sanitizeLegacyRemovedNodesFromSpacesMap(
        spaces as Record<string, { nodes?: Node[]; edges?: Edge[] }>
      );

      const stripLegacyFinal = (ns: any[]) =>
        ns.filter((n: any) => n.id !== FINAL_NODE_ID && n.type !== 'finalOutput');
      const stripEdgesToFinal = (es: any[]) =>
        es.filter((e: any) => e.target !== FINAL_NODE_ID);

      const ui = project.metadata?.ui as
        | {
            canvasBgId?: string;
            canvasViewMode?: 'free' | 'cards';
            workspaceViewMode?: WorkspaceViewMode;
            cardsFocusIndex?: number;
            viewport?: { x?: number; y?: number; zoom?: number };
            navigationStack?: string[];
            activeSpaceId?: string;
            sidebarLockedCollapsed?: boolean;
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
        if (!n.data || typeof n.data !== 'object') return normalizeNotesNodeForRuntime(n as Node);
        const { _foldderCanvasIntro: _i, ...rest } = n.data as Record<string, unknown>;
        return normalizeNotesNodeForRuntime({ ...n, data: rest } as Node);
      });
      const nextEdges = stripEdgesToFinal([...(targetSpace?.edges || [])]);
      const sanitizedActiveGraph = sanitizeLegacyRemovedNodesFromGraph(nextNodes as Node[], nextEdges as Edge[]);

      setProjectLoadingStage("Montando nodos y conexiones en el lienzo…");
      setNodes(sanitizedActiveGraph.nodes);
      setEdges(sanitizedActiveGraph.edges);
      scheduleNodeInternalsRefresh(sanitizedActiveGraph.nodes.map((n: any) => String(n.id)));
      scheduleEdgeGeometryRefresh();
      activeProjectIdRef.current = project.id;
      setActiveProjectId(project.id);
      syncProjectIdInUrl(project.id);
      setActiveProjectRevision(
        typeof project.revision === "number" && Number.isFinite(project.revision)
          ? project.revision
          : null,
      );
      activeProjectRevisionRef.current =
        typeof project.revision === "number" && Number.isFinite(project.revision)
          ? project.revision
          : null;
      const loadedStableMetadata = stripVolatileProjectMetadata(project.metadata || {});
      lastSavedFingerprintRef.current = projectSaveFingerprint({
        id: project.id,
        name: project.name || projectMeta.name,
        rootSpaceId: 'root',
        spaces,
        metadata: loadedStableMetadata,
      });
      lastSavedUiFingerprintRef.current = projectSaveFingerprint(ui ?? {});
      setActiveSpaceId(targetSpaceId);
      setCurrentName(project.name || projectMeta.name);
      setSpacesMap(spaces as Record<string, any>);
      setMetadata(loadedStableMetadata);
      setVisualReferenceAnalysisDirty(false);

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
      if (ui?.workspaceViewMode === 'standard' || ui?.workspaceViewMode === 'pro') {
        setWorkspaceViewMode(ui.workspaceViewMode);
      } else {
        setWorkspaceViewMode('standard');
      }
      if (typeof ui?.sidebarLockedCollapsed === 'boolean') {
        setSidebarLockedCollapsed(ui.sidebarLockedCollapsed);
      }

      const ci = ui?.cardsFocusIndex;
      if (typeof ci === 'number' && Number.isFinite(ci) && sanitizedActiveGraph.nodes.length > 0) {
        setCardsFocusIndex(Math.min(Math.max(0, Math.floor(ci)), Math.max(0, sanitizedActiveGraph.nodes.length - 1)));
      } else {
        setCardsFocusIndex(0);
      }

      setPostAuthProjectsGate(false);
      setShowLoadModal(false);
      setProjectLoadingStage("Ajustando vista final del proyecto…");
      setProjectLoadingId(null);
      setProjectLoadingStage("");

      setTimeout(() => {
        void fitView({
          padding: FIT_VIEW_PADDING,
          duration: fitAnim(800),
          interpolate: 'smooth',
          ...FOLDDER_FIT_VIEW_EASE,
        });
      }, 100);
    })().catch((err) => {
      console.error('[loadProject] unexpected error:', err);
      setProjectLoadingError(
        options?.directUrl
          ? "No se pudo abrir el proyecto del enlace. Elige uno de tus proyectos."
          : err instanceof Error && err.message ? err.message : "Error inesperado cargando el proyecto."
      );
      if (options?.directUrl) {
        void refreshProjectsList({ withLoader: true });
        setShowLoadModal(true);
      }
      setProjectLoadingId(null);
      setProjectLoadingStage("");
    });
  };

  const directProjectLoadRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isAuthenticated) {
      directProjectLoadRef.current = null;
      return;
    }
    const projectId = readProjectIdFromUrl();
    if (!projectId || activeProjectId === projectId || projectLoadingId === projectId) return;
    if (directProjectLoadRef.current === projectId) return;
    directProjectLoadRef.current = projectId;
    setShowWelcome(false);
    setPostAuthProjectsGate(false);
    setShowLoadModal(false);
    loadProject({ id: projectId, name: "Proyecto", rootSpaceId: "root" }, { directUrl: true });
  }, [activeProjectId, isAuthenticated, projectLoadingId, readProjectIdFromUrl]);

  const deleteProject = async (idToDelete: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/spaces?id=${idToDelete}`, {
        method: 'DELETE',
        headers: devBypassHeaders,
      });
      if (!res.ok) {
        console.error('[deleteProject] HTTP', res.status, await res.text().catch(() => ''));
        return false;
      }
      await readResponseJson<{ ok?: boolean }>(res, 'DELETE /api/spaces');
      await refreshProjectsList();
      if (activeProjectId === idToDelete) {
        projectMediaUploadCacheRef.current.clear();
        activeProjectIdRef.current = null;
        setActiveProjectId(null);
        syncProjectIdInUrl(null);
        setActiveProjectRevision(null);
        activeProjectRevisionRef.current = null;
        lastSavedFingerprintRef.current = null;
        lastSavedUiFingerprintRef.current = null;
        setLocalWorkspaceScopeId(newLocalWorkspaceScopeId());
        setActiveSpaceId('root');
        setCurrentName('');
        setSpacesMap({});
      }
      return true;
    } catch (err) {
      console.error('Delete error:', err);
      return false;
    }
  };

  const duplicateProject = async (projectMeta: SavedProjectMeta) => {
    setIsSaving(true);
    try {
      const project = await fetchProjectDetailById(projectMeta.id);
      const sanitizedSpaces = sanitizeLegacyRemovedNodesFromSpacesMap(
        (project.spaces || {}) as Record<string, { nodes?: Node[]; edges?: Edge[] }>
      );
      const copyToSave = {
        name: `${project.name} (Copy)`,
        spaces: sanitizedSpaces,
        rootSpaceId: project.rootSpaceId,
        metadata: project.metadata
      };

      const res = await fetch('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...devBypassHeaders },
        body: JSON.stringify(copyToSave)
      });
      
      const savedProject = await readJsonWithHttpError<SavedProjectDetail>(res, 'POST /api/spaces (duplicate)');
      upsertSavedProjectMeta({
        id: savedProject.id,
        name: savedProject.name,
        rootSpaceId: savedProject.rootSpaceId,
        createdAt: savedProject.createdAt,
        updatedAt: savedProject.updatedAt,
        metadata: savedProject.metadata,
        revision: savedProject.revision,
        spacesCount: Object.keys(savedProject.spaces || {}).length,
      });
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
      const projectDetail = await fetchProjectDetailById(id);
      const res = await fetch('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...devBypassHeaders },
        body: JSON.stringify({
          ...projectDetail,
          expectedRevision:
            typeof projectDetail.revision === "number" && Number.isFinite(projectDetail.revision)
              ? projectDetail.revision
              : undefined,
          name: newName
        })
      });
      const savedProject = await readJsonWithHttpError<SavedProjectDetail>(res, 'POST /api/spaces (rename)');
      upsertSavedProjectMeta({
        id: savedProject.id,
        name: savedProject.name,
        rootSpaceId: savedProject.rootSpaceId,
        createdAt: savedProject.createdAt,
        updatedAt: savedProject.updatedAt,
        metadata: savedProject.metadata,
        revision: savedProject.revision,
        spacesCount: Object.keys(savedProject.spaces || {}).length,
      });
      if (activeProjectId === id) {
        setCurrentName(newName);
        if (typeof savedProject.revision === "number" && Number.isFinite(savedProject.revision)) {
          setActiveProjectRevision(savedProject.revision);
          activeProjectRevisionRef.current = savedProject.revision;
          lastSavedFingerprintRef.current = null;
          lastSavedUiFingerprintRef.current = null;
        }
      }
      setEditingId(null);
    } catch (err) {
      console.error('Rename error:', err);
    }
  };

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

    const sanitized = sanitizeLegacyRemovedNodesFromGraph(
      validatedNodes as Node[],
      (Array.isArray(data.edges) ? data.edges : []) as Edge[],
    );

    setNodes(sanitized.nodes);
    setEdges(sanitized.edges);
    scheduleNodeInternalsRefresh(sanitized.nodes.map((n: any) => String(n.id)));
    scheduleEdgeGeometryRefresh();

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
              projectAssets: metadata.assets,
            }),
          });
          const data = await readJsonWithHttpError<{
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

          if (data.clarify && typeof data.clarify === 'object') {
            const c = data.clarify;
            const msg = (c.message ?? c.question ?? '').trim() || '¿Qué prefieres?';
            let opts = Array.isArray(c.options)
              ? c.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
              : [];
            if (opts.length === 0) opts = ['Entendido'];
            setAssistantClarify({ message: msg, options: opts, originalPrompt: prompt });
            return;
          }

          if (
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

          if (Array.isArray(data.nodes)) {
            applyAssistantGraphPayload(data);
          } else {
            throw new Error('El asistente no devolvió la lista de nodos (JSON incompleto).');
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

  /** Refit del marco canvasGroup mientras se arrastra/redimensiona un hijo, limitado al grupo afectado. */
  const canvasGroupRefitRafRef = useRef<number | null>(null);
  const canvasGroupRefitTargetsRef = useRef<Set<string> | null>(new Set());
  const scheduleCanvasGroupRefit = useCallback((targetGroupIds?: Iterable<string>) => {
    if (targetGroupIds) {
      if (canvasGroupRefitTargetsRef.current !== null) {
        for (const id of targetGroupIds) canvasGroupRefitTargetsRef.current.add(id);
      }
    } else {
      canvasGroupRefitTargetsRef.current = null;
    }
    if (canvasGroupRefitRafRef.current != null) return;
    canvasGroupRefitRafRef.current = requestAnimationFrame(() => {
      canvasGroupRefitRafRef.current = null;
      const targets = canvasGroupRefitTargetsRef.current;
      canvasGroupRefitTargetsRef.current = new Set();
      if (targets && targets.size === 0) return;
      setNodes((prev) => recomputeCanvasGroupFrames(prev, targets ?? undefined));
    });
  }, [setNodes]);

  const onNodeDrag = useCallback((_event: unknown, node: unknown) => {
    const parentId = (node as { parentId?: string } | null | undefined)?.parentId;
    if (!parentId) return;
    scheduleCanvasGroupRefit([parentId]);
  }, [scheduleCanvasGroupRefit]);

  const onNodeDragStop = useCallback(
    (_event: unknown, node: unknown, _nodes: unknown) => {
      if (canvasGroupRefitRafRef.current != null) {
        cancelAnimationFrame(canvasGroupRefitRafRef.current);
        canvasGroupRefitRafRef.current = null;
      }
      canvasGroupRefitTargetsRef.current = new Set();
      endCanvasPerformanceInteraction();
      const parentId = (node as { parentId?: string } | null | undefined)?.parentId;
      if (parentId) {
        requestAnimationFrame(() => {
          setNodes((nds) => recomputeCanvasGroupFrames(nds, [parentId]));
        });
      }
    },
    [endCanvasPerformanceInteraction, setNodes]
  );

  const onNodeDragStart = useCallback(() => {
    beginCanvasPerformanceInteraction();
    takeSnapshot(); // capture state when drag begins, before positions change
  }, [beginCanvasPerformanceInteraction, takeSnapshot]);

  const onConnect: OnConnect = useCallback(
    (params) => {
      takeSnapshot();
      const edgeId = `e-${params.source}-${params.target}-${params.sourceHandle || 'def'}-${params.targetHandle || 'def'}-${Math.random().toString(36).substring(2, 6)}`;
      setEdges((eds) => addEdge({ ...params, id: edgeId, type: 'buttonEdge' }, eds));
      const srcNode = liveNodesRef.current.find((n: { id: string }) => n.id === params.source);
      if (
        srcNode?.type === "nanoBanana" &&
        (params.sourceHandle === "image" || params.sourceHandle == null || params.sourceHandle === "")
      ) {
        window.dispatchEvent(
          new CustomEvent("foldder-nano-banana-output-wired", { detail: { nodeId: params.source } }),
        );
      }
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
    [setEdges, takeSnapshot, fitViewToNodeIds, updateNodeInternals, liveNodesRef]
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

    const newNodeId = `${newType}_${Date.now()}`;
    const edgeId = `ae-${fromNodeId}-${newNodeId}-${fromHandleId}-${Date.now()}`;
    const newMeta = NODE_REGISTRY[newType];

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

    const clientX = event.clientX ?? event.changedTouches?.[0]?.clientX ?? 0;
    const clientY = event.clientY ?? event.changedTouches?.[0]?.clientY ?? 0;
    const pointerFlow = screenToFlowPosition({ x: clientX, y: clientY });

    const anchor = getHandleCenterFlowPosition({
      nodeId: fromNodeId,
      handleId: fromHandleId,
      screenToFlowPosition,
    });
    const fromNodeFlowRect = getNodeFlowRect({
      nodeId: fromNodeId,
      screenToFlowPosition,
    });
    /** Separación horizontal entre centros de conectores (coords flujo). PhotoRoom: más margen para que Nano no roce el marco. */
    const HANDLE_GAP_BASE = 76;
    const handleGap =
      srcNodeType === "photoRoom" &&
      fromType === "target" &&
      /^in_\d+$/.test(fromHandleId)
        ? 120
        : HANDLE_GAP_BASE;
    /** Nano Banana: ancho típico en lienzo > minWidth 240; evita primer frame solapado con PhotoRoom. */
    const defaultWidthHint =
      newType === "nanoBanana" && srcNodeType === "photoRoom" && fromType === "target" ? 400 : 280;
    /** Heurística offset handle izquierdo → esquina sup. izq. del nodo nuevo (el snap afina). */
    const newNodeLeftInsetHint = 56;
    /** Primera Y: cercana al ancla; snapNewNodeToAnchor corrige al centro real del handle en el siguiente frame. */
    const initialPos = anchor
      ? {
          x:
            fromType === 'source'
              ? fromNodeFlowRect
                ? fromNodeFlowRect.right + HANDLE_GAP_BASE - newNodeLeftInsetHint
                : anchor.x + HANDLE_GAP_BASE
              : anchor.x - handleGap - defaultWidthHint,
          y: anchor.y - 48,
        }
      : { x: pointerFlow.x - 160, y: pointerFlow.y - 80 };

    const newNode = {
      id: newNodeId,
      type: newType,
      position: initialPos,
      data: withFoldderCanvasIntro(newType, defaultDataForCanvasDropNode(newType)),
    };

    /** Alinea el conector del nodo nuevo con el del origen (misma Y; X con separación HANDLE_GAP). */
    const snapNewNodeToAnchor = () => {
      const anchorFlow = getHandleCenterFlowPosition({
        nodeId: fromNodeId,
        handleId: fromHandleId,
        screenToFlowPosition,
      });
      const newH = getHandleCenterFlowPosition({
        nodeId: newNodeId,
        handleId: newHandle,
        screenToFlowPosition,
      });
      if (!anchorFlow || !newH) return;
      const srcRectNow =
        getNodeFlowRect({ nodeId: fromNodeId, screenToFlowPosition }) ?? fromNodeFlowRect;

      setNodes((nds: any) => {
        const n = nds.find((x: any) => x.id === newNodeId);
        if (!n) return nds;
        const handleOffsetX = newH.x - n.position.x;
        let desiredX: number;
        if (fromType === 'source') {
          const handleToHandle = anchorFlow.x + HANDLE_GAP_BASE;
          const clearSourceBody =
            srcRectNow != null
              ? srcRectNow.right + HANDLE_GAP_BASE + handleOffsetX
              : handleToHandle;
          desiredX = Math.max(handleToHandle, clearSourceBody);
        } else {
          /** Entrada (p. ej. PhotoRoom): nodo fuente a la izquierda; alinear handles y asegurar que el cuerpo no invada PhotoRoom. */
          desiredX = anchorFlow.x - handleGap;
          const nbRect = getNodeFlowRect({
            nodeId: newNodeId,
            screenToFlowPosition,
          });
          if (srcNodeType === "photoRoom" && srcRectNow != null && nbRect != null) {
            const bodyPad = 32;
            const limitRight = srcRectNow.left - bodyPad;
            if (nbRect.right > limitRight) {
              desiredX -= nbRect.right - limitRight;
            }
          }
        }
        const desiredY = anchorFlow.y;
        return nds.map((node: any) => {
          if (node.id !== newNodeId) return node;
          return {
            ...node,
            position: {
              x: node.position.x + (desiredX - newH.x),
              y: node.position.y + (desiredY - newH.y),
            },
          };
        });
      });
    };

    takeSnapshot();

    const newEdge = {
      id:           edgeId,
      source:       fromType === 'source' ? fromNodeId  : newNodeId,
      sourceHandle: fromType === 'source' ? fromHandleId : newHandle,
      target:       fromType === 'source' ? newNodeId   : fromNodeId,
      targetHandle: fromType === 'source' ? newHandle   : fromHandleId,
      type:         'buttonEdge',
      animated: false,
    };

    setNodes((nds: any) => [...nds, newNode]);
    scheduleFoldderCanvasIntroEnd(newNodeId);
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        snapNewNodeToAnchor();
        requestAnimationFrame(snapNewNodeToAnchor);
      });
    });

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
        snapNewNodeToAnchor();
        requestAnimationFrame(() => {
          refreshHandles();
          snapNewNodeToAnchor();
        });
      });
      fitViewToNodeIds([newNodeId], 600);
    }, 30);
  }, [edges, nodes, screenToFlowPosition, setNodes, setEdges, takeSnapshot, fitViewToNodeIds, updateNodeInternals, scheduleFoldderCanvasIntroEnd]);



  const onPaneContextMenu = useCallback((event: globalThis.MouseEvent | React.MouseEvent<Element, MouseEvent>) => {
    event.preventDefault();
    setContextMenu(null);
  }, []);

  const onNodeContextMenu = useCallback((event: globalThis.MouseEvent | React.MouseEvent<Element, MouseEvent>) => {
    event.preventDefault();
    event.stopPropagation?.();
    setContextMenu(null);
  }, []);

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
            animated: false,
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
      const orderedIndexById = new Map(ordered.map((node, index) => [node.id, index]));
      const n = ordered.length;
      const f = Math.min(Math.max(0, cardsFocusIndex), n - 1);
      const anchor = cardsAnchorRef.current;
      const introParity = cardsIntroTick % 2;
      const introClass = introParity === 0 ? 'foldder-cards-intro-a' : 'foldder-cards-intro-b';

      return nodes.map((node: any) => {
        const isCompat = compatSet.has(node.id);
        const isHover = node.id === libraryDropTargetId;
        const isOverviewHover = node.id === overviewHoverHighlightId;
        const stackIdx = orderedIndexById.get(node.id) ?? -1;
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
            dragHandle: defaultCanvasNodeDragHandle(libraryType),
        data: withFoldderCanvasIntro(libraryType, {
          ...defaultDataForCanvasDropNode(libraryType),
          value: '',
          label: libraryType === "notes" ? "Note" : `${libraryType} node`,
        }),
            ...(defaultCanvasNodeStyleForType(libraryType) ? { style: defaultCanvasNodeStyleForType(libraryType) } : {}),
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
                  animated: false,
                }
              : {
                  id: edgeId,
                  source: newId,
                  sourceHandle: plan.sourceHandle,
                  target: targetNode.id,
                  targetHandle: plan.targetHandle,
                  type: 'buttonEdge' as const,
                  animated: false,
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
          dragHandle: defaultCanvasNodeDragHandle(libraryType),
          data: withFoldderCanvasIntro(libraryType, {
            ...defaultDataForCanvasDropNode(libraryType),
            value: '',
            label: libraryType === "notes" ? "Note" : `${libraryType} node`,
          }),
          ...(defaultCanvasNodeStyleForType(libraryType) ? { style: defaultCanvasNodeStyleForType(libraryType) } : {}),
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
        const overStudioCanvas = (() => {
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
        if (overStudioCanvas) return;

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
            try {
              const uploaded = await uploadProjectMediaFile(file, {
                projectId: projectScopeId,
              });
              setNodes((nds) => {
                return nds.map((n) =>
                  n.id === nodeId
                    ? {
                        ...n,
                        data: {
                          ...n.data,
                          value: uploaded.url,
                          s3Key: uploaded.s3Key,
                          loading: false,
                          error: false,
                          metadata: {
                            size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
                            resolution: fileType === 'video' || fileType === 'image' ? 'Auto-detected' : '-',
                            codec: (file.type || uploaded.contentType).split('/')[1]?.toUpperCase() || 'RAW',
                          },
                        },
                      }
                    : n
                );
              });
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
      projectScopeId,
    ]
  );

  return (
    <div className="flex w-full h-full" ref={reactFlowWrapper} style={{ flexDirection: 'column' }}>

      <SpacesWelcomeChrome
        showWelcome={showWelcome}
        onWelcomeAnimationEnd={() => {
          setShowWelcome(false);
        }}
      />

      {/* ── MAIN CANVAS AREA ─────────────────────────────────────────────── */}
      <div
        className="flex flex-1"
        style={{ height: '100%' }}
      >
      {/* Sidebar: solo tras autenticar (oculto en pantalla de acceso) */}
      {isAuthenticated && workspaceViewMode === 'pro' && (
        <div data-foldder-sidebar style={{ position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 10003 }}>
          <Sidebar
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
        <CanvasWallpaperTransition activeId={canvasBgId} options={CANVAS_BACKGROUNDS} />
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
        <SpacesActiveProjectIdContext.Provider value={activeProjectId}>
        <ProjectAssetsCanvasContext.Provider value={projectAssetsCanvasValue}>
        <ProjectBrainCanvasContext.Provider value={projectBrainCanvasValue}>
        <DesignerSpaceIdContext.Provider value={activeSpaceId === "root" ? null : activeSpaceId}>
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

            const changedCanvasGroupIds = new Set<string>();
            for (const c of filtered) {
              if (c.type !== "dimensions" && c.type !== "position") continue;
              const id = (c as { id?: string }).id;
              if (!id) continue;
              const node = nds.find((n) => n.id === id);
              if (node?.parentId) changedCanvasGroupIds.add(node.parentId);
            }
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
            } else if (changedCanvasGroupIds.size > 0) {
              scheduleCanvasGroupRefit(changedCanvasGroupIds);
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
          onMoveStart={beginCanvasPerformanceInteraction}
          onMoveEnd={endCanvasPerformanceInteraction}
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

          className={`spaces-canvas${spaceHeld || middlePanHeld ? ' spaces-canvas--space-pan' : ''}${canvasViewMode === 'cards' ? ' spaces-canvas--cards-mode' : ''}${overviewModeActive ? ' foldder-overview-mode-active' : ''}${canvasPerformanceMode ? ' spaces-canvas--performance' : ''}`}
          style={reactFlowCanvasStyle}
        >
          <Background color="#111" gap={40} size={1} />
        </ReactFlow>
        </DesignerSpaceIdContext.Provider>
        </ProjectBrainCanvasContext.Provider>
        </ProjectAssetsCanvasContext.Provider>
        </SpacesActiveProjectIdContext.Provider>

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
            <div className="pointer-events-auto flex items-center gap-2">
              {saveHealth.state !== "idle" && (
                <div
                  className={[
                    "flex max-w-[min(88vw,360px)] items-center gap-2 rounded-md border px-2.5 py-1.5 text-[10px] font-semibold shadow-md backdrop-blur-md",
                    saveHealth.state === "saved"
                      ? "border-emerald-300/35 bg-emerald-950/70 text-emerald-100"
                      : saveHealth.state === "saving"
                        ? "border-white/25 bg-black/60 text-white"
                        : "border-red-300/35 bg-red-950/75 text-red-50",
                  ].join(" ")}
                  aria-live={saveHealth.state === "saved" ? "polite" : "assertive"}
                >
                  {saveHealth.state === "saving" ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                  ) : saveHealth.state === "saved" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                  <span className="truncate">{saveHealth.message}</span>
                  {saveHealth.state === "conflict" && activeProjectId && (
                    <button
                      type="button"
                      className="ml-1 shrink-0 rounded border border-white/20 bg-white/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white transition-colors hover:bg-white/18"
                      onClick={() => {
                        const meta =
                          savedProjects.find((project) => project.id === activeProjectId) ?? {
                            id: activeProjectId,
                            name: currentName || "Project",
                          };
                        loadProject(meta);
                      }}
                    >
                      Reload
                    </button>
                  )}
                </div>
              )}
              {showAutosavePulse && (
                <span
                  className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.9)]"
                  aria-hidden
                  title="Guardado automático"
                />
              )}
              <button
                type="button"
                data-foldder-reactflow-zoom-badge
                className="flex select-none items-center gap-1 rounded-md border border-white/25 bg-black/55 px-2 py-1.5 font-mono text-[11px] font-medium tabular-nums text-white shadow-md backdrop-blur-md hover:bg-black/70"
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
          </div>
        )}

        {/* Action HUD — fila1: agente (izq.) + acciones (der.); fila2: accesos fijos inferiores. Oculto con body.nb-studio-open (Nano Banana Studio fullscreen). */}
        {isAuthenticated && (
        <div
          key="action-hud"
          data-foldder-top-hud
          className="pointer-events-none flex min-w-0 flex-col gap-2"
          style={{
            position: 'absolute',
            top: 24,
            left: 24,
            right: 24,
            zIndex: 100,
          }}
        >
          <div className="relative flex w-full min-w-0 max-w-full items-center gap-2 sm:gap-3">
            {isAuthenticated && (
              <>
                <div className="pointer-events-auto relative z-[25] flex min-h-[40px] min-w-0 shrink-0 items-center gap-2">
                  <img
                    src="/logo_bl.svg"
                    alt="Foldder"
                    className="h-11 w-11 shrink-0 object-contain drop-shadow-lg"
                    draggable={false}
                  />
                  <button
                    type="button"
                    onClick={() => setAssistantHudOpen((open) => !open)}
                    title={assistantHudOpen ? "Ocultar asistente" : "Abrir asistente"}
                    aria-expanded={assistantHudOpen}
                    aria-controls="foldder-top-assistant"
                    className={`group flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/[0.08] text-white/70 shadow-sm backdrop-blur-xl transition-all hover:scale-105 hover:bg-white/[0.15] hover:text-white ${
                      assistantHudOpen ? 'bg-white/20 text-white ring-1 ring-white/35' : ''
                    }`}
                  >
                    <MessageCircle size={16} className="text-current" />
                  </button>
                  <div
                    id="foldder-top-assistant"
                    className={`absolute left-[calc(100%+0.5rem)] top-0 min-w-0 overflow-hidden transition-[width,opacity,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      assistantHudOpen
                        ? 'w-[min(52vw,26.5rem)] translate-x-0 opacity-100'
                        : 'pointer-events-none w-0 -translate-x-2 opacity-0'
                    }`}
                    aria-hidden={!assistantHudOpen}
                  >
                    <div className="flex min-h-[40px] w-full items-center rounded-xl border border-white/25 bg-white/[0.08] px-2 py-1 shadow-sm backdrop-blur-xl">
                      <AgentHUD
                        variant="topbar"
                        onGenerate={onGenerateAssistant}
                        isGenerating={isGeneratingAssistant}
                        selectedNodeCount={nodes.filter((n) => n.selected).length}
                      />
                    </div>
                  </div>
                </div>
                <div className="pointer-events-auto relative z-[5] flex min-h-[40px] min-w-[12rem] flex-1 items-center justify-center rounded-xl bg-white/[0.08] px-2.5 py-1.5 text-center shadow-sm backdrop-blur-xl">
                  <label htmlFor="foldder-hud-project-name" className="sr-only">
                    Nombre del proyecto
                  </label>
                  <input
                    id="foldder-hud-project-name"
                    type="text"
                    value={currentName}
                    onChange={(e) => setCurrentName(e.target.value)}
                    onBlur={() => {
                      if (!activeProjectId) return;
                      const t = currentName.trim();
                      if (!t) return;
                      const prev = savedProjects.find((p) => p.id === activeProjectId)?.name;
                      if (prev === t) return;
                      void renameProject(activeProjectId, t);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    placeholder="Nombre del proyecto"
                    title={
                      activeProjectId
                        ? 'Nombre del proyecto (se guarda al salir del campo)'
                        : 'Crea o abre un proyecto para guardar el nombre'
                    }
                    className="min-w-0 w-full bg-transparent text-center text-[13px] font-semibold leading-snug text-white placeholder:text-white/45 focus:outline-none focus:ring-0"
                  />
                </div>
              </>
            )}
            <div
              className={
                isAuthenticated
                  ? 'pointer-events-auto relative z-[5] ml-auto flex min-w-0 max-w-[min(100%,54rem)] shrink-0 items-center justify-end gap-2 sm:gap-3'
                  : 'pointer-events-auto flex w-full min-w-0 flex-1 items-center justify-between gap-3'
              }
            >
              {/* Quick Actions — fondo / pantalla / Foldder (pins abajo en `TopbarPins`) */}
              <div className="flex max-w-full shrink-0 flex-nowrap items-center justify-end gap-1.5">
                <div className="flex h-10 items-center rounded-xl border border-white/25 bg-white/[0.08] p-1 shadow-sm backdrop-blur-xl">
                  <button
                    type="button"
                    onClick={() => setWorkspaceViewMode('standard')}
                    className={`flex h-8 items-center gap-1.5 rounded-lg px-2 text-[8px] font-black uppercase tracking-widest transition ${
                      workspaceViewMode === 'standard'
                        ? 'bg-white px-2 text-slate-900 shadow-sm'
                        : 'text-white/70 hover:bg-white/20 hover:text-white'
                    }`}
                  >
                    <Workflow size={12} />
                    Estándar
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkspaceViewMode('pro')}
                    className={`flex h-8 items-center gap-1.5 rounded-lg px-2 text-[8px] font-black uppercase tracking-widest transition ${
                      workspaceViewMode === 'pro'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-white/70 hover:bg-white/20 hover:text-white'
                    }`}
                  >
                    Pro
                  </button>
                </div>
                <div className="relative" ref={canvasBgMenuRef}>
                  <button
                    type="button"
                    onClick={() => setCanvasBgMenuOpen((o) => !o)}
                    title="Fondo del lienzo e idioma"
                    aria-expanded={canvasBgMenuOpen}
                    className="group relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/25 bg-white/[0.08] text-white/70 shadow-sm backdrop-blur-xl transition-all hover:scale-105 hover:bg-white/[0.15] hover:text-white"
                  >
                    <LayoutGrid size={16} className="text-current" />
                    <ChevronDown
                      size={12}
                      className={`absolute bottom-1 right-1 text-current opacity-75 transition-transform ${canvasBgMenuOpen ? 'rotate-180' : ''}`}
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
                      <div
                        className="mt-1 border-t border-slate-200/80 px-1.5 pt-1.5 dark:border-slate-600/80"
                        data-foldder-i18n-ignore
                      >
                        <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-100/80 p-1.5 dark:bg-slate-800/80">
                          <div className="flex items-center gap-1.5 px-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">
                            <Languages size={13} aria-hidden />
                            <span>{language === "es" ? "Idioma" : "Language"}</span>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            {LANGUAGE_OPTIONS.map((option) => {
                              const active = option.id === language;
                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  onClick={() => setLanguage(option.id)}
                                  aria-pressed={active}
                                  aria-label={option.label}
                                  title={option.label}
                                  className={`flex h-8 w-10 items-center justify-center rounded-md border text-[11px] font-black uppercase tracking-[0.08em] transition ${
                                    active
                                      ? "border-slate-900 bg-slate-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-950"
                                      : "border-slate-300 bg-white text-slate-600 hover:border-slate-500 hover:text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-400 dark:hover:text-white"
                                  }`}
                                >
                                  {option.shortLabel}
                                </button>
                              );
                            })}
                          </div>
                        </div>
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
                  className="group flex h-10 w-10 items-center justify-center rounded-xl border border-white/25 bg-white/[0.08] text-white/70 shadow-sm backdrop-blur-xl transition-all hover:scale-105 hover:bg-white/[0.15] hover:text-white"
                >
                  {browserFullscreen ? (
                    <Minimize2 size={16} className="text-current" aria-hidden />
                  ) : (
                    <Maximize2 size={16} className="text-current" aria-hidden />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (projectDeleteInProgress) return;
                    openLoadProjectsModal();
                  }}
                  title="Abrir proyectos"
                  className="group flex h-10 w-10 items-center justify-center rounded-xl border border-white/25 bg-white/[0.08] text-white/70 shadow-sm backdrop-blur-xl transition-all hover:scale-105 hover:bg-white/[0.15] hover:text-white"
                >
                  <FolderOpen size={16} className="text-current" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (projectDeleteInProgress) return;
                    setNewProjectNameInput('');
                    setShowNewProjectModal(true);
                  }}
                  disabled={isSaving || !!projectDeleteInProgress}
                  title={
                    projectDeleteInProgress
                      ? 'Espera a que termine el borrado'
                      : 'Crear un proyecto nuevo (el lienzo actual no guardado se reemplaza; el actual se guarda solo cada minuto)'
                  }
                  className="flex h-10 items-center gap-2 rounded-xl border border-blue-500/45 bg-blue-600 px-4 text-[9px] font-black uppercase tracking-widest text-white shadow-sm shadow-blue-900/20 backdrop-blur-xl transition-all hover:scale-105 hover:bg-blue-500 disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <FolderPlus size={14} className="text-white" />
                  )}
                  <span className="hidden sm:inline">Nuevo proyecto</span>
                </button>
                {isAuthenticated && (
                  <div className="ml-1 flex items-center">
                    <WalletBalanceButton
                      onBeforeCheckout={prepareProjectForCheckout}
                      onSignOut={() => {
                        if (sessionStatus === "authenticated") {
                          void signOut({ callbackUrl: "/" });
                        }
                      }}
                      projectId={activeProjectId}
                      user={session?.user}
                    />
                  </div>
                )}
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
        )}

        {isAuthenticated && workspaceViewMode === 'standard' && (
          <StandardDesktopView
            files={projectFiles.items}
            importedMedia={foldderLibrarySections.importedMedia}
            generatedMedia={foldderLibrarySections.generatedMedia}
            generatedTexts={foldderLibrarySections.generatedTexts}
            exports={foldderLibrarySections.exports}
            notes={standardDesktopNotes}
            canvasViewport={getViewport()}
            activeAppId={activeDesktopAppId}
            minimizedAppId={minimizedDesktopAppId}
            onCreateNote={createStandardNote}
            onUpdateNote={updateStandardNote}
            onDuplicateNote={duplicateStandardNote}
            onDeleteNote={deleteStandardNote}
            onMoveNote={moveStandardNote}
            onAutoHeightNote={syncStandardNoteHeight}
            onDockAppClick={handleDesktopDockAppClick}
            onCreateFileForApp={createStandardFileForApp}
            onOpenFile={openStandardFile}
            onRenameFile={renameProjectFile}
            onSaveAsFile={saveProjectFileAs}
            onHideFile={hideProjectFile}
            onPresentDesignFile={openPresenterForDesignFile}
            onOpenGuionistaTextAsset={openGuionistaTextAsset}
            onOpenFoldderFullscreen={() => openFoldder("fullscreen")}
            foldderOpenRequest={standardFoldderOpenRequest}
            canvasBgId={canvasBgId}
          />
        )}

        {isAuthenticated && workspaceViewMode === 'standard' && primaryMinimizedApp && (
          <button
            type="button"
            onClick={() => restoreStandardRuntimeApp(primaryMinimizedApp)}
            className="fixed bottom-24 left-1/2 z-[95] -translate-x-1/2 rounded-2xl border border-white/18 bg-black/55 px-4 py-2 text-[11px] font-light uppercase tracking-[0.16em] text-white/75 shadow-2xl backdrop-blur-2xl transition hover:bg-black/70 hover:text-white"
          >
            Restaurar {primaryMinimizedApp.title}
          </button>
        )}

        {isAuthenticated && (
          <ProjectBrainFullscreen
            open={projectBrainOpen}
            onClose={() => {
              setProjectBrainOpen(false);
              setBrainInitialSection(null);
              if (standardRuntimeApp?.kind === "brain") closeRegisteredDesktopApp(standardRuntimeApp);
            }}
            assetsMetadata={metadata.assets}
            projectId={activeProjectId}
            workspaceId={projectScopeId}
            canvasNodes={nodes}
            canvasEdges={edges}
            initialSection={brainInitialSection}
            visualReferenceAnalysisDirty={visualReferenceAnalysisDirty}
            onVisualReferenceAnalysisDirty={() => setVisualReferenceAnalysisDirty(true)}
            onBrainAssetsFullReset={() => setVisualReferenceAnalysisDirty(false)}
            onSaveProjectFromBrain={() => saveProject(undefined, { silentError: true })}
            isSavingProject={isSaving}
            onAssetsMetadataChange={(next) =>
              setMetadata((m: Record<string, unknown>) => ({ ...m, assets: next }))
            }
          />
        )}

        {isAuthenticated && (
          <ProjectAssetsFullscreen
            open={projectAssetsOpen}
            onClose={() => {
              setProjectAssetsOpen(false);
              if (standardRuntimeApp?.kind === "assets") closeRegisteredDesktopApp(standardRuntimeApp);
            }}
            nodes={nodes}
            assetsMetadata={metadata.assets}
            projectFiles={projectFiles}
            generatedTextAssets={generatedTextAssets}
            onOpenGuionistaTextAsset={openGuionistaTextAsset}
            projectScopeId={projectScopeId}
          />
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

        {/* Modals — alto contraste sobre cualquier fondo del lienzo */}
        {showNewProjectModal && (
          <div className="fixed inset-0 z-[10006] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-xl"
              onClick={() => !isSaving && setShowNewProjectModal(false)}
              aria-hidden
            />
            <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/12 bg-black/88 p-8 shadow-2xl shadow-black/45 backdrop-blur-xl">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="flex items-center gap-3 text-xl font-black uppercase tracking-wide text-white">
                  <FolderPlus size={20} className="text-blue-400" /> Nuevo proyecto
                </h2>
                <button
                  type="button"
                  onClick={() => !isSaving && setShowNewProjectModal(false)}
                  className="rounded-full p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="Cerrar"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="mb-4 text-sm leading-relaxed text-white/68">
                Elige un nombre. Se creará un lienzo vacío y se guardará en el servidor; a partir de ahí el proyecto se
                guardará solo cada minuto.
              </p>
              <input
                type="text"
                autoFocus
                placeholder="Nombre del proyecto"
                value={newProjectNameInput}
                onChange={(e) => setNewProjectNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitNewProject();
                  if (e.key === 'Escape' && !isSaving) setShowNewProjectModal(false);
                }}
                className="mb-6 w-full rounded-2xl border border-white/18 bg-white px-4 py-3 text-sm font-bold text-slate-950 shadow-inner outline-none transition-all placeholder:text-slate-500 focus:border-blue-400/80 focus:ring-2 focus:ring-blue-400/30"
              />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => !isSaving && setShowNewProjectModal(false)}
                  className="rounded-2xl border border-white/22 bg-white/8 px-6 py-2.5 font-black text-[11px] uppercase tracking-widest text-white/72 transition-all hover:bg-white/14 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void submitNewProject()}
                  disabled={isSaving}
                  className="flex items-center gap-2 rounded-2xl border border-blue-500/45 bg-blue-600 px-6 py-2.5 font-black text-[11px] uppercase tracking-widest text-white shadow-lg shadow-blue-900/25 transition-all hover:bg-blue-500 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={14} />} Crear
                </button>
              </div>
            </div>
          </div>
        )}

        {showLoadModal && (
          <div className="fixed inset-0 z-[10004] flex items-center justify-center p-3 sm:p-4">
            <div
              className="absolute inset-0 bg-black/45 backdrop-blur-xl"
              onClick={() => {
                if (!postAuthProjectsGate) setShowLoadModal(false);
              }}
              aria-hidden
            />
            <div className="relative z-10 flex max-h-[min(85vh,560px)] w-full max-w-lg flex-col rounded-2xl border border-white/25 bg-white/20 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-800">
                  <FolderOpen size={16} className="shrink-0 text-rose-500" /> Tus proyectos
                </h2>
                {!postAuthProjectsGate && (
                  <button
                    type="button"
                    onClick={() => setShowLoadModal(false)}
                    className="shrink-0 rounded-full p-1 text-slate-500 transition-colors hover:bg-white/40 hover:text-slate-800"
                    aria-label="Cerrar"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (projectDeleteInProgress) return;
                  setNewProjectNameInput('');
                  setShowNewProjectModal(true);
                }}
                disabled={!!projectDeleteInProgress}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-blue-500/40 bg-blue-600/90 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-white shadow-md shadow-blue-900/20 transition-all hover:bg-blue-500 disabled:pointer-events-none disabled:opacity-40"
              >
                <FolderPlus size={16} strokeWidth={2.5} aria-hidden />
                Comenzar un proyecto nuevo
              </button>

              <p className="mb-3 text-[11px] leading-snug text-slate-600">
                {postAuthProjectsGate
                  ? 'Abre un proyecto guardado o crea uno nuevo para continuar.'
                  : 'Elige un proyecto para cargarlo en el lienzo.'}
              </p>

              {(projectsListLoading || projectsListError || projectLoadingId || projectLoadingError) && (
                <div className="mb-3 space-y-2">
                  {projectsListLoading && (
                    <div className="flex items-center gap-2 rounded-xl border border-white/25 bg-white/20 px-3 py-2 text-[11px] font-semibold text-slate-700">
                      <Loader2 size={13} className="animate-spin text-blue-600" />
                      Cargando listado de proyectos…
                    </div>
                  )}
                  {projectsListError && (
                    <div className="flex items-start gap-2 rounded-xl border border-rose-300/60 bg-rose-50/70 px-3 py-2 text-[11px] font-semibold text-rose-700">
                      <AlertCircle size={13} className="mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="break-words">{projectsListError}</p>
                        <button
                          type="button"
                          onClick={() => void refreshProjectsList({ withLoader: true })}
                          className="mt-1 rounded-lg border border-rose-300/60 bg-white/80 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-rose-700 hover:bg-white"
                        >
                          Reintentar
                        </button>
                      </div>
                    </div>
                  )}
                  {projectLoadingId && (
                    <div className="flex items-start gap-2 rounded-xl border border-blue-300/50 bg-blue-50/70 px-3 py-2 text-[11px] font-semibold text-blue-800">
                      <Loader2 size={13} className="mt-0.5 shrink-0 animate-spin" />
                      <div className="min-w-0">
                        <p>Cargando proyecto…</p>
                        <p className="mt-0.5 text-[10px] font-bold text-blue-700/90">
                          {projectLoadingStage || "Preparando datos…"}
                        </p>
                      </div>
                    </div>
                  )}
                  {projectLoadingError && !projectLoadingId && (
                    <div className="flex items-start gap-2 rounded-xl border border-rose-300/60 bg-rose-50/70 px-3 py-2 text-[11px] font-semibold text-rose-700">
                      <AlertCircle size={13} className="mt-0.5 shrink-0" />
                      <p className="break-words">{projectLoadingError}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="custom-scrollbar min-h-0 max-h-[min(52vh,340px)] flex-1 overflow-y-auto -mx-1 px-1 pb-1 sm:max-h-[min(48vh,380px)]">
                {!projectsListLoading && savedProjects.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/30 bg-white/10 py-10 text-center backdrop-blur-sm">
                    <FolderOpen className="mx-auto mb-2 text-slate-400" size={28} />
                    <p className="text-xs font-bold text-slate-600">Aún no hay proyectos guardados.</p>
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
                              <Calendar size={10} />{" "}
                              {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : "-"}
                            </div>
                            <div className="flex items-center gap-1">
                              <Settings2 size={10} />{" "}
                              {typeof project.spacesCount === 'number' ? project.spacesCount : '...'} spaces
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => !projectDeleteInProgress && void duplicateProject(project)}
                            disabled={!!projectDeleteInProgress}
                            title="Duplicate"
                            className="rounded-lg border border-white/20 bg-white/12 p-1.5 text-slate-500 transition-all hover:border-sky-400/50 hover:bg-white/35 hover:text-sky-600 disabled:pointer-events-none disabled:opacity-40"
                          >
                            <Copy size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => !projectDeleteInProgress && setProjectToDelete(project)}
                            disabled={!!projectDeleteInProgress}
                            title="Delete"
                            className="rounded-lg border border-white/20 bg-white/12 p-1.5 text-slate-500 transition-all hover:border-rose-400/50 hover:bg-white/35 hover:text-rose-600 disabled:pointer-events-none disabled:opacity-40"
                          >
                            <Trash2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => !projectDeleteInProgress && !projectLoadingId && loadProject(project)}
                            disabled={!!projectDeleteInProgress || !!projectLoadingId}
                            className="rounded-lg border border-white/25 bg-white/35 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-slate-800 shadow-sm transition-all hover:border-slate-400/40 hover:bg-white/50 disabled:pointer-events-none disabled:opacity-40"
                          >
                            {projectLoadingId === project.id ? (
                              <span className="inline-flex items-center gap-1">
                                <Loader2 size={11} className="animate-spin" />
                                Cargando
                              </span>
                            ) : (
                              'Abrir'
                            )}
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
                  disabled={!!projectDeleteInProgress}
                  className="flex-1 rounded-xl border border-white/25 bg-white/15 py-2 text-[10px] font-black uppercase tracking-widest text-slate-800 transition-all hover:bg-white/35 disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (projectDeleteLockRef.current) return;
                    projectDeleteLockRef.current = true;
                    const id = projectToDelete.id as string;
                    const name = String(projectToDelete.name ?? '');
                    setProjectToDelete(null);
                    setProjectDeleteInProgress({ projectName: name });
                    void (async () => {
                      try {
                        await deleteProject(id);
                      } finally {
                        setProjectDeleteInProgress(null);
                        projectDeleteLockRef.current = false;
                      }
                    })();
                  }}
                  disabled={!!projectDeleteInProgress}
                  className="flex-1 rounded-xl border border-rose-500/45 bg-rose-600 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-md shadow-rose-900/20 transition-all hover:bg-rose-500 hover:brightness-105 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        <PerformanceHud />
        <WalletCostGuardDialog />

        {typeof document !== 'undefined' &&
          projectDeleteInProgress &&
          createPortal(
            <div
              className="fixed inset-0 z-[100070] flex items-center justify-center bg-[#07090c]/82 backdrop-blur-[3px]"
              role="alertdialog"
              aria-busy="true"
              aria-live="polite"
              aria-labelledby="spaces-delete-progress-title"
            >
              <div className="pointer-events-none mx-6 flex max-w-md flex-col items-center gap-5 rounded-2xl border border-white/[0.09] bg-[#12151a]/96 px-9 py-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)] ring-1 ring-rose-500/25">
                <div className="text-center">
                  <p id="spaces-delete-progress-title" className="text-[15px] font-semibold tracking-tight text-white">
                    Eliminando proyecto
                  </p>
                  <p className="mt-1.5 truncate text-[12px] text-zinc-300" title={projectDeleteInProgress.projectName}>
                    &quot;{projectDeleteInProgress.projectName}&quot;
                  </p>
                  <p className="mt-2 max-w-sm text-[11px] leading-relaxed text-zinc-500">
                    Borrando el proyecto en el servidor y los assets en la nube. Puede tardar un poco; no inicies otro
                    borrado hasta que termine.
                  </p>
                </div>
                <div className="h-[5px] w-[min(360px,85vw)] overflow-hidden rounded-full bg-zinc-800/95 ring-1 ring-white/[0.07]">
                  <div className="spaces-delete-indeterminate-bar h-full min-h-[5px]" />
                </div>
              </div>
            </div>,
            document.body,
          )}
      </div>
      </div>
    </div>
  );
}
