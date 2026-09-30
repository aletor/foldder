import type { StoryAppearance, StoryDocumentBlock } from "./writer-appearances";
import { writerBlockTextHash } from "./writer-block-id";
import { isSaneCharacterCue, storyDisplayTitle } from "./writer-cue";
import { writerEntityId } from "./writer-entities";
import { scriptContextAdapter, type WriterContextAdapter } from "./writer-context";
import { questionIndex } from "./writer-questions";
import { deriveStoryStructure, parseSceneHeading, sceneChronology, type StoryLocation, type StoryStructureKind, type StoryStructureUnit } from "./writer-structure";
import type { StoryEntity, StoryNote, WriterStory } from "./writer-story";

const PRESENTATION_ANALYSIS_VERSION = 1;

/**
 * Capa de presentación. No es canon: no crea hechos, estado, relaciones ni continuity.
 * Un brief solo se muestra. Ask Story no lo lee como verdad.
 */

export type StoryPresentationCoverage =
  | { kind: "blocks"; blockIds: string[] }
  | { kind: "chapters"; chapterIds: string[] }
  | { kind: "revision"; revisionId: string };

export type StoryPresentationBrief = {
  text: string;
  sourceBlockIds: string[];
  sourceHashes: Record<string, string>;
  analysisVersion: number;
  /** Hoy son bloques. Más adelante puede cubrir un capítulo o una revisión sin listar cada bloque. */
  coverage?: StoryPresentationCoverage;
};

export type StoryRevelationSupport = { kind: "event" | "fact" | "state"; id: string };

export type StoryRevelation = {
  text: string;
  support: StoryRevelationSupport[];
};

export type StoryPresentation = {
  storyBrief?: StoryPresentationBrief;
  entityBriefs?: Record<string, StoryPresentationBrief>;
  entityArcBriefs?: Record<string, StoryPresentationBrief>;
  sceneBriefs?: Record<string, StoryPresentationBrief>;
  relationLines?: Record<string, string>;
  revelations?: StoryRevelation[];
};

export type GlobalPresentation = {
  storyOverview?: { text: string; sceneIds: string[] };
  entityArcBriefs?: { entityId: string; text: string }[];
  entityCurrentBriefs?: { entityId: string; text: string }[];
  relationLines?: { relationId: string; text: string }[];
  revelations?: { text: string; support: StoryRevelationSupport[] }[];
};

export type PresentationDelta = {
  storyBrief?: { text: string; sourceBlockIds: string[] };
  entityBriefs?: { entityId: string; text: string; sourceBlockIds: string[] }[];
  sceneBriefs?: { sceneId: string; text: string; sourceBlockIds: string[] }[];
  globalPresentation?: GlobalPresentation;
};

const STORY_BRIEF_LIMIT = 420;
const ENTITY_BRIEF_LIMIT = 280;
const SCENE_BRIEF_LIMIT = 180;
const HOME_UNIT_CAP = 6;
const HOME_UNIT_TAIL = 4;
const HOME_CHARACTER_CAP = 5;
const HOME_HISTORY_CAP = 6;
const HOME_RELATION_CAP = 5;
const HOME_REVELATION_CAP = 5;
const HOME_QUESTION_CAP = 3;
const HOME_LOCATION_CAP = 5;
const DIGEST_BUDGET = 2800;

export function hasExplicitOwnership(story: WriterStory, entity: StoryEntity): boolean {
  if (entity.origin === "author") return true;
  if (entity.definition.trim()) return true;
  if (entity.notes.some((note) => note.provenance === "author")) return true;
  return (story.relations ?? []).some(
    (row) => row.source === "author" && (row.fromEntityId === entity.id || row.toEntityId === entity.id),
  );
}

export function saneCharacterSlugs(blocks: StoryDocumentBlock[]): Set<string> {
  const slugs = new Set<string>();
  for (const block of blocks) {
    if (block.type !== "character" || !isSaneCharacterCue(block.text)) continue;
    const slug = writerEntityId(block.text);
    if (slug) slugs.add(slug);
  }
  return slugs;
}

/** Proyección de navegación. No borra fichas ni notas. */
export function visibleStoryEntities(story: WriterStory, blocks: StoryDocumentBlock[]): StoryEntity[] {
  const slugs = saneCharacterSlugs(blocks);
  return story.entities.filter((entity) => {
    if (entity.bound === "global") return false;
    if (entity.group !== "character") return true;
    if (hasExplicitOwnership(story, entity)) return true;
    const names = [entity.label, ...entity.aliases];
    if (!names.some((name) => isSaneCharacterCue(name))) return false;
    return names.some((name) => slugs.has(writerEntityId(name)));
  });
}

export function projectNavigationStory(story: WriterStory, blocks: StoryDocumentBlock[]): WriterStory {
  const ids = new Set(visibleStoryEntities(story, blocks).map((entity) => entity.id));
  return {
    ...story,
    entities: story.entities.filter((entity) => entity.bound === "global" || ids.has(entity.id)),
  };
}

export type StorySnapshotCharacter = {
  id: string;
  title: string;
  brief: string | null;
  arc: string | null;
  briefStale: boolean;
  appearances: number;
  scenes: number;
  milestones: number;
};

export type StoryHistoryRow = {
  id: string;
  blockId: string;
  label: string;
  text: string;
};

export type StoryRelationPreview = {
  relationId: string;
  title: string;
  text: string;
};

