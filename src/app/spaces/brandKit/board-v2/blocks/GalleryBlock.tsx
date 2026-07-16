"use client";

import React, { useCallback, useMemo, useState } from "react";
import type { GalleryValue, BrandKitDocument, SlotAction, SlotId, SlotState } from "@/lib/brandkit/brand-kit-types";
import {
  computeGalleryBriefSourceKey,
  galleryBriefsAreFresh,
  resolveGalleryCategoryBriefing,
  type ResolvedGalleryCategoryBriefing,
} from "@/lib/brandkit/brand-kit-gallery-brief";
import {
  GALLERY_CATEGORY_ORDER,
  GALLERY_CATEGORY_SLOT_COUNT,
  categoryMeta,
  galleryGenerateScopeMatchesCategory,
  galleryGenerateScopeMatchesSlot,
  gallerySlotsForCategory,
  type GalleryGenerateCategory,
  type GalleryGenerateScope,
} from "@/lib/brandkit/brand-kit-gallery-plan";
import {
  approveGalleryImage,
  computeGalleryLibraryStats,
  countCategoryApproved,
  discardGalleryImage,
  galleryImageUrl,
  gallerySlotKey,
  resolveGalleryImageVisualState,
  setGalleryPrimaryImage,
  type GalleryLibraryFilter,
} from "@/lib/brandkit/brand-kit-gallery-image-state";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import type { BrandKitGalleryGenerateProgress } from "../../brand-kit-api";
import { DnaBlock } from "../DnaBlock";
import { BrandKitFoldderButton } from "../BrandKitFoldderButton";
import { BrandKitInlineMarkdown } from "../BrandKitInlineMarkdown";
import { BrandKitGalleryBriefSheet } from "../BrandKitGalleryBriefSheet";
import { BrandKitGalleryImageTile } from "../BrandKitGalleryImageTile";
import { useBrandKitImageLightbox } from "../BrandKitImageLightbox";
import { RefreshCw } from "lucide-react";
import { BrandKitBlockSkeleton } from "../BrandKitBlockSkeleton";
import {
  shouldShowAnalyzingSkeleton,
  shouldShowLegacyPendingSkeleton,
  type BrandKitBlockMotionProps,
} from "../brand-kit-block-motion";
import { useBrandKitMosaicCellOptional } from "../brand-kit-mosaic-context";
import { buildMosaicDetailPayload } from "../BrandKitDetailPanel";
import { useRegisterSlotDetail } from "../BrandKitDetailFooterActions";
import { getSlotAttention } from "@/lib/brandkit/brand-kit-board-status";

