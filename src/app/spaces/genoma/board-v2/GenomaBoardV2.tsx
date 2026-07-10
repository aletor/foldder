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
      <div className={`genoma-v2-bento-board${isAnalyzing ? " is-loading" : ""}${presentationMode ? " is-presentation" : ""}`}>
        <GenomaBoardHeader
          doc={doc}
          onBrandNameChange={onBrandNameChange}
          presentationMode={presentationMode}
          onPresentationModeChange={onPresentationModeChange}
        />
        <GenomaBoardStatusBar doc={doc} />

        <div className="genoma-v2-bento-grid">
          <section
            className={`genoma-v2-tile genoma-v2-tile--logo${tileClass("logo")}`}
            data-genoma-slot="logo"
          >
            <LogoBlock slotId="logo" slot={slots.logo} onAction={onAction} onUploadLogo={onLogoUpload} activeSlotId={activeSlotId} />
          </section>

          <section
            className={`genoma-v2-tile genoma-v2-tile--essence${tileClass("essence")}`}
            data-genoma-slot="essence"
          >
            <EssenceBlock slotId="essence" slot={slots.essence} onAction={onAction} activeSlotId={activeSlotId} />
          </section>

          <section
            className={`genoma-v2-tile genoma-v2-tile--typography${tileClass("typography")}`}
            data-genoma-slot="typography"
          >
            <TypographyBlock slotId="typography" slot={slots.typography} onAction={onAction} activeSlotId={activeSlotId} />
          </section>

          <section
            className={`genoma-v2-tile genoma-v2-tile--palette${tileClass("palette")}`}
            data-genoma-slot="palette"
          >
            <PaletteBlock slotId="palette" slot={slots.palette} onAction={onAction} activeSlotId={activeSlotId} />
          </section>

          <section
            className={`genoma-v2-tile genoma-v2-tile--voice${tileClass("voice")}`}
            data-genoma-slot="voice"
          >
            <VoiceBlock slotId="voice" slot={slots.voice} onAction={onAction} activeSlotId={activeSlotId} />
          </section>

          <section
            className={`genoma-v2-tile genoma-v2-tile--visual${tileClass("visualWorld")}`}
            data-genoma-slot="visualWorld"
          >
            <VisualWorldBlock
              slotId="visualWorld"
              slot={slots.visualWorld}
              onAction={onAction}
              gallery={slots.gallery}
              activeSlotId={activeSlotId}
            />
          </section>

          <section
            className={`genoma-v2-tile genoma-v2-tile--gallery${tileClass("gallery")}`}
            data-genoma-slot="gallery"
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
            />
          </section>
        </div>
      </div>
    </GenomaImageLightboxProvider>
  );
}
