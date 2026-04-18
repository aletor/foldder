"use client";

import React, { memo, useCallback } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { ExternalLink, FileText, Palette } from "lucide-react";
import { FoldderDataHandle } from "./FoldderDataHandle";
import { NodeIcon } from "./foldder-icons";
import { NodeLabel, FoldderNodeHeaderTitle } from "./foldder-node-ui";
import { normalizeProjectAssets } from "./project-assets-metadata";
import { useProjectBrainCanvas } from "./project-brain-canvas-context";

export type ProjectBrainNodeData = {
  label?: string;
};

export const ProjectBrainNode = memo(({ id, data, selected }: NodeProps<any>) => {
  const nodeData = data as ProjectBrainNodeData;
  const ctx = useProjectBrainCanvas();
  const assets = normalizeProjectAssets(ctx?.assetsMetadata);

  const pdfCount = assets.knowledge.documents.filter(
    (d) => d.mime === "application/pdf",
  ).length;
  const otherDocCount = assets.knowledge.documents.length - pdfCount;
  const linkCount = assets.knowledge.urls.length;
  const hasLogos = Boolean(assets.brand.logoPositive || assets.brand.logoNegative);

  const openStudio = useCallback(() => {
    if (ctx?.openProjectBrain) {
      ctx.openProjectBrain();
      return;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("foldder-open-project-brain"));
    }
  }, [ctx]);

  return (
    <div className="custom-node tool-node" style={{ minWidth: 260 }}>
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Brain" />

      <div className="node-header">
        <NodeIcon type="projectBrain" selected={selected} size={16} />
        <FoldderNodeHeaderTitle introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}>
          BRAIN
        </FoldderNodeHeaderTitle>
        <div className="node-badge">PROJECT</div>
      </div>

      <div className="node-content flex min-w-0 flex-col gap-3 px-3 pb-3 pt-2">
        <div className="min-w-0">
          <span className="node-label">Conocimiento</span>
          <div className="space-y-2 rounded-xl border border-slate-200/60 bg-slate-50/50 p-3 shadow-inner">
            <div className="flex items-start gap-2 text-[11px] leading-snug text-slate-800">
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
              <span>
                {pdfCount === 1 ? "1 PDF" : `${pdfCount} PDFs`}
                {otherDocCount > 0
                  ? ` · ${otherDocCount === 1 ? "1 otro doc." : `${otherDocCount} otros docs.`}`
                  : ""}
              </span>
            </div>
            <div className="flex items-start gap-2 text-[11px] leading-snug text-slate-800">
              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
              <span>{linkCount === 1 ? "1 enlace" : `${linkCount} enlaces`}</span>
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <span className="node-label">Marca</span>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/50 px-3 py-2 text-[11px] text-slate-700 shadow-inner">
            <Palette className="h-3.5 w-3.5 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
            <span>{hasLogos ? "Logos + colores" : "Solo colores"}</span>
          </div>
        </div>

        <p className="m-0 text-[9px] font-medium uppercase tracking-wide text-slate-500">
          Salida prompt (reservado; sin contenido aún)
        </p>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openStudio();
          }}
          className="nodrag w-full rounded-xl border border-slate-300/80 bg-white/90 px-3 py-2.5 text-center text-[11px] font-bold uppercase tracking-wide text-slate-800 shadow-sm transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
        >
          Abrir studio mode
        </button>
      </div>

      <div className="handle-wrapper handle-right" style={{ top: "50%" }}>
        <span className="handle-label">Prompt out</span>
        <FoldderDataHandle type="source" position={Position.Right} id="prompt" dataType="prompt" />
      </div>
    </div>
  );
});

ProjectBrainNode.displayName = "ProjectBrainNode";
