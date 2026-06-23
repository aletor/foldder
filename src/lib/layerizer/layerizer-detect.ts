/**
 * Layerizer — Paso A: detección de objetos con Gemini vision (JSON estructurado).
 *
 * Pre-pago (Estado 1). Devuelve los objetos principales con bbox en px del master,
 * label semántico, isText (OCR) y score. No segmenta ni recorta: solo localiza.
 */

import { parseReferenceImageForGemini } from "@/lib/parse-reference-image";
import type { DetectedObject } from "@/app/spaces/layerizer/layerizer-types";

const DETECT_MODEL = "gemini-2.5-flash";

interface GeminiDetectedRaw {
  label?: unknown;
  isText?: unknown;
  is_text?: unknown;
  score?: unknown;
  /** Formato nativo Gemini: [ymin, xmin, ymax, xmax] normalizado 0..1000. */
  box_2d?: unknown;
  /** Legado/alternativo: [x, y, w, h] normalizado 0..1 (o px). */
  bbox?: unknown;
}

/** Clases que SIEMPRE deben tratarse como sujeto de máxima prioridad. */
const HIGH_PRIORITY_CLASS = /\b(person|people|persona|hombre|mujer|ni[ñn][oa]|child|man|woman|girl|boy|human|car|coche|veh[íi]culo|vehicle|truck|cami[óo]n|bus|moto|motorcycle|bike|bicicleta|dog|cat|perro|gato|animal|horse|caballo|bird|p[áa]jaro)\b/i;

function classWeight(label: string): number {
  return HIGH_PRIORITY_CLASS.test(label) ? 1_000_000 : 1;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function finalizeBox(
  x: number,
  y: number,
  w: number,
  h: number,
  width: number,
  height: number,
): [number, number, number, number] | null {
  x = Math.round(Math.max(0, Math.min(width, x)));
  y = Math.round(Math.max(0, Math.min(height, y)));
  w = Math.round(Math.max(1, Math.min(width - x, w)));
  h = Math.round(Math.max(1, Math.min(height - y, h)));
  if (w <= 0 || h <= 0) return null;
  return [x, y, w, h];
}

/** Expande un bbox un % por lado (Gemini suele recortar justo el borde del objeto). */
function padBox(
  box: [number, number, number, number],
  width: number,
  height: number,
  frac = 0.02,
): [number, number, number, number] {
  const [x, y, w, h] = box;
  const px = w * frac;
  const py = h * frac;
  return (
    finalizeBox(x - px, y - py, w + px * 2, h + py * 2, width, height) ?? box
  );
}

/** box_2d nativo de Gemini: [ymin, xmin, ymax, xmax] en 0..1000 → [x,y,w,h] px. */
function box2dToPx(
  raw: unknown,
  width: number,
  height: number,
): [number, number, number, number] | null {
  if (!Array.isArray(raw) || raw.length < 4) return null;
  const [ymin, xmin, ymax, xmax] = raw.slice(0, 4).map((v) => Number(v));
  if (![ymin, xmin, ymax, xmax].every(Number.isFinite)) return null;
  const x = (xmin / 1000) * width;
  const y = (ymin / 1000) * height;
  const w = ((xmax - xmin) / 1000) * width;
  const h = ((ymax - ymin) / 1000) * height;
  return finalizeBox(x, y, w, h, width, height);
}

/** Formato alternativo [x, y, w, h] (normalizado 0..1, escala 0..1000, o px). */
function toPxBbox(
  raw: unknown,
  width: number,
  height: number,
): [number, number, number, number] | null {
  if (!Array.isArray(raw) || raw.length < 4) return null;
  const nums = raw.slice(0, 4).map((v) => Number(v));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const looksNormalized = nums.every((n) => n >= 0 && n <= 1.5);
  const looksThousand = nums.some((n) => n > 1.5) && nums.every((n) => n <= 1000);
  let [x, y, w, h] = nums;
  if (looksNormalized) {
    x *= width;
    y *= height;
    w *= width;
    h *= height;
  } else if (looksThousand) {
    x = (x / 1000) * width;
    y = (y / 1000) * height;
    w = (w / 1000) * width;
    h = (h / 1000) * height;
  }
  return finalizeBox(x, y, w, h, width, height);
}

function extractJsonArray(text: string): unknown[] {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      const objects = (parsed as { objects?: unknown }).objects;
      if (Array.isArray(objects)) return objects;
    }
  } catch {
    // intento de rescate: buscar el primer array en el texto
    const start = trimmed.indexOf("[");
    const end = trimmed.lastIndexOf("]");
    if (start !== -1 && end > start) {
      try {
        const parsed = JSON.parse(trimmed.slice(start, end + 1));
        if (Array.isArray(parsed)) return parsed;
      } catch {
        /* noop */
      }
    }
  }
  return [];
}

export interface DetectObjectsResult {
  objects: DetectedObject[];
  width: number;
  height: number;
  usageMetadata?: unknown;
}

