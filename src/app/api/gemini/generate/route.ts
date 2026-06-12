import { NextRequest, NextResponse } from "next/server";
import { geminiImageGenerate, GeminiGenerateError } from "@/lib/gemini-image-generate";
import { ApiServiceDisabledError, assertApiServiceEnabled } from "@/lib/api-usage-controls";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { estimateGeminiImageGenerationUsd } from "@/lib/pricing-config";
import {
  reserveApiWalletCharge,
  reserveUsdToMicros,
  releaseApiWalletChargeOnError,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  console.log("[Gemini REST] Request received");
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;
  try {
    await assertApiServiceEnabled("gemini-nano");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const body = await req.json();
    if (!body?.prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }
    const modelKey = typeof body?.model === "string" ? body.model : "flash31";
    const resolution = typeof body?.resolution === "string" ? body.resolution : undefined;
    const estimatedCostUsd = estimateGeminiImageGenerationUsd(modelKey, resolution);

    walletCharge = await reserveApiWalletCharge({
      req,
      userEmail: authState.user.email,
      serviceId: "gemini-nano",
      provider: "gemini",
      route: "/api/gemini/generate",
      maxCostMicros: reserveUsdToMicros(estimatedCostUsd, { multiplier: 1.15 }),
      metadata: { model: modelKey, resolution },
    });

    const result = await geminiImageGenerate(body, undefined, {
      usageUserEmail: authState.user.email,
    });
    releaseWalletOnError = false;
    await walletCharge?.capture({
      actualCostUsd: estimatedCostUsd,
      metadata: { model: result.model, resolution },
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { error: `API bloqueada en admin: ${error.label}` },
        { status: 423 },
      );
    }
    if (releaseWalletOnError) await releaseApiWalletChargeOnError(walletCharge, error);
    const walletResponse = walletGateErrorResponse(error);
    if (walletResponse) return walletResponse;
    if (error instanceof GeminiGenerateError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status }
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Gemini REST] Exception:", message);
    return NextResponse.json({ error: `Server Exception: ${message}` }, { status: 500 });
  }
}
