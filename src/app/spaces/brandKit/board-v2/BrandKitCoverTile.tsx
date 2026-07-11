"use client";

import React, { useMemo } from "react";
import type { EssenceValue, BrandKitDocument, LogoValue, SlotState } from "@/lib/brandkit/brand-kit-types";
import { contrastRatio } from "@/lib/brandkit/brand-theme-color";
import { BrandKitClickableImage } from "./BrandKitClickableImage";

function slotConfirmedValue<T>(
  slot: SlotState<unknown>,
  presentationMode: boolean,
): T | undefined {
  if (presentationMode && !slot.locked) return undefined;
  if (slot.status === "resolved" || slot.locked) {
    return slot.value as T | undefined;
  }
  return undefined;
}

function formatCoverDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function mosaicCoverBrandName(name: string): string {
  if (name.length > 24) {
    // TODO(brandname-fix): heurística temporal — solo primera palabra en portada
    const firstWord = name.split(/\s+/).find(Boolean);
    return firstWord ?? name;
  }
  return name;
}

export function BrandKitCoverTile({
  doc,
  presentationMode = false,
  brandReady = false,
  brandVars = {},
  mosaic = false,
}: {
  doc: BrandKitDocument;
  presentationMode?: boolean;
  brandReady?: boolean;
  brandVars?: Record<string, string>;
  mosaic?: boolean;
}) {
  const logo = slotConfirmedValue<LogoValue>(doc.slots.logo, presentationMode);
  const essence = slotConfirmedValue<EssenceValue>(doc.slots.essence, presentationMode);
  const brandName = doc.brandName?.value?.trim();
  const headline = essence?.headline?.trim() || essence?.summary?.trim();
  const sourceCount = doc.sources.length;
  const updatedAt = doc.updatedAt;

  const hasLogo = Boolean(logo?.previewUrl);
  const hasBrand = Boolean(brandName);
  const showSkeleton = !hasLogo || !hasBrand;

  const canvasStyle = useMemo(() => {
    if (!brandReady || showSkeleton) return undefined;
    const primary = brandVars["--brand-primary"];
    const page = brandVars["--brand-surface-page"] ?? "#f6f5f2";
    if (!primary) return { background: page };
    const logoContrasts =
      contrastRatio("#FFFFFF", primary) >= 3 || contrastRatio("#0A0A0A", primary) >= 3;
    return { background: hasLogo && logoContrasts ? primary : page };
  }, [brandReady, brandVars, hasLogo, showSkeleton]);

  const heroContent = showSkeleton ? (
    <div className="brandKit-v2-cover__skeleton" aria-hidden>
      <div className="brandKit-v2-cover__skeleton-logo" />
      <div className="brandKit-v2-cover__skeleton-title" />
      <div className="brandKit-v2-cover__skeleton-line" />
    </div>
  ) : (
    <>
      {logo?.previewUrl ? (
        <div className="brandKit-v2-cover__logo">
          <BrandKitClickableImage src={logo.previewUrl} fit="logo" eager alt="" />
        </div>
      ) : null}
      {brandName ? (
        <h1 className="brandKit-v2-cover__brand">{mosaic ? mosaicCoverBrandName(brandName) : brandName}</h1>
      ) : null}
      {headline ? <p className="brandKit-v2-cover__headline">{headline}</p> : null}
    </>
  );

  return (
    <section className={`brandKit-v2-cover${mosaic ? " brandKit-v2-cover--mosaic" : ""}`} aria-label="Portada del libro de estilo">
      <div
        className={`brandKit-v2-cover__canvas${showSkeleton ? " brandKit-v2-cover__canvas--skeleton" : ""}`}
        style={canvasStyle}
      >
        {mosaic ? (
          <div className="brandKit-v2-cover__group">{heroContent}</div>
        ) : (
          heroContent
        )}
      </div>
      <footer className="brandKit-v2-cover__foot">
        <span className="brandKit-v2-cover__meta">
          Libro de estilo · {sourceCount} fuente{sourceCount === 1 ? "" : "s"} · {formatCoverDate(updatedAt)}
        </span>
      </footer>
    </section>
  );
}
