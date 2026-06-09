import { NextRequest, NextResponse } from "next/server";
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
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;
  try {
    await assertApiServiceEnabled("openai-enhance");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const usageUserEmail = authState.user.email;
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    walletCharge = await reserveApiWalletCharge({
      req,
      userEmail: usageUserEmail,
      serviceId: "openai-enhance",
      provider: "openai",
      route: "/api/openai/enhance",
      maxCostMicros: reserveUsdToMicros(0.02),
      metadata: { model: "gpt-4o", operation: "prompt_enhance" },
    });

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "",
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a professional AI prompt engineer. Your task is to take a simple, rough prompt and turn it into a high-quality, descriptive, and technical prompt for image or video generation models. Focus on lighting, texture, camera angles, and atmosphere. Keep the core meaning but significantly expand the visual detail. Return ONLY the enhanced prompt text.",
        },
        {
          role: "user",
          content: `Enhance this prompt: "${prompt}"`,
        },
      ],
      max_tokens: 500,
    });

    const enhanced = completion.choices[0].message.content?.trim();

    const u = completion.usage;
    const actualCostUsd = u
      ? estimateOpenAIUsd("gpt-4o", u.prompt_tokens, u.completion_tokens)
      : 0.005;
    releaseWalletOnError = false;
    await walletCharge?.capture({
      actualCostUsd,
      metadata: {
        model: "gpt-4o",
        promptTokens: u?.prompt_tokens ?? 0,
        completionTokens: u?.completion_tokens ?? 0,
      },
    });

    if (u) {
      await recordApiUsage({
        provider: "openai",
        userEmail: usageUserEmail,
        serviceId: "openai-enhance",
        route: "/api/openai/enhance",
        model: "gpt-4o",
        inputTokens: u.prompt_tokens,
        outputTokens: u.completion_tokens,
        totalTokens: u.total_tokens,
      });
    } else {
      await recordApiUsage({
        provider: "openai",
        userEmail: usageUserEmail,
        serviceId: "openai-enhance",
        route: "/api/openai/enhance",
        model: "gpt-4o",
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: actualCostUsd,
        note: "Enhance sin usage (estimado)",
      });
    }

    return NextResponse.json({ enhanced });
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
    console.error("OpenAI Enhance Error:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
