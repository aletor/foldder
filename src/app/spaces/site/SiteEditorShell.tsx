"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { SiteAdnContext } from "@/lib/site/site-adn";
import type { SiteGraphConnectionStatus } from "@/lib/site/site-bindings";
import type { SiteGenerateCopyAction } from "@/lib/site/site-generate-copy";
import type { SiteLeadsOutput } from "@/lib/site/site-leads";
import type {
  Block,
  SiteFactoryPresetId,
  SiteInspectorTab,
  SitePage,
  SitePreviewMode,
  SiteProject,
  PublishState,
  ThemeOverride,
  ThemeState,
} from "@/lib/site/site-types";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import { SiteCanvas } from "./SiteCanvas";
import { SiteCleanPreviewMode } from "./SiteCleanPreviewMode";
import { SiteContextToolbar } from "./SiteContextToolbar";
import { SiteFloatingTopbar } from "./SiteFloatingTopbar";
import { SiteInspectorDrawer } from "./SiteInspectorDrawer";
import { SiteSettingsPopover } from "./SiteSettingsPopover";
import { SiteSourcesPopover } from "./SiteSourcesPopover";
import { SiteStructurePanel, SiteStructureRail } from "./SiteStructurePanel";
import { SiteThemePopover } from "./SiteThemePopover";
import type { SiteOverlayPanel, SiteEditorChromeMode, SitePreviewZoom, SiteQuickControl, SiteAdvancedInspectorContext } from "./site-editor-ui-types";

