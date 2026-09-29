import { writerBlockTextHash } from "./writer-block-id";
import { isSaneCharacterCue } from "./writer-cue";
import type { WriterMemoryScope } from "./writer-entities";
import { writerEntityId, writerEntityLabel } from "./writer-entities";
import { normalizePresentation, type StoryPresentation } from "./writer-presentation";
import {
  authorRelation,
  candidateCueKey,
  mergeStoryRelations,
  normalizeDismissedCandidates,
  normalizeRelations,
  normalizeThreadCandidates,
  type StoryDismissedCandidate,
  type StoryRelation,
  type StoryThreadCandidate,
} from "./writer-relations";
import { inferWriterMemoryStatus, writerFactsFromMemory, type WriterFact } from "./writer-facts";
import type { WriterMemoryEntry, WriterMemoryStatus } from "./writer-memory";

/**
 * Story es la fuente de verdad del conocimiento narrativo.
 * `memory[]` se proyecta desde aquí para que Continuity y el retrieval sigan
 * leyendo el mismo formato. Esta fase no llama a ningún modelo.
 *
 * Ask Story, cuando exista, separa el conocimiento ya aceptado (`stableContext`)
 * de los bloques recientes aún no incorporados (`freshContext`).
 * Una actualización solo entra en Event/State si el documento la sostiene.
 * Una interpretación del modelo se queda en insights hasta que el autor la acepte.
 */

export type StoryEntityGroup = "character" | "story";

export type StoryEntityKind = "thread" | "event" | "location" | "object" | "relationship" | "concept" | "other";

export type StoryNoteProvenance = "author" | "legacy_memory" | "ai_saved";

export type StoryNote = {
  id: string;
  seq: number;
  text: string;
  status: WriterMemoryStatus;
  authority: "author" | "ai";
  /** Ausente en notas antiguas: no cuenta como propiedad explícita del autor. */
  provenance?: StoryNoteProvenance;
  idea: "pending" | "used" | "discarded" | null;
};

/** Cita literal de un bloque. No basta la confianza del modelo. */
export type StoryEvidence = {
  blockId: string;
  text: string;
};

/** Extractor actual. Si el contrato cambia, los derivados antiguos se pueden reanalizar. */
export const STORY_ANALYSIS_VERSION = 1;

/** Algo que el documento establece. El orden es el del texto, no el de creación. */
export type StoryEvent = {
  id: string;
  text: string;
  sourceBlockIds: string[];
  order: number;
  chapterLabel: string | null;
  fingerprint: string;
  /** Otras fichas del mismo acontecimiento. Ausente = solo la ficha dueña. */
  entityIds?: string[];
  /** Mismo id en cada copia cuando el acontecimiento afecta a varias fichas. */
  sharedId?: string;
  sourceHashes: Record<string, string>;
  evidence: StoryEvidence[];
  analysisVersion: number;
};

export type StoryStateChange = {
  id: string;
  predicate: string;
  value: string;
  text: string;
  sourceBlockIds: string[];
  order: number;
  sourceHashes: Record<string, string>;
  evidence: StoryEvidence[];
  analysisVersion: number;
};

export type StoryTextFact = {
  id: string;
  text: string;
  sourceBlockIds: string[];
  order: number;
  sourceHashes: Record<string, string>;
  evidence: StoryEvidence[];
  analysisVersion: number;
  authority: "text";
};

/** Preparado para el mismo lote que analiza el capítulo. */
export type StoryChapterSummary = {
  chapterId: string;
  text: string;
  sourceBlockIds: string[];
  sourceHashes: Record<string, string>;
  analysisVersion: number;
  updatedAt: string;
};

export type StoryEntityOrigin = "author" | "document";

export type StoryEntity = {
  id: string;
  label: string;
  aliases: string[];
  /** author = alta o edición explícita. document = cue absorbido. Ausente = fichas anteriores a este campo. */
  origin?: StoryEntityOrigin;
  group: StoryEntityGroup;
  /** Interno. La UI no lo muestra: todo group story vive en Historia. */
  kind?: StoryEntityKind;
  /** "global" proyecta las notas sin ámbito, como la memoria general anterior. */
  bound: "entity" | "global";
  definition: string;
  notes: StoryNote[];
  /** Trace. Vacío hasta que un delta validado encuentre acontecimientos en el documento. */
  events: StoryEvent[];
  stateChanges: StoryStateChange[];
  textFacts: StoryTextFact[];
  stateSummary: string | null;
  traceSummary: string | null;
};

