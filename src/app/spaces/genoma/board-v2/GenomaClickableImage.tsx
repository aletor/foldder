"use client";

import React, { useMemo } from "react";
import { resolveGenomaPreviewUrl } from "@/lib/genoma/genoma-media-url";
import { GenomaMediaImage } from "../GenomaMediaImage";
import { useGenomaImageLightbox } from "./GenomaImageLightbox";

export type GenomaImageFit = "contain" | "cover" | "square" | "logo";

export function GenomaClickableImage({
  src,
  fit = "contain",
  wrapperClassName = "",
  alt = "",
  eager = false,
}: {
  src: string;
  fit?: GenomaImageFit;
  wrapperClassName?: string;
  alt?: string;
  eager?: boolean;
}) {
  const { openImage } = useGenomaImageLightbox();
  const resolvedSrc = useMemo(() => resolveGenomaPreviewUrl(src), [src]);

  if (!src) return null;

  const open = () => openImage(resolvedSrc);

  return (
    <div
      role="button"
      tabIndex={0}
      className={`genoma-clickable-image genoma-clickable-image--${fit} ${wrapperClassName}`.trim()}
      aria-label="Ampliar imagen"
      onClick={(event) => {
        event.stopPropagation();
        open();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          open();
        }
      }}
    >
      <GenomaMediaImage src={src} alt={alt} eager={eager} />
    </div>
  );
}
