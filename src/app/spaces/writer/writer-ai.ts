import type { WriterProfile } from "./writer-document";
import type { PresentationDelta } from "./writer-presentation";

export const WRITER_AI_ROUTE = "/api/spaces/writer/assist";

export const WRITER_AI_BEFORE_LIMIT = 6_000;
export const WRITER_AI_AFTER_LIMIT = 800;
export const WRITER_AI_SELECTION_LIMIT = 8_000;

export const WRITER_AI_CONTEXT_NOTES = 8;
export const WRITER_AI_BRAIN_LIMIT = 700;
export const WRITER_AI_CHAPTER_LIMIT = 200;
export const WRITER_AI_LINE_LIMIT = 160;

export type WriterAiAction = "continue" | "rewrite" | "expand" | "shorten";

export type WriterAiMemoryNote = {
  kind: "canon" | "idea";
  text: string;
};

export type WriterAiContext = {
  memories: WriterAiMemoryNote[];
  brain: string;
  chapter: string;
  line: string;
};

export type WriterAiIntent = "natural" | "visual" | "brief";

export type WriterAiRequest = {
  action: WriterAiAction;
  profile: WriterProfile;
  before: string;
  after: string;
  selection: string;
  intent?: WriterAiIntent;
  context?: WriterAiContext;
};

export function emptyWriterAiContext(): WriterAiContext {
  return { memories: [], brain: "", chapter: "", line: "" };
}

const PROFILE_LABELS: Record<WriterProfile, string> = {
  document: "documento",
  article: "artículo",
  post: "post",
  screenplay: "guion",
};

export type WriterAskStoryContext = {
  entities: {
    id: string;
    label: string;
    aliases: string[];
    definition: string;
    facts: string[];
    established: string[];
    ideas: string[];
    state: string;
    events: string[];
    traceSummary: string;
    relations: string[];
  }[];
  appearances: { blockId: string; where: string; snippet: string }[];
  fresh: { blockId: string; where: string; text: string }[];
  chapterSummaries: { chapterId: string; text: string }[];
  conversationSummary: string;
  recentTurns: { question: string; answer: string }[];
  basis: string;
};

export type StoryDeltaEvidence = {
  blockId: string;
  text: string;
};

export type StoryDeltaClaim = {
  entityId: string;
  entityIds?: string[];
  text: string;
  sourceBlockIds: string[];
  evidence: StoryDeltaEvidence[];
  confidence: number;
  predicate: string;
  value: string;
};

export type StoryDeltaRelation = {
  fromEntityId: string;
  toEntityId: string;
  type: string;
  label: string;
  qualifier: string;
  stance: string;
  text: string;
  sourceBlockIds: string[];
  evidence: StoryDeltaEvidence[];
  confidence: number;
};

export type StoryDeltaThreadCandidate = {
  label: string;
  relatedEntityIds: string[];
  sourceBlockIds: string[];
  evidence: StoryDeltaEvidence[];
  confidence: number;
};

export type StoryDeltaChapterSummary = {
  chapterId: string;
  text: string;
};

export type StoryDeltaPayload = {
  events: StoryDeltaClaim[];
  stateChanges: StoryDeltaClaim[];
  facts: StoryDeltaClaim[];
  analyzedBlockIds: string[];
  chapterSummaries?: StoryDeltaChapterSummary[];
  relations?: StoryDeltaRelation[];
  threadCandidates?: StoryDeltaThreadCandidate[];
};

export type WriterAskStoryPreview = {
  title: string;
  notes: number;
  fragments: number;
  chapters: string;
};

export type StoryAskMemory = { text: string };

export type StoryAskModelAnswer = {
  answer: string;
  suggestedMemories: StoryAskMemory[];
  usedContextSummary: string;
  storyDelta?: StoryDeltaPayload;
  conversationSummary?: string;
};

export type WriterAskStoryParsed = {
  action: "ask_story";
  profile: WriterProfile;
  selection: string;
  question: string;
  previous: { question: string; answer: string } | null;
  preview: WriterAskStoryPreview;
  storyContext: WriterAskStoryContext;
};

export type WriterUpdateStoryBatch = {
  dirty: { blockId: string; where: string; text: string }[];
  context: { blockId: string; where: string; text: string }[];
  entities: {
    id: string;
    label: string;
    definition: string;
    state: string;
    events: string[];
    facts: string[];
  }[];
};

export type WriterUpdateStoryPreview = {
  blocks: number;
  characters: number;
  chapterCount: number;
  calls: number;
  plannedInputChars: number;
};

export type WriterUpdateStoryParsed = {
  action: "update_story";
  profile: WriterProfile;
  selection: string;
  batch: WriterUpdateStoryBatch;
  preview: WriterUpdateStoryPreview;
};

export type StoryUpdateModelAnswer = {
  storyDelta: StoryDeltaPayload;
  presentationDelta?: PresentationDelta;
};

export function writerAiMaxTokens(action: WriterAiAction | "ask_story" | "update_story", selectionLength: number): number {
  if (action === "update_story") return 1900;
  if (action === "ask_story") return 1100;
  if (action === "continue") return 700;
  if (action === "shorten") return Math.min(500, Math.max(80, Math.ceil(selectionLength / 3)));
  return Math.min(1200, Math.max(256, Math.ceil(selectionLength / 2) + 200));
}

