"use client";

import React, { useState } from "react";
import type { SlotAction, SlotId, SlotState, VoiceValue } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { DnaBlock } from "../DnaBlock";
import { BrandKitFoldderButton } from "../BrandKitFoldderButton";
import { BrandKitRichText } from "../BrandKitRichText";
import { BrandKitIconButton } from "../BrandKitIconButton";
import { BrandKitTextEditPanel } from "../BrandKitTextEditPanel";
import { BrandKitCapsuleList } from "../BrandKitCapsuleList";
import { BrandKitSemanticCandidates } from "../BrandKitSemanticCandidates";
import { BrandKitSlotReviewCard } from "../BrandKitSlotReviewCard";
import { BrandKitSupplementalPanel } from "../BrandKitSupplementalPanel";
import { EvidenceList, SemanticDetailPanels } from "../SemanticExpandable";
import { Pencil, Save } from "lucide-react";
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

export function VoiceBlock({
  slot,
  slotId,
  onAction,
  activeSlotId,
  motion,
}: {
  slot: SlotState<unknown>;
  slotId: SlotId;
  onAction: (slotId: SlotId, action: SlotAction) => void;
  activeSlotId?: SlotId;
} & BrandKitBlockMotionProps) {
  const voice = slot.value as VoiceValue | undefined;
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  let body: React.ReactNode;
  let primaryAction: React.ReactNode;

  const canEdit = Boolean(voice?.summary && slot.status === "resolved" && !slot.locked);
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
    body = <BrandKitBlockSkeleton variant="voice" />;
  } else if (shouldShowLegacyPendingSkeleton(motion, slot.status)) {
    body = <div className="brandKit-v2-skeleton" aria-hidden />;
  } else if (editing && voice) {
    body = (
      <BrandKitTextEditPanel
        fields={[
          { id: "summary", label: "Resumen", value: voice.summary, multiline: true },
          {
            id: "descriptors",
            label: "Descriptores",
            value: voice.descriptors.join(", "),
            multiline: true,
          },
          { id: "rules", label: brandKitLocaleEs.writingRules, value: voice.rules.join("\n"), multiline: true },
          { id: "avoid", label: "Evitar", value: (voice.avoid ?? []).join("\n"), multiline: true },
        ]}
        onSave={(values) => {
          onAction(slotId, {
            action: "set",
            value: {
              ...voice,
              summary: values.summary.trim(),
              descriptors: values.descriptors
                .split(/[,\n]/)
                .map((item) => item.trim())
                .filter(Boolean),
              rules: linesToList(values.rules),
              avoid: linesToList(values.avoid),
            } satisfies VoiceValue,
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
  } else if (slot.status === "resolved" && slot.needsReviewReason && voice?.summary) {
    body = (
      <BrandKitSlotReviewCard
        slotId={slotId}
        candidate={{
          value: voice,
          score: slot.confidence,
          provenance: slot.provenance ?? { type: "llm_synthesis", detail: "revisión" },
        }}
        reviewReason={slot.needsReviewReason}
        onAction={onAction}
        onEdit={beginEditFromDraft}
        confirmMode="lock"
      />
    );
  } else if (slot.status === "needs_user" || !voice?.summary) {
    body = (
      <input
        className="brandKit-v2-inline-input"
        value={draft}
        placeholder="Pega 3 frases que suenen a la marca"
        onChange={(event) => setDraft(event.target.value)}
      />
    );
    primaryAction = (
      <BrandKitFoldderButton
        icon={Save}
        onClick={() => {
          const trimmed = draft.trim();
          const summary =
            trimmed.length > 0
              ? trimmed.length > 200
                ? `${trimmed.slice(0, 197)}…`
                : trimmed
              : brandKitLocaleEs.voiceManualSummaryFallback;
          onAction(slotId, {
            action: "set",
            value: {
              summary,
              descriptors: ["directo", "cercano", "claro"],
              rules: ["Usar frases cortas", "Mantener tono conversacional", "Evitar jerga vacía"],
              avoid: [],
              evidence: draft
                .split(/[.!?]\s+/)
                .filter(Boolean)
                .slice(0, 3)
                .map((quote) => ({ quote })),
            } satisfies VoiceValue,
          });
        }}
      >
        Guardar voz
      </BrandKitFoldderButton>
    );
  } else {
    const descriptorChips = voice.descriptors.slice(0, 3).map((descriptor) => (
      <span key={descriptor} className="brandKit-v2-chip">
        {descriptor}
      </span>
    ));

    body = (
      <SemanticDetailPanels
        summary={
          <BrandKitRichText
            text={voice.summary}
            className="brandKit-v2-prose"
            as="p"
            emphasizeTerms={voice.descriptors}
          />
        }
        chips={
          voice.descriptors.length ? (
            <BrandKitEvidenceTrigger
              id={`voice-descriptors-${slotId}`}
              slot={slot}
              slotId={slotId}
              onAction={onAction}
              onCorrect={() => setEditing(true)}
            >
              <>{descriptorChips}</>
            </BrandKitEvidenceTrigger>
          ) : null
        }
        panels={[
          {
            id: "rules",
            label: brandKitLocaleEs.writingRules,
            count: voice.rules.length,
            content: voice.rules.length ? <BrandKitCapsuleList items={voice.rules} /> : null,
          },
          {
            id: "avoid",
            label: brandKitLocaleEs.avoid,
            count: voice.avoid?.length,
            content: voice.avoid?.length ? <BrandKitCapsuleList items={voice.avoid} variant="warn" /> : null,
          },
          {
            id: "evidence",
            label: brandKitLocaleEs.evidence,
            count: voice.evidence.length,
            content: <EvidenceList quotes={voice.evidence.map((item) => item.quote)} hideLabel />,
          },
        ]}
        footer={<BrandKitSupplementalPanel slot={slot} />}
      />
    );
  }

  return (
    <DnaBlock
      label={brandKitLocaleEs.voice}
      slotId={slotId}
      slot={slot}
      onAction={onAction}
      primaryAction={primaryAction}
      secondaryActions={editButton}
      activeSlotId={activeSlotId}
    >
      {body}
    </DnaBlock>
  );
}
