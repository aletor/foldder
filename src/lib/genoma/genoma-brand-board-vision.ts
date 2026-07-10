import { GoogleGenAI } from "@google/genai";
import { parseJsonObjectFromVisionModelText } from "@/lib/brain/brain-vision-json-from-text";
import { GEMINI_VISION_ANALYSIS_SERVICE_ID } from "@/lib/brain/brain-vision-usage";
import { recordApiUsage } from "@/lib/api-usage";
import { estimateGeminiUsd } from "@/lib/pricing-config";
import { withGeminiRetries } from "@/lib/genoma/ingest/gemini-retry";
import {
  BRAND_BOARD_VISION_RESPONSE_SCHEMA,
  parseBrandBoardVisionResponse,
  type BrandBoardVisionResult,
} from "./genoma-brand-board-vision-schema";
import {
  BRAND_BOARD_VISION_SYSTEM,
  BRAND_BOARD_VISION_USER_PROMPT,
  BRAND_BOARD_LOGO_FOCUS_USER_PROMPT,
} from "./genoma-brand-board-vision-prompt";

const BRAND_BOARD_VISION_MODEL =
  process.env.GENOMA_BRAND_BOARD_VISION_MODEL?.trim() ||
  process.env.BRAIN_VISION_GEMINI_MODEL?.trim() ||
  "gemini-2.5-flash";

function extractJsonText(response: unknown): string {
  const r = response as {
    text?: string;
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (typeof r.text === "string" && r.text.trim()) return r.text;
  return (r.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("");
}

export type InvokeBrandBoardVisionInput = {
  pngBase64: string;
  fileName: string;
  contentSha256: string;
  userEmail?: string;
  route?: string;
};

export type InvokeBrandBoardVisionOutput = {
  result: BrandBoardVisionResult | null;
  model: string;
  estimatedCostUsd: number;
  error?: string;
};

export async function invokeBrandBoardVision(
  input: InvokeBrandBoardVisionInput,
): Promise<InvokeBrandBoardVisionOutput> {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  if (!apiKey) {
    return { result: null, model: BRAND_BOARD_VISION_MODEL, estimatedCostUsd: 0, error: "missing_gemini_api_key" };
  }

  const ai = new GoogleGenAI({ apiKey });
  const operationId = `genoma:brand-board:${input.contentSha256.slice(0, 16)}`;

  try {
    const response = await withGeminiRetries({
      run: async () =>
        ai.models.generateContent({
          model: BRAND_BOARD_VISION_MODEL,
          contents: [
            {
              role: "user",
              parts: [
                { text: `${BRAND_BOARD_VISION_USER_PROMPT}\n\nArchivo: ${input.fileName}` },
                { inlineData: { mimeType: "image/png", data: input.pngBase64 } },
              ],
            },
          ],
          config: {
            systemInstruction: BRAND_BOARD_VISION_SYSTEM,
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: BRAND_BOARD_VISION_RESPONSE_SCHEMA,
          },
        }),
    });

    const usage = (response as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } })
      .usageMetadata;
    const estimatedCostUsd = estimateGeminiUsd(
      BRAND_BOARD_VISION_MODEL,
      usage?.promptTokenCount ?? 0,
      usage?.candidatesTokenCount ?? 0,
    );

    await recordApiUsage({
      provider: "gemini",
      userEmail: input.userEmail,
      serviceId: GEMINI_VISION_ANALYSIS_SERVICE_ID,
      route: input.route ?? "/api/spaces/genoma/ingest",
      model: BRAND_BOARD_VISION_MODEL,
      operation: operationId,
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0,
      costIsKnown: true,
      costUsd: estimatedCostUsd,
    }).catch(() => undefined);

    const parsed = parseBrandBoardVisionResponse(parseJsonObjectFromVisionModelText(extractJsonText(response)));
    if (!parsed) {
      return { result: null, model: BRAND_BOARD_VISION_MODEL, estimatedCostUsd, error: "parse_failed" };
    }

    return { result: parsed, model: BRAND_BOARD_VISION_MODEL, estimatedCostUsd };
  } catch (error) {
    return {
      result: null,
      model: BRAND_BOARD_VISION_MODEL,
      estimatedCostUsd: 0,
      error: error instanceof Error ? error.message : "vision_failed",
    };
  }
}

/** Segundo pase (aprobado en preflight): bbox del logo principal si el análisis completo no recortó logo. */
export async function invokeBrandBoardLogoFocusVision(
  input: InvokeBrandBoardVisionInput,
): Promise<InvokeBrandBoardVisionOutput> {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  if (!apiKey) {
    return { result: null, model: BRAND_BOARD_VISION_MODEL, estimatedCostUsd: 0, error: "missing_gemini_api_key" };
  }

  const ai = new GoogleGenAI({ apiKey });
  const operationId = `genoma:brand-board-logo:${input.contentSha256.slice(0, 16)}`;

  try {
    const response = await withGeminiRetries({
      run: async () =>
        ai.models.generateContent({
          model: BRAND_BOARD_VISION_MODEL,
          contents: [
            {
              role: "user",
              parts: [
                { text: `${BRAND_BOARD_LOGO_FOCUS_USER_PROMPT}\n\nArchivo: ${input.fileName}` },
                { inlineData: { mimeType: "image/png", data: input.pngBase64 } },
              ],
            },
          ],
          config: {
            systemInstruction: BRAND_BOARD_VISION_SYSTEM,
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: BRAND_BOARD_VISION_RESPONSE_SCHEMA,
          },
        }),
    });

    const usage = (response as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } })
      .usageMetadata;
    const estimatedCostUsd = estimateGeminiUsd(
      BRAND_BOARD_VISION_MODEL,
      usage?.promptTokenCount ?? 0,
      usage?.candidatesTokenCount ?? 0,
    );

    await recordApiUsage({
      provider: "gemini",
      userEmail: input.userEmail,
      serviceId: GEMINI_VISION_ANALYSIS_SERVICE_ID,
      route: input.route ?? "/api/spaces/genoma/ingest",
      model: BRAND_BOARD_VISION_MODEL,
      operation: operationId,
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0,
      costIsKnown: true,
      costUsd: estimatedCostUsd,
    }).catch(() => undefined);

    const parsed = parseBrandBoardVisionResponse(parseJsonObjectFromVisionModelText(extractJsonText(response)));
    if (!parsed?.logos.length) {
      return { result: null, model: BRAND_BOARD_VISION_MODEL, estimatedCostUsd, error: "no_logos_in_focus_pass" };
    }

    return { result: parsed, model: BRAND_BOARD_VISION_MODEL, estimatedCostUsd };
  } catch (error) {
    return {
      result: null,
      model: BRAND_BOARD_VISION_MODEL,
      estimatedCostUsd: 0,
      error: error instanceof Error ? error.message : "vision_failed",
    };
  }
}
