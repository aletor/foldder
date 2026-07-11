import { NextResponse } from "next/server";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { normalizeSiteProject } from "@/lib/site/site-defaults";
import { foldderCdnHostname, validateCustomDomain } from "@/lib/site/site-domain";
import { buildPublishedSiteBundle, type SiteAdnPublishPayload } from "@/lib/site/site-publish";
import { isCustomDomainTaken, isSiteSlugTaken, persistPublishedSite } from "@/lib/site/site-publish-store";
import { sitePublicUrl } from "@/lib/site/site-publish-slug";
import type { SiteProject } from "@/lib/site/site-types";

export const runtime = "nodejs";

type PublishBody = {
  project?: SiteProject;
  sectionLabels?: Record<string, string>;
  locale?: string;
  nodeId?: string;
  projectId?: string;
  adn?: SiteAdnPublishPayload | null;
};

export async function POST(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = (await req.json()) as PublishBody;
    if (!body.project?.id) {
      return NextResponse.json({ error: "project requerido" }, { status: 400 });
    }

    const project = normalizeSiteProject(body.project);
    if (!project.pages.some((page) => page.sections.length > 0)) {
      return NextResponse.json({ error: "Añade al menos una sección antes de publicar." }, { status: 400 });
    }

    const bundle = await buildPublishedSiteBundle({
      project,
      sectionLabels: body.sectionLabels ?? {},
      locale: body.locale,
      adn: body.adn ?? null,
    });

    const taken = await isSiteSlugTaken(bundle.slug, authState.user.email);
    if (taken) {
      return NextResponse.json(
        { error: `El slug “${bundle.slug}” ya está en uso. Elige otro en el inspector de página.` },
        { status: 409 },
      );
    }

    const customDomainRaw = project.publish.customDomain?.trim() ?? "";
    let customDomain: string | undefined;
    if (customDomainRaw) {
      const domainValidation = validateCustomDomain(customDomainRaw);
      if (!domainValidation.ok) {
        return NextResponse.json({ error: domainValidation.error }, { status: 400 });
      }
      const domainTaken = await isCustomDomainTaken(
        domainValidation.domain,
        authState.user.email,
        bundle.slug,
      );
      if (domainTaken) {
        return NextResponse.json({ error: "Ese dominio ya está en uso." }, { status: 409 });
      }
      customDomain = domainValidation.domain;
    }

    const publishedAt = new Date().toISOString();
    const origin = new URL(req.url).origin;
    const cdnHostname = foldderCdnHostname(bundle.slug);
    const publicUrl = sitePublicUrl(bundle.slug, origin, { customDomain, cdnHostname });

    await persistPublishedSite({
      record: {
        slug: bundle.slug,
        projectId: body.projectId?.trim() || project.id,
        nodeId: body.nodeId?.trim() || "",
        ownerEmail: authState.user.email,
        publishedAt,
        snapshotHash: bundle.snapshotHash,
        locale: bundle.locale,
        title: bundle.title,
        pages: bundle.documents.map((doc) => ({
          pageId: doc.pageId,
          pathSlug: doc.pathSlug,
          title: doc.title,
          file: doc.file,
        })),
        customDomain,
        cdnHostname,
      },
      documents: bundle.documents.map((doc) => ({
        pathSlug: doc.pathSlug,
        file: doc.file,
        html: doc.html,
      })),
    });

    return NextResponse.json({
      ok: true,
      slug: bundle.slug,
      publicUrl,
      publishedAt,
      snapshotHash: bundle.snapshotHash,
      pageCount: bundle.documents.length,
      customDomain,
      cdnHostname,
    });
  } catch (error) {
    console.error("[site/publish] failed:", error);
    const message = error instanceof Error ? error.message : "Error al publicar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
