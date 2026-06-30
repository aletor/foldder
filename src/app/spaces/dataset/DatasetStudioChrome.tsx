"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Columns3, Pin, Plus, X } from "lucide-react";

export const DATASET_STUDIO_ACCENT = "#14b8a6";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function DatasetSheetTabBar({
  lists,
  activeSheetId,
  sharedSheetId,
  isShared,
  addingTab,
  newTabName,
  onSelectList,
  onSelectShared,
  onStartAddTab,
  onNewTabNameChange,
  onConfirmNewTab,
  onCancelNewTab,
  onDeleteList,
  canDeleteLists = false,
  onRenameList,
  sharedFieldCount,
  className,
}: {
  lists: Array<{ id: string; name: string; cards: unknown[] }>;
  activeSheetId: string;
  sharedSheetId: string;
  isShared: boolean;
  addingTab: boolean;
  newTabName: string;
  onSelectList: (id: string) => void;
  onSelectShared: () => void;
  onStartAddTab: () => void;
  onNewTabNameChange: (v: string) => void;
  onConfirmNewTab: () => void;
  onCancelNewTab: () => void;
  onDeleteList?: (listId: string) => void;
  canDeleteLists?: boolean;
  onRenameList?: (listId: string, name: string) => void;
  sharedFieldCount: number;
  className?: string;
}) {
  const [renamingListId, setRenamingListId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const cancelRename = useCallback(() => {
    setRenamingListId(null);
    setRenameDraft("");
  }, []);

  const confirmRename = useCallback(() => {
    if (!renamingListId || !onRenameList) {
      cancelRename();
      return;
    }
    const trimmed = renameDraft.trim();
    if (trimmed) onRenameList(renamingListId, trimmed);
    cancelRename();
  }, [cancelRename, onRenameList, renameDraft, renamingListId]);

  useEffect(() => {
    if (!renamingListId) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelRename();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelRename, renamingListId]);

  return (
    <nav
      className={cx("flex h-10 shrink-0 border-b border-white/10 bg-white/[0.06]", className)}
      aria-label="Pestañas del Dataset"
    >
      <div className="custom-scrollbar flex min-w-0 flex-1 overflow-x-auto divide-x divide-white/10">
        {lists.map((list) => {
          const active = !isShared && activeSheetId === list.id;
          const deletable = canDeleteLists && onDeleteList && renamingListId !== list.id;
          const renaming = renamingListId === list.id;
          return (
            <div
              key={list.id}
              className={cx(
                "group/tab flex shrink-0 items-stretch transition",
                active || renaming ? "bg-white text-slate-950" : "text-white/45 hover:bg-white/[0.08] hover:text-white/78",
              )}
            >
              {renaming ? (
                <input
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmRename();
                    if (e.key === "Escape") cancelRename();
                  }}
                  onBlur={confirmRename}
                  aria-label={`Renombrar pestaña ${list.name}`}
                  className="w-28 min-w-0 bg-transparent px-3 text-[9px] font-black uppercase tracking-[0.08em] text-slate-950 outline-none placeholder:text-slate-400"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onSelectList(list.id)}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    if (!onRenameList) return;
                    onSelectList(list.id);
                    setRenamingListId(list.id);
                    setRenameDraft(list.name);
                  }}
                  title={onRenameList ? `${list.name} · doble clic para renombrar` : list.name}
                  aria-current={active ? "page" : undefined}
                  className="flex min-w-0 items-center gap-1.5 px-3 text-[9px] font-black uppercase tracking-[0.08em]"
                >
                  <span className="max-w-[120px] truncate">{list.name}</span>
                  <span className={cx("tabular-nums", active ? "text-slate-600" : "text-white/30")}>
                    {list.cards.length}
                  </span>
                </button>
              )}
              {deletable ? (
                <button
                  type="button"
                  onClick={() => onDeleteList(list.id)}
                  title={`Eliminar «${list.name}»`}
                  aria-label={`Eliminar pestaña ${list.name}`}
                  className={cx(
                    "flex w-7 shrink-0 items-center justify-center transition",
                    active
                      ? "text-slate-400 hover:bg-rose-500/15 hover:text-rose-600"
                      : "text-white/25 opacity-0 group-hover/tab:opacity-100 hover:bg-rose-500/20 hover:text-rose-300",
                  )}
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              ) : null}
            </div>
          );
        })}

        {addingTab ? (
          <div className="flex shrink-0 items-stretch border-l border-white/10">
            <input
              autoFocus
              value={newTabName}
              onChange={(e) => onNewTabNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onConfirmNewTab();
                if (e.key === "Escape") onCancelNewTab();
              }}
              onBlur={onConfirmNewTab}
              placeholder="Nombre…"
              className="w-28 bg-black/30 px-2 text-[10px] font-medium uppercase tracking-wide text-white outline-none placeholder:text-white/28"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={onStartAddTab}
            title="Nueva pestaña"
            className="flex w-10 shrink-0 items-center justify-center text-white/40 transition hover:bg-white/[0.08] hover:text-white/75"
          >
            <Plus size={14} strokeWidth={2.5} />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onSelectShared}
        aria-current={isShared ? "page" : undefined}
        className={cx(
          "flex shrink-0 items-center gap-1.5 border-l border-white/10 px-3 text-[9px] font-black uppercase tracking-[0.08em] transition",
          isShared
            ? "bg-[var(--foldder-studio-accent,#14b8a6)] text-slate-950"
            : "text-white/45 hover:bg-white/[0.08] hover:text-white/78",
        )}
      >
        <Pin size={11} strokeWidth={2.5} className="shrink-0" />
        Compartido
        <span className={cx("tabular-nums", isShared ? "text-slate-700" : "text-white/30")}>{sharedFieldCount}</span>
      </button>
    </nav>
  );
}

