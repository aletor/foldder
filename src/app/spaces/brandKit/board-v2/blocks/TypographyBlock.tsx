"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { SlotAction, SlotId, SlotState, TypographyValue } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { DnaBlock } from "../DnaBlock";
import { BrandKitFoldderButton } from "../BrandKitFoldderButton";
import { BrandKitTextEditPanel } from "../BrandKitTextEditPanel";
import { CaseSensitive, Pencil } from "lucide-react";
import { BrandKitBlockSkeleton } from "../BrandKitBlockSkeleton";
import {
  shouldShowAnalyzingSkeleton,
  shouldShowLegacyPendingSkeleton,
  type BrandKitBlockMotionProps,
} from "../brand-kit-block-motion";
import { normalizeFontDisplayName } from "@/lib/brandkit/normalize-font-display-name";
import { BrandKitEvidenceTrigger } from "../BrandKitEvidenceTrigger";
import { useBrandKitMosaicBoard } from "../brand-kit-mosaic-context";
import { useBrandKitMosaicCellOptional } from "../brand-kit-mosaic-context";
import { useMosaicSpecimenCascade } from "../use-mosaic-specimen-cascade";

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
  if (role === "body") return brandKitLocaleEs.typeSecondary;
  return brandKitLocaleEs.typePrimary;
}

const WEIGHT_SAMPLE = "AaBbCc 0123";

function TypographyWeightLadder({
  family,
  sample = WEIGHT_SAMPLE,
}: {
  family: TypographyFamily;
  sample?: string;
}) {
  const stack = fontStack(family);
  const weights = [...family.weights].sort((a, b) => a - b);

  return (
    <div className="brandKit-type-weight-ladder brandKit-type-weight-ladder--body">
      {weights.map((weight) => (
        <div key={weight} className="brandKit-type-weight-step">
          <span className="brandKit-v2-chapter-micro">{weight}</span>
          <p className="brandKit-type-weight-step__sample" style={{ fontFamily: stack, fontWeight: weight }}>
            {sample}
          </p>
        </div>
      ))}
    </div>
  );
}

