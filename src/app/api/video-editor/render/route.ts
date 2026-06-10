import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import type { VideoEditorRenderManifest } from "@/app/spaces/video-editor/video-editor-render-types";
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import { estimateVideoEditorRenderReserveUsd } from "@/lib/pricing-config";
import {
  canUserAccessKnowledgeFileKey,
  requireSpacesAuthUser,
} from "@/lib/spaces-access-control";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
import { createVideoEditorFargateRenderJob } from "@/lib/video-editor/video-editor-fargate-render";
import {
  linkApiWalletChargeToProviderJob,
  reserveApiWalletCharge,
  reserveUsdToMicros,
  releaseApiWalletChargeOnError,
  usdToMicros,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";

export const runtime = "nodejs";
export const maxDuration = 300;

function isRenderManifest(input: unknown): input is VideoEditorRenderManifest {
  if (!input || typeof input !== "object") return false;
  const row = input as Partial<VideoEditorRenderManifest>;
  return (
    typeof row.editorNodeId === "string"
    && typeof row.durationSeconds === "number"
    && Boolean(row.settings)
    && Boolean(row.tracks)
    && Array.isArray(row.tracks?.video)
  );
}

function validateManifest(manifest: VideoEditorRenderManifest): string | null {
  if (manifest.durationSeconds <= 0) return "Timeline duration must be greater than 0.";
  if (!manifest.tracks.video.some((clip) => clip.mediaType === "image" || clip.mediaType === "video")) {
    return "no_visual_clips";
  }
  if (!manifest.settings.width || !manifest.settings.height || !manifest.settings.fps) {
    return "Invalid render settings.";
  }
  return null;
}

function collectManifestS3Keys(manifest: VideoEditorRenderManifest): string[] {
  const keys = new Set<string>();
  const collect = (value: string | undefined) => {
    if (!value) return;
    const key = value.startsWith("knowledge-files/") ? value : tryExtractKnowledgeFilesKeyFromUrl(value);
    if (key) keys.add(key);
  };
  for (const clips of Object.values(manifest.tracks)) {
    for (const clip of clips || []) {
      collect(clip.s3Key);
      collect(clip.assetId);
      collect(clip.url);
    }
  }
  for (const track of manifest.subtitleTracks || []) {
    collect(track.documentKey);
    collect(track.document?.sourceAssetId);
    collect(track.document?.exports?.srtKey);
    collect(track.document?.exports?.vttKey);
    collect(track.document?.exports?.assKey);
  }
  return [...keys];
}

export async function POST(req: Request) {
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    await assertApiServiceEnabled("aws-fargate-render");
    const body = await req.json();
    const manifest = body?.manifest;
    if (!isRenderManifest(manifest)) {
      return NextResponse.json({ renderId: "", status: "error", error: "Invalid render manifest." }, { status: 400 });
    }
    const validationError = validateManifest(manifest);
    if (validationError) {
      return NextResponse.json({ renderId: "", status: "error", error: validationError }, { status: 400 });
    }
    for (const key of collectManifestS3Keys(manifest)) {
      const allowed = await canUserAccessKnowledgeFileKey(authState.user.email, key);
      if (!allowed) {
        return NextResponse.json({ renderId: "", status: "error", error: "forbidden_asset" }, { status: 403 });
      }
    }
    const renderId = randomUUID();
    const estimatedCostUsd = estimateVideoEditorRenderReserveUsd({
      durationSeconds: manifest.durationSeconds,
      fps: manifest.settings.fps,
      height: manifest.settings.height,
      width: manifest.settings.width,
    });
    walletCharge = await reserveApiWalletCharge({
      req,
      userEmail: authState.user.email,
      serviceId: "aws-fargate-render",
      provider: "aws",
      route: "/api/video-editor/render",
      maxCostMicros: reserveUsdToMicros(estimatedCostUsd, { multiplier: 1.25 }),
      operationId: `/api/video-editor/render:${renderId}`,
      requestId: renderId,
      reservationTtlMs: 6 * 60 * 60 * 1000,
      metadata: {
        renderId,
        durationSeconds: manifest.durationSeconds,
        fps: manifest.settings.fps,
        width: manifest.settings.width,
        height: manifest.settings.height,
      },
    });
    await linkApiWalletChargeToProviderJob(walletCharge, {
      userEmail: authState.user.email,
      provider: "aws",
      providerJobId: renderId,
      serviceId: "aws-fargate-render",
      route: "/api/video-editor/render",
      metadata: {
        estimatedCostMicros: usdToMicros(estimatedCostUsd),
        durationSeconds: manifest.durationSeconds,
        fps: manifest.settings.fps,
        width: manifest.settings.width,
        height: manifest.settings.height,
      },
    });
    const result = await createVideoEditorFargateRenderJob(manifest, {
      renderId,
      userEmail: authState.user.email,
    });
    releaseWalletOnError = false;
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { renderId: "", status: "error", error: `API bloqueada en admin: ${error.label}` },
        { status: 423 },
      );
    }
    if (releaseWalletOnError) await releaseApiWalletChargeOnError(walletCharge, error);
    const walletResponse = walletGateErrorResponse(error);
    if (walletResponse) return walletResponse;
    const message = error instanceof Error ? error.message : "render_failed";
    console.error("[video-editor-render]", error);
    return NextResponse.json({ renderId: "", status: "error", error: message }, { status: 500 });
  }
}
