"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LayoutGrid, Monitor, Smartphone } from "lucide-react";
import PhotoRoomFreehandStudio from "./studio/PhotoRoomFreehandStudio";
import type { DesignerStudioApi, FreehandObject, LayoutGuide } from "../FreehandStudio";
import { createArtboard } from "../freehand/artboard";
import type { PhotoRoomArtboardState, PhotoRoomDocumentMeta } from "./photo-room-types";
import type { NewDocumentConfig } from "./new-document-model";
import {
  artboardCssToDocumentBackground,
  createPhotoRoomDocument,
  newDocumentBackgroundToCss,
} from "./new-document-model";
import { PhotoRoomNewDocumentPanel } from "./PhotoRoomNewDocumentPanel";

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
  const btnBase =
    "nodrag flex flex-1 items-center justify-center rounded-md p-2 transition-colors";
  const btnOn = "bg-white/[0.12] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]";
  const btnOff = "text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200";
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex min-w-0 items-center gap-1 rounded-lg border border-white/[0.1] bg-[#0b0d10] px-2 py-1.5">
        <label className="sr-only" htmlFor={`pr-w-${nodeId}`}>
          Ancho px
        </label>
        <input
          id={`pr-w-${nodeId}`}
          type="number"
          min={64}
          max={8192}
          className="nodrag min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-[11px] text-zinc-100 tabular-nums"
          value={artboard.width}
          onChange={(e) => applySize(Number(e.target.value), artboard.height)}
        />
        <span className="shrink-0 text-[11px] text-zinc-500">×</span>
        <label className="sr-only" htmlFor={`pr-h-${nodeId}`}>
          Alto px
        </label>
        <input
          id={`pr-h-${nodeId}`}
          type="number"
          min={64}
          max={8192}
          className="nodrag min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-[11px] text-zinc-100 tabular-nums"
          value={artboard.height}
          onChange={(e) => applySize(artboard.width, Number(e.target.value))}
        />
        <span className="shrink-0 pl-0.5 text-[9px] font-medium uppercase tracking-wide text-zinc-500">
          px
        </span>
      </div>
      <div className="flex gap-0.5 rounded-lg border border-white/[0.1] bg-[#0b0d10] p-0.5">
        <button
          type="button"
          title="Orientación horizontal (intercambia alto y ancho si está en vertical)"
          className={`${btnBase} ${isLandscape ? btnOn : btnOff}`}
          onClick={() => {
            if (artboard.height > artboard.width) {
              applySize(artboard.height, artboard.width);
            }
          }}
        >
          <Monitor size={16} strokeWidth={1.75} className="shrink-0" />
        </button>
        <button
          type="button"
          title="Orientación vertical (intercambia alto y ancho si está en horizontal)"
          className={`${btnBase} ${isPortrait ? btnOn : btnOff}`}
          onClick={() => {
            if (artboard.width > artboard.height) {
              applySize(artboard.height, artboard.width);
            }
          }}
        >
          <Smartphone size={16} strokeWidth={1.75} className="shrink-0" />
        </button>
      </div>
      <button
        type="button"
        title="Abrir presets Web/Arte, fondo y medidas avanzadas"
        onClick={onOpenPresetModal}
        className="nodrag flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.12] bg-[#0f1318] px-2 py-1.5 text-[10px] font-medium text-zinc-300 transition hover:border-sky-500/35 hover:bg-sky-500/10 hover:text-zinc-100"
      >
        <LayoutGrid size={14} strokeWidth={2} className="shrink-0 text-sky-400/90" aria-hidden />
        Presets y fondo…
      </button>
    </div>
  );
}

export type PhotoRoomStudioProps = {
  open: boolean;
  onClose: () => void;
  nodeId: string;
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
};

/**
 * Studio PhotoRoom: mismo lienzo Freehand que Designer (reglas, guías, herramientas, panel derecho, capas, P = zen).
 * Un solo pliego; sin rail de páginas ni documento .de — estado propio del nodo PhotoRoom.
 */
export default function PhotoRoomStudio({
  open,
  onClose,
  nodeId,
  objects,
  layoutGuides,
  artboard,
  docSetupDone,
  connectedImageInputs,
  onPersist,
  onExportPreview,
  studioApiRef,
  onPhotoRoomModificarImagenIA,
  onPhotoRoomRasterizeInputImage,
}: PhotoRoomStudioProps) {
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

  useEffect(() => {
    if (open) document.body.classList.add("nb-studio-open");
    else document.body.classList.remove("nb-studio-open");
    return () => document.body.classList.remove("nb-studio-open");
  }, [open]);

  useEffect(() => {
    if (!open) {
      setCanvasPresetModalOpen(false);
      setCanvasResizePreview(null);
    }
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
    setFitNonce((n) => n + 1);
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
      onPersist({
        photoRoomDocSetupDone: true,
        photoRoomDocMeta: meta,
        studioArtboard: {
          id: artboard.id,
          width: clampDim(config.width),
          height: clampDim(config.height),
          background: newDocumentBackgroundToCss(config.background),
        },
      });
      setStudioBootNonce((n) => n + 1);
    },
    [artboard.id, onPersist],
  );

  const handleWizardCancel = useCallback(() => {
    onPersist({ photoRoomDocSetupDone: true });
    setStudioBootNonce((n) => n + 1);
  }, [onPersist]);

  const openCanvasPresetModal = useCallback(() => {
    setCanvasPresetModalKey((k) => k + 1);
    setCanvasResizePreview(null);
    setCanvasPresetModalOpen(true);
  }, []);

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
        width: clampDim(config.width),
        height: clampDim(config.height),
        background: newDocumentBackgroundToCss(config.background),
      };
      onPersist({
        photoRoomDocMeta: {
          name: internal.name,
          resolution: internal.resolution,
          colorMode: internal.colorMode,
        },
        studioArtboard: nextBoard,
      });
      setCanvasPresetModalOpen(false);
      setStudioBootNonce((n) => n + 1);
      /** Tras el commit del nodo (setNodes); si se limpia antes, `liveArtboard` usa el artboard viejo y el fondo parece revertirse. */
      setTimeout(() => {
        setCanvasResizePreview(null);
      }, 0);
    },
    [artboard.id, onPersist],
  );

  const handleCanvasPresetCancel = useCallback(() => {
    setCanvasResizePreview(null);
    setCanvasPresetModalOpen(false);
  }, []);

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
          designerAutoOptimizeSwitch={undefined}
          designerOptimizeProgress={undefined}
          designerPagesRail={undefined}
          designerActivePageId={null}
          designerFitToViewNonce={fitNonce}
          onClose={onClose}
          onExport={onExportPreview}
          onUpdateObjects={handleUpdateObjects}
          onUpdateLayoutGuides={handleUpdateLayoutGuides}
          photoRoomConnectedInputs={connectedImageInputs}
          studioApiRef={studioApiRef}
          photoRoomOnModificarImagenIA={onPhotoRoomModificarImagenIA}
          photoRoomOnRasterizeInputImage={onPhotoRoomRasterizeInputImage}
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
