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
import { GenomaBanda08 } from "./GenomaBanda08";
import { shouldRenderGenomaShowcase } from "./showcase/genoma-showcase-data";
import { LogoBlock } from "./blocks/LogoBlock";
import { PaletteBlock } from "./blocks/PaletteBlock";
import { TypographyBlock } from "./blocks/TypographyBlock";
import { EssenceBlock } from "./blocks/EssenceBlock";
import { VoiceBlock } from "./blocks/VoiceBlock";
import { VisualWorldBlock } from "./blocks/VisualWorldBlock";
import { GalleryBlock } from "./blocks/GalleryBlock";
import { useGenomaBoardSlotMotion } from "./use-genoma-board-slot-motion";
import { useGenomaTheme } from "./use-genoma-theme";
import { GenomaBoardGoogleFontsLoader } from "./GenomaBoardGoogleFontsLoader";
import { GenomaMosaicCell } from "./GenomaMosaicCell";
import { GenomaMosaicBoardProvider } from "./genoma-mosaic-context";
import { GenomaMosaicDetailSheet } from "./GenomaMosaicDetailSheet";
import type { TypographyValue } from "@/lib/genoma/genoma-types";
import "./genoma-board-brand-theme.css";
import "./genoma-board-stylebook.css";
import "./genoma-showcase.css";
import "./genoma-confidence.css";
import "./genoma-board-mosaic.css";

