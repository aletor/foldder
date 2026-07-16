import { NextRequest } from "next/server";
import { recordApiUsage } from "@/lib/api-usage";
import { ApiServiceDisabledError, assertApiServiceEnabled } from "@/lib/api-usage-controls";
import type { BrandKitDocument } from "@/lib/brandkit/brand-kit-types";
import {
  ANALYZE_ROUTE,
  BRIEF_MODEL,
  runGalleryCategoryBriefAnalysis,
} from "@/lib/brandkit/run-gallery-category-brief-analysis";
import { estimateGeminiUsd } from "@/lib/pricing-config";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import {
  releaseApiWalletChargeOnError,
  reserveApiWalletCharge,
  reserveUsdToMicros,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";

export const maxDuration = 120;
export const runtime = "nodejs";

function parseBrandKitSnapshot(body: unknown): BrandKitDocument | null {
  if (!body || typeof body !== "object") return null;
  const brandKit = (body as { brandKit?: BrandKitDocument }).brandKit;
  if (!brandKit?.slots) return null;
  return brandKit;
}

function estimateBriefReserveUsd(): number {
  return Math.round(estimateGeminiUsd(BRIEF_MODEL, 9000, 1800) * 1_000_000) / 1_000_000;
}

export async function POST(req: NextRequest) {
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;

  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    await assertApiServiceEnabled("brand-kit-llm-synthesis");

    const body = await req.json().catch(() => ({}));
    const brandKit = parseBrandKitSnapshot(body);
    if (!brandKit) {
      return Response.json({ error: "brandKit snapshot required" }, { status: 400 });
    }

    walletCharge = await reserveApiWalletCharge({
      req,
      userEmail: authState.user.email,
      serviceId: "brand-kit-llm-synthesis",
      provider: "gemini",
      route: ANALYZE_ROUTE,
      maxCostMicros: reserveUsdToMicros(estimateBriefReserveUsd(), { multiplier: 1.5 }),
      metadata: { model: BRIEF_MODEL },
    });

    const result = await runGalleryCategoryBriefAnalysis({
      brandKit,
      userEmail: authState.user.email,
    });

    releaseWalletOnError = false;
    await walletCharge?.capture({
      actualCostUsd: result.costUsd,
      metadata: { briefCount: result.gallery.categoryBriefs?.length ?? 0 },
    });

    return Response.json({
      ok: true,
      gallery: result.gallery,
      costUsd: result.costUsd,
    });
  } catch (error) {
    if (releaseWalletOnError) await releaseApiWalletChargeOnError(walletCharge, error);
    const walletResponse = walletGateErrorResponse(error);
    if (walletResponse) return walletResponse;
    if (error instanceof ApiServiceDisabledError) {
      return Response.json({ error: "Análisis visual deshabilitado." }, { status: 503 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Error analizando briefs de galería" },
      { status: 500 },
    );
  }
}
