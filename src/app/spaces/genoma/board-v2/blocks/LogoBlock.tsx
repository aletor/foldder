"use client";

import React, { useMemo, useRef, useState } from "react";
import type { Candidate, LogoValue, SlotAction, SlotId, SlotState } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import {
  genomaV2LogoPlinthClassForMode,
  type GenomaLogoPlinthMode,
} from "@/lib/genoma/genoma-logo-plinth";
import { logoCandidateMeta } from "@/lib/genoma/genoma-logo-candidate-meta";
import { DnaBlock } from "../DnaBlock";
import { GenomaClickableImage } from "../GenomaClickableImage";
import { GenomaLogoRankMeta } from "../GenomaVisualRankMeta";
import { GenomaSupplementalPanel } from "../GenomaSupplementalPanel";
import { GenomaFoldderButton } from "../GenomaFoldderButton";
import { GenomaIconButton } from "../GenomaIconButton";
import { GenomaLogoBboxEditor } from "../GenomaLogoBboxEditor";
import { GenomaLogoPlinthToggle } from "../GenomaLogoPlinthToggle";
import { GenomaLogoDetectionEmpty } from "../GenomaLogoDetectionEmpty";
import { Check, Crop, Upload } from "lucide-react";
import { GenomaBlockSkeleton } from "../GenomaBlockSkeleton";
import {
  shouldShowAnalyzingSkeleton,
  shouldShowLegacyPendingSkeleton,
  type GenomaBlockMotionProps,
} from "../genoma-block-motion";

function canAdjustLogo(logo?: LogoValue): boolean {
  return Boolean(logo?.sourcePdfSha256 && logo.sourcePageNumber);
}

function logoPageHint(logo?: LogoValue): string | null {
  if (!logo?.sourcePageNumber) return null;
  const doc = logo.sourceDocName ? `${logo.sourceDocName} · ` : "";
  return `${doc}${genomaLocaleEs.logoPageSignal(logo.sourcePageNumber, logo.totalDocPages ?? 0)}`;
}

function LogoUploadControl({
  onUploadLogo,
  disabled,
}: {
  onUploadLogo?: (file: File) => void | Promise<void>;
  disabled?: boolean;
}) {
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
  motion,
}: {
  slot: SlotState<unknown>;
  slotId: SlotId;
  onAction: (slotId: SlotId, action: SlotAction) => void;
  onUploadLogo?: (file: File) => void | Promise<void>;
  activeSlotId?: SlotId;
} & GenomaBlockMotionProps) {
  const logo = slot.value as LogoValue | undefined;
  const [plinthMode, setPlinthMode] = useState<GenomaLogoPlinthMode>("auto");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustCandidateIndex, setAdjustCandidateIndex] = useState<number | null>(null);

  const plinthClass = useMemo(
    () => genomaV2LogoPlinthClassForMode(logo, plinthMode),
    [logo, plinthMode],
  );
  const pageHint = logoPageHint(logo);
  const editingLogo =
    adjustCandidateIndex != null
      ? (slot.candidates[adjustCandidateIndex]?.value as LogoValue | undefined)
      : logo;

  const adjustControl =
    canAdjustLogo(logo) && !slot.locked ? (
      <GenomaIconButton
        icon={Crop}
        label={genomaLocaleEs.adjustLogoArea}
        onClick={() => {
          setAdjustCandidateIndex(null);
          setAdjustOpen(true);
        }}
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
      <GenomaLogoPlinthToggle mode={plinthMode} onChange={setPlinthMode} />
      {pageHint ? <p className="genoma-v2-logo-page-hint">{pageHint}</p> : null}
      <GenomaClickableImage src={logo.previewUrl} fit="logo" eager />
      <GenomaSupplementalPanel slot={slot} />
    </div>
  ) : null;

  let body: React.ReactNode;
  const pickerCandidates = slot.candidates.slice(0, 4) as Candidate<LogoValue>[];
  const showDetectionEmpty =
    (slot.status === "needs_user" && !pickerCandidates.length) ||
    (slot.status === "candidates" && !pickerCandidates.length);

  if (shouldShowAnalyzingSkeleton(motion)) {
    body = <GenomaBlockSkeleton variant="logo" />;
  } else if (shouldShowLegacyPendingSkeleton(motion, slot.status)) {
    body = <div className="genoma-v2-skeleton genoma-v2-skeleton--hero" aria-hidden />;
  } else if (showDetectionEmpty) {
    body = (
      <GenomaLogoDetectionEmpty
        onUploadLogo={onUploadLogo}
        onAdjustHint={
          canAdjustLogo(logo)
            ? () => {
                setAdjustCandidateIndex(null);
                setAdjustOpen(true);
              }
            : undefined
        }
      />
    );
  } else if (slot.status === "candidates" || (slot.status === "needs_user" && slot.candidates.length)) {
    body = (
      <>
        {slot.needsReviewReason ? <p className="genoma-v2-review-hint">{slot.needsReviewReason}</p> : null}
        <GenomaLogoPlinthToggle mode={plinthMode} onChange={setPlinthMode} />
        <div className="genoma-v2-logo-candidates">
          {pickerCandidates.map((candidate, index) => {
            const value = candidate.value as LogoValue;
            const meta = logoCandidateMeta(candidate);
            const candidatePlinth = genomaV2LogoPlinthClassForMode(value, plinthMode);
            const adjustable = canAdjustLogo(value) && !slot.locked;
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
                <div className="genoma-v2-logo-candidate__meta">
                  <span className="genoma-v2-logo-candidate__method">{meta.methodLabel}</span>
                  <span className="genoma-v2-logo-candidate__score">
                    {genomaLocaleEs.logoCandidateScore(meta.scorePercent)}
                  </span>
                  {meta.pageLabel ? (
                    <span className="genoma-v2-logo-candidate__page">{meta.pageLabel}</span>
                  ) : null}
                  <p className="genoma-v2-logo-candidate__explain">{meta.explanation}</p>
                </div>
                {adjustable ? (
                  <GenomaFoldderButton
                    variant="muted"
                    icon={Crop}
                    className="genoma-v2-logo-candidate__adjust"
                    onClick={() => {
                      setAdjustCandidateIndex(index);
                      setAdjustOpen(true);
                    }}
                  >
                    {genomaLocaleEs.logoCandidateAdjustBeforeChoose}
                  </GenomaFoldderButton>
                ) : null}
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
    body = <GenomaLogoDetectionEmpty onUploadLogo={onUploadLogo} />;
  } else if (slot.status === "resolved" && slot.needsReviewReason && logo?.previewUrl) {
    body = (
      <>
        <p className="genoma-v2-review-hint">{slot.needsReviewReason}</p>
        {resolvedPlinth}
      </>
    );
  } else if (!logo?.previewUrl) {
    body = <GenomaLogoDetectionEmpty onUploadLogo={onUploadLogo} />;
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
      {adjustOpen && editingLogo ? (
        <div className="genoma-v2-logo-adjust-overlay">
          <GenomaLogoBboxEditor
            logo={editingLogo}
            onClose={() => {
              setAdjustOpen(false);
              setAdjustCandidateIndex(null);
            }}
            onSaved={(nextLogo) => {
              if (adjustCandidateIndex != null) {
                onAction(slotId, { action: "choose_candidate", candidateIndex: adjustCandidateIndex, lock: true });
                onAction(slotId, { action: "set", value: nextLogo });
              } else {
                onAction(slotId, { action: "set", value: nextLogo });
              }
              setAdjustOpen(false);
              setAdjustCandidateIndex(null);
            }}
          />
        </div>
      ) : null}
    </DnaBlock>
  );
}
