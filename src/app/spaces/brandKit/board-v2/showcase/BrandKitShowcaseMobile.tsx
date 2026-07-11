"use client";

import React from "react";
import { BrandKitPreviewImage } from "../BrandKitPreviewImage";
import type { BrandKitShowcaseData } from "./brand-kit-showcase-data";

export function BrandKitShowcaseMobile({ data }: { data: BrandKitShowcaseData }) {
  return (
    <div className="brandKit-showcase-mobile" aria-hidden>
      <div className="brandKit-showcase-mobile__frame">
        <div className="brandKit-showcase-mobile__island" />
        <div className="brandKit-showcase-mobile__screen">
          <div className="brandKit-showcase-mobile__status">
            <span className="brandKit-showcase-mobile__time">10:00</span>
          </div>
          <div className="brandKit-showcase-mobile__hero">
            {data.logoUrl ? (
              <div className="brandKit-showcase-mobile__logo">
                <BrandKitPreviewImage src={data.logoUrl} alt="" eager />
              </div>
            ) : (
              <span className="brandKit-showcase-mobile__monogram">{data.monogram}</span>
            )}
            {data.headline ? <h2 className="brandKit-showcase-mobile__headline">{data.headline}</h2> : null}
            {data.summary ? <p className="brandKit-showcase-mobile__summary">{data.summary}</p> : null}
            <button type="button" className="brandKit-showcase-mobile__cta" tabIndex={-1}>
              {data.ctaLabel}
            </button>
          </div>
          <div className="brandKit-showcase-mobile__tabbar">
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    </div>
  );
}
