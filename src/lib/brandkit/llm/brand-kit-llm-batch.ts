import { GoogleGenAI } from "@google/genai";
import { parseJsonObjectFromVisionModelText } from "@/lib/brain/brain-vision-json-from-text";
import { recordApiUsage } from "@/lib/api-usage";
import { estimateGeminiUsd } from "@/lib/pricing-config";
import type { EssenceValue, GalleryValue, VisualWorldValue, VoiceValue } from "../brand-kit-types";
import {
  formatEvidenceCandidatesForLlm,
  type EvidenceCandidate,
} from "../brand-kit-evidence-candidates";
import type { BrandKitSynthesisInput } from "./brand-kit-llm-synthesis";
import {
  GALLERY_BRIEF_MIN_INCLUDED_IMAGES,
  harvestFrameLabel,
  includedHarvestForBriefAnalysis,
} from "../brand-kit-gallery-brief";
import {
  buildGalleryBriefVisionFrames,
  type GalleryBriefVisionFrame,
} from "../brand-kit-gallery-brief-frames";
import { galleryCategoryBriefRulesBlock } from "../brand-kit-gallery-category-guidance";
import {
  GALLERY_CATEGORY_BRIEFS_JSON_SHAPE,
  parseGalleryCategoryBriefsFromBatch,
} from "../brand-kit-gallery-brief-batch";
import type { GalleryCategoryBrief } from "../brand-kit-types";
import {
  mergeBatchValidation,
  validateBatchResponse,
  validateBatchSlotKey,
  type BatchSlotKey,
  type BatchSlotValidation,
} from "./brand-kit-llm-batch-validate";
import { BRAND_KIT_RICH_TEXT_PROMPT } from "../brand-kit-rich-text";

export { batchLlmProvenance, buildBatchSlotPatch } from "./brand-kit-batch-slot-patch";

const BRAND_KIT_LLM_MODEL = process.env.BRAND_KIT_LLM_GEMINI_MODEL?.trim() || "gemini-2.5-flash";

const BATCH_SYSTEM_BASE = [
  "Eres un analista de ADN de marca. Devuelves SOLO JSON.",
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
  "Analiza las imágenes cosechadas para detectar el medio artístico dominante.",
  "visualWorld.imageMedium: photography | illustration | collage | 3d_render | graphic_design | mixed.",
  "visualWorld.imageStyleTags: 2-5 chips de tratamiento (flat vector, hand-drawn, photorealistic macro, cut-paper collage…).",
  "Si la marca mezcla medios, usa mixed y detalla en imageStyleTags y limits.",
  BRAND_KIT_RICH_TEXT_PROMPT,
];

const BATCH_SYSTEM_GALLERY_BRIEFS = [
  "galleryCategoryBriefs: exactamente 5 entradas (people_mood, places, objects, textures, general).",
  "Cada entrada: description (párrafo único: esencia de la categoría en español, 1-2 frases) + variants (exactamente 4 escenas distintas para generar).",
  "description NO debe listar ni repetir las 4 variantes; sintetiza qué tipo de imágenes define esta categoría para la marca.",
  "Cada variant: description corta + promptHint en inglés alineado con visualWorld.imageMedium (no fotografía por defecto si el ADN es ilustración, collage, 3D, etc.). Sin texto ni logos.",
  "Las 4 variantes por categoría deben diferir en sujeto, escena, material o mood — nunca repetir el mismo objeto, textura, entorno ni retrato.",
  "Coherencia de marca: respeta producto, propósito, promesa y límites del ADN; no uses productos, usos o competidores incoherentes.",
  "Mezcla voz, tono, colores del contexto y lo que ves en las imágenes cosechadas.",
  "Reglas por categoría:",
  galleryCategoryBriefRulesBlock(),
  "Para people_mood: variantes concretas del ADN — quién aparece, emoción, luz, encuadre. No asumas familias ni parques temáticos salvo que el ADN lo indique.",
  "Para objects: variantes con objetos concretos del ADN (producto, props, materiales, iluminación still life). Prohibido personajes con copyright o marcas registradas.",
  "Para textures: cada variant debe pedir macro full-frame surface photograph distinta (material diferente).",
  "Para places: cada variant debe pedir empty location/architecture/landscape distinta, nunca personas.",
  "confidence: high si hay evidencia clara en imágenes; medium si inferido; low si casi sin evidencia.",
];

