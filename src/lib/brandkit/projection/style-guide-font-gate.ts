/**
 * Verificación post-render: fuentes marcadas embedded_extracted deben aparecer en el PDF.
 */

import { loadPdfJsDocumentFromBuffer } from "@/lib/brain/pdfjs-server";
import type { TypographyValue } from "../model/trait-values";
import { buildBookView } from "./book-view";
import type { Genome } from "../model/trait";
import { resolveBrandKitStyleGuideSoloValidado } from "./style-guide-export-types";
import type { BrandKitStyleGuideExportMode } from "./style-guide-export-types";

export type StyleGuideFontBlockCode = "FONT_EMBED_MISMATCH";

export type StyleGuideFontGateResult =
  | { allowed: true }
  | {
      allowed: false;
      code: StyleGuideFontBlockCode;
      message: string;
      missingFamilies: string[];
    };

function normalizeFamily(name: string): string {
  return name.replace(/\s+/g, "").toLowerCase();
}

export async function listPdfEmbeddedFontFamilies(pdfBuffer: Buffer): Promise<string[]> {
  const loaded = await loadPdfJsDocumentFromBuffer(pdfBuffer);
  const pdf = await loaded.pdf;
  const families = new Set<string>();

  try {
    const pageLimit = Math.min(pdf.numPages, 30);
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      await page.getOperatorList();
      const textContent = await page.getTextContent();
      for (const item of textContent.items) {
        if (!("fontName" in item)) continue;
        const fontId = String((item as { fontName?: unknown }).fontName ?? "");
        if (!fontId) continue;
        try {
          const resource = (await page.commonObjs.get(fontId)) as { name?: string; loadedName?: string };
          const raw = resource?.name || resource?.loadedName || "";
          const family = raw.replace(/^[A-Z]{6}\+/, "").split("-")[0]?.trim();
          if (family) families.add(family);
        } catch {
          // ignore unresolved font refs
        }
      }
    }
  } finally {
    await pdf.destroy();
  }

  return [...families];
}

export function expectedEmbeddedExtractedFamilies(
  genome: Genome,
  exportMode: BrandKitStyleGuideExportMode,
): string[] {
  const soloValidado = resolveBrandKitStyleGuideSoloValidado(exportMode);
  const view = buildBookView(genome);
  const slots = [view.typography.primary, view.typography.secondary];
  const out: string[] = [];

  for (const slot of slots) {
    if (soloValidado && slot.state !== "crowned") continue;
    const v = slot.value as TypographyValue | null;
    if (!v || v.embedStatus !== "embedded_extracted") continue;
    out.push(v.family);
  }

  return out;
}

export async function verifyStyleGuidePdfFonts(
  pdfBuffer: Buffer,
  genome: Genome,
  exportMode: BrandKitStyleGuideExportMode,
): Promise<StyleGuideFontGateResult> {
  const expected = expectedEmbeddedExtractedFamilies(genome, exportMode);
  if (expected.length === 0) return { allowed: true };

  const found = await listPdfEmbeddedFontFamilies(pdfBuffer);
  const foundNorm = new Set(found.map(normalizeFamily));
  const missing = expected.filter((family) => !foundNorm.has(normalizeFamily(family)));

  if (missing.length === 0) return { allowed: true };

  return {
    allowed: false,
    code: "FONT_EMBED_MISMATCH",
    message: `El PDF no embebe las fuentes esperadas: ${missing.join(", ")}.`,
    missingFamilies: missing,
  };
}
