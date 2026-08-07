/**
 * Generación de imagen Gemini (Nano Banana) — lógica compartida entre
 * POST /api/gemini/generate y POST /api/gemini/generate-stream.
 *
 * El progreso refleja fases reales del servidor; durante la llamada HTTP a Google
 * (sin API de avance) se usa tiempo transcurrido vs. una duración esperada por modelo.
 */

import { uploadBufferToS3Key, uploadToS3, getPresignedUrl } from "@/lib/s3-utils";
import { stableKnowledgeFileUrlFromKey } from "@/lib/s3-media-hydrate";
import { parseGeminiUsageMetadata, recordApiUsage } from "@/lib/api-usage";
import { estimateGeminiImageGenerationUsd } from "@/lib/pricing-config";
import { parseReferenceImageForGemini } from "@/lib/parse-reference-image";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
import {
  canUserAccessKnowledgeFileKey,
} from "@/lib/spaces-access-control";
import crypto from "crypto";
import { normalizeGenerativeImagePrompt } from "@/lib/normalize-generative-image-prompt";

export const GEMINI_IMAGE_MODELS = {
  flash31: "gemini-3.1-flash-image-preview",
  pro3: "gemini-3-pro-image-preview",
  flash25: "gemini-2.5-flash-image",
} as const;

const GEMINI3_NATIVE_HIRES_MODELS = new Set<string>([
  GEMINI_IMAGE_MODELS.flash31,
  GEMINI_IMAGE_MODELS.pro3,
]);

/**
 * Gemini 3 image models often return hazy low-detail frames at native 2K/4K
 * (especially with short prompts). Request 1K from the API and upscale locally.
 */
export function resolveGeminiApiImageSize(
  modelId: string,
  resolutionInput?: string,
): { apiImageSize: string; upscaleFactor: number; requestedResolution: string } {
  const resInput = (resolutionInput && String(resolutionInput).trim()
    ? String(resolutionInput).toLowerCase()
    : "2k");

  let apiImageSize = "1K";
  if (resInput === "0.5k" || resInput === "512") apiImageSize = "512";
  else if (resInput === "1k") apiImageSize = "1K";
  else if (resInput === "2k") apiImageSize = "2K";
  else if (resInput === "4k") apiImageSize = "4K";
  else apiImageSize = resInput.toUpperCase();

  if (!GEMINI3_NATIVE_HIRES_MODELS.has(modelId)) {
    return { apiImageSize, upscaleFactor: 1, requestedResolution: resInput };
  }

  if (resInput === "2k") {
    return { apiImageSize: "1K", upscaleFactor: 2, requestedResolution: resInput };
  }
  if (resInput === "4k") {
    return { apiImageSize: "1K", upscaleFactor: 4, requestedResolution: resInput };
  }

  return { apiImageSize, upscaleFactor: 1, requestedResolution: resInput };
}

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

/** Valores aceptados por `generation_config.image_config.aspect_ratio` en Gemini. */
export const GEMINI_IMAGE_ASPECT_RATIOS = [
  "1:1",
  "1:4",
  "1:8",
  "2:3",
  "3:2",
  "3:4",
  "4:1",
  "4:3",
  "4:5",
  "5:4",
  "8:1",
  "9:16",
  "16:9",
  "21:9",
] as const;

export type GeminiImageAspectRatio = (typeof GEMINI_IMAGE_ASPECT_RATIOS)[number];

const GEMINI_IMAGE_ASPECT_RATIO_ALIASES: Record<string, GeminiImageAspectRatio> = {
  "2.39:1": "21:9",
  "2.35:1": "21:9",
  "2.40:1": "21:9",
};

