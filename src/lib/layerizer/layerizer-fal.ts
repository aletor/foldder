/**
 * Layerizer — host fal.ai (M7): BiRefNet v2 en el recorte + SAM 3.1 opcional en preview.
 *
 * Extracción: NO usa SAM en imagen completa (data URLs grandes fallan). Recorta al bbox
 * de detección y aplica BiRefNet; si falla → Replicate (851-labs) sobre el mismo crop.
 */

import sharp from "sharp";
import type { DetectedObject, SamPrompt } from "@/app/spaces/layerizer/layerizer-types";
import type { SegmentMatteInput, SegmentMatteResult } from "@/lib/layerizer/layerizer-providers";
import { LAYERIZER_PROVIDER_ENDPOINTS } from "@/lib/layerizer/layerizer-config";
import {
  clampBox,
  expandBox,
  finalizeSegment,
  hasMeaningfulTransparency,
  largestComponentBBox,
  matteOutputToRgba,
} from "@/lib/layerizer/layerizer-matte-utils";
import {
  matteCropWithReplicate,
  resolveSegmentBbox,
  SEGMENT_CROP_EXPAND,
} from "@/lib/layerizer/layerizer-extract-core";

const FAL_SYNC_BASE = "https://fal.run";

function falKey(): string {
  const key = process.env.FAL_KEY || process.env.FAL_API_KEY;
  if (!key) throw new Error("FAL_KEY not configured");
  return key;
}

