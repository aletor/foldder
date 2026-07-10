/**
 * Pase de visión unificado por documento — logo, paleta, tipografía, universo visual.
 */

import { GoogleGenAI } from "@google/genai";
import { GEMINI_VISION_ANALYSIS_SERVICE_ID } from "@/lib/brain/brain-vision-usage";
import { parseJsonObjectFromVisionModelText } from "@/lib/brain/brain-vision-json-from-text";
import { IMAGE_CATEGORIES } from "../model/trait-ids";
import type { PdfPaletteRole } from "@/lib/brain/pdf-brand-extract";
import { genomaOperationId } from "../ingest/paid-operations";
import { buildPdfVisionMosaic } from "./pdf-vision-mosaic";
import {
  getCachedPdfVisionPass,
  pdfVisionCacheKey,
  setCachedPdfVisionPass,
} from "./pdf-vision-cache";
import { GenomaVisionPassError } from "./genoma-vision-pass-error";
import {
  logVisionApiCall,
  logVisionApiResponse,
  logVisionMosaicBuilt,
  logVisionNoApiKey,
  logVisionParseFailed,
} from "./genoma-vision-debug";
import {
  GENOMA_PDF_VISION_PASS_VERSION,
  type GenomaPdfVisionResult,
  type GenomaVisionLogoHint,
  type GenomaVisionLogoPolarity,
  type GenomaVisionNormalizedBbox,
  type GenomaVisionPageImage,
  type GenomaVisionPaletteEntry,
  type GenomaVisionThirdPartyLogo,
  type GenomaVisionTypographyHint,
  type GenomaVisionVisualEntry,
} from "./pdf-vision-types";

const PALETTE_ROLES: PdfPaletteRole[] = ["primario", "secundario", "acento", "fondo", "soporte"];

const UNIFIED_VISION_PROMPT = `Analiza estas páginas renderizadas de un documento de marca (deck, manual, informe).
Devuelve SOLO JSON válido con esta forma exacta:
{
  "logo": {
    "emitter": {
      "page": 1,
      "bbox": { "x": 0.05, "y": 0.03, "width": 0.2, "height": 0.1 },
      "polarity": "light_mark",
      "isEmitterLogo": true
    },
    "thirdParty": [{ "page": 2, "bbox": { "x": 0.1, "y": 0.5, "width": 0.08, "height": 0.05 }, "label": "partner" }]
  },
  "palette": [
    { "role": "primario", "approxHex": "#001848", "wherePresent": "fondos y titulares", "isBrandColor": true, "source": "brand" },
    { "role": "secundario", "approxHex": "#384ba5", "wherePresent": "bloques UI", "isBrandColor": true, "source": "brand" },
    { "role": "acento", "approxHex": "#8a91eb", "wherePresent": "énfasis", "isBrandColor": true, "source": "brand" }
  ],
  "typography": {
    "primaryFamily": "Montserrat",
    "secondaryFamily": "Montserrat",
    "primaryWeights": ["Bold"],
    "secondaryWeights": ["Regular"],
    "primaryStyle": "sans geométrica en titulares",
    "visibleInTitles": true
  },
  "visual": [
    { "category": "people", "description": "Retratos profesionales con luz suave", "imageRefIndex": 0 }
  ]
}

Reglas:
- bbox en coordenadas normalizadas 0–1: { x, y, width, height } donde (x,y) es esquina superior izquierda y width/height son tamaño relativo a la página. El bbox debe CONTENER el logo completo del emisor (marca del documento), no solo fondo vacío.
- polarity: "light_mark" = logo claro sobre fondo oscuro; "dark_mark" = logo oscuro sobre fondo claro.
- palette: devuelve SOLO colores de IDENTIDAD DE MARCA — fondos corporativos, titulares, UI, elementos gráficos de marca. EXCLUYE colores de fotografías, retratos, pieles, barbas, trajes, madera e imágenes de stock. Para cada color usa isBrandColor (true=solo marca) y source ("brand" | "photo"). No incluyas entradas con isBrandColor:false ni source:"photo".
- approxHex en #RRGGBB. Roles: primario, secundario, acento, fondo, soporte.
- typography: familia comercial si la reconoces; si no, primaryStyle descriptivo y primaryFamily null omitido.
- visual.category: people | objects | textures | environments | protagonists | general.
- Si no hay logo del emisor claro, omite logo.emitter. Si no hay paleta de marca, palette: [].`;

export type GenomaVisionPassInvoker = (input: {
  pageImages: GenomaVisionPageImage[];
  userEmail?: string;
  route?: string;
  operationId: string;
}) => Promise<GenomaPdfVisionResult | null>;

function parseHex(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("#")) return null;
  const hex = raw.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(hex) && !/^#[0-9a-f]{3}$/.test(hex)) return null;
  if (hex.length === 4) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex;
}

