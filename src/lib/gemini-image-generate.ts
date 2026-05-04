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
import { parseReferenceImageForGemini } from "@/lib/parse-reference-image";
import crypto from "crypto";

export const GEMINI_IMAGE_MODELS = {
  flash31: "gemini-3.1-flash-image-preview",
  pro3: "gemini-3-pro-image-preview",
  flash25: "gemini-2.5-flash-image",
} as const;

/** Solo el tablero Nano Banana de Referencias visuales (Brain): mensajes ES y detección explícita de copyright. */
export type GeminiImageClientContext = "brain_visual_dna_collage";

export type GeminiImageGenerateBody = {
  prompt: string;
  images?: string[];
  image?: string;
  aspect_ratio?: string;
  resolution?: string;
  model?: string;
  thinking?: boolean;
  /**
   * Metadato interno (no se envía a Google). Si es `brain_visual_dna_collage`, se aplican mensajes y códigos
   * orientados a copyright en fallos sin imagen. El resto de llamadas conservan el comportamiento genérico.
   */
  geminiClientContext?: GeminiImageClientContext;
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
  usageUserEmail?: string;
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

/** Texto de API o modelo que suele indicar bloqueo por copyright / recitación / contenido protegido. */
const COPYRIGHT_OR_POLICY_HINT =
  /copyright|recit|recitation|protected content|intellectual property|third[- ]party|licensed material|watermark|dmca|content policy|blocked for policy|image_safety|trademark/i;

const MSG_COPYRIGHT_ES =
  "Generación detenida: el modelo bloqueó la salida por posible derechos de autor o contenido protegido (referencias o texto demasiado cercanos a material ajeno). Cambia las imágenes de referencia, evita logotipos o capturas reconocibles y vuelve a intentarlo.";

const MSG_SAFETY_ES =
  "Generación detenida: el modelo aplicó filtros de seguridad al prompt o a las imágenes de entrada. Usa referencias más neutras o un prompt más genérico.";

function looksCopyrightOrRecitationPolicy(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && COPYRIGHT_OR_POLICY_HINT.test(t);
}

function classifyNoImageFailure(params: {
  finishReason: string;
  promptBlockReason?: string;
  textResponse: string;
}): { userMessage: string; status: number } {
  const fr = String(params.finishReason || "UNKNOWN").trim();
  const frU = fr.toUpperCase();
  const pb = String(params.promptBlockReason || "").trim();
  const pbU = pb.toUpperCase();
  const text = `${params.textResponse || ""} ${fr} ${pb}`;

  if (frU === "RECITATION" || looksCopyrightOrRecitationPolicy(text)) {
    return { userMessage: MSG_COPYRIGHT_ES, status: 422 };
  }
  if (frU === "SAFETY" || frU === "IMAGE_SAFETY" || pbU === "SAFETY" || pbU === "BLOCKED_REASON_SAFETY") {
    return { userMessage: MSG_SAFETY_ES, status: 422 };
  }
  if (frU === "OTHER" || frU === "IMAGE_OTHER" || pbU === "OTHER" || pbU === "BLOCKED_REASON_OTHER") {
    return { userMessage: MSG_COPYRIGHT_ES, status: 422 };
  }
  return {
    userMessage: "No se generó imagen. Prueba con otras referencias o un prompt más corto y genérico.",
    status: 500,
  };
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
  const usageUserEmail = options?.usageUserEmail;
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
    geminiClientContext,
  } = raw;

  const dnaCollageCopyrightUi = geminiClientContext === "brain_visual_dna_collage";

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
  let inlineImageCount = 0;
  for (let i = 0; i < slice.length; i++) {
    const parsed = await parseReferenceImageForGemini(slice[i]);
    if (parsed) {
      parts.push({ inline_data: { mime_type: parsed.mimeType, data: parsed.data } });
      inlineImageCount += 1;
    } else {
      console.warn(
        `[gemini-image] reference ${i + 1}/${slice.length} unreadable (prefix=${String(slice[i]).slice(0, 40)}…)`,
      );
    }
    report(10 + Math.round(((i + 1) / n) * 8), "refs");
  }
  if (slice.length === 0) report(12, "refs");

  if (slice.length > 0 && inlineImageCount !== slice.length) {
    throw new GeminiGenerateError(
      `Referencias incompletas: se enviaron ${inlineImageCount} de ${slice.length} imagen(es) a Gemini (data URL o URL inválida o expirada).`,
      400,
    );
  }

  parts.push({ text: prompt });
  report(18, "payload");

  // Debe coincidir con normalizeNanoBananaResolution en el cliente (por defecto 2k si el nodo no trae dato).
  let imageSize = "1K";
  const resInput = (resolution && String(resolution).trim()
    ? String(resolution).toLowerCase()
    : "2k");
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
    const detail = String(data.error?.message || JSON.stringify(data));
    if (dnaCollageCopyrightUi && !isQuota && looksCopyrightOrRecitationPolicy(detail)) {
      throw new GeminiGenerateError(MSG_COPYRIGHT_ES, 422, detail);
    }
    throw new GeminiGenerateError(
      isQuota ? "Google API Quota Reached (429)" : `Gemini Error (${response.status})`,
      response.status || 500,
      detail,
    );
  }

  report(84, "parse");

  const candidate = data.candidates?.[0];
  const promptBlockReason =
    typeof data.promptFeedback?.blockReason === "string" ? data.promptFeedback.blockReason : undefined;
  const finishReason = candidate?.finishReason || promptBlockReason || "UNKNOWN";

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
    const detail =
      textResponse.trim() ||
      (promptBlockReason ? `promptFeedback: ${promptBlockReason}` : "") ||
      `finishReason: ${finishReason}`;
    if (!dnaCollageCopyrightUi) {
      const msgMap: Record<string, string> = {
        SAFETY: "Safety violation: Prompt or content blocked.",
        OTHER: "Content blocked (copyright/safety filter). Try a more generic prompt.",
        UNKNOWN: "No image was generated. Try a different prompt.",
      };
      throw new GeminiGenerateError(
        msgMap[finishReason] || msgMap.UNKNOWN,
        500,
        detail || undefined,
      );
    }
    const { userMessage, status } = classifyNoImageFailure({
      finishReason,
      promptBlockReason,
      textResponse,
    });
    throw new GeminiGenerateError(userMessage, status, detail || undefined);
  }

  report(90, "s3");
  const filename = `gemini_${modelKey}_${crypto.randomUUID()}.png`;
  const key = await uploadToS3(filename, imageBuffer, "image/png");
  const url = await getPresignedUrl(key);

  const usage = parseGeminiUsageMetadata(data);
  if (usage) {
    await recordApiUsage({
      provider: "gemini",
      userEmail: usageUserEmail,
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
      userEmail: usageUserEmail,
      serviceId: "gemini-nano",
      route: usageRoute,
      model: modelId,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: estimateGeminiImageGenerationUsd(String(modelKey), resInput),
      note: `Imagen sin usageMetadata en respuesta (coste estimado por generación, resolución ${resInput})`,
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
