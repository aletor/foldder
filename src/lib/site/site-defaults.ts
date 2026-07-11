import type {
  Block,
  SiteNodeData,
  SiteNodeStatus,
  SitePage,
  SiteProject,
  ThemeState,
} from "./site-types";
import { createFallbackPage } from "./site-project";

export function createSiteId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `site_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createNeutralTheme(): ThemeState {
  return {
    base: "neutral",
    dials: {
      rhythm: "normal",
      radius: "soft",
      polarity: "auto",
      motionIntensity: 1,
    },
    finishPreset: "editorial",
    motionDNA: "soft",
    respectReducedMotion: true,
  };
}

export function createEmptySiteProject(): SiteProject {
  const page = createFallbackPage();
  return {
    id: createSiteId(),
    slug: "",
    pages: [page],
    activePageId: page.id,
    theme: createNeutralTheme(),
    locales: ["es"],
    previewLocale: "es",
    autoGraphSync: true,
    publish: { status: "draft" },
    ledger: [],
  };
}

type LegacySiteProject = SiteProject & { page?: SitePage };

export function normalizeSiteProject(raw?: SiteProject | LegacySiteProject | null): SiteProject {
  if (!raw?.id) return createEmptySiteProject();

  const legacy = raw as LegacySiteProject;
  const pages =
    Array.isArray(raw.pages) && raw.pages.length > 0
      ? raw.pages
      : legacy.page?.id
        ? [legacy.page]
        : createEmptySiteProject().pages;

  const activePageId =
    raw.activePageId && pages.some((page) => page.id === raw.activePageId)
      ? raw.activePageId
      : pages[0]!.id;

  const normalizedPages = pages.map((page) => ({
    ...createFallbackPage(),
    ...page,
    sections: Array.isArray(page.sections) ? page.sections : [],
    nav: {
      enabled: page.nav?.enabled ?? true,
      include: Array.isArray(page.nav?.include) ? page.nav.include : [],
    },
    seo: {
      title: page.seo?.title ?? "",
      description: page.seo?.description ?? "",
    },
  }));

  return {
    ...createEmptySiteProject(),
    ...raw,
    pages: normalizedPages,
    activePageId,
    theme: { ...createNeutralTheme(), ...raw.theme, dials: { ...createNeutralTheme().dials, ...raw.theme?.dials } },
    locales: Array.isArray(raw.locales) && raw.locales.length > 0 ? raw.locales : ["es"],
    previewLocale: raw.previewLocale ?? raw.locales?.[0] ?? "es",
    autoGraphSync: raw.autoGraphSync ?? true,
    publish: { ...createEmptySiteProject().publish, ...raw.publish },
    ledger: Array.isArray(raw.ledger) ? raw.ledger : [],
  };
}

export function isSiteProjectEmpty(project: SiteProject): boolean {
  const page = project.pages.find((entry) => entry.id === project.activePageId) ?? project.pages[0];
  return (page?.sections.length ?? 0) === 0;
}

export function computeSiteNodeStatus(project: SiteProject): SiteNodeStatus {
  if (isSiteProjectEmpty(project)) return "empty";
  if (project.publish.status === "published") return "published";
  return "draft";
}

export function normalizeSiteNodeData(raw?: SiteNodeData | null): SiteNodeData {
  const project = normalizeSiteProject(raw?.project);
  return {
    label: raw?.label,
    project,
    sectionLabels: raw?.sectionLabels ?? {},
    status: raw?.status ?? computeSiteNodeStatus(project),
  };
}

export function createManualBlock(type: Block["type"], content: Block["content"]): Block {
  return {
    id: createSiteId(),
    type,
    source: { kind: "manual" },
    content,
    layout: { bleed: "contained" },
    motion: { mode: "inherit" },
  };
}
