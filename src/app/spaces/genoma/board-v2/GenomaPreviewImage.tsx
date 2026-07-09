"use client";

/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useMemo, useState } from "react";
import { resolveGenomaPreviewUrl } from "@/lib/genoma/genoma-media-url";

export function GenomaPreviewImage({
  src,
  alt = "",
  className = "",
  draggable = false,
  eager = false,
}: {
  src: string;
  alt?: string;
  className?: string;
  draggable?: boolean;
  eager?: boolean;
}) {
  const resolvedSrc = useMemo(() => resolveGenomaPreviewUrl(src), [src]);
  const [displaySrc, setDisplaySrc] = useState(resolvedSrc);
  const [failed, setFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    setDisplaySrc(resolvedSrc);
    setFailed(false);
    setRetryCount(0);
  }, [resolvedSrc]);

  if (!displaySrc || failed) {
    return <div className={`genoma-preview-image genoma-preview-image--placeholder ${className}`.trim()} aria-hidden />;
  }

  return (
    <img
      src={displaySrc}
      alt={alt}
      className={`genoma-preview-image ${className}`.trim()}
      draggable={draggable}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => {
        if (retryCount < 1 && resolvedSrc.includes("/api/spaces/genoma/media-proxy")) {
          const separator = resolvedSrc.includes("?") ? "&" : "?";
          setDisplaySrc(`${resolvedSrc}${separator}retry=${Date.now()}`);
          setRetryCount((count) => count + 1);
          return;
        }
        setFailed(true);
      }}
    />
  );
}
