import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { LearningCandidate } from "@/lib/brain/learning-candidate-schema";
import type { BrainNodeType } from "@/lib/brain/brain-telemetry";
import { BrainValidationError, defaultBrainService } from "@/lib/brain/brain-service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await req.json()) as {
      projectId?: string;
      candidates?: LearningCandidate[];
      workspaceId?: string;
      nodeId?: string;
      sourceSessionIds?: string[];
      telemetryNodeType?: BrainNodeType;
      brainVersion?: number;
      sourceAnalysisId?: string;
      createdFromAnalysisVersion?: string;
    };
    const projectId = body.projectId ?? "";
    const candidates = body.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return NextResponse.json({ error: "candidates array required" }, { status: 400 });
    }
    const { ids } = await defaultBrainService.createLearningCandidates(projectId, candidates, {
      workspaceId: body.workspaceId,
      nodeId: body.nodeId,
      sourceSessionIds: body.sourceSessionIds,
      telemetryNodeType: body.telemetryNodeType,
      brainVersion: body.brainVersion,
      sourceAnalysisId: body.sourceAnalysisId,
      createdFromAnalysisVersion: body.createdFromAnalysisVersion,
    });
    return NextResponse.json({ ok: true, ids });
  } catch (e) {
    if (e instanceof BrainValidationError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    console.error("[brain/learning/candidates]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
