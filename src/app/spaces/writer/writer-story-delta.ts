import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { StoryDeltaPayload } from "./writer-ai";
import { writerBlockTextHash } from "./writer-block-id";
import { writerDocumentBlocks } from "./writer-appearances";
import type { StoryAskCitedBlock } from "./writer-ask-story";
import {
  isRelationType,
  isUsefulThreadLabel,
  mergeStoryRelations,
  projectCandidates,
  projectRelations,
  sourceSignature,
  takeThreadCandidates,
  type StoryRelation,
  type StoryRelationType,
  type StoryThreadCandidate,
} from "./writer-relations";
import {
  STORY_ANALYSIS_VERSION,
  type StoryChapterSummary,
  type StoryEntity,
  type StoryEvent,
  type StoryEvidence,
  type StoryStateChange,
  type StoryTextFact,
  type WriterStory,
} from "./writer-story";

/**
 * StoryDelta solo entra en Trace, State o hechos de texto si el bloque citado
 * sigue igual y el texto lo sostiene. Una interpretación se descarta.
 * La respuesta al usuario no depende de esto.
 */

const MIN_CONFIDENCE = 0.85;
const THREAD_CONFIDENCE = 0.92;
const STATE_PREFIX = /^(?:physical|location|possession|knowledge|relationship|life|ability)(?:\.[a-z0-9_]{1,40})?$/;
const INTERPRETIVE = /podr[ií]a|quiz[aá]s?|tal vez|parece|probablemente|deber[ií]a|motivaci|venganza|vengarse|hipot[eé]tic/iu;
const TRIVIAL = new Set(["sient", "sent", "mira", "resp", "cami", "sonr", "abri", "call", "asie", "leva", "entr", "sale", "anda", "parp"]);
const FILLER = new Set(["vent", "puer", "pasi", "ladr", "aire", "ciel"]);
const STOP = new Set(["para", "como", "esta", "este", "esto", "tiene", "desde", "hacia", "donde", "cuando", "porque", "sobre", "entre", "hasta", "despues", "luego", "pero", "tambien", "mismo", "misma", "quien", "cual", "cada", "todo", "toda", "ella", "ellos", "ellas"]);

type LiveBlock = {
  blockId: string;
  text: string;
  hash: string;
  order: number;
  chapterId: string | null;
  chapterLabel: string | null;
};

export function applyStoryDelta(
  story: WriterStory,
  doc: ProseMirrorNode,
  cited: StoryAskCitedBlock[],
  delta: StoryDeltaPayload | null | undefined,
): { story: WriterStory; changed: boolean } {
  if (!delta) return { story, changed: false };
  const live = new Map<string, LiveBlock>();
  for (const block of writerDocumentBlocks(doc)) {
    live.set(block.blockId, {
      blockId: block.blockId,
      text: block.text,
      hash: writerBlockTextHash(block.text),
      order: block.order,
      chapterId: block.chapterId,
      chapterLabel: block.chapterLabel,
    });
  }
  const citedById = new Map(cited.map((block) => [block.blockId, block]));
  const ready = (blockId: string) => {
    const source = citedById.get(blockId);
    const current = live.get(blockId);
    return Boolean(source && current && source.hash === current.hash);
  };
  const analyzed = new Set(delta.analyzedBlockIds.filter(ready));
  const events = delta.events.flatMap((item) => acceptEvent(story, item, citedById, live, ready) ?? []);
  const states = delta.stateChanges.flatMap((item) => acceptState(story, item, citedById, live, ready) ?? []);
  const facts = delta.facts.flatMap((item) => acceptFact(story, item, citedById, live, ready) ?? []);
  const relations = (delta.relations ?? []).flatMap((item) => acceptRelation(story, item, citedById, live, ready) ?? []);
  const candidates = (delta.threadCandidates ?? []).flatMap((item) => acceptCandidate(story, item, citedById, live, ready) ?? []);
  for (const item of [...events, ...states, ...facts, ...relations, ...candidates]) {
    for (const blockId of item.sourceBlockIds) analyzed.add(blockId);
  }
  if (analyzed.size === 0 && relations.length === 0 && candidates.length === 0) return { story, changed: false };

  let next = story;
  const touched = new Set<string>([
    ...events.map((item) => item.entityId),
    ...states.map((item) => item.entityId),
    ...facts.map((item) => item.entityId),
  ]);
  const citesAnalyzed = (ids: string[]) => ids.some((id) => analyzed.has(id));
  next = {
    ...next,
    analyzed: { ...next.analyzed },
    entities: next.entities.map((entity) => {
      const affected =
        touched.has(entity.id) ||
        entity.events.some((event) => citesAnalyzed(event.sourceBlockIds)) ||
        entity.stateChanges.some((change) => citesAnalyzed(change.sourceBlockIds)) ||
        entity.textFacts.some((fact) => citesAnalyzed(fact.sourceBlockIds));
      return affected ? mergeEntity(entity, events, states, facts, analyzed, live) : entity;
    }),
  };
  for (const blockId of analyzed) {
    const hash = live.get(blockId)?.hash;
    if (hash) next.analyzed[blockId] = hash;
  }
  if (relations.length > 0) next = { ...next, relations: mergeStoryRelations(next.relations ?? [], relations) };
  if (candidates.length > 0) {
    next = {
      ...next,
      threadCandidates: takeThreadCandidates(next.threadCandidates ?? [], candidates, next.dismissedThreadCandidates ?? [], next.entities),
    };
  }
  const summaries = takeChapterSummaries(delta.chapterSummaries ?? [], live, analyzed, next.analyzed);
  if (summaries.length > 0) {
    const kept = next.chapterSummaries.filter((item) => !summaries.some((summary) => summary.chapterId === item.chapterId));
    next = { ...next, chapterSummaries: [...kept, ...summaries] };
  }
  const changed = JSON.stringify(next) !== JSON.stringify(story);
  return { story: changed ? next : story, changed };
}

