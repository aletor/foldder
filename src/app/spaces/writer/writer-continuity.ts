import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { writerBlockTextHash } from "./writer-block-id";
import { writerBlocks, writerEntitiesInDocument, writerEntityLabel, writerMemoryRepeatsEntity, writerSpeakerAt, type WriterEntity } from "./writer-entities";
import { writerClaimsInText, writerFactConflicts, writerFactsFromMemory, type WriterFact } from "./writer-facts";
import type { WriterMemoryEntry } from "./writer-memory";

export type WriterConflict = {
  key: string;
  blockId: string;
  from: number;
  to: number;
  memoryId: string;
  memoryText: string;
  here: string;
  entityLabel: string;
};

export type WriterBlockMark = {
  blockId: string;
  from: number;
  to: number;
  kind: "conflict" | "memory";
  conflict?: WriterConflict;
  related?: {
    memoryId: string;
    memoryText: string;
    entityLabel: string;
    idea: boolean;
    dismissKey: string;
  };
};

export function writerConflicts(
  doc: ProseMirrorNode,
  memory: WriterMemoryEntry[],
  dismissals: string[],
): WriterConflict[] {
  const dismissed = new Set(dismissals);
  const entities = writerEntitiesInDocument(doc);
  const conflicts: WriterConflict[] = [];
  for (const block of writerBlocks(doc)) {
    if (!block.text || !block.blockId) continue;
    const speaker = writerSpeakerAt(doc, block.from + 1);
    const claims = writerClaimsInText(block.text, speaker?.id ?? null);
    for (const entry of memory) {
      if (entry.status === "tentative" || writerMemoryRepeatsEntity(entry, entities)) continue;
      for (const fact of factsFor(entry)) {
        if (!claims.some((claim) => writerFactConflicts(fact, claim))) continue;
        const key = writerConflictKey(entry.id, fact, block.blockId, block.text);
        if (dismissed.has(key)) continue;
        conflicts.push({
          key,
          blockId: block.blockId,
          from: block.from,
          to: block.to,
          memoryId: entry.id,
          memoryText: entry.text,
          here: block.text,
          entityLabel: labelFor(fact.subject, speaker),
        });
        break;
      }
    }
  }
  return conflicts;
}

export function writerBlockMarks(
  doc: ProseMirrorNode,
  memory: WriterMemoryEntry[],
  dismissals: string[],
): WriterBlockMark[] {
  const conflicts = writerConflicts(doc, memory, dismissals);
  const conflictIds = new Set(conflicts.map((conflict) => conflict.blockId));
  const marks: WriterBlockMark[] = conflicts.map((conflict) => ({
    blockId: conflict.blockId,
    from: conflict.from,
    to: conflict.to,
    kind: "conflict",
    conflict,
  }));
  for (const block of writerBlocks(doc)) {
    if (!block.blockId || !block.text || conflictIds.has(block.blockId)) continue;
    const related = relevantMemory(doc, block.text, block.blockId, memory, dismissals, block.from);
    if (!related) continue;
    marks.push({ blockId: block.blockId, from: block.from, to: block.to, kind: "memory", related });
  }
  return marks;
}

export function writerConflictKey(memoryId: string, fact: WriterFact, blockId: string, here: string): string {
  return `${memoryId}:${fact.predicate}:${fact.object ?? ""}:${blockId}:${writerBlockTextHash(here)}`;
}

function factsFor(entry: WriterMemoryEntry): WriterFact[] {
  return entry.facts?.length ? entry.facts : writerFactsFromMemory(entry);
}

function labelFor(subject: string, speaker: WriterEntity | null): string {
  if (speaker && speaker.id === subject) return speaker.label;
  return writerEntityLabel(subject) || "General";
}

const CONCEPTS = [["cementerio", "tumba", "tumbas", "entierro", "funeral", "lapida", "sepultura"]];

function relevantMemory(
  doc: ProseMirrorNode,
  text: string,
  blockId: string,
  memory: WriterMemoryEntry[],
  dismissals: string[],
  pos?: number,
): WriterBlockMark["related"] | null {
  const speaker = writerSpeakerAt(doc, (pos ?? 0) + 1);
  const entities = writerEntitiesInDocument(doc);
  const mentioned = new Set(entities.filter((entity) => containsName(text, entity)).map((entity) => entity.id));
  const entityTokens = new Set(
    [...mentioned, speaker?.id ?? "", speaker?.label ?? ""].map((item) => foldToken(item)).filter((item) => item.length >= 3),
  );
  const dismissed = new Set(dismissals);
  let best: { score: number; related: NonNullable<WriterBlockMark["related"]> } | null = null;
  for (const entry of memory) {
    if (writerMemoryRepeatsEntity(entry, entities)) continue;
    const key = `rel:${entry.id}:${blockId}:${writerBlockTextHash(text)}`;
    if (dismissed.has(key)) continue;
    if (entry.scope?.type === "entity" && entry.scope.entityId !== speaker?.id && !mentioned.has(entry.scope.entityId)) continue;
    const score = relevanceScore(entry.text, text, entityTokens);
    if (score < 6) continue;
    if (best && best.score >= score) continue;
    const scope = entry.scope?.type === "entity" ? entry.scope : null;
    const label = scope
      ? entities.find((entity) => entity.id === scope.entityId)?.label ?? writerEntityLabel(scope.entityId)
      : speaker?.label || "General";
    best = {
      score,
      related: { memoryId: entry.id, memoryText: entry.text, entityLabel: label, idea: entry.status === "tentative", dismissKey: key },
    };
  }
  return best?.related ?? null;
}

function relevanceScore(entryText: string, blockText: string, entityTokens: Set<string>): number {
  const entryTokens = contentTokens(entryText).filter((token) => !entityTokens.has(token));
  const blockTokens = new Set(contentTokens(blockText));
  let shared = 0;
  let long = false;
  for (const token of entryTokens) {
    if (!blockTokens.has(token)) continue;
    shared += 1;
    if (token.length >= 8) long = true;
  }
  if (sharesConcept(entryText, blockText)) return Math.max(6, shared);
  if (long) return 8;
  if (shared >= 2) return 6;
  return 0;
}

function contentTokens(text: string): string[] {
  return foldToken(text)
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length >= 6);
}

function sharesConcept(left: string, right: string): boolean {
  const a = new Set(foldToken(left).split(/[^a-z0-9]+/u));
  const b = new Set(foldToken(right).split(/[^a-z0-9]+/u));
  return CONCEPTS.some((group) => group.some((word) => a.has(word)) && group.some((word) => b.has(word)));
}

function foldToken(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function containsName(text: string, entity: WriterEntity): boolean {
  const pattern = new RegExp(`(^|[^\\p{L}])${entity.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "iu");
  const upper = new RegExp(`(^|[^\\p{L}])${entity.label.toLocaleUpperCase("es").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "iu");
  return pattern.test(text) || upper.test(text);
}
