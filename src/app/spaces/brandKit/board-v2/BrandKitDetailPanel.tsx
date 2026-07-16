"use client";

import React, { useMemo, useState } from "react";
import type { SlotId } from "@/lib/brandkit/brand-kit-types";
import { BRAND_KIT_SLOT_LABELS } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import type { BrandKitInspectorTab } from "@/lib/brandkit/studio/brand-kit-studio-mode";
import { partitionInspectorPanels } from "@/lib/brandkit/studio/brand-kit-inspector";
import { buildAtelierEvidenceItems } from "@/lib/brandkit/studio/brand-kit-atelier-model";
import { isTextEditableSlotId } from "@/lib/brandkit/studio/brand-kit-slot-text-edit";
import { SLOT_LABELS_ES, SLOT_NUMBERS } from "@/lib/brandkit/studio/sidebar-slot-nav";
import type { MosaicDetailPayload } from "./brand-kit-mosaic-context";
import { useBrandKitMosaicBoard } from "./brand-kit-mosaic-context";
import { BrandKitInspectorAtelier } from "./BrandKitInspectorAtelier";
import { BrandKitInspectorFooter } from "./BrandKitInspectorFooter";
import { BrandKitInspectorHistory, BrandKitInspectorSectionGroup } from "./BrandKitInspectorSections";

function buildInspectorSectionsFromPayload(payload: MosaicDetailPayload) {
  if (payload.sections) return payload.sections;

  const partitioned = partitionInspectorPanels(payload.tabs);
  return {
    content: partitioned.content.length ? (
      <BrandKitInspectorSectionGroup panels={partitioned.content} />
    ) : null,
    evidence: partitioned.evidence.length ? (
      <BrandKitInspectorSectionGroup panels={partitioned.evidence} />
    ) : null,
    history: partitioned.history.length ? (
      <BrandKitInspectorSectionGroup panels={partitioned.history} />
    ) : null,
  };
}

export function buildMosaicDetailPayload(input: {
  slotId?: SlotId;
  blockLabel: string;
  brandName?: string;
  statusLabel?: string;
  sourceLabel?: string;
  summary?: React.ReactNode;
  panels: Array<{ id: string; label: string; count?: number; content: React.ReactNode }>;
  sections?: MosaicDetailPayload["sections"];
  footer?: React.ReactNode;
  initialTabId?: string;
}): MosaicDetailPayload {
  const tabs = input.panels
    .filter((panel) => panel.content)
    .map((panel) => ({
      id: panel.id,
      label: panel.label,
      count: panel.count,
      content: panel.content,
    }));

  const slotNumber = input.slotId ? SLOT_NUMBERS[input.slotId] : undefined;
  const localizedLabel = input.slotId
    ? (SLOT_LABELS_ES[input.slotId] ?? BRAND_KIT_SLOT_LABELS[input.slotId])
    : input.blockLabel;

  const partitioned = partitionInspectorPanels(tabs);
  const sections =
    input.sections ??
    ({
      content: partitioned.content.length ? (
        <BrandKitInspectorSectionGroup panels={partitioned.content} />
      ) : undefined,
      evidence: partitioned.evidence.length ? (
        <BrandKitInspectorSectionGroup panels={partitioned.evidence} />
      ) : undefined,
      history: partitioned.history.length ? (
        <BrandKitInspectorSectionGroup panels={partitioned.history} />
      ) : undefined,
    } satisfies MosaicDetailPayload["sections"]);

  return {
    slotId: input.slotId,
    slotNumber,
    blockLabel: localizedLabel.toUpperCase(),
    brandName: input.brandName,
    statusLabel: input.statusLabel,
    sourceLabel: input.sourceLabel,
    summary: input.summary,
    tabs,
    sections,
    footer: input.footer,
    initialTabId: input.initialTabId ?? tabs[0]?.id,
  };
}

