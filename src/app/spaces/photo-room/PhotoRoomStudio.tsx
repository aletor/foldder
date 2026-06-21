"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { LayoutGrid, Monitor, Smartphone } from "lucide-react";
import PhotoRoomFreehandStudio from "./studio/PhotoRoomFreehandStudio";
import type { DesignerStudioApi, FreehandObject, LayoutGuide } from "../FreehandStudio";
import type { FoldderExportCreatedDetail } from "../foldder-export-events";
import { createArtboard } from "../freehand/artboard";
import type { PhotoRoomArtboardState, PhotoRoomDocumentMeta } from "./photo-room-types";
import type { NewDocumentConfig } from "./new-document-model";
import {
  artboardCssToDocumentBackground,
  createPhotoRoomDocument,
  newDocumentBackgroundToCss,
} from "./new-document-model";
import { PhotoRoomNewDocumentPanel } from "./PhotoRoomNewDocumentPanel";
import { useBrainNodeTelemetry } from "@/lib/brain/use-brain-node-telemetry";
import { useStudioBodyLock } from "../studio-node/studio-node-architecture";

export type PhotoRoomConnectedImageInput = { slot: string; src: string };

function clampDim(n: number): number {
  return Math.max(64, Math.min(8192, Math.round(n)));
}

function PhotoRoomCanvasSideControls({
  nodeId,
  artboard,
  applySize,
  onOpenPresetModal,
}: {
  nodeId: string;
  artboard: PhotoRoomArtboardState;
  applySize: (w: number, h: number) => void;
  onOpenPresetModal: () => void;
}) {
  const isLandscape = artboard.width >= artboard.height;
  const isPortrait = artboard.height > artboard.width;
  const orientBase = "nodrag flex h-8 flex-1 items-center justify-center transition-colors";
  const orientOn = "bg-white text-slate-950";
  const orientOff = "text-white/45 hover:bg-white/[0.08] hover:text-white";
  return (
    <div data-foldder-studio-flush className="flex w-full flex-col gap-2">
      {/* W × H — fila flush con divisores */}
      <div className="flex min-w-0 items-stretch border border-white/10 bg-black/30">
        <label className="sr-only" htmlFor={`pr-w-${nodeId}`}>
          Ancho px
        </label>
        <input
          id={`pr-w-${nodeId}`}
          type="number"
          min={64}
          max={8192}
          className="nodrag min-w-0 flex-1 bg-transparent px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          value={artboard.width}
          onChange={(e) => applySize(Number(e.target.value), artboard.height)}
        />
        <span className="flex shrink-0 items-center border-x border-white/10 px-1.5 text-[11px] text-white/40">
          ×
        </span>
        <label className="sr-only" htmlFor={`pr-h-${nodeId}`}>
          Alto px
        </label>
        <input
          id={`pr-h-${nodeId}`}
          type="number"
          min={64}
          max={8192}
          className="nodrag min-w-0 flex-1 bg-transparent px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          value={artboard.height}
          onChange={(e) => applySize(artboard.width, Number(e.target.value))}
        />
        <span className="flex shrink-0 items-center border-l border-white/10 px-2 text-[8px] font-black uppercase tracking-[0.1em] text-white/40">
          px
        </span>
      </div>
      {/* Orientación — segment control flush */}
      <div className="flex items-stretch divide-x divide-white/10 border border-white/10 bg-white/[0.04]">
        <button
          type="button"
          title="Orientación horizontal (intercambia alto y ancho si está en vertical)"
          className={`${orientBase} ${isLandscape ? orientOn : orientOff}`}
          onClick={() => {
            if (artboard.height > artboard.width) {
              applySize(artboard.height, artboard.width);
            }
          }}
        >
          <Monitor size={16} strokeWidth={2} className="shrink-0" />
        </button>
        <button
          type="button"
          title="Orientación vertical (intercambia alto y ancho si está en horizontal)"
          className={`${orientBase} ${isPortrait ? orientOn : orientOff}`}
          onClick={() => {
            if (artboard.width > artboard.height) {
              applySize(artboard.height, artboard.width);
            }
          }}
        >
          <Smartphone size={16} strokeWidth={2} className="shrink-0" />
        </button>
      </div>
      {/* Presets — CTA azul full-bleed flush */}
      <button
        type="button"
        title="Abrir presets Web/Arte, fondo y medidas avanzadas"
        onClick={onOpenPresetModal}
        className="nodrag flex h-9 w-full items-center justify-center gap-2 bg-[#71449f] px-2 text-[10px] font-black uppercase tracking-[0.1em] text-white transition hover:bg-[#8055b0]"
      >
        <LayoutGrid size={14} strokeWidth={2.5} className="shrink-0" aria-hidden />
        Presets y fondo…
      </button>
    </div>
  );
}

