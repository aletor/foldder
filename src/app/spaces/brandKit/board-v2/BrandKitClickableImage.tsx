"use client";

import React, { useMemo } from "react";
import { resolveBrandKitPreviewUrl } from "@/lib/brandkit/brand-kit-media-url";
import { BrandKitMediaImage } from "../BrandKitMediaImage";
import { useBrandKitImageLightbox } from "./BrandKitImageLightbox";

export type BrandKitImageFit = "contain" | "cover" | "square" | "logo";

export function BrandKitClickableImage({
  src,
  fit = "contain",
  wrapperClassName = "",
  alt = "",
  eager = false,
}: {
  src: string;
  fit?: BrandKitImageFit;
  wrapperClassName?: string;
  alt?: string;
  eager?: boolean;
}) {
  const { openImage } = useBrandKitImageLightbox();
  const resolvedSrc = useMemo(() => resolveBrandKitPreviewUrl(src), [src]);

  if (!src) return null;

  const open = () => openImage(resolvedSrc);

  return (
    <div
      role="button"
      tabIndex={0}
      className={`brandKit-clickable-image brandKit-clickable-image--${fit} ${wrapperClassName}`.trim()}
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
      <BrandKitMediaImage src={src} alt={alt} eager={eager} />
    </div>
  );
}
