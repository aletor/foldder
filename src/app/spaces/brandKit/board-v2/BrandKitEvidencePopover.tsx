"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SlotAction, SlotId, SlotState } from "@/lib/brandkit/brand-kit-types";
import { confirmLabelForSlot, brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import {
  buildBrandKitEvidenceCopy,
  formatConfirmedDate,
} from "@/lib/brandkit/brand-kit-evidence-copy";
import { useBrandKitDepthPopoverPosition } from "../use-brand-kit-depth-popover";
import { useBrandKitEvidencePopover } from "./BrandKitEvidencePopoverContext";
import { scrollToBrandKitBoardSlot } from "./brand-kit-board-scroll";

export type BrandKitEvidencePopoverProps = {
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

export function BrandKitEvidencePopover({
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
}: BrandKitEvidencePopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [expandedSupplemental, setExpandedSupplemental] = useState(false);
  const panelStyle = useBrandKitDepthPopoverPosition(anchorRef, open, panelRef);

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

  const copy = buildBrandKitEvidenceCopy({
    provenance: provenance ?? slot?.provenance,
    confidence: confidence ?? slot?.confidence,
    rankSignals: rankSignals ?? slot?.candidates[0]?.rankSignals,
    reconciliation: slot?.reconciliation,
  });

  const locked = Boolean(slot?.locked);
  const supplementalCount = slot?.supplementalEvidence?.length ?? 0;
  const hasCandidates = (slot?.candidates.length ?? 0) > 1;
  const canConfirm = Boolean(slot && slotId && onAction && slot.status === "resolved" && !locked);
  const confirmLabel = slotId ? confirmLabelForSlot[slotId] ?? brandKitLocaleEs.confirm : brandKitLocaleEs.confirm;

  return createPortal(
    <>
      <button type="button" className="brandKit-evidence-popover__backdrop" aria-label="Cerrar" onClick={onClose} />
      <div
        ref={panelRef}
        className="brandKit-evidence-popover"
        style={panelStyle}
        role="dialog"
        aria-label="Evidencia"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="brandKit-evidence-popover__step">{copy.step}</p>
        <p className="brandKit-evidence-popover__confidence">{copy.confidence}</p>
        {copy.signals.length ? (
          <ul className="brandKit-evidence-popover__signals">
            {copy.signals.map((signal) => (
              <li key={signal}>{signal}</li>
            ))}
          </ul>
        ) : null}

        {locked ? (
          <div className="brandKit-evidence-popover__locked">
            <p>Confirmado por ti · {formatConfirmedDate(slot?.updatedAt)}</p>
            {supplementalCount > 0 ? (
              <>
                <button
                  type="button"
                  className="brandKit-evidence-popover__supplemental-toggle"
                  aria-expanded={expandedSupplemental}
                  onClick={() => setExpandedSupplemental((value) => !value)}
                >
                  {supplementalCount} evidencia{supplementalCount === 1 ? "" : "s"} nueva
                  {supplementalCount === 1 ? "" : "s"} guardada{supplementalCount === 1 ? "" : "s"} desde entonces
                </button>
                {expandedSupplemental ? (
                  <ul className="brandKit-evidence-popover__supplemental-list">
                    {slot?.supplementalEvidence?.map((entry, index) => (
                      <li key={`${entry.ts}-${index}`}>{entry.quote}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        <footer className="brandKit-evidence-popover__actions">
          {canConfirm ? (
            <button
              type="button"
              className="brandKit-evidence-popover__action brandKit-evidence-popover__action--primary"
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
              className="brandKit-evidence-popover__action"
              onClick={() => {
                scrollToBrandKitBoardSlot(slotId);
                onClose();
              }}
            >
              Ver propuestas
            </button>
          ) : null}
          {onCorrect ? (
            <button type="button" className="brandKit-evidence-popover__action" onClick={() => {
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
