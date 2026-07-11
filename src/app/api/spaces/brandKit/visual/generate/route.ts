import { NextRequest, NextResponse } from "next/server";
import { assertApiServiceEnabled } from "@/lib/api-usage-controls";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { geminiImageGenerate } from "@/lib/gemini-image-generate";
import { axesSignature } from "@/lib/brandkit/ingest/paid-operations";
import { reserveBrandKitVisualGenerateCharge } from "@/lib/brandkit/ingest/brand-kit-visual-wallet";
import type { ImageAxes } from "@/lib/brandkit/model/trait-values";
import { estimateGeminiImageGenerationUsd } from "@/lib/pricing-config";
import {
  releaseApiWalletChargeOnError,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";

export const runtime = "nodejs";
export const maxDuration = 120;

function axesPrompt(axes: ImageAxes, hasReferenceImage: boolean): string {
  const parts = Object.entries(axes)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`);
  const refHint = hasReferenceImage
    ? "Use the attached reference photo for subject, wardrobe and lighting direction. Do not copy identity literally. "
    : "";
  return `${refHint}Brand photography reference, editorial quality. ${parts.join(". ")}. No text, no logo, no watermark.`;
}

export async function POST(req: NextRequest) {
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;
  try {
    await assertApiServiceEnabled("gemini-nano");
    const auth = await requireSpacesAuthUser(req);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => null);
    const axes = body?.axes as ImageAxes | undefined;
    const cachedImageUrl = typeof body?.cachedImageUrl === "string" ? body.cachedImageUrl.trim() : "";
    const referenceImageUrl =
      typeof body?.referenceImageUrl === "string" ? body.referenceImageUrl.trim() : "";
    if (!axes || typeof axes !== "object") {
      return NextResponse.json({ error: "axes required" }, { status: 400 });
    }

    const signature = axesSignature(axes);
    const operationId =
      typeof body?.operationId === "string" && body.operationId.trim()
        ? body.operationId.trim()
        : undefined;

    if (cachedImageUrl) {
      return NextResponse.json({
        imageUrl: cachedImageUrl,
        cached: true,
        operationId: operationId ?? signature,
      });
    }

    const estimatedCostUsd = estimateGeminiImageGenerationUsd("flash31", "1k");
    walletCharge = await reserveBrandKitVisualGenerateCharge({
      req,
      userEmail: auth.user.email,
      axesSignature: signature,
      operationId,
    });

    const images = referenceImageUrl ? [referenceImageUrl] : undefined;
    const result = await geminiImageGenerate(
      {
        prompt: axesPrompt(axes, Boolean(referenceImageUrl)),
        images,
        model: "flash31",
        aspect_ratio: "4:3",
        resolution: "1k",
      },
      undefined,
      { usageUserEmail: auth.user.email, usageRoute: "/api/spaces/brandKit/visual/generate" },
    );

    await walletCharge?.capture({
      actualCostUsd: estimatedCostUsd,
      metadata: { model: result.model },
    });
    releaseWalletOnError = false;

    return NextResponse.json({ imageUrl: result.output, operationId: walletCharge?.operationId ?? operationId });
  } catch (err) {
    if (releaseWalletOnError) await releaseApiWalletChargeOnError(walletCharge, err);
    const walletResponse = walletGateErrorResponse(err);
    if (walletResponse) return walletResponse;
    const message = err instanceof Error ? err.message : "Error generando imagen";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
