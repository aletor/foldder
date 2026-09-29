import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { StoryDeltaPayload, WriterUpdateStoryPreview } from "./writer-ai";
import type { StoryAskCitedBlock } from "./writer-ask-story";
import { writerAppearances, writerDocumentBlocks, type StoryDocumentBlock } from "./writer-appearances";
import { writerBlockTextHash } from "./writer-block-id";
import { applyStoryDelta, projectStory } from "./writer-story-delta";
import { applyStoryPresentation, type PresentationDelta } from "./writer-presentation";
import type { WriterStory } from "./writer-story";

/**
 * Actualizar Story solo planifica en local. Las llamadas salen después,
 * una por lote, y se detienen si un lote falla. No hay reintento.
 */

const CHAR_BUDGET = 4_200;
const BLOCK_LIMIT = 24;
const SENT_CHARS = 900;

export type StoryUpdateEntityContext = {
  id: string;
  label: string;
  definition: string;
  state: string;
  events: string[];
  facts: string[];
};

export type StoryUpdateBlock = {
  blockId: string;
  where: string;
  text: string;
};

export type StoryUpdateBatch = {
  dirty: StoryUpdateBlock[];
  context: StoryUpdateBlock[];
  entities: StoryUpdateEntityContext[];
  cited: StoryAskCitedBlock[];
  chapters: string[];
};

export type StoryUpdatePlan = {
  dirtyCount: number;
  characters: { id: string; label: string }[];
  chapters: string[];
  batches: StoryUpdateBatch[];
  calls: number;
  plannedInputChars: number;
};

export type StoryCoverage = {
  chapters: { chapterId: string | null; chapterLabel: string | null; pending: number; analyzed: number }[];
  entities: { entityId: string; pendingBlocks: number }[];
  staleSummaries: string[];
};

export function planStoryUpdate(doc: ProseMirrorNode, story: WriterStory): StoryUpdatePlan {
  const blocks = writerDocumentBlocks(doc);
  const dirty = blocks.filter((block) => story.analyzed[block.blockId] !== writerBlockTextHash(block.text));
  const appearances = writerAppearances(doc, story).appearances;
  const dirtyIds = new Set(dirty.map((block) => block.blockId));
  const visible = projectStory(story, doc);
  const packed = pack(groupsOf(dirty));
  const batches = packed.map((slice) => batchOf(slice, blocks, dirtyIds, appearances, visible));
  const characters = charactersIn(dirty, appearances, story);
  const chapters = unique(dirty.map((block) => block.chapterLabel).filter((label): label is string => Boolean(label)));
  const plannedInputChars = batches.reduce((sum, batch) => sum + batchSize(batch), 0);
  return {
    dirtyCount: dirty.length,
    characters,
    chapters,
    batches,
    calls: batches.length,
    plannedInputChars,
  };
}

export function storyUpdatePreview(plan: StoryUpdatePlan): WriterUpdateStoryPreview {
  return {
    blocks: plan.dirtyCount,
    characters: plan.characters.length,
    chapterCount: plan.chapters.length,
    calls: Math.max(1, plan.calls),
    plannedInputChars: plan.plannedInputChars,
  };
}

export function storyCoverage(doc: ProseMirrorNode, story: WriterStory): StoryCoverage {
  const blocks = writerDocumentBlocks(doc);
  const chapters = new Map<string, StoryCoverage["chapters"][number]>();
  const pendingIds = new Set<string>();
  for (const block of blocks) {
    const key = block.chapterId ?? block.chapterLabel ?? "";
    const row = chapters.get(key) ?? { chapterId: block.chapterId, chapterLabel: block.chapterLabel, pending: 0, analyzed: 0 };
    if (story.analyzed[block.blockId] === writerBlockTextHash(block.text)) row.analyzed += 1;
    else {
      row.pending += 1;
      pendingIds.add(block.blockId);
    }
    chapters.set(key, row);
  }
  const entityCounts = new Map<string, number>();
  for (const appearance of writerAppearances(doc, story).appearances) {
    if (!pendingIds.has(appearance.blockId)) continue;
    entityCounts.set(appearance.entityId, (entityCounts.get(appearance.entityId) ?? 0) + 1);
  }
  const live = new Map(blocks.map((block) => [block.blockId, writerBlockTextHash(block.text)]));
  return {
    chapters: [...chapters.values()],
    entities: [...entityCounts.entries()].map(([entityId, pendingBlocks]) => ({ entityId, pendingBlocks })),
    staleSummaries: story.chapterSummaries
      .filter((summary) => Object.entries(summary.sourceHashes).some(([id, hash]) => live.get(id) !== hash))
      .map((summary) => summary.chapterId),
  };
}

