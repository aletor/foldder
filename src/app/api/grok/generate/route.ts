import { NextResponse } from 'next/server';
import {
  recordApiUsage,
  resolveUsageUserEmailFromRequest,
} from '@/lib/api-usage';
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import fs from 'fs';
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
import {
  canUserAccessKnowledgeFileKey,
  requireSpacesAuthUser,
} from "@/lib/spaces-access-control";
import { getPresignedUrl } from "@/lib/s3-utils";

export async function POST(req: Request) {
  try {
    await assertApiServiceEnabled("grok-video");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    const { promptText, videoUrl, duration, resolution, aspect_ratio } = await req.json();

    if (!promptText) {
      return NextResponse.json({ error: "Prompt text is required" }, { status: 400 });
    }

    // Correct endpoint for video-to-video editing is /edits
    let providerVideoUrl = typeof videoUrl === "string" ? videoUrl : "";
    if (providerVideoUrl) {
      const s3Key = tryExtractKnowledgeFilesKeyFromUrl(providerVideoUrl);
      if (s3Key) {
        const allowed = await canUserAccessKnowledgeFileKey(authState.user.email, s3Key);
        if (!allowed) return NextResponse.json({ error: "forbidden_asset" }, { status: 403 });
        providerVideoUrl = await getPresignedUrl(s3Key);
      }
    }

    const endpoint = providerVideoUrl
      ? 'https://api.x.ai/v1/videos/edits' 
      : 'https://api.x.ai/v1/videos/generations';

    const body = {
      model: "grok-imagine-video",
      prompt: promptText,
      duration: duration || 5,
      ...(resolution && { resolution }),
      ...(aspect_ratio && { aspect_ratio }),
      ...(providerVideoUrl && {
        video: {
          url: providerVideoUrl
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
      userEmail: usageUserEmail,
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { error: `API bloqueada en admin: ${error.label}` },
        { status: 423 },
      );
    }
    console.error("[Grok API Error]:", error);
    return NextResponse.json({ error: message || "Internal Server Error" }, { status: 500 });
  }
}
