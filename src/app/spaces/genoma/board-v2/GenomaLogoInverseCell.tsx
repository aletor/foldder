"use client";

import React, { useMemo } from "react";
import type { GenomaDocument, LogoValue } from "@/lib/genoma/genoma-types";
import { genomaV2LogoPlinthClassForMode } from "@/lib/genoma/genoma-logo-plinth";
import type { BrandThemePolarity } from "@/lib/genoma/brand-theme-color";
import { GenomaClickableImage } from "./GenomaClickableImage";
import { logoInversePreviewUrl } from "./genoma-logo-inverse";

function slotLogo(doc: GenomaDocument): LogoValue | undefined {
  const slot = doc.slots.logo;
  if (slot.status === "resolved" || slot.locked) return slot.value as LogoValue | undefined;
  return undefined;
}

export function GenomaLogoInverseCell({
  doc,
  brandPolarity,
  brandReady,
}: {
  doc: GenomaDocument;
  brandPolarity: BrandThemePolarity;
  brandReady: boolean;
}) {
  const logo = slotLogo(doc);
  const previewUrl = logoInversePreviewUrl(doc);
  const plinthClass = useMemo(() => {
    const base = genomaV2LogoPlinthClassForMode(logo, "auto");
    if (brandReady && brandPolarity === "light") {
      return `${base} genoma-v2-logo-plinth--brand-auto genoma-v2-logo-plinth--inverse-mirror`;
    }
    return `${base} genoma-v2-logo-plinth--inverse-mirror`;
  }, [brandReady, brandPolarity, logo]);

  if (!previewUrl) return null;

  return (
    <div className="genoma-logo-inverse" aria-label="Logo inverso">
      <div className={`genoma-v2-logo-plinth genoma-logo-inverse__plinth ${plinthClass}`}>
        <GenomaClickableImage src={previewUrl} fit="logo" eager alt="" />
      </div>
    </div>
  );
}
