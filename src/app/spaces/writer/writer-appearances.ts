import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { writerEntityId } from "./writer-entities";
import { emptyWriterStory, type StoryEntity, type WriterStory } from "./writer-story";

/**
 * Una aparición es un lugar del documento, no un acontecimiento.
 * Se calcula al vuelo: el documento manda. Si el bloque desaparece, la aparición desaparece.
 * No llama a ningún modelo y no escribe Event, State ni Trace.
 */

const MENTION_TYPES = new Set(["action", "dialogue", "paragraph", "heading", "chapterTitle"]);

export type StoryAppearance = {
  entityId: string;
  blockId: string;
  chapterId: string | null;
  chapterLabel: string | null;
  scene: string | null;
  snippet: string;
  order: number;
  from: number;
  to: number;
};

export type StoryAppearanceIndex = {
  appearances: StoryAppearance[];
  ambiguous: { blockId: string; text: string }[];
};

export type StoryDocumentBlock = {
  blockId: string;
  type: string;
  text: string;
  order: number;
  chapterId: string | null;
  chapterLabel: string | null;
  scene: string | null;
};

type Phrase = { entityId: string; phrase: string; blocked: boolean };
type Place = { chapterId: string | null; chapterLabel: string | null; scene: string | null };

export function writerAppearances(doc: ProseMirrorNode, story: WriterStory): StoryAppearanceIndex {
  const indexed = indexDocument(doc, story);
  return { appearances: indexed.appearances, ambiguous: indexed.ambiguous };
}

export function writerDocumentBlocks(doc: ProseMirrorNode): StoryDocumentBlock[] {
  return indexDocument(doc, emptyWriterStory()).blocks;
}

function indexDocument(doc: ProseMirrorNode, story: WriterStory): StoryAppearanceIndex & { blocks: StoryDocumentBlock[] } {
  const phrases = mentionPhrases(story);
  const appearances: StoryAppearance[] = [];
  const ambiguous: { blockId: string; text: string }[] = [];
  const blocks: StoryDocumentBlock[] = [];
  let chapterCount = 0;
  const visit = (node: ProseMirrorNode, pos: number, ctx: Place) => {
    if (node.type.name === "chapter") {
      chapterCount += 1;
      const id = typeof node.attrs.id === "string" && node.attrs.id ? node.attrs.id : null;
      const next = { chapterId: id, chapterLabel: `CAP. ${chapterCount}`, scene: null };
      let offset = 0;
      node.forEach((child) => {
        visit(child, pos + 1 + offset, next);
        offset += child.nodeSize;
      });
      return;
    }
    if (node.type.name === "sceneHeading") ctx.scene = clean(node.textContent) || null;
    if (node.isTextblock) {
      const blockId = typeof node.attrs.blockId === "string" ? node.attrs.blockId : "";
      const text = node.textContent;
      if (!blockId || !clean(text)) return;
      blocks.push({
        blockId,
        type: node.type.name,
        text: clean(text),
        order: pos,
        chapterId: ctx.chapterId,
        chapterLabel: ctx.chapterLabel,
        scene: ctx.scene,
      });
      if (node.type.name === "character") {
        const linked = characterEntityId(node, story);
        if (linked.ambiguous) ambiguous.push({ blockId, text: clean(text) });
        if (linked.entityId) appearances.push(appearance(linked.entityId, blockId, pos, node, ctx, clean(text)));
        return;
      }
      if (!MENTION_TYPES.has(node.type.name)) return;
      const hits = mentionHits(text, phrases);
      if (hits.ambiguous) ambiguous.push({ blockId, text: clean(text) });
      const seen = new Set<string>();
      for (const hit of hits.hits) {
        if (seen.has(hit.entityId)) continue;
        seen.add(hit.entityId);
        appearances.push(appearance(hit.entityId, blockId, pos, node, ctx, snippetAround(text, hit.start, hit.end)));
      }
      return;
    }
    let offset = 0;
    node.forEach((child) => {
      visit(child, pos + 1 + offset, ctx);
      offset += child.nodeSize;
    });
  };
  visit(doc, -1, { chapterId: null, chapterLabel: null, scene: null });
  return { appearances, ambiguous, blocks };
}

export function locateStoryAppearance(
  doc: ProseMirrorNode,
  story: WriterStory,
  entityId: string,
  blockId: string,
): { from: number; to: number; focusFrom: number; focusTo: number } | null {
  const live = writerAppearances(doc, story).appearances.find((item) => item.entityId === entityId && item.blockId === blockId);
  if (!live) return null;
  let focusFrom = live.from + 1;
  let focusTo = Math.max(focusFrom, live.to - 1);
  doc.descendants((node, pos) => {
    if (pos !== live.from || !node.isTextblock) return;
    const text = node.textContent;
    const hit = node.type.name === "character" ? null : mentionHits(text, mentionPhrases(story)).hits.find((item) => item.entityId === entityId);
    if (hit) {
      focusFrom = Math.min(pos + node.nodeSize - 1, pos + 1 + hit.start);
      focusTo = Math.min(pos + node.nodeSize - 1, pos + 1 + hit.end);
    }
  });
  return { from: live.from, to: live.to, focusFrom, focusTo: Math.max(focusFrom, focusTo) };
}

