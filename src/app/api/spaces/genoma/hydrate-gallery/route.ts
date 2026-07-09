import { NextRequest, NextResponse } from "next/server";
import { mirrorExternalImagesForCrawl } from "@/lib/genoma/crawl/mirror-crawl-images";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const authState = await requireSpacesAuthUser(req);
  if (!authState.ok) return authState.response;

  const body = await req.json().catch(() => ({}));
  const rawUrls = Array.isArray(body?.urls) ? body.urls : [];
  const urls = rawUrls
    .filter((value: unknown): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.startsWith("http"))
    .slice(0, 24);

  if (!urls.length) {
    return NextResponse.json({ mirrored: {} });
  }

  const mirroredMap = await mirrorExternalImagesForCrawl(authState.user.email, urls);
  const mirrored = Object.fromEntries(mirroredMap.entries());
  return NextResponse.json({ mirrored });
}
