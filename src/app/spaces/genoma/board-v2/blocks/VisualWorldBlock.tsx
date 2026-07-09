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
}: {
  slot: SlotState<unknown>;
  slotId: SlotId;
  onAction: (slotId: SlotId, action: SlotAction) => void;
  gallery?: SlotState<unknown>;
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
        {slot.candidates.map((candidate, index) => {
          const value = candidate.value as VisualWorldValue;
          return (
            <button
              key={index}
              type="button"
              className="genoma-v2-btn genoma-v2-btn--ghost text-left"
              onClick={() => onAction(slotId, { action: "choose_candidate", candidateIndex: index })}
            >
              <span className="genoma-v2-semantic__summary">{value.summary}</span>
              {value.limits?.length ? (
                <ul className="genoma-v2-rules genoma-v2-rules--preview">
                  {value.limits.slice(0, 2).map((limit) => (
                    <li key={limit}>{limit}</li>
                  ))}
                </ul>
              ) : null}
            </button>
          );
        })}
      </div>
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
          usefulCount > 0 ? (
            <p className="genoma-v2-muted">
              {genomaLocaleEs.fedByGallery} {usefulCount} {genomaLocaleEs.images}
            </p>
          ) : null
        }
      />
    );
  }

  return (
    <DnaBlock label={genomaLocaleEs.visualWorld} slotId={slotId} slot={slot} onAction={onAction} secondaryActions={editButton}>
      {body}
    </DnaBlock>
  );
}
