"use client";

import React, { useMemo } from "react";
import { contrastRatio, mixHex } from "@/lib/brandkit/brand-theme-color";
import { BrandKitPreviewImage } from "../BrandKitPreviewImage";
import type { BrandKitShowcaseData } from "./brand-kit-showcase-data";

function overlayTextColor(primaryHex: string): string {
  const overlay = mixHex(primaryHex, "#000000", 0.15);
  if (contrastRatio("#FFFFFF", overlay) >= 4.5) return "#FFFFFF";
  if (contrastRatio("#0A0A0A", overlay) >= 4.5) return "#0A0A0A";
  return contrastRatio("#FFFFFF", overlay) >= contrastRatio("#0A0A0A", overlay)
    ? "#FFFFFF"
    : "#0A0A0A";
}

export function BrandKitShowcaseStory({
  data,
  primaryHex = "#6B4C9A",
}: {
  data: BrandKitShowcaseData;
  primaryHex?: string;
}) {
  const overlayColor = useMemo(() => overlayTextColor(primaryHex), [primaryHex]);

  return (
    <div className="brandKit-showcase-story" aria-hidden>
      <div
        className={`brandKit-showcase-story__canvas${data.galleryImageUrl ? " brandKit-showcase-story__canvas--photo" : ""}`}
      >
        {data.galleryImageUrl ? (
          <BrandKitPreviewImage src={data.galleryImageUrl} alt="" eager className="brandKit-showcase-story__photo" />
        ) : null}
        {data.logoUrl ? (
          <div className="brandKit-showcase-story__logo">
            <BrandKitPreviewImage src={data.logoUrl} alt="" eager />
          </div>
        ) : null}
        <div className="brandKit-showcase-story__copy" style={{ color: overlayColor }}>
          {data.campaign.headline ? (
            <p className="brandKit-showcase-story__headline">{data.campaign.headline}</p>
          ) : null}
          <span className="brandKit-showcase-story__cta">{data.campaign.cta}</span>
        </div>
      </div>
    </div>
  );
}
