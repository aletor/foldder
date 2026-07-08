/**
 * Invocador Gemini — una página, tool-use forzado, temperature/seed del servidor.
 */

import { GoogleGenAI, FunctionCallingConfigMode, Type } from "@google/genai";
import { GEMINI_VISION_ANALYSIS_SERVICE_ID } from "@/lib/brain/brain-vision-usage";
import { parseJsonObjectFromVisionModelText } from "@/lib/brain/brain-vision-json-from-text";
import { GenomaVisionPassError } from "./genoma-vision-pass-error";
import {
  PAGE_VISION_PASS_GEMINI_SEED,
  PAGE_VISION_PASS_TEMPERATURE,
} from "./page-vision-pass-version";
import {
  PAGE_VISION_PASS_SYSTEM_INSTRUCTION,
  PAGE_VISION_PASS_TOOL_NAME,
  buildPageVisionPassUserPrompt,
  pageVisionPassToolDeclaration,
} from "./page-vision-pass-prompt";

export type InvokePageVisionPassInput = {
  pageNumber: number;
  totalPages: number;
  pngBase64: string;
  userEmail?: string;
  route?: string;
  operationId: string;
};

function extractFunctionCallArgs(response: unknown): unknown {
  const r = response as {
    functionCalls?: Array<{ name?: string; args?: unknown }>;
    candidates?: Array<{
      content?: { parts?: Array<{ functionCall?: { name?: string; args?: unknown } }> };
    }>;
  };
  const direct = r.functionCalls?.find((c) => c.name === PAGE_VISION_PASS_TOOL_NAME)?.args;
  if (direct) return direct;
  for (const part of r.candidates?.[0]?.content?.parts ?? []) {
    if (part.functionCall?.name === PAGE_VISION_PASS_TOOL_NAME) return part.functionCall.args;
  }
  return null;
}

export async function invokePageVisionPassModel(
  input: InvokePageVisionPassInput,
): Promise<unknown> {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  if (!apiKey) {
    throw new GenomaVisionPassError(
      "Análisis visual no disponible: falta configurar GEMINI_API_KEY en el servidor.",
    );
  }

  const modelName = process.env.BRAIN_VISION_GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const ai = new GoogleGenAI({ apiKey });
  const userPrompt = buildPageVisionPassUserPrompt({
    pageNumber: input.pageNumber,
    totalPages: input.totalPages,
  });

  const toolDecl = pageVisionPassToolDeclaration;
  const r = await ai.models.generateContent({
    model: modelName,
    contents: [
      {
        role: "user",
        parts: [
          { text: userPrompt },
          { inlineData: { mimeType: "image/png", data: input.pngBase64 } },
        ],
      },
    ],
    config: {
      systemInstruction: PAGE_VISION_PASS_SYSTEM_INSTRUCTION,
      temperature: PAGE_VISION_PASS_TEMPERATURE,
      seed: PAGE_VISION_PASS_GEMINI_SEED,
      tools: [
        {
          functionDeclarations: [
            {
              name: toolDecl.name,
              description: toolDecl.description,
              parameters: {
                type: Type.OBJECT,
                properties: toolDecl.parameters.properties as Record<string, unknown>,
                required: toolDecl.parameters.required,
              },
            },
          ],
        },
      ],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.ANY,
          allowedFunctionNames: [PAGE_VISION_PASS_TOOL_NAME],
        },
      },
    },
  });

  const { recordApiUsage, parseGeminiUsageMetadata } = await import("@/lib/api-usage");
  await recordApiUsage({
    provider: "gemini",
    userEmail: input.userEmail,
    serviceId: GEMINI_VISION_ANALYSIS_SERVICE_ID,
    route: input.route ?? "/lib/genoma/ingest/page-vision-pass",
    operation: input.operationId,
    costIsKnown: false,
    costUsd: 0,
    metadata: parseGeminiUsageMetadata(r),
  });

  const fromTool = extractFunctionCallArgs(r);
  if (fromTool && typeof fromTool === "object") return fromTool;

  const rawText = r.text ?? "";
  const parsed = parseJsonObjectFromVisionModelText(rawText);
  if (parsed) return parsed;

  throw new GenomaVisionPassError(
    `El modelo no devolvió ${PAGE_VISION_PASS_TOOL_NAME} utilizable en página ${input.pageNumber}.`,
  );
}
