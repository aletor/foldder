"use client";

/* eslint-disable @next/next/no-img-element */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NodeProps, Position, useEdges, useNodes, useReactFlow, type Node } from "@xyflow/react";
import {
  Archive,
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  Clock3,
  History,
  ImageIcon,
  Layers3,
  Maximize2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useSession } from "next-auth/react";
import {
  addCorrection,
  clearAdvancedImageGlobalAdjustment,
  createAdvancedImageSession,
  editCorrection,
  isAdvancedImageGlobalAdjustmentPending,
  markAdvancedImageCorrectionRuntime,
  promoteToMaster,
  removeCorrection,
  restoreAdvancedImageHistorySnapshot,
  stableHash,
  setAdvancedImageWorkingImage,
  toggleCorrection,
  updateAdvancedImageGlobalAdjustment,
  type AdvancedImageCorrection,
  type AdvancedImageGenerationSettings,
  type AdvancedImageHistorySnapshot,
  type AdvancedImageMaster,
  type AdvancedImagePoint,
  type AdvancedImageSession,
  type AdvancedImageUserReferenceGrid,
  type AdvancedImageWorkingImage,
  type AdvancedImageZone,
} from "@/lib/advanced-image/domain";
import {
  executeAdvancedImageIdentityAnalysis,
  type AdvancedImageCropExtractor,
  type AdvancedImageIdentityDescriptionTransport,
} from "@/lib/advanced-image/analysis";
import { createAdvancedImageMemoryCacheStore, readAdvancedImageGeminiRawCache } from "@/lib/advanced-image/cache";
import {
  AdvancedImageClientGenerationError,
  runAdvancedImageClientGeneration,
  type AdvancedImageClientGenerationResult,
} from "@/lib/advanced-image/client-orchestrator";
import type { AdvancedImageGeminiTransport } from "@/lib/advanced-image/gemini-adapter";
import { createZoneFromStrokes } from "@/lib/advanced-image/mask";
import { buildAdvancedImageGenerationPlan, getAdvancedImagePendingCorrectionIds } from "@/lib/advanced-image/pipeline";
import { createAdvancedImageSessionSnapshot } from "@/lib/advanced-image/persistence";
import {
  canvasToMasterPoint,
  computeContainedImageRect,
  computePointsBox,
  isValidClosedLasso,
  masterBoxToCanvasBox,
  type AdvancedImageRenderedRect,
} from "@/lib/advanced-image/canvas-coordinate";
import { geminiGenerateWithServerProgress } from "@/lib/gemini-generate-stream-client";
import { createImageGrid, hashBlobSha256, resolveImageGridLayout } from "@/lib/shared/image-grid";
import { runAiJobWithNotification } from "@/lib/ai-job-notifications";
import { uploadProjectMediaFile } from "../project-media-s3-save";
import { useProjectAssetsCanvas } from "../project-assets-canvas-context";
import { FoldderDataHandle } from "../FoldderDataHandle";
import { NodeIcon, resolveFoldderNodeState } from "../foldder-icons";
import { FoldderNodeHeaderTitle, FoldderStudioModeCenterButton, NodeLabel } from "../foldder-node-ui";
import { resolvePromptValueFromEdgeSource } from "../canvas-group-logic";
import { StudioNodePortal } from "../studio-node/studio-node-architecture";

type ImageCreationAdvancedNodeData = {
  advancedSession?: AdvancedImageSession;
  error?: string;
  label?: string;
  lastPlanHash?: string;
  status?: "empty" | "ready" | "editing" | "plan_ready" | "output" | "error";
  type?: "image";
  value?: string;
  warning?: string;
};

const advancedImageStudioCache = createAdvancedImageMemoryCacheStore();

type LocalReferencePreview = {
  file: File;
  id: string;
  objectUrl: string;
};

const DEFAULT_SETTINGS: AdvancedImageGenerationSettings = {
  analysisModel: "gemini-2.5-flash",
  cropMaxSide: 768,
  driftThreshold: 0.22,
  maxReferenceImages: 8,
  model: "gemini-3-pro-image-preview",
  promptVersion: "advanced-image-prompt-v1",
  resolution: "4k",
};

function firstImageUrlFromNode(node: Node | undefined): string {
  const data = node?.data as Record<string, unknown> | undefined;
  const value = typeof data?.value === "string" ? data.value : "";
  if (value) return value;
  const url = typeof data?.url === "string" ? data.url : "";
  return url;
}

function compactText(value: string, max = 180): string {
  const s = value.trim().replace(/\s+/g, " ");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function formatHistoryTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
}

function createMasterFromImage(imageUrl: string, size: { height: number; width: number }, timestamp: string): AdvancedImageMaster {
  return {
    contentHash: stableHash({ imageUrl, size }),
    createdAt: timestamp,
    height: size.height,
    id: `master-${stableHash({ imageUrl, timestamp }).slice(0, 12)}`,
    imageUrl,
    sourceModel: "input-image",
    sourceResolution: `${size.width}x${size.height}`,
    width: size.width,
  };
}

function safeSessionForNodeData(session: AdvancedImageSession): AdvancedImageSession {
  return createAdvancedImageSessionSnapshot(session, { includeUndoRedo: true });
}

function modelLabelForConfirm(model: string): string {
  if (model === "pro3") return "gemini-3-pro-image-preview";
  if (model === "flash31") return "gemini-3.1-flash-image-preview";
  if (model === "flash25") return "gemini-2.5-flash-image";
  return model;
}

function modelKeyForGeminiEndpoint(model: string): string {
  const normalized = model.trim().toLowerCase();
  if (normalized === "gemini-3-pro-image-preview") return "pro3";
  if (normalized === "gemini-3.1-flash-image-preview") return "flash31";
  if (normalized === "gemini-2.5-flash-image") return "flash25";
  return model;
}

function aspectRatioFromMaster(master: AdvancedImageMaster): string {
  const ratio = master.width / Math.max(1, master.height);
  if (ratio > 1.65) return "16:9";
  if (ratio < 0.72) return "9:16";
  if (ratio > 1.2) return "4:3";
  if (ratio < 0.9) return "3:4";
  return "1:1";
}

type AdvancedImageCorrectionViewState = "applied" | "inactive" | "pending";
type AdvancedImagePanelSection = "pending" | "previous" | "recent";

function correctionViewState(correction: AdvancedImageCorrection, session: AdvancedImageSession): AdvancedImageCorrectionViewState {
  if (correction.status === "inactive") return "inactive";
  const working = session.workingImage;
  if (!working?.activeCorrectionIds.includes(correction.id)) return "pending";
  const snapshot = working.correctionSnapshots?.[correction.id];
  if (!snapshot) return "applied";
  return snapshot.geometryHash === correction.geometryHash &&
    snapshot.instructionHash === correction.instructionHash &&
    snapshot.referenceHash === correction.referenceHash
    ? "applied"
    : "pending";
}

function correctionViewLabel(state: AdvancedImageCorrectionViewState): string {
  if (state === "applied") return "APPLIED";
  if (state === "inactive") return "INACTIVE";
  return "PENDING";
}

function correctionBadgeClass(state: AdvancedImageCorrectionViewState): string {
  if (state === "applied") return "bg-sky-300/12 text-sky-100";
  if (state === "inactive") return "bg-zinc-500/12 text-zinc-400";
  return "bg-amber-300/12 text-amber-100";
}

function correctionBatchNumber(correction: AdvancedImageCorrection): number | undefined {
  return correction.appliedBatchNumber ?? undefined;
}

function correctionCardTone(state: AdvancedImageCorrectionViewState, section: AdvancedImagePanelSection): string {
  if (state === "inactive") return "border-zinc-500/20 bg-white/[0.025] opacity-60";
  if (section === "pending") return "border-dashed border-amber-200/35 bg-amber-300/[0.055]";
  return "border-white/[0.08] bg-white/[0.045]";
}

function zonePolygonPoints(points: AdvancedImagePoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function primaryZonePoints(correction: AdvancedImageCorrection): AdvancedImagePoint[] {
  return correction.zone.strokes.find((stroke) => stroke.points.length > 0)?.points ?? [];
}

function revokeReferencePreviews(previews: LocalReferencePreview[]): void {
  for (const preview of previews) {
    URL.revokeObjectURL(preview.objectUrl);
  }
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function gridUrlFromReference(reference?: AdvancedImageUserReferenceGrid): string {
  return reference?.gridImageUrlStable || reference?.gridImageUrl || "";
}

function extensionForGridMime(mimeType: string): "jpg" | "png" {
  return mimeType === "image/png" ? "png" : "jpg";
}

function truncateForLog(value: string, max = 50): string {
  const text = value.trim().replace(/\s+/g, " ");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function globalAdjustmentPendingLabel(session: AdvancedImageSession | undefined): boolean {
  return session ? isAdvancedImageGlobalAdjustmentPending(session) : false;
}

function createImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load working image for identity crop."));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("Could not create crop blob."));
      else resolve(blob);
    }, type, quality);
  });
}

