/**
 * Historial de versiones a nivel de celda imagen (Loop y regeneraciones).
 */

import type { FieldValue } from "./dataset-types";
import { isValueEmpty } from "./dataset-logic";

export const MAX_IMAGE_CELL_GENERATION_HISTORY = 5;

export interface ImageGenerationHistoryEntry {
  url: string;
  assetId: string;
  s3Key?: string;
  savedAt: string;
  source?: "loop" | "manual";
}

export type DatasetImageValue = Extract<FieldValue, { type: "image" }>;

function genAssetId(prefix = "img"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function isImageCellEmpty(value: FieldValue | undefined): boolean {
  if (!value || value.type !== "image") return true;
  return isValueEmpty(value);
}

export function imageCellCurrentUrl(value: FieldValue | undefined): string {
  if (!value || value.type !== "image") return "";
  return value.url?.trim() ?? "";
}

/** Escribe una imagen nueva en la celda, empujando la anterior al historial. */
export function writeImageCellValue(args: {
  current: FieldValue | undefined;
  url: string;
  assetId?: string;
  s3Key?: string;
  source?: ImageGenerationHistoryEntry["source"];
  maxHistory?: number;
}): DatasetImageValue {
  const { current, url, assetId, s3Key, source = "loop", maxHistory = MAX_IMAGE_CELL_GENERATION_HISTORY } =
    args;
  const trimmed = url.trim();
  const nextAssetId = assetId?.trim() || genAssetId();
  const savedAt = new Date().toISOString();

  if (!trimmed) {
    return { type: "image", assetId: "", url: "" };
  }

  const prev =
    current?.type === "image" && !isValueEmpty(current)
      ? {
          url: current.url,
          assetId: current.assetId || genAssetId(),
          s3Key: current.s3Key,
          savedAt: current.populatedAt ?? savedAt,
          source: current.generationHistory?.length
            ? ("loop" as const)
            : ("manual" as const),
        }
      : null;

  const history: ImageGenerationHistoryEntry[] =
    current?.type === "image" && Array.isArray(current.generationHistory)
      ? [...current.generationHistory]
      : [];

  if (prev && prev.url !== trimmed) {
    history.unshift(prev);
  }

  const trimmedHistory = history.slice(0, maxHistory);

  return {
    type: "image",
    assetId: nextAssetId,
    url: trimmed,
    s3Key,
    w: current?.type === "image" ? current.w : undefined,
    h: current?.type === "image" ? current.h : undefined,
    generationHistory: trimmedHistory.length > 0 ? trimmedHistory : undefined,
    populatedAt: savedAt,
  };
}

/** Restaura una entrada del historial como valor activo de la celda. */
export function restoreImageCellFromHistory(
  current: DatasetImageValue,
  historyIndex: number,
): DatasetImageValue {
  const history = current.generationHistory ?? [];
  const entry = history[historyIndex];
  if (!entry) return current;

  const nextHistory = [...history];
  nextHistory.splice(historyIndex, 1);

  const demoted: ImageGenerationHistoryEntry = {
    url: current.url,
    assetId: current.assetId,
    s3Key: current.s3Key,
    savedAt: current.populatedAt ?? new Date().toISOString(),
    source: "loop",
  };

  return {
    type: "image",
    assetId: entry.assetId,
    url: entry.url,
    s3Key: entry.s3Key,
    generationHistory: [demoted, ...nextHistory].slice(0, MAX_IMAGE_CELL_GENERATION_HISTORY),
    populatedAt: entry.savedAt,
  };
}
