"use client";

import {
  getActiveAiJobsForHudSnapshot,
  subscribeActiveAiJobs,
  type AiActiveJob,
} from "@/lib/ai-active-jobs";
import { useSyncExternalStore } from "react";

type AiRequestHudProps = {
  onFocusNode?: (nodeId: string) => void;
};

const MAX_VISIBLE_TICKS = 5;

function jobProgress(job: AiActiveJob): number | null {
  if (job.pct == null) return null;
  return Math.min(100, Math.max(0, Math.round(job.pct)));
}

function jobAriaLabel(job: AiActiveJob): string {
  const pct = jobProgress(job);
  if (pct != null) return `${job.label}, ${pct}%`;
  return `${job.label}, procesando`;
}

function JobTick({
  job,
  onFocusNode,
}: {
  job: AiActiveJob;
  onFocusNode?: (nodeId: string) => void;
}) {
  const pct = jobProgress(job);
  const indeterminate = pct == null;
  const canFocus = Boolean(job.nodeId && onFocusNode);

  return (
    <button
      type="button"
      className="foldder-ai-active-jobs__tick pointer-events-auto"
      title={jobAriaLabel(job)}
      aria-label={canFocus ? `${jobAriaLabel(job)}. Ir al nodo` : jobAriaLabel(job)}
      disabled={!canFocus}
      onClick={() => {
        if (canFocus) onFocusNode?.(job.nodeId!);
      }}
    >
      <span
        className="foldder-ai-active-jobs__tick-track"
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : pct}
        aria-valuemin={indeterminate ? undefined : 0}
        aria-valuemax={indeterminate ? undefined : 100}
        aria-valuetext={indeterminate ? "Procesando" : `${pct}%`}
      >
        <span
          className={`foldder-ai-active-jobs__tick-fill${indeterminate ? " foldder-ai-active-jobs__tick-fill--pulse" : ""}`}
          style={indeterminate ? undefined : { width: `${pct}%` }}
          aria-hidden
        />
      </span>
    </button>
  );
}

export function AiRequestHud({ onFocusNode }: AiRequestHudProps) {
  const jobs = useSyncExternalStore(
    subscribeActiveAiJobs,
    getActiveAiJobsForHudSnapshot,
    () => [] as readonly AiActiveJob[],
  );

  if (jobs.length === 0) return null;

  const visibleJobs = jobs.slice(0, MAX_VISIBLE_TICKS);
  const overflow = jobs.length - visibleJobs.length;
  const primary = jobs[0]!;
  const caption =
    jobs.length === 1
      ? primary.label
      : `${jobs.length}`;

  return (
    <div
      className="foldder-ai-active-jobs pointer-events-none font-sans"
      aria-live="polite"
      aria-busy="true"
      aria-label={`${jobs.length} petición${jobs.length === 1 ? "" : "es"} IA en curso`}
    >
      <div className="foldder-ai-active-jobs__chip">
        <span className="foldder-ai-active-jobs__beacon" aria-hidden />
        <div className="foldder-ai-active-jobs__ticks" role="group" aria-label="Progreso de ejecuciones">
          {visibleJobs.map((job) => (
            <JobTick key={job.id} job={job} onFocusNode={onFocusNode} />
          ))}
        </div>
        <span
          className={`foldder-ai-active-jobs__caption${jobs.length > 1 ? " foldder-ai-active-jobs__caption--count" : ""}`}
          title={jobs.map((j) => jobAriaLabel(j)).join(" · ")}
        >
          {caption}
          {overflow > 0 ? <span className="foldder-ai-active-jobs__overflow">+{overflow}</span> : null}
        </span>
      </div>
    </div>
  );
}
