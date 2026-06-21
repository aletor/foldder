"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getVisualAABB, renderObj, type FreehandObject } from "../FreehandStudio";
import type { VideoEditorClip } from "./video-editor-types";
import type { CompositionTransform, VideoEditorComposition, VideoEditorOverlayClip } from "./video-editor-composition-types";
import { activeOverlayClipsAtTime, getAllCompositionKeyframeTimes, resolveCompositionTransform } from "./video-editor-composition-math";
import { ensureClipComposition, type CompositionCropPreset } from "./video-editor-composition-engine";
import { clampTransform } from "./video-editor-composition-units";
import { CompositionStageGuides } from "./CompositionStageGuides";
import { useVideoEditorAssetUrl } from "./use-video-editor-asset-url";

export type VideoEditorStageMode = "select" | "crop";

const STAGE_ACCENT = "#3a8f96";

type DragKind = "move" | "resize-nw" | "resize-ne" | "resize-sw" | "resize-se" | "crop-move" | "crop-resize-nw" | "crop-resize-ne" | "crop-resize-sw" | "crop-resize-se";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function normFromClient(clientX: number, clientY: number, root: DOMRect): { nx: number; ny: number } {
  return {
    nx: (clientX - root.left) / Math.max(1, root.width),
    ny: (clientY - root.top) / Math.max(1, root.height),
  };
}

function scaleOverlayObject(
  obj: FreehandObject,
  tr: CompositionTransform,
  compWidth: number,
  compHeight: number,
): FreehandObject {
  const gx = compWidth * tr.x;
  const gy = compHeight * tr.y;
  return {
    ...obj,
    x: obj.x * tr.width + gx,
    y: obj.y * tr.height + gy,
    width: obj.width * tr.width,
    height: obj.height * tr.height,
    opacity: (obj.opacity ?? 1) * tr.opacity,
  };
}

function VisualClipLayer({
  clip,
  zIndex,
  playheadTime,
  isPlaying,
  cropPreset,
  onDurationKnown,
}: {
  clip: VideoEditorClip;
  zIndex: number;
  playheadTime: number;
  isPlaying: boolean;
  cropPreset: CompositionCropPreset;
  onDurationKnown?: (clipId: string, durationSeconds: number) => void;
}) {
  const url = useVideoEditorAssetUrl(clip.url || clip.assetId, clip.s3Key, true);
  const transform = useMemo(() => {
    const local = Math.max(0, playheadTime - clip.startTime);
    return resolveCompositionTransform(ensureClipComposition(clip), local);
  }, [clip, playheadTime]);
  const layerCropPreset: CompositionCropPreset =
    clip.compositionCropPreset ?? (clip.framing === "fit" ? "fit" : cropPreset);
  if (!url) {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center bg-black/80 text-[10px] font-black uppercase tracking-[0.1em] text-white/35"
        style={{ zIndex }}
      >
        Cargando…
      </div>
    );
  }
  if (clip.mediaType !== "video" && clip.mediaType !== "image") return null;
  return (
    <MediaLayer
      url={url}
      mediaType={clip.mediaType}
      transform={transform}
      clip={clip}
      playheadTime={playheadTime}
      isPlaying={isPlaying}
      cropPreset={layerCropPreset}
      onDurationKnown={onDurationKnown}
      style={{ zIndex }}
    />
  );
}

