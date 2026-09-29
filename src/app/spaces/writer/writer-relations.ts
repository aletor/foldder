import { writerBlockTextHash } from "./writer-block-id";
import { writerEntityId } from "./writer-entities";

type StoryEvidence = { blockId: string; text: string };

/**
 * Relaciones entre fichas de Story. La ausencia de fila es unknown:
 * no significa que alguien no sepa algo.
 * Una relación TEXT guarda documentOrder para que el estado vigente
 * sea el más reciente en el documento, sin borrar los anteriores.
 */

export const STORY_RELATION_TYPES = [
  "related",
  "family",
  "romantic",
  "friend",
  "enemy",
  "knows",
  "involved",
  "owns",
  "located_at",
  "knows_about",
] as const;

export type StoryRelationType = (typeof STORY_RELATION_TYPES)[number];

export type StoryRelationSource = "author" | "text";

export type StoryKnowledgeStance = "known" | "not_known_explicit";

export type StoryRelation = {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  type: StoryRelationType;
  label: string;
  qualifier?: string;
  stance?: StoryKnowledgeStance;
  source: StoryRelationSource;
  sourceBlockIds: string[];
  sourceHashes: Record<string, string>;
  evidence: StoryEvidence[];
  /** Orden del documento de la evidencia más reciente de esta fila. */
  documentOrder: number;
  confidence?: number;
  analysisVersion: number;
};

export type StoryThreadCandidate = {
  id: string;
  label: string;
  relatedEntityIds: string[];
  sourceBlockIds: string[];
  sourceHashes: Record<string, string>;
  evidence: StoryEvidence[];
  confidence: number;
  sourceSignature: string;
  possibleExistingEntityId?: string;
};

export type StoryDismissedCandidate = {
  key: string;
  sourceSignature: string;
};

export type StoryRelationRow = {
  relationId: string;
  otherId: string;
  otherLabel: string;
  phrase: string;
};

const TEMPORAL = new Set<StoryRelationType>(["knows_about", "located_at", "owns"]);
const THEMES = new Set(["amor", "culpa", "redencion", "familia", "identidad"]);
const TRIVIAL = new Set(["mesa", "puerta", "dia", "noche", "vez", "cosa", "momento", "hora", "mano", "ojos", "cabeza", "agua", "aire"]);
const ARTICLES = /^(?:el|la|los|las|un|una)\s+/i;

export function relationFingerprint(input: {
  fromEntityId: string;
  toEntityId: string;
  type: StoryRelationType;
  qualifier?: string;
  stance?: StoryKnowledgeStance;
  source: StoryRelationSource;
}): string {
  return [input.fromEntityId, input.toEntityId, input.type, input.qualifier ?? "", input.stance ?? "", input.source].join("\u0001");
}

export function normalizeAuthorRelation(phrase: string): { type: StoryRelationType; qualifier?: string; label: string; stance?: StoryKnowledgeStance } {
  const text = phrase.replace(/\s+/g, " ").trim();
  const key = fold(text);
  if (/^(?:hermano|hermana|hermanos|hermanas)$/.test(key)) return { type: "family", qualifier: "sibling", label: text || "hermana" };
  if (/^(?:padre|madre)$/.test(key)) return { type: "family", qualifier: "parent", label: text };
  if (/^(?:hijo|hija)$/.test(key)) return { type: "family", qualifier: "child", label: text };
  if (key === "pareja") return { type: "romantic", label: text };
  if (!text) return { type: "related", label: "relacionado" };
  return { type: "related", label: text };
}

export function authorRelation(input: { fromEntityId: string; toEntityId: string; phrase: string }): StoryRelation {
  const normalized = normalizeAuthorRelation(input.phrase);
  return {
    id: crypto.randomUUID(),
    fromEntityId: input.fromEntityId,
    toEntityId: input.toEntityId,
    type: normalized.type,
    label: normalized.label,
    qualifier: normalized.qualifier,
    stance: normalized.stance,
    source: "author",
    sourceBlockIds: [],
    sourceHashes: {},
    evidence: [],
    documentOrder: 0,
    analysisVersion: 1,
  };
}

