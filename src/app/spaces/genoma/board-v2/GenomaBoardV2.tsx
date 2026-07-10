"use client";

import React from "react";
import type { GenomaDocument, SlotAction, SlotId } from "@/lib/genoma/genoma-types";
import type { GenomaGalleryGenerateProgress } from "../genoma-api";
import { getSlotAttention } from "@/lib/genoma/genoma-board-status";
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
}: GenomaBoardV2Props) {
  const slots = doc.slots;

  const tileClass = (slotId: SlotId) => {
    const attention = getSlotAttention(slots[slotId], activeSlotId);
    return attention.kind ? ` genoma-v2-tile--${attention.kind}` : "";
  };

  return (
    <GenomaImageLightboxProvider>
      <div className={`genoma-v2-bento-board${isAnalyzing ? " is-loading" : ""}`}>
        <GenomaBoardHeader doc={doc} onBrandNameChange={onBrandNameChange} />
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
