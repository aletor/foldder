import { Type } from "@google/genai";
import { GoogleGenAI } from "@google/genai";
import { parseJsonObjectFromVisionModelText } from "@/lib/brain/brain-vision-json-from-text";
import { recordApiUsage } from "@/lib/api-usage";
import { estimateGeminiUsd } from "@/lib/pricing-config";
import { withGeminiRetries } from "@/lib/brandkit/ingest/gemini-retry";
import { compileBrandKit } from "./compile-brand-kit";
import { galleryIncludedCount } from "./brand-kit-gallery-filter";
import {
  computeGalleryBriefSourceKey,
  GALLERY_BRIEF_MIN_INCLUDED_IMAGES,
  harvestFrameLabel,
  includedHarvestForBriefAnalysis,
} from "./brand-kit-gallery-brief";
import {
  buildGalleryBriefBrandContext,
  hasGalleryAdnContext,
} from "./brand-kit-gallery-brief-adn";
import { PLACES_BRIEF_PROMPT_HINT_RULE } from "./brand-kit-gallery-places-guidance";
import { PEOPLE_BRIEF_PROMPT_HINT_RULE } from "./brand-kit-gallery-people-guidance";
import { galleryCategoryBriefRulesBlock } from "./brand-kit-gallery-category-guidance";
import { buildGalleryBriefVisionFrames } from "./brand-kit-gallery-brief-frames";
import {
  normalizeGalleryCategoryBrief,
  parseGalleryBriefVariantsFromRaw,
} from "./brand-kit-gallery-brief-variants";
import { GALLERY_CATEGORY_ORDER, GALLERY_CATEGORY_SLOT_COUNT } from "./brand-kit-gallery-plan";
import type {
  BrandKitDocument,
  GalleryCategoryBrief,
  GalleryValue,
} from "./brand-kit-types";

const BRIEF_MODEL = process.env.BRAND_KIT_LLM_GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const ANALYZE_ROUTE = "/api/spaces/brandKit/gallery/analyze-briefs";

const CATEGORY_ENUM = ["people_mood", "places", "objects", "textures", "general"] as const;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    briefs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING, enum: [...CATEGORY_ENUM] },
          description: { type: Type.STRING },
          promptHint: { type: Type.STRING },
          confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
          variants: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING },
                promptHint: { type: Type.STRING },
              },
              required: ["description", "promptHint"],
            },
          },
        },
        required: ["category", "description", "confidence", "variants"],
      },
    },
  },
  required: ["briefs"],
} as const;

const SYSTEM = [
  "Eres un director de arte que analiza imágenes cosechadas de una marca.",
  "Devuelves SOLO JSON.",
  "Reglas por categoría:",
  galleryCategoryBriefRulesBlock(),
  "description: UN párrafo en español (1-2 frases) que sintetiza la esencia de la categoría para la marca — mood, tipo de imagen, audiencia. NO listes las 4 variantes ni repitas variant.description.",
  "variants: exactamente 4 entradas distintas para generación (cada una con description corta + promptHint en inglés alineado con el medio artístico del ADN).",
  "Respeta imageMedium del contexto de marca: illustration, collage, 3d_render, graphic_design o mixed — no uses fotografía por defecto si el ADN indica otro medio.",
  "Las 4 variantes deben diferir en sujeto, escena, material o mood — nunca el mismo objeto, textura, entorno ni retrato.",
  "Coherencia de marca: respeta producto, propósito, promesa y límites del ADN; no uses productos, usos o competidores incoherentes con la marca.",
  "Prohibido lenguaje genérico: no uses «evoca la marca», «coherente con la identidad», «tratamiento editorial» sin especificar qué se ve.",
  "Si no hay evidencia clara en las imágenes para una categoría, dilo con precisión y pon confidence low.",
  "textures.variant.promptHint: macro full-frame material surface faithful to imageMedium; never people, UI, holograms, or stock tech scenes.",
  PLACES_BRIEF_PROMPT_HINT_RULE,
  PEOPLE_BRIEF_PROMPT_HINT_RULE,
].join("\n");

