import { GoogleGenAI } from "@google/genai";
import { parseJsonObjectFromVisionModelText } from "@/lib/brain/brain-vision-json-from-text";
import { withGeminiRetries } from "@/lib/brandkit/ingest/gemini-retry";
import { estimateGeminiUsd } from "@/lib/pricing-config";
import { pageVisionNivel1GeminiModel } from "@/lib/brandkit/ingest/page-vision-pass-version";
import {
  LOGO_INTAKE_RESPONSE_SCHEMA,
  type ParsedVisionResponse,
} from "@/lib/brandkit/logo-intake/vision-schema";
import { LOGO_INTAKE_SYSTEM, LOGO_INTAKE_VISION_PROMPT } from "@/lib/brandkit/logo-intake/vision-prompt";
import type { IntakeFrame } from "@/lib/brandkit/logo-intake/render";

const MAX_IMAGES_PER_CALL = 24;

function extractJsonText(response: unknown): string {
  const r = response as {
    text?: string;
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (typeof r.text === "string" && r.text.trim()) return r.text;
  return (r.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
}

export async function invokeLogoIntakeVision(input: {
  frames: IntakeFrame[];
  userEmail?: string;
  route?: string;
  onRetry?: (attempt: number, max: number) => void;
}): Promise<{ parsed: ParsedVisionResponse; visionMs: number; visionCalls: number; estimatedCostUsd: number }> {
  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("missing_gemini_api_key");

  const modelName = pageVisionNivel1GeminiModel();
  const ai = new GoogleGenAI({ apiKey });
  const chunks: IntakeFrame[][] = [];
  for (let i = 0; i < input.frames.length; i += MAX_IMAGES_PER_CALL) {
    chunks.push(input.frames.slice(i, i + MAX_IMAGES_PER_CALL));
  }

  const started = Date.now();
  let estimatedCostUsd = 0;
  const merged: ParsedVisionResponse = { images: [] };

  for (const chunk of chunks) {
    const labelBlock = chunk.map((f) => `- ${f.label}`).join("\n");
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
      { text: `${LOGO_INTAKE_VISION_PROMPT}\n\nImages:\n${labelBlock}` },
    ];
    for (const frame of chunk) {
      parts.push({ text: frame.label });
      parts.push({ inlineData: { mimeType: "image/jpeg", data: frame.jpegBase64 } });
    }

    const response = await withGeminiRetries({
      onRetry: input.onRetry,
      run: async () =>
        ai.models.generateContent({
          model: modelName,
          contents: [{ role: "user", parts }],
          config: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: LOGO_INTAKE_RESPONSE_SCHEMA,
            systemInstruction: LOGO_INTAKE_SYSTEM,
          },
        }),
    });

    const usage = (response as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } })
      .usageMetadata;
    estimatedCostUsd += estimateGeminiUsd(
      modelName,
      usage?.promptTokenCount ?? 0,
      usage?.candidatesTokenCount ?? 0,
    );

    const raw = parseJsonObjectFromVisionModelText(extractJsonText(response));
    if (!raw || typeof raw !== "object") throw new Error("logo_intake_vision_parse_failed");
    const parsed = raw as ParsedVisionResponse;
    merged.images.push(...(parsed.images ?? []));
  }

  return {
    parsed: merged,
    visionMs: Date.now() - started,
    visionCalls: chunks.length,
    estimatedCostUsd,
  };
}
