import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  recordApiUsage,
  resolveUsageUserEmailFromRequest,
} from "@/lib/api-usage";
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";

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
  try {
    await assertApiServiceEnabled("openai-assistant");
    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
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

    const response = await openai.chat.completions.create({
      model: TEXT_CONTENT_MODEL,
      temperature: 0.2,
      max_tokens: Math.min(4096, Math.max(256, Math.ceil(text.length / 2) + 256)),
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
        costUsd: 0.002,
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
    const message = error instanceof Error ? error.message : "Internal Server Error";
    console.error("[Designer Text Content] Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
