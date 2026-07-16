"use client";

import React, { useMemo } from "react";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { buildMosaicDetailPayload } from "./BrandKitDetailPanel";
import type { SlotAction, SlotId, SlotState } from "@/lib/brandkit/brand-kit-types";
import { getSlotAttention } from "@/lib/brandkit/brand-kit-board-status";
import { useRegisterSlotDetail } from "./BrandKitDetailFooterActions";
import { useBrandKitMosaicCellOptional } from "./brand-kit-mosaic-context";

export type SemanticDetailPanel = {
  id: string;
  label: string;
  count?: number;
  content: React.ReactNode;
};

function slotStatusLabel(slot: SlotState<unknown>): string {
  if (slot.locked) return brandKitLocaleEs.locked;
  const attention = getSlotAttention(slot);
  if (attention.kind === "conflict") return brandKitLocaleEs.conflictChip;
  if (attention.kind === "candidates") return brandKitLocaleEs.reviewChip;
  if (attention.kind === "analyzing") return brandKitLocaleEs.slotAnalyzing;
  if (slot.status === "resolved") return brandKitLocaleEs.confirmedStatus;
  return brandKitLocaleEs.pendingChip;
}

const SLOT_DETAIL_LABELS: Partial<Record<SlotId, string>> = {
  logo: "Logo",
  palette: "Color",
  typography: "Tipografía",
  essence: "Esencia",
  voice: "Voz",
  visualWorld: "Mundo visual",
  gallery: "Galería",
};

export function SemanticDetailPanels({
  summary,
  chips,
  panels,
  footer,
  slotId,
  slot,
  brandName,
  onAction,
  onEdit,
}: {
  summary: React.ReactNode;
  chips?: React.ReactNode;
  panels: SemanticDetailPanel[];
  footer?: React.ReactNode;
  slotId?: SlotId;
  slot?: SlotState<unknown>;
  brandName?: string;
  onAction?: (slotId: SlotId, action: SlotAction) => void;
  onEdit?: () => void;
}) {
  const visiblePanels = panels.filter((panel) => panel.content);
  const mosaicCell = useBrandKitMosaicCellOptional();
  const isMosaic = Boolean(mosaicCell);

  const detailPayload = useMemo(() => {
    if (!visiblePanels.length && !footer) return null;
    const sourceLabel = slot?.provenance?.detail
      ? `Fuente principal: ${slot.provenance.detail}`
      : undefined;
    const attention = slot ? getSlotAttention(slot) : { kind: null };
    const payloadPanels = [
      ...visiblePanels,
      ...(footer
        ? [
            {
              id: "supplemental",
              label: brandKitLocaleEs.supplementalEvidence,
              content: footer,
            },
          ]
        : []),
    ];
    return buildMosaicDetailPayload({
      slotId,
      blockLabel: slotId ? (SLOT_DETAIL_LABELS[slotId] ?? slotId) : "Detalle",
      brandName,
      statusLabel: slot ? slotStatusLabel(slot) : undefined,
      sourceLabel,
      summary,
      panels: payloadPanels,
      initialTabId:
        slot?.reconciliation?.outcome === "contradiction" || attention.kind === "conflict"
          ? "evidence"
          : slot?.status === "candidates"
            ? "alternatives"
            : undefined,
    });
  }, [brandName, footer, slot, slotId, summary, visiblePanels]);

  useRegisterSlotDetail(slotId, detailPayload);

  return (
    <div className={`brandKit-semantic-panels${isMosaic ? " brandKit-semantic-panels--mosaic" : ""}`}>
      <div className="brandKit-semantic-panels__intro">
        <div className="brandKit-v2-semantic__summary">{summary}</div>
        {chips ? <div className="brandKit-v2-chip-row brandKit-v2-semantic__chips">{chips}</div> : null}
      </div>
    </div>
  );
}

export function EvidenceList({ quotes, hideLabel = false }: { quotes: string[]; hideLabel?: boolean }) {
  if (!quotes.length) return null;
  return (
    <div className="brandKit-v2-evidence brandKit-v2-evidence--detail">
      {!hideLabel ? <span className="brandKit-v2-evidence__label">{brandKitLocaleEs.evidence}</span> : null}
      <ol className="brandKit-detail-evidence">
        {quotes.map((quote, index) => (
          <li key={`${index}-${quote.slice(0, 20)}`} className="brandKit-detail-evidence__item">
            <span className="brandKit-detail-evidence__index">{index + 1}</span>
            <blockquote className="brandKit-detail-evidence__quote">"{quote}"</blockquote>
          </li>
        ))}
      </ol>
    </div>
  );
}