export type StoryLocationPreview = {
  label: string;
  scenes: number;
  detail: string | null;
  blockId: string;
};

export type StorySnapshotUnit = StoryStructureUnit & { brief: string | null };

export type StorySnapshot = {
  brief: { text: string; stale: boolean } | null;
  kind: StoryStructureKind | null;
  counts: { units: number; locations: number; characters: number };
  units: StorySnapshotUnit[];
  unitPreview: StorySnapshotUnit[];
  locations: StoryLocation[];
  characters: StorySnapshotCharacter[];
  characterTotal: number;
  openQuestions: number;
  questionPreview: { id: string; text: string }[];
  historyPreview: StoryHistoryRow[];
  relationsPreview: StoryRelationPreview[];
  relationTotal: number;
  revelationsPreview: string[];
  locationPreview: StoryLocationPreview[];
  secondaryNames: string[];
  nonlinear: boolean;
  chronology: boolean;
  freshChanges: number;
  hintUpdate: boolean;
};

export function buildStorySnapshot(
  story: WriterStory,
  blocks: StoryDocumentBlock[],
  appearances: StoryAppearance[],
  freshChanges: number,
  liveHashes?: Map<string, string>,
  adapter: WriterContextAdapter = scriptContextAdapter,
): StorySnapshot {
  const live = liveHashes ?? hashesOf(blocks);
  const structure = deriveStoryStructure(blocks, { kinds: adapter.structureKinds });
  const characters = adapter.supports.characters ? characterRows(story, blocks, appearances, structure.units, live) : [];
  const withBriefs = attachSceneBriefs(structure.units, blocks, story.presentation?.sceneBriefs);
  const preview = withBriefs.length <= HOME_UNIT_CAP ? withBriefs : withBriefs.slice(-HOME_UNIT_TAIL);
  const brief = story.presentation?.storyBrief;
  const shown = brief ? { text: brief.text, stale: presentationBriefIsStale(brief, live) || freshChanges > 0 } : null;
  const questions = adapter.supports.narrativeQuestions ? questionIndex(story.questions ?? [], live) : null;
  const open = questions?.open ?? [];
  const clock = sceneChronology(structure.units);
  const history = projectHistory(story, blocks, structure.units, story.presentation?.sceneBriefs);
  const relations = relationPreview(story, characters.map((item) => item.id));
  const ranked = characters.slice(0, HOME_CHARACTER_CAP);
  return {
    brief: shown,
    kind: structure.kind,
    counts: {
      units: structure.units.length,
      locations: structure.locations.length,
      characters: characters.length,
    },
    units: withBriefs,
    unitPreview: preview,
    locations: adapter.supports.locations ? structure.locations : [],
    characters: ranked,
    characterTotal: characters.length,
    openQuestions: open.length,
    questionPreview: open.slice(0, HOME_QUESTION_CAP).map((item) => ({ id: item.id, text: item.text })),
    historyPreview: history.slice(0, HOME_HISTORY_CAP),
    relationsPreview: relations.slice(0, HOME_RELATION_CAP),
    relationTotal: relations.length,
    revelationsPreview: (story.presentation?.revelations ?? []).slice(0, HOME_REVELATION_CAP).map((item) => item.text),
    locationPreview: adapter.supports.locations ? locationPreview(structure.locations, structure.units).slice(0, HOME_LOCATION_CAP) : [],
    secondaryNames: adapter.supports.characters ? secondaryCast(structure.units, story, blocks) : [],
    nonlinear: clock.nonlinear,
    chronology: clock.confident,
    freshChanges,
    hintUpdate: !shown && freshChanges > 0 && (structure.units.length > 0 || characters.length > 0),
  };
}

export type EntityPresentation = {
  id: string;
  title: string;
  profileLabel: string;
  profileAction: string;
  brief: { text: string; stale: boolean } | null;
  arcBrief: { text: string; stale: boolean } | null;
  appearances: number;
  scenes: number;
  sharesScenesWith: string[];
  firstAppearance: string | null;
  absent: boolean;
  profile: string;
  stateLines: string[];
  trace: string | null;
  tracePreview: { id: string; text: string; blockId: string | null }[];
  relations: { relationId: string; otherId: string; otherLabel: string; phrase: string }[];
  notes: StoryNote[];
  openQuestions: { id: string; text: string; introducedOrder: number | null; lastAdvancedOrder: number | null; source: "author" | "text" }[];
  resolvedQuestions: number;
};

