"use client";

import React from "react";
import { BrandKitPreviewImage } from "../BrandKitPreviewImage";
import type { BrandKitShowcaseData } from "./brand-kit-showcase-data";

export function BrandKitShowcaseBusinessCard({ data }: { data: BrandKitShowcaseData }) {
  return (
    <div className="brandKit-showcase-card-stack" aria-hidden>
      <div className="brandKit-showcase-card brandKit-showcase-card--back">
        <p className="brandKit-showcase-card__name">Nombre Apellido</p>
        <p className="brandKit-showcase-card__role">Cargo / Rol</p>
        {data.tagline ? <p className="brandKit-showcase-card__tagline">{data.tagline}</p> : null}
        {data.contactEmail ? <p className="brandKit-showcase-card__contact">{data.contactEmail}</p> : null}
      </div>
      <div className="brandKit-showcase-card brandKit-showcase-card--front">
        {data.logoUrl ? (
          <div className="brandKit-showcase-card__logo">
            <BrandKitPreviewImage src={data.logoUrl} alt="" eager />
          </div>
        ) : (
          <span className="brandKit-showcase-card__monogram" aria-hidden>
            {data.monogram}
          </span>
        )}
        <p className="brandKit-showcase-card__brand-name">{data.brandName}</p>
      </div>
    </div>
  );
}
