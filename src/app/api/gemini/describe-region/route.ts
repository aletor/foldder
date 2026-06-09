import { NextRequest, NextResponse } from "next/server";
import { parseGeminiUsageMetadata, recordApiUsage } from "@/lib/api-usage";
import { estimateGeminiUsd } from "@/lib/pricing-config";
import { ApiServiceDisabledError, assertApiServiceEnabled } from "@/lib/api-usage-controls";
import { assertUserCanAccessMediaReference, ForbiddenMediaReferenceError } from "@/lib/api-media-access";
import { parseReferenceImageForGemini } from "@/lib/parse-reference-image";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import {
  reserveApiWalletCharge,
  reserveUsdToMicros,
  releaseApiWalletChargeOnError,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_MODEL = "gemini-2.5-flash";
const ROUTE = "/api/gemini/describe-region";

function safeModel(model: unknown): string {
  const value = typeof model === "string" ? model.trim() : "";
  if (!value) return DEFAULT_MODEL;
  if (value.includes("pro")) return DEFAULT_MODEL;
  return value;
}

function normalizePrompt(prompt: unknown): string {
  const value = typeof prompt === "string" ? prompt.trim() : "";
  return value || [
    "Examine the marked region of this image.",
    "Describe in detail the visual element or change present in the region (subject, color, texture, posture, accessories, lighting in the region, style).",
    "Max 80 words. Focus only on the marked region, not the surrounding context. Be specific and visual.",
  ].join("\n");
}

function extractText(data: unknown): string {
  const candidate = data as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return candidate.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text?.trim() ?? "";
}

export async function POST(req: NextRequest) {
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;
  try {
    await assertApiServiceEnabled("gemini-analyze");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = await req.json();
    const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
    const model = safeModel(body?.model);
    const prompt = normalizePrompt(body?.prompt);
    const correctionId = typeof body?.correctionId === "string" ? body.correctionId : "";

    if (!imageUrl) return NextResponse.json({ error: "imageUrl required" }, { status: 400 });
    await assertUserCanAccessMediaReference(authState.user.email, imageUrl, "identity crop");

    const parsed = await parseReferenceImageForGemini(imageUrl, { baseUrl: req.url });
    if (!parsed) return NextResponse.json({ error: "Could not load crop image" }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "API Key not configured" }, { status: 500 });

    walletCharge = await reserveApiWalletCharge({
      req,
      userEmail: authState.user.email,
      serviceId: "gemini-analyze",
      provider: "gemini",
      route: ROUTE,
      maxCostMicros: reserveUsdToMicros(0.004),
      metadata: { model, correctionId },
    });

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const response = await fetch(endpoint, {
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { inline_data: { data: parsed.data, mime_type: parsed.mimeType } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 220,
          temperature: 0.12,
        },
      }),
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      method: "POST",
    });

    const data = await response.json();
    if (!response.ok || data?.error) {
      const message = data?.error?.message || `Gemini region description failed (${response.status})`;
      await walletCharge?.release({ reason: "provider_error", metadata: { status: response.status } });
      releaseWalletOnError = false;
      return NextResponse.json({ error: message }, { status: response.ok ? 500 : response.status });
    }

    const description = extractText(data);
    if (!description) {
      await walletCharge?.release({ reason: "empty_provider_response", metadata: { status: response.status } });
      releaseWalletOnError = false;
      return NextResponse.json({ error: "No text response from Gemini" }, { status: 500 });
    }

    const usage = parseGeminiUsageMetadata(data);
    const actualCostUsd = usage
      ? estimateGeminiUsd(model, usage.inputTokens, usage.outputTokens)
      : 0.002;
    releaseWalletOnError = false;
    await walletCharge?.capture({
      actualCostUsd,
      metadata: {
        model,
        correctionId,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
      },
    });

    await recordApiUsage({
      provider: "gemini",
      userEmail: authState.user.email,
      serviceId: "gemini-analyze",
      route: ROUTE,
      model,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      totalTokens: usage?.totalTokens ?? 0,
      costUsd: usage ? undefined : actualCostUsd,
      note: usage ? undefined : `identity anchor estimate ${correctionId}`,
    });

    return NextResponse.json({ description, model });
  } catch (error) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json({ error: `API bloqueada en admin: ${error.label}` }, { status: 423 });
    }
    if (error instanceof ForbiddenMediaReferenceError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (releaseWalletOnError) await releaseApiWalletChargeOnError(walletCharge, error);
    const walletResponse = walletGateErrorResponse(error);
    if (walletResponse) return walletResponse;
    const message = error instanceof Error ? error.message : "describe_region_failed";
    console.error("[gemini/describe-region]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