export function buildEntityPresentation(
  story: WriterStory,
  entity: StoryEntity,
  blocks: StoryDocumentBlock[],
  appearances: StoryAppearance[],
  relations: EntityPresentation["relations"],
  liveHashes?: Map<string, string>,
  adapter: WriterContextAdapter = scriptContextAdapter,
): EntityPresentation {
  const live = liveHashes ?? hashesOf(blocks);
  const structure = deriveStoryStructure(blocks, { kinds: adapter.structureKinds });
  const own = appearances.filter((item) => item.entityId === entity.id);
  const stats = sceneStats(entity, structure.units, own);
  const brief = story.presentation?.entityBriefs?.[entity.id];
  const arc = story.presentation?.entityArcBriefs?.[entity.id];
  const indexed = adapter.supports.narrativeQuestions ? questionIndex(story.questions ?? [], live) : null;
  const ownQuestions = (indexed?.byEntity.get(entity.id) ?? []).filter((item) => item.status === "open");
  return {
    id: entity.id,
    title: storyDisplayTitle(entity.label, entity.group),
    profileLabel: adapter.profileLabelFor(entity.group),
    profileAction: adapter.profileActionFor(entity.group),
    brief: brief ? { text: brief.text, stale: presentationBriefIsStale(brief, live) } : null,
    arcBrief: arc ? { text: arc.text, stale: presentationBriefIsStale(arc, live) } : null,
    appearances: own.length,
    scenes: adapter.supports.scenes ? stats.scenes : 0,
    sharesScenesWith: adapter.supports.scenes ? stats.sharesWith : [],
    firstAppearance: adapter.supports.scenes ? firstAppearanceLabel(own) : null,
    absent: own.length === 0,
    profile: entity.definition,
    stateLines: entity.stateSummary?.split("\n").map((line) => line.trim()).filter(Boolean) ?? [],
    trace: adapter.supports.trace ? entity.traceSummary || entity.events[0]?.text || null : null,
    tracePreview: adapter.supports.trace ? tracePreview(entity) : [],
    relations,
    notes: entity.notes.filter((note) => note.idea !== "discarded"),
    openQuestions: ownQuestions.map((item) => ({
      id: item.id,
      text: item.text,
      introducedOrder: item.introducedOrder,
      lastAdvancedOrder: item.lastAdvancedOrder,
      source: item.source,
    })),
    resolvedQuestions: (indexed?.byEntity.get(entity.id) ?? []).filter((item) => item.status === "resolved").length,
  };
}

export function presentationBriefIsStale(brief: StoryPresentationBrief, live: Map<string, string>): boolean {
  if (brief.coverage?.kind === "revision") {
    const ids = brief.coverage.kind === "revision" ? brief.sourceBlockIds : [];
    if (ids.length === 0) return true;
    return ids.some((id) => !brief.sourceHashes[id] || live.get(id) !== brief.sourceHashes[id]);
  }
  const ids = brief.coverage?.kind === "blocks" ? brief.coverage.blockIds : brief.sourceBlockIds;
  if (ids.length === 0) return true;
  if (brief.coverage && brief.coverage.kind !== "blocks" && brief.sourceBlockIds.length === 0) return true;
  return ids.some((id) => !brief.sourceHashes[id] || live.get(id) !== brief.sourceHashes[id]);
}

export function applyStoryPresentation(
  story: WriterStory,
  delta: PresentationDelta | null | undefined,
  cited: { blockId: string; hash: string }[],
  allowedEntityIds: string[],
  options?: { final?: boolean; live?: Map<string, string> },
): { story: WriterStory; changed: boolean } {
  if (!delta) return { story, changed: false };
  const citedHashes = new Map(cited.map((block) => [block.blockId, block.hash]));
  const live = options?.live ?? citedHashes;
  const allowed = new Set(allowedEntityIds);
  const batchOnly = options?.final === false;
  const final = options?.final === true;
  let presentation: StoryPresentation = { ...(story.presentation ?? {}) };
  let changed = false;
  const sceneBriefs = { ...(presentation.sceneBriefs ?? {}) };
  for (const row of delta.sceneBriefs ?? []) {
    const sceneId = row?.sceneId?.trim() ?? "";
    if (!sceneId) continue;
    const brief = acceptBrief(row, citedHashes, SCENE_BRIEF_LIMIT);
    if (!brief) continue;
    sceneBriefs[sceneId] = brief;
    changed = true;
  }
  if (Object.keys(sceneBriefs).length > 0) presentation = { ...presentation, sceneBriefs };
  if (batchOnly) return changed ? { story: { ...story, presentation }, changed } : { story, changed: false };

  const global = final ? delta.globalPresentation : undefined;
  const overview = global ? acceptOverview(global.storyOverview, live) : null;
  if (overview) {
    presentation = { ...presentation, storyBrief: overview };
    changed = true;
  } else if (!global?.storyOverview && presentation.storyBrief?.coverage?.kind !== "revision") {
    const storyBrief = acceptBrief(delta.storyBrief, citedHashes, STORY_BRIEF_LIMIT);
    if (storyBrief) {
      presentation = { ...presentation, storyBrief };
      changed = true;
    }
  }
  const entityBriefs = { ...(presentation.entityBriefs ?? {}) };
  const currents = global?.entityCurrentBriefs ?? [];
  for (const row of currents) {
    if (!story.entities.some((entity) => entity.id === row.entityId)) continue;
    const brief = acceptEntityText(row.entityId, row.text, story, live, ENTITY_BRIEF_LIMIT);
    if (!brief) continue;
    entityBriefs[row.entityId] = brief;
    changed = true;
  }
  if (currents.length === 0) {
    for (const row of delta.entityBriefs ?? []) {
      if (!row || !allowed.has(row.entityId)) continue;
      if (!story.entities.some((entity) => entity.id === row.entityId)) continue;
      const brief = acceptBrief(row, citedHashes, ENTITY_BRIEF_LIMIT);
      if (!brief) continue;
      entityBriefs[row.entityId] = brief;
      changed = true;
    }
  }
  const arcs = { ...(presentation.entityArcBriefs ?? {}) };
  for (const row of global?.entityArcBriefs ?? []) {
    if (!story.entities.some((entity) => entity.id === row.entityId)) continue;
    const brief = acceptEntityText(row.entityId, row.text, story, live, ENTITY_BRIEF_LIMIT);
    if (!brief) continue;
    arcs[row.entityId] = brief;
    changed = true;
  }
  const relationLines = { ...(presentation.relationLines ?? {}) };
  const knownRelations = new Set((story.relations ?? []).map((row) => row.id));
  for (const row of global?.relationLines ?? []) {
    const text = row?.text?.replace(/\s+/g, " ").trim().slice(0, 180) ?? "";
    if (!text || !knownRelations.has(row.relationId)) continue;
    relationLines[row.relationId] = text;
    changed = true;
  }
  if (global?.revelations) {
    const revelations = acceptRevelations(global.revelations, story);
    if (revelations.length > 0) {
      presentation = { ...presentation, revelations };
      changed = true;
    }
  }
  if (!changed) return { story, changed: false };
  if (Object.keys(entityBriefs).length > 0) presentation = { ...presentation, entityBriefs };
  if (Object.keys(arcs).length > 0) presentation = { ...presentation, entityArcBriefs: arcs };
  if (Object.keys(relationLines).length > 0) presentation = { ...presentation, relationLines };
  return { story: { ...story, presentation }, changed: true };
}

