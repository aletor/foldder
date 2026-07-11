import type { SitePage, SiteProject } from "./site-types";

/** Página activa del proyecto (multi-página). */
export function getActiveSitePage(project: SiteProject): SitePage {
  return (
    project.pages.find((page) => page.id === project.activePageId) ??
    project.pages[0] ??
    createFallbackPage()
  );
}

function createPageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `site_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createFallbackPage(): SitePage {
  const id = createPageId();
  return {
    id,
    sections: [],
    nav: { enabled: true, include: [] },
    seo: { title: "", description: "" },
  };
}

export function updateActiveSitePage(
  project: SiteProject,
  patch: Partial<SitePage> | ((page: SitePage) => SitePage),
): SiteProject {
  const active = getActiveSitePage(project);
  const nextPage = typeof patch === "function" ? patch(active) : { ...active, ...patch };
  return {
    ...project,
    pages: project.pages.map((page) => (page.id === active.id ? nextPage : page)),
  };
}

export function setActiveSitePageId(project: SiteProject, pageId: string): SiteProject {
  if (!project.pages.some((page) => page.id === pageId)) return project;
  return { ...project, activePageId: pageId };
}

export function addSitePage(project: SiteProject, page?: SitePage): SiteProject {
  const nextPage = page ?? createFallbackPage();
  return {
    ...project,
    pages: [...project.pages, nextPage],
    activePageId: nextPage.id,
  };
}

export function removeSitePage(project: SiteProject, pageId: string): SiteProject {
  if (project.pages.length <= 1) return project;
  const pages = project.pages.filter((page) => page.id !== pageId);
  const activePageId = project.activePageId === pageId ? pages[0]!.id : project.activePageId;
  return { ...project, pages, activePageId };
}

export function resolvePreviewLocale(project: SiteProject): string {
  return project.previewLocale?.trim() || project.locales[0] || "es";
}

export function siteSectionCount(project: SiteProject): number {
  return getActiveSitePage(project).sections.length;
}

export function isSiteProjectEmpty(project: SiteProject): boolean {
  return siteSectionCount(project) === 0;
}