/** Normaliza ratios creativos (p. ej. anamórfico 2.39:1) a valores soportados por Gemini. */
export function normalizeGeminiImageAspectRatio(ratio?: string): GeminiImageAspectRatio {
  const value = (ratio ?? "1:1").trim();
  if ((GEMINI_IMAGE_ASPECT_RATIOS as readonly string[]).includes(value)) {
    return value as GeminiImageAspectRatio;
  }
  return GEMINI_IMAGE_ASPECT_RATIO_ALIASES[value] ?? "16:9";
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

function userScopedGeneratedImageKey(filename: string, userEmail?: string): string | null {
  const normalizedEmail = (userEmail || "").trim().toLowerCase();
  if (!normalizedEmail) return null;
  const ownerHash = crypto.createHash("sha256").update(normalizedEmail).digest("hex").slice(0, 20);
  const safeFilename =
    filename
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "") || `gemini_${crypto.randomUUID()}.png`;
  return `knowledge-files/user-assets/${ownerHash}/generated/${Date.now()}-${safeFilename}`;
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

function isGeminiDeadlineError(status: number, detail: string): boolean {
  return status === 503 && /deadline|timeout|timed?\s*out|expired/i.test(detail);
}

type GeminiResponsePart = {
  text?: string;
  thought?: boolean;
  inline_data?: { mime_type?: string; data?: string };
  inlineData?: { mimeType?: string; data?: string };
};

type GeminiImageCandidate = { buf: Buffer; index: number; thought: boolean };

function collectGeminiImageCandidates(parts: GeminiResponsePart[]): GeminiImageCandidate[] {
  const candidates: GeminiImageCandidate[] = [];
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    const inlineData = part.inline_data || part.inlineData;
    if (!inlineData?.data) continue;
    const buf = Buffer.from(String(inlineData.data), "base64");
    if (!buf.length) continue;
    candidates.push({ buf, index, thought: part.thought === true });
  }
  return candidates;
}

/**
 * Gemini 3 image models run an internal "thinking" pass and may return interim
 * preview frames (`thought: true`, or unmarked but before the final frame).
 * The final render is the last non-thought inline image — not the largest.
 */
export function extractGeminiGeneratedImageBuffer(parts: GeminiResponsePart[]): Buffer | null {
  const candidates = collectGeminiImageCandidates(parts);
  if (!candidates.length) return null;
  const finals = candidates.filter((candidate) => !candidate.thought);
  if (finals.length) return finals[finals.length - 1]!.buf;
  return candidates[candidates.length - 1]!.buf;
}

type FinalizedGeminiImage = { buffer: Buffer; contentType: string; extension: string };

function detectGeminiImageFormat(buffer: Buffer): { contentType: string; extension: string } {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { contentType: "image/png", extension: "png" };
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { contentType: "image/webp", extension: "webp" };
  }
  return { contentType: "image/jpeg", extension: "jpg" };
}

/** Validate, optionally upscale, and normalize Gemini output bytes for S3 upload. */
export async function finalizeGeminiImageBuffer(
  imageBuffer: Buffer,
  upscaleFactor: number,
): Promise<FinalizedGeminiImage> {
  const detected = detectGeminiImageFormat(imageBuffer);
  try {
    const sharpMod = await import("sharp");
    const sharp = sharpMod.default;
    const meta = await sharp(imageBuffer, { failOn: "none" }).metadata();
    if (!meta.width || !meta.height || meta.width < 32 || meta.height < 32) {
      throw new GeminiGenerateError(
        "Generated image has invalid dimensions. Try a different prompt or model.",
        500,
      );
    }
    let pipeline = sharp(imageBuffer, { failOn: "none" });
    if (upscaleFactor > 1) {
      pipeline = pipeline.resize(meta.width * upscaleFactor, meta.height * upscaleFactor, {
        kernel: sharp.kernel.lanczos3,
      });
    }
    const buffer = await pipeline.png().toBuffer();
    return { buffer, contentType: "image/png", extension: "png" };
  } catch (error) {
    if (error instanceof GeminiGenerateError) throw error;
    console.warn(
      "[gemini-image] sharp finalize failed; uploading Gemini source bytes",
      error instanceof Error ? error.message : error,
      upscaleFactor > 1 ? `(requested ${upscaleFactor}x upscale skipped)` : "",
    );
    return {
      buffer: imageBuffer,
      contentType: detected.contentType,
      extension: detected.extension,
    };
  }
}

