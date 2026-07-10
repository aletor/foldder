/**
 * Modo laboratorio — una sola llamada LLM por documento (sidebar Genoma Studio).
 */

import { GoogleGenAI, Type } from "@google/genai";
import sharp from "sharp";
import { parseBrainDocument } from "@/lib/brain-parser-utils";
import { renderPdfPagesAt } from "@/lib/brain/pdf-page-render";
import { countPdfPagesInBuffer } from "@/lib/brain/pdf-brand-extract";
import { parseReferenceImageForGemini } from "@/lib/parse-reference-image";
import { withGeminiRetries } from "@/lib/genoma/ingest/gemini-retry";
import { parseJsonObjectFromVisionModelText } from "@/lib/brain/brain-vision-json-from-text";
import type {
  GenomaDocumentProbeColor,
  GenomaDocumentProbeLogo,
  GenomaDocumentProbeOtherImage,
  GenomaDocumentProbeResult,
  GenomaDocumentProbeTypography,
  GenomaDocumentProbeTypographyRole,
} from "./document-probe-types";
import { refineProbeLogoBboxFromBackground } from "./document-probe-bbox-refine";
import {
  mergeOtherImageLists,
  PROBE_BRAND_PDF_PAGES,
  selectPdfPagesForExtendedImageProbe,
} from "./document-probe-image-scan";

const PROBE_MODEL =
  process.env.GENOMA_DOCUMENT_PROBE_MODEL?.trim() ||
  process.env.GENOMA_LLM_GEMINI_MODEL?.trim() ||
  "gemini-2.5-flash";

const PROBE_MAX_LONG_EDGE = 640;
const PROBE_JPEG_QUALITY = 65;
const PROBE_TEXT_SAMPLE_CHARS = 6000;
const OTHER_IMAGE_THUMB_MAX_EDGE = 96;
const OTHER_IMAGES_MAX_SHORT = 10;
const OTHER_IMAGES_MAX_LONG = 24;
const OTHER_IMAGES_PER_PAGE_MAX = 6;

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "ico"]);
const DOC_EXT = new Set(["pdf", "docx", "doc", "txt", "md", "rtf", "html", "htm", "pptx", "ppt", "key"]);

type ProbeFrame = {
  label: string;
  pageNumber: number | null;
  jpegBase64: string;
};

function fileExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function inferDocumentType(fileName: string, mime: string): string {
  const ext = fileExt(fileName);
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (IMAGE_EXT.has(ext) || mime.startsWith("image/")) return "imagen";
  if (["pptx", "ppt", "key"].includes(ext)) return "presentación";
  if (DOC_EXT.has(ext) || mime.startsWith("text/")) return "documento";
  return "desconocido";
}

async function resizeToJpegBase64(buffer: Buffer): Promise<string> {
  const jpeg = await sharp(buffer)
    .resize({
      width: PROBE_MAX_LONG_EDGE,
      height: PROBE_MAX_LONG_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: PROBE_JPEG_QUALITY })
    .toBuffer();
  return jpeg.toString("base64");
}

async function buildPdfProbeFrames(buffer: Buffer, pageNumbers: number[]): Promise<ProbeFrame[]> {
  const rendered = await renderPdfPagesAt(buffer, pageNumbers, { dpi: 96 });
  const frames: ProbeFrame[] = [];
  for (const page of rendered) {
    frames.push({
      label: `page_${page.pageNumber}`,
      pageNumber: page.pageNumber,
      jpegBase64: await resizeToJpegBase64(page.pngBuffer),
    });
  }
  return frames;
}

