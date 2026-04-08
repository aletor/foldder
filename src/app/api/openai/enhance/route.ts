import { NextRequest, NextResponse } from "next/server";
import { recordApiUsage } from "@/lib/api-usage";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

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
    if (u) {
      await recordApiUsage({
        provider: "openai",
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
        serviceId: "openai-enhance",
        route: "/api/openai/enhance",
        model: "gpt-4o",
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0.005,
        note: "Enhance sin usage (estimado)",
      });
    }

    return NextResponse.json({ enhanced });
  } catch (error: any) {
    console.error("OpenAI Enhance Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
