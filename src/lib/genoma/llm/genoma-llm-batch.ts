import { GoogleGenAI } from "@google/genai";
import { parseJsonObjectFromVisionModelText } from "@/lib/brain/brain-vision-json-from-text";
import { recordApiUsage } from "@/lib/api-usage";
import { estimateGeminiUsd } from "@/lib/pricing-config";
import type { EssenceValue, VisualWorldValue, VoiceValue } from "../genoma-types";
import {
  formatEvidenceCandidatesForLlm,
  type EvidenceCandidate,
} from "../genoma-evidence-candidates";
import type { GenomaSynthesisInput } from "./genoma-llm-synthesis";
import {
  mergeBatchValidation,
  validateBatchResponse,
  validateBatchSlotKey,
  type BatchSlotKey,
  type BatchSlotValidation,
} from "./genoma-llm-batch-validate";
import { GENOMA_RICH_TEXT_PROMPT } from "../genoma-rich-text";

export { batchLlmProvenance, buildBatchSlotPatch } from "./genoma-batch-slot-patch";

const GENOMA_LLM_MODEL = process.env.GENOMA_LLM_GEMINI_MODEL?.trim() || "gemini-2.5-flash";

const BATCH_SYSTEM = [
  "Eres un analista de ADN de marca. Devuelves SOLO JSON con claves essence, voice y visualWorld.",
  "Tu tarea no es copiar frases de la web. Tu tarea es interpretar la marca.",
  "Las frases del corpus solo son evidencia. No las uses como resumen principal.",
  "No copies citas manualmente. Cuando necesites evidencia, referencia evidenceIds de la lista.",
  "Solo puedes usar evidenceIds de la lista de evidencias preseleccionadas.",
  "Para cada bloque escribe: un summary interpretativo de 1-2 frases, reglas ejecutables cuando aplique, y evidenceIds.",
  "No devuelvas claims partidos como beliefs. No conviertas titulares en análisis.",
  "No uses adjetivos genéricos sin explicación (innovador, profesional, creativo, moderno, humano, cercano, premium, diferente).",
  "Escribe en español claro, profesional y concreto.",
  "essence.summary, voice.summary y visualWorld.summary son párrafos de análisis, no listas de citas.",
  "essence.beliefs: creencias interpretadas con label corto y explanation.",
  "voice.descriptors: 2-5 chips concretos; voice.rules: instrucciones accionables (mínimo 2).",
  "visualWorld.visualTraits: territorio visual positivo; visualWorld.limits: qué evitar.",
  GENOMA_RICH_TEXT_PROMPT,
].join("\n");

const BATCH_JSON_SHAPE = `{
  "essence": {
    "summary": "",
    "headline": "",
    "purpose": "",
    "promise": "",
    "pov": "",
    "beliefs": [{ "label": "", "explanation": "", "evidenceIds": [] }],
    "evidenceIds": []
  },
  "voice": {
    "summary": "",
    "descriptors": [],
    "rules": [],
    "avoid": [],
    "evidenceIds": []
  },
  "visualWorld": {
    "summary": "",
    "moodTags": [],
    "visualTraits": [],
    "limits": [],
    "evidenceIds": []
  }
}`;

export type GenomaBatchSlotResult = {
  essence: EssenceValue | null;
  voice: VoiceValue | null;
  visualWorld: VisualWorldValue | null;
  degraded: BatchSlotKey[];
};

async function reportGeminiUsage(
  input: GenomaSynthesisInput,
  operation: string,
  usage?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number },
): Promise<void> {
  const inputTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;
  const costUsd = estimateGeminiUsd(GENOMA_LLM_MODEL, inputTokens, outputTokens);
  input.onLlmCostUsd?.(costUsd);
  await recordApiUsage({
    provider: "gemini",
    userEmail: input.userEmail,
    serviceId: "genoma-llm-synthesis",
    route: input.route ?? "/api/spaces/genoma/crawl",
    model: GENOMA_LLM_MODEL,
    operation,
    inputTokens,
    outputTokens,
    totalTokens: usage?.totalTokenCount,
    costIsKnown: true,
    costUsd,
  }).catch(() => undefined);
}

