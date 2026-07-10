"use client";

import React, { useMemo } from "react";
import { contrastRatio, mixHex } from "@/lib/genoma/brand-theme-color";
import { GenomaPreviewImage } from "../GenomaPreviewImage";
import type { GenomaShowcaseData } from "./genoma-showcase-data";

function overlayTextColor(primaryHex: string): string {
  const overlay = mixHex(primaryHex, "#000000", 0.15);
  if (contrastRatio("#FFFFFF", overlay) >= 4.5) return "#FFFFFF";
  if (contrastRatio("#0A0A0A", overlay) >= 4.5) return "#0A0A0A";
  return contrastRatio("#FFFFFF", overlay) >= contrastRatio("#0A0A0A", overlay)
    ? "#FFFFFF"
    : "#0A0A0A";
}

export function GenomaShowcaseSocialPost({
  data,
  primaryHex = "#6B4C9A",
}: {
  data: GenomaShowcaseData;
  primaryHex?: string;
}) {
  const overlayColor = useMemo(() => overlayTextColor(primaryHex), [primaryHex]);

  return (
    <div className="genoma-showcase-post">
      <div
        className={`genoma-showcase-post__canvas${data.galleryImageUrl ? " genoma-showcase-post__canvas--photo" : " genoma-showcase-post__canvas--pattern"}`}
      >
        {data.galleryImageUrl ? (
          <GenomaPreviewImage src={data.galleryImageUrl} alt="" eager className="genoma-showcase-post__photo" />
        ) : null}
        {data.logoUrl ? (
          <div className="genoma-showcase-post__logo genoma-showcase-post__logo--veiled">
            <GenomaPreviewImage src={data.logoUrl} alt="" eager />
          </div>
        ) : null}
        {data.headline ? (
          <div
            className="genoma-showcase-post__lower-third"
            style={{ color: overlayColor }}
          >
            <p className="genoma-showcase-post__headline">{data.headline}</p>
          </div>
        ) : null}
      </div>
      <div className="genoma-showcase-post__meta" aria-hidden>
        <span className="genoma-showcase-post__avatar">{data.monogram}</span>
        <span className="genoma-showcase-post__author">{data.brandName}</span>
        <span className="genoma-showcase-post__dots">···</span>
      </div>
    </div>
  );
}