/**
 * Detecta objetos en el master. `image` puede ser data URL, URL http(s) o key S3.
 * `width`/`height` en px del master (obligatorios para convertir bbox normalizado).
 */
export async function detectObjectsWithGemini(input: {
  image: string;
  width: number;
  height: number;
  baseUrl?: string | URL;
  maxObjects?: number;
  /** Incluir bloques de texto/carteles como objetos (por defecto false: son ruido). */
  includeText?: boolean;
  /**
   * "auto" (default): detección global PLANA de los pocos objetos más salientes
   * de la escena (cualquier tipo; personas primero). Rápida y barata.
   * "local": análisis inclusivo y PLANO de una región seleccionada por el usuario.
   * "text": bloques de tipografía/gráfico del diseño (titulares, marcadores, etc.).
   */
  mode?: "auto" | "local" | "text";
  /** Bytes del master ya resueltos (evita re-descargar URLs autenticadas como /api/spaces/s3-file). */
  imageBuffer?: Buffer;
  imageMimeType?: string;
}): Promise<DetectObjectsResult> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const parsed = input.imageBuffer
    ? { mimeType: input.imageMimeType || "image/png", data: input.imageBuffer.toString("base64") }
    : await parseReferenceImageForGemini(input.image, { baseUrl: input.baseUrl });
  if (!parsed) throw new Error("Could not parse image for detection");

  const maxObjects = input.maxObjects ?? (input.mode === "text" ? 8 : 5);
  const includeText = input.includeText ?? false;
  const mode = input.mode ?? "auto";
  const isLocal = mode === "local";
  const isTextMode = mode === "text";

  const autoPrompt = [
    "You are a precise object detector for an image layer-extraction tool.",
    "Return the FEW most OBVIOUS, salient foreground objects of the scene — the things a person would name first when describing the image (e.g. for a woman sitting at a table with a cup: woman, table, cup).",
    "Detect objects of ANY kind: people, animals, vehicles, furniture (table, chair), and distinct standalone props/products (a cup, a bottle, a bag, an instrument).",
    "EXCLUDE: flat background surfaces (wall, floor, ground, sky, road), seating booths / background structures, and text / signs / logos / posters.",
    "Detect WHOLE objects only; never break an object into its parts.",
    `Return AT MOST ${maxObjects} objects, the most prominent first. Fewer is better.`,
    "box_2d is the 2D bounding box as EXACTLY four integers [ymin, xmin, ymax, xmax], each normalized to 0..1000 of the WHOLE image. Never output 3D boxes or more than four numbers.",
    "isText = true only for readable text/typography/logos. score = confidence 0..1.",
  ].join("\n");

  const localPrompt = [
    "You are a precise object detector. This image is a CROPPED REGION that the user deliberately selected.",
    "Detect EVERY distinct concrete object actually visible in this region, each as a SEPARATE object.",
    "INCLUDE anything physical: furniture (tables, stalls, chairs, baskets), products, goods, produce, items, tools, vehicles, animals, and people — whatever is present.",
    "Do NOT exclude things for being 'background': the user explicitly selected this region because they want what is inside it.",
    "EXCLUDE only: empty sky, and flat ground/road/wall with nothing on it.",
    `Return AT MOST ${maxObjects} objects, the largest / most complete first.`,
    "box_2d is the 2D bounding box as EXACTLY four integers [ymin, xmin, ymax, xmax], each normalized to 0..1000 of THIS image. Never output 3D boxes or more than four numbers.",
    "isText = true only for readable text/typography/logos. score = confidence 0..1.",
  ].join("\n");

  const textPrompt = [
    "You are a precise typography and graphic-text detector for an image layer-extraction tool.",
    "Detect DISTINCT READABLE TEXT BLOCKS used as graphic design overlays on the image.",
    "INCLUDE: headlines and display type (player names, WINNER, titles), scoreboards / score tables, subtitles, captions, vertical side text (e.g. event name along an edge), watermarks with readable letters.",
    "Each block = ONE layer: the whole scoreboard as one box, the whole headline as one box, each major text element separate.",
    "EXCLUDE: tiny illegible text, text printed on clothing or objects (brand on a cap), pure image logos without readable letters, and physical objects (people, balls, rackets).",
    `Return AT MOST ${maxObjects} text blocks, largest / most prominent first.`,
    "box_2d is the 2D bounding box as EXACTLY four integers [ymin, xmin, ymax, xmax], each normalized to 0..1000 of the WHOLE image. Tightly wrap the visible text block.",
    "isText MUST be true for every item. score = confidence 0..1.",
  ].join("\n");

  const prompt = isTextMode ? textPrompt : isLocal ? localPrompt : autoPrompt;

  const boxSchema = { type: "ARRAY", items: { type: "INTEGER" }, minItems: 4, maxItems: 4 };
  const responseSchema = {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: {
        label: { type: "STRING" },
        box_2d: boxSchema,
        isText: { type: "BOOLEAN" },
        score: { type: "NUMBER" },
      },
      required: ["label", "box_2d", "isText", "score"],
      propertyOrdering: ["label", "box_2d", "isText", "score"],
    },
  };

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${DETECT_MODEL}:generateContent`;
  const requestBody = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { mime_type: parsed.mimeType, data: parsed.data } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
      temperature: 0.1,
      // gemini-2.5-flash necesita "thinking" activado para no caer en bucles
      // degenerados (repetición de coordenadas). Damos presupuesto amplio para
      // que quepan razonamiento + JSON (uso real ~1.3k tokens; se factura lo usado).
      maxOutputTokens: 16384,
    },
  });

  // Gemini devuelve 500/503 transitorios con cierta frecuencia: reintentar con backoff.
  const RETRYABLE = new Set([429, 500, 502, 503, 504]);
  const MAX_ATTEMPTS = 3;
  let res: Response | null = null;
  let lastErr = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: requestBody,
        signal: AbortSignal.timeout(40000),
      });
    } catch (err) {
      // Error de red/timeout: reintentable.
      lastErr = err instanceof Error ? err.message : String(err);
      res = null;
    }
    if (res && res.ok) break;
    if (res && !RETRYABLE.has(res.status)) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Gemini detect failed: ${res.status} ${errText.slice(0, 200)}`);
    }
    if (res) lastErr = `${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`;
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 600 * 2 ** (attempt - 1))); // 600ms, 1200ms
    }
  }

  if (!res || !res.ok) {
    throw new Error(`Gemini detect failed tras ${MAX_ATTEMPTS} intentos: ${lastErr}`);
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: unknown;
  };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ?? "";
  const rawArray = extractJsonArray(text);

  // Descarta ruido: diminutos, baja confianza y (por defecto) texto de entorno.
  const imageArea = Math.max(1, input.width * input.height);
  const MIN_AREA_FRACTION = isTextMode ? 0.003 : isLocal ? 0.004 : 0.012;
  const MIN_SCORE = isTextMode ? 0.25 : isLocal ? 0.2 : 0.3;

  const parseOne = (
    raw: GeminiDetectedRaw,
  ): { label: string; bbox: [number, number, number, number]; isText: boolean; score: number } | null => {
    const bbox = box2dToPx(raw.box_2d, input.width, input.height) ?? toPxBbox(raw.bbox, input.width, input.height);
    if (!bbox) return null;
    const isText = raw.isText === true || raw.is_text === true;
    const label = typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : "Objeto";
    const score = clamp01(Number(raw.score ?? 0.8));
    return { label, bbox, isText, score };
  };

  // Sesgo suave de primer plano (cajas bajas) y centralidad (cerca del centro).
  const positionWeight = (bbox: [number, number, number, number]): number => {
    const cx = (bbox[0] + bbox[2] / 2) / input.width;
    const bottom = (bbox[1] + bbox[3]) / input.height;
    const central = 1 - 0.3 * Math.min(1, Math.abs(cx - 0.5) * 2); // 1 centro .. 0.7 borde
    const foreground = 0.7 + 0.3 * Math.min(1, bottom); // 0.7 arriba .. 1.0 abajo
    return central * foreground;
  };

  // Saliencia: tamaño · confianza · clase (personas primero) · posición.
  const saliency = (c: { bbox: [number, number, number, number]; score: number; label: string }) =>
    c.bbox[2] * c.bbox[3] * (0.5 + c.score) * classWeight(c.label) * positionWeight(c.bbox);

  // Parseo PLANO: un objeto por detección, sin jerarquía de partes.
  const candidates: Array<{
    label: string;
    bbox: [number, number, number, number];
    isText: boolean;
    score: number;
  }> = [];
  for (const rawUnknown of rawArray) {
    const parsed = parseOne(rawUnknown as GeminiDetectedRaw);
    if (!parsed) continue;
    if (parsed.isText && !includeText && !isTextMode) continue;
    if (isTextMode) parsed.isText = true;
    if (parsed.score < MIN_SCORE) continue;
    if ((parsed.bbox[2] * parsed.bbox[3]) / imageArea < MIN_AREA_FRACTION) continue;
    candidates.push(parsed);
  }

  // Orden: local por tamaño; texto por área; auto por saliencia.
  candidates.sort((a, b) =>
    isLocal || isTextMode
      ? b.bbox[2] * b.bbox[3] - a.bbox[2] * a.bbox[3]
      : saliency(b) - saliency(a),
  );

  const prefix = isLocal ? "det_l" : isTextMode ? "det_t" : "det_s";
  const objects: DetectedObject[] = candidates.slice(0, maxObjects).map((c, i) => ({
    id: `${prefix}${i}_${Math.random().toString(36).slice(2, 8)}`,
    label: c.label,
    bbox: padBox(c.bbox, input.width, input.height, isTextMode ? 0.01 : 0.02),
    isText: isTextMode ? true : c.isText,
    score: c.score,
    ...(isLocal ? { manual: true } : {}),
  }));

  return { objects, width: input.width, height: input.height, usageMetadata: json.usageMetadata };
}