export function parseWriterAiRequest(body: unknown): WriterAiRequest | WriterAskStoryParsed | WriterUpdateStoryParsed | { error: string; status: number } {
  const row = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const profile =
    row.profile === "document" || row.profile === "article" || row.profile === "post" || row.profile === "screenplay"
      ? row.profile
      : null;
  if (row.action === "ask_story") return parseAskStoryRequest(row, profile);
  if (row.action === "update_story") return parseUpdateStoryRequest(row, profile);
  const action =
    row.action === "continue" || row.action === "rewrite" || row.action === "expand" || row.action === "shorten"
      ? row.action
      : null;
  const before = typeof row.before === "string" ? row.before : "";
  const after = typeof row.after === "string" ? row.after : "";
  const selection = typeof row.selection === "string" ? row.selection : "";
  if (!action || !profile) return { error: "La petición no es válida.", status: 400 };
  if (before.length > WRITER_AI_BEFORE_LIMIT || after.length > WRITER_AI_AFTER_LIMIT) {
    return { error: "El contexto es demasiado largo.", status: 413 };
  }
  if (action !== "continue" && !selection.trim()) return { error: "Falta el fragmento que hay que reescribir.", status: 400 };
  if (selection.length > WRITER_AI_SELECTION_LIMIT) return { error: "Selecciona un fragmento más corto.", status: 413 };
  const intent = row.intent === "natural" || row.intent === "visual" || row.intent === "brief" ? row.intent : undefined;
  return { action, profile, before, after, selection, ...(intent ? { intent } : {}), context: parseWriterAiContext(row.context) };
}

function parseWriterAiContext(value: unknown): WriterAiContext {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const memories: WriterAiMemoryNote[] = [];
  if (Array.isArray(row.memories)) {
    for (const item of row.memories) {
      if (!item || typeof item !== "object") continue;
      const note = item as Record<string, unknown>;
      const kind = note.kind === "canon" || note.kind === "idea" ? note.kind : null;
      const text = typeof note.text === "string" ? note.text.replace(/\s+/g, " ").trim().slice(0, 400) : "";
      if (!kind || !text) continue;
      memories.push({ kind, text });
      if (memories.length >= WRITER_AI_CONTEXT_NOTES) break;
    }
  }
  const clip = (field: unknown, limit: number) => (typeof field === "string" ? field.trim().slice(0, limit) : "");
  return {
    memories,
    brain: clip(row.brain, WRITER_AI_BRAIN_LIMIT),
    chapter: clip(row.chapter, WRITER_AI_CHAPTER_LIMIT),
    line: clip(row.line, WRITER_AI_LINE_LIMIT),
  };
}

export function writerAiMessages(input: WriterAiRequest | WriterAskStoryParsed | WriterUpdateStoryParsed): { system: string; user: string } {
  if (input.action === "ask_story") return askStoryMessages(input);
  if (input.action === "update_story") return updateStoryMessages(input);
  const context = input.context ?? emptyWriterAiContext();
  const system = [
    "Eres el editor dentro de Writer. Devuelve solo el texto propuesto, sin comillas, sin Markdown y sin explicar lo que hiciste.",
    input.action === "continue"
      ? "Continúa el texto. No repitas el contexto. Mantén el idioma, el tono y el perfil."
      : input.action === "expand"
        ? "Amplía solo el fragmento seleccionado. Mantén el sentido y no añadas una escena nueva."
        : input.action === "shorten"
          ? "Acorta solo el fragmento seleccionado. Conserva lo imprescindible."
          : input.intent === "natural"
            ? "Reescribe el fragmento para que suene más hablado y natural. Mantén el sentido y quién habla."
            : input.intent === "visual"
              ? "Reescribe el fragmento para que sea más visual y concreto. No expliques lo que ocurre."
              : "Reescribe solo el fragmento seleccionado. Mantén el idioma y el sentido.",
    input.profile === "screenplay"
      ? "El perfil es guion. Sigue en el mismo elemento, sin cambiar de bloque y sin añadir espacios para centrar."
      : "",
    context.memories.some((note) => note.kind === "canon")
      ? "Lo establecido es un hecho del documento: respétalo y no lo contradigas. No copies las notas tal cual."
      : "",
    context.memories.some((note) => note.kind === "idea")
      ? "Las posibilidades no son hechos."
      : "",
    context.brain ? "La marca es contexto global del proyecto, no un hecho de la historia." : "",
  ]
    .filter((line) => line.length > 0)
    .join(" ");
  const canon = context.memories.filter((note) => note.kind === "canon").map((note) => note.text);
  const ideas = context.memories.filter((note) => note.kind === "idea").map((note) => note.text);
  const user = [
    `Perfil: ${PROFILE_LABELS[input.profile]}`,
    context.chapter ? `Capítulo: ${context.chapter}` : "",
    context.brain ? `Marca:\n${context.brain}` : "",
    canon.length ? `Establecido:\n${canon.join("\n")}` : "",
    ideas.length ? `Posibilidad:\n${ideas.join("\n")}` : "",
    input.before ? `Antes:\n${input.before}` : "",
    input.action !== "continue" ? `Fragmento:\n${input.selection}` : "",
    input.after ? `Después:\n${input.after}` : "",
  ]
    .filter((line) => line.length > 0)
    .join("\n\n");
  return { system, user };
}

const ASK_QUESTION_LIMIT = 2_000;

