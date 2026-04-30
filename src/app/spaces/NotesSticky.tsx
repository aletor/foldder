"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal, Plus, StickyNote } from "lucide-react";
import { NodeIcon } from "./foldder-icons";

export const NOTE_WIDTH = 280;
export const NOTE_HEIGHT = 220;
export const NOTE_GAP = 20;
export const NOTE_MARGIN = 32;
export const NOTE_MIN_WIDTH = 220;
export const NOTE_MIN_HEIGHT = 160;
export const NOTE_MAX_WIDTH = 720;
export const NOTE_MAX_HEIGHT = 640;
const NOTE_EDITOR_DEBOUNCE_MS = 520;

export type NotesNodeData = {
  label?: string;
  title?: string;
  contentHtml: string;
  contentMarkdown: string;
  plainText: string;
  value?: string;
  color?: "yellow";
  updatedAt: string;
};

type NotesDerivedFields = Pick<NotesNodeData, "contentHtml" | "contentMarkdown" | "plainText" | "value" | "updatedAt">;

type NotesStickyCardProps = {
  nodeId: string;
  mode: "node" | "desktop";
  title?: string;
  contentHtml: string;
  selected?: boolean;
  onChange: (patch: Partial<NotesNodeData>) => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onDesktopMoveBy?: (dxPx: number, dyPx: number) => void;
  onAutoHeightChange?: (heightPx: number) => void;
};

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeTitle(value: string | undefined): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || "Note";
}

function normalizeHtml(raw: string | undefined): string {
  const html = typeof raw === "string" ? raw.trim() : "";
  return html ? html : "<p></p>";
}

function collapseMarkdown(md: string): string {
  return md
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function fallbackPlainTextFromHtml(html: string): string {
  return collapseMarkdown(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|ul|ol)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " "),
  );
}

function fallbackMarkdownFromHtml(html: string): string {
  return collapseMarkdown(
    html
      .replace(/<(strong|b)>(.*?)<\/(strong|b)>/gi, "**$2**")
      .replace(/<(em|i)>(.*?)<\/(em|i)>/gi, "*$2*")
      .replace(/<(s|strike|del)>(.*?)<\/(s|strike|del)>/gi, "~~$2~~")
      .replace(/<li>(.*?)<\/li>/gi, "- $1\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|ul|ol)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " "),
  );
}

function inlineMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const children = Array.from(el.childNodes).map(inlineMarkdown).join("");
  if (tag === "br") return "\n";
  if (tag === "strong" || tag === "b") return children ? `**${children}**` : "";
  if (tag === "em" || tag === "i") return children ? `*${children}*` : "";
  if (tag === "s" || tag === "strike" || tag === "del") return children ? `~~${children}~~` : "";
  return children;
}

function blockMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === "ul") {
    return Array.from(el.children)
      .filter((child) => child.tagName.toLowerCase() === "li")
      .map((child) => `- ${collapseMarkdown(inlineMarkdown(child)).replace(/\n/g, " ").trim()}`)
      .join("\n");
  }
  if (tag === "ol") {
    return Array.from(el.children)
      .filter((child) => child.tagName.toLowerCase() === "li")
      .map((child, index) => `${index + 1}. ${collapseMarkdown(inlineMarkdown(child)).replace(/\n/g, " ").trim()}`)
      .join("\n");
  }
  if (tag === "li") return collapseMarkdown(inlineMarkdown(el));
  if (tag === "p" || tag === "div") return collapseMarkdown(inlineMarkdown(el));
  if (tag === "br") return "\n";
  return collapseMarkdown(inlineMarkdown(el));
}

export function deriveNotesFields(contentHtml: string): NotesDerivedFields {
  const normalizedHtml = normalizeHtml(contentHtml);
  if (typeof document === "undefined") {
    const contentMarkdown = fallbackMarkdownFromHtml(normalizedHtml);
    const plainText = fallbackPlainTextFromHtml(normalizedHtml);
    return {
      contentHtml: normalizedHtml,
      contentMarkdown,
      plainText,
      value: contentMarkdown || plainText,
      updatedAt: nowIso(),
    };
  }
  const container = document.createElement("div");
  container.innerHTML = normalizedHtml;
  const blocks = Array.from(container.childNodes)
    .map(blockMarkdown)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const contentMarkdown = collapseMarkdown(blocks.join("\n\n"));
  const plainText = collapseMarkdown(container.innerText ?? "");
  return {
    contentHtml: normalizedHtml,
    contentMarkdown,
    plainText,
    value: contentMarkdown || plainText,
    updatedAt: nowIso(),
  };
}

