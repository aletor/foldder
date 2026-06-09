import { NextResponse } from 'next/server';
import { recordApiUsage, resolveUsageUserEmailFromRequest } from "@/lib/api-usage";
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import {
  microsToUsd,
  settleProviderJobWalletCharge,
  walletGateErrorResponse,
} from "@/lib/wallet-api-gate";

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    await assertApiServiceEnabled("grok-status");
    const params = await props.params;
    const taskId = params.id;
    if (!taskId) {
      return NextResponse.json({ error: "Task ID is required" }, { status: 400 });
    }

    const response = await fetch(`https://api.x.ai/v1/videos/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
      }
    });

    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    await recordApiUsage({
      provider: "grok",
      userEmail: usageUserEmail,
      serviceId: "grok-status",
      route: "/api/grok/status/[id]",
      operation: "poll_video_task",
      costIsKnown: false,
      costUsd: 0,
      metadata: { taskId, httpStatus: response.status },
    });

    const data = await response.json();
    console.log("[Grok Status Debug] TaskId:", taskId, "Response:", JSON.stringify(data, null, 2));

    if (!response.ok) {
      throw new Error(data.error?.message || data.error || "xAI API error");
    }

    // Normalizing response for frontend
    // xAI statuses can be 'pending', 'queued', 'running', 'done', 'failed', 'expired'
    const rawStatus = (data.status || 'pending').toUpperCase();
    let status = rawStatus;
    
    if (['DONE', 'COMPLETED', 'SUCCEEDED'].includes(rawStatus)) {
      status = 'SUCCEEDED';
    } else if (['FAILED', 'EXPIRED'].includes(rawStatus)) {
      status = 'FAILED';
    }

    const videoUrl = data.video?.url || data.output?.[0];
    const settlement = await settleProviderJobWalletCharge({
      provider: "grok",
      providerJobId: taskId,
      status,
      successStatuses: ["SUCCEEDED"],
      failureStatuses: ["FAILED"],
      metadata: { taskId, providerStatus: status },
    });
    if (settlement.action === "capture" && !settlement.duplicate) {
      await recordApiUsage({
        provider: "grok",
        userEmail: usageUserEmail,
        serviceId: "grok-video",
        route: "/api/grok/status/[id]",
        operation: "complete_task",
        model: "grok-imagine-video",
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: microsToUsd(settlement.capturedMicros),
        metadata: { taskId },
        note: "Vídeo Grok completado; coste capturado desde reserva wallet",
      });
    }

    return NextResponse.json({
      status: status,
      progress: data.progress || (status === 'SUCCEEDED' ? 1 : (data.status === 'running' ? 0.5 : 0)),
      output: videoUrl ? [videoUrl] : [],
      error: data.failure_reason || data.error?.message || (status === 'FAILED' ? "Generation failed" : null)
    });
  } catch (error: unknown) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { error: `API bloqueada en admin: ${error.label}` },
        { status: 423 },
      );
    }
    const walletResponse = walletGateErrorResponse(error);
    if (walletResponse) return walletResponse;
    console.error("[Grok Status API Error]:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
