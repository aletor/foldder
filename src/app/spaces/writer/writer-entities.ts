import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { isSaneCharacterCue, normalizeCharacterCue } from "./writer-cue";

export type WriterEntity = {
  id: string;
  label: string;
};

export type WriterMemoryScope =
  | { type: "global" }
  | { type: "entity"; entityId: string };

export function writerEntityId(name: string): string {
  const cue = writerEntityLabel(name);
  return cue
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

export function writerEntityLabel(name: string): string {
  const cue = normalizeCharacterCue(name);
  if (!cue) return "";
  if (cue !== cue.toLocaleUpperCase("es")) return cue;
  return cue
    .toLocaleLowerCase("es")
    .replace(/(^|[\s-])(\p{L})/gu, (_match, boundary: string, letter: string) => boundary + letter.toLocaleUpperCase("es"));
}

export function writerEntityFromCue(name: string): WriterEntity | null {
  if (!isSaneCharacterCue(name)) return null;
  const label = writerEntityLabel(name);
  const id = writerEntityId(label);
  if (!id) return null;
  return { id, label };
}

type WriterBlockSlice = {
  type: string;
  text: string;
  from: number;
  to: number;
  blockId: string;
};

export function writerBlocks(doc: ProseMirrorNode): WriterBlockSlice[] {
  const blocks: WriterBlockSlice[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    blocks.push({
      type: node.type.name,
      text: node.textContent.replace(/\s+/g, " ").trim(),
      from: pos,
      to: pos + node.nodeSize,
      blockId: typeof node.attrs.blockId === "string" ? node.attrs.blockId : "",
    });
  });
  return blocks;
}

export function writerEntitiesInDocument(doc: ProseMirrorNode): WriterEntity[] {
  const entities: WriterEntity[] = [];
  for (const block of writerBlocks(doc)) {
    if (block.type !== "character" || !block.text) continue;
    const entity = writerEntityFromCue(block.text);
    if (!entity || entities.some((item) => item.id === entity.id)) continue;
    entities.push(entity);
  }
  return entities;
}

export function writerSpeakerAt(doc: ProseMirrorNode, pos: number): WriterEntity | null {
  const clamped = Math.max(1, Math.min(pos, doc.content.size));
  const $pos = doc.resolve(clamped);
  if ($pos.parent.type.name === "character") return writerEntityFromCue($pos.parent.textContent);
  if ($pos.depth < 1) return null;
  const container = $pos.node($pos.depth - 1);
  const index = $pos.index($pos.depth - 1);
  const current = container.child(index);
  if (current.type.name !== "dialogue" && current.type.name !== "parenthetical") return null;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const previous = container.child(cursor);
    if (previous.type.name === "parenthetical") continue;
    if (previous.type.name === "character") return writerEntityFromCue(previous.textContent);
    return null;
  }
  return null;
}

export function inferWriterMemoryScope(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): { scope: WriterMemoryScope; label: string } {
  const entities = writerEntitiesInDocument(doc);
  const $from = doc.resolve(Math.max(1, Math.min(from, doc.content.size)));
  const block = $from.parent;
  if (block.type.name === "character") {
    const entity = writerEntityFromCue(block.textContent);
    if (entity) return { scope: { type: "entity", entityId: entity.id }, label: entity.label };
  }
  const speaker = writerSpeakerAt(doc, from);
  if (speaker && (block.type.name === "dialogue" || block.type.name === "parenthetical")) {
    return { scope: { type: "entity", entityId: speaker.id }, label: speaker.label };
  }
  const selected = from === to ? "" : doc.textBetween(from, to, " ").replace(/\s+/g, " ").trim();
  const selectedEntity = selected ? matchEntity(selected, entities) : null;
  if (selectedEntity && writerEntityId(selected) === selectedEntity.id) {
    return { scope: { type: "entity", entityId: selectedEntity.id }, label: selectedEntity.label };
  }
  const inBlock = entities.filter((entity) => containsEntity(block.textContent, entity));
  if (inBlock.length === 1 && inBlock[0]) {
    return { scope: { type: "entity", entityId: inBlock[0].id }, label: inBlock[0].label };
  }
  return { scope: { type: "global" }, label: "General" };
}

