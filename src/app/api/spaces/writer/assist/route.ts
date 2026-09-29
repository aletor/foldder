import { NextResponse } from "next/server";
import OpenAI from "openai";
import { recordApiUsage } from "@/lib/api-usage";
import { ApiServiceDisabledError, assertApiServiceEnabled } from "@/lib/api-usage-controls";
import { estimateOpenAIUsd } from "@/lib/pricing-config";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import {
  releaseApiWalletChargeOnError,
  reserveApiWalletCharge,
  reserveUsdToMicros,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";
import { cleanWriterAiProposal, parseStoryAskModelAnswer, parseStoryUpdateModelAnswer, parseWriterAiRequest, writerAiMaxTokens, writerAiMessages } from "@/app/spaces/writer/writer-ai";

export const runtime = "nodejs";

const WRITER_AI_MODEL =
  process.env.OPENAI_WRITER_MODEL?.trim() ||
  process.env.OPENAI_TEXT_CONTENT_MODEL?.trim() ||
  process.env.OPENAI_ASSISTANT_MODEL?.trim() ||
  "gpt-4o-mini";

const ROUTE = "/api/spaces/writer/assist";

export async function POST(req: Request) {
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;
  try {
    await assertApiServiceEnabled("openai-assistant");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const parsed = parseWriterAiRequest(await req.json().catch(() => ({})));
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

    const messages = writerAiMessages(parsed);
    const maxTokens = writerAiMaxTokens(parsed.action, parsed.selection.length);
    const estimatedInputTokens = Math.ceil((messages.system.length + messages.user.length + 40) / 4);
    const estimatedCostUsd = estimateOpenAIUsd(WRITER_AI_MODEL, estimatedInputTokens, maxTokens);

    walletCharge = await reserveApiWalletCharge({
      req,
      userEmail: authState.user.email,
      serviceId: "openai-assistant",
      provider: "openai",
      route: ROUTE,
      maxCostMicros: reserveUsdToMicros(estimatedCostUsd, { multiplier: 1.6 }),
      metadata: { model: WRITER_AI_MODEL, action: parsed.action },
    });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
    const response = await openai.chat.completions.create({
      model: WRITER_AI_MODEL,
      temperature: parsed.action === "update_story" ? 0.2 : parsed.action === "ask_story" ? 0.35 : parsed.action === "continue" ? 0.7 : 0.4,
      max_tokens: maxTokens,
      ...(parsed.action === "ask_story" ? { response_format: { type: "json_object" as const } } : {}),
      messages: [
        { role: "system", content: messages.system },
        { role: "user", content: messages.user },
      ],
    });

    const usage = response.usage;
    const actualCostUsd = usage
      ? estimateOpenAIUsd(WRITER_AI_MODEL, usage.prompt_tokens, usage.completion_tokens)
      : Math.min(0.002, estimatedCostUsd);
    releaseWalletOnError = false;
    await walletCharge?.capture({
      actualCostUsd,
      metadata: {
        model: WRITER_AI_MODEL,
        action: parsed.action,
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
      },
    });
    await recordApiUsage({
      provider: "openai",
      userEmail: authState.user.email,
      serviceId: "openai-assistant",
      route: ROUTE,
      model: WRITER_AI_MODEL,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
      ...(usage ? {} : { costUsd: actualCostUsd, note: "Writer sin usage (estimado)" }),
    });

    const raw = response.choices[0]?.message?.content ?? "";
    if (parsed.action === "ask_story") {
      if (!raw.trim()) {
        return NextResponse.json({ error: "La respuesta de Story llegó vacía." }, { status: 502 });
      }
      const answer = parseStoryAskModelAnswer(raw);
      if (!answer) {
        return NextResponse.json({ error: "No se ha podido leer la respuesta." }, { status: 502 });
      }
      return NextResponse.json(answer);
    }
    if (parsed.action === "update_story") {
      const update = parseStoryUpdateModelAnswer(raw);
      if (!update) return NextResponse.json({ error: "No se ha podido leer la respuesta." }, { status: 502 });
      return NextResponse.json(update);
    }
    const text = cleanWriterAiProposal(raw);
    if (!text.trim()) {
      return NextResponse.json({ error: "La propuesta llegó vacía." }, { status: 502 });
    }
    return NextResponse.json({ text });
  } catch (error: unknown) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json({ error: `API bloqueada en admin: ${error.label}` }, { status: 423 });
    }
    if (releaseWalletOnError) await releaseApiWalletChargeOnError(walletCharge, error);
    const walletResponse = walletGateErrorResponse(error);
    if (walletResponse) return walletResponse;
    console.error("[Writer assist] Error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "No se ha podido escribir la propuesta." }, { status: 500 });
  }
}
