import { NextRequest, NextResponse } from "next/server";
import { analyzeLogoIntake } from "@/lib/genoma/logo-intake/service";
import { getOrCreateBrandLogoState } from "@/lib/genoma/logo-intake/store";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const auth = await requireSpacesAuthUser(request);
  if (!auth.ok) return auth.response;

  const projectId = request.nextUrl.searchParams.get("projectId")?.trim();
  if (!projectId) {
    return NextResponse.json({ error: "missing_project_id" }, { status: 400 });
  }

  const state = await getOrCreateBrandLogoState(projectId);
  return NextResponse.json({ state });
}

export async function POST(request: NextRequest) {
  const auth = await requireSpacesAuthUser(request);
  if (!auth.ok) return auth.response;

  const form = await request.formData();
  const projectId = String(form.get("projectId") ?? "").trim();
  if (!projectId) {
    return NextResponse.json({ error: "missing_project_id" }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "missing_files" }, { status: 400 });
  }

  try {
    const result = await analyzeLogoIntake({
      projectId,
      files,
      userEmail: auth.user.email,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "analyze_failed";
    const status =
      message.startsWith("file_count_invalid") ||
      message === "unsupported_file_type" ||
      message === "docx_requires_libreoffice"
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
