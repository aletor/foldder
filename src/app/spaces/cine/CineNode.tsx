"use client";

import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { NodeResizer, NodeProps, useReactFlow, useStore, useUpdateNodeInternals, type Edge, type Node, type ReactFlowState } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { defaultDataForCanvasDropNode } from "@/lib/canvas-connect-end-drop";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
import { CineStudio } from "../CineStudio";
import {
  CINE_MODE_LABELS,
  CINE_STATUS_LABELS,
  normalizeCineData,
  type CineImageStudioResult,
  type CineImageStudioSession,
  type CineNodeData,
} from "../cine-types";
import {
  applyCineImageStudioResult,
  buildCineMediaListOutput,
  getEffectiveCharacterSheetAsset,
  getEffectiveCharacterSheetS3Key,
  getEffectiveCineBackgroundAsset,
  getEffectiveCineBackgroundS3Key,
  getEffectiveCineCharacterAsset,
  getEffectiveCineCharacterS3Key,
  getEffectiveCineFrameAsset,
  getEffectiveCineFrameS3Key,
  getEffectiveLocationSheetAsset,
  getEffectiveLocationSheetS3Key,
} from "../cine-engine";
import { getNodeGridFrameForType, growCanvasDimensionToGrid } from "../canvas-grid-layout";
import { withFoldderCanvasIntro } from "../spaces-canvas-intro";
import { FOLDDER_REGISTER_CANVAS_INTRO_EVENT } from "../hooks/use-foldder-canvas-intro";
import {
  FoldderNodeContentDock,
  FoldderNodeContentDockActions,
  FoldderNodeContentDockMain,
  FoldderNodeContentMeta,
  FoldderNodeContentMetaRow,
  FoldderStudioModeCenterButton,
} from "../foldder-node-ui";
import {
  StudioCanvasNodeShell,
  type StudioCanvasNodeHandleSpec,
} from "../studio-node/studio-canvas-node";
import { hasFoldderStudioTouched, touchStudioNodeData } from "../studio-node/foldder-studio-touched";
import { resolveFoldderNodeStudioBackground } from "../studio-node/foldder-studio-node-backgrounds";
import { useStudioNodeController } from "../studio-node/studio-node-architecture";
import { textFromStudioSourceNode } from "../studio-node/source-node-text";
import {
  dispatchOpenNanoStudioFromCine,
  registerPendingNanoStudioOpenFromCine,
} from "./cine-nano-open-pending";
import { useFoldderRenderMetric } from "../use-performance-metrics";
import { nodeFrameFromSnapshot, selectNodeFrameSnapshot } from "../react-flow-selectors";
import {
  nodeFrameNeedsSync,
  parseAspectRatioValue,
  resolveAspectLockedNodeFrame,
  resolveNodeChromeHeight,
  resolveNodeFrameWidth,
} from "../studio-node-aspect";

const CINE_NODE_MAX_HEIGHT = 2200;
const CINE_ACCENT = "#de323f";
const CINE_DOCK_MIN_CHROME = 180;
const CINE_CONNECTED_PREVIEW_MIN = 140;
const CINE_EMPTY_BACKGROUND_SRC = resolveFoldderNodeStudioBackground("cine");

function FoldderNodeResizer(props: ComponentProps<typeof NodeResizer>) {
  return <NodeResizer {...props} />;
}

type CineInputSnapshot = {
  sourceScriptText: string;
  sourceScriptNodeId?: string;
  brainConnected: boolean;
};

function selectCineInputSnapshot(state: ReactFlowState<Node, Edge>, nodeId: string): CineInputSnapshot {
  const nodeLookup = state.nodeLookup as unknown as ReadonlyMap<string, Node>;
  let sourceScriptNode: Node | undefined;
  let brainConnected = false;

  for (const edge of state.edges) {
    if (edge.target !== nodeId) continue;
    if (!sourceScriptNode && (edge.targetHandle === "script" || edge.targetHandle === "prompt" || edge.targetHandle === "text")) {
      sourceScriptNode = nodeLookup.get(edge.source);
    }
    if (!brainConnected && (edge.targetHandle === "brain" || nodeLookup.get(edge.source)?.type === "projectBrain")) {
      brainConnected = true;
    }
    if (sourceScriptNode && brainConnected) break;
  }

  return {
    sourceScriptText: textFromStudioSourceNode(sourceScriptNode),
    sourceScriptNodeId: sourceScriptNode?.id,
    brainConnected,
  };
}