export type WriterStory = {
  entities: StoryEntity[];
  looseNotes: StoryNote[];
  /** blockId → hash del texto cuando una llamada ya lo procesó. */
  analyzed: Record<string, string>;
  chapterSummaries: StoryChapterSummary[];
  /** Reservado. Se compondrá después con resúmenes de capítulo y State, sin releer el manuscrito. */
  documentSummary: string | null;
  relations?: StoryRelation[];
  threadCandidates?: StoryThreadCandidate[];
  dismissedThreadCandidates?: StoryDismissedCandidate[];
  /** Resúmenes de lectura. No son hechos ni entran en Continuity. */
  presentation?: StoryPresentation;
};

export type StoryCue = { id: string; label: string };

export type StoryStableContext = {
  definition: string;
  notes: { text: string; status: WriterMemoryStatus }[];
  stateSummary: string | null;
  traceSummary: string | null;
  facts: WriterFact[];
};

export type StoryFreshBlock = { blockId: string; text: string; hash: string };

export type StoryFreshContext = {
  blocks: StoryFreshBlock[];
};

export type StoryDocumentUpdate = {
  kind: "event" | "state";
  entityId: string;
  text: string;
  blockId: string;
};

export type StoryInsight = {
  entityId: string | null;
  text: string;
};

export function emptyWriterStory(): WriterStory {
  return {
    entities: [],
    looseNotes: [],
    analyzed: {},
    chapterSummaries: [],
    documentSummary: null,
    relations: [],
    threadCandidates: [],
    dismissedThreadCandidates: [],
  };
}

export function storyStableContext(entity: StoryEntity): StoryStableContext {
  const scope = entity.bound === "entity" && writerEntityId(entity.label) ? { type: "entity" as const, entityId: writerEntityId(entity.label) } : undefined;
  return {
    definition: entity.definition,
    notes: entity.notes.map((note) => ({ text: note.text, status: note.status })),
    stateSummary: entity.stateSummary,
    traceSummary: entity.traceSummary,
    facts: entity.notes.flatMap((note) => writerFactsFromMemory({ text: note.text, status: note.status, scope })),
  };
}

export function storyFreshContext(blocks: StoryFreshBlock[]): StoryFreshContext {
  return {
    blocks: blocks.filter((block) => block.blockId.trim() && block.text.trim()).map((block) => ({ ...block })),
  };
}

export function partitionStoryDelta(delta: {
  updates?: Array<{ kind?: unknown; entityId?: unknown; text?: unknown; blockId?: unknown; authority?: unknown }>;
  insights?: Array<{ entityId?: unknown; text?: unknown }>;
}): { updates: StoryDocumentUpdate[]; insights: StoryInsight[] } {
  const updates: StoryDocumentUpdate[] = [];
  const insights: StoryInsight[] = [];
  for (const item of delta.insights ?? []) {
    const text = clean(typeof item.text === "string" ? item.text : "");
    if (!text) continue;
    insights.push({ entityId: typeof item.entityId === "string" && item.entityId.trim() ? item.entityId.trim() : null, text });
  }
  for (const item of delta.updates ?? []) {
    const text = clean(typeof item.text === "string" ? item.text : "");
    if (!text) continue;
    const blockId = typeof item.blockId === "string" ? item.blockId.trim() : "";
    const entityId = typeof item.entityId === "string" ? item.entityId.trim() : "";
    const kind = item.kind === "state" || item.kind === "event" ? item.kind : null;
    if (item.authority === "text" && kind && blockId && entityId) updates.push({ kind, entityId, text, blockId });
    else insights.push({ entityId: entityId || null, text });
  }
  return { updates, insights };
}

export function findStoryEntity(story: WriterStory, id: string): StoryEntity | null {
  return story.entities.find((entity) => entity.id === id) ?? null;
}

export function findStoryEntityByCue(story: WriterStory, cue: string, group?: StoryEntityGroup): StoryEntity | null {
  const slug = writerEntityId(cue);
  if (!slug) return null;
  return (
    story.entities.find((entity) => {
      if (entity.bound === "global") return false;
      if (group && entity.group !== group) return false;
      return entitySlug(entity) === slug || entity.aliases.some((alias) => writerEntityId(alias) === slug);
    }) ?? null
  );
}

export function createStoryEntity(
  story: WriterStory,
  input: { label: string; group: StoryEntityGroup; kind?: StoryEntityKind; origin?: StoryEntityOrigin },
): { story: WriterStory; entity: StoryEntity | null } {
  const label = clean(input.label);
  if (!label || !writerEntityId(label)) return { story, entity: null };
  const origin = input.origin ?? "author";
  const existing = findStoryEntityByCue(story, label, input.group);
  if (existing) {
    if (origin === "author" && existing.origin !== "author") {
      const claimed = mapEntity(story, existing.id, (entity) => ({ ...entity, origin: "author" }));
      return { story: claimed, entity: { ...existing, origin: "author" } };
    }
    return { story, entity: existing };
  }
  const entity: StoryEntity = {
    id: crypto.randomUUID(),
    label,
    aliases: [label],
    origin,
    group: input.group,
    ...(input.group === "story" && input.kind ? { kind: input.kind } : {}),
    bound: "entity",
    definition: "",
    notes: [],
    events: [],
    stateChanges: [],
    textFacts: [],
    stateSummary: null,
    traceSummary: null,
  };
  return { story: { ...story, entities: [...story.entities, entity] }, entity };
}

