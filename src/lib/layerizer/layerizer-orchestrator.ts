/**
 * Layerizer — orquestador del job (Pasos B→F). Se ejecuta dentro de una request y
 * emite progreso por callback (el route lo serializa a NDJSON). El wallet (reserve→
 * capture/release) lo gestiona el route; aquí devolvemos el coste consumido para liquidar.
 *
 * Tolerante a fallos parciales: si algún objeto falla en matting, el resto continúa y el
 * job termina como 'partial' (sigue habiendo salida usable). El master nunca se reescribe.
 */

import type {
  LayerizerBackground,
  LayerizerCleanPlateMethod,
  LayerizerOutput,
  LayerizerProgressEvent,
  Layer,
  SelectedObject,
} from "@/app/spaces/layerizer/layerizer-types";
import { getLayerizerProvider } from "@/lib/layerizer/layerizer-providers";
import { computeZHints, segmentTextBlock, type MattedObject } from "@/lib/layerizer/layerizer-extract-core";
import { uploadLayerizerArtifact } from "@/lib/layerizer/layerizer-s3";
import { LAYERIZER_COST_USD } from "@/lib/layerizer/layerizer-config";

export interface RunLayerizerJobInput {
  jobId: string;
  userEmail: string;
  master: Buffer;
  masterUrl: string;
  masterS3Key?: string;
  width: number;
  height: number;
  selected: SelectedObject[];
  cleanPlateMethod: LayerizerCleanPlateMethod;
  /** Generar también el fondo con el otro método para comparar (Paso D). */
  compareCleanPlate?: boolean;
}

export interface RunLayerizerJobResult {
  output: LayerizerOutput;
  status: "done" | "partial";
  consumedUsd: number;
}

function boxFromPrompt(s: SelectedObject): [number, number, number, number] | undefined {
  if (s.prompt.kind === "box") return s.prompt.box;
  return undefined;
}

