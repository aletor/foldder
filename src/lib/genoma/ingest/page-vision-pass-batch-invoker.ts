/**
 * Nivel 1 — invocador batch slim: una llamada multi-imagen (≤5 páginas).
 * flash-lite: JSON schema (structured output). Fallback instrumentado → flash + tool call.
 * thinkingBudget: 0 en todas las llamadas batch.
 */

import { GoogleGenAI, FunctionCallingConfigMode, Type, type GenerateContentConfig } from "@google/genai";
import { GEMINI_VISION_ANALYSIS_SERVICE_ID } from "@/lib/brain/brain-vision-usage";
import { parseJsonObjectFromVisionModelText } from "@/lib/brain/brain-vision-json-from-text";
import { estimateGeminiUsd } from "@/lib/pricing-config";
import { GenomaVisionPassError } from "./genoma-vision-pass-error";
import {
  snapshotGeminiUsageMetadata,
  type PageVisionGeminiUsageSnapshot,
} from "./page-vision-batch-gemini-usage";
import {
  PAGE_VISION_BATCH_TOOL_NAME,
  PAGE_VISION_NIVEL1_INDEX_RULES,
  PAGE_VISION_PASS_SYSTEM_INSTRUCTION,
  pageVisionNivel1BatchToolDeclaration,
} from "./page-vision-pass-prompt";
import { nivel1BatchJsonResponseSchema } from "./page-vision-nivel1-batch-json-schema";
import {
  PAGE_VISION_NIVEL1_GEMINI_FALLBACK_MODEL,
  PAGE_VISION_NIVEL1_MAX_OUTPUT_TOKENS,
  PAGE_VISION_PASS_GEMINI_SEED,
  PAGE_VISION_PASS_TEMPERATURE,
  pageVisionNivel1GeminiModel,
} from "./page-vision-pass-version";

export { PAGE_VISION_BATCH_TOOL_NAME };

export type PageVisionBatchPageInput = {
  pageNumber: number;
  totalPages: number;
  imageBase64: string;
  imageMimeType: "image/jpeg" | "image/png";
  imageTag: string;
};

export type Nivel1BatchAttemptMetrics = {
  modelName: string;
  mode: "json_schema" | "tool_calling";
  latencyMs: number;
  estimatedCostUsd: number;
  usage?: PageVisionGeminiUsageSnapshot;
  ok: boolean;
  failureReason?: string;
};

export type InvokePageVisionBatchResult = {
  raw: unknown;
  llmCalls: number;
  latencyMs: number;
  estimatedCostUsd: number;
  modelName: string;
  batchAttempts: Nivel1BatchAttemptMetrics[];
  batchFallbackUsed: boolean;
  geminiUsage?: PageVisionGeminiUsageSnapshot;
};

const NIVEL1_BATCH_THINKING_CONFIG = { thinkingBudget: 0 } as const;

function extractBatchFunctionCallArgs(response: unknown): unknown {
  const r = response as {
    functionCalls?: Array<{ name?: string; args?: unknown }>;
    candidates?: Array<{
      content?: { parts?: Array<{ functionCall?: { name?: string; args?: unknown } }> };
    }>;
  };
  const direct = r.functionCalls?.find((c) => c.name === PAGE_VISION_BATCH_TOOL_NAME)?.args;
  if (direct) return direct;
  for (const part of r.candidates?.[0]?.content?.parts ?? []) {
    if (part.functionCall?.name === PAGE_VISION_BATCH_TOOL_NAME) return part.functionCall.args;
  }
  return null;
}

