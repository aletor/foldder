import { NextResponse } from 'next/server';
import RunwayML from '@runwayml/sdk';
import { recordApiUsage, resolveUsageUserEmailFromRequest } from "@/lib/api-usage";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

function getRunwayClient() {
  const apiKey =
    process.env.RUNWAYML_API_KEY || process.env.RUNWAYML_API_SECRET || "";
  return new RunwayML({ apiKey });
}

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const params = await props.params;
    const taskId = params.id;
    if (!taskId) {
      return NextResponse.json({ error: "Task ID is required" }, { status: 400 });
    }

    const runway = getRunwayClient();
    const task = await runway.tasks.retrieve(taskId) as {
      failureCode?: string;
      failureReason?: string;
      output?: unknown;
      progress?: number;
      status?: string;
    };

    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    await recordApiUsage({
      provider: "runway",
      userEmail: usageUserEmail,
      serviceId: "runway-status",
      route: "/api/runway/status/[id]",
      operation: "poll_task",
      costIsKnown: false,
      costUsd: 0,
      metadata: { taskId },
    });

    return NextResponse.json({
      status: task.status, // 'PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'
      progress: task.progress,
      output: task.output, // Array of URLs if SUCCEEDED
      error: task.failureCode || task.failureReason
    });
  } catch (error: unknown) {
    console.error("[Runway Status API Error]:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
