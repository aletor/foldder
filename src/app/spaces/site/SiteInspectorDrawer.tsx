"use client";

import React from "react";
import { Pin, X } from "lucide-react";
import { SiteInspector, SitePageInspector } from "./SiteInspector";
import type { SiteGraphConnectionStatus } from "@/lib/site/site-bindings";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import type { SiteGenerateCopyAction } from "@/lib/site/site-generate-copy";
import type { SiteLeadsOutput } from "@/lib/site/site-leads";
import type {
  Block,
  SiteInspectorTab,
  SitePage,
  PublishState,
  ThemeOverride,
} from "@/lib/site/site-types";
import type { SiteAdvancedInspectorContext } from "./site-editor-ui-types";
import type { SiteSelectionKind } from "@/lib/site/site-selection";

export function SiteInspectorDrawer({
  open,
  pinned,
  onClose,
  onTogglePin,
  inspectorScope,
  section,
  selectedBlockId,
  onSelectBlock,
  onPatchSection,
  tab,
  onTabChange,
  previewLocale,
  brandReady,
  generatingCopy,
  onGenerateCopy,
  graphStatus,
  connectedDataset,
  contentSourceLabel,
  page,
  slug,
  publish,
  locales,
  ledger,
  leadsOutput,
  refreshingLeads,
  onRefreshLeads,
  onPatchPage,
  onPatchSlug,
  onPatchPublish,
  onPatchLocales,
  onPreviewLocaleChange,
  onPatchLedger,
  focus,
  selectionKind,
}: {
  open: boolean;
  pinned: boolean;
  onClose: () => void;
  onTogglePin: () => void;
  inspectorScope: "section" | "page";
  section: Block | null;
  selectedBlockId: string | null;
  onSelectBlock: (blockId: string) => void;
  onPatchSection: (nextSection: Block) => void;
  tab: SiteInspectorTab;
  onTabChange: (tab: SiteInspectorTab) => void;
  previewLocale: string;
  brandReady?: boolean;
  generatingCopy?: boolean;
  onGenerateCopy?: (action: SiteGenerateCopyAction) => void;
  graphStatus?: SiteGraphConnectionStatus;
  connectedDataset?: Dataset | null;
  contentSourceLabel?: string | null;
  page: SitePage;
  slug: string;
  publish: PublishState;
  locales: string[];
  ledger: ThemeOverride[];
  leadsOutput?: SiteLeadsOutput;
  refreshingLeads?: boolean;
  onRefreshLeads?: () => void;
  onPatchPage: (patch: Partial<SitePage>) => void;
  onPatchSlug: (slug: string) => void;
  onPatchPublish: (patch: Partial<PublishState>) => void;
  onPatchLocales: (locales: string[]) => void;
  onPreviewLocaleChange: (locale: string) => void;
  onPatchLedger: (ledger: ThemeOverride[]) => void;
  focus?: SiteAdvancedInspectorContext | null;
  selectionKind?: SiteSelectionKind;
}) {
  if (!open) return null;

  return (
    <aside className={`site-editor-inspector-drawer${pinned ? " is-pinned" : ""}`} data-foldder-studio-panel aria-label="Inspector">
        <header className="site-editor-inspector-drawer__head">
          <h2 className="site-editor-inspector-drawer__title">
            {inspectorScope === "page" ? "Ajustes de página" : "Inspector"}
          </h2>
          <div className="site-editor-inspector-drawer__head-actions">
            <button
              type="button"
              className={`site-editor-inspector-drawer__pin${pinned ? " is-active" : ""}`}
              onClick={onTogglePin}
              title={pinned ? "Desfijar inspector" : "Fijar inspector"}
            >
              <Pin size={14} />
            </button>
            <button type="button" className="site-editor-inspector-drawer__close" onClick={onClose} aria-label="Cerrar">
              <X size={16} />
            </button>
          </div>
        </header>
        <div className="site-editor-inspector-drawer__body">
          {inspectorScope === "page" ? (
            <SitePageInspector
              embedded
              page={page}
              slug={slug}
              publish={publish}
              locales={locales}
              previewLocale={previewLocale}
              ledger={ledger}
              leadsOutput={leadsOutput}
              refreshingLeads={refreshingLeads}
              onRefreshLeads={onRefreshLeads}
              onPatchPage={onPatchPage}
              onPatchSlug={onPatchSlug}
              onPatchPublish={onPatchPublish}
              onPatchLocales={onPatchLocales}
              onPreviewLocaleChange={onPreviewLocaleChange}
              onPatchLedger={onPatchLedger}
            />
          ) : (
            <SiteInspector
              embedded
              section={section}
              selectedBlockId={selectedBlockId}
              onSelectBlock={onSelectBlock}
              onPatchSection={onPatchSection}
              tab={tab}
              onTabChange={onTabChange}
              previewLocale={previewLocale}
              brandReady={brandReady}
              generatingCopy={generatingCopy}
              onGenerateCopy={onGenerateCopy}
              graphStatus={graphStatus}
              connectedDataset={connectedDataset}
              contentSourceLabel={contentSourceLabel}
              focus={focus}
              selectionKind={selectionKind}
            />
          )}
        </div>
      </aside>
  );
}