const TEXT_SYSTEM = [
  "Eres un director de arte que interpreta el ADN textual de una marca (sin imágenes de referencia).",
  "Devuelves SOLO JSON.",
  "Reglas por categoría:",
  galleryCategoryBriefRulesBlock(),
  "description: UN párrafo en español (1-2 frases) que sintetiza la esencia de la categoría para la marca — mood, tipo de imagen, audiencia. NO listes las 4 variantes ni repitas variant.description.",
  "variants: exactamente 4 entradas distintas para generación (cada una con description corta + promptHint en inglés alineado con el medio artístico del ADN).",
  "Respeta imageMedium del contexto de marca: illustration, collage, 3d_render, graphic_design o mixed — no uses fotografía por defecto si el ADN indica otro medio.",
  "Las 4 variantes deben diferir en sujeto, escena, material o mood — nunca el mismo objeto, textura, entorno ni retrato.",
  "Coherencia de marca: respeta producto, propósito, promesa y límites del ADN; no uses productos, usos o competidores incoherentes con la marca.",
  "Prohibido lenguaje genérico: no uses «evoca la marca», «coherente con la identidad», «tratamiento editorial» sin especificar qué se ve.",
  "Usa esencia, voz, mundo visual y paleta como evidencia textual; confidence medium salvo que el ADN sea muy explícito (high) o muy vago (low).",
  "textures.variant.promptHint: macro full-frame material surface faithful to imageMedium; never people, UI, holograms, or stock tech scenes.",
  PLACES_BRIEF_PROMPT_HINT_RULE,
  PEOPLE_BRIEF_PROMPT_HINT_RULE,
].join("\n");

function extractJsonText(response: unknown): string {
  const r = response as {
    text?: string;
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (typeof r.text === "string" && r.text.trim()) return r.text;
  return (r.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("");
}

async function runBriefAnalysisWithGemini(input: {
  ai: GoogleGenAI;
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
  systemInstruction: string;
  userEmail: string;
  evidenceCount: number;
}): Promise<{ categoryBriefs: GalleryCategoryBrief[]; costUsd: number }> {
  const response = await withGeminiRetries({
    run: async () =>
      input.ai.models.generateContent({
        model: BRIEF_MODEL,
        contents: [{ role: "user", parts: input.parts }],
        config: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          systemInstruction: input.systemInstruction,
        },
      }),
  });

  const usage = (response as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } })
    .usageMetadata;
  const costUsd = estimateGeminiUsd(BRIEF_MODEL, usage?.promptTokenCount ?? 0, usage?.candidatesTokenCount ?? 0);

  await recordApiUsage({
    provider: "gemini",
    userEmail: input.userEmail,
    serviceId: "brand-kit-llm-synthesis",
    route: ANALYZE_ROUTE,
    model: BRIEF_MODEL,
    operation: "gallery_category_briefs",
    inputTokens: usage?.promptTokenCount,
    outputTokens: usage?.candidatesTokenCount,
    costIsKnown: true,
    costUsd,
  }).catch(() => undefined);

  const raw = parseJsonObjectFromVisionModelText(extractJsonText(response));
  if (!raw || typeof raw !== "object") throw new Error("No se pudo interpretar el análisis de galería");

  const briefsRaw = (raw as { briefs?: unknown }).briefs;
  if (!Array.isArray(briefsRaw)) throw new Error("Respuesta de análisis incompleta");

  const parsedBriefs = briefsRaw
    .map((entry) =>
      normalizeBrief(
        entry as {
          category: string;
          description: string;
          promptHint?: string;
          confidence: string;
          variants?: Array<{ description?: string; promptHint?: string }>;
        },
        input.evidenceCount,
      ),
    )
    .filter((entry): entry is GalleryCategoryBrief => Boolean(entry));

  const byCategory = new Map(parsedBriefs.map((entry) => [entry.category, entry]));
  const categoryBriefs = GALLERY_CATEGORY_ORDER.map((category) => byCategory.get(category)).filter(
    (entry): entry is GalleryCategoryBrief => Boolean(entry),
  );

  if (!categoryBriefs.length) throw new Error("El análisis no produjo briefs utilizables");

  return { categoryBriefs, costUsd };
}