function MediaLayer({
  url,
  mediaType,
  transform,
  clip,
  playheadTime,
  isPlaying,
  cropPreset,
  onDurationKnown,
  style,
}: {
  url: string;
  mediaType: "video" | "image";
  transform: CompositionTransform;
  clip?: VideoEditorClip;
  playheadTime: number;
  isPlaying: boolean;
  cropPreset: CompositionCropPreset;
  onDurationKnown?: (clipId: string, durationSeconds: number) => void;
  style?: React.CSSProperties;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !clip || clip.mediaType !== "video") return;
    const targetTime = Math.max(0, (clip.trimStart ?? 0) + (playheadTime - clip.startTime));
    if (video.readyState > 0 && Math.abs(video.currentTime - targetTime) > 0.35) video.currentTime = targetTime;
    video.volume = clip.mute ? 0 : Math.max(0, Math.min(1, clip.volume ?? 1));
    if (isPlaying) {
      if (video.paused) void video.play().catch(() => undefined);
    } else if (!video.paused) {
      video.pause();
    }
  }, [clip, isPlaying, playheadTime]);
  const crop = transform.crop;
  const boxStyle: React.CSSProperties = {
    position: "absolute",
    left: `${transform.x * 100}%`,
    top: `${transform.y * 100}%`,
    width: `${transform.width * 100}%`,
    height: `${transform.height * 100}%`,
    opacity: transform.opacity,
    overflow: "hidden",
    transformOrigin: `${transform.anchorX * 100}% ${transform.anchorY * 100}%`,
    transform: `rotate(${transform.rotation}deg) scaleX(${transform.flipX ? -1 : 1}) scaleY(${transform.flipY ? -1 : 1})`,
    ...style,
  };
  const mediaStyle: React.CSSProperties = {
    position: "absolute",
    width: `${100 / Math.max(1e-6, crop.width)}%`,
    height: `${100 / Math.max(1e-6, crop.height)}%`,
    left: `${(-crop.x / Math.max(1e-6, crop.width)) * 100}%`,
    top: `${(-crop.y / Math.max(1e-6, crop.height)) * 100}%`,
    objectFit: cropPreset === "fit" ? "contain" : "cover",
  };
  return (
    <div style={boxStyle}>
      {mediaType === "video" ? (
        <video
          ref={videoRef}
          className="h-full w-full"
          src={url}
          style={mediaStyle}
          muted={clip?.mute ?? true}
          playsInline
          preload="auto"
          onLoadedMetadata={(event) => {
            const duration = event.currentTarget.duration;
            if (clip && Number.isFinite(duration) && duration > 0) onDurationKnown?.(clip.id, duration);
          }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="h-full w-full" src={url} alt="" style={mediaStyle} />
      )}
    </div>
  );
}

function CornerHandle({
  className,
  style,
  cursor,
  onPointerDown,
}: {
  className?: string;
  style: React.CSSProperties;
  cursor: string;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      role="presentation"
      className={cx("pointer-events-auto absolute z-30 h-2.5 w-2.5 touch-none border-2 bg-white shadow-sm", className)}
      style={{ ...style, borderColor: STAGE_ACCENT, cursor, touchAction: "none" }}
      onPointerDown={onPointerDown}
    />
  );
}

function SelectionFrame({
  rect,
  onMoveStart,
  onResizeStart,
}: {
  rect: { x: number; y: number; w: number; h: number };
  onMoveStart: (e: React.PointerEvent) => void;
  onResizeStart: (e: React.PointerEvent, kind: DragKind) => void;
}) {
  const pct = (n: number) => `${n * 100}%`;
  return (
    <>
      <div
        className="pointer-events-auto absolute z-20 border-2"
        style={{
          left: pct(rect.x),
          top: pct(rect.y),
          width: pct(rect.w),
          height: pct(rect.h),
          borderColor: STAGE_ACCENT,
          cursor: "move",
          touchAction: "none",
        }}
        onPointerDown={onMoveStart}
      />
      <CornerHandle
        style={{ left: `calc(${pct(rect.x)} - 5px)`, top: `calc(${pct(rect.y)} - 5px)` }}
        cursor="nwse-resize"
        onPointerDown={(e) => onResizeStart(e, "resize-nw")}
      />
      <CornerHandle
        style={{ left: `calc(${pct(rect.x + rect.w)} - 5px)`, top: `calc(${pct(rect.y)} - 5px)` }}
        cursor="nesw-resize"
        onPointerDown={(e) => onResizeStart(e, "resize-ne")}
      />
      <CornerHandle
        style={{ left: `calc(${pct(rect.x)} - 5px)`, top: `calc(${pct(rect.y + rect.h)} - 5px)` }}
        cursor="nesw-resize"
        onPointerDown={(e) => onResizeStart(e, "resize-sw")}
      />
      <CornerHandle
        style={{ left: `calc(${pct(rect.x + rect.w)} - 5px)`, top: `calc(${pct(rect.y + rect.h)} - 5px)` }}
        cursor="nwse-resize"
        onPointerDown={(e) => onResizeStart(e, "resize-se")}
      />
    </>
  );
}

