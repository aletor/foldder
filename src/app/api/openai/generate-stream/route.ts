import { NextRequest, NextResponse } from "next/server";
import {
  openAiImageGenerate,
  OpenAiGenerateError,
  resolveOpenAiImageQuality,
  type OpenAiImageGenerateBody,
} from "@/lib/openai-image-generate";
import { ApiServiceDisabledError, assertApiServiceEnabled } from "@/lib/api-usage-controls";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { estimateOpenAiImageGenerationUsd } from "@/lib/pricing-config";
import {
  reserveApiWalletCharge,
  reserveUsdToMicros,
  releaseApiWalletChargeOnError,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Misma carga útil que generación Gemini en canvas, pero vía OpenAI gpt-image-2.
 * Respuesta NDJSON con fases y cierre done/error.
 */
export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  let walletCharge: ApiWalletCharge | null = null;
  let usageUserEmail = "";
  let body: OpenAiImageGenerateBody = { prompt: "" };
  let estimatedCostUsd = 0;

  try {
    await assertApiServiceEnabled("openai-images");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    usageUserEmail = authState.user.email;
    body = (await req.json()) as OpenAiImageGenerateBody;
    if (!body?.prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const quality = resolveOpenAiImageQuality(body.resolution);
    estimatedCostUsd = estimateOpenAiImageGenerationUsd(body.resolution, quality, body.aspect_ratio);
    walletCharge = await reserveApiWalletCharge({
      req,
      userEmail: usageUserEmail,
      serviceId: "openai-images",
      provider: "openai",
      route: "/api/openai/generate-stream",
      maxCostMicros: reserveUsdToMicros(estimatedCostUsd, { multiplier: 1.15 }),
      metadata: { model: "gpt-image-2", resolution: body.resolution, quality, responseMode: "ndjson" },
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
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      let clientClosed = false;
      let settled = false;
      let providerSucceeded = false;
      const send = (obj: Record<string, unknown>) => {
        if (clientClosed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        } catch {
          clientClosed = true;
        }
      };

      try {
        const result = await openAiImageGenerate(
          body,
          (progress, stage) => {
            send({ type: "phase", progress, stage });
          },
          { usageRoute: "/api/openai/generate-stream", usageUserEmail },
        );
        providerSucceeded = true;
        await walletCharge?.capture({
          actualCostUsd: estimatedCostUsd,
          metadata: {
            model: result.model,
            responseMode: "ndjson",
            clientClosedBeforeDone: clientClosed,
          },
        });
        settled = true;
        send({
          type: "done",
          output: result.output,
          key: result.key,
          model: result.model,
          time: result.time,
        });
      } catch (err: unknown) {
        if (!settled && !providerSucceeded) await releaseApiWalletChargeOnError(walletCharge, err);
        if (err instanceof ApiServiceDisabledError) {
          send({
            type: "error",
            error: `API bloqueada en admin: ${err.label}`,
            status: 423,
          });
          return;
        }
        if (err instanceof OpenAiGenerateError) {
          send({
            type: "error",
            error: err.message,
            details: err.details,
            status: err.status,
          });
        } else {
          const message = err instanceof Error ? err.message : String(err);
          send({ type: "error", error: message, status: 500 });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // The browser may have cancelled the stream after the provider call; settlement above is authoritative.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
