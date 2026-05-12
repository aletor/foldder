/**
 * Cliente: redimensionado y recompresión para versión OPT (sin cambiar layout en página).
 */

import { fetchBlobViaSpacesProxy } from "@/lib/spaces-proxy-fetch";
import { optimizeImageBlobForFoldder } from "../media/foldder-image-optimization";

let _assetSeq = 0;
export function newDesignerAssetId(): string {
  return `ds_${Date.now()}_${++_assetSeq}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Produce blob OPT: lado largo ≤ 2000, proporción intacta.
 * Sin alpha → JPEG 70%. Con alpha → WebP (fallback PNG).
 */
export async function optimizeImageBlobToOptFormat(blob: Blob, mimeHint: string): Promise<{ blob: Blob; ext: string }> {
  return optimizeImageBlobForFoldder(blob, mimeHint);
}

export async function fetchBlobViaProxy(url: string): Promise<{ blob: Blob; mime: string }> {
  const blob = await fetchBlobViaSpacesProxy(url);
  return { blob, mime: blob.type || "application/octet-stream" };
}
