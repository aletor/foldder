import type { SiteAdnContext } from "./site-adn";
import { renderSiteProject } from "./site-render";
import type { SiteProject } from "./site-types";

/** Hash estable del HTML+CSS publicado (SHA-256 hex) — página activa. */
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
    production: true,
  });
  const payload = `${html}\n---\n${css}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
