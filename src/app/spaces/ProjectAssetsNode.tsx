"use client";

import React, { memo, useCallback, useMemo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { FolderOpen, Images, Sparkles } from "lucide-react";
import { FoldderDataHandle } from "./FoldderDataHandle";
import { NodeIcon } from "./foldder-icons";
import { NodeLabel, FoldderNodeHeaderTitle } from "./foldder-node-ui";
import { collectProjectMedia } from "./project-media-inventory";
import { useProjectAssetsCanvas } from "./project-assets-canvas-context";
import { listAllBrainGeneratedSuggestionUrls } from "./brain-image-suggestions-cache";

export type ProjectAssetsNodeData = {
  label?: string;
};

export const ProjectAssetsNode = memo(({ id, data, selected }: NodeProps) => {
  const nodeData = data as ProjectAssetsNodeData;
  const ctx = useProjectAssetsCanvas();

  const { nImported, nGenerated } = useMemo(() => {
    const list = ctx?.flowNodes ?? [];
    const { imported, generated } = collectProjectMedia(list);
    const extraBrain = listAllBrainGeneratedSuggestionUrls(ctx?.projectScopeId).length;
    return { nImported: imported.length, nGenerated: generated.length + extraBrain };
  }, [ctx?.flowNodes, ctx?.projectScopeId]);

  const openLibrary = useCallback(() => {
    if (ctx?.openProjectAssets) {
      ctx.openProjectAssets();
      return;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("foldder-open-project-assets"));
    }
  }, [ctx]);

  return (
    <div className="custom-node tool-node" style={{ minWidth: 260 }}>
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Foldder" />

      <div className="node-header">
        <NodeIcon type="projectAssets" selected={selected} size={16} />
        <FoldderNodeHeaderTitle introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}>
          FOLDDER
        </FoldderNodeHeaderTitle>
        <div className="node-badge">LIBRARY</div>
      </div>

      <div className="node-content flex min-w-0 flex-col gap-3 px-3 pb-3 pt-2">
        <div className="min-w-0">
          <span className="node-label">Medios en el grafo</span>
          <div className="space-y-2 rounded-xl border border-slate-200/60 bg-slate-50/50 p-3 shadow-inner">
            <div className="flex items-start gap-2 text-[11px] leading-snug text-slate-800">
              <Images className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
              <span>
                {nImported === 1 ? "1 importado" : `${nImported} importados`}
              </span>
            </div>
            <div className="flex items-start gap-2 text-[11px] leading-snug text-slate-800">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
              <span>
                {nGenerated === 1 ? "1 generado" : `${nGenerated} generados`}
              </span>
            </div>
          </div>
        </div>

        <p className="m-0 text-[9px] font-medium uppercase tracking-wide text-slate-500">
          Vista previa de marca en el panel (desde Brain)
        </p>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openLibrary();
          }}
          className="nodrag flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300/80 bg-white/90 px-3 py-2.5 text-center text-[11px] font-bold uppercase tracking-wide text-slate-800 shadow-sm transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
        >
          <FolderOpen className="h-4 w-4 shrink-0 text-slate-600" strokeWidth={2} aria-hidden />
          Abrir biblioteca
        </button>
      </div>

      <div className="handle-wrapper handle-right" style={{ top: "50%" }}>
        <span className="handle-label">Prompt out</span>
        <FoldderDataHandle type="source" position={Position.Right} id="prompt" dataType="prompt" />
      </div>
    </div>
  );
});

ProjectAssetsNode.displayName = "ProjectAssetsNode";
