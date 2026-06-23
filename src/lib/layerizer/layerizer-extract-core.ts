/**
 * Layerizer — extracción por bbox: recorte del master + matting (alfa real).
 * Compartido por Replicate (default) y fallback de fal.
 */

import sharp from "sharp";
import type { SamPrompt } from "@/app/spaces/layerizer/layerizer-types";
import type { SegmentMatteInput, SegmentMatteResult } from "@/lib/layerizer/layerizer-providers";
import { runReplicateMatteMask } from "@/lib/layerizer/layerizer-replicate";
import {
  clampBox,
  expandBox,
  finalizeSegment,
  hasMeaningfulTransparency,
  matteOutputToRgba,
} from "@/lib/layerizer/layerizer-matte-utils";

function boxFromPoint(
  points: Array<{ x: number; y: number; label: 0 | 1 }>,
  width: number,
  height: number,
): [number, number, number, number] {
  const pos = points.find((p) => p.label === 1) ?? points[0];
  const side = Math.round(Math.min(width, height) * 0.3);
  return clampBox([pos.x - side / 2, pos.y - side / 2, side, side], width, height);
}

export function resolveSegmentBbox(
  prompt: SamPrompt,
  fallbackBbox: [number, number, number, number] | undefined,
  width: number,
  height: number,
): [number, number, number, number] {
  if (prompt.kind === "box") return clampBox(prompt.box, width, height);
  if (fallbackBbox) return clampBox(fallbackBbox, width, height);
  if (prompt.kind === "point") return boxFromPoint(prompt.points, width, height);
  throw new Error("segmentAndMatte requires a box or a fallback bbox");
}

/** Matting Replicate 851-labs sobre el recorte del bbox (pixel-exacto vía canal alfa). */
export async function matteCropWithReplicate(
  cropBuf: Buffer,
  bw: number,
  bh: number,
): Promise<{ rgba: Buffer; mask: Buffer }> {
  const cropDataUrl = `data:image/png;base64,${cropBuf.toString("base64")}`;
  const matteOut = await runReplicateMatteMask(cropDataUrl, 0.9);
  const result = await matteOutputToRgba(matteOut, cropBuf, bw, bh);
  if (!(await hasMeaningfulTransparency(result.rgba))) {
    throw new Error("Replicate matting produced no transparency");
  }
  return result;
}

/** Margen de recorte para no cortar extremidades (manos/pies que se salen del bbox). */
export const SEGMENT_CROP_EXPAND = 0.12;

/** Extracción de bloque tipográfico: recorte rectangular + máscara sólida para el fondo limpio. */
export async function segmentTextBlock(input: SegmentMatteInput): Promise<SegmentMatteResult> {
  const { master, width, height } = input;
  const detBox = resolveSegmentBbox(input.prompt, input.fallbackBbox, width, height);
  const bbox = clampBox(detBox, width, height);
  const [bx, by, bw, bh] = bbox;

  const rgba = await sharp(master).extract({ left: bx, top: by, width: bw, height: bh }).png().toBuffer();
  const whiteTile = await sharp({
    create: { width: bw, height: bh, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .png()
    .toBuffer();
  const fullMask = await sharp({
    create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([{ input: whiteTile, left: bx, top: by }])
    .grayscale()
    .png()
    .toBuffer();

  return { rgba, mask: fullMask, bbox };
}

export async function segmentAndMatte(input: SegmentMatteInput): Promise<SegmentMatteResult> {
  const { master, width, height } = input;
  const detBox = resolveSegmentBbox(input.prompt, input.fallbackBbox, width, height);
  const cropBox = expandBox(detBox, width, height, SEGMENT_CROP_EXPAND);
  const [bx, by, bw, bh] = cropBox;

  const cropBuf = await sharp(master).extract({ left: bx, top: by, width: bw, height: bh }).png().toBuffer();
  const { rgba } = await matteCropWithReplicate(cropBuf, bw, bh);
  return finalizeSegment({ master, width, height, cropBox, rgba });
}

export interface MattedObject {
  id: string;
  label: string;
  rgba: Buffer;
  mask: Buffer;
  bbox: [number, number, number, number];
  amodalCompleted: boolean;
  parentId?: string;
  isText?: boolean;
}

/**
 * zHint por aritmética de solape (sin LLM): objetos más pequeños / contenidos van encima.
 * Las partes (parentId) se fuerzan SIEMPRE por encima de su sujeto contenedor.
 */
export function computeZHints(
  objects: Array<{ id: string; bbox: [number, number, number, number]; parentId?: string }>,
): Map<string, number> {
  const area = (b: [number, number, number, number]) => Math.max(1, b[2] * b[3]);
  const sorted = [...objects].sort((a, b) => area(b.bbox) - area(a.bbox));
  const z = new Map<string, number>();
  sorted.forEach((o, idx) => z.set(o.id, idx + 1));

  // Garantía parte > sujeto: una parte nunca queda por debajo de su contenedor.
  const maxZ = objects.length;
  objects.forEach((o) => {
    if (!o.parentId) return;
    const parentZ = z.get(o.parentId);
    const own = z.get(o.id) ?? 1;
    if (parentZ !== undefined && own <= parentZ) {
      z.set(o.id, parentZ + maxZ);
    }
  });
  return z;
}