function normalizeBrief(entry: {
  category: string;
  description: string;
  promptHint?: string;
  confidence: string;
  variants?: Array<{ description?: string; promptHint?: string }>;
}, evidenceCount: number): GalleryCategoryBrief | null {
  if (!CATEGORY_ENUM.includes(entry.category as (typeof CATEGORY_ENUM)[number])) return null;
  const description = entry.description.trim();
  if (!description) return null;
  const variants = parseGalleryBriefVariantsFromRaw(
    entry.category as GalleryCategoryBrief["category"],
    entry,
  );
  if (!variants || variants.length < GALLERY_CATEGORY_SLOT_COUNT) return null;
  const confidence =
    entry.confidence === "high" || entry.confidence === "medium" || entry.confidence === "low"
      ? entry.confidence
      : "medium";
  return normalizeGalleryCategoryBrief({
    category: entry.category as GalleryCategoryBrief["category"],
    description,
    promptHint: variants[0]?.promptHint ?? entry.promptHint?.trim() ?? "",
    variants,
    confidence,
    evidenceCount,
  });
}

export async function runGalleryCategoryBriefAnalysis(input: {
  brandKit: BrandKitDocument;
  userEmail: string;
}): Promise<{ gallery: GalleryValue; costUsd: number }> {
  const gallerySlot = input.brandKit.slots.gallery;
  const gallery = gallerySlot?.value as GalleryValue | undefined;
  if (!gallery) throw new Error("Galería no disponible");

  const includedCount = galleryIncludedCount(gallery);
  const useVision = includedCount >= GALLERY_BRIEF_MIN_INCLUDED_IMAGES;
  if (!useVision && !hasGalleryAdnContext(input.brandKit)) {
    throw new Error(
      `Completa esencia, voz o mundo visual, o añade al menos ${GALLERY_BRIEF_MIN_INCLUDED_IMAGES} imágenes incluidas en Mundo visual.`,
    );
  }

  const { compiled } = await compileBrandKit(input.brandKit);
  const brandContext = buildGalleryBriefBrandContext(input.brandKit, compiled.stylePrompt);

  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("missing_gemini_api_key");

  const ai = new GoogleGenAI({ apiKey });
  const categoryGuide = galleryCategoryBriefRulesBlock();

  let categoryBriefs: GalleryCategoryBrief[];
  let costUsd = 0;

  if (useVision) {
    const harvestItems = includedHarvestForBriefAnalysis(gallery);
    const frames = await buildGalleryBriefVisionFrames(harvestItems, harvestFrameLabel);
    if (frames.length < 2) {
      throw new Error("No se pudieron cargar suficientes imágenes para el análisis visual.");
    }

    const labelBlock = frames.map((frame) => `- ${frame.label}`).join("\n");
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
      {
        text: [
          "Analiza las imágenes adjuntas y el contexto de marca.",
          "Genera un brief por categoría:",
          categoryGuide,
          "",
          "Contexto de marca:",
          brandContext,
          "",
          "Imágenes:",
          labelBlock,
        ].join("\n"),
      },
    ];

    for (const frame of frames) {
      parts.push({ text: frame.label });
      parts.push({ inlineData: { mimeType: "image/jpeg", data: frame.jpegBase64 } });
    }

    const result = await runBriefAnalysisWithGemini({
      ai,
      parts,
      systemInstruction: SYSTEM,
      userEmail: input.userEmail,
      evidenceCount: frames.length,
    });
    categoryBriefs = result.categoryBriefs;
    costUsd = result.costUsd;
  } else {
    const parts: Array<{ text?: string }> = [
      {
        text: [
          "Interpreta el ADN textual de la marca y genera un brief por categoría sin imágenes de referencia:",
          categoryGuide,
          "",
          "Contexto de marca:",
          brandContext,
        ].join("\n"),
      },
    ];

    const result = await runBriefAnalysisWithGemini({
      ai,
      parts,
      systemInstruction: TEXT_SYSTEM,
      userEmail: input.userEmail,
      evidenceCount: includedCount,
    });
    categoryBriefs = result.categoryBriefs;
    costUsd = result.costUsd;
  }

  const sourceKey = computeGalleryBriefSourceKey(input.brandKit);
  const nextGallery: GalleryValue = {
    ...gallery,
    categoryBriefs,
    categoryBriefsSourceKey: sourceKey,
    categoryBriefsAnalyzedAt: new Date().toISOString(),
  };

  return { gallery: nextGallery, costUsd };
}

export { ANALYZE_ROUTE, BRIEF_MODEL };
