import { NextRequest, NextResponse } from "next/server";
import { validateLogoIntakeCandidate, validateLogoIntakeManual } from "@/lib/genoma/logo-intake/service";
import { normalizeGenome } from "@/lib/genoma/model/trait";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireSpacesAuthUser(request);
  if (!auth.ok) return auth.response;

  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const projectId = String(form.get("projectId") ?? "").trim();
      const candidateId = String(form.get("candidateId") ?? "").trim();
      const kind = String(form.get("kind") ?? "accept_best").trim() as "accept_best" | "accept_alternative";
      const manualFile = form.get("manualFile");
      const genomeRaw = String(form.get("genome") ?? "{}");

      if (!projectId) {
        return NextResponse.json({ error: "missing_project_id" }, { status: 400 });
      }

      const genome = normalizeGenome(JSON.parse(genomeRaw));

      if (manualFile instanceof File) {
        const result = await validateLogoIntakeManual({
          projectId,
          file: manualFile,
          genome,
          userEmail: auth.user.email,
        });
        return NextResponse.json(result);
      }

      if (!candidateId) {
        return NextResponse.json({ error: "missing_candidate_id" }, { status: 400 });
      }

      const result = await validateLogoIntakeCandidate({
        projectId,
        candidateId,
        kind: kind === "accept_alternative" ? "accept_alternative" : "accept_best",
        genome,
        userEmail: auth.user.email,
      });
      return NextResponse.json(result);
    }

    const body = (await request.json()) as {
      projectId?: string;
      candidateId?: string;
      kind?: "accept_best" | "accept_alternative";
      adjustedBboxPage?: [number, number, number, number];
      genome?: unknown;
    };
    const projectId = body.projectId?.trim();
    const candidateId = body.candidateId?.trim();
    if (!projectId || !candidateId) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    const adjusted =
      Array.isArray(body.adjustedBboxPage) && body.adjustedBboxPage.length === 4
        ? (body.adjustedBboxPage as [number, number, number, number])
        : undefined;

    const result = await validateLogoIntakeCandidate({
      projectId,
      candidateId,
      kind: body.kind === "accept_alternative" ? "accept_alternative" : "accept_best",
      adjustedBboxPage: adjusted,
      genome: normalizeGenome(body.genome),
      userEmail: auth.user.email,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "validate_failed";
    const status = message === "candidate_not_found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
