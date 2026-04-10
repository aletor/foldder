/**
 * Generación de imagen Gemini (Nano Banana) — lógica compartida entre
 * POST /api/gemini/generate y POST /api/gemini/generate-stream.
 *
 * El progreso refleja fases reales del servidor; durante la llamada HTTP a Google
 * (sin API de avance) se usa tiempo transcurrido vs. una duración esperada por modelo.
 */

import { uploadToS3, getPresignedUrl } from "@/lib/s3-utils";
import { parseGeminiUsageMetadata, recordApiUsage } from "@/lib/api-usage";
import { estimateGeminiImageGenerationUsd } from "@/lib/pricing-config";
import crypto from "crypto";

export const GEMINI_IMAGE_MODELS = {
  flash31: "gemini-3.1-flash-image-preview",
  pro3: "gemini-3-pro-image-preview",
  flash25: "gemini-2.5-flash-image",
} as const;

export type GeminiImageGenerateBody = {
  prompt: string;
  images?: string[];
  image?: string;
  aspect_ratio?: string;
  resolution?: string;
  model?: string;
  thinking?: boolean;
};

export type GeminiImageGenerateResult = {
  output: string;
  key: string;
  model: string;
  time: number;
};

/** Optional flags for shared generator (e.g. correct usage log `route`). */
export type GeminiImageGenerateOptions = {
  /** Defaults to `/api/gemini/generate` for `recordApiUsage`. */
  usageRoute?: string;
};

export class GeminiGenerateError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: string
  ) {
    super(message);
    this.name = "GeminiGenerateError";
  }
}

async function imageUrlToBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const headerMime = res.headers.get("content-type")?.split(";")[0]?.trim();
    const mimeType =
      headerMime || (url.toLowerCase().includes(".png") ? "image/png" : "image/jpeg");
    return {
      data: Buffer.from(buffer).toString("base64"),
      mimeType,
    };
  } catch {
    return null;
  }
}

async function parseImage(image: string): Promise<{ data: string; mimeType: string } | null> {
  if (!image) return null;
  if (image.startsWith("data:")) {
    const [meta, data] = image.split(";base64,");
    return { data, mimeType: meta.split(":")[1] };
  }
  if (image.startsWith("http")) {
    return imageUrlToBase64(image);
  }
  return null;
}

function expectedGeminiWaitMs(modelKey: string, thinking: boolean): number {
  if (modelKey === "pro3" && thinking) return 120_000;
  if (modelKey === "pro3") return 60_000;
  if (modelKey === "flash25") return 25_000;
  return 35_000;
}

/**
 * Ejecuta la generación. `onProgress` recibe porcentaje 0–100 y clave de fase (servidor).
 */
