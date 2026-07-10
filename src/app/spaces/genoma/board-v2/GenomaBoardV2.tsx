"use client";

import React, { useCallback, useMemo } from "react";
import type { EssenceValue, GenomaDocument, SlotAction, SlotId } from "@/lib/genoma/genoma-types";
import { GENOMA_SLOT_IDS } from "@/lib/genoma/genoma-types";
import type { GenomaGalleryGenerateProgress } from "../genoma-api";
import { getSlotAttention, summarizeGenomaBoard } from "@/lib/genoma/genoma-board-status";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { GenomaBoardHeader } from "./GenomaBoardHeader";
import { GenomaBoardStatusBar } from "./GenomaBoardStatusBar";
import { GenomaImageLightboxProvider } from "./GenomaImageLightbox";
import { GenomaEvidencePopoverProvider } from "./GenomaEvidencePopoverContext";
import { GenomaReviewPrompt } from "./GenomaReviewPrompt";
import { GenomaReviewQueueBar } from "./GenomaReviewQueueBar";
import { useGenomaReviewMode, type GenomaReviewModeStats } from "./use-genoma-review-mode";
import { GenomaCoverTile } from "./GenomaCoverTile";
import { GenomaShowcaseBlock } from "./GenomaShowcaseBlock";
import { shouldRenderGenomaShowcase } from "./showcase/genoma-showcase-data";
import { LogoBlock } from "./blocks/LogoBlock";
import { PaletteBlock } from "./blocks/PaletteBlock";
import { TypographyBlock } from "./blocks/TypographyBlock";
import { EssenceBlock } from "./blocks/EssenceBlock";
import { VoiceBlock } from "./blocks/VoiceBlock";
import { VisualWorldBlock } from "./blocks/VisualWorldBlock";
import { GalleryBlock } from "./blocks/GalleryBlock";
import { useGenomaBoardSlotMotion, type SlotMotionState } from "./use-genoma-board-slot-motion";
import { useGenomaTheme } from "./use-genoma-theme";
import { GenomaBoardGoogleFontsLoader } from "./GenomaBoardGoogleFontsLoader";
import type { TypographyValue } from "@/lib/genoma/genoma-types";
import "./genoma-board-brand-theme.css";
import "./genoma-board-stylebook.css";
import "./genoma-showcase.css";
import "./genoma-confidence.css";

function resolveTypographySpecimen(doc: GenomaDocument, presentationMode: boolean): string {
  const essenceSlot = doc.slots.essence;
  const canUseEssence = !presentationMode || essenceSlot.locked;
  if (canUseEssence) {
    const essence = essenceSlot.value as EssenceValue | undefined;
    const headline = essence?.headline?.trim();
    if (headline) return headline;
  }
  return doc.brandName?.value?.trim() || genomaLocaleEs.typeSpecimenPhrase;
}

type GenomaBoardV2Props = {
  doc: GenomaDocument;
  onAction: (slotId: SlotId, action: SlotAction) => void;
  onLogoUpload?: (file: File) => void | Promise<void>;
  isAnalyzing?: boolean;
  isGeneratingGallery?: boolean;
  galleryProgress?: GenomaGalleryGenerateProgress | null;
  onGenerateGallery?: () => void;
  onRecalibrateGallery?: () => void;
  focusGeneratedTab?: number;
  gallerySuccessMessage?: string | null;
  onBrandNameChange?: (name: string) => void;
  onExportTokens?: () => void;
  onExportCompiled?: () => void;
  canExport?: boolean;
  hideExportActions?: boolean;
  activeSlotId?: SlotId;
  presentationMode?: boolean;
  onPresentationModeChange?: (enabled: boolean) => void;
  reviewMode?: boolean;
  onReviewModeChange?: (enabled: boolean) => void;
  onReviewComplete?: (stats: GenomaReviewModeStats) => void;
};

function tileMotionClass(motion: SlotMotionState): string {
  if (motion.phase === "enter") return " genoma-v2-tile--materialize";
  if (motion.phase === "glow") return " genoma-v2-tile--glow";
  return "";
}

function GenomaBoardTile({
  slotId,
  tileSuffix,
  attentionClass,
  motion,
  onTileEnterEnd,
  children,
}: {
  slotId: SlotId;
  tileSuffix: string;
  attentionClass: string;
  motion: SlotMotionState;
  onTileEnterEnd: (slotId: SlotId) => void;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`genoma-v2-tile genoma-v2-tile--${tileSuffix}${attentionClass}${tileMotionClass(motion)}`}
      data-genoma-slot={slotId}
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.animationName === "genoma-tile-materialize") {
          onTileEnterEnd(slotId);
        }
      }}
    >
      {children}
    </section>
  );
}