function extractJsonTextFromResponse(response: unknown): string {
  const r = response as {
    text?: string;
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (typeof r.text === "string" && r.text.trim()) return r.text;
  const parts = r.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("");
}

function buildBatchUserPrompt(pages: PageVisionBatchPageInput[]): string {
  const pageList = pages
    .map((p) => `- ${p.imageTag}: página ${p.pageNumber}/${p.totalPages}`)
    .join("\n");
  return `Ingesta Nivel 1 — analiza ${pages.length} páginas clave.
NO incluyas images[], visualDna ni brandSurfaces — eso es Nivel 2.

Por página (pages[]): pageTag OBLIGATORIO ecoado del PNG quemado, pageNumber, logoInstances,
brandNameEvidence (SOLO dominio_pie | wordmark_logo | titulo_prominente, con bbox, máx 5),
contentTitles (max 20 objetos {text, kind:titulo_obra} — SOLO obras/productos/campañas; cabeceras numeradas de sección se OMITEN),
typographyRoles (role+bbox; máx 6 por página; styleObserved ≤80 chars; sampleText solo espécimen tipográfico, no títulos de índice),
pageKind.

${PAGE_VISION_NIVEL1_INDEX_RULES}

Globales: docKind, emitterBrandHint, deepPassTriagedPages[], deepPassTriagedImages[] (pageNumber+bbox+tag opcional).

Páginas (pageTag = tag quemado en imagen):
${pageList}

bbox [x1,y1,x2,y2]. pageKind en español. Si dudas, "unknown".`;
}

async function recordBatchUsage(input: {
  response: unknown;
  modelName: string;
  userEmail?: string;
  route?: string;
  operationId: string;
  estimatedCostUsd: number;
}): Promise<void> {
  const { recordApiUsage, parseGeminiUsageMetadata } = await import("@/lib/api-usage");
  await recordApiUsage({
    provider: "gemini",
    userEmail: input.userEmail,
    serviceId: GEMINI_VISION_ANALYSIS_SERVICE_ID,
    route: input.route ?? "/lib/genoma/ingest/page-vision-pass-nivel1",
    operation: input.operationId,
    costIsKnown: true,
    costUsd: input.estimatedCostUsd,
    metadata: parseGeminiUsageMetadata(input.response as { usageMetadata?: object }) ?? undefined,
  });
}

function isTransientBatchError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /503|UNAVAILABLE|high demand|429|RESOURCE_EXHAUSTED/i.test(msg);
}

async function invokeBatchGenerateContent(input: {
  pages: PageVisionBatchPageInput[];
  userEmail?: string;
  route?: string;
  operationId: string;
  modelName: string;
  apiKey: string;
  mode: "json_schema" | "tool_calling";
}): Promise<{ response: unknown; estimatedCostUsd: number; usage: PageVisionGeminiUsageSnapshot }> {
  const ai = new GoogleGenAI({ apiKey: input.apiKey });
  const batchDecl = pageVisionNivel1BatchToolDeclaration;
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    { text: buildBatchUserPrompt(input.pages) },
    ...input.pages.flatMap((page) => [
      { text: `[${page.imageTag}] página ${page.pageNumber}/${page.totalPages}` },
      { inlineData: { mimeType: page.imageMimeType, data: page.imageBase64 } },
    ]),
  ];

  const jsonSchema = nivel1BatchJsonResponseSchema();
  const config =
    input.mode === "json_schema"
      ? {
          systemInstruction: `${PAGE_VISION_PASS_SYSTEM_INSTRUCTION}\n${PAGE_VISION_NIVEL1_INDEX_RULES}\nNivel 1 slim JSON: devuelve el objeto raíz con pages[] (pageTag ecoado por imagen). Prohibido visualDna/images/brandSurfaces.`,
          temperature: PAGE_VISION_PASS_TEMPERATURE,
          seed: PAGE_VISION_PASS_GEMINI_SEED,
          thinkingConfig: NIVEL1_BATCH_THINKING_CONFIG,
          maxOutputTokens: PAGE_VISION_NIVEL1_MAX_OUTPUT_TOKENS,
          responseMimeType: "application/json",
          responseSchema: jsonSchema,
        }
      : {
          systemInstruction: `${PAGE_VISION_PASS_SYSTEM_INSTRUCTION}\n${PAGE_VISION_NIVEL1_INDEX_RULES}\nNivel 1 slim: invoca ${PAGE_VISION_BATCH_TOOL_NAME}. Prohibido visualDna/images/brandSurfaces. pageTag ecoado obligatorio por página.`,
          temperature: PAGE_VISION_PASS_TEMPERATURE,
          seed: PAGE_VISION_PASS_GEMINI_SEED,
          thinkingConfig: NIVEL1_BATCH_THINKING_CONFIG,
          maxOutputTokens: PAGE_VISION_NIVEL1_MAX_OUTPUT_TOKENS,
          tools: [
            {
              functionDeclarations: [
                {
                  name: batchDecl.name,
                  description: batchDecl.description,
                  parameters: {
                    type: Type.OBJECT,
                    properties: batchDecl.parameters.properties as Record<string, unknown>,
                    required: [...batchDecl.parameters.required],
                  },
                },
              ],
            },
          ],
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.ANY,
              allowedFunctionNames: [PAGE_VISION_BATCH_TOOL_NAME],
            },
          },
        };

  const r = await ai.models.generateContent({
    model: input.modelName,
    contents: [{ role: "user", parts }],
    config: config as GenerateContentConfig,
  });

  const usageMeta = (r as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } })
    .usageMetadata;
  const estimatedCostUsd = estimateGeminiUsd(
    input.modelName,
    usageMeta?.promptTokenCount ?? 0,
    usageMeta?.candidatesTokenCount ?? 0,
  );
  const usage =
    snapshotGeminiUsageMetadata(r, {
      maxOutputTokens: PAGE_VISION_NIVEL1_MAX_OUTPUT_TOKENS,
    }) ?? { maxOutputTokens: PAGE_VISION_NIVEL1_MAX_OUTPUT_TOKENS };

  try {
    await recordBatchUsage({
      response: r,
      modelName: input.modelName,
      userEmail: input.userEmail,
      route: input.route,
      operationId: `${input.operationId}:${input.mode}:${input.modelName}`,
      estimatedCostUsd,
    });
  } catch (error) {
    console.warn("[page-vision-nivel1] usage record failed — batch result kept:", error);
  }

  return { response: r, estimatedCostUsd, usage };
}

