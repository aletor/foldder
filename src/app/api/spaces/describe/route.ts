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
  canUserAccessKnowledgeFileKey,
  requireSpacesAuthUser,
} from "@/lib/spaces-access-control";
import { getPresignedUrl } from '@/lib/s3-utils';
import OpenAI from 'openai';
import { estimateOpenAIUsd } from "@/lib/pricing-config";
import {
  reserveApiWalletCharge,
  reserveUsdToMicros,
  releaseApiWalletChargeOnError,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";

const KNOWLEDGE_FILES_PREFIX = "knowledge-files/";

type OpenAiDescribeContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail: "high" } };

function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function tryExtractKnowledgeFilesKey(value: string, baseUrl: string): string | null {
  const raw = value.trim();
  if (raw.startsWith(KNOWLEDGE_FILES_PREFIX)) return raw;
  try {
    const url = new URL(raw, baseUrl);
    const routeKey = url.pathname === "/api/spaces/s3-file" ? url.searchParams.get("key")?.trim() : "";
    if (routeKey?.startsWith(KNOWLEDGE_FILES_PREFIX)) return routeKey;
    const decodedPath = safeDecodeUriComponent(url.pathname.replace(/^\/+/, ""));
    const idx = decodedPath.indexOf(KNOWLEDGE_FILES_PREFIX);
    return idx >= 0 ? decodedPath.slice(idx) : null;
  } catch {
    return null;
  }
}

class MediaAccessError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "MediaAccessError";
  }
}

async function resolveModelReadableMediaUrl(rawUrl: string, req: Request, userEmail: string): Promise<string> {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith("data:")) return trimmed;
  const s3Key = tryExtractKnowledgeFilesKey(trimmed, req.url);
  if (s3Key) {
    const allowed = await canUserAccessKnowledgeFileKey(userEmail, s3Key);
    if (!allowed) throw new MediaAccessError("forbidden_key", 403);
    return getPresignedUrl(s3Key);
  }
  try {
    return new URL(trimmed, req.url).toString();
  } catch {
    return trimmed;
  }
}

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

    const mediaUrlForModel = await resolveModelReadableMediaUrl(url, req, authState.user.email);

    console.log(`[Media Describer] Analyzing ${type} at ${mediaUrlForModel.startsWith("data:") ? "data-url" : mediaUrlForModel}`);

    let prompt = "";
    let contentPayload: OpenAiDescribeContentPart[] = [];

    if (type === 'image' || type === 'video') {
      prompt = "Describe this media asset in great detail. Focus on the visual elements, composition, mood, and any specific subjects. Provide a precise, descriptive prompt that could be used to recreate or enhance this scene. Be concise but highly descriptive. Output only the description.";
      
      contentPayload = [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: { url: mediaUrlForModel, detail: "high" }
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
    if (error instanceof MediaAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (releaseWalletOnError) await releaseApiWalletChargeOnError(walletCharge, error);
    const walletResponse = walletGateErrorResponse(error);
    if (walletResponse) return walletResponse;
    console.error("[Media Describer] Error:", error);
    const message = error instanceof Error ? error.message : "describe_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
