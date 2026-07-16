"use client";

import React, { useMemo, useState } from "react";
import type { BrandKitDocument, BrandKitStationeryContact } from "@/lib/brandkit/brand-kit-types";
import {
  buildBrandKitStationeryView,
  STATIONERY_PIECES,
  stationeryRequirementsMet,
  type StationeryPieceId,
} from "@/lib/brandkit/brand-kit-stationery";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import type { BrandKitShowcaseData } from "../showcase/brand-kit-showcase-data";
import { BrandKitFoldderButton } from "../BrandKitFoldderButton";
import { BrandKitStationeryMockup } from "./BrandKitStationeryMockup";
import { BrandKitStationeryCard } from "./BrandKitStationeryCard";
import { BrandKitStationeryLetterhead } from "./BrandKitStationeryLetterhead";
import { BrandKitStationeryEnvelope } from "./BrandKitStationeryEnvelope";
import { BrandKitStationerySignature } from "./BrandKitStationerySignature";
import { BrandKitStationeryCover } from "./BrandKitStationeryCover";
import { BrandKitStationeryContactSheet } from "./BrandKitStationeryContactSheet";
import { BrandKitShowcaseRequirements } from "../showcase/BrandKitShowcaseRequirements";

function StationeryPiecePreview({
  pieceId,
  view,
}: {
  pieceId: StationeryPieceId;
  view: NonNullable<ReturnType<typeof buildBrandKitStationeryView>>;
}) {
  switch (pieceId) {
    case "card":
      return <BrandKitStationeryCard view={view} />;
    case "letterhead":
      return <BrandKitStationeryLetterhead view={view} />;
    case "envelope":
      return <BrandKitStationeryEnvelope view={view} />;
    case "signature":
      return <BrandKitStationerySignature view={view} />;
    case "cover":
      return <BrandKitStationeryCover view={view} />;
    default:
      return null;
  }
}

export function BrandKitStationeryPanel({
  doc,
  showcase,
  presentationMode = false,
  onStationeryContactChange,
}: {
  doc: BrandKitDocument;
  showcase: BrandKitShowcaseData | null;
  presentationMode?: boolean;
  onStationeryContactChange?: (contact: BrandKitStationeryContact) => void;
}) {
  const [contactSheetOpen, setContactSheetOpen] = useState(false);
  const [focusedPiece, setFocusedPiece] = useState<StationeryPieceId | null>(null);

  const stationeryReady = useMemo(
    () => stationeryRequirementsMet(doc, presentationMode),
    [doc, presentationMode],
  );

  const view = useMemo(() => {
    if (!showcase) return null;
    return buildBrandKitStationeryView(doc, {
      brandName: showcase.brandName,
      monogram: showcase.monogram,
      logoUrl: showcase.logoUrl,
      tagline: showcase.tagline,
      contactEmail: showcase.contactEmail,
    });
  }, [doc, showcase]);

  if (!stationeryReady) {
    const requirements = showcase?.requirements ?? [];
    const stationeryReqs = requirements.filter((item) =>
      ["logo", "palette", "typography"].includes(item.id),
    );
    return (
      <div className="brandKit-stationery-panel">
        <p className="brandKit-stationery-panel__lead">{brandKitLocaleEs.stationeryRequirementsLead}</p>
        <BrandKitShowcaseRequirements requirements={stationeryReqs} />
      </div>
    );
  }

  if (!view) return null;

  return (
    <div className="brandKit-stationery-panel">
      <div className="brandKit-stationery-panel__hero">
        <BrandKitStationeryMockup view={view} />
        {!presentationMode && onStationeryContactChange ? (
          <BrandKitFoldderButton variant="ghost" compact onClick={() => setContactSheetOpen(true)}>
            {brandKitLocaleEs.stationeryEditContact}
          </BrandKitFoldderButton>
        ) : null}
      </div>

      <div className="brandKit-stationery-panel__grid">
        {STATIONERY_PIECES.map((piece) => (
          <article
            key={piece.id}
            className={`brandKit-stationery-panel__piece${focusedPiece === piece.id ? " is-focused" : ""}`}
          >
            <div className="brandKit-stationery-panel__preview">
              <StationeryPiecePreview pieceId={piece.id} view={view} />
            </div>
            <footer className="brandKit-stationery-panel__meta">
              <div>
                <p className="brandKit-stationery-panel__label">{piece.label}</p>
                <p className="brandKit-stationery-panel__size">{piece.sizeLabel}</p>
              </div>
              {!presentationMode ? (
                <BrandKitFoldderButton variant="ghost" compact onClick={() => setFocusedPiece(piece.id)}>
                  {brandKitLocaleEs.edit}
                </BrandKitFoldderButton>
              ) : null}
            </footer>
          </article>
        ))}
      </div>

      {focusedPiece ? (
        <div className="brandKit-stationery-panel__focus" role="region" aria-label={brandKitLocaleEs.stationeryFocusPreview}>
          <StationeryPiecePreview pieceId={focusedPiece} view={view} />
          {!presentationMode ? (
            <BrandKitFoldderButton variant="ghost" compact onClick={() => setFocusedPiece(null)}>
              {brandKitLocaleEs.stationeryCloseFocus}
            </BrandKitFoldderButton>
          ) : null}
        </div>
      ) : null}

      {onStationeryContactChange ? (
        <BrandKitStationeryContactSheet
          open={contactSheetOpen}
          contact={view.contact}
          onClose={() => setContactSheetOpen(false)}
          onSave={onStationeryContactChange}
        />
      ) : null}
    </div>
  );
}
