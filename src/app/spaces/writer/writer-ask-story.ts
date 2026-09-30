import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { writerBlockTextHash } from "./writer-block-id";
import { writerDocumentBlocks, writerAppearances, type StoryAppearance, type StoryDocumentBlock } from "./writer-appearances";
import { writerFactsFromMemory } from "./writer-facts";
import { writerContextTokens } from "./writer-retrieval";
import type { WriterAskStoryContext } from "./writer-ai";
import type { StoryConversation } from "./writer-conversation";
import { conversationPriorTurns } from "./writer-conversation";
import { candidateCueKey, currentStance, relationNeighborIds, relationRowsFor } from "./writer-relations";
import { validChapterSummaries, type StoryEntity, type WriterStory } from "./writer-story";
import { projectNavigationStory } from "./writer-presentation";
import { deriveStoryStructure, sceneChronology } from "./writer-structure";
import { writerEntityId } from "./writer-entities";
import { questionIndex, questionsMatch } from "./writer-questions";

/**
 * Ask Story arma el contexto en local. Una pregunta interpretativa = una llamada.
 * conversationSummary solo viaja con esa misma completion.
 */

const NOTE_LIMIT = 8;
const APPEARANCE_LIMIT = 4;
const FRESH_LIMIT = 4;
const FRESH_CHARS = 700;
const DEFINITION_CHARS = 1_200;
const NOTE_CHARS = 900;
const ENTITY_LIMIT = 4;
const PRIOR_CHARS = 500;
const FACT_LIMIT = 8;
const EVENT_LIMIT = 4;
const CHAPTER_SUMMARY_LIMIT = 4;

export type StoryAskScope = { type: "global" } | { type: "entity"; entityId: string };

export type StoryAskTurn = { question: string; answer: string };

export type StoryAskStableSlice = {
  entityId: string;
  label: string;
  aliases: string[];
  definition: string;
  notes: { text: string; status: "established" | "tentative"; authority: "author" | "ai" }[];
  facts: string[];
  events: string[];
  traceSummary: string;
  appearances: { blockId: string; chapterLabel: string | null; scene: string | null; snippet: string }[];
  state: string;
  relations: string[];
};

export type StoryAskFreshBlock = {
  blockId: string;
  chapterLabel: string | null;
  scene: string | null;
  text: string;
};

export type StoryAskPreview = {
  title: string;
  notes: number;
  fragments: number;
  chapters: string;
};

export type StoryAskFragment = { entityId: string; blockId: string };

export type StoryAskMetrics = {
  contextChars: number;
  entities: number;
  events: number;
  blocks: number;
  chapterSummaries: number;
  questions: number;
  local: boolean;
};

export type StoryAskOutcome =
  | {
      ok: true;
      answer: string;
      basis: string;
      local: boolean;
      suggestion: string | null;
      fragment: StoryAskFragment | null;
      conversationSummary: string | null;
      entityIds: string[];
      metrics: StoryAskMetrics;
    }
  | { ok: false; error: string; cancelled?: boolean };

export type StoryAskCitedBlock = {
  blockId: string;
  text: string;
  hash: string;
  order: number;
  chapterLabel: string | null;
  entityIds: string[];
};

export type StoryAskPackage = {
  scope: StoryAskScope;
  question: string;
  entityIds: string[];
  stableContext: StoryAskStableSlice[];
  freshContext: StoryAskFreshBlock[];
  chapterSummaries: { chapterId: string; text: string }[];
  cited: StoryAskCitedBlock[];
  basis: string;
  preview: StoryAskPreview;
  localAnswer: string | null;
  fragment: StoryAskFragment | null;
  prior: StoryAskTurn | null;
  recentTurns: StoryAskTurn[];
  conversationSummary: string;
  metrics: StoryAskMetrics;
  openQuestions: { id: string; text: string }[];
};

export function buildStoryAsk(
  doc: ProseMirrorNode,
  incoming: WriterStory,
  input: {
    scope: StoryAskScope;
    question: string;
    previous?: StoryAskTurn | null;
    conversation?: StoryConversation | null;
  },
): StoryAskPackage {
  const question = input.question.replace(/\s+/g, " ").trim();
  const tokens = writerContextTokens(question);
  const conversation = input.conversation ?? null;
  const blocks = writerDocumentBlocks(doc);
  const story = projectNavigationStory(incoming, blocks);
  const index = writerAppearances(doc, story);
  const entities = entitiesForQuestion(story, input.scope, question, conversation, index.appearances);
  const liveHashes = new Map(blocks.map((block) => [block.blockId, writerBlockTextHash(block.text)]));
  const currentChapter = [...blocks].reverse().find((block) => block.chapterLabel)?.chapterLabel ?? null;
  const maxOrder = blocks.reduce((max, block) => Math.max(max, block.order), 0);
  const aboutIdeas = /(?:^|[^\p{L}\p{N}])ideas?(?![\p{L}\p{N}])/u.test(fold(question));
  const profileFocus = entityProfileQuestion(question);
  const local = localStoryAnswer(story, index.appearances, blocks, question);
  const openQuestions = questionIndex(story.questions ?? [], liveHashes).open
    .filter((item) => input.scope.type === "entity"
      ? item.relatedEntityIds.includes(input.scope.entityId)
      : entities.some((entity) => item.relatedEntityIds.includes(entity.id)))
    .slice(0, 6)
    .map((item) => ({ id: item.id, text: item.text }));

  const notes = rankNotes(entities, input.scope, tokens, aboutIdeas);
  const hasStructured = entities.some((entity) => entity.stateSummary || entity.traceSummary || entity.events.length > 0);
  const relevantAppearances =
    profileFocus || !hasStructured
      ? rankAppearances(index.appearances, entities, input.scope, tokens, currentChapter, maxOrder, blocks, story)
      : rankAppearances(index.appearances, entities, input.scope, tokens, currentChapter, maxOrder, blocks, story).slice(0, 2);
  const fresh = rankFresh(blocks, index.appearances, entities, input.scope, tokens, currentChapter, maxOrder, story);
  const rankedChapters = rankChapterSummaries(
    validChapterSummaries(story.chapterSummaries, liveHashes),
    entities,
    tokens,
  );

  const stableContext = entities.map((entity) => ({
    ...sliceFor(entity, notes, relevantAppearances, tokens),
    relations: relationRowsFor(entity.id, story.relations ?? [], story.entities)
      .slice(0, 8)
      .map((row) => `${row.otherLabel} · ${row.phrase}`),
  }));
  const chapters = chapterLine([
    ...relevantAppearances.map((item) => item.chapterLabel),
    ...fresh.map((item) => item.chapterLabel),
    ...entities.flatMap((entity) => entity.events.map((event) => event.chapterLabel)),
  ]);
  const noteCount = stableContext.reduce((sum, slice) => sum + slice.notes.length, 0);
  const fragmentIds = new Set<string>([
    ...relevantAppearances.map((item) => item.blockId),
    ...fresh.map((item) => item.blockId),
  ]);
  const recentTurns = conversationPriorTurns(conversation).map((turn) => ({
    question: clip(turn.question, PRIOR_CHARS),
    answer: clip(turn.answer, PRIOR_CHARS),
  }));
  const conversationSummary = clip(conversation?.summary ?? "", 700);
  const basis = local
    ? local.basis
    : basisLine({
        labels: stableContext.map((slice) => slice.label),
        state: stableContext.some((slice) => slice.state.length > 0),
        trace: stableContext.some((slice) => slice.traceSummary.length > 0 || slice.events.length > 0),
        notes: noteCount,
        appearances: fragmentIds.size,
        chapters,
      });
  const preview = {
    title: joinNames(stableContext.map((slice) => slice.label)),
    notes: noteCount,
    fragments: fragmentIds.size,
    chapters,
  };
  const cited = citedBlocks(blocks, index.appearances, entities, fresh, relevantAppearances);
  const eventCount = stableContext.reduce((sum, slice) => sum + slice.events.length, 0);
  const contextChars =
    JSON.stringify(stableContext).length +
    JSON.stringify(fresh).length +
    JSON.stringify(rankedChapters).length +
    conversationSummary.length +
    JSON.stringify(recentTurns).length +
    openQuestions.reduce((sum, item) => sum + item.text.length + item.id.length, 0);
  const metrics: StoryAskMetrics = {
    contextChars,
    entities: entities.length,
    events: eventCount,
    blocks: cited.length,
    chapterSummaries: rankedChapters.length,
    questions: openQuestions.length,
    local: local != null,
  };
  return {
    scope: input.scope,
    question,
    entityIds: entities.map((entity) => entity.id),
    stableContext,
    freshContext: fresh,
    chapterSummaries: rankedChapters,
    cited,
    basis,
    preview,
    localAnswer: local?.answer ?? null,
    fragment: local ? local.fragment : freshFragment(fresh[0], index.appearances, entities),
    prior: clipTurn(input.previous ?? recentTurns[recentTurns.length - 1] ?? null),
    recentTurns,
    conversationSummary,
    metrics,
    openQuestions,
  };
}