async function buildProbeFrames(
  buffer: Buffer,
  fileName: string,
  mime: string,
): Promise<{
  documentType: string;
  frames: ProbeFrame[];
  textSample: string;
  totalPdfPages: number | null;
}> {
  const documentType = inferDocumentType(fileName, mime);
  let textSample = "";

  try {
    const parsed = await parseBrainDocument(buffer, fileName, mime || "application/octet-stream");
    textSample = parsed.trim().slice(0, PROBE_TEXT_SAMPLE_CHARS);
  } catch {
    textSample = "";
  }

  if (documentType === "pdf") {
    const totalPages = await countPdfPagesInBuffer(buffer, 200).catch(() => PROBE_BRAND_PDF_PAGES);
    const pageNumbers = Array.from(
      { length: Math.min(PROBE_BRAND_PDF_PAGES, Math.max(1, totalPages)) },
      (_, index) => index + 1,
    );
    const frames = await buildPdfProbeFrames(buffer, pageNumbers);
    return { documentType, frames, textSample, totalPdfPages: totalPages };
  }

  if (documentType === "imagen") {
    const inline = await parseReferenceImageForGemini(
      `data:${mime || "image/png"};base64,${buffer.toString("base64")}`,
    ).catch(() => null);
    if (inline) {
      const jpegBase64 = await resizeToJpegBase64(Buffer.from(inline.data, "base64"));
      return {
        documentType,
        frames: [{ label: "image_1", pageNumber: null, jpegBase64 }],
        textSample,
        totalPdfPages: null,
      };
    }
  }

  return { documentType, frames: [], textSample, totalPdfPages: null };
}

function clamp01(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!match) return null;
  return `#${match[1]!.toLowerCase()}`;
}

function parseLegibility(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

function parseTypographyRole(value: unknown): GenomaDocumentProbeTypographyRole {
  if (value === "display" || value === "heading" || value === "body") return value;
  return "body";
}

function parseTypographyArray(raw: unknown): GenomaDocumentProbeTypography[] {
  if (!Array.isArray(raw)) return [];
  const rows: GenomaDocumentProbeTypography[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const family = typeof row.family === "string" ? row.family.trim().slice(0, 80) : "";
    if (!family) continue;
    rows.push({
      family,
      role: parseTypographyRole(row.role),
      evidence: typeof row.evidence === "string" ? row.evidence.trim().slice(0, 120) || null : null,
    });
    if (rows.length >= 4) break;
  }
  return rows;
}

const SIMILAR_LEGIBILITY_EPS = 0.1;

async function measureBackgroundLightness(
  jpegBase64: string,
  logo: Pick<GenomaDocumentProbeLogo, "x" | "y" | "width" | "height">,
): Promise<number> {
  const buffer = Buffer.from(jpegBase64, "base64");
  const meta = await sharp(buffer).metadata();
  const iw = meta.width ?? 1;
  const ih = meta.height ?? 1;

  const padX = logo.width * 0.22;
  const padY = logo.height * 0.22;
  const left = Math.max(0, Math.floor((logo.x - padX) * iw));
  const top = Math.max(0, Math.floor((logo.y - padY) * ih));
  const width = Math.max(1, Math.min(iw - left, Math.ceil((logo.width + padX * 2) * iw)));
  const height = Math.max(1, Math.min(ih - top, Math.ceil((logo.height + padY * 2) * ih)));

  const { data, info } = await sharp(buffer)
    .extract({ left, top, width, height })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const lumas: number[] = [];
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    lumas.push((0.299 * r + 0.587 * g + 0.114 * b) / 255);
  }
  if (!lumas.length) return 0.5;

  lumas.sort((a, b) => b - a);
  const topCount = Math.max(1, Math.floor(lumas.length * 0.35));
  const sum = lumas.slice(0, topCount).reduce((acc, value) => acc + value, 0);
  return sum / topCount;
}

async function enrichLogosWithBackgroundLightness(
  logos: GenomaDocumentProbeLogo[],
  frames: ProbeFrame[],
): Promise<GenomaDocumentProbeLogo[]> {
  const jpegByPage = new Map<number | null, string>();
  for (const frame of frames) jpegByPage.set(frame.pageNumber, frame.jpegBase64);

  return Promise.all(
    logos.map(async (logo) => {
      const jpeg = jpegByPage.get(logo.page) ?? jpegByPage.get(null);
      const backgroundLightness = jpeg
        ? await measureBackgroundLightness(jpeg, logo).catch(() => 0.5)
        : 0.5;
      return { ...logo, backgroundLightness };
    }),
  );
}