function parseAskStoryRequest(row: Record<string, unknown>, profile: WriterProfile | null): WriterAskStoryParsed | { error: string; status: number } {
  if (!profile) return { error: "La petición no es válida.", status: 400 };
  const question = typeof row.question === "string" ? row.question.replace(/\s+/g, " ").trim() : "";
  if (!question) return { error: "Falta la pregunta.", status: 400 };
  if (question.length > ASK_QUESTION_LIMIT) return { error: "La pregunta es demasiado larga.", status: 413 };
  return {
    action: "ask_story",
    profile,
    selection: question,
    question,
    previous: parseAskTurn(row.previous),
    preview: parseAskPreview(row.preview),
    storyContext: parseAskStoryContext(row.storyContext),
  };
}

function parseAskTurn(value: unknown): { question: string; answer: string } | null {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  const question = clipText(row?.question, 500);
  const answer = clipText(row?.answer, 500);
  if (!question || !answer) return null;
  return { question, answer };
}

function parseAskPreview(value: unknown): WriterAskStoryPreview {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    title: clipText(row.title, 120) || "Historia",
    notes: countValue(row.notes),
    fragments: countValue(row.fragments),
    chapters: clipText(row.chapters, 80),
  };
}

function parseAskStoryContext(value: unknown): WriterAskStoryContext {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const entities: WriterAskStoryContext["entities"] = [];
  if (Array.isArray(row.entities)) {
    for (const item of row.entities) {
      if (!item || typeof item !== "object") continue;
      const entity = item as Record<string, unknown>;
      const label = clipText(entity.label, 80);
      if (!label) continue;
      entities.push({
        id: clipText(entity.id, 80),
        label,
        aliases: stringList(entity.aliases, 8, 80),
        definition: clipText(entity.definition, 1_200),
        facts: stringList(entity.facts, 8, 160),
        established: stringList(entity.established, 8, 900),
        ideas: stringList(entity.ideas, 8, 900),
        state: clipText(entity.state, 280),
        events: stringList(entity.events, 4, 180),
        traceSummary: clipText(entity.traceSummary, 280),
        relations: stringList(entity.relations, 8, 120),
      });
      if (entities.length >= 4) break;
    }
  }
  const recentTurns: WriterAskStoryContext["recentTurns"] = [];
  if (Array.isArray(row.recentTurns)) {
    for (const item of row.recentTurns) {
      const turn = parseAskTurn(item);
      if (!turn) continue;
      recentTurns.push(turn);
      if (recentTurns.length >= 2) break;
    }
  }
  const chapterSummaries: WriterAskStoryContext["chapterSummaries"] = [];
  if (Array.isArray(row.chapterSummaries)) {
    for (const item of row.chapterSummaries) {
      if (!item || typeof item !== "object") continue;
      const chapter = item as Record<string, unknown>;
      const chapterId = clipText(chapter.chapterId, 80);
      const text = clipText(chapter.text, 280);
      if (!chapterId || !text) continue;
      chapterSummaries.push({ chapterId, text });
      if (chapterSummaries.length >= 4) break;
    }
  }
  return {
    entities,
    appearances: placeList(row.appearances, 6),
    fresh: freshList(row.fresh, 4),
    chapterSummaries,
    conversationSummary: clipText(row.conversationSummary, 700),
    recentTurns,
    basis: clipText(row.basis, 160),
  };
}

function stringList(value: unknown, limit: number, chars: number): string[] {
  if (!Array.isArray(value)) return [];
  const lines: string[] = [];
  for (const item of value) {
    const text = clipText(item, chars);
    if (!text) continue;
    lines.push(text);
    if (lines.length >= limit) break;
  }
  return lines;
}

function placeList(value: unknown, limit: number): { blockId: string; where: string; snippet: string }[] {
  if (!Array.isArray(value)) return [];
  const places: { blockId: string; where: string; snippet: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const snippet = clipText(row.snippet, 180);
    const blockId = clipText(row.blockId, 80);
    if (!snippet || !blockId) continue;
    places.push({ blockId, where: clipText(row.where, 120), snippet });
    if (places.length >= limit) break;
  }
  return places;
}

function freshList(value: unknown, limit: number): { blockId: string; where: string; text: string }[] {
  if (!Array.isArray(value)) return [];
  const blocks: { blockId: string; where: string; text: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const text = clipText(row.text, 700);
    const blockId = clipText(row.blockId, 80);
    if (!text || !blockId) continue;
    blocks.push({ blockId, where: clipText(row.where, 120), text });
    if (blocks.length >= limit) break;
  }
  return blocks;
}

function countValue(value: unknown): number {
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.min(99, Math.round(count));
}

function clipText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function isEntityProfileAskQuestion(question: string): boolean {
  const q = question.replace(/\s+/g, " ").trim();
  return (
    /^perfil\s+(?:de\s+)?.+$/iu.test(q) ||
    /^ficha\s+(?:de\s+)?.+$/iu.test(q) ||
    /^(?:como|cómo)\s+es\s+.+$/iu.test(q) ||
    /^(?:describe|descripci[oó]n\s+de)\s+.+$/iu.test(q) ||
    /^(?:hablame|h[aá]blame)\s+(?:de|sobre)\s+.+$/iu.test(q)
  );
}

