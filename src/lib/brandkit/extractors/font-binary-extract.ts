/**
 * Extracción de binarios tipográficos embebidos (best-effort vía pdf.js).
 * Type 3 → no recuperable como outline estándar.
 */

import { loadPdfJsDocumentFromBuffer } from "@/lib/brain/pdfjs-server";
import { parsePdfFontResourceName } from "@/lib/brain/pdf-font-extract";
import type { TypographyEmbedStatus } from "../model/trait-values";

export type ExtractedFontBinary = {
  family: string;
  weight: string;
  embedStatus: TypographyEmbedStatus;
  /** Data URL `font/woff2` o `font/ttf` cuando embedded_extracted. */
  dataUrl?: string;
  pdfSubtype?: string;
};

type PdfFontResource = {
  name?: string;
  loadedName?: string;
  fallbackName?: string;
  type?: string;
  subtype?: string;
  data?: Uint8Array | null;
  file?: Uint8Array | null;
};

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

function guessMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 4 && bytes[0] === 0x77 && bytes[1] === 0x4f && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return "font/woff2";
  }
  if (bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) {
    return "font/ttf";
  }
  if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x54 && bytes[2] === 0x54 && bytes[3] === 0x4f) {
    return "font/otf";
  }
  return null;
}

function isType3(subtype: string | undefined, type: string | undefined): boolean {
  const s = `${subtype ?? ""} ${type ?? ""}`.toLowerCase();
  return s.includes("type3") || s.includes("type 3");
}

export async function extractEmbeddedFontBinaries(
  buffer: Buffer,
  maxPages = 30,
): Promise<Map<string, ExtractedFontBinary>> {
  const loaded = await loadPdfJsDocumentFromBuffer(buffer, { fontExtraProperties: true });
  const pdf = await loaded.pdf;
  const out = new Map<string, ExtractedFontBinary>();

  try {
    const pageLimit = Math.min(pdf.numPages, maxPages);
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      await page.getOperatorList();

      const seen = new Set<string>();
      const textContent = await page.getTextContent();
      for (const item of textContent.items) {
        if (!("fontName" in item)) continue;
        const fontId = String((item as { fontName?: unknown }).fontName ?? "");
        if (!fontId || seen.has(fontId)) continue;
        seen.add(fontId);

        let resource: PdfFontResource | null = null;
        try {
          resource = (await page.commonObjs.get(fontId)) as PdfFontResource;
        } catch {
          resource = null;
        }
        const rawName = resource?.name || resource?.loadedName || resource?.fallbackName || "";
        const parsed = parsePdfFontResourceName(rawName);
        if (!parsed) continue;

        const key = `${parsed.family}::${parsed.weight}`;
        if (out.has(key)) continue;

        const subtype = resource?.subtype;
        const type = resource?.type;

        if (isType3(subtype, type)) {
          out.set(key, {
            family: parsed.family,
            weight: parsed.weight,
            embedStatus: "identified_only",
            pdfSubtype: subtype ?? type,
          });
          continue;
        }

        const rawBytes = resource?.file ?? resource?.data;
        if (rawBytes && rawBytes.length > 256) {
          const mime = guessMime(rawBytes);
          if (mime) {
            out.set(key, {
              family: parsed.family,
              weight: parsed.weight,
              embedStatus: "embedded_extracted",
              dataUrl: bytesToDataUrl(rawBytes, mime),
              pdfSubtype: subtype ?? type,
            });
            continue;
          }
        }

        out.set(key, {
          family: parsed.family,
          weight: parsed.weight,
          embedStatus: "identified_only",
          pdfSubtype: subtype ?? type,
        });
      }
    }
  } finally {
    await pdf.destroy();
  }

  return out;
}

export function mergeFontBinariesIntoUsage(
  family: string,
  weights: string[],
  binaries: Map<string, ExtractedFontBinary>,
): {
  embedStatus: TypographyEmbedStatus;
  extractedWeights: string[];
  specimenFontFaces: Record<string, string>;
} {
  const extractedWeights: string[] = [];
  const specimenFontFaces: Record<string, string> = {};

  for (const weight of weights) {
    const hit = binaries.get(`${family}::${weight}`);
    if (hit?.embedStatus === "embedded_extracted" && hit.dataUrl) {
      extractedWeights.push(weight);
      specimenFontFaces[weight] = hit.dataUrl;
    }
  }

  if (extractedWeights.length > 0) {
    return { embedStatus: "embedded_extracted", extractedWeights, specimenFontFaces };
  }

  const anyIdentified = weights.some((w) => binaries.has(`${family}::${w}`));
  return {
    embedStatus: anyIdentified ? "identified_only" : "substituted",
    extractedWeights: [],
    specimenFontFaces: {},
  };
}
