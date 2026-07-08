import { GoogleGenAI } from "@google/genai";
import { GEMINI_VISION_ANALYSIS_SERVICE_ID } from "@/lib/brain/brain-vision-usage";
import type { PdfTypographyDraft } from "@/lib/brain/pdf-brand-extract";
import { isBrandFontStopword } from "@/lib/brain/pdf-font-extract";
import { renderPdfPages } from "@/lib/brain/pdf-page-render";
import { parseJsonObjectFromVisionModelText } from "@/lib/brain/brain-vision-json-from-text";

export type TypographyVisionFallbackResult = {
  typography: PdfTypographyDraft;
  confidence: number;
  evidenceKind: "llm-synthesis";
  provider: "gemini-vision" | "mock";
};

const TYPOGRAPHY_VISION_PROMPT = `Analiza estas páginas de un documento de marca o informe corporativo.
Identifica la tipografía principal visible (familia comercial, p. ej. Montserrat, Helvetica, Fractul).
Devuelve SOLO JSON válido con shape:
{
  "primary": { "family": "string", "weights": ["Regular","Bold"] },
  "secondary": { "family": "string", "weights": ["Regular"] }
}
Si no puedes identificar una familia concreta, devuelve { "primary": null }.
No inventes fuentes genéricas del sistema (Arial, Calibri) salvo que sean claramente la marca.`;

export type TypographyVisionInvoker = (input: {
  pageImages: Array<{ mimeType: string; base64: string; pageNumber: number }>;
  userEmail?: string;
  route?: string;
}) => Promise<TypographyVisionFallbackResult | null>;

function parseTypographyVisionJson(raw: unknown): PdfTypographyDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const draft: PdfTypographyDraft = {};

  const readSlot = (key: "primary" | "secondary") => {
    const slot = root[key];
    if (!slot || typeof slot !== "object") return;
    const family = String((slot as Record<string, unknown>).family ?? "").trim();
    if (!family || isBrandFontStopword(family)) return;
    const weightsRaw = (slot as Record<string, unknown>).weights;
    const weights = Array.isArray(weightsRaw)
      ? weightsRaw.filter((w): w is string => typeof w === "string" && w.trim()).map((w) => w.trim())
      : ["Regular"];
    draft[key] = { family, weights: weights.length ? weights : ["Regular"] };
  };

  readSlot("primary");
  readSlot("secondary");
  return draft.primary ? draft : null;
}

export async function defaultTypographyVisionInvoker(input: {
  pageImages: Array<{ mimeType: string; base64: string; pageNumber: number }>;
  userEmail?: string;
  route?: string;
}): Promise<TypographyVisionFallbackResult | null> {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  if (!apiKey || !input.pageImages.length) return null;

  const modelName = process.env.BRAIN_VISION_GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const ai = new GoogleGenAI({ apiKey });
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    { text: TYPOGRAPHY_VISION_PROMPT },
    ...input.pageImages.map((img) => ({
      inlineData: { mimeType: img.mimeType, data: img.base64 },
    })),
  ];

  const r = await ai.models.generateContent({
    model: modelName,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction:
        "Eres tipógrafo de identidad corporativa. Respondes únicamente JSON válido, sin markdown.",
    },
  });

  const { recordApiUsage, parseGeminiUsageMetadata } = await import("@/lib/api-usage");
  await recordApiUsage({
    provider: "gemini",
    userEmail: input.userEmail,
    serviceId: GEMINI_VISION_ANALYSIS_SERVICE_ID,
    route: input.route ?? "/lib/brain/pdf-typography-vision-fallback",
    operation: "typography_vision_fallback",
    costIsKnown: false,
    costUsd: 0,
    metadata: parseGeminiUsageMetadata(r),
  });

  const raw = parseJsonObjectFromVisionModelText(r.text ?? "");
  const typography = parseTypographyVisionJson(raw);
  if (!typography?.primary) return null;

  return {
    typography,
    confidence: 0.42,
    evidenceKind: "llm-synthesis",
    provider: "gemini-vision",
  };
}

export async function synthesizeTypographyFromPdfRenders(input: {
  buffer: Buffer;
  maxPages?: number;
  userEmail?: string;
  route?: string;
  invokeVision?: TypographyVisionInvoker;
  /** Solo tests — evita rasterizar PDF. */
  pageImagesOverride?: Array<{ mimeType: string; base64: string; pageNumber: number }>;
}): Promise<TypographyVisionFallbackResult | null> {
  const pageImages =
    input.pageImagesOverride ??
    (await (async () => {
      const maxPages = Math.min(input.maxPages ?? 3, 3);
      const pages = await renderPdfPages(input.buffer, { maxPages, dpi: 110 });
      if (!pages.length) return null;
      const pick = [pages[0], pages[Math.floor(pages.length / 2)], pages[pages.length - 1]].filter(Boolean);
      const unique = [...new Map(pick.map((p) => [p!.pageNumber, p!])).values()].slice(0, 3);
      return unique.map((page) => ({
        mimeType: "image/png" as const,
        base64: page.pngBuffer.toString("base64"),
        pageNumber: page.pageNumber,
      }));
    })());
  if (!pageImages?.length) return null;

  const invoke = input.invokeVision ?? defaultTypographyVisionInvoker;
  return invoke({ pageImages, userEmail: input.userEmail, route: input.route });
}