type CineCanvasPreviewImage = {
  src: string;
  s3Key?: string;
  title: string;
  label: string;
};

function latestCineCanvasImage(data: CineNodeData): CineCanvasPreviewImage | null {
  const candidates: CineCanvasPreviewImage[] = [];
  const push = (src: string | undefined, s3Key: string | undefined, title: string, label: string) => {
    if (src) candidates.push({ src, s3Key, title, label });
  };
  push(getEffectiveCharacterSheetAsset(data), getEffectiveCharacterSheetS3Key(data), "Hoja de continuidad", "Reparto");
  push(getEffectiveLocationSheetAsset(data), getEffectiveLocationSheetS3Key(data), "Hoja de localizaciones", "Fondos");
  data.characters.forEach((character) =>
    push(getEffectiveCineCharacterAsset(character), getEffectiveCineCharacterS3Key(character), character.name || "Personaje", "Personaje"),
  );
  data.backgrounds.forEach((background) =>
    push(getEffectiveCineBackgroundAsset(background), getEffectiveCineBackgroundS3Key(background), background.name || "Fondo", "Fondo"),
  );
  data.scenes.forEach((scene) => {
    push(getEffectiveCineFrameAsset(scene.frames.single), getEffectiveCineFrameS3Key(scene.frames.single), scene.title || "Escena", `Escena ${scene.order}`);
    push(getEffectiveCineFrameAsset(scene.frames.start), getEffectiveCineFrameS3Key(scene.frames.start), scene.title || "Escena", `Escena ${scene.order} · inicio`);
    push(getEffectiveCineFrameAsset(scene.frames.end), getEffectiveCineFrameS3Key(scene.frames.end), scene.title || "Escena", `Escena ${scene.order} · final`);
  });
  return candidates.at(-1) ?? null;
}

function resolveCineNodeHeight(args: { baseHeight: number; hasDock: boolean }): number {
  if (!args.hasDock) return args.baseHeight;
  return Math.min(
    CINE_NODE_MAX_HEIGHT,
    growCanvasDimensionToGrid(Math.max(args.baseHeight, CINE_CONNECTED_PREVIEW_MIN + CINE_DOCK_MIN_CHROME)),
  );
}

const CINE_NODE_S3_URL_TTL_MS = 50 * 60 * 1000;
const cineNodePresignedUrlCache = new globalThis.Map<string, { url: string; expiresAt: number }>();
const cineNodePresignInFlight = new globalThis.Map<string, Promise<string | null>>();

function resolveCineNodeS3Key(src?: string, s3Key?: string): string | undefined {
  const direct = typeof s3Key === "string" && s3Key.trim() ? s3Key.trim() : "";
  if (direct) return direct;
  const fromUrl = typeof src === "string" ? tryExtractKnowledgeFilesKeyFromUrl(src) : null;
  return fromUrl || undefined;
}

async function presignCineNodeS3Key(key: string): Promise<string | null> {
  const cached = cineNodePresignedUrlCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const pending = cineNodePresignInFlight.get(key);
  if (pending) return pending;
  const promise = (async () => {
    try {
      const res = await fetch("/api/spaces/s3-presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: [key] }),
      });
      if (!res.ok) return null;
      const payload = (await res.json()) as { urls?: Record<string, string> };
      const url = payload.urls?.[key];
      if (!url) return null;
      cineNodePresignedUrlCache.set(key, { url, expiresAt: Date.now() + CINE_NODE_S3_URL_TTL_MS });
      return url;
    } catch {
      return null;
    } finally {
      cineNodePresignInFlight.delete(key);
    }
  })();
  cineNodePresignInFlight.set(key, promise);
  return promise;
}