export type WriterRememberDraft = {
  scope: WriterMemoryScope;
  label: string;
  text: string;
  placeholder: string;
};

export function writerRememberDraft(doc: ProseMirrorNode, from: number, to: number): WriterRememberDraft {
  const inferred = inferWriterMemoryScope(doc, from, to);
  const selected = from === to ? "" : doc.textBetween(from, to, " ").replace(/\s+/g, " ").trim();
  const entityOnly = inferred.scope.type === "entity" && selected !== "" && writerEntityId(selected) === inferred.scope.entityId;
  const about = inferred.scope.type === "entity" ? `¿Qué quieres recordar sobre ${inferred.label}?` : "¿Qué quieres recordar?";
  return {
    scope: inferred.scope,
    label: inferred.label,
    text: entityOnly ? "" : selected,
    placeholder: about,
  };
}

export function writerAssignMemorySubject(
  text: string,
  entities: WriterEntity[],
  scope: WriterMemoryScope,
): { text: string; scope: WriterMemoryScope } | null {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const leading = leadingKnownEntity(cleaned, entities);
  if (scope.type === "entity") {
    if (writerEntityId(cleaned) === scope.entityId) return null;
    if (leading?.id === scope.entityId) {
      const rest = stripLeadingEntity(cleaned, leading);
      if (!rest) return null;
      return { text: rest, scope };
    }
    return { text: cleaned, scope };
  }
  if (!leading) return { text: cleaned, scope: { type: "global" } };
  const rest = stripLeadingEntity(cleaned, leading);
  if (!rest) return null;
  const others = entities.filter((entity) => entity.id !== leading.id && containsEntity(rest, entity));
  if (others.length > 0) return { text: cleaned, scope: { type: "global" } };
  return { text: rest, scope: { type: "entity", entityId: leading.id } };
}

export function writerMemoryRepeatsEntity(
  entry: { text: string; scope?: WriterMemoryScope },
  entities: WriterEntity[],
): boolean {
  const id = writerEntityId(entry.text);
  if (!id || entry.text.trim().split(/\s+/).length !== 1) return false;
  if (entry.scope?.type === "entity" && entry.scope.entityId === id) return true;
  return entities.some((entity) => entity.id === id);
}

export function writerActiveEntityIds(doc: ProseMirrorNode, pos: number): string[] {
  const ids: string[] = [];
  const add = (entity: WriterEntity | null) => {
    if (entity && !ids.includes(entity.id)) ids.push(entity.id);
  };
  add(writerSpeakerAt(doc, pos));
  const $pos = doc.resolve(Math.max(1, Math.min(pos, doc.content.size)));
  if ($pos.parent.type.name === "character") add(writerEntityFromCue($pos.parent.textContent));
  for (const entity of writerEntitiesInDocument(doc)) {
    if (containsEntity($pos.parent.textContent, entity)) add(entity);
  }
  return ids;
}

function matchEntity(text: string, entities: WriterEntity[]): WriterEntity | null {
  const id = writerEntityId(text);
  return entities.find((entity) => entity.id === id) ?? null;
}

function containsEntity(text: string, entity: WriterEntity): boolean {
  const pattern = new RegExp(`(^|[^\\p{L}])${escapeRegExp(entity.label)}(?![\\p{L}])`, "iu");
  const upper = new RegExp(`(^|[^\\p{L}])${escapeRegExp(entity.label.toLocaleUpperCase("es"))}(?![\\p{L}])`, "iu");
  return pattern.test(text) || upper.test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function leadingKnownEntity(text: string, entities: WriterEntity[]): WriterEntity | null {
  const matches = entities.filter((entity) => new RegExp(`^${escapeRegExp(entity.label)}(?![\\p{L}\\p{N}])`, "iu").test(text));
  matches.sort((a, b) => b.label.length - a.label.length);
  return matches[0] ?? null;
}

function stripLeadingEntity(text: string, entity: WriterEntity): string {
  return text.replace(new RegExp(`^${escapeRegExp(entity.label)}(?![\\p{L}\\p{N}])`, "iu"), "").replace(/^[\s,;:.–—-]+/u, "").trim();
}