function resolvePrimaryLogo(logos: GenomaDocumentProbeLogo[]): GenomaDocumentProbeLogo | null {
  if (!logos.length) return null;

  const maxLegibility = Math.max(...logos.map((logo) => logo.legibility));
  const similarQuality = logos.filter(
    (logo) => logo.legibility >= maxLegibility - SIMILAR_LEGIBILITY_EPS,
  );
  const pool = similarQuality.length ? similarQuality : logos;

  return (
    [...pool].sort((a, b) => {
      const legDiff = b.legibility - a.legibility;
      if (Math.abs(legDiff) > 0.02) return legDiff;
      return b.backgroundLightness - a.backgroundLightness;
    })[0] ?? null
  );
}

function logoBboxKey(logo: GenomaDocumentProbeLogo): string {
  return `${logo.page ?? "img"}:${logo.x}:${logo.y}:${logo.width}:${logo.height}:${logo.label ?? ""}`;
}

async function refinePrimaryLogoBbox(
  logos: GenomaDocumentProbeLogo[],
  primaryLogo: GenomaDocumentProbeLogo | null,
  frames: ProbeFrame[],
): Promise<{ logos: GenomaDocumentProbeLogo[]; primaryLogo: GenomaDocumentProbeLogo | null }> {
  if (!primaryLogo) return { logos, primaryLogo };

  const jpeg =
    frames.find((frame) => frame.pageNumber === primaryLogo.page)?.jpegBase64 ??
    frames.find((frame) => frame.pageNumber === null)?.jpegBase64;
  if (!jpeg) return { logos, primaryLogo };

  const refined = await refineProbeLogoBboxFromBackground(jpeg, primaryLogo).catch(() => primaryLogo);
  const primaryKey = logoBboxKey(primaryLogo);
  const nextPrimary = { ...primaryLogo, ...refined };
  const nextLogos = logos.map((logo) =>
    logoBboxKey(logo) === primaryKey ? { ...logo, ...refined } : logo,
  );

  return { logos: nextLogos, primaryLogo: nextPrimary };
}

type NormalizedBbox = Pick<GenomaDocumentProbeLogo, "x" | "y" | "width" | "height">;

async function buildOtherImageThumbnail(
  jpegBase64: string,
  bbox: NormalizedBbox,
): Promise<string | null> {
  const buffer = Buffer.from(jpegBase64, "base64");
  const meta = await sharp(buffer).metadata();
  const iw = meta.width ?? 1;
  const ih = meta.height ?? 1;

  const left = Math.max(0, Math.floor(bbox.x * iw));
  const top = Math.max(0, Math.floor(bbox.y * ih));
  const width = Math.max(1, Math.min(iw - left, Math.ceil(bbox.width * iw)));
  const height = Math.max(1, Math.min(ih - top, Math.ceil(bbox.height * ih)));

  const thumb = await sharp(buffer)
    .extract({ left, top, width, height })
    .resize({
      width: OTHER_IMAGE_THUMB_MAX_EDGE,
      height: OTHER_IMAGE_THUMB_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: false,
    })
    .jpeg({ quality: 70 })
    .toBuffer();

  return thumb.toString("base64");
}

function parseOtherImagesArray(
  raw: unknown,
  max: number,
): Array<Omit<GenomaDocumentProbeOtherImage, "thumbnailBase64">> {
  if (!Array.isArray(raw)) return [];
  const otherImages: Array<Omit<GenomaDocumentProbeOtherImage, "thumbnailBase64">> = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const x = clamp01(row.x);
    const y = clamp01(row.y);
    const width = clamp01(row.width);
    const height = clamp01(row.height);
    const description =
      typeof row.description === "string" ? row.description.trim().slice(0, 200) : "";
    if (width <= 0 || height <= 0 || !description) continue;
    otherImages.push({
      page: typeof row.page === "number" && row.page >= 1 ? Math.round(row.page) : null,
      x,
      y,
      width,
      height,
      description,
    });
    if (otherImages.length >= max) break;
  }
  return otherImages;
}