function askStoryMessages(input: WriterAskStoryParsed): { system: string; user: string } {
  const profileAsk = isEntityProfileAskQuestion(input.question);
  const system = [
    "Eres Story, el asistente narrativo de una obra concreta dentro de Writer. Respondes en español, en prosa breve, sin Markdown.",
    profileAsk
      ? "Si piden perfil, ficha o cómo es un personaje o elemento, redacta un perfil narrativo trabajado: quién es, rasgos visibles o de carácter que el contexto permita, situación actual, arco o recorrido, relaciones con otros si constan, y qué huele a texto (apariciones). Integra definición, notas, estado, recorrido, hechos y citas del documento; no te limites a listar campos. Marca huecos («no consta en Story ni en el texto»). Las ideas son posibilidades, no hechos."
      : "",
    "Usa prioritariamente el contexto que te doy. La definición, las notas establecidas, el estado, el recorrido y los hechos son lo que Story ya tiene. Las ideas no son hechos. Los fragmentos recientes son el texto del documento.",
    "Si hay un resumen de conversación o turnos recientes, úsalos solo para entender referencias como «eso», «él» o el hilo. No los trates como canon. Si contradicen Story o el documento, manda Story y el documento.",
    "Puedes proponer posibilidades creativas. Márcalas como posibilidad, por ejemplo «Una posible motivación sería…». No presentes una inferencia como si fuera canon.",
    "Si la pregunta asume algo que no está en la definición, las notas, los hechos ni el texto, dilo y no lo des por ocurrido. No inventes antecedentes.",
    "storyDelta no sale de answer. storyDelta es opcional. En preguntas de perfil, listado o conversación, devuelve events, stateChanges, facts, relations y threadCandidates vacíos. Solo rellena storyDelta si un fragmento reciente [blockId] afirma un hecho nuevo y puedes citarlo.",
    "relations son vínculos explícitos entre fichas, con fromEntityId, toEntityId, type, evidence literal y confidence. knows_about exige stance known o not_known_explicit según el texto. No infieras que alguien no sabe algo. Un threadCandidate es una propuesta de elemento de Historia, no una ficha y no una relación.",
    "Un event es algo que ocurre y tiene consecuencia. No registres gestos menores. Si un bloque no cambia la historia, inclúyelo solo en analyzedBlockIds.",
    "stateChanges son objetivos: physical, location, possession, knowledge, relationship, life o ability. No registres motivaciones ni estados de ánimo.",
    "facts son frases explícitas del bloque. No reescribas la definición del autor.",
    "Cada event, stateChange y fact necesita entityId, sourceBlockIds, evidence y confidence. evidence.text es una cita literal corta del bloque.",
    "conversationSummary es un resumen compacto del hilo actual para el próximo turno. No es un hecho de Story. Si no aporta, cadena vacía.",
    "Devuelve solo JSON válido, sin texto antes ni después: {\"answer\":\"...\",\"suggestedMemories\":[{\"text\":\"...\"}],\"usedContextSummary\":\"...\",\"conversationSummary\":\"...\",\"storyDelta\":{\"events\":[],\"stateChanges\":[],\"facts\":[],\"relations\":[],\"threadCandidates\":[],\"analyzedBlockIds\":[]}}.",
    "answer debe ser concreto sobre ESTA obra y el contexto enviado. Si hay fichas, fragmentos o notas, cítalos con nombres y hechos reales. Nunca respondas con definiciones genéricas de qué es un guion, una novela o un personaje.",
    "Si el contexto está vacío o no alcanza, dilo en answer y pide una pista concreta. No inventes personajes ni tramas.",
    "suggestedMemories es como máximo una idea tentativa, o lista vacía. Esa idea no es un event ni un state.",
  ].join(" ");
  const story = input.storyContext.entities
    .map((entity) => {
      const lines = [`Ficha ${entity.label}`, entity.id ? `id: ${entity.id}` : ""].filter((line) => line.length > 0);
      if (entity.aliases.length) lines.push(`Alias: ${entity.aliases.join(", ")}`);
      if (entity.definition) lines.push(`Definición: ${entity.definition}`);
      if (entity.facts.length) lines.push(`Hechos: ${entity.facts.join("; ")}`);
      if (entity.state) lines.push(`Ahora: ${entity.state}`);
      if (entity.traceSummary) lines.push(`Recorrido: ${entity.traceSummary}`);
      else if (entity.events.length) lines.push(`Recorrido: ${entity.events.join(" / ")}`);
      if (entity.established.length) lines.push(`Notas: ${entity.established.join(" / ")}`);
      if (entity.ideas.length) lines.push(`Ideas: ${entity.ideas.join(" / ")}`);
      if (entity.relations.length) lines.push(`Relacionados: ${entity.relations.join(" / ")}`);
      return lines.join("\n");
    })
    .join("\n\n");
  const chapters = input.storyContext.chapterSummaries
    .map((item) => `${item.chapterId}: ${item.text}`)
    .join("\n");
  const appearances = input.storyContext.appearances
    .map((item) => `[${item.blockId}] ${item.where ? `${item.where}: ` : ""}«${item.snippet}»`)
    .join("\n");
  const fresh = input.storyContext.fresh.map((item) => `[${item.blockId}] ${item.where ? `${item.where}\n` : ""}${item.text}`).join("\n\n");
  const turns = input.storyContext.recentTurns
    .map((turn) => `P: ${turn.question}\nR: ${turn.answer}`)
    .join("\n");
  const user = [
    story,
    chapters ? `Resúmenes de capítulo válidos:\n${chapters}` : "",
    appearances ? `Apariciones:\n${appearances}` : "",
    fresh ? `Texto reciente:\n${fresh}` : "",
    input.storyContext.conversationSummary ? `Resumen de la conversación:\n${input.storyContext.conversationSummary}` : "",
    turns ? `Turnos recientes:\n${turns}` : "",
    input.previous && !turns ? `Pregunta anterior: ${input.previous.question}\nRespuesta anterior: ${input.previous.answer}` : "",
    `Pregunta: ${input.question}`,
  ]
    .filter((line) => line.length > 0)
    .join("\n\n");
  return { system, user };
}

