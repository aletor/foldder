"use client";

import React, { useMemo } from "react";
import type { GalleryValue, BrandKitDocument, SlotAction, SlotId, SlotState } from "@/lib/brandkit/brand-kit-types";
import {
  computeGalleryBriefSourceKey,
  galleryBriefsAreFresh,
  resolveGalleryCategoryBriefing,
} from "@/lib/brandkit/brand-kit-gallery-brief";
import { formatBrandKitGalleryCategoryCostHint } from "@/lib/brandkit/brand-kit-gallery-cost";
import { GALLERY_CATEGORY_ORDER, GALLERY_CATEGORY_SLOT_COUNT, groupGeneratedByCategory, type GalleryGenerateCategory } from "@/lib/brandkit/brand-kit-gallery-plan";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import type { BrandKitGalleryGenerateProgress } from "../../brand-kit-api";
import { DnaBlock } from "../DnaBlock";
import { BrandKitFoldderButton } from "../BrandKitFoldderButton";
import { BrandKitClickableImage } from "../BrandKitClickableImage";
import { RefreshCw, Sparkles } from "lucide-react";
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
  onAnalyzeGalleryBriefs,
  generatingGalleryCategory = null,
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
  onAnalyzeGalleryBriefs?: () => void;
  generatingGalleryCategory?: GalleryGenerateCategory | null;
  isAnalyzingGalleryBriefs?: boolean;
  galleryProgress?: BrandKitGalleryGenerateProgress | null;
  focusGeneratedTab?: number;
  gallerySuccessMessage?: string | null;
  activeSlotId?: SlotId;
  brandReady?: boolean;
} & BrandKitBlockMotionProps) {
  const gallery = slot.value as GalleryValue | undefined;
  const generated = gallery?.generated ?? [];
  const grouped = useMemo(() => groupGeneratedByCategory(generated), [generated]);
  const categoryCostHint = formatBrandKitGalleryCategoryCostHint("es");
  const briefSourceKey = useMemo(() => computeGalleryBriefSourceKey(doc), [doc]);
  const briefsFresh = galleryBriefsAreFresh(gallery, briefSourceKey);
  const showBriefStaleBanner = Boolean(gallery?.categoryBriefs?.length) && !briefsFresh;

  const setVerdict = (item: GalleryValue["generated"][number], verdict: "up" | "down") => {
    if (!gallery) return;
    onAction(slotId, {
      action: "set",
      value: {
        ...gallery,
        generated: gallery.generated.map((entry) =>
          entry.assetId === item.assetId ? { ...entry, verdict } : entry,
        ),
      },
    });
  };

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
                variant="white"
                compact
                icon={RefreshCw}
                onClick={onAnalyzeGalleryBriefs}
                disabled={isAnalyzingGalleryBriefs}
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
              const items = grouped[category];
              const slots = Array.from({ length: GALLERY_CATEGORY_SLOT_COUNT }, (_, index) => items[index]);
              const isGeneratingThis = generatingGalleryCategory === category;
              const hasImages = items.length > 0;
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
                      const showLoading = isGeneratingThis && !item;
                      return (
                        <div key={`${category}-${slotIndex}`} className="brandKit-v2-generated-slot">
                          {item?.previewUrl ? (
                            <div className="brandKit-v2-gallery-generated">
                              <BrandKitClickableImage src={item.previewUrl} fit="cover" eager />
                              <div className="brandKit-v2-gallery-verdicts">
                                <button
                                  type="button"
                                  className={`brandKit-v2-gallery-verdict${item.verdict === "up" ? " is-active" : ""}`}
                                  aria-label={brandKitLocaleEs.galleryVerdictUp}
                                  onClick={() => setVerdict(item, "up")}
                                >
                                  <span aria-hidden>✓</span>
                                </button>
                                <button
                                  type="button"
                                  className={`brandKit-v2-gallery-verdict${item.verdict === "down" ? " is-active" : ""}`}
                                  aria-label={brandKitLocaleEs.galleryVerdictDown}
                                  onClick={() => setVerdict(item, "down")}
                                >
                                  <span aria-hidden>✗</span>
                                </button>
                              </div>
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
                      {briefing.needsAnalysis && onAnalyzeGalleryBriefs && !briefsFresh ? (
                        <BrandKitFoldderButton
                          variant="white"
                          compact
                          icon={RefreshCw}
                          onClick={onAnalyzeGalleryBriefs}
                          disabled={isAnalyzingGalleryBriefs || Boolean(generatingGalleryCategory)}
                        >
                          {isAnalyzingGalleryBriefs
                            ? brandKitLocaleEs.analyzingGalleryBriefs
                            : brandKitLocaleEs.analyzeGalleryBriefs}
                        </BrandKitFoldderButton>
                      ) : onGenerateGalleryCategory ? (
                        <BrandKitFoldderButton
                          variant="white"
                          compact
                          icon={Sparkles}
                          onClick={() => onGenerateGalleryCategory(category)}
                          disabled={Boolean(generatingGalleryCategory) || isAnalyzingGalleryBriefs || !canGenerate}
                          aria-busy={isGeneratingThis}
                        >
                          {isGeneratingThis
                            ? brandKitLocaleEs.generatingGalleryCategory(briefing.label)
                            : hasImages
                              ? brandKitLocaleEs.regenerateGalleryCategory
                              : brandKitLocaleEs.generateGalleryCategory}
                        </BrandKitFoldderButton>
                      ) : null}
                      {!isGeneratingThis && canGenerate ? (
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
