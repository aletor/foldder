import type { CSSProperties } from "react";
import type { Node } from "@xyflow/react";
import { fetchBlobViaSpacesProxy } from "@/lib/spaces-proxy-fetch";
import {
  resolveGridFrameFromAspectRatio,
} from "./canvas-grid-layout";

const DEFAULT_HEADER_HEIGHT = 30;

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function styleDimension(style: CSSProperties | undefined, key: "width" | "height"): number | null {
  const raw = style?.[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

export function resolveNodeFrameWidth(node: Pick<Node, "width" | "measured" | "style"> | undefined, fallback: number): number {
  return (
    toFiniteNumber(node?.width) ??
    toFiniteNumber(node?.measured?.width) ??
    styleDimension(node?.style, "width") ??
    fallback
  );
}

export function resolveNodeFrameHeight(node: Pick<Node, "height" | "measured" | "style"> | undefined): number | null {
  return (
    toFiniteNumber(node?.height) ??
    toFiniteNumber(node?.measured?.height) ??
    styleDimension(node?.style, "height")
  );
}

export function resolveAspectLockedNodeFrame(args: {
  node?: Pick<Node, "width" | "height" | "measured" | "style">;
  contentWidth: number;
  contentHeight: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  chromeHeight?: number;
  maxGridCols?: number;
  maxGridRows?: number;
  minGridCols?: number;
  minGridRows?: number;
}): { width: number; height: number } {
  const safeContentWidth = Math.max(1, args.contentWidth);
  const safeContentHeight = Math.max(1, args.contentHeight);
  const contentRatio = safeContentWidth / safeContentHeight;
  const chromeHeight = Math.max(0, Math.round(args.chromeHeight ?? DEFAULT_HEADER_HEIGHT));
  const frame = resolveGridFrameFromAspectRatio(contentRatio, {
    minCols: args.minGridCols ?? 1,
    minRows: args.minGridRows ?? 1,
    maxCols: args.maxGridCols ?? 5,
    maxRows: args.maxGridRows ?? 5,
  });

  let width = Math.round(frame.width);
  let contentAreaHeight = Math.round(width / contentRatio);
  let height = contentAreaHeight + chromeHeight;

  width = Math.max(args.minWidth, Math.min(args.maxWidth, width));
  contentAreaHeight = Math.round(width / contentRatio);
  height = contentAreaHeight + chromeHeight;

  if (height > args.maxHeight) {
    height = args.maxHeight;
    contentAreaHeight = Math.max(1, height - chromeHeight);
    width = Math.round(contentAreaHeight * contentRatio);
    width = Math.max(args.minWidth, Math.min(args.maxWidth, width));
    contentAreaHeight = Math.round(width / contentRatio);
    height = contentAreaHeight + chromeHeight;
  }
  if (height < args.minHeight) {
    height = args.minHeight;
    contentAreaHeight = Math.max(1, height - chromeHeight);
    width = Math.round(contentAreaHeight * contentRatio);
    width = Math.max(args.minWidth, Math.min(args.maxWidth, width));
    contentAreaHeight = Math.round(width / contentRatio);
    height = contentAreaHeight + chromeHeight;
  }

  return { width, height };
}

export function nodeFrameNeedsSync(
  node: Pick<Node, "width" | "height" | "measured" | "style"> | undefined,
  target: { width: number; height: number },
): boolean {
  const currentWidth = resolveNodeFrameWidth(node, target.width);
  const currentHeight = resolveNodeFrameHeight(node);
  return Math.abs(currentWidth - target.width) > 1 || currentHeight === null || Math.abs(currentHeight - target.height) > 1;
}

export function parseAspectRatioValue(value: string | null | undefined): { width: number; height: number } | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === "free") return null;
  const parts = trimmed.split(/[:/]/).map((part) => Number(part.trim()));
  if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
  const [width, height] = parts;
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

function isSameOriginClientUrl(imageUrl: string): boolean {
  if (typeof window === "undefined") return false;
  const trimmed = imageUrl.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return true;
  try {
    const resolved = new URL(trimmed, window.location.href);
    return resolved.origin === window.location.origin;
  } catch {
    return false;
  }
}

function isExternalHttpUrl(imageUrl: string): boolean {
  const trimmed = imageUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  return !isSameOriginClientUrl(trimmed);
}

function loadImageDimensionsFromSrc(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
    };
    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      cleanup();
      if (width > 0 && height > 0) resolve({ width, height });
      else reject(new Error("sin dimensiones de imagen"));
    };
    image.onerror = () => {
      cleanup();
      reject(new Error("no se pudo cargar la imagen"));
    };
    image.src = src;
  });
}

/** Mide dimensiones; URLs http(s) externas pasan por `/api/spaces/proxy` (CDNs como Pinterest bloquean carga directa). */
export async function loadImageDimensions(imageUrl: string): Promise<{ width: number; height: number }> {
  const trimmed = imageUrl.trim();
  if (!trimmed) throw new Error("no se pudo cargar la imagen");

  if (typeof window !== "undefined" && isExternalHttpUrl(trimmed)) {
    try {
      const blob = await fetchBlobViaSpacesProxy(trimmed);
      const objectUrl = URL.createObjectURL(blob);
      try {
        return await loadImageDimensionsFromSrc(objectUrl);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      /* algunos hosts permiten carga directa aunque el proxy falle */
    }
  }

  return loadImageDimensionsFromSrc(trimmed);
}

export function resolveNodeChromeHeight(
  nodeElement: HTMLElement | null,
  previewElement: HTMLElement | null,
  fallback = DEFAULT_HEADER_HEIGHT,
): number {
  if (!nodeElement || !previewElement) return fallback;
  return Math.max(fallback, Math.round(nodeElement.offsetHeight - previewElement.offsetHeight));
}
