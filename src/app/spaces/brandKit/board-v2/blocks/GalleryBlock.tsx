"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { GalleryValue, BrandKitDocument, SlotAction, SlotId, SlotState } from "@/lib/brandkit/brand-kit-types";
import { galleryItemSourceUrl } from "@/lib/brandkit/brand-kit-gallery-media";
import { buildGalleryToneExplanation } from "@/lib/brandkit/brand-kit-gallery-tone";
import {
  formatBrandKitGalleryCostHint,
  BRAND_KIT_GALLERY_GENERATE_IMAGE_COUNT,
} from "@/lib/brandkit/brand-kit-gallery-cost";
import {
  categoryMeta,
  GALLERY_CATEGORY_ORDER,
  groupGeneratedByCategory,
} from "@/lib/brandkit/brand-kit-gallery-plan";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import type { BrandKitGalleryGenerateProgress } from "../../brand-kit-api";
import { DnaBlock } from "../DnaBlock";
import { BrandKitFoldderButton } from "../BrandKitFoldderButton";
import { BrandKitClickableImage } from "../BrandKitClickableImage";
import { BrandKitVisualRankMeta } from "../BrandKitVisualRankMeta";
import { BrandKitSupplementalPanel } from "../BrandKitSupplementalPanel";
import { RefreshCw, Sparkles } from "lucide-react";
import { BrandKitBlockSkeleton } from "../BrandKitBlockSkeleton";
import {
  shouldShowAnalyzingSkeleton,
  shouldShowLegacyPendingSkeleton,
  type BrandKitBlockMotionProps,
} from "../brand-kit-block-motion";

type GalleryTab = "harvested" | "generated";

