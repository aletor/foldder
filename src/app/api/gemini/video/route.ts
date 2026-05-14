import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import {
  recordApiUsage,
  resolveUsageUserEmailFromRequest,
} from "@/lib/api-usage";
import { estimateGeminiVeoVideoUsd, veoResolutionMultiplier } from "@/lib/pricing-config";
import { uploadBufferToS3Key } from "@/lib/s3-utils";
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import { parseReferenceImageForGemini } from "@/lib/parse-reference-image";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
import {
  buildUserAssetObjectKey,
  canUserAccessKnowledgeFileKey,
  requireSpacesAuthUser,
  stableKnowledgeFileUrlFromKey,
} from "@/lib/spaces-access-control";
import {
  appendVideoPromptTail,
  collectAllReferenceImageUrlsOrdered,
  parseVideoRefSlots,
} from "@/lib/video-generator-studio";
import crypto from "crypto";

/** Vercel / hosting: permite polling largo (Veo suele tardar minutos). Ajusta según tu plan. */
export const maxDuration = 300;

type ExtractedVeoVideo = {
  uri?: string;
  base64?: string;
  mimeType?: string;
};

type GeminiVeoImage = {
  imageBytes: string;
  mimeType: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getByPath(root: unknown, path: Array<string | number>): unknown {
  return path.reduce<unknown>((current, segment) => {
    if (typeof segment === "number") return Array.isArray(current) ? current[segment] : undefined;
    return isRecord(current) ? current[segment] : undefined;
  }, root);
}

function looksLikeVideoUri(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith("files/");
}

function findNestedVideo(root: unknown, seen = new Set<unknown>()): ExtractedVeoVideo | null {
  if (!root || typeof root !== "object") return null;
  if (seen.has(root)) return null;
  seen.add(root);

  if (isRecord(root)) {
    const uri = root.uri || root.fileUri || root.downloadUri || root.url;
    if (looksLikeVideoUri(uri)) {
      return {
        uri: uri.trim(),
        mimeType: typeof root.mimeType === "string" ? root.mimeType : undefined,
      };
    }
    const directVideoBase64 = root.videoBytes || root.bytesBase64Encoded || root.bytesBase64;
    const looseDataBase64 = typeof root.data === "string" && root.data.length > 1000 ? root.data : undefined;
    const base64 = directVideoBase64 || looseDataBase64;
    if (typeof base64 === "string" && base64.length > 0) {
      return {
        base64,
        mimeType: typeof root.mimeType === "string" ? root.mimeType : "video/mp4",
      };
    }
    for (const value of Object.values(root)) {
      const found = findNestedVideo(value, seen);
      if (found) return found;
    }
  }

  if (Array.isArray(root)) {
    for (const value of root) {
      const found = findNestedVideo(value, seen);
      if (found) return found;
    }
  }

  return null;
}

/** Extrae el vídeo en respuestas de operación larga (REST camelCase/snake_case y SDK-like). */
function extractVeoVideo(pollData: Record<string, unknown>): ExtractedVeoVideo | null {
  const knownPaths: Array<Array<string | number>> = [
    ["response", "generateVideoResponse", "generatedSamples", 0, "video"],
    ["response", "generateVideoResponse", "generatedSamples", 0, "video", "uri"],
    ["response", "generateVideoResponse", "generatedSamples", 0, "video", "videoBytes"],
    ["response", "generatedVideos", 0, "video"],
    ["response", "generated_videos", 0, "video"],
    ["response", "generatedSamples", 0, "video"],
    ["response", "video"],
  ];

  for (const path of knownPaths) {
    const value = getByPath(pollData, path);
    if (looksLikeVideoUri(value)) return { uri: value.trim() };
    const found = findNestedVideo(value);
    if (found) return found;
  }

  return findNestedVideo(pollData);
}

export async function POST(req: NextRequest) {
  console.log("[Gemini Video] Request received");
  try {
    await assertApiServiceEnabled("gemini-veo");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    const body = await req.json();
    const {
      prompt,
      firstFrame,
      lastFrame,
      resolution,
      durationSeconds,
      audio,
      seed,
      negativePrompt,
      animationPrompt,
      cameraPreset,
      aspectRatio,
      videoRefSlots,
    } = body as Record<string, unknown>;

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "API Key not configured" }, { status: 500 });
    }

    const modelId = "veo-3.1-generate-preview";
    const ai = new GoogleGenAI({ apiKey });

    const processImage = async (image: string): Promise<GeminiVeoImage | null> => {
      const trimmed = image?.trim();
      if (!trimmed) return null;
      const s3Key = tryExtractKnowledgeFilesKeyFromUrl(trimmed);
      if (s3Key) {
        const allowed = await canUserAccessKnowledgeFileKey(authState.user.email, s3Key);
        if (!allowed) throw new Error("Forbidden reference image");
      }
      const parsed = await parseReferenceImageForGemini(trimmed, { baseUrl: req.url });
      if (!parsed) return null;
      return {
        imageBytes: parsed.data,
        mimeType: parsed.mimeType,
      };
    };

    const firstImage =
      typeof firstFrame === "string" && firstFrame.trim()
        ? await processImage(firstFrame.trim())
        : null;
    const lastImage =
      typeof lastFrame === "string" && lastFrame.trim()
        ? await processImage(lastFrame.trim())
        : null;

    const referenceImages: Array<Record<string, unknown>> = [];
    const imageRefUrls = collectAllReferenceImageUrlsOrdered({
      extraSlots: parseVideoRefSlots(videoRefSlots),
    });
    for (const slotUrl of imageRefUrls) {
      if (referenceImages.length >= 3) break;
      const image = await processImage(slotUrl);
      if (!image) continue;
      referenceImages.push({
        image,
        referenceType: "ASSET",
      });
    }

    // Construct Enhanced Prompt
    let finalPrompt = typeof prompt === "string" ? prompt.trim() : "";
    if (!finalPrompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }
    finalPrompt = appendVideoPromptTail(finalPrompt, {
      animationPrompt,
      cameraPreset,
    });
    const negative = typeof negativePrompt === "string" ? negativePrompt.trim() : "";

    const rawDur = Number(durationSeconds);
    /** Veo 3.1: duraciones habituales 4 / 6 / 8 s. */
    const clampedDur =
      !Number.isFinite(rawDur) || rawDur <= 0
        ? 8
        : rawDur < 5
          ? 4
          : rawDur < 7
            ? 6
            : 8;
    const dur = clampedDur;

    const ar =
      typeof aspectRatio === "string" && aspectRatio.trim() === "9:16"
        ? "9:16"
        : "16:9";

    const resStr = (typeof resolution === "string" ? resolution : "1080p") || "1080p";
    const resLower = resStr.toLowerCase();
    /** Veo: la API exige 8 s para 1080p y 4K (rechaza 4/6 s). 720p admite 4/6/8. */
    const veoNeedsEight =
      resLower.includes("1080") || resLower.includes("4k");
    const effectiveDur = veoNeedsEight ? 8 : dur;

    const config: Record<string, unknown> = {
      numberOfVideos: 1,
      aspectRatio: ar,
      resolution: resStr,
      ...(effectiveDur > 0 ? { durationSeconds: effectiveDur } : {}),
      ...(negative ? { negativePrompt: negative } : {}),
    };
    if (lastImage) config.lastFrame = lastImage;
    // Veo referenceImages are a separate text-to-video mode: do not combine with image/lastFrame.
    if (!firstImage && !lastImage && referenceImages.length > 0) {
      config.referenceImages = referenceImages;
    }

    if (audio === true) {
      console.warn("[Gemini Video] generateAudio requested but Gemini API SDK does not support it for this endpoint; continuing without audio flag.");
    }
    if (seed !== undefined) {
      console.warn("[Gemini Video] seed requested but Gemini API SDK does not support it for this endpoint; continuing without seed.");
    }

    console.log("[Gemini Video] Payload Structure Verified (SDK)");
    console.log(`[Gemini Video] Calling ${modelId}...`);

    let operation = await ai.models.generateVideos({
      model: modelId,
      prompt: finalPrompt,
      ...(firstImage ? { image: firstImage } : {}),
      config,
    });
    console.log(`[Gemini Video] Operation started: ${operation.name || "(unnamed)"}`);

    let generatedVideo: ExtractedVeoVideo | null = null;
    const maxAttempts = 36; // 36 × 8s ≈ 288s + trabajo previo < maxDuration 300s
    const pollIntervalMs = 8000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`[Gemini Video] Polling attempt ${attempt}/${maxAttempts}...`);
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      operation = await ai.operations.getVideosOperation({ operation });

      if (operation.done === true) {
        if (operation.error) {
          const msg = String(operation.error.message || JSON.stringify(operation.error));
          console.error("[Gemini Video] Operation error:", operation.error);
          throw new Error(`Veo: ${msg}`);
        }
        generatedVideo = extractVeoVideo(operation as unknown as Record<string, unknown>);
        console.log(`[Gemini Video] Operation complete. Video: ${generatedVideo?.uri ? "uri" : generatedVideo?.base64 ? "base64" : "(empty)"}`);
        if (generatedVideo?.uri || generatedVideo?.base64) break;
        console.error("[Gemini Video] done=true but no URI. Snapshot:", JSON.stringify(operation).slice(0, 1200));
        throw new Error(
          "Veo terminó pero no devolvió un vídeo descargable. Revisa modelo/cuota o la respuesta en logs."
        );
      }
    }

    if (!generatedVideo?.uri && !generatedVideo?.base64) {
      throw new Error(
        "Tiempo de espera agotado: el vídeo no estuvo listo antes del límite del servidor. Prueba de nuevo o usa un plan con más tiempo de ejecución."
      );
    }

    // Download and upload to S3
    let videoBuffer: Buffer;
    if (generatedVideo.base64) {
      console.log("[Gemini Video] Using generated base64 video payload...");
      videoBuffer = Buffer.from(generatedVideo.base64, "base64");
    } else {
      const videoUri = generatedVideo.uri || "";
      const downloadUrl = videoUri.startsWith("files/")
        ? `https://generativelanguage.googleapis.com/v1beta/${videoUri}:download?key=${encodeURIComponent(apiKey)}`
        : videoUri;
      console.log("[Gemini Video] Downloading generated video...");
      const videoRes = await fetch(downloadUrl, {
        headers: { "x-goog-api-key": apiKey }
      });
      if (!videoRes.ok) throw new Error(`Failed to download video from Google: ${videoRes.status}`);
      videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    }
    const filename = `veo_${crypto.randomUUID()}.mp4`;
    const key = buildUserAssetObjectKey({
      userEmail: authState.user.email,
      folder: "generated/video/veo",
      filename,
    });
    await uploadBufferToS3Key(key, videoBuffer, "video/mp4");
    const url = stableKnowledgeFileUrlFromKey(key);

    const costDur = effectiveDur > 0 ? effectiveDur : 8;
    await recordApiUsage({
      provider: "gemini",
      userEmail: usageUserEmail,
      serviceId: "gemini-veo",
      route: "/api/gemini/video",
      model: "veo-3.1-generate-preview",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd:
        Math.round(
          estimateGeminiVeoVideoUsd(costDur) *
            veoResolutionMultiplier(resStr) *
            1_000_000,
        ) / 1_000_000,
      note: "Veo vídeo (coste orientativo por segundo)",
    });

    return NextResponse.json({ 
      output: url,
      key: key,
      status: "success"
    });

  } catch (error: unknown) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { error: `API bloqueada en admin: ${error.label}` },
        { status: 423 },
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Gemini Video] Global Exception:", message);
    return NextResponse.json({ error: `Server Exception: ${message}` }, { status: 500 });
  }
}