function useCineNodeResolvedImageUrl(src?: string, s3Key?: string): { url?: string; refresh: () => void } {
  const [resolved, setResolved] = useState<{ cacheKey: string; url: string } | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const key = resolveCineNodeS3Key(src, s3Key);
  const cacheKey = `${src || ""}\u0001${key || ""}`;
  useEffect(() => {
    let cancelled = false;
    if (!key) return () => {
      cancelled = true;
    };
    void (async () => {
      const fresh = await presignCineNodeS3Key(key);
      if (!cancelled && fresh) setResolved({ cacheKey, url: fresh });
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey, key, refreshNonce]);
  return {
    url: key ? (resolved?.cacheKey === cacheKey ? resolved.url : undefined) : src,
    refresh: () => {
      if (key) cineNodePresignedUrlCache.delete(key);
      setRefreshNonce((value) => value + 1);
    },
  };
}

const CINE_NODE_HANDLES: StudioCanvasNodeHandleSpec[] = [
  { side: "left", top: "30%", type: "target", id: "prompt", dataType: "prompt", label: "Guion" },
  { side: "left", top: "54%", type: "target", id: "text", dataType: "txt", label: "Text" },
  { side: "left", top: "78%", type: "target", id: "brain", dataType: "brain", label: "BrandKit" },
  { side: "right", top: "52%", type: "source", id: "media_list", dataType: "generic", label: "Media List" },
];

export const CineNode = memo(function CineNode({ id, data, selected }: NodeProps) {
  useFoldderRenderMetric("CineNode", id);
  const nodeData = normalizeCineData(data);
  const { setNodes, getNodes, fitView } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const frameRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const frameSyncKeyRef = useRef<string | null>(null);
  const currentFrameSnapshot = useStore(
    useCallback((state: ReactFlowState<Node, Edge>) => selectNodeFrameSnapshot(state, id), [id]),
    shallow,
  );
  const currentFrameNode = useMemo(() => nodeFrameFromSnapshot(currentFrameSnapshot), [currentFrameSnapshot]);
  const directorAspectRatio = nodeData.visualDirection.aspectRatio || "16:9";
  const cineAspect = parseAspectRatioValue(directorAspectRatio) ?? { width: 16, height: 9 };
  const cineInputSnapshot = useStore(
    useCallback((state: ReactFlowState<Node, Edge>) => selectCineInputSnapshot(state, id), [id]),
    shallow,
  );
  const [studioReturn, setStudioReturn] = useState<{
    tab?: "direction" | "script" | "cast" | "backgrounds" | "storyboard" | "output";
    sceneId?: string;
  } | null>(null);
  const { isStudioOpen, openStudio, closeStudio } = useStudioNodeController({
    nodeId: id,
    nodeType: "cine",
  });

  const sourceScriptText = cineInputSnapshot.sourceScriptText;
  const brainConnected = cineInputSnapshot.brainConnected;
  const framesPrepared = useMemo(
    () => nodeData.scenes.reduce((count, scene) => count + [scene.frames.single, scene.frames.start, scene.frames.end].filter(Boolean).length, 0),
    [nodeData.scenes],
  );
  const framesTotal = useMemo(
    () => nodeData.scenes.reduce((count, scene) => count + (scene.framesMode === "start_end" ? 2 : 1), 0),
    [nodeData.scenes],
  );

  const patchData = useCallback(
    (next: CineNodeData) => {
      const mediaListOutput = buildCineMediaListOutput(next, id);
      setNodes((nds) =>
        nds.map((node) =>
          node.id === id
            ? {
                ...node,
                data: touchStudioNodeData(node.data as Record<string, unknown>, {
                  ...next,
                  mediaListOutput,
                  media_list: mediaListOutput,
                  value: JSON.stringify(mediaListOutput),
                }),
              }
            : node,
        ),
      );
    },
    [id, setNodes],
  );

  const getOrCreateCineImageStudioNode = useCallback((): string | null => {
    const nodesNow = getNodes() as Array<{ id: string; type?: string; position: { x: number; y: number }; data?: Record<string, unknown> }>;
    const existing = nodesNow.find((node) =>
      node.type === "nanoBanana" &&
      node.data?.companionFor === "cine-node" &&
      node.data?.cineNodeId === id,
    );
    if (existing) return existing.id;
    const cineNode = nodesNow.find((node) => node.id === id);
    if (!cineNode) return null;
    const nanoId = `nanoBanana_cine_${id}_${Date.now()}`;
    const defaults = defaultDataForCanvasDropNode("nanoBanana") as Record<string, unknown>;
    const nanoNode = {
      id: nanoId,
      type: "nanoBanana",
      position: {
        x: cineNode.position.x + 360,
        y: cineNode.position.y + 18,
      },
      data: withFoldderCanvasIntro("nanoBanana", {
        ...defaults,
        label: "Cine · Crear Imagen",
        companionFor: "cine-node",
        cineNodeId: id,
      }),
    };
    setNodes((nds) => [...nds, nanoNode as (typeof nds)[number]]);
    window.dispatchEvent(
      new CustomEvent(FOLDDER_REGISTER_CANVAS_INTRO_EVENT, {
        detail: { nodeIds: [nanoId] },
      }),
    );
    return nanoId;
  }, [getNodes, id, setNodes]);

  const openImageStudioFromCine = useCallback((sessionBase: Omit<CineImageStudioSession, "nanoNodeId">) => {
    const nanoNodeId = getOrCreateCineImageStudioNode();
    if (!nanoNodeId) return;
    const session: CineImageStudioSession = { ...sessionBase, nanoNodeId };
    registerPendingNanoStudioOpenFromCine(nanoNodeId, session);
    closeStudio();
    requestAnimationFrame(() => {
      void fitView({
        nodes: [{ id }, { id: nanoNodeId }],
        padding: 0.45,
        duration: 560,
      });
      dispatchOpenNanoStudioFromCine(nanoNodeId, session);
    });
  }, [closeStudio, fitView, getOrCreateCineImageStudioNode, id]);

  useEffect(() => {
    const mapReturnTab = (tab?: CineImageStudioSession["returnTab"]) => {
      if (tab === "reparto") return "cast" as const;
      if (tab === "fondos") return "backgrounds" as const;
      if (tab === "storyboard") return "storyboard" as const;
      return "script" as const;
    };
    const onOpenCine = (ev: Event) => {
      const detail = (ev as CustomEvent<{
        cineNodeId?: string;
        returnTab?: CineImageStudioSession["returnTab"];
        returnSceneId?: string;
        session?: CineImageStudioSession;
        result?: CineImageStudioResult;
      }>).detail;
      if (detail?.cineNodeId !== id) return;
      if (detail.session && detail.result?.assetId) {
        setNodes((nds) =>
          nds.map((node) =>
            node.id === id
              ? (() => {
                  const next = applyCineImageStudioResult(normalizeCineData(node.data), detail.session!, detail.result!);
                  const mediaListOutput = buildCineMediaListOutput(next, id);
                  return {
                    ...node,
                    data: {
                      ...node.data,
                      ...next,
                      mediaListOutput,
                      media_list: mediaListOutput,
                      value: JSON.stringify(mediaListOutput),
                    },
                  };
                })()
              : node,
          ),
        );
      }
      setStudioReturn({ tab: mapReturnTab(detail.returnTab), sceneId: detail.returnSceneId });
      openStudio();
    };
    window.addEventListener("foldder-open-cine-studio", onOpenCine as EventListener);
    return () => window.removeEventListener("foldder-open-cine-studio", onOpenCine as EventListener);
  }, [id, openStudio, setNodes]);

  const modeLabel = CINE_MODE_LABELS[nodeData.mode];
  const previewImage = latestCineCanvasImage(nodeData);
  const { url: previewUrl, refresh: refreshPreviewUrl } = useCineNodeResolvedImageUrl(previewImage?.src, previewImage?.s3Key);
  const [previewRetriedFor, setPreviewRetriedFor] = useState<string | null>(null);
  const previewRetryKey = `${previewImage?.src || ""}\u0001${previewImage?.s3Key || ""}`;
  const hasPreviewAsset = Boolean(previewImage);
  const hasPreview = Boolean(previewImage && previewUrl);
  const hasConnections = brainConnected || Boolean(sourceScriptText.trim());
  const hasContent =
    nodeData.status !== "empty" ||
    nodeData.scenes.length > 0 ||
    nodeData.characters.length > 0 ||
    nodeData.backgrounds.length > 0 ||
    framesPrepared > 0 ||
    Boolean(nodeData.detected?.logline?.trim());
  const hasDock = hasConnections || hasContent || hasPreviewAsset;
  const isEmpty = !hasDock;
  const connectedOnly = hasConnections && !hasContent && !hasPreviewAsset;
  const studioTouched = hasFoldderStudioTouched(nodeData as Record<string, unknown>);
  const showExteriorTile = hasDock;

  const scriptTitle = nodeData.sourceScript?.title || nodeData.label || nodeData.detected?.logline || "Cine";
  const inputsLabel = useMemo(() => {
    const parts: string[] = [];
    if (sourceScriptText.trim()) parts.push("Guion");
    if (brainConnected) parts.push("BrandKit");
    return parts.length > 0 ? parts.join(" · ") : "—";
  }, [brainConnected, sourceScriptText]);
  const scenesLabel = `${nodeData.scenes.length} escena${nodeData.scenes.length === 1 ? "" : "s"}`;
  const castLabel = `${nodeData.characters.length} personaje${nodeData.characters.length === 1 ? "" : "s"}`;
  const framesLabel = `${framesPrepared}/${framesTotal || 0}`;
  const statusLabel =
    isEmpty
      ? "Vacío"
      : connectedOnly
        ? "Conectado"
        : CINE_STATUS_LABELS[nodeData.status] ?? nodeData.status;
  const previewLine = hasPreview && previewImage
    ? `${previewImage.label} · ${previewImage.title}`
    : hasContent
      ? nodeData.detected?.logline?.trim() || sourceScriptText.trim() || "Mesa de dirección configurada."
      : hasConnections
        ? "Entradas conectadas. Abre Studio para analizar el guion."
        : "Convierte guion en escenas, reparto, fondos y frames.";

  useLayoutEffect(() => {
    const baseFrame = getNodeGridFrameForType("cine");
    if (!baseFrame) return;

    if (hasPreviewAsset) {
      const syncKey = `${directorAspectRatio}:${cineAspect.width}x${cineAspect.height}:${hasDock ? "dock" : "preview-only"}`;
      if (frameSyncKeyRef.current === syncKey) return;
      const chromeHeight = resolveNodeChromeHeight(frameRef.current, previewRef.current);
      const nextFrame = resolveAspectLockedNodeFrame({
        node: currentFrameNode,
        contentWidth: cineAspect.width,
        contentHeight: cineAspect.height,
        minWidth: 200,
        maxWidth: 960,
        minHeight: 120,
        maxHeight: CINE_NODE_MAX_HEIGHT,
        chromeHeight,
      });
      frameSyncKeyRef.current = syncKey;
      const nextAspectRatio = cineAspect.width / cineAspect.height;
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
      const syncKey = "cine-base";
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

    const measuredHeight = resolveCineNodeHeight({ baseHeight: baseFrame.height, hasDock: true });
    const syncKey = `cine-content:${hasConnections ? "connected" : "idle"}:${hasPreviewAsset ? "asset" : "meta"}:${measuredHeight}:${nodeData.status}`;
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
            maxHeight: CINE_NODE_MAX_HEIGHT,
          },
        };
      }),
    );
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [
    cineAspect.height,
    cineAspect.width,
    connectedOnly,
    currentFrameNode,
    currentFrameSnapshot.height,
    currentFrameSnapshot.measuredHeight,
    currentFrameSnapshot.measuredWidth,
    currentFrameSnapshot.styleHeight,
    currentFrameSnapshot.styleWidth,
    currentFrameSnapshot.width,
    directorAspectRatio,
    hasConnections,
    hasDock,
    hasPreviewAsset,
    id,
    isEmpty,
    nodeData.status,
    setNodes,
    updateNodeInternals,
  ]);

  return (
    <StudioCanvasNodeShell
      ref={frameRef}
      nodeId={id}
      nodeType="cine"
      selected={selected}
      label={nodeData.label}
      defaultLabel="Cine"
      title="CINE"
      introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}
      minWidth={200}
      className={`cine-node foldder-frameless-label-dark${hasDock ? " cine-node--has-content" : " cine-node--empty"}${hasPreviewAsset ? " cine-node--has-preview" : ""}${connectedOnly ? " cine-node--connected-only" : ""}${hasConnections ? " cine-node--connected" : ""}`}
      handles={CINE_NODE_HANDLES}
      variant="frameless"
      material="media"
      studioTouched={showExteriorTile && studioTouched}
      exteriorTileMark={showExteriorTile}
      style={
        {
          minWidth: 200,
          minHeight: hasDock ? CINE_DOCK_MIN_CHROME + CINE_CONNECTED_PREVIEW_MIN : 300,
          "--foldder-node-card-bg": CINE_ACCENT,
          "--foldder-frameless-glass-bg": CINE_ACCENT,
          "--foldder-frameless-accent": CINE_ACCENT,
        } as React.CSSProperties
      }
    >
      <FoldderNodeResizer
        minWidth={200}
        minHeight={120}
        maxWidth={960}
        maxHeight={CINE_NODE_MAX_HEIGHT}
        keepAspectRatio={hasPreviewAsset}
        isVisible={selected}
      />
      <div
        className={`node-content foldder-frameless-main cine-node-main${hasDock ? " foldder-node-content-main--with-dock" : ""}`}
      >
        <div
          ref={previewRef}
          className="cine-node-preview-area foldder-node-content-preview-area"
        >
          {hasPreview && previewImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={previewImage.title}
              className="cine-node-preview-img"
              draggable={false}
              onError={() => {
                if (previewRetriedFor !== previewRetryKey) {
                  setPreviewRetriedFor(previewRetryKey);
                  refreshPreviewUrl();
                }
              }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={CINE_EMPTY_BACKGROUND_SRC}
              alt=""
              className="cine-node-bg"
              draggable={false}
            />
          )}

          {isEmpty ? (
            <>
              <div className="cine-node-empty-hint" aria-hidden>
                <span className="cine-node-empty-hint__title">Cine vacío</span>
                <span className="cine-node-empty-hint__body">
                  Conecta Guion, Text o BrandKit y abre Studio.
                </span>
              </div>
              <FoldderStudioModeCenterButton
                label="Empezar"
                title="Abrir Cine Studio"
                onClick={openStudio}
              />
            </>
          ) : null}
        </div>

        {hasDock ? (
          <div className="cine-node-dock-wrap shrink-0">
            <FoldderNodeContentDock allowNodeDrag>
              <FoldderNodeContentDockMain>
                <p className="foldder-node-content-dock-text">{scriptTitle}</p>
                <p className="foldder-node-content-dock-text foldder-node-content-dock-text--placeholder">
                  {previewLine}
                </p>
                <FoldderNodeContentMeta>
                  <FoldderNodeContentMetaRow label="Modo" value={modeLabel} />
                  <FoldderNodeContentMetaRow label="Entradas" value={inputsLabel} />
                  <FoldderNodeContentMetaRow label="Escenas" value={scenesLabel} />
                  <FoldderNodeContentMetaRow label="Reparto" value={castLabel} />
                  <FoldderNodeContentMetaRow label="Frames" value={framesLabel} />
                  <FoldderNodeContentMetaRow label="Estado" value={statusLabel} variant="status" />
                </FoldderNodeContentMeta>
              </FoldderNodeContentDockMain>
              <FoldderNodeContentDockActions className="cine-node-dock-actions">
                <FoldderStudioModeCenterButton
                  variant="dock"
                  label="Abrir Cine"
                  title="Abrir Cine Studio"
                  onClick={openStudio}
                />
              </FoldderNodeContentDockActions>
            </FoldderNodeContentDock>
          </div>
        ) : null}
      </div>

      {isStudioOpen ? (
        <CineStudio
          nodeId={id}
          data={nodeData}
          onChange={patchData}
          onClose={() => closeStudio()}
          brainConnected={brainConnected}
          sourceScriptText={sourceScriptText}
          sourceScriptNodeId={cineInputSnapshot.sourceScriptNodeId}
          initialTab={studioReturn?.tab}
          initialSceneId={studioReturn?.sceneId}
          onOpenImageStudio={openImageStudioFromCine}
        />
      ) : null}
    </StudioCanvasNodeShell>
  );
});
