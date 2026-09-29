import { writerFactsFromMemory, inferWriterMemoryStatus, type WriterFact } from "./writer-facts";
import type { WriterMemoryScope } from "./writer-entities";

export type { WriterMemoryScope };

export const WRITER_MEMORY_LIMIT = 80;
export const WRITER_MEMORY_TEXT_LIMIT = 400;

export type WriterMemoryKind = "canon" | "idea";
export type WriterMemoryStatus = "established" | "tentative";

export type WriterMemoryEntry = {
  id: string;
  kind: WriterMemoryKind;
  status?: WriterMemoryStatus;
  text: string;
  scope?: WriterMemoryScope;
  facts?: WriterFact[];
};

export function writerMemoryCounts(memory: WriterMemoryEntry[]): { canonCount: number; ideaCount: number } {
  return {
    canonCount: memory.filter((entry) => entry.status !== "tentative").length,
    ideaCount: memory.filter((entry) => entry.status === "tentative").length,
  };
}

export function normalizeWriterMemory(value: unknown): WriterMemoryEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: WriterMemoryEntry[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const note = normalizeWriterMemoryEntry(item);
    if (!note) continue;
    const scopeId = note.scope?.type === "entity" ? note.scope.entityId : "";
    const key = `${note.status}:${scopeId}:${note.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(note);
    if (entries.length >= WRITER_MEMORY_LIMIT) break;
  }
  return entries;
}

export function createWriterMemory(
  memory: WriterMemoryEntry[],
  input: { text: string; scope?: WriterMemoryScope; status?: WriterMemoryStatus },
): { memory: WriterMemoryEntry[]; added: boolean; entry: WriterMemoryEntry | null } {
  const text = input.text.replace(/\s+/g, " ").trim();
  const status = input.status ?? inferWriterMemoryStatus(text);
  const entry: WriterMemoryEntry = {
    id: crypto.randomUUID(),
    kind: status === "tentative" ? "idea" : "canon",
    status,
    text,
    ...(input.scope && input.scope.type === "entity" ? { scope: input.scope } : {}),
    facts: writerFactsFromMemory({ text, status, scope: input.scope }),
  };
  const next = normalizeWriterMemory([...memory, entry]);
  const added = next.length > normalizeWriterMemory(memory).length;
  return { memory: next, added, entry: added ? next.find((item) => item.id === entry.id) ?? null : null };
}

export function addWriterMemory(
  memory: WriterMemoryEntry[],
  kind: WriterMemoryKind,
  text: string,
): { memory: WriterMemoryEntry[]; added: boolean } {
  const created = createWriterMemory(memory, {
    text,
    status: kind === "idea" ? "tentative" : "established",
  });
  return { memory: created.memory, added: created.added };
}

export function setWriterMemoryKind(
  memory: WriterMemoryEntry[],
  id: string,
  kind: WriterMemoryKind,
): WriterMemoryEntry[] {
  const status: WriterMemoryStatus = kind === "idea" ? "tentative" : "established";
  return normalizeWriterMemory(memory.map((entry) => (entry.id === id ? retarget(entry, { status }) : entry)));
}

export function updateWriterMemory(
  memory: WriterMemoryEntry[],
  id: string,
  patch: { text?: string; status?: WriterMemoryStatus; scope?: WriterMemoryScope },
): WriterMemoryEntry[] {
  return normalizeWriterMemory(memory.map((entry) => (entry.id === id ? retarget(entry, patch) : entry)));
}

export function removeWriterMemory(memory: WriterMemoryEntry[], id: string): WriterMemoryEntry[] {
  return memory.filter((entry) => entry.id !== id);
}

function retarget(
  entry: WriterMemoryEntry,
  patch: { text?: string; status?: WriterMemoryStatus; scope?: WriterMemoryScope },
): WriterMemoryEntry {
  const text = patch.text === undefined ? entry.text : patch.text;
  const status = patch.status ?? entry.status;
  const scope = patch.scope === undefined ? entry.scope : patch.scope.type === "entity" ? patch.scope : undefined;
  const next: WriterMemoryEntry = {
    id: entry.id,
    kind: status === "tentative" ? "idea" : "canon",
    status,
    text,
    facts: writerFactsFromMemory({ text, status, scope }),
  };
  if (scope?.type === "entity") next.scope = scope;
  return next;
}

function normalizeWriterMemoryEntry(value: unknown): WriterMemoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const text = typeof row.text === "string" ? row.text.replace(/\s+/g, " ").trim() : "";
  const kind = row.kind === "canon" || row.kind === "idea" ? row.kind : null;
  const rawStatus = row.status === "established" || row.status === "tentative" ? row.status : null;
  if (!text || (!kind && !rawStatus)) return null;
  const status: WriterMemoryStatus = rawStatus ?? (kind === "idea" ? "tentative" : "established");
  const id = typeof row.id === "string" && row.id.trim() ? row.id.trim().slice(0, 80) : crypto.randomUUID();
  const scope = normalizeScope(row.scope);
  const facts = writerFactsFromMemory({ text: text.slice(0, WRITER_MEMORY_TEXT_LIMIT), status, scope });
  return {
    id,
    kind: status === "tentative" ? "idea" : "canon",
    status,
    text: text.slice(0, WRITER_MEMORY_TEXT_LIMIT),
    ...(scope?.type === "entity" ? { scope } : {}),
    ...(facts.length ? { facts } : {}),
  };
}

function normalizeScope(value: unknown): WriterMemoryScope | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  if (row.type === "entity" && typeof row.entityId === "string" && row.entityId.trim()) {
    return { type: "entity", entityId: row.entityId.trim().slice(0, 80) };
  }
  return undefined;
}
