import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAppHost } from "@/lib/site/site-domain";
import { resolveSiteSlugFromHostEdge } from "@/lib/site/site-domain-edge";

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.trim().toLowerCase() ?? "";
  if (!host || isAppHost(host)) {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/site") ||
    pathname.startsWith("/spaces") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/f/") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const slug = await resolveSiteSlugFromHostEdge(host, request.url);
  if (!slug) return NextResponse.next();

  const suffix = pathname === "/" ? "" : pathname.replace(/^\//, "");
  const targetPath = suffix ? `/site/${slug}/${suffix}` : `/site/${slug}`;

  return NextResponse.rewrite(new URL(targetPath, request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
