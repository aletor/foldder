"use client";

import React, { useState } from "react";
import type { GalleryValue, SlotAction, SlotId, SlotState, VisualWorldValue } from "@/lib/genoma/genoma-types";
import { galleryUsefulCount } from "@/lib/genoma/genoma-gallery-filter";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { DnaBlock } from "../DnaBlock";
import { GenomaIconButton } from "../GenomaIconButton";
import { GenomaRichText } from "../GenomaRichText";
import { GenomaTextEditPanel } from "../GenomaTextEditPanel";
import { GenomaCapsuleList } from "../GenomaCapsuleList";
import { GenomaSemanticCandidates } from "../GenomaSemanticCandidates";
import { GenomaSlotReviewCard } from "../GenomaSlotReviewCard";
import { GenomaSupplementalPanel } from "../GenomaSupplementalPanel";
import { EvidenceList, SemanticDetailPanels } from "../SemanticExpandable";
import { Pencil } from "lucide-react";

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
}: {
  slot: SlotState<unknown>;
  slotId: SlotId;
  onAction: (slotId: SlotId, action: SlotAction) => void;
  gallery?: SlotState<unknown>;
  activeSlotId?: SlotId;
}) {
  const visualWorld = slot.value as VisualWorldValue | undefined;
  const galleryValue = gallery?.value as GalleryValue | undefined;
  const usefulCount = galleryUsefulCount(galleryValue);
  const [editing, setEditing] = useState(false);
  let body: React.ReactNode;

  const canEdit = Boolean(visualWorld?.summary && slot.status === "resolved" && !slot.locked);
  const editButton = canEdit ? (
    <GenomaIconButton icon={Pencil} label={genomaLocaleEs.edit} onClick={() => setEditing(true)} />
  ) : null;

  const beginEditFromDraft = () => {
    if (slot.status === "candidates" && slot.candidates.length === 1) {
      onAction(slotId, { action: "choose_candidate", candidateIndex: 0 });
    }
    setEditing(true);
  };

  if (slot.status === "pending") {
    body = <div className="genoma-v2-skeleton" aria-hidden />;
  } else if (editing && visualWorld) {
    body = (
      <GenomaTextEditPanel
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
            label: genomaLocaleEs.visualTerritory,
            value: (visualWorld.visualTraits ?? []).join("\n"),
            multiline: true,
          },
          { id: "limits", label: genomaLocaleEs.limits, value: (visualWorld.limits ?? []).join("\n"), multiline: true },
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
      <div className="genoma-v2-stack">
        <GenomaSemanticCandidates
          slotId={slotId}
          slot={slot}
          onAction={onAction}
          onEdit={beginEditFromDraft}
        />
      </div>
    );
  } else if (slot.status === "resolved" && slot.needsReviewReason && visualWorld?.summary) {
    body = (
      <GenomaSlotReviewCard
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
      <p className="genoma-v2-muted">
        {usefulCount >= 6 ? genomaLocaleEs.noVisualWorldSynthesis : genomaLocaleEs.noVisualWorld}
      </p>
    );
  } else {
    const moodChips = visualWorld.moodTags?.slice(0, 4).map((tag) => (
      <span key={tag} className="genoma-v2-chip">
        {tag}
      </span>
    ));

    body = (
      <SemanticDetailPanels
        summary={<GenomaRichText text={visualWorld.summary} className="genoma-v2-prose" as="p" />}
        chips={moodChips}
        panels={[
          {
            id: "traits",
            label: genomaLocaleEs.visualTerritory,
            count: visualWorld.visualTraits?.length,
            content: visualWorld.visualTraits?.length ? (
              <GenomaCapsuleList items={visualWorld.visualTraits} />
            ) : null,
          },
          {
            id: "limits",
            label: genomaLocaleEs.limits,
            count: visualWorld.limits?.length,
            content: visualWorld.limits?.length ? <GenomaCapsuleList items={visualWorld.limits} /> : null,
          },
          {
            id: "evidence",
            label: genomaLocaleEs.evidence,
            count: visualWorld.evidence?.length,
            content: (
              <EvidenceList quotes={visualWorld.evidence?.map((item) => item.quote) ?? []} hideLabel />
            ),
          },
        ]}
        footer={
          <>
            {usefulCount > 0 ? (
              <p className="genoma-v2-muted">
                {genomaLocaleEs.fedByGallery} {usefulCount} {genomaLocaleEs.images}
              </p>
            ) : null}
            <GenomaSupplementalPanel slot={slot} />
          </>
        }
      />
    );
  }

  return (
    <DnaBlock label={genomaLocaleEs.visualWorld} slotId={slotId} slot={slot} onAction={onAction} secondaryActions={editButton} activeSlotId={activeSlotId}>
      {body}
    </DnaBlock>
  );
}
