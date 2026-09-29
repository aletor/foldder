import type { Editor } from "@tiptap/core";
import type { WriterMemoryEntry } from "./writer-memory";
import { writerActiveEntityIds, writerEntitiesInDocument, writerMemoryRepeatsEntity } from "./writer-entities";
import type { WriterProfile } from "./writer-document";

const STOP = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al", "y", "o", "u",
  "en", "que", "a", "su", "sus", "por", "con", "para", "se", "es", "son", "no", "lo", "le",
  "les", "me", "te", "mi", "tu", "como", "más", "mas", "pero", "si", "ya", "hay", "este",
  "esta", "esto", "ese", "esa", "the", "and", "for", "with",
]);

export type WriterContextPackage = {
  currentBlock: string;
  chapter: string;
  memories: WriterMemoryEntry[];
  brain: string;
  line: string;
};

export function writerContextTokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 3 && !STOP.has(token));
}

export function writerContextNames(text: string): string[] {
  const found = text.match(/\b[\p{Lu}][\p{L}'-]{2,}\b/gu) ?? [];
  const names: string[] = [];
  for (const name of found) {
    const key = name.toLowerCase();
    if (STOP.has(key) || names.some((item) => item.toLowerCase() === key)) continue;
    names.push(name);
  }
  return names;
}

export function searchWriterMemory(memory: WriterMemoryEntry[], query: string, entities: { id: string; label: string }[] = []): WriterMemoryEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return memory;
  const tokens = writerContextTokens(query);
  return memory.filter((entry) => {
    const scope = entry.scope?.type === "entity" ? entry.scope : null;
    const label = scope ? entities.find((entity) => entity.id === scope.entityId)?.label ?? scope.entityId : "";
    const facts = (entry.facts ?? []).map((fact) => `${fact.predicate} ${fact.object ?? ""} ${String(fact.value)}`).join(" ");
    const text = `${entry.text} ${label} ${facts}`.toLowerCase();
    if (text.includes(needle)) return true;
    return tokens.some((token) => text.includes(token));
  });
}

export function buildWriterContextPackage(
  editor: Editor,
  input: { profile: WriterProfile; memory: WriterMemoryEntry[]; brain: string; pinId?: string | null },
): WriterContextPackage {
  const { from } = editor.state.selection;
  const $from = editor.state.doc.resolve(from);
  const currentBlock = $from.parent.isTextblock ? $from.parent.textContent.replace(/\s+/g, " ").trim() : "";
  const chapter = chapterTitleAt($from);
  const tokens = writerContextTokens(`${currentBlock} ${chapter}`);
  const names = writerContextNames(`${currentBlock} ${chapter}`).map((name) => name.toLowerCase());
  const active = writerActiveEntityIds(editor.state.doc, from);
  const entities = writerEntitiesInDocument(editor.state.doc);
  const memories =
    currentBlock.length === 0 ? [] : rankWriterMemory(input.memory, tokens, names, active, entities).slice(0, 6).map((item) => item.entry);
  if (input.pinId) {
    const pinned = input.memory.find((entry) => entry.id === input.pinId);
    if (pinned && !memories.some((entry) => entry.id === pinned.id)) memories.unshift(pinned);
  }
  const brain = input.brain.replace(/\s+/g, " ").trim().slice(0, 700);
  return {
    currentBlock,
    chapter: chapter.slice(0, 200),
    memories,
    brain,
    line: writerContextLine(currentBlock, memories),
  };
}

function writerContextLine(currentBlock: string, memories: WriterMemoryEntry[]): string {
  if (memories.length === 0) return "";
  const memoryText = memories.map((entry) => entry.text).join(" ");
  const labels: string[] = [];
  for (const name of writerContextNames(currentBlock)) {
    if (memoryText.toLowerCase().includes(name.toLowerCase())) labels.push(name);
    if (labels.length >= 2) break;
  }
  if (labels.length < 2) {
    const memoryTokens = new Set(writerContextTokens(memoryText));
    for (const token of writerContextTokens(currentBlock)) {
      if (!memoryTokens.has(token) || labels.some((label) => label.toLowerCase() === token)) continue;
      labels.push(token);
      if (labels.length >= 2) break;
    }
  }
  const count = memories.length === 1 ? "1 recuerdo" : `${memories.length} recuerdos`;
  return [...labels, count].join(" · ");
}

function rankWriterMemory(
  memory: WriterMemoryEntry[],
  tokens: string[],
  names: string[],
  active: string[],
  entities: ReturnType<typeof writerEntitiesInDocument>,
): Array<{ entry: WriterMemoryEntry; score: number }> {
  const ranked: Array<{ entry: WriterMemoryEntry; score: number }> = [];
  for (const entry of memory) {
    if (writerMemoryRepeatsEntity(entry, entities)) continue;
    const scoped = entry.scope?.type === "entity" ? entry.scope.entityId : "";
    if (scoped && !active.includes(scoped)) continue;
    const entryTokens = new Set(writerContextTokens(entry.text));
    const entryNames = writerContextNames(entry.text).map((name) => name.toLowerCase());
    let score = scoped ? 6 : 0;
    let named = false;
    for (const name of names) {
      if (entryNames.includes(name) || entry.text.toLowerCase().includes(name)) {
        score += 5;
        named = true;
      }
    }
    for (const token of tokens) {
      if (entryTokens.has(token)) score += 1;
    }
    if (entry.status !== "tentative" && entry.kind !== "idea" && score > 0) score += 1;
    if (scoped || named || score >= 3) ranked.push({ entry, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

function chapterTitleAt($pos: ReturnType<Editor["state"]["doc"]["resolve"]>): string {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name !== "chapter") continue;
    let title = "";
    node.forEach((child) => {
      if (child.type.name === "chapterTitle" && !title) title = child.textContent.trim();
    });
    return title;
  }
  return "";
}
