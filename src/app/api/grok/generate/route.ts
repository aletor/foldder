import { NextResponse } from 'next/server';
import {
  recordApiUsage,
  resolveUsageUserEmailFromRequest,
} from '@/lib/api-usage';
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import fs from 'fs';
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
import {
  canUserAccessKnowledgeFileKey,
  requireSpacesAuthUser,
} from "@/lib/spaces-access-control";
import { getPresignedUrl } from "@/lib/s3-utils";
import {
  linkApiWalletChargeToProviderJob,
  reserveApiWalletCharge,
  reserveUsdToMicros,
  releaseApiWalletChargeOnError,
  usdToMicros,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";

export async function POST(req: Request) {
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;
  try {
    await assertApiServiceEnabled("grok-video");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    const { promptText, videoUrl, duration, resolution, aspect_ratio } = await req.json();

    if (!promptText) {
      return NextResponse.json({ error: "Prompt text is required" }, { status: 400 });
    }

    // Correct endpoint for video-to-video editing is /edits
    let providerVideoUrl = typeof videoUrl === "string" ? videoUrl : "";
    if (providerVideoUrl) {
      const s3Key = tryExtractKnowledgeFilesKeyFromUrl(providerVideoUrl);
      if (s3Key) {
        const allowed = await canUserAccessKnowledgeFileKey(authState.user.email, s3Key);
        if (!allowed) return NextResponse.json({ error: "forbidden_asset" }, { status: 403 });
        providerVideoUrl = await getPresignedUrl(s3Key);
      }
    }

    const endpoint = providerVideoUrl
      ? 'https://api.x.ai/v1/videos/edits' 
      : 'https://api.x.ai/v1/videos/generations';

    const body = {
      model: "grok-imagine-video",
      prompt: promptText,
      duration: duration || 5,
      ...(resolution && { resolution }),
      ...(aspect_ratio && { aspect_ratio }),
      ...(providerVideoUrl && {
        video: {
          url: providerVideoUrl
        } 
      })
    };

    console.log(`[xAI Grok Request] Using endpoint: ${endpoint}`);
    console.log("[xAI Grok Request] Body:", JSON.stringify(body, null, 2));
    const d = typeof duration === "number" && duration > 0 ? duration : 5;
    const estimatedCostUsd = Math.round(d * 0.04 * 1_000_000) / 1_000_000;
    walletCharge = await reserveApiWalletCharge({
      req,
      userEmail: authState.user.email,
      serviceId: "grok-video",
      provider: "grok",
      route: "/api/grok/generate",
      maxCostMicros: reserveUsdToMicros(estimatedCostUsd, { multiplier: 1.2 }),
      metadata: { model: "grok-imagine-video", duration: d, endpoint },
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    
    const finalizedLogEntry = `
[${new Date().toISOString()}]
DEBUG: Using endpoint: ${endpoint}
BODY: ${JSON.stringify(body, null, 2)}
RESPONSE: ${JSON.stringify(data, null, 2)}
-----------------------------------
`;
    fs.appendFileSync('/tmp/grok_api_debug.log', finalizedLogEntry);

    if (!response.ok) {
      await walletCharge?.release({ reason: "provider_create_error", metadata: { status: response.status } });
      releaseWalletOnError = false;
      throw new Error(data.error?.message || data.error || "xAI API error");
    }

    const taskId =
      (typeof data.id === "string" && data.id) ||
      (typeof data.request_id === "string" && data.request_id) ||
      "";
    if (!taskId) {
      await walletCharge?.release({ reason: "provider_missing_task_id" });
      releaseWalletOnError = false;
      return NextResponse.json({ error: "xAI no devolvió id de tarea" }, { status: 502 });
    }
    releaseWalletOnError = false;
    await linkApiWalletChargeToProviderJob(walletCharge, {
      userEmail: authState.user.email,
      provider: "grok",
      providerJobId: taskId,
      serviceId: "grok-video",
      route: "/api/grok/generate",
      metadata: {
        model: "grok-imagine-video",
        duration: d,
        estimatedCostMicros: usdToMicros(estimatedCostUsd),
      },
    });

    await recordApiUsage({
      provider: "grok",
      userEmail: usageUserEmail,
      serviceId: "grok-video",
      route: "/api/grok/generate",
      operation: "start_task",
      model: "grok-imagine-video",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costIsKnown: false,
      costUsd: 0,
      metadata: { taskId, estimatedCostUsd },
      note: "Vídeo Grok task aceptada; coste se captura al completar",
    });

    // Official response returns a request_id
    return NextResponse.json({ taskId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { error: `API bloqueada en admin: ${error.label}` },
        { status: 423 },
      );
    }
    if (releaseWalletOnError) await releaseApiWalletChargeOnError(walletCharge, error);
    const walletResponse = walletGateErrorResponse(error);
    if (walletResponse) return walletResponse;
    console.error("[Grok API Error]:", error);
    return NextResponse.json({ error: message || "Internal Server Error" }, { status: 500 });
  }
}
