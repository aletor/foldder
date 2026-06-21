import type { FreehandObject } from "../FreehandStudio";
import {
  cloneCompositionTransform,
  DEFAULT_COMPOSITION_TRANSFORM,
  type CompositionTransform,
  type VideoEditorComposition,
  type VideoEditorOverlayClip,
} from "./video-editor-composition-types";
import { getAllCompositionKeyframeTimes, normalizeComposition, resolveCompositionTransform } from "./video-editor-composition-math";

export type CompositionCropPreset = "fit" | "fill" | "custom";

function isDefaultTransform(transform: CompositionTransform): boolean {
  const d = DEFAULT_COMPOSITION_TRANSFORM;
  return (
    Math.abs(transform.x - d.x) < 0.001 &&
    Math.abs(transform.y - d.y) < 0.001 &&
    Math.abs(transform.width - d.width) < 0.001 &&
    Math.abs(transform.height - d.height) < 0.001 &&
    Math.abs(transform.crop.x - d.crop.x) < 0.001 &&
    Math.abs(transform.crop.y - d.crop.y) < 0.001 &&
    Math.abs(transform.crop.width - d.crop.width) < 0.001 &&
    Math.abs(transform.crop.height - d.crop.height) < 0.001
  );
}

export function compositionKeyframeTimes(composition?: VideoEditorComposition | null): number[] {
  return getAllCompositionKeyframeTimes(composition);
}

export function buildCompositionFfmpegFilter(
  frameWidth: number,
  frameHeight: number,
  transform: CompositionTransform,
  cropPreset: CompositionCropPreset = "fill",
): string {
  if (isDefaultTransform(transform)) {
    if (cropPreset === "fit") {
      return `scale=${frameWidth}:${frameHeight}:force_original_aspect_ratio=decrease,pad=${frameWidth}:${frameHeight}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=yuv420p`;
    }
    return `scale=${frameWidth}:${frameHeight}:force_original_aspect_ratio=increase,crop=${frameWidth}:${frameHeight},setsar=1,format=yuv420p`;
  }

  const crop = transform.crop;
  const boxW = Math.max(2, Math.round(transform.width * frameWidth));
  const boxH = Math.max(2, Math.round(transform.height * frameHeight));
  const boxX = Math.round(transform.x * frameWidth);
  const boxY = Math.round(transform.y * frameHeight);
  const aspect = cropPreset === "fit" ? "decrease" : "increase";

  const sourceCrop = [
    `crop=iw*${crop.width.toFixed(6)}:ih*${crop.height.toFixed(6)}:iw*${crop.x.toFixed(6)}:ih*${crop.y.toFixed(6)}`,
    `scale=${boxW}:${boxH}:force_original_aspect_ratio=${aspect}`,
    aspect === "increase" ? `crop=${boxW}:${boxH}` : "",
    `pad=${frameWidth}:${frameHeight}:${boxX}:${boxY}:black`,
    "setsar=1,format=yuv420p",
  ]
    .filter(Boolean)
    .join(",");

  return sourceCrop;
}

export function resolveClipCompositionTransform(
  composition: VideoEditorComposition | null | undefined,
  localTimeSeconds: number,
): CompositionTransform {
  return resolveCompositionTransform(composition, localTimeSeconds);
}

export function escapeFfmpegDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%");
}

function hexToFfmpegColor(hex: string, opacity = 1): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return `white@${opacity.toFixed(2)}`;
  return `0x${clean}@${Math.max(0, Math.min(1, opacity)).toFixed(2)}`;
}

