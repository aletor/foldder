"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { Mapping } from "@tiptap/pm/transform";
import { StudioNodePortal } from "../studio-node/studio-node-architecture";
import { WriterBlockId, assignMissingWriterBlockIds, locateWriterBlock } from "./writer-block-id";
import { buildWriterContextPackage, searchWriterMemory } from "./writer-retrieval";
import { writerMemoryIndex, writerMemoryPage, writerMemoryShelf, type WriterMemoryFocus } from "./writer-browser";
import { WriterChapter, WriterChapterTitle } from "./writer-chapter";
import { WriterPagination, type WriterPaginationStorage } from "./writer-pagination-plugin";
import {
  getCurrentPage,
  getPageForBlock,
  getPositionForPage,
  writerContentHeight,
  writerGapHeight,
  writerLayoutHash,
  writerPaginationBox,
  WRITER_PAGE_GAP,
  type PageMap,
} from "./writer-pagination";
import { fetchWriterDocument, putWriterDocument } from "./writer-document-client";
import { type WriterMemoryEntry, type WriterMemoryScope } from "./writer-memory";
import { StoryView } from "./StoryView";
import { getWriterContextAdapter, writerResolvedView } from "./writer-context";
import { characterLinkFixes, locateStoryAppearance, writerAppearances, writerDocumentBlocks, type StoryAppearance } from "./writer-appearances";
import {
  absorbDocumentCues,
  addStoryIdea,
  captureWriterWritePlace,
  emptyWriterStory,
  projectWriterMemory,
  rememberStoryNote,
  removeStoryNote,
  restoreWriterWritePlace,
  updateStoryNote,
  type WriterStory,
  type WriterWritePlace,
} from "./writer-story";
import { writerAssignMemorySubject, writerEntitiesInDocument, writerEntityLabel, type WriterEntity } from "./writer-entities";
import { writerBlockMarks, type WriterConflict } from "./writer-continuity";
import { WriterSignals } from "./writer-signals";
import { buildStoryAsk, storyAskContext, type StoryAskOutcome, type StoryAskScope, type StoryAskTurn } from "./writer-ask-story";
import type { StoryConversation } from "./writer-conversation";
import { applyStoryDelta, projectStory } from "./writer-story-delta";
import { buildGlobalStoryDigest } from "./writer-presentation";
import { executeStoryUpdate, planStoryUpdate, storyUpdatePreview } from "./writer-story-update";
import { requestWriterAskStory, requestWriterAssist, requestWriterStoryUpdate } from "./writer-ai-client";
import {
  insertWriterAiProposal,
  mapWriterAiProposal,
  writerAiProposalIsCurrent,
  writerAiRequestFromEditor,
  type WriterAiProposal,
} from "./writer-ai-edit";
import type { WriterAiAction, WriterAiIntent } from "./writer-ai";
import { writerBlockPalette, writerDocumentHasOutline, writerSlashAt, writerSlashMatches, type WriterBlockCommand } from "./writer-block-palette";
import { writerRewriteRequest, writerSelectionOffer } from "./writer-selection-menu";
import {
  WRITER_SCREENPLAY_BLOCKS,
  WriterScreenplayKeys,
  createWriterStarterKit,
  isWriterScreenplayBlock,
  writerScreenplayNodes,
} from "./writer-screenplay";
import {
  WRITER_PAGE_PRESETS,
  WRITER_PAGE_PRESET_LABELS,
  WRITER_PROFILE_LABELS,
  WRITER_PROFILES,
  emptyWriterContent,
  normalizeWriterNodeData,
  wordCountFromWriterContent,
  writerChapterMap,
  writerNeedsRemoteLoad,
  writerPageMetrics,
  writerPersistedPatch,
  type WriterChapterEntry,
  type WriterDocumentContent,
  type WriterNodeData,
  type WriterPagePreset,
  type WriterPersistedPatch,
  type WriterProfile,
} from "./writer-document";

const SAVE_DELAY_MS = 400;

type WriterStudioProps = {
  data: unknown;
  onChange: (patch: WriterPersistedPatch) => void;
  onClose: () => void;
  brandSnippet?: string;
};

type SaveState = "saved" | "saving" | "error";

function styleValue(editor: Editor | null): string {
  if (!editor) return "paragraph";
  for (const block of WRITER_SCREENPLAY_BLOCKS) {
    if (editor.isActive(block)) return block;
  }
  if (editor.isActive("chapterTitle")) return "chapter";
  if (editor.isActive("blockquote")) return "blockquote";
  if (editor.isActive("bulletList")) return "bulletList";
  if (editor.isActive("heading", { level: 1 })) return "heading-1";
  if (editor.isActive("heading", { level: 2 })) return "heading-2";
  if (editor.isActive("heading", { level: 3 })) return "heading-3";
  return "paragraph";
}

function allowsInlineFormat(editor: Editor): boolean {
  const mark = editor.schema.marks.bold;
  return Boolean(mark && editor.state.selection.$from.parent.type.allowsMarkType(mark));
}

const WRITER_BLOCK_PLACEHOLDERS: Record<string, string> = {
  chapterTitle: "Título del capítulo",
  sceneHeading: "INT. LUGAR - DÍA",
  action: "Acción",
  character: "Personaje",
  dialogue: "Diálogo",
  parenthetical: "acotación",
  transition: "CORTE A:",
};

function isBlankParagraphDocument(content: WriterDocumentContent): boolean {
  const blocks = content.content ?? [];
  if (blocks.length !== 1) return false;
  const block = blocks[0];
  return block?.type === "paragraph" && !(block.content && block.content.length > 0);
}

function contentSignature(content: WriterDocumentContent): string {
  return JSON.stringify(content);
}

function blockPosFromTarget(editor: Editor, target: EventTarget | null): number | null {
  if (!(target instanceof Element)) return null;
  const block = target.closest("[data-writer-block]");
  const id = block?.getAttribute("data-writer-block");
  if (!id) return null;
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found != null) return false;
    if (node.attrs.blockId === id) found = pos + 1;
  });
  return found;
}

function readPoint(editor: Editor, pos: number): { top: number; left: number } | null {
  try {
    const coords = editor.view.coordsAtPos(pos);
    return { top: coords.top, left: coords.left };
  } catch {
    return null;
  }
}

function readSelectionBox(editor: Editor): { top: number; left: number } | null {
  if (editor.state.selection.empty) return null;
  try {
    const start = editor.view.coordsAtPos(editor.state.selection.from);
    const end = editor.view.coordsAtPos(editor.state.selection.to);
    return { top: Math.min(start.top, end.top), left: (start.left + end.left) / 2 };
  } catch {
    return null;
  }
}

