import type { WriterProfile } from "./writer-document";
import type { PaginationKind, WriterViewMode } from "./writer-pagination";
import type { StoryStructureKind } from "./writer-structure";
import type { StoryEntity } from "./writer-story";

/**
 * Superficie según el tipo de documento.
 * No decide qué datos existen y no borra fichas, notas ni relaciones.
 */

export type WriterContextProfile = WriterProfile | "book";

export type WriterContextCreate = {
  group: StoryEntity["group"];
  menu: string;
  empty: string;
  nameLabel: string;
};

export type WriterContextAdapter = {
  id: WriterContextProfile;
  workspaceLabel: string;
  structureKinds: StoryStructureKind[];
  structureLabels: Record<StoryStructureKind, string>;
  primaryEntityLabel: string;
  primaryEntityPluralLabel: string;
  storyElementLabel: string | null;
  profileLabelFor: (group: StoryEntity["group"]) => string;
  profileActionFor: (group: StoryEntity["group"]) => string;
  supports: {
    scenes: boolean;
    locations: boolean;
    characters: boolean;
    trace: boolean;
    relations: boolean;
    narrativeQuestions: boolean;
  };
  sidebar: Array<"characters" | "story" | "entities" | "ideas">;
  home: Array<"brief" | "structure" | "characters" | "story" | "entities" | "candidates" | "questions">;
  creates: WriterContextCreate[];
  emptyState: string;
  askPlaceholder: string;
  entityAskPlaceholder: (name: string) => string;
  defaultView: WriterViewMode;
  pagination: PaginationKind;
};

const STRUCTURE_LABELS: Record<StoryStructureKind, string> = {
  scene: "Escenas",
  chapter: "Capítulos",
  section: "Secciones",
};

function askAbout(name: string): string {
  return `Pregunta sobre ${name}…`;
}

function narrativeProfile(group: StoryEntity["group"]): string {
  return group === "character" ? "Perfil" : "Descripción";
}

function narrativeProfileAction(group: StoryEntity["group"]): string {
  return group === "character" ? "+ Definir personaje" : "+ Añadir descripción";
}

const scriptCreates: WriterContextCreate[] = [
  { group: "character", menu: "Personaje", empty: "+ Crear personaje", nameLabel: "Nombre del personaje" },
  { group: "story", menu: "Elemento de historia", empty: "+ Crear elemento de historia", nameLabel: "Nombre del elemento" },
];

export const scriptContextAdapter: WriterContextAdapter = {
  id: "screenplay",
  workspaceLabel: "Story",
  structureKinds: ["scene", "chapter", "section"],
  structureLabels: STRUCTURE_LABELS,
  primaryEntityLabel: "Personaje",
  primaryEntityPluralLabel: "Personajes",
  storyElementLabel: "Historia",
  profileLabelFor: narrativeProfile,
  profileActionFor: narrativeProfileAction,
  supports: {
    scenes: true,
    locations: true,
    characters: true,
    trace: true,
    relations: true,
    narrativeQuestions: true,
  },
  sidebar: ["characters", "story", "ideas"],
  home: ["brief", "structure", "characters", "story", "candidates", "questions"],
  creates: scriptCreates,
  emptyState: "Empieza a escribir o crea elementos para construir tu Story.",
  askPlaceholder: "Pregunta sobre tu historia…",
  entityAskPlaceholder: askAbout,
  defaultView: "paged",
  pagination: "script",
};

export const bookContextAdapter: WriterContextAdapter = {
  id: "book",
  workspaceLabel: "Story",
  structureKinds: ["chapter"],
  structureLabels: STRUCTURE_LABELS,
  primaryEntityLabel: "Personaje",
  primaryEntityPluralLabel: "Personajes",
  storyElementLabel: "Historia",
  profileLabelFor: narrativeProfile,
  profileActionFor: narrativeProfileAction,
  supports: {
    scenes: false,
    locations: false,
    characters: true,
    trace: true,
    relations: true,
    narrativeQuestions: true,
  },
  sidebar: ["characters", "story", "ideas"],
  home: ["brief", "structure", "characters", "story", "candidates", "questions"],
  creates: scriptCreates,
  emptyState: "Empieza a escribir o crea elementos para construir tu Story.",
  askPlaceholder: "Pregunta sobre tu historia…",
  entityAskPlaceholder: askAbout,
  defaultView: "paged",
  pagination: "prose",
};

function contextAdapter(
  id: "document" | "article" | "post",
  structureKinds: StoryStructureKind[],
  defaultView: WriterViewMode,
): WriterContextAdapter {
  return {
    id,
    workspaceLabel: "Contexto",
    structureKinds,
    structureLabels: STRUCTURE_LABELS,
    primaryEntityLabel: "Entidad",
    primaryEntityPluralLabel: "Entidades",
    storyElementLabel: null,
    profileLabelFor: () => "Información",
    profileActionFor: () => "+ Añadir información",
    supports: {
      scenes: false,
      locations: false,
      characters: false,
      trace: false,
      relations: true,
      narrativeQuestions: false,
    },
    sidebar: ["entities", "ideas"],
    home: ["brief", "structure", "entities"],
    creates: [{ group: "story", menu: "Entidad", empty: "+ Crear entidad", nameLabel: "Nombre de la entidad" }],
    emptyState: "Empieza a escribir o crea entidades para construir el contexto.",
    askPlaceholder: "Pregunta sobre este contenido…",
    entityAskPlaceholder: askAbout,
    defaultView,
    pagination: "prose",
  };
}

export const documentContextAdapter = contextAdapter("document", ["chapter", "section"], "paged");
export const articleContextAdapter = contextAdapter("article", ["chapter", "section"], "continuous");
export const postContextAdapter = contextAdapter("post", ["section"], "continuous");

export function writerResolvedView(profile: string | null | undefined, stored: WriterViewMode | null): WriterViewMode {
  return stored ?? getWriterContextAdapter(profile).defaultView;
}

const ADAPTERS: Record<string, WriterContextAdapter> = {
  screenplay: scriptContextAdapter,
  book: bookContextAdapter,
  document: documentContextAdapter,
  article: articleContextAdapter,
  post: postContextAdapter,
};

export function getWriterContextAdapter(profile: string | null | undefined): WriterContextAdapter {
  if (!profile) return documentContextAdapter;
  return ADAPTERS[profile] ?? documentContextAdapter;
}
