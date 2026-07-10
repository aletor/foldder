"use client";

import React, { useState } from "react";
import type { SlotAction, SlotId, SlotState, TypographyValue } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { DnaBlock } from "../DnaBlock";
import { GenomaFoldderButton } from "../GenomaFoldderButton";
import { GenomaIconButton } from "../GenomaIconButton";
import { GenomaTextEditPanel } from "../GenomaTextEditPanel";
import { CaseSensitive, Pencil } from "lucide-react";
import { GenomaBlockSkeleton } from "../GenomaBlockSkeleton";
import {
  shouldShowAnalyzingSkeleton,
  shouldShowLegacyPendingSkeleton,
  type GenomaBlockMotionProps,
} from "../genoma-block-motion";
import { normalizeFontDisplayName } from "@/lib/genoma/normalize-font-display-name";
import { GenomaEvidenceTrigger } from "../GenomaEvidenceTrigger";
import { useGenomaMosaicCellOptional } from "../genoma-mosaic-context";

type TypographyFamily = TypographyValue["families"][number];

const ALPHABET_LINE =
  "AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz";
const NUMERIC_LINE = "0123456789 &?!%";

function fontStack(family: TypographyFamily): string {
  const displayName = normalizeFontDisplayName(family.family) ?? family.family;
  return `${displayName.includes(" ") ? `"${displayName}"` : displayName}, ${family.fallbacks.join(", ")}`;
}

function typographyDisplayName(family: TypographyFamily): string {
  return normalizeFontDisplayName(family.family) ?? family.family;
}

function isEstimatedCustomFamily(family: TypographyFamily): boolean {
  return family.source === "custom";
}

function pickPrimarySecondary(families: TypographyFamily[]): { primary?: TypographyFamily; secondary?: TypographyFamily } {
  const primary =
    families.find((family) => family.role === "heading" || family.role === "display") ?? families[0];
  const secondary =
    families.find((family) => family.role === "body" && family.family !== primary?.family) ??
    families.find((family) => family.family !== primary?.family) ??
    families[1];
  return { primary, secondary };
}

function roleLabel(role: TypographyFamily["role"]): string {
  if (role === "body") return genomaLocaleEs.typeSecondary;
  return genomaLocaleEs.typePrimary;
}

const WEIGHT_SAMPLE = "AaBbCc 0123";

