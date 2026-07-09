"use client";

import React, { useMemo, useRef } from "react";
import type { LogoValue, SlotAction, SlotId, SlotState } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { DnaBlock } from "../DnaBlock";
import { GenomaClickableImage } from "../GenomaClickableImage";
import { GenomaFoldderButton } from "../GenomaFoldderButton";
import { GenomaIconButton } from "../GenomaIconButton";
import { Check, Upload } from "lucide-react";

function plinthClassForLogo(url?: string): string {
  if (!url) return "genoma-v2-logo-plinth--neutral";
  return "genoma-v2-logo-plinth--adaptive";
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
}: {
  slot: SlotState<unknown>;
  slotId: SlotId;
  onAction: (slotId: SlotId, action: SlotAction) => void;
  onUploadLogo?: (file: File) => void | Promise<void>;
}) {
  const logo = slot.value as LogoValue | undefined;
  const plinthClass = useMemo(() => plinthClassForLogo(logo?.previewUrl), [logo?.previewUrl]);
  const uploadControl = <LogoUploadControl onUploadLogo={onUploadLogo} disabled={slot.locked} />;

  let body: React.ReactNode;

  if (slot.status === "pending") {
    body = <div className="genoma-v2-skeleton genoma-v2-skeleton--hero" aria-hidden />;
  } else if (slot.status === "candidates" || (slot.status === "needs_user" && slot.candidates.length)) {
    body = (
      <div className="genoma-v2-logo-candidates">
        {slot.candidates.map((candidate, index) => {
          const value = candidate.value as LogoValue;
          return (
            <div key={`${value.assetId}-${index}`} className="genoma-v2-logo-candidate">
              <div className="genoma-v2-logo-candidate__preview">
                {value.previewUrl ? (
                  <GenomaClickableImage src={value.previewUrl} />
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
    );
  } else if (slot.status === "needs_user") {
    body = <p className="genoma-v2-muted">{genomaLocaleEs.noLogo}</p>;
  } else if (!logo?.previewUrl) {
    body = <p className="genoma-v2-muted">{genomaLocaleEs.noLogo}</p>;
  } else {
    body = (
      <div className={`genoma-v2-logo-plinth ${plinthClass}`}>
        <GenomaClickableImage src={logo.previewUrl} className="genoma-v2-logo-plinth__img" />
      </div>
    );
  }

  return (
    <DnaBlock
      label={genomaLocaleEs.logo}
      slotId={slotId}
      slot={slot}
      onAction={onAction}
      className="genoma-v2-block--hero"
      secondaryActions={uploadControl}
    >
      {body}
    </DnaBlock>
  );
}
