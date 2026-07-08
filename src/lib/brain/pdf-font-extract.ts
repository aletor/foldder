import { loadPdfJsDocumentFromBuffer } from "@/lib/brain/pdfjs-server";

/** Familias de sistema / soporte — no pueden ser primary de marca. */
export const BRAND_FONT_STOPWORDS = new Set(
  [
    "arial",
    "arialmt",
    "times",
    "timesnewroman",
    "times new roman",
    "calibri",
    "verdana",
    "segoe",
    "segoeui",
    "courier",
    "courier new",
    "couriernew",
    "symbol",
    "wingdings",
    "wingdings2",
    "wingdings3",
    "zapfdingbats",
    "helvetica",
    "helveticaneue",
    "roboto",
    "opensans",
    "open sans",
  ].map((s) => s.replace(/\s+/g, "").toLowerCase()),
);

const SUBSET_PREFIX_RE = /^[A-Z]{6}\+/;

export type ParsedPdfFontName = {
  rawName: string;
  family: string;
  weight: string;
  mapKey: string;
};

export function normalizeFontFamilyLabel(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(SUBSET_PREFIX_RE, "")
    .replace(/^\/(?:[A-Z0-9]{6}\+)?/, "")
    .replace(/[,;].*$/, "")
    .replace(/^\(/, "")
    .replace(/\)$/, "")
    .trim();
  if (!cleaned || cleaned.toLowerCase() === "sans-serif") return null;
  return cleaned.split("-")[0]?.trim() || cleaned;
}

export function normalizeFontWeightLabel(rawFamilyWithWeight: string, family: string): string {
  const suffix = rawFamilyWithWeight
    .replace(SUBSET_PREFIX_RE, "")
    .slice(family.length)
    .replace(/^-/, "")
    .trim();
  if (!suffix) return "Regular";
  if (/bolditalic/i.test(suffix.replace(/\s+/g, ""))) return "Bold Italic";
  if (/italic/i.test(suffix)) return "Italic";
  if (/bold/i.test(suffix)) return "Bold";
  if (/medium/i.test(suffix)) return "Medium";
  if (/light/i.test(suffix)) return "Light";
  if (/regular/i.test(suffix)) return "Regular";
  return suffix.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function parsePdfFontResourceName(rawName: string): ParsedPdfFontName | null {
  const trimmed = rawName?.trim();
  if (!trimmed) return null;
  const family = normalizeFontFamilyLabel(trimmed);
  if (!family) return null;
  const weight = normalizeFontWeightLabel(trimmed.replace(SUBSET_PREFIX_RE, ""), family);
  return {
    rawName: trimmed,
    family,
    weight,
    mapKey: `${family}::${weight}`,
  };
}

export function isBrandFontStopword(family: string): boolean {
  const key = family.replace(/\s+/g, "").toLowerCase();
  if (BRAND_FONT_STOPWORDS.has(key)) return true;
  for (const stop of BRAND_FONT_STOPWORDS) {
    if (key.startsWith(stop)) return true;
  }
  return false;
}

function weightFromTransform(transform: number[] | undefined): number {
  const size = Math.abs(transform?.[0] ?? 0);
  if (size >= 16) return 4;
  if (size >= 12) return 3;
  if (size >= 9) return 2;
  return 1;
}

/**
 * Extrae fuentes embebidas vía pdf.js (ObjStm descomprimidos), no regex sobre bytes crudos.
 * Devuelve conteos por clave `Familia::Peso` con peso extra en titulares (transform grande).
 */
export async function parseEmbeddedPdfFontFamilies(
  buffer: Buffer,
  maxPages = 30,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const { pdfjs, pdf } = await loadPdfJsDocumentFromBuffer(buffer);
  const setFontOp = (pdfjs.OPS as Record<string, number | undefined>).setFont;

  try {
    const pageLimit = Math.min(pdf.numPages, maxPages);
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      await page.getOperatorList();

      const fontIds = new Set<string>();
      if (typeof setFontOp === "number") {
        const operatorList = await page.getOperatorList();
        for (let index = 0; index < operatorList.fnArray.length; index += 1) {
          if (operatorList.fnArray[index] !== setFontOp) continue;
          const fontId = operatorList.argsArray[index]?.[0];
          if (typeof fontId === "string" && fontId) fontIds.add(fontId);
        }
      }

      const textContent = await page.getTextContent();
      for (const item of textContent.items) {
        if (!("fontName" in item) || typeof item.fontName !== "string") continue;
        fontIds.add(item.fontName);
      }

      for (const fontId of fontIds) {
        let fontResource: { name?: string; loadedName?: string; fallbackName?: string } | null = null;
        try {
          fontResource = (await page.commonObjs.get(fontId)) as {
            name?: string;
            loadedName?: string;
            fallbackName?: string;
          };
        } catch {
          try {
            fontResource = (await page.objs.get(fontId)) as {
              name?: string;
              loadedName?: string;
              fallbackName?: string;
            };
          } catch {
            continue;
          }
        }
        const rawName = fontResource?.name || fontResource?.loadedName || fontResource?.fallbackName || "";
        const parsed = parsePdfFontResourceName(rawName);
        if (!parsed) continue;
        const textWeight = textContent.items.reduce((sum, textItem) => {
          if (!("fontName" in textItem) || textItem.fontName !== fontId) return sum;
          if (!("str" in textItem) || !String(textItem.str ?? "").trim()) return sum;
          return sum + weightFromTransform(textItem.transform);
        }, 0);
        const bump = Math.max(1, textWeight);
        counts.set(parsed.mapKey, (counts.get(parsed.mapKey) ?? 0) + bump);
      }
    }
  } finally {
    await pdf.destroy();
  }

  return counts;
}
