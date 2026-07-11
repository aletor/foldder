/**
 * Refinamiento de voz con LLM (§3.5 FASE 3): tagline, tono y claims con porqué.
 * Complementa la heurística cuando el manual no tiene léxico explícito.
 */

import { parseJsonObjectFromVisionModelText } from "@/lib/brain/brain-vision-json-from-text";
import { createCandidate, signal, type Candidate } from "../model/evidence";
import { textSignature } from "../model/signature";
import type { ClaimValue, TaglineValue, ToneValue } from "../model/trait-values";
import { brandKitOperationId, textSampleSignature } from "../ingest/paid-operations";
import type { VoiceExtraction, PdfTextLine } from "./voice";

const BRAND_KIT_VOICE_SERVICE_ROUTE = "/lib/brandKit/extractors/voice-llm";

const VOICE_LLM_PROMPT = `Analiza este fragmento de manual de marca o web corporativa.
Devuelve SOLO JSON válido (sin markdown) con esta forma:
{
  "tagline": ["frase corta de marca"],
  "tone": ["cercano", "profesional"],
  "absolute_claims": ["afirmaciones permitidas o típicas de la marca"],
  "forbidden_claims": [{ "text": "no digas X", "why": "motivo concreto (legal, sector, credibilidad…)" }]
}

Reglas:
- tagline: máximo 2 frases cortas (4–14 palabras), en español si el texto lo es.
- tone: 2–5 adjetivos de tono de voz, en minúscula.
- absolute_claims: máximo 3; solo si hay evidencia en el texto.
- forbidden_claims: máximo 4; cada uno DEBE incluir "why" explicando el riesgo (p. ej. "sector regulado", "promesa no verificable").
- No inventes datos numéricos ni marcas ajenas al texto.
- Si no hay evidencia clara, devuelve arrays vacíos.`;

type VoiceLlmJson = {
  tagline?: unknown;
  tone?: unknown;
  absolute_claims?: unknown;
  forbidden_claims?: unknown;
};

const llmCache = new Map<string, VoiceExtraction>();

function strList(v: unknown, max = 4): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, max);
}

function parseForbiddenClaims(raw: unknown, sourceId: string): Candidate<ClaimValue>[] {
  if (!Array.isArray(raw)) return [];
  const out: Candidate<ClaimValue>[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const text = String((row as Record<string, unknown>).text ?? "").trim();
    const why = String((row as Record<string, unknown>).why ?? "").trim();
    if (!text || text.length < 6) continue;
    out.push(
      createCandidate<ClaimValue>({
        value: {
          text,
          kind: "forbidden",
          why: why || "riesgo de credibilidad o cumplimiento normativo",
        },
        signals: [signal("llm-vision", { detail: "inferido por análisis de texto", sourceRef: sourceId })],
        signature: textSignature(text),
        sourceRefs: [sourceId],
      }),
    );
  }
  return out.slice(0, 4);
}

function parseVoiceLlmJson(raw: unknown, sourceId: string): VoiceExtraction {
  const root = (raw && typeof raw === "object" ? raw : {}) as VoiceLlmJson;
  const tagline = strList(root.tagline, 2).map((text) =>
    createCandidate<TaglineValue>({
      value: { text: text.slice(0, 120) },
      signals: [signal("llm-vision", { detail: "destilado del manual", sourceRef: sourceId })],
      signature: textSignature(text),
      sourceRefs: [sourceId],
    }),
  );
  const tone = strList(root.tone, 6).map((text) =>
    createCandidate<ToneValue>({
      value: { text: text.toLowerCase() },
      signals: [signal("llm-vision", { detail: "tono inferido del texto", sourceRef: sourceId })],
      signature: textSignature(text),
      sourceRefs: [sourceId],
    }),
  );
  const absolute = strList(root.absolute_claims, 4).map((text) =>
    createCandidate<ClaimValue>({
      value: { text: text.slice(0, 220), kind: "absolute" },
      signals: [signal("llm-vision", { detail: "claim inferido", sourceRef: sourceId })],
      signature: textSignature(text),
      sourceRefs: [sourceId],
    }),
  );
  return {
    tagline,
    tone,
    absolute,
    forbidden: parseForbiddenClaims(root.forbidden_claims, sourceId),
  };
}

export function buildTextSampleFromPdfLines(lines: PdfTextLine[], maxChars = 6000): string {
  const headlines = lines
    .filter((l) => l.size >= 14)
    .map((l) => l.text)
    .slice(0, 12);
  const body = lines
    .filter((l) => l.size < 14 && l.text.length > 20)
    .map((l) => l.text)
    .slice(0, 40);
  return [...headlines, ...body].join("\n").slice(0, maxChars);
}

export function buildTextSampleFromHtml(html: string, maxChars = 6000): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.slice(0, maxChars);
}

function dedupeBySignature<T>(list: Candidate<T>[]): Candidate<T>[] {
  const seen = new Set<string>();
  const out: Candidate<T>[] = [];
  for (const c of list) {
    if (seen.has(c.signature)) continue;
    seen.add(c.signature);
    out.push(c);
  }
  return out;
}