async function falRun<T = Record<string, unknown>>(
  model: string,
  input: Record<string, unknown>,
  timeoutMs = 90000,
): Promise<T> {
  const res = await fetch(`${FAL_SYNC_BASE}/${model}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${falKey()}` },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`fal ${model} failed: ${res.status} ${t.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

function firstImageUrl(obj: unknown): string | null {
  if (!obj) return null;
  if (typeof obj === "string") {
    return /^https?:\/\//.test(obj) || obj.startsWith("data:image") ? obj : null;
  }
  if (Array.isArray(obj)) {
    for (const it of obj) {
      const u = firstImageUrl(it);
      if (u) return u;
    }
    return null;
  }
  if (typeof obj === "object") {
    const rec = obj as Record<string, unknown>;
    for (const k of ["mask_image", "combined_mask", "mask", "image", "url"]) {
      if (k in rec) {
        const u = firstImageUrl(rec[k]);
        if (u) return u;
      }
    }
    for (const v of Object.values(rec)) {
      const u = firstImageUrl(v);
      if (u) return u;
    }
  }
  return null;
}

async function downloadBuffer(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) {
    const b64 = url.slice(url.indexOf(",") + 1);
    return Buffer.from(b64, "base64");
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`fal asset download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function toDataUrl(buf: Buffer): string {
  return `data:image/png;base64,${buf.toString("base64")}`;
}

function samInputFromPrompt(imageUrl: string, prompt: SamPrompt): Record<string, unknown> {
  const base = { image_url: imageUrl, apply_mask: false, output_format: "png" };
  if (prompt.kind === "text") return { ...base, prompt: prompt.text };
  if (prompt.kind === "box") {
    const [x, y, w, h] = prompt.box;
    return { ...base, box_prompts: [{ x_min: x, y_min: y, x_max: x + w, y_max: y + h }] };
  }
  return { ...base, point_prompts: prompt.points.map((p) => ({ x: p.x, y: p.y, label: p.label })) };
}

/** Lado máximo (px) al que se reduce el master antes de mandarlo a SAM (refine). */
const SAM_REFINE_MAX_SIDE = 1024;

/**
 * SAM 3.1 grounded por TEXTO. Devuelve la máscara grayscale (W×H) del concepto, o null.
 * `imageDataUrl` puede ser una versión REDUCIDA del master: SAM trabaja a esa resolución
 * y la máscara se reescala a W×H (las bboxes resultantes son igual de válidas, y la
 * subida/inferencia es mucho más rápida).
 */
async function samTextMask(
  imageDataUrl: string,
  label: string,
  width: number,
  height: number,
): Promise<Buffer | null> {
  try {
    const out = await falRun<{ masks?: Array<{ url?: string }>; image?: { url?: string } }>(
      LAYERIZER_PROVIDER_ENDPOINTS.fal.segment,
      { image_url: imageDataUrl, prompt: label, apply_mask: false, output_format: "png" },
      60000,
    );
    const maskUrl = out.masks?.[0]?.url || out.image?.url || firstImageUrl(out);
    if (!maskUrl) return null;
    const raw = await downloadBuffer(maskUrl);
    return await sharp(raw).resize(width, height, { fit: "fill" }).grayscale().png().toBuffer();
  } catch (err) {
    console.warn(`[layerizer:fal] SAM text grounding failed for "${label}":`, err);
    return null;
  }
}

/** PNG del master reducido a SAM_REFINE_MAX_SIDE de lado mayor (o tal cual si ya es pequeño). */
async function encodeForSamRefine(master: Buffer, width: number, height: number): Promise<string> {
  const longest = Math.max(width, height);
  const pipe =
    longest > SAM_REFINE_MAX_SIDE
      ? sharp(master).resize(SAM_REFINE_MAX_SIDE, SAM_REFINE_MAX_SIDE, { fit: "inside" })
      : sharp(master);
  return toDataUrl(await pipe.png().toBuffer());
}

export async function runFalSamTextMask(
  master: Buffer,
  label: string,
  width: number,
  height: number,
): Promise<Buffer | null> {
  return samTextMask(await encodeForSamRefine(master, width, height), label, width, height);
}

/**
 * Afina los bounds de la detección de Gemini usando SAM 3.1 grounded por texto.
 * Gemini acierta QUÉ objetos son relevantes pero localiza mal (sobre todo objetos
 * pequeños/especulares); SAM con la etiqueta da la caja precisa. Conserva la caja de
 * Gemini como fallback si SAM falla o devuelve ruido. Las llamadas van en paralelo y
 * comparten una única versión reducida del master (menos subida e inferencia).
 */
export async function refineDetectedBoxesWithSamText(
  master: Buffer,
  width: number,
  height: number,
  objects: DetectedObject[],
): Promise<DetectedObject[]> {
  if (objects.length === 0) return objects;
  const imageArea = Math.max(1, width * height);
  const imageDataUrl = await encodeForSamRefine(master, width, height);
  return Promise.all(
    objects.map(async (obj) => {
      const mask = await samTextMask(imageDataUrl, obj.label, width, height);
      if (!mask) return obj;
      const bb = await largestComponentBBox(mask, width, height);
      if (!bb) return obj;
      if ((bb[2] * bb[3]) / imageArea < 0.0005) return obj; // blob diminuto = ruido
      // Pequeño margen (1.5%) y clamp a la imagen.
      const px = bb[2] * 0.015;
      const py = bb[3] * 0.015;
      const bbox = clampBox([bb[0] - px, bb[1] - py, bb[2] + 2 * px, bb[3] + 2 * py], width, height);
      return { ...obj, bbox };
    }),
  );
}

/** SAM 3.1 sobre un recorte pequeño (preview). Coordenadas del prompt son relativas al crop. */
export async function runFalSamMaskOnCrop(
  cropDataUrl: string,
  prompt: SamPrompt,
  cropW: number,
  cropH: number,
): Promise<Buffer> {
  const out = await falRun<{ masks?: Array<{ url?: string }>; image?: { url?: string } }>(
    LAYERIZER_PROVIDER_ENDPOINTS.fal.segment,
    samInputFromPrompt(cropDataUrl, prompt),
  );
  const maskUrl = out.masks?.[0]?.url || out.image?.url || firstImageUrl(out);
  if (!maskUrl) throw new Error("fal SAM returned no mask");
  const raw = await downloadBuffer(maskUrl);
  return sharp(raw).resize(cropW, cropH, { fit: "fill" }).grayscale().png().toBuffer();
}

async function runFalBirefnetRgba(cropDataUrl: string): Promise<Buffer> {
  const out = await falRun<{ image?: { url?: string } }>(LAYERIZER_PROVIDER_ENDPOINTS.fal.matting, {
    image_url: cropDataUrl,
    model: "General Use (Light)",
    refine_foreground: true,
    output_format: "png",
  });
  const imageUrl = out.image?.url || firstImageUrl(out);
  if (!imageUrl) throw new Error("fal BiRefNet returned no image");
  return downloadBuffer(imageUrl);
}

export async function matteCropWithBirefnet(
  cropBuf: Buffer,
  bw: number,
  bh: number,
): Promise<{ rgba: Buffer; mask: Buffer }> {
  const cropDataUrl = toDataUrl(cropBuf);
  const birefOut = await runFalBirefnetRgba(cropDataUrl);
  const result = await matteOutputToRgba(birefOut, cropBuf, bw, bh);
  if (!(await hasMeaningfulTransparency(result.rgba))) {
    throw new Error("BiRefNet matting produced no transparency");
  }
  return result;
}

/**
 * Extracción fal: bbox → recorte → BiRefNet (o Replicate si falla).
 * Sin SAM en imagen completa (evita máscaras rectangulares y data URLs enormes).
 */
export async function segmentAndMatteFal(input: SegmentMatteInput): Promise<SegmentMatteResult> {
  const { master, width, height } = input;
  const detBox = resolveSegmentBbox(input.prompt, input.fallbackBbox, width, height);
  const cropBox = expandBox(detBox, width, height, SEGMENT_CROP_EXPAND);
  const [bx, by, bw, bh] = cropBox;
  const cropBuf = await sharp(master).extract({ left: bx, top: by, width: bw, height: bh }).png().toBuffer();

  let rgba: Buffer;
  try {
    ({ rgba } = await matteCropWithBirefnet(cropBuf, bw, bh));
  } catch (birefErr) {
    console.warn("[layerizer:fal] BiRefNet failed, falling back to Replicate:", birefErr);
    ({ rgba } = await matteCropWithReplicate(cropBuf, bw, bh));
  }

  return finalizeSegment({ master, width, height, cropBox, rgba });
}