export function renameStoryEntity(story: WriterStory, id: string, label: string): WriterStory {
  const name = clean(label);
  if (!name || !writerEntityId(name)) return story;
  return mapEntity(story, id, (entity) => {
    if (entity.label === name && entity.origin === "author") return entity;
    return { ...entity, label: name, origin: "author", aliases: rememberAlias(entity, entity.label) };
  });
}

export function removeStoryEntity(story: WriterStory, id: string): WriterStory {
  if (!story.entities.some((entity) => entity.id === id)) return story;
  return {
    ...story,
    entities: story.entities.filter((entity) => entity.id !== id),
    relations: (story.relations ?? []).filter((row) => row.fromEntityId !== id && row.toEntityId !== id),
    threadCandidates: (story.threadCandidates ?? []).map((candidate) => ({
      ...candidate,
      relatedEntityIds: candidate.relatedEntityIds.filter((item) => item !== id),
      possibleExistingEntityId: candidate.possibleExistingEntityId === id ? undefined : candidate.possibleExistingEntityId,
    })),
  };
}

export function addStoryAuthorRelation(story: WriterStory, input: { fromEntityId: string; toEntityId: string; phrase: string }): WriterStory {
  if (!findStoryEntity(story, input.fromEntityId) || !findStoryEntity(story, input.toEntityId)) return story;
  if (input.fromEntityId === input.toEntityId) return story;
  const relation = authorRelation(input);
  return { ...story, relations: mergeStoryRelations(story.relations ?? [], [relation]) };
}

export function acceptStoryThreadCandidate(story: WriterStory, candidateId: string): WriterStory {
  const candidate = (story.threadCandidates ?? []).find((item) => item.id === candidateId);
  if (!candidate) return story;
  const created = createStoryEntity(story, { label: candidate.label, group: "story", kind: "thread" });
  return {
    ...created.story,
    threadCandidates: (created.story.threadCandidates ?? []).filter((item) => item.id !== candidateId),
  };
}

export function dismissStoryThreadCandidate(story: WriterStory, candidateId: string): WriterStory {
  const candidate = (story.threadCandidates ?? []).find((item) => item.id === candidateId);
  if (!candidate) return story;
  const key = candidateCueKey(candidate.label);
  const dismissed = (story.dismissedThreadCandidates ?? []).filter((item) => item.key !== key);
  return {
    ...story,
    threadCandidates: (story.threadCandidates ?? []).filter((item) => item.id !== candidateId),
    dismissedThreadCandidates: [...dismissed, { key, sourceSignature: candidate.sourceSignature }],
  };
}

export function setStoryDefinition(story: WriterStory, id: string, definition: string): WriterStory {
  return mapEntity(story, id, (entity) =>
    entity.definition === definition && entity.origin === "author" ? entity : { ...entity, definition, origin: "author" },
  );
}

export function addStoryEntityNote(story: WriterStory, entityId: string, text: string): { story: WriterStory; added: boolean } {
  const noteText = clean(text);
  const entity = findStoryEntity(story, entityId);
  if (!noteText || !entity) return { story, added: false };
  const status = inferWriterMemoryStatus(noteText);
  if (entity.notes.some((note) => note.status === status && note.text === noteText)) return { story, added: false };
  const note = makeNote(story, noteText, status, "author");
  return {
    story: mapEntity(story, entityId, (current) => ({ ...current, origin: "author", notes: [...current.notes, note] })),
    added: true,
  };
}

/** Idea explícita del autor al pulsar «Guardar como idea». Nunca es un hecho. */
export function addStoryIdea(
  story: WriterStory,
  input: { text: string; entityId?: string | null },
): { story: WriterStory; added: boolean } {
  const text = clean(input.text);
  if (!text) return { story, added: false };
  if (input.entityId) {
    const entity = findStoryEntity(story, input.entityId);
    if (!entity) return { story, added: false };
    if (entity.notes.some((note) => note.status === "tentative" && note.text === text)) return { story, added: false };
    const note = makeNote(story, text, "tentative", "ai");
    return { story: mapEntity(story, input.entityId, (current) => ({ ...current, notes: [...current.notes, note] })), added: true };
  }
  if (story.looseNotes.some((note) => note.status === "tentative" && note.text === text)) return { story, added: false };
  return { story: { ...story, looseNotes: [...story.looseNotes, makeNote(story, text, "tentative", "ai")] }, added: true };
}

