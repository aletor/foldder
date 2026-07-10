"use client";

import React, { useMemo, useRef, useState } from "react";
import type { GenomaDocument } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { countLockedGenomaSlots } from "@/lib/genoma/genoma-stream-merge";
import { countPendingGenomaConflicts } from "@/lib/genoma/genoma-reconcile";
import { authoritativeSourceLabel, countSupplementalObservations } from "@/lib/genoma/genoma-source-policy";
import { Star } from "lucide-react";
import { normalizeGenomaUrlInput } from "@/lib/genoma/crawl/url-utils";
import { GenomaCrawlProgress, type GenomaCrawlProgressState } from "./GenomaCrawlProgress";
import { GenomaSidebarStatus } from "./board-v2/GenomaSidebarStatus";
import { GenomaFoldderButton } from "./board-v2/GenomaFoldderButton";
import { Globe } from "lucide-react";

export type GenomaSidebarPanelProps = {
  doc: GenomaDocument;
  completenessPercent: number;
  isAnalyzing?: boolean;
  crawlProgress?: GenomaCrawlProgressState | null;
  crawlError?: string | null;
  canExport?: boolean;
  exportBlockedReason?: string | null;
  onAnalyze: (url: string, enableLlm?: boolean) => void;
  onRetryLastJob?: () => void;
  canRetryLastJob?: boolean;
  onIngestFiles?: (files: File[], enableLlm?: boolean) => void;
  onExportTokens?: () => void;
  onExportCompiled?: () => void;
  onSetAuthoritativeSource?: (sourceRef: string, authoritative: boolean) => void;
};

