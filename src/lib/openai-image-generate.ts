/**
 * Generación de imagen OpenAI ChatGPT Images (gpt-image-2) — lógica compartida
 * para POST /api/openai/generate-stream.
 */

import crypto from "crypto";
import OpenAI, { toFile } from "openai";
import { uploadBufferToS3Key, uploadToS3, getPresignedUrl } from "@/lib/s3-utils";
import { stableKnowledgeFileUrlFromKey, tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
import { recordApiUsage } from "@/lib/api-usage";
import { estimateOpenAiImageGenerationUsd, resolveOpenAiImageQuality } from "@/lib/pricing-config";
import { resolveOpenAiImageSize } from "@/lib/openai-image-size";
import { parseReferenceImageForGemini } from "@/lib/parse-reference-image";
import { canUserAccessKnowledgeFileKey } from "@/lib/spaces-access-control";
import { normalizeGenerativeImagePrompt } from "@/lib/normalize-generative-image-prompt";

export const OPENAI_IMAGE_MODEL = "gpt-image-2" as const;

export type OpenAiImageGenerateBody = {
  prompt: string;
  images?: string[];
  image?: string;
  aspect_ratio?: string;
  resolution?: string;
};

export type OpenAiImageGenerateResult = {
  output: string;
  key: string;
  model: string;
  time: number;
};

export type OpenAiImageGenerateOptions = {
  usageRoute?: string;
  usageUserEmail?: string;
};

export class OpenAiGenerateError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: string,
  ) {
    super(message);
    this.name = "OpenAiGenerateError";
  }
}

export { resolveOpenAiImageSize } from "@/lib/openai-image-size";
export { resolveOpenAiImageQuality } from "@/lib/pricing-config";

function userScopedGeneratedImageKey(filename: string, userEmail?: string): string | null {
  const normalizedEmail = (userEmail || "").trim().toLowerCase();
  if (!normalizedEmail) return null;
  const ownerHash = crypto.createHash("sha256").update(normalizedEmail).digest("hex").slice(0, 20);
  const safeFilename =
    filename
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "") || `openai_${crypto.randomUUID()}.png`;
  return `knowledge-files/user-assets/${ownerHash}/generated/${Date.now()}-${safeFilename}`;
}

function openAiApiErrorMessage(status: number, detail: string): string {
  if (status === 429) {
    return "OpenAI API quota reached (429). No automatic retry was made.";
  }
  if (status === 503 || /timeout|timed?\s*out|deadline/i.test(detail)) {
    return "OpenAI could not complete the image generation in time. No automatic retry was made to avoid extra cost.";
  }
  return `OpenAI Error (${status})`;
}

function detectImageFormat(buffer: Buffer): { contentType: string; extension: string } {
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
  return { contentType: "image/png", extension: "png" };
}

