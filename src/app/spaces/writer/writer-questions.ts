import type { StoryDocumentBlock } from "./writer-appearances";
import type { StoryDeltaEvidence } from "./writer-ai";
import type { StoryEvidence, WriterStory } from "./writer-story";

/**
 * Preguntas narrativas abiertas. No son tareas.
 * El estado se proyecta desde los eventos. No se guarda una lista por ficha.
 */

export type StoryQuestionSource = "author" | "text";
export type StoryQuestionEventKind = "introduced" | "advanced" | "resolved" | "reopened";
export type StoryQuestionOverride = "open" | "resolved" | null;

export type StoryQuestionEvent = {
  id: string;
  kind: StoryQuestionEventKind;
  source: StoryQuestionSource;
  text: string;
  documentOrder: number;
  sourceBlockIds: string[];
  sourceHashes: Record<string, string>;
  evidence: StoryEvidence[];
  confidence: number;
};

export type StoryQuestion = {
  id: string;
  text: string;
  source: StoryQuestionSource;
  relatedEntityIds: string[];
  events: StoryQuestionEvent[];
  authorOverride: StoryQuestionOverride;
  analysisVersion: number;
};

export type StoryDeltaQuestionEvent = {
  questionId?: string;
  operation: StoryQuestionEventKind;
  questionText?: string;
  relatedEntityIds?: string[];
  text?: string;
  sourceBlockIds: string[];
  evidence: StoryDeltaEvidence[];
  confidence: number;
};

export type ProjectedQuestion = {
  id: string;
  text: string;
  source: StoryQuestionSource;
  relatedEntityIds: string[];
  status: "open" | "resolved" | "hidden";
  introducedOrder: number | null;
  lastAdvancedOrder: number | null;
  authorOverride: StoryQuestionOverride;
  events: StoryQuestionEvent[];
};

const ANALYSIS_VERSION = 1;

const THRESHOLD: Record<StoryQuestionEventKind, number> = {
  introduced: 0.9,
  advanced: 0.85,
  resolved: 0.93,
  reopened: 0.93,
};

const KIND_RANK: Record<StoryQuestionEventKind, number> = {
  introduced: 0,
  advanced: 1,
  resolved: 2,
  reopened: 3,
};

const THEMES = new Set(["amor", "culpa", "redencion", "familia", "identidad"]);
const EMOTIONS = new Set(["triste", "tristeza", "feliz", "alegre", "enfadado", "miedo", "ansioso", "solo", "sola"]);
const STOP = new Set(["el", "la", "los", "las", "un", "una", "de", "del", "al", "a", "y", "o", "en", "que", "qué", "se", "su", "sus", "es", "esta", "está", "por", "para", "con", "como", "lo", "le"]);
const CAUSE = new Set(["provoco", "provocar", "provocado", "causa", "causo", "causar", "causado"]);

export function isNarrativeQuestion(text: string): boolean {
  const value = text.replace(/\s+/g, " ").trim();
  if (value.length < 8 || value.length > 180) return false;
  if (!/[?¿]/.test(value)) return false;
  if (/reescrib|corregir|revisar\s+el\s+cap|terminar\s+el\s+cap/iu.test(value)) return false;
  if (/qu[eé]\s+har[aá]/iu.test(value)) return false;
  if (/redenci[oó]n|encontrar[aá]\s+su\s+lugar/iu.test(value)) return false;
  const tokens = contentTokens(value);
  if (tokens.length === 0) return false;
  if (tokens.every((token) => THEMES.has(token) || EMOTIONS.has(token))) return false;
  return true;
}

export function questionsMatch(left: string, right: string): boolean {
  const a = signature(left);
  const b = signature(right);
  if (!a || !b || a.head !== b.head) return false;
  if (a.tokens.length === 0 || b.tokens.length === 0) return false;
  const inter = a.tokens.filter((token) => b.tokens.includes(token));
  const union = new Set([...a.tokens, ...b.tokens]);
  const score = inter.length / union.size;
  const subset = inter.length === Math.min(a.tokens.length, b.tokens.length);
  return score >= 0.6 && (subset || inter.length >= 2);
}

export function projectQuestions(questions: StoryQuestion[], live: Map<string, string>): ProjectedQuestion[] {
  return questions.map((question) => projectOne(question, live));
}

