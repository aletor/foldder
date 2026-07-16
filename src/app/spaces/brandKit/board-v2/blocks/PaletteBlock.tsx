"use client";

import React, { useMemo, useState } from "react";
import type { PaletteValue, SlotAction, SlotId, SlotState } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { nameColor } from "@/lib/brandkit/name-color";
import { formatCmyk, formatRgb, hexToRgb, readableTextOn, rgbToCmyk } from "../../face-utils";
import { DnaBlock } from "../DnaBlock";
import { BrandKitFoldderButton } from "../BrandKitFoldderButton";
import { Droplet } from "lucide-react";
import { BrandKitBlockSkeleton } from "../BrandKitBlockSkeleton";
import { BrandKitEvidenceTrigger } from "../BrandKitEvidenceTrigger";
import {
  shouldShowAnalyzingSkeleton,
  shouldShowLegacyPendingSkeleton,
  type BrandKitBlockMotionProps,
} from "../brand-kit-block-motion";
import { useBrandKitMosaicCellOptional } from "../brand-kit-mosaic-context";
import { useBrandKitPalettePreview } from "../brand-kit-palette-preview-context";
import { useBrandKitPresentationReadOnly } from "../use-brand-kit-presentation";
import { buildMosaicDetailPayload } from "../BrandKitDetailPanel";
import { useRegisterSlotDetail } from "../BrandKitDetailFooterActions";
import { getSlotAttention } from "@/lib/brandkit/brand-kit-board-status";

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
  onColorPreview,
  onColorPreviewEnd,
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
  onColorPreview?: (nextHex: string) => void;
  onColorPreviewEnd?: () => void;
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
  const bodyClassName = "brandKit-palette-card__body";
  const humanName = nameColor(normalized);
  const bodyContent = (
    <>
      {featured ? <span className="brandKit-palette-card__badge">Principal</span> : null}
      <span className="brandKit-palette-card__human-name">{humanName}</span>
      <span className="brandKit-palette-card__role">{role}</span>
      <span className="brandKit-palette-card__hex">{normalized}</span>
      <span className="brandKit-palette-card__line">
        <span className="brandKit-palette-card__tag">rgb</span>
        {rgb ? formatRgb(rgb) : "—"}
      </span>
      <span className="brandKit-palette-card__line">
        <span className="brandKit-palette-card__tag">cmyk</span>
        {cmyk ? formatCmyk(cmyk) : "—"}
      </span>
    </>
  );

  return (
    <div
      className={`brandKit-palette-card${featured ? " brandKit-palette-card--primary" : ""}${interactive ? "" : " brandKit-palette-card--static"}`}
      style={{
        backgroundColor: normalized,
        color: textColor,
        ...(staggerIndex !== undefined ? { ["--brand-kit-stagger-i" as string]: staggerIndex } : {}),
      }}
    >
      {slot && slotId && evidenceId ? (
        <BrandKitEvidenceTrigger
          id={evidenceId}
          slot={slot}
          slotId={slotId}
          onAction={onAction}
          provenance={slot.provenance}
          confidence={slot.confidence}
        >
          <span className="brandKit-v2-sr-only">{humanName}</span>
        </BrandKitEvidenceTrigger>
      ) : null}
      {interactive && onColorChange ? (
        <label className="brandKit-palette-card__picker" aria-label="Cambiar color">
          <span className="brandKit-v2-sr-only">Cambiar color</span>
          <input
            type="color"
            className="brandKit-palette-card__picker-input"
            value={pickerValue}
            onInput={(event) => onColorPreview?.(normalizeHex(event.currentTarget.value))}
            onChange={(event) => {
              const next = normalizeHex(event.target.value);
              onColorChange(next);
              onColorPreviewEnd?.();
            }}
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
    <div className="brandKit-palette-proportions" aria-label="Proporciones orientativas de uso de color">
      <div className="brandKit-palette-proportions__bar">
        <div
          className="brandKit-palette-proportions__segment brandKit-palette-proportions__segment--60"
          style={{ backgroundColor: primaryHex }}
          title="Principal 60%"
        />
        <div
          className="brandKit-palette-proportions__segment brandKit-palette-proportions__segment--30"
          style={{ backgroundColor: secondaryHex }}
          title="Secundaria y fondo 30%"
        />
        <div
          className="brandKit-palette-proportions__segment brandKit-palette-proportions__segment--10"
          style={{ backgroundColor: accentHex }}
          title="Acento 10%"
        />
      </div>
      <div className="brandKit-palette-proportions__labels">
        <span className="brandKit-palette-proportions__label">
          Principal <span className="brandKit-palette-proportions__pct">60%</span>
        </span>
        <span className="brandKit-palette-proportions__label">
          Secundaria + fondo <span className="brandKit-palette-proportions__pct">30%</span>
        </span>
        <span className="brandKit-palette-proportions__label">
          Acento <span className="brandKit-palette-proportions__pct">10%</span>
        </span>
      </div>
    </div>
  );
}

function PaletteStrip({
  colors,
  onPickPrimary,
  onColorChange,
  onColorPreview,
  onColorPreviewEnd,
  interactive = true,
  showProportions = false,
  slot,
  slotId,
  onAction,
}: {
  colors: PaletteValue["colors"];
  onPickPrimary?: (hex: string) => void;
  onColorChange?: (fromHex: string, toHex: string) => void;
  onColorPreview?: (fromHex: string, toHex: string) => void;
  onColorPreviewEnd?: () => void;
  interactive?: boolean;
  showProportions?: boolean;
  slot?: SlotState<unknown>;
  slotId?: SlotId;
  onAction?: (slotId: SlotId, action: SlotAction) => void;
}) {
  if (!colors.length) return null;

  return (
    <>
      <div className="brandKit-palette-strip">
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
            onColorPreview={onColorPreview ? (next) => onColorPreview(color.hex, next) : undefined}
            onColorPreviewEnd={onColorPreviewEnd}
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
} & BrandKitBlockMotionProps) {
  const palette = slot.value as PaletteValue | undefined;
  const mosaicCell = useBrandKitMosaicCellOptional();
  const palettePreview = useBrandKitPalettePreview();
  const readOnly = useBrandKitPresentationReadOnly();
  const isMosaic = Boolean(mosaicCell);

  const paletteDetailPayload = useMemo(() => {
    if (!isMosaic) return null;
    return buildMosaicDetailPayload({
      slotId,
      blockLabel: brandKitLocaleEs.palette,
      statusLabel: slot.locked ? brandKitLocaleEs.locked : brandKitLocaleEs.confirmedStatus,
      sourceLabel: slot.provenance?.detail ? `Fuente principal: ${slot.provenance.detail}` : undefined,
      panels: [
        {
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
                      {ROLE_LABELS[color.role]} · {color.hex}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="brandKit-v2-muted">{brandKitLocaleEs.noPalette}</p>
          ),
        },
      ],
      initialTabId: getSlotAttention(slot).kind === "conflict" ? "evidence" : undefined,
    });
  }, [isMosaic, palette?.colors, slot, slotId]);

  useRegisterSlotDetail(isMosaic ? slotId : undefined, paletteDetailPayload);

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
    palettePreview?.setPreviewPalette(null);
    onAction(slotId, {
      action: "set",
      value: {
        colors: palette.colors.map((entry) => (entry.hex === fromHex ? { ...entry, hex: normalized } : entry)),
      },
    });
  };

  const previewColor = (fromHex: string, toHex: string) => {
    if (!palette?.colors?.length || slot.locked) return;
    const normalized = normalizeHex(toHex);
    palettePreview?.setPreviewPalette({
      colors: palette.colors.map((entry) => (entry.hex === fromHex ? { ...entry, hex: normalized } : entry)),
    });
  };

  const endColorPreview = () => {
    palettePreview?.setPreviewPalette(null);
  };

  if (shouldShowAnalyzingSkeleton(motion)) {
    body = <BrandKitBlockSkeleton variant="palette" />;
  } else if (shouldShowLegacyPendingSkeleton(motion, slot.status)) {
    body = <div className="brandKit-v2-skeleton brandKit-v2-skeleton--wide" aria-hidden />;
  } else if (slot.status === "candidates") {
    body = (
      <div className="brandKit-palette-options">
        {slot.candidates.map((candidate, index) => {
          const value = candidate.value as PaletteValue;
          return (
            <button
              key={index}
              type="button"
              className="brandKit-palette-option"
              onClick={() => onAction(slotId, { action: "choose_candidate", candidateIndex: index, lock: true })}
            >
              <span className="brandKit-palette-option__label">{brandKitLocaleEs.candidateOption(index + 1)}</span>
              <PaletteStrip colors={value.colors} interactive={false} />
            </button>
          );
        })}
      </div>
    );
  } else if (slot.status === "needs_user") {
    primaryAction = (
      <BrandKitFoldderButton
        variant="white"
        compact
        icon={Droplet}
        onClick={() =>
          onAction(slotId, { action: "set", value: { colors: [{ hex: "#6B4C9A", role: "primary" }] } satisfies PaletteValue })
        }
      >
        {brandKitLocaleEs.chooseColor}
      </BrandKitFoldderButton>
    );
    body = <p className="brandKit-v2-muted">{brandKitLocaleEs.noPalette}</p>;
  } else if (!palette?.colors?.length) {
    body = <p className="brandKit-v2-muted">{brandKitLocaleEs.noPalette}</p>;
  } else {
    body = (
      <PaletteStrip
        colors={palette.colors}
        onPickPrimary={readOnly || slot.locked ? undefined : pickPrimary}
        onColorChange={readOnly || slot.locked ? undefined : changeColor}
        onColorPreview={readOnly || slot.locked ? undefined : previewColor}
        onColorPreviewEnd={readOnly || slot.locked ? undefined : endColorPreview}
        interactive={!readOnly && !slot.locked}
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
