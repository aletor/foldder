import { NextResponse } from 'next/server';
import {
  recordApiUsage,
  resolveUsageUserEmailFromRequest,
} from '@/lib/api-usage';
import RunwayML from '@runwayml/sdk';
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
import {
  canUserAccessKnowledgeFileKey,
  requireSpacesAuthUser,
} from "@/lib/spaces-access-control";
import { getPresignedUrl } from "@/lib/s3-utils";

function getRunwayClient() {
  const apiKey =
    process.env.RUNWAYML_API_KEY || process.env.RUNWAYML_API_SECRET || "";
  return new RunwayML({ apiKey });
}

export async function POST(req: Request) {
  try {
    await assertApiServiceEnabled("runway-gen3");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    const { promptText, videoUrl, imageUrl, duration = 5 } = await req.json();

    if (!promptText) {
      return NextResponse.json({ error: "Prompt text is required" }, { status: 400 });
    }

    const runway = getRunwayClient();
    let promptImage = videoUrl || imageUrl;
    if (typeof promptImage === "string") {
      const s3Key = tryExtractKnowledgeFilesKeyFromUrl(promptImage);
      if (s3Key) {
        const allowed = await canUserAccessKnowledgeFileKey(authState.user.email, s3Key);
        if (!allowed) return NextResponse.json({ error: "forbidden_asset" }, { status: 403 });
        promptImage = await getPresignedUrl(s3Key);
      }
    }

    console.log(`[Runway API] Starting ${duration}s generation task...`);

    // Using Gen-3 Alpha Turbo for fast results
    const task = await runway.imageToVideo.create({
      model: 'gen3a_turbo',
      promptImage,
      promptText: promptText,
      duration: duration as 5 | 10
    });

    const dur = duration === 10 ? 10 : 5;
    await recordApiUsage({
      provider: "runway",
      userEmail: usageUserEmail,
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { error: `API bloqueada en admin: ${error.label}` },
        { status: 423 },
      );
    }
    console.error("[Runway API Error]:", error);
    return NextResponse.json({ error: message || "Internal Server Error" }, { status: 500 });
  }
}