/** Oculta derivados cuya fuente ya no coincide. No borra el guardado: deshacer el texto los recupera. */
export function projectStory(story: WriterStory, doc: ProseMirrorNode): WriterStory {
  const live = new Map<string, string>();
  for (const block of writerDocumentBlocks(doc)) live.set(block.blockId, writerBlockTextHash(block.text));
  return {
    ...story,
    entities: story.entities.map((entity) => {
      const events = entity.events.filter((event) => sourceStillValid(event.sourceBlockIds, event.sourceHashes, live));
      const stateChanges = entity.stateChanges.filter((change) => sourceStillValid(change.sourceBlockIds, change.sourceHashes, live));
      const textFacts = entity.textFacts.filter((fact) => sourceStillValid(fact.sourceBlockIds, fact.sourceHashes, live));
      const lines = storyStateLines({ ...entity, stateChanges });
      return {
        ...entity,
        events: events.sort((a, b) => a.order - b.order),
        stateChanges: stateChanges.sort((a, b) => a.order - b.order),
        textFacts,
        stateSummary: lines.length ? lines.join("\n") : null,
        traceSummary: storyTraceSummary(events),
      };
    }),
    chapterSummaries: story.chapterSummaries.filter((summary) => sourceStillValid(Object.keys(summary.sourceHashes), summary.sourceHashes, live)),
    relations: projectRelations(story.relations ?? [], live),
    threadCandidates: projectCandidates(story.threadCandidates ?? [], live),
  };
}

export function storyStateLines(entity: StoryEntity): string[] {
  const latest = new Map<string, StoryStateChange>();
  for (const change of [...entity.stateChanges].sort((a, b) => a.order - b.order)) latest.set(change.predicate, change);
  return [...latest.values()].sort((a, b) => a.order - b.order).map((change) => change.text);
}

export function storyTraceSummary(events: StoryEvent[]): string | null {
  const lines = [...events].sort((a, b) => a.order - b.order).map((event) => event.text.replace(/[.]+$/u, "").trim()).filter(Boolean);
  if (lines.length === 0) return null;
  if (lines.length === 1) return `${lines[0]}.`;
  const text = `${lines.slice(0, -1).join(", ")} y ${lines[lines.length - 1]}.`;
  return text.length > 220 ? `${text.slice(0, 217).trim()}…` : text;
}

