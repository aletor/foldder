import type { CSSProperties } from "react";
import type { Node } from "@xyflow/react";

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
}): { width: number; height: number } {
  const chromeHeight = args.chromeHeight ?? DEFAULT_HEADER_HEIGHT;
  const safeContentWidth = Math.max(1, args.contentWidth);
  const safeContentHeight = Math.max(1, args.contentHeight);
  const contentRatio = safeContentWidth / safeContentHeight;
  const minBodyHeight = Math.max(1, args.minHeight - chromeHeight);
  const maxBodyHeight = Math.max(minBodyHeight, args.maxHeight - chromeHeight);
  const minWidthByHeight = minBodyHeight * contentRatio;
  const maxWidthByHeight = maxBodyHeight * contentRatio;
  const effectiveMinWidth = Math.max(args.minWidth, minWidthByHeight);
  const effectiveMaxWidth = Math.max(effectiveMinWidth, Math.min(args.maxWidth, maxWidthByHeight));
  const currentWidth = resolveNodeFrameWidth(args.node, effectiveMinWidth);
  const width = clamp(currentWidth, effectiveMinWidth, effectiveMaxWidth);
  const height = clamp(chromeHeight + width / contentRatio, args.minHeight, args.maxHeight);

  return {
    width: Math.round(width),
    height: Math.round(height),
  };
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

export function loadImageDimensions(imageUrl: string): Promise<{ width: number; height: number }> {
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
    image.src = imageUrl;
  });
}

export function resolveNodeChromeHeight(
  nodeElement: HTMLElement | null,
  previewElement: HTMLElement | null,
  fallback = DEFAULT_HEADER_HEIGHT,
): number {
  if (!nodeElement || !previewElement) return fallback;
  return Math.max(fallback, Math.round(nodeElement.offsetHeight - previewElement.offsetHeight));
}
