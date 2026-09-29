"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { StoryAskOutcome, StoryAskScope, StoryAskTurn } from "./writer-ask-story";
import {
  appendStoryConversationTurn,
  emptyStoryConversation,
  resetStoryConversation,
  type StoryConversation,
} from "./writer-conversation";
import { storyEntitySearchText, type StoryAppearance, type StoryDocumentBlock } from "./writer-appearances";
import { writerBlockTextHash } from "./writer-block-id";
import { storyDisplayTitle } from "./writer-cue";
import { candidateBlurb, relationRowsFor, relationSearchBlob, type StoryThreadCandidate } from "./writer-relations";
import {
  buildEntityPresentation,
  buildStorySnapshot,
  freshChangesLine,
  untilUpdateLine,
  visibleStoryEntities,
  type StorySnapshot,
} from "./writer-presentation";
import {
  acceptStoryThreadCandidate,
  addStoryAuthorRelation,
  addStoryEntityNote,
  createStoryEntity,
  dismissStoryThreadCandidate,
  removeStoryEntity,
  removeStoryNote,
  renameStoryEntity,
  setStoryDefinition,
  setStoryEntityAliases,
  setStoryNoteIdea,
  storyIdeaCount,
  updateStoryNote,
  type StoryEntity,
  type StoryNote,
  type WriterStory,
} from "./writer-story";

const STORY_PAGE = 40;
const NARROW_MQ = "(max-width: 860px)";

type StoryNav =
  | { type: "home" }
  | { type: "structure" }
  | { type: "entity"; id: string }
  | { type: "trace"; id: string }
  | { type: "appearances"; id: string }
  | { type: "ideas" };

type SearchHit = {
  key: string;
  kind: "character" | "story" | "note" | "idea" | "appearance";
  entityId: string | null;
  label: string;
  snippet: string;
};

