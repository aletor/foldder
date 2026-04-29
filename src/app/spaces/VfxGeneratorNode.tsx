"use client";

import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  NodeResizer,
  Position,
  useEdges,
  useNodeId,
  useNodes,
  useReactFlow,
  useUpdateNodeInternals,
  type NodeProps,
} from "@xyflow/react";
import { Video, Maximize2, Loader2 } from "lucide-react";
import { FOLDDER_FIT_VIEW_EASE } from "@/lib/fit-view-ease";
import { FoldderDataHandle } from "./FoldderDataHandle";
import { NodeIcon } from "./foldder-icons";
import { resolveFoldderNodeState } from "./foldder-icons";
import { resolvePromptValueFromEdgeSource } from "./canvas-group-logic";
import { BeebleVfxStudio, type BeebleAlphaMode } from "./BeebleVfxStudio";
import { BeebleClient, type BeebleJob } from "@/lib/beeble-api";
import { useBeebleJobPoller } from "@/hooks/useBeebleJobPoller";
import { runAiJobWithNotification } from "@/lib/ai-job-notifications";
import { FoldderNodeHeaderTitle, FoldderStudioModeCenterButton } from "./foldder-node-ui";
import { loadVideoDimensions } from "./presenter/presenter-video-frame-layout";
import {
  nodeFrameNeedsSync,
  resolveAspectLockedNodeFrame,
  resolveNodeChromeHeight,
} from "./studio-node-aspect";

const NODE_RESIZE_END_FIT_PADDING = 0.8;
const VFX_STUDIO_NODE_MAX_HEIGHT = 2200;

function FoldderNodeResizerLocal(props: React.ComponentProps<typeof NodeResizer>) {
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
              interpolate: "smooth",
              ...FOLDDER_FIT_VIEW_EASE,
            });
          });
        }
      }}
    />
  );
}

function ViewerOpenLocal({ nodeId, disabled }: { nodeId: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      title="Open viewer"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent("open-viewer-for-node", { detail: { nodeId } }));
      }}
      className={`nodrag flex shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors ${disabled ? "opacity-35" : ""}`}
      style={{
        padding: 3,
        borderRadius: 6,
        background: "rgba(255,255,255,0.12)",
        border: "1px solid rgba(255,255,255,0.28)",
        color: "#fff",
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      <Maximize2 size={9} />
    </button>
  );
}

type BaseNodeData = { label?: string; value?: string; type?: string };

export type VfxGeneratorNodeData = BaseNodeData & {
  sourceVideoUri?: string;
  referenceImageUri?: string;
  alphaUri?: string;
  /** Texto editable en el Studio; si hay cable en `prompt`, el upstream tiene prioridad al generar. */
  prompt?: string;
  /** @deprecated migrado a `prompt` (primer elemento) */
  prompts?: string[];
  alphaMode?: BeebleAlphaMode;
  maxResolution?: 720 | 1080;
  activeJobId?: string;
  activeJobStatus?: BeebleJob["status"];
  activeJobProgress?: number;
  outputRenderUrl?: string;
  outputSourceUrl?: string;
  outputAlphaUrl?: string;
};

function migrateStoredPrompt(d: VfxGeneratorNodeData): string {
  if (typeof d.prompt === "string") return d.prompt;
  if (Array.isArray(d.prompts) && d.prompts.length > 0) {
    const first = d.prompts[0];
    return typeof first === "string" ? first : "";
  }
  return "";
}

function pushAssetVersion(data: Record<string, unknown>, url: string, source: string) {
  const prev = Array.isArray(data._assetVersions) ? data._assetVersions : [];
  return [...prev, { url, source, timestamp: Date.now() }];
}