export function GenomaBoardV2({
  doc,
  onAction,
  onLogoUpload,
  isAnalyzing = false,
  isGeneratingGallery = false,
  galleryProgress = null,
  onGenerateGallery,
  onRecalibrateGallery,
  focusGeneratedTab,
  gallerySuccessMessage,
  onBrandNameChange,
  onExportTokens,
  onExportCompiled,
  canExport = false,
  hideExportActions = false,
  activeSlotId,
  presentationMode = false,
  onPresentationModeChange,
  reviewMode = false,
  onReviewModeChange,
  onReviewComplete,
}: GenomaBoardV2Props) {
  const slots = doc.slots;
  const { motionBySlot, onTileEnterEnd } = useGenomaBoardSlotMotion(slots, isAnalyzing);
  const brandTheme = useGenomaTheme(doc);
  const boardSummary = useMemo(() => summarizeGenomaBoard(doc), [doc]);

  const handleReviewComplete = useCallback(
    (stats: GenomaReviewModeStats) => {
      onReviewModeChange?.(false);
      onReviewComplete?.(stats);
    },
    [onReviewComplete, onReviewModeChange],
  );

  const { queue, current, index, skip, exit } = useGenomaReviewMode(
    doc,
    reviewMode,
    handleReviewComplete,
  );
  const typography = slots.typography?.value as TypographyValue | undefined;
  const specimenText = useMemo(
    () => resolveTypographySpecimen(doc, presentationMode),
    [doc, presentationMode],
  );
  const showShowcase = useMemo(
    () => shouldRenderGenomaShowcase(doc, presentationMode),
    [doc, presentationMode],
  );

  const borradorPulseSlotId = useMemo(() => {
    for (const slotId of GENOMA_SLOT_IDS) {
      const attention = getSlotAttention(slots[slotId], activeSlotId);
      if (attention.kind === "candidates" && attention.label === genomaLocaleEs.reviewChip) {
        return slotId;
      }
    }
    return null;
  }, [slots, activeSlotId]);

  const tileClass = (slotId: SlotId) => {
    const attention = getSlotAttention(slots[slotId], activeSlotId);
    const classes: string[] = [];
    if (attention.kind) classes.push(` genoma-v2-tile--${attention.kind}`);
    if (presentationMode && !slots[slotId]?.locked) classes.push(" genoma-v2-tile--presentation-muted");
    if (reviewMode && current) {
      if (slotId === current.slotId) classes.push(" genoma-v2-tile--review-active");
      else classes.push(" genoma-v2-tile--review-muted");
    }
    if (borradorPulseSlotId === slotId) classes.push(" genoma-v2-tile--borrador-pulse");
    return classes.join("");
  };

  const reviewPrompt = (slotId: SlotId) =>
    reviewMode && current?.slotId === slotId ? <GenomaReviewPrompt doc={doc} item={current} /> : null;

  const ancillaryReviewClass =
    reviewMode && current ? " genoma-v2-cover-wrap--review-muted" : "";

  const showcaseReviewClass =
    reviewMode && current ? " genoma-v2-showcase-wrap--review-muted" : "";

  return (
    <GenomaEvidencePopoverProvider>
      <GenomaImageLightboxProvider>
        <GenomaBoardGoogleFontsLoader typography={typography} />
        <div
          className={`genoma-v2-bento-board${presentationMode ? " is-presentation" : ""}${reviewMode ? " is-review" : ""}`}
        data-brand-ready={brandTheme.ready ? "true" : "false"}
        data-brand-animate={brandTheme.animate ? "true" : "false"}
        data-brand-polarity={brandTheme.polarity}
        style={brandTheme.ready ? (brandTheme.vars as React.CSSProperties) : undefined}
      >
        <GenomaBoardHeader
          doc={doc}
          onBrandNameChange={onBrandNameChange}
          presentationMode={presentationMode}
          onPresentationModeChange={onPresentationModeChange}
          needsYou={boardSummary.needsYou}
          onStartReview={() => onReviewModeChange?.(true)}
        />
        <GenomaBoardStatusBar doc={doc} />

        <div className="genoma-v2-bento-grid">
          <div className={`genoma-v2-cover-wrap${ancillaryReviewClass}`}>
            <GenomaCoverTile
              doc={doc}
              presentationMode={presentationMode}
              brandReady={brandTheme.ready}
              brandVars={brandTheme.vars}
            />
          </div>

          <GenomaBoardTile
            slotId="logo"
            tileSuffix="logo"
            attentionClass={tileClass("logo")}
            motion={motionBySlot.logo}
            onTileEnterEnd={onTileEnterEnd}
          >
            {reviewPrompt("logo")}
            <LogoBlock
              slotId="logo"
              slot={slots.logo}
              onAction={onAction}
              onUploadLogo={onLogoUpload}
              activeSlotId={activeSlotId}
              motion={motionBySlot.logo}
              brandPolarity={brandTheme.polarity}
              brandReady={brandTheme.ready}
            />
          </GenomaBoardTile>

          <GenomaBoardTile
            slotId="essence"
            tileSuffix="essence"
            attentionClass={tileClass("essence")}
            motion={motionBySlot.essence}
            onTileEnterEnd={onTileEnterEnd}
          >
            {reviewPrompt("essence")}
            <EssenceBlock
              slotId="essence"
              slot={slots.essence}
              onAction={onAction}
              activeSlotId={activeSlotId}
              motion={motionBySlot.essence}
            />
          </GenomaBoardTile>

          <GenomaBoardTile
            slotId="typography"
            tileSuffix="typography"
            attentionClass={tileClass("typography")}
            motion={motionBySlot.typography}
            onTileEnterEnd={onTileEnterEnd}
          >
            {reviewPrompt("typography")}
            <TypographyBlock
              slotId="typography"
              slot={slots.typography}
              onAction={onAction}
              activeSlotId={activeSlotId}
              motion={motionBySlot.typography}
              specimenText={specimenText}
            />
          </GenomaBoardTile>

          <GenomaBoardTile
            slotId="palette"
            tileSuffix="palette"
            attentionClass={tileClass("palette")}
            motion={motionBySlot.palette}
            onTileEnterEnd={onTileEnterEnd}
          >
            {reviewPrompt("palette")}
            <PaletteBlock
              slotId="palette"
              slot={slots.palette}
              onAction={onAction}
              activeSlotId={activeSlotId}
              motion={motionBySlot.palette}
            />
          </GenomaBoardTile>

          <GenomaBoardTile
            slotId="voice"
            tileSuffix="voice"
            attentionClass={tileClass("voice")}
            motion={motionBySlot.voice}
            onTileEnterEnd={onTileEnterEnd}
          >
            {reviewPrompt("voice")}
            <VoiceBlock
              slotId="voice"
              slot={slots.voice}
              onAction={onAction}
              activeSlotId={activeSlotId}
              motion={motionBySlot.voice}
            />
          </GenomaBoardTile>

          <GenomaBoardTile
            slotId="visualWorld"
            tileSuffix="visual"
            attentionClass={tileClass("visualWorld")}
            motion={motionBySlot.visualWorld}
            onTileEnterEnd={onTileEnterEnd}
          >
            {reviewPrompt("visualWorld")}
            <VisualWorldBlock
              slotId="visualWorld"
              slot={slots.visualWorld}
              onAction={onAction}
              gallery={slots.gallery}
              activeSlotId={activeSlotId}
              motion={motionBySlot.visualWorld}
            />
          </GenomaBoardTile>

          <GenomaBoardTile
            slotId="gallery"
            tileSuffix="gallery"
            attentionClass={tileClass("gallery")}
            motion={motionBySlot.gallery}
            onTileEnterEnd={onTileEnterEnd}
          >
            {reviewPrompt("gallery")}
            <GalleryBlock
              slotId="gallery"
              slot={slots.gallery}
              doc={doc}
              onAction={onAction}
              onGenerateGallery={onGenerateGallery}
              onRecalibrateGallery={onRecalibrateGallery}
              isGeneratingGallery={isGeneratingGallery}
              galleryProgress={galleryProgress}
              focusGeneratedTab={focusGeneratedTab}
              gallerySuccessMessage={gallerySuccessMessage}
              activeSlotId={activeSlotId}
              motion={motionBySlot.gallery}
              brandReady={brandTheme.ready}
            />
          </GenomaBoardTile>

          {showShowcase ? (
            <div className={`genoma-v2-showcase-wrap${showcaseReviewClass}`}>
              <GenomaShowcaseBlock
                doc={doc}
                presentationMode={presentationMode}
                brandPolarity={brandTheme.polarity}
                brandVars={brandTheme.vars}
              />
            </div>
          ) : null}
        </div>
        {reviewMode && queue.length > 0 ? (
          <GenomaReviewQueueBar index={index} total={queue.length} onSkip={skip} onExit={exit} />
        ) : null}
      </div>
      </GenomaImageLightboxProvider>
    </GenomaEvidencePopoverProvider>
  );
}
