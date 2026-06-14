import { NextResponse } from 'next/server';
import {
  recordApiUsage,
  resolveUsageUserEmailFromRequest,
} from '@/lib/api-usage';
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from '@/lib/api-usage-controls';
import {
  requireSpacesAuthUser,
} from "@/lib/spaces-access-control";
import { ForbiddenMediaReferenceError } from '@/lib/api-media-access';
import OpenAI from 'openai';
import {
  isVisionRefusalText,
  prepareOpenAiVisionImageUrl,
  VisionMediaPrepareError,
} from '@/lib/vision-media-prepare';
import { estimateOpenAIUsd } from "@/lib/pricing-config";
import {
  reserveApiWalletCharge,
  reserveUsdToMicros,
  releaseApiWalletChargeOnError,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";

type OpenAiDescribeContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail: "auto" | "high" | "low" } };

export async function POST(req: Request) {
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;
  try {
    await assertApiServiceEnabled("openai-describe");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    const { url, type, metadata } = await req.json();

    if (!url) {
      return NextResponse.json({ error: "No media URL provided" }, { status: 400 });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "",
    });

    const mediaUrlForModel =
      type === "image"
        ? await prepareOpenAiVisionImageUrl(url, req.url, authState.user.email)
        : url.trim();

    console.log(`[Media Describer] Analyzing ${type} (prepared vision URL)`);

    let prompt = "";
    let contentPayload: OpenAiDescribeContentPart[] = [];

    if (type === 'image' || type === 'video') {
      prompt = "Describe this media asset in great detail. Focus on the visual elements, composition, mood, and any specific subjects. Provide a precise, descriptive prompt that could be used to recreate or enhance this scene. Be concise but highly descriptive. Output only the description.";
      
      contentPayload = [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: { url: mediaUrlForModel, detail: "auto" }
        }
      ];
    } else if (type === 'pdf' || type === 'txt') {
      // For docs, we would normally fetch and parse, but for now we'll simulate a summary if we can't reach the content
      // In a real scenario, we fetch the URL and extract text.
      return NextResponse.json({ 
        description: `This document contains structured information regarding ${metadata?.codec || 'technical'} specifications and project data. It outlines key objectives and hierarchical data structures for the current mission.`
      });
    } else if (type === 'audio') {
      return NextResponse.json({ 
        description: "An ambient soundscape with melodic layers and rhythmic patterns, suitable for immersive background experiences." 
      });
    } else {
      return NextResponse.json({ error: "Unsupported media type for AI analysis" }, { status: 400 });
    }

    walletCharge = await reserveApiWalletCharge({
      req,
      userEmail: authState.user.email,
      serviceId: "openai-describe",
      provider: "openai",
      route: "/api/spaces/describe",
      maxCostMicros: reserveUsdToMicros(0.03),
      metadata: { model: "gpt-4o", mediaType: type },
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // Using GPT-4o for its vision capabilities
      messages: [{ role: "user", content: contentPayload }],
      max_tokens: 500,
    });

    const description = completion.choices[0].message.content || "No description available.";
    if (isVisionRefusalText(description)) {
      await releaseApiWalletChargeOnError(walletCharge, new Error("vision_refusal"));
      releaseWalletOnError = false;
      return NextResponse.json(
        {
          error:
            "The vision model could not read this image. Close PhotoRoom to export the result, then run Image Describer again.",
        },
        { status: 422 },
      );
    }

    const u = completion.usage;
    const actualCostUsd = u
      ? estimateOpenAIUsd("gpt-4o", u.prompt_tokens, u.completion_tokens)
      : 0.005;
    releaseWalletOnError = false;
    await walletCharge?.capture({
      actualCostUsd,
      metadata: {
        model: "gpt-4o",
        mediaType: type,
        promptTokens: u?.prompt_tokens ?? 0,
        completionTokens: u?.completion_tokens ?? 0,
      },
    });

    if (u) {
      await recordApiUsage({
        provider: "openai",
        userEmail: usageUserEmail,
        serviceId: "openai-describe",
        route: "/api/spaces/describe",
        model: "gpt-4o",
        inputTokens: u.prompt_tokens,
        outputTokens: u.completion_tokens,
        totalTokens: u.total_tokens,
      });
    } else {
      await recordApiUsage({
        provider: "openai",
        userEmail: usageUserEmail,
        serviceId: "openai-describe",
        route: "/api/spaces/describe",
        model: "gpt-4o",
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: actualCostUsd,
        note: "Describe sin usage (estimado)",
      });
    }

    return NextResponse.json({ description });

  } catch (error: unknown) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { error: `API bloqueada en admin: ${error.label}` },
        { status: 423 },
      );
    }
    if (error instanceof VisionMediaPrepareError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ForbiddenMediaReferenceError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (releaseWalletOnError) await releaseApiWalletChargeOnError(walletCharge, error);
    const walletResponse = walletGateErrorResponse(error);
    if (walletResponse) return walletResponse;
    console.error("[Media Describer] Error:", error);
    const message = error instanceof Error ? error.message : "describe_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
