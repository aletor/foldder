import { NextResponse } from 'next/server';
import {
  recordApiUsage,
  resolveUsageUserEmailFromRequest,
} from '@/lib/api-usage';
import RunwayML from '@runwayml/sdk';
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
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

function getRunwayClient() {
  const apiKey =
    process.env.RUNWAYML_API_KEY || process.env.RUNWAYML_API_SECRET || "";
  return new RunwayML({ apiKey });
}

export async function POST(req: Request) {
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;
  try {
    await assertApiServiceEnabled("runway-gen3");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    const { promptText, videoUrl, imageUrl, duration = 5 } = await req.json();

    if (!promptText) {
      return NextResponse.json({ error: "Prompt text is required" }, { status: 400 });
    }

    const runway = getRunwayClient();
    let promptImage = videoUrl || imageUrl;
    if (typeof promptImage === "string") {
      const s3Key = tryExtractKnowledgeFilesKeyFromUrl(promptImage);
      if (s3Key) {
        const allowed = await canUserAccessKnowledgeFileKey(authState.user.email, s3Key);
        if (!allowed) return NextResponse.json({ error: "forbidden_asset" }, { status: 403 });
        promptImage = await getPresignedUrl(s3Key);
      }
    }

    console.log(`[Runway API] Starting ${duration}s generation task...`);
    const dur = duration === 10 ? 10 : 5;
    const estimatedCostUsd = Math.round(dur * 0.05 * 1_000_000) / 1_000_000;
    walletCharge = await reserveApiWalletCharge({
      req,
      userEmail: authState.user.email,
      serviceId: "runway-gen3",
      provider: "runway",
      route: "/api/runway/generate",
      maxCostMicros: reserveUsdToMicros(estimatedCostUsd, { multiplier: 1.2 }),
      metadata: { model: "gen3a_turbo", duration: dur },
    });

    // Using Gen-3 Alpha Turbo for fast results
    const task = await runway.imageToVideo.create({
      model: 'gen3a_turbo',
      promptImage,
      promptText: promptText,
      duration: duration as 5 | 10
    });
    releaseWalletOnError = false;
    await linkApiWalletChargeToProviderJob(walletCharge, {
      userEmail: authState.user.email,
      provider: "runway",
      providerJobId: task.id,
      serviceId: "runway-gen3",
      route: "/api/runway/generate",
      metadata: {
        model: "gen3a_turbo",
        duration: dur,
        estimatedCostMicros: usdToMicros(estimatedCostUsd),
      },
    });

    await recordApiUsage({
      provider: "runway",
      userEmail: usageUserEmail,
      serviceId: "runway-gen3",
      route: "/api/runway/generate",
      operation: "start_task",
      model: "gen3a_turbo",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costIsKnown: false,
      costUsd: 0,
      metadata: { taskId: task.id, estimatedCostUsd },
      note: "Gen-3 task aceptada; coste se captura al completar",
    });

    return NextResponse.json({ taskId: task.id });
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
    console.error("[Runway API Error]:", error);
    return NextResponse.json({ error: message || "Internal Server Error" }, { status: 500 });
  }
}