export function rememberStoryNote(
  story: WriterStory,
  input: { text: string; scope: WriterMemoryScope; cues?: StoryCue[] },
): { story: WriterStory; added: boolean } {
  const text = clean(input.text);
  if (!text) return { story, added: false };
  const scope = input.scope;
  if (scope.type !== "entity") return appendLoose(story, text);
  const cue = input.cues?.find((item) => item.id === scope.entityId);
  const label = cue?.label || writerEntityLabel(scope.entityId);
  let next = story;
  let entity = findStoryEntityByCue(next, label, "character") ?? findStoryEntityByCue(next, scope.entityId, "character");
  if (!entity) {
    const created = createStoryEntity(next, { label, group: "character" });
    if (!created.entity) return appendLoose(next, text);
    next = created.story;
    entity = created.entity;
  }
  return addStoryEntityNote(next, entity.id, text);
}

export function absorbDocumentCues(story: WriterStory, cues: StoryCue[]): WriterStory {
  let next = story;
  for (const cue of cues) {
    const label = clean(cue.label);
    if (!label || !writerEntityId(label) || !isSaneCharacterCue(label)) continue;
    const found = findStoryEntityByCue(next, label, "character");
    if (found) {
      if (!covers(found, label)) next = mapEntity(next, found.id, (entity) => ({ ...entity, aliases: withAlias(entity, label) }));
      continue;
    }
    const created = createStoryEntity(next, { label, group: "character", origin: "document" });
    next = created.story;
  }
  return next;
}

export function updateStoryNote(
  story: WriterStory,
  id: string,
  patch: { text?: string; status?: WriterMemoryStatus; scope?: WriterMemoryScope },
  cues: StoryCue[] = [],
): WriterStory {
  const located = locate(story, id);
  if (!located) return story;
  const text = patch.text === undefined ? located.note.text : clean(patch.text);
  if (!text) return removeStoryNote(story, id);
  const status = patch.status ?? located.note.status;
  const note: StoryNote = {
    ...located.note,
    text,
    status,
    provenance: "author",
    idea: status === "tentative" ? located.note.idea ?? "pending" : null,
  };
  let next = detach(story, id);
  const scope = patch.scope;
  if (scope?.type === "entity") {
    const cue = cues.find((item) => item.id === scope.entityId);
    const label = cue?.label || writerEntityLabel(scope.entityId);
    let entity = findStoryEntityByCue(next, label, "character");
    if (!entity) {
      const created = createStoryEntity(next, { label, group: "character" });
      if (!created.entity) return { ...next, looseNotes: [...next.looseNotes, note] };
      next = created.story;
      entity = created.entity;
    }
    return mapEntity(next, entity.id, (current) => ({ ...current, notes: [...current.notes, note] }));
  }
  if (scope?.type === "global" || located.where === "loose") {
    return { ...next, looseNotes: [...next.looseNotes, note] };
  }
  return mapEntity(next, located.entityId, (current) => ({ ...current, notes: [...current.notes, note] }));
}

export function removeStoryNote(story: WriterStory, id: string): WriterStory {
  return detach(story, id);
}

/** Solo para UI de ideas: pending / usada / descartada. No toca Continuity ni Facts. */
export function setStoryNoteIdea(
  story: WriterStory,
  id: string,
  idea: "pending" | "used" | "discarded",
): WriterStory {
  const located = locate(story, id);
  if (!located || located.note.status !== "tentative") return story;
  const note: StoryNote = { ...located.note, idea };
  const next = detach(story, id);
  if (located.where === "loose") return { ...next, looseNotes: [...next.looseNotes, note] };
  return mapEntity(next, located.entityId, (current) => ({ ...current, notes: [...current.notes, note] }));
}

export function setStoryEntityAliases(story: WriterStory, id: string, aliases: string[]): WriterStory {
  const cleaned = [...new Set(aliases.map((alias) => clean(alias)).filter(Boolean))].slice(0, 12);
  return mapEntity(story, id, (entity) => {
    const label = entity.label;
    const next = cleaned.includes(label) ? cleaned : [label, ...cleaned];
    if (next.join("\n") === entity.aliases.join("\n") && entity.origin === "author") return entity;
    return { ...entity, aliases: next, origin: "author" };
  });
}

export function storyIdeaCount(story: WriterStory): number {
  return allNotes(story).filter((note) => note.status === "tentative" && note.idea !== "discarded").length;
}

