"use client";

import React, { useCallback, useMemo } from "react";
import type { EssenceValue, BrandKitDocument, SlotAction, SlotId } from "@/lib/brandkit/brand-kit-types";
import { BRAND_KIT_SLOT_IDS } from "@/lib/brandkit/brand-kit-types";
import type { BrandKitGalleryGenerateProgress } from "../brand-kit-api";
import type { GalleryGenerateCategory } from "@/lib/brandkit/brand-kit-gallery-plan";
import { getSlotAttention } from "@/lib/brandkit/brand-kit-board-status";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { BrandKitImageLightboxProvider } from "./BrandKitImageLightbox";
import { BrandKitEvidencePopoverProvider } from "./BrandKitEvidencePopoverContext";
import { BrandKitReviewPrompt } from "./BrandKitReviewPrompt";
import { BrandKitReviewQueueBar } from "./BrandKitReviewQueueBar";
import { useBrandKitReviewMode, type BrandKitReviewModeStats } from "./use-brand-kit-review-mode";
import { BrandKitBanda08 } from "./BrandKitBanda08";
import { shouldRenderBrandKitShowcase } from "./showcase/brand-kit-showcase-data";
import { LogoBlock } from "./blocks/LogoBlock";
import { PaletteBlock } from "./blocks/PaletteBlock";
import { TypographyBlock } from "./blocks/TypographyBlock";
import { EssenceBlock } from "./blocks/EssenceBlock";
import { VoiceBlock } from "./blocks/VoiceBlock";
import { VisualWorldBlock } from "./blocks/VisualWorldBlock";
import { GalleryBlock } from "./blocks/GalleryBlock";
import { useBrandKitBoardSlotMotion } from "./use-brand-kit-board-slot-motion";
import { useBrandKitTheme } from "./use-brand-kit-theme";
import { BrandKitBoardGoogleFontsLoader } from "./BrandKitBoardGoogleFontsLoader";
import { BrandKitMosaicCell } from "./BrandKitMosaicCell";
import { BrandKitMosaicBoardProvider } from "./brand-kit-mosaic-context";
import { BrandKitMosaicDetailSheet } from "./BrandKitMosaicDetailSheet";
import type { TypographyValue } from "@/lib/brandkit/brand-kit-types";
import "./brand-kit-board-brand-theme.css";
import "./brand-kit-board-stylebook.css";
import "./brand-kit-showcase.css";
import "./brand-kit-confidence.css";
import "./brand-kit-board-mosaic.css";

function mosaicHeadlineCandidate(doc: BrandKitDocument, presentationMode: boolean): string | undefined {
  const essenceSlot = doc.slots.essence;
  const canUseEssence = !presentationMode || essenceSlot.locked;
  if (!canUseEssence) return undefined;
  const essence = essenceSlot.value as EssenceValue | undefined;
  return essence?.headline?.trim() || undefined;
}

type BrandKitBoardV2Props = {
  doc: BrandKitDocument;
  onAction: (slotId: SlotId, action: SlotAction) => void;
  onLogoUpload?: (file: File) => void | Promise<void>;
  isAnalyzing?: boolean;
  generatingGalleryCategory?: GalleryGenerateCategory | null;
  galleryProgress?: BrandKitGalleryGenerateProgress | null;
  onGenerateGalleryCategory?: (category: GalleryGenerateCategory) => void;
  onAnalyzeGalleryBriefs?: () => void;
  isAnalyzingGalleryBriefs?: boolean;
  focusGeneratedTab?: number;
  gallerySuccessMessage?: string | null;
  onExportTokens?: () => void;
  onExportCompiled?: () => void;
  canExport?: boolean;
  hideExportActions?: boolean;
  activeSlotId?: SlotId;
  presentationMode?: boolean;
  reviewMode?: boolean;
  onReviewModeChange?: (enabled: boolean) => void;
  onReviewComplete?: (stats: BrandKitReviewModeStats) => void;
};

