"use client";

import type { CandidateDerived } from "@/lib/brandkit/model/evidence";
import type { LogoValue } from "@/lib/brandkit/model/trait-values";
import { resolveLogoDisplayUrl, resolveLogoVariantUrl } from "@/lib/brandkit/projection/logo-display-url";
import { BrandKitMediaImage } from "./BrandKitMediaImage";

export function BrandKitLogoImage({
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
    <BrandKitMediaImage
      src={src}
      alt={alt}
      aria-hidden={ariaHidden}
      className={className}
      eager
    />
  );
}
