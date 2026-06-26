"use client";

/**
 * Fase 4b — rasterizar las instancias congeladas del Designer y subir cada slide a S3, para luego
 * escribir las M columnas × N filas al Dataset.
 *
 * El orquestador `rasterizeAndUploadDesignerRows` recibe inyectadas las funciones `rasterize`
 * (montaje headless del Designer) y `upload` (S3), de modo que la lógica de reparto fila×slide es
 * pura y testeable sin depender del DOM ni de la red.
 */

import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import { resolveSlideKey } from "@/app/spaces/designer/designer-studio-pure";
import { uploadProjectMediaFile } from "@/app/spaces/project-media-s3-save";
import type {
  DesignerRowSlides,
  DesignerSlideRaster,
} from "./populate-designer-dataset-output";
import type { DesignerMaterializedRow } from "./populate-designer-materialize";
import type { MaterializedRow } from "./populate-materialize";

const DATA_IMAGE_URL_RE = /^data:(image\/[^;,]+)(?:;[^,]*)?;base64,(.*)$/i;

/** Convierte un data URL de imagen a `File` (PNG/WebP/JPEG). Devuelve null si no es válido. */
export function dataUrlToImageFile(dataUrl: string, mediaId: string): File | null {
  const match = DATA_IMAGE_URL_RE.exec(dataUrl);
  if (!match) return null;
  const contentType = match[1]!.toLowerCase();
  const binary = atob(match[2]!);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ext = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
      ? "webp"
      : "jpg";
  return new File([bytes], `${mediaId}.${ext}`, { type: contentType });
}

/** Sube el raster de un slide a S3 (calidad preservada) y devuelve url + s3Key. */
export async function uploadDesignerSlideRaster(
  dataUrl: string,
  opts: { projectId: string | null; mediaId: string },
): Promise<{ url: string; s3Key: string }> {
  const file = dataUrlToImageFile(dataUrl, opts.mediaId);
  if (!file) throw new Error("El raster del slide no es un data URL de imagen válido.");
  const uploaded = await uploadProjectMediaFile(file, {
    mediaId: opts.mediaId,
    projectId: opts.projectId,
    policy: { preserveImageQuality: true },
  });
  return { url: uploaded.url, s3Key: uploaded.s3Key };
}

/** Sube un data URL de imagen de Populate a S3 si hace falta. */
export async function uploadPopulateImageOutput(
  url: string,
  opts: { projectId: string | null; mediaId: string },
): Promise<{ url: string; s3Key: string } | null> {
  if (!url.startsWith("data:image/")) return null;
  return uploadDesignerSlideRaster(url, opts);
}

/** Convierte salidas data URL en URLs estables de S3 para Dataset y nested space. */
export async function ensureMaterializedRowsHaveStableUrls(
  rows: MaterializedRow[],
  projectId: string | null,
  populateId: string,
): Promise<MaterializedRow[]> {
  const out: MaterializedRow[] = [];
  for (const row of rows) {
    if (!row.output?.startsWith("data:image/")) {
      out.push(row);
      continue;
    }
    const uploaded = await uploadPopulateImageOutput(row.output, {
      projectId,
      mediaId: `pop_${populateId}_r${row.rowIndex}`,
    });
    out.push(uploaded ? { ...row, output: uploaded.url, s3Key: uploaded.s3Key } : row);
  }
  return out;
}

export interface RasterizeAndUploadArgs {
  rows: DesignerMaterializedRow[];
  /** Monta el Designer headless y devuelve `{ pageId: dataUrl }` para las páginas pedidas. */
  rasterize: (pages: DesignerPageState[], pageIds: string[]) => Promise<Record<string, string>>;
  /** Sube un raster y devuelve su url + s3Key. */
  upload: (
    dataUrl: string,
    ctx: { slideKey: string; rowIndex: number; pageId: string },
  ) => Promise<{ url: string; s3Key: string }>;
  /** Progreso por fila completada (rasterizada + subida). */
  onRowDone?: (done: number, total: number) => void;
}

/**
 * Rasteriza y sube todas las filas, esperando a que los M rasters de cada fila estén listos antes de
 * pasar a la siguiente. Devuelve el reparto fila×slide listo para `applyDesignerSlidesToDataset`.
 */
export async function rasterizeAndUploadDesignerRows(
  args: RasterizeAndUploadArgs,
): Promise<DesignerRowSlides[]> {
  const { rows, rasterize, upload, onRowDone } = args;
  const out: DesignerRowSlides[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    const pages = row.pages ?? [];
    const pageIds = pages.map((p) => p.id);
    const dataUrls = pageIds.length ? await rasterize(pages, pageIds) : {};
    const slides: DesignerSlideRaster[] = [];
    for (const page of pages) {
      const dataUrl = dataUrls[page.id];
      if (!dataUrl) continue;
      const slideKey = resolveSlideKey(page);
      const uploaded = await upload(dataUrl, { slideKey, rowIndex: row.rowIndex, pageId: page.id });
      slides.push({
        slideKey,
        slideName: page.slideName,
        url: uploaded.url,
        s3Key: uploaded.s3Key,
      });
    }
    out.push({ rowIndex: row.rowIndex, cardId: row.cardId, slides });
    onRowDone?.(r + 1, rows.length);
  }
  return out;
}
