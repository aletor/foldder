"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applySiteAdnToProject } from "@/lib/site/site-adn";
import { applyBrandKitContentToProject } from "@/lib/site/site-adn-content";
import { duplicateBlockInSection, findBlockInSection, patchBlockContent } from "@/lib/site/site-block-tree";
import {
  applySiteGraphBindings,
  graphBindingsPending,
  reorderSiteNavInclude,
  reorderSiteSections,
} from "@/lib/site/site-bindings";
import { resolveSitePublishStatus } from "@/lib/site/site-publish-stale";
import { sitePublishSlug } from "@/lib/site/site-publish-slug";
import {
  addSitePage,
  cloneSectionFromLibrary,
  getActiveSitePage,
  removeSitePage,
  resolvePreviewLocale,
  saveSectionToLibrary,
  removeSectionLibraryEntry,
  setActiveSitePageId,
  updateActiveSitePage,
} from "@/lib/site/site-project";
import { applyGeneratedCopyToSection, type SiteGenerateCopyAction } from "@/lib/site/site-generate-copy";
import { patchButtonLocaleLabel } from "@/lib/site/site-i18n";
import type { SiteLeadsOutput } from "@/lib/site/site-leads";
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
  SiteProject,
  TextContent,
  ButtonContent,
  ThemeOverride,
  ThemeState,
} from "@/lib/site/site-types";
import { SiteEditorShell } from "./SiteEditorShell";
import { useSiteAdnConnection } from "./use-site-adn";
import { useSiteConnections } from "./use-site-connections";
import "./site.css";
import "./site-editor.css";

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
    () => graphBindingsPending(project, previewProject, graphStatus, graphBindings),
    [graphBindings, graphStatus, previewProject, project],
  );

  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(activePage.sections[0]?.id ?? null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [inspectorScope, setInspectorScope] = useState<"section" | "page">("section");
  const [inspectorTab, setInspectorTab] = useState<SiteInspectorTab>("content");
  const [publishing, setPublishing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [refreshingLeads, setRefreshingLeads] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
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
    (patch: { project?: Partial<SiteProject>; sectionLabels?: Record<string, string>; leadsOutput?: SiteLeadsOutput }) => {
      const nextProject = normalizeSiteProject(
        patch.project ? { ...project, ...patch.project } : project,
      );
      onDataChange({
        ...data,
        project: nextProject,
        sectionLabels: patch.sectionLabels ?? data.sectionLabels ?? {},
        leadsOutput: patch.leadsOutput ?? data.leadsOutput,
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
  }, []);

  const handleSelectPageSettings = useCallback(() => {
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

  const handleDuplicateBlock = useCallback(
    (sectionId: string, blockId: string) => {
      const sourceSection = activePage.sections.find((section) => section.id === sectionId);
      if (!sourceSection) return;
      if (sourceSection.id === blockId) {
        handleDuplicateSection(sectionId);
        return;
      }
      const { section: nextSection, newBlockId } = duplicateBlockInSection(
        sourceSection,
        blockId,
        createSiteId(),
      );
      if (!newBlockId) return;
      patchSiteData({
        project: updateActiveSitePage(project, {
          sections: activePage.sections.map((section) => (section.id === sectionId ? nextSection : section)),
        }),
      });
      setSelectedSectionId(sectionId);
      setSelectedBlockId(newBlockId);
    },
    [activePage.sections, handleDuplicateSection, patchSiteData, project],
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

  const handleInlineTextEdit = useCallback(
    (sectionId: string, blockId: string, value: string) => {
      const section = activePage.sections.find((entry) => entry.id === sectionId);
      if (!section) return;
      const block = findBlockInSection(section, blockId);
      if (!block || block.type !== "text") return;
      handlePatchSection(
        patchBlockContent(section, blockId, {
          ...(block.content as TextContent),
          value,
        }),
      );
    },
    [activePage.sections, handlePatchSection],
  );

  const handleInlineButtonEdit = useCallback(
    (sectionId: string, blockId: string, value: string) => {
      const section = activePage.sections.find((entry) => entry.id === sectionId);
      if (!section) return;
      const block = findBlockInSection(section, blockId);
      if (!block || block.type !== "button") return;
      handlePatchSection(
        patchBlockContent(
          section,
          blockId,
          patchButtonLocaleLabel(block.content as ButtonContent, previewLocale, value),
        ),
      );
    },
    [activePage.sections, handlePatchSection, previewLocale],
  );

  const handleGenerateCopy = useCallback(
    async (action: SiteGenerateCopyAction) => {
      if (!selectedSection) return;
      setGeneratingCopy(true);
      setPublishError(null);
      try {
        const activeBlock = findBlockInSection(selectedSection, selectedBlockId ?? selectedSection.id);
        const currentText =
          activeBlock?.type === "text" ? (activeBlock.content as TextContent).value : "";
        const response = await fetch("/api/spaces/site/generate-copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            locale: previewLocale,
            currentText,
            adn: adn.ready
              ? {
                  ready: true,
                  brandKitNodeId: adn.brandKitNodeId,
                  brandName: adn.brandName,
                  oneLiner: adn.oneLiner,
                  document: adn.document,
                }
              : null,
          }),
        });
        const payload = (await response.json()) as { error?: string; result?: unknown };
        if (!response.ok) throw new Error(payload.error || "No se pudo generar copy.");
        if (!payload.result) throw new Error("Respuesta vacía del modelo.");
        handlePatchSection(
          applyGeneratedCopyToSection(
            selectedSection,
            payload.result as Parameters<typeof applyGeneratedCopyToSection>[1],
            previewLocale,
          ),
        );
      } catch (error) {
        setPublishError(error instanceof Error ? error.message : "Error al generar copy");
      } finally {
        setGeneratingCopy(false);
      }
    },
    [adn, handlePatchSection, previewLocale, selectedBlockId, selectedSection],
  );

  const refreshLeadsOutput = useCallback(async (slug: string) => {
    setRefreshingLeads(true);
    try {
      const response = await fetch(
        `/api/spaces/site/leads?slug=${encodeURIComponent(slug)}&nodeId=${encodeURIComponent(nodeId)}`,
      );
      if (!response.ok) return;
      const payload = (await response.json()) as { output?: SiteLeadsOutput };
      if (payload.output) {
        onDataChange({ ...data, leadsOutput: payload.output });
      }
    } finally {
      setRefreshingLeads(false);
    }
  }, [data, nodeId, onDataChange]);

  const handleSaveSectionToLibrary = useCallback(
    (sectionId: string) => {
      const section = activePage.sections.find((entry) => entry.id === sectionId);
      if (!section) return;
      const label = sectionLabels[sectionId] ?? "Sección guardada";
      patchProject(saveSectionToLibrary(project, section, label));
    },
    [activePage.sections, patchProject, project, sectionLabels],
  );

  const handleAddSectionFromLibrary = useCallback(
    (entryId: string) => {
      const clone = cloneSectionFromLibrary(project, entryId);
      if (!clone) return;
      const nextSections = [...activePage.sections, clone];
      patchSiteData({
        project: updateActiveSitePage(project, {
          sections: nextSections,
          nav: { ...activePage.nav, include: [...activePage.nav.include, clone.id] },
        }),
        sectionLabels: {
          ...sectionLabels,
          [clone.id]: (project.sectionLibrary ?? []).find((entry) => entry.id === entryId)?.label ?? "Sección",
        },
      });
      handleSelectSection(clone.id);
    },
    [activePage.nav, activePage.sections, handleSelectSection, patchSiteData, project, sectionLabels],
  );

  const handleRemoveLibraryEntry = useCallback(
    (entryId: string) => {
      patchProject(removeSectionLibraryEntry(project, entryId));
    },
    [patchProject, project],
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
    setPublishing(true);
    setPublishError(null);
    try {
      const slug = sitePublishSlug(project);
      const publishProject = previewProject;
      const response = await fetch("/api/spaces/site/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: { ...publishProject, slug },
          sectionLabels,
          locale: previewLocale,
          nodeId,
          projectId: project.id,
          adn: adn.ready
            ? {
                ready: true,
                brandKitNodeId: adn.brandKitNodeId,
                brandName: adn.brandName,
                oneLiner: adn.oneLiner,
                document: adn.document,
              }
            : null,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        publicUrl?: string;
        slug?: string;
        publishedAt?: string;
        snapshotHash?: string;
        customDomain?: string;
        cdnHostname?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo publicar el sitio.");
      }

      patchSiteData({
        project: {
          ...publishProject,
          slug: payload.slug ?? slug,
          publish: {
            status: "published",
            publishedAt: payload.publishedAt ?? new Date().toISOString(),
            slug: payload.slug ?? slug,
            snapshotHash: payload.snapshotHash,
            publicUrl: payload.publicUrl,
            customDomain: payload.customDomain ?? publishProject.publish.customDomain,
            cdnHostname: payload.cdnHostname,
          },
        },
      });
      void refreshLeadsOutput(payload.slug ?? slug);
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "Error al publicar");
    } finally {
      setPublishing(false);
    }
  }, [adn, nodeId, patchSiteData, previewLocale, previewProject, project.id, refreshLeadsOutput, sectionLabels]);

  const handleExportZip = useCallback(async () => {
    setExporting(true);
    setPublishError(null);
    try {
      const slug = sitePublishSlug(project);
      const response = await fetch("/api/spaces/site/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: { ...previewProject, slug },
          sectionLabels,
          locale: previewLocale,
          adn: adn.ready
            ? {
                ready: true,
                brandKitNodeId: adn.brandKitNodeId,
                brandName: adn.brandName,
                oneLiner: adn.oneLiner,
                document: adn.document,
              }
            : null,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "No se pudo exportar el sitio.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${slug || "sitio"}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "Error al exportar");
    } finally {
      setExporting(false);
    }
  }, [adn, previewLocale, previewProject, project, sectionLabels]);

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
    if (project.publish.status !== "published" && project.publish.status !== "stale") return;
    if (!project.publish.snapshotHash) return;
    let cancelled = false;
    void resolveSitePublishStatus({
      project,
      previewProject,
      sectionLabels,
      locale: previewLocale,
      adn,
    }).then((status) => {
      if (cancelled || status === project.publish.status) return;
      patchProject({ publish: { ...project.publish, status } });
    });
    return () => {
      cancelled = true;
    };
  }, [
    adn.fingerprint,
    patchProject,
    previewLocale,
    previewProject,
    project,
    sectionLabels,
  ]);

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

  useEffect(() => {
    if (project.publish.status !== "published" && project.publish.status !== "stale") return;
    const slug = sitePublishSlug(project);
    if (!slug) return;
    void refreshLeadsOutput(slug);
  }, [project.publish.publishedAt, project.publish.status, project.slug, refreshLeadsOutput]);

  const title = nodeLabel?.trim() || "Site";
  const sectionCount = activePage.sections.length;
  const publishLabel =
    project.publish.status === "stale"
      ? "Republicar cambios"
      : project.publish.status === "published"
        ? "Republicar"
        : "Publicar";
  const isStale = project.publish.status === "stale";

  return (
    <SiteEditorShell
      accent={SITE_STUDIO_ACCENT}
      title={title}
      slug={project.slug}
      project={project}
      previewProject={previewProject}
      sectionLabels={sectionLabels}
      previewLocale={previewLocale}
      adn={adn}
      brandLinked={brandLinked}
      graphStatus={graphStatus}
      datasetLoading={datasetLoading}
      graphApplyPending={graphApplyPending}
      publishing={publishing}
      exporting={exporting}
      publishError={publishError}
      publishLabel={publishLabel}
      canPublish={sectionCount > 0}
      isStale={isStale}
      leadsOutput={data.leadsOutput}
      refreshingLeads={refreshingLeads}
      graphBindingsDataset={graphBindings.dataset}
      contentSourceLabel={graphStatus.content.label}
      generatingCopy={generatingCopy}
      onClose={onClose}
      onPublish={() => void handlePublish()}
      onExportZip={() => void handleExportZip()}
      onPatchProject={patchProject}
      onPatchTheme={patchTheme}
      onApplyGraphBindings={project.autoGraphSync ? undefined : handleApplyGraphBindings}
      onAutoGraphSyncChange={(enabled) => patchProject({ autoGraphSync: enabled })}
      onFillBrandContent={handleFillBrandContent}
      onRefreshLeads={() => void refreshLeadsOutput(sitePublishSlug(project))}
      onPatchPage={handlePatchPage}
      onPatchSlug={handlePatchSlug}
      onPatchPublish={(patch) => patchProject({ publish: { ...project.publish, ...patch } })}
      onPatchLocales={(locales) =>
        patchProject({
          locales: locales.length ? locales : ["es"],
          previewLocale: locales.includes(previewLocale) ? previewLocale : locales[0] ?? "es",
        })
      }
      onPreviewLocaleChange={(locale) => patchProject({ previewLocale: locale })}
      onPatchLedger={handlePatchLedger}
      onGenerateCopy={(action) => void handleGenerateCopy(action)}
      selectedSectionId={selectedSectionId}
      selectedBlockId={selectedBlockId}
      onSelectSection={handleSelectSection}
      onSelectBlock={setSelectedBlockId}
      onSelectPageSettings={handleSelectPageSettings}
      inspectorScope={inspectorScope}
      onSetInspectorScope={setInspectorScope}
      inspectorTab={inspectorTab}
      onInspectorTabChange={setInspectorTab}
      onPatchSection={handlePatchSection}
      onDuplicateSection={handleDuplicateSection}
      onDuplicateBlock={handleDuplicateBlock}
      onRemoveSection={handleRemoveSection}
      onToggleNav={handleToggleNav}
      onRenameSection={handleRenameSection}
      onReorderSections={handleReorderSections}
      onAddSection={handleAddSection}
      onSaveSectionToLibrary={handleSaveSectionToLibrary}
      onAddSectionFromLibrary={handleAddSectionFromLibrary}
      onRemoveLibraryEntry={handleRemoveLibraryEntry}
      onSelectSitePage={handleSelectSitePage}
      onAddSitePage={handleAddSitePage}
      onRemoveSitePage={handleRemoveSitePage}
      onInlineTextEdit={handleInlineTextEdit}
      onInlineButtonEdit={handleInlineButtonEdit}
    />
  );
}