async function enrichOtherImagesWithThumbnails(
  otherImages: Array<Omit<GenomaDocumentProbeOtherImage, "thumbnailBase64">>,
  frames: ProbeFrame[],
): Promise<GenomaDocumentProbeOtherImage[]> {
  const jpegByPage = new Map<number | null, string>();
  for (const frame of frames) jpegByPage.set(frame.pageNumber, frame.jpegBase64);

  return Promise.all(
    otherImages.map(async (image) => {
      const jpeg = jpegByPage.get(image.page) ?? jpegByPage.get(null);
      const thumbnailBase64 = jpeg
        ? await buildOtherImageThumbnail(jpeg, image).catch(() => null)
        : null;
      return { ...image, thumbnailBase64 };
    }),
  );
}

function parseProbeResponse(
  raw: unknown,
  fileName: string,
  fallbackType: string,
): Omit<
  GenomaDocumentProbeResult,
  | "latencyMs"
  | "model"
  | "pagePreviews"
  | "primaryLogo"
  | "otherImages"
  | "llmCallCount"
  | "pdfTotalPages"
> & {
  otherImages: Array<Omit<GenomaDocumentProbeOtherImage, "thumbnailBase64">>;
} {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const logos: GenomaDocumentProbeLogo[] = [];
  if (Array.isArray(o.logos)) {
    for (const entry of o.logos) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      const x = clamp01(row.x);
      const y = clamp01(row.y);
      const width = clamp01(row.width);
      const height = clamp01(row.height);
      if (width <= 0 || height <= 0) continue;
      logos.push({
        page: typeof row.page === "number" && row.page >= 1 ? Math.round(row.page) : null,
        x,
        y,
        width,
        height,
        label: typeof row.label === "string" ? row.label.trim().slice(0, 120) || null : null,
        isPrimary: row.isPrimary === true,
        legibility: parseLegibility(row.legibility),
        backgroundLightness: 0.5,
      });
    }
  }

  const primaryColors: GenomaDocumentProbeColor[] = [];
  if (Array.isArray(o.primaryColors)) {
    for (const entry of o.primaryColors) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      const hex = normalizeHex(row.hex);
      if (!hex) continue;
      primaryColors.push({
        hex,
        label: typeof row.label === "string" ? row.label.trim().slice(0, 60) || null : null,
      });
      if (primaryColors.length >= 5) break;
    }
  }

  const otherImages = parseOtherImagesArray(o.otherImages, OTHER_IMAGES_MAX_SHORT);
  const typography = parseTypographyArray(o.typography);

  const summaryRaw = Array.isArray(o.textSummary) ? o.textSummary : [];
  const textSummary: [string, string, string] = [
    typeof summaryRaw[0] === "string" ? summaryRaw[0].trim().slice(0, 240) : "",
    typeof summaryRaw[1] === "string" ? summaryRaw[1].trim().slice(0, 240) : "",
    typeof summaryRaw[2] === "string" ? summaryRaw[2].trim().slice(0, 240) : "",
  ];

  return {
    documentType:
      typeof o.documentType === "string" && o.documentType.trim()
        ? o.documentType.trim().slice(0, 40)
        : fallbackType,
    fileName,
    logos,
    primaryColors,
    typography,
    otherImages,
    textSummary,
  };
}

const PROBE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    documentType: { type: Type.STRING },
    logos: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          page: { type: Type.INTEGER, nullable: true },
          x: { type: Type.NUMBER },
          y: { type: Type.NUMBER },
          width: { type: Type.NUMBER },
          height: { type: Type.NUMBER },
          label: { type: Type.STRING, nullable: true },
          isPrimary: { type: Type.BOOLEAN },
          legibility: { type: Type.NUMBER },
        },
        required: ["x", "y", "width", "height", "isPrimary", "legibility"],
      },
    },
    primaryColors: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          hex: { type: Type.STRING },
          label: { type: Type.STRING, nullable: true },
        },
        required: ["hex"],
      },
    },
    textSummary: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    otherImages: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          page: { type: Type.INTEGER, nullable: true },
          x: { type: Type.NUMBER },
          y: { type: Type.NUMBER },
          width: { type: Type.NUMBER },
          height: { type: Type.NUMBER },
          description: { type: Type.STRING },
        },
        required: ["x", "y", "width", "height", "description"],
      },
    },
    typography: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          family: { type: Type.STRING },
          role: { type: Type.STRING },
          evidence: { type: Type.STRING, nullable: true },
        },
        required: ["family", "role"],
      },
    },
  },
  required: ["documentType", "logos", "primaryColors", "textSummary", "otherImages", "typography"],
};

