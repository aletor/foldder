import type { SiteAdnContext } from "./site-adn";
import { renderSiteProject } from "./site-render";
import { getActiveSitePage } from "./site-project";
import type { SiteProject } from "./site-types";

/** Hash estable del HTML+CSS publicado (SHA-256 hex). */
export async function computeSiteSnapshotHash(
  project: SiteProject,
  options?: {
    sectionLabels?: Record<string, string>;
    adn?: SiteAdnContext | null;
    locale?: string;
  },
): Promise<string> {
  const { html, css } = renderSiteProject(project, {
    locale: options?.locale ?? project.locales[0],
    sectionLabels: options?.sectionLabels,
    adn: options?.adn,
  });
  const payload = `${html}\n---\n${css}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function sitePublishSlug(project: SiteProject): string {
  const slug = project.slug?.trim() || project.publish.slug?.trim();
  if (slug) return slug;
  const title = getActiveSitePage(project).seo.title.trim();
  if (!title) return "mi-marca";
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "mi-marca";
}
