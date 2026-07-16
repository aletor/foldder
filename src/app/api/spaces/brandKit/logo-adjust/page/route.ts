import { NextRequest, NextResponse } from "next/server";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { loadBrandKitSourceForLogoAdjust } from "@/lib/brandkit/ingest/brand-kit-source-pdf-store";
import { resolveLogoAdjustPagePayload } from "@/lib/brandkit/ingest/brand-kit-logo-adjust-page";
import type { NormalizedBboxPage } from "@/lib/brandkit/brand-kit-logo-bbox";
import { isValidBboxPage } from "@/lib/brandkit/brand-kit-logo-bbox";

export const runtime = "nodejs";
export const maxDuration = 60;

function parseBboxPage(raw: string | null): NormalizedBboxPage | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 4) return null;
    const nums = parsed.map((value) => Number(value));
    if (!isValidBboxPage(nums)) return null;
    return nums as NormalizedBboxPage;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireSpacesAuthUser(request);
  if (!auth.ok) return auth.response;

  const contentSha256 = request.nextUrl.searchParams.get("contentSha256")?.trim();
  const pageNumber = Number(request.nextUrl.searchParams.get("pageNumber"));
  const bboxRaw = request.nextUrl.searchParams.get("bboxPage");
  if (!contentSha256 || !Number.isInteger(pageNumber) || pageNumber < 1) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const bboxPage = parseBboxPage(bboxRaw) ?? ([0.04, 0.03, 0.32, 0.12] as NormalizedBboxPage);

  try {
    const payload = await resolveLogoAdjustPagePayload({
      userEmail: auth.user.email,
      contentSha256,
      pageNumber,
      bboxPage,
      loadSource: () => loadBrandKitSourceForLogoAdjust(auth.user.email, contentSha256),
    });
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof Error && error.message === "source_not_found") {
      return NextResponse.json({ error: "source_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "edit_page_failed" }, { status: 500 });
  }
}