const EXTENDED_OTHER_IMAGES_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    otherImages: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          page: { type: Type.INTEGER, nullable: true },
          x: { type: Type.NUMBER },
          y: { type: Type.NUMBER },
          width: { type: Type.NUMBER },
          height: { type: Type.NUMBER },
          description: { type: Type.STRING },
        },
        required: ["x", "y", "width", "height", "description"],
      },
    },
  },
  required: ["otherImages"],
};

function formatLogoExclusionHint(logos: GenomaDocumentProbeLogo[]): string {
  if (!logos.length) return "Ningún logo previo en las primeras páginas.";
  return logos
    .map((logo) => {
      const page = logo.page ? `pág. ${logo.page}` : "imagen";
      const label = logo.label ? ` (${logo.label})` : "";
      return `- ${page}${label}: x=${logo.x.toFixed(3)}, y=${logo.y.toFixed(3)}, w=${logo.width.toFixed(3)}, h=${logo.height.toFixed(3)}`;
    })
    .join("\n");
}

async function runExtendedOtherImagesProbe(input: {
  ai: GoogleGenAI;
  fileName: string;
  frames: ProbeFrame[];
  knownLogos: GenomaDocumentProbeLogo[];
  maxImages: number;
}): Promise<Array<Omit<GenomaDocumentProbeOtherImage, "thumbnailBase64">>> {
  const pageList = input.frames
    .map((frame) => `- ${frame.label}${frame.pageNumber ? ` (pág. ${frame.pageNumber})` : ""}`)
    .join("\n");

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    {
      text: [
        "Inventario visual de páginas adicionales de un PDF. Responde SOLO JSON según el schema.",
        `Archivo: ${input.fileName}`,
        `Páginas adjuntas:\n${pageList}`,
        "",
        "otherImages: fotografías, ilustraciones, diagramas o gráficos que NO sean logos ni iconos de marca.",
        `Máximo ${input.maxImages} entradas en total.`,
        `Hasta ${OTHER_IMAGES_PER_PAGE_MAX} imágenes distintas por página si hay varias.`,
        "page = número de página PDF (1-based). x, y, width, height: bbox normalizado 0–1.",
        "description: frase breve en español sobre qué hay en la imagen.",
        "NO repitas logos ya detectados en las primeras páginas:",
        formatLogoExclusionHint(input.knownLogos),
      ].join("\n"),
    },
  ];

  for (const frame of input.frames) {
    parts.push({ text: frame.label });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: frame.jpegBase64 } });
  }

  const response = await withGeminiRetries({
    run: async () =>
      input.ai.models.generateContent({
        model: PROBE_MODEL,
        contents: [{ role: "user", parts }],
        config: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: EXTENDED_OTHER_IMAGES_SCHEMA,
        },
      }),
  });

  const parsed = parseJsonObjectFromVisionModelText((response as { text?: string }).text ?? "");
  if (!parsed || typeof parsed !== "object") return [];
  const row = parsed as Record<string, unknown>;
  return parseOtherImagesArray(row.otherImages, input.maxImages);
}

