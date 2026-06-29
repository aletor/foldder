"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, Loader2, Redo2, RefreshCw, SplitSquareHorizontal, Undo2, Upload, Download, X } from "lucide-react";
import { FoldderStudioHeader } from "../FoldderStudioHeader";
import { StudioNodePortal } from "../studio-node/studio-node-architecture";
import { touchStudioNodeData } from "../studio-node/foldder-studio-touched";
import type { DevelopSettings, LightroomNodeData } from "./lightroom-types";
import { normalizeCropSettings } from "./lightroom-crop-types";
import { useDevelopHistory } from "./lightroom-develop-history";
import { patchDevelopSettings, LIGHTROOM_SLIDER_MAX, LIGHTROOM_SLIDER_MIN } from "./lightroom-develop-settings";
import { normalizeFileExtension, isRawFileName } from "./lightroom-decode-settings";
import { decodeLocalPhotoFile } from "./lightroom-raw-decoder";
import { getLinearSource } from "./lightroom-linear-cache";
import {
  getFileForNode,
  pickLocalPhotoFile,
  storeFileHandleForNode,
  supportsFileSystemAccess,
  tryRelinkFile,
} from "./lightroom-local-files";
import { LightroomCompareSplit } from "./LightroomCompareSplit";
import { LightroomCropOverlay } from "./LightroomCropOverlay";
import { LightroomCropPanel } from "./LightroomCropPanel";
import { LightroomMaskPreviewOverlay } from "./LightroomMaskPreviewOverlay";
import { LightroomTatOverlay } from "./LightroomTatOverlay";
import { LightroomDevelopControls } from "./LightroomDevelopControls";
import { LightroomDevelopViewport } from "./LightroomDevelopViewport";
import { bakeDevelopedImage, downloadDataUrl } from "./lightroom-bake";
import { LightroomMaskOverlay } from "./LightroomMaskOverlay";
import { LightroomMaskPanel } from "./LightroomMaskPanel";
import type { LightroomDevelopDocument, MaskAdjustmentLayer, MaskTool } from "./lightroom-mask-types";
import { developDocumentFromNode, isDevelopDocumentDefault } from "./lightroom-mask-types";
import type { LightroomDevelopEngine } from "./lightroom-webgl-engine";
import { DevelopPresetsList } from "./lightroom-ui/DevelopPresetsList";
import { DetailLoupe } from "./lightroom-ui/DetailLoupe";
import { LightroomHistogram } from "./lightroom-ui/LightroomHistogram";
import { computeRgbHistogram } from "./lightroom-ui/lightroom-histogram";
import { wbSlidersFromLinearSample } from "./lightroom-wb-eyedropper";
import { ensureBundledProfilesLoaded, matchCameraProfileForModel } from "./lightroom-bundled-profiles";

export type LightroomStudioProps = {
  nodeId: string;
  data: LightroomNodeData;
  onClose: () => void;
  onPatch: (patch: Partial<LightroomNodeData>) => void;
};

type DevelopTab = "global" | "masks" | "crop";
type TatMode = "saturation" | "hue" | "luminance";

function sourceFromFile(file: File, linked: boolean): NonNullable<LightroomNodeData["source"]> {
  return {
    fileName: file.name,
    fileSize: file.size,
    lastModified: file.lastModified,
    mimeType: file.type || undefined,
    extension: normalizeFileExtension(file.name),
    linked,
  };
}

function resolveDecodedBase(data: LightroomNodeData): string | null {
  return data.decodedDataUrl ?? data.previewDataUrl ?? null;
}

function sourceKeyFromNode(data: LightroomNodeData): string | null {
  if (!data.source) return null;
  return `${data.source.fileName}:${data.source.fileSize}:${data.source.lastModified}`;
}