function primaryFontFamily(fontFamily: string): string {
  const primary = fontFamily.split(",")[0]?.replace(/['"]/g, "").trim();
  return primary || "Inter";
}

function objectStrokeColor(stroke: unknown, fallback: string): string {
  if (!stroke || stroke === "none") return fallback;
  if (typeof stroke === "object" && "color" in stroke) {
    return String((stroke as { color?: string }).color ?? fallback);
  }
  return fallback;
}

function overlayObjectFilters(
  object: FreehandObject,
  transform: CompositionTransform,
  frameWidth: number,
  frameHeight: number,
): string[] {
  const x = Math.round(transform.x * frameWidth);
  const y = Math.round(transform.y * frameHeight);
  const w = Math.max(1, Math.round(transform.width * frameWidth));
  const h = Math.max(1, Math.round(transform.height * frameHeight));
  const opacity = Math.max(0, Math.min(1, transform.opacity * (object.opacity ?? 1)));

  if (object.type === "text") {
    const textObj = object as FreehandObject & {
      text?: string;
      fontFamily?: string;
      fontSize?: number;
      fontWeight?: number;
      fontStyle?: string;
      lineHeight?: number;
      textAlign?: string;
      fill?: { color?: string };
      stroke?: unknown;
      strokeWidth?: number;
    };
    const fontSize = Math.max(8, Math.round((textObj.fontSize ?? 48) * (h / Math.max(1, object.height))));
    const color = hexToFfmpegColor(textObj.fill?.color ?? "#ffffff", opacity);
    const text = escapeFfmpegDrawtext((textObj.text ?? "").slice(0, 500));
    if (!text) return [];
    const align = textObj.textAlign === "right" ? "right" : textObj.textAlign === "left" ? "left" : "center";
    const xPos = align === "center" ? x + Math.round(w / 2) : align === "right" ? x + w - 8 : x + 8;
    const lineSpacing = Math.round((textObj.lineHeight ?? 1.1) * fontSize);
    const font = primaryFontFamily(textObj.fontFamily ?? "Inter");
    const parts = [
      `drawtext=font='${font}'`,
      `text='${text}'`,
      `fontsize=${fontSize}`,
      `fontcolor=${color}`,
      `x=${xPos}`,
      `y=${y + Math.round(h * 0.2)}`,
      `line_spacing=${lineSpacing}`,
      `text_align=${align}`,
      "fix_bounds=1",
    ];
    if ((textObj.fontWeight ?? 400) >= 700) {
      parts.push("borderw=1", `bordercolor=${color}`);
    }
    if (textObj.strokeWidth && textObj.stroke !== "none") {
      parts.push(
        `borderw=${Math.max(1, Math.round(textObj.strokeWidth))}`,
        `bordercolor=${hexToFfmpegColor(objectStrokeColor(textObj.stroke, "#000000"), opacity)}`,
      );
    }
    return [parts.join(":")];
  }

  if (object.type === "rect") {
    const rectObj = object as FreehandObject & {
      fill?: { color?: string };
      stroke?: unknown;
      strokeWidth?: number;
    };
    const color = hexToFfmpegColor(rectObj.fill?.color ?? "#3a8f96", opacity);
    const filters = [`drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${color}:t=fill`];
    if (rectObj.strokeWidth && rectObj.stroke !== "none") {
      filters.push(
        `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${hexToFfmpegColor(objectStrokeColor(rectObj.stroke, "#ffffff"), opacity)}:t=${Math.max(1, Math.round(rectObj.strokeWidth))}`,
      );
    }
    return filters;
  }

  return [];
}

export function buildOverlayFiltersAtTime(
  overlays: VideoEditorOverlayClip[] | undefined,
  globalTimeSeconds: number,
  frameWidth: number,
  frameHeight: number,
): string {
  const active = (overlays ?? []).filter(
    (overlay) => globalTimeSeconds >= overlay.startTime && globalTimeSeconds < overlay.startTime + overlay.durationSeconds,
  );
  const sorted = [...active].sort((a, b) => (a.layerOrder ?? 0) - (b.layerOrder ?? 0));
  const filters = sorted.flatMap((overlay) => {
    const local = Math.max(0, globalTimeSeconds - overlay.startTime);
    const transform = resolveCompositionTransform(overlay.composition, local);
    return overlayObjectFilters(overlay.object, transform, frameWidth, frameHeight);
  });
  return filters.join(",");
}

export function mergeCompositionCutPoints(
  clipStartTime: number,
  clipDuration: number,
  composition?: VideoEditorComposition | null,
): number[] {
  const end = clipStartTime + Math.max(0.1, clipDuration);
  const points = new Set<number>([clipStartTime, end]);
  for (const time of compositionKeyframeTimes(composition)) {
    const absolute = clipStartTime + time;
    if (absolute > clipStartTime + 0.02 && absolute < end - 0.02) points.add(absolute);
  }
  return Array.from(points).sort((a, b) => a - b);
}

export function cloneRenderTransform(transform: CompositionTransform): CompositionTransform {
  return cloneCompositionTransform(transform);
}