export async function executeStoryUpdate(input: {
  getDoc: () => ProseMirrorNode;
  getStory: () => WriterStory;
  plan: StoryUpdatePlan;
  request: (
    batch: StoryUpdateBatch,
    index: number,
    plan: StoryUpdatePlan,
  ) => Promise<{ ok: true; storyDelta: StoryDeltaPayload; presentationDelta?: PresentationDelta } | { ok: false; error: string; cancelled?: boolean }>;
  commit: (story: WriterStory) => void;
  onProgress?: (current: number, total: number) => void;
}): Promise<{ completed: number; total: number; cancelled: boolean; error: string | null }> {
  const total = input.plan.batches.length;
  let completed = 0;
  for (let index = 0; index < total; index += 1) {
    const batch = input.plan.batches[index];
    if (!batch) break;
    input.onProgress?.(index + 1, total);
    let result: { ok: true; storyDelta: StoryDeltaPayload; presentationDelta?: PresentationDelta } | { ok: false; error: string; cancelled?: boolean };
    try {
      result = await input.request(batch, index, input.plan);
    } catch {
      return { completed, total, cancelled: false, error: "No se ha podido actualizar Story." };
    }
    if (!result.ok) {
      const cancelled = Boolean(result.cancelled) && completed === 0;
      return { completed, total, cancelled, error: cancelled ? null : result.error };
    }
    const applied = applyStoryDelta(input.getStory(), input.getDoc(), batch.cited, result.storyDelta);
    const presented = applyStoryPresentation(
      applied.story,
      result.presentationDelta,
      batch.cited,
      batch.entities.map((entity) => entity.id),
    );
    if (applied.changed || presented.changed) input.commit(presented.story);
    completed += 1;
  }
  return { completed, total, cancelled: false, error: null };
}

function batchOf(
  slice: StoryDocumentBlock[],
  blocks: StoryDocumentBlock[],
  dirtyIds: Set<string>,
  appearances: { entityId: string; blockId: string }[],
  visible: WriterStory,
): StoryUpdateBatch {
  const context = contextBlocks(slice, blocks, dirtyIds);
  const cited = slice.map((block) => ({
    blockId: block.blockId,
    text: block.text,
    hash: writerBlockTextHash(block.text),
    order: block.order,
    chapterLabel: block.chapterLabel,
    entityIds: [...new Set(appearances.filter((item) => item.blockId === block.blockId).map((item) => item.entityId))],
  }));
  const linked = new Set(cited.flatMap((block) => block.entityIds));
  const minOrder = Math.min(...slice.map((block) => block.order));
  const entities = visible.entities
    .filter((entity) => entity.bound !== "global" && linked.has(entity.id))
    .slice(0, 6)
    .map((entity) => ({
      id: entity.id,
      label: entity.label,
      definition: clip(entity.definition, 400),
      state: clip(entity.stateSummary ?? "", 240),
      events: entity.events.filter((event) => event.order < minOrder).slice(-3).map((event) => event.text),
      facts: entity.textFacts.slice(0, 3).map((fact) => fact.text),
    }));
  return {
    dirty: slice.map(present),
    context: context.map(present),
    entities,
    cited,
    chapters: unique(slice.map((block) => block.chapterLabel).filter((label): label is string => Boolean(label))),
  };
}

