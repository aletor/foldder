"use client";

import type { CandidateDerived } from "@/lib/genoma/model/evidence";
import type { LogoValue } from "@/lib/genoma/model/trait-values";
import { resolveLogoDisplayUrl, resolveLogoVariantUrl } from "@/lib/genoma/projection/logo-display-url";
import { GenomaMediaImage } from "./GenomaMediaImage";

export function GenomaLogoImage({
  logo,
  derived,
  polarity,
  className,
  alt = "",
  "aria-hidden": ariaHidden,
}: {
  logo: LogoValue | null | undefined;
  derived?: CandidateDerived;
  polarity?: "positive" | "negative";
  className?: string;
  alt?: string;
  "aria-hidden"?: boolean;
}) {
  const variantSrc = polarity ? resolveLogoVariantUrl(logo, polarity) : undefined;
  const src = variantSrc ?? resolveLogoDisplayUrl(logo, derived);
  if (!src) return null;

  return (
    <GenomaMediaImage
      src={src}
      alt={alt}
      aria-hidden={ariaHidden}
      className={className}
      eager
    />
  );
}
