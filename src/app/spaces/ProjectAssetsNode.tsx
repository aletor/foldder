"use client";

import React, { memo, useCallback, useMemo } from "react";
import { NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { FileStack, FolderOpen, Images, Sparkles } from "lucide-react";
import { FoldderDataHandle } from "./FoldderDataHandle";
import { NodeLabel } from "./foldder-node-ui";
import { collectFoldderLibrarySections } from "./foldder-library";
import { useProjectAssetsCanvas } from "./project-assets-canvas-context";
import { hasFoldderStudioTouched } from "./studio-node/foldder-studio-touched";
import { FoldderStudioTouchedMark } from "./studio-node/foldder-studio-touched-mark";

export type ProjectAssetsNodeData = {
  label?: string;
};

const PROJECT_ASSETS_COLOR = "#965B92";
const PROJECT_ASSETS_EMPTY_LOGO_SRC = "/logo-folder.png";

function latestProjectAssetsPreviewUrl(
  sections: ReturnType<typeof collectFoldderLibrarySections>,
): string | null {
  const images = [...sections.importedMedia, ...sections.generatedMedia].filter(
    (item) => item.kind === "image",
  );
  return images.at(-1)?.url ?? null;
}

export const ProjectAssetsNode = memo(({ id, data, selected }: NodeProps) => {
  const nodeData = data as ProjectAssetsNodeData;
  const ctx = useProjectAssetsCanvas();

  const { nImported, nGenerated, nFiles, nExports, previewUrl } = useMemo(() => {
    if (ctx?.librarySummary) {
      const sections = collectFoldderLibrarySections({
        nodes: ctx?.flowNodes ?? [],
        assetsMetadata: ctx?.assetsMetadata,
        projectScopeId: ctx?.projectScopeId ?? "__local__",
        projectFiles: ctx?.projectFiles,
        generatedTextAssets: ctx?.generatedTextAssets,
      });
      return {
        ...ctx.librarySummary,
        previewUrl: latestProjectAssetsPreviewUrl(sections),
      };
    }
    const list = ctx?.flowNodes ?? [];
    const sections = collectFoldderLibrarySections({
      nodes: list,
      assetsMetadata: ctx?.assetsMetadata,
      projectScopeId: ctx?.projectScopeId ?? "__local__",
      projectFiles: ctx?.projectFiles,
      generatedTextAssets: ctx?.generatedTextAssets,
    });
    return {
      nImported: sections.importedMedia.length,
      nGenerated: sections.generatedMedia.length + sections.generatedTexts.length,
      nFiles: sections.mediaFiles.length,
      nExports: sections.exports.length,
      previewUrl: latestProjectAssetsPreviewUrl(sections),
    };
  }, [
    ctx?.assetsMetadata,
    ctx?.flowNodes,
    ctx?.generatedTextAssets,
    ctx?.librarySummary,
    ctx?.projectFiles,
    ctx?.projectScopeId,
  ]);

  const openLibrary = useCallback(() => {
    if (ctx?.openProjectAssets) {
      ctx.openProjectAssets();
      return;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("foldder-open-project-assets"));
    }
  }, [ctx]);

  const introActive = !!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro;
  const hasPreview = Boolean(previewUrl);
  const headerTitle =
    nodeData.label?.trim() && !/\.(jpg|jpeg|png|webp|mp4)$/i.test(nodeData.label.trim())
      ? nodeData.label.trim()
      : "Foldder";
  const totalMedia = nImported + nGenerated + nFiles;

  return (
    <div
      className={`custom-node tool-node foldder-studio-node foldder-studio-node--projectAssets project-assets-node foldder-node--frameless node--media group/node relative ${
        hasPreview ? "project-assets-node--has-preview" : "project-assets-node--empty"
      } ${selected ? "ring-2 ring-violet-400/45" : ""} ${introActive ? "ring-2 ring-cyan-300/60" : ""}`}
      style={{
        minWidth: 200,
        minHeight: 280,
        padding: 0,
        overflow: "visible",
        "--foldder-node-card-bg": PROJECT_ASSETS_COLOR,
        "--foldder-frameless-accent": "#ffffff",
        "--foldder-node-header-tint-color": PROJECT_ASSETS_COLOR,
        "--foldder-node-output-color": PROJECT_ASSETS_COLOR,
      } as React.CSSProperties}
    >
      <NodeResizer minWidth={200} minHeight={280} maxWidth={960} maxHeight={2200} isVisible={selected} />
      {hasFoldderStudioTouched(nodeData as Record<string, unknown>) ? (
        <FoldderStudioTouchedMark nodeType="projectAssets" />
      ) : null}
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Foldder" />

      <div className="node-content project-assets-node-content relative min-h-0 flex-1 overflow-hidden">
        {hasPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl!}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="project-assets-empty-background absolute inset-0 overflow-hidden" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={PROJECT_ASSETS_EMPTY_LOGO_SRC}
              alt=""
              className="h-full w-full object-contain object-bottom"
              draggable={false}
            />
          </div>
        )}

        <div className="project-assets-node-scrim pointer-events-none absolute inset-0 z-[2]" aria-hidden />

        <span className="project-assets-node-media-tag absolute left-3 top-[42px] z-[8] max-w-[calc(100%-24px)] truncate">
          {hasPreview ? `${totalMedia} medios` : "LIBRARY"}
        </span>

        <div className="project-assets-node-footer absolute inset-x-0 bottom-0 z-[8] px-3 pb-3 pt-10">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold leading-tight tracking-[-0.02em]">
                {headerTitle}
              </p>
              <div className="project-assets-node-stats mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="project-assets-node-stat-pill inline-flex items-center gap-1">
                  <Images className="h-3 w-3 shrink-0 opacity-70" strokeWidth={2} aria-hidden />
                  {nImported === 1 ? "1 importado" : `${nImported} importados`}
                </span>
                <span className="project-assets-node-stat-pill inline-flex items-center gap-1">
                  <Sparkles className="h-3 w-3 shrink-0 opacity-70" strokeWidth={2} aria-hidden />
                  {nGenerated === 1 ? "1 generado" : `${nGenerated} generados`}
                </span>
                <span className="project-assets-node-stat-pill inline-flex items-center gap-1">
                  <FileStack className="h-3 w-3 shrink-0 opacity-70" strokeWidth={2} aria-hidden />
                  {nFiles === 1 ? "1 media file" : `${nFiles} media files`}
                </span>
                <span className="project-assets-node-stat-pill inline-flex items-center gap-1">
                  <FolderOpen className="h-3 w-3 shrink-0 opacity-70" strokeWidth={2} aria-hidden />
                  {nExports === 1 ? "1 export" : `${nExports} exports`}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openLibrary();
              }}
              className="project-assets-open-button foldder-node-footer-button nodrag inline-flex shrink-0 items-center gap-1.5 rounded-none border-0 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-black shadow-none transition hover:bg-[#f7f7f4]"
            >
              <FolderOpen className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
              Abrir Foldder
            </button>
          </div>
        </div>
      </div>

      <div className="handle-wrapper handle-right" style={{ top: "50%" }}>
        <span className="handle-label">Prompt out</span>
        <FoldderDataHandle type="source" position={Position.Right} id="prompt" dataType="prompt" />
      </div>
    </div>
  );
});

ProjectAssetsNode.displayName = "ProjectAssetsNode";
