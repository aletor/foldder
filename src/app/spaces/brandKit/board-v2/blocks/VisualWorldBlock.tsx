"use client";

import React, { useMemo, useState } from "react";
import type { GalleryValue, SlotAction, SlotId, SlotState, VisualWorldValue } from "@/lib/brandkit/brand-kit-types";
import { galleryItemSourceUrl } from "@/lib/brandkit/brand-kit-gallery-media";
import { galleryIncludedCount } from "@/lib/brandkit/brand-kit-gallery-filter";
import { GALLERY_BRIEF_MIN_INCLUDED_IMAGES } from "@/lib/brandkit/brand-kit-gallery-brief";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { brandImageMediumLabelEs, resolveBrandImageStyle } from "@/lib/brandkit/brand-kit-visual-style";
import { DnaBlock } from "../DnaBlock";
import { BrandKitFoldderButton } from "../BrandKitFoldderButton";
import { BrandKitClickableImage } from "../BrandKitClickableImage";
import { BrandKitRichText } from "../BrandKitRichText";
import { BrandKitTextEditPanel } from "../BrandKitTextEditPanel";
import { BrandKitCapsuleList } from "../BrandKitCapsuleList";
import { BrandKitSemanticCandidates } from "../BrandKitSemanticCandidates";
import { BrandKitSlotReviewCard } from "../BrandKitSlotReviewCard";
import { BrandKitSupplementalPanel } from "../BrandKitSupplementalPanel";
import { EvidenceList, SemanticDetailPanels } from "../SemanticExpandable";
import { Pencil } from "lucide-react";
import { BrandKitBlockSkeleton } from "../BrandKitBlockSkeleton";
import { BrandKitEvidenceTrigger } from "../BrandKitEvidenceTrigger";
import {
  shouldShowAnalyzingSkeleton,
  shouldShowLegacyPendingSkeleton,
  type BrandKitBlockMotionProps,
} from "../brand-kit-block-motion";

function linesToList(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function VisualHarvestStrip({
  gallery,
  onExclude,
}: {
  gallery: GalleryValue | undefined;
  onExclude: (assetId: string) => void;
}) {
  const items = useMemo(
    () =>
      [...(gallery?.harvested ?? [])]
        .filter((item) => item.included !== false)
        .sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0)),
    [gallery?.harvested],
  );

  if (!items.length) return null;

  return (
    <aside className="brandKit-v2-visual-harvest" aria-label="Imágenes extraídas">
      {items.map((item) => {
        const previewSrc = galleryItemSourceUrl(item);
        if (!previewSrc) return null;
        return (
          <div key={item.assetId} className="brandKit-v2-visual-harvest__item">
            <div className="brandKit-v2-visual-harvest__thumb">
              <BrandKitClickableImage src={previewSrc} fit="cover" eager />
            </div>
            <BrandKitFoldderButton variant="white" compact onClick={() => onExclude(item.assetId)}>
              {brandKitLocaleEs.excludeHarvestImage}
            </BrandKitFoldderButton>
          </div>
        );
      })}
    </aside>
  );
}

