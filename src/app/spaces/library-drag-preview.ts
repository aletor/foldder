import type { XYPosition } from "@xyflow/react";
import { getNodeGridFrameForType, snapPositionToGrid } from "./canvas-grid-layout";

export const FOLDDER_LIBRARY_PREVIEW_NODE_ID = "__foldder_library_preview__";

export function isFoldderLibraryPreviewData(data: unknown): boolean {
  return Boolean(
    data &&
      typeof data === "object" &&
      (data as Record<string, unknown>)._foldderLibraryPreview === true,
  );
}

let emptyDragGhostEl: HTMLDivElement | null = null;

function getEmptyDragGhostEl(): HTMLDivElement | null {
  if (typeof document === "undefined") return null;
  if (!emptyDragGhostEl) {
    emptyDragGhostEl = document.createElement("div");
    emptyDragGhostEl.style.cssText =
      "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";
    document.body.appendChild(emptyDragGhostEl);
  }
  return emptyDragGhostEl;
}

/** Oculta el ghost nativo del navegador (tile del sidebar) durante el arrastre. */
export function hideNativeLibraryDragPreview(event: React.DragEvent) {
  const ghost = getEmptyDragGhostEl();
  if (ghost) {
    event.dataTransfer.setDragImage(ghost, 0, 0);
  }
}

/** True si el cursor está sobre el contenedor `.react-flow` del lienzo. */
export function isClientPointOverReactFlowCanvas(
  clientX: number,
  clientY: number,
  root?: ParentNode | null,
): boolean {
  if (typeof document === "undefined") return false;
  const host =
    root instanceof HTMLElement || root instanceof DocumentFragment
      ? root
      : document;
  const canvas = host.querySelector?.(".react-flow");
  if (!(canvas instanceof HTMLElement)) return false;
  const rect = canvas.getBoundingClientRect();
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

/** Posición top-left del nodo preview: centrado en el cursor y snap al grid del lienzo. */
export function libraryPreviewPositionFromFlowPoint(
  flowPoint: XYPosition,
  nodeType: string,
): XYPosition {
  const frame = getNodeGridFrameForType(nodeType);
  const width = frame?.width ?? 280;
  const height = frame?.height ?? 240;
  return snapPositionToGrid({
    x: flowPoint.x - width / 2,
    y: flowPoint.y - height / 2,
  });
}