export type PhotoRoomStudioProps = {
  open: boolean;
  onClose: () => void;
  nodeId: string;
  brainConnected?: boolean;
  objects: FreehandObject[];
  layoutGuides: LayoutGuide[];
  artboard: PhotoRoomArtboardState;
  /** Si false y no hay objetos en el lienzo, se muestra el asistente de nuevo documento (solo primera vez). */
  docSetupDone: boolean;
  /** Imágenes conectadas al nodo en el grafo (capas inferiores, no eliminables). */
  connectedImageInputs: PhotoRoomConnectedImageInput[];
  onPersist: (patch: {
    studioObjects?: FreehandObject[];
    studioLayoutGuides?: LayoutGuide[];
    studioArtboard?: PhotoRoomArtboardState;
    photoRoomDocSetupDone?: boolean;
    photoRoomDocMeta?: PhotoRoomDocumentMeta;
  }) => void;
  /** Miniatura / salida del nodo (misma pipeline que Designer al cerrar). */
  onExportPreview: (dataUrl: string) => void;
  onFinalExport?: (detail: Omit<FoldderExportCreatedDetail, "sourceNodeId">) => void;
  /** Ref al API del lienzo (export PNG para miniatura del nodo en el grafo). */
  studioApiRef?: React.MutableRefObject<DesignerStudioApi | null>;
  /** Crear Media + Nano Banana en el grafo y enlazar la capa como entrada conectada. */
  onPhotoRoomModificarImagenIA?: (payload: {
    imageObjectId: string;
    imageSrc: string;
    studioNodeKey: string;
  }) => void;
  onPhotoRoomRasterizeInputImage?: (payload: {
    imageObjectId: string;
    photoRoomInputSlot: string;
    studioObjects: FreehandObject[];
  }) => void;
  /** Abrir Studio del Nano Banana ya cableado a la ranura (sin crear nodos). */
  onPhotoRoomOpenConnectedNanoStudio?: (payload: { photoRoomInputSlot: string }) => void;
};

/**
 * Studio PhotoRoom: mismo lienzo Freehand que Designer (reglas, guías, herramientas, panel derecho, capas, P = zen).
 * Un solo pliego; sin rail de páginas ni documento .de — estado propio del nodo PhotoRoom.
 */
