/**
 * Frame exacto del batch Nivel 1: resize 640 → tag → JPEG (lo que ve Gemini).
 * Compartido entre runner de ingesta y logo-lab para alinear bbox 0–1 con píxeles.
 */

import sharp from "sharp";
import { burnPageVisionImageTag, buildPageVisionImageTag } from "./page-vision-page-tag-burn";
import { encodeJpegForNivel1Batch, resizePngForNivel1Batch } from "./page-vision-nivel1-resize";

export type PageVisionBatchFrame = {
  width: number;
  height: number;
  /** PNG con tag, previo al JPEG. */
  taggedPng: Buffer;
  /** Bytes JPEG enviados al modelo. */
  modelJpeg: Buffer;
  /** PNG decodificado del JPEG del modelo — dimensiones idénticas al input del LLM. */
  modelViewPng: Buffer;
};

export async function buildPageVisionBatchFrame(
  pagePngBuffer: Buffer,
  pageNumber: number,
): Promise<PageVisionBatchFrame> {
  const resized = await resizePngForNivel1Batch(pagePngBuffer);
  const taggedPng = await burnPageVisionImageTag(resized, buildPageVisionImageTag(pageNumber));
  const { buffer: modelJpeg } = await encodeJpegForNivel1Batch(taggedPng);
  const meta = await sharp(modelJpeg).metadata();
  const modelViewPng = await sharp(modelJpeg).png().toBuffer();
  return {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    taggedPng,
    modelJpeg,
    modelViewPng,
  };
}
