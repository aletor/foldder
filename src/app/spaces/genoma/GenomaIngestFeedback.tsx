"use client";

import { GENOMA_INGEST_SECTION_ORDER } from "@/lib/genoma/ingest/types";
import type { MaterialPromptPayload } from "@/lib/genoma/ingest/material-prompt";
import {
  sectionLabel,
  shouldShowConsolidatedBox,
  type ConsolidatedRowState,
  type GenomaIngestFeedbackState,
  type IngestTimelineStep,
  type SectionRowState,
} from "@/lib/genoma/ingest/feedback-state";
import { copySourceUnreadable } from "@/lib/genoma/ingest/feedback-copy";
import { GenomaMaterialPromptCard } from "./GenomaMaterialPromptModal";
import { G, cx } from "./face-utils";
import { GenomaMediaImage } from "./GenomaMediaImage";
import { useMicroFade } from "./use-genoma-ingest";

function FineSpinner({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={cx("motion-safe:animate-[spin_0.9s_linear_infinite]", className)}
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
    >
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.15" />
      <path d="M10 2a8 8 0 0 1 8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  );
}

function SectionPreview({ preview }: { preview: SectionRowState["preview"] }) {
  const p = preview;
  if (!p) return null;
  if (p.kind === "palette") {
    return (
      <div className="flex items-center gap-1.5">
        {p.swatches.slice(0, 5).map((hex, idx) => (
          <span key={`${hex}-${idx}`} className="h-3 w-3" style={{ backgroundColor: hex }} title={hex} />
        ))}
      </div>
    );
  }
  if (p.kind === "logo") {
    return (
      <GenomaMediaImage src={p.imageUrl} alt="" className="h-5 w-auto max-w-[64px] object-contain opacity-80" eager />
    );
  }
  if (p.kind === "typography") {
    return (
      <span className="truncate text-sm text-[var(--text-muted)]" style={{ fontFamily: p.family }}>
        {p.family}
      </span>
    );
  }
  if (p.kind === "visual") {
    return <span className="text-sm tabular-nums text-[var(--text-muted)]">{p.count}</span>;
  }
  if (p.kind === "voice") {
    return (
      <span className="truncate text-sm text-[var(--text-muted)]">{p.traits.slice(0, 2).join(" · ")}</span>
    );
  }
  return null;
}

function StatusMark({ status }: { status: ConsolidatedRowState["status"] | SectionRowState["status"] }) {
  if (status === "running") return <FineSpinner className="text-[var(--text-muted)]" />;
  if (status === "resolved" || status === "proposed" || status === "crowned") {
    return <span className="text-[var(--text-muted)]">✓</span>;
  }
  if (status === "error") return <span className="text-[var(--text-muted)]">—</span>;
  return <span className="text-[var(--text-muted)]/30">·</span>;
}

function ConsolidatedRow({ id, row }: { id: (typeof GENOMA_INGEST_SECTION_ORDER)[number]; row: ConsolidatedRowState }) {
  const label = sectionLabel(id);
  const isEmpty = row.status === "empty";

  return (
    <li className={cx(G.listRow, "flex items-center gap-4", isEmpty && "opacity-40")}>
      <span className="w-4 shrink-0 text-center">
        <StatusMark status={row.status} />
      </span>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
        <span className={cx("text-sm lowercase", isEmpty ? "text-[var(--text-muted)]" : "text-[var(--text-main)]")}>
          {label}
        </span>
        {!isEmpty && row.preview ? <SectionPreview preview={row.preview} /> : null}
      </div>
    </li>
  );
}

function ActivitySectionRow({
  id,
  row,
  onRetry,
}: {
  id: (typeof GENOMA_INGEST_SECTION_ORDER)[number];
  row: SectionRowState;
  onRetry?: () => void;
}) {
  const label = sectionLabel(id);
  const isPending = row.status === "pending";
  const isRunning = row.status === "running";

  return (
    <li className={cx(G.listRow, "flex items-start gap-4", isPending && "opacity-40")}>
      <span className="mt-0.5 w-4 shrink-0 text-center">
        <StatusMark status={row.status} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-4">
          <span
            className={cx(
              "text-sm lowercase",
              isRunning && "text-[var(--text-muted)]",
              row.status === "resolved" && "text-[var(--text-main)]",
              row.status === "error" && "text-[var(--text-muted)]",
            )}
          >
            {isRunning ? row.runningLabel ?? label : label}
          </span>
          {row.status === "resolved" && row.preview ? <SectionPreview preview={row.preview} /> : null}
        </div>
        {row.status === "error" ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
            <span>{row.fileName ? copySourceUnreadable(row.fileName) : row.errorMessage}</span>
            {onRetry ? (
              <button type="button" onClick={onRetry} className={G.btnGhost}>
                reintentar
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function TimelineRow({ step }: { step: IngestTimelineStep }) {
  const mark =
    step.status === "done" ? "✓" : step.status === "running" ? <FineSpinner className="text-[var(--text-muted)]" /> : "○";
  return (
    <li className={cx(G.listRow, "flex items-start gap-4", step.status === "pending" && "opacity-40")}>
      <span className="mt-0.5 w-4 shrink-0 text-center text-[var(--text-muted)]">{mark}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm lowercase text-[var(--text-main)]">{step.label}</p>
        {step.detail ? <p className="mt-1 text-xs lowercase text-[var(--text-muted)]">{step.detail}</p> : null}
        {step.progress ? (
          <p className="mt-1 text-xs tabular-nums text-[var(--text-muted)]">
            {step.progress.done} de {step.progress.total}
          </p>
        ) : null}
        {step.thumbs?.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {step.thumbs.map((thumb, idx) => (
              <GenomaMediaImage
                key={`${thumb.slice(0, 24)}-${idx}`}
                src={thumb}
                alt=""
                className="h-10 w-10 rounded-sm object-cover opacity-80 ring-1 ring-[var(--border)] motion-safe:animate-pulse"
                eager
              />
            ))}
          </div>
        ) : null}
        {step.swatches?.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {step.swatches.map((hex) => (
              <span
                key={hex}
                className="h-4 w-4 rounded-full ring-1 ring-[var(--border)]"
                style={{ backgroundColor: hex }}
                title={hex}
              />
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function GenomaIngestFeedback({
  feedback,
  onRetry,
  activePrompt,
  onResolvePrompt,
}: {
  feedback: GenomaIngestFeedbackState;
  onRetry?: () => void;
  activePrompt?: MaterialPromptPayload | null;
  onResolvePrompt?: (optionId: string) => void;
}) {
  const micro = useMicroFade(feedback.activity?.micro ?? null);
  const showConsolidated = shouldShowConsolidatedBox(feedback);
  const activity = feedback.activity;
  const showActivity = Boolean(activity?.active);

  if (!showConsolidated && !showActivity && !feedback.urlVisiting) return null;

  return (
    <div className="flex flex-col gap-10">
      {feedback.urlVisiting ? (
        <p className="flex items-center gap-3 text-sm lowercase text-[var(--text-muted)]">
          <FineSpinner />
          {feedback.urlVisiting}
        </p>
      ) : null}

      {showConsolidated ? (
        <section aria-label="tu genoma consolidado" className="border-t border-[var(--border)] pt-8">
          <p className={cx(G.label, "mb-6")}>consolidado</p>
          <ul>
            {GENOMA_INGEST_SECTION_ORDER.map((id) => (
              <ConsolidatedRow key={id} id={id} row={feedback.consolidated[id]} />
            ))}
          </ul>
        </section>
      ) : null}

      {showActivity && activity ? (
        <section role="status" aria-live="polite" className="border-t border-[var(--border)] pt-8">
          {activity.statusLine ? (
            <p className="mb-6 flex items-center gap-3 text-sm lowercase text-[var(--text-muted)]">
              {activity.phase !== "done" ? <FineSpinner /> : null}
              {activity.statusLine}
            </p>
          ) : activity.phase !== "done" ? (
            <p className={cx(G.label, "mb-6")}>
              {activity.incremental ? "material nuevo" : `consolidando tu genoma · ${activity.receiveCount} documentos`}
            </p>
          ) : null}
          {activity.timeline.length > 0 ? (
            <ul className="mb-6">
              {activity.timeline.map((step) => (
                <TimelineRow key={step.key} step={step} />
              ))}
            </ul>
          ) : null}
          <ul>
            {GENOMA_INGEST_SECTION_ORDER.map((id) => {
              if (activity.timeline.length > 0 && (id === "palette" || id === "logo")) return null;
              return <ActivitySectionRow key={id} id={id} row={activity.sections[id]} onRetry={onRetry} />;
            })}
            {activity.logoIntake?.status === "error" ? (
              <li className={cx(G.listRow, "flex items-start gap-4")}>
                <span className="mt-0.5 w-4 shrink-0 text-center">
                  <StatusMark status="error" />
                </span>
                <p className="text-xs text-[var(--text-muted)]">{activity.logoIntake.errorMessage}</p>
              </li>
            ) : null}
          </ul>
          {activePrompt && onResolvePrompt ? (
            <GenomaMaterialPromptCard prompt={activePrompt} onResolve={onResolvePrompt} className="mt-8" />
          ) : null}
          {micro ? (
            <p className="mt-6 text-sm lowercase text-[var(--text-muted)] motion-safe:transition-opacity motion-safe:duration-300">
              {micro.text}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export function GenomaIngestStatusLine({ line }: { line: string | null }) {
  if (!line) return null;
  return (
    <p className="mb-6 flex items-center gap-3 text-sm lowercase text-[var(--text-muted)]">
      <FineSpinner />
      {line}
    </p>
  );
}
