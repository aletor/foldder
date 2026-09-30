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
import { getWriterContextAdapter, type WriterContextAdapter } from "./writer-context";
import {
  addAuthorQuestion,
  editAuthorQuestion,
  questionIndex,
  questionPlace,
  removeAuthorQuestion,
  setQuestionOverride,
  type ProjectedQuestion,
} from "./writer-questions";
import { candidateBlurb, relationRowsFor, relationSearchBlob, type StoryThreadCandidate } from "./writer-relations";
import { deriveStoryStructure, type StoryStructureUnit } from "./writer-structure";
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
  | { type: "location"; label: string }
  | { type: "entity"; id: string }
  | { type: "trace"; id: string }
  | { type: "appearances"; id: string }
  | { type: "ideas" }
  | { type: "questions" }
  | { type: "advances"; id: string; entityId: string | null }
  | { type: "resolved"; id: string };

type SearchHit = {
  key: string;
  kind: "character" | "story" | "note" | "idea" | "appearance" | "pending";
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
  pageForBlock,
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
  pageForBlock?: (blockId: string) => number | null;
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

  const entityId =
    nav.type === "entity" || nav.type === "trace" || nav.type === "appearances" || nav.type === "resolved"
      ? nav.id
      : nav.type === "advances"
        ? nav.entityId
        : null;
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
  const adapter = useMemo(() => getWriterContextAdapter(profile), [profile]);

  useEffect(() => {
    if (!entityId) return;
    if (!entity || !visibleIds.has(entityId)) setNav({ type: "home" });
    else if (entity.group === "character" && !adapter.supports.characters) setNav({ type: "home" });
  }, [entity, entityId, visibleIds, adapter]);

  useEffect(() => {
    if (adapter.supports.narrativeQuestions) return;
    if (nav.type === "questions" || nav.type === "advances" || nav.type === "resolved") setNav({ type: "home" });
  }, [adapter, nav.type]);

  const characters = visible.filter((item) => item.group === "character");
  const elements = visible.filter((item) => item.group === "story");
  const shownCharacters = adapter.supports.characters ? characters : [];
  const ideas = storyIdeaCount(story);
  const liveHashes = useMemo(() => new Map(blocks.map((block) => [block.blockId, writerBlockTextHash(block.text)])), [blocks]);
  const openQuestions = useMemo(
    () => (adapter.supports.narrativeQuestions ? questionIndex(readingStory.questions ?? [], liveHashes).open : []),
    [adapter, readingStory.questions, liveHashes],
  );
  const units = useMemo(
    () => deriveStoryStructure(blocks, { kinds: adapter.structureKinds }).units,
    [blocks, adapter],
  );
  const snapshot = useMemo(
    () => buildStorySnapshot(readingStory, blocks, appearances, pending, liveHashes, adapter),
    [readingStory, blocks, appearances, pending, liveHashes, adapter],
  );
  const hits = useMemo(
    () => searchStory(readingStory, appearances, query, visibleIds, openQuestions, adapter.storyElementLabel ?? adapter.workspaceLabel),
    [readingStory, appearances, query, visibleIds, openQuestions, adapter],
  );
  const askScope: StoryAskScope = entity ? { type: "entity", entityId: entity.id } : { type: "global" };
  const askPlaceholder = entity ? adapter.entityAskPlaceholder(entity.label) : adapter.askPlaceholder;
  const askLabel = askPlaceholder.replace(/…$/, "");
  const askChip = entity?.label ?? adapter.workspaceLabel;
  const showSidebar = !narrow || nav.type === "home";
  const showMain = !narrow || nav.type !== "home";

  return (
    <div className="writer-story" role="region" aria-label={adapter.workspaceLabel} data-foldder-i18n-ignore="">
      <div className={`writer-story-workspace${narrow ? " is-narrow" : ""}`}>
        {showSidebar ? (
          <StorySidebar
            searchRef={searchRef}
            query={query}
            onQuery={setQuery}
            characters={shownCharacters}
            elements={elements}
            adapter={adapter}
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
            onOpenHit={(hit) => {
              setQuery("");
              if (hit.kind === "pending") {
                if (hit.entityId) openEntity(hit.entityId);
                else setNav({ type: "questions" });
                return;
              }
              if (hit.entityId) openEntity(hit.entityId);
              else setNav({ type: "ideas" });
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
                    adapter={adapter}
                    snapshot={snapshot}
                    elements={elements}
                    pending={pending}
                    progress={progress}
                    notice={notice}
                    onUpdate={onUpdate}
                    onOpenEntity={openEntity}
                    onOpenBlock={onOpenBlock}
                    pageForBlock={pageForBlock}
                    onStructure={() => setNav({ type: "structure" })}
                    onOpenLocation={(label) => setNav({ type: "location", label })}
                    onOpenQuestions={() => setNav({ type: "questions" })}
                    onCreate={(group) => {
                      setCreateDraft(group);
                      setNewOpen(true);
                    }}
                    candidates={adapter.home.includes("candidates") ? (readingStory.threadCandidates ?? []).slice(0, 3) : []}
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
                    workspaceLabel={adapter.workspaceLabel}
                    narrow={narrow}
                    onBack={narrow ? openHome : undefined}
                    onOpenBlock={onOpenBlock}
                    pageForBlock={pageForBlock}
                  />
                ) : null}

                {nav.type === "location" ? (
                  <StoryLocationView
                    label={nav.label}
                    snapshot={snapshot}
                    workspaceLabel={adapter.workspaceLabel}
                    narrow={narrow}
                    onBack={narrow ? openHome : undefined}
                    onOpenBlock={onOpenBlock}
                    pageForBlock={pageForBlock}
                    onCreate={() => {
                      const next = createStoryEntity(story, { label: nav.label, group: "story", origin: "author" });
                      onStory(next.story);
                      if (next.entity) openEntity(next.entity.id);
                    }}
                  />
                ) : null}

                {nav.type === "ideas" ? (
                  <StoryIdeasView
                    story={story}
                    looseLabel={adapter.storyElementLabel ?? adapter.workspaceLabel}
                    workspaceLabel={adapter.workspaceLabel}
                    narrow={narrow}
                    onBack={narrow ? openHome : undefined}
                    onOpenEntity={openEntity}
                    onStory={onStory}
                  />
                ) : null}

                {nav.type === "questions" ? (
                  <StoryQuestionsView
                    questions={openQuestions}
                    entities={visible}
                    blocks={blocks}
                    units={units}
                    narrow={narrow}
                    workspaceLabel={adapter.workspaceLabel}
                    onBack={narrow ? openHome : undefined}
                    onOpenEntity={openEntity}
                    onOpenAdvances={(id, entityId) => setNav({ type: "advances", id, entityId })}
                  />
                ) : null}

                {nav.type === "advances" ? (
                  <StoryAdvancesView
                    questionId={nav.id}
                    story={readingStory}
                    entities={visible}
                    blocks={blocks}
                    units={units}
                    liveHashes={liveHashes}
                    narrow={narrow}
                    onBack={() => (nav.entityId ? setNav({ type: "entity", id: nav.entityId }) : setNav({ type: "questions" }))}
                    onOpenBlock={onOpenBlock}
                    onOpenEntity={openEntity}
                  />
                ) : null}

                {nav.type === "resolved" && entity ? (
                  <StoryResolvedView
                    entity={entity}
                    story={readingStory}
                    liveHashes={liveHashes}
                    narrow={narrow}
                    onBack={() => setNav({ type: "entity", id: entity.id })}
                    onReopen={(id) => onStory(setQuestionOverride(story, id, "open"))}
                    onRemove={(id) => onStory(removeAuthorQuestion(story, id))}
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
                    adapter={adapter}
                    onOpenRelated={openEntity}
                    onAddRelation={(otherId, phrase) => onStory(addStoryAuthorRelation(story, { fromEntityId: entity.id, toEntityId: otherId, phrase }))}
                    units={units}
                    onOpenBlock={onOpenBlock}
                    onOpenAdvances={(id) => setNav({ type: "advances", id, entityId: entity.id })}
                    onOpenResolved={() => setNav({ type: "resolved", id: entity.id })}
                    onAddQuestion={(text) => onStory(addAuthorQuestion(story, text, [entity.id]))}
                    onEditQuestion={(id, text) => onStory(editAuthorQuestion(story, id, text))}
                    onResolveQuestion={(id) => onStory(setQuestionOverride(story, id, "resolved"))}
                    onRemoveQuestion={(id) => onStory(removeAuthorQuestion(story, id))}
                    pageForBlock={pageForBlock}
                  />
                ) : null}

                {entity && display && nav.type === "trace" ? (
                  <StoryTraceView
                    entity={entity}
                    display={display}
                    onBack={() => setNav({ type: "entity", id: entity.id })}
                    onOpenFragment={(blockId) => onOpenFragment?.({ entityId: entity.id, blockId }) ?? false}
                    pageForBlock={pageForBlock}
                  />
                ) : null}

                {entity && nav.type === "appearances" ? (
                  <StoryAppearancesView
                    entity={entity}
                    appearances={appearances.filter((item) => item.entityId === entity.id)}
                    onBack={() => setNav({ type: "entity", id: entity.id })}
                    onOpenAppearance={onOpenAppearance}
                    pageForBlock={pageForBlock}
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
  adapter,
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
  onOpenHit,
  onCreateNamed,
}: {
  searchRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  onQuery: (value: string) => void;
  characters: StoryEntity[];
  elements: StoryEntity[];
  adapter: WriterContextAdapter;
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
  onOpenHit: (hit: SearchHit) => void;
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
    <nav className="writer-story-sidebar" aria-label={`Navegación de ${adapter.workspaceLabel}`}>
      <button
        type="button"
        className={`writer-story-brand${homeActive && !ideasActive ? " is-active" : ""}`}
        aria-label={`Inicio de ${adapter.workspaceLabel}`}
        onClick={onHome}
      >
        {adapter.workspaceLabel}
      </button>
      <input
        ref={searchRef}
        className="writer-story-search"
        aria-label={`Buscar en ${adapter.workspaceLabel}`}
        placeholder="Buscar…"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
      />

      {searching ? (
        <div className="writer-story-search-results" role="listbox" aria-label={`Resultados de ${adapter.workspaceLabel}`}>
          {hits.length === 0 ? <p className="writer-story-muted">Nada coincide.</p> : null}
          {hits.map((hit) => (
            <button
              key={hit.key}
              type="button"
              role="option"
              className="writer-story-hit"
              onClick={() => onOpenHit(hit)}
            >
              <span className="writer-story-hit-label">{hit.label}</span>
              <span className="writer-story-hit-snippet">{hit.snippet}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="writer-story-nav-scroll">
          {adapter.sidebar.includes("characters") ? (
            <StoryNavGroup title={adapter.primaryEntityPluralLabel} entities={characters} activeId={activeId} onOpen={onOpenEntity} />
          ) : null}
          {adapter.sidebar.includes("story") && adapter.storyElementLabel ? (
            <StoryNavGroup title={adapter.storyElementLabel} entities={elements} activeId={activeId} onOpen={onOpenEntity} />
          ) : null}
          {adapter.sidebar.includes("entities") ? (
            <StoryNavGroup title={adapter.primaryEntityPluralLabel} entities={elements} activeId={activeId} onOpen={onOpenEntity} />
          ) : null}
          {adapter.sidebar.includes("ideas") && (ideas > 0 || ideasActive) ? (
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
                    aria-label={adapter.creates.find((item) => item.group === draft)?.nameLabel ?? "Nombre"}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoFocus
                    placeholder={adapter.creates.find((item) => item.group === draft)?.nameLabel ?? "Nombre"}
                  />
                  <div className="writer-story-inline-actions">
                    <button type="button" onClick={() => { setDraft(null); setName(""); }}>Cancelar</button>
                    <button type="submit">Crear</button>
                  </div>
                </form>
              ) : (
                <>
                  {adapter.creates.map((item) => (
                    <button key={item.group} type="button" role="menuitem" onClick={() => setDraft(item.group)}>{item.menu}</button>
                  ))}
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

function pageSuffix(pageForBlock: ((blockId: string) => number | null) | undefined, blockId: string | null | undefined): string {
  const page = blockId ? pageForBlock?.(blockId) : null;
  return page ? ` · pág. ${page}` : "";
}

function StoryHome({
  adapter,
  snapshot,
  elements,
  pending,
  progress,
  notice,
  onUpdate,
  onOpenEntity,
  onOpenBlock,
  pageForBlock,
  onStructure,
  onOpenLocation,
  onOpenQuestions,
  onCreate,
  candidates,
  onAcceptCandidate,
  onDismissCandidate,
}: {
  adapter: WriterContextAdapter;
  snapshot: StorySnapshot;
  elements: StoryEntity[];
  pending: number;
  progress: { current: number; total: number } | null;
  notice: string | null;
  onUpdate?: () => void;
  onOpenEntity: (id: string) => void;
  onOpenBlock?: (blockId: string) => boolean;
  pageForBlock?: (blockId: string) => number | null;
  onStructure: () => void;
  onOpenLocation: (label: string) => void;
  onOpenQuestions: () => void;
  onCreate: (group: "character" | "story") => void;
  candidates: StoryThreadCandidate[];
  onAcceptCandidate: (id: string) => void;
  onDismissCandidate: (id: string) => void;
}) {
  const empty = snapshot.counts.units === 0 && snapshot.characterTotal === 0 && elements.length === 0 && candidates.length === 0;
  const structureTitle = snapshot.kind ? adapter.structureLabels[snapshot.kind] : "Estructura";
  return (
    <div className="writer-story-home">
      <h1>{adapter.workspaceLabel}</h1>
      {empty ? (
        <div className="writer-story-empty">
          <p>{adapter.emptyState}</p>
          <div className="writer-story-inline-actions">
            {adapter.creates.map((item) => (
              <button key={item.group} type="button" onClick={() => onCreate(item.group)}>{item.empty}</button>
            ))}
          </div>
          <StoryUpdateRow pending={pending} stale={Boolean(snapshot.brief?.stale)} progress={progress} notice={notice} onUpdate={onUpdate} />
        </div>
      ) : (
        <>
          {adapter.home.includes("brief") && snapshot.brief ? <p className="writer-story-brief">{snapshot.brief.text}</p> : null}
          {!snapshot.brief && snapshot.counts.units > 0 && (adapter.supports.trace || adapter.supports.narrativeQuestions) ? (
            <p className="writer-story-meta">Actualiza Story para generar el resumen narrativo.</p>
          ) : null}
          {snapshot.counts.units > 0 || snapshot.characterTotal > 0 ? (
            <p className="writer-story-meta">
              {snapshotCounts(snapshot)}
              {snapshot.nonlinear ? " · Narración no lineal" : ""}
            </p>
          ) : null}
          <StoryUpdateRow pending={pending} stale={Boolean(snapshot.brief?.stale)} progress={progress} notice={notice} onUpdate={onUpdate} />
          {adapter.supports.trace && snapshot.historyPreview.length > 0 ? (
            <section>
              <h2>Historia</h2>
              {snapshot.historyPreview.map((row) => (
                <button key={row.id} type="button" className="writer-story-plain-row" onClick={() => onOpenBlock?.(row.blockId)}>
                  <span>{row.label}{pageSuffix(pageForBlock, row.blockId)}</span>
                  <span className="writer-story-clamp">{row.text}</span>
                </button>
              ))}
              {snapshot.units.length > snapshot.historyPreview.length ? (
                <button type="button" className="writer-story-linkish" onClick={onStructure}>Ver estructura →</button>
              ) : null}
            </section>
          ) : null}
          {adapter.home.includes("structure") && snapshot.historyPreview.length === 0 && snapshot.unitPreview.length > 0 ? (
            <section>
              <h2>{structureTitle}</h2>
              {snapshot.unitPreview.map((unit) => (
                <button key={unit.id} type="button" className="writer-story-plain-row" onClick={() => onOpenBlock?.(unit.blockId)}>
                  <span>{String(unit.order).padStart(2, "0")} · {unit.title}{pageSuffix(pageForBlock, unit.blockId)}</span>
                  {unit.brief ? <span className="writer-story-clamp">{unit.brief}</span> : null}
                  {unit.cast.length > 0 ? <span className="writer-story-meta">{unit.cast.join(" · ")}</span> : null}
                </button>
              ))}
              {snapshot.units.length > snapshot.unitPreview.length ? (
                <button type="button" className="writer-story-linkish" onClick={onStructure}>Ver estructura →</button>
              ) : null}
            </section>
          ) : null}
          {adapter.home.includes("characters") && snapshot.characters.length > 0 ? (
            <section>
              <h2>{adapter.primaryEntityPluralLabel}</h2>
              {snapshot.characters.map((character) => (
                <button key={character.id} type="button" className="writer-story-plain-row" onClick={() => onOpenEntity(character.id)}>
                  <span>{character.title}</span>
                  {character.arc || character.brief ? <span className="writer-story-clamp">{character.arc ?? character.brief}</span> : null}
                  <span className="writer-story-meta">{characterMeta(character.appearances, character.scenes)} →</span>
                </button>
              ))}
            </section>
          ) : null}
          {adapter.supports.relations && snapshot.relationsPreview.length > 0 ? (
            <section>
              <h2>Relaciones</h2>
              {snapshot.relationsPreview.map((row) => (
                <p key={row.relationId} className="writer-story-plain-row">
                  <span>{row.title}</span>
                  <span className="writer-story-clamp">{row.text}</span>
                </p>
              ))}
              {snapshot.relationTotal > snapshot.relationsPreview.length ? (
                <p className="writer-story-meta">{snapshot.relationTotal - snapshot.relationsPreview.length} más</p>
              ) : null}
            </section>
          ) : null}
          {snapshot.revelationsPreview.length > 0 ? (
            <section>
              <h2>Revelaciones</h2>
              {snapshot.revelationsPreview.map((text) => (
                <p key={text}>{text}</p>
              ))}
            </section>
          ) : null}
          {adapter.home.includes("story") && adapter.storyElementLabel && elements.length > 0 ? (
            <section>
              <h2>{adapter.storyElementLabel}</h2>
              {elements.map((entity) => (
                <button key={entity.id} type="button" className="writer-story-plain-row" onClick={() => onOpenEntity(entity.id)}>
                  <span>{storyDisplayTitle(entity.label, "story")}</span>
                </button>
              ))}
            </section>
          ) : null}
          {adapter.home.includes("entities") && elements.length > 0 ? (
            <section>
              <h2>{adapter.primaryEntityPluralLabel}</h2>
              {elements.map((entity) => (
                <button key={entity.id} type="button" className="writer-story-plain-row" onClick={() => onOpenEntity(entity.id)}>
                  <span>{storyDisplayTitle(entity.label, "story")}</span>
                </button>
              ))}
            </section>
          ) : null}
        </>
      )}
      {adapter.home.includes("questions") && snapshot.openQuestions > 0 ? (
        <section>
          <h2>Pendientes</h2>
          {snapshot.questionPreview.map((item) => (
            <p key={item.id}>{item.text}</p>
          ))}
          <button type="button" className="writer-story-linkish" onClick={onOpenQuestions}>
            {snapshot.openQuestions === 1 ? "1 cabo abierto →" : `${snapshot.openQuestions} cabos abiertos →`}
          </button>
        </section>
      ) : null}
      {adapter.supports.locations && snapshot.locationPreview.length > 0 ? (
        <section>
          <h2>Localizaciones</h2>
          {snapshot.locationPreview.map((place) => (
            <button key={place.label} type="button" className="writer-story-plain-row" onClick={() => onOpenLocation(place.label)}>
              <span>{place.label}</span>
              <span className="writer-story-meta">
                {place.scenes === 1 ? "1 escena" : `${place.scenes} escenas`}
                {place.detail ? ` · ${place.detail}` : ""}
              </span>
            </button>
          ))}
          {snapshot.locations.length > snapshot.locationPreview.length ? (
            <p className="writer-story-meta">{snapshot.locations.length - snapshot.locationPreview.length} más</p>
          ) : null}
        </section>
      ) : null}
      {snapshot.secondaryNames.length > 0 ? (
        <p className="writer-story-meta">Otros personajes: {snapshot.secondaryNames.join(", ")}</p>
      ) : null}
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
  workspaceLabel,
  narrow,
  onBack,
  onOpenBlock,
  pageForBlock,
}: {
  snapshot: StorySnapshot;
  workspaceLabel: string;
  narrow: boolean;
  onBack?: () => void;
  onOpenBlock?: (blockId: string) => boolean;
  pageForBlock?: (blockId: string) => number | null;
}) {
  const title = snapshot.kind === "chapter" ? "Capítulos" : snapshot.kind === "section" ? "Secciones" : "Estructura";
  const [chrono, setChrono] = useState(false);
  const units = chrono
    ? [...snapshot.units].sort((a, b) => (a.chronologyOrder ?? 10_000) - (b.chronologyOrder ?? 10_000) || a.order - b.order)
    : snapshot.units;
  return (
    <div className="writer-story-subview">
      {narrow && onBack ? (
        <button type="button" className="writer-story-back" onClick={onBack}>← {workspaceLabel}</button>
      ) : null}
      <h1>{title}</h1>
      {snapshot.nonlinear ? <p className="writer-story-meta">Narración no lineal</p> : null}
      {snapshot.chronology ? (
        <div className="writer-story-inline-actions">
          <button type="button" aria-pressed={!chrono} onClick={() => setChrono(false)}>Orden del guion</button>
          <button type="button" aria-pressed={chrono} onClick={() => setChrono(true)}>Cronología</button>
        </div>
      ) : null}
      {units.map((unit) => (
        <button key={unit.id} type="button" className="writer-story-plain-row" onClick={() => onOpenBlock?.(unit.blockId)}>
          <span className="writer-story-meta">{snapshot.kind === "scene" ? `Escena ${unit.order}` : String(unit.order).padStart(2, "0")}{pageSuffix(pageForBlock, unit.blockId)}</span>
          <span>{unit.heading}</span>
          {unit.brief ? <span className="writer-story-clamp">{unit.brief}</span> : null}
          {unit.cast.length > 0 ? <span className="writer-story-meta">{unit.cast.join(" · ")}</span> : null}
        </button>
      ))}
    </div>
  );
}

function StoryLocationView({
  label,
  snapshot,
  workspaceLabel,
  narrow,
  onBack,
  onOpenBlock,
  pageForBlock,
  onCreate,
}: {
  label: string;
  snapshot: StorySnapshot;
  workspaceLabel: string;
  narrow: boolean;
  onBack?: () => void;
  onOpenBlock?: (blockId: string) => boolean;
  pageForBlock?: (blockId: string) => number | null;
  onCreate: () => void;
}) {
  const units = snapshot.units.filter((unit) => unit.locationLabel === label);
  return (
    <div className="writer-story-subview">
      {narrow && onBack ? (
        <button type="button" className="writer-story-back" onClick={onBack}>← {workspaceLabel}</button>
      ) : null}
      <h1>{label}</h1>
      {units.map((unit) => (
        <button key={unit.id} type="button" className="writer-story-plain-row" onClick={() => onOpenBlock?.(unit.blockId)}>
          <span>{unit.title}{pageSuffix(pageForBlock, unit.blockId)}</span>
          {unit.timeLabel ? <span className="writer-story-meta">{unit.timeLabel}</span> : null}
        </button>
      ))}
      <button type="button" onClick={onCreate}>Crear en Historia</button>
    </div>
  );
}

function snapshotCounts(snapshot: StorySnapshot): string {
  const parts: string[] = [];
  if (snapshot.counts.units > 0) {
    const noun = snapshot.kind === "chapter" ? (snapshot.counts.units === 1 ? "capítulo" : "capítulos") : snapshot.kind === "section" ? (snapshot.counts.units === 1 ? "sección" : "secciones") : (snapshot.counts.units === 1 ? "bloque de escena" : "bloques de escena");
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
  adapter,
  onOpenRelated,
  onAddRelation,
  units,
  onOpenBlock,
  onOpenAdvances,
  onOpenResolved,
  onAddQuestion,
  onEditQuestion,
  onResolveQuestion,
  onRemoveQuestion,
  pageForBlock,
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
  adapter: WriterContextAdapter;
  onOpenRelated: (id: string) => void;
  onAddRelation: (otherId: string, phrase: string) => void;
  units: StoryStructureUnit[];
  onOpenBlock?: (blockId: string) => boolean;
  onOpenAdvances: (id: string) => void;
  onOpenResolved: () => void;
  onAddQuestion: (text: string) => void;
  onEditQuestion: (id: string, text: string) => void;
  onResolveQuestion: (id: string) => void;
  onRemoveQuestion: (id: string) => void;
  pageForBlock?: (blockId: string) => number | null;
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
  const [relationsOpen, setRelationsOpen] = useState(false);
  const [addingQuestion, setAddingQuestion] = useState(false);
  const view = buildEntityPresentation(source, display, blocks, appearances, relations, liveHashes, adapter);
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
            ← {adapter.workspaceLabel}
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
                {adapter.supports.relations ? (
                  <button type="button" role="menuitem" onClick={() => { setLinking(true); setLinkQuery(""); setLinkPhrase(""); setMenuOpen(false); }}>Añadir relación</button>
                ) : null}
                {adapter.supports.narrativeQuestions ? (
                  <button type="button" role="menuitem" onClick={() => { setAddingQuestion(true); setMenuOpen(false); }}>Añadir pendiente</button>
                ) : null}
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
        {view.arcBrief || view.brief ? <p className="writer-story-brief">{(view.arcBrief ?? view.brief)?.text}</p> : null}
        {view.arcBrief?.stale || view.brief?.stale ? <p className="writer-story-meta">{untilUpdateLine(freshChanges)}</p> : null}
        <p className="writer-story-meta">
          {view.absent ? "Aún no aparece en el texto." : characterMeta(view.appearances, view.scenes)}
        </p>
        {!view.brief && view.firstAppearance ? (
          <p className="writer-story-meta">
            Primera aparición · {view.firstAppearance}
            {pageSuffix(pageForBlock, [...appearances].sort((a, b) => a.order - b.order).find((item) => item.scene)?.blockId)}
          </p>
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

      {(view.arcBrief && view.brief) || view.stateLines.length > 0 ? (
        <section>
          <h2>Ahora</h2>
          {view.arcBrief && view.brief ? <p>{view.brief.text}</p> : null}
          {view.stateLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </section>
      ) : null}

      {view.tracePreview.length > 0 ? (
        <section>
          <h2>Recorrido</h2>
          {view.tracePreview.map((row) => (
            <button key={row.id} type="button" className="writer-story-plain-row" onClick={() => row.blockId && onOpenBlock?.(row.blockId)}>
              <span>{row.text}</span>
            </button>
          ))}
          <button type="button" className="writer-story-linkish" onClick={onOpenTrace}>
            Ver recorrido →
          </button>
        </section>
      ) : view.trace ? (
        <section>
          <h2>Recorrido</h2>
          <p>{view.trace}</p>
          <button type="button" className="writer-story-linkish" onClick={onOpenTrace}>
            Ver recorrido →
          </button>
        </section>
      ) : null}

      {adapter.supports.relations && (relations.length > 0 || linking) ? (
        <section>
          <div className="writer-story-section-head">
            <h2>Relaciones</h2>
            <button type="button" className="writer-story-linkish" onClick={() => { setLinking(true); setLinkQuery(""); setLinkPhrase(""); }}>+ Añadir</button>
          </div>
          {(relationsOpen ? relations : relations.slice(0, 5)).map((row) => (
            <button key={row.relationId} type="button" className="writer-story-relation-row" onClick={() => onOpenRelated(row.otherId)}>
              <span>{row.otherLabel}</span>
              <span className="writer-story-muted">{row.phrase}</span>
            </button>
          ))}
          {relations.length > 5 && !relationsOpen ? (
            <button type="button" className="writer-story-linkish" onClick={() => setRelationsOpen(true)}>Ver todas →</button>
          ) : null}
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

      {adapter.supports.narrativeQuestions && (view.openQuestions.length > 0 || view.resolvedQuestions > 0 || addingQuestion) ? (
        <StoryPendingSection
          questions={view.openQuestions}
          resolved={view.resolvedQuestions}
          blocks={blocks}
          units={units}
          source={source}
          adding={addingQuestion}
          onAdding={setAddingQuestion}
          onAdd={onAddQuestion}
          onEdit={onEditQuestion}
          onResolve={onResolveQuestion}
          onRemove={onRemoveQuestion}
          onOpenAdvances={onOpenAdvances}
          onOpenResolved={onOpenResolved}
          onOpenBlock={onOpenBlock}
        />
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

function StoryPendingSection({
  questions,
  resolved,
  blocks,
  units,
  source,
  adding,
  onAdding,
  onAdd,
  onEdit,
  onResolve,
  onRemove,
  onOpenAdvances,
  onOpenResolved,
  onOpenBlock,
}: {
  questions: { id: string; text: string; introducedOrder: number | null; lastAdvancedOrder: number | null; source: "author" | "text" }[];
  resolved: number;
  blocks: StoryDocumentBlock[];
  units: StoryStructureUnit[];
  source: WriterStory;
  adding: boolean;
  onAdding: (value: boolean) => void;
  onAdd: (text: string) => void;
  onEdit: (id: string, text: string) => void;
  onResolve: (id: string) => void;
  onRemove: (id: string) => void;
  onOpenAdvances: (id: string) => void;
  onOpenResolved: () => void;
  onOpenBlock?: (blockId: string) => boolean;
}) {
  const [draft, setDraft] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const heading = questions.length === 1 ? "Pendiente" : "Pendientes";
  const place = (order: number | null) => questionPlace(order, blocks, units);
  const originOf = (id: string) => {
    const raw = source.questions?.find((item) => item.id === id);
    return raw?.events.find((event) => event.sourceBlockIds.length > 0)?.sourceBlockIds[0] ?? null;
  };

  return (
    <section>
      <div className="writer-story-section-head">
        <h2>{heading}</h2>
        <button type="button" className="writer-story-linkish" onClick={() => { onAdding(true); setDraft(""); }}>+ Añadir</button>
      </div>
      {questions.map((question) => {
        const introduced = place(question.introducedOrder);
        const advanced = place(question.lastAdvancedOrder);
        const showAdvance = advanced && question.lastAdvancedOrder !== question.introducedOrder;
        if (editingId === question.id) {
          return (
            <form
              key={question.id}
              className="writer-story-composer"
              onSubmit={(event) => {
                event.preventDefault();
                onEdit(question.id, editText);
                setEditingId(null);
              }}
            >
              <textarea aria-label="Editar pendiente" value={editText} onChange={(event) => setEditText(event.target.value)} />
              <div className="writer-story-inline-actions">
                <button type="button" onClick={() => setEditingId(null)}>Cancelar</button>
                <button type="submit">Guardar</button>
              </div>
            </form>
          );
        }
        return (
          <div key={question.id} className="writer-story-relation-row">
            <div>
              <p>{question.text}</p>
              {introduced ? <p className="writer-story-meta">Introducido · {introduced}</p> : null}
              {showAdvance ? <p className="writer-story-meta">Último avance · {advanced}</p> : null}
            </div>
            <div className="writer-story-menu-wrap">
              <button type="button" className="writer-story-icon-btn" aria-label={`Opciones de ${question.text}`} aria-expanded={menuId === question.id} onClick={() => setMenuId((current) => (current === question.id ? null : question.id))}>
                ···
              </button>
              {menuId === question.id ? (
                <div className="writer-story-popover writer-story-menu" role="menu">
                  {question.source === "text" ? (
                    <>
                      {originOf(question.id) ? (
                        <button type="button" role="menuitem" onClick={() => { const blockId = originOf(question.id); if (blockId) onOpenBlock?.(blockId); setMenuId(null); }}>Ir al origen</button>
                      ) : null}
                      <button type="button" role="menuitem" onClick={() => { onOpenAdvances(question.id); setMenuId(null); }}>Ver avances</button>
                    </>
                  ) : (
                    <>
                      <button type="button" role="menuitem" onClick={() => { setEditingId(question.id); setEditText(question.text); setMenuId(null); }}>Editar</button>
                      <button type="button" role="menuitem" onClick={() => { onResolve(question.id); setMenuId(null); }}>Marcar resuelta</button>
                      <button type="button" role="menuitem" className="is-danger" onClick={() => { onRemove(question.id); setMenuId(null); }}>Eliminar</button>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
      {adding ? (
        <form
          className="writer-story-composer"
          onSubmit={(event) => {
            event.preventDefault();
            onAdd(draft);
            setDraft("");
            onAdding(false);
          }}
        >
          <textarea aria-label="Nuevo pendiente" value={draft} placeholder="¿Qué sigue abierto?" onChange={(event) => setDraft(event.target.value)} autoFocus />
          <div className="writer-story-inline-actions">
            <button type="button" onClick={() => onAdding(false)}>Cancelar</button>
            <button type="submit">Guardar</button>
          </div>
        </form>
      ) : null}
      {resolved > 0 ? (
        <button type="button" className="writer-story-linkish" onClick={onOpenResolved}>
          {resolved === 1 ? "1 resuelta →" : `${resolved} resueltas →`}
        </button>
      ) : null}
    </section>
  );
}

function StoryQuestionsView({
  questions,
  entities,
  blocks,
  units,
  narrow,
  workspaceLabel,
  onBack,
  onOpenEntity,
  onOpenAdvances,
}: {
  questions: ProjectedQuestion[];
  entities: StoryEntity[];
  blocks: StoryDocumentBlock[];
  units: StoryStructureUnit[];
  narrow: boolean;
  workspaceLabel: string;
  onBack?: () => void;
  onOpenEntity: (id: string) => void;
  onOpenAdvances: (id: string, entityId: string | null) => void;
}) {
  const groups: { id: string; label: string; questions: ProjectedQuestion[] }[] = [];
  for (const question of questions) {
    const entity = question.relatedEntityIds.map((id) => entities.find((item) => item.id === id)).find((item) => item != null) ?? null;
    const id = entity?.id ?? "";
    let group = groups.find((item) => item.id === id);
    if (!group) {
      group = { id, label: entity ? storyDisplayTitle(entity.label, entity.group).toLocaleUpperCase("es") : "", questions: [] };
      groups.push(group);
    }
    group.questions.push(question);
  }
  groups.sort((left, right) => {
    const a = entities.findIndex((item) => item.id === left.id);
    const b = entities.findIndex((item) => item.id === right.id);
    return (a < 0 ? 999 : a) - (b < 0 ? 999 : b);
  });
  return (
    <div className="writer-story-subview">
      {narrow && onBack ? <button type="button" className="writer-story-back" onClick={onBack}>← {workspaceLabel}</button> : null}
      <h1>Pendientes</h1>
      {groups.map((group) => (
        <section key={group.id || "none"}>
          {group.id ? (
            <button type="button" className="writer-story-linkish" onClick={() => onOpenEntity(group.id)}>{group.label}</button>
          ) : null}
          {group.questions.map((question) => {
            const advanced = questionPlace(question.lastAdvancedOrder, blocks, units);
            return (
              <button key={question.id} type="button" className="writer-story-plain-row" onClick={() => onOpenAdvances(question.id, group.id || null)}>
                <span>{question.text}</span>
                {advanced ? <span className="writer-story-meta">Último avance · {advanced}</span> : null}
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function StoryAdvancesView({
  questionId,
  story,
  entities,
  blocks,
  units,
  liveHashes,
  narrow,
  onBack,
  onOpenBlock,
  onOpenEntity,
}: {
  questionId: string;
  story: WriterStory;
  entities: StoryEntity[];
  blocks: StoryDocumentBlock[];
  units: StoryStructureUnit[];
  liveHashes: Map<string, string>;
  narrow: boolean;
  onBack: () => void;
  onOpenBlock?: (blockId: string) => boolean;
  onOpenEntity: (id: string) => void;
}) {
  const raw = story.questions?.find((item) => item.id === questionId) ?? null;
  const projected = raw ? questionIndex([raw], liveHashes).open[0] ?? questionIndex([raw], liveHashes).resolved[0] ?? null : null;
  const primary = entities.find((item) => projected?.relatedEntityIds.includes(item.id));
  const steps = projected?.events ?? [];
  return (
    <div className="writer-story-subview">
      <button type="button" className="writer-story-back" onClick={onBack}>← {primary ? storyDisplayTitle(primary.label, primary.group) : "Pendientes"}</button>
      {primary && !narrow ? (
        <button type="button" className="writer-story-linkish" onClick={() => onOpenEntity(primary.id)}>{storyDisplayTitle(primary.label, primary.group)}</button>
      ) : null}
      <h1>{projected?.text ?? "Pendiente"}</h1>
      {steps.map((event) => {
        const where = questionPlace(event.documentOrder, blocks, units);
        const note = event.text && event.text !== projected?.text && event.text !== event.kind ? event.text : event.kind === "introduced" ? "Introducido" : event.kind === "resolved" ? "Resuelto" : event.kind === "reopened" ? "Reabierto" : "Avance";
        const blockId = event.sourceBlockIds[0];
        return (
          <div key={event.id} className="writer-story-plain-row">
            {where ? <p className="writer-story-meta">{where}</p> : null}
            <p>{note}</p>
            {blockId ? (
              <button type="button" className="writer-story-linkish" onClick={() => onOpenBlock?.(blockId)}>Ir al texto</button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function StoryResolvedView({
  entity,
  story,
  liveHashes,
  narrow,
  onBack,
  onReopen,
  onRemove,
}: {
  entity: StoryEntity;
  story: WriterStory;
  liveHashes: Map<string, string>;
  narrow: boolean;
  onBack: () => void;
  onReopen: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const resolved = (questionIndex(story.questions ?? [], liveHashes).byEntity.get(entity.id) ?? []).filter((item) => item.status === "resolved");
  return (
    <div className="writer-story-subview">
      {narrow ? <button type="button" className="writer-story-back" onClick={onBack}>← {storyDisplayTitle(entity.label, entity.group)}</button> : (
        <button type="button" className="writer-story-back" onClick={onBack}>← {storyDisplayTitle(entity.label, entity.group)}</button>
      )}
      <h1>Resueltas</h1>
      {resolved.map((question) => (
        <div key={question.id} className="writer-story-relation-row">
          <p>{question.text}</p>
          <div className="writer-story-inline-actions">
            <button type="button" onClick={() => onReopen(question.id)}>Reabrir</button>
            {question.source === "author" ? (
              <button type="button" className="is-danger" onClick={() => onRemove(question.id)}>Eliminar</button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
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
  pageForBlock,
}: {
  entity: StoryEntity;
  display: StoryEntity;
  onBack: () => void;
  onOpenFragment: (blockId: string) => boolean;
  pageForBlock?: (blockId: string) => number | null;
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
            {item.chapterLabel || pageSuffix(pageForBlock, item.sourceBlockIds[0]) ? (
              <span className="writer-story-list-meta">{[item.chapterLabel, pageSuffix(pageForBlock, item.sourceBlockIds[0]).replace(/^ · /, "")].filter(Boolean).join(" · ")}</span>
            ) : null}
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
  pageForBlock,
}: {
  entity: StoryEntity;
  appearances: StoryAppearance[];
  onBack: () => void;
  onOpenAppearance?: (appearance: StoryAppearance) => boolean;
  pageForBlock?: (blockId: string) => number | null;
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
              {[item.chapterLabel, item.scene, pageSuffix(pageForBlock, item.blockId).replace(/^ · /, "")].filter(Boolean).join(" · ")}
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
  looseLabel,
  workspaceLabel,
  narrow,
  onBack,
  onOpenEntity,
  onStory,
}: {
  story: WriterStory;
  looseLabel: string;
  workspaceLabel: string;
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
      items.push({ id: note.id, text: note.text, entityId: null, label: looseLabel, idea: note.idea });
    }
    const needle = fold(query);
    return items
      .filter((item) => !needle || fold(item.text).includes(needle) || fold(item.label).includes(needle))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [story, query, looseLabel]);

  return (
    <div className="writer-story-subview">
      {narrow && onBack ? (
        <button type="button" className="writer-story-back" onClick={onBack}>
          ← {workspaceLabel}
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

function searchStory(
  story: WriterStory,
  appearances: StoryAppearance[],
  query: string,
  visibleIds: Set<string>,
  pending: ProjectedQuestion[],
  looseLabel = "Historia",
): SearchHit[] {
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
      label: note.status === "tentative" ? "Idea" : looseLabel,
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
  for (const question of pending) {
    const names = question.relatedEntityIds.flatMap((id) => {
      const entity = story.entities.find((row) => row.id === id);
      return entity ? [entity.label] : [];
    });
    if (!fold(`${question.text}\n${names.join("\n")}`).includes(needle)) continue;
    const entity = story.entities.find((row) => question.relatedEntityIds.includes(row.id) && visibleIds.has(row.id) && row.id === question.relatedEntityIds.find((id) => visibleIds.has(id)));
    hits.push({
      key: `pending:${question.id}`,
      kind: "pending",
      entityId: entity?.id ?? null,
      label: "Pendiente",
      snippet: question.text,
    });
  }
  return hits.slice(0, 24);
}

function fold(value: string): string {
  return value.toLocaleLowerCase("es").normalize("NFD").replace(/\p{M}/gu, "");
}
