"use client";

/* eslint-disable @next/next/no-img-element */

import React, { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { useGenomaPreviewMediaUrl } from "./use-genoma-preview-media";

export type GenomaPreviewImageProps = {
  src: string;
  alt?: string;
  className?: string;
  draggable?: boolean;
  eager?: boolean;
  width?: number;
  height?: number;
  "aria-hidden"?: boolean;
};

/** Único punto del código Genoma autorizado a renderizar `<img>` con medios autenticados. */
export const GenomaPreviewImage = forwardRef<HTMLImageElement, GenomaPreviewImageProps>(
  function GenomaPreviewImage(
    {
      src,
      alt = "",
      className = "",
      draggable = false,
      eager = false,
      width,
      height,
      "aria-hidden": ariaHidden,
    },
    ref,
  ) {
    const { displayUrl, isLoading, needsAuthBlob, retryWithBlob } = useGenomaPreviewMediaUrl(src);
    const [failed, setFailed] = useState(false);
    const [retryNonce, setRetryNonce] = useState(0);
    const retryAttemptRef = useRef(0);

    useEffect(() => {
      setFailed(false);
      retryAttemptRef.current = 0;
      setRetryNonce(0);
    }, [src]);

    const effectiveSrc = useMemo(() => {
      if (!displayUrl || retryNonce === 0) return displayUrl;
      const join = displayUrl.includes("?") ? "&" : "?";
      return `${displayUrl}${join}genoma_retry=${retryNonce}`;
    }, [displayUrl, retryNonce]);

    if (!src || failed) {
      return (
        <div className={`genoma-preview-image genoma-preview-image--placeholder ${className}`.trim()} aria-hidden />
      );
    }

    if (isLoading || (needsAuthBlob && !displayUrl)) {
      return (
        <div
          className={`genoma-preview-image genoma-preview-image--placeholder genoma-preview-image--loading ${className}`.trim()}
          aria-hidden
        />
      );
    }

    if (!effectiveSrc) {
      return (
        <div className={`genoma-preview-image genoma-preview-image--placeholder ${className}`.trim()} aria-hidden />
      );
    }

    return (
      <img
        ref={ref}
        key={effectiveSrc}
        src={effectiveSrc}
        alt={alt}
        className={`genoma-preview-image ${className}`.trim()}
        draggable={draggable}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        width={width}
        height={height}
        aria-hidden={ariaHidden}
        onError={() => {
          if (retryAttemptRef.current < 4) {
            retryAttemptRef.current += 1;
            void retryWithBlob();
            window.setTimeout(() => {
              setRetryNonce((value) => value + 1);
            }, retryAttemptRef.current * 800);
            return;
          }
          setFailed(true);
        }}
      />
    );
  },
);

GenomaPreviewImage.displayName = "GenomaPreviewImage";
