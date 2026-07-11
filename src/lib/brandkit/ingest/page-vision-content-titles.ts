/**
 * contentTitles — títulos con kind para arbitraje (sin bbox).
 * titulo_obra → producto/obra; seccion_documento → estructura del documento (descartable).
 */

export type PageVisionContentTitleKind = "titulo_obra" | "seccion_documento";

export type PageVisionContentTitleEntry = {
  text: string;
  kind: PageVisionContentTitleKind;
};

const CONTENT_TITLE_KINDS = new Set<PageVisionContentTitleKind>(["titulo_obra", "seccion_documento"]);

function coerceContentTitleKind(raw: unknown): PageVisionContentTitleKind {
  if (typeof raw === "string" && CONTENT_TITLE_KINDS.has(raw as PageVisionContentTitleKind)) {
    return raw as PageVisionContentTitleKind;
  }
  return "titulo_obra";
}

/** @deprecated solo tests legacy — arbitraje usa kind, no regex. */
export function isDocumentStructureTitle(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^(índice|indice|index|table of contents|contenido|contents)$/i.test(t)) return true;
  if (/^\d+(\.\d+)*\.?\s+\S/.test(t)) return true;
  return false;
}

export function normalizeContentTitleEntries(raw: unknown, maxItems: number): PageVisionContentTitleEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: PageVisionContentTitleEntry[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      const text = entry.trim();
      if (text.length <= 1 || text.toLowerCase() === "unknown") continue;
      out.push({
        text: text.length > 200 ? text.slice(0, 200) : text,
        kind: "titulo_obra",
      });
    } else if (entry && typeof entry === "object") {
      const o = entry as { text?: unknown; kind?: unknown };
      if (typeof o.text !== "string") continue;
      const text = o.text.trim();
      if (text.length <= 1 || text.toLowerCase() === "unknown") continue;
      const kind = coerceContentTitleKind(o.kind);
      if (kind === "seccion_documento") continue;
      out.push({
        text: text.length > 200 ? text.slice(0, 200) : text,
        kind,
      });
    }
    if (out.length >= maxItems) break;
  }
  return out;
}

/** @deprecated alias — usar normalizeContentTitleEntries */
export function normalizeContentTitles(raw: unknown, maxItems: number): string[] {
  return normalizeContentTitleEntries(raw, maxItems).map((e) => e.text);
}

export function contentTitleTexts(entries: PageVisionContentTitleEntry[] | undefined): string[] {
  return (entries ?? []).map((e) => e.text);
}

export function filterProductContentTitles(entries: PageVisionContentTitleEntry[]): string[] {
  return entries.filter((e) => e.kind === "titulo_obra").map((e) => e.text);
}
