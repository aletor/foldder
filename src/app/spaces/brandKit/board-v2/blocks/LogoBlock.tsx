"use client";

import React, { useMemo, useRef, useState } from "react";
import type { Candidate, LogoValue, SlotAction, SlotId, SlotState } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import {
  brandKitV2LogoPlinthClassForMode,
  type BrandKitLogoPlinthMode,
} from "@/lib/brandkit/brand-kit-logo-plinth";
import { logoCandidateMeta } from "@/lib/brandkit/brand-kit-logo-candidate-meta";
import { DnaBlock } from "../DnaBlock";
import { BrandKitClickableImage } from "../BrandKitClickableImage";
import { BrandKitLogoRankMeta } from "../BrandKitVisualRankMeta";
import { BrandKitSupplementalPanel } from "../BrandKitSupplementalPanel";
import { BrandKitFoldderButton } from "../BrandKitFoldderButton";
import { BrandKitLogoAdjustPortal } from "../BrandKitLogoAdjustPortal";
import { BrandKitLogoBboxEditor } from "../BrandKitLogoBboxEditor";
import { BrandKitLogoPlinthToggle } from "../BrandKitLogoPlinthToggle";
import { BrandKitLogoDetectionEmpty } from "../BrandKitLogoDetectionEmpty";
import { Check, Crop, Upload } from "lucide-react";
import { BrandKitBlockSkeleton } from "../BrandKitBlockSkeleton";
import {
  shouldShowAnalyzingSkeleton,
  shouldShowLegacyPendingSkeleton,
  type BrandKitBlockMotionProps,
} from "../brand-kit-block-motion";
import type { BrandThemePolarity } from "@/lib/brandkit/brand-theme-color";
import { BrandKitLogoClearanceZone } from "../BrandKitLogoClearanceZone";
import { BrandKitEvidenceTrigger } from "../BrandKitEvidenceTrigger";
import { useBrandKitMosaicCellOptional } from "../brand-kit-mosaic-context";

function canAdjustLogo(logo?: LogoValue): boolean {
  return Boolean(logo?.sourcePdfSha256 && logo.sourcePageNumber);
}

function logoPageHint(logo?: LogoValue): string | null {
  if (!logo?.sourcePageNumber) return null;
  const doc = logo.sourceDocName ? `${logo.sourceDocName} · ` : "";
  return `${doc}${brandKitLocaleEs.logoPageSignal(logo.sourcePageNumber, logo.totalDocPages ?? 0)}`;
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
      <BrandKitFoldderButton
        variant="white"
        compact
        icon={Upload}
        disabled={disabled}
        onClick={() => fileRef.current?.click()}
      >
        {brandKitLocaleEs.uploadLogoShort}
      </BrandKitFoldderButton>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="brandKit-v2-sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onUploadLogo(file);
          event.target.value = "";
        }}
      />
    </>
  );
}

function resolvePlinthClass(
  logo: LogoValue | undefined,
  plinthMode: BrandKitLogoPlinthMode,
  brandReady: boolean,
  brandPolarity: BrandThemePolarity,
): string {
  const base = brandKitV2LogoPlinthClassForMode(logo, plinthMode);
  if (plinthMode === "auto" && brandReady && brandPolarity === "dark") {
    return `${base} brandKit-v2-logo-plinth--brand-auto`;
  }
  return base;
}

