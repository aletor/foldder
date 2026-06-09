import { NextRequest, NextResponse } from 'next/server';
import {
  recordApiUsage,
} from '@/lib/api-usage';
import Replicate from 'replicate';
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import {
  assertUserCanAccessMediaReference,
  ForbiddenMediaReferenceError,
} from "@/lib/api-media-access";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { getPresignedUrl } from "@/lib/s3-utils";
import {
  reserveApiWalletCharge,
  reserveUsdToMicros,
  releaseApiWalletChargeOnError,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";

export async function POST(req: NextRequest) {
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;
  try {
    await assertApiServiceEnabled("replicate-vmatte");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const usageUserEmail = authState.user.email;
    const { video } = await req.json();

    if (typeof video !== "string" || !video.trim()) {
      return NextResponse.json({ error: 'Missing video input' }, { status: 400 });
    }
    const s3Key = await assertUserCanAccessMediaReference(usageUserEmail, video, "video");
    const providerVideo = s3Key ? await getPresignedUrl(s3Key) : video;

    console.log(`--- VIDEO MATTE START --- Engine: RVM`);

    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json({ error: 'REPLICATE_API_TOKEN is not configured' }, { status: 500 });
    }

    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN || "",
    });
    walletCharge = await reserveApiWalletCharge({
      req,
      userEmail: usageUserEmail,
      serviceId: "replicate-vmatte",
      provider: "replicate",
      route: "/api/spaces/video-matte",
      maxCostMicros: reserveUsdToMicros(0.05, { multiplier: 1.25 }),
      metadata: { model: "robust_video_matting" },
    });

    // Inference: Robust Video Matting (arielreplicate/robust_video_matting)
    // Optimized for temporal consistency
    const output = await replicate.run(
      "arielreplicate/robust_video_matting:df03798935c106575239a9cba2e6467fac75586617a264a9fb120a1608674515",
      {
        input: {
          video: providerVideo,
          output_type: "video_rgba" 
        }
      }
    );

    console.log('Video RVM Output:', output);
    releaseWalletOnError = false;
    await walletCharge?.capture({
      actualCostUsd: 0.05,
      metadata: { model: "robust_video_matting" },
    });

    // RVM typically returns a URL to the processed video
    const result_url = Array.isArray(output) ? output[0] : output;

    await recordApiUsage({
      provider: "replicate",
      userEmail: usageUserEmail,
      serviceId: "replicate-vmatte",
      route: "/api/spaces/video-matte",
      model: "robust_video_matting",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0.05,
      note: "Video matte (estimado)",
    });

    return NextResponse.json({
      rgba_url: result_url,
      mask_url: result_url, // RVM can separate these if configured, but for now we return the RGBA
      success: true
    });

  } catch (error: unknown) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { error: `API bloqueada en admin: ${error.label}` },
        { status: 423 },
      );
    }
    if (error instanceof ForbiddenMediaReferenceError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (releaseWalletOnError) await releaseApiWalletChargeOnError(walletCharge, error);
    const walletResponse = walletGateErrorResponse(error);
    if (walletResponse) return walletResponse;
    console.error('[Video Matte] CRITICAL ERROR:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
