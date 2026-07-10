"use client";

import React from "react";
import type { PaletteValue, SlotAction, SlotId, SlotState } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { nameColor } from "@/lib/genoma/name-color";
import { formatCmyk, formatRgb, hexToRgb, readableTextOn, rgbToCmyk } from "../../face-utils";
import { DnaBlock } from "../DnaBlock";
import { GenomaFoldderButton } from "../GenomaFoldderButton";
import { Droplet } from "lucide-react";
import { GenomaBlockSkeleton } from "../GenomaBlockSkeleton";
import { GenomaEvidenceTrigger } from "../GenomaEvidenceTrigger";
import {
  shouldShowAnalyzingSkeleton,
  shouldShowLegacyPendingSkeleton,
  type GenomaBlockMotionProps,
} from "../genoma-block-motion";

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

function PaletteColorCard({
  hex,
  role,
  featured = false,
  interactive = true,
  onPickPrimary,
  onColorChange,
  staggerIndex,
  slot,
  slotId,
  onAction,
  evidenceId,
}: {
  hex: string;
  role: string;
  featured?: boolean;
  interactive?: boolean;
  onPickPrimary?: () => void;
  onColorChange?: (nextHex: string) => void;
  staggerIndex?: number;
  slot?: SlotState<unknown>;
  slotId?: SlotId;
  onAction?: (slotId: SlotId, action: SlotAction) => void;
  evidenceId?: string;
}) {
  const normalized = normalizeHex(hex);
  const pickerValue = normalized.toLowerCase();
  const rgb = hexToRgb(normalized);
  const cmyk = rgb ? rgbToCmyk(rgb) : null;
  const textColor = readableTextOn(normalized);
  const pickable = interactive && Boolean(onPickPrimary);
  const bodyClassName = "genoma-palette-card__body";
  const humanName = nameColor(normalized);
  const bodyContent = (
    <>
      {featured ? <span className="genoma-palette-card__badge">Principal</span> : null}
      <span className="genoma-palette-card__human-name">{humanName}</span>
      <span className="genoma-palette-card__role">{role}</span>
      <span className="genoma-palette-card__hex">{normalized}</span>
      <span className="genoma-palette-card__line">
        <span className="genoma-palette-card__tag">rgb</span>
        {rgb ? formatRgb(rgb) : "—"}
      </span>
      <span className="genoma-palette-card__line">
        <span className="genoma-palette-card__tag">cmyk</span>
        {cmyk ? formatCmyk(cmyk) : "—"}
      </span>
    </>
  );

  return (
    <div
      className={`genoma-palette-card${featured ? " genoma-palette-card--primary" : ""}${interactive ? "" : " genoma-palette-card--static"}`}
      style={{
        backgroundColor: normalized,
        color: textColor,
        ...(staggerIndex !== undefined ? { ["--genoma-stagger-i" as string]: staggerIndex } : {}),
      }}
    >
      {slot && slotId && evidenceId ? (
        <GenomaEvidenceTrigger
          id={evidenceId}
          slot={slot}
          slotId={slotId}
          onAction={onAction}
          provenance={slot.provenance}
          confidence={slot.confidence}
        >
          <span className="genoma-v2-sr-only">{humanName}</span>
        </GenomaEvidenceTrigger>
      ) : null}
      {interactive && onColorChange ? (
        <label className="genoma-palette-card__picker" title="Cambiar color">
          <span className="genoma-v2-sr-only">Cambiar color</span>
          <input
            type="color"
            className="genoma-palette-card__picker-input"
            value={pickerValue}
            onChange={(event) => onColorChange(normalizeHex(event.target.value))}
          />
        </label>
      ) : null}

      {pickable ? (
        <button type="button" className={bodyClassName} onClick={onPickPrimary}>
          {bodyContent}
        </button>
      ) : (
        <div className={bodyClassName}>{bodyContent}</div>
      )}
    </div>
  );
}