export function migrateMemoryToStory(value: unknown): WriterStory {
  const rows = legacyNotes(value);
  let story = emptyWriterStory();
  let generalId: string | null = null;
  rows.forEach((row, index) => {
    const note: StoryNote = {
      id: row.id,
      seq: index + 1,
      text: row.text,
      status: row.status,
      authority: "author",
      provenance: "legacy_memory",
      idea: row.status === "tentative" ? "pending" : null,
    };
    if (row.scope?.type === "entity") {
      const label = labelFromLegacyId(row.scope.entityId);
      let entity = findStoryEntityByCue(story, label, "character");
      if (!entity) {
        const created = createStoryEntity(story, { label: label || row.scope.entityId, group: "character", origin: "document" });
        story = created.story;
        entity = created.entity;
      }
      if (!entity) {
        story = { ...story, looseNotes: [...story.looseNotes, note] };
        return;
      }
      const entityId = entity.id;
      story = mapEntity(story, entityId, (current) => ({ ...current, notes: [...current.notes, note] }));
      return;
    }
    if (row.status === "tentative") {
      story = { ...story, looseNotes: [...story.looseNotes, note] };
      return;
    }
    if (!generalId) {
      const general: StoryEntity = {
        id: crypto.randomUUID(),
        label: "General",
        aliases: ["General"],
        group: "story",
        bound: "global",
        definition: "",
        notes: [],
        events: [],
        stateChanges: [],
        textFacts: [],
        stateSummary: null,
        traceSummary: null,
      };
      generalId = general.id;
      story = { ...story, entities: [...story.entities, general] };
    }
    const id = generalId;
    story = mapEntity(story, id, (current) => ({ ...current, notes: [...current.notes, note] }));
  });
  return story;
}

export function projectWriterMemory(story: WriterStory, cueSlugs: string[] = []): WriterMemoryEntry[] {
  const notes = allNotes(story).sort((a, b) => a.seq - b.seq);
  const projected = notes.map((note) => {
    const entity = story.entities.find((item) => item.notes.some((candidate) => candidate.id === note.id));
    const scope = entity ? scopeFor(entity, cueSlugs) : undefined;
    const entry: WriterMemoryEntry = {
      id: note.id,
      kind: note.status === "tentative" ? "idea" : "canon",
      status: note.status,
      text: note.text,
      facts: writerFactsFromMemory({ text: note.text, status: note.status, scope }),
    };
    if (scope) entry.scope = scope;
    return entry;
  });
  const documentary: WriterMemoryEntry[] = [];
  for (const entity of story.entities) {
    const scope = scopeFor(entity, cueSlugs);
    for (const fact of entity.textFacts) {
      const entry: WriterMemoryEntry = {
        id: fact.id,
        kind: "canon",
        status: "established",
        text: fact.text,
        facts: writerFactsFromMemory({ text: fact.text, status: "established", scope }),
      };
      if (scope) entry.scope = scope;
      documentary.push(entry);
    }
    const definitionFacts = writerFactsFromMemory({ text: entity.definition, status: "established", scope });
    if (definitionFacts.length === 0) continue;
    const entry: WriterMemoryEntry = {
      id: `definition:${entity.id}`,
      kind: "canon",
      status: "established",
      text: entity.definition,
      facts: definitionFacts,
    };
    if (scope) entry.scope = scope;
    documentary.push(entry);
  }
  return [...projected, ...documentary];
}

export function normalizeStory(value: unknown): WriterStory | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { entities?: unknown; looseNotes?: unknown; analyzed?: unknown };
  if (!Array.isArray(row.entities) || !Array.isArray(row.looseNotes)) return null;
  let seq = 1;
  const entities: StoryEntity[] = [];
  for (const item of row.entities) {
    const entity = normalizeEntity(item, () => seq++);
    if (entity) entities.push(entity);
  }
  const looseNotes = row.looseNotes.map((item) => normalizeNote(item, () => seq++)).filter((note): note is StoryNote => note != null);
  const record = row as Record<string, unknown>;
  return {
    entities,
    looseNotes,
    analyzed: normalizeAnalyzed(row.analyzed),
    chapterSummaries: normalizeChapterSummaries(record.chapterSummaries),
    documentSummary: typeof record.documentSummary === "string" && record.documentSummary.trim() ? clean(record.documentSummary).slice(0, 500) : null,
    relations: normalizeRelations(record.relations),
    threadCandidates: normalizeThreadCandidates(record.threadCandidates),
    dismissedThreadCandidates: normalizeDismissedCandidates(record.dismissedThreadCandidates),
    ...(normalizePresentation(record.presentation) ? { presentation: normalizePresentation(record.presentation) } : {}),
  };
}

function scopeFor(entity: StoryEntity, cueSlugs: string[]): WriterMemoryScope | undefined {
  if (entity.bound === "global") return undefined;
  const slug = cueSlugs.find((cue) => covers(entity, cue)) ?? entitySlug(entity);
  if (!slug) return undefined;
  return { type: "entity", entityId: slug };
}