function contextBlocks(slice: StoryDocumentBlock[], blocks: StoryDocumentBlock[], dirtyIds: Set<string>): StoryDocumentBlock[] {
  const first = slice[0];
  if (!first) return [];
  const key = sceneKey(first);
  return blocks.filter((block) => sceneKey(block) === key && block.order < first.order && !dirtyIds.has(block.blockId)).slice(-2);
}

function charactersIn(
  dirty: StoryDocumentBlock[],
  appearances: { entityId: string; blockId: string }[],
  story: WriterStory,
): { id: string; label: string }[] {
  const ids = new Set(dirty.map((block) => block.blockId));
  const linked = new Set(appearances.filter((item) => ids.has(item.blockId)).map((item) => item.entityId));
  return story.entities
    .filter((entity) => entity.group === "character" && entity.bound !== "global" && linked.has(entity.id))
    .map((entity) => ({ id: entity.id, label: entity.label }));
}

function groupsOf(dirty: StoryDocumentBlock[]): StoryDocumentBlock[][] {
  const order: string[] = [];
  const groups = new Map<string, StoryDocumentBlock[]>();
  for (const block of dirty) {
    const key = sceneKey(block);
    const group = groups.get(key);
    if (group) group.push(block);
    else {
      groups.set(key, [block]);
      order.push(key);
    }
  }
  return order.map((key) => groups.get(key) ?? []);
}

function pack(groups: StoryDocumentBlock[][]): StoryDocumentBlock[][] {
  const batches: StoryDocumentBlock[][] = [];
  let current: StoryDocumentBlock[] = [];
  for (const group of groups) {
    for (const slice of splitGroup(group)) {
      if (current.length > 0 && (weight(current) + weight(slice) > CHAR_BUDGET || current.length + slice.length > BLOCK_LIMIT)) {
        batches.push(current);
        current = [];
      }
      current = [...current, ...slice];
    }
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function splitGroup(blocks: StoryDocumentBlock[]): StoryDocumentBlock[][] {
  if (weight(blocks) <= CHAR_BUDGET && blocks.length <= BLOCK_LIMIT) return [blocks];
  const slices: StoryDocumentBlock[][] = [];
  let current: StoryDocumentBlock[] = [];
  for (const block of blocks) {
    const exchange = current.length > 0 && current[current.length - 1]?.type === "character" && isBeat(block);
    const overflow = weight(current) + Math.min(block.text.length, SENT_CHARS) > CHAR_BUDGET || current.length >= BLOCK_LIMIT;
    if (current.length > 0 && overflow && exchange) {
      const cue = current.pop();
      if (current.length > 0) slices.push(current);
      current = cue ? [cue] : [];
    } else if (current.length > 0 && overflow) {
      slices.push(current);
      current = [];
    }
    current.push(block);
  }
  if (current.length > 0) slices.push(current);
  return slices;
}

function isBeat(block: StoryDocumentBlock): boolean {
  return block.type === "dialogue" || block.type === "parenthetical" || block.type === "action";
}

function weight(blocks: StoryDocumentBlock[]): number {
  return blocks.reduce((sum, block) => sum + Math.min(block.text.length, SENT_CHARS), 0);
}

function sceneKey(block: StoryDocumentBlock): string {
  return `${block.chapterId ?? block.chapterLabel ?? ""}::${block.scene ?? ""}`;
}

function present(block: StoryDocumentBlock): StoryUpdateBlock {
  return {
    blockId: block.blockId,
    where: [block.chapterLabel, block.scene].filter((part): part is string => Boolean(part)).join(" · "),
    text: block.text,
  };
}

function batchSize(batch: StoryUpdateBatch): number {
  const dirty = batch.dirty.reduce((sum, block) => sum + Math.min(block.text.length, SENT_CHARS), 0);
  const context = batch.context.reduce((sum, block) => sum + block.text.length, 0);
  const known = batch.entities.reduce((sum, entity) => sum + entity.definition.length + entity.state.length, 0);
  return dirty + context + known + 800;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function clip(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}…`;
}
