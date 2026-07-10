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

type TypographyFamily = TypographyValue["families"][number];

function fontStack(family: TypographyFamily): string {
  return `${family.family}, ${family.fallbacks.join(", ")}`;
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

function TypographyColumn({ family, label }: { family: TypographyFamily; label: string }) {
  const stack = fontStack(family);
  const phrase = genomaLocaleEs.typeSpecimenPhrase;

  return (
    <div className="genoma-type-column">
      <div className="genoma-type-column__head">
        <span className="genoma-type-column__label">{label}</span>
        <span className="genoma-type-column__family">{family.family}</span>
        <span className="genoma-type-column__meta">
          {family.weights.join(" · ")} · {family.source}
        </span>
      </div>
      <div className="genoma-type-column__specimens">
        <p className="genoma-type-specimen genoma-type-specimen--bold" style={{ fontFamily: stack }}>
          {phrase}
        </p>
        <p className="genoma-type-specimen genoma-type-specimen--light" style={{ fontFamily: stack }}>
          {phrase}
        </p>
        <p className="genoma-type-specimen genoma-type-specimen--italic" style={{ fontFamily: stack }}>
          {phrase}
        </p>
      </div>
    </div>
  );
}

function TypographyStrip({ families }: { families: TypographyFamily[] }) {
  const { primary, secondary } = pickPrimarySecondary(families);

  return (
    <div className="genoma-type-strip">
      {primary ? <TypographyColumn family={primary} label={roleLabel(primary.role)} /> : null}
      {secondary && secondary.family !== primary?.family ? (
        <TypographyColumn family={secondary} label={genomaLocaleEs.typeSecondary} />
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
}: {
  slot: SlotState<unknown>;
  slotId: SlotId;
  onAction: (slotId: SlotId, action: SlotAction) => void;
  activeSlotId?: SlotId;
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
              <TypographyStrip families={value.families} />
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
    body = <TypographyStrip families={typography.families} />;
  }

  return (
    <DnaBlock
      label={genomaLocaleEs.typography}
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