export function questionIndex(questions: StoryQuestion[], live: Map<string, string>): {
  open: ProjectedQuestion[];
  resolved: ProjectedQuestion[];
  byEntity: Map<string, ProjectedQuestion[]>;
} {
  const projected = projectQuestions(questions, live);
  const open = projected.filter((item) => item.status === "open");
  const resolved = projected.filter((item) => item.status === "resolved");
  const byEntity = new Map<string, ProjectedQuestion[]>();
  for (const item of projected) {
    if (item.status === "hidden") continue;
    for (const id of item.relatedEntityIds) {
      const list = byEntity.get(id) ?? [];
      list.push(item);
      byEntity.set(id, list);
    }
  }
  return { open, resolved, byEntity };
}

export function applyQuestionDelta(
  story: WriterStory,
  events: StoryDeltaQuestionEvent[] | undefined,
  cited: { blockId: string; hash: string }[],
  live: Map<string, { hash: string; order: number; text: string }>,
  allowedQuestionIds?: Set<string>,
): { questions: StoryQuestion[]; acceptedSourceIds: string[] } {
  const questions = [...(story.questions ?? [])];
  const acceptedSourceIds: string[] = [];
  for (const item of events ?? []) {
    const accepted = acceptQuestionEvent(story, questions, item, cited, live, allowedQuestionIds);
    if (!accepted) continue;
    acceptedSourceIds.push(...accepted.sourceBlockIds);
    const index = questions.findIndex((question) => question.id === accepted.questionId);
    if (index < 0) {
      questions.push({ ...accepted.question, events: [accepted.event] });
      continue;
    }
    const current = questions[index]!;
    if (current.events.some((event) => event.kind === accepted.event.kind && sameHashes(event.sourceHashes, accepted.event.sourceHashes))) continue;
    questions[index] = {
      ...current,
      relatedEntityIds: unique([...current.relatedEntityIds, ...accepted.question.relatedEntityIds]),
      events: [...current.events, accepted.event],
    };
  }
  return { questions, acceptedSourceIds };
}

export function addAuthorQuestion(story: WriterStory, text: string, relatedEntityIds: string[]): WriterStory {
  const value = text.replace(/\s+/g, " ").trim();
  if (!isNarrativeQuestion(value)) return story;
  const existing = (story.questions ?? []).find((question) => questionsMatch(question.text, value));
  if (existing) {
    const ids = unique([...existing.relatedEntityIds, ...relatedEntityIds]);
    return {
      ...story,
      questions: (story.questions ?? []).map((question) => (question.id === existing.id ? { ...question, relatedEntityIds: ids } : question)),
    };
  }
  const event: StoryQuestionEvent = {
    id: crypto.randomUUID(),
    kind: "introduced",
    source: "author",
    text: value,
    documentOrder: 0,
    sourceBlockIds: [],
    sourceHashes: {},
    evidence: [],
    confidence: 1,
  };
  const question: StoryQuestion = {
    id: crypto.randomUUID(),
    text: value,
    source: "author",
    relatedEntityIds: unique(relatedEntityIds),
    events: [event],
    authorOverride: null,
    analysisVersion: ANALYSIS_VERSION,
  };
  return { ...story, questions: [...(story.questions ?? []), question] };
}

export function editAuthorQuestion(story: WriterStory, id: string, text: string): WriterStory {
  const value = text.replace(/\s+/g, " ").trim();
  if (!isNarrativeQuestion(value)) return story;
  return {
    ...story,
    questions: (story.questions ?? []).map((question) => (question.id === id && question.source === "author" ? { ...question, text: value } : question)),
  };
}

export function setQuestionOverride(story: WriterStory, id: string, authorOverride: StoryQuestionOverride): WriterStory {
  return {
    ...story,
    questions: (story.questions ?? []).map((question) => (question.id === id ? { ...question, authorOverride } : question)),
  };
}

export function removeAuthorQuestion(story: WriterStory, id: string): WriterStory {
  return { ...story, questions: (story.questions ?? []).filter((question) => !(question.id === id && question.source === "author")) };
}

export function normalizeQuestions(value: unknown): StoryQuestion[] {
  if (!Array.isArray(value)) return [];
  const questions: StoryQuestion[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim().slice(0, 80) : "";
    const text = typeof row.text === "string" ? row.text.replace(/\s+/g, " ").trim().slice(0, 180) : "";
    if (!id || !text) continue;
    const source = row.source === "author" ? "author" : "text";
    const relatedEntityIds = stringList(row.relatedEntityIds, 8);
    const events = normalizeEvents(row.events);
    const authorOverride = row.authorOverride === "open" || row.authorOverride === "resolved" ? row.authorOverride : null;
    questions.push({ id, text, source, relatedEntityIds, events, authorOverride, analysisVersion: ANALYSIS_VERSION });
    if (questions.length >= 200) break;
  }
  return questions;
}

