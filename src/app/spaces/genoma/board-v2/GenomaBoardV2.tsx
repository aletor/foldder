"use client";

import React, { useMemo } from "react";
import type { GenomaDocument, SlotAction, SlotId } from "@/lib/genoma/genoma-types";
import { GENOMA_SLOT_IDS } from "@/lib/genoma/genoma-types";
import type { GenomaGalleryGenerateProgress } from "../genoma-api";
import { getSlotAttention } from "@/lib/genoma/genoma-board-status";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { GenomaBoardHeader } from "./GenomaBoardHeader";
import { GenomaBoardStatusBar } from "./GenomaBoardStatusBar";
import { GenomaImageLightboxProvider } from "./GenomaImageLightbox";
import { LogoBlock } from "./blocks/LogoBlock";
import { PaletteBlock } from "./blocks/PaletteBlock";
import { TypographyBlock } from "./blocks/TypographyBlock";
import { EssenceBlock } from "./blocks/EssenceBlock";
import { VoiceBlock } from "./blocks/VoiceBlock";
import { VisualWorldBlock } from "./blocks/VisualWorldBlock";
import { GalleryBlock } from "./blocks/GalleryBlock";
import { useGenomaBoardSlotMotion, type SlotMotionState } from "./use-genoma-board-slot-motion";

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
}: GenomaBoardV2Props) {
  const slots = doc.slots;
  const { motionBySlot, onTileEnterEnd } = useGenomaBoardSlotMotion(slots, isAnalyzing);

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
    if (borradorPulseSlotId === slotId) classes.push(" genoma-v2-tile--borrador-pulse");
    return classes.join("");
  };

  return (
    <GenomaImageLightboxProvider>
      <div className={`genoma-v2-bento-board${presentationMode ? " is-presentation" : ""}`}>
        <GenomaBoardHeader
          doc={doc}
          onBrandNameChange={onBrandNameChange}
          presentationMode={presentationMode}
          onPresentationModeChange={onPresentationModeChange}
        />
        <GenomaBoardStatusBar doc={doc} />

        <div className="genoma-v2-bento-grid">
          <GenomaBoardTile
            slotId="logo"
            tileSuffix="logo"
            attentionClass={tileClass("logo")}
            motion={motionBySlot.logo}
            onTileEnterEnd={onTileEnterEnd}
          >
            <LogoBlock
              slotId="logo"
              slot={slots.logo}
              onAction={onAction}
              onUploadLogo={onLogoUpload}
              activeSlotId={activeSlotId}
              motion={motionBySlot.logo}
            />
          </GenomaBoardTile>

          <GenomaBoardTile
            slotId="essence"
            tileSuffix="essence"
            attentionClass={tileClass("essence")}
            motion={motionBySlot.essence}
            onTileEnterEnd={onTileEnterEnd}
          >
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
            <TypographyBlock
              slotId="typography"
              slot={slots.typography}
              onAction={onAction}
              activeSlotId={activeSlotId}
              motion={motionBySlot.typography}
            />
          </GenomaBoardTile>

          <GenomaBoardTile
            slotId="palette"
            tileSuffix="palette"
            attentionClass={tileClass("palette")}
            motion={motionBySlot.palette}
            onTileEnterEnd={onTileEnterEnd}
          >
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
            />
          </GenomaBoardTile>
        </div>
      </div>
    </GenomaImageLightboxProvider>
  );
}