export function LogoBlock({
  slot,
  slotId,
  onAction,
  onUploadLogo,
  activeSlotId,
  motion,
  brandPolarity = "light",
  brandReady = false,
}: {
  slot: SlotState<unknown>;
  slotId: SlotId;
  onAction: (slotId: SlotId, action: SlotAction) => void;
  onUploadLogo?: (file: File) => void | Promise<void>;
  activeSlotId?: SlotId;
  brandPolarity?: BrandThemePolarity;
  brandReady?: boolean;
} & BrandKitBlockMotionProps) {
  const logo = slot.value as LogoValue | undefined;
  const [plinthMode, setPlinthMode] = useState<BrandKitLogoPlinthMode>("auto");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustCandidateIndex, setAdjustCandidateIndex] = useState<number | null>(null);

  const mosaicCell = useBrandKitMosaicCellOptional();
  const isMosaic = Boolean(mosaicCell);
  const plinthClass = useMemo(
    () => resolvePlinthClass(logo, plinthMode, brandReady, brandPolarity),
    [logo, plinthMode, brandPolarity, brandReady],
  );
  const pageHint = logoPageHint(logo);
  const editingLogo =
    adjustCandidateIndex != null
      ? (slot.candidates[adjustCandidateIndex]?.value as LogoValue | undefined)
      : logo;

  const adjustControl =
    canAdjustLogo(logo) && !slot.locked ? (
      <BrandKitFoldderButton
        variant="white"
        compact
        icon={Crop}
        onClick={() => {
          setAdjustCandidateIndex(null);
          setAdjustOpen(true);
        }}
      >
        {brandKitLocaleEs.adjustLogoArea}
      </BrandKitFoldderButton>
    ) : null;
  const uploadControl = <LogoUploadControl onUploadLogo={onUploadLogo} disabled={slot.locked} />;
  const plinthToggle = logo?.previewUrl ? (
    <BrandKitLogoPlinthToggle mode={plinthMode} onChange={setPlinthMode} />
  ) : null;
  const secondaryActions = (
    <>
      {isMosaic ? plinthToggle : null}
      {adjustControl}
      {uploadControl}
    </>
  );

  const resolvedPlinth = logo?.previewUrl ? (
    <BrandKitEvidenceTrigger
      id={`logo-${slotId}`}
      slot={slot}
      slotId={slotId}
      onAction={onAction}
      className="brandKit-evidence-wrap--block"
      rankSignals={slot.candidates[0]?.rankSignals}
    >
      <div className={`brandKit-v2-logo-plinth ${plinthClass}`}>
        {!isMosaic ? <BrandKitLogoPlinthToggle mode={plinthMode} onChange={setPlinthMode} /> : null}
        {pageHint ? <p className="brandKit-v2-logo-page-hint">{pageHint}</p> : null}
        <BrandKitClickableImage src={logo.previewUrl} fit="logo" eager />
        <BrandKitSupplementalPanel slot={slot} />
      </div>
    </BrandKitEvidenceTrigger>
  ) : null;

  let body: React.ReactNode;
  const pickerCandidates = slot.candidates.slice(0, 4) as Candidate<LogoValue>[];
  const showDetectionEmpty =
    (slot.status === "needs_user" && !pickerCandidates.length) ||
    (slot.status === "candidates" && !pickerCandidates.length);

  if (shouldShowAnalyzingSkeleton(motion)) {
    body = <BrandKitBlockSkeleton variant="logo" />;
  } else if (shouldShowLegacyPendingSkeleton(motion, slot.status)) {
    body = <div className="brandKit-v2-skeleton brandKit-v2-skeleton--hero" aria-hidden />;
  } else if (showDetectionEmpty) {
    body = (
      <BrandKitLogoDetectionEmpty
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
        {slot.needsReviewReason ? <p className="brandKit-v2-review-hint">{slot.needsReviewReason}</p> : null}
        <BrandKitLogoPlinthToggle mode={plinthMode} onChange={setPlinthMode} />
        <div className="brandKit-v2-logo-candidates">
          {pickerCandidates.map((candidate, index) => {
            const value = candidate.value as LogoValue;
            const meta = logoCandidateMeta(candidate);
            const candidatePlinth = resolvePlinthClass(value, plinthMode, brandReady, brandPolarity);
            const adjustable = canAdjustLogo(value) && !slot.locked;
            return (
              <div key={`${value.assetId}-${index}`} className="brandKit-v2-logo-candidate">
                <BrandKitLogoRankMeta candidate={candidate} rank={index + 1} />
                <div className={`brandKit-v2-logo-candidate__preview ${candidatePlinth}`}>
                  {value.previewUrl ? (
                    <BrandKitClickableImage src={value.previewUrl} fit="logo" eager />
                  ) : (
                    <span className="brandKit-v2-muted">{value.assetId}</span>
                  )}
                </div>
                <div className="brandKit-v2-logo-candidate__meta">
                  <span className="brandKit-v2-logo-candidate__method">{meta.methodLabel}</span>
                  <span className="brandKit-v2-logo-candidate__score">
                    {brandKitLocaleEs.logoCandidateScore(meta.scorePercent)}
                  </span>
                  {meta.pageLabel ? (
                    <span className="brandKit-v2-logo-candidate__page">{meta.pageLabel}</span>
                  ) : null}
                  <p className="brandKit-v2-logo-candidate__explain">{meta.explanation}</p>
                </div>
                {adjustable ? (
                  <BrandKitFoldderButton
                    variant="muted"
                    icon={Crop}
                    className="brandKit-v2-logo-candidate__adjust"
                    onClick={() => {
                      setAdjustCandidateIndex(index);
                      setAdjustOpen(true);
                    }}
                  >
                    {brandKitLocaleEs.logoCandidateAdjustBeforeChoose}
                  </BrandKitFoldderButton>
                ) : null}
                <BrandKitFoldderButton
                  icon={Check}
                  className="brandKit-v2-logo-candidate__choose"
                  onClick={() => onAction(slotId, { action: "choose_candidate", candidateIndex: index, lock: true })}
                >
                  {brandKitLocaleEs.chooseLogo}
                </BrandKitFoldderButton>
              </div>
            );
          })}
        </div>
      </>
    );
  } else if (slot.status === "needs_user") {
    body = <BrandKitLogoDetectionEmpty onUploadLogo={onUploadLogo} />;
  } else if (slot.status === "resolved" && slot.needsReviewReason && logo?.previewUrl) {
    body = (
      <>
        <p className="brandKit-v2-review-hint">{slot.needsReviewReason}</p>
        {resolvedPlinth}
      </>
    );
  } else if (!logo?.previewUrl) {
    body = <BrandKitLogoDetectionEmpty onUploadLogo={onUploadLogo} />;
  } else {
    body = resolvedPlinth;
  }

  const showClearance =
    Boolean(logo?.previewUrl) && (slot.status === "resolved" || slot.locked);

  return (
    <DnaBlock
      slotId={slotId}
      slot={slot}
      onAction={onAction}
      className="brandKit-v2-block--hero"
      secondaryActions={secondaryActions}
      activeSlotId={activeSlotId}
    >
      {body}
      {showClearance && logo?.previewUrl ? <BrandKitLogoClearanceZone previewUrl={logo.previewUrl} /> : null}
      {adjustOpen && editingLogo ? (
        <BrandKitLogoAdjustPortal>
          <BrandKitLogoBboxEditor
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
        </BrandKitLogoAdjustPortal>
      ) : null}
    </DnaBlock>
  );
}
