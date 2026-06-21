"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { renderObj } from "../FreehandStudio";
import type { VideoEditorClip } from "./video-editor-types";
import type { CompositionTransform, VideoEditorOverlayClip } from "./video-editor-composition-types";
import { activeOverlayClipsAtTime, resolveCompositionTransform } from "./video-editor-composition-math";
import { ensureClipComposition } from "./video-editor-composition-engine";

function MediaLayer({
  url,
  mediaType,
  transform,
  clip,
  playheadTime,
  isPlaying,
  onDurationKnown,
}: {
  url: string;
  mediaType: "video" | "image";
  transform: CompositionTransform;
  clip?: VideoEditorClip;
  playheadTime: number;
  isPlaying: boolean;
  onDurationKnown?: (clipId: string, durationSeconds: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !clip || clip.mediaType !== "video") return;
    const targetTime = Math.max(0, (clip.trimStart ?? 0) + (playheadTime - clip.startTime));
    if (video.readyState > 0 && Math.abs(video.currentTime - targetTime) > 0.35) video.currentTime = targetTime;
    video.volume = clip.mute ? 0 : Math.max(0, Math.min(1, clip.volume ?? 1));
    if (isPlaying) void video.play().catch(() => undefined);
    else video.pause();
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
  };
  const mediaStyle: React.CSSProperties = {
    position: "absolute",
    width: `${100 / Math.max(1e-6, crop.width)}%`,
    height: `${100 / Math.max(1e-6, crop.height)}%`,
    left: `${(-crop.x / Math.max(1e-6, crop.width)) * 100}%`,
    top: `${(-crop.y / Math.max(1e-6, crop.height)) * 100}%`,
    objectFit: "cover",
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

export function VideoEditorCompositionPreview({
  compWidth,
  compHeight,
  visualClip,
  visualUrl,
  overlayClips,
  playheadTime,
  isPlaying,
  selectedOverlayId,
  onSelectOverlay,
  onDurationKnown,
}: {
  compWidth: number;
  compHeight: number;
  visualClip?: VideoEditorClip;
  visualUrl?: string | null;
  overlayClips: VideoEditorOverlayClip[];
  playheadTime: number;
  isPlaying: boolean;
  selectedOverlayId?: string;
  onSelectOverlay?: (id: string) => void;
  onDurationKnown?: (clipId: string, durationSeconds: number) => void;
}) {
  const visualTransform = useMemo(() => {
    if (!visualClip) return null;
    const local = Math.max(0, playheadTime - visualClip.startTime);
    return resolveCompositionTransform(ensureClipComposition(visualClip), local);
  }, [visualClip, playheadTime]);

  const activeOverlays = useMemo(
    () => activeOverlayClipsAtTime(overlayClips, playheadTime),
    [overlayClips, playheadTime],
  );

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-black">
      <div
        className="relative max-h-full max-w-full overflow-hidden bg-[#111]"
        style={{ aspectRatio: `${compWidth} / ${compHeight}`, width: "100%" }}
      >
        {!visualClip || !visualUrl || !visualTransform ? (
          <div className="flex h-full min-h-[120px] items-center justify-center text-[11px] font-black uppercase tracking-[0.1em] text-white/30">
            Sin clip visual
          </div>
        ) : visualClip.mediaType === "video" || visualClip.mediaType === "image" ? (
          <MediaLayer
            url={visualUrl}
            mediaType={visualClip.mediaType}
            transform={visualTransform}
            clip={visualClip}
            playheadTime={playheadTime}
            isPlaying={isPlaying}
            onDurationKnown={onDurationKnown}
          />
        ) : null}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${compWidth} ${compHeight}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {activeOverlays.map((overlay) => {
            const local = Math.max(0, playheadTime - overlay.startTime);
            const tr = resolveCompositionTransform(overlay.composition, local);
            const obj = overlay.object;
            const gx = compWidth * tr.x;
            const gy = compHeight * tr.y;
            const scaled = {
              ...obj,
              x: obj.x * tr.width + gx,
              y: obj.y * tr.height + gy,
              width: obj.width * tr.width,
              height: obj.height * tr.height,
              opacity: (obj.opacity ?? 1) * tr.opacity,
            };
            return <g key={overlay.id}>{renderObj(scaled, [scaled], new Set())}</g>;
          })}
        </svg>
        {activeOverlays.map((overlay) => {
          const local = Math.max(0, playheadTime - overlay.startTime);
          const tr = resolveCompositionTransform(overlay.composition, local);
          const isSel = overlay.id === selectedOverlayId;
          return (
            <button
              key={`hit-${overlay.id}`}
              type="button"
              aria-label={`Seleccionar ${overlay.title}`}
              className={`absolute border-2 ${isSel ? "border-[#3a8f96]" : "border-transparent hover:border-white/25"}`}
              style={{
                left: `${tr.x * 100}%`,
                top: `${tr.y * 100}%`,
                width: `${tr.width * 100}%`,
                height: `${tr.height * 100}%`,
                opacity: 0.001,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectOverlay?.(overlay.id);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
