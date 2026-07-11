"use client";

import React, { useState } from "react";
import type { GalleryValue, SlotAction, SlotId, SlotState, VisualWorldValue } from "@/lib/brandkit/brand-kit-types";
import { galleryUsefulCount } from "@/lib/brandkit/brand-kit-gallery-filter";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { DnaBlock } from "../DnaBlock";
import { BrandKitIconButton } from "../BrandKitIconButton";
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
  const usefulCount = galleryUsefulCount(galleryValue);
  const [editing, setEditing] = useState(false);
  let body: React.ReactNode;

  const canEdit = Boolean(visualWorld?.summary && slot.status === "resolved" && !slot.locked);
  const editButton = canEdit ? (
    <BrandKitIconButton icon={Pencil} label={brandKitLocaleEs.edit} onClick={() => setEditing(true)} />
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
    );
  } else if (!visualWorld?.summary) {
    body = (
      <p className="brandKit-v2-muted">
        {usefulCount >= 6 ? brandKitLocaleEs.noVisualWorldSynthesis : brandKitLocaleEs.noVisualWorld}
      </p>
    );
  } else {
    const moodChips = visualWorld.moodTags?.slice(0, 4).map((tag) => (
      <span key={tag} className="brandKit-v2-chip">
        {tag}
      </span>
    ));

    body = (
      <SemanticDetailPanels
        summary={<BrandKitRichText text={visualWorld.summary} className="brandKit-v2-prose" as="p" />}
        chips={
          visualWorld.moodTags?.length ? (
            <BrandKitEvidenceTrigger
              id={`visual-mood-${slotId}`}
              slot={slot}
              slotId={slotId}
              onAction={onAction}
              onCorrect={() => setEditing(true)}
            >
              <>{moodChips}</>
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
        footer={
          <>
            {usefulCount > 0 ? (
              <p className="brandKit-v2-muted">
                {brandKitLocaleEs.fedByGallery} {usefulCount} {brandKitLocaleEs.images}
              </p>
            ) : null}
            <BrandKitSupplementalPanel slot={slot} />
          </>
        }
      />
    );
  }

  return (
    <DnaBlock label={brandKitLocaleEs.visualWorld} slotId={slotId} slot={slot} onAction={onAction} secondaryActions={editButton} activeSlotId={activeSlotId}>
      {body}
    </DnaBlock>
  );
}
