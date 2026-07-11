/**
 * Metadatos de archivos para preflight de ingesta (servidor).
 */

import { countPdfPagesInBuffer } from "@/lib/brain/pdf-brand-extract";
import { parseBrainDocument } from "@/lib/brain-parser-utils";
import type { BrandKitIngestFileCostHint } from "./brand-kit-ingest-cost-estimate";

const TEXT_SAMPLE_MAX = 4_000;

export type BrandKitIngestFileBuffer = {
  name: string;
  mime: string;
  buffer: Buffer;
};

export async function buildBrandKitIngestFileHintsFromBuffers(
  files: BrandKitIngestFileBuffer[],
): Promise<BrandKitIngestFileCostHint[]> {
  return Promise.all(
    files.map(async (file) => {
      const isPdf =
        file.mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const isImage =
        file.mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg|ico)$/i.test(file.name);

      let width: number | undefined;
      let height: number | undefined;
      let pageCount: number | undefined;
      let textSampleExcerpt: string | undefined;

      if (isImage && !file.name.toLowerCase().endsWith(".svg")) {
        try {
          const sharp = (await import("sharp")).default;
          const meta = await sharp(file.buffer).metadata();
          width = meta.width ?? undefined;
          height = meta.height ?? undefined;
        } catch {
          // ignore
        }
      }

      if (isPdf) {
        pageCount = await countPdfPagesInBuffer(file.buffer, 200).catch(() => undefined);
        try {
          const text = await parseBrainDocument(file.buffer, file.name, file.mime);
          textSampleExcerpt = text.trim().slice(0, TEXT_SAMPLE_MAX);
        } catch {
          textSampleExcerpt = "";
        }
      }

      return {
        name: file.name,
        mime: file.mime,
        width,
        height,
        pageCount,
        textSampleExcerpt,
      };
    }),
  );
}
