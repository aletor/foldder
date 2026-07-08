"use client";

/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useMemo, useState } from "react";
import type { GalleryValue, GenomaDocument, SlotAction, SlotId, SlotState } from "@/lib/genoma/genoma-types";
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
}) {
  const gallery = slot.value as GalleryValue | undefined;
  const [tab, setTab] = useState<GalleryTab>("generated");
  const harvested = gallery?.harvested ?? [];
  const generated = gallery?.generated ?? [];

  useEffect(() => {
    if (focusGeneratedTab && focusGeneratedTab > 0) {
      setTab("generated");
    }
  }, [focusGeneratedTab]);

  const toneExplanation = useMemo(() => {
    if (gallery?.styleToneExplanation?.trim()) return gallery.styleToneExplanation;
    if (galleryProgress?.toneExplanation?.trim()) return galleryProgress.toneExplanation;
    return buildGalleryToneExplanation(doc, doc.compiled?.stylePrompt);
  }, [gallery?.styleToneExplanation, galleryProgress?.toneExplanation, doc]);

  const grouped = useMemo(() => groupGeneratedByCategory(generated), [generated]);
  const galleryCostHint = formatGenomaGalleryCostHint("es");

  const generateButton = onGenerateGallery ? (
    <div className="genoma-v2-gallery-generate">
      <button type="button" className="genoma-v2-btn" onClick={onGenerateGallery} disabled={isGeneratingGallery}>
        {isGeneratingGallery ? genomaLocaleEs.generatingGallery : genomaLocaleEs.generateGallery}
      </button>
      {galleryCostHint && !isGeneratingGallery ? (
        <p className="genoma-v2-muted genoma-v2-gallery-cost-hint">{galleryCostHint}</p>
      ) : null}
    </div>
  ) : null;

  const recalibrateButton =
    generated.length && onRecalibrateGallery ? (
      <button
        type="button"
        className="genoma-v2-btn genoma-v2-btn--ghost"
        onClick={onRecalibrateGallery}
        disabled={isGeneratingGallery}
      >
        {genomaLocaleEs.recalibrate}
      </button>
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

  if (slot.status === "pending") {
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
            onClick={() => setTab("generated")}
          >
            {genomaLocaleEs.generated}
            {generated.length ? <span className="genoma-v2-tab__count">{generated.length}</span> : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "harvested"}
            className={`genoma-v2-tab${tab === "harvested" ? " is-active" : ""}`}
            onClick={() => setTab("harvested")}
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
                                  <img src={item.previewUrl} alt="" draggable={false} />
                                  <div className="genoma-v2-gallery-verdicts">
                                    <button
                                      type="button"
                                      className={`genoma-v2-btn genoma-v2-btn--ghost${item.verdict === "up" ? " is-active" : ""}`}
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
                                      ✓
                                    </button>
                                    <button
                                      type="button"
                                      className={`genoma-v2-btn genoma-v2-btn--ghost${item.verdict === "down" ? " is-active" : ""}`}
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
                                      ✗
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
              <p className="genoma-v2-muted">{genomaLocaleEs.galleryGeneratedEmpty}</p>
            )}
          </div>
        ) : (
          <div className="genoma-v2-harvested-strip">
            {harvested.length ? (
              harvested.map((item) => (
                <button
                  key={item.assetId}
                  type="button"
                  className={`genoma-v2-gallery-item${item.included ? "" : " is-excluded"}`}
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
                  {item.previewUrl ? <img src={item.previewUrl} alt="" draggable={false} /> : null}
                </button>
              ))
            ) : (
              <p className="genoma-v2-muted">Sin imágenes cosechadas.</p>
            )}
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
    >
      {body}
    </DnaBlock>
  );
}
