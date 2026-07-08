import { NextRequest, NextResponse } from "next/server";
import { vectorizeLogoIntake } from "@/lib/genoma/logo-intake/service";
import { readBrandLogoAssetSvg } from "@/lib/genoma/logo-intake/store";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const auth = await requireSpacesAuthUser(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as { projectId?: string };
  const projectId = body.projectId?.trim();
  if (!projectId) {
    return NextResponse.json({ error: "missing_project_id" }, { status: 400 });
  }

  try {
    const state = await vectorizeLogoIntake(projectId);
    const svg = readBrandLogoAssetSvg(projectId);
    if (!svg) {
      return NextResponse.json({ error: "vectorize_empty" }, { status: 500 });
    }
    return NextResponse.json({ state, svg });
  } catch (error) {
    const message = error instanceof Error ? error.message : "vectorize_failed";
    const status = message === "no_validated_logo" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