export function normalizePresentation(value: unknown): StoryPresentation | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const storyBrief = normalizeBrief(row.storyBrief);
  const entityBriefs: Record<string, StoryPresentationBrief> = {};
  if (row.entityBriefs && typeof row.entityBriefs === "object" && !Array.isArray(row.entityBriefs)) {
    for (const [id, item] of Object.entries(row.entityBriefs as Record<string, unknown>)) {
      const brief = normalizeBrief(item);
      if (id.trim() && brief) entityBriefs[id] = brief;
    }
  }
  const sceneBriefs: Record<string, StoryPresentationBrief> = {};
  if (row.sceneBriefs && typeof row.sceneBriefs === "object" && !Array.isArray(row.sceneBriefs)) {
    for (const [id, item] of Object.entries(row.sceneBriefs as Record<string, unknown>)) {
      const brief = normalizeBrief(item);
      if (id.trim() && brief) sceneBriefs[id] = brief;
    }
  }
  const entityArcBriefs: Record<string, StoryPresentationBrief> = {};
  if (row.entityArcBriefs && typeof row.entityArcBriefs === "object" && !Array.isArray(row.entityArcBriefs)) {
    for (const [id, item] of Object.entries(row.entityArcBriefs as Record<string, unknown>)) {
      const brief = normalizeBrief(item);
      if (id.trim() && brief) entityArcBriefs[id] = brief;
    }
  }
  const relationLines: Record<string, string> = {};
  if (row.relationLines && typeof row.relationLines === "object" && !Array.isArray(row.relationLines)) {
    for (const [id, item] of Object.entries(row.relationLines as Record<string, unknown>)) {
      const text = typeof item === "string" ? item.replace(/\s+/g, " ").trim() : "";
      if (id.trim() && text) relationLines[id] = text.slice(0, 180);
    }
  }
  const revelations = Array.isArray(row.revelations)
    ? row.revelations.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const revelation = item as Record<string, unknown>;
        const text = typeof revelation.text === "string" ? revelation.text.replace(/\s+/g, " ").trim() : "";
        const support = Array.isArray(revelation.support)
          ? revelation.support.flatMap((part) => {
              if (!part || typeof part !== "object") return [];
              const rowPart = part as Record<string, unknown>;
              const kind = rowPart.kind === "event" ? "event" as const : rowPart.kind === "fact" ? "fact" as const : rowPart.kind === "state" ? "state" as const : null;
              const id = typeof rowPart.id === "string" ? rowPart.id.trim() : "";
              return kind && id ? [{ kind, id }] : [];
            })
          : [];
        return text && support.length > 0 ? [{ text: text.slice(0, 180), support }] : [];
      })
    : [];
  if (!storyBrief && Object.keys(entityBriefs).length === 0 && Object.keys(entityArcBriefs).length === 0 && Object.keys(sceneBriefs).length === 0 && revelations.length === 0) return undefined;
  return {
    ...(storyBrief ? { storyBrief } : {}),
    ...(Object.keys(entityBriefs).length > 0 ? { entityBriefs } : {}),
    ...(Object.keys(entityArcBriefs).length > 0 ? { entityArcBriefs } : {}),
    ...(Object.keys(sceneBriefs).length > 0 ? { sceneBriefs } : {}),
    ...(Object.keys(relationLines).length > 0 ? { relationLines } : {}),
    ...(revelations.length > 0 ? { revelations } : {}),
  };
}

export function untilUpdateLine(freshChanges: number): string {
  if (freshChanges <= 0) return "Hasta última actualización";
  const changes = freshChanges === 1 ? "1 cambio nuevo" : `${freshChanges} cambios nuevos`;
  return `Hasta última actualización · ${changes}`;
}

export function freshChangesLine(freshChanges: number): string {
  return freshChanges === 1 ? "1 cambio nuevo" : `${freshChanges} cambios nuevos`;
}

