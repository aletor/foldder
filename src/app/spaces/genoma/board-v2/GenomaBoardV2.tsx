"use client";

import React from "react";
import type { GenomaDocument, SlotAction, SlotId } from "@/lib/genoma/genoma-types";
import type { GenomaGalleryGenerateProgress } from "../genoma-api";
import { GenomaBoardHeader } from "./GenomaBoardHeader";
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
};

export function GenomaBoardV2({
  doc,
  onAction,
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
}: GenomaBoardV2Props) {
  const slots = doc.slots;

  return (
    <div className={`genoma-v2-bento-board${isAnalyzing ? " is-loading" : ""}`}>
      <GenomaBoardHeader
        doc={doc}
        onBrandNameChange={onBrandNameChange}
        onExportTokens={onExportTokens}
        onExportCompiled={onExportCompiled}
        canExport={canExport}
      />

      <div className="genoma-v2-bento-grid">
        <section className="genoma-v2-tile genoma-v2-tile--logo genoma-v2-tile--accent">
          <LogoBlock slotId="logo" slot={slots.logo} onAction={onAction} />
        </section>

        <section className="genoma-v2-tile genoma-v2-tile--essence">
          <EssenceBlock slotId="essence" slot={slots.essence} onAction={onAction} />
        </section>

        <section className="genoma-v2-tile genoma-v2-tile--typography">
          <TypographyBlock slotId="typography" slot={slots.typography} onAction={onAction} />
        </section>

        <section className="genoma-v2-tile genoma-v2-tile--palette genoma-v2-tile--muted">
          <PaletteBlock slotId="palette" slot={slots.palette} onAction={onAction} />
        </section>

        <section className="genoma-v2-tile genoma-v2-tile--voice">
          <VoiceBlock slotId="voice" slot={slots.voice} onAction={onAction} />
        </section>

        <section className="genoma-v2-tile genoma-v2-tile--visual">
          <VisualWorldBlock
            slotId="visualWorld"
            slot={slots.visualWorld}
            onAction={onAction}
            gallery={slots.gallery}
          />
        </section>

        <section className="genoma-v2-tile genoma-v2-tile--gallery">
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
          />
        </section>
      </div>
    </div>
  );
}
