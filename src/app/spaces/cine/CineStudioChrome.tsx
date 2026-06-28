"use client";

import React from "react";
import { Lock } from "lucide-react";
import type { CineTabAccess } from "./cine-studio-workflow";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.12em] text-white/38">
      {children}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "w-full border-0 border-b border-white/12 bg-transparent px-0 py-2 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-[var(--foldder-studio-accent,#de323f)]",
        props.className,
      )}
    />
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        "w-full resize-y border-0 border-b border-white/12 bg-transparent px-0 py-2 text-sm leading-relaxed text-white outline-none transition placeholder:text-white/25 focus:border-[var(--foldder-studio-accent,#de323f)]",
        props.className,
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        "w-full border-0 border-b border-white/12 bg-transparent px-0 py-2 text-sm text-white outline-none transition focus:border-[var(--foldder-studio-accent,#de323f)]",
        props.className,
      )}
    />
  );
}

export function PillButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex h-10 items-center justify-center gap-2 bg-white/[0.06] px-3 text-[10px] font-black uppercase tracking-[0.1em] text-white/70 transition hover:bg-white/[0.1] hover:text-white disabled:cursor-not-allowed disabled:opacity-40",
        props.className,
      )}
    />
  );
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex h-10 items-center justify-center gap-2 bg-[var(--foldder-studio-accent,#de323f)] px-4 text-[10px] font-black uppercase tracking-[0.1em] text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40",
        props.className,
      )}
    />
  );
}

/** Sección plana: solo título + contenido, sin caja. */
export function CineStudioSection({
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

/** @deprecated alias plano */
export const SectionCard = CineStudioSection;

export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 flex-1 px-4 py-2 first:pl-0 last:pr-0">
      <div className="text-[9px] font-black uppercase tracking-[0.12em] text-white/35">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex divide-x divide-white/10 border-b border-white/10">{children}</div>
  );
}

/** Compact stat cell for the direction tab summary row. */
export function DirectionStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 flex-1 px-2 py-1.5">
      <div className="text-[8px] font-black uppercase tracking-[0.1em] text-white/32">{label}</div>
      <div className="truncate text-[11px] font-semibold leading-tight text-white">{value}</div>
    </div>
  );
}

export function DirectionStatRow({ children }: { children: React.ReactNode }) {
  return <div className="flex min-w-0 flex-1 divide-x divide-white/10">{children}</div>;
}

