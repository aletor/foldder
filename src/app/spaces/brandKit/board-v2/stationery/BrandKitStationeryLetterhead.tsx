"use client";

import React from "react";
import { BrandKitPreviewImage } from "../BrandKitPreviewImage";
import type { BrandKitStationeryView } from "@/lib/brandkit/brand-kit-stationery";

export function BrandKitStationeryLetterhead({ view }: { view: BrandKitStationeryView }) {
  return (
    <div className="brandKit-stationery-letterhead" aria-hidden>
      <header className="brandKit-stationery-letterhead__head">
        {view.logoUrl ? (
          <BrandKitPreviewImage src={view.logoUrl} alt="" eager className="brandKit-stationery-letterhead__logo" />
        ) : (
          <span className="brandKit-stationery-letterhead__monogram">{view.monogram}</span>
        )}
        <div className="brandKit-stationery-letterhead__meta">
          <p className="brandKit-stationery-letterhead__brand">{view.brandName}</p>
          {view.contact.website ? <p className="brandKit-stationery-letterhead__web">{view.contact.website}</p> : null}
        </div>
      </header>
      <div className="brandKit-stationery-letterhead__body">
        <p className="brandKit-stationery-letterhead__line" />
        <p className="brandKit-stationery-letterhead__line brandKit-stationery-letterhead__line--short" />
        <p className="brandKit-stationery-letterhead__line" />
      </div>
      <footer className="brandKit-stationery-letterhead__foot">
        <span>{view.contact.email}</span>
        {view.contact.address ? <span>{view.contact.address}</span> : null}
      </footer>
    </div>
  );
}