function TypographyComparisonColumn({
  family,
  label,
  slot,
  slotId,
  onAction,
  onCorrect,
  mosaicCompact = false,
}: {
  family: TypographyFamily;
  label: string;
  specimenText?: string;
  slot?: SlotState<unknown>;
  slotId?: SlotId;
  onAction?: (slotId: SlotId, action: SlotAction) => void;
  onCorrect?: () => void;
  mosaicCompact?: boolean;
}) {
  const stack = fontStack(family);
  const estimated = isEstimatedCustomFamily(family);
  const weights = [...family.weights].sort((a, b) => a - b);

  return (
    <div className="brandKit-type-column brandKit-type-column--comparison">
      <div className="brandKit-type-column__head">
        <span className="brandKit-type-column__label">{label}</span>
        {slot && slotId ? (
          <BrandKitEvidenceTrigger
            id={`typography-${slotId}-${family.family}`}
            slot={slot}
            slotId={slotId}
            onAction={onAction}
            onCorrect={onCorrect}
            provenance={slot.provenance}
            confidence={slot.confidence}
          >
            <span className="brandKit-type-column__family">{typographyDisplayName(family)}</span>
          </BrandKitEvidenceTrigger>
        ) : (
          <span className="brandKit-type-column__family">{typographyDisplayName(family)}</span>
        )}
        <span className="brandKit-type-column__meta">
          {weights.join(" · ")} · {family.source}
        </span>
        {estimated ? (
          <span className="brandKit-v2-chapter-micro brandKit-type-estimated-note">Estimada a partir del material</span>
        ) : null}
      </div>
      <div className="brandKit-type-alphabet brandKit-type-alphabet--body" style={{ fontFamily: stack }} aria-hidden>
        <span>{ALPHABET_LINE}</span>
        <span>{NUMERIC_LINE}</span>
      </div>
      {!mosaicCompact ? <TypographyWeightLadder family={family} /> : null}
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
    <div className="brandKit-type-column">
      <div className="brandKit-type-column__head">
        <span className="brandKit-type-column__label">{label}</span>
        {slot && slotId ? (
          <BrandKitEvidenceTrigger
            id={`typography-${slotId}-${family.family}`}
            slot={slot}
            slotId={slotId}
            onAction={onAction}
            onCorrect={onCorrect}
            provenance={slot.provenance}
            confidence={slot.confidence}
          >
            <span className="brandKit-type-column__family">{typographyDisplayName(family)}</span>
          </BrandKitEvidenceTrigger>
        ) : (
          <span className="brandKit-type-column__family">{typographyDisplayName(family)}</span>
        )}
        <span className="brandKit-type-column__meta">
          {weights.join(" · ")} · {family.source}
        </span>
        {estimated ? (
          <span className="brandKit-v2-chapter-micro brandKit-type-estimated-note">Estimada a partir del material</span>
        ) : null}
      </div>
      <div className="brandKit-type-column__specimens">
        <p className="brandKit-type-specimen brandKit-type-specimen--headline" style={{ fontFamily: stack }}>
          {specimenText}
        </p>
        <div className="brandKit-type-alphabet" style={{ fontFamily: stack }} aria-hidden>
          <span>{ALPHABET_LINE}</span>
          <span>{NUMERIC_LINE}</span>
        </div>
        <div className="brandKit-type-weight-ladder">
          {weights.map((weight) => (
            <div key={weight} className="brandKit-type-weight-step">
              <span className="brandKit-v2-chapter-micro">{weight}</span>
              <p className="brandKit-type-weight-step__sample" style={{ fontFamily: stack, fontWeight: weight }}>
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
  mosaicHeadline,
  mosaicBrandName,
  slot,
  slotId,
  onAction,
  onCorrect,
}: {
  families: TypographyFamily[];
  mosaicHeadline?: string;
  mosaicBrandName?: string;
  slot?: SlotState<unknown>;
  slotId?: SlotId;
  onAction?: (slotId: SlotId, action: SlotAction) => void;
  onCorrect?: () => void;
}) {
  const mosaicCell = useBrandKitMosaicCellOptional();
  const mosaicBoard = useBrandKitMosaicBoard();
  const stripRef = useRef<HTMLDivElement>(null);
  const { primary, secondary } = pickPrimarySecondary(families);
  if (!primary) return null;

  const primaryStack = fontStack(primary);
  const estimated = isEstimatedCustomFamily(primary);
  const weights = [...primary.weights].sort((a, b) => a - b);
  const { specimen, measureNode } = useMosaicSpecimenCascade({
    headline: mosaicHeadline,
    brandName: mosaicBrandName,
    fontFamily: primaryStack,
    containerRef: stripRef,
  });

  const weightDetail = useMemo(() => {
    const blocks: React.ReactNode[] = [
      <section key={primary.family}>
        <h4 className="brandKit-v2-chapter-micro">{typographyDisplayName(primary)}</h4>
        <TypographyWeightLadder family={primary} />
      </section>,
    ];
    if (secondary && secondary.family !== primary.family) {
      blocks.push(
        <section key={secondary.family}>
          <h4 className="brandKit-v2-chapter-micro">{typographyDisplayName(secondary)}</h4>
          <TypographyWeightLadder family={secondary} />
        </section>,
      );
    }
    return <div className="brandKit-mosaic-detail-panels">{blocks}</div>;
  }, [primary, secondary]);

  const detailAction = useMemo(
    () => (
      <BrandKitFoldderButton
        variant="white"
        compact
        onClick={() => mosaicBoard?.openDetailSheet({ title: "Pesos tipográficos", content: weightDetail })}
      >
        Detalle
      </BrandKitFoldderButton>
    ),
    [mosaicBoard, weightDetail],
  );

  useEffect(() => {
    if (!mosaicCell) return;
    mosaicCell.setActionSlot("typography-weights", detailAction);
    return () => mosaicCell.setActionSlot("typography-weights", null);
  }, [detailAction, mosaicCell]);

  return (
    <div ref={stripRef} className="brandKit-type-strip brandKit-type-strip--mosaic">
      {measureNode}
      <div className="brandKit-type-mosaic-primary">
        <div className="brandKit-type-column__head">
          <span className="brandKit-type-column__label">{roleLabel(primary.role)}</span>
          {slot && slotId ? (
            <BrandKitEvidenceTrigger
              id={`typography-${slotId}-${primary.family}`}
              slot={slot}
              slotId={slotId}
              onAction={onAction}
              onCorrect={onCorrect}
              provenance={slot.provenance}
              confidence={slot.confidence}
            >
              <span className="brandKit-type-column__family">{typographyDisplayName(primary)}</span>
            </BrandKitEvidenceTrigger>
          ) : (
            <span className="brandKit-type-column__family">{typographyDisplayName(primary)}</span>
          )}
          <span className="brandKit-type-column__meta">
            {weights.join(" · ")} · {primary.source}
          </span>
          {estimated ? (
            <span className="brandKit-v2-chapter-micro brandKit-type-estimated-note">Estimada a partir del material</span>
          ) : null}
        </div>
        <p
          className="brandKit-type-specimen--mosaic-display"
          style={{ fontFamily: primaryStack }}
        >
          {specimen}
        </p>
        <div className="brandKit-type-alphabet brandKit-type-alphabet--body" style={{ fontFamily: primaryStack }} aria-hidden>
          <span>{ALPHABET_LINE}</span>
          <span>{NUMERIC_LINE}</span>
        </div>
      </div>
      {secondary && secondary.family !== primary.family ? (
        <TypographyComparisonColumn
          family={secondary}
          label={brandKitLocaleEs.typeSecondary}
          slot={slot}
          slotId={slotId}
          onAction={onAction}
          onCorrect={onCorrect}
          mosaicCompact
        />
      ) : null}
    </div>
  );
}

function TypographyStrip({
  families,
  specimenText,
  mosaicHeadline,
  mosaicBrandName,
  slot,
  slotId,
  onAction,
  onCorrect,
}: {
  families: TypographyFamily[];
  specimenText: string;
  mosaicHeadline?: string;
  mosaicBrandName?: string;
  slot?: SlotState<unknown>;
  slotId?: SlotId;
  onAction?: (slotId: SlotId, action: SlotAction) => void;
  onCorrect?: () => void;
}) {
  const mosaicCell = useBrandKitMosaicCellOptional();
  const isMosaic = Boolean(mosaicCell);
  const { primary, secondary } = pickPrimarySecondary(families);

  if (isMosaic) {
    return (
      <TypographyMosaicLayout
        families={families}
        mosaicHeadline={mosaicHeadline}
        mosaicBrandName={mosaicBrandName}
        slot={slot}
        slotId={slotId}
        onAction={onAction}
        onCorrect={onCorrect}
      />
    );
  }

  return (
    <div className="brandKit-type-strip">
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
          label={brandKitLocaleEs.typeSecondary}
          specimenText={specimenText}
          slot={slot}
          slotId={slotId}
          onAction={onAction}
          onCorrect={onCorrect}
        />
      ) : (
        <div className="brandKit-type-column brandKit-type-column--empty">
          <span className="brandKit-v2-muted">Sin tipografía secundaria detectada</span>
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
  specimenText = brandKitLocaleEs.typeSpecimenPhrase,
  mosaicHeadline,
  mosaicBrandName,
}: {
  slot: SlotState<unknown>;
  slotId: SlotId;
  onAction: (slotId: SlotId, action: SlotAction) => void;
  activeSlotId?: SlotId;
  specimenText?: string;
  mosaicHeadline?: string;
  mosaicBrandName?: string;
} & BrandKitBlockMotionProps) {
  const typography = slot.value as TypographyValue | undefined;
  const [editing, setEditing] = useState(false);
  let body: React.ReactNode;
  let primaryAction: React.ReactNode;

  const { primary, secondary } = pickPrimarySecondary(typography?.families ?? []);
  const canEdit = Boolean(typography?.families?.length && slot.status === "resolved" && !slot.locked);
  const editButton = canEdit ? (
    <BrandKitFoldderButton variant="white" compact icon={Pencil} onClick={() => setEditing(true)}>
      {brandKitLocaleEs.edit}
    </BrandKitFoldderButton>
  ) : null;

  if (shouldShowAnalyzingSkeleton(motion)) {
    body = <BrandKitBlockSkeleton variant="typography" />;
  } else if (shouldShowLegacyPendingSkeleton(motion, slot.status)) {
    body = <div className="brandKit-v2-skeleton brandKit-v2-skeleton--wide" aria-hidden />;
  } else if (editing && typography) {
    body = (
      <BrandKitTextEditPanel
        fields={[
          { id: "primary", label: brandKitLocaleEs.typePrimary, value: primary?.family ?? "" },
          { id: "secondary", label: brandKitLocaleEs.typeSecondary, value: secondary?.family ?? "" },
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
      <div className="brandKit-type-strip brandKit-type-strip--candidates">
        {slot.candidates.map((candidate, index) => {
          const value = candidate.value as TypographyValue;
          return (
            <button
              key={index}
              type="button"
              className="brandKit-type-candidate"
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
        <BrandKitFoldderButton
          variant="white"
          compact
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
          {brandKitLocaleEs.chooseFonts}
        </BrandKitFoldderButton>
      );
    }
    body = <p className="brandKit-v2-muted">{brandKitLocaleEs.noTypography}</p>;
  } else {
    body = (
      <TypographyStrip
        families={typography.families}
        specimenText={specimenText}
        mosaicHeadline={mosaicHeadline}
        mosaicBrandName={mosaicBrandName}
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
