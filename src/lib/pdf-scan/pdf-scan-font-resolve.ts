import { parsePdfFontResourceName } from "@/lib/brain/pdf-font-extract";

const GENERIC_CSS_FAMILIES = new Set([
  "sans-serif",
  "serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "emoji",
  "math",
  "fangsong",
]);

/**
 * Resuelve el nombre tipográfico real de un resource id pdf.js (`g_d0_f1`, `F1`, …)
 * vía commonObjs / objs. Sin LLM.
 */
export async function resolvePdfFontResourceName(
  page: unknown,
  fontId: string,
): Promise<string | null> {
  if (!fontId.trim()) return null;
  const pageLike = page as {
    commonObjs?: { get?: (id: string) => Promise<unknown> | unknown };
    objs?: { get?: (id: string) => Promise<unknown> | unknown };
  };

  const read = async (store?: { get?: (id: string) => Promise<unknown> | unknown }) => {
    if (!store?.get) return null;
    try {
      const value = await Promise.resolve(store.get(fontId));
      if (!value || typeof value !== "object") return null;
      const font = value as { name?: string; loadedName?: string; fallbackName?: string };
      return font.name || font.loadedName || font.fallbackName || null;
    } catch {
      return null;
    }
  };

  return (await read(pageLike.commonObjs)) || (await read(pageLike.objs));
}

export function isGenericCssFontFamily(name: string | undefined | null): boolean {
  if (!name) return true;
  const key = name.trim().toLowerCase().replace(/^["']|["']$/g, "");
  return !key || GENERIC_CSS_FAMILIES.has(key);
}

/**
 * Elige el mejor nombre tipográfico para mapear a Designer.
 * Prioridad: nombre embebido real → resource id → CSS style (si no es genérico).
 */
export function pickPdfFontNameForMapping(args: {
  resourceFont?: string;
  embeddedName?: string | null;
  styleFamily?: string | null;
}): string | undefined {
  const embedded = args.embeddedName?.trim();
  if (embedded) {
    const parsed = parsePdfFontResourceName(embedded);
    if (parsed?.family) return embedded;
    if (!isGenericCssFontFamily(embedded)) return embedded;
  }
  const resource = args.resourceFont?.trim();
  if (resource && !/^g_d\d+_f\d+$/i.test(resource) && !isGenericCssFontFamily(resource)) {
    return resource;
  }
  const style = args.styleFamily?.trim();
  if (style && !isGenericCssFontFamily(style)) return style;
  if (embedded) return embedded;
  return resource || style || undefined;
}
