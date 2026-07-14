"use client";

import React, { useMemo } from "react";
import type { GalleryValue, BrandKitDocument, SlotAction, SlotId, SlotState } from "@/lib/brandkit/brand-kit-types";
import {
  computeGalleryBriefSourceKey,
  galleryBriefsAreFresh,
  resolveGalleryCategoryBriefing,
} from "@/lib/brandkit/brand-kit-gallery-brief";
import { formatBrandKitGalleryCategoryCostHint, formatBrandKitGalleryCostHint } from "@/lib/brandkit/brand-kit-gallery-cost";
import {
  GALLERY_CATEGORY_ORDER,
  galleryGenerateScopeMatchesCategory,
  galleryGenerateScopeMatchesSlot,
  gallerySlotsForCategory,
  type GalleryGenerateCategory,
  type GalleryGenerateScope,
} from "@/lib/brandkit/brand-kit-gallery-plan";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import type { BrandKitGalleryGenerateProgress } from "../../brand-kit-api";
import { DnaBlock } from "../DnaBlock";
import { BrandKitFoldderButton } from "../BrandKitFoldderButton";
import { BrandKitClickableImage } from "../BrandKitClickableImage";
import { RefreshCw } from "lucide-react";
import { BrandKitBlockSkeleton } from "../BrandKitBlockSkeleton";
import {
  shouldShowAnalyzingSkeleton,
  shouldShowLegacyPendingSkeleton,
  type BrandKitBlockMotionProps,
} from "../brand-kit-block-motion";

