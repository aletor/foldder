"use client";

import type { DesignerPageState } from "../designer/DesignerNode";
import { materializeProjectSpacesMediaForSave, uploadProjectMediaFile } from "../project-media-s3-save";
import { addDesignerTemplateToLibrary, type InspirationLibraryItem } from "./inspiration-library-api";

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], filename, { type: blob.type || "image/png" });
}

/**
 * Guarda un conjunto de páginas Designer como plantilla en la librería de Inspiración del usuario.
 *
 * 1) Materializa las imágenes embebidas (data URLs) de las páginas a S3 estable para que la
 *    plantilla sea portable entre proyectos.
 * 2) Sube la miniatura rasterizada a S3.
 * 3) Persiste la plantilla (metadatos + páginas) vía la API de librería.
 */
export async function saveDesignerPagesToInspiration(args: {
  pages: DesignerPageState[];
  thumbDataUrl: string;
  title: string;
  projectId: string | null;
}): Promise<InspirationLibraryItem> {
  const clonedPages = JSON.parse(JSON.stringify(args.pages)) as DesignerPageState[];
  const { spaces: materializedPages } = await materializeProjectSpacesMediaForSave(clonedPages, {
    cache: new Map(),
    projectId: args.projectId,
  });

  const thumbFile = await dataUrlToFile(args.thumbDataUrl, `inspiration-thumb-${Date.now()}.png`);
  const uploaded = await uploadProjectMediaFile(thumbFile, {
    projectId: args.projectId,
    policy: { preserveImageQuality: true },
  });

  return addDesignerTemplateToLibrary({
    title: args.title,
    thumbUrl: uploaded.url,
    thumbS3Key: uploaded.s3Key,
    pages: materializedPages,
  });
}