export function VisualWorldBlock({
  slot,
  slotId,
  onAction,
  gallery,
  activeSlotId,
  motion,
}: {
  slot: SlotState<unknown>;
  slotId: SlotId;
  onAction: (slotId: SlotId, action: SlotAction) => void;
  gallery?: SlotState<unknown>;
  activeSlotId?: SlotId;
} & BrandKitBlockMotionProps) {
  const visualWorld = slot.value as VisualWorldValue | undefined;
  const galleryValue = gallery?.value as GalleryValue | undefined;
  const [editing, setEditing] = useState(false);

  const excludeHarvestImage = (assetId: string) => {
    if (!galleryValue) return;
    onAction("gallery", {
      action: "set",
      value: {
        ...galleryValue,
        harvested: galleryValue.harvested.map((entry) =>
          entry.assetId === assetId ? { ...entry, included: false } : entry,
        ),
      } satisfies GalleryValue,
    });
  };

  let body: React.ReactNode;

  const canEdit = Boolean(visualWorld?.summary && slot.status === "resolved" && !slot.locked);
  const editButton = canEdit ? (
    <BrandKitFoldderButton variant="white" compact icon={Pencil} onClick={() => setEditing(true)}>
      {brandKitLocaleEs.edit}
    </BrandKitFoldderButton>
  ) : null;

  const beginEditFromDraft = () => {
    if (slot.status === "candidates" && slot.candidates.length === 1) {
      onAction(slotId, { action: "choose_candidate", candidateIndex: 0 });
    }
    setEditing(true);
  };

  if (shouldShowAnalyzingSkeleton(motion)) {
    body = <BrandKitBlockSkeleton variant="visualWorld" />;
  } else if (shouldShowLegacyPendingSkeleton(motion, slot.status)) {
    body = <div className="brandKit-v2-skeleton" aria-hidden />;
  } else if (editing && visualWorld) {
    body = (
      <BrandKitTextEditPanel
        fields={[
          { id: "summary", label: "Resumen", value: visualWorld.summary, multiline: true },
          {
            id: "moodTags",
            label: "Mood",
            value: (visualWorld.moodTags ?? []).join(", "),
            multiline: true,
          },
          {
            id: "imageMedium",
            label: brandKitLocaleEs.imageMedium,
            value: visualWorld.imageMedium ?? resolveBrandImageStyle(visualWorld).medium,
          },
          {
            id: "imageStyleTags",
            label: brandKitLocaleEs.imageStyleTags,
            value: (visualWorld.imageStyleTags ?? []).join(", "),
            multiline: true,
          },
          {
            id: "visualTraits",
            label: brandKitLocaleEs.visualTerritory,
            value: (visualWorld.visualTraits ?? []).join("\n"),
            multiline: true,
          },
          { id: "limits", label: brandKitLocaleEs.limits, value: (visualWorld.limits ?? []).join("\n"), multiline: true },
        ]}
        onSave={(values) => {
          onAction(slotId, {
            action: "set",
            value: {
              ...visualWorld,
              summary: values.summary.trim(),
              moodTags: values.moodTags
                .split(/[,\n]/)
                .map((item) => item.trim())
                .filter(Boolean),
              imageMedium: values.imageMedium.trim() || undefined,
              imageStyleTags: values.imageStyleTags
                .split(/[,\n]/)
                .map((item) => item.trim())
                .filter(Boolean),
              visualTraits: linesToList(values.visualTraits),
              limits: linesToList(values.limits),
            } satisfies VisualWorldValue,
          });
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  } else if (slot.status === "candidates") {
    body = (
      <div className="brandKit-v2-stack">
        <BrandKitSemanticCandidates
          slotId={slotId}
          slot={slot}
          onAction={onAction}
          onEdit={beginEditFromDraft}
        />
      </div>
    );
  } else if (slot.status === "resolved" && slot.needsReviewReason && visualWorld?.summary) {
    body = (
      <div className="brandKit-v2-visual-layout">
        <div className="brandKit-v2-visual-layout__copy">
          <BrandKitSlotReviewCard
            slotId={slotId}
            candidate={{
              value: visualWorld,
              score: slot.confidence,
              provenance: slot.provenance ?? { type: "llm_synthesis", detail: "revisión" },
            }}
            reviewReason={slot.needsReviewReason}
            onAction={onAction}
            onEdit={beginEditFromDraft}
            confirmMode="lock"
          />
        </div>
        <VisualHarvestStrip gallery={galleryValue} onExclude={excludeHarvestImage} />
      </div>
    );
  } else if (!visualWorld?.summary) {
    body = (
      <div className="brandKit-v2-visual-layout">
        <p className="brandKit-v2-muted brandKit-v2-visual-layout__copy">
          {galleryIncludedCount(galleryValue) >= GALLERY_BRIEF_MIN_INCLUDED_IMAGES
            ? brandKitLocaleEs.noVisualWorldSynthesis
            : brandKitLocaleEs.noVisualWorld}
        </p>
        <VisualHarvestStrip gallery={galleryValue} onExclude={excludeHarvestImage} />
      </div>
    );
  } else {
    const moodChips = visualWorld.moodTags?.slice(0, 4).map((tag) => (
      <span key={tag} className="brandKit-v2-chip">
        {tag}
      </span>
    ));
    const { medium, styleTags } = resolveBrandImageStyle(visualWorld);
    const styleChips = [
      <span key="medium" className="brandKit-v2-chip">
        {brandImageMediumLabelEs(medium)}
      </span>,
      ...styleTags.slice(0, 3).map((tag) => (
        <span key={tag} className="brandKit-v2-chip">
          {tag}
        </span>
      )),
    ];

    body = (
      <div className="brandKit-v2-visual-layout">
        <div className="brandKit-v2-visual-layout__copy">
          <SemanticDetailPanels
            summary={<BrandKitRichText text={visualWorld.summary} className="brandKit-v2-prose" as="p" />}
            chips={
              visualWorld.moodTags?.length || medium ? (
                <BrandKitEvidenceTrigger
                  id={`visual-mood-${slotId}`}
                  slot={slot}
                  slotId={slotId}
                  onAction={onAction}
                  onCorrect={() => setEditing(true)}
                >
                  <>
                    {styleChips}
                    {moodChips}
                  </>
                </BrandKitEvidenceTrigger>
              ) : null
            }
            panels={[
              {
                id: "traits",
                label: brandKitLocaleEs.visualTerritory,
                count: visualWorld.visualTraits?.length,
                content: visualWorld.visualTraits?.length ? (
                  <BrandKitCapsuleList items={visualWorld.visualTraits} />
                ) : null,
              },
              {
                id: "limits",
                label: brandKitLocaleEs.limits,
                count: visualWorld.limits?.length,
                content: visualWorld.limits?.length ? <BrandKitCapsuleList items={visualWorld.limits} /> : null,
              },
              {
                id: "evidence",
                label: brandKitLocaleEs.evidence,
                count: visualWorld.evidence?.length,
                content: (
                  <EvidenceList quotes={visualWorld.evidence?.map((item) => item.quote) ?? []} hideLabel />
                ),
              },
            ]}
            footer={<BrandKitSupplementalPanel slot={slot} />}
          />
        </div>
        <VisualHarvestStrip gallery={galleryValue} onExclude={excludeHarvestImage} />
      </div>
    );
  }

  return (
    <DnaBlock label={brandKitLocaleEs.visualWorld} slotId={slotId} slot={slot} onAction={onAction} secondaryActions={editButton} activeSlotId={activeSlotId}>
      {body}
    </DnaBlock>
  );
}
