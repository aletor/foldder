"use client";

import React from "react";
import type { SlotHistoryEntry, SlotState } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";

function formatHistoryDate(ts: string): string {
  try {
    return new Intl.DateTimeFormat("es", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ts));
  } catch {
    return ts;
  }
}

function historySummary(entry: SlotHistoryEntry<unknown>, index: number): string {
  const source = entry.provenance.detail ?? entry.provenance.type;
  return `${brandKitLocaleEs.revert} #${index + 1} · ${source}`;
}

export function BrandKitInspectorHistory({
  slot,
  onRestore,
}: {
  slot: SlotState<unknown>;
  onRestore?: (historyIndex: number) => void;
}) {
  if (!slot.history.length) {
    return <p className="brandKit-inspector-history__empty">{brandKitLocaleEs.inspectorHistoryEmpty}</p>;
  }

  return (
    <ol className="brandKit-inspector-history">
      {slot.history.map((entry, index) => (
        <li key={`${entry.ts}-${index}`} className="brandKit-inspector-history__item">
          <div className="brandKit-inspector-history__meta">
            <span className="brandKit-inspector-history__date">{formatHistoryDate(entry.ts)}</span>
            <span className="brandKit-inspector-history__source">{historySummary(entry, index)}</span>
          </div>
          {onRestore ? (
            <button
              type="button"
              className="brandKit-inspector-history__restore"
              onClick={() => onRestore(index)}
            >
              {brandKitLocaleEs.inspectorHistoryRestore}
            </button>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function BrandKitInspectorSectionGroup({
  panels,
}: {
  panels: Array<{ id: string; label: string; count?: number; content: React.ReactNode }>;
}) {
  if (!panels.length) return null;

  if (panels.length === 1) {
    return <div className="brandKit-inspector-section">{panels[0].content}</div>;
  }

  return (
    <div className="brandKit-inspector-sections">
      {panels.map((panel) => (
        <section key={panel.id} className="brandKit-inspector-section">
          <h4 className="brandKit-inspector-section__label">
            {panel.label}
            {panel.count !== undefined ? (
              <span className="brandKit-inspector-section__count">{panel.count}</span>
            ) : null}
          </h4>
          {panel.content}
        </section>
      ))}
    </div>
  );
}
