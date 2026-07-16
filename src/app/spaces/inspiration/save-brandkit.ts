"use client";

import type { BrandKitDocument } from "@/lib/brandkit/brand-kit-types";
import {
  computeBrandKitCompleteness,
  extractBrandTitle,
  extractLogoPreviewUrl,
  normalizeBrandKitDocument,
} from "@/lib/brandkit/brand-kit-defaults";
import { materializeProjectSpacesMediaForSave, uploadProjectMediaFile } from "../project-media-s3-save";
import { addBrandKitToLibrary, type InspirationLibraryItem } from "./inspiration-library-api";

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], filename, { type: blob.type || "image/png" });
}

/**
 * Guarda un BrandKitDocument en la librería de Inspiración del usuario ("Mis BrandKits").
 * Materializa data URLs a S3 para que sea portable entre proyectos.
 */
export async function saveBrandKitToInspiration(args: {
  brandKit: BrandKitDocument;
  title?: string;
  projectId: string | null;
}): Promise<InspirationLibraryItem> {
  const normalized = normalizeBrandKitDocument(args.brandKit);
  const cloned = JSON.parse(JSON.stringify(normalized)) as BrandKitDocument;
  const { spaces: materialized } = await materializeProjectSpacesMediaForSave(cloned, {
    cache: new Map(),
    projectId: args.projectId,
  });

  const title =
    args.title?.trim() ||
    extractBrandTitle(materialized, "BrandKit").trim() ||
    "BrandKit";
  const completenessPercent = computeBrandKitCompleteness(materialized).percent;
  const logoUrl = extractLogoPreviewUrl(materialized);

  let thumbUrl: string | undefined;
  let thumbS3Key: string | undefined;
  if (logoUrl?.startsWith("data:")) {
    const thumbFile = await dataUrlToFile(logoUrl, `brandkit-thumb-${Date.now()}.png`);
    const uploaded = await uploadProjectMediaFile(thumbFile, {
      projectId: args.projectId,
      policy: { preserveImageQuality: true },
    });
    thumbUrl = uploaded.url;
    thumbS3Key = uploaded.s3Key;
  } else if (logoUrl) {
    thumbUrl = logoUrl;
  }

  return addBrandKitToLibrary({
    title: title.slice(0, 120),
    brandKit: materialized,
    thumbUrl,
    thumbS3Key,
    completenessPercent,
  });
}
