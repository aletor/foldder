import { GOOGLE_FONTS_LIBRARY } from "@/app/spaces/freehand/google-fonts";
import { parsePrimaryFontFamily } from "@/app/spaces/freehand/text-outline";

const GOOGLE_FAMILY_SET = new Set(GOOGLE_FONTS_LIBRARY.map((g) => g.family));

function walkObjects(objects: Array<{ type?: string; fontFamily?: string; children?: unknown[]; content?: unknown[] }>, out: Set<string>) {
  for (const obj of objects) {
    if (!obj || typeof obj !== "object") continue;
    if (typeof obj.fontFamily === "string" && obj.fontFamily.trim()) {
      const primary = parsePrimaryFontFamily(obj.fontFamily);
      if (primary && GOOGLE_FAMILY_SET.has(primary)) out.add(primary);
    }
    if (Array.isArray(obj.children)) {
      walkObjects(obj.children as typeof objects, out);
    }
    if (Array.isArray(obj.content)) {
      walkObjects(obj.content as typeof objects, out);
    }
  }
}

/** Familias Google referenciadas en objetos Freehand (p. ej. tras import PDFScan). */
export function collectGoogleFontFamiliesFromObjects(objects: unknown[]): string[] {
  const out = new Set<string>();
  walkObjects(objects as Array<{ type?: string; fontFamily?: string; children?: unknown[]; content?: unknown[] }>, out);
  return [...out].sort((a, b) => a.localeCompare(b));
}