export function SiteEditorShell({
  accent,
  title,
  slug,
  project,
  previewProject,
  sectionLabels,
  previewLocale,
  adn,
  brandLinked,
  graphStatus,
  datasetLoading,
  graphApplyPending,
  publishing,
  exporting,
  publishError,
  publishLabel,
  canPublish,
  isStale,
  leadsOutput,
  refreshingLeads,
  graphBindingsDataset,
  contentSourceLabel,
  generatingCopy,
  onClose,
  onPublish,
  onExportZip,
  onPatchProject,
  onPatchTheme,
  onApplyGraphBindings,
  onAutoGraphSyncChange,
  onFillBrandContent,
  onRefreshLeads,
  onPatchPage,
  onPatchSlug,
  onPatchPublish,
  onPatchLocales,
  onPreviewLocaleChange,
  onPatchLedger,
  onGenerateCopy,
  selectedSectionId,
  selectedBlockId,
  onSelectSection,
  onSelectBlock,
  onSelectPageSettings,
  inspectorScope,
  onSetInspectorScope,
  inspectorTab,
  onInspectorTabChange,
  onPatchSection,
  onDuplicateSection,
  onDuplicateBlock,
  onRemoveSection,
  onToggleNav,
  onRenameSection,
  onReorderSections,
  onAddSection,
  onSaveSectionToLibrary,
  onAddSectionFromLibrary,
  onRemoveLibraryEntry,
  onSelectSitePage,
  onAddSitePage,
  onRemoveSitePage,
  onInlineTextEdit,
  onInlineButtonEdit,
}: {
  accent: string;
  title: string;
  slug: string;
  project: SiteProject;
  previewProject: SiteProject;
  sectionLabels: Record<string, string>;
  previewLocale: string;
  adn: SiteAdnContext;
  brandLinked: boolean;
  graphStatus: SiteGraphConnectionStatus;
  datasetLoading?: boolean;
  graphApplyPending?: boolean;
  publishing?: boolean;
  exporting?: boolean;
  publishError?: string | null;
  publishLabel: string;
  canPublish: boolean;
  isStale?: boolean;
  leadsOutput?: SiteLeadsOutput;
  refreshingLeads?: boolean;
  graphBindingsDataset: Dataset | null;
  contentSourceLabel?: string | null;
  generatingCopy?: boolean;
  onClose: () => void;
  onPublish: () => void;
  onExportZip?: () => void;
  onPatchProject: (patch: Partial<SiteProject>) => void;
  onPatchTheme: (patch: Partial<ThemeState>) => void;
  onApplyGraphBindings?: () => void;
  onAutoGraphSyncChange?: (enabled: boolean) => void;
  onFillBrandContent?: () => void;
  onRefreshLeads?: () => void;
  onPatchPage: (patch: Partial<SitePage>) => void;
  onPatchSlug: (slug: string) => void;
  onPatchPublish: (patch: Partial<PublishState>) => void;
  onPatchLocales: (locales: string[]) => void;
  onPreviewLocaleChange: (locale: string) => void;
  onPatchLedger: (ledger: ThemeOverride[]) => void;
  onGenerateCopy?: (action: SiteGenerateCopyAction) => void;
  selectedSectionId: string | null;
  selectedBlockId: string | null;
  onSelectSection: (id: string) => void;
  onSelectBlock: (id: string) => void;
  onSelectPageSettings: () => void;
  inspectorScope: "section" | "page";
  onSetInspectorScope: (scope: "section" | "page") => void;
  inspectorTab: SiteInspectorTab;
  onInspectorTabChange: (tab: SiteInspectorTab) => void;
  onPatchSection: (section: Block) => void;
  onDuplicateSection: (id: string) => void;
  onDuplicateBlock?: (sectionId: string, blockId: string) => void;
  onRemoveSection: (id: string) => void;
  onToggleNav: (id: string) => void;
  onRenameSection: (id: string, label: string) => void;
  onReorderSections: (dragId: string, dropId: string) => void;
  onAddSection: (presetId: SiteFactoryPresetId) => void;
  onSaveSectionToLibrary: (sectionId: string) => void;
  onAddSectionFromLibrary: (entryId: string) => void;
  onRemoveLibraryEntry: (entryId: string) => void;
  onSelectSitePage: (pageId: string) => void;
  onAddSitePage: () => void;
  onRemoveSitePage: (pageId: string) => void;
  onInlineTextEdit: (sectionId: string, blockId: string, value: string) => void;
  onInlineButtonEdit: (sectionId: string, blockId: string, value: string) => void;
}) {
  const activePage = project.pages.find((p) => p.id === project.activePageId) ?? project.pages[0]!;
  const selectedSection = activePage.sections.find((s) => s.id === selectedSectionId) ?? null;

  const [previewMode, setPreviewMode] = useState<SitePreviewMode>("desktop");
  const [previewZoom, setPreviewZoom] = useState<SitePreviewZoom>("fit");
  const [chromeMode, setChromeMode] = useState<SiteEditorChromeMode>("editor");
  const [overlayPanel, setOverlayPanel] = useState<SiteOverlayPanel | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorPinned, setInspectorPinned] = useState(false);
  const [activeQuickControl, setActiveQuickControl] = useState<SiteQuickControl>(null);
  const [advancedInspectorContext, setAdvancedInspectorContext] = useState<SiteAdvancedInspectorContext | null>(null);

  useEffect(() => {
    setActiveQuickControl(null);
  }, [selectedBlockId, selectedSectionId]);

  const selectionRef = useRef({ sectionId: selectedSectionId, blockId: selectedBlockId });
  useEffect(() => {
    const prev = selectionRef.current;
    const changed = prev.sectionId !== selectedSectionId || prev.blockId !== selectedBlockId;
    selectionRef.current = { sectionId: selectedSectionId, blockId: selectedBlockId };
    if (!changed || !inspectorOpen || inspectorPinned) return;
    setInspectorOpen(false);
    setAdvancedInspectorContext(null);
  }, [selectedBlockId, selectedSectionId, inspectorOpen, inspectorPinned]);

  const openAdvancedInspector = useCallback(
    (context: SiteAdvancedInspectorContext) => {
      setActiveQuickControl(null);
      setAdvancedInspectorContext(context);
      onSetInspectorScope("section");
      if (context.mode === "focused") onInspectorTabChange(context.tab);
      setInspectorOpen(true);
    },
    [onInspectorTabChange, onSetInspectorScope],
  );

  const openInspector = useCallback(() => {
    openAdvancedInspector({ mode: "full" });
  }, [openAdvancedInspector]);

  const toggleOverlay = useCallback((panel: SiteOverlayPanel) => {
    setOverlayPanel((prev) => (prev === panel ? null : panel));
  }, []);

  const closeOverlay = useCallback(() => {
    setOverlayPanel(null);
  }, []);

  const closeInspector = useCallback(() => {
    setInspectorOpen(false);
    setAdvancedInspectorContext(null);
    if (inspectorPinned) setInspectorPinned(false);
  }, [inspectorPinned]);

  const closeTransientUi = useCallback(() => {
    closeOverlay();
    if (!inspectorPinned) {
      setInspectorOpen(false);
      setAdvancedInspectorContext(null);
    }
  }, [closeOverlay, inspectorPinned]);

  const toggleBleed = useCallback(() => {
    if (!selectedSection) return;
    const nextBleed = selectedSection.layout.bleed === "full" ? "contained" : "full";
    onPatchSection({ ...selectedSection, layout: { ...selectedSection.layout, bleed: nextBleed } });
  }, [onPatchSection, selectedSection]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (isEditing) return;

      if (event.key === "Escape") {
        if (chromeMode === "clean") {
          setChromeMode("editor");
          return;
        }
        if (activeQuickControl) {
          setActiveQuickControl(null);
          return;
        }
        if (overlayPanel) {
          closeOverlay();
          return;
        }
        if (inspectorOpen) {
          closeInspector();
          return;
        }
        if (selectedSectionId) {
          onSelectBlock(selectedSectionId);
        }
        return;
      }

      if (event.metaKey || event.ctrlKey) {
        if (event.key === "d" && selectedSectionId) {
          event.preventDefault();
          onDuplicateSection(selectedSectionId);
        }
        return;
      }

      if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        setPreviewZoom("fit");
        return;
      }
      if (event.key === "1") {
        event.preventDefault();
        setPreviewMode("desktop");
        return;
      }
      if (event.key === "2") {
        event.preventDefault();
        setPreviewMode("mobile");
        return;
      }
      if (event.key === "Enter" && selectedSectionId && !overlayPanel && !inspectorOpen && !activeQuickControl) {
        openInspector();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeQuickControl,
    chromeMode,
    closeInspector,
    closeOverlay,
    inspectorOpen,
    onDuplicateSection,
    onSelectBlock,
    openInspector,
    overlayPanel,
    selectedSectionId,
  ]);

  const showChrome = chromeMode === "editor";

  return (
    <div
      className="site-editor-root"
      data-foldder-site-studio
      data-foldder-studio-canvas
      role="dialog"
      aria-modal="true"
      aria-label="Site editor"
      style={{ ["--foldder-studio-accent" as string]: accent }}
    >
      <div className="site-editor-stage">
        <SiteCanvas
          project={previewProject}
          previewMode={previewMode}
          previewLocale={previewLocale}
          selectedSectionId={selectedSectionId}
          sectionLabels={sectionLabels}
          adn={adn}
          onSelectSection={onSelectSection}
          onInlineTextEdit={onInlineTextEdit}
          onInlineButtonEdit={onInlineButtonEdit}
          editorMode={showChrome}
          previewZoom={previewZoom}
        />
      </div>

      {showChrome ? (
        <div className="site-editor-chrome">
          <SiteFloatingTopbar
            title={title}
            slug={slug}
            isStale={isStale}
            publishError={publishError}
            publishing={publishing}
            exporting={exporting}
            publishLabel={publishLabel}
            canPublish={canPublish}
            onPublish={onPublish}
            onExportZip={onExportZip}
            onClose={onClose}
            previewMode={previewMode}
            onPreviewModeChange={setPreviewMode}
            previewZoom={previewZoom}
            onPreviewZoomChange={setPreviewZoom}
            chromeMode={chromeMode}
            onChromeModeChange={setChromeMode}
            activePanel={overlayPanel}
            onTogglePanel={toggleOverlay}
          />

          <SiteStructureRail
            sections={activePage.sections}
            selectedSectionId={selectedSectionId}
            structureOpen={overlayPanel === "structure"}
            onToggleStructure={() => toggleOverlay("structure")}
            onSelectSection={onSelectSection}
            onAddSectionQuick={() => toggleOverlay("structure")}
          />

          {selectedSection && !overlayPanel ? (
            <SiteContextToolbar
              section={selectedSection}
              selectedBlockId={selectedBlockId}
              sectionLabel={selectedSectionId ? sectionLabels[selectedSectionId] : undefined}
              previewLocale={previewLocale}
              activeQuickControl={activeQuickControl}
              onQuickControlChange={setActiveQuickControl}
              onOpenAdvancedInspector={openAdvancedInspector}
              onDuplicateBlock={
                selectedSectionId && selectedBlockId && onDuplicateBlock
                  ? () => onDuplicateBlock(selectedSectionId, selectedBlockId)
                  : undefined
              }
              onDuplicateSection={
                selectedSectionId ? () => onDuplicateSection(selectedSectionId) : undefined
              }
              onRemoveSection={selectedSectionId ? () => onRemoveSection(selectedSectionId) : undefined}
              onPatchSection={onPatchSection}
              onToggleBleed={toggleBleed}
              onOpenStructure={() => toggleOverlay("structure")}
              onSaveSectionToLibrary={
                selectedSectionId ? () => onSaveSectionToLibrary(selectedSectionId) : undefined
              }
            />
          ) : null}

          {overlayPanel === "structure" ? (
            <SiteStructurePanel
              pages={project.pages}
              activePageId={project.activePageId}
              sections={activePage.sections}
              sectionLabels={sectionLabels}
              navInclude={activePage.nav.include}
              selectedSectionId={selectedSectionId}
              sectionLibrary={project.sectionLibrary ?? []}
              onClose={closeOverlay}
              onSelectSitePage={onSelectSitePage}
              onAddSitePage={onAddSitePage}
              onRemoveSitePage={onRemoveSitePage}
              onSelectSection={onSelectSection}
              onAddSection={onAddSection}
              onDuplicateSection={onDuplicateSection}
              onRemoveSection={onRemoveSection}
              onToggleNav={onToggleNav}
              onRenameSection={onRenameSection}
              onReorderSections={onReorderSections}
              onSaveSectionToLibrary={onSaveSectionToLibrary}
              onAddSectionFromLibrary={onAddSectionFromLibrary}
              onRemoveLibraryEntry={onRemoveLibraryEntry}
              onSelectPageSettings={() => {
                onSelectPageSettings();
                openInspector();
              }}
            />
          ) : null}

          {overlayPanel === "theme" ? (
            <>
              <button type="button" className="site-editor-overlay-backdrop" aria-label="Cerrar tema" onClick={closeTransientUi} />
              <div className="site-editor-popover-anchor site-editor-popover-anchor--theme">
                <SiteThemePopover
                  theme={project.theme}
                  brandConnected={brandLinked && adn.ready}
                  brandName={adn.brandName || adn.document?.brandName?.value?.trim()}
                  motionDnaSource={adn.motionDnaSource}
                  onClose={closeTransientUi}
                  onFinishPreset={(preset) => onPatchTheme({ finishPreset: preset })}
                  onRhythmChange={(rhythm) =>
                    onPatchTheme({ dials: { ...project.theme.dials, rhythm } })
                  }
                  onRadiusChange={(radius) =>
                    onPatchTheme({ dials: { ...project.theme.dials, radius } })
                  }
                  onPolarityChange={(polarity) =>
                    onPatchTheme({ dials: { ...project.theme.dials, polarity } })
                  }
                  onMotionIntensityChange={(motionIntensity) =>
                    onPatchTheme({ dials: { ...project.theme.dials, motionIntensity } })
                  }
                  onMotionDnaChange={(motionDNA) => onPatchTheme({ motionDNA })}
                  onReducedMotionChange={(respectReducedMotion) => onPatchTheme({ respectReducedMotion })}
                  onFillBrandContent={onFillBrandContent}
                  onOpenLedger={() => {
                    onSelectPageSettings();
                    openInspector();
                  }}
                />
              </div>
            </>
          ) : null}

          {overlayPanel === "sources" ? (
            <>
              <button type="button" className="site-editor-overlay-backdrop" aria-label="Cerrar fuentes" onClick={closeTransientUi} />
              <div className="site-editor-popover-anchor site-editor-popover-anchor--sources">
                <SiteSourcesPopover
                  graphStatus={graphStatus}
                  datasetLoading={datasetLoading}
                  graphApplyPending={graphApplyPending}
                  autoGraphSync={project.autoGraphSync}
                  brandConnected={brandLinked && adn.ready}
                  onClose={closeTransientUi}
                  onApplyGraphBindings={onApplyGraphBindings}
                  onAutoGraphSyncChange={(enabled) => onPatchProject({ autoGraphSync: enabled })}
                  onFillBrandContent={onFillBrandContent}
                />
              </div>
            </>
          ) : null}

          {overlayPanel === "settings" ? (
            <>
              <button type="button" className="site-editor-overlay-backdrop" aria-label="Cerrar ajustes" onClick={closeTransientUi} />
              <div className="site-editor-popover-anchor site-editor-popover-anchor--settings">
                <SiteSettingsPopover
                  pages={project.pages}
                  activePageId={project.activePageId}
                  slug={slug}
                  publish={project.publish}
                  previewLocale={previewLocale}
                  onClose={closeTransientUi}
                  onSelectSitePage={onSelectSitePage}
                  onAddSitePage={onAddSitePage}
                  onPatchSlug={onPatchSlug}
                  onOpenFullSettings={() => {
                    onSelectPageSettings();
                    openInspector();
                  }}
                />
              </div>
            </>
          ) : null}

          <SiteInspectorDrawer
            open={inspectorOpen}
            pinned={inspectorPinned}
            onClose={closeInspector}
            onTogglePin={() => setInspectorPinned((v) => !v)}
            inspectorScope={inspectorScope}
            section={selectedSection}
            selectedBlockId={selectedBlockId}
            onSelectBlock={onSelectBlock}
            onPatchSection={onPatchSection}
            tab={inspectorTab}
            onTabChange={onInspectorTabChange}
            previewLocale={previewLocale}
            brandReady={adn.ready}
            generatingCopy={generatingCopy}
            onGenerateCopy={onGenerateCopy}
            graphStatus={graphStatus}
            connectedDataset={graphBindingsDataset}
            contentSourceLabel={contentSourceLabel}
            page={activePage}
            slug={slug}
            publish={project.publish}
            locales={project.locales}
            ledger={project.ledger}
            leadsOutput={leadsOutput}
            refreshingLeads={refreshingLeads}
            onRefreshLeads={onRefreshLeads}
            onPatchPage={onPatchPage}
            onPatchSlug={onPatchSlug}
            onPatchPublish={onPatchPublish}
            onPatchLocales={onPatchLocales}
            onPreviewLocaleChange={onPreviewLocaleChange}
            onPatchLedger={onPatchLedger}
            focus={advancedInspectorContext}
          />
        </div>
      ) : (
        <SiteCleanPreviewMode onExit={() => setChromeMode("editor")} />
      )}
    </div>
  );
}