function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return raw.slice(start, end + 1);
}

function repairJsonText(raw: string): string {
  return raw
    .replace(/^\uFEFF/u, "")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/\r\n/g, "\n");
}

function recoverAskAnswerField(raw: string): string | null {
  const match = raw.match(/"answer"\s*:\s*"((?:\\.|[^"\\])*)"/s);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(`"${match[1]}"`).replace(/\s+/g, " ").trim();
  } catch {
    return match[1].replace(/\\"/g, '"').replace(/\s+/g, " ").trim();
  }
}

function storyAskAnswerFromRow(row: Record<string, unknown>): StoryAskModelAnswer | null {
  const answerRaw =
    typeof row.answer === "string"
      ? row.answer
      : typeof row.respuesta === "string"
        ? row.respuesta
        : "";
  const answer = answerRaw.replace(/\s+/g, " ").trim();
  if (!answer) return null;
  const suggestedMemories: StoryAskMemory[] = [];
  if (Array.isArray(row.suggestedMemories)) {
    for (const item of row.suggestedMemories) {
      if (!item || typeof item !== "object") continue;
      const text = typeof (item as { text?: unknown }).text === "string" ? (item as { text: string }).text.replace(/\s+/g, " ").trim() : "";
      if (!text) continue;
      suggestedMemories.push({ text: text.slice(0, 900) });
      if (suggestedMemories.length >= 1) break;
    }
  }
  const usedContextSummary = typeof row.usedContextSummary === "string" ? row.usedContextSummary.replace(/\s+/g, " ").trim().slice(0, 160) : "";
  const conversationSummary =
    typeof row.conversationSummary === "string" ? row.conversationSummary.replace(/\s+/g, " ").trim().slice(0, 700) : "";
  const storyDelta = parseStoryDeltaPayload(row.storyDelta);
  const hasDelta =
    storyDelta &&
    (storyDelta.events.length > 0 ||
      storyDelta.stateChanges.length > 0 ||
      storyDelta.facts.length > 0 ||
      storyDelta.analyzedBlockIds.length > 0 ||
      (storyDelta.chapterSummaries?.length ?? 0) > 0 ||
      (storyDelta.relations?.length ?? 0) > 0 ||
      (storyDelta.threadCandidates?.length ?? 0) > 0);
  const base = { answer, suggestedMemories, usedContextSummary, ...(conversationSummary ? { conversationSummary } : {}) };
  return hasDelta && storyDelta ? { ...base, storyDelta } : base;
}

export function parseStoryAskModelAnswer(raw: string): StoryAskModelAnswer | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const fenced = trimmed.replace(/^```(?:json)?/i, "").replace(/```$/u, "").trim();
  const candidates = [
    trimmed,
    fenced,
    repairJsonText(trimmed),
    repairJsonText(fenced),
    extractJsonObject(trimmed),
    extractJsonObject(fenced),
  ].filter((item): item is string => Boolean(item));
  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const row = storyAskAnswerFromRow(parsed as Record<string, unknown>);
    if (row) return row;
  }
  const recovered = recoverAskAnswerField(trimmed) ?? recoverAskAnswerField(fenced);
  if (recovered) {
    return { answer: recovered.slice(0, 9000), suggestedMemories: [], usedContextSummary: "" };
  }
  const plain = fenced;
  if (!plain.includes("{") && plain.length >= 12) {
    return { answer: plain.slice(0, 9000), suggestedMemories: [], usedContextSummary: "" };
  }
  return null;
}

function parseStoryDeltaPayload(value: unknown): StoryDeltaPayload | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return {
    events: parseDeltaClaims(row.events),
    stateChanges: parseDeltaClaims(row.stateChanges),
    facts: parseDeltaClaims(row.facts),
    analyzedBlockIds: Array.isArray(row.analyzedBlockIds)
      ? row.analyzedBlockIds.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim().slice(0, 80)] : [])).slice(0, 24)
      : [],
    chapterSummaries: parseChapterSummaries(row.chapterSummaries),
    relations: parseDeltaRelations(row.relations),
    threadCandidates: parseThreadCandidates(row.threadCandidates),
  };
}