function appendLoose(story: WriterStory, text: string): { story: WriterStory; added: boolean } {
  const status = inferWriterMemoryStatus(text);
  if (story.looseNotes.some((note) => note.status === status && note.text === text)) return { story, added: false };
  return { story: { ...story, looseNotes: [...story.looseNotes, makeNote(story, text, status, "author")] }, added: true };
}

function makeNote(story: WriterStory, text: string, status: WriterMemoryStatus, authority: "author" | "ai"): StoryNote {
  return {
    id: crypto.randomUUID(),
    seq: nextSeq(story),
    text,
    status,
    authority,
    provenance: authority === "ai" ? "ai_saved" : "author",
    idea: status === "tentative" ? "pending" : null,
  };
}

function nextSeq(story: WriterStory): number {
  return allNotes(story).reduce((max, note) => Math.max(max, note.seq), 0) + 1;
}

function allNotes(story: WriterStory): StoryNote[] {
  return [...story.entities.flatMap((entity) => entity.notes), ...story.looseNotes];
}

function entitySlug(entity: StoryEntity): string {
  return writerEntityId(entity.label);
}

function covers(entity: StoryEntity, cue: string): boolean {
  const slug = writerEntityId(cue);
  if (!slug) return false;
  return entitySlug(entity) === slug || entity.aliases.some((alias) => writerEntityId(alias) === slug);
}

function rememberAlias(entity: StoryEntity, label: string): string[] {
  const slug = writerEntityId(label);
  if (!slug) return entity.aliases;
  if (entity.aliases.some((alias) => writerEntityId(alias) === slug)) return entity.aliases;
  return [...entity.aliases, label];
}

function withAlias(entity: StoryEntity, label: string): string[] {
  if (covers(entity, label)) return entity.aliases;
  return [...entity.aliases, label];
}

function mapEntity(story: WriterStory, id: string, update: (entity: StoryEntity) => StoryEntity): WriterStory {
  let changed = false;
  const entities = story.entities.map((entity) => {
    if (entity.id !== id) return entity;
    const next = update(entity);
    if (next !== entity) changed = true;
    return next;
  });
  return changed ? { ...story, entities } : story;
}

function locate(story: WriterStory, id: string): { note: StoryNote; where: "entity" | "loose"; entityId: string } | null {
  for (const entity of story.entities) {
    const note = entity.notes.find((item) => item.id === id);
    if (note) return { note, where: "entity", entityId: entity.id };
  }
  const loose = story.looseNotes.find((item) => item.id === id);
  return loose ? { note: loose, where: "loose", entityId: "" } : null;
}

function detach(story: WriterStory, id: string): WriterStory {
  return {
    ...story,
    entities: story.entities.map((entity) => ({ ...entity, notes: entity.notes.filter((note) => note.id !== id) })),
    looseNotes: story.looseNotes.filter((note) => note.id !== id),
  };
}

function legacyNotes(value: unknown): Array<{ id: string; text: string; status: WriterMemoryStatus; scope?: WriterMemoryScope }> {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const notes: Array<{ id: string; text: string; status: WriterMemoryStatus; scope?: WriterMemoryScope }> = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const text = typeof row.text === "string" ? clean(row.text) : "";
    const kind = row.kind === "canon" || row.kind === "idea" ? row.kind : null;
    const rawStatus = row.status === "established" || row.status === "tentative" ? row.status : null;
    if (!text || (!kind && !rawStatus)) continue;
    const status: WriterMemoryStatus = rawStatus ?? (kind === "idea" ? "tentative" : "established");
    let id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : crypto.randomUUID();
    if (seen.has(id)) id = crypto.randomUUID();
    seen.add(id);
    const scope = legacyScope(row.scope);
    notes.push(scope ? { id, text, status, scope } : { id, text, status });
  }
  return notes;
}

function legacyScope(value: unknown): WriterMemoryScope | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as { type?: unknown; entityId?: unknown };
  if (row.type === "entity" && typeof row.entityId === "string" && writerEntityId(row.entityId)) {
    return { type: "entity", entityId: row.entityId.trim() };
  }
  return undefined;
}

