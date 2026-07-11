"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applySiteAdnToProject } from "@/lib/site/site-adn";
import { applyBrandKitContentToProject } from "@/lib/site/site-adn-content";
import {
  applySiteGraphBindings,
  graphBindingsPending,
  moveSiteSection,
  reorderSiteNavInclude,
  reorderSiteSections,
} from "@/lib/site/site-bindings";
import { computeSiteSnapshotHash, sitePublishSlug } from "@/lib/site/site-publish";
import {
  addSitePage,
  getActiveSitePage,
  removeSitePage,
  resolvePreviewLocale,
  setActiveSitePageId,
  updateActiveSitePage,
} from "@/lib/site/site-project";
import { FoldderStudioHeader } from "../FoldderStudioHeader";
import {
  computeSiteNodeStatus,
  createSiteId,
  normalizeSiteProject,
} from "@/lib/site/site-defaults";
import { createFactorySection, defaultLabelForPreset } from "@/lib/site/site-presets";
import type {
  Block,
  SiteFactoryPresetId,
  SiteInspectorTab,
  SiteNodeData,
  SitePage,
  SitePreviewMode,
  SiteProject,
  ThemeOverride,
  ThemeState,
} from "@/lib/site/site-types";
import { SiteCanvas } from "./SiteCanvas";
import { SiteCompositionRail } from "./SiteCompositionRail";
import { SiteInspector, SitePageInspector } from "./SiteInspector";
import { SitePublishBar, SiteThemeBar } from "./SiteThemeBar";
import { useSiteAdnConnection } from "./use-site-adn";
import { useSiteConnections } from "./use-site-connections";
import "./site.css";

const SITE_STUDIO_ACCENT = "#6ec4a8";

type SiteStudioProps = {
  nodeId: string;
  nodeLabel?: string;
  data: SiteNodeData;
  onDataChange: (next: SiteNodeData) => void;
  onClose: () => void;
};

