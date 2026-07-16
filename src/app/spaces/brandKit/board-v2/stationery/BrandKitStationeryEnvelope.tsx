"use client";

import React from "react";
import { BrandKitPreviewImage } from "../BrandKitPreviewImage";
import type { BrandKitStationeryView } from "@/lib/brandkit/brand-kit-stationery";

export function BrandKitStationeryEnvelope({ view }: { view: BrandKitStationeryView }) {
  return (
    <div className="brandKit-stationery-envelope" aria-hidden>
      <div className="brandKit-stationery-envelope__flap" />
      <div className="brandKit-stationery-envelope__body">
        {view.logoUrl ? (
          <BrandKitPreviewImage src={view.logoUrl} alt="" eager className="brandKit-stationery-envelope__logo" />
        ) : (
          <span className="brandKit-stationery-envelope__monogram">{view.monogram}</span>
        )}
        <div className="brandKit-stationery-envelope__address">
          <p>{view.contact.personName}</p>
          <p>{view.brandName}</p>
          {view.contact.address ? <p>{view.contact.address}</p> : null}
        </div>
      </div>
    </div>
  );
}
