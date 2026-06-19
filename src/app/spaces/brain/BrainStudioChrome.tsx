"use client";

import React from "react";
import {
  BookOpen,
  CircleHelp,
  ImageIcon,
  LayoutDashboard,
  MessageSquareText,
  Sparkles,
} from "lucide-react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export type BrainPrimarySectionTab = "overview" | "sources" | "dna" | "looks" | "review" | "diagnostics";

export type BrainStudioTabItem = {
  id: BrainPrimarySectionTab;
  label: string;
  icon: React.ReactNode;
  testId?: string;
};

export const BRAIN_STUDIO_PRIMARY_TABS: BrainStudioTabItem[] = [
  { id: "overview", label: "Atmósfera", icon: <LayoutDashboard size={11} aria-hidden />, testId: "brain-tab-overview" },
  { id: "sources", label: "Fuentes", icon: <BookOpen size={11} aria-hidden />, testId: "brain-tab-sources" },
  { id: "dna", label: "ADN", icon: <Sparkles size={11} aria-hidden />, testId: "brain-tab-dna" },
  { id: "looks", label: "Looks", icon: <ImageIcon size={11} aria-hidden />, testId: "brain-tab-looks" },
  { id: "review", label: "Aprendizajes", icon: <MessageSquareText size={11} aria-hidden />, testId: "brain-tab-review" },
  { id: "diagnostics", label: "Diagnóstico", icon: <CircleHelp size={11} aria-hidden />, testId: "brain-tab-diagnostics" },
];

export function BrainStudioTabBar({
  tabs = BRAIN_STUDIO_PRIMARY_TABS,
  activeTab,
  onTabChange,
}: {
  tabs?: BrainStudioTabItem[];
  activeTab: BrainPrimarySectionTab;
  onTabChange: (tab: BrainPrimarySectionTab) => void;
}) {
  return (
    <nav
      className="flex h-10 shrink-0 divide-x divide-white/10 border-b border-white/10 bg-white/[0.06]"
      aria-label="Secciones de Brain"
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            data-testid={tab.testId}
            onClick={() => onTabChange(tab.id)}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1.5 text-[9px] font-black uppercase tracking-[0.08em] transition sm:gap-2 sm:px-3",
              active ? "bg-white text-slate-950" : "text-white/45 hover:bg-white/[0.08] hover:text-white/78",
            )}
          >
            <span className="shrink-0 opacity-80">{tab.icon}</span>
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function BrainStudioMetricsBar({
  adnScore,
  connectedNodesCount,
  pendingLearningsCount,
}: {
  adnScore: number;
  connectedNodesCount: number;
  pendingLearningsCount: number;
}) {
  return (
    <div className="flex h-10 shrink-0 divide-x divide-white/10 border-b border-white/10 bg-black/30 text-[9px] font-black uppercase tracking-[0.08em] text-white/52">
      <span className="flex items-center px-4 text-[var(--foldder-studio-accent,#5E8E70)]">ADN {adnScore}/100</span>
      <span className="flex items-center px-4">
        {connectedNodesCount} nodo{connectedNodesCount === 1 ? "" : "s"}
      </span>
      <span
        className={cx(
          "flex min-w-0 flex-1 items-center px-4",
          pendingLearningsCount > 0 ? "text-amber-300" : "text-white/38",
        )}
      >
        {pendingLearningsCount} pendiente{pendingLearningsCount === 1 ? "" : "s"}
      </span>
    </div>
  );
}

export type BrainStudioSubTabItem<T extends string = string> = {
  id: T;
  label: string;
  testId?: string;
};

export function BrainStudioSubTabBar<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  ariaLabel,
}: {
  tabs: BrainStudioSubTabItem<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  ariaLabel: string;
}) {
  return (
    <nav
      className="flex h-9 shrink-0 divide-x divide-white/10 border-b border-white/10 bg-white/[0.04]"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            data-testid={tab.testId}
            onClick={() => onTabChange(tab.id)}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex min-w-0 flex-1 items-center justify-center px-2 text-[9px] font-black uppercase tracking-[0.08em] transition sm:px-3",
              active ? "bg-white/[0.12] text-white" : "text-white/42 hover:bg-white/[0.06] hover:text-white/72",
            )}
          >
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** Sección plana: título + contenido, sin caja clara. */
export function BrainStudioSection({
  children,
  className,
  title,
  kicker,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  kicker?: string;
}) {
  return (
    <section className={cx("border-b border-white/10 py-5 last:border-b-0", className)}>
      {kicker || title ? (
        <div className="mb-4">
          {kicker ? (
            <div className="text-[9px] font-black uppercase tracking-[0.12em] text-white/38">{kicker}</div>
          ) : null}
          {title ? (
            <h3 className="mt-0.5 text-[11px] font-black uppercase tracking-[0.08em] text-white">{title}</h3>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