const LIBRARY_FILTER_TABS: { id: GalleryLibraryFilter; label: string }[] = [
  { id: "all", label: brandKitLocaleEs.galleryFilterAll },
  ...GALLERY_CATEGORY_ORDER.map((category) => ({
    id: category as GalleryLibraryFilter,
    label: categoryMeta(category).label,
  })),
];

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
  presentationMode = false,
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
  presentationMode?: boolean;
} & BrandKitBlockMotionProps) {
  const gallery = slot.value as GalleryValue | undefined;
  const mosaicCell = useBrandKitMosaicCellOptional();
  const isMosaic = Boolean(mosaicCell);
  const generated = gallery?.generated ?? [];
  const galleryLocked = Boolean(slot.locked);
  const briefSourceKey = useMemo(() => computeGalleryBriefSourceKey(doc), [doc]);
  const briefsFresh = galleryBriefsAreFresh(gallery, briefSourceKey);
  const showBriefStaleBanner = Boolean(gallery?.categoryBriefs?.length) && !briefsFresh;
  const isGeneratingAnything = generatingGallery != null;
  const isGeneratingAll = generatingGallery?.scope === "all";
  const [activeFilter, setActiveFilter] = useState<GalleryLibraryFilter>("all");
  const [briefSheet, setBriefSheet] = useState<ResolvedGalleryCategoryBriefing | null>(null);
  const { openImage } = useBrandKitImageLightbox();

  const libraryStats = useMemo(
    () => computeGalleryLibraryStats(gallery, galleryLocked),
    [gallery, galleryLocked],
  );

  const galleryDetailPayload = useMemo(() => {
    if (!isMosaic) return null;
    return buildMosaicDetailPayload({
      slotId,
      blockLabel: brandKitLocaleEs.gallery,
      brandName: doc.brandName?.value?.trim(),
      statusLabel: slot.locked ? brandKitLocaleEs.locked : brandKitLocaleEs.confirmedStatus,
      summary: (
        <p className="brandKit-v2-prose">
          {brandKitLocaleEs.galleryStats(libraryStats.approved, libraryStats.proposals, libraryStats.errors)}
        </p>
      ),
      panels: [
        {
          id: "library",
          label: brandKitLocaleEs.gallery,
          content: (
            <p className="brandKit-v2-prose">
              {brandKitLocaleEs.galleryStats(libraryStats.approved, libraryStats.proposals, libraryStats.errors)}
            </p>
          ),
        },
      ],
      initialTabId: getSlotAttention(slot).kind === "conflict" ? "evidence" : undefined,
    });
  }, [doc.brandName?.value, galleryLocked, isMosaic, libraryStats.approved, libraryStats.errors, libraryStats.proposals, slot, slotId]);

  useRegisterSlotDetail(isMosaic ? slotId : undefined, galleryDetailPayload);

  const visibleCategories = useMemo(
    () => (activeFilter === "all" ? GALLERY_CATEGORY_ORDER : [activeFilter]),
    [activeFilter],
  );

  const canGenerateAll = useMemo(
    () =>
      GALLERY_CATEGORY_ORDER.every((category) => {
        const briefing = resolveGalleryCategoryBriefing(doc, category);
        return briefsFresh || !briefing.needsAnalysis;
      }),
    [briefsFresh, doc],
  );

  const updateGallery = useCallback(
    (next: GalleryValue) => onAction(slotId, { action: "set", value: next }),
    [onAction, slotId],
  );

  const handleApprove = useCallback(
    (category: GalleryGenerateCategory, variantIndex: number) => {
      if (!gallery) return;
      updateGallery(approveGalleryImage(gallery, category, variantIndex));
    },
    [gallery, updateGallery],
  );

  const handleDiscard = useCallback(
    (category: GalleryGenerateCategory, variantIndex: number) => {
      if (!gallery) return;
      updateGallery(discardGalleryImage(gallery, category, variantIndex));
    },
    [gallery, updateGallery],
  );

  const handleSetPrimary = useCallback(
    (assetId: string) => {
      if (!gallery) return;
      updateGallery(setGalleryPrimaryImage(gallery, assetId));
    },
    [gallery, updateGallery],
  );

  const handleDownload = useCallback((url: string) => {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "";
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.click();
  }, []);

  let body: React.ReactNode;

  if (shouldShowAnalyzingSkeleton(motion)) {
    body = <BrandKitBlockSkeleton variant="gallery" />;
  } else if (shouldShowLegacyPendingSkeleton(motion, slot.status)) {
    body = <div className="brandKit-v2-skeleton brandKit-v2-skeleton--wide" aria-hidden />;
  } else {
    body = (
      <div className="brandKit-v2-gallery brandKit-v2-gallery--library">
        {gallerySuccessMessage ? <p className="brandKit-v2-gallery-success">{gallerySuccessMessage}</p> : null}

        {!presentationMode ? (
          <header className="brandKit-gallery-library__toolbar">
            <p className="brandKit-gallery-library__stats">
              {brandKitLocaleEs.galleryStats(libraryStats.approved, libraryStats.proposals, libraryStats.errors)}
            </p>
            {showBriefStaleBanner && onAnalyzeGalleryBriefs ? (
              <div className="brandKit-gallery-library__toolbar-actions">
                <BrandKitFoldderButton
                  variant="muted"
                  compact
                  icon={RefreshCw}
                  onClick={onAnalyzeGalleryBriefs}
                  disabled={isAnalyzingGalleryBriefs || isGeneratingAnything}
                >
                  {isAnalyzingGalleryBriefs
                    ? brandKitLocaleEs.analyzingGalleryBriefs
                    : brandKitLocaleEs.analyzeGalleryBriefs}
                </BrandKitFoldderButton>
              </div>
            ) : null}
          </header>
        ) : null}

        {!presentationMode ? (
          <div className="brandKit-gallery-library__filters" role="tablist" aria-label="Filtrar biblioteca">
            {LIBRARY_FILTER_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeFilter === tab.id}
                className={`brandKit-gallery-library__filter${activeFilter === tab.id ? " is-active" : ""}`}
                onClick={() => setActiveFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : null}

        {showBriefStaleBanner && !presentationMode ? (
          <div className="brandKit-v2-gallery-brief-banner">
            <p className="brandKit-v2-gallery-brief-banner__text">{brandKitLocaleEs.galleryBriefStale}</p>
          </div>
        ) : null}

        {isAnalyzingGalleryBriefs ? (
          <p className="brandKit-v2-muted brandKit-v2-gallery-brief-status" role="status" aria-live="polite">
            {brandKitLocaleEs.analyzingGalleryBriefs}
          </p>
        ) : null}

        <div className="brandKit-gallery-library__categories">
          {visibleCategories.map((category) => {
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
            const approvedCount = countCategoryApproved(slots, galleryLocked);
            const filledCount = slots.filter((item) => Boolean(item?.previewUrl)).length;

            return (
              <article key={category} className="brandKit-gallery-library__category">
                <header className="brandKit-gallery-library__category-head">
                  <div className="brandKit-gallery-library__category-copy">
                    <p className="brandKit-gallery-library__category-label">{briefing.label}</p>
                    <p className="brandKit-gallery-library__category-hint">
                      <BrandKitInlineMarkdown text={briefing.description.split(".")[0] + (briefing.description.includes(".") ? "." : "")} />
                    </p>
                    <p className="brandKit-gallery-library__category-meta">
                      {brandKitLocaleEs.galleryCategoryMeta(filledCount, approvedCount)}
                    </p>
                  </div>
                  {!presentationMode ? (
                    <div className="brandKit-gallery-library__category-actions">
                      <BrandKitFoldderButton variant="ghost" compact onClick={() => setBriefSheet(briefing)}>
                        {brandKitLocaleEs.galleryViewBrief}
                      </BrandKitFoldderButton>
                      {briefing.needsAnalysis && onAnalyzeGalleryBriefs && !briefsFresh ? (
                        <BrandKitFoldderButton
                          variant="muted"
                          compact
                          icon={RefreshCw}
                          onClick={onAnalyzeGalleryBriefs}
                          disabled={isAnalyzingGalleryBriefs || isGeneratingAnything}
                        >
                          {brandKitLocaleEs.analyzeGalleryBriefs}
                        </BrandKitFoldderButton>
                      ) : onGenerateGalleryCategory ? (
                        <BrandKitFoldderButton
                          variant="muted"
                          compact
                          icon={RefreshCw}
                          className={isGeneratingThis ? "is-spinning" : ""}
                          onClick={() => onGenerateGalleryCategory(category)}
                          disabled={isGeneratingAnything || isAnalyzingGalleryBriefs || !canGenerate}
                          aria-busy={isGeneratingThis}
                        >
                          {isGeneratingThis
                            ? brandKitLocaleEs.generatingGalleryCategory(briefing.label)
                            : brandKitLocaleEs.galleryGenerateCategoryCount(GALLERY_CATEGORY_SLOT_COUNT, briefing.label)}
                        </BrandKitFoldderButton>
                      ) : null}
                    </div>
                  ) : null}
                </header>

                <div className="brandKit-gallery-library__grid">
                  {slots.map((item, slotIndex) => {
                    const slotKey = gallerySlotKey(category, slotIndex);
                    const isGeneratingSlot = galleryGenerateScopeMatchesSlot(
                      generatingGallery,
                      category,
                      slotIndex,
                    );
                    const showLoading =
                      isGeneratingSlot ||
                      ((isGeneratingThis || (isGeneratingAll && galleryProgress?.category === category)) &&
                        !item);
                    const visualState = resolveGalleryImageVisualState(
                      item,
                      slotKey,
                      gallery,
                      galleryLocked,
                      showLoading,
                    );
                    const errorMessage = gallery?.slotIssues?.[slotKey]?.error;
                    const imageUrl = galleryImageUrl(item);
                    const isPrimary = Boolean(item?.assetId && gallery?.primaryImageAssetId === item.assetId);

                    return (
                      <BrandKitGalleryImageTile
                        key={`${category}-${slotIndex}`}
                        item={item}
                        state={visualState}
                        isPrimary={isPrimary}
                        errorMessage={errorMessage}
                        presentationMode={presentationMode}
                        isRegenerating={isGeneratingSlot}
                        disabled={isGeneratingAnything || isAnalyzingGalleryBriefs || !canGenerate}
                        onView={imageUrl ? () => openImage(imageUrl) : undefined}
                        onApprove={() => handleApprove(category, slotIndex)}
                        onRegenerate={
                          onGenerateGallerySlot
                            ? () => onGenerateGallerySlot(category, slotIndex)
                            : undefined
                        }
                        onDiscard={() => handleDiscard(category, slotIndex)}
                        onSetPrimary={item?.assetId ? () => handleSetPrimary(item.assetId) : undefined}
                        onDownload={imageUrl ? () => handleDownload(imageUrl) : undefined}
                        onRetry={
                          onGenerateGallerySlot
                            ? () => onGenerateGallerySlot(category, slotIndex)
                            : undefined
                        }
                      />
                    );
                  })}
                </div>

                {!presentationMode && isGeneratingCategory && progressForCard ? (
                  <div className="brandKit-gallery-library__progress" role="status" aria-live="polite">
                    <div className="brandKit-gallery-library__progress-bar">
                      <div
                        className="brandKit-gallery-library__progress-fill"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <p className="brandKit-gallery-library__progress-meta">
                      {progressForCard.index}/{progressForCard.total}
                    </p>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        <BrandKitGalleryBriefSheet open={Boolean(briefSheet)} briefing={briefSheet} onClose={() => setBriefSheet(null)} />
      </div>
    );
  }

  const galleryPrimaryAction =
    !presentationMode && onGenerateAllGallery ? (
      <BrandKitFoldderButton
        variant="primary"
        compact
        icon={RefreshCw}
        className={isGeneratingAll ? "is-spinning" : ""}
        onClick={(event) => {
          event.stopPropagation();
          onGenerateAllGallery();
        }}
        disabled={isGeneratingAnything || isAnalyzingGalleryBriefs || !canGenerateAll}
        aria-busy={isGeneratingAll}
      >
        {isGeneratingAll ? brandKitLocaleEs.generatingGallery : brandKitLocaleEs.generateAllGalleryImages}
      </BrandKitFoldderButton>
    ) : null;

  return (
    <DnaBlock
      slotId={slotId}
      slot={slot}
      onAction={onAction}
      className="brandKit-v2-block--gallery brandKit-v2-block--bento-gallery"
      activeSlotId={activeSlotId}
      primaryAction={galleryPrimaryAction}
    >
      {body}
    </DnaBlock>
  );
}
