"use client";

import React from "react";
import { GenomaPreviewImage } from "../GenomaPreviewImage";
import type { GenomaShowcaseData } from "./genoma-showcase-data";

export function GenomaShowcaseMobile({ data }: { data: GenomaShowcaseData }) {
  return (
    <div className="genoma-showcase-mobile" aria-hidden>
      <div className="genoma-showcase-mobile__frame">
        <div className="genoma-showcase-mobile__island" />
        <div className="genoma-showcase-mobile__screen">
          <div className="genoma-showcase-mobile__status">
            <span className="genoma-showcase-mobile__time">10:00</span>
          </div>
          <div className="genoma-showcase-mobile__hero">
            {data.logoUrl ? (
              <div className="genoma-showcase-mobile__logo">
                <GenomaPreviewImage src={data.logoUrl} alt="" eager />
              </div>
            ) : (
              <span className="genoma-showcase-mobile__monogram">{data.monogram}</span>
            )}
            {data.headline ? <h2 className="genoma-showcase-mobile__headline">{data.headline}</h2> : null}
            {data.summary ? <p className="genoma-showcase-mobile__summary">{data.summary}</p> : null}
            <button type="button" className="genoma-showcase-mobile__cta" tabIndex={-1}>
              {data.ctaLabel}
            </button>
          </div>
          <div className="genoma-showcase-mobile__tabbar">
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