export function DatasetStudioMetricsBar({
  rowCount,
  tabCount,
  sharedCount,
  complete,
  gapCount,
  scopeLabel,
  consumerCount,
}: {
  rowCount: number;
  tabCount: number;
  sharedCount: number;
  complete: boolean;
  gapCount: number;
  scopeLabel: string;
  consumerCount: number;
}) {
  return (
    <div className="flex h-10 shrink-0 divide-x divide-white/10 border-b border-white/10 bg-black/30 text-[9px] font-black uppercase tracking-[0.08em] text-white/52">
      <span className="flex min-w-0 flex-1 items-center px-4 text-white/72">
        {complete ? "Listo" : `${gapCount} vacíos`}
      </span>
      <span className="flex items-center px-4 tabular-nums">{rowCount} filas</span>
      <span className="hidden items-center px-4 tabular-nums sm:flex">{tabCount} pest</span>
      <span className="hidden items-center px-4 tabular-nums md:flex">{sharedCount} comp</span>
      <span className="flex items-center px-4 text-white/55">{scopeLabel}</span>
      {consumerCount > 0 ? (
        <span className="hidden items-center px-4 text-[var(--foldder-studio-accent,#14b8a6)] lg:flex">
          {consumerCount} conect.
        </span>
      ) : null}
    </div>
  );
}

export function DatasetStudioNoticeBar({ children, tone }: { children: React.ReactNode; tone: "warn" | "error" | "accent" }) {
  const toneClass =
    tone === "error"
      ? "bg-rose-500/10 text-rose-200/90"
      : tone === "accent"
        ? "bg-[var(--foldder-studio-accent,#14b8a6)]/10 text-white/72"
        : "bg-amber-500/10 text-amber-100/85";
  return (
    <p
      className={cx(
        "border-b border-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.08em]",
        toneClass,
      )}
    >
      {children}
    </p>
  );
}

export function DatasetColumnsToggle({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex h-10 shrink-0 items-center justify-center gap-1.5 border-l border-white/15 bg-black/30 px-3",
        "text-[10px] font-black uppercase tracking-[0.08em] transition",
        active ? "text-[var(--foldder-studio-accent,#14b8a6)]" : "text-white/80 hover:bg-black/45 hover:text-white",
      )}
    >
      <Columns3 size={14} strokeWidth={2.25} />
      Columnas
    </button>
  );
}