export function BrandKitInspectorPanelBody({ payload }: { payload: MosaicDetailPayload }) {
  const board = useBrandKitMosaicBoard();
  const activeTab = board?.inspectorTab ?? "synthesis";
  const sections = useMemo(() => buildInspectorSectionsFromPayload(payload), [payload]);

  const slot = payload.slotId && board?.doc ? board.doc.slots[payload.slotId] : undefined;
  const useAtelier = Boolean(payload.slotId && slot && isTextEditableSlotId(payload.slotId));
  const evidenceCount = useMemo(() => {
    if (!payload.slotId || !slot) return 0;
    return buildAtelierEvidenceItems(payload.slotId, slot).length;
  }, [payload.slotId, slot]);

  const inspectorTabs = useMemo(() => {
    const tabs: Array<{ id: BrandKitInspectorTab; label: string; count?: number }> = [
      { id: "synthesis", label: brandKitLocaleEs.atelierSynthesisTab },
    ];
    if (useAtelier) {
      tabs.push({ id: "attributes", label: brandKitLocaleEs.atelierAttributesTab });
    }
    tabs.push({
      id: "evidence",
      label: brandKitLocaleEs.atelierEvidenceTab,
      count: evidenceCount || undefined,
    });
    tabs.push({ id: "history", label: brandKitLocaleEs.atelierHistoryTab });
    return tabs;
  }, [evidenceCount, useAtelier]);

  const tabContent = useMemo(() => {
    if (activeTab === "evidence") {
      if (useAtelier && payload.slotId && slot) {
        return (
          <BrandKitInspectorAtelier
            slotId={payload.slotId}
            slot={slot}
            onAction={board?.onSlotAction ?? (() => undefined)}
            mode="attributes"
            evidenceOnly
          />
        );
      }
      return sections.evidence ?? (
        <p className="brandKit-detail-panel__empty">{brandKitLocaleEs.detailEmpty}</p>
      );
    }
    if (activeTab === "history") {
      if (slot) {
        return (
          <BrandKitInspectorHistory
            slot={slot}
            onRestore={
              board?.onSlotAction
                ? (historyIndex) => board.onSlotAction?.(payload.slotId!, { action: "revert", historyIndex })
                : undefined
            }
          />
        );
      }
      return sections.history ?? (
        <p className="brandKit-detail-panel__empty">{brandKitLocaleEs.inspectorHistoryEmpty}</p>
      );
    }

    if (useAtelier && payload.slotId && slot) {
      return (
        <BrandKitInspectorAtelier
          slotId={payload.slotId}
          slot={slot}
          onAction={board?.onSlotAction ?? (() => undefined)}
          mode={activeTab === "attributes" ? "attributes" : "synthesis"}
          onOpenEvidenceTab={() => board?.setInspectorTab("evidence")}
        />
      );
    }

    return (
      <>
        {payload.summary ? <div className="brandKit-detail-panel__summary">{payload.summary}</div> : null}
        {sections.content ?? (
          <p className="brandKit-detail-panel__empty">{brandKitLocaleEs.detailEmpty}</p>
        )}
      </>
    );
  }, [activeTab, board, payload, sections, slot, useAtelier]);

  return (
    <div className="brandKit-detail-panel brandKit-detail-panel--inspector">
      <div className="brandKit-inspector-tabs" role="tablist" aria-label="Estudio de marca">
        {inspectorTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`brandKit-inspector-tabs__tab${activeTab === tab.id ? " is-active" : ""}`}
            onClick={() => board?.setInspectorTab(tab.id)}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span className="brandKit-inspector-tabs__count">{tab.count}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="brandKit-detail-panel__content brandKit-inspector-tabs__panel" role="tabpanel">
        {tabContent}
      </div>

      {slot && board?.onSlotAction && payload.slotId ? (
        <BrandKitInspectorFooter slotId={payload.slotId} slot={slot} onAction={board.onSlotAction} />
      ) : (
        (payload.footer ?? null)
      )}
    </div>
  );
}

export function BrandKitDetailPanelBody({ payload }: { payload: MosaicDetailPayload }) {
  const [activeTab, setActiveTab] = useState(payload.initialTabId ?? payload.tabs[0]?.id ?? "summary");
  const active = payload.tabs.find((tab) => tab.id === activeTab) ?? payload.tabs[0];

  const headerLine = useMemo(() => {
    const parts = [payload.statusLabel, payload.sourceLabel].filter(Boolean);
    return parts.join(" · ");
  }, [payload.sourceLabel, payload.statusLabel]);

  return (
    <div className="brandKit-detail-panel">
      <div className="brandKit-detail-panel__context">
        {payload.slotNumber ? (
          <p className="brandKit-detail-panel__chapter">
            {payload.slotNumber} — {payload.blockLabel}
          </p>
        ) : (
          <p className="brandKit-detail-panel__chapter">{payload.blockLabel}</p>
        )}
        {payload.brandName ? <p className="brandKit-detail-panel__brand">{payload.brandName}</p> : null}
        {headerLine ? <p className="brandKit-detail-panel__meta">{headerLine}</p> : null}
      </div>

      {payload.summary ? <div className="brandKit-detail-panel__summary">{payload.summary}</div> : null}

      {payload.tabs.length > 1 ? (
        <div className="brandKit-detail-panel__tabs" role="tablist">
          {payload.tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`brandKit-detail-panel__tab${activeTab === tab.id ? " is-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              {tab.count !== undefined ? <span className="brandKit-detail-panel__tab-count">{tab.count}</span> : null}
            </button>
          ))}
        </div>
      ) : payload.tabs[0] ? (
        <p className="brandKit-detail-panel__section-label">{payload.tabs[0].label}</p>
      ) : null}

      <div className="brandKit-detail-panel__content" role="tabpanel">
        {active?.content ?? <p className="brandKit-detail-panel__empty">{brandKitLocaleEs.detailEmpty}</p>}
      </div>

      {payload.footer ? <footer className="brandKit-detail-panel__footer">{payload.footer}</footer> : null}
    </div>
  );
}