function parseBatchResponse(response: unknown, mode: "json_schema" | "tool_calling"): unknown {
  if (mode === "tool_calling") {
    const fromTool = extractBatchFunctionCallArgs(response);
    const raw =
      fromTool ?? parseJsonObjectFromVisionModelText(extractJsonTextFromResponse(response)) ?? null;
    if (!raw || typeof raw !== "object") {
      throw new GenomaVisionPassError("Batch Fase A sin tool utilizable.");
    }
    return raw;
  }

  const text = extractJsonTextFromResponse(response);
  const raw = parseJsonObjectFromVisionModelText(text) ?? null;
  if (!raw || typeof raw !== "object") {
    throw new GenomaVisionPassError("Batch JSON schema sin objeto raíz parseable.");
  }
  return raw;
}

async function callBatchJsonSchema(input: {
  pages: PageVisionBatchPageInput[];
  userEmail?: string;
  route?: string;
  operationId: string;
  modelName: string;
  apiKey: string;
}): Promise<{ raw: unknown; estimatedCostUsd: number; response: unknown; usage: PageVisionGeminiUsageSnapshot }> {
  const invoked = await invokeBatchGenerateContent({ ...input, mode: "json_schema" });
  try {
    const raw = parseBatchResponse(invoked.response, "json_schema");
    return { raw, estimatedCostUsd: invoked.estimatedCostUsd, response: invoked.response, usage: invoked.usage };
  } catch (error) {
    const err = new GenomaVisionPassError(error instanceof Error ? error.message : String(error));
    err.billedCostUsd = invoked.estimatedCostUsd;
    err.billedUsage = invoked.usage;
    throw err;
  }
}