function parseDeltaClaims(value: unknown): StoryDeltaClaim[] {
  if (!Array.isArray(value)) return [];
  const claims: StoryDeltaClaim[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const text = typeof row.text === "string" ? row.text.replace(/\s+/g, " ").trim().slice(0, 180) : "";
    const entityId = typeof row.entityId === "string" ? row.entityId.trim().slice(0, 80) : "";
    const sourceBlockIds = Array.isArray(row.sourceBlockIds)
      ? row.sourceBlockIds.flatMap((id) => (typeof id === "string" && id.trim() ? [id.trim().slice(0, 80)] : [])).slice(0, 4)
      : [];
    const confidence = typeof row.confidence === "number" && Number.isFinite(row.confidence) ? row.confidence : 0;
    if (!text || !entityId || sourceBlockIds.length === 0) continue;
    const entityIds = Array.isArray(row.entityIds)
      ? row.entityIds.flatMap((id) => (typeof id === "string" && id.trim() ? [id.trim().slice(0, 80)] : [])).slice(0, 6)
      : [];
    claims.push({
      entityId,
      ...(entityIds.length > 0 ? { entityIds } : {}),
      text,
      sourceBlockIds,
      evidence: parseEvidence(row.evidence, sourceBlockIds),
      confidence,
      predicate: typeof row.predicate === "string" ? row.predicate.trim().slice(0, 60) : "",
      value: typeof row.value === "string" ? row.value.trim().slice(0, 40) : typeof row.value === "boolean" ? String(row.value) : "",
    });
    if (claims.length >= 24) break;
  }
  return claims;
}

function parseEvidence(value: unknown, sourceBlockIds: string[]): StoryDeltaEvidence[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(sourceBlockIds);
  const evidence: StoryDeltaEvidence[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const blockId = typeof row.blockId === "string" ? row.blockId.trim().slice(0, 80) : "";
    const text = typeof row.text === "string" ? row.text.replace(/\s+/g, " ").trim().slice(0, 180) : "";
    if (!blockId || !text || !allowed.has(blockId)) continue;
    evidence.push({ blockId, text });
    if (evidence.length >= 4) break;
  }
  return evidence;
}

function parseDeltaRelations(value: unknown): StoryDeltaRelation[] {
  if (!Array.isArray(value)) return [];
  const rows: StoryDeltaRelation[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const fromEntityId = typeof row.fromEntityId === "string" ? row.fromEntityId.trim().slice(0, 80) : "";
    const toEntityId = typeof row.toEntityId === "string" ? row.toEntityId.trim().slice(0, 80) : "";
    const type = typeof row.type === "string" ? row.type.trim().slice(0, 40) : "";
    const sourceBlockIds = Array.isArray(row.sourceBlockIds)
      ? row.sourceBlockIds.flatMap((id) => (typeof id === "string" && id.trim() ? [id.trim().slice(0, 80)] : [])).slice(0, 4)
      : [];
    const confidence = typeof row.confidence === "number" && Number.isFinite(row.confidence) ? row.confidence : 0;
    const text = typeof row.text === "string" ? row.text.replace(/\s+/g, " ").trim().slice(0, 180) : "";
    if (!fromEntityId || !toEntityId || !type || sourceBlockIds.length === 0) continue;
    rows.push({
      fromEntityId,
      toEntityId,
      type,
      label: typeof row.label === "string" ? row.label.replace(/\s+/g, " ").trim().slice(0, 80) : "",
      qualifier: typeof row.qualifier === "string" ? row.qualifier.trim().slice(0, 40) : "",
      stance: typeof row.stance === "string" ? row.stance.trim().slice(0, 40) : "",
      text,
      sourceBlockIds,
      evidence: parseEvidence(row.evidence, sourceBlockIds),
      confidence,
    });
    if (rows.length >= 12) break;
  }
  return rows;
}

function parseThreadCandidates(value: unknown): StoryDeltaThreadCandidate[] {
  if (!Array.isArray(value)) return [];
  const rows: StoryDeltaThreadCandidate[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    const sourceBlockIds = Array.isArray(row.sourceBlockIds)
      ? row.sourceBlockIds.flatMap((id) => (typeof id === "string" && id.trim() ? [id.trim().slice(0, 80)] : [])).slice(0, 6)
      : [];
    const confidence = typeof row.confidence === "number" && Number.isFinite(row.confidence) ? row.confidence : 0;
    if (!label || sourceBlockIds.length === 0) continue;
    const relatedEntityIds = Array.isArray(row.relatedEntityIds)
      ? row.relatedEntityIds.flatMap((id) => (typeof id === "string" && id.trim() ? [id.trim().slice(0, 80)] : [])).slice(0, 6)
      : [];
    rows.push({
      label,
      relatedEntityIds,
      sourceBlockIds,
      evidence: parseEvidence(row.evidence, sourceBlockIds),
      confidence,
    });
    if (rows.length >= 5) break;
  }
  return rows;
}

function parseChapterSummaries(value: unknown): StoryDeltaChapterSummary[] {
  if (!Array.isArray(value)) return [];
  const summaries: StoryDeltaChapterSummary[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const chapterId = typeof row.chapterId === "string" ? row.chapterId.trim().slice(0, 80) : "";
    const text = typeof row.text === "string" ? row.text.replace(/\s+/g, " ").trim().slice(0, 280) : "";
    if (!chapterId || !text) continue;
    summaries.push({ chapterId, text });
    if (summaries.length >= 4) break;
  }
  return summaries;
}

const UPDATE_DIRTY_LIMIT = 18;
const UPDATE_TEXT_LIMIT = 900;

function parseUpdateStoryRequest(row: Record<string, unknown>, profile: WriterProfile | null): WriterUpdateStoryParsed | { error: string; status: number } {
  if (!profile) return { error: "La petición no es válida.", status: 400 };
  const batch = parseUpdateBatch(row.batch);
  if (batch.dirty.length === 0) return { error: "No hay cambios pendientes.", status: 400 };
  return {
    action: "update_story",
    profile,
    selection: "",
    batch,
    preview: parseUpdatePreview(row.preview),
  };
}

