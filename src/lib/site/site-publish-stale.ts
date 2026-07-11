import type { SiteAdnContext } from "./site-adn";
import { buildPublishedSiteBundle, type SiteAdnPublishPayload } from "./site-publish";
import type { SiteProject, PublishStatus } from "./site-types";

export async function computePublishedSnapshotHash(input: {
  project: SiteProject;
  sectionLabels?: Record<string, string>;
  locale?: string;
  adn?: SiteAdnContext | SiteAdnPublishPayload | null;
}): Promise<string> {
  const bundle = await buildPublishedSiteBundle({
    project: input.project,
    sectionLabels: input.sectionLabels,
    locale: input.locale,
    adn: input.adn as SiteAdnPublishPayload | null,
  });
  return bundle.snapshotHash;
}

export async function resolveSitePublishStatus(args: {
  project: SiteProject;
  previewProject: SiteProject;
  sectionLabels?: Record<string, string>;
  locale?: string;
  adn?: SiteAdnContext | SiteAdnPublishPayload | null;
}): Promise<PublishStatus> {
  const publishedHash = args.project.publish.snapshotHash?.trim();
  if (!publishedHash || args.project.publish.status !== "published") {
    return args.project.publish.status === "published" ? "published" : "draft";
  }

  const currentHash = await computePublishedSnapshotHash({
    project: args.previewProject,
    sectionLabels: args.sectionLabels,
    locale: args.locale,
    adn: args.adn,
  });

  return currentHash === publishedHash ? "published" : "stale";
}

export function sitePublishStatusLabel(status: PublishStatus, hasSections: boolean): string {
  if (!hasSections) return "Vacío";
  if (status === "published") return "Publicado";
  if (status === "stale") return "Cambios pendientes";
  return "Borrador";
}