export function SiteStudio({
  nodeId,
  nodeLabel,
  data,
  onDataChange,
  onClose,
}: SiteStudioProps) {
  const { adn, connected: brandConnected } = useSiteAdnConnection(nodeId);
  const { bindings: graphBindings, status: graphStatus, datasetLoading } = useSiteConnections(nodeId);
  const brandLinked = brandConnected && Boolean(adn.document);
  const project = useMemo(() => normalizeSiteProject(data.project), [data.project]);
  const activePage = useMemo(() => getActiveSitePage(project), [project]);
  const previewLocale = resolvePreviewLocale(project);

  const previewProject = useMemo(
    () => applySiteGraphBindings(project, graphBindings),
    [graphBindings, project],
  );

  const graphApplyPending = useMemo(
    () => graphBindingsPending(project, previewProject, graphStatus),
    [graphStatus, previewProject, project],
  );

  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(activePage.sections[0]?.id ?? null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [inspectorScope, setInspectorScope] = useState<"section" | "page">("section");
  const [inspectorTab, setInspectorTab] = useState<SiteInspectorTab>("content");
  const [previewMode, setPreviewMode] = useState<SitePreviewMode>("desktop");
  const autoSyncRef = useRef<string | null>(null);

  const patchProject = useCallback(
    (patch: Partial<SiteProject> | SiteProject) => {
      const nextProject = normalizeSiteProject({ ...project, ...patch });
      onDataChange({
        ...data,
        project: nextProject,
        status: computeSiteNodeStatus(nextProject),
      });
    },
    [data, onDataChange, project],
  );

  const patchSiteData = useCallback(
    (patch: { project?: Partial<SiteProject>; sectionLabels?: Record<string, string> }) => {
      const nextProject = normalizeSiteProject(
        patch.project ? { ...project, ...patch.project } : project,
      );
      onDataChange({
        ...data,
        project: nextProject,
        sectionLabels: patch.sectionLabels ?? data.sectionLabels ?? {},
        status: computeSiteNodeStatus(nextProject),
      });
    },
    [data, onDataChange, project],
  );

  const patchActivePage = useCallback(
    (patch: Partial<SitePage> | ((page: SitePage) => SitePage)) => {
      patchProject(updateActiveSitePage(project, patch));
    },
    [patchProject, project],
  );

  const patchTheme = useCallback(
    (themePatch: Partial<ThemeState>) => {
      patchProject({
        theme: {
          ...project.theme,
          ...themePatch,
          dials: { ...project.theme.dials, ...themePatch.dials },
        },
      });
    },
    [patchProject, project.theme],
  );

  const sectionLabels = data.sectionLabels ?? {};

  const patchSectionLabels = useCallback(
    (next: Record<string, string>) => {
      onDataChange({ ...data, sectionLabels: next });
    },
    [data, onDataChange],
  );

  const selectedSection = useMemo(
    () => activePage.sections.find((section) => section.id === selectedSectionId) ?? null,
    [activePage.sections, selectedSectionId],
  );

  const handleSelectSection = useCallback((sectionId: string) => {
    setInspectorScope("section");
    setSelectedSectionId(sectionId);
    setSelectedBlockId(sectionId);
    setInspectorTab("content");
  }, []);

  const handleSelectPage = useCallback(() => {
    setInspectorScope("page");
    setSelectedSectionId(null);
    setSelectedBlockId(null);
  }, []);

  const handleSelectSitePage = useCallback(
    (pageId: string) => {
      patchProject(setActiveSitePageId(project, pageId));
      const page = project.pages.find((entry) => entry.id === pageId);
      const firstSectionId = page?.sections[0]?.id ?? null;
      setSelectedSectionId(firstSectionId);
      setSelectedBlockId(firstSectionId);
      setInspectorScope(firstSectionId ? "section" : "page");
    },
    [patchProject, project],
  );

  const handleAddSitePage = useCallback(() => {
    const next = addSitePage(project);
    patchProject(next);
    const page = getActiveSitePage(next);
    setSelectedSectionId(page.sections[0]?.id ?? null);
    setInspectorScope("page");
  }, [patchProject, project]);

  const handleRemoveSitePage = useCallback(
    (pageId: string) => {
      const next = removeSitePage(project, pageId);
      patchProject(next);
      const page = getActiveSitePage(next);
      setSelectedSectionId(page.sections[0]?.id ?? null);
      setInspectorScope(page.sections.length ? "section" : "page");
    },
    [patchProject, project],
  );

  const handleAddSection = useCallback(
    (presetId: SiteFactoryPresetId) => {
      const section = createFactorySection(presetId);
      const nextSections = [...activePage.sections, section];
      patchSiteData({
        project: updateActiveSitePage(project, {
          sections: nextSections,
          nav: {
            ...activePage.nav,
            include: [...activePage.nav.include, section.id],
          },
        }),
        sectionLabels: { ...sectionLabels, [section.id]: defaultLabelForPreset(presetId) },
      });
      handleSelectSection(section.id);
    },
    [activePage.nav, activePage.sections, handleSelectSection, patchSiteData, project, sectionLabels],
  );

  const handleDuplicateSection = useCallback(
    (sectionId: string) => {
      const source = activePage.sections.find((section) => section.id === sectionId);
      if (!source) return;
      const clone = structuredClone(source);
      clone.id = createSiteId();
      const nextSections = [...activePage.sections];
      const index = nextSections.findIndex((section) => section.id === sectionId);
      nextSections.splice(index + 1, 0, clone);
      patchSiteData({
        project: updateActiveSitePage(project, {
          sections: nextSections,
          nav: { ...activePage.nav, include: [...activePage.nav.include, clone.id] },
        }),
        sectionLabels: {
          ...sectionLabels,
          [clone.id]: `${sectionLabels[sectionId] ?? "Sección"} (copia)`,
        },
      });
      handleSelectSection(clone.id);
    },
    [activePage.nav, activePage.sections, handleSelectSection, patchSiteData, project, sectionLabels],
  );

  const handleRemoveSection = useCallback(
    (sectionId: string) => {
      const nextSections = activePage.sections.filter((section) => section.id !== sectionId);
      const nextLabels = { ...sectionLabels };
      delete nextLabels[sectionId];
      patchSiteData({
        project: updateActiveSitePage(project, {
          sections: nextSections,
          nav: {
            ...activePage.nav,
            include: activePage.nav.include.filter((id) => id !== sectionId),
          },
        }),
        sectionLabels: nextLabels,
      });
      if (selectedSectionId === sectionId) {
        const nextId = nextSections[0]?.id ?? null;
        setSelectedSectionId(nextId);
        setSelectedBlockId(nextId);
        if (!nextId) setInspectorScope("page");
      }
    },
    [activePage.nav, activePage.sections, patchSiteData, project, sectionLabels, selectedSectionId],
  );

  const handleToggleNav = useCallback(
    (sectionId: string) => {
      const include = new Set(activePage.nav.include);
      if (include.has(sectionId)) include.delete(sectionId);
      else include.add(sectionId);
      patchActivePage({ nav: { ...activePage.nav, include: [...include] } });
    },
    [activePage.nav, patchActivePage],
  );

  const handleRenameSection = useCallback(
    (sectionId: string, label: string) => {
      patchSectionLabels({ ...sectionLabels, [sectionId]: label });
    },
    [patchSectionLabels, sectionLabels],
  );

  const handleMoveSection = useCallback(
    (sectionId: string, direction: "up" | "down") => {
      const nextSections = moveSiteSection(activePage.sections, sectionId, direction);
      if (nextSections === activePage.sections) return;
      patchActivePage({
        sections: nextSections,
        nav: {
          ...activePage.nav,
          include: reorderSiteNavInclude(activePage.nav.include, nextSections),
        },
      });
    },
    [activePage.nav, activePage.sections, patchActivePage],
  );

  const handleReorderSections = useCallback(
    (dragId: string, dropId: string) => {
      const nextSections = reorderSiteSections(activePage.sections, dragId, dropId);
      if (nextSections === activePage.sections) return;
      patchActivePage({
        sections: nextSections,
        nav: {
          ...activePage.nav,
          include: reorderSiteNavInclude(activePage.nav.include, nextSections),
        },
      });
    },
    [activePage.nav, activePage.sections, patchActivePage],
  );

  const handlePatchSection = useCallback(
    (nextSection: Block) => {
      patchActivePage({
        sections: activePage.sections.map((section) =>
          section.id === nextSection.id ? nextSection : section,
        ),
      });
    },
    [activePage.sections, patchActivePage],
  );

  const handlePatchPage = useCallback(
    (patch: Partial<SitePage>) => {
      patchActivePage(patch);
    },
    [patchActivePage],
  );

  const handlePatchSlug = useCallback(
    (slug: string) => {
      patchProject({ slug });
    },
    [patchProject],
  );

  const handlePatchLedger = useCallback(
    (ledger: ThemeOverride[]) => {
      patchProject({ ledger });
    },
    [patchProject],
  );

  const handleApplyGraphBindings = useCallback(() => {
    patchProject(previewProject);
  }, [patchProject, previewProject]);

  const handleFillBrandContent = useCallback(() => {
    if (!adn.ready) return;
    patchProject(applyBrandKitContentToProject(project, adn));
  }, [adn, patchProject, project]);

  const handlePublish = useCallback(async () => {
    const slug = sitePublishSlug(project);
    const publishProject = previewProject;
    const snapshotHash = await computeSiteSnapshotHash(publishProject, {
      sectionLabels,
      adn,
      locale: previewLocale,
    });
    patchSiteData({
      project: {
        ...publishProject,
        slug,
        publish: {
          status: "published",
          publishedAt: new Date().toISOString(),
          slug,
          snapshotHash,
        },
      },
    });
  }, [adn, patchSiteData, previewLocale, previewProject, project, sectionLabels]);

  useEffect(() => {
    if (inspectorScope === "page") return;
    const ids = activePage.sections.map((section) => section.id);
    if (ids.length === 0) {
      if (selectedSectionId !== null) {
        setSelectedSectionId(null);
        setSelectedBlockId(null);
      }
      return;
    }
    if (!selectedSectionId || !ids.includes(selectedSectionId)) {
      const firstId = ids[0]!;
      setSelectedSectionId(firstId);
      setSelectedBlockId(firstId);
    }
  }, [activePage.sections, inspectorScope, selectedSectionId]);

  useEffect(() => {
    if (adn.ready) {
      const merged = applySiteAdnToProject(project, adn);
      const mergedPage = getActiveSitePage(merged);
      const needsTheme =
        project.theme.base !== "brandKit" ||
        project.theme.motionDNA !== adn.motionDNA ||
        project.theme.adnRef !== (adn.brandKitNodeId ?? undefined);
      const needsSeo =
        (!activePage.seo.title.trim() && Boolean(adn.brandName)) ||
        (!activePage.seo.description.trim() && Boolean(adn.oneLiner));

      if (needsTheme || needsSeo) {
        let next = project;
        if (needsTheme) next = { ...next, theme: merged.theme };
        if (needsSeo) next = updateActiveSitePage(next, { seo: mergedPage.seo });
        patchProject(next);
      }
      return;
    }

    if (project.theme.base === "brandKit") {
      patchTheme({ base: "neutral", adnRef: undefined, motionDNA: "soft" });
    }
  }, [
    activePage.seo.description,
    activePage.seo.title,
    adn.brandKitNodeId,
    adn.brandName,
    adn.fingerprint,
    adn.motionDNA,
    adn.oneLiner,
    adn.ready,
    patchProject,
    patchTheme,
    project,
  ]);

  useEffect(() => {
    if (!project.autoGraphSync || !graphApplyPending) return;
    const signature = JSON.stringify(getActiveSitePage(previewProject).sections);
    if (autoSyncRef.current === signature) return;
    const timer = window.setTimeout(() => {
      autoSyncRef.current = signature;
      patchProject(previewProject);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [graphApplyPending, patchProject, previewProject, project.autoGraphSync]);

  useEffect(() => {
    if (!adn.ready) return;
    const filled = applyBrandKitContentToProject(project, adn);
    if (JSON.stringify(filled.pages) !== JSON.stringify(project.pages)) {
      patchProject({ pages: filled.pages });
    }
  }, [adn.fingerprint, adn.ready, patchProject, project.pages]);

  const title = nodeLabel?.trim() || "Site";
  const sectionCount = activePage.sections.length;
  const publishLabel = project.publish.status === "published" ? "Republicar" : "Publicar";

  return (
    <div
      className="site-studio-root fixed inset-0 z-[100090] flex flex-col"
      data-foldder-studio-panel
      data-foldder-studio-canvas
      data-foldder-site-studio
      role="dialog"
      aria-modal="true"
      aria-label="Site studio"
      style={{ ["--foldder-studio-accent" as string]: SITE_STUDIO_ACCENT }}
    >
      <FoldderStudioHeader
        nodeType="site"
        nodeLabel={title}
        subtitle={`Compilador de marca a web · ${sectionCount} sección${sectionCount === 1 ? "" : "es"} · ${previewLocale}`}
        onClose={onClose}
      />

      <SiteThemeBar
        theme={project.theme}
        brandConnected={brandLinked && adn.ready}
        brandName={adn.brandName || adn.document?.brandName?.value?.trim()}
        motionDnaSource={adn.motionDnaSource}
        graphStatus={graphStatus}
        datasetLoading={datasetLoading}
        onFinishPreset={(preset) => patchTheme({ finishPreset: preset })}
        onRhythmChange={(rhythm) => patchTheme({ dials: { ...project.theme.dials, rhythm } })}
        onMotionIntensityChange={(motionIntensity) =>
          patchTheme({ dials: { ...project.theme.dials, motionIntensity } })
        }
        graphApplyPending={graphApplyPending}
        autoGraphSync={project.autoGraphSync}
        onApplyGraphBindings={project.autoGraphSync ? undefined : handleApplyGraphBindings}
        onAutoGraphSyncChange={(enabled) => patchProject({ autoGraphSync: enabled })}
        onFillBrandContent={handleFillBrandContent}
      />

      <SitePublishBar
        previewMode={previewMode}
        onPreviewModeChange={setPreviewMode}
        publishLabel={publishLabel}
        onPublish={() => void handlePublish()}
        canPublish={sectionCount > 0}
        publishHash={project.publish.snapshotHash}
      />

      <div className="site-studio site-studio--split min-h-0 flex-1">
        <SiteCompositionRail
          pages={project.pages}
          activePageId={project.activePageId}
          sections={activePage.sections}
          sectionLabels={sectionLabels}
          navInclude={activePage.nav.include}
          selectedSectionId={selectedSectionId}
          pageSelected={inspectorScope === "page"}
          onSelectSection={handleSelectSection}
          onSelectPage={handleSelectPage}
          onSelectSitePage={handleSelectSitePage}
          onAddSitePage={handleAddSitePage}
          onRemoveSitePage={handleRemoveSitePage}
          onAddSection={handleAddSection}
          onDuplicateSection={handleDuplicateSection}
          onRemoveSection={handleRemoveSection}
          onToggleNav={handleToggleNav}
          onRenameSection={handleRenameSection}
          onMoveSection={handleMoveSection}
          onReorderSections={handleReorderSections}
        />
        <SiteCanvas
          project={previewProject}
          previewMode={previewMode}
          previewLocale={previewLocale}
          selectedSectionId={selectedSectionId}
          sectionLabels={sectionLabels}
          adn={adn}
          onSelectSection={handleSelectSection}
        />
        {inspectorScope === "page" ? (
          <SitePageInspector
            page={activePage}
            slug={project.slug}
            locales={project.locales}
            previewLocale={previewLocale}
            ledger={project.ledger}
            onPatchPage={handlePatchPage}
            onPatchSlug={handlePatchSlug}
            onPatchLocales={(locales) =>
              patchProject({
                locales: locales.length ? locales : ["es"],
                previewLocale: locales.includes(previewLocale) ? previewLocale : locales[0] ?? "es",
              })
            }
            onPreviewLocaleChange={(locale) => patchProject({ previewLocale: locale })}
            onPatchLedger={handlePatchLedger}
          />
        ) : (
          <SiteInspector
            section={selectedSection}
            selectedBlockId={selectedBlockId ?? selectedSection?.id ?? null}
            onSelectBlock={setSelectedBlockId}
            onPatchSection={handlePatchSection}
            tab={inspectorTab}
            onTabChange={setInspectorTab}
            graphStatus={graphStatus}
            connectedDataset={graphBindings.dataset}
          />
        )}
      </div>
    </div>
  );
}