function parseNormalizedBbox(raw: unknown): GenomaVisionNormalizedBbox | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const x = Number(b.x);
  const y = Number(b.y);
  const width = Number(b.width);
  const height = Number(b.height);
  if (![x, y, width, height].every((v) => Number.isFinite(v))) return null;
  if (width <= 0 || height <= 0) return null;
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    width: Math.max(0.01, Math.min(1, width)),
    height: Math.max(0.01, Math.min(1, height)),
  };
}

function parsePolarity(raw: unknown): GenomaVisionLogoPolarity | null {
  if (raw === "light_mark" || raw === "dark_mark") return raw;
  return null;
}

function parseLogoHint(raw: unknown): GenomaVisionLogoHint | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const page = Number(o.page);
  const bbox = parseNormalizedBbox(o.bbox);
  const polarity = parsePolarity(o.polarity);
  if (!Number.isFinite(page) || page < 1 || !bbox || !polarity) return null;
  return {
    page: Math.round(page),
    bbox,
    polarity,
    isEmitterLogo: o.isEmitterLogo !== false,
  };
}

function parseThirdParty(raw: unknown): GenomaVisionThirdPartyLogo[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const page = Number(o.page);
      const bbox = parseNormalizedBbox(o.bbox);
      if (!Number.isFinite(page) || page < 1 || !bbox) return null;
      return {
        page: Math.round(page),
        bbox,
        ...(typeof o.label === "string" && o.label.trim() ? { label: o.label.trim() } : {}),
      };
    })
    .filter((v): v is GenomaVisionThirdPartyLogo => v !== null);
}

function parsePaletteEntry(raw: unknown): GenomaVisionPaletteEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const role = o.role;
  if (typeof role !== "string" || !PALETTE_ROLES.includes(role as PdfPaletteRole)) return null;
  const approxHex = parseHex(o.approxHex);
  if (!approxHex) return null;
  const source = o.source === "photo" ? "photo" : "brand";
  const isBrandColor = o.isBrandColor !== false && source !== "photo";
  if (!isBrandColor) return null;
  return {
    role: role as PdfPaletteRole,
    approxHex,
    wherePresent: typeof o.wherePresent === "string" ? o.wherePresent.trim() : undefined,
    isBrandColor: true,
    source: "brand",
  };
}

function parseTypography(raw: unknown): GenomaVisionTypographyHint | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const readFamily = (key: string) => {
    const v = o[key];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  const readWeights = (key: string) => {
    const v = o[key];
    if (!Array.isArray(v)) return undefined;
    return v.filter((w): w is string => typeof w === "string" && w.trim().length > 0).map((w) => w.trim());
  };
  const hint: GenomaVisionTypographyHint = {
    primaryFamily: readFamily("primaryFamily"),
    secondaryFamily: readFamily("secondaryFamily"),
    primaryWeights: readWeights("primaryWeights"),
    secondaryWeights: readWeights("secondaryWeights"),
    primaryStyle: readFamily("primaryStyle"),
    secondaryStyle: readFamily("secondaryStyle"),
    visibleInTitles: o.visibleInTitles === true,
  };
  if (
    !hint.primaryFamily &&
    !hint.secondaryFamily &&
    !hint.primaryStyle &&
    !hint.secondaryStyle
  ) {
    return undefined;
  }
  return hint;
}

function parseVisual(raw: unknown): GenomaVisionVisualEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const category = o.category;
      if (typeof category !== "string" || !IMAGE_CATEGORIES.includes(category as GenomaVisionVisualEntry["category"])) {
        return null;
      }
      const description = typeof o.description === "string" ? o.description.trim() : "";
      if (!description) return null;
      const imageRefIndex = Number(o.imageRefIndex);
      return {
        category: category as GenomaVisionVisualEntry["category"],
        description,
        ...(Number.isFinite(imageRefIndex) ? { imageRefIndex: Math.round(imageRefIndex) } : {}),
      };
    })
    .filter((v): v is GenomaVisionVisualEntry => v !== null);
}

export function parseGenomaPdfVisionJson(raw: unknown): GenomaPdfVisionResult | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const logoRoot = root.logo;
  let logo: GenomaPdfVisionResult["logo"];
  if (logoRoot && typeof logoRoot === "object") {
    const lr = logoRoot as Record<string, unknown>;
    const emitter = parseLogoHint(lr.emitter);
    const thirdParty = parseThirdParty(lr.thirdParty);
    if (emitter || thirdParty.length) {
      logo = { ...(emitter ? { emitter } : {}), ...(thirdParty.length ? { thirdParty } : {}) };
    }
  }

  const palette = Array.isArray(root.palette)
    ? root.palette.map(parsePaletteEntry).filter((v): v is GenomaVisionPaletteEntry => v !== null)
    : [];

  const typography = parseTypography(root.typography);
  const visual = parseVisual(root.visual);

  if (!logo?.emitter && palette.length === 0 && !typography && visual.length === 0) {
    return null;
  }

  return {
    version: GENOMA_PDF_VISION_PASS_VERSION,
    logo,
    palette,
    typography,
    visual,
    confidence: 0.55,
    provider: "gemini-vision",
  };
}

