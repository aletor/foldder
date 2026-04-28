import type { KnowledgeDocumentEntry } from "@/app/spaces/project-assets-metadata";

function normUrl(u: string): string {
  try {
    const x = new URL(u.trim());
    x.hash = "";
    return x.toString();
  } catch {
    return u.trim().toLowerCase();
  }
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