function mergeEntity(
  entity: StoryEntity,
  events: Array<StoryEvent & { entityId: string }>,
  states: Array<StoryStateChange & { entityId: string }>,
  facts: Array<StoryTextFact & { entityId: string }>,
  analyzed: Set<string>,
  live: Map<string, LiveBlock>,
): StoryEntity {
  const keepEvent = (event: StoryEvent) => !stale(event.sourceHashes, analyzed, live);
  const ownEvents = entity.events.filter(keepEvent);
  for (const event of events) {
    if (event.entityId !== entity.id) continue;
    if (event.sharedId && ownEvents.some((item) => item.sharedId === event.sharedId)) continue;
    if (ownEvents.some((item) => sameHashes(item.sourceHashes, event.sourceHashes))) continue;
    ownEvents.push({
      id: event.id,
      text: event.text,
      sourceBlockIds: event.sourceBlockIds,
      order: event.order,
      chapterLabel: event.chapterLabel,
      fingerprint: event.fingerprint,
      ...(event.entityIds && event.entityIds.length > 0 ? { entityIds: event.entityIds } : {}),
      ...(event.sharedId ? { sharedId: event.sharedId } : {}),
      sourceHashes: event.sourceHashes,
      evidence: event.evidence,
      analysisVersion: event.analysisVersion,
    });
  }
  const ownStates = entity.stateChanges.filter((change) => !stale(change.sourceHashes, analyzed, live));
  for (const change of states) {
    if (change.entityId !== entity.id) continue;
    if (ownStates.some((item) => item.predicate === change.predicate && item.value === change.value && sameHashes(item.sourceHashes, change.sourceHashes))) continue;
    ownStates.push({
      id: change.id,
      predicate: change.predicate,
      value: change.value,
      text: change.text,
      sourceBlockIds: change.sourceBlockIds,
      order: change.order,
      sourceHashes: change.sourceHashes,
      evidence: change.evidence,
      analysisVersion: change.analysisVersion,
    });
  }
  const ownFacts = entity.textFacts.filter((fact) => !stale(fact.sourceHashes, analyzed, live));
  for (const fact of facts) {
    if (fact.entityId !== entity.id) continue;
    if (ownFacts.some((item) => item.text === fact.text && sameHashes(item.sourceHashes, fact.sourceHashes))) continue;
    ownFacts.push({
      id: fact.id,
      text: fact.text,
      sourceBlockIds: fact.sourceBlockIds,
      order: fact.order,
      sourceHashes: fact.sourceHashes,
      evidence: fact.evidence,
      analysisVersion: fact.analysisVersion,
      authority: "text",
    });
  }
  const ordered = ownEvents.sort((a, b) => a.order - b.order);
  const lines = storyStateLines({ ...entity, stateChanges: ownStates });
  return {
    ...entity,
    events: ordered,
    stateChanges: ownStates.sort((a, b) => a.order - b.order),
    textFacts: ownFacts,
    stateSummary: lines.length ? lines.join("\n") : null,
    traceSummary: storyTraceSummary(ordered),
  };
}

function stale(sourceHashes: Record<string, string>, analyzed: Set<string>, live: Map<string, LiveBlock>): boolean {
  const ids = Object.keys(sourceHashes);
  if (ids.length === 0 || !ids.some((id) => analyzed.has(id))) return false;
  return ids.some((id) => analyzed.has(id) && live.get(id)?.hash !== sourceHashes[id]);
}

function acceptEvent(
  story: WriterStory,
  item: StoryDeltaPayload["events"][number],
  cited: Map<string, StoryAskCitedBlock>,
  live: Map<string, LiveBlock>,
  ready: (blockId: string) => boolean,
): (StoryEvent & { entityId: string })[] {
  const refs = [...new Set([item.entityId, ...(item.entityIds ?? [])])];
  const entities = refs.flatMap((ref) => {
    const entity = resolveEntity(story, ref);
    return entity ? [entity] : [];
  });
  const sources = usableSources(item, cited, live, ready);
  if (entities.length === 0 || !sources || item.confidence < MIN_CONFIDENCE) return [];
  if (!evidenceOk(item.evidence, sources)) return [];
  const linkedEntities = entities.filter((entity) => linked(entity, sources));
  if (linkedEntities.length === 0) return [];
  const primary = linkedEntities[0];
  if (!primary || !supported(item.text, sources, primary) || trivial(item.text, primary)) return [];
  const sourceBlockIds = sources.map((block) => block.blockId);
  const sharedId = crypto.randomUUID();
  const entityIds = linkedEntities.map((entity) => entity.id);
  return linkedEntities.map((entity) => ({
    entityId: entity.id,
    id: sharedId,
    text: item.text,
    sourceBlockIds,
    order: Math.min(...sources.map((block) => block.order)),
    chapterLabel: sources[0]?.chapterLabel ?? null,
    fingerprint: writerBlockTextHash(fold(item.text)),
    entityIds,
    sharedId,
    sourceHashes: hashesFor(sourceBlockIds, live),
    evidence: keptEvidence(item.evidence, sources),
    analysisVersion: STORY_ANALYSIS_VERSION,
  }));
}

