"use client";

/* eslint-disable @next/next/no-img-element */

import React, { useState } from "react";

function isS3ProxyUrl(src: string): boolean {
  return src.startsWith("/api/spaces/s3-file") || src.includes("/api/spaces/s3-file");
}

export function GenomaPreviewImage({
  src,
  alt = "",
  className,
  draggable = false,
}: {
  src: string;
  alt?: string;
  className?: string;
  draggable?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <div className={`genoma-v2-img-placeholder${className ? ` ${className}` : ""}`} aria-hidden />;
  }

  const useNoReferrer = src.startsWith("http") && !isS3ProxyUrl(src);

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      draggable={draggable}
      referrerPolicy={useNoReferrer ? "no-referrer" : undefined}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
