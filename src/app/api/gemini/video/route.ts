import { NextRequest, NextResponse } from "next/server";
import { recordApiUsage } from "@/lib/api-usage";
import { uploadToS3, getPresignedUrl } from "@/lib/s3-utils";
import crypto from "crypto";

/** Vercel / hosting: permite polling largo (Veo suele tardar minutos). Ajusta según tu plan. */
export const maxDuration = 300;

/** Extrae el URI del vídeo en respuestas de operación larga (Veo 3.x). */
function extractVeoVideoUri(pollData: Record<string, unknown>): string {
  const response = pollData.response as Record<string, unknown> | undefined;
  const gen = response?.generateVideoResponse as Record<string, unknown> | undefined;
  if (!gen) return "";
  const samples = gen.generatedSamples as Array<{ video?: { uri?: string } }> | undefined;
  const u0 = samples?.[0]?.video?.uri;
  if (typeof u0 === "string" && u0.length > 0) return u0;
  const alt = gen.video as { uri?: string } | undefined;
  if (typeof alt?.uri === "string" && alt.uri.length > 0) return alt.uri;
  return "";
}

export async function POST(req: NextRequest) {
  console.log("[Gemini Video] Request received");
  try {
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
      cameraPreset
    } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "API Key not configured" }, { status: 500 });
    }

    const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
    const modelId = "veo-3.1-generate-preview";
    const endpoint = `${BASE_URL}/models/${modelId}:predictLongRunning?key=${apiKey}`;

    const referenceImages: any[] = [];

    const processImage = async (image: string, type: string) => {
      if (!image) return;
      let base64Data = "";
      let mimeType = "image/png";

      if (image.startsWith('data:')) {
        const splitParts = image.split(';base64,');
        mimeType = splitParts[0].split(':')[1];
        base64Data = splitParts[1];
      } else if (image.startsWith('http')) {
        const imgRes = await fetch(image, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        if (!imgRes.ok) throw new Error(`Failed to fetch ${type}: ${imgRes.status}`);
        const buffer = await imgRes.arrayBuffer();
        base64Data = Buffer.from(buffer).toString('base64');
        mimeType = imgRes.headers.get('content-type') || 'image/png';
      }

      if (base64Data) {
        referenceImages.push({
          image: {
            bytesBase64Encoded: base64Data,
            mimeType: mimeType
          },
          referenceType: type
        });
      }
    };

    await processImage(firstFrame, "first_frame");
    await processImage(lastFrame, "last_frame");

    // Construct Enhanced Prompt
    let finalPrompt = prompt;
    if (animationPrompt) finalPrompt += `. Animation: ${animationPrompt}`;
    if (cameraPreset) finalPrompt += `. Camera motion: ${cameraPreset}`;
    if (negativePrompt) finalPrompt += `. Negative prompt: avoid ${negativePrompt}`;

    const payload = {
      instances: [{
        prompt: finalPrompt,
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined
      }],
      parameters: {
        sampleCount: 1,
        aspectRatio: "16:9",
        resolution: resolution || "1080p",
        seed: seed !== undefined ? Number(seed) : undefined
      }
    };

    console.log("[Gemini Video] Payload Structure Verified");
    console.log(`[Gemini Video] Calling ${modelId}...`);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("[Gemini Video] API ERROR:", JSON.stringify(data, null, 2));
      return NextResponse.json({ error: data.error?.message || "Gemini Video API Error" }, { status: response.status });
    }

    const operationName = data.name as string;
    if (!operationName || typeof operationName !== "string") {
      console.error("[Gemini Video] Missing operation name:", data);
      return NextResponse.json({ error: "No operation name from Gemini" }, { status: 502 });
    }
    console.log(`[Gemini Video] Operation started: ${operationName}`);

    const pollPath = operationName.startsWith("http")
      ? `${operationName}${operationName.includes("?") ? "&" : "?"}key=${encodeURIComponent(apiKey)}`
      : `${BASE_URL}/${operationName}?key=${encodeURIComponent(apiKey)}`;

    let videoUri = "";
    const maxAttempts = 36; // 36 × 8s ≈ 288s + trabajo previo < maxDuration 300s
    const pollIntervalMs = 8000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`[Gemini Video] Polling attempt ${attempt}/${maxAttempts}...`);
      await new Promise((r) => setTimeout(r, pollIntervalMs));

      const pollRes = await fetch(pollPath);
      const pollData = (await pollRes.json().catch(() => ({}))) as Record<string, unknown>;

      if (!pollRes.ok) {
        console.warn("[Gemini Video] Poll HTTP error:", pollRes.status, pollData);
        continue;
      }

      if (pollData.done === true) {
        if (pollData.error) {
          const errObj = pollData.error as { message?: string; code?: number };
          const msg = errObj?.message || JSON.stringify(pollData.error);
          console.error("[Gemini Video] Operation error:", pollData.error);
          throw new Error(`Veo: ${msg}`);
        }
        videoUri = extractVeoVideoUri(pollData);
        console.log(`[Gemini Video] Operation complete. Video URI: ${videoUri ? "ok" : "(empty)"}`);
        if (videoUri) break;
        console.error("[Gemini Video] done=true but no URI. Snapshot:", JSON.stringify(pollData).slice(0, 1200));
        throw new Error(
          "Veo terminó pero no devolvió URI de vídeo. Revisa modelo/cuota o la respuesta en logs."
        );
      }
    }

    if (!videoUri) {
      throw new Error(
        "Tiempo de espera agotado: el vídeo no estuvo listo antes del límite del servidor. Prueba de nuevo o usa un plan con más tiempo de ejecución."
      );
    }

    // Download and upload to S3
    console.log("[Gemini Video] Downloading generated video...");
    const videoRes = await fetch(videoUri, {
      headers: { 'x-goog-api-key': apiKey }
    });
    if (!videoRes.ok) throw new Error("Failed to download video from Google");
    
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    const filename = `veo_${crypto.randomUUID()}.mp4`;
    const key = await uploadToS3(filename, videoBuffer, "video/mp4");
    const url = await getPresignedUrl(key);

    const dur = typeof durationSeconds === "number" && durationSeconds > 0 ? durationSeconds : 8;
    await recordApiUsage({
      provider: "gemini",
      serviceId: "gemini-veo",
      route: "/api/gemini/video",
      model: "veo-3.1-generate-preview",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: Math.round(dur * 0.05 * 1_000_000) / 1_000_000,
      note: "Veo vídeo (coste orientativo por segundo)",
    });

    return NextResponse.json({ 
      output: url,
      key: key,
      status: "success"
    });

  } catch (error: any) {
    console.error("[Gemini Video] Global Exception:", error.message);
    return NextResponse.json({ error: `Server Exception: ${error.message}` }, { status: 500 });
  }
}
