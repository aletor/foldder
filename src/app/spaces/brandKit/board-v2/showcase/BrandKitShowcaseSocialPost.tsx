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

export function BrandKitShowcaseSocialPost({
  data,
  primaryHex = "#6B4C9A",
}: {
  data: BrandKitShowcaseData;
  primaryHex?: string;
}) {
  const overlayColor = useMemo(() => overlayTextColor(primaryHex), [primaryHex]);

  return (
    <div className="brandKit-showcase-post">
      <div
        className={`brandKit-showcase-post__canvas${data.galleryImageUrl ? " brandKit-showcase-post__canvas--photo" : " brandKit-showcase-post__canvas--pattern"}`}
      >
        {data.galleryImageUrl ? (
          <BrandKitPreviewImage src={data.galleryImageUrl} alt="" eager className="brandKit-showcase-post__photo" />
        ) : null}
        {data.logoUrl ? (
          <div className="brandKit-showcase-post__logo brandKit-showcase-post__logo--veiled">
            <BrandKitPreviewImage src={data.logoUrl} alt="" eager />
          </div>
        ) : null}
        {data.headline ? (
          <div
            className="brandKit-showcase-post__lower-third"
            style={{ color: overlayColor }}
          >
            <p className="brandKit-showcase-post__headline">{data.headline}</p>
          </div>
        ) : null}
      </div>
      <div className="brandKit-showcase-post__meta" aria-hidden>
        <span className="brandKit-showcase-post__avatar">{data.monogram}</span>
        <span className="brandKit-showcase-post__author">{data.brandName}</span>
        <span className="brandKit-showcase-post__dots">···</span>
      </div>
    </div>
  );
}
