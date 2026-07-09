"use client";

import React, { memo, useCallback, useMemo } from "react";
import { NodeResizer, useReactFlow, type NodeProps } from "@xyflow/react";
import {
  computeGenomaCompleteness,
  createEmptyGenoma,
  extractBrandTitle,
  extractLogoPreviewUrl,
  extractPaletteSwatches,
  isGenomaEmpty,
  normalizeGenomaDocument,
} from "@/lib/genoma/genoma-defaults";
import type { GenomaDocument, GenomaNodeData } from "@/lib/genoma/genoma-types";
import {
  FoldderNodeContentDock,
  FoldderNodeContentDockActions,
  FoldderNodeContentDockMain,
  FoldderNodeContentMeta,
  FoldderNodeContentMetaRow,
  FoldderStudioModeCenterButton,
} from "../foldder-node-ui";
import { resolveFoldderNodeStudioBackground } from "../studio-node/foldder-studio-node-backgrounds";
import { StudioCanvasNodeShell } from "../studio-node/studio-canvas-node";
import { StudioNodePortal, useStudioNodeController } from "../studio-node/studio-node-architecture";
import { getNodeGridFrameForType } from "../canvas-grid-layout";
import { GenomaStudio } from "./GenomaStudio";
import "./genoma.css";

export type { GenomaNodeData } from "@/lib/genoma/genoma-types";

const GENOMA_EMPTY_BG = resolveFoldderNodeStudioBackground("genoma");
const GENOMA_ACCENT = "#FFBD1B";
const GENOMA_SHELL = "#1A1B1E";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GenomaNode = memo(({ id, data, selected }: NodeProps<any>) => {
  const nodeData = data as GenomaNodeData;
  const { setNodes } = useReactFlow();

  const genoma = useMemo(
    () => normalizeGenomaDocument(nodeData.genoma ?? createEmptyGenoma()),
    [nodeData.genoma],
  );
  const completeness = useMemo(() => computeGenomaCompleteness(genoma), [genoma]);
  const headerTitle = nodeData.label?.trim() || extractBrandTitle(genoma, "Genoma");
  const isEmpty = isGenomaEmpty(genoma);
  const logoPreview = extractLogoPreviewUrl(genoma);
  const swatches = extractPaletteSwatches(genoma);
  const sourcesCount = genoma.sources.length;

  const patchNodeData = useCallback(
    (patch: Partial<GenomaNodeData>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
      );
    },
    [id, setNodes],
  );

  const onGenomaChange = useCallback(
    (next: GenomaDocument) => {
      const empty = isGenomaEmpty(next);
      const percent = computeGenomaCompleteness(next).percent;
      patchNodeData({
        genoma: next,
        status: empty ? "empty" : next.compiled ? "done" : percent > 0 ? "partial" : "empty",
      });
    },
    [patchNodeData],
  );

  const { isStudioOpen, openStudio, closeStudio } = useStudioNodeController({
    nodeId: id,
    nodeType: "genoma",
  });

  const baseFrame = getNodeGridFrameForType("genoma");

  return (
    <>
      <StudioCanvasNodeShell
        nodeId={id}
        nodeType="genoma"
        selected={selected}
        label={nodeData.label}
        defaultLabel="Genoma"
        title="GENOMA"
        minWidth={baseFrame?.width ?? 276}
        className={`genoma-node foldder-frameless-label-dark${isEmpty ? " genoma-node--empty" : " genoma-node--has-content"}`}
        variant="frameless"
        material="media"
        style={
          {
            minWidth: baseFrame?.width ?? 276,
            minHeight: baseFrame?.height ?? 184,
            "--foldder-node-card-bg": GENOMA_ACCENT,
            "--foldder-frameless-glass-bg": GENOMA_SHELL,
            "--foldder-frameless-accent": GENOMA_ACCENT,
            "--foldder-node-header-tint-color": GENOMA_ACCENT,
          } as React.CSSProperties
        }
      >
        <NodeResizer minWidth={220} minHeight={160} maxWidth={960} maxHeight={1200} isVisible={selected} />
        <div
          className={`node-content foldder-frameless-main genoma-node-main relative flex min-h-0 flex-1 flex-col${!isEmpty ? " foldder-node-content-main--with-dock" : ""}`}
        >
          <div
            className="genoma-node-dropzone nodrag nopan relative flex min-h-[120px] flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden"
            onDoubleClick={() => openStudio()}
            title="Doble clic para abrir Genoma"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={GENOMA_EMPTY_BG}
              alt=""
              className="genoma-node-bg absolute inset-0 h-full w-full object-cover opacity-80"
              draggable={false}
            />
            <div className="relative z-[1] flex flex-col items-center px-4 text-center text-white">
              {isEmpty ? (
                <>
                  <p className="text-lg font-semibold">ADN vacío</p>
                  <p className="mt-1 max-w-[220px] text-sm text-white/75">
                    Analiza una web o sube archivos para construir la marca.
                  </p>
                  <div className="mt-4">
                    <FoldderStudioModeCenterButton label="Empezar" title="Abrir Genoma" onClick={() => openStudio()} />
                  </div>
                </>
              ) : (
                <div className="genoma-node-card-preview">
                  {logoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoPreview} alt="" className="genoma-node-card-preview__logo" draggable={false} />
                  ) : null}
                  <div className="genoma-node-card-preview__swatches" aria-hidden>
                    {swatches.map((hex) => (
                      <span
                        key={hex}
                        className="genoma-node-card-preview__swatch"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                  <p className="text-4xl font-bold leading-none">{completeness.percent}%</p>
                  <p className="genoma-node-card-preview__meta">
                    {completeness.resolved}/{completeness.total} slots · {sourcesCount}{" "}
                    {sourcesCount === 1 ? "fuente" : "fuentes"}
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
                  {completeness.percent}% · {sourcesCount} {sourcesCount === 1 ? "fuente" : "fuentes"}
                </p>
                <FoldderNodeContentMeta>
                  <FoldderNodeContentMetaRow label="Slots" value={`${completeness.resolved}/${completeness.total}`} />
                  <FoldderNodeContentMetaRow label="Estado" value={nodeData.status ?? "partial"} />
                </FoldderNodeContentMeta>
              </FoldderNodeContentDockMain>
              <FoldderNodeContentDockActions>
                <button type="button" className="foldder-node-content-dock-action" onClick={() => openStudio()}>
                  Abrir
                </button>
              </FoldderNodeContentDockActions>
            </FoldderNodeContentDock>
          ) : null}
        </div>
      </StudioCanvasNodeShell>

      {isStudioOpen ? (
        <StudioNodePortal>
          <GenomaStudio
            nodeId={id}
            nodeLabel={headerTitle}
            genoma={genoma}
            onGenomaChange={onGenomaChange}
            onClose={closeStudio}
          />
        </StudioNodePortal>
      ) : null}
    </>
  );
});

GenomaNode.displayName = "GenomaNode";
