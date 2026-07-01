"use client";

/* eslint-disable @next/next/no-img-element */

import React, { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NodeProps, NodeResizer, Position, useNodes, useReactFlow, useUpdateNodeInternals, type Node } from "@xyflow/react";
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
  FoldderStudioModeCenterButton,
  NodeLabel,
} from "../foldder-node-ui";
import {
  nodeFrameNeedsSync,
  resolveAspectLockedNodeFrame,
  resolveNodeChromeHeight,
} from "../studio-node-aspect";
import { hasFoldderStudioTouched } from "../studio-node/foldder-studio-touched";
import { FoldderStudioTouchedMark } from "../studio-node/foldder-studio-touched-mark";
import type { LightroomNodeData } from "./lightroom-types";
import { developDocumentFromNode, isDevelopDocumentDefault } from "./lightroom-types";
import { LightroomStudio } from "./LightroomStudio";
import "../spaces.css";

const LIGHTROOM_ACCENT = "#666699";
const LIGHTROOM_BG_SRC = "/assets/nodes/lightroom-bg.png";
const LIGHTROOM_TOUCHED_MARK_SRC = "/assets/nodes/lightroom-bg.png";
const LIGHTROOM_DOCK_MIN_CHROME = 104;
const STUDIO_NODE_MAX_HEIGHT = 2200;

function resolveLightroomDockChrome(
  frameEl: HTMLElement | null,
  previewEl: HTMLElement | null,
  dockEl: HTMLElement | null,
): number {
  const measuredDock = dockEl?.offsetHeight ?? 0;
  const measuredChrome = resolveNodeChromeHeight(frameEl, previewEl, LIGHTROOM_DOCK_MIN_CHROME);
  return Math.max(LIGHTROOM_DOCK_MIN_CHROME, measuredDock, measuredChrome);
}

