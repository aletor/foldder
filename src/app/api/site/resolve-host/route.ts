import { NextResponse } from "next/server";
import { resolveSiteSlugFromHost } from "@/lib/site/site-domain-server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const host = url.searchParams.get("host")?.trim().toLowerCase();
  if (!host) {
    return NextResponse.json({ error: "host requerido" }, { status: 400 });
  }

  const slug = await resolveSiteSlugFromHost(host);
  return NextResponse.json({ slug });
}