export function characterLinkFixes(doc: ProseMirrorNode, story: WriterStory): { pos: number; storyEntityId: string | null }[] {
  const fixes: { pos: number; storyEntityId: string | null }[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "character") return;
    const current = typeof node.attrs.storyEntityId === "string" && node.attrs.storyEntityId ? node.attrs.storyEntityId : null;
    const next = characterEntityId(node, story).entityId;
    if (current !== next) fixes.push({ pos, storyEntityId: next });
  });
  return fixes;
}

export function storyEntitySearchText(entity: StoryEntity, appearances: StoryAppearance[]): string {
  const snippets = appearances.filter((item) => item.entityId === entity.id).map((item) => item.snippet);
  return [entity.label, entity.definition, ...entity.aliases, ...entity.notes.map((note) => note.text), ...snippets].join("\n");
}

function appearance(entityId: string, blockId: string, pos: number, node: ProseMirrorNode, ctx: Place, snippet: string): StoryAppearance {
  return {
    entityId,
    blockId,
    chapterId: ctx.chapterId,
    chapterLabel: ctx.chapterLabel,
    scene: ctx.scene,
    snippet,
    order: pos,
    from: pos,
    to: pos + node.nodeSize,
  };
}

function characterEntityId(node: ProseMirrorNode, story: WriterStory): { entityId: string | null; ambiguous: boolean } {
  const matches = story.entities.filter((entity) => cueMatches(entity, node.textContent));
  const stored = typeof node.attrs.storyEntityId === "string" ? node.attrs.storyEntityId : "";
  const linked = stored ? story.entities.find((entity) => entity.id === stored && cueMatches(entity, node.textContent)) : null;
  if (linked) return { entityId: linked.id, ambiguous: false };
  if (matches.length === 1 && matches[0]) return { entityId: matches[0].id, ambiguous: false };
  return { entityId: null, ambiguous: matches.length > 1 };
}

function cueMatches(entity: StoryEntity, cue: string): boolean {
  if (entity.bound === "global" || entity.group !== "character") return false;
  const slug = writerEntityId(cue);
  if (!slug) return false;
  return writerEntityId(entity.label) === slug || entity.aliases.some((alias) => writerEntityId(alias) === slug);
}

function mentionPhrases(story: WriterStory): Phrase[] {
  const owners = new Map<string, Set<string>>();
  const rows: { entityId: string; phrase: string }[] = [];
  for (const entity of story.entities) {
    if (entity.bound === "global") continue;
    const phrases = [entity.label, ...entity.aliases];
    const seen = new Set<string>();
    for (const phrase of phrases) {
      const folded = foldPhrase(phrase);
      if (folded.length < 2 || seen.has(folded)) continue;
      seen.add(folded);
      rows.push({ entityId: entity.id, phrase: phrase.trim() });
      const bucket = owners.get(folded) ?? new Set<string>();
      bucket.add(entity.id);
      owners.set(folded, bucket);
    }
  }
  return rows.map((row) => ({ ...row, blocked: (owners.get(foldPhrase(row.phrase))?.size ?? 0) > 1 }));
}

function mentionHits(text: string, phrases: Phrase[]): { hits: { entityId: string; start: number; end: number }[]; ambiguous: boolean } {
  const found: { entityId: string; start: number; end: number }[] = [];
  let ambiguous = false;
  const ordered = [...phrases].filter((item) => item.phrase.trim()).sort((a, b) => b.phrase.length - a.phrase.length);
  for (const phrase of ordered) {
    const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])(${escapeRegExp(phrase.phrase)})(?![\\p{L}\\p{N}])`, "giu");
    for (const match of text.matchAll(pattern)) {
      const word = match[1];
      if (!word) continue;
      const start = (match.index ?? 0) + match[0].length - word.length;
      const end = start + word.length;
      if (extendsProperName(text, end)) continue;
      if (phrase.blocked) {
        ambiguous = true;
        continue;
      }
      found.push({ entityId: phrase.entityId, start, end });
    }
  }
  found.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const taken: { entityId: string; start: number; end: number }[] = [];
  for (const hit of found) {
    if (taken.some((item) => hit.start < item.end && item.start < hit.end)) continue;
    taken.push(hit);
  }
  return { hits: taken, ambiguous };
}

function extendsProperName(text: string, end: number): boolean {
  const rest = text.slice(end);
  if (/^\s+\p{Lu}/u.test(rest)) return true;
  return /^\s+(?:(?:de|del|la|las|los)\s+)+\p{Lu}/iu.test(rest);
}

function snippetAround(text: string, start: number, end: number): string {
  const normalized = clean(text);
  if (normalized.length <= 160) return normalized;
  const focus = clean(text.slice(start, end));
  const at = focus ? normalized.toLocaleLowerCase("es").indexOf(focus.toLocaleLowerCase("es")) : 0;
  const from = Math.max(0, at - 40);
  const to = Math.min(normalized.length, Math.max(at, 0) + focus.length + 80);
  return `${from > 0 ? "…" : ""}${normalized.slice(from, to).trim()}${to < normalized.length ? "…" : ""}`;
}

function foldPhrase(value: string): string {
  return value.trim().toLocaleLowerCase("es").normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ");
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
