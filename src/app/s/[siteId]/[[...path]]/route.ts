import { NextResponse } from "next/server";
import { rewritePublishedHtmlForPublicUrl } from "@/app/spaces/site-creator/site-creator-publish-placeholders";
import {
  cacheControlForPublishedPath,
  isSafePublishedRelativePath,
  isValidPublishedSiteId,
  readPublishedSiteFile,
} from "@/lib/site-creator-publish-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function relativePathFromParts(parts: string[] | undefined): string {
  if (!parts?.length) return "index.html";
  return parts.join("/");
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ siteId: string; path?: string[] }> },
) {
  const { siteId, path: parts } = await ctx.params;
  if (!isValidPublishedSiteId(siteId)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const relativePath = relativePathFromParts(parts);
  if (!isSafePublishedRelativePath(relativePath)) {
    return new NextResponse("Not found", { status: 404 });
  }
  try {
    const file = await readPublishedSiteFile(siteId, relativePath);
    if (!file) return new NextResponse("Not found", { status: 404 });
    const body =
      relativePath === "index.html"
        ? rewritePublishedHtmlForPublicUrl(file.body.toString("utf8"), siteId)
        : file.body;
    return new NextResponse(typeof body === "string" ? body : new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Cache-Control": cacheControlForPublishedPath(relativePath),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[published-site][GET]", error);
    return new NextResponse("Not found", { status: 404 });
  }
}
