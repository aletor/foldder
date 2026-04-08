import { NextResponse } from 'next/server';
import { recordApiUsage } from '@/lib/api-usage';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  try {
    const { promptText, videoUrl, duration, resolution, aspect_ratio } = await req.json();

    if (!promptText) {
      return NextResponse.json({ error: "Prompt text is required" }, { status: 400 });
    }

    // Correct endpoint for video-to-video editing is /edits
    const endpoint = videoUrl 
      ? 'https://api.x.ai/v1/videos/edits' 
      : 'https://api.x.ai/v1/videos/generations';

    const body = {
      model: "grok-imagine-video",
      prompt: promptText,
      duration: duration || 5,
      ...(resolution && { resolution }),
      ...(aspect_ratio && { aspect_ratio }),
      ...(videoUrl && { 
        video: {
          url: videoUrl 
        } 
      })
    };

    console.log(`[xAI Grok Request] Using endpoint: ${endpoint}`);
    console.log("[xAI Grok Request] Body:", JSON.stringify(body, null, 2));

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    
    const finalizedLogEntry = `
[${new Date().toISOString()}]
DEBUG: Using endpoint: ${endpoint}
BODY: ${JSON.stringify(body, null, 2)}
RESPONSE: ${JSON.stringify(data, null, 2)}
-----------------------------------
`;
    fs.appendFileSync('/tmp/grok_api_debug.log', finalizedLogEntry);

    if (!response.ok) {
      throw new Error(data.error?.message || data.error || "xAI API error");
    }

    const d = typeof duration === "number" && duration > 0 ? duration : 5;
    await recordApiUsage({
      provider: "grok",
      serviceId: "grok-video",
      route: "/api/grok/generate",
      model: "grok-imagine-video",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: Math.round(d * 0.04 * 1_000_000) / 1_000_000,
      note: "Vídeo Grok (coste orientativo por segundo)",
    });

    // Official response returns a request_id
    return NextResponse.json({ taskId: data.id || data.request_id });
  } catch (error: any) {
    console.error("[Grok API Error]:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
