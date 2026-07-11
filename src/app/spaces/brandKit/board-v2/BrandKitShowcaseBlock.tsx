"use client";

import React, { useMemo, useState } from "react";
import type { BrandThemePolarity } from "@/lib/brandkit/brand-theme-color";
import { mixHex } from "@/lib/brandkit/brand-theme-color";
import type { BrandKitDocument } from "@/lib/brandkit/brand-kit-types";
import {
  buildBrandKitShowcaseData,
  BRAND_KIT_SHOWCASE_CHAPTER_LABEL,
  type ShowcaseSurfaceMode,
} from "./showcase/brand-kit-showcase-data";
import { BrandKitShowcaseBusinessCard } from "./showcase/BrandKitShowcaseBusinessCard";
import { BrandKitShowcaseSocialPost } from "./showcase/BrandKitShowcaseSocialPost";
import { BrandKitShowcaseMobile } from "./showcase/BrandKitShowcaseMobile";
import { useBrandKitMosaicCellOptional } from "./brand-kit-mosaic-context";

export function BrandKitShowcaseBlock({
  doc,
  presentationMode = false,
  brandPolarity = "light",
  brandVars = {},
}: {
  doc: BrandKitDocument;
  presentationMode?: boolean;
  brandPolarity?: BrandThemePolarity;
  brandVars?: Record<string, string>;
}) {
  const mosaicCell = useBrandKitMosaicCellOptional();
  const isMosaic = Boolean(mosaicCell);
  const data = useMemo(
    () => buildBrandKitShowcaseData(doc, presentationMode),
    [doc, presentationMode],
  );
  const [surfaceMode, setSurfaceMode] = useState<ShowcaseSurfaceMode>(
    brandPolarity === "dark" ? "dark" : "light",
  );

  const surfaceToggle = useMemo(
    () => (
      <div className="brandKit-showcase-surface-toggle" role="group" aria-label="Base de mockups">
        <button
          type="button"
          className={`brandKit-showcase-surface-toggle__btn${surfaceMode === "light" ? " is-active" : ""}`}
          onClick={() => setSurfaceMode("light")}
        >
          Claro
        </button>
        <button
          type="button"
          className={`brandKit-showcase-surface-toggle__btn${surfaceMode === "dark" ? " is-active" : ""}`}
          onClick={() => setSurfaceMode("dark")}
        >
          Oscuro
        </button>
      </div>
    ),
    [surfaceMode],
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
      className={`brandKit-v2-block brandKit-showcase${isMosaic ? " brandKit-showcase--mosaic" : ""}`}
      aria-label="La marca en acción"
      data-showcase-surface={surfaceMode}
      style={showcaseStyle}
    >
      {!isMosaic ? (
        <header className="brandKit-v2-block__head brandKit-v2-block__head--chapter">
          <span className="brandKit-v2-chapter-label">{BRAND_KIT_SHOWCASE_CHAPTER_LABEL}</span>
          <div className="brandKit-v2-block__head-extra">{surfaceToggle}</div>
        </header>
      ) : (
        <div className="brandKit-showcase--mosaic__toolbar">{surfaceToggle}</div>
      )}

      <div className="brandKit-showcase__grid">
        <figure className="brandKit-showcase__item">
          <BrandKitShowcaseBusinessCard data={data} />
          <figcaption className="brandKit-v2-chapter-micro">Tarjeta de visita</figcaption>
        </figure>
        <figure className="brandKit-showcase__item">
          <BrandKitShowcaseSocialPost data={data} primaryHex={primaryHex} />
          <figcaption className="brandKit-v2-chapter-micro">Post social</figcaption>
        </figure>
        <figure className="brandKit-showcase__item">
          <BrandKitShowcaseMobile data={data} />
          <figcaption className="brandKit-v2-chapter-micro">Móvil</figcaption>
        </figure>
      </div>
    </section>
  );
}
