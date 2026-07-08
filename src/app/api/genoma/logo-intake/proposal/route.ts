import { NextRequest, NextResponse } from "next/server";
import { getProposalForProject } from "@/lib/genoma/logo-intake/service";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireSpacesAuthUser(request);
  if (!auth.ok) return auth.response;

  const projectId = request.nextUrl.searchParams.get("projectId")?.trim();
  if (!projectId) {
    return NextResponse.json({ error: "missing_project_id" }, { status: 400 });
  }

  const proposal = await getProposalForProject(projectId);
  if (!proposal) {
    return NextResponse.json({ error: "proposal_not_found" }, { status: 404 });
  }
  return NextResponse.json({ proposal });
}