function parseUpdatePreview(value: unknown): WriterUpdateStoryPreview {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const count = (field: unknown, max: number) => {
    const number = typeof field === "number" ? field : Number(field);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return Math.min(max, Math.round(number));
  };
  return {
    blocks: count(row.blocks, 500),
    characters: count(row.characters, 80),
    chapterCount: count(row.chapterCount, 80),
    calls: Math.min(12, Math.max(1, count(row.calls, 12) || 1)),
    plannedInputChars: count(row.plannedInputChars, 200_000),
  };
}

function parseUpdateBatch(value: unknown): WriterUpdateStoryBatch {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const entities: WriterUpdateStoryBatch["entities"] = [];
  if (Array.isArray(row.entities)) {
    for (const item of row.entities) {
      if (!item || typeof item !== "object") continue;
      const entity = item as Record<string, unknown>;
      const id = clipText(entity.id, 80);
      const label = clipText(entity.label, 80);
      if (!id || !label) continue;
      entities.push({
        id,
        label,
        definition: clipText(entity.definition, 400),
        state: clipText(entity.state, 240),
        events: stringList(entity.events, 3, 180),
        facts: stringList(entity.facts, 3, 180),
      });
      if (entities.length >= 6) break;
    }
  }
  return {
    dirty: parseUpdateBlocks(row.dirty, UPDATE_DIRTY_LIMIT, UPDATE_TEXT_LIMIT),
    context: parseUpdateBlocks(row.context, 3, 400),
    entities,
  };
}

function parseUpdateBlocks(value: unknown, limit: number, chars: number): { blockId: string; where: string; text: string }[] {
  if (!Array.isArray(value)) return [];
  const blocks: { blockId: string; where: string; text: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const blockId = clipText(row.blockId, 80);
    const text = clipText(row.text, chars);
    if (!blockId || !text) continue;
    blocks.push({ blockId, where: clipText(row.where, 120), text });
    if (blocks.length >= limit) break;
  }
  return blocks;
}

function updateStoryMessages(input: WriterUpdateStoryParsed): { system: string; user: string } {
  const system = [
    "Eres el extractor de Story dentro de Writer. No escribes una respuesta creativa. Devuelves solo JSON.",
    "storyDelta sale únicamente de los bloques marcados como pendientes, citados por su id. No sale del contexto ya conocido, ni de hipótesis, motivaciones, consejos ni análisis psicológico.",
    "Un event es algo que ocurre y tiene consecuencia: una decisión, una revelación, una lesión, un cambio de relación, un desplazamiento relevante, un descubrimiento, una pérdida o un logro. No registres gestos: sentarse, mirar, respirar, caminar, sonreír o abrir una puerta. Si un bloque no cambia la historia, no inventes un event: inclúyelo solo en analyzedBlockIds.",
    "stateChanges describen lo que sigue siendo cierto, en términos objetivos: physical, location, possession, knowledge, relationship, life o ability. No registres motivaciones, deseos ni estados de ánimo.",
    "facts son frases explícitas del bloque. No reescribas la definición del autor.",
    "Cada elemento necesita entityId, sourceBlockIds de un bloque pendiente, evidence y confidence. evidence.text es una cita literal y corta de ese bloque. Si no puedes citarlo, omite el elemento.",
    "Si un acontecimiento afecta a varias fichas, pon sus ids en entityIds del mismo event. No copies el mismo hecho como eventos distintos.",
    "relations describen un vínculo explícito del bloque pendiente: fromEntityId, toEntityId, type (related, family, romantic, friend, enemy, knows, involved, owns, located_at, knows_about), evidence y confidence. family puede llevar qualifier sibling, parent o child. knows_about exige stance known o not_known_explicit, y solo si el texto lo dice. No infieras desconocimiento. No conviertas una simple coincidencia en involved.",
    "threadCandidates proponen un asunto de Historia que todavía no es ficha. Incluye label, relatedEntityIds, sourceBlockIds, evidence y confidence. No crees la ficha. No propongas temas como amor, culpa o identidad, ni objetos triviales.",
    "Los bloques de contexto solo ayudan a entender. No son fuente de events, state, facts, relations ni candidates, y no van en analyzedBlockIds.",
    "chapterSummaries es opcional y solo si este lote deja un capítulo completo. Una frase apoyada en esos bloques. Si no, devuelve una lista vacía. No pidas otra llamada para resumir.",
    "presentationDelta es opcional y no es conocimiento. No lo conviertas en events, facts, state ni relations. Resume solo lo que dicen los bloques pendientes y las fichas enviadas. Si no puedes hacerlo sin interpretar, omite esa parte.",
    "storyBrief son como mucho tres frases: la situación, los personajes principales, un cambio de lugar si el texto lo tiene, y el último acontecimiento relevante. No inventes emociones, motivaciones, relaciones ni consecuencias que el texto no diga. Mal: «Juan se siente atrapado». Bien: «Ana y Juan conversan en una sala de curas, donde Ana menciona un accidente a los 22 años. Después, Juan salta por la ventana y la acción sigue en otra localización».",
    "entityBriefs: una o dos frases por ficha de este lote. Di qué ha hecho, qué le ha ocurrido, qué ha revelado y con quién interactúa si el texto lo muestra. Sin psicología, sin motivaciones inventadas, sin tono literario ni juicios. Mal: «Juan teme no encontrar su lugar». Bien: «Juan se encuentra con un policía y expresa su frustración sobre los problemas que ve en el futuro».",
    "sceneBriefs es opcional: una sola línea por escena cuyos bloques estén en pendiente. sceneId es el id del encabezado si está en el lote, o el id de un bloque pendiente de esa escena. No hagas una llamada por escena.",
    "sourceBlockIds solo pueden ser bloques pendientes.",
    "Devuelve solo JSON: {\"storyDelta\":{\"events\":[],\"stateChanges\":[],\"facts\":[],\"relations\":[],\"threadCandidates\":[],\"analyzedBlockIds\":[],\"chapterSummaries\":[{\"chapterId\":\"...\",\"text\":\"...\"}]},\"presentationDelta\":{\"storyBrief\":{\"text\":\"...\",\"sourceBlockIds\":[]},\"entityBriefs\":[{\"entityId\":\"...\",\"text\":\"...\",\"sourceBlockIds\":[]}],\"sceneBriefs\":[{\"sceneId\":\"...\",\"text\":\"...\",\"sourceBlockIds\":[]}]}}.",
  ].join(" ");
  const known = input.batch.entities
    .map((entity) => {
      const lines = [`Ficha ${entity.label}`, `id: ${entity.id}`];
      if (entity.definition) lines.push(`Definición: ${entity.definition}`);
      if (entity.state) lines.push(`Ahora: ${entity.state}`);
      if (entity.events.length) lines.push(`Recorrido: ${entity.events.join(" / ")}`);
      if (entity.facts.length) lines.push(`Hechos: ${entity.facts.join(" / ")}`);
      return lines.join("\n");
    })
    .join("\n\n");
  const dirty = input.batch.dirty.map((block) => `[${block.blockId}] ${block.where ? `${block.where}\n` : ""}${block.text}`).join("\n\n");
  const context = input.batch.context.map((block) => `[${block.blockId}] ${block.where ? `${block.where}\n` : ""}${block.text}`).join("\n\n");
  const user = [
    known,
    context ? `Contexto ya comprendido, no extraer:\n${context}` : "",
    `Pendiente:\n${dirty}`,
  ]
    .filter((line) => line.length > 0)
    .join("\n\n");
  return { system, user };
}

