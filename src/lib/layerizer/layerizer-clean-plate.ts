/**
 * Layerizer — Paso D: fondo limpio (generativo, Gemini image edit / Nano Banana).
 * UNA sola llamada. Tapa las zonas de los objetos seleccionados y reconstruye fondo.
 *
 * Dos métodos detrás de flag (§7 ⚠️ a verificar):
 * - 'mask': envía el master + máscara unión; "rellena exactamente estas zonas".
 * - 'describe': referencia espacial por bbox; "el objeto de la izquierda…".
 * En M2 implementamos 'mask'; 'describe' llega en M5.
 */

import sharp from "sharp";
import type { LayerizerCleanPlateMethod } from "@/app/spaces/layerizer/layerizer-types";
import { applyMaskAsAlpha } from "@/lib/layerizer/layerizer-matte-utils";

const IMAGE_MODEL = "gemini-2.5-flash-image";

interface CleanPlateArgs {
  master: Buffer;
  width: number;
  height: number;
  /** Máscaras grayscale (resolución master) de los objetos a tapar. */
  masks: Buffer[];
  /** Etiquetas + bbox para el método `describe` (referencia espacial). */
  regions: Array<{ label: string; bbox: [number, number, number, number]; isText?: boolean }>;
  method: LayerizerCleanPlateMethod;
}

/** Une varias máscaras grayscale en una sola (lighten = OR de blancos). */
async function unionMasks(masks: Buffer[], width: number, height: number): Promise<Buffer> {
  let canvas = sharp({
    create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } },
  });
  const overlays = await Promise.all(
    masks.map(async (m) => ({
      input: await sharp(m).resize(width, height, { fit: "fill" }).toColourspace("b-w").toBuffer(),
      blend: "lighten" as const,
    })),
  );
  canvas = canvas.composite(overlays);
  return canvas.grayscale().png().toBuffer();
}

/**
 * Crece la zona blanca de la máscara unos píxeles (blur + threshold) para cubrir
 * bordes finos, contornos y sombras de contacto del objeto al borrarlo.
 */
async function dilateMask(mask: Buffer, width: number, height: number, px: number): Promise<Buffer> {
  const gray = await sharp(mask).resize(width, height, { fit: "fill" }).grayscale().toBuffer();
  return sharp(gray)
    .blur(Math.max(0.5, px))
    .threshold(24)
    .toColourspace("b-w")
    .png()
    .toBuffer();
}

/**
 * Pinta de magenta sólido (#FF00FF) las zonas a eliminar sobre el master. Es la señal
 * visual más fiable para que el editor generativo borre e inpinte exactamente ahí.
 */
async function markRemovalRegions(master: Buffer, unionMask: Buffer, width: number, height: number): Promise<Buffer> {
  const magentaRgb = await sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 0, b: 255 } },
  })
    .png()
    .toBuffer();
  // Magenta donde la máscara es blanca, transparente en el resto.
  const magentaRgba = await applyMaskAsAlpha(magentaRgb, unionMask, width, height);
  return sharp(master)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .composite([{ input: magentaRgba, blend: "over" }])
    .png()
    .toBuffer();
}

function describePrompt(regions: CleanPlateArgs["regions"], width: number, height: number): string {
  const refs = regions.map((r) => {
    const [x, y, w, h] = r.bbox;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const hx = cx < width / 3 ? "left" : cx > (2 * width) / 3 ? "right" : "center";
    const vy = cy < height / 3 ? "top" : cy > (2 * height) / 3 ? "bottom" : "middle";
    return `the ${r.label} at the ${vy}-${hx}`;
  });
  return refs.join(", ");
}

async function callGeminiImageEdit(images: Buffer[], prompt: string): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent`;
  const parts: unknown[] = images.map((b) => ({
    inline_data: { mime_type: "image/png", data: b.toString("base64") },
  }));
  parts.push({ text: prompt });

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ contents: [{ role: "user", parts }] }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Gemini clean plate failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inline_data?: { data?: string }; inlineData?: { data?: string } }> } }>;
  };
  const partsOut = json.candidates?.[0]?.content?.parts ?? [];
  for (const p of partsOut) {
    const data = p.inline_data?.data || p.inlineData?.data;
    if (data) return Buffer.from(data, "base64");
  }
  throw new Error("Gemini clean plate returned no image");
}

/** Genera el fondo limpio. Devuelve PNG a resolución del master. */
export async function generateCleanPlate(args: CleanPlateArgs): Promise<Buffer> {
  const { master, width, height } = args;
  const union = await unionMasks(args.masks, width, height);
  // Dilatación proporcional al tamaño (mín. 4px) para tragar contornos y sombras.
  const dilatePx = Math.max(4, Math.round(Math.min(width, height) * 0.012));
  const dilated = await dilateMask(union, width, height, dilatePx);
  const refs = describePrompt(args.regions, width, height);

  // Las zonas a eliminar se pintan de magenta sólido: la señal más robusta para inpaint.
  const marked = await markRemovalRegions(master, dilated, width, height);

  const hasText = args.regions.some((r) => r.isText);
  const textNote = hasText
    ? " For typography/text blocks: erase every letter completely — no ghost text, halos or outlines. Fill with the photo/gradient/court behind the text."
    : "";

  const prompt = [
    "This image has some objects painted over with solid magenta (#FF00FF):",
    refs + ".",
    "Task: erase those objects completely and rebuild a clean, photorealistic background exactly where the magenta is.",
    "Fill every magenta pixel by naturally extending the surrounding scene (walls, seating, table, floor, court, sky, gradients, etc.) with matching colors, lighting, perspective, texture and film grain.",
    "Also remove any shadows or reflections those objects cast on nearby surfaces.",
    textNote,
    "Do NOT leave any magenta. Do NOT add new objects, people, text or watermarks. Keep every non-magenta pixel identical.",
    "Return the full edited image at the same resolution.",
  ]
    .filter(Boolean)
    .join(" ");

  const generated = await callGeminiImageEdit([marked], prompt);
  // Normaliza a la resolución del master (Gemini puede devolver otro tamaño).
  return sharp(generated).resize(width, height, { fit: "fill" }).png().toBuffer();
}