function attachSceneBriefs(
  units: StoryStructureUnit[],
  blocks: StoryDocumentBlock[],
  briefs: Record<string, StoryPresentationBrief> | undefined,
): StorySnapshotUnit[] {
  const ranges = units.map((unit, index) => {
    const from = blocks.find((block) => block.blockId === unit.blockId)?.order ?? 0;
    const next = units[index + 1];
    const to = next ? blocks.find((block) => block.blockId === next.blockId)?.order ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
    return { unit, from, to };
  });
  const textByUnit = new Map<string, string>();
  for (const [sceneId, brief] of Object.entries(briefs ?? {})) {
    const range = ranges.find((item) => item.unit.id === sceneId || brief.sourceBlockIds.some((id) => {
      const block = blocks.find((candidate) => candidate.blockId === id);
      return block ? block.order >= item.from && block.order < item.to : false;
    }));
    if (range && !textByUnit.has(range.unit.id)) textByUnit.set(range.unit.id, brief.text);
  }
  return ranges.map(({ unit }) => ({ ...unit, brief: textByUnit.get(unit.id) ?? null }));
}

function firstAppearanceLabel(appearances: StoryAppearance[]): string | null {
  const first = [...appearances].sort((a, b) => a.order - b.order).find((item) => item.scene);
  if (!first?.scene) return null;
  return parseSceneHeading(first.scene).locationLabel;
}

function characterRows(
  story: WriterStory,
  blocks: StoryDocumentBlock[],
  appearances: StoryAppearance[],
  units: StoryStructureUnit[],
  live: Map<string, string>,
): StorySnapshotCharacter[] {
  return visibleStoryEntities(story, blocks)
    .filter((entity) => entity.group === "character")
    .map((entity) => {
      const own = appearances.filter((item) => item.entityId === entity.id);
      const brief = story.presentation?.entityBriefs?.[entity.id];
      const arc = story.presentation?.entityArcBriefs?.[entity.id];
      const last = own.reduce((max, item) => Math.max(max, item.order), 0);
      const degree = (story.relations ?? []).filter((row) => row.fromEntityId === entity.id || row.toEntityId === entity.id).length;
      const scenes = sceneStats(entity, units, own).scenes;
      return {
        id: entity.id,
        title: storyDisplayTitle(entity.label, "character"),
        brief: brief?.text ?? null,
        arc: arc?.text ?? null,
        briefStale: brief ? presentationBriefIsStale(brief, live) : false,
        appearances: own.length,
        scenes,
        milestones: entity.events.length,
        rank: scenes * 3 + entity.events.length * 2 + degree + last / 1000,
      };
    })
    .sort((a, b) => b.rank - a.rank || a.title.localeCompare(b.title, "es"))
    .map(({ rank: _rank, ...row }) => row);
}

function sceneStats(
  entity: StoryEntity,
  units: StoryStructureUnit[],
  own: StoryAppearance[],
): { scenes: number; sharesWith: string[] } {
  const title = storyDisplayTitle(entity.label, entity.group);
  const slug = writerEntityId(title);
  const sceneKeys = new Set(own.map((item) => item.scene).filter((scene): scene is string => Boolean(scene)));
  const shares = new Set<string>();
  let scenes = 0;
  for (const unit of units) {
    const inCast = unit.cast.some((name) => writerEntityId(name) === slug);
    const inScene = unit.kind === "scene" && sceneKeys.has(unit.heading);
    if (!inCast && !inScene) continue;
    scenes += 1;
    for (const name of unit.cast) {
      if (writerEntityId(name) !== slug) shares.add(name);
    }
  }
  if (scenes === 0 && entity.group === "character") {
    const chapters = new Set(own.map((item) => item.chapterId).filter((id): id is string => Boolean(id)));
    scenes = chapters.size;
  }
  return { scenes, sharesWith: [...shares] };
}

function acceptBrief(
  value: { text?: string; sourceBlockIds?: string[] } | undefined,
  citedHashes: Map<string, string>,
  limit: number,
): StoryPresentationBrief | null {
  const text = value?.text?.replace(/\s+/g, " ").trim() ?? "";
  const sourceBlockIds = (value?.sourceBlockIds ?? []).map((id) => id.trim()).filter(Boolean);
  if (!text || sourceBlockIds.length === 0) return null;
  if (sourceBlockIds.some((id) => !citedHashes.has(id))) return null;
  const sourceHashes: Record<string, string> = {};
  for (const id of sourceBlockIds) sourceHashes[id] = citedHashes.get(id) ?? "";
  return {
    text: text.slice(0, limit),
    sourceBlockIds,
    sourceHashes,
    analysisVersion: PRESENTATION_ANALYSIS_VERSION,
    coverage: { kind: "blocks", blockIds: sourceBlockIds },
  };
}

function normalizeBrief(value: unknown): StoryPresentationBrief | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const text = typeof row.text === "string" ? row.text.replace(/\s+/g, " ").trim() : "";
  const sourceBlockIds = Array.isArray(row.sourceBlockIds)
    ? row.sourceBlockIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  const sourceHashes: Record<string, string> = {};
  if (row.sourceHashes && typeof row.sourceHashes === "object" && !Array.isArray(row.sourceHashes)) {
    for (const id of sourceBlockIds) {
      const hash = (row.sourceHashes as Record<string, unknown>)[id];
      if (typeof hash === "string" && hash.trim()) sourceHashes[id] = hash.trim();
    }
  }
  if (!text || sourceBlockIds.length === 0 || Object.keys(sourceHashes).length !== sourceBlockIds.length) return null;
  const coverage = normalizeCoverage(row.coverage, sourceBlockIds);
  return {
    text: text.slice(0, STORY_BRIEF_LIMIT),
    sourceBlockIds,
    sourceHashes,
    analysisVersion: typeof row.analysisVersion === "number" && row.analysisVersion >= 0 ? Math.floor(row.analysisVersion) : 0,
    ...(coverage ? { coverage } : {}),
  };
}