const BATCH_JSON_SHAPE_BASE = `{
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
    "imageMedium": "photography",
    "imageStyleTags": [],
    "evidenceIds": []
  }
}`;

function buildBatchJsonShape(includeGalleryBriefs: boolean): string {
  if (!includeGalleryBriefs) return BATCH_JSON_SHAPE_BASE;
  const trimmed = BATCH_JSON_SHAPE_BASE.trimEnd();
  return `${trimmed.slice(0, -2)},\n  ${GALLERY_CATEGORY_BRIEFS_JSON_SHAPE}\n}`;
}

export type BrandKitBatchSlotResult = {
  essence: EssenceValue | null;
  voice: VoiceValue | null;
  visualWorld: VisualWorldValue | null;
  categoryBriefs: GalleryCategoryBrief[] | null;
  degraded: BatchSlotKey[];
};

async function reportGeminiUsage(
  input: BrandKitSynthesisInput,
  operation: string,
  usage?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number },
): Promise<void> {
  const inputTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;
  const costUsd = estimateGeminiUsd(BRAND_KIT_LLM_MODEL, inputTokens, outputTokens);
  input.onLlmCostUsd?.(costUsd);
  await recordApiUsage({
    provider: "gemini",
    userEmail: input.userEmail,
    serviceId: "brand-kit-llm-synthesis",
    route: input.route ?? "/api/spaces/brandKit/crawl",
    model: BRAND_KIT_LLM_MODEL,
    operation,
    inputTokens,
    outputTokens,
    totalTokens: usage?.totalTokenCount,
    costIsKnown: true,
    costUsd,
  }).catch(() => undefined);
}

function formatProbeContextForLlm(context: BrandKitSynthesisInput["probeContext"]): string {
  if (!context) return "";
  const lines: string[] = [];
  if (context.textSummary.length) {
    lines.push("Resumen del document probe:", ...context.textSummary.map((row) => `- ${row}`));
  }
  if (context.primaryColors.length) {
    lines.push(
      "Paleta detectada:",
      ...context.primaryColors.map((color) =>
        `- ${color.hex}${color.label ? ` (${color.label})` : ""}`,
      ),
    );
  }
  if (context.typography.length) {
    lines.push(
      "Tipografía visible:",
      ...context.typography.map((row) => `- ${row.family} (${row.role})`),
    );
  }
  if (context.imageInventory.length) {
    lines.push(
      "Inventario visual (imágenes no-logo):",
      ...context.imageInventory.map((row) =>
        `- ${row.description}${row.page != null ? ` · pág. ${row.page}` : ""}`,
      ),
    );
  }
  return lines.join("\n");
}

function buildBatchUserPrompt(input: BrandKitSynthesisInput, includeGalleryBriefs: boolean): string {
  const parts = [`Marca: ${input.brandName ?? "desconocida"}`];
  const probeBlock = formatProbeContextForLlm(input.probeContext);
  if (probeBlock) {
    parts.push("Contexto visual del document probe (usa para coherencia, especialmente visualWorld):", probeBlock);
  }
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
  if (includeGalleryBriefs) {
    parts.push(
      "Define galleryCategoryBriefs para generar imágenes de estilo por categoría. Basa las descripciones en las imágenes adjuntas (si hay) y en el contexto de marca.",
    );
  }
  parts.push(`JSON: ${buildBatchJsonShape(includeGalleryBriefs)}`);
  return parts.join("\n\n");
}