export function storyAskContext(pkg: StoryAskPackage): WriterAskStoryContext {
  return {
    entities: pkg.stableContext.map((slice) => ({
      id: slice.entityId,
      label: slice.label,
      aliases: slice.aliases,
      definition: slice.definition,
      facts: slice.facts,
      established: slice.notes.filter((note) => note.status === "established").map((note) => note.text),
      ideas: slice.notes.filter((note) => note.status === "tentative").map((note) => note.text),
      state: slice.state,
      events: slice.events,
      traceSummary: slice.traceSummary,
      relations: slice.relations,
    })),
    appearances: pkg.stableContext.flatMap((slice) =>
      slice.appearances.map((item) => ({
        blockId: item.blockId,
        where: whereLine(slice.label, item.chapterLabel, item.scene),
        snippet: item.snippet,
      })),
    ),
    fresh: pkg.freshContext.map((block) => ({
      blockId: block.blockId,
      where: whereLine("", block.chapterLabel, block.scene),
      text: block.text,
    })),
    chapterSummaries: pkg.chapterSummaries,
    conversationSummary: pkg.conversationSummary,
    recentTurns: pkg.recentTurns,
    basis: pkg.basis,
    openQuestions: pkg.openQuestions,
  };
}

function sliceFor(entity: StoryEntity, notes: RankedNote[], appearances: StoryAppearance[], tokens: string[]): StoryAskStableSlice {
  const ownNotes = notes.filter((item) => item.entityId === entity.id).slice(0, NOTE_LIMIT);
  const ownAppearances = appearances.filter((item) => item.entityId === entity.id).slice(0, APPEARANCE_LIMIT);
  return {
    entityId: entity.id,
    label: entity.label,
    aliases: entity.aliases.filter((alias) => fold(alias) !== fold(entity.label)).slice(0, 8),
    definition: clip(entity.definition, DEFINITION_CHARS),
    notes: ownNotes.map((item) => ({ text: clip(item.text, NOTE_CHARS), status: item.status, authority: item.authority })),
    facts: factsFor(entity).slice(0, FACT_LIMIT),
    events: rankEventLines(entity, tokens).slice(0, EVENT_LIMIT),
    appearances: ownAppearances.map((item) => ({
      blockId: item.blockId,
      chapterLabel: item.chapterLabel,
      scene: item.scene,
      snippet: item.snippet,
    })),
    state: clip(entity.stateSummary ?? "", 280),
    traceSummary: clip(entity.traceSummary ?? "", 280),
    relations: [],
  };
}

