"use client";

import React from "react";
import { GenomaPreviewImage } from "../GenomaPreviewImage";
import type { GenomaShowcaseData } from "./genoma-showcase-data";

export function GenomaShowcaseBusinessCard({ data }: { data: GenomaShowcaseData }) {
  return (
    <div className="genoma-showcase-card-stack" aria-hidden>
      <div className="genoma-showcase-card genoma-showcase-card--back">
        <p className="genoma-showcase-card__name">Nombre Apellido</p>
        <p className="genoma-showcase-card__role">Cargo / Rol</p>
        {data.tagline ? <p className="genoma-showcase-card__tagline">{data.tagline}</p> : null}
        {data.contactEmail ? <p className="genoma-showcase-card__contact">{data.contactEmail}</p> : null}
      </div>
      <div className="genoma-showcase-card genoma-showcase-card--front">
        {data.logoUrl ? (
          <div className="genoma-showcase-card__logo">
            <GenomaPreviewImage src={data.logoUrl} alt="" eager />
          </div>
        ) : (
          <span className="genoma-showcase-card__monogram" aria-hidden>
            {data.monogram}
          </span>
        )}
      </div>
    </div>
  );
}
