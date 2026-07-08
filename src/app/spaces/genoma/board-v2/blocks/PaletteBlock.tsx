"use client";

import React from "react";
import type { PaletteValue, SlotAction, SlotId, SlotState } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { DnaBlock } from "../DnaBlock";

function isMonochromePalette(colors: PaletteValue["colors"]): boolean {
  if (!colors.length) return false;
  const unique = new Set(colors.map((color) => color.hex.toUpperCase()));
  return unique.size <= 1;
}

export function PaletteBlock({
  slot,
  slotId,
  onAction,
}: {
  slot: SlotState<unknown>;
  slotId: SlotId;
  onAction: (slotId: SlotId, action: SlotAction) => void;
}) {
  const palette = slot.value as PaletteValue | undefined;
  let body: React.ReactNode;
  let primaryAction: React.ReactNode;

  if (slot.status === "pending") {
    body = <div className="genoma-v2-skeleton" aria-hidden />;
  } else if (slot.status === "candidates") {
    body = (
      <div className="genoma-v2-swatches">
        {slot.candidates.map((candidate, index) => {
          const value = candidate.value as PaletteValue;
          const hex = value.colors[0]?.hex ?? "#888";
          return (
            <button
              key={index}
              type="button"
              className="genoma-v2-swatch"
              style={{ backgroundColor: hex }}
              title={hex}
              onClick={() => onAction(slotId, { action: "choose_candidate", candidateIndex: index, lock: true })}
            />
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
          onAction(slotId, { action: "set", value: { colors: [{ hex: "#6B4C9A", role: "primary" }] } satisfies PaletteValue })
        }
      >
        {genomaLocaleEs.chooseColor}
      </button>
    );
    body = <p className="genoma-v2-muted">{genomaLocaleEs.noPalette}</p>;
  } else if (!palette?.colors?.length) {
    body = <p className="genoma-v2-muted">{genomaLocaleEs.noPalette}</p>;
  } else if (isMonochromePalette(palette.colors)) {
    const hex = palette.colors[0]?.hex ?? "#888";
    body = (
      <div className="genoma-v2-monochrome">
        <span className="genoma-v2-swatch genoma-v2-swatch--rect genoma-v2-swatch--solo" style={{ backgroundColor: hex }} title={hex} />
        <p className="genoma-v2-muted">{genomaLocaleEs.monochromePalette}</p>
      </div>
    );
  } else {
    body = (
      <div className="genoma-v2-swatches genoma-v2-swatches--stack">
        {palette.colors.map((color) => (
          <button
            key={`${color.role}-${color.hex}`}
            type="button"
            className={`genoma-v2-swatch genoma-v2-swatch--rect${color.role === "primary" ? " is-primary" : ""}`}
            style={{ backgroundColor: color.hex }}
            title={`${color.role} · ${color.hex}`}
            onClick={() =>
              onAction(slotId, {
                action: "set",
                value: {
                  colors: palette.colors.map((entry) =>
                    entry.hex === color.hex
                      ? { ...entry, role: "primary" }
                      : entry.role === "primary"
                        ? { ...entry, role: "accent" }
                        : entry,
                  ),
                },
              })
            }
          />
        ))}
      </div>
    );
  }

  return (
    <DnaBlock label={genomaLocaleEs.palette} slotId={slotId} slot={slot} onAction={onAction} primaryAction={primaryAction}>
      {body}
    </DnaBlock>
  );
}