async function callBatchToolCalling(input: {
  pages: PageVisionBatchPageInput[];
  userEmail?: string;
  route?: string;
  operationId: string;
  modelName: string;
  apiKey: string;
}): Promise<{ raw: unknown; estimatedCostUsd: number; response: unknown; usage: PageVisionGeminiUsageSnapshot }> {
  const invoked = await invokeBatchGenerateContent({ ...input, mode: "tool_calling" });
  try {
    const raw = parseBatchResponse(invoked.response, "tool_calling");
    return { raw, estimatedCostUsd: invoked.estimatedCostUsd, response: invoked.response, usage: invoked.usage };
  } catch (error) {
    const err = new GenomaVisionPassError(error instanceof Error ? error.message : String(error));
    err.billedCostUsd = invoked.estimatedCostUsd;
    err.billedUsage = invoked.usage;
    throw err;
  }
}

export async function invokePageVisionPassBatchModel(input: {
  pages: PageVisionBatchPageInput[];
  userEmail?: string;
  route?: string;
  operationId: string;
  modelName?: string;
}): Promise<InvokePageVisionBatchResult> {
  if (!input.pages.length) {
    throw new GenomaVisionPassError("Batch Fase A vacío.");
  }
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  if (!apiKey) {
    throw new GenomaVisionPassError(
      "Análisis visual no disponible: falta configurar GEMINI_API_KEY en el servidor.",
    );
  }

  const started = Date.now();
  const primaryModel = input.modelName ?? pageVisionNivel1GeminiModel();
  const attempts: Nivel1BatchAttemptMetrics[] = [];
  let llmCalls = 0;
  let estimatedCostUsd = 0;
  let raw: unknown = null;
  let modelName = primaryModel;
  let lastError: unknown = null;

  const tryAttempt = async (
    model: string,
    mode: "json_schema" | "tool_calling",
  ): Promise<boolean> => {
    const retries = model === primaryModel && mode === "json_schema" ? 2 : 1;
    for (let attemptIndex = 0; attemptIndex < retries; attemptIndex += 1) {
      const attemptStarted = Date.now();
      let billedCostUsd = 0;
      let billedUsage: PageVisionGeminiUsageSnapshot | undefined;
      try {
        const result =
          mode === "json_schema"
            ? await callBatchJsonSchema({ ...input, apiKey, modelName: model })
            : await callBatchToolCalling({ ...input, apiKey, modelName: model });
        llmCalls += 1;
        billedCostUsd = result.estimatedCostUsd;
        billedUsage = result.usage;
        estimatedCostUsd += result.estimatedCostUsd;
        raw = result.raw;
        modelName = model;
        attempts.push({
          modelName: model,
          mode,
          latencyMs: Date.now() - attemptStarted,
          estimatedCostUsd: result.estimatedCostUsd,
          usage: result.usage,
          ok: true,
        });
        return true;
      } catch (error) {
        lastError = error;
        if (error instanceof GenomaVisionPassError && error.billedUsage) {
          llmCalls += 1;
          billedCostUsd = error.billedCostUsd ?? 0;
          billedUsage = error.billedUsage;
          estimatedCostUsd += billedCostUsd;
        }
        attempts.push({
          modelName: model,
          mode,
          latencyMs: Date.now() - attemptStarted,
          estimatedCostUsd: billedCostUsd,
          usage: billedUsage,
          ok: false,
          failureReason: error instanceof Error ? error.message : String(error),
        });
        if (attemptIndex < retries - 1 && isTransientBatchError(error)) continue;
        return false;
      }
    }
    return false;
  };

  const primaryOk = await tryAttempt(primaryModel, "json_schema");
  if (!primaryOk && primaryModel !== PAGE_VISION_NIVEL1_GEMINI_FALLBACK_MODEL) {
    await tryAttempt(PAGE_VISION_NIVEL1_GEMINI_FALLBACK_MODEL, "json_schema");
  }

  if (!raw) {
    throw lastError instanceof Error
      ? lastError
      : new GenomaVisionPassError("Batch Fase A sin respuesta utilizable tras reintentos.");
  }

  const winning = attempts.find((a) => a.ok);
  return {
    raw,
    llmCalls,
    latencyMs: Date.now() - started,
    estimatedCostUsd,
    modelName,
    batchAttempts: attempts,
    batchFallbackUsed: winning != null && winning.modelName !== primaryModel,
    geminiUsage: winning?.usage,
  };
}