function normalizeCoverage(value: unknown, sourceBlockIds: string[]): StoryPresentationCoverage | undefined {
  if (!value || typeof value !== "object") return { kind: "blocks", blockIds: sourceBlockIds };
  const row = value as Record<string, unknown>;
  if (row.kind === "chapters" && Array.isArray(row.chapterIds)) {
    const chapterIds = row.chapterIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
    if (chapterIds.length > 0) return { kind: "chapters", chapterIds };
  }
  if (row.kind === "revision" && typeof row.revisionId === "string" && row.revisionId.trim()) {
    return { kind: "revision", revisionId: row.revisionId.trim() };
  }
  return { kind: "blocks", blockIds: sourceBlockIds };
}

function hashesOf(blocks: StoryDocumentBlock[]): Map<string, string> {
  return new Map(blocks.map((block) => [block.blockId, writerBlockTextHash(block.text)]));
}

const SIGNIFICANT_PREDICATE = /knowledge|relationship|life|alive|dead|secret/i;
const THEME_REVELATION = /identidad|redenci[oó]n|la historia habla|el tema/i;

function acceptOverview(
  value: { text?: string; sceneIds?: string[] } | undefined,
  live: Map<string, string>,
): StoryPresentationBrief | null {
  const text = value?.text?.replace(/\s+/g, " ").trim() ?? "";
  const sceneIds = [...new Set((value?.sceneIds ?? []).map((id) => id.trim()).filter((id) => live.has(id)))];
  if (!text || sceneIds.length === 0) return null;
  const sourceHashes: Record<string, string> = {};
  for (const id of sceneIds) sourceHashes[id] = live.get(id) ?? "";
  return {
    text: text.slice(0, STORY_BRIEF_LIMIT),
    sourceBlockIds: sceneIds,
    sourceHashes,
    analysisVersion: PRESENTATION_ANALYSIS_VERSION,
    coverage: { kind: "revision", revisionId: [...sceneIds].sort().join("|") },
  };
}

function acceptEntityText(
  entityId: string,
  text: string,
  story: WriterStory,
  live: Map<string, string>,
  limit: number,
): StoryPresentationBrief | null {
  const clean = text.replace(/\s+/g, " ").trim();
  const entity = story.entities.find((item) => item.id === entityId);
  if (!clean || !entity) return null;
  const sourceBlockIds = [...new Set(
    [...entity.events, ...entity.textFacts, ...entity.stateChanges].flatMap((item) => item.sourceBlockIds).filter((id) => live.has(id)),
  )].slice(0, 12);
  if (sourceBlockIds.length === 0) return null;
  const sourceHashes: Record<string, string> = {};
  for (const id of sourceBlockIds) sourceHashes[id] = live.get(id) ?? "";
  return {
    text: clean.slice(0, limit),
    sourceBlockIds,
    sourceHashes,
    analysisVersion: PRESENTATION_ANALYSIS_VERSION,
    coverage: { kind: "blocks", blockIds: sourceBlockIds },
  };
}

function acceptRevelations(
  rows: GlobalPresentation["revelations"] | undefined,
  story: WriterStory,
): StoryRevelation[] {
  if (!rows?.length) return [];
  const records = supportIndex(story);
  const labels = story.entities
    .filter((entity) => entity.bound !== "global" && entity.label.trim())
    .map((entity) => ({ id: entity.id, label: entity.label.trim() }));
  const accepted: StoryRevelation[] = [];
  for (const row of rows) {
    const text = row?.text?.replace(/\s+/g, " ").trim().slice(0, 180) ?? "";
    const support = (row?.support ?? []).filter((item) => item?.id && records.has(`${item.kind}:${item.id}`));
    if (!text || support.length === 0 || THEME_REVELATION.test(text)) continue;
    const backed = support.map((item) => records.get(`${item.kind}:${item.id}`)).filter((item): item is SupportRecord => Boolean(item));
    const named = labels.filter((entity) => new RegExp(`\\b${escapeRegExp(entity.label)}\\b`, "i").test(text));
    const supportText = backed.map((item) => item.text).join(" ");
    const supportEntities = new Set(backed.flatMap((item) => item.entityIds));
    if (named.some((entity) => !supportEntities.has(entity.id) && !new RegExp(`\\b${escapeRegExp(entity.label)}\\b`, "i").test(supportText))) continue;
    accepted.push({ text, support: support.slice(0, 4) });
    if (accepted.length >= HOME_REVELATION_CAP) break;
  }
  return accepted;
}

type SupportRecord = { text: string; entityIds: string[] };

