"use client";

import React from "react";
import { BrandKitPreviewImage } from "../BrandKitPreviewImage";
import type { BrandKitShowcaseData } from "./brand-kit-showcase-data";

export function BrandKitShowcaseHero({
  data,
}: {
  data: BrandKitShowcaseData;
}) {
  return (
    <div className="brandKit-showcase-hero" aria-hidden>
      <div
        className={`brandKit-showcase-hero__canvas${data.galleryImageUrl ? " brandKit-showcase-hero__canvas--photo" : ""}`}
      >
        {data.galleryImageUrl ? (
          <BrandKitPreviewImage src={data.galleryImageUrl} alt="" eager className="brandKit-showcase-hero__photo" />
        ) : null}
        <div className="brandKit-showcase-hero__overlay">
          <div className="brandKit-showcase-hero__brand">
            {data.logoUrl ? (
              <BrandKitPreviewImage src={data.logoUrl} alt="" eager className="brandKit-showcase-hero__logo" />
            ) : (
              <span className="brandKit-showcase-hero__monogram">{data.monogram}</span>
            )}
          </div>
          <div className="brandKit-showcase-hero__copy">
            {data.campaign.concept ? (
              <p className="brandKit-showcase-hero__concept">{data.campaign.concept}</p>
            ) : null}
            {data.campaign.headline ? (
              <h3 className="brandKit-showcase-hero__headline">{data.campaign.headline}</h3>
            ) : null}
            {data.campaign.subheadline ? (
              <p className="brandKit-showcase-hero__subheadline">{data.campaign.subheadline}</p>
            ) : null}
            <span className="brandKit-showcase-hero__cta">{data.campaign.cta}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