async function callBatchJson(
  input: BrandKitSynthesisInput,
  userPrompt: string,
  operation: string,
  options?: { visionFrames?: GalleryBriefVisionFrame[]; includeGalleryBriefs?: boolean },
): Promise<unknown | null> {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  const minCorpus = input.probeContext || input.evidenceCandidates?.length ? 24 : 50;
  if (!apiKey || input.corpus.trim().length < minCorpus) return null;

  const ai = new GoogleGenAI({ apiKey });
  const visionFrames = options?.visionFrames ?? [];
  const systemInstruction = [
    ...BATCH_SYSTEM_BASE,
    ...(options?.includeGalleryBriefs ? BATCH_SYSTEM_GALLERY_BRIEFS : []),
  ].join("\n");

  const userParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    { text: userPrompt },
  ];
  for (const frame of visionFrames) {
    userParts.push({ text: frame.label });
    userParts.push({ inlineData: { mimeType: "image/jpeg", data: frame.jpegBase64 } });
  }

  try {
    const result = await ai.models.generateContent({
      model: BRAND_KIT_LLM_MODEL,
      contents: [{ role: "user", parts: userParts }],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        temperature: visionFrames.length ? 0.1 : 0.2,
      },
    });
    await reportGeminiUsage(input, operation, result.usageMetadata);
    return parseJsonObjectFromVisionModelText(result.text ?? "");
  } catch (error) {
    console.error(`[brand-kit-llm/${operation}]`, error);
    return null;
  }
}

async function retryBatchKey(
  input: BrandKitSynthesisInput,
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
      buildBatchUserPrompt(input, false),
      `JSON con una sola clave: { "${key}": ${schemaHint} }`,
    ].join("\n\n"),
    `batch_retry_${key}`,
  );

  if (!raw || typeof raw !== "object") return { ok: false, error: "reintento sin JSON" };
  const value = (raw as Record<string, unknown>)[key];
  return validateBatchSlotKey(key, value, input.corpus, input.evidenceCandidates ?? []);
}

export type BrandKitBatchOptions = {
  /** Reintentos por slot fallido (crawl). Ingest file usa false para cap ≤3 LLM. */
  allowSlotRetries?: boolean;
  /** Galería cosechada: si hay imágenes suficientes, el batch incluye visión + galleryCategoryBriefs. */
  gallery?: GalleryValue;
};

export async function synthesizeBrandKitBatch(
  input: BrandKitSynthesisInput,
  options?: BrandKitBatchOptions,
): Promise<BrandKitBatchSlotResult> {
  const degraded: BatchSlotKey[] = [];
  const empty = { essence: null, voice: null, visualWorld: null, categoryBriefs: null, degraded };
  const evidenceCandidates = input.evidenceCandidates ?? [];
  const allowSlotRetries = options?.allowSlotRetries !== false;

  const gallery = options?.gallery;
  const includedCount = gallery?.harvested?.filter((item) => item.included !== false).length ?? 0;
  const includeGalleryBriefs = includedCount >= GALLERY_BRIEF_MIN_INCLUDED_IMAGES;

  let visionFrames: GalleryBriefVisionFrame[] = [];
  if (includeGalleryBriefs && gallery) {
    const harvestItems = includedHarvestForBriefAnalysis(gallery);
    visionFrames = await buildGalleryBriefVisionFrames(harvestItems, harvestFrameLabel);
  }

  const raw = await callBatchJson(
    input,
    buildBatchUserPrompt(input, includeGalleryBriefs),
    visionFrames.length ? "batch_vision" : "batch",
    { visionFrames, includeGalleryBriefs },
  );
  if (!raw) return empty;

  const initial = validateBatchResponse(raw, input.corpus, evidenceCandidates);
  let essenceResult = initial.essence;
  let voiceResult = initial.voice;
  let visualWorldResult = initial.visualWorld;
  const categoryBriefs = includeGalleryBriefs
    ? parseGalleryCategoryBriefsFromBatch(raw, visionFrames.length || includedCount)
    : null;

  if (allowSlotRetries) {
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
  }

  if (!essenceResult.ok) degraded.push("essence");
  if (!voiceResult.ok) degraded.push("voice");
  if (!visualWorldResult.ok) degraded.push("visualWorld");

  return {
    essence: essenceResult.ok ? essenceResult.value : null,
    voice: voiceResult.ok ? voiceResult.value : null,
    visualWorld: visualWorldResult.ok ? visualWorldResult.value : null,
    categoryBriefs,
    degraded,
  };
}