function acceptState(
  story: WriterStory,
  item: StoryDeltaPayload["stateChanges"][number],
  cited: Map<string, StoryAskCitedBlock>,
  live: Map<string, LiveBlock>,
  ready: (blockId: string) => boolean,
): (StoryStateChange & { entityId: string })[] {
  const entity = resolveEntity(story, item.entityId);
  const sources = usableSources(item, cited, live, ready);
  if (!entity || !sources || item.confidence < MIN_CONFIDENCE) return [];
  if (!STATE_PREFIX.test(item.predicate) || !item.value || item.value.includes(" ")) return [];
  if (!evidenceOk(item.evidence, sources)) return [];
  if (!linked(entity, sources) || !supported(item.text, sources, entity)) return [];
  const sourceBlockIds = sources.map((block) => block.blockId);
  return [{
    entityId: entity.id,
    id: crypto.randomUUID(),
    predicate: item.predicate,
    value: item.value,
    text: item.text,
    sourceBlockIds,
    order: Math.min(...sources.map((block) => block.order)),
    sourceHashes: hashesFor(sourceBlockIds, live),
    evidence: keptEvidence(item.evidence, sources),
    analysisVersion: STORY_ANALYSIS_VERSION,
  }];
}

function acceptRelation(
  story: WriterStory,
  item: NonNullable<StoryDeltaPayload["relations"]>[number],
  cited: Map<string, StoryAskCitedBlock>,
  live: Map<string, LiveBlock>,
  ready: (blockId: string) => boolean,
): StoryRelation[] {
  if (!isRelationType(item.type) || item.confidence < MIN_CONFIDENCE) return [];
  const from = resolveEntity(story, item.fromEntityId);
  const to = resolveEntity(story, item.toEntityId);
  const sources = usableSources({ text: item.text || item.label || item.type, sourceBlockIds: item.sourceBlockIds, evidence: item.evidence }, cited, live, ready);
  if (!from || !to || from.id === to.id || !sources) return [];
  if (!evidenceOk(item.evidence, sources)) return [];
  if (!mentionsLoose(sources.map((block) => block.text).join("\n"), from) || !mentionsLoose(sources.map((block) => block.text).join("\n"), to)) return [];
  const quote = item.evidence.map((entry) => entry.text).join(" ");
  const stance = item.stance === "known" || item.stance === "not_known_explicit" ? item.stance : undefined;
  if (item.type === "knows_about") {
    if (stance === "not_known_explicit" && !NEGATION.test(quote)) return [];
    if (stance === "known" && (NEGATION.test(quote) || !KNOWS.test(quote))) return [];
    if (!stance) return [];
  }
  if (item.type === "family" && item.qualifier === "sibling" && !/herman/iu.test(quote)) return [];
  const sourceBlockIds = sources.map((block) => block.blockId);
  const label = item.label.trim() || defaultRelationLabel(item.type, stance);
  return [{
    id: crypto.randomUUID(),
    fromEntityId: from.id,
    toEntityId: to.id,
    type: item.type,
    label,
    qualifier: item.qualifier.trim() || undefined,
    stance: item.type === "knows_about" ? stance : undefined,
    source: "text",
    sourceBlockIds,
    sourceHashes: hashesFor(sourceBlockIds, live),
    evidence: keptEvidence(item.evidence, sources),
    documentOrder: Math.max(...sources.map((block) => block.order)),
    confidence: item.confidence,
    analysisVersion: STORY_ANALYSIS_VERSION,
  }];
}

function acceptCandidate(
  story: WriterStory,
  item: NonNullable<StoryDeltaPayload["threadCandidates"]>[number],
  cited: Map<string, StoryAskCitedBlock>,
  live: Map<string, LiveBlock>,
  ready: (blockId: string) => boolean,
): StoryThreadCandidate[] {
  if (item.confidence < THREAD_CONFIDENCE || item.sourceBlockIds.length < 2 || !isUsefulThreadLabel(item.label)) return [];
  const sources = usableSources({ text: item.label, sourceBlockIds: item.sourceBlockIds, evidence: item.evidence }, cited, live, ready);
  if (!sources) return [];
  if (!evidenceOk(item.evidence, sources)) return [];
  const blob = sources.map((block) => block.text).join("\n");
  if (!mentionsLoose(blob, { label: item.label, aliases: [] })) return [];
  const related = item.relatedEntityIds.flatMap((id) => {
    const entity = resolveEntity(story, id);
    return entity ? [entity.id] : [];
  });
  const sourceBlockIds = sources.map((block) => block.blockId);
  const sourceHashes = hashesFor(sourceBlockIds, live);
  return [{
    id: crypto.randomUUID(),
    label: item.label.replace(/\s+/g, " ").trim(),
    relatedEntityIds: related,
    sourceBlockIds,
    sourceHashes,
    evidence: keptEvidence(item.evidence, sources),
    confidence: item.confidence,
    sourceSignature: sourceSignature(sourceHashes),
  }];
}