function rankChapterSummaries(
  summaries: { chapterId: string; text: string }[],
  entities: StoryEntity[],
  tokens: string[],
): { chapterId: string; text: string }[] {
  if (summaries.length === 0) return [];
  const labels = entities.map((entity) => fold(entity.label)).filter((label) => label.length >= 2);
  const chapterNums = new Set(
    entities.flatMap((entity) =>
      entity.events
        .map((event) => Number((event.chapterLabel ?? "").replace(/\D/g, "")))
        .filter((value) => value > 0),
    ),
  );
  return [...summaries]
    .map((summary) => {
      const num = Number(summary.chapterId.replace(/\D/g, ""));
      const text = fold(summary.text);
      const nameHit = labels.some((label) => text.includes(label));
      const chapterHit = num > 0 && chapterNums.has(num);
      const score = (nameHit ? 8 : 0) + (chapterHit ? 6 : 0) + overlap(summary.text, tokens) * 3;
      return { summary: { chapterId: summary.chapterId, text: summary.text }, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, CHAPTER_SUMMARY_LIMIT)
    .map((row) => row.summary);
}

function factsFor(entity: StoryEntity): string[] {
  const scope = { type: "entity" as const, entityId: entity.label };
  const sources = [entity.definition, ...entity.notes.filter((note) => note.status === "established").map((note) => note.text)];
  const lines: string[] = [];
  for (const text of sources) {
    for (const fact of writerFactsFromMemory({ text, status: "established", scope })) {
      const line = factLine(fact.predicate, fact.value, fact.object);
      if (line && !lines.includes(line)) lines.push(line);
    }
  }
  for (const fact of entity.textFacts) {
    if (fact.text && !lines.includes(fact.text)) lines.push(fact.text);
  }
  return lines;
}

function rankEventLines(entity: StoryEntity, tokens: string[]): string[] {
  return [...entity.events]
    .map((event) => ({ text: event.text, score: overlap(event.text, tokens) * 5 + event.order / 100_000 }))
    .sort((a, b) => b.score - a.score)
    .map((event) => event.text);
}

function factLine(predicate: string, value: string | number | boolean, object?: string): string {
  if (predicate === "age") return `edad ${value}`;
  if (predicate === "parents.alive" && value === false) return "los padres no están vivos";
  if (predicate === "life.alive" && value === false) return "no está vivo";
  const shown = typeof value === "boolean" ? (value ? "sí" : "no") : String(value);
  return object ? `${predicate} ${object}: ${shown}` : `${predicate}: ${shown}`;
}

type RankedNote = { entityId: string; text: string; status: "established" | "tentative"; authority: "author" | "ai"; score: number };

function rankNotes(entities: StoryEntity[], scope: StoryAskScope, tokens: string[], aboutIdeas: boolean): RankedNote[] {
  const ranked: RankedNote[] = [];
  for (const entity of entities) {
    for (const note of entity.notes) {
      const matched = overlap(note.text, tokens);
      const score =
        (scope.type === "entity" && scope.entityId === entity.id ? 12 : 8) +
        matched * 20 +
        (note.status === "established" ? 5 : 0) +
        (aboutIdeas && note.status === "tentative" ? 8 : 0) +
        note.seq / 10_000;
      ranked.push({ entityId: entity.id, text: note.text, status: note.status, authority: note.authority, score });
    }
  }
  ranked.sort((a, b) => b.score - a.score);
  const chosen: RankedNote[] = [];
  for (const note of ranked) {
    const used = chosen.filter((item) => item.entityId === note.entityId).length;
    if (used >= NOTE_LIMIT || chosen.length >= NOTE_LIMIT) continue;
    chosen.push(note);
  }
  return chosen;
}

function rankAppearances(
  appearances: StoryAppearance[],
  entities: StoryEntity[],
  scope: StoryAskScope,
  tokens: string[],
  currentChapter: string | null,
  maxOrder: number,
  blocks: StoryDocumentBlock[],
  story: WriterStory,
): StoryAppearance[] {
  const ids = new Set(entities.map((entity) => entity.id));
  const ranked = appearances
    .filter((item) => ids.has(item.entityId))
    .map((item) => {
      const matched = overlap(item.snippet, tokens);
      const known = blockAnalyzed(item.blockId, blocks, story);
      const score = known && matched === 0
        ? -1
        : (scope.type === "entity" && item.entityId === scope.entityId ? 6 : 3) +
          matched * 5 +
          (item.chapterLabel && item.chapterLabel === currentChapter ? 3 : 0) +
          (maxOrder > 0 ? (item.order / maxOrder) * 2 : 0);
      return { item, score };
    })
    .filter((row) => row.score >= 0)
    .sort((a, b) => b.score - a.score || b.item.order - a.item.order);
  const chosen: StoryAppearance[] = [];
  const seen = new Set<string>();
  for (const row of ranked) {
    const key = `${row.item.entityId}:${row.item.blockId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    chosen.push(row.item);
    if (chosen.length >= APPEARANCE_LIMIT) break;
  }
  return chosen.sort((a, b) => a.order - b.order);
}

function rankFresh(
  blocks: StoryDocumentBlock[],
  appearances: StoryAppearance[],
  entities: StoryEntity[],
  scope: StoryAskScope,
  tokens: string[],
  currentChapter: string | null,
  maxOrder: number,
  story: WriterStory,
): StoryAskFreshBlock[] {
  const ids = new Set(entities.map((entity) => entity.id));
  const ranked = blocks
    .map((block) => ({ block, score: freshScore(block, blocks, appearances, ids, scope, tokens, currentChapter, maxOrder, story) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || b.block.order - a.block.order);
  const chosen: StoryDocumentBlock[] = [];
  const seen = new Set<string>();
  for (const row of ranked) {
    if (seen.has(row.block.blockId)) continue;
    seen.add(row.block.blockId);
    chosen.push(row.block);
    if (chosen.length >= FRESH_LIMIT) break;
  }
  return chosen
    .sort((a, b) => a.order - b.order)
    .map((block) => ({
      blockId: block.blockId,
      chapterLabel: block.chapterLabel,
      scene: block.scene,
      text: freshText(block, blocks),
    }));
}

function freshScore(
  block: StoryDocumentBlock,
  blocks: StoryDocumentBlock[],
  appearances: StoryAppearance[],
  ids: Set<string>,
  scope: StoryAskScope,
  tokens: string[],
  currentChapter: string | null,
  maxOrder: number,
  story: WriterStory,
): number {
  if (story.analyzed[block.blockId] === writerBlockTextHash(block.text)) return 0;
  const hits = appearances.filter((item) => item.blockId === block.blockId && ids.has(item.entityId));
  const inherited = beatAfterCue(block, blocks, appearances, ids);
  if (hits.length === 0 && !inherited && overlap(block.text, tokens) === 0) return 0;
  if (hits.length === 0 && !inherited) return 0;
  const scopeHit = hits.some((item) => scope.type === "entity" && item.entityId === scope.entityId) || (scope.type === "entity" && inherited);
  return (
    (scopeHit ? 6 : 3) +
    overlap(block.text, tokens) * 4 +
    (block.chapterLabel && block.chapterLabel === currentChapter ? 4 : 0) +
    (maxOrder > 0 ? (block.order / maxOrder) * 5 : 0) +
    (block.type === "character" ? -2 : 0) +
    (inherited ? 2 : 0)
  );
}

function blockAnalyzed(blockId: string, blocks: StoryDocumentBlock[], story: WriterStory): boolean {
  const block = blocks.find((item) => item.blockId === blockId);
  return Boolean(block && story.analyzed[blockId] === writerBlockTextHash(block.text));
}

function beatAfterCue(
  block: StoryDocumentBlock,
  blocks: StoryDocumentBlock[],
  appearances: StoryAppearance[],
  ids: Set<string>,
): boolean {
  if (block.type !== "dialogue" && block.type !== "action" && block.type !== "parenthetical") return false;
  const previous = [...blocks].reverse().find((item) => item.order < block.order && item.chapterLabel === block.chapterLabel && item.scene === block.scene);
  if (!previous || previous.type !== "character") return false;
  return appearances.some((item) => item.blockId === previous.blockId && ids.has(item.entityId));
}

function citedBlocks(
  blocks: StoryDocumentBlock[],
  appearances: StoryAppearance[],
  entities: StoryEntity[],
  fresh: StoryAskFreshBlock[],
  ranked: StoryAppearance[],
): StoryAskCitedBlock[] {
  const ids = new Set<string>([...fresh.map((block) => block.blockId), ...ranked.map((item) => item.blockId)]);
  const allowed = new Set(entities.map((entity) => entity.id));
  return blocks
    .filter((block) => ids.has(block.blockId))
    .map((block) => ({
      blockId: block.blockId,
      text: block.text,
      hash: writerBlockTextHash(block.text),
      order: block.order,
      chapterLabel: block.chapterLabel,
      entityIds: [...new Set(appearances.filter((item) => item.blockId === block.blockId && allowed.has(item.entityId)).map((item) => item.entityId))],
    }));
}

function freshText(block: StoryDocumentBlock, blocks: StoryDocumentBlock[]): string {
  if (block.type !== "character") return clip(block.text, FRESH_CHARS);
  const next = blocks.find(
    (item) =>
      item.order > block.order &&
      item.chapterLabel === block.chapterLabel &&
      item.scene === block.scene &&
      (item.type === "dialogue" || item.type === "action"),
  );
  return clip(next ? `${block.text}\n${next.text}` : block.text, FRESH_CHARS);
}

function freshFragment(
  block: StoryAskFreshBlock | undefined,
  appearances: StoryAppearance[],
  entities: StoryEntity[],
): StoryAskFragment | null {
  if (!block) return null;
  const entityId = entityIdForBlock(block.blockId, appearances, entities);
  if (!entityId) return null;
  return { entityId, blockId: block.blockId };
}

function entityIdForBlock(blockId: string, appearances: StoryAppearance[], entities: StoryEntity[]): string | null {
  return appearances.find((item) => item.blockId === blockId && entities.some((entity) => entity.id === item.entityId))?.entityId ?? entities[0]?.id ?? null;
}

function entitiesForQuestion(
  story: WriterStory,
  scope: StoryAskScope,
  question: string,
  conversation: StoryConversation | null,
  appearances: StoryAppearance[],
): StoryEntity[] {
  const chosen: StoryEntity[] = [];
  const push = (entity: StoryEntity | undefined) => {
    if (!entity || entity.bound === "global") return;
    if (chosen.some((item) => item.id === entity.id)) return;
    if (chosen.length >= ENTITY_LIMIT) return;
    chosen.push(entity);
  };
  if (scope.type === "entity") push(story.entities.find((entity) => entity.id === scope.entityId));
  for (const hit of mentionHits(story, question)) {
    push(hit);
    if (chosen.length >= ENTITY_LIMIT) break;
  }
  const profileName = entityProfileQuestion(question);
  if (profileName) {
    const resolved = resolveName(story, profileName);
    if (resolved && resolved !== "ambiguous") push(resolved);
  }
  if (conversation && (conversation.summary || conversation.recentTurns.length > 0)) {
    for (const id of conversation.relevantEntityIds) {
      push(story.entities.find((entity) => entity.id === id));
      if (chosen.length >= ENTITY_LIMIT) break;
    }
  }
  if (scope.type === "global" && chosen.length === 0 && (isInterpretive(question) || isGlobalStoryQuestion(question))) {
    const roster = isCharacterRosterQuestion(question);
    const pool = roster ? storyCharacters(story) : recentlyActiveEntities(story, appearances);
    for (const entity of pool) {
      push(entity);
      if (chosen.length >= ENTITY_LIMIT) break;
    }
  }
  const hops = needsSecondHop(question) ? 2 : 1;
  let frontier = [...chosen];
  for (let hop = 0; hop < hops && chosen.length < ENTITY_LIMIT; hop += 1) {
    const next: StoryEntity[] = [];
    for (const entity of frontier) {
      const neighbors = relationNeighborIds(story.relations ?? [], entity.id)
        .map((id) => story.entities.find((item) => item.id === id))
        .filter((item): item is StoryEntity => Boolean(item))
        .sort((a, b) => Number(a.group !== "character") - Number(b.group !== "character"));
      for (const neighbor of neighbors) {
        const before = chosen.length;
        push(neighbor);
        if (chosen.length > before) next.push(neighbor);
        if (chosen.length >= ENTITY_LIMIT) break;
      }
    }
    frontier = next;
  }
  return chosen.slice(0, ENTITY_LIMIT);
}

function needsSecondHop(question: string): boolean {
  const text = fold(question);
  return /relacion (?:tiene|hay|entre)/u.test(text) || /atravies/u.test(text);
}

function isGlobalStoryQuestion(question: string): boolean {
  const text = fold(question);
  return /(?:guion|historia|obra|relato|manuscrito|story|argumento|trama)/u.test(text);
}

function isCharacterRosterQuestion(question: string): boolean {
  const text = fold(question);
  return (
    /(?:qu[eé]|que)\s+(?:actores|personajes)\s+(?:hay|tienes|existen|tiene)/u.test(text) ||
    /(?:qui[eé]nes|quienes)\s+(?:son\s+)?(?:los\s+)?(?:actores|personajes)/u.test(text) ||
    /(?:lista|enumera)\s+(?:los\s+)?(?:actores|personajes)/u.test(text)
  );
}

function recentlyActiveEntities(story: WriterStory, appearances: StoryAppearance[]): StoryEntity[] {
  const maxOrder = appearances.reduce((max, item) => Math.max(max, item.order), 0);
  const scored = story.entities
    .filter((entity) => entity.bound !== "global")
    .map((entity) => {
      const own = appearances.filter((item) => item.entityId === entity.id);
      const last = own.reduce((max, item) => Math.max(max, item.order), 0);
      const recency = maxOrder > 0 ? last / maxOrder : 0;
      const structured = (entity.stateSummary ? 2 : 0) + (entity.traceSummary || entity.events.length ? 2 : 0);
      return { entity, score: recency * 10 + structured + own.length / 100 };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((row) => row.entity);
}

function mentionHits(story: WriterStory, question: string): StoryEntity[] {
  const phrases: { entity: StoryEntity; phrase: string; blocked: boolean }[] = [];
  const owners = new Map<string, Set<string>>();
  for (const entity of story.entities) {
    if (entity.bound === "global") continue;
    for (const phrase of [entity.label, ...entity.aliases]) {
      const key = fold(phrase);
      if (key.length < 2) continue;
      const bucket = owners.get(key) ?? new Set<string>();
      bucket.add(entity.id);
      owners.set(key, bucket);
    }
  }
  for (const entity of story.entities) {
    if (entity.bound === "global") continue;
    for (const phrase of [entity.label, ...entity.aliases]) {
      const key = fold(phrase);
      if (key.length < 2) continue;
      phrases.push({ entity, phrase: phrase.trim(), blocked: (owners.get(key)?.size ?? 0) > 1 });
    }
  }
  phrases.sort((a, b) => b.phrase.length - a.phrase.length);
  const taken: { start: number; end: number }[] = [];
  const found: StoryEntity[] = [];
  for (const phrase of phrases) {
    const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])(${escapeRegExp(phrase.phrase)})(?![\\p{L}\\p{N}])`, "giu");
    for (const match of question.matchAll(pattern)) {
      const word = match[1];
      if (!word) continue;
      const start = (match.index ?? 0) + match[0].length - word.length;
      const end = start + word.length;
      if (taken.some((item) => start < item.end && item.start < end)) continue;
      if (followedByName(question, end)) continue;
      taken.push({ start, end });
      if (!phrase.blocked && !found.some((entity) => entity.id === phrase.entity.id)) found.push(phrase.entity);
    }
  }
  return found;
}

function followedByName(text: string, end: number): boolean {
  const rest = text.slice(end);
  if (/^\s+\p{Lu}/u.test(rest)) return true;
  return /^\s+(?:de|del|la|las|los)\s+\p{Lu}/iu.test(rest);
}

type LocalHit = { answer: string; basis: string; fragment: StoryAskFragment | null };

function localStoryAnswer(
  story: WriterStory,
  appearances: StoryAppearance[],
  blocks: StoryDocumentBlock[],
  question: string,
): LocalHit | null {
  if (!question) return null;
  if (entityProfileQuestion(question)) return null;
  if (isCharacterRosterQuestion(question)) return listCharacters(story, appearances, question);
  const pending = localQuestionAnswer(story, blocks, question);
  if (pending) return pending;
  const related = localRelationAnswer(story, appearances, question);
  if (related) return related;
  if (isScriptOverviewQuestion(question)) return scriptOverviewLocal(story, appearances);
  if (isInterpretive(question)) return null;
  if (/(?:qu[eé] personajes?|qui[eé]nes?)\s+(?:est[aá]n|aparecen?)\s+menos\s+presentes(?:\s+[uú]ltimamente)?/i.test(question)) {
    return leastPresentLately(story, appearances, blocks);
  }
  if (/(?:qu[eé] personajes?|qui[eé]nes?)\s+(?:aparece|aparecen)\s+menos/i.test(question)) {
    return leastCharacters(story, appearances);
  }
  if (/(?:qui[eé]n|qu[eé] personajes?)\s+lleva(?:n)?\s+m[aá]s\s+tiempo\s+sin\s+aparecer/i.test(question)) {
    return longestAbsent(story, appearances, blocks);
  }
  const last = question.match(/(?:cu[aá]ndo|d[oó]nde)\s+apareci[oó]\s+(?:por\s+[uú]ltima\s+vez\s+)?(.+?)\s*\??\s*$/i);
  if (last?.[1] && /[uú]ltima/i.test(question)) return lastAppearance(story, appearances, cleanName(last[1]));
  const count = question.match(/cu[aá]ntas veces aparece\s+(.+?)\s*\??\s*$/i);
  if (count?.[1]) return countEntity(story, appearances, cleanName(count[1]));
  const chapter = question.match(/en qu[eé] cap[ií]tulo aparece\s+(.+?)\s*\??\s*$/i);
  if (chapter?.[1]) return chaptersOf(story, appearances, cleanName(chapter[1]));
  const first = question.match(/d[oó]nde aparece\s+(.+?)\s+por primera vez\s*\??\s*$/i);
  if (first?.[1]) return firstAppearance(story, appearances, cleanName(first[1]));
  const mention = question.match(/d[oó]nde mencion[eé]\s+(.+?)\s*\??\s*$/i);
  if (mention?.[1]) return whereMentioned(story, appearances, blocks, cleanName(mention[1]));
  const where = question.match(/^¿?\s*d[oó]nde aparece\s+(.+?)\s*\??\s*$/i);
  if (where?.[1]) return chaptersOf(story, appearances, cleanName(where[1]));
  const knows = question.match(/qu[eé]\s+sabe\s+(.+?)\s+que\s+(.+?)\s+(?:no|todav[ií]a\s+no)\s+sabe/i);
  if (knows?.[1] && knows[2]) return knowledgeGap(story, cleanName(knows[1]), cleanName(knows[2]));
  if (/cu[aá]ntas localizaciones/i.test(question)) return locationCount(blocks);
  const scenes = question.match(/en qu[eé] escenas aparece\s+(.+?)\s*\??\s*$/i);
  if (scenes?.[1]) return scenesOfCharacter(story, blocks, cleanName(scenes[1]));
  if (/cronolog[ií]a|es lineal|orden cronol[oó]gico/i.test(question)) return chronologyAnswer(blocks);
  return null;
}

function locationCount(blocks: StoryDocumentBlock[]): LocalHit {
  const count = deriveStoryStructure(blocks).locations.length;
  const answer = count === 1 ? "Hay 1 localización." : `Hay ${count} localizaciones.`;
  return { answer, basis: "Localizaciones", fragment: null };
}

function scenesOfCharacter(story: WriterStory, blocks: StoryDocumentBlock[], name: string): LocalHit | null {
  const person = resolveCue(story, name);
  if (person === "ambiguous") return { answer: "Hay más de una ficha con ese nombre.", basis: "", fragment: null };
  if (!person) return null;
  const slug = writerEntityId(person.label);
  const titles = deriveStoryStructure(blocks).units
    .filter((unit) => unit.kind === "scene" && unit.cast.some((cue) => writerEntityId(cue) === slug))
    .map((unit) => unit.title);
  if (titles.length === 0) return { answer: `${person.label} no aparece en ninguna escena.`, basis: person.label, fragment: null };
  return { answer: `${person.label} aparece en ${titles.join(", ")}.`, basis: person.label, fragment: null };
}

function chronologyAnswer(blocks: StoryDocumentBlock[]): LocalHit {
  const units = deriveStoryStructure(blocks).units;
  const clock = sceneChronology(units);
  if (!clock.confident) return { answer: "No hay tiempos suficientes para ordenar las escenas.", basis: "Cronología", fragment: null };
  if (!clock.nonlinear) return { answer: "La narración sigue el orden del documento.", basis: "Cronología", fragment: null };
  const ordered = units
    .filter((unit) => unit.chronologyOrder != null)
    .sort((a, b) => (a.chronologyOrder ?? 0) - (b.chronologyOrder ?? 0))
    .map((unit) => `${unit.timeLabel ?? ""} ${unit.title}`.trim());
  return { answer: `La narración no es lineal. Orden temporal: ${ordered.join(", ")}.`, basis: "Cronología", fragment: null };
}

function localQuestionAnswer(story: WriterStory, blocks: StoryDocumentBlock[], question: string): LocalHit | null {
  const asks =
    /cabos?|pendientes?|cuestiones?/iu.test(question) &&
    /abiert|tiene|siguen|relacionad|resuelt|avanz|sin tocar|se resolvi/iu.test(question);
  if (!asks) return null;
  const live = new Map(blocks.map((block) => [block.blockId, writerBlockTextHash(block.text)]));
  const index = questionIndex(story.questions ?? [], live);
  const currentOrder = blocks.reduce((max, block) => Math.max(max, block.order), 0);
  const place = (order: number | null) => {
    if (order == null) return "el documento";
    const block = [...blocks].reverse().find((item) => item.order <= order);
    return block?.scene || block?.chapterLabel || "el documento";
  };
  const named = question.match(/(?:tiene|de|sobre|con)\s+(.+?)\s*\??\s*$/iu);
  if (/tiene/iu.test(question) && named?.[1] && !/abiert/iu.test(named[1])) {
    const person = resolveCue(story, cleanName(named[1]));
    if (person && person !== "ambiguous") {
      const own = index.open.filter((item) => item.relatedEntityIds.includes(person.id));
      if (own.length === 0) return { answer: `${person.label} no tiene cabos abiertos.`, basis: person.label, fragment: null };
      return { answer: `${person.label}: ${own.map((item) => item.text).join(" ")}`, basis: person.label, fragment: null };
    }
  }
  if (/resuelt/iu.test(question)) {
    const needle = cleanName(question.replace(/.*cuesti[oó]n de\s+/iu, "").replace(/\?+$/u, ""));
    const found = [...index.open, ...index.resolved].find((item) => questionsMatch(item.text, needle) || fold(item.text).includes(fold(needle)));
    if (!found) return { answer: "No encuentro esa cuestión.", basis: "Pendientes", fragment: null };
    return {
      answer: found.status === "resolved" ? `${found.text} está resuelta.` : `${found.text} sigue abierta.`,
      basis: "Pendientes",
      fragment: null,
    };
  }
  if (/avanz/iu.test(question)) {
    const needle = cleanName(question.replace(/.*(?:cuesti[oó]n|cabo)\s+(?:de\s+)?/iu, "").replace(/\?+$/u, ""));
    const found = index.open.find((item) => fold(item.text).includes(fold(needle)));
    if (!found) return { answer: "No encuentro ese cabo abierto.", basis: "Pendientes", fragment: null };
    return { answer: `${found.text} Último avance: ${place(found.lastAdvancedOrder)}.`, basis: "Pendientes", fragment: null };
  }
  if (/sin tocar/iu.test(question)) {
    const ranked = [...index.open].sort((a, b) => (a.lastAdvancedOrder ?? 0) - (b.lastAdvancedOrder ?? 0));
    const oldest = ranked[0];
    if (!oldest) return { answer: "No hay cabos abiertos.", basis: "Pendientes", fragment: null };
    const gap = currentOrder - (oldest.lastAdvancedOrder ?? 0);
    return { answer: `${oldest.text} es el cabo que lleva más tiempo sin avanzar.`, basis: `${gap}`, fragment: null };
  }
  if (/se resolvi[oó]/iu.test(question)) {
    const where = question.match(/(?:escena|cap[ií]tulo)\s+(.+?)\s*\??\s*$/iu)?.[1] ?? "";
    const resolved = index.resolved.filter((item) => {
      const label = place(item.lastAdvancedOrder);
      return !where || fold(label).includes(fold(where));
    });
    if (resolved.length === 0) return { answer: "Ahí no hay cuestiones resueltas.", basis: "Pendientes", fragment: null };
    return { answer: resolved.map((item) => item.text).join(" "), basis: "Pendientes", fragment: null };
  }
  if (/relacionad/iu.test(question) && named?.[1]) {
    const subject = resolveCue(story, cleanName(named[1]));
    if (subject && subject !== "ambiguous") {
      const own = index.open.filter((item) => item.relatedEntityIds.includes(subject.id));
      if (own.length === 0) return { answer: `No hay cuestiones abiertas relacionadas con ${subject.label}.`, basis: subject.label, fragment: null };
      return { answer: own.map((item) => item.text).join(" "), basis: subject.label, fragment: null };
    }
  }
  if (index.open.length === 0) return { answer: "No hay cabos abiertos.", basis: "Pendientes", fragment: null };
  return { answer: index.open.map((item) => item.text).join(" "), basis: "Pendientes", fragment: null };
}

function localRelationAnswer(story: WriterStory, appearances: StoryAppearance[], question: string): LocalHit | null {
  const chapters = question.match(/en\s+qu[eé]\s+cap[ií]tulos\s+aparece\s+(.+?)\s*\??\s*$/iu);
  if (chapters?.[1]) return chaptersOf(story, appearances, cleanName(chapters[1]));
  const advanced = question.match(/cu[aá]ndo\s+avanz[oó]\s+(?:por\s+[uú]ltima\s+vez\s+)?(?:el\s+hilo\s+de\s+)?(.+?)\s*\??\s*$/iu);
  if (advanced?.[1] && /[uú]ltima/iu.test(question)) return lastThreadAdvance(story, cleanName(advanced[1]));
  const who = question.match(/qui[eé]n(?:es)?\s+(?:conoce|conocen|sabe|saben)\s+(?:el|la|los|las)?\s*(.+?)\s*\??\s*$/iu);
  if (who?.[1]) return whoKnows(story, cleanName(who[1]));
  const one = question.match(/^¿?\s*([^\s?]+)\s+(?:conoce|sabe)\s+(?:el|la|los|las)?\s*(.+?)\s*\??\s*$/iu);
  if (one?.[1] && one[2] && !/^(?:qu[eé]|qui[eé]n(?:es)?)$/iu.test(one[1])) return personKnows(story, cleanName(one[1]), cleanName(one[2]));
  const linked = question.match(/qui[eé]n(?:es)?\s+est[aá](?:n)?\s+relacionad[oa]s?\s+con\s+(.+?)\s*\??\s*$/iu);
  if (linked?.[1]) return whoRelated(story, cleanName(linked[1]));
  const involved = question.match(/qu[eé]\s+elementos?\s+de\s+historia\s+involucran\s+a\s+(.+?)\s*\??\s*$/iu);
  if (involved?.[1]) return historyInvolving(story, cleanName(involved[1]));
  const cross = question.match(/qu[eé]\s+asuntos?\s+(?:importantes?\s+)?atraviesan\s+a\s+(.+?)\s+y\s+(?:a\s+)?(.+?)\s*\??\s*$/iu);
  if (cross?.[1] && cross[2]) return sharedThreads(story, cleanName(cross[1]), cleanName(cross[2]));
  const between = question.match(/qu[eé]\s+relaci[oó]n\s+tiene\s+(.+?)\s+con\s+(.+?)\s*\??\s*$/iu);
  if (between?.[1] && between[2]) return directRelation(story, cleanName(between[1]), cleanName(between[2]));
  return null;
}

function whoKnows(story: WriterStory, name: string): LocalHit | null {
  const subject = resolveCue(story, name);
  if (subject === "ambiguous") return { answer: "Hay más de una ficha con ese nombre.", basis: "", fragment: null };
  if (!subject) return null;
  const known: string[] = [];
  const explicitNo: string[] = [];
  for (const person of story.entities.filter((entity) => entity.group === "character" && entity.bound !== "global")) {
    const stance = currentStance(story.relations ?? [], person.id, subject.id);
    if (stance === "known") known.push(person.label);
    if (stance === "not_known_explicit") explicitNo.push(person.label);
  }
  if (known.length === 0 && explicitNo.length === 0) {
    return { answer: `No tengo información suficiente sobre quién conoce ${subject.label}.`, basis: subject.label, fragment: null };
  }
  const parts: string[] = [];
  if (known.length > 0) {
    parts.push(`${joinNames(known)} ${known.length === 1 ? "aparece como conocedor" : "aparecen como conocedores"} de ${subject.label}.`);
  }
  if (explicitNo.length > 0) {
    parts.push(`El texto establece que ${joinNames(explicitNo)} todavía no ${explicitNo.length === 1 ? "lo conoce" : "lo conocen"}.`);
  }
  return { answer: parts.join(" "), basis: subject.label, fragment: null };
}

function personKnows(story: WriterStory, personName: string, subjectName: string): LocalHit | null {
  const person = resolveCue(story, personName);
  const subject = resolveCue(story, subjectName);
  if (person === "ambiguous" || subject === "ambiguous") return { answer: "Hay más de una ficha con ese nombre.", basis: "", fragment: null };
  if (!person || !subject) return null;
  const stance = currentStance(story.relations ?? [], person.id, subject.id);
  if (stance === "unknown") return { answer: "No tengo información suficiente para saberlo.", basis: subject.label, fragment: null };
  if (stance === "not_known_explicit") {
    return { answer: "No. El texto establece que todavía no lo conoce.", basis: subject.label, fragment: null };
  }
  return { answer: `Sí. ${person.label} conoce ${subject.label}.`, basis: subject.label, fragment: null };
}

function whoRelated(story: WriterStory, name: string): LocalHit | null {
  const subject = resolveCue(story, name);
  if (subject === "ambiguous") return { answer: "Hay más de una ficha con ese nombre.", basis: "", fragment: null };
  if (!subject) return null;
  const names = relationRowsFor(subject.id, story.relations ?? [], story.entities).map((row) => row.otherLabel);
  if (names.length === 0) return { answer: `No hay relaciones registradas para ${subject.label}.`, basis: subject.label, fragment: null };
  return { answer: `${joinNames(names)} ${names.length === 1 ? "está relacionado" : "están relacionados"} con ${subject.label}.`, basis: subject.label, fragment: null };
}

function historyInvolving(story: WriterStory, name: string): LocalHit | null {
  const person = resolveCue(story, name);
  if (person === "ambiguous") return { answer: "Hay más de una ficha con ese nombre.", basis: "", fragment: null };
  if (!person) return null;
  const rows = relationRowsFor(person.id, story.relations ?? [], story.entities);
  const elements = rows
    .map((row) => story.entities.find((entity) => entity.id === row.otherId))
    .filter((entity): entity is StoryEntity => Boolean(entity && entity.group === "story"));
  if (elements.length === 0) return { answer: `No hay elementos de Historia relacionados con ${person.label}.`, basis: person.label, fragment: null };
  return { answer: `${joinNames(elements.map((entity) => entity.label))} involucran a ${person.label}.`, basis: person.label, fragment: null };
}

function sharedThreads(story: WriterStory, leftName: string, rightName: string): LocalHit | null {
  const left = resolveCue(story, leftName);
  const right = resolveCue(story, rightName);
  if (left === "ambiguous" || right === "ambiguous") return { answer: "Hay más de una ficha con ese nombre.", basis: "", fragment: null };
  if (!left || !right) return null;
  const rightIds = new Set(relationNeighborIds(story.relations ?? [], right.id));
  const shared = relationNeighborIds(story.relations ?? [], left.id)
    .filter((id) => rightIds.has(id))
    .flatMap((id) => {
      const entity = story.entities.find((item) => item.id === id && item.group === "story");
      return entity ? [entity.label] : [];
    });
  if (shared.length === 0) return { answer: `No hay un elemento de Historia que atraviese a ${left.label} y a ${right.label}.`, basis: `${left.label} · ${right.label}`, fragment: null };
  return { answer: `${joinNames(shared)} atraviesan a ${left.label} y a ${right.label}.`, basis: `${left.label} · ${right.label}`, fragment: null };
}

function directRelation(story: WriterStory, leftName: string, rightName: string): LocalHit | null {
  const left = resolveCue(story, leftName);
  const right = resolveCue(story, rightName);
  if (left === "ambiguous" || right === "ambiguous") return { answer: "Hay más de una ficha con ese nombre.", basis: "", fragment: null };
  if (!left || !right) return null;
  const row = relationRowsFor(left.id, story.relations ?? [], story.entities).find((item) => item.otherId === right.id);
  if (!row) return { answer: `No hay una relación directa entre ${left.label} y ${right.label}.`, basis: `${left.label} · ${right.label}`, fragment: null };
  return { answer: `${left.label} y ${right.label}: ${row.phrase}.`, basis: `${left.label} · ${right.label}`, fragment: null };
}

function lastThreadAdvance(story: WriterStory, name: string): LocalHit | null {
  const subject = resolveCue(story, name);
  if (subject === "ambiguous") return { answer: "Hay más de una ficha con ese nombre.", basis: "", fragment: null };
  if (!subject) return null;
  const last = [...subject.events].sort((a, b) => b.order - a.order)[0];
  if (!last) return { answer: `${subject.label} todavía no tiene recorrido.`, basis: subject.label, fragment: null };
  const place = last.chapterLabel ? ` en ${last.chapterLabel}` : "";
  return { answer: `${subject.label} avanzó por última vez${place}: ${last.text}`, basis: subject.label, fragment: null };
}

function resolveCue(story: WriterStory, name: string): StoryEntity | "ambiguous" | null {
  const resolved = resolveName(story, name);
  if (resolved) return resolved;
  const key = candidateCueKey(name);
  if (!key) return null;
  const matches = story.entities.filter(
    (entity) => entity.bound !== "global" && [entity.label, ...entity.aliases].some((phrase) => candidateCueKey(phrase) === key),
  );
  if (matches.length > 1) return "ambiguous";
  return matches[0] ?? null;
}

function isInterpretive(question: string): boolean {
  const text = fold(question);
  return (
    /(?:^|[^\p{L}\p{N}])(?:podria|motivacion|motivaciones|afecta|afectar|afecte|relacion|relaciones|encajar|idea|ideas|hipotetico|hipotetica)(?![\p{L}\p{N}])/u.test(text) ||
    /por que(?:$|[^\p{L}\p{N}])/u.test(text) ||
    /que (?:siente|quiere|necesita|pasaria)/u.test(text)
  );
}

function isScriptOverviewQuestion(question: string): boolean {
  const text = fold(question);
  return (
    /(?:qu[eé]|que)\s+(?:me\s+)?(?:puedes?\s+)?(?:decir|cuentas?|resumes?|explicas?)\s+(?:del|de la|de el|sobre)\s+(?:guion|historia|obra|relato|manuscrito|story)/u.test(text) ||
    /(?:de\s+que\s+va|de\s+que\s+trata)\s+(?:la\s+)?(?:historia|obra|guion|relato)/u.test(text)
  );
}

function storyCharacters(story: WriterStory): StoryEntity[] {
  return story.entities.filter(
    (entity) => entity.group === "character" && entity.bound !== "global" && isLikelyCharacterLabel(entity.label),
  );
}

function isLikelyCharacterLabel(label: string): boolean {
  const text = label.trim();
  if (text.length < 2 || text.length > 48) return false;
  if (/[?¿]/.test(text)) return false;
  if (/^(?:¿|sabes|que sabes|como|qué|que)\b/iu.test(text)) return false;
  if (text.split(/\s+/).length > 6) return false;
  return true;
}

function entityProfileQuestion(question: string): string | null {
  const patterns = [
    /^perfil\s+(?:de\s+)?(.+?)\s*$/iu,
    /^ficha\s+(?:de\s+)?(.+?)\s*$/iu,
    /^(?:como|cómo)\s+es\s+(.+?)\s*$/iu,
    /^(?:describe|descripci[oó]n\s+de)\s+(.+?)\s*$/iu,
    /^(?:hablame|h[aá]blame)\s+(?:de|sobre)\s+(.+?)\s*$/iu,
  ];
  for (const pattern of patterns) {
    const match = question.match(pattern);
    const name = cleanName(match?.[1] ?? "");
    if (name.length >= 2) return name;
  }
  return null;
}

function listCharacters(story: WriterStory, appearances: StoryAppearance[], question: string): LocalHit {
  const characters = storyCharacters(story);
  if (characters.length === 0) {
    return { answer: "Todavía no hay personajes en Story. Puedes crearlos en la barra lateral o al recordar desde Write.", basis: "Story", fragment: null };
  }
  const detailed = /(?:como|cómo)\s+(?:son|es)/iu.test(question);
  const defLimit = detailed ? 280 : 120;
  const lines = characters.map((entity) => {
    const count = appearances.filter((item) => item.entityId === entity.id).length;
    const appear = count === 0 ? "sin apariciones en el texto" : count === 1 ? "1 aparición" : `${count} apariciones`;
    const def = clip(entity.definition, defLimit);
    const state = entity.stateSummary ? clip(entity.stateSummary.replace(/\n/g, " "), 120) : "";
    const tail = [def, state && detailed ? `Ahora: ${state}` : ""].filter(Boolean).join(" ");
    return tail ? `${entity.label} (${appear}): ${tail}` : `${entity.label} (${appear})`;
  });
  const label = characters.length === 1 ? "Hay 1 personaje" : `Hay ${characters.length} personajes`;
  return { answer: `${label}: ${lines.join(" ")}`, basis: "Personajes", fragment: null };
}

function scriptOverviewLocal(story: WriterStory, appearances: StoryAppearance[]): LocalHit {
  const characters = story.entities.filter((entity) => entity.group === "character" && entity.bound !== "global");
  const elements = story.entities.filter((entity) => entity.group === "story" && entity.bound !== "global");
  if (characters.length === 0 && elements.length === 0) {
    return {
      answer: "Story todavía está vacío: no hay personajes ni elementos de historia. Empieza creando fichas o escribiendo el documento.",
      basis: "Story",
      fragment: null,
    };
  }
  const parts: string[] = [];
  if (characters.length > 0) {
    const who = characters
      .slice(0, 8)
      .map((entity) => {
        const count = appearances.filter((item) => item.entityId === entity.id).length;
        const def = clip(entity.definition, 100);
        const appear = count > 0 ? `${count} aparición${count === 1 ? "" : "es"}` : "aún no aparece en el texto";
        return def ? `${entity.label} (${appear}): ${def}` : `${entity.label} (${appear})`;
      })
      .join(" ");
    parts.push(`Personajes: ${who}`);
  }
  if (elements.length > 0) {
    parts.push(`Elementos de historia: ${elements.map((entity) => entity.label).join(", ")}`);
  }
  const ideas = story.entities.flatMap((entity) => entity.notes).filter((note) => note.status === "tentative" && note.idea !== "discarded").length;
  if (ideas > 0) parts.push(`${ideas === 1 ? "1 idea pendiente" : `${ideas} ideas pendientes`} en Story.`);
  return { answer: parts.join(" "), basis: "Story", fragment: null };
}

function leastCharacters(story: WriterStory, appearances: StoryAppearance[]): LocalHit {
  const characters = story.entities.filter((entity) => entity.group === "character" && entity.bound !== "global");
  if (characters.length === 0) return { answer: "Todavía no hay personajes en Story.", basis: "", fragment: null };
  const rows = characters.map((entity) => ({
    entity,
    count: appearances.filter((item) => item.entityId === entity.id).length,
    first: appearances.find((item) => item.entityId === entity.id) ?? null,
  }));
  const seen = rows.reduce((sum, row) => sum + row.count, 0);
  if (seen === 0) return { answer: "Todavía no hay apariciones de personajes.", basis: "", fragment: null };
  const least = Math.min(...rows.map((row) => row.count));
  const top = Math.max(...rows.map((row) => row.count));
  const names = rows.filter((row) => row.count === least).map((row) => row.entity.label);
  const sample = rows.find((row) => row.count === least && row.first);
  const fragment = sample?.first ? { entityId: sample.entity.id, blockId: sample.first.blockId } : null;
  if (least === top) {
    return {
      answer: `Aparecen las mismas veces: ${rows.map((row) => `${row.entity.label} (${row.count})`).join(", ").replace(/, ([^,]*)$/, " y $1")}.`,
      basis: "apariciones",
      fragment,
    };
  }
  const label = names.length === 1 ? `Quien menos aparece es ${names[0]}` : `Quienes menos aparecen son ${joinNames(names)}`;
  const detail =
    least === 0
      ? names.length === 1
        ? "que todavía no aparece en el texto"
        : "que todavía no aparecen en el texto"
      : least === 1
        ? "con 1 aparición"
        : `con ${least} apariciones`;
  return { answer: `${label}, ${detail}.`, basis: "apariciones", fragment };
}

function leastPresentLately(story: WriterStory, appearances: StoryAppearance[], blocks: StoryDocumentBlock[]): LocalHit {
  const characters = story.entities.filter((entity) => entity.group === "character" && entity.bound !== "global");
  if (characters.length === 0) return { answer: "Todavía no hay personajes en Story.", basis: "", fragment: null };
  const maxOrder = blocks.reduce((max, block) => Math.max(max, block.order), 0);
  const cutoff = maxOrder > 0 ? maxOrder * 0.6 : 0;
  const rows = characters.map((entity) => {
    const own = appearances.filter((item) => item.entityId === entity.id);
    const recent = own.filter((item) => item.order >= cutoff).length;
    const last = own.reduce((max, item) => Math.max(max, item.order), -1);
    return { entity, recent, last, first: own[0] ?? null };
  });
  const least = Math.min(...rows.map((row) => row.recent));
  const names = rows.filter((row) => row.recent === least).sort((a, b) => a.last - b.last).map((row) => row.entity.label);
  const sample = rows.find((row) => row.recent === least);
  const fragment = sample?.first ? { entityId: sample.entity.id, blockId: sample.first.blockId } : null;
  if (names.length === 0) return { answer: "Todavía no hay apariciones de personajes.", basis: "apariciones", fragment: null };
  const label = names.length === 1 ? `Quien menos está presente últimamente es ${names[0]}` : `Quienes menos están presentes últimamente son ${joinNames(names)}`;
  return {
    answer: least === 0 ? `${label}.` : `${label}, con ${least} aparición${least === 1 ? "" : "es"} reciente${least === 1 ? "" : "s"}.`,
    basis: "apariciones",
    fragment,
  };
}

function longestAbsent(story: WriterStory, appearances: StoryAppearance[], blocks: StoryDocumentBlock[]): LocalHit {
  const characters = story.entities.filter((entity) => entity.group === "character" && entity.bound !== "global");
  if (characters.length === 0) return { answer: "Todavía no hay personajes en Story.", basis: "", fragment: null };
  const maxOrder = blocks.reduce((max, block) => Math.max(max, block.order), 0);
  const rows = characters.map((entity) => {
    const own = appearances.filter((item) => item.entityId === entity.id);
    const last = own.reduce((max, item) => Math.max(max, item.order), -1);
    return { entity, gap: last < 0 ? maxOrder + 1 : maxOrder - last, lastItem: own.sort((a, b) => b.order - a.order)[0] ?? null };
  });
  const top = Math.max(...rows.map((row) => row.gap));
  const names = rows.filter((row) => row.gap === top).map((row) => row.entity.label);
  const sample = rows.find((row) => row.gap === top);
  const fragment = sample?.lastItem ? { entityId: sample.entity.id, blockId: sample.lastItem.blockId } : null;
  const label = names.length === 1 ? `Quien lleva más tiempo sin aparecer es ${names[0]}` : `Quienes llevan más tiempo sin aparecer son ${joinNames(names)}`;
  return { answer: `${label}.`, basis: "apariciones", fragment };
}

function lastAppearance(story: WriterStory, appearances: StoryAppearance[], name: string): LocalHit {
  const resolved = resolveName(story, name);
  if (resolved === "ambiguous") return { answer: "Hay más de una ficha con ese nombre.", basis: "", fragment: null };
  if (!resolved) return { answer: `No encuentro a ${name} en Story.`, basis: "", fragment: null };
  const last = appearances.filter((item) => item.entityId === resolved.id).sort((a, b) => b.order - a.order)[0];
  if (!last) return { answer: `${resolved.label} no aparece en el texto.`, basis: "apariciones", fragment: null };
  const place = [last.chapterLabel, last.scene].filter(Boolean).join(" · ");
  return {
    answer: place
      ? `${resolved.label} apareció por última vez en ${place}: «${last.snippet}».`
      : `${resolved.label} apareció por última vez: «${last.snippet}».`,
    basis: last.chapterLabel ?? "apariciones",
    fragment: { entityId: resolved.id, blockId: last.blockId },
  };
}

function knowledgeGap(story: WriterStory, knowerName: string, otherName: string): LocalHit | null {
  const knower = resolveName(story, knowerName);
  const other = resolveName(story, otherName);
  if (knower === "ambiguous" || other === "ambiguous") return { answer: "Hay más de una ficha con ese nombre.", basis: "", fragment: null };
  if (!knower || !other) return null;
  const knowFacts = knower.stateChanges
    .filter((change) => fold(change.predicate) === "knowledge" || fold(change.text).includes("sabe"))
    .map((change) => change.text);
  const otherFacts = new Set(
    other.stateChanges
      .filter((change) => fold(change.predicate) === "knowledge" || fold(change.text).includes("sabe"))
      .map((change) => fold(change.text)),
  );
  const only = knowFacts.filter((text) => !otherFacts.has(fold(text)));
  if (only.length === 0) return null;
  return {
    answer: `${knower.label} sabe algo que ${other.label} aún no: ${only.slice(0, 3).join(" / ")}.`,
    basis: `${knower.label} · ${other.label} · Ahora`,
    fragment: null,
  };
}

function countEntity(story: WriterStory, appearances: StoryAppearance[], name: string): LocalHit {
  const resolved = resolveName(story, name);
  if (resolved === "ambiguous") return { answer: "Hay más de una ficha con ese nombre.", basis: "", fragment: null };
  if (!resolved) return { answer: `No encuentro a ${name} en Story.`, basis: "", fragment: null };
  const own = appearances.filter((item) => item.entityId === resolved.id);
  const fragment = own[0] ? { entityId: resolved.id, blockId: own[0].blockId } : null;
  if (own.length === 0) return { answer: `${resolved.label} no aparece en el texto.`, basis: "apariciones", fragment: null };
  if (own.length === 1) return { answer: `${resolved.label} aparece 1 vez.`, basis: "1 aparición", fragment };
  return { answer: `${resolved.label} aparece ${own.length} veces.`, basis: `${own.length} apariciones`, fragment };
}

function chaptersOf(story: WriterStory, appearances: StoryAppearance[], name: string): LocalHit {
  const resolved = resolveName(story, name);
  if (resolved === "ambiguous") return { answer: "Hay más de una ficha con ese nombre.", basis: "", fragment: null };
  if (!resolved) return { answer: `No encuentro a ${name} en Story.`, basis: "", fragment: null };
  const own = appearances.filter((item) => item.entityId === resolved.id);
  const fragment = own[0] ? { entityId: resolved.id, blockId: own[0].blockId } : null;
  if (own.length === 0) return { answer: `${resolved.label} no aparece en el texto.`, basis: "apariciones", fragment: null };
  const chapters = [...new Set(own.map((item) => item.chapterLabel).filter((label): label is string => Boolean(label)))];
  if (chapters.length === 0) return { answer: `${resolved.label} aparece en el texto, sin capítulo.`, basis: "apariciones", fragment };
  return { answer: `${resolved.label} aparece en ${joinNames(chapters)}.`, basis: chapterLine(chapters) || "apariciones", fragment };
}

function firstAppearance(story: WriterStory, appearances: StoryAppearance[], name: string): LocalHit {
  const resolved = resolveName(story, name);
  if (resolved === "ambiguous") return { answer: "Hay más de una ficha con ese nombre.", basis: "", fragment: null };
  if (!resolved) return { answer: `No encuentro a ${name} en Story.`, basis: "", fragment: null };
  const first = appearances.filter((item) => item.entityId === resolved.id).sort((a, b) => a.order - b.order)[0];
  if (!first) return { answer: `${resolved.label} no aparece en el texto.`, basis: "apariciones", fragment: null };
  const place = [first.chapterLabel, first.scene].filter(Boolean).join(" · ");
  return {
    answer: place
      ? `${resolved.label} aparece por primera vez en ${place}: «${first.snippet}».`
      : `${resolved.label} aparece por primera vez: «${first.snippet}».`,
    basis: first.chapterLabel ?? "apariciones",
    fragment: { entityId: resolved.id, blockId: first.blockId },
  };
}

function whereMentioned(
  story: WriterStory,
  appearances: StoryAppearance[],
  blocks: StoryDocumentBlock[],
  name: string,
): LocalHit {
  const needle = fold(name).replace(/^(?:el|la|los|las|un|una)\s+/, "").trim();
  if (needle.length < 3) return { answer: "No encuentro esa mención en el documento.", basis: "", fragment: null };
  const places = blocks.filter((block) => fold(block.text).includes(needle)).slice(0, 3);
  if (places.length > 0) {
    const listed = places
      .map((block) => {
        const where = [block.chapterLabel, block.scene].filter(Boolean).join(" · ");
        return where ? `${where}: «${clip(block.text, 120)}»` : `«${clip(block.text, 120)}»`;
      })
      .join(" ");
    const owner = appearances.find((item) => item.blockId === places[0]?.blockId);
    return {
      answer: `«${needle}» aparece en ${listed}`,
      basis: "apariciones",
      fragment: owner && places[0] ? { entityId: owner.entityId, blockId: places[0].blockId } : null,
    };
  }
  for (const entity of story.entities) {
    const note = entity.notes.find((item) => fold(item.text).includes(needle));
    if (note) return { answer: `Está en una nota de ${entity.label}: «${clip(note.text, 160)}».`, basis: "notas", fragment: null };
    if (fold(entity.definition).includes(needle)) {
      return { answer: `Está en la definición de ${entity.label}: «${clip(entity.definition, 160)}».`, basis: "Definición", fragment: null };
    }
  }
  return { answer: "No encuentro esa mención en el documento.", basis: "", fragment: null };
}

function resolveName(story: WriterStory, name: string): StoryEntity | "ambiguous" | null {
  const key = fold(name);
  if (!key) return null;
  const matches = story.entities.filter(
    (entity) => entity.bound !== "global" && [entity.label, ...entity.aliases].some((phrase) => fold(phrase) === key),
  );
  if (matches.length > 1) return "ambiguous";
  return matches[0] ?? null;
}

function cleanName(value: string): string {
  return value.replace(/[?¿!¡.]+$/g, "").replace(/\s+/g, " ").trim();
}

function basisLine(input: {
  labels: string[];
  state: boolean;
  trace: boolean;
  notes: number;
  appearances: number;
  chapters: string;
}): string {
  const parts = [
    ...input.labels.slice(0, 3),
    input.trace ? "Recorrido" : "",
    input.state ? "Ahora" : "",
    input.notes === 1 ? "1 apunte" : input.notes > 1 ? `${input.notes} apuntes` : "",
    input.appearances > 0 && !input.trace && !input.state
      ? input.appearances === 1
        ? "1 aparición"
        : `${input.appearances} apariciones`
      : "",
    input.chapters,
  ].filter((part) => part.length > 0);
  return parts.join(" · ");
}

function chapterLine(labels: (string | null)[]): string {
  const numbers = [...new Set(labels.map((label) => Number((label ?? "").replace(/\D/g, ""))).filter((value) => value > 0))].sort((a, b) => a - b);
  if (numbers.length === 0) return "";
  if (numbers.length === 1) return `CAP. ${numbers[0]}`;
  const contiguous = numbers.every((value, index) => index === 0 || value === numbers[index - 1]! + 1);
  if (contiguous) return `Capítulos ${numbers[0]}–${numbers[numbers.length - 1]}`;
  return numbers.map((value) => `CAP. ${value}`).join(" · ");
}

function whereLine(label: string, chapter: string | null, scene: string | null): string {
  return [label, chapter, scene].filter((part) => part && part.trim()).join(" · ");
}

function joinNames(labels: string[]): string {
  if (labels.length === 0) return "Historia";
  if (labels.length === 1) return labels[0] ?? "Historia";
  if (labels.length === 2) return `${labels[0]} y ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}`;
}

function clipTurn(turn: StoryAskTurn | null | undefined): StoryAskTurn | null {
  const question = clip(turn?.question ?? "", PRIOR_CHARS);
  const answer = clip(turn?.answer ?? "", PRIOR_CHARS);
  if (!question || !answer) return null;
  return { question, answer };
}

function overlap(text: string, tokens: string[]): number {
  const folded = fold(text);
  return tokens.reduce((sum, token) => sum + (token.length >= 3 && folded.includes(token) ? 1 : 0), 0);
}

function clip(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function fold(value: string): string {
  return value.toLocaleLowerCase("es").normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