export function DirectionHeaderBar({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-stretch divide-x divide-white/10 border-b border-white/10 bg-white/[0.04]">
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function ChromeIconButton({
  children,
  title,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { title: string }) {
  return (
    <button
      type="button"
      {...props}
      title={title}
      aria-label={title}
      className={cx(
        "flex h-10 w-10 shrink-0 items-center justify-center bg-white/[0.04] text-white/50 transition hover:bg-[var(--foldder-studio-accent,#de323f)]/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function DirectionPromptPreview({ children }: { children: React.ReactNode }) {
  return (
    <details className="border-b border-white/10 bg-white/[0.02]">
      <summary className="flex h-8 cursor-pointer list-none items-center gap-2 px-2.5 text-[9px] font-black uppercase tracking-[0.1em] text-white/38 hover:bg-white/[0.04] [&::-webkit-details-marker]:hidden">
        Prompt dirección
      </summary>
      <pre className="max-h-28 overflow-auto whitespace-pre-wrap border-t border-white/8 px-2.5 py-1.5 text-[10px] leading-relaxed text-white/40">
        {children}
      </pre>
    </details>
  );
}

export function DirectionSection({
  title,
  children,
  className,
  action,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={cx("border-b border-white/10 py-2.5 last:border-b-0", className)}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-[9px] font-black uppercase tracking-[0.12em] text-white/50">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function DirectionInlineToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  label: string;
}) {
  return (
    <label className="inline-flex h-8 cursor-pointer select-none items-center gap-2 text-[9px] font-black uppercase tracking-[0.08em] text-white/48">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 shrink-0 accent-[var(--foldder-studio-accent,#de323f)]"
      />
      {label}
    </label>
  );
}

export function DirectionChoiceCard({
  active,
  icon,
  title,
  description,
  shortLabel,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  description?: string;
  shortLabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={description || title}
      aria-label={title}
      aria-pressed={active}
      className={cx(
        "direction-choice-chip flex min-h-[52px] flex-col items-center justify-center gap-1 border-b border-r border-white/10 px-1 py-1.5 text-center transition last:border-r-0",
        active
          ? "bg-[var(--foldder-studio-accent,#de323f)]/18 text-white ring-2 ring-inset ring-[var(--foldder-studio-accent,#de323f)]"
          : "bg-transparent text-white/48 hover:bg-white/[0.04] hover:text-white/78",
      )}
    >
      <span className={cx("direction-choice-chip__icon shrink-0 opacity-70", active && "opacity-100")}>{icon}</span>
      <span className="line-clamp-2 text-[8px] font-black uppercase leading-tight tracking-[0.04em]">
        {shortLabel ?? title}
      </span>
    </button>
  );
}

const CHOICE_GRID_COLUMNS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6",
  5: "grid-cols-3 sm:grid-cols-5 lg:grid-cols-5",
  6: "grid-cols-3 sm:grid-cols-4 md:grid-cols-6",
  8: "grid-cols-4 sm:grid-cols-6 lg:grid-cols-8",
  10: "grid-cols-5 sm:grid-cols-5 lg:grid-cols-10",
};

export function ChoiceGrid({ children, columns = 4 }: { children: React.ReactNode; columns?: number }) {
  return (
    <div className={cx("grid border-t border-l border-white/10", CHOICE_GRID_COLUMNS[columns] ?? CHOICE_GRID_COLUMNS[4])}>
      {children}
    </div>
  );
}

export type CineStudioTabItem<T extends string> = {
  id: T;
  label: string;
  icon: React.ReactNode;
};

export function CineStudioTabBar<T extends string>({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: Array<CineStudioTabItem<T> & { unlocked?: boolean; lockReason?: string }>;
  activeTab: T;
  onTabChange: (tab: T) => void;
}) {
  return (
    <nav
      className="flex h-10 shrink-0 divide-x divide-white/10 border-b border-white/10 bg-white/[0.06]"
      aria-label="Secciones de Cine"
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        const locked = tab.unlocked === false;
        return (
          <button
            key={tab.id}
            type="button"
            disabled={locked}
            title={locked ? tab.lockReason : undefined}
            onClick={() => {
              if (locked) return;
              onTabChange(tab.id);
            }}
            aria-current={active ? "page" : undefined}
            aria-disabled={locked || undefined}
            className={cx(
              "flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1.5 text-[9px] font-black uppercase tracking-[0.08em] transition sm:gap-2 sm:px-3",
              locked && "cursor-not-allowed opacity-35",
              active && !locked && "bg-white text-slate-950",
              !active && !locked && "text-white/45 hover:bg-white/[0.08] hover:text-white/78",
            )}
          >
            {locked ? <Lock size={11} className="shrink-0" aria-hidden /> : <span className="shrink-0 opacity-80">{tab.icon}</span>}
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function CineStudioWorkflowBar({
  snapshot,
  tabAccess,
}: {
  snapshot: { hasScript: boolean; hasAnalysis: boolean };
  tabAccess: CineTabAccess[];
}) {
  const steps = [
    { label: "Dirección", done: true },
    { label: "Guion", done: snapshot.hasScript && snapshot.hasAnalysis, active: !snapshot.hasScript || !snapshot.hasAnalysis },
    { label: "Producción", done: snapshot.hasAnalysis, active: snapshot.hasScript && snapshot.hasAnalysis },
  ];
  const nextLocked = tabAccess.find((tab) => !tab.unlocked);
  return (
    <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10 bg-black/20 px-4 py-2 text-[9px] font-black uppercase tracking-[0.08em] text-white/45">
      <div className="flex flex-wrap items-center gap-3">
        {steps.map((step, index) => (
          <span key={step.label} className="inline-flex items-center gap-2">
            {index > 0 ? <span className="text-white/20">→</span> : null}
            <span className={cx(step.done && "text-white/75", step.active && "text-[var(--foldder-studio-accent,#de323f)]")}>
              {step.label}
            </span>
          </span>
        ))}
      </div>
      {nextLocked?.lockReason ? (
        <span className="text-white/38">{nextLocked.lockReason}</span>
      ) : null}
    </div>
  );
}

export function CineStudioMetricsBar({
  statusLabel,
  sceneCount,
  characterCount,
  frameCount,
  brainConnected,
}: {
  statusLabel: string;
  sceneCount: number;
  characterCount: number;
  frameCount: number;
  brainConnected: boolean;
}) {
  return (
    <div className="flex h-10 shrink-0 divide-x divide-white/10 border-b border-white/10 bg-black/30 text-[9px] font-black uppercase tracking-[0.08em] text-white/52">
      <span className="flex min-w-0 flex-1 items-center px-4 text-white/72">{statusLabel}</span>
      <span className="hidden items-center px-4 sm:flex">{sceneCount} esc</span>
      <span className="hidden items-center px-4 md:flex">{characterCount} rep</span>
      <span className="hidden items-center px-4 lg:flex">{frameCount} fr</span>
      <span
        className={cx(
          "flex items-center px-4",
          brainConnected ? "text-[var(--foldder-studio-accent,#de323f)]" : "text-white/38",
        )}
      >
        {brainConnected ? "BrandKit" : "Sin BrandKit"}
      </span>
    </div>
  );
}

export function CineStudioAssetCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <article className={cx("cine-studio-asset-card border-b border-white/10 bg-transparent", className)}>
      {children}
    </article>
  );
}

export function CineStudioBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "success" | "warn" | "error";
}) {
  const toneClass = {
    neutral: "text-white/55",
    accent: "text-[var(--foldder-studio-accent,#de323f)]",
    success: "text-emerald-300",
    warn: "text-amber-300",
    error: "text-rose-300",
  }[tone];
  return (
    <span className={cx("inline-flex h-8 items-center text-[9px] font-black uppercase tracking-[0.08em]", toneClass)}>
      {children}
    </span>
  );
}

export function CineStudioLockedPanel({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-4 py-16">
      <Lock size={20} className="text-white/35" aria-hidden />
      <h2 className="text-lg font-semibold tracking-[-0.02em] text-white">{title}</h2>
      <p className="text-sm leading-relaxed text-white/45">{message}</p>
      <PrimaryButton type="button" onClick={onAction}>
        {actionLabel}
      </PrimaryButton>
    </div>
  );
}