export async function geminiImageGenerate(
  raw: GeminiImageGenerateBody,
  onProgress?: (progress: number, stage: string) => void,
  options?: GeminiImageGenerateOptions
): Promise<GeminiImageGenerateResult> {
  const usageRoute = options?.usageRoute ?? "/api/gemini/generate";
  const report = (progress: number, stage: string) => {
    onProgress?.(Math.min(100, Math.max(0, Math.round(progress))), stage);
  };

  const {
    prompt,
    images,
    image,
    aspect_ratio,
    resolution,
    model: modelKey = "flash31",
    thinking = false,
  } = raw;

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new GeminiGenerateError("API Key not configured", 500);
  if (!prompt) throw new GeminiGenerateError("Prompt is required", 400);

  const modelId =
    GEMINI_IMAGE_MODELS[modelKey as keyof typeof GEMINI_IMAGE_MODELS] || GEMINI_IMAGE_MODELS.flash31;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  const startTime = Date.now();
  report(4, "prepare");

  const parts: unknown[] = [];
  const allImages: string[] = [];
  if (images && Array.isArray(images)) allImages.push(...images.filter(Boolean));
  else if (image) allImages.push(image);

  const MAX_REFS = modelKey === "pro3" ? 5 : 4;
  const slice = allImages.slice(0, MAX_REFS);
  const n = slice.length || 1;
  for (let i = 0; i < slice.length; i++) {
    const parsed = await parseImage(slice[i]);
    if (parsed) {
      parts.push({ inline_data: { mime_type: parsed.mimeType, data: parsed.data } });
    }
    report(10 + Math.round(((i + 1) / n) * 8), "refs");
  }
  if (slice.length === 0) report(12, "refs");

  parts.push({ text: prompt });
  report(18, "payload");

  let imageSize = "1K";
  const resInput = (resolution || "1k").toLowerCase();
  if (resInput === "0.5k" || resInput === "512") imageSize = "512";
  else imageSize = resInput.toUpperCase();

  const generationConfig: Record<string, unknown> = {
    responseModalities: ["IMAGE"],
    imageConfig: {
      aspectRatio: aspect_ratio || "1:1",
      ...(modelId !== GEMINI_IMAGE_MODELS.flash25 && { imageSize }),
    },
  };

  if (thinking && modelId === GEMINI_IMAGE_MODELS.pro3) {
    generationConfig.thinkingConfig = { thinkingBudget: -1 };
  }

  const payload = {
    contents: [{ role: "user", parts }],
    generationConfig,
  };

  report(20, "gemini");
  const expectedMs = expectedGeminiWaitMs(modelKey, thinking && modelId === GEMINI_IMAGE_MODELS.pro3);
  const geminiWaitStart = Date.now();
  let lastReported = 20;

  const tickGeminiWait = () => {
    const elapsed = Date.now() - geminiWaitStart;
    const t = Math.min(1, elapsed / expectedMs);
    const p = 20 + Math.floor(t * 62);
    if (p > lastReported && p <= 82) {
      lastReported = p;
      report(p, "gemini");
    }
  };
  const waitTimer = setInterval(tickGeminiWait, 400);
  tickGeminiWait();

  let response: Response | undefined;
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.status === 429 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      break;
    }
  } finally {
    clearInterval(waitTimer);
  }

  if (!response) throw new GeminiGenerateError("No response from Gemini API", 500);

  const data = await response.json();

  if (data.error) {
    const isQuota = response.status === 429;
    throw new GeminiGenerateError(
      isQuota ? "Google API Quota Reached (429)" : `Gemini Error (${response.status})`,
      response.status || 500,
      data.error?.message || JSON.stringify(data)
    );
  }

  report(84, "parse");

  const candidate = data.candidates?.[0];
  const finishReason = candidate?.finishReason || data.promptFeedback?.blockReason || "UNKNOWN";

  let imageBuffer: Buffer | null = null;
  for (const part of candidate?.content?.parts || []) {
    const inlineData = part.inline_data || part.inlineData;
    if (inlineData?.data) {
      imageBuffer = Buffer.from(inlineData.data, "base64");
      break;
    }
  }

  if (!imageBuffer) {
    const textResponse = (candidate?.content?.parts || []).find((p: { text?: string }) => p.text)?.text || "";
    const msgMap: Record<string, string> = {
      SAFETY: "Safety violation: Prompt or content blocked.",
      OTHER: "Content blocked (copyright/safety filter). Try a more generic prompt.",
      UNKNOWN: "No image was generated. Try a different prompt.",
    };
    throw new GeminiGenerateError(
      msgMap[finishReason] || msgMap.UNKNOWN,
      500,
      textResponse || `Finish Reason: ${finishReason}`
    );
  }

  report(90, "s3");
  const filename = `gemini_${modelKey}_${crypto.randomUUID()}.png`;
  const key = await uploadToS3(filename, imageBuffer, "image/png");
  const url = await getPresignedUrl(key);

  const usage = parseGeminiUsageMetadata(data);
  if (usage) {
    await recordApiUsage({
      provider: "gemini",
      serviceId: "gemini-nano",
      route: usageRoute,
      model: modelId,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    });
  } else {
    await recordApiUsage({
      provider: "gemini",
      serviceId: "gemini-nano",
      route: usageRoute,
      model: modelId,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: estimateGeminiImageGenerationUsd(String(modelKey)),
      note: "Imagen sin usageMetadata en respuesta (coste estimado por generación)",
    });
  }

  report(100, "done");
  return {
    output: url,
    key,
    model: modelId,
    time: Date.now() - startTime,
  };
}
