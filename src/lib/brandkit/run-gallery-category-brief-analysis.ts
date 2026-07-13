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
import { galleryCategoryBriefRulesBlock } from "./brand-kit-gallery-category-guidance";
import { buildGalleryBriefVisionFrames } from "./brand-kit-gallery-brief-frames";
import { GALLERY_CATEGORY_ORDER } from "./brand-kit-gallery-plan";
import { slotValue } from "./brand-kit-gallery-tone-utils";
import type {
  BrandKitDocument,
  EssenceValue,
  GalleryCategoryBrief,
  GalleryValue,
  PaletteValue,
  VisualWorldValue,
  VoiceValue,
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
        },
        required: ["category", "description", "promptHint", "confidence"],
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
  "Para cada categoría escribes una descripción CONCRETA en español: materiales, colores nombrados, rugosidad, brillo, grano, luz.",
  "Prohibido lenguaje genérico: no uses «evoca la marca», «coherente con la identidad», «tratamiento editorial» sin especificar qué se ve.",
  "Si no hay evidencia clara en las imágenes para una categoría, dilo con precisión («no aparecen texturas de tela…») y pon confidence low.",
  "promptHint: instrucción visual en inglés para un generador de imágenes, concreta y fotográfica, sin texto ni logos.",
  "textures.promptHint: macro full-frame material surface photograph only; never people, UI, holograms, or stock tech scenes.",
  "places.promptHint: empty architectural or landscape location only; never people, crowds, business scenes, holograms, or UI.",
  "description: 1-2 frases cortas que un humano entienda al instante qué se generará.",
].join("\n");

function extractJsonText(response: unknown): string {
  const r = response as {
    text?: string;
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (typeof r.text === "string" && r.text.trim()) return r.text;
  return (r.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("");
}

function buildBrandContext(doc: BrandKitDocument, stylePrompt?: string): string {
  const brand = doc.brandName?.value?.trim() || "Marca";
  const visual = slotValue<VisualWorldValue>(doc, "visualWorld");
  const voice = slotValue<VoiceValue>(doc, "voice");
  const essence = slotValue<EssenceValue>(doc, "essence");
  const palette = slotValue<PaletteValue>(doc, "palette");

  const lines = [`Marca: ${brand}`];
  if (visual?.summary?.trim()) lines.push(`Mundo visual: ${visual.summary.trim()}`);
  if (visual?.moodTags?.length) lines.push(`Mood: ${visual.moodTags.join(", ")}`);
  if (visual?.visualTraits?.length) {
    lines.push("Rasgos:", ...visual.visualTraits.map((trait) => `- ${trait}`));
  }
  if (visual?.limits?.length) lines.push("Evitar:", ...visual.limits.map((limit) => `- ${limit}`));
  if (voice?.summary?.trim()) lines.push(`Voz: ${voice.summary.trim()}`);
  if (essence?.headline?.trim()) lines.push(`Esencia: ${essence.headline.trim()}`);
  if (palette?.colors?.length) {
    lines.push(
      "Paleta:",
      ...palette.colors.slice(0, 6).map((color) => `- ${color.role}: ${color.hex}`),
    );
  }
  if (stylePrompt?.trim()) lines.push(`Style prompt compilado: ${stylePrompt.trim()}`);
  return lines.join("\n");
}

function normalizeBrief(entry: {
  category: string;
  description: string;
  promptHint: string;
  confidence: string;
}, evidenceCount: number): GalleryCategoryBrief | null {
  if (!CATEGORY_ENUM.includes(entry.category as (typeof CATEGORY_ENUM)[number])) return null;
  const description = entry.description.trim();
  const promptHint = entry.promptHint.trim();
  if (!description || !promptHint) return null;
  const confidence =
    entry.confidence === "high" || entry.confidence === "medium" || entry.confidence === "low"
      ? entry.confidence
      : "medium";
  return {
    category: entry.category as GalleryCategoryBrief["category"],
    description,
    promptHint,
    confidence,
    evidenceCount,
  };
}

export async function runGalleryCategoryBriefAnalysis(input: {
  brandKit: BrandKitDocument;
  userEmail: string;
}): Promise<{ gallery: GalleryValue; costUsd: number }> {
  const gallerySlot = input.brandKit.slots.gallery;
  const gallery = gallerySlot?.value as GalleryValue | undefined;
  if (!gallery) throw new Error("Galería no disponible");

  const includedCount = galleryIncludedCount(gallery);
  if (includedCount < GALLERY_BRIEF_MIN_INCLUDED_IMAGES) {
    throw new Error(`Se necesitan al menos ${GALLERY_BRIEF_MIN_INCLUDED_IMAGES} imágenes incluidas en Mundo visual.`);
  }

  const harvestItems = includedHarvestForBriefAnalysis(gallery);
  const frames = await buildGalleryBriefVisionFrames(harvestItems, harvestFrameLabel);
  if (frames.length < 2) {
    throw new Error("No se pudieron cargar suficientes imágenes para el análisis visual.");
  }

  const { compiled } = await compileBrandKit(input.brandKit);
  const brandContext = buildBrandContext(input.brandKit, compiled.stylePrompt);

  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("missing_gemini_api_key");

  const ai = new GoogleGenAI({ apiKey });
  const categoryGuide = galleryCategoryBriefRulesBlock();

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

  const response = await withGeminiRetries({
    run: async () =>
      ai.models.generateContent({
        model: BRIEF_MODEL,
        contents: [{ role: "user", parts }],
        config: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          systemInstruction: SYSTEM,
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

  const evidenceCount = frames.length;
  const parsedBriefs = briefsRaw
    .map((entry) =>
      normalizeBrief(
        entry as {
          category: string;
          description: string;
          promptHint: string;
          confidence: string;
        },
        evidenceCount,
      ),
    )
    .filter((entry): entry is GalleryCategoryBrief => Boolean(entry));

  const byCategory = new Map(parsedBriefs.map((entry) => [entry.category, entry]));
  const categoryBriefs = GALLERY_CATEGORY_ORDER.map((category) => byCategory.get(category)).filter(
    (entry): entry is GalleryCategoryBrief => Boolean(entry),
  );

  if (!categoryBriefs.length) throw new Error("El análisis no produjo briefs utilizables");

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
