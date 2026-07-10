"use client";

import React, { useMemo, useRef, useState } from "react";
import type { LogoValue, SlotAction, SlotId, SlotState } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { genomaV2LogoPlinthClass } from "@/lib/genoma/genoma-logo-plinth";
import { DnaBlock } from "../DnaBlock";
import { GenomaClickableImage } from "../GenomaClickableImage";
import { GenomaLogoRankMeta } from "../GenomaVisualRankMeta";
import { GenomaSupplementalPanel } from "../GenomaSupplementalPanel";
import { GenomaFoldderButton } from "../GenomaFoldderButton";
import { GenomaIconButton } from "../GenomaIconButton";
import { GenomaLogoBboxEditor } from "../GenomaLogoBboxEditor";
import { Check, Crop, Upload } from "lucide-react";

function canAdjustLogo(logo?: LogoValue): boolean {
  return Boolean(logo?.sourcePdfSha256 && logo.sourcePageNumber);
}

function logoPageHint(logo?: LogoValue): string | null {
  if (!logo?.sourcePageNumber) return null;
  const doc = logo.sourceDocName ? `${logo.sourceDocName} · ` : "";
  return `${doc}${genomaLocaleEs.logoPageSignal(logo.sourcePageNumber, logo.totalDocPages ?? 0)}`;
}

function LogoUploadControl({ onUploadLogo, disabled }: { onUploadLogo?: (file: File) => void | Promise<void>; disabled?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);

  if (!onUploadLogo) return null;

  return (
    <>
      <GenomaIconButton
        icon={Upload}
        label={genomaLocaleEs.uploadLogoShort}
        disabled={disabled}
        onClick={() => fileRef.current?.click()}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="genoma-v2-sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onUploadLogo(file);
          event.target.value = "";
        }}
      />
    </>
  );
}

export function LogoBlock({
  slot,
  slotId,
  onAction,
  onUploadLogo,
  activeSlotId,
}: {
  slot: SlotState<unknown>;
  slotId: SlotId;
  onAction: (slotId: SlotId, action: SlotAction) => void;
  onUploadLogo?: (file: File) => void | Promise<void>;
  activeSlotId?: SlotId;
}) {
  const logo = slot.value as LogoValue | undefined;
  const plinthClass = useMemo(() => genomaV2LogoPlinthClass(logo), [logo]);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const pageHint = logoPageHint(logo);
  const adjustControl =
    canAdjustLogo(logo) && !slot.locked ? (
      <GenomaIconButton
        icon={Crop}
        label={genomaLocaleEs.adjustLogoArea}
        onClick={() => setAdjustOpen(true)}
      />
    ) : null;
  const uploadControl = <LogoUploadControl onUploadLogo={onUploadLogo} disabled={slot.locked} />;
  const secondaryActions = (
    <>
      {adjustControl}
      {uploadControl}
    </>
  );

  const resolvedPlinth = logo?.previewUrl ? (
    <div className={`genoma-v2-logo-plinth ${plinthClass}`}>
      {pageHint ? <p className="genoma-v2-logo-page-hint">{pageHint}</p> : null}
      <GenomaClickableImage src={logo.previewUrl} fit="logo" eager />
      <GenomaSupplementalPanel slot={slot} />
    </div>
  ) : null;

  let body: React.ReactNode;

  const pickerCandidates = slot.candidates.slice(0, 4);

  if (slot.status === "pending") {
    body = <div className="genoma-v2-skeleton genoma-v2-skeleton--hero" aria-hidden />;
  } else if (slot.status === "candidates" || (slot.status === "needs_user" && slot.candidates.length)) {
    body = (
      <>
        {slot.needsReviewReason ? <p className="genoma-v2-review-hint">{slot.needsReviewReason}</p> : null}
        <div className="genoma-v2-logo-candidates">
        {pickerCandidates.map((candidate, index) => {
          const value = candidate.value as LogoValue;
          const candidatePlinth = genomaV2LogoPlinthClass(value);
          return (
            <div key={`${value.assetId}-${index}`} className="genoma-v2-logo-candidate">
              <GenomaLogoRankMeta candidate={candidate} rank={index + 1} />
              <div className={`genoma-v2-logo-candidate__preview ${candidatePlinth}`}>
                {value.previewUrl ? (
                  <GenomaClickableImage src={value.previewUrl} fit="logo" eager />
                ) : (
                  <span className="genoma-v2-muted">{value.assetId}</span>
                )}
              </div>
              <GenomaFoldderButton
                icon={Check}
                className="genoma-v2-logo-candidate__choose"
                onClick={() => onAction(slotId, { action: "choose_candidate", candidateIndex: index, lock: true })}
              >
                {genomaLocaleEs.chooseLogo}
              </GenomaFoldderButton>
            </div>
          );
        })}
        </div>
      </>
    );
  } else if (slot.status === "needs_user") {
    body = <p className="genoma-v2-muted">{genomaLocaleEs.noLogo}</p>;
  } else if (slot.status === "resolved" && slot.needsReviewReason && logo?.previewUrl) {
    body = (
      <>
        <p className="genoma-v2-review-hint">{slot.needsReviewReason}</p>
        {resolvedPlinth}
      </>
    );
  } else if (!logo?.previewUrl) {
    body = <p className="genoma-v2-muted">{genomaLocaleEs.noLogo}</p>;
  } else {
    body = resolvedPlinth;
  }

  return (
    <DnaBlock
      label={genomaLocaleEs.logo}
      slotId={slotId}
      slot={slot}
      onAction={onAction}
      className="genoma-v2-block--hero"
      secondaryActions={secondaryActions}
      activeSlotId={activeSlotId}
    >
      {body}
      {adjustOpen && logo ? (
        <div className="genoma-v2-logo-adjust-overlay">
          <GenomaLogoBboxEditor
            logo={logo}
            onClose={() => setAdjustOpen(false)}
            onSaved={(nextLogo) => {
              onAction(slotId, { action: "set", value: nextLogo });
              setAdjustOpen(false);
            }}
          />
        </div>
      ) : null}
    </DnaBlock>
  );
}