export function GalleryBlock({
  slot,
  slotId,
  doc,
  onAction,
  onGenerateGallery,
  onRecalibrateGallery,
  isGeneratingGallery = false,
  galleryProgress = null,
  focusGeneratedTab,
  gallerySuccessMessage,
  activeSlotId,
  motion,
  brandReady = false,
}: {
  slot: SlotState<unknown>;
  slotId: SlotId;
  doc: BrandKitDocument;
  onAction: (slotId: SlotId, action: SlotAction) => void;
  onGenerateGallery?: () => void;
  onRecalibrateGallery?: () => void;
  isGeneratingGallery?: boolean;
  galleryProgress?: BrandKitGalleryGenerateProgress | null;
  focusGeneratedTab?: number;
  gallerySuccessMessage?: string | null;
  activeSlotId?: SlotId;
  brandReady?: boolean;
} & BrandKitBlockMotionProps) {
  const gallery = slot.value as GalleryValue | undefined;
  const harvested = gallery?.harvested ?? [];
  const rankedHarvested = useMemo(
    () => [...harvested].sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0)),
    [harvested],
  );
  const generated = gallery?.generated ?? [];
  const [harvestedOnlyIncluded, setHarvestedOnlyIncluded] = useState(false);
  const [tab, setTab] = useState<GalleryTab>("generated");
  const [harvestedView, setHarvestedView] = useState<"original" | "duotone">(() =>
    brandReady ? "duotone" : "original",
  );
  const tabTouchedRef = React.useRef(false);

  useEffect(() => {
    if (!brandReady) setHarvestedView("original");
  }, [brandReady]);

  useEffect(() => {
    if (focusGeneratedTab && focusGeneratedTab > 0) {
      setTab("generated");
      tabTouchedRef.current = true;
    }
  }, [focusGeneratedTab]);

  useEffect(() => {
    if (tabTouchedRef.current) return;
    if (generated.length > 0) setTab("generated");
    else if (harvested.length > 0) setTab("harvested");
  }, [generated.length, harvested.length]);

  const selectTab = (next: GalleryTab) => {
    tabTouchedRef.current = true;
    setTab(next);
  };

  const toneExplanation = useMemo(() => {
    if (gallery?.styleToneExplanation?.trim()) return gallery.styleToneExplanation;
    if (galleryProgress?.toneExplanation?.trim()) return galleryProgress.toneExplanation;
    return buildGalleryToneExplanation(doc, doc.compiled?.stylePrompt);
  }, [gallery?.styleToneExplanation, galleryProgress?.toneExplanation, doc]);

  const grouped = useMemo(() => groupGeneratedByCategory(generated), [generated]);
  const displayedHarvested = useMemo(
    () => (harvestedOnlyIncluded ? rankedHarvested.filter((item) => item.included) : rankedHarvested),
    [harvestedOnlyIncluded, rankedHarvested],
  );
  const includedCount = useMemo(() => harvested.filter((item) => item.included).length, [harvested]);
  const galleryCostHint = formatBrandKitGalleryCostHint("es");
  const duotoneActive = brandReady && harvestedView === "duotone";

  const viewToggle = (
    <div className="brandKit-gallery-view-toggle" role="group" aria-label="Vista de galería cosechada">
      <button
        type="button"
        className={`brandKit-gallery-view-toggle__btn${harvestedView === "original" ? " is-active" : ""}`}
        onClick={() => setHarvestedView("original")}
      >
        Original
      </button>
      <button
        type="button"
        className={`brandKit-gallery-view-toggle__btn${harvestedView === "duotone" ? " is-active" : ""}`}
        onClick={() => setHarvestedView("duotone")}
        disabled={!brandReady}
      >
        Duotono
      </button>
    </div>
  );

  const generateButton = onGenerateGallery ? (
    <div className="brandKit-v2-gallery-generate">
      <BrandKitFoldderButton icon={Sparkles} onClick={onGenerateGallery} disabled={isGeneratingGallery}>
        {isGeneratingGallery ? brandKitLocaleEs.generatingGallery : brandKitLocaleEs.generateGallery}
      </BrandKitFoldderButton>
      {galleryCostHint && !isGeneratingGallery ? (
        <p className="brandKit-v2-muted brandKit-v2-gallery-cost-hint">{galleryCostHint}</p>
      ) : null}
    </div>
  ) : null;

  const recalibrateButton =
    generated.length && onRecalibrateGallery ? (
      <div className="brandKit-v2-recalibrate-wrap">
        <BrandKitFoldderButton icon={RefreshCw} variant="muted" onClick={onRecalibrateGallery} disabled={isGeneratingGallery}>
          {brandKitLocaleEs.recalibrate}
        </BrandKitFoldderButton>
        <p className="brandKit-v2-muted brandKit-v2-recalibrate-hint">{brandKitLocaleEs.recalibrateHint}</p>
      </div>
    ) : null;

  const progressPct =
    galleryProgress && galleryProgress.total > 0
      ? Math.round((galleryProgress.index / galleryProgress.total) * 100)
      : 0;

  let body: React.ReactNode;
  let primaryAction: React.ReactNode = (
    <>
      {generateButton}
      {recalibrateButton}
    </>
  );

  if (shouldShowAnalyzingSkeleton(motion)) {
    body = <BrandKitBlockSkeleton variant="gallery" />;
  } else if (shouldShowLegacyPendingSkeleton(motion, slot.status)) {
    body = <div className="brandKit-v2-skeleton brandKit-v2-skeleton--wide" aria-hidden />;
  } else {
    body = (
      <div className="brandKit-v2-gallery brandKit-v2-gallery--bento">
        {gallerySuccessMessage ? <p className="brandKit-v2-gallery-success">{gallerySuccessMessage}</p> : null}

        {isGeneratingGallery && galleryProgress ? (
          <div className="brandKit-v2-gallery-loading" role="status" aria-live="polite">
            <div className="brandKit-v2-gallery-loading__bar">
              <div className="brandKit-v2-gallery-loading__fill" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="brandKit-v2-gallery-loading__message">{galleryProgress.message}</p>
            <p className="brandKit-v2-muted brandKit-v2-gallery-loading__meta">
              {galleryProgress.index}/{galleryProgress.total || BRAND_KIT_GALLERY_GENERATE_IMAGE_COUNT}
              {galleryProgress.categoryLabel ? ` · ${galleryProgress.categoryLabel}` : ""}
            </p>
          </div>
        ) : null}

        <div className="brandKit-v2-tabs brandKit-v2-tabs--compact" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "generated"}
            className={`brandKit-v2-tab${tab === "generated" ? " is-active" : ""}`}
            onClick={() => selectTab("generated")}
          >
            {brandKitLocaleEs.generated}
            {generated.length ? <span className="brandKit-v2-tab__count">{generated.length}</span> : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "harvested"}
            className={`brandKit-v2-tab${tab === "harvested" ? " is-active" : ""}`}
            onClick={() => selectTab("harvested")}
          >
            {brandKitLocaleEs.harvested}
            {harvested.length ? <span className="brandKit-v2-tab__count">{harvested.length}</span> : null}
          </button>
        </div>

        {tab === "generated" ? (
          <div className="brandKit-v2-generated-panel">
            <div className="brandKit-v2-gallery-tone">
              <p className="brandKit-v2-gallery-tone__label">{brandKitLocaleEs.galleryToneLabel}</p>
              <p className="brandKit-v2-gallery-tone__text">{toneExplanation}</p>
            </div>

            {generated.length || isGeneratingGallery ? (
              <div className="brandKit-v2-generated-matrix">
                {GALLERY_CATEGORY_ORDER.map((category) => {
                  const meta = categoryMeta(category);
                  const items = grouped[category];
                  const slots = [items[0], items[1]];
                  return (
                    <section key={category} className="brandKit-v2-generated-category">
                      <header className="brandKit-v2-generated-category__head">
                        <span className="brandKit-v2-generated-category__label">{meta.label}</span>
                        <span className="brandKit-v2-generated-category__hint">{meta.hint}</span>
                      </header>
                      <div className="brandKit-v2-generated-category__imgs">
                        {slots.map((item, slotIndex) => {
                          const globalSlotIndex = GALLERY_CATEGORY_ORDER.indexOf(category) * 2 + slotIndex;
                          const showLoading =
                            isGeneratingGallery && !item && globalSlotIndex === generated.length;
                          return (
                            <div key={`${category}-${slotIndex}`} className="brandKit-v2-generated-slot">
                              {item?.previewUrl ? (
                                <div className="brandKit-v2-gallery-generated">
                                  <BrandKitClickableImage src={item.previewUrl} fit="cover" eager />
                                  <div className="brandKit-v2-gallery-verdicts">
                                    <button
                                      type="button"
                                      className={`brandKit-v2-btn brandKit-v2-btn--ghost${item.verdict === "up" ? " is-active" : ""}`}
                                      aria-label={brandKitLocaleEs.galleryVerdictUp}
                                      onClick={() => {
                                        if (!gallery) return;
                                        onAction(slotId, {
                                          action: "set",
                                          value: {
                                            ...gallery,
                                            generated: gallery.generated.map((entry) =>
                                              entry.assetId === item.assetId
                                                ? { ...entry, verdict: "up" as const }
                                                : entry,
                                            ),
                                          },
                                        });
                                      }}
                                    >
                                      <span aria-hidden>✓</span>
                                      <span className="brandKit-v2-gallery-verdict-label">{brandKitLocaleEs.galleryVerdictUp}</span>
                                    </button>
                                    <button
                                      type="button"
                                      className={`brandKit-v2-btn brandKit-v2-btn--ghost${item.verdict === "down" ? " is-active" : ""}`}
                                      aria-label={brandKitLocaleEs.galleryVerdictDown}
                                      onClick={() => {
                                        if (!gallery) return;
                                        onAction(slotId, {
                                          action: "set",
                                          value: {
                                            ...gallery,
                                            generated: gallery.generated.map((entry) =>
                                              entry.assetId === item.assetId
                                                ? { ...entry, verdict: "down" as const }
                                                : entry,
                                            ),
                                          },
                                        });
                                      }}
                                    >
                                      <span aria-hidden>✗</span>
                                      <span className="brandKit-v2-gallery-verdict-label">{brandKitLocaleEs.galleryVerdictDown}</span>
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
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="brandKit-v2-generated-empty">
                <p className="brandKit-v2-muted">{brandKitLocaleEs.galleryGeneratedEmpty}</p>
                {harvested.length ? (
                  <p className="brandKit-v2-muted brandKit-v2-gallery-harvested-hint">
                    {brandKitLocaleEs.galleryHarvestedHint(harvested.length)}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <div className="brandKit-v2-harvested-strip">
            {harvested.length > 0 ? (
              <label className="brandKit-v2-harvested-filter">
                <input
                  type="checkbox"
                  checked={harvestedOnlyIncluded}
                  onChange={(event) => setHarvestedOnlyIncluded(event.target.checked)}
                />
                <span>
                  {brandKitLocaleEs.galleryHarvestedOnlyIncluded}
                  {includedCount > 0 ? ` (${includedCount})` : ""}
                </span>
              </label>
            ) : null}
            {displayedHarvested.length ? (
              displayedHarvested.map((item, index) => {
                const previewSrc = galleryItemSourceUrl(item);
                return (
                <div
                  key={item.assetId}
                  className={`brandKit-v2-gallery-item-wrap${item.included ? "" : " is-excluded"}`}
                  style={{ ["--brand-kit-stagger-i" as string]: index }}
                >
                  {previewSrc ? (
                    <div
                      className={`brandKit-v2-gallery-thumb${duotoneActive ? " brandKit-v2-gallery-thumb--duotone" : ""}`}
                    >
                      <BrandKitClickableImage src={previewSrc} fit="cover" eager />
                    </div>
                  ) : null}
                  <BrandKitVisualRankMeta score={item.rankScore} rankSignals={item.rankSignals} />
                  <button
                    type="button"
                    className="brandKit-v2-gallery-item-toggle"
                    onClick={() => {
                      if (!gallery) return;
                      onAction(slotId, {
                        action: "set",
                        value: {
                          ...gallery,
                          harvested: gallery.harvested.map((entry) =>
                            entry.assetId === item.assetId ? { ...entry, included: !entry.included } : entry,
                          ),
                        } satisfies GalleryValue,
                      });
                    }}
                  >
                    {item.included ? "Incluida" : "Excluida"}
                  </button>
                </div>
                );
              })
            ) : (
              <p className="brandKit-v2-muted">
                {harvestedOnlyIncluded && harvested.length > 0
                  ? "Ninguna imagen marcada como incluida."
                  : "Sin imágenes cosechadas."}
              </p>
            )}
            <BrandKitSupplementalPanel slot={slot} />
          </div>
        )}
      </div>
    );
  }

  return (
    <DnaBlock
      slotId={slotId}
      slot={slot}
      onAction={onAction}
      className="brandKit-v2-block--gallery brandKit-v2-block--bento-gallery"
      primaryAction={primaryAction}
      activeSlotId={activeSlotId}
      headExtra={viewToggle}
    >
      {body}
    </DnaBlock>
  );
}