export function BrandKitBoardV2({
  doc,
  onAction,
  onLogoUpload,
  isAnalyzing = false,
  generatingGalleryCategory = null,
  galleryProgress = null,
  onGenerateGalleryCategory,
  onAnalyzeGalleryBriefs,
  isAnalyzingGalleryBriefs = false,
  focusGeneratedTab,
  gallerySuccessMessage,
  onExportTokens,
  onExportCompiled,
  canExport = false,
  hideExportActions = false,
  activeSlotId,
  presentationMode = false,
  reviewMode = false,
  onReviewModeChange,
  onReviewComplete,
}: BrandKitBoardV2Props) {
  const slots = doc.slots;
  const { motionBySlot, onTileEnterEnd } = useBrandKitBoardSlotMotion(slots, isAnalyzing);
  const brandTheme = useBrandKitTheme(doc);

  const handleReviewComplete = useCallback(
    (stats: BrandKitReviewModeStats) => {
      onReviewModeChange?.(false);
      onReviewComplete?.(stats);
    },
    [onReviewComplete, onReviewModeChange],
  );

  const { queue, current, index, skip, exit } = useBrandKitReviewMode(
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
    () => shouldRenderBrandKitShowcase(doc, presentationMode),
    [doc, presentationMode],
  );

  const borradorPulseSlotId = useMemo(() => {
    for (const slotId of BRAND_KIT_SLOT_IDS) {
      const attention = getSlotAttention(slots[slotId], activeSlotId);
      if (attention.kind === "candidates" && attention.label === brandKitLocaleEs.reviewChip) {
        return slotId;
      }
    }
    return null;
  }, [slots, activeSlotId]);

  const cellClass = (slotId: SlotId) => {
    const attention = getSlotAttention(slots[slotId], activeSlotId);
    const classes: string[] = [];
    if (attention.kind) classes.push(` brandKit-mosaic-cell--${attention.kind}`);
    if (presentationMode && !slots[slotId]?.locked) classes.push(" brandKit-mosaic-cell--presentation-muted");
    if (reviewMode && current) {
      if (slotId === current.slotId) classes.push(" brandKit-mosaic-cell--review-active");
      else classes.push(" brandKit-mosaic-cell--review-muted");
    }
    if (borradorPulseSlotId === slotId) classes.push(" brandKit-mosaic-cell--borrador-pulse");
    return classes.join("");
  };

  const reviewPrompt = (slotId: SlotId) =>
    reviewMode && current?.slotId === slotId ? <BrandKitReviewPrompt doc={doc} item={current} /> : null;

  return (
    <BrandKitEvidencePopoverProvider>
      <BrandKitImageLightboxProvider>
        <BrandKitMosaicBoardProvider>
          <BrandKitBoardGoogleFontsLoader typography={typography} />
          <div
            className={`brandKit-v2-bento-board brandKit-v2-mosaic-board${presentationMode ? " is-presentation" : ""}${reviewMode ? " is-review" : ""}`}
            data-brand-ready={brandTheme.ready ? "true" : "false"}
            data-brand-animate={brandTheme.animate ? "true" : "false"}
            data-brand-polarity={brandTheme.polarity}
            style={brandTheme.ready ? (brandTheme.vars as React.CSSProperties) : undefined}
          >
            {/*
             * MAPA FINAL — bandas horizontales (12 col, gap 8px, altura = contenido)
             * B  logo          7 × auto  |  essence       5 × auto
             * C  palette      12 × auto
             * D  typography    7 × auto  |  voice          5 × auto
             * E  visual       12 × auto
             * F  gallery      12 × auto
             * 08 banda-08: hermana posterior al mosaico (fuera del grid)
             */}
            <div className="brandKit-v2-mosaic-bands">
              <div className="brandKit-v2-mosaic-band brandKit-v2-mosaic-band--b">
                <BrandKitMosaicCell
                  slotId="logo"
                  mosaicKey="logo"
                  surface="raised"
                  colSpan={7}
                  alignSelf="start"
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
                </BrandKitMosaicCell>

                <BrandKitMosaicCell
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
                </BrandKitMosaicCell>
              </div>

              <div className="brandKit-v2-mosaic-band brandKit-v2-mosaic-band--c">
                <BrandKitMosaicCell
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
                </BrandKitMosaicCell>
              </div>

              <div className="brandKit-v2-mosaic-band brandKit-v2-mosaic-band--d">
                <BrandKitMosaicCell
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
                </BrandKitMosaicCell>

                <BrandKitMosaicCell
                  slotId="voice"
                  mosaicKey="voice"
                  surface="primary"
                  colSpan={5}
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
                </BrandKitMosaicCell>
              </div>

              <div className="brandKit-v2-mosaic-band brandKit-v2-mosaic-band--e">
                <BrandKitMosaicCell
                  slotId="visualWorld"
                  mosaicKey="visual"
                  surface="accent"
                  colSpan={12}
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
                </BrandKitMosaicCell>
              </div>

              <div className="brandKit-v2-mosaic-band brandKit-v2-mosaic-band--f">
                <BrandKitMosaicCell
                  slotId="gallery"
                  mosaicKey="gallery"
                  surface="page"
                  colSpan={12}
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
                    onGenerateGalleryCategory={onGenerateGalleryCategory}
                    onAnalyzeGalleryBriefs={onAnalyzeGalleryBriefs}
                    isAnalyzingGalleryBriefs={isAnalyzingGalleryBriefs}
                    generatingGalleryCategory={generatingGalleryCategory}
                    galleryProgress={galleryProgress}
                    focusGeneratedTab={focusGeneratedTab}
                    gallerySuccessMessage={gallerySuccessMessage}
                    activeSlotId={activeSlotId}
                    motion={motionBySlot.gallery}
                    brandReady={brandTheme.ready}
                  />
                </BrandKitMosaicCell>
              </div>
            </div>

            {showShowcase ? (
              <div className="brandKit-v2-mosaic-banda-08-wrap">
                <BrandKitBanda08
                  doc={doc}
                  presentationMode={presentationMode}
                  brandPolarity={brandTheme.polarity}
                  brandVars={brandTheme.vars}
                />
              </div>
            ) : null}

            {reviewMode && queue.length > 0 ? (
              <BrandKitReviewQueueBar index={index} total={queue.length} onSkip={skip} onExit={exit} />
            ) : null}
            <BrandKitMosaicDetailSheet />
          </div>
        </BrandKitMosaicBoardProvider>
      </BrandKitImageLightboxProvider>
    </BrandKitEvidencePopoverProvider>
  );
}