function CropOverlay({
  transform,
  onCropDragStart,
}: {
  transform: CompositionTransform;
  onCropDragStart: (e: React.PointerEvent, kind: DragKind) => void;
}) {
  const box = transform;
  const crop = transform.crop;
  const outer = { x: box.x, y: box.y, w: box.width, h: box.height };
  const inner = {
    x: box.x + crop.x * box.width,
    y: box.y + crop.y * box.height,
    w: crop.width * box.width,
    h: crop.height * box.height,
  };
  const pct = (n: number) => `${n * 100}%`;

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-10 bg-black/55" />
      <div
        className="pointer-events-none absolute z-[11] border-2 border-dashed"
        style={{
          left: pct(inner.x),
          top: pct(inner.y),
          width: pct(inner.w),
          height: pct(inner.h),
          borderColor: STAGE_ACCENT,
          boxShadow: `0 0 0 9999px rgba(0,0,0,0.55)`,
        }}
      />
      <div
        className="pointer-events-auto absolute z-20 border-2"
        style={{
          left: pct(inner.x),
          top: pct(inner.y),
          width: pct(inner.w),
          height: pct(inner.h),
          borderColor: STAGE_ACCENT,
          cursor: "move",
          touchAction: "none",
        }}
        onPointerDown={(e) => onCropDragStart(e, "crop-move")}
      />
      <CornerHandle
        style={{ left: `calc(${pct(inner.x)} - 5px)`, top: `calc(${pct(inner.y)} - 5px)` }}
        cursor="nwse-resize"
        onPointerDown={(e) => onCropDragStart(e, "crop-resize-nw")}
      />
      <CornerHandle
        style={{ left: `calc(${pct(inner.x + inner.w)} - 5px)`, top: `calc(${pct(inner.y)} - 5px)` }}
        cursor="nesw-resize"
        onPointerDown={(e) => onCropDragStart(e, "crop-resize-ne")}
      />
      <CornerHandle
        style={{ left: `calc(${pct(inner.x)} - 5px)`, top: `calc(${pct(inner.y + inner.h)} - 5px)` }}
        cursor="nesw-resize"
        onPointerDown={(e) => onCropDragStart(e, "crop-resize-sw")}
      />
      <CornerHandle
        style={{ left: `calc(${pct(inner.x + inner.w)} - 5px)`, top: `calc(${pct(inner.y + inner.h)} - 5px)` }}
        cursor="nwse-resize"
        onPointerDown={(e) => onCropDragStart(e, "crop-resize-se")}
      />
      <div className="pointer-events-none absolute z-5 opacity-0" aria-hidden style={{ left: pct(outer.x), top: pct(outer.y), width: pct(outer.w), height: pct(outer.h) }} />
    </>
  );
}

function KeyframeStrip({
  composition,
  localDuration,
  localPlayhead,
  onSeek,
}: {
  composition: VideoEditorComposition;
  localDuration: number;
  localPlayhead: number;
  onSeek: (time: number) => void;
}) {
  const span = Math.max(0.1, localDuration);
  const keyframeTimes = getAllCompositionKeyframeTimes(composition);
  return (
    <div className="relative mt-1 h-4 shrink-0 overflow-hidden rounded-sm bg-white/[0.06]">
      <div
        className="absolute top-0 bottom-0 w-px bg-[#3a8f96]"
        style={{ left: `${Math.min(100, (localPlayhead / span) * 100)}%` }}
      />
      {keyframeTimes.map((time) => (
        <button
          key={`kf-${time}`}
          type="button"
          title={`Keyframe ${time.toFixed(2)}s`}
          className="absolute top-1/2 z-10 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-[#3a8f96] bg-white hover:bg-[#3a8f96]/30"
          style={{ left: `${Math.min(100, (time / span) * 100)}%` }}
          onClick={() => onSeek(time)}
        />
      ))}
    </div>
  );
}