export async function defaultGenomaVisionPassInvoker(input: {
  pageImages: GenomaVisionPageImage[];
  userEmail?: string;
  route?: string;
  operationId: string;
}): Promise<GenomaPdfVisionResult | null> {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  if (!apiKey) {
    logVisionNoApiKey();
    throw new GenomaVisionPassError(
      "Análisis visual no disponible: falta configurar GEMINI_API_KEY en el servidor.",
    );
  }
  if (!input.pageImages.length) {
    throw new GenomaVisionPassError("No se pudieron renderizar páginas para el análisis visual.");
  }

  const modelName = process.env.BRAIN_VISION_GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  logVisionApiCall({ model: modelName });
  const ai = new GoogleGenAI({ apiKey });
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    { text: UNIFIED_VISION_PROMPT },
    ...input.pageImages.map((img) => ({
      inlineData: { mimeType: img.mimeType, data: img.base64 },
    })),
  ];

  const r = await ai.models.generateContent({
    model: modelName,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction:
        "Eres director de arte de identidad corporativa. Respondes únicamente JSON válido, sin markdown.",
    },
  });

  const { recordApiUsage, parseGeminiUsageMetadata } = await import("@/lib/api-usage");
  await recordApiUsage({
    provider: "gemini",
    userEmail: input.userEmail,
    serviceId: GEMINI_VISION_ANALYSIS_SERVICE_ID,
    route: input.route ?? "/lib/genoma/ingest/pdf-vision-pass",
    operation: input.operationId,
    costIsKnown: false,
    costUsd: 0,
    metadata: parseGeminiUsageMetadata(r) ?? undefined,
  });

  const rawText = r.text ?? "";
  const parsed = parseJsonObjectFromVisionModelText(rawText);
  const result = parseGenomaPdfVisionJson(parsed);
  if (!result) {
    logVisionParseFailed(rawText);
    throw new GenomaVisionPassError(
      "El modelo de visión no devolvió un análisis de marca utilizable.",
    );
  }
  const bbox = result.logo?.emitter?.bbox;
  logVisionApiResponse({
    ok: true,
    logoBbox: bbox ? `${bbox.x.toFixed(2)},${bbox.y.toFixed(2)},${bbox.width.toFixed(2)},${bbox.height.toFixed(2)}` : undefined,
    paletteLength: result.palette.length,
  });
  return result;
}

export type RunGenomaPdfVisionPassInput = {
  buffer: Buffer;
  contentSha256: string;
  maxPages?: number;
  userEmail?: string;
  route?: string;
  invokeVision?: GenomaVisionPassInvoker;
  pageImagesOverride?: GenomaVisionPageImage[];
  skipCache?: boolean;
  /** Si true, falla en lugar de devolver null (ingesta de pago autorizada). */
  requireResult?: boolean;
};

export async function getOrRunGenomaPdfVisionPass(
  input: RunGenomaPdfVisionPassInput,
): Promise<GenomaPdfVisionResult | null> {
  const cacheKey = pdfVisionCacheKey(input.contentSha256);
  if (!input.skipCache) {
    const cached = getCachedPdfVisionPass(cacheKey);
    if (cached !== undefined && cached !== null) return cached;
  }

  const pageImages =
    input.pageImagesOverride ?? (await buildPdfVisionMosaic(input.buffer, input.maxPages));
  const mosaicBytes = pageImages.reduce((sum, page) => sum + page.base64.length, 0);
  logVisionMosaicBuilt({ pages: pageImages.length, bytes: mosaicBytes });
  if (!pageImages.length) {
    if (input.requireResult) {
      throw new GenomaVisionPassError("No se pudieron renderizar páginas para el análisis visual.");
    }
    return null;
  }

  const operationId = genomaOperationId("ingest", input.contentSha256.slice(0, 32));
  const invoke = input.invokeVision ?? defaultGenomaVisionPassInvoker;
  let result: GenomaPdfVisionResult | null = null;
  try {
    result = await invoke({
      pageImages,
      userEmail: input.userEmail,
      route: input.route,
      operationId,
    });
  } catch (error) {
    if (input.requireResult) throw error;
    return null;
  }

  if (!result) {
    if (input.requireResult) {
      throw new GenomaVisionPassError(
        "El análisis visual no devolvió resultados.",
      );
    }
    return null;
  }

  const normalized = { ...result, version: GENOMA_PDF_VISION_PASS_VERSION };
  setCachedPdfVisionPass(cacheKey, normalized);
  return normalized;
}

export function typographyGuessFromVisionPass(
  typography: GenomaVisionTypographyHint | undefined,
): { primary?: { family: string; weights?: string[] }; secondary?: { family: string; weights?: string[] }; confidence?: number } | null {
  if (!typography?.primaryFamily) return null;
  return {
    primary: {
      family: typography.primaryFamily,
      weights: typography.primaryWeights,
    },
    secondary: typography.secondaryFamily
      ? { family: typography.secondaryFamily, weights: typography.secondaryWeights }
      : undefined,
    confidence: 0.42,
  };
}
