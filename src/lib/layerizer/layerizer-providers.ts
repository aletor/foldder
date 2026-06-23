/**
 * Layerizer — abstracción de proveedor.
 *
 * Aísla el orquestador del job de los proveedores concretos. v1 implementa todo sobre
 * la infra existente (Gemini + Replicate 851-labs). El upgrade a fal.ai (SAM 3 realtime
 * + BiRefNet Matting) se enchufa aquí (M7) sin tocar el orquestador.
 *
 * Reglas codificadas en el contrato:
 * - `segmentAndMatte` recorta del MASTER (alfa real sobre los píxeles originales). Nunca genera.
 * - `cleanPlate` y `amodalComplete` son generativos (Gemini / Nano Banana).
 */

import type {
  DetectedObject,
  LayerizerCleanPlateMethod,
  SamPrompt,
} from "@/app/spaces/layerizer/layerizer-types";
import { detectObjectsWithGemini } from "@/lib/layerizer/layerizer-detect";
import { resolveLayerizerHost, type LayerizerProviderHost } from "@/lib/layerizer/layerizer-config";
import {
  segmentAndMatte as segmentAndMatteReplicate,
  matteCropWithReplicate,
  resolveSegmentBbox,
} from "@/lib/layerizer/layerizer-extract-core";
import { segmentAndMatteFal, matteCropWithBirefnet } from "@/lib/layerizer/layerizer-fal";
import { generateCleanPlate } from "@/lib/layerizer/layerizer-clean-plate";
import { amodalCompleteLayer } from "@/lib/layerizer/layerizer-amodal";
import sharp from "sharp";

export interface SegmentMatteInput {
  /** Buffer del master (inmutable). */
  master: Buffer;
  /** Dimensiones del master en px. */
  width: number;
  height: number;
  /** Prompt SAM o bbox a recortar. */
  prompt: SamPrompt;
  /** bbox de respaldo (de la detección) cuando el prompt no es una caja. */
  fallbackBbox?: [number, number, number, number];
}

export interface SegmentMatteResult {
  /** PNG RGBA del objeto recortado (alfa real). */
  rgba: Buffer;
  /** Máscara en escala de grises (PNG) a resolución del master. */
  mask: Buffer;
  /** bbox final [x,y,w,h] en px del master. */
  bbox: [number, number, number, number];
}

export interface CleanPlateInput {
  master: Buffer;
  width: number;
  height: number;
  /** Máscaras (PNG grayscale, resolución master) de TODOS los objetos a tapar. */
  masks: Buffer[];
  /** Etiquetas + bbox para el método `describe` (referencia espacial). */
  regions: Array<{ label: string; bbox: [number, number, number, number]; isText?: boolean }>;
  method: LayerizerCleanPlateMethod;
}

export interface CleanPlateResult {
  /** PNG del fondo limpio a resolución del master. */
  background: Buffer;
}

export interface AmodalInput {
  /** PNG RGBA del objeto recortado. */
  layerRgba: Buffer;
  label: string;
}

export interface AmodalResult {
  rgba: Buffer;
}

export interface PreviewMaskInput {
  master: Buffer;
  width: number;
  height: number;
  prompt: SamPrompt;
}

export interface PreviewMaskResult {
  /** Máscara grayscale (data URL PNG) a resolución del master, para overlay en el cliente. */
  maskDataUrl: string;
  bbox: [number, number, number, number];
}

/** Contrato del proveedor de Layerizer. */
export interface LayerizerProvider {
  host: LayerizerProviderHost;
  detect(input: {
    image: string;
    width: number;
    height: number;
    baseUrl?: string | URL;
    maxObjects?: number;
  }): Promise<{ objects: DetectedObject[]; width: number; height: number }>;
  /** Pasos B+C: segmentación + matting pixel-exacto del master. (M2) */
  segmentAndMatte(input: SegmentMatteInput): Promise<SegmentMatteResult>;
  /** Paso D: fondo limpio generativo, una sola llamada. (M2/M5) */
  cleanPlate(input: CleanPlateInput): Promise<CleanPlateResult>;
  /** Paso E: completado amodal por objeto, opt-in. (M6) */
  amodalComplete(input: AmodalInput): Promise<AmodalResult>;
  /** Estado 2: máscara de selección para preview en vivo (pre-pago). (M7) */
  previewMask(input: PreviewMaskInput): Promise<PreviewMaskResult>;
}

/**
 * Proveedor por defecto (v1). Detección lista (M1); el resto se implementa en M2/M5/M6.
 * Mantener la firma estable para que fal.ai se enchufe en M7 sin cambios en el orquestador.
 */
export function getLayerizerProvider(): LayerizerProvider {
  const host = resolveLayerizerHost();

  async function segmentAndMatte(input: SegmentMatteInput): Promise<SegmentMatteResult> {
    if (host === "fal") {
      try {
        return await segmentAndMatteFal(input);
      } catch (error) {
        console.warn("[layerizer] fal segment failed, falling back to Replicate:", error);
        return segmentAndMatteReplicate(input);
      }
    }
    return segmentAndMatteReplicate(input);
  }

  return {
    host,
    detect: (input) => detectObjectsWithGemini(input),
    segmentAndMatte,
    previewMask: async (input) => {
      const bbox = resolveSegmentBbox(input.prompt, undefined, input.width, input.height);
      const [bx, by, bw, bh] = bbox;
      const cropBuf = await sharp(input.master)
        .extract({ left: bx, top: by, width: bw, height: bh })
        .png()
        .toBuffer();
      let cropMask: Buffer;
      try {
        if (host === "fal") {
          ({ mask: cropMask } = await matteCropWithBirefnet(cropBuf, bw, bh));
        } else {
          ({ mask: cropMask } = await matteCropWithReplicate(cropBuf, bw, bh));
        }
      } catch {
        ({ mask: cropMask } = await matteCropWithReplicate(cropBuf, bw, bh));
      }
      const fullMask = await sharp({
        create: { width: input.width, height: input.height, channels: 3, background: { r: 0, g: 0, b: 0 } },
      })
        .composite([{ input: cropMask, left: bx, top: by }])
        .grayscale()
        .png()
        .toBuffer();
      return { maskDataUrl: `data:image/png;base64,${fullMask.toString("base64")}`, bbox };
    },
    cleanPlate: async (input) => ({
      background: await generateCleanPlate({
        master: input.master,
        width: input.width,
        height: input.height,
        masks: input.masks,
        regions: input.regions,
        method: input.method,
      }),
    }),
    amodalComplete: async (input) => ({
      rgba: await amodalCompleteLayer({ layerRgba: input.layerRgba, label: input.label }),
    }),
  };
}