function supportIndex(story: WriterStory): Map<string, SupportRecord> {
  const index = new Map<string, SupportRecord>();
  for (const entity of story.entities) {
    for (const event of entity.events) {
      const key = `event:${event.id}`;
      const prev = index.get(key);
      index.set(key, {
        text: event.text,
        entityIds: [...new Set([...(prev?.entityIds ?? []), entity.id, ...(event.entityIds ?? [])])],
      });
    }
    for (const fact of entity.textFacts) index.set(`fact:${fact.id}`, { text: fact.text, entityIds: [entity.id] });
    for (const change of entity.stateChanges) index.set(`state:${change.id}`, { text: change.text || change.predicate, entityIds: [entity.id] });
  }
  return index;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tracePreview(entity: StoryEntity): { id: string; text: string; blockId: string | null }[] {
  const seen = new Set<string>();
  const rows = [...entity.events]
    .sort((a, b) => a.order - b.order)
    .flatMap((event) => {
      const key = event.sharedId || event.fingerprint || event.id;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ id: event.id, text: event.text, blockId: event.sourceBlockIds[0] ?? null, order: event.order, score: 0 }];
    });
  return spreadRows(rows, 6).map(({ id, text, blockId }) => ({ id, text, blockId }));
}

function projectHistory(
  story: WriterStory,
  blocks: StoryDocumentBlock[],
  units: StoryStructureUnit[],
  sceneBriefs: Record<string, StoryPresentationBrief> | undefined,
): StoryHistoryRow[] {
  if (units.length === 0) return [];
  const span = unitSpans(blocks, units);
  const byUnit = new Map(units.map((unit) => [unit.id, unit]));
  const seen = new Set<string>();
  const best = new Map<string, { score: number; order: number; text: string; blockId: string }>();
  for (const entity of story.entities) {
    for (const event of entity.events) {
      const key = event.sharedId || event.fingerprint || event.id;
      if (seen.has(key)) continue;
      const unitId = unitForBlocks(event.sourceBlockIds, span);
      const unit = unitId ? byUnit.get(unitId) : undefined;
      if (!unit) continue;
      seen.add(key);
      const multi = (event.entityIds?.length ?? 0) > 1 || Boolean(event.sharedId) ? 2 : 0;
      const stateBoost = entity.stateChanges.some((change) => SIGNIFICANT_PREDICATE.test(change.predicate) && change.sourceBlockIds.some((id) => span.get(unit.id)?.has(id))) ? 2 : 0;
      const score = multi + stateBoost + (event.text.trim() ? 1 : 0);
      const blockId = event.sourceBlockIds.find((id) => span.get(unit.id)?.has(id)) ?? unit.blockId;
      const current = best.get(unit.id);
      if (!current || score > current.score || (score === current.score && event.order > current.order)) {
        best.set(unit.id, { score, order: event.order, text: sceneBriefs?.[unit.id]?.text || event.text, blockId });
      }
    }
  }
  const clock = sceneChronology(units);
  const rows = [...best.entries()]
    .map(([id, row]) => {
      const unit = byUnit.get(id);
      if (!unit) return null;
      return {
        id,
        blockId: row.blockId,
        label: unit.timeLabel ? `${unit.title} · ${unit.timeLabel}` : unit.title,
        text: row.text,
        order: clock.nonlinear ? unit.chronologyOrder ?? unit.order : unit.order,
        score: row.score,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => a.order - b.order);
  return spreadRows(rows, HOME_HISTORY_CAP).map(({ id, blockId, label, text }) => ({ id, blockId, label, text }));
}

function unitSpans(blocks: StoryDocumentBlock[], units: StoryStructureUnit[]): Map<string, Set<string>> & { blockToUnit?: Map<string, string> } {
  const heading = new Map(units.map((unit) => [unit.blockId, unit.id]));
  const spans = new Map<string, Set<string>>();
  const blockToUnit = new Map<string, string>();
  let current: string | null = null;
  for (const block of blocks) {
    const next = heading.get(block.blockId);
    if (next) current = next;
    if (!current) continue;
    const set = spans.get(current) ?? new Set<string>();
    set.add(block.blockId);
    spans.set(current, set);
    blockToUnit.set(block.blockId, current);
  }
  return Object.assign(spans, { blockToUnit });
}

function unitForBlocks(blockIds: string[], spans: { blockToUnit?: Map<string, string> }): string | null {
  for (const id of blockIds) {
    const unitId = spans.blockToUnit?.get(id);
    if (unitId) return unitId;
  }
  return null;
}

function spreadRows<T extends { score?: number }>(rows: T[], cap: number): T[] {
  if (rows.length <= cap) return rows;
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) return rows.slice(0, cap);
  const middle = rows.slice(1, -1).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, cap - 2);
  const kept = new Set([first, last, ...middle]);
  return rows.filter((row) => kept.has(row));
}

function relationPreview(story: WriterStory, principalIds: string[]): StoryRelationPreview[] {
  const labels = new Map(story.entities.map((entity) => [entity.id, entity.label]));
  const principal = new Set(principalIds);
  const lines = story.presentation?.relationLines ?? {};
  return (story.relations ?? [])
    .flatMap((row) => {
      const from = labels.get(row.fromEntityId);
      const to = labels.get(row.toEntityId);
      if (!from || !to) return [];
      const text = (lines[row.id] || row.label || "").replace(/\s+/g, " ").trim();
      if (!text) return [];
      const score = (principal.has(row.fromEntityId) ? 2 : 0) + (principal.has(row.toEntityId) ? 2 : 0) + Math.min(row.evidence.length, 4);
      return [{ relationId: row.id, title: `${from} y ${to}`, text, score }];
    })
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "es"))
    .map(({ relationId, title, text }) => ({ relationId, title, text }));
}

