/**
 * Muestras de imágenes del Dataset para el Studio de Populate.
 */

import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import { getListFieldImageAtRow } from "@/app/spaces/dataset/dataset-logic";

/** Primeras N URLs no vacías de una columna imagen (para miniaturas en el picker). */
export function sampleColumnImageUrls(
  dataset: Dataset | null,
  listId: string | null,
  fieldId: string,
  rowCount: number,
  max = 4,
): string[] {
  if (!dataset || !listId || max <= 0) return [];
  const urls: string[] = [];
  for (let i = 0; i < rowCount && urls.length < max; i += 1) {
    const img = getListFieldImageAtRow(dataset, listId, fieldId, i);
    const url = img?.url?.trim();
    if (url) urls.push(url);
  }
  return urls;
}
