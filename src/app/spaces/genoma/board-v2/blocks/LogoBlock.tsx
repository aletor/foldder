"use client";

/* eslint-disable @next/next/no-img-element */

import React, { useMemo } from "react";
import type { LogoValue, SlotAction, SlotId, SlotState } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { DnaBlock } from "../DnaBlock";

function relativeLuminance(hex: string): number {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return 0.5;
  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function plinthClassForLogo(url?: string): string {
  if (!url) return "genoma-v2-logo-plinth--neutral";
  return "genoma-v2-logo-plinth--adaptive";
}

export function LogoBlock({
  slot,
  slotId,
  onAction,
}: {
  slot: SlotState<unknown>;
  slotId: SlotId;
  onAction: (slotId: SlotId, action: SlotAction) => void;
}) {
  const logo = slot.value as LogoValue | undefined;
  const plinthClass = useMemo(() => plinthClassForLogo(logo?.previewUrl), [logo?.previewUrl]);

  let body: React.ReactNode;
  let primaryAction: React.ReactNode;

  if (slot.status === "pending") {
    body = <div className="genoma-v2-skeleton genoma-v2-skeleton--hero" aria-hidden />;
  } else if (slot.status === "candidates" || (slot.status === "needs_user" && slot.candidates.length)) {
    body = (
      <div className="genoma-v2-gallery-grid">
        {slot.candidates.map((candidate, index) => {
          const value = candidate.value as LogoValue;
          return (
            <button
              key={`${value.assetId}-${index}`}
              type="button"
              className="genoma-v2-gallery-item"
              onClick={() => onAction(slotId, { action: "choose_candidate", candidateIndex: index, lock: true })}
            >
              {value.previewUrl ? <img src={value.previewUrl} alt="" draggable={false} /> : <span>{value.assetId}</span>}
            </button>
          );
        })}
      </div>
    );
  } else if (slot.status === "needs_user") {
    primaryAction = (
      <button
        type="button"
        className="genoma-v2-btn"
        onClick={() =>
          onAction(slotId, {
            action: "set",
            value: {
              assetId: "uploaded-logo",
              previewUrl: "/nodes/layerizer-mark.png",
              format: "png",
              width: 512,
              height: 512,
              background: "transparent",
              variants: [],
            } satisfies LogoValue,
          })
        }
      >
        {genomaLocaleEs.uploadLogo}
      </button>
    );
    body = <p className="genoma-v2-muted">{genomaLocaleEs.noLogo}</p>;
  } else if (!logo?.previewUrl) {
    body = <p className="genoma-v2-muted">{genomaLocaleEs.noLogo}</p>;
  } else {
    body = (
      <div className={`genoma-v2-logo-plinth ${plinthClass}`}>
        <img
          src={logo.previewUrl}
          alt=""
          draggable={false}
          className="genoma-v2-logo-plinth__img"
          style={{ filter: relativeLuminance("#ffffff") > 0.9 ? "none" : undefined }}
        />
      </div>
    );
  }

  return (
    <DnaBlock label={genomaLocaleEs.logo} slotId={slotId} slot={slot} onAction={onAction} className="genoma-v2-block--hero" primaryAction={primaryAction}>
      {body}
    </DnaBlock>
  );
}
