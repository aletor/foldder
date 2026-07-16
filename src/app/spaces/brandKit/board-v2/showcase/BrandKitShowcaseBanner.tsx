"use client";

import React from "react";
import { BrandKitPreviewImage } from "../BrandKitPreviewImage";
import type { BrandKitShowcaseData } from "./brand-kit-showcase-data";

export function BrandKitShowcaseBanner({
  data,
}: {
  data: BrandKitShowcaseData;
}) {
  return (
    <div className="brandKit-showcase-banner" aria-hidden>
      <div className="brandKit-showcase-banner__canvas">
        {data.logoUrl ? (
          <BrandKitPreviewImage src={data.logoUrl} alt="" eager className="brandKit-showcase-banner__logo" />
        ) : (
          <span className="brandKit-showcase-banner__monogram">{data.monogram}</span>
        )}
        <div className="brandKit-showcase-banner__copy">
          <p className="brandKit-showcase-banner__headline">{data.campaign.headline}</p>
          {data.campaign.subheadline ? (
            <p className="brandKit-showcase-banner__sub">{data.campaign.subheadline}</p>
          ) : null}
        </div>
        <span className="brandKit-showcase-banner__cta">{data.campaign.cta}</span>
      </div>
    </div>
  );
}
