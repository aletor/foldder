import type { FreehandObject } from "../FreehandStudio";
import { clipTelemetryAssetRef } from "../designer/designer-image-telemetry";
import type { BrainNodeTelemetryApi } from "@/lib/brain/brain-telemetry";
import type { PhotoroomTelemetryPayload, TelemetryEvent } from "@/lib/brain/brain-telemetry";
import type { TelemetryImageSource } from "@/lib/brain/brain-models";

export type PhotoroomImageTelemetryTrack = (event: Omit<TelemetryEvent, "ts"> & { ts?: string }) => void;

function hasLayerEffectsApplied(o: FreehandObject): boolean {
  const fx = (o as { layerEffects?: Record<string, unknown> | null }).layerEffects;
  if (!fx || typeof fx !== "object") return false;
  return Object.keys(fx).length > 0;
}

/** Conteos heurísticos para el resumen de exportación Photoroom. */
export function buildPhotoroomExportSummaryFromObjects(
  objects: FreehandObject[],
  exportFormat: string,
  width: number,
  height: number,
): PhotoroomTelemetryPayload {
  const visible = objects.filter((o) => o.visible !== false);
  let masksCount = 0;
  let stylesApplied = 0;
  let imagesUsed = 0;
  for (const o of visible) {
    if ((o as { layerMask?: unknown }).layerMask) masksCount += 1;
    if (hasLayerEffectsApplied(o)) stylesApplied += 1;
    if (o.type === "image") imagesUsed += 1;
    else if (o.type === "booleanGroup" && (o as { cachedResult?: string }).cachedResult) imagesUsed += 1;
  }
  return {
    exportFormat,
    exportWidth: Math.max(1, Math.round(width)),
    exportHeight: Math.max(1, Math.round(height)),
    layersCount: visible.length,
    masksCount,
    stylesApplied,
    imagesUsed,
    visualHints: {},
  };
}

export type PhotoroomImageBase = {
  source: TelemetryImageSource;
  canvasObjectId?: string;
  assetId?: string;
  assetRef?: string;
  fileName?: string;
  mimeType?: string;
  imageWidth: number;
  imageHeight: number;
};

export function trackPhotoroomImageImported(track: PhotoroomImageTelemetryTrack, base: PhotoroomImageBase): void {
  track({
    kind: "IMAGE_IMPORTED",
    source: base.source,
    canvasObjectId: base.canvasObjectId,
    assetId: base.assetId,
    assetRef: clipTelemetryAssetRef(base.assetRef),
    fileName: base.fileName,
    mimeType: base.mimeType,
    imageWidth: base.imageWidth,
    imageHeight: base.imageHeight,
    artifactType: "image",
    visualHints: {},
    photoroom: { visualHints: {} },
  });
}

export function trackPhotoroomImageUsed(track: PhotoroomImageTelemetryTrack, base: PhotoroomImageBase): void {
  track({
    kind: "IMAGE_USED",
    source: base.source,
    canvasObjectId: base.canvasObjectId,
    assetId: base.assetId,
    assetRef: clipTelemetryAssetRef(base.assetRef),
    fileName: base.fileName,
    mimeType: base.mimeType,
    imageWidth: base.imageWidth,
    imageHeight: base.imageHeight,
    artifactType: "image",
    visualHints: {},
    photoroom: { visualHints: {} },
  });
}

export function trackPhotoroomImageEdited(
  track: PhotoroomImageTelemetryTrack,
  partial: { canvasObjectId?: string; layerId?: string; maskId?: string; fileName?: string },
): void {
  track({
    kind: "IMAGE_EDITED",
    canvasObjectId: partial.canvasObjectId,
    layerId: partial.layerId,
    maskId: partial.maskId,
    fileName: partial.fileName,
    artifactType: "image",
    visualHints: {},
    photoroom: { visualHints: {} },
  });
}

export function trackPhotoroomMaskUsed(
  track: PhotoroomImageTelemetryTrack,
  partial: { canvasObjectId?: string; maskId?: string; layerId?: string },
): void {
  track({
    kind: "MASK_USED",
    canvasObjectId: partial.canvasObjectId,
    maskId: partial.maskId,
    layerId: partial.layerId,
    artifactType: "image",
    visualHints: {},
    photoroom: { maskUsed: true, visualHints: {} },
  });
}

export function trackPhotoroomLayerUsed(
  track: PhotoroomImageTelemetryTrack,
  partial: { canvasObjectId?: string; layerId?: string; fileName?: string },
): void {
  track({
    kind: "LAYER_USED",
    canvasObjectId: partial.canvasObjectId,
    layerId: partial.layerId,
    fileName: partial.fileName,
    artifactType: "image",
    visualHints: {},
    photoroom: { visualHints: {} },
  });
}

export function trackPhotoroomStyleApplied(
  track: PhotoroomImageTelemetryTrack,
  partial: { canvasObjectId?: string; layerId?: string; styleLabel?: string },
): void {
  track({
    kind: "STYLE_APPLIED",
    canvasObjectId: partial.canvasObjectId,
    layerId: partial.layerId,
    styleLabel: partial.styleLabel ?? "layer_effects",
    artifactType: "image",
    visualHints: {},
    photoroom: { visualHints: {} },
  });
}

function newExportId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `exp_${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Exportación significativa hacia el nodo o cierre con preview: IMAGE_EXPORTED + CONTENT_EXPORTED y flush.
 */
export async function emitPhotoroomExportToBrain(
  api: BrainNodeTelemetryApi,
  objects: FreehandObject[],
  opts: { exportFormat: string; width: number; height: number; fileName?: string },
): Promise<void> {
  const summary = buildPhotoroomExportSummaryFromObjects(objects, opts.exportFormat, opts.width, opts.height);
  const exportId = newExportId();
  api.track({
    kind: "IMAGE_EXPORTED",
    exportId,
    exportFormat: opts.exportFormat,
    fileName: opts.fileName,
    imageWidth: summary.exportWidth,
    imageHeight: summary.exportHeight,
    artifactType: "image",
    usedInExport: true,
    visualHints: {},
    photoroom: { ...summary, visualHints: {} },
  });
  api.track({
    kind: "CONTENT_EXPORTED",
    exportId,
    exportFormat: opts.exportFormat,
    artifactType: "image",
    usedInExport: true,
    visualHints: {},
    photoroom: { ...summary, visualHints: {} },
  });
  await api.flushTelemetry("export");
}
