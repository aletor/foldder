"use client";

import { useEffect, useRef } from "react";
import { Film } from "lucide-react";
import type { MediaListItem } from "../media-list-output";
import { useVideoEditorAssetUrl } from "./use-video-editor-asset-url";

export function VideoEditorNodeExteriorFrameCell({
  item,
  mediaVisible,
  label,
}: {
  item: MediaListItem;
  mediaVisible: boolean;
  label: string;
}) {
  const url = useVideoEditorAssetUrl(item.url || item.assetId, item.s3Key, mediaVisible);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || item.mediaType !== "video") return;
    const seek = () => {
      if (video.readyState > 0 && video.currentTime > 0.05) {
        video.currentTime = 0;
      }
      video.pause();
    };
    seek();
    video.addEventListener("loadeddata", seek);
    return () => video.removeEventListener("loadeddata", seek);
  }, [item.mediaType, url]);

  return (
    <div className="video-editor-node-frame-grid__cell">
      {!mediaVisible || !url ? (
        <div className="video-editor-node-frame-grid__placeholder">
          <Film size={22} aria-hidden />
        </div>
      ) : item.mediaType === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="video-editor-node-frame-grid__media" draggable={false} />
      ) : (
        <video
          ref={videoRef}
          src={url}
          className="video-editor-node-frame-grid__media"
          muted
          playsInline
          preload="metadata"
        />
      )}
      <span className="video-editor-node-frame-grid__label">{label}</span>
    </div>
  );
}
