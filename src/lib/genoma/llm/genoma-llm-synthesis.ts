import { GoogleGenAI } from "@google/genai";
import { parseJsonObjectFromVisionModelText } from "@/lib/brain/brain-vision-json-from-text";
import { recordApiUsage } from "@/lib/api-usage";
import { parseReferenceImageForGemini } from "@/lib/parse-reference-image";
import { cheapCopySignals } from "../crawl/copy-corpus";
import type { Candidate, LogoValue } from "../genoma-types";
import { applyLogoVisionLabels } from "../genoma-logo-policy";
import {
  essenceCandidatesFromOnelinerLlm,
  parseLogoLabelLlmResponse,
  parseOnelinerLlmResponse,
  parseValuesLlmResponse,
  parseVoiceLlmResponse,
  validateValuesAgainstCorpus,
  validateVoiceAgainstCorpus,
  voiceValueFromLlm,
  type OnelinerLlmResponse,
  type ValuesLlmResponse,
  type VoiceLlmResponse,
} from "./genoma-llm-validate";

import { estimateGeminiUsd } from "@/lib/pricing-config";
import type { EvidenceCandidate } from "../genoma-evidence-candidates";
import { GENOMA_RICH_TEXT_PROMPT } from "../genoma-rich-text";

const GENOMA_LLM_MODEL = process.env.GENOMA_LLM_GEMINI_MODEL?.trim() || "gemini-2.5-flash";

export type GenomaDocumentProbeContext = {
  textSummary: string[];
  primaryColors: Array<{ hex: string; label?: string }>;
  typography: Array<{ family: string; role: string }>;
  imageInventory: Array<{ description: string; page: number | null }>;
};

export type GenomaSynthesisInput = {
  corpus: string;
  structuredCorpus?: string;
  galleryContext?: string;
  probeContext?: GenomaDocumentProbeContext;
  evidenceCandidates?: EvidenceCandidate[];
  brandName?: string;
  userEmail?: string;
  route?: string;
  onLlmCostUsd?: (costUsd: number) => void;
};

async function reportGeminiUsage(
  input: GenomaSynthesisInput,
  operation: string,
  usage?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number },
): Promise<number> {
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
  return costUsd;
}

async function callGenomaJson<T>(
  input: GenomaSynthesisInput,
  systemInstruction: string,
  userPrompt: string,
  operation: string,
  parse: (raw: unknown) => T | null,
): Promise<T | null> {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  if (!apiKey || input.corpus.trim().length < 50) return null;

  const ai = new GoogleGenAI({ apiKey });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await ai.models.generateContent({
        model: GENOMA_LLM_MODEL,
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      });

      const parsed = parse(parseJsonObjectFromVisionModelText(result.text ?? ""));
      await reportGeminiUsage(input, operation, result.usageMetadata);
      if (parsed) return parsed;
    } catch (error) {
      console.error(`[genoma-llm/${operation}] attempt ${attempt + 1}`, error);
    }
  }

  return null;
}

export async function synthesizeVoice(input: GenomaSynthesisInput): Promise<VoiceLlmResponse | null> {
  const signals = cheapCopySignals(input.corpus);
  const raw = await callGenomaJson(
    input,
    [
      "Eres un analista de voz de marca. Devuelves SOLO JSON.",
      "Cada quote en evidence debe copiarse literalmente del corpus (sin parafrasear).",
      "Si no encuentras 3 citas exactas, usa las más cercanas posibles del corpus.",
      "descriptors: 3-5 adjetivos en español.",
      "rules: 3-6 reglas operativas breves.",
      "evidence: 3 citas literales del corpus.",
      GENOMA_RICH_TEXT_PROMPT,
    ].join("\n"),
    [
      `Marca: ${input.brandName ?? "desconocida"}`,
      `Señales: tuteo=${signals.usesTuteo}, usted=${signals.usesUsted}, longitud media frase=${signals.avgSentenceLength.toFixed(1)}`,
      "Corpus:",
      input.corpus,
      'JSON: { "descriptors": [], "rules": [], "evidence": [{ "quote": "", "sourceUrl": "" }] }',
    ].join("\n\n"),
    "voice",
    parseVoiceLlmResponse,
  );
  if (!raw) return null;
  return validateVoiceAgainstCorpus(input.corpus, raw);
}

export async function synthesizeValues(input: GenomaSynthesisInput): Promise<ValuesLlmResponse | null> {
  const raw = await callGenomaJson(
    input,
    [
      "Extrae valores de marca del corpus. Devuelve SOLO JSON.",
      "3-5 valores con label corto. evidence opcional pero si existe debe ser substring exacto del corpus.",
    ].join("\n"),
    [
      `Marca: ${input.brandName ?? "desconocida"}`,
      input.corpus,
      'JSON: { "values": [{ "label": "", "evidence": "" }] }',
    ].join("\n\n"),
    "values",
    parseValuesLlmResponse,
  );
  if (!raw) return null;
  const grounded = validateValuesAgainstCorpus(input.corpus, raw);
  return grounded ? { values: grounded.values } : null;
}

export async function synthesizeOnelinerOptions(input: GenomaSynthesisInput): Promise<OnelinerLlmResponse | null> {
  return callGenomaJson(
    input,
    "Genera 3 one-liners de marca en español. Devuelve SOLO JSON. Marca cada opción como texto original generado (no copies el corpus literal).",
    [
      `Marca: ${input.brandName ?? "desconocida"}`,
      input.corpus.slice(0, 6000),
      'JSON: { "options": [{ "text": "" }, { "text": "" }, { "text": "" }] }',
    ].join("\n\n"),
    "oneliner",
    parseOnelinerLlmResponse,
  );
}

export async function labelLogoCandidatesWithVision(
  candidates: Candidate<LogoValue>[],
  input: Pick<GenomaSynthesisInput, "userEmail" | "route" | "onLlmCostUsd">,
): Promise<Candidate<LogoValue>[]> {
  if (!candidates.length) return candidates;
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  if (!apiKey) return candidates;

  const top = candidates.slice(0, 4);
  const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [
    {
      text: [
        "Etiqueta candidatos de logo. NO reordenes.",
        'JSON: { "labels": [{ "index": 0, "isLikelyLogo": true, "kind": "principal|mono|icono", "background": "transparent|solid" }] }',
        "Marca isLikelyLogo=false para fotos de producto, banners hero o fotos genéricas.",
      ].join("\n"),
    },
  ];

  for (let index = 0; index < top.length; index += 1) {
    const url = top[index].value.previewUrl ?? top[index].value.assetId;
    parts.push({ text: `Candidato ${index}: ${url}` });
    const inline = url ? await parseReferenceImageForGemini(url).catch(() => null) : null;
    if (inline) {
      parts.push({ inlineData: { data: inline.data, mimeType: inline.mimeType } });
    }
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
      model: GENOMA_LLM_MODEL,
      contents: [{ role: "user", parts }],
      config: { responseMimeType: "application/json", temperature: 0.1 },
    });

    const parsed = parseLogoLabelLlmResponse(parseJsonObjectFromVisionModelText(result.text ?? ""), top.length);
    await reportGeminiUsage(
      { userEmail: input.userEmail, route: input.route, onLlmCostUsd: input.onLlmCostUsd, corpus: "" },
      "logo_label",
      result.usageMetadata,
    );

    if (!parsed) return candidates;

    return applyLogoVisionLabels(candidates, parsed.labels);
  } catch (error) {
    console.error("[genoma-llm/logo_label]", error);
    return candidates;
  }
}

export { essenceCandidatesFromOnelinerLlm, validateValuesAgainstCorpus, voiceValueFromLlm };
