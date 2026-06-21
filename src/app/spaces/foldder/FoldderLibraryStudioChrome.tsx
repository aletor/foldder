"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export type FoldderLibraryTab = "imported" | "generated" | "exported";

export type FoldderLibraryTabItem = {
  id: FoldderLibraryTab;
  label: string;
  count?: number;
};

export function FoldderLibraryStudioTabBar({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: FoldderLibraryTabItem[];
  activeTab: FoldderLibraryTab;
  onTabChange: (tab: FoldderLibraryTab) => void;
}) {
  return (
    <nav
      className="flex h-10 shrink-0 divide-x divide-white/10 border-b border-white/10 bg-white/[0.06]"
      aria-label="Secciones de Foldder"
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2 text-[10px] font-black uppercase tracking-[0.08em] transition sm:px-3",
              active ? "bg-white text-slate-950" : "text-white/60 hover:bg-white/[0.08] hover:text-white/88",
            )}
          >
            <span className="truncate">{tab.label}</span>
            {typeof tab.count === "number" ? (
              <span className={cx("shrink-0 tabular-nums", active ? "text-slate-500" : "text-white/35")}>
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

export function FoldderLibraryOrphanedCollapsible({
  count,
  children,
}: {
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (count <= 0) return null;
  return (
    <div className="mt-6 border-t border-white/10 pt-4" data-foldder-library-orphaned>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 py-1 text-left text-[10px] font-semibold text-white/45 transition hover:text-white/72"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
        <span>Mostrar {count} archivado{count === 1 ? "" : "s"}</span>
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

export function FoldderLibrarySectionKicker({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold text-white/42">
      <span>{label}</span>
      <span className="tabular-nums text-white/25">({count})</span>
    </div>
  );
}

export function FoldderLibraryStudioSection({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cx("py-2", className)}>{children}</section>;
}

export function FoldderLibraryEmptyState({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="border border-dashed border-white/10 bg-white/[0.02] px-6 py-14 text-center">
      <p className="text-[13px] font-semibold text-white/55">{children}</p>
      {hint ? <p className="mt-2 text-[11px] leading-relaxed text-white/35">{hint}</p> : null}
    </div>
  );
}

export function FoldderLibraryAssetGrid({ children, variant = "media" }: { children: React.ReactNode; variant?: "media" | "list" }) {
  if (variant === "list") {
    return <ul className="foldder-library-list divide-y divide-white/10 border border-white/10">{children}</ul>;
  }
  return (
    <ul className="foldder-library-grid grid grid-cols-2 border-t border-l border-white/10 md:grid-cols-3 xl:grid-cols-4">
      {children}
    </ul>
  );
}

export function FoldderLibraryAssetCell({ children }: { children: React.ReactNode }) {
  return <li className="border-b border-r border-white/10">{children}</li>;
}

export function FoldderLibraryTextList({ children }: { children: React.ReactNode }) {
  return <ul className="mt-6 divide-y divide-white/10 border border-white/10">{children}</ul>;
}

export function FoldderLibraryTextListItem({ children }: { children: React.ReactNode }) {
  return <li className="bg-transparent transition hover:bg-white/[0.03]">{children}</li>;
}