function focusWriterChapter(id: string) {
  document.querySelector(`[data-chapter-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "start" });
}

function writerPageStyle(preset: WriterPagePreset, profile: WriterProfile, paged: boolean): React.CSSProperties {
  if (paged) {
    const box = writerPaginationBox(preset);
    return {
      "--writer-page-width": `${box.width}px`,
      "--writer-page-height": `${box.height}px`,
      "--writer-page-gap": `${WRITER_PAGE_GAP}px`,
      "--writer-page-min-height": "0px",
      "--writer-page-padding": `${box.padTop}px ${box.padRight}px ${box.padBottom}px ${box.padLeft}px`,
    } as React.CSSProperties;
  }
  const metrics = writerPageMetrics(preset, profile);
  return {
    "--writer-page-width": metrics.width,
    "--writer-page-min-height": metrics.minHeight,
    "--writer-page-padding": metrics.padding,
  } as React.CSSProperties;
}

function sceneNumberAt(editor: Editor, pos: number): number | null {
  let count = 0;
  editor.state.doc.descendants((node, nodePos) => {
    if (node.type.name === "sceneHeading" && nodePos <= pos) count += 1;
  });
  return count > 0 ? count : null;
}

export function WriterStudio({ data, onChange, onClose, brandSnippet = "" }: WriterStudioProps) {
  const initial = normalizeWriterNodeData(data);
  const needsRemote = writerNeedsRemoteLoad(initial);
  const [loaded, setLoaded] = useState<{ content: WriterDocumentContent; story: WriterStory; dismissals: string[] } | null>(
    needsRemote
      ? null
      : { content: initial.content ?? emptyWriterContent(), story: initial.story ?? emptyWriterStory(), dismissals: [] },
  );
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!needsRemote || !initial.documentId) return;
    let cancelled = false;
    fetchWriterDocument(initial.documentId)
      .then((file) => {
        if (!cancelled) setLoaded(file);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "No se ha podido abrir el documento");
      });
    return () => {
      cancelled = true;
    };
  }, [initial.documentId, needsRemote]);

  if (loadError) {
    return (
      <StudioNodePortal>
        <WriterStudioFrame title={initial.title} profile={initial.profile} wordCount={initial.wordCount} saveLabel={loadError} saveError onClose={onClose}>
          <p className="writer-studio-message">{loadError}</p>
          <style>{WRITER_STUDIO_CSS}</style>
        </WriterStudioFrame>
      </StudioNodePortal>
    );
  }

  if (!loaded) {
    return (
      <StudioNodePortal>
        <WriterStudioFrame title={initial.title} profile={initial.profile} wordCount={initial.wordCount} saveLabel="Abriendo el documento…" onClose={onClose}>
          <p className="writer-studio-message">Abriendo el documento…</p>
          <style>{WRITER_STUDIO_CSS}</style>
        </WriterStudioFrame>
      </StudioNodePortal>
    );
  }

  return (
    <WriterEditor
      seed={loaded.content}
      storySeed={loaded.story}
      dismissalsSeed={loaded.dismissals}
      initial={initial}
      brandSnippet={brandSnippet}
      onChange={onChange}
      onClose={onClose}
    />
  );
}

function WriterEditor({
  seed,
  storySeed,
  dismissalsSeed,
  initial,
  brandSnippet,
  onChange,
  onClose,
}: {
  seed: WriterDocumentContent;
  storySeed: WriterStory;
  dismissalsSeed: string[];
  initial: WriterNodeData;
  brandSnippet: string;
  onChange: (patch: WriterPersistedPatch) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [profile, setProfile] = useState<WriterProfile>(initial.profile);
  const [pagePreset, setPagePreset] = useState<WriterPagePreset>(initial.pagePreset);
  const [viewMode, setViewMode] = useState(initial.viewMode);
  const [sessionContinuous, setSessionContinuous] = useState(false);
  const [pageMap, setPageMap] = useState<PageMap | null>(null);
  const [zoomChoice, setZoomChoice] = useState<"80" | "100" | "120" | "fit">("100");
  const [fitScale, setFitScale] = useState(1);
  const [goToOpen, setGoToOpen] = useState(false);
  const [goToDraft, setGoToDraft] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [wordCount, setWordCount] = useState(initial.wordCount);
  const [styleTick, setStyleTick] = useState(0);
  const [mapOpen, setMapOpen] = useState(false);
  const [chapters, setChapters] = useState<WriterChapterEntry[]>(() => writerChapterMap(seed));
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPhase, setAiPhase] = useState<"idle" | "running" | "ready" | "error">("idle");
  const [aiError, setAiError] = useState("");
  const [aiProposal, setAiProposal] = useState<WriterAiProposal | null>(null);
  const [aiCompare, setAiCompare] = useState(false);
  const [aiStale, setAiStale] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [browserFocus, setBrowserFocus] = useState<WriterMemoryFocus>({ type: "index" });
  const [pinnedMemoryId, setPinnedMemoryId] = useState<string | null>(null);
  const [story, setStory] = useState<WriterStory>(storySeed);
  const [storyOpen, setStoryOpen] = useState(false);
  const [storyProgress, setStoryProgress] = useState<{ current: number; total: number } | null>(null);
  const [storyNotice, setStoryNotice] = useState<string | null>(null);
  useEffect(() => {
    if (storyNotice !== "Story actualizado") return;
    const timer = window.setTimeout(() => setStoryNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [storyNotice]);
  const [dismissals, setDismissals] = useState<string[]>(dismissalsSeed);
  const [memoryQuery, setMemoryQuery] = useState("");
  const [memoryMenu, setMemoryMenu] = useState<string | null>(null);
  const [editingMemory, setEditingMemory] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerTitle, setComposerTitle] = useState("Contexto");
  const [composerText, setComposerText] = useState("");
  const [composerScope, setComposerScope] = useState<WriterMemoryScope>({ type: "global" });
  const [composerAskScope, setComposerAskScope] = useState(false);
  const [composerBox, setComposerBox] = useState<{ top: number; left: number } | null>(null);
  const [composerEntity, setComposerEntity] = useState<string | null>(null);
  const [blockHandle, setBlockHandle] = useState<{ top: number; left: number; pos: number } | null>(null);
  const [blockMenu, setBlockMenu] = useState<{ top: number; left: number; pos: number } | null>(null);
  const [inlineSurface, setInlineSurface] = useState(false);
  const [cursorBox, setCursorBox] = useState<{ top: number; left: number } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ top: number; left: number } | null>(null);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashBox, setSlashBox] = useState<{ top: number; left: number } | null>(null);
  const [openConflict, setOpenConflict] = useState<WriterConflict | null>(null);
  const [conflictBox, setConflictBox] = useState<{ top: number; left: number } | null>(null);
  const [contextMark, setContextMark] = useState<ReturnType<typeof writerBlockMarks>[number] | null>(null);
  const [contextBox, setContextBox] = useState<{ top: number; left: number } | null>(null);
  const conflictRef = useRef<HTMLDivElement | null>(null);
  const contextRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef(title);
  const profileRef = useRef(profile);
  const pagePresetRef = useRef(pagePreset);
  const viewModeRef = useRef(viewMode);
  const timerRef = useRef<number | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const onChangeRef = useRef(onChange);
  const documentIdRef = useRef(initial.documentId);
  const documentKeyRef = useRef(initial.documentKey);
  const savedContentRef = useRef(contentSignature(seed));
  const savedTitleRef = useRef(initial.title);
  const savedProfileRef = useRef(initial.profile);
  const savedPagePresetRef = useRef(initial.pagePreset);
  const savedViewModeRef = useRef(initial.viewMode);
  const pageMapRef = useRef<PageMap | null>(null);
  const savedBundleRef = useRef(JSON.stringify({ story: storySeed, dismissals: dismissalsSeed }));
  const storyRef = useRef(storySeed);
  const memoryRef = useRef<WriterMemoryEntry[]>([]);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const writePlace = useRef<WriterWritePlace | null>(null);
  const dismissalsRef = useRef(dismissals);
  const readyRef = useRef(false);
  const runningRef = useRef(false);
  const queuedRef = useRef(false);
  const recoverRef = useRef(initial.content != null);
  const aiFlight = useRef(false);
  const aiMapping = useRef<Mapping | null>(null);
  const aiAction = useRef<WriterAiAction>("continue");
  const aiIntent = useRef<WriterAiIntent | undefined>(undefined);
  const inlineSurfaceRef = useRef(false);
  const selectionEpoch = useRef(0);
  const selectionRange = useRef("");
  const slashDismissed = useRef<string | null>(null);
  const slashQueryRef = useRef<string | null>(null);
  const slashIndexRef = useRef(0);
  const slashItemsRef = useRef<WriterBlockCommand[]>([]);
  const applySlashRef = useRef<(command: WriterBlockCommand) => void>(() => {});
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLFormElement | null>(null);
  const blockHandleRef = useRef<HTMLButtonElement | null>(null);
  const blockMenuRef = useRef<HTMLDivElement | null>(null);
  const blockHover = useRef<number | null>(null);
  const syncBlockHandleRef = useRef<(inside: number | null) => void>(() => {});
  const askRef = useRef<(action: WriterAiAction, options?: { inline?: boolean; intent?: WriterAiIntent; replace?: boolean }) => void>(() => {});
  const composerOpenRef = useRef(false);
  const openComposerRef = useRef<(current: Editor) => void>(() => {});
  titleRef.current = title;
  profileRef.current = profile;
  pagePresetRef.current = pagePreset;
  viewModeRef.current = viewMode;
  storyRef.current = story;
  dismissalsRef.current = dismissals;
  onChangeRef.current = onChange;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      createWriterStarterKit(),
      WriterPagination,
      WriterBlockId,
      WriterSignals,
      WriterChapter,
      WriterChapterTitle,
      ...writerScreenplayNodes,
      WriterScreenplayKeys,
      Placeholder.configure({
        placeholder: ({ node }) => WRITER_BLOCK_PLACEHOLDERS[node.type.name] ?? "Empieza a escribir…",
      }),
    ],
    content:
      profileRef.current === "screenplay" && isBlankParagraphDocument(seed)
        ? { type: "doc", content: [{ type: "sceneHeading" }] }
        : seed,
    onCreate: ({ editor: created }) => {
      created.storage.writerScreenplayKeys.enabled = profileRef.current === "screenplay";
      queueMicrotask(() => {
        if (created.isDestroyed) return;
        const tr = created.state.tr;
        if (!assignMissingWriterBlockIds(created.state.doc, tr)) return;
        created.view.dispatch(tr);
      });
    },
    editorProps: {
      attributes: {
        class: "writer-sheet-editor",
        spellcheck: "true",
      },
    },
  });
  editorRef.current = editor;

  const persist = useCallback(async (): Promise<boolean> => {
    const current = editorRef.current;
    if (!current || !readyRef.current) return true;
    const content = current.getJSON();
    const nextTitle = titleRef.current;
    const nextProfile = profileRef.current;
    const nextPagePreset = pagePresetRef.current;
    const nextViewMode = viewModeRef.current;
    const bodyChanged = contentSignature(content) !== savedContentRef.current;
    const projected = projectWriterMemory(storyRef.current, writerEntitiesInDocument(current.state.doc).map((entity) => entity.id));
    memoryRef.current = projected;
    const bundle = JSON.stringify({ story: storyRef.current, dismissals: dismissalsRef.current });
    const memoryChanged = bundle !== savedBundleRef.current;
    const metaChanged =
      nextTitle !== savedTitleRef.current ||
      nextProfile !== savedProfileRef.current ||
      nextPagePreset !== savedPagePresetRef.current ||
      nextViewMode !== savedViewModeRef.current;
    if (!bodyChanged && !memoryChanged && !metaChanged) return true;

    const patchInput = {
      title: nextTitle,
      profile: nextProfile,
      pagePreset: nextPagePreset,
      viewMode: nextViewMode,
      content,
      memory: projected,
      story: storyRef.current,
      documentId: documentIdRef.current ?? "",
      documentKey: documentKeyRef.current,
    };

    if (!bodyChanged && !memoryChanged && !recoverRef.current) {
      onChangeRef.current(writerPersistedPatch({ ...patchInput, keepContent: false }));
      savedTitleRef.current = nextTitle;
      savedProfileRef.current = nextProfile;
      savedPagePresetRef.current = nextPagePreset;
      savedViewModeRef.current = nextViewMode;
      setSaveState("saved");
      return true;
    }

    const documentId = documentIdRef.current ?? crypto.randomUUID();
    setSaveState("saving");
    try {
      const saved = await putWriterDocument(documentId, content, storyRef.current, dismissalsRef.current);
      documentIdRef.current = documentId;
      documentKeyRef.current = saved.documentKey;
      savedContentRef.current = contentSignature(content);
      savedBundleRef.current = JSON.stringify({ story: storyRef.current, dismissals: dismissalsRef.current });
      savedTitleRef.current = nextTitle;
      savedProfileRef.current = nextProfile;
      savedPagePresetRef.current = nextPagePreset;
      savedViewModeRef.current = nextViewMode;
      recoverRef.current = false;
      const patch = writerPersistedPatch({
        ...patchInput,
        documentId,
        documentKey: saved.documentKey,
        keepContent: false,
      });
      onChangeRef.current(patch);
      setWordCount(patch.wordCount);
      setSaveState("saved");
      return true;
    } catch {
      onChangeRef.current(
        writerPersistedPatch({
          ...patchInput,
          documentId,
          keepContent: true,
        }),
      );
      setSaveState("error");
      return false;
    }
  }, []);

  const flush = useCallback(async (): Promise<boolean> => {
    if (runningRef.current) {
      queuedRef.current = true;
      return false;
    }
    runningRef.current = true;
    let ok = true;
    try {
      do {
        queuedRef.current = false;
        ok = await persist();
      } while (queuedRef.current && ok);
    } finally {
      runningRef.current = false;
    }
    return ok;
  }, [persist]);

  const schedule = useCallback(() => {
    if (!readyRef.current || !editorRef.current) return;
    setWordCount(wordCountFromWriterContent(editorRef.current.getJSON()));
    setSaveState("saving");
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void flush();
    }, SAVE_DELAY_MS);
  }, [flush]);

  useEffect(() => {
    if (!editor) return;
    readyRef.current = true;
    if (recoverRef.current) {
      savedContentRef.current = "";
      void flush();
      return;
    }
    savedContentRef.current = contentSignature(editor.getJSON());
    if (JSON.stringify({ story: storyRef.current, dismissals: dismissalsRef.current }) !== savedBundleRef.current) void flush();
  }, [editor, flush]);

  useEffect(() => {
    if (!editor) return;
    const onUpdate = ({ transaction }: { transaction?: { getMeta: (key: string) => unknown } }) => {
      if (transaction?.getMeta("writerStoryLink")) {
        schedule();
        return;
      }
      setStyleTick((tick) => tick + 1);
      setChapters(writerChapterMap(editor.getJSON()));
      schedule();
    };
    const onSelection = () => {
      setStyleTick((tick) => tick + 1);
      const empty = editor.state.selection.empty;
      setSelectionBox(empty ? null : readSelectionBox(editor));
      setCursorBox(empty ? readPoint(editor, editor.state.selection.from) : null);
      const slash = writerSlashAt(editor.state.doc, editor.state.selection.from);
      if (slash && slashDismissed.current && slashDismissed.current !== slash.token) slashDismissed.current = null;
      const slashVisible = Boolean(slash && slashDismissed.current !== slash.token);
      if ((slashVisible ? slash?.query : null) !== slashQueryRef.current) setSlashIndex(0);
      slashQueryRef.current = slashVisible ? slash?.query ?? "" : null;
      setSlashQuery(slashQueryRef.current);
      setSlashBox(slashVisible ? readPoint(editor, editor.state.selection.from) : null);
      const rangeKey = `${editor.state.selection.from}:${editor.state.selection.to}`;
      const rangeChanged = rangeKey !== selectionRange.current;
      selectionRange.current = rangeKey;
      if (blockHover.current == null) syncBlockHandleRef.current(editor.state.selection.from);
      if (!rangeChanged) return;
      selectionEpoch.current += 1;
      setBlockMenu(null);
      setComposerOpen(false);
      if (inlineSurfaceRef.current) {
        aiFlight.current = false;
        aiMapping.current = null;
        setAiProposal(null);
        setAiPhase("idle");
        setAiError("");
        setInlineSurface(false);
        inlineSurfaceRef.current = false;
      }
    };
    syncBlockHandleRef.current(editor.state.selection.from);
    setCursorBox(editor.state.selection.empty ? readPoint(editor, editor.state.selection.from) : null);
    editor.on("update", onUpdate);
    editor.on("selectionUpdate", onSelection);
    const onTransaction = ({ transaction }: { transaction: { mapping: Mapping } }) => {
      aiMapping.current?.appendMapping(transaction.mapping);
    };
    editor.on("transaction", onTransaction);
    return () => {
      editor.off("update", onUpdate);
      editor.off("selectionUpdate", onSelection);
      editor.off("transaction", onTransaction);
    };
  }, [editor, schedule]);

  useEffect(() => {
    if (!editor) return;
    const onKey = (event: KeyboardEvent) => {
      if (slashQueryRef.current == null) return;
      const items = slashItemsRef.current;
      if (event.key === "Escape") {
        const slash = writerSlashAt(editor.state.doc, editor.state.selection.from);
        slashDismissed.current = slash?.token ?? "/";
        slashQueryRef.current = null;
        setSlashQuery(null);
        setSlashBox(null);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (items.length === 0) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const next = (slashIndexRef.current + delta + items.length) % items.length;
        slashIndexRef.current = next;
        setSlashIndex(next);
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        const command = items[slashIndexRef.current] ?? items[0];
        if (command) applySlashRef.current(command);
      }
    };
    editor.view.dom.addEventListener("keydown", onKey, true);
    return () => editor.view.dom.removeEventListener("keydown", onKey, true);
  }, [editor]);

  const paged = !sessionContinuous && writerResolvedView(profile, viewMode) === "paged";
  const [layoutReady, setLayoutReady] = useState(false);
  const showPages = paged && layoutReady;
  const pageScale = !showPages ? 1 : zoomChoice === "80" ? 0.8 : zoomChoice === "120" ? 1.2 : zoomChoice === "fit" ? fitScale : 1;
  pageMapRef.current = showPages ? pageMap : null;
  const pageForBlock = useCallback((blockId: string) => {
    const map = pageMapRef.current;
    if (!map) return null;
    return getPageForBlock(map, blockId);
  }, []);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const storage = editor.storage.writerPagination as WriterPaginationStorage;
    const box = writerPaginationBox(pagePreset);
    const kind = getWriterContextAdapter(profile).pagination;
    storage.enabled = showPages;
    storage.contentHeight = writerContentHeight(box);
    storage.gapHeight = writerGapHeight(box);
    storage.kind = kind;
    storage.layoutHash = writerLayoutHash(pagePreset === "screen" ? "a4" : pagePreset, kind, box);
    storage.scale = pageScale;
    storage.getScroller = () => pageRef.current;
    storage.onMap = (map) => setPageMap(map);
    storage.onFallback = () => setSessionContinuous(true);
    if (editor.view.dom.clientWidth < 10) return;
    editor.view.dispatch(editor.state.tr.setMeta("writer-pagination-refresh", true).setMeta("addToHistory", false));
  }, [editor, showPages, pagePreset, profile, pageScale]);

  useEffect(() => {
    const node = pageRef.current;
    if (!node) return;
    const read = () => setLayoutReady(node.clientWidth >= 10);
    read();
    if (typeof ResizeObserver === "undefined") return;
    try {
      const observer = new ResizeObserver(read);
      observer.observe(node);
      return () => observer.disconnect();
    } catch {
      return;
    }
  }, [editor]);

  useEffect(() => {
    const node = pageRef.current;
    if (!paged || zoomChoice !== "fit" || !node) return;
    const box = writerPaginationBox(pagePreset);
    const measure = () => {
      const available = Math.max(0, node.clientWidth - 32);
      setFitScale(Math.min(1.4, Math.max(0.35, available / box.width)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [paged, zoomChoice, pagePreset]);

  const cueKey = editor ? writerEntitiesInDocument(editor.state.doc).map((entity) => entity.id).join("\n") : "";
  const memory = useMemo(() => projectWriterMemory(story, cueKey ? cueKey.split("\n") : []), [story, cueKey]);
  memoryRef.current = memory;
  const appearances = useMemo(
    () => (editor ? writerAppearances(editor.state.doc, story).appearances : []),
    [editor, story, cueKey, styleTick],
  );

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const fixes = characterLinkFixes(editor.state.doc, story);
    if (fixes.length === 0) return;
    const tr = editor.state.tr;
    for (const fix of fixes) {
      const node = tr.doc.nodeAt(fix.pos);
      if (!node) continue;
      tr.setNodeMarkup(fix.pos, undefined, { ...node.attrs, storyEntityId: fix.storyEntityId });
    }
    if (!tr.docChanged) return;
    tr.setMeta("writerStoryLink", true);
    tr.setMeta("addToHistory", false);
    editor.view.dispatch(tr);
  }, [editor, story, cueKey]);

  useEffect(() => {
    if (!editor) return;
    const timer = window.setTimeout(() => {
      const marks = writerBlockMarks(editor.state.doc, memoryRef.current, dismissalsRef.current);
      const storage = editor.storage as { writerSignals?: { marks: typeof marks } };
      if (storage.writerSignals) storage.writerSignals.marks = marks;
      if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta("writer-signals", true));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [editor, styleTick, memory, dismissals]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setComposerOpen(false);
        setBlockMenu(null);
        setOpenConflict(null);
        setContextMark(null);
        return;
      }
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const current = editorRef.current;
      if (event.shiftKey && event.key.toLowerCase() === "m") {
        event.preventDefault();
        if (current) openComposerRef.current(current);
        return;
      }
      if (event.key === "Enter" && event.shiftKey) {
        if (!current) return;
        event.preventDefault();
        current.chain().focus().insertContent({ type: "pageBreak" }).run();
        return;
      }
      if (event.key === "Enter") {
        if (!current || !current.state.selection.empty || composerOpenRef.current) return;
        event.preventDefault();
        askRef.current("continue");
        return;
      }
      if (event.key.toLowerCase() === "g" && !event.shiftKey && current && event.target instanceof Node && current.view.dom.contains(event.target)) {
        event.preventDefault();
        setGoToOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!openConflict && !contextMark && !blockMenu && !composerOpen) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (conflictRef.current?.contains(target) || contextRef.current?.contains(target)) return;
      if (toolbarRef.current?.contains(target) || composerRef.current?.contains(target)) return;
      if (blockMenuRef.current?.contains(target) || blockHandleRef.current?.contains(target)) return;
      setOpenConflict(null);
      setContextMark(null);
      setBlockMenu(null);
      setComposerOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [openConflict, contextMark, blockMenu, composerOpen]);

  useEffect(() => {
    return () => {
      if (timerRef.current == null) return;
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
      void flush();
    };
  }, [flush]);

  const close = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void (async () => {
      if (runningRef.current) queuedRef.current = true;
      while (runningRef.current) {
        await new Promise((resolve) => window.setTimeout(resolve, 40));
      }
      const ok = await flush();
      if (ok) onClose();
    })();
  };

  const applyStyle = (value: string) => {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (isWriterScreenplayBlock(value) || value === "paragraph") chain.setWriterBlock(value).run();
    else if (value === "heading-1") chain.setHeading({ level: 1 }).run();
    else if (value === "heading-2") chain.setHeading({ level: 2 }).run();
    else if (value === "heading-3") chain.setHeading({ level: 3 }).run();
    else if (value === "blockquote") chain.toggleBlockquote().run();
    else if (value === "bulletList") chain.toggleBulletList().run();
    else if (value === "chapter") chain.insertWriterChapter().run();
    else if (value === "pageBreak") chain.insertContent({ type: "pageBreak" }).run();
  };

  const clearSlashToken = (current: Editor) => {
    const slash = writerSlashAt(current.state.doc, current.state.selection.from);
    if (!slash) return;
    const from = current.state.selection.$from.start();
    current.chain().focus().deleteRange({ from, to: from + slash.token.length }).run();
  };

  applySlashRef.current = (command) => {
    if (!editor) return;
    clearSlashToken(editor);
    applyStyle(command.id);
    slashDismissed.current = null;
    slashQueryRef.current = null;
    setSlashQuery(null);
    setSlashBox(null);
  };
  slashIndexRef.current = slashIndex;
  slashItemsRef.current = writerSlashMatches(profile, slashQuery ?? "");

  const showPanel = (panel: "map" | "memory" | "ai") => {
    const open = panel === "map" ? mapOpen : panel === "memory" ? memoryOpen : aiOpen;
    setMapOpen(!open && panel === "map");
    setMemoryOpen(!open && panel === "memory");
    setAiOpen(!open && panel === "ai");
  };

  const revealPanel = (panel: "map" | "memory" | "ai") => {
    setMapOpen(panel === "map");
    setMemoryOpen(panel === "memory");
    setAiOpen(panel === "ai");
  };

  const contextPackage = useMemo(() => {
    if (!editor) return null;
    return buildWriterContextPackage(editor, { profile, memory, brain: brandSnippet, pinId: pinnedMemoryId });
  }, [editor, profile, memory, brandSnippet, styleTick, pinnedMemoryId]);

  const askWriter = (action: WriterAiAction, options?: { inline?: boolean; intent?: WriterAiIntent; replace?: boolean }) => {
    if (!editor || aiFlight.current) return;
    if (aiProposal && !options?.replace) return;
    const inline = Boolean(options?.inline);
    const epoch = selectionEpoch.current;
    aiAction.current = action;
    aiIntent.current = options?.intent;
    const built = writerAiRequestFromEditor(
      editor,
      action,
      profileRef.current,
      contextPackage
        ? {
            memories: contextPackage.memories.map((entry) => ({ kind: entry.kind, text: entry.text })),
            brain: contextPackage.brain,
            chapter: contextPackage.chapter,
            line: contextPackage.line,
          }
        : undefined,
      options?.intent,
    );
    if (!built.ok) {
      if (!inline) {
        setMapOpen(false);
        setMemoryOpen(false);
        setAiOpen(true);
      }
      setAiError(built.error);
      setAiPhase("error");
      return;
    }
    const pending = built.proposal;
    aiMapping.current = new Mapping();
    aiFlight.current = true;
    if (inline) {
      setInlineSurface(true);
      inlineSurfaceRef.current = true;
      setBlockMenu(null);
      setComposerOpen(false);
    } else {
      setInlineSurface(false);
      inlineSurfaceRef.current = false;
      setMapOpen(false);
      setMemoryOpen(false);
      setAiOpen(true);
    }
    setAiPhase("running");
    setAiError("");
    setAiStale(false);
    setAiCompare(false);
    void requestWriterAssist(built.request).then((result) => {
      aiFlight.current = false;
      if (epoch !== selectionEpoch.current) return;
      if (!result.ok) {
        if (options?.replace && /cancelada/i.test(result.error)) {
          setAiPhase("ready");
          return;
        }
        aiMapping.current = null;
        setAiPhase("error");
        setAiError(result.error);
        return;
      }
      setAiProposal({ ...pending, text: result.text });
      setAiPhase("ready");
    });
  };

  const acceptProposal = () => {
    if (!editor || !aiProposal || !aiMapping.current) {
      setAiStale(true);
      return;
    }
    const mapped = mapWriterAiProposal(aiProposal, aiMapping.current);
    if (!writerAiProposalIsCurrent(editor.state.doc, mapped)) {
      setAiStale(true);
      return;
    }
    if (!insertWriterAiProposal(editor, mapped)) {
      setAiError("No se ha podido aplicar la propuesta.");
      setAiPhase("error");
      return;
    }
    aiMapping.current = null;
    setAiProposal(null);
    setAiPhase("idle");
    setAiError("");
    setAiStale(false);
    setAiCompare(false);
    setInlineSurface(false);
    inlineSurfaceRef.current = false;
  };

  const rejectProposal = () => {
    aiMapping.current = null;
    aiFlight.current = false;
    setAiProposal(null);
    setAiPhase("idle");
    setAiError("");
    setAiStale(false);
    setAiCompare(false);
    setInlineSurface(false);
    inlineSurfaceRef.current = false;
  };

  composerOpenRef.current = composerOpen;
  askRef.current = askWriter;

  const commitStory = (next: WriterStory) => {
    storyRef.current = next;
    setStory(next);
    schedule();
  };

  const saveMemory = (text: string, scope: WriterMemoryScope) => {
    const current = editorRef.current;
    const cues = current ? writerEntitiesInDocument(current.state.doc) : [];
    const assigned = writerAssignMemorySubject(text, cues, scope);
    if (!assigned) return false;
    const next = rememberStoryNote(storyRef.current, { text: assigned.text, scope: assigned.scope, cues });
    if (!next.added) return false;
    commitStory(next.story);
    return true;
  };

  const openStory = () => {
    const current = editorRef.current;
    if (current) {
      writePlace.current = captureWriterWritePlace(current.state.selection, pageRef.current?.scrollTop ?? 0);
      const absorbed = absorbDocumentCues(storyRef.current, writerEntitiesInDocument(current.state.doc));
      if (absorbed !== storyRef.current) commitStory(absorbed);
    }
    setComposerOpen(false);
    setBlockMenu(null);
    setSlashQuery(null);
    setSlashBox(null);
    setStoryOpen(true);
  };

  const closeStory = () => {
    setStoryOpen(false);
    const place = writePlace.current;
    const current = editorRef.current;
    if (!current || !place) return;
    queueMicrotask(() => restoreWriterWritePlace(current, pageRef.current, place));
  };

  const revealWriterPlace = (place: { from: number; to: number; focusFrom: number; focusTo: number }): boolean => {
    const current = editorRef.current;
    if (!current) return false;
    setStoryOpen(false);
    queueMicrotask(() => {
      if (current.isDestroyed) return;
      const from = Math.max(0, Math.min(place.focusFrom, current.state.doc.content.size));
      const to = Math.max(from, Math.min(place.focusTo, current.state.doc.content.size));
      if (current.state.doc.resolve(from).parent.isTextblock && current.state.doc.resolve(to).parent.isTextblock) {
        current.commands.setTextSelection({ from, to });
      }
      const dom = current.view.nodeDOM(place.from);
      if (dom instanceof HTMLElement) dom.scrollIntoView?.({ block: "center" });
      const signals = (current.storage as { writerSignals?: { flash?: { from: number; to: number } | null } }).writerSignals;
      if (!signals) return;
      signals.flash = { from: place.from, to: place.to };
      current.view.dispatch(current.state.tr.setMeta("writer-flash", true));
      window.setTimeout(() => {
        if (current.isDestroyed) return;
        signals.flash = null;
        current.view.dispatch(current.state.tr.setMeta("writer-flash", true));
      }, 1600);
    });
    return true;
  };

  const openAppearance = (appearance: StoryAppearance): boolean => {
    const current = editorRef.current;
    if (!current) return false;
    const place = locateStoryAppearance(current.state.doc, storyRef.current, appearance.entityId, appearance.blockId);
    if (!place) return false;
    return revealWriterPlace(place);
  };

  const openBlock = (blockId: string): boolean => {
    const current = editorRef.current;
    if (!current) return false;
    const place = locateWriterBlock(current.state.doc, blockId);
    if (!place) return false;
    return revealWriterPlace(place);
  };

  const updateStory = async () => {
    const current = editorRef.current;
    if (!current || aiFlight.current) return;
    const plan = planStoryUpdate(current.state.doc, storyRef.current);
    if (plan.calls === 0) return;
    aiFlight.current = true;
    setStoryNotice(null);
    try {
      const outcome = await executeStoryUpdate({
        getDoc: () => current.state.doc,
        getStory: () => storyRef.current,
        plan,
        onProgress: (index, total) => setStoryProgress({ current: index, total }),
        commit: commitStory,
        request: async (batch, index) => {
          const digest = index === plan.batches.length - 1
            ? buildGlobalStoryDigest(
                storyRef.current,
                writerDocumentBlocks(current.state.doc),
                batch.dirty.map((block) => block.blockId),
                getWriterContextAdapter(profileRef.current),
              )
            : "";
          const result = await requestWriterStoryUpdate(
            {
              action: "update_story",
              profile: profileRef.current,
              batch: {
                dirty: batch.dirty,
                context: batch.context,
                entities: batch.entities,
                ...(digest ? { digest } : {}),
              },
              preview: storyUpdatePreview(plan),
            },
            { skipPreflight: index > 0 },
          );
          if (!result.ok) return { ok: false, error: result.error, cancelled: /cancelada/i.test(result.error) };
          return { ok: true, storyDelta: result.storyDelta, ...(result.presentationDelta ? { presentationDelta: result.presentationDelta } : {}) };
        },
      });
      if (outcome.cancelled) return;
      if (outcome.completed > 0 && outcome.completed < outcome.total) {
        setStoryNotice(`Story actualizado parcialmente. ${outcome.completed} de ${outcome.total} lotes completados.`);
        return;
      }
      if (outcome.error) {
        setStoryNotice(outcome.error);
        return;
      }
      setStoryNotice("Story actualizado");
    } finally {
      aiFlight.current = false;
      setStoryProgress(null);
    }
  };

  const askStory = async (input: {
    scope: StoryAskScope;
    question: string;
    previous: StoryAskTurn | null;
    conversation: StoryConversation;
  }): Promise<StoryAskOutcome> => {
    const current = editorRef.current;
    if (!current) return { ok: false, error: "El documento no está listo." };
    const built = buildStoryAsk(current.state.doc, projectStory(storyRef.current, current.state.doc), input);
    if (built.localAnswer != null) {
      return {
        ok: true,
        answer: built.localAnswer,
        basis: built.basis,
        local: true,
        suggestion: null,
        fragment: built.fragment,
        conversationSummary: null,
        entityIds: built.entityIds,
        metrics: built.metrics,
      };
    }
    if (aiFlight.current) return { ok: false, error: "Espera a que termine la consulta." };
    aiFlight.current = true;
    try {
      const result = await requestWriterAskStory({
        action: "ask_story",
        profile: profileRef.current,
        question: built.question,
        previous: built.prior,
        preview: built.preview,
        storyContext: storyAskContext(built),
      });
      if (!result.ok) return { ok: false, error: result.error, cancelled: /cancelada/i.test(result.error) };
      if (result.storyDelta && !current.isDestroyed) {
        const applied = applyStoryDelta(storyRef.current, current.state.doc, built.cited, result.storyDelta, {
          allowedQuestionIds: built.openQuestions.map((item) => item.id),
        });
        if (applied.changed) commitStory(applied.story);
      }
      return {
        ok: true,
        answer: result.answer,
        basis: built.basis,
        local: false,
        suggestion: result.suggestedMemories[0]?.text ?? null,
        fragment: built.fragment,
        conversationSummary: result.conversationSummary,
        entityIds: built.entityIds,
        metrics: built.metrics,
      };
    } finally {
      aiFlight.current = false;
    }
  };

  const saveStoryIdea = (input: { text: string; entityId: string | null }) => {
    const next = addStoryIdea(storyRef.current, input);
    if (!next.added) return false;
    commitStory(next.story);
    return true;
  };

  const openComposerAt = (current: Editor) => {
    const { from, to } = current.state.selection;
    const offer = writerSelectionOffer(current.state.doc, from, to);
    setComposerScope(offer.scope);
    setComposerAskScope(offer.askScope);
    setComposerText("");
    setComposerEntity(offer.entityLabel);
    setComposerTitle(offer.prompt);
    const point = readPoint(current, from);
    setComposerBox(selectionBox ? { top: selectionBox.top, left: selectionBox.left } : point);
    setBlockMenu(null);
    setComposerOpen(true);
  };
  openComposerRef.current = openComposerAt;

  const commitComposer = () => {
    if (!saveMemory(composerText, composerScope)) return;
    setComposerText("");
    setComposerOpen(false);
  };

  const syncBlockHandle = (inside: number | null) => {
    if (!editor || inside == null) {
      setBlockHandle(null);
      return;
    }
    const safe = Math.max(1, Math.min(inside, editor.state.doc.content.size));
    const $pos = editor.state.doc.resolve(safe);
    if (!$pos.parent.isTextblock) {
      setBlockHandle(null);
      return;
    }
    const dom = editor.view.nodeDOM($pos.before());
    const rect = dom instanceof HTMLElement ? dom.getBoundingClientRect() : null;
    setBlockHandle({
      top: rect ? rect.top + Math.min(Math.max(rect.height, 16), 22) / 2 : 0,
      left: rect ? rect.left - 2 : 0,
      pos: $pos.start(),
    });
  };
  syncBlockHandleRef.current = syncBlockHandle;

  const applyBlockAt = (inside: number, id: string) => {
    if (!editor) return;
    const $pos = editor.state.doc.resolve(Math.max(1, Math.min(inside, editor.state.doc.content.size)));
    if (!$pos.parent.isTextblock) return;
    const before = $pos.before();
    if (id === "heading-1" || id === "heading-2" || id === "heading-3") {
      const level = Number(id.at(-1));
      editor.view.dispatch(editor.state.tr.setNodeMarkup(before, editor.schema.nodes.heading, { ...$pos.parent.attrs, level }));
      return;
    }
    if (id === "paragraph" || isWriterScreenplayBlock(id)) {
      const type = editor.schema.nodes[id];
      if (!type) return;
      editor.view.dispatch(editor.state.tr.setNodeMarkup(before, type, $pos.parent.attrs));
      return;
    }
    const saved = { from: editor.state.selection.from, to: editor.state.selection.to };
    editor.commands.setTextSelection($pos.start());
    if (id === "blockquote") editor.chain().focus().toggleBlockquote().run();
    else if (id === "bulletList") editor.chain().focus().toggleBulletList().run();
    else if (id === "chapter") editor.chain().focus().insertWriterChapter().run();
    const max = editor.state.doc.content.size;
    if (id !== "chapter" && saved.from <= max && saved.to <= max) editor.commands.setTextSelection(saved);
  };

  const currentStyle = styleValue(editor);
  const canRewrite = Boolean(
    editor &&
      !editor.state.selection.empty &&
      editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, "\n").trim(),
  );
  const saveLabel = saveState === "saving" ? "Guardando…" : saveState === "error" ? "Error al guardar" : "";
  const wordsLabel = wordCount === 1 ? "1 palabra" : `${wordCount} palabras`;
  const statusText = (() => {
    if (!showPages || !pageMap || !editor) return wordsLabel;
    const page = getCurrentPage(pageMap, editor.state.selection.from);
    const scene = profile === "screenplay" ? sceneNumberAt(editor, editor.state.selection.from) : null;
    const place = `Página ${page} de ${pageMap.totalPages}`;
    return scene ? `Escena ${scene} · ${place}` : `${wordsLabel} · ${place}`;
  })();
  const entities = editor ? writerEntitiesInDocument(editor.state.doc) : [];

  return (
    <StudioNodePortal>
      <WriterStudioFrame
        title={title}
        profile={profile}
        wordCount={wordCount}
        saveLabel={saveLabel}
        saveError={saveState === "error"}
        onTitle={(value) => {
          setTitle(value);
          titleRef.current = value;
          schedule();
        }}
        onProfile={(value) => {
          setProfile(value);
          profileRef.current = value;
          if (editor) {
            editor.storage.writerScreenplayKeys.enabled = value === "screenplay";
            if (value === "screenplay" && isBlankParagraphDocument(editor.getJSON())) {
              editor.chain().focus().setWriterBlock("sceneHeading").run();
            }
          }
          schedule();
        }}
        onClose={close}
        editor={editor}
        hasOutline={editor ? writerDocumentHasOutline(editor.getJSON()) : false}
        pagePreset={pagePreset}
        onPagePreset={(value) => {
          setPagePreset(value);
          pagePresetRef.current = value;
          schedule();
        }}
        viewMode={paged ? "paged" : "continuous"}
        onViewMode={(value) => {
          setSessionContinuous(false);
          setViewMode(value);
          viewModeRef.current = value;
          schedule();
        }}
        zoomChoice={zoomChoice}
        onZoomChoice={setZoomChoice}
        statusText={statusText}
        onStatus={showPages ? () => setGoToOpen(true) : undefined}
        goToOpen={goToOpen}
        goToDraft={goToDraft}
        onGoToDraft={setGoToDraft}
        onGoTo={(value) => {
          const number = Number.parseInt(value, 10);
          const pos = pageMap ? getPositionForPage(pageMap, number) : null;
          if (!editor || pos == null) return;
          const target = Math.max(1, Math.min(pos, editor.state.doc.content.size));
          editor.chain().focus().setTextSelection(target).scrollIntoView().run();
          setGoToOpen(false);
        }}
        onGoToClose={() => setGoToOpen(false)}
        mapOpen={mapOpen}
        onToggleMap={() => showPanel("map")}
        onToggleMemory={() => {
          if (memoryOpen) {
            setMemoryOpen(false);
            return;
          }
          setBrowserFocus({ type: "index" });
          revealPanel("memory");
        }}
        aiOpen={aiOpen}
        onToggleAi={() => showPanel("ai")}
        storyOpen={storyOpen}
        storyPending={editor ? planStoryUpdate(editor.state.doc, story).dirtyCount : 0}
        onOpenStory={storyOpen ? closeStory : openStory}
      >
        <div className="writer-studio-workspace">
          <div className="writer-studio-main">
            <div
              ref={pageRef}
              className={`writer-studio-page${profile === "screenplay" ? " is-screenplay" : ""}${showPages ? " is-paged" : ""}`}
              style={writerPageStyle(pagePreset, profile, showPages)}
              onMouseMove={(event) => {
                if (!editor) return;
                const pos = blockPosFromTarget(editor, event.target);
                if (pos == null) return;
                blockHover.current = pos;
                syncBlockHandle(pos);
              }}
              onMouseLeave={(event) => {
                const next = event.relatedTarget;
                if (next instanceof Node && (blockHandleRef.current?.contains(next) || blockMenuRef.current?.contains(next))) return;
                blockHover.current = null;
                syncBlockHandle(editor?.state.selection.from ?? null);
              }}
              onClick={(event) => {
                const block = (event.target as HTMLElement).closest("[data-writer-block]");
                if (!block || !editor) return;
                const rect = block.getBoundingClientRect();
                if (event.clientX > rect.left - 2) return;
                const id = block.getAttribute("data-writer-block");
                const marks = (editor.storage as { writerSignals?: { marks: ReturnType<typeof writerBlockMarks> } }).writerSignals?.marks ?? [];
                const mark = marks.find((item) => item.blockId === id);
                if (mark?.kind === "conflict" && mark.conflict) {
                  setContextMark(null);
                  setConflictBox({ top: rect.bottom + 8, left: Math.max(16, rect.left - 24) });
                  setOpenConflict(mark.conflict);
                }
                if (mark?.kind === "memory" && mark.related) {
                  setOpenConflict(null);
                  setContextBox({ top: rect.bottom + 8, left: Math.max(16, rect.left - 24) });
                  setContextMark(mark);
                }
              }}
            >
              <div className="writer-sheet-stack" style={showPages ? ({ zoom: pageScale } as React.CSSProperties) : undefined}>
                {showPages ? (
                  <div className="writer-page-plates" aria-hidden="true">
                    {(pageMap?.pages.length ? pageMap.pages : [{ number: 1 }]).map((page) => (
                      <div key={page.number} className="writer-page-plate">
                        <span className="writer-page-number">{page.number}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                <EditorContent editor={editor} />
              </div>
            </div>
          </div>
          {mapOpen ? (
            <aside className="writer-studio-map" aria-label="Mapa del documento">
              <p>Mapa</p>
              {chapters.length === 0 ? <span>Todavía no hay capítulos.</span> : null}
              {chapters.map((chapter, index) => (
                <button key={chapter.id} type="button" onClick={() => focusWriterChapter(chapter.id)}>
                  <em>{index + 1}</em>
                  {chapter.title}
                </button>
              ))}
            </aside>
          ) : null}
          {aiOpen ? (
            <WriterAiPanel
              phase={aiPhase}
              error={aiError}
              proposal={aiProposal}
              compare={aiCompare}
              stale={aiStale}
              canRewrite={canRewrite}
              onContinue={() => askWriter("continue")}
              onRewrite={() => askWriter("rewrite")}
              onAccept={acceptProposal}
              onReject={rejectProposal}
              onCompare={() => setAiCompare((value) => !value)}
              onRetry={() => askWriter(aiAction.current)}
              contextLine={contextPackage?.line ?? ""}
            />
          ) : null}
          {memoryOpen ? (
            <WriterMemoryPanel
              memory={memory}
              entities={entities}
              query={memoryQuery}
              onQuery={setMemoryQuery}
              focus={browserFocus}
              onFocus={setBrowserFocus}
              menuId={memoryMenu}
              editingId={editingMemory}
              onMenu={setMemoryMenu}
              onEdit={setEditingMemory}
              onClose={() => setMemoryOpen(false)}
              onUpdate={(id, patch) => {
                const cues = editorRef.current ? writerEntitiesInDocument(editorRef.current.state.doc) : [];
                commitStory(updateStoryNote(storyRef.current, id, patch, cues));
              }}
              onRemove={(id) => {
                commitStory(removeStoryNote(storyRef.current, id));
              }}
            />
          ) : null}
        </div>
        {selectionBox && canRewrite && !inlineSurface && editor && !storyOpen ? (
          <WriterSelectionBar
            barRef={toolbarRef}
            top={selectionBox.top}
            left={selectionBox.left}
            offer={writerSelectionOffer(editor.state.doc, editor.state.selection.from, editor.state.selection.to)}
            marks={allowsInlineFormat(editor)}
            bold={editor.isActive("bold")}
            italic={editor.isActive("italic")}
            onBold={() => editor.chain().focus().toggleBold().run()}
            onItalic={() => editor.chain().focus().toggleItalic().run()}
            onRewrite={() => askWriter("rewrite", { inline: true })}
            onContext={() => (composerOpen ? setComposerOpen(false) : openComposerAt(editor))}
            onSecondary={(action) => {
              const request = writerRewriteRequest(action);
              askWriter(request.action, { inline: true, intent: request.intent });
            }}
          />
        ) : null}
        {cursorBox && !aiOpen && !inlineSurface && !storyOpen && !composerOpen && !slashBox ? (
          <button
            type="button"
            className="writer-cursor-ai"
            style={{ top: cursorBox.top, left: cursorBox.left }}
            aria-label="Continuar escribiendo"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => askWriter("continue", { inline: true })}
          >
            ✦ Continuar
          </button>
        ) : null}
        {inlineSurface && (selectionBox || cursorBox) ? (
          <div className="writer-inline" role="dialog" aria-label="Propuesta" style={{ top: (selectionBox ?? cursorBox)!.top, left: (selectionBox ?? cursorBox)!.left }}>
            {aiPhase === "running" ? <p>…</p> : null}
            {aiStale ? <p className="writer-ai-error">El texto cambió. Descarta la propuesta y pídela otra vez.</p> : null}
            {aiProposal ? (
              <>
                <p className="writer-inline-original">{aiProposal.original}</p>
                <p>{aiProposal.text}</p>
                <div>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={acceptProposal} disabled={aiStale}>Aceptar</button>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => askWriter(aiAction.current, { inline: true, intent: aiIntent.current, replace: true })}
                    disabled={aiPhase === "running"}
                  >
                    Otra
                  </button>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={rejectProposal}>Descartar</button>
                </div>
              </>
            ) : null}
            {aiPhase === "error" && aiError ? (
              <>
                <p className="writer-ai-error">{aiError}</p>
                {aiProposal ? null : (
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={rejectProposal}>Descartar</button>
                )}
              </>
            ) : null}
          </div>
        ) : null}
        {blockHandle ? (
          <button
            ref={blockHandleRef}
            type="button"
            className="writer-block-handle"
            style={{ top: blockHandle.top, left: blockHandle.left }}
            aria-label="Cambiar bloque"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setBlockMenu(blockHandle)}
          >
            ·
          </button>
        ) : null}
        {blockMenu ? (
          <div
            ref={blockMenuRef}
            className="writer-block-palette"
            role="toolbar"
            aria-label="Estilo del bloque"
            style={{ top: blockMenu.top, left: blockMenu.left + 14 }}
          >
            {writerBlockPalette(profile).map((command) => (
              <button
                key={command.id}
                type="button"
                title={command.label}
                aria-label={command.label}
                aria-pressed={currentStyle === command.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  applyBlockAt(blockMenu.pos, command.id);
                  setBlockMenu(null);
                }}
              >
                {command.mark}
              </button>
            ))}
          </div>
        ) : null}
        {slashBox && slashItemsRef.current.length > 0 ? (
          <div className="writer-slash" style={{ top: slashBox.top, left: slashBox.left }} role="listbox" aria-label="Comandos">
            {slashItemsRef.current.map((command, index) => (
              <button
                key={command.id}
                type="button"
                role="option"
                aria-selected={index === slashIndex}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setSlashIndex(index)}
                onClick={() => applySlashRef.current(command)}
              >
                <span>{command.mark}</span>
                {command.label}
              </button>
            ))}
          </div>
        ) : null}
        {composerOpen ? (
          <form
            ref={composerRef}
            className="writer-memory-composer writer-context-popover"
            role="dialog"
            aria-label="Recordar"
            style={composerBox ? { top: composerBox.top, left: composerBox.left, transform: "translateX(-50%)" } : undefined}
            onSubmit={(event) => {
              event.preventDefault();
              commitComposer();
            }}
          >
            {composerEntity ? <p className="writer-context-kicker">[{composerEntity}]</p> : null}
            <p>{composerTitle}</p>
            {composerAskScope ? <ScopeChip scope={composerScope} entities={entities} onChange={setComposerScope} /> : null}
            <textarea
              aria-label="Recordar"
              placeholder={composerTitle}
              value={composerText}
              rows={2}
              autoFocus
              onChange={(event) => setComposerText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey) return;
                event.preventDefault();
                event.stopPropagation();
                commitComposer();
              }}
            />
            <button type="submit">Añadir</button>
          </form>
        ) : null}
        {openConflict ? (
          <div
            ref={conflictRef}
            className="writer-conflict"
            role="dialog"
            aria-label="Posible incoherencia"
            style={conflictBox ? { top: conflictBox.top, left: conflictBox.left } : undefined}
          >
            <header>
              <p>⚠ Posible incoherencia</p>
              <button type="button" aria-label="Cerrar aviso" onClick={() => setOpenConflict(null)}>×</button>
            </header>
            <strong className="writer-conflict-entity">{openConflict.entityLabel.toLocaleUpperCase("es")}</strong>
            <p className="writer-conflict-kicker">Memory</p>
            <blockquote>{openConflict.memoryText}</blockquote>
            <p className="writer-conflict-kicker">Aquí</p>
            <blockquote>{openConflict.here}</blockquote>
            <div className="writer-conflict-rule" />
            <div className="writer-conflict-actions">
              <button type="button" onClick={() => { setEditingMemory(openConflict.memoryId); setBrowserFocus(memoryFocusFor(memory, openConflict.memoryId)); setOpenConflict(null); revealPanel("memory"); }}>
                Editar memory
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = dismissalsRef.current.includes(openConflict.key) ? dismissalsRef.current : [...dismissalsRef.current, openConflict.key];
                  dismissalsRef.current = next;
                  setDismissals(next);
                  setOpenConflict(null);
                  schedule();
                }}
              >
                Mantener texto
              </button>
            </div>
            <button
              type="button"
              className="writer-conflict-ai"
              onClick={() => {
                editor?.commands.setTextSelection({ from: openConflict.from + 1, to: Math.max(openConflict.from + 1, openConflict.to - 1) });
                setOpenConflict(null);
                askWriter("rewrite");
              }}
            >
              ✦ Corregir con IA
            </button>
          </div>
        ) : null}
        {contextMark?.related ? (
          <div
            ref={contextRef}
            className="writer-conflict writer-context"
            role="dialog"
            aria-label={contextMark.related.idea ? "Idea pendiente" : "Relacionado"}
            style={contextBox ? { top: contextBox.top, left: contextBox.left } : undefined}
          >
            <header>
              <p>{contextMark.related.idea ? "Idea pendiente" : "Relacionado"}</p>
              <button type="button" aria-label="Cerrar relacionado" onClick={() => setContextMark(null)}>×</button>
            </header>
            <strong className="writer-conflict-entity">{contextMark.related.entityLabel.toLocaleUpperCase("es")}</strong>
            <blockquote>{contextMark.related.memoryText}</blockquote>
            <div className="writer-conflict-rule" />
            <div className="writer-conflict-actions">
              {contextMark.related.idea ? (
                <button type="button" onClick={() => { setPinnedMemoryId(contextMark.related?.memoryId ?? null); setContextMark(null); }}>Usar</button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const id = contextMark.related?.memoryId;
                    if (!id) return;
                    setEditingMemory(id);
                    setBrowserFocus(memoryFocusFor(memory, id));
                    setContextMark(null);
                    revealPanel("memory");
                  }}
                >
                  Ver detalle
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const related = contextMark.related;
                  if (!related) return;
                  const next = dismissalsRef.current.includes(related.dismissKey) ? dismissalsRef.current : [...dismissalsRef.current, related.dismissKey];
                  dismissalsRef.current = next;
                  setDismissals(next);
                  setContextMark(null);
                  schedule();
                }}
              >
                Después
              </button>
              {contextMark.related.idea ? (
                <button
                  type="button"
                  onClick={() => {
                    const id = contextMark.related?.memoryId;
                    if (!id) return;
                    commitStory(removeStoryNote(storyRef.current, id));
                    setContextMark(null);
                    schedule();
                  }}
                >
                  Descartar
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {storyOpen ? (
          <StoryView
            story={story}
            reading={editor ? projectStory(story, editor.state.doc) : story}
            appearances={appearances}
            blocks={editor ? writerDocumentBlocks(editor.state.doc) : []}
            profile={profile}
            pending={editor ? planStoryUpdate(editor.state.doc, story).dirtyCount : 0}
            progress={storyProgress}
            notice={storyNotice}
            onUpdate={() => void updateStory()}
            onStory={commitStory}
            onClose={closeStory}
            onOpenAppearance={openAppearance}
            onOpenBlock={openBlock}
            pageForBlock={pageForBlock}
            onAsk={askStory}
            onSaveIdea={saveStoryIdea}
            onOpenFragment={(fragment) => {
              const current = editorRef.current;
              if (!current) return false;
              const item = writerAppearances(current.state.doc, storyRef.current).appearances.find(
                (row) => row.entityId === fragment.entityId && row.blockId === fragment.blockId,
              );
              return item ? openAppearance(item) : openBlock(fragment.blockId);
            }}
          />
        ) : null}
        <style>{WRITER_STUDIO_CSS}</style>
      </WriterStudioFrame>
    </StudioNodePortal>
  );
}

function memoryFocusFor(memory: WriterMemoryEntry[], id: string): WriterMemoryFocus {
  const entry = memory.find((item) => item.id === id);
  if (entry?.scope?.type === "entity") return { type: "entity", entityId: entry.scope.entityId };
  if (entry?.status === "tentative") return { type: "ideas" };
  return { type: "general" };
}

function WriterSelectionBar({
  barRef,
  top,
  left,
  offer,
  marks,
  bold,
  italic,
  onBold,
  onItalic,
  onRewrite,
  onContext,
  onSecondary,
}: {
  barRef: React.RefObject<HTMLDivElement | null>;
  top: number;
  left: number;
  offer: ReturnType<typeof writerSelectionOffer>;
  marks: boolean;
  bold: boolean;
  italic: boolean;
  onBold: () => void;
  onItalic: () => void;
  onRewrite: () => void;
  onContext: () => void;
  onSecondary: (action: "expand" | "shorten") => void;
}) {
  const hold = (event: React.MouseEvent) => event.preventDefault();
  if (!offer.rewrite && !offer.context && !marks) return null;
  return (
    <div ref={barRef} className="writer-selection-toolbar" style={{ top, left }} role="toolbar" aria-label="Selección">
      {offer.rewrite ? (
        <button type="button" aria-label="Reescribir" onMouseDown={hold} onClick={onRewrite}>✦ Reescribir</button>
      ) : null}
      {offer.context ? (
        <button type="button" aria-label={offer.rememberLabel} onMouseDown={hold} onClick={onContext}>◉ {offer.rememberLabel}</button>
      ) : null}
      {marks ? (
        <button type="button" className="writer-selection-mark" title="Negrita" aria-label="Negrita" aria-pressed={bold} onMouseDown={hold} onClick={onBold}>B</button>
      ) : null}
      {marks ? (
        <button type="button" className="writer-selection-mark writer-selection-italic" title="Cursiva" aria-label="Cursiva" aria-pressed={italic} onMouseDown={hold} onClick={onItalic}>I</button>
      ) : null}
      {offer.secondary ? (
        <button type="button" aria-label={offer.secondary === "expand" ? "Expandir" : "Acortar"} onMouseDown={hold} onClick={() => onSecondary(offer.secondary!)}>
          {offer.secondary === "expand" ? "Expandir" : "Acortar"}
        </button>
      ) : null}
    </div>
  );
}

function WriterStudioFrame({
  title,
  profile,
  wordCount,
  saveLabel,
  saveError = false,
  onTitle,
  onProfile,
  onClose,
  editor,
  hasOutline = false,
  pagePreset,
  onPagePreset,
  viewMode,
  onViewMode,
  zoomChoice,
  onZoomChoice,
  statusText,
  onStatus,
  goToOpen = false,
  goToDraft = "",
  onGoToDraft,
  onGoTo,
  onGoToClose,
  mapOpen = false,
  onToggleMap,
  onToggleMemory,
  aiOpen = false,
  onToggleAi,
  storyOpen = false,
  storyPending = 0,
  onOpenStory,
  children,
}: {
  title: string;
  profile: WriterProfile;
  wordCount: number;
  saveLabel: string;
  saveError?: boolean;
  onTitle?: (value: string) => void;
  onProfile?: (value: WriterProfile) => void;
  onClose: () => void;
  editor?: Editor | null;
  hasOutline?: boolean;
  pagePreset?: WriterPagePreset;
  onPagePreset?: (value: WriterPagePreset) => void;
  viewMode?: "paged" | "continuous";
  onViewMode?: (value: "paged" | "continuous") => void;
  zoomChoice?: "80" | "100" | "120" | "fit";
  onZoomChoice?: (value: "80" | "100" | "120" | "fit") => void;
  statusText?: string;
  onStatus?: () => void;
  goToOpen?: boolean;
  goToDraft?: string;
  onGoToDraft?: (value: string) => void;
  onGoTo?: (value: string) => void;
  onGoToClose?: () => void;
  mapOpen?: boolean;
  onToggleMap?: () => void;
  onToggleMemory?: () => void;
  aiOpen?: boolean;
  onToggleAi?: () => void;
  storyOpen?: boolean;
  storyPending?: number;
  onOpenStory?: () => void;
  children: React.ReactNode;
}) {
  const editable = Boolean(onTitle && onProfile);
  const workspaceLabel = getWriterContextAdapter(profile).workspaceLabel;
  return (
    <div className="writer-studio" role="dialog" aria-label="Writer">
      <header className="writer-studio-header">
        <div className="writer-studio-brand">Writer</div>
        <input
          className="writer-studio-title"
          value={title}
          placeholder="Sin título"
          aria-label="Nombre del documento"
          readOnly={!onTitle}
          onChange={(event) => onTitle?.(event.target.value)}
        />
        {editable ? (
          <label className="writer-studio-field">
            <select
              value={profile}
              aria-label="Tipo de documento"
              onChange={(event) => onProfile?.(event.target.value as WriterProfile)}
            >
              {WRITER_PROFILES.map((item) => (
                <option key={item} value={item}>
                  {WRITER_PROFILE_LABELS[item]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className={`writer-studio-status${saveError ? " is-error" : ""}`}>
          {onStatus ? (
            <button type="button" className="writer-status-page" onClick={onStatus}>
              {statusText ?? (wordCount === 1 ? "1 palabra" : `${wordCount} palabras`)}
            </button>
          ) : (
            <span>{statusText ?? (wordCount === 1 ? "1 palabra" : `${wordCount} palabras`)}</span>
          )}
          {goToOpen && onGoTo ? (
            <form
              className="writer-goto"
              onSubmit={(event) => {
                event.preventDefault();
                onGoTo(goToDraft);
              }}
            >
              <input
                aria-label="Ir a página"
                inputMode="numeric"
                value={goToDraft}
                autoFocus
                onChange={(event) => onGoToDraft?.(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") onGoToClose?.();
                }}
              />
            </form>
          ) : null}
          {saveLabel ? <span>{saveLabel}</span> : null}
        </div>
        {onToggleAi ? (
          <button type="button" title="Writer AI" aria-label="Writer AI" aria-pressed={aiOpen} onClick={onToggleAi}>
            ✦
          </button>
        ) : null}
        {onOpenStory ? (
          <button
            type="button"
            aria-label={storyOpen ? "Volver a Write" : workspaceLabel}
            title={
              storyOpen
                ? "Volver a Write"
                : storyPending > 0
                  ? `${workspaceLabel} · ${storyPending} ${storyPending === 1 ? "cambio" : "cambios"}`
                  : workspaceLabel
            }
            aria-pressed={storyOpen}
            onClick={onOpenStory}
          >
            {storyOpen ? "← Write" : workspaceLabel}
          </button>
        ) : null}
        {editable && onPagePreset && pagePreset ? (
          <WriterToolsMenu
            editor={editor}
            preset={pagePreset}
            hasOutline={hasOutline}
            onPagePreset={onPagePreset}
            viewMode={viewMode}
            onViewMode={onViewMode}
            zoomChoice={zoomChoice}
            onZoomChoice={onZoomChoice}
            onToggleMap={onToggleMap}
            onToggleMemory={onToggleMemory}
          />
        ) : null}
        <button type="button" className="writer-studio-close" aria-label="Cerrar" onClick={onClose}>
          ×
        </button>
      </header>
      {children}
    </div>
  );
}

function WriterMemoryPanel({
  memory,
  entities,
  query,
  onQuery,
  focus,
  onFocus,
  menuId,
  editingId,
  onMenu,
  onEdit,
  onClose,
  onUpdate,
  onRemove,
}: {
  memory: WriterMemoryEntry[];
  entities: WriterEntity[];
  query: string;
  onQuery: (value: string) => void;
  focus: WriterMemoryFocus;
  onFocus: (focus: WriterMemoryFocus) => void;
  menuId: string | null;
  editingId: string | null;
  onMenu: (id: string | null) => void;
  onEdit: (id: string | null) => void;
  onClose: () => void;
  onUpdate: (id: string, patch: { text?: string; status?: "established" | "tentative"; scope?: WriterMemoryScope }) => void;
  onRemove: (id: string) => void;
}) {
  const index = writerMemoryIndex(memory, entities);
  const found = query.trim() ? searchWriterMemory(memory, query, entities) : [];
  const focused = focus.type === "entity"
    ? memory.filter((entry) => entry.scope?.type === "entity" && entry.scope.entityId === focus.entityId)
    : focus.type === "ideas"
      ? memory.filter((entry) => entry.status === "tentative")
      : focus.type === "general"
        ? memory.filter((entry) => entry.status !== "tentative" && entry.scope?.type !== "entity")
        : [];
  const shelves = {
    hechos: focused.filter((entry) => writerMemoryShelf(entry) === "hechos"),
    historia: focused.filter((entry) => writerMemoryShelf(entry) === "historia"),
    ideas: focused.filter((entry) => writerMemoryShelf(entry) === "ideas"),
  };
  const title = focus.type === "entity"
    ? (entities.find((entity) => entity.id === focus.entityId)?.label ?? writerEntityLabel(focus.entityId)).toLocaleUpperCase("es")
    : focus.type === "ideas"
      ? "Ideas pendientes"
      : focus.type === "general"
        ? "General"
        : "Memory";
  useEffect(() => {
    if (!editingId) return;
    const row = document.querySelector<HTMLElement>(`[data-memory-id="${editingId}"]`);
    row?.scrollIntoView?.({ block: "nearest" });
  }, [editingId]);
  return (
    <aside className="writer-memory" aria-label="Memoria del documento">
      <header>
        {focus.type === "index" ? <p>Memory</p> : <button type="button" onClick={() => onFocus({ type: "index" })}>Memory</button>}
        <button type="button" aria-label="Cerrar memoria" onClick={onClose}>×</button>
      </header>
      <input aria-label="Buscar memoria" placeholder="Buscar personajes, lugares, ideas..." value={query} onChange={(event) => onQuery(event.target.value)} />
      {query.trim() ? (
        found.length === 0 ? <span>Nada coincide.</span> : <WriterMemoryNotes entries={writerMemoryPage(found)} entities={entities} menuId={menuId} editingId={editingId} onMenu={onMenu} onEdit={onEdit} onUpdate={onUpdate} onRemove={onRemove} />
      ) : focus.type === "index" ? (
        memory.length === 0 ? <span>Nada guardado.</span> : (
          <>
            {index.characters.length > 0 ? (
              <section>
                <h2>Personajes</h2>
                {index.characters.map((character) => (
                  <button key={character.id} type="button" className="writer-memory-row" onClick={() => onFocus({ type: "entity", entityId: character.id })}>
                    <span>{character.label}</span>
                    <em>{character.count}</em>
                  </button>
                ))}
              </section>
            ) : null}
            {index.ideas > 0 ? (
              <button type="button" className="writer-memory-row" onClick={() => onFocus({ type: "ideas" })}>
                <span>Ideas pendientes</span>
                <em>{index.ideas}</em>
              </button>
            ) : null}
            {index.general > 0 ? (
              <button type="button" className="writer-memory-row" onClick={() => onFocus({ type: "general" })}>
                <span>General</span>
                <em>{index.general}</em>
              </button>
            ) : null}
            {index.recent.length > 0 ? (
              <section>
                <h2>Recientes</h2>
                <WriterMemoryNotes entries={index.recent} entities={entities} menuId={menuId} editingId={editingId} onMenu={onMenu} onEdit={onEdit} onUpdate={onUpdate} onRemove={onRemove} />
              </section>
            ) : null}
          </>
        )
      ) : (
        <section>
          <h2>{title}</h2>
          {writerMemoryPage(focused).length < focused.length ? <span>Hay más. Afina la búsqueda.</span> : null}
          {focus.type === "entity" ? (
            (["hechos", "historia", "ideas"] as const).map((shelf) => shelves[shelf].length === 0 ? null : (
              <div key={shelf}>
                <h2>{shelf === "hechos" ? "Hechos" : shelf === "historia" ? "Historia" : "Ideas"}</h2>
                <WriterMemoryNotes entries={writerMemoryPage(shelves[shelf])} entities={entities} menuId={menuId} editingId={editingId} onMenu={onMenu} onEdit={onEdit} onUpdate={onUpdate} onRemove={onRemove} />
              </div>
            ))
          ) : (
            <WriterMemoryNotes entries={writerMemoryPage(focused)} entities={entities} menuId={menuId} editingId={editingId} onMenu={onMenu} onEdit={onEdit} onUpdate={onUpdate} onRemove={onRemove} />
          )}
        </section>
      )}
    </aside>
  );
}

function WriterMemoryNotes({
  entries,
  entities,
  menuId,
  editingId,
  onMenu,
  onEdit,
  onUpdate,
  onRemove,
}: {
  entries: WriterMemoryEntry[];
  entities: WriterEntity[];
  menuId: string | null;
  editingId: string | null;
  onMenu: (id: string | null) => void;
  onEdit: (id: string | null) => void;
  onUpdate: (id: string, patch: { text?: string; status?: "established" | "tentative"; scope?: WriterMemoryScope }) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <>
      {entries.map((entry) => (
        <article key={entry.id} data-memory-id={entry.id} className={`${entry.status === "tentative" ? "is-tentative" : ""} ${editingId === entry.id ? "is-selected" : ""}`.trim()}>
          <p>
            {editingId === entry.id ? (
              <input
                aria-label="Editar memoria"
                defaultValue={entry.text}
                autoFocus
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  onUpdate(entry.id, { text: event.currentTarget.value });
                  onEdit(null);
                }}
                onBlur={(event) => {
                  onUpdate(entry.id, { text: event.currentTarget.value });
                  onEdit(null);
                }}
              />
            ) : entry.text}
            {entry.status === "tentative" ? <i> ~</i> : null}
          </p>
          <button type="button" aria-label="Opciones de memoria" aria-expanded={menuId === entry.id} onClick={() => onMenu(menuId === entry.id ? null : entry.id)}>···</button>
          {menuId === entry.id ? (
            <div role="menu">
              <button type="button" onClick={() => { onEdit(entry.id); onMenu(null); }}>Editar</button>
              <span>Cambiar scope</span>
              <ScopeChip scope={entry.scope ?? { type: "global" }} entities={entities} onChange={(scope) => onUpdate(entry.id, { scope })} />
              <button type="button" onClick={() => onUpdate(entry.id, { status: entry.status === "tentative" ? "established" : "tentative" })}>
                {entry.status === "tentative" ? "Tratar como establecido" : "Tratar como posibilidad"}
              </button>
              <button type="button" onClick={() => onRemove(entry.id)}>Eliminar</button>
            </div>
          ) : null}
        </article>
      ))}
    </>
  );
}
function ScopeChip({
  scope,
  entities,
  onChange,
}: {
  scope: WriterMemoryScope;
  entities: WriterEntity[];
  onChange: (scope: WriterMemoryScope) => void;
}) {
  const value = scope.type === "entity" ? scope.entityId : "";
  const known = value && entities.some((entity) => entity.id === value);
  return (
    <select
      aria-label="Ámbito"
      value={value}
      onChange={(event) => onChange(event.target.value ? { type: "entity", entityId: event.target.value } : { type: "global" })}
    >
      <option value="">General</option>
      {entities.map((entity) => (
        <option key={entity.id} value={entity.id}>{entity.label}</option>
      ))}
      {value && !known ? <option value={value}>{writerEntityLabel(value)}</option> : null}
    </select>
  );
}

const WRITER_PAGE_MARKS: Record<WriterPagePreset, string> = {
  a4: "A4",
  letter: "LT",
  a5: "A5",
  screen: "▭",
};

function WriterToolsMenu({
  editor,
  preset,
  hasOutline,
  onPagePreset,
  viewMode,
  onViewMode,
  zoomChoice,
  onZoomChoice,
  onToggleMap,
  onToggleMemory,
}: {
  editor?: Editor | null;
  preset: WriterPagePreset;
  hasOutline: boolean;
  onPagePreset: (value: WriterPagePreset) => void;
  viewMode?: "paged" | "continuous";
  onViewMode?: (value: "paged" | "continuous") => void;
  zoomChoice?: "80" | "100" | "120" | "fit";
  onZoomChoice?: (value: "80" | "100" | "120" | "fit") => void;
  onToggleMap?: () => void;
  onToggleMemory?: () => void;
}) {
  const [panel, setPanel] = useState<"closed" | "tools" | "page" | "view">("closed");
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (panel === "closed") return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      setPanel("closed");
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [panel]);
  return (
    <div className="writer-studio-menu" ref={rootRef}>
      <button type="button" aria-label="Menú" aria-expanded={panel !== "closed"} aria-haspopup="menu" onClick={() => setPanel((value) => value === "closed" ? "tools" : "closed")}>
        ···
      </button>
      {panel === "tools" ? (
        <div className="writer-studio-menu-panel" role="menu" aria-label="Herramientas">
          {hasOutline && onToggleMap ? (
            <button type="button" role="menuitem" title="Mapa del documento" aria-label="Mapa del documento" onClick={() => { onToggleMap(); setPanel("closed"); }}>☷</button>
          ) : null}
          <button type="button" role="menuitem" title="Vista" aria-label="Vista" onClick={() => setPanel("view")}>▤</button>
          <button type="button" role="menuitem" title="Diseño de página" aria-label="Diseño de página" onClick={() => setPanel("page")}>▣</button>
          {onToggleMemory ? (
            <button type="button" role="menuitem" title="Memory" aria-label="Memory" onClick={() => { onToggleMemory(); setPanel("closed"); }}>◉</button>
          ) : null}
          <button type="button" role="menuitem" title="Deshacer" aria-label="Deshacer" disabled={!editor?.can().undo()} onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().undo().run()}>↩</button>
          <button type="button" role="menuitem" title="Rehacer" aria-label="Rehacer" disabled={!editor?.can().redo()} onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().redo().run()}>↪</button>
        </div>
      ) : null}
      {panel === "view" && onViewMode && viewMode ? (
        <div className="writer-studio-menu-panel writer-page-palette" role="menu" aria-label="Vista">
          {([
            ["paged", "Páginas"],
            ["continuous", "Continuo"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="menuitemradio"
              aria-label={label}
              aria-checked={viewMode === id}
              className={viewMode === id ? "is-active" : ""}
              onClick={() => { onViewMode(id); setPanel("closed"); }}
            >
              {label}
            </button>
          ))}
          {viewMode === "paged" && onZoomChoice && zoomChoice ? (
            <div className="writer-zoom" role="group" aria-label="Zoom">
              {([
                ["80", "80%"],
                ["100", "100%"],
                ["120", "120%"],
                ["fit", "Ajustar"],
              ] as const).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={zoomChoice === id} onClick={() => onZoomChoice(id)}>
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {panel === "page" ? (
        <div className="writer-studio-menu-panel writer-page-palette" role="menu" aria-label="Diseño de página">
          {WRITER_PAGE_PRESETS.map((item) => (
            <button
              key={item}
              type="button"
              role="menuitemradio"
              title={WRITER_PAGE_PRESET_LABELS[item]}
              aria-label={WRITER_PAGE_PRESET_LABELS[item]}
              aria-checked={item === preset}
              className={item === preset ? "is-active" : ""}
              onClick={() => { onPagePreset(item); setPanel("closed"); }}
            >
              {WRITER_PAGE_MARKS[item]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function WriterAiPanel({
  phase,
  error,
  proposal,
  compare,
  stale,
  canRewrite,
  onContinue,
  onRewrite,
  onAccept,
  onReject,
  onCompare,
  onRetry,
  contextLine,
}: {
  phase: "idle" | "running" | "ready" | "error";
  error: string;
  proposal: WriterAiProposal | null;
  compare: boolean;
  stale: boolean;
  canRewrite: boolean;
  onContinue: () => void;
  onRewrite: () => void;
  onAccept: () => void;
  onReject: () => void;
  onCompare: () => void;
  onRetry: () => void;
  contextLine: string;
}) {
  return (
    <section className="writer-ai-panel" aria-label="Propuesta de Writer">
      <p>Propuesta</p>
      {contextLine ? <span className="writer-ai-context">Contexto: {contextLine}</span> : null}
      {phase === "running" ? <span>Escribiendo una propuesta… Puedes seguir editando.</span> : null}
      {error ? <span className="writer-ai-error">{error}</span> : null}
      {stale ? <span className="writer-ai-error">El texto cambió. Rechaza la propuesta y pídela otra vez.</span> : null}
      {proposal && compare ? (
        <div className="writer-ai-compare">
          <div>
            <p>Ahora</p>
            <div className="writer-ai-proposal">{proposal.original || "En el cursor"}</div>
          </div>
          <div>
            <p>Propuesta</p>
            <div className="writer-ai-proposal">{proposal.text}</div>
          </div>
        </div>
      ) : null}
      {proposal && !compare ? <div className="writer-ai-proposal">{proposal.text}</div> : null}
      <div className="writer-ai-actions">
        {proposal ? (
          <>
            <button type="button" onClick={onAccept} disabled={stale}>
              Aceptar
            </button>
            <button type="button" onClick={onReject}>
              Rechazar
            </button>
            <button type="button" aria-pressed={compare} onClick={onCompare}>
              Comparar
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onContinue} disabled={phase === "running"}>
              Continuar
            </button>
            <button type="button" onClick={onRewrite} disabled={phase === "running" || !canRewrite}>
              Reescribir
            </button>
            {phase === "error" ? (
              <button type="button" onClick={onRetry}>
                Reintentar
              </button>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

const WRITER_STUDIO_CSS = `
.writer-studio {
  position: fixed;
  inset: 0;
  z-index: 100090;
  display: flex;
  flex-direction: column;
  background: #14181c;
  color: #f4f1ea;
  font-family: ui-sans-serif, system-ui, sans-serif;
}
.writer-studio-header { position: relative; z-index: 100210; background: #14181c; }
.writer-story {
  position: absolute;
  inset: 0;
  top: 48px;
  z-index: 100200;
  overflow: hidden;
  background: #14181c;
}
.writer-story-workspace {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}
.writer-story-workspace.is-narrow { grid-template-columns: minmax(0, 1fr); }
.writer-story-sidebar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  padding: 16px 12px 12px;
  border-right: 1px solid rgba(255,255,255,0.08);
}
.writer-story-brand {
  align-self: flex-start;
  background: transparent;
  border: 0;
  color: inherit;
  font-size: 13px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 4px 8px;
  border-radius: 4px;
}
.writer-story-brand.is-active { background: rgba(255,255,255,0.06); }
.writer-story-search {
  width: 100%;
  box-sizing: border-box;
  border: 0;
  border-bottom: 1px solid rgba(255,255,255,0.16);
  background: transparent;
  color: inherit;
  font: inherit;
  padding: 8px 4px;
}
.writer-story-nav-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.writer-story-nav-group { display: flex; flex-direction: column; gap: 2px; }
.writer-story-nav-group h2,
.writer-story h2 {
  margin: 0 0 4px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.45);
  font-weight: 500;
}
.writer-story-nav-row {
  width: 100%;
  text-align: left;
  background: transparent;
  border: 0;
  color: inherit;
  font: inherit;
  padding: 6px 8px;
  border-radius: 4px;
}
.writer-story-nav-row.is-active,
.writer-story-nav-row[aria-current="page"] { background: rgba(255,255,255,0.08); }
.writer-story-ideas-row { display: flex; justify-content: space-between; align-items: center; }
.writer-story-badge { font-size: 12px; color: rgba(255,255,255,0.45); }
.writer-story-sidebar-foot { margin-top: auto; padding-top: 8px; }
.writer-story-new-wrap { position: relative; }
.writer-story-new {
  background: transparent;
  border: 0;
  color: rgba(255,255,255,0.72);
  font: inherit;
  padding: 6px 8px;
}
.writer-story-popover {
  position: absolute;
  left: 0;
  bottom: calc(100% + 6px);
  min-width: 180px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  background: #1b2025;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px;
  z-index: 5;
}
.writer-story-popover button {
  width: 100%;
  text-align: left;
  background: transparent;
  border: 0;
  color: inherit;
  font: inherit;
  padding: 7px 8px;
  border-radius: 4px;
}
.writer-story-popover button:hover { background: rgba(255,255,255,0.06); }
.writer-story-popover hr { width: 100%; border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 4px 0; }
.writer-story-popover .is-danger { color: #f0b4a8; }
.writer-story-menu { right: 0; left: auto; bottom: auto; top: calc(100% + 4px); }
.writer-story-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
}
.writer-story-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px 28px 24px;
}
.writer-story-readable {
  width: min(820px, 100%);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.writer-story h1 { margin: 0; font-size: 28px; font-weight: 560; }
.writer-story p { margin: 0; }
.writer-story section { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.writer-story-brief { font-size: 16px; line-height: 1.45; color: rgba(255,255,255,0.9); max-width: 42rem; }
.writer-story-meta { color: rgba(255,255,255,0.5); font-size: 13px; }
.writer-story-status { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; width: 100%; }
.writer-story-status button { background: transparent; border: 0; padding: 0; color: inherit; font: inherit; cursor: pointer; white-space: nowrap; }
.writer-story-status button:disabled { opacity: 0.45; cursor: default; }
.writer-story-clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; max-width: 42rem; }
.writer-story-plain-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 8px 0;
  border: 0;
  border-top: 1px solid rgba(255,255,255,0.08);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
}
.writer-story-plain-row:hover { color: white; }
.writer-story-muted { color: rgba(255,255,255,0.45); font-size: 13px; }
.writer-story-pending { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; font-size: 13px; color: rgba(255,255,255,0.55); }
.writer-story-chips { line-height: 1.7; }
.writer-story-chip-link,
.writer-story-linkish,
.writer-story-prose,
.writer-story-back,
.writer-story-icon-btn {
  background: transparent;
  border: 0;
  color: inherit;
  font: inherit;
  padding: 0;
  text-align: left;
}
.writer-story-chip-link { color: rgba(255,255,255,0.86); }
.writer-story-linkish { color: rgba(255,255,255,0.72); font-size: 14px; }
.writer-story-prose { white-space: pre-wrap; line-height: 1.55; color: rgba(255,255,255,0.9); }
.writer-story-back { color: rgba(255,255,255,0.55); font-size: 13px; margin-bottom: 8px; }
.writer-story-entity-header { display: flex; flex-direction: column; gap: 4px; position: sticky; top: 0; background: #14181c; padding-bottom: 8px; z-index: 2; }
.writer-story-entity-title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; }
.writer-story-entity-kind { font-size: 12px; color: rgba(255,255,255,0.45); }
.writer-story-menu-wrap { position: relative; }
.writer-story-icon-btn { padding: 4px 8px; color: rgba(255,255,255,0.55); border-radius: 4px; }
.writer-story-icon-btn:hover { background: rgba(255,255,255,0.06); }
.writer-story-candidate { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; margin: 8px 0; }
.writer-story-relation-row { display: flex; justify-content: space-between; gap: 12px; width: 100%; background: none; border: 0; padding: 4px 0; text-align: left; cursor: pointer; color: inherit; }
.writer-story-relation-add { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.writer-story-section-head { display: flex; align-items: baseline; justify-content: space-between; width: 100%; gap: 12px; }
.writer-story-section-head h2 { margin: 0; }
.writer-story-notes { width: 100%; }
.writer-story-note {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.writer-story-note-body { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; flex: 1; min-width: 0; }
.writer-story-note-menu { opacity: 0; }
.writer-story-note:hover .writer-story-note-menu,
.writer-story-note:focus-within .writer-story-note-menu { opacity: 1; }
.writer-story-idea-mark { font-size: 12px; color: rgba(255,255,255,0.45); }
.writer-story-composer {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
}
.writer-story input,
.writer-story textarea {
  width: 100%;
  box-sizing: border-box;
  border: 0;
  border-bottom: 1px solid rgba(255,255,255,0.16);
  background: transparent;
  color: inherit;
  font: inherit;
  padding: 8px 0;
}
.writer-story textarea { min-height: 72px; resize: vertical; }
.writer-story-inline-actions { display: flex; gap: 12px; }
.writer-story-inline-actions button,
.writer-story-pending button,
.writer-story-ask-actions button {
  background: transparent;
  border: 0;
  color: rgba(255,255,255,0.72);
  font: inherit;
  padding: 0;
}
.writer-story-list { display: flex; flex-direction: column; gap: 4px; width: 100%; }
.writer-story-list-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  text-align: left;
  background: transparent;
  border: 0;
  color: inherit;
  font: inherit;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.writer-story-list-meta { font-size: 12px; color: rgba(255,255,255,0.45); }
.writer-story-hit {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  text-align: left;
  background: transparent;
  border: 0;
  color: inherit;
  font: inherit;
  padding: 8px;
  border-radius: 4px;
}
.writer-story-hit:hover { background: rgba(255,255,255,0.06); }
.writer-story-hit-label { font-size: 11px; letter-spacing: 0.08em; color: rgba(255,255,255,0.45); }
.writer-story-hit-snippet { font-size: 13px; color: rgba(255,255,255,0.82); }
.writer-story-search-results { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 4px; }
.writer-story-dock {
  flex-shrink: 0;
  border-top: 1px solid rgba(255,255,255,0.08);
  background: #14181c;
  padding: 10px 16px 12px;
}
.writer-story-tray {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  max-width: 820px;
  margin: 0 auto 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.writer-story-tray-head { display: flex; align-items: center; justify-content: space-between; width: 100%; }
.writer-story-tray-q { font-size: 13px; color: rgba(255,255,255,0.45); }
.writer-story-kicker { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.45); }
.writer-story-thread { font-size: 12px; color: rgba(255,255,255,0.45); }
.writer-story-basis { font-size: 12px; color: rgba(255,255,255,0.55); }
.writer-story-flash { font-size: 12px; color: rgba(215,196,163,0.9); }
.writer-story-ask-actions { display: flex; flex-wrap: wrap; gap: 12px; }
.writer-story-dock-form {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: end;
  max-width: 820px;
  margin: 0 auto;
}
.writer-story-dock-chip {
  font-size: 12px;
  color: rgba(255,255,255,0.55);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 999px;
  padding: 4px 10px;
  margin-bottom: 6px;
}
.writer-story-dock-form textarea {
  min-height: 36px;
  max-height: 96px;
  resize: none;
  border-bottom-color: rgba(255,255,255,0.12);
}
.writer-story-dock-send {
  background: transparent;
  border: 0;
  color: #d7c4a3;
  font-size: 16px;
  padding: 6px 8px;
}
.writer-story-dock-error { color: #f0b4a8; font-size: 13px; max-width: 820px; margin: 0 auto 8px; }
.writer-story-confirm { display: flex; flex-direction: column; gap: 8px; padding: 4px; }
.writer-story-alias-form { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.writer-story-empty { display: flex; flex-direction: column; gap: 12px; }
.writer-story-subview { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; width: 100%; }
.writer-studio-page .tiptap .writer-block-flash { animation: writer-block-flash 1.6s ease; }
@keyframes writer-block-flash {
  0% { background: rgba(215, 196, 163, 0.38); }
  100% { background: transparent; }
}
.writer-studio-header,
.writer-studio-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 18px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.writer-studio-brand {
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #d7c4a3;
}
.writer-studio-title {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 0;
  color: inherit;
  font-size: 15px;
  outline: none;
}
.writer-studio-title::placeholder { color: rgba(255,255,255,0.35); }
.writer-studio-status {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: rgba(255,255,255,0.55);
  white-space: nowrap;
}
.writer-studio-status.is-error { color: #f0b4a8; }
.writer-status-page { padding: 0; color: inherit; cursor: pointer; }
.writer-goto input {
  width: 4.5em;
  background: transparent;
  color: inherit;
  border: 0;
  border-bottom: 1px solid rgba(255,255,255,0.35);
  font: inherit;
  font-size: 12px;
  outline: none;
}
.writer-zoom { display: flex; gap: 2px; }
.writer-studio-message {
  margin: 48px auto;
  max-width: 420px;
  text-align: center;
  color: rgba(255,255,255,0.72);
}
.writer-studio-close,
.writer-studio-toolbar button,
.writer-studio-toolbar select {
  background: rgba(255,255,255,0.06);
  color: inherit;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 13px;
}
.writer-studio-toolbar button.is-active {
  background: #f4f1ea;
  color: #1c1915;
}
.writer-studio-toolbar button:disabled { opacity: 0.35; }
.writer-studio-field {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(255,255,255,0.55);
}
.writer-studio-menu { position: relative; margin-left: auto; }
.writer-studio-menu-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 2;
  display: flex;
  gap: 2px;
  padding: 4px;
  background: #1c2126;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px;
  box-shadow: 0 16px 40px rgba(0,0,0,0.35);
}
.writer-studio-menu-panel button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 28px;
  margin: 0;
  padding: 0;
  text-align: center;
  border-radius: 4px;
}
.writer-studio-menu-panel button:hover:not(:disabled) { background: rgba(255,255,255,0.08); }
.writer-studio-menu-panel button:disabled { opacity: 0.35; }
.writer-studio-menu-panel button.is-active,
.writer-page-palette button[aria-checked="true"] {
  background: rgba(255,255,255,0.1);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.16);
}
.writer-page-palette button { width: auto; min-width: 32px; padding: 0 8px; }
.writer-block-handle {
  position: fixed;
  z-index: 100110;
  width: 18px;
  height: 18px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 4px;
  transform: translate(-100%, -50%);
  background: transparent;
  color: #6d675f;
  font-size: 16px;
  line-height: 1;
}
.writer-block-handle:hover { color: #1c1915; background: rgba(28,25,21,0.06); }
.writer-block-palette {
  position: fixed;
  z-index: 100120;
  display: flex;
  align-items: center;
  gap: 2px;
  height: 28px;
  margin: 0;
  padding: 2px;
  background: #1c2126;
  color: #f4f1ea;
  border-radius: 8px;
  box-shadow: 0 10px 24px rgba(0,0,0,0.32);
}
.writer-block-palette button {
  width: 28px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  line-height: 1;
}
.writer-block-palette button:hover { background: rgba(255,255,255,0.08); }
.writer-block-palette button[aria-pressed="true"] {
  background: rgba(255,255,255,0.1);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.18);
}
.writer-context-kicker { letter-spacing: 0.04em; }
.writer-studio-workspace { display: flex; flex: 1; min-height: 0; }
.writer-studio-main { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; }
.writer-memory {
  width: 280px;
  flex: none;
  overflow: auto;
  padding: 22px 14px;
  border-left: 1px solid rgba(255,255,255,0.08);
}
.writer-memory header { display: flex; align-items: center; justify-content: space-between; }
.writer-memory header button { background: transparent; border: 0; color: inherit; font: inherit; }
.writer-memory-row {
  display: flex;
  width: 100%;
  justify-content: space-between;
  gap: 12px;
  background: transparent;
  border: 0;
  color: inherit;
  padding: 7px 0;
  text-align: left;
}
.writer-memory-row em { font-style: normal; color: rgba(255,255,255,0.45); }
.writer-memory > p,
.writer-memory h2 {
  margin: 0 0 10px;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.45);
}
.writer-memory textarea {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  margin-bottom: 8px;
  padding: 8px;
  background: rgba(255,255,255,0.04);
  color: inherit;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 4px;
  font: inherit;
  font-size: 14px;
}
.writer-memory input {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 12px;
  padding: 8px;
  background: transparent;
  color: inherit;
  border: 0;
  border-bottom: 1px solid rgba(255,255,255,0.12);
  font: inherit;
  font-size: 14px;
  outline: none;
}
.writer-memory-actions { display: flex; gap: 8px; margin-bottom: 18px; }
.writer-memory button {
  background: rgba(255,255,255,0.06);
  color: inherit;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 13px;
}
.writer-memory-group { margin-top: 8px; }
.writer-memory-group.is-canon h2 { color: #d7c4a3; }
.writer-memory-group.is-idea h2 { color: #b7c7d6; }
.writer-memory-group span { display: block; margin-bottom: 12px; font-size: 13px; color: rgba(255,255,255,0.5); }
.writer-memory article { margin: 0 0 12px; }
.writer-memory article p { margin: 0 0 6px; font-size: 14px; line-height: 1.4; text-transform: none; letter-spacing: 0; color: inherit; }
.writer-memory article button { margin-right: 6px; }
.writer-studio-header button,
.writer-studio-header select {
  background: transparent;
  color: inherit;
  border: 0;
  font: inherit;
  font-size: 13px;
}
.writer-studio-close { font-size: 20px; line-height: 1; padding: 0 4px; }
.writer-studio-workspace { position: relative; display: flex; flex: 1; min-height: 0; }
.writer-studio-map {
  position: absolute;
  z-index: 4;
  left: 16px;
  top: 16px;
  width: 220px;
  max-height: calc(100% - 32px);
  background: #1c2126;
  border: 1px solid rgba(255,255,255,0.12);
  box-shadow: 0 16px 40px rgba(0,0,0,0.35);
}
.writer-ai-panel {
  width: 300px;
  flex: none;
  overflow: auto;
  padding: 16px 14px;
  border-left: 1px solid rgba(255,255,255,0.08);
  background: #1a1f24;
}
.writer-ai-panel p {
  margin: 0 0 8px;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.45);
}
.writer-ai-panel span { display: block; font-size: 13px; color: rgba(255,255,255,0.72); }
.writer-ai-error { color: #f0b4a8 !important; }
.writer-ai-context { color: rgba(255,255,255,0.45) !important; font-size: 12px !important; margin-bottom: 8px; }
.writer-selection-toolbar,
.writer-remember,
.writer-memory-composer {
  position: fixed;
  z-index: 100120;
  background: #1c2126;
  color: #f4f1ea;
  border: 1px solid rgba(255,255,255,0.12);
  box-shadow: 0 12px 32px rgba(0,0,0,0.35);
}
.writer-selection-toolbar {
  position: fixed;
  display: flex;
  align-items: center;
  gap: 2px;
  width: max-content;
  transform: translate(-50%, calc(-100% - 6px));
  padding: 2px 4px;
  border-radius: 8px;
  transition: opacity 160ms ease, transform 160ms ease;
}
.writer-selection-mark {
  width: 22px;
  padding: 2px 0 !important;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 12px !important;
  font-weight: 650;
  letter-spacing: 0;
  opacity: 0.72;
}
.writer-selection-italic { font-style: italic; font-weight: 500; }
.writer-selection-mark[aria-pressed="true"] {
  opacity: 1;
  background: rgba(255,255,255,0.14);
}
.writer-selection-sep {
  width: 1px;
  align-self: stretch;
  margin: 4px 3px;
  background: rgba(255,255,255,0.16);
}
.writer-selection-variants {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  display: flex;
  gap: 2px;
  padding: 2px;
  background: #1c2126;
  border-radius: 8px;
  box-shadow: 0 10px 24px rgba(0,0,0,0.32);
}
.writer-inline {
  position: fixed;
  z-index: 100120;
  width: min(320px, calc(100vw - 32px));
  transform: translate(-50%, calc(-100% - 8px));
  padding: 8px 10px;
  background: #1c2126;
  color: #f4f1ea;
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.35);
}
.writer-inline p { margin: 0 0 6px; font-size: 13px; line-height: 1.4; }
.writer-inline-original { color: rgba(255,255,255,0.42); text-decoration: line-through; }
.writer-inline button,
.writer-context-popover button[type="submit"] {
  background: transparent;
  color: inherit;
  border: 0;
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 12px;
}
.writer-inline button:hover,
.writer-context-popover button[type="submit"]:hover { background: rgba(255,255,255,0.08); }
.writer-context-popover {
  width: 240px;
  padding: 8px 10px;
  border-radius: 8px;
}
.writer-context-popover p { margin: 0 0 6px; font-size: 12px; }
.writer-context-popover textarea { min-height: 52px; font-size: 13px; padding: 6px; }
.writer-selection-toolbar button,
.writer-remember button,
.writer-memory-composer button {
  background: transparent;
  color: inherit;
  border: 0;
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 13px;
}
.writer-selection-toolbar button {
  padding: 3px 6px;
  font-size: 12px;
}
.writer-selection-toolbar button:hover,
.writer-remember button[aria-pressed="true"],
.writer-memory-composer button[aria-pressed="true"] {
  background: rgba(255,255,255,0.08);
}
.writer-remember,
.writer-memory-composer {
  top: 18%;
  left: 50%;
  width: min(420px, calc(100vw - 32px));
  transform: translateX(-50%);
  padding: 14px;
}
.writer-remember p,
.writer-memory-composer p {
  margin: 0 0 10px;
  font-size: 14px;
  line-height: 1.4;
}
.writer-memory-composer textarea {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 8px;
  padding: 8px;
  background: rgba(255,255,255,0.04);
  color: inherit;
  border: 1px solid rgba(255,255,255,0.12);
  font: inherit;
  font-size: 14px;
  resize: vertical;
}
.writer-ai-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.writer-ai-panel button {
  background: rgba(255,255,255,0.06);
  color: inherit;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 13px;
}
.writer-ai-panel button:disabled { opacity: 0.35; }
.writer-ai-proposal {
  white-space: pre-wrap;
  margin: 0 0 12px;
  font-family: Georgia, "Iowan Old Style", Palatino, serif;
  font-size: 16px;
  line-height: 1.45;
}
.writer-ai-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.writer-studio-workspace.has-map .writer-studio-page { padding-left: 8px; }
.writer-studio-map {
  width: 220px;
  flex: none;
  overflow: auto;
  padding: 22px 14px;
  border-right: 1px solid rgba(255,255,255,0.08);
}
.writer-studio-map p {
  margin: 0 0 12px;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.45);
}
.writer-studio-map span { display: block; font-size: 13px; color: rgba(255,255,255,0.55); }
.writer-studio-map button {
  display: flex;
  gap: 8px;
  width: 100%;
  margin: 0 0 6px;
  padding: 8px;
  text-align: left;
  background: transparent;
  color: inherit;
  border: 0;
  font-size: 14px;
}
.writer-studio-map button em { font-style: normal; color: #d7c4a3; }
.writer-studio-page .tiptap .writer-chapter { margin: 2.4em 0 1.4em; }
.writer-studio-page .tiptap h1[data-writer-chapter-title] {
  font-size: 1.7rem;
  line-height: 1.15;
  margin: 0 0 0.55em;
}
.writer-studio-page {
  flex: 1;
  overflow: auto;
  padding: 28px 16px 64px;
}
.writer-studio-page .tiptap {
  width: min(100%, var(--writer-page-width, 794px));
  max-width: var(--writer-page-width, 794px);
  margin: 0 auto;
  min-height: var(--writer-page-min-height, 1123px);
  background: #f7f4ee;
  color: #1c1915;
  border-radius: 2px;
  box-shadow: 0 18px 50px rgba(0,0,0,0.28);
  padding: var(--writer-page-padding, 72px 76px);
  font-family: Georgia, "Iowan Old Style", Palatino, serif;
  font-size: 18px;
  line-height: 1.55;
  outline: none;
  box-sizing: border-box;
}
.writer-studio-page .tiptap h1 { font-size: 2.1rem; line-height: 1.15; margin: 0 0 0.6em; }
.writer-studio-page .tiptap h2 { font-size: 1.45rem; line-height: 1.2; margin: 1.2em 0 0.4em; }
.writer-studio-page .tiptap h3 { font-size: 1.15rem; margin: 1em 0 0.35em; }
.writer-studio-page .tiptap p { margin: 0.7em 0; }
.writer-studio-page .tiptap ul,
.writer-studio-page .tiptap ol { margin: 0.7em 0; padding-left: 1.3em; }
.writer-studio-page .tiptap blockquote {
  margin: 0.8em 0;
  padding-left: 0.9em;
  border-left: 2px solid #c8bfb0;
  color: #3f3a34;
}
.writer-studio-page.is-screenplay .tiptap {
  font-family: "Courier New", Courier, monospace;
  font-size: 16px;
  line-height: 1.35;
}
.writer-sheet-stack { position: relative; }
.writer-studio-page.is-paged { background: #d4cdc2; }
.writer-studio-page.is-paged .tiptap .writer-chapter { margin: 0; }
.writer-studio-page.is-paged .writer-sheet-stack {
  width: var(--writer-page-width, 794px);
  margin: 0 auto;
}
.writer-page-plates {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 0;
}
.writer-page-plate {
  position: relative;
  height: var(--writer-page-height, 1123px);
  margin: 0 0 var(--writer-page-gap, 28px);
  background: #fff;
  border-radius: 2px;
}
.writer-page-plate:last-child { margin-bottom: 0; }
.writer-page-number {
  position: absolute;
  right: 28px;
  bottom: 22px;
  font-size: 11px;
  color: #9a9186;
  user-select: none;
}
.writer-studio-page.is-paged .tiptap {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: none;
  min-height: 0;
  margin: 0;
  background: transparent;
  box-shadow: none;
}
.writer-page-gap {
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  clear: both;
  line-height: 0;
  font-size: 0;
  pointer-events: none;
  user-select: none;
}
.writer-page-break {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 1.6em 0;
  color: #9a9186;
  font-size: 12px;
  letter-spacing: 0.04em;
  user-select: none;
}
.writer-page-break::before,
.writer-page-break::after {
  content: "";
  flex: 1;
  border-top: 1px solid #d9d1c6;
}
.writer-studio-page.is-paged .writer-page-break { display: none; }
.writer-studio-page .tiptap .writer-sp-sceneHeading {
  margin: 1.35em 0 0.7em;
  font-weight: 700;
  text-transform: uppercase;
}
.writer-studio-page .tiptap .writer-sp-action { margin: 0.75em 0; }
.writer-studio-page .tiptap .writer-sp-character {
  margin: 1em 0 0;
  padding-left: 38%;
  text-transform: uppercase;
}
.writer-studio-page .tiptap .writer-sp-dialogue {
  margin: 0;
  padding-left: 18%;
  padding-right: 18%;
}
.writer-studio-page .tiptap .writer-sp-parenthetical {
  margin: 0;
  padding-left: 28%;
  padding-right: 32%;
}
.writer-studio-page .tiptap .writer-sp-paren { user-select: none; }
.writer-studio-page .tiptap .writer-sp-transition {
  margin: 1em 0;
  text-align: right;
  text-transform: uppercase;
}
.writer-studio-page .tiptap h1[data-writer-chapter-title].is-empty::before,
.writer-studio-page .tiptap p.is-editor-empty:first-child::before {
  color: #a39b90;
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}
.writer-studio-page .tiptap .writer-signal-conflict,
.writer-studio-page .tiptap .writer-signal-memory { position: relative; }
.writer-studio-page .tiptap .writer-signal-conflict::after,
.writer-studio-page .tiptap .writer-signal-memory::after {
  position: absolute;
  left: -22px;
  top: 0;
  font-size: 12px;
  color: #8d8478;
  pointer-events: auto;
}
.writer-studio-page .tiptap .writer-signal-conflict::after { content: "⚠"; }
.writer-studio-page .tiptap .writer-signal-memory::after { content: "◉"; }
.writer-memory h2 {
  margin: 16px 0 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.45);
}
.writer-memory article.is-selected > button,
.writer-memory article > button[aria-expanded="true"] { opacity: 1; }
.writer-memory article div[role="menu"] {
  flex: 1 0 100%;
  margin-top: 4px;
  padding: 6px;
  background: rgba(255,255,255,0.04);
  border-radius: 6px;
}
.writer-memory article div[role="menu"] button,
.writer-memory article div[role="menu"] select {
  display: block;
  width: 100%;
  margin-top: 4px;
  text-align: left;
  background: transparent;
  color: inherit;
  border: 0;
  padding: 4px 2px;
}
.writer-memory article div[role="menu"] span {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.45);
}
.writer-memory article { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
.writer-memory article.is-tentative { opacity: 0.62; }
.writer-memory article > button { opacity: 0; background: transparent; border: 0; color: inherit; }
.writer-memory article:hover > button,
.writer-memory article > button[aria-expanded="true"] { opacity: 1; }
.writer-memory article em { font-style: normal; color: #d7c4a3; margin-right: 6px; }
.writer-cursor-ai, .writer-slash, .writer-conflict, .writer-selection-more {
  position: fixed;
  z-index: 100120;
  background: #1c2126;
  color: #f4f1ea;
  border: 1px solid rgba(255,255,255,0.12);
}
.writer-cursor-ai {
  transform: translate(0, calc(-100% - 6px));
  background: #1c2126;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px;
  color: #f4f1ea;
  font-size: 12px;
  padding: 3px 8px;
  box-shadow: 0 10px 24px rgba(0,0,0,0.32);
}
.writer-slash, .writer-selection-more { padding: 4px; border-radius: 8px; box-shadow: 0 12px 32px rgba(0,0,0,0.35); }
.writer-slash button, .writer-selection-more button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  background: transparent;
  color: inherit;
  border: 0;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 13px;
}
.writer-slash button span { width: 22px; opacity: 0.7; }
.writer-slash button[aria-selected="true"],
.writer-slash button:hover { background: rgba(255,255,255,0.08); }
.writer-conflict {
  width: 280px;
  padding: 12px;
  border-radius: 8px;
}
.writer-conflict header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.writer-conflict header p {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.72);
}
.writer-conflict header button {
  background: transparent;
  color: inherit;
  border: 0;
  font-size: 16px;
  line-height: 1;
  padding: 0 2px;
}
.writer-conflict-entity {
  display: block;
  margin: 12px 0 4px;
  font-size: 13px;
  letter-spacing: 0.08em;
}
.writer-conflict-kicker {
  margin: 10px 0 2px;
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.45);
}
.writer-conflict blockquote {
  margin: 0;
  font-size: 14px;
  line-height: 1.4;
}
.writer-conflict blockquote::before { content: "“"; }
.writer-conflict blockquote::after { content: "”"; }
.writer-conflict-rule {
  height: 1px;
  margin: 12px 0 10px;
  background: rgba(255,255,255,0.12);
}
.writer-conflict-actions { display: flex; gap: 8px; }
.writer-conflict-actions button,
.writer-conflict-ai {
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 6px;
  background: rgba(255,255,255,0.08);
  color: inherit;
  font-size: 12px;
  padding: 7px 8px;
}
.writer-conflict-actions button { flex: 1; }
.writer-conflict-ai { display: block; width: 100%; margin-top: 8px; }
.writer-conflict strong { display: block; margin-bottom: 8px; }
.writer-selection-more { position: absolute; top: 100%; right: 0; min-width: 140px; }
`;
