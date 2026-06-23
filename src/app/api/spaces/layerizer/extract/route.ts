import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { recordApiUsage } from "@/lib/api-usage";
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import { ForbiddenMediaReferenceError } from "@/lib/api-media-access";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import {
  reserveApiWalletCharge,
  reserveUsdToMicros,
  releaseApiWalletChargeOnError,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";
import { resolveLayerizerMaster } from "@/lib/layerizer/layerizer-master";
import { runLayerizerJob } from "@/lib/layerizer/layerizer-orchestrator";
import { estimateLayerizerJobCostUsd } from "@/lib/layerizer/layerizer-config";
import {
  completeLayerizerJob,
  patchLayerizerJobStatus,
  putLayerizerJob,
} from "@/lib/layerizer/layerizer-job-store";
import type {
  LayerizerCleanPlateMethod,
  LayerizerStreamEvent,
  SelectedObject,
} from "@/app/spaces/layerizer/layerizer-types";

export const maxDuration = 300;

/**
 * Paso B→F — Extract Layout (job pagado). Responde un stream NDJSON de LayerizerStreamEvent.
 * Wallet: reserva la suma estimada (gate 402), captura lo consumido al cerrar, libera el resto.
 */
export async function POST(req: NextRequest) {
  let walletCharge: ApiWalletCharge | null = null;
  try {
    await assertApiServiceEnabled("layerizer-segment");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const usageUserEmail = authState.user.email;

    const body = await req.json().catch(() => ({}));
    const image = typeof body?.image === "string" ? body.image.trim() : "";
    const selected = Array.isArray(body?.selected) ? (body.selected as SelectedObject[]) : [];
    const cleanPlateMethod: LayerizerCleanPlateMethod = "describe";
    if (!image) return NextResponse.json({ error: "Missing image input" }, { status: 400 });
    if (selected.length === 0) return NextResponse.json({ error: "No objects selected" }, { status: 400 });

    const master = await resolveLayerizerMaster(usageUserEmail, image);
    const meta = await sharp(master.buffer).metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;
    if (!width || !height) {
      return NextResponse.json({ error: "Could not read image dimensions" }, { status: 400 });
    }

    const estimateUsd = estimateLayerizerJobCostUsd(selected);
    walletCharge = await reserveApiWalletCharge({
      req,
      userEmail: usageUserEmail,
      serviceId: "layerizer-segment",
      provider: "replicate",
      route: "/api/spaces/layerizer/extract",
      maxCostMicros: reserveUsdToMicros(estimateUsd, { multiplier: 1.25 }),
      metadata: { op: "layerizer-extract", objects: selected.length },
    });

    const jobId = randomUUID();
    await putLayerizerJob({
      id: jobId,
      status: "queued",
      masterUrl: image,
      masterS3Key: master.s3Key,
      selected,
      walletReservationId: walletCharge?.reservationId ?? "none",
      cleanPlateMethod,
      ownerEmail: usageUserEmail,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: LayerizerStreamEvent) => {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        };
        try {
          const result = await runLayerizerJob(
            {
              jobId,
              userEmail: usageUserEmail,
              master: master.buffer,
              masterUrl: image,
              masterS3Key: master.s3Key,
              width,
              height,
              selected,
              cleanPlateMethod,
            },
            (event) => {
              send(event);
              void patchLayerizerJobStatus(jobId, event.status);
            },
          );

          if (result.consumedUsd > 0) {
            await walletCharge?.capture({
              actualCostUsd: result.consumedUsd,
              metadata: { jobId, layers: result.output.layers.length, status: result.status },
            });
          } else {
            await walletCharge?.release({ reason: "no_work_consumed" });
          }
          await recordApiUsage({
            provider: "replicate",
            userEmail: usageUserEmail,
            serviceId: "layerizer-segment",
            route: "/api/spaces/layerizer/extract",
            model: "layerizer-v1",
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            costUsd: result.consumedUsd,
            note: `Layerizer extracción (${result.output.layers.length} capas)`,
          });
          await completeLayerizerJob(jobId, result.status, result.output);
          send({ type: "done", jobId, output: result.output, status: result.status });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[layerizer:extract:${jobId}] failed:`, error);
          await releaseApiWalletChargeOnError(walletCharge, error);
          await patchLayerizerJobStatus(jobId, "failed", {
            error: { step: "segmenting", message: message.slice(0, 240) },
          });
          send({ type: "error", jobId, status: "failed", step: "segmenting", message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: unknown) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json({ error: `API bloqueada en admin: ${error.label}` }, { status: 423 });
    }
    if (error instanceof ForbiddenMediaReferenceError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    await releaseApiWalletChargeOnError(walletCharge, error);
    const walletResponse = walletGateErrorResponse(error);
    if (walletResponse) return walletResponse;
    const message = error instanceof Error ? error.message : String(error);
    console.error("[layerizer:extract] error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