function parsePresentationDelta(value: unknown): PresentationDelta | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const storyBrief = parseBrief(row.storyBrief);
  const entityBriefs: NonNullable<PresentationDelta["entityBriefs"]> = [];
  if (Array.isArray(row.entityBriefs)) {
    for (const item of row.entityBriefs) {
      if (!item || typeof item !== "object") continue;
      const brief = item as Record<string, unknown>;
      const entityId = typeof brief.entityId === "string" ? brief.entityId.trim().slice(0, 80) : "";
      const parsed = parseBrief(brief);
      if (!entityId || !parsed) continue;
      entityBriefs.push({ entityId, text: parsed.text, sourceBlockIds: parsed.sourceBlockIds });
      if (entityBriefs.length >= 8) break;
    }
  }
  const sceneBriefs: NonNullable<PresentationDelta["sceneBriefs"]> = [];
  if (Array.isArray(row.sceneBriefs)) {
    for (const item of row.sceneBriefs) {
      if (!item || typeof item !== "object") continue;
      const brief = item as Record<string, unknown>;
      const sceneId = typeof brief.sceneId === "string" ? brief.sceneId.trim().slice(0, 80) : "";
      const parsed = parseBrief(brief, 180);
      if (!sceneId || !parsed) continue;
      sceneBriefs.push({ sceneId, text: parsed.text, sourceBlockIds: parsed.sourceBlockIds });
      if (sceneBriefs.length >= 8) break;
    }
  }
  if (!storyBrief && entityBriefs.length === 0 && sceneBriefs.length === 0) return undefined;
  return {
    ...(storyBrief ? { storyBrief } : {}),
    ...(entityBriefs.length > 0 ? { entityBriefs } : {}),
    ...(sceneBriefs.length > 0 ? { sceneBriefs } : {}),
  };
}

function parseBrief(value: unknown, limit = 420): { text: string; sourceBlockIds: string[] } | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const text = typeof row.text === "string" ? row.text.replace(/\s+/g, " ").trim().slice(0, limit) : "";
  const sourceBlockIds = Array.isArray(row.sourceBlockIds)
    ? row.sourceBlockIds.flatMap((id) => (typeof id === "string" && id.trim() ? [id.trim().slice(0, 80)] : [])).slice(0, 12)
    : [];
  if (!text || sourceBlockIds.length === 0) return null;
  return { text, sourceBlockIds };
}

export function parseStoryUpdateModelAnswer(raw: string): StoryUpdateModelAnswer | null {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/u, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const storyDelta = parseStoryDeltaPayload((parsed as Record<string, unknown>).storyDelta);
  if (!storyDelta) return null;
  const presentationDelta = parsePresentationDelta((parsed as Record<string, unknown>).presentationDelta);
  return presentationDelta ? { storyDelta, presentationDelta } : { storyDelta };
}

export function cleanWriterAiProposal(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n").replace(/^\n+/, "").replace(/\s+$/u, "");
  const wrapped =
    (text.startsWith('"') && text.endsWith('"') && text.length > 1) ||
    (text.startsWith("«") && text.endsWith("»") && text.length > 1);
  if (wrapped) text = text.slice(1, -1).replace(/\s+$/u, "");
  return text;
}
