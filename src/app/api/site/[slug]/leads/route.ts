import { NextResponse } from "next/server";
import { DEFAULT_SITE_LEAD_FORM } from "@/lib/site/site-leads";
import { appendSiteLead } from "@/lib/site/site-leads-store";
import { readPublishedSiteRecord } from "@/lib/site/site-publish-store";

export const runtime = "nodejs";

type LeadBody = {
  name?: string;
  email?: string;
  message?: string;
  pageId?: string;
  locale?: string;
};

export async function POST(
  req: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const record = await readPublishedSiteRecord(slug);
    if (!record) {
      return NextResponse.json({ error: "Sitio no encontrado" }, { status: 404 });
    }

    const body = (await req.json()) as LeadBody;
    const email = body.email?.trim();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Email válido requerido" }, { status: 400 });
    }

    await appendSiteLead({
      slug,
      nodeId: record.nodeId,
      lead: {
        name: body.name,
        email,
        message: body.message,
        pageId: body.pageId,
        locale: body.locale,
      },
    });

    return NextResponse.json({
      ok: true,
      message: DEFAULT_SITE_LEAD_FORM.successMessage,
    });
  } catch (error) {
    console.error("[site/leads/public]", error);
    return NextResponse.json({ error: "Error al guardar el lead" }, { status: 500 });
  }
}