export async function runGenomaDocumentProbe(input: {
  buffer: Buffer;
  fileName: string;
  mime: string;
}): Promise<GenomaDocumentProbeResult> {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY no configurada");

  const { documentType, frames, textSample, totalPdfPages } = await buildProbeFrames(
    input.buffer,
    input.fileName,
    input.mime,
  );

  const useExtendedImageScan =
    documentType === "pdf" && totalPdfPages != null && totalPdfPages > PROBE_BRAND_PDF_PAGES;

  const pageList = frames
    .map((frame) => `- ${frame.label}${frame.pageNumber ? ` (pág. ${frame.pageNumber})` : ""}`)
    .join("\n");

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    {
      text: [
        "Análisis rápido de material de marca. Responde SOLO JSON según el schema.",
        `Archivo: ${input.fileName}`,
        `Tipo detectado por servidor: ${documentType}`,
        frames.length ? `Imágenes adjuntas:\n${pageList}` : "Sin imágenes — usa solo el texto de muestra.",
        "",
        "logos: marcas/logotipos visibles. page = número de página PDF (1-based) o null en imágenes.",
        "x, y, width, height: bbox normalizado 0–1 (esquina superior izquierda + ancho/alto).",
        "isPrimary: true en EXACTAMENTE UN logo — el wordmark principal de la marca (el más legible y representativo). El resto isPrimary: false.",
        "legibility: 0–1 — qué tan claro y completo es ese logo (nitidez, sin recortes, wordmark legible).",
        "Si hay varias variantes del mismo logo con calidad parecida, el servidor prioriza la que tenga el fondo más claro.",
        "primaryColors: máximo 5 colores corporativos dominantes con hex #RRGGBB.",
        "typography: hasta 4 familias tipográficas visibles (display, heading o body) con evidencia breve.",
        "otherImages: fotografías, ilustraciones, diagramas o gráficos visibles que NO sean logos ni iconos de marca.",
        "otherImages: NO dupliques nada listado en logos[]. Excluye iconos pequeños de UI/app. Máximo 10 entradas.",
        "otherImages: page + bbox normalizado 0–1 (igual que logos) y description breve en español (qué hay en la imagen).",
        "textSummary: exactamente 3 líneas de resumen del contenido textual.",
        textSample ? `\nTexto extraído (muestra):\n${textSample}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];

  for (const frame of frames) {
    parts.push({ text: frame.label });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: frame.jpegBase64 } });
  }

  const ai = new GoogleGenAI({ apiKey });
  const started = Date.now();

  const response = await withGeminiRetries({
    run: async () =>
      ai.models.generateContent({
        model: PROBE_MODEL,
        contents: [{ role: "user", parts }],
        config: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: PROBE_RESPONSE_SCHEMA,
        },
      }),
  });

  let llmCallCount = 1;

  const parsed = parseJsonObjectFromVisionModelText((response as { text?: string }).text ?? "");
  if (!parsed) throw new Error("El modelo no devolvió un análisis válido del documento");

  const normalized = parseProbeResponse(parsed, input.fileName, documentType);
  const logos = await enrichLogosWithBackgroundLightness(normalized.logos, frames);
  let primaryLogo = resolvePrimaryLogo(logos);
  const refined = await refinePrimaryLogoBbox(logos, primaryLogo, frames);
  primaryLogo = refined.primaryLogo;

  const allFrames = [...frames];
  let mergedOtherImages = normalized.otherImages;

  if (useExtendedImageScan && totalPdfPages != null) {
    const extraPageNumbers = await selectPdfPagesForExtendedImageProbe(
      input.buffer,
      totalPdfPages,
    );
    if (extraPageNumbers.length) {
      const extraFrames = await buildPdfProbeFrames(input.buffer, extraPageNumbers);
      allFrames.push(...extraFrames);
      const slotsLeft = Math.max(0, OTHER_IMAGES_MAX_LONG - mergedOtherImages.length);
      if (slotsLeft > 0) {
        const extendedOtherImages = await runExtendedOtherImagesProbe({
          ai,
          fileName: input.fileName,
          frames: extraFrames,
          knownLogos: refined.logos,
          maxImages: slotsLeft,
        });
        llmCallCount = 2;
        mergedOtherImages = mergeOtherImageLists(
          mergedOtherImages,
          extendedOtherImages,
          OTHER_IMAGES_MAX_LONG,
        );
      }
    }
  }

  const otherImages = await enrichOtherImagesWithThumbnails(mergedOtherImages, allFrames);

  return {
    ...normalized,
    logos: refined.logos,
    primaryLogo,
    otherImages,
    pagePreviews: frames.map((frame) => ({
      pageNumber: frame.pageNumber,
      jpegBase64: frame.jpegBase64,
    })),
    latencyMs: Date.now() - started,
    model: PROBE_MODEL,
    llmCallCount,
    pdfTotalPages: totalPdfPages,
  };
}
