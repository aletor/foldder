"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { GalleryValue, GenomaDocument, SlotAction, SlotId, SlotState } from "@/lib/genoma/genoma-types";
import { galleryItemSourceUrl } from "@/lib/genoma/genoma-gallery-media";
import { buildGalleryToneExplanation } from "@/lib/genoma/genoma-gallery-tone";
import {
  formatGenomaGalleryCostHint,
  GENOMA_GALLERY_GENERATE_IMAGE_COUNT,
} from "@/lib/genoma/genoma-gallery-cost";
import {
  categoryMeta,
  GALLERY_CATEGORY_ORDER,
  groupGeneratedByCategory,
} from "@/lib/genoma/genoma-gallery-plan";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import type { GenomaGalleryGenerateProgress } from "../../genoma-api";
import { DnaBlock } from "../DnaBlock";
import { GenomaFoldderButton } from "../GenomaFoldderButton";
import { GenomaClickableImage } from "../GenomaClickableImage";
import { GenomaVisualRankMeta } from "../GenomaVisualRankMeta";
import { GenomaSupplementalPanel } from "../GenomaSupplementalPanel";
import { RefreshCw, Sparkles } from "lucide-react";
import { GenomaBlockSkeleton } from "../GenomaBlockSkeleton";
import {
  shouldShowAnalyzingSkeleton,
  shouldShowLegacyPendingSkeleton,
  type GenomaBlockMotionProps,
} from "../genoma-block-motion";

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
}: {
  slot: SlotState<unknown>;
  slotId: SlotId;
  doc: GenomaDocument;
  onAction: (slotId: SlotId, action: SlotAction) => void;
  onGenerateGallery?: () => void;
  onRecalibrateGallery?: () => void;
  isGeneratingGallery?: boolean;
  galleryProgress?: GenomaGalleryGenerateProgress | null;
  focusGeneratedTab?: number;
  gallerySuccessMessage?: string | null;
  activeSlotId?: SlotId;
} & GenomaBlockMotionProps) {
  const gallery = slot.value as GalleryValue | undefined;
  const harvested = gallery?.harvested ?? [];
  const rankedHarvested = useMemo(
    () => [...harvested].sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0)),
    [harvested],
  );
  const generated = gallery?.generated ?? [];
  const [harvestedOnlyIncluded, setHarvestedOnlyIncluded] = useState(false);
  const [tab, setTab] = useState<GalleryTab>("generated");
  const tabTouchedRef = React.useRef(false);

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
  const galleryCostHint = formatGenomaGalleryCostHint("es");

  const generateButton = onGenerateGallery ? (
    <div className="genoma-v2-gallery-generate">
      <GenomaFoldderButton icon={Sparkles} onClick={onGenerateGallery} disabled={isGeneratingGallery}>
        {isGeneratingGallery ? genomaLocaleEs.generatingGallery : genomaLocaleEs.generateGallery}
      </GenomaFoldderButton>
      {galleryCostHint && !isGeneratingGallery ? (
        <p className="genoma-v2-muted genoma-v2-gallery-cost-hint">{galleryCostHint}</p>
      ) : null}
    </div>
  ) : null;

  const recalibrateButton =
    generated.length && onRecalibrateGallery ? (
      <div className="genoma-v2-recalibrate-wrap">
        <GenomaFoldderButton icon={RefreshCw} variant="muted" onClick={onRecalibrateGallery} disabled={isGeneratingGallery}>
          {genomaLocaleEs.recalibrate}
        </GenomaFoldderButton>
        <p className="genoma-v2-muted genoma-v2-recalibrate-hint">{genomaLocaleEs.recalibrateHint}</p>
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
    body = <GenomaBlockSkeleton variant="gallery" />;
  } else if (shouldShowLegacyPendingSkeleton(motion, slot.status)) {
    body = <div className="genoma-v2-skeleton genoma-v2-skeleton--wide" aria-hidden />;
  } else {
    body = (
      <div className="genoma-v2-gallery genoma-v2-gallery--bento">
        {gallerySuccessMessage ? <p className="genoma-v2-gallery-success">{gallerySuccessMessage}</p> : null}

        {isGeneratingGallery && galleryProgress ? (
          <div className="genoma-v2-gallery-loading" role="status" aria-live="polite">
            <div className="genoma-v2-gallery-loading__bar">
              <div className="genoma-v2-gallery-loading__fill" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="genoma-v2-gallery-loading__message">{galleryProgress.message}</p>
            <p className="genoma-v2-muted genoma-v2-gallery-loading__meta">
              {galleryProgress.index}/{galleryProgress.total || GENOMA_GALLERY_GENERATE_IMAGE_COUNT}
              {galleryProgress.categoryLabel ? ` · ${galleryProgress.categoryLabel}` : ""}
            </p>
          </div>
        ) : null}

        <div className="genoma-v2-tabs genoma-v2-tabs--compact" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "generated"}
            className={`genoma-v2-tab${tab === "generated" ? " is-active" : ""}`}
            onClick={() => selectTab("generated")}
          >
            {genomaLocaleEs.generated}
            {generated.length ? <span className="genoma-v2-tab__count">{generated.length}</span> : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "harvested"}
            className={`genoma-v2-tab${tab === "harvested" ? " is-active" : ""}`}
            onClick={() => selectTab("harvested")}
          >
            {genomaLocaleEs.harvested}
            {harvested.length ? <span className="genoma-v2-tab__count">{harvested.length}</span> : null}
          </button>
        </div>

        {tab === "generated" ? (
          <div className="genoma-v2-generated-panel">
            <div className="genoma-v2-gallery-tone">
              <p className="genoma-v2-gallery-tone__label">{genomaLocaleEs.galleryToneLabel}</p>
              <p className="genoma-v2-gallery-tone__text">{toneExplanation}</p>
            </div>

            {generated.length || isGeneratingGallery ? (
              <div className="genoma-v2-generated-matrix">
                {GALLERY_CATEGORY_ORDER.map((category) => {
                  const meta = categoryMeta(category);
                  const items = grouped[category];
                  const slots = [items[0], items[1]];
                  return (
                    <section key={category} className="genoma-v2-generated-category">
                      <header className="genoma-v2-generated-category__head">
                        <span className="genoma-v2-generated-category__label">{meta.label}</span>
                        <span className="genoma-v2-generated-category__hint">{meta.hint}</span>
                      </header>
                      <div className="genoma-v2-generated-category__imgs">
                        {slots.map((item, slotIndex) => {
                          const globalSlotIndex = GALLERY_CATEGORY_ORDER.indexOf(category) * 2 + slotIndex;
                          const showLoading =
                            isGeneratingGallery && !item && globalSlotIndex === generated.length;
                          return (
                            <div key={`${category}-${slotIndex}`} className="genoma-v2-generated-slot">
                              {item?.previewUrl ? (
                                <div className="genoma-v2-gallery-generated">
                                  <GenomaClickableImage src={item.previewUrl} fit="cover" eager />
                                  <div className="genoma-v2-gallery-verdicts">
                                    <button
                                      type="button"
                                      className={`genoma-v2-btn genoma-v2-btn--ghost${item.verdict === "up" ? " is-active" : ""}`}
                                      aria-label={genomaLocaleEs.galleryVerdictUp}
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
                                      <span className="genoma-v2-gallery-verdict-label">{genomaLocaleEs.galleryVerdictUp}</span>
                                    </button>
                                    <button
                                      type="button"
                                      className={`genoma-v2-btn genoma-v2-btn--ghost${item.verdict === "down" ? " is-active" : ""}`}
                                      aria-label={genomaLocaleEs.galleryVerdictDown}
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
                                      <span className="genoma-v2-gallery-verdict-label">{genomaLocaleEs.galleryVerdictDown}</span>
                                    </button>
                                  </div>
                                </div>
                              ) : showLoading ? (
                                <div className="genoma-v2-generated-slot__loading" aria-hidden />
                              ) : (
                                <div className="genoma-v2-generated-slot__empty" aria-hidden />
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
              <div className="genoma-v2-generated-empty">
                <p className="genoma-v2-muted">{genomaLocaleEs.galleryGeneratedEmpty}</p>
                {harvested.length ? (
                  <p className="genoma-v2-muted genoma-v2-gallery-harvested-hint">
                    {genomaLocaleEs.galleryHarvestedHint(harvested.length)}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <div className="genoma-v2-harvested-strip">
            {harvested.length > 0 ? (
              <label className="genoma-v2-harvested-filter">
                <input
                  type="checkbox"
                  checked={harvestedOnlyIncluded}
                  onChange={(event) => setHarvestedOnlyIncluded(event.target.checked)}
                />
                <span>
                  {genomaLocaleEs.galleryHarvestedOnlyIncluded}
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
                  className={`genoma-v2-gallery-item-wrap${item.included ? "" : " is-excluded"}`}
                  style={{ ["--genoma-stagger-i" as string]: index }}
                >
                  {previewSrc ? (
                    <div className="genoma-v2-gallery-thumb">
                      <GenomaClickableImage src={previewSrc} fit="cover" eager />
                    </div>
                  ) : null}
                  <GenomaVisualRankMeta score={item.rankScore} rankSignals={item.rankSignals} />
                  <button
                    type="button"
                    className="genoma-v2-gallery-item-toggle"
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
              <p className="genoma-v2-muted">
                {harvestedOnlyIncluded && harvested.length > 0
                  ? "Ninguna imagen marcada como incluida."
                  : "Sin imágenes cosechadas."}
              </p>
            )}
            <GenomaSupplementalPanel slot={slot} />
          </div>
        )}
      </div>
    );
  }

  return (
    <DnaBlock
      label={genomaLocaleEs.gallery}
      slotId={slotId}
      slot={slot}
      onAction={onAction}
      className="genoma-v2-block--gallery genoma-v2-block--bento-gallery"
      primaryAction={primaryAction}
      activeSlotId={activeSlotId}
    >
      {body}
    </DnaBlock>
  );
}