export async function openAiImageGenerate(
  raw: OpenAiImageGenerateBody,
  onProgress?: (progress: number, stage: string) => void,
  options?: OpenAiImageGenerateOptions,
): Promise<OpenAiImageGenerateResult> {
  const usageRoute = options?.usageRoute ?? "/api/openai/generate-stream";
  const usageUserEmail = options?.usageUserEmail;
  const report = (progress: number, stage: string) => {
    onProgress?.(Math.min(100, Math.max(0, Math.round(progress))), stage);
  };

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new OpenAiGenerateError("OPENAI_API_KEY not configured", 500);

  const { prompt, images, image, aspect_ratio, resolution } = raw;
  const allImages: string[] = [];
  if (images && Array.isArray(images)) allImages.push(...images.filter(Boolean));
  else if (image) allImages.push(image);

  const slice = allImages.slice(0, 4);
  const textOnlyRecreation = slice.length === 0;
  const normalizedPrompt = normalizeGenerativeImagePrompt(String(prompt || "").trim(), {
    targetAspectRatio: aspect_ratio,
    textOnlyRecreation,
  });
  if (!normalizedPrompt) throw new OpenAiGenerateError("Prompt is required", 400);

  const size = resolveOpenAiImageSize(aspect_ratio, resolution);
  const quality = resolveOpenAiImageQuality(resolution);
  const openai = new OpenAI({ apiKey });
  const startTime = Date.now();
  report(4, "prepare");

  const refBuffers: Buffer[] = [];
  const n = slice.length || 1;
  for (let i = 0; i < slice.length; i++) {
    const s3Key = tryExtractKnowledgeFilesKeyFromUrl(slice[i]);
    if (s3Key) {
      const allowed = usageUserEmail
        ? await canUserAccessKnowledgeFileKey(usageUserEmail, s3Key)
        : false;
      if (!allowed) {
        throw new OpenAiGenerateError("Forbidden reference image", 403);
      }
    }
    const parsed = await parseReferenceImageForGemini(s3Key ?? slice[i]);
    if (parsed) {
      refBuffers.push(Buffer.from(parsed.data, "base64"));
    } else {
      console.warn(
        `[openai-image] reference ${i + 1}/${slice.length} unreadable (prefix=${String(slice[i]).slice(0, 40)}…)`,
      );
    }
    report(10 + Math.round(((i + 1) / n) * 8), "refs");
  }
  if (slice.length === 0) report(12, "refs");

  if (slice.length > 0 && refBuffers.length !== slice.length) {
    throw new OpenAiGenerateError(
      `Referencias incompletas: se enviaron ${refBuffers.length} de ${slice.length} imagen(es) a OpenAI (data URL o URL inválida o expirada).`,
      400,
    );
  }

  report(18, "payload");
  report(20, "openai");

  let imageBuffer: Buffer | null = null;
  try {
    if (refBuffers.length > 0) {
      const imageFiles = await Promise.all(
        refBuffers.map((buffer, index) => {
          const detected = detectImageFormat(buffer);
          return toFile(buffer, `openai-ref-${index}.${detected.extension}`, { type: detected.contentType });
        }),
      );
      const result = await openai.images.edit({
        model: OPENAI_IMAGE_MODEL,
        prompt: normalizedPrompt,
        image: imageFiles.length === 1 ? imageFiles[0]! : imageFiles,
        size,
        quality,
      });
      const b64 = result.data?.[0]?.b64_json;
      if (!b64) {
        throw new OpenAiGenerateError("No image was generated by OpenAI.", 500);
      }
      imageBuffer = Buffer.from(b64, "base64");
    } else {
      const result = await openai.images.generate({
        model: OPENAI_IMAGE_MODEL,
        prompt: normalizedPrompt,
        size,
        quality,
      });
      const b64 = result.data?.[0]?.b64_json;
      if (!b64) {
        throw new OpenAiGenerateError("No image was generated by OpenAI.", 500);
      }
      imageBuffer = Buffer.from(b64, "base64");
    }
  } catch (error: unknown) {
    if (error instanceof OpenAiGenerateError) throw error;
    const status = typeof (error as { status?: unknown })?.status === "number"
      ? (error as { status: number }).status
      : 500;
    const detail = error instanceof Error ? error.message : String(error);
    throw new OpenAiGenerateError(openAiApiErrorMessage(status, detail), status, detail.slice(0, 600));
  }

  if (!imageBuffer || imageBuffer.length < 2048) {
    throw new OpenAiGenerateError(
      "Generated image appears corrupt or empty. Try a shorter, more descriptive prompt.",
      500,
    );
  }

  report(90, "s3");
  const detected = detectImageFormat(imageBuffer);
  const filename = `openai_${crypto.randomUUID()}.${detected.extension}`;
  const userScopedKey = userScopedGeneratedImageKey(filename, usageUserEmail);
  const key = userScopedKey
    ? await uploadBufferToS3Key(userScopedKey, imageBuffer, detected.contentType)
    : await uploadToS3(filename, imageBuffer, detected.contentType);
  const output = stableKnowledgeFileUrlFromKey(key) ?? (await getPresignedUrl(key));

  await recordApiUsage({
    provider: "openai",
    userEmail: usageUserEmail,
    serviceId: "openai-images",
    route: usageRoute,
    model: OPENAI_IMAGE_MODEL,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: estimateOpenAiImageGenerationUsd(resolution, quality, aspect_ratio),
    note: `Imagen ChatGPT (${quality}, ${size})`,
  });

  report(100, "done");
  return {
    output,
    key,
    model: OPENAI_IMAGE_MODEL,
    time: Date.now() - startTime,
  };
}
