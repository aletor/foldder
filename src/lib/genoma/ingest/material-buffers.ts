import { normalizeGenome, type Genome } from "@/lib/genoma/model/trait";
import type { GenomaIngestStreamEvent } from "@/lib/genoma/ingest/types";
import { ingestImageIntoGenome, ingestPdfIntoGenome, ingestSvgIntoGenome } from "@/lib/genoma/ingest/pdf-ingest-server";
import { COPY_GENOME_COMPLETE } from "@/lib/genoma/ingest/feedback-copy";
import {
  isPdfFile,
  isRasterImageFile,
  isSvgFile,
  sortIngestFiles,
} from "@/lib/genoma/ingest/ingest-file-priority";

export type MaterialBufferEntry = {
  fileName: string;
  buffer: Buffer;
  mime: string;
};

export async function materialBuffersFromFiles(files: File[]): Promise<MaterialBufferEntry[]> {
  return Promise.all(
    files.map(async (file) => ({
      fileName: file.name,
      buffer: Buffer.from(await file.arrayBuffer()),
      mime: file.type || guessMime(file.name),
    })),
  );
}

function guessMime(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function asFileLike(entry: MaterialBufferEntry): Pick<File, "type" | "name"> {
  return { name: entry.fileName, type: entry.mime };
}

export function sortMaterialBuffers(entries: MaterialBufferEntry[]): MaterialBufferEntry[] {
  return sortIngestFiles(entries.map((entry) => asFileLike(entry))).map((fileLike) => {
    const match = entries.find((entry) => entry.fileName === fileLike.name && entry.mime === fileLike.type);
    return match ?? entries.find((entry) => entry.fileName === fileLike.name)!;
  });
}

export async function* processMaterialBuffers(
  entries: MaterialBufferEntry[],
  genomeSeed: Genome,
  opts: {
    userEmail?: string;
    allowMaterialPrompts?: boolean;
    allowPaidAnalysis?: boolean;
    paidAnalysisOperationId?: string;
    skipClassicLogoExtraction?: boolean;
  } = {},
): AsyncGenerator<GenomaIngestStreamEvent> {
  yield { type: "ingest_receive", fileCount: entries.length };

  let genome = normalizeGenome(genomeSeed);
  const ingestOpts = {
    userEmail: opts.userEmail,
    allowMaterialPrompts: opts.allowMaterialPrompts ?? false,
    allowPaidAnalysis: opts.allowPaidAnalysis,
    paidAnalysisOperationId: opts.paidAnalysisOperationId,
    skipClassicLogoExtraction: opts.skipClassicLogoExtraction ?? false,
  };

  for (const entry of sortMaterialBuffers(entries)) {
    const fileLike = asFileLike(entry);

    if (isSvgFile(fileLike)) {
      yield { type: "ingest_reading", sourceCount: genome.sources.length + 1 };
      const { events, genome: next } = await ingestSvgIntoGenome(entry.buffer, entry.fileName, genome);
      genome = next;
      for (const event of events) yield event;
      continue;
    }

    if (isPdfFile(fileLike)) {
      yield { type: "ingest_reading", sourceCount: genome.sources.length + 1 };
      for await (const event of ingestPdfIntoGenome(entry.buffer, entry.fileName, genome, ingestOpts)) {
        if (event.type === "genome_update") genome = normalizeGenome(event.genome);
        yield event;
      }
      continue;
    }

    if (isRasterImageFile(fileLike)) {
      yield { type: "ingest_reading", sourceCount: genome.sources.length + 1 };
      const mime = entry.mime || "image/png";
      const { events, genome: next } = await ingestImageIntoGenome(
        entry.buffer,
        entry.fileName,
        mime,
        genome,
        ingestOpts,
      );
      genome = next;
      for (const event of events) yield event;
      continue;
    }

    yield {
      type: "source_error",
      fileName: entry.fileName,
      message: "Formato no soportado todavía",
    };
  }

  yield { type: "micro", text: COPY_GENOME_COMPLETE };
  yield { type: "genome_update", genome };
  yield { type: "done" };
}