function TypographyComparisonColumn({
  family,
  label,
  specimenText,
  slot,
  slotId,
  onAction,
  onCorrect,
}: {
  family: TypographyFamily;
  label: string;
  specimenText: string;
  slot?: SlotState<unknown>;
  slotId?: SlotId;
  onAction?: (slotId: SlotId, action: SlotAction) => void;
  onCorrect?: () => void;
}) {
  const stack = fontStack(family);
  const estimated = isEstimatedCustomFamily(family);
  const weights = [...family.weights].sort((a, b) => a - b);

  return (
    <div className="genoma-type-column genoma-type-column--comparison">
      <div className="genoma-type-column__head">
        <span className="genoma-type-column__label">{label}</span>
        {slot && slotId ? (
          <GenomaEvidenceTrigger
            id={`typography-${slotId}-${family.family}`}
            slot={slot}
            slotId={slotId}
            onAction={onAction}
            onCorrect={onCorrect}
            provenance={slot.provenance}
            confidence={slot.confidence}
          >
            <span className="genoma-type-column__family">{typographyDisplayName(family)}</span>
          </GenomaEvidenceTrigger>
        ) : (
          <span className="genoma-type-column__family">{typographyDisplayName(family)}</span>
        )}
        <span className="genoma-type-column__meta">
          {weights.join(" · ")} · {family.source}
        </span>
        {estimated ? (
          <span className="genoma-v2-chapter-micro genoma-type-estimated-note">Estimada a partir del material</span>
        ) : null}
      </div>
      <div className="genoma-type-alphabet genoma-type-alphabet--body" style={{ fontFamily: stack }} aria-hidden>
        <span>{ALPHABET_LINE}</span>
        <span>{NUMERIC_LINE}</span>
      </div>
      <div className="genoma-type-weight-ladder genoma-type-weight-ladder--body">
        {weights.map((weight) => (
          <div key={weight} className="genoma-type-weight-step">
            <span className="genoma-v2-chapter-micro">{weight}</span>
            <p className="genoma-type-weight-step__sample" style={{ fontFamily: stack, fontWeight: weight }}>
              {WEIGHT_SAMPLE}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TypographyColumn({
  family,
  label,
  specimenText,
  slot,
  slotId,
  onAction,
  onCorrect,
}: {
  family: TypographyFamily;
  label: string;
  specimenText: string;
  slot?: SlotState<unknown>;
  slotId?: SlotId;
  onAction?: (slotId: SlotId, action: SlotAction) => void;
  onCorrect?: () => void;
}) {
  const stack = fontStack(family);
  const estimated = isEstimatedCustomFamily(family);
  const weights = [...family.weights].sort((a, b) => a - b);

  return (
    <div className="genoma-type-column">
      <div className="genoma-type-column__head">
        <span className="genoma-type-column__label">{label}</span>
        {slot && slotId ? (
          <GenomaEvidenceTrigger
            id={`typography-${slotId}-${family.family}`}
            slot={slot}
            slotId={slotId}
            onAction={onAction}
            onCorrect={onCorrect}
            provenance={slot.provenance}
            confidence={slot.confidence}
          >
            <span className="genoma-type-column__family">{typographyDisplayName(family)}</span>
          </GenomaEvidenceTrigger>
        ) : (
          <span className="genoma-type-column__family">{typographyDisplayName(family)}</span>
        )}
        <span className="genoma-type-column__meta">
          {weights.join(" · ")} · {family.source}
        </span>
        {estimated ? (
          <span className="genoma-v2-chapter-micro genoma-type-estimated-note">Estimada a partir del material</span>
        ) : null}
      </div>
      <div className="genoma-type-column__specimens">
        <p className="genoma-type-specimen genoma-type-specimen--headline" style={{ fontFamily: stack }}>
          {specimenText}
        </p>
        <div className="genoma-type-alphabet" style={{ fontFamily: stack }} aria-hidden>
          <span>{ALPHABET_LINE}</span>
          <span>{NUMERIC_LINE}</span>
        </div>
        <div className="genoma-type-weight-ladder">
          {weights.map((weight) => (
            <div key={weight} className="genoma-type-weight-step">
              <span className="genoma-v2-chapter-micro">{weight}</span>
              <p className="genoma-type-weight-step__sample" style={{ fontFamily: stack, fontWeight: weight }}>
                {specimenText}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TypographyMosaicLayout({
  families,
  specimenText,
  slot,
  slotId,
  onAction,
  onCorrect,
}: {
  families: TypographyFamily[];
  specimenText: string;
  slot?: SlotState<unknown>;
  slotId?: SlotId;
  onAction?: (slotId: SlotId, action: SlotAction) => void;
  onCorrect?: () => void;
}) {
  const { primary, secondary } = pickPrimarySecondary(families);
  if (!primary) return null;

  const primaryStack = fontStack(primary);
  const estimated = isEstimatedCustomFamily(primary);
  const weights = [...primary.weights].sort((a, b) => a - b);

  return (
    <div className="genoma-type-strip genoma-type-strip--mosaic">
      <div className="genoma-type-mosaic-primary">
        <div className="genoma-type-column__head">
          <span className="genoma-type-column__label">{roleLabel(primary.role)}</span>
          {slot && slotId ? (
            <GenomaEvidenceTrigger
              id={`typography-${slotId}-${primary.family}`}
              slot={slot}
              slotId={slotId}
              onAction={onAction}
              onCorrect={onCorrect}
              provenance={slot.provenance}
              confidence={slot.confidence}
            >
              <span className="genoma-type-column__family">{typographyDisplayName(primary)}</span>
            </GenomaEvidenceTrigger>
          ) : (
            <span className="genoma-type-column__family">{typographyDisplayName(primary)}</span>
          )}
          <span className="genoma-type-column__meta">
            {weights.join(" · ")} · {primary.source}
          </span>
          {estimated ? (
            <span className="genoma-v2-chapter-micro genoma-type-estimated-note">Estimada a partir del material</span>
          ) : null}
        </div>
        <p
          className="genoma-type-specimen--mosaic-display"
          style={{ fontFamily: primaryStack }}
        >
          {specimenText}
        </p>
      </div>
      {secondary && secondary.family !== primary.family ? (
        <TypographyComparisonColumn
          family={secondary}
          label={genomaLocaleEs.typeSecondary}
          specimenText={specimenText}
          slot={slot}
          slotId={slotId}
          onAction={onAction}
          onCorrect={onCorrect}
        />
      ) : null}
    </div>
  );
}

function TypographyStrip({
  families,
  specimenText,
  slot,
  slotId,
  onAction,
  onCorrect,
}: {
  families: TypographyFamily[];
  specimenText: string;
  slot?: SlotState<unknown>;
  slotId?: SlotId;
  onAction?: (slotId: SlotId, action: SlotAction) => void;
  onCorrect?: () => void;
}) {
  const mosaicCell = useGenomaMosaicCellOptional();
  const isMosaic = Boolean(mosaicCell);
  const { primary, secondary } = pickPrimarySecondary(families);

  if (isMosaic) {
    return (
      <TypographyMosaicLayout
        families={families}
        specimenText={specimenText}
        slot={slot}
        slotId={slotId}
        onAction={onAction}
        onCorrect={onCorrect}
      />
    );
  }

  return (
    <div className="genoma-type-strip">
      {primary ? (
        <TypographyColumn
          family={primary}
          label={roleLabel(primary.role)}
          specimenText={specimenText}
          slot={slot}
          slotId={slotId}
          onAction={onAction}
          onCorrect={onCorrect}
        />
      ) : null}
      {secondary && secondary.family !== primary?.family ? (
        <TypographyColumn
          family={secondary}
          label={genomaLocaleEs.typeSecondary}
          specimenText={specimenText}
          slot={slot}
          slotId={slotId}
          onAction={onAction}
          onCorrect={onCorrect}
        />
      ) : (
        <div className="genoma-type-column genoma-type-column--empty">
          <span className="genoma-v2-muted">Sin tipografía secundaria detectada</span>
        </div>
      )}
    </div>
  );
}

export function TypographyBlock({
  slot,
  slotId,
  onAction,
  activeSlotId,
  motion,
  specimenText = genomaLocaleEs.typeSpecimenPhrase,
}: {
  slot: SlotState<unknown>;
  slotId: SlotId;
  onAction: (slotId: SlotId, action: SlotAction) => void;
  activeSlotId?: SlotId;
  specimenText?: string;
} & GenomaBlockMotionProps) {
  const typography = slot.value as TypographyValue | undefined;
  const [editing, setEditing] = useState(false);
  let body: React.ReactNode;
  let primaryAction: React.ReactNode;

  const { primary, secondary } = pickPrimarySecondary(typography?.families ?? []);
  const canEdit = Boolean(typography?.families?.length && slot.status === "resolved" && !slot.locked);
  const editButton = canEdit ? (
    <GenomaIconButton icon={Pencil} label={genomaLocaleEs.edit} onClick={() => setEditing(true)} />
  ) : null;

  if (shouldShowAnalyzingSkeleton(motion)) {
    body = <GenomaBlockSkeleton variant="typography" />;
  } else if (shouldShowLegacyPendingSkeleton(motion, slot.status)) {
    body = <div className="genoma-v2-skeleton genoma-v2-skeleton--wide" aria-hidden />;
  } else if (editing && typography) {
    body = (
      <GenomaTextEditPanel
        fields={[
          { id: "primary", label: genomaLocaleEs.typePrimary, value: primary?.family ?? "" },
          { id: "secondary", label: genomaLocaleEs.typeSecondary, value: secondary?.family ?? "" },
        ]}
        onSave={(values) => {
          const nextFamilies = typography.families.map((family) => {
            if (family.family === primary?.family) {
              return { ...family, family: values.primary.trim() || family.family };
            }
            if (family.family === secondary?.family) {
              return { ...family, family: values.secondary.trim() || family.family };
            }
            return family;
          });
          onAction(slotId, {
            action: "set",
            value: { families: nextFamilies } satisfies TypographyValue,
          });
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  } else if (slot.status === "candidates") {
    body = (
      <div className="genoma-type-strip genoma-type-strip--candidates">
        {slot.candidates.map((candidate, index) => {
          const value = candidate.value as TypographyValue;
          return (
            <button
              key={index}
              type="button"
              className="genoma-type-candidate"
              onClick={() => onAction(slotId, { action: "choose_candidate", candidateIndex: index })}
            >
              <TypographyStrip
                families={value.families}
                specimenText={specimenText}
                slot={slot}
                slotId={slotId}
                onAction={onAction}
              />
            </button>
          );
        })}
      </div>
    );
  } else if (!typography?.families?.length) {
    if (slot.status === "needs_user") {
      primaryAction = (
        <GenomaFoldderButton
          icon={CaseSensitive}
          onClick={() =>
            onAction(slotId, {
              action: "set",
              value: {
                families: [{ family: "Inter", role: "body", source: "google", fallbacks: ["sans-serif"], weights: [400, 600] }],
              } satisfies TypographyValue,
            })
          }
        >
          {genomaLocaleEs.chooseFonts}
        </GenomaFoldderButton>
      );
    }
    body = <p className="genoma-v2-muted">{genomaLocaleEs.noTypography}</p>;
  } else {
    body = (
      <TypographyStrip
        families={typography.families}
        specimenText={specimenText}
        slot={slot}
        slotId={slotId}
        onAction={onAction}
        onCorrect={() => setEditing(true)}
      />
    );
  }

  return (
    <DnaBlock
      slotId={slotId}
      slot={slot}
      onAction={onAction}
      primaryAction={primaryAction}
      secondaryActions={editButton}
      activeSlotId={activeSlotId}
    >
      {body}
    </DnaBlock>
  );
}