export function questionPlace(
  documentOrder: number | null,
  blocks: StoryDocumentBlock[],
  units: { order: number; blockId: string; kind: string; title: string }[],
): string | null {
  if (documentOrder == null) return null;
  const ordered = [...units].sort((a, b) => {
    const left = blocks.find((block) => block.blockId === a.blockId)?.order ?? 0;
    const right = blocks.find((block) => block.blockId === b.blockId)?.order ?? 0;
    return left - right;
  });
  let found = ordered[0] ?? null;
  for (const unit of ordered) {
    const start = blocks.find((block) => block.blockId === unit.blockId)?.order ?? 0;
    if (start <= documentOrder) found = unit;
  }
  if (!found) return null;
  if (found.kind === "scene") return `Escena ${found.order}`;
  if (found.kind === "chapter") return found.title || `Capítulo ${found.order}`;
  return found.title || null;
}

function projectOne(question: StoryQuestion, live: Map<string, string>): ProjectedQuestion {
  const events = question.events
    .filter((event) => event.source === "author" || sourcesValid(event, live))
    .sort((a, b) => a.documentOrder - b.documentOrder || KIND_RANK[a.kind] - KIND_RANK[b.kind]);
  const introduced = events.find((event) => event.kind === "introduced");
  let status: ProjectedQuestion["status"] = introduced ? "open" : "hidden";
  let lastAdvancedOrder = introduced?.documentOrder ?? null;
  if (introduced) {
    for (const event of events) {
      if (event.kind === "advanced" && status === "open") lastAdvancedOrder = event.documentOrder;
      if (event.kind === "resolved") status = "resolved";
      if (event.kind === "reopened") status = "open";
    }
  }
  if (question.authorOverride && status !== "hidden") status = question.authorOverride;
  return {
    id: question.id,
    text: question.text,
    source: question.source,
    relatedEntityIds: question.relatedEntityIds,
    status,
    introducedOrder: introduced?.documentOrder ?? null,
    lastAdvancedOrder,
    authorOverride: question.authorOverride,
    events,
  };
}

function acceptQuestionEvent(
  story: WriterStory,
  questions: StoryQuestion[],
  item: StoryDeltaQuestionEvent,
  cited: { blockId: string; hash: string }[],
  live: Map<string, { hash: string; order: number; text: string }>,
  allowedQuestionIds: Set<string> | undefined,
): { questionId: string; question: StoryQuestion; event: StoryQuestionEvent; sourceBlockIds: string[] } | null {
  if (item.confidence < THRESHOLD[item.operation]) return null;
  const citedById = new Map(cited.map((block) => [block.blockId, block.hash]));
  const sourceBlockIds = [...new Set(item.sourceBlockIds.map((id) => id.trim()).filter(Boolean))].slice(0, 4);
  if (sourceBlockIds.length === 0) return null;
  if (sourceBlockIds.some((id) => !citedById.has(id) || live.get(id)?.hash !== citedById.get(id))) return null;
  const sources = sourceBlockIds.flatMap((id) => {
    const block = live.get(id);
    return block ? [block] : [];
  });
  if (!evidenceInSources(item.evidence, sources)) return null;
  const evidence = item.evidence
    .filter((row) => sources.some((block) => block.text.includes(row.text.trim())))
    .slice(0, 2)
    .map((row) => ({ blockId: row.blockId, text: row.text.trim().slice(0, 180) }));
  const note = (item.text || item.questionText || "").replace(/\s+/g, " ").trim().slice(0, 180);
  const sourceHashes: Record<string, string> = {};
  for (const id of sourceBlockIds) sourceHashes[id] = live.get(id)?.hash ?? "";
  const documentOrder = Math.max(...sources.map((block) => block.order));
  const event: StoryQuestionEvent = {
    id: crypto.randomUUID(),
    kind: item.operation,
    source: "text",
    text: note || item.operation,
    documentOrder,
    sourceBlockIds,
    sourceHashes,
    evidence,
    confidence: item.confidence,
  };
  const related = (item.relatedEntityIds ?? []).map((id) => id.trim()).filter((id) => story.entities.some((entity) => entity.id === id)).slice(0, 6);
  if (item.operation === "introduced") {
    const questionText = (item.questionText ?? "").replace(/\s+/g, " ").trim();
    if (!isNarrativeQuestion(questionText)) return null;
    if (!grounded(questionText, sources)) return null;
    const match = questions.find((question) => questionsMatch(question.text, questionText));
    if (match) {
      return {
        questionId: match.id,
        question: match,
        event: { ...event, kind: "advanced", text: note || questionText },
        sourceBlockIds,
      };
    }
    const question: StoryQuestion = {
      id: questionIdFor(questionText),
      text: questionText,
      source: "text",
      relatedEntityIds: related,
      events: [],
      authorOverride: null,
      analysisVersion: ANALYSIS_VERSION,
    };
    return { questionId: question.id, question, event, sourceBlockIds };
  }
  const questionId = item.questionId?.trim() ?? "";
  if (!questionId) return null;
  if (allowedQuestionIds && !allowedQuestionIds.has(questionId)) return null;
  const current = questions.find((question) => question.id === questionId);
  if (!current) return null;
  if (!grounded(note || current.text, sources)) return null;
  return { questionId, question: current, event, sourceBlockIds };
}

