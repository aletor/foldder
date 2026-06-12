import type { CSSProperties } from "react";
import type { Node, XYPosition } from "@xyflow/react";
import { defaultDataForCanvasDropNode } from "@/lib/canvas-connect-end-drop";
import { applyNodeGridPreset, getNodeGridFrameForType, snapPositionToGrid } from "./canvas-grid-layout";

export const FOLDDER_LIBRARY_PREVIEW_NODE_ID = "__foldder_library_preview__";

export function isFoldderLibraryPreviewData(data: unknown): boolean {
  return Boolean(
    data &&
      typeof data === "object" &&
      (data as Record<string, unknown>)._foldderLibraryPreview === true,
  );
}

function parseStyleDimension(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/px/gi, "").trim());
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

/** Misma resolución de tamaño que al soltar el nodo en el lienzo. */
export function resolveLibraryPreviewNodeFrame(
  nodeType: string,
  data?: Record<string, unknown>,
  baseStyle?: CSSProperties,
): { width: number; height: number; style: CSSProperties; data: Record<string, unknown> } {
  const nodeData = data ?? defaultDataForCanvasDropNode(nodeType);
  const prepared = applyNodeGridPreset({
    type: nodeType,
    data: nodeData,
    style: baseStyle ?? {},
    position: { x: 0, y: 0 },
  } as Node);
  const nextStyle = (prepared.style ?? {}) as CSSProperties;
  const fallback = getNodeGridFrameForType(nodeType, prepared.data);
  const width = parseStyleDimension(nextStyle.width) ?? fallback?.width ?? 280;
  const height = parseStyleDimension(nextStyle.height) ?? fallback?.height ?? 240;
  return {
    width,
    height,
    style: { ...nextStyle, width, height },
    data: (prepared.data ?? nodeData) as Record<string, unknown>,
  };
}

/** Ghost de arrastre con la proporción final del nodo (no el tile cuadrado del sidebar). */
export function setLibraryDragPreviewImage(
  event: React.DragEvent,
  nodeType: string,
  options?: { backgroundImage?: string },
) {
  if (typeof document === "undefined") return;

  const { width, height } = resolveLibraryPreviewNodeFrame(nodeType);
  const maxPx = 96;
  const scale = Math.min(maxPx / width, maxPx / height);
  const w = Math.max(40, Math.round(width * scale));
  const h = Math.max(32, Math.round(height * scale));

  const ghost = document.createElement("div");
  ghost.style.position = "fixed";
  ghost.style.top = "-9999px";
  ghost.style.left = "-9999px";
  ghost.style.width = `${w}px`;
  ghost.style.height = `${h}px`;
  ghost.style.borderRadius = "0";
  ghost.style.overflow = "hidden";
  ghost.style.opacity = "0.94";
  ghost.style.pointerEvents = "none";
  ghost.style.boxShadow = "0 12px 28px rgba(0, 0, 0, 0.35)";
  ghost.style.backgroundColor = "#111827";
  if (options?.backgroundImage) {
    ghost.style.backgroundImage = `url(${options.backgroundImage})`;
    ghost.style.backgroundSize = "cover";
    ghost.style.backgroundPosition = "center";
    ghost.style.backgroundRepeat = "no-repeat";
  }

  document.body.appendChild(ghost);
  event.dataTransfer.setDragImage(ghost, Math.round(w / 2), Math.round(h / 2));
  requestAnimationFrame(() => {
    ghost.remove();
  });
}

/** @deprecated Usa setLibraryDragPreviewImage */
export function hideNativeLibraryDragPreview(event: React.DragEvent) {
  setLibraryDragPreviewImage(event, "promptInput");
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
  data?: Record<string, unknown>,
): XYPosition {
  const { width, height } = resolveLibraryPreviewNodeFrame(nodeType, data);
  return snapPositionToGrid({
    x: flowPoint.x - width / 2,
    y: flowPoint.y - height / 2,
  });
}

/** Ancho de la franja en px (dentro y fuera del lienzo) que activa auto-pan al arrastrar. */
export const LIBRARY_DRAG_EDGE_PAN_ZONE_PX = 200;

/** Velocidad máxima de pan en px de pantalla por frame (~60fps). */
export const LIBRARY_DRAG_EDGE_PAN_MAX_SPEED_PX = 16;

function edgePanStrength(clientCoord: number, edgeCoord: number): number {
  const zone = LIBRARY_DRAG_EDGE_PAN_ZONE_PX;
  return Math.min(1, Math.max(0, (zone - (clientCoord - edgeCoord)) / zone));
}

/** Delta de viewport (px pantalla) según proximidad del cursor a cada borde del lienzo. */
export function libraryDragEdgePanDelta(
  clientX: number,
  clientY: number,
  canvasRect: DOMRect,
): { x: number; y: number } {
  const maxSpeed = LIBRARY_DRAG_EDGE_PAN_MAX_SPEED_PX;
  const panX =
    edgePanStrength(clientX, canvasRect.left) * maxSpeed -
    edgePanStrength(canvasRect.right, clientX) * maxSpeed;
  const panY =
    edgePanStrength(clientY, canvasRect.top) * maxSpeed -
    edgePanStrength(canvasRect.bottom, clientY) * maxSpeed;
  return { x: panX, y: panY };
}

export function getReactFlowCanvasRect(root?: ParentNode | null): DOMRect | null {
  if (typeof document === "undefined") return null;
  const host =
    root instanceof HTMLElement || root instanceof DocumentFragment
      ? root
      : document;
  const canvas = host.querySelector?.(".react-flow");
  if (!(canvas instanceof HTMLElement)) return null;
  return canvas.getBoundingClientRect();
}