function syncAspectLockedFrameForNode(
  nodes: Node[],
  nodeId: string,
  nextFrame: { width: number; height: number },
  aspectRatio?: number,
): Node[] {
  let didSync = false;
  const safeAspectRatio =
    typeof aspectRatio === "number" && Number.isFinite(aspectRatio) && aspectRatio > 0
      ? aspectRatio
      : null;
  const nextNodes = nodes.map((node) => {
    if (node.id !== nodeId) return node;
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

function statusLabel(data: LightroomNodeData): string {
  if (!data.source) return "Sin archivo";
  if (data.decodeStatus === "decoding") return "Decodificando…";
  if (data.decodeStatus === "needs_relink") return "Re-vincular";
  if (data.decodeStatus === "error") return "Error";
  if (data.decodeStatus === "ready") {
    const doc = developDocumentFromNode(data.developSettings, data.maskLayers);
    const edited = data.edited ?? !isDevelopDocumentDefault(doc);
    return edited ? "Editado" : "Revelado";
  }
  return data.source.fileName;
}

function useCurrentNodeFrameSnapshot(node: Node | undefined) {
  const width = node?.width;
  const height = node?.height;
  const measuredWidth = node?.measured?.width;
  const measuredHeight = node?.measured?.height;
  const styleWidth = node?.style?.width;
  const styleHeight = node?.style?.height;

  return useMemo(() => {
    if (!node) return undefined;
    return {
      width: node.width,
      height: node.height,
      measured: node.measured
        ? { width: node.measured.width, height: node.measured.height }
        : undefined,
      style: node.style ? { width: node.style.width, height: node.style.height } : undefined,
    };
  }, [node, width, height, measuredWidth, measuredHeight, styleWidth, styleHeight]);
}

export const LightroomNode = memo(function LightroomNode({ id, data, selected }: NodeProps) {
  const nodeData = (data ?? {}) as LightroomNodeData;
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const nodes = useNodes();
  const currentNode = nodes.find((node) => node.id === id);
  const currentFrameNode = useCurrentNodeFrameSnapshot(currentNode);

  const [studioOpen, setStudioOpen] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const frameSyncKeyRef = useRef<string | null>(null);

  const patchData = useCallback(
    (patch: Partial<LightroomNodeData>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          return { ...n, data: { ...n.data, ...patch } };
        }),
      );
    },
    [id, setNodes],
  );

  const preview = nodeData.previewDataUrl ?? nodeData.value;
  const hasPreview = Boolean(preview?.trim());
  const hasSource = Boolean(nodeData.source);
  const hasDock = hasSource || hasPreview || nodeData.decodeStatus === "decoding";
  const status = nodeData.decodeStatus;
  const error = status === "error";
  const studioTouched = hasFoldderStudioTouched(nodeData as Record<string, unknown>);
  const showTileMark = studioTouched || hasDock;

  const fileLabel = nodeData.source
    ? `${nodeData.source.fileName} · ${nodeData.source.extension.toUpperCase()}`
    : "—";
  const resolutionLabel =
    nodeData.width && nodeData.height ? `${nodeData.width}×${nodeData.height}` : "—";
  const cameraLabel =
    nodeData.cameraMake || nodeData.cameraModel
      ? [nodeData.cameraMake, nodeData.cameraModel].filter(Boolean).join(" ")
      : "—";
  const isoLabel = nodeData.iso ? `ISO ${nodeData.iso}` : "—";
  const editedLabel = statusLabel(nodeData);

  useLayoutEffect(() => {
    const baseFrame = getNodeGridFrameForType("lightroom");
    if (!baseFrame || hasDock) return;
    const syncKey = "lightroom-base";
    if (frameSyncKeyRef.current === syncKey) return;
    const current = nodes.find((n) => n.id === id);
    if (current && !nodeFrameNeedsSync(current, baseFrame)) {
      frameSyncKeyRef.current = syncKey;
      return;
    }
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
          style: { ...(n.style as React.CSSProperties), width: baseFrame.width, height: baseFrame.height },
        };
      }),
    );
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [hasDock, id, nodes, setNodes, updateNodeInternals]);

  useLayoutEffect(() => {
    if (!hasPreview || !nodeData.width || !nodeData.height) return;
    const remeasureId = requestAnimationFrame(() => {
      const chromeHeight = resolveLightroomDockChrome(
        frameRef.current,
        previewRef.current,
        dockRef.current,
      );
      const syncKey = `${nodeData.width}x${nodeData.height}:chrome${chromeHeight}`;
      if (frameSyncKeyRef.current === syncKey) return;
      const contentWidth = nodeData.width!;
      const contentHeight = nodeData.height!;
      const nextFrame = resolveAspectLockedNodeFrame({
        node: currentFrameNode,
        contentWidth,
        contentHeight,
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
          nodeData.width! / nodeData.height!,
        ),
      );
      requestAnimationFrame(() => updateNodeInternals(id));
    });
    return () => cancelAnimationFrame(remeasureId);
  }, [
    currentFrameNode,
    hasPreview,
    id,
    nodeData.height,
    nodeData.width,
    setNodes,
    updateNodeInternals,
  ]);

  const openStudio = useCallback(() => setStudioOpen(true), []);

  return (
    <div
      ref={frameRef}
      className={`custom-node lightroom-node foldder-node--frameless group/node ${hasPreview ? "node--media lightroom-node--has-preview" : "node--glass lightroom-node--empty foldder-frameless-label-dark"}${hasDock ? " lightroom-node--has-content" : ""}${error ? " foldder-node--error" : ""}${showTileMark ? " foldder-node--studio-touched" : ""}`}
      style={
        {
          minWidth: 200,
          minHeight: hasPreview ? 120 : 300,
          "--foldder-node-card-bg": LIGHTROOM_ACCENT,
          "--foldder-frameless-glass-bg": LIGHTROOM_ACCENT,
          "--foldder-frameless-accent": LIGHTROOM_ACCENT,
        } as React.CSSProperties
      }
    >
      <NodeResizer
        minWidth={200}
        minHeight={120}
        maxWidth={960}
        maxHeight={STUDIO_NODE_MAX_HEIGHT}
        keepAspectRatio={hasPreview && Boolean(nodeData.width && nodeData.height)}
        isVisible={selected}
      />
      {showTileMark ? (
        <FoldderStudioTouchedMark nodeType="lightroom" backgroundSrc={LIGHTROOM_TOUCHED_MARK_SRC} />
      ) : null}
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Lightroom" />

      <div className="node-header">
        <NodeIcon
          type="lightroom"
          selected={selected}
          state={resolveFoldderNodeState({
            selected,
            error,
            done: hasPreview || status === "ready",
          })}
          size={16}
        />
        <FoldderNodeHeaderTitle className="sr-only">Lightroom</FoldderNodeHeaderTitle>
      </div>

      <div
        className={`node-content foldder-frameless-main lightroom-node-main${hasDock ? " foldder-node-content-main--with-dock" : ""}`}
      >
        <div ref={previewRef} className="lightroom-node-preview-area foldder-node-content-preview-area">
          {!hasPreview ? (
            <>
              <img src={LIGHTROOM_BG_SRC} alt="" className="lightroom-node-bg" draggable={false} />
              {!hasDock ? (
                <div className="lightroom-node-empty-hint" aria-hidden>
                  Abre Studio para cargar un RAW desde tu disco.
                </div>
              ) : null}
            </>
          ) : (
            <div className="lightroom-node-media-preview">
              <img src={preview} alt="" className="lightroom-node-preview-img" decoding="async" draggable={false} />
            </div>
          )}

          {!hasDock ? (
            <FoldderStudioModeCenterButton label="Open Studio" title="Open Studio" onClick={openStudio} />
          ) : null}
        </div>

        {hasDock ? (
          <div ref={dockRef} className="lightroom-node-dock-wrap shrink-0">
            <FoldderNodeContentDock>
              <FoldderNodeContentDockMain>
                {nodeData.decodeError ? (
                  <p className="foldder-node-content-dock-text foldder-node-content-dock-text--placeholder">
                    {nodeData.decodeError}
                  </p>
                ) : nodeData.source ? (
                  <p className="foldder-node-content-dock-text">{fileLabel}</p>
                ) : (
                  <p className="foldder-node-content-dock-text foldder-node-content-dock-text--placeholder">
                    RAW local · File System Access
                  </p>
                )}
                <FoldderNodeContentMeta>
                  <FoldderNodeContentMetaRow label="Archivo" value={fileLabel} />
                  <FoldderNodeContentMetaRow label="Resolución" value={resolutionLabel} />
                  <FoldderNodeContentMetaRow label="Cámara" value={cameraLabel} />
                  <FoldderNodeContentMetaRow label="ISO" value={isoLabel} />
                  <FoldderNodeContentMetaRow label="Estado" value={editedLabel} variant="status" />
                </FoldderNodeContentMeta>
              </FoldderNodeContentDockMain>
              <FoldderNodeContentDockActions className="lightroom-node-dock-actions">
                <FoldderStudioModeCenterButton
                  variant="dock"
                  label="Open Studio"
                  title="Abrir Lightroom Studio"
                  onClick={openStudio}
                />
              </FoldderNodeContentDockActions>
            </FoldderNodeContentDock>
          </div>
        ) : null}
      </div>

      <div className="handle-wrapper handle-right" style={{ top: "50%" }}>
        <span className="handle-label text-pink-400">Image</span>
        <FoldderDataHandle type="source" position={Position.Right} id="image" dataType="image" />
      </div>

      {studioOpen ? (
        <LightroomStudio
          nodeId={id}
          data={nodeData}
          onClose={() => setStudioOpen(false)}
          onPatch={(patch) => patchData(patch)}
        />
      ) : null}
    </div>
  );
});