export default function PhotoRoomStudio({
  open,
  onClose,
  nodeId,
  brainConnected = false,
  objects,
  layoutGuides,
  artboard,
  docSetupDone,
  connectedImageInputs,
  onPersist,
  onExportPreview,
  onFinalExport,
  studioApiRef,
  onPhotoRoomModificarImagenIA,
  onPhotoRoomRasterizeInputImage,
  onPhotoRoomOpenConnectedNanoStudio,
}: PhotoRoomStudioProps) {
  const brainNodeTelemetry = useBrainNodeTelemetry({ canvasNodeId: nodeId, nodeType: "PHOTOROOM" });
  /** ≥1 para que FreehandStudio ejecute fit al montar (`designerFitToViewNonce === 0` no hace encuadre). */
  const [fitNonce, setFitNonce] = useState(1);
  const [studioBootNonce, setStudioBootNonce] = useState(0);
  const [canvasPresetModalOpen, setCanvasPresetModalOpen] = useState(false);
  const [canvasPresetModalKey, setCanvasPresetModalKey] = useState(0);
  /** Vista previa del modal «Tamaño del lienzo» (tamaño/fondo) antes de Aplicar. */
  const [canvasResizePreview, setCanvasResizePreview] = useState<{
    width: number;
    height: number;
    background: NewDocumentConfig["background"];
  } | null>(null);

  useStudioBodyLock(open);

  useEffect(() => {
    if (open) return undefined;
    const timer = window.setTimeout(() => {
      setCanvasPresetModalOpen(false);
      setCanvasResizePreview(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const showNewDocumentWizard = open && !docSetupDone && objects.length === 0;

  const liveArtboard = useMemo((): PhotoRoomArtboardState => {
    if (!canvasResizePreview) return artboard;
    return {
      ...artboard,
      width: clampDim(canvasResizePreview.width),
      height: clampDim(canvasResizePreview.height),
      background: newDocumentBackgroundToCss(canvasResizePreview.background),
    };
  }, [artboard, canvasResizePreview]);

  const canvasDimFitSkipRef = useRef(true);
  useEffect(() => {
    if (canvasDimFitSkipRef.current) {
      canvasDimFitSkipRef.current = false;
      return;
    }
    const raf = requestAnimationFrame(() => setFitNonce((n) => n + 1));
    return () => cancelAnimationFrame(raf);
  }, [liveArtboard.width, liveArtboard.height]);

  const initialArtboards = useMemo(
    () => [
      createArtboard({
        id: liveArtboard.id,
        name: "Canvas",
        x: 0,
        y: 0,
        width: liveArtboard.width,
        height: liveArtboard.height,
        displayUnit: "px",
        background: liveArtboard.background ?? "#ffffff",
      }),
    ],
    [liveArtboard.id, liveArtboard.width, liveArtboard.height, liveArtboard.background],
  );

  const handleUpdateObjects = useCallback(
    (next: FreehandObject[]) => {
      onPersist({ studioObjects: next });
    },
    [onPersist],
  );

  const handleUpdateLayoutGuides = useCallback(
    (guides: LayoutGuide[]) => {
      onPersist({ studioLayoutGuides: guides });
    },
    [onPersist],
  );

  const applySize = useCallback(
    (w: number, h: number) => {
      const nw = clampDim(w);
      const nh = clampDim(h);
      onPersist({
        studioArtboard: {
          ...artboard,
          width: nw,
          height: nh,
        },
      });
    },
    [artboard, onPersist],
  );

  const handleWizardConfirm = useCallback(
    (config: NewDocumentConfig) => {
      const internal = createPhotoRoomDocument(config);
      const meta: PhotoRoomDocumentMeta = {
        name: internal.name,
        resolution: internal.resolution,
        colorMode: internal.colorMode,
      };
      flushSync(() => {
        onPersist({
          photoRoomDocSetupDone: true,
          photoRoomDocMeta: meta,
          studioArtboard: {
            id: artboard.id,
            width: clampDim(Number(config.width)),
            height: clampDim(Number(config.height)),
            background: newDocumentBackgroundToCss(config.background),
          },
        });
      });
      setTimeout(() => setStudioBootNonce((n) => n + 1), 0);
    },
    [artboard.id, onPersist],
  );

  const handleWizardCancel = useCallback(() => {
    onPersist({ photoRoomDocSetupDone: true });
    setStudioBootNonce((n) => n + 1);
  }, [onPersist]);

  const openCanvasPresetModal = useCallback(() => {
    setCanvasPresetModalKey((k) => k + 1);
    /** Semilla explícita: si el preview queda en null un ciclo, el lienzo no refleja el modal hasta el effect del panel. */
    setCanvasResizePreview({
      width: clampDim(artboard.width),
      height: clampDim(artboard.height),
      background: artboardCssToDocumentBackground(artboard.background),
    });
    setCanvasPresetModalOpen(true);
  }, [artboard]);

  const handleCanvasPreviewFromModal = useCallback(
    (partial: { width: number; height: number; background: NewDocumentConfig["background"] }) => {
      setCanvasResizePreview(partial);
    },
    [],
  );

  const handleCanvasPresetConfirm = useCallback(
    (config: NewDocumentConfig) => {
      const internal = createPhotoRoomDocument(config);
      const nextBoard: PhotoRoomArtboardState = {
        id: artboard.id,
        width: clampDim(Number(config.width)),
        height: clampDim(Number(config.height)),
        background: newDocumentBackgroundToCss(config.background),
      };
      /** `flushSync`: el grafo debe tener ya `studioArtboard` antes de remontar el lienzo. */
      flushSync(() => {
        onPersist({
          photoRoomDocMeta: {
            name: internal.name,
            resolution: internal.resolution,
            colorMode: internal.colorMode,
          },
          studioArtboard: nextBoard,
        });
      });
      setCanvasPresetModalOpen(false);
      /**
       * Remount en el mismo tick que `setNodes` puede montar Freehand con `artboard` del nodo aún
       * desactualizado (tamaño vuelve a 1920×1080). Diferimos nonce + limpieza de preview un macrotask.
       */
      setTimeout(() => {
        setCanvasResizePreview(null);
        setStudioBootNonce((n) => n + 1);
      }, 0);
    },
    [artboard.id, onPersist],
  );

  const handleCanvasPresetCancel = useCallback(() => {
    setCanvasResizePreview(null);
    setCanvasPresetModalOpen(false);
  }, []);

  /**
   * Cierre PhotoRoom: exporta a resolución completa del documento antes de cerrar
   * (la miniatura del nodo y la salida del grafo usan el mismo PNG a tamaño real).
   */
  const handleCloseInstant = useCallback(async () => {
    const api = studioApiRef?.current;
    if (api?.getNodePreviewPngDataUrl) {
      try {
        const url = await api.getNodePreviewPngDataUrl({
          fullResolution: true,
          brainExportTelemetry: true,
        });
        if (url) onExportPreview(url);
      } catch {
        // noop
      }
    }
    onClose();
  }, [onClose, onExportPreview, studioApiRef]);

  if (!open) return null;

  const canvasKey = `photoroom-fh-${nodeId}-${studioBootNonce}`;

  return createPortal(
    <>
      {showNewDocumentWizard ? (
        <PhotoRoomNewDocumentPanel onConfirm={handleWizardConfirm} onCancel={handleWizardCancel} />
      ) : (
        <PhotoRoomFreehandStudio
          key={canvasKey}
          nodeId={canvasKey}
          photoRoomStudioEmbed
          designerBrainTelemetry={brainNodeTelemetry}
          initialObjects={objects}
          initialLayoutGuides={layoutGuides}
          initialArtboards={initialArtboards}
          studioHeaderTitle="PhotoRoom"
          studioHeaderSubtitle="Lienzo único — P pantalla completa"
          studioPhotoRoomCanvasPanel={
            <PhotoRoomCanvasSideControls
              nodeId={nodeId}
              artboard={liveArtboard}
              applySize={applySize}
              onOpenPresetModal={openCanvasPresetModal}
            />
          }
          designerMode
          designerDeDocument={null}
          designerMultipageVectorPdfExport={undefined}
          designerSkipAutoNodeExportOnClose
          designerAutoOptimizeSwitch={undefined}
          designerOptimizeProgress={undefined}
          designerPagesRail={undefined}
          designerActivePageId={null}
          designerFitToViewNonce={fitNonce}
          onClose={handleCloseInstant}
          onExport={onExportPreview}
          onFinalExport={onFinalExport}
          onUpdateObjects={handleUpdateObjects}
          onUpdateLayoutGuides={handleUpdateLayoutGuides}
          brainConnected={brainConnected}
          photoRoomConnectedInputs={connectedImageInputs}
          studioApiRef={studioApiRef}
          photoRoomOnModificarImagenIA={onPhotoRoomModificarImagenIA}
          photoRoomOnRasterizeInputImage={onPhotoRoomRasterizeInputImage}
          photoRoomOnOpenConnectedNanoStudio={onPhotoRoomOpenConnectedNanoStudio}
        />
      )}
      {canvasPresetModalOpen && !showNewDocumentWizard && (
        <PhotoRoomNewDocumentPanel
          key={canvasPresetModalKey}
          mode="resize"
          initialWidth={artboard.width}
          initialHeight={artboard.height}
          initialBackground={artboardCssToDocumentBackground(artboard.background)}
          onCanvasPreviewChange={handleCanvasPreviewFromModal}
          onConfirm={handleCanvasPresetConfirm}
          onCancel={handleCanvasPresetCancel}
        />
      )}
    </>,
    document.body,
  );
}