const NEGATION = /no sabe|no conoce|todav[ií]a no|desconoce|sin saber|no sabe nada/iu;
const KNOWS = /sabe|conoce|descubre|revel|cuenta|entera/iu;

function defaultRelationLabel(type: StoryRelationType, stance?: string): string {
  if (type === "knows_about" && stance === "not_known_explicit") return "no lo conoce";
  if (type === "knows_about") return "lo conoce";
  if (type === "family") return "familia";
  return "relacionado";
}

function mentionsLoose(text: string, entity: { label: string; aliases: string[] }): boolean {
  if (mentions(text, entity as StoryEntity)) return true;
  const folded = fold(text);
  for (const phrase of [entity.label, ...entity.aliases]) {
    const bare = fold(phrase).replace(/^(?:el|la|los|las|un|una)\s+/, "");
    if (bare.length < 4) continue;
    if (new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(bare)}(?![a-z0-9])`, "u").test(folded)) return true;
  }
  return false;
}

function acceptFact(
  story: WriterStory,
  item: StoryDeltaPayload["facts"][number],
  cited: Map<string, StoryAskCitedBlock>,
  live: Map<string, LiveBlock>,
  ready: (blockId: string) => boolean,
): (StoryTextFact & { entityId: string })[] {
  const entity = resolveEntity(story, item.entityId);
  const sources = usableSources(item, cited, live, ready);
  if (!entity || !sources || item.confidence < MIN_CONFIDENCE) return [];
  if (!evidenceOk(item.evidence, sources)) return [];
  if (!linked(entity, sources) || !supported(item.text, sources, entity)) return [];
  const sourceBlockIds = sources.map((block) => block.blockId);
  return [{
    entityId: entity.id,
    id: crypto.randomUUID(),
    text: item.text,
    sourceBlockIds,
    order: Math.min(...sources.map((block) => block.order)),
    sourceHashes: hashesFor(sourceBlockIds, live),
    evidence: keptEvidence(item.evidence, sources),
    analysisVersion: STORY_ANALYSIS_VERSION,
    authority: "text",
  }];
}

function usableSources(
  item: { text: string; sourceBlockIds: string[]; evidence: StoryEvidence[] },
  cited: Map<string, StoryAskCitedBlock>,
  live: Map<string, LiveBlock>,
  ready: (blockId: string) => boolean,
): StoryAskCitedBlock[] | null {
  if (!item.text || item.sourceBlockIds.length === 0 || item.sourceBlockIds.some((id) => !ready(id))) return null;
  const sources = item.sourceBlockIds.flatMap((id) => {
    const block = cited.get(id);
    return block && live.has(id) ? [block] : [];
  });
  return sources.length === item.sourceBlockIds.length ? sources.sort((a, b) => a.order - b.order) : null;
}

function resolveEntity(story: WriterStory, reference: string): StoryEntity | null {
  const direct = story.entities.find((entity) => entity.id === reference);
  if (direct) return direct;
  const key = fold(reference);
  const matches = story.entities.filter(
    (entity) => entity.bound !== "global" && (fold(entity.label) === key || entity.aliases.some((alias) => fold(alias) === key)),
  );
  return matches.length === 1 ? matches[0] ?? null : null;
}

function linked(entity: StoryEntity, sources: StoryAskCitedBlock[]): boolean {
  if (sources.some((block) => block.entityIds.includes(entity.id))) return true;
  return sources.some((block) => mentions(block.text, entity));
}

function mentions(text: string, entity: StoryEntity): boolean {
  return [entity.label, ...entity.aliases].some((phrase) => {
    const name = phrase.trim();
    if (fold(name).length < 2) return false;
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "iu").test(text);
  });
}

function supported(text: string, sources: StoryAskCitedBlock[], entity: StoryEntity): boolean {
  if (INTERPRETIVE.test(text) && !sources.some((block) => INTERPRETIVE.test(block.text))) return false;
  const names = new Set([entity.label, ...entity.aliases].flatMap((name) => stems(name)));
  const wanted = stems(text).filter((stem) => !names.has(stem));
  if (wanted.length === 0) return false;
  const present = new Set(sources.flatMap((block) => stems(block.text)));
  const hits = wanted.filter((stem) => present.has(stem)).length;
  return hits / wanted.length >= 0.5;
}

function trivial(text: string, entity: StoryEntity): boolean {
  const names = new Set([entity.label, ...entity.aliases].flatMap((name) => stems(name)));
  const wanted = stems(text).filter((stem) => !names.has(stem));
  return wanted.length === 0 || wanted.every((stem) => TRIVIAL.has(stem) || FILLER.has(stem));
}

function evidenceOk(evidence: StoryEvidence[], sources: StoryAskCitedBlock[]): boolean {
  if (evidence.length === 0) return false;
  return sources.every((source) => evidence.some((item) => item.blockId === source.blockId && quoteIn(item.text, source.text)));
}

function keptEvidence(evidence: StoryEvidence[], sources: StoryAskCitedBlock[]): StoryEvidence[] {
  return evidence.filter((item) => sources.some((source) => source.blockId === item.blockId && quoteIn(item.text, source.text)));
}

function quoteIn(quote: string, block: string): boolean {
  const needle = fold(quote);
  return needle.length >= 12 && fold(block).includes(needle);
}

function hashesFor(ids: string[], live: Map<string, LiveBlock>): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const id of ids) {
    const hash = live.get(id)?.hash;
    if (hash) hashes[id] = hash;
  }
  return hashes;
}

function sameHashes(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftIds = Object.keys(left).sort();
  const rightIds = Object.keys(right).sort();
  return leftIds.length > 0 && leftIds.length === rightIds.length && leftIds.every((id, index) => id === rightIds[index] && left[id] === right[id]);
}

function sourceStillValid(sourceBlockIds: string[], sourceHashes: Record<string, string>, live: Map<string, string>): boolean {
  if (sourceBlockIds.length === 0) return false;
  const ids = Object.keys(sourceHashes);
  if (ids.length === 0) return sourceBlockIds.every((id) => live.has(id));
  return ids.every((id) => live.get(id) === sourceHashes[id]);
}

function takeChapterSummaries(
  items: { chapterId: string; text: string }[],
  live: Map<string, LiveBlock>,
  touched: Set<string>,
  analyzed: Record<string, string>,
): StoryChapterSummary[] {
  const byChapter = new Map<string, LiveBlock[]>();
  for (const block of live.values()) {
    if (!block.chapterId) continue;
    const list = byChapter.get(block.chapterId) ?? [];
    list.push(block);
    byChapter.set(block.chapterId, list);
  }
  const accepted: StoryChapterSummary[] = [];
  for (const item of items) {
    const blocks = byChapter.get(item.chapterId);
    const text = item.text.replace(/\s+/g, " ").trim();
    if (!blocks?.length || text.length < 12 || text.length > 280) continue;
    if (!blocks.some((block) => touched.has(block.blockId))) continue;
    if (!blocks.every((block) => analyzed[block.blockId] === block.hash)) continue;
    if (INTERPRETIVE.test(text) && !blocks.some((block) => INTERPRETIVE.test(block.text))) continue;
    const present = new Set(blocks.flatMap((block) => stems(block.text)));
    const wanted = stems(text);
    if (wanted.length === 0 || wanted.filter((stem) => present.has(stem)).length / wanted.length < 0.5) continue;
    const sourceHashes: Record<string, string> = {};
    const sourceBlockIds: string[] = [];
    for (const block of blocks) {
      sourceHashes[block.blockId] = block.hash;
      sourceBlockIds.push(block.blockId);
    }
    accepted.push({
      chapterId: item.chapterId,
      text,
      sourceBlockIds,
      sourceHashes,
      analysisVersion: STORY_ANALYSIS_VERSION,
      updatedAt: new Date().toISOString(),
    });
  }
  return accepted;
}

function stems(text: string): string[] {
  return fold(text)
    .split(/[^a-z0-9]+/u)
    .filter((word) => word.length >= 4 && !STOP.has(word))
    .map((word) => word.slice(0, 4));
}

function fold(value: string): string {
  return value.toLocaleLowerCase("es").normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