export function createEmptyNotesNodeData(title = "Note"): NotesNodeData {
  const derived = deriveNotesFields("<p></p>");
  return {
    title,
    label: title,
    color: "yellow",
    ...derived,
  };
}

export function normalizeNotesNodeData(raw: unknown): NotesNodeData {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const title = normalizeTitle(typeof input.title === "string" ? input.title : typeof input.label === "string" ? input.label : "Note");
  const contentHtml = normalizeHtml(typeof input.contentHtml === "string" ? input.contentHtml : typeof input.value === "string" ? input.value : "");
  const derived = deriveNotesFields(contentHtml);
  return {
    title,
    label: typeof input.label === "string" ? input.label : title,
    color: "yellow",
    ...derived,
  };
}

function execEditorCommand(command: string) {
  document.execCommand(command, false);
}

function ToolbarButton({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className="nodrag nopan inline-flex h-7 min-w-7 items-center justify-center rounded-lg border border-black/8 bg-white/55 px-2 text-[11px] font-semibold text-[#5f5007] shadow-[0_1px_2px_rgba(73,56,0,0.08)] transition hover:bg-white/80"
    >
      {label}
    </button>
  );
}

export function NotesStickyCard({
  nodeId,
  mode,
  title,
  contentHtml,
  selected = false,
  onChange,
  onDuplicate,
  onDelete,
  onDesktopMoveBy,
  onAutoHeightChange,
}: NotesStickyCardProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const commitTimerRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const onAutoHeightChangeRef = useRef(onAutoHeightChange);
  const lastReportedHeightRef = useRef<number | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(normalizeTitle(title));
  const [editorUnlocked, setEditorUnlocked] = useState(mode === "desktop");
  const [dragState, setDragState] = useState<{
    kind: "move";
    startX: number;
    startY: number;
  } | null>(null);
  const selectionRangeRef = useRef<Range | null>(null);
  const displayTitle = normalizeTitle(title);
  const emptyContent = useMemo(() => {
    const derived = deriveNotesFields(contentHtml);
    return !derived.plainText;
  }, [contentHtml]);

  useEffect(() => {
    setDraftTitle(displayTitle);
  }, [displayTitle]);

  useEffect(() => {
    if (mode === "desktop") setEditorUnlocked(true);
  }, [mode]);

  useEffect(() => {
    onAutoHeightChangeRef.current = onAutoHeightChange;
  }, [onAutoHeightChange]);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (document.activeElement === editor) return;
    const nextHtml = normalizeHtml(contentHtml);
    if (editor.innerHTML !== nextHtml) editor.innerHTML = nextHtml;
  }, [contentHtml]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!dragState || mode !== "desktop") return;
    const onPointerMove = (event: PointerEvent) => {
      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;
      onDesktopMoveBy?.(dx, dy);
      setDragState({
        ...dragState,
        startX: event.clientX,
        startY: event.clientY,
      });
    };
    const onPointerUp = () => setDragState(null);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [dragState, mode, onDesktopMoveBy]);

  const measureAutoHeightNow = useCallback(() => {
    const notifyAutoHeightChange = onAutoHeightChangeRef.current;
    if (!notifyAutoHeightChange) return;
    const headerHeight = Math.ceil(headerRef.current?.getBoundingClientRect().height ?? 0);
    const isEditingVisible = mode === "desktop" || editorUnlocked;
    const activeContentEl = isEditingVisible ? editorRef.current : previewRef.current;
    const toolbarHeight = isEditingVisible
      ? Math.ceil(toolbarRef.current?.getBoundingClientRect().height ?? 0)
      : 0;
    const activeContentHeight = activeContentEl ? Math.ceil(activeContentEl.scrollHeight) : 0;
    const measuredContentHeight = !isEditingVisible
      ? Math.ceil(measureRef.current?.scrollHeight ?? 0)
      : 0;
    const contentHeight = Math.max(84, activeContentHeight, measuredContentHeight);
    // Header + content vertical padding (pt-2 + pb-3) + toolbar/content stack.
    const nextHeight = Math.max(NOTE_HEIGHT, headerHeight + 20 + toolbarHeight + contentHeight);
    if (lastReportedHeightRef.current !== null && Math.abs(lastReportedHeightRef.current - nextHeight) < 1) {
      return;
    }
    lastReportedHeightRef.current = nextHeight;
    notifyAutoHeightChange(nextHeight);
  }, [editorUnlocked, mode]);

  const requestAutoHeightMeasure = useCallback(() => {
    window.requestAnimationFrame(measureAutoHeightNow);
  }, [measureAutoHeightNow]);

  useLayoutEffect(() => {
    requestAutoHeightMeasure();
  }, [contentHtml, displayTitle, editorUnlocked, mode, requestAutoHeightMeasure]);

  const commitEditor = useCallback(
    (html: string) => {
      const derived = deriveNotesFields(html);
      onChange(derived);
    },
    [onChange],
  );

  const flushPendingCommit = useCallback(() => {
    if (commitTimerRef.current !== null) {
      window.clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    commitEditor(editorRef.current?.innerHTML ?? contentHtml);
  }, [commitEditor, contentHtml]);

  useEffect(() => () => {
    if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current);
  }, []);

  const scheduleCommit = useCallback(() => {
    if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current);
    commitTimerRef.current = window.setTimeout(() => {
      commitTimerRef.current = null;
      commitEditor(editorRef.current?.innerHTML ?? contentHtml);
    }, NOTE_EDITOR_DEBOUNCE_MS);
  }, [commitEditor, contentHtml]);

  const commitTitle = useCallback(() => {
    const normalized = normalizeTitle(draftTitle);
    setDraftTitle(normalized);
    setEditingTitle(false);
    onChange({
      title: normalized,
      label: normalized,
      updatedAt: nowIso(),
    });
  }, [draftTitle, onChange]);

  const copyAsPrompt = useCallback(async () => {
    const derived = deriveNotesFields(editorRef.current?.innerHTML ?? contentHtml);
    const payload = derived.contentMarkdown || derived.plainText;
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      // no-op: clipboard might be unavailable in some contexts
    }
    setMenuOpen(false);
  }, [contentHtml]);

  const rememberSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    selectionRangeRef.current = selection.getRangeAt(0).cloneRange();
  }, []);

  const restoreSelectionAndFocus = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    if (selectionRangeRef.current) {
      selection.addRange(selectionRangeRef.current);
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.addRange(range);
  }, []);

  const runFormattingCommand = useCallback((command: string) => {
    restoreSelectionAndFocus();
    execEditorCommand(command);
    scheduleCommit();
    requestAutoHeightMeasure();
    rememberSelection();
  }, [rememberSelection, requestAutoHeightMeasure, restoreSelectionAndFocus, scheduleCommit]);

  return (
    <div
      ref={rootRef}
      data-note-id={nodeId}
      className={`group/note relative flex h-full w-full flex-col overflow-hidden border bg-[#f4d95d] text-[#5a4a09] shadow-[0_10px_28px_rgba(74,55,0,0.18)] ${selected ? "border-[#b48500]/70" : "border-[#c8ac34]/78"} ${mode === "node" && !editorUnlocked ? "notes-drag-surface notes-node__header cursor-grab active:cursor-grabbing" : ""}`}
      style={{
        backgroundImage:
          "linear-gradient(180deg,rgba(255,255,255,0.2),rgba(255,255,255,0.03) 24%,rgba(0,0,0,0.025)),radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent 42%)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 z-[3] h-12 w-12 border-l border-b border-[#c0a131]/65 bg-[linear-gradient(135deg,rgba(255,249,212,0.98)_0%,rgba(243,225,134,0.96)_46%,rgba(225,189,60,0.95)_100%)] shadow-[-4px_4px_8px_rgba(94,70,0,0.1)] [clip-path:polygon(100%_0,0_0,100%_100%)]"
      />

      <div
        ref={headerRef}
        className={`notes-node__header relative z-[2] flex items-center gap-2 bg-transparent px-3 py-2 ${mode === "node" ? "notes-drag-surface" : ""}`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-black/8 bg-white/38 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]">
          <NodeIcon type="notes" size={14} colorOverride="#6a5606" selected={selected} />
        </span>
        {mode === "desktop" && editingTitle ? (
          <input
            ref={titleInputRef}
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") commitTitle();
              if (event.key === "Escape") {
                setDraftTitle(displayTitle);
                setEditingTitle(false);
              }
            }}
            className="nodrag nopan min-w-0 flex-1 rounded-md border border-black/10 bg-white/55 px-2 py-1 text-[12px] font-medium outline-none focus:border-[#9a7d16]"
          />
        ) : mode === "desktop" ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setEditingTitle(true);
            }}
            className="nodrag nopan min-w-0 flex-1 truncate text-left text-[12px] font-semibold text-[#614f09]"
            title="Editar título"
          >
            {displayTitle}
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate text-left text-[12px] font-semibold text-[#614f09]">
            {displayTitle}
          </span>
        )}
        {mode === "desktop" ? (
          <div ref={menuRef} className="relative nodrag nopan">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen((open) => !open);
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-black/8 bg-white/38 text-[#6b580a] transition hover:bg-white/64"
              title="Más acciones"
            >
              <MoreHorizontal size={14} />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 top-[calc(100%+6px)] z-[20] min-w-[152px] rounded-xl border border-black/10 bg-[#fff4be] p-1.5 text-[12px] shadow-[0_10px_22px_rgba(66,49,0,0.18)]">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDuplicate?.();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-black/5"
                >
                  <Plus size={13} />
                  Duplicate note
                </button>
                <button
                  type="button"
                  onClick={copyAsPrompt}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-black/5"
                >
                  <StickyNote size={13} />
                  Copy as prompt
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete?.();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[#8b330f] transition hover:bg-[#ffede0]"
                >
                  <span className="text-[13px]">×</span>
                  Delete note
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="relative flex-1 overflow-hidden px-3 pb-3 pt-2">
        <div
          ref={measureRef}
          aria-hidden
          className="pointer-events-none absolute left-3 top-2 z-[-1] w-[calc(100%-24px)] opacity-0"
        >
          {(mode === "desktop" || editorUnlocked) ? <div className="mb-2 h-7" /> : null}
          <div
            className="px-1 py-1 text-[13px] leading-relaxed text-[#4e4106] [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-1 [&_p]:min-h-[1.2em] [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: normalizeHtml(contentHtml) }}
          />
        </div>
        <div
          className={`pointer-events-none absolute left-3 right-3 top-[46px] text-[13px] leading-relaxed text-[#705e16]/45 transition ${emptyContent && !isFocused ? "opacity-100" : "opacity-0"}`}
        >
          Write a quick note…
        </div>
        {mode === "desktop" || editorUnlocked ? (
          <div
            ref={toolbarRef}
            className={`mb-2 flex items-center gap-1 transition-opacity duration-150 ${isFocused || (mode === "node" && editorUnlocked) ? "opacity-100" : "opacity-55 group-hover/note:opacity-80"}`}
          >
            <ToolbarButton label="B" title="Negrita" onClick={() => runFormattingCommand("bold")} />
            <ToolbarButton label="I" title="Cursiva" onClick={() => runFormattingCommand("italic")} />
            <ToolbarButton label="S" title="Tachado" onClick={() => runFormattingCommand("strikeThrough")} />
            <ToolbarButton label="•" title="Lista" onClick={() => runFormattingCommand("insertUnorderedList")} />
            <ToolbarButton label="1." title="Lista numerada" onClick={() => runFormattingCommand("insertOrderedList")} />
          </div>
        ) : null}
        {mode === "node" && !editorUnlocked ? (
          <div
            ref={previewRef}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setEditorUnlocked(true);
              requestAnimationFrame(() => {
                const editor = editorRef.current;
                if (!editor) return;
                editor.focus();
                const selection = window.getSelection();
                if (!selection) return;
                const range = document.createRange();
                range.selectNodeContents(editor);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
                selectionRangeRef.current = range.cloneRange();
              });
            }}
            className="notes-drag-surface nowheel min-h-[84px] cursor-grab select-none overflow-visible px-1 py-1 text-[13px] leading-relaxed text-[#4e4106] active:cursor-grabbing touch-none [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-1 [&_p]:min-h-[1.2em] [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: normalizeHtml(contentHtml) }}
          />
        ) : null}
        <div
          ref={editorRef}
          data-foldder-text-editing={mode === "desktop" || editorUnlocked ? "true" : undefined}
          contentEditable
          suppressContentEditableWarning
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            if (mode === "node") setEditorUnlocked(false);
            flushPendingCommit();
          }}
          onInput={() => {
            rememberSelection();
            scheduleCommit();
            requestAutoHeightMeasure();
          }}
          onKeyUp={rememberSelection}
          onMouseUp={rememberSelection}
          onKeyDown={(event) => {
            event.stopPropagation();
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
              event.preventDefault();
              runFormattingCommand("bold");
              return;
            }
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "i") {
              event.preventDefault();
              runFormattingCommand("italic");
              return;
            }
            if (event.key === "Escape") {
              (event.currentTarget as HTMLDivElement).blur();
            }
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.stopPropagation()}
          className={`nowheel min-h-[84px] overflow-visible px-1 py-1 text-[13px] leading-relaxed text-[#4e4106] outline-none [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-1 [&_p]:min-h-[1.2em] [&_ul]:list-disc [&_ul]:pl-5 ${mode === "desktop" || editorUnlocked ? "block cursor-text" : "hidden"} ${mode === "desktop" || editorUnlocked ? "nodrag nopan" : ""}`}
        />
      </div>
    </div>
  );
}
