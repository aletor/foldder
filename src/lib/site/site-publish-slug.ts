import type { SitePage, SiteProject } from "./site-types";
import { getActiveSitePage } from "./site-project";
import { foldderCdnHostname, normalizeCustomDomain } from "./site-domain";

export const RESERVED_SITE_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "assets",
  "auth",
  "billing",
  "brand-kit-preview",
  "dashboard",
  "foldder",
  "login",
  "site",
  "sites",
  "spaces",
  "static",
  "www",
]);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugifySiteLabel(value: string, fallback = "pagina"): string {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

export function sitePublishSlug(project: SiteProject): string {
  const explicit = project.slug?.trim() || project.publish.slug?.trim();
  if (explicit) return slugifySiteLabel(explicit, "mi-marca");
  const title = getActiveSitePage(project).seo.title.trim();
  return slugifySiteLabel(title, "mi-marca");
}

export function sitePagePathSlug(page: SitePage, index: number): string {
  if (index === 0) return "index";
  return slugifySiteLabel(page.seo.title.trim() || `pagina-${index + 1}`, `pagina-${index + 1}`);
}

export type SiteSlugValidation =
  | { ok: true; slug: string }
  | { ok: false; error: string };

export function validateSitePublishSlug(raw: string): SiteSlugValidation {
  const slug = slugifySiteLabel(raw, "");
  if (!slug) return { ok: false, error: "El slug no puede estar vacío." };
  if (slug.length < 2) return { ok: false, error: "El slug debe tener al menos 2 caracteres." };
  if (!SLUG_PATTERN.test(slug)) {
    return { ok: false, error: "Usa solo minúsculas, números y guiones." };
  }
  if (RESERVED_SITE_SLUGS.has(slug)) {
    return { ok: false, error: `“${slug}” está reservado.` };
  }
  return { ok: true, slug };
}

export function sitePublicPath(slug: string, pagePathSlug = "index"): string {
  if (pagePathSlug === "index") return `/site/${slug}`;
  return `/site/${slug}/${pagePathSlug}`;
}

export function sitePublicUrl(
  slug: string,
  origin?: string,
  opts?: { customDomain?: string; cdnHostname?: string },
): string {
  const custom = opts?.customDomain?.trim();
  if (custom) {
    return `https://${normalizeCustomDomain(custom)}`;
  }
  const cdn = opts?.cdnHostname?.trim() || foldderCdnHostname(slug);
  if (process.env.FOLDDER_SITE_PREFER_CDN === "true") {
    return `https://${cdn}`;
  }
  const base = (origin ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const path = sitePublicPath(slug);
  return base ? `${base}${path}` : path;
}