function locationPreview(locations: StoryLocation[], units: StoryStructureUnit[]): StoryLocationPreview[] {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  return locations
    .map((location) => {
      const scenes = location.unitIds.map((id) => byId.get(id)).filter((unit): unit is StoryStructureUnit => Boolean(unit));
      const first = scenes[0];
      if (!first) return null;
      const clocks = scenes.filter((unit) => unit.timeLabel && /^\d{1,2}:\d{2}$/.test(unit.timeLabel));
      const detail = clocks.length === scenes.length && clocks.length > 0
        ? rangeLabel(clocks)
        : null;
      return { label: location.label, scenes: scenes.length, detail, blockId: first.blockId, weight: scenes.length };
    })
    .filter((row): row is StoryLocationPreview & { weight: number } => Boolean(row))
    .sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label, "es"))
    .map(({ weight: _weight, ...row }) => row);
}

function rangeLabel(units: StoryStructureUnit[]): string | null {
  const timed = units.filter((unit) => unit.parsedMinutes != null && unit.timeLabel);
  const first = [...timed].sort((a, b) => (a.parsedMinutes ?? 0) - (b.parsedMinutes ?? 0))[0];
  const last = [...timed].sort((a, b) => (b.parsedMinutes ?? 0) - (a.parsedMinutes ?? 0))[0];
  if (!first?.timeLabel || !last?.timeLabel || first.timeLabel === last.timeLabel) return first?.timeLabel ?? null;
  return `${first.timeLabel}–${last.timeLabel}`;
}

function secondaryCast(units: StoryStructureUnit[], story: WriterStory, blocks: StoryDocumentBlock[]): string[] {
  const known = new Set(
    visibleStoryEntities(story, blocks).flatMap((entity) => [entity.label, ...entity.aliases]).map((name) => writerEntityId(name)),
  );
  const names: string[] = [];
  const seen = new Set<string>();
  for (const unit of units) {
    for (const name of unit.cast) {
      if (!isSaneCharacterCue(name)) continue;
      const slug = writerEntityId(name);
      if (!slug || known.has(slug) || seen.has(slug)) continue;
      seen.add(slug);
      names.push(name);
      if (names.length >= 6) return names;
    }
  }
  return names;
}

/** Resumen local para la última llamada de Update Story. No se persiste. */
export function buildGlobalStoryDigest(
  story: WriterStory,
  blocks: StoryDocumentBlock[],
  focusSceneIds: string[] = [],
  adapter: WriterContextAdapter = scriptContextAdapter,
): string {
  const full = composeDigest(story, blocks, focusSceneIds, adapter, "full");
  if (full.length > 0 && full.length <= DIGEST_BUDGET) return full;
  const index = composeDigest(story, blocks, focusSceneIds, adapter, "index");
  return index.length > 0 && index.length <= DIGEST_BUDGET ? index : "";
}

function composeDigest(
  story: WriterStory,
  blocks: StoryDocumentBlock[],
  focusSceneIds: string[],
  adapter: WriterContextAdapter,
  mode: "full" | "index",
): string {
  const structure = deriveStoryStructure(blocks, { kinds: adapter.structureKinds });
  const clock = sceneChronology(structure.units);
  const spans = unitSpans(blocks, structure.units);
  const focus = new Set<string>();
  for (const id of focusSceneIds) {
    const unitId = spans.blockToUnit?.get(id);
    if (unitId) focus.add(unitId);
  }
  const characters = characterRows(story, blocks, [], structure.units, hashesOf(blocks)).slice(0, 8);
  const lines: string[] = [
    `ESCENAS ${structure.units.length}`,
    clock.nonlinear ? "CRONOLOGIA no lineal" : clock.confident ? "CRONOLOGIA lineal" : "CRONOLOGIA sin anclas",
  ];
  if (structure.locations.length > 0) lines.push(`LOCALIZACIONES ${structure.locations.map((item) => item.label).join("; ")}`);
  for (const entity of story.entities.filter((item) => characters.some((row) => row.id === item.id))) {
    const row = characters.find((item) => item.id === entity.id);
    lines.push(`PERSONAJE ${entity.id} ${entity.label} escenas ${row?.scenes ?? 0}`);
    if (mode === "full") {
      for (const event of entity.events.slice(-4)) lines.push(`- ${event.text}`);
      for (const change of entity.stateChanges.slice(-2)) lines.push(`- ${change.text || change.predicate}`);
    }
  }
  for (const relation of (story.relations ?? []).slice(0, 8)) {
    lines.push(`RELACION ${relation.id} ${relation.label}`);
  }
  for (const question of questionIndex(story.questions ?? [], hashesOf(blocks)).open.slice(0, 6)) {
    lines.push(`PENDIENTE ${question.text}`);
  }
  for (const unit of structure.units) {
    const brief = mode === "full" && (focus.has(unit.id) || structure.units.length <= 12) ? story.presentation?.sceneBriefs?.[unit.id]?.text?.slice(0, 160) : "";
    const cast = unit.cast.slice(0, 4).join(", ");
    lines.push(`ESCENA ${unit.id} | ${unit.timeLabel ?? "-"} | ${unit.locationLabel ?? unit.title} | ${cast}${brief ? ` | ${brief}` : ""}`);
  }
  const text = lines.join("\n");
  return mode === "index" ? text.slice(0, DIGEST_BUDGET) : text;
}