export async function runLayerizerJob(
  input: RunLayerizerJobInput,
  onEvent: (event: LayerizerProgressEvent) => void,
): Promise<RunLayerizerJobResult> {
  const provider = getLayerizerProvider();
  const { jobId, userEmail, master, width, height, selected } = input;

  const emit = (event: Omit<LayerizerProgressEvent, "type" | "jobId">) =>
    onEvent({ type: "progress", jobId, ...event });

  // --- Pasos B+C: segmentación + matting por objeto (en paralelo) ---
  emit({ status: "segmenting", message: "Segmentando objetos" });
  const settled = await Promise.allSettled(
    selected.map((sel) => {
      const base = {
        master,
        width,
        height,
        prompt: sel.prompt,
        fallbackBbox: boxFromPrompt(sel),
      };
      return sel.isText ? segmentTextBlock(base) : provider.segmentAndMatte(base);
    }),
  );

  const matted: MattedObject[] = [];
  settled.forEach((res, i) => {
    const sel = selected[i];
    if (res.status === "fulfilled") {
      matted.push({
        id: sel.id,
        label: sel.label || `Object ${i + 1}`,
        rgba: res.value.rgba,
        mask: res.value.mask,
        bbox: res.value.bbox,
        amodalCompleted: false,
        parentId: sel.parentId,
        isText: sel.isText,
      });
    } else {
      console.warn(`[layerizer:${jobId}] matting failed for ${sel.id}:`, res.reason);
    }
  });
  emit({
    status: "matting",
    stageProgress: selected.length ? matted.length / selected.length : 0,
    message: `Recortadas ${matted.length}/${selected.length} capas`,
  });

  if (matted.length === 0) {
    throw new Error("No objects could be extracted");
  }

  // --- Paso E: completado amodal (opt-in por objeto, generativo) ---
  let amodalConsumed = 0;
  const amodalIds = new Set(selected.filter((s) => s.amodalComplete).map((s) => s.id));
  if (amodalIds.size > 0) {
    emit({ status: "amodal", message: `Completando ${amodalIds.size} objeto(s)` });
    await Promise.all(
      matted.map(async (m) => {
        if (!amodalIds.has(m.id) || m.isText) return;
        try {
          const res = await provider.amodalComplete({ layerRgba: m.rgba, label: m.label });
          m.rgba = res.rgba;
          m.amodalCompleted = true;
          amodalConsumed += LAYERIZER_COST_USD.perObjectAmodal;
        } catch (error) {
          console.warn(`[layerizer:${jobId}] amodal failed for ${m.id}:`, error);
        }
      }),
    );
  }

  // --- Paso D: fondo limpio (una llamada; dos si se compara) ---
  emit({ status: "compositing_bg", message: "Generando fondo limpio" });
  const masks = matted.map((m) => m.mask);
  const regions = matted.map((m) => ({
    label: m.isText ? `text: ${m.label}` : m.label,
    bbox: m.bbox,
    isText: m.isText,
  }));
  const altMethod: LayerizerCleanPlateMethod = input.cleanPlateMethod === "mask" ? "describe" : "mask";

  const genCleanPlate = (method: LayerizerCleanPlateMethod) =>
    provider.cleanPlate({ master, width, height, masks, regions, method });

  let backgroundBuffer: Buffer | null = null;
  let cleanPlateConsumed = 0;
  try {
    backgroundBuffer = (await genCleanPlate(input.cleanPlateMethod)).background;
    cleanPlateConsumed += LAYERIZER_COST_USD.cleanPlate;
  } catch (error) {
    console.warn(`[layerizer:${jobId}] clean plate failed, using master as background:`, error);
    // Fallback usable: el master como fondo (sin tapar). El usuario puede regenerar.
    backgroundBuffer = await import("sharp").then((m) =>
      (m.default || m)(master).png().toBuffer(),
    );
  }

  let backgroundAltBuffer: Buffer | null = null;
  if (input.compareCleanPlate) {
    emit({ status: "compositing_bg", message: `Generando fondo alternativo (${altMethod})` });
    try {
      backgroundAltBuffer = (await genCleanPlate(altMethod)).background;
      cleanPlateConsumed += LAYERIZER_COST_USD.cleanPlate;
    } catch (error) {
      console.warn(`[layerizer:${jobId}] alt clean plate (${altMethod}) failed, skipping:`, error);
    }
  }

  // --- Paso F: montaje (zHint + subida a S3) ---
  emit({ status: "assembling", message: "Montando capas" });
  if (!backgroundBuffer) throw new Error("Background generation produced no image");
  const zHints = computeZHints(matted.map((m) => ({ id: m.id, bbox: m.bbox, parentId: m.parentId })));

  const originalUpload = await uploadLayerizerArtifact({
    userEmail,
    jobId,
    name: "original",
    buffer: master,
    contentType: "image/png",
  });

  const bgUpload = await uploadLayerizerArtifact({
    userEmail,
    jobId,
    name: "background",
    buffer: backgroundBuffer,
    contentType: "image/png",
  });

  let backgroundAlt: LayerizerBackground | undefined;
  if (backgroundAltBuffer) {
    const altUpload = await uploadLayerizerArtifact({
      userEmail,
      jobId,
      name: "background_alt",
      buffer: backgroundAltBuffer,
      contentType: "image/png",
    });
    backgroundAlt = { url: altUpload.url, s3Key: altUpload.s3Key, w: width, h: height, source: "clean_plate" };
  }

  const layers: Layer[] = await Promise.all(
    matted.map(async (m) => {
      const up = await uploadLayerizerArtifact({
        userEmail,
        jobId,
        name: `layer_${m.id}`,
        buffer: m.rgba,
        contentType: "image/png",
      });
      return {
        id: m.id,
        label: m.label,
        url: up.url,
        s3Key: up.s3Key,
        x: m.bbox[0],
        y: m.bbox[1],
        w: m.bbox[2],
        h: m.bbox[3],
        zHint: zHints.get(m.id) ?? 1,
        source: "extracted" as const,
        amodalCompleted: m.amodalCompleted,
        parentId: m.parentId,
        isText: m.isText,
      };
    }),
  );

  const output: LayerizerOutput = {
    jobId,
    masterUrl: input.masterUrl,
    masterS3Key: input.masterS3Key,
    original: {
      url: originalUpload.url,
      s3Key: originalUpload.s3Key,
      w: width,
      h: height,
      source: "original",
    },
    background: { url: bgUpload.url, s3Key: bgUpload.s3Key, w: width, h: height, source: "clean_plate" },
    layers,
    cleanPlateMethod: input.cleanPlateMethod,
    ...(backgroundAlt ? { backgroundAlt, cleanPlateMethodAlt: altMethod } : {}),
  };

  const consumedUsd =
    matted.length * LAYERIZER_COST_USD.perObjectExtract + cleanPlateConsumed + amodalConsumed;
  const status: "done" | "partial" = matted.length === selected.length && cleanPlateConsumed > 0 ? "done" : "partial";

  return { output, status, consumedUsd };
}
