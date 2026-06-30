import type { KnowledgeDocumentEntry } from "@/app/spaces/project-assets-metadata";

export function normalizeKnowledgeUrlKey(u: string): string {
  try {
    const x = new URL(u.trim());
    x.hash = "";
    if (x.pathname.length > 1 && x.pathname.endsWith("/")) {
      x.pathname = x.pathname.replace(/\/+$/, "");
    }
    return x.toString();
  } catch {
    return u.trim().toLowerCase();
  }
}

/** @deprecated internal alias */
function normUrl(u: string): string {
  return normalizeKnowledgeUrlKey(u);
}

/**
 * `knowledge.documents` es la fuente de verdad para URLs ingeridas (format url).
 * `knowledge.urls` queda como vista auxiliar: unión deduplicada por URL normalizada.
 */
export function normalizeKnowledgeUrlsFromDocuments(documents: KnowledgeDocumentEntry[], legacyUrls: string[]): string[] {
  const fromDocs = documents
    .filter((d) => d.format === "url" && typeof d.originalSourceUrl === "string" && d.originalSourceUrl.trim())
    .map((d) => d.originalSourceUrl!.trim());
  const merged = [...legacyUrls.map((u) => u.trim()).filter(Boolean), ...fromDocs];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of merged) {
    const key = normUrl(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
}

/** True si la URL ya está en el pozo (lista auxiliar o documento format=url). */
export function isKnowledgeUrlAlreadyIngested(
  url: string,
  documents: KnowledgeDocumentEntry[],
  legacyUrls: string[],
): boolean {
  const key = normalizeKnowledgeUrlKey(url);
  if (!key) return false;
  for (const raw of normalizeKnowledgeUrlsFromDocuments(documents, legacyUrls)) {
    if (normalizeKnowledgeUrlKey(raw) === key) return true;
  }
  return false;
}
