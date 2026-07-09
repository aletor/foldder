import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import { ApiServiceDisabledError, assertApiServiceEnabled } from "@/lib/api-usage-controls";
import { recordApiUsage } from "@/lib/api-usage";
import {
  buildVoiceSynthesisContext,
  buildVoiceSynthesisPrompt,
  parseVoiceSynthesisResponse,
  VOICE_SYNTHESIS_SOURCE_ID,
} from "@/lib/brandkit/synthesize-voice-examples";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

export const runtime = "nodejs";

function getOpenAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("openai_not_configured");
  return new OpenAI({ apiKey });
}

export async function POST(req: NextRequest) {
  try {
    await assertApiServiceEnabled("openai-brain-analyze");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = (await req.json()) as { assets?: unknown };
    if (!body.assets) {
      return NextResponse.json({ error: "assets required" }, { status: 400 });
    }

    const assets = normalizeProjectAssets(body.assets);
    const context = buildVoiceSynthesisContext(assets);
    const prompt = buildVoiceSynthesisPrompt(context);
    const openai = getOpenAiClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.65,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: "Genera los ejemplos de voz en JSON." },
      ],
    });

    const rawContent = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(rawContent) as unknown;
    const examples = parseVoiceSynthesisResponse(parsed);
    if (examples.length < 2) {
      return NextResponse.json({ error: "voice_synthesis_empty" }, { status: 422 });
    }

    await recordApiUsage({
      userEmail: authState.user.email,
      provider: "openai",
      serviceId: "openai-brain-analyze",
      route: "/api/spaces/brain/brand/synthesize-voice-examples",
      model: completion.model,
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    });

    return NextResponse.json({
      examples,
      sourceId: VOICE_SYNTHESIS_SOURCE_ID,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json({ error: `API bloqueada: ${error.label}` }, { status: 423 });
    }
    const message = error instanceof Error ? error.message : "voice_synthesis_failed";
    if (message === "openai_not_configured") {
      return NextResponse.json({ error: "openai_not_configured" }, { status: 503 });
    }
    console.error("[synthesize-voice-examples]", error);
    return NextResponse.json({ error: "voice_synthesis_failed" }, { status: 500 });
  }
}
