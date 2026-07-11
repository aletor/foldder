import { NextRequest, NextResponse } from "next/server";
import { getOrCreateBrandLogoState, readBrandLogoAssetPng, readBrandLogoAssetSvg } from "@/lib/brandkit/logo-intake/store";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireSpacesAuthUser(request);
  if (!auth.ok) return auth.response;

  const projectId = request.nextUrl.searchParams.get("projectId")?.trim();
  const format = request.nextUrl.searchParams.get("format")?.trim() ?? "png";
  if (!projectId) {
    return NextResponse.json({ error: "missing_project_id" }, { status: 400 });
  }

  const state = await getOrCreateBrandLogoState(projectId);
  if (!isValidated(state.status)) {
    return NextResponse.json({ error: "not_validated" }, { status: 404 });
  }

  if (format === "svg") {
    const svg = readBrandLogoAssetSvg(projectId);
    if (!svg) return NextResponse.json({ error: "svg_not_found" }, { status: 404 });
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "private, max-age=60",
      },
    });
  }

  const png = readBrandLogoAssetPng(projectId);
  if (!png) return NextResponse.json({ error: "asset_not_found" }, { status: 404 });
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=60",
    },
  });
}

function isValidated(status: string): boolean {
  return status === "validated" || status === "manual";
}