function normalizeEntity(value: unknown, seq: () => number): StoryEntity | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const label = typeof row.label === "string" ? clean(row.label) : "";
  if (!label) return null;
  const notes = Array.isArray(row.notes) ? row.notes.map((item) => normalizeNote(item, seq)).filter((note): note is StoryNote => note != null) : [];
  const aliases = Array.isArray(row.aliases) ? row.aliases.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  return {
    id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : crypto.randomUUID(),
    label,
    aliases: aliases.length > 0 ? aliases : [label],
    group: row.group === "story" ? "story" : "character",
    ...(row.origin === "author" || row.origin === "document" ? { origin: row.origin } : {}),
    ...(entityKind(row.kind) ? { kind: entityKind(row.kind) } : {}),
    bound: row.bound === "global" ? "global" : "entity",
    definition: typeof row.definition === "string" ? row.definition.replace(/\s+$/g, "") : "",
    notes,
    events: normalizeEvents(row.events),
    stateChanges: normalizeStateChanges(row.stateChanges),
    textFacts: normalizeTextFacts(row.textFacts),
    stateSummary: typeof row.stateSummary === "string" && row.stateSummary.trim() ? row.stateSummary.trim() : null,
    traceSummary: typeof row.traceSummary === "string" && row.traceSummary.trim() ? row.traceSummary.trim() : null,
  };
}

function normalizeEvents(value: unknown): StoryEvent[] {
  if (!Array.isArray(value)) return [];
  const events: StoryEvent[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const text = typeof row.text === "string" ? clean(row.text) : "";
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!text || !id) continue;
    const sourceBlockIds = Array.isArray(row.sourceBlockIds)
      ? row.sourceBlockIds.filter((blockId): blockId is string => typeof blockId === "string" && blockId.trim().length > 0)
      : [];
    const entityIds = stringIds(row.entityIds).slice(0, 8);
    const sharedId = typeof row.sharedId === "string" && row.sharedId.trim() ? row.sharedId.trim() : "";
    events.push({
      id,
      text,
      sourceBlockIds,
      order: typeof row.order === "number" && Number.isFinite(row.order) ? row.order : 0,
      chapterLabel: typeof row.chapterLabel === "string" && row.chapterLabel.trim() ? row.chapterLabel.trim() : null,
      fingerprint: typeof row.fingerprint === "string" && row.fingerprint.trim() ? row.fingerprint.trim() : writerBlockTextHash(text),
      ...(entityIds.length > 0 ? { entityIds } : {}),
      ...(sharedId ? { sharedId } : {}),
      sourceHashes: normalizeSourceHashes(row, sourceBlockIds),
      evidence: normalizeEvidence(row.evidence, sourceBlockIds),
      analysisVersion: versionOf(row.analysisVersion),
    });
  }
  return events;
}

function normalizeStateChanges(value: unknown): StoryStateChange[] {
  if (!Array.isArray(value)) return [];
  const changes: StoryStateChange[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const text = typeof row.text === "string" ? clean(row.text) : "";
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const predicate = typeof row.predicate === "string" ? row.predicate.trim() : "";
    if (!text || !id || !predicate) continue;
    changes.push({
      id,
      predicate,
      value: typeof row.value === "string" ? row.value : "",
      text,
      sourceBlockIds: stringIds(row.sourceBlockIds),
      order: typeof row.order === "number" && Number.isFinite(row.order) ? row.order : 0,
      sourceHashes: normalizeSourceHashes(row, stringIds(row.sourceBlockIds)),
      evidence: normalizeEvidence(row.evidence, stringIds(row.sourceBlockIds)),
      analysisVersion: versionOf(row.analysisVersion),
    });
  }
  return changes;
}

function normalizeTextFacts(value: unknown): StoryTextFact[] {
  if (!Array.isArray(value)) return [];
  const facts: StoryTextFact[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const text = typeof row.text === "string" ? clean(row.text) : "";
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!text || !id) continue;
    facts.push({
      id,
      text,
      sourceBlockIds: stringIds(row.sourceBlockIds),
      order: typeof row.order === "number" && Number.isFinite(row.order) ? row.order : 0,
      sourceHashes: normalizeSourceHashes(row, stringIds(row.sourceBlockIds)),
      evidence: normalizeEvidence(row.evidence, stringIds(row.sourceBlockIds)),
      analysisVersion: versionOf(row.analysisVersion),
      authority: "text",
    });
  }
  return facts;
}

function entityKind(value: unknown): StoryEntityKind | undefined {
  if (value === "thread" || value === "event" || value === "location" || value === "object" || value === "relationship" || value === "concept" || value === "other") {
    return value;
  }
  return undefined;
}

function stringIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function versionOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function normalizeSourceHashes(row: Record<string, unknown>, sourceBlockIds: string[]): Record<string, string> {
  const hashes: Record<string, string> = {};
  if (row.sourceHashes && typeof row.sourceHashes === "object" && !Array.isArray(row.sourceHashes)) {
    for (const id of sourceBlockIds) {
      const hash = (row.sourceHashes as Record<string, unknown>)[id];
      if (typeof hash === "string" && hash.trim()) hashes[id] = hash.trim();
    }
  }
  if (Object.keys(hashes).length > 0) return hashes;
  const legacy = typeof row.sourceHash === "string" ? row.sourceHash.trim() : "";
  if (legacy && sourceBlockIds.length === 1) return { [sourceBlockIds[0] ?? ""]: legacy };
  return hashes;
}