export function StoryView({
  story,
  reading,
  appearances = [],
  blocks = [],
  profile = "screenplay",
  pending = 0,
  progress = null,
  notice = null,
  onUpdate,
  onStory,
  onClose: _onClose,
  onOpenAppearance,
  onOpenBlock,
  onAsk,
  onSaveIdea,
  onOpenFragment,
}: {
  story: WriterStory;
  reading?: WriterStory;
  appearances?: StoryAppearance[];
  blocks?: StoryDocumentBlock[];
  profile?: "document" | "article" | "post" | "screenplay";
  pending?: number;
  progress?: { current: number; total: number } | null;
  notice?: string | null;
  onUpdate?: () => void;
  onStory: (story: WriterStory) => void;
  /** Salida global: el header del studio usa ← Write. */
  onClose: () => void;
  onOpenAppearance?: (appearance: StoryAppearance) => boolean;
  onOpenBlock?: (blockId: string) => boolean;
  onAsk?: (input: {
    scope: StoryAskScope;
    question: string;
    previous: StoryAskTurn | null;
    conversation: StoryConversation;
  }) => Promise<StoryAskOutcome>;
  onSaveIdea?: (input: { text: string; entityId: string | null }) => boolean;
  onOpenFragment?: (fragment: { entityId: string; blockId: string }) => boolean;
}) {
  void _onClose;
  const [nav, setNav] = useState<StoryNav>({ type: "home" });
  const [query, setQuery] = useState("");
  const [narrow, setNarrow] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<"character" | "story" | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollByEntity = useRef<Record<string, number>>({});
  const readingStory = reading ?? story;

  useEffect(() => {
    const media = window.matchMedia(NARROW_MQ);
    const sync = () => setNarrow(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const entityId = nav.type === "entity" || nav.type === "trace" || nav.type === "appearances" ? nav.id : null;
  const entity = entityId ? story.entities.find((item) => item.id === entityId) ?? null : null;
  const display = entity ? readingStory.entities.find((item) => item.id === entity.id) ?? entity : null;

  useEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    if (nav.type === "entity") {
      node.scrollTop = scrollByEntity.current[nav.id] ?? 0;
      return;
    }
    node.scrollTop = 0;
  }, [nav]);

  const openEntity = (id: string) => {
    if (nav.type === "entity" && contentRef.current) {
      scrollByEntity.current[nav.id] = contentRef.current.scrollTop;
    }
    setQuery("");
    setNav({ type: "entity", id });
  };

  const openHome = () => {
    if (nav.type === "entity" && contentRef.current) {
      scrollByEntity.current[nav.id] = contentRef.current.scrollTop;
    }
    setNav({ type: "home" });
  };

  const visible = useMemo(() => visibleStoryEntities(readingStory, blocks), [readingStory, blocks]);
  const visibleIds = useMemo(() => new Set(visible.map((item) => item.id)), [visible]);

  useEffect(() => {
    if (!entityId) return;
    if (!entity || !visibleIds.has(entityId)) setNav({ type: "home" });
  }, [entity, entityId, visibleIds]);

  const characters = visible.filter((item) => item.group === "character");
  const elements = visible.filter((item) => item.group === "story");
  const ideas = storyIdeaCount(story);
  const liveHashes = useMemo(() => new Map(blocks.map((block) => [block.blockId, writerBlockTextHash(block.text)])), [blocks]);
  const snapshot = useMemo(
    () => buildStorySnapshot(readingStory, blocks, appearances, pending, liveHashes, profile === "screenplay"),
    [readingStory, blocks, appearances, pending, liveHashes, profile],
  );
  const hits = useMemo(() => searchStory(readingStory, appearances, query, visibleIds), [readingStory, appearances, query, visibleIds]);
  const askScope: StoryAskScope = entity ? { type: "entity", entityId: entity.id } : { type: "global" };
  const askChip = entity?.label ?? "Story";
  const askPlaceholder = entity ? `Pregunta sobre ${entity.label}…` : "Pregunta sobre tu historia…";
  const askLabel = entity ? `Pregunta sobre ${entity.label}` : "Pregunta sobre tu historia";
  const showSidebar = !narrow || nav.type === "home";
  const showMain = !narrow || nav.type !== "home";

  return (
    <div className="writer-story" role="region" aria-label="Story" data-foldder-i18n-ignore="">
      <div className={`writer-story-workspace${narrow ? " is-narrow" : ""}`}>
        {showSidebar ? (
          <StorySidebar
            searchRef={searchRef}
            query={query}
            onQuery={setQuery}
            characters={characters}
            elements={elements}
            ideas={ideas}
            activeId={entityId}
            homeActive={nav.type === "home"}
            ideasActive={nav.type === "ideas"}
            hits={hits}
            newOpen={newOpen}
            createDraft={createDraft}
            onToggleNew={() => {
              setNewOpen((open) => !open);
              setCreateDraft(null);
            }}
            onCloseNew={() => {
              setNewOpen(false);
              setCreateDraft(null);
            }}
            onHome={() => {
              setQuery("");
              openHome();
            }}
            onIdeas={() => {
              setQuery("");
              setNav({ type: "ideas" });
            }}
            onOpenEntity={(id) => {
              setQuery("");
              openEntity(id);
            }}
            onCreateNamed={(group, name) => {
              const next = createStoryEntity(story, { label: name, group });
              if (!next.entity) return;
              onStory(next.story);
              setNewOpen(false);
              setCreateDraft(null);
              setQuery("");
              openEntity(next.entity.id);
            }}
          />
        ) : null}

        {showMain ? (
          <div className="writer-story-main">
            <div
              ref={contentRef}
              className="writer-story-content"
              onScroll={() => {
                if (nav.type === "entity" && contentRef.current) {
                  scrollByEntity.current[nav.id] = contentRef.current.scrollTop;
                }
              }}
            >
              <div className="writer-story-readable">
                {nav.type === "home" ? (
                  <StoryHome
                    snapshot={snapshot}
                    elements={elements}
                    pending={pending}
                    progress={progress}
                    notice={notice}
                    onUpdate={onUpdate}
                    onOpenEntity={openEntity}
                    onOpenBlock={onOpenBlock}
                    onStructure={() => setNav({ type: "structure" })}
                    onCreate={(group) => {
                      setCreateDraft(group);
                      setNewOpen(true);
                    }}
                    candidates={(readingStory.threadCandidates ?? []).slice(0, 3)}
                    onAcceptCandidate={(id) => {
                      const label = (story.threadCandidates ?? []).find((item) => item.id === id)?.label ?? "";
                      const next = acceptStoryThreadCandidate(story, id);
                      onStory(next);
                      const created = next.entities.find((item) => item.group === "story" && fold(item.label) === fold(label));
                      if (created) openEntity(created.id);
                    }}
                    onDismissCandidate={(id) => onStory(dismissStoryThreadCandidate(story, id))}
                  />
                ) : null}

                {nav.type === "structure" ? (
                  <StoryStructureView
                    snapshot={snapshot}
                    narrow={narrow}
                    onBack={narrow ? openHome : undefined}
                    onOpenBlock={onOpenBlock}
                  />
                ) : null}

                {nav.type === "ideas" ? (
                  <StoryIdeasView
                    story={story}
                    narrow={narrow}
                    onBack={narrow ? openHome : undefined}
                    onOpenEntity={openEntity}
                    onStory={onStory}
                  />
                ) : null}

                {entity && display && nav.type === "entity" ? (
                  <StoryEntityPanel
                    entity={entity}
                    display={display}
                    appearances={appearances.filter((item) => item.entityId === entity.id)}
                    narrow={narrow}
                    onBack={narrow ? openHome : undefined}
                    onRename={(label) => onStory(renameStoryEntity(story, entity.id, label))}
                    onAliases={(aliases) => onStory(setStoryEntityAliases(story, entity.id, aliases))}
                    onDefinition={(definition) => onStory(setStoryDefinition(story, entity.id, definition))}
                    onNote={(text) => {
                      const next = addStoryEntityNote(story, entity.id, text);
                      if (next.added) onStory(next.story);
                      return next.added;
                    }}
                    onUpdateNote={(id, text) => onStory(updateStoryNote(story, id, { text }))}
                    onIdeaState={(id, idea) => onStory(setStoryNoteIdea(story, id, idea))}
                    onRemoveNote={(id) => onStory(removeStoryNote(story, id))}
                    onDelete={() => {
                      onStory(removeStoryEntity(story, entity.id));
                      openHome();
                    }}
                    onOpenTrace={() => {
                      if (contentRef.current) scrollByEntity.current[entity.id] = contentRef.current.scrollTop;
                      setNav({ type: "trace", id: entity.id });
                    }}
                    onOpenAppearances={() => {
                      if (contentRef.current) scrollByEntity.current[entity.id] = contentRef.current.scrollTop;
                      setNav({ type: "appearances", id: entity.id });
                    }}
                    relations={relationRowsFor(entity.id, readingStory.relations ?? [], visible)}
                    linkable={visible.filter((item) => item.id !== entity.id)}
                    freshChanges={pending}
                    blocks={blocks}
                    liveHashes={liveHashes}
                    source={readingStory}
                    screenplay={profile === "screenplay"}
                    onOpenRelated={openEntity}
                    onAddRelation={(otherId, phrase) => onStory(addStoryAuthorRelation(story, { fromEntityId: entity.id, toEntityId: otherId, phrase }))}
                  />
                ) : null}

                {entity && display && nav.type === "trace" ? (
                  <StoryTraceView
                    entity={entity}
                    display={display}
                    onBack={() => setNav({ type: "entity", id: entity.id })}
                    onOpenFragment={(blockId) => onOpenFragment?.({ entityId: entity.id, blockId }) ?? false}
                  />
                ) : null}

                {entity && nav.type === "appearances" ? (
                  <StoryAppearancesView
                    entity={entity}
                    appearances={appearances.filter((item) => item.entityId === entity.id)}
                    onBack={() => setNav({ type: "entity", id: entity.id })}
                    onOpenAppearance={onOpenAppearance}
                  />
                ) : null}
              </div>
            </div>

            {onAsk ? (
              <AskStoryDock
                key={entity?.id ?? "global"}
                chip={askChip}
                placeholder={askPlaceholder}
                label={askLabel}
                scope={askScope}
                ideaEntityId={entity?.id ?? null}
                onAsk={onAsk}
                onSaveIdea={onSaveIdea}
                onOpenFragment={onOpenFragment}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StorySidebar({
  searchRef,
  query,
  onQuery,
  characters,
  elements,
  ideas,
  activeId,
  homeActive,
  ideasActive,
  hits,
  newOpen,
  createDraft,
  onToggleNew,
  onCloseNew,
  onHome,
  onIdeas,
  onOpenEntity,
  onCreateNamed,
}: {
  searchRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  onQuery: (value: string) => void;
  characters: StoryEntity[];
  elements: StoryEntity[];
  ideas: number;
  activeId: string | null;
  homeActive: boolean;
  ideasActive: boolean;
  hits: SearchHit[];
  newOpen: boolean;
  createDraft: "character" | "story" | null;
  onToggleNew: () => void;
  onCloseNew: () => void;
  onHome: () => void;
  onIdeas: () => void;
  onOpenEntity: (id: string) => void;
  onCreateNamed: (group: "character" | "story", name: string) => void;
}) {
  const [draft, setDraft] = useState<"character" | "story" | null>(null);
  const [name, setName] = useState("");
  const searching = query.trim().length > 0;

  useEffect(() => {
    if (!newOpen) {
      setDraft(null);
      setName("");
      return;
    }
    if (createDraft) {
      setDraft(createDraft);
      setName("");
    }
  }, [newOpen, createDraft]);

  return (
    <nav className="writer-story-sidebar" aria-label="Navegación de Story">
      <button
        type="button"
        className={`writer-story-brand${homeActive && !ideasActive ? " is-active" : ""}`}
        aria-label="Inicio de Story"
        onClick={onHome}
      >
        Story
      </button>
      <input
        ref={searchRef}
        className="writer-story-search"
        aria-label="Buscar en Story"
        placeholder="Buscar…"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
      />

      {searching ? (
        <div className="writer-story-search-results" role="listbox" aria-label="Resultados de Story">
          {hits.length === 0 ? <p className="writer-story-muted">Nada coincide.</p> : null}
          {hits.map((hit) => (
            <button
              key={hit.key}
              type="button"
              role="option"
              className="writer-story-hit"
              onClick={() => {
                if (hit.entityId) onOpenEntity(hit.entityId);
                else onIdeas();
                onQuery("");
              }}
            >
              <span className="writer-story-hit-label">{hit.label}</span>
              <span className="writer-story-hit-snippet">{hit.snippet}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="writer-story-nav-scroll">
          <StoryNavGroup title="Personajes" entities={characters} activeId={activeId} onOpen={onOpenEntity} />
          {elements.length > 0 ? (
            <StoryNavGroup title="Historia" entities={elements} activeId={activeId} onOpen={onOpenEntity} />
          ) : null}
          {ideas > 0 || ideasActive ? (
            <button
              type="button"
              className={`writer-story-nav-row writer-story-ideas-row${ideasActive ? " is-active" : ""}`}
              onClick={onIdeas}
            >
              <span>Ideas</span>
              {ideas > 0 ? <span className="writer-story-badge">{ideas}</span> : null}
            </button>
          ) : null}
        </div>
      )}

      <div className="writer-story-sidebar-foot">
        <div className="writer-story-new-wrap">
          <button type="button" className="writer-story-new" onClick={onToggleNew} aria-expanded={newOpen}>
            + Nuevo
          </button>
          {newOpen ? (
            <div className="writer-story-popover" role="menu">
              {draft ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!name.trim()) return;
                    onCreateNamed(draft, name.trim());
                    setDraft(null);
                    setName("");
                    onCloseNew();
                  }}
                >
                  <input
                    aria-label={draft === "character" ? "Nombre del personaje" : "Nombre del elemento"}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoFocus
                    placeholder={draft === "character" ? "Nombre del personaje" : "Nombre del elemento"}
                  />
                  <div className="writer-story-inline-actions">
                    <button type="button" onClick={() => { setDraft(null); setName(""); }}>Cancelar</button>
                    <button type="submit">Crear</button>
                  </div>
                </form>
              ) : (
                <>
                  <button type="button" role="menuitem" onClick={() => setDraft("character")}>Personaje</button>
                  <button type="button" role="menuitem" onClick={() => setDraft("story")}>Elemento de historia</button>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}

function StoryNavGroup({
  title,
  entities,
  activeId,
  onOpen,
}: {
  title: string;
  entities: StoryEntity[];
  activeId: string | null;
  onOpen: (id: string) => void;
}) {
  if (entities.length === 0) return null;
  return (
    <section className="writer-story-nav-group">
      <h2>{title}</h2>
      {entities.map((entity) => (
        <button
          key={entity.id}
          type="button"
          className={`writer-story-nav-row${activeId === entity.id ? " is-active" : ""}`}
          aria-current={activeId === entity.id ? "page" : undefined}
          aria-label={storyDisplayTitle(entity.label, entity.group)}
          onClick={() => onOpen(entity.id)}
        >
          {storyDisplayTitle(entity.label, entity.group)}
        </button>
      ))}
    </section>
  );
}

function StoryHome({
  snapshot,
  elements,
  pending,
  progress,
  notice,
  onUpdate,
  onOpenEntity,
  onOpenBlock,
  onStructure,
  onCreate,
  candidates,
  onAcceptCandidate,
  onDismissCandidate,
}: {
  snapshot: StorySnapshot;
  elements: StoryEntity[];
  pending: number;
  progress: { current: number; total: number } | null;
  notice: string | null;
  onUpdate?: () => void;
  onOpenEntity: (id: string) => void;
  onOpenBlock?: (blockId: string) => boolean;
  onStructure: () => void;
  onCreate: (group: "character" | "story") => void;
  candidates: StoryThreadCandidate[];
  onAcceptCandidate: (id: string) => void;
  onDismissCandidate: (id: string) => void;
}) {
  const empty = snapshot.counts.units === 0 && snapshot.characterTotal === 0 && elements.length === 0 && candidates.length === 0;
  const structureTitle = snapshot.kind === "chapter" ? "Capítulos" : snapshot.kind === "section" ? "Secciones" : "Escenas";
  return (
    <div className="writer-story-home">
      <h1>Story</h1>
      {empty ? (
        <div className="writer-story-empty">
          <p>Empieza a escribir o crea elementos para construir tu Story.</p>
          <div className="writer-story-inline-actions">
            <button type="button" onClick={() => onCreate("character")}>+ Crear personaje</button>
            <button type="button" onClick={() => onCreate("story")}>+ Crear elemento de historia</button>
          </div>
          <StoryUpdateRow pending={pending} stale={Boolean(snapshot.brief?.stale)} progress={progress} notice={notice} onUpdate={onUpdate} />
        </div>
      ) : (
        <>
          {snapshot.brief ? <p className="writer-story-brief">{snapshot.brief.text}</p> : null}
          {snapshot.counts.units > 0 || snapshot.characterTotal > 0 ? (
            <p className="writer-story-meta">{snapshotCounts(snapshot)}</p>
          ) : null}
          <StoryUpdateRow pending={pending} stale={Boolean(snapshot.brief?.stale)} progress={progress} notice={notice} onUpdate={onUpdate} />
          {snapshot.unitPreview.length > 0 ? (
            <section>
              <h2>{structureTitle}</h2>
              {snapshot.unitPreview.map((unit) => (
                <button key={unit.id} type="button" className="writer-story-plain-row" onClick={() => onOpenBlock?.(unit.blockId)}>
                  <span>{String(unit.order).padStart(2, "0")} · {unit.title}</span>
                  {unit.brief ? <span className="writer-story-clamp">{unit.brief}</span> : null}
                  {unit.cast.length > 0 ? <span className="writer-story-meta">{unit.cast.join(" · ")}</span> : null}
                </button>
              ))}
              {snapshot.units.length > 0 ? (
                <button type="button" className="writer-story-linkish" onClick={onStructure}>Ver estructura →</button>
              ) : null}
            </section>
          ) : null}
          {snapshot.characters.length > 0 ? (
            <section>
              <h2>Personajes</h2>
              {snapshot.characters.map((character) => (
                <button key={character.id} type="button" className="writer-story-plain-row" onClick={() => onOpenEntity(character.id)}>
                  <span>{character.title}</span>
                  {character.brief ? <span className="writer-story-clamp">{character.brief}</span> : null}
                  <span className="writer-story-meta">{characterMeta(character.appearances, character.scenes)} →</span>
                </button>
              ))}
            </section>
          ) : null}
          {elements.length > 0 ? (
            <section>
              <h2>Historia</h2>
              {elements.map((entity) => (
                <button key={entity.id} type="button" className="writer-story-plain-row" onClick={() => onOpenEntity(entity.id)}>
                  <span>{storyDisplayTitle(entity.label, "story")}</span>
                </button>
              ))}
            </section>
          ) : null}
        </>
      )}
      {candidates.length > 0 ? (
        <section>
          <h2>Parece importante</h2>
          {candidates.map((candidate) => (
            <div key={candidate.id} className="writer-story-candidate">
              <div>
                <p>{candidate.label}</p>
                <p className="writer-story-muted">{candidateBlurb(candidate, elements)}</p>
              </div>
              <div className="writer-story-inline-actions">
                <button type="button" onClick={() => onAcceptCandidate(candidate.id)}>Crear en Historia</button>
                <button type="button" aria-label={`Descartar ${candidate.label}`} onClick={() => onDismissCandidate(candidate.id)}>×</button>
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function StoryStructureView({
  snapshot,
  narrow,
  onBack,
  onOpenBlock,
}: {
  snapshot: StorySnapshot;
  narrow: boolean;
  onBack?: () => void;
  onOpenBlock?: (blockId: string) => boolean;
}) {
  const title = snapshot.kind === "chapter" ? "Capítulos" : snapshot.kind === "section" ? "Secciones" : "Estructura";
  return (
    <div className="writer-story-subview">
      {narrow && onBack ? (
        <button type="button" className="writer-story-back" onClick={onBack}>← Story</button>
      ) : null}
      <h1>{title}</h1>
      {snapshot.units.map((unit) => (
        <button key={unit.id} type="button" className="writer-story-plain-row" onClick={() => onOpenBlock?.(unit.blockId)}>
          <span className="writer-story-meta">{snapshot.kind === "scene" ? `Escena ${unit.order}` : String(unit.order).padStart(2, "0")}</span>
          <span>{unit.heading}</span>
          {unit.brief ? <span className="writer-story-clamp">{unit.brief}</span> : null}
          {unit.cast.length > 0 ? <span className="writer-story-meta">{unit.cast.join(" · ")}</span> : null}
        </button>
      ))}
    </div>
  );
}

function snapshotCounts(snapshot: StorySnapshot): string {
  const parts: string[] = [];
  if (snapshot.counts.units > 0) {
    const noun = snapshot.kind === "chapter" ? (snapshot.counts.units === 1 ? "capítulo" : "capítulos") : snapshot.kind === "section" ? (snapshot.counts.units === 1 ? "sección" : "secciones") : (snapshot.counts.units === 1 ? "escena" : "escenas");
    parts.push(`${snapshot.counts.units} ${noun}`);
  }
  if (snapshot.counts.characters > 0) parts.push(`${snapshot.counts.characters} ${snapshot.counts.characters === 1 ? "personaje" : "personajes"}`);
  if (snapshot.counts.locations > 0) parts.push(`${snapshot.counts.locations} ${snapshot.counts.locations === 1 ? "localización" : "localizaciones"}`);
  return parts.join(" · ");
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

function characterMeta(appearances: number, scenes: number): string {
  const refs = appearances === 1 ? "1 referencia" : `${appearances} referencias`;
  if (scenes <= 0) return refs;
  const scene = scenes === 1 ? "1 escena" : `${scenes} escenas`;
  return `${scene} · ${refs}`;
}

function StoryUpdateRow({
  pending,
  stale,
  progress,
  notice,
  onUpdate,
}: {
  pending: number;
  stale: boolean;
  progress: { current: number; total: number } | null;
  notice: string | null;
  onUpdate?: () => void;
}) {
  const line = stale ? untilUpdateLine(pending) : pending > 0 ? freshChangesLine(pending) : null;
  if (!line && !notice) return null;
  return (
    <div className="writer-story-status">
      <p className="writer-story-meta">{line ?? notice}</p>
      {pending > 0 && onUpdate ? (
        <button type="button" onClick={onUpdate} disabled={progress != null} aria-label="Actualizar Story" title="Actualiza resúmenes, recorrido, estado y pendientes.">
          ✦ Actualizar
        </button>
      ) : null}
      {progress && progress.total > 1 ? <p className="writer-story-meta">{progress.current} / {progress.total}</p> : null}
    </div>
  );
}

function StoryEntityPanel({
  entity,
  display,
  appearances,
  narrow,
  onBack,
  onRename,
  onAliases,
  onDefinition,
  onNote,
  onUpdateNote,
  onIdeaState,
  onRemoveNote,
  onDelete,
  onOpenTrace,
  onOpenAppearances,
  relations,
  linkable,
  freshChanges,
  blocks,
  liveHashes,
  source,
  screenplay,
  onOpenRelated,
  onAddRelation,
}: {
  entity: StoryEntity;
  display: StoryEntity;
  appearances: StoryAppearance[];
  narrow: boolean;
  onBack?: () => void;
  onRename: (label: string) => void;
  onAliases: (aliases: string[]) => void;
  onDefinition: (definition: string) => void;
  onNote: (text: string) => boolean;
  onUpdateNote: (id: string, text: string) => void;
  onIdeaState: (id: string, idea: "pending" | "used" | "discarded") => void;
  onRemoveNote: (id: string) => void;
  onDelete: () => void;
  onOpenTrace: () => void;
  onOpenAppearances: () => void;
  relations: { relationId: string; otherId: string; otherLabel: string; phrase: string }[];
  linkable: StoryEntity[];
  freshChanges: number;
  blocks: StoryDocumentBlock[];
  liveHashes: Map<string, string>;
  source: WriterStory;
  screenplay: boolean;
  onOpenRelated: (id: string) => void;
  onAddRelation: (otherId: string, phrase: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [aliasOpen, setAliasOpen] = useState(false);
  const [name, setName] = useState(entity.label);
  const [aliasDraft, setAliasDraft] = useState(entity.aliases.filter((alias) => fold(alias) !== fold(entity.label)).join(", "));
  const [linking, setLinking] = useState(false);
  const [linkQuery, setLinkQuery] = useState("");
  const [linkPhrase, setLinkPhrase] = useState("");
  const view = buildEntityPresentation(source, display, blocks, appearances, relations, liveHashes, screenplay);
  const titled = view.title;

  useEffect(() => {
    setName(entity.label);
    setAliasDraft(entity.aliases.filter((alias) => fold(alias) !== fold(entity.label)).join(", "));
  }, [entity.id, entity.label, entity.aliases]);

  return (
    <div className="writer-story-entity">
      <header className="writer-story-entity-header">
        {narrow && onBack ? (
          <button type="button" className="writer-story-back" onClick={onBack}>
            ← Story
          </button>
        ) : null}
        <div className="writer-story-entity-title-row">
          {renaming ? (
            <input
              aria-label="Nombre"
              value={name}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              onBlur={() => {
                const next = name.trim();
                setRenaming(false);
                if (!next || next === entity.label) {
                  setName(entity.label);
                  return;
                }
                onRename(next);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                if (event.key === "Escape") {
                  setName(entity.label);
                  setRenaming(false);
                }
              }}
            />
          ) : (
            <h1>{titled}</h1>
          )}
          <div className="writer-story-menu-wrap">
            <button
              type="button"
              className="writer-story-icon-btn"
              aria-label="Más opciones"
              aria-expanded={menuOpen}
              onClick={() => { setMenuOpen((open) => !open); setConfirmDelete(false); }}
            >
              ···
            </button>
            {menuOpen ? (
              <div className="writer-story-popover writer-story-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setRenaming(true); setMenuOpen(false); }}>Renombrar</button>
                <button type="button" role="menuitem" onClick={() => { setAliasOpen(true); setMenuOpen(false); }}>Gestionar alias</button>
                <button type="button" role="menuitem" onClick={() => { setLinking(true); setLinkQuery(""); setLinkPhrase(""); setMenuOpen(false); }}>Añadir relación</button>
                <hr />
                {confirmDelete ? (
                  <div className="writer-story-confirm">
                    <p>Eliminar {entity.label}</p>
                    <p className="writer-story-muted">Se eliminarán su perfil y sus notas. Las referencias derivadas del documento no modifican el texto.</p>
                    <div className="writer-story-inline-actions">
                      <button type="button" onClick={() => setConfirmDelete(false)}>Cancelar</button>
                      <button type="button" className="is-danger" onClick={() => { setMenuOpen(false); onDelete(); }}>Eliminar</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" role="menuitem" className="is-danger" onClick={() => setConfirmDelete(true)}>Eliminar</button>
                )}
              </div>
            ) : null}
          </div>
        </div>
        {view.brief ? <p className="writer-story-brief">{view.brief.text}</p> : null}
        {view.brief?.stale ? <p className="writer-story-meta">{untilUpdateLine(freshChanges)}</p> : null}
        <p className="writer-story-meta">
          {view.absent ? "Aún no aparece en el texto." : characterMeta(view.appearances, view.scenes)}
        </p>
        {!view.brief && view.firstAppearance ? (
          <p className="writer-story-meta">Primera aparición · {view.firstAppearance}</p>
        ) : null}
        {view.sharesScenesWith.length > 0 ? (
          <p className="writer-story-meta">Comparte escenas con {joinNames(view.sharesScenesWith)}</p>
        ) : null}
      </header>

      {aliasOpen ? (
        <form
          className="writer-story-alias-form"
          onSubmit={(event) => {
            event.preventDefault();
            const aliases = aliasDraft.split(/[,;]/).map((item) => item.trim()).filter(Boolean);
            onAliases(aliases);
            setAliasOpen(false);
          }}
        >
          <label>
            Alias
            <input aria-label="Alias" value={aliasDraft} onChange={(event) => setAliasDraft(event.target.value)} placeholder="Separados por comas" autoFocus />
          </label>
          <div className="writer-story-inline-actions">
            <button type="button" onClick={() => setAliasOpen(false)}>Cancelar</button>
            <button type="submit">Guardar</button>
          </div>
        </form>
      ) : null}

      <StoryDescription label={view.profileLabel} action={view.profileAction} value={entity.definition} onSave={onDefinition} />

      {view.stateLines.length > 0 ? (
        <section>
          <h2>Ahora</h2>
          {view.stateLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </section>
      ) : null}

      {view.trace ? (
        <section>
          <h2>Recorrido</h2>
          <p>{view.trace}</p>
          <button type="button" className="writer-story-linkish" onClick={onOpenTrace}>
            Ver recorrido →
          </button>
        </section>
      ) : null}

      {relations.length > 0 || linking ? (
        <section>
          <div className="writer-story-section-head">
            <h2>Relaciones</h2>
            <button type="button" className="writer-story-linkish" onClick={() => { setLinking(true); setLinkQuery(""); setLinkPhrase(""); }}>+ Añadir</button>
          </div>
          {relations.map((row) => (
            <button key={row.relationId} type="button" className="writer-story-relation-row" onClick={() => onOpenRelated(row.otherId)}>
              <span>{row.otherLabel}</span>
              <span className="writer-story-muted">{row.phrase}</span>
            </button>
          ))}
          {linking ? (
            <form
              className="writer-story-relation-add"
              onSubmit={(event) => {
                event.preventDefault();
                const needle = fold(linkQuery);
                const match = linkable.find((item) => fold(item.label) === needle) ?? linkable.find((item) => fold(item.label).includes(needle));
                if (!match) return;
                onAddRelation(match.id, linkPhrase);
                setLinking(false);
              }}
            >
              <input aria-label="Buscar ficha" value={linkQuery} placeholder="Buscar ficha" onChange={(event) => setLinkQuery(event.target.value)} autoFocus />
              {linkQuery.trim() ? (
                <div>
                  {linkable.filter((item) => fold(item.label).includes(fold(linkQuery))).slice(0, 5).map((item) => (
                    <button key={item.id} type="button" className="writer-story-linkish" onClick={() => setLinkQuery(item.label)}>{item.label}</button>
                  ))}
                </div>
              ) : null}
              <input aria-label="Relación" value={linkPhrase} placeholder="hermana, implicado… (opcional)" onChange={(event) => setLinkPhrase(event.target.value)} />
              <div className="writer-story-inline-actions">
                <button type="button" onClick={() => setLinking(false)}>Cancelar</button>
                <button type="submit">Guardar</button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

      <StoryNotes
        notes={entity.notes}
        onAdd={onNote}
        onUpdate={onUpdateNote}
        onIdeaState={onIdeaState}
        onRemove={onRemoveNote}
      />

      {view.appearances > 0 ? (
        <section>
          <h2>En el texto</h2>
          <button type="button" className="writer-story-linkish" onClick={onOpenAppearances}>
            {view.appearances === 1 ? "1 referencia →" : `${view.appearances} referencias →`}
          </button>
        </section>
      ) : null}
    </div>
  );
}

function StoryDescription({
  value,
  label,
  action,
  onSave,
}: {
  value: string;
  label: string;
  action: string;
  onSave: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);

  const commit = () => {
    onSave(draft);
    setEditing(false);
  };

  return (
    <section>
      <h2>{label}</h2>
      {editing ? (
        <div className="writer-story-composer">
          <textarea
            ref={field}
            aria-label={label}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setDraft(value);
                setEditing(false);
              }
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                commit();
              }
            }}
          />
          <div className="writer-story-inline-actions">
            <button type="button" onClick={() => { setDraft(value); setEditing(false); }}>Cancelar</button>
            <button type="button" onClick={commit}>Guardar</button>
          </div>
        </div>
      ) : value.trim() ? (
        <button type="button" className="writer-story-prose" onClick={() => setEditing(true)}>
          {value}
        </button>
      ) : (
        <button type="button" className="writer-story-linkish" onClick={() => setEditing(true)}>
          {action}
        </button>
      )}
    </section>
  );
}

function StoryNotes({
  notes,
  onAdd,
  onUpdate,
  onIdeaState,
  onRemove,
}: {
  notes: StoryNote[];
  onAdd: (text: string) => boolean;
  onUpdate: (id: string, text: string) => void;
  onIdeaState: (id: string, idea: "pending" | "used" | "discarded") => void;
  onRemove: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const visible = notes.filter((note) => note.idea !== "discarded");
  const shown = expanded ? visible : visible.slice(0, 2);
  const hiddenNotes = visible.length - shown.length;

  useEffect(() => {
    if (adding) field.current?.focus();
  }, [adding]);

  return (
    <section className="writer-story-notes">
      <div className="writer-story-section-head">
        <h2>Notas del autor</h2>
        <button
          type="button"
          className="writer-story-linkish"
          onClick={() => {
            setAdding(true);
            setDraft("");
          }}
        >
          + Añadir
        </button>
      </div>

      {shown.map((note) => {
        const isIdea = note.status === "tentative";
        if (editingId === note.id) {
          return (
            <div key={note.id} className="writer-story-composer">
              <textarea
                aria-label="Editar nota"
                value={editText}
                onChange={(event) => setEditText(event.target.value)}
                autoFocus
              />
              <div className="writer-story-inline-actions">
                <button type="button" onClick={() => setEditingId(null)}>Cancelar</button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdate(note.id, editText);
                    setEditingId(null);
                  }}
                >
                  Guardar
                </button>
              </div>
            </div>
          );
        }
        return (
          <div key={note.id} className="writer-story-note">
            <div className="writer-story-note-body">
              {isIdea ? <span className="writer-story-idea-mark">✦ Idea</span> : null}
              {note.idea === "used" ? <span className="writer-story-muted">Usada</span> : null}
              <p>{note.text}</p>
            </div>
            <div className="writer-story-menu-wrap">
              <button
                type="button"
                className="writer-story-icon-btn writer-story-note-menu"
                aria-label="Opciones de nota"
                onClick={() => setMenuId(menuId === note.id ? null : note.id)}
              >
                ···
              </button>
              {menuId === note.id ? (
                <div className="writer-story-popover writer-story-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setEditingId(note.id);
                      setEditText(note.text);
                      setMenuId(null);
                    }}
                  >
                    Editar
                  </button>
                  {isIdea ? (
                    <>
                      <button type="button" role="menuitem" onClick={() => { onIdeaState(note.id, "used"); setMenuId(null); }}>
                        Marcar como usada
                      </button>
                      <button type="button" role="menuitem" onClick={() => { onIdeaState(note.id, "discarded"); setMenuId(null); }}>
                        Descartar
                      </button>
                    </>
                  ) : null}
                  <button type="button" role="menuitem" className="is-danger" onClick={() => { onRemove(note.id); setMenuId(null); }}>
                    Eliminar
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}

      {hiddenNotes > 0 ? (
        <button type="button" className="writer-story-linkish" onClick={() => setExpanded(true)}>
          {hiddenNotes === 1 ? "1 nota más →" : `${hiddenNotes} notas más →`}
        </button>
      ) : null}

      {adding ? (
        <form
          className="writer-story-composer"
          onSubmit={(event) => {
            event.preventDefault();
            if (!onAdd(draft)) return;
            setDraft("");
            setAdding(false);
          }}
        >
          <textarea
            ref={field}
            aria-label="Nota"
            placeholder={`Añade algo…`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setAdding(false);
                setDraft("");
              }
            }}
          />
          <div className="writer-story-inline-actions">
            <button type="button" onClick={() => { setAdding(false); setDraft(""); }}>Cancelar</button>
            <button type="submit">Guardar</button>
          </div>
        </form>
      ) : visible.length === 0 ? (
        <button type="button" className="writer-story-linkish" onClick={() => setAdding(true)}>
          + Añadir nota
        </button>
      ) : null}
    </section>
  );
}

function StoryTraceView({
  entity,
  display,
  onBack,
  onOpenFragment,
}: {
  entity: StoryEntity;
  display: StoryEntity;
  onBack: () => void;
  onOpenFragment: (blockId: string) => boolean;
}) {
  const [missing, setMissing] = useState(false);
  const trace = [...display.events].sort((a, b) => a.order - b.order);
  return (
    <div className="writer-story-subview">
      <button type="button" className="writer-story-back" onClick={onBack}>
        ← {storyDisplayTitle(entity.label, entity.group)}
      </button>
      <h1>Recorrido</h1>
      <div className="writer-story-list">
        {trace.map((item) => (
          <button
            key={item.id}
            type="button"
            className="writer-story-list-item"
            data-event={item.sourceBlockIds[0] ?? item.id}
            onClick={() => {
              const blockId = item.sourceBlockIds[0];
              const found = blockId ? onOpenFragment(blockId) : false;
              setMissing(!found);
            }}
          >
            {item.chapterLabel ? <span className="writer-story-list-meta">{item.chapterLabel}</span> : null}
            <span>{item.text}</span>
          </button>
        ))}
      </div>
      {missing ? <p className="writer-story-muted">Ese fragmento ya no existe.</p> : null}
    </div>
  );
}

function StoryAppearancesView({
  entity,
  appearances,
  onBack,
  onOpenAppearance,
}: {
  entity: StoryEntity;
  appearances: StoryAppearance[];
  onBack: () => void;
  onOpenAppearance?: (appearance: StoryAppearance) => boolean;
}) {
  const [missing, setMissing] = useState(false);
  const [windowSize, setWindowSize] = useState(STORY_PAGE);
  const visible = appearances.slice(0, windowSize);
  return (
    <div className="writer-story-subview">
      <button type="button" className="writer-story-back" onClick={onBack}>
        ← {storyDisplayTitle(entity.label, entity.group)}
      </button>
      <h1>En el texto</h1>
      <div className="writer-story-list">
        {visible.map((item) => (
          <button
            key={`${item.blockId}:${item.order}`}
            type="button"
            className="writer-story-list-item"
            data-appearance={item.blockId}
            onClick={() => {
              const found = onOpenAppearance?.(item) ?? false;
              setMissing(!found);
            }}
          >
            <span className="writer-story-list-meta">
              {[item.chapterLabel, item.scene].filter(Boolean).join(" · ")}
            </span>
            <span>“{item.snippet}”</span>
          </button>
        ))}
      </div>
      {appearances.length > visible.length ? (
        <button type="button" className="writer-story-linkish" onClick={() => setWindowSize((value) => value + STORY_PAGE)}>
          Ver más
        </button>
      ) : null}
      {missing ? <p className="writer-story-muted">Ese fragmento ya no existe.</p> : null}
    </div>
  );
}

function StoryIdeasView({
  story,
  narrow,
  onBack,
  onOpenEntity,
  onStory,
}: {
  story: WriterStory;
  narrow: boolean;
  onBack?: () => void;
  onOpenEntity: (id: string) => void;
  onStory: (story: WriterStory) => void;
}) {
  const [query, setQuery] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const rows = useMemo(() => {
    const items: { id: string; text: string; entityId: string | null; label: string; idea: StoryNote["idea"] }[] = [];
    for (const entity of story.entities) {
      for (const note of entity.notes) {
        if (note.status !== "tentative") continue;
        items.push({ id: note.id, text: note.text, entityId: entity.id, label: entity.label, idea: note.idea });
      }
    }
    for (const note of story.looseNotes) {
      if (note.status !== "tentative") continue;
      items.push({ id: note.id, text: note.text, entityId: null, label: "Historia", idea: note.idea });
    }
    const needle = fold(query);
    return items
      .filter((item) => !needle || fold(item.text).includes(needle) || fold(item.label).includes(needle))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [story, query]);

  return (
    <div className="writer-story-subview">
      {narrow && onBack ? (
        <button type="button" className="writer-story-back" onClick={onBack}>
          ← Story
        </button>
      ) : null}
      <h1>Ideas</h1>
      <input
        className="writer-story-search"
        aria-label="Buscar ideas"
        placeholder="Buscar ideas…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="writer-story-list">
        {rows.map((row) => (
          <div key={row.id} className="writer-story-note">
            <button
              type="button"
              className="writer-story-note-body writer-story-prose"
              onClick={() => {
                if (row.entityId) onOpenEntity(row.entityId);
              }}
            >
              <span className="writer-story-list-meta">
                {row.label}
                {row.idea === "used" ? " · Usada" : row.idea === "discarded" ? " · Descartada" : ""}
              </span>
              <span>{row.text}</span>
            </button>
            <div className="writer-story-menu-wrap">
              <button
                type="button"
                className="writer-story-icon-btn writer-story-note-menu"
                aria-label="Opciones de idea"
                onClick={() => setMenuId(menuId === row.id ? null : row.id)}
              >
                ···
              </button>
              {menuId === row.id ? (
                <div className="writer-story-popover writer-story-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => { onStory(setStoryNoteIdea(story, row.id, "used")); setMenuId(null); }}>
                    Marcar como usada
                  </button>
                  <button type="button" role="menuitem" onClick={() => { onStory(setStoryNoteIdea(story, row.id, "discarded")); setMenuId(null); }}>
                    Descartar
                  </button>
                  <button type="button" role="menuitem" className="is-danger" onClick={() => { onStory(removeStoryNote(story, row.id)); setMenuId(null); }}>
                    Eliminar
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AskStoryDock({
  chip,
  placeholder,
  label,
  scope,
  ideaEntityId,
  onAsk,
  onSaveIdea,
  onOpenFragment,
}: {
  chip: string;
  placeholder: string;
  label: string;
  scope: StoryAskScope;
  ideaEntityId: string | null;
  onAsk: (input: {
    scope: StoryAskScope;
    question: string;
    previous: StoryAskTurn | null;
    conversation: StoryConversation;
  }) => Promise<StoryAskOutcome>;
  onSaveIdea?: (input: { text: string; entityId: string | null }) => boolean;
  onOpenFragment?: (fragment: { entityId: string; blockId: string }) => boolean;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [follow, setFollow] = useState(false);
  const [savedFlash, setSavedFlash] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [conversation, setConversation] = useState(() => emptyStoryConversation(scope));
  const [view, setView] = useState<{
    question: string;
    answer: string;
    basis: string;
    local: boolean;
    suggestion: string | null;
    fragment: { entityId: string; blockId: string } | null;
    saved: boolean;
  } | null>(null);

  const scopeKey = scope.type === "entity" ? scope.entityId : "global";
  useEffect(() => {
    setConversation(emptyStoryConversation(scope));
    setView(null);
    setFollow(false);
    setError("");
    setMissing(false);
    setMenuOpen(false);
  }, [scopeKey]);

  const submit = async () => {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    setMissing(false);
    const previous = follow && view ? { question: view.question, answer: view.answer } : null;
    const result = await onAsk({ scope, question: text, previous, conversation });
    setBusy(false);
    if (!result.ok) {
      if (!result.cancelled) setError(result.error);
      return;
    }
    setConversation(
      appendStoryConversationTurn(conversation, {
        question: text,
        answer: result.answer,
        entityIds: result.entityIds ?? [],
        conversationSummary: result.conversationSummary,
      }),
    );
    setView({
      question: text,
      answer: result.answer,
      basis: result.basis,
      local: result.local,
      suggestion: result.suggestion,
      fragment: result.fragment,
      saved: false,
    });
    setQuestion("");
    setFollow(false);
  };

  const clearConversation = () => {
    setConversation(resetStoryConversation(scope));
    setView(null);
    setFollow(false);
    setQuestion("");
    setError("");
    setMissing(false);
    setMenuOpen(false);
  };

  const turnCount = conversation.recentTurns.length;

  return (
    <div className="writer-story-dock">
      {view ? (
        <div className="writer-story-tray" role="region" aria-label="Respuesta de Story">
          <div className="writer-story-tray-head">
            <p className="writer-story-kicker">✦ Story</p>
            <div className="writer-story-menu-wrap">
              {(turnCount > 0 || conversation.summary) ? (
                <>
                  <button
                    type="button"
                    className="writer-story-icon-btn"
                    aria-label="Opciones de conversación"
                    onClick={() => setMenuOpen((open) => !open)}
                  >
                    ···
                  </button>
                  {menuOpen ? (
                    <div className="writer-story-popover writer-story-menu" role="menu">
                      <button type="button" role="menuitem" onClick={clearConversation}>Nueva conversación</button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
          {turnCount > 1 ? <p className="writer-story-thread">Conversación · {turnCount} intercambios</p> : null}
          <p className="writer-story-tray-q">{view.question}</p>
          <p>{view.answer}</p>
          {view.basis ? <p className="writer-story-basis">Basado en: {view.basis}</p> : null}
          {savedFlash ? <p className="writer-story-flash">{savedFlash}</p> : null}
          <div className="writer-story-ask-actions">
            {!view.local ? (
              <button
                type="button"
                disabled={view.saved}
                onClick={() => {
                  const text = view.suggestion || view.answer;
                  const added = onSaveIdea?.({ text, entityId: ideaEntityId }) ?? false;
                  if (!added) return;
                  setView({ ...view, saved: true });
                  setSavedFlash(ideaEntityId ? `Guardado en Notas` : "Guardado en Ideas");
                  window.setTimeout(() => setSavedFlash(""), 1600);
                }}
              >
                {view.saved ? "Guardada como idea" : "Guardar como idea"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setFollow(true);
                setQuestion("");
                field.current?.focus();
              }}
            >
              Preguntar más
            </button>
            {view.fragment ? (
              <button
                type="button"
                onClick={() => {
                  const found = view.fragment ? onOpenFragment?.(view.fragment) ?? false : false;
                  setMissing(!found);
                }}
              >
                Ver fragmento
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setView(null);
                setFollow(false);
                setError("");
                setMissing(false);
              }}
            >
              Cerrar
            </button>
          </div>
          {missing ? <p className="writer-story-muted">Ese fragmento ya no existe.</p> : null}
        </div>
      ) : null}

      {error ? <p className="writer-story-dock-error">{error}</p> : null}
      {follow && view ? <p className="writer-story-thread">Sobre: {view.question}</p> : null}

      <form
        className="writer-story-dock-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <span className="writer-story-dock-chip">{chip}</span>
        <textarea
          ref={field}
          aria-label={label}
          placeholder={placeholder}
          value={question}
          disabled={busy}
          rows={1}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <button type="submit" className="writer-story-dock-send" disabled={busy || !question.trim()} aria-label="Preguntar">
          {busy ? "…" : "✦"}
        </button>
      </form>
    </div>
  );
}

function searchStory(story: WriterStory, appearances: StoryAppearance[], query: string, visibleIds: Set<string>): SearchHit[] {
  const needle = fold(query);
  if (!needle) return [];
  const hits: SearchHit[] = [];
  for (const entity of story.entities) {
    if (entity.bound === "global" || !visibleIds.has(entity.id)) continue;
    const blob = fold(`${storyEntitySearchText(entity, appearances)}\n${entity.textFacts.map((fact) => fact.text).join("\n")}\n${relationSearchBlob(entity.id, story.relations ?? [], story.entities)}`);
    if (fold(entity.label).includes(needle) || entity.aliases.some((alias) => fold(alias).includes(needle))) {
      hits.push({
        key: `entity:${entity.id}`,
        kind: entity.group === "character" ? "character" : "story",
        entityId: entity.id,
        label: storyDisplayTitle(entity.label, entity.group),
        snippet: entity.definition || entity.label,
      });
    } else if (blob.includes(needle)) {
      const note = entity.notes.find((item) => fold(item.text).includes(needle));
      hits.push({
        key: `entity-match:${entity.id}`,
        kind: entity.group === "character" ? "character" : "story",
        entityId: entity.id,
        label: storyDisplayTitle(entity.label, entity.group),
        snippet: note?.text || entity.definition || entity.label,
      });
    }
    for (const note of entity.notes) {
      if (!fold(note.text).includes(needle)) continue;
      hits.push({
        key: `note:${note.id}`,
        kind: note.status === "tentative" ? "idea" : "note",
        entityId: entity.id,
        label: note.status === "tentative" ? "Idea" : storyDisplayTitle(entity.label, entity.group),
        snippet: note.text,
      });
    }
  }
  for (const note of story.looseNotes) {
    if (!fold(note.text).includes(needle)) continue;
    hits.push({
      key: `loose:${note.id}`,
      kind: note.status === "tentative" ? "idea" : "note",
      entityId: null,
      label: note.status === "tentative" ? "Idea" : "Historia",
      snippet: note.text,
    });
  }
  for (const item of appearances) {
    if (!fold(item.snippet).includes(needle)) continue;
    const entity = story.entities.find((row) => row.id === item.entityId);
    if (!entity || !visibleIds.has(entity.id)) continue;
    hits.push({
      key: `app:${item.entityId}:${item.blockId}`,
      kind: "appearance",
      entityId: entity.id,
      label: storyDisplayTitle(entity.label, entity.group),
      snippet: item.snippet,
    });
  }
  return hits.slice(0, 24);
}

function fold(value: string): string {
  return value.toLocaleLowerCase("es").normalize("NFD").replace(/\p{M}/gu, "");
}
