import type { WriterEntity } from "./writer-entities";
import { writerEntityLabel } from "./writer-entities";
import type { WriterMemoryEntry } from "./writer-memory";

export const WRITER_BROWSER_PAGE = 40;
export const WRITER_BROWSER_RECENT = 8;

const HISTORY_PREDICATE = new Set(["parents.alive", "life.alive", "experience.been"]);
const HISTORY_TEXT = /\b(?:accidente|murio|nacio|entierro|fallecio|tumba)\b/u;

export type WriterMemoryFocus =
  | { type: "index" }
  | { type: "entity"; entityId: string }
  | { type: "ideas" }
  | { type: "general" };

export function writerMemoryIndex(memory: WriterMemoryEntry[], entities: WriterEntity[]) {
  const counts = new Map<string, number>();
  let ideas = 0;
  let general = 0;
  for (const entry of memory) {
    if (entry.status === "tentative") {
      ideas += 1;
      continue;
    }
    if (entry.scope?.type === "entity") counts.set(entry.scope.entityId, (counts.get(entry.scope.entityId) ?? 0) + 1);
    else general += 1;
  }
  const characters = [...counts.entries()]
    .map(([id, count]) => ({
      id,
      label: entities.find((entity) => entity.id === id)?.label ?? writerEntityLabel(id),
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
  return {
    characters,
    ideas,
    general,
    recent: memory.slice(-WRITER_BROWSER_RECENT).reverse(),
  };
}

export function writerMemoryShelf(entry: WriterMemoryEntry): "ideas" | "historia" | "hechos" {
  if (entry.status === "tentative") return "ideas";
  const folded = entry.text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  const event = entry.facts?.some((fact) => HISTORY_PREDICATE.has(fact.predicate)) || HISTORY_TEXT.test(folded);
  return event ? "historia" : "hechos";
}

export function writerMemoryPage(entries: WriterMemoryEntry[]): WriterMemoryEntry[] {
  return entries.slice(0, WRITER_BROWSER_PAGE);
}