export function enrichForbiddenWhy(
  base: Candidate<ClaimValue>[],
  llm: Candidate<ClaimValue>[],
): Candidate<ClaimValue>[] {
  const llmBySig = new Map(llm.map((c) => [c.signature, c]));
  const llmByText = new Map(llm.map((c) => [c.value.text.toLowerCase(), c]));

  const enriched = base.map((c) => {
    if (c.value.kind !== "forbidden") return c;
    const generic =
      !c.value.why ||
      c.value.why === "marcado como prohibido en el documento" ||
      c.value.why.length < 12;
    if (!generic) return c;
    const match = llmBySig.get(c.signature) ?? llmByText.get(c.value.text.toLowerCase());
    if (!match?.value.why) return c;
    return {
      ...c,
      value: { ...c.value, why: match.value.why },
    };
  });

  const existing = new Set(enriched.map((c) => c.signature));
  for (const c of llm) {
    if (existing.has(c.signature)) continue;
    enriched.push(c);
    existing.add(c.signature);
  }
  return enriched.slice(0, 4);
}

/** Fusiona heurística + LLM sin duplicar firmas; enriquece el porqué de prohibidos. */
export function mergeVoiceExtractions(base: VoiceExtraction, llm: VoiceExtraction | null): VoiceExtraction {
  if (!llm) return base;
  return {
    tagline: dedupeBySignature([...base.tagline, ...llm.tagline]).slice(0, 3),
    tone: dedupeBySignature([...base.tone, ...llm.tone]).slice(0, 6),
    absolute: dedupeBySignature([...base.absolute, ...llm.absolute]).slice(0, 4),
    forbidden: enrichForbiddenWhy(base.forbidden, llm.forbidden),
  };
}

export function shouldRefineVoiceWithLlm(extraction: VoiceExtraction): boolean {
  if (extraction.tone.length === 0) return true;
  if (extraction.tagline.length === 0) return true;
  if (extraction.forbidden.some((c) => !c.value.why || c.value.why.length < 12)) return true;
  if (extraction.forbidden.length === 0 && extraction.absolute.length === 0) return true;
  return false;
}

export async function refineVoiceWithLlm(
  textSample: string,
  sourceId: string,
  opts: { userEmail?: string } = {},
): Promise<VoiceExtraction | null> {
  const trimmed = textSample.trim();
  if (trimmed.length < 80) return null;

  const cacheKey = textSampleSignature(trimmed);
  const cached = llmCache.get(cacheKey);
  if (cached) return cached;

  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  if (!apiKey) return null;

  const { GoogleGenAI } = await import("@google/genai");
  const { recordApiUsage, parseGeminiUsageMetadata } = await import("@/lib/api-usage");
  const {
    reserveApiWalletCharge,
    reserveUsdToMicros,
    releaseApiWalletChargeOnError,
  } = await import("@/lib/wallet-api-gate");

  const operationId = brandKitOperationId("voice", cacheKey);
  const userEmail = opts.userEmail?.trim();
  let walletCharge: Awaited<ReturnType<typeof reserveApiWalletCharge>> = null;
  try {
    if (userEmail) {
      walletCharge = await reserveApiWalletCharge({
        userEmail,
        serviceId: "gemini-analyze",
        provider: "gemini",
        route: BRAND_KIT_VOICE_SERVICE_ROUTE,
        maxCostMicros: reserveUsdToMicros(0.02, { multiplier: 1.25 }),
        operationId,
        metadata: { feature: "brand-kit-voice-refine", sampleSignature: cacheKey },
      });
    }

    const modelName = process.env.BRAIN_VISION_GEMINI_MODEL?.trim() || "gemini-2.5-flash";
    const ai = new GoogleGenAI({ apiKey });

    const r = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts: [{ text: `${VOICE_LLM_PROMPT}\n\n---\n${trimmed.slice(0, 6000)}` }] }],
      config: {
        systemInstruction:
          "Eres estratega de marca. Respondes únicamente JSON válido en español cuando el material lo es.",
      },
    });

    const usage = parseGeminiUsageMetadata(r);
    await recordApiUsage({
      provider: "gemini",
      userEmail: opts.userEmail,
      serviceId: "gemini-analyze",
      route: BRAND_KIT_VOICE_SERVICE_ROUTE,
      operation: "brand_kit_voice_refine",
      costIsKnown: false,
      costUsd: 0,
      ...(usage
        ? {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
          }
        : {}),
    });

    await walletCharge?.capture({ actualCostUsd: 0.01, metadata: { operationId } });

    const raw = parseJsonObjectFromVisionModelText(r.text ?? "");
    const parsed = parseVoiceLlmJson(raw, sourceId);
    const hasContent =
      parsed.tagline.length > 0 ||
      parsed.tone.length > 0 ||
      parsed.absolute.length > 0 ||
      parsed.forbidden.length > 0;
    if (!hasContent) return null;

    llmCache.set(cacheKey, parsed);
    return parsed;
  } catch (error) {
    await releaseApiWalletChargeOnError(walletCharge, error);
    return null;
  }
}

export async function enrichVoiceExtraction(
  base: VoiceExtraction,
  textSample: string,
  sourceId: string,
  opts: { userEmail?: string; force?: boolean; allowPaidRefinement?: boolean } = {},
): Promise<VoiceExtraction> {
  if (!opts.force && !shouldRefineVoiceWithLlm(base)) return base;
  if (!opts.allowPaidRefinement) return base;
  const llm = await refineVoiceWithLlm(textSample, sourceId, opts);
  return mergeVoiceExtractions(base, llm);
}
