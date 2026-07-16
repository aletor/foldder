"use client";

import React from "react";
import type {
  BrandKitDocument,
  GalleryValue,
  LogoValue,
  PaletteValue,
  SlotId,
} from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { computeGalleryLibraryStats } from "@/lib/brandkit/brand-kit-gallery-image-state";
import { nameColor } from "@/lib/brandkit/name-color";
import { buildMosaicDetailPayload } from "./BrandKitDetailPanel";
import type { MosaicDetailPayload } from "./brand-kit-mosaic-context";
import { buildSlotDetailSummaryText, slotDetailMeta } from "@/lib/brandkit/studio/brand-kit-slot-detail";

export function buildFallbackSlotDetailPayload(
  doc: BrandKitDocument,
  slotId: SlotId,
  footer?: React.ReactNode,
): MosaicDetailPayload | null {
  const slot = doc.slots[slotId];
  if (!slot || slot.status === "empty") return null;

  const meta = slotDetailMeta(doc, slotId);
  const summaryLine = buildSlotDetailSummaryText(doc, slotId);

  const panels: Array<{ id: string; label: string; count?: number; content: React.ReactNode }> = [];

  switch (slotId) {
    case "logo": {
      const logo = slot.value as LogoValue | undefined;
      panels.push({
        id: "preview",
        label: "Logo",
        content: logo?.previewUrl ? (
          <div className="brandKit-slot-detail-logo">
            <img src={logo.previewUrl} alt="" className="brandKit-slot-detail-logo__img" />
            {logo.format ? <p className="brandKit-v2-muted">Formato {logo.format}</p> : null}
            {logo.sourceDocName ? <p className="brandKit-v2-muted">{logo.sourceDocName}</p> : null}
          </div>
        ) : (
          <p className="brandKit-v2-muted">{brandKitLocaleEs.noLogo}</p>
        ),
      });
      if (slot.candidates.length > 1) {
        panels.push({
          id: "alternatives",
          label: brandKitLocaleEs.alternatives,
          count: slot.candidates.length,
          content: (
            <p className="brandKit-v2-muted">
              {brandKitLocaleEs.candidatesChip(slot.candidates.length)} — revisa en el bloque central.
            </p>
          ),
        });
      }
      break;
    }
    case "palette": {
      const palette = slot.value as PaletteValue | undefined;
      panels.push({
        id: "colors",
        label: brandKitLocaleEs.palette,
        count: palette?.colors?.length,
        content: palette?.colors?.length ? (
          <ul className="brandKit-slot-detail-palette">
            {palette.colors.map((color) => (
              <li key={`${color.role}-${color.hex}`} className="brandKit-slot-detail-palette__row">
                <span
                  className="brandKit-slot-detail-palette__swatch"
                  style={{ backgroundColor: color.hex }}
                  aria-hidden
                />
                <span className="brandKit-slot-detail-palette__meta">
                  <strong>{nameColor(color.hex)}</strong>
                  <span>
                    {color.role} · {color.hex}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="brandKit-v2-muted">{brandKitLocaleEs.noPalette}</p>
        ),
      });
      break;
    }
    case "gallery": {
      const gallery = slot.value as GalleryValue | undefined;
      const stats = computeGalleryLibraryStats(gallery, Boolean(slot.locked));
      panels.push({
        id: "library",
        label: brandKitLocaleEs.gallery,
        content: (
          <p className="brandKit-v2-prose">
            {brandKitLocaleEs.galleryStats(stats.approved, stats.proposals, stats.errors)}
          </p>
        ),
      });
      break;
    }
    default:
      panels.push({
        id: "summary",
        label: brandKitLocaleEs.detail,
        content: summaryLine ? <p className="brandKit-v2-prose">{summaryLine}</p> : null,
      });
  }

  return buildMosaicDetailPayload({
    slotId,
    blockLabel: meta.blockLabel,
    brandName: meta.brandName,
    statusLabel: meta.statusLabel,
    sourceLabel: meta.sourceLabel,
    summary: summaryLine ? <p className="brandKit-v2-prose">{summaryLine}</p> : undefined,
    panels,
    footer,
    initialTabId: meta.initialTabId,
  });
}