export function GalleryBlock({
  slot,
  slotId,
  doc,
  onAction,
  onGenerateGalleryCategory,
  onGenerateGallerySlot,
  onGenerateAllGallery,
  onAnalyzeGalleryBriefs,
  generatingGallery = null,
  isAnalyzingGalleryBriefs = false,
  galleryProgress = null,
  gallerySuccessMessage,
  activeSlotId,
  motion,
}: {
  slot: SlotState<unknown>;
  slotId: SlotId;
  doc: BrandKitDocument;
  onAction: (slotId: SlotId, action: SlotAction) => void;
  onGenerateGalleryCategory?: (category: GalleryGenerateCategory) => void;
  onGenerateGallerySlot?: (category: GalleryGenerateCategory, variantIndex: number) => void;
  onGenerateAllGallery?: () => void;
  onAnalyzeGalleryBriefs?: () => void;
  generatingGallery?: GalleryGenerateScope | null;
  isAnalyzingGalleryBriefs?: boolean;
  galleryProgress?: BrandKitGalleryGenerateProgress | null;
  focusGeneratedTab?: number;
  gallerySuccessMessage?: string | null;
  activeSlotId?: SlotId;
  brandReady?: boolean;
} & BrandKitBlockMotionProps) {
  const gallery = slot.value as GalleryValue | undefined;
  const generated = gallery?.generated ?? [];
  const categoryCostHint = formatBrandKitGalleryCategoryCostHint("es");
  const allGalleryCostHint = formatBrandKitGalleryCostHint("es");
  const briefSourceKey = useMemo(() => computeGalleryBriefSourceKey(doc), [doc]);
  const briefsFresh = galleryBriefsAreFresh(gallery, briefSourceKey);
  const showBriefStaleBanner = Boolean(gallery?.categoryBriefs?.length) && !briefsFresh;
  const isGeneratingAnything = generatingGallery != null;
  const isGeneratingAll = generatingGallery?.scope === "all";
  const canGenerateAll = useMemo(
    () =>
      GALLERY_CATEGORY_ORDER.every((category) => {
        const briefing = resolveGalleryCategoryBriefing(doc, category);
        return briefsFresh || !briefing.needsAnalysis;
      }),
    [briefsFresh, doc],
  );

  let body: React.ReactNode;

  if (shouldShowAnalyzingSkeleton(motion)) {
    body = <BrandKitBlockSkeleton variant="gallery" />;
  } else if (shouldShowLegacyPendingSkeleton(motion, slot.status)) {
    body = <div className="brandKit-v2-skeleton brandKit-v2-skeleton--wide" aria-hidden />;
  } else {
    body = (
      <div className="brandKit-v2-gallery brandKit-v2-gallery--bento">
        {gallerySuccessMessage ? <p className="brandKit-v2-gallery-success">{gallerySuccessMessage}</p> : null}

        {showBriefStaleBanner ? (
          <div className="brandKit-v2-gallery-brief-banner">
            <p className="brandKit-v2-gallery-brief-banner__text">{brandKitLocaleEs.galleryBriefStale}</p>
            {onAnalyzeGalleryBriefs ? (
              <BrandKitFoldderButton
                variant="dock"
                compact
                icon={RefreshCw}
                onClick={onAnalyzeGalleryBriefs}
                disabled={isAnalyzingGalleryBriefs || isGeneratingAnything}
              >
                {isAnalyzingGalleryBriefs
                  ? brandKitLocaleEs.analyzingGalleryBriefs
                  : brandKitLocaleEs.analyzeGalleryBriefs}
              </BrandKitFoldderButton>
            ) : null}
          </div>
        ) : null}

        {isAnalyzingGalleryBriefs ? (
          <p className="brandKit-v2-muted brandKit-v2-gallery-brief-status" role="status" aria-live="polite">
            {brandKitLocaleEs.analyzingGalleryBriefs}
          </p>
        ) : null}

        <div className="brandKit-v2-generated-panel">
          <div className="brandKit-v2-generated-matrix">
            {GALLERY_CATEGORY_ORDER.map((category) => {
              const briefing = resolveGalleryCategoryBriefing(doc, category);
              const items = generated.filter((item) => (item.category ?? "general") === category);
              const slots = gallerySlotsForCategory(items);
              const isGeneratingCategory = galleryGenerateScopeMatchesCategory(generatingGallery, category);
              const isGeneratingThis =
                generatingGallery?.scope === "category" && generatingGallery.category === category;
              const progressForCard = galleryProgress?.category === category ? galleryProgress : null;
              const progressPct =
                progressForCard && progressForCard.total > 0
                  ? Math.round((progressForCard.index / progressForCard.total) * 100)
                  : 0;
              const canGenerate = briefsFresh || !briefing.needsAnalysis;

              return (
                <article key={category} className="brandKit-v2-generated-category">
                  <div className="brandKit-v2-generated-category__imgs brandKit-v2-generated-category__imgs--grid-2x2">
                    {slots.map((item, slotIndex) => {
                      const isGeneratingSlot = galleryGenerateScopeMatchesSlot(
                        generatingGallery,
                        category,
                        slotIndex,
                      );
                      const showLoading =
                        isGeneratingSlot ||
                        ((isGeneratingThis || (isGeneratingAll && galleryProgress?.category === category)) &&
                          !item);
                      return (
                        <div key={`${category}-${slotIndex}`} className="brandKit-v2-generated-slot">
                          {item?.previewUrl ? (
                            <div className="brandKit-v2-gallery-generated">
                              <BrandKitClickableImage src={item.previewUrl} fit="cover" eager />
                              {onGenerateGallerySlot ? (
                                <BrandKitFoldderButton
                                  variant="dock"
                                  iconOnly
                                  round
                                  icon={RefreshCw}
                                  className={`brandKit-v2-gallery-generated__regen${isGeneratingSlot ? " is-spinning" : ""}`}
                                  onClick={() => onGenerateGallerySlot(category, slotIndex)}
                                  disabled={isGeneratingAnything || isAnalyzingGalleryBriefs || !canGenerate}
                                  aria-busy={isGeneratingSlot}
                                  aria-label={brandKitLocaleEs.regenerateGalleryImage}
                                  title={brandKitLocaleEs.regenerateGalleryImage}
                                />
                              ) : null}
                            </div>
                          ) : showLoading ? (
                            <div className="brandKit-v2-generated-slot__loading" aria-hidden />
                          ) : (
                            <div className="brandKit-v2-generated-slot__empty" aria-hidden />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <footer className="brandKit-v2-generated-category__foot">
                    <div className="brandKit-v2-generated-category__copy">
                      <p className="brandKit-v2-generated-category__label">{briefing.label}</p>
                      <p className="brandKit-v2-generated-category__hint">{briefing.description}</p>
                      {briefing.confidence && briefing.evidenceCount ? (
                        <p className="brandKit-v2-generated-category__meta">
                          {brandKitLocaleEs.galleryBriefConfidence(briefing.confidence, briefing.evidenceCount)}
                        </p>
                      ) : null}
                    </div>
                    <div className="brandKit-v2-generated-category__action">
                      <div className="brandKit-v2-generated-category__action-row">
                        {briefing.needsAnalysis && onAnalyzeGalleryBriefs && !briefsFresh ? (
                          <BrandKitFoldderButton
                            variant="dock"
                            compact
                            icon={RefreshCw}
                            onClick={onAnalyzeGalleryBriefs}
                            disabled={isAnalyzingGalleryBriefs || isGeneratingAnything}
                          >
                            {isAnalyzingGalleryBriefs
                              ? brandKitLocaleEs.analyzingGalleryBriefs
                              : brandKitLocaleEs.analyzeGalleryBriefs}
                          </BrandKitFoldderButton>
                        ) : onGenerateGalleryCategory ? (
                          <BrandKitFoldderButton
                            variant="dock"
                            compact
                            icon={RefreshCw}
                            className={isGeneratingThis ? "is-spinning" : ""}
                            onClick={() => onGenerateGalleryCategory(category)}
                            disabled={isGeneratingAnything || isAnalyzingGalleryBriefs || !canGenerate}
                            aria-busy={isGeneratingThis}
                          >
                            {isGeneratingThis
                              ? brandKitLocaleEs.generatingGalleryCategory(briefing.label)
                              : brandKitLocaleEs.generateGalleryBlock}
                          </BrandKitFoldderButton>
                        ) : null}
                      </div>
                      {!isGeneratingCategory && canGenerate ? (
                        <p className="brandKit-v2-generated-category__cost">{categoryCostHint}</p>
                      ) : progressForCard ? (
                        <div className="brandKit-v2-generated-category__progress" role="status" aria-live="polite">
                          <div className="brandKit-v2-generated-category__progress-bar">
                            <div
                              className="brandKit-v2-generated-category__progress-fill"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <p className="brandKit-v2-generated-category__progress-meta">
                            {progressForCard.index}/{progressForCard.total}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </footer>
                </article>
              );
            })}
          </div>

          {onGenerateAllGallery ? (
            <footer className="brandKit-v2-gallery-global-action">
              <BrandKitFoldderButton
                variant="dock"
                compact
                icon={RefreshCw}
                className={isGeneratingAll ? "is-spinning" : ""}
                onClick={onGenerateAllGallery}
                disabled={isGeneratingAnything || isAnalyzingGalleryBriefs || !canGenerateAll}
                aria-busy={isGeneratingAll}
              >
                {isGeneratingAll ? brandKitLocaleEs.generatingGallery : brandKitLocaleEs.generateAllGalleryImages}
              </BrandKitFoldderButton>
              {!isGeneratingAll && canGenerateAll ? (
                <p className="brandKit-v2-gallery-global-action__cost">{allGalleryCostHint}</p>
              ) : isGeneratingAll && galleryProgress ? (
                <p className="brandKit-v2-gallery-global-action__meta" role="status" aria-live="polite">
                  {galleryProgress.index}/{galleryProgress.total}
                </p>
              ) : null}
            </footer>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <DnaBlock
      slotId={slotId}
      slot={slot}
      onAction={onAction}
      className="brandKit-v2-block--gallery brandKit-v2-block--bento-gallery"
      activeSlotId={activeSlotId}
    >
      {body}
    </DnaBlock>
  );
}
