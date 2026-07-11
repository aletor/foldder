import type { SiteAdnContext } from "./site-adn";
import { resolveSiteAdnFromBrandKit } from "./site-adn";
import type { BrandKitDocument } from "@/lib/brandkit/brand-kit-types";
import { normalizeSiteProject } from "./site-defaults";
import { getActiveSitePage } from "./site-project";
import { buildSiteHtmlDocument, renderSiteProject } from "./site-render";
import { sitePagePathSlug, sitePublishSlug, validateSitePublishSlug } from "./site-publish-slug";
import type { SiteProject } from "./site-types";

export { computeSiteSnapshotHash } from "./site-publish-hash";
export {
  sitePagePathSlug,
  sitePublicPath,
  sitePublicUrl,
  sitePublishSlug,
  validateSitePublishSlug,
} from "./site-publish-slug";

export type SiteAdnPublishPayload = {
  ready?: boolean;
  brandName?: string;
  oneLiner?: string;
  brandKitNodeId?: string | null;
  document?: BrandKitDocument | null;
};

export function resolveSiteAdnForPublish(payload?: SiteAdnPublishPayload | null): SiteAdnContext | null {
  if (!payload?.document && !payload?.ready) return null;
  return resolveSiteAdnFromBrandKit(payload.document, {
    brandKitNodeId: payload.brandKitNodeId ?? null,
  });
}

export type PublishedSiteDocument = {
  pathSlug: string;
  pageId: string;
  title: string;
  file: string;
  html: string;
};

export type BuildPublishedSiteBundleInput = {
  project: SiteProject;
  sectionLabels?: Record<string, string>;
  locale?: string;
  adn?: SiteAdnPublishPayload | null;
};

export type PublishedSiteBundle = {
  slug: string;
  locale: string;
  title: string;
  snapshotHash: string;
  documents: PublishedSiteDocument[];
};

export async function buildPublishedSiteBundle(input: BuildPublishedSiteBundleInput): Promise<PublishedSiteBundle> {
  const project = normalizeSiteProject(input.project);
  const locale = input.locale?.trim() || project.previewLocale || project.locales[0] || "es";
  const adn = resolveSiteAdnForPublish(input.adn);
  const slug = sitePublishSlug(project);
  const validation = validateSitePublishSlug(slug);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const documents: PublishedSiteDocument[] = project.pages.map((page, index) => {
    const pathSlug = sitePagePathSlug(page, index);
    const file = pathSlug === "index" ? "pages/index.html" : `pages/${pathSlug}.html`;
    return {
      pathSlug,
      pageId: page.id,
      title: page.seo.title.trim() || `Página ${index + 1}`,
      file,
      html: buildSiteHtmlDocument(project, {
        pageId: page.id,
        locale,
        sectionLabels: input.sectionLabels,
        adn,
        production: true,
        publishedSlug: validation.slug,
      }),
    };
  });

  const hashParts: string[] = [];
  for (const page of project.pages) {
    const { html, css } = renderSiteProject(project, {
      pageId: page.id,
      locale,
      sectionLabels: input.sectionLabels,
      adn,
      production: true,
    });
    hashParts.push(`${html}\n---\n${css}`);
  }
  const payload = hashParts.join("\n====\n");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  const snapshotHash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  const title = getActiveSitePage(project).seo.title.trim() || documents[0]?.title || "Sitio";

  return {
    slug: validation.slug,
    locale,
    title,
    snapshotHash,
    documents,
  };
}
