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
import { FoldderDataHandle } from "../FoldderDataHandle";
import { NodeIcon, resolveFoldderNodeState } from "../foldder-icons";
import { FoldderNodeHeaderTitle, NodeLabel } from "../foldder-node-ui";
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
  const previewRef = useRef<HTMLDivElement | null>(null);
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
          expansion: nodeData.expansion ?? 0,
          feather: nodeData.feather ?? 0.6,
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
    id,
    setNodes,
    updateNodeInternals,
  ]);

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

  return (
    <div
      ref={frameRef}
      className={`custom-node mask-node foldder-node--frameless node--media group/node ${hasPreview ? "mask-node--has-preview" : "mask-node--empty"} ${status === "running" ? "node-glow-running" : ""}`}
      style={
        {
          minWidth: 200,
          minHeight: 120,
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

      <div ref={previewRef} className="node-content foldder-frameless-main">
        {hasPreview ? (
          <img
            src={getPreviewImage()}
            draggable={false}
            className={`pointer-events-none absolute inset-0 h-full w-full object-contain ${previewMode === "mask" ? "invert brightness-150" : ""}`}
            alt="Cutout preview"
          />
        ) : null}

        {status === "running" && (
          <div className="absolute inset-0 z-[7] flex flex-col items-center justify-center gap-2 bg-black/55 backdrop-blur-sm">
            <Loader2 size={22} className="animate-spin text-cyan-300" />
            <span className="text-[8px] font-black uppercase tracking-[0.25em] text-white/80">
              Processing Alpha
            </span>
          </div>
        )}

        {hasInput && (
          <div className="foldder-frameless-secondary-panel nodrag flex w-[150px] flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="flex items-center justify-between text-[7px] font-black uppercase tracking-[0.12em] text-white/55">
                Precision{" "}
                <span className="font-mono text-white/85">{threshold.toFixed(2)}</span>
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={threshold}
                onChange={(e) => updateNestedData("threshold", parseFloat(e.target.value))}
                className="node-slider nodrag h-1 w-full accent-cyan-400"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="flex items-center justify-between text-[7px] font-black uppercase tracking-[0.12em] text-white/55">
                Expansion{" "}
                <span className="font-mono text-white/85">{nodeData.expansion ?? 0}px</span>
              </span>
              <input
                type="range"
                min="-10"
                max="10"
                step="1"
                value={nodeData.expansion ?? 0}
                onChange={(e) => updateNestedData("expansion", parseInt(e.target.value, 10))}
                className="node-slider nodrag h-1 w-full accent-cyan-400"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="flex items-center justify-between text-[7px] font-black uppercase tracking-[0.12em] text-white/55">
                Feather{" "}
                <span className="font-mono text-white/85">{(nodeData.feather ?? 0.6).toFixed(1)}px</span>
              </span>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={nodeData.feather ?? 0.6}
                onChange={(e) => updateNestedData("feather", parseFloat(e.target.value))}
                className="node-slider nodrag h-1 w-full accent-pink-400"
              />
            </label>
          </div>
        )}

        <button onClick={onRun} disabled={status === "running"} className="execute-btn nodrag">
          {status === "running" ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
          <span>{status === "running" ? "Removing…" : "Remove BG"}</span>
        </button>
      </div>

      {hasResult && (
        <div
          className="nodrag nopan flex gap-1"
          style={{ position: "absolute", top: 8, right: 8, zIndex: 60, pointerEvents: "auto" }}
        >
          {(["original", "mask", "cutout"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPreviewMode(mode);
              }}
              style={{ pointerEvents: "auto", cursor: "pointer" }}
              className={`nodrag px-2 py-1 text-[7px] font-black uppercase tracking-[0.15em] transition-colors ${previewMode === mode ? "bg-white text-black" : "bg-black/45 text-white/55 hover:text-white"}`}
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
