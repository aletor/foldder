/**
 * Extrae tipografías embebidas del PDF (pdf.js) y las sube a S3 para Designer.
 * Determinista — sin LLM ni APIs de pago.
 */

import { createHash } from "node:crypto";
import { loadPdfJsDocumentFromBuffer } from "@/lib/brain/pdfjs-server";
import { parsePdfFontResourceName } from "@/lib/brain/pdf-font-extract";
import { uploadBufferToS3Key } from "@/lib/s3-utils";
import { stableKnowledgeFileUrlFromKey } from "@/lib/spaces-access-control";
import { mapPdfFontToDesigner } from "./pdf-scan-font-map";
import { designerStyleFromPdfWeightLabel } from "./pdf-scan-font-style";
import { pdfScanObjectKey } from "./pdf-scan-stage";
import type { PdfScanFontAsset } from "./pdf-scan-types";

export { designerStyleFromPdfWeightLabel, remainingMissingPdfFonts } from "./pdf-scan-font-style";

const PDF_SCAN_MAX_EMBEDDED_FONTS = 40;
const MIN_FONT_BYTES = 256;

type PdfFontResource = {
  name?: string;
  loadedName?: string;
  fallbackName?: string;
  type?: string;
  subtype?: string;
  mimetype?: string;
  data?: Uint8Array | null;
  file?: Uint8Array | null;
  bold?: boolean;
  italic?: boolean;
  isType3Font?: boolean;
  missingFile?: boolean;
};

function guessMime(bytes: Uint8Array, declared?: string): string | null {
  const declaredNorm = (declared ?? "").toLowerCase();
  if (declaredNorm.includes("woff2")) return "font/woff2";
  if (declaredNorm.includes("woff")) return "font/woff";
  if (declaredNorm.includes("opentype") || declaredNorm.includes("otf")) return "font/otf";
  if (declaredNorm.includes("truetype") || declaredNorm.includes("ttf")) return "font/ttf";
  // wOF2 / wOFF
  if (bytes.length >= 4 && bytes[0] === 0x77 && bytes[1] === 0x4f && bytes[2] === 0x46 && bytes[3] === 0x32) {
    return "font/woff2";
  }
  if (bytes.length >= 4 && bytes[0] === 0x77 && bytes[1] === 0x4f && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return "font/woff";
  }
  if (bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) {
    return "font/ttf";
  }
  if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x54 && bytes[2] === 0x54 && bytes[3] === 0x4f) {
    return "font/otf";
  }
  // pdf.js often rebuilds as OpenType without a clear magic we recognize above
  if (declaredNorm.includes("font/")) return declaredNorm.split(";")[0]!.trim();
  return null;
}

function extForMime(mime: string): string {
  if (mime.includes("woff2")) return "woff2";
  if (mime.includes("woff")) return "woff";
  if (mime.includes("otf") || mime.includes("opentype")) return "otf";
  return "ttf";
}

function isType3(resource: PdfFontResource): boolean {
  if (resource.isType3Font) return true;
  const s = `${resource.subtype ?? ""} ${resource.type ?? ""}`.toLowerCase();
  return s.includes("type3") || s.includes("type 3");
}

function sha256Hex(buf: Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Extrae binarios tipográficos para familias que Designer no tiene en catálogo
 * (mismas que acabarían en fontsMissing), las sube a S3 y devuelve assets.
 */
export async function extractAndUploadPdfScanFonts(args: {
  buffer: Buffer;
  userEmail: string;
  contentSha256: string;
  /** Familias CSS ya marcadas como missing (familyLabel). */
  missingFamilies: string[];
  maxPages?: number;
}): Promise<PdfScanFontAsset[]> {
  const missingSet = new Set(args.missingFamilies.map((f) => f.trim().toLowerCase()).filter(Boolean));
  if (missingSet.size === 0) return [];

  const loaded = await loadPdfJsDocumentFromBuffer(args.buffer, { fontExtraProperties: true });
  const pdf = loaded.pdf;
  const out: PdfScanFontAsset[] = [];
  const seenKeys = new Set<string>();

  try {
    const pageLimit = Math.min(pdf.numPages, args.maxPages ?? 30);
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      if (out.length >= PDF_SCAN_MAX_EMBEDDED_FONTS) break;
      const page = await pdf.getPage(pageNumber);
      await page.getOperatorList();

      const seenIds = new Set<string>();
      const textContent = await page.getTextContent();
      for (const item of textContent.items) {
        if (out.length >= PDF_SCAN_MAX_EMBEDDED_FONTS) break;
        if (!("fontName" in item)) continue;
        const fontId = String((item as { fontName?: unknown }).fontName ?? "");
        if (!fontId || seenIds.has(fontId)) continue;
        seenIds.add(fontId);

        let resource: PdfFontResource | null = null;
        try {
          resource = (await page.commonObjs.get(fontId)) as PdfFontResource;
        } catch {
          try {
            resource = (await page.objs.get(fontId)) as PdfFontResource;
          } catch {
            resource = null;
          }
        }
        if (!resource) continue;

        const rawName = resource.name || resource.loadedName || resource.fallbackName || "";
        const mapped = mapPdfFontToDesigner(rawName);
        if (mapped.matched) continue;
        const familyKey = mapped.familyLabel.trim().toLowerCase();
        if (!familyKey || !missingSet.has(familyKey)) continue;

        const parsed = parsePdfFontResourceName(rawName);
        const weightLabel = parsed?.weight ?? "Regular";
        const { weight, style, italic } = designerStyleFromPdfWeightLabel(
          weightLabel,
          Boolean(resource.italic) || mapped.italic,
        );
        const dedupeKey = `${familyKey}|${style.toLowerCase()}|${weight}`;
        if (seenKeys.has(dedupeKey)) continue;

        if (isType3(resource) || resource.missingFile) {
          seenKeys.add(dedupeKey);
          continue;
        }

        const rawBytes = resource.file ?? resource.data;
        if (!rawBytes || rawBytes.length < MIN_FONT_BYTES) {
          seenKeys.add(dedupeKey);
          continue;
        }

        const mime = guessMime(rawBytes, resource.mimetype);
        if (!mime) {
          seenKeys.add(dedupeKey);
          continue;
        }

        const bytes = Buffer.from(rawBytes);
        const contentHash = sha256Hex(bytes);
        const id = `font_${contentHash.slice(0, 10)}_${out.length}`;
        const ext = extForMime(mime);
        const key = pdfScanObjectKey(
          args.userEmail,
          "pdf-scan/fonts",
          `${args.contentSha256.slice(0, 12)}-${id}.${ext}`,
        );
        await uploadBufferToS3Key(key, bytes, mime);

        seenKeys.add(dedupeKey);
        out.push({
          id,
          family: mapped.familyLabel,
          style,
          weight,
          italic,
          mime,
          url: stableKnowledgeFileUrlFromKey(key),
          s3Key: key,
          contentHash,
          sourceName: rawName,
        });
      }
    }
  } finally {
    await pdf.destroy();
  }

  return out;
}