export function VideoEditorCompositionStage({
  compWidth,
  compHeight,
  visualClip,
  visualLayers,
  overlayClips,
  playheadTime,
  isPlaying,
  stageMode,
  onStageModeChange,
  animateMode,
  onAnimateModeChange,
  selectedClipId,
  selectedOverlayId,
  compositionTarget,
  compositionTransform,
  targetComposition,
  cropPreset,
  onSelectClip,
  onSelectOverlay,
  onDeselect,
  onTransformChange,
  onOverlayTextChange,
  onDurationKnown,
  onSeekLocalTime,
  onAddOverlay,
  showGuides,
  onShowGuidesChange,
  showCompositionToolbar = false,
}: {
  compWidth: number;
  compHeight: number;
  visualClip?: VideoEditorClip;
  visualLayers: VideoEditorClip[];
  overlayClips: VideoEditorOverlayClip[];
  playheadTime: number;
  isPlaying: boolean;
  stageMode: VideoEditorStageMode;
  onStageModeChange: (mode: VideoEditorStageMode) => void;
  animateMode: boolean;
  onAnimateModeChange: (on: boolean) => void;
  selectedClipId?: string;
  selectedOverlayId?: string;
  compositionTarget: { kind: "clip"; clipId: string } | { kind: "overlay"; overlayId: string } | null;
  compositionTransform: CompositionTransform | null;
  targetComposition: VideoEditorComposition | null;
  cropPreset: CompositionCropPreset;
  onSelectClip: (clipId: string) => void;
  onSelectOverlay: (overlayId: string) => void;
  onDeselect: () => void;
  onTransformChange: (transform: CompositionTransform) => void;
  onOverlayTextChange: (overlayId: string, text: string) => void;
  onDurationKnown?: (clipId: string, durationSeconds: number) => void;
  onSeekLocalTime: (time: number) => void;
  onAddOverlay: (kind: "text" | "rect" | "color") => void;
  showGuides: boolean;
  onShowGuidesChange: (on: boolean) => void;
  showCompositionToolbar?: boolean;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [inlineEditOverlayId, setInlineEditOverlayId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{
    kind: DragKind;
    startNx: number;
    startNy: number;
    startTransform: CompositionTransform;
  } | null>(null);

  const compositedLayers = useMemo(
    () => [...visualLayers].reverse(),
    [visualLayers],
  );

  const targetClip = useMemo(() => {
    if (compositionTarget?.kind !== "clip") return visualClip;
    return visualLayers.find((clip) => clip.id === compositionTarget.clipId) ?? visualClip;
  }, [compositionTarget, visualClip, visualLayers]);

  const activeOverlays = useMemo(
    () => [...activeOverlayClipsAtTime(overlayClips, playheadTime)].sort((a, b) => (a.layerOrder ?? 0) - (b.layerOrder ?? 0)),
    [overlayClips, playheadTime],
  );

  const overlayBounds = useMemo(() => {
    const map = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const overlay of activeOverlays) {
      const local = Math.max(0, playheadTime - overlay.startTime);
      const tr = resolveCompositionTransform(overlay.composition, local);
      const scaled = scaleOverlayObject(overlay.object, tr, compWidth, compHeight);
      const aabb = getVisualAABB(scaled, [scaled]);
      map.set(overlay.id, {
        x: aabb.x / compWidth,
        y: aabb.y / compHeight,
        w: aabb.w / compWidth,
        h: aabb.h / compHeight,
      });
    }
    return map;
  }, [activeOverlays, compHeight, compWidth, playheadTime]);

  const applyDrag = useCallback(
    (kind: DragKind, nx: number, ny: number, start: CompositionTransform) => {
      const dx = nx - (drag?.startNx ?? nx);
      const dy = ny - (drag?.startNy ?? ny);
      let next = { ...start, crop: { ...start.crop } };
      if (kind === "move") {
        next = { ...next, x: start.x + dx, y: start.y + dy };
      } else if (kind.startsWith("resize-")) {
        const brx = start.x + start.width;
        const bry = start.y + start.height;
        if (kind === "resize-se") {
          next.width = Math.max(0.02, nx - start.x);
          next.height = Math.max(0.02, ny - start.y);
        } else if (kind === "resize-nw") {
          next.x = nx;
          next.y = ny;
          next.width = Math.max(0.02, brx - nx);
          next.height = Math.max(0.02, bry - ny);
        } else if (kind === "resize-ne") {
          next.y = ny;
          next.width = Math.max(0.02, nx - start.x);
          next.height = Math.max(0.02, bry - ny);
        } else if (kind === "resize-sw") {
          next.x = nx;
          next.width = Math.max(0.02, brx - nx);
          next.height = Math.max(0.02, ny - start.y);
        }
      } else if (kind === "crop-move") {
        const maxX = 1 - start.crop.width;
        const maxY = 1 - start.crop.height;
        next.crop = {
          ...start.crop,
          x: Math.max(0, Math.min(maxX, start.crop.x + dx / Math.max(1e-6, start.width))),
          y: Math.max(0, Math.min(maxY, start.crop.y + dy / Math.max(1e-6, start.height))),
        };
      } else if (kind.startsWith("crop-resize-")) {
        const c = { ...start.crop };
        const relNx = (nx - start.x) / Math.max(1e-6, start.width);
        const relNy = (ny - start.y) / Math.max(1e-6, start.height);
        if (kind === "crop-resize-se") {
          c.width = Math.max(0.05, relNx - c.x);
          c.height = Math.max(0.05, relNy - c.y);
        } else if (kind === "crop-resize-nw") {
          const brx = c.x + c.width;
          const bry = c.y + c.height;
          c.x = Math.max(0, Math.min(brx - 0.05, relNx));
          c.y = Math.max(0, Math.min(bry - 0.05, relNy));
          c.width = brx - c.x;
          c.height = bry - c.y;
        } else if (kind === "crop-resize-ne") {
          const bry = c.y + c.height;
          c.y = Math.max(0, Math.min(bry - 0.05, relNy));
          c.width = Math.max(0.05, relNx - c.x);
          c.height = bry - c.y;
        } else if (kind === "crop-resize-sw") {
          const brx = c.x + c.width;
          c.x = Math.max(0, Math.min(brx - 0.05, relNx));
          c.width = brx - c.x;
          c.height = Math.max(0.05, relNy - c.y);
        }
        next.crop = c;
      }
      onTransformChange(clampTransform(next));
    },
    [drag?.startNx, drag?.startNy, onTransformChange],
  );

  useEffect(() => {
    if (!drag) return undefined;
    const onMove = (ev: PointerEvent) => {
      const root = frameRef.current?.getBoundingClientRect();
      if (!root) return;
      const { nx, ny } = normFromClient(ev.clientX, ev.clientY, root);
      applyDrag(drag.kind, nx, ny, drag.startTransform);
    };
    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [applyDrag, drag]);

  const beginDrag = (e: React.PointerEvent, kind: DragKind, transform: CompositionTransform) => {
    e.stopPropagation();
    e.preventDefault();
    const root = frameRef.current?.getBoundingClientRect();
    if (!root) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const { nx, ny } = normFromClient(e.clientX, e.clientY, root);
    setDrag({ kind, startNx: nx, startNy: ny, startTransform: cloneCompositionTransformLocal(transform) });
  };

  const localDuration = useMemo(() => {
    if (!compositionTarget) return 1;
    if (compositionTarget.kind === "clip") {
      const clip = targetClip?.id === compositionTarget.clipId ? targetClip : undefined;
      return clip?.durationSeconds ?? 1;
    }
    const overlay = overlayClips.find((o) => o.id === compositionTarget.overlayId);
    return overlay?.durationSeconds ?? 1;
  }, [compositionTarget, overlayClips, targetClip]);

  const localPlayhead = useMemo(() => {
    if (!compositionTarget) return 0;
    if (compositionTarget.kind === "clip") {
      const clip = targetClip?.id === compositionTarget.clipId ? targetClip : undefined;
      return clip ? Math.max(0, playheadTime - clip.startTime) : 0;
    }
    const overlay = overlayClips.find((o) => o.id === compositionTarget.overlayId);
    return overlay ? Math.max(0, playheadTime - overlay.startTime) : 0;
  }, [compositionTarget, overlayClips, playheadTime, targetClip]);

  const selectedOverlayRect = selectedOverlayId ? overlayBounds.get(selectedOverlayId) : undefined;
  const showClipSelection =
    stageMode === "select" &&
    compositionTarget?.kind === "clip" &&
    compositionTransform &&
    (selectedClipId === compositionTarget.clipId || (!selectedOverlayId && targetClip?.id === compositionTarget.clipId));
  const showOverlaySelection =
    stageMode === "select" &&
    selectedOverlayId &&
    selectedOverlayRect &&
    compositionTarget?.kind === "overlay";

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center bg-black">
      {showCompositionToolbar ? (
      <div className="pointer-events-none absolute left-1/2 top-2 z-40 -translate-x-1/2">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-sm border border-white/15 bg-[#1a1f28]/95 px-1 py-0.5 shadow-lg backdrop-blur-sm">
          {[
            ["select", "Seleccionar"],
            ["crop", "Recortar"],
          ].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => onStageModeChange(mode as VideoEditorStageMode)}
              className={cx(
                "px-2 py-1 text-[9px] font-black uppercase tracking-[0.06em] transition",
                stageMode === mode ? "bg-[#3a8f96]/25 text-white" : "text-white/45 hover:text-white/75",
              )}
            >
              {label}
            </button>
          ))}
          <span className="mx-0.5 h-4 w-px bg-white/15" />
          {[
            ["text", "Texto"],
            ["rect", "Forma"],
            ["color", "Color"],
          ].map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              onClick={() => onAddOverlay(kind as "text" | "rect" | "color")}
              className="px-2 py-1 text-[9px] font-black uppercase tracking-[0.06em] text-white/45 hover:bg-white/[0.06] hover:text-white/75"
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onShowGuidesChange(!showGuides)}
            className={cx(
              "px-2 py-1 text-[9px] font-black uppercase tracking-[0.06em] transition",
              showGuides ? "bg-[#3a8f96]/25 text-white" : "text-white/45 hover:text-white/75",
            )}
          >
            Guías
          </button>
          <span className="mx-0.5 h-4 w-px bg-white/15" />
          <button
            type="button"
            onClick={() => onAnimateModeChange(!animateMode)}
            className={cx(
              "px-2 py-1 text-[9px] font-black uppercase tracking-[0.06em] transition",
              animateMode ? "bg-[#3a8f96]/25 text-white" : "text-white/45 hover:text-white/75",
            )}
          >
            Animar
          </button>
        </div>
      </div>
      ) : null}

      <div className="flex min-h-0 w-full flex-1 items-center justify-center p-1">
      <div
        ref={frameRef}
        className="relative h-full max-h-full w-full max-w-full overflow-hidden bg-[#111]"
        style={{ aspectRatio: `${compWidth} / ${compHeight}` }}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (visualLayers.length > 0 && stageMode === "select") onSelectClip(visualLayers[0].id);
          else onDeselect();
        }}
      >
        {compositedLayers.length === 0 ? (
          <div className="flex h-full min-h-[120px] items-center justify-center text-[11px] font-black uppercase tracking-[0.1em] text-white/30">
            Sin clip visual
          </div>
        ) : (
          compositedLayers.map((clip, index) => (
            <VisualClipLayer
              key={clip.id}
              clip={clip}
              zIndex={index + 1}
              playheadTime={playheadTime}
              isPlaying={isPlaying}
              cropPreset={cropPreset}
              onDurationKnown={onDurationKnown}
            />
          ))
        )}

        {showGuides ? <CompositionStageGuides /> : null}

        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${compWidth} ${compHeight}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {activeOverlays.map((overlay) => {
            const local = Math.max(0, playheadTime - overlay.startTime);
            const tr = resolveCompositionTransform(overlay.composition, local);
            const scaled = scaleOverlayObject(overlay.object, tr, compWidth, compHeight);
            return <g key={overlay.id}>{renderObj(scaled, [scaled], new Set())}</g>;
          })}
        </svg>

        {activeOverlays.map((overlay) => {
          const bounds = overlayBounds.get(overlay.id);
          if (!bounds) return null;
          const isSel = overlay.id === selectedOverlayId;
          return (
            <button
              key={`hit-${overlay.id}`}
              type="button"
              aria-label={`Seleccionar ${overlay.title}`}
              className={cx("absolute z-[15] border-2", isSel ? "border-[#3a8f96]" : "border-transparent hover:border-white/20")}
              style={{
                left: `${bounds.x * 100}%`,
                top: `${bounds.y * 100}%`,
                width: `${bounds.w * 100}%`,
                height: `${bounds.h * 100}%`,
                background: "transparent",
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectOverlay(overlay.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (overlay.object.type === "text") {
                  setInlineEditOverlayId(overlay.id);
                  onSelectOverlay(overlay.id);
                }
              }}
            />
          );
        })}

        {inlineEditOverlayId ? (() => {
          const overlay = activeOverlays.find((o) => o.id === inlineEditOverlayId);
          if (!overlay || overlay.object.type !== "text") return null;
          const local = Math.max(0, playheadTime - overlay.startTime);
          const tr = resolveCompositionTransform(overlay.composition, local);
          const scaled = scaleOverlayObject(overlay.object, tr, compWidth, compHeight);
          const textObj = scaled as FreehandObject & {
            text?: string;
            fontSize?: number;
            fontFamily?: string;
            fontWeight?: number;
            fontStyle?: string;
            letterSpacing?: number;
            lineHeight?: number;
            textAlign?: string;
            fill?: { color?: string };
          };
          return (
            <svg
              key={`edit-${overlay.id}`}
              className="pointer-events-none absolute inset-0 z-50 h-full w-full"
              viewBox={`0 0 ${compWidth} ${compHeight}`}
              preserveAspectRatio="xMidYMid meet"
            >
              <foreignObject x={scaled.x} y={scaled.y} width={scaled.width} height={scaled.height}>
                <div
                  contentEditable
                  suppressContentEditableWarning
                  className="pointer-events-auto h-full w-full outline-none"
                  style={{
                    fontSize: textObj.fontSize ?? 48,
                    fontFamily: textObj.fontFamily ?? "Inter, system-ui, sans-serif",
                    fontWeight: textObj.fontWeight ?? 700,
                    fontStyle: textObj.fontStyle === "italic" ? "italic" : "normal",
                    letterSpacing: `${textObj.letterSpacing ?? 0}px`,
                    textAlign: (textObj.textAlign as React.CSSProperties["textAlign"]) ?? "center",
                    color: textObj.fill?.color ?? "#ffffff",
                    lineHeight: textObj.lineHeight ?? 1.1,
                  }}
                  ref={(el) => {
                    if (el && el.textContent !== (textObj.text ?? "Texto")) {
                      el.textContent = textObj.text ?? "Texto";
                    }
                    el?.focus();
                  }}
                  onBlur={(e) => {
                    onOverlayTextChange(overlay.id, e.currentTarget.textContent ?? "");
                    setInlineEditOverlayId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setInlineEditOverlayId(null);
                    }
                  }}
                />
              </foreignObject>
            </svg>
          );
        })() : null}

        {stageMode === "crop" && compositionTarget?.kind === "clip" && compositionTransform ? (
          <CropOverlay
            transform={compositionTransform}
            onCropDragStart={(e, kind) => beginDrag(e, kind, compositionTransform)}
          />
        ) : null}

        {showClipSelection && compositionTransform ? (
          <SelectionFrame
            rect={{ x: compositionTransform.x, y: compositionTransform.y, w: compositionTransform.width, h: compositionTransform.height }}
            onMoveStart={(e) => beginDrag(e, "move", compositionTransform)}
            onResizeStart={(e, kind) => beginDrag(e, kind, compositionTransform)}
          />
        ) : null}

        {showOverlaySelection && selectedOverlayRect && compositionTransform ? (
          <SelectionFrame
            rect={{
              x: selectedOverlayRect.x,
              y: selectedOverlayRect.y,
              w: selectedOverlayRect.w,
              h: selectedOverlayRect.h,
            }}
            onMoveStart={(e) => beginDrag(e, "move", compositionTransform)}
            onResizeStart={(e, kind) => beginDrag(e, kind, compositionTransform)}
          />
        ) : null}
      </div>
      </div>

      {compositionTarget && targetComposition ? (
        <div className="mt-1 w-full max-w-full px-1">
          <KeyframeStrip
            composition={targetComposition}
            localDuration={localDuration}
            localPlayhead={localPlayhead}
            onSeek={onSeekLocalTime}
          />
        </div>
      ) : null}
    </div>
  );
}

function cloneCompositionTransformLocal(t: CompositionTransform): CompositionTransform {
  return { ...t, crop: { ...t.crop } };
}

/** @deprecated Use VideoEditorCompositionStage */
export { VideoEditorCompositionStage as VideoEditorCompositionPreview };
