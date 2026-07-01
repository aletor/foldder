"use client";

import { ImageIcon } from "lucide-react";
import { useAuthedMediaPreviewUrl } from "../hooks/use-authed-media-preview-url";

export function NanoBananaNodeExteriorGridCell({
  url,
  label,
  mediaVisible,
}: {
  url: string;
  label: string;
  mediaVisible: boolean;
}) {
  const { displayUrl } = useAuthedMediaPreviewUrl(url, null, { canvasThumbnail: true });

  return (
    <div className="nano-banana-node-frame-grid__cell">
      {!mediaVisible || !displayUrl ? (
        <div className="nano-banana-node-frame-grid__placeholder">
          <ImageIcon size={22} aria-hidden />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={displayUrl} alt="" className="nano-banana-node-frame-grid__media" decoding="async" draggable={false} />
      )}
      <span className="nano-banana-node-frame-grid__label">{label}</span>
    </div>
  );
}
