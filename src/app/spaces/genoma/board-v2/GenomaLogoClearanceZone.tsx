"use client";

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { GenomaClickableImage } from "./GenomaClickableImage";

export function GenomaLogoClearanceZone({ previewUrl }: { previewUrl: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="genoma-logo-clearance">
      <button
        type="button"
        className="genoma-logo-clearance__toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="genoma-v2-chapter-micro">Área de respeto</span>
        <ChevronDown size={14} aria-hidden className={open ? "is-open" : undefined} />
      </button>
      {open ? (
        <div className="genoma-logo-clearance__diagram">
          <div className="genoma-logo-clearance__stage">
            <div className="genoma-logo-clearance__zone">
              <div className="genoma-logo-clearance__logo">
                <GenomaClickableImage src={previewUrl} fit="logo" eager alt="" />
              </div>
              <span className="genoma-logo-clearance__cota genoma-logo-clearance__cota--top">X</span>
              <span className="genoma-logo-clearance__cota genoma-logo-clearance__cota--right">X</span>
              <span className="genoma-logo-clearance__cota genoma-logo-clearance__cota--bottom">X</span>
              <span className="genoma-logo-clearance__cota genoma-logo-clearance__cota--left">X</span>
            </div>
          </div>
          <p className="genoma-v2-muted genoma-logo-clearance__hint">
            Margen mínimo X = 25% de la altura del logo en todas las direcciones.
          </p>
        </div>
      ) : null}
    </div>
  );
}