export function mergeStoryRelations(current: StoryRelation[], incoming: StoryRelation[]): StoryRelation[] {
  const next = [...current];
  for (const row of incoming) {
    const key = relationFingerprint(row);
    const index = next.findIndex((item) => relationFingerprint(item) === key);
    const found = index >= 0 ? next[index] : null;
    if (!found) {
      next.push(row);
      continue;
    }
    if (row.source !== "text" || found.source !== "text") continue;
    next[index] = {
      ...found,
      label: found.label || row.label,
      sourceBlockIds: unique([...found.sourceBlockIds, ...row.sourceBlockIds]),
      sourceHashes: { ...found.sourceHashes, ...row.sourceHashes },
      evidence: mergeEvidence(found.evidence, row.evidence),
      documentOrder: Math.max(found.documentOrder, row.documentOrder),
      confidence: Math.max(found.confidence ?? 0, row.confidence ?? 0) || undefined,
    };
  }
  return next;
}

export function projectRelations(relations: StoryRelation[], live: Map<string, string>): StoryRelation[] {
  return relations.filter((row) => row.source === "author" || hashesMatch(row.sourceBlockIds, row.sourceHashes, live));
}

export function currentStance(
  relations: StoryRelation[],
  fromEntityId: string,
  toEntityId: string,
): StoryKnowledgeStance | "unknown" {
  const rows = relations.filter((row) => row.type === "knows_about" && row.fromEntityId === fromEntityId && row.toEntityId === toEntityId);
  const text = latest(rows.filter((row) => row.source === "text"));
  const author = rows.find((row) => row.source === "author") ?? null;
  const chosen = text ?? author;
  if (!chosen?.stance) return "unknown";
  return chosen.stance;
}