export const VfxGeneratorNode = memo(({ id, data, selected }: NodeProps<any>) => {
  const nodeData = data as VfxGeneratorNodeData;
  const { setNodes } = useReactFlow();
  const edges = useEdges();
  const nodes = useNodes();
  const updateNodeInternals = useUpdateNodeInternals();
  const [showStudio, setShowStudio] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [historyJobs, setHistoryJobs] = useState<BeebleJob[]>([]);
  const currentNode = nodes.find((node) => node.id === id);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null);

  const updatePatch = useCallback(
    (patch: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
      );
    },
    [id, setNodes],
  );

  const edgeVideo = useMemo(
    () => edges.find((e) => e.target === id && e.targetHandle === "sourceVideo"),
    [edges, id],
  );
  const edgeRefImg = useMemo(
    () => edges.find((e) => e.target === id && e.targetHandle === "referenceImage"),
    [edges, id],
  );
  const edgeAlpha = useMemo(
    () => edges.find((e) => e.target === id && e.targetHandle === "alphaMask"),
    [edges, id],
  );
  /** `prompt` es el handle actual; `p0` compatibilidad con grafos antiguos. */
  const edgePrompt = useMemo(
    () =>
      edges.find(
        (e) => e.target === id && (e.targetHandle === "prompt" || e.targetHandle === "p0"),
      ),
    [edges, id],
  );

  const videoFromGraph = useMemo(() => {
    if (!edgeVideo) return "";
    const v = resolvePromptValueFromEdgeSource(edgeVideo, nodes as any[]);
    return typeof v === "string" && v.trim() ? v.trim() : "";
  }, [edgeVideo, nodes]);

  const refFromGraph = useMemo(() => {
    if (!edgeRefImg) return "";
    const v = resolvePromptValueFromEdgeSource(edgeRefImg, nodes as any[]);
    return typeof v === "string" && v.trim() ? v.trim() : "";
  }, [edgeRefImg, nodes]);

  const alphaFromGraph = useMemo(() => {
    if (!edgeAlpha) return "";
    const v = resolvePromptValueFromEdgeSource(edgeAlpha, nodes as any[]);
    return typeof v === "string" && v.trim() ? v.trim() : "";
  }, [edgeAlpha, nodes]);

  const promptFromGraph = useMemo(() => {
    if (!edgePrompt) return "";
    const t = resolvePromptValueFromEdgeSource(edgePrompt, nodes as any[]);
    return typeof t === "string" ? t : "";
  }, [edgePrompt, nodes]);

  const storedPrompt = useMemo(() => migrateStoredPrompt(nodeData), [nodeData]);

  /** Upstream tiene prioridad si trae texto; si no, el texto guardado en el nodo. */
  const effectivePrompt = useMemo(
    () => promptFromGraph.trim() || storedPrompt.trim(),
    [promptFromGraph, storedPrompt],
  );

  const promptConnected = !!edgePrompt;

  const sourceVideoUri = videoFromGraph || (nodeData.sourceVideoUri ?? "").trim();
  const referenceImageUri = refFromGraph || (nodeData.referenceImageUri ?? "").trim();
  const alphaUri = alphaFromGraph || (nodeData.alphaUri ?? "").trim();

  const alphaMode: BeebleAlphaMode = nodeData.alphaMode ?? "auto";
  const maxResolution: 720 | 1080 = nodeData.maxResolution === 720 ? 720 : 1080;

  const client = useMemo(() => new BeebleClient(""), []);

  const onJobPoll = useCallback(
    (job: BeebleJob) => {
      if (job.status === "completed" && job.output) {
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== id) return n;
            const d = n.data as Record<string, unknown>;
            const versions = pushAssetVersion(d, job.output!.render, "beeble-vfx");
            return {
              ...n,
              data: {
                ...d,
                activeJobStatus: job.status,
                activeJobProgress: job.progress ?? 100,
                outputRenderUrl: job.output!.render,
                outputSourceUrl: job.output!.source,
                outputAlphaUrl: job.output!.alpha,
                value: job.output!.render,
                type: "video",
                _assetVersions: versions,
              },
            };
          }),
        );
        return;
      }
      updatePatch({
        activeJobStatus: job.status,
        activeJobProgress: job.progress ?? 0,
      });
    },
    [id, setNodes, updatePatch],
  );

  useBeebleJobPoller(nodeData.activeJobId ?? null, client, onJobPoll);

  const loadHistory = useCallback(async () => {
    try {
      const list = await client.listJobs();
      setHistoryJobs(Array.isArray(list) ? list : []);
    } catch {
      setHistoryJobs([]);
    }
  }, [client]);

  const refreshJobById = useCallback(
    async (jobId: string) => {
      try {
        const job = await client.getJob(jobId);
        onJobPoll(job);
      } catch {
        /* ignore */
      }
    },
    [client, onJobPoll],
  );

  const launchGeneration = useCallback(async () => {
    const prompt = effectivePrompt;
    const refU = referenceImageUri.trim();
    if (!sourceVideoUri.trim()) {
      alert("Se necesita vídeo fuente.");
      return;
    }
    if (!prompt && !refU) {
      alert("Se necesita al menos un prompt o una imagen de referencia.");
      return;
    }

    setIsLaunching(true);
    try {
      await runAiJobWithNotification({ nodeId: id, label: "VFX Generator (Beeble)" }, async () => {
        const alpha_uri =
          alphaMode === "select" || alphaMode === "custom" ? alphaUri.trim() || undefined : undefined;
        const job = await client.startGeneration({
          generation_type: "video",
          source_uri: sourceVideoUri.trim(),
          alpha_mode: alphaMode,
          prompt: prompt || undefined,
          reference_image_uri: refU || undefined,
          alpha_uri,
          max_resolution: maxResolution,
          idempotency_key: `foldder-${id}-${Date.now()}`,
        });
        updatePatch({
          activeJobId: job.id,
          activeJobStatus: job.status,
          activeJobProgress: job.progress ?? 0,
        });
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al lanzar generación");
    } finally {
      setIsLaunching(false);
    }
  }, [
    client,
    id,
    effectivePrompt,
    sourceVideoUri,
    referenceImageUri,
    alphaUri,
    alphaMode,
    maxResolution,
    updatePatch,
  ]);

  const displayVideo =
    typeof nodeData.value === "string" && nodeData.value.length > 0
      ? nodeData.value
      : nodeData.outputRenderUrl ?? "";

  const aspectVideoUrl = sourceVideoUri || displayVideo || "";

  useEffect(() => {
    if (!aspectVideoUrl) {
      setVideoSize(null);
      return;
    }
    let cancelled = false;
    loadVideoDimensions(aspectVideoUrl)
      .then(({ width, height }) => {
        if (!cancelled) setVideoSize({ width, height });
      })
      .catch(() => {
        if (!cancelled) setVideoSize(null);
      });
    return () => {
      cancelled = true;
    };
  }, [aspectVideoUrl]);

  useLayoutEffect(() => {
    if (!videoSize) return;
    const chromeHeight = resolveNodeChromeHeight(frameRef.current, previewRef.current);
    const nextFrame = resolveAspectLockedNodeFrame({
      node: currentNode,
      contentWidth: videoSize.width,
      contentHeight: videoSize.height,
      minWidth: 300,
      maxWidth: 960,
      minHeight: 220,
      maxHeight: VFX_STUDIO_NODE_MAX_HEIGHT,
      chromeHeight,
    });
    if (!nodeFrameNeedsSync(currentNode, nextFrame)) return;
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
    currentNode?.width,
    currentNode?.height,
    currentNode?.measured?.width,
    currentNode?.measured?.height,
    id,
    setNodes,
    updateNodeInternals,
    videoSize?.height,
    videoSize?.width,
  ]);

  const isBusy =
    nodeData.activeJobStatus === "in_queue" || nodeData.activeJobStatus === "processing";

  return (
    <div
      ref={frameRef}
      className={`custom-node processor-node group/node ${isBusy ? "node-glow-running" : ""}`}
      style={{ minWidth: 300 }}
    >
      <FoldderNodeResizerLocal minWidth={300} minHeight={220} maxWidth={960} maxHeight={VFX_STUDIO_NODE_MAX_HEIGHT} keepAspectRatio isVisible={selected} />

      <div className="handle-wrapper handle-left !top-[12%]">
        <FoldderDataHandle type="target" position={Position.Left} id="sourceVideo" dataType="video" />
        <span className="handle-label text-cyan-500">Video</span>
      </div>
      <div className="handle-wrapper handle-left !top-[22%]">
        <FoldderDataHandle type="target" position={Position.Left} id="referenceImage" dataType="image" />
        <span className="handle-label text-fuchsia-500">Ref</span>
      </div>
      <div className="handle-wrapper handle-left !top-[32%]">
        <FoldderDataHandle type="target" position={Position.Left} id="alphaMask" dataType="image" />
        <span className="handle-label text-emerald-500">Alpha</span>
      </div>
      <div className="handle-wrapper handle-left !top-[44%]">
        <FoldderDataHandle type="target" position={Position.Left} id="prompt" dataType="prompt" />
        <span className="handle-label text-violet-300">Prompt</span>
      </div>

      <div className="node-header">
        <NodeIcon
          type="vfxGenerator"
          selected={selected}
          state={resolveFoldderNodeState({
            loading: isBusy,
            done: !!displayVideo,
            error: false,
          })}
          size={16}
        />
        <FoldderNodeHeaderTitle
          className="flex-1 truncate uppercase tracking-wider text-zinc-200"
          introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}
        >
          VFX Generator
        </FoldderNodeHeaderTitle>
        <div className="node-badge max-w-[6rem] truncate" title="Beeble">
          BEEBLE
        </div>
        <ViewerOpenLocal nodeId={id} disabled={!displayVideo} />
      </div>

      <div
        ref={previewRef}
        className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-b-[24px] bg-[#0a0a0f] group/out"
        style={{ minHeight: 160 }}
      >
        {displayVideo ? (
          <video
            src={displayVideo}
            className="max-h-full max-w-full object-contain"
            controls
            loop
            muted
            playsInline
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-6 opacity-35">
            <Video size={30} className="text-zinc-500" />
            <span className="text-center text-[8px] font-black uppercase tracking-widest text-zinc-600">
              Sin vídeo · Studio
            </span>
          </div>
        )}

        <FoldderStudioModeCenterButton onClick={() => setShowStudio(true)} />

        {isBusy && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[50]">
            <div className="h-px w-full bg-white/15">
              <div
                className="h-full bg-violet-400 transition-all duration-500"
                style={{ width: `${Math.min(100, nodeData.activeJobProgress ?? 33)}%` }}
              />
            </div>
            <p className="bg-black/80 px-2 py-1 text-center text-[7px] font-black uppercase tracking-widest text-violet-200">
              {nodeData.activeJobStatus === "in_queue" ? "En cola…" : "Procesando…"}
            </p>
          </div>
        )}
      </div>

      {showStudio && (
        <BeebleVfxStudio
          onClose={() => setShowStudio(false)}
          updatePatch={updatePatch}
          nodeLabel={typeof nodeData.label === "string" ? nodeData.label : ""}
          sourceVideoUri={sourceVideoUri}
          sourceVideoConnected={!!edgeVideo && !!videoFromGraph}
          referenceImageUri={referenceImageUri}
          referenceConnected={!!edgeRefImg && !!refFromGraph}
          alphaUri={alphaUri}
          alphaConnected={!!edgeAlpha && !!alphaFromGraph}
          alphaMode={alphaMode}
          maxResolution={maxResolution}
          prompt={storedPrompt}
          promptFromGraph={promptFromGraph}
          promptConnected={promptConnected}
          activeJobId={nodeData.activeJobId}
          activeJobStatus={nodeData.activeJobStatus}
          activeJobProgress={nodeData.activeJobProgress}
          outputRenderUrl={nodeData.outputRenderUrl}
          outputSourceUrl={nodeData.outputSourceUrl}
          outputAlphaUrl={nodeData.outputAlphaUrl}
          onLaunch={launchGeneration}
          isLaunching={isLaunching}
          onRefreshJob={refreshJobById}
          historyJobs={historyJobs}
          onLoadHistory={loadHistory}
        />
      )}

      <div className="handle-wrapper handle-right" style={{ top: "50%" }}>
        <span className="handle-label text-cyan-400">Video Out</span>
        <FoldderDataHandle type="source" position={Position.Right} id="video" dataType="video" />
      </div>
    </div>
  );
});

VfxGeneratorNode.displayName = "VfxGeneratorNode";
