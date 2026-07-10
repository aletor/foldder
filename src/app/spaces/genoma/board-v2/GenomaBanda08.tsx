"use client";

import React, { useMemo, useState } from "react";
import type { BrandThemePolarity } from "@/lib/genoma/brand-theme-color";
import { mixHex } from "@/lib/genoma/brand-theme-color";
import type { GenomaDocument } from "@/lib/genoma/genoma-types";
import {
  buildGenomaShowcaseData,
  GENOMA_SHOWCASE_CHAPTER_LABEL,
  type ShowcaseSurfaceMode,
} from "./showcase/genoma-showcase-data";
import { GenomaShowcaseBusinessCard } from "./showcase/GenomaShowcaseBusinessCard";
import { GenomaShowcaseSocialPost } from "./showcase/GenomaShowcaseSocialPost";
import { GenomaShowcaseMobile } from "./showcase/GenomaShowcaseMobile";

export function GenomaBanda08({
  doc,
  presentationMode = false,
  brandPolarity = "light",
  brandVars = {},
}: {
  doc: GenomaDocument;
  presentationMode?: boolean;
  brandPolarity?: BrandThemePolarity;
  brandVars?: Record<string, string>;
}) {
  const data = useMemo(
    () => buildGenomaShowcaseData(doc, presentationMode),
    [doc, presentationMode],
  );
  const [surfaceMode, setSurfaceMode] = useState<ShowcaseSurfaceMode>(
    brandPolarity === "dark" ? "dark" : "light",
  );

  const showcaseStyle = useMemo(() => {
    const page = brandVars["--brand-surface-page"] ?? "#F5F4F1";
    const ink = brandVars["--brand-ink"] ?? "#1A1A1A";
    const inkSoft = brandVars["--brand-ink-soft"] ?? "#666666";
    const rule = brandVars["--brand-rule"] ?? "#E0E0E0";

    const lightPaper = page;
    const darkPaper = mixHex(ink, "#000000", 0.12);
    const paper = surfaceMode === "dark" ? darkPaper : lightPaper;
    const showcaseInk = surfaceMode === "dark" ? lightPaper : ink;
    const showcaseInkSoft = surfaceMode === "dark" ? mixHex(lightPaper, ink, 0.35) : inkSoft;
    const deviceBorder = mixHex(ink, surfaceMode === "dark" ? "#FFFFFF" : "#000000", 0.1);

    return {
      "--showcase-paper": paper,
      "--showcase-ink": showcaseInk,
      "--showcase-ink-soft": showcaseInkSoft,
      "--showcase-device-border": deviceBorder,
      "--showcase-rule": rule,
    } as React.CSSProperties;
  }, [brandVars, surfaceMode]);

  if (!data) return null;

  const primaryHex = brandVars["--brand-primary"];

  return (
    <section
      className="banda-08"
      aria-label="La marca en acción"
      data-showcase-surface={surfaceMode}
      style={showcaseStyle}
    >
      <header className="banda-08__header">
        <span className="banda-08__rotulo">{GENOMA_SHOWCASE_CHAPTER_LABEL}</span>
        <div className="genoma-showcase-surface-toggle" role="group" aria-label="Base de mockups">
          <button
            type="button"
            className={`genoma-showcase-surface-toggle__btn${surfaceMode === "light" ? " is-active" : ""}`}
            onClick={() => setSurfaceMode("light")}
          >
            Claro
          </button>
          <button
            type="button"
            className={`genoma-showcase-surface-toggle__btn${surfaceMode === "dark" ? " is-active" : ""}`}
            onClick={() => setSurfaceMode("dark")}
          >
            Oscuro
          </button>
        </div>
      </header>

      <div className="banda-08__mockups-viewport">
        <div className="banda-08__mockups">
          <figure className="banda-08__figure">
            <div className="banda-08__mockup banda-08__mockup--card">
              <GenomaShowcaseBusinessCard data={data} />
            </div>
            <figcaption className="banda-08__caption">Tarjeta de visita</figcaption>
          </figure>
          <figure className="banda-08__figure">
            <div className="banda-08__mockup banda-08__mockup--post">
              <GenomaShowcaseSocialPost data={data} primaryHex={primaryHex} />
            </div>
            <figcaption className="banda-08__caption">Post social</figcaption>
          </figure>
          <figure className="banda-08__figure">
            <div className="banda-08__mockup banda-08__mockup--mobile">
              <GenomaShowcaseMobile data={data} />
            </div>
            <figcaption className="banda-08__caption">Móvil</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
