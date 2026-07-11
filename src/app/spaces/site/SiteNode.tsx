"use client";

import React, { memo, useCallback, useMemo } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import {
  computeSiteNodeStatus,
  createEmptySiteProject,
  isSiteProjectEmpty,
  normalizeSiteNodeData,
} from "@/lib/site/site-defaults";
import { getActiveSitePage } from "@/lib/site/site-project";
import type { SiteNodeData } from "@/lib/site/site-types";
import {
  FoldderNodeContentDock,
  FoldderNodeContentDockMain,
  FoldderNodeContentMeta,
  FoldderNodeContentMetaRow,
  FoldderStudioModeCenterButton,
} from "../foldder-node-ui";
import { resolveFoldderNodeStudioBackground } from "../studio-node/foldder-studio-node-backgrounds";
import { StudioCanvasNodeShell, type StudioCanvasNodeHandleSpec } from "../studio-node/studio-canvas-node";
import { StudioNodePortal, useStudioNodeController } from "../studio-node/studio-node-architecture";
import { getNodeGridFrameForType } from "../canvas-grid-layout";
import { SiteStudio } from "./SiteStudio";
import { useSiteAdnConnection } from "./use-site-adn";
import "./site.css";

export type { SiteNodeData } from "@/lib/site/site-types";

const SITE_EMPTY_BG = resolveFoldderNodeStudioBackground("site");
const SITE_ACCENT = "#6ec4a8";
const SITE_SHELL = "#1A1B1E";

const SITE_NODE_HANDLES: StudioCanvasNodeHandleSpec[] = [
  { id: "adn", label: "ADN", side: "left", top: "22%", type: "target", dataType: "brain" },
  { id: "dataset", label: "Dataset", side: "left", top: "42%", type: "target", dataType: "dataset" },
  { id: "content", label: "Contenido", side: "left", top: "62%", type: "target", dataType: "generic" },
  { id: "media", label: "Media", side: "left", top: "82%", type: "target", dataType: "image" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SiteNode = memo(({ id, data, selected }: NodeProps<any>) => {
  const nodeData = normalizeSiteNodeData(data as SiteNodeData);
  const { setNodes } = useReactFlow();

  const { adn } = useSiteAdnConnection(id);

  const project = useMemo(
    () => nodeData.project ?? createEmptySiteProject(),
    [nodeData.project],
  );
  const isEmpty = isSiteProjectEmpty(project);
  const sectionCount = getActiveSitePage(project).sections.length;
  const themeLabel = adn.ready || project.theme.base === "brandKit" ? adn.brandName || "Marca" : "Neutro";

  const nodeStatusLabel =
    nodeData.status === "published"
      ? "Publicado"
      : nodeData.status === "empty" || isEmpty
        ? "Vacío"
        : "Borrador";

  const onDataChange = useCallback(
    (next: SiteNodeData) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const current = normalizeSiteNodeData(n.data as SiteNodeData);
          const merged: SiteNodeData = {
            ...current,
            ...next,
            project: next.project ?? current.project,
            sectionLabels: next.sectionLabels ?? current.sectionLabels,
          };
          return {
            ...n,
            data: {
              ...merged,
              status: merged.status ?? computeSiteNodeStatus(merged.project ?? createEmptySiteProject()),
            },
          };
        }),
      );
    },
    [id, setNodes],
  );

  const { isStudioOpen, openStudio, closeStudio } = useStudioNodeController({
    nodeId: id,
    nodeType: "site",
  });

  const baseFrame = getNodeGridFrameForType("site");
  const headerTitle = nodeData.label?.trim() || "Site";

  return (
    <>
      <StudioCanvasNodeShell
        nodeId={id}
        nodeType="site"
        selected={selected}
        label={nodeData.label}
        defaultLabel="Site"
        title="SITE"
        minWidth={baseFrame?.width ?? 276}
        className={`site-node foldder-frameless-label-dark${isEmpty ? " site-node--empty" : " site-node--has-content"}`}
        handles={SITE_NODE_HANDLES}
        variant="frameless"
        material="media"
        style={
          {
            minWidth: baseFrame?.width ?? 276,
            minHeight: baseFrame?.height ?? 184,
            "--foldder-node-card-bg": SITE_ACCENT,
            "--foldder-frameless-glass-bg": SITE_SHELL,
            "--foldder-frameless-accent": SITE_ACCENT,
            "--foldder-node-header-tint-color": SITE_ACCENT,
          } as React.CSSProperties
        }
      >
        <NodeResizer minWidth={220} minHeight={160} maxWidth={960} maxHeight={1200} isVisible={selected} />
        <div
          className={`node-content foldder-frameless-main site-node-main relative flex min-h-0 flex-1 flex-col${!isEmpty ? " foldder-node-content-main--with-dock" : ""}`}
        >
          <div
            className="site-node-dropzone nodrag nopan relative flex min-h-[120px] flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden"
            onDoubleClick={() => openStudio()}
            title="Doble clic para abrir Site"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={SITE_EMPTY_BG}
              alt=""
              className="site-node-bg absolute inset-0 h-full w-full object-cover opacity-80"
              draggable={false}
            />
            <div className="relative z-[1] flex flex-col items-center px-4 text-center text-white">
              {isEmpty ? (
                <>
                  <p className="text-lg font-semibold">Web vacía</p>
                  <p className="mt-1 max-w-[240px] text-sm text-white/75">
                    Compila tu marca en una página. Conecta BrandKit o compón manualmente.
                  </p>
                  <div className="mt-4">
                    <FoldderStudioModeCenterButton label="Empezar" title="Abrir Site" onClick={() => openStudio()} />
                  </div>
                </>
              ) : (
                <div className="site-node-card-preview">
                  <p className="site-node-card-preview__count">{sectionCount}</p>
                  <p className="site-node-card-preview__label">
                    sección{sectionCount === 1 ? "" : "es"}
                  </p>
                  <p className="site-node-card-preview__meta">
                    {adn.ready ? `Marca: ${themeLabel}` : `Tema ${themeLabel}`}
                    {project.publish.status === "published" ? " · Publicado" : ""}
                  </p>
                </div>
              )}
            </div>
          </div>

          {!isEmpty ? (
            <FoldderNodeContentDock>
              <FoldderNodeContentDockMain>
                <p className="foldder-node-content-dock-text">{headerTitle}</p>
                <p className="foldder-node-content-dock-text foldder-node-content-dock-text--placeholder">
                  {sectionCount} sección{sectionCount === 1 ? "" : "es"} · doble clic para editar
                </p>
                <FoldderNodeContentMeta>
                  <FoldderNodeContentMetaRow label="Secciones" value={String(sectionCount)} />
                  <FoldderNodeContentMetaRow label="Tema" value={adn.ready ? `Marca · ${themeLabel}` : themeLabel} />
                  <FoldderNodeContentMetaRow label="Estado" value={nodeStatusLabel} variant="status" />
                </FoldderNodeContentMeta>
              </FoldderNodeContentDockMain>
            </FoldderNodeContentDock>
          ) : null}
        </div>
      </StudioCanvasNodeShell>

      {isStudioOpen ? (
        <StudioNodePortal>
          <SiteStudio
            nodeId={id}
            nodeLabel={nodeData.label}
            data={nodeData}
            onDataChange={onDataChange}
            onClose={closeStudio}
          />
        </StudioNodePortal>
      ) : null}
    </>
  );
});

SiteNode.displayName = "SiteNode";
