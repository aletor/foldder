import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  recordApiUsage,
} from "@/lib/api-usage";
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { estimateOpenAIUsd } from "@/lib/pricing-config";
import {
  reserveApiWalletCharge,
  reserveUsdToMicros,
  releaseApiWalletChargeOnError,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";

const TEXT_CONTENT_MODEL =
  process.env.OPENAI_TEXT_CONTENT_MODEL?.trim() ||
  process.env.OPENAI_ASSISTANT_MODEL?.trim() ||
  "gpt-4o-mini";

const LANGUAGE_LABELS = {
  es: "español",
  en: "inglés",
  ca: "catalán",
} as const;

type TextContentAction = "correct" | "translate";
type TargetLanguage = keyof typeof LANGUAGE_LABELS;

function isTextContentAction(value: unknown): value is TextContentAction {
  return value === "correct" || value === "translate";
}

function isTargetLanguage(value: unknown): value is TargetLanguage {
  return value === "es" || value === "en" || value === "ca";
}

export async function POST(req: Request) {
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;
  try {
    await assertApiServiceEnabled("openai-assistant");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const usageUserEmail = authState.user.email;
    const body = (await req.json().catch(() => ({}))) as {
      text?: unknown;
      action?: unknown;
      targetLanguage?: unknown;
    };

    const text = typeof body.text === "string" ? body.text : "";
    const action = isTextContentAction(body.action) ? body.action : null;
    const targetLanguage = isTargetLanguage(body.targetLanguage) ? body.targetLanguage : null;

    if (!text.trim()) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }
    if (!action) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    if (text.length > 12000) {
      return NextResponse.json({ error: "Text is too long" }, { status: 413 });
    }
    if (action === "translate" && !targetLanguage) {
      return NextResponse.json({ error: "Target language is required" }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
    const task =
      action === "correct"
        ? "Corrige ortografía, gramática y puntuación. Mantén el idioma original, el significado, el tono, los saltos de línea y la estructura. No reescribas de forma creativa."
        : `Traduce el texto a ${LANGUAGE_LABELS[targetLanguage!]}. Mantén el significado, el tono, los saltos de línea y la estructura.`;
    const maxTokens = Math.min(4096, Math.max(256, Math.ceil(text.length / 2) + 256));
    const estimatedInputTokens = Math.ceil((task.length + text.length + 180) / 4);
    const estimatedCostUsd = estimateOpenAIUsd(TEXT_CONTENT_MODEL, estimatedInputTokens, maxTokens);

    walletCharge = await reserveApiWalletCharge({
      req,
      userEmail: usageUserEmail,
      serviceId: "openai-assistant",
      provider: "openai",
      route: "/api/spaces/text-content",
      maxCostMicros: reserveUsdToMicros(estimatedCostUsd, { multiplier: 1.6 }),
      metadata: { model: TEXT_CONTENT_MODEL, action },
    });

    const response = await openai.chat.completions.create({
      model: TEXT_CONTENT_MODEL,
      temperature: 0.2,
      max_tokens: maxTokens,
      messages: [
        {
          role: "system",
          content:
            "Eres un editor profesional. Devuelve únicamente el texto final, sin comillas, sin Markdown, sin explicaciones y sin preámbulos.",
        },
        {
          role: "user",
          content: `${task}\n\nTexto:\n${text}`,
        },
      ],
    });

    const result = response.choices[0]?.message?.content?.trim() ?? "";
    const u = response.usage;
    const actualCostUsd = u
      ? estimateOpenAIUsd(TEXT_CONTENT_MODEL, u.prompt_tokens, u.completion_tokens)
      : Math.min(0.002, estimatedCostUsd);
    releaseWalletOnError = false;
    await walletCharge?.capture({
      actualCostUsd,
      metadata: {
        model: TEXT_CONTENT_MODEL,
        action,
        promptTokens: u?.prompt_tokens ?? 0,
        completionTokens: u?.completion_tokens ?? 0,
      },
    });

    if (u) {
      await recordApiUsage({
        provider: "openai",
        userEmail: usageUserEmail,
        serviceId: "openai-assistant",
        route: "/api/spaces/text-content",
        model: TEXT_CONTENT_MODEL,
        inputTokens: u.prompt_tokens,
        outputTokens: u.completion_tokens,
        totalTokens: u.total_tokens,
      });
    } else {
      await recordApiUsage({
        provider: "openai",
        userEmail: usageUserEmail,
        serviceId: "openai-assistant",
        route: "/api/spaces/text-content",
        model: TEXT_CONTENT_MODEL,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: actualCostUsd,
        note: "Designer content transform sin usage (estimado)",
      });
    }

    return NextResponse.json({ text: result });
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
    const message = error instanceof Error ? error.message : "Internal Server Error";
    console.error("[Designer Text Content] Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