function normalizeEvidence(value: unknown, sourceBlockIds: string[]): StoryEvidence[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(sourceBlockIds);
  const evidence: StoryEvidence[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const blockId = typeof row.blockId === "string" ? row.blockId.trim() : "";
    const text = typeof row.text === "string" ? clean(row.text) : "";
    if (!blockId || !text || !allowed.has(blockId)) continue;
    evidence.push({ blockId, text: text.slice(0, 180) });
    if (evidence.length >= 4) break;
  }
  return evidence;
}

function normalizeChapterSummaries(value: unknown): StoryChapterSummary[] {
  if (!Array.isArray(value)) return [];
  const summaries: StoryChapterSummary[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const chapterId = typeof row.chapterId === "string" ? row.chapterId.trim() : "";
    const text = typeof row.text === "string" ? clean(row.text) : "";
    const sourceHashes = normalizeSourceHashes(
      row,
      Object.keys(row.sourceHashes && typeof row.sourceHashes === "object" ? (row.sourceHashes as object) : {}),
    );
    const sourceBlockIds = stringIds(row.sourceBlockIds);
    const ids = sourceBlockIds.length > 0 ? sourceBlockIds : Object.keys(sourceHashes);
    if (!chapterId || !text || ids.length === 0 || Object.keys(sourceHashes).length === 0) continue;
    summaries.push({
      chapterId,
      text: text.slice(0, 280),
      sourceBlockIds: ids,
      sourceHashes,
      analysisVersion: versionOf(row.analysisVersion),
      updatedAt: typeof row.updatedAt === "string" && row.updatedAt.trim() ? row.updatedAt.trim() : "",
    });
    if (summaries.length >= 40) break;
  }
  return summaries;
}

/** Un resumen stale no debe entrar solo como contexto fiable de Ask Story. */
export function isChapterSummaryStale(summary: StoryChapterSummary, liveHashes: Map<string, string>): boolean {
  const ids = summary.sourceBlockIds.length > 0 ? summary.sourceBlockIds : Object.keys(summary.sourceHashes);
  if (ids.length === 0) return true;
  return ids.some((id) => liveHashes.get(id) !== summary.sourceHashes[id]);
}

export function validChapterSummaries(
  summaries: StoryChapterSummary[],
  liveHashes: Map<string, string>,
): StoryChapterSummary[] {
  return summaries.filter((summary) => !isChapterSummaryStale(summary, liveHashes));
}

function normalizeAnalyzed(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const analyzed: Record<string, string> = {};
  for (const [blockId, hash] of Object.entries(value as Record<string, unknown>)) {
    if (blockId.trim() && typeof hash === "string" && hash.trim()) analyzed[blockId] = hash;
  }
  return analyzed;
}

function normalizeNote(value: unknown, seq: () => number): StoryNote | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const text = typeof row.text === "string" ? clean(row.text) : "";
  if (!text) return null;
  const status: WriterMemoryStatus = row.status === "tentative" ? "tentative" : "established";
  const idea = row.idea === "pending" || row.idea === "used" || row.idea === "discarded" ? row.idea : null;
  return {
    id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : crypto.randomUUID(),
    seq: typeof row.seq === "number" && Number.isFinite(row.seq) ? row.seq : seq(),
    text,
    status,
    authority: row.authority === "ai" ? "ai" : "author",
    ...(row.provenance === "author" || row.provenance === "legacy_memory" || row.provenance === "ai_saved" ? { provenance: row.provenance } : {}),
    idea: status === "tentative" ? idea ?? "pending" : null,
  };
}

export type WriterWritePlace = { from: number; to: number; scroll: number };

export function captureWriterWritePlace(selection: { from: number; to: number }, scroll: number): WriterWritePlace {
  return { from: selection.from, to: selection.to, scroll };
}

export function restoreWriterWritePlace(
  editor: { state: { doc: { content: { size: number } } }; commands: { setTextSelection: (range: { from: number; to: number }) => boolean } },
  page: { scrollTop: number } | null,
  place: WriterWritePlace,
): void {
  const size = editor.state.doc.content.size;
  const from = Math.max(0, Math.min(place.from, size));
  const to = Math.max(from, Math.min(place.to, size));
  editor.commands.setTextSelection({ from, to });
  if (page) page.scrollTop = place.scroll;
}

function labelFromLegacyId(entityId: string): string {
  const label = writerEntityLabel(entityId);
  if (!label || label !== label.toLocaleLowerCase("es")) return label;
  return writerEntityLabel(label.toLocaleUpperCase("es")) || label;
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