function grounded(text: string, sources: { text: string }[]): boolean {
  const tokens = contentTokens(text);
  if (tokens.length === 0) return false;
  const blob = ` ${contentTokens(sources.map((block) => block.text).join(" ")).join(" ")} `;
  const hits = tokens.filter((token) => blob.includes(` ${token} `));
  return hits.length >= Math.min(2, tokens.length);
}

function evidenceInSources(evidence: StoryDeltaEvidence[] | undefined, sources: { text: string }[]): boolean {
  if (!evidence || evidence.length === 0) return false;
  return evidence.some((row) => {
    const text = row.text?.replace(/\s+/g, " ").trim() ?? "";
    return text.length >= 4 && sources.some((block) => block.text.includes(text));
  });
}

function sourcesValid(event: StoryQuestionEvent, live: Map<string, string>): boolean {
  const ids = Object.keys(event.sourceHashes);
  if (ids.length === 0) return false;
  return ids.every((id) => live.get(id) === event.sourceHashes[id]);
}

function signature(text: string): { head: string; tokens: string[] } | null {
  const tokens = contentTokens(text);
  const head = interrogative(fold(text));
  if (!head) return null;
  return { head, tokens: tokens.filter((token) => token !== head && !head.split(" ").includes(token)) };
}

function interrogative(value: string): string | null {
  if (/por\s+que/.test(value)) return "por que";
  if (/\bquien\b/.test(value)) return "quien";
  if (/\bdonde\b/.test(value)) return "donde";
  if (/\bcuando\b/.test(value)) return "cuando";
  if (/\bque\b/.test(value)) return "que";
  return null;
}

function contentTokens(text: string): string[] {
  return fold(text)
    .split(/[^a-z0-9]+/)
    .map((token) => (CAUSE.has(token) ? "causa" : token))
    .filter((token) => token.length > 2 && !STOP.has(token) && token !== "quien" && token !== "donde" && token !== "cuando");
}

function questionIdFor(text: string): string {
  const slug = fold(text).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return `q-${slug || "pregunta"}`;
}

function normalizeEvents(value: unknown): StoryQuestionEvent[] {
  if (!Array.isArray(value)) return [];
  const events: StoryQuestionEvent[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const kind = row.kind === "introduced" || row.kind === "advanced" || row.kind === "resolved" || row.kind === "reopened" ? row.kind : null;
    const id = typeof row.id === "string" ? row.id.trim().slice(0, 80) : "";
    const text = typeof row.text === "string" ? row.text.replace(/\s+/g, " ").trim().slice(0, 180) : "";
    if (!kind || !id || !text) continue;
    const source = row.source === "author" ? "author" : "text";
    const sourceBlockIds = stringList(row.sourceBlockIds, 4);
    const sourceHashes: Record<string, string> = {};
    if (row.sourceHashes && typeof row.sourceHashes === "object" && !Array.isArray(row.sourceHashes)) {
      for (const [key, hash] of Object.entries(row.sourceHashes as Record<string, unknown>)) {
        if (typeof hash === "string" && hash) sourceHashes[key.slice(0, 80)] = hash.slice(0, 80);
      }
    }
    events.push({
      id,
      kind,
      source,
      text,
      documentOrder: typeof row.documentOrder === "number" && Number.isFinite(row.documentOrder) ? row.documentOrder : 0,
      sourceBlockIds,
      sourceHashes,
      evidence: [],
      confidence: typeof row.confidence === "number" ? row.confidence : 0,
    });
    if (events.length >= 24) break;
  }
  return events;
}

function stringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim().slice(0, 80)] : [])).slice(0, limit);
}

function sameHashes(left: Record<string, string>, right: Record<string, string>): boolean {
  const keys = Object.keys(left);
  return keys.length > 0 && keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es");
}
