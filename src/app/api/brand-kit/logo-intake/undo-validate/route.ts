import { NextRequest, NextResponse } from "next/server";
import { undoLogoIntakeValidate } from "@/lib/brandkit/logo-intake/service";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireSpacesAuthUser(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as { projectId?: string; token?: string };
    const projectId = body.projectId?.trim();
    const token = body.token?.trim();
    if (!projectId || !token) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    const result = await undoLogoIntakeValidate({ projectId, token });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "undo_failed";
    const status = message === "undo_expired" ? 410 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