function averageCanvasHash(canvas: HTMLCanvasElement): string {
  const sample = document.createElement("canvas");
  sample.width = 8;
  sample.height = 8;
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  if (!ctx) return stableHash({ width: canvas.width, height: canvas.height });
  ctx.drawImage(canvas, 0, 0, 8, 8);
  const pixels = ctx.getImageData(0, 0, 8, 8).data;
  const values: number[] = [];
  for (let i = 0; i < pixels.length; i += 4) {
    values.push((pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3);
  }
  const avg = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  return values.map((value) => (value >= avg ? "1" : "0")).join("");
}

const ZONE_LOCATION_ANALYSIS_PALETTE = [
  { name: "azul", hex: "#2563eb" },
  { name: "rojo", hex: "#ef4444" },
  { name: "verde", hex: "#22c55e" },
  { name: "amarillo", hex: "#eab308" },
  { name: "magenta", hex: "#ec4899" },
  { name: "cian", hex: "#06b6d4" },
  { name: "naranja", hex: "#f97316" },
  { name: "violeta", hex: "#8b5cf6" },
  { name: "lima", hex: "#84cc16" },
  { name: "rosa", hex: "#f472b6" },
  { name: "indigo", hex: "#6366f1" },
  { name: "turquesa", hex: "#14b8a6" },
];

const advancedImageZoneLocationCache = new Map<string, string>();

type AdvancedImageZoneAnalysisTarget = {
  analysisHash: string;
  color: { hex: string; name: string };
  correction: AdvancedImageCorrection;
};

function computeZoneLocationAnalysisHash(session: AdvancedImageSession, correction: AdvancedImageCorrection): string {
  return stableHash({
    geometryHash: correction.geometryHash,
    instructionHash: correction.instructionHash,
    masterContentHash: session.master.contentHash,
    referenceHash: correction.referenceHash ?? null,
    v: 1,
  });
}

function isGenericAdvancedZoneLocation(description: string): boolean {
  return /^(small|medium|large)\s+(upper|middle|lower)-(left|center|right)\s+region$/i.test(description.trim());
}

function shouldAnalyzeZoneLocation(
  session: AdvancedImageSession,
  correction: AdvancedImageCorrection,
  pendingIds: Set<string>,
): boolean {
  if (correction.status !== "active") return false;
  if (!correction.zone.strokes.some((stroke) => stroke.points.length > 0)) return false;
  const analysisHash = computeZoneLocationAnalysisHash(session, correction);
  if (correction.zone.locationAnalysisHash === analysisHash && !isGenericAdvancedZoneLocation(correction.zone.locationDescription)) {
    return false;
  }
  return pendingIds.has(correction.id) || isGenericAdvancedZoneLocation(correction.zone.locationDescription);
}

function zoneLocationFallbackDescription(correction: AdvancedImageCorrection): string {
  const box = correction.zone.normalizedBBox;
  const cx = Math.round((box.x + box.width / 2) * 100);
  const cy = Math.round((box.y + box.height / 2) * 100);
  const x1 = Math.round(box.x * 100);
  const y1 = Math.round(box.y * 100);
  const x2 = Math.round((box.x + box.width) * 100);
  const y2 = Math.round((box.y + box.height) * 100);
  const areaPct = Math.round(correction.zone.areaRatio * 1000) / 10;
  const row = cy < 33 ? "upper" : cy > 66 ? "lower" : "central";
  const col = cx < 33 ? "left" : cx > 66 ? "right" : "central";
  const quadrant = row === "central" && col === "central" ? "center of the image" : `${row}-${col} third of the frame`;
  const size = areaPct < 3 ? "very small" : areaPct < 10 ? "small" : areaPct < 30 ? "medium" : "large";
  return `selected ${size} region in the ${quadrant}; centroid ~${cx}% from the left and ~${cy}% from the top; bbox ${x1}%-${x2}% horizontal, ${y1}%-${y2}% vertical; ~${areaPct}% of the image`;
}

function drawAdvancedZoneMask(
  ctx: CanvasRenderingContext2D,
  zone: AdvancedImageZone,
  canvasSize: { height: number; width: number },
  color: string,
): void {
  const scaleX = canvasSize.width / Math.max(1, zone.sourceSize.width);
  const scaleY = canvasSize.height / Math.max(1, zone.sourceSize.height);
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of zone.strokes) {
    const points = stroke.points;
    if (points.length === 0) continue;
    ctx.beginPath();
    ctx.moveTo(points[0].x * scaleX, points[0].y * scaleY);
    for (const point of points.slice(1)) {
      ctx.lineTo(point.x * scaleX, point.y * scaleY);
    }
    if (stroke.closed && points.length >= 3) {
      ctx.closePath();
      ctx.globalAlpha = 1;
      ctx.fill();
    } else {
      ctx.lineWidth = Math.max(2, stroke.radius * Math.max(scaleX, scaleY) * 2);
      ctx.globalAlpha = stroke.opacity ?? 1;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function createZoneMaskDataUrl(zone: AdvancedImageZone, targetSize: { height: number; width: number }): string {
  const canvas = document.createElement("canvas");
  canvas.width = targetSize.width;
  canvas.height = targetSize.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawAdvancedZoneMask(ctx, zone, targetSize, "#ffffff");
  return canvas.toDataURL("image/png");
}

function createZoneColorMapDataUrl(targets: AdvancedImageZoneAnalysisTarget[], master: AdvancedImageMaster): string {
  const maxSide = 960;
  const scale = Math.min(1, maxSide / Math.max(master.width, master.height));
  const size = {
    height: Math.max(1, Math.round(master.height * scale)),
    width: Math.max(1, Math.round(master.width * scale)),
  };
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const target of targets) {
    drawAdvancedZoneMask(ctx, target.correction.zone, size, target.color.hex);
  }
  return canvas.toDataURL("image/png");
}

function spatialPayloadForZone(correction: AdvancedImageCorrection): {
  areaPct: number;
  bboxX1: number;
  bboxX2: number;
  bboxY1: number;
  bboxY2: number;
  posX: number;
  posY: number;
  quadrant: string;
} {
  const box = correction.zone.normalizedBBox;
  const posX = Math.round((box.x + box.width / 2) * 100);
  const posY = Math.round((box.y + box.height / 2) * 100);
  const row = posY < 33 ? "tercio superior" : posY > 66 ? "tercio inferior" : "zona central";
  const col = posX < 33 ? "izquierda" : posX > 66 ? "derecha" : "centro";
  return {
    areaPct: Math.round(correction.zone.areaRatio * 1000) / 10,
    bboxX1: Math.round(box.x * 100),
    bboxX2: Math.round((box.x + box.width) * 100),
    bboxY1: Math.round(box.y * 100),
    bboxY2: Math.round((box.y + box.height) * 100),
    posX,
    posY,
    quadrant: col === "centro" && row === "zona central" ? "centro de la imagen" : `${row}-${col}`,
  };
}

function extractAnalyzedZoneDescription(prompt: string, colorName: string, correction: AdvancedImageCorrection): string {
  const lowerColor = colorName.toLowerCase();
  const lines = prompt
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/SALIDA DEL MODELO|NO debe reproducir|Devuelve SOLO|REFERENCIA 1|REFERENCIA 2:/i.test(line));
  const matchIndex = lines.findIndex((line) => {
    const lower = line.toLowerCase();
    return lower.includes(`trazo ${lowerColor}`) || lower.includes(`[${lowerColor}]`) || lower.includes(` ${lowerColor} `);
  });
  if (matchIndex < 0) return zoneLocationFallbackDescription(correction);
  const raw = [lines[matchIndex], lines[matchIndex + 1] ?? ""]
    .join(" ")
    .replace(/^[-•]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  const cleaned = raw
    .replace(new RegExp(`en la zona del trazo\\s+${lowerColor}\\s+en\\s+(?:REF|REFERENCIA)\\s*2`, "gi"), "in the selected marked area")
    .replace(/(?:REF|REFERENCIA)\s*2/gi, "the selected marked area")
    .replace(/trazo/gi, "marked area")
    .replace(/REFERENCIA\s*3/gi, "the visual reference grid")
    .trim();
  return compactText(`Analyzed location: ${cleaned}`, 520);
}

async function analyzeAdvancedImageZoneLocations(
  session: AdvancedImageSession,
  batchPendingIds: string[],
): Promise<{ analyzedCount: number; session: AdvancedImageSession }> {
  const pendingIdSet = new Set(batchPendingIds);
  if (pendingIdSet.size === 0) return { analyzedCount: 0, session };
  const activeCorrections = session.corrections.filter((correction) => correction.status === "active");
  const targets = activeCorrections
    .filter((correction) => shouldAnalyzeZoneLocation(session, correction, pendingIdSet))
    .map((correction, index) => ({
      analysisHash: computeZoneLocationAnalysisHash(session, correction),
      color: ZONE_LOCATION_ANALYSIS_PALETTE[index % ZONE_LOCATION_ANALYSIS_PALETTE.length],
      correction,
    }));
  if (targets.length === 0) return { analyzedCount: 0, session };

  const cachedDescriptions = new Map<string, string>();
  const missingTargets: AdvancedImageZoneAnalysisTarget[] = [];
  const fallbackCorrectionIds = new Set<string>();
  for (const target of targets) {
    const cached = advancedImageZoneLocationCache.get(target.analysisHash);
    if (cached) cachedDescriptions.set(target.correction.id, cached);
    else missingTargets.push(target);
  }

  const fetchedDescriptions = new Map<string, string>();
  if (missingTargets.length > 0) {
    const colorMapImage = createZoneColorMapDataUrl(missingTargets, session.master);
    const maxSide = 960;
    const scale = Math.min(1, maxSide / Math.max(session.master.width, session.master.height));
    const maskSize = {
      height: Math.max(1, Math.round(session.master.height * scale)),
      width: Math.max(1, Math.round(session.master.width * scale)),
    };
    try {
      const response = await fetch("/api/gemini/analyze-areas", {
        body: JSON.stringify({
          baseImage: session.master.imageUrl,
          changes: missingTargets.map((target) => {
            const spatial = spatialPayloadForZone(target.correction);
            return {
              assignedColorHex: target.color.hex,
              areaPct: spatial.areaPct,
              bboxX1: spatial.bboxX1,
              bboxX2: spatial.bboxX2,
              bboxY1: spatial.bboxY1,
              bboxY2: spatial.bboxY2,
              color: target.color.name,
              description: target.correction.userInstruction,
              isGlobal: false,
              paintData: createZoneMaskDataUrl(target.correction.zone, maskSize),
              posX: spatial.posX,
              posY: spatial.posY,
              quadrant: spatial.quadrant,
              referenceImageData: null,
            };
          }),
          colorMapImage,
          colorMapImageKind: "abstract-map",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || typeof json?.prompt !== "string") {
        throw new Error(typeof json?.error === "string" ? json.error : `Zone analysis failed (${response.status}).`);
      }
      for (const target of missingTargets) {
        const description = extractAnalyzedZoneDescription(json.prompt, target.color.name, target.correction);
        fetchedDescriptions.set(target.correction.id, description);
        advancedImageZoneLocationCache.set(target.analysisHash, description);
      }
      console.info("[ImageCreationAdvanced zone-analysis] success", {
        analyzedCount: missingTargets.length,
        correctionIds: missingTargets.map((target) => target.correction.id),
      });
    } catch (error) {
      console.warn("[ImageCreationAdvanced zone-analysis] fallback", {
        correctionIds: missingTargets.map((target) => target.correction.id),
        error: error instanceof Error ? error.message : String(error),
      });
      for (const target of missingTargets) {
        const description = zoneLocationFallbackDescription(target.correction);
        fallbackCorrectionIds.add(target.correction.id);
        fetchedDescriptions.set(target.correction.id, description);
        advancedImageZoneLocationCache.set(target.analysisHash, description);
      }
    }
  }

  const descriptionByCorrectionId = new Map([...cachedDescriptions, ...fetchedDescriptions]);
  let changed = false;
  const corrections = session.corrections.map((correction) => {
    const description = descriptionByCorrectionId.get(correction.id);
    if (!description) return correction;
    const analysisHash = computeZoneLocationAnalysisHash(session, correction);
    if (
      correction.zone.locationDescription === description &&
      correction.zone.locationAnalysisHash === analysisHash
    ) {
      return correction;
    }
    changed = true;
    return {
      ...correction,
      zone: {
        ...correction.zone,
        locationAnalysisHash: analysisHash,
        locationAnalysisSource: fallbackCorrectionIds.has(correction.id) ? "fallback" as const : "analyze-areas" as const,
        locationDescription: description,
      },
    };
  });

  return changed
    ? {
        analyzedCount: descriptionByCorrectionId.size,
        session: {
          ...session,
          corrections,
          updatedAt: new Date().toISOString(),
        },
      }
    : { analyzedCount: 0, session };
}

async function createAndUploadCorrectionReferenceGrid(args: {
  correctionId: string;
  nodeId: string;
  projectId: string | null;
  references: LocalReferencePreview[];
  timestamp: string;
}): Promise<AdvancedImageUserReferenceGrid | undefined> {
  if (args.references.length === 0) return undefined;
  const selected = args.references.slice(0, 16);
  const grid = await createImageGrid(selected.map((reference) => ({ mimeType: reference.file.type, src: reference.objectUrl })));
  const gridHash = await hashBlobSha256(grid.blob);
  const ext = extensionForGridMime(grid.blob.type || grid.layout.mimeType);
  const safeNodeId = args.nodeId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const mediaId = `advanced_image_${safeNodeId}_${args.correctionId}_${Date.now()}_${gridHash.slice(-8)}`;
  const file = new File([grid.blob], `${mediaId}.${ext}`, { type: grid.blob.type || grid.layout.mimeType });
  const uploaded = await uploadProjectMediaFile(file, {
    mediaId,
    policy: { preserveImageQuality: true },
    projectId: args.projectId,
  });
  return {
    createdAt: args.timestamp,
    gridHash,
    gridImageUrl: uploaded.url,
    gridImageUrlStable: uploaded.url,
    gridS3Key: uploaded.s3Key,
    id: `refgrid-${args.correctionId}-${gridHash.slice(-10)}`,
    layout: {
      borderPx: grid.layout.borderPx,
      cellSize: grid.layout.cellSize,
      columns: grid.layout.columns,
      discardedImageCount: grid.layout.discardedImageCount,
      height: grid.layout.height,
      mimeType: grid.layout.mimeType,
      rows: grid.layout.rows,
      usedImageCount: grid.layout.usedImageCount,
      width: grid.layout.width,
    },
    sourceImageCount: grid.layout.usedImageCount,
  };
}

function createStreamGeminiTransport(args: {
  aspectRatio: string;
  onProgress: (progress: number, stage: string) => void;
}): AdvancedImageGeminiTransport {
  return async (payload) => {
    const result = await geminiGenerateWithServerProgress(
      {
        prompt: payload.prompt,
        images: payload.imageInputs,
        aspect_ratio: args.aspectRatio,
        resolution: payload.resolution,
        model: modelKeyForGeminiEndpoint(payload.model),
      },
      args.onProgress,
    );
    return {
      durationMs: result.time,
      key: result.key ?? "",
      model: result.model ?? payload.model,
      outputUrl: result.output,
      raw: result,
    };
  };
}

function ImageCreationAdvancedStudio({
  data,
  imageInput,
  nodeId,
  projectId,
  promptInput,
  onClose,
  onPatch,
}: {
  data: ImageCreationAdvancedNodeData;
  imageInput: string;
  nodeId: string;
  projectId: string | null;
  promptInput: string;
  onClose: () => void;
  onPatch: (patch: Partial<ImageCreationAdvancedNodeData>) => void;
}) {
  const { data: authSession } = useSession();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const previousSectionRef = useRef<HTMLDivElement | null>(null);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const editReferenceInputRef = useRef<HTMLInputElement | null>(null);
  const draftTextRef = useRef<HTMLTextAreaElement | null>(null);
  const latestSessionRef = useRef<AdvancedImageSession | null>(null);
  const draftReferencesRef = useRef<LocalReferencePreview[]>([]);
  const editReferencesRef = useRef<LocalReferencePreview[]>([]);
  const localReferencesRef = useRef<Record<string, LocalReferencePreview[]>>({});
  const [imageSize, setImageSize] = useState<{ height: number; width: number }>({ height: 1024, width: 1024 });
  const [generating, setGenerating] = useState(false);
  const [drawingMode, setDrawingMode] = useState(false);
  const [draftPoints, setDraftPoints] = useState<AdvancedImagePoint[]>([]);
  const [draftReferences, setDraftReferences] = useState<LocalReferencePreview[]>([]);
  const [draftText, setDraftText] = useState("");
  const [editingCorrectionId, setEditingCorrectionId] = useState<string | null>(null);
  const [editReferences, setEditReferences] = useState<LocalReferencePreview[]>([]);
  const [editText, setEditText] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [previousExpanded, setPreviousExpanded] = useState(false);
  const [expandedPreviousCorrectionId, setExpandedPreviousCorrectionId] = useState<string | null>(null);
  const [hoveredPreviousCorrectionId, setHoveredPreviousCorrectionId] = useState<string | null>(null);
  const [historyPreviewId, setHistoryPreviewId] = useState<string | null>(null);
  const [openCardMenuId, setOpenCardMenuId] = useState<string | null>(null);
  const [promoteModalOpen, setPromoteModalOpen] = useState(false);
  const [referenceUploadError, setReferenceUploadError] = useState<string | null>(null);
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ height: 0, width: 0 });
  const [localReferencesByCorrectionId, setLocalReferencesByCorrectionId] = useState<Record<string, LocalReferencePreview[]>>({});
  const [renderedRect, setRenderedRect] = useState<AdvancedImageRenderedRect>({ height: 0, width: 0, x: 0, y: 0 });
  const [skipCostConfirm, setSkipCostConfirm] = useState(false);
  const session = data.advancedSession;
  const globalAdjustment = session?.globalAdjustment;
  const globalAdjustmentText = globalAdjustment?.text ?? "";
  const globalAdjustmentPending = globalAdjustmentPendingLabel(session);
  const workingUrl = session?.workingImage?.imageUrl || data.value || "";
  const historySnapshots = session?.historySnapshots ?? [];
  const historyPreviewSnapshot = historyPreviewId
    ? historySnapshots.find((snapshot) => snapshot.id === historyPreviewId) ?? null
    : null;
  const previewUrl = historyPreviewSnapshot?.workingImage.imageUrl || workingUrl || session?.master.imageUrl || imageInput;
  const canvasSession = useMemo(() => {
    if (!session || !historyPreviewSnapshot) return session;
    return {
      ...session,
      corrections: historyPreviewSnapshot.corrections,
      globalAdjustment: historyPreviewSnapshot.globalAdjustment,
      workingImage: historyPreviewSnapshot.workingImage,
    } satisfies AdvancedImageSession;
  }, [historyPreviewSnapshot, session]);
  const draftReadyForPopover = draftPoints.length >= 3 && !drawingMode && !isDrawing;
  const draftCanConfirm = draftText.trim().length > 0 || draftReferences.length > 0;
  const editCanSave = Boolean(editingCorrectionId) && (editText.trim().length > 0 || editReferences.length > 0);
  const draftGridLayout = draftReferences.length > 0 ? resolveImageGridLayout(draftReferences.length) : null;
  const editGridLayout = editReferences.length > 0 ? resolveImageGridLayout(editReferences.length) : null;
  const plan = useMemo(() => {
    if (!session) return null;
    const result = buildAdvancedImageGenerationPlan(session);
    return result.ok ? result.plan : null;
  }, [session]);
  const pendingCorrectionIds = useMemo(
    () => (session ? getAdvancedImagePendingCorrectionIds(session) : []),
    [session],
  );
  const canGenerate = Boolean(session) && !historyPreviewSnapshot && (pendingCorrectionIds.length > 0 || globalAdjustmentPending);
  const correctionSections = useMemo(() => {
    if (!session) {
      return {
        lastBatchNumber: 0,
        pending: [] as AdvancedImageCorrection[],
        previous: [] as AdvancedImageCorrection[],
        recent: [] as AdvancedImageCorrection[],
      };
    }
    const sorted = session.corrections.slice().sort((a, b) => a.order - b.order);
    const pending = sorted.filter((correction) => correctionViewState(correction, session) === "pending");
    const appliedLike = sorted.filter((correction) => correctionViewState(correction, session) !== "pending");
    const lastBatchNumber = appliedLike.reduce(
      (max, correction) => Math.max(max, correctionBatchNumber(correction) ?? 1),
      0,
    );
    return {
      lastBatchNumber,
      pending,
      previous: appliedLike.filter((correction) => (correctionBatchNumber(correction) ?? 1) < lastBatchNumber),
      recent: appliedLike.filter((correction) => (correctionBatchNumber(correction) ?? 1) === lastBatchNumber),
    };
  }, [session]);
  const draftPopoverStyle = useMemo(() => {
    if (!session || !draftReadyForPopover || canvasSize.width <= 0 || canvasSize.height <= 0) return null;
    const masterBox = computePointsBox(draftPoints);
    const canvasBox = masterBoxToCanvasBox(masterBox, renderedRect, {
      height: session.master.height,
      width: session.master.width,
    });
    const width = Math.min(360, Math.max(280, canvasSize.width - 32));
    const estimatedHeight = draftReferences.length > 0 ? 246 : 190;
    const topCandidate = canvasBox.y - estimatedHeight - 12;
    const placeBelow = topCandidate < 10;
    return {
      left: clampNumber(canvasBox.x + canvasBox.width / 2 - width / 2, 12, Math.max(12, canvasSize.width - width - 12)),
      top: placeBelow ? canvasBox.y + canvasBox.height + 12 : topCandidate,
      width,
    };
  }, [canvasSize, draftPoints, draftReadyForPopover, draftReferences.length, renderedRect, session]);
  const editingCorrection = useMemo(
    () => session?.corrections.find((correction) => correction.id === editingCorrectionId) ?? null,
    [editingCorrectionId, session?.corrections],
  );
  const editPopoverStyle = useMemo(() => {
    if (!session || !editingCorrection || canvasSize.width <= 0 || canvasSize.height <= 0) return null;
    const canvasBox = masterBoxToCanvasBox(editingCorrection.zone.bbox, renderedRect, {
      height: session.master.height,
      width: session.master.width,
    });
    const width = Math.min(380, Math.max(280, canvasSize.width - 32));
    const estimatedHeight = editReferences.length > 0 || editingCorrection.userReference ? 310 : 224;
    const topCandidate = canvasBox.y - estimatedHeight - 12;
    const placeBelow = topCandidate < 10;
    return {
      left: clampNumber(canvasBox.x + canvasBox.width / 2 - width / 2, 12, Math.max(12, canvasSize.width - width - 12)),
      top: placeBelow ? canvasBox.y + canvasBox.height + 12 : topCandidate,
      width,
    };
  }, [canvasSize, editReferences.length, editingCorrection, renderedRect, session]);

  useEffect(() => {
    if (!imageInput) return undefined;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled && image.naturalWidth && image.naturalHeight) {
        setImageSize({ height: image.naturalHeight, width: image.naturalWidth });
      }
    };
    image.onerror = () => {
      if (!cancelled) setImageSize({ height: 1024, width: 1024 });
    };
    image.src = imageInput;
    return () => {
      cancelled = true;
    };
  }, [imageInput]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return undefined;
    const updateRect = () => {
      const rect = element.getBoundingClientRect();
      const sourceSize = session?.master ?? imageSize;
      setCanvasSize({ height: rect.height, width: rect.width });
      setRenderedRect(
        computeContainedImageRect(
          { height: rect.height, width: rect.width },
          { height: sourceSize.height, width: sourceSize.width },
        ),
      );
    };
    updateRect();
    const observer = new ResizeObserver(updateRect);
    observer.observe(element);
    window.addEventListener("resize", updateRect);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateRect);
    };
  }, [imageSize, previewUrl, session?.master]);

  const ensureSession = useCallback(() => {
    if (!imageInput) {
      onPatch({ error: "Connect an image as master before starting.", status: "error" });
      return null;
    }
    if (session) return session;
    const timestamp = new Date().toISOString();
    const next = createAdvancedImageSession({
      generationSettings: DEFAULT_SETTINGS,
      id: `advanced-image-session-${stableHash({ imageInput, timestamp }).slice(0, 12)}`,
      master: createMasterFromImage(imageInput, imageSize, timestamp),
      timestamp,
    });
    onPatch({ advancedSession: safeSessionForNodeData(next), error: undefined, status: "ready" });
    return next;
  }, [imageInput, imageSize, onPatch, session]);

  useEffect(() => {
    latestSessionRef.current = session ?? null;
  }, [session]);

  useEffect(() => {
    if (!historyPreviewId) return;
    if (!historySnapshots.some((snapshot) => snapshot.id === historyPreviewId)) {
      setHistoryPreviewId(null);
    }
  }, [historyPreviewId, historySnapshots]);

  const cropExtractor = useCallback<AdvancedImageCropExtractor>(
    async (request) => {
      const image = await createImageElement(request.imageUrl);
      const sourceScaleX = image.naturalWidth / Math.max(1, session?.master.width ?? image.naturalWidth);
      const sourceScaleY = image.naturalHeight / Math.max(1, session?.master.height ?? image.naturalHeight);
      const sx = Math.max(0, Math.floor(request.paddedBBox.x * sourceScaleX));
      const sy = Math.max(0, Math.floor(request.paddedBBox.y * sourceScaleY));
      const sw = Math.max(1, Math.min(image.naturalWidth - sx, Math.ceil(request.paddedBBox.width * sourceScaleX)));
      const sh = Math.max(1, Math.min(image.naturalHeight - sy, Math.ceil(request.paddedBBox.height * sourceScaleY)));
      const maxSide = Math.max(1, request.targetMaxSide);
      const ratio = Math.min(1, maxSide / Math.max(sw, sh));
      const width = Math.max(1, Math.round(sw * ratio));
      const height = Math.max(1, Math.round(sh * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not create crop canvas.");
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
      const blob = await canvasToBlob(canvas, "image/png");
      const cropHash = await hashBlobSha256(blob);
      const mediaId = `advanced_image_anchor_${nodeId.replace(/[^a-zA-Z0-9_-]/g, "_")}_${request.correctionId}_${cropHash.slice(-8)}`;
      const file = new File([blob], `${mediaId}.png`, { type: "image/png" });
      const uploaded = await uploadProjectMediaFile(file, {
        mediaId,
        policy: { preserveImageQuality: true },
        projectId,
      });
      return {
        cropHash,
        cropS3Key: uploaded.s3Key,
        cropUrl: uploaded.url,
        height,
        perceptualHash: averageCanvasHash(canvas),
        width,
      };
    },
    [nodeId, projectId, session?.master.height, session?.master.width],
  );

  const descriptionTransport = useCallback<AdvancedImageIdentityDescriptionTransport>(
    async (request) => {
      const startedAt = performance.now();
      const res = await fetch("/api/gemini/describe-region", {
        body: JSON.stringify({
          bbox: request.bbox,
          correctionId: request.correctionId,
          imageS3Key: request.imageS3Key,
          imageUrl: request.imageUrl,
          maxWords: request.maxWords,
          model: request.model,
          prompt: request.prompt,
          sourceWorkingHash: request.sourceWorkingHash,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json?.error === "string" ? json.error : `Identity analysis failed (${res.status}).`);
      }
      return {
        description: String(json?.description ?? ""),
        durationMs: Math.round(performance.now() - startedAt),
        raw: json,
      };
    },
    [],
  );

  const runIdentityAnalysisInBackground = useCallback(
    (baseSession: AdvancedImageSession, correctionIds: string[]) => {
      const workingImage = baseSession.workingImage;
      const userEmail = authSession?.user?.email?.trim().toLowerCase();
      if (!workingImage || !userEmail || correctionIds.length === 0) return;

      for (const correctionId of correctionIds) {
        const baseCorrection = baseSession.corrections.find((item) => item.id === correctionId);
        if (!baseCorrection) continue;
        if (
          baseCorrection.analysisStatus === "ready" &&
          baseCorrection.identityAnchor?.sourceWorkingHash === workingImage.sourceHash
        ) {
          console.info("[ImageCreationAdvanced analyzer] skip cached", {
            correctionId,
            model: baseSession.generationSettings.analysisModel,
            sourceWorkingHash: workingImage.sourceHash,
          });
          continue;
        }

        window.setTimeout(() => {
          void (async () => {
            const requestId = `advanced-image-analysis-${correctionId}-${Date.now()}`;
            console.info("[ImageCreationAdvanced analyzer] start", {
              correctionId,
              model: baseSession.generationSettings.analysisModel,
              requestId,
            });
            try {
              const result = await executeAdvancedImageIdentityAnalysis(baseSession, correctionId, workingImage, {
                analysisApproval: { approved: true, reason: "post_generation_required" },
                cropExtractor,
                descriptionTransport,
                now: new Date().toISOString(),
                requestId,
                userEmail,
              });
              const current = latestSessionRef.current;
              const currentCorrection = current?.corrections.find((item) => item.id === correctionId);
              if (
                !current ||
                current.id !== baseSession.id ||
                !currentCorrection ||
                currentCorrection.geometryHash !== baseCorrection.geometryHash ||
                currentCorrection.instructionHash !== baseCorrection.instructionHash ||
                currentCorrection.referenceHash !== baseCorrection.referenceHash
              ) {
                console.info("[ImageCreationAdvanced analyzer] stale result ignored", { correctionId, requestId });
                return;
              }
              const next = markAdvancedImageCorrectionRuntime(
                current,
                correctionId,
                { identityAnchor: result.identityAnchor },
                { timestamp: new Date().toISOString() },
              );
              latestSessionRef.current = next;
              console.info("[ImageCreationAdvanced analyzer] success", {
                correctionId,
                cropS3Key: result.identityAnchor.cropS3Key,
                descriptionDurationMs: result.descriptionDurationMs,
                model: baseSession.generationSettings.analysisModel,
                requestId,
              });
              onPatch({ advancedSession: safeSessionForNodeData(next) });
            } catch (error) {
              const current = latestSessionRef.current;
              if (!current || current.id !== baseSession.id) return;
              const next = markAdvancedImageCorrectionRuntime(
                current,
                correctionId,
                { analysisStatus: "failed" },
                { timestamp: new Date().toISOString() },
              );
              latestSessionRef.current = next;
              console.warn("[ImageCreationAdvanced analyzer] failed", {
                correctionId,
                error: error instanceof Error ? error.message : String(error),
                model: baseSession.generationSettings.analysisModel,
                requestId,
              });
              onPatch({ advancedSession: safeSessionForNodeData(next) });
            }
          })();
        }, 0);
      }
    },
    [authSession?.user?.email, cropExtractor, descriptionTransport, onPatch],
  );

  useEffect(() => {
    localReferencesRef.current = localReferencesByCorrectionId;
  }, [localReferencesByCorrectionId]);

  useEffect(() => {
    draftReferencesRef.current = draftReferences;
  }, [draftReferences]);

  useEffect(() => {
    editReferencesRef.current = editReferences;
  }, [editReferences]);

  useEffect(() => {
    if (draftReadyForPopover) {
      window.setTimeout(() => draftTextRef.current?.focus(), 0);
    }
  }, [draftReadyForPopover]);

  useEffect(() => {
    return () => {
      revokeReferencePreviews(draftReferencesRef.current);
      revokeReferencePreviews(editReferencesRef.current);
      Object.values(localReferencesRef.current).forEach(revokeReferencePreviews);
    };
  }, []);

  const runBatchGeneration = useCallback(
    async (
      baseSession: AdvancedImageSession,
      batchPendingIds: string[],
      reason: "explicit_user_action" | "manual_retry" = "explicit_user_action",
    ) => {
      if (batchPendingIds.length === 0 && !isAdvancedImageGlobalAdjustmentPending(baseSession)) return null;
      const userEmail = authSession?.user?.email?.trim().toLowerCase();
      if (!userEmail) {
        onPatch({ advancedSession: safeSessionForNodeData(baseSession), error: "Sign in before calling Gemini.", status: "error" });
        return null;
      }
      setHistoryPreviewId(null);
      const preliminaryPlanResult = buildAdvancedImageGenerationPlan(baseSession, { batchPendingIds });
      if (!preliminaryPlanResult.ok) {
        onPatch({
          advancedSession: safeSessionForNodeData(baseSession),
          error: preliminaryPlanResult.issues.map((issue) => `${issue.code}: ${issue.detail}`).join("\n"),
          status: "error",
        });
        return null;
      }
      const preliminaryPlan = preliminaryPlanResult.plan;
      const willCallGemini = preliminaryPlan.activeCorrectionIds.length > 0 || preliminaryPlan.globalAdjustmentActive;
      let approvedForCost = !willCallGemini || skipCostConfirm;
      if (!skipCostConfirm && willCallGemini) {
        const referenceCount = preliminaryPlan.identityReferences.length + preliminaryPlan.directionReferences.length;
        const zoneAnalysisNote = batchPendingIds.length > 0
          ? " A lightweight zone-location analysis may run first so the selected areas are described precisely."
          : "";
        const confirmed = window.confirm(
          `This will call Gemini (${modelLabelForConfirm(preliminaryPlan.model)}) with ${referenceCount} reference image${referenceCount === 1 ? "" : "s"} plus the master image.${zoneAnalysisNote} Continue?\n\nPress OK to continue. Tick "do not ask again" in the Studio panel to avoid this prompt for this Studio session.`,
        );
        if (!confirmed) {
          onPatch({ advancedSession: safeSessionForNodeData(baseSession), status: "plan_ready" });
          return null;
        }
        approvedForCost = true;
      }

      setGenerating(true);
      setProgress(0);
      let sessionForGeneration = baseSession;
      let zoneAnalysisCount = 0;
      try {
        if (batchPendingIds.length > 0) {
          const analyzed = await analyzeAdvancedImageZoneLocations(baseSession, batchPendingIds);
          sessionForGeneration = analyzed.session;
          zoneAnalysisCount = analyzed.analyzedCount;
          if (sessionForGeneration !== baseSession) {
            latestSessionRef.current = sessionForGeneration;
            onPatch({ advancedSession: safeSessionForNodeData(sessionForGeneration), error: undefined, status: "editing" });
          }
        }
      } catch (error) {
        console.warn("[ImageCreationAdvanced zone-analysis] unexpected failure", error);
        sessionForGeneration = baseSession;
      }

      const planResult = buildAdvancedImageGenerationPlan(sessionForGeneration, { batchPendingIds });
      if (!planResult.ok) {
        setGenerating(false);
        onPatch({
          advancedSession: safeSessionForNodeData(sessionForGeneration),
          error: planResult.issues.map((issue) => `${issue.code}: ${issue.detail}`).join("\n"),
          status: "error",
        });
        return null;
      }
      const planToRun = planResult.plan;
      const now = new Date().toISOString();
      const requestId = `advanced-image-batch-${planToRun.geminiStateHash}-${Date.now()}`;
      const masterContentHashBefore = sessionForGeneration.master.contentHash;
      const cached = await readAdvancedImageGeminiRawCache(advancedImageStudioCache, planToRun, now, {
        requestId: `advanced-precheck-${planToRun.geminiStateHash}`,
        userEmail,
      });
      if (cached.hit) approvedForCost = true;
      setProgress(cached.hit ? 100 : 5);
      const generationResultRef: { current: AdvancedImageClientGenerationResult | null } = { current: null };
      let generationError: unknown = null;
      console.info("[ImageCreationAdvanced batch] start", {
        anchorRefsSent: planToRun.identityReferences.length,
        appliedPreserveCount: planToRun.appliedPreserveCorrectionIds.length,
        cachePrecheckHit: cached.hit,
        directionRefsSent: planToRun.directionReferences.length,
        finalImageStateHash: planToRun.finalImageStateHash,
        geminiStateHash: planToRun.geminiStateHash,
        masterContentHash: masterContentHashBefore,
        model: planToRun.model,
        omittedDirectionReferenceCorrectionIds: planToRun.omittedDirectionReferenceCorrectionIds,
        omittedIdentityReferenceCorrectionIds: planToRun.omittedIdentityReferenceCorrectionIds,
        globalAdjustmentApplied: planToRun.globalAdjustmentActive,
        globalAdjustmentText: truncateForLog(planToRun.globalAdjustmentText ?? ""),
        pendingCount: planToRun.batchPendingIds.length,
        refsTotal: planToRun.identityReferences.length + planToRun.directionReferences.length,
        requestId,
        zoneAnalysisCount,
      });
      try {
        const ok = await runAiJobWithNotification({ nodeId, label: "Image Creation Advanced" }, async () => {
          try {
            generationResultRef.current = await runAdvancedImageClientGeneration(sessionForGeneration, {
              batchPendingIds: planToRun.batchPendingIds,
              cacheStore: advancedImageStudioCache,
              costApproval: {
                approved: approvedForCost,
                reason: cached.hit ? "cached_replay" : reason,
              },
              logger: (event) => {
                console.info(
                  `[ImageCreationAdvanced cache] ${event.hit ? "HIT" : "MISS"} ${event.type} stateHash=${event.stateHash} key=${event.cacheKey}`,
                );
              },
              now,
              requestId,
              transport: createStreamGeminiTransport({
                aspectRatio: aspectRatioFromMaster(sessionForGeneration.master),
                onProgress: (pct) => setProgress(pct),
              }),
              userEmail,
            });
          } catch (error) {
            generationError = error;
            throw error;
          }
        });
        if (!ok) {
          const failedSession = generationError instanceof AdvancedImageClientGenerationError ? generationError.session : sessionForGeneration;
          const message = generationError instanceof Error ? generationError.message : "Generation cancelled.";
          onPatch({ advancedSession: safeSessionForNodeData(failedSession), error: message, status: "error" });
          return null;
        }
        const generationResult = generationResultRef.current;
        if (!generationResult) {
          onPatch({ advancedSession: safeSessionForNodeData(sessionForGeneration), error: "Generation cancelled.", status: "error" });
          return null;
        }
        const nextSession = generationResult.session;
        console.info("[ImageCreationAdvanced batch] success", {
          cacheHit: generationResult.cacheHit,
          finalImageStateHash: generationResult.plan.finalImageStateHash,
          geminiStateHash: generationResult.plan.geminiStateHash,
          masterContentHashAfter: nextSession.master.contentHash,
          masterContentHashBefore,
          masterUnchanged: nextSession.master.contentHash === masterContentHashBefore,
          outputS3KeyPresent: Boolean(generationResult.workingImage.s3Key),
          outputUrlPresent: Boolean(generationResult.workingImage.imageUrl),
          requestId,
          resolutionWarning: generationResult.resolutionWarning,
        });
        latestSessionRef.current = nextSession;
        onPatch({
          advancedSession: safeSessionForNodeData(nextSession),
          error: undefined,
          lastPlanHash: generationResult.plan.finalImageStateHash,
          status: "output",
          type: "image",
          value: generationResult.workingImage.imageUrl,
          warning: generationResult.resolutionWarning,
        });
        runIdentityAnalysisInBackground(nextSession, planToRun.batchPendingIds);
        return generationResult;
      } catch (error) {
        console.error("[ImageCreationAdvanced] generation failed:", error);
        const failedSession = error instanceof AdvancedImageClientGenerationError ? error.session : sessionForGeneration;
        console.info("[ImageCreationAdvanced batch] failed", {
          finalImageStateHash: planToRun.finalImageStateHash,
          geminiStateHash: planToRun.geminiStateHash,
          masterContentHashAfter: failedSession.master.contentHash,
          masterContentHashBefore,
          masterUnchanged: failedSession.master.contentHash === masterContentHashBefore,
          message: error instanceof Error ? error.message : "Generation failed.",
          globalAdjustmentApplied: planToRun.globalAdjustmentActive,
          globalAdjustmentText: truncateForLog(planToRun.globalAdjustmentText ?? ""),
          pendingCount: planToRun.batchPendingIds.length,
          requestId,
        });
        onPatch({
          advancedSession: safeSessionForNodeData(failedSession),
          error: error instanceof Error ? error.message : "Generation failed.",
          status: "error",
          warning: undefined,
        });
        return null;
      } finally {
        setGenerating(false);
        window.setTimeout(() => setProgress(0), 900);
      }
    },
    [authSession?.user?.email, nodeId, onPatch, runIdentityAnalysisInBackground, skipCostConfirm],
  );

  const confirmDraftCorrection = useCallback(async () => {
      const base = session;
      if (!base || !draftCanConfirm || !isValidClosedLasso(draftPoints) || referenceUploading) return null;
      const timestamp = new Date().toISOString();
      const closedPoints = draftPoints[0] === draftPoints[draftPoints.length - 1] ? draftPoints : [...draftPoints, draftPoints[0]];
      const text = draftText.trim() || "Use the attached visual reference in this marked area.";
      const correctionId = `correction-${stableHash({ points: closedPoints, timestamp }).slice(0, 10)}`;
      const zone = createZoneFromStrokes({
        sourceSize: { height: base.master.height, width: base.master.width },
        strokes: [
          {
            closed: true,
            id: `lasso-${timestamp}`,
            opacity: 1,
            points: closedPoints,
            radius: 1.5,
          },
        ],
        tool: "freehand",
      });
      setReferenceUploadError(null);
      setReferenceUploading(true);
      let userReference: AdvancedImageUserReferenceGrid | undefined;
      try {
        userReference = await createAndUploadCorrectionReferenceGrid({
          correctionId,
          nodeId,
          projectId,
          references: draftReferences,
          timestamp,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not upload reference grid.";
        setReferenceUploadError(message);
        setReferenceUploading(false);
        return null;
      }
      const next = addCorrection(
        base,
        {
          id: correctionId,
          timestamp,
          userInstruction: text,
          userReference,
          zone,
        },
        { timestamp },
      );
      onPatch({
        advancedSession: safeSessionForNodeData(next),
        error: undefined,
        status: "editing",
      });
      if (draftReferences.length > 0) {
        const usedReferences = draftReferences.slice(0, 16);
        revokeReferencePreviews(draftReferences.slice(16));
        setLocalReferencesByCorrectionId((current) => ({
          ...current,
          [correctionId]: usedReferences,
        }));
        setDraftReferences([]);
      }
      setReferenceUploading(false);
      setDraftText("");
      setDraftPoints([]);
      setDrawingMode(false);
      setIsDrawing(false);
      return next;
    },
    [draftCanConfirm, draftPoints, draftReferences, draftText, nodeId, onPatch, projectId, referenceUploading, session],
  );

  const startDrawingCorrection = useCallback(() => {
    const base = ensureSession();
    if (!base) return;
    setHistoryPreviewId(null);
    revokeReferencePreviews(draftReferences);
    revokeReferencePreviews(editReferences);
    setEditReferences([]);
    setEditText("");
    setEditingCorrectionId(null);
    setDraftReferences([]);
    setDraftText("");
    setDraftPoints([]);
    setDrawingMode(true);
    setIsDrawing(false);
    onPatch({ advancedSession: safeSessionForNodeData(base), error: undefined, status: "editing" });
  }, [draftReferences, editReferences, ensureSession, onPatch]);

  const cancelDrawing = useCallback(() => {
    revokeReferencePreviews(draftReferences);
    setDraftReferences([]);
    setDraftText("");
    setDraftPoints([]);
    setDrawingMode(false);
    setIsDrawing(false);
    setReferenceUploadError(null);
  }, [draftReferences]);

  const cancelCorrectionEditor = useCallback(() => {
    revokeReferencePreviews(editReferences);
    setEditReferences([]);
    setEditText("");
    setEditingCorrectionId(null);
    setReferenceUploadError(null);
  }, [editReferences]);

  useEffect(() => {
    if (!drawingMode && !draftReadyForPopover && !editingCorrectionId) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (editingCorrectionId) cancelCorrectionEditor();
        else cancelDrawing();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cancelCorrectionEditor, cancelDrawing, draftReadyForPopover, drawingMode, editingCorrectionId]);

  useEffect(() => {
    if (!expandedPreviousCorrectionId) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && previousSectionRef.current?.contains(target)) return;
      setExpandedPreviousCorrectionId(null);
      setOpenCardMenuId(null);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [expandedPreviousCorrectionId]);

  const pointFromPointerEvent = useCallback(
    (event: React.PointerEvent<SVGSVGElement>): AdvancedImagePoint | null => {
      const base = session;
      if (!base || renderedRect.width <= 0 || renderedRect.height <= 0) return null;
      const canvas = canvasRef.current?.getBoundingClientRect();
      if (!canvas) return null;
      return canvasToMasterPoint(
        { x: event.clientX - canvas.left, y: event.clientY - canvas.top },
        renderedRect,
        { height: base.master.height, width: base.master.width },
      );
    },
    [renderedRect, session],
  );

  const handleLassoPointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!drawingMode || generating) return;
      const point = pointFromPointerEvent(event);
      if (!point) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      setIsDrawing(true);
      setDraftPoints([point]);
    },
    [drawingMode, generating, pointFromPointerEvent],
  );

  const handleLassoPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!drawingMode || !isDrawing || generating) return;
      const point = pointFromPointerEvent(event);
      if (!point) return;
      event.preventDefault();
      setDraftPoints((points) => {
        const last = points[points.length - 1];
        if (last && Math.hypot(last.x - point.x, last.y - point.y) < 2) return points;
        return [...points, point];
      });
    },
    [drawingMode, generating, isDrawing, pointFromPointerEvent],
  );

  const handleLassoPointerUp = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!drawingMode || !isDrawing || generating) return;
      event.preventDefault();
      const point = pointFromPointerEvent(event);
      const points = point ? [...draftPoints, point] : draftPoints;
      setIsDrawing(false);
      if (isValidClosedLasso(points)) {
        setDraftPoints([...points, points[0]]);
        setDrawingMode(false);
        setDraftText("");
        return;
      }
      setDraftPoints([]);
      setDrawingMode(true);
    },
    [draftPoints, drawingMode, generating, isDrawing, pointFromPointerEvent],
  );

  const addDraftReferenceFiles = useCallback((files: FileList | null) => {
    const images = Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;
    setDraftReferences((current) => [
      ...current,
      ...images.map((file) => ({
        file,
        id: `draft-ref-${stableHash({ name: file.name, size: file.size, time: Date.now(), type: file.type }).slice(0, 10)}`,
        objectUrl: URL.createObjectURL(file),
      })),
    ]);
    if (referenceInputRef.current) referenceInputRef.current.value = "";
  }, []);

  const removeDraftReference = useCallback((referenceId: string) => {
    setDraftReferences((current) => {
      const removed = current.find((item) => item.id === referenceId);
      if (removed) URL.revokeObjectURL(removed.objectUrl);
      return current.filter((item) => item.id !== referenceId);
    });
  }, []);

  const openCorrectionEditor = useCallback(
    (correction: AdvancedImageCorrection) => {
      if (drawingMode || generating || historyPreviewSnapshot) return;
      revokeReferencePreviews(editReferences);
      setEditReferences([]);
      setEditText(correction.userInstruction);
      setEditingCorrectionId(correction.id);
      setReferenceUploadError(null);
    },
    [drawingMode, editReferences, generating, historyPreviewSnapshot],
  );

  const addEditReferenceFiles = useCallback((files: FileList | null) => {
    const images = Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;
    setEditReferences((current) => {
      revokeReferencePreviews(current);
      return images.map((file) => ({
        file,
        id: `edit-ref-${stableHash({ name: file.name, size: file.size, time: Date.now(), type: file.type }).slice(0, 10)}`,
        objectUrl: URL.createObjectURL(file),
      }));
    });
    if (editReferenceInputRef.current) editReferenceInputRef.current.value = "";
  }, []);

  const removeEditReference = useCallback((referenceId: string) => {
    setEditReferences((current) => {
      const removed = current.find((item) => item.id === referenceId);
      if (removed) URL.revokeObjectURL(removed.objectUrl);
      return current.filter((item) => item.id !== referenceId);
    });
  }, []);

  const saveCorrectionEditor = useCallback(async () => {
    if (!session || !editingCorrection || referenceUploading) return;
    const timestamp = new Date().toISOString();
    const text = editText.trim() || "Use the attached visual reference in this marked area.";
    setReferenceUploadError(null);
    setReferenceUploading(true);
    let userReference = editingCorrection.userReference;
    try {
      if (editReferences.length > 0) {
        userReference = await createAndUploadCorrectionReferenceGrid({
          correctionId: editingCorrection.id,
          nodeId,
          projectId,
          references: editReferences,
          timestamp,
        });
      }
      const next = editCorrection(
        session,
        editingCorrection.id,
        {
          userInstruction: text,
          userReference,
        },
        { timestamp },
      );
      if (editReferences.length > 0) {
        const previous = localReferencesRef.current[editingCorrection.id] ?? [];
        const usedReferences = editReferences.slice(0, 16);
        revokeReferencePreviews(previous);
        revokeReferencePreviews(editReferences.slice(16));
        setLocalReferencesByCorrectionId((current) => ({
          ...current,
          [editingCorrection.id]: usedReferences,
        }));
        setEditReferences([]);
      }
      setEditText("");
      setEditingCorrectionId(null);
      onPatch({ advancedSession: safeSessionForNodeData(next), error: undefined, status: "editing" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not upload reference grid.";
      setReferenceUploadError(message);
    } finally {
      setReferenceUploading(false);
    }
  }, [editReferences, editText, editingCorrection, nodeId, onPatch, projectId, referenceUploading, session]);

  const retryCorrection = useCallback(
    (correctionId: string) => {
      if (!session) return;
      const ids = pendingCorrectionIds.includes(correctionId) ? pendingCorrectionIds : [correctionId];
      void runBatchGeneration(session, ids, "manual_retry");
    },
    [pendingCorrectionIds, runBatchGeneration, session],
  );

  const toggleCorrectionOnly = useCallback(
    (correctionId: string) => {
      if (!session) return;
      const timestamp = new Date().toISOString();
      const next = toggleCorrection(session, correctionId, { timestamp });
      onPatch({ advancedSession: safeSessionForNodeData(next), error: undefined, status: "editing" });
    },
    [onPatch, session],
  );

  const deleteCorrectionOnly = useCallback(
    (correctionId: string) => {
      if (!session) return;
      const confirmed = window.confirm("Delete this correction? This cannot be undone outside the session undo stack.");
      if (!confirmed) return;
      const timestamp = new Date().toISOString();
      const next = removeCorrection(session, correctionId, { timestamp });
      setOpenCardMenuId(null);
      setEditingCorrectionId(null);
      setExpandedPreviousCorrectionId(null);
      onPatch({ advancedSession: safeSessionForNodeData(next), error: undefined, status: "editing" });
    },
    [onPatch, session],
  );

  const updateGlobalText = useCallback(
    (text: string) => {
      const base = ensureSession();
      if (!base) return;
      const timestamp = new Date().toISOString();
      const next = updateAdvancedImageGlobalAdjustment(base, text, { timestamp });
      onPatch({ advancedSession: safeSessionForNodeData(next), error: undefined, status: "editing" });
    },
    [ensureSession, onPatch],
  );

  const clearGlobalText = useCallback(() => {
    if (!session) return;
    const timestamp = new Date().toISOString();
    const next = clearAdvancedImageGlobalAdjustment(session, { timestamp });
    onPatch({ advancedSession: safeSessionForNodeData(next), error: undefined, status: "editing" });
  }, [onPatch, session]);

  const promoteCurrentWorkingToMaster = useCallback(() => {
    if (!session?.workingImage) return;
    const timestamp = new Date().toISOString();
    const working = session.workingImage;
    const newMaster: AdvancedImageMaster = {
      contentHash: stableHash({
        imageUrl: working.imageUrl,
        s3Key: working.s3Key,
        size: { height: working.height, width: working.width },
        sourceHash: working.sourceHash,
      }),
      createdAt: timestamp,
      generationMetadata: {
        previousMasterContentHash: session.master.contentHash,
        previousMasterId: session.master.id,
        sourceWorkingHash: working.sourceHash,
      },
      height: working.height,
      id: `master-promoted-${stableHash({ sessionId: session.id, timestamp }).slice(0, 12)}`,
      imageUrl: working.imageUrl,
      promotedAt: timestamp,
      promotedFromSessionId: session.id,
      s3Key: working.s3Key,
      sourceModel: working.model,
      sourceResolution: working.resolution || `${working.width}x${working.height}`,
      width: working.width,
    };
    const next = promoteToMaster(
      session,
      {
        archiveGroupId: `archive-${stableHash({ master: session.master.id, timestamp }).slice(0, 12)}`,
        newMaster,
        promotedWorkingImage: working,
      },
      { timestamp },
    );
    setPromoteModalOpen(false);
    setHistoryPreviewId(null);
    setPreviousExpanded(false);
    setExpandedPreviousCorrectionId(null);
    setOpenCardMenuId(null);
    onPatch({
      advancedSession: safeSessionForNodeData(next),
      error: undefined,
      status: "output",
      type: "image",
      value: working.imageUrl,
      warning: undefined,
    });
  }, [onPatch, session]);

  const restoreHistorySnapshot = useCallback(
    (snapshot: AdvancedImageHistorySnapshot) => {
      if (!session || generating) return;
      const confirmed = window.confirm(
        `Return to batch #${snapshot.batchNumber}? Later corrections and generated images after this point will be discarded from the active session. You can still undo this action from the session undo stack.`,
      );
      if (!confirmed) return;
      const timestamp = new Date().toISOString();
      const next = restoreAdvancedImageHistorySnapshot(session, snapshot.id, { timestamp });
      setHistoryPreviewId(null);
      setPreviousExpanded(false);
      setExpandedPreviousCorrectionId(null);
      setOpenCardMenuId(null);
      onPatch({
        advancedSession: safeSessionForNodeData(next),
        error: undefined,
        status: next.workingImage ? "output" : "editing",
        type: next.workingImage ? "image" : undefined,
        value: next.workingImage?.imageUrl,
        warning: undefined,
      });
    },
    [generating, onPatch, session],
  );

  const renderCardMenu = useCallback(
    (correction: AdvancedImageCorrection) => {
      const state = session ? correctionViewState(correction, session) : "pending";
      const isOpen = openCardMenuId === correction.id;
      return (
        <div className="relative">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setOpenCardMenuId((current) => (current === correction.id ? null : correction.id));
            }}
            disabled={generating || drawingMode || Boolean(historyPreviewSnapshot)}
            className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/[0.06] text-zinc-400 transition hover:bg-white/[0.1] hover:text-white disabled:opacity-40"
            aria-label="Correction menu"
          >
            <MoreHorizontal size={15} />
          </button>
          {isOpen ? (
            <div className="absolute right-0 top-9 z-30 min-w-[128px] overflow-hidden rounded-[10px] bg-[#101116] p-1 text-[11px] font-bold text-zinc-200 shadow-2xl ring-1 ring-white/10">
              {state === "inactive" ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleCorrectionOnly(correction.id);
                    setOpenCardMenuId(null);
                  }}
                  className="block w-full rounded-[8px] px-3 py-2 text-left hover:bg-white/[0.08]"
                >
                  Activate
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openCorrectionEditor(correction);
                      setOpenCardMenuId(null);
                    }}
                    className="block w-full rounded-[8px] px-3 py-2 text-left hover:bg-white/[0.08]"
                  >
                    Edit
                  </button>
                  {state !== "pending" ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleCorrectionOnly(correction.id);
                        setOpenCardMenuId(null);
                      }}
                      className="block w-full rounded-[8px] px-3 py-2 text-left hover:bg-white/[0.08]"
                    >
                      Deactivate
                    </button>
                  ) : null}
                </>
              )}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  deleteCorrectionOnly(correction.id);
                }}
                className="block w-full rounded-[8px] px-3 py-2 text-left text-rose-200 hover:bg-rose-500/15"
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>
      );
    },
    [deleteCorrectionOnly, drawingMode, generating, historyPreviewSnapshot, openCardMenuId, openCorrectionEditor, session, toggleCorrectionOnly],
  );

  const renderFullCorrectionCard = useCallback(
    (correction: AdvancedImageCorrection, section: AdvancedImagePanelSection) => {
      if (!session) return null;
      const state = correctionViewState(correction, session);
      const localRefs = localReferencesByCorrectionId[correction.id] ?? [];
      const referenceGridUrl = gridUrlFromReference(correction.userReference);
      const thumbnailUrl = correction.identityAnchor?.cropUrl || (section === "pending" ? referenceGridUrl : "");
      const hasReference = Boolean(correction.userReference || localRefs.length > 0);
      const batch = correctionBatchNumber(correction);
      return (
        <div
          key={correction.id}
          onClick={() => openCorrectionEditor(correction)}
          className={`cursor-pointer rounded-[10px] border p-3 transition hover:bg-white/[0.07] ${correctionCardTone(state, section)}`}
        >
          <div className="flex gap-3">
            <div className="h-[74px] w-[92px] shrink-0 overflow-hidden rounded-[10px] bg-zinc-800/70">
              {thumbnailUrl ? (
                <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-zinc-600">
                  <ImageIcon size={18} />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <span className={`rounded-[10px] px-2 py-1 text-[9px] font-bold ${correctionBadgeClass(state)}`}>
                  {correctionViewLabel(state)}
                </span>
                {renderCardMenu(correction)}
              </div>
              <p
                className={`mt-2 text-[12px] leading-relaxed text-zinc-200 ${state === "inactive" ? "line-through" : ""}`}
                style={{
                  display: "-webkit-box",
                  overflow: "hidden",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: 2,
                }}
              >
                {correction.userInstruction}
              </p>
              <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-500">
                {hasReference ? <ImageIcon size={12} className="text-yellow-200" /> : null}
                {batch ? <span>#{batch}</span> : null}
                {correction.analysisStatus === "failed" ? <span className="text-amber-200/80">Identity not anchored</span> : null}
              </div>
            </div>
          </div>
          {correction.lastGenerationStatus === "failed" && correction.lastGenerationError ? (
            <p className="mt-2 rounded-[10px] bg-rose-500/10 px-2 py-1.5 text-[10px] text-rose-200">{correction.lastGenerationError}</p>
          ) : null}
        </div>
      );
    },
    [localReferencesByCorrectionId, openCorrectionEditor, renderCardMenu, session],
  );

  const renderCompactPreviousRow = useCallback(
    (correction: AdvancedImageCorrection) => {
      if (!session) return null;
      const state = correctionViewState(correction, session);
      if (expandedPreviousCorrectionId === correction.id) {
        return renderFullCorrectionCard(correction, "previous");
      }
      const cropUrl = correction.identityAnchor?.cropUrl;
      const batch = correctionBatchNumber(correction) ?? 1;
      return (
        <button
          key={correction.id}
          type="button"
          onClick={() => setExpandedPreviousCorrectionId(correction.id)}
          onMouseEnter={() => setHoveredPreviousCorrectionId(correction.id)}
          onMouseLeave={() => setHoveredPreviousCorrectionId(null)}
          className="relative flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left transition hover:bg-white/[0.055]"
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${state === "inactive" ? "bg-zinc-500" : "bg-emerald-300"}`} />
          <span className={`min-w-0 flex-1 truncate text-[11px] text-zinc-300 ${state === "inactive" ? "line-through opacity-60" : ""}`}>
            {correction.userInstruction}
          </span>
          <span className="rounded-[8px] bg-white/[0.05] px-2 py-1 text-[9px] font-bold text-zinc-500">#{batch}</span>
          {hoveredPreviousCorrectionId === correction.id && cropUrl ? (
            <span className="pointer-events-none absolute right-full top-0 z-40 mr-3 h-28 w-36 overflow-hidden rounded-[10px] bg-zinc-950 shadow-2xl ring-1 ring-white/10">
              <img src={cropUrl} alt="" className="h-full w-full object-cover" />
            </span>
          ) : null}
        </button>
      );
    },
    [expandedPreviousCorrectionId, hoveredPreviousCorrectionId, renderFullCorrectionCard, session],
  );

  const renderHistorySnapshot = useCallback(
    (snapshot: AdvancedImageHistorySnapshot) => {
      const selected = historyPreviewId === snapshot.id;
      return (
        <div
          key={snapshot.id}
          className={`rounded-[10px] border p-2 transition ${
            selected ? "border-yellow-300/70 bg-yellow-300/10" : "border-white/10 bg-black/20 hover:bg-white/[0.045]"
          }`}
        >
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setHistoryPreviewId(snapshot.id);
                setEditingCorrectionId(null);
                setOpenCardMenuId(null);
              }}
              disabled={generating || drawingMode}
              className="h-[58px] w-[76px] shrink-0 overflow-hidden rounded-[10px] bg-zinc-900 disabled:opacity-50"
              aria-label={`Preview batch ${snapshot.batchNumber}`}
            >
              <img src={snapshot.workingImage.imageUrl} alt="" className="h-full w-full object-cover" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-300">
                    Batch #{snapshot.batchNumber}
                  </p>
                  <p className="mt-1 truncate text-[10px] text-zinc-500">{formatHistoryTimestamp(snapshot.createdAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => restoreHistorySnapshot(snapshot)}
                  disabled={generating}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.06] text-zinc-300 transition hover:bg-yellow-300 hover:text-zinc-950 disabled:opacity-40"
                  aria-label={`Return to batch ${snapshot.batchNumber}`}
                >
                  <RotateCcw size={13} />
                </button>
              </div>
              <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-zinc-400">{snapshot.summary}</p>
              <p className="mt-1 text-[9px] font-bold text-zinc-600">
                {snapshot.activeCorrectionIds.length} active · {snapshot.workingImage.width}x{snapshot.workingImage.height}
              </p>
            </div>
          </div>
        </div>
      );
    },
    [drawingMode, generating, historyPreviewId, restoreHistorySnapshot],
  );

  const generateButtonLabel = useMemo(() => {
    if (generating) return `Generating ${progress}%`;
    if (data.error && canGenerate) {
      if (pendingCorrectionIds.length > 0) {
        return `Retry ${pendingCorrectionIds.length} change${pendingCorrectionIds.length === 1 ? "" : "s"}`;
      }
      return "Retry global adjustment";
    }
    const hasLocal = pendingCorrectionIds.length > 0;
    const hasGlobal = globalAdjustmentPending;
    if (hasLocal && hasGlobal) {
      return `Generate ${pendingCorrectionIds.length} change${pendingCorrectionIds.length === 1 ? "" : "s"} + global`;
    }
    if (hasLocal) {
      return `Generate ${pendingCorrectionIds.length} change${pendingCorrectionIds.length === 1 ? "" : "s"}`;
    }
    if (hasGlobal) return "Aplicar ajuste global";
    return "Generate";
  }, [canGenerate, data.error, generating, globalAdjustmentPending, pendingCorrectionIds.length, progress]);

  return (
    <StudioNodePortal>
      <div className="fixed inset-0 z-[100090] flex flex-col bg-[#0b0c10] text-white" data-foldder-i18n-ignore>
        <header className="flex min-h-[74px] items-center justify-between bg-[#101116]/95 px-7 py-4 backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-yellow-300/14 text-yellow-200">
              <Sparkles size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="text-[20px] font-black tracking-tight">Image Creation Advanced</h1>
              <p className="text-[12px] text-zinc-400">Non destructive image editing from an immutable master.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-[10px] bg-emerald-400/10 px-3 py-2 text-[11px] font-bold text-emerald-100">
              <ShieldCheck size={14} />
              Editing from master
            </span>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-white/[0.05] text-zinc-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        <main className="grid min-h-0 flex-1 grid-cols-[1fr_360px] overflow-hidden">
          <section className="relative flex min-h-0 items-center justify-center bg-[#07080b] p-6">
            <div ref={canvasRef} className="relative h-full w-full">
              {previewUrl ? (
                <>
                  <img
                    src={previewUrl}
                    alt=""
                    className="absolute rounded-[10px] object-fill shadow-2xl"
                    style={{
                      height: renderedRect.height,
                      left: renderedRect.x,
                      top: renderedRect.y,
                      width: renderedRect.width,
                    }}
                  />
                  {canvasSession ? (
                    <svg
                      className="absolute overflow-visible"
                      style={{
                        cursor: drawingMode && !historyPreviewSnapshot ? "crosshair" : "default",
                        height: renderedRect.height,
                        left: renderedRect.x,
                        pointerEvents: drawingMode && !historyPreviewSnapshot ? "auto" : "none",
                        top: renderedRect.y,
                        touchAction: "none",
                        width: renderedRect.width,
                      }}
                      viewBox={`0 0 ${canvasSession.master.width} ${canvasSession.master.height}`}
                      onPointerDown={handleLassoPointerDown}
                      onPointerMove={handleLassoPointerMove}
                      onPointerUp={handleLassoPointerUp}
                      onPointerCancel={cancelDrawing}
                    >
                      {canvasSession.corrections
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .map((correction) => {
                          const state = correctionViewState(correction, canvasSession);
                          if (state === "inactive") return null;
                          const points = primaryZonePoints(correction);
                          if (points.length < 3) return null;
                          const selected = !historyPreviewSnapshot && correction.id === editingCorrectionId;
                          if (state === "applied" && !selected) return null;
                          const fill = state === "applied"
                            ? "rgba(68, 165, 255, 0.2)"
                            : selected
                              ? "rgba(236, 72, 153, 0.3)"
                              : "rgba(166, 173, 185, 0.24)";
                          const stroke = state === "applied"
                            ? "rgba(110, 190, 255, 0.82)"
                            : selected
                              ? "rgba(244, 114, 182, 0.95)"
                              : "rgba(196, 202, 212, 0.72)";
                          return (
                            <g key={correction.id}>
                              <polygon
                                points={zonePolygonPoints(points)}
                                fill={fill}
                                stroke={stroke}
                                strokeLinejoin="round"
                                strokeWidth={Math.max(2, canvasSession.master.width * 0.0018)}
                              />
                            </g>
                          );
                        })}
                      {draftReadyForPopover ? (
                        <polygon
                          points={zonePolygonPoints(draftPoints)}
                          fill="rgba(236, 72, 153, 0.3)"
                          stroke="rgba(244, 114, 182, 0.95)"
                          strokeLinejoin="round"
                          strokeWidth={Math.max(2, canvasSession.master.width * 0.0018)}
                        />
                      ) : (
                        <>
                          {draftPoints.length > 1 ? (
                            <polyline
                              points={zonePolygonPoints(draftPoints)}
                              fill="none"
                              stroke="#ffffff"
                              strokeLinejoin="round"
                              strokeLinecap="round"
                              strokeWidth={Math.max(2, canvasSession.master.width * 0.0016)}
                              style={{ filter: "drop-shadow(0 0 2px rgba(0,0,0,.9)) drop-shadow(0 0 5px rgba(0,0,0,.75))" }}
                            />
                          ) : null}
                        </>
                      )}
                    </svg>
                  ) : null}
                  {draftReadyForPopover && draftPopoverStyle ? (
                    <div
                      className="absolute z-20 rounded-[10px] bg-[#111218]/95 p-3 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl"
                      style={{
                        left: draftPopoverStyle.left,
                        top: draftPopoverStyle.top,
                        width: draftPopoverStyle.width,
                      }}
                    >
                      <button
                        type="button"
                        onClick={cancelDrawing}
                        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-[10px] text-zinc-500 transition hover:bg-white/10 hover:text-white"
                        aria-label="Cancel correction"
                      >
                        <X size={14} />
                      </button>
                      <textarea
                        ref={draftTextRef}
                        value={draftText}
                        onChange={(event) => setDraftText(event.target.value)}
                        placeholder="What should happen here?"
                        className="mt-6 min-h-[76px] w-full resize-none rounded-[10px] bg-black/35 p-3 text-[13px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:bg-black/45"
                      />
                      <input
                        ref={referenceInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => addDraftReferenceFiles(event.target.files)}
                      />
                      <button
                        type="button"
                        onClick={() => referenceInputRef.current?.click()}
                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-[10px] bg-white/[0.06] px-3 py-2 text-[11px] font-bold text-zinc-200 transition hover:bg-white/[0.1]"
                      >
                        <ImageIcon size={14} />
                        Add reference image
                      </button>
                      {draftReferences.length > 0 ? (
                        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                          {draftReferences.map((reference) => (
                            <div key={reference.id} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[10px] bg-black/35">
                              <img src={reference.objectUrl} alt="" className="h-full w-full object-cover" />
                              <button
                                type="button"
                                onClick={() => removeDraftReference(reference.id)}
                                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white"
                                aria-label="Remove reference"
                              >
                                <X size={11} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {draftGridLayout?.discardedImageCount ? (
                        <p className="mt-2 rounded-[10px] bg-amber-400/10 px-2 py-1.5 text-[10px] font-bold text-amber-100">
                          Only the first 16 images will be used.
                        </p>
                      ) : null}
                      {referenceUploadError ? (
                        <p className="mt-2 rounded-[10px] bg-rose-500/15 px-2 py-1.5 text-[10px] text-rose-100">
                          {referenceUploadError}
                        </p>
                      ) : null}
                      <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelDrawing}
                          disabled={referenceUploading}
                          className="rounded-[10px] px-3 py-2 text-[11px] font-bold text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void confirmDraftCorrection()}
                          disabled={!draftCanConfirm || referenceUploading}
                          className="rounded-[10px] bg-yellow-300 px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-zinc-950 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                        >
                          {referenceUploading ? "Saving refs..." : "Confirm correction"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {editingCorrection && editPopoverStyle ? (
                    <div
                      className="absolute z-20 rounded-[10px] bg-[#111218]/95 p-3 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl"
                      style={{
                        left: editPopoverStyle.left,
                        top: editPopoverStyle.top,
                        width: editPopoverStyle.width,
                      }}
                    >
                      <button
                        type="button"
                        onClick={cancelCorrectionEditor}
                        disabled={referenceUploading}
                        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-[10px] text-zinc-500 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                        aria-label="Close correction editor"
                      >
                        <X size={14} />
                      </button>
                      <p className="pr-8 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
                        Edit correction
                      </p>
                      <textarea
                        value={editText}
                        onChange={(event) => setEditText(event.target.value)}
                        placeholder="What should happen here?"
                        className="mt-3 min-h-[76px] w-full resize-none rounded-[10px] bg-black/35 p-3 text-[13px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:bg-black/45"
                      />
                      {editingCorrection.userReference && editReferences.length === 0 ? (
                        <div className="mt-2 overflow-hidden rounded-[10px] bg-black/35">
                          <img
                            src={gridUrlFromReference(editingCorrection.userReference)}
                            alt=""
                            className="h-24 w-full object-cover"
                          />
                          <div className="flex items-center justify-between px-2 py-1.5 text-[10px] text-zinc-500">
                            <span>{editingCorrection.userReference.sourceImageCount} reference image{editingCorrection.userReference.sourceImageCount === 1 ? "" : "s"}</span>
                            <span>{editingCorrection.userReference.layout?.columns ?? 1}x{editingCorrection.userReference.layout?.rows ?? 1}</span>
                          </div>
                        </div>
                      ) : null}
                      <input
                        ref={editReferenceInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => addEditReferenceFiles(event.target.files)}
                      />
                      <button
                        type="button"
                        onClick={() => editReferenceInputRef.current?.click()}
                        disabled={referenceUploading}
                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-[10px] bg-white/[0.06] px-3 py-2 text-[11px] font-bold text-zinc-200 transition hover:bg-white/[0.1] disabled:opacity-40"
                      >
                        <RefreshCw size={14} />
                        Replace references
                      </button>
                      {editReferences.length > 0 ? (
                        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                          {editReferences.map((reference) => (
                            <div key={reference.id} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[10px] bg-black/35">
                              <img src={reference.objectUrl} alt="" className="h-full w-full object-cover" />
                              <button
                                type="button"
                                onClick={() => removeEditReference(reference.id)}
                                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white"
                                aria-label="Remove reference"
                              >
                                <X size={11} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {editGridLayout?.discardedImageCount ? (
                        <p className="mt-2 rounded-[10px] bg-amber-400/10 px-2 py-1.5 text-[10px] font-bold text-amber-100">
                          Only the first 16 images will be used.
                        </p>
                      ) : null}
                      {referenceUploadError ? (
                        <p className="mt-2 rounded-[10px] bg-rose-500/15 px-2 py-1.5 text-[10px] text-rose-100">
                          {referenceUploadError}
                        </p>
                      ) : null}
                      <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelCorrectionEditor}
                          disabled={referenceUploading}
                          className="rounded-[10px] px-3 py-2 text-[11px] font-bold text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:opacity-40"
                        >
                          Close
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveCorrectionEditor()}
                          disabled={!editCanSave || referenceUploading}
                          className="rounded-[10px] bg-yellow-300 px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-zinc-950 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                        >
                          {referenceUploading ? "Saving refs..." : "Save changes"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="max-w-[360px] text-center text-zinc-500">
                    <ImageIcon size={38} className="mx-auto mb-4 text-zinc-400" />
                    <p className="text-[18px] font-black text-zinc-200">Connect a master image.</p>
                    <p className="mt-2 text-[13px] leading-relaxed">This node always rebuilds edits from the original image.</p>
                  </div>
                </div>
              )}
            </div>
            {session ? (
              <div className="absolute left-6 top-6 flex items-center gap-2 rounded-[10px] bg-black/55 px-3 py-2 text-[11px] font-bold text-zinc-200 backdrop-blur">
                <BadgeCheck size={14} className="text-emerald-200" />
                {session.corrections.filter((item) => item.status === "active").length} active corrections
              </div>
            ) : null}
            {historyPreviewSnapshot ? (
              <div className="absolute left-1/2 top-6 flex -translate-x-1/2 items-center gap-2 rounded-[10px] bg-yellow-300 px-3 py-2 text-[11px] font-black text-zinc-950 shadow-2xl">
                <History size={14} />
                Preview batch #{historyPreviewSnapshot.batchNumber}
                <button
                  type="button"
                  onClick={() => restoreHistorySnapshot(historyPreviewSnapshot)}
                  className="ml-1 rounded-[8px] bg-zinc-950 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-yellow-100"
                >
                  Return
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryPreviewId(null)}
                  className="rounded-[8px] bg-zinc-950/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-zinc-800"
                >
                  Current
                </button>
              </div>
            ) : null}
            {drawingMode ? (
              <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-[10px] bg-black/65 px-4 py-2 text-[11px] font-bold text-white shadow-2xl backdrop-blur">
                Draw the area to edit
              </div>
            ) : null}
            <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
              {data.error ? <p className="max-w-[520px] rounded-[10px] bg-rose-500/15 px-3 py-2 text-center text-[11px] text-rose-100">{data.error}</p> : null}
              {data.warning ? <p className="max-w-[520px] rounded-[10px] bg-amber-400/15 px-3 py-2 text-center text-[11px] text-amber-100">{data.warning}</p> : null}
              <button
                type="button"
                onClick={() => {
                  if (!session || !canGenerate) return;
                  void runBatchGeneration(session, pendingCorrectionIds, data.error ? "manual_retry" : "explicit_user_action");
                }}
                disabled={!session || !canGenerate || generating || referenceUploading}
                className="rounded-[10px] bg-yellow-300 px-7 py-3 text-[12px] font-black uppercase tracking-[0.16em] text-zinc-950 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:bg-zinc-700/80 disabled:text-zinc-400"
              >
                {generateButtonLabel}
              </button>
            </div>
          </section>

          <aside className="flex min-h-0 flex-col bg-[#14151b] p-5">
            <section className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Master</p>
              <button
                type="button"
                onClick={ensureSession}
                disabled={!imageInput || Boolean(session)}
                className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-white/[0.06] px-3 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-zinc-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <ImageIcon size={14} />
                {session ? "Master locked" : "Create master"}
              </button>
              <button
                type="button"
                onClick={() => setPromoteModalOpen(true)}
                disabled={!session?.workingImage || generating}
                className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-white/[0.035] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Archive size={13} />
                Promote to master
              </button>
              {promptInput ? (
                <p className="rounded-[10px] bg-black/20 p-3 text-[12px] leading-relaxed text-zinc-400">{compactText(promptInput)}</p>
              ) : null}
            </section>

            {session ? (
              <section className="mt-5 rounded-[10px] bg-white/[0.035] p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">Ajuste global</p>
                  <button
                    type="button"
                    onClick={clearGlobalText}
                    disabled={!globalAdjustmentText.trim() || generating}
                    className="rounded-[8px] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500 transition hover:bg-white/[0.08] hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    Limpiar
                  </button>
                </div>
                <textarea
                  value={globalAdjustmentText}
                  onChange={(event) => updateGlobalText(event.target.value)}
                  disabled={generating}
                  placeholder="Iluminación, ambiente, estilo general..."
                  className="min-h-[72px] w-full resize-none rounded-[10px] bg-black/28 p-3 text-[12px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:bg-black/40 disabled:opacity-55"
                />
                <div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-bold">
                  {!globalAdjustmentText.trim() ? (
                    <span className="text-zinc-600">Sin ajuste global</span>
                  ) : globalAdjustment?.status === "applied" ? (
                    <span className="rounded-[8px] bg-emerald-400/10 px-2 py-1 text-emerald-100">
                      Aplicado en batch #{globalAdjustment.appliedInBatch ?? "?"}
                    </span>
                  ) : (
                    <span className="rounded-[8px] bg-amber-300/10 px-2 py-1 text-amber-100">Pendiente de aplicar</span>
                  )}
                  {globalAdjustmentText.trim() && globalAdjustment?.status === "applied" ? (
                    <button
                      type="button"
                      onClick={clearGlobalText}
                      disabled={generating}
                      className="rounded-[8px] bg-white/[0.055] px-2 py-1 text-zinc-300 transition hover:bg-white/[0.1] disabled:opacity-40"
                    >
                      Quitar ajuste
                    </button>
                  ) : null}
                </div>
              </section>
            ) : null}

            {session ? (
              <section className="mt-5 rounded-[10px] bg-white/[0.035] p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                    <History size={13} />
                    History
                  </p>
                  <span className="rounded-[8px] bg-black/25 px-2 py-1 text-[9px] font-bold text-zinc-500">
                    {historySnapshots.length}
                  </span>
                </div>
                {historySnapshots.length > 0 ? (
                  <div className="max-h-[238px] space-y-2 overflow-y-auto pr-1">
                    {historySnapshots
                      .slice()
                      .reverse()
                      .map((snapshot) => renderHistorySnapshot(snapshot))}
                  </div>
                ) : (
                  <p className="rounded-[10px] bg-black/20 p-3 text-[11px] leading-relaxed text-zinc-500">
                    Generated states will appear here so you can preview and return to a previous point.
                  </p>
                )}
              </section>
            ) : null}

            <section className="mt-5 min-h-0 flex-1 overflow-y-auto">
              {session?.corrections.length ? (
                <div className="space-y-5">
                  {correctionSections.pending.length > 0 ? (
                    <section className="space-y-2">
                      <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-amber-100/80">
                        <Clock3 size={13} />
                        Pending generation ({correctionSections.pending.length})
                      </p>
                      <div className="space-y-2">
                        {correctionSections.pending.map((correction) => renderFullCorrectionCard(correction, "pending"))}
                      </div>
                    </section>
                  ) : null}

                  {correctionSections.recent.length > 0 ? (
                    <section className="space-y-2">
                      <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
                        <BadgeCheck size={13} className="text-emerald-200" />
                        Last generation ({correctionSections.recent.length})
                      </p>
                      <div className="space-y-2">
                        {correctionSections.recent.map((correction) => renderFullCorrectionCard(correction, "recent"))}
                      </div>
                    </section>
                  ) : null}

                  {correctionSections.previous.length > 0 ? (
                    <section ref={previousSectionRef} className="space-y-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPreviousExpanded((value) => !value);
                          setExpandedPreviousCorrectionId(null);
                        }}
                        className="flex w-full items-center justify-between rounded-[10px] px-1 py-1 text-left text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500 transition hover:text-zinc-300"
                      >
                        <span className="flex items-center gap-2">
                          {previousExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          Previous ({correctionSections.previous.length})
                        </span>
                      </button>
                      {previousExpanded ? (
                        <div className="space-y-1 rounded-[10px] bg-black/10 p-1">
                          {correctionSections.previous.map((correction) => renderCompactPreviousRow(correction))}
                        </div>
                      ) : null}
                    </section>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-[10px] bg-white/[0.04] p-4 text-[12px] leading-relaxed text-zinc-500">
                  Corrections will appear here as editable structured objects.
                </div>
              )}
            </section>

            <section className="mt-5 space-y-3">
              {drawingMode ? (
                <div className="rounded-[10px] bg-yellow-300/10 px-4 py-3 text-[11px] font-bold text-yellow-100">
                  Drawing new correction...
                </div>
              ) : (
                <button
                  type="button"
                  onClick={startDrawingCorrection}
                  disabled={!imageInput || generating || Boolean(historyPreviewSnapshot)}
                  className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-yellow-300 px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-zinc-950 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                >
                  <Plus size={14} />
                  Add correction
                </button>
              )}
              <label className="flex select-none items-center gap-2 text-[11px] text-zinc-500">
                <input
                  type="checkbox"
                  checked={skipCostConfirm}
                  onChange={(event) => setSkipCostConfirm(event.target.checked)}
                  className="h-3.5 w-3.5 accent-yellow-300"
                />
                Do not ask again in this Studio session
              </label>
            </section>

            <section className="mt-5 rounded-[10px] bg-black/20 p-3 text-[11px] leading-relaxed text-zinc-500">
              <div className="mb-1 flex items-center gap-2 text-zinc-300">
                <Clock3 size={13} />
                Generation is guarded
              </div>
              {plan
                ? `Plan ready: ${plan.identityReferences.length} identity refs, ${plan.directionReferences.length} direction refs, ${plan.batchPendingIds.length} pending${plan.globalAdjustmentActive ? ", global active" : ""}${plan.globalAdjustmentPending ? ", global pending" : ""}.`
                : "Gemini only runs when you apply, retry, or change active corrections."}
            </section>
          </aside>
        </main>
        {promoteModalOpen ? (
          <div className="fixed inset-0 z-[100100] flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm">
            <div className="w-full max-w-[520px] rounded-[10px] bg-[#15161d] p-6 text-zinc-100 shadow-2xl ring-1 ring-white/12">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-yellow-200/80">Promote</p>
                  <h2 className="mt-2 text-[22px] font-black tracking-tight">Promote to new master</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setPromoteModalOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/[0.05] text-zinc-400 transition hover:bg-white/10 hover:text-white"
                  aria-label="Close promote modal"
                >
                  <X size={18} />
                </button>
              </div>
              <p className="mt-4 text-[13px] leading-relaxed text-zinc-300">
                The current image becomes the new starting point for this session. All applied corrections are archived and the active panel becomes clean for new edits from here.
              </p>
              <div className="mt-4 grid gap-3 text-[12px] leading-relaxed text-zinc-400">
                <div className="rounded-[10px] bg-white/[0.045] p-3">
                  <p className="font-bold text-zinc-200">Advantages</p>
                  <p className="mt-1">Cleaner panel and faster future generations because fewer references need to travel.</p>
                </div>
                <div className="rounded-[10px] bg-white/[0.045] p-3">
                  <p className="font-bold text-zinc-200">Cost</p>
                  <p className="mt-1">The new master has one generation pass more than the original. The previous master and corrections remain archived in the session model.</p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPromoteModalOpen(false)}
                  className="rounded-[10px] bg-white/[0.06] px-4 py-2 text-[11px] font-bold text-zinc-300 transition hover:bg-white/[0.1]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={promoteCurrentWorkingToMaster}
                  disabled={!session?.workingImage}
                  className="rounded-[10px] bg-yellow-300 px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-zinc-950 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                >
                  Promote
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </StudioNodePortal>
  );
}

export const ImageCreationAdvancedNode = memo(function ImageCreationAdvancedNode({ id, data, selected }: NodeProps) {
  const nodeData = data as ImageCreationAdvancedNodeData;
  const nodes = useNodes();
  const edges = useEdges();
  const { setNodes } = useReactFlow();
  const projectAssetsCtx = useProjectAssetsCanvas();
  const [studioOpen, setStudioOpen] = useState(false);

  const imageEdge = useMemo(() => edges.find((edge) => edge.target === id && edge.targetHandle === "image"), [edges, id]);
  const promptEdge = useMemo(() => edges.find((edge) => edge.target === id && edge.targetHandle === "prompt"), [edges, id]);
  const imageSourceNode = useMemo(() => nodes.find((node) => node.id === imageEdge?.source), [imageEdge?.source, nodes]);
  const imageInput = firstImageUrlFromNode(imageSourceNode);
  const promptInput = useMemo(() => {
    if (!promptEdge) return "";
    return String(resolvePromptValueFromEdgeSource(promptEdge, nodes as Node[]) ?? "").trim();
  }, [nodes, promptEdge]);

  const session = nodeData.advancedSession;
  const outputUrl = nodeData.value || session?.workingImage?.imageUrl || "";
  const previewUrl = outputUrl || session?.master.imageUrl || imageInput;
  const status = nodeData.status ?? (outputUrl ? "output" : imageInput ? "ready" : "empty");

  const patchData = useCallback(
    (patch: Partial<ImageCreationAdvancedNodeData>) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...patch,
                },
              }
            : node,
        ),
      );
    },
    [id, setNodes],
  );

  return (
    <div
      className={`custom-node image-creation-advanced-node ${status === "error" ? "border-rose-400/60" : ""}`}
      style={{ minWidth: 312, borderRadius: 10 }}
    >
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Image Creation Advanced" />

      <div className="handle-wrapper handle-left" style={{ top: "34%" }}>
        <FoldderDataHandle type="target" position={Position.Left} id="image" dataType="image" />
        <span className="handle-label">Master</span>
      </div>
      <div className="handle-wrapper handle-left" style={{ top: "62%" }}>
        <FoldderDataHandle type="target" position={Position.Left} id="prompt" dataType="prompt" />
        <span className="handle-label">Prompt</span>
      </div>

      <div className="node-header">
        <NodeIcon
          type="imageCreationAdvanced"
          selected={selected}
          state={resolveFoldderNodeState({ selected, error: status === "error", done: status === "output" || status === "plan_ready" })}
          size={16}
        />
        <FoldderNodeHeaderTitle>Image Advanced</FoldderNodeHeaderTitle>
        <div className="node-badge max-w-[118px] truncate">{session ? `${session.corrections.length} edits` : "Master"}</div>
      </div>

      <div className="node-content space-y-3">
        <div className="relative aspect-video overflow-hidden rounded-[10px] bg-slate-950/70">
          {previewUrl ? (
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-500">
              <Sparkles size={28} strokeWidth={1.5} />
              <span className="text-[8px] font-black uppercase tracking-[0.14em]">Connect master</span>
            </div>
          )}
        </div>
        <p className="min-h-[28px] text-[9px] leading-snug text-zinc-500">
          {nodeData.error ||
            (session
              ? "Structured non destructive corrections. Generation still requires explicit guarded execution."
              : "Connect an image, open Studio, and create a master session.")}
        </p>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setStudioOpen(true);
          }}
          className="nodrag flex w-full items-center justify-center gap-2 rounded-[10px] bg-white/[0.07] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-100 transition hover:bg-white/[0.12]"
        >
          <Maximize2 size={13} />
          Open Studio
        </button>
      </div>

      <FoldderStudioModeCenterButton onClick={() => setStudioOpen(true)} />

      <div className="handle-wrapper handle-right" style={{ top: "50%" }}>
        <span className="handle-label">Image</span>
        <FoldderDataHandle type="source" position={Position.Right} id="image" dataType="image" />
      </div>

      {studioOpen ? (
        <ImageCreationAdvancedStudio
          data={nodeData}
          imageInput={imageInput}
          nodeId={id}
          projectId={projectAssetsCtx?.projectScopeId ?? null}
          promptInput={promptInput}
          onClose={() => setStudioOpen(false)}
          onPatch={patchData}
        />
      ) : null}
    </div>
  );
});
