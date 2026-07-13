"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { BrandKitCapsuleList } from "./BrandKitCapsuleList";
import { BrandKitFoldderButton } from "./BrandKitFoldderButton";
import { useBrandKitMosaicBoard, useBrandKitMosaicCellOptional } from "./brand-kit-mosaic-context";

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
  const mosaicBoard = useBrandKitMosaicBoard();
  return (
    <BrandKitFoldderButton
      variant="white"
      compact
      onClick={() => mosaicBoard?.openDetailSheet({ title, content })}
    >
      Detalle
    </BrandKitFoldderButton>
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
  const mosaicCell = useBrandKitMosaicCellOptional();
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
      <div className="brandKit-mosaic-detail-panels">
        {visiblePanels.map((panel) => (
          <section key={panel.id} className="brandKit-semantic-panel is-open">
            <div className="brandKit-semantic-panel__tab brandKit-semantic-panel__tab--static">
              <span className="brandKit-semantic-panel__label">{panel.label}</span>
              {panel.count !== undefined ? (
                <span className="brandKit-semantic-panel__count">{panel.count}</span>
              ) : null}
            </div>
            <div className="brandKit-semantic-panel__body">{panel.content}</div>
          </section>
        ))}
        {footer ? <div className="brandKit-semantic-panels__footer">{footer}</div> : null}
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
    <div className={`brandKit-semantic-panels${isMosaic ? " brandKit-semantic-panels--mosaic" : ""}`}>
      <div className="brandKit-semantic-panels__intro">
        <div className="brandKit-v2-semantic__summary">{summary}</div>
        {chips ? <div className="brandKit-v2-chip-row brandKit-v2-semantic__chips">{chips}</div> : null}
      </div>

      {!isMosaic && visiblePanels.length ? (
        <div className="brandKit-semantic-panels__list">
          {visiblePanels.map((panel) => {
            const isOpen = openIds.has(panel.id);
            return (
              <section key={panel.id} className={`brandKit-semantic-panel${isOpen ? " is-open" : ""}`}>
                <button
                  type="button"
                  className="brandKit-semantic-panel__tab"
                  aria-expanded={isOpen}
                  onClick={() => toggle(panel.id)}
                >
                  <span className="brandKit-semantic-panel__label">{panel.label}</span>
                  {panel.count !== undefined ? (
                    <span className="brandKit-semantic-panel__count">{panel.count}</span>
                  ) : null}
                  <ChevronDown size={14} strokeWidth={1.75} className="brandKit-semantic-panel__chevron" aria-hidden />
                </button>
                {isOpen ? <div className="brandKit-semantic-panel__body">{panel.content}</div> : null}
              </section>
            );
          })}
        </div>
      ) : null}

      {!isMosaic && footer ? <div className="brandKit-semantic-panels__footer">{footer}</div> : null}
    </div>
  );
}

export function EvidenceList({ quotes, hideLabel = false }: { quotes: string[]; hideLabel?: boolean }) {
  if (!quotes.length) return null;
  return (
    <div className="brandKit-v2-evidence">
      {!hideLabel ? <span className="brandKit-v2-evidence__label">{brandKitLocaleEs.evidence}</span> : null}
      <BrandKitCapsuleList items={quotes} variant="quote" />
    </div>
  );
}
