import { GoogleGenAI } from "@google/genai";
import { parseJsonObjectFromVisionModelText } from "@/lib/brain/brain-vision-json-from-text";
import { recordApiUsage } from "@/lib/api-usage";
import {
  ARENA_MAX_TERMS,
  fallbackArenaSearchTerms,
  parseArenaTermsFromPlanner,
  sanitizeArenaTerms,
} from "./inspiration-arena-query";
import type { InspirationFacet, InspirationInputKind } from "./inspiration-shared";

const PLANNER_MODEL = process.env.INSPIRATION_QUERY_PLANNER_GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const PLAN_CACHE_TTL_MS = 30 * 60 * 1000;
const PLAN_CACHE_MAX = 120;

type PlanCacheEntry = { expiresAt: number; terms: string };
const planCache = new Map<string, PlanCacheEntry>();

function buildPlannerPrompt(intent: string, facet: InspirationFacet, inputKind: InspirationInputKind): string {
  return [
    "Plan search terms for Are.na only.",
    `User intent: ${intent}`,
    `Facet: ${facet}`,
    `Input kind: ${inputKind}`,
    `Max terms for arena: ${ARENA_MAX_TERMS}`,
    'Return JSON: { "perSource": { "arena": "short english aesthetic tags separated by spaces" } }',
  ].join("\n");
}

function buildPlanCacheKey(intent: string, facet: InspirationFacet, inputKind: InspirationInputKind): string {
  return `arena:${facet}:${inputKind}:${intent.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

export async function planArenaSearchTerms(options: {
  intent: string;
  facet: InspirationFacet;
  inputKind: InspirationInputKind;
  userEmail?: string;
}): Promise<{ terms: string; cached: boolean; source: "gemini" | "fallback" }> {
  const intent = options.intent.trim();
  const cacheKey = buildPlanCacheKey(intent, options.facet, options.inputKind);
  const now = Date.now();
  const cachedPlan = planCache.get(cacheKey);
  if (cachedPlan && cachedPlan.expiresAt > now) {
    return { terms: cachedPlan.terms, cached: true, source: "gemini" };
  }

  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  if (!apiKey || !intent) {
    const terms = fallbackArenaSearchTerms(intent, options.facet);
    planCache.set(cacheKey, { expiresAt: now + PLAN_CACHE_TTL_MS, terms });
    return { terms, cached: false, source: "fallback" };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
      model: PLANNER_MODEL,
      contents: [{ role: "user", parts: [{ text: buildPlannerPrompt(intent, options.facet, options.inputKind) }] }],
      config: {
        systemInstruction: [
          "Eres un planificador de consultas para fuentes de inspiración visual.",
          "Recibes una intención del usuario y devuelves términos de búsqueda optimizados por fuente. Reglas:",
          "- arena: términos cortos en inglés, vocabulario de tags estéticos, sin operadores ni frases.",
          `- Máx ${ARENA_MAX_TERMS} términos para arena.`,
          'Devuelve SOLO un objeto JSON con la forma { "perSource": { "arena": "tag1 tag2" } }.',
          "Nada de texto adicional ni markdown.",
        ].join("\n"),
        responseMimeType: "application/json",
      },
    });

    const parsed = parseJsonObjectFromVisionModelText(result.text ?? "");
    const planned = parseArenaTermsFromPlanner(parsed);
    const terms = planned || fallbackArenaSearchTerms(intent, options.facet);
    planCache.set(cacheKey, { expiresAt: now + PLAN_CACHE_TTL_MS, terms });

    const usage = result.usageMetadata;
    await recordApiUsage({
      provider: "gemini",
      userEmail: options.userEmail,
      serviceId: "gemini-analyze",
      route: "/api/inspiration/search",
      model: PLANNER_MODEL,
      operation: "inspiration_arena_query_plan",
      inputTokens: usage?.promptTokenCount,
      outputTokens: usage?.candidatesTokenCount,
      totalTokens: usage?.totalTokenCount,
      costIsKnown: false,
      costUsd: 0,
      metadata: { facet: options.facet, inputKind: options.inputKind, arenaTerms: terms },
    });

    return { terms, cached: false, source: "gemini" };
  } catch (error) {
    console.error("[inspiration/planArenaSearchTerms]", error);
    const terms = fallbackArenaSearchTerms(intent, options.facet);
    planCache.set(cacheKey, { expiresAt: now + PLAN_CACHE_TTL_MS, terms });
    return { terms, cached: false, source: "fallback" };
  } finally {
    if (planCache.size > PLAN_CACHE_MAX) {
      for (const key of planCache.keys()) {
        planCache.delete(key);
        if (planCache.size <= PLAN_CACHE_MAX) break;
      }
    }
  }
}

export { sanitizeArenaTerms, fallbackArenaSearchTerms };