export function LightroomStudio({ nodeId, data, onClose, onPatch }: LightroomStudioProps) {
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(data.decodeError ?? null);
  const [developTab, setDevelopTab] = useState<DevelopTab>("global");
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<MaskTool>("none");
  const [activeMaskIndex, setActiveMaskIndex] = useState(0);
  const [brushErase, setBrushErase] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [engine, setEngine] = useState<LightroomDevelopEngine | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [wbEyedropperActive, setWbEyedropperActive] = useState(false);
  const [colorEyedropperActive, setColorEyedropperActive] = useState(false);
  const [compareBefore, setCompareBefore] = useState(false);
  const [compareSplit, setCompareSplit] = useState(50);
  const [tatActive, setTatActive] = useState(false);
  const [tatMode, setTatMode] = useState<TatMode>("saturation");
  const [maskPreview, setMaskPreview] = useState(false);
  const [viewportZoom, setViewportZoom] = useState(1);
  const [viewportCanvas, setViewportCanvas] = useState<HTMLCanvasElement | null>(null);
  const [loupeFocus, setLoupeFocus] = useState<{ x: number; y: number } | null>(null);
  const [livePreview, setLivePreview] = useState<string | null>(null);
  const [profileMatchHint, setProfileMatchHint] = useState<string | null>(null);
  const [exportFullQuality, setExportFullQuality] = useState(false);
  const previewPatchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const developDoc = useMemo(
    () => developDocumentFromNode(data.developSettings, data.maskLayers),
    [data.developSettings, data.maskLayers],
  );

  const decodedBase = resolveDecodedBase(data);
  const sourceKey = sourceKeyFromNode(data);
  const activeLayer = developDoc.maskLayers.find((l) => l.id === activeLayerId) ?? null;

  const cropSettings = useMemo(() => normalizeCropSettings(data.cropSettings), [data.cropSettings]);

  const applyDocument = useCallback(
    (next: LightroomDevelopDocument) => {
      onPatch({
        developSettings: next.global,
        maskLayers: next.maskLayers,
        edited: !isDevelopDocumentDefault(next),
      });
    },
    [onPatch],
  );

  const history = useDevelopHistory(developDoc, applyDocument);
  const pushDocument = history.push;

  const patchDocument = pushDocument;

  const onCropChange = useCallback(
    (crop: ReturnType<typeof normalizeCropSettings>) => {
      onPatch({ cropSettings: crop });
    },
    [onPatch],
  );

  const runDecode = useCallback(
    async (file: File, linked: boolean) => {
      setBusy(true);
      setError(null);
      onPatch({ decodeStatus: "decoding", decodeError: undefined });
      try {
        const decoded = await decodeLocalPhotoFile(file);
        await ensureBundledProfilesLoaded();
        const doc = developDocumentFromNode(data.developSettings, data.maskLayers);
        const match = matchCameraProfileForModel(decoded.cameraModel);
        const nextGlobal = patchDevelopSettings(doc.global, { cameraProfileId: match.profileId });
        const hint =
          !match.matched && decoded.cameraModel && isRawFileName(file.name)
            ? `Sin perfil específico para «${decoded.cameraModel}». Usando perfil genérico.`
            : null;
        setProfileMatchHint(hint);
        const nextDoc = { ...doc, global: nextGlobal };
        onPatch(
          touchStudioNodeData({
            source: sourceFromFile(file, linked),
            decodedDataUrl: decoded.dataUrl,
            previewDataUrl: decoded.dataUrl,
            value: undefined,
            decodeStatus: "ready",
            decodeError: undefined,
            cameraMake: decoded.cameraMake,
            cameraModel: decoded.cameraModel,
            iso: decoded.iso,
            width: decoded.width,
            height: decoded.height,
            developSettings: nextGlobal,
            maskLayers: doc.maskLayers,
            edited: !isDevelopDocumentDefault(nextDoc),
          }),
        );
        history.reset(nextDoc);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error al decodificar";
        setError(msg);
        onPatch({
          decodeStatus: "error",
          decodeError: msg,
          source: sourceFromFile(file, linked),
        });
      } finally {
        setBusy(false);
      }
    },
    [data.developSettings, data.maskLayers, history, onPatch],
  );

  const onPickFile = useCallback(async () => {
    const picked = await pickLocalPhotoFile();
    if (!picked) return;
    storeFileHandleForNode(nodeId, picked.handle);
    await runDecode(picked.file, Boolean(picked.handle) || !supportsFileSystemAccess());
  }, [nodeId, runDecode]);

  const onRelink = useCallback(async () => {
    if (!data.source) {
      await onPickFile();
      return;
    }
    const picked = await tryRelinkFile(data.source);
    if (!picked) return;
    storeFileHandleForNode(nodeId, picked.handle);
    await runDecode(picked.file, true);
  }, [data.source, nodeId, onPickFile, runDecode]);

  useEffect(() => {
    void ensureBundledProfilesLoaded();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const key = sourceKeyFromNode(data);
      const rawSource = Boolean(data.source && isRawFileName(data.source.fileName));
      const linearCacheMiss = Boolean(rawSource && key && !getLinearSource(key));

      const file = await getFileForNode(nodeId);

      if (linearCacheMiss && !file && !cancelled) {
        onPatch({
          decodeStatus: "needs_relink",
          source: data.source ? { ...data.source, linked: false } : data.source,
        });
        return;
      }

      if (linearCacheMiss && file && !cancelled) {
        await runDecode(file, Boolean(data.source?.linked) || !supportsFileSystemAccess());
        return;
      }

      if (decodedBase && data.decodeStatus === "ready") return;

      if (!file || cancelled) {
        if (data.source && !file && data.decodeStatus !== "ready") {
          onPatch({
            decodeStatus: "needs_relink",
            source: { ...data.source, linked: false },
          });
        }
        return;
      }
      await runDecode(file, true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, data.source?.fileName, data.source?.fileSize, data.source?.lastModified, data.decodeStatus]);

  const onGlobalSettingsChange = useCallback(
    (next: DevelopSettings) => {
      pushDocument({ ...developDoc, global: next });
    },
    [developDoc, pushDocument],
  );

  const onToggleTat = useCallback(
    (mode: TatMode) => {
      setTatActive((prev) => !(prev && tatMode === mode));
      setTatMode(mode);
      setWbEyedropperActive(false);
      setColorEyedropperActive(false);
      setActiveTool("none");
    },
    [tatMode],
  );

  const onDevelopPreview = useCallback(
    (dataUrl: string) => {
      setLivePreview(dataUrl);
      if (previewPatchTimer.current) clearTimeout(previewPatchTimer.current);
      previewPatchTimer.current = setTimeout(() => {
        onPatch({ previewDataUrl: dataUrl });
      }, 120);
    },
    [onPatch],
  );

  const histogramPixels = engine?.getSourcePixels() ?? null;
  const histogramDims = engine?.dimensions;
  const rgbHistogram = useMemo(() => {
    if (!histogramPixels || !histogramDims?.width) return null;
    return computeRgbHistogram(histogramPixels, histogramDims.width, histogramDims.height);
  }, [histogramPixels, histogramDims]);

  const onHistogramZone = useCallback(
    (zone: "shadows" | "darks" | "lights" | "highlights") => {
      const key =
        zone === "shadows"
          ? "paramShadows"
          : zone === "darks"
            ? "paramDarks"
            : zone === "lights"
              ? "paramLights"
              : "paramHighlights";
      const current = developDoc.global.toneCurve[key];
      onGlobalSettingsChange(
        patchDevelopSettings(developDoc.global, {
          toneCurve: { [key]: Math.max(LIGHTROOM_SLIDER_MIN, Math.min(LIGHTROOM_SLIDER_MAX, current + 8)) },
        }),
      );
    },
    [developDoc.global, onGlobalSettingsChange],
  );

  const onApplyPreset = useCallback(
    (settings: DevelopSettings) => {
      onGlobalSettingsChange(settings);
    },
    [onGlobalSettingsChange],
  );

  const onGlobalWbSample = useCallback(
    (temp: number, tint: number) => {
      onGlobalSettingsChange(patchDevelopSettings(developDoc.global, { basic: { temp, tint } }));
      setWbEyedropperActive(false);
    },
    [developDoc.global, onGlobalSettingsChange],
  );

  const onWbPick = useCallback(
    (norm: { x: number; y: number }) => {
      const sample = engine?.sampleNativeLinearWindow(norm.x, norm.y);
      if (!sample) return;
      const { temp, tint } = wbSlidersFromLinearSample(sample.r, sample.g, sample.b);
      onGlobalWbSample(temp, tint);
    },
    [engine, onGlobalWbSample],
  );

  const onUpdateLayer = useCallback(
    (layerId: string, patch: Partial<MaskAdjustmentLayer>) => {
      pushDocument({
        ...developDoc,
        maskLayers: developDoc.maskLayers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)),
      });
    },
    [developDoc, pushDocument],
  );

  const refreshViewport = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(
    () => () => {
      if (previewPatchTimer.current) clearTimeout(previewPatchTimer.current);
    },
    [],
  );

  useEffect(() => {
    const dims = engine?.dimensions;
    if (dims && dims.width > 0) {
      setViewportSize({ width: dims.width, height: dims.height });
    }
  }, [engine, refreshKey, developDoc]);

  const bakeForOutput = useCallback(async () => {
    const base = resolveDecodedBase(data);
    if (!base) throw new Error("No hay imagen cargada");
    const file = await getFileForNode(nodeId);
    const key = sourceKeyFromNode(data);
    return bakeDevelopedImage({
      developDoc,
      sourceKey: key,
      sourceDataUrl: base,
      file,
      isRaw: isRawFileName(data.source?.fileName ?? ""),
      fullQuality: exportFullQuality,
      crop: cropSettings,
    });
  }, [cropSettings, data, developDoc, exportFullQuality, nodeId]);

  const onExportToNode = useCallback(async () => {
    setExporting(true);
    setError(null);
    try {
      const exported = await bakeForOutput();
      onPatch(
        touchStudioNodeData({
          value: exported,
          previewDataUrl: exported,
          type: "image",
          edited: !isDevelopDocumentDefault(developDoc) || cropSettings.enabled,
          cropSettings,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al exportar");
    } finally {
      setExporting(false);
    }
  }, [bakeForOutput, cropSettings, developDoc, onPatch]);

  const onDownloadPng = useCallback(async () => {
    setExporting(true);
    setError(null);
    try {
      const exported = await bakeForOutput();
      downloadDataUrl(exported, data.source?.fileName ?? "lightroom-export");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al descargar");
    } finally {
      setExporting(false);
    }
  }, [bakeForOutput, data.source?.fileName]);

  const source = data.source;
  const isRawSource = Boolean(data.source && isRawFileName(data.source.fileName));
  const hasLinearCache = Boolean(sourceKey && getLinearSource(sourceKey));
  const hasDevelopSource =
    data.decodeStatus === "ready" && (isRawSource ? hasLinearCache : Boolean(decodedBase));
  const awaitingRawLinear = isRawSource && data.decodeStatus === "ready" && !hasLinearCache;

  const viewportOverlay = useMemo(() => {
    if (!hasDevelopSource) return null;
    const parts: React.ReactNode[] = [];

    if (developTab === "crop" && cropSettings.enabled) {
      parts.push(<LightroomCropOverlay key="crop" crop={cropSettings} onChange={onCropChange} />);
    }

    if (developTab === "masks" && maskPreview && activeLayer) {
      parts.push(
        <LightroomMaskPreviewOverlay
          key="mask-preview"
          layer={activeLayer}
          width={viewportSize.width}
          height={viewportSize.height}
          sourcePixels={engine?.getSourcePixels() ?? undefined}
        />,
      );
    }

    if (developTab === "masks" && activeLayer) {
      parts.push(
        <LightroomMaskOverlay
          key="mask"
          width={viewportSize.width}
          height={viewportSize.height}
          activeLayer={activeLayer}
          activeTool={activeTool}
          activeMaskIndex={activeMaskIndex}
          brushErase={brushErase}
          sourcePixels={engine?.getSourcePixels() ?? undefined}
          colorEyedropperActive={colorEyedropperActive}
          wbEyedropperActive={false}
          onUpdateLayer={onUpdateLayer}
          onGlobalWbSample={onGlobalWbSample}
          onRefresh={refreshViewport}
        />,
      );
    } else if (tatActive && developTab === "global") {
      parts.push(
        <LightroomTatOverlay
          key="tat"
          active={tatActive}
          mode={tatMode}
          settings={developDoc.global}
          sourcePixels={engine?.getSourcePixels() ?? null}
          width={viewportSize.width}
          height={viewportSize.height}
          onChange={onGlobalSettingsChange}
        />,
      );
    } else if (wbEyedropperActive || colorEyedropperActive) {
      parts.push(
        <LightroomMaskOverlay
          key="dropper"
          width={viewportSize.width}
          height={viewportSize.height}
          activeLayer={null}
          activeTool={activeTool}
          activeMaskIndex={activeMaskIndex}
          brushErase={brushErase}
          sourcePixels={engine?.getSourcePixels() ?? undefined}
          canvas={viewportCanvas}
          compareBefore={compareBefore}
          colorEyedropperActive={colorEyedropperActive}
          wbEyedropperActive={wbEyedropperActive}
          onUpdateLayer={onUpdateLayer}
          onWbPick={onWbPick}
          onRefresh={refreshViewport}
        />,
      );
    }

    if (compareBefore) {
      parts.push(<LightroomCompareSplit key="split" split={compareSplit} onChange={setCompareSplit} />);
    }

    return parts.length ? <>{parts}</> : null;
  }, [
    activeLayer,
    activeMaskIndex,
    activeTool,
    brushErase,
    colorEyedropperActive,
    compareBefore,
    compareSplit,
    cropSettings,
    developDoc.global,
    developTab,
    engine,
    hasDevelopSource,
    maskPreview,
    onCropChange,
    onGlobalSettingsChange,
    onUpdateLayer,
    onWbPick,
    refreshViewport,
    tatActive,
    tatMode,
    viewportCanvas,
    viewportSize.height,
    viewportSize.width,
    wbEyedropperActive,
  ]);

  return (
    <StudioNodePortal>
      <div className="lightroom-studio" data-foldder-studio-panel onPointerDown={(e) => e.stopPropagation()}>
        <FoldderStudioHeader
          nodeType="lightroom"
          nodeLabel={data.label?.trim() || "Lightroom"}
          subtitle="Revelado RAW · Fase 4 UI"
          onClose={onClose}
        />

        <div className="lightroom-studio__body">
          <aside className="lightroom-studio__sidebar">
            <p className="lightroom-studio__eyebrow">Origen</p>
            <button type="button" className="lightroom-studio__btn nodrag" disabled={busy} onClick={() => void onPickFile()}>
              <FolderOpen size={14} />
              Abrir archivo…
            </button>
            {source ? (
              <button type="button" className="lightroom-studio__btn lightroom-studio__btn--ghost nodrag" disabled={busy} onClick={() => void onRelink()}>
                <RefreshCw size={14} />
                Re-vincular
              </button>
            ) : null}
            {source ? (
              <dl className="lightroom-studio__meta">
                <div>
                  <dt>Archivo</dt>
                  <dd>{source.fileName}</dd>
                </div>
                <div>
                  <dt>Formato</dt>
                  <dd>{source.extension.toUpperCase() || "—"}</dd>
                </div>
                {data.cameraMake || data.cameraModel ? (
                  <div>
                    <dt>Cámara</dt>
                    <dd>
                      {[data.cameraMake, data.cameraModel].filter(Boolean).join(" ")}
                    </dd>
                  </div>
                ) : null}
                {data.iso ? (
                  <div>
                    <dt>ISO</dt>
                    <dd>{data.iso}</dd>
                  </div>
                ) : null}
                {data.width && data.height ? (
                  <div>
                    <dt>Dimensiones</dt>
                    <dd>
                      {data.width} × {data.height}
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : null}

            {hasDevelopSource ? (
              <div className="lightroom-studio__history nodrag">
                <button type="button" className="lightroom-studio__btn lightroom-studio__btn--ghost" disabled={!history.canUndo} onClick={history.undo}>
                  <Undo2 size={14} />
                  Deshacer
                </button>
                <button type="button" className="lightroom-studio__btn lightroom-studio__btn--ghost" disabled={!history.canRedo} onClick={history.redo}>
                  <Redo2 size={14} />
                  Rehacer
                </button>
              </div>
            ) : null}

            <div className="lightroom-studio__tabs">
              <button
                type="button"
                className={`lightroom-studio__tab nodrag${developTab === "global" ? " is-active" : ""}`}
                onClick={() => setDevelopTab("global")}
              >
                Global
              </button>
              <button
                type="button"
                className={`lightroom-studio__tab nodrag${developTab === "masks" ? " is-active" : ""}`}
                onClick={() => setDevelopTab("masks")}
              >
                Máscaras
              </button>
              <button
                type="button"
                className={`lightroom-studio__tab nodrag${developTab === "crop" ? " is-active" : ""}`}
                onClick={() => setDevelopTab("crop")}
              >
                Recorte
              </button>
            </div>

            {developTab === "global" ? (
              <DevelopPresetsList
                disabled={!hasDevelopSource || busy}
                currentSettings={developDoc.global}
                onApply={onApplyPreset}
              />
            ) : null}

            {developTab === "crop" ? (
              <LightroomCropPanel
                crop={cropSettings}
                imageWidth={data.width ?? viewportSize.width}
                imageHeight={data.height ?? viewportSize.height}
                onChange={onCropChange}
              />
            ) : null}

            {developTab === "masks" ? (
              <LightroomMaskPanel
                document={developDoc}
                activeLayerId={activeLayerId}
                activeTool={activeTool}
                activeMaskIndex={activeMaskIndex}
                brushErase={brushErase}
                engine={engine}
                onChangeDocument={patchDocument}
                onSelectLayer={setActiveLayerId}
                onSelectTool={setActiveTool}
                onSelectMaskIndex={setActiveMaskIndex}
                onToggleBrushErase={() => setBrushErase((v) => !v)}
                onToggleColorEyedropper={() => setColorEyedropperActive((v) => !v)}
                colorEyedropperActive={colorEyedropperActive}
                maskPreview={maskPreview}
                onToggleMaskPreview={() => setMaskPreview((v) => !v)}
                onRefresh={refreshViewport}
              />
            ) : null}
          </aside>

          <main className="lightroom-studio__stage">
            {engine && !engine.linearFloatSupported ? (
              <div className="lr-float-banner" role="status">
                Pipeline 8-bit: tu GPU no soporta RGBA16F. Revelado con fallback.
              </div>
            ) : null}
            {busy || awaitingRawLinear ? (
              <div className="lightroom-studio__loading">
                <Loader2 size={28} className="animate-spin" />
                <span>{awaitingRawLinear && !busy ? "Cargando buffer lineal RAW…" : "Decodificando RAW…"}</span>
                {awaitingRawLinear && !busy ? (
                  <p className="lightroom-studio__empty-sub">Re-vincula el archivo si tarda demasiado.</p>
                ) : null}
              </div>
            ) : hasDevelopSource ? (
              <div
                className="lightroom-studio__viewport-zoom nodrag"
                style={{ transform: `scale(${viewportZoom})` }}
                onWheel={(e) => {
                  if (!e.ctrlKey && !e.metaKey) return;
                  e.preventDefault();
                  setViewportZoom((z) => Math.max(0.25, Math.min(4, z * (e.deltaY > 0 ? 0.92 : 1.08))));
                }}
              >
                <LightroomDevelopViewport
                  sourceKey={sourceKey}
                  sourceDataUrl={decodedBase}
                  linearOnly={isRawSource}
                  document={developDoc}
                  refreshKey={refreshKey}
                  compareBefore={compareBefore}
                  compareSplit={compareSplit}
                  onEngineReady={setEngine}
                  onRendered={onDevelopPreview}
                  onPointerNorm={setLoupeFocus}
                  onCanvasReady={setViewportCanvas}
                  overlay={viewportOverlay}
                />
              </div>
            ) : (
              <div className="lightroom-studio__empty">
                <FolderOpen size={40} strokeWidth={1.25} />
                <p>Abre un CR3, DNG, ARW… o JPEG/PNG</p>
                <p className="lightroom-studio__empty-sub">Revelado global + capas enmascaradas en GPU.</p>
              </div>
            )}
          </main>

          <aside className="lightroom-studio__panel lightroom-studio__panel--develop">
            {hasDevelopSource ? (
              <>
                <LightroomHistogram
                  pixels={histogramPixels}
                  width={histogramDims?.width ?? 0}
                  height={histogramDims?.height ?? 0}
                  onZoneClick={developTab === "global" ? onHistogramZone : undefined}
                />
                <button
                  type="button"
                  className={`lightroom-studio__btn lightroom-studio__btn--ghost nodrag lr-compare-btn${compareBefore ? " is-active" : ""}`}
                  disabled={busy}
                  onClick={() => {
                    setCompareBefore((v) => {
                      if (!v) setWbEyedropperActive(false);
                      return !v;
                    });
                  }}
                >
                  <SplitSquareHorizontal size={14} />
                  {compareBefore ? "Ocultar comparación" : "Antes / Después"}
                </button>
                <div className="lightroom-studio__zoom nodrag">
                  <button type="button" className="lightroom-studio__btn lightroom-studio__btn--ghost" onClick={() => setViewportZoom((z) => Math.max(0.25, z * 0.85))}>
                    −
                  </button>
                  <span>{Math.round(viewportZoom * 100)}%</span>
                  <button type="button" className="lightroom-studio__btn lightroom-studio__btn--ghost" onClick={() => setViewportZoom((z) => Math.min(4, z * 1.15))}>
                    +
                  </button>
                  <button type="button" className="lightroom-studio__btn lightroom-studio__btn--ghost" onClick={() => setViewportZoom(1)}>
                    Ajustar
                  </button>
                </div>
              </>
            ) : null}

            {developTab === "global" ? (
              <>
                <p className="lightroom-studio__eyebrow">Revelado global</p>
                <LightroomDevelopControls
                  settings={developDoc.global}
                  cameraModel={data.cameraModel}
                  profileMatchHint={profileMatchHint}
                  disabled={!hasDevelopSource || busy}
                  histogram={rgbHistogram}
                  wbEyedropperActive={wbEyedropperActive}
                  compareBefore={compareBefore}
                  onToggleWbEyedropper={() => {
                    setWbEyedropperActive((v) => !v);
                    setTatActive(false);
                  }}
                  showDetailLoupeHint
                  tatActive={tatActive}
                  tatMode={tatMode}
                  onToggleTat={onToggleTat}
                  onChange={onGlobalSettingsChange}
                />
                <DetailLoupe previewDataUrl={livePreview ?? decodedBase} focus={loupeFocus} />
              </>
            ) : developTab === "crop" ? (
              <p className="lightroom-studio__hint">
                Activa el recorte y arrastra el marco sobre la imagen. Se aplica al exportar al nodo.
              </p>
            ) : (
              <p className="lightroom-studio__hint">
                Selecciona una capa y herramienta a la izquierda. Dibuja sobre la imagen para definir la máscara; los ajustes locales se aplican solo donde el alfa &gt; 0.
              </p>
            )}

            <p className="lightroom-studio__eyebrow">Salida</p>
            <label className="lightroom-develop-controls__row nodrag lr-export-quality">
              <input
                type="checkbox"
                checked={exportFullQuality}
                disabled={!hasDevelopSource || busy || exporting}
                onChange={(e) => setExportFullQuality(e.target.checked)}
              />
              <span>Máxima calidad (AMaZE, resolución completa)</span>
            </label>
            <p className="lightroom-studio__hint">
              {exportFullQuality
                ? "Exportación a resolución nativa; puede diferir ligeramente de la preview."
                : "Por defecto exporta como en el visor (WYSIWYG)."}
            </p>
            <div className="lr-export-actions nodrag">
              <button
                type="button"
                className="lightroom-studio__btn lightroom-studio__btn--accent"
                disabled={!hasDevelopSource || busy || exporting}
                onClick={() => void onExportToNode()}
              >
                <Upload size={14} />
                {exporting ? "Exportando…" : "Exportar al nodo"}
              </button>
              <button
                type="button"
                className="lightroom-studio__btn lightroom-studio__btn--ghost"
                disabled={!hasDevelopSource || busy || exporting}
                onClick={() => void onDownloadPng()}
              >
                <Download size={14} />
                Descargar PNG
              </button>
            </div>
            {error ? (
              <p className="lightroom-studio__error" role="alert">
                <X size={12} aria-hidden />
                {error}
              </p>
            ) : null}
          </aside>
        </div>
      </div>
    </StudioNodePortal>
  );
}
