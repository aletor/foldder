import { NextResponse } from "next/server";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { normalizeSiteProject } from "@/lib/site/site-defaults";
import { buildPublishedSiteZipBuffer } from "@/lib/site/site-export";
import type { SiteAdnPublishPayload } from "@/lib/site/site-publish";
import type { SiteProject } from "@/lib/site/site-types";

export const runtime = "nodejs";

type ExportBody = {
  project?: SiteProject;
  sectionLabels?: Record<string, string>;
  locale?: string;
  adn?: SiteAdnPublishPayload | null;
};

export async function POST(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = (await req.json()) as ExportBody;
    if (!body.project?.id) {
      return NextResponse.json({ error: "project requerido" }, { status: 400 });
    }

    const project = normalizeSiteProject(body.project);
    if (!project.pages.some((page) => page.sections.length > 0)) {
      return NextResponse.json(
        { error: "Añade al menos una sección antes de exportar." },
        { status: 400 },
      );
    }

    const { buffer, filename } = await buildPublishedSiteZipBuffer({
      project,
      sectionLabels: body.sectionLabels ?? {},
      locale: body.locale,
      adn: body.adn ?? null,
    });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[site/export] failed:", error);
    const message = error instanceof Error ? error.message : "Error al exportar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
