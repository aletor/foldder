"use client";

import React from "react";
import { BrandKitPreviewImage } from "../BrandKitPreviewImage";
import type { BrandKitStationeryView } from "@/lib/brandkit/brand-kit-stationery";

export function BrandKitStationeryCover({ view }: { view: BrandKitStationeryView }) {
  return (
    <div className="brandKit-stationery-cover" aria-hidden>
      <div className="brandKit-stationery-cover__band" />
      <div className="brandKit-stationery-cover__content">
        {view.logoUrl ? (
          <BrandKitPreviewImage src={view.logoUrl} alt="" eager className="brandKit-stationery-cover__logo" />
        ) : (
          <span className="brandKit-stationery-cover__monogram">{view.monogram}</span>
        )}
        {view.tagline ? <p className="brandKit-stationery-cover__tagline">{view.tagline}</p> : null}
        <p className="brandKit-stationery-cover__brand">{view.brandName}</p>
      </div>
    </div>
  );
}
