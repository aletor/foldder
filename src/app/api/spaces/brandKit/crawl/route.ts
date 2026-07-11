import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { recordApiUsage } from "@/lib/api-usage";
import { ApiServiceDisabledError, assertApiServiceEnabled } from "@/lib/api-usage-controls";
import { assertPublicHttpUrl } from "@/lib/ssrf-url-guard";
import { estimateGeminiUsd } from "@/lib/pricing-config";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { normalizeBrandKitUrlInput } from "@/lib/brandkit/crawl/url-utils";
import { runBrandKitCrawl } from "@/lib/brandkit/crawl/run-crawl";
import type { BrandKitStreamEvent } from "@/lib/brandkit/crawl/types";
import {
  releaseApiWalletChargeOnError,
  reserveApiWalletCharge,
  reserveUsdToMicros,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";

export const maxDuration = 300;
export const runtime = "nodejs";

const BRAND_KIT_LLM_MODEL = process.env.BRAND_KIT_LLM_GEMINI_MODEL?.trim() || "gemini-2.5-flash";

function estimateBrandKitLlmReserveUsd(): number {
  const batchCall = estimateGeminiUsd(BRAND_KIT_LLM_MODEL, 8000, 1800);
  const onelinerCall = estimateGeminiUsd(BRAND_KIT_LLM_MODEL, 6500, 400);
  return Math.round((batchCall + onelinerCall + 0.008) * 1_000_000) / 1_000_000;
}

export async function POST(req: NextRequest) {
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;

  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = await req.json().catch(() => ({}));
    const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";
    const enableLlm = body?.enableLlm !== false;
    const normalizedInput = normalizeBrandKitUrlInput(rawUrl);
    if (!normalizedInput.ok) {
      return Response.json({ error: normalizedInput.message }, { status: 400 });
    }
    const url = normalizedInput.url;

    try {
      await assertPublicHttpUrl(url);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "URL bloqueada" },
        { status: 400 },
      );
    }

    const hasGemini = Boolean((process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim());
    let llmEnabled = false;
    let llmSkipReason: string | undefined;

    if (enableLlm) {
      if (!hasGemini) {
        llmSkipReason = "GEMINI_API_KEY no configurada — solo extracción determinista";
      } else {
        try {
          await assertApiServiceEnabled("brand-kit-llm-synthesis");
          llmEnabled = true;

          const estimatedCostUsd = estimateBrandKitLlmReserveUsd();
          walletCharge = await reserveApiWalletCharge({
            req,
            userEmail: authState.user.email,
            serviceId: "brand-kit-llm-synthesis",
            provider: "gemini",
            route: "/api/spaces/brandKit/crawl",
            maxCostMicros: reserveUsdToMicros(estimatedCostUsd, { multiplier: 1.5 }),
            metadata: { url, model: BRAND_KIT_LLM_MODEL },
          });
        } catch (error) {
          if (error instanceof ApiServiceDisabledError) {
            llmSkipReason = "Síntesis IA deshabilitada en administración";
          } else {
            throw error;
          }
        }
      }
    }

    const jobId = randomUUID();
    const encoder = new TextEncoder();
    let llmCostUsd = 0;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: BrandKitStreamEvent) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };
        try {
          for await (const event of runBrandKitCrawl(url, jobId, {
            userEmail: authState.user.email,
            llmEnabled,
            llmSkipReason,
            onLlmCostUsd: (cost) => {
              llmCostUsd += cost;
            },
          })) {
            send(event);
            if (event.type === "error") break;
          }

          releaseWalletOnError = false;
          await walletCharge?.capture({
            actualCostUsd: Math.max(llmCostUsd, 0.001),
            metadata: { url, jobId, llmEnabled },
          });

          await recordApiUsage({
            provider: "aws",
            userEmail: authState.user.email,
            serviceId: "brand-kit-crawl",
            route: "/api/spaces/brandKit/crawl",
            costUsd: 0,
            metadata: { jobId, url, llm: llmEnabled, llmCostUsd },
          }).catch(() => undefined);
        } catch (error) {
          if (releaseWalletOnError) await releaseApiWalletChargeOnError(walletCharge, error);
          send({
            type: "error",
            message: error instanceof Error ? error.message : "Error en crawl",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (releaseWalletOnError) await releaseApiWalletChargeOnError(walletCharge, error);
    const walletResponse = walletGateErrorResponse(error);
    if (walletResponse) return walletResponse;
    if (error instanceof ApiServiceDisabledError) {
      return Response.json({ error: "Síntesis IA de BrandKit deshabilitada en administración." }, { status: 503 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Error en crawl" }, { status: 500 });
  }
}
