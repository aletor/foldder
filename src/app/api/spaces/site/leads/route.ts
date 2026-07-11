import { NextResponse } from "next/server";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { buildSiteLeadsOutput } from "@/lib/site/site-leads";
import { listSiteLeads } from "@/lib/site/site-leads-store";
import { readPublishedSiteRecord } from "@/lib/site/site-publish-store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const url = new URL(req.url);
    const slug = url.searchParams.get("slug")?.trim();
    const nodeId = url.searchParams.get("nodeId")?.trim() ?? "";
    if (!slug) {
      return NextResponse.json({ error: "slug requerido" }, { status: 400 });
    }

    const record = await readPublishedSiteRecord(slug);
    if (!record) {
      return NextResponse.json({ error: "Sitio no publicado" }, { status: 404 });
    }
    if (record.ownerEmail.toLowerCase() !== authState.user.email.toLowerCase()) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const items = await listSiteLeads(slug);
    const output = buildSiteLeadsOutput({
      sourceNodeId: nodeId || record.nodeId,
      slug,
      items,
    });

    return NextResponse.json({ ok: true, output });
  } catch (error) {
    console.error("[site/leads]", error);
    return NextResponse.json({ error: "Error al leer leads" }, { status: 500 });
  }
}
