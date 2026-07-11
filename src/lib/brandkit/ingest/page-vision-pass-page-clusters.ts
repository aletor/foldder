/**
 * Agrupa páginas PDF por hash perceptual barato (plantilla) para muestreo estratificado.
 */

import crypto from "node:crypto";
import sharp from "sharp";
import { renderPdfPages } from "@/lib/brain/pdf-page-render";
import { PAGE_VISION_PASS_DPI } from "./page-vision-pass-version";
import type { PageTemplateCluster } from "./page-vision-pass-selection";

const CLUSTER_THUMB = 16;

async function pageLayoutPhash(pngBuffer: Buffer): Promise<string> {
  const { data } = await sharp(pngBuffer)
    .resize(CLUSTER_THUMB, CLUSTER_THUMB, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return crypto.createHash("sha1").update(data).digest("hex").slice(0, 16);
}

export async function clusterPdfPagesByLayout(
  buffer: Buffer,
  totalPages: number,
  maxPagesToRender = totalPages,
): Promise<PageTemplateCluster[]> {
  const rendered = await renderPdfPages(buffer, {
    maxPages: Math.min(totalPages, maxPagesToRender),
    dpi: PAGE_VISION_PASS_DPI,
  });
  const byPhash = new Map<string, number[]>();
  for (const page of rendered) {
    const phash = await pageLayoutPhash(page.pngBuffer);
    const list = byPhash.get(phash) ?? [];
    list.push(page.pageNumber);
    byPhash.set(phash, list);
  }
  return [...byPhash.entries()].map(([phash, pageNumbers]) => ({
    clusterId: `layout_${phash}`,
    pageNumbers: pageNumbers.sort((a, b) => a - b),
    phash,
  }));
}