function mosaicHeadlineCandidate(doc: GenomaDocument, presentationMode: boolean): string | undefined {
  const essenceSlot = doc.slots.essence;
  const canUseEssence = !presentationMode || essenceSlot.locked;
  if (!canUseEssence) return undefined;
  const essence = essenceSlot.value as EssenceValue | undefined;
  return essence?.headline?.trim() || undefined;
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
  const mosaicHeadline = useMemo(
    () => mosaicHeadlineCandidate(doc, presentationMode),
    [doc, presentationMode],
  );
  const mosaicBrandName = doc.brandName?.value?.trim();
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

  const cellClass = (slotId: SlotId) => {
    const attention = getSlotAttention(slots[slotId], activeSlotId);
    const classes: string[] = [];
    if (attention.kind) classes.push(` genoma-mosaic-cell--${attention.kind}`);
    if (presentationMode && !slots[slotId]?.locked) classes.push(" genoma-mosaic-cell--presentation-muted");
    if (reviewMode && current) {
      if (slotId === current.slotId) classes.push(" genoma-mosaic-cell--review-active");
      else classes.push(" genoma-mosaic-cell--review-muted");
    }
    if (borradorPulseSlotId === slotId) classes.push(" genoma-mosaic-cell--borrador-pulse");
    return classes.join("");
  };

  const ancillaryReviewClass =
    reviewMode && current ? " genoma-mosaic-cell--review-muted" : "";

  const reviewPrompt = (slotId: SlotId) =>
    reviewMode && current?.slotId === slotId ? <GenomaReviewPrompt doc={doc} item={current} /> : null;

  return (
    <GenomaEvidencePopoverProvider>
      <GenomaImageLightboxProvider>
        <GenomaMosaicBoardProvider>
          <GenomaBoardGoogleFontsLoader typography={typography} />
          <div
            className={`genoma-v2-bento-board genoma-v2-mosaic-board${presentationMode ? " is-presentation" : ""}${reviewMode ? " is-review" : ""}`}
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

            {/*
             * MAPA FINAL — bandas horizontales (12 col, gap 8px, altura = contenido)
             * A  cover        12 × auto
             * B  logo          7 × auto  |  essence       5 × auto
             * C  palette      12 × auto
             * D  typography    7 × auto  |  voice          5 × auto
             * E  visual        5 × auto  |  gallery        7 × auto  (visual align-self:start)
             * 08 banda-08: hermana posterior al mosaico (fuera del grid)
             */}
            <div className="genoma-v2-mosaic-bands">
              <div className="genoma-v2-mosaic-band genoma-v2-mosaic-band--a">
                <GenomaMosaicCell
                  mosaicKey="cover"
                  surface="primary"
                  colSpan={12}
                  showChapter={false}
                  showGhost={false}
                  showStatus={false}
                  attentionClass={ancillaryReviewClass}
                >
                  <GenomaCoverTile
                    doc={doc}
                    presentationMode={presentationMode}
                    brandReady={brandTheme.ready}
                    brandVars={brandTheme.vars}
                    mosaic
                  />
                </GenomaMosaicCell>
              </div>

              <div className="genoma-v2-mosaic-band genoma-v2-mosaic-band--b">
                <GenomaMosaicCell
                  slotId="logo"
                  mosaicKey="logo"
                  surface="raised"
                  colSpan={7}
                  slot={slots.logo}
                  motion={motionBySlot.logo}
                  onTileEnterEnd={onTileEnterEnd}
                  attentionClass={cellClass("logo")}
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
                </GenomaMosaicCell>

                <GenomaMosaicCell
                  slotId="essence"
                  mosaicKey="essence"
                  surface="raised"
                  colSpan={5}
                  slot={slots.essence}
                  motion={motionBySlot.essence}
                  onTileEnterEnd={onTileEnterEnd}
                  attentionClass={cellClass("essence")}
                >
                  {reviewPrompt("essence")}
                  <EssenceBlock
                    slotId="essence"
                    slot={slots.essence}
                    onAction={onAction}
                    activeSlotId={activeSlotId}
                    motion={motionBySlot.essence}
                  />
                </GenomaMosaicCell>
              </div>

              <div className="genoma-v2-mosaic-band genoma-v2-mosaic-band--c">
                <GenomaMosaicCell
                  slotId="palette"
                  mosaicKey="palette"
                  surface="page"
                  colSpan={12}
                  slot={slots.palette}
                  motion={motionBySlot.palette}
                  onTileEnterEnd={onTileEnterEnd}
                  attentionClass={cellClass("palette")}
                >
                  {reviewPrompt("palette")}
                  <PaletteBlock
                    slotId="palette"
                    slot={slots.palette}
                    onAction={onAction}
                    activeSlotId={activeSlotId}
                    motion={motionBySlot.palette}
                  />
                </GenomaMosaicCell>
              </div>

              <div className="genoma-v2-mosaic-band genoma-v2-mosaic-band--d">
                <GenomaMosaicCell
                  slotId="typography"
                  mosaicKey="typography"
                  surface="raised"
                  colSpan={7}
                  slot={slots.typography}
                  motion={motionBySlot.typography}
                  onTileEnterEnd={onTileEnterEnd}
                  attentionClass={cellClass("typography")}
                >
                  {reviewPrompt("typography")}
                  <TypographyBlock
                    slotId="typography"
                    slot={slots.typography}
                    onAction={onAction}
                    activeSlotId={activeSlotId}
                    motion={motionBySlot.typography}
                    mosaicHeadline={mosaicHeadline}
                    mosaicBrandName={mosaicBrandName}
                  />
                </GenomaMosaicCell>

                <GenomaMosaicCell
                  slotId="voice"
                  mosaicKey="voice"
                  surface="primary"
                  colSpan={5}
                  alignSelf="start"
                  ghostVacant
                  slot={slots.voice}
                  motion={motionBySlot.voice}
                  onTileEnterEnd={onTileEnterEnd}
                  attentionClass={cellClass("voice")}
                >
                  {reviewPrompt("voice")}
                  <VoiceBlock
                    slotId="voice"
                    slot={slots.voice}
                    onAction={onAction}
                    activeSlotId={activeSlotId}
                    motion={motionBySlot.voice}
                  />
                </GenomaMosaicCell>
              </div>

              <div className="genoma-v2-mosaic-band genoma-v2-mosaic-band--e">
                <GenomaMosaicCell
                  slotId="visualWorld"
                  mosaicKey="visual"
                  surface="accent"
                  colSpan={5}
                  alignSelf="start"
                  ghostVacant
                  slot={slots.visualWorld}
                  motion={motionBySlot.visualWorld}
                  onTileEnterEnd={onTileEnterEnd}
                  attentionClass={cellClass("visualWorld")}
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
                </GenomaMosaicCell>

                <GenomaMosaicCell
                  slotId="gallery"
                  mosaicKey="gallery"
                  surface="page"
                  colSpan={7}
                  slot={slots.gallery}
                  motion={motionBySlot.gallery}
                  onTileEnterEnd={onTileEnterEnd}
                  attentionClass={cellClass("gallery")}
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
                </GenomaMosaicCell>
              </div>
            </div>

            {showShowcase ? (
              <div className="genoma-v2-mosaic-banda-08-wrap">
                <GenomaBanda08
                  doc={doc}
                  presentationMode={presentationMode}
                  brandPolarity={brandTheme.polarity}
                  brandVars={brandTheme.vars}
                />
              </div>
            ) : null}

            {reviewMode && queue.length > 0 ? (
              <GenomaReviewQueueBar index={index} total={queue.length} onSkip={skip} onExit={exit} />
            ) : null}
            <GenomaMosaicDetailSheet />
          </div>
        </GenomaMosaicBoardProvider>
      </GenomaImageLightboxProvider>
    </GenomaEvidencePopoverProvider>
  );
}
