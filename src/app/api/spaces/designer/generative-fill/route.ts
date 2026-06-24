import { NextRequest, NextResponse } from "next/server";
import { assertApiServiceEnabled, ApiServiceDisabledError } from "@/lib/api-usage-controls";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { estimateGeminiImageGenerationUsd } from "@/lib/pricing-config";
import {
  reserveApiWalletCharge,
  reserveUsdToMicros,
  releaseApiWalletChargeOnError,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";
import {
  buildCorrectionMetadata,
  runGenerativeFillPipeline,
} from "@/lib/designer/generative-fill/pipeline";
import type { GenerativeFillRect } from "@/lib/designer/generative-fill/types";

export const runtime = "nodejs";
export const maxDuration = 300;

function isRect(v: unknown): v is GenerativeFillRect {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.x === "number" &&
    typeof r.y === "number" &&
    typeof r.w === "number" &&
    typeof r.h === "number" &&
    r.w > 0 &&
    r.h > 0
  );
}

export async function POST(req: NextRequest) {
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;
  try {
    await assertApiServiceEnabled("gemini-nano");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = (await req.json()) as Record<string, unknown>;
    const composite = typeof body.composite === "string" ? body.composite.trim() : "";
    if (!composite) {
      return NextResponse.json({ error: "composite is required" }, { status: 400 });
    }

    const selectionsRaw = body.selections;
    const selections = Array.isArray(selectionsRaw) ? selectionsRaw.filter(isRect) : [];
    if (selections.length === 0) {
      return NextResponse.json({ error: "At least one selection rect is required" }, { status: 400 });
    }

    const pageWidth = typeof body.pageWidth === "number" ? body.pageWidth : 0;
    const pageHeight = typeof body.pageHeight === "number" ? body.pageHeight : 0;
    if (pageWidth < 1 || pageHeight < 1) {
      return NextResponse.json({ error: "pageWidth and pageHeight are required" }, { status: 400 });
    }

    const estimatedCostUsd = estimateGeminiImageGenerationUsd("flash31", "2k");
    walletCharge = await reserveApiWalletCharge({
      req,
      userEmail: authState.user.email,
      serviceId: "gemini-nano",
      provider: "gemini",
      route: "/api/spaces/designer/generative-fill",
      maxCostMicros: reserveUsdToMicros(estimatedCostUsd, { multiplier: 1.15 }),
      metadata: { feature: "generative-fill" },
    });

    const result = await runGenerativeFillPipeline({
      composite,
      width: pageWidth,
      height: pageHeight,
      selections,
      prompt: typeof body.prompt === "string" ? body.prompt : undefined,
      feather: typeof body.feather === "number" ? body.feather : undefined,
      contextBleed: typeof body.contextBleed === "number" ? body.contextBleed : undefined,
      seed: typeof body.seed === "number" ? body.seed : undefined,
      mode: body.mode === "outpaint" ? "outpaint" : "inpaint",
      model: "nano-banana",
      userEmail: authState.user.email,
    });

    const resultLayerId = `gf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const correction = buildCorrectionMetadata(result, selections, resultLayerId);

    releaseWalletOnError = false;
    await walletCharge?.capture({
      actualCostUsd: estimatedCostUsd,
      metadata: { feature: "generative-fill", model: "nano-banana" },
    });

    return NextResponse.json({
      resultPng: `data:image/png;base64,${result.rgbaPng.toString("base64")}`,
      layer: result.layerRect,
      correction,
    });
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
    const message = error instanceof Error ? error.message : String(error);
    console.error("[designer/generative-fill] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