function buildBatchUserPrompt(input: GenomaSynthesisInput): string {
  const parts = [`Marca: ${input.brandName ?? "desconocida"}`];
  if (input.evidenceCandidates?.length) {
    parts.push("Evidencias preseleccionadas (usa solo estos IDs en evidenceIds):", formatEvidenceCandidatesForLlm(input.evidenceCandidates));
  }
  if (input.structuredCorpus) {
    parts.push("Unidades de copy (rol y peso):", input.structuredCorpus);
  }
  parts.push("Corpus para contexto (no copies como summary):", input.corpus);
  if (input.galleryContext) {
    parts.push("Referencias visuales cosechadas (URLs y contexto):", input.galleryContext);
  }
  parts.push(`JSON: ${BATCH_JSON_SHAPE}`);
  return parts.join("\n\n");
}

async function callBatchJson(
  input: GenomaSynthesisInput,
  userPrompt: string,
  operation: string,
): Promise<unknown | null> {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  if (!apiKey || input.corpus.trim().length < 50) return null;

  const ai = new GoogleGenAI({ apiKey });
  try {
    const result = await ai.models.generateContent({
      model: GENOMA_LLM_MODEL,
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: BATCH_SYSTEM,
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });
    await reportGeminiUsage(input, operation, result.usageMetadata);
    return parseJsonObjectFromVisionModelText(result.text ?? "");
  } catch (error) {
    console.error(`[genoma-llm/${operation}]`, error);
    return null;
  }
}

async function retryBatchKey(
  input: GenomaSynthesisInput,
  key: BatchSlotKey,
): Promise<BatchSlotValidation<EssenceValue | VoiceValue | VisualWorldValue>> {
  const schemaHint =
    key === "essence"
      ? '{ "summary": "", "headline": "", "beliefs": [{ "label": "", "explanation": "" }], "evidenceIds": [] }'
      : key === "voice"
        ? '{ "summary": "", "descriptors": [], "rules": [], "avoid": [], "evidenceIds": [] }'
        : '{ "summary": "", "moodTags": [], "visualTraits": [], "limits": [], "evidenceIds": [] }';

  const raw = await callBatchJson(
    input,
    [
      `Reintento SOLO la clave "${key}".`,
      buildBatchUserPrompt(input),
      `JSON con una sola clave: { "${key}": ${schemaHint} }`,
    ].join("\n\n"),
    `batch_retry_${key}`,
  );

  if (!raw || typeof raw !== "object") return { ok: false, error: "reintento sin JSON" };
  const value = (raw as Record<string, unknown>)[key];
  return validateBatchSlotKey(key, value, input.corpus, input.evidenceCandidates ?? []);
}

export async function synthesizeGenomaBatch(input: GenomaSynthesisInput): Promise<GenomaBatchSlotResult> {
  const degraded: BatchSlotKey[] = [];
  const empty = { essence: null, voice: null, visualWorld: null, degraded };
  const evidenceCandidates = input.evidenceCandidates ?? [];

  const raw = await callBatchJson(input, buildBatchUserPrompt(input), "batch");
  if (!raw) return empty;

  const initial = validateBatchResponse(raw, input.corpus, evidenceCandidates);
  let essenceResult = initial.essence;
  let voiceResult = initial.voice;
  let visualWorldResult = initial.visualWorld;

  const keys: BatchSlotKey[] = ["essence", "voice", "visualWorld"];
  for (const key of keys) {
    const current =
      key === "essence" ? essenceResult : key === "voice" ? voiceResult : visualWorldResult;
    if (current.ok) continue;
    const retry = await retryBatchKey(input, key);
    if (key === "essence") {
      essenceResult = mergeBatchValidation(essenceResult, retry as BatchSlotValidation<EssenceValue>);
    } else if (key === "voice") {
      voiceResult = mergeBatchValidation(voiceResult, retry as BatchSlotValidation<VoiceValue>);
    } else {
      visualWorldResult = mergeBatchValidation(
        visualWorldResult,
        retry as BatchSlotValidation<VisualWorldValue>,
      );
    }
  }

  if (!essenceResult.ok) degraded.push("essence");
  if (!voiceResult.ok) degraded.push("voice");
  if (!visualWorldResult.ok) degraded.push("visualWorld");

  return {
    essence: essenceResult.ok ? essenceResult.value : null,
    voice: voiceResult.ok ? voiceResult.value : null,
    visualWorld: visualWorldResult.ok ? visualWorldResult.value : null,
    degraded,
  };
}
