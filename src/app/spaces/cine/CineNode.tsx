"use client";

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { NodeResizer, NodeProps, useReactFlow, useStore, type Edge, type Node, type ReactFlowState } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { Film } from "lucide-react";
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
import { withFoldderCanvasIntro } from "../spaces-canvas-intro";
import {
  StudioCanvasNodeShell,
  StudioCanvasOpenButton,
  StudioCanvasPill,
  type StudioCanvasNodeHandleSpec,
} from "../studio-node/studio-canvas-node";
import { hasFoldderStudioTouched, touchStudioNodeData } from "../studio-node/foldder-studio-touched";
import { useStudioNodeController } from "../studio-node/studio-node-architecture";
import { textFromStudioSourceNode } from "../studio-node/source-node-text";
import {
  dispatchOpenNanoStudioFromCine,
  registerPendingNanoStudioOpenFromCine,
} from "./cine-nano-open-pending";
import { useFoldderRenderMetric } from "../use-performance-metrics";

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

const CINE_NODE_S3_URL_TTL_MS = 50 * 60 * 1000;
const CINE_EMPTY_BACKGROUND_SRC = "/assets/nodes/cine-empty-red.png";
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
  { side: "left", top: "78%", type: "target", id: "brain", dataType: "brain", label: "Brain" },
  { side: "right", top: "52%", type: "source", id: "media_list", dataType: "generic", label: "Media List" },
];

export const CineNode = memo(function CineNode({ id, data, selected }: NodeProps) {
  useFoldderRenderMetric("CineNode", id);
  const nodeData = normalizeCineData(data);
  const { setNodes, getNodes, fitView } = useReactFlow();
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

  const statusLabel = CINE_STATUS_LABELS[nodeData.status];
  const modeLabel = CINE_MODE_LABELS[nodeData.mode];
  const previewImage = latestCineCanvasImage(nodeData);
  const { url: previewUrl, refresh: refreshPreviewUrl } = useCineNodeResolvedImageUrl(previewImage?.src, previewImage?.s3Key);
  const [previewRetriedFor, setPreviewRetriedFor] = useState<string | null>(null);
  const previewRetryKey = `${previewImage?.src || ""}\u0001${previewImage?.s3Key || ""}`;
  const scriptTitle = nodeData.sourceScript?.title || nodeData.label || nodeData.detected?.logline || "Cine";
  const metricClassName = previewImage
    ? "rounded-none border border-white/15 bg-black/35 px-2 py-1.5 text-[10px] font-semibold text-white/88 shadow-sm backdrop-blur-md"
    : "rounded-none border border-slate-200/70 bg-white/80 px-2 py-1.5 text-[10px] font-semibold text-slate-700";
  const compactPillClassName = previewImage
    ? "rounded-full border border-white/15 bg-black/30 px-2.5 py-1 text-[10px] font-semibold text-white/78 backdrop-blur-md"
    : "";

  return (
    <StudioCanvasNodeShell
      nodeId={id}
      nodeType="cine"
      selected={selected}
      label={nodeData.label}
      defaultLabel="Cine"
      title="CINE"
      badge={modeLabel}
      introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}
      minWidth={200}
      className={previewImage ? "cine-node" : "cine-node cine-node--empty foldder-frameless-label-dark"}
      handles={CINE_NODE_HANDLES}
      variant="frameless"
      material="media"
      studioTouched={hasFoldderStudioTouched(nodeData as Record<string, unknown>)}
    >
      <NodeResizer minWidth={200} minHeight={120} maxWidth={960} maxHeight={2200} isVisible={selected} />
      {previewImage ? (
      <div className="node-content cine-node-content cine-node-content--media relative flex min-h-0 flex-1 flex-col justify-end gap-3 overflow-hidden rounded-none px-3 pb-3 pt-3">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={previewImage.title}
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
            onError={() => {
              if (previewRetriedFor !== previewRetryKey) {
                setPreviewRetriedFor(previewRetryKey);
                refreshPreviewUrl();
              }
            }}
          />
        ) : null}

        <div className="cine-summary-panel relative z-10">
          <div className="mb-3">
            <h3 className="line-clamp-3 text-[20px] font-semibold leading-[1.02] tracking-[-0.045em] text-white drop-shadow-sm">
              {scriptTitle}
            </h3>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <span className={metricClassName}>
              {nodeData.scenes.length} escenas
            </span>
            <span className={metricClassName}>
              {nodeData.characters.length} personajes
            </span>
            <span className={metricClassName}>
              {nodeData.backgrounds.length} fondos
            </span>
            <span className={metricClassName}>
              {framesPrepared}/{framesTotal || 0} frames
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className={compactPillClassName}>{brainConnected ? "Brain conectado" : "Sin Brain"}</span>
            <span className={compactPillClassName}>{sourceScriptText ? "Guionista conectado" : "Guion manual"}</span>
          </div>
        </div>

        <StudioCanvasOpenButton
          onClick={openStudio}
          accent="cyan"
          icon={<Film className="h-4 w-4" strokeWidth={2} />}
          className="relative z-10 border-white/20 bg-white/88 shadow-[0_16px_40px_rgba(0,0,0,0.28)] backdrop-blur-md"
        >
          Abrir Cine
        </StudioCanvasOpenButton>
      </div>
      ) : (
      <div className="foldder-frameless-main relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="cine-empty-background absolute inset-0 overflow-hidden" aria-hidden>
          <img
            src={CINE_EMPTY_BACKGROUND_SRC}
            alt=""
            className="h-full w-full object-contain object-bottom"
            draggable={false}
          />
        </div>
        <div className="node-content cine-node-content relative z-10 flex flex-col gap-3 px-3 pb-3 pt-2">
        <div className="cine-summary-panel">
          <div className="min-w-0">
            <span className="node-label">Mesa de dirección</span>
            <h3 className="mt-1 text-[18px] font-semibold leading-tight tracking-[-0.035em] text-slate-950">
              {statusLabel}
            </h3>
            <p className="mt-1 line-clamp-2 text-[11px] font-light leading-relaxed text-slate-600">
              {nodeData.detected?.logline || sourceScriptText || "Convierte guion en escenas, reparto, fondos y frames."}
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <span className={metricClassName}>
              {nodeData.scenes.length} escenas
            </span>
            <span className={metricClassName}>
              {nodeData.characters.length} personajes
            </span>
            <span className={metricClassName}>
              {nodeData.backgrounds.length} fondos
            </span>
            <span className={metricClassName}>
              {framesPrepared}/{framesTotal || 0} frames
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <StudioCanvasPill active={brainConnected} activeClassName="border-cyan-400/25 bg-cyan-400/10 text-cyan-700">
              {brainConnected ? "Brain conectado" : "Sin Brain"}
            </StudioCanvasPill>
            <StudioCanvasPill active={Boolean(sourceScriptText)} activeClassName="border-amber-400/25 bg-amber-400/10 text-amber-700">
              {sourceScriptText ? "Guionista conectado" : "Guion manual"}
            </StudioCanvasPill>
          </div>
        </div>

        <StudioCanvasOpenButton
          onClick={openStudio}
          accent="cyan"
          icon={<Film className="h-4 w-4" strokeWidth={2} />}
        >
          Abrir Cine
        </StudioCanvasOpenButton>
        </div>
      </div>
      )}

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