export function GenomaSidebarPanel({
  doc,
  completenessPercent,
  isAnalyzing = false,
  crawlProgress = null,
  crawlError = null,
  canExport = false,
  exportBlockedReason = null,
  onAnalyze,
  onRetryLastJob,
  canRetryLastJob = false,
  onIngestFiles,
  onExportTokens,
  onExportCompiled,
  onSetAuthoritativeSource,
}: GenomaSidebarPanelProps) {
  const [url, setUrl] = useState("");
  const [enableLlm, setEnableLlm] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const normalized = useMemo(() => normalizeGenomaUrlInput(url), [url]);
  const canAnalyze = normalized.ok && !isAnalyzing;
  const sourcesCount = doc.sources.length;
  const lockedCount = useMemo(() => countLockedGenomaSlots(doc.slots), [doc.slots]);
  const conflictCount = useMemo(() => countPendingGenomaConflicts(doc.slots), [doc.slots]);
  const supplementalCount = useMemo(() => countSupplementalObservations(doc.slots), [doc.slots]);
  const authoritativeLabel = useMemo(() => authoritativeSourceLabel(doc.sources), [doc.sources]);
  const hasSources = sourcesCount > 0;

  const submit = () => {
    if (!normalized.ok) return;
    onAnalyze(normalized.url, enableLlm);
  };

  const ingestFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length || !onIngestFiles) return;
    onIngestFiles(list, enableLlm);
  };

  return (
    <aside className="genoma-studio-split__sidebar" aria-label="Entrada de material">
      <div className="genoma-studio-split__sidebar-scroll">
        <div className="genoma-split-stat" aria-label={`${completenessPercent}% del ADN resuelto`}>
          <span data-testid="genoma-completeness" className="genoma-split-stat__value">
            {completenessPercent}%
          </span>
          <span className="genoma-split-stat__label">adn resuelto</span>
        </div>

        <GenomaSidebarStatus doc={doc} isAnalyzing={isAnalyzing} />

        <section className="genoma-split-entry" aria-label="Entrada de material">
          <form
            className="genoma-split-entry__url"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="url de la marca"
              className="genoma-split-entry__input"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={isAnalyzing}
              aria-invalid={url.trim().length > 0 && !normalized.ok}
            />
            <GenomaFoldderButton type="submit" icon={Globe} disabled={!canAnalyze}>
              {isAnalyzing
                ? genomaLocaleEs.analyzingButton
                : hasSources
                  ? genomaLocaleEs.addSource
                  : genomaLocaleEs.analyze}
            </GenomaFoldderButton>
          </form>

          {url.trim() && normalized.ok ? (
            <p className="genoma-split-entry__hint">{normalized.displayUrl}</p>
          ) : url.trim() && !normalized.ok ? (
            <p className="genoma-split-entry__hint genoma-split-entry__hint--error">{normalized.message}</p>
          ) : null}

          {hasSources ? (
            <p className="genoma-split-entry__hint">{genomaLocaleEs.addSourceHint}</p>
          ) : null}

          <div
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              ingestFiles(event.dataTransfer.files);
            }}
            className={`genoma-split-entry__dropzone${dragOver ? " is-dragover" : ""}${isAnalyzing ? " is-disabled" : ""}`}
          >
            <span>suelta archivos o haz clic</span>
            <span className="genoma-split-entry__dropzone-meta">pdf, imágenes, manual de marca</span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp,.svg,.docx,.txt,.md,.pptx"
            className="sr-only"
            disabled={isAnalyzing}
            onChange={(event) => {
              if (event.target.files) ingestFiles(event.target.files);
              event.target.value = "";
            }}
          />

          <label className="genoma-split-entry__llm">
            <input
              type="checkbox"
              checked={enableLlm}
              onChange={(event) => setEnableLlm(event.target.checked)}
              disabled={isAnalyzing}
            />
            <span>síntesis ia</span>
          </label>
          <p className="genoma-split-entry__hint">{genomaLocaleEs.synthesisIaHint}</p>
          {!hasSources ? (
            <p className="genoma-split-entry__hint">{genomaLocaleEs.crawlCostHint}</p>
          ) : null}
        </section>

        {crawlProgress ? <GenomaCrawlProgress progress={crawlProgress} compact /> : null}
        {crawlError ? (
          <div className="genoma-studio-split__error-wrap">
            <p className="genoma-studio-split__error">{crawlError}</p>
            {canRetryLastJob && onRetryLastJob ? (
              <GenomaFoldderButton variant="muted" onClick={onRetryLastJob}>
                {genomaLocaleEs.retryAnalysis}
              </GenomaFoldderButton>
            ) : null}
          </div>
        ) : null}

        {sourcesCount > 0 ? (
          <section className="genoma-split-sources" aria-label="Fuentes">
            <p className="genoma-split-sources__title">
              {sourcesCount} {sourcesCount === 1 ? "fuente" : "fuentes"}
              {lockedCount > 0 ? (
                <span className="genoma-split-sources__locks">
                  {" "}
                  · {genomaLocaleEs.lockedBlocksHint(lockedCount)}
                </span>
              ) : null}
            </p>
            {conflictCount > 0 ? (
              <p className="genoma-split-sources__conflicts">{genomaLocaleEs.conflictsPending(conflictCount)}</p>
            ) : null}
            {supplementalCount > 0 ? (
              <p className="genoma-split-sources__conflicts">{genomaLocaleEs.supplementalObservations(supplementalCount)}</p>
            ) : null}
            {authoritativeLabel ? (
              <p className="genoma-split-sources__authoritative">
                {genomaLocaleEs.authoritativeSource}: {authoritativeLabel}
              </p>
            ) : null}
            <ul className="genoma-split-sources__list">
              {doc.sources.map((source, index) => (
                <li key={`${source.ref}-${source.ts}-${index}`} title={source.ref}>
                  <span className="genoma-split-sources__ref">{source.ref}</span>
                  <span className="genoma-split-sources__kind">{source.kind === "url" ? "web" : "archivo"}</span>
                  {onSetAuthoritativeSource ? (
                    <button
                      type="button"
                      className={`genoma-split-sources__star${source.authoritative ? " is-active" : ""}`}
                      aria-label={
                        source.authoritative
                          ? genomaLocaleEs.unmarkAuthoritative
                          : genomaLocaleEs.markAuthoritative
                      }
                      title={
                        source.authoritative
                          ? genomaLocaleEs.unmarkAuthoritative
                          : `${genomaLocaleEs.markAuthoritative} — ${genomaLocaleEs.authoritativeTooltip}`
                      }
                      onClick={() => onSetAuthoritativeSource(source.ref, !source.authoritative)}
                    >
                      <Star size={12} fill={source.authoritative ? "currentColor" : "none"} />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <div className="genoma-studio-split__sidebar-footer">
        <div className="genoma-split-export">
          <GenomaFoldderButton
            variant="muted"
            disabled={!canExport}
            onClick={onExportTokens}
            title={canExport ? genomaLocaleEs.tokens : (exportBlockedReason ?? genomaLocaleEs.tokens)}
          >
            {genomaLocaleEs.tokens.toLowerCase()}
          </GenomaFoldderButton>
          <GenomaFoldderButton
            variant="muted"
            disabled={!canExport}
            onClick={onExportCompiled}
            title={canExport ? genomaLocaleEs.compiled : (exportBlockedReason ?? genomaLocaleEs.compiled)}
          >
            {genomaLocaleEs.compiled.toLowerCase()}
          </GenomaFoldderButton>
        </div>
        {!canExport && exportBlockedReason ? (
          <p className="genoma-split-export__hint">{exportBlockedReason}</p>
        ) : null}
      </div>
    </aside>
  );
}
