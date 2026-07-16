"use client";

import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { NodeResizer, useReactFlow, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import {
  computeBrandKitCompleteness,
  createEmptyBrandKit,
  extractBrandTitle,
  extractDiscoveredPaletteColors,
  extractLogoPreviewUrl,
  isBrandKitEmpty,
  normalizeBrandKitDocument,
} from "@/lib/brandkit/brand-kit-defaults";
import type { BrandKitDocument, BrandKitNodeData, LogoValue } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import {
  brandKitFaceSwatchColumns,
  extractNodeFaceGalleryStripUrls,
  extractPrimaryPaletteHex,
  extractPrimaryTypeSpecimen,
} from "@/lib/brandkit/brand-kit-node-face";
import { brandKitNodeLogoWrapClass } from "@/lib/brandkit/brand-kit-logo-plinth";
import { buildGoogleFontsCssUrl } from "@/lib/brandkit/normalize-font-display-name";
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
import { nodeFrameNeedsSync } from "../studio-node-aspect";
import { readableTextOn } from "./face-utils";
import { BrandKitStudio } from "./BrandKitStudio";
import { BrandKitMediaImage } from "./BrandKitMediaImage";
import { useLogoLateralEdgeBackground } from "./board-v2/use-logo-lateral-edge-background";
import "./brand-kit.css";

export type { BrandKitNodeData } from "@/lib/brandkit/brand-kit-types";

const BRAND_KIT_EMPTY_BG = resolveFoldderNodeStudioBackground("brandKit");
const BRAND_KIT_ACCENT = "#FFBD1B";
const BRAND_KIT_SHELL = "#1A1B1E";
const NODE_FACE_TYPE_FALLBACK =
  '"Avenir Next Condensed", "Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif';

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
  const { setNodes, getNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const frameSyncKeyRef = useRef<string | null>(null);

  const brandKit = useMemo(
    () => normalizeBrandKitDocument(nodeData.brandKit ?? createEmptyBrandKit()),
    [nodeData.brandKit],
  );
  const completeness = useMemo(() => computeBrandKitCompleteness(brandKit), [brandKit]);
  const headerTitle = nodeData.label?.trim() || extractBrandTitle(brandKit, "BrandKit");
  const isEmpty = isBrandKitEmpty(brandKit);
  const logoPreview = extractLogoPreviewUrl(brandKit);
  const logoValue = brandKit.slots.logo?.value as LogoValue | undefined;
  const logoEdgeBackground = useLogoLateralEdgeBackground(logoPreview ?? undefined);
  const logoWrapClass = useMemo(() => {
    if (logoEdgeBackground) return "";
    return brandKitNodeLogoWrapClass(logoValue);
  }, [logoEdgeBackground, logoValue]);
  const paletteColors = useMemo(() => extractDiscoveredPaletteColors(brandKit), [brandKit]);
  const swatchColumns = useMemo(() => brandKitFaceSwatchColumns(paletteColors.length), [paletteColors.length]);
  const typeSpecimen = useMemo(() => extractPrimaryTypeSpecimen(brandKit), [brandKit]);
  const galleryStripUrls = useMemo(() => extractNodeFaceGalleryStripUrls(brandKit), [brandKit]);
  const primaryPaletteHex = useMemo(() => extractPrimaryPaletteHex(brandKit), [brandKit]);
  const typeSurfaceHex = primaryPaletteHex ?? paletteColors[0] ?? "#F4F1EE";
  const typeInkHex = readableTextOn(typeSurfaceHex);
  const hasFaceContent = Boolean(
    logoPreview || paletteColors.length || typeSpecimen || galleryStripUrls.length,
  );

  useEffect(() => {
    if (!typeSpecimen || typeSpecimen.source !== "google") return;
    const href = buildGoogleFontsCssUrl([
      { name: typeSpecimen.familyName, weights: [typeSpecimen.fontWeight] },
    ]);
    if (!href || typeof document === "undefined") return;
    const linkId = `brand-kit-node-face-font-${typeSpecimen.familyName.replace(/\W+/g, "-").toLowerCase()}`;
    if (document.getElementById(linkId)) return;
    const link = document.createElement("link");
    link.id = linkId;
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.brandKitNodeFaceFont = typeSpecimen.familyName;
    document.head.appendChild(link);
  }, [typeSpecimen]);
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
  const frameWidth = baseFrame?.width ?? 416;
  const frameHeight = baseFrame?.height ?? 416;

  useLayoutEffect(() => {
    if (!baseFrame) return;
    const syncKey = "brandKit-4x4";
    if (frameSyncKeyRef.current === syncKey) return;
    const current = getNodes().find((n) => n.id === id);
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
          style: {
            ...(n.style as React.CSSProperties),
            width: baseFrame.width,
            height: baseFrame.height,
          },
        };
      }),
    );
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [baseFrame, getNodes, id, setNodes, updateNodeInternals]);

  return (
    <>
      <StudioCanvasNodeShell
        nodeId={id}
        nodeType="brandKit"
        selected={selected}
        label={nodeData.label}
        defaultLabel="BrandKit"
        title="BRAND_KIT"
        minWidth={frameWidth}
        className={`brandKit-node foldder-frameless-label-dark${isEmpty ? " brandKit-node--empty" : " brandKit-node--has-content"}`}
        handles={BRAND_KIT_NODE_HANDLES}
        variant="frameless"
        material="media"
        style={
          {
            minWidth: frameWidth,
            minHeight: frameHeight,
            "--foldder-node-card-bg": BRAND_KIT_ACCENT,
            "--foldder-frameless-glass-bg": BRAND_KIT_SHELL,
            "--foldder-frameless-accent": BRAND_KIT_ACCENT,
            "--foldder-node-header-tint-color": BRAND_KIT_ACCENT,
          } as React.CSSProperties
        }
      >
        <NodeResizer
          minWidth={frameWidth}
          minHeight={frameHeight}
          maxWidth={960}
          maxHeight={1200}
          isVisible={selected}
        />
        <div
          className={`node-content foldder-frameless-main brandKit-node-main${!isEmpty ? " foldder-node-content-main--with-dock" : ""}`}
        >
          {hasFaceContent ? (
            <div
              className="brandKit-node-face"
              onDoubleClick={() => openStudio()}
              title="Arrastra el nodo · Doble clic para abrir BrandKit"
            >
              <div
                className={`brandKit-node-face__brand${galleryStripUrls.length ? " brandKit-node-face__brand--with-strip" : ""}`}
                aria-hidden
              >
                <div
                  className={`brandKit-node-face__logo${logoWrapClass ? ` ${logoWrapClass}` : ""}${logoPreview ? "" : " is-empty"}${logoEdgeBackground ? " brandKit-node-face__logo--edge" : ""}`}
                  style={logoEdgeBackground ? { backgroundColor: logoEdgeBackground } : undefined}
                >
                  {logoPreview ? (
                    <BrandKitMediaImage
                      src={logoPreview}
                      alt=""
                      className="brandKit-node-face__logo-img"
                      draggable={false}
                      eager
                    />
                  ) : null}
                </div>
                {galleryStripUrls.length ? (
                  <div className="brandKit-node-face__gallery-strip">
                    {galleryStripUrls.map((url) => (
                      <div key={url} className="brandKit-node-face__gallery-tile">
                        <BrandKitMediaImage
                          src={url}
                          alt=""
                          className="brandKit-node-face__gallery-img"
                          draggable={false}
                          eager
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="brandKit-node-face__rail" aria-hidden>
                <div
                  className="brandKit-node-face__swatches"
                  style={
                    {
                      "--brandKit-face-swatch-cols": String(Math.max(1, swatchColumns)),
                    } as React.CSSProperties
                  }
                >
                  {paletteColors.length ? (
                    paletteColors.map((hex) => (
                      <span
                        key={hex}
                        className="brandKit-node-face__swatch"
                        style={{ backgroundColor: hex }}
                        title={hex}
                      />
                    ))
                  ) : (
                    <span className="brandKit-node-face__swatch brandKit-node-face__swatch--empty" />
                  )}
                </div>
                <div
                  className="brandKit-node-face__type"
                  style={{
                    backgroundColor: typeSurfaceHex,
                    color: typeInkHex,
                    fontFamily: typeSpecimen?.fontFamily ?? NODE_FACE_TYPE_FALLBACK,
                    fontWeight: typeSpecimen?.fontWeight ?? 700,
                  }}
                >
                  <span className="brandKit-node-face__glyph">Aa</span>
                </div>
              </div>
            </div>
          ) : (
            <div
              className="brandKit-node-empty"
              onDoubleClick={() => openStudio()}
              title="Arrastra el nodo · Doble clic para abrir BrandKit"
            >
              <BrandKitMediaImage
                src={BRAND_KIT_EMPTY_BG}
                alt=""
                className="brandKit-node-empty__bg"
                draggable={false}
                eager
              />
              <div className="brandKit-node-empty__copy">
                <p className="brandKit-node-empty__title">ADN vacío</p>
                <p className="brandKit-node-empty__hint">Analiza una web o sube archivos para construir la marca.</p>
                <div className="brandKit-node-empty__cta nodrag nopan">
                  <FoldderStudioModeCenterButton label="Empezar" title="Abrir BrandKit" onClick={() => openStudio()} />
                </div>
              </div>
            </div>
          )}

          {!isEmpty ? (
            <FoldderNodeContentDock allowNodeDrag>
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
                <button type="button" className="foldder-node-content-dock-action nodrag nopan" onClick={() => openStudio()}>
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
