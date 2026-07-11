"use client";

import React, { useMemo } from "react";
import type { BrandKitDocument, LogoValue } from "@/lib/brandkit/brand-kit-types";
import { brandKitV2LogoPlinthClassForMode } from "@/lib/brandkit/brand-kit-logo-plinth";
import type { BrandThemePolarity } from "@/lib/brandkit/brand-theme-color";
import { BrandKitClickableImage } from "./BrandKitClickableImage";
import { logoInversePreviewUrl } from "./brand-kit-logo-inverse";

function slotLogo(doc: BrandKitDocument): LogoValue | undefined {
  const slot = doc.slots.logo;
  if (slot.status === "resolved" || slot.locked) return slot.value as LogoValue | undefined;
  return undefined;
}

export function BrandKitLogoInverseCell({
  doc,
  brandPolarity,
  brandReady,
}: {
  doc: BrandKitDocument;
  brandPolarity: BrandThemePolarity;
  brandReady: boolean;
}) {
  const logo = slotLogo(doc);
  const previewUrl = logoInversePreviewUrl(doc);
  const plinthClass = useMemo(() => {
    const base = brandKitV2LogoPlinthClassForMode(logo, "auto");
    if (brandReady && brandPolarity === "light") {
      return `${base} brandKit-v2-logo-plinth--brand-auto brandKit-v2-logo-plinth--inverse-mirror`;
    }
    return `${base} brandKit-v2-logo-plinth--inverse-mirror`;
  }, [brandReady, brandPolarity, logo]);

  if (!previewUrl) return null;

  return (
    <div className="brandKit-logo-inverse" aria-label="Logo inverso">
      <div className={`brandKit-v2-logo-plinth brandKit-logo-inverse__plinth ${plinthClass}`}>
        <BrandKitClickableImage src={previewUrl} fit="logo" eager alt="" />
      </div>
    </div>
  );
}
