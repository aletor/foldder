"use client";

import React, { memo, useCallback, useMemo } from "react";
import { NodeResizer, useReactFlow, type NodeProps } from "@xyflow/react";
import {
  computeBrandKitCompleteness,
  createEmptyBrandKit,
  extractBrandTitle,
  extractLogoPreviewUrl,
  extractPaletteSwatches,
  isBrandKitEmpty,
  normalizeBrandKitDocument,
} from "@/lib/brandkit/brand-kit-defaults";
import type { BrandKitDocument, BrandKitNodeData, LogoValue } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { brandKitNodeLogoWrapClass } from "@/lib/brandkit/brand-kit-logo-plinth";
import {
  FoldderNodeContentDock,
  FoldderNodeContentDockActions,
  FoldderNodeContentDockMain,
  FoldderNodeContentMeta,
  FoldderNodeContentMetaRow,
  FoldderStudioModeCenterButton,
} from "../foldder-node-ui";
import { resolveFoldderNodeStudioBackground } from "../studio-node/foldder-studio-node-backgrounds";
import { StudioCanvasNodeShell, type StudioCanvasNodeHandleSpec } from "../studio-node/studio-canvas-node";
import { StudioNodePortal, useStudioNodeController } from "../studio-node/studio-node-architecture";
import { getNodeGridFrameForType } from "../canvas-grid-layout";
import { BrandKitStudio } from "./BrandKitStudio";
import { BrandKitMediaImage } from "./BrandKitMediaImage";
import "./brand-kit.css";

export type { BrandKitNodeData } from "@/lib/brandkit/brand-kit-types";

const BRAND_KIT_EMPTY_BG = resolveFoldderNodeStudioBackground("brandKit");
const BRAND_KIT_ACCENT = "#FFBD1B";
const BRAND_KIT_SHELL = "#1A1B1E";

const BRAND_KIT_NODE_HANDLES: StudioCanvasNodeHandleSpec[] = [
  {
    side: "right",
    top: "50%",
    style: { transform: "translateY(-50%)" },
    type: "source",
    id: "brand",
    dataType: "brain",
    label: "Marca",
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const BrandKitNode = memo(({ id, data, selected }: NodeProps<any>) => {
  const nodeData = data as BrandKitNodeData;
  const { setNodes } = useReactFlow();

  const brandKit = useMemo(
    () => normalizeBrandKitDocument(nodeData.brandKit ?? createEmptyBrandKit()),
    [nodeData.brandKit],
  );
  const completeness = useMemo(() => computeBrandKitCompleteness(brandKit), [brandKit]);
  const headerTitle = nodeData.label?.trim() || extractBrandTitle(brandKit, "BrandKit");
  const isEmpty = isBrandKitEmpty(brandKit);
  const logoPreview = extractLogoPreviewUrl(brandKit);
  const logoValue = brandKit.slots.logo?.value as LogoValue | undefined;
  const logoWrapClass = useMemo(() => brandKitNodeLogoWrapClass(logoValue), [logoValue]);
  const swatches = extractPaletteSwatches(brandKit);
  const sourcesCount = brandKit.sources.length;

  const nodeStatusLabel =
    nodeData.status === "done"
      ? brandKitLocaleEs.nodeStatusDone
      : nodeData.status === "empty" || isEmpty
        ? brandKitLocaleEs.nodeStatusEmpty
        : brandKitLocaleEs.nodeStatusPartial;

  const patchNodeData = useCallback(
    (patch: Partial<BrandKitNodeData>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
      );
    },
    [id, setNodes],
  );

  const onBrandKitChange = useCallback(
    (next: BrandKitDocument) => {
      const empty = isBrandKitEmpty(next);
      const percent = computeBrandKitCompleteness(next).percent;
      patchNodeData({
        brandKit: next,
        status: empty ? "empty" : next.compiled ? "done" : percent > 0 ? "partial" : "empty",
      });
    },
    [patchNodeData],
  );

  const { isStudioOpen, openStudio, closeStudio } = useStudioNodeController({
    nodeId: id,
    nodeType: "brandKit",
  });

  const baseFrame = getNodeGridFrameForType("brandKit");

  return (
    <>
      <StudioCanvasNodeShell
        nodeId={id}
        nodeType="brandKit"
        selected={selected}
        label={nodeData.label}
        defaultLabel="BrandKit"
        title="BRAND_KIT"
        minWidth={baseFrame?.width ?? 276}
        className={`brandKit-node foldder-frameless-label-dark${isEmpty ? " brandKit-node--empty" : " brandKit-node--has-content"}`}
        handles={BRAND_KIT_NODE_HANDLES}
        variant="frameless"
        material="media"
        style={
          {
            minWidth: baseFrame?.width ?? 276,
            minHeight: baseFrame?.height ?? 184,
            "--foldder-node-card-bg": BRAND_KIT_ACCENT,
            "--foldder-frameless-glass-bg": BRAND_KIT_SHELL,
            "--foldder-frameless-accent": BRAND_KIT_ACCENT,
            "--foldder-node-header-tint-color": BRAND_KIT_ACCENT,
          } as React.CSSProperties
        }
      >
        <NodeResizer minWidth={220} minHeight={160} maxWidth={960} maxHeight={1200} isVisible={selected} />
        <div
          className={`node-content foldder-frameless-main brandKit-node-main relative flex min-h-0 flex-1 flex-col${!isEmpty ? " foldder-node-content-main--with-dock" : ""}`}
        >
          <div
            className="brandKit-node-dropzone nodrag nopan relative flex min-h-[120px] flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden"
            onDoubleClick={() => openStudio()}
            title="Doble clic para abrir BrandKit"
          >
            <BrandKitMediaImage
              src={BRAND_KIT_EMPTY_BG}
              alt=""
              className="brandKit-node-bg absolute inset-0 h-full w-full object-cover opacity-80"
              draggable={false}
              eager
            />
            <div className="relative z-[1] flex flex-col items-center px-4 text-center text-white">
              {isEmpty ? (
                <>
                  <p className="text-lg font-semibold">ADN vacío</p>
                  <p className="mt-1 max-w-[220px] text-sm text-white/75">
                    Analiza una web o sube archivos para construir la marca.
                  </p>
                  <div className="mt-4">
                    <FoldderStudioModeCenterButton label="Empezar" title="Abrir BrandKit" onClick={() => openStudio()} />
                  </div>
                </>
              ) : (
                <div className="brandKit-node-card-preview">
                  {logoPreview ? (
                    <div
                      className={`brandKit-node-card-preview__logo-wrap${logoWrapClass ? ` ${logoWrapClass}` : ""}`}
                      aria-hidden
                    >
                      <BrandKitMediaImage
                        src={logoPreview}
                        alt=""
                        className="brandKit-node-card-preview__logo"
                        draggable={false}
                        eager
                      />
                    </div>
                  ) : null}
                  <div className="brandKit-node-card-preview__swatches" aria-hidden>
                    {swatches.map((hex) => (
                      <span
                        key={hex}
                        className="brandKit-node-card-preview__swatch"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                  <p className="text-4xl font-bold leading-none">{completeness.percent}%</p>
                  <p className="brandKit-node-card-preview__meta">
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
                  <FoldderNodeContentMetaRow label="Estado" value={nodeStatusLabel} />
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
          <BrandKitStudio
            nodeId={id}
            nodeLabel={headerTitle}
            brandKit={brandKit}
            onBrandKitChange={onBrandKitChange}
            onClose={closeStudio}
          />
        </StudioNodePortal>
      ) : null}
    </>
  );
});

BrandKitNode.displayName = "BrandKitNode";
