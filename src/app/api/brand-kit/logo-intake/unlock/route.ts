import { NextRequest, NextResponse } from "next/server";
import { unlockLogoIntake } from "@/lib/brandkit/logo-intake/service";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireSpacesAuthUser(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as { projectId?: string };
  const projectId = body.projectId?.trim();
  if (!projectId) {
    return NextResponse.json({ error: "missing_project_id" }, { status: 400 });
  }

  try {
    const state = await unlockLogoIntake(projectId);
    return NextResponse.json({ state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unlock_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
