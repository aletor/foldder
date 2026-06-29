"use client";

/* eslint-disable @next/next/no-img-element */

import React, { memo, useCallback, useState } from "react";
import { Maximize2, SunMedium } from "lucide-react";
import { NodeProps, NodeResizer, Position, useReactFlow } from "@xyflow/react";
import { FoldderDataHandle } from "../FoldderDataHandle";
import { NodeIcon, resolveFoldderNodeState } from "../foldder-icons";
import { FoldderNodeHeaderTitle, NodeLabel } from "../foldder-node-ui";
import { hasFoldderStudioTouched, touchStudioNodeData } from "../studio-node/foldder-studio-touched";
import { FoldderStudioTouchedMark } from "../studio-node/foldder-studio-touched-mark";
import type { LightroomNodeData } from "./lightroom-types";
import { developDocumentFromNode, isDevelopDocumentDefault } from "./lightroom-types";
import { LightroomStudio } from "./LightroomStudio";
import "../spaces.css";

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

export const LightroomNode = memo(function LightroomNode({ id, data, selected }: NodeProps) {
  const nodeData = (data ?? {}) as LightroomNodeData;
  const { setNodes } = useReactFlow();
  const [studioOpen, setStudioOpen] = useState(false);

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
  const hasOutput = Boolean(preview?.trim());
  const status = nodeData.decodeStatus;
  const error = status === "error";

  return (
    <div
      className={`custom-node lightroom-node foldder-node--frameless node--media${error ? " foldder-node--error" : ""}`}
      style={{ minWidth: 200, minHeight: 140 }}
    >
      <NodeResizer minWidth={200} minHeight={140} maxWidth={520} maxHeight={720} isVisible={selected} />
      {hasFoldderStudioTouched(nodeData as Record<string, unknown>) ? (
        <FoldderStudioTouchedMark nodeType="lightroom" />
      ) : null}
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Lightroom" />

      <div className="node-header">
        <NodeIcon
          type="lightroom"
          selected={selected}
          state={resolveFoldderNodeState({
            selected,
            error,
            done: hasOutput || status === "ready",
          })}
          size={16}
        />
        <FoldderNodeHeaderTitle>Lightroom</FoldderNodeHeaderTitle>
        <div className="node-badge max-w-[120px] truncate">{statusLabel(nodeData)}</div>
      </div>

      <div className="node-content foldder-frameless-main space-y-2">
        <div className="relative aspect-[4/3] overflow-hidden rounded-none bg-slate-950/80">
          {preview ? (
            <img src={preview} alt="" className="h-full w-full object-contain" decoding="async" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-500">
              <SunMedium size={28} strokeWidth={1.5} />
              <span className="text-[8px] font-black uppercase tracking-[0.14em]">RAW local</span>
            </div>
          )}
        </div>
        <p className="foldder-frameless-chip min-h-[24px] text-[9px] leading-snug text-zinc-500">
          {nodeData.decodeError ||
            (nodeData.source
              ? `${nodeData.source.fileName} · ${nodeData.source.extension.toUpperCase()}`
              : "Abre un RAW desde tu disco (File System Access).")}
        </p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setStudioOpen(true);
          }}
          className="foldder-frameless-action nodrag flex w-full items-center justify-center gap-2 rounded-none bg-white/[0.07] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-100 transition hover:bg-white/[0.12]"
        >
          <Maximize2 size={13} />
          Open Studio
        </button>
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