export function relationRowsFor(
  entityId: string,
  relations: StoryRelation[],
  entities: { id: string; label: string }[],
): StoryRelationRow[] {
  const labels = new Map(entities.map((entity) => [entity.id, entity.label]));
  const touching = relations.filter((row) => row.fromEntityId === entityId || row.toEntityId === entityId);
  const temporal = new Map<string, StoryRelation>();
  const rest: StoryRelation[] = [];
  for (const row of touching) {
    const other = row.fromEntityId === entityId ? row.toEntityId : row.fromEntityId;
    if (TEMPORAL.has(row.type)) {
      const key = `${other}\u0001${row.type}\u0001${row.source}`;
      const prev = temporal.get(key);
      if (!prev || row.documentOrder >= prev.documentOrder) temporal.set(key, row);
    } else rest.push(row);
  }
  const seen = new Set<string>();
  const rows: StoryRelationRow[] = [];
  for (const row of [...temporal.values(), ...rest]) {
    const otherId = row.fromEntityId === entityId ? row.toEntityId : row.fromEntityId;
    const phrase = row.label || defaultPhrase(row);
    const key = `${otherId}\u0001${row.type}\u0001${row.qualifier ?? ""}\u0001${row.stance ?? ""}\u0001${phrase}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const otherLabel = labels.get(otherId);
    if (!otherLabel) continue;
    rows.push({ relationId: row.id, otherId, otherLabel, phrase });
  }
  return rows;
}

export function relationNeighborIds(relations: StoryRelation[], entityId: string): string[] {
  const ids = new Set<string>();
  for (const row of relations) {
    if (row.fromEntityId === entityId) ids.add(row.toEntityId);
    else if (row.toEntityId === entityId) ids.add(row.fromEntityId);
  }
  return [...ids];
}

export function candidateCueKey(label: string): string {
  return writerEntityId(label.replace(ARTICLES, ""));
}

export function matchesExistingElement(label: string, entities: { id: string; label: string; aliases: string[]; group: string; bound: string }[]): { id: string } | "near" | null {
  const key = candidateCueKey(label);
  if (!key) return null;
  const stories = entities.filter((entity) => entity.group === "story" && entity.bound !== "global");
  const exact = stories.find((entity) => [entity.label, ...entity.aliases].some((phrase) => candidateCueKey(phrase) === key));
  if (exact) return { id: exact.id };
  const near = stories.find((entity) => {
    const other = candidateCueKey(entity.label);
    if (!other || other === key) return false;
    return other.startsWith(`${key}-`) || key.startsWith(`${other}-`);
  });
  return near ? "near" : null;
}

export function nearExistingId(label: string, entities: { id: string; label: string; aliases: string[]; group: string; bound: string }[]): string | null {
  const key = candidateCueKey(label);
  if (!key) return null;
  const near = entities.find((entity) => {
    if (entity.group !== "story" || entity.bound === "global") return false;
    const other = candidateCueKey(entity.label);
    if (!other || other === key) return false;
    return other.startsWith(`${key}-`) || key.startsWith(`${other}-`);
  });
  return near?.id ?? null;
}

export function isUsefulThreadLabel(label: string): boolean {
  const bare = fold(label).replace(/^(?:el|la|los|las|un|una)\s+/, "").trim();
  if (bare.length < 4 || bare.length > 48) return false;
  if (TRIVIAL.has(bare) || THEMES.has(bare)) return false;
  if (bare.split(" ").length > 6) return false;
  return true;
}

export function sourceSignature(hashes: Record<string, string>): string {
  const body = Object.entries(hashes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, hash]) => `${id}:${hash}`)
    .join("|");
  return writerBlockTextHash(body || "empty");
}

export function takeThreadCandidates(
  current: StoryThreadCandidate[],
  incoming: StoryThreadCandidate[],
  dismissed: StoryDismissedCandidate[],
  entities: { id: string; label: string; aliases: string[]; group: string; bound: string }[],
): StoryThreadCandidate[] {
  const dismissedKeys = new Map(dismissed.map((item) => [item.key, item.sourceSignature]));
  const next = [...current];
  for (const row of incoming) {
    if (!isUsefulThreadLabel(row.label)) continue;
    const match = matchesExistingElement(row.label, entities);
    if (match && match !== "near") continue;
    const key = candidateCueKey(row.label);
    if (dismissedKeys.get(key) === row.sourceSignature) continue;
    const near = match === "near" ? nearExistingId(row.label, entities) : null;
    const prepared = near ? { ...row, possibleExistingEntityId: near } : row;
    const index = next.findIndex((item) => candidateCueKey(item.label) === key);
    if (index >= 0) {
      const found = next[index];
      if (!found) continue;
      if (prepared.confidence >= found.confidence) next[index] = { ...prepared, id: found.id };
      continue;
    }
    next.push(prepared);
  }
  return next.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

export function projectCandidates(candidates: StoryThreadCandidate[], live: Map<string, string>): StoryThreadCandidate[] {
  return candidates.filter((row) => hashesMatch(row.sourceBlockIds, row.sourceHashes, live));
}

export function candidateBlurb(candidate: StoryThreadCandidate, entities: { id: string; label: string }[]): string {
  if (candidate.possibleExistingEntityId) {
    const label = entities.find((entity) => entity.id === candidate.possibleExistingEntityId)?.label;
    if (label) return `Puede que ya exista ${label}.`;
  }
  const names = candidate.relatedEntityIds
    .map((id) => entities.find((entity) => entity.id === id)?.label)
    .filter((label): label is string => Boolean(label));
  const scenes = candidate.sourceBlockIds.length;
  const who = names.length === 0 ? "" : names.length === 1 ? `Relacionado con ${names[0]}.` : `Relacionado con ${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}.`;
  const where = scenes > 1 ? `Aparece en ${scenes} escenas.` : "";
  return [who, where].filter(Boolean).join(" ") || "Aparece en el texto.";
}

export function relationSearchBlob(entityId: string, relations: StoryRelation[], entities: { id: string; label: string }[]): string {
  return relationRowsFor(entityId, relations, entities)
    .map((row) => `${row.otherLabel} ${row.phrase}`)
    .join("\n");
}

export function normalizeRelations(value: unknown): StoryRelation[] {
  if (!Array.isArray(value)) return [];
  const rows: StoryRelation[] = [];
  for (const item of value) {
    const row = normalizeRelation(item);
    if (row) rows.push(row);
  }
  return mergeStoryRelations([], rows);
}

export function normalizeThreadCandidates(value: unknown): StoryThreadCandidate[] {
  if (!Array.isArray(value)) return [];
  const rows: StoryThreadCandidate[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.replace(/\s+/g, " ").trim() : "";
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!label || !id) continue;
    const sourceBlockIds = stringIds(row.sourceBlockIds);
    const sourceHashes = hashRecord(row.sourceHashes, sourceBlockIds);
    rows.push({
      id,
      label,
      relatedEntityIds: stringIds(row.relatedEntityIds).slice(0, 8),
      sourceBlockIds,
      sourceHashes,
      evidence: evidenceOf(row.evidence, sourceBlockIds),
      confidence: typeof row.confidence === "number" && Number.isFinite(row.confidence) ? row.confidence : 0,
      sourceSignature: typeof row.sourceSignature === "string" && row.sourceSignature.trim() ? row.sourceSignature.trim() : sourceSignature(sourceHashes),
      possibleExistingEntityId: typeof row.possibleExistingEntityId === "string" ? row.possibleExistingEntityId : undefined,
    });
  }
  return rows.slice(0, 5);
}

export function normalizeDismissedCandidates(value: unknown): StoryDismissedCandidate[] {
  if (!Array.isArray(value)) return [];
  const rows: StoryDismissedCandidate[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const key = typeof row.key === "string" ? row.key.trim() : "";
    const sourceSignature = typeof row.sourceSignature === "string" ? row.sourceSignature.trim() : "";
    if (!key || !sourceSignature) continue;
    rows.push({ key, sourceSignature });
  }
  return rows;
}

export function isRelationType(value: string): value is StoryRelationType {
  return (STORY_RELATION_TYPES as readonly string[]).includes(value);
}

function normalizeRelation(value: unknown): StoryRelation | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const fromEntityId = typeof row.fromEntityId === "string" ? row.fromEntityId.trim() : "";
  const toEntityId = typeof row.toEntityId === "string" ? row.toEntityId.trim() : "";
  const type = typeof row.type === "string" ? row.type.trim() : "";
  const source = row.source === "author" || row.source === "text" ? row.source : null;
  if (!id || !fromEntityId || !toEntityId || !source || !isRelationType(type) || fromEntityId === toEntityId) return null;
  const sourceBlockIds = stringIds(row.sourceBlockIds);
  if (source === "text" && sourceBlockIds.length === 0) return null;
  const stance = row.stance === "known" || row.stance === "not_known_explicit" ? row.stance : undefined;
  if (type === "knows_about" && !stance) return null;
  return {
    id,
    fromEntityId,
    toEntityId,
    type,
    label: typeof row.label === "string" && row.label.trim() ? row.label.replace(/\s+/g, " ").trim().slice(0, 80) : defaultPhrase({ type, stance }),
    qualifier: typeof row.qualifier === "string" && row.qualifier.trim() ? row.qualifier.trim().slice(0, 40) : undefined,
    stance: type === "knows_about" ? stance : undefined,
    source,
    sourceBlockIds,
    sourceHashes: hashRecord(row.sourceHashes, sourceBlockIds),
    evidence: evidenceOf(row.evidence, sourceBlockIds),
    documentOrder: typeof row.documentOrder === "number" && Number.isFinite(row.documentOrder) ? row.documentOrder : 0,
    confidence: typeof row.confidence === "number" && Number.isFinite(row.confidence) ? row.confidence : undefined,
    analysisVersion: typeof row.analysisVersion === "number" && Number.isFinite(row.analysisVersion) ? Math.floor(row.analysisVersion) : 0,
  };
}

function latest(rows: StoryRelation[]): StoryRelation | null {
  return [...rows].sort((a, b) => b.documentOrder - a.documentOrder)[0] ?? null;
}

function defaultPhrase(row: { type: StoryRelationType; stance?: StoryKnowledgeStance }): string {
  if (row.type === "knows_about" && row.stance === "not_known_explicit") return "no lo conoce";
  if (row.type === "knows_about") return "lo conoce";
  if (row.type === "involved") return "implicado";
  if (row.type === "family") return "familia";
  if (row.type === "romantic") return "pareja";
  if (row.type === "friend") return "amigo";
  if (row.type === "enemy") return "enemigo";
  if (row.type === "owns") return "posee";
  if (row.type === "located_at") return "está en";
  if (row.type === "knows") return "conoce a";
  return "relacionado";
}

function hashesMatch(ids: string[], hashes: Record<string, string>, live: Map<string, string>): boolean {
  if (ids.length === 0) return false;
  return ids.every((id) => hashes[id] && live.get(id) === hashes[id]);
}

function mergeEvidence(current: StoryEvidence[], incoming: StoryEvidence[]): StoryEvidence[] {
  const next = [...current];
  for (const item of incoming) {
    if (next.some((row) => row.blockId === item.blockId && row.text === item.text)) continue;
    next.push(item);
    if (next.length >= 8) break;
  }
  return next;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function stringIds(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : [])) : [];
}

function hashRecord(value: unknown, ids: string[]): Record<string, string> {
  const hashes: Record<string, string> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return hashes;
  for (const id of ids) {
    const hash = (value as Record<string, unknown>)[id];
    if (typeof hash === "string" && hash.trim()) hashes[id] = hash.trim();
  }
  return hashes;
}

function evidenceOf(value: unknown, ids: string[]): StoryEvidence[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(ids);
  const evidence: StoryEvidence[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const blockId = typeof row.blockId === "string" ? row.blockId.trim() : "";
    const text = typeof row.text === "string" ? row.text.replace(/\s+/g, " ").trim() : "";
    if (!blockId || !text || !allowed.has(blockId)) continue;
    evidence.push({ blockId, text: text.slice(0, 180) });
  }
  return evidence;
}

function fold(value: string): string {
  return value.toLocaleLowerCase("es").normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();
}
