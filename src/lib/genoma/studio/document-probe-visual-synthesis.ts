/**
 * Sintetiza visualWorld a partir del inventario de imágenes del document probe.
 */

import { GoogleGenAI, Type } from "@google/genai";
import { parseJsonObjectFromVisionModelText } from "@/lib/brain/brain-vision-json-from-text";
import { recordApiUsage } from "@/lib/api-usage";
import { estimateGeminiUsd } from "@/lib/pricing-config";
import { withGeminiRetries } from "@/lib/genoma/ingest/gemini-retry";
import type { VisualWorldValue } from "../genoma-types";
import type { GenomaDocumentProbeColor } from "./document-probe-types";

const PROBE_MODEL =
  process.env.GENOMA_DOCUMENT_PROBE_MODEL?.trim() ||
  process.env.GENOMA_LLM_GEMINI_MODEL?.trim() ||
  "gemini-2.5-flash";

const VISUAL_WORLD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    moodTags: { type: Type.ARRAY, items: { type: Type.STRING } },
    visualTraits: { type: Type.ARRAY, items: { type: Type.STRING } },
    limits: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["summary", "moodTags", "visualTraits", "limits"],
};

function parseVisualWorld(raw: unknown): VisualWorldValue | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const summary = typeof row.summary === "string" ? row.summary.trim().slice(0, 600) : "";
  if (!summary) return null;

  const pickStrings = (value: unknown, max: number): string[] => {
    if (!Array.isArray(value)) return [];
    return value
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => entry.trim().slice(0, 120))
      .slice(0, max);
  };

  return {
    summary,
    moodTags: pickStrings(row.moodTags, 6),
    visualTraits: pickStrings(row.visualTraits, 6),
    limits: pickStrings(row.limits, 5),
    evidence: [],
    galleryRefs: [],
  };
}

export async function synthesizeVisualWorldFromDocumentProbe(input: {
  brandName?: string;
  palette: GenomaDocumentProbeColor[];
  imageDescriptions: Array<{ description: string; page: number | null }>;
  userEmail?: string;
  route?: string;
  onLlmCostUsd?: (cost: number) => void;
}): Promise<VisualWorldValue | null> {
  if (!input.imageDescriptions.length) return null;

  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  if (!apiKey) return null;

  const paletteLines = input.palette
    .map((color) => `${color.hex}${color.label ? ` (${color.label})` : ""}`)
    .join(", ");
  const imageLines = input.imageDescriptions
    .map((row, index) => {
      const page = row.page ? `pág. ${row.page}` : "imagen";
      return `${index + 1}. [${page}] ${row.description}`;
    })
    .join("\n");

  const prompt = [
    "Interpreta el mundo visual de una marca a partir de su paleta y un inventario de imágenes del material de marca.",
    "Responde SOLO JSON según el schema.",
    input.brandName ? `Marca: ${input.brandName}` : "",
    paletteLines ? `Paleta: ${paletteLines}` : "",
    "",
    "Imágenes detectadas:",
    imageLines,
    "",
    "summary: párrafo interpretativo en español (personas, objetos, texturas, atmósfera, luz).",
    "moodTags: 3-6 etiquetas de atmósfera.",
    "visualTraits: 3-6 rasgos visuales positivos y accionables.",
    "limits: 3-5 cosas que la marca debería evitar visualmente.",
    "Desglosa personas, objetos, texturas y escenarios cuando aparezcan en las imágenes.",
  ]
    .filter(Boolean)
    .join("\n");

  const ai = new GoogleGenAI({ apiKey });
  const response = await withGeminiRetries({
    run: async () =>
      ai.models.generateContent({
        model: PROBE_MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: VISUAL_WORLD_SCHEMA,
        },
      }),
  });

  const usage = (response as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } })
    .usageMetadata;
  const costUsd = estimateGeminiUsd(
    PROBE_MODEL,
    usage?.promptTokenCount ?? 1200,
    usage?.candidatesTokenCount ?? 400,
  );
  input.onLlmCostUsd?.(costUsd);
  if (input.userEmail) {
    await recordApiUsage({
      provider: "gemini",
      userEmail: input.userEmail,
      serviceId: "genoma-document-probe-visual",
      route: input.route ?? "/api/spaces/genoma/ingest",
      costUsd,
      metadata: { model: PROBE_MODEL },
    }).catch(() => undefined);
  }

  const parsed = parseJsonObjectFromVisionModelText((response as { text?: string }).text ?? "");
  return parseVisualWorld(parsed);
}