function PaletteProportionsBar({ colors }: { colors: PaletteValue["colors"] }) {
  const primaryHex = colors.find((entry) => entry.role === "primary")?.hex ?? colors[0]?.hex ?? "#cccccc";
  const secondaryHex =
    colors.find((entry) => entry.role === "secondary")?.hex ??
    colors.find((entry) => entry.role === "background")?.hex ??
    "#dddddd";
  const accentHex =
    colors.find((entry) => entry.role === "accent")?.hex ??
    colors.find((entry) => entry.role === "neutral")?.hex ??
    "#999999";

  return (
    <div className="genoma-palette-proportions" aria-label="Proporciones orientativas de uso de color">
      <div className="genoma-palette-proportions__bar">
        <div
          className="genoma-palette-proportions__segment genoma-palette-proportions__segment--60"
          style={{ backgroundColor: primaryHex }}
          title="Principal 60%"
        />
        <div
          className="genoma-palette-proportions__segment genoma-palette-proportions__segment--30"
          style={{ backgroundColor: secondaryHex }}
          title="Secundaria y fondo 30%"
        />
        <div
          className="genoma-palette-proportions__segment genoma-palette-proportions__segment--10"
          style={{ backgroundColor: accentHex }}
          title="Acento 10%"
        />
      </div>
      <div className="genoma-palette-proportions__labels">
        <span className="genoma-palette-proportions__label">
          Principal <span className="genoma-palette-proportions__pct">60%</span>
        </span>
        <span className="genoma-palette-proportions__label">
          Secundaria + fondo <span className="genoma-palette-proportions__pct">30%</span>
        </span>
        <span className="genoma-palette-proportions__label">
          Acento <span className="genoma-palette-proportions__pct">10%</span>
        </span>
      </div>
    </div>
  );
}

function PaletteStrip({
  colors,
  onPickPrimary,
  onColorChange,
  interactive = true,
  showProportions = false,
  slot,
  slotId,
  onAction,
}: {
  colors: PaletteValue["colors"];
  onPickPrimary?: (hex: string) => void;
  onColorChange?: (fromHex: string, toHex: string) => void;
  interactive?: boolean;
  showProportions?: boolean;
  slot?: SlotState<unknown>;
  slotId?: SlotId;
  onAction?: (slotId: SlotId, action: SlotAction) => void;
}) {
  if (!colors.length) return null;

  return (
    <>
      <div className="genoma-palette-strip">
        {colors.map((color, index) => (
          <PaletteColorCard
            key={`${color.role}-${color.hex}`}
            hex={color.hex}
            role={ROLE_LABELS[color.role] ?? color.role}
            featured={color.role === "primary"}
            interactive={interactive}
            staggerIndex={index}
            onPickPrimary={onPickPrimary ? () => onPickPrimary(color.hex) : undefined}
            onColorChange={onColorChange ? (next) => onColorChange(color.hex, next) : undefined}
            slot={slot}
            slotId={slotId}
            onAction={onAction}
            evidenceId={`palette-${color.role}-${color.hex}`}
          />
        ))}
      </div>
      {showProportions ? <PaletteProportionsBar colors={colors} /> : null}
    </>
  );
}

export function PaletteBlock({
  slot,
  slotId,
  onAction,
  activeSlotId,
  motion,
}: {
  slot: SlotState<unknown>;
  slotId: SlotId;
  onAction: (slotId: SlotId, action: SlotAction) => void;
  activeSlotId?: SlotId;
} & GenomaBlockMotionProps) {
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

  if (shouldShowAnalyzingSkeleton(motion)) {
    body = <GenomaBlockSkeleton variant="palette" />;
  } else if (shouldShowLegacyPendingSkeleton(motion, slot.status)) {
    body = <div className="genoma-v2-skeleton genoma-v2-skeleton--wide" aria-hidden />;
  } else if (slot.status === "candidates") {
    body = (
      <div className="genoma-palette-options">
        {slot.candidates.map((candidate, index) => {
          const value = candidate.value as PaletteValue;
          return (
            <button
              key={index}
              type="button"
              className="genoma-palette-option"
              onClick={() => onAction(slotId, { action: "choose_candidate", candidateIndex: index, lock: true })}
            >
              <span className="genoma-palette-option__label">{genomaLocaleEs.candidateOption(index + 1)}</span>
              <PaletteStrip colors={value.colors} interactive={false} />
            </button>
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
    body = (
      <PaletteStrip
        colors={palette.colors}
        onPickPrimary={slot.locked ? undefined : pickPrimary}
        onColorChange={slot.locked ? undefined : changeColor}
        showProportions
        slot={slot}
        slotId={slotId}
        onAction={onAction}
      />
    );
  }

  return (
    <DnaBlock slotId={slotId} slot={slot} onAction={onAction} primaryAction={primaryAction} activeSlotId={activeSlotId}>
      {body}
    </DnaBlock>
  );
}
