"use client";

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { GenomaCapsuleList } from "./GenomaCapsuleList";

export type SemanticDetailPanel = {
  id: string;
  label: string;
  count?: number;
  content: React.ReactNode;
};

export function SemanticDetailPanels({
  summary,
  chips,
  panels,
  footer,
}: {
  summary: React.ReactNode;
  chips?: React.ReactNode;
  panels: SemanticDetailPanel[];
  footer?: React.ReactNode;
}) {
  const visiblePanels = panels.filter((panel) => panel.content);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="genoma-semantic-panels">
      <div className="genoma-semantic-panels__intro">
        <div className="genoma-v2-semantic__summary">{summary}</div>
        {chips ? <div className="genoma-v2-chip-row genoma-v2-semantic__chips">{chips}</div> : null}
      </div>

      {visiblePanels.length ? (
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

      {footer ? <div className="genoma-semantic-panels__footer">{footer}</div> : null}
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
