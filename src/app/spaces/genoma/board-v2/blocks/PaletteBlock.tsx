"use client";

import React from "react";
import type { PaletteValue, SlotAction, SlotId, SlotState } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { formatCmyk, formatRgb, hexToRgb, rgbToCmyk } from "../../face-utils";
import { DnaBlock } from "../DnaBlock";
import { GenomaFoldderButton } from "../GenomaFoldderButton";
import { Droplet } from "lucide-react";

const ROLE_LABELS: Record<PaletteValue["colors"][number]["role"], string> = {
  primary: "Principal",
  secondary: "Secundaria",
  accent: "Acento",
  background: "Fondo",
  text: "Texto",
  neutral: "Neutro",
};

function normalizeHex(hex: string): string {
  const trimmed = hex.trim();
  return trimmed.startsWith("#") ? trimmed.toUpperCase() : `#${trimmed.toUpperCase()}`;
}

function PaletteColorRow({
  hex,
  role,
  featured = false,
  onPickPrimary,
  onColorChange,
}: {
  hex: string;
  role: string;
  featured?: boolean;
  onPickPrimary?: () => void;
  onColorChange?: (nextHex: string) => void;
}) {
  const normalized = normalizeHex(hex);
  const pickerValue = normalized.toLowerCase();
  const rgb = hexToRgb(normalized);
  const cmyk = rgb ? rgbToCmyk(rgb) : null;

  return (
    <div className="genoma-palette-color">
      <label className="genoma-palette-color__picker-wrap" title="Cambiar color">
        <div
          className={`genoma-palette-color__swatch${featured ? " genoma-palette-color__swatch--featured" : ""}`}
          style={{ backgroundColor: normalized }}
          aria-hidden
        />
        {onColorChange ? (
          <input
            type="color"
            className="genoma-palette-color__picker"
            value={pickerValue}
            onChange={(event) => onColorChange(normalizeHex(event.target.value))}
          />
        ) : null}
      </label>
      <div className="genoma-palette-color__meta">
        <button
          type="button"
          className="genoma-palette-color__meta-btn"
          onClick={onPickPrimary}
          disabled={!onPickPrimary}
        >
          <div className="genoma-palette-color__role">{role}</div>
          <div className="genoma-palette-color__hex">{normalized}</div>
          <div className="genoma-palette-color__line">
            <span className="genoma-palette-color__tag">rgb</span>
            {rgb ? formatRgb(rgb) : "—"}
          </div>
          <div className="genoma-palette-color__line">
            <span className="genoma-palette-color__tag">cmyk</span>
            {cmyk ? formatCmyk(cmyk) : "—"}
          </div>
        </button>
      </div>
    </div>
  );
}

function PaletteSheet({
  colors,
  onPickPrimary,
  onColorChange,
}: {
  colors: PaletteValue["colors"];
  onPickPrimary?: (hex: string) => void;
  onColorChange?: (fromHex: string, toHex: string) => void;
}) {
  const [primary, ...rest] = colors;

  return (
    <div className="genoma-palette-sheet">
      {primary ? (
        <PaletteColorRow
          hex={primary.hex}
          role={ROLE_LABELS[primary.role] ?? primary.role}
          featured
          onPickPrimary={onPickPrimary ? () => onPickPrimary(primary.hex) : undefined}
          onColorChange={onColorChange ? (next) => onColorChange(primary.hex, next) : undefined}
        />
      ) : null}
      {rest.map((color) => (
        <PaletteColorRow
          key={`${color.role}-${color.hex}`}
          hex={color.hex}
          role={ROLE_LABELS[color.role] ?? color.role}
          onPickPrimary={onPickPrimary ? () => onPickPrimary(color.hex) : undefined}
          onColorChange={onColorChange ? (next) => onColorChange(color.hex, next) : undefined}
        />
      ))}
    </div>
  );
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

  const pickPrimary = (hex: string) => {
    if (!palette?.colors?.length || slot.locked) return;
    onAction(slotId, {
      action: "set",
      value: {
        colors: palette.colors.map((entry) =>
          entry.hex === hex ? { ...entry, role: "primary" } : entry.role === "primary" ? { ...entry, role: "accent" } : entry,
        ),
      },
    });
  };

  const changeColor = (fromHex: string, toHex: string) => {
    if (!palette?.colors?.length || slot.locked) return;
    const normalized = normalizeHex(toHex);
    onAction(slotId, {
      action: "set",
      value: {
        colors: palette.colors.map((entry) => (entry.hex === fromHex ? { ...entry, hex: normalized } : entry)),
      },
    });
  };

  if (slot.status === "pending") {
    body = <div className="genoma-v2-skeleton genoma-v2-skeleton--wide" aria-hidden />;
  } else if (slot.status === "candidates") {
    body = (
      <div className="genoma-palette-sheet">
        {slot.candidates.map((candidate, index) => {
          const value = candidate.value as PaletteValue;
          const hex = value.colors[0]?.hex ?? "#888888";
          return (
            <PaletteColorRow
              key={index}
              hex={hex}
              role={`Opción ${index + 1}`}
              onPickPrimary={() => onAction(slotId, { action: "choose_candidate", candidateIndex: index, lock: true })}
            />
          );
        })}
      </div>
    );
  } else if (slot.status === "needs_user") {
    primaryAction = (
      <GenomaFoldderButton
        icon={Droplet}
        onClick={() =>
          onAction(slotId, { action: "set", value: { colors: [{ hex: "#6B4C9A", role: "primary" }] } satisfies PaletteValue })
        }
      >
        {genomaLocaleEs.chooseColor}
      </GenomaFoldderButton>
    );
    body = <p className="genoma-v2-muted">{genomaLocaleEs.noPalette}</p>;
  } else if (!palette?.colors?.length) {
    body = <p className="genoma-v2-muted">{genomaLocaleEs.noPalette}</p>;
  } else {
    body = <PaletteSheet colors={palette.colors} onPickPrimary={pickPrimary} onColorChange={changeColor} />;
  }

  return (
    <DnaBlock label={genomaLocaleEs.palette} slotId={slotId} slot={slot} onAction={onAction} primaryAction={primaryAction}>
      {body}
    </DnaBlock>
  );
}
