"use client";

import type { PageVisionPassSourceMeta } from "@/lib/genoma/ingest/page-vision-pass-meta";
import {
  pageVisionPassBadgeLabel,
  pageVisionPassSkipDetail,
} from "@/lib/genoma/ingest/page-vision-pass-meta";
import type { GenomaSourceView } from "@/lib/genoma/projection/book-view";
import { G, cx } from "./face-utils";

export function GenomaPageVisionBadge({
  meta,
  className,
  title,
}: {
  meta?: PageVisionPassSourceMeta;
  className?: string;
  title?: string;
}) {
  const label = pageVisionPassBadgeLabel(meta);
  if (!label) return null;
  const detail = title ?? pageVisionPassSkipDetail(meta) ?? meta?.summary ?? undefined;
  const muted = meta?.status === "skipped" || meta?.status === "failed";
  return (
    <span
      className={cx(
        "text-[10px] uppercase tracking-[0.14em]",
        muted ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]",
        className,
      )}
      title={detail}
    >
      {label}
    </span>
  );
}

export function GenomaSourcesPanel({ sources }: { sources: GenomaSourceView[] }) {
  if (!sources.length) return null;
  return (
    <section className="border-t border-[var(--border)] pt-8" data-testid="genoma-sources-panel">
      <p className={cx(G.label, "mb-6")}>fuentes</p>
      <ul>
        {sources.map((source) => (
          <li key={source.id} className={cx(G.listRow, "flex flex-col gap-2")}>
            <div className="flex items-baseline justify-between gap-4">
              <span className="min-w-0 truncate text-sm lowercase text-[var(--text-main)]" title={source.label}>
                {source.label}
              </span>
              {source.kind === "pdf" ? <GenomaPageVisionBadge meta={source.pageVisionPass} /> : null}
            </div>
            {source.pageVisionPass?.status === "skipped" ? (
              <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                {pageVisionPassSkipDetail(source.pageVisionPass)}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
