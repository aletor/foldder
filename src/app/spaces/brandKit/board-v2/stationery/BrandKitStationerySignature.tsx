"use client";

import React from "react";
import { BrandKitPreviewImage } from "../BrandKitPreviewImage";
import type { BrandKitStationeryView } from "@/lib/brandkit/brand-kit-stationery";

export function BrandKitStationerySignature({ view }: { view: BrandKitStationeryView }) {
  return (
    <div className="brandKit-stationery-signature" aria-hidden>
      <div className="brandKit-stationery-signature__row">
        {view.logoUrl ? (
          <BrandKitPreviewImage src={view.logoUrl} alt="" eager className="brandKit-stationery-signature__logo" />
        ) : (
          <span className="brandKit-stationery-signature__monogram">{view.monogram}</span>
        )}
        <div className="brandKit-stationery-signature__copy">
          <p className="brandKit-stationery-signature__name">{view.contact.personName}</p>
          <p className="brandKit-stationery-signature__role">
            {view.contact.role} · {view.brandName}
          </p>
          <p className="brandKit-stationery-signature__email">
            {view.contact.email}
            {view.contact.phone ? ` · ${view.contact.phone}` : ""}
          </p>
          {view.contact.website ? <p className="brandKit-stationery-signature__web">{view.contact.website}</p> : null}
        </div>
      </div>
    </div>
  );
}
