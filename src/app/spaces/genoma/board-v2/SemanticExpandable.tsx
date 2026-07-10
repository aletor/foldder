"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { GenomaCapsuleList } from "./GenomaCapsuleList";
import { GenomaFoldderButton } from "./GenomaFoldderButton";
import { useGenomaMosaicBoard, useGenomaMosaicCellOptional } from "./genoma-mosaic-context";

export type SemanticDetailPanel = {
  id: string;
  label: string;
  count?: number;
  content: React.ReactNode;
};

function MosaicDetailAction({
  title,
  content,
}: {
  title: string;
  content: React.ReactNode;
}) {
  const mosaicBoard = useGenomaMosaicBoard();
  return (
    <GenomaFoldderButton
      variant="muted"
      onClick={() => mosaicBoard?.openDetailSheet({ title, content })}
    >
      Detalle
    </GenomaFoldderButton>
  );
}

export function SemanticDetailPanels({
  summary,
  chips,
  panels,
  footer,
  mosaicDetailTitle = "Detalle",
}: {
  summary: React.ReactNode;
  chips?: React.ReactNode;
  panels: SemanticDetailPanel[];
  footer?: React.ReactNode;
  mosaicDetailTitle?: string;
}) {
  const visiblePanels = panels.filter((panel) => panel.content);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const mosaicCell = useGenomaMosaicCellOptional();
  const isMosaic = Boolean(mosaicCell);

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const mosaicDetailContent = useMemo(() => {
    if (!visiblePanels.length) return null;
    return (
      <div className="genoma-mosaic-detail-panels">
        {visiblePanels.map((panel) => (
          <section key={panel.id} className="genoma-semantic-panel is-open">
            <div className="genoma-semantic-panel__tab genoma-semantic-panel__tab--static">
              <span className="genoma-semantic-panel__label">{panel.label}</span>
              {panel.count !== undefined ? (
                <span className="genoma-semantic-panel__count">{panel.count}</span>
              ) : null}
            </div>
            <div className="genoma-semantic-panel__body">{panel.content}</div>
          </section>
        ))}
        {footer ? <div className="genoma-semantic-panels__footer">{footer}</div> : null}
      </div>
    );
  }, [footer, visiblePanels]);

  const detailAction = useMemo(() => {
    if (!mosaicDetailContent) return null;
    return <MosaicDetailAction title={mosaicDetailTitle} content={mosaicDetailContent} />;
  }, [mosaicDetailContent, mosaicDetailTitle]);

  useEffect(() => {
    if (!isMosaic || !mosaicCell || !detailAction) return;
    mosaicCell.setActionSlot("semantic-detail", detailAction);
    return () => mosaicCell.setActionSlot("semantic-detail", null);
  }, [detailAction, isMosaic, mosaicCell]);

  return (
    <div className={`genoma-semantic-panels${isMosaic ? " genoma-semantic-panels--mosaic" : ""}`}>
      <div className="genoma-semantic-panels__intro">
        <div className="genoma-v2-semantic__summary">{summary}</div>
        {chips ? <div className="genoma-v2-chip-row genoma-v2-semantic__chips">{chips}</div> : null}
      </div>

      {!isMosaic && visiblePanels.length ? (
        <div className="genoma-semantic-panels__list">
          {visiblePanels.map((panel) => {
            const isOpen = openIds.has(panel.id);
            return (
              <section key={panel.id} className={`genoma-semantic-panel${isOpen ? " is-open" : ""}`}>
                <button
                  type="button"
                  className="genoma-semantic-panel__tab"
                  aria-expanded={isOpen}
                  onClick={() => toggle(panel.id)}
                >
                  <span className="genoma-semantic-panel__label">{panel.label}</span>
                  {panel.count !== undefined ? (
                    <span className="genoma-semantic-panel__count">{panel.count}</span>
                  ) : null}
                  <ChevronDown size={14} strokeWidth={1.75} className="genoma-semantic-panel__chevron" aria-hidden />
                </button>
                {isOpen ? <div className="genoma-semantic-panel__body">{panel.content}</div> : null}
              </section>
            );
          })}
        </div>
      ) : null}

      {!isMosaic && footer ? <div className="genoma-semantic-panels__footer">{footer}</div> : null}
    </div>
  );
}

export function EvidenceList({ quotes, hideLabel = false }: { quotes: string[]; hideLabel?: boolean }) {
  if (!quotes.length) return null;
  return (
    <div className="genoma-v2-evidence">
      {!hideLabel ? <span className="genoma-v2-evidence__label">{genomaLocaleEs.evidence}</span> : null}
      <GenomaCapsuleList items={quotes} variant="quote" />
    </div>
  );
}
