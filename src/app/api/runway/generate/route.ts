import { NextResponse } from 'next/server';
import { recordApiUsage } from '@/lib/api-usage';
import RunwayML from '@runwayml/sdk';

function getRunwayClient() {
  const apiKey =
    process.env.RUNWAYML_API_KEY || process.env.RUNWAYML_API_SECRET || "";
  return new RunwayML({ apiKey });
}

export async function POST(req: Request) {
  try {
    const { promptText, videoUrl, imageUrl, duration = 5 } = await req.json();

    if (!promptText) {
      return NextResponse.json({ error: "Prompt text is required" }, { status: 400 });
    }

    const runway = getRunwayClient();

    console.log(`[Runway API] Starting ${duration}s generation task...`);

    // Using Gen-3 Alpha Turbo for fast results
    const task = await runway.imageToVideo.create({
      model: 'gen3a_turbo',
      promptImage: videoUrl || imageUrl, 
      promptText: promptText,
      duration: duration as 5 | 10
    });

    const dur = duration === 10 ? 10 : 5;
    await recordApiUsage({
      provider: "runway",
      serviceId: "runway-gen3",
      route: "/api/runway/generate",
      model: "gen3a_turbo",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: Math.round(dur * 0.05 * 1_000_000) / 1_000_000,
      note: "Gen-3 (coste orientativo por segundo)",
    });

    return NextResponse.json({ taskId: task.id });
  } catch (error: any) {
    console.error("[Runway API Error]:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
