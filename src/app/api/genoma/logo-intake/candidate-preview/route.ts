import { NextRequest, NextResponse } from "next/server";
import { getCandidateHiResPreview } from "@/lib/genoma/logo-intake/service";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await requireSpacesAuthUser(request);
  if (!auth.ok) return auth.response;

  const projectId = request.nextUrl.searchParams.get("projectId")?.trim();
  const candidateId = request.nextUrl.searchParams.get("candidateId")?.trim();
  if (!projectId || !candidateId) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  try {
    const preview = await getCandidateHiResPreview({ projectId, candidateId });
    return NextResponse.json(preview);
  } catch (error) {
    const message = error instanceof Error ? error.message : "preview_failed";
    const status = message === "proposal_expired" || message === "candidate_not_found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
