"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SlotAction, SlotId, SlotState } from "@/lib/genoma/genoma-types";
import { confirmLabelForSlot, genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import {
  buildGenomaEvidenceCopy,
  formatConfirmedDate,
} from "@/lib/genoma/genoma-evidence-copy";
import { useGenomaDepthPopoverPosition } from "../use-genoma-depth-popover";
import { useGenomaEvidencePopover } from "./GenomaEvidencePopoverContext";
import { scrollToGenomaBoardSlot } from "./genoma-board-scroll";

export type GenomaEvidencePopoverProps = {
  slot?: SlotState<unknown>;
  slotId?: SlotId;
  provenance?: SlotState<unknown>["provenance"];
  confidence?: number;
  rankSignals?: string[];
  onAction?: (slotId: SlotId, action: SlotAction) => void;
  onCorrect?: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
};

export function GenomaEvidencePopover({
  slot,
  slotId,
  provenance,
  confidence,
  rankSignals,
  onAction,
  onCorrect,
  anchorRef,
  open,
  onClose,
}: GenomaEvidencePopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [expandedSupplemental, setExpandedSupplemental] = useState(false);
  const panelStyle = useGenomaDepthPopoverPosition(anchorRef, open, panelRef);

  useEffect(() => {
    if (!open) setExpandedSupplemental(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const copy = buildGenomaEvidenceCopy({
    provenance: provenance ?? slot?.provenance,
    confidence: confidence ?? slot?.confidence,
    rankSignals: rankSignals ?? slot?.candidates[0]?.rankSignals,
    reconciliation: slot?.reconciliation,
  });

  const locked = Boolean(slot?.locked);
  const supplementalCount = slot?.supplementalEvidence?.length ?? 0;
  const hasCandidates = (slot?.candidates.length ?? 0) > 1;
  const canConfirm = Boolean(slot && slotId && onAction && slot.status === "resolved" && !locked);
  const confirmLabel = slotId ? confirmLabelForSlot[slotId] ?? genomaLocaleEs.confirm : genomaLocaleEs.confirm;

  return createPortal(
    <>
      <button type="button" className="genoma-evidence-popover__backdrop" aria-label="Cerrar" onClick={onClose} />
      <div
        ref={panelRef}
        className="genoma-evidence-popover"
        style={panelStyle}
        role="dialog"
        aria-label="Evidencia"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="genoma-evidence-popover__step">{copy.step}</p>
        <p className="genoma-evidence-popover__confidence">{copy.confidence}</p>
        {copy.signals.length ? (
          <ul className="genoma-evidence-popover__signals">
            {copy.signals.map((signal) => (
              <li key={signal}>{signal}</li>
            ))}
          </ul>
        ) : null}

        {locked ? (
          <div className="genoma-evidence-popover__locked">
            <p>Confirmado por ti · {formatConfirmedDate(slot?.updatedAt)}</p>
            {supplementalCount > 0 ? (
              <>
                <button
                  type="button"
                  className="genoma-evidence-popover__supplemental-toggle"
                  aria-expanded={expandedSupplemental}
                  onClick={() => setExpandedSupplemental((value) => !value)}
                >
                  {supplementalCount} evidencia{supplementalCount === 1 ? "" : "s"} nueva
                  {supplementalCount === 1 ? "" : "s"} guardada{supplementalCount === 1 ? "" : "s"} desde entonces
                </button>
                {expandedSupplemental ? (
                  <ul className="genoma-evidence-popover__supplemental-list">
                    {slot?.supplementalEvidence?.map((entry, index) => (
                      <li key={`${entry.ts}-${index}`}>{entry.quote}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        <footer className="genoma-evidence-popover__actions">
          {canConfirm ? (
            <button
              type="button"
              className="genoma-evidence-popover__action genoma-evidence-popover__action--primary"
              onClick={() => {
                onAction?.(slotId!, { action: "lock" });
                onClose();
              }}
            >
              {confirmLabel}
            </button>
          ) : null}
          {hasCandidates && slotId ? (
            <button
              type="button"
              className="genoma-evidence-popover__action"
              onClick={() => {
                scrollToGenomaBoardSlot(slotId);
                onClose();
              }}
            >
              Ver propuestas
            </button>
          ) : null}
          {onCorrect ? (
            <button type="button" className="genoma-evidence-popover__action" onClick={() => {
              onCorrect();
              onClose();
            }}>
              Corregir
            </button>
          ) : null}
        </footer>
      </div>
    </>,
    document.body,
  );
}
