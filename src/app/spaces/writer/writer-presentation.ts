import type { StoryAppearance, StoryDocumentBlock } from "./writer-appearances";
import { writerBlockTextHash } from "./writer-block-id";
import { isSaneCharacterCue, storyDisplayTitle } from "./writer-cue";
import { writerEntityId } from "./writer-entities";
import { deriveStoryStructure, parseSceneHeading, type StoryLocation, type StoryStructureKind, type StoryStructureUnit } from "./writer-structure";
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

export type StoryPresentation = {
  storyBrief?: StoryPresentationBrief;
  entityBriefs?: Record<string, StoryPresentationBrief>;
  sceneBriefs?: Record<string, StoryPresentationBrief>;
};

export type PresentationDelta = {
  storyBrief?: { text: string; sourceBlockIds: string[] };
  entityBriefs?: { entityId: string; text: string; sourceBlockIds: string[] }[];
  sceneBriefs?: { sceneId: string; text: string; sourceBlockIds: string[] }[];
};

const STORY_BRIEF_LIMIT = 420;
const ENTITY_BRIEF_LIMIT = 280;
const SCENE_BRIEF_LIMIT = 180;
const HOME_UNIT_CAP = 6;
const HOME_UNIT_TAIL = 4;
const HOME_CHARACTER_CAP = 8;

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
  briefStale: boolean;
  appearances: number;
  scenes: number;
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
  freshChanges: number;
  hintUpdate: boolean;
};

export function buildStorySnapshot(
  story: WriterStory,
  blocks: StoryDocumentBlock[],
  appearances: StoryAppearance[],
  freshChanges: number,
  liveHashes?: Map<string, string>,
  screenplay = true,
): StorySnapshot {
  const live = liveHashes ?? hashesOf(blocks);
  const structure = deriveStoryStructure(blocks, { screenplay });
  const characters = characterRows(story, blocks, appearances, structure.units, live);
  const withBriefs = attachSceneBriefs(structure.units, blocks, story.presentation?.sceneBriefs);
  const preview = withBriefs.length <= HOME_UNIT_CAP ? withBriefs : withBriefs.slice(-HOME_UNIT_TAIL);
  const brief = story.presentation?.storyBrief;
  const shown = brief ? { text: brief.text, stale: presentationBriefIsStale(brief, live) || freshChanges > 0 } : null;
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
    locations: structure.locations,
    characters: characters.slice(0, HOME_CHARACTER_CAP),
    characterTotal: characters.length,
    freshChanges,
    hintUpdate: !shown && freshChanges > 0 && (structure.units.length > 0 || characters.length > 0),
  };
}

export type EntityPresentation = {
  id: string;
  title: string;
  profileLabel: "Perfil" | "Descripción";
  profileAction: string;
  brief: { text: string; stale: boolean } | null;
  appearances: number;
  scenes: number;
  sharesScenesWith: string[];
  firstAppearance: string | null;
  absent: boolean;
  profile: string;
  stateLines: string[];
  trace: string | null;
  relations: { relationId: string; otherId: string; otherLabel: string; phrase: string }[];
  notes: StoryNote[];
};

export function buildEntityPresentation(
  story: WriterStory,
  entity: StoryEntity,
  blocks: StoryDocumentBlock[],
  appearances: StoryAppearance[],
  relations: EntityPresentation["relations"],
  liveHashes?: Map<string, string>,
  screenplay = true,
): EntityPresentation {
  const live = liveHashes ?? hashesOf(blocks);
  const structure = deriveStoryStructure(blocks, { screenplay });
  const own = appearances.filter((item) => item.entityId === entity.id);
  const stats = sceneStats(entity, structure.units, own);
  const brief = story.presentation?.entityBriefs?.[entity.id];
  const character = entity.group === "character";
  return {
    id: entity.id,
    title: storyDisplayTitle(entity.label, entity.group),
    profileLabel: character ? "Perfil" : "Descripción",
    profileAction: character ? "+ Definir personaje" : "+ Añadir descripción",
    brief: brief ? { text: brief.text, stale: presentationBriefIsStale(brief, live) } : null,
    appearances: own.length,
    scenes: stats.scenes,
    sharesScenesWith: stats.sharesWith,
    firstAppearance: firstAppearanceLabel(own),
    absent: own.length === 0,
    profile: entity.definition,
    stateLines: entity.stateSummary?.split("\n").map((line) => line.trim()).filter(Boolean) ?? [],
    trace: entity.traceSummary || entity.events[0]?.text || null,
    relations,
    notes: entity.notes.filter((note) => note.idea !== "discarded"),
  };
}

export function presentationBriefIsStale(brief: StoryPresentationBrief, live: Map<string, string>): boolean {
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
): { story: WriterStory; changed: boolean } {
  if (!delta) return { story, changed: false };
  const citedHashes = new Map(cited.map((block) => [block.blockId, block.hash]));
  const allowed = new Set(allowedEntityIds);
  let presentation: StoryPresentation = { ...(story.presentation ?? {}) };
  let changed = false;
  const storyBrief = acceptBrief(delta.storyBrief, citedHashes, STORY_BRIEF_LIMIT);
  if (storyBrief) {
    presentation = { ...presentation, storyBrief };
    changed = true;
  }
  const entityBriefs = { ...(presentation.entityBriefs ?? {}) };
  for (const row of delta.entityBriefs ?? []) {
    if (!row || !allowed.has(row.entityId)) continue;
    if (!story.entities.some((entity) => entity.id === row.entityId)) continue;
    const brief = acceptBrief(row, citedHashes, ENTITY_BRIEF_LIMIT);
    if (!brief) continue;
    entityBriefs[row.entityId] = brief;
    changed = true;
  }
  const sceneBriefs = { ...(presentation.sceneBriefs ?? {}) };
  for (const row of delta.sceneBriefs ?? []) {
    const sceneId = row?.sceneId?.trim() ?? "";
    if (!sceneId) continue;
    const brief = acceptBrief(row, citedHashes, SCENE_BRIEF_LIMIT);
    if (!brief) continue;
    sceneBriefs[sceneId] = brief;
    changed = true;
  }
  if (!changed) return { story, changed: false };
  if (Object.keys(entityBriefs).length > 0) presentation = { ...presentation, entityBriefs };
  if (Object.keys(sceneBriefs).length > 0) presentation = { ...presentation, sceneBriefs };
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
  if (!storyBrief && Object.keys(entityBriefs).length === 0 && Object.keys(sceneBriefs).length === 0) return undefined;
  return {
    ...(storyBrief ? { storyBrief } : {}),
    ...(Object.keys(entityBriefs).length > 0 ? { entityBriefs } : {}),
    ...(Object.keys(sceneBriefs).length > 0 ? { sceneBriefs } : {}),
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
      const first = own.reduce((min, item) => Math.min(min, item.order), Number.POSITIVE_INFINITY);
      return {
        id: entity.id,
        title: storyDisplayTitle(entity.label, "character"),
        brief: brief?.text ?? null,
        briefStale: brief ? presentationBriefIsStale(brief, live) : false,
        appearances: own.length,
        scenes: sceneStats(entity, units, own).scenes,
        first,
      };
    })
    .sort((a, b) => a.first - b.first || a.title.localeCompare(b.title, "es"))
    .map(({ first: _first, ...row }) => row);
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