function geminiApiErrorMessage(status: number, detail: string): string {
  if (status === 429 || /RESOURCE_EXHAUSTED|monthly spending cap|project spend cap/i.test(detail)) {
    if (/monthly spending cap|project spend cap|ai\.studio\/spend/i.test(detail)) {
      return "El proyecto de Google AI ha superado el tope de gasto mensual. Súbelo o restablécelo en https://ai.studio/spend y vuelve a intentar.";
    }
    return "Cuota o límite de Google Gemini agotado (429). No se ha reintentado automáticamente.";
  }
  if (isGeminiDeadlineError(status, detail)) {
    return "Gemini could not complete the image generation in time (503). No automatic retry was made to avoid extra cost.";
  }
  return `Gemini Error (${status})`;
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

  const allImages: string[] = [];
  if (images && Array.isArray(images)) allImages.push(...images.filter(Boolean));
  else if (image) allImages.push(image);

  const MAX_REFS = modelKey === "pro3" ? 5 : 4;
  const slice = allImages.slice(0, MAX_REFS);
  const textOnlyRecreation = slice.length === 0;

  const normalizedPrompt = normalizeGenerativeImagePrompt(String(prompt || "").trim(), {
    targetAspectRatio: aspect_ratio,
    textOnlyRecreation,
  });
  if (!normalizedPrompt) throw new GeminiGenerateError("Prompt is required", 400);

  const modelId =
    GEMINI_IMAGE_MODELS[modelKey as keyof typeof GEMINI_IMAGE_MODELS] || GEMINI_IMAGE_MODELS.flash31;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;

  const startTime = Date.now();
  report(4, "prepare");

  const parts: unknown[] = [];
  const n = slice.length || 1;
  let inlineImageCount = 0;
  for (let i = 0; i < slice.length; i++) {
    const s3Key = tryExtractKnowledgeFilesKeyFromUrl(slice[i]);
    if (s3Key) {
      const allowed = usageUserEmail
        ? await canUserAccessKnowledgeFileKey(usageUserEmail, s3Key)
        : false;
      if (!allowed) {
        throw new GeminiGenerateError("Forbidden reference image", 403);
      }
    }
    const parsed = await parseReferenceImageForGemini(s3Key ?? slice[i]);
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

  parts.push({ text: normalizedPrompt });
  report(18, "payload");

  // Debe coincidir con normalizeNanoBananaResolution en el cliente (por defecto 1k si el nodo no trae dato).
  const { apiImageSize, upscaleFactor, requestedResolution } = resolveGeminiApiImageSize(
    modelId,
    resolution,
  );
  if (upscaleFactor > 1) {
    console.info(
      `[gemini-image] ${modelId} requested ${requestedResolution.toUpperCase()} → API 1K + ${upscaleFactor}x upscale`,
    );
  }

  const generationConfig: Record<string, unknown> = {
    responseModalities: ["TEXT", "IMAGE"],
    imageConfig: {
      aspectRatio: normalizeGeminiImageAspectRatio(aspect_ratio),
      ...(modelId !== GEMINI_IMAGE_MODELS.flash25 && { imageSize: apiImageSize }),
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
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(payload),
    });
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
      geminiApiErrorMessage(response.status || 500, detail),
      response.status || 500,
      detail,
    );
  }

  report(84, "parse");

  const candidate = data.candidates?.[0];
  const promptBlockReason =
    typeof data.promptFeedback?.blockReason === "string" ? data.promptFeedback.blockReason : undefined;
  const finishReason = candidate?.finishReason || promptBlockReason || "UNKNOWN";

  const responseParts = candidate?.content?.parts || [];
  const imageCandidates = collectGeminiImageCandidates(responseParts);
  if (imageCandidates.length > 1) {
    console.info(
      `[gemini-image] ${imageCandidates.length} inline image part(s); using last non-thought frame`,
    );
  }
  let imageBuffer = extractGeminiGeneratedImageBuffer(responseParts);

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
        NO_IMAGE: "No image was generated. Try a different prompt or model.",
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

  if (imageBuffer.length < 2048) {
    throw new GeminiGenerateError(
      "Generated image appears corrupt or empty. Try a shorter, more descriptive prompt.",
      500,
    );
  }

  const finalized = await finalizeGeminiImageBuffer(imageBuffer, upscaleFactor);
  imageBuffer = finalized.buffer;

  report(90, "s3");
  const filename = `gemini_${modelKey}_${crypto.randomUUID()}.${finalized.extension}`;
  const userScopedKey = userScopedGeneratedImageKey(filename, usageUserEmail);
  const key = userScopedKey
    ? await uploadBufferToS3Key(userScopedKey, imageBuffer, finalized.contentType)
    : await uploadToS3(filename, imageBuffer, finalized.contentType);
  const output = stableKnowledgeFileUrlFromKey(key) ?? (await getPresignedUrl(key));

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
      costUsd: estimateGeminiImageGenerationUsd(String(modelKey), requestedResolution),
      note: `Imagen sin usageMetadata en respuesta (coste estimado por generación, resolución ${requestedResolution})`,
    });
  }

  report(100, "done");
  return {
    output,
    key,
    model: modelId,
    time: Date.now() - startTime,
  };
}
