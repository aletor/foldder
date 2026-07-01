"use client";

/* eslint-disable @next/next/no-img-element */

import React, { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import {
  Position,
  NodeProps,
  NodeResizer,
  useNodes,
  useEdges,
  useReactFlow,
  useUpdateNodeInternals,
  type Node,
} from "@xyflow/react";
import { Loader2, Zap } from "lucide-react";
import { runAiJobWithNotification } from "@/lib/ai-job-notifications";
import { resolvePromptValueFromEdgeSource } from "../canvas-group-logic";
import { getNodeGridFrameForType } from "../canvas-grid-layout";
import { FoldderDataHandle } from "../FoldderDataHandle";
import { NodeIcon, resolveFoldderNodeState } from "../foldder-icons";
import {
  FoldderNodeContentDock,
  FoldderNodeContentDockActions,
  FoldderNodeContentDockMain,
  FoldderNodeContentMeta,
  FoldderNodeContentMetaRow,
  FoldderNodeHeaderTitle,
  NodeLabel,
} from "../foldder-node-ui";
import { FoldderStudioTouchedMark } from "../studio-node/foldder-studio-touched-mark";
import { useRegisterAssistantNodeRun } from "../use-assistant-node-run";
import {
  loadImageDimensions,
  nodeFrameNeedsSync,
  resolveAspectLockedNodeFrame,
  resolveNodeChromeHeight,
} from "../studio-node-aspect";
import "../spaces.css";

type BackgroundRemoverNodeData = {
  label?: string;
  expansion?: number;
  feather?: number;
  threshold?: number;
  result_rgba?: string;
  result_mask?: string;
  bbox?: number[];
  value?: string;
  _foldderCanvasIntro?: boolean;
};

type MattePreviewMode = "original" | "mask" | "cutout";

const STUDIO_NODE_MAX_HEIGHT = 2200;
const MASK_BG_SRC = "/nodes/bg-remover-bg.png";
const MASK_DOCK_MIN_CHROME = 132;

function resolveMaskDockChrome(
  frameEl: HTMLElement | null,
  previewEl: HTMLElement | null,
  dockEl: HTMLElement | null,
): number {
  const measuredDock = dockEl?.offsetHeight ?? 0;
  const measuredChrome = resolveNodeChromeHeight(frameEl, previewEl, MASK_DOCK_MIN_CHROME);
  return Math.max(MASK_DOCK_MIN_CHROME, measuredDock, measuredChrome);
}

function createNodeFrameSnapshot(
  node: Pick<Node, "width" | "height" | "measured" | "style"> | undefined,
): Pick<Node, "width" | "height" | "measured" | "style"> | undefined {
  if (!node) return undefined;
  return {
    width: node.width,
    height: node.height,
    measured: node.measured
      ? { width: node.measured.width, height: node.measured.height }
      : undefined,
    style: node.style ? { width: node.style.width, height: node.style.height } : undefined,
  };
}

function useCurrentNodeFrameSnapshot(
  node: Node | undefined,
): Pick<Node, "width" | "height" | "measured" | "style"> | undefined {
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
      typeof (node.data as { _foldderAspectRatio?: unknown } | undefined)?._foldderAspectRatio ===
      "number"
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

function FoldderNodeResizer(props: ComponentProps<typeof NodeResizer>) {
  return <NodeResizer {...props} />;
}

export const BackgroundRemoverNode = memo(function BackgroundRemoverNode({
  id,
  data,
  selected,
}: NodeProps) {
  const nodeData = (data ?? {}) as BackgroundRemoverNodeData;
  const nodes = useNodes();
  const edges = useEdges();
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const [status, setStatus] = useState("idle");
  const [previewMode, setPreviewMode] = useState<MattePreviewMode>("cutout");
  const currentNode = nodes.find((node) => node.id === id);
  const currentFrameNode = useCurrentNodeFrameSnapshot(currentNode);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const frameSyncKeyRef = useRef<string | null>(null);
  const [aspectImageSize, setAspectImageSize] = useState<{
    url: string;
    width: number;
    height: number;
  } | null>(null);

  const updateNestedData = (key: string, val: unknown) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, [key]: val } } : n)),
    );
  };

  const threshold = nodeData.threshold ?? 0.9;
  const expansion = nodeData.expansion ?? 0;
  const feather = nodeData.feather ?? 0.6;

  const onRun = async () => {
    const incomingEdges = edges.filter((e) => e.target === id);
    if (incomingEdges.length === 0) {
      return alert("No input connected! Connect an image node to the left side.");
    }

    let media = "";
    let sourceNodeLabel = "";

    for (const edge of incomingEdges) {
      const val = resolvePromptValueFromEdgeSource(edge, nodes);
      if (typeof val === "string" && val) {
        media = val;
        const srcNode = nodes.find((n) => n.id === edge.source);
        sourceNodeLabel = ((srcNode?.data as { label?: string })?.label || srcNode?.id || "") as string;
        break;
      }
    }

    if (!media) {
      return alert(
        "Connected node (" +
          sourceNodeLabel +
          ") has no image data. Try selecting an image in the source node first.",
      );
    }

    setStatus("running");
    const ok = await runAiJobWithNotification({ nodeId: id, label: "Quitar fondo" }, async () => {
      const res = await fetch("/api/spaces/matte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: media,
          expansion,
          feather,
          threshold,
        }),
      });

      const json = await res.json();
      if (json.error) throw new Error(json.error);

      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
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
                  type: "image",
                },
              }
            : n,
        ),
      );
    });
    setStatus(ok ? "success" : "idle");
  };

  useRegisterAssistantNodeRun(id, onRun);

  const sourceEdge =
    edges.find((e) => e.target === id && e.targetHandle === "media") ??
    edges.find((e) => e.target === id);
  const sourceNode = nodes.find((n) => n.id === sourceEdge?.source);
  const resolvedSourceValue = sourceEdge
    ? resolvePromptValueFromEdgeSource(sourceEdge, nodes)
    : undefined;
  const originalPreview =
    (typeof resolvedSourceValue === "string" && resolvedSourceValue
      ? resolvedSourceValue
      : (sourceNode?.data.value as string | undefined)) ?? undefined;
  const aspectImageUrl = originalPreview || nodeData.result_rgba || nodeData.result_mask || null;
  const activeAspectImageSize =
    aspectImageUrl && aspectImageSize?.url === aspectImageUrl ? aspectImageSize : null;
  const aspectContentWidth = activeAspectImageSize?.width ?? null;
  const aspectContentHeight = activeAspectImageSize?.height ?? null;

  useEffect(() => {
    if (!aspectImageUrl) return;
    let cancelled = false;
    loadImageDimensions(aspectImageUrl).then(({ width, height }) => {
      if (!cancelled) setAspectImageSize({ url: aspectImageUrl, width, height });
    });
    return () => {
      cancelled = true;
    };
  }, [aspectImageUrl]);

  const getPreviewImage = () => {
    switch (previewMode) {
      case "original":
        return originalPreview;
      case "mask":
        return nodeData.result_mask ?? originalPreview;
      case "cutout":
        return nodeData.result_rgba ?? originalPreview;
      default:
        return originalPreview;
    }
  };

  const hasPreview = Boolean(getPreviewImage());
  const hasResult = Boolean(nodeData.result_rgba || nodeData.result_mask);
  const hasInput = Boolean(originalPreview);
  const hasDock = hasInput;
  const resolutionLabel =
    aspectContentWidth != null && aspectContentHeight != null
      ? `${aspectContentWidth}×${aspectContentHeight} px`
      : "—";
  const previewModeLabel =
    previewMode === "original" ? "Original" : previewMode === "mask" ? "Mask" : "Cutout";
  const statusLabel =
    status === "running"
      ? "Procesando"
      : hasResult
        ? "Listo"
        : hasInput
          ? "Pendiente"
          : "Sin entrada";

  useLayoutEffect(() => {
    if (aspectContentWidth == null || aspectContentHeight == null) {
      if (hasInput) return;
      const baseFrame = getNodeGridFrameForType("backgroundRemover");
      if (!baseFrame) return;
      const syncKey = "empty";
      if (frameSyncKeyRef.current === syncKey) return;
      frameSyncKeyRef.current = syncKey;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const needsFrameSync = nodeFrameNeedsSync(n, baseFrame);
          const hasAspectRatio =
            typeof (n.data as { _foldderAspectRatio?: unknown })._foldderAspectRatio === "number";
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

    const chromeHeight = hasDock
      ? resolveMaskDockChrome(frameRef.current, previewFrameRef.current, dockRef.current)
      : 0;
    const syncKey = `${aspectImageUrl ?? "empty"}:${aspectContentWidth}x${aspectContentHeight}:chrome${chromeHeight}`;
    if (frameSyncKeyRef.current === syncKey) return;
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
    setNodes((nds) =>
      syncAspectLockedFrameForNode(
        nds as Node[],
        id,
        nextFrame,
        aspectContentWidth / aspectContentHeight,
      ),
    );
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [
    aspectImageUrl,
    aspectContentHeight,
    aspectContentWidth,
    currentFrameNode,
    hasDock,
    hasInput,
    id,
    setNodes,
    updateNodeInternals,
  ]);

  useLayoutEffect(() => {
    if (!hasDock || aspectContentWidth == null || aspectContentHeight == null) return;
    const remeasureId = requestAnimationFrame(() => {
      frameSyncKeyRef.current = null;
      const chromeHeight = resolveMaskDockChrome(
        frameRef.current,
        previewFrameRef.current,
        dockRef.current,
      );
      const syncKey = `${aspectImageUrl ?? "empty"}:${aspectContentWidth}x${aspectContentHeight}:chrome${chromeHeight}`;
      if (frameSyncKeyRef.current === syncKey) return;
      frameSyncKeyRef.current = syncKey;
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
      setNodes((nds) =>
        syncAspectLockedFrameForNode(
          nds as Node[],
          id,
          nextFrame,
          aspectContentWidth / aspectContentHeight,
        ),
      );
      requestAnimationFrame(() => updateNodeInternals(id));
    });
    return () => cancelAnimationFrame(remeasureId);
  }, [
    aspectContentHeight,
    aspectContentWidth,
    aspectImageUrl,
    currentFrameNode,
    hasDock,
    hasResult,
    id,
    previewMode,
    setNodes,
    updateNodeInternals,
  ]);

  return (
    <div
      ref={frameRef}
      className={`custom-node mask-node foldder-node--frameless node--media group/node ${hasPreview ? "mask-node--has-preview" : "mask-node--empty"} ${hasDock ? "mask-node--has-content" : ""} ${status === "running" ? "node-glow-running" : ""}`}
      style={
        {
          minWidth: 200,
          minHeight: hasInput ? 120 : 300,
          "--foldder-node-card-bg": "#a6c85e",
          "--foldder-frameless-glass-bg": "#a6c85e",
          "--foldder-frameless-accent": "#22d3ee",
        } as React.CSSProperties
      }
    >
      <FoldderNodeResizer
        minWidth={200}
        minHeight={120}
        maxWidth={960}
        maxHeight={STUDIO_NODE_MAX_HEIGHT}
        keepAspectRatio={Boolean(aspectImageUrl)}
        isVisible={selected}
      />
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
          state={resolveFoldderNodeState({ loading: status === "running", done: status === "success" })}
          size={16}
        />
        <FoldderNodeHeaderTitle introActive={!!nodeData._foldderCanvasIntro}>
          Remove Background
        </FoldderNodeHeaderTitle>
      </div>

      <div
        className={`node-content foldder-frameless-main mask-node-main${hasDock ? " foldder-node-content-main--with-dock" : ""}`}
      >
        <div ref={previewFrameRef} className="mask-node-preview foldder-node-content-preview-area">
          {!hasPreview ? (
            <img src={MASK_BG_SRC} alt="" className="mask-node-bg" draggable={false} />
          ) : (
            <img
              src={getPreviewImage()}
              draggable={false}
              className={`mask-node-media-preview pointer-events-none absolute inset-0 h-full w-full object-cover ${previewMode === "mask" ? "invert brightness-150" : ""}`}
              alt="Cutout preview"
            />
          )}

          {status === "running" ? (
            <div className="mask-node-loading absolute inset-0 z-[7] flex flex-col items-center justify-center gap-2 bg-black/55 backdrop-blur-sm">
              <Loader2 size={22} className="animate-spin text-cyan-300" />
              <span className="text-[8px] font-black uppercase tracking-[0.25em] text-white/80">
                Processing Alpha
              </span>
            </div>
          ) : null}

          {!hasInput ? (
            <div className="mask-node-empty" aria-label="No image connected">
              <p className="mask-node-empty-hint" aria-hidden>
                Connect image on the left
              </p>
            </div>
          ) : null}
        </div>

        {hasDock ? (
          <div ref={dockRef} className="mask-node-dock-wrap shrink-0">
            <FoldderNodeContentDock>
              <FoldderNodeContentDockMain>
                <div className="mask-node-dock-sliders nodrag">
                  <label className="mask-node-dock-slider">
                    <span className="mask-node-dock-slider-label">
                      Precision <span>{threshold.toFixed(2)}</span>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={threshold}
                      onChange={(e) => updateNestedData("threshold", parseFloat(e.target.value))}
                      className="node-slider nodrag h-1 w-full accent-zinc-800"
                    />
                  </label>
                  <label className="mask-node-dock-slider">
                    <span className="mask-node-dock-slider-label">
                      Expansion <span>{expansion}px</span>
                    </span>
                    <input
                      type="range"
                      min="-10"
                      max="10"
                      step="1"
                      value={expansion}
                      onChange={(e) => updateNestedData("expansion", parseInt(e.target.value, 10))}
                      className="node-slider nodrag h-1 w-full accent-zinc-800"
                    />
                  </label>
                  <label className="mask-node-dock-slider">
                    <span className="mask-node-dock-slider-label">
                      Feather <span>{feather.toFixed(1)}px</span>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={feather}
                      onChange={(e) => updateNestedData("feather", parseFloat(e.target.value))}
                      className="node-slider nodrag h-1 w-full accent-zinc-800"
                    />
                  </label>
                </div>
                <FoldderNodeContentMeta>
                  <FoldderNodeContentMetaRow label="Resolución" value={resolutionLabel} />
                  <FoldderNodeContentMetaRow label="Precisión" value={threshold.toFixed(2)} />
                  <FoldderNodeContentMetaRow label="Expansión" value={`${expansion}px`} />
                  <FoldderNodeContentMetaRow label="Feather" value={`${feather.toFixed(1)}px`} />
                  {hasResult ? (
                    <FoldderNodeContentMetaRow label="Vista" value={previewModeLabel} />
                  ) : null}
                  <FoldderNodeContentMetaRow label="Estado" value={statusLabel} variant="status" />
                </FoldderNodeContentMeta>
              </FoldderNodeContentDockMain>
              <FoldderNodeContentDockActions className="mask-node-dock-actions">
                {hasResult
                  ? (["original", "mask", "cutout"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={`foldder-node-content-dock-btn nodrag${previewMode === mode ? " is-active" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewMode(mode);
                        }}
                        title={mode}
                      >
                        <span>{mode}</span>
                      </button>
                    ))
                  : null}
                <button
                  type="button"
                  className="foldder-node-content-dock-btn nodrag"
                  onClick={() => void onRun()}
                  disabled={status === "running"}
                  title={hasResult ? "Re-process background removal" : "Remove background"}
                >
                  {status === "running" ? (
                    <>
                      <Loader2 size={14} className="animate-spin" aria-hidden />
                      <span>Removing…</span>
                    </>
                  ) : (
                    <>
                      <Zap size={14} aria-hidden />
                      <span>{hasResult ? "Re-process" : "Remove BG"}</span>
                    </>
                  )}
                </button>
              </FoldderNodeContentDockActions>
            </FoldderNodeContentDock>
          </div>
        ) : null}
      </div>

      <div className="handle-wrapper handle-right">
        <span className="handle-label text-pink-400">Cutout</span>
        <FoldderDataHandle type="source" position={Position.Right} id="rgba" dataType="image" />
      </div>
    </div>
  );
});
