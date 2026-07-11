"use client";

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { BrandKitClickableImage } from "./BrandKitClickableImage";

export function BrandKitLogoClearanceZone({ previewUrl }: { previewUrl: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="brandKit-logo-clearance">
      <button
        type="button"
        className="brandKit-logo-clearance__toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="brandKit-v2-chapter-micro">Área de respeto</span>
        <ChevronDown size={14} aria-hidden className={open ? "is-open" : undefined} />
      </button>
      {open ? (
        <div className="brandKit-logo-clearance__diagram">
          <div className="brandKit-logo-clearance__stage">
            <div className="brandKit-logo-clearance__zone">
              <div className="brandKit-logo-clearance__logo">
                <BrandKitClickableImage src={previewUrl} fit="logo" eager alt="" />
              </div>
              <span className="brandKit-logo-clearance__cota brandKit-logo-clearance__cota--top">X</span>
              <span className="brandKit-logo-clearance__cota brandKit-logo-clearance__cota--right">X</span>
              <span className="brandKit-logo-clearance__cota brandKit-logo-clearance__cota--bottom">X</span>
              <span className="brandKit-logo-clearance__cota brandKit-logo-clearance__cota--left">X</span>
            </div>
          </div>
          <p className="brandKit-v2-muted brandKit-logo-clearance__hint">
            Margen mínimo X = 25% de la altura del logo en todas las direcciones.
          </p>
        </div>
      ) : null}
    </div>
  );
}
