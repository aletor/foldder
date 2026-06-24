import type * as React from "react";
import type { BrainNodeTelemetryApi } from "@/lib/brain/brain-telemetry";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import type { GenerativeFillRect } from "@/lib/designer/generative-fill/types";
import type { FreehandObject, DesignerStudioApi } from "../FreehandStudio";
import type { VectorPdfExportOptions } from "./text-outline";

/**
 * Props opcionales que conectan FreehandStudio con el documento multipágina (DesignerStudio).
 * Agrupadas para documentación y para extender `FreehandStudioProps` sin repetir docstrings.
 */
export type DesignerEmbedProps = {
  /** Designer mode: text frame, image frame tools; pliego viene del documento de páginas. */
  designerMode?: boolean;
  /** Called when a text frame is created/modified in designer mode. */
  onDesignerTextFrameCreate?: (frameObj: FreehandObject) => void;
  /** Called when an image frame needs image placement in designer mode. */
  onDesignerImageFramePlace?: (frameId: string) => void;
  /** Designer: colocar archivo en un marco (p. ej. arrastrar imagen sobre el marco); subida S3 como el selector de archivos. */
  onDesignerImageFrameImportFile?: (frameId: string, file: File) => void | Promise<void>;
  /** Imperative API ref for external object mutations (DesignerStudio ↔ FreehandStudio). */
  studioApiRef?: React.MutableRefObject<DesignerStudioApi | null>;
  /** Called when threaded text changes; `commit` marks the end of the inline edit session. */
  onDesignerTextFrameEdit?: (
    frameId: string,
    storyId: string,
    newText: string,
    richHtml?: string,
    phase?: "input" | "commit",
  ) => void;
  /** Called when user requests a threaded continuation frame from an overflowing text frame. */
  onDesignerAppendThreadedFrame?: (
    sourceFrameId: string,
    pendingEdit?: { plain: string; richHtml: string },
  ) => void;
  /** Serialized story content by storyId, for panel display. */
  designerStoryMap?: Map<string, string>;
  /** Rich HTML story content by storyId, for panel rich editor. */
  designerStoryHtmlMap?: Map<string, string>;
  /** Called when the full story text is changed from the panel textarea. */
  onDesignerStoryTextChange?: (storyId: string, newText: string) => void;
  /** Called when rich HTML story content changes from the panel editor. */
  onDesignerStoryRichChange?: (storyId: string, richHtml: string) => void;
  /** Called when user unlinks a text frame from its thread chain. */
  onDesignerUnlinkTextFrame?: (frameId: string) => void;
  /** Called when typography properties change on a text frame (to sync back to Story model). */
  onDesignerTypographyChange?: (storyId: string, patch: Record<string, unknown>) => void;
  /**
   * Designer: capture/restore full document state (pages, stories, textFrames) alongside canvas objects for undo.
   */
  designerHistoryBridge?: {
    capture: (canvasObjects: FreehandObject[]) => unknown;
    restore: (snap: unknown) => void;
  };
  /** Designer: shared clipboard across page switches (same ref for all FreehandStudio mounts). */
  designerClipboardRef?: React.MutableRefObject<FreehandObject[] | null>;
  /** Designer: página activa (para pegar en la misma posición al cambiar de página). */
  designerActivePageId?: string | null;
  /** Designer: id de la página donde se copió al portapapeles compartido (lo escribe FreehandStudio). */
  designerClipboardSourcePageIdRef?: React.MutableRefObject<string | null>;
  /** Designer: narrow page rail (~110px) rendered to the right of the properties panel. */
  designerPagesRail?: React.ReactNode;
  /** Designer: Ctrl/Cmd + ← / → para cambiar de página del documento. */
  onDesignerNavigatePage?: (delta: -1 | 1) => void;
  /** Designer: dirección de la animación horizontal al mostrar otra página (multipágina). */
  designerPageEnterDirection?: "next" | "prev" | null;
  /** Designer: bump to request fit-to-viewport after the active page canvas is shown (e.g. user picked a page). */
  designerFitToViewNonce?: number;
  /** Designer: modo P (lienzo a pantalla completa) vive en el padre para sobrevivir al remount al cambiar de página. */
  designerCanvasZenMode?: boolean;
  onDesignerCanvasZenModeChange?: (zen: boolean) => void;
  /** Designer: multipage vector PDF export (shown in Export modal). */
  designerMultipageVectorPdfExport?: {
    pageCount: number;
    busy: boolean;
    onExport: (opts: VectorPdfExportOptions) => void | Promise<void>;
  } | null;
  /** Designer: fichero autocontenido `.de` (documento + imágenes embebidas). */
  designerDeDocument?: {
    onExport: () => void | Promise<void>;
    onImport: () => void;
    busy?: boolean;
  } | null;
  /** Switch “Activar auto-optimización” junto a Export. */
  designerAutoOptimizeSwitch?: {
    enabled: boolean;
    onChange: (enabled: boolean) => void;
  };
  /** Progreso de auto-optimización; el HUD visual va dentro del marco (`activeFrameId`). */
  designerOptimizeProgress?: {
    visible: boolean;
    currentFileLabel: string;
    done: number;
    total: number;
    activeFrameId?: string | null;
  };
  /**
   * Designer: el padre (DesignerStudio) genera la miniatura de la 1.ª página al cerrar.
   * Si true, no se ejecuta el PNG automático del lienzo actual en `handleCloseStudio`.
   */
  designerSkipAutoNodeExportOnClose?: boolean;
  /** Telemetría Brain agnóstica del nodo (canvas Designer usa `nodeType: DESIGNER`). */
  designerBrainTelemetry?: BrainNodeTelemetryApi | null;
  /** Dataset conectado al nodo Designer en el grafo (handle `dataset`). */
  designerConnectedDataset?: Dataset | null;
  /** Cargando Dataset global referenciado por el nodo fuente. */
  designerConnectedDatasetLoading?: boolean;
  /** Fila del Dataset a usar en la página activa (0 = primera fila). */
  designerActivePageDatasetRowIndex?: number;
  /** Fija la fila del Dataset de la página activa (re-aplica los datos enlazados). */
  onDesignerSetActivePageRowIndex?: (rowIndex: number) => void;
  /**
   * Designer: captura multipágina en background (miniaturas rail / export).
   * Oculta el lienzo para evitar parpadeos al iterar páginas.
   */
  designerPageCaptureBusy?: boolean;
  designerPageCaptureProgress?: { done: number; total: number } | null;
  /** Designer: relleno generativo — selección multi-rect controlada por el padre. */
  designerGenerativeFill?: {
    selections: GenerativeFillRect[];
    onSelectionsChange: (next: GenerativeFillRect[]) => void;
  } | null;
};
