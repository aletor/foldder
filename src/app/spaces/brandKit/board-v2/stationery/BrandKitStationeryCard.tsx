"use client";

import React from "react";
import { BrandKitPreviewImage } from "../BrandKitPreviewImage";
import type { BrandKitStationeryView } from "@/lib/brandkit/brand-kit-stationery";

export function BrandKitStationeryCard({ view }: { view: BrandKitStationeryView }) {
  return (
    <div className="brandKit-stationery-card" aria-hidden>
      <div className="brandKit-stationery-card__face brandKit-stationery-card__face--front">
        {view.logoUrl ? (
          <BrandKitPreviewImage src={view.logoUrl} alt="" eager className="brandKit-stationery-card__logo" />
        ) : (
          <span className="brandKit-stationery-card__monogram">{view.monogram}</span>
        )}
        <p className="brandKit-stationery-card__brand">{view.brandName}</p>
      </div>
      <div className="brandKit-stationery-card__face brandKit-stationery-card__face--back">
        <p className="brandKit-stationery-card__name">{view.contact.personName}</p>
        <p className="brandKit-stationery-card__role">{view.contact.role}</p>
        {view.tagline ? <p className="brandKit-stationery-card__tagline">{view.tagline}</p> : null}
        <p className="brandKit-stationery-card__email">{view.contact.email}</p>
        {view.contact.phone ? <p className="brandKit-stationery-card__phone">{view.contact.phone}</p> : null}
      </div>
    </div>
  );
}
