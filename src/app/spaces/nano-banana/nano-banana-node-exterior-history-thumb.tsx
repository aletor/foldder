"use client";

import { useAuthedMediaPreviewUrl } from "../hooks/use-authed-media-preview-url";

export function NanoBananaNodeExteriorHistoryThumb({
  url,
  index,
  mediaVisible,
}: {
  url: string;
  index: number;
  mediaVisible: boolean;
}) {
  const { displayUrl, retryWithBlob } = useAuthedMediaPreviewUrl(url, null, { canvasThumbnail: true });

  return (
    <div className="nano-banana-node-history-strip__thumb" title={`Versión ${index + 1}`}>
      {mediaVisible && displayUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={displayUrl}
          alt=""
          className="nano-banana-node-history-strip__img"
          decoding="async"
          draggable={false}
          onError={() => {
            void retryWithBlob();
          }}
        />
      ) : (
        <span className="nano-banana-node-history-strip__index">{index + 1}</span>
      )}
    </div>
  );
}
