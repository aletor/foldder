"use client";

import React, { memo, useCallback, useMemo } from "react";
import { NodeProps, useEdges, useNodes, useReactFlow } from "@xyflow/react";
import { Film } from "lucide-react";
import { CineStudio } from "../CineStudio";
import {
  CINE_MODE_LABELS,
  CINE_STATUS_LABELS,
  normalizeCineData,
  type CineNodeData,
} from "../cine-types";
import {
  StudioCanvasNodeShell,
  StudioCanvasOpenButton,
  StudioCanvasPill,
  type StudioCanvasNodeHandleSpec,
} from "../studio-node/studio-canvas-node";
import { useStudioNodeController } from "../studio-node/studio-node-architecture";
import { textFromStudioSourceNode } from "../studio-node/source-node-text";

const CINE_NODE_HANDLES: StudioCanvasNodeHandleSpec[] = [
  { side: "left", top: "30%", type: "target", id: "prompt", dataType: "prompt", label: "Guion" },
  { side: "left", top: "54%", type: "target", id: "text", dataType: "txt", label: "Text" },
  { side: "left", top: "78%", type: "target", id: "brain", dataType: "brain", label: "Brain" },
  { side: "right", top: "40%", type: "source", id: "storyboard", dataType: "generic", label: "Storyboard" },
  { side: "right", top: "68%", type: "source", id: "videoScenes", dataType: "generic", label: "Video plan" },
];

export const CineNode = memo(function CineNode({ id, data, selected }: NodeProps) {
  const nodeData = normalizeCineData(data);
  const { setNodes } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const { isStudioOpen, openStudio, closeStudio } = useStudioNodeController({
    nodeId: id,
    nodeType: "cine",
  });

  const incomingEdges = useMemo(() => edges.filter((edge) => edge.target === id), [edges, id]);
  const sourceScriptEdge = useMemo(
    () => incomingEdges.find((edge) => edge.targetHandle === "script" || edge.targetHandle === "prompt" || edge.targetHandle === "text"),
    [incomingEdges],
  );
  const brainEdge = useMemo(
    () => incomingEdges.find((edge) => edge.targetHandle === "brain" || nodes.find((node) => node.id === edge.source)?.type === "projectBrain"),
    [incomingEdges, nodes],
  );
  const sourceScriptNode = useMemo(
    () => nodes.find((node) => node.id === sourceScriptEdge?.source),
    [nodes, sourceScriptEdge?.source],
  );
  const sourceScriptText = useMemo(() => textFromStudioSourceNode(sourceScriptNode), [sourceScriptNode]);
  const brainConnected = Boolean(brainEdge);
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
      setNodes((nds) =>
        nds.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...next,
                  value: next.value || JSON.stringify({ scenes: next.scenes.length, framesPrepared }),
                },
              }
            : node,
        ),
      );
    },
    [framesPrepared, id, setNodes],
  );

  const statusLabel = CINE_STATUS_LABELS[nodeData.status];
  const modeLabel = CINE_MODE_LABELS[nodeData.mode];

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
      minWidth={292}
      width={292}
      handles={CINE_NODE_HANDLES}
    >
      <div className="node-content flex flex-col gap-3 px-3 pb-3 pt-2">
        <div className="rounded-2xl border border-slate-200/60 bg-slate-50/60 p-3 shadow-inner">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="node-label">Mesa de dirección</span>
              <h3 className="mt-1 text-[18px] font-semibold leading-tight tracking-[-0.035em] text-slate-950">
                {statusLabel}
              </h3>
              <p className="mt-1 line-clamp-2 text-[11px] font-light leading-relaxed text-slate-600">
                {nodeData.detected?.logline || sourceScriptText || "Convierte guion en escenas, reparto, fondos y frames."}
              </p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-900 text-cyan-100 shadow-sm">
              <Film className="h-5 w-5" strokeWidth={1.8} />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <span className="rounded-xl border border-slate-200/70 bg-white/80 px-2 py-1.5 text-[10px] font-semibold text-slate-700">
              {nodeData.scenes.length} escenas
            </span>
            <span className="rounded-xl border border-slate-200/70 bg-white/80 px-2 py-1.5 text-[10px] font-semibold text-slate-700">
              {nodeData.characters.length} personajes
            </span>
            <span className="rounded-xl border border-slate-200/70 bg-white/80 px-2 py-1.5 text-[10px] font-semibold text-slate-700">
              {nodeData.backgrounds.length} fondos
            </span>
            <span className="rounded-xl border border-slate-200/70 bg-white/80 px-2 py-1.5 text-[10px] font-semibold text-slate-700">
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

        <StudioCanvasOpenButton onClick={openStudio} accent="cyan" icon={<Film className="h-4 w-4" strokeWidth={2} />}>
          Abrir Cine
        </StudioCanvasOpenButton>
      </div>

      {isStudioOpen ? (
        <CineStudio
          nodeId={id}
          data={nodeData}
          onChange={patchData}
          onClose={() => closeStudio()}
          brainConnected={brainConnected}
          sourceScriptText={sourceScriptText}
          sourceScriptNodeId={sourceScriptNode?.id}
        />
      ) : null}
    </StudioCanvasNodeShell>
  );
});
