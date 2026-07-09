"use client";

import React from "react";
import { GenomaPreviewImage } from "./GenomaPreviewImage";
import { useGenomaImageLightbox } from "./GenomaImageLightbox";

export function GenomaClickableImage({
  src,
  className,
  wrapperClassName = "",
  alt = "",
}: {
  src: string;
  className?: string;
  wrapperClassName?: string;
  alt?: string;
}) {
  const { openImage } = useGenomaImageLightbox();

  if (!src) return null;

  const open = () => openImage(src);

  return (
    <div
      role="button"
      tabIndex={0}
      className={`genoma-clickable-image ${wrapperClassName}`.trim()}
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
      <GenomaPreviewImage src={src} className={className ?? "genoma-clickable-image__img"} alt={alt} />
    </div>
  );
